import { FinancialDataPort } from "../../ports/FinancialDataPort.js";
import { MicroBusinessDataPort } from "../../ports/MicroBusinessDataPort.js";
import { Transaction } from "../../domain/entities/Financial.js";

const MONTHS: Record<string, string> = {
  ENERO: "01",
  FEBRERO: "02",
  MARZO: "03",
  ABRIL: "04",
  MAYO: "05",
  JUNIO: "06",
  JULIO: "07",
  AGOSTO: "08",
  SEPTIEMBRE: "09",
  OCTUBRE: "10",
  NOVIEMBRE: "11",
  DICIEMBRE: "12",
};

// Presenta el último mes de un micronegocio EMICRON como transacciones para el resumen del dominio
export class EmicronBusinessTransactionsAdapter implements FinancialDataPort {
  constructor(
    private readonly port: MicroBusinessDataPort,
    private readonly businessId: string,
    private readonly surveyYear = 2024
  ) {}

  async getTransactions(): Promise<Transaction[]> {
    const [profile, figures, lines] = await Promise.all([
      this.port.getProfile(this.businessId),
      this.port.getMonthlyFigures(this.businessId),
      this.port.getFinancialLines(this.businessId),
    ]);
    if (!profile || !figures) {
      throw new Error(`No existe el micronegocio "${this.businessId}" en la base EMICRON.`);
    }

    const date = `${this.surveyYear}-${MONTHS[profile.referenceMonth] ?? "01"}-01`;
    const transactions: Transaction[] = [];
    if (figures.salesLastMonth > 0) {
      transactions.push({
        id: `${this.businessId}-income`,
        amount: figures.salesLastMonth,
        type: "INCOME",
        category: "Ventas del mes",
        description: "Ventas o ingresos del mes anterior (DANE EMICRON)",
        date,
      });
    }
    lines.forEach((line, idx) => {
      transactions.push({
        id: `${this.businessId}-line-${idx}`,
        amount: line.amount,
        type: "EXPENSE",
        category: line.category,
        description: line.kind === "COST" ? "Costo reportado en EMICRON" : "Gasto reportado en EMICRON",
        date,
      });
    });
    return transactions;
  }

  async addTransaction(): Promise<Transaction> {
    throw new Error("La fuente EMICRON es de solo lectura: son datos oficiales del DANE.");
  }
}
