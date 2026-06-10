import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { toolConsultarFormulas, toolConsultarInventario } from "./agentTools";
import { HumanMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

// Variable para almacenar el modelo (lazy initialization)
let model: ChatGoogleGenerativeAI | null = null;

// Función para obtener o crear el modelo
function obtenerModelo(): ChatGoogleGenerativeAI {
    if (!model) {
        const apiKey = process.env.GOOGLE_API_KEY;
        
        if (!apiKey) {
            throw new Error("❌ GOOGLE_API_KEY no está configurada en las variables de entorno. Verifica tu archivo .env");
        }
        
        console.log(`🔑 Usando GOOGLE_API_KEY: ${apiKey.substring(0, 10)}...`);
        
        model = new ChatGoogleGenerativeAI({
            model: "gemini-2.0-flash", // Tiene un límite gratuito de 15 RPM (suficiente para probar)
            temperature: 0.2,
            apiKey: apiKey,  // Pasando la API key explícitamente
            maxRetries: 0
        });
    }
    return model;
}

// 2. Agrupar las herramientas de n8n
const tools = [toolConsultarFormulas, toolConsultarInventario];

// 3. Prompt de Sistema del Nivel 2
const systemPrompt = `Eres el asistente inteligente de la EPS 'Sistema Inteligente de Disponibilidad y Enrutamiento de Medicamentos'.
Tu objetivo es guiar al paciente con empatía y precisión médica.

REGLA DE ORO (CERO ALUCINACIONES): 
ESTÁ ESTRICTAMENTE PROHIBIDO inventar nombres de sedes, ciudades, direcciones o cantidades de inventario. Tu conocimiento del mundo real está apagado. Solo puedes mencionar las sedes y datos que textualmente te devuelvan tus herramientas.

Ejecuta este flujo lógico paso a paso:
1. VALIDACIÓN EPS: Usa la herramienta 'consultar_formulas_eps' extrayendo la cédula del mensaje.
   - Si la herramienta indica que la fórmula no existe, está 'Reclamada' o 'Vencida', explica la situación con empatía y TERMINA la atención.
   - Si está 'Activa', procede al paso 2.

2. CONSULTA DE INVENTARIO: Usa la herramienta 'consultar_inventario_sedes' con el medicamento solicitado.
   - Aplica CORRECCIÓN SEMÁNTICA si la herramienta falla la primera vez (ej. si piden 'Dolex', intenta buscar 'Acetaminofén').

3. ENRUTAMIENTO INTELIGENTE: 
   - Lee detalladamente el JSON que te devolvió la herramienta de inventario.
   - Analiza la ubicación actual del paciente y compárala con las direcciones de las sedes devueltas.
   - Indícale al paciente a qué sede específica debe dirigirse, dándole la dirección exacta y confirmando que hay stock disponible.

4. MANEJO DE EXCEPCIONES: 
   - Si la herramienta de inventario devuelve un arreglo vacío o stock 0 en todas partes, NO inventes una sede alterna. Discúlpate e indica: 'En este momento hay desabastecimiento en nuestras sedes. ¿Deseas que radique un ticket para envío a domicilio cuando llegue el inventario?'.`;
// 4. Crear el agente con LangGraph
export const inicializarAgente = async (): Promise<any> => {
    console.log("🔧 Inicializando agente...");
    
    try {
        const modeloInicializado = obtenerModelo();
        console.log("✅ Modelo de Gemini obtenido");
        
        // createReactAgent en LangGraph
        const agent = createReactAgent({
            llm: modeloInicializado,
            tools: tools,
            messageModifier: systemPrompt
        });

        console.log("✅ Agente React creado exitosamente");
        return agent;
    } catch (error: any) {
        console.error("❌ Error al crear agente:", error.message);
        throw error;
    }
};