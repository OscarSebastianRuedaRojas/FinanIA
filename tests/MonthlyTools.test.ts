import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { SqliteMicroBusinessAdapter } from "../src/adapters/repository/SqliteMicroBusinessAdapter.js";
import { createMonthlyTools } from "../src/application/tools/monthlyTools.js";
import { AgentTool } from "../src/application/tools/AgentTool.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

function findTool(tools: AgentTool[], name: string): AgentTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} no registrada`);
  return tool;
}

describe("Herramientas mensuales sobre EMICRON", () => {
  let tmpDir: string;
  let tools: AgentTool[];
  const adapters: SqliteMicroBusinessAdapter[] = [];
  const open = (file: string) => {
    const adapter = new SqliteMicroBusinessAdapter(path.join(tmpDir, file));
    adapters.push(adapter);
    return adapter;
  };

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emicron-tools-"));
    ingestEmicron(fixturesDir, path.join(tmpDir, "emicron.sqlite"));
    tools = createMonthlyTools(open("emicron.sqlite"), { minPeers: 2 });
  });

  afterAll(() => {
    adapters.forEach((adapter) => adapter.close());
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe exponer parámetros tipados en JSON Schema para el LLM", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "getMonthlyStatement",
      "compareWithSectorPeers",
      "getYearOverYearSales",
    ]);
    const statement = findTool(tools, "getMonthlyStatement");
    expect(statement.parameters).toMatchObject({
      type: "object",
      properties: { businessId: { type: "string" } },
      required: ["businessId"],
    });
  });

  it("getMonthlyStatement debe calcular márgenes y desglose del negocio real", async () => {
    const result = await findTool(tools, "getMonthlyStatement").execute({ businessId: "100-1-1" });

    expect(result).toEqual({
      ok: true,
      data: {
        business: {
          id: "100-1-1",
          department: "Antioquia",
          sector: "Comercio y reparación de vehículos automotores y motocicletas",
          referenceMonth: "MARZO",
        },
        salesLastMonth: 1000000,
        costsLastMonth: 400000,
        expensesLastMonth: 200000,
        taxesAndLicensesLastMonth: 0,
        grossProfit: 600000,
        grossMarginPct: 60,
        operatingProfit: 400000,
        operatingMarginPct: 40,
        lines: [
          { kind: "COST", category: "Costo de mercancía vendida", amount: 400000, shareOfSalesPct: 40 },
          { kind: "EXPENSE", category: "Arrendamiento", amount: 150000, shareOfSalesPct: 15 },
          { kind: "EXPENSE", category: "Energía eléctrica", amount: 50000, shareOfSalesPct: 5 },
        ],
      },
    });
  });

  it("debe devolver BUSINESS_NOT_FOUND cuando el negocio no existe", async () => {
    const result = await findTool(tools, "getMonthlyStatement").execute({ businessId: "999-1-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "BUSINESS_NOT_FOUND" } });
  });

  it("debe devolver INVALID_ARGUMENTS cuando el LLM envía argumentos inválidos", async () => {
    const result = await findTool(tools, "getYearOverYearSales").execute({ businessId: 42 });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
  });

  it("compareWithSectorPeers debe ubicar al negocio frente a sus pares del departamento", async () => {
    const result = await findTool(tools, "compareWithSectorPeers").execute({ businessId: "100-1-1", scope: "department" });

    expect(result).toEqual({
      ok: true,
      data: {
        scope: "department",
        sector: "Comercio y reparación de vehículos automotores y motocicletas",
        department: "Antioquia",
        peers: 2,
        businessOperatingMarginPct: 40,
        peerMedianOperatingMarginPct: 10,
        businessSalesLastMonth: 1000000,
        peerMedianSalesLastMonth: 1250000,
        operatingMarginPercentile: 100,
      },
    });
  });

  it("debe devolver INSUFFICIENT_PEERS si no hay pares suficientes para comparar", async () => {
    const strictTools = createMonthlyTools(open("emicron.sqlite"));
    const result = await findTool(strictTools, "compareWithSectorPeers").execute({ businessId: "100-1-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "INSUFFICIENT_PEERS" } });
  });

  it("getYearOverYearSales debe comparar contra el mismo mes y el promedio del año anterior", async () => {
    const result = await findTool(tools, "getYearOverYearSales").execute({ businessId: "500-1-1" });

    expect(result).toEqual({
      ok: true,
      data: {
        salesLastMonth: 500000,
        salesSameMonthLastYear: 600000,
        yearOverYearChangePct: -16.67,
        salesLastYear: 6500000,
        monthsOperatedLastYear: 12,
        averageMonthlySalesLastYear: 541666.67,
        lastMonthVsAveragePct: -7.69,
      },
    });
  });

  it("debe devolver DATA_SOURCE_ERROR si la base EMICRON no fue ingestada", async () => {
    const brokenTools = createMonthlyTools(open("no-existe.sqlite"));
    const result = await findTool(brokenTools, "getMonthlyStatement").execute({ businessId: "100-1-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "DATA_SOURCE_ERROR" } });
    expect(fs.existsSync(path.join(tmpDir, "no-existe.sqlite"))).toBe(false);
  });
});
