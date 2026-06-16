import { DynamicTool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { calcularRutaOptimaAStar } from "./aStar";

const URL_WEBHOOK_FORMULAS = "https://sofiajaramillo1.app.n8n.cloud/webhook/consultar-formula";
const URL_WEBHOOK_INVENTARIO = "https://sofiajaramillo1.app.n8n.cloud/webhook/consultar-inventario";

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
    description: `Úsala CUANDO TENGAS MÚLTIPLES SEDES CON STOCK > 0. Recibe las coordenadas numéricas (latitud, longitud) del paciente y el arreglo de sedes con stock. Determina la sede más cercana usando el algoritmo A* con distancia euclidiana como heurística. Devuelve la sede óptima, su distancia en km, y todas las sedes ordenadas por cercanía. IMPORTANTE: NO recibes texto de ubicación aquí; primero debes llamar a 'obtener_coordenadas_barrio' para traducir la ubicación del paciente a coordenadas numéricas.`,
    schema: z.object({
        latitudPaciente: z.number().describe("Latitud numérica del paciente (obtenida previamente con 'obtener_coordenadas_barrio')"),
        longitudPaciente: z.number().describe("Longitud numérica del paciente (obtenida previamente con 'obtener_coordenadas_barrio')"),
        sedesConStock: z.array(schemaSedeConStock).describe("Arreglo completo de sedes con stock, latitud y longitud que devolvió la herramienta consultar_inventario_sedes"),
    }),
    func: async (input: {
        latitudPaciente: number;
        longitudPaciente: number;
        sedesConStock: {
            nombre_sede: string;
            direccion: string;
            latitud: number;
            longitud: number;
            stock: number;
        }[];
    }) => {
        const { latitudPaciente, longitudPaciente, sedesConStock } = input;

        console.log(`📍 [NIVEL 3] Ejecutando A* para coordenadas: (${latitudPaciente}, ${longitudPaciente})`);
        console.log(`🏪 Sedes recibidas para evaluación: ${sedesConStock.length}`);

        const resultado = calcularRutaOptimaAStar(latitudPaciente, longitudPaciente, sedesConStock);

        if (!resultado.sedeOptima) {
            console.log(`⚠️ [NIVEL 3] No se encontraron sedes con stock disponible para las coordenadas (${latitudPaciente}, ${longitudPaciente})`);
            return JSON.stringify({
                mensaje: `No se encontraron sedes con stock disponible cerca de las coordenadas proporcionadas.`,
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

export const toolObtenerCoordenadasBarrio = new DynamicTool({
    name: "obtener_coordenadas_barrio",
    description: `Úsala SIEMPRE antes de llamar a 'calcular_ruta_optima_a_star' cuando el usuario mencione su ubicación en texto plano (ej: "Barrio Chipre", "Vivo en Milán", "Estación", "Centro"). Recibe el texto del barrio o ubicación y consulta la API de OpenStreetMap (Nominatim) para convertirla en coordenadas numéricas (latitud, longitud). Si no encuentra el lugar, retorna las coordenadas por defecto del Centro de Manizales (5.0674, -75.5064) para que el algoritmo A* nunca falle.`,
    func: async (ubicacionTexto: string) => {
        try {
            console.log(`🌍 Geocodificando ubicación: "${ubicacionTexto}"`);
            const textoLimpio = ubicacionTexto.replace(/\bbarrio\b\s*/i, "").trim();
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(textoLimpio + ", Manizales, Colombia")}&format=json&limit=1`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "EPS-SistemaDisponibilidad/1.0 (contacto@epssanitas.com)",
                },
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json() as { lat: string; lon: string }[];

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                console.log(`✅ Coordenadas encontradas: (${lat}, ${lon}) para "${ubicacionTexto}"`);
                return JSON.stringify({ latitud: lat, longitud: lon });
            }

            console.warn(`⚠️ Ubicación "${ubicacionTexto}" no encontrada en Nominatim, usando coordenadas por defecto (Centro de Manizales)`);
            return JSON.stringify({ latitud: 5.0674, longitud: -75.5064 });
        } catch (error: any) {
            console.error(`❌ Error en geocodificación: ${error.message}`);
            return JSON.stringify({ latitud: 5.0674, longitud: -75.5064 });
        }
    },
});

const URL_WEBHOOK_PENDIENTES = "https://sofiajaramillo1.app.n8n.cloud/webhook/registrar-pendiente";

export const toolRegistrarMedicamentoPendiente = new DynamicStructuredTool({
    name: "registrar_medicamento_pendiente",
    description: `Úsala SOLO cuando NO haya stock disponible en NINGUNA sede para el medicamento solicitado. Recibe cédula del paciente, su correo electrónico y el nombre del medicamento. Inserta un registro en la tabla 'pendientes_eps' con estado 'Pendiente' para notificar al paciente cuando haya disponibilidad.`,
    schema: z.object({
        cedula: z.string().describe("Número de cédula del paciente"),
        correo: z.string().describe("Correo electrónico del paciente para notificación"),
        medicamento: z.string().describe("Nombre del medicamento agotado (nombre_comercial o principio_activo)"),
    }),
    func: async (input: {
        cedula: string;
        correo: string;
        medicamento: string;
    }) => {
        const { cedula, correo, medicamento } = input;

        console.log(`📝 Registrando medicamento pendiente - Cédula: ${cedula}, Medicamento: ${medicamento}, Correo: ${correo}`);

        try {
            const response = await fetch(URL_WEBHOOK_PENDIENTES, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cedula: cedula,
                    correo: correo,
                    medicamento: medicamento,
                    estado: "Pendiente",
                }),
                signal: AbortSignal.timeout(30000),
            });

            console.log(`📨 Respuesta n8n pendientes: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                return `Error al registrar pendiente: servidor n8n respondió con estado ${response.status}. Detalles: ${errorText}`;
            }

            const data = await response.json();
            console.log(`✅ Pendiente registrado exitosamente:`, data);
            return JSON.stringify({
                mensaje: `Registro exitoso. El paciente con cédula ${cedula} será notificado en ${correo} cuando el medicamento ${medicamento} esté disponible.`,
                registro: data,
            });
        } catch (error: any) {
            return `Error de conexión: ${error.message}. Verifica que n8n está activo en: ${URL_WEBHOOK_PENDIENTES}`;
        }
    },
});
