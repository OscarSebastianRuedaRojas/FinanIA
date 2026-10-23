import { FinancialDataPort } from "../ports/FinancialDataPort.js";
import { InvoiceImage, InvoiceScannerPort } from "../ports/InvoiceScannerPort.js";
import { InvoiceExtraction } from "../domain/entities/Invoice.js";
import { Telemetry, Transaction } from "../domain/entities/Financial.js";
import { InvoiceMapper } from "../domain/services/InvoiceMapper.js";

export interface ScanInvoiceOutcome {
  extraction: InvoiceExtraction;
  transaction: Transaction;
  telemetry: Telemetry;
  saved: boolean;
}

// Foto de factura → extracción validada → transacción, opcionalmente persistida en el dataset
export class ScanInvoiceUseCase {
  constructor(
    private readonly scanner: InvoiceScannerPort,
    private readonly readImage: (filePath: string) => Promise<InvoiceImage>,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(imagePath: string, repository?: FinancialDataPort): Promise<ScanInvoiceOutcome> {
    const image = await this.readImage(imagePath);
    const { extraction, telemetry } = await this.scanner.scan(image);
    const transaction = InvoiceMapper.toTransaction(extraction, this.now());

    if (!repository) {
      return { extraction, transaction, telemetry, saved: false };
    }
    const { id, ...data } = transaction;
    const savedTransaction = await repository.addTransaction(data);
    return { extraction, transaction: savedTransaction, telemetry, saved: true };
  }
}
