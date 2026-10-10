# 🚀 FinanIA — Tu Copiloto Financiero Inteligente

> **Agente Autónomo de Auditoría y Diagnóstico Financiero para PyMEs**  
> Desarrollado para el Reto de Agentes Autónomos con **Grok 4.7 (Tool Calling + ReAct)**.

---

## 📌 El Problema

El 80% de las Pequeñas y Medianas Empresas (PyMEs) fracasan antes de los primeros 5 años, siendo la **mala gestión del flujo de caja** y la **falta de diagnóstico financiero oportuno** la principal causa de quiebra.

Las PyMEs carecen de un director financiero (CFO) dedicado que audite constantemente las transacciones, alerte sobre márgenes de ganancia estrechos o detecte desbalances antes de que destruyan la liquidez del negocio.

---

## 💡 La Solución: FinanIA

**FinanIA** es un agente financiero autónomo construido sobre **Arquitectura Hexagonal (Clean Code)** que actúa como un **Auditor Financiero Estricto**:

1. **Lectura y Validación de Datos**: Importa transacciones reales en JSON ([`data/transactions.json`](data/transactions.json)) validadas con contratos de datos estrictamente tipados en **Zod**.
2. **Cómputo Determinístico en Código**: Realiza el 100% de las operaciones aritméticas (totales, márgenes, porcentajes y categorías críticas) en TypeScript puro ([`FinancialCalculator.ts`](src/domain/services/FinancialCalculator.ts)). Esto **elimina las alucinaciones matemáticas del LLM**.
3. **Agente Autónomo ReAct (Tool Calling)**: En lugar de un flujo estático, Grok 4.7 puede decidir de manera autónoma invocar herramientas especializadas (`getCategoryBreakdown`, `compareToPreviousPeriod`, `detectAnomalies`) mediante el estándar de Function Calling de OpenAI API (`https://api.reto.pltk.mx/v1`).
4. **Guardrails de Consistencia Métrica-Prioridad**: Enforza en prompt y post-procesamiento que la prioridad (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) y el tono del plan de acción coincidan estrictamente con el nivel de riesgo de caja y beneficio neto calculado.
5. **Telemetría Transparente**: Registra tiempo de respuesta (ms) y desglose de uso de tokens (`prompt_tokens`, `completion_tokens`, `total_tokens`), incluyendo el sobrecosto de tokens de razonamiento (`reasoning_tokens`) e iteraciones de herramientas.
6. **Exportación de Informes**: Genera automáticamente un reporte ejecutivo en formato Markdown (`reports/audit_report_latest.md`).

---

## 🏛️ Arquitectura del Sistema

El proyecto implementa **Arquitectura Hexagonal (Puertos y Adaptadores)** en TypeScript para garantizar independencia total de dependencias externas:

```text
src/
├── domain/                  # Lógica pura de negocio y entidades
│   ├── entities/Financial.ts # Esquemas Zod (Transaction, FinancialSummary, Recommendation, Telemetry)
│   └── services/FinancialCalculator.ts # Cómputo aritmético determinístico y Herramientas (Tool Calling)
├── ports/                   # Contratos de interfaces
│   ├── FinancialDataPort.ts # Puerto de repositorio de datos
│   └── LLMAgentPort.ts      # Puerto del modelo de lenguaje
├── adapters/                # Adaptadores concretos
│   ├── repository/JsonFileFinancialAdapter.ts # Persistencia en JSON
│   └── llm/GrokLLMAdapter.ts                 # Integración autónoma ReAct / Tool Calling con Grok 4.7
├── application/
│   └── AgentOrchestrator.ts # Orquestador del ciclo autónomo
├── infrastructure/
│   └── ReportExporter.ts    # Exportador de informes ejecutivos en Markdown
└── index.ts                 # Punto de entrada de la aplicación y CLI
```

---

## 🚀 Guía de Instalación y Ejecución End-to-End

### 1. Requisitos Previos
- Node.js v18 o superior
- npm

### 2. Clonar el Repositorio e Instalar Dependencias
```bash
git clone https://github.com/OscarSebastianRuedaRojas/FinanIA.git
cd FinanIA
npm install
```

