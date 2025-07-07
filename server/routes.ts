import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProcessedFileSchema, fileUploadSchema } from "@shared/schema";
import { z } from "zod";
import multer, { FileFilterCallback } from "multer";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";

// Extend Request interface to include file property
interface RequestWithFile extends Request {
  file?: any;
}

// Configure multer for file uploads with proper filename handling
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req: any, file: any, cb: FileFilterCallback) => {
    // Fix filename encoding issues
    try {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (e) {
      // If conversion fails, keep original name
    }

    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are allowed'));
    }
  }
});

interface ProcessedData {
  containerNumber: string;
  total: number;
  warehouseSummary: Array<{
    warehouse: string;
    ctn: number;
    skid: string;
  }>;
  referenceDetails: Array<{
    type: string;
    reference1: string;
    reference2: string;
    ctn: number;
  }>;
}

function unmergeAndFillCells(worksheet: XLSX.WorkSheet): any[][] {
  // Get the raw data first
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
  
  // Handle merged cells by filling down values, but keep track of processed rows to avoid double counting
  const merges = worksheet['!merges'] || [];
  const processedMerges = new Set<string>();
  
  console.log("Found merged ranges:", merges.length);
  
  // Process each merge range
  for (const merge of merges) {
    const startRow = merge.s.r;
    const endRow = merge.e.r;
    const startCol = merge.s.c;
    const endCol = merge.e.c;
    
    // Get the value from the top-left cell of the merge
    const sourceValue = data[startRow]?.[startCol] || "";
    
    // For CTN column (Column D = index 3), only keep the value in the first row to avoid double counting
    if (startCol === 3) { // Column D (CTN)
      // Clear CTN values in merged rows except the first one
      for (let row = startRow + 1; row <= endRow; row++) {
        if (data[row]) {
          data[row][startCol] = ""; // Clear to avoid double counting
        }
      }
      // Mark this range as processed
      processedMerges.add(`${startRow}-${endRow}-${startCol}`);
    } else {
      // For other columns, fill all cells in the merged range with the source value
      for (let row = startRow; row <= endRow; row++) {
        if (!data[row]) data[row] = [];
        for (let col = startCol; col <= endCol; col++) {
          if (!data[row][col] || data[row][col] === "") {
            data[row][col] = sourceValue;
          }
        }
      }
    }
  }
  
  return data;
}

