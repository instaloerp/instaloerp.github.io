// ════════════════════════════════════════════════════════════════
//  Edge Function: doc-viewer — API JSON para visor público de documentos
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  GET /doc-viewer?token=XXXXX
//
//  Flujo:
//  1. Busca el registro en documentos_compartidos por token
//  2. Registra la vista (first_viewed_at, view_count++)
//  3. Si es la primera vez → envía push notification
//  4. Devuelve JSON con datos del documento + empresa
//
//  Nota: Supabase Gateway fuerza text/plain en Edge Functions,
//  así que el visor HTML se sirve desde GitHub Pages (visor.html)
//  y esta función solo devuelve los datos como JSON.
//
//  Env vars requeridas:
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
//    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (para push)
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-cache',
};

let webpush: any = null;
try {
  webpush = (await import('npm:web-push@3.6.7')).default;
  const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || '';
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails('mailto:jordi@jordiinstalacions.es', VAPID_PUBLIC, VAPID_PRIVATE);
  }
} catch(_) { /* push no disponible */ }

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

  // Si NO es petición JSON (es un navegador abriendo el enlace), redirigir a visor.html
  if (!formatJson) {
    const visorUrl = `https://instaloerp.github.io/visor.html?token=${encodeURIComponent(token)}`;
    return new Response(null, {
      status: 302,
      headers: { 'Location': visorUrl, 'Cache-Control': 'no-cache' },
    });
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
    return jsonErr('Este enlace no es válido o ha expirado.');
  }

  // 2. Cargar datos de la empresa
  let empresa: any = null;
  const { data: empData, error: empErr } = await sb
    .from('empresas')
    .select('*')
    .eq('id', share.empresa_id)
    .single();

  if (empData) {
    empresa = empData;
  } else {
    console.log('[doc-viewer] empresa no encontrada por id:', share.empresa_id, empErr?.message);
    // Fallback: cargar la primera empresa disponible
    const { data: empFirst } = await sb.from('empresas').select('*').limit(1).single();
    empresa = empFirst;
  }

  // 3. Cargar datos del documento según tipo
  const docData = await cargarDocumento(sb, share.tipo_documento, share.documento_id);

  // 4. Registrar la vista
  const esNueva = !share.first_viewed_at;
  const ahora = new Date().toISOString();

  await sb.from('documentos_compartidos').update({
    first_viewed_at: share.first_viewed_at || ahora,
    last_viewed_at: ahora,
    view_count: (share.view_count || 0) + 1
  }).eq('id', share.id);

  // 5. Push notification solo en primera vista
  if (esNueva && webpush) {
    try {
      await enviarPushNotificacion(sb, share);
    } catch (e) {
      console.error('[doc-viewer] Push error:', e);
    }
    await sb.from('documentos_compartidos').update({ notificado: true }).eq('id', share.id);
  }

  // 6. Devolver JSON (incluye pdf_url si existe)
  return jsonOk({
    empresa: empresa || {},
    share: {
      tipo_documento: share.tipo_documento,
      documento_numero: share.documento_numero,
      destinatario_nombre: share.destinatario_nombre,
    },
    documento: docData || null,
    pdf_url: share.pdf_url || null,
  });
});


// ═══════════════════════════════════════════════
//  CARGAR DATOS DEL DOCUMENTO
// ═══════════════════════════════════════════════

async function cargarDocumento(sb: any, tipo: string, id: string) {
  const tablas: Record<string, string> = {
    factura: 'facturas',
    presupuesto: 'presupuestos',
    albaran: 'albaranes',
    parte_trabajo: 'trabajos',
    factura_proveedor: 'facturas_proveedor',
    pedido_compra: 'pedidos_compra',
    presupuesto_compra: 'presupuestos_compra'
  };

  const tabla = tablas[tipo];
  if (!tabla) return null;

  try {
    const { data } = await sb.from(tabla).select('*').eq('id', id).single();
    return data;
  } catch(_) {
    return null;
  }
}


// ═══════════════════════════════════════════════
//  PUSH NOTIFICATION
// ═══════════════════════════════════════════════

async function enviarPushNotificacion(sb: any, share: any) {
  if (!webpush) return;

  // Buscar suscripciones push del usuario que creó el doc
  // Primero: suscripciones del creador
  const userId = share.created_by;
  if (!userId) return;

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId);

  if (!subs?.length) return;

  const dest = share.destinatario_nombre || share.destinatario_email || 'Alguien';
  const payload = JSON.stringify({
    title: 'Documento visto',
    body: `${dest} ha abierto ${share.documento_numero || share.tipo_documento}`,
    icon: '/icons/icon-192.png',
    data: { tipo: 'doc_visto', documento_id: share.documento_id, tipo_documento: share.tipo_documento }
  });

  for (const sub of subs) {
    try {
      const subscription = typeof sub.subscription === 'string' ? JSON.parse(sub.subscription) : sub.subscription;
      await webpush.sendNotification(subscription, payload);
    } catch (e: any) {
      if (e.statusCode === 410) {
        // Suscripción expirada, limpiar
        await sb.from('push_subscriptions').delete().eq('subscription', JSON.stringify(sub.subscription));
      }
    }
  }
}


