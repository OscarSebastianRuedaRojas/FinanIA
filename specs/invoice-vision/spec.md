# Spec: Invoice and receipt mapping with Grok Vision

Status: approved for implementation · Branch: `feat/invoice-vision` (stacked on `feat/emicron-monthly-tools`)

## Intent

A PyME owner photographs a physical invoice or receipt and FinanIA turns it into a validated `Transaction` that the audit agent can use. Source request: "**Mapeo Multimodal de Facturas y Recibos (Grok Vision)** usando SDD". ROADMAP item (S2):

> - Adaptador `GrokVisionAdapter.ts` para ingerir fotos de facturas físicas o recibos bancarios en Base64.
> - Extracción determinística con validación de esquema `TransactionSchema` (Monto, Fecha, Categoría, Proveedor).
> - Comando CLI `npm run scan:factura <path-a-imagen>`.

Feasibility evidence: on 2026-10-23 the challenge endpoint (`grok-4.7`) read a synthetic PNG invoice sent as a base64 `image_url` and returned vendor, NIT, date, total `177310` and currency `COP` correctly (5.5 s, 420 image tokens).

## Requirements

### R1 — Read an invoice image
The system MUST accept a local JPEG or PNG file (by extension and magic bytes), up to 10 MB, and send it to Grok Vision as base64.

- **S1.1** Given a valid PNG invoice, when it is scanned, then Grok receives a `data:image/png;base64,...` image part.
- **S1.2** Given a `.pdf`, `.gif` or a file whose bytes are not JPEG/PNG, when it is scanned, then the scan fails with `UNSUPPORTED_FILE` and Grok is never called.
- **S1.3** Given a file larger than 10 MB, then the scan fails with `FILE_TOO_LARGE` and Grok is never called.
- **S1.4** Given a path that does not exist, then the scan fails with `FILE_NOT_FOUND`.

### R2 — Deterministic, validated extraction
The model output MUST be validated with Zod before anything uses it. Extraction runs at `temperature: 0`.

Extracted fields: `vendorName` (required), `vendorTaxId` (NIT, optional), `invoiceNumber` (optional), `date` (`YYYY-MM-DD`, real calendar date), `currency` (ISO 4217, three uppercase letters), `totalAmount` (> 0), `taxAmount` (≥ 0, optional), `category` (required), `type` (`EXPENSE` or `INCOME`).

- **S2.1** Given Grok returns valid JSON, then the extraction is returned with every field typed as above.
- **S2.2** Given Grok returns JSON wrapped in a Markdown code fence, then it is still parsed.
- **S2.3** Given Grok returns invalid JSON or JSON that fails the schema, then the adapter retries once, telling the model what failed; if the second answer is also invalid, the scan fails with `INVALID_EXTRACTION` including the validation messages.
- **S2.4** Given the image is not an invoice or receipt, Grok answers `{"isInvoice": false, "reason": "..."}` and the scan fails with `NOT_AN_INVOICE` carrying that reason, with no retry.

### R3 — Map to a Transaction
A valid extraction MUST map to a `Transaction` that passes `TransactionSchema`:
`amount = totalAmount`, `type`, `category`, `date`, `description = "<vendorName> — Factura <invoiceNumber>"` (or `"<vendorName> — Recibo"` without number), `id = "scan-<timestamp>"`.

- **S3.1** Given the synthetic invoice extraction, then the transaction is `{ amount: 177310, type: "EXPENSE", category, description: "FERRETERIA EL TORNILLO S.A.S. — Factura FE-10234", date: "2026-09-14" }`.

### R4 — Resilience against the API
Vision calls MUST reuse the existing exponential backoff (3 retries) used by `GrokLLMAdapter`. After the retries are exhausted the scan fails with `VISION_API_ERROR`.

- **S4.1** Given the API fails twice and then answers, the scan succeeds.
- **S4.2** Given the API keeps failing, the scan fails with `VISION_API_ERROR`.

### R5 — CLI `npm run scan:factura`
`npm run scan:factura -- <imagen> [--guardar <dataset.json>]`

- **S5.1** Without `--guardar`, the CLI prints the extraction, the mapped transaction and telemetry (latency, tokens) and writes nothing.
- **S5.2** With `--guardar data/transactions.json`, the transaction is appended to that dataset through `JsonFileFinancialAdapter.addTransaction`, so `npm start` audits it afterwards.
- **S5.3** On any scan error the CLI prints the error code and message, exits with code 1, and writes nothing.
- **S5.4** Without `LLM_API_KEY`, the CLI fails with a clear message instead of a stack trace.

## Out of scope

- PDF invoices and DIAN electronic-invoice XML.
- Exposing the scanner as an agent tool inside the ReAct loop (natural next step).
- Line-item extraction.

## Assumptions

- Invoices received from suppliers are `EXPENSE`; the model is told so and only marks `INCOME` for sales receipts issued by the business.
- Test images are synthetic and generated for this repo; no real customer invoice is committed.
