import { describe, it, expect } from "vitest";
import { buildCostReport, renderCostReport } from "../src/application/CostReport.js";
import { ExecutionEvent, ExecutionSource } from "../src/ports/ExecutionLogPort.js";

function finished(runId: string, source: ExecutionSource, costUsd: number, totalTokens: number, durationMs: number, status: "success" | "error" = "success"): ExecutionEvent {
  return {
    type: "run_finished",
    runId,
    timestamp: "2026-11-01T12:00:00.000Z",
    source,
    label: runId,
    status,
    durationMs,
    totals: { llmCalls: 2, promptTokens: totalTokens - 100, completionTokens: 100, reasoningTokens: 50, totalTokens, costUsd, toolCalls: 3, toolErrors: 0 },
  };
}

const events: ExecutionEvent[] = [
  { type: "run_started", runId: "a", timestamp: "t", source: "emicron", label: "a" },
  finished("a", "emicron", 0.01, 6000, 20000),
  finished("b", "emicron", 0.02, 7000, 30000),
  finished("c", "invoice", 0.004, 2000, 4000, "error"),
  finished("d", "goal", 0.03, 19000, 90000),
  { type: "run_validated", runId: "a", timestamp: "t", passed: true, checks: [] },
];

describe("Reporte de costo por tarea (S7)", () => {
  it("debe agrupar las ejecuciones por tipo de tarea con promedio, mínimo, máximo y total", () => {
    const report = buildCostReport(events, { projectionSource: "emicron", projectionUnits: 1000 });

    expect(report.byTask).toEqual([
      { source: "emicron", runs: 2, successes: 2, avgCostUsd: 0.015, minCostUsd: 0.01, maxCostUsd: 0.02, totalCostUsd: 0.03, avgTokens: 6500, avgDurationMs: 25000, avgToolCalls: 3 },
      { source: "goal", runs: 1, successes: 1, avgCostUsd: 0.03, minCostUsd: 0.03, maxCostUsd: 0.03, totalCostUsd: 0.03, avgTokens: 19000, avgDurationMs: 90000, avgToolCalls: 3 },
      { source: "invoice", runs: 1, successes: 0, avgCostUsd: 0.004, minCostUsd: 0.004, maxCostUsd: 0.004, totalCostUsd: 0.004, avgTokens: 2000, avgDurationMs: 4000, avgToolCalls: 3 },
    ]);
    expect(report.total).toEqual({ runs: 4, costUsd: 0.064, tokens: 34000 });
  });

  it("debe proyectar el costo y el tiempo de 1.000 unidades de S4 con el promedio y el peor caso", () => {
    const report = buildCostReport(events, { projectionSource: "emicron", projectionUnits: 1000 });

    expect(report.projection).toEqual({
      source: "emicron",
      units: 1000,
      expectedCostUsd: 15,
      worstCaseCostUsd: 20,
      sequentialHours: 6.94,
    });
  });

  it("debe ignorar ejecuciones sin costo conocido", () => {
    const report = buildCostReport([...events, finished("e", "emicron", NaN, 6000, 20000)], { projectionSource: "emicron", projectionUnits: 1000 });

    expect(report.byTask.find((t) => t.source === "emicron")?.runs).toBe(2);
  });

  it("debe renderizar el reporte en Markdown", () => {
    const markdown = renderCostReport(buildCostReport(events, { projectionSource: "emicron", projectionUnits: 1000 }), {
      generatedAt: "2026-11-01T12:00:00.000Z",
      sources: ["docs/bitacora/s3-evaluacion.jsonl"],
    });

    expect(markdown).toContain("# Reporte de costo por tarea");
    expect(markdown).toContain("| Auditoría de un micronegocio real (EMICRON) | 2 | 100% | $0.015000 | $0.010000 | $0.020000 | 6,500 | 25.0 s |");
    expect(markdown).toContain("1,000 unidades");
    expect(markdown).toContain("$15.00");
  });
});
