import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { GrokLLMAdapter } from "./adapters/llm/GrokLLMAdapter.js";
import { GrokVisionAdapter } from "./adapters/llm/GrokVisionAdapter.js";
import { JsonFileFinancialAdapter } from "./adapters/repository/JsonFileFinancialAdapter.js";
import { AgentOrchestrator } from "./application/AgentOrchestrator.js";
import { ScanInvoiceOutcome, ScanInvoiceUseCase } from "./application/ScanInvoiceUseCase.js";
import { CaseOutcome, ExecutionCase, renderExecutionReport, runExecutionPlan } from "./application/ExecutionPlanRunner.js";
import { ExecutionRecorder } from "./application/ExecutionRecorder.js";
import { FinancialRecommendation, FinancialRecommendationSchema, FinancialSummary } from "./domain/entities/Financial.js";
import { buildEmicronRun } from "./infrastructure/emicron/buildEmicronRun.js";
import { readInvoiceImage } from "./infrastructure/invoice/readInvoiceImage.js";
import { FanOutExecutionLog, JsonlExecutionLog } from "./infrastructure/logging/JsonlExecutionLog.js";
import { FinancialDataPort } from "./ports/FinancialDataPort.js";
import { AgentToolset } from "./ports/AgentToolPort.js";
import { ExecutionSource, ValidationCheck } from "./ports/ExecutionLogPort.js";

type AgentRun = { summary: FinancialSummary; recommendation: FinancialRecommendation };

const EVIDENCE_DIR = path.resolve(process.cwd(), "docs", "bitacora");
const MONTHLY_TOOLS = ["getMonthlyStatement", "compareWithSectorPeers", "getYearOverYearSales"];

function check(name: string, passed: boolean, detail?: string): ValidationCheck {
  return { name, passed, ...(detail && !passed ? { detail } : {}) };
}

// Checks comunes a toda auditoría del agente
function agentChecks(outcome: CaseOutcome<AgentRun>, recorder: ExecutionRecorder): ValidationCheck[] {
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

function agentCase(definition: {
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

function jsonCase(id: string, title: string, file: string): ExecutionCase<AgentRun> {
  return agentCase({
    id,
    title,
    source: "json",
    label: file,
    load: async () => ({ dataAdapter: new JsonFileFinancialAdapter(path.resolve(process.cwd(), file)) }),
  });
}

function emicronCase(
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

function invoiceCase(
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

// Las 10 ejecuciones de S2: casos sintéticos, micronegocios reales del DANE y facturas
const plan: ExecutionCase<any>[] = [
  jsonCase("E01", "Quiebra inminente (sintético, herramientas semanales)", "data/casos/quiebra_inminente.json"),
  jsonCase("E02", "Crecimiento saludable (sintético, herramientas semanales)", "data/casos/crecimiento_saludable.json"),
  jsonCase("E03", "Fuga silenciosa / gastos hormiga (sintético)", "data/casos/fuga_silenciosa_servicios.json"),
  emicronCase("E04", "Micronegocio real en pérdida (transporte, Antioquia)", "7627478-1-2", (value) => [
    check("Prioridad HIGH o CRITICAL para un negocio en pérdida", ["HIGH", "CRITICAL"].includes(value.recommendation.priority), `prioridad ${value.recommendation.priority}`),
  ]),
  emicronCase("E05", "Micronegocio real en crecimiento (transporte, Antioquia)", "7627474-1-1", (value) => [
    check("Prioridad LOW o MEDIUM para un negocio rentable", ["LOW", "MEDIUM"].includes(value.recommendation.priority), `prioridad ${value.recommendation.priority}`),
  ]),
  emicronCase("E06", "Micronegocio real con caída interanual (servicios, La Guajira)", "7628486-1-1"),
  emicronCase("E07", "Micronegocio real con margen bajo (restaurante, Cauca)", "7628122-1-1"),
  emicronCase("E08", "Recuperación ante falla: sector sin pares en el departamento (minería, Huila)", "7638460-1-1", (_value, recorder) => {
    const peerCalls = recorder.toolCalls.filter((c) => c.tool === "compareWithSectorPeers");
    const failedIdx = peerCalls.findIndex((c) => c.errorCode === "INSUFFICIENT_PEERS");
    const recovered = failedIdx >= 0 && peerCalls.slice(failedIdx + 1).some((c) => c.ok && (c.args as any)?.scope === "national");
    return [
      check("La herramienta devolvió INSUFFICIENT_PEERS en el departamento", failedIdx >= 0, "no se produjo el error esperado"),
      check("El agente reintentó por su cuenta con scope national y obtuvo datos", recovered, "no se recuperó con alcance nacional"),
    ];
  }),
  invoiceCase("E09", "Factura física fotografiada (Grok Vision)", "tests/fixtures/invoices/factura_sintetica.png", (outcome) => {
    if (outcome.status === "error") return [check("Extracción exitosa", false, outcome.error.message)];
    const { extraction, transaction } = outcome.value;
    return [
      check("Proveedor FERRETERIA EL TORNILLO", extraction.vendorName.includes("TORNILLO"), extraction.vendorName),
      check("Total 177310 COP", extraction.totalAmount === 177310 && extraction.currency === "COP", `${extraction.totalAmount} ${extraction.currency}`),
      check("Fecha 2026-09-14", extraction.date === "2026-09-14", extraction.date),
      check("Clasificada como EXPENSE", transaction.type === "EXPENSE", transaction.type),
    ];
  }),
  invoiceCase("E10", "Manejo de error: la foto no es una factura (Grok Vision)", "tests/fixtures/invoices/no_factura.png", (outcome) => [
    check(
      "Falla controlada con NOT_AN_INVOICE (sin transacción inventada)",
      outcome.status === "error" && outcome.error.code === "NOT_AN_INVOICE",
      outcome.status === "error" ? outcome.error.code : "se generó una transacción"
    ),
  ]),
];

async function main(): Promise<number> {
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === "pk_placeholder") {
    console.error("❌ LLM_API_KEY no está configurada: las 10 ejecuciones corren contra Grok real.");
    return 1;
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidenceLog = path.join(EVIDENCE_DIR, "s2-ejecuciones.jsonl");
  fs.rmSync(evidenceLog, { force: true });
  const log = new FanOutExecutionLog([new JsonlExecutionLog(), new JsonlExecutionLog(evidenceLog)]);

  const startedAt = new Date();
  const runIdPrefix = `s2-${startedAt.toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
  const reports = await runExecutionPlan(plan, { log, runIdPrefix });

  const markdown = renderExecutionReport(reports, {
    title: "Bitácora S2 — 10 ejecuciones validadas de FinanIA",
    generatedAt: startedAt.toISOString(),
  });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "s2-ejecuciones.md"), markdown, "utf-8");

  const validated = reports.filter((r) => r.passed).length;
  console.log(`\n📒 ${validated}/${reports.length} ejecuciones validadas. Evidencia en docs/bitacora/`);
  return validated === reports.length ? 0 : 1;
}

main().then((code) => {
  process.exitCode = code;
});
