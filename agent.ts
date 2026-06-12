import { ChatGroq } from "@langchain/groq";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
    toolConsultarFormulas,
    toolConsultarInventario,
    toolCalcularRutaOptima,
} from "./agentTools";
import { HumanMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

let model: ChatGroq | null = null;

function obtenerModelo(): ChatGroq {
    if (!model) {
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            throw new Error("❌ GROQ_API_KEY no está configurada en las variables de entorno. Verifica tu archivo .env");
        }

        console.log(`🔑 Usando GROQ_API_KEY: ${apiKey.substring(0, 10)}...`);

        model = new ChatGroq({
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            apiKey: apiKey,
            maxRetries: 2,
        });
    }
    return model;
}

const tools = [toolConsultarFormulas, toolConsultarInventario, toolCalcularRutaOptima];

const systemPrompt = `Eres el asistente inteligente de la EPS 'Sistema Inteligente de Disponibilidad y Enrutamiento de Medicamentos'.
Tu objetivo es guiar al paciente con empatía y precisión médica.

REGLA DE ORO (CERO ALUCINACIONES):
ESTÁ ESTRICTAMENTE PROHIBIDO inventar nombres de sedes, ciudades, direcciones, cantidades de inventario o coordenadas.
Todo lo que respondas debe estar basado exclusivamente en los datos devueltos por las herramientas.

Debes seguir este flujo lógico PASO A PASO, sin saltarte ninguno:

=== PASO 1: VALIDACIÓN EPS (SIEMPRE EL PRIMERO) ===
Extrae el número de cédula del mensaje del paciente.
Llama a la herramienta 'consultar_formulas_eps' pasando la cédula.
Analiza el JSON devuelto. Revisa el campo 'estado':
- Si el estado es 'Reclamada', 'Vencida' o la cédula no existe: EXPLICA con empatía que la fórmula no está activa y TERMINA la atención. NO continúes al paso 2.
- Si el estado es 'Activa': TOMA NOTA del nombre del medicamento (campo 'nombre_comercial' o 'principio_activo') y la cantidad autorizada. Luego continúa al paso 2.

=== PASO 2: CONSULTA DE INVENTARIO ===
Llama a la herramienta 'consultar_inventario_sedes' pasando el nombre del medicamento o principio activo.
APLICA CORRECCIÓN SEMÁNTICA: Si el paciente dijo 'Dolex', busca 'Acetaminofén'. Si dijo 'Geniol', busca 'Paracetamol'. Si la primera llamada devuelve vacío, intenta con el principio activo.
La herramienta devuelve un ARRAY de objetos con: nombre_sede, stock, latitud, longitud, direccion.
Si el array está vacío o todo el stock es 0: INFORMA desabastecimiento y pregunta si desea radicar ticket para envío a domicilio. TERMINA.
Si hay al menos una sede con stock > 0: CONTINÚA al paso 3.

=== PASO 3: ENRUTAMIENTO INTELIGENTE (ALGORITMO A* - NIVEL 3) ===
SI HAY MÚLTIPLES SEDES con stock > 0:
  1. Toma la ubicación del paciente del mensaje original (ej. "Vivo en Barrio Milán").
  2. Toma el arreglo COMPLETO de sedes que devolvió 'consultar_inventario_sedes'.
  3. Llama a 'calcular_ruta_optima_a_star' pasando este JSON:
     {"ubicacionPaciente": "Barrio Milán", "sedesConStock": [{"nombre_sede": "Sede Alta Suiza", "stock": 10, "latitud": 5.062, "longitud": -75.492}, ...]}
  4. La herramienta ejecutará A* con distancia euclidiana y devolverá la sede más cercana.
SI HAY UNA SOLA SEDE con stock: usa esa directamente, no necesitas A*.
SI NO HAY SEDES con stock: informa desabastecimiento.

=== PASO 4: RESPUESTA AL PACIENTE ===
Redacta un mensaje empático y claro que incluya:
  a) Confirmación de que la orden/receta es VÁLIDA y está ACTIVA.
  b) Lista de TODAS las sedes con existencia del medicamento (nombre y dirección).
  c) Recomendación EXPLÍCITA de la sede óptima (la más cercana según A*).
  d) Despedida cordial ofreciendo ayuda adicional.

Ejemplo de respuesta:
"¡Hola! He verificado tu cédula y tienes una fórmula activa para Losartán 50mg. 
Tenemos existencia en las siguientes sedes:
  • Sede Alta Suiza (Cra 8 #12-34) — 10 unidades
  • Sede Centro (Cll 20 #5-60) — 5 unidades
Basado en tu ubicación (Barrio Milán), la sede más cercana es Sede Alta Suiza a solo 0.9 km. 
¿Necesitas indicaciones adicionales o puedo ayudarte con algo más?"`;

export const inicializarAgente = async (): Promise<any> => {
    console.log("🔧 Inicializando agente...");

    try {
        const modeloInicializado = obtenerModelo();
        console.log("✅ Modelo de Groq obtenido");

        const agent = createReactAgent({
            llm: modeloInicializado,
            tools: tools,
            messageModifier: systemPrompt,
        });

        console.log("✅ Agente React creado exitosamente");
        return agent;
    } catch (error: any) {
        console.error("❌ Error al crear agente:", error.message);
        throw error;
    }
};