### 3. Configurar Variables de Entorno
Copia la plantilla `.env.example` a un archivo `.env`:
```bash
cp .env.example .env
```

Edita el archivo `.env` e inserta tu API Key del reto:
```env
LLM_BASE_URL=https://api.reto.pltk.mx/v1
LLM_API_KEY=pk_tu_api_key_aqui
LLM_MODEL=grok-4.7
```

### 4. Ejecutar el Agente Autónomo (Dataset por Defecto — 16 Transacciones PyME)
```bash
npm run start
```

### 5. Pruebas de Escenarios Financieros Dinámicos (Datasets de Auditoría)
Podés auditar el comportamiento del agente autónomo en tiempo real sobre distintos contextos financieros reales:

- 🔴 **Caso 1: Quiebra Inminente** (Egresos muy superiores a ingresos):
  ```bash
  npm run start:quiebra
  ```
- 🟢 **Caso 2: Crecimiento Saludable** (Flujo positivo y margen neto elevado):
  ```bash
  npm run start:saludable
  ```
- 🟡 **Caso 3: Fuga Silenciosa / Gastos Hormiga** (Desangre por gastos no presupuestados):
  ```bash
  npm run start:hormiga
  ```

### 6. Ejecutar la Suite de Pruebas Unitarias e Integración
```bash
npm test
```

---

## 📊 Ejemplo de Salida del Agente (Tool Calling + Dictamen + Telemetría)

```text
==================================================
🚀 FINANIA — COPILOTO FINANCIERO (AUDITORÍA ESTRICTA)
==================================================

🌐 Conectando con LLM Real (Grok 4.7)...
🤖 [Agente Financiero] Iniciando ciclo autónomo de análisis...
📊 [Agente Financiero] Transacciones procesadas: 16
💰 [Ingresos: $52000 | Gastos: $25400 | Beneficio Neto: $26600]
🛠️ [Agente Autónomo Tool Calling] Invocando herramienta: getCategoryBreakdown...
🛠️ [Agente Autónomo Tool Calling] Invocando herramienta: detectAnomalies...
💡 [Agente Financiero] Diagnóstico y plan generado exitosamente.

--------------------------------------------------
📌 DICTAMEN DE AUDITORÍA FINANCIERA
--------------------------------------------------
Título: Dictamen de auditoría: posición de caja saludable y oportunidades de eficiencia
Prioridad: LOW
Diagnóstico: La PyME registra ingresos de $52,000 frente a gastos de $25,400, dejando un margen neto de 51.15%. Se detectó una adquisición anómala puntual de equipos ($7,800 en Hardware) que no compromete la liquidez corriente...

Acciones Recomendadas:
  1. Consolidar reservas de capital equivalente a 3 meses de operación fija ($35,000).
  2. Optimizar suscripciones recurrentes de software SaaS identificadas en el desglose de categorías.
  3. Planificar inversión estratégica en expansión de canales comerciales.

Impacto Estimado: Mantiene la liquidez operativa y maximiza la rentabilidad neta anualizada.

--------------------------------------------------
⏱️ TELEMETRÍA DE EJECUCIÓN (CON TOOL CALLING Y REASONING TOKENS)
--------------------------------------------------
Modelo: grok-4.7
Tiempo de respuesta: 11153 ms
Prompt Tokens: 1996
Completion Tokens: 524
Total Tokens: 3046 (Incluye 526 reasoning_tokens de Grok 4.7 / overhead del sistema)
--------------------------------------------------
```

> **Nota sobre uso de Tokens:** `total_tokens` (3,046) refleja la suma acumulada de `prompt_tokens` (1,996) + `completion_tokens` (524) más los tokens de pensamiento (`reasoning_tokens`) generados internamente por la arquitectura de razonamiento de Grok 4.7 durante el ciclo de invocación de herramientas.

---

## 🛡️ Seguridad y Buenas Prácticas

- Las claves de API están completamente aisladas en `.env` y excluidas del control de versiones a través de `.gitignore`.
- Validación estricta con **Zod** en entradas y salidas para evitar alucinaciones o respuestas malformadas.
- Enlaces de documentación estructurados con rutas relativas para compatibilidad 100% con GitHub.
