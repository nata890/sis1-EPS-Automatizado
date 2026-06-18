# Sistema Inteligente de Disponibilidad y Enrutamiento de Medicamentos — Nivel 2 (LangChain + LangGraph)

Backend cognitivo transaccional que integra inteligencia artificial con orquestación de herramientas deterministas para validar fórmulas médicas, consultar inventario en sedes, geocodificar ubicaciones mediante OpenStreetMap y ejecutar enrutamiento algorítmico A*, optimizando el acceso de los pacientes a sus medicamentos.

El sistema opera bajo una arquitectura de agente único sin memoria persistente: cada invocación es un disparo independiente que recorre un grafo ReAct cíclico, donde el modelo de lenguaje gobierna la selección dinámica de herramientas mientras el flujo de decisión está rígidamente acotado por un system prompt de cinco pasos.

---

## Arquitectura Cognitiva y Componentes

### 1. Modelo de Lenguaje (LLM)

| Propiedad          | Valor               | Justificación Técnica                                                       |
|--------------------|---------------------|-----------------------------------------------------------------------------|
| Proveedor          | Google Gemini       | Sustituye a Groq tras superar rate limits (429) por alto volumen de tokens  |
| Modelo             | `gemini-2.5-flash`  | Balance óptimo entre latencia, costo y capacidad de razonamiento            |
| Temperatura        | `0.2`               | Minimiza la creatividad léxica; maximiza el determinismo y la repetibilidad |
| `maxRetries`       | `2`                 | Tolerancia a fallos transitorios de red sin exponer errores al cliente      |
| SDK                | `@langchain/google-genai` | Integración nativa con la interfaz `ChatModel` de LangChain          |

Instanciación real en `agent.ts:16–34`:

```typescript
const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0.2,
    apiKey: apiKey,
    maxRetries: 2,
});
```

### 2. Ingeniería de Prompts — System Prompt

El `systemPrompt` implementa una estrategia de **Chain-of-Thought (CoT) estructurada y determinista**: un algoritmo de cinco pasos codificado explícitamente que el modelo debe ejecutar secuencialmente sin omitir ninguno.

**Estructura del prompt (`agent.ts:38–130`):**

| Paso | Responsabilidad                                        | Herramienta involucrada            | Bifurcación condicional                          |
|------|--------------------------------------------------------|------------------------------------|--------------------------------------------------|
| 1    | Validación de fórmula médica vía cédula y correo       | `consultar_formulas_eps`           | Si no es `Activa` → termina la atención          |
| 2    | Consulta de inventario por medicamento                 | `consultar_inventario_sedes`       | Si stock total = 0 → `registrar_medicamento_pendiente` y termina |
| 3    | Geocodificación de ubicación del paciente              | `obtener_coordenadas_barrio`       | Fallback a coordenadas del centro de Manizales  |
| 4    | Enrutamiento inteligente con algoritmo A*              | `calcular_ruta_optima_a_star`      | Opera sobre el subconjunto filtrado de sedes    |
| 5    | Formateo de respuesta con restricciones léxicas        | — (solo generación de texto)       | Prohibición de tecnicismos y cierre en seco     |

**Regla de Oro — Cero Alucinaciones:** El prompt prohíbe explícitamente al modelo inventar nombres de sedes, direcciones, cantidades de inventario o coordenadas. Toda afirmación debe estar respaldada exclusivamente por los datos retornados por las herramientas.

**Prohibiciones léxicas en la respuesta:** Los términos `algoritmo`, `A*`, `A Star`, `LangChain`, `herramienta`, `tool`, `función`, `parámetro`, `JSON` y `API` están prohibidos en la salida hacia el paciente. Se emplean sustitutos como *sistema de enrutamiento*, *optimización de ubicación* o *análisis de cercanía*.

### 3. Catálogo de Custom Tools

Cinco herramientas personalizadas registradas en el arreglo `tools` (`agent.ts:36`), cada una encapsulada como `DynamicTool` o `DynamicStructuredTool` de LangChain:

| Tool (variable)                | `name` (semántico LLM)        | Propósito                                                                 | Conexión externa                          |
|--------------------------------|-------------------------------|---------------------------------------------------------------------------|-------------------------------------------|
| `toolConsultarFormulas`        | `consultar_formulas_eps`      | Valida la existencia y estado de una fórmula médica por cédula            | Webhook n8n → tabla `autorizaciones_eps`  |
| `toolConsultarInventario`      | `consultar_inventario_sedes`  | Consulta stock de un medicamento en todas las sedes                       | Webhook n8n → inventario por sede         |
| `toolCalcularRutaOptima`       | `calcular_ruta_optima_a_star` | Ejecuta A* con distancia euclidiana para hallar la sede más cercana       | Módulo local `aStar.ts` (sin fetch)       |
| `toolObtenerCoordenadasBarrio` | `obtener_coordenadas_barrio`  | Geocodifica texto de ubicación a coordenadas (lat, lng) vía Nominatim/OSM | API pública OpenStreetMap (Nominatim)     |
| `toolRegistrarMedicamentoPendiente` | `registrar_medicamento_pendiente` | Inserta un registro de desabastecimiento en la tabla de pendientes   | Webhook n8n → tabla `pendientes_eps`      |

