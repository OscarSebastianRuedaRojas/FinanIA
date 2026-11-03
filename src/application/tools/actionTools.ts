import { z } from "zod";
import { AuditReportRepository } from "../../ports/AuditReportRepository.js";
import { MicroBusinessDataPort } from "../../ports/MicroBusinessDataPort.js";
import { AgentTool, ToolError, defineTool } from "./AgentTool.js";

// Herramientas con las que el agente actúa sobre la plataforma (no solo consulta)
export function createActionTools(
  reports: AuditReportRepository,
  businesses: MicroBusinessDataPort,
  context: { runId: string | null; now?: () => Date }
): AgentTool[] {
  const now = context.now ?? (() => new Date());

  return [
    defineTool({
      name: "saveAuditReport",
      description:
        "Guarda un dictamen en la base de FinanIA para que el dueño del negocio lo consulte después. Usala para cada negocio que auditaste y, si el objetivo lo pide, para un resumen general (sin businessId).",
      schema: z.object({
        businessId: z.string().min(1).optional().describe("ID EMICRON del micronegocio auditado; omitir para un resumen general"),
        priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
        title: z.string().trim().min(1),
        diagnosis: z.string().trim().min(1),
        actionPlan: z.array(z.string().trim().min(1)).min(1).describe("Acciones concretas, en orden de prioridad"),
      }),
      run: async ({ businessId, priority, title, diagnosis, actionPlan }) => {
        if (businessId && !(await businesses.getProfile(businessId))) {
          throw new ToolError("BUSINESS_NOT_FOUND", `No existe el micronegocio "${businessId}" en la base EMICRON.`);
        }
        const saved = await reports.save({
          runId: context.runId,
          createdAt: now().toISOString(),
          businessId: businessId ?? null,
          priority,
          title,
          diagnosis,
          actionPlan,
        });
        return { reportId: saved.id, savedAt: saved.createdAt };
      },
    }),
  ];
}
