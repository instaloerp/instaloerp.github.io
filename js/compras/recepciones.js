/**
 * MÓDULO RECEPCIONES
 * Gestión de recepciones de compra: verificación y almacenamiento
 */

// ═══════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let rcLineas = [];
let rcProveedorActual = null;
let rcEditId = null;
let rcAlmacenDestino = null;
let recepciones = [];
let rcFiltrados = [];
let _rcKpiFilterActivo = null;

// ═══════════════════════════════════════════════
// MAPA DE ESTADOS (uniforme con Pedidos/Presupuestos compra)
// ═══════════════════════════════════════════════
const RC_ESTADOS = {
  pendiente:    { label:'Pendiente',    ico:'⏳', color:'var(--amarillo)', bg:'var(--amarillo-light)' },
  recepcionado: { label:'Recepcionado', ico:'📦', color:'var(--verde)',    bg:'var(--verde-light)' },
  parcial:      { label:'Parcial',      ico:'📦', color:'var(--naranja)',  bg:'var(--naranja-light)' },
  incidencia:   { label:'Incidencia',   ico:'⚠️', color:'var(--rojo)',     bg:'var(--rojo-light)' },
  facturado:    { label:'Facturado',    ico:'🧾', color:'var(--azul)',     bg:'var(--azul-light)' },
};

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadRecepciones() {
  if (!EMPRESA || !EMPRESA.id) return;
  const {data} = await sb.from('recepciones').select('*').eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false});
  recepciones = data || [];
  // Filtro por defecto: año anterior a año siguiente (ventana amplia)
  const y = new Date().getFullYear();
  const dEl = document.getElementById('rcFiltroDesde');
  const hEl = document.getElementById('rcFiltroHasta');
  if (dEl && !dEl.value) dEl.value = (y-1) + '-01-01';
  if (hEl && !hEl.value) hEl.value = (y+1) + '-12-31';
  filtrarRecepciones();
  actualizarKpisRecepciones();
}

function rcCheckChanged() {
  const checks = document.querySelectorAll('.rc-check:checked');
  const btn = document.getElementById('rcFacturarMulti');
  if (!btn) return;
  if (checks.length < 2) { btn.style.display = 'none'; return; }
  const provs = new Set();
  checks.forEach(c => provs.add(c.dataset.proveedor));
  if (provs.size > 1) {
    btn.style.display = 'inline-flex'; btn.disabled = true;
    btn.title = 'Los albaranes deben ser del mismo proveedor';
    btn.textContent = '⚠️ Proveedores distintos';
  } else {
    btn.style.display = 'inline-flex'; btn.disabled = false;
    btn.textContent = `🧾 Facturar ${checks.length} albaranes`;
  }
}

