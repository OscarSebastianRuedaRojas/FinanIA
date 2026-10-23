import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");

describe("ingestEmicron", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "emicron-"));
    dbPath = path.join(tmpDir, "emicron.sqlite");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe unir los tres módulos por llave compuesta y omitir negocios incompletos", () => {
    const result = ingestEmicron(fixturesDir, dbPath);

    expect(result.businesses).toBe(4);
    const db = new DatabaseSync(dbPath);
    const ids = db.prepare("SELECT id FROM businesses ORDER BY id").all().map((r) => r.id);
    expect(ids).toEqual(["100-1-1", "200-1-1", "400-1-1", "500-1-1"]);
    db.close();
  });

  it("debe mapear perfil y cifras mensuales con sus nombres legibles", () => {
    ingestEmicron(fixturesDir, dbPath);
    const db = new DatabaseSync(dbPath);

    const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get("100-1-1");
    expect(business).toMatchObject({
      department_code: "05",
      department_name: "Antioquia",
      sector_code: "05",
      sector_name: "Comercio y reparación de vehículos automotores y motocicletas",
      reference_month: "MARZO",
      expansion_factor: 10.5,
    });

    const figures = db.prepare("SELECT * FROM monthly_financials WHERE business_id = ?").get("100-1-1");
    expect(figures).toMatchObject({
      sales_last_month: 1000000,
      sales_same_month_last_year: 900000,
      sales_last_year: 11000000,
      costs_last_month: 400000,
      costs_last_year: 4500000,
      expenses_last_month: 200000,
      months_operated_last_year: 12,
    });

    const partialYear = db.prepare("SELECT months_operated_last_year AS m FROM monthly_financials WHERE business_id = ?").get("200-1-1");
    expect(partialYear?.m).toBe(6);
    db.close();
  });

  it("debe guardar solo las líneas de costo y gasto con monto positivo", () => {
    ingestEmicron(fixturesDir, dbPath);
    const db = new DatabaseSync(dbPath);

    const lines = db
      .prepare("SELECT kind, category, amount FROM financial_lines WHERE business_id = ? ORDER BY kind, category")
      .all("100-1-1");
    expect(lines).toEqual([
      { kind: "COST", category: "Costo de mercancía vendida", amount: 400000 },
      { kind: "EXPENSE", category: "Arrendamiento", amount: 150000 },
      { kind: "EXPENSE", category: "Energía eléctrica", amount: 50000 },
    ]);
    const otherCosts = db
      .prepare("SELECT amount FROM financial_lines WHERE business_id = ? AND category = ?")
      .get("200-1-1", "Otros costos");
    expect(otherCosts?.amount).toBe(50000);
    db.close();
  });

  it("debe ser idempotente al reingestar sobre la misma base", () => {
    ingestEmicron(fixturesDir, dbPath);
    const second = ingestEmicron(fixturesDir, dbPath);

    expect(second.businesses).toBe(4);
    const db = new DatabaseSync(dbPath);
    const count = db.prepare("SELECT COUNT(*) AS n FROM financial_lines").get();
    expect(count?.n).toBe(14);
    db.close();
  });

  it("debe fallar con un mensaje claro si falta un módulo", () => {
    expect(() => ingestEmicron(tmpDir, dbPath)).toThrow(/Módulo de identificación\.csv/);
  });
});
