import fs from "node:fs";
import path from "node:path";
import { ExecutionEvent, ExecutionLogPort } from "../../ports/ExecutionLogPort.js";

export const DEFAULT_EXECUTION_LOG_PATH =
  process.env.EXECUTION_LOG_PATH || path.resolve(process.cwd(), "logs", "executions.jsonl");

// Bitácora en JSON Lines: un evento por línea, solo se agregan líneas (append-only)
export class JsonlExecutionLog implements ExecutionLogPort {
  constructor(private readonly filePath: string = DEFAULT_EXECUTION_LOG_PATH) {}

  record(event: ExecutionEvent): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf-8");
    } catch (error: any) {
      console.warn(`⚠️ [Bitácora] No se pudo escribir en ${this.filePath}: ${error.message}`);
    }
  }
}

// Envía cada evento a varias bitácoras (ej. la local y la de evidencia)
export class FanOutExecutionLog implements ExecutionLogPort {
  constructor(private readonly logs: ExecutionLogPort[]) {}

  record(event: ExecutionEvent): void {
    this.logs.forEach((log) => log.record(event));
  }
}
