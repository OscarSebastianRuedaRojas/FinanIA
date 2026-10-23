import OpenAI from "openai";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { InvoiceExtraction, InvoiceExtractionSchema } from "../../domain/entities/Invoice.js";
import { InvoiceImage, InvoiceScanError, InvoiceScanResult, InvoiceScannerPort } from "../../ports/InvoiceScannerPort.js";
import { ChatCompletionsClient } from "./GrokLLMAdapter.js";
import { withExponentialBackoff } from "./exponentialBackoff.js";
import { ExecutionObserver, LLMUsage } from "../../ports/ExecutionLogPort.js";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const SYSTEM_PROMPT = `Eres el módulo de digitalización de FinanIA. Recibes la foto de una factura o recibo de una PyME y devuelves SOLO un objeto JSON, sin texto adicional.

Si la imagen NO es una factura ni un recibo, responde exactamente:
{"isInvoice": false, "reason": "<qué muestra la imagen>"}

Si lo es, responde con este esquema:
{
  "vendorName": "Razón social de quien emite el documento",
  "vendorTaxId": "NIT o identificación tributaria, o null",
  "invoiceNumber": "Número de factura o recibo, o null",
  "date": "YYYY-MM-DD",
  "currency": "Código ISO 4217 en mayúsculas (COP, MXN, USD...)",
  "totalAmount": número total a pagar sin separadores de miles (ej. 177310),
  "taxAmount": número del impuesto (IVA) o null,
  "category": "Categoría contable breve en español (ej. Proveedores, Servicios públicos, Arriendo, Transporte)",
  "type": "EXPENSE" | "INCOME"
}

Reglas:
- Una factura o recibo emitido por un proveedor a la PyME es "EXPENSE". Solo usa "INCOME" si el documento es una venta emitida por la propia PyME a su cliente.
- Interpreta los separadores según el país: en Colombia "177.310" son ciento setenta y siete mil trescientos diez.
- No inventes datos: si un campo opcional no aparece, usa null.`;

// Extrae y valida los datos de una factura o recibo con Grok Vision
export class GrokVisionAdapter implements InvoiceScannerPort {
  private client: ChatCompletionsClient;
  private model: string;
  private retryBaseDelayMs: number;
  private observer?: ExecutionObserver;

  constructor(options: { client?: ChatCompletionsClient; retryBaseDelayMs?: number; observer?: ExecutionObserver } = {}) {
    this.observer = options.observer;
    this.model = process.env.LLM_MODEL || "grok-4.7";
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;

    if (options.client) {
      this.client = options.client;
      return;
    }

    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey || apiKey === "pk_placeholder") {
      throw new Error("LLM_API_KEY no está configurada en las variables de entorno.");
    }
    this.client = new OpenAI({ baseURL: process.env.LLM_BASE_URL || "https://api.reto.pltk.mx/v1", apiKey });
  }

  async scan(image: InvoiceImage): Promise<InvoiceScanResult> {
    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Digitaliza este documento." },
          { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data.toString("base64")}` } },
        ],
      },
    ];

    const startTime = performance.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let model = this.model;
    let lastProblem = "";

    // Un intento más un reintento correctivo si la respuesta no pasa la validación
    for (let attempt = 0; attempt < 2; attempt++) {
      const callStart = performance.now();
      const response = await this.complete(messages);
      this.observer?.llmCall({
        kind: "vision",
        iteration: attempt + 1,
        model: response.model || this.model,
        latencyMs: Math.round(performance.now() - callStart),
        usage: response.usage as LLMUsage | undefined,
      });
      promptTokens += response.usage?.prompt_tokens || 0;
      completionTokens += response.usage?.completion_tokens || 0;
      model = response.model || model;

      const content = response.choices[0]?.message?.content ?? "";
      const outcome = this.parse(content);
      if ("extraction" in outcome) {
        return {
          extraction: outcome.extraction,
          telemetry: {
            executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            model,
          },
        };
      }

      lastProblem = outcome.problem;
      console.warn(`⚠️ [Vision] Respuesta inválida (intento ${attempt + 1}/2): ${lastProblem}`);
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content: `Tu respuesta anterior no es válida: ${lastProblem}\nResponde SOLO el objeto JSON corregido con el esquema indicado.`,
        }
      );
    }

    throw new InvoiceScanError("INVALID_EXTRACTION", `Grok no devolvió una extracción válida tras el reintento: ${lastProblem}`);
  }

  private async complete(messages: Message[]): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      return await withExponentialBackoff(
        () => this.client.chat.completions.create({ model: this.model, messages, temperature: 0 }),
        3,
        this.retryBaseDelayMs
      );
    } catch (error: any) {
      throw new InvoiceScanError("VISION_API_ERROR", `La API de Grok Vision no respondió: ${error?.message ?? error}`);
    }
  }

  private parse(content: string): { extraction: InvoiceExtraction } | { problem: string } {
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    let json: any;
    try {
      json = JSON.parse(cleaned);
    } catch {
      return { problem: "no es JSON válido." };
    }

    if (json?.isInvoice === false) {
      throw new InvoiceScanError("NOT_AN_INVOICE", `La imagen no es una factura ni un recibo: ${json.reason ?? "sin motivo"}`);
    }

    const validation = InvoiceExtractionSchema.safeParse(json);
    if (!validation.success) {
      return { problem: z.prettifyError(validation.error) };
    }
    return { extraction: validation.data };
  }
}
