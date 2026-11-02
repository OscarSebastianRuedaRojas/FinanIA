import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { SqliteMicroBusinessAdapter } from "../src/adapters/repository/SqliteMicroBusinessAdapter.js";
import { SqliteAuditReportRepository } from "../src/adapters/repository/SqliteAuditReportRepository.js";
import { createActionTools } from "../src/application/tools/actionTools.js";
import { AgentTool } from "../src/application/tools/AgentTool.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

describe("saveAuditReport (S4)", () => {
  let tmpDir: string;
  let businesses: SqliteMicroBusinessAdapter;
  let reports: SqliteAuditReportRepository;
  let save: AgentTool;
  const now = () => new Date("2026-11-01T12:00:00Z");

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-reports-"));
    const emicronPath = path.join(tmpDir, "emicron.sqlite");
    ingestEmicron(fixturesDir, emicronPath);
    businesses = new SqliteMicroBusinessAdapter(emicronPath);
    reports = new SqliteAuditReportRepository(path.join(tmpDir, "app", "finania.sqlite"));
    [save] = createActionTools(reports, businesses, { runId: "run-1", now });
  });

  afterAll(() => {
    businesses.close();
    reports.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const dictamen = {
    businessId: "500-1-1",
    priority: "HIGH",
    title: "Margen negativo",
    diagnosis: "Opera con pérdida del 10%",
    actionPlan: ["Renegociar costos de mercancía", "Revisar precios"],
  };

  it("debe guardar el dictamen en la base propia de FinanIA y poder listarlo después", async () => {
    const result: any = await save.execute(dictamen);

    expect(result).toEqual({ ok: true, data: { reportId: 1, savedAt: "2026-11-01T12:00:00.000Z" } });
    expect(await reports.list({ businessId: "500-1-1" })).toEqual([
      { id: 1, runId: "run-1", createdAt: "2026-11-01T12:00:00.000Z", ...dictamen },
    ]);
  });

  it("debe aceptar dictámenes que no son de un negocio puntual (ej. un resumen del objetivo)", async () => {
    const { businessId, ...summary } = dictamen;

    const result: any = await save.execute({ ...summary, title: "Resumen del objetivo" });

    expect(result.ok).toBe(true);
    expect((await reports.list({ limit: 1 }))[0]).toMatchObject({ businessId: null, title: "Resumen del objetivo" });
  });

  it("debe devolver BUSINESS_NOT_FOUND si el negocio no existe en EMICRON", async () => {
    const result = await save.execute({ ...dictamen, businessId: "999-1-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "BUSINESS_NOT_FOUND" } });
  });

  it("debe rechazar un dictamen sin plan de acción o con prioridad inválida", async () => {
    expect(await save.execute({ ...dictamen, actionPlan: [] })).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
    expect(await save.execute({ ...dictamen, priority: "URGENTE" })).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
  });

  it("debe devolver DATA_SOURCE_ERROR si no puede escribir", async () => {
    const blocked = path.join(tmpDir, "bloqueado");
    fs.mkdirSync(path.join(blocked, "finania.sqlite"), { recursive: true }); // una carpeta en lugar del archivo
    const broken = new SqliteAuditReportRepository(path.join(blocked, "finania.sqlite"));
    const [brokenSave] = createActionTools(broken, businesses, { runId: "run-2", now });

    const result = await brokenSave.execute(dictamen);

    expect(result).toMatchObject({ ok: false, error: { code: "DATA_SOURCE_ERROR" } });
    broken.close();
  });
});
