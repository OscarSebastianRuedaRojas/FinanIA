# Design: Invoice and receipt mapping with Grok Vision

Implements [spec.md](spec.md). Follows the existing hexagonal layout.

## Components

| Layer | File | Responsibility | Spec |
| --- | --- | --- | --- |
| Domain | `src/domain/entities/Invoice.ts` | `InvoiceExtractionSchema` (Zod) and type | R2 |
| Domain | `src/domain/services/InvoiceMapper.ts` | Pure `toTransaction(extraction, now)` | R3 |
| Port | `src/ports/InvoiceScannerPort.ts` | `scan(image)` contract, `InvoiceScanError` with `code` | R1–R4 |
| Adapter | `src/adapters/llm/GrokVisionAdapter.ts` | Prompt, base64 image part, fence stripping, Zod validation, one corrective retry | R2, R4 |
| Adapter | `src/adapters/llm/exponentialBackoff.ts` | Backoff extracted from `GrokLLMAdapter` and shared by both adapters | R4 |
| Infra | `src/infrastructure/invoice/readInvoiceImage.ts` | Existence, size, extension + magic bytes → `{ data, mimeType }` | R1 |
| Application | `src/application/ScanInvoiceUseCase.ts` | read → scan → map → optional save | R1, R3, R5 |
| CLI | `src/scanInvoice.ts` | Arg parsing, output, exit codes | R5 |

## Flow

```text
scan:factura <img> [--guardar f.json]
  → readInvoiceImage(path)             FILE_NOT_FOUND | UNSUPPORTED_FILE | FILE_TOO_LARGE
  → GrokVisionAdapter.scan(image)      withExponentialBackoff → VISION_API_ERROR
       parse → Zod ─fail→ retry once with the errors ─fail→ INVALID_EXTRACTION
       {"isInvoice": false} → NOT_AN_INVOICE
  → InvoiceMapper.toTransaction()      TransactionSchema.parse
  → [--guardar] JsonFileFinancialAdapter.addTransaction()
```

## Decisions

- **Retry once on invalid output, not more.** One corrective turn fixes most format slips; more turns cost tokens without evidence they help.
- **Backoff extracted, not copied.** `GrokLLMAdapter.executeWithExponentialBackoff` moves verbatim to `exponentialBackoff.ts`; `GrokLLMAdapter` calls it with the same defaults (3 retries, 1000 ms base) so its behavior does not change.
- **Injectable client and delay.** Like `GrokLLMAdapter`, the vision adapter accepts a `ChatCompletionsClient`; the backoff accepts a `baseDelayMs` so tests run without real waits.
- **Validation of the file happens before any API call**, so a bad file never spends tokens.
- **`id` and clock are injected** into the mapper (`now`) to keep it deterministic in tests.

## Error codes

`FILE_NOT_FOUND`, `UNSUPPORTED_FILE`, `FILE_TOO_LARGE`, `NOT_AN_INVOICE`, `INVALID_EXTRACTION`, `VISION_API_ERROR`.
