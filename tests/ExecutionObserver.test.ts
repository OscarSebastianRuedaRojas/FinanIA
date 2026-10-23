import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GrokLLMAdapter, ChatCompletionsClient } from "../src/adapters/llm/GrokLLMAdapter.js";
import { GrokVisionAdapter } from "../src/adapters/llm/GrokVisionAdapter.js";
import { ExecutionRecorder } from "../src/application/ExecutionRecorder.js";
import { ExecutionEvent, ExecutionLogPort } from "../src/ports/ExecutionLogPort.js";
import { FinancialCalculator } from "../src/domain/services/FinancialCalculator.js";
import { Transaction } from "../src/domain/entities/Financial.js";

class MemoryLog implements ExecutionLogPort {
  events: ExecutionEvent[] = [];
  record(event: ExecutionEvent): void {
    this.events.push(event);
  }
}

const usage = { prompt_tokens: 500, completion_tokens: 50, cost_in_usd_ticks: 20000000 };

function client(messages: any[]): ChatCompletionsClient {
  let call = 0;
  return {
    chat: {
      completions: {
        create: async () =>
          ({ model: "grok-4.7", choices: [{ message: messages[Math.min(call++, messages.length - 1)] }], usage }) as any,
      },
    },
  };
}

const transactions: Transaction[] = [
  { id: "1", amount: 5000, type: "INCOME", category: "Ventas", description: "Cobro", date: "2026-10-01" },
  { id: "2", amount: 2000, type: "EXPENSE", category: "Proveedores", description: "Insumos", date: "2026-10-02" },
];

const dictamen = JSON.stringify({ title: "D", priority: "LOW", diagnosis: "ok", actionPlan: ["a"], estimatedImpact: "e" });

describe("Observador de ejecución en los adaptadores de Grok", () => {
  it("GrokLLMAdapter debe informar cada llamada al LLM y cada herramienta con su resultado", async () => {
    const log = new MemoryLog();
    const recorder = new ExecutionRecorder(log, { runId: "r1", source: "json", label: "caso" });
    const adapter = new GrokLLMAdapter({
      observer: recorder,
      client: client([
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "c1", type: "function", function: { name: "detectAnomalies", arguments: "{}" } },
            { id: "c2", type: "function", function: { name: "noExiste", arguments: "{}" } },
          ],
        },
        { role: "assistant", content: dictamen },
      ]),
    });

    recorder.start();
    await adapter.evaluateFinancialStatus(FinancialCalculator.calculateSummary(transactions), transactions);
    const totals = recorder.finish({ status: "success" });

    expect(log.events.map((e) => e.type)).toEqual([
      "run_started",
      "llm_call",
      "tool_call",
      "tool_call",
      "llm_call",
      "run_finished",
    ]);
    expect(log.events[1]).toMatchObject({ kind: "agent", iteration: 1, toolCallsRequested: ["detectAnomalies", "noExiste"] });
    expect(log.events[3]).toMatchObject({ tool: "noExiste", ok: false, errorCode: "UNKNOWN_TOOL" });
    expect(totals).toMatchObject({ llmCalls: 2, toolCalls: 2, toolErrors: 1, totalTokens: 1100, costUsd: 0.004 });
  });

  it("GrokVisionAdapter debe informar cada intento, incluido el reintento correctivo", async () => {
    const log = new MemoryLog();
    const recorder = new ExecutionRecorder(log, { runId: "r2", source: "invoice", label: "factura" });
    const extraction = {
      vendorName: "X",
      date: "2026-09-14",
      currency: "COP",
      totalAmount: 100,
      category: "Proveedores",
      type: "EXPENSE",
    };
    const adapter = new GrokVisionAdapter({
      observer: recorder,
      client: client([
        { role: "assistant", content: JSON.stringify({ ...extraction, date: "14/09/2026" }) },
        { role: "assistant", content: JSON.stringify(extraction) },
      ]),
    });
    const data = fs.readFileSync(path.resolve(__dirname, "fixtures", "invoices", "factura_sintetica.png"));

    await adapter.scan({ data, mimeType: "image/png" });

    const calls = log.events.filter((e) => e.type === "llm_call");
    expect(calls).toHaveLength(2);
    expect(calls.map((c: any) => [c.kind, c.iteration, c.costUsd])).toEqual([
      ["vision", 1, 0.002],
      ["vision", 2, 0.002],
    ]);
  });
});
