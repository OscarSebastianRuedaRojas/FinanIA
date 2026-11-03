# Reporte de costo por tarea — FinanIA

Generado: 2026-11-02T01:40:57.103Z
Bitácoras analizadas: `docs/bitacora/s2-ejecuciones.jsonl`, `docs/bitacora/s3-evaluacion.jsonl`

**44 ejecuciones · 317,271 tokens · costo total $0.759234 USD**

| Tarea | Ejecuciones | Sin error | Costo promedio | Mínimo | Máximo | Tokens promedio | Duración promedio |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Auditoría de un micronegocio real (EMICRON) | 35 | 100% | $0.015750 | $0.010986 | $0.022274 | 6,232 | 24.4 s |
| Objetivo en texto libre (varios negocios) | 4 | 100% | $0.041379 | $0.027608 | $0.051498 | 19,616 | 40.0 s |
| Lectura de una factura (Grok Vision) | 2 | 50% | $0.004884 | $0.002928 | $0.006840 | 1,973 | 5.0 s |
| Auditoría de un caso sintético (JSON) | 3 | 100% | $0.010905 | $0.008304 | $0.012588 | 5,578 | 12.5 s |

## Proyección para S4

Con el costo medido por tarea de tipo **Auditoría de un micronegocio real (EMICRON)**, 1,000 unidades costarían:

- **Esperado:** $15.75 USD (promedio × 1,000)
- **Peor caso:** $22.27 USD (máximo observado × 1,000)
- **Tiempo en secuencia:** 6.78 horas (dentro de una ventana de 12 horas si es menor a 12)

> "Sin error" cuenta las ejecuciones que terminaron sin excepción; algunos casos fallan a propósito (ej. una foto que no es factura) y su validación está en la bitácora de cada evaluación.

> El costo sale de `usage.cost_in_usd_ticks` de cada respuesta de la API (1 USD = 10^10 ticks), ya neto de caché. Una ejecución es una unidad de trabajo completa: todas sus llamadas al modelo y a herramientas.
