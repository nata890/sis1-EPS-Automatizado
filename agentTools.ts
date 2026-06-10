import { DynamicTool } from "@langchain/core/tools";

// Reemplaza estas URLs con las que te generó n8n (las de Production o Test)
const URL_WEBHOOK_FORMULAS = "https://nataproyecto.app.n8n.cloud/webhook/consultar-formula";
const URL_WEBHOOK_INVENTARIO = "https://nataproyecto.app.n8n.cloud/webhook/consultar-inventario";

// Herramienta 1: Validador de Autorizaciones EPS
export const toolConsultarFormulas = new DynamicTool({
    name: "consultar_formulas_eps",
    description: "Úsala SIEMPRE como primer paso para saber si el paciente tiene autorización para un medicamento. Requiere el número de cédula del paciente como entrada (string). Devuelve el estado de la fórmula.",
    func: async (cedula: string) => {
        try {
            console.log(`📡 Consultando fórmulas para cédula: ${cedula}`);
            console.log(`📍 URL: ${URL_WEBHOOK_FORMULAS}`);
            
            const response = await fetch(URL_WEBHOOK_FORMULAS, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cedula: cedula }),
                signal: AbortSignal.timeout(10000) // Timeout de 10 segundos
            });
            
            console.log(`📨 Respuesta n8n: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Error n8n (${response.status}):`, errorText);
                return `Error: El servidor n8n respondió con estado ${response.status}. Detalles: ${errorText}`;
            }
            
            const data = await response.json();
            console.log(`✅ Datos recibidos:`, data);
            return JSON.stringify(data);
            
        } catch (error: any) {
            console.error(`❌ Error en toolConsultarFormulas:`, error.message);
            return `Error de conexión: ${error.message}. Verifica que n8n está activo en: ${URL_WEBHOOK_FORMULAS}`;
        }
    }
});

// Herramienta 2: Buscador de Inventario y Enrutamiento
export const toolConsultarInventario = new DynamicTool({
    name: "consultar_inventario_sedes",
    description: "Úsala SOLO si confirmaste que la fórmula está 'Activa'. Requiere el nombre del medicamento o principio activo como entrada (string). Devuelve las sedes y el stock disponible.",
    func: async (medicamento: string) => {
        try {
            console.log(`📡 Consultando inventario para: ${medicamento}`);
            console.log(`📍 URL: ${URL_WEBHOOK_INVENTARIO}`);
            
            const response = await fetch(URL_WEBHOOK_INVENTARIO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medicamento: medicamento }),
                signal: AbortSignal.timeout(10000) // Timeout de 10 segundos
            });
            
            console.log(`📨 Respuesta n8n: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Error n8n (${response.status}):`, errorText);
                return `Error: El servidor n8n respondió con estado ${response.status}. Detalles: ${errorText}`;
            }
            
            const data = await response.json();
            console.log(`✅ Datos recibidos:`, data);
            return JSON.stringify(data);
            
        } catch (error: any) {
            console.error(`❌ Error en toolConsultarInventario:`, error.message);
            return `Error de conexión: ${error.message}. Verifica que n8n está activo en: ${URL_WEBHOOK_INVENTARIO}`;
        }
    }
});