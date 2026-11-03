import { describe, it, expect, vi } from "vitest";
import { GrokLLMAdapter, ChatCompletionsClient } from "../src/adapters/llm/GrokLLMAdapter.js";
import { FinancialCalculator } from "../src/domain/services/FinancialCalculator.js";
import { Transaction } from "../src/domain/entities/Financial.js";

const transactions: Transaction[] = [
  { id: "1", amount: 5000, type: "INCOME", category: "Ventas", description: "Cobro", date: "2026-10-01" },
  { id: "2", amount: 2000, type: "EXPENSE", category: "Proveedores", description: "Insumos", date: "2026-10-02" },
];

const forcedAnswer = JSON.stringify({
  title: "Dictamen tras límite de iteraciones",
  priority: "LOW",
  diagnosis: "Cierre forzado con la información recolectada",
  actionPlan: ["Mantener reservas"],
  estimatedImpact: "Estable",
});

// Un modelo que nunca deja de pedir herramientas mientras se le permita
function toolHungryClient() {
  const requests: any[] = [];
  const client: ChatCompletionsClient = {
    chat: {
      completions: {
        create: async (params: any) => {
          requests.push(JSON.parse(JSON.stringify(params)));
          const message =
            params.tool_choice === "none"
              ? { role: "assistant", content: forcedAnswer }
              : {
                  role: "assistant",
                  content: null,
                  tool_calls: [{ id: `c${requests.length}`, type: "function", function: { name: "detectAnomalies", arguments: "{}" } }],
                };
          return { choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } } as any;
        },
      },
    },
  };
  return { client, requests };
}

describe("GrokLLMAdapter — agotamiento del loop (S1)", () => {
  it("debe forzar un cierre explícito sin herramientas al agotar las iteraciones", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, requests } = toolHungryClient();

    const recommendation = await new GrokLLMAdapter({ client }).evaluateFinancialStatus(
      FinancialCalculator.calculateSummary(transactions),
      transactions
    );

    expect(requests).toHaveLength(6);
    expect(requests.slice(0, 5).every((r) => r.tool_choice === "auto")).toBe(true);
    expect(requests[5].tool_choice).toBe("none");
    expect(requests[5].messages.at(-1)).toMatchObject({ role: "user" });
    expect(requests[5].messages.at(-1).content).toContain("límite de iteraciones");
    expect(recommendation.title).toBe("Dictamen tras límite de iteraciones");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("límite de 5 iteraciones"));
    warn.mockRestore();
  });

  it("no debe hacer la llamada extra cuando el modelo responde a tiempo", async () => {
    const requests: any[] = [];
    const client: ChatCompletionsClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            requests.push(params);
            return { choices: [{ message: { role: "assistant", content: forcedAnswer } }] } as any;
          },
        },
      },
    };

    await new GrokLLMAdapter({ client }).evaluateFinancialStatus(FinancialCalculator.calculateSummary(transactions), transactions);

    expect(requests).toHaveLength(1);
  });
});
