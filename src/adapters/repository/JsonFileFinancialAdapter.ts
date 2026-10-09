import fs from "node:fs/promises";
import path from "node:path";
import { FinancialDataPort } from "../../ports/FinancialDataPort.js";
import { Transaction, TransactionSchema } from "../../domain/entities/Financial.js";

export class JsonFileFinancialAdapter implements FinancialDataPort {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.resolve(process.cwd(), "data", "transactions.json");
  }

  async getTransactions(): Promise<Transaction[]> {
    try {
      const fileData = await fs.readFile(this.filePath, "utf-8");
      const parsedJson = JSON.parse(fileData);
      
      // Validar con Zod para asegurar estructura correcta
      return TransactionSchema.array().parse(parsedJson);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.warn(` Archivo de transacciones no encontrado en ${this.filePath}. Retornando lista vacía.`);
        return [];
      }
      throw new Error(`Error al leer o parsear las transacciones desde JSON: ${error.message}`);
    }
  }

  async addTransaction(transactionData: Omit<Transaction, "id">): Promise<Transaction> {
    const currentTransactions = await this.getTransactions();
    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      ...transactionData,
    };

    const updatedTransactions = [...currentTransactions, newTx];
    
    // Guardar cambios en el JSON
    await fs.writeFile(this.filePath, JSON.stringify(updatedTransactions, null, 2), "utf-8");
    return newTx;
  }
}
