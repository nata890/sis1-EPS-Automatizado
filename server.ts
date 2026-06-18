import express, { Request, Response } from "express";
import cors from "cors";
import { inicializarAgente } from "./agent";
import { inicializarAgenteMock } from "./agentMock";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de logging GLOBAL - esto se ejecuta para TODAS las solicitudes
app.use((req: Request, res: Response, next: any) => {
    console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Middleware para que el servidor entienda formato JSON
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "OK", timestamp: new Date() });
});

// Variable global para guardar el agente una vez se inicialice
let agenteInstancia: any;
let usandoMock = false;

// Endpoint principal del Chat
app.post("/api/chat", async (req: Request, res: Response) => {
    try {
        const { cedula, correo, ubicacionPaciente, medicamentos, mensaje } = req.body;

        const mensajeConstruido = mensaje || `Hola, mi cédula es ${cedula}. Mi correo es ${correo}. Me encuentro en la ubicación: ${ubicacionPaciente}. Solicitud médica: ${medicamentos}`;

        console.log("📨 Solicitud recibida:", { cedula, correo, ubicacionPaciente, medicamentos });

        if (!mensajeConstruido) {
            res.status(400).json({ error: "Los datos del usuario son requeridos." });
            return;
        }

        //  el agente esté inicializado antes de llamarlo
        if (!agenteInstancia) {
            console.log("⏳ Inicializando agente...");
            agenteInstancia = await inicializarAgente();
            console.log("✅ Agente inicializado");
        }

        console.log(`🤖 Procesando mensaje: "${mensajeConstruido}"`);

        try {
            // LangGraph espera el estado en este formato
            const input = {
                messages: [
                    {
                        role: "user",
                        content: mensajeConstruido
                    }
                ]
            };

            console.log("📤 Enviando input al agente:", input);

            const resultado = await agenteInstancia.invoke(input);

            console.log("✅ Resultado del agente recibido");
            console.log("📊 Estructura del resultado:", Object.keys(resultado));

            // Intentar extraer la respuesta de diferentes formatos posibles
            let respuestaFinalIA = "";

            if (resultado.messages && Array.isArray(resultado.messages) && resultado.messages.length > 0) {
                const ultimoMensaje = resultado.messages[resultado.messages.length - 1];
                respuestaFinalIA = ultimoMensaje?.content || ultimoMensaje || "";
            } else if (resultado.output) {
                respuestaFinalIA = resultado.output;
            } else if (resultado.response) {
                respuestaFinalIA = resultado.response;
            } else if (typeof resultado === "string") {
                respuestaFinalIA = resultado;
            } else {
                respuestaFinalIA = JSON.stringify(resultado);
            }

            console.log("💬 Respuesta final a enviar:", respuestaFinalIA.substring(0, 100));

            // Le respondemos al frontend
            res.json({ respuesta_ia: respuestaFinalIA });

        } catch (invokeError: any) {
            console.error("❌ Error al invocar el agente:", invokeError.message);

            // Si es un error de cuota (429) de Groq, cambiar a mock
            if (invokeError.message && (invokeError.message.includes("429") || invokeError.message.includes("rate_limit"))) {
                console.warn("⚠️ Cuota de API Groq agotada, usando agente MOCK");
                usandoMock = true;
                agenteInstancia = await inicializarAgenteMock();

                // Reintentar con el mock
                const input = {
                    messages: [{
                        role: "user",
                        content: mensajeConstruido
                    }]
                };

                const resultadoMock = await agenteInstancia.invoke(input);
                let respuestaFinal = "";

                if (resultadoMock.messages && Array.isArray(resultadoMock.messages) && resultadoMock.messages.length > 0) {
                    respuestaFinal = resultadoMock.messages[resultadoMock.messages.length - 1]?.content || "";
                }

                res.json({
                    respuesta_ia: respuestaFinal,
                    modo: "🎭 MODO MOCK (cuota agotada)"
                });
                return;
            }

            throw invokeError;
        }

    } catch (error: any) {
        console.error("❌ Error en el endpoint /api/chat:", error.message);
        console.error("📋 Stack completo:", error.stack);
        res.status(500).json({
            error: "Hubo un error interno en el servidor de IA.",
            detalles: error.message
        });
    }
});

// Levantar el servidor
app.listen(PORT, async () => {
    console.log(`💻 Interfaz web disponible en: http://localhost:${PORT}`);
    console.log(`📡 API Chat disponible en: POST http://localhost:${PORT}/api/chat`);

    // Intentar inicializar el agente real
    try {
        agenteInstancia = await inicializarAgente();
        console.log("🧠 Agente de LangGraph cargado con éxito.");
    } catch (error: any) {
        if (error.message && (error.message.includes("429") || error.message.includes("rate_limit"))) {
            console.warn("⚠️  Cuota de API Groq agotada, usando agente MOCK");
            usandoMock = true;
            agenteInstancia = await inicializarAgenteMock();
            console.log("🎭 Agente MOCK activado (desarrollo)");
        } else {
            throw error;
        }
    }
});