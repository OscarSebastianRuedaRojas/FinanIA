import { z } from "zod";
import { AlertPort } from "../../ports/AlertPort.js";
import { AgentTool, defineTool } from "./AgentTool.js";

// El agente decide cuándo avisarle al operador (ej. un negocio en estado crítico)
export function createAlertTools(alerts: AlertPort): AgentTool[] {
  return [
    defineTool({
      name: "sendAlert",
      description:
        "Envía una alerta por WhatsApp al operador de FinanIA. Usala solo para hallazgos que requieren atención (ej. un negocio en pérdida grave o un riesgo de caja crítico); no la uses para cada dictamen.",
      schema: z.object({
        severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
        title: z.string().trim().min(1).max(120),
        message: z.string().trim().min(1).describe("Qué pasó y qué acción se recomienda"),
      }),
      run: async ({ severity, title, message }) => {
        const { id } = await alerts.send({ severity, title, message });
        return { alertId: id };
      },
    }),
  ];
}
