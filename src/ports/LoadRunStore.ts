export type UnitStatus = "pending" | "running" | "done" | "failed";

// Una unidad de trabajo de la prueba de carga: auditar un micronegocio EMICRON
export interface LoadUnit {
  seq: number;
  businessId: string;
  status: UnitStatus;
  attempts: number;
  costUsd: number;
  errorCode: string | null;
  passed: boolean | null;
}

export interface UnitResult {
  status: "done" | "failed";
  attempts: number;
  costUsd: number;
  passed: boolean;
  errorCode?: string;
  // Reporte serializable de la ejecución (validaciones, herramientas, totales) para el informe final
  report?: unknown;
}

// Checkpoint persistente: permite retomar una corrida sin repetir unidades terminadas
export interface LoadRunStore {
  // Idempotente: si la corrida ya existe, no cambia nada
  createRun(runId: string, businessIds: string[]): Promise<void>;
  listUnits(runId: string): Promise<LoadUnit[]>;
  // Unidades que quedaron "running" por una caída vuelven a "pending"; devuelve cuántas
  resetRunning(runId: string): Promise<number>;
  markRunning(runId: string, seq: number): Promise<void>;
  saveResult(runId: string, seq: number, result: UnitResult): Promise<void>;
}
