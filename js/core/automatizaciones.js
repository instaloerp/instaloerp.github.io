/**
 * MÓDULO AUTOMATIZACIONES + BANDEJA DE ENTRADA
 * Sistema de reglas configurables para procesar correos entrantes
 * y cola de tareas pendientes de revisión/ejecución.
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let _automatizaciones = [];
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
//  CARGA DE AUTOMATIZACIONES (Config)
// ═══════════════════════════════════════════════
async function cargarAutomatizaciones() {
  const { data, error } = await sb.from('automatizaciones')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error cargando automatizaciones:', error); return; }
  _automatizaciones = data || [];
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

  cont.innerHTML = _automatizaciones.map(a => {
    const acc = ACCIONES_AUTO[a.accion] || ACCIONES_AUTO.personalizada;
    const modoLabel = a.modo === 'automatico' ? '⚡ Automático' : '👁️ Revisión manual';
    const modoColor = a.modo === 'automatico' ? '#059669' : '#D97706';
    const condiciones = [];
    if (a.condicion_remitente) condiciones.push('De: ' + a.condicion_remitente);
    if (a.condicion_asunto) condiciones.push('Asunto: ' + a.condicion_asunto);
    if (a.condicion_adjunto) condiciones.push('Adjunto: ' + a.condicion_adjunto);
    if (a.condicion_cuerpo) condiciones.push('Cuerpo: ' + a.condicion_cuerpo);

    return `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:10px;border:1px solid var(--gris-200);background:#fff;transition:all .15s">
      <div style="width:42px;height:42px;border-radius:10px;background:${acc.color}12;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${acc.ico}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-weight:700;font-size:14px">${a.nombre}</span>
          <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${modoColor}15;color:${modoColor}">${modoLabel}</span>
          ${!a.activa ? '<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:#ef444415;color:#ef4444">Desactivada</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--gris-500)">${acc.label}</div>
        ${condiciones.length ? `<div style="font-size:10px;color:var(--gris-400);margin-top:4px">${condiciones.join(' · ')}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="editarAutomatizacion(${a.id})" class="btn btn-secondary btn-sm" style="padding:5px 10px;font-size:11px">✏️</button>
        <button onclick="toggleAutomatizacion(${a.id})" class="btn btn-secondary btn-sm" style="padding:5px 10px;font-size:11px">${a.activa ? '⏸️' : '▶️'}</button>
        <button onclick="eliminarAutomatizacion(${a.id})" class="btn btn-secondary btn-sm" style="padding:5px 10px;font-size:11px;color:#ef4444">🗑️</button>
      </div>
    </div>`;
  }).join('');
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

  // Renderizar destino: nueva regla + reglas existentes
  const activas = _automatizaciones.filter(a => a.activa);
  let destinoHtml = `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:2px solid var(--azul);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px;background:var(--azul-light)">
      <input type="radio" name="rc_destino" value="nueva" checked>
      <span style="font-size:16px">➕</span>
      <div>
        <div style="font-weight:700">Crear regla nueva</div>
        <div style="font-size:11px;color:var(--gris-500)">Se abrirá el formulario pre-rellenado</div>
      </div>
    </label>`;

  if (activas.length) {
    destinoHtml += `<div style="font-size:11px;color:var(--gris-400);margin:10px 0 6px;font-weight:600">O añadir a una regla existente:</div>`;
    activas.forEach(a => {
      const acc = ACCIONES_AUTO[a.accion] || ACCIONES_AUTO.personalizada;
      const condiciones = [];
      if (a.condicion_remitente) condiciones.push(a.condicion_remitente);
      if (a.condicion_asunto) condiciones.push(a.condicion_asunto);
      if (a.condicion_adjunto) condiciones.push(a.condicion_adjunto);
      destinoHtml += `
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--gris-200);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px;transition:all .15s" onmouseenter="this.style.borderColor='var(--azul)'" onmouseleave="this.style.borderColor='var(--gris-200)'">
          <input type="radio" name="rc_destino" value="${a.id}">
          <span style="font-size:16px">${acc.ico}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${a.nombre}</div>
            <div style="font-size:11px;color:var(--gris-400)">${condiciones.join(' · ') || 'Sin condiciones'}</div>
          </div>
        </label>`;
    });
  }
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

  const destino = document.querySelector('input[name="rc_destino"]:checked')?.value;
  if (!destino) return;

  closeModal('mReglaCorreo');

  if (destino === 'nueva') {
    // Abrir modal de nueva automatización pre-rellenado
    _autoEditId = null;
    document.getElementById('mAutoTit').textContent = 'Nueva automatización';
    document.getElementById('btnGuardarAuto').textContent = '💾 Crear regla';
    ['auto_id','auto_desc','auto_asunto','auto_adjunto','auto_cuerpo','auto_remitente'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });

    const dominio = usarRemitente || '';
    setVal('auto_nombre', dominio ? 'Correos de ' + dominio : 'Nueva regla');
    if (usarRemitente) setVal('auto_remitente', usarRemitente);
    if (usarAsunto) setVal('auto_asunto', usarAsunto);
    if (usarAdjunto) setVal('auto_adjunto', usarAdjunto);
    document.getElementById('auto_accion').value = 'crear_factura_prov';
    document.getElementById('auto_modo').value = 'manual';

    setTimeout(() => openModal('mAutomatizacion'), 200);
  } else {
    // Añadir condiciones a regla existente
    const reglaId = parseInt(destino);
    const regla = _automatizaciones.find(x => x.id === reglaId);
    if (!regla) return;

    const updates = {};
    if (usarRemitente && !regla.condicion_remitente) updates.condicion_remitente = usarRemitente;
    else if (usarRemitente && regla.condicion_remitente && !regla.condicion_remitente.includes(usarRemitente)) {
      updates.condicion_remitente = regla.condicion_remitente; // ya existe, no duplicar
    }
    if (usarAsunto && !regla.condicion_asunto) updates.condicion_asunto = usarAsunto;
    if (usarAdjunto && !regla.condicion_adjunto) updates.condicion_adjunto = usarAdjunto;

    if (Object.keys(updates).length === 0) {
      toast('La regla ya tiene esas condiciones configuradas', 'info');
      return;
    }

    const { error } = await sb.from('automatizaciones').update(updates).eq('id', reglaId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }

    toast('Condiciones añadidas a "' + regla.nombre + '" ✓', 'success');
    await cargarAutomatizaciones();
  }
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
  setVal('auto_nombre', a.nombre || '');
  setVal('auto_desc', a.descripcion || '');
  setVal('auto_remitente', a.condicion_remitente || '');
  setVal('auto_asunto', a.condicion_asunto || '');
  setVal('auto_adjunto', a.condicion_adjunto || '');
  setVal('auto_cuerpo', a.condicion_cuerpo || '');
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
async function loadBandeja() {
  await cargarBandejaItems();
  filtrarBandeja();
}

async function cargarBandejaItems() {
  const { data, error } = await sb.from('bandeja_entrada')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error cargando bandeja:', error); return; }
  _bandejaItems = data || [];
}

function filtrarBandeja() {
  const filtro = document.getElementById('bandejaFiltroEstado')?.value || 'pendiente';
  if (filtro === 'todos') {
    _bandejaFiltrados = [..._bandejaItems];
  } else {
    _bandejaFiltrados = _bandejaItems.filter(b => b.estado === filtro);
  }
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
      <div style="font-size:12px">Las automatizaciones crearán tareas aquí cuando detecten correos relevantes</div>
    </div>`;
    return;
  }

  cont.innerHTML = _bandejaFiltrados.map(b => {
    const acc = ACCIONES_AUTO[b.tipo] || ACCIONES_AUTO.personalizada;
    const est = ESTADOS_BANDEJA[b.estado] || ESTADOS_BANDEJA.pendiente;
    const fecha = b.created_at ? new Date(b.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const datos = b.datos_extraidos || {};

    let acciones = '';
    if (b.estado === 'pendiente') {
      acciones = `
        <button onclick="ejecutarBandeja(${b.id})" class="btn btn-primary btn-sm" style="padding:5px 12px;font-size:11px">✅ Ejecutar</button>
        <button onclick="rechazarBandeja(${b.id})" class="btn btn-secondary btn-sm" style="padding:5px 10px;font-size:11px;color:#ef4444">✕</button>
      `;
    } else if (b.estado === 'completado' && b.resultado_id) {
      acciones = `<button onclick="verResultadoBandeja(${b.id})" class="btn btn-secondary btn-sm" style="padding:5px 12px;font-size:11px">👁️ Ver</button>`;
    }

    return `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:10px;border:1px solid var(--gris-200);background:#fff;transition:all .15s">
      <div style="width:42px;height:42px;border-radius:10px;background:${acc.color}12;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${acc.ico}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.titulo}</span>
          <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${est.color}15;color:${est.color};flex-shrink:0">${est.ico} ${est.label}</span>
        </div>
        ${b.descripcion ? `<div style="font-size:11px;color:var(--gris-500);margin-bottom:2px">${b.descripcion}</div>` : ''}
        <div style="font-size:10px;color:var(--gris-400)">${fecha} · ${acc.label}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">${acciones}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
//  ACCIONES DE BANDEJA
// ═══════════════════════════════════════════════
async function ejecutarBandeja(id) {
  const item = _bandejaItems.find(x => x.id === id);
  if (!item) return;

  const acc = ACCIONES_AUTO[item.tipo] || ACCIONES_AUTO.personalizada;
  const ok = await confirmModal({
    titulo: `${acc.ico} ${acc.label}`,
    mensaje: `<b>${item.titulo}</b><br><br>¿Ejecutar esta acción?<br><br><div style="font-size:11px;color:var(--gris-500)">Se creará el registro correspondiente en el ERP.</div>`,
    btnOk: 'Ejecutar',
    colorOk: '#059669',
  });
  if (!ok) return;

  try {
    // Marcar como aprobado
    await sb.from('bandeja_entrada').update({
      estado: 'aprobado',
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
//  EJECUTOR DE ACCIONES
// ═══════════════════════════════════════════════
async function _ejecutarAccionBandeja(item) {
  const datos = item.datos_extraidos || {};

  switch (item.tipo) {
    case 'crear_factura_prov': {
      // Crear factura de proveedor con los datos extraídos
      const obj = {
        empresa_id: EMPRESA.id,
        proveedor_id: datos.proveedor_id || null,
        numero_factura: datos.numero || '',
        fecha: datos.fecha || new Date().toISOString().split('T')[0],
        total: datos.total || 0,
        estado: 'borrador',
        notas: 'Creada automáticamente desde bandeja de entrada. Correo: ' + (datos.asunto || ''),
      };
      const { data, error } = await sb.from('facturas_proveedor').insert(obj).select().single();
      if (error) throw error;
      return { tipo: 'factura_proveedor', id: String(data.id) };
    }

    case 'crear_cliente': {
      const obj = {
        empresa_id: EMPRESA.id,
        nombre: datos.nombre || 'Cliente desde correo',
        email: datos.email || '',
        telefono: datos.telefono || '',
        notas: 'Creado automáticamente desde bandeja de entrada.',
      };
      const { data, error } = await sb.from('clientes').insert(obj).select().single();
      if (error) throw error;
      return { tipo: 'cliente', id: String(data.id) };
    }

    case 'crear_tarea': {
      // Si existe módulo de tareas
      if (typeof crearTareaDesdeCorreo === 'function') {
        const tareaId = await crearTareaDesdeCorreo(datos);
        return { tipo: 'tarea', id: String(tareaId) };
      }
      throw new Error('Módulo de tareas no disponible');
    }

    default:
      // Para acciones no implementadas aún, simplemente marcar como completado
      return { tipo: item.tipo, id: 'manual' };
  }
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
    const badge = document.getElementById('bandeja-badge');
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
  } catch (_) {}
}

// ═══════════════════════════════════════════════
//  MOTOR DE DETECCIÓN — Evaluar reglas contra correos
// ═══════════════════════════════════════════════
async function evaluarAutomatizaciones(correosNuevos) {
  if (!_automatizaciones.length) await cargarAutomatizaciones();
  const activas = _automatizaciones.filter(a => a.activa);
  if (!activas.length) return;

  for (const correo of correosNuevos) {
    for (const regla of activas) {
      if (_correoCoincideRegla(correo, regla)) {
        await _crearEntradaBandeja(correo, regla);
      }
    }
  }

  actualizarBadgeBandeja();
}

function _correoCoincideRegla(correo, regla) {
  // Todas las condiciones se evalúan con AND (las vacías se ignoran)
  if (regla.condicion_remitente) {
    const rem = (correo.de || correo.remitente || '').toLowerCase();
    if (!rem.includes(regla.condicion_remitente.toLowerCase())) return false;
  }
  if (regla.condicion_asunto) {
    const asunto = (correo.asunto || '').toLowerCase();
    if (!asunto.includes(regla.condicion_asunto.toLowerCase())) return false;
  }
  if (regla.condicion_adjunto) {
    const adjuntos = correo.adjuntos_meta || [];
    const patron = regla.condicion_adjunto.toLowerCase();
    const tieneAdj = adjuntos.some(a => (a.nombre || '').toLowerCase().includes(patron));
    if (!tieneAdj) return false;
  }
  if (regla.condicion_cuerpo) {
    const cuerpo = (correo.texto_plano || correo.cuerpo || '').toLowerCase();
    if (!cuerpo.includes(regla.condicion_cuerpo.toLowerCase())) return false;
  }
  return true;
}

async function _crearEntradaBandeja(correo, regla) {
  // Verificar que no existe ya una entrada para este correo + regla
  const { count } = await sb.from('bandeja_entrada')
    .select('id', { count: 'exact', head: true })
    .eq('correo_id', correo.id)
    .eq('automatizacion_id', regla.id);
  if (count > 0) return; // Ya procesado

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
  if (!items.length) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';
  if (countEl) countEl.textContent = items.length + ' pendiente' + (items.length > 1 ? 's' : '');

  cont.innerHTML = items.map(b => {
    const acc = ACCIONES_AUTO[b.tipo] || ACCIONES_AUTO.personalizada;
    const fecha = b.created_at ? new Date(b.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--gris-200);margin-bottom:6px;cursor:pointer;transition:background .15s" onclick="goPage('bandeja')">
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
//  INICIALIZACIÓN AL BOOT
// ═══════════════════════════════════════════════
async function iniciarAutomatizacionesBackground() {
  await cargarAutomatizaciones();
  await actualizarBadgeBandeja();
}