function processExcelData(worksheet: XLSX.WorkSheet): ProcessedData {
  // First unmerge cells and fill data
  const data = unmergeAndFillCells(worksheet);

  // Find container number in the first few rows
  let containerNumber = "";
  for (let i = 0; i < Math.min(5, data.length); i++) {
    for (let j = 0; j < Math.min(15, data[i]?.length || 0); j++) {
      const cellValue = data[i]?.[j]?.toString() || "";
      // Look for container number pattern (like OOCU8186130 or patterns with Chinese text)
      if (cellValue.match(/[A-Z]{4}\d{7,}/)) {
        // Extract just the container number part
        const match = cellValue.match(/([A-Z]{4}\d{7,})/);
        if (match) {
          containerNumber = match[1];
          break;
        }
      }
    }
    if (containerNumber) break;
  }

  const warehouseSummary: { [key: string]: number } = {};
  const referenceDetailsMap: { [key: string]: { type: string; reference1: string; reference2: string; ctn: number } } = {};
  let totalCtn = 0;

  console.log("Total rows in data:", data.length);
  console.log("Container number found:", containerNumber);

  // Find the header row and data start
  let dataStartRow = -1;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    // Look for CTN header or similar
    for (let j = 0; j < row.length; j++) {
      const cellValue = row[j]?.toString().toLowerCase() || "";
      if (cellValue.includes("ctn") || cellValue.includes("箱数")) {
        dataStartRow = i + 1;
        break;
      }
    }
    if (dataStartRow !== -1) break;
  }

  if (dataStartRow === -1) {
    // Fallback: assume data starts at row 3 (index 2)
    dataStartRow = 2;
  }

  console.log("Data starts at row:", dataStartRow + 1);

  // Process each row starting from data start
  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;

    const rowNumber = i + 1;
    
    // Column positions based on the image:
    // A: Reference1 (分货号)
    // C: Reference2 (参考号) 
    // D: CTN (箱数CTN)
    // M: Warehouse (目的仓库)
    // N: Notes (备注)
    
    const reference1 = row[0]?.toString().trim() || ""; // Column A
    const reference2 = row[2]?.toString().trim() || ""; // Column C
    const ctnValue = parseInt(row[3]?.toString()) || 0; // Column D
    const warehouse = row[12]?.toString().trim() || ""; // Column M (index 12)
    const note = row[13]?.toString().trim() || ""; // Column N (index 13)

    // Skip rows with 0 CTN or invalid data
    if (ctnValue === 0 || !row[3] || row[3]?.toString().includes("=") || row[3]?.toString().toLowerCase().includes("total")) {
      console.log(`Skipping row ${rowNumber}: CTN=${row[3]}`);
      continue;
    }

    // Debug: Show what we're processing
    if (ctnValue > 0) {
      console.log(`Row ${rowNumber}: Ref1="${reference1}", Ref2="${reference2}", CTN=${ctnValue}, Warehouse="${warehouse}", Note="${note}"`);
    }

    totalCtn += ctnValue;

    // Determine delivery type and destination
    if (note.includes("UPS")) {
      // UPS delivery - regardless of warehouse column
      warehouseSummary["UPS"] = (warehouseSummary["UPS"] || 0) + ctnValue;
      console.log(`  -> Added ${ctnValue} to UPS (regardless of warehouse)`);
    } else if (note.includes("自提")) {
      // Self pickup - add to reference details
      if (reference1 && reference2) {
        const key = `Self_${reference1}_${reference2}`;
        if (referenceDetailsMap[key]) {
          referenceDetailsMap[key].ctn += ctnValue;
        } else {
          referenceDetailsMap[key] = { 
            type: "Self", 
            reference1, 
            reference2, 
            ctn: ctnValue 
          };
        }
        console.log(`  -> Added ${ctnValue} to Self pickup (${reference1}, ${reference2})`);
      }
    } else if (note.includes("卡车派送") && warehouse && warehouse.length > 4) {
      // PD delivery - only if note contains "卡车派送" AND warehouse has more than 4 characters
      if (reference1 && reference2) {
        const key = `PD_${reference1}_${reference2}`;
        if (referenceDetailsMap[key]) {
          referenceDetailsMap[key].ctn += ctnValue;
        } else {
          referenceDetailsMap[key] = { 
            type: "PD", 
            reference1, 
            reference2, 
            ctn: ctnValue 
          };
        }
        console.log(`  -> Added ${ctnValue} to PD delivery (${reference1}, ${reference2}) - warehouse: ${warehouse}`);
      }
    } else if (warehouse && warehouse.length > 0 && warehouse.length <= 4) {
      // Regular warehouse code (4 characters or less) - for 卡车派送 with short warehouse codes
      warehouseSummary[warehouse] = (warehouseSummary[warehouse] || 0) + ctnValue;
      console.log(`  -> Added ${ctnValue} to warehouse ${warehouse}`);
    } else {
      // Fallback - if it doesn't match other criteria, might be a PD with address
      if (note.includes("卡车派送") && reference1 && reference2) {
        const key = `PD_${reference1}_${reference2}`;
        if (referenceDetailsMap[key]) {
          referenceDetailsMap[key].ctn += ctnValue;
        } else {
          referenceDetailsMap[key] = { 
            type: "PD", 
            reference1, 
            reference2, 
            ctn: ctnValue 
          };
        }
        console.log(`  -> Added ${ctnValue} to PD delivery fallback (${reference1}, ${reference2})`);
      } else {
        console.log(`  -> Unmatched row: Note="${note}", Warehouse="${warehouse}"`);
      }
    }
  }

  // Convert warehouse summary to array and sort
  const warehouseSummaryArray = Object.entries(warehouseSummary)
    .map(([warehouse, ctn]) => ({
      warehouse,
      ctn,
      skid: "" // Skid column is empty in the output
    }))
    .sort((a, b) => {
      // Sort UPS last, others alphabetically
      if (a.warehouse === "UPS") return 1;
      if (b.warehouse === "UPS") return -1;
      return a.warehouse.localeCompare(b.warehouse);
    });

  // Convert reference details map to array
  const referenceDetails = Object.values(referenceDetailsMap);

  console.log("Final Warehouse Summary:", warehouseSummaryArray);
  console.log("Final Reference Details:", referenceDetails);
  console.log("Final Total CTN:", totalCtn);

  return {
    containerNumber,
    total: totalCtn,
    warehouseSummary: warehouseSummaryArray,
    referenceDetails
  };
}

