import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GrokLLMAdapter, ChatCompletionsClient } from "../src/adapters/llm/GrokLLMAdapter.js";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { SqliteMicroBusinessAdapter } from "../src/adapters/repository/SqliteMicroBusinessAdapter.js";
import { createMonthlyTools } from "../src/application/tools/monthlyTools.js";
import { FinancialCalculator } from "../src/domain/services/FinancialCalculator.js";
import { Transaction } from "../src/domain/entities/Financial.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

const transactions: Transaction[] = [
  { id: "tx-1", amount: 5000, type: "INCOME", category: "Ventas", description: "Cobro", date: "2026-10-01" },
  { id: "tx-2", amount: 2000, type: "EXPENSE", category: "Proveedores", description: "Insumos", date: "2026-10-02" },
];

const finalAnswer = JSON.stringify({
  title: "Dictamen",
  priority: "LOW",
  diagnosis: "Operación sana",
  actionPlan: ["Mantener reservas"],
  estimatedImpact: "Estable",
});

// Cliente falso: primero pide herramientas, luego entrega el dictamen. Guarda copia de cada request.
function scriptedClient(toolCalls: { name: string; arguments: string }[]) {
  const requests: any[] = [];
  const client: ChatCompletionsClient = {
    chat: {
      completions: {
        create: async (params: any) => {
          requests.push(JSON.parse(JSON.stringify(params)));
          const message =
            requests.length === 1
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: toolCalls.map((call, idx) => ({
                    id: `call-${idx}`,
                    type: "function",
                    function: call,
                  })),
                }
              : { role: "assistant", content: finalAnswer };
          return { choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } } as any;
        },
      },
    },
  };
  return { client, requests };
}

function toolMessages(request: any): any[] {
  return request.messages.filter((m: any) => m.role === "tool").map((m: any) => JSON.parse(m.content));
}

describe("GrokLLMAdapter — loop ReAct con herramientas", () => {
  let tmpDir: string;
  let dbPath: string;
  let port: SqliteMicroBusinessAdapter;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emicron-loop-"));
    dbPath = path.join(tmpDir, "emicron.sqlite");
    ingestEmicron(fixturesDir, dbPath);
    port = new SqliteMicroBusinessAdapter(dbPath);
  });

  afterAll(() => {
    port.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe ofrecer las cinco herramientas semanales cuando no se indica toolset", async () => {
    const { client, requests } = scriptedClient([{ name: "getWeeklyCashFlowAndAlerts", arguments: "{}" }]);
    const adapter = new GrokLLMAdapter({ client });

    const recommendation = await adapter.evaluateFinancialStatus(FinancialCalculator.calculateSummary(transactions), transactions);

    expect(requests[0].tools.map((t: any) => t.function.name)).toEqual([
      "getWeeklyCashFlowAndAlerts",
      "getMonthlyDiagnosticAndTrend",
      "getCategoryBreakdown",
      "compareToPreviousPeriod",
      "detectAnomalies",
    ]);
    expect(toolMessages(requests[1])).toEqual([
      { ok: true, data: FinancialCalculator.getWeeklyCashFlowAndAlerts(transactions) },
    ]);
    expect(recommendation.title).toBe("Dictamen");
  });

  it("debe devolverle al LLM los errores de herramienta en lugar de cortar la auditoría", async () => {
    const { client, requests } = scriptedClient([
      { name: "herramientaInexistente", arguments: "{}" },
      { name: "getMonthlyStatement", arguments: "{no es json" },
      { name: "getMonthlyStatement", arguments: JSON.stringify({ businessId: "999-1-1" }) },
      { name: "getMonthlyStatement", arguments: JSON.stringify({ businessId: "100-1-1" }) },
    ]);
    const adapter = new GrokLLMAdapter({ client });
    const toolset = {
      tools: createMonthlyTools(port),
      context: "Micronegocio real 100-1-1 (DANE EMICRON).",
    };

    const recommendation = await adapter.evaluateFinancialStatus(
      FinancialCalculator.calculateSummary(transactions),
      transactions,
      toolset
    );

    expect(requests[0].tools.map((t: any) => t.function.name)).toEqual([
      "getMonthlyStatement",
      "compareWithSectorPeers",
      "getYearOverYearSales",
    ]);
    expect(requests[0].messages[1].content).toContain("Micronegocio real 100-1-1 (DANE EMICRON).");
    const results = toolMessages(requests[1]);
    expect(results.map((r) => (r.ok ? "OK" : r.error.code))).toEqual([
      "UNKNOWN_TOOL",
      "INVALID_ARGUMENTS",
      "BUSINESS_NOT_FOUND",
      "OK",
    ]);
    expect(results[3].data.salesLastMonth).toBe(1000000);
    expect(recommendation.priority).toBe("LOW");
  });
});
