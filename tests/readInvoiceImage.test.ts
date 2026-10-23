import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readInvoiceImage, MAX_INVOICE_IMAGE_BYTES } from "../src/infrastructure/invoice/readInvoiceImage.js";
import { InvoiceScanError } from "../src/ports/InvoiceScannerPort.js";

const invoicePng = path.resolve(__dirname, "fixtures", "invoices", "factura_sintetica.png");

async function expectScanError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e) => e
  );
  expect(error).toBeInstanceOf(InvoiceScanError);
  expect(error.code).toBe(code);
}

describe("readInvoiceImage (R1)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "invoice-img-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("S1.1 debe leer un PNG válido con su tipo MIME", async () => {
    const image = await readInvoiceImage(invoicePng);

    expect(image.mimeType).toBe("image/png");
    expect(image.data.equals(fs.readFileSync(invoicePng))).toBe(true);
  });

  it("S1.1 debe reconocer un JPEG por sus bytes iniciales", async () => {
    const jpeg = path.join(tmpDir, "recibo.JPG");
    fs.writeFileSync(jpeg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));

    const image = await readInvoiceImage(jpeg);

    expect(image.mimeType).toBe("image/jpeg");
  });

  it("S1.2 debe rechazar extensiones no soportadas", async () => {
    const pdf = path.join(tmpDir, "factura.pdf");
    fs.writeFileSync(pdf, "%PDF-1.7");

    await expectScanError(readInvoiceImage(pdf), "UNSUPPORTED_FILE");
  });

  it("S1.2 debe rechazar un archivo .png cuyo contenido no es PNG", async () => {
    const fake = path.join(tmpDir, "falsa.png");
    fs.writeFileSync(fake, "no soy una imagen");

    await expectScanError(readInvoiceImage(fake), "UNSUPPORTED_FILE");
  });

  it("S1.3 debe rechazar imágenes de más de 10 MB", async () => {
    const big = path.join(tmpDir, "enorme.png");
    fs.writeFileSync(big, Buffer.alloc(MAX_INVOICE_IMAGE_BYTES + 1));

    expect(MAX_INVOICE_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    await expectScanError(readInvoiceImage(big), "FILE_TOO_LARGE");
  });

  it("S1.4 debe fallar con FILE_NOT_FOUND si la ruta no existe", async () => {
    await expectScanError(readInvoiceImage(path.join(tmpDir, "no-existe.png")), "FILE_NOT_FOUND");
  });
});
