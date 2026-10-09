import { FinancialDataPort } from "../../ports/FinancialDataPort.js";
import { Transaction } from "../../domain/entities/Financial.js";

export class InMemoryFinancialAdapter implements FinancialDataPort {
  private transactions: Transaction[] = [
    { id: "1", amount: 1500, type: "INCOME", category: "Ventas Diarias", description: "Ventas de abarrotes lunes", date: "2026-10-01" },
    { id: "2", amount: 1800, type: "INCOME", category: "Ventas Diarias", description: "Ventas de abarrotes martes", date: "2026-10-02" },
    { id: "3", amount: 2200, type: "EXPENSE", category: "Proveedores", description: "Pago a distribuidora de lácteos", date: "2026-10-03" },
    { id: "4", amount: 800, type: "EXPENSE", category: "Servicios", description: "Pago de luz refrigeradores", date: "2026-10-04" },
    { id: "5", amount: 350, type: "EXPENSE", category: "Mantenimiento", description: "Reparación estante", date: "2026-10-05" },
  ];

  async getTransactions(): Promise<Transaction[]> {
    return this.transactions;
  }

  async addTransaction(transactionData: Omit<Transaction, "id">): Promise<Transaction> {
    const newTx: Transaction = {
      id: String(this.transactions.length + 1),
      ...transactionData,
    };
    this.transactions.push(newTx);
    return newTx;
  }
}

