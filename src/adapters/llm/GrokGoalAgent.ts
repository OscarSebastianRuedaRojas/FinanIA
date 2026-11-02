import OpenAI from "openai";
import { performance } from "node:perf_hooks";
import { GoalReportSchema } from "../../domain/entities/Goal.js";
import { AgentToolset } from "../../ports/AgentToolPort.js";
import { ExecutionObserver } from "../../ports/ExecutionLogPort.js";
import { GoalAgentPort, GoalOutcome } from "../../ports/GoalAgentPort.js";
import { ChatCompletionsClient } from "./GrokLLMAdapter.js";
import { runReActLoop } from "./reactLoop.js";

const SYSTEM_PROMPT = `Eres FinanIA, un agente autónomo de auditoría financiera para micronegocios y PyMEs.
Recibes un objetivo en lenguaje natural y lo cumples SIN ayuda humana: planificas tus pasos, eliges las herramientas y actúas.

CÓMO TRABAJAR:
1. Planifica: decide qué negocios necesitas encontrar y qué información te falta.
2. Investiga: usa findBusinesses para ubicar negocios y las herramientas mensuales para auditarlos. Las cifras salen de las herramientas: NUNCA inventes números.
3. Actúa: guarda con saveAuditReport un dictamen por cada negocio que auditaste (prioridad, diagnóstico y acciones concretas).
4. Si una herramienta responde {"ok": false}, lee el código de error y corrige: ajusta los argumentos, cambia el alcance o continúa sin ese dato y acláralo.
5. Respeta las cantidades que pide el objetivo. Si no se indica una, audita como máximo 5 negocios.

RESPUESTA FINAL (solo JSON, sin markdown):
{
  "summary": "Qué hiciste y qué encontraste, citando cifras de las herramientas",
  "findings": [{ "businessId": "ID o null", "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "headline": "Hallazgo principal" }],
  "nextSteps": ["Próximo paso recomendado"]
}`;

export class GrokGoalAgent implements GoalAgentPort {
  private client: ChatCompletionsClient;
  private model: string;
  private observer?: ExecutionObserver;
  private maxIterations: number;

  constructor(options: { client?: ChatCompletionsClient; observer?: ExecutionObserver; maxIterations?: number } = {}) {
    this.model = process.env.LLM_MODEL || "grok-4.7";
    this.observer = options.observer;
    this.maxIterations = options.maxIterations ?? 20;

    if (options.client) {
      this.client = options.client;
      return;
    }
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey || apiKey === "pk_placeholder") {
      throw new Error("LLM_API_KEY no está configurada en las variables de entorno.");
    }
    this.client = new OpenAI({ baseURL: process.env.LLM_BASE_URL || "https://api.reto.pltk.mx/v1", apiKey });
  }

  async pursueGoal(goal: string, toolset: AgentToolset): Promise<GoalOutcome> {
    const startTime = performance.now();
    const loop = await runReActLoop({
      client: this.client,
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `OBJETIVO: ${goal}\n\nCONTEXTO: ${toolset.context}` },
      ],
      tools: toolset.tools,
      maxIterations: this.maxIterations,
      forceFinalPrompt:
        "Alcanzaste el límite de iteraciones de herramientas. Emití AHORA el informe final en el formato JSON indicado con lo que ya hiciste y aclará qué quedó pendiente.",
      observer: this.observer,
    });

    const telemetry = {
      executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
      promptTokens: loop.promptTokens,
      completionTokens: loop.completionTokens,
      totalTokens: loop.promptTokens + loop.completionTokens,
      model: this.model,
    };

    const cleaned = loop.content.replace(/```json\n?|\n?```/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }
    const report = GoalReportSchema.safeParse(parsed);
    if (report.success) {
      return { ...report.data, structured: true, forcedFinalAnswer: loop.forcedFinalAnswer, telemetry };
    }

    console.warn("⚠️ [Agente] El informe final no cumple el formato; se conserva su texto como resumen.");
    return {
      summary: loop.content || "El agente no entregó un informe final.",
      findings: [],
      nextSteps: [],
      structured: false,
      forcedFinalAnswer: loop.forcedFinalAnswer,
      telemetry,
    };
  }
}
