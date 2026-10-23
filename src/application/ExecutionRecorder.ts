import {
  ExecutionLogPort,
  ExecutionObserver,
  ExecutionSource,
  LLMCallInfo,
  RunTotals,
  ToolCallInfo,
  ValidationCheck,
} from "../ports/ExecutionLogPort.js";

const TICKS_PER_USD = 10_000_000_000;

export interface RecordedToolCall {
  tool: string;
  args: unknown;
  ok: boolean;
  errorCode?: string;
}

// Registra una ejecución completa del agente (una unidad de trabajo) en la bitácora
export class ExecutionRecorder implements ExecutionObserver {
  readonly toolCalls: RecordedToolCall[] = [];
  private startedAt?: Date;
  private costTicks = 0;
  private costKnown = true;
  private readonly totals: Omit<RunTotals, "costUsd" | "totalTokens"> = {
    llmCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    toolCalls: 0,
    toolErrors: 0,
  };

  constructor(
    private readonly log: ExecutionLogPort,
    private readonly meta: { runId: string; source: ExecutionSource; label: string; redactResult?: boolean },
    private readonly clock: () => Date = () => new Date()
  ) {}

  get runId(): string {
    return this.meta.runId;
  }

  start(): void {
    this.startedAt = this.clock();
    this.log.record({
      type: "run_started",
      runId: this.meta.runId,
      timestamp: this.startedAt.toISOString(),
      source: this.meta.source,
      label: this.meta.label,
    });
  }

  llmCall(info: LLMCallInfo): void {
    const usage = info.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
    const ticks = usage.cost_in_usd_ticks;

    this.totals.llmCalls++;
    this.totals.promptTokens += promptTokens;
    this.totals.completionTokens += completionTokens;
    this.totals.reasoningTokens += reasoningTokens;
    if (typeof ticks === "number") this.costTicks += ticks;
    else this.costKnown = false;

    this.log.record({
      type: "llm_call",
      runId: this.meta.runId,
      timestamp: this.clock().toISOString(),
      kind: info.kind,
      iteration: info.iteration,
      model: info.model,
      latencyMs: info.latencyMs,
      promptTokens,
      completionTokens,
      reasoningTokens,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      costUsd: typeof ticks === "number" ? ticks / TICKS_PER_USD : null,
      ...(info.toolCallsRequested ? { toolCallsRequested: info.toolCallsRequested } : {}),
    });
  }

  toolCall(info: ToolCallInfo): void {
    const errorCode = info.result.ok ? undefined : info.result.error.code;
    this.totals.toolCalls++;
    if (!info.result.ok) this.totals.toolErrors++;
    this.toolCalls.push({ tool: info.tool, args: info.args, ok: info.result.ok, ...(errorCode ? { errorCode } : {}) });

    // Solo se registran argumentos y estado: los datos que devuelve la herramienta nunca van a la bitácora
    this.log.record({
      type: "tool_call",
      runId: this.meta.runId,
      timestamp: this.clock().toISOString(),
      tool: info.tool,
      args: info.args,
      ok: info.result.ok,
      ...(info.result.ok ? {} : { errorCode, errorMessage: info.result.error.message }),
      durationMs: info.durationMs,
    });
  }

  finish(outcome: { status: "success" | "error"; result?: unknown; error?: { code?: string; message: string } }): RunTotals {
    const finishedAt = this.clock();
    const totals = this.currentTotals();
    this.log.record({
      type: "run_finished",
      runId: this.meta.runId,
      timestamp: finishedAt.toISOString(),
      source: this.meta.source,
      label: this.meta.label,
      status: outcome.status,
      durationMs: this.startedAt ? finishedAt.getTime() - this.startedAt.getTime() : 0,
      totals,
      ...(outcome.result !== undefined ? { result: this.redact(outcome.result) } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
    });
    return totals;
  }

  validate(checks: ValidationCheck[]): boolean {
    const passed = checks.every((check) => check.passed);
    this.log.record({
      type: "run_validated",
      runId: this.meta.runId,
      timestamp: this.clock().toISOString(),
      passed,
      checks,
    });
    return passed;
  }

  currentTotals(): RunTotals {
    return {
      ...this.totals,
      totalTokens: this.totals.promptTokens + this.totals.completionTokens,
      costUsd: this.costKnown ? this.costTicks / TICKS_PER_USD : NaN,
    };
  }

  // Con microdatos del DANE solo se conserva la prioridad: el texto del dictamen cita cifras del negocio
  private redact(result: unknown): unknown {
    if (!this.meta.redactResult) return result;
    const value = (result ?? {}) as { priority?: unknown; actionPlan?: unknown };
    return {
      priority: value.priority,
      actionPlanItems: Array.isArray(value.actionPlan) ? value.actionPlan.length : 0,
      redacted: true,
    };
  }
}
