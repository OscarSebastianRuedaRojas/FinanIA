import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AuditReport, AuditPriority, NewAuditReport } from "../../domain/entities/AuditReport.js";
import { AuditReportRepository } from "../../ports/AuditReportRepository.js";
import { DataSourceError } from "../../ports/MicroBusinessDataPort.js";

export const DEFAULT_APP_DB_PATH = path.resolve(process.cwd(), "data", "finania.sqlite");

// Base propia de FinanIA (escritura), separada de la base del DANE que es de solo lectura
export class SqliteAuditReportRepository implements AuditReportRepository {
  private db: DatabaseSync | null = null;

  constructor(private readonly dbPath: string = DEFAULT_APP_DB_PATH) {}

  async save(report: NewAuditReport): Promise<AuditReport> {
    const result = this.query((db) =>
      db
        .prepare(
          `INSERT INTO audit_reports (run_id, created_at, business_id, priority, title, diagnosis, action_plan)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          report.runId,
          report.createdAt,
          report.businessId,
          report.priority,
          report.title,
          report.diagnosis,
          JSON.stringify(report.actionPlan)
        )
    );
    return { id: Number(result.lastInsertRowid), ...report };
  }

  async list(filter: { businessId?: string; runId?: string; limit?: number } = {}): Promise<AuditReport[]> {
    const rows = this.query((db) =>
      db
        .prepare(
          `SELECT * FROM audit_reports
           WHERE (? IS NULL OR business_id = ?) AND (? IS NULL OR run_id = ?)
           ORDER BY id DESC LIMIT ?`
        )
        .all(
          filter.businessId ?? null,
          filter.businessId ?? null,
          filter.runId ?? null,
          filter.runId ?? null,
          filter.limit ?? 100
        )
    );
    return rows.map((row) => ({
      id: Number(row.id),
      runId: row.run_id === null ? null : String(row.run_id),
      createdAt: String(row.created_at),
      businessId: row.business_id === null ? null : String(row.business_id),
      priority: String(row.priority) as AuditPriority,
      title: String(row.title),
      diagnosis: String(row.diagnosis),
      actionPlan: JSON.parse(String(row.action_plan)),
    }));
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private query<T>(fn: (db: DatabaseSync) => T): T {
    try {
      if (!this.db) {
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        this.db = new DatabaseSync(this.dbPath);
        this.db.exec(`CREATE TABLE IF NOT EXISTS audit_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT,
          created_at TEXT NOT NULL,
          business_id TEXT,
          priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
          title TEXT NOT NULL,
          diagnosis TEXT NOT NULL,
          action_plan TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reports_business ON audit_reports(business_id);
        CREATE INDEX IF NOT EXISTS idx_reports_run ON audit_reports(run_id);`);
      }
      return fn(this.db);
    } catch (error: any) {
      throw new DataSourceError(`No se pudo usar la base de FinanIA en ${this.dbPath}: ${error.message}`);
    }
  }
}
