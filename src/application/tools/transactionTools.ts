import { z } from "zod";
import { Transaction } from "../../domain/entities/Financial.js";
import { FinancialCalculator } from "../../domain/services/FinancialCalculator.js";
import { AgentToolset, defineTool } from "./AgentTool.js";

const noArgs = z.object({});

// Herramientas semanales y mensuales sobre las transacciones de los casos sintéticos (JSON)
export function createTransactionToolset(transactions: Transaction[]): AgentToolset {
  return {
    context:
      "Tenés herramientas semanales (flujo neto, saldo proyectado a 4 semanas, gastos fuera de patrón) y mensuales (márgenes, categorías críticas, tendencias).",
    tools: [
      defineTool({
        name: "getWeeklyCashFlowAndAlerts",
        description: "Evalúa el flujo neto semanal, saldo proyectado a 4 semanas y detecta gastos fuera de patrón / anomalías",
        schema: noArgs,
        run: () => FinancialCalculator.getWeeklyCashFlowAndAlerts(transactions),
      }),
      defineTool({
        name: "getMonthlyDiagnosticAndTrend",
        description: "Evalúa el diagnóstico mensual consolidado, márgenes de ganancia, categorías críticas y tendencias comparativas",
        schema: noArgs,
        run: () => FinancialCalculator.getMonthlyDiagnosticAndTrend(transactions),
      }),
      defineTool({
        name: "getCategoryBreakdown",
        description: "Obtiene el desglose porcentual detallado de ingresos y egresos por categoría",
        schema: noArgs,
        run: () => FinancialCalculator.getCategoryBreakdown(transactions),
      }),
      defineTool({
        name: "compareToPreviousPeriod",
        description: "Compara las tendencias financieras entre el período previo y el período actual",
        schema: noArgs,
        run: () => FinancialCalculator.compareToPreviousPeriod(transactions),
      }),
      defineTool({
        name: "detectAnomalies",
        description: "Detecta transacciones con egresos anómalos o superiores al umbral promedio",
        schema: noArgs,
        run: () => FinancialCalculator.detectAnomalies(transactions),
      }),
    ],
  };
}
