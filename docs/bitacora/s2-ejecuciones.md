# Bitácora S2 — 10 ejecuciones validadas de FinanIA

Generado: 2026-10-23T21:41:40.514Z

**10/10 ejecuciones validadas** · Tokens totales: 53,796 · Costo total: **$0.117354 USD**

| # | Caso | Fuente | Estado | Validación | Herramientas invocadas | Tokens | Costo |
| :--- | :--- | :--- | :--- | :--- | :--- | ---: | ---: |
| E01 | Quiebra inminente (sintético, herramientas semanales) | json | ✅ success | ✅ 4/4 | getWeeklyCashFlowAndAlerts, getMonthlyDiagnosticAndTrend, getCategoryBreakdown, compareToPreviousPeriod, detectAnomalies | 5,579 | $0.012588 |
| E02 | Crecimiento saludable (sintético, herramientas semanales) | json | ✅ success | ✅ 4/4 | getWeeklyCashFlowAndAlerts, getMonthlyDiagnosticAndTrend, getCategoryBreakdown, compareToPreviousPeriod, detectAnomalies | 5,658 | $0.011824 |
| E03 | Fuga silenciosa / gastos hormiga (sintético) | json | ✅ success | ✅ 4/4 | getWeeklyCashFlowAndAlerts, getMonthlyDiagnosticAndTrend, getCategoryBreakdown, compareToPreviousPeriod, detectAnomalies | 5,497 | $0.008304 |
| E04 | Micronegocio real en pérdida (transporte, Antioquia) | emicron | ✅ success | ✅ 6/6 | getMonthlyStatement, compareWithSectorPeers, getYearOverYearSales | 6,095 | $0.015678 |
| E05 | Micronegocio real en crecimiento (transporte, Antioquia) | emicron | ✅ success | ✅ 6/6 | getMonthlyStatement, compareWithSectorPeers, getYearOverYearSales | 6,003 | $0.014088 |
| E06 | Micronegocio real con caída interanual (servicios, La Guajira) | emicron | ✅ success | ✅ 5/5 | getMonthlyStatement, compareWithSectorPeers, getYearOverYearSales | 5,881 | $0.012698 |
| E07 | Micronegocio real con margen bajo (restaurante, Cauca) | emicron | ✅ success | ✅ 5/5 | getMonthlyStatement, compareWithSectorPeers, getYearOverYearSales | 6,221 | $0.020168 |
| E08 | Recuperación ante falla: sector sin pares en el departamento (minería, Huila) | emicron | ✅ success | ✅ 7/7 | getMonthlyStatement, compareWithSectorPeers ✗INSUFFICIENT_PEERS, getYearOverYearSales, compareWithSectorPeers | 8,917 | $0.012238 |
| E09 | Factura física fotografiada (Grok Vision) | invoice | ✅ success | ✅ 4/4 | — | 2,153 | $0.006840 |
| E10 | Manejo de error: la foto no es una factura (Grok Vision) | invoice | ⚠️ NOT_AN_INVOICE | ✅ 1/1 | — | 1,792 | $0.002928 |

> 10 ejecuciones. El costo sale de `usage.cost_in_usd_ticks` de la API (1 USD = 10^10 ticks). En los casos EMICRON no se guarda el texto del dictamen ni los datos que devuelven las herramientas, por la licencia del DANE.

## Detalle por ejecución

### E01 — Quiebra inminente (sintético, herramientas semanales)
- Run ID: `s2-20261023T2141-E01` · Fuente: `json` · Entrada: `data/casos/quiebra_inminente.json`
- Resultado: Prioridad CRITICAL · Dictamen de auditoría: crisis de liquidez y déficit operativo severo
- LLM: 2 llamadas · 5,037 tokens de entrada · 542 de salida (453 de razonamiento) · $0.012588
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja HIGH

### E02 — Crecimiento saludable (sintético, herramientas semanales)
- Run ID: `s2-20261023T2141-E02` · Fuente: `json` · Entrada: `data/casos/crecimiento_saludable.json`
- Resultado: Prioridad MEDIUM · Dictamen de auditoría: liquidez sólida y margen alto, con concentración en proveedores
- LLM: 2 llamadas · 5,087 tokens de entrada · 571 de salida (536 de razonamiento) · $0.011824
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja LOW

