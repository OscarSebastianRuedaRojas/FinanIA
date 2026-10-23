import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GrokVisionAdapter } from "../src/adapters/llm/GrokVisionAdapter.js";
import { ChatCompletionsClient } from "../src/adapters/llm/GrokLLMAdapter.js";
import { InvoiceImage, InvoiceScanError } from "../src/ports/InvoiceScannerPort.js";

const image: InvoiceImage = {
  data: fs.readFileSync(path.resolve(__dirname, "fixtures", "invoices", "factura_sintetica.png")),
  mimeType: "image/png",
};

const validExtraction = {
  vendorName: "FERRETERIA EL TORNILLO S.A.S.",
  vendorTaxId: "900.123.456-7",
  invoiceNumber: "FE-10234",
  date: "2026-09-14",
  currency: "COP",
  totalAmount: 177310,
  taxAmount: 28310,
  category: "Materiales y mantenimiento",
  type: "EXPENSE",
};

type Reply = string | Error;

// Cliente falso que responde en orden y guarda una copia de cada request
function scriptedClient(replies: Reply[]) {
  const requests: any[] = [];
  const client: ChatCompletionsClient = {
    chat: {
      completions: {
        create: async (params: any) => {
          requests.push(JSON.parse(JSON.stringify(params)));
          const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
          if (reply instanceof Error) throw reply;
          return {
            model: "grok-4.7",
            choices: [{ message: { role: "assistant", content: reply } }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          } as any;
        },
      },
    },
  };
  return { client, requests };
}

async function scanError(adapter: GrokVisionAdapter): Promise<InvoiceScanError> {
  return adapter.scan(image).then(
    () => {
      throw new Error("Se esperaba un InvoiceScanError");
    },
    (e) => e
  );
}

describe("GrokVisionAdapter", () => {
  it("S1.1/S2.1 debe enviar la imagen en base64 a temperatura 0 y devolver la extracción validada", async () => {
    const { client, requests } = scriptedClient([JSON.stringify(validExtraction)]);
    const adapter = new GrokVisionAdapter({ client });

    const result = await adapter.scan(image);

    const content = requests[0].messages.at(-1).content;
    expect(content).toContainEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${image.data.toString("base64")}` },
    });
    expect(requests[0].temperature).toBe(0);
    expect(result.extraction).toEqual(validExtraction);
    expect(result.telemetry).toMatchObject({ promptTokens: 100, completionTokens: 20, totalTokens: 120 });
  });

  it("S2.2 debe aceptar JSON envuelto en un bloque Markdown", async () => {
    const { client } = scriptedClient(["```json\n" + JSON.stringify(validExtraction) + "\n```"]);

    const result = await new GrokVisionAdapter({ client }).scan(image);

    expect(result.extraction.totalAmount).toBe(177310);
  });

  it("S2.3 debe reintentar una vez explicando el error de validación", async () => {
    const { client, requests } = scriptedClient([
      JSON.stringify({ ...validExtraction, date: "14/09/2026" }),
      JSON.stringify(validExtraction),
    ]);

    const result = await new GrokVisionAdapter({ client }).scan(image);

    expect(requests).toHaveLength(2);
    expect(requests[1].messages.at(-1).content).toContain("YYYY-MM-DD");
    expect(result.extraction.date).toBe("2026-09-14");
    expect(result.telemetry.totalTokens).toBe(240);
  });

  it("S2.3 debe recuperarse de una respuesta que no es JSON", async () => {
    const { client, requests } = scriptedClient(["Claro, la factura dice...", JSON.stringify(validExtraction)]);

    const result = await new GrokVisionAdapter({ client }).scan(image);

    expect(requests).toHaveLength(2);
    expect(result.extraction.vendorName).toBe("FERRETERIA EL TORNILLO S.A.S.");
  });

  it("S2.3 debe fallar con INVALID_EXTRACTION si el reintento también es inválido", async () => {
    const { client, requests } = scriptedClient([JSON.stringify({ ...validExtraction, totalAmount: 0 })]);

    const error = await scanError(new GrokVisionAdapter({ client }));

    expect(error.code).toBe("INVALID_EXTRACTION");
    expect(error.message).toContain("totalAmount");
    expect(requests).toHaveLength(2);
  });

  it("S2.4 debe fallar con NOT_AN_INVOICE sin reintentar", async () => {
    const { client, requests } = scriptedClient([JSON.stringify({ isInvoice: false, reason: "Es una foto de un gato" })]);

    const error = await scanError(new GrokVisionAdapter({ client }));

    expect(error.code).toBe("NOT_AN_INVOICE");
    expect(error.message).toContain("Es una foto de un gato");
    expect(requests).toHaveLength(1);
  });

  it("S4.1 debe sobrevivir a fallas transitorias de la API con backoff exponencial", async () => {
    const { client, requests } = scriptedClient([new Error("503"), new Error("503"), JSON.stringify(validExtraction)]);

    const result = await new GrokVisionAdapter({ client, retryBaseDelayMs: 1 }).scan(image);

    expect(requests).toHaveLength(3);
    expect(result.extraction.invoiceNumber).toBe("FE-10234");
  });

  it("S4.2 debe fallar con VISION_API_ERROR al agotar los reintentos", async () => {
    const { client, requests } = scriptedClient([new Error("Servicio no disponible")]);

    const error = await scanError(new GrokVisionAdapter({ client, retryBaseDelayMs: 1 }));

    expect(error.code).toBe("VISION_API_ERROR");
    expect(error.message).toContain("Servicio no disponible");
    expect(requests).toHaveLength(4);
  });
});
