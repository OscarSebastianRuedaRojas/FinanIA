import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { SqliteMicroBusinessAdapter } from "../src/adapters/repository/SqliteMicroBusinessAdapter.js";
import { EmicronBusinessTransactionsAdapter } from "../src/adapters/repository/EmicronBusinessTransactionsAdapter.js";
import { FinancialCalculator } from "../src/domain/services/FinancialCalculator.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

describe("EmicronBusinessTransactionsAdapter", () => {
  let tmpDir: string;
  let port: SqliteMicroBusinessAdapter;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emicron-tx-"));
    const dbPath = path.join(tmpDir, "emicron.sqlite");
    ingestEmicron(fixturesDir, dbPath);
    port = new SqliteMicroBusinessAdapter(dbPath);
  });

  afterAll(() => {
    port.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe convertir el último mes del micronegocio en transacciones del mes de referencia", async () => {
    const adapter = new EmicronBusinessTransactionsAdapter(port, "100-1-1");

    const transactions = await adapter.getTransactions();

    expect(transactions).toEqual([
      { id: "100-1-1-income", amount: 1000000, type: "INCOME", category: "Ventas del mes", description: "Ventas o ingresos del mes anterior (DANE EMICRON)", date: "2024-03-01" },
      { id: "100-1-1-line-0", amount: 400000, type: "EXPENSE", category: "Costo de mercancía vendida", description: "Costo reportado en EMICRON", date: "2024-03-01" },
      { id: "100-1-1-line-1", amount: 150000, type: "EXPENSE", category: "Arrendamiento", description: "Gasto reportado en EMICRON", date: "2024-03-01" },
      { id: "100-1-1-line-2", amount: 50000, type: "EXPENSE", category: "Energía eléctrica", description: "Gasto reportado en EMICRON", date: "2024-03-01" },
    ]);
    expect(FinancialCalculator.calculateSummary(transactions).netProfit).toBe(400000);
  });

  it("debe fallar con un mensaje claro si el micronegocio no existe", async () => {
    const adapter = new EmicronBusinessTransactionsAdapter(port, "999-1-1");

    await expect(adapter.getTransactions()).rejects.toThrow(/999-1-1/);
  });

  it("no debe permitir escribir sobre datos oficiales del DANE", async () => {
    const adapter = new EmicronBusinessTransactionsAdapter(port, "100-1-1");

    await expect(
      adapter.addTransaction({ amount: 1, type: "INCOME", category: "x", description: "x", date: "2024-01-01" })
    ).rejects.toThrow(/solo lectura/);
  });

  it("debe elegir un micronegocio aleatorio con ventas", async () => {
    const id = await port.getRandomBusinessId();

    expect(["100-1-1", "200-1-1", "400-1-1", "500-1-1"]).toContain(id);
  });
});
