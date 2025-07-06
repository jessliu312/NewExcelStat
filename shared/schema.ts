import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const processedFiles = pgTable("processed_files", {
  id: serial("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  processedFilename: text("processed_filename").notNull(),
  status: text("status", { enum: ["processing", "completed", "failed"] }).notNull(),
  fileSize: integer("file_size").notNull(),
  totalRecords: integer("total_records").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProcessedFileSchema = createInsertSchema(processedFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const fileUploadSchema = z.object({
  filename: z.string().min(1),
  size: z.number().min(1).max(10 * 1024 * 1024), // 10MB max
});

export type InsertProcessedFile = z.infer<typeof insertProcessedFileSchema>;
export type ProcessedFile = typeof processedFiles.$inferSelect;
