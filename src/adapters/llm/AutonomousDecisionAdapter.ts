import { LLMAgentPort } from "../../ports/LLMAgentPort.js";
import {
  FinancialSummary,
  FinancialRecommendation,
  Transaction,
} from "../../domain/entities/Financial.js";

export class AutonomousDecisionAdapter implements LLMAgentPort {
  async evaluateFinancialStatus(
    summary: FinancialSummary,
    recentTransactions: Transaction[]
  ): Promise<FinancialRecommendation> {
    let priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let diagnosis = "";
    const actionPlan: string[] = [];
    let estimatedImpact = "";

    if (summary.netProfit < 0) {
      priority = "CRITICAL";
      diagnosis = `La PyME operó en pérdida en este periodo. Los gastos ($${summary.totalExpenses}) superaron los ingresos ($${summary.totalIncome}) por $${Math.abs(summary.netProfit)}. Categoría crítica: ${summary.topExpenseCategory}.`;
      actionPlan.push("Renegociar o posponer pagos a proveedores no esenciales.");
      actionPlan.push("Lanzar promoción de liquidez rápida sobre inventario de rotación lenta.");
      actionPlan.push("Revisar costos fijos como servicios e insumos inmediatos.");
      estimatedImpact = "Recuperar flujo de caja positivo en los próximos 7 días.";
    } else if (summary.expenseRatio > 80) {
      priority = "HIGH";
      diagnosis = `Margen de ganancia estrecho (${summary.profitMargin}%). Los gastos consumen el ${summary.expenseRatio}% de los ingresos totales ($${summary.netProfit} de beneficio neto).`;
      actionPlan.push("Auditar categorías de mayor costo (ej. Proveedores/Servicios).");
      actionPlan.push("Establecer un tope máximo de egresos diarios.");
      estimatedImpact = "Aumentar margen neto entre 10% y 15%.";
    } else {
      priority = "MEDIUM";
      diagnosis = `Salud financiera estable con flujo de caja positivo ($${summary.netProfit} libres).`;
      actionPlan.push("Crear un fondo de reserva de emergencia (mínimo 15 días de operación).");
      estimatedImpact = "Fortalecer la estabilidad de la PyME ante contingencias.";
    }

    return {
      title: `Dictamen de Auditoría Financiera - Riesgo ${summary.cashFlowRisk}`,
      priority,
      diagnosis,
      actionPlan,
      estimatedImpact,
      telemetry: {
        executionTimeMs: 1.5,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: "mock-local",
      },
    };
  }
}
