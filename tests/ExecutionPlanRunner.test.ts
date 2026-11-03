import { describe, it, expect } from "vitest";
import { ExecutionCase, runExecutionPlan, renderExecutionReport } from "../src/application/ExecutionPlanRunner.js";
import { ExecutionEvent, ExecutionLogPort } from "../src/ports/ExecutionLogPort.js";

class MemoryLog implements ExecutionLogPort {
  events: ExecutionEvent[] = [];
  record(event: ExecutionEvent): void {
    this.events.push(event);
  }
}

const usage = { prompt_tokens: 1000, completion_tokens: 100, cost_in_usd_ticks: 50000000 };

const okCase: ExecutionCase<{ priority: string; diagnosis: string }> = {
  id: "E01",
  title: "Caso que funciona",
  source: "emicron",
  label: "7627474-1-1",
  redactResult: true,
  run: async (observer) => {
    observer.llmCall({ kind: "agent", iteration: 1, model: "grok-4.7", latencyMs: 5, usage });
    observer.toolCall({ tool: "getMonthlyStatement", args: { businessId: "7627474-1-1" }, durationMs: 2, result: { ok: true, data: { salesLastMonth: 4300000 } } });
    return { priority: "MEDIUM", diagnosis: "ventas de 4300000" };
  },
  resultForLog: (value) => value,
  summarize: (value) => `Prioridad ${value.priority}`,
  validate: (outcome, recorder) => [
    { name: "Terminó sin error", passed: outcome.status === "success" },
    { name: "Usó getMonthlyStatement", passed: recorder.toolCalls.some((c) => c.tool === "getMonthlyStatement") },
  ],
};

const failingCase: ExecutionCase<unknown> = {
  id: "E02",
  title: "Caso que lanza un error esperado",
  source: "invoice",
  label: "paisaje.png",
  run: async () => {
    throw Object.assign(new Error("Es un paisaje"), { code: "NOT_AN_INVOICE" });
  },
  validate: (outcome) => [
    { name: "Falla controlada con NOT_AN_INVOICE", passed: outcome.status === "error" && outcome.error.code === "NOT_AN_INVOICE" },
  ],
};

const unexpectedCase: ExecutionCase<unknown> = {
  id: "E03",
  title: "Caso que no cumple su validación",
  source: "json",
  label: "quiebra.json",
  run: async () => ({ priority: "LOW" }),
  validate: () => [{ name: "Prioridad HIGH o CRITICAL", passed: false, detail: "fue LOW" }],
};

describe("runExecutionPlan", () => {
  it("debe correr todos los casos, aunque alguno falle, y validar cada uno", async () => {
    const log = new MemoryLog();

    const reports = await runExecutionPlan([okCase, failingCase, unexpectedCase], { log, runIdPrefix: "s2-test" });

    expect(reports.map((r) => [r.id, r.status, r.passed])).toEqual([
      ["E01", "success", true],
      ["E02", "error", true],
      ["E03", "success", false],
    ]);
    expect(reports[0]).toMatchObject({
      runId: "s2-test-E01",
      summary: "Prioridad MEDIUM",
      toolCalls: [{ tool: "getMonthlyStatement", ok: true }],
      totals: { llmCalls: 1, totalTokens: 1100, costUsd: 0.005 },
    });
    expect(reports[1].error).toEqual({ code: "NOT_AN_INVOICE", message: "Es un paisaje" });
    expect(log.events.filter((e) => e.type === "run_validated")).toHaveLength(3);
  });

  it("debe pasarle a cada caso su runId", async () => {
    const seen: string[] = [];
    const contextCase: ExecutionCase<unknown> = {
      id: "E09",
      title: "Caso que usa el runId",
      source: "goal",
      label: "objetivo",
      run: async (_observer, context) => {
        seen.push(context.runId);
        return {};
      },
      validate: () => [],
    };

    await runExecutionPlan([contextCase], { log: new MemoryLog(), runIdPrefix: "s3-test" });

    expect(seen).toEqual(["s3-test-E09"]);
  });

  it("no debe dejar cifras de microdatos EMICRON en la bitácora", async () => {
    const log = new MemoryLog();

    await runExecutionPlan([okCase], { log, runIdPrefix: "s2-test" });

    expect(JSON.stringify(log.events)).not.toContain("4300000");
  });
});

describe("renderExecutionReport", () => {
  it("debe resumir casos, validaciones, herramientas, tokens y costo", async () => {
    const reports = await runExecutionPlan([okCase, failingCase, unexpectedCase], { log: new MemoryLog(), runIdPrefix: "s2-test" });

    const markdown = renderExecutionReport(reports, { title: "Bitácora S2", generatedAt: "2026-10-23T12:00:00.000Z" });

    expect(markdown).toContain("# Bitácora S2");
    expect(markdown).toContain("**2/3 ejecuciones validadas**");
    expect(markdown).toContain("| E01 | Caso que funciona | emicron | ✅ success | ✅ 2/2 | getMonthlyStatement | 1,100 | $0.005000 |");
    expect(markdown).toContain("| E02 | Caso que lanza un error esperado | invoice | ⚠️ NOT_AN_INVOICE | ✅ 1/1 | — | 0 | $0.000000 |");
    expect(markdown).toContain("❌ Prioridad HIGH o CRITICAL — fue LOW");
    expect(markdown).toContain("Costo total: **$0.005000 USD**");
  });
});

describe("Resultados y fallos por caso", () => {
  const recoveringCase: ExecutionCase<unknown> = {
    id: "E04",
    title: "Caso que se recupera de un error de herramienta",
    source: "emicron",
    label: "7638460-1-1",
    redactResult: true,
    run: async (observer) => {
      observer.toolCall({ tool: "compareWithSectorPeers", args: { scope: "department" }, durationMs: 1, result: { ok: false, error: { code: "INSUFFICIENT_PEERS", message: "pocos" } } });
      observer.toolCall({ tool: "compareWithSectorPeers", args: { scope: "national" }, durationMs: 1, result: { ok: true, data: {} } });
      return { priority: "HIGH" };
    },
    validate: () => [{ name: "Se recuperó con scope national", passed: true }],
  };

  it("debe listar cada caso con su resultado, sus fallos y si el agente se recuperó", async () => {
    const reports = await runExecutionPlan([okCase, failingCase, unexpectedCase, recoveringCase], { log: new MemoryLog(), runIdPrefix: "s4-test" });

    const markdown = renderExecutionReport(reports, { title: "Bitácora", generatedAt: "2026-11-03T12:00:00.000Z" });

    expect(markdown).toContain("## Resultados y fallos por caso");
    expect(markdown).toContain("Casos con algún fallo: **3/4** · Errores de herramientas: **1** (1 recuperado dentro del mismo caso) · Validaciones fallidas: **1** · Ejecuciones que terminaron en error: **1**");
    expect(markdown).toContain("| E01 | ✅ Acierto | — |");
    expect(markdown).toContain("| E02 | ✅ Acierto | Error de la ejecución `NOT_AN_INVOICE` (esperado por el caso) |");
    expect(markdown).toContain("| E03 | ❌ Fallo | Validación fallida: Prioridad HIGH o CRITICAL — fue LOW |");
    expect(markdown).toContain("| E04 | ✅ Acierto | `compareWithSectorPeers` ✗INSUFFICIENT_PEERS → recuperado |");
  });
});
