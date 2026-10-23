import { Transaction, TransactionSchema } from "../entities/Financial.js";
import { InvoiceExtraction } from "../entities/Invoice.js";

export class InvoiceMapper {
  static toTransaction(extraction: InvoiceExtraction, now: Date = new Date()): Transaction {
    const document = extraction.invoiceNumber ? `Factura ${extraction.invoiceNumber}` : "Recibo";
    return TransactionSchema.parse({
      id: `scan-${now.getTime()}`,
      amount: extraction.totalAmount,
      type: extraction.type,
      category: extraction.category,
      description: `${extraction.vendorName} — ${document}`,
      date: extraction.date,
    });
  }
}
