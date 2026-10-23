# Feature: Execution log and 10 validated runs (S2)

Objective: record every agent execution in a JSONL log and produce the S2 evidence of 10 validated runs.
Branch: `feat/execution-log` (stacked on `feat/invoice-vision`) · Test runner: `npx vitest run`

## Specs

- **S1** — "Realizame la bitacora": every LLM call, tool call and run outcome is appended as one JSON line: run ID, timestamp, model, latency, tokens (prompt, completion, reasoning, cached), cost from `usage.cost_in_usd_ticks` (1 USD = 10^10 ticks, per docs.x.ai/developers/cost-tracking), tool name, arguments, `ok`/error code, duration, final status and result.
- **S2** — "y las 10 ejecuiones validadas": one command runs 10 executions across the three data sources (synthetic JSON, real EMICRON, invoice images), validates each against explicit checks, and writes the evidence (`.jsonl` + Markdown summary) under `docs/bitacora/`.
- **S3** — Logging never breaks an execution: a failed write only warns.
- **S4** — DANE license: evidence that is committed must not reproduce EMICRON microdata; EMICRON runs keep IDs, tools, tokens, cost and priority, but not the dictamen text or tool payloads.
- **S5** — The regular CLIs (`npm start`, `start:emicron`, `scan:factura`) also append to the local log `logs/executions.jsonl` (gitignored).

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| E1 | S1, S3, S4 | inline | done | RED: module missing; GREEN 6/6 |
| E2 | S1 | inline | done | GREEN 2/2; RED confirmed by stashing the hooks (2 failed) |
| E3 | S2, S4 | inline | pending | — |
| E4 | S2 | inline | pending | — |
| E5 | S5 | inline | pending | — |

- E1: `ExecutionLogPort`, JSONL adapter, `ExecutionRecorder` (totals, cost, redaction).
- E2: observer hooks in `GrokLLMAdapter` (LLM + tool calls) and `GrokVisionAdapter`.
- E3: execution plan runner with validation checks and Markdown summary.
- E4: run the 10 real executions and commit the evidence.
- E5: CLIs log to `logs/executions.jsonl`; README.

## Log

- L1 (2026-10-23, user): "Realizame la bitacora y las 10 ejecuiones validadas"
- L2: Scenario businesses picked from EMICRON: loss `7627478-1-2`, growth `7627474-1-1`, year-over-year drop `7628486-1-1`, low margin `7628122-1-1`, few department peers `7638460-1-1` (Minería, Huila: 1 peer → `INSUFFICIENT_PEERS` at department scope).
