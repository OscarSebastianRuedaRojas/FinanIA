import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { selectEvaluationCases } from "../src/infrastructure/emicron/EvaluationCaseSelector.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

describe("selectEvaluationCases (S6)", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cases-"));
    dbPath = path.join(tmpDir, "emicron.sqlite");
    ingestEmicron(fixturesDir, dbPath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // El orden es un hash determinístico del ID para repartir los casos entre departamentos
  it("debe elegir negocios por escenario con reglas determinísticas sobre los datos", () => {
    const cases = selectEvaluationCases(dbPath, { perScenario: 5, minSalesLastMonth: 0 });

    const byScenario = (scenario: string) => cases.filter((c) => c.scenario === scenario).map((c) => c.businessId);
    expect(byScenario("perdida")).toEqual(["500-1-1", "200-1-1"]);
    expect(byScenario("crecimiento")).toEqual(["400-1-1"]);
    expect(byScenario("caida_interanual")).toEqual([]);
    expect(byScenario("gasto_dominante")).toEqual(["500-1-1", "200-1-1"]);
  });

  it("debe informar la línea de gasto dominante como resultado esperado", () => {
    const cases = selectEvaluationCases(dbPath, { perScenario: 5, minSalesLastMonth: 0 });

    expect(cases.filter((c) => c.scenario === "gasto_dominante").map((c) => c.dominantExpense)).toEqual([
      { category: "Energía eléctrica", shareOfSalesPct: 50 },
      { category: "Arrendamiento", shareOfSalesPct: 40 },
    ]);
  });

  it("debe respetar el mínimo de ventas y el tope por escenario", () => {
    const cases = selectEvaluationCases(dbPath, { perScenario: 1, minSalesLastMonth: 1000000 });

    expect(cases.filter((c) => c.scenario === "perdida").map((c) => c.businessId)).toEqual(["200-1-1"]);
    expect(cases.every((c) => c.businessId !== "500-1-1")).toBe(true);
  });

  it("debe ser reproducible: misma base, mismos casos", () => {
    expect(selectEvaluationCases(dbPath, { perScenario: 5, minSalesLastMonth: 0 })).toEqual(
      selectEvaluationCases(dbPath, { perScenario: 5, minSalesLastMonth: 0 })
    );
  });
});
