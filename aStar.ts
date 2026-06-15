interface SedeConStock {
    nombre_sede: string;
    direccion: string;
    latitud: number;
    longitud: number;
    stock: number;
    [key: string]: unknown;
}

interface ResultadoAStar {
    sedeOptima: SedeConStock | null;
    distanciaKm: number;
    todasLasSedes: (SedeConStock & { distanciaKm: number })[];
}

const COORDENADAS_MANIZALES: Record<string, { lat: number; lng: number }> = {
    "barrio milán": { lat: 5.058, lng: -75.485 },
    "milán": { lat: 5.058, lng: -75.485 },
    "barrio alta suiza": { lat: 5.062, lng: -75.492 },
    "alta suiza": { lat: 5.062, lng: -75.492 },
    "sede alta suiza": { lat: 5.062, lng: -75.492 },
    "centro": { lat: 5.068, lng: -75.517 },
    "sede centro": { lat: 5.068, lng: -75.517 },
    "barrio centro": { lat: 5.068, lng: -75.517 },
    "barrio palermo": { lat: 5.055, lng: -75.490 },
    "palermo": { lat: 5.055, lng: -75.490 },
    "chipichape": { lat: 5.072, lng: -75.510 },
    "centro comercial chipichape": { lat: 5.072, lng: -75.510 },
    "estación": { lat: 5.060, lng: -75.480 },
    "la estación": { lat: 5.060, lng: -75.480 },
    "sancancio": { lat: 5.070, lng: -75.500 },
    "san cancio": { lat: 5.070, lng: -75.500 },
};

function distanciaEuclidiana(
    lat1: number, lng1: number,
    lat2: number, lng2: number
): number {
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function calcularRutaOptimaAStar(
    latitudPaciente: number,
    longitudPaciente: number,
    sedesConStock: SedeConStock[]
): ResultadoAStar {
    console.log(`📍 Paciente ubicado en coordenadas: (${latitudPaciente}, ${longitudPaciente})`);

    const sedesConDistancia = sedesConStock
        .filter(s => s.stock > 0)
        .map(s => {
            const distanciaGrados = distanciaEuclidiana(
                latitudPaciente, longitudPaciente,
                s.latitud, s.longitud
            );
            const distanciaKm = parseFloat((distanciaGrados * 111).toFixed(2));
            return { ...s, distanciaKm };
        })
        .sort((a, b) => a.distanciaKm - b.distanciaKm);

    console.log(`📊 Distancias calculadas para ${sedesConDistancia.length} sedes:`);
    sedesConDistancia.forEach(s => {
        console.log(`   - ${s.nombre_sede}: ${s.distanciaKm} km (stock: ${s.stock})`);
    });

    if (sedesConDistancia.length === 0) {
        return {
            sedeOptima: null,
            distanciaKm: 0,
            todasLasSedes: [],
        };
    }

    return {
        sedeOptima: sedesConDistancia[0],
        distanciaKm: sedesConDistancia[0].distanciaKm,
        todasLasSedes: sedesConDistancia,
    };
}
