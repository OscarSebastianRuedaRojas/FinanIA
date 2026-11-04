import { describe, it, expect, vi } from "vitest";
import { runLoad, UnitExecution } from "../src/application/LoadRunner.js";
import { LoadRunStore, LoadUnit, UnitResult } from "../src/ports/LoadRunStore.js";
import { Alert, AlertPort } from "../src/ports/AlertPort.js";

// Checkpoint en memoria con la misma semántica que el de SQLite
class MemoryStore implements LoadRunStore {
  units = new Map<string, LoadUnit[]>();
  async createRun(runId: string, businessIds: string[]) {
    if (!this.units.has(runId)) {
      this.units.set(runId, businessIds.map((businessId, seq) => ({ seq, businessId, status: "pending", attempts: 0, costUsd: 0, errorCode: null, passed: null })));
    }
  }
  async listUnits(runId: string) {
    return (this.units.get(runId) ?? []).map((u) => ({ ...u }));
  }
  async resetRunning(runId: string) {
    let n = 0;
    for (const u of this.units.get(runId) ?? []) if (u.status === "running") (u.status = "pending"), n++;
    return n;
  }
  async markRunning(runId: string, seq: number) {
    this.find(runId, seq).status = "running";
  }
  async saveResult(runId: string, seq: number, result: UnitResult) {
    Object.assign(this.find(runId, seq), {
      status: result.status,
      attempts: result.attempts,
      costUsd: result.costUsd,
      errorCode: result.errorCode ?? null,
      passed: result.passed,
    });
  }
  private find(runId: string, seq: number) {
    return this.units.get(runId)!.find((u) => u.seq === seq)!;
  }
}

class MemoryAlerts implements AlertPort {
  sent: Alert[] = [];
  async send(alert: Alert) {
    this.sent.push(alert);
    return { id: String(this.sent.length) };
  }
}

// Reloj falso: sleep avanza el tiempo sin esperar de verdad
function fakeTime(start = 0) {
  let now = start;
  const sleeps: number[] = [];
  return {
    clock: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
  };
}

const ok = (costUsd = 0.01): UnitExecution => ({ status: "done", costUsd, passed: true });
const fail = (errorCode: string, costUsd = 0.005): UnitExecution => ({ status: "failed", costUsd, passed: false, errorCode });

