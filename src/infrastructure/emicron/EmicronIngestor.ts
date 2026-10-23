import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEPARTMENTS, SECTORS_GRUPOS12, COST_LINES, EXPENSE_LINES } from "./EmicronCatalog.js";

// Archivos CSV tal como vienen en los ZIP de EMICRON 2024 (microdatos.dane.gov.co, catálogo 875)
export const EMICRON_FILES = {
  identification: "Módulo de identificación.csv",
  costs: "Módulo de costos, gastos y activos.csv",
  sales: "Módulo de ventas o ingresos.csv",
} as const;

const MONTH_COLUMNS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"].map(
  (m) => `P3068_${m}`
);

type Row = Record<string, string>;

export function parseCsv(content: string): Row[] {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function readModule(rawDir: string, fileName: string): Map<string, Row> {
  const filePath = path.join(rawDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el módulo EMICRON "${fileName}" en ${rawDir}. Descargalo desde microdatos.dane.gov.co (catálogo 875).`);
  }
  const rows = parseCsv(fs.readFileSync(filePath, "utf-8"));
  return new Map(rows.map((row) => [businessKey(row), row]));
}

function businessKey(row: Row): string {
  return `${row.DIRECTORIO}-${row.SECUENCIA_P}-${row.SECUENCIA_ENCUESTA}`;
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return value === undefined || value === "" || Number.isNaN(parsed) ? 0 : parsed;
}

function monthsOperated(sales: Row): number {
  if (sales.P3068_TOD === "1") return 12;
  return MONTH_COLUMNS.filter((column) => sales[column] === "1").length;
}

export function ingestEmicron(rawDir: string, dbPath: string): { businesses: number } {
  const identification = readModule(rawDir, EMICRON_FILES.identification);
  const costs = readModule(rawDir, EMICRON_FILES.costs);
  const sales = readModule(rawDir, EMICRON_FILES.sales);

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      DROP TABLE IF EXISTS financial_lines;
      DROP TABLE IF EXISTS monthly_financials;
      DROP TABLE IF EXISTS businesses;
      CREATE TABLE businesses (
        id TEXT PRIMARY KEY,
        department_code TEXT NOT NULL,
        department_name TEXT NOT NULL,
        sector_code TEXT NOT NULL,
        sector_name TEXT NOT NULL,
        reference_month TEXT NOT NULL,
        expansion_factor REAL NOT NULL
      );
      CREATE TABLE monthly_financials (
        business_id TEXT PRIMARY KEY REFERENCES businesses(id),
        sales_last_month REAL NOT NULL,
        sales_same_month_last_year REAL NOT NULL,
        sales_last_year REAL NOT NULL,
        costs_last_month REAL NOT NULL,
        costs_last_year REAL NOT NULL,
        expenses_last_month REAL NOT NULL,
        months_operated_last_year INTEGER NOT NULL
      );
      CREATE TABLE financial_lines (
        business_id TEXT NOT NULL REFERENCES businesses(id),
        kind TEXT NOT NULL CHECK (kind IN ('COST', 'EXPENSE')),
        category TEXT NOT NULL,
        amount REAL NOT NULL
      );
      CREATE INDEX idx_businesses_sector ON businesses(sector_code, department_code);
      CREATE INDEX idx_lines_business ON financial_lines(business_id);
    `);

    const insertBusiness = db.prepare("INSERT INTO businesses VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertFigures = db.prepare("INSERT INTO monthly_financials VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertLine = db.prepare("INSERT INTO financial_lines VALUES (?, ?, ?, ?)");

    let count = 0;
    db.exec("BEGIN");
    for (const [key, idRow] of identification) {
      const costRow = costs.get(key);
      const salesRow = sales.get(key);
      if (!costRow || !salesRow) continue;

      const departmentCode = idRow.COD_DEPTO.padStart(2, "0");
      const sectorCode = idRow.GRUPOS12.padStart(2, "0");
      insertBusiness.run(
        key,
        departmentCode,
        DEPARTMENTS[departmentCode] ?? `Departamento ${departmentCode}`,
        sectorCode,
        SECTORS_GRUPOS12[sectorCode] ?? `Sector ${sectorCode}`,
        idRow.MES_REF,
        toNumber(idRow.F_EXP)
      );
      insertFigures.run(
        key,
        toNumber(salesRow.VENTAS_MES_ANTERIOR),
        toNumber(salesRow.VENTAS_MES_ANIO_ANTERIOR),
        toNumber(salesRow.VENTAS_ANIO_ANTERIOR),
        toNumber(costRow.COSTOS_MES_ANTERIOR),
        toNumber(costRow.COSTOS_ANIO_ANTERIOR),
        toNumber(costRow.GASTOS_MES),
        monthsOperated(salesRow)
      );
      for (const [column, category] of Object.entries(COST_LINES)) {
        const amount = toNumber(costRow[column]);
        if (amount > 0) insertLine.run(key, "COST", category, amount);
      }
      for (const [column, category] of Object.entries(EXPENSE_LINES)) {
        const amount = toNumber(costRow[column]);
        if (amount > 0) insertLine.run(key, "EXPENSE", category, amount);
      }
      count++;
    }
    db.exec("COMMIT");
    return { businesses: count };
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}
