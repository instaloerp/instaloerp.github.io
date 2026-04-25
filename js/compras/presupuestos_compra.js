/**
 * MÓDULO PRESUPUESTOS DE COMPRA
 * Gestión de solicitudes de presupuesto a proveedores
 */

// ═══════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let presupuestosCompra = [];
let prcFiltrados = [];
let prcLineas = [];
let prcEditId = null;
let prcProveedorActual = null;
let _prcKpiFilterActivo = '';

const PRC_ESTADOS = {
  borrador:   { label:'Borrador',   ico:'📝', color:'var(--gris-500)',   bg:'var(--gris-100)' },
  pendiente:  { label:'Pendiente',  ico:'⏳', color:'var(--amarillo)',   bg:'var(--amarillo-light)' },
  aceptado:   { label:'Aceptado',   ico:'✅', color:'var(--verde)',      bg:'var(--verde-light)' },
  caducado:   { label:'Caducado',   ico:'⏰', color:'var(--rojo)',       bg:'var(--rojo-light)' },
  rechazado:  { label:'Rechazado',  ico:'❌', color:'var(--rojo)',       bg:'var(--rojo-light)' },
};

// ═══════════════════════════════════════════════
// HELPERS CADENA DE TRANSFORMACIÓN (build 135)
// Devuelve {tipo, doc, label, id, abrir} del último eslabón en la cadena
// presupuesto → pedido → recepción(albarán) → factura
// ═══════════════════════════════════════════════
function _prcCadenaFinal(p) {
  // 1) ¿Hay factura asociada a este presupuesto (directa o vía pedido/recepción)?
  const fps = typeof facturasProveedor !== 'undefined' ? facturasProveedor : [];
  const rcs = typeof recepciones !== 'undefined' ? recepciones : [];
  const pds = typeof pedidosCompra !== 'undefined' ? pedidosCompra : [];

  const pedidosDePrc = pds.filter(x => x.presupuesto_compra_id === p.id);
  const pedidoIds = pedidosDePrc.map(x => x.id);
  const recepcionesDePrc = rcs.filter(r => r.presupuesto_compra_id === p.id || (r.pedido_compra_id && pedidoIds.includes(r.pedido_compra_id)));
  const recepcionIds = recepcionesDePrc.map(r => r.id);
  const facturasDePrc = fps.filter(f => f.presupuesto_compra_id === p.id || (f.pedido_compra_id && pedidoIds.includes(f.pedido_compra_id)) || (f.recepcion_id && recepcionIds.includes(f.recepcion_id)));

  if (facturasDePrc.length) {
    const f = facturasDePrc[0];
    return { tipo:'factura', id:f.id, label:`🧾 FACTURA ${f.numero||''}`.trim(), abrir:`prcOpenFactura(${f.id})` };
  }
  if (recepcionesDePrc.length) {
    const r = recepcionesDePrc[0];
    return { tipo:'albaran', id:r.id, label:`📥 ALBARÁN ${r.numero||''}`.trim(), abrir:`prcOpenRecepcion(${r.id})` };
  }
  if (pedidosDePrc.length) {
    const pc = pedidosDePrc[0];
    return { tipo:'pedido', id:pc.id, label:`📦 PEDIDO ${pc.numero||''}`.trim(), abrir:`prcOpenPedido(${pc.id})` };
  }
  // Fallback: presupuesto bloqueado pero no encontramos doc destino
  return { tipo:null, id:null, label:`🔒 ${p.exportado_a||'Exportado'}`, abrir:null };
}

// Precarga ligera de los arrays de la cadena compras para que la píldora funcione
// la primera vez que se abre la pantalla de presupuestos (sin haber visitado pedidos/albaranes/facturas)
async function _prcPrecargarCadena() {
  if (!EMPRESA || !EMPRESA.id) return;
  try {
    const tasks = [];
    if (typeof pedidosCompra !== 'undefined' && pedidosCompra.length === 0) {
      tasks.push(
        sb.from('pedidos_compra').select('*').eq('empresa_id', EMPRESA.id)
          .then(({data}) => { if (data) pedidosCompra = data; })
      );
    }
    if (typeof recepciones !== 'undefined' && recepciones.length === 0) {
      tasks.push(
        sb.from('recepciones').select('*').eq('empresa_id', EMPRESA.id)
          .then(({data}) => { if (data) recepciones = data; })
      );
    }
    if (typeof facturasProveedor !== 'undefined' && facturasProveedor.length === 0) {
      tasks.push(
        sb.from('facturas_proveedor').select('*').eq('empresa_id', EMPRESA.id)
          .then(({data}) => { if (data) facturasProveedor = data; })
      );
    }
    await Promise.all(tasks);
  } catch(e) { console.warn('Precarga cadena parcial:', e); }
}

// Abren el documento destino en modal y recargan listas al cerrar
async function prcOpenPedido(id) {
  try {
    const arr = typeof pedidosCompra !== 'undefined' ? pedidosCompra : [];
    if (!arr.find(x => x.id === id)) {
      const { data } = await sb.from('pedidos_compra').select('*').eq('id', id).single();
      if (data) pedidosCompra.push(data);
    }
    if (typeof editarPedidoCompra === 'function') editarPedidoCompra(id);
    else goPage('pedidos-compra');
  } catch(e){ console.error(e); }
}
async function prcOpenRecepcion(id) {
  try {
    const arr = typeof recepciones !== 'undefined' ? recepciones : [];
    if (!arr.find(x => x.id === id)) {
      const { data } = await sb.from('recepciones').select('*').eq('id', id).single();
      if (data) recepciones.push(data);
    }
    if (typeof editarRecepcion === 'function') editarRecepcion(id);
    else goPage('albaranes-proveedor');
  } catch(e){ console.error(e); }
}
async function prcOpenFactura(id) {
  try {
    const arr = typeof facturasProveedor !== 'undefined' ? facturasProveedor : [];
    if (!arr.find(x => x.id === id)) {
      const { data } = await sb.from('facturas_proveedor').select('*').eq('id', id).single();
      if (data) facturasProveedor.push(data);
    }
    if (typeof editarFacturaProv === 'function') editarFacturaProv(id);
    else goPage('facturas-proveedor');
  } catch(e){ console.error(e); }
}

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadPresupuestosCompra() {
  if (!EMPRESA || !EMPRESA.id) return;
  const {data} = await sb.from('presupuestos_compra').select('*').eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false});
  presupuestosCompra = data || [];

  // build 137: precargar cadena relacionada (pedidos, recepciones, facturas) para que la
  // píldora "último eslabón" funcione incluso al abrir directamente la pantalla de presupuestos
  await _prcPrecargarCadena();

  // Auto-caducar: si valido_hasta < hoy y estado es borrador/enviado → caducado
  const hoy = new Date().toISOString().split('T')[0];
  for (const p of presupuestosCompra) {
    if (p.valido_hasta && p.valido_hasta < hoy && (p.estado === 'borrador' || p.estado === 'pendiente')) {
      p.estado = 'caducado';
      sb.from('presupuestos_compra').update({estado:'caducado'}).eq('id', p.id).then(()=>{});
    }
  }

  // Filtro por defecto: último año hasta hoy+1año
  const dEl = document.getElementById('prcFiltroDesde');
  const hEl = document.getElementById('prcFiltroHasta');
  if (dEl && !dEl.value) { const d=new Date(); d.setFullYear(d.getFullYear()-1); dEl.value = d.toISOString().split('T')[0]; }
  if (hEl && !hEl.value) { const d=new Date(); d.setFullYear(d.getFullYear()+1); hEl.value = d.toISOString().split('T')[0]; }

  filtrarPresupuestosCompra();
  actualizarKpisPrc();
}

