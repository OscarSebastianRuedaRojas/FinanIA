import { describe, it, expect } from "vitest";
import { InvoiceExtraction, InvoiceExtractionSchema } from "../src/domain/entities/Invoice.js";
import { InvoiceMapper } from "../src/domain/services/InvoiceMapper.js";
import { TransactionSchema } from "../src/domain/entities/Financial.js";

const extraction: InvoiceExtraction = {
  vendorName: "FERRETERIA EL TORNILLO S.A.S.",
  vendorTaxId: "900.123.456-7",
  invoiceNumber: "FE-10234",
  date: "2026-09-14",
  currency: "COP",
  totalAmount: 177310,
  taxAmount: 28310,
  category: "Materiales y mantenimiento",
  type: "EXPENSE",
};

describe("InvoiceExtractionSchema (S2.1)", () => {
  it("debe aceptar una extracción completa y tipada", () => {
    expect(InvoiceExtractionSchema.parse(extraction)).toEqual(extraction);
  });

  it("debe aceptar campos opcionales ausentes o nulos", () => {
    const minimal = { ...extraction, vendorTaxId: null, invoiceNumber: undefined, taxAmount: null };

    expect(InvoiceExtractionSchema.safeParse(minimal).success).toBe(true);
  });

  it.each([
    ["fecha en formato local", { date: "14/09/2026" }],
    ["fecha inexistente", { date: "2026-02-30" }],
    ["moneda en minúsculas", { currency: "cop" }],
    ["total en cero", { totalAmount: 0 }],
    ["impuesto negativo", { taxAmount: -1 }],
    ["proveedor vacío", { vendorName: "" }],
    ["tipo desconocido", { type: "TRANSFER" }],
  ])("debe rechazar %s", (_label, override) => {
    expect(InvoiceExtractionSchema.safeParse({ ...extraction, ...override }).success).toBe(false);
  });
});

describe("InvoiceMapper.toTransaction (S3.1)", () => {
  const now = new Date("2026-10-23T12:00:00Z");

  it("debe mapear la factura sintética a una transacción válida", () => {
    const transaction = InvoiceMapper.toTransaction(extraction, now);

    expect(transaction).toEqual({
      id: `scan-${now.getTime()}`,
      amount: 177310,
      type: "EXPENSE",
      category: "Materiales y mantenimiento",
      description: "FERRETERIA EL TORNILLO S.A.S. — Factura FE-10234",
      date: "2026-09-14",
    });
    expect(TransactionSchema.safeParse(transaction).success).toBe(true);
  });

  it("debe describirla como recibo cuando no hay número de factura", () => {
    const transaction = InvoiceMapper.toTransaction({ ...extraction, invoiceNumber: null }, now);

    expect(transaction.description).toBe("FERRETERIA EL TORNILLO S.A.S. — Recibo");
  });
});
