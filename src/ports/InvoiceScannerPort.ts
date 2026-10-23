import { InvoiceExtraction } from "../domain/entities/Invoice.js";
import { Telemetry } from "../domain/entities/Financial.js";

export type InvoiceScanErrorCode =
  | "FILE_NOT_FOUND"
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "NOT_AN_INVOICE"
  | "INVALID_EXTRACTION"
  | "VISION_API_ERROR";

export class InvoiceScanError extends Error {
  constructor(public readonly code: InvoiceScanErrorCode, message: string) {
    super(message);
    this.name = "InvoiceScanError";
  }
}

export interface InvoiceImage {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg";
}

export interface InvoiceScanResult {
  extraction: InvoiceExtraction;
  telemetry: Telemetry;
}

export interface InvoiceScannerPort {
  // Lanza InvoiceScanError con un código cuando la imagen no se puede convertir en una extracción válida
  scan(image: InvoiceImage): Promise<InvoiceScanResult>;
}
