import { DatabaseSync } from "node:sqlite";
import { TAX_AND_LICENSE_CATEGORIES } from "./EmicronCatalog.js";

export type EvaluationScenario = "perdida" | "margen_bajo" | "crecimiento" | "caida_interanual" | "gasto_dominante";

export interface EvaluationCase {
  scenario: EvaluationScenario;
  businessId: string;
  dominantExpense?: { category: string; shareOfSalesPct: number };
}

interface Candidate {
  businessId: string;
  marginPct: number;
  yoyPct: number | null;
  topExpenseCategory: string | null;
  topExpenseSharePct: number;
}

// Reglas de cada escenario: el resultado esperado sale de los datos, nunca del modelo
const SCENARIOS: Record<EvaluationScenario, (c: Candidate) => boolean> = {
  perdida: (c) => c.marginPct < 0,
  margen_bajo: (c) => c.marginPct > 0 && c.marginPct < 10,
  crecimiento: (c) => c.yoyPct !== null && c.yoyPct >= 20 && c.marginPct >= 20,
  caida_interanual: (c) => c.yoyPct !== null && c.yoyPct <= -40 && c.marginPct > 0,
  gasto_dominante: (c) => c.topExpenseCategory !== null && c.topExpenseSharePct >= 35,
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// Orden pseudoaleatorio pero reproducible, para no concentrar los casos en los primeros IDs
const spread = (businessId: string) => (Number(businessId.replace(/-/g, "")) * 7919) % 100003;

export function selectEvaluationCases(
  dbPath: string,
  options: { perScenario: number; minSalesLastMonth: number }
): EvaluationCase[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const placeholders = TAX_AND_LICENSE_CATEGORIES.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT f.business_id,
           (f.sales_last_month - f.costs_last_month - f.expenses_last_month - COALESCE((
             SELECT SUM(l.amount) FROM financial_lines l
             WHERE l.business_id = f.business_id AND l.kind = 'EXPENSE' AND l.category IN (${placeholders})
           ), 0)) * 100.0 / f.sales_last_month AS margin,
           CASE WHEN f.sales_same_month_last_year > 0
             THEN (f.sales_last_month - f.sales_same_month_last_year) * 100.0 / f.sales_same_month_last_year END AS yoy,
           (SELECT l.category FROM financial_lines l
             WHERE l.business_id = f.business_id AND l.kind = 'EXPENSE' AND l.category NOT IN (${placeholders})
             ORDER BY l.amount DESC, l.category LIMIT 1) AS top_category,
           COALESCE((SELECT MAX(l.amount) FROM financial_lines l
             WHERE l.business_id = f.business_id AND l.kind = 'EXPENSE' AND l.category NOT IN (${placeholders})), 0)
             * 100.0 / f.sales_last_month AS top_share
         FROM monthly_financials f
         WHERE f.sales_last_month > 0 AND f.sales_last_month >= ?`
      )
      .all(...TAX_AND_LICENSE_CATEGORIES, ...TAX_AND_LICENSE_CATEGORIES, ...TAX_AND_LICENSE_CATEGORIES, options.minSalesLastMonth);

    const candidates: Candidate[] = rows
      .map((row) => ({
        businessId: String(row.business_id),
        marginPct: Number(row.margin),
        yoyPct: row.yoy === null ? null : Number(row.yoy),
        topExpenseCategory: row.top_category === null ? null : String(row.top_category),
        topExpenseSharePct: Number(row.top_share),
      }))
      .sort((a, b) => spread(a.businessId) - spread(b.businessId) || a.businessId.localeCompare(b.businessId));

    return (Object.keys(SCENARIOS) as EvaluationScenario[]).flatMap((scenario) =>
      candidates
        .filter(SCENARIOS[scenario])
        .slice(0, options.perScenario)
        .map((c) => ({
          scenario,
          businessId: c.businessId,
          ...(scenario === "gasto_dominante"
            ? { dominantExpense: { category: c.topExpenseCategory as string, shareOfSalesPct: round2(c.topExpenseSharePct) } }
            : {}),
        }))
    );
  } finally {
    db.close();
  }
}
