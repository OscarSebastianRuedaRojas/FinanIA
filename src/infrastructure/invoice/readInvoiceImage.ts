import fs from "node:fs/promises";
import path from "node:path";
import { InvoiceImage, InvoiceScanError } from "../../ports/InvoiceScannerPort.js";

export const MAX_INVOICE_IMAGE_BYTES = 10 * 1024 * 1024;

const FORMATS: Record<string, { mimeType: InvoiceImage["mimeType"]; magic: number[] }> = {
  ".png": { mimeType: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ".jpg": { mimeType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  ".jpeg": { mimeType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
};

// Valida la imagen antes de gastar tokens: existencia, extensión, tamaño y bytes iniciales
export async function readInvoiceImage(filePath: string): Promise<InvoiceImage> {
  const format = FORMATS[path.extname(filePath).toLowerCase()];

  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    throw new InvoiceScanError("FILE_NOT_FOUND", `No existe el archivo ${filePath}.`);
  }

  if (!format) {
    throw new InvoiceScanError("UNSUPPORTED_FILE", `Formato no soportado: ${path.basename(filePath)}. Usá una foto JPG o PNG.`);
  }
  if (size > MAX_INVOICE_IMAGE_BYTES) {
    throw new InvoiceScanError("FILE_TOO_LARGE", `La imagen pesa ${(size / 1024 / 1024).toFixed(1)} MB; el máximo es 10 MB.`);
  }

  const data = await fs.readFile(filePath);
  if (!format.magic.every((byte, idx) => data[idx] === byte)) {
    throw new InvoiceScanError("UNSUPPORTED_FILE", `El contenido de ${path.basename(filePath)} no es una imagen ${format.mimeType}.`);
  }
  return { data, mimeType: format.mimeType };
}
