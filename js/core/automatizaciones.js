/**
 * MÓDULO AUTOMATIZACIONES + BANDEJA DE ENTRADA
 * Sistema de reglas configurables para procesar correos entrantes
 * y cola de tareas pendientes de revisión/ejecución.
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let _automatizaciones = [];

// Sonido de notificación (Web Audio API — sin archivos externos)
function _sonarNotificacion() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Tono 1: nota aguda corta
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.value = 880; // La5
    g1.gain.setValueAtTime(0.3, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    o1.connect(g1); g1.connect(ctx.destination);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.15);
    // Tono 2: nota más aguda (intervalo de quinta)
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.value = 1318; // Mi6
    g2.gain.setValueAtTime(0.3, ctx.currentTime + 0.18);
    g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    o2.connect(g2); g2.connect(ctx.destination);
    o2.start(ctx.currentTime + 0.18);
    o2.stop(ctx.currentTime + 0.4);
    // Limpiar
    setTimeout(() => ctx.close(), 500);
  } catch(_) {}
}
let _bandejaItems = [];
let _bandejaFiltrados = [];

// Acciones disponibles con su etiqueta y icono
const ACCIONES_AUTO = {
  crear_factura_prov:   { label: 'Crear factura de proveedor', ico: '📑', color: '#7C3AED' },
  crear_albaran_prov:   { label: 'Crear albarán de proveedor', ico: '📥', color: '#2563EB' },
  crear_pedido_compra:  { label: 'Crear pedido de compra', ico: '🛒', color: '#0891B2' },
  procesar_nominas:     { label: 'Procesar nóminas', ico: '💰', color: '#059669' },
  crear_cliente:        { label: 'Crear cliente', ico: '👤', color: '#D97706' },
  crear_tarea:          { label: 'Crear tarea', ico: '✅', color: '#DC2626' },
  archivar_documento:   { label: 'Archivar documento', ico: '📂', color: '#64748B' },
  personalizada:        { label: 'Acción personalizada', ico: '⚙️', color: '#374151' },
};

const ESTADOS_BANDEJA = {
  pendiente:  { label: 'Pendiente', ico: '🟡', color: '#D97706' },
  aprobado:   { label: 'Aprobado', ico: '🔵', color: '#2563EB' },
  completado: { label: 'Completado', ico: '🟢', color: '#059669' },
  rechazado:  { label: 'Rechazado', ico: '🔴', color: '#DC2626' },
  error:      { label: 'Error', ico: '⚠️', color: '#DC2626' },
};

// ═══════════════════════════════════════════════
//  MAPA correo_id → entradas de bandeja
//  Permite marcar correos en la lista/vista cuando
//  ya han sido procesados por una automatización.
// ═══════════════════════════════════════════════
let _bandejaCorreoMap = new Map(); // correo_id → [{id, estado, tipo, titulo}, ...]

// Estilo visual para marcar correos según el estado agregado de su bandeja
// color = color principal de la cinta y borde
// bg    = color de fondo tintado de la caja del correo
// label = texto largo (banner del detalle)
// cinta = texto de la cinta superior en la lista (CORTO, MAYÚSCULAS)
const BANDEJA_VISUAL_CORREO = {
  pendiente:  { ico: '⚡', color: '#D97706', bg: '#FEF3E0', label: 'Automatización pendiente de revisión',  cinta: '⚡ AUTOMATIZACIÓN PENDIENTE DE REVISIÓN' },
  aprobado:   { ico: '⚡', color: '#2563EB', bg: '#DBEAFE', label: 'Automatización en ejecución',           cinta: '⚡ AUTOMATIZACIÓN EN EJECUCIÓN' },
  error:      { ico: '⚠️', color: '#DC2626', bg: '#FEE2E2', label: 'Error al ejecutar automatización',      cinta: '⚠️ ERROR EN AUTOMATIZACIÓN' },
  completado: { ico: '✓',  color: '#059669', bg: '#D1FAE5', label: 'Automatización completada',             cinta: '✓ AUTOMATIZACIÓN COMPLETADA' },
  rechazado:  { ico: '✗',  color: '#6B7280', bg: '#F3F4F6', label: 'Automatización descartada',             cinta: '✗ AUTOMATIZACIÓN DESCARTADA' },
};

// Prioridad de estado cuando un mismo correo tiene varias entradas de bandeja
const _BANDEJA_PRIORIDAD = ['error', 'pendiente', 'aprobado', 'completado', 'rechazado'];

async function cargarMapaBandejaCorreos() {
  try {
    const { data } = await sb.from('bandeja_entrada')
      .select('id, correo_id, estado, tipo, titulo')
      .eq('empresa_id', EMPRESA.id)
      .not('correo_id', 'is', null);
    _bandejaCorreoMap = new Map();
    for (const item of (data || [])) {
      if (!item.correo_id) continue;
      const arr = _bandejaCorreoMap.get(item.correo_id) || [];
      arr.push(item);
      _bandejaCorreoMap.set(item.correo_id, arr);
    }
  } catch (e) { console.warn('[bandejaMap]', e); }
}

// Comprueba si ya existe alguna regla activa cuyo condicion_remitente
// matchea con el remitente de este correo (mismo algoritmo que _correoCoincideRegla)
function correoTieneReglaParaRemitente(correo) {
  if (!correo) return false;
  const rem = (correo.de || correo.remitente || '').toLowerCase();
  if (!rem) return false;
  return (_automatizaciones || []).some(a =>
    a.activa &&
    a.condicion_remitente &&
    rem.includes(a.condicion_remitente.trim().toLowerCase())
  );
}

// Devuelve { estado, items, visual } para un correo con bandeja, o null
function getBandejaEstadoCorreo(correoId) {
  const items = _bandejaCorreoMap?.get(correoId);
  if (!items || !items.length) return null;
  let estado = items[0].estado;
  for (const e of _BANDEJA_PRIORIDAD) {
    if (items.some(i => i.estado === e)) { estado = e; break; }
  }
  const visual = BANDEJA_VISUAL_CORREO[estado];
  if (!visual) return null; // p.ej. solo rechazadas → no marcar
  return { estado, items, visual };
}

// Aplica un cambio Realtime al mapa correo→bandeja sin volver a consultar BD
function _aplicarCambioRealtimeMapaCorreos(payload) {
  try {
    const ev = payload?.eventType;
    const oldRow = payload?.old || {};
    const newRow = payload?.new || {};
    // Quitar la entrada antigua si cambió el correo_id, el estado o se borró
    const correoIdViejo = oldRow.correo_id;
    if (correoIdViejo) {
      const arr = _bandejaCorreoMap.get(correoIdViejo) || [];
      const filtrado = arr.filter(x => x.id !== oldRow.id);
      if (filtrado.length) _bandejaCorreoMap.set(correoIdViejo, filtrado);
      else _bandejaCorreoMap.delete(correoIdViejo);
    }
    // Añadir/actualizar la entrada nueva
    if (ev !== 'DELETE' && newRow.correo_id) {
      const arr = _bandejaCorreoMap.get(newRow.correo_id) || [];
      // Reemplazar si ya existía
      const idx = arr.findIndex(x => x.id === newRow.id);
      const entrada = { id: newRow.id, correo_id: newRow.correo_id, estado: newRow.estado, tipo: newRow.tipo, titulo: newRow.titulo };
      if (idx >= 0) arr[idx] = entrada; else arr.push(entrada);
      _bandejaCorreoMap.set(newRow.correo_id, arr);
    }
  } catch (e) { console.warn('[bandejaMap RT]', e); }
}

// Refresca el mapa y, si la pestaña Correo está visible, vuelve a renderizar la lista
async function refrescarMarcasCorreoTrasBandeja() {
  await cargarMapaBandejaCorreos();
  const pageCorreo = document.getElementById('page-correo');
  if (pageCorreo && pageCorreo.style.display !== 'none' && typeof renderListaCorreos === 'function' && Array.isArray(window.correosFiltrados || correosFiltrados)) {
    try { renderListaCorreos(correosFiltrados); } catch(_) {}
    // Si hay correo abierto, refrescar también su cabecera por si apareció/desapareció el banner
    if (typeof correoActual !== 'undefined' && correoActual?.id && typeof abrirCorreo === 'function') {
      try { abrirCorreo(correoActual.id); } catch(_) {}
    }
  }
}

// ═══════════════════════════════════════════════
//  CARGA DE AUTOMATIZACIONES (Config)
// ═══════════════════════════════════════════════
async function cargarAutomatizaciones() {
  const { data, error } = await sb.from('automatizaciones')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error cargando automatizaciones:', error); return; }
  _automatizaciones = data || [];
  // Si la pestaña Correo está visible, refrescar la lista para mostrar/ocultar
  // la cinta CTA "+ Crear automatización" según el conjunto de reglas actuales.
  try {
    const pageCorreo = document.getElementById('page-correo');
    if (pageCorreo && pageCorreo.style.display !== 'none' && typeof renderListaCorreos === 'function' && typeof correosFiltrados !== 'undefined') {
      renderListaCorreos(correosFiltrados);
    }
  } catch(_) {}
}

function renderAutomatizaciones() {
  const cont = document.getElementById('listaAutomatizaciones');
  if (!cont) return;

  if (!_automatizaciones.length) {
    cont.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--gris-400)">
      <div style="font-size:40px;margin-bottom:12px">⚡</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">No hay automatizaciones</div>
      <div style="font-size:12px">Crea tu primera regla para empezar a procesar correos automáticamente</div>
    </div>`;
    return;
  }

  // Agrupar por tipo de acción
  const grupos = {};
  _automatizaciones.forEach(a => {
    const key = a.accion || 'personalizada';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(a);
  });

  let html = '';
  Object.entries(grupos).forEach(([accionKey, reglas]) => {
    const acc = ACCIONES_AUTO[accionKey] || ACCIONES_AUTO.personalizada;
    // Cabecera de grupo
    html += `<div style="margin-top:16px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
      <div style="width:30px;height:30px;border-radius:8px;background:${acc.color}15;display:flex;align-items:center;justify-content:center;font-size:16px">${acc.ico}</div>
      <span style="font-weight:700;font-size:13px;color:var(--gris-700)">${acc.label}</span>
      <span style="font-size:11px;color:var(--gris-400);font-weight:500">${reglas.length} regla${reglas.length > 1 ? 's' : ''}</span>
      <div style="flex:1;height:1px;background:var(--gris-200)"></div>
    </div>`;

    // Reglas del grupo
    html += `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">`;
    reglas.forEach(a => {
      const modoLabel = a.modo === 'automatico' ? '⚡ Auto' : '👁️ Manual';
      const modoColor = a.modo === 'automatico' ? '#059669' : '#D97706';
      const condiciones = [];
      if (a.condicion_remitente) condiciones.push('De: ' + a.condicion_remitente);
      if (a.condicion_asunto) condiciones.push('Asunto: ' + a.condicion_asunto);
      if (a.condicion_adjunto) condiciones.push('Adj: ' + a.condicion_adjunto);
      if (a.condicion_cuerpo) condiciones.push('Cuerpo: ' + a.condicion_cuerpo);

      html += `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;border:1px solid var(--gris-200);background:#fff;margin-left:20px;transition:all .15s">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
            <span style="font-weight:600;font-size:13px">${a.nombre}</span>
            <span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:${modoColor}15;color:${modoColor}">${modoLabel}</span>
            ${!a.activa ? '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:#ef444415;color:#ef4444">Off</span>' : ''}
          </div>
          ${condiciones.length ? `<div style="font-size:10px;color:var(--gris-400)">${condiciones.join(' · ')}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button onclick="lanzarRetroactiva(${a.id})" class="btn btn-secondary btn-sm" style="padding:4px 8px;font-size:10px" title="Ejecutar retroactiva">🔄</button>
          <button onclick="editarAutomatizacion(${a.id})" class="btn btn-secondary btn-sm" style="padding:4px 8px;font-size:10px">✏️</button>
          <button onclick="toggleAutomatizacion(${a.id})" class="btn btn-secondary btn-sm" style="padding:4px 8px;font-size:10px">${a.activa ? '⏸️' : '▶️'}</button>
          <button onclick="eliminarAutomatizacion(${a.id})" class="btn btn-secondary btn-sm" style="padding:4px 8px;font-size:10px;color:#ef4444">🗑️</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  });

  cont.innerHTML = html;
}

// ═══════════════════════════════════════════════
//  CREAR REGLA DESDE CORREO
// ═══════════════════════════════════════════════
let _rcCorreoId = null;

function crearReglaDesdeCorreo(correoId) {
  const c = correos.find(x => x.id === correoId);
  if (!c) return;
  _rcCorreoId = correoId;

  // Extraer datos del correo
  const remitente = c.de || c.remitente || '';
  const dominio = remitente.match(/@([\w.-]+)/)?.[1] || '';
  const asunto = c.asunto || '';
  const adjuntos = c.adjuntos_meta || [];
  const extensiones = [...new Set(adjuntos.map(a => {
    const ext = (a.nombre || '').split('.').pop()?.toLowerCase();
    return ext ? '.' + ext : null;
  }).filter(Boolean))];

  // Renderizar datos detectados con checkboxes
  let datosHtml = '';
  if (dominio) {
    datosHtml += `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--gris-200);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px">
      <input type="checkbox" id="rc_usar_remitente" checked value="${dominio}">
      <span style="color:var(--gris-500);font-size:11px;min-width:70px">Remitente:</span>
      <span style="font-weight:600">${dominio}</span>
    </label>`;
  }
  if (asunto) {
    datosHtml += `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--gris-200);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px">
      <input type="checkbox" id="rc_usar_asunto" value="${asunto.replace(/"/g, '&quot;')}">
      <span style="color:var(--gris-500);font-size:11px;min-width:70px">Asunto:</span>
      <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${asunto}</span>
    </label>`;
  }
  if (extensiones.length) {
    datosHtml += `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--gris-200);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px">
      <input type="checkbox" id="rc_usar_adjunto" checked value="${extensiones.join(', ')}">
      <span style="color:var(--gris-500);font-size:11px;min-width:70px">Adjuntos:</span>
      <span style="font-weight:600">${extensiones.join(', ')} (${adjuntos.length} archivo${adjuntos.length > 1 ? 's' : ''})</span>
    </label>`;
  }
  document.getElementById('rcDatosCorreo').innerHTML = datosHtml;

  // Renderizar destino: elegir tipo de acción (siempre crea regla nueva)
  let destinoHtml = `<div style="font-size:11px;color:var(--gris-400);margin-bottom:8px;font-weight:600">Tipo de automatización:</div>`;
  Object.entries(ACCIONES_AUTO).forEach(([key, acc], i) => {
    const checked = i === 0 ? 'checked' : '';
    // Contar reglas existentes de este tipo
    const nReglas = _automatizaciones.filter(a => a.accion === key).length;
    const badge = nReglas ? `<span style="font-size:9px;color:var(--gris-400);font-weight:500">${nReglas} regla${nReglas > 1 ? 's' : ''}</span>` : '';
    destinoHtml += `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--gris-200);border-radius:8px;margin-bottom:4px;cursor:pointer;font-size:12px;transition:all .15s" onmouseenter="this.style.borderColor='var(--azul)'" onmouseleave="this.style.borderColor='var(--gris-200)'">
        <input type="radio" name="rc_destino" value="${key}" ${checked}>
        <span style="font-size:16px">${acc.ico}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${acc.label}</div>
        </div>
        ${badge}
      </label>`;
  });
  document.getElementById('rcDestino').innerHTML = destinoHtml;

  openModal('mReglaCorreo');
}

async function aplicarReglaDesdeCorreo() {
  // Recoger datos seleccionados
  const usarRemitente = document.getElementById('rc_usar_remitente')?.checked ? document.getElementById('rc_usar_remitente').value : null;
  const usarAsunto = document.getElementById('rc_usar_asunto')?.checked ? document.getElementById('rc_usar_asunto').value : null;
  const usarAdjunto = document.getElementById('rc_usar_adjunto')?.checked ? document.getElementById('rc_usar_adjunto').value : null;

  if (!usarRemitente && !usarAsunto && !usarAdjunto) {
    toast('Selecciona al menos un dato del correo', 'error');
    return;
  }

  const tipoAccion = document.querySelector('input[name="rc_destino"]:checked')?.value;
  if (!tipoAccion) return;

  closeModal('mReglaCorreo');

  // Siempre crear regla nueva con el tipo de acción seleccionado
  _autoEditId = null;
  const dominio = usarRemitente || '';
  const accLabel = (ACCIONES_AUTO[tipoAccion] || {}).label || 'Regla';

  setTimeout(() => {
    document.getElementById('mAutoTit').textContent = 'Nueva regla · ' + accLabel;
    document.getElementById('btnGuardarAuto').textContent = '💾 Crear regla';
    ['auto_id','auto_nombre','auto_desc','auto_remitente','auto_asunto','auto_adjunto','auto_cuerpo'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('auto_nombre').value = dominio ? dominio : 'Nueva regla';
    if (usarRemitente) document.getElementById('auto_remitente').value = usarRemitente;
    if (usarAsunto) document.getElementById('auto_asunto').value = usarAsunto;
    if (usarAdjunto) document.getElementById('auto_adjunto').value = usarAdjunto;
    document.getElementById('auto_accion').value = tipoAccion;
    document.getElementById('auto_modo').value = 'manual';
    openModal('mAutomatizacion', true);
  }, 200);
}

// ═══════════════════════════════════════════════
//  CRUD AUTOMATIZACIONES
// ═══════════════════════════════════════════════
let _autoEditId = null;

function nuevaAutomatizacion() {
  _autoEditId = null;
  document.getElementById('mAutoTit').textContent = 'Nueva automatización';
  document.getElementById('btnGuardarAuto').textContent = '💾 Crear regla';
  ['auto_id','auto_nombre','auto_desc','auto_remitente','auto_asunto','auto_adjunto','auto_cuerpo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('auto_accion').value = 'crear_factura_prov';
  document.getElementById('auto_modo').value = 'manual';
  openModal('mAutomatizacion');
}

function editarAutomatizacion(id) {
  const a = _automatizaciones.find(x => x.id === id);
  if (!a) return;
  _autoEditId = a.id;
  document.getElementById('mAutoTit').textContent = 'Editar automatización';
  document.getElementById('btnGuardarAuto').textContent = '💾 Guardar cambios';
  document.getElementById('auto_nombre').value = a.nombre || '';
  document.getElementById('auto_desc').value = a.descripcion || '';
  document.getElementById('auto_remitente').value = a.condicion_remitente || '';
  document.getElementById('auto_asunto').value = a.condicion_asunto || '';
  document.getElementById('auto_adjunto').value = a.condicion_adjunto || '';
  document.getElementById('auto_cuerpo').value = a.condicion_cuerpo || '';
  document.getElementById('auto_accion').value = a.accion || 'crear_factura_prov';
  document.getElementById('auto_modo').value = a.modo || 'manual';
  openModal('mAutomatizacion', true);
}

async function guardarAutomatizacion() {
  const nombre = v('auto_nombre');
  if (!nombre) { toast('Introduce un nombre para la regla', 'error'); return; }

  const obj = {
    empresa_id: EMPRESA.id,
    nombre,
    descripcion: v('auto_desc') || null,
    condicion_remitente: v('auto_remitente') || null,
    condicion_asunto: v('auto_asunto') || null,
    condicion_adjunto: v('auto_adjunto') || null,
    condicion_cuerpo: v('auto_cuerpo') || null,
    accion: v('auto_accion'),
    modo: v('auto_modo'),
  };

  if (_autoEditId) {
    const { error } = await sb.from('automatizaciones').update(obj).eq('id', _autoEditId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Automatización actualizada ✓', 'success');
  } else {
    obj.creado_por = CU.id;
    const { error } = await sb.from('automatizaciones').insert(obj);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Automatización creada ✓', 'success');
  }

  closeModal('mAutomatizacion');
  await cargarAutomatizaciones();
  renderAutomatizaciones();
}

async function toggleAutomatizacion(id) {
  const a = _automatizaciones.find(x => x.id === id);
  if (!a) return;
  await sb.from('automatizaciones').update({ activa: !a.activa }).eq('id', id);
  toast(a.activa ? 'Automatización desactivada' : 'Automatización activada ✓', 'success');
  await cargarAutomatizaciones();
  renderAutomatizaciones();
}

async function eliminarAutomatizacion(id) {
  const ok = await confirmModal({ titulo: '🗑️ Eliminar automatización', mensaje: '¿Seguro que quieres eliminar esta regla? Las tareas ya creadas en la bandeja no se borrarán.', btnOk: 'Eliminar', colorOk: '#ef4444' });
  if (!ok) return;
  await sb.from('automatizaciones').delete().eq('id', id);
  toast('Automatización eliminada', 'success');
  await cargarAutomatizaciones();
  renderAutomatizaciones();
}

// ═══════════════════════════════════════════════
//  BANDEJA DE ENTRADA
// ═══════════════════════════════════════════════
let _bandejaAutoRefresh = null;

async function loadBandeja() {
  await cargarBandejaItems();
  _poblarFiltroTipos();
  filtrarBandeja();
  // Pre-cargar adjuntos de los primeros items pendientes en background
  _precacheAdjuntosBandeja();
  // Auto-refresh de la bandeja cada 2 min mientras esté visible
  _iniciarBandejaAutoRefresh();
}

function _iniciarBandejaAutoRefresh() {
  if (_bandejaAutoRefresh) clearInterval(_bandejaAutoRefresh);
  _bandejaAutoRefresh = setInterval(async () => {
    // Solo refrescar si la bandeja está visible
    if (document.getElementById('page-bandeja')?.style.display === 'none') return;
    await cargarBandejaItems();
    filtrarBandeja();
    actualizarBadgeBandeja();
  }, 5 * 60 * 1000); // cada 5 minutos (optimizado Disk IO)
}

async function cargarBandejaItems() {
  const { data, error } = await sb.from('bandeja_entrada')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error cargando bandeja:', error); return; }
  _bandejaItems = data || [];
  // Reconstruir mapa correo→bandeja a partir de los items completos
  _bandejaCorreoMap = new Map();
  for (const item of _bandejaItems) {
    if (!item.correo_id) continue;
    const arr = _bandejaCorreoMap.get(item.correo_id) || [];
    arr.push({ id: item.id, correo_id: item.correo_id, estado: item.estado, tipo: item.tipo, titulo: item.titulo });
    _bandejaCorreoMap.set(item.correo_id, arr);
  }
}

function _poblarFiltroTipos() {
  const sel = document.getElementById('bandejaFiltroTipo');
  if (!sel) return;
  const valorActual = sel.value;
  // Recoger tipos únicos que existen en los items
  const tiposEnUso = [...new Set(_bandejaItems.map(b => b.tipo).filter(Boolean))];
  let html = '<option value="todos">Todos los tipos</option>';
  tiposEnUso.forEach(tipo => {
    const acc = ACCIONES_AUTO[tipo] || ACCIONES_AUTO.personalizada;
    const n = _bandejaItems.filter(b => b.tipo === tipo).length;
    html += `<option value="${tipo}">${acc.ico} ${acc.label} (${n})</option>`;
  });
  sel.innerHTML = html;
  if (valorActual && tiposEnUso.includes(valorActual)) sel.value = valorActual;
}

function filtrarBandeja() {
  const filtroEstado = document.getElementById('bandejaFiltroEstado')?.value || 'pendiente';
  const filtroTipo = document.getElementById('bandejaFiltroTipo')?.value || 'todos';

  _bandejaFiltrados = _bandejaItems.filter(b => {
    if (filtroEstado !== 'todos' && b.estado !== filtroEstado) return false;
    if (filtroTipo !== 'todos' && b.tipo !== filtroTipo) return false;
    return true;
  });
  renderBandeja();
}

function renderBandeja() {
  const cont = document.getElementById('bandejaLista');
  if (!cont) return;

  if (!_bandejaFiltrados.length) {
    const filtro = document.getElementById('bandejaFiltroEstado')?.value || 'pendiente';
    const msgs = {
      pendiente: 'No hay tareas pendientes',
      todos: 'La bandeja está vacía',
      completado: 'No hay tareas completadas',
      rechazado: 'No hay tareas rechazadas',
      error: 'No hay tareas con error',
    };
    cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--gris-400)">
      <div style="font-size:48px;margin-bottom:12px">📥</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">${msgs[filtro] || msgs.todos}</div>
      <div style="font-size:12px">Las reglas de automatización crearán tareas aquí al detectar correos, documentos o partes</div>
    </div>`;
    return;
  }

  cont.innerHTML = _bandejaFiltrados.map(b => {
    const acc = ACCIONES_AUTO[b.tipo] || ACCIONES_AUTO.personalizada;
    const est = ESTADOS_BANDEJA[b.estado] || ESTADOS_BANDEJA.pendiente;
    const fecha = b.created_at ? new Date(b.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const datos = b.datos_extraidos || {};
    const adjuntos = b.adjuntos || [];
    const nAdj = adjuntos.length;

    return `<div onclick="previsualizarTarea(${b.id})" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:10px;border:1px solid var(--gris-200);background:#fff;transition:all .15s;cursor:pointer" onmouseenter="this.style.borderColor='var(--azul)';this.style.boxShadow='0 2px 8px rgba(0,0,0,.06)'" onmouseleave="this.style.borderColor='var(--gris-200)';this.style.boxShadow='none'">
      <div style="width:42px;height:42px;border-radius:10px;background:${acc.color}12;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${acc.ico}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.titulo}</span>
          <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${est.color}15;color:${est.color};flex-shrink:0">${est.ico} ${est.label}</span>
        </div>
        ${b.descripcion ? `<div style="font-size:11px;color:var(--gris-500);margin-bottom:2px">${b.descripcion}</div>` : ''}
        <div style="font-size:10px;color:var(--gris-400)">${fecha} · ${acc.label}${nAdj ? ` · 📎 ${nAdj} adjunto${nAdj > 1 ? 's' : ''}` : ''}</div>
        ${b.estado === 'error' && b.resultado_error ? `<div style="font-size:10px;color:#ef4444;margin-top:2px">⚠️ ${b.resultado_error}</div>` : ''}
      </div>
      <div style="flex-shrink:0;color:var(--gris-400);font-size:16px">›</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
//  ACCIONES DE BANDEJA
// ═══════════════════════════════════════════════
async function ejecutarBandeja(id) {
  const item = _bandejaItems.find(x => x.id === id);
  if (!item) return;

  const esReintento = item.estado === 'error';
  const acc = ACCIONES_AUTO[item.tipo] || ACCIONES_AUTO.personalizada;
  const errorPrevio = esReintento && item.resultado_error ? `<div style="font-size:11px;color:#ef4444;margin-top:6px;padding:6px 8px;background:#fef2f2;border-radius:4px">Error anterior: ${item.resultado_error}</div>` : '';
  const ok = await confirmModal({
    titulo: `${acc.ico} ${esReintento ? 'Reintentar' : acc.label}`,
    mensaje: `<b>${item.titulo}</b><br><br>¿${esReintento ? 'Reintentar' : 'Ejecutar'} esta acción?${errorPrevio}<br><div style="font-size:11px;color:var(--gris-500)">Se creará el registro correspondiente en el ERP.</div>`,
    btnOk: esReintento ? '🔄 Reintentar' : 'Ejecutar',
    colorOk: '#059669',
  });
  if (!ok) return;

  try {
    // Marcar como aprobado (limpiar error anterior si es reintento)
    await sb.from('bandeja_entrada').update({
      estado: 'aprobado',
      resultado_error: null,
      ejecutado_por: CU.id,
      ejecutado_at: new Date().toISOString(),
    }).eq('id', id);

    // Ejecutar acción según tipo
    const resultado = await _ejecutarAccionBandeja(item);

    // Marcar como completado
    await sb.from('bandeja_entrada').update({
      estado: 'completado',
      resultado_tipo: resultado.tipo,
      resultado_id: resultado.id,
    }).eq('id', id);

    // Marcar correo como leído
    if (item.correo_id) {
      await sb.from('correos').update({ leido: true }).eq('id', item.correo_id);
    }

    toast(`${acc.ico} ${acc.label} completado ✓`, 'success');
  } catch (e) {
    console.error('[ejecutarBandeja]', e);
    await sb.from('bandeja_entrada').update({
      estado: 'error',
      resultado_error: e.message,
    }).eq('id', id);
    toast('Error al ejecutar: ' + e.message, 'error');
  }

  await cargarBandejaItems();
  filtrarBandeja();
  actualizarBadgeBandeja();
}

async function rechazarBandeja(id) {
  await sb.from('bandeja_entrada').update({
    estado: 'rechazado',
    ejecutado_por: CU.id,
    ejecutado_at: new Date().toISOString(),
  }).eq('id', id);
  toast('Tarea descartada', 'info');
  await cargarBandejaItems();
  filtrarBandeja();
  actualizarBadgeBandeja();
}

function verResultadoBandeja(id) {
  const item = _bandejaItems.find(x => x.id === id);
  if (!item || !item.resultado_id) return;

  // Navegar al registro creado según el tipo
  const nav = {
    factura_proveedor: 'facturas-proveedor',
    albaran_proveedor: 'albaranes-proveedor',
    pedido_compra: 'pedidos-compra',
    cliente: 'clientes',
    tarea: 'mistareas',
  };
  const page = nav[item.resultado_tipo];
  if (page) goPage(page);
}

// ═══════════════════════════════════════════════
//  EJECUTOR DE ACCIONES — Envía al flujo OCR
// ═══════════════════════════════════════════════

// Tipos que se procesan vía OCR (documentos con adjunto PDF)
const _TIPOS_OCR = ['crear_factura_prov', 'crear_albaran_prov', 'crear_pedido_compra', 'archivar_documento'];

async function _ejecutarAccionBandeja(item) {
  const datos = item.datos_extraidos || {};
  const adjuntos = item.adjuntos || [];

  // ── Documentos → Flujo OCR ──
  if (_TIPOS_OCR.includes(item.tipo)) {
    return await _enviarAdjuntoAOCR(item, adjuntos, datos);
  }

  // ── Nóminas → Procesador de nóminas existente ──
  if (item.tipo === 'procesar_nominas') {
    if (item.correo_id && typeof procesarNominas === 'function') {
      await procesarNominas(item.correo_id);
      return { tipo: 'nominas', id: String(item.correo_id) };
    }
    throw new Error('No se pudo lanzar el procesador de nóminas');
  }

  // ── Otros tipos: marcar como completado manualmente ──
  return { tipo: item.tipo, id: 'manual' };
}

/**
 * Descarga el primer adjunto PDF del correo, lo sube a storage
 * y crea un registro en documentos_ocr para procesarlo con IA.
 */
