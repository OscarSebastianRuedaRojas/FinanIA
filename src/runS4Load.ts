import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { GrokLLMAdapter } from "./adapters/llm/GrokLLMAdapter.js";
import { createAlertChannelFromEnv } from "./adapters/notifications/createAlertChannel.js";
import { SqliteAuditReportRepository } from "./adapters/repository/SqliteAuditReportRepository.js";
import { SqliteLoadRunStore } from "./adapters/repository/SqliteLoadRunStore.js";
import { AgentOrchestrator } from "./application/AgentOrchestrator.js";
import { ExecutionRecorder } from "./application/ExecutionRecorder.js";
import { renderLoadReport } from "./application/LoadReport.js";
import { UnitExecution, runLoad } from "./application/LoadRunner.js";
import { agentChecks, check, MONTHLY_TOOLS } from "./evaluation/caseBuilders.js";
import { buildEmicronRun, EMICRON_DB_PATH } from "./infrastructure/emicron/buildEmicronRun.js";
import { selectLoadUnits } from "./infrastructure/emicron/EvaluationCaseSelector.js";
import { FanOutExecutionLog, JsonlExecutionLog } from "./infrastructure/logging/JsonlExecutionLog.js";
import { AlertError, AlertPort } from "./ports/AlertPort.js";
import { LoadUnit } from "./ports/LoadRunStore.js";

const EVIDENCE_DIR = path.resolve(process.cwd(), "docs", "bitacora");
const USAGE = `Uso: npm run s4:carga -- [--run-id <id>] [--unidades 1000] [--horas 12] [--concurrencia 2] [--tope-usd 25] [--ventas-minimas 0]
Con --run-id de una corrida existente, la retoma donde quedó.`;