function filtrarPresupuestosCompra() {
  const estSel = document.getElementById('prcFiltroEstado')?.value || '';
  const est = _prcKpiFilterActivo || estSel;
  const busq = (document.getElementById('prcSearch')?.value || '').toLowerCase().trim();
  const desde = document.getElementById('prcFiltroDesde')?.value || '';
  const hasta = document.getElementById('prcFiltroHasta')?.value || '';

  prcFiltrados = presupuestosCompra.filter(p => {
    // Filtro estado
    if (est === 'todos') { /* mostrar todo */ }
    else if (est) { if (p.estado !== est) return false; }
    else { if (p.estado === 'rechazado') return false; } // "Activos" = sin rechazados

    // Búsqueda texto
    if (busq) {
      const hayMatch = (p.numero||'').toLowerCase().includes(busq) ||
                        (p.proveedor_nombre||'').toLowerCase().includes(busq) ||
                        (p.observaciones||'').toLowerCase().includes(busq);
      if (!hayMatch) return false;
    }

    // Filtro fechas
    if (desde && p.fecha && p.fecha < desde) return false;
    if (hasta && p.fecha && p.fecha > hasta) return false;
    return true;
  });
  renderPresupuestosCompra(prcFiltrados);
}

function prcFiltrarPorKpi(estado) {
  _prcKpiFilterActivo = estado;
  document.querySelectorAll('.prc-kpi-filter').forEach(el => {
    el.style.outline = el.dataset.filtro === estado ? '2.5px solid var(--azul)' : 'none';
  });
  const sel = document.getElementById('prcFiltroEstado');
  if (sel) sel.value = '';
  filtrarPresupuestosCompra();
}

