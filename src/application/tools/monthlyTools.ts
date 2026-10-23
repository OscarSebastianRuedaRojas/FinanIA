import { z } from "zod";
import { MicroBusinessDataPort } from "../../ports/MicroBusinessDataPort.js";
import { MicroBusinessProfile, MonthlyFigures } from "../../domain/entities/MicroBusiness.js";
import { MonthlyFinancialAnalyzer as A } from "../../domain/services/MonthlyFinancialAnalyzer.js";
import { AgentTool, ToolError, defineTool } from "./AgentTool.js";

const businessIdSchema = z.string().min(1).describe("ID del micronegocio EMICRON (DIRECTORIO-SECUENCIA_P-SECUENCIA_ENCUESTA)");

// Herramientas mensuales sobre datos reales del DANE (EMICRON 2024) consultados en SQLite
export function createMonthlyTools(port: MicroBusinessDataPort, options: { minPeers?: number } = {}): AgentTool[] {
  const minPeers = options.minPeers ?? 5;

  async function loadBusiness(businessId: string): Promise<{ profile: MicroBusinessProfile; figures: MonthlyFigures }> {
    const [profile, figures] = await Promise.all([port.getProfile(businessId), port.getMonthlyFigures(businessId)]);
    if (!profile || !figures) {
      throw new ToolError("BUSINESS_NOT_FOUND", `No existe el micronegocio "${businessId}" en la base EMICRON.`);
    }
    return { profile, figures };
  }

  return [
    defineTool({
      name: "getMonthlyStatement",
      description:
        "Estado de resultados del último mes de un micronegocio real (DANE EMICRON): ventas, costos, gastos, impuestos, márgenes y desglose de cada línea sobre ventas.",
      schema: z.object({ businessId: businessIdSchema }),
      run: async ({ businessId }) => {
        const { profile, figures } = await loadBusiness(businessId);
        const lines = await port.getFinancialLines(businessId);
        const grossProfit = figures.salesLastMonth - figures.costsLastMonth;
        const operatingProfit = A.operatingProfit(figures);
        return {
          business: {
            id: profile.id,
            department: profile.departmentName,
            sector: profile.sectorName,
            referenceMonth: profile.referenceMonth,
          },
          salesLastMonth: figures.salesLastMonth,
          costsLastMonth: figures.costsLastMonth,
          expensesLastMonth: figures.expensesLastMonth,
          taxesAndLicensesLastMonth: figures.taxesAndLicensesLastMonth,
          grossProfit,
          grossMarginPct: A.pct(grossProfit, figures.salesLastMonth),
          operatingProfit,
          operatingMarginPct: A.pct(operatingProfit, figures.salesLastMonth),
          lines: lines.map((line) => ({ ...line, shareOfSalesPct: A.pct(line.amount, figures.salesLastMonth) })),
        };
      },
    }),
    defineTool({
      name: "compareWithSectorPeers",
      description:
        "Compara el margen operativo y las ventas del micronegocio contra pares reales de su mismo sector, en su departamento o a nivel nacional. Si no hay pares suficientes en el departamento, reintentá con scope 'national'.",
      schema: z.object({
        businessId: businessIdSchema,
        scope: z.enum(["department", "national"]).default("department").describe("Alcance de la comparación"),
      }),
      run: async ({ businessId, scope }) => {
        const { profile, figures } = await loadBusiness(businessId);
        const peers = await port.getSectorPeers(
          profile.sectorCode,
          scope === "department" ? profile.departmentCode : null,
          businessId
        );
        if (peers.length < minPeers) {
          throw new ToolError(
            "INSUFFICIENT_PEERS",
            `Solo hay ${peers.length} pares con ventas en ${scope === "department" ? profile.departmentName : "el país"} (mínimo ${minPeers}). Probá con scope "national".`
          );
        }
        const peerMargins = peers.map((peer) => A.pct(A.operatingProfit(peer), peer.salesLastMonth) ?? 0);
        const businessMargin = A.pct(A.operatingProfit(figures), figures.salesLastMonth);
        return {
          scope,
          sector: profile.sectorName,
          department: scope === "department" ? profile.departmentName : "Nacional",
          peers: peers.length,
          businessOperatingMarginPct: businessMargin,
          peerMedianOperatingMarginPct: A.round2(A.median(peerMargins)),
          businessSalesLastMonth: figures.salesLastMonth,
          peerMedianSalesLastMonth: A.median(peers.map((peer) => peer.salesLastMonth)),
          operatingMarginPercentile: businessMargin === null ? null : A.percentile(businessMargin, peerMargins),
        };
      },
    }),
    defineTool({
      name: "getYearOverYearSales",
      description:
        "Compara las ventas del último mes contra el mismo mes del año anterior y contra el promedio mensual del año anterior (según los meses que operó).",
      schema: z.object({ businessId: businessIdSchema }),
      run: async ({ businessId }) => {
        const { figures } = await loadBusiness(businessId);
        const averageMonthlySalesLastYear =
          figures.monthsOperatedLastYear > 0 ? A.round2(figures.salesLastYear / figures.monthsOperatedLastYear) : null;
        return {
          salesLastMonth: figures.salesLastMonth,
          salesSameMonthLastYear: figures.salesSameMonthLastYear,
          yearOverYearChangePct: A.pct(figures.salesLastMonth - figures.salesSameMonthLastYear, figures.salesSameMonthLastYear),
          salesLastYear: figures.salesLastYear,
          monthsOperatedLastYear: figures.monthsOperatedLastYear,
          averageMonthlySalesLastYear,
          lastMonthVsAveragePct:
            averageMonthlySalesLastYear === null
              ? null
              : A.pct(figures.salesLastMonth - averageMonthlySalesLastYear, averageMonthlySalesLastYear),
        };
      },
    }),
  ];
}
