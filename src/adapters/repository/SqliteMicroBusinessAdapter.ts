import { DatabaseSync } from "node:sqlite";
import { DataSourceError, MicroBusinessDataPort } from "../../ports/MicroBusinessDataPort.js";
import { FinancialLine, MicroBusinessProfile, MonthlyFigures, PeerFigures } from "../../domain/entities/MicroBusiness.js";
import { TAX_AND_LICENSE_CATEGORIES } from "../../infrastructure/emicron/EmicronCatalog.js";

const TAXES_SUBQUERY = `COALESCE((
  SELECT SUM(l.amount) FROM financial_lines l
  WHERE l.business_id = f.business_id AND l.kind = 'EXPENSE'
    AND l.category IN (${TAX_AND_LICENSE_CATEGORIES.map(() => "?").join(", ")})
), 0)`;

export class SqliteMicroBusinessAdapter implements MicroBusinessDataPort {
  private db: DatabaseSync | null = null;

  constructor(private readonly dbPath: string) {}

  async getProfile(businessId: string): Promise<MicroBusinessProfile | null> {
    const row = this.query((db) => db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId));
    if (!row) return null;
    return {
      id: String(row.id),
      departmentCode: String(row.department_code),
      departmentName: String(row.department_name),
      sectorCode: String(row.sector_code),
      sectorName: String(row.sector_name),
      referenceMonth: String(row.reference_month),
    };
  }

  async getMonthlyFigures(businessId: string): Promise<MonthlyFigures | null> {
    const row = this.query((db) =>
      db
        .prepare(`SELECT f.*, ${TAXES_SUBQUERY} AS taxes FROM monthly_financials f WHERE f.business_id = ?`)
        .get(...TAX_AND_LICENSE_CATEGORIES, businessId)
    );
    if (!row) return null;
    return {
      salesLastMonth: Number(row.sales_last_month),
      salesSameMonthLastYear: Number(row.sales_same_month_last_year),
      salesLastYear: Number(row.sales_last_year),
      costsLastMonth: Number(row.costs_last_month),
      costsLastYear: Number(row.costs_last_year),
      expensesLastMonth: Number(row.expenses_last_month),
      taxesAndLicensesLastMonth: Number(row.taxes),
      monthsOperatedLastYear: Number(row.months_operated_last_year),
    };
  }

  async getFinancialLines(businessId: string): Promise<FinancialLine[]> {
    const rows = this.query((db) =>
      db
        .prepare("SELECT kind, category, amount FROM financial_lines WHERE business_id = ? ORDER BY amount DESC, category")
        .all(businessId)
    );
    return rows.map((row) => ({
      kind: row.kind === "COST" ? "COST" : "EXPENSE",
      category: String(row.category),
      amount: Number(row.amount),
    }));
  }

  async getSectorPeers(sectorCode: string, departmentCode: string | null, excludeBusinessId: string): Promise<PeerFigures[]> {
    const rows = this.query((db) =>
      db
        .prepare(
          `SELECT f.business_id, f.sales_last_month, f.costs_last_month, f.expenses_last_month, ${TAXES_SUBQUERY} AS taxes
           FROM monthly_financials f JOIN businesses b ON b.id = f.business_id
           WHERE b.sector_code = ? AND (? IS NULL OR b.department_code = ?) AND b.id <> ? AND f.sales_last_month > 0`
        )
        .all(...TAX_AND_LICENSE_CATEGORIES, sectorCode, departmentCode, departmentCode, excludeBusinessId)
    );
    return rows.map((row) => ({
      businessId: String(row.business_id),
      salesLastMonth: Number(row.sales_last_month),
      costsLastMonth: Number(row.costs_last_month),
      expensesLastMonth: Number(row.expenses_last_month),
      taxesAndLicensesLastMonth: Number(row.taxes),
    }));
  }

  private query<T>(fn: (db: DatabaseSync) => T): T {
    try {
      // Solo lectura: si la base no existe falla en lugar de crear un archivo vacío
      this.db ??= new DatabaseSync(this.dbPath, { readOnly: true });
      return fn(this.db);
    } catch (error: any) {
      throw new DataSourceError(
        `No se pudo consultar la base EMICRON en ${this.dbPath}: ${error.message}. Ejecutá "npm run data:emicron" para generarla.`
      );
    }
  }
}
