# Tasks: Invoice and receipt mapping with Grok Vision

Implements [spec.md](spec.md) following [design.md](design.md). Test runner: `npx vitest run`. Each task is test-first: the scenario tests are written and seen failing before the code.

| ID | Scenarios | Status | Evidence |
| --- | --- | --- | --- |
| V1 | S2.1, S3.1 — schema + mapper | done | RED: module missing; GREEN 11/11 (bf61d01) |
| V2 | S1.1–S1.4 — image reader | done | RED: module missing; GREEN 6/6 (bf61d01) |
| V3 | S2.1–S2.4, S4.1–S4.2 — vision adapter + shared backoff | done | RED: module missing; GREEN 8/8; full suite green after backoff extraction |
| V4 | S5.1–S5.4 — use case + CLI + README | pending | — |
| V5 | Live check against the challenge endpoint with the synthetic invoice | pending | — |

## Log

- L1 (2026-10-23, user): "realizame esta funcionalidad: **Mapeo Multimodal de Facturas y Recibos (Grok Vision)** usando SDD"
- L2: Vision probe succeeded on `grok-4.7` (see spec, Feasibility evidence).
