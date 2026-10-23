import { ExecutionRecorder, RecordedToolCall } from "./ExecutionRecorder.js";
import { ExecutionLogPort, ExecutionObserver, ExecutionSource, RunTotals, ValidationCheck } from "../ports/ExecutionLogPort.js";

export type CaseOutcome<O> =
  | { status: "success"; value: O }
  | { status: "error"; error: { code?: string; message: string } };

// Una ejecución del plan: qué corre, qué se registra y cómo se valida
export interface ExecutionCase<O> {
  id: string;
  title: string;
  source: ExecutionSource;
  label: string;
  redactResult?: boolean;
  run(observer: ExecutionObserver): Promise<O>;
  resultForLog?(value: O): unknown;
  summarize?(value: O): string;
  validate(outcome: CaseOutcome<O>, recorder: ExecutionRecorder): ValidationCheck[];
}

export interface ExecutionReport {
  id: string;
  runId: string;
  title: string;
  source: ExecutionSource;
  label: string;
  status: "success" | "error";
  error?: { code?: string; message: string };
  summary?: string;
  passed: boolean;
  checks: ValidationCheck[];
  toolCalls: RecordedToolCall[];
  totals: RunTotals;
}

export async function runExecutionPlan(
  cases: ExecutionCase<any>[],
  options: { log: ExecutionLogPort; runIdPrefix: string; clock?: () => Date }
): Promise<ExecutionReport[]> {
  const reports: ExecutionReport[] = [];

  for (const executionCase of cases) {
    const runId = `${options.runIdPrefix}-${executionCase.id}`;
    const recorder = new ExecutionRecorder(
      options.log,
      { runId, source: executionCase.source, label: executionCase.label, redactResult: executionCase.redactResult },
      options.clock
    );
    console.log(`\n▶️  [${executionCase.id}] ${executionCase.title} (${executionCase.label})`);

    recorder.start();
    let outcome: CaseOutcome<unknown>;
    try {
      outcome = { status: "success", value: await executionCase.run(recorder) };
    } catch (error: any) {
      outcome = { status: "error", error: { ...(error?.code ? { code: String(error.code) } : {}), message: error?.message ?? String(error) } };
    }

    const totals = recorder.finish(
      outcome.status === "success"
        ? { status: "success", result: executionCase.resultForLog ? executionCase.resultForLog(outcome.value) : outcome.value }
        : { status: "error", error: outcome.error }
    );

    let checks: ValidationCheck[];
    try {
      checks = executionCase.validate(outcome, recorder);
    } catch (error: any) {
      checks = [{ name: "La validación pudo ejecutarse", passed: false, detail: error?.message ?? String(error) }];
    }
    const passed = recorder.validate(checks);
    console.log(`${passed ? "✅" : "❌"} [${executionCase.id}] ${checks.filter((c) => c.passed).length}/${checks.length} validaciones`);

    reports.push({
      id: executionCase.id,
      runId,
      title: executionCase.title,
      source: executionCase.source,
      label: executionCase.label,
      status: outcome.status,
      ...(outcome.status === "error" ? { error: outcome.error } : {}),
      ...(outcome.status === "success" && executionCase.summarize ? { summary: executionCase.summarize(outcome.value) } : {}),
      passed,
      checks,
      toolCalls: [...recorder.toolCalls],
      totals,
    });
  }

  return reports;
}

const usd = (value: number) => `$${(Number.isNaN(value) ? 0 : value).toFixed(6)}`;
const int = (value: number) => value.toLocaleString("en-US");

export function renderExecutionReport(reports: ExecutionReport[], meta: { title: string; generatedAt: string }): string {
  const validated = reports.filter((r) => r.passed).length;
  const totalCost = reports.reduce((acc, r) => acc + (Number.isNaN(r.totals.costUsd) ? 0 : r.totals.costUsd), 0);
  const totalTokens = reports.reduce((acc, r) => acc + r.totals.totalTokens, 0);
  const totalDuration = reports.length;

  const rows = reports.map((r) => {
    const status = r.status === "success" ? "✅ success" : r.error?.code ? `⚠️ ${r.error.code}` : "❌ error";
    const passedChecks = r.checks.filter((c) => c.passed).length;
    const tools = r.toolCalls.length
      ? r.toolCalls.map((c) => (c.ok ? c.tool : `${c.tool} ✗${c.errorCode}`)).join(", ")
      : "—";
    return `| ${r.id} | ${r.title} | ${r.source} | ${status} | ${r.passed ? "✅" : "❌"} ${passedChecks}/${r.checks.length} | ${tools} | ${int(r.totals.totalTokens)} | ${usd(r.totals.costUsd)} |`;
  });

  const details = reports.map((r) =>
    [
      `### ${r.id} — ${r.title}`,
      `- Run ID: \`${r.runId}\` · Fuente: \`${r.source}\` · Entrada: \`${r.label}\``,
      r.summary ? `- Resultado: ${r.summary}` : r.error ? `- Error: \`${r.error.code ?? "error"}\` — ${r.error.message}` : "",
      `- LLM: ${r.totals.llmCalls} llamadas · ${int(r.totals.promptTokens)} tokens de entrada · ${int(r.totals.completionTokens)} de salida (${int(r.totals.reasoningTokens)} de razonamiento) · ${usd(r.totals.costUsd)}`,
      ...r.checks.map((c) => `- ${c.passed ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`),
    ]
      .filter(Boolean)
      .join("\n")
  );

  return [
    `# ${meta.title}`,
    "",
    `Generado: ${meta.generatedAt}`,
    "",
    `**${validated}/${reports.length} ejecuciones validadas** · Tokens totales: ${int(totalTokens)} · Costo total: **${usd(totalCost)} USD**`,
    "",
    "| # | Caso | Fuente | Estado | Validación | Herramientas invocadas | Tokens | Costo |",
    "| :--- | :--- | :--- | :--- | :--- | :--- | ---: | ---: |",
    ...rows,
    "",
    `> ${totalDuration} ejecuciones. El costo sale de \`usage.cost_in_usd_ticks\` de la API (1 USD = 10^10 ticks). En los casos EMICRON no se guarda el texto del dictamen ni los datos que devuelven las herramientas, por la licencia del DANE.`,
    "",
    "## Detalle por ejecución",
    "",
    details.join("\n\n"),
    "",
  ].join("\n");
}
