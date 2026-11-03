import { AuditReport, NewAuditReport } from "../domain/entities/AuditReport.js";

export interface AuditReportRepository {
  save(report: NewAuditReport): Promise<AuditReport>;
  // Más recientes primero
  list(filter?: { businessId?: string; runId?: string; limit?: number }): Promise<AuditReport[]>;
}
