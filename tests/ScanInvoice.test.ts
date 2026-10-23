import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ScanInvoiceUseCase } from "../src/application/ScanInvoiceUseCase.js";
import { readInvoiceImage } from "../src/infrastructure/invoice/readInvoiceImage.js";
import { JsonFileFinancialAdapter } from "../src/adapters/repository/JsonFileFinancialAdapter.js";
import { InvoiceImage, InvoiceScanError, InvoiceScannerPort, InvoiceScanResult } from "../src/ports/InvoiceScannerPort.js";

const run = promisify(execFile);
const root = path.resolve(__dirname, "..");
const invoicePng = path.resolve(__dirname, "fixtures", "invoices", "factura_sintetica.png");

const scanResult: InvoiceScanResult = {
  extraction: {
    vendorName: "FERRETERIA EL TORNILLO S.A.S.",
    vendorTaxId: "900.123.456-7",
    invoiceNumber: "FE-10234",
    date: "2026-09-14",
    currency: "COP",
    totalAmount: 177310,
    taxAmount: 28310,
    category: "Materiales y mantenimiento",
    type: "EXPENSE",
  },
  telemetry: { executionTimeMs: 10, promptTokens: 100, completionTokens: 20, totalTokens: 120, model: "grok-4.7" },
};

class FakeScanner implements InvoiceScannerPort {
  calls: InvoiceImage[] = [];
  constructor(private readonly outcome: InvoiceScanResult | InvoiceScanError) {}
  async scan(image: InvoiceImage): Promise<InvoiceScanResult> {
    this.calls.push(image);
    if (this.outcome instanceof InvoiceScanError) throw this.outcome;
    return this.outcome;
  }
}

describe("ScanInvoiceUseCase (R5)", () => {
  let tmpDir: string;
  let datasetPath: string;
  const now = () => new Date("2026-10-23T12:00:00Z");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-invoice-"));
    datasetPath = path.join(tmpDir, "transactions.json");
    fs.copyFileSync(path.resolve(root, "data", "casos", "quiebra_inminente.json"), datasetPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("S5.1 sin repositorio debe devolver extracción y transacción sin escribir nada", async () => {
    const scanner = new FakeScanner(scanResult);
    const before = fs.readFileSync(datasetPath, "utf-8");

    const result = await new ScanInvoiceUseCase(scanner, readInvoiceImage, now).execute(invoicePng);

    expect(scanner.calls[0].mimeType).toBe("image/png");
    expect(result.extraction).toEqual(scanResult.extraction);
    expect(result.transaction).toMatchObject({
      amount: 177310,
      type: "EXPENSE",
      description: "FERRETERIA EL TORNILLO S.A.S. — Factura FE-10234",
      date: "2026-09-14",
    });
    expect(result.saved).toBe(false);
    expect(fs.readFileSync(datasetPath, "utf-8")).toBe(before);
  });

  it("S5.2 con repositorio debe agregar la transacción al dataset auditable", async () => {
    const repository = new JsonFileFinancialAdapter(datasetPath);
    const countBefore = (await repository.getTransactions()).length;

    const result = await new ScanInvoiceUseCase(new FakeScanner(scanResult), readInvoiceImage, now).execute(
      invoicePng,
      repository
    );

    const transactions = await repository.getTransactions();
    expect(result.saved).toBe(true);
    expect(transactions).toHaveLength(countBefore + 1);
    expect(transactions.at(-1)).toMatchObject({
      amount: 177310,
      category: "Materiales y mantenimiento",
      description: "FERRETERIA EL TORNILLO S.A.S. — Factura FE-10234",
    });
  });

  it("S5.3 si el escaneo falla no debe escribir en el dataset", async () => {
    const before = fs.readFileSync(datasetPath, "utf-8");
    const scanner = new FakeScanner(new InvoiceScanError("NOT_AN_INVOICE", "Es un gato"));

    await expect(
      new ScanInvoiceUseCase(scanner, readInvoiceImage, now).execute(invoicePng, new JsonFileFinancialAdapter(datasetPath))
    ).rejects.toMatchObject({ code: "NOT_AN_INVOICE" });
    expect(fs.readFileSync(datasetPath, "utf-8")).toBe(before);
  });

  it("S1.2 un archivo inválido nunca debe llegar a Grok", async () => {
    const pdf = path.join(tmpDir, "factura.pdf");
    fs.writeFileSync(pdf, "%PDF-1.7");
    const scanner = new FakeScanner(scanResult);

    await expect(new ScanInvoiceUseCase(scanner, readInvoiceImage, now).execute(pdf)).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE",
    });
    expect(scanner.calls).toHaveLength(0);
  });
});

