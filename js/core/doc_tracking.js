/**
 * MÓDULO DE TRACKING DE DOCUMENTOS COMPARTIDOS
 *
 * Genera enlaces únicos con token para cada documento compartido.
 * Cuando el destinatario abre el enlace, se registra la vista y
 * se envía push notification (solo en la primera apertura).
 *
 * Soporta: facturas, presupuestos, albaranes, partes de trabajo
 * Canal-agnóstico: funciona desde email, SMS, WhatsApp, etc.
 */

// ═══════════════════════════════════════════════
//  URL BASE DEL VISOR
// ═══════════════════════════════════════════════
// La Edge Function redirige (302) al visor en GitHub Pages automáticamente.
// Usamos la URL de la Edge Function para que los enlaces sean más cortos
// y el redirect se encargue de llevar al visor.html.
const DOC_VIEWER_URL = SUPA_URL + '/functions/v1/doc-viewer';

// Cache local de estados de tracking (evita queries repetidas)
const _trackingCache = new Map();

// ═══════════════════════════════════════════════
//  COMPARTIR DOCUMENTO — genera enlace con token
// ═══════════════════════════════════════════════

/**
 * Crea un registro de compartición y devuelve el enlace público.
 * @param {object} opts
 * @param {string} opts.tipo_documento - 'factura'|'presupuesto'|'albaran'|'parte_trabajo'|'factura_proveedor'|'pedido_compra'|'presupuesto_compra'
 * @param {string} opts.documento_id - UUID del documento
 * @param {string} opts.documento_numero - Número visible (ej: "V1-0001")
 * @param {string} [opts.destinatario_nombre]
 * @param {string} [opts.destinatario_email]
 * @param {string} [opts.destinatario_telefono]
 * @param {string} [opts.canal] - 'email'|'sms'|'whatsapp'|'otro' (default: 'email')
 * @returns {Promise<{url: string, token: string, id: string}|null>}
 */
async function compartirDocumento(opts) {
  if (!opts?.tipo_documento || !opts?.documento_id) {
    console.error('[DocTracking] tipo_documento y documento_id son obligatorios');
    return null;
  }

  try {
    const { data, error } = await sb.from('documentos_compartidos').insert({
      empresa_id: EMPRESA.id,
      tipo_documento: opts.tipo_documento,
      documento_id: String(opts.documento_id),
      documento_numero: opts.documento_numero || '',
      destinatario_nombre: opts.destinatario_nombre || null,
      destinatario_email: opts.destinatario_email || null,
      destinatario_telefono: opts.destinatario_telefono || null,
      canal: opts.canal || 'email',
      acceso_token: opts.acceso_token || null,
      created_by: sb.auth.getUser ? (await sb.auth.getUser())?.data?.user?.id : null
    }).select('id, token').single();

    if (error) throw error;

    const url = DOC_VIEWER_URL + '?token=' + data.token;

    // Invalidar cache para este documento
    const cacheKey = opts.tipo_documento + ':' + opts.documento_id;
    _trackingCache.delete(cacheKey);

    console.log('[DocTracking] Enlace generado:', url);
    return { url, token: data.token, id: data.id };

  } catch (e) {
    console.warn('[DocTracking] Error creando enlace (no crítico):', e.message || e);
    return null;
  }
}


// ═══════════════════════════════════════════════
//  CONSULTAR ESTADO DE VISTA
// ═══════════════════════════════════════════════

/**
 * Obtiene el estado de compartición/vista de un documento.
 * @param {string} tipo_documento
 * @param {string} documento_id
 * @returns {Promise<{compartido: boolean, visto: boolean, first_viewed_at: string|null, view_count: number, shares: Array}>}
 */
