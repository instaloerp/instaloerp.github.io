/**
 * MÓDULO CORREO ELECTRÓNICO v2
 * Sistema híbrido: cabeceras en BD + cuerpo bajo demanda vía IMAP
 * Envío real por SMTP vía Edge Function
 * Vinculación con clientes, obras, presupuestos y facturas
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let correos = [];
let correosFiltrados = [];
let carpetaActual = 'inbox';
let correoActual = null;
let _correoSyncing = false;
let _correosSeleccionados = new Set(); // IDs de correos seleccionados
let _correoCuentaActiva = null; // Cuenta predeterminada cargada
let _correoAutoSyncInterval = null; // Intervalo de auto-sync
const CORREO_SYNC_INTERVALO_MS = 2 * 60 * 1000; // 2 minutos

// ═══════════════════════════════════════════════
//  CARGA INICIAL
// ═══════════════════════════════════════════════

// Boot: iniciar auto-sync de correo en background (llamar desde cargarTodos)
// Carga correos desde BD + arranca sync IMAP + evalúa automatizaciones + timer
async function iniciarCorreoBackground() {
  await cargarCuentaCorreoActiva();
  if (!_correoCuentaActiva) return;

  // 1. Cargar correos ya existentes en BD (sin esperar a IMAP)
  try {
    const { data } = await sb.from('correos')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('fecha', { ascending: false });
    correos = data || [];
  } catch(_) { correos = []; }

  // 2. Evaluar automatizaciones contra correos pendientes YA en BD
  if (typeof evaluarAutomatizaciones === 'function') {
    const recibidos = correos.filter(c => c.tipo === 'recibido' && !c.leido);
    if (recibidos.length) evaluarAutomatizaciones(recibidos);
  }

  // 3. Arrancar sync IMAP + timer (si sync habilitada)
  if (_correoCuentaActiva.sync_habilitada) {
    console.log('[Correo] Auto-sync background iniciado');
    sincronizarCorreo(true);
    iniciarAutoSyncCorreo();
  }
}

// Cargar cuenta SMTP predeterminada (puede llamarse al boot o lazy desde nuevoCorreo)
async function cargarCuentaCorreoActiva() {
  try {
    const { data: cuentas } = await sb.from('cuentas_correo')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .eq('activa', true)
      .order('predeterminada', { ascending: false })
      .limit(1);
    _correoCuentaActiva = cuentas?.[0] || null;
  } catch(e) {
    _correoCuentaActiva = null;
  }
  return _correoCuentaActiva;
}

async function loadCorreos() {
  await cargarCuentaCorreoActiva();

  // Si no hay cuenta configurada, mostrar mensaje
  if (!_correoCuentaActiva) {
    const container = document.getElementById('mailList');
    if (container) {
      container.innerHTML = `<div style="padding:30px 20px;text-align:center;color:var(--gris-400);font-size:13px">
        <div style="font-size:32px;margin-bottom:8px">📧</div>
        Configura tu cuenta de correo en<br><a href="#" onclick="goPage('configuracion');setTimeout(()=>cfgTab('correo'),300);return false" style="color:var(--azul);text-decoration:underline">Configuración → Correo</a>
      </div>`;
    }
    return;
  }

  // Cargar correos desde BD
  try {
    const { data } = await sb.from('correos')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('fecha', { ascending: false });
    correos = data || [];
  } catch(e) {
    correos = [];
  }
  filtrarCorreos();
  actualizarBadgeCorreo();

  // Auto-sincronizar si tiene sync habilitada
  if (_correoCuentaActiva.sync_habilitada) {
    // Si hay 0 correos en BD: resetear sync_state y hacer descarga completa
    const esPrimeraCarga = correos.length === 0;
    if (esPrimeraCarga) {
      // Resetear estado de sync para forzar descarga desde cero
      await sb.from('correo_sync_state').delete().eq('cuenta_correo_id', _correoCuentaActiva.id);
    }
    sincronizarCorreo(true, esPrimeraCarga); // silencioso, full si es primera vez
  }

  // Iniciar auto-sync cada 2 minutos
  iniciarAutoSyncCorreo();
}

// Actualizar badge de correos no leídos en el sidebar
async function actualizarBadgeCorreo() {
  try {
    const { count, error } = await sb.from('correos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', EMPRESA.id)
      .eq('leido', false)
      .eq('tipo', 'recibido');
    const n = count || 0;
    const txt = n > 99 ? '99+' : String(n);
    // Actualizar badge sidebar principal
    const badge = document.getElementById('correo-badge');
    if (badge) { badge.textContent = txt; badge.style.display = n > 0 ? 'inline' : 'none'; }
    // Actualizar badge favorito
    const favBadge = document.getElementById('fav-correo-badge');
    if (favBadge) { favBadge.textContent = txt; favBadge.style.display = n > 0 ? 'inline-flex' : 'none'; }
  } catch(_) {}
}

function iniciarAutoSyncCorreo() {
  detenerAutoSyncCorreo();
  if (!_correoCuentaActiva || !_correoCuentaActiva.sync_habilitada) return;
  _correoAutoSyncInterval = setInterval(() => {
    sincronizarCorreo(true); // silencioso en background
  }, CORREO_SYNC_INTERVALO_MS);
}

function detenerAutoSyncCorreo() {
  if (_correoAutoSyncInterval) {
    clearInterval(_correoAutoSyncInterval);
    _correoAutoSyncInterval = null;
  }
}

// ═══════════════════════════════════════════════
//  SINCRONIZACIÓN IMAP
// ═══════════════════════════════════════════════
async function sincronizarCorreo(silencioso = false, cargaCompleta = false) {
  if (_correoSyncing) return;
  if (!_correoCuentaActiva) {
    if (!silencioso) toast('No hay cuenta de correo configurada', 'error');
    return;
  }

  _correoSyncing = true;
  const syncBtn = document.getElementById('mailSyncBtn');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = cargaCompleta ? '⏳ Descargando buzón...' : '⏳ Sincronizando...';
  }

  // Lotes de 100 para no exceder timeout de Edge Function (~60s)
  const maxPorLote = 100;
  const carpetasIMAP = ['INBOX', 'Sent', 'Drafts', 'Junk', 'Trash'];
  let totalNuevos = 0;

  try {
    if (cargaCompleta) {
      // Carga completa: descargar todo el buzón en lotes de 100
      // 250 pasadas × 100 = hasta 25.000 correos por carpeta
      let sigueHabiendo = true;
      let pasada = 0;
      while (sigueHabiendo && pasada < 250) {
        pasada++;
        if (syncBtn) syncBtn.innerHTML = `⏳ Descargando... (${totalNuevos} correos)`;
        let nuevosEnPasada = 0;
        for (const folder of carpetasIMAP) {
          try {
            const { data, error } = await sb.functions.invoke('sync-correo', {
              body: {
                empresa_id: EMPRESA.id,
                cuenta_correo_id: _correoCuentaActiva.id,
                folder,
                max_mensajes: maxPorLote,
                direccion: 'ambos'
              }
            });
            if (!error && data?.success && data.nuevos > 0) {
              nuevosEnPasada += data.nuevos;
              totalNuevos += data.nuevos;
            }
          } catch (_) {}
        }
        // Si no trajo nada nuevo → ya descargó todo → parar
        sigueHabiendo = nuevosEnPasada > 0;

        // Actualizar lista en tiempo real cada 5 pasadas
        if (pasada % 5 === 0 && totalNuevos > 0) {
          const { data: parcial } = await sb.from('correos')
            .select('*').eq('empresa_id', EMPRESA.id)
            .order('fecha', { ascending: false });
          correos = parcial || [];
          filtrarCorreos();
          actualizarBadgeCorreo();
        }
      }
    } else {
      // Sincronización normal: un solo lote por carpeta
      for (const folder of carpetasIMAP) {
        try {
          const { data, error } = await sb.functions.invoke('sync-correo', {
            body: {
              empresa_id: EMPRESA.id,
              cuenta_correo_id: _correoCuentaActiva.id,
              folder,
              max_mensajes: maxPorLote
            }
          });
          if (!error && data?.success && data.nuevos > 0) totalNuevos += data.nuevos;
        } catch (_) {}
      }
    }

    if (totalNuevos > 0) {
      if (!silencioso) toast(`📬 ${totalNuevos} correo${totalNuevos > 1 ? 's' : ''} nuevo${totalNuevos > 1 ? 's' : ''}`, 'success');
    } else if (!silencioso) {
      toast('📭 No hay correos nuevos', 'info');
    }

    // Siempre recargar lista después de sync
    const { data: todos } = await sb.from('correos')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('fecha', { ascending: false });
    correos = todos || [];
    filtrarCorreos();
    actualizarBadgeCorreo();

    // Evaluar automatizaciones SIEMPRE (no solo con nuevos)
    // Nóminas se gestionan como regla de automatización, no hardcodeado
    // _crearEntradaBandeja ya comprueba duplicados, así que es seguro re-evaluar
    if (typeof evaluarAutomatizaciones === 'function') {
      const recibidos = correos.filter(c => c.tipo === 'recibido' && !c.leido);
      if (recibidos.length) evaluarAutomatizaciones(recibidos);
    }

  } catch(e) {
    if (!silencioso) toast('⚠️ Error de sincronización: ' + (e.message || 'Error desconocido'), 'error');
    console.error('Error sync correo:', e);
  }

  _correoSyncing = false;
  if (syncBtn) {
    syncBtn.disabled = false;
    syncBtn.innerHTML = '🔄';
  }
}

// Cargar correos más antiguos (bajo demanda)
async function cargarCorreosAntiguos() {
  if (_correoSyncing || !_correoCuentaActiva) return;
  _correoSyncing = true;

  const btn = document.getElementById('btnCargarAntiguos');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Cargando antiguos...'; }

  let totalNuevos = 0;
  const carpetasIMAP = ['INBOX', 'Sent', 'Drafts'];
  const lotes = 10; // 10 pasadas × 100 = hasta 1000 correos más

  try {
    for (let p = 0; p < lotes; p++) {
      let nuevosEnPasada = 0;
      for (const folder of carpetasIMAP) {
        try {
          const { data, error } = await sb.functions.invoke('sync-correo', {
            body: {
              empresa_id: EMPRESA.id,
              cuenta_correo_id: _correoCuentaActiva.id,
              folder,
              max_mensajes: 100,
              direccion: 'antiguos'
            }
          });
          if (!error && data?.success && data.nuevos > 0) {
            nuevosEnPasada += data.nuevos;
            totalNuevos += data.nuevos;
          }
        } catch (_) {}
      }
      if (btn) btn.textContent = `⏳ ${totalNuevos} cargados...`;
      if (nuevosEnPasada === 0) break; // No quedan más antiguos
    }

    if (totalNuevos > 0) {
      toast(`📬 ${totalNuevos} correo${totalNuevos > 1 ? 's' : ''} antiguo${totalNuevos > 1 ? 's' : ''} cargado${totalNuevos > 1 ? 's' : ''}`, 'success');
      const { data } = await sb.from('correos')
        .select('*').eq('empresa_id', EMPRESA.id)
        .order('fecha', { ascending: false });
      correos = data || [];
      filtrarCorreos();
      actualizarBadgeCorreo();
    } else {
      toast('📭 No hay correos más antiguos', 'info');
    }
  } catch(e) {
    toast('⚠️ Error: ' + (e.message || 'desconocido'), 'error');
  }

  _correoSyncing = false;
  if (btn) { btn.disabled = false; btn.textContent = '📥 Cargar más antiguos'; }
}

// ═══════════════════════════════════════════════
//  CARPETAS
// ═══════════════════════════════════════════════
function cambiarCarpeta(folder) {
  carpetaActual = folder;
  document.querySelectorAll('.mail-folder').forEach(el => {
    const isActive = el.dataset.folder === folder;
    el.style.background = isActive ? 'var(--azul-light)' : 'transparent';
    el.style.color = isActive ? 'var(--azul)' : 'var(--gris-600)';
    el.style.fontWeight = isActive ? '600' : '400';
  });
  filtrarCorreos();
}

// ═══════════════════════════════════════════════
//  FILTRADO Y RENDERIZADO
// ═══════════════════════════════════════════════
// Mapeo de carpeta IMAP a carpeta local del sidebar
function _carpetaLocal(c) {
  const folder = (c.carpeta || '').toLowerCase();
  if (c.tipo === 'enviado' || folder === 'sent' || folder === 'enviados') return 'sent';
  if (c.tipo === 'borrador' || folder === 'drafts' || folder === 'borradores') return 'drafts';
  if (folder === 'spam' || folder === 'junk') return 'spam';
  if (folder === 'trash' || folder === 'papelera' || folder === 'deleted') return 'trash';
  return 'inbox';
}

function filtrarCorreos() {
  const q = (document.getElementById('mailSearch')?.value || '').toLowerCase();

  correosFiltrados = correos.filter(c => {
    if (_carpetaLocal(c) !== carpetaActual) return false;
    if (q) {
      const txt = [c.asunto, c.de, c.de_nombre, c.para, c.cuerpo_texto].filter(Boolean).join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  renderListaCorreos(correosFiltrados);

  // Contadores por carpeta
  const conteos = { inbox: 0, drafts: 0, sent: 0, spam: 0, trash: 0 };
  correos.forEach(c => { const f = _carpetaLocal(c); if (conteos[f] !== undefined) conteos[f]++; });
  const mapIds = { inbox: 'mailCntInbox', drafts: 'mailCntDrafts', sent: 'mailCntSent', spam: 'mailCntSpam', trash: 'mailCntTrash' };
  Object.keys(mapIds).forEach(k => {
    const el = document.getElementById(mapIds[k]);
    if (el) el.textContent = conteos[k] > 0 ? conteos[k] : '';
  });

  // Badge no leídos en Entrada (dentro del buzón)
  // Badge no leídos: solo correos RECIBIDOS no leídos
  const noLeidos = correos.filter(c => c.tipo === 'recibido' && !c.leido).length;
  const txtBadge = noLeidos > 99 ? '99+' : String(noLeidos);
  // Badge dentro del buzón (Entrada)
  const badgeUnread = document.getElementById('mailBadgeUnread');
  if (badgeUnread) { badgeUnread.textContent = txtBadge; badgeUnread.style.display = noLeidos > 0 ? 'inline' : 'none'; }
  // Badge sidebar principal
  const badgeSidebar = document.getElementById('correo-badge');
  if (badgeSidebar) { badgeSidebar.textContent = txtBadge; badgeSidebar.style.display = noLeidos > 0 ? 'inline' : 'none'; }
  // Badge favorito
  const favBadge = document.getElementById('fav-correo-badge');
  if (favBadge) { favBadge.textContent = txtBadge; favBadge.style.display = noLeidos > 0 ? 'inline-flex' : 'none'; }

  // Barra de estado
  const statusBar = document.getElementById('mailStatusBar');
  if (statusBar) {
    const total = correosFiltrados.length;
    const nombres = { inbox: 'Entrada', drafts: 'Borradores', sent: 'Enviados', spam: 'SPAM', trash: 'Papelera' };
    statusBar.textContent = total > 0
      ? `${nombres[carpetaActual] || carpetaActual} — ${total} mensaje${total !== 1 ? 's' : ''}`
      : `${nombres[carpetaActual] || carpetaActual} — Buzón vacío`;
  }
}

function renderListaCorreos(list) {
  const container = document.getElementById('mailList');
  if (!container) return;

  if (!list.length) {
    const msgs = {
      inbox: 'No hay correos en la bandeja de entrada',
      sent: 'No hay correos enviados',
      drafts: 'No hay borradores'
    };
    container.innerHTML = `<div style="padding:30px 20px;text-align:center;color:var(--gris-400);font-size:13px">
      <div style="font-size:32px;margin-bottom:8px">${carpetaActual === 'inbox' ? '📥' : carpetaActual === 'sent' ? '📤' : '📝'}</div>
      ${msgs[carpetaActual] || 'Sin correos'}
      ${_correoCuentaActiva ? `<br>
        <button class="btn btn-secondary btn-sm" onclick="sincronizarCorreo()" style="margin-top:10px">🔄 Sincronizar ahora</button>
        <button id="btnCargarAntiguos" class="btn btn-ghost btn-sm" onclick="sincronizarCorreo(false, true)" style="margin-top:6px;font-size:11px;color:var(--gris-500)">📥 Descargar todo el buzón</button>` : ''}
    </div>`;
    return;
  }

  // Barra de acciones masivas
  const barraSeleccion = `<div id="mailSelBar" style="display:none;padding:6px 10px;background:var(--azul-light);border-radius:8px;margin-bottom:6px;align-items:center;gap:8px;font-size:12px">
    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--gris-600)"><input type="checkbox" onchange="_toggleSelectAll(this.checked)" style="cursor:pointer"> Todos</label>
    <span id="mailSelCount" style="color:var(--azul);font-weight:600">0 seleccionados</span>
    <span style="flex:1"></span>
    <button class="btn btn-secondary btn-sm" onclick="_marcarSeleccionados(true)" title="Marcar como leídos">✉️ Leídos</button>
    <button class="btn btn-secondary btn-sm" onclick="_marcarSeleccionados(false)" title="Marcar como no leídos">📩 No leídos</button>
    <button class="btn btn-ghost btn-sm" onclick="_limpiarSeleccion()" style="color:var(--gris-500)">✕</button>
  </div>`;

  container.innerHTML = barraSeleccion + list.map(c => {
    const esNoLeido = c.tipo === 'recibido' && !c.leido;
    const esActivo = correoActual && correoActual.id === c.id;
    const esSel = _correosSeleccionados.has(c.id);
    const fecha = c.fecha ? new Date(c.fecha) : null;
    const fechaStr = fecha ? (
      fecha.toDateString() === new Date().toDateString()
        ? fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    ) : '';
    const remitente = c.tipo === 'enviado'
      ? 'Para: ' + (c.para || '—').split(',')[0].split('<')[0].trim()
      : (c.de_nombre || c.de || '—');

    return `<div style="display:flex;align-items:stretch;margin-bottom:2px;border-radius:8px;border-left:3px solid ${esActivo ? 'var(--azul)' : 'transparent'};background:${esSel ? 'var(--azul-light)' : esActivo ? 'var(--azul-light)' : esNoLeido ? 'rgba(59,130,246,.04)' : 'transparent'};transition:background .12s" onmouseenter="if(!${esActivo}&&!${esSel})this.style.background='var(--gris-50)'" onmouseleave="this.style.background='${esSel ? 'var(--azul-light)' : esActivo ? 'var(--azul-light)' : esNoLeido ? 'rgba(59,130,246,.04)' : 'transparent'}'">
      <label style="display:flex;align-items:center;padding:0 4px 0 8px;cursor:pointer" onclick="event.stopPropagation()"><input type="checkbox" ${esSel ? 'checked' : ''} onchange="_toggleCorreoSel(${c.id},this.checked)" style="cursor:pointer;accent-color:var(--azul)"></label>
      <div onclick="abrirCorreo(${c.id})" style="flex:1;padding:10px 12px 10px 6px;cursor:pointer;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
          <span style="font-size:12.5px;font-weight:${esNoLeido ? '700' : '500'};color:var(--gris-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${remitente}</span>
          <span style="font-size:10px;color:var(--gris-400);flex-shrink:0;margin-left:8px">${fechaStr}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          ${esNoLeido ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--azul);flex-shrink:0" title="No leído"></span>' : ''}
          ${c.tiene_adjuntos ? '<span style="font-size:11px" title="Tiene adjuntos">📎</span>' : ''}
          <span style="font-size:12px;font-weight:${esNoLeido ? '600' : '400'};color:var(--gris-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${c.asunto || '(sin asunto)'}</span>
        </div>
        <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">${(c.cuerpo_texto || '').substring(0, 80)}</div>
        ${c.vinculado_tipo ? `<span style="font-size:9px;background:var(--azul-light);color:var(--azul);padding:1px 5px;border-radius:3px;margin-top:3px;display:inline-block">${c.vinculado_tipo} ${c.vinculado_ref || ''}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  // Botón "Cargar más antiguos" al final de la lista (siempre visible si hay cuenta)
  if (_correoCuentaActiva && (carpetaActual === 'inbox' || carpetaActual === 'sent')) {
    container.innerHTML += `<div style="text-align:center;padding:12px">
      <button id="btnCargarAntiguos" class="btn btn-ghost btn-sm" onclick="cargarCorreosAntiguos()" style="font-size:11px;color:var(--gris-500)">📥 Cargar más antiguos</button>
    </div>`;
  }

  _actualizarBarraSeleccion();
}

// ═══════════════════════════════════════════════
//  RENDERIZAR CONTENIDO DEL CORREO (sandboxed)
// ═══════════════════════════════════════════════
function _renderMailContent(c) {
  if (c.cuerpo_html) {
    // Crear iframe vacío; el contenido se escribirá programáticamente
    // Esto aísla el HTML del email del DOM de la app (evita romper estilos/layout)
    setTimeout(() => _writeMailIframe(c.cuerpo_html), 0);
    return `<iframe id="mailIframe" sandbox="allow-same-origin" style="flex:1;border:none;width:100%;min-height:200px"></iframe>`;
  }
  if (c.cuerpo_texto) {
    return `<div style="padding:20px;font-size:13.5px;line-height:1.7;color:var(--gris-700);overflow-y:auto;flex:1">${(c.cuerpo_texto || '').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>')}</div>`;
  }
  return '<div style="padding:20px;color:var(--gris-400);text-align:center">(sin contenido)</div>';
}

function _writeMailIframe(html) {
  const iframe = document.getElementById('mailIframe');
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    // Escribir el HTML completo del email dentro del iframe aislado
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      body{margin:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;line-height:1.7;color:#374151;overflow-x:hidden;word-wrap:break-word}
      img{max-width:100%;height:auto}
      a{color:#2563eb}
      table{max-width:100%!important}
    </style></head><body>${html}</body></html>`);
    doc.close();
    // Auto-resize iframe al contenido
    const resize = () => {
      try {
        const h = doc.documentElement.scrollHeight;
        if (h > 0) iframe.style.height = h + 'px';
      } catch(_){}
    };
    setTimeout(resize, 100);
    setTimeout(resize, 500);
    doc.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', resize);
    });
  } catch(e) { console.warn('Error writing mail iframe:', e); }
}

// ═══════════════════════════════════════════════
//  ABRIR CORREO (con carga bajo demanda del cuerpo)
// ═══════════════════════════════════════════════
async function abrirCorreo(id) {
  const c = correos.find(x => x.id === id);
  if (!c) return;
  correoActual = c;

  // Marcar como leído
  if (c.tipo === 'recibido' && !c.leido) {
    c.leido = true;
    sb.from('correos').update({ leido: true }).eq('id', id);
  }

  renderListaCorreos(correosFiltrados);

  const view = document.getElementById('mailView');
  if (!view) return;

  const fecha = c.fecha ? new Date(c.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  // Mostrar cabecera inmediatamente
  view.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--gris-200);display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:6px">${c.asunto || '(sin asunto)'}</h3>
        <div style="font-size:12px;color:var(--gris-500)">
          ${c.tipo === 'enviado' ? '<b>Para:</b> ' + (c.para || '—') : '<b>De:</b> ' + (c.de_nombre ? c.de_nombre + ' &lt;' + c.de + '&gt;' : c.de || '—')}
          <span style="margin-left:12px">${fecha}</span>
        </div>
        ${c.para && c.tipo !== 'enviado' ? `<div style="font-size:12px;color:var(--gris-400)"><b>Para:</b> ${c.para}</div>` : ''}
        ${c.cc ? `<div style="font-size:12px;color:var(--gris-400)"><b>CC:</b> ${c.cc}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${c.tipo === 'recibido' ? `<button class="btn btn-secondary btn-sm" onclick="responderCorreo(${c.id})">↩️ Responder</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="reenviarCorreo(${c.id})">↪️ Reenviar</button>
        ${c.tipo === 'recibido' ? `<button class="btn btn-ghost btn-sm" onclick="crearReglaDesdeCorreo(${c.id})" title="Crear automatización desde este correo">⚡</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="vincularCorreo(${c.id})" title="Vincular a obra/cliente">🔗</button>
        <button class="btn btn-ghost btn-sm" onclick="eliminarCorreo(${c.id})" style="color:var(--rojo)">🗑️</button>
      </div>
    </div>
    <div id="mailBody" style="flex:1;overflow:hidden;display:flex;flex-direction:column">
      ${c.cuerpo_cacheado
        ? _renderMailContent(c)
        : '<div style="text-align:center;padding:20px;color:var(--gris-400)"><div class="spinner" style="margin:0 auto 8px"></div>Cargando contenido del correo...</div>'
      }
    </div>
    ${_renderAdjuntosBar(c)}
    ${c.vinculado_tipo ? `<div style="padding:8px 20px;border-top:1px solid var(--gris-200);font-size:12px;color:var(--gris-400)">
      🔗 Vinculado a: <b>${c.vinculado_tipo}</b> ${c.vinculado_ref || ''}
    </div>` : ''}`;

  // Si el cuerpo no está cacheado, descargarlo bajo demanda
  if (!c.cuerpo_cacheado && c.tipo === 'recibido') {
    try {
      const { data, error } = await sb.functions.invoke('leer-correo', {
        body: {
          empresa_id: EMPRESA.id,
          correo_id: c.id
        }
      });

      if (error) throw error;

      if (data?.success) {
        c.cuerpo_html = data.cuerpo_html || '';
        c.cuerpo_texto = data.cuerpo_texto || '';
        c.cuerpo_cacheado = true;

        const bodyEl = document.getElementById('mailBody');
        if (bodyEl && correoActual?.id === c.id) {
          bodyEl.innerHTML = _renderMailContent(c);
        }
      }
    } catch(e) {
      const bodyEl = document.getElementById('mailBody');
      if (bodyEl && correoActual?.id === c.id) {
        bodyEl.innerHTML = `<div style="color:var(--rojo);text-align:center;padding:20px">
          ⚠️ No se pudo cargar el contenido del correo<br>
          <span style="font-size:12px;color:var(--gris-400)">${e.message || 'Error de conexión IMAP'}</span><br>
          <button class="btn btn-secondary btn-sm" onclick="abrirCorreo(${c.id})" style="margin-top:8px">🔄 Reintentar</button>
        </div>`;
      }
    }
  }
}

// ─── Barra de adjuntos ───
function _renderAdjuntosBar(c) {
  const adjuntos = c.adjuntos_meta || [];
  if (!adjuntos.length) return '';

  const items = adjuntos.map(a => {
    const tamano = a.tamano > 1048576
      ? (a.tamano / 1048576).toFixed(1) + ' MB'
      : a.tamano > 1024
        ? Math.round(a.tamano / 1024) + ' KB'
        : (a.tamano || '?') + ' B';
    const icono = _iconoAdjunto(a.tipo || a.nombre);
    const descargado = a.descargado;

    return `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--gris-200);border-radius:6px;font-size:12px;cursor:pointer;background:${descargado ? '#f0fdf4' : '#fff'}" onclick="descargarAdjunto(${c.id},'${(a.nombre||'').replace(/'/g,"\\'")}')">
      <span>${icono}</span>
      <span style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.nombre || 'adjunto'}</span>
      <span style="color:var(--gris-400);font-size:10px">${tamano}</span>
      ${descargado ? '<span style="color:#166534">✓</span>' : '<span style="color:var(--azul)">⬇️</span>'}
    </div>`;
  }).join(' ');

  // Detectar si hay nóminas (individual o combinada)
  const tieneNominas = adjuntos.some(a => _esNominaIndividual(a.nombre) || _esNominaCombinada(a.nombre));
  const btnNominas = tieneNominas
    ? ' <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();procesarNominas('+c.id+')" style="margin-left:auto;font-size:11px">💰 Procesar nóminas</button>'
    : '';

  return `<div style="padding:10px 20px;border-top:1px solid var(--gris-200);display:flex;flex-wrap:wrap;gap:6px;align-items:center">
    <span style="font-size:11px;color:var(--gris-500);font-weight:600">📎 ${adjuntos.length} adjunto${adjuntos.length > 1 ? 's' : ''}:</span>
    ${items}
    ${btnNominas}
  </div>`;
}

function _iconoAdjunto(tipoONombre) {
  const t = (tipoONombre || '').toLowerCase();
  if (t.includes('pdf')) return '📄';
  if (t.includes('image') || t.includes('.jpg') || t.includes('.png') || t.includes('.gif')) return '🖼️';
  if (t.includes('word') || t.includes('.doc')) return '📝';
  if (t.includes('excel') || t.includes('sheet') || t.includes('.xls')) return '📊';
  if (t.includes('zip') || t.includes('rar') || t.includes('7z')) return '📦';
  return '📎';
}

// ═══════════════════════════════════════════════
//  DESCARGAR ADJUNTO
// ═══════════════════════════════════════════════
async function descargarAdjunto(correoId, nombre) {
  toast('⬇️ Descargando adjunto...', 'info');

  try {
    const { data, error } = await sb.functions.invoke('leer-correo', {
      body: {
        empresa_id: EMPRESA.id,
        correo_id: correoId,
        descargar_adjunto: nombre
      }
    });

    if (error) throw error;

    if (data?.success && data?.adjunto?.url) {
      // Abrir URL firmada
      window.open(data.adjunto.url, '_blank');
      toast('✅ Adjunto descargado: ' + nombre, 'success');

      // Actualizar metadata local
      const c = correos.find(x => x.id === correoId);
      if (c && c.adjuntos_meta) {
        c.adjuntos_meta = c.adjuntos_meta.map(a =>
          a.nombre === nombre ? { ...a, descargado: true } : a
        );
        // Re-renderizar si sigue siendo el correo activo
        if (correoActual?.id === correoId) {
          abrirCorreo(correoId);
        }
      }
    } else {
      throw new Error(data?.error || 'No se pudo descargar');
    }
  } catch(e) {
    toast('❌ Error descargando adjunto: ' + (e.message || ''), 'error');
  }
}

// ═══════════════════════════════════════════════
//  UTILIDADES PDF — Carga dinámica de librerías
// ═══════════════════════════════════════════════
let _pdfLibsLoaded = false;

async function _cargarLibsPDF() {
  if (_pdfLibsLoaded) return;
  // pdf-lib para split de páginas
  if (!window.PDFLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  // pdf.js para extracción de texto
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  _pdfLibsLoaded = true;
}

// Extraer NIF y periodo de cada página de un PDF combinado
async function _parsearNominasCombinadas(pdfBytes) {
  await _cargarLibsPDF();
  const uint8 = new Uint8Array(pdfBytes);

  // Extraer texto con pdf.js
  const pdfDoc = await pdfjsLib.getDocument({ data: uint8 }).promise;
  const totalPags = pdfDoc.numPages;
  const paginas = [];

  for (let i = 1; i <= totalPags; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();

    // Agrupar items por posición Y para reconstruir filas
    const rows = {};
    content.items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const yKey = Math.round((it.transform?.[5] || 0) / 5) * 5;
      if (!rows[yKey]) rows[yKey] = [];
      rows[yKey].push(it.str.trim());
    });

    // Unir cada fila y luego todo el texto
    const texto = Object.values(rows).map(r => r.join(' ')).join(' ');

    // Buscar NIF: patrón 7-8 dígitos + guión + letra
    const nifMatch = texto.match(/(\d{7,8}-[A-Z])/i);
    // Buscar periodo: DD/MM/YYYY
    const fechas = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/g);
    let mes = null, anio = null;
    if (fechas && fechas.length >= 1) {
      const parts = fechas[0].split('/');
      mes = parts[1]; // MM
      anio = parts[2]; // YYYY
    }

    paginas.push({
      pagina: i,
      dni: nifMatch ? nifMatch[1].toUpperCase() : null,
      mes: mes,
      anio: anio,
      textoCorto: texto.substring(0, 200),
    });
  }

  return paginas;
}

// Extraer una página concreta como PDF independiente
async function _extraerPaginaPDF(pdfBytes, pageIndex) {
  const srcDoc = await PDFLib.PDFDocument.load(pdfBytes);
  const newDoc = await PDFLib.PDFDocument.create();
  const [copiedPage] = await newDoc.copyPages(srcDoc, [pageIndex]);
  newDoc.addPage(copiedPage);
  return await newDoc.save();
}

// Detectar si un adjunto es nómina combinada (YYYY_MM*NOMINAS*.pdf)
function _esNominaCombinada(nombre) {
  return /^\d{4}_\d{2}.*nominas?/i.test(nombre || '');
}

// Detectar si un adjunto es nómina individual (YYYY_MM-DNI.pdf)
function _esNominaIndividual(nombre) {
  return /^\d{4}_\d{2}-[\w-]+\.pdf$/i.test(nombre || '');
}

// ═══════════════════════════════════════════════
//  AUTO-DETECTAR NÓMINAS TRAS SYNC
// ═══════════════════════════════════════════════
let _nominasProcesadas = new Set(); // IDs de correos ya procesados (evitar duplicados)

async function _autoDetectarNominas() {
  const emailGestoria = EMPRESA.config?.email_gestoria;
  if (!emailGestoria) return;

  // Esperar 5s a que la conexión IMAP se libere tras el sync
  await new Promise(r => setTimeout(r, 5000));

  // Buscar correos de la gestoría con adjuntos nómina (individual o combinada)
  const candidatos = correos.filter(c =>
    c.tipo === 'recibido'
    && !_nominasProcesadas.has(c.id)
    && (c.de || '').toLowerCase().includes(emailGestoria.toLowerCase())
    && c.adjuntos_meta?.some(a => _esNominaIndividual(a.nombre) || _esNominaCombinada(a.nombre))
  );

  if (!candidatos.length) return;

  // Cargar empleados con DNI (una sola vez)
  const { data: empleados } = await sb.from('perfiles').select('id, nombre, apellidos, dni').eq('empresa_id', EMPRESA.id).not('dni', 'is', null);
  const empMap = {};
  (empleados || []).forEach(e => { if (e.dni) empMap[e.dni.toUpperCase().replace(/\s/g, '')] = e; });

  if (!Object.keys(empMap).length) {
    console.log('[autoNominas] No hay empleados con DNI configurado, omitiendo');
    candidatos.forEach(c => _nominasProcesadas.add(c.id));
    return;
  }

  for (const c of candidatos) {
    // SIEMPRE marcar como procesado antes de empezar (evita bucle de reintentos)
    _nominasProcesadas.add(c.id);

    // Extraer periodo del primer adjunto para comprobar si ya existe
    const primerAdj = c.adjuntos_meta.find(a => _esNominaIndividual(a.nombre) || _esNominaCombinada(a.nombre));
    const perMatch = (primerAdj?.nombre || '').match(/^(\d{4})_(\d{2})/);
    if (perMatch) {
      const periodo = perMatch[1] + '-' + perMatch[2];
      const { data: existentes } = await sb.from('documentos_empleado')
        .select('id').eq('empresa_id', EMPRESA.id).eq('categoria', 'nomina').eq('periodo', periodo).limit(1);
      if (existentes?.length) continue; // Ya procesadas
    }

    try {
      // Procesar adjuntos
      const individuales = c.adjuntos_meta.filter(a => _esNominaIndividual(a.nombre));
      const combinados = c.adjuntos_meta.filter(a => _esNominaCombinada(a.nombre));

      toast('💰 Nóminas detectadas de la gestoría — procesando...', 'info');

      if (individuales.length) {
        await _procesarNominasIndividuales(c.id, individuales, empMap);
      }
      if (combinados.length) {
        for (const adj of combinados) {
          await _procesarNominaCombinada(c.id, adj, empMap);
        }
      }
    } catch (e) {
      console.warn('[autoNominas] Error procesando correo ' + c.id + ':', e.message);
      // Ya está marcado, no reintentará
    }
  }
}

// ── Procesar nóminas individuales (YYYY_MM-DNI.pdf) ──
async function _procesarNominasIndividuales(correoId, adjuntos, empMap) {
  const regex = /^(\d{4})_(\d{2})-([\w-]+)\.pdf$/i;
  let exitos = 0, errores = 0, sinMatch = [];

  for (const adj of adjuntos) {
    const m = adj.nombre.match(regex);
    if (!m) continue;
    const anio = m[1], mes = m[2], dni = m[3].toUpperCase();
    const emp = empMap[dni];
    if (!emp) { sinMatch.push(dni); continue; }

    try {
      const blob = await _descargarAdjuntoBlob(correoId, adj.nombre);
      await _subirNominaEmpleado(emp, anio, mes, blob, adj.nombre);
      exitos++;
    } catch (e) {
      console.error('[nominasIndiv] Error:', adj.nombre, e);
      errores++;
    }
  }

  if (exitos) toast('✅ ' + exitos + ' nómina' + (exitos > 1 ? 's' : '') + ' archivada' + (exitos > 1 ? 's' : ''), 'success');
  if (sinMatch.length) toast('⚠️ DNI sin empleado: ' + sinMatch.join(', '), 'warning');
  if (errores) toast('❌ ' + errores + ' con error', 'error');
}

// ── Procesar PDF combinado (YYYY_MM NOMINAS_MES.pdf) ──
async function _procesarNominaCombinada(correoId, adj, empMap) {
  try {
    toast('📄 Descargando PDF combinado y separando nóminas...', 'info');

    // 1. Descargar PDF completo
    const blob = await _descargarAdjuntoBlob(correoId, adj.nombre);
    const pdfBytes = await blob.arrayBuffer();

    // 2. Copiar bytes ANTES de parsear: pdf.js detacha el ArrayBuffer original
    const pdfBytesCopia = pdfBytes.slice(0);
    const paginas = await _parsearNominasCombinadas(pdfBytes);
    if (!paginas.length) { toast('No se encontraron nóminas en el PDF', 'error'); return; }

    let exitos = 0, errores = 0, sinMatch = [];

    for (const pag of paginas) {
      if (!pag.dni) { errores++; continue; }
      const emp = empMap[pag.dni];
      if (!emp) { sinMatch.push(pag.dni); continue; }

      const anio = pag.anio || adj.nombre.match(/^(\d{4})/)?.[1];
      const mes = pag.mes || adj.nombre.match(/^\d{4}_(\d{2})/)?.[1];
      if (!anio || !mes) { errores++; continue; }

      try {
        // 3. Extraer página individual como PDF (usar copia, el original está detachado)
        const paginaPDF = await _extraerPaginaPDF(pdfBytesCopia, pag.pagina - 1);
        const pageBlob = new Blob([paginaPDF], { type: 'application/pdf' });

        // 4. Subir y registrar
        await _subirNominaEmpleado(emp, anio, mes, pageBlob, 'nomina_' + anio + '_' + mes + '_' + pag.dni + '.pdf');
        exitos++;
      } catch (e) {
        console.error('[nominasComb] Error pág ' + pag.pagina, e);
        errores++;
      }
    }

    if (exitos) toast('✅ ' + exitos + ' nómina' + (exitos > 1 ? 's' : '') + ' extraída' + (exitos > 1 ? 's' : '') + ' del PDF combinado', 'success');
    if (sinMatch.length) toast('⚠️ DNI sin empleado: ' + sinMatch.join(', '), 'warning');
    if (errores) toast('❌ ' + errores + ' con error', 'error');
  } catch (e) {
    console.error('[nominasComb] Error general:', e);
    toast('❌ Error procesando PDF combinado: ' + (e.message || ''), 'error');
  }
}

// ── Helpers compartidos ──
async function _descargarAdjuntoBlob(correoId, nombre) {
  // 1. Asegurar que el correo está cargado (IMAP necesita leer el email antes de servir adjuntos)
  const correo = correos.find(x => x.id === correoId);
  if (correo && !correo.cuerpo_cacheado) {
    console.log('[descargarBlob] Cargando cuerpo del correo primero...');
    const { data: bodyData } = await sb.functions.invoke('leer-correo', {
      body: { empresa_id: EMPRESA.id, correo_id: correoId }
    });
    if (bodyData?.success) {
      correo.cuerpo_html = bodyData.cuerpo_html || '';
      correo.cuerpo_texto = bodyData.cuerpo_texto || '';
      correo.cuerpo_cacheado = true;
    }
    // Pequeña espera para que IMAP procese
    await new Promise(r => setTimeout(r, 1000));
  }

  // 2. Descargar el adjunto
  const { data, error } = await sb.functions.invoke('leer-correo', {
    body: { empresa_id: EMPRESA.id, correo_id: correoId, descargar_adjunto: nombre }
  });
  if (error) {
    console.error('[descargarBlob] Edge Function error:', error);
    throw new Error('Error en Edge Function: ' + (error.message || JSON.stringify(error)));
  }
  if (!data?.success || !data?.adjunto?.url) {
    console.error('[descargarBlob] Respuesta sin URL:', JSON.stringify(data));
    throw new Error(data?.error || 'El adjunto no devolvió URL de descarga');
  }
  const resp = await fetch(data.adjunto.url);
  if (!resp.ok) throw new Error('Error HTTP ' + resp.status + ' descargando archivo');
  return await resp.blob();
}

async function _subirNominaEmpleado(emp, anio, mes, blob, filename) {
  // Subir al storage
  const storagePath = 'empleados/' + EMPRESA.id + '/' + emp.id + '/nomina_' + anio + '_' + mes + '.pdf';
  const { error: upErr } = await sb.storage.from('documentos').upload(storagePath, blob, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw upErr;
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(storagePath);

  // Comprobar si ya existe
  const periodo = anio + '-' + mes;
  const { data: existente } = await sb.from('documentos_empleado')
    .select('id').eq('empleado_id', emp.id).eq('empresa_id', EMPRESA.id).eq('categoria', 'nomina').eq('periodo', periodo).maybeSingle();

  if (existente) {
    await sb.from('documentos_empleado').update({ url: urlData?.publicUrl, filename, updated_at: new Date().toISOString() }).eq('id', existente.id);
  } else {
    await sb.from('documentos_empleado').insert({
      empresa_id: EMPRESA.id, empleado_id: emp.id, categoria: 'nomina',
      nombre: 'Nómina ' + mes + '/' + anio, filename,
      url: urlData?.publicUrl || null, periodo, created_by: CU.id,
    });
  }
}

// ═══════════════════════════════════════════════
//  PROCESAR NÓMINAS DESDE ADJUNTOS (MANUAL)
// ═══════════════════════════════════════════════
async function procesarNominas(correoId) {
  const c = correos.find(x => x.id === correoId);
  if (!c || !c.adjuntos_meta?.length) { toast('No hay adjuntos', 'error'); return; }

  // Cargar empleados con DNI
  const { data: empleados } = await sb.from('perfiles').select('id, nombre, apellidos, dni').eq('empresa_id', EMPRESA.id).not('dni', 'is', null);
  const empMap = {};
  (empleados || []).forEach(e => { if (e.dni) empMap[e.dni.toUpperCase().replace(/\s/g, '')] = e; });

  // Separar adjuntos por tipo
  const individuales = c.adjuntos_meta.filter(a => _esNominaIndividual(a.nombre));
  const combinados = c.adjuntos_meta.filter(a => _esNominaCombinada(a.nombre));

  if (!individuales.length && !combinados.length) { toast('No se encontraron adjuntos con patrón de nómina', 'error'); return; }

  // Preparar resumen para individuales
  const regexInd = /^(\d{4})_(\d{2})-([\w-]+)\.pdf$/i;
  let resumenItems = [];

  individuales.forEach(a => {
    const m = a.nombre.match(regexInd);
    if (!m) return;
    const dni = m[3].toUpperCase();
    const emp = empMap[dni];
    resumenItems.push({ tipo: 'individual', nombre: a.nombre, anio: m[1], mes: m[2], dni, empleado: emp, match: !!emp });
  });

  // Para combinados, intentar parsear antes de confirmar
  for (const adj of combinados) {
    try {
      toast('📄 Analizando PDF combinado...', 'info');
      const blob = await _descargarAdjuntoBlob(correoId, adj.nombre);
      const pdfBytes = await blob.arrayBuffer();
      // Copiar bytes ANTES de parsear: pdf.js detacha el ArrayBuffer original
      adj._pdfBytes = pdfBytes.slice(0);
      const paginas = await _parsearNominasCombinadas(pdfBytes);
      adj._paginas = paginas;

      paginas.forEach(pag => {
        if (!pag.dni) return;
        const emp = empMap[pag.dni];
        resumenItems.push({ tipo: 'combinado', adj, pagina: pag.pagina, anio: pag.anio, mes: pag.mes, dni: pag.dni, empleado: emp, match: !!emp });
      });
    } catch (e) {
      toast('❌ Error analizando ' + adj.nombre + ': ' + e.message, 'error');
    }
  }

  if (!resumenItems.length) { toast('No se encontraron nóminas válidas', 'error'); return; }

  const conMatch = resumenItems.filter(r => r.match);
  const sinMatch = resumenItems.filter(r => !r.match);

  // Mostrar confirmación
  let msg = '<b>' + conMatch.length + '</b> nóminas identificadas';
  if (sinMatch.length) msg += ', <b style="color:var(--rojo)">' + sinMatch.length + '</b> sin empleado';
  msg += ':<br><br>';
  conMatch.forEach(r => {
    msg += '✅ <b>' + r.anio + '/' + r.mes + '</b> → ' + r.empleado.nombre + ' ' + (r.empleado.apellidos || '') + ' (' + r.dni + ')' + (r.tipo === 'combinado' ? ' <span style="color:var(--gris-400)">[pág ' + r.pagina + ']</span>' : '') + '<br>';
  });
  sinMatch.forEach(r => {
    msg += '❌ <b>' + (r.anio||'?') + '/' + (r.mes||'?') + '</b> → DNI ' + r.dni + ' <span style="color:var(--rojo)">no encontrado</span><br>';
  });

  if (!conMatch.length) { toast('Ningún DNI coincide con empleados registrados. Revisa que los DNI estén cargados en las fichas.', 'error'); return; }

  const ok = await confirmModal({ titulo: '💰 Procesar nóminas', mensaje: msg, btnOk: 'Procesar ' + conMatch.length + ' nóminas', colorOk: '#059669' });
  if (!ok) return;

  let exitos = 0, errores = 0;
  for (const nom of conMatch) {
    try {
      toast('⬇️ Procesando nómina de ' + nom.empleado.nombre + '...', 'info');

      if (nom.tipo === 'individual') {
        const blob = await _descargarAdjuntoBlob(correoId, nom.nombre);
        await _subirNominaEmpleado(nom.empleado, nom.anio, nom.mes, blob, nom.nombre);
      } else {
        // Combinado: extraer página
        const paginaPDF = await _extraerPaginaPDF(nom.adj._pdfBytes, nom.pagina - 1);
        const pageBlob = new Blob([paginaPDF], { type: 'application/pdf' });
        await _subirNominaEmpleado(nom.empleado, nom.anio, nom.mes, pageBlob, 'nomina_' + nom.anio + '_' + nom.mes + '_' + nom.dni + '.pdf');
      }
      exitos++;
    } catch (e) {
      console.error('[procesarNominas]', e);
      errores++;
    }
  }

  if (exitos) toast('✅ ' + exitos + ' nómina' + (exitos > 1 ? 's' : '') + ' procesada' + (exitos > 1 ? 's' : ''), 'success');
  if (errores) toast('⚠️ ' + errores + ' con error', 'error');

  // Marcar adjuntos como descargados
  if (c.adjuntos_meta) {
    c.adjuntos_meta = c.adjuntos_meta.map(a => (_esNominaIndividual(a.nombre) || _esNominaCombinada(a.nombre)) ? { ...a, descargado: true } : a);
    if (correoActual?.id === correoId) abrirCorreo(correoId);
  }
}

// ═══════════════════════════════════════════════
//  VINCULAR CORREO A ENTIDAD
// ═══════════════════════════════════════════════
function vincularCorreo(id) {
  const c = correos.find(x => x.id === id);
  if (!c) return;

  // Preparar datos para buscador
  const _vincItems = [];
  (typeof trabajos !== 'undefined' ? trabajos : []).forEach(t => {
    _vincItems.push({ tipo: 'obra', id: t.id, ref: t.numero || '', label: `🏗️ ${t.numero || ''} — ${t.titulo || t.nombre || ''}` });
  });
  (typeof clientes !== 'undefined' ? clientes : []).forEach(cl => {
    _vincItems.push({ tipo: 'cliente', id: cl.id, ref: cl.nombre || '', label: `👤 ${cl.nombre || ''}` });
  });
  (typeof proveedores !== 'undefined' ? proveedores : []).forEach(p => {
    _vincItems.push({ tipo: 'proveedor', id: p.id, ref: p.nombre || '', label: `🏭 ${p.nombre || ''}` });
  });
  window._vincItems = _vincItems;
  window._vincSeleccion = null;

  const view = document.getElementById('mailView');
  const bodyEl = document.getElementById('mailBody');
  if (!bodyEl && !view) return;

  const target = bodyEl || view;

  target.innerHTML = `
    <div style="padding:20px;text-align:center">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:16px">🔗 Vincular correo a...</h3>
      <div style="position:relative;max-width:460px;margin:0 auto 16px">
        <input id="vincBuscador" type="text" placeholder="🔍 Buscar obra, cliente o proveedor..." oninput="_filtrarVinc()" onfocus="_filtrarVinc()" autocomplete="off"
          style="width:100%;padding:10px 14px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none;box-sizing:border-box">
        <div id="vincResultados" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:220px;overflow-y:auto;background:white;border:1.5px solid var(--gris-200);border-top:none;border-radius:0 0 8px 8px;z-index:100;text-align:left"></div>
      </div>
      <div id="vincSelLabel" style="margin-bottom:14px;font-size:13px;color:var(--gris-400)">Ninguna selección</div>
      <div style="display:flex;justify-content:center;gap:8px">
        <button class="btn btn-ghost" onclick="abrirCorreo(${id})">Cancelar</button>
        <button class="btn btn-primary" onclick="_guardarVinculacion(${id})">✅ Vincular</button>
        ${c.vinculado_tipo ? `<button class="btn btn-secondary" onclick="_desvincularCorreo(${id})">❌ Desvincular</button>` : ''}
      </div>
    </div>`;

  // Cerrar resultados al hacer clic fuera
  setTimeout(() => {
    document.addEventListener('click', _cerrarVincResultados, { once: false });
  }, 100);
}

function _filtrarVinc() {
  const q = (document.getElementById('vincBuscador')?.value || '').toLowerCase();
  const items = window._vincItems || [];
  const filtrados = q ? items.filter(i => i.label.toLowerCase().includes(q) || i.ref.toLowerCase().includes(q)) : items.slice(0, 20);
  const cont = document.getElementById('vincResultados');
  if (!cont) return;
  if (filtrados.length === 0) {
    cont.style.display = 'none';
    return;
  }
  cont.style.display = 'block';
  cont.innerHTML = filtrados.slice(0, 30).map((item, idx) =>
    `<div onclick="_seleccionarVinc(${idx}, '${item.tipo}', '${item.id}', '${(item.ref || '').replace(/'/g, "\\'")}')" style="padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--gris-100);transition:background 0.15s" onmouseover="this.style.background='var(--azul-light)'" onmouseout="this.style.background=''">${item.label}</div>`
  ).join('');
}

function _seleccionarVinc(idx, tipo, id, ref) {
  const items = window._vincItems || [];
  const item = items.find(i => i.tipo === tipo && String(i.id) === String(id));
  window._vincSeleccion = { tipo, id, ref };
  const label = document.getElementById('vincSelLabel');
  if (label) label.innerHTML = `<span style="color:var(--azul);font-weight:600">${item ? item.label : tipo + ' ' + ref}</span>`;
  const input = document.getElementById('vincBuscador');
  if (input) input.value = item ? item.label.replace(/^[^ ]+ /, '') : ref;
  document.getElementById('vincResultados').style.display = 'none';
}

function _cerrarVincResultados(e) {
  const cont = document.getElementById('vincResultados');
  const input = document.getElementById('vincBuscador');
  if (cont && !cont.contains(e.target) && e.target !== input) {
    cont.style.display = 'none';
  }
}

async function _guardarVinculacion(correoId) {
  const selData = window._vincSeleccion;
  if (!selData) { toast('Selecciona una entidad', 'error'); return; }

  const { tipo, id, ref } = selData;
  const { error } = await sb.from('correos')
    .update({ vinculado_tipo: tipo, vinculado_id: id, vinculado_ref: ref })
    .eq('id', correoId);

  if (error) { toast('Error: ' + error.message, 'error'); return; }

  // Actualizar local
  const c = correos.find(x => x.id === correoId);
  if (c) {
    c.vinculado_tipo = tipo;
    c.vinculado_id = id;
    c.vinculado_ref = ref;
  }

  toast('🔗 Correo vinculado a ' + tipo + ' ' + ref, 'success');
  abrirCorreo(correoId);
}

async function _desvincularCorreo(correoId) {
  const { error } = await sb.from('correos')
    .update({ vinculado_tipo: null, vinculado_id: null, vinculado_ref: null })
    .eq('id', correoId);

  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const c = correos.find(x => x.id === correoId);
  if (c) {
    c.vinculado_tipo = null;
    c.vinculado_id = null;
    c.vinculado_ref = null;
  }

  toast('Vinculación eliminada', 'info');
  abrirCorreo(correoId);
}

// ═══════════════════════════════════════════════
//  NUEVO CORREO / RESPONDER / REENVIAR
// ═══════════════════════════════════════════════
async function nuevoCorreo(para, asunto, cuerpo, vinculacion, adjuntos) {
  const view = document.getElementById('mailView');
  if (!view) return;

  // Recordar la página desde la que se abrió el composer (para volver tras enviar)
  const _activa = document.querySelector('.page.active')?.id?.replace('page-','');
  if (_activa && _activa !== 'correo') {
    view.dataset.returnPage = _activa;
    if (typeof obraActualId !== 'undefined' && obraActualId && _activa === 'trabajos') {
      view.dataset.returnObraId = String(obraActualId);
    } else {
      delete view.dataset.returnObraId;
    }
  } else {
    delete view.dataset.returnPage;
    delete view.dataset.returnObraId;
  }

  // Cargar cuenta SMTP si no está cargada todavía (composer abierto desde fuera de Correo)
  if (!_correoCuentaActiva) {
    try { await cargarCuentaCorreoActiva(); } catch(e) {}
  }

  // Poblar selector de contactos
  const clienteOpts = (typeof clientes !== 'undefined' ? clientes : [])
    .filter(c => c.email)
    .map(c => `<option value="${c.email}">${c.nombre} — ${c.email}</option>`)
    .join('');
  const provOpts = (typeof proveedores !== 'undefined' ? proveedores : [])
    .filter(p => p.email || p.email_pedidos)
    .map(p => `<option value="${p.email_pedidos || p.email}">${p.nombre} — ${p.email_pedidos || p.email}</option>`)
    .join('');

  const cuentaInfo = _correoCuentaActiva
    ? `<div style="font-size:11px;color:var(--gris-400);margin-bottom:12px">Enviando desde: <b>${_correoCuentaActiva.nombre_mostrado || _correoCuentaActiva.email}</b> (${_correoCuentaActiva.email})</div>`
    : '<div style="font-size:11px;color:var(--rojo);margin-bottom:12px">⚠️ No hay cuenta SMTP configurada — el correo se abrirá en tu cliente de correo</div>';

  view.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--gris-200)">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">✉️ Nuevo correo</h3>
      ${cuentaInfo}
      <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <label style="width:50px;font-size:12px;font-weight:600;color:var(--gris-500)">Para:</label>
        <input id="mail_para" value="${para || ''}" list="mailContactos" placeholder="email@ejemplo.com" style="flex:1;padding:6px 10px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:13px;outline:none">
        <datalist id="mailContactos">${clienteOpts}${provOpts}</datalist>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <label style="width:50px;font-size:12px;font-weight:600;color:var(--gris-500)">CC:</label>
        <input id="mail_cc" placeholder="(opcional)" style="flex:1;padding:6px 10px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:13px;outline:none">
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <label style="width:50px;font-size:12px;font-weight:600;color:var(--gris-500)">Asunto:</label>
        <input id="mail_asunto" value="${asunto || ''}" placeholder="Asunto del correo" style="flex:1;padding:6px 10px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:13px;outline:none">
      </div>
    </div>
    <div style="flex:1;padding:12px 20px;overflow-y:auto">
      <textarea id="mail_cuerpo" placeholder="Escribe tu mensaje..." style="width:100%;height:100%;min-height:200px;border:none;outline:none;font-size:13.5px;line-height:1.7;resize:none;font-family:var(--font)">${cuerpo || ''}</textarea>
    </div>
    <div style="padding:12px 20px;border-top:1px solid var(--gris-200);display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="guardarBorradorCorreo()">💾 Borrador</button>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="cancelarCorreo()">Cancelar</button>
        <button class="btn btn-primary" onclick="enviarCorreo()" id="btnEnviarCorreo">📤 Enviar</button>
      </div>
    </div>`;

  // Guardar vinculación pendiente si viene de enviar documento
  if (vinculacion) {
    view.dataset.vinculacion = JSON.stringify(vinculacion);
  }

  // Adjuntos pendientes (array de {nombre, base64, tipo_mime})
  if (Array.isArray(adjuntos) && adjuntos.length) {
    view.dataset.adjuntos = JSON.stringify(adjuntos);
    _renderAdjuntosComposer();
  } else {
    delete view.dataset.adjuntos;
  }
}

// Render UI de adjuntos pendientes en el composer
function _renderAdjuntosComposer() {
  const view = document.getElementById('mailView');
  if (!view || !view.dataset.adjuntos) return;
  let adj = [];
  try { adj = JSON.parse(view.dataset.adjuntos); } catch(e) {}
  if (!adj.length) return;
  // Insertar/actualizar bloque encima del textarea
  let bloque = document.getElementById('mailAdjuntos');
  if (!bloque) {
    const cuerpoEl = document.getElementById('mail_cuerpo');
    if (!cuerpoEl) return;
    bloque = document.createElement('div');
    bloque.id = 'mailAdjuntos';
    bloque.style.cssText = 'padding:8px 0;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px dashed var(--gris-200);margin-bottom:8px';
    cuerpoEl.parentNode.insertBefore(bloque, cuerpoEl);
  }
  bloque.innerHTML = adj.map((a,i)=>`
    <div style="display:inline-flex;align-items:center;gap:6px;background:var(--azul-light,#dbeafe);color:var(--azul,#1e40af);padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600">
      📎 ${a.nombre || 'adjunto.pdf'}
      <span style="font-size:10px;opacity:.7">(${Math.round((a.base64?.length||0)*0.75/1024)} KB)</span>
      <button onclick="_quitarAdjuntoComposer(${i})" style="background:none;border:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>
    </div>
  `).join('');
}

function _quitarAdjuntoComposer(idx) {
  const view = document.getElementById('mailView');
  if (!view?.dataset?.adjuntos) return;
  let adj = [];
  try { adj = JSON.parse(view.dataset.adjuntos); } catch(e) {}
  adj.splice(idx, 1);
  if (adj.length) {
    view.dataset.adjuntos = JSON.stringify(adj);
    _renderAdjuntosComposer();
  } else {
    delete view.dataset.adjuntos;
    document.getElementById('mailAdjuntos')?.remove();
  }
}

function responderCorreo(id) {
  const c = correos.find(x => x.id === id);
  if (!c) return;
  const asunto = (c.asunto || '').startsWith('Re: ') ? c.asunto : 'Re: ' + (c.asunto || '');
  const cuerpo = '\n\n—————————————\n' + (c.cuerpo_texto || '');
  nuevoCorreo(c.de || '', asunto, cuerpo);
}

function reenviarCorreo(id) {
  const c = correos.find(x => x.id === id);
  if (!c) return;
  const asunto = (c.asunto || '').startsWith('Fwd: ') ? c.asunto : 'Fwd: ' + (c.asunto || '');
  const cuerpo = '\n\n—————————————\nReenviado de: ' + (c.de || '') + '\n' + (c.cuerpo_texto || '');
  nuevoCorreo('', asunto, cuerpo);
}

// Modal custom para preguntar qué hacer con el correo (estilo ERP)
function _modalCorreoSinEnviar() {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:99999;animation:fadeIn .15s ease-out';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:24px;max-width:420px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:var(--font,'Segoe UI',sans-serif)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:42px;height:42px;border-radius:10px;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:22px">⚠️</div>
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">Correo sin enviar</h3>
        </div>
        <p style="font-size:13.5px;color:#475569;margin:0 0 20px;line-height:1.5">Tienes un correo en el composer que no has enviado todavía. ¿Qué quieres hacer?</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button data-r="borrador" style="width:100%;padding:11px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-size:13.5px;font-weight:700;cursor:pointer">💾 Guardar como borrador</button>
          <button data-r="descartar" style="width:100%;padding:11px;border:1.5px solid #fecaca;border-radius:8px;background:#fff;color:#b91c1c;font-size:13.5px;font-weight:600;cursor:pointer">🗑️ Descartar y salir</button>
          <button data-r="cancelar" style="width:100%;padding:11px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;color:#475569;font-size:13.5px;font-weight:600;cursor:pointer">Volver al correo</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      const r = e.target?.dataset?.r;
      if (r) { ov.remove(); resolve(r); }
      else if (e.target === ov) { ov.remove(); resolve('cancelar'); }
    });
  });
}

async function cancelarCorreo(forzar) {
  const view = document.getElementById('mailView');

  // Si no se fuerza, comprobar si hay contenido y ofrecer guardar como borrador
  if (!forzar && view) {
    const cuerpo = document.getElementById('mail_cuerpo')?.value?.trim() || '';
    const asunto = document.getElementById('mail_asunto')?.value?.trim() || '';
    const para   = document.getElementById('mail_para')?.value?.trim() || '';
    const tieneAdj = !!view.dataset.adjuntos;
    const tieneContenido = cuerpo.length > 0 || asunto.length > 0 || para.length > 0 || tieneAdj;
    if (tieneContenido) {
      const r = await _modalCorreoSinEnviar();
      if (r === 'cancelar') return;
      if (r === 'borrador') {
        try { await guardarBorradorCorreo(); } catch(e) { console.warn(e); }
        return;
      }
      // r === 'descartar' → continuar y limpiar
    }
  }

  correoActual = null;
  if (view) {
    // Capturar página de retorno ANTES de limpiar dataset
    const _retPage = view.dataset.returnPage || null;
    const _retObra = view.dataset.returnObraId ? parseInt(view.dataset.returnObraId) : null;

    delete view.dataset.vinculacion;
    delete view.dataset.adjuntos;
    delete view.dataset.returnPage;
    delete view.dataset.returnObraId;
    view.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--gris-400);font-size:14px">
      <div style="text-align:center"><div style="font-size:48px;margin-bottom:12px">✉️</div><p>Selecciona un correo para leerlo</p></div>
    </div>`;

    // Volver a la página de origen si el correo se abrió desde otro módulo
    if (_retPage && typeof goPage === 'function') {
      goPage(_retPage);
      if (_retObra && typeof abrirFichaObra === 'function') {
        setTimeout(() => abrirFichaObra(_retObra), 250);
      }
    }
  }
}

// ═══════════════════════════════════════════════
//  CONSTRUIR HTML DEL CUERPO DEL EMAIL
// ═══════════════════════════════════════════════

/**
 * Convierte texto plano en HTML con tarjeta profesional para enlaces de documentos.
 * Si el cuerpo contiene un enlace a doc-viewer o doc.html, lo reemplaza por
 * un botón/tarjeta visual en vez de un link suelto.
 */
