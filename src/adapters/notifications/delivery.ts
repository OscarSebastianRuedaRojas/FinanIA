import { AlertError } from "../../ports/AlertPort.js";

// Falla que vale la pena reintentar (red caída o error 5xx del proveedor)
export class TransientAlertFailure extends Error {}

// Reintenta solo las fallas transitorias con espera exponencial; el resto se propaga tal cual
export async function deliverWithRetry<T>(attempt: () => Promise<T>, baseDelayMs: number, maxRetries = 3): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await attempt();
    } catch (error: any) {
      if (!(error instanceof TransientAlertFailure)) throw error;
      if (retry === maxRetries) {
        throw new AlertError("ALERT_DELIVERY_FAILED", `No se pudo entregar la alerta: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retry) * baseDelayMs));
    }
  }
}
