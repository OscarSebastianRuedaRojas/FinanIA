import "dotenv/config";
import { GrokGoalAgent } from "./adapters/llm/GrokGoalAgent.js";
import { GrokVisionAdapter } from "./adapters/llm/GrokVisionAdapter.js";
import { SqliteMicroBusinessAdapter } from "./adapters/repository/SqliteMicroBusinessAdapter.js";
import { SqliteAuditReportRepository } from "./adapters/repository/SqliteAuditReportRepository.js";
import { ExecutionRecorder } from "./application/ExecutionRecorder.js";
import { ScanInvoiceUseCase } from "./application/ScanInvoiceUseCase.js";
import { buildGoalToolset } from "./application/goalToolset.js";
import { EMICRON_DB_PATH } from "./infrastructure/emicron/buildEmicronRun.js";
import { readInvoiceImage } from "./infrastructure/invoice/readInvoiceImage.js";
import { JsonlExecutionLog } from "./infrastructure/logging/JsonlExecutionLog.js";
import { createAlertChannelFromEnv } from "./adapters/notifications/createAlertChannel.js";
import { AlertError, AlertPort } from "./ports/AlertPort.js";

const USAGE = 'Uso: npm run agent -- "<objetivo>"\nEj.: npm run agent -- "Encontrá los 3 restaurantes de Antioquia con peor margen y guardá un plan para cada uno"';

async function main(): Promise<number> {
  const goal = process.argv.slice(2).join(" ").trim();
  if (!goal) {
    console.error(USAGE);
    return 1;
  }
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === "pk_placeholder") {
    console.error("❌ LLM_API_KEY no está configurada: el agente razona con Grok real.");
    return 1;
  }

  // sendAlert solo se ofrece al agente si hay un canal de alertas en el .env (ntfy o WhatsApp)
  let alerts: AlertPort | undefined;
  try {
    alerts = createAlertChannelFromEnv();
  } catch (error) {
    if (!(error instanceof AlertError)) throw error;
  }

  const runId = `goal-${Date.now()}`;
  // El resumen cita cifras de negocios reales: en la bitácora solo queda la estructura (licencia DANE)
  const recorder = new ExecutionRecorder(new JsonlExecutionLog(), { runId, source: "goal", label: goal.slice(0, 120), redactResult: true });
  const businesses = new SqliteMicroBusinessAdapter(EMICRON_DB_PATH);
  const reports = new SqliteAuditReportRepository();
  const toolset = buildGoalToolset({
    businesses,
    reports,
    runId,
    scanInvoice: {
      scan: (file) => new ScanInvoiceUseCase(new GrokVisionAdapter({ observer: recorder }), readInvoiceImage).execute(file),
      root: process.cwd(),
    },
    alerts,
  });

  console.log("\x1b[36m%s\x1b[0m", "==================================================");
  console.log("\x1b[1m\x1b[33m%s\x1b[0m", "🎯 FINANIA — AGENTE AUTÓNOMO POR OBJETIVO");
  console.log("\x1b[36m%s\x1b[0m", "==================================================");
  console.log(`Objetivo: \x1b[35m${goal}\x1b[0m`);
  console.log(alerts ? "📲 Alertas: activadas\n" : "📲 Alertas: desactivadas (configurá NTFY_TOPIC o Twilio en el .env)\n");

  recorder.start();
  try {
    const outcome = await new GrokGoalAgent({ observer: recorder }).pursueGoal(goal, toolset);
    const saved = await reports.list({ runId });
    const totals = recorder.finish({
      status: "success",
      result: { priority: outcome.findings[0]?.priority, actionPlan: outcome.nextSteps },
    });

    console.log("\n\x1b[1m📌 INFORME DEL AGENTE\x1b[0m");
    console.log(outcome.summary);
    if (outcome.findings.length) {
      console.log("\n\x1b[1mHallazgos:\x1b[0m");
      outcome.findings.forEach((f) => console.log(`  [${f.priority}] ${f.businessId ?? "General"} — ${f.headline}`));
    }
    if (outcome.nextSteps.length) {
      console.log("\n\x1b[1mPróximos pasos:\x1b[0m");
      outcome.nextSteps.forEach((step, idx) => console.log(`  ${idx + 1}. ${step}`));
    }

    console.log(`\n\x1b[1m💾 Dictámenes guardados por el agente: ${saved.length}\x1b[0m`);
    saved
      .slice()
      .reverse()
      .forEach((r) => console.log(`  #${r.id} [${r.priority}] ${r.businessId ?? "General"} — ${r.title}`));

    console.log(
      `\n⏱️ ${totals.llmCalls} llamadas a Grok · ${totals.toolCalls} herramientas (${totals.toolErrors} con error) · ${totals.totalTokens} tokens · US$${totals.costUsd.toFixed(4)}`
    );
    if (outcome.forcedFinalAnswer) console.log("⚠️ El agente agotó sus iteraciones y se forzó el cierre del informe.");
    console.log("\nFuente: Departamento Administrativo Nacional de Estadística: www.dane.gov.co");
    return 0;
  } catch (error: any) {
    recorder.finish({ status: "error", error: { message: error?.message ?? String(error) } });
    console.error(`\x1b[31m❌ ${error?.message ?? error}\x1b[0m`);
    return 1;
  } finally {
    businesses.close();
    reports.close();
  }
}

main().then((code) => {
  process.exitCode = code;
});
