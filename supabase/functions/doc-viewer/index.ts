// ════════════════════════════════════════════════════════════════
//  Edge Function: doc-viewer — Tracking de documentos compartidos
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  GET /doc-viewer?token=XXXXX
//
//  Flujo (navegador):
//  1. Busca el registro en documentos_compartidos por token
//  2. Registra la vista (first_viewed_at, view_count++)
//  3. Si es la primera vez → envía push notification
//  4. Redirige 302 a doc.html?t=acceso_token (el visor legal con QR)
//
//  GET /doc-viewer?token=XXXXX&format=json  → devuelve datos JSON
//
//  Env vars requeridas:
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-cache',
};

function jsonOk(data: any): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}
function jsonErr(msg: string, status = 404): Response {
  return new Response(JSON.stringify({ error: msg }), { status, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const formatJson = url.searchParams.get('format') === 'json';

  if (!token) {
    return jsonErr('No se ha proporcionado un token de documento.', 400);
  }

  // Admin client (bypasses RLS)
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Buscar documento compartido
  const { data: share, error } = await sb
    .from('documentos_compartidos')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !share) {
    if (formatJson) return jsonErr('Este enlace no es válido o ha expirado.');
    // Redirect a página de error amigable
    return new Response(null, {
      status: 302,
      headers: { 'Location': 'https://instaloerp.github.io/doc.html?error=not_found', 'Cache-Control': 'no-cache' },
    });
  }

  // 2. Registrar la vista (un solo update para evitar doble evento realtime)
  const esNueva = !share.first_viewed_at;
  const ahora = new Date().toISOString();

  const updateData: any = {
    first_viewed_at: share.first_viewed_at || ahora,
    last_viewed_at: ahora,
    view_count: (share.view_count || 0) + 1
  };
  if (esNueva) updateData.notificado = true;

  await sb.from('documentos_compartidos').update(updateData).eq('id', share.id);

  // 4a. Si es petición JSON, devolver datos
  if (formatJson) {
    return jsonOk({
      share: {
        tipo_documento: share.tipo_documento,
        documento_numero: share.documento_numero,
        destinatario_nombre: share.destinatario_nombre,
      },
      first_viewed_at: share.first_viewed_at || ahora,
      view_count: (share.view_count || 0) + 1,
    });
  }

  // 4b. Navegador: redirigir al visor correspondiente con el acceso_token
  // Presupuestos → f.html (firma), resto → doc.html (visor)
  if (share.acceso_token) {
    const visor = share.tipo_documento === 'presupuesto' ? 'f.html' : 'doc.html';
    const docUrl = `https://instaloerp.github.io/${visor}?t=${encodeURIComponent(share.acceso_token)}`;
    return new Response(null, {
      status: 302,
      headers: { 'Location': docUrl, 'Cache-Control': 'no-cache' },
    });
  }

  // Fallback: si no hay acceso_token guardado, intentar buscarlo en la tabla del documento
  const tablas: Record<string, string> = {
    factura: 'facturas', presupuesto: 'presupuestos', albaran: 'albaranes',
    parte_trabajo: 'trabajos', factura_proveedor: 'facturas_proveedor',
    pedido_compra: 'pedidos_compra', presupuesto_compra: 'presupuestos_compra'
  };
  const tabla = tablas[share.tipo_documento];
  if (tabla) {
    try {
      // Presupuestos usan firma_token, el resto acceso_token
      const campoToken = share.tipo_documento === 'presupuesto' ? 'firma_token' : 'acceso_token';
      const { data: doc } = await sb.from(tabla).select(campoToken).eq('id', share.documento_id).single();
      const tokenVal = doc?.[campoToken];
      if (tokenVal) {
        // Guardar para futuras visitas
        await sb.from('documentos_compartidos').update({ acceso_token: tokenVal }).eq('id', share.id);
        const visor = share.tipo_documento === 'presupuesto' ? 'f.html' : 'doc.html';
        const docUrl = `https://instaloerp.github.io/${visor}?t=${encodeURIComponent(tokenVal)}`;
        return new Response(null, {
          status: 302,
          headers: { 'Location': docUrl, 'Cache-Control': 'no-cache' },
        });
      }
    } catch(_) {}
  }

  return jsonErr('No se pudo localizar el documento.', 404);
});
