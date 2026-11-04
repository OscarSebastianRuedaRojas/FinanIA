# Feature: S4 — unattended runner, WhatsApp alerts and load test

Objective: process 1,000 real EMICRON units unattended over 12 hours with a complete log, reporting results and failures per unit, and alerting the operator by WhatsApp.
Branch: `feat/s4-unattended-runner` (from `main` 1e7a3fa) · Test runner: `npx vitest run` · Delivery: ask-on-risk

## Specs

Official S4 deliverable: "1,000 unidades de trabajo, 12 horas desatendido y bitácora completa." Evaluator feedback for S4: "regístrenlo en la entrega que corresponde, integren la rama a main y documenten resultados y fallos por caso."

- **S1 — WhatsApp alerts**: "empezemos con el envio de alerta pero quiero que lo hagamos por algo que no sea telegram como whatsapp por que no tengo telegram". Provider chosen by the user: Twilio WhatsApp Sandbox. A channel-agnostic `AlertPort` with a Twilio adapter (REST `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`, `From=whatsapp:+14155238886`, `To=whatsapp:+<E.164>`, `Body` ≤ 1,600 chars). Credentials only from `.env`. Structured errors: not configured, recipient not joined (Twilio 63015), rate limited, delivery failed. Transient failures (network, 5xx) are retried with the existing backoff.
- **S2 — `sendAlert` tool**: the agent can decide to alert the operator (severity, title, message); a test command verifies the configuration.
- **S3 — Unattended runner**: queue of EMICRON units, persistent checkpoint (resume without repeating finished units), limited concurrency, credit cap, progress and failure alerts.
- **S3.1 — Pacing (user decision)**: "Ritmo fijo (Recomendado)": the 1,000 units are spread over 12 hours (unit *i* is scheduled at start + i × 43.2 s), so the run ends at the 12-hour mark. Concurrency is capped (default 2) so a slow unit never pushes the schedule back by more than one slot.
- **S3.2 — Checkpoint**: unit state (pending, running, done, failed) lives in `data/finania.sqlite`; resuming a run skips finished units and re-queues units left running by a crash.
- **S3.3 — Failures**: a failed unit is retried once; its final error code is stored. Three consecutive failures send a WARNING alert. Alert failures never stop the run.
- **S3.4 — Credit cap**: when the accumulated cost reaches the cap (default US$25) no new unit starts, a CRITICAL alert is sent and the remaining units stay pending.
- **S3.5 — Progress alerts**: start, every 100 units, and finish (with totals).
- **S4 — Load test**: 1,000 units, 12 hours unattended, complete log with results and failures per unit.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| A1 | S1, S2 | inline | done | RED missing module → GREEN; phone-number leaks in error messages found and covered by tests; suite 115/115; independent security verifier: no blockers (advisory on local-format numbers fixed); live send pending user Twilio credentials |
| A2 | S3, S3.1–S3.5 | inline | done | RED → GREEN: runner 10/10, checkpoint 5/5, report 5/5; suite 147/147; live rehearsal s4-ensayo: 3/3 validated, US$0.0456, resume skips finished units, 3 reports saved, log redacted |
| A3 | S4 | inline | done | `s4-final`: 1,000/1,000 validated, 0 failed, 0 retries, 11.99 h unattended at 43.2 s per unit, 6,085,946 tokens, US$13.88 (cap US$25); log redacted |

## Log

- L1 (2026-11-03, user): "Creame una rama que sea s4 de main, y empezemos con el envio de alerta peo quieo que lo hagamos po algo que no sea telegram como whatsapp por que no tengo telegram"
- L2 (2026-11-03, user choice): "Twilio Sandbox (Recomendado)". Verified on twilio.com: sandbox sender +14155238886, recipients join with `join <code>`, session lasts 3 days, one message every 3 seconds, free-form text allowed inside the 24-hour window, error 63015 = recipient not joined or session expired.
- L3 (2026-11-03): Twilio account suspended for lack of funds (HTTP 401, 20003); CallMeBot not accepting new users ("The bot is currently full"). User chose ntfy push notifications ("Otro canal gratis (ntfy)"). ntfy.sh topic acts as password; JSON publishing used so titles with accents/emojis work; topic and token are scrubbed from error messages; alert text must not quote DANE figures (third-party server). Twilio adapter kept; channel selected from .env (ALERT_CHANNEL, else ntfy, else WhatsApp).
- L4 (2026-11-03): Live check `npm run alerta:prueba` via ntfy.sh accepted (message id lZQGHfOH658X); user confirmed: "Sí, llegó". A first attempt was rejected by the topic validation (7-character topic) before any request, as designed.
- L5 (2026-11-03, user choice): "Ritmo fijo (Recomendado)" — spread the 1,000 units over 12 hours.
- L6 (2026-11-04, user): "Listo revisa ya hice el proceso de las 1000 unidades". Verified from the checkpoint and the log: 2026-11-04 03:27 → 15:26 UTC, no pause over 5 min, 2,000 Grok calls, 3,000 tool calls, 0 tool errors, 0 forced final answers; latency spikes up to 67 s were absorbed by concurrency 2.
