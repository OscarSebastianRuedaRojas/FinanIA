import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { ReportExporter } from "../src/infrastructure/ReportExporter.js";
import { FinancialSummary, FinancialRecommendation } from "../src/domain/entities/Financial.js";

describe("ReportExporter", () => {
  const testReportPath = path.resolve(process.cwd(), "scratch", "test_report.md");

  afterEach(async () => {
    try {
      await fs.unlink(testReportPath);
    } catch {}
  });

  it("debe exportar un informe de auditoría en Markdown correctamente", async () => {
    const summary: FinancialSummary = {
      totalIncome: 10000,
      totalExpenses: 7000,
      netProfit: 3000,
      expenseRatio: 70,
      profitMargin: 30,
      cashFlowRisk: "LOW",
      recentTransactionsCount: 5,
      topExpenseCategory: "Proveedores ($5000)",
      expensesByCategory: { Proveedores: 5000, Servicios: 2000 },
    };

    const recommendation: FinancialRecommendation = {
      title: "Dictamen Favorable",
      priority: "LOW",
      diagnosis: "Operación saludable con margen positivo.",
      actionPlan: ["Mantener control de egresos."],
      estimatedImpact: "Estabilidad sostenida.",
      telemetry: {
        executionTimeMs: 150,
        promptTokens: 500,
        completionTokens: 100,
        totalTokens: 600,
        model: "grok-4.7",
      },
    };

    const exportedPath = await ReportExporter.exportToMarkdown(
      summary,
      recommendation,
      testReportPath
    );

    expect(exportedPath).toBe(testReportPath);

    const fileContent = await fs.readFile(testReportPath, "utf-8");
    expect(fileContent).toContain("# 📑 Informe Ejecutivo de Auditoría Financiera — FinanIA");
    expect(fileContent).toContain("grok-4.7");
    expect(fileContent).toContain("Ingresos Totales");
  });
});
