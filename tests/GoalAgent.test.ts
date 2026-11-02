import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GrokGoalAgent } from "../src/adapters/llm/GrokGoalAgent.js";
import { ChatCompletionsClient } from "../src/adapters/llm/GrokLLMAdapter.js";
import { ingestEmicron } from "../src/infrastructure/emicron/EmicronIngestor.js";
import { SqliteMicroBusinessAdapter } from "../src/adapters/repository/SqliteMicroBusinessAdapter.js";
import { SqliteAuditReportRepository } from "../src/adapters/repository/SqliteAuditReportRepository.js";
import { buildGoalToolset } from "../src/application/goalToolset.js";
import { createInvoiceTools } from "../src/application/tools/invoiceTools.js";
import { InvoiceScanError } from "../src/ports/InvoiceScannerPort.js";

const fixturesDir = path.resolve(__dirname, "fixtures", "emicron");
const root = path.resolve(__dirname, "..");

type Step = { calls?: { name: string; args: unknown }[]; content?: string };

// El modelo falso sigue un guion: en cada vuelta pide herramientas o responde
function scriptedClient(steps: Step[]) {
  const requests: any[] = [];
  const client: ChatCompletionsClient = {
    chat: {
      completions: {
        create: async (params: any) => {
          requests.push(JSON.parse(JSON.stringify(params)));
          const step = steps[Math.min(requests.length - 1, steps.length - 1)];
          const message = step.calls
            ? {
                role: "assistant",
                content: null,
                tool_calls: step.calls.map((call, idx) => ({
                  id: `c${requests.length}-${idx}`,
                  type: "function",
                  function: { name: call.name, arguments: JSON.stringify(call.args) },
                })),
              }
            : { role: "assistant", content: step.content };
          return { choices: [{ message }], usage: { prompt_tokens: 100, completion_tokens: 10 } } as any;
        },
      },
    },
  };
  return { client, requests };
}

const finalReport = {
  summary: "El peor margen de comercio en Antioquia es 500-1-1 (-10%).",
  findings: [{ businessId: "500-1-1", priority: "HIGH", headline: "Margen operativo negativo" }],
  nextSteps: ["Revisar costos de mercancía"],
};

describe("GrokGoalAgent (S3)", () => {
  let tmpDir: string;
  let businesses: SqliteMicroBusinessAdapter;
  let reports: SqliteAuditReportRepository;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "goal-agent-"));
    ingestEmicron(fixturesDir, path.join(tmpDir, "emicron.sqlite"));
    businesses = new SqliteMicroBusinessAdapter(path.join(tmpDir, "emicron.sqlite"));
    reports = new SqliteAuditReportRepository(path.join(tmpDir, "finania.sqlite"));
  });

  afterAll(() => {
    businesses.close();
    reports.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("debe planificar con herramientas, actuar guardando el dictamen y cerrar con un informe estructurado", async () => {
    const { client, requests } = scriptedClient([
      { calls: [{ name: "findBusinesses", args: { sector: "comercio", department: "antioquia", rankBy: "operatingMargin", limit: 1 } }] },
      {
        calls: [
          { name: "getMonthlyStatement", args: { businessId: "500-1-1" } },
          {
            name: "saveAuditReport",
            args: { businessId: "500-1-1", priority: "HIGH", title: "Margen negativo", diagnosis: "Pierde 10%", actionPlan: ["Renegociar costos"] },
          },
        ],
      },
      { content: JSON.stringify(finalReport) },
    ]);
    const goal = "Encontrá el comercio de Antioquia con peor margen y guardá su dictamen";
    const toolset = buildGoalToolset({ businesses, reports, runId: "goal-1" });

    const outcome = await new GrokGoalAgent({ client }).pursueGoal(goal, toolset);

    expect(requests[0].messages[1].content).toContain(goal);
    expect(requests[0].tools.map((t: any) => t.function.name)).toEqual([
      "findBusinesses",
      "getMonthlyStatement",
      "compareWithSectorPeers",
      "getYearOverYearSales",
      "saveAuditReport",
    ]);
    const toolResults = requests[2].messages.filter((m: any) => m.role === "tool").map((m: any) => JSON.parse(m.content));
    expect(toolResults[0].data.businesses[0].businessId).toBe("500-1-1");
    expect(toolResults.every((r: any) => r.ok)).toBe(true);
    expect(outcome).toMatchObject({ ...finalReport, structured: true, forcedFinalAnswer: false });
    expect(outcome.telemetry).toMatchObject({ promptTokens: 300, completionTokens: 30 });
    expect(await reports.list({ runId: "goal-1" })).toMatchObject([{ businessId: "500-1-1", priority: "HIGH" }]);
  });

  it("debe conservar la respuesta como texto si el informe final no cumple el esquema", async () => {
    const { client } = scriptedClient([{ content: "Terminé: no encontré negocios." }]);

    const outcome = await new GrokGoalAgent({ client }).pursueGoal("objetivo", buildGoalToolset({ businesses, reports, runId: "goal-2" }));

    expect(outcome).toMatchObject({ summary: "Terminé: no encontré negocios.", findings: [], nextSteps: [], structured: false });
  });
});

