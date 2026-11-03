import fs from "node:fs";
import path from "node:path";
import { buildCostReport, renderCostReport } from "./application/CostReport.js";
import { ExecutionEvent, ExecutionSource } from "./ports/ExecutionLogPort.js";

const EVIDENCE_DIR = path.resolve(process.cwd(), "docs", "bitacora");
const SOURCES: ExecutionSource[] = ["emicron", "json", "invoice", "goal"];
const USAGE = "Uso: npm run reporte:costos -- [bitacora.jsonl ...] [--tarea emicron|json|invoice|goal] [--unidades 1000]";

function readEvents(file: string): ExecutionEvent[] {
  return fs
    .readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .flatMap((line, idx) => {
      try {
        return [JSON.parse(line) as ExecutionEvent];
      } catch {
        console.warn(`⚠️ Línea ${idx + 1} de ${path.basename(file)} no es JSON válido; se ignora.`);
        return [];
      }
    });
}

function main(): number {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const idx = args.indexOf(name);
    if (idx < 0) return undefined;
    const value = args[idx + 1];
    args.splice(idx, 2);
    return value;
  };
  const task = (option("--tarea") ?? "emicron") as ExecutionSource;
  const units = Number(option("--unidades") ?? 1000);
  if (!SOURCES.includes(task) || !Number.isInteger(units) || units <= 0) {
    console.error(USAGE);
    return 1;
  }

  const files = args.length
    ? args.map((file) => path.resolve(process.cwd(), file))
    : fs.existsSync(EVIDENCE_DIR)
      ? fs.readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(EVIDENCE_DIR, f))
      : [];
  const missing = files.filter((file) => !fs.existsSync(file));
  if (files.length === 0 || missing.length) {
    console.error(`❌ No hay bitácoras para analizar${missing.length ? `: ${missing.join(", ")}` : ""}.\n${USAGE}`);
    return 1;
  }

  const report = buildCostReport(files.flatMap(readEvents), { projectionSource: task, projectionUnits: units });
  const markdown = renderCostReport(report, {
    generatedAt: new Date().toISOString(),
    sources: files.map((file) => path.relative(process.cwd(), file).replace(/\\/g, "/")),
  });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const output = path.join(EVIDENCE_DIR, "reporte-costos.md");
  fs.writeFileSync(output, markdown, "utf-8");

  console.log(markdown);
  console.log(`📄 Reporte guardado en ${path.relative(process.cwd(), output)}`);
  return 0;
}

process.exitCode = main();