async function getEstadoTracking(tipo_documento, documento_id) {
  const cacheKey = tipo_documento + ':' + documento_id;

  // Check cache (válido 30 segundos)
  const cached = _trackingCache.get(cacheKey);
  if (cached && (Date.now() - cached._ts < 30000)) return cached;

  try {
    const { data, error } = await sb.from('documentos_compartidos')
      .select('id, token, destinatario_nombre, destinatario_email, canal, first_viewed_at, last_viewed_at, view_count, created_at')
      .eq('empresa_id', EMPRESA.id)
      .eq('tipo_documento', tipo_documento)
      .eq('documento_id', String(documento_id))
      .order('created_at', { ascending: false });

    if (error) throw error;

    const shares = data || [];
    const visto = shares.some(s => s.first_viewed_at != null);
    const totalViews = shares.reduce((sum, s) => sum + (s.view_count || 0), 0);
    const firstView = shares.filter(s => s.first_viewed_at).sort((a, b) => a.first_viewed_at.localeCompare(b.first_viewed_at))[0];

    const result = {
      compartido: shares.length > 0,
      visto,
      first_viewed_at: firstView?.first_viewed_at || null,
      view_count: totalViews,
      shares,
      _ts: Date.now()
    };

    _trackingCache.set(cacheKey, result);
    return result;

  } catch (e) {
    console.error('[DocTracking] Error consultando estado:', e);
    return { compartido: false, visto: false, first_viewed_at: null, view_count: 0, shares: [] };
  }
}


// ═══════════════════════════════════════════════
//  BADGE "VISTO" — renderizar en cualquier lista
// ═══════════════════════════════════════════════

/**
 * Genera HTML para el badge de estado de tracking.
 * @param {object} estado - resultado de getEstadoTracking
 * @returns {string} HTML del badge
 */
