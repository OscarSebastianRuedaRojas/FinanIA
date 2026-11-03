import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LoadRunStore, LoadUnit, UnitResult, UnitStatus } from "../../ports/LoadRunStore.js";
import { DataSourceError } from "../../ports/MicroBusinessDataPort.js";
import { DEFAULT_APP_DB_PATH } from "./SqliteAuditReportRepository.js";

// Checkpoint de las corridas de carga en la base propia de FinanIA
export class SqliteLoadRunStore implements LoadRunStore {
  private db: DatabaseSync | null = null;

  constructor(private readonly dbPath: string = DEFAULT_APP_DB_PATH) {}

  async createRun(runId: string, businessIds: string[]): Promise<void> {
    this.query((db) => {
      const insert = db.prepare("INSERT OR IGNORE INTO load_units (run_id, seq, business_id) VALUES (?, ?, ?)");
      db.exec("BEGIN");
      try {
        businessIds.forEach((businessId, seq) => insert.run(runId, seq, businessId));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    });
  }

  async listUnits(runId: string): Promise<LoadUnit[]> {
    const rows = this.query((db) => db.prepare("SELECT * FROM load_units WHERE run_id = ? ORDER BY seq").all(runId));
    return rows.map((row) => ({
      seq: Number(row.seq),
      businessId: String(row.business_id),
      status: String(row.status) as UnitStatus,
      attempts: Number(row.attempts),
      costUsd: Number(row.cost_usd),
      errorCode: row.error_code === null ? null : String(row.error_code),
      passed: row.passed === null ? null : Number(row.passed) === 1,
    }));
  }

  async resetRunning(runId: string): Promise<number> {
    const result = this.query((db) => db.prepare("UPDATE load_units SET status = 'pending' WHERE run_id = ? AND status = 'running'").run(runId));
    return Number(result.changes);
  }

  async markRunning(runId: string, seq: number): Promise<void> {
    this.query((db) =>
      db.prepare("UPDATE load_units SET status = 'running', started_at = ? WHERE run_id = ? AND seq = ?").run(new Date().toISOString(), runId, seq)
    );
  }

  async saveResult(runId: string, seq: number, result: UnitResult): Promise<void> {
    this.query((db) =>
      db
        .prepare(
          `UPDATE load_units SET status = ?, attempts = ?, cost_usd = ?, passed = ?, error_code = ?, report = ?, finished_at = ?
           WHERE run_id = ? AND seq = ?`
        )
        .run(
          result.status,
          result.attempts,
          result.costUsd,
          result.passed ? 1 : 0,
          result.errorCode ?? null,
          result.report === undefined ? null : JSON.stringify(result.report),
          new Date().toISOString(),
          runId,
          seq
        )
    );
  }

  async listReports(runId: string): Promise<{ seq: number; businessId: string; report: unknown }[]> {
    const rows = this.query((db) =>
      db.prepare("SELECT seq, business_id, report FROM load_units WHERE run_id = ? AND report IS NOT NULL ORDER BY seq").all(runId)
    );
    return rows.map((row) => ({ seq: Number(row.seq), businessId: String(row.business_id), report: JSON.parse(String(row.report)) }));
  }

  async listRuns(): Promise<string[]> {
    return this.query((db) => db.prepare("SELECT DISTINCT run_id FROM load_units ORDER BY run_id").all()).map((row) => String(row.run_id));
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
        this.db.exec(`CREATE TABLE IF NOT EXISTS load_units (
          run_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          business_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          passed INTEGER,
          error_code TEXT,
          report TEXT,
          started_at TEXT,
          finished_at TEXT,
          PRIMARY KEY (run_id, seq)
        )`);
      }
      return fn(this.db);
    } catch (error: any) {
      throw new DataSourceError(`No se pudo usar el checkpoint de carga en ${this.dbPath}: ${error.message}`);
    }
  }
}
