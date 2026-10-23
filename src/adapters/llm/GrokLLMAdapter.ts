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
import { AgentTool, AgentToolset, ToolResult } from "../../ports/AgentToolPort.js";
import { createTransactionToolset } from "../../application/tools/transactionTools.js";
import { withExponentialBackoff } from "./exponentialBackoff.js";

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

  constructor(options: { client?: ChatCompletionsClient } = {}) {
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

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = toolset.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));

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
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let iterations = 0;
    const maxIterations = 5;

    let finalContent = "";

    while (iterations < maxIterations) {
      iterations++;
      const response = await withExponentialBackoff(() =>
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
            const toolResult = await this.runTool(toolset.tools, fnName, toolCall.function.arguments);
            if (!toolResult.ok) {
              console.warn(`⚠️ [Tool Error] ${fnName} → ${toolResult.error.code}: ${toolResult.error.message}`);
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

  // Nunca lanza: los errores vuelven al LLM como resultado de la herramienta
  private async runTool(tools: AgentTool[], name: string, rawArguments: string): Promise<ToolResult> {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) {
      return { ok: false, error: { code: "UNKNOWN_TOOL", message: `La herramienta "${name}" no existe. Disponibles: ${tools.map((t) => t.name).join(", ")}.` } };
    }
    let args: unknown;
    try {
      args = rawArguments ? JSON.parse(rawArguments) : {};
    } catch {
      return { ok: false, error: { code: "INVALID_ARGUMENTS", message: `Los argumentos de ${name} no son JSON válido.` } };
    }
    return tool.execute(args);
  }

}

