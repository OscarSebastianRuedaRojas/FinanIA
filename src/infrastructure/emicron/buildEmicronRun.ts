import path from "node:path";
import { FinancialDataPort } from "../../ports/FinancialDataPort.js";
import { AgentToolset } from "../../ports/AgentToolPort.js";
import { SqliteMicroBusinessAdapter } from "../../adapters/repository/SqliteMicroBusinessAdapter.js";
import { EmicronBusinessTransactionsAdapter } from "../../adapters/repository/EmicronBusinessTransactionsAdapter.js";
import { createMonthlyTools } from "../../application/tools/monthlyTools.js";

export const EMICRON_DB_PATH = path.resolve(process.cwd(), "data", "emicron.sqlite");

// Modo EMICRON: micronegocio real del DANE con herramientas mensuales (id opcional, si falta se elige al azar)
export async function buildEmicronRun(
  requestedId?: string,
  dbPath: string = EMICRON_DB_PATH
): Promise<{ businessId: string; dataAdapter: FinancialDataPort; toolset: AgentToolset; label: string }> {
  const port = new SqliteMicroBusinessAdapter(dbPath);
  const businessId = requestedId ?? (await port.getRandomBusinessId());
  if (!businessId) {
    throw new Error('La base EMICRON está vacía. Ejecutá "npm run data:emicron".');
  }
  const profile = await port.getProfile(businessId);
  if (!profile) {
    throw new Error(`No existe el micronegocio "${businessId}" en la base EMICRON.`);
  }
  return {
    businessId,
    dataAdapter: new EmicronBusinessTransactionsAdapter(port, businessId),
    label: `EMICRON ${businessId} — ${profile.sectorName} (${profile.departmentName})`,
    toolset: {
      tools: createMonthlyTools(port),
      context: `Auditás el micronegocio real "${businessId}" (${profile.sectorName}, ${profile.departmentName}) de la Encuesta de Micronegocios del DANE (EMICRON 2024). Las cifras están en pesos colombianos y corresponden al mes anterior a ${profile.referenceMonth}. Usá businessId "${businessId}" en las herramientas mensuales.`,
    },
  };
}
