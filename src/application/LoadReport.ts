import { ExecutionReport, renderFailures } from "./ExecutionPlanRunner.js";
import { LoadUnit } from "../ports/LoadRunStore.js";
import { RunTotals, ValidationCheck } from "../ports/ExecutionLogPort.js";

// Lo que el runner guarda de cada unidad en el checkpoint
export interface StoredUnitReport {
  checks?: ValidationCheck[];
  toolCalls?: { tool: string; ok: boolean; errorCode?: string }[];
  totals?: RunTotals;
  error?: { code?: string; message: string };
}

const EMPTY_TOTALS: RunTotals = {
  llmCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  toolCalls: 0,
  toolErrors: 0,
};

const unitId = (seq: number) => `U${String(seq + 1).padStart(4, "0")}`;
const usd = (value: number, decimals = 6) => `$${value.toFixed(decimals)}`;

function toExecutionReport(unit: LoadUnit, stored: StoredUnitReport | undefined, runId: string): ExecutionReport {
  const error = unit.status === "failed" ? stored?.error ?? { code: unit.errorCode ?? "error", message: "" } : undefined;
  return {
    id: unitId(unit.seq),
    runId: `${runId}-${unitId(unit.seq)}`,
    title: unit.businessId,
    source: "emicron",
    label: unit.businessId,
    status: unit.status === "done" ? "success" : "error",
    ...(error ? { error: { code: error.code ?? unit.errorCode ?? "error", message: error.message } } : {}),
    passed: unit.passed === true,
    checks: stored?.checks ?? [],
    toolCalls: (stored?.toolCalls ?? []).map((call) => ({ tool: call.tool, args: {}, ok: call.ok, ...(call.errorCode ? { errorCode: call.errorCode } : {}) })),
    totals: stored?.totals ?? EMPTY_TOTALS,
  };
}

// Informe de la prueba de carga: resumen, fallos por código y resultado de cada unidad
export function renderLoadReport(
  units: LoadUnit[],
  reports: { seq: number; businessId: string; report: unknown }[],
  meta: { runId: string; generatedAt: string; plannedUnits: number; budgetUsd: number }
): string {
  const bySeq = new Map(reports.map((r) => [r.seq, r.report as StoredUnitReport]));
  const processed = units.filter((u) => u.status === "done" || u.status === "failed");
  const passed = units.filter((u) => u.status === "done" && u.passed).length;
  const checkFailed = units.filter((u) => u.status === "done" && !u.passed).length;
  const errored = units.filter((u) => u.status === "failed").length;
  const pending = units.length - processed.length;
  const retried = units.filter((u) => u.attempts > 1).length;
  const cost = units.reduce((acc, u) => acc + u.costUsd, 0);
  const tokens = processed.reduce((acc, u) => acc + (bySeq.get(u.seq)?.totals?.totalTokens ?? 0), 0);

  const codes = new Map<string, number>();
  const bump = (key: string) => codes.set(key, (codes.get(key) ?? 0) + 1);
  processed.forEach((unit) => {
    const stored = bySeq.get(unit.seq);
    if (unit.status === "failed") bump(`\`${stored?.error?.code ?? unit.errorCode ?? "error"}\` (unidad en error)`);
    (stored?.toolCalls ?? []).filter((c) => !c.ok).forEach((c) => bump(`\`${c.errorCode}\` (herramienta)`));
    (stored?.checks ?? []).filter((c) => !c.passed).forEach((c) => bump(`Validación: ${c.name}`));
  });
  const codeRows = [...codes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `| ${k} | ${n} |`);

  const pct = (n: number) => `${Math.round((n / Math.max(meta.plannedUnits, 1)) * 100)}%`;
  return [
    `# Prueba de carga S4 — ${meta.runId}`,
    "",
    `Generado: ${meta.generatedAt}`,
    "",
    "| Métrica | Valor |",
    "| :--- | :--- |",
    `| Unidades planificadas | ${meta.plannedUnits} |`,
    `| Procesadas | ${processed.length} (${pct(processed.length)}) |`,
    `| Validadas (acierto) | ${passed} |`,
    `| Con validación fallida | ${checkFailed} |`,
    `| Terminaron en error | ${errored} |`,
    `| Pendientes | ${pending} |`,
    `| Reintentadas | ${retried} |`,
    `| Tokens | ${tokens.toLocaleString("en-US")} |`,
    `| Costo total | ${usd(cost)} de un tope de ${usd(meta.budgetUsd, 2)} |`,
    `| Costo promedio por unidad | ${usd(processed.length ? cost / processed.length : 0)} |`,
    "",
    "## Fallos por código",
    "",
    ...(codeRows.length ? ["| Código o validación | Veces |", "| :--- | ---: |", ...codeRows] : ["Ninguna unidad registró fallos."]),
    "",
    renderFailures(processed.map((unit) => toExecutionReport(unit, bySeq.get(unit.seq), meta.runId))),
    "> Cada unidad es la auditoría autónoma de un micronegocio real de EMICRON 2024 (DANE). Por la licencia del DANE, este informe no incluye cifras ni dictámenes de los negocios.",
    "",
  ].join("\n");
}
