import path from "node:path";
import { GrokLLMAdapter } from "../adapters/llm/GrokLLMAdapter.js";
import { GrokVisionAdapter } from "../adapters/llm/GrokVisionAdapter.js";
import { JsonFileFinancialAdapter } from "../adapters/repository/JsonFileFinancialAdapter.js";
import { AgentOrchestrator } from "../application/AgentOrchestrator.js";
import { ScanInvoiceOutcome, ScanInvoiceUseCase } from "../application/ScanInvoiceUseCase.js";
import { CaseOutcome, ExecutionCase } from "../application/ExecutionPlanRunner.js";
import { ExecutionRecorder } from "../application/ExecutionRecorder.js";
import { FinancialRecommendation, FinancialRecommendationSchema, FinancialSummary } from "../domain/entities/Financial.js";
import { buildEmicronRun } from "../infrastructure/emicron/buildEmicronRun.js";
import { readInvoiceImage } from "../infrastructure/invoice/readInvoiceImage.js";
import { FinancialDataPort } from "../ports/FinancialDataPort.js";
import { AgentToolset } from "../ports/AgentToolPort.js";
import { ExecutionSource, ValidationCheck } from "../ports/ExecutionLogPort.js";

export type AgentRun = { summary: FinancialSummary; recommendation: FinancialRecommendation };

export const MONTHLY_TOOLS = ["getMonthlyStatement", "compareWithSectorPeers", "getYearOverYearSales"];

export function check(name: string, passed: boolean, detail?: string): ValidationCheck {
  return { name, passed, ...(detail && !passed ? { detail } : {}) };
}

// Checks comunes a toda auditoría del agente
export function agentChecks(outcome: CaseOutcome<AgentRun>, recorder: ExecutionRecorder): ValidationCheck[] {
  if (outcome.status === "error") {
    return [check("Terminó sin error", false, outcome.error.message)];
  }
  const { summary, recommendation } = outcome.value;
  const allowed: Record<string, string[]> = {
    HIGH: ["HIGH", "CRITICAL"],
    LOW: ["LOW", "MEDIUM"],
    MEDIUM: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  };
  return [
    check("Terminó sin error", true),
    check("El agente decidió invocar al menos una herramienta", recorder.toolCalls.length > 0, "no invocó herramientas"),
    check(
      "Dictamen válido según FinancialRecommendationSchema",
      FinancialRecommendationSchema.safeParse(recommendation).success,
      "el dictamen no cumple el esquema"
    ),
    check(
      `Prioridad coherente con el riesgo de caja ${summary.cashFlowRisk}`,
      allowed[summary.cashFlowRisk].includes(recommendation.priority),
      `prioridad ${recommendation.priority}`
    ),
  ];
}

export function agentCase(definition: {
  id: string;
  title: string;
  source: ExecutionSource;
  label: string;
  load: () => Promise<{ dataAdapter: FinancialDataPort; toolset?: AgentToolset }>;
  extraChecks?: (value: AgentRun, recorder: ExecutionRecorder) => ValidationCheck[];
}): ExecutionCase<AgentRun> {
  const sensitive = definition.source === "emicron";
  return {
    id: definition.id,
    title: definition.title,
    source: definition.source,
    label: definition.label,
    redactResult: sensitive,
    run: async (observer) => {
      const { dataAdapter, toolset } = await definition.load();
      const orchestrator = new AgentOrchestrator(dataAdapter, new GrokLLMAdapter({ observer }));
      return orchestrator.runAutonomousCycle(toolset);
    },
    resultForLog: (value) => value.recommendation,
    summarize: (value) =>
      sensitive
        ? `Prioridad ${value.recommendation.priority} · riesgo de caja ${value.summary.cashFlowRisk}`
        : `Prioridad ${value.recommendation.priority} · ${value.recommendation.title}`,
    validate: (outcome, recorder) => [
      ...agentChecks(outcome, recorder),
      ...(outcome.status === "success" && definition.extraChecks ? definition.extraChecks(outcome.value, recorder) : []),
    ],
  };
}

export function jsonCase(id: string, title: string, file: string): ExecutionCase<AgentRun> {
  return agentCase({
    id,
    title,
    source: "json",
    label: file,
    load: async () => ({ dataAdapter: new JsonFileFinancialAdapter(path.resolve(process.cwd(), file)) }),
  });
}

export function emicronCase(
  id: string,
  title: string,
  businessId: string,
  extraChecks?: (value: AgentRun, recorder: ExecutionRecorder) => ValidationCheck[]
): ExecutionCase<AgentRun> {
  return agentCase({
    id,
    title,
    source: "emicron",
    label: businessId,
    load: () => buildEmicronRun(businessId),
    extraChecks: (value, recorder) => [
      check(
        "Usó herramientas mensuales sobre datos reales del DANE",
        recorder.toolCalls.some((c) => MONTHLY_TOOLS.includes(c.tool)),
        "no usó getMonthlyStatement, compareWithSectorPeers ni getYearOverYearSales"
      ),
      ...(extraChecks ? extraChecks(value, recorder) : []),
    ],
  });
}

export function invoiceCase(
  id: string,
  title: string,
  file: string,
  validate: (outcome: CaseOutcome<ScanInvoiceOutcome>) => ValidationCheck[]
): ExecutionCase<ScanInvoiceOutcome> {
  return {
    id,
    title,
    source: "invoice",
    label: file,
    run: (observer) =>
      new ScanInvoiceUseCase(new GrokVisionAdapter({ observer }), readInvoiceImage).execute(path.resolve(process.cwd(), file)),
    resultForLog: (value) => ({ extraction: value.extraction, transaction: value.transaction }),
    summarize: (value) =>
      `${value.extraction.vendorName} · ${value.extraction.totalAmount} ${value.extraction.currency} · ${value.extraction.date}`,
    validate: (outcome) => validate(outcome),
  };
}