### E03 — Fuga silenciosa / gastos hormiga (sintético)
- Run ID: `s2-20261023T2141-E03` · Fuente: `json` · Entrada: `data/casos/fuga_silenciosa_servicios.json`
- Resultado: Prioridad HIGH · Dictamen de auditoría: riesgo de caja HIGH por erosión de margen vía Gastos Hormiga
- LLM: 2 llamadas · 4,995 tokens de entrada · 502 de salida (49 de razonamiento) · $0.008304
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja HIGH

### E04 — Micronegocio real en pérdida (transporte, Antioquia)
- Run ID: `s2-20261023T2141-E04` · Fuente: `emicron` · Entrada: `7627478-1-2`
- Resultado: Prioridad CRITICAL · riesgo de caja HIGH
- LLM: 2 llamadas · 5,367 tokens de entrada · 728 de salida (960 de razonamiento) · $0.015678
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja HIGH
- ✅ Usó herramientas mensuales sobre datos reales del DANE
- ✅ Prioridad HIGH o CRITICAL para un negocio en pérdida

### E05 — Micronegocio real en crecimiento (transporte, Antioquia)
- Run ID: `s2-20261023T2141-E05` · Fuente: `emicron` · Entrada: `7627474-1-1`
- Resultado: Prioridad MEDIUM · riesgo de caja LOW
- LLM: 2 llamadas · 5,358 tokens de entrada · 645 de salida (493 de razonamiento) · $0.014088
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja LOW
- ✅ Usó herramientas mensuales sobre datos reales del DANE
- ✅ Prioridad LOW o MEDIUM para un negocio rentable

### E06 — Micronegocio real con caída interanual (servicios, La Guajira)
- Run ID: `s2-20261023T2141-E06` · Fuente: `emicron` · Entrada: `7628486-1-1`
- Resultado: Prioridad MEDIUM · riesgo de caja LOW
- LLM: 2 llamadas · 5,248 tokens de entrada · 633 de salida (598 de razonamiento) · $0.012698
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja LOW
- ✅ Usó herramientas mensuales sobre datos reales del DANE

### E07 — Micronegocio real con margen bajo (restaurante, Cauca)
- Run ID: `s2-20261023T2141-E07` · Fuente: `emicron` · Entrada: `7628122-1-1`
- Resultado: Prioridad HIGH · riesgo de caja HIGH
- LLM: 2 llamadas · 5,359 tokens de entrada · 862 de salida (1,609 de razonamiento) · $0.020168
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja HIGH
- ✅ Usó herramientas mensuales sobre datos reales del DANE

### E08 — Recuperación ante falla: sector sin pares en el departamento (minería, Huila)
- Run ID: `s2-20261023T2141-E08` · Fuente: `emicron` · Entrada: `7638460-1-1`
- Resultado: Prioridad LOW · riesgo de caja LOW
- LLM: 3 llamadas · 8,129 tokens de entrada · 788 de salida (78 de razonamiento) · $0.012238
- ✅ Terminó sin error
- ✅ El agente decidió invocar al menos una herramienta
- ✅ Dictamen válido según FinancialRecommendationSchema
- ✅ Prioridad coherente con el riesgo de caja LOW
- ✅ Usó herramientas mensuales sobre datos reales del DANE
- ✅ La herramienta devolvió INSUFFICIENT_PEERS en el departamento
- ✅ El agente reintentó por su cuenta con scope national y obtuvo datos

### E09 — Factura física fotografiada (Grok Vision)
- Run ID: `s2-20261023T2141-E09` · Fuente: `invoice` · Entrada: `tests/fixtures/invoices/factura_sintetica.png`
- Resultado: FERRETERIA EL TORNILLO S.A.S. · 177310 COP · 2026-09-14
- LLM: 1 llamadas · 2,046 tokens de entrada · 107 de salida (639 de razonamiento) · $0.006840
- ✅ Proveedor FERRETERIA EL TORNILLO
- ✅ Total 177310 COP
- ✅ Fecha 2026-09-14
- ✅ Clasificada como EXPENSE

### E10 — Manejo de error: la foto no es una factura (Grok Vision)
- Run ID: `s2-20261023T2141-E10` · Fuente: `invoice` · Entrada: `tests/fixtures/invoices/no_factura.png`
- Error: `NOT_AN_INVOICE` — La imagen no es una factura ni un recibo: Ilustración simple de un paisaje: cielo azul, sol amarillo y campo verde, sin texto ni datos de factura
- LLM: 1 llamadas · 1,758 tokens de entrada · 34 de salida (156 de razonamiento) · $0.002928
- ✅ Falla controlada con NOT_AN_INVOICE (sin transacción inventada)
