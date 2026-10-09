import { FinancialDataPort } from "../ports/FinancialDataPort.js";
import { LLMAgentPort } from "../ports/LLMAgentPort.js";
import { FinancialCalculator } from "../domain/services/FinancialCalculator.js";
import { FinancialRecommendation, FinancialSummary } from "../domain/entities/Financial.js";

export class AgentOrchestrator {
  constructor(
    private readonly dataAdapter: FinancialDataPort,
    private readonly llmAdapter: LLMAgentPort
  ) {}

  async runAutonomousCycle(): Promise<{ summary: FinancialSummary; recommendation: FinancialRecommendation }> {
    console.log("🤖 [Agente Financiero] Iniciando ciclo autónomo de análisis...");
    
    // 1. Obtener datos financieros
    const transactions = await this.dataAdapter.getTransactions();
    console.log(`📊 [Agente Financiero] Transacciones procesadas: ${transactions.length}`);

    // 2. Calcular resumen financiero (Dominio puro)
    const summary = FinancialCalculator.calculateSummary(transactions);
    console.log(`💰 [Agente Financiero] Ingresos: $${summary.totalIncome} | Gastos: $${summary.totalExpenses} | Beneficio Neto: $${summary.netProfit}`);

    // 3. Razonamiento y Toma de Decisión Autónoma (Puerto LLM/Agente)
    const recommendation = await this.llmAdapter.evaluateFinancialStatus(summary, transactions);
    console.log("💡 [Agente Financiero] Diagnóstico y plan generado exitosamente.");

    return { summary, recommendation };
  }
}

