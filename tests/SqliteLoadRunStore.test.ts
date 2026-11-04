import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteLoadRunStore } from "../src/adapters/repository/SqliteLoadRunStore.js";

describe("SqliteLoadRunStore (S3.2)", () => {
  let tmpDir: string;
  let dbPath: string;
  let store: SqliteLoadRunStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-store-"));
    dbPath = path.join(tmpDir, "finania.sqlite");
    store = new SqliteLoadRunStore(dbPath);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe crear la corrida con sus unidades pendientes en orden", async () => {
    await store.createRun("run-1", ["a", "b", "c"]);

    expect(await store.listUnits("run-1")).toEqual([
      { seq: 0, businessId: "a", status: "pending", attempts: 0, costUsd: 0, errorCode: null, passed: null },
      { seq: 1, businessId: "b", status: "pending", attempts: 0, costUsd: 0, errorCode: null, passed: null },
      { seq: 2, businessId: "c", status: "pending", attempts: 0, costUsd: 0, errorCode: null, passed: null },
    ]);
  });

  it("debe ser idempotente: crear de nuevo la corrida no borra el avance", async () => {
    await store.createRun("run-1", ["a", "b"]);
    await store.saveResult("run-1", 0, { status: "done", attempts: 1, costUsd: 0.01, passed: true });

    await store.createRun("run-1", ["a", "b"]);

    expect((await store.listUnits("run-1"))[0]).toMatchObject({ status: "done", costUsd: 0.01 });
  });

  it("debe persistir el avance entre procesos y reencolar las unidades que quedaron corriendo", async () => {
    await store.createRun("run-1", ["a", "b", "c"]);
    await store.saveResult("run-1", 0, { status: "failed", attempts: 2, costUsd: 0.004, passed: false, errorCode: "VISION_API_ERROR", report: { checks: [] } });
    await store.markRunning("run-1", 1);
    store.close();

    const reopened = new SqliteLoadRunStore(dbPath);
    const requeued = await reopened.resetRunning("run-1");
    const units = await reopened.listUnits("run-1");
    reopened.close();

    expect(requeued).toBe(1);
    expect(units.map((u) => [u.status, u.attempts, u.errorCode, u.passed])).toEqual([
      ["failed", 2, "VISION_API_ERROR", false],
      ["pending", 0, null, null],
      ["pending", 0, null, null],
    ]);
  });

  it("debe guardar y devolver el reporte de cada unidad para el informe final", async () => {
    await store.createRun("run-1", ["a"]);
    const report = { checks: [{ name: "Terminó sin error", passed: true }], toolCalls: [{ tool: "getMonthlyStatement", ok: true }] };

    await store.saveResult("run-1", 0, { status: "done", attempts: 1, costUsd: 0.02, passed: true, report });

    expect(await store.listReports("run-1")).toEqual([{ seq: 0, businessId: "a", report }]);
  });

  it("debe mantener separadas distintas corridas", async () => {
    await store.createRun("run-1", ["a"]);
    await store.createRun("run-2", ["x", "y"]);

    expect((await store.listUnits("run-2")).map((u) => u.businessId)).toEqual(["x", "y"]);
    expect(await store.listRuns()).toEqual(["run-1", "run-2"]);
  });
});
