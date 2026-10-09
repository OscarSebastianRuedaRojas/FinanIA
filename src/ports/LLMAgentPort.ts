import { FinancialSummary, FinancialRecommendation, Transaction } from "../domain/entities/Financial.js";

export interface LLMAgentPort {
  evaluateFinancialStatus(
    summary: FinancialSummary,
    recentTransactions: Transaction[]
  ): Promise<FinancialRecommendation>;
}