function badgeTracking(estado, docId) {
  if (!estado || !estado.compartido) return '';
  const dataAttr = docId ? ` data-tracking-id="${docId}"` : '';

  if (estado.visto) {
    const fecha = estado.first_viewed_at
      ? new Date(estado.first_viewed_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    const views = estado.view_count > 1 ? ` (${estado.view_count}x)` : '';
    return `<span class="badge-tracking badge-visto"${dataAttr} title="Visto: ${fecha}${views}" style="
      display:inline-flex;align-items:center;gap:3px;
      background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;
      border-radius:10px;padding:1px 8px;font-size:10px;font-weight:600;
      cursor:default;white-space:nowrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      Visto${views}
    </span>`;
  }

  // Compartido pero no visto
  return `<span class="badge-tracking badge-enviado"${dataAttr} title="Enviado, pendiente de abrir" style="
    display:inline-flex;align-items:center;gap:3px;
    background:#fff3e0;color:#e65100;border:1px solid #ffcc80;
    border-radius:10px;padding:1px 8px;font-size:10px;font-weight:600;
    cursor:default;white-space:nowrap">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
    Enviado
  </span>`;
}


// ═══════════════════════════════════════════════
//  MODAL DE DETALLE DE TRACKING
// ═══════════════════════════════════════════════

/**
 * Abre un modal con el historial completo de comparticiones de un documento.
 */
async function mostrarDetalleTracking(tipo_documento, documento_id, documento_numero) {
  const estado = await getEstadoTracking(tipo_documento, documento_id);

  if (!estado.compartido) {
    toast('Este documento no ha sido compartido todavía', 'info');
    return;
  }

  let rows = '';
  for (const s of estado.shares) {
    const dest = s.destinatario_nombre || s.destinatario_email || 'Desconocido';
    const canal = { email: '📧', sms: '📱', whatsapp: '💬', otro: '🔗' }[s.canal] || '🔗';
    const enviado = new Date(s.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const visto = s.first_viewed_at
      ? new Date(s.first_viewed_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '<span style="color:var(--gris-400)">No abierto</span>';
    const views = s.view_count || 0;

    rows += `<tr>
      <td>${canal} ${dest}</td>
      <td>${enviado}</td>
      <td>${visto}</td>
      <td style="text-align:center">${views}</td>
      <td><button onclick="copiarEnlaceTracking('${s.token}')" class="btn btn-sm" style="font-size:10px;padding:2px 6px">📋 Copiar</button></td>
    </tr>`;
  }

  const html = `
    <div style="padding:20px">
      <h4 style="margin:0 0 16px">Historial de envíos — ${documento_numero || 'Documento'}</h4>
      <table class="table" style="font-size:12px;width:100%">
        <thead><tr>
          <th>Destinatario</th><th>Enviado</th><th>Visto</th><th>Vistas</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Usar el sistema de modales existente del ERP
  if (typeof abrirModalGenerico === 'function') {
    abrirModalGenerico('Tracking: ' + (documento_numero || ''), html);
  } else {
    // Fallback: modal simple
    const overlay = document.createElement('div');
    overlay.id = 'modal-tracking-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:white;border-radius:12px;max-width:700px;width:95%;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--gris-100)">
        <strong>Tracking: ${documento_numero || 'Documento'}</strong>
        <button onclick="document.getElementById('modal-tracking-overlay').remove()" style="border:none;background:none;font-size:20px;cursor:pointer">&times;</button>
      </div>
      ${html}
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }
}


// ═══════════════════════════════════════════════
//  COPIAR ENLACE AL PORTAPAPELES
// ═══════════════════════════════════════════════

function copiarEnlaceTracking(token) {
  const url = DOC_VIEWER_URL + '?token=' + token;
  navigator.clipboard.writeText(url).then(() => {
    toast('Enlace copiado al portapapeles', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Enlace copiado al portapapeles', 'success');
  });
}


// ═══════════════════════════════════════════════
//  MODAL "COMPARTIR DOCUMENTO" — canal-agnóstico
// ═══════════════════════════════════════════════

/**
 * Abre modal para compartir un documento por cualquier canal.
 * Genera el enlace y ofrece opciones: copiar, email, WhatsApp, SMS.
 * @param {object} doc - { tipo_documento, documento_id, documento_numero, destinatario_nombre, destinatario_email, destinatario_telefono }
 */
async function modalCompartirDocumento(doc) {
  // Generar enlace
  const result = await compartirDocumento({
    tipo_documento: doc.tipo_documento,
    documento_id: doc.documento_id,
    documento_numero: doc.documento_numero,
    destinatario_nombre: doc.destinatario_nombre,
    destinatario_email: doc.destinatario_email,
    destinatario_telefono: doc.destinatario_telefono,
    canal: 'otro'  // Se actualiza al elegir canal
  });

  if (!result) return;

  const url = result.url;
  const asunto = encodeURIComponent(`Documento: ${doc.documento_numero || 'Ver documento'}`);
  const texto = encodeURIComponent(`Hola${doc.destinatario_nombre ? ' ' + doc.destinatario_nombre : ''}, te envío el documento ${doc.documento_numero || ''}. Puedes verlo aquí: ${url}`);

  const html = `
    <div style="padding:24px;text-align:center">
      <div style="font-size:48px;margin-bottom:12px">🔗</div>
      <h4 style="margin:0 0 8px">Enlace generado</h4>
      <p style="color:var(--gris-500);font-size:12px;margin:0 0 20px">
        Cuando el destinatario abra este enlace, recibirás una notificación.
      </p>

      <div style="background:var(--gris-50);border:1px solid var(--gris-200);border-radius:8px;padding:10px 14px;margin-bottom:20px;display:flex;align-items:center;gap:8px">
        <input type="text" value="${url}" readonly id="tracking-url-input"
          style="flex:1;border:none;background:none;font-size:11px;color:var(--gris-600);outline:none;font-family:monospace">
        <button onclick="copiarEnlaceTracking('${result.token}')" class="btn btn-sm" style="white-space:nowrap;font-weight:600">📋 Copiar</button>
      </div>

      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        ${doc.destinatario_email ? `
        <button onclick="window.open('mailto:${doc.destinatario_email}?subject=${asunto}&body=${texto}');_actualizarCanalTracking('${result.id}','email')" class="btn" style="background:#4285f4;color:white;border:none;border-radius:8px;padding:10px 20px;font-weight:600;display:flex;align-items:center;gap:6px">
          📧 Email
        </button>` : ''}
        ${doc.destinatario_telefono ? `
        <a href="https://wa.me/${(doc.destinatario_telefono || '').replace(/[^0-9]/g,'')}?text=${texto}" target="_blank" onclick="_actualizarCanalTracking('${result.id}','whatsapp')" class="btn" style="background:#25d366;color:white;border:none;border-radius:8px;padding:10px 20px;font-weight:600;display:flex;align-items:center;gap:6px;text-decoration:none">
          💬 WhatsApp
        </a>
        <a href="sms:${doc.destinatario_telefono}?body=${texto}" onclick="_actualizarCanalTracking('${result.id}','sms')" class="btn" style="background:#ff9800;color:white;border:none;border-radius:8px;padding:10px 20px;font-weight:600;display:flex;align-items:center;gap:6px;text-decoration:none">
          📱 SMS
        </a>` : ''}
      </div>
    </div>`;

  // Modal
  const overlay = document.createElement('div');
  overlay.id = 'modal-compartir-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:white;border-radius:14px;max-width:500px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:flex-end;padding:8px 12px 0">
      <button onclick="document.getElementById('modal-compartir-overlay').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--gris-400)">&times;</button>
    </div>
    ${html}
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/**
 * Actualiza el canal después de que el usuario elige cómo enviar.
 */
async function _actualizarCanalTracking(shareId, canal) {
  try {
    await sb.from('documentos_compartidos').update({ canal }).eq('id', shareId);
  } catch(_) {}
}


// ═══════════════════════════════════════════════
//  HOOK PARA ENVÍO POR EMAIL — auto-tracking
// ═══════════════════════════════════════════════

/**
 * Wrapper que extiende enviarDocumentoPorEmail para auto-registrar tracking.
 * Llámalo ANTES de enviar el email para incluir el enlace en el cuerpo.
 * @param {object} opts - mismas opciones que enviarDocumentoPorEmail + tipo_documento, documento_id, documento_numero
 * @returns {Promise<{trackingUrl: string}|null>}
 */
async function enviarDocConTracking(opts) {
  // 1. Crear registro de tracking
  const track = await compartirDocumento({
    tipo_documento: opts.tipo_documento,
    documento_id: opts.documento_id,
    documento_numero: opts.documento_numero,
    destinatario_nombre: opts.destinatario_nombre || '',
    destinatario_email: opts.para,
    canal: 'email'
  });

  if (!track) {
    // Enviar sin tracking si falla
    await enviarDocumentoPorEmail(opts);
    return null;
  }

  // 2. Añadir enlace de tracking al cuerpo del email
  const linkHtml = `<p style="margin-top:16px;padding:12px;background:#f8f9fa;border-radius:8px;text-align:center">
    <a href="${track.url}" style="color:#1a73e8;font-weight:600;text-decoration:none">
      📄 Ver documento online: ${opts.documento_numero || 'Abrir documento'}
    </a>
  </p>`;

  const optsConLink = {
    ...opts,
    cuerpo_html: (opts.cuerpo_html || ('<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">' + (opts.cuerpo || '').replace(/\n/g, '<br>') + '</div>'))
      + linkHtml
  };

  // 3. Enviar email normalmente
  await enviarDocumentoPorEmail(optsConLink);

  return { trackingUrl: track.url };
}


// ═══════════════════════════════════════════════
//  SUSCRIPCIÓN REALTIME — notificación de vista
// ═══════════════════════════════════════════════

let _trackingChannel = null;
let _firmaChannel = null;

function iniciarTrackingRealtime() {
  if (_trackingChannel) return; // Ya suscrito

  // ── 1. Tracking de documentos compartidos (visto por destinatario) ──
  _trackingChannel = sb.channel('doc-tracking-' + EMPRESA.id)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'documentos_compartidos',
      filter: 'empresa_id=eq.' + EMPRESA.id
    }, (payload) => {
      const nuevo = payload.new;
      const viejo = payload.old;

      // Detectar vista: first_viewed_at tiene valor
      // payload.old puede no tener first_viewed_at sin REPLICA IDENTITY FULL,
      // así que comprobamos contra el cache local en vez de payload.old
      if (nuevo.first_viewed_at) {
        const cacheKey = nuevo.tipo_documento + ':' + nuevo.documento_id;
        const cached = _trackingCache.get(cacheKey);
        const esPrimeraVista = !cached || !cached.visto;

        // Invalidar cache y actualizar badge siempre
        _trackingCache.delete(cacheKey);
        _actualizarBadgeEnLista(nuevo.tipo_documento, nuevo.documento_id, nuevo.view_count || 1);

        // Toast + campana solo en la primera vista y solo para quien envió
        if (esPrimeraVista) {
          const miId = (typeof CU !== 'undefined' && CU) ? CU.id : null;
          if (miId && nuevo.created_by === miId) {
            const dest = nuevo.destinatario_nombre || nuevo.destinatario_email || 'Alguien';
            const doc = nuevo.documento_numero || nuevo.tipo_documento;
            toast(`Documento visto\n${dest} ha abierto ${doc}`, 'success', 6000, true);
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          }
        }
      }
    })
    .subscribe();

  // ── 2. Firma de presupuestos (cliente acepta y firma) ──
  _firmaChannel = sb.channel('firma-pres-' + EMPRESA.id)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'presupuestos',
      filter: 'empresa_id=eq.' + EMPRESA.id
    }, (payload) => {
      const nuevo = payload.new;
      const viejo = payload.old;

      // Solo cuando el estado pasa a 'aceptado' (firma nueva)
      if (nuevo.estado === 'aceptado' && viejo.estado !== 'aceptado' && nuevo.firma_fecha) {
        const miId = (typeof CU !== 'undefined' && CU) ? CU.id : null;

        // Notificar solo al usuario que envió el presupuesto a firmar
        if (miId && nuevo.firma_enviado_por === miId) {
          const cliente = nuevo.firma_nombre || nuevo.cliente_nombre || 'El cliente';
          const num = nuevo.numero || '';
          toast(`Presupuesto firmado\n${cliente} ha aceptado ${num}`, 'success', 8000, true);
          if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        }
      }
    })
    .subscribe();

  console.log('[DocTracking] Realtime suscrito (tracking + firmas)');
}

function detenerTrackingRealtime() {
  if (_trackingChannel) {
    sb.removeChannel(_trackingChannel);
    _trackingChannel = null;
  }
  if (_firmaChannel) {
    sb.removeChannel(_firmaChannel);
    _firmaChannel = null;
  }
}


// ═══════════════════════════════════════════════
//  INIT — llamar desde cargarTodos()
// ═══════════════════════════════════════════════

function initDocTracking() {
  iniciarTrackingRealtime();
  console.log('[DocTracking] Módulo inicializado');
}


// ═══════════════════════════════════════════════
//  CARGA BATCH — todos los trackings de un tipo
// ═══════════════════════════════════════════════

/**
 * Carga todos los registros de tracking de un tipo de documento de una vez.
 * Devuelve un Map: documento_id → { compartido, visto, first_viewed_at, view_count }
 * Úsalo en loadFacturas/loadPresupuestos etc. para evitar N+1 queries.
 */
async function cargarTrackingBatch(tipo_documento) {
  try {
    const { data, error } = await sb.from('documentos_compartidos')
      .select('documento_id, first_viewed_at, view_count')
      .eq('empresa_id', EMPRESA.id)
      .eq('tipo_documento', tipo_documento);

    if (error) throw error;

    const mapa = new Map();
    for (const row of (data || [])) {
      const existing = mapa.get(row.documento_id);
      if (!existing) {
        mapa.set(row.documento_id, {
          compartido: true,
          visto: !!row.first_viewed_at,
          first_viewed_at: row.first_viewed_at,
          view_count: row.view_count || 0
        });
      } else {
        existing.view_count += (row.view_count || 0);
        if (row.first_viewed_at && !existing.visto) {
          existing.visto = true;
          existing.first_viewed_at = row.first_viewed_at;
        }
      }
    }
    return mapa;
  } catch(e) {
    console.error('[DocTracking] Error carga batch:', e);
    return new Map();
  }
}

// Variable global para el mapa de tracking activo (se rellena al cargar cada sección)
let _trackingMap = new Map();


// ═══════════════════════════════════════════════
//  ACTUALIZAR BADGE EN VIVO (sin recargar lista)
// ═══════════════════════════════════════════════

/**
 * Busca en el DOM el badge de tracking para un documento concreto
 * y lo actualiza a "Visto" cuando llega el evento realtime.
 */
function _actualizarBadgeEnLista(tipo_documento, documento_id, view_count) {
  const views = (view_count || 1) > 1 ? ` (${view_count}x)` : '';
  const vistoHtml = `<span class="badge-tracking badge-visto" data-tracking-id="${documento_id}" title="Visto${views}" style="
    display:inline-flex;align-items:center;gap:3px;
    background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;
    border-radius:10px;padding:1px 8px;font-size:10px;font-weight:600;
    cursor:default;white-space:nowrap">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
    Visto${views}
  </span>`;

  // 1. Buscar badges existentes con data-tracking-id (los reemplaza in-place)
  const badges = document.querySelectorAll(`[data-tracking-id="${documento_id}"]`);
  badges.forEach(el => { el.outerHTML = vistoHtml; });

  // 2. Si no había badges, buscar la celda data-tracking-cell e inyectar
  if (!badges.length) {
    const cell = document.querySelector(`[data-tracking-cell="${documento_id}"]`);
    if (cell) {
      const estadoSpan = cell.querySelector('span[onclick*="cambiarEstado"]');
      const badgeDiv = `<div style="margin-top:2px;cursor:pointer" onclick="event.stopPropagation();mostrarDetalleTracking('${tipo_documento}','${documento_id}','')">${vistoHtml}</div>`;
      if (estadoSpan) {
        estadoSpan.insertAdjacentHTML('afterend', badgeDiv);
      } else {
        cell.insertAdjacentHTML('afterbegin', badgeDiv);
      }
    }
  }

  // Actualizar también el mapa local
  _trackingMap.set(String(documento_id), {
    compartido: true, visto: true,
    first_viewed_at: new Date().toISOString(),
    view_count: view_count || 1
  });
}


// ═══════════════════════════════════════════════
//  INYECCIÓN MASIVA DE BADGES EN LISTAS
// ═══════════════════════════════════════════════

/**
 * Carga batch de tracking para un tipo y renderiza badges en celdas con data-tracking-cell.
 * Llamar después de inyectar el HTML de la tabla.
 * @param {Array} list - array de documentos (cada uno con .id)
 * @param {string} tipo_documento - 'presupuesto'|'albaran'|'factura'|etc.
 */
async function _inyectarBadgesTracking(list, tipo_documento) {
  if (!list || !list.length) return;
  try {
    const mapa = await cargarTrackingBatch(tipo_documento);
    if (!mapa.size) return;

    // Guardar en el mapa global para realtime updates
    mapa.forEach((v, k) => _trackingMap.set(k, v));

    // Buscar celdas con data-tracking-cell e inyectar badge
    const cells = document.querySelectorAll('[data-tracking-cell]');
    cells.forEach(cell => {
      const docId = cell.getAttribute('data-tracking-cell');
      const estado = mapa.get(docId) || mapa.get(String(docId));
      if (!estado || !estado.compartido) return;

      // Limpiar badges previos para evitar duplicados
      cell.querySelectorAll('[data-tracking-id]').forEach(el => {
        const wrapper = el.closest('div[onclick*="mostrarDetalleTracking"]');
        if (wrapper) wrapper.remove(); else el.remove();
      });

      // Insertar badge después del primer span (el badge de estado)
      const badge = badgeTracking(estado, docId);
      if (!badge) return;

      const badgeHtml = `<div style="margin-top:2px;cursor:pointer" onclick="event.stopPropagation();mostrarDetalleTracking('${tipo_documento}','${docId}','')">${badge}</div>`;
      const estadoSpan = cell.querySelector('span[onclick*="cambiarEstado"]');
      if (estadoSpan) {
        estadoSpan.insertAdjacentHTML('afterend', badgeHtml);
      } else {
        // Fallback: insertar al inicio de la celda (rectificativas, etc.)
        cell.insertAdjacentHTML('afterbegin', badgeHtml);
      }
    });
  } catch(e) {
    console.error('[DocTracking] Error inyectando badges:', e);
  }
}
