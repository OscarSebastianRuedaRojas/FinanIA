import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { JsonFileFinancialAdapter } from "../src/adapters/repository/JsonFileFinancialAdapter.js";

describe("JsonFileFinancialAdapter", () => {
  const testFilePath = path.resolve(process.cwd(), "scratch", "test_transactions.json");

  beforeEach(async () => {
    const initialData = [
      {
        id: "test-1",
        amount: 1000,
        type: "INCOME",
        category: "Test",
        description: "Ingreso de prueba",
        date: "2026-10-01",
      },
    ];
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(initialData, null, 2), "utf-8");
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {}
  });

  it("debe cargar transacciones desde el archivo JSON", async () => {
    const adapter = new JsonFileFinancialAdapter(testFilePath);
    const txs = await adapter.getTransactions();

    expect(txs.length).toBe(1);
    expect(txs[0].description).toBe("Ingreso de prueba");
  });

  it("debe agregar una nueva transacción y persistirla en el JSON", async () => {
    const adapter = new JsonFileFinancialAdapter(testFilePath);
    const newTx = await adapter.addTransaction({
      amount: 500,
      type: "EXPENSE",
      category: "Servicios",
      description: "Egreso de prueba",
      date: "2026-10-02",
    });

    expect(newTx.id).toBeDefined();

    const txsAfterAdd = await adapter.getTransactions();
    expect(txsAfterAdd.length).toBe(2);
  });
});