function renderRecepciones(list) {
  rcFiltrados = list || [];
  const btnMulti = document.getElementById('rcFacturarMulti');
  if (btnMulti) btnMulti.style.display = 'none';

  const pill = (color, ico, label) =>
    `display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid ${color};background:#fff;color:${color};cursor:pointer`;

  const html = list.length ? list.map(r => {
    const ec = RC_ESTADOS[r.estado] || { ico:'?', label:r.estado, color:'var(--gris-500)', bg:'var(--gris-100)' };
    const total = r.lineas ? r.lineas.reduce((s,l) => {
      const bruto = (l.cantidad_recibida||l.cantidad||0) * (l.precio||0);
      return s + bruto * (1 - (l.dto1||l.dto1_pct||0)/100) * (1 - (l.dto2||l.dto2_pct||0)/100) * (1 - (l.dto3||l.dto3_pct||0)/100);
    }, 0) : 0;
    const nLineas = (r.lineas||[]).length;
    const almNombre = (almacenes||[]).find(a => a.id === r.almacen_destino_id)?.nombre || '';
    const obraNombre = r.trabajo_id ? ((typeof trabajos!=='undefined'?trabajos:[]).find(t=>t.id===r.trabajo_id)?.titulo || '') : '';

    // Pills de acción contextuales según estado
    let acciones = '';
    if (r.estado === 'pendiente') {
      acciones += `<button onclick="event.stopPropagation();recepcionarAlbaran(${r.id})" style="${pill('var(--verde)')}" title="Verificar mercancía y dar entrada al stock">📦 Recepcionar</button>`;
      acciones += `<button onclick="event.stopPropagation();incidenciaAlbaran(${r.id})" style="${pill('var(--rojo)')}" title="Mercancía dañada, faltan unidades, etc.">⚠️ Incidencia</button>`;
    }
    if (r.estado === 'incidencia') {
      acciones += `<button onclick="event.stopPropagation();recepcionarAlbaran(${r.id})" style="${pill('var(--verde)')}" title="Recepcionar tras resolver incidencia">📦 Recepcionar</button>`;
    }
    if ((r.estado === 'recepcionado' || r.estado === 'parcial') && !r.exportado_bloqueado) {
      acciones += `<button onclick="event.stopPropagation();recepcionToFacturaProv(${r.id})" style="${pill('var(--azul)')}">🧾 Facturar</button>`;
    }
    // Asignar / cambiar obra (build 126: también disponible con obra asignada)
    if (!r.exportado_bloqueado) {
      if (r.trabajo_id) {
        acciones += `<span onclick="event.stopPropagation();rcAsignarObra(${r.id})" title="Cambiar obra" style="display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:var(--verde-light);color:var(--verde);cursor:pointer">🏗️ ${obraNombre||'Obra'}</span>`;
      } else {
        acciones += `<button onclick="event.stopPropagation();rcAsignarObra(${r.id})" style="${pill('var(--gris-500)')}" title="Asignar a obra/trabajo">🏗️ Obra</button>`;
      }
    }

    // Checkbox para facturación múltiple (solo recepcionados no bloqueados)
    const showCheck = (r.estado === 'recepcionado' || r.estado === 'parcial') && !r.exportado_bloqueado;

    return `<tr style="cursor:pointer" onclick="editarRecepcion(${r.id})">
      <td onclick="event.stopPropagation()" style="text-align:center;width:30px">${showCheck ? `<input type="checkbox" class="rc-check" value="${r.id}" data-proveedor="${r.proveedor_id||''}" onchange="rcCheckChanged()" style="cursor:pointer">` : ''}</td>
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">
        <div>${r.numero}</div>
        <div style="font-size:11px;color:var(--gris-400);font-family:inherit">${new Date(r.fecha).toLocaleDateString('es-ES')}</div>
      </td>
      <td>
        <div style="font-weight:600">${r.proveedor_nombre}</div>
        <div style="font-size:11px;color:var(--gris-400)">${almNombre}</div>
      </td>
      <td style="font-size:12px;color:var(--gris-500)">${nLineas} línea${nLineas!==1?'s':''}</td>
      <td style="text-align:right;font-weight:700;font-size:12.5px">${fmtE(total)}</td>
      <td onclick="event.stopPropagation();rcCambiarEstadoMenu(${r.id}, event)">
        <span title="Click para cambiar estado" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${ec.color};background:${ec.bg};cursor:pointer">${ec.ico} ${ec.label}</span>
      </td>
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:4px;flex-wrap:wrap">${acciones}</div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7"><div class="empty"><div class="ei">📥</div><h3>Sin albaranes de proveedor</h3></div></td></tr>';
  document.getElementById('rcTable').innerHTML = html;
}

function _rcImporte(r) {
  return (r.lineas||[]).reduce((sum,l) => {
    const bruto = (l.cantidad_recibida||l.cantidad||0) * (l.precio||0);
    return sum + bruto * (1-(l.dto1||l.dto1_pct||0)/100) * (1-(l.dto2||l.dto2_pct||0)/100) * (1-(l.dto3||l.dto3_pct||0)/100);
  }, 0);
}

function actualizarKpisRecepciones() {
  const totalImp = recepciones.reduce((s,r) => s + _rcImporte(r), 0);
  const pendientes = recepciones.filter(r => r.estado === 'pendiente').length;
  const parciales  = recepciones.filter(r => r.estado === 'parcial').length;
  const recepcion  = recepciones.filter(r => r.estado === 'recepcionado').length;
  const incidencias = recepciones.filter(r => r.estado === 'incidencia').length;
  const impRecib = recepciones
    .filter(r => r.estado==='recepcionado' || r.estado==='parcial' || r.estado==='facturado')
    .reduce((s,r) => s + _rcImporte(r), 0);
  const set = (id, v) => { const el=document.getElementById(id); if (el) el.textContent = v; };
  set('rcKpiTotal', recepciones.length);
  set('rcKpiPend', pendientes);
  set('rcKpiParc', parciales);
  set('rcKpiRecib', recepcion);
  set('rcKpiInc', incidencias);
  set('rcKpiImpRecib', fmtE(impRecib));
  set('rcKpiImpTotal', fmtE(totalImp));
  // Compat con HTML antiguo si aún existe
  set('rcKpiMes', recepciones.filter(r => {
    const f = new Date(r.fecha), hoy = new Date();
    return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
  }).length);
  set('rcKpiValor', fmtE(impRecib));
}

// Filtro por tarjeta KPI
function rcFiltrarPorKpi(estado) {
  _rcKpiFilterActivo = (_rcKpiFilterActivo === estado) ? null : estado;
  // Reflejar visualmente la tarjeta activa
  document.querySelectorAll('.rc-kpi-filter').forEach(el => {
    el.style.outline = el.dataset.filtro === _rcKpiFilterActivo ? '3px solid var(--acento)' : 'none';
  });
  filtrarRecepciones();
}

// Menú contextual para cambiar estado
function rcCambiarEstadoMenu(id, evt) {
  const r = recepciones.find(x => x.id === id);
  if (!r) return;
  const opciones = Object.keys(RC_ESTADOS).filter(e => e !== r.estado);
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;z-index:99999;background:#fff;border:1px solid var(--gris-200);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.12);padding:4px;min-width:180px;top:${evt.clientY}px;left:${evt.clientX}px`;
  menu.innerHTML = opciones.map(e => {
    const ec = RC_ESTADOS[e];
    return `<div onclick="rcSetEstado(${id},'${e}');this.parentElement.remove()" style="padding:6px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px" onmouseover="this.style.background='var(--gris-100)'" onmouseout="this.style.background='transparent'">${ec.ico} ${ec.label}</div>`;
  }).join('');
  document.body.appendChild(menu);
  setTimeout(() => {
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 0);
}

async function rcSetEstado(id, estado) {
  await sb.from('recepciones').update({ estado }).eq('id', id);
  const r = recepciones.find(x => x.id === id); if (r) r.estado = estado;
  filtrarRecepciones();
  actualizarKpisRecepciones();
  toast(`Estado → ${RC_ESTADOS[estado]?.label || estado}`, 'success');
}

// Asignar obra vía modal
function rcAsignarObra(id) {
  const r = recepciones.find(x => x.id === id);
  if (!r) return;
  const existing = document.getElementById('rcAsignObraOverlay');
  if (existing) existing.remove();
  const ov = document.createElement('div');
  ov.id = 'rcAsignObraOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;display:flex;align-items:center;justify-content:center';
  const opts = (typeof trabajos!=='undefined'?trabajos:[]).filter(t => t.estado !== 'finalizado' && t.estado !== 'cancelado')
    .map(t => `<option value="${t.id}">${t.titulo||t.numero||('Obra #'+t.id)}${t.cliente_nombre ? ' — '+t.cliente_nombre : ''}</option>`).join('');
  ov.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:20px;min-width:420px;max-width:90vw">
      <h3 style="margin:0 0 12px 0">🏗️ Asignar obra a ${r.numero}</h3>
      <select id="rcAsignObraSel" style="width:100%;padding:8px;border:1px solid var(--gris-200);border-radius:6px;font-size:14px">
        <option value="">— Selecciona obra —</option>
        ${opts}
      </select>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button onclick="document.getElementById('rcAsignObraOverlay').remove()" class="btn-sec">Cancelar</button>
        <button onclick="rcConfirmarObra(${id})" class="btn-pri">Asignar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

async function rcConfirmarObra(id) {
  const sel = document.getElementById('rcAsignObraSel');
  const tid = parseInt(sel?.value);
  if (!tid) { toast('Selecciona una obra', 'error'); return; }
  const r = recepciones.find(x => x.id === id);
  if (!r) return;
  await sb.from('recepciones').update({ trabajo_id: tid }).eq('id', id);
  r.trabajo_id = tid;
  if (typeof propagarObraCompras === 'function') {
    await propagarObraCompras(tid, {
      presupuesto_compra_id: r.presupuesto_compra_id,
      pedido_compra_id: r.pedido_compra_id,
      recepcion_id: id
    });
  }
  document.getElementById('rcAsignObraOverlay')?.remove();
  loadRecepciones();
  toast('🏗️ Obra asignada y propagada', 'success');
}

// ═══════════════════════════════════════════════
// FILTRADO
// ═══════════════════════════════════════════════
function filtrarRecepciones() {
  const estado = v('rcFiltroEstado');
  const prov = v('rcFiltroProveedor');
  const desde = v('rcFiltroDesde');
  const hasta = v('rcFiltroHasta');
  const texto = (document.getElementById('rcFiltroTexto')?.value || '').trim().toLowerCase();

  let filtered = recepciones;

  // Filtro prioritario: KPI activa (sobre-escribe estado)
  const filtroActivo = _rcKpiFilterActivo || estado;
  if (filtroActivo === 'pendientes_all') {
    filtered = filtered.filter(r => r.estado === 'pendiente' || r.estado === 'incidencia');
  } else if (filtroActivo === 'activos') {
    filtered = filtered.filter(r => r.estado !== 'facturado');
  } else if (filtroActivo) {
    filtered = filtered.filter(r => r.estado === filtroActivo);
  }

  if (prov) filtered = filtered.filter(r => r.proveedor_id == prov);
  if (desde) filtered = filtered.filter(r => new Date(r.fecha) >= new Date(desde));
  if (hasta) filtered = filtered.filter(r => new Date(r.fecha) <= new Date(hasta));

  if (texto) {
    filtered = filtered.filter(r => {
      const obraNombre = r.trabajo_id ? ((typeof trabajos!=='undefined'?trabajos:[]).find(t=>t.id===r.trabajo_id)?.titulo || '') : '';
      return (r.numero||'').toLowerCase().includes(texto)
        || (r.proveedor_nombre||'').toLowerCase().includes(texto)
        || (r.observaciones||'').toLowerCase().includes(texto)
        || obraNombre.toLowerCase().includes(texto);
    });
  }

  renderRecepciones(filtered);
}

// ═══════════════════════════════════════════════
// CREAR NUEVA RECEPCIÓN
// ═══════════════════════════════════════════════
async function nuevaRecepcion() {
  rcLineas = [];
  rcEditId = null;
  rcProveedorActual = null;
  rcAlmacenDestino = (almacenes||[])[0]?.id || null;

  const sel = document.getElementById('rc_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

  const almSel = document.getElementById('rc_almacen');
  almSel.innerHTML = (almacenes||[]).map(a => `<option value="${a.id}" ${a.id===rcAlmacenDestino?'selected':''}>${a.nombre}</option>`).join('');

  document.getElementById('rc_numero').value = await generarNumeroDoc('recepcion');
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('rc_fecha').value = hoy;
  document.getElementById('rc_observaciones').value = '';
  document.getElementById('mRCTit').textContent = 'Nuevo Albarán de Proveedor';
  poblarSelectorObra('rc_obra', null);

  rc_addLinea();
  openModal('mRecepcion');
}

// ═══════════════════════════════════════════════
// BLOQUEO POR ESTADO (patrón uniforme compras)
// ═══════════════════════════════════════════════
// Aplica/quita bloqueo visual al modal de Albarán de Proveedor
function _rcAplicarBloqueo(bloqueado) {
  const modal = document.getElementById('mRecepcion');
  if (!modal) return;
  const ids = ['rc_proveedor','rc_numero','rc_almacen','rc_fecha','rc_obra','rc_observaciones'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.disabled = bloqueado;
    else el.readOnly = bloqueado;
    el.style.opacity = bloqueado ? '0.7' : '';
  });
  modal.querySelectorAll('#rc_lineas input, #rc_lineas select').forEach(el => {
    if (el.tagName === 'SELECT') el.disabled = bloqueado;
    else el.readOnly = bloqueado;
    el.style.pointerEvents = bloqueado ? 'none' : '';
  });
  modal.querySelectorAll('#rc_lineas button').forEach(btn => { btn.style.display = bloqueado ? 'none' : ''; });
  modal.querySelectorAll('.modal-b button').forEach(btn => {
    const txt = (btn.textContent||'').trim();
    if (txt.startsWith('+ Añadir línea')) btn.style.display = bloqueado ? 'none' : '';
  });
  const footer = modal.querySelector('.modal-f');
  if (footer) footer.querySelectorAll('button').forEach(btn => {
    const txt = (btn.textContent||'').trim();
    if (txt.includes('Guardar')) btn.style.display = bloqueado ? 'none' : '';
  });
}

// ═══════════════════════════════════════════════
// EDITAR RECEPCIÓN
// ═══════════════════════════════════════════════
async function editarRecepcion(id) {
  const r = recepciones.find(x => x.id === id);
  if (!r) return;

  rcEditId = id;
  rcProveedorActual = r.proveedor_id;
  rcAlmacenDestino = r.almacen_destino_id;
  rcLineas = r.lineas || [];

  const sel = document.getElementById('rc_proveedor');
  sel.innerHTML = (proveedores||[]).map(p => `<option value="${p.id}" ${p.id===r.proveedor_id?'selected':''}>${p.nombre}</option>`).join('');

  const almSel = document.getElementById('rc_almacen');
  almSel.innerHTML = (almacenes||[]).map(a => `<option value="${a.id}" ${a.id===r.almacen_destino_id?'selected':''}>${a.nombre}</option>`).join('');

  setVal({
    rc_numero: r.numero,
    rc_fecha: r.fecha,
    rc_observaciones: r.observaciones || ''
  });

  document.getElementById('mRCTit').textContent = 'Editar Albarán de Proveedor';
  poblarSelectorObra('rc_obra', r.trabajo_id);
  rc_renderLineas();
  openModal('mRecepcion');

  // ── Bloqueo por estado (patrón ventas) ──
  // En recepciones el estado editable es 'pendiente'.
  // Una vez recepcionado / parcial / incidencia / facturado → inmutable.
  const banner = document.getElementById('rcBloqueoBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  const bloqueado = r.estado && r.estado !== 'pendiente';
  _rcAplicarBloqueo(bloqueado);
  if (bloqueado && banner) {
    const estLabel = (RC_ESTADOS[r.estado]?.label) || r.estado;
    banner.style.display = 'block';
    banner.innerHTML = `🔒 <strong>Documento no editable</strong> — estado actual: <em>${estLabel}</em>. Para modificarlo, cámbialo antes a <strong>Pendiente</strong> desde la pastilla de estado en el listado.`;
  }
}

// ═══════════════════════════════════════════════
// GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function rc_addLinea() {
  rcLineas.push({articulo_id:null, codigo:'', nombre:'', cantidad_pedida:0, cantidad_recibida:0, precio:0, dto1:0, dto2:0, dto3:0});
  rc_renderLineas();
  setTimeout(()=>{
    const all = document.querySelectorAll('#rc_lineas input[data-ac="articulos"]');
    const last = all[all.length-1];
    if (last) last.focus();
  },50);
}

function rc_removeLinea(idx) {
  rcLineas.splice(idx, 1);
  rc_renderLineas();
}

let _rcArtSelecting = false;
function rc_updateLinea(idx, field, val) {
  // Si se acaba de seleccionar un artículo, no dejar que onblur sobreescriba nombre con el texto parcial
  if (field === 'nombre' && _rcArtSelecting) return;
  if (field === 'articulo_id') {
    const art = (articulos||[]).find(a => a.id == val);
    if (art) {
      rcLineas[idx].articulo_id = art.id;
      rcLineas[idx].codigo = art.codigo;
      rcLineas[idx].nombre = art.nombre;
      rcLineas[idx].precio = art.precio_coste || 0;
    }
  } else if (['cantidad_pedida','cantidad_recibida','precio','dto1','dto2','dto3'].includes(field)) {
    rcLineas[idx][field] = parseFloat(val) || 0;
  } else {
    rcLineas[idx][field] = val;
  }
  rc_renderLineas();
}

function _rc_onSelectArt(lineaIdx, art) {
  _rcArtSelecting = true;
  rcLineas[lineaIdx].articulo_id = art.id;
  rcLineas[lineaIdx].codigo = art.codigo || '';
  rcLineas[lineaIdx].nombre = art.nombre || '';
  rcLineas[lineaIdx].precio = art.precio_coste || art.precio_venta || 0;
  if (art.tipo_iva_id && typeof tiposIva!=='undefined') {
    const t = tiposIva.find(x=>x.id===art.tipo_iva_id);
    if (t) rcLineas[lineaIdx].iva = t.porcentaje;
  }
  // Defer render to avoid blur/innerHTML race condition
  setTimeout(() => { rc_renderLineas(); }, 0);
  toast(`📦 ${art.codigo||''} — ${art.nombre}`,'info');
  setTimeout(() => { _rcArtSelecting = false; }, 300);
}

function rc_renderLineas() {
  let total = 0;
  const _n = (v) => `<input type="number" value="${v}" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"`;
  const html = rcLineas.map((l, i) => {
    const d1 = l.dto1 || 0, d2 = l.dto2 || 0, d3 = l.dto3 || 0;
    const bruto = l.cantidad_recibida * l.precio;
    const subtotal = bruto * (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
    total += subtotal;
    const descVal = l.nombre || '';
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 6px">
        <input value="${descVal}" placeholder="Código o descripción del artículo..."
          data-ac="articulos" data-linea-idx="${i}"
          oninput="acBuscarArticulo(this, _rc_onSelectArt, 'precio_coste')"
          onkeydown="acKeydown(event)"
          onfocus="if(this.value.length>=1)acBuscarArticulo(this, _rc_onSelectArt, 'precio_coste')"
          onblur="setTimeout(()=>{const d=document.getElementById('acArticulos');if(d)d.style.display='none'},200);rc_updateLinea(${i},'nombre',this.value)"
          autocomplete="off"
          style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent">
      </td>
      <td style="padding:7px 6px;text-align:right">${_n(l.cantidad_pedida)} min="0" step="0.01" onchange="rc_updateLinea(${i},'cantidad_pedida',this.value)" readonly></td>
      <td style="padding:7px 6px">${_n(l.cantidad_recibida)} min="0" step="0.01" onchange="rc_updateLinea(${i},'cantidad_recibida',this.value)"></td>
      <td style="padding:7px 6px">${_n(l.precio)} min="0" step="0.01" onchange="rc_updateLinea(${i},'precio',this.value)"></td>
      <td style="padding:7px 2px">${_n(d1)} min="0" max="100" step="0.5" onchange="rc_updateLinea(${i},'dto1',this.value)" placeholder="%"></td>
      <td style="padding:7px 2px">${_n(d2)} min="0" max="100" step="0.5" onchange="rc_updateLinea(${i},'dto2',this.value)" placeholder="%"></td>
      <td style="padding:7px 2px">${_n(d3)} min="0" max="100" step="0.5" onchange="rc_updateLinea(${i},'dto3',this.value)" placeholder="%"></td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px;white-space:nowrap">${fmtE(subtotal)}</td>
      <td style="padding:7px 4px"><button onclick="rc_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button></td>
    </tr>`;
  }).join('');

  document.getElementById('rc_lineas').innerHTML = html;
  document.getElementById('rc_total').textContent = fmtE(total);
}

// ═══════════════════════════════════════════════
// GUARDAR RECEPCIÓN
// ═══════════════════════════════════════════════
async function guardarRecepcion(conRecepcion = false) {
  if (_creando) return;
  _creando = true;
  try {
    const numero = v('rc_numero').trim();
    const provId = parseInt(v('rc_proveedor'));
    const almacenId = parseInt(v('rc_almacen'));

    if (!numero) {toast('Introduce número de albarán','error');return;}
    if (!provId) {toast('Selecciona proveedor','error');return;}
    if (!almacenId) {toast('Selecciona almacén','error');return;}
    if (rcLineas.length === 0) {toast('Agrega al menos una línea','error');return;}

    const prov = (proveedores||[]).find(p => p.id === provId);
    const estadoNuevo = conRecepcion ? 'recepcionado' : 'pendiente';
    const obj = {
      empresa_id: EMPRESA.id,
      numero,
      pedido_compra_id: rcEditId ? recepciones.find(x=>x.id===rcEditId)?.pedido_compra_id : null,
      proveedor_id: provId,
      proveedor_nombre: prov?.nombre || '',
      almacen_destino_id: almacenId,
      fecha: v('rc_fecha'),
      estado: rcEditId ? recepciones.find(x=>x.id===rcEditId)?.estado : estadoNuevo,
      lineas: rcLineas,
      observaciones: v('rc_observaciones'),
      usuario_nombre: CP?.nombre || CU.email,
      trabajo_id: parseInt(document.getElementById('rc_obra')?.value) || (rcEditId ? recepciones.find(x=>x.id===rcEditId)?.trabajo_id : null) || null
    };

    if (rcEditId) {
      await sb.from('recepciones').update(obj).eq('id', rcEditId);
      // Propagar obra si se asignó
      if (obj.trabajo_id) {
        const rc = recepciones.find(x=>x.id===rcEditId);
        await propagarObraCompras(obj.trabajo_id, {
          presupuesto_compra_id: rc?.presupuesto_compra_id,
          pedido_compra_id: rc?.pedido_compra_id || obj.pedido_compra_id,
          recepcion_id: rcEditId
        });
      }
      closeModal('mRecepcion');
      loadRecepciones();
      toast('Albarán actualizado ✓', 'success');
    } else {
      // Nuevo albarán
      const { data: inserted, error: insErr } = await sb.from('recepciones').insert(obj).select().single();
      if (insErr) { toast('Error al guardar: ' + insErr.message, 'error'); return; }

      // Si se pidió recepcionar, dar entrada de stock
      if (conRecepcion && inserted) {
        const _stockOk = await _entradaStockAlbaran(inserted.id, almacenId, rcLineas, numero, v('rc_fecha'));
        closeModal('mRecepcion');
        const _fEst = document.getElementById('rcFiltroEstado');
        if (_fEst) _fEst.value = '';
        loadRecepciones();
        toast('Albarán recepcionado + stock actualizado (' + _stockOk + ' artículos) ✓', 'success');
      } else {
        closeModal('mRecepcion');
        const _fEst = document.getElementById('rcFiltroEstado');
        if (_fEst) _fEst.value = '';
        loadRecepciones();
        toast('Albarán guardado como pendiente ✓', 'success');
      }
    }
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
// FUNCIÓN AUXILIAR: ENTRADA DE STOCK PARA ALBARÁN
// ═══════════════════════════════════════════════
async function _entradaStockAlbaran(recepcionId, almacenId, lineas, numero, fecha) {
  let _stockOk = 0;
  for (const linea of (lineas || [])) {
    const artId = linea.articulo_id || linea._artId;
    if (!artId) continue;
    const cant = linea.cantidad_recibida || linea.cantidad || 0;
    if (cant <= 0) continue;

    try {
      // 1. Buscar si hay stock provisional en CUALQUIER almacén para este artículo
      //    (OCR pudo crearlo en la furgoneta del operario)
      const { data: todosStocks } = await sb.from('stock').select('*')
        .eq('articulo_id', artId).eq('empresa_id', EMPRESA.id).gt('stock_provisional', 0);

      let almacenReal = almacenId; // por defecto: almacén destino del albarán

      if (todosStocks?.length) {
        // Hay provisional → convertir a real EN ESE MISMO almacén (no moverlo)
        for (const sp of todosStocks) {
          const convertir = Math.min(sp.stock_provisional, cant);
          if (convertir > 0) {
            await sb.from('stock').update({
              cantidad: (sp.cantidad || 0) + convertir,
              stock_provisional: Math.max(0, sp.stock_provisional - convertir)
            }).eq('id', sp.id);
            almacenReal = sp.almacen_id; // registrar movimiento en el almacén donde estaba
          }
        }
      } else {
        // No hay provisional → entrada normal en almacén destino
        const { data: stockDest } = await sb.from('stock').select('*')
          .eq('almacen_id', almacenId).eq('articulo_id', artId).eq('empresa_id', EMPRESA.id).limit(1);

        if (stockDest?.length) {
          await sb.from('stock').update({
            cantidad: (stockDest[0].cantidad || 0) + cant
          }).eq('id', stockDest[0].id);
        } else {
          await sb.from('stock').insert({
            empresa_id: EMPRESA.id, almacen_id: almacenId,
            articulo_id: artId, cantidad: cant, stock_provisional: 0, stock_reservado: 0
          });
        }
      }

      await sb.from('movimientos_stock').insert({
        empresa_id: EMPRESA.id, articulo_id: artId, almacen_id: almacenReal,
        tipo: 'entrada', cantidad: cant, delta: cant,
        notas: 'Albarán proveedor nº ' + numero,
        tipo_stock: 'real', fecha: fecha || new Date().toISOString().slice(0, 10),
        usuario_id: CP?.id || null, usuario_nombre: CP?.nombre || CU?.email || 'admin'
      });
      _stockOk++;
    } catch(e) {
      console.error('[Stock albarán] Error:', artId, e);
      toast('⚠️ Stock error: ' + (e.message || ''), 'warning');
    }
  }
  return _stockOk;
}

// ═══════════════════════════════════════════════
// RECEPCIONAR ALBARÁN — MODAL CON CANTIDADES EDITABLES
// ═══════════════════════════════════════════════
let _rcpRecepcionId = null;
let _rcpLineas = []; // copia de líneas con cantidad_a_recibir editable

function recepcionarAlbaran(id) {
  const r = recepciones.find(x => x.id === id);
  if (!r) return;

  if (r.estado === 'recepcionado' || r.estado === 'facturado') {
    toast('Este albarán ya está recepcionado', 'info');
    return;
  }

  _rcpRecepcionId = id;
  _rcpLineas = (r.lineas || []).map(l => ({
    ...l,
    cantidad_esperada: l.cantidad_recibida || l.cantidad || 0,
    cantidad_a_recibir: l.cantidad_recibida || l.cantidad || 0
  }));

  document.getElementById('rcpNumero').textContent = r.numero;
  document.getElementById('rcpProveedor').textContent = r.proveedor_nombre;
  document.getElementById('rcpAlmacen').textContent = (almacenes||[]).find(a => a.id === r.almacen_destino_id)?.nombre || '—';
  _rcpRenderLineas();
  openModal('mRecepcionar');
}

function _rcpRenderLineas() {
  let hayDiferencia = false;
  const html = _rcpLineas.map((l, i) => {
    const esperada = l.cantidad_esperada;
    const recibir = l.cantidad_a_recibir;
    const pendiente = Math.max(0, esperada - recibir);
    if (pendiente > 0) hayDiferencia = true;
    const bgRow = pendiente > 0 ? 'background:#fff7ed' : '';
    return `<tr style="border-top:1px solid var(--gris-100);${bgRow}">
      <td style="padding:8px 10px">
        <div style="font-weight:600;font-size:13px">${l.nombre || 'Sin nombre'}</div>
        <div style="font-size:11px;color:var(--gris-400)">${l.codigo || ''}</div>
      </td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${esperada}</td>
      <td style="padding:8px 6px;text-align:right">
        <input type="number" value="${recibir}" min="0" max="${esperada}" step="0.01"
          onchange="_rcpUpdateCant(${i}, this.value)"
          style="width:80px;border:1.5px solid var(--gris-300);border-radius:6px;padding:5px 8px;font-size:13px;text-align:right;font-weight:700;outline:none">
      </td>
      <td style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700;color:${pendiente > 0 ? '#9a3412' : '#065f46'}">${pendiente > 0 ? pendiente : '✓'}</td>
    </tr>`;
  }).join('');
  document.getElementById('rcpLineas').innerHTML = html;

  const resumen = document.getElementById('rcpResumen');
  if (hayDiferencia) {
    const totalPend = _rcpLineas.reduce((s, l) => s + Math.max(0, l.cantidad_esperada - l.cantidad_a_recibir), 0);
    resumen.style.display = 'block';
    resumen.innerHTML = '⚠️ Hay <strong>' + totalPend + '</strong> unidades pendientes. Se creará un <strong>nuevo albarán pendiente</strong> con las cantidades no recibidas.';
  } else {
    resumen.style.display = 'none';
  }
}

function _rcpUpdateCant(idx, val) {
  const v = parseFloat(val) || 0;
  _rcpLineas[idx].cantidad_a_recibir = Math.min(v, _rcpLineas[idx].cantidad_esperada);
  _rcpRenderLineas();
}

async function _confirmarRecepcion() {
  const r = recepciones.find(x => x.id === _rcpRecepcionId);
  if (!r) return;

  // Separar líneas recibidas y pendientes
  const lineasRecibidas = [];
  const lineasPendientes = [];

  for (const l of _rcpLineas) {
    const recibida = l.cantidad_a_recibir || 0;
    const pendiente = Math.max(0, l.cantidad_esperada - recibida);

    if (recibida > 0) {
      lineasRecibidas.push({ ...l, cantidad_recibida: recibida, cantidad: recibida });
    }
    if (pendiente > 0) {
      lineasPendientes.push({
        articulo_id: l.articulo_id, codigo: l.codigo, nombre: l.nombre,
        cantidad_pedida: pendiente, cantidad_recibida: pendiente, cantidad: pendiente,
        precio: l.precio, dto1: l.dto1 || 0, dto2: l.dto2 || 0, dto3: l.dto3 || 0
      });
    }
  }

  if (lineasRecibidas.length === 0) {
    toast('No has marcado ninguna cantidad recibida', 'error');
    return;
  }

  // 1. Dar entrada de stock con las cantidades realmente recibidas
  const _stockOk = await _entradaStockAlbaran(r.id, r.almacen_destino_id, lineasRecibidas, r.numero, r.fecha);

  // 2. Actualizar albarán original con las líneas recibidas
  const esParcial = lineasPendientes.length > 0;
  const nuevoEstado = esParcial ? 'parcial' : 'recepcionado';
  const obsAdd = esParcial ? '\n📦 Recepción parcial (' + new Date().toLocaleDateString('es-ES') + '): ' + lineasRecibidas.length + ' líneas recibidas, ' + lineasPendientes.length + ' pendientes' : '';

  await sb.from('recepciones').update({
    estado: nuevoEstado,
    lineas: lineasRecibidas,
    observaciones: ((r.observaciones || '') + obsAdd).trim()
  }).eq('id', r.id);

  // 3. Si es parcial, crear nuevo albarán con las cantidades pendientes
  if (esParcial) {
    // Buscar si ya existen parciales de este albarán para numerar secuencialmente
    const numBase = r.numero.replace(/\/P\d+$/, ''); // quitar /P1, /P2... si ya es un parcial
    const existentes = recepciones.filter(x => x.numero.startsWith(numBase + '/P')).length;
    const numParcial = numBase + '/P' + (existentes + 1);
    const { error: insErr } = await sb.from('recepciones').insert({
      empresa_id: EMPRESA.id,
      numero: numParcial,
      pedido_compra_id: r.pedido_compra_id || null,
      proveedor_id: r.proveedor_id,
      proveedor_nombre: r.proveedor_nombre,
      almacen_destino_id: r.almacen_destino_id,
      fecha: r.fecha,
      estado: 'pendiente',
      lineas: lineasPendientes,
      observaciones: 'Pendiente de recepción parcial — origen: ' + r.numero,
      usuario_nombre: CP?.nombre || CU?.email
    });
    if (insErr) {
      toast('⚠️ Stock OK pero error creando albarán pendiente: ' + insErr.message, 'warning');
    } else {
      toast('📦 Recibido parcialmente — albarán pendiente ' + numParcial + ' creado', 'info');
    }
  }

  closeModal('mRecepcionar');
  loadRecepciones();
  toast('Albarán recepcionado + stock (' + _stockOk + ' artículos) ✓', 'success');
}

// ═══════════════════════════════════════════════
// INCIDENCIA EN ALBARÁN
// ═══════════════════════════════════════════════
let _incAlbaranId = null;

function incidenciaAlbaran(id) {
  const r = recepciones.find(x => x.id === id);
  if (!r) return;

  _incAlbaranId = id;
  document.getElementById('incInfo').innerHTML = `<strong>${r.numero}</strong> — ${r.proveedor_nombre} · ${(r.lineas||[]).length} línea${(r.lineas||[]).length!==1?'s':''} · ${fmtE((r.lineas||[]).reduce((s,l) => {const bruto=(l.cantidad_recibida||l.cantidad||0)*(l.precio||0);return s+bruto*(1-(l.dto1||l.dto1_pct||0)/100)*(1-(l.dto2||l.dto2_pct||0)/100)*(1-(l.dto3||l.dto3_pct||0)/100);}, 0))}`;
  document.getElementById('incTipo').value = '';
  document.getElementById('incDescripcion').value = '';
  document.getElementById('incAccion').value = 'reclamar';
  openModal('mIncidencia');
}

async function _confirmarIncidencia() {
  const tipo = document.getElementById('incTipo').value;
  const desc = document.getElementById('incDescripcion').value.trim();
  if (!tipo) { toast('Selecciona el tipo de incidencia', 'error'); return; }
  if (!desc) { toast('Describe la incidencia', 'error'); return; }

  const accion = document.getElementById('incAccion').value;
  const tipoLabel = document.getElementById('incTipo').selectedOptions[0]?.textContent || tipo;
  const accionLabel = document.getElementById('incAccion').selectedOptions[0]?.textContent || accion;

  const r = recepciones.find(x => x.id === _incAlbaranId);
  if (!r) return;

  const incidencia = {
    fecha: new Date().toISOString(),
    tipo, descripcion: desc, accion,
    usuario: CP?.nombre || CU?.email || 'admin',
    resuelta: false
  };

  // Guardar incidencias como array en el campo observaciones (structured)
  const incidencias = r.incidencias || [];
  incidencias.push(incidencia);

  const obsAdd = '\n⚠️ ' + tipoLabel + ' (' + new Date().toLocaleDateString('es-ES') + '): ' + desc + ' → ' + accionLabel;

  await sb.from('recepciones').update({
    estado: 'incidencia',
    incidencias: incidencias,
    observaciones: ((r.observaciones || '') + obsAdd).trim()
  }).eq('id', _incAlbaranId);

  closeModal('mIncidencia');
  loadRecepciones();
  toast('Incidencia registrada — ' + accionLabel, 'warning');
}

// ═══════════════════════════════════════════════
// ELIMINAR RECEPCIÓN
// ═══════════════════════════════════════════════
async function delRecepcion(id) {
  if (!confirm('¿Eliminar albarán?')) return;
  await sb.from('recepciones').delete().eq('id', id);
  recepciones = recepciones.filter(r => r.id !== id);
  renderRecepciones(recepciones);
  toast('Albarán eliminado', 'info');
}

// ═══════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════
function exportRecepciones() {
  const csv = 'Número,Proveedor,Fecha,Estado,Usuario,Almacén\n' +
    recepciones.map(r => `"${r.numero}","${r.proveedor_nombre}","${r.fecha}","${r.estado}","${r.usuario_nombre}","${(almacenes||[]).find(a=>a.id===r.almacen_destino_id)?.nombre||'—'}"`).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recepciones_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════
// CONVERSIONES
// ═══════════════════════════════════════════════
async function recepcionToFacturaProv(id) {
  if (_creando) return;
  _creando = true;
  try {
    const r = recepciones.find(x => x.id === id);
    if (!r) return;
    if (r.exportado_bloqueado) { toast('🔒 Este albarán ya fue exportado a factura','error'); return; }
    if (!confirm(`¿Crear factura de proveedor desde el albarán ${r.numero}?`)) return;
    const numero = await generarNumeroDoc('factura_proveedor');
    const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);
    const total = r.lineas ? r.lineas.reduce((s, l) => {const bruto=(l.cantidad_recibida||l.cant||0)*(l.precio||0);return s+bruto*(1-(l.dto1||l.dto1_pct||0)/100)*(1-(l.dto2||l.dto2_pct||0)/100)*(1-(l.dto3||l.dto3_pct||0)/100);}, 0) : (r.total || 0);
    const { error } = await sb.from('facturas_proveedor').insert({
      empresa_id: EMPRESA.id, numero,
      proveedor_id: r.proveedor_id, proveedor_nombre: r.proveedor_nombre,
      fecha: hoy.toISOString().split('T')[0],
      fecha_vencimiento: v.toISOString().split('T')[0],
      base_imponible: Math.round(total * 100) / 100,
      total_iva: 0,
      total: Math.round(total * 100) / 100,
      estado: 'pendiente',
      observaciones: r.observaciones,
      lineas: r.lineas,
      recepcion_id: r.id,
      pedido_compra_id: r.pedido_compra_id || null,
      trabajo_id: r.trabajo_id || null,
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('recepciones').update({ estado: 'facturado', exportado_a:'factura_proveedor', exportado_bloqueado:true }).eq('id', id);
    const rr = recepciones.find(x=>x.id===id); if(rr) { rr.estado='facturado'; rr.exportado_a='factura_proveedor'; rr.exportado_bloqueado=true; }
    toast('🧾 Factura proveedor creada — albarán facturado', 'success');
    goPage('facturas-proveedor');
  } finally {
    _creando = false;
  }
}

// Facturación múltiple: varios albaranes proveedor → 1 factura
async function facturarRecepcionesMulti() {
  if (_creando) return;
  _creando = true;
  try {
    const checks = document.querySelectorAll('.rc-check:checked');
    if (checks.length < 2) return;
    const ids = [...checks].map(c => parseInt(c.value));
    const recs = ids.map(id => recepciones.find(x => x.id === id)).filter(Boolean);
    if (!recs.length) return;

    const provIds = new Set(recs.map(r => r.proveedor_id));
    if (provIds.size > 1) { toast('Los albaranes deben ser del mismo proveedor', 'error'); return; }

    const nums = recs.map(r => r.numero).join(', ');
    if (!confirm(`¿Crear una factura agrupando ${recs.length} albaranes proveedor?\n\n${nums}`)) return;

    let lineasTodas = [];
    let totalGlobal = 0;
    recs.forEach(r => {
      lineasTodas.push({ desc: `── ${r.numero} (${r.fecha || ''}) ──`, cant: 0, precio: 0, _separator: true });
      (r.lineas || []).forEach(l => {
        lineasTodas.push({ ...l });
        const _br = (l.cantidad_recibida || l.cant || 0) * (l.precio || 0);
        totalGlobal += _br*(1-(l.dto1||l.dto1_pct||0)/100)*(1-(l.dto2||l.dto2_pct||0)/100)*(1-(l.dto3||l.dto3_pct||0)/100);
      });
    });

    const numero = await generarNumeroDoc('factura_proveedor');
    const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);
    const { error } = await sb.from('facturas_proveedor').insert({
      empresa_id: EMPRESA.id, numero,
      proveedor_id: recs[0].proveedor_id, proveedor_nombre: recs[0].proveedor_nombre,
      fecha: hoy.toISOString().split('T')[0],
      fecha_vencimiento: v.toISOString().split('T')[0],
      base_imponible: Math.round(totalGlobal * 100) / 100,
      total_iva: 0,
      total: Math.round(totalGlobal * 100) / 100,
      estado: 'pendiente',
      observaciones: `Factura agrupada: ${nums}`,
      lineas: lineasTodas,
      recepcion_ids: ids,
      trabajo_id: recs[0].trabajo_id || null,
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    // Marcar todos como bloqueados
    for (const r of recs) {
      await sb.from('recepciones').update({ estado: 'facturado', exportado_a:'factura_proveedor', exportado_bloqueado:true }).eq('id', r.id);
      const rr = recepciones.find(x=>x.id===r.id); if(rr) { rr.estado='facturado'; rr.exportado_a='factura_proveedor'; rr.exportado_bloqueado=true; }
    }
    toast(`🧾 Factura ${numero} creada con ${recs.length} albaranes — bloqueados`, 'success');
    goPage('facturas-proveedor');
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  IMPRIMIR / EMAIL RECEPCIÓN
// ═══════════════════════════════════════════════
function imprimirRecepcion(id) {
  const r = recepciones.find(x=>x.id===id);
  if (!r) { toast('No encontrado','error'); return; }
  const prov = (proveedores||[]).find(x=>x.id===r.proveedor_id);
  const lineas = r.lineas||[];
  let htmlLineas='';
  lineas.forEach(l=>{htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.desc||l.descripcion||''}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cantidad_pedida||0}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cantidad_recibida||0}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${(l.precio||0).toFixed(2)} €</td></tr>`;});
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:8px">`:`<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const win=window.open('','_blank','width=850,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Recepción ${r.numero}</title><style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style></head><body><div class="no-print btn-bar"><button style="background:#1e40af;color:#fff" onclick="window.print()">🖨️ Imprimir</button><button style="background:#e2e8f0;color:#475569" onclick="window.close()">✕ Cerrar</button></div><div class="page"><div style="display:flex;gap:24px;margin-bottom:16px"><div style="flex:1"><div style="display:flex;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div></div></div></div><div style="flex:1"><div style="background:#d1fae5;border-radius:8px;padding:12px 16px;border-left:4px solid #059669"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;color:#059669;margin-bottom:4px">PROVEEDOR</div><div style="font-size:15px;font-weight:700">${r.proveedor_nombre||'—'}</div></div></div></div><div style="display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px"><div style="color:#059669"><span style="font-size:14px;font-weight:800">ALBARÁN PROVEEDOR</span> <span style="font-size:11px;color:#475569">${r.numero||''}</span></div><div style="font-size:11px;color:#64748b">Fecha: <b>${r.fecha?new Date(r.fecha).toLocaleDateString('es-ES'):'—'}</b></div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><thead><tr><th style="background:#059669;color:#fff;padding:7px 10px;font-size:9px;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#059669;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:80px">Pedido</th><th style="background:#059669;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:80px">Recibido</th><th style="background:#059669;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Precio</th></tr></thead><tbody>${htmlLineas}</tbody></table></div></body></html>`);
  win.document.close();
}

function enviarRecepcionEmail(id) {
  const r = recepciones.find(x => x.id === id);
  if (!r) return toast('Albarán no encontrado', 'error');
  const prov = proveedores.find(x => x.id === r.proveedor_id);
  const email = prov?.email || '';
  const asuntoTxt = `Albarán proveedor ${r.numero||''} — ${EMPRESA.nombre}`;
  const cuerpoTxt = `Estimado proveedor,\n\nLe confirmamos la recepción del material:\n\nNº Albarán: ${r.numero||'—'}\nFecha: ${r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}\nPedido origen: ${r.pedido_numero||'—'}\n\nAtentamente,\n${EMPRESA.nombre}\nTel: ${EMPRESA.telefono||''}`;
  if (typeof enviarDocumentoPorEmail === 'function' && typeof _correoCuentaActiva !== 'undefined' && _correoCuentaActiva) {
    nuevoCorreo(email, asuntoTxt, cuerpoTxt, { tipo: 'recepcion', id: r.id, ref: r.numero || '' });
    goPage('correo');
  } else {
    window.open(`mailto:${email}?subject=${encodeURIComponent(asuntoTxt)}&body=${encodeURIComponent(cuerpoTxt)}`);
    toast('Abriendo correo...', 'info');
  }
}