function _buildCuerpoHtml(cuerpo, vinculacion) {
  if (!cuerpo) return '';

  // Detectar URLs de documentos (doc-viewer, doc.html, f.html, firma.html)
  const urlRegex = /(https?:\/\/[^\s]+(?:doc-viewer\?token=[^\s]+|doc\.html\?t=[^\s]+|f\.html\?t=[^\s]+|firma\.html\?token=[^\s]+))/gi;
  const match = cuerpo.match(urlRegex);

  let html = cuerpo;

  if (match && match[0]) {
    const docUrl = match[0];
    const tipo = vinculacion?.tipo || 'documento';
    const ref = vinculacion?.ref || '';
    const tipoLabel = { factura: 'Factura', presupuesto: 'Presupuesto', presupuesto_aceptado: 'Presupuesto', albaran: 'Albarán', parte_trabajo: 'Parte de trabajo' }[tipo] || 'Documento';
    const logoUrl = (typeof EMPRESA !== 'undefined' && EMPRESA?.logo_url) ? EMPRESA.logo_url : '';
    const empresaNombre = (typeof EMPRESA !== 'undefined' && EMPRESA?.nombre) ? EMPRESA.nombre : '';

    // Datos extra de la vinculación (total, fecha, vencimiento)
    const total = vinculacion?.total || '';
    const fecha = vinculacion?.fecha || '';
    const vencimiento = vinculacion?.vencimiento || '';

    // Quitar del texto: las líneas de importe/vencimiento/enlace (se muestran en la tarjeta)
    html = html.replace(/(?:Pulse el siguiente enlace|Puede revisar el detalle)[^\n]*\n[^\n]*(?:doc-viewer\?token=|doc\.html\?t=|f\.html\?t=|firma\.html\?token=)[^\s]*/i, '__TARJETA_DOC__');
    if (!html.includes('__TARJETA_DOC__')) {
      // Intentar con el patrón ">> enlace"
      html = html.replace(/>> [^\n]*(?:doc-viewer\?token=|doc\.html\?t=|f\.html\?t=|firma\.html\?token=)[^\s]*/i, '__TARJETA_DOC__');
    }
    if (!html.includes('__TARJETA_DOC__')) {
      html = html.replace(docUrl, '__TARJETA_DOC__');
    }
    // Quitar líneas de importe y vencimiento del texto (se muestran en la tarjeta)
    html = html.replace(/\nImporte total:[^\n]*/i, '');
    html = html.replace(/\nFecha de vencimiento:[^\n]*/i, '');
    html = html.replace(/\nVálido hasta:[^\n]*/i, '');

    // Limpiar saltos de línea consecutivos excesivos
    html = html.replace(/\n{3,}/g, '\n\n');

    // Convertir saltos de línea a <br>
    html = html.replace(/\n/g, '<br>');

    // Filas de detalle para la tarjeta
    let detailRows = '';
    if (total) {
      detailRows += `<tr>
        <td style="padding:8px 28px;font-size:12px;color:#888;border-bottom:1px solid #f0f0f0">Importe total</td>
        <td style="padding:8px 28px;font-size:14px;font-weight:700;color:#1a1a1a;text-align:right;border-bottom:1px solid #f0f0f0">${total}</td>
      </tr>`;
    }
    if (fecha) {
      detailRows += `<tr>
        <td style="padding:8px 28px;font-size:12px;color:#888;border-bottom:1px solid #f0f0f0">Fecha</td>
        <td style="padding:8px 28px;font-size:13px;color:#444;text-align:right;border-bottom:1px solid #f0f0f0">${fecha}</td>
      </tr>`;
    }
    if (vencimiento && vencimiento !== '—') {
      detailRows += `<tr>
        <td style="padding:8px 28px;font-size:12px;color:#888;border-bottom:1px solid #f0f0f0">Vencimiento</td>
        <td style="padding:8px 28px;font-size:13px;color:#444;text-align:right;border-bottom:1px solid #f0f0f0">${vencimiento}</td>
      </tr>`;
    }

    const tarjeta = `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0">
        <tr><td align="center">
          <table cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
            <!-- Cabecera con logo y tipo -->
            <tr>
              <td colspan="2" style="background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 100%);padding:24px 28px 20px;text-align:center;border-bottom:1px solid #e2e8f0">
                ${logoUrl ? `<img src="${logoUrl}" alt="${empresaNombre}" style="max-height:44px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto">` : `<div style="font-size:16px;font-weight:700;color:#1e40af;margin-bottom:8px">${empresaNombre}</div>`}
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:6px">${tipoLabel}</div>
                <div style="font-size:26px;font-weight:800;color:#0f172a;letter-spacing:0.5px">${ref}</div>
              </td>
            </tr>
            <!-- Detalles -->
            ${detailRows}
            <!-- Botón -->
            <tr>
              <td colspan="2" style="padding:24px 28px 20px;text-align:center">
                <a href="${docUrl}" target="_blank" style="display:inline-block;background:${tipo === 'presupuesto' ? '#059669' : '#1e40af'};color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;min-width:200px">
                  ${tipo === 'presupuesto' ? 'Revisar y firmar' : 'Ver y descargar'}
                </a>
              </td>
            </tr>
            <!-- Pie -->
            <tr>
              <td colspan="2" style="padding:0 28px 18px;text-align:center">
                <div style="font-size:11px;color:#94a3b8;line-height:1.5">
                  ${tipo === 'presupuesto' ? 'Revise el detalle y firme digitalmente desde este enlace' : 'Puede ver, descargar e imprimir el documento desde este enlace'}
                </div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`;

    html = html.replace('__TARJETA_DOC__', tarjeta);
  } else {
    html = html.replace(/\n/g, '<br>');
  }

  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#374151">' + html + '</div>';
}


