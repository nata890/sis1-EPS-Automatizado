#!/usr/bin/env node
/**
 * Script para probar la conexión a los webhooks de n8n
 * Ejecutar con: npx ts-node testN8n.ts
 */

const URL_WEBHOOK_FORMULAS = "https://nataproyecto.app.n8n.cloud/webhook/consultar-formula";
const URL_WEBHOOK_INVENTARIO = "https://nataproyecto.app.n8n.cloud/webhook/consultar-inventario";

async function testConexion() {
    console.log("🧪 Iniciando pruebas de conexión a n8n...\n");

    // Test 1: Verificar si n8n está disponible (ping)
    console.log("📡 Test 1: Verificando disponibilidad de n8n...");
    try {
        const response = await fetch("https://nataproyecto.app.n8n.cloud", {
            method: "GET",
            signal: AbortSignal.timeout(5000)
        });
        console.log(`✅ n8n está disponible (HTTP ${response.status})\n`);
    } catch (error: any) {
        console.error(`❌ No se puede conectar a n8n: ${error.message}\n`);
    }

    // Test 2: Probar webhook de fórmulas
    console.log("📡 Test 2: Probando webhook de FÓRMULAS...");
    try {
        const response = await fetch(URL_WEBHOOK_FORMULAS, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cedula: "1053db829" }),
            signal: AbortSignal.timeout(10000)
        });

        console.log(`   Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const text = await response.text();
            console.error(`   ❌ Error: ${text}`);
        } else {
            const data = await response.json();
            console.log(`   ✅ Respuesta exitosa:`);
            console.log(`   ${JSON.stringify(data, null, 2)}\n`);
        }
    } catch (error: any) {
        console.error(`   ❌ Error de conexión: ${error.message}\n`);
    }

    // Test 3: Probar webhook de inventario
    console.log("📡 Test 3: Probando webhook de INVENTARIO...");
    try {
        const response = await fetch(URL_WEBHOOK_INVENTARIO, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ medicamento: "Losartán" }),
            signal: AbortSignal.timeout(10000)
        });

        console.log(`   Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const text = await response.text();
            console.error(`   ❌ Error: ${text}`);
        } else {
            const data = await response.json();
            console.log(`   ✅ Respuesta exitosa:`);
            console.log(`   ${JSON.stringify(data, null, 2)}\n`);
        }
    } catch (error: any) {
        console.error(`   ❌ Error de conexión: ${error.message}\n`);
    }

    console.log("🏁 Pruebas completadas\n");
    console.log("📋 URLs configuradas:");
    console.log(`   Fórmulas: ${URL_WEBHOOK_FORMULAS}`);
    console.log(`   Inventario: ${URL_WEBHOOK_INVENTARIO}\n`);
}

testConexion().catch(console.error);
