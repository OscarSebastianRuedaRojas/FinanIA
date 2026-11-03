# Feature: S4 — unattended runner, WhatsApp alerts and load test

Objective: process 1,000 real EMICRON units unattended over 12 hours with a complete log, reporting results and failures per unit, and alerting the operator by WhatsApp.
Branch: `feat/s4-unattended-runner` (from `main` 1e7a3fa) · Test runner: `npx vitest run` · Delivery: ask-on-risk

## Specs

Official S4 deliverable: "1,000 unidades de trabajo, 12 horas desatendido y bitácora completa." Evaluator feedback for S4: "regístrenlo en la entrega que corresponde, integren la rama a main y documenten resultados y fallos por caso."

- **S1 — WhatsApp alerts**: "empezemos con el envio de alerta pero quiero que lo hagamos por algo que no sea telegram como whatsapp por que no tengo telegram". Provider chosen by the user: Twilio WhatsApp Sandbox. A channel-agnostic `AlertPort` with a Twilio adapter (REST `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`, `From=whatsapp:+14155238886`, `To=whatsapp:+<E.164>`, `Body` ≤ 1,600 chars). Credentials only from `.env`. Structured errors: not configured, recipient not joined (Twilio 63015), rate limited, delivery failed. Transient failures (network, 5xx) are retried with the existing backoff.
- **S2 — `sendAlert` tool**: the agent can decide to alert the operator (severity, title, message); a test command verifies the configuration.
- **S3 — Unattended runner**: queue of EMICRON units, persistent checkpoint (resume without repeating finished units), limited concurrency, credit cap, progress and failure alerts.
- **S4 — Load test**: 1,000 units, 12 hours unattended, complete log with results and failures per unit.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| A1 | S1, S2 | inline | done | RED missing module → GREEN; phone-number leaks in error messages found and covered by tests; suite 115/115; independent security verifier: no blockers (advisory on local-format numbers fixed); live send pending user Twilio credentials |
| A2 | S3 | inline | pending | — |
| A3 | S4 | inline | pending | — |

## Log

- L1 (2026-11-03, user): "Creame una rama que sea s4 de main, y empezemos con el envio de alerta peo quieo que lo hagamos po algo que no sea telegram como whatsapp por que no tengo telegram"
- L2 (2026-11-03, user choice): "Twilio Sandbox (Recomendado)". Verified on twilio.com: sandbox sender +14155238886, recipients join with `join <code>`, session lasts 3 days, one message every 3 seconds, free-form text allowed inside the 24-hour window, error 63015 = recipient not joined or session expired.