Las herramientas estructuradas (`DynamicStructuredTool`) utilizan esquemas **Zod** para validar que el LLM genere los parámetros con el tipo correcto antes de cada invocación, eliminando errores de serialización en tiempo de ejecución.

### 4. Arquitectura del Agente

```typescript
export const inicializarAgente = async (): Promise<any> => {
    const modeloInicializado = obtenerModelo();
    const agent = createAgent({
        model: modeloInicializado,
        tools: tools,
        systemPrompt: systemPrompt,
    });
    return agent;
};
```

La función `createAgent` del paquete `langchain` (API moderna que reemplaza al deprecado `createReactAgent` de `@langchain/langgraph/prebuilt`) compila internamente un **grafo cíclico de estados** sobre la infraestructura de LangGraph, gobernado por el bucle cognitivo **ReAct (Reason → Act → Observe → Repeat)**:

1. **Nodo Agent:** Ejecuta el LLM. Si la salida contiene una *tool call*, el grafo transiciona al nodo Tools. Si no, el estado se marca como terminal y se retorna la respuesta.
2. **Nodo Tools:** Resuelve cada *tool call* invocando la función asociada y retorna la observación al grafo, que vuelve al nodo Agent para la siguiente iteración.
3. **Ciclo:** Se repite hasta que el LLM produce una respuesta final sin *tool calls* pendientes, momento en el cual el grafo alcanza un estado terminal y `invoke()` resuelve la promesa.

No se emplea `checkpointer` ni memoria persistente: el agente es **transaccional** (cada invocación es atómica e independiente), lo que elimina la necesidad de gestionar sesiones o buffers de historial entre requests.

---

## Cadena de Pensamiento, Logs y Justificación de RAG

### Estrategia CoT — Bifurcaciones Condicionales

El system prompt fuerza al modelo a recorrer los cinco pasos secuencialmente, pero introduce dos bifurcaciones condicionales que alteran la trayectoria del grafo:

1. **Paso 1 → Terminación temprana:** Si la fórmula no está activa (`estado !== 'Activa'`), el modelo debe explicar la razón y detenerse. No se consulta inventario ni se ejecuta enrutamiento.
2. **Paso 2 → Bifurcación crítica:**
   - **Ruta A (stock > 0 en al menos una sede):** Se filtran las sedes con existencias, se geocodifica la ubicación (paso 3), se ejecuta A* (paso 4) y se formatea la respuesta con la sede óptima y su distancia (paso 5).
   - **Ruta B (stock = 0 en todas las sedes):** Se invoca `registrar_medicamento_pendiente` con cedula, correo y medicamento; se informa al paciente del desabastecimiento total y se termina sin pasar por geocodificación ni enrutamiento.

Además, el prompt incluye una **regla de corrección semántica** en el paso 2: si el paciente menciona un nombre comercial (p. ej., *Dolex*, *Geniol*), el modelo debe traducirlo a su principio activo (*Acetaminofén*, *Paracetamol*) antes de invocar la herramienta de inventario, y reintentar si la primera llamada devuelve vacío.

### Estrategia de Persistencia, Memoria y Justificación de RAG

| Concepto | Implementación en el Sistema | Justificación Arquitectónica |
| :--- | :--- | :--- |
| **¿Aplica RAG Tradicional?** | ❌ **No Aplica** (No usa Vector Stores ni Embeddings) | Los datos de una EPS (fórmulas médicas, stock físico) son altamente volátiles y requieren precisión numérica exacta. Los modelos de embeddings tradicionales y las bases de datos vectoriales operan por *similitud semántica*, lo que introduce un riesgo inaceptable de "falsos positivos" (por ejemplo, confundir stock 0 con stock 1 debido a distancias vectoriales cercanas). |
| **¿Estrategia de Retrieval?** | 🚀 **Sí, Retrieval Estructurado Dinámico (Function-Calling)** | Aunque no se procesan archivos no estructurados (PDF/TXT), el sistema implementa un paradigma de **Generación Aumentada por Recuperación basada en Funciones**. El agente no responde desde su conocimiento estático; evalúa el contexto e invoca *Custom Tools* conectadas a webhooks transaccionales de n8n para recuperar información viva al segundo directamente de tablas relacionales en **PostgreSQL** (`autorizaciones_eps`, `inventario_sedes`). |
| **¿Memoria Persistente?** | ❌ **No Aplica** (Invocaciones Atómicas) | Cada ciclo de chat a través del endpoint `/api/chat` es una transacción independiente y limpia. No se requiere persistencia de estados ni checkpoints históricos entre peticiones, lo que optimiza la latencia del backend, simplifica el escalamiento horizontal del servidor Express y garantiza que el flujo ReAct evalúe las reglas de negocio desde cero en cada interacción. |

