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
import { FinancialCalculator } from "../../domain/services/FinancialCalculator.js";

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
    const systemPrompt = `Eres FinanIA, un AGENTE AUDITOR FINANCIERO ESTRICTO e inteligente para PyMEs.
Funcionas como un sistema autónomo ReAct con capacidad de llamar herramientas (Tool Calling).

REGLAS DE ACTUACIÓN:
1. Tenés acceso a herramientas de investigación profunda:
   - getCategoryBreakdown: desglose detallado de ingresos y egresos por categoría.
   - compareToPreviousPeriod: comparativa de rendimiento entre períodos.
   - detectAnomalies: detección de gastos o movimientos anómalos.
2. Usá las herramientas cuando necesites profundizar antes de emitir tu dictamen final.
3. COINCIDENCIA OBLIGATORIA DE PRIORIDAD Y TONO CON MÉTRICAS:
   - Si el Nivel de Riesgo Evaluado es "LOW" y el beneficio neto es positivo: La prioridad del dictamen DEBE ser "LOW" o "MEDIUM". El plan de acción DEBE enfocarse en crecimiento, optimización de márgenes y reservas (NUNCA en pánico, congelamiento de emergencia ni quiebra).
   - Si el Nivel de Riesgo es "HIGH" o el beneficio neto es negativo: La prioridad DEBE ser "HIGH" o "CRITICAL" con plan de contención de crisis e inmovilización de gastos superfluos.

Formato Final Obligatorio JSON (sin markdown wrapping):
{
  "title": "Título del dictamen de auditoría",
  "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "diagnosis": "Diagnóstico riguroso citando métricas clave y descubrimientos de herramientas",
  "actionPlan": ["Acción correctiva 1", "Acción correctiva 2", "Acción correctiva 3"],
  "estimatedImpact": "Estimación del impacto económico en liquidez o márgenes"
}`;

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "getWeeklyCashFlowAndAlerts",
          description: "Evalúa el flujo neto semanal, saldo proyectado a 4 semanas y detecta gastos fuera de patrón / anomalías",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "getMonthlyDiagnosticAndTrend",
          description: "Evalúa el diagnóstico mensual consolidado, márgenes de ganancia, categorías críticas y tendencias comparativas",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "getCategoryBreakdown",
          description: "Obtiene el desglose porcentual detallado de ingresos y egresos por categoría",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "compareToPreviousPeriod",
          description: "Compara las tendencias financieras entre el período previo y el período actual",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "detectAnomalies",
          description: "Detecta transacciones con egresos anómalos o superiores al umbral promedio",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
    ];

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Inicia la auditoría financiera autónoma.
Resumen inicial precalculado:
- Ingresos Totales: $${summary.totalIncome}
- Egresos Totales: $${summary.totalExpenses}
- Beneficio Neto: $${summary.netProfit}
- Ratio de Gastos: ${summary.expenseRatio}%
- Margen de Ganancia Neto: ${summary.profitMargin}%
- Nivel de Riesgo de Caja: ${summary.cashFlowRisk}
- Categoría Principal de Gasto: ${summary.topExpenseCategory}

