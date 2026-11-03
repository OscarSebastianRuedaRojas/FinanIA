export type AuditPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// Dictamen que el agente decidió guardar en la base propia de FinanIA
export interface AuditReport {
  id: number;
  runId: string | null;
  createdAt: string;
  businessId: string | null;
  priority: AuditPriority;
  title: string;
  diagnosis: string;
  actionPlan: string[];
}

export type NewAuditReport = Omit<AuditReport, "id">;