function parseArgs(argv: string[]) {
  const value = (name: string) => {
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const num = (name: string, fallback: number) => (value(name) === undefined ? fallback : Number(value(name)));
  return {
    runId: value("--run-id") ?? `s4-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`,
    units: num("--unidades", 1000),
    hours: num("--horas", 12),
    concurrency: num("--concurrencia", 2),
    budgetUsd: num("--tope-usd", 25),
    minSales: num("--ventas-minimas", 0),
  };
}

function writeLoadReport(store: SqliteLoadRunStore, runId: string, plannedUnits: number, budgetUsd: number): Promise<string> {
  return Promise.all([store.listUnits(runId), store.listReports(runId)]).then(([units, reports]) => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const file = path.join(EVIDENCE_DIR, `${runId}.md`);
    fs.writeFileSync(file, renderLoadReport(units, reports, { runId, generatedAt: new Date().toISOString(), plannedUnits, budgetUsd }), "utf-8");
    return file;
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if ([args.units, args.hours, args.concurrency, args.budgetUsd, args.minSales].some((n) => !Number.isFinite(n) || n < 0) || args.units < 1 || args.concurrency < 1) {
    console.error(USAGE);
    return 1;
  }
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === "pk_placeholder") {
    console.error("❌ LLM_API_KEY no está configurada: la carga corre contra Grok real.");
    return 1;
  }

  let alerts: AlertPort | undefined;
  try {
    alerts = createAlertChannelFromEnv();
  } catch (error) {
    if (!(error instanceof AlertError)) throw error;
    console.warn("⚠️ Sin canal de alertas configurado: la corrida sigue sin avisos al celular.");
  }

  const store = new SqliteLoadRunStore();
  const reports = new SqliteAuditReportRepository();
  const existing = await store.listUnits(args.runId);
  if (existing.length === 0) {
    await store.createRun(args.runId, selectLoadUnits(EMICRON_DB_PATH, { count: args.units, minSalesLastMonth: args.minSales }));
  }
  const plannedUnits = (await store.listUnits(args.runId)).length;
  const intervalMs = Math.round((args.hours * 3_600_000) / plannedUnits);

  // Bitácora local completa y evidencia de la corrida (con microdatos del DANE redactados)
  const log = new FanOutExecutionLog([new JsonlExecutionLog(), new JsonlExecutionLog(path.join(EVIDENCE_DIR, `${args.runId}.jsonl`))]);

  const executeUnit = async (unit: LoadUnit): Promise<UnitExecution> => {
    const unitRunId = `${args.runId}-U${String(unit.seq + 1).padStart(4, "0")}`;
    const recorder = new ExecutionRecorder(log, { runId: unitRunId, source: "emicron", label: unit.businessId, redactResult: true });
    recorder.start();
    try {
      const run = await buildEmicronRun(unit.businessId);
      const result = await new AgentOrchestrator(run.dataAdapter, new GrokLLMAdapter({ observer: recorder })).runAutonomousCycle(run.toolset);
      const totals = recorder.finish({ status: "success", result: result.recommendation });
      // La plataforma actúa: el dictamen queda guardado para el dueño del negocio
      await reports.save({
        runId: unitRunId,
        createdAt: new Date().toISOString(),
        businessId: unit.businessId,
        priority: result.recommendation.priority,
        title: result.recommendation.title,
        diagnosis: result.recommendation.diagnosis,
        actionPlan: result.recommendation.actionPlan,
      });
      const checks = [
        ...agentChecks({ status: "success", value: result }, recorder),
        check("Usó herramientas mensuales sobre datos reales del DANE", recorder.toolCalls.some((c) => MONTHLY_TOOLS.includes(c.tool)), "no usó herramientas mensuales"),
      ];
      const passed = recorder.validate(checks);
      const costUsd = Number.isFinite(totals.costUsd) ? totals.costUsd : 0;
      return {
        status: "done",
        costUsd,
        passed,
        report: { checks, toolCalls: recorder.toolCalls.map(({ tool, ok, errorCode }) => ({ tool, ok, errorCode })), totals },
      };
    } catch (error: any) {
      const code = error?.code ? String(error.code) : error?.status ? "LLM_API_ERROR" : "UNIT_ERROR";
      const message = error?.message ?? String(error);
      const totals = recorder.finish({ status: "error", error: { code, message } });
      recorder.validate([check("Terminó sin error", false, message)]);
      return {
        status: "failed",
        costUsd: Number.isFinite(totals.costUsd) ? totals.costUsd : 0,
        passed: false,
        errorCode: code,
        report: { error: { code, message }, checks: [], toolCalls: recorder.toolCalls.map(({ tool, ok, errorCode }) => ({ tool, ok, errorCode })), totals },
      };
    }
  };

  // Ctrl+C: termina las unidades en curso y deja el resto pendiente para retomar
  let stopRequested = false;
  process.on("SIGINT", () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    console.log("\n⏸️  Deteniendo: se terminan las unidades en curso. Ctrl+C otra vez para salir ya.");
  });

  console.log(`🏋️ Carga ${args.runId}: ${plannedUnits} unidades en ${args.hours} h (una cada ${(intervalMs / 1000).toFixed(1)} s), concurrencia ${args.concurrency}, tope US$${args.budgetUsd}.`);
  console.log(`   Para retomarla: npm run s4:carga -- --run-id ${args.runId}\n`);

  let completedSinceReport = 0;
  const summary = await runLoad({
    runId: args.runId,
    store,
    executeUnit: async (unit) => {
      const execution = await executeUnit(unit);
      console.log(`${execution.status === "done" ? (execution.passed ? "✅" : "⚠️") : "❌"} U${String(unit.seq + 1).padStart(4, "0")} ${unit.businessId} · US$${execution.costUsd.toFixed(4)}${execution.errorCode ? ` · ${execution.errorCode}` : ""}`);
      // El informe se regenera cada 25 unidades: si la corrida se corta, la evidencia está al día
      if (++completedSinceReport % 25 === 0) await writeLoadReport(store, args.runId, plannedUnits, args.budgetUsd);
      return execution;
    },
    alerts,
    intervalMs,
    maxConcurrency: args.concurrency,
    budgetUsd: args.budgetUsd,
    shouldStop: () => stopRequested,
  });

  const reportFile = await writeLoadReport(store, args.runId, plannedUnits, args.budgetUsd);
  console.log(`\n📊 ${summary.done} correctas · ${summary.failed} fallidas · ${summary.pending} pendientes · US$${summary.costUsd.toFixed(4)} (${summary.stoppedBy}).`);
  console.log(`📄 Informe: ${path.relative(process.cwd(), reportFile)}`);
  store.close();
  reports.close();
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});
