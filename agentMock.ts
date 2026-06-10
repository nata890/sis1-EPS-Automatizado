// Agente Mock para desarrollo sin usar la API de Google (mientras se agota la cuota)
// Esto simula respuestas del agente para que puedas probar la aplicación

export const inicializarAgenteMock = async (): Promise<any> => {
    console.log("🎭 Usando agente MOCK (sin API)");
    
    const respuestasMock = [
        "Según nuestros registros, tienes una fórmula activa para Losartán 50mg. Está disponible en la sede de Manizales y en la farmacia del centro comercial Chipichape. La más cercana a tu ubicación es la de Manizales.",
        "¡Hola! Veo que necesitas información sobre medicamentos. Cuéntame tu cédula y qué medicamento necesitas para poder ayudarte mejor.",
        "Detecté que solicitaste Acetaminofén. Por favor confirma tu cédula para validar si tienes esta medicina autorizada por la EPS.",
        "Tu tratamiento está autorizado y disponible. Puedes recogerlo en la sede principal o solicitar entrega a domicilio dentro de 48 horas.",
        "Lo siento, este medicamento no está disponible en este momento, pero estamos en trámite para recibirlo. Te contactaremos cuando llegue.",
    ];
    
    let responseIndex = 0;
    
    return {
        invoke: async (input: any) => {
            // Simulamos una respuesta del agente
            const respuesta = respuestasMock[responseIndex % respuestasMock.length];
            responseIndex++;
            
            return {
                messages: [
                    {
                        role: "assistant",
                        content: respuesta
                    }
                ]
            };
        }
    };
};