describe("CLI scan:factura", () => {
  const cli = (args: string[]) =>
    run(process.execPath, [path.resolve(root, "node_modules", "tsx", "dist", "cli.mjs"), "src/scanInvoice.ts", ...args], {
      cwd: root,
      env: { ...process.env, LLM_API_KEY: "pk_placeholder" },
    }).then(
      (r) => ({ code: 0, output: r.stdout + r.stderr }),
      (e) => ({ code: e.code as number, output: `${e.stdout}${e.stderr}` })
    );

  it("debe mostrar el uso y salir con 1 si falta la imagen", async () => {
    const { code, output } = await cli([]);

    expect(code).toBe(1);
    expect(output).toContain("npm run scan:factura -- <imagen> [--guardar <dataset.json>]");
  });

  it("S5.3 debe informar el código de error y salir con 1", async () => {
    const { code, output } = await cli(["package.json"]);

    expect(code).toBe(1);
    expect(output).toContain("UNSUPPORTED_FILE");
    expect(output).not.toMatch(/at .+\.ts:\d+/);
  });

  it("S5.4 sin LLM_API_KEY debe fallar con un mensaje claro", async () => {
    const { code, output } = await cli([invoicePng]);

    expect(code).toBe(1);
    expect(output).toContain("LLM_API_KEY no está configurada");
    expect(output).not.toMatch(/at .+\.ts:\d+/);
  });
}, 60000);

describe("Bitácora de los CLI", () => {
  it("scan:factura debe registrar la ejecución fallida en EXECUTION_LOG_PATH", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-log-"));
    const logPath = path.join(tmpDir, "executions.jsonl");
    try {
      await run(process.execPath, [path.resolve(root, "node_modules", "tsx", "dist", "cli.mjs"), "src/scanInvoice.ts", "package.json"], {
        cwd: root,
        env: { ...process.env, LLM_API_KEY: "pk_placeholder", EXECUTION_LOG_PATH: logPath },
      }).catch(() => undefined);

      const events = fs.readFileSync(logPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
      expect(events.map((e) => e.type)).toEqual(["run_started", "run_finished"]);
      expect(events[0]).toMatchObject({ source: "invoice", label: "package.json" });
      expect(events[1]).toMatchObject({ status: "error", error: { code: "UNSUPPORTED_FILE" } });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60000);

  it("npm start debe registrar la auditoría en EXECUTION_LOG_PATH", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-log-"));
    const logPath = path.join(tmpDir, "executions.jsonl");
    try {
      await run(process.execPath, [path.resolve(root, "node_modules", "tsx", "dist", "cli.mjs"), "src/index.ts", "data/casos/quiebra_inminente.json"], {
        cwd: root,
        env: { ...process.env, LLM_API_KEY: "pk_placeholder", EXECUTION_LOG_PATH: logPath },
      });

      const events = fs.readFileSync(logPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
      expect(events.map((e) => e.type)).toEqual(["run_started", "run_finished"]);
      expect(events[1]).toMatchObject({ source: "json", label: "quiebra_inminente.json", status: "success", result: { priority: "CRITICAL" } });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60000);
});
