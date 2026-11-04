import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { selectLoadUnits } from "../src/infrastructure/emicron/EvaluationCaseSelector.js";
import { renderLoadReport } from "../src/application/LoadReport.js";
import { LoadUnit } from "../src/ports/LoadRunStore.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

describe("selectLoadUnits", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-units-"));
    dbPath = path.join(tmpDir, "emicron.sqlite");
    ingestEmicron(fixturesDir, dbPath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe elegir negocios con ventas en un orden reproducible y respetar la cantidad", () => {
    expect(selectLoadUnits(dbPath, { count: 3, minSalesLastMonth: 0 })).toEqual(["500-1-1", "400-1-1", "200-1-1"]);
    expect(selectLoadUnits(dbPath, { count: 10, minSalesLastMonth: 0 })).toHaveLength(4);
  });

  it("debe excluir negocios por debajo de las ventas mínimas", () => {
    expect(selectLoadUnits(dbPath, { count: 10, minSalesLastMonth: 1000000 })).not.toContain("500-1-1");
  });
});

describe("renderLoadReport (S4)", () => {
  const units: LoadUnit[] = [
    { seq: 0, businessId: "a", status: "done", attempts: 1, costUsd: 0.015, errorCode: null, passed: true },
    { seq: 1, businessId: "b", status: "done", attempts: 2, costUsd: 0.03, errorCode: null, passed: false },
    { seq: 2, businessId: "c", status: "failed", attempts: 2, costUsd: 0.002, errorCode: "LLM_API_ERROR", passed: false },
    { seq: 3, businessId: "d", status: "pending", attempts: 0, costUsd: 0, errorCode: null, passed: null },
  ];
  const reports = [
    {
      seq: 0,
      businessId: "a",
      report: {
        checks: [{ name: "Terminó sin error", passed: true }],
        toolCalls: [{ tool: "compareWithSectorPeers", ok: false, errorCode: "INSUFFICIENT_PEERS" }, { tool: "compareWithSectorPeers", ok: true }],
        totals: { llmCalls: 2, promptTokens: 5000, completionTokens: 900, reasoningTokens: 400, totalTokens: 5900, costUsd: 0.015, toolCalls: 2, toolErrors: 1 },
      },
    },
    {
      seq: 1,
      businessId: "b",
      report: {
        checks: [{ name: "Prioridad coherente con el riesgo de caja HIGH", passed: false, detail: "prioridad LOW" }],
        toolCalls: [{ tool: "getMonthlyStatement", ok: true }],
        totals: { llmCalls: 2, promptTokens: 5000, completionTokens: 900, reasoningTokens: 400, totalTokens: 5900, costUsd: 0.03, toolCalls: 1, toolErrors: 0 },
      },
    },
    { seq: 2, businessId: "c", report: { error: { code: "LLM_API_ERROR", message: "503" }, checks: [], toolCalls: [] } },
  ];

  const markdown = renderLoadReport(units, reports, {
    runId: "s4-test",
    generatedAt: "2026-11-04T12:00:00.000Z",
    plannedUnits: 4,
    budgetUsd: 25,
  });

  it("debe resumir unidades, aciertos, costo y estado de la corrida", () => {
    expect(markdown).toContain("# Prueba de carga S4 — s4-test");
    expect(markdown).toContain("| Unidades planificadas | 4 |");
    expect(markdown).toContain("| Procesadas | 3 (75%) |");
    expect(markdown).toContain("| Validadas (acierto) | 1 |");
    expect(markdown).toContain("| Con validación fallida | 1 |");
    expect(markdown).toContain("| Terminaron en error | 1 |");
    expect(markdown).toContain("| Pendientes | 1 |");
    expect(markdown).toContain("| Reintentadas | 2 |");
    expect(markdown).toContain("| Costo total | $0.047000 de un tope de $25.00 |");
  });

  it("debe agrupar los fallos por código", () => {
    expect(markdown).toContain("| `LLM_API_ERROR` (unidad en error) | 1 |");
    expect(markdown).toContain("| `INSUFFICIENT_PEERS` (herramienta) | 1 |");
    expect(markdown).toContain("| Validación: Prioridad coherente con el riesgo de caja HIGH | 1 |");
  });

  it("debe listar resultados y fallos por unidad", () => {
    expect(markdown).toContain("## Resultados y fallos por caso");
    expect(markdown).toContain("| U0001 | ✅ Acierto | `compareWithSectorPeers` ✗INSUFFICIENT_PEERS → recuperado |");
    expect(markdown).toContain("| U0002 | ❌ Fallo | Validación fallida: Prioridad coherente con el riesgo de caja HIGH — prioridad LOW |");
    expect(markdown).toContain("| U0003 | ❌ Fallo | Error de la ejecución `LLM_API_ERROR`: 503 |");
  });
});
