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

  static getCategoryBreakdown(transactions: Transaction[]) {
    const totalIncome = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);

    const incomeByCategory: Record<string, { total: number; percentage: number }> = {};
    const expenseByCategory: Record<string, { total: number; percentage: number }> = {};

    transactions.forEach((t) => {
      const target = t.type === "INCOME" ? incomeByCategory : expenseByCategory;
      const grandTotal = t.type === "INCOME" ? totalIncome : totalExpense;
      const current = target[t.category]?.total || 0;
      const nextTotal = current + t.amount;
      target[t.category] = {
        total: nextTotal,
        percentage: grandTotal > 0 ? Number(((nextTotal / grandTotal) * 100).toFixed(2)) : 0,
      };
    });

    return {
      incomeBreakdown: incomeByCategory,
      expenseBreakdown: expenseByCategory,
    };
  }

  static compareToPreviousPeriod(transactions: Transaction[]) {
    if (transactions.length === 0) {
      return { message: "Sin transacciones para comparar." };
    }

    // Sort by date ascending
    const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const latestTime = new Date(sorted[sorted.length - 1].date).getTime();

    // Ventana fija de calendario de 7 días (1 semana)
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const currentPeriodStart = latestTime - SEVEN_DAYS_MS;
    const previousPeriodStart = currentPeriodStart - SEVEN_DAYS_MS;

    const currentPeriod = sorted.filter((t) => new Date(t.date).getTime() >= currentPeriodStart);
    const previousPeriod = sorted.filter((t) => {
      const time = new Date(t.date).getTime();
      return time >= previousPeriodStart && time < currentPeriodStart;
    });

    if (previousPeriod.length === 0) {
      const currentSummary = this.calculateSummary(currentPeriod);
      return {
        periodicity: "Ventana fija de 1 semana (7 días)",
        message: "Todas las transacciones registradas corresponden a la semana actual en curso. No existen transacciones registradas en la semana previa.",
        currentWeek: {
          startDate: new Date(currentPeriodStart).toISOString().split("T")[0],
          endDate: new Date(latestTime).toISOString().split("T")[0],
          transactionsCount: currentPeriod.length,
          income: currentSummary.totalIncome,
          expenses: currentSummary.totalExpenses,
          netProfit: currentSummary.netProfit,
        },
      };
    }

    const prevSummary = this.calculateSummary(previousPeriod);
    const currSummary = this.calculateSummary(currentPeriod);

    const incomeGrowth = prevSummary.totalIncome > 0
      ? Number((((currSummary.totalIncome - prevSummary.totalIncome) / prevSummary.totalIncome) * 100).toFixed(2))
      : 0;

    const expenseGrowth = prevSummary.totalExpenses > 0
      ? Number((((currSummary.totalExpenses - prevSummary.totalExpenses) / prevSummary.totalExpenses) * 100).toFixed(2))
      : 0;

    return {
      periodicity: "Ventana fija de 1 semana (7 días)",
      previousWeek: {
        count: previousPeriod.length,
        income: prevSummary.totalIncome,
        expenses: prevSummary.totalExpenses,
        netProfit: prevSummary.netProfit,
      },
      currentWeek: {
        count: currentPeriod.length,
        income: currSummary.totalIncome,
        expenses: currSummary.totalExpenses,
        netProfit: currSummary.netProfit,
      },
      analysis: {
        incomeGrowthPercentage: incomeGrowth,
        expenseGrowthPercentage: expenseGrowth,
        trend: currSummary.netProfit >= prevSummary.netProfit ? "MEJORANDO" : "DETERIORANDO",
      },
    };
  }

  static detectAnomalies(transactions: Transaction[]) {
    const expenses = transactions.filter((t) => t.type === "EXPENSE");
    if (expenses.length === 0) return { anomalies: [] };

    const avgExpense = expenses.reduce((acc, t) => acc + t.amount, 0) / expenses.length;
    const threshold = avgExpense * 2.2; // Gasto inusualmente alto (2.2x el promedio)

    const highValueAnomalies = expenses.filter((t) => t.amount > threshold);

    return {
      averageExpense: Number(avgExpense.toFixed(2)),
      anomalyThreshold: Number(threshold.toFixed(2)),
      detectedAnomaliesCount: highValueAnomalies.length,
      anomalies: highValueAnomalies.map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        category: t.category,
        date: t.date,
        reason: `Monto superior al umbral de gasto promedio ($${t.amount} vs promedio $${avgExpense.toFixed(2)})`,
      })),
    };
  }

  static getWeeklyCashFlowAndAlerts(transactions: Transaction[]) {
    if (transactions.length === 0) {
      return { message: "Sin transacciones para evaluación semanal." };
    }

    const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const latestTime = new Date(sorted[sorted.length - 1].date).getTime();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const weekStart = latestTime - SEVEN_DAYS_MS;

    const weeklyTransactions = sorted.filter((t) => new Date(t.date).getTime() >= weekStart);

    const weeklyIncome = weeklyTransactions.filter((t) => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
    const weeklyExpenses = weeklyTransactions.filter((t) => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);
    const weeklyNetFlow = weeklyIncome - weeklyExpenses;

    // Proyección de saldo neto a 4 semanas basada en el flujo semanal actual
    const projectedBalance4Weeks = weeklyNetFlow * 4;

    // Gastos fuera de patrón en la semana (anomalías)
    const anomalies = FinancialCalculator.detectAnomalies(weeklyTransactions);

    return {
      scope: "Semanal (Caja y Alertas)",
      period: {
        startDate: new Date(weekStart).toISOString().split("T")[0],
        endDate: new Date(latestTime).toISOString().split("T")[0],
        weeklyTransactionsCount: weeklyTransactions.length,
      },
      cashFlow: {
        weeklyIncome,
        weeklyExpenses,
        weeklyNetFlow,
        projectedBalance4Weeks,
      },
      outOfPatternExpenses: anomalies,
    };
  }

  static getMonthlyDiagnosticAndTrend(transactions: Transaction[]) {
    const summary = FinancialCalculator.calculateSummary(transactions);
    const categoryBreakdown = FinancialCalculator.getCategoryBreakdown(transactions);
    const periodComparison = FinancialCalculator.compareToPreviousPeriod(transactions);

    return {
      scope: "Mensual / Consolidado (Diagnóstico y Tendencia)",
      financialMetrics: {
        totalIncome: summary.totalIncome,
        totalExpenses: summary.totalExpenses,
        netProfit: summary.netProfit,
        profitMarginPercentage: summary.profitMargin,
        expenseRatioPercentage: summary.expenseRatio,
        cashFlowRiskLevel: summary.cashFlowRisk,
      },
      criticalCategories: {
        topExpenseCategory: summary.topExpenseCategory,
        breakdown: categoryBreakdown,
      },
      trendAndComparison: periodComparison,
    };
  }
}


