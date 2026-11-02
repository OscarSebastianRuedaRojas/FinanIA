import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { GrokGoalAgent } from "./adapters/llm/GrokGoalAgent.js";
import { SqliteMicroBusinessAdapter } from "./adapters/repository/SqliteMicroBusinessAdapter.js";
import { SqliteAuditReportRepository } from "./adapters/repository/SqliteAuditReportRepository.js";
import { ExecutionCase, ExecutionReport, renderExecutionReport, runExecutionPlan } from "./application/ExecutionPlanRunner.js";
import { buildGoalToolset } from "./application/goalToolset.js";
import { RankingCriteria } from "./domain/entities/MicroBusiness.js";
import { AgentRun, check, emicronCase } from "./evaluation/caseBuilders.js";
import { EMICRON_DB_PATH } from "./infrastructure/emicron/buildEmicronRun.js";
import { EvaluationCase, EvaluationScenario, selectEvaluationCases } from "./infrastructure/emicron/EvaluationCaseSelector.js";
import { FanOutExecutionLog, JsonlExecutionLog } from "./infrastructure/logging/JsonlExecutionLog.js";
import { GoalOutcome } from "./ports/GoalAgentPort.js";
import { ValidationCheck } from "./ports/ExecutionLogPort.js";

const EVIDENCE_DIR = path.resolve(process.cwd(), "docs", "bitacora");
const EVAL_APP_DB = path.resolve(process.cwd(), "data", "finania-eval.sqlite");
const PER_SCENARIO = 6;
const MIN_SALES = 1_000_000;

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dictamenText = (run: AgentRun) =>
  normalize([run.recommendation.title, run.recommendation.diagnosis, ...run.recommendation.actionPlan].join(" "));
const mentionsAny = (text: string, words: string[]) => words.some((word) => text.includes(normalize(word)));
const usedTool = (recorder: { toolCalls: { tool: string; ok: boolean }[] }, tool: string) =>
  recorder.toolCalls.some((call) => call.tool === tool && call.ok);

// Sinónimos para reconocer que el dictamen habla de la línea de gasto dominante
const EXPENSE_SYNONYMS: Record<string, string[]> = {
  Arrendamiento: ["arrendamiento", "arriendo", "alquiler", "renta del local", "canon"],
  "Energía eléctrica": ["energia", "electrica", "electricidad", "luz"],
  Telecomunicaciones: ["telecomunicaciones", "internet", "telefono", "celular", "datos"],
  "Agua y alcantarillado": ["agua", "acueducto", "alcantarillado"],
  Combustibles: ["combustible", "gasolina", "gas", "acpm", "diesel"],
  "Mantenimiento y reparaciones": ["mantenimiento", "reparacion"],
  "Transporte y fletes": ["transporte", "flete", "acarreo"],
  "Publicidad y servicios profesionales": ["publicidad", "contador", "servicios profesionales"],
  "Aseo, vigilancia y administración": ["aseo", "vigilancia", "administracion"],
  "Otros pagos del proceso productivo": ["otros pagos", "invima", "pagos del proceso"],
};

const SCENARIO_TITLES: Record<EvaluationScenario, string> = {
  perdida: "Negocio en pérdida",
  margen_bajo: "Margen estrecho (0–10%)",
  crecimiento: "Crecimiento interanual ≥ 20% y margen ≥ 20%",
  caida_interanual: "Caída interanual ≥ 40%",
  gasto_dominante: "Un gasto se come ≥ 35% de las ventas",
};

