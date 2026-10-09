import "dotenv/config";
import { JsonFileFinancialAdapter } from "./adapters/repository/JsonFileFinancialAdapter.js";
import { AutonomousDecisionAdapter } from "./adapters/llm/AutonomousDecisionAdapter.js";
import { GrokLLMAdapter } from "./adapters/llm/GrokLLMAdapter.js";
import { AgentOrchestrator } from "./application/AgentOrchestrator.js";

async function main() {
  console.log("==================================================");
  console.log("🚀 FINANIA — COPILOTO FINANCIERO (AUDITORÍA STRICTA)");
  console.log("==================================================\n");

  const dataAdapter = new JsonFileFinancialAdapter();

  const useRealLLM = process.env.LLM_API_KEY && process.env.LLM_API_KEY !== "pk_placeholder";
  
  let llmAdapter;
  if (useRealLLM) {
    console.log("🌐 Conectando con LLM Real (Grok 4.7)...");
    llmAdapter = new GrokLLMAdapter();
  } else {
    console.log("⚡ Usando Adaptador Mock Autónomo en memoria...");
    llmAdapter = new AutonomousDecisionAdapter();
  }

  const orchestrator = new AgentOrchestrator(dataAdapter, llmAdapter);

  const { summary, recommendation } = await orchestrator.runAutonomousCycle();

  console.log("\n--------------------------------------------------");
  console.log("📌 DICTAMEN DE AUDITORÍA FINANCIERA");
  console.log("--------------------------------------------------");
  console.log(`Título: ${recommendation.title}`);
  console.log(`Prioridad: ${recommendation.priority}`);
  console.log(`Diagnóstico: ${recommendation.diagnosis}`);
  console.log("\nAcciones Recomendadas:");
  recommendation.actionPlan.forEach((action, idx) => {
    console.log(`  ${idx + 1}. ${action}`);
  });
  console.log(`\nImpacto Estimado: ${recommendation.estimatedImpact}`);

  if (recommendation.telemetry) {
    console.log("\n--------------------------------------------------");
    console.log("⏱️ TELEMETRÍA DE EJECUCIÓN (SEMANA 3 PREVIEW)");
    console.log("--------------------------------------------------");
    console.log(`Modelo: ${recommendation.telemetry.model}`);
    console.log(`Tiempo de respuesta: ${recommendation.telemetry.executionTimeMs} ms`);
    console.log(`Prompt Tokens: ${recommendation.telemetry.promptTokens}`);
    console.log(`Completion Tokens: ${recommendation.telemetry.completionTokens}`);
    console.log(`Total Tokens: ${recommendation.telemetry.totalTokens}`);
  }
  console.log("--------------------------------------------------\n");
}

main().catch((err) => {
  console.error("❌ Error en la ejecución del agente:", err);
});
