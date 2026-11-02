import { AgentToolset } from "../ports/AgentToolPort.js";
import { AuditReportRepository } from "../ports/AuditReportRepository.js";
import { MicroBusinessDataPort } from "../ports/MicroBusinessDataPort.js";
import { ScanInvoiceOutcome } from "./ScanInvoiceUseCase.js";
import { createSearchTools } from "./tools/searchTools.js";
import { createMonthlyTools } from "./tools/monthlyTools.js";
import { createActionTools } from "./tools/actionTools.js";
import { createInvoiceTools } from "./tools/invoiceTools.js";

// Herramientas del agente por objetivo: buscar, auditar, actuar y (opcional) leer facturas
export function buildGoalToolset(deps: {
  businesses: MicroBusinessDataPort;
  reports: AuditReportRepository;
  runId: string | null;
  scanInvoice?: { scan: (absolutePath: string) => Promise<ScanInvoiceOutcome>; root: string };
}): AgentToolset {
  return {
    tools: [
      ...createSearchTools(deps.businesses),
      ...createMonthlyTools(deps.businesses),
      ...createActionTools(deps.reports, deps.businesses, { runId: deps.runId }),
      ...(deps.scanInvoice ? createInvoiceTools(deps.scanInvoice.scan, { root: deps.scanInvoice.root }) : []),
    ],
    context:
      "Trabajás sobre 78.501 micronegocios reales de Colombia (Encuesta de Micronegocios EMICRON 2024 del DANE); las cifras están en pesos colombianos y corresponden al último mes reportado.",
  };
}