describe("runLoad (S3)", () => {
  it("S3.1 debe procesar las unidades en orden a ritmo fijo", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b", "c"]);
    const time = fakeTime();
    const executed: string[] = [];

    const summary = await runLoad({
      runId: "run",
      store,
      executeUnit: async (unit) => (executed.push(unit.businessId), ok()),
      intervalMs: 1000,
      maxConcurrency: 1,
      budgetUsd: 10,
      clock: time.clock,
      sleep: time.sleep,
    });

    expect(executed).toEqual(["a", "b", "c"]);
    expect(time.sleeps).toEqual([1000, 1000]);
    expect(summary).toMatchObject({ done: 3, failed: 0, pending: 0, costUsd: 0.03, stoppedBy: "completed" });
    expect((await store.listUnits("run")).every((u) => u.status === "done" && u.attempts === 1)).toBe(true);
  });

  it("S3.2 debe reanudar sin repetir unidades terminadas y reencolar las que quedaron corriendo", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b", "c"]);
    await store.saveResult("run", 0, { status: "done", attempts: 1, costUsd: 0.01, passed: true });
    await store.markRunning("run", 1); // el proceso se cayó con esta unidad en curso
    const time = fakeTime();
    const executed: string[] = [];

    const summary = await runLoad({
      runId: "run",
      store,
      executeUnit: async (unit) => (executed.push(unit.businessId), ok()),
      intervalMs: 1000,
      maxConcurrency: 1,
      budgetUsd: 10,
      clock: time.clock,
      sleep: time.sleep,
    });

    expect(executed).toEqual(["b", "c"]);
    expect(summary).toMatchObject({ done: 3, resumedFromCrash: 1, costUsd: 0.03 });
  });

  it("S3.3 debe reintentar una vez y guardar el código de error si vuelve a fallar", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["flaky", "broken", "fine"]);
    const time = fakeTime();
    const calls: Record<string, number> = {};

    const summary = await runLoad({
      runId: "run",
      store,
      executeUnit: async (unit) => {
        calls[unit.businessId] = (calls[unit.businessId] ?? 0) + 1;
        if (unit.businessId === "flaky" && calls.flaky === 1) return fail("VISION_API_ERROR");
        if (unit.businessId === "broken") return fail("DATA_SOURCE_ERROR");
        return ok();
      },
      intervalMs: 0,
      maxConcurrency: 1,
      budgetUsd: 10,
      clock: time.clock,
      sleep: time.sleep,
    });

    const units = await store.listUnits("run");
    expect(calls).toEqual({ flaky: 2, broken: 2, fine: 1 });
    expect(units.map((u) => [u.businessId, u.status, u.attempts, u.errorCode])).toEqual([
      ["flaky", "done", 2, null],
      ["broken", "failed", 2, "DATA_SOURCE_ERROR"],
      ["fine", "done", 1, null],
    ]);
    expect(summary).toMatchObject({ done: 2, failed: 1 });
    expect(summary.costUsd).toBeCloseTo(0.01 + 0.005 + 0.005 + 0.005 + 0.01, 10);
  });

  it("S3.3 debe convertir una excepción del ejecutor en un fallo controlado", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a"]);

    const summary = await runLoad({
      runId: "run",
      store,
      executeUnit: async () => {
        throw new Error("boom");
      },
      intervalMs: 0,
      maxConcurrency: 1,
      budgetUsd: 10,
      ...fakeTime(),
    });

    expect(summary.failed).toBe(1);
    expect((await store.listUnits("run"))[0]).toMatchObject({ status: "failed", errorCode: "UNIT_CRASHED", attempts: 2 });
  });

  it("S3.3 debe alertar una sola vez tras tres fallos seguidos", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b", "c", "d"]);
    const alerts = new MemoryAlerts();

    await runLoad({
      runId: "run",
      store,
      executeUnit: async () => fail("VISION_API_ERROR", 0),
      alerts,
      intervalMs: 0,
      maxConcurrency: 1,
      budgetUsd: 10,
      ...fakeTime(),
    });

    const warnings = alerts.sent.filter((a) => a.severity === "WARNING");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("3 unidades seguidas");
    expect(warnings[0].message).toContain("VISION_API_ERROR");
  });

  it("S3.4 debe frenar al alcanzar el tope de créditos y dejar el resto pendiente", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b", "c", "d", "e"]);
    const alerts = new MemoryAlerts();
    const executed: string[] = [];

    const summary = await runLoad({
      runId: "run",
      store,
      executeUnit: async (unit) => (executed.push(unit.businessId), ok(0.01)),
      alerts,
      intervalMs: 0,
      maxConcurrency: 1,
      budgetUsd: 0.025,
      ...fakeTime(),
    });

    expect(executed).toEqual(["a", "b", "c"]);
    expect(summary).toMatchObject({ done: 3, pending: 2, stoppedBy: "budget" });
    const critical = alerts.sent.filter((a) => a.severity === "CRITICAL");
    expect(critical).toHaveLength(1);
    expect(critical[0].title).toContain("tope de créditos");
  });

  it("S3.5 debe avisar al iniciar, cada N unidades y al terminar", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b", "c", "d"]);
    const alerts = new MemoryAlerts();

    await runLoad({
      runId: "run",
      store,
      executeUnit: async () => ok(),
      alerts,
      intervalMs: 0,
      maxConcurrency: 1,
      budgetUsd: 10,
      progressEvery: 2,
      ...fakeTime(),
    });

    expect(alerts.sent.map((a) => a.title)).toEqual([
      "Corrida de carga iniciada",
      "Progreso: 2/4 unidades",
      "Progreso: 4/4 unidades",
      "Corrida de carga terminada",
    ]);
  });

  it("S3.3 una alerta que falla no debe detener la corrida", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const summary = await runLoad({
      runId: "run",
      store,
      executeUnit: async () => ok(),
      alerts: {
        send: async () => {
          throw new Error("ntfy caído");
        },
      },
      intervalMs: 0,
      maxConcurrency: 1,
      budgetUsd: 10,
      ...fakeTime(),
    });

    expect(summary.done).toBe(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("S3.1 nunca debe superar la concurrencia máxima", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b", "c", "d", "e"]);
    let active = 0;
    let maxActive = 0;

    await runLoad({
      runId: "run",
      store,
      executeUnit: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return ok();
      },
      intervalMs: 0,
      maxConcurrency: 2,
      budgetUsd: 10,
      ...fakeTime(),
    });

    expect(maxActive).toBe(2);
  });

  it("debe dejar de iniciar unidades cuando se pide detener la corrida", async () => {
    const store = new MemoryStore();
    await store.createRun("run", ["a", "b", "c"]);
    const executed: string[] = [];

    const summary = await runLoad({
      runId: "run",
      store,
      executeUnit: async (unit) => (executed.push(unit.businessId), ok()),
      intervalMs: 0,
      maxConcurrency: 1,
      budgetUsd: 10,
      shouldStop: () => executed.length >= 1,
      ...fakeTime(),
    });

    expect(executed).toEqual(["a"]);
    expect(summary).toMatchObject({ done: 1, pending: 2, stoppedBy: "signal" });
  });
});
