// ════════════════════════════════════════════════════════════════
//  Edge Function: doc-viewer — Visor público branded de documentos
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  GET /doc-viewer?token=XXXXX
//
//  Flujo:
//  1. Busca el registro en documentos_compartidos por token
//  2. Registra la vista (first_viewed_at, view_count++)
//  3. Si es la primera vez → envía push notification
//  4. Sirve página HTML branded con datos del documento
//
//  Env vars requeridas:
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
//    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (para push)
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let webpush: any = null;
try {
  webpush = (await import('npm:web-push@3.6.7')).default;
  const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || '';
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails('mailto:jordi@jordiinstalacions.es', VAPID_PUBLIC, VAPID_PRIVATE);
  }
} catch(_) { /* push no disponible */ }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'text/html; charset=utf-8'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'Content-Type': 'text/plain' } });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(renderError('Enlace no válido', 'No se ha proporcionado un token de documento.'), { headers: CORS });
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
    return new Response(renderError('Documento no encontrado', 'Este enlace no es válido o ha expirado.'), { headers: CORS });
  }

  // 2. Cargar datos de la empresa
  const { data: empresa } = await sb
    .from('empresas')
    .select('nombre, logo_url, email, telefono, direccion, nif')
    .eq('id', share.empresa_id)
    .single();

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
    // Marcar como notificado
    await sb.from('documentos_compartidos').update({ notificado: true }).eq('id', share.id);
  }

  // 6. Servir página HTML
  const html = renderVisor(empresa, share, docData);
  return new Response(html, { headers: CORS });
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


// ═══════════════════════════════════════════════
//  RENDER: VISOR HTML BRANDED
// ═══════════════════════════════════════════════

