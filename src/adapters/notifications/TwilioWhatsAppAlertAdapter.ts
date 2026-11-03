import { Alert, AlertError, AlertPort } from "../../ports/AlertPort.js";

const SANDBOX_FROM = "whatsapp:+14155238886";
const MAX_BODY = 1600;
const ICONS = { INFO: "ℹ️", WARNING: "⚠️", CRITICAL: "🚨" } as const;

// Falla que vale la pena reintentar (red caída o error 5xx de Twilio)
class TransientAlertFailure extends Error {}

function toWhatsAppAddress(number: string): string {
  const digits = number.replace(/^whatsapp:/, "").replace(/[\s()-]/g, "");
  return `whatsapp:${digits.startsWith("+") ? digits : `+${digits}`}`;
}

// Alertas por WhatsApp con la API REST de Twilio (sandbox o remitente aprobado)
export class TwilioWhatsAppAlertAdapter implements AlertPort {
  private readonly fetchFn: typeof fetch;
  private readonly retryBaseDelayMs: number;

  constructor(
    private readonly config: {
      accountSid: string;
      username: string;
      password: string;
      from: string;
      to: string;
      fetch?: typeof fetch;
      retryBaseDelayMs?: number;
    }
  ) {
    this.fetchFn = config.fetch ?? fetch;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 1000;
  }

  // Credenciales solo desde el entorno (.env); acepta Auth Token o API key + secret
  static fromEnv(env: Record<string, string | undefined> = process.env): TwilioWhatsAppAlertAdapter {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const password = env.TWILIO_API_SECRET || env.TWILIO_AUTH_TOKEN;
    const to = env.ALERT_WHATSAPP_TO;
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !password && "TWILIO_AUTH_TOKEN (o TWILIO_API_KEY + TWILIO_API_SECRET)",
      !to && "ALERT_WHATSAPP_TO",
    ].filter(Boolean);
    if (missing.length) {
      throw new AlertError("ALERT_NOT_CONFIGURED", `Faltan variables de entorno para las alertas por WhatsApp: ${missing.join(", ")}.`);
    }
    return new TwilioWhatsAppAlertAdapter({
      accountSid: accountSid!,
      username: env.TWILIO_API_KEY || accountSid!,
      password: password!,
      from: toWhatsAppAddress(env.TWILIO_WHATSAPP_FROM || SANDBOX_FROM),
      to: toWhatsAppAddress(to!),
    });
  }

  get recipient(): string {
    return this.config.to;
  }

  async send(alert: Alert): Promise<{ id: string }> {
    const text = `${ICONS[alert.severity]} FinanIA [${alert.severity}] ${alert.title}\n${alert.message}`;
    const body = text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;

    const maxRetries = 3;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.post(body);
      } catch (error: any) {
        if (!(error instanceof TransientAlertFailure)) throw error;
        if (attempt === maxRetries) {
          throw new AlertError("ALERT_DELIVERY_FAILED", `No se pudo entregar la alerta por WhatsApp: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * this.retryBaseDelayMs));
      }
    }
  }

  private async post(body: string): Promise<{ id: string }> {
    let response: Response;
    try {
      response = await this.fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: this.config.from, To: this.config.to, Body: body }).toString(),
      });
    } catch (error: any) {
      throw new TransientAlertFailure(error?.message ?? String(error));
    }

    const payload: any = await response.json().catch(() => ({}));
    if (response.ok && payload.sid) return { id: String(payload.sid) };

    // Twilio a veces repite el número en el mensaje: se enmascara antes de que llegue a la bitácora
    const apiMessage = String(payload.message ?? response.statusText).replace(/(whatsapp:)?\+?\d[\d\s-]{6,}\d/g, "[número]");
    const detail = `${apiMessage} (HTTP ${response.status}${payload.code ? `, código ${payload.code}` : ""})`;
    if (response.status >= 500) throw new TransientAlertFailure(detail);
    if (payload.code === 63015) {
      throw new AlertError(
        "ALERT_RECIPIENT_NOT_JOINED",
        // Sin el número del destinatario: los errores de herramientas quedan en la bitácora
        `El número configurado en ALERT_WHATSAPP_TO no está unido al sandbox de WhatsApp de Twilio o su sesión de 3 días venció. Enviá "join <tu-código>" al +1 415 523 8886 desde WhatsApp y reintentá.`
      );
    }
    if (response.status === 429 || payload.code === 20429) {
      throw new AlertError("ALERT_RATE_LIMITED", `Twilio limitó los envíos: ${detail}. El sandbox permite un mensaje cada 3 segundos.`);
    }
    throw new AlertError("ALERT_DELIVERY_FAILED", `Twilio rechazó la alerta: ${detail}`);
  }
}
