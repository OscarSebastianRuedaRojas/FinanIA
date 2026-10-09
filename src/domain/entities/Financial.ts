import { z } from "zod";

export const TransactionSchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string(),
  description: z.string(),
  date: z.string(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export const FinancialSummarySchema = z.object({
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netProfit: z.number(),
  expenseRatio: z.number(),
  profitMargin: z.number(),
  cashFlowRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  recentTransactionsCount: z.number(),
  topExpenseCategory: z.string(),
  expensesByCategory: z.record(z.string(), z.number()),
});

export type FinancialSummary = z.infer<typeof FinancialSummarySchema>;

export const TelemetrySchema = z.object({
  executionTimeMs: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  model: z.string(),
});

export type Telemetry = z.infer<typeof TelemetrySchema>;

export const FinancialRecommendationSchema = z.object({
  title: z.string(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  diagnosis: z.string(),
  actionPlan: z.array(z.string()),
  estimatedImpact: z.string(),
  telemetry: TelemetrySchema.optional(),
});

export type FinancialRecommendation = z.infer<typeof FinancialRecommendationSchema>;
