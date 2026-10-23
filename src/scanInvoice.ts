import "dotenv/config";
import path from "node:path";
import { GrokVisionAdapter } from "./adapters/llm/GrokVisionAdapter.js";
import { JsonFileFinancialAdapter } from "./adapters/repository/JsonFileFinancialAdapter.js";
import { ScanInvoiceUseCase } from "./application/ScanInvoiceUseCase.js";
import { readInvoiceImage } from "./infrastructure/invoice/readInvoiceImage.js";
import { InvoiceScanError, InvoiceScannerPort } from "./ports/InvoiceScannerPort.js";
import { ExecutionRecorder } from "./application/ExecutionRecorder.js";
import { JsonlExecutionLog } from "./infrastructure/logging/JsonlExecutionLog.js";

const USAGE = "Uso: npm run scan:factura -- <imagen> [--guardar <dataset.json>]";

function parseArgs(argv: string[]): { imagePath?: string; datasetPath?: string; invalid: boolean } {
  const args = [...argv];
  const saveIdx = args.indexOf("--guardar");
  let datasetPath: string | undefined;
  if (saveIdx >= 0) {
    datasetPath = args[saveIdx + 1];
    args.splice(saveIdx, 2);
  }
  const imagePath = args.find((arg) => !arg.startsWith("--"));
  return { imagePath, datasetPath, invalid: saveIdx >= 0 && (!datasetPath || datasetPath.startsWith("--")) };
}

async function main(): Promise<number> {
  const { imagePath, datasetPath, invalid } = parseArgs(process.argv.slice(2));
  if (!imagePath || invalid) {
    console.error(USAGE);
    return 1;
  }

  // Cada escaneo queda en la bitácora local logs/executions.jsonl
  const recorder = new ExecutionRecorder(new JsonlExecutionLog(), {
    runId: `cli-${Date.now()}`,
    source: "invoice",
    label: path.basename(imagePath),
  });
  recorder.start();

  // El scanner se crea al primer uso: un archivo inválido falla antes de exigir la API key
  let scanner: GrokVisionAdapter | undefined;
  const lazyScanner: InvoiceScannerPort = {
    scan: (image) => (scanner ??= new GrokVisionAdapter({ observer: recorder })).scan(image),
  };

  console.log("\x1b[36m%s\x1b[0m", "==================================================");
  console.log("\x1b[1m\x1b[33m%s\x1b[0m", "🧾 FINANIA — DIGITALIZACIÓN DE FACTURAS (GROK VISION)");
  console.log("\x1b[36m%s\x1b[0m", "==================================================");
  console.log(`📷 Imagen: \x1b[35m${path.basename(imagePath)}\x1b[0m\n`);

  try {
    const repository = datasetPath ? new JsonFileFinancialAdapter(path.resolve(process.cwd(), datasetPath)) : undefined;
    const result = await new ScanInvoiceUseCase(lazyScanner, readInvoiceImage).execute(
      path.resolve(process.cwd(), imagePath),
      repository
    );
    const { extraction, transaction, telemetry } = result;
    recorder.finish({ status: "success", result: { extraction, transaction, saved: result.saved } });

    console.log("\x1b[1m📄 Datos extraídos\x1b[0m");
    console.log(`  Proveedor: ${extraction.vendorName}${extraction.vendorTaxId ? ` (NIT ${extraction.vendorTaxId})` : ""}`);
    console.log(`  Documento: ${extraction.invoiceNumber ?? "sin número"}`);
    console.log(`  Fecha: ${extraction.date}`);
    console.log(`  Total: ${extraction.totalAmount} ${extraction.currency}${extraction.taxAmount != null ? ` (impuestos ${extraction.taxAmount})` : ""}`);
    console.log(`  Categoría: ${extraction.category} | Tipo: ${extraction.type}`);

    console.log("\n\x1b[1m💾 Transacción mapeada\x1b[0m");
    console.log(JSON.stringify(transaction, null, 2));

    console.log("\n\x1b[1m⏱️ Telemetría\x1b[0m");
    console.log(`  Modelo: ${telemetry.model} | Tiempo: ${telemetry.executionTimeMs} ms | Tokens: ${telemetry.totalTokens} (${telemetry.promptTokens} entrada / ${telemetry.completionTokens} salida)`);

    console.log(
      result.saved
        ? `\n\x1b[32m✅ Transacción agregada a ${datasetPath}\x1b[0m`
        : "\n\x1b[33mVista previa: no se guardó nada. Usá --guardar <dataset.json> para agregarla.\x1b[0m"
    );
    return 0;
  } catch (error: any) {
    recorder.finish({
      status: "error",
      error: { ...(error instanceof InvoiceScanError ? { code: error.code } : {}), message: error?.message ?? String(error) },
    });
    if (error instanceof InvoiceScanError) {
      console.error(`\x1b[31m❌ ${error.code}: ${error.message}\x1b[0m`);
    } else {
      console.error(`\x1b[31m❌ ${error?.message ?? error}\x1b[0m`);
    }
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
