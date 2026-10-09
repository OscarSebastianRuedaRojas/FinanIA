import fs from "node:fs/promises";
import path from "node:path";
import { FinancialSummary, FinancialRecommendation } from "../domain/entities/Financial.js";

export class ReportExporter {
  static async exportToMarkdown(
    summary: FinancialSummary,
    recommendation: FinancialRecommendation,
    outputFilePath?: string
  ): Promise<string> {
    const targetPath =
      outputFilePath || path.resolve(process.cwd(), "reports", "audit_report_latest.md");

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const timestamp = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

    const markdownContent = `# 📑 Informe Ejecutivo de Auditoría Financiera — FinanIA

**Fecha de Generación**: ${timestamp}  
**Modelo Evaluador**: ${recommendation.telemetry?.model || "Grok 4.7"}  
**Prioridad de Atención**: \`${recommendation.priority}\`  
**Riesgo de Flujo de Caja**: \`${summary.cashFlowRisk}\`  

---

## 📊 Resumen Ejecutivo Precalculado (Dominio)

| Métrica | Valor |
| :--- | :--- |
| **Ingresos Totales** | \`$${summary.totalIncome.toLocaleString()}\` |
| **Egresos Totales** | \`$${summary.totalExpenses.toLocaleString()}\` |
| **Beneficio Neto** | \`$${summary.netProfit.toLocaleString()}\` |
| **Ratio de Gastos sobre Ingresos** | \`${summary.expenseRatio}%\` |
| **Margen de Ganancia Neto** | \`${summary.profitMargin}%\` |
| **Categoría Principal de Gasto** | \`${summary.topExpenseCategory}\` |
| **Total Transacciones Auditadas** | \`${summary.recentTransactionsCount}\` |

---

## 🔍 Dictamen del Auditor Financiero (Grok 4.7)

### **${recommendation.title}**

> **Diagnóstico**:  
> ${recommendation.diagnosis}

### 💡 Plan de Acción Recomendado:
${recommendation.actionPlan.map((action, idx) => `${idx + 1}. ${action}`).join("\n")}

### 🎯 Impacto Estimado:
> ${recommendation.estimatedImpact}

---

## ⏱️ Telemetría de Ejecución (Semana 3 Preview)

- **Tiempo de Respuesta**: \`${recommendation.telemetry?.executionTimeMs || 0} ms\`
- **Prompt Tokens**: \`${recommendation.telemetry?.promptTokens || 0}\`
- **Completion Tokens**: \`${recommendation.telemetry?.completionTokens || 0}\`
- **Total Tokens Consumidos**: \`${recommendation.telemetry?.totalTokens || 0}\`
`;

    await fs.writeFile(targetPath, markdownContent, "utf-8");
    return targetPath;
  }
}