function renderPresupuestosCompra(list) {
  if (!list) list = presupuestosCompra;
  const tb = document.getElementById('prcTable');
  if (!tb) return;

  tb.innerHTML = list.length ? list.map(p => {
    const total = parseFloat(p.total||0);
    const est = PRC_ESTADOS[p.estado] || PRC_ESTADOS.borrador;
    const fechaStr = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
    const validezStr = p.valido_hasta ? new Date(p.valido_hasta).toLocaleDateString('es-ES') : '—';
    const obraNombre = p.trabajo_id ? (typeof trabajos!=='undefined'?trabajos:[]).find(t=>t.id==p.trabajo_id)?.titulo||'Obra asignada' : '';

    // Badge de estado clickable
    const badge = `<span onclick="prcCambiarEstadoMenu(event,${p.id})" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;background:${est.bg};color:${est.color}">${est.ico} ${est.label}</span>`;

    // Pill obra: SIEMPRE visible si hay obra asignada (en todos los estados) — build 132
    // Click navega directamente a ficha de obra. Sin icono ✎ (reasignación disponible desde modal edición).
    const obraPill = p.trabajo_id && obraNombre
      ? `<span onclick="event.stopPropagation();goPage('obras');abrirFichaObra('${p.trabajo_id}')" title="Ir a la obra" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:var(--verde-light);color:var(--verde);cursor:pointer">🏗️ ${obraNombre}</span>`
      : (!p.exportado_bloqueado && p.estado !== 'caducado'
          ? `<button onclick="event.stopPropagation();prcAsignarObra(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--verde);background:#fff;color:var(--verde);cursor:pointer">🏗️ Obra</button>`
          : '');

    // Acciones tipo pill
    let acciones = obraPill;
    if (p.exportado_bloqueado) {
      const cad = _prcCadenaFinal(p);
      if (cad.abrir) {
        acciones += ` <span onclick="event.stopPropagation();${cad.abrir}" title="Ir al documento" style="display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:var(--azul-light,#E0F2FE);color:var(--azul);cursor:pointer;border:1px solid var(--azul)">${cad.label}</span>`;
      } else {
        acciones += ` <span style="display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:var(--gris-100);color:var(--gris-500)">${cad.label}</span>`;
      }
    } else if (p.estado === 'caducado') {
      acciones += ` <button onclick="event.stopPropagation();prcReactivar(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--azul);background:#fff;color:var(--azul);cursor:pointer">🔄 Reactivar</button>`;
    } else if (p.estado === 'aceptado') {
      acciones += `
        <button onclick="event.stopPropagation();prcToPedido(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--azul);background:#fff;color:var(--azul);cursor:pointer">📦 Pedido</button>
        <button onclick="event.stopPropagation();prcToRecepcion(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--naranja);background:#fff;color:var(--naranja);cursor:pointer">📥 Albarán</button>
        <button onclick="event.stopPropagation();prcToFacturaProv(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--verde);background:#fff;color:var(--verde);cursor:pointer">🧾 Facturar</button>`;
    } else {
      // borrador o pendiente
      acciones += `
        <button onclick="event.stopPropagation();prcAceptar(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--verde);background:#fff;color:var(--verde);cursor:pointer">✅ Aceptar</button>
        <button onclick="event.stopPropagation();prcToPedido(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--azul);background:#fff;color:var(--azul);cursor:pointer">📦 Pedido</button>
        <button onclick="event.stopPropagation();prcToRecepcion(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--naranja);background:#fff;color:var(--naranja);cursor:pointer">📥 Albarán</button>
        <button onclick="event.stopPropagation();prcToFacturaProv(${p.id})" style="display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid var(--verde);background:#fff;color:var(--verde);cursor:pointer">🧾 Facturar</button>`;
    }

    return `<tr onclick="previewDoc('prc',${p.id})" style="cursor:pointer">
      <td>
        <strong style="color:var(--azul);font-family:monospace;font-size:12px">${p.numero||'—'}</strong>
        <div style="font-size:11px;color:var(--gris-400)">${fechaStr}</div>
      </td>
      <td><strong>${p.proveedor_nombre||'—'}</strong></td>
      <td style="font-size:12px">${fechaStr}</td>
      <td style="font-size:12px">${validezStr}</td>
      <td style="font-weight:700">${fmtE(total)}</td>
      <td>${badge}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">${acciones}</div>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7"><div class="empty"><div class="ei">📋</div><h3>Sin presupuestos de compra</h3><p>Crea tu primer presupuesto de compra</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════
function actualizarKpisPrc() {
  const noAnulados = presupuestosCompra.filter(p => p.estado !== 'rechazado');
  const el = id => document.getElementById(id);
  if (el('prcKpiTotal'))    el('prcKpiTotal').textContent = noAnulados.length;
  if (el('prcKpiAcept'))    el('prcKpiAcept').textContent = presupuestosCompra.filter(p => p.estado === 'aceptado').length;
  if (el('prcKpiPend'))     el('prcKpiPend').textContent = presupuestosCompra.filter(p => p.estado === 'pendiente').length;
  if (el('prcKpiCad'))      el('prcKpiCad').textContent = presupuestosCompra.filter(p => p.estado === 'caducado').length;
  if (el('prcKpiBorr'))     el('prcKpiBorr').textContent = presupuestosCompra.filter(p => p.estado === 'borrador').length;
  if (el('prcKpiImpPend'))  el('prcKpiImpPend').textContent = fmtE(presupuestosCompra.filter(p => p.estado==='borrador'||p.estado==='pendiente').reduce((s,p) => s+parseFloat(p.base_imponible||0),0));
  if (el('prcKpiImpAcep'))  el('prcKpiImpAcep').textContent = fmtE(presupuestosCompra.filter(p => p.estado==='aceptado').reduce((s,p) => s+parseFloat(p.base_imponible||0),0));
}

// ═══════════════════════════════════════════════
// ACCIONES RÁPIDAS
// ═══════════════════════════════════════════════
async function prcAceptar(id) {
  const ok = await confirmModal({titulo:'Aceptar presupuesto',mensaje:'¿Aceptar este presupuesto de compra?',btnOk:'Aceptar'}); if (!ok) return;
  await cambiarEstadoPrc(id, 'aceptado');
}

async function prcReactivar(id) {
  const okR = await confirmModal({titulo:'Reactivar presupuesto',mensaje:'¿Reactivar este presupuesto? Se volverá a poner como pendiente.',btnOk:'Reactivar'}); if (!okR) return;
  // Extender validez 30 días
  const v = new Date(); v.setDate(v.getDate() + 30);
  await sb.from('presupuestos_compra').update({estado:'pendiente', valido_hasta: v.toISOString().split('T')[0]}).eq('id', id);
  await loadPresupuestosCompra();
  toast('🔄 Presupuesto reactivado con nueva validez', 'success');
}

function prcCambiarEstadoMenu(event, id) {
  event.stopPropagation();
  const p = presupuestosCompra.find(x => x.id === id);
  if (!p) return;
  const opciones = ['borrador','pendiente','aceptado','rechazado','caducado'].filter(e => e !== p.estado && PRC_ESTADOS[e]);
  document.getElementById('prcEstadoMenu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'prcEstadoMenu';
  menu.style.cssText = `position:fixed;z-index:99999;background:#fff;border:1px solid var(--gris-200);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.12);padding:4px;min-width:180px;top:${event.clientY}px;left:${event.clientX}px`;
  menu.innerHTML = opciones.map(e => {
    const ec = PRC_ESTADOS[e];
    return `<div onclick="cambiarEstadoPrc(${id},'${e}');document.getElementById('prcEstadoMenu')?.remove()" style="padding:6px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px" onmouseover="this.style.background='var(--gris-100)'" onmouseout="this.style.background='transparent'">${ec.ico} ${ec.label}</div>`;
  }).join('');
  document.body.appendChild(menu);
  setTimeout(() => {
    const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 0);
}

function prcAsignarObra(id) {
  const obras = (typeof trabajos !== 'undefined' ? trabajos : []).filter(t => t.estado !== 'finalizada' && t.estado !== 'cancelada');
  if (!obras.length) { toast('No hay obras activas', 'info'); return; }

  // Crear modal mini para seleccionar obra
  let overlay = document.getElementById('prcObraOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'prcObraOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9999;display:flex;align-items:center;justify-content:center';
  const opts = obras.map(t => `<option value="${t.id}">${t.numero||''} — ${t.titulo||t.cliente_nombre||''}</option>`).join('');
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px 28px;min-width:380px;max-width:500px;box-shadow:0 12px 40px rgba(0,0,0,0.18)">
      <h3 style="margin:0 0 16px;font-size:16px;color:var(--gris-700)">🏗️ Asignar obra</h3>
      <select id="prcObraSelect" style="width:100%;padding:10px 12px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
        <option value="">— Selecciona obra —</option>
        ${opts}
      </select>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
        <button onclick="document.getElementById('prcObraOverlay').remove()" style="padding:8px 18px;border-radius:8px;border:1.5px solid var(--gris-200);background:#fff;cursor:pointer;font-size:13px;font-weight:600;color:var(--gris-500)">Cancelar</button>
        <button onclick="prcConfirmarObra(${id})" style="padding:8px 18px;border-radius:8px;border:none;background:var(--verde);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Asignar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function prcConfirmarObra(id) {
  const sel = document.getElementById('prcObraSelect');
  const obraId = parseInt(sel?.value);
  if (!obraId) { toast('Selecciona una obra', 'info'); return; }
  document.getElementById('prcObraOverlay')?.remove();
  await sb.from('presupuestos_compra').update({trabajo_id: obraId}).eq('id', id);
  await propagarObraCompras(obraId, { presupuesto_compra_id: id });
  await loadPresupuestosCompra();
  toast('🏗️ Obra asignada y propagada', 'success');
}

// ═══════════════════════════════════════════════
// CREAR NUEVO PRESUPUESTO
// ═══════════════════════════════════════════════
async function nuevoPresupuestoCompra() {
  prcLineas = [];
  prcEditId = null;
  prcProveedorActual = null;

  const sel = document.getElementById('prc_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('prc_fecha').value = hoy;
  // Validez: 30 días por defecto
  const val = new Date(); val.setDate(val.getDate() + 30);
  document.getElementById('prc_validez').value = val.toISOString().split('T')[0];

  document.getElementById('prc_numero').value = await generarNumeroDoc('presupuesto_compra');
  document.getElementById('prc_observaciones').value = '';
  document.getElementById('mPRCTit').textContent = 'Nuevo Presupuesto de Compra';
  poblarSelectorObra('prc_obra', null);

  // Mostrar botón borrador en nuevo
  const btnBorr = document.getElementById('prcBtnBorrador');
  if (btnBorr) btnBorr.style.display = '';

  prc_addLinea();
  // Reset bloqueo/banner (por si antes se abrió uno bloqueado)
  const banner = document.getElementById('prcBloqueoBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  _prcAplicarBloqueo(false);
  openModal('mPresupuestoCompra');
  if (typeof dirtyInit === 'function') { dirtyInit('mPresupuestoCompra'); dirtyReset('mPresupuestoCompra'); }
}

// ═══════════════════════════════════════════════
// EDITAR PRESUPUESTO
// ═══════════════════════════════════════════════
// Aplica/quita bloqueo visual al modal de PRC
function _prcAplicarBloqueo(bloqueado) {
  const modal = document.getElementById('mPresupuestoCompra');
  if (!modal) return;
  const ids = ['prc_proveedor','prc_numero','prc_fecha','prc_validez','prc_obra','prc_observaciones'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === 'SELECT') el.disabled = bloqueado;
      else el.readOnly = bloqueado;
      el.style.opacity = bloqueado ? '0.7' : '';
    }
  });
  // Bloquear líneas (inputs, selects, y botón +/✕)
  modal.querySelectorAll('#prc_lineas input, #prc_lineas select').forEach(el => {
    if (el.tagName === 'SELECT') el.disabled = bloqueado;
    else el.readOnly = bloqueado;
    el.style.pointerEvents = bloqueado ? 'none' : '';
  });
  modal.querySelectorAll('#prc_lineas button').forEach(btn => {
    btn.style.display = bloqueado ? 'none' : '';
  });
  // Botón "+ Añadir línea" (está en el header de líneas)
  modal.querySelectorAll('.modal-b button').forEach(btn => {
    const txt = (btn.textContent||'').trim();
    if (txt.startsWith('+ Añadir línea')) btn.style.display = bloqueado ? 'none' : '';
  });
  // Botones de guardar del footer
  const btnBorr = document.getElementById('prcBtnBorrador');
  if (btnBorr) btnBorr.style.display = bloqueado ? 'none' : '';
  const footer = modal.querySelector('.modal-f');
  if (footer) {
    footer.querySelectorAll('button').forEach(btn => {
      const txt = (btn.textContent||'').trim();
      if (txt.includes('Guardar') || txt.includes('Borrador')) {
        btn.style.display = bloqueado ? 'none' : '';
      }
    });
  }
}

async function editarPresupuestoCompra(id) {
  const p = presupuestosCompra.find(x => x.id === id);
  if (!p) return;

  prcEditId = id;
  prcProveedorActual = p.proveedor_id;
  prcLineas = (p.lineas || []).map(l => ({
    articulo_id: l.articulo_id || null,
    codigo: l.codigo || '',
    nombre: l.nombre || l.desc || l.descripcion || '',
    cantidad: l.cantidad || l.cant || 0,
    precio: l.precio || 0,
    iva: l.iva !== undefined ? l.iva : 21
  }));

  const sel = document.getElementById('prc_proveedor');
  sel.innerHTML = (proveedores||[]).map(pr => `<option value="${pr.id}" ${pr.id===p.proveedor_id?'selected':''}>${pr.nombre}</option>`).join('');

  document.getElementById('prc_numero').value = p.numero || '';
  document.getElementById('prc_fecha').value = p.fecha || '';
  document.getElementById('prc_validez').value = p.valido_hasta || '';
  document.getElementById('prc_observaciones').value = p.observaciones || '';
  poblarSelectorObra('prc_obra', p.trabajo_id);

  document.getElementById('mPRCTit').textContent = 'Editar Presupuesto de Compra';

  // Ocultar botón borrador al editar (ya está guardado)
  const btnBorr = document.getElementById('prcBtnBorrador');
  if (btnBorr) btnBorr.style.display = 'none';

  if (prcLineas.length === 0) prc_addLinea();
  prc_renderLineas();
  openModal('mPresupuestoCompra');
  if (typeof dirtyInit === 'function') { dirtyInit('mPresupuestoCompra'); dirtyReset('mPresupuestoCompra'); }

  // ── Bloqueo: fuera de borrador, inmutable (patrón ventas) ──
  const banner = document.getElementById('prcBloqueoBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  const bloqueado = p.estado && p.estado !== 'borrador';
  _prcAplicarBloqueo(bloqueado);
  if (bloqueado && banner) {
    const estLabel = (PRC_ESTADOS[p.estado]?.label) || p.estado;
    banner.style.display = 'block';
    banner.innerHTML = `🔒 <strong>Documento no editable</strong> — estado actual: <em>${estLabel}</em>. Para modificarlo, cámbialo antes a <strong>Borrador</strong> desde la pastilla de estado en el listado.`;
  }
}

// ═══════════════════════════════════════════════
// GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function prc_addLinea() {
  prcLineas.push({articulo_id:null, codigo:'', nombre:'', cantidad:1, precio:0, dto1:0, dto2:0, dto3:0, iva:21});
  prc_renderLineas();
  setTimeout(()=>{
    const inp = document.querySelector('#prc_lineas input[data-ac="articulos"]');
    const all = document.querySelectorAll('#prc_lineas input[data-ac="articulos"]');
    const last = all[all.length-1];
    if (last) last.focus();
  },50);
}

function prc_removeLinea(idx) {
  prcLineas.splice(idx, 1);
  prc_renderLineas();
}

let _prcArtSelecting = false;
function prc_updateLinea(idx, field, val) {
  // Si se acaba de seleccionar un artículo, no dejar que onblur sobreescriba nombre con el texto parcial
  if (field === 'nombre' && _prcArtSelecting) return;
  if (field === 'articulo_id') {
    const art = (articulos||[]).find(a => a.id == val);
    if (art) {
      prcLineas[idx].articulo_id = art.id;
      prcLineas[idx].codigo = art.codigo;
      prcLineas[idx].nombre = art.nombre;
      prcLineas[idx].precio = art.precio_coste || 0;
      prcLineas[idx].iva = art.iva_default || 21;
    }
  } else if (['cantidad','precio','dto1','dto2','dto3','iva'].includes(field)) {
    prcLineas[idx][field] = parseFloat(val) || 0;
  } else {
    prcLineas[idx][field] = val;
  }
  prc_renderLineas();
}

function _prc_onSelectArt(lineaIdx, art) {
  _prcArtSelecting = true;
  prcLineas[lineaIdx].articulo_id = art.id;
  prcLineas[lineaIdx].codigo = art.codigo || '';
  prcLineas[lineaIdx].nombre = art.nombre || '';
  prcLineas[lineaIdx].precio = art.precio_coste || art.precio_venta || 0;
  if (art.tipo_iva_id && typeof tiposIva!=='undefined') {
    const t = tiposIva.find(x=>x.id===art.tipo_iva_id);
    if (t) prcLineas[lineaIdx].iva = t.porcentaje;
  }
  // Defer render to avoid blur/innerHTML race condition
  setTimeout(() => { prc_renderLineas(); }, 0);
  toast(`📦 ${art.codigo||''} — ${art.nombre}`,'info');
  setTimeout(() => { _prcArtSelecting = false; }, 300);
}

function prc_renderLineas() {
  let base = 0, ivaTotal = 0;
  const _n = (v) => `<input type="number" value="${v}" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"`;
  const html = prcLineas.map((l, i) => {
    const d1 = l.dto1 || 0, d2 = l.dto2 || 0, d3 = l.dto3 || 0;
    const bruto = l.cantidad * l.precio;
    const subtotal = bruto * (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
    const ivaAmt = subtotal * (l.iva / 100);
    base += subtotal;
    ivaTotal += ivaAmt;
    const descVal = l.nombre || '';
    const ivaOpts = (tiposIva||[]).map(t => `<option value="${t.porcentaje}" ${t.porcentaje===l.iva?'selected':''}>${t.porcentaje}%</option>`).join('');
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 6px">
        <input value="${descVal}" placeholder="Código o descripción del artículo..."
          data-ac="articulos" data-linea-idx="${i}"
          oninput="acBuscarArticulo(this, _prc_onSelectArt, 'precio_coste')"
          onkeydown="acKeydown(event)"
          onfocus="if(this.value.length>=1)acBuscarArticulo(this, _prc_onSelectArt, 'precio_coste')"
          onblur="setTimeout(()=>{const d=document.getElementById('acArticulos');if(d)d.style.display='none'},200);prc_updateLinea(${i},'nombre',this.value)"
          autocomplete="off"
          style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent">
      </td>
      <td style="padding:7px 6px">${_n(l.cantidad)} min="0.01" step="0.01" onchange="prc_updateLinea(${i},'cantidad',this.value)"></td>
      <td style="padding:7px 6px">${_n(l.precio)} min="0" step="0.01" onchange="prc_updateLinea(${i},'precio',this.value)"></td>
      <td style="padding:7px 2px">${_n(d1)} min="0" max="100" step="0.5" onchange="prc_updateLinea(${i},'dto1',this.value)" placeholder="%"></td>
      <td style="padding:7px 2px">${_n(d2)} min="0" max="100" step="0.5" onchange="prc_updateLinea(${i},'dto2',this.value)" placeholder="%"></td>
      <td style="padding:7px 2px">${_n(d3)} min="0" max="100" step="0.5" onchange="prc_updateLinea(${i},'dto3',this.value)" placeholder="%"></td>
      <td style="padding:7px 6px">
        <select onchange="prc_updateLinea(${i},'iva',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${ivaOpts}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px;white-space:nowrap">${fmtE(subtotal+ivaAmt)}</td>
      <td style="padding:7px 4px"><button onclick="prc_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button></td>
    </tr>`;
  }).join('');

  document.getElementById('prc_lineas').innerHTML = html;
  document.getElementById('prc_base').textContent = fmtE(base);
  document.getElementById('prc_iva_total').textContent = fmtE(ivaTotal);
  document.getElementById('prc_total').textContent = fmtE(base + ivaTotal);
}

// ═══════════════════════════════════════════════
// GUARDAR PRESUPUESTO
// ═══════════════════════════════════════════════
async function guardarPresupuestoCompra(estado) {
  if (_creando) return;
  _creando = true;
  try {
    const numero = v('prc_numero').trim();
    const provId = parseInt(document.getElementById('prc_proveedor').value);
    const fecha = v('prc_fecha');
    const validez = v('prc_validez');

    if (!numero) { toast('Introduce número de presupuesto', 'error'); return; }
    if (!provId) { toast('Selecciona proveedor', 'error'); return; }
    if (prcLineas.length === 0) { toast('Agrega al menos una línea', 'error'); return; }

    const prov = (proveedores||[]).find(p => p.id === provId);
    let base = 0, ivaTotal = 0;
    prcLineas.forEach(l => {
      const bruto = l.cantidad * l.precio;
      const subtotal = bruto * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
      base += subtotal;
      ivaTotal += subtotal * (l.iva / 100);
    });

    const obj = {
      empresa_id: EMPRESA.id,
      numero,
      proveedor_id: provId,
      proveedor_nombre: prov?.nombre || '',
      fecha,
      valido_hasta: validez,
      estado,
      base_imponible: base,
      total_iva: ivaTotal,
      total: base + ivaTotal,
      lineas: prcLineas,
      observaciones: v('prc_observaciones'),
      trabajo_id: parseInt(document.getElementById('prc_obra')?.value) || null
    };

    let err;
    if (prcEditId) {
      const r = await sb.from('presupuestos_compra').update(obj).eq('id', prcEditId);
      err = r.error;
    } else {
      const r = await sb.from('presupuestos_compra').insert(obj);
      err = r.error;
    }

    if (err) { toast('Error: ' + err.message, 'error'); return; }

    // Propagar obra a toda la cadena si se ha asignado
    if (obj.trabajo_id && prcEditId) {
      await propagarObraCompras(obj.trabajo_id, { presupuesto_compra_id: prcEditId });
    }

    closeModal('mPresupuestoCompra');
    await loadPresupuestosCompra();
    toast(prcEditId ? 'Presupuesto actualizado ✓' : 'Presupuesto creado ✓', 'success');
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
// CAMBIAR ESTADO
// ═══════════════════════════════════════════════
async function cambiarEstadoPrc(id, nuevoEstado) {
  await sb.from('presupuestos_compra').update({estado: nuevoEstado}).eq('id', id);
  const p = presupuestosCompra.find(x => x.id === id);
  if (p) p.estado = nuevoEstado;
  filtrarPresupuestosCompra();
  actualizarKpisPrc();
  toast('Estado actualizado', 'success');
}

// ═══════════════════════════════════════════════
// ELIMINAR
// ═══════════════════════════════════════════════
async function eliminarPresupuestoCompra(id) {
  const okDel = await confirmModal({titulo:'Eliminar presupuesto',mensaje:'¿Eliminar este presupuesto de compra?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!okDel) return;
  await sb.from('presupuestos_compra').delete().eq('id', id);
  presupuestosCompra = presupuestosCompra.filter(p => p.id !== id);
  filtrarPresupuestosCompra();
  actualizarKpisPrc();
  toast('Eliminado', 'info');
}

// ═══════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════
async function exportPresupuestosCompra() {
  const data = prcFiltrados.length ? prcFiltrados : presupuestosCompra;
  if (!data.length) { toast('No hay datos para exportar', 'info'); return; }
  const okExp = await confirmModal({titulo:'Exportar',mensaje:`¿Exportar ${data.length} presupuesto(s) de compra a Excel?`,btnOk:'Exportar'}); if (!okExp) return;
  const rows = data.map(p => ({
    'Número': p.numero,
    'Fecha': p.fecha,
    'Proveedor': p.proveedor_nombre,
    'Estado': p.estado,
    'Validez': p.valido_hasta,
    'Base': parseFloat(p.base_imponible||0),
    'IVA': parseFloat(p.total_iva||0),
    'Total': parseFloat(p.total||0)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Presupuestos Compra');
  XLSX.writeFile(wb, `presupuestos_compra_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Exportado ✓', 'success');
}

// ═══════════════════════════════════════════════
// CONVERSIONES
// ═══════════════════════════════════════════════

async function prcToPedido(id) {
  if (_creando) return;
  _creando = true;
  try {
    const p = presupuestosCompra.find(x => x.id === id);
    if (!p) return;
    if (p.exportado_bloqueado) { toast('🔒 Este presupuesto ya fue exportado a '+p.exportado_a,'error'); return; }
    const okPed = await confirmModal({titulo:'Crear pedido',mensaje:`¿Crear pedido de compra desde ${p.numero}?`,btnOk:'Crear pedido'}); if (!okPed) return;
    const numero = await generarNumeroDoc('pedido_compra');
    const { error } = await sb.from('pedidos_compra').insert({
      empresa_id: EMPRESA.id, numero,
      proveedor_id: p.proveedor_id, proveedor_nombre: p.proveedor_nombre,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'borrador',
      observaciones: p.observaciones,
      lineas: p.lineas,
      base_imponible: p.base_imponible || p.total,
      total_iva: p.total_iva || 0,
      total: p.total,
      presupuesto_compra_id: p.id,
      trabajo_id: p.trabajo_id || null,
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('presupuestos_compra').update({ estado: 'aceptado', exportado_a:'pedido', exportado_bloqueado:true }).eq('id', id);
    const pp = presupuestosCompra.find(x => x.id === id); if (pp) { pp.estado = 'aceptado'; pp.exportado_a='pedido'; pp.exportado_bloqueado=true; }
    filtrarPresupuestosCompra(); actualizarKpisPrc();
    toast('📦 Pedido creado — presupuesto bloqueado', 'success');
  } finally {
    _creando = false;
  }
}

async function prcToRecepcion(id) {
  if (_creando) return;
  _creando = true;
  try {
    const p = presupuestosCompra.find(x => x.id === id);
    if (!p) return;
    if (p.exportado_bloqueado) { toast('🔒 Este presupuesto ya fue exportado a '+p.exportado_a,'error'); return; }
    const okAlb = await confirmModal({titulo:'Crear albarán',mensaje:`¿Crear albarán de proveedor desde ${p.numero}?`,btnOk:'Crear albarán'}); if (!okAlb) return;
    const numero = await generarNumeroDoc('recepcion');
    const lineas = (p.lineas || []).map(l => ({
      ...l, cantidad_pedida: l.cant || l.cantidad || 0, cantidad_recibida: 0
    }));
    const { error } = await sb.from('recepciones').insert({
      empresa_id: EMPRESA.id, numero,
      proveedor_id: p.proveedor_id, proveedor_nombre: p.proveedor_nombre,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'pendiente',
      observaciones: p.observaciones,
      lineas,
      // (recepciones no tiene columna 'total' — se recalcula desde lineas en render — build 135)
      presupuesto_compra_id: p.id,
      trabajo_id: p.trabajo_id || null,
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('presupuestos_compra').update({ estado: 'aceptado', exportado_a:'recepcion', exportado_bloqueado:true }).eq('id', id);
    const pp = presupuestosCompra.find(x => x.id === id); if (pp) { pp.estado = 'aceptado'; pp.exportado_a='recepcion'; pp.exportado_bloqueado=true; }
    filtrarPresupuestosCompra(); actualizarKpisPrc();
    toast('📥 Albarán proveedor creado — presupuesto bloqueado', 'success');
    goPage('albaranes-proveedor');
  } finally {
    _creando = false;
  }
}

async function prcToFacturaProv(id) {
  if (_creando) return;
  _creando = true;
  try {
    const p = presupuestosCompra.find(x => x.id === id);
    if (!p) return;
    if (p.exportado_bloqueado) { toast('🔒 Este presupuesto ya fue exportado a '+p.exportado_a,'error'); return; }
    const okFact = await confirmModal({titulo:'Crear factura',mensaje:`¿Crear factura de proveedor desde ${p.numero}?`,btnOk:'Crear factura'}); if (!okFact) return;
    const numero = await generarNumeroDoc('factura_proveedor');
    const hoy = new Date(); const venc = new Date(); venc.setDate(venc.getDate() + 30);
    const { data: fpPrc, error } = await sb.from('facturas_proveedor').insert({
      empresa_id: EMPRESA.id, numero,
      proveedor_id: p.proveedor_id, proveedor_nombre: p.proveedor_nombre,
      fecha: hoy.toISOString().split('T')[0],
      fecha_vencimiento: venc.toISOString().split('T')[0],
      base_imponible: p.base_imponible || p.total || 0,
      total_iva: p.total_iva || 0,
      total: p.total || 0,
      estado: 'pendiente',
      observaciones: p.observaciones,
      lineas: p.lineas,
      presupuesto_compra_id: p.id,
      trabajo_id: p.trabajo_id || null,
    }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (typeof _contAutoContabilizar === 'function' && fpPrc?.id) {
      _contAutoContabilizar('compra', fpPrc.id).catch(e => console.warn('[Contab]', e));
    }
    await sb.from('presupuestos_compra').update({ estado: 'aceptado', exportado_a:'factura_proveedor', exportado_bloqueado:true }).eq('id', id);
    const pp = presupuestosCompra.find(x => x.id === id); if (pp) { pp.estado = 'aceptado'; pp.exportado_a='factura_proveedor'; pp.exportado_bloqueado=true; }
    filtrarPresupuestosCompra(); actualizarKpisPrc();
    toast('🧾 Factura proveedor creada — presupuesto bloqueado', 'success');
    goPage('facturas-proveedor');
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  IMPRIMIR / PDF / EMAIL PRESUPUESTO COMPRA
// ═══════════════════════════════════════════════
async function imprimirPresupuestoCompra(id) {
  const p = presupuestosCompra.find(x=>x.id===id);
  if (!p) { toast('No encontrado','error'); return; }
  const prov = (proveedores||[]).find(x=>x.id===p.proveedor_id);
  const lineas = p.lineas||[];
  let htmlLineas='', baseCalc=0, ivaCalc=0;
  lineas.forEach(l=>{
    const cant = l.cantidad||l.cant||0;
    const precio = l.precio||0;
    const iva = l.iva !== undefined ? l.iva : 21;
    const bruto = cant * precio;
    const sub = bruto * (1-(l.dto1||0)/100) * (1-(l.dto2||0)/100) * (1-(l.dto3||0)/100);
    const ivaAmt = sub * (iva/100);
    baseCalc += sub;
    ivaCalc += ivaAmt;
    htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.nombre||l.desc||l.descripcion||''}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${cant}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${precio.toFixed(2)} €</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${iva}%</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${(sub+ivaAmt).toFixed(2)} €</td></tr>`;
  });
  const dirEmpresa=[EMPRESA?.direccion,[EMPRESA?.cp,EMPRESA?.municipio].filter(Boolean).join(' '),EMPRESA?.provincia].filter(Boolean).join(', ');
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:8px">`:`<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const totalFinal = p.total || (baseCalc + ivaCalc);
  const win=window.open('','_blank','width=850,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Pres. Compra ${p.numero}</title><style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style></head><body><div class="no-print btn-bar"><button style="background:#1e40af;color:#fff" onclick="window.print()">🖨️ Imprimir</button><button style="background:#e2e8f0;color:#475569" onclick="window.close()">✕ Cerrar</button></div><div class="page"><div style="display:flex;gap:24px;margin-bottom:16px"><div style="flex:1"><div style="display:flex;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div><div style="font-size:11px;color:#475569">${dirEmpresa}<br>CIF: ${EMPRESA?.cif||''}</div></div></div></div><div style="flex:1"><div style="background:#fef3c7;border-radius:8px;padding:12px 16px;border-left:4px solid #f59e0b"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;margin-bottom:4px">PROVEEDOR</div><div style="font-size:15px;font-weight:700">${p.proveedor_nombre||'—'}</div><div style="font-size:11px;color:#475569">${prov?.direccion||''} ${prov?.cif?'<br>CIF: '+prov.cif:''}</div></div></div></div><div style="display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px"><div style="color:#1e40af"><span style="font-size:14px;font-weight:800">PRESUPUESTO COMPRA</span> <span style="font-size:11px;color:#475569">${p.numero||''}</span></div><div style="font-size:11px;color:#64748b">Fecha: <b>${p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'}</b>${p.valido_hasta?' · Válido hasta: <b>'+new Date(p.valido_hasta).toLocaleDateString('es-ES')+'</b>':''}</div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><thead><tr><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:60px">Cant.</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:90px">Precio</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:50px">IVA</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Total</th></tr></thead><tbody>${htmlLineas}</tbody></table><div style="display:flex;justify-content:flex-end"><div style="width:240px;background:#fef3c7;border-radius:8px;padding:12px 16px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:4px"><span>Base imponible</span><span>${(p.base_imponible||baseCalc).toFixed(2)} €</span></div><div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px"><span>IVA</span><span>${(p.total_iva||ivaCalc).toFixed(2)} €</span></div><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;border-top:1.5px solid #d97706;padding-top:6px"><span>TOTAL</span><span style="color:#92400e">${totalFinal.toFixed(2)} €</span></div></div></div>${p.observaciones?`<div style="margin-top:14px;padding:10px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">Observaciones</div><div style="font-size:11px;color:#475569">${p.observaciones}</div></div>`:''}</div></body></html>`);
  win.document.close();

  // Generar PDF con jsPDF y firmar
  if (typeof firmarYGuardarPDF === 'function' && window.jspdf) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p','mm','a4');
      const ML=15,MR=15,W=210;
      let y=20;
      doc.setFontSize(16);doc.setFont(undefined,'bold');doc.setTextColor(30,64,175);
      doc.text(EMPRESA?.nombre||'',ML,y);y+=6;
      doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(71,85,105);
      doc.text(`CIF: ${EMPRESA?.cif||''} · ${EMPRESA?.direccion||''} ${EMPRESA?.cp||''} ${EMPRESA?.municipio||''}`,ML,y);y+=10;
      doc.setFontSize(14);doc.setFont(undefined,'bold');doc.setTextColor(30,64,175);
      doc.text('PRESUPUESTO COMPRA',ML,y);
      doc.setFontSize(11);doc.setFont(undefined,'normal');doc.setTextColor(71,85,105);
      doc.text(p.numero||'',ML+75,y);y+=6;
      doc.setFontSize(10);doc.text('Fecha: '+(p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'),ML,y);
      if(p.valido_hasta)doc.text(' · Válido hasta: '+new Date(p.valido_hasta).toLocaleDateString('es-ES'),ML+60,y);
      y+=8;
      doc.setFontSize(11);doc.setFont(undefined,'bold');doc.setTextColor(146,64,14);
      doc.text('PROVEEDOR',ML,y);y+=5;
      doc.setFontSize(12);doc.setTextColor(0,0,0);doc.text(p.proveedor_nombre||'—',ML,y);y+=5;
      if(prov?.cif){doc.setFontSize(9);doc.setTextColor(71,85,105);doc.text('CIF: '+prov.cif,ML,y);y+=4;}
      if(prov?.direccion){doc.text(prov.direccion,ML,y);y+=6;}else{y+=4;}
      y+=4;
      const headers=[['Descripción','Cant.','Precio','IVA','Total']];
      const rows=lineas.map(l=>{const cant=l.cantidad||l.cant||0;const precio=l.precio||0;const iva=l.iva!==undefined?l.iva:21;const bruto=cant*precio;const sub=bruto*(1-(l.dto1||0)/100)*(1-(l.dto2||0)/100)*(1-(l.dto3||0)/100);const total=sub+sub*(iva/100);return[l.nombre||l.desc||l.descripcion||'',String(cant),precio.toFixed(2)+' €',iva+'%',total.toFixed(2)+' €'];});
      doc.autoTable({startY:y,head:headers,body:rows,styles:{fontSize:9},headStyles:{fillColor:[146,64,14]},margin:{left:ML,right:MR}});
      y=doc.lastAutoTable.finalY+8;
      doc.setFontSize(10);doc.setFont(undefined,'normal');doc.setTextColor(146,64,14);
      doc.text('Base: '+(p.base_imponible||baseCalc).toFixed(2)+' € · IVA: '+(p.total_iva||ivaCalc).toFixed(2)+' €',ML,y);y+=6;
      doc.setFontSize(13);doc.setFont(undefined,'bold');
      doc.text('TOTAL: '+totalFinal.toFixed(2)+' €',W-MR,y,{align:'right'});
      if(p.observaciones){y+=8;doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(71,85,105);doc.text('Observaciones:',ML,y);y+=4;doc.setTextColor(0,0,0);const ol=doc.splitTextToSize(p.observaciones,W-ML-MR);doc.text(ol,ML,y);}
      const pdfData=doc.output('arraybuffer');
      firmarYGuardarPDF(pdfData,{tipo_documento:'presupuesto_compra',documento_id:p.id,numero:p.numero,entidad_tipo:'proveedor',entidad_id:p.proveedor_id,entidad_nombre:p.proveedor_nombre||prov?.nombre||''}).then(r=>{if(r&&r.success&&r.firma_info)toast('🔏 Presupuesto compra firmado digitalmente ✓','success');else if(r&&!r.firmado)toast('📄 Presupuesto compra guardado (sin firma digital)','info');}).catch(e=>{console.error('Error firmando pres. compra:',e);toast('⚠️ Error al firmar presupuesto compra','error');});
    } catch(e) { console.error('Error generando PDF pres. compra:', e); }
  }
}

function enviarPresupuestoCompraEmail(id) {
  const p = presupuestosCompra.find(x=>x.id===id);
  if (!p) return;
  const prov = (proveedores||[]).find(x=>x.id===p.proveedor_id);
  const email = prov?.email||'';
  const asuntoTxt = `Solicitud presupuesto ${p.numero||''} — ${EMPRESA?.nombre||''}`;
  const cuerpoTxt = `Estimados,\n\nLes solicitamos presupuesto para los siguientes artículos/servicios:\n\nReferencia: ${p.numero||''}\nFecha: ${p.fecha||''}\n\nQuedamos a la espera de su oferta.\n\nUn saludo,\n${EMPRESA?.nombre||''}\n${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}`;
  if (typeof nuevoCorreo === 'function') {
    nuevoCorreo(email, asuntoTxt, cuerpoTxt, { tipo: 'presupuesto_compra', id: p.id, ref: p.numero || '' });
    if (typeof goPage === 'function') goPage('correo');
  } else {
    toast('Módulo de correo no disponible','error');
  }
}

// ═══════════════════════════════════════════════
// SMART CLOSE (botón ← atrás)
// ═══════════════════════════════════════════════
async function prcSmartClose() {
  // Si está bloqueado (solo lectura por exportación a pedido), cerrar sin más
  const banner = document.getElementById('prcBloqueoBanner');
  if (banner && banner.style.display !== 'none') { closeModal('mPresupuestoCompra'); return; }
  const isNew = !prcEditId;
  const prov = document.getElementById('prc_proveedor')?.value;
  const obs  = document.getElementById('prc_observaciones')?.value?.trim();
  const lineasConDatos = Array.isArray(prcLineas) && prcLineas.some(l => l && (l.articulo_id || l.codigo || (l.nombre && String(l.nombre).trim()) || Number(l.precio) > 0));
  const hasContent = !!(prov || obs || lineasConDatos);
  const isDirty = typeof dirtyIs === 'function' ? dirtyIs('mPresupuestoCompra') : true;
  await smartClose({
    isNew, isDirty, hasContent,
    guardar: async (estado) => { await guardarPresupuestoCompra(estado || 'pendiente'); },
    cerrar:  () => closeModal('mPresupuestoCompra'),
    titulo:  'presupuesto de compra'
  });
}
window.prcSmartClose = prcSmartClose;
