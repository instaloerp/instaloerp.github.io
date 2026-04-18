// ════════════════════════════════════════════════════════════════
//  Proxy mTLS para VeriFactu — Deno Deploy
//  instaloERP v1.1 · v2 (usa node:https para mTLS real)
// ════════════════════════════════════════════════════════════════
//
//  Deno.createHttpClient NO soporta certChain/privateKey en Deploy.
//  Usamos node:https que SÍ soporta mTLS con cert + key.
//
//  Variables de entorno en Deno Deploy:
//    CERT_PEM     — Certificado PEM (texto completo)
//    KEY_PEM      — Clave privada PEM (texto completo)
//    PROXY_SECRET — Token para autenticar peticiones
//
// ════════════════════════════════════════════════════════════════

import * as https from "node:https";
import { URL } from "node:url";

const ENDPOINTS: Record<string, string> = {
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  produccion: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
};

/** Hace una petición HTTPS con certificado de cliente (mTLS) */
function httpsRequest(
  url: string,
  body: string,
  cert: string,
  key: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      cert: cert,
      key: key,
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": "",
        "Content-Length": Buffer.byteLength(body, "utf-8"),
      },
      // No verificar el cert del servidor AEAT (algunos entornos de prueba lo necesitan)
      rejectUnauthorized: true,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        const hdrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") hdrs[k] = v;
        }
        resolve({ status: res.statusCode || 0, body: data, headers: hdrs });
      });
    });

    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResp({ error: "Solo POST", version: "v2-node-https" }, 405);
  }

  try {
    // 1. Verificar token secreto
    const authHeader = req.headers.get("Authorization") || "";
    const proxySecret = Deno.env.get("PROXY_SECRET") || "";
    if (!proxySecret || authHeader !== `Bearer ${proxySecret}`) {
      return jsonResp({ error: "No autorizado" }, 401);
    }

    // 2. Leer body
    const body = await req.json();
    const { xml, modo } = body;

    if (!xml || !modo) {
      return jsonResp({ error: "Faltan parámetros: xml, modo" }, 400);
    }

    const endpoint = ENDPOINTS[modo];
    if (!endpoint) {
      return jsonResp({ error: `Modo no válido: ${modo}. Usar: test, produccion` }, 400);
    }

    // 3. Cargar certificado
    let certPem = Deno.env.get("CERT_PEM") || "";
    let keyPem = Deno.env.get("KEY_PEM") || "";

    if (!certPem || !keyPem) {
      return jsonResp({ error: "CERT_PEM o KEY_PEM no configurados" }, 500);
    }

    // Asegurar saltos de línea reales
    certPem = certPem.replace(/\\n/g, "\n");
    keyPem = keyPem.replace(/\\n/g, "\n");

    // Validar formato PEM
    const certOk = certPem.includes("-----BEGIN CERTIFICATE-----");
    const keyOk = keyPem.includes("-----BEGIN PRIVATE KEY-----");
    if (!certOk || !keyOk) {
      return jsonResp({
        error: `PEM inválido. CERT ok: ${certOk}, KEY ok: ${keyOk}`,
        cert_preview: certPem.substring(0, 50),
      }, 500);
    }

    // 4. Enviar SOAP a AEAT con mTLS via node:https
    const aeatResp = await httpsRequest(endpoint, xml, certPem, keyPem);

    // 5. Devolver respuesta
    return jsonResp({
      ok: aeatResp.status >= 200 && aeatResp.status < 300,
      status: aeatResp.status,
      xml_respuesta: aeatResp.body,
      endpoint,
      version: "v2-node-https",
      timestamp: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    return jsonResp({ error: errorMsg, stack: errorStack, version: "v2-node-https" }, 500);
  }
});

function jsonResp(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
