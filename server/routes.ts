import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProcessedFileSchema, fileUploadSchema } from "@shared/schema";
import { z } from "zod";
import multer, { FileFilterCallback } from "multer";
import XLSX from "xlsx";
import ExcelJS from "exceljs";
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
  let consecutiveEmptyRows = 0;
  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i];
    
    // Check if the entire row is truly empty (all cells are empty/whitespace)
    const isRowEmpty = !row || row.every(cell => !cell || String(cell).trim() === "");
    
    if (isRowEmpty) {
      consecutiveEmptyRows++;
      if (consecutiveEmptyRows > 10) break; // Stop if we hit 10 consecutive truly empty rows
      continue;
    }
    
    // Reset counter when we find any non-empty row
    consecutiveEmptyRows = 0;
    
    if (row.length < 4) continue;

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

    // Skip rows with 0 CTN or invalid data (but don't stop processing)
    if (ctnValue === 0 || !row[3] || row[3]?.toString().includes("=") || row[3]?.toString().toLowerCase().includes("total")) {
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
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Summary');

  // Set column widths
  worksheet.columns = [
    { width: 13 }, // A
    { width: 13 }, // B
    { width: 13 }, // C
    { width: 3.3 }, // D (CTN column - narrower)
    { width: 13 }, // E
    { width: 13 }, // F
    { width: 13 }, // G
    { width: 13 }, // H
    { width: 13 }, // I
    { width: 13 }, // J
    { width: 13 }, // K
    { width: 13 }, // L
    { width: 13 }, // M
    { width: 13 }, // N
    { width: 13 }, // O
    { width: 13 }, // P
    { width: 13 }, // Q
    { width: 13 }, // R
    { width: 13 }, // S
    { width: 13 }, // T
    { width: 13 }, // U
    { width: 13 }, // V
    { width: 13 }, // W
    { width: 13 }, // X
    { width: 13 }, // Y
    { width: 13 }, // Z
    { width: 13 }, // AA
    { width: 13 }, // AB
    { width: 13 }, // AC
  ];

  // Rows 3-11: Summary data rows
  let currentRow = 3;
  let warehouseSubTotal = 0;
  
  processedData.warehouseSummary.forEach((item) => {
    const row = worksheet.getRow(currentRow);
    row.values = [item.warehouse, item.ctn, item.skid || ''];
    
    // Apply borders to all cells in the summary table (A through AC)
    for (let col = 1; col <= 29; col++) {
      const cell = row.getCell(col);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
    
    warehouseSubTotal += item.ctn;
    currentRow++;
  });

  // Calculate reference details subtotal
  let referenceDetailsSubTotal = 0;
  processedData.referenceDetails.forEach((ref) => {
    referenceDetailsSubTotal += ref.ctn;
  });

  // Calculate the total as sum of both subtotals
  const grandTotal = warehouseSubTotal + referenceDetailsSubTotal;

  // Row 1: Total + Date header
  worksheet.getCell('A1').value = 'Total';
  worksheet.getCell('A1').font = { bold: true };
  
  worksheet.getCell('B1').value = grandTotal;
  worksheet.getCell('B1').font = { bold: true };
  
  worksheet.getCell('C1').value = 'Date:';
  worksheet.getCell('C1').font = { bold: true };
  
  worksheet.getCell('D1').value = new Date().toLocaleDateString();
  worksheet.getCell('D1').font = { bold: true };
  
  // Merge D1:AA1 (D1 to column 27)
  worksheet.mergeCells('D1:AA1');

  // Row 2: Summary header row
  const headerRow = worksheet.getRow(2);
  // Build full header: 'Ware House', 'CTN', 'Skid', then numbers 1-24
  const headerValues: (string | number)[] = ['Ware House', 'CTN', 'Skid'];
  for (let i = 1; i <= 24; i++) {
    headerValues.push(i);
  }
  headerRow.values = headerValues;
  
  // Style header row (A2:AC2) - that's columns 1 through 29 (A through AC)
  for (let col = 1; col <= 29; col++) {
    const cell = headerRow.getCell(col);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC9DAF8' }
    };
    cell.font = { bold: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Row 12: Subtotal row (or wherever we are after warehouse data)
  const subtotalRowNum = currentRow;
  const subtotalRow = worksheet.getRow(subtotalRowNum);
  subtotalRow.values = ['SUB-TOTAL', warehouseSubTotal];
  
  // Make A12 and B12 bold
  subtotalRow.getCell(1).font = { bold: true };
  subtotalRow.getCell(2).font = { bold: true };
  
  // Apply borders to subtotal row (A through AC)
  for (let col = 1; col <= 29; col++) {
    const cell = subtotalRow.getCell(col);
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  }

  // Row 13: Grey separator row
  const separatorRowNum = subtotalRowNum + 1;
  worksheet.mergeCells(`A${separatorRowNum}:AC${separatorRowNum}`);
  const separatorCell = worksheet.getCell(`A${separatorRowNum}`);
  separatorCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9D9D9' }
  };

  // Row 14: Detail header row
  const detailHeaderRowNum = separatorRowNum + 1;
  const detailHeaderRow = worksheet.getRow(detailHeaderRowNum);
  detailHeaderRow.values = ['Type', 'Reference1', 'Reference2', 'CTN'];
  
  // Style detail header row
  for (let col = 1; col <= 4; col++) {
    const cell = detailHeaderRow.getCell(col);
    cell.font = { bold: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    cell.alignment = { vertical: 'middle' };
  }

  // Rows 15-18: Detail data rows
  let detailRowNum = detailHeaderRowNum + 1;
  
  if (processedData.referenceDetails.length > 0) {
    processedData.referenceDetails.forEach((ref) => {
      const row = worksheet.getRow(detailRowNum);
      row.values = [ref.type, ref.reference1, ref.reference2, ref.ctn];
      
      // Apply borders to detail data cells
      for (let col = 1; col <= 4; col++) {
        const cell = row.getCell(col);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      
      detailRowNum++;
    });
  }

  // Add SUB-TOTAL row for reference details section
  const referenceSubtotalRowNum = detailRowNum;
  const referenceSubtotalRow = worksheet.getRow(referenceSubtotalRowNum);
  referenceSubtotalRow.values = ['SUB-TOTAL', '', '', referenceDetailsSubTotal];
  
  // Make cells bold
  referenceSubtotalRow.getCell(1).font = { bold: true };
  referenceSubtotalRow.getCell(4).font = { bold: true };
  
  // Apply borders to reference subtotal row
  for (let col = 1; col <= 4; col++) {
    const cell = referenceSubtotalRow.getCell(col);
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  }

  // Write to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
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

      // Generate the actual processed filename with timestamp
      const timestamp = Date.now();
      const safeFilename = filename.replace(/[^\w\s.-]/g, '_');
      const processedFilename = `processed_${timestamp}_${safeFilename}`;

      // Create processing record with actual filename
      const processedFile = await storage.createProcessedFile({
        originalFilename: filename,
        processedFilename: processedFilename,
        status: "processing",
        fileSize: size,
        totalRecords: 0,
        errorMessage: null,
      });

      // Process the file synchronously for instant download
      try {
        // Read the uploaded file
        const fileBuffer = fs.readFileSync(req.file.path);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        console.log(`Processing sheet: ${sheetName}`);

        // Process the data
        const processedData = processExcelData(worksheet);

        console.log('Processed data:', JSON.stringify(processedData, null, 2));

        // Generate output Excel
        const outputBuffer = await generateOutputExcel(processedData);

        // Save the processed file
        const outputPath = path.join('uploads', processedFilename);
        fs.writeFileSync(outputPath, outputBuffer);

        console.log(`Generated Excel file: ${outputPath}`);
        console.log(`File size: ${outputBuffer.length} bytes`);

        // Store processed data for display with actual total
        await storage.updateProcessedFileWithData(
          processedFile.id,
          "completed",
          processedData.total,
          JSON.stringify(processedData)
        );

        // Clean up the original uploaded file
        fs.unlinkSync(req.file.path);

        // Return completed status immediately for instant download
        res.json({ 
          message: "File processed successfully", 
          fileId: processedFile.id,
          status: "completed"
        });

      } catch (error) {
        console.error('Processing error:', error);
        await storage.updateProcessedFileStatus(
          processedFile.id,
          "failed",
          error instanceof Error ? error.message : "Unknown error"
        );
        
        res.status(500).json({ 
          message: error instanceof Error ? error.message : "Processing failed" 
        });
      }

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

      // Use the stored filename directly
      const filePath = path.join('uploads', file.processedFilename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File does not exist" });
      }

      const fileBuffer = fs.readFileSync(filePath);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', fileBuffer.length.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${file.processedFilename}"`);

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
