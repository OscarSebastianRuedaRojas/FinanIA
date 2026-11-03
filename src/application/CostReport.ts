import { ExecutionEvent, ExecutionSource } from "../ports/ExecutionLogPort.js";

export interface TaskCostStats {
  source: ExecutionSource;
  runs: number;
  successes: number;
  avgCostUsd: number;
  minCostUsd: number;
  maxCostUsd: number;
  totalCostUsd: number;
  avgTokens: number;
  avgDurationMs: number;
  avgToolCalls: number;
}

export interface CostReport {
  byTask: TaskCostStats[];
  total: { runs: number; costUsd: number; tokens: number };
  projection: { source: ExecutionSource; units: number; expectedCostUsd: number; worstCaseCostUsd: number; sequentialHours: number } | null;
}

const TASK_LABELS: Record<ExecutionSource, string> = {
  emicron: "Auditoría de un micronegocio real (EMICRON)",
  json: "Auditoría de un caso sintético (JSON)",
  invoice: "Lectura de una factura (Grok Vision)",
  goal: "Objetivo en texto libre (varios negocios)",
};

const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const avg = (values: number[]) => values.reduce((acc, v) => acc + v, 0) / values.length;

// Costo por tarea a partir de la bitácora: cada run_finished es una unidad de trabajo
export function buildCostReport(
  events: ExecutionEvent[],
  options: { projectionSource: ExecutionSource; projectionUnits: number }
): CostReport {
  const runs = events.filter(
    (e): e is Extract<ExecutionEvent, { type: "run_finished" }> => e.type === "run_finished" && Number.isFinite(e.totals.costUsd)
  );

  const groups = new Map<ExecutionSource, typeof runs>();
  runs.forEach((run) => groups.set(run.source, [...(groups.get(run.source) ?? []), run]));

  const byTask = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, items]) => {
      const costs = items.map((r) => r.totals.costUsd);
      return {
        source,
        runs: items.length,
        successes: items.filter((r) => r.status === "success").length,
        avgCostUsd: round(avg(costs), 6),
        minCostUsd: round(Math.min(...costs), 6),
        maxCostUsd: round(Math.max(...costs), 6),
        totalCostUsd: round(costs.reduce((acc, c) => acc + c, 0), 6),
        avgTokens: Math.round(avg(items.map((r) => r.totals.totalTokens))),
        avgDurationMs: Math.round(avg(items.map((r) => r.durationMs))),
        avgToolCalls: round(avg(items.map((r) => r.totals.toolCalls)), 1),
      };
    });

  const base = byTask.find((t) => t.source === options.projectionSource);
  return {
    byTask,
    total: {
      runs: runs.length,
      costUsd: round(runs.reduce((acc, r) => acc + r.totals.costUsd, 0), 6),
      tokens: runs.reduce((acc, r) => acc + r.totals.totalTokens, 0),
    },
    projection: base
      ? {
          source: options.projectionSource,
          units: options.projectionUnits,
          expectedCostUsd: round(base.avgCostUsd * options.projectionUnits, 2),
          worstCaseCostUsd: round(base.maxCostUsd * options.projectionUnits, 2),
          sequentialHours: round((base.avgDurationMs * options.projectionUnits) / 3_600_000, 2),
        }
      : null,
  };
}

const usd = (value: number, decimals = 6) => `$${value.toFixed(decimals)}`;

export function renderCostReport(report: CostReport, meta: { generatedAt: string; sources: string[] }): string {
  const rows = report.byTask.map(
    (t) =>
      `| ${TASK_LABELS[t.source]} | ${t.runs} | ${Math.round((t.successes / t.runs) * 100)}% | ${usd(t.avgCostUsd)} | ${usd(t.minCostUsd)} | ${usd(t.maxCostUsd)} | ${t.avgTokens.toLocaleString("en-US")} | ${(t.avgDurationMs / 1000).toFixed(1)} s |`
  );
  const p = report.projection;

  return [
    "# Reporte de costo por tarea — FinanIA",
    "",
    `Generado: ${meta.generatedAt}`,
    `Bitácoras analizadas: ${meta.sources.map((s) => `\`${s}\``).join(", ")}`,
    "",
    `**${report.total.runs} ejecuciones · ${report.total.tokens.toLocaleString("en-US")} tokens · costo total ${usd(report.total.costUsd)} USD**`,
    "",
    "| Tarea | Ejecuciones | Sin error | Costo promedio | Mínimo | Máximo | Tokens promedio | Duración promedio |",
    "| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    ...(p
      ? [
          "## Proyección para S4",
          "",
          `Con el costo medido por tarea de tipo **${TASK_LABELS[p.source]}**, ${p.units.toLocaleString("en-US")} unidades costarían:`,
          "",
          `- **Esperado:** ${usd(p.expectedCostUsd, 2)} USD (promedio × ${p.units.toLocaleString("en-US")})`,
          `- **Peor caso:** ${usd(p.worstCaseCostUsd, 2)} USD (máximo observado × ${p.units.toLocaleString("en-US")})`,
          `- **Tiempo en secuencia:** ${p.sequentialHours} horas (dentro de una ventana de 12 horas si es menor a 12)`,
          "",
        ]
      : []),
    "> \"Sin error\" cuenta las ejecuciones que terminaron sin excepción; algunos casos fallan a propósito (ej. una foto que no es factura) y su validación está en la bitácora de cada evaluación.",
    "",
    "> El costo sale de `usage.cost_in_usd_ticks` de cada respuesta de la API (1 USD = 10^10 ticks), ya neto de caché. Una ejecución es una unidad de trabajo completa: todas sus llamadas al modelo y a herramientas.",
    "",
  ].join("\n");
}
