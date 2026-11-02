import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { SqliteMicroBusinessAdapter } from "../src/adapters/repository/SqliteMicroBusinessAdapter.js";
import { createSearchTools } from "../src/application/tools/searchTools.js";
import { AgentTool } from "../src/application/tools/AgentTool.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

describe("findBusinesses (S2)", () => {
  let tmpDir: string;
  let port: SqliteMicroBusinessAdapter;
  let find: AgentTool;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emicron-search-"));
    const dbPath = path.join(tmpDir, "emicron.sqlite");
    ingestEmicron(fixturesDir, dbPath);
    port = new SqliteMicroBusinessAdapter(dbPath);
    [find] = createSearchTools(port);
  });

  afterAll(() => {
    port.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const ids = (result: any) => result.data.businesses.map((b: any) => b.businessId);

  it("debe exponer parámetros tipados con las métricas permitidas", () => {
    expect(find.name).toBe("findBusinesses");
    expect(find.parameters).toMatchObject({
      type: "object",
      properties: { rankBy: { enum: ["operatingMargin", "salesLastMonth", "yearOverYearChange"] } },
    });
  });

  it("debe filtrar por nombre de sector y departamento sin importar mayúsculas ni tildes, y rankear por margen", async () => {
    const result: any = await find.execute({ sector: "comercio", department: "ANTIOQUIA", rankBy: "operatingMargin" });

    expect(result.ok).toBe(true);
    expect(result.data.criteria).toEqual({
      sector: "Comercio y reparación de vehículos automotores y motocicletas",
      department: "Antioquia",
      rankBy: "operatingMargin",
      order: "asc",
      minSalesLastMonth: 0,
    });
    expect(ids(result)).toEqual(["500-1-1", "400-1-1", "100-1-1"]);
    expect(result.data.businesses[0]).toEqual({
      businessId: "500-1-1",
      sector: "Comercio y reparación de vehículos automotores y motocicletas",
      department: "Antioquia",
      salesLastMonth: 500000,
      operatingMarginPct: -10,
      yearOverYearChangePct: -16.67,
    });
  });

  it("debe aceptar códigos DANE y respetar orden y límite", async () => {
    const result: any = await find.execute({ sector: "05", rankBy: "operatingMargin", order: "desc", limit: 1 });

    expect(ids(result)).toEqual(["100-1-1"]);
    expect(result.data.businesses[0].operatingMarginPct).toBe(40);
  });

  it("debe rankear por variación interanual a nivel nacional", async () => {
    const result: any = await find.execute({ rankBy: "yearOverYearChange" });

    expect(ids(result)).toEqual(["500-1-1", "200-1-1", "100-1-1", "400-1-1"]);
    expect(result.data.businesses.map((b: any) => b.yearOverYearChangePct)).toEqual([-16.67, -11.76, 11.11, 25]);
  });

  it("debe excluir negocios por debajo de las ventas mínimas", async () => {
    const result: any = await find.execute({ rankBy: "operatingMargin", minSalesLastMonth: 1000000 });

    expect(ids(result)).not.toContain("500-1-1");
  });

  it("debe devolver INVALID_ARGUMENTS con los sectores válidos cuando no reconoce el nombre", async () => {
    const result: any = await find.execute({ sector: "restaurantes", rankBy: "operatingMargin" });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
    expect(result.error.message).toContain("Alojamiento y servicios de comida");
  });

  it("debe pedir precisión cuando el nombre coincide con varios departamentos o sectores", async () => {
    const result: any = await find.execute({ sector: "a", rankBy: "operatingMargin" });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
    expect(result.error.message).toContain("ambiguo");
  });

  it("debe rechazar límites mayores a 20", async () => {
    const result = await find.execute({ rankBy: "salesLastMonth", limit: 50 });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
  });
});