describe("scanInvoice como herramienta del agente (S5)", () => {
  const extraction = {
    vendorName: "FERRETERIA EL TORNILLO S.A.S.",
    date: "2026-09-14",
    currency: "COP",
    totalAmount: 177310,
    category: "Proveedores",
    type: "EXPENSE" as const,
  };

  it("debe leer facturas dentro del proyecto y devolver la extracción", async () => {
    const seen: string[] = [];
    const [scan] = createInvoiceTools(
      async (file) => {
        seen.push(file);
        return {
          extraction,
          transaction: { id: "scan-1", amount: 177310, type: "EXPENSE", category: "Proveedores", description: "x", date: "2026-09-14" },
          telemetry: { executionTimeMs: 1, promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "grok-4.7" },
          saved: false,
        };
      },
      { root }
    );

    const result: any = await scan.execute({ imagePath: "tests/fixtures/invoices/factura_sintetica.png" });

    expect(result.ok).toBe(true);
    expect(result.data.extraction.totalAmount).toBe(177310);
    expect(seen).toEqual([path.join(root, "tests", "fixtures", "invoices", "factura_sintetica.png")]);
  });

  it("debe rechazar rutas fuera del proyecto sin leer el archivo", async () => {
    let called = false;
    const [scan] = createInvoiceTools(
      async () => {
        called = true;
        throw new Error("no debería llamarse");
      },
      { root }
    );

    const result = await scan.execute({ imagePath: "../../secreto.png" });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
    expect(called).toBe(false);
  });

  it("debe devolver al agente el código de error del escáner", async () => {
    const [scan] = createInvoiceTools(
      async () => {
        throw new InvoiceScanError("NOT_AN_INVOICE", "Es un paisaje");
      },
      { root }
    );

    expect(await scan.execute({ imagePath: "tests/fixtures/invoices/no_factura.png" })).toEqual({
      ok: false,
      error: { code: "NOT_AN_INVOICE", message: "Es un paisaje" },
    });
  });
});

describe("CLI npm run agent", () => {
  it("debe mostrar el uso y salir con 1 si falta el objetivo", async () => {
    const result = await promisify(execFile)(
      process.execPath,
      [path.resolve(root, "node_modules", "tsx", "dist", "cli.mjs"), "src/agent.ts"],
      { cwd: root, env: { ...process.env, LLM_API_KEY: "pk_placeholder" } }
    ).then(
      (r) => ({ code: 0, output: r.stdout + r.stderr }),
      (e) => ({ code: e.code as number, output: `${e.stdout}${e.stderr}` })
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain('npm run agent -- "<objetivo>"');
  }, 60000);
});
