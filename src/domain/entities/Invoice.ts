import { z } from "zod";

// Fecha YYYY-MM-DD que además existe en el calendario (rechaza 2026-02-30)
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "La fecha no existe en el calendario");

// Datos extraídos de una factura o recibo por Grok Vision
export const InvoiceExtractionSchema = z.object({
  vendorName: z.string().trim().min(1),
  vendorTaxId: z.string().nullish(),
  invoiceNumber: z.string().nullish(),
  date: calendarDate,
  currency: z.string().regex(/^[A-Z]{3}$/, "La moneda debe ser un código ISO 4217 (ej. COP)"),
  totalAmount: z.number().positive(),
  taxAmount: z.number().nonnegative().nullish(),
  category: z.string().trim().min(1),
  type: z.enum(["EXPENSE", "INCOME"]),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
