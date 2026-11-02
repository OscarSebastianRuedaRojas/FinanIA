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
import { AgentToolset } from "../../ports/AgentToolPort.js";
import { createTransactionToolset } from "../../application/tools/transactionTools.js";
import { runReActLoop } from "./reactLoop.js";
import { ExecutionObserver } from "../../ports/ExecutionLogPort.js";

// Subconjunto del cliente OpenAI que usa el adaptador (permite inyectar un cliente falso en tests)
export type ChatCompletionsClient = {
  chat: {
    completions: {
      create(
        params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
      ): Promise<OpenAI.Chat.Completions.ChatCompletion>;
    };
  };
};

export class GrokLLMAdapter implements LLMAgentPort {
  private client: ChatCompletionsClient;
  private model: string;
  private observer?: ExecutionObserver;

  constructor(options: { client?: ChatCompletionsClient; observer?: ExecutionObserver } = {}) {
    this.observer = options.observer;
    const baseURL = process.env.LLM_BASE_URL || "https://api.reto.pltk.mx/v1";
    const apiKey = process.env.LLM_API_KEY;
    this.model = process.env.LLM_MODEL || "grok-4.7";

    if (options.client) {
      this.client = options.client;
      return;
    }

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
    recentTransactions: Transaction[],
    toolset: AgentToolset = createTransactionToolset(recentTransactions)
  ): Promise<FinancialRecommendation> {
    const toolList = toolset.tools.map((tool) => `   - ${tool.name}: ${tool.description}`).join("\n");
    const systemPrompt = `Eres FinanIA, un AGENTE AUDITOR FINANCIERO ESTRICTO e inteligente para PyMEs.
Funcionas como un sistema autónomo ReAct con capacidad de llamar herramientas (Tool Calling).

REGLAS DE ACTUACIÓN:
1. Tenés acceso a herramientas de investigación profunda:
${toolList}
2. Usá las herramientas cuando necesites profundizar antes de emitir tu dictamen final.
   Cada herramienta responde {"ok": true, "data": ...} o {"ok": false, "error": {"code", "message"}}.
   Si una herramienta falla, leé el código de error y decidí: corregir los argumentos, reintentar con otro alcance o continuar sin ese dato, aclarándolo en el diagnóstico.
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

${toolset.context} Investiga con las herramientas si lo consideras necesario y emite el dictamen en formato JSON estricto.`,
      },
    ];

    const startTime = performance.now();
    const loop = await runReActLoop({
      client: this.client,
      model: this.model,
      messages,
      tools: toolset.tools,
      maxIterations: 5,
      forceFinalPrompt:
        "Alcanzaste el límite de iteraciones de herramientas. Emití AHORA el dictamen final en el formato JSON indicado, usando solo la información que ya recolectaste.",
      observer: this.observer,
    });
    const finalContent = loop.content;
    const totalPromptTokens = loop.promptTokens;
    const totalCompletionTokens = loop.completionTokens;

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


}

