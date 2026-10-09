import "dotenv/config";
import path from "node:path";
import { JsonFileFinancialAdapter } from "./adapters/repository/JsonFileFinancialAdapter.js";
import { AutonomousDecisionAdapter } from "./adapters/llm/AutonomousDecisionAdapter.js";
import { GrokLLMAdapter } from "./adapters/llm/GrokLLMAdapter.js";
import { AgentOrchestrator } from "./application/AgentOrchestrator.js";
import { ReportExporter } from "./infrastructure/ReportExporter.js";

async function main() {
  // Soporte para pasar la ruta de un caso de prueba por argumento CLI
  const customFilePath = process.argv[2];
  const targetJsonPath = customFilePath
    ? path.resolve(process.cwd(), customFilePath)
    : path.resolve(process.cwd(), "data", "transactions.json");

  console.log("\x1b[36m%s\x1b[0m", "==================================================");
  console.log("\x1b[1m\x1b[33m%s\x1b[0m", "🚀 FINANIA — COPILOTO FINANCIERO (AUDITORÍA STRICTA)");
  console.log("\x1b[36m%s\x1b[0m", "==================================================");
  console.log(`📂 Archivo de Transacciones: \x1b[35m${path.basename(targetJsonPath)}\x1b[0m\n`);

  const dataAdapter = new JsonFileFinancialAdapter(targetJsonPath);

  const useRealLLM = process.env.LLM_API_KEY && process.env.LLM_API_KEY !== "pk_placeholder";
  
  let llmAdapter;
  if (useRealLLM) {
    console.log("🌐 \x1b[32mConectando con LLM Real (Grok 4.7 @ https://api.reto.pltk.mx/v1)...\x1b[0m");
    llmAdapter = new GrokLLMAdapter();
  } else {
    console.log("⚡ \x1b[33mUsando Adaptador Mock Autónomo en memoria...\x1b[0m");
    llmAdapter = new AutonomousDecisionAdapter();
  }

  const orchestrator = new AgentOrchestrator(dataAdapter, llmAdapter);

  const { summary, recommendation } = await orchestrator.runAutonomousCycle();

  console.log("\n\x1b[36m%s\x1b[0m", "--------------------------------------------------");
  console.log("\x1b[1m\x1b[31m%s\x1b[0m", "📌 DICTAMEN DE AUDITORÍA FINANCIERA");
  console.log("\x1b[36m%s\x1b[0m", "--------------------------------------------------");
  console.log(`\x1b[1mTítulo:\x1b[0m ${recommendation.title}`);
  console.log(`\x1b[1mPrioridad:\x1b[0m \x1b[41m\x1b[37m ${recommendation.priority} \x1b[0m`);
  console.log(`\x1b[1mDiagnóstico:\x1b[0m ${recommendation.diagnosis}`);
  console.log("\n\x1b[1mAcciones Recomendadas:\x1b[0m");
  recommendation.actionPlan.forEach((action, idx) => {
    console.log(`  \x1b[33m${idx + 1}.\x1b[0m ${action}`);
  });
  console.log(`\n\x1b[1mImpacto Estimado:\x1b[0m \x1b[32m${recommendation.estimatedImpact}\x1b[0m`);

  if (recommendation.telemetry) {
    console.log("\n\x1b[36m%s\x1b[0m", "--------------------------------------------------");
    console.log("\x1b[1m\x1b[35m%s\x1b[0m", "⏱️ TELEMETRÍA DE EJECUCIÓN (SEMANA 3 PREVIEW)");
    console.log("\x1b[36m%s\x1b[0m", "--------------------------------------------------");
    console.log(`Modelo: \x1b[33m${recommendation.telemetry.model}\x1b[0m`);
    console.log(`Tiempo de respuesta: \x1b[32m${recommendation.telemetry.executionTimeMs} ms\x1b[0m`);
    console.log(`Prompt Tokens: ${recommendation.telemetry.promptTokens}`);
    console.log(`Completion Tokens: ${recommendation.telemetry.completionTokens}`);
    console.log(`Total Tokens: \x1b[1m${recommendation.telemetry.totalTokens}\x1b[0m`);
  }

  // Exportar el informe a Markdown automáticamente
  const reportPath = await ReportExporter.exportToMarkdown(summary, recommendation);
  console.log("\n\x1b[32m%s\x1b[0m", `📄 Informe exportado automáticamente en: ${reportPath}`);
  console.log("\x1b[36m%s\x1b[0m", "--------------------------------------------------\n");
}

main().catch((err) => {
  console.error("❌ Error en la ejecución del agente:", err);
});