async function _enviarAdjuntoAOCR(item, adjuntos, datos) {
  // Buscar primer PDF entre los adjuntos
  const adjPdf = adjuntos.find(a => (a.nombre || '').toLowerCase().endsWith('.pdf'));
  if (!adjPdf) {
    throw new Error('No se encontró adjunto PDF en esta tarea. Sube el documento manualmente desde la Bandeja OCR.');
  }

  // 1. Descargar el adjunto vía Edge Function
  toast('⬇️ Descargando adjunto...', 'info');
  const { data: dlData, error: dlErr } = await sb.functions.invoke('leer-correo', {
    body: {
      empresa_id: EMPRESA.id,
      correo_id: item.correo_id,
      descargar_adjunto: adjPdf.nombre
    }
  });
  if (dlErr || !dlData?.success || !dlData?.adjunto?.url) {
    throw new Error('No se pudo descargar el adjunto: ' + (dlData?.error || dlErr?.message || 'Error desconocido'));
  }

  // 2. Descargar el blob desde la URL firmada
  toast('📤 Subiendo a OCR...', 'info');
  const response = await fetch(dlData.adjunto.url);
  if (!response.ok) throw new Error('Error descargando PDF (HTTP ' + response.status + ')');
  const blob = await response.blob();

  // 3. Subir a storage
  const eid = EMPRESA.id;
  const ts = Date.now();
  const storagePath = `${eid}/ocr/inbox_${ts}_${Math.random().toString(36).substr(2, 6)}.pdf`;
  const { error: upErr } = await sb.storage.from('documentos').upload(storagePath, blob, {
    contentType: 'application/pdf'
  });
  if (upErr) throw new Error('Error subiendo a storage: ' + upErr.message);

  // 4. Crear registro en documentos_ocr
  const tipoDoc = item.tipo === 'crear_albaran_prov' ? 'albaran' : 'factura';
  const { data: docData, error: insErr } = await sb.from('documentos_ocr').insert({
    empresa_id: eid,
    usuario_id: CU?.id || null,
    archivo_path: storagePath,
    archivo_nombre: adjPdf.nombre,
    estado: 'pendiente',
    tipo_documento: tipoDoc,
    datos_extraidos: null,
    created_at: new Date().toISOString()
  }).select().single();
  if (insErr || !docData) throw new Error('Error creando documento OCR: ' + (insErr?.message || ''));

  // 5. Navegar a la Bandeja OCR y abrir el procesado IA
  toast('🤖 Abriendo en OCR...', 'info');
  goPage('ocr');
  setTimeout(() => {
    if (typeof ocrGestionar === 'function') ocrGestionar(docData.id);
  }, 500);

  return { tipo: 'documento_ocr', id: String(docData.id) };
}

