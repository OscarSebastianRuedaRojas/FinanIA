import path from "node:path";
import { z } from "zod";
import { ScanInvoiceOutcome } from "../ScanInvoiceUseCase.js";
import { AgentTool, ToolError, defineTool } from "./AgentTool.js";

// Expone el escáner de facturas (Grok Vision) como herramienta del agente
export function createInvoiceTools(
  scan: (absolutePath: string) => Promise<ScanInvoiceOutcome>,
  options: { root: string }
): AgentTool[] {
  const root = path.resolve(options.root);

  return [
    defineTool({
      name: "scanInvoice",
      description:
        "Lee la foto de una factura o recibo (JPG o PNG) con Grok Vision y devuelve proveedor, fecha, total, moneda, categoría y la transacción resultante. La ruta es relativa a la carpeta del proyecto.",
      schema: z.object({
        imagePath: z.string().min(1).describe("Ruta relativa de la imagen, ej. 'uploads/factura.jpg'"),
      }),
      run: async ({ imagePath }) => {
        const absolute = path.resolve(root, imagePath);
        // Solo archivos dentro del proyecto: el agente no puede leer rutas arbitrarias del equipo
        if (absolute !== root && !absolute.startsWith(root + path.sep)) {
          throw new ToolError("INVALID_ARGUMENTS", `La ruta "${imagePath}" está fuera de la carpeta del proyecto.`);
        }
        const { extraction, transaction } = await scan(absolute);
        return { extraction, transaction };
      },
    }),
  ];
}