function renderVisor(empresa: any, share: any, doc: any) {
  const nombreEmpresa = empresa?.nombre || 'instaloERP';
  const logoUrl = empresa?.logo_url || '';
  const emailEmpresa = empresa?.email || '';
  const telEmpresa = empresa?.telefono || '';
  const dirEmpresa = empresa?.direccion || '';
  const nifEmpresa = empresa?.nif || '';

  const tipoLabel: Record<string, string> = {
    factura: 'Factura',
    presupuesto: 'Presupuesto',
    albaran: 'Albarán',
    parte_trabajo: 'Parte de trabajo',
    factura_proveedor: 'Factura de proveedor',
    pedido_compra: 'Pedido de compra',
    presupuesto_compra: 'Presupuesto de compra'
  };

  const tipoDoc = tipoLabel[share.tipo_documento] || share.tipo_documento;
  const numero = share.documento_numero || '';

  // Datos del documento
  let datosHtml = '';
  if (doc) {
    const fecha = doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const total = doc.total != null ? Number(doc.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '';
    const base = doc.base_imponible != null ? Number(doc.base_imponible).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '';
    const iva = doc.iva != null ? Number(doc.iva).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '';
    const estado = doc.estado || '';

    datosHtml = `
      <div class="doc-info">
        ${fecha ? `<div class="info-row"><span class="label">Fecha</span><span class="value">${fecha}</span></div>` : ''}
        ${doc.cliente_nombre ? `<div class="info-row"><span class="label">Cliente</span><span class="value">${doc.cliente_nombre}</span></div>` : ''}
        ${doc.proveedor_nombre ? `<div class="info-row"><span class="label">Proveedor</span><span class="value">${doc.proveedor_nombre}</span></div>` : ''}
        ${doc.titulo ? `<div class="info-row"><span class="label">Concepto</span><span class="value">${doc.titulo}</span></div>` : ''}
        ${doc.descripcion ? `<div class="info-row"><span class="label">Descripción</span><span class="value">${doc.descripcion}</span></div>` : ''}
        ${estado ? `<div class="info-row"><span class="label">Estado</span><span class="value badge-estado">${estado}</span></div>` : ''}
      </div>
      ${base || total ? `
      <div class="doc-totals">
        ${base ? `<div class="total-row"><span>Base imponible</span><span>${base}</span></div>` : ''}
        ${iva ? `<div class="total-row"><span>IVA</span><span>${iva}</span></div>` : ''}
        ${total ? `<div class="total-row total-final"><span>Total</span><span>${total}</span></div>` : ''}
      </div>` : ''}
    `;

    // Líneas del documento (si existen)
    if (doc.lineas && Array.isArray(doc.lineas) && doc.lineas.length) {
      datosHtml += `
      <div class="doc-lines">
        <table>
          <thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead>
          <tbody>
            ${doc.lineas.map((l: any) => `
              <tr>
                <td>${l.descripcion || l.concepto || ''}</td>
                <td style="text-align:center">${l.cantidad || ''}</td>
                <td style="text-align:right">${l.precio != null ? Number(l.precio).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : ''}</td>
                <td style="text-align:right">${l.importe != null ? Number(l.importe).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
    }

    if (doc.observaciones) {
      datosHtml += `<div class="doc-obs"><strong>Observaciones:</strong><br>${doc.observaciones}</div>`;
    }
  } else {
    datosHtml = '<p style="color:#999;text-align:center;padding:40px">Los datos del documento no están disponibles.</p>';
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tipoDoc} ${numero} — ${nombreEmpresa}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f2f5;
      color: #1a1a2e;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 24px 20px;
      text-align: center;
    }
    .header img { max-height: 50px; margin-bottom: 12px; }
    .header h1 { font-size: 14px; font-weight: 400; opacity: 0.8; margin-bottom: 4px; }
    .header .doc-num { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header .empresa { font-size: 12px; opacity: 0.6; margin-top: 8px; }
    .container {
      max-width: 680px;
      margin: -20px auto 40px;
      padding: 0 16px;
    }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      overflow: hidden;
      margin-bottom: 16px;
    }
    .doc-info { padding: 20px; }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f5f5f5;
      font-size: 14px;
    }
    .info-row:last-child { border-bottom: none; }
    .info-row .label { color: #666; font-weight: 500; }
    .info-row .value { color: #1a1a2e; font-weight: 600; text-align: right; }
    .badge-estado {
      display: inline-block;
      background: #e3f2fd;
      color: #1565c0;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      text-transform: capitalize;
    }
    .doc-totals {
      background: #fafbfc;
      padding: 16px 20px;
      border-top: 1px solid #eee;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 14px;
      color: #555;
    }
    .total-final {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a2e;
      padding-top: 8px;
      border-top: 2px solid #eee;
      margin-top: 4px;
    }
    .doc-lines { padding: 0 20px 20px; }
    .doc-lines table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .doc-lines th {
      text-align: left;
      padding: 8px 4px;
      border-bottom: 2px solid #eee;
      color: #666;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    .doc-lines td {
      padding: 8px 4px;
      border-bottom: 1px solid #f5f5f5;
    }
    .doc-obs {
      padding: 16px 20px;
      background: #fffde7;
      font-size: 13px;
      color: #555;
      border-top: 1px solid #fff9c4;
    }
    .footer {
      text-align: center;
      padding: 20px;
      font-size: 11px;
      color: #999;
    }
    .footer a { color: #1565c0; text-decoration: none; }
    @media (max-width: 600px) {
      .header .doc-num { font-size: 20px; }
      .doc-lines { overflow-x: auto; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${logoUrl}" alt="${nombreEmpresa}">` : ''}
    <h1>${tipoDoc}</h1>
    <div class="doc-num">${numero}</div>
    <div class="empresa">${nombreEmpresa}</div>
  </div>
  <div class="container">
    <div class="card">
      ${datosHtml}
    </div>
  </div>
  <div class="footer">
    <p>${nombreEmpresa}${nifEmpresa ? ' &middot; ' + nifEmpresa : ''}${dirEmpresa ? '<br>' + dirEmpresa : ''}</p>
    ${telEmpresa ? `<p>${telEmpresa}</p>` : ''}
    ${emailEmpresa ? `<p><a href="mailto:${emailEmpresa}">${emailEmpresa}</a></p>` : ''}
    <p style="margin-top:12px;opacity:0.5">Documento generado por instaloERP</p>
  </div>
</body>
</html>`;
}


// ═══════════════════════════════════════════════
//  RENDER: PÁGINA DE ERROR
// ═══════════════════════════════════════════════

function renderError(titulo: string, mensaje: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f0f2f5;
      margin: 0;
    }
    .box {
      background: white;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      max-width: 400px;
    }
    .box .icon { font-size: 48px; margin-bottom: 16px; }
    .box h1 { font-size: 20px; color: #333; margin-bottom: 8px; }
    .box p { font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">📄</div>
    <h1>${titulo}</h1>
    <p>${mensaje}</p>
  </div>
</body>
</html>`;
}
