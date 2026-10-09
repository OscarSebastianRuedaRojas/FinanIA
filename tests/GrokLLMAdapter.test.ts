import { describe, it, expect } from "vitest";
import "dotenv/config";
import { GrokLLMAdapter } from "../src/adapters/llm/GrokLLMAdapter.js";
import { FinancialSummary, Transaction } from "../src/domain/entities/Financial.js";

describe("GrokLLMAdapter Integration Test", () => {
  it("debe evaluar el estado financiero y devolver una recomendación parseada correctamente", async () => {
    if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === "pk_placeholder") {
      console.warn("Saltando prueba de GrokLLMAdapter por falta de API_KEY válida");
      return;
    }

    const adapter = new GrokLLMAdapter();

    const summary: FinancialSummary = {
      totalIncome: 5000,
      totalExpenses: 6200,
      netProfit: -1200,
      expenseRatio: 124,
      profitMargin: -24,
      cashFlowRisk: "HIGH",
      recentTransactionsCount: 2,
      topExpenseCategory: "Proveedores ($6200)",
      expensesByCategory: { Proveedores: 6200 },
    };

    const transactions: Transaction[] = [
      {
        id: "tx-1",
        amount: 5000,
        type: "INCOME",
        category: "Ventas",
        description: "Cobro cliente principal",
        date: "2026-10-01",
      },
      {
        id: "tx-2",
        amount: 6200,
        type: "EXPENSE",
        category: "Proveedores",
        description: "Pago insumos de producción",
        date: "2026-10-02",
      },
    ];

    const recommendation = await adapter.evaluateFinancialStatus(summary, transactions);

    expect(recommendation).toHaveProperty("title");
    expect(recommendation).toHaveProperty("diagnosis");
    expect(recommendation.priority).toMatch(/CRITICAL|HIGH|MEDIUM|LOW/);
    expect(recommendation.actionPlan.length).toBeGreaterThan(0);
  }, 30000);
});