// ═══════════════════════════════════════════════
//  BADGE DE BANDEJA
// ═══════════════════════════════════════════════
async function actualizarBadgeBandeja() {
  try {
    const { count } = await sb.from('bandeja_entrada')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', EMPRESA.id)
      .eq('estado', 'pendiente');
    const n = count || 0;
    const txt = n > 99 ? '99+' : String(n);
    // Badge del sidebar (si existe)
    const badge = document.getElementById('bandeja-badge');
    if (badge) {
      badge.textContent = txt;
      badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
    // Badge del topbar
    const tbBadge = document.getElementById('bandejaBadge');
    if (tbBadge) {
      tbBadge.textContent = txt;
      tbBadge.style.display = n > 0 ? '' : 'none';
    }
  } catch (_) {}
}

// ═══════════════════════════════════════════════
//  MOTOR DE DETECCIÓN — Evaluar reglas contra correos
// ═══════════════════════════════════════════════
async function evaluarAutomatizaciones(correosNuevos) {
  if (!_automatizaciones.length) await cargarAutomatizaciones();
  const activas = _automatizaciones.filter(a => a.activa);
  if (!activas.length || !correosNuevos.length) return;

  // Pre-cargar entradas existentes para evitar N queries de duplicados
  const { data: existentes } = await sb.from('bandeja_entrada')
    .select('correo_id, automatizacion_id')
    .eq('empresa_id', EMPRESA.id);
  const yaExiste = new Set((existentes || []).map(e => e.correo_id + '_' + e.automatizacion_id));

  let creados = 0;
  for (const correo of correosNuevos) {
    for (const regla of activas) {
      const key = correo.id + '_' + regla.id;
      if (yaExiste.has(key)) continue; // ya procesado, skip sin query
      if (_correoCoincideRegla(correo, regla)) {
        await _crearEntradaBandeja(correo, regla, true); // skipCheck=true
        yaExiste.add(key);
        creados++;
      }
    }
  }

  if (creados > 0) {
    console.log(`[Automatizaciones] ${creados} nuevas entradas creadas`);
    toast(`📬 ${creados} nuevo${creados > 1 ? 's' : ''} en bandeja de entrada`, 'success');
    _sonarNotificacion();
    window._ultimaNotifBandeja = Date.now(); // evitar duplicar con Realtime
    actualizarBadgeBandeja();
    // Si estamos viendo la bandeja, recargar items para mostrar los nuevos
    if (document.getElementById('page-bandeja')?.style.display !== 'none') {
      await cargarBandejaItems();
      filtrarBandeja();
    }
  }
}

function _correoCoincideRegla(correo, regla) {
  // Cada condición se evalúa con AND (las vacías se ignoran)
  // Cada regla es específica: un remitente, un patrón de asunto, etc.
  if (regla.condicion_remitente) {
    const rem = (correo.de || correo.remitente || '').toLowerCase();
    if (!rem.includes(regla.condicion_remitente.trim().toLowerCase())) return false;
  }
  if (regla.condicion_asunto) {
    const asunto = (correo.asunto || '').toLowerCase();
    if (!asunto.includes(regla.condicion_asunto.trim().toLowerCase())) return false;
  }
  if (regla.condicion_adjunto) {
    const adjuntos = correo.adjuntos_meta || [];
    const patron = regla.condicion_adjunto.trim().toLowerCase();
    const tieneAdj = adjuntos.some(a => (a.nombre || '').toLowerCase().includes(patron));
    if (!tieneAdj) return false;
  }
  if (regla.condicion_cuerpo) {
    const cuerpo = (correo.texto_plano || correo.cuerpo || '').toLowerCase();
    if (!cuerpo.includes(regla.condicion_cuerpo.trim().toLowerCase())) return false;
  }
  return true;
}

async function _crearEntradaBandeja(correo, regla, skipCheck = false) {
  // Verificar que no existe ya una entrada para este correo + regla
  if (!skipCheck) {
    const { count } = await sb.from('bandeja_entrada')
      .select('id', { count: 'exact', head: true })
      .eq('correo_id', correo.id)
      .eq('automatizacion_id', regla.id);
    if (count > 0) return; // Ya procesado
  }

  const acc = ACCIONES_AUTO[regla.accion] || ACCIONES_AUTO.personalizada;
  const adjuntos = correo.adjuntos_meta || [];
  const remitente = correo.de || correo.remitente || 'Desconocido';

  // Extraer datos básicos del correo
  const datos_extraidos = {
    remitente,
    asunto: correo.asunto || '',
    fecha_correo: correo.fecha,
    adjuntos_nombres: adjuntos.map(a => a.nombre),
  };

  const titulo = `${acc.ico} ${regla.nombre}: ${correo.asunto || 'Sin asunto'}`;

  if (regla.modo === 'automatico') {
    // Modo automático: crear entrada y ejecutar directamente
    const { data: entrada } = await sb.from('bandeja_entrada').insert({
      empresa_id: EMPRESA.id,
      automatizacion_id: regla.id,
      correo_id: correo.id,
      tipo: regla.accion,
      titulo,
      descripcion: `De: ${remitente}`,
      datos_extraidos,
      adjuntos: adjuntos,
      estado: 'aprobado',
    }).select().single();

    if (entrada) {
      try {
        const resultado = await _ejecutarAccionBandeja(entrada);
        await sb.from('bandeja_entrada').update({
          estado: 'completado',
          resultado_tipo: resultado.tipo,
          resultado_id: resultado.id,
        }).eq('id', entrada.id);
        // Marcar correo como leído tras ejecución automática exitosa
        await sb.from('correos').update({ leido: true }).eq('id', correo.id);
      } catch (e) {
        await sb.from('bandeja_entrada').update({
          estado: 'error',
          resultado_error: e.message,
        }).eq('id', entrada.id);
      }
    }
  } else {
    // Modo manual: crear entrada pendiente de revisión
    await sb.from('bandeja_entrada').insert({
      empresa_id: EMPRESA.id,
      automatizacion_id: regla.id,
      correo_id: correo.id,
      tipo: regla.accion,
      titulo,
      descripcion: `De: ${remitente}`,
      datos_extraidos,
      adjuntos: adjuntos,
      estado: 'pendiente',
    });
  }
}

// ═══════════════════════════════════════════════
//  EJECUCIÓN RETROACTIVA
// ═══════════════════════════════════════════════
let _retroReglaId = null;

function lanzarRetroactiva(id) {
  const regla = _automatizaciones.find(x => x.id === id);
  if (!regla) return;
  _retroReglaId = id;

  document.getElementById('retroNombreRegla').textContent = regla.nombre;
  // Defaults: desde hace 3 meses, hasta hoy
  const hoy = new Date().toISOString().split('T')[0];
  const hace3m = new Date();
  hace3m.setMonth(hace3m.getMonth() - 3);
  document.getElementById('retro_desde').value = hace3m.toISOString().split('T')[0];
  document.getElementById('retro_hasta').value = hoy;
  document.getElementById('retroResultado').style.display = 'none';
  document.getElementById('btnEjecutarRetro').disabled = false;
  document.getElementById('btnEjecutarRetro').textContent = '🔄 Ejecutar';
  openModal('mRetroactiva');
}

async function ejecutarRetroactiva() {
  const regla = _automatizaciones.find(x => x.id === _retroReglaId);
  if (!regla) return;

  const desde = document.getElementById('retro_desde').value;
  const hasta = document.getElementById('retro_hasta').value;
  if (!desde || !hasta) { toast('Selecciona ambas fechas', 'error'); return; }
  if (desde > hasta) { toast('La fecha "desde" no puede ser posterior a "hasta"', 'error'); return; }

  const btn = document.getElementById('btnEjecutarRetro');
  const resDiv = document.getElementById('retroResultado');
  btn.disabled = true;
  btn.textContent = '⏳ Buscando correos...';
  resDiv.style.display = 'none';

  try {
    // Consultar correos en el rango de fechas
    const hastaFin = hasta + 'T23:59:59';
    const { data: correosRango, error } = await sb.from('correos')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .gte('fecha', desde)
      .lte('fecha', hastaFin)
      .order('fecha', { ascending: false });

    if (error) throw error;

    if (!correosRango || !correosRango.length) {
      resDiv.style.display = 'block';
      resDiv.style.background = '#FEF3C7';
      resDiv.style.color = '#92400E';
      resDiv.innerHTML = 'No se encontraron correos en ese rango de fechas.';
      btn.disabled = false;
      btn.textContent = '🔄 Ejecutar';
      return;
    }

    btn.textContent = `⏳ Evaluando ${correosRango.length} correos...`;

    // Evaluar la regla contra cada correo
    let coincidencias = 0;
    let yaExistentes = 0;
    let creados = 0;

    for (const correo of correosRango) {
      if (_correoCoincideRegla(correo, regla)) {
        coincidencias++;
        // Verificar que no exista ya entrada para este correo + regla
        const { count } = await sb.from('bandeja_entrada')
          .select('id', { count: 'exact', head: true })
          .eq('correo_id', correo.id)
          .eq('automatizacion_id', regla.id);
        if (count > 0) {
          yaExistentes++;
          continue;
        }
        // Crear entrada en bandeja
        await _crearEntradaBandeja(correo, regla);
        creados++;
      }
    }

    // Mostrar resultado
    resDiv.style.display = 'block';
    if (creados > 0) {
      resDiv.style.background = '#D1FAE5';
      resDiv.style.color = '#065F46';
      resDiv.innerHTML = `<b>${correosRango.length}</b> correos analizados<br><b>${coincidencias}</b> coincidencias encontradas<br><b>${creados}</b> tareas creadas en la bandeja${yaExistentes ? `<br><span style="color:#92400E">${yaExistentes} ya existían</span>` : ''}`;
      actualizarBadgeBandeja();
      toast(`${creados} tarea${creados > 1 ? 's' : ''} creada${creados > 1 ? 's' : ''} en la bandeja`, 'success');
    } else if (coincidencias > 0 && yaExistentes === coincidencias) {
      resDiv.style.background = '#FEF3C7';
      resDiv.style.color = '#92400E';
      resDiv.innerHTML = `${coincidencias} correos coinciden pero ya tienen entradas en la bandeja.`;
    } else {
      resDiv.style.background = '#FEF3C7';
      resDiv.style.color = '#92400E';
      resDiv.innerHTML = `${correosRango.length} correos analizados, ninguno coincide con las condiciones de esta regla.`;
    }
  } catch (e) {
    console.error('[ejecutarRetroactiva]', e);
    resDiv.style.display = 'block';
    resDiv.style.background = '#FEE2E2';
    resDiv.style.color = '#991B1B';
    resDiv.innerHTML = 'Error: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = '🔄 Ejecutar';
}

// ═══════════════════════════════════════════════
//  WIDGET DASHBOARD
// ═══════════════════════════════════════════════
async function renderDashBandeja() {
  const card = document.getElementById('dash-bandeja');
  const cont = document.getElementById('d-bandeja-list');
  const countEl = document.getElementById('d-bandeja-count');
  if (!card || !cont) return;

  const { data } = await sb.from('bandeja_entrada')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(5);

  const items = data || [];
  // Guardar en _bandejaItems para que previsualizarTarea funcione desde dashboard
  if (!_bandejaItems.length) _bandejaItems = items;
  else items.forEach(it => { if (!_bandejaItems.find(x => x.id === it.id)) _bandejaItems.push(it); });

  if (!items.length) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';
  if (countEl) countEl.textContent = items.length + ' pendiente' + (items.length > 1 ? 's' : '');

  cont.innerHTML = items.map(b => {
    const acc = ACCIONES_AUTO[b.tipo] || ACCIONES_AUTO.personalizada;
    const fecha = b.created_at ? new Date(b.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--gris-200);margin-bottom:6px;cursor:pointer;transition:background .15s" onclick="previsualizarTarea(${b.id})">
      <span style="font-size:16px">${acc.ico}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.titulo}</div>
        <div style="font-size:10px;color:var(--gris-400)">${fecha}</div>
      </div>
      <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:#D9770615;color:#D97706">Pendiente</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
//  PREVISUALIZACIÓN DE TAREA
// ═══════════════════════════════════════════════
let _previsTareaId = null;

function previsualizarTarea(id) {
  const item = _bandejaItems.find(x => x.id === id);
  if (!item) return;
  _previsTareaId = id;

  const acc = ACCIONES_AUTO[item.tipo] || ACCIONES_AUTO.personalizada;
  const est = ESTADOS_BANDEJA[item.estado] || ESTADOS_BANDEJA.pendiente;
  const datos = item.datos_extraidos || {};
  const adjuntos = item.adjuntos || [];

  // Cabecera
  document.getElementById('ptIco').textContent = acc.ico;
  document.getElementById('ptTitulo').textContent = item.titulo || 'Tarea';
  document.getElementById('ptAccionLabel').textContent = acc.label;
  document.getElementById('ptEstadoBadge').textContent = est.ico + ' ' + est.label;
  document.getElementById('ptEstadoBadge').style.background = est.color + '15';
  document.getElementById('ptEstadoBadge').style.color = est.color;

  // Info correo
  document.getElementById('ptRemitente').textContent = datos.remitente || item.descripcion || '';
  document.getElementById('ptAsunto').textContent = datos.asunto || '';
  const fecha = item.created_at ? new Date(item.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  document.getElementById('ptFecha').textContent = fecha;

  // Adjuntos
  const adjCont = document.getElementById('ptAdjuntos');
  const adjLista = document.getElementById('ptAdjuntosLista');

  // Reset preview ANTES de auto-preview (evitar ocultar iframe tras cache hit)
  document.getElementById('ptPreviewFrame').style.display = 'none';
  document.getElementById('ptPreviewImg').style.display = 'none';
  document.getElementById('ptPreviewPlaceholder').style.display = adjuntos.length ? '' : 'block';
  if (!adjuntos.length) {
    document.getElementById('ptPreviewPlaceholder').innerHTML = `<div style="font-size:32px;margin-bottom:8px">📭</div><div style="font-size:12px">Esta tarea no tiene adjuntos</div>`;
  } else {
    document.getElementById('ptPreviewPlaceholder').innerHTML = `<div style="font-size:32px;margin-bottom:8px">📄</div><div style="font-size:12px">Cargando previsualización...</div>`;
  }

  if (adjuntos.length) {
    adjCont.style.display = 'block';
    adjLista.innerHTML = adjuntos.map((a, i) => {
      const nombre = a.nombre || 'adjunto';
      const esPdf = nombre.toLowerCase().endsWith('.pdf');
      const esImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(nombre);
      const tamano = a.tamano > 1048576 ? (a.tamano / 1048576).toFixed(1) + ' MB' : a.tamano > 1024 ? Math.round(a.tamano / 1024) + ' KB' : (a.tamano || '?') + ' B';
      const icono = esPdf ? '📄' : esImg ? '🖼️' : '📎';
      return `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();previewAdjuntoTarea(${id},${i})" style="padding:5px 10px;font-size:11px;display:flex;align-items:center;gap:4px">
        ${icono} ${nombre} <span style="color:var(--gris-400);font-size:9px">${tamano}</span>
      </button>`;
    }).join('');

    // Auto-preview primer PDF (DESPUÉS del reset para que no se oculte)
    const primerPdf = adjuntos.findIndex(a => (a.nombre || '').toLowerCase().endsWith('.pdf'));
    if (primerPdf >= 0) {
      previewAdjuntoTarea(id, primerPdf);
    }
  } else {
    adjCont.style.display = 'none';
  }

  // Botones según estado
  const puedeEjecutar = item.estado === 'pendiente' || item.estado === 'error';
  document.getElementById('ptBtnEjecutar').style.display = puedeEjecutar ? '' : 'none';
  document.getElementById('ptBtnEjecutar').textContent = item.estado === 'error' ? '🔄 Reintentar' : '✅ Ejecutar';
  document.getElementById('ptBtnDescartar').style.display = puedeEjecutar ? '' : 'none';

  openModal('mPrevisTarea');
}

// Cache de URLs de adjuntos ya descargados (en memoria)
const _adjuntoCache = {};
let _precacheEnCurso = false;

async function _precacheAdjuntosBandeja() {
  if (_precacheEnCurso) return;
  _precacheEnCurso = true;
  try {
    // Coger los items pendientes que tengan adjuntos
    const pendientes = _bandejaItems
      .filter(b => b.estado === 'pendiente' && b.adjuntos?.length && b.correo_id)
      .slice(0, 10); // máx 10 para no saturar

    for (const item of pendientes) {
      const adjuntos = item.adjuntos || [];
      for (let i = 0; i < adjuntos.length; i++) {
        const cacheKey = item.id + '_' + i;
        if (_adjuntoCache[cacheKey]) continue; // ya cacheado

        const adj = adjuntos[i];
        const storagePath = `${EMPRESA.id}/inbox/adj_${item.id}_${i}_${adj.nombre.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        // Comprobar si ya está en Storage
        const { data: urlStored } = sb.storage.from('documentos').getPublicUrl(storagePath);
        if (urlStored?.publicUrl) {
          try {
            const head = await fetch(urlStored.publicUrl, { method: 'HEAD' });
            if (head.ok) { _adjuntoCache[cacheKey] = urlStored.publicUrl; continue; }
          } catch(_) {}
        }

        // No está en Storage → descargar y guardar (en serie para no saturar)
        try {
          const { data, error } = await sb.functions.invoke('leer-correo', {
            body: { empresa_id: EMPRESA.id, correo_id: item.correo_id, descargar_adjunto: adj.nombre }
          });
          if (!error && data?.success && data?.adjunto?.url) {
            _adjuntoCache[cacheKey] = data.adjunto.url;
            _guardarAdjuntoEnStorage(data.adjunto.url, storagePath).catch(() => {});
          }
        } catch(_) {}
      }
    }
  } catch(e) { console.warn('[precache]', e); }
  _precacheEnCurso = false;
}

let _previewActualUrl = ''; // URL actualmente cargada en el iframe

async function previewAdjuntoTarea(tareaId, adjIdx) {
  const item = _bandejaItems.find(x => x.id === tareaId);
  if (!item) return;
  const adjuntos = item.adjuntos || [];
  const adj = adjuntos[adjIdx];
  if (!adj) return;

  const nombre = (adj.nombre || '').toLowerCase();
  const esPdf = nombre.endsWith('.pdf');
  const esImg = /\.(jpg|jpeg|png|gif|webp)$/.test(nombre);

  const placeholder = document.getElementById('ptPreviewPlaceholder');
  const frame = document.getElementById('ptPreviewFrame');
  const img = document.getElementById('ptPreviewImg');
  const cacheKey = tareaId + '_' + adjIdx;

  // Si ya tenemos la URL cacheada, mostrar directamente sin resetear
  if (_adjuntoCache[cacheKey]) {
    _mostrarAdjunto(_adjuntoCache[cacheKey], esPdf, esImg, adj.nombre, frame, img, placeholder);
    return;
  }

  // Resetear solo si no hay cache
  frame.style.display = 'none';
  img.style.display = 'none';
  placeholder.style.display = '';
  placeholder.innerHTML = `<div style="font-size:24px;margin-bottom:8px">⏳</div><div style="font-size:12px">Descargando ${adj.nombre}...</div>`;

  try {
    let url;

    // 1. Comprobar si ya está en Storage (timeout corto para no bloquear)
    const storagePath = `${EMPRESA.id}/inbox/adj_${tareaId}_${adjIdx}_${adj.nombre.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data: urlStored } = sb.storage.from('documentos').getPublicUrl(storagePath);
    if (urlStored?.publicUrl) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000); // 3s max
        const head = await fetch(urlStored.publicUrl, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(tid);
        if (head.ok) url = urlStored.publicUrl;
      } catch(_) {}
    }

    // 2. Si no está en Storage, descargar desde correo
    if (!url) {
      const { data, error } = await sb.functions.invoke('leer-correo', {
        body: { empresa_id: EMPRESA.id, correo_id: item.correo_id, descargar_adjunto: adj.nombre }
      });
      if (error) throw error;
      if (!data?.success || !data?.adjunto?.url) throw new Error(data?.error || 'No se pudo obtener el adjunto');
      url = data.adjunto.url;
      // Guardar en Storage en background
      _guardarAdjuntoEnStorage(url, storagePath).catch(() => {});
    }

    _adjuntoCache[cacheKey] = url;
    _mostrarAdjunto(url, esPdf, esImg, adj.nombre, frame, img, placeholder);
  } catch (e) {
    placeholder.innerHTML = `<div style="font-size:32px;margin-bottom:8px">⚠️</div><div style="font-size:12px;color:#ef4444">Error: ${e.message}</div>`;
  }
}

function _mostrarAdjunto(url, esPdf, esImg, nombre, frame, img, placeholder) {
  if (esPdf) {
    // Recargar si URL cambió O si iframe estaba oculto (pudo perder contenido)
    const estabaOculto = frame.style.display === 'none';
    if (_previewActualUrl !== url || estabaOculto) {
      frame.src = url;
      _previewActualUrl = url;
    }
    frame.style.display = 'block';
    img.style.display = 'none';
    placeholder.style.display = 'none';
  } else if (esImg) {
    if (img.src !== url) img.src = url;
    img.style.display = 'block';
    frame.style.display = 'none';
    placeholder.style.display = 'none';
  } else {
    frame.style.display = 'none';
    img.style.display = 'none';
    placeholder.style.display = '';
    placeholder.innerHTML = `<div style="font-size:32px;margin-bottom:8px">📎</div>
      <div style="font-size:12px;margin-bottom:8px">${nombre}</div>
      <a href="${url}" target="_blank" class="btn btn-primary btn-sm" style="font-size:11px">⬇️ Descargar</a>`;
  }
}

async function _guardarAdjuntoEnStorage(url, storagePath) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const blob = await resp.blob();
    await sb.storage.from('documentos').upload(storagePath, blob, {
      contentType: blob.type || 'application/octet-stream',
      upsert: true
    });
  } catch(e) { console.warn('[guardarAdj]', e); }
}

async function ejecutarDesdePreview() {
  if (!_previsTareaId) return;
  closeModal('mPrevisTarea');
  await ejecutarBandeja(_previsTareaId);
}

async function rechazarDesdePreview() {
  if (!_previsTareaId) return;
  closeModal('mPrevisTarea');
  await rechazarBandeja(_previsTareaId);
}

// ═══════════════════════════════════════════════
//  SUBIDA MANUAL DE DOCUMENTOS DESDE INBOX
// ═══════════════════════════════════════════════
async function inboxSubirDocumento(files) {
  if (!files || !files.length) return;
  const input = document.getElementById('inboxFileUpload');

  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf','jpg','jpeg','png','webp'].includes(ext)) {
      toast('⚠️ Formato no soportado: ' + file.name, 'error');
      continue;
    }
    try {
      toast('📤 Subiendo ' + file.name + '...', 'info');
      const eid = EMPRESA?.id;
      const ts = Date.now();
      const storagePath = `${eid}/ocr/inbox_${ts}_${Math.random().toString(36).substr(2,6)}.${ext}`;

      const { error: upErr } = await sb.storage.from('documentos').upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream'
      });
      if (upErr) { toast('❌ Error subiendo ' + file.name + ': ' + upErr.message, 'error'); continue; }

      const { data: docData, error: insErr } = await sb.from('documentos_ocr').insert({
        empresa_id: eid,
        usuario_id: CP?.id || CU?.id || null,
        archivo_path: storagePath,
        archivo_nombre: file.name,
        estado: 'pendiente',
        tipo_documento: 'auto',
        datos_extraidos: null,
        created_at: new Date().toISOString()
      }).select().single();

      if (insErr || !docData) { toast('❌ Error registrando ' + file.name + ': ' + (insErr?.message || ''), 'error'); continue; }

      toast('🤖 Procesando ' + file.name + ' con IA...', 'info');
      goPage('ocr');
      ocrGestionar(docData.id);
    } catch(e) {
      toast('❌ ' + file.name + ': ' + e.message, 'error');
    }
  }

  if (input) input.value = '';
}