Tenés herramientas semanales (flujo neto, saldo proyectado a 4 semanas, gastos fuera de patrón) y mensuales (márgenes, categorías críticas, tendencias). Investiga con ellas si lo consideras necesario y emite el dictamen en formato JSON estricto.`,
      },
    ];

    const startTime = performance.now();
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let iterations = 0;
    const maxIterations = 5;

    let finalContent = "";

    while (iterations < maxIterations) {
      iterations++;
      const response = await this.executeWithExponentialBackoff(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0.1,
        })
      );

      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens || 0;
        totalCompletionTokens += response.usage.completion_tokens || 0;
      }

      const choice = response.choices[0];
      const message = choice.message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          if (toolCall.type === "function") {
            const fnName = toolCall.function.name;
            console.log(`🛠️ [Agente Autónomo Tool Calling] Invocando herramienta: ${fnName}...`);
            let toolResult: unknown = {};

            if (fnName === "getWeeklyCashFlowAndAlerts") {
              toolResult = FinancialCalculator.getWeeklyCashFlowAndAlerts(recentTransactions);
            } else if (fnName === "getMonthlyDiagnosticAndTrend") {
              toolResult = FinancialCalculator.getMonthlyDiagnosticAndTrend(recentTransactions);
            } else if (fnName === "getCategoryBreakdown") {
              toolResult = FinancialCalculator.getCategoryBreakdown(recentTransactions);
            } else if (fnName === "compareToPreviousPeriod") {
              toolResult = FinancialCalculator.compareToPreviousPeriod(recentTransactions);
            } else if (fnName === "detectAnomalies") {
              toolResult = FinancialCalculator.detectAnomalies(recentTransactions);
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult),
            });
          }
        }
      } else {
        finalContent = message.content || "";
        break;
      }
    }

    const endTime = performance.now();
    const executionTimeMs = Number((endTime - startTime).toFixed(2));

    const cleanJsonStr = finalContent.replace(/```json\n?|\n?```/g, "").trim();
    let parsedData: any;
    try {
      parsedData = JSON.parse(cleanJsonStr);
    } catch (err) {
      console.warn("⚠️ [Resiliencia JSON] Fallback por JSON malformado del LLM:", err);
      parsedData = {
        title: "Dictamen de Auditoría Financiera",
        priority: summary.cashFlowRisk === "HIGH" ? "HIGH" : "LOW",
        diagnosis: finalContent || "Análisis completado sin observaciones anómalas.",
        actionPlan: ["Mantener control operacional de flujo de caja"],
        estimatedImpact: "Estabilidad financiera preservada",
      };
    }

    // Guardrail de Alineación Métrica-Prioridad
    if (summary.cashFlowRisk === "LOW" && (parsedData.priority === "CRITICAL" || parsedData.priority === "HIGH")) {
      console.log("🛡️ [Guardrail] Ajustando prioridad a LOW por coincidencia con riesgo de caja bajo.");
      parsedData.priority = "LOW";
    } else if (summary.cashFlowRisk === "HIGH" && (parsedData.priority === "LOW" || parsedData.priority === "MEDIUM")) {
      console.log("🛡️ [Guardrail] Escalando prioridad a HIGH por alto riesgo de flujo de caja.");
      parsedData.priority = "HIGH";
    }

    const grandTotalTokens = totalPromptTokens + totalCompletionTokens;

    const telemetry: Telemetry = {
      executionTimeMs,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: grandTotalTokens,
      model: this.model,
    };

    // Validación y resiliencia de Esquema Zod
    const schemaValidation = FinancialRecommendationSchema.safeParse({
      ...parsedData,
      telemetry,
    });

    if (!schemaValidation.success) {
      console.warn("⚠️ [Resiliencia Zod] Estructura ajustada por incompatibilidad de esquema Zod:", schemaValidation.error.format());
      return {
        title: parsedData.title || "Dictamen de Auditoría Financiera",
        priority: ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(parsedData.priority) ? parsedData.priority : "LOW",
        diagnosis: parsedData.diagnosis || "Diagnóstico completado.",
        actionPlan: Array.isArray(parsedData.actionPlan) ? parsedData.actionPlan : ["Revisión periódica de flujo de caja"],
        estimatedImpact: parsedData.estimatedImpact || "Impacto financiero neutral",
        telemetry,
      };
    }

    return schemaValidation.data;
  }

  private async executeWithExponentialBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (attempt === maxRetries) break;
        const delay = Math.pow(2, attempt) * baseDelayMs + Math.random() * 500;
        console.warn(
          `⚠️ [Exponential Backoff] Reintento ${attempt + 1}/${maxRetries} tras error de API (${err?.message || err}). Esperando ${Math.round(delay)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
}

