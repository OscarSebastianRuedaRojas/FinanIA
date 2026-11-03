import { z } from "zod";

// Informe final del agente cuando persigue un objetivo en texto libre
export const GoalReportSchema = z.object({
  summary: z.string().trim().min(1),
  findings: z.array(
    z.object({
      businessId: z.string().nullable(),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
      headline: z.string().trim().min(1),
    })
  ),
  nextSteps: z.array(z.string()),
});

export type GoalReport = z.infer<typeof GoalReportSchema>;
