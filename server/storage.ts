import { type InsertProcessedFile, type ProcessedFile } from "@shared/schema";

export interface IStorage {
  createProcessedFile(file: InsertProcessedFile): Promise<ProcessedFile>;
  getProcessedFile(id: number): Promise<ProcessedFile | undefined>;
  updateProcessedFileStatus(id: number, status: "processing" | "completed" | "failed", errorMessage?: string): Promise<void>;
  getRecentProcessedFiles(limit: number): Promise<ProcessedFile[]>;
  deleteProcessedFile(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private files: Map<number, ProcessedFile>;
  private currentId: number;

  constructor() {
    this.files = new Map();
    this.currentId = 1;
  }

  async createProcessedFile(insertFile: InsertProcessedFile): Promise<ProcessedFile> {
    const id = this.currentId++;
    const now = new Date();
    const file: ProcessedFile = { 
      id,
      status: insertFile.status,
      originalFilename: insertFile.originalFilename,
      processedFilename: insertFile.processedFilename,
      fileSize: insertFile.fileSize,
      totalRecords: insertFile.totalRecords,
      errorMessage: insertFile.errorMessage || null,
      createdAt: now,
      updatedAt: now
    };
    this.files.set(id, file);
    return file;
  }

  async getProcessedFile(id: number): Promise<ProcessedFile | undefined> {
    return this.files.get(id);
  }

  async updateProcessedFileStatus(id: number, status: "processing" | "completed" | "failed", errorMessage?: string): Promise<void> {
    const file = this.files.get(id);
    if (file) {
      file.status = status;
      file.updatedAt = new Date();
      if (errorMessage !== undefined) {
        file.errorMessage = errorMessage;
      }
      this.files.set(id, file);
    }
  }

  async getRecentProcessedFiles(limit: number): Promise<ProcessedFile[]> {
    return Array.from(this.files.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async deleteProcessedFile(id: number): Promise<boolean> {
    return this.files.delete(id);
  }
}

export const storage = new MemStorage();