// Qué tiene que acertar el agente en cada escenario (el esperado sale de los datos)
function scenarioChecks(evalCase: EvaluationCase) {
  return (run: AgentRun, recorder: any): ValidationCheck[] => {
    const priority = run.recommendation.priority;
    switch (evalCase.scenario) {
      case "perdida":
        return [check("Prioridad HIGH o CRITICAL para un negocio en pérdida", ["HIGH", "CRITICAL"].includes(priority), `prioridad ${priority}`)];
      case "crecimiento":
        return [check("Prioridad LOW o MEDIUM para un negocio rentable y en crecimiento", ["LOW", "MEDIUM"].includes(priority), `prioridad ${priority}`)];
      case "margen_bajo":
        return [
          check("Comparó el margen con pares del sector", usedTool(recorder, "compareWithSectorPeers"), "no usó compareWithSectorPeers con éxito"),
          check("No lo calificó como LOW", priority !== "LOW", `prioridad ${priority}`),
        ];
      case "caida_interanual":
        return [
          check("Revisó la variación interanual", usedTool(recorder, "getYearOverYearSales"), "no usó getYearOverYearSales con éxito"),
          check(
            "El dictamen menciona la caída de ventas",
            mentionsAny(dictamenText(run), ["cae", "caida", "disminu", "baja", "descens", "contrac", "reduc", "retroce", "deterior"]),
            "no menciona la caída"
          ),
        ];
      case "gasto_dominante": {
        const category = evalCase.dominantExpense!.category;
        return [
          check(
            `El dictamen identifica el gasto dominante (${category})`,
            mentionsAny(dictamenText(run), EXPENSE_SYNONYMS[category] ?? [category]),
            "no menciona esa línea de gasto"
          ),
        ];
      }
    }
  };
}

type GoalRun = { outcome: GoalOutcome; expectedIds: string[]; savedIds: string[] };

function goalCase(id: string, title: string, goal: string, expected: RankingCriteria): ExecutionCase<GoalRun> {
  return {
    id,
    title,
    source: "goal",
    label: goal,
    redactResult: true,
    run: async (observer, { runId }) => {
      const businesses = new SqliteMicroBusinessAdapter(EMICRON_DB_PATH);
      const reports = new SqliteAuditReportRepository(EVAL_APP_DB);
      try {
        const expectedIds = (await businesses.rankBusinesses(expected)).map((b) => b.businessId);
        const outcome = await new GrokGoalAgent({ observer }).pursueGoal(goal, buildGoalToolset({ businesses, reports, runId }));
        const saved = await reports.list({ runId });
        const savedIds = [...new Set(saved.map((r) => r.businessId).filter((v): v is string => v !== null))];
        return { outcome, expectedIds, savedIds };
      } finally {
        businesses.close();
        reports.close();
      }
    },
    resultForLog: (value) => ({ priority: value.outcome.findings[0]?.priority, actionPlan: value.outcome.nextSteps }),
    summarize: (value) => `${value.savedIds.length} dictámenes guardados (esperados ${value.expectedIds.length})`,
    validate: (outcome, recorder) => {
      if (outcome.status === "error") return [check("Terminó sin error", false, outcome.error.message)];
      const { outcome: result, expectedIds, savedIds } = outcome.value;
      const missing = expectedIds.filter((idValue) => !savedIds.includes(idValue));
      const extra = savedIds.filter((idValue) => !expectedIds.includes(idValue));
      return [
        check("Terminó sin error", true),
        check("Buscó negocios con findBusinesses", usedTool(recorder, "findBusinesses"), "no usó findBusinesses con éxito"),
        check("Guardó un dictamen para cada negocio que pedía el objetivo", missing.length === 0, `faltan ${missing.join(", ")}`),
        check("No guardó dictámenes de negocios fuera del objetivo", extra.length === 0, `sobran ${extra.join(", ")}`),
        check("Entregó el informe final estructurado", result.structured, "el informe no cumplió el formato"),
      ];
    },
  };
}

