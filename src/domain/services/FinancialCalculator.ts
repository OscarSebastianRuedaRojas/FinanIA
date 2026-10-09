import { Transaction, FinancialSummary } from "../entities/Financial.js";

export class FinancialCalculator {
  static calculateSummary(transactions: Transaction[]): FinancialSummary {
    const totalIncome = transactions
      .filter((t) => t.type === "INCOME")
      .reduce((acc, t) => acc + t.amount, 0);

    const totalExpenses = transactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((acc, t) => acc + t.amount, 0);

    const netProfit = totalIncome - totalExpenses;
    
    // Ratios y porcentajes precalculados (Evita que el LLM haga matemáticas)
    const expenseRatio = totalIncome > 0 ? Number(((totalExpenses / totalIncome) * 100).toFixed(2)) : 100;
    const profitMargin = totalIncome > 0 ? Number(((netProfit / totalIncome) * 100).toFixed(2)) : 0;

    // Desglose de egresos por categoría
    const expensesByCategory: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "EXPENSE")
      .forEach((t) => {
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
      });

    // Categoría de mayor gasto
    let topExpenseCategory = "N/A";
    let maxExpense = 0;
    for (const [cat, amt] of Object.entries(expensesByCategory)) {
      if (amt > maxExpense) {
        maxExpense = amt;
        topExpenseCategory = `${cat} ($${amt})`;
      }
    }

    // Determinación del nivel de riesgo por código
    let cashFlowRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (netProfit < 0 || expenseRatio > 90) {
      cashFlowRisk = "HIGH";
    } else if (expenseRatio > 75) {
      cashFlowRisk = "MEDIUM";
    }

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      expenseRatio,
      profitMargin,
      cashFlowRisk,
      recentTransactionsCount: transactions.length,
      topExpenseCategory,
      expensesByCategory,
    };
  }
}
