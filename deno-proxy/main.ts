// ════════════════════════════════════════════════════════════════
//  Proxy mTLS para VeriFactu — Deno Deploy
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  Este proxy recibe peticiones SOAP desde la Edge Function de
//  Supabase y las reenvía a la AEAT con el certificado digital
//  (mTLS), ya que Supabase Edge Functions no soportan mTLS.
//
//  TEMPORAL: Cuando Supabase implemente mTLS, eliminar este proxy
//  y llamar a la AEAT directamente desde la Edge Function.
//
//  Variables de entorno necesarias en Deno Deploy:
//    CERT_PEM    — Certificado en formato PEM (texto completo)
//    KEY_PEM     — Clave privada en formato PEM (texto completo)
//    PROXY_SECRET — Token secreto para autenticar peticiones
//
// ════════════════════════════════════════════════════════════════

const ENDPOINTS: Record<string, string> = {
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  produccion: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
};

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
    return jsonResp({ error: "Solo POST" }, 405);
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

    // 3. Cargar certificado desde variables de entorno
    const certPem = Deno.env.get("CERT_PEM");
    const keyPem = Deno.env.get("KEY_PEM");

    if (!certPem || !keyPem) {
      return jsonResp({
        error: "Certificado no configurado. Configurar CERT_PEM y KEY_PEM en Deno Deploy.",
      }, 500);
    }

    // 4. Crear cliente HTTP con mTLS
    const httpClient = Deno.createHttpClient({
      certChain: certPem,
      privateKey: keyPem,
    });

    // 5. Enviar SOAP a la AEAT
    const aeatResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": "",
      },
      body: xml,
      client: httpClient,
    });

    const respText = await aeatResponse.text();
    const status = aeatResponse.status;

    // 6. Cerrar cliente
    httpClient.close();

    // 7. Devolver respuesta
    return jsonResp({
      ok: status >= 200 && status < 300,
      status,
      xml_respuesta: respText,
      endpoint: endpoint,
      timestamp: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: errorMsg }, 500);
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
