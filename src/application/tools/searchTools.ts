import { z } from "zod";
import { MicroBusinessDataPort } from "../../ports/MicroBusinessDataPort.js";
import { CatalogEntry } from "../../domain/entities/MicroBusiness.js";
import { MonthlyFinancialAnalyzer as A } from "../../domain/services/MonthlyFinancialAnalyzer.js";
import { AgentTool, ToolError, defineTool } from "./AgentTool.js";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Resuelve un sector o departamento por código DANE, nombre exacto o fragmento único del nombre
function resolve(input: string, entries: CatalogEntry[], kind: "sector" | "departamento"): CatalogEntry {
  const query = normalize(input);
  const byCode = entries.find((entry) => entry.code === input.trim().padStart(2, "0"));
  if (/^\d{1,2}$/.test(input.trim()) && byCode) return byCode;

  const exact = entries.find((entry) => normalize(entry.name) === query);
  if (exact) return exact;

  const matches = entries.filter((entry) => normalize(entry.name).includes(query));
  if (matches.length === 1) return matches[0];

  const options = (matches.length > 1 ? matches : entries).map((entry) => `${entry.code} ${entry.name}`).join("; ");
  throw new ToolError(
    "INVALID_ARGUMENTS",
    matches.length > 1
      ? `El ${kind} "${input}" es ambiguo; coincide con: ${options}. Usá el código o un nombre más preciso.`
      : `No existe el ${kind} "${input}". Opciones válidas: ${options}.`
  );
}

// Búsqueda sobre los 78.501 micronegocios reales de EMICRON para que el agente elija a quién auditar
export function createSearchTools(port: MicroBusinessDataPort): AgentTool[] {
  return [
    defineTool({
      name: "findBusinesses",
      description:
        "Busca micronegocios reales (DANE EMICRON) filtrando por sector y/o departamento y los ordena por una métrica: margen operativo del último mes, ventas del último mes o variación interanual de ventas. Devuelve hasta 20 IDs para auditarlos después. Sugerencia: usá minSalesLastMonth para evitar negocios con ventas casi nulas, que distorsionan los márgenes.",
      schema: z.object({
        sector: z.string().min(1).optional().describe("Nombre o código DANE del sector (GRUPOS12), ej. 'Alojamiento y servicios de comida' o '07'"),
        department: z.string().min(1).optional().describe("Nombre o código DIVIPOLA del departamento, ej. 'Antioquia' o '05'"),
        rankBy: z.enum(["operatingMargin", "salesLastMonth", "yearOverYearChange"]).describe("Métrica para ordenar"),
        order: z.enum(["asc", "desc"]).default("asc").describe("asc = peores primero en margen o variación"),
        limit: z.number().int().min(1).max(20).default(10),
        minSalesLastMonth: z.number().min(0).default(0).describe("Ventas mínimas del último mes en pesos colombianos"),
      }),
      run: async ({ sector, department, rankBy, order, limit, minSalesLastMonth }) => {
        const [sectors, departments] = await Promise.all([port.listSectors(), port.listDepartments()]);
        const sectorEntry = sector ? resolve(sector, sectors, "sector") : null;
        const departmentEntry = department ? resolve(department, departments, "departamento") : null;

        const businesses = await port.rankBusinesses({
          sectorCode: sectorEntry?.code ?? null,
          departmentCode: departmentEntry?.code ?? null,
          rankBy,
          order,
          limit,
          minSalesLastMonth,
        });
        return {
          criteria: {
            sector: sectorEntry?.name ?? "Todos",
            department: departmentEntry?.name ?? "Nacional",
            rankBy,
            order,
            minSalesLastMonth,
          },
          count: businesses.length,
          businesses: businesses.map((b) => ({
            businessId: b.businessId,
            sector: b.sectorName,
            department: b.departmentName,
            salesLastMonth: b.salesLastMonth,
            operatingMarginPct: A.round2(b.operatingMarginPct),
            yearOverYearChangePct: b.yearOverYearChangePct === null ? null : A.round2(b.yearOverYearChangePct),
          })),
        };
      },
    }),
  ];
}
