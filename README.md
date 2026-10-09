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

1. **Lectura y Validación de Datos**: Importa transacciones reales en JSON ([`data/transactions.json`](file:///c:/Users/senit/OneDrive/Documentos/Platica/data/transactions.json)) validadas con contratos de datos estrictos en **Zod**.
2. **Cómputo Determinístico en Código**: Realiza el 100% de las operaciones aritméticas (totales, márgenes, porcentajes y categorías críticas) en TypeScript puro ([`FinancialCalculator.ts`](file:///c:/Users/senit/OneDrive/Documentos/Platica/src/domain/services/FinancialCalculator.ts)). Esto **elimina las alucinaciones matemáticas del LLM**.
3. **Razonamiento y Diagnóstico Autónomo con Grok 4.7**: Envía las métricas precalculadas al modelo **Grok 4.7** mediante la API OpenAI-compatible (`https://api.reto.pltk.mx/v1`). Grok emite un dictamen cualitativo y un plan de acción estratégico sin gastar tokens en cálculos numéricos.
4. **Telemetría de Ejecución**: Registra en tiempo real el tiempo de respuesta (latencia en ms) y el consumo total de tokens (`prompt_tokens`, `completion_tokens`, `total_tokens`).

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
└── index.ts                 # Punto de entrada de la aplicación
```

---

## 🚀 Guía de Instalación y Ejecución End-to-End

### 1. Requisitos Previos
- Node.js v18 o superior
- npm

### 2. Clonar el Repositorio e Instalar Dependencias
```bash
git clone <URL_DE_TU_REPOSITORIO>
cd Platica
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

### 4. Ejecutar el Agente Autónomo (End-to-End)
```bash
npm run start
```

### 5. Ejecutar la Suite de Pruebas Unitarias e Integración
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
💰 [Agente Financiero] Ingresos: $3300 | Gastos: $3350 | Beneficio Neto: $-50
💡 [Agente Financiero] Diagnóstico y plan generado exitosamente.

--------------------------------------------------
📌 DICTAMEN DE AUDITORÍA FINANCIERA
--------------------------------------------------
Título: Dictamen de auditoría: operación en déficit con quiebre de caja inminente
Prioridad: HIGH
Diagnóstico: La unidad opera en pérdida real: ingresos $3300 frente a egresos $3350...

Acciones Recomendadas:
  1. Contención inmediata de Proveedores: congelar nuevas compras a distribuidora de lácteos...
  2. Corte de caja en Servicios: auditar consumo eléctrico de refrigeradores...
  3. Bloqueo de egresos no esenciales: suspender mantenimiento correctivo no crítico...

Impacto Estimado: Cerrar la fuga de $-50 y recomponer al menos $170 de caja en el siguiente ciclo.

--------------------------------------------------
⏱️ TELEMETRÍA DE EJECUCIÓN (SEMANA 3 PREVIEW)
--------------------------------------------------
Modelo: grok-4.7
Tiempo de respuesta: 19630 ms
Prompt Tokens: 1991
Completion Tokens: 522
Total Tokens: 3212
--------------------------------------------------
```

---

## 🛡️ Seguridad y Buenas Prácticas

- Las claves de API están completamente aisladas en `.env` y excluidas del control de versiones a través de `.gitignore`.
- Validación estricta con **Zod** en entradas y salidas para evitar alucinaciones o respuestas malformadas.
