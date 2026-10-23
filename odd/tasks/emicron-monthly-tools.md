# Feature: EMICRON monthly tools

Objective: add real-data monthly tools over DANE EMICRON 2024 while keeping the weekly tools on the synthetic cases.
Branch: `feat/emicron-monthly-tools` · Delivery: ask-on-risk · Test runner: `npx vitest run`

## Specs

- **S1** — Keep the weekly tools on the synthetic cases: "Mantené las semanales sobre los casos sintéticos". `npm start`, `start:quiebra`, `start:saludable`, `start:hormiga` keep working with the same five tools.
- **S2** — Add monthly tools over EMICRON: "agregá las mensuales sobre EMICRON". Source: EMICRON 2024 (microdatos.dane.gov.co catalog 875), modules Identificación, Costos/Gastos/Activos and Ventas/Ingresos, joined by `DIRECTORIO + SECUENCIA_P + SECUENCIA_ENCUESTA`.
- **S3** — Each tool follows the organizers' rule: "Una herramienta es una función que el agente decide invocar por sí mismo para consultar información o ejecutar una acción real [...] y tengan manejo de errores. [...] Lo que no cuenta es una función que solo regresa datos fijos." Tools take typed arguments, query the local SQLite store, and return a structured error to the LLM instead of crashing; an unknown tool name also returns an error.
- **S4** — License: DANE microdata use requires the citation "Fuente: Departamento Administrativo Nacional de Estadística: www.dane.gov.co" and forbids redistributing the data to multiple users without written approval. Raw files and the SQLite database are never committed (`data/raw/`, `data/*.sqlite` in `.gitignore`); test fixtures are synthetic.
- **S5** — Ingestion is reproducible: one command loads the downloaded CSVs into SQLite; README documents download, ingestion, run and citation.

Assumptions (verified against the 2024 data, first rows): `VENTAS_MES_ANTERIOR` = last month sales; `VENTAS_MES_ANIO_ANTERIOR` = same month of the previous year; `VENTAS_ANIO_ANTERIOR` = previous-year total (the DANE labels of the last two look swapped). `P3017_*` and `GASTOS_MES` are monthly expenses; `P3056_*` / `COSTOS_MES_ANTERIOR` are last-month costs. Payroll (Personal Ocupado module) is out of scope for now.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S2, S4, S5 | inline | done | RED: module missing, then "Otros costos" count; GREEN 5/5; real ingest 78,501 rows |
| T2 | S2, S3 | inline | done | RED: missing modules; GREEN 8/8; real smoke: 2–174 ms per call, 568 department / 10,983 national peers |
| T3 | S1, S3 | inline | done | RED: client injection/adapter missing; GREEN 24/24; live Grok run on EMICRON 7627474-1-1 called 3 monthly tools; start:quiebra still calls the 5 weekly tools; mock-mode output identical to main for 2 cases |
| T4 | S4, S5 | inline | done | README section 6 (download, ingest, run, tools, errors, DANE citation); Node requirement raised to v22.13 for `node:sqlite`; structural readback |

- T1: CSV ingestion → SQLite (`npm run data:emicron`), synthetic fixture tests.
- T2: monthly data port + SQLite adapter + three monthly tools with typed args and error results.
- T3: pluggable toolset in the ReAct loop; weekly toolset unchanged by default; unknown/failed tool → error result; EMICRON CLI mode.
- T4: README, `.gitignore`, citation, scripts.

Route evidence: no Writer trigger (units depend on each other, no parallelism); all inline.

## Log

- L1 (2026-10-23, user): "Mantené las semanales sobre los casos sintéticos y agregá las mensuales sobre EMICRON."
- L2: Earlier in the session the user chose EMICRON ("Sí, vamos con EMICRON. Verificá variables y licencia y proponé cómo integrarlo.") and authorized downloading the three ZIP files to `data/raw/emicron/`.
- L3: Downloaded files contain CSV (comma-separated, ASCII, quoted empty strings), DTA and SAV per module; 78,501 rows each. `GRUPOS12` (CIIU Rev. 4, 12 groups) and `COD_DEPTO` live in Identificación; `MES_REF` is the survey reference month name.
- L4: Real-data checks: every `COD_DEPTO` maps to a department name; `GASTOS_MES` excludes `P3017_I` (licenses) and `P3017_J` (taxes), and still differs from the line sum in 660 rows (0.8%, DANE edits) → DANE totals drive the summary, lines drive the breakdown. `P3056_E` holds other costs and is ingested as "Otros costos".
- L5: Tool results reaching the LLM are now wrapped as `{ ok, data }` / `{ ok, error }` for weekly tools too (S3); the tool data itself is unchanged. The EMICRON summary is built from the line items, so for the 0.8% of businesses where DANE totals differ from the lines the summary and `getMonthlyStatement` can disagree slightly. Known gap: when the loop hits 5 iterations without a final answer the dictamen falls back to defaults (pre-existing behavior, not changed here).