// ═══════════════════════════════════════════════
//  ENVIAR CORREO (vía Edge Function SMTP)
// ═══════════════════════════════════════════════
async function enviarCorreo() {
  const para = document.getElementById('mail_para')?.value?.trim();
  const cc = document.getElementById('mail_cc')?.value?.trim();
  const asunto = document.getElementById('mail_asunto')?.value?.trim();
  const cuerpo = document.getElementById('mail_cuerpo')?.value?.trim();

  if (!para) { toast('Introduce un destinatario', 'error'); return; }
  if (!asunto) { toast('Introduce un asunto', 'error'); return; }

  const btn = document.getElementById('btnEnviarCorreo');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Enviando...'; }

  // Obtener vinculación pendiente si existe
  const view = document.getElementById('mailView');
  let vinculacion = null;
  let adjuntos = [];
  try { vinculacion = view?.dataset?.vinculacion ? JSON.parse(view.dataset.vinculacion) : null; } catch(e) {}
  try { adjuntos = view?.dataset?.adjuntos ? JSON.parse(view.dataset.adjuntos) : []; } catch(e) {}

  // Intentar enviar por SMTP vía Edge Function
  if (_correoCuentaActiva) {
    try {
      const { data, error } = await sb.functions.invoke('enviar-correo', {
        body: {
          empresa_id: EMPRESA.id,
          cuenta_correo_id: _correoCuentaActiva.id,
          para,
          cc: cc || undefined,
          asunto,
          cuerpo_texto: cuerpo,
          cuerpo_html: _buildCuerpoHtml(cuerpo, vinculacion),
          vinculado_tipo: vinculacion?.tipo || undefined,
          vinculado_id: vinculacion?.id || undefined,
          vinculado_ref: vinculacion?.ref || undefined,
          adjuntos: adjuntos.length ? adjuntos : undefined
        }
      });

      if (error) throw error;

      if (data?.success) {
        // Capturar página de retorno antes de limpiar el composer
        const _retPage = view?.dataset?.returnPage || null;
        const _retObra = view?.dataset?.returnObraId ? parseInt(view.dataset.returnObraId) : null;
        // Asegurar vinculación en BD (por si la Edge Function no la guarda)
        if (vinculacion?.tipo && vinculacion?.id) {
          try {
            const correoId = data?.correo_id || data?.id;
            if (correoId) {
              await sb.from('correos').update({
                vinculado_tipo: vinculacion.tipo,
                vinculado_id: vinculacion.id,
                vinculado_ref: vinculacion.ref || null
              }).eq('id', correoId);
            } else {
              // Fallback: actualizar el último 'enviado' sin vincular de esta empresa
              const { data: ult } = await sb.from('correos')
                .select('id')
                .eq('empresa_id', EMPRESA.id)
                .eq('tipo', 'enviado')
                .is('vinculado_tipo', null)
                .order('fecha', { ascending: false })
                .limit(1);
              if (ult?.[0]?.id) {
                await sb.from('correos').update({
                  vinculado_tipo: vinculacion.tipo,
                  vinculado_id: vinculacion.id,
                  vinculado_ref: vinculacion.ref || null
                }).eq('id', ult[0].id);
              }
            }
          } catch(e) { console.warn('No se pudo vincular correo:', e); }
        }
        cancelarCorreo(true); // true = forzar sin preguntar borrador
        await loadCorreos();

        // Volver a la página/obra de origen si la había
        if (_retPage) {
          if (typeof goPage === 'function') goPage(_retPage, { _desdeCorreoEnviado: true });
          if (_retObra && typeof abrirFichaObra === 'function') {
            setTimeout(()=>abrirFichaObra(_retObra), 250);
          }
        }

        // Confirmación de envío
        if (vinculacion?.tipo === 'factura') {
          toast(`Factura enviada\n${vinculacion.ref || ''} · ${para}`, 'success', 6000);
        } else {
          toast(`Correo enviado\n${para}`, 'success', 5000);
        }
        return;
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch(e) {
      console.error('Error SMTP:', e);
      toast('⚠️ Error SMTP: ' + (e.message || '') + '. Abriendo cliente de correo...', 'warning');
    }
  }

  // Fallback: guardar en BD + abrir mailto
  try {
    await sb.from('correos').insert({
      empresa_id: EMPRESA.id,
      tipo: 'enviado',
      carpeta: 'sent',
      de: _correoCuentaActiva?.email || EMPRESA.email || CP.nombre,
      para,
      cc: cc || null,
      asunto,
      cuerpo_texto: cuerpo,
      cuerpo_cacheado: true,
      fecha: new Date().toISOString(),
      leido: true,
      usuario_id: CU.id,
      vinculado_tipo: vinculacion?.tipo || null,
      vinculado_id: vinculacion?.id || null,
      vinculado_ref: vinculacion?.ref || null
    });
  } catch(e) { /* tabla puede no existir aún */ }

  const mailtoUrl = `mailto:${para}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  window.open(mailtoUrl);

  toast('📤 Correo preparado — se abrirá tu cliente de correo', 'info');
  cancelarCorreo();
  if (btn) { btn.disabled = false; btn.innerHTML = '📤 Enviar'; }
  await loadCorreos();
}

// ═══════════════════════════════════════════════
//  BORRADORES
// ═══════════════════════════════════════════════
async function guardarBorradorCorreo() {
  const para = document.getElementById('mail_para')?.value?.trim() || '';
  const asunto = document.getElementById('mail_asunto')?.value?.trim() || '';
  const cuerpo = document.getElementById('mail_cuerpo')?.value?.trim() || '';

  try {
    await sb.from('correos').insert({
      empresa_id: EMPRESA.id,
      tipo: 'borrador',
      carpeta: 'drafts',
      de: _correoCuentaActiva?.email || EMPRESA.email || CP.nombre,
      para,
      asunto,
      cuerpo_texto: cuerpo,
      cuerpo_cacheado: true,
      fecha: new Date().toISOString(),
      leido: true,
      usuario_id: CU.id
    });
    toast('💾 Borrador guardado', 'success');
    cancelarCorreo();
    await loadCorreos();
  } catch(e) {
    toast('Error al guardar borrador', 'error');
  }
}

// ═══════════════════════════════════════════════
//  ELIMINAR CORREO
// ═══════════════════════════════════════════════
async function eliminarCorreo(id) {
  const ok = await confirmModal({titulo:'Eliminar correo',mensaje:'¿Eliminar este correo?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!ok) return;
  try {
    await sb.from('correos').delete().eq('id', id);
    correos = correos.filter(c => c.id !== id);
    correoActual = null;
    cancelarCorreo();
    filtrarCorreos();
    toast('Correo eliminado', 'info');
  } catch(e) {
    toast('Error al eliminar', 'error');
  }
}

// ═══════════════════════════════════════════════
//  ENVIAR DOCUMENTO POR EMAIL (facturas, presupuestos, etc.)
//  Llamar desde otros módulos:
//  enviarDocumentoPorEmail({ para, asunto, cuerpo, adjunto: {nombre, base64, tipo_mime}, vinculacion: {tipo, id, ref} })
// ═══════════════════════════════════════════════
async function enviarDocumentoPorEmail(opts) {
  if (!opts || !opts.para) {
    // Si no hay destinatario, abrir composer con los datos pre-rellenados
    nuevoCorreo(opts?.para || '', opts?.asunto || '', opts?.cuerpo || '', opts?.vinculacion || null);
    // Ir a la página de correo
    goPage('correo');
    return;
  }

  if (!_correoCuentaActiva) {
    toast('⚠️ No hay cuenta SMTP configurada. Configúrala en Configuración → Correo', 'error');
    return;
  }

  toast('📤 Enviando ' + (opts.asunto || 'documento') + '...', 'info');

  try {
    const body = {
      empresa_id: EMPRESA.id,
      cuenta_correo_id: _correoCuentaActiva.id,
      para: opts.para,
      cc: opts.cc || undefined,
      asunto: opts.asunto || 'Documento adjunto',
      cuerpo_texto: opts.cuerpo || '',
      cuerpo_html: opts.cuerpo_html || ('<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">' + (opts.cuerpo || '').replace(/\n/g, '<br>') + '</div>'),
      vinculado_tipo: opts.vinculacion?.tipo || undefined,
      vinculado_id: opts.vinculacion?.id || undefined,
      vinculado_ref: opts.vinculacion?.ref || undefined
    };

    // Adjuntar documento
    if (opts.adjunto) {
      body.adjuntos = [opts.adjunto];
    }

    const { data, error } = await sb.functions.invoke('enviar-correo', { body });
    if (error) throw error;

    if (data?.success) {
      toast('📤 Documento enviado por email a ' + opts.para, 'success');
    } else {
      throw new Error(data?.error || 'Error desconocido');
    }
  } catch(e) {
    toast('❌ Error enviando email: ' + (e.message || ''), 'error');
    console.error('enviarDocumentoPorEmail error:', e);
  }
}

// ═══════════════════════════════════════════════
//  SELECCIÓN MÚLTIPLE DE CORREOS
// ═══════════════════════════════════════════════
function _toggleCorreoSel(id, checked) {
  if (checked) _correosSeleccionados.add(id);
  else _correosSeleccionados.delete(id);
  _actualizarBarraSeleccion();
  renderListaCorreos(correosFiltrados);
}

function _toggleSelectAll(checked) {
  _correosSeleccionados.clear();
  if (checked) correosFiltrados.forEach(c => _correosSeleccionados.add(c.id));
  _actualizarBarraSeleccion();
  renderListaCorreos(correosFiltrados);
}

function _limpiarSeleccion() {
  _correosSeleccionados.clear();
  _actualizarBarraSeleccion();
  renderListaCorreos(correosFiltrados);
}

function _actualizarBarraSeleccion() {
  const bar = document.getElementById('mailSelBar');
  const cnt = document.getElementById('mailSelCount');
  if (!bar) return;
  const n = _correosSeleccionados.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  if (cnt) cnt.textContent = n + ' seleccionado' + (n !== 1 ? 's' : '');
}

async function _marcarSeleccionados(comoLeido) {
  if (_correosSeleccionados.size === 0) return;
  const ids = [..._correosSeleccionados];
  // Actualizar en BD
  const { error } = await sb.from('correos').update({ leido: comoLeido }).in('id', ids);
  if (error) { toast('❌ Error actualizando correos', 'error'); return; }
  // Actualizar en memoria
  correos.forEach(c => { if (ids.includes(c.id)) c.leido = comoLeido; });
  _correosSeleccionados.clear();
  filtrarCorreos();
  toast(`✅ ${ids.length} correo${ids.length !== 1 ? 's' : ''} marcado${ids.length !== 1 ? 's' : ''} como ${comoLeido ? 'leídos' : 'no leídos'}`, 'success');
}

// ── Popup de confirmación de envío de factura ──
function _mostrarPopupEnvioFactura(ref, destinatario) {
  const existing = document.getElementById('_popupFacturaEnviada');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = '_popupFacturaEnviada';
  popup.style.cssText = [
    'position:fixed;bottom:24px;right:24px;z-index:9999',
    'background:#fff;border-radius:16px;padding:20px 24px',
    'box-shadow:0 8px 32px rgba(0,0,0,.18);border-left:4px solid #10B981',
    'max-width:340px;display:flex;flex-direction:column;gap:8px',
    'animation:_slideIn .25s ease'
  ].join(';');

  const style = document.createElement('style');
  style.textContent = '@keyframes _slideIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);

  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:24px">📤</span>
      <div>
        <div style="font-weight:800;font-size:14px;color:#065F46">Factura enviada</div>
        <div style="font-size:12px;color:#6B7280;margin-top:2px">${ref ? ref + ' · ' : ''}${destinatario || ''}</div>
      </div>
      <button onclick="this.closest('#_popupFacturaEnviada').remove()"
        style="margin-left:auto;background:none;border:none;font-size:18px;cursor:pointer;color:#9CA3AF;line-height:1">✕</button>
    </div>
    <div style="font-size:12px;color:#374151">
      El correo ha salido del servidor correctamente.
    </div>
  `;

  document.body.appendChild(popup);
  // Cierre automático a los 6 segundos
  setTimeout(() => { popup.style.transition = 'opacity .4s'; popup.style.opacity = '0'; setTimeout(() => popup.remove(), 400); }, 6000);
}
