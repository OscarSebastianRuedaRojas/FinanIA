# 🚀 FinanIA — Tu Copiloto Financiero Inteligente

> **Agente Autónomo de Auditoría y Diagnóstico Financiero para PyMEs**  
> Desarrollado para el Reto de Agentes Autónomos con **Grok 4.7**.

---

## 📌 El Problema

El 80% de las Pequeñas y Medianas Empresas (PyMEs) fracasan antes de los primeros 5 años, siendo la **mala gestión del flujo de caja** y la **falta de diagnóstico financiero oportuno** la principal causa de quiebra.

Las PyMEs carecen de un director financiero (CFO) dedicado que audite constantemente las transacciones, alerte sobre márgenes de ganancia estrechos o detecte desbalances antes de que destruyan la liquidez del negocio.

---

## 💡 La Solución: FinanIA

**FinanIA** es un agente financiero autónomo construido sobre **Arquitectura Hexagonal (Clean Code)** que actúa como un **Auditor Financiero Estricto**:

1. **Lectura y Validación de Datos**: Importa transacciones reales en JSON ([`data/transactions.json`](file:///c:/Users/senit/OneDrive/Documentos/Platica/data/transactions.json)) validadas con contratos de datos strictly tipados en **Zod**.
2. **Cómputo Determinístico en Código**: Realiza el 100% de las operaciones aritméticas (totales, márgenes, porcentajes y categorías críticas) en TypeScript puro ([`FinancialCalculator.ts`](file:///c:/Users/senit/OneDrive/Documentos/Platica/src/domain/services/FinancialCalculator.ts)). Esto **elimina las alucinaciones matemáticas del LLM**.
3. **Razonamiento y Diagnóstico Autónomo con Grok 4.7**: Envía las métricas precalculadas al modelo **Grok 4.7** mediante la API OpenAI-compatible (`https://api.reto.pltk.mx/v1`). Grok emite un dictamen cualitativo y un plan de acción estratégico sin gastar tokens en cálculos numéricos.
4. **Telemetría de Ejecución**: Registra en tiempo real el tiempo de respuesta (latencia en ms) y el consumo total de tokens (`prompt_tokens`, `completion_tokens`, `total_tokens`).
5. **Exportación de Informes**: Genera automáticamente un reporte ejecutivo en formato Markdown (`reports/audit_report_latest.md`).

---

## 🏛️ Arquitectura del Sistema

El proyecto implementa **Arquitectura Hexagonal (Puertos y Adaptadores)** en TypeScript para garantizar independencia total de dependencias externas:

```text
src/
├── domain/                  # Lógica pura de negocio y entidades
│   ├── entities/Financial.ts # Esquemas Zod (Transaction, FinancialSummary, Recommendation, Telemetry)
│   └── services/FinancialCalculator.ts # Cómputo aritmético determinístico
├── ports/                   # Contratos de interfaces
│   ├── FinancialDataPort.ts # Puerto de repositorio de datos
│   └── LLMAgentPort.ts      # Puerto del modelo de lenguaje
├── adapters/                # Adaptadores concretos
│   ├── repository/JsonFileFinancialAdapter.ts # Persistencia en JSON
│   └── llm/GrokLLMAdapter.ts                 # Integración End-to-End con Grok 4.7
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

### 4. Ejecutar el Agente Autónomo (Dataset por Defecto)
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
npm run test
```

---

## 📊 Ejemplo de Salida del Agente (Dictamen + Telemetría)

```text
==================================================
🚀 FINANIA — COPILOTO FINANCIERO (AUDITORÍA STRICTA)
==================================================

🌐 Conectando con LLM Real (Grok 4.7)...
🤖 [Agente Financiero] Iniciando ciclo autónomo de análisis...
📊 [Agente Financiero] Transacciones procesadas: 5
💰 [Ingresos: $14700 | Gastos: $5300 | Beneficio Neto: $9400]
💡 [Agente Financiero] Diagnóstico y plan generado exitosamente.

--------------------------------------------------
📌 DICTAMEN DE AUDITORÍA FINANCIERA
--------------------------------------------------
Título: Dictamen de auditoría: posición de caja sólida con margen neto elevado...
Prioridad: LOW
Diagnóstico: Ingresos $14,700 frente a egresos $5,300 dejan beneficio neto de $9,400...

Acciones Recomendadas:
  1. Congelar de inmediato gastos no comprometidos...
  2. Renegociar compra de inventario...
  3. Separar cobro de ventas en cuenta de operación...

Impacto Estimado: Preserva $9,400 de beneficio en el periodo auditado.

--------------------------------------------------
⏱️ TELEMETRÍA DE EJECUCIÓN (SEMANA 3 PREVIEW)
--------------------------------------------------
Modelo: grok-4.7
Tiempo de respuesta: 20365 ms
Prompt Tokens: 1996
Completion Tokens: 524
Total Tokens: 3046
--------------------------------------------------
```

---

## 🛡️ Seguridad y Buenas Prácticas

- Las claves de API están completamente aisladas en `.env` y excluidas del control de versiones a través de `.gitignore`.
- Validación estricta con **Zod** en entradas y salidas para evitar alucinaciones o respuestas malformadas.
