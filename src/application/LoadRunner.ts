import { Alert, AlertPort } from "../ports/AlertPort.js";
import { LoadRunStore, LoadUnit } from "../ports/LoadRunStore.js";

export interface UnitExecution {
  status: "done" | "failed";
  costUsd: number;
  passed: boolean;
  errorCode?: string;
  report?: unknown;
}

export interface LoadSummary {
  total: number;
  done: number;
  failed: number;
  pending: number;
  costUsd: number;
  resumedFromCrash: number;
  stoppedBy: "completed" | "budget" | "signal";
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

// Corre las unidades pendientes a ritmo fijo, con concurrencia limitada, reintento y tope de créditos.
// Todo el estado vive en el checkpoint: si el proceso se cae, se retoma donde quedó.
export async function runLoad(options: {
  runId: string;
  store: LoadRunStore;
  executeUnit: (unit: LoadUnit) => Promise<UnitExecution>;
  alerts?: AlertPort;
  intervalMs: number;
  maxConcurrency: number;
  budgetUsd: number;
  maxAttempts?: number;
  progressEvery?: number;
  failureStreakAlert?: number;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  shouldStop?: () => boolean;
}): Promise<LoadSummary> {
  const {
    runId,
    store,
    executeUnit,
    intervalMs,
    maxConcurrency,
    budgetUsd,
    maxAttempts = 2,
    progressEvery = 100,
    failureStreakAlert = 3,
    clock = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    shouldStop = () => false,
  } = options;

  const notify = async (alert: Alert) => {
    if (!options.alerts) return;
    try {
      await options.alerts.send(alert);
    } catch (error: any) {
      console.warn(`⚠️ [Carga] No se pudo enviar la alerta "${alert.title}": ${error?.message ?? error}`);
    }
  };

  const resumedFromCrash = await store.resetRunning(runId);
  const units = await store.listUnits(runId);
  const total = units.length;
  let costUsd = units.reduce((acc, u) => acc + u.costUsd, 0);
  let finished = units.filter((u) => u.status === "done" || u.status === "failed").length;
  let done = units.filter((u) => u.status === "done").length;
  let failed = units.filter((u) => u.status === "failed").length;
  let failureStreak = 0;
  let streakAlerted = false;
  const pending = units.filter((u) => u.status === "pending");

  await notify({
    severity: "INFO",
    title: "Corrida de carga iniciada",
    message: `${pending.length} de ${total} unidades pendientes · una cada ${Math.round(intervalMs / 1000)} s · tope US$${budgetUsd.toFixed(2)}${resumedFromCrash ? ` · ${resumedFromCrash} reencoladas tras una caída` : ""}.`,
  });

  const processUnit = async (unit: LoadUnit) => {
    await store.markRunning(runId, unit.seq);
    let attempts = 0;
    let unitCost = 0;
    let execution: UnitExecution;
    do {
      attempts++;
      try {
        execution = await executeUnit(unit);
      } catch (error: any) {
        execution = { status: "failed", costUsd: 0, passed: false, errorCode: "UNIT_CRASHED", report: { message: error?.message ?? String(error) } };
      }
      unitCost += execution.costUsd;
    } while (execution.status === "failed" && attempts < maxAttempts);

    await store.saveResult(runId, unit.seq, {
      status: execution.status,
      attempts,
      costUsd: round6(unitCost),
      passed: execution.passed,
      ...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
      ...(execution.report !== undefined ? { report: execution.report } : {}),
    });

    costUsd += unitCost;
    finished++;
    if (execution.status === "done") {
      done++;
      failureStreak = 0;
      streakAlerted = false;
    } else {
      failed++;
      failureStreak++;
      if (failureStreak >= failureStreakAlert && !streakAlerted) {
        streakAlerted = true;
        await notify({
          severity: "WARNING",
          title: "Fallos consecutivos en la carga",
          message: `${failureStreak} unidades seguidas fallaron; la última con ${execution.errorCode ?? "error"}. La corrida sigue.`,
        });
      }
    }
    if (finished % progressEvery === 0) {
      await notify({
        severity: "INFO",
        title: `Progreso: ${finished}/${total} unidades`,
        message: `${done} correctas · ${failed} fallidas · US$${costUsd.toFixed(4)} gastados.`,
      });
    }
  };

  const start = clock();
  const active = new Set<Promise<void>>();
  let stoppedBy: LoadSummary["stoppedBy"] = "completed";

  for (let slot = 0; slot < pending.length; slot++) {
    const wait = start + slot * intervalMs - clock();
    if (wait > 0) await sleep(wait);
    while (active.size >= maxConcurrency) await Promise.race(active);

    if (shouldStop()) {
      stoppedBy = "signal";
      break;
    }
    if (costUsd >= budgetUsd) {
      stoppedBy = "budget";
      await notify({
        severity: "CRITICAL",
        title: "Carga detenida: tope de créditos",
        message: `Se gastaron US$${costUsd.toFixed(4)} de un tope de US$${budgetUsd.toFixed(2)}. Quedan ${pending.length - slot} unidades pendientes.`,
      });
      break;
    }

    const task: Promise<void> = processUnit(pending[slot]).finally(() => active.delete(task));
    active.add(task);
  }
  await Promise.all(active);

  const summary: LoadSummary = {
    total,
    done,
    failed,
    pending: total - done - failed,
    costUsd: round6(costUsd),
    resumedFromCrash,
    stoppedBy,
  };
  await notify({
    severity: stoppedBy === "completed" ? "INFO" : "WARNING",
    title: stoppedBy === "completed" ? "Corrida de carga terminada" : "Corrida de carga detenida",
    message: `${done} correctas · ${failed} fallidas · ${summary.pending} pendientes · US$${summary.costUsd.toFixed(4)}.`,
  });
  return summary;
}
