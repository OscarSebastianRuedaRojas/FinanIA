# Feature: S3 — goal-driven agent, evaluation set and cost report

Objective: the agent receives a free-text goal, plans its own steps over real EMICRON data, acts (saves reports), and is measured with a 30+ case evaluation set and a cost-per-task report.
Branch: `feat/s3-goal-agent` (from `main` after PR #1) · Test runner: `npx vitest run` · Delivery: ask-on-risk

## Specs

Source: ROADMAP.md, section "S3: Datos Reales, Autonomía y Costos". Official S3 deliverable: "Set de evaluación propio de 30+ casos y reporte de costo por tarea." Contest rule: "Un agente que recibe un objetivo, decide pasos, usa herramientas y actúa sobre datos reales sin que nadie lo guíe."

- **S1 — Loop exhaustion**: "si se alcanzan las iteraciones máximas sin respuesta, forzar un cierre explícito en lugar de un dictamen por defecto." When the ReAct loop runs out of iterations, the agent gets one last call without tools asking for the final answer; the event is logged.
- **S2 — Search tools**: "Requiere herramientas de búsqueda sobre la base (filtrar por sector, departamento, métricas)." A tool lists micro-businesses filtered by sector and department and ranked by a metric (operating margin, sales, year-over-year change), with typed arguments and structured errors (unknown sector/department names return the valid options).
- **S3 — Goal as input**: "el agente recibe un objetivo en texto libre y planifica sus pasos. Ej.: *"Encontrá los 10 restaurantes de Antioquia con peor margen frente a su sector y redactá un plan para cada uno"*." New CLI `npm run agent -- "<objetivo>"`; the agent decides which tools to call and ends with a structured report.
- **S4 — Action tool**: "el agente no solo analiza, también actúa: guardar el dictamen en la base (`saveAuditReport`)". Reports are written to FinanIA's own store (`data/finania.sqlite`, separate from the read-only DANE database) and can be listed afterwards. `sendAlert` (Telegram/WhatsApp) needs user credentials and is deferred until the user provides them.
- **S5 — Invoice scanner as a tool**: "exponer Grok Vision dentro del loop ReAct."
- **S6 — Evaluation set**: "micronegocios EMICRON elegidos por escenario (pérdida, margen bajo vs pares, crecimiento, caída interanual, gastos fuera de patrón) con el resultado esperado de cada caso, y un comando que corre el set y reporta aciertos." 30+ cases; expected results computed deterministically from the data (SQL ground truth), never from the model.
- **S7 — Cost report**: "a partir de la bitácora, costo en USD por auditoría (promedio, mínimo, máximo, por tipo de tarea) y proyección del costo de las 1,000 unidades de S4 antes de lanzarlas."

Out of scope for now: benchmark against a human (optional item), `sendAlert` until credentials exist.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1 | inline | done | RED 1 failed → GREEN; suite 71/71 |
| T2 | S2 | inline | done | RED missing module → GREEN 8/8; real data: worst-margin restaurants in Antioquia in 425 ms; "restaurantes" → INVALID_ARGUMENTS with valid sectors |
| T3 | S4 | inline | done | RED missing module → GREEN 5/5; suite 84/84 |
| T4 | S3, S5 | inline | done | RED missing module → GREEN 6/6; suite 90/90; live: roadmap goal (3 worst-margin restaurants in Antioquia) → 13 tool calls, 3 reports saved, same IDs as SQL ranking, US$0.0341 |
| T5 | S6 | inline | done | `npm run eval:s3`: 34/34 (30 scenario audits + 4 goals), 263,475 tokens, US$0.64; goals 0 tool errors; evidence redacted (saveAuditReport args leak found and fixed) |
| T6 | S7 | inline | done | RED missing module → GREEN 4/4; smoke on S2 log matches the manual numbers ($0.014974 avg EMICRON, 5.53 h for 1,000 units) |

Route evidence: tasks depend on each other (T4 uses T1–T3, T5 uses T4, T6 reads T5's log); no Writer trigger, all inline.

## Log

- L1 (2026-11-01, user): "Abre una rama de main y vamos a empezar con el desaollo de la S3 que esta en el roadmap"
- L2: PR #1 (S2: EMICRON tools, invoice vision, execution log) is merged into `main`; branch created from `f3ba676`.
- L3: The first eval log contained saveAuditReport free-text args (business figures). Fixed in the recorder (structural-args allowlist) and the existing evidence was sanitized with the same function instead of re-running. Caveat: in the "perdida" scenario the priority guardrail already forces HIGH/CRITICAL, so that check measures the full system rather than the model alone.
