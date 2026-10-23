import { FinancialSummary, FinancialRecommendation, Transaction } from "../domain/entities/Financial.js";
import { AgentToolset } from "./AgentToolPort.js";

export interface LLMAgentPort {
  // Sin toolset, el agente usa las herramientas sobre las transacciones recibidas
  evaluateFinancialStatus(
    summary: FinancialSummary,
    recentTransactions: Transaction[],
    toolset?: AgentToolset
  ): Promise<FinancialRecommendation>;
}
