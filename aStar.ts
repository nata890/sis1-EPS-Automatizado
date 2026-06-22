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
