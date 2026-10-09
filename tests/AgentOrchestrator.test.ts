import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "../src/application/AgentOrchestrator.js";
import { InMemoryFinancialAdapter } from "../src/adapters/repository/InMemoryFinancialAdapter.js";
import { AutonomousDecisionAdapter } from "../src/adapters/llm/AutonomousDecisionAdapter.js";

describe("AgentOrchestrator", () => {
  it("debe ejecutar el ciclo autónomo y retornar un resumen y recomendación válidos", async () => {
    const repository = new InMemoryFinancialAdapter();
    const llmAdapter = new AutonomousDecisionAdapter();
    const orchestrator = new AgentOrchestrator(repository, llmAdapter);

    const result = await orchestrator.runAutonomousCycle();

    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("recommendation");
    expect(result.summary.totalIncome).toBeGreaterThan(0);
    expect(result.recommendation.title).toBeDefined();
    expect(Array.isArray(result.recommendation.actionPlan)).toBe(true);
  });
});
