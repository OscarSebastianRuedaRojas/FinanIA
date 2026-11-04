import { Alert, AlertError, AlertPort } from "../../ports/AlertPort.js";
import { TransientAlertFailure, deliverWithRetry } from "./delivery.js";

const MAX_MESSAGE_BYTES = 4096;
const PRIORITY = { INFO: 3, WARNING: 4, CRITICAL: 5 } as const;
const TAGS = { INFO: "information_source", WARNING: "warning", CRITICAL: "rotating_light" } as const;
// En ntfy.sh el nombre del tema es la contraseña: exigimos uno largo y difícil de adivinar
const SAFE_TOPIC = /^[A-Za-z0-9_-]{10,64}$/;

function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let cut = text.slice(0, maxBytes);
  while (Buffer.byteLength(`${cut}…`, "utf8") > maxBytes) cut = cut.slice(0, -1);
  return `${cut}…`;
}

// Notificaciones push gratuitas a la app ntfy del celular (https://ntfy.sh)
export class NtfyAlertAdapter implements AlertPort {
  private readonly fetchFn: typeof fetch;
  private readonly retryBaseDelayMs: number;

  constructor(
    private readonly config: { server: string; topic: string; token?: string; fetch?: typeof fetch; retryBaseDelayMs?: number }
  ) {
    this.fetchFn = config.fetch ?? fetch;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 1000;
  }

  // Tema (y token opcional) solo desde el entorno (.env)
  static fromEnv(env: Record<string, string | undefined> = process.env): NtfyAlertAdapter {
    const topic = env.NTFY_TOPIC?.trim();
    if (!topic || !SAFE_TOPIC.test(topic)) {
      throw new AlertError(
        "ALERT_NOT_CONFIGURED",
        "NTFY_TOPIC debe tener entre 10 y 64 caracteres (letras, números, guiones o guiones bajos). Usá un nombre aleatorio: en ntfy.sh el tema funciona como contraseña."
      );
    }
    return new NtfyAlertAdapter({
      server: (env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, ""),
      topic,
      token: env.NTFY_TOKEN || undefined,
    });
  }

  // Servidor de destino, sin el tema (que es secreto)
  get destination(): string {
    return new URL(this.config.server).host;
  }

  async send(alert: Alert): Promise<{ id: string }> {
    const payload = JSON.stringify({
      topic: this.config.topic,
      title: `FinanIA [${alert.severity}] ${alert.title}`,
      message: truncateToBytes(alert.message, MAX_MESSAGE_BYTES),
      priority: PRIORITY[alert.severity],
      tags: [TAGS[alert.severity]],
    });
    return deliverWithRetry(() => this.post(payload), this.retryBaseDelayMs);
  }

  private async post(payload: string): Promise<{ id: string }> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.server}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
        },
        body: payload,
      });
    } catch (error: any) {
      throw new TransientAlertFailure(this.scrub(error?.message ?? String(error)));
    }

    const body: any = await response.json().catch(() => ({}));
    if (response.ok && body.id) return { id: String(body.id) };

    const detail = this.scrub(`${body.error ?? response.statusText} (HTTP ${response.status}${body.code ? `, código ${body.code}` : ""})`);
    if (response.status >= 500) throw new TransientAlertFailure(detail);
    if (response.status === 429) throw new AlertError("ALERT_RATE_LIMITED", `ntfy limitó los envíos: ${detail}`);
    throw new AlertError("ALERT_DELIVERY_FAILED", `ntfy rechazó la alerta: ${detail}`);
  }

  // El tema y el token nunca salen en mensajes de error (terminan en la bitácora)
  private scrub(text: string): string {
    let clean = text.split(this.config.topic).join("[tema]");
    if (this.config.token) clean = clean.split(this.config.token).join("[token]");
    return clean;
  }
}
