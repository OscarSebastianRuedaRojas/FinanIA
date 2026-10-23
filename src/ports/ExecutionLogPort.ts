import { ToolResult } from "./AgentToolPort.js";

export type ExecutionSource = "json" | "emicron" | "invoice";

// Uso reportado por la API compatible con OpenAI de xAI (cost_in_usd_ticks: 1 USD = 10^10 ticks)
export interface LLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
  cost_in_usd_ticks?: number;
}

export interface LLMCallInfo {
  kind: "agent" | "vision";
  iteration: number;
  model: string;
  latencyMs: number;
  usage?: LLMUsage | null;
  toolCallsRequested?: string[];
}

export interface ToolCallInfo {
  tool: string;
  args: unknown;
  durationMs: number;
  result: ToolResult;
}

// Lo que los adaptadores del LLM informan mientras trabajan
export interface ExecutionObserver {
  llmCall(info: LLMCallInfo): void;
  toolCall(info: ToolCallInfo): void;
}

export interface RunTotals {
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUsd: number;
  toolCalls: number;
  toolErrors: number;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

type Base = { runId: string; timestamp: string };

export type ExecutionEvent =
  | (Base & { type: "run_started"; source: ExecutionSource; label: string })
  | (Base & {
      type: "llm_call";
      kind: LLMCallInfo["kind"];
      iteration: number;
      model: string;
      latencyMs: number;
      promptTokens: number;
      completionTokens: number;
      reasoningTokens: number;
      cachedTokens: number;
      costUsd: number | null;
      toolCallsRequested?: string[];
    })
  | (Base & {
      type: "tool_call";
      tool: string;
      args: unknown;
      ok: boolean;
      errorCode?: string;
      errorMessage?: string;
      durationMs: number;
    })
  | (Base & {
      type: "run_finished";
      source: ExecutionSource;
      label: string;
      status: "success" | "error";
      durationMs: number;
      totals: RunTotals;
      result?: unknown;
      error?: { code?: string; message: string };
    })
  | (Base & { type: "run_validated"; passed: boolean; checks: ValidationCheck[] });

export interface ExecutionLogPort {
  // Nunca debe lanzar: la bitácora no puede interrumpir una ejecución
  record(event: ExecutionEvent): void;
}