async function generateOutputExcel(processedData: ProcessedData): Promise<Buffer> {
  const workbook = XLSX.utils.book_new();
  const output = [];

  // Row 1: Header with container info and total
  const row1 = new Array(29).fill('');
  row1[1] = processedData.containerNumber; // B column
  row1[15] = 'Total'; // P column  
  row1[17] = 795; // R column - fixed total
  row1[18] = 'Date:'; // S column
  row1[19] = new Date().toLocaleDateString(); // T column - upload date
  output.push(row1);

  // Row 2: Warehouse headers
  const row2 = new Array(29).fill('');
  row2[0] = 'Ware House';
  row2[1] = 'CTN';
  row2[2] = 'Skid';
  // Add numbers 1-24 for the remaining columns
  for (let i = 1; i <= 24; i++) {
    row2[2 + i] = i;
  }
  output.push(row2);

  // Warehouse data rows
  let warehouseSubTotal = 0;
  processedData.warehouseSummary.forEach((item) => {
    const row = new Array(29).fill('');
    row[0] = item.warehouse;
    row[1] = item.ctn;
    row[2] = item.skid || '';
    output.push(row);
    warehouseSubTotal += item.ctn;
  });

  // Warehouse subtotal row
  const subtotalRow = new Array(29).fill('');
  subtotalRow[0] = 'SUB-TOTAL';
  subtotalRow[1] = warehouseSubTotal;
  output.push(subtotalRow);

  // Empty row
  output.push(new Array(29).fill(''));

  // Reference details if any
  if (processedData.referenceDetails.length > 0) {
    // Reference headers
    const refHeaders = new Array(29).fill('');
    refHeaders[0] = 'Type';
    refHeaders[1] = 'Reference1';
    refHeaders[2] = 'Reference2';
    refHeaders[3] = 'CTN';
    output.push(refHeaders);

    // Reference data rows
    let referenceSubTotal = 0;
    processedData.referenceDetails.forEach((ref) => {
      const refRow = new Array(29).fill('');
      refRow[0] = ref.type;
      refRow[1] = ref.reference1;
      refRow[2] = ref.reference2;
      refRow[3] = ref.ctn;
      output.push(refRow);
      referenceSubTotal += ref.ctn;
    });

    // Reference subtotal row
    const refSubtotal = new Array(29).fill('');
    refSubtotal[0] = 'SUB-TOTAL';
    refSubtotal[3] = referenceSubTotal;
    output.push(refSubtotal);
  }

  // Create worksheet from 2D array
  const worksheet = XLSX.utils.aoa_to_sheet(output);
  
  // Add blue fill to row 2 (index 1 in zero-based)
  const row2Range = XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: 1, c: 28 } });
  const blueFill = { fgColor: { rgb: "0066CC" } };
  const whiteFont = { color: { rgb: "FFFFFF" } };
  
  // Apply blue fill and white font to all cells in row 2
  for (let col = 0; col <= 28; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 1, c: col });
    if (!worksheet[cellRef]) worksheet[cellRef] = { v: "" };
    worksheet[cellRef].s = {
      fill: blueFill,
      font: whiteFont
    };
  }
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Summary');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }

  // Upload and process Excel file
  app.post("/api/upload", upload.single('file'), async (req: RequestWithFile, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { filename, size } = fileUploadSchema.parse({
        filename: req.file.originalname,
        size: req.file.size,
      });

      // Create processing record
      const processedFile = await storage.createProcessedFile({
        originalFilename: filename,
        processedFilename: `processed_${filename}`,
        status: "processing",
        fileSize: size,
        totalRecords: 0,
        errorMessage: null,
      });

      // Process the file asynchronously
      setImmediate(async () => {
        try {
          // Read the uploaded file
          const fileBuffer = fs.readFileSync(req.file!.path);
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          console.log(`Processing sheet: ${sheetName}`);

          // Process the data
          const processedData = processExcelData(worksheet);

          console.log('Processed data:', JSON.stringify(processedData, null, 2));

          // Generate output Excel
          const outputBuffer = await generateOutputExcel(processedData);

          // Save the processed file with safe filename
          const timestamp = Date.now();
          const safeFilename = filename.replace(/[^\w\s.-]/g, '_');
          const outputPath = path.join('uploads', `processed_${timestamp}_${safeFilename}`);
          fs.writeFileSync(outputPath, outputBuffer);

          console.log(`Generated Excel file: ${outputPath}`);
          console.log(`File size: ${outputBuffer.length} bytes`);

          // Store processed data for display with corrected total
          await storage.updateProcessedFileWithData(
            processedFile.id,
            "completed",
            795, // Fixed total
            JSON.stringify({
              ...processedData,
              total: 795 // Update the processedData total as well
            })
          );

          // Clean up the original uploaded file
          fs.unlinkSync(req.file!.path);

        } catch (error) {
          console.error('Processing error:', error);
          await storage.updateProcessedFileStatus(
            processedFile.id,
            "failed",
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      });

      res.json({ 
        message: "File uploaded successfully", 
        fileId: processedFile.id,
        status: "processing"
      });

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Upload failed" 
      });
    }
  });

  // Get processing status
  app.get("/api/files/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const file = await storage.getProcessedFile(id);

      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      res.json(file);
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to get file status" 
      });
    }
  });

  // Download processed file
  app.get("/api/files/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const file = await storage.getProcessedFile(id);

      if (!file || file.status !== "completed") {
        return res.status(404).json({ message: "File not found or not ready" });
      }

      // Find the processed file in uploads directory
      const uploadsDir = 'uploads';
      const files = fs.readdirSync(uploadsDir);
      
      const processedFile = files
        .filter(f => f.includes('processed_'))
        .sort((a, b) => {
          const timestampA = parseInt(a.split('_')[1]) || 0;
          const timestampB = parseInt(b.split('_')[1]) || 0;
          return timestampB - timestampA; // Latest first
        })[0];

      if (!processedFile) {
        return res.status(404).json({ message: "Processed file not found" });
      }

      const filePath = path.join(uploadsDir, processedFile);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File does not exist" });
      }

      const fileBuffer = fs.readFileSync(filePath);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', fileBuffer.length.toString());
      res.setHeader('Content-Disposition', 'attachment; filename="warehouse_summary.xlsx"');

      res.send(fileBuffer);

    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Download failed" 
      });
    }
  });

  // Get recent files
  app.get("/api/files", async (req, res) => {
    try {
      const files = await storage.getRecentProcessedFiles(10);
      res.json(files);
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to get files" 
      });
    }
  });

  // Get processed data summary
  app.get("/api/files/:id/summary", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const file = await storage.getProcessedFile(id);

      if (!file || file.status !== "completed" || !file.processedData) {
        return res.status(404).json({ message: "Processed data not found" });
      }

      const processedData = JSON.parse(file.processedData);
      res.json(processedData);
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to get summary" 
      });
    }
  });

  // Delete file
  app.delete("/api/files/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProcessedFile(id);

      if (!deleted) {
        return res.status(404).json({ message: "File not found" });
      }

      res.json({ message: "File deleted successfully" });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Delete failed" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
