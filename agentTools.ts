import { DynamicTool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { calcularRutaOptimaAStar } from "./aStar";

const URL_WEBHOOK_FORMULAS = "https://nataproyecto.app.n8n.cloud/webhook/consultar-formula-v2";
const URL_WEBHOOK_INVENTARIO = "https://nataproyecto.app.n8n.cloud/webhook/consultar-inventario-v2";

export const toolConsultarFormulas = new DynamicTool({
    name: "consultar_formulas_eps",
    description: `Úsala SIEMPRE como primer paso. Recibe una cédula (string). 
Consulta la tabla 'autorizaciones_eps' (JOIN con 'medicamentos') vía n8n. 
Devuelve un JSON con: id_autorizacion, codigo_mipres, cedula_paciente, 
nombre_comercial, principio_activo, presentacion, cantidad_autorizada, estado.
Si estado === 'Activa' la fórmula es válida y puedes continuar. 
Si estado es 'Reclamada', 'Vencida' o no existe, debes terminar la atención.`,
    func: async (cedula: string) => {
        try {
            console.log(`📡 Consultando fórmulas para cédula: ${cedula}`);
            const response = await fetch(URL_WEBHOOK_FORMULAS, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cedula: cedula }),
                signal: AbortSignal.timeout(30000),
            });

            console.log(`📨 Respuesta n8n: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                return `Error: El servidor n8n respondió con estado ${response.status}. Detalles: ${errorText}`;
            }

            const data = await response.json();
            console.log(`✅ Datos de fórmula recibidos:`, data);
            return JSON.stringify(data);
        } catch (error: any) {
            return `Error de conexión: ${error.message}. Verifica que n8n está activo en: ${URL_WEBHOOK_FORMULAS}`;
        }
    },
});

export const toolConsultarInventario = new DynamicTool({
    name: "consultar_inventario_sedes",
    description: `Úsala SOLO si confirmaste que la fórmula está 'Activa'. 
Recibe el nombre del medicamento o principio activo purificado (string) 
(ej: 'Acetaminofén' en vez de 'Dolex').
Consulta el JOIN entre 'inventario_sedes', 'sedes' y 'medicamentos' vía n8n.
Devuelve un ARRAY de objetos JSON, cada uno con: 
id_sede, nombre_sede, direccion, latitud, longitud, stock, 
nombre_comercial, presentacion.
Si el arreglo está vacío o todo el stock es 0, significa desabastecimiento.`,
    func: async (medicamento: string) => {
        try {
            console.log(`📡 Consultando inventario para: ${medicamento}`);
            const response = await fetch(URL_WEBHOOK_INVENTARIO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medicamento: medicamento }),
                signal: AbortSignal.timeout(30000),
            });

            console.log(`📨 Respuesta n8n: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                return `Error: El servidor n8n respondió con estado ${response.status}. Detalles: ${errorText}`;
            }

            const data = await response.json();
            console.log(`✅ Datos de inventario recibidos:`, data);
            return JSON.stringify(data);
        } catch (error: any) {
            return `Error de conexión: ${error.message}. Verifica que n8n está activo en: ${URL_WEBHOOK_INVENTARIO}`;
        }
    },
});

const schemaSedeConStock = z.object({
    nombre_sede: z.string().describe("Nombre de la sede EPS"),
    direccion: z.string().describe("Dirección física de la sede"),
    latitud: z.number().describe("Coordenada de latitud de la sede"),
    longitud: z.number().describe("Coordenada de longitud de la sede"),
    stock: z.number().describe("Cantidad de unidades disponibles del medicamento en esta sede"),
});

export const toolCalcularRutaOptima = new DynamicStructuredTool({
    name: "calcular_ruta_optima_a_star",
    description: `Úsala CUANDO TENGAS MÚLTIPLES SEDES CON STOCK > 0. Determina la sede más cercana al paciente usando el algoritmo A* con distancia euclidiana como heurística. Devuelve la sede óptima, su distancia en km, y todas las sedes ordenadas por cercanía.`,
    schema: z.object({
        ubicacionPaciente: z.string().describe("La dirección, barrio o referencia de ubicación del paciente (ej: 'Barrio Milán', 'Centro', 'Alta Suiza')"),
        sedesConStock: z.array(schemaSedeConStock).describe("Arreglo completo de sedes con stock, latitud y longitud que devolvió la herramienta consultar_inventario_sedes"),
    }),
    func: async (input: {
        ubicacionPaciente: string;
        sedesConStock: {
            nombre_sede: string;
            direccion: string;
            latitud: number;
            longitud: number;
            stock: number;
        }[];
    }) => {
        const { ubicacionPaciente, sedesConStock } = input;

        console.log(`📍 [NIVEL 3] Ejecutando A* para paciente en: "${ubicacionPaciente}"`);
        console.log(`🏪 Sedes recibidas para evaluación: ${sedesConStock.length}`);

        const resultado = calcularRutaOptimaAStar(ubicacionPaciente, sedesConStock);

        if (!resultado.sedeOptima) {
            console.log(`⚠️ [NIVEL 3] No se encontraron sedes con stock disponible para "${ubicacionPaciente}"`);
            return JSON.stringify({
                mensaje: `No se encontraron sedes con stock disponible cerca de "${ubicacionPaciente}".`,
                todasLasSedes: [],
            });
        }

        console.log(`✅ [NIVEL 3] Sede óptima seleccionada: ${resultado.sedeOptima.nombre_sede} (${resultado.distanciaKm} km)`);
        console.log(`📊 Ranking de sedes:`);
        resultado.todasLasSedes.forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.nombre_sede} — ${s.distanciaKm} km (stock: ${s.stock})`);
        });

        return JSON.stringify(resultado);
    },
});
