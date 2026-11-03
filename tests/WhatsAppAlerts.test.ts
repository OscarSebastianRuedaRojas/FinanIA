import { describe, it, expect } from "vitest";
import { TwilioWhatsAppAlertAdapter } from "../src/adapters/notifications/TwilioWhatsAppAlertAdapter.js";
import { createAlertTools } from "../src/application/tools/alertTools.js";
import { AlertError, AlertPort } from "../src/ports/AlertPort.js";

type Reply = { status: number; body: unknown } | Error;

// fetch falso que responde en orden y guarda cada request
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

const config = {
  accountSid: "AC123",
  username: "AC123",
  password: "secreto",
  from: "whatsapp:+14155238886",
  to: "whatsapp:+573001234567",
  retryBaseDelayMs: 1,
};

async function alertError(promise: Promise<unknown>): Promise<AlertError> {
  return promise.then(
    () => {
      throw new Error("Se esperaba un AlertError");
    },
    (e) => e
  );
}

describe("TwilioWhatsAppAlertAdapter (S1)", () => {
  it("debe enviar el mensaje por la API REST de Twilio con autenticación básica", async () => {
    const { fetchFn, requests } = fakeFetch([{ status: 201, body: { sid: "SM42", status: "queued" } }]);
    const adapter = new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn });

    const result = await adapter.send({ severity: "CRITICAL", title: "Corrida detenida", message: "Se alcanzó el tope de créditos" });

    expect(result).toEqual({ id: "SM42" });
    expect(requests[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(requests[0].init.method).toBe("POST");
    expect((requests[0].init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("AC123:secreto").toString("base64")}`
    );
    const form = new URLSearchParams(String(requests[0].init.body));
    expect(form.get("From")).toBe("whatsapp:+14155238886");
    expect(form.get("To")).toBe("whatsapp:+573001234567");
    expect(form.get("Body")).toBe("🚨 FinanIA [CRITICAL] Corrida detenida\nSe alcanzó el tope de créditos");
  });

  it("debe recortar mensajes al límite de 1.600 caracteres de Twilio", async () => {
    const { fetchFn, requests } = fakeFetch([{ status: 201, body: { sid: "SM1" } }]);

    await new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "x".repeat(3000) });

    const body = new URLSearchParams(String(requests[0].init.body)).get("Body")!;
    expect(body.length).toBe(1600);
    expect(body.endsWith("…")).toBe(true);
  });

  it("debe explicar cómo unirse al sandbox cuando Twilio responde 63015", async () => {
    const { fetchFn, requests } = fakeFetch([
      { status: 400, body: { code: 63015, message: "Channel Sandbox can only send messages to phone numbers that have joined the Sandbox", status: 400 } },
    ]);

    const error = await alertError(new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" }));

    expect(error.code).toBe("ALERT_RECIPIENT_NOT_JOINED");
    expect(error.message).toContain("join");
    expect(error.message).not.toContain("3001234567");
    expect(requests).toHaveLength(1);
  });

  it("debe reintentar fallas transitorias (red o 5xx) y luego entregar", async () => {
    const { fetchFn, requests } = fakeFetch([new Error("ECONNRESET"), { status: 503, body: { message: "unavailable" } }, { status: 201, body: { sid: "SM7" } }]);

    const result = await new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "WARNING", title: "t", message: "m" });

    expect(result.id).toBe("SM7");
    expect(requests).toHaveLength(3);
  });

  it("debe informar ALERT_RATE_LIMITED cuando Twilio limita los envíos", async () => {
    const { fetchFn } = fakeFetch([{ status: 429, body: { code: 20429, message: "Too Many Requests" } }]);

    const error = await alertError(new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" }));

    expect(error.code).toBe("ALERT_RATE_LIMITED");
  });

  it("debe fallar con ALERT_DELIVERY_FAILED si la red no se recupera", async () => {
    const { fetchFn, requests } = fakeFetch([new Error("ENOTFOUND api.twilio.com")]);

    const error = await alertError(new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" }));

    expect(error.code).toBe("ALERT_DELIVERY_FAILED");
    expect(requests).toHaveLength(4);
  });

  it("fromEnv debe exigir credenciales y destinatario, sin exponer secretos en el error", () => {
    expect(() => TwilioWhatsAppAlertAdapter.fromEnv({})).toThrow(AlertError);
    try {
      TwilioWhatsAppAlertAdapter.fromEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "muy-secreto" });
    } catch (error: any) {
      expect(error.code).toBe("ALERT_NOT_CONFIGURED");
      expect(error.message).toContain("ALERT_WHATSAPP_TO");
      expect(error.message).not.toContain("muy-secreto");
    }
  });

  it("fromEnv debe aceptar API key en lugar del Auth Token y normalizar el número", () => {
    const adapter = TwilioWhatsAppAlertAdapter.fromEnv({
      TWILIO_ACCOUNT_SID: "AC1",
      TWILIO_API_KEY: "SK1",
      TWILIO_API_SECRET: "s",
      ALERT_WHATSAPP_TO: "+57 300 123 4567",
    });

    expect(adapter.recipient).toBe("whatsapp:+573001234567");
  });
});

describe("sendAlert como herramienta del agente (S2)", () => {
  it("debe enviar la alerta y devolver su id", async () => {
    const sent: unknown[] = [];
    const port: AlertPort = { send: async (alert) => (sent.push(alert), { id: "SM9" }) };
    const [sendAlert] = createAlertTools(port);

    const result = await sendAlert.execute({ severity: "WARNING", title: "Margen negativo", message: "Revisá el negocio 7723127-1-1" });

    expect(result).toEqual({ ok: true, data: { alertId: "SM9" } });
    expect(sent).toEqual([{ severity: "WARNING", title: "Margen negativo", message: "Revisá el negocio 7723127-1-1" }]);
  });

  it("debe devolverle al agente el código del error de entrega", async () => {
    const port: AlertPort = {
      send: async () => {
        throw new AlertError("ALERT_RECIPIENT_NOT_JOINED", "El número no se unió al sandbox");
      },
    };
    const [sendAlert] = createAlertTools(port);

    expect(await sendAlert.execute({ severity: "INFO", title: "t", message: "m" })).toEqual({
      ok: false,
      error: { code: "ALERT_RECIPIENT_NOT_JOINED", message: "El número no se unió al sandbox" },
    });
  });

  it("debe rechazar severidades inválidas o mensajes vacíos", async () => {
    const [sendAlert] = createAlertTools({ send: async () => ({ id: "x" }) });

    expect(await sendAlert.execute({ severity: "URGENTE", title: "t", message: "m" })).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
    expect(await sendAlert.execute({ severity: "INFO", title: "t", message: "" })).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENTS" } });
  });
});

describe("Toolset del agente por objetivo", () => {
  it("debe incluir sendAlert solo cuando hay un canal de alertas configurado", async () => {
    const { buildGoalToolset } = await import("../src/application/goalToolset.js");
    const stub = {} as any;

    const without = buildGoalToolset({ businesses: stub, reports: stub, runId: "r" });
    const withAlerts = buildGoalToolset({ businesses: stub, reports: stub, runId: "r", alerts: { send: async () => ({ id: "x" }) } });

    expect(without.tools.map((t) => t.name)).not.toContain("sendAlert");
    expect(withAlerts.tools.map((t) => t.name).at(-1)).toBe("sendAlert");
  });
});

describe("Privacidad de los errores de alertas", () => {
  it("no debe repetir números de teléfono que vengan en el error de Twilio", async () => {
    const { fetchFn } = fakeFetch([
      { status: 400, body: { code: 21211, message: "The 'To' number whatsapp:+573001234567 is not a valid phone number." } },
    ]);

    const error = await alertError(new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" }));

    expect(error.code).toBe("ALERT_DELIVERY_FAILED");
    expect(error.message).not.toContain("3001234567");
    expect(error.message).toContain("[número]");
  });
});

describe("Privacidad: números en formato local", () => {
  it("debe enmascarar números con paréntesis o puntos", async () => {
    const { fetchFn } = fakeFetch([{ status: 400, body: { code: 21211, message: "Invalid To: (300) 123-4567 or 300.123.4567" } }]);

    const error = await alertError(new TwilioWhatsAppAlertAdapter({ ...config, fetch: fetchFn }).send({ severity: "INFO", title: "t", message: "m" }));

    expect(error.message).not.toMatch(/123.?4567/);
  });
});
