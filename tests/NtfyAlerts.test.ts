import { describe, it, expect } from "vitest";
import { NtfyAlertAdapter } from "../src/adapters/notifications/NtfyAlertAdapter.js";
import { TwilioWhatsAppAlertAdapter } from "../src/adapters/notifications/TwilioWhatsAppAlertAdapter.js";
import { createAlertChannelFromEnv } from "../src/adapters/notifications/createAlertChannel.js";
import { AlertError } from "../src/ports/AlertPort.js";

type Reply = { status: number; body: unknown } | Error;

function fakeFetch(replies: Reply[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

const TOPIC = "finania-Xk29_pQz7w";
const config = { server: "https://ntfy.sh", topic: TOPIC, retryBaseDelayMs: 1 };

async function alertError(promise: Promise<unknown>): Promise<AlertError> {
  return promise.then(
    () => {
      throw new Error("Se esperaba un AlertError");
    },
    (e) => e
  );
}

describe("NtfyAlertAdapter", () => {
  it("debe publicar en el tema con título, prioridad y etiqueta según la severidad", async () => {
    const { fetchFn, requests } = fakeFetch([{ status: 200, body: { id: "abc123", event: "message" } }]);

    const result = await new NtfyAlertAdapter({ ...config, fetch: fetchFn }).send({
      severity: "CRITICAL",
      title: "Corrida detenida",
      message: "Se alcanzó el tope de créditos",
    });

    expect(result).toEqual({ id: "abc123" });
    // JSON en lugar de headers: los títulos del agente llevan acentos y emojis
    expect(requests[0].url).toBe("https://ntfy.sh/");
    expect(requests[0].init.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      topic: TOPIC,
      title: "FinanIA [CRITICAL] Corrida detenida",
      message: "Se alcanzó el tope de créditos",
      priority: 5,
      tags: ["rotating_light"],
    });
  });

  it("debe mapear INFO y WARNING a prioridad normal y alta", async () => {
    const { fetchFn, requests } = fakeFetch([{ status: 200, body: { id: "1" } }]);
    const adapter = new NtfyAlertAdapter({ ...config, fetch: fetchFn });

    await adapter.send({ severity: "INFO", title: "t", message: "m" });
    await adapter.send({ severity: "WARNING", title: "t", message: "m" });

    expect(requests.map((r) => JSON.parse(String(r.init.body)).priority)).toEqual([3, 4]);
  });

  it("debe enviar el token de acceso si está configurado", async () => {
    const { fetchFn, requests } = fakeFetch([{ status: 200, body: { id: "1" } }]);

    await new NtfyAlertAdapter({ ...config, token: "tk_secreto", fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" });

    expect((requests[0].init.headers as any).Authorization).toBe("Bearer tk_secreto");
  });

  it("debe recortar el mensaje para no superar los 4.096 bytes", async () => {
    const { fetchFn, requests } = fakeFetch([{ status: 200, body: { id: "1" } }]);

    await new NtfyAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "ñ".repeat(5000) });

    const message = JSON.parse(String(requests[0].init.body)).message;
    expect(Buffer.byteLength(message, "utf8")).toBeLessThanOrEqual(4096);
    expect(message.endsWith("…")).toBe(true);
  });

  it("debe reintentar caídas de red y errores 5xx", async () => {
    const { fetchFn, requests } = fakeFetch([new Error("ECONNRESET"), { status: 502, body: {} }, { status: 200, body: { id: "ok" } }]);

    const result = await new NtfyAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" });

    expect(result.id).toBe("ok");
    expect(requests).toHaveLength(3);
  });

  it("debe informar ALERT_RATE_LIMITED con 429 sin reintentar", async () => {
    const { fetchFn, requests } = fakeFetch([{ status: 429, body: { code: 42901, http: 429, error: "limit reached: too many requests" } }]);

    const error = await alertError(new NtfyAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" }));

    expect(error.code).toBe("ALERT_RATE_LIMITED");
    expect(requests).toHaveLength(1);
  });

  it("nunca debe revelar el tema ni el token en los errores", async () => {
    const { fetchFn } = fakeFetch([new Error(`request to https://ntfy.sh/${TOPIC} failed`)]);

    const error = await alertError(new NtfyAlertAdapter({ ...config, token: "tk_secreto", fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" }));

    expect(error.code).toBe("ALERT_DELIVERY_FAILED");
    expect(error.message).not.toContain(TOPIC);
    expect(error.message).not.toContain("tk_secreto");
  });

  it("debe rechazar temas cortos o con caracteres inválidos, porque el tema es la contraseña", () => {
    expect(() => NtfyAlertAdapter.fromEnv({ NTFY_TOPIC: "alertas" })).toThrow(AlertError);
    expect(() => NtfyAlertAdapter.fromEnv({ NTFY_TOPIC: "tema con espacios!" })).toThrow(/NTFY_TOPIC/);
    expect(NtfyAlertAdapter.fromEnv({ NTFY_TOPIC: TOPIC }).destination).toBe("ntfy.sh");
  });
});

describe("createAlertChannelFromEnv", () => {
  it("debe preferir ntfy cuando está configurado", () => {
    const channel = createAlertChannelFromEnv({ NTFY_TOPIC: TOPIC, TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x", ALERT_WHATSAPP_TO: "+573001234567" });

    expect(channel).toBeInstanceOf(NtfyAlertAdapter);
  });

  it("debe usar Twilio si solo está configurado WhatsApp", () => {
    const channel = createAlertChannelFromEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x", ALERT_WHATSAPP_TO: "+573001234567" });

    expect(channel).toBeInstanceOf(TwilioWhatsAppAlertAdapter);
  });

  it("debe respetar ALERT_CHANNEL cuando se indica", () => {
    const env = { ALERT_CHANNEL: "whatsapp", NTFY_TOPIC: TOPIC, TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x", ALERT_WHATSAPP_TO: "+573001234567" };

    expect(createAlertChannelFromEnv(env)).toBeInstanceOf(TwilioWhatsAppAlertAdapter);
  });

  it("debe fallar con ALERT_NOT_CONFIGURED si no hay ningún canal", () => {
    expect(() => createAlertChannelFromEnv({})).toThrow(expect.objectContaining({ code: "ALERT_NOT_CONFIGURED" }));
  });
});
