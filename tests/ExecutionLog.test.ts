import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonlExecutionLog } from "../src/infrastructure/logging/JsonlExecutionLog.js";
import { ExecutionRecorder } from "../src/application/ExecutionRecorder.js";
import { ExecutionEvent, ExecutionLogPort } from "../src/ports/ExecutionLogPort.js";

class MemoryLog implements ExecutionLogPort {
  events: ExecutionEvent[] = [];
  record(event: ExecutionEvent): void {
    this.events.push(event);
  }
}

// Reloj que avanza 100 ms en cada lectura
function steppingClock(start = Date.parse("2026-10-23T12:00:00Z")) {
  let t = start;
  return () => {
    const now = new Date(t);
    t += 100;
    return now;
  };
}

const usage = {
  prompt_tokens: 1000,
  completion_tokens: 200,
  prompt_tokens_details: { cached_tokens: 400 },
  completion_tokens_details: { reasoning_tokens: 150 },
  cost_in_usd_ticks: 37756000,
};

describe("JsonlExecutionLog", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "exec-log-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe crear la carpeta y agregar un evento JSON por línea", () => {
    const file = path.join(tmpDir, "nested", "executions.jsonl");
    const log = new JsonlExecutionLog(file);

    log.record({ type: "run_started", runId: "r1", timestamp: "2026-10-23T12:00:00.000Z", source: "json", label: "a" });
    log.record({ type: "run_started", runId: "r2", timestamp: "2026-10-23T12:00:01.000Z", source: "json", label: "b" });

    const lines = fs.readFileSync(file, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.map((l) => l.runId)).toEqual(["r1", "r2"]);
  });

  it("S3 no debe interrumpir la ejecución si no puede escribir", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = new JsonlExecutionLog(tmpDir); // una carpeta no se puede usar como archivo

    expect(() =>
      log.record({ type: "run_started", runId: "r1", timestamp: "t", source: "json", label: "a" })
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("ExecutionRecorder", () => {
  it("S1 debe registrar llamadas al LLM con tokens y costo en USD desde los ticks", () => {
    const log = new MemoryLog();
    const recorder = new ExecutionRecorder(log, { runId: "r1", source: "json", label: "quiebra" }, steppingClock());

    recorder.start();
    recorder.llmCall({ kind: "agent", iteration: 1, model: "grok-4.7", latencyMs: 1234, usage, toolCallsRequested: ["detectAnomalies"] });

    expect(log.events[1]).toEqual({
      type: "llm_call",
      runId: "r1",
      timestamp: "2026-10-23T12:00:00.100Z",
      kind: "agent",
      iteration: 1,
      model: "grok-4.7",
      latencyMs: 1234,
      promptTokens: 1000,
      completionTokens: 200,
      reasoningTokens: 150,
      cachedTokens: 400,
      costUsd: 0.0037756,
      toolCallsRequested: ["detectAnomalies"],
    });
  });

  it("S1 debe registrar herramientas con su resultado y acumular totales al cerrar", () => {
    const log = new MemoryLog();
    const recorder = new ExecutionRecorder(log, { runId: "r1", source: "emicron", label: "7627474-1-1" }, steppingClock());

    recorder.start();
    recorder.llmCall({ kind: "agent", iteration: 1, model: "grok-4.7", latencyMs: 10, usage });
    recorder.toolCall({ tool: "compareWithSectorPeers", args: { businessId: "x" }, durationMs: 5, result: { ok: false, error: { code: "INSUFFICIENT_PEERS", message: "pocos" } } });
    recorder.toolCall({ tool: "compareWithSectorPeers", args: { businessId: "x", scope: "national" }, durationMs: 7, result: { ok: true, data: {} } });
    recorder.llmCall({ kind: "agent", iteration: 2, model: "grok-4.7", latencyMs: 10, usage });
    recorder.finish({ status: "success", result: { priority: "LOW" } });

    expect(log.events[2]).toMatchObject({ type: "tool_call", tool: "compareWithSectorPeers", ok: false, errorCode: "INSUFFICIENT_PEERS", durationMs: 5 });
    expect(log.events.at(-1)).toEqual({
      type: "run_finished",
      runId: "r1",
      timestamp: "2026-10-23T12:00:00.500Z",
      source: "emicron",
      label: "7627474-1-1",
      status: "success",
      durationMs: 500,
      totals: {
        llmCalls: 2,
        promptTokens: 2000,
        completionTokens: 400,
        reasoningTokens: 300,
        totalTokens: 2400,
        costUsd: 0.0075512,
        toolCalls: 2,
        toolErrors: 1,
      },
      result: { priority: "LOW" },
    });
    expect(recorder.toolCalls.map((c) => c.errorCode ?? "OK")).toEqual(["INSUFFICIENT_PEERS", "OK"]);
  });

  it("S4 debe omitir resultados y payloads cuando la corrida usa microdatos del DANE", () => {
    const log = new MemoryLog();
    const recorder = new ExecutionRecorder(
      log,
      { runId: "r1", source: "emicron", label: "7627474-1-1", redactResult: true },
      steppingClock()
    );

    recorder.start();
    recorder.toolCall({ tool: "getMonthlyStatement", args: { businessId: "7627474-1-1" }, durationMs: 3, result: { ok: true, data: { salesLastMonth: 4300000 } } });
    recorder.finish({
      status: "success",
      result: { title: "Dictamen", priority: "MEDIUM", diagnosis: "ventas de $4.300.000", actionPlan: ["a", "b"] },
    });

    const serialized = JSON.stringify(log.events);
    expect(serialized).not.toContain("4300000");
    expect(serialized).not.toContain("4.300.000");
    expect(log.events.at(-1)).toMatchObject({ result: { priority: "MEDIUM", actionPlanItems: 2, redacted: true } });
  });

  it("debe registrar errores y validaciones de la corrida", () => {
    const log = new MemoryLog();
    const recorder = new ExecutionRecorder(log, { runId: "r1", source: "invoice", label: "foto.png" }, steppingClock());

    recorder.start();
    recorder.finish({ status: "error", error: { code: "NOT_AN_INVOICE", message: "Es un paisaje" } });
    recorder.validate([
      { name: "Falla controlada con NOT_AN_INVOICE", passed: true },
      { name: "Sin escritura en el dataset", passed: false, detail: "cambió" },
    ]);

    expect(log.events[1]).toMatchObject({ status: "error", error: { code: "NOT_AN_INVOICE", message: "Es un paisaje" } });
    expect(log.events[2]).toMatchObject({
      type: "run_validated",
      passed: false,
      checks: [
        { name: "Falla controlada con NOT_AN_INVOICE", passed: true },
        { name: "Sin escritura en el dataset", passed: false, detail: "cambió" },
      ],
    });
  });
});
