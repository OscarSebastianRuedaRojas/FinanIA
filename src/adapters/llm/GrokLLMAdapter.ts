import OpenAI from "openai";
import { performance } from "node:perf_hooks";
import { LLMAgentPort } from "../../ports/LLMAgentPort.js";
import {
  FinancialSummary,
  FinancialRecommendation,
  FinancialRecommendationSchema,
  Transaction,
  Telemetry,
} from "../../domain/entities/Financial.js";

export class GrokLLMAdapter implements LLMAgentPort {
  private client: OpenAI;
  private model: string;

  constructor() {
    const baseURL = process.env.LLM_BASE_URL || "https://api.reto.pltk.mx/v1";
    const apiKey = process.env.LLM_API_KEY;
    this.model = process.env.LLM_MODEL || "grok-4.7";

    if (!apiKey) {
      throw new Error("LLM_API_KEY no está configurada en las variables de entorno.");
    }

    this.client = new OpenAI({
      baseURL,
      apiKey,
    });
  }

  async evaluateFinancialStatus(
    summary: FinancialSummary,
    recentTransactions: Transaction[]
  ): Promise<FinancialRecommendation> {
    // Rol: Auditor Financiero Estricto
    const systemPrompt = `Eres FinanIA, un AUDITOR FINANCIERO ESTRICTO e inflexible para PyMEs.
Tu objetivo es auditar la salud financiera con máximo rigor, detectando fugas de capital, ineficiencias de costos y riesgos de liquidez.

REGLAS DE AUDITORÍA:
1. No minimices las pérdidas ni maquilles el diagnóstico.
2. Los cálculos aritméticos ya fueron procesados determinísticamente por el código. Úsalos como evidencia irrebatible.
3. El plan de acción debe ser concreto, prioritario y enfocado en contención inmediata de daños y optimización de caja.

Debes retornar un JSON válido que cumpla estrictamente con esta estructura:
{
  "title": "Título del dictamen de auditoría",
  "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "diagnosis": "Diagnóstico riguroso de auditoría citando las métricas de ingresos, egresos, margen y categoría crítica",
  "actionPlan": ["Acción correctiva 1", "Acción correctiva 2", "Acción correctiva 3"],
  "estimatedImpact": "Estimación del impacto económico o en días de operación"
}`;

    const userPrompt = `Dictamen de Auditoría Financiera - Datos Precalculados:
- Ingresos Totales: $${summary.totalIncome}
- Egresos Totales: $${summary.totalExpenses}
- Beneficio Neto: $${summary.netProfit}
- Ratio de Gastos sobre Ingresos: ${summary.expenseRatio}%
- Margen de Ganancia Neto: ${summary.profitMargin}%
- Nivel de Riesgo Evaluado: ${summary.cashFlowRisk}
- Categoría de Mayor Gasto: ${summary.topExpenseCategory}
- Desglose por Categorías: ${JSON.stringify(summary.expensesByCategory)}

Últimas ${recentTransactions.length} Transacciones Auditadas:
${JSON.stringify(recentTransactions, null, 2)}

Emite el dictamen final de auditoría en formato JSON estricto. Respond únicamente con el JSON.`;

    // Medición de Telemetría (performance.now() equivalente a time.perf_counter())
    const startTime = performance.now();

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Temperatura baja para auditoría estricta y determinista
      });

      const endTime = performance.now();
      const executionTimeMs = Number((endTime - startTime).toFixed(2));

      const content = response.choices[0]?.message?.content || "";
      const cleanJsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      const parsedData = JSON.parse(cleanJsonStr);

      // Captura de tokens consumidos (response.usage)
      const usage = response.usage;
      const telemetry: Telemetry = {
        executionTimeMs,
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
        model: this.model,
      };

      const validRecommendation = FinancialRecommendationSchema.parse({
        ...parsedData,
        telemetry,
      });

      return validRecommendation;
    } catch (error) {
      console.error(" Error en auditoría LLM:", error);
      throw error;
    }
  }
}