function buildPlan(): { plan: ExecutionCase<any>[]; scenarioOf: Map<string, EvaluationScenario | "objetivo"> } {
  const scenarioOf = new Map<string, EvaluationScenario | "objetivo">();
  const cases = selectEvaluationCases(EMICRON_DB_PATH, { perScenario: PER_SCENARIO, minSalesLastMonth: MIN_SALES });

  const plan: ExecutionCase<any>[] = cases.map((evalCase, idx) => {
    const id = `C${String(idx + 1).padStart(2, "0")}`;
    scenarioOf.set(id, evalCase.scenario);
    return emicronCase(id, SCENARIO_TITLES[evalCase.scenario], evalCase.businessId, scenarioChecks(evalCase));
  });

  const goals: [string, string, RankingCriteria][] = [
    [
      "Objetivo: peores márgenes de restaurantes en Antioquia",
      "Encontrá los 3 restaurantes de Antioquia con peor margen operativo, con ventas de al menos 1 millón de pesos, y guardá un dictamen con plan de acción para cada uno",
      { sectorCode: "07", departmentCode: "05", rankBy: "operatingMargin", order: "asc", limit: 3, minSalesLastMonth: 1_000_000 },
    ],
    [
      "Objetivo: mayor caída de ventas en comercios de Bogotá",
      "Identificá los 2 comercios de Bogotá con la mayor caída de ventas frente al mismo mes del año anterior, entre los que venden al menos 1 millón de pesos al mes, y guardá un dictamen para cada uno",
      { sectorCode: "05", departmentCode: "11", rankBy: "yearOverYearChange", order: "asc", limit: 2, minSalesLastMonth: 1_000_000 },
    ],
    [
      "Objetivo: mejores ventas de transporte en el Valle del Cauca",
      "Buscá los 3 negocios de transporte del Valle del Cauca con más ventas el último mes, revisá si su rentabilidad acompaña ese volumen y guardá un dictamen para cada uno",
      { sectorCode: "06", departmentCode: "76", rankBy: "salesLastMonth", order: "desc", limit: 3, minSalesLastMonth: 0 },
    ],
    [
      "Objetivo: el peor margen de la industria en Santander",
      "Encontrá el negocio de industria manufacturera de Santander con peor margen entre los que venden al menos 2 millones de pesos, auditalo a fondo y guardá su dictamen",
      { sectorCode: "03", departmentCode: "68", rankBy: "operatingMargin", order: "asc", limit: 1, minSalesLastMonth: 2_000_000 },
    ],
  ];
  goals.forEach(([title, goal, expected], idx) => {
    const id = `G${idx + 1}`;
    scenarioOf.set(id, "objetivo");
    plan.push(goalCase(id, title, goal, expected));
  });
  return { plan, scenarioOf };
}

function renderScenarioAccuracy(reports: ExecutionReport[], scenarioOf: Map<string, EvaluationScenario | "objetivo">): string {
  const groups = new Map<string, ExecutionReport[]>();
  reports.forEach((r) => {
    const key = scenarioOf.get(r.id) ?? "otro";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  });
  const rows = [...groups.entries()].map(([scenario, items]) => {
    const passed = items.filter((r) => r.passed).length;
    const title = scenario === "objetivo" ? "Objetivo en texto libre (agente planifica y actúa)" : SCENARIO_TITLES[scenario as EvaluationScenario];
    return `| ${title} | ${items.length} | ${passed} | ${Math.round((passed / items.length) * 100)}% |`;
  });
  return [
    "## Aciertos por escenario",
    "",
    "| Escenario | Casos | Aciertos | % |",
    "| :--- | ---: | ---: | ---: |",
    ...rows,
    "",
    `Casos elegidos con reglas determinísticas sobre EMICRON 2024 (ventas ≥ ${MIN_SALES.toLocaleString("es-CO")} COP, ${PER_SCENARIO} por escenario, orden reproducible por hash del ID). En los objetivos, los IDs esperados salen del mismo ranking por SQL y se comparan con los dictámenes que el agente guardó en la base.`,
    "",
  ].join("\n");
}

async function main(): Promise<number> {
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === "pk_placeholder") {
    console.error("❌ LLM_API_KEY no está configurada: la evaluación corre contra Grok real.");
    return 1;
  }

  const { plan, scenarioOf } = buildPlan();
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidenceLog = path.join(EVIDENCE_DIR, "s3-evaluacion.jsonl");
  fs.rmSync(evidenceLog, { force: true });
  const log = new FanOutExecutionLog([new JsonlExecutionLog(), new JsonlExecutionLog(evidenceLog)]);

  const startedAt = new Date();
  console.log(`🧪 Evaluación S3: ${plan.length} casos`);
  const reports = await runExecutionPlan(plan, { log, runIdPrefix: `s3-${startedAt.toISOString().replace(/[-:]/g, "").slice(0, 13)}` });

  const markdown = renderExecutionReport(reports, {
    title: `Evaluación S3 — ${plan.length} casos sobre datos reales del DANE`,
    generatedAt: startedAt.toISOString(),
  }).replace("## Detalle por ejecución", `${renderScenarioAccuracy(reports, scenarioOf)}\n## Detalle por ejecución`);
  fs.writeFileSync(path.join(EVIDENCE_DIR, "s3-evaluacion.md"), markdown, "utf-8");

  const passed = reports.filter((r) => r.passed).length;
  console.log(`\n📊 ${passed}/${reports.length} casos acertados. Evidencia en docs/bitacora/s3-evaluacion.md`);
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});