---

## Comparativa Técnica: n8n (Nivel 1) vs. LangChain + LangGraph (Nivel 2)

| Dimensión                  | n8n (Nivel 1)                                          | LangChain + LangGraph (Nivel 2)                              |
|----------------------------|--------------------------------------------------------|--------------------------------------------------------------|
| **Orquestación**           | Grafos lineales o bifurcaciones rígidas predefinidas en nodos visuales. El flujo es inmutable tras el diseño. | Orquestación fluida y autónoma: el LLM decide dinámicamente qué herramienta invocar basándose en el contexto léxico de cada turno. |
| **Flexibilidad cognitiva** | Nula. Cada camino debe cablearse explícitamente.       | Alta. El modelo puede autocorregirse semánticamente (ej. *Dolex* → *Acetaminofén*) antes de llamar a la herramienta. |
| **Manejo de errores**      | Reglas de fallo cableadas nodo a nodo; sin capacidad de reintento inteligente. | `maxRetries: 2` en el LLM; además, el modelo puede reinterpretar entradas ambiguas y reintentar llamadas con parámetros corregidos. |
| **Mantenibilidad del código** | Excelente para integraciones rápidas (UI visual); difícil de versionar y probar automáticamente. | Modularización limpia en TypeScript, control de versiones preciso con Git, tipado estricto con TypeScript 6.0 y esquemas Zod. |
| **Tipo de datos**          | Esquemas flexibles definidos en la UI de n8n.          | Contratos formales mediante interfaces TypeScript y schemas Zod. |
| **Separación de capas**    | La lógica de negocio se mezcla con la configuración de integración. | Capa de IA (modelo + prompt) ↔ Capa de herramientas (fetch) ↔ Capa de datos (n8n → PostgreSQL). Desacoplamiento total. |
| **Curva de aprendizaje**   | Baja. Adecuado para prototipado visual.                | Media-alta. Requiere comprensión de grafos de estados, ciclo ReAct y patrones de agentes. |
| **Caso de uso ideal**      | Automatización de procesos ETL, sincronización de APIs, notificaciones. | Sistemas que requieren razonamiento contextual, toma de decisiones condicional y orquestación autónoma de herramientas. |

### Sinergia entre niveles

n8n actúa como **middleware de datos** (puente entre el agente y PostgreSQL), mientras que LangChain + LangGraph proporcionan la **capa de razonamiento**. No son excluyentes: el Nivel 2 consume los webhooks expuestos por el Nivel 1, creando una arquitectura en dos capas donde cada una resuelve el problema en su abstracción óptima.

---

## Guía de Instalación y Ejecución

### Requisitos previos

- **Node.js** >= 18 (ejecución TypeScript vía `ts-node`)
- **npm** >= 9
- Archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
GEMINI_API_KEY=tu_api_key_de_google_gemini
PORT=3000
```

### Instalación de dependencias

```bash
npm install
```

### Ejecución del servidor de desarrollo

```bash
npx ts-node server.ts
```

El servidor se levanta en `http://localhost:3000`. La interfaz web estática (formulario de consulta) se sirve automáticamente desde la raíz.

Endpoints disponibles:

| Método | Ruta          | Descripción                                              |
|--------|---------------|----------------------------------------------------------|
| GET    | `/`           | Sirve el frontend estático (`index.html`)                |
| GET    | `/health`     | Health check del servidor                                |
| POST   | `/api/chat`   | Endpoint principal de invocación del agente LangChain    |

### Scripts de prueba

```bash
# Prueba de conectividad con los webhooks de n8n
npx ts-node testN8n.ts
```

### Compilación TypeScript

```bash
npm run build
# Genera los artefactos compilados en ./dist
```

---

## Dependencias principales

| Paquete                        | Versión   | Propósito                                              |
|--------------------------------|-----------|--------------------------------------------------------|
| `@langchain/google-genai`      | ^2.1.31   | Integración con Google Gemini (SDK oficial LangChain)  |
| `@langchain/core`              | ^1.1.48   | Interfaces base: DynamicTool, BaseMessage, ChatModel   |
| `langchain`                    | ^1.4.4    | `createAgent`: compilación del grafo ReAct sobre LangGraph |
| `@langchain/langgraph`         | ^1.3.7    | Infraestructura de grafos de estados (runtime subyacente) |
| `zod`                          | ^4.4.3    | Schemas de validación para herramientas estructuradas  |
| `express`                      | ^5.2.1    | Servidor HTTP con middleware para API REST y estáticos |
| `dotenv`                       | ^17.4.2   | Carga de variables de entorno desde `.env`             |
| `typescript`                   | ^6.0.3    | Tipado estático y compilación                          |

---

## Licencia

ISC
