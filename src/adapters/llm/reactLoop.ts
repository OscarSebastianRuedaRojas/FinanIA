import OpenAI from "openai";
import { performance } from "node:perf_hooks";
import { AgentTool, ToolResult } from "../../ports/AgentToolPort.js";
import { ExecutionObserver, LLMUsage } from "../../ports/ExecutionLogPort.js";
import { withExponentialBackoff } from "./exponentialBackoff.js";
import type { ChatCompletionsClient } from "./GrokLLMAdapter.js";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface ReActLoopResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  iterations: number;
  forcedFinalAnswer: boolean;
}

function parseArgsForLog(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
}

// Nunca lanza: los errores vuelven al LLM como resultado de la herramienta
async function runTool(tools: AgentTool[], name: string, rawArguments: string): Promise<ToolResult> {
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

// Loop ReAct: el modelo decide qué herramientas invocar hasta dar su respuesta final.
// Si agota las iteraciones, una última llamada sin herramientas fuerza el cierre.
export async function runReActLoop(params: {
  client: ChatCompletionsClient;
  model: string;
  messages: Message[];
  tools: AgentTool[];
  maxIterations: number;
  forceFinalPrompt: string;
  observer?: ExecutionObserver;
}): Promise<ReActLoopResult> {
  const { client, model, messages, tools: agentTools, maxIterations, observer } = params;
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = agentTools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));

  let promptTokens = 0;
  let completionTokens = 0;
  let iterations = 0;

  const complete = async (toolChoice: "auto" | "none", iteration: number) => {
    const callStart = performance.now();
    const response = await withExponentialBackoff(() =>
      client.chat.completions.create({ model, messages, tools, tool_choice: toolChoice, temperature: 0.1 })
    );
    promptTokens += response.usage?.prompt_tokens || 0;
    completionTokens += response.usage?.completion_tokens || 0;
    const message = response.choices[0].message;
    observer?.llmCall({
      kind: "agent",
      iteration,
      model: response.model || model,
      latencyMs: Math.round(performance.now() - callStart),
      usage: response.usage as LLMUsage | undefined,
      toolCallsRequested: (message.tool_calls ?? []).map((call) => (call.type === "function" ? call.function.name : call.type)),
    });
    return message;
  };

  while (iterations < maxIterations) {
    iterations++;
    const message = await complete("auto", iterations);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { content: message.content || "", promptTokens, completionTokens, iterations, forcedFinalAnswer: false };
    }

    messages.push(message);
    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;
      const fnName = toolCall.function.name;
      console.log(`🛠️ [Agente Autónomo Tool Calling] Invocando herramienta: ${fnName}...`);
      const toolStart = performance.now();
      const toolResult = await runTool(agentTools, fnName, toolCall.function.arguments);
      observer?.toolCall({
        tool: fnName,
        args: parseArgsForLog(toolCall.function.arguments),
        durationMs: Math.round(performance.now() - toolStart),
        result: toolResult,
      });
      if (!toolResult.ok) {
        console.warn(`⚠️ [Tool Error] ${fnName} → ${toolResult.error.code}: ${toolResult.error.message}`);
      }
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
    }
  }

  console.warn(`⚠️ [Agente] Se alcanzó el límite de ${maxIterations} iteraciones; se fuerza el cierre.`);
  messages.push({ role: "user", content: params.forceFinalPrompt });
  const message = await complete("none", maxIterations + 1);
  return { content: message.content || "", promptTokens, completionTokens, iterations, forcedFinalAnswer: true };
}
