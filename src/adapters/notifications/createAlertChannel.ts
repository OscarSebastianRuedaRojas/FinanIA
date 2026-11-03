import { AlertError, AlertPort } from "../../ports/AlertPort.js";
import { NtfyAlertAdapter } from "./NtfyAlertAdapter.js";
import { TwilioWhatsAppAlertAdapter } from "./TwilioWhatsAppAlertAdapter.js";

// Elige el canal de alertas según el .env: ALERT_CHANNEL manda; si no, ntfy (gratis) y luego WhatsApp
export function createAlertChannelFromEnv(env: Record<string, string | undefined> = process.env): AlertPort {
  const channel = env.ALERT_CHANNEL?.trim().toLowerCase();
  if (channel === "ntfy") return NtfyAlertAdapter.fromEnv(env);
  if (channel === "whatsapp") return TwilioWhatsAppAlertAdapter.fromEnv(env);
  if (channel) {
    throw new AlertError("ALERT_NOT_CONFIGURED", `ALERT_CHANNEL="${env.ALERT_CHANNEL}" no es válido. Usá "ntfy" o "whatsapp".`);
  }

  if (env.NTFY_TOPIC) return NtfyAlertAdapter.fromEnv(env);
  if (env.TWILIO_ACCOUNT_SID || env.ALERT_WHATSAPP_TO) return TwilioWhatsAppAlertAdapter.fromEnv(env);
  throw new AlertError(
    "ALERT_NOT_CONFIGURED",
    "No hay canal de alertas configurado. Definí NTFY_TOPIC (ntfy) o TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y ALERT_WHATSAPP_TO (WhatsApp)."
  );
}