// ═══════════════════════════════════════════════
//  INICIALIZACIÓN AL BOOT
// ═══════════════════════════════════════════════
async function iniciarAutomatizacionesBackground() {
  await cargarAutomatizaciones();
  // Cargar mapa correo→bandeja para marcar correos ya procesados
  await cargarMapaBandejaCorreos();
  // Mostrar botón bandeja en sidebar si tiene permiso
  const ibBandeja = document.getElementById('ibBandejaItem');
  if (ibBandeja && typeof canDo === 'function' && canDo('compras', 'bandeja')) {
    ibBandeja.style.display = '';
  }
  await actualizarBadgeBandeja();
  // Suscripción Realtime a bandeja_entrada — actualiza badge, widget y bandeja en vivo
  _suscribirBandejaRealtime();
}

function _suscribirBandejaRealtime() {
  sb.channel('bandeja-realtime')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'bandeja_entrada', filter: `empresa_id=eq.${EMPRESA.id}` },
      async (payload) => {
        console.log('[Bandeja RT]', payload.eventType, payload.new?.titulo || '');
        // Actualizar mapa correo→bandeja y refrescar marca en lista de correos
        _aplicarCambioRealtimeMapaCorreos(payload);
        if (document.getElementById('page-correo')?.style.display !== 'none' && typeof renderListaCorreos === 'function') {
          try { renderListaCorreos(correosFiltrados); } catch(_) {}
          if (typeof correoActual !== 'undefined' && correoActual?.id && (payload.new?.correo_id === correoActual.id || payload.old?.correo_id === correoActual.id)) {
            try { abrirCorreo(correoActual.id); } catch(_) {}
          }
        }
        // Actualizar badge siempre
        actualizarBadgeBandeja();
        // Actualizar widget del dashboard si está visible
        if (document.getElementById('page-dashboard')?.style.display !== 'none') {
          renderDashBandeja();
        }
        // Actualizar lista de bandeja si está visible
        if (document.getElementById('page-bandeja')?.style.display !== 'none') {
          await cargarBandejaItems();
          filtrarBandeja();
        }
        // Sonar + toast en INSERTs (si no lo hizo ya evaluarAutomatizaciones)
        if (payload.eventType === 'INSERT') {
          // Evitar duplicar: si evaluarAutomatizaciones acaba de notificar (<3s), skip
          const ahora = Date.now();
          if (!window._ultimaNotifBandeja || ahora - window._ultimaNotifBandeja > 3000) {
            toast(`📬 Nuevo en bandeja: ${payload.new?.titulo || 'Tarea'}`, 'success');
            _sonarNotificacion();
          }
        }
      }
    )
    .subscribe();
}
