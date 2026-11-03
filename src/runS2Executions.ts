import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ExecutionCase, renderExecutionReport, runExecutionPlan } from "./application/ExecutionPlanRunner.js";
import { FanOutExecutionLog, JsonlExecutionLog } from "./infrastructure/logging/JsonlExecutionLog.js";
import { check, emicronCase, invoiceCase, jsonCase } from "./evaluation/caseBuilders.js";

const EVIDENCE_DIR = path.resolve(process.cwd(), "docs", "bitacora");

// Las 10 ejecuciones de S2: casos sintéticos, micronegocios reales del DANE y facturas
const plan: ExecutionCase<any>[] = [
  jsonCase("E01", "Quiebra inminente (sintético, herramientas semanales)", "data/casos/quiebra_inminente.json"),
  jsonCase("E02", "Crecimiento saludable (sintético, herramientas semanales)", "data/casos/crecimiento_saludable.json"),
  jsonCase("E03", "Fuga silenciosa / gastos hormiga (sintético)", "data/casos/fuga_silenciosa_servicios.json"),
  emicronCase("E04", "Micronegocio real en pérdida (transporte, Antioquia)", "7627478-1-2", (value) => [
    check("Prioridad HIGH o CRITICAL para un negocio en pérdida", ["HIGH", "CRITICAL"].includes(value.recommendation.priority), `prioridad ${value.recommendation.priority}`),
  ]),
  emicronCase("E05", "Micronegocio real en crecimiento (transporte, Antioquia)", "7627474-1-1", (value) => [
    check("Prioridad LOW o MEDIUM para un negocio rentable", ["LOW", "MEDIUM"].includes(value.recommendation.priority), `prioridad ${value.recommendation.priority}`),
  ]),
  emicronCase("E06", "Micronegocio real con caída interanual (servicios, La Guajira)", "7628486-1-1"),
  emicronCase("E07", "Micronegocio real con margen bajo (restaurante, Cauca)", "7628122-1-1"),
  emicronCase("E08", "Recuperación ante falla: sector sin pares en el departamento (minería, Huila)", "7638460-1-1", (_value, recorder) => {
    const peerCalls = recorder.toolCalls.filter((c) => c.tool === "compareWithSectorPeers");
    const failedIdx = peerCalls.findIndex((c) => c.errorCode === "INSUFFICIENT_PEERS");
    const recovered = failedIdx >= 0 && peerCalls.slice(failedIdx + 1).some((c) => c.ok && (c.args as any)?.scope === "national");
    return [
      check("La herramienta devolvió INSUFFICIENT_PEERS en el departamento", failedIdx >= 0, "no se produjo el error esperado"),
      check("El agente reintentó por su cuenta con scope national y obtuvo datos", recovered, "no se recuperó con alcance nacional"),
    ];
  }),
  invoiceCase("E09", "Factura física fotografiada (Grok Vision)", "tests/fixtures/invoices/factura_sintetica.png", (outcome) => {
    if (outcome.status === "error") return [check("Extracción exitosa", false, outcome.error.message)];
    const { extraction, transaction } = outcome.value;
    return [
      check("Proveedor FERRETERIA EL TORNILLO", extraction.vendorName.includes("TORNILLO"), extraction.vendorName),
      check("Total 177310 COP", extraction.totalAmount === 177310 && extraction.currency === "COP", `${extraction.totalAmount} ${extraction.currency}`),
      check("Fecha 2026-09-14", extraction.date === "2026-09-14", extraction.date),
      check("Clasificada como EXPENSE", transaction.type === "EXPENSE", transaction.type),
    ];
  }),
  invoiceCase("E10", "Manejo de error: la foto no es una factura (Grok Vision)", "tests/fixtures/invoices/no_factura.png", (outcome) => [
    check(
      "Falla controlada con NOT_AN_INVOICE (sin transacción inventada)",
      outcome.status === "error" && outcome.error.code === "NOT_AN_INVOICE",
      outcome.status === "error" ? outcome.error.code : "se generó una transacción"
    ),
  ]),
];

async function main(): Promise<number> {
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === "pk_placeholder") {
    console.error("❌ LLM_API_KEY no está configurada: las 10 ejecuciones corren contra Grok real.");
    return 1;
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidenceLog = path.join(EVIDENCE_DIR, "s2-ejecuciones.jsonl");
  fs.rmSync(evidenceLog, { force: true });
  const log = new FanOutExecutionLog([new JsonlExecutionLog(), new JsonlExecutionLog(evidenceLog)]);

  const startedAt = new Date();
  const runIdPrefix = `s2-${startedAt.toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
  const reports = await runExecutionPlan(plan, { log, runIdPrefix });

  const markdown = renderExecutionReport(reports, {
    title: "Bitácora S2 — 10 ejecuciones validadas de FinanIA",
    generatedAt: startedAt.toISOString(),
  });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "s2-ejecuciones.md"), markdown, "utf-8");

  const validated = reports.filter((r) => r.passed).length;
  console.log(`\n📒 ${validated}/${reports.length} ejecuciones validadas. Evidencia en docs/bitacora/`);
  return validated === reports.length ? 0 : 1;
}

main().then((code) => {
  process.exitCode = code;
});
