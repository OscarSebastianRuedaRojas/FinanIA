import { Transaction } from "../domain/entities/Financial.js";

export interface FinancialDataPort {
  getTransactions(): Promise<Transaction[]>;
  addTransaction(transaction: Omit<Transaction, "id">): Promise<Transaction>;
}

