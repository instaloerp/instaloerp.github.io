/**
 * MÓDULO FACTURAS DE PROVEEDOR
 * Gestión de facturas de proveedores: emisión, pago y control
 */

// ═══════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let fpLineas = [];
let fpProveedorActual = null;
let fpEditId = null;
let facturasProveedor = [];
let fpFiltrados = [];
let _fpKpiFilterActivo = null;

// ═══════════════════════════════════════════════
// MAPA DE ESTADOS (uniforme compras)
// ═══════════════════════════════════════════════
const FP_ESTADOS = {
  pendiente: { label:'Pendiente', ico:'⏳', color:'var(--amarillo)', bg:'var(--amarillo-light)' },
  pagada:    { label:'Pagada',    ico:'✅', color:'var(--verde)',    bg:'var(--verde-light)' },
  vencida:   { label:'Vencida',   ico:'🔴', color:'var(--rojo)',     bg:'var(--rojo-light)' },
  anulada:   { label:'Anulada',   ico:'❌', color:'var(--gris-500)', bg:'var(--gris-100)' },
};
function _fpEstadoEfectivo(f) {
  if (f.estado === 'pendiente' && f.fecha_vencimiento && new Date(f.fecha_vencimiento) < new Date()) return 'vencida';
  return f.estado;
}

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadFacturasProv() {
  if (!EMPRESA || !EMPRESA.id) return;
  const {data} = await sb.from('facturas_proveedor').select('*').eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false});
  facturasProveedor = data || [];
  // Filtro por defecto: año anterior a año siguiente
  const y = new Date().getFullYear();
  const dEl = document.getElementById('fpFiltroDesde');
  const hEl = document.getElementById('fpFiltroHasta');
  if (dEl && !dEl.value) dEl.value = (y-1) + '-01-01';
  if (hEl && !hEl.value) hEl.value = (y+1) + '-12-31';
  filtrarFacturasProv();
  actualizarKpisFacturas();
}

function renderFacturasProv(list) {
  fpFiltrados = list || [];
  const pill = (color) =>
    `display:inline-flex;align-items:center;gap:3px;padding:4px 12px;border-radius:20px;font-size:11.5px;font-weight:600;border:1.5px solid ${color};background:#fff;color:${color};cursor:pointer`;

  const html = list.length ? list.map(fp => {
    const estEf = _fpEstadoEfectivo(fp);
    const ec = FP_ESTADOS[estEf] || { ico:'?', label:fp.estado, color:'var(--gris-500)', bg:'var(--gris-100)' };
    const obraNombre = fp.trabajo_id ? ((typeof trabajos!=='undefined'?trabajos:[]).find(t=>t.id===fp.trabajo_id)?.titulo || '') : '';

    let acciones = '';
    if (fp.estado === 'pendiente') {
      acciones += `<button onclick="event.stopPropagation();pagarFacturaProv(${fp.id})" style="${pill('var(--verde)')}" title="Marcar como pagada">💰 Pagar</button>`;
    }
    acciones += `<button onclick="event.stopPropagation();imprimirFacturaProv(${fp.id})" style="${pill('var(--gris-500)')}" title="Imprimir">🖨️</button>`;
    acciones += `<button onclick="event.stopPropagation();enviarFacturaProvEmail(${fp.id})" style="${pill('var(--azul)')}" title="Enviar por email">📧</button>`;
    if (!fp.trabajo_id && fp.estado !== 'anulada') {
      acciones += `<button onclick="event.stopPropagation();fpAsignarObra(${fp.id})" style="${pill('var(--gris-500)')}" title="Asignar a obra">🏗️ Obra</button>`;
    }

    return `<tr style="cursor:pointer" onclick="editarFacturaProv(${fp.id})">
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">
        <div>${fp.numero}</div>
        <div style="font-size:11px;color:var(--gris-400);font-family:inherit">${new Date(fp.fecha).toLocaleDateString('es-ES')}</div>
      </td>
      <td>
        <div style="font-weight:600">${fp.proveedor_nombre}</div>
        ${obraNombre ? `<div style="font-size:11px;color:var(--gris-400)">🏗️ ${obraNombre}</div>` : ''}
      </td>
      <td style="font-size:12.5px">${fp.fecha_vencimiento ? new Date(fp.fecha_vencimiento).toLocaleDateString('es-ES') : '—'}</td>
      <td onclick="event.stopPropagation();fpCambiarEstadoMenu(${fp.id}, event)">
        <span title="Click para cambiar estado" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${ec.color};background:${ec.bg};cursor:pointer">${ec.ico} ${ec.label}</span>
      </td>
      <td style="text-align:right;font-weight:700;font-size:12.5px">${fmtE(fp.total)}</td>
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:4px;flex-wrap:wrap">${acciones}</div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty"><div class="ei">📑</div><h3>Sin facturas</h3></div></td></tr>';
  document.getElementById('fpTable').innerHTML = html;
}

function actualizarKpisFacturas() {
  const total = facturasProveedor.reduce((s,f) => s + (f.total||0), 0);
  const pendientes = facturasProveedor.filter(f => _fpEstadoEfectivo(f) === 'pendiente').length;
  const vencidas   = facturasProveedor.filter(f => _fpEstadoEfectivo(f) === 'vencida').length;
  const pagadas    = facturasProveedor.filter(f => f.estado === 'pagada').length;
  const saldoPend  = facturasProveedor.filter(f => f.estado === 'pendiente').reduce((s,f) => s + (f.total||0), 0);
  const pagadasMes = facturasProveedor.filter(f => {
    const fm = new Date(f.fecha), hoy = new Date();
    return f.estado === 'pagada' && fm.getMonth() === hoy.getMonth() && fm.getFullYear() === hoy.getFullYear();
  }).length;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('fpKpiTotal', facturasProveedor.length);
  set('fpKpiPend', pendientes);
  set('fpKpiVenc', vencidas);
  set('fpKpiPagadas', pagadas);
  set('fpKpiMesPagadas', pagadasMes);
  set('fpKpiPendiente', fmtE(saldoPend));
  set('fpKpiImpTotal', fmtE(total));
}

// Filtro por click en tarjeta KPI
function fpFiltrarPorKpi(estado) {
  _fpKpiFilterActivo = (_fpKpiFilterActivo === estado) ? null : estado;
  document.querySelectorAll('.fp-kpi-filter').forEach(el => {
    el.style.outline = el.dataset.filtro === _fpKpiFilterActivo ? '3px solid var(--acento)' : 'none';
  });
  filtrarFacturasProv();
}

// Menú contextual para cambiar estado
function fpCambiarEstadoMenu(id, evt) {
  const f = facturasProveedor.find(x => x.id === id);
  if (!f) return;
  const opciones = ['pendiente','pagada','anulada'].filter(e => e !== f.estado);
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;z-index:99999;background:#fff;border:1px solid var(--gris-200);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.12);padding:4px;min-width:180px;top:${evt.clientY}px;left:${evt.clientX}px`;
  menu.innerHTML = opciones.map(e => {
    const ec = FP_ESTADOS[e];
    return `<div onclick="fpSetEstado(${id},'${e}');this.parentElement.remove()" style="padding:6px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px" onmouseover="this.style.background='var(--gris-100)'" onmouseout="this.style.background='transparent'">${ec.ico} ${ec.label}</div>`;
  }).join('');
  document.body.appendChild(menu);
  setTimeout(() => {
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 0);
}

async function fpSetEstado(id, estado) {
  await sb.from('facturas_proveedor').update({ estado }).eq('id', id);
  const f = facturasProveedor.find(x => x.id === id); if (f) f.estado = estado;
  filtrarFacturasProv();
  actualizarKpisFacturas();
  toast(`Estado → ${FP_ESTADOS[estado]?.label || estado}`, 'success');
}

// Asignar obra vía modal
function fpAsignarObra(id) {
  const f = facturasProveedor.find(x => x.id === id);
  if (!f) return;
  document.getElementById('fpAsignObraOverlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'fpAsignObraOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;display:flex;align-items:center;justify-content:center';
  const opts = (typeof trabajos!=='undefined'?trabajos:[]).filter(t => t.estado !== 'finalizado' && t.estado !== 'cancelado')
    .map(t => `<option value="${t.id}">${t.titulo||t.numero||('Obra #'+t.id)}${t.cliente_nombre ? ' — '+t.cliente_nombre : ''}</option>`).join('');
  ov.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:20px;min-width:420px;max-width:90vw">
      <h3 style="margin:0 0 12px 0">🏗️ Asignar obra a ${f.numero}</h3>
      <select id="fpAsignObraSel" style="width:100%;padding:8px;border:1px solid var(--gris-200);border-radius:6px;font-size:14px">
        <option value="">— Selecciona obra —</option>
        ${opts}
      </select>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button onclick="document.getElementById('fpAsignObraOverlay').remove()" class="btn-sec">Cancelar</button>
        <button onclick="fpConfirmarObra(${id})" class="btn-pri">Asignar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

async function fpConfirmarObra(id) {
  const sel = document.getElementById('fpAsignObraSel');
  const tid = parseInt(sel?.value);
  if (!tid) { toast('Selecciona una obra', 'error'); return; }
  const f = facturasProveedor.find(x => x.id === id);
  if (!f) return;
  await sb.from('facturas_proveedor').update({ trabajo_id: tid }).eq('id', id);
  f.trabajo_id = tid;
  if (typeof propagarObraCompras === 'function') {
    await propagarObraCompras(tid, {
      presupuesto_compra_id: f.presupuesto_compra_id,
      pedido_compra_id: f.pedido_compra_id,
      recepcion_id: f.recepcion_id,
      factura_proveedor_id: id
    });
  }
  document.getElementById('fpAsignObraOverlay')?.remove();
  loadFacturasProv();
  toast('🏗️ Obra asignada y propagada', 'success');
}

// ═══════════════════════════════════════════════
// FILTRADO
// ═══════════════════════════════════════════════
function filtrarFacturasProv() {
  const estado = v('fpFiltroEstado');
  const prov = v('fpFiltroProveedor');
  const desde = v('fpFiltroDesde');
  const hasta = v('fpFiltroHasta');
  const texto = (document.getElementById('fpFiltroTexto')?.value || '').trim().toLowerCase();

  let filtered = facturasProveedor;

  const filtroActivo = _fpKpiFilterActivo || estado;
  if (filtroActivo === 'vencida') {
    filtered = filtered.filter(f => _fpEstadoEfectivo(f) === 'vencida');
  } else if (filtroActivo === 'pendientes_all') {
    filtered = filtered.filter(f => f.estado === 'pendiente');
  } else if (filtroActivo === 'activos') {
    filtered = filtered.filter(f => f.estado !== 'anulada');
  } else if (filtroActivo) {
    filtered = filtered.filter(f => f.estado === filtroActivo);
  }

  if (prov) filtered = filtered.filter(f => f.proveedor_id == prov);
  if (desde) filtered = filtered.filter(f => new Date(f.fecha) >= new Date(desde));
  if (hasta) filtered = filtered.filter(f => new Date(f.fecha) <= new Date(hasta));

  if (texto) {
    filtered = filtered.filter(f => {
      const obraNombre = f.trabajo_id ? ((typeof trabajos!=='undefined'?trabajos:[]).find(t=>t.id===f.trabajo_id)?.titulo || '') : '';
      return (f.numero||'').toLowerCase().includes(texto)
        || (f.proveedor_nombre||'').toLowerCase().includes(texto)
        || (f.observaciones||'').toLowerCase().includes(texto)
        || obraNombre.toLowerCase().includes(texto);
    });
  }

  renderFacturasProv(filtered);
}

// ═══════════════════════════════════════════════
// CREAR NUEVA FACTURA
// ═══════════════════════════════════════════════
async function nuevaFacturaProv() {
  fpLineas = [];
  fpEditId = null;
  fpProveedorActual = null;

  const sel = document.getElementById('fp_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  sel.onchange = function() { fp_aplicarReglaProveedor(this.value); };

  const fpSel = document.getElementById('fp_formapago');
  fpSel.innerHTML = '<option value="">— Sin especificar —</option>' +
    (formasPago||[]).map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');

  // Poblar selector de bancos
  fp_poblarBancos();

  document.getElementById('fp_numero').value = await generarNumeroDoc('factura_proveedor');
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fp_fecha').value = hoy;
  const v1 = new Date(); v1.setDate(v1.getDate() + 30);
  document.getElementById('fp_vencimiento').value = v1.toISOString().split('T')[0];
  document.getElementById('fp_observaciones').value = '';
  document.getElementById('mFPTit').textContent = 'Nueva Factura de Proveedor';
  poblarSelectorObra('fp_obra', null);

  fp_addLinea();
  openModal('mFacturaProv');
}

// ═══════════════════════════════════════════════
// REGLAS AUTOMÁTICAS POR PROVEEDOR
// ═══════════════════════════════════════════════
function fp_poblarBancos(selectedId) {
  const bSel = document.getElementById('fp_banco_pago');
  if (!bSel) return;
  const bancos = typeof cuentasBancarias !== 'undefined' ? cuentasBancarias : [];
  bSel.innerHTML = '<option value="">— Sin asignar —</option>' +
    bancos.map(b => `<option value="${b.id}" ${b.id == selectedId ? 'selected' : ''}>${b.nombre}${b.iban ? ' — ' + b.iban.slice(-8) : ''}</option>`).join('');
}

function fp_aplicarReglaProveedor(provId) {
  if (!provId) return;
  const prov = (proveedores || []).find(p => p.id == provId);
  if (!prov) return;
  fpProveedorActual = prov.id;

  // Aplicar días de vencimiento
  const dias = prov.dias_pago || 30;
  const fecha = document.getElementById('fp_fecha').value;
  if (fecha) {
    const d = new Date(fecha);
    d.setDate(d.getDate() + dias);
    document.getElementById('fp_vencimiento').value = d.toISOString().split('T')[0];
  }

  // Aplicar forma de pago
  if (prov.forma_pago_id) {
    const fpSel = document.getElementById('fp_formapago');
    if (fpSel) fpSel.value = prov.forma_pago_id;
  }

  // Aplicar banco predeterminado
  if (prov.banco_predeterminado_id) {
    fp_poblarBancos(prov.banco_predeterminado_id);
  }
}

// ═══════════════════════════════════════════════
// EDITAR FACTURA
// ═══════════════════════════════════════════════
async function editarFacturaProv(id) {
  const fp = facturasProveedor.find(x => x.id === id);
  if (!fp) return;

  fpEditId = id;
  fpProveedorActual = fp.proveedor_id;
  fpLineas = fp.lineas || [];

  const sel = document.getElementById('fp_proveedor');
  sel.innerHTML = (proveedores||[]).map(p => `<option value="${p.id}" ${p.id===fp.proveedor_id?'selected':''}>${p.nombre}</option>`).join('');

  const fpSel = document.getElementById('fp_formapago');
  fpSel.innerHTML = (formasPago||[]).map(f => `<option value="${f.id}" ${f.id===fp.forma_pago_id?'selected':''}>${f.nombre}</option>`).join('');

  setVal({
    fp_numero: fp.numero,
    fp_fecha: fp.fecha,
    fp_vencimiento: fp.fecha_vencimiento,
    fp_observaciones: fp.observaciones || ''
  });

  document.getElementById('mFPTit').textContent = 'Editar Factura de Proveedor';
  poblarSelectorObra('fp_obra', fp.trabajo_id);
  fp_renderLineas();
  openModal('mFacturaProv');
}

// ═══════════════════════════════════════════════
// GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function fp_addLinea() {
  fpLineas.push({articulo_id:null, codigo:'', nombre:'', cantidad:1, precio:0, dto1:0, dto2:0, dto3:0, iva:21});
  fp_renderLineas();
  setTimeout(()=>{
    const all = document.querySelectorAll('#fp_lineas input[data-ac="articulos"]');
    const last = all[all.length-1];
    if (last) last.focus();
  },50);
}

function fp_removeLinea(idx) {
  fpLineas.splice(idx, 1);
  fp_renderLineas();
}

let _fpArtSelecting = false;
function fp_updateLinea(idx, field, val) {
  // Si se acaba de seleccionar un artículo, no dejar que onblur sobreescriba nombre con el texto parcial
  if (field === 'nombre' && _fpArtSelecting) return;
  if (field === 'articulo_id') {
    const art = (articulos||[]).find(a => a.id == val);
    if (art) {
      fpLineas[idx].articulo_id = art.id;
      fpLineas[idx].codigo = art.codigo;
      fpLineas[idx].nombre = art.nombre;
      fpLineas[idx].precio = art.precio_coste || 0;
      fpLineas[idx].iva = art.iva_default || 21;
    }
  } else if (['cantidad','precio','dto1','dto2','dto3','iva'].includes(field)) {
    fpLineas[idx][field] = parseFloat(val) || 0;
  } else {
    fpLineas[idx][field] = val;
  }
  fp_renderLineas();
}

function _fp_onSelectArt(lineaIdx, art) {
  _fpArtSelecting = true;
  fpLineas[lineaIdx].articulo_id = art.id;
  fpLineas[lineaIdx].codigo = art.codigo || '';
  fpLineas[lineaIdx].nombre = art.nombre || '';
  fpLineas[lineaIdx].precio = art.precio_coste || art.precio_venta || 0;
  if (art.tipo_iva_id && typeof tiposIva!=='undefined') {
    const t = tiposIva.find(x=>x.id===art.tipo_iva_id);
    if (t) fpLineas[lineaIdx].iva = t.porcentaje;
  }
  // Defer render to avoid blur/innerHTML race condition
  setTimeout(() => { fp_renderLineas(); }, 0);
  toast(`📦 ${art.codigo||''} — ${art.nombre}`,'info');
  setTimeout(() => { _fpArtSelecting = false; }, 300);
}

function fp_renderLineas() {
  let base = 0, ivaTotal = 0;
  const _n = (v) => `<input type="number" value="${v}" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"`;
  const html = fpLineas.map((l, i) => {
    const d1 = l.dto1 || 0, d2 = l.dto2 || 0, d3 = l.dto3 || 0;
    const bruto = l.cantidad * l.precio;
    const subtotal = bruto * (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
    const ivaAmt = subtotal * (l.iva / 100);
    base += subtotal;
    ivaTotal += ivaAmt;
    const descVal = (l.nombre || '').replace(/"/g,'&quot;');
    const ivaOpts = (tiposIva||[]).map(t => `<option value="${t.porcentaje}" ${t.porcentaje===l.iva?'selected':''}>${t.porcentaje}%</option>`).join('');
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 6px">
        <input value="${descVal}" placeholder="Código o descripción del artículo..."
          data-ac="articulos" data-linea-idx="${i}"
          oninput="acBuscarArticulo(this, _fp_onSelectArt, 'precio_coste')"
          onkeydown="acKeydown(event)"
          onfocus="if(this.value.length>=1)acBuscarArticulo(this, _fp_onSelectArt, 'precio_coste')"
          onblur="setTimeout(()=>{const d=document.getElementById('acArticulos');if(d)d.style.display='none'},200);fp_updateLinea(${i},'nombre',this.value)"
          autocomplete="off"
          style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent">
      </td>
      <td style="padding:7px 4px">${_n(l.cantidad)} min="0.01" step="0.01" onchange="fp_updateLinea(${i},'cantidad',this.value)"></td>
      <td style="padding:7px 4px">${_n(l.precio)} min="0" step="0.01" onchange="fp_updateLinea(${i},'precio',this.value)"></td>
      <td style="padding:7px 2px">${_n(d1)} min="0" max="100" step="0.5" onchange="fp_updateLinea(${i},'dto1',this.value)" placeholder="%"></td>
      <td style="padding:7px 2px">${_n(d2)} min="0" max="100" step="0.5" onchange="fp_updateLinea(${i},'dto2',this.value)" placeholder="%"></td>
      <td style="padding:7px 2px">${_n(d3)} min="0" max="100" step="0.5" onchange="fp_updateLinea(${i},'dto3',this.value)" placeholder="%"></td>
      <td style="padding:7px 4px">
        <select onchange="fp_updateLinea(${i},'iva',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${ivaOpts}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px;white-space:nowrap">${fmtE(subtotal+ivaAmt)}</td>
      <td style="padding:7px 4px"><button onclick="fp_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button></td>
    </tr>`;
  }).join('');

  document.getElementById('fp_lineas').innerHTML = html;
  document.getElementById('fp_base').textContent = fmtE(base);
  document.getElementById('fp_iva_total').textContent = fmtE(ivaTotal);
  document.getElementById('fp_total').textContent = fmtE(base + ivaTotal);
}

// ═══════════════════════════════════════════════
// GUARDAR FACTURA
// ═══════════════════════════════════════════════
async function guardarFacturaProv(estado) {
  if (_creando) return;
  _creando = true;
  try {
    const numero = v('fp_numero').trim();
    const provId = parseInt(v('fp_proveedor'));
    const fecha = v('fp_fecha');
    const vencimiento = v('fp_vencimiento');
    const fpId = v('fp_formapago');

    if (!numero) {toast('Introduce número de factura','error');return;}
    if (!provId) {toast('Selecciona proveedor','error');return;}
    if (fpLineas.length === 0) {toast('Agrega al menos una línea','error');return;}

    const prov = (proveedores||[]).find(p => p.id === provId);
    let base = 0, ivaTotal = 0;
    fpLineas.forEach(l => {
      const bruto = l.cantidad * l.precio;
      const subtotal = bruto * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
      base += subtotal;
      ivaTotal += subtotal * (l.iva / 100);
    });

    const bancoId = document.getElementById('fp_banco_pago')?.value || null;
    const banco = (typeof cuentasBancarias !== 'undefined' ? cuentasBancarias : []).find(b => b.id == bancoId);

    const obj = {
      empresa_id: EMPRESA.id,
      numero,
      proveedor_id: provId,
      proveedor_nombre: prov?.nombre || '',
      fecha,
      fecha_vencimiento: vencimiento,
      forma_pago_id: fpId ? parseInt(fpId) : null,
      banco_id: bancoId ? parseInt(bancoId) : null,
      banco_nombre: banco ? banco.nombre : null,
      base_imponible: base,
      total_iva: ivaTotal,
      total: base + ivaTotal,
      estado,
      lineas: fpLineas,
      observaciones: v('fp_observaciones'),
      trabajo_id: parseInt(document.getElementById('fp_obra')?.value) || null
    };

    let facturaId = fpEditId;
    if (fpEditId) {
      await sb.from('facturas_proveedor').update(obj).eq('id', fpEditId);
      // Propagar obra a toda la cadena si se ha asignado
      if (obj.trabajo_id) {
        const fp = facturasProveedor.find(x => x.id === fpEditId);
        await propagarObraCompras(obj.trabajo_id, {
          presupuesto_compra_id: fp?.presupuesto_compra_id,
          pedido_compra_id: fp?.pedido_compra_id,
          recepcion_id: fp?.recepcion_id,
          factura_proveedor_id: fpEditId
        });
      }
    } else {
      const { data: inserted, error: insErr } = await sb.from('facturas_proveedor').insert(obj).select().single();
      if (insErr) throw new Error(insErr.message);
      facturaId = inserted.id;
    }

    // --- Guardar documento adjunto en Supabase Storage ---
    if (_iaFileBase64 && facturaId) {
      try {
        const ext = _iaFileName ? _iaFileName.split('.').pop().toLowerCase() : (_iaFileMime === 'application/pdf' ? 'pdf' : 'jpg');
        const storagePath = `facturas_prov/${EMPRESA.id}/${facturaId}_${Date.now()}.${ext}`;

        // Convertir base64 a Blob
        const byteChars = atob(_iaFileBase64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: _iaFileMime || 'application/octet-stream' });

        const { error: upErr } = await sb.storage.from('documentos').upload(storagePath, blob, {
          contentType: _iaFileMime || 'application/octet-stream',
          upsert: false
        });

        if (!upErr) {
          // Obtener URL pública
          const { data: urlData } = sb.storage.from('documentos').getPublicUrl(storagePath);

          // Insertar registro en tabla documentos_factura_prov
          await sb.from('documentos_factura_prov').insert({
            empresa_id: EMPRESA.id,
            factura_prov_id: facturaId,
            nombre_archivo: _iaFileName || ('factura.' + ext),
            storage_path: storagePath,
            url: urlData?.publicUrl || null,
            mime_type: _iaFileMime || 'application/octet-stream',
            tamano: blob.size
          });

          toast('Documento adjunto guardado ✓', 'info');
        } else {
          console.warn('Error subiendo documento:', upErr.message);
        }

        // Limpiar referencia del archivo IA
        _iaFileBase64 = null;
        _iaFileName = '';
        _iaFileMime = '';
      } catch (docErr) {
        console.warn('No se pudo guardar documento adjunto:', docErr.message);
      }
    }

    // --- Entrada de stock para facturas SIN albarán asociado ---
    // Si la factura NO viene de un albarán, sus líneas deben crear stock
    // (compra directa facturada sin pasar por albarán)
    const facturaObj = fpEditId
      ? (facturasProv||[]).find(f => f.id === fpEditId)
      : null;
    const tieneAlbaran = facturaObj?.recepcion_id || facturaObj?.recepcion_ids?.length;
    const esNueva = !fpEditId;

    if (esNueva && !tieneAlbaran) {
      // Factura nueva sin albarán: entrada de stock en almacén principal
      const { data: almPrincipal } = await sb.from('almacenes').select('id')
        .eq('empresa_id', EMPRESA.id).eq('tipo', 'principal').limit(1);
      const almId = almPrincipal?.[0]?.id;

      if (almId) {
        let _fStockOk = 0;
        for (const linea of fpLineas) {
          const artId = linea.articulo_id || linea._artId;
          if (!artId) continue;
          const cant = linea.cantidad || 0;
          if (cant <= 0) continue;

          try {
            const { data: stockExist } = await sb.from('stock').select('*')
              .eq('almacen_id', almId).eq('articulo_id', artId).eq('empresa_id', EMPRESA.id).limit(1);

            if (stockExist?.length) {
              const s = stockExist[0];
              const provLimpiar = Math.min(s.stock_provisional || 0, cant);
              await sb.from('stock').update({
                cantidad: (s.cantidad || 0) + cant,
                stock_provisional: Math.max(0, (s.stock_provisional || 0) - provLimpiar)
              }).eq('id', s.id);
            } else {
              await sb.from('stock').insert({
                empresa_id: EMPRESA.id, almacen_id: almId,
                articulo_id: artId, cantidad: cant, stock_provisional: 0, stock_reservado: 0
              });
            }

            await sb.from('movimientos_stock').insert({
              empresa_id: EMPRESA.id, articulo_id: artId, almacen_id: almId,
              tipo: 'entrada', cantidad: cant, delta: cant,
              notas: 'Factura proveedor nº ' + numero + ' (sin albarán)',
              tipo_stock: 'real', fecha: fecha || new Date().toISOString().slice(0, 10),
              usuario_id: CP?.id || null, usuario_nombre: CP?.nombre || CU?.email || 'admin'
            });
            _fStockOk++;
          } catch(e) {
            console.error('[Stock factura] Error:', artId, e);
          }
        }
        if (_fStockOk > 0) toast('Stock actualizado: ' + _fStockOk + ' artículos ✓', 'info');
      }
    }

    closeModal('mFacturaProv');
    loadFacturasProv();
    toast('Factura guardada ✓', 'success');
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
// CAMBIAR ESTADO
// ═══════════════════════════════════════════════
async function cambiarEstadoFP(id, nuevoEstado) {
  await sb.from('facturas_proveedor').update({estado: nuevoEstado}).eq('id', id);
  loadFacturasProv();
  toast('Estado actualizado', 'success');
}

// ═══════════════════════════════════════════════
// REGISTRAR PAGO
// ═══════════════════════════════════════════════
async function pagarFacturaProv(id) {
  if (_creando) return;
  _creando = true;
  try {
    const fp = facturasProveedor.find(x => x.id === id);
    if (!fp) return;

    if (!confirm(`¿Registrar pago de ${fmtE(fp.total)}?`)) return;

    // Insertar registro de pago
    await sb.from('pagos_proveedor').insert({
      empresa_id: EMPRESA.id,
      factura_id: id,
      proveedor_id: fp.proveedor_id,
      importe: fp.total,
      fecha_pago: new Date().toISOString().split('T')[0]
    });

    await cambiarEstadoFP(id, 'pagada');
    toast('Pago registrado ✓', 'success');
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
// ELIMINAR FACTURA
// ═══════════════════════════════════════════════
async function delFacturaProv(id) {
  if (!confirm('¿Eliminar factura de proveedor?')) return;
  await sb.from('facturas_proveedor').delete().eq('id', id);
  facturasProveedor = facturasProveedor.filter(f => f.id !== id);
  renderFacturasProv(facturasProveedor);
  toast('Factura eliminada', 'info');
}

// ═══════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════
function exportFacturasProv() {
  const csv = 'Número,Proveedor,Fecha,Vencimiento,Estado,Base,IVA,Total\n' +
    facturasProveedor.map(f => `"${f.numero}","${f.proveedor_nombre}","${f.fecha}","${f.fecha_vencimiento}","${f.estado}",${f.base_imponible},${f.total_iva},${f.total}`).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facturas_proveedor_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════
//  IMPRIMIR / EMAIL FACTURA PROVEEDOR
// ═══════════════════════════════════════════════
function imprimirFacturaProv(id) {
  const f = facturasProveedor.find(x=>x.id===id);
  if (!f) { toast('No encontrada','error'); return; }
  const prov = (proveedores||[]).find(x=>x.id===f.proveedor_id);
  const lineas = f.lineas||[];
  let htmlLineas='', base=0;
  lineas.forEach(l=>{
    if(l._separator){htmlLineas+=`<tr><td colspan="4" style="padding:6px 10px;background:#f1f5f9;font-weight:700;font-size:10px;color:#475569;border-bottom:1px solid #e2e8f0">${l.desc||''}</td></tr>`;return;}
    const bruto=(l.cantidad||l.cant||0)*(l.precio||0);const sub=bruto*(1-(l.dto1||l.dto1_pct||0)/100)*(1-(l.dto2||l.dto2_pct||0)/100)*(1-(l.dto3||l.dto3_pct||0)/100);base+=sub;
    htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.desc||l.descripcion||''}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cantidad||l.cant||0}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${(l.precio||0).toFixed(2)} €</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${sub.toFixed(2)} €</td></tr>`;
  });
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:8px">`:`<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const win=window.open('','_blank','width=850,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Factura Prov. ${f.numero}</title><style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style></head><body><div class="no-print btn-bar"><button style="background:#1e40af;color:#fff" onclick="window.print()">🖨️ Imprimir</button><button style="background:#e2e8f0;color:#475569" onclick="window.close()">✕ Cerrar</button></div><div class="page"><div style="display:flex;gap:24px;margin-bottom:16px"><div style="flex:1"><div style="display:flex;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div></div></div></div><div style="flex:1"><div style="background:#fef3c7;border-radius:8px;padding:12px 16px;border-left:4px solid #f59e0b"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;color:#92400e;margin-bottom:4px">PROVEEDOR</div><div style="font-size:15px;font-weight:700">${f.proveedor_nombre||'—'}</div><div style="font-size:11px;color:#475569">${prov?.cif?'CIF: '+prov.cif:''}</div></div></div></div><div style="display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px"><div style="color:#7c3aed"><span style="font-size:14px;font-weight:800">FACTURA PROVEEDOR</span> <span style="font-size:11px;color:#475569">${f.numero||''}</span></div><div style="display:flex;gap:16px;font-size:11px;color:#64748b"><span>Fecha: <b>${f.fecha?new Date(f.fecha).toLocaleDateString('es-ES'):'—'}</b></span><span>Vence: <b>${f.fecha_vencimiento?new Date(f.fecha_vencimiento).toLocaleDateString('es-ES'):'—'}</b></span></div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><thead><tr><th style="background:#7c3aed;color:#fff;padding:7px 10px;font-size:9px;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#7c3aed;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:70px">Cant.</th><th style="background:#7c3aed;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Precio</th><th style="background:#7c3aed;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Total</th></tr></thead><tbody>${htmlLineas}</tbody></table><div style="display:flex;justify-content:flex-end"><div style="width:260px"><div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px"><span>Base</span><b>${(f.base_imponible||base).toFixed(2)} €</b></div><div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px"><span>IVA</span><b>${(f.total_iva||0).toFixed(2)} €</b></div><div style="display:flex;justify-content:space-between;padding:10px 14px;background:#7c3aed;color:#fff;border-radius:6px;font-size:15px;font-weight:800;margin-top:4px"><span>TOTAL</span><b>${(f.total||0).toFixed(2)} €</b></div></div></div></div></body></html>`);
  win.document.close();
}

function enviarFacturaProvEmail(id) {
  const f = facturasProveedor.find(x => x.id === id);
  if (!f) return toast('Factura no encontrada', 'error');
  const prov = proveedores.find(x => x.id === f.proveedor_id);
  const email = prov?.email || '';
  const total = parseFloat(f.total||0).toFixed(2);
  const asuntoTxt = `Factura proveedor ${f.numero_factura||f.numero||''} — ${EMPRESA.nombre}`;
  const cuerpoTxt = `Estimado proveedor,\n\nEn relación a la factura:\n\nNº Factura: ${f.numero_factura||f.numero||'—'}\nFecha: ${f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—'}\nTotal: ${total} €\n\nAtentamente,\n${EMPRESA.nombre}\nTel: ${EMPRESA.telefono||''}`;
  if (typeof enviarDocumentoPorEmail === 'function' && typeof _correoCuentaActiva !== 'undefined' && _correoCuentaActiva) {
    nuevoCorreo(email, asuntoTxt, cuerpoTxt, { tipo: 'factura_proveedor', id: f.id, ref: f.numero_factura || f.numero || '' });
    goPage('correo');
  } else {
    window.open(`mailto:${email}?subject=${encodeURIComponent(asuntoTxt)}&body=${encodeURIComponent(cuerpoTxt)}`);
    toast('Abriendo correo...', 'info');
  }
}

// ═══════════════════════════════════════════════
// IMPORTAR CON IA — OCR INTELIGENTE
// ═══════════════════════════════════════════════
let _iaFileBase64 = null;
let _iaFileName = '';
let _iaFileMime = '';

function importarConIA(tipo) {
  // Verificar que hay API key configurada
  if (!EMPRESA?.anthropic_api_key) {
    toast('Configura primero la API Key de Anthropic en Configuracion > Inteligencia Artificial', 'warning');
    return;
  }
  _iaFileBase64 = null;
  _iaFileName = '';
  document.getElementById('ia_tipo_doc').value = tipo || 'factura';
  document.getElementById('iaFileName').style.display = 'none';
  document.getElementById('iaProgress').style.display = 'none';
  document.getElementById('iaError').style.display = 'none';
  document.getElementById('iaBtnProcesar').disabled = true;
  const fi = document.getElementById('iaFileInput');
  if (fi) fi.value = '';
  // Reset drop zone visual
  const dz = document.getElementById('iaDropZone');
  if (dz) { dz.style.borderColor = 'var(--gris-300)'; dz.style.background = 'var(--gris-50)'; }
  openModal('mImportarIA');
}

function iaHandleFile(file) {
  if (!file) return;
  const valid = ['image/jpeg','image/png','image/jpg','image/webp','application/pdf','image/heic','image/heif',''];
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const esHeic = ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';

  // HEIC: algunos navegadores no ponen mime type, detectamos por extensión
  if (!esHeic && !valid.includes(file.type)) {
    toast('Formato no soportado. Usa JPG, PNG, PDF o HEIC.', 'error');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    toast('Archivo demasiado grande (max 20MB)', 'error');
    return;
  }

  _iaFileName = file.name;
  const fn = document.getElementById('iaFileName');
  fn.style.display = 'block';
  document.getElementById('iaDropZone').style.borderColor = 'var(--azul)';

  // Si es HEIC/HEIF → convertir a JPEG usando Canvas
  if (esHeic) {
    fn.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB) — convirtiendo HEIC...';
    _iaConvertirHeicAJpeg(file).then(({ base64, blob }) => {
      _iaFileBase64 = base64;
      _iaFileMime = 'image/jpeg';
      fn.textContent = file.name + ' (' + (blob.size / 1024).toFixed(0) + ' KB) ✓ convertido a JPEG';
      document.getElementById('iaBtnProcesar').disabled = false;
    }).catch(err => {
      toast('No se pudo convertir HEIC: ' + err.message + '. Prueba a convertirlo a JPG antes.', 'error');
      fn.textContent = '';
      fn.style.display = 'none';
    });
    return;
  }

  // Resto de formatos: lectura directa
  _iaFileMime = file.type || 'application/octet-stream';
  fn.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';

  const reader = new FileReader();
  reader.onload = function(e) {
    _iaFileBase64 = e.target.result.split(',')[1];
    document.getElementById('iaBtnProcesar').disabled = false;
  };
  reader.readAsDataURL(file);
}

// Convertir HEIC a JPEG usando createImageBitmap + Canvas
async function _iaConvertirHeicAJpeg(file) {
  // Intentar con createImageBitmap (funciona en Safari 17+ y Chrome)
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Canvas toBlob falló'));
        const reader = new FileReader();
        reader.onload = () => resolve({
          base64: reader.result.split(',')[1],
          blob
        });
        reader.onerror = () => reject(new Error('Error leyendo blob'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.92);
    });
  } catch(e) {
    throw new Error('Tu navegador no soporta HEIC directamente. ' + e.message);
  }
}

// ═══════════════════════════════════════════════
// PREVIEW DATA — datos temporales para previsualización
// ═══════════════════════════════════════════════
let _iaPreviewData = null;    // Datos OCR crudos
let _iaPreviewTipo = '';      // Tipo documento (factura, albaran, pedido, presupuesto)
let _iaPreviewProvMatch = null; // Proveedor existente encontrado o null

async function iaProcesarDocumento() {
  if (!_iaFileBase64) { toast('Selecciona un archivo primero', 'warning'); return; }

  const prog = document.getElementById('iaProgress');
  const bar = document.getElementById('iaProgressBar');
  const txt = document.getElementById('iaProgressText');
  const errDiv = document.getElementById('iaError');
  const btn = document.getElementById('iaBtnProcesar');

  prog.style.display = 'block';
  errDiv.style.display = 'none';
  btn.disabled = true;

  bar.style.width = '10%';
  txt.textContent = 'Enviando documento a la IA...';

  try {
    let apiKey;
    try { apiKey = decodeURIComponent(escape(atob(EMPRESA.anthropic_api_key))); }
    catch(_) { apiKey = EMPRESA.anthropic_api_key; }

    const tipo = document.getElementById('ia_tipo_doc').value || 'factura';

    bar.style.width = '30%';
    txt.textContent = 'Analizando documento con Claude Vision...';

    const resp = await fetch('https://gskkqqhbpnycvuioqetj.supabase.co/functions/v1/ocr-documento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anthropic-key': apiKey },
      body: JSON.stringify({ imagen_base64: _iaFileBase64, media_type: _iaFileMime, tipo, empresa_id: EMPRESA.id })
    });

    bar.style.width = '70%';
    txt.textContent = 'Procesando resultados...';

    const result = await resp.json();
    if (!result.success) throw new Error(result.error || 'Error procesando documento');

    bar.style.width = '90%';
    txt.textContent = 'Preparando previsualización...';

    const data = result.data;
    _iaPreviewData = data;
    _iaPreviewTipo = tipo || data.tipo_documento || 'factura';

    // Buscar proveedor existente (sin crear)
    _iaPreviewProvMatch = _iaBuscarProveedorExistente(data.proveedor);

    // Buscar artículos existentes para cada línea (sin crear)
    if (data.lineas) {
      for (const linea of data.lineas) {
        linea._artMatch = _iaBuscarArticuloExistente(linea);
      }
    }

    bar.style.width = '100%';
    txt.textContent = 'Listo!';

    // Cerrar modal de importación y abrir preview
    closeModal('mImportarIA');
    iaPreviewMostrar();

  } catch(e) {
    errDiv.textContent = 'Error: ' + e.message;
    errDiv.style.display = 'block';
    bar.style.width = '0%';
    prog.style.display = 'none';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════
// BUSCAR SIN CREAR — solo lectura
// ═══════════════════════════════════════════════
function _iaBuscarProveedorExistente(provData) {
  if (!provData) return null;
  if (provData.cif) {
    const e = (proveedores || []).find(p =>
      p.cif && p.cif.replace(/[\s\-\.]/g,'').toUpperCase() === provData.cif.replace(/[\s\-\.]/g,'').toUpperCase()
    );
    if (e) return e;
  }
  if (provData.nombre) {
    const n = provData.nombre.toLowerCase().trim();
    const e = (proveedores || []).find(p => p.nombre && p.nombre.toLowerCase().trim() === n);
    if (e) return e;
  }
  return null;
}

function _iaBuscarArticuloExistente(lineaOCR) {
  const desc = (lineaOCR.descripcion || '').trim();
  const codigo = (lineaOCR.codigo || '').trim();
  if (!desc && !codigo) return null;
  const codLow = codigo.toLowerCase();
  // Código limpio para comparación fuzzy
  const codLimpio = codLow.replace(/[\s\-_./\\,;:()[\]{}'"]/g, '');

  let art = null;
  if (codigo) {
    // Por código artículo
    art = (articulos || []).find(a => a.codigo && a.codigo.trim().toLowerCase() === codLow);
    // Por referencia_fabricante (exacto)
    if (!art) art = (articulos || []).find(a => a.referencia_fabricante && a.referencia_fabricante.trim().toLowerCase() === codLow);
    // Por referencia_fabricante (fuzzy — sin puntuación)
    if (!art && codLimpio) art = (articulos || []).find(a => a.referencia_fabricante && a.referencia_fabricante.replace(/[\s\-_./\\,;:()[\]{}'"]/g, '').toLowerCase() === codLimpio);
  }
  if (!art && desc) {
    const dn = desc.toLowerCase();
    art = (articulos || []).find(a => a.nombre && a.nombre.toLowerCase() === dn);
    if (!art) art = (articulos || []).find(a => a.nombre && (a.nombre.toLowerCase().includes(dn) || dn.includes(a.nombre.toLowerCase())));
  }
  return art;
}

function _iaGetTipoIvaId(porcentaje) {
  if (typeof tiposIva === 'undefined') return null;
  const t = tiposIva.find(x => x.porcentaje === porcentaje);
  return t ? t.id : (tiposIva[0]?.id || null);
}

// ═══════════════════════════════════════════════
// PREVIEW — Mostrar datos detectados
// ═══════════════════════════════════════════════
function iaPreviewMostrar() {
  const data = _iaPreviewData;
  if (!data) return;

  const docEl = document.getElementById('iaPreviewDoc');
  const dataEl = document.getElementById('iaPreviewData');

  // --- Izquierda: mostrar documento original ---
  if (_iaFileMime === 'application/pdf') {
    docEl.innerHTML = `<div id="iaPreviewPdfPages" style="width:100%;height:100%;overflow-y:auto;background:var(--gris-100);padding:8px;border-radius:8px"></div>`;
    // Renderizar PDF con PDF.js (sin controles del navegador)
    setTimeout(() => {
      if (typeof _renderPdfPages === 'function') {
        _renderPdfPages(`data:application/pdf;base64,${_iaFileBase64}`, 'iaPreviewPdfPages');
      } else {
        // Fallback: convertir base64 a blob URL
        const byteChars = atob(_iaFileBase64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        docEl.innerHTML = `<iframe src="${blobUrl}" style="width:100%;height:100%;border:none"></iframe>`;
      }
    }, 50);
  } else {
    docEl.innerHTML = `<img src="data:${_iaFileMime};base64,${_iaFileBase64}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px">`;
  }

  // --- Derecha: datos detectados editables ---
  const tipoLabel = {factura:'Factura',albaran:'Albarán',pedido:'Pedido',presupuesto:'Presupuesto',presupuesto_compra:'Presupuesto'}[_iaPreviewTipo]||'Documento';
  const prov = data.proveedor || {};
  const provExiste = _iaPreviewProvMatch;
  const provBadge = provExiste
    ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">✓ Existe: ${provExiste.nombre}</span>`
    : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">+ Nuevo proveedor</span>`;

  let html = '';

  // SECCIÓN 1: Info del documento
  html += `<div style="margin-bottom:20px">
    <div style="font-weight:700;font-size:14px;color:var(--azul);margin-bottom:10px;display:flex;align-items:center;gap:8px">
      📋 Tipo de documento:
      <select id="iap_tipo_doc" onchange="_iaPreviewTipo=this.value" style="padding:4px 10px;border:1.5px solid var(--azul);border-radius:8px;font-size:13px;font-weight:700;color:var(--azul);background:#eef2ff;outline:none;cursor:pointer">
        <option value="factura" ${_iaPreviewTipo==='factura'?'selected':''}>🧾 Factura de proveedor</option>
        <option value="albaran" ${_iaPreviewTipo==='albaran'?'selected':''}>📥 Albarán de proveedor</option>
        <option value="pedido" ${_iaPreviewTipo==='pedido'?'selected':''}>🛒 Pedido de compra</option>
        <option value="presupuesto" ${_iaPreviewTipo==='presupuesto'||_iaPreviewTipo==='presupuesto_compra'?'selected':''}>📋 Presupuesto de compra</option>
      </select>
      <span style="font-size:11px;color:var(--gris-400);font-weight:400">detectado por IA — cambia si no es correcto</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Número
        <input type="text" id="iap_numero" value="${data.numero_documento||''}" class="input" style="margin-top:2px;font-size:13px">
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Fecha
        <input type="date" id="iap_fecha" value="${data.fecha||new Date().toISOString().split('T')[0]}" class="input" style="margin-top:2px;font-size:13px">
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Vencimiento
        <input type="date" id="iap_vencimiento" value="${data.fecha_vencimiento||''}" class="input" style="margin-top:2px;font-size:13px">
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Forma de pago
        <input type="text" id="iap_formapago" value="${data.forma_pago||''}" class="input" style="margin-top:2px;font-size:13px" readonly>
      </label>
    </div>
    <label style="font-size:11px;color:var(--gris-500);font-weight:600;display:block;margin-top:8px">Observaciones
      <textarea id="iap_notas" class="input" style="margin-top:2px;font-size:12px;min-height:40px;resize:vertical">${data.notas||''}</textarea>
    </label>
  </div>`;

  // SECCIÓN 2: Proveedor
  html += `<div style="margin-bottom:20px;padding:14px;background:${provExiste?'#f0fdf4':'#fffbeb'};border:1px solid ${provExiste?'#bbf7d0':'#fde68a'};border-radius:10px">
    <div style="font-weight:700;font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
      🏢 Proveedor ${provBadge}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Nombre
        <input type="text" id="iap_prov_nombre" value="${prov.nombre||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">CIF/NIF
        <input type="text" id="iap_prov_cif" value="${prov.cif||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Dirección
        <input type="text" id="iap_prov_dir" value="${prov.direccion||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Municipio
        <input type="text" id="iap_prov_mun" value="${prov.municipio||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">CP
        <input type="text" id="iap_prov_cp" value="${prov.cp||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Provincia
        <input type="text" id="iap_prov_prov" value="${prov.provincia||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Teléfono
        <input type="text" id="iap_prov_tel" value="${prov.telefono||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Email
        <input type="text" id="iap_prov_email" value="${prov.email||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Web
        <input type="text" id="iap_prov_web" value="${prov.web||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">IBAN
        <input type="text" id="iap_prov_iban" value="${prov.iban||''}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
      <label style="font-size:11px;color:var(--gris-500);font-weight:600">Días pago
        <input type="number" id="iap_prov_dias" value="${prov.dias_pago||30}" class="input" style="margin-top:2px;font-size:13px" ${provExiste?'readonly':''}>
      </label>
    </div>
  </div>`;

  // SECCIÓN 3: Líneas / Artículos
  const lineas = data.lineas || [];
  html += `<div style="margin-bottom:12px">
    <div style="font-weight:700;font-size:13px;margin-bottom:10px">📦 Líneas del documento (${lineas.length})</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--gris-100)">
            <th style="padding:6px 8px;text-align:left;font-weight:700;font-size:11px;color:var(--gris-500)">Estado</th>
            <th style="padding:6px 8px;text-align:left;font-weight:700;font-size:11px;color:var(--gris-500)">Código</th>
            <th style="padding:6px 8px;text-align:left;font-weight:700;font-size:11px;color:var(--gris-500);min-width:200px">Descripción</th>
            <th style="padding:6px 8px;text-align:right;font-weight:700;font-size:11px;color:var(--gris-500)">Cant.</th>
            <th style="padding:6px 8px;text-align:right;font-weight:700;font-size:11px;color:var(--gris-500)">Precio</th>
            <th style="padding:6px 8px;text-align:right;font-weight:700;font-size:11px;color:var(--gris-500)">Dto1%</th>
            <th style="padding:6px 8px;text-align:right;font-weight:700;font-size:11px;color:var(--gris-500)">Dto2%</th>
            <th style="padding:6px 8px;text-align:right;font-weight:700;font-size:11px;color:var(--gris-500)">Dto3%</th>
            <th style="padding:6px 8px;text-align:right;font-weight:700;font-size:11px;color:var(--gris-500)">IVA%</th>
            <th style="padding:6px 8px;text-align:right;font-weight:700;font-size:11px;color:var(--gris-500)">Subtotal</th>
          </tr>
        </thead>
        <tbody>`;

  let totalBase = 0;
  let totalIva = 0;
  lineas.forEach((l, i) => {
    const artMatch = l._artMatch;
    const esNuevo = !artMatch;
    const badge = esNuevo
      ? '<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;font-size:10px;white-space:nowrap">+ Nuevo</span>'
      : '<span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:8px;font-size:10px;white-space:nowrap">✓ Existe</span>';

    const cant = l.cantidad || 1;
    const precio = l.precio_unitario || 0;
    const d1 = l.dto1_pct || 0, d2 = l.dto2_pct || 0, d3 = l.dto3_pct || 0;
    const iva = l.iva_pct || 21;
    const bruto = cant * precio;
    const subtotal = bruto * (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
    totalBase += subtotal;
    totalIva += subtotal * (iva / 100);

    const bg = i % 2 === 0 ? '#fff' : '#fafafa';
    html += `<tr style="background:${bg};border-bottom:1px solid var(--gris-100)">
      <td style="padding:6px 8px">${badge}</td>
      <td style="padding:6px 8px">
        <input type="text" value="${l.codigo||''}" class="input" style="font-size:12px;padding:3px 6px;width:80px" data-iap="codigo" data-idx="${i}">
      </td>
      <td style="padding:6px 8px;position:relative">
        <input type="text" value="${(l.descripcion||'').replace(/"/g,'&quot;')}" class="input" style="font-size:12px;padding:3px 6px;width:100%" data-iap="descripcion" data-idx="${i}"
          oninput="_iaPreviewBuscarArt(this)" onfocus="_iaPreviewBuscarArt(this)" autocomplete="off">
        <div id="iap_sug_${i}" class="iap-sugerencias" style="display:none;position:absolute;top:100%;left:8px;right:8px;z-index:999;background:#fff;border:1px solid var(--gris-300);border-radius:6px;max-height:160px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>
      </td>
      <td style="padding:6px 8px;text-align:right">
        <input type="number" value="${cant}" class="input" style="font-size:12px;padding:3px 6px;width:60px;text-align:right" data-iap="cantidad" data-idx="${i}" step="any">
      </td>
      <td style="padding:6px 8px;text-align:right">
        <input type="number" value="${precio}" class="input" style="font-size:12px;padding:3px 6px;width:80px;text-align:right" data-iap="precio_unitario" data-idx="${i}" step="any">
      </td>
      <td style="padding:6px 8px;text-align:right">
        <input type="number" value="${d1}" class="input" style="font-size:12px;padding:3px 6px;width:55px;text-align:right" data-iap="dto1_pct" data-idx="${i}" min="0" max="100" step="0.5">
      </td>
      <td style="padding:6px 8px;text-align:right">
        <input type="number" value="${d2}" class="input" style="font-size:12px;padding:3px 6px;width:55px;text-align:right" data-iap="dto2_pct" data-idx="${i}" min="0" max="100" step="0.5">
      </td>
      <td style="padding:6px 8px;text-align:right">
        <input type="number" value="${d3}" class="input" style="font-size:12px;padding:3px 6px;width:55px;text-align:right" data-iap="dto3_pct" data-idx="${i}" min="0" max="100" step="0.5">
      </td>
      <td style="padding:6px 8px;text-align:right">
        <input type="number" value="${iva}" class="input" style="font-size:12px;padding:3px 6px;width:55px;text-align:right" data-iap="iva_pct" data-idx="${i}">
      </td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;white-space:nowrap">${subtotal.toFixed(2)} €</td>
    </tr>`;
  });

  html += `</tbody></table></div>`;

  // Totales
  html += `<div style="display:flex;justify-content:flex-end;margin-top:10px">
    <div style="width:220px;font-size:13px">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Base imponible</span><b>${totalBase.toFixed(2)} €</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>IVA</span><b>${totalIva.toFixed(2)} €</b></div>
      <div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--azul);color:#fff;border-radius:8px;font-size:15px;font-weight:800;margin-top:4px">
        <span>TOTAL</span><b>${(totalBase + totalIva).toFixed(2)} €</b>
      </div>
    </div>
  </div>`;

  html += `</div>`;

  // Contadores para el status
  const artNuevos = lineas.filter(l => !l._artMatch).length;
  const artExistentes = lineas.length - artNuevos;
  let statusTxt = `${lineas.length} líneas`;
  if (artExistentes > 0) statusTxt += ` · ${artExistentes} artículos existentes`;
  if (artNuevos > 0) statusTxt += ` · ${artNuevos} artículos nuevos a crear`;
  if (!provExiste && prov.nombre) statusTxt += ` · 1 proveedor nuevo a crear`;

  dataEl.innerHTML = html;
  document.getElementById('iaPreviewStatus').textContent = statusTxt;
  openModal('mIAPreview');
}

// ═══════════════════════════════════════════════
// PREVIEW — Cerrar
// ═══════════════════════════════════════════════
function iaPreviewCerrar() {
  closeModal('mIAPreview');
  _iaPreviewData = null;
  _iaPreviewProvMatch = null;
}

// ═══════════════════════════════════════════════
// PREVIEW — Leer valores editados del preview
// ═══════════════════════════════════════════════
function _iaPreviewLeerDatos() {
  const data = JSON.parse(JSON.stringify(_iaPreviewData)); // copia profunda

  // Documento
  data.numero_documento = document.getElementById('iap_numero')?.value || data.numero_documento;
  data.fecha = document.getElementById('iap_fecha')?.value || data.fecha;
  data.fecha_vencimiento = document.getElementById('iap_vencimiento')?.value || data.fecha_vencimiento;
  data.notas = document.getElementById('iap_notas')?.value || '';

  // Proveedor (solo si nuevo)
  if (!_iaPreviewProvMatch) {
    data.proveedor = data.proveedor || {};
    data.proveedor.nombre = document.getElementById('iap_prov_nombre')?.value || '';
    data.proveedor.cif = document.getElementById('iap_prov_cif')?.value || '';
    data.proveedor.direccion = document.getElementById('iap_prov_dir')?.value || '';
    data.proveedor.municipio = document.getElementById('iap_prov_mun')?.value || '';
    data.proveedor.cp = document.getElementById('iap_prov_cp')?.value || '';
    data.proveedor.provincia = document.getElementById('iap_prov_prov')?.value || '';
    data.proveedor.telefono = document.getElementById('iap_prov_tel')?.value || '';
    data.proveedor.email = document.getElementById('iap_prov_email')?.value || '';
    data.proveedor.web = document.getElementById('iap_prov_web')?.value || '';
    data.proveedor.iban = document.getElementById('iap_prov_iban')?.value || '';
    data.proveedor.dias_pago = parseInt(document.getElementById('iap_prov_dias')?.value) || 30;
  }

  // Líneas — leer de los inputs editables
  const inputs = document.querySelectorAll('[data-iap]');
  inputs.forEach(inp => {
    const idx = parseInt(inp.dataset.idx);
    const campo = inp.dataset.iap;
    if (data.lineas && data.lineas[idx]) {
      if (['cantidad','precio_unitario','dto1_pct','dto2_pct','dto3_pct','iva_pct'].includes(campo)) {
        data.lineas[idx][campo] = parseFloat(inp.value) || 0;
      } else {
        data.lineas[idx][campo] = inp.value;
      }
    }
  });

  return data;
}

// ═══════════════════════════════════════════════
// VALIDAR Y CREAR — Ejecutar todo
// ═══════════════════════════════════════════════
async function iaPreviewValidar() {
  const btn = document.getElementById('iaBtnValidar');
  btn.disabled = true;
  btn.textContent = '⏳ Creando...';

  try {
    // 1. Leer datos editados del preview
    const data = _iaPreviewLeerDatos();
    // Leer tipo del selector (por si el usuario lo cambió)
    const tipoSel = document.getElementById('iap_tipo_doc');
    const tipo = tipoSel ? tipoSel.value : _iaPreviewTipo;

    // 2. Resolver/crear proveedor
    let provId = null;
    if (_iaPreviewProvMatch) {
      provId = _iaPreviewProvMatch.id;
      toast('Proveedor existente: ' + _iaPreviewProvMatch.nombre, 'info');
    } else if (data.proveedor && data.proveedor.nombre) {
      provId = await iaCrearProveedor(data.proveedor);
    }

    // 3. Resolver/crear artículos para cada línea + vincular con proveedor
    if (data.lineas) {
      for (const linea of data.lineas) {
        const artExiste = _iaBuscarArticuloExistente(linea);
        if (artExiste) {
          linea._artId = artExiste.id;
          linea._artCodigo = artExiste.codigo || '';
          // Vincular artículo existente con este proveedor (si no está ya)
          if (provId) await _iaVincularArticuloProveedor(artExiste.id, provId, linea);
        } else {
          const nuevoArt = await iaCrearArticulo(linea, provId);
          linea._artId = nuevoArt ? nuevoArt.id : null;
          linea._artCodigo = nuevoArt ? (nuevoArt.codigo || '') : '';
        }
      }
    }

    // 4. Rellenar el formulario correspondiente
    if (tipo === 'albaran') {
      await iaRellenarAlbaran(data, provId);
    } else if (tipo === 'pedido') {
      await iaRellenarPedido(data, provId);
    } else if (tipo === 'presupuesto' || tipo === 'presupuesto_compra') {
      await iaRellenarPresupuestoCompra(data, provId);
    } else {
      await iaRellenarFactura(data, provId);
    }

    closeModal('mIAPreview');
    toast('Documento importado. Revisa y guarda cuando estés listo.', 'success');

  } catch(e) {
    toast('Error al validar: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = '✅ Validar y crear';
  }
}

// ═══════════════════════════════════════════════
// TAREAS PENDIENTES — Datos incompletos en OCR
// Se genera una tarea cuando el OCR crea un
// proveedor o artículo con campos obligatorios
// vacíos, para que el rol correspondiente los
// complete manualmente.
//
// Campos obligatorios:
//   Proveedor : nombre, cif, telefono, direccion, cp, municipio, provincia, forma_pago_id
//   Artículo  : nombre, precio_venta, precio_coste, tipo_iva_id, unidad_id, familia_id, codigo
// ═══════════════════════════════════════════════

const _CAMPOS_REQUERIDOS = {
  proveedor: [
    { campo: 'cif',          etiqueta: 'CIF/NIF' },
    { campo: 'telefono',     etiqueta: 'Teléfono' },
    { campo: 'direccion',    etiqueta: 'Dirección' },
    { campo: 'cp',           etiqueta: 'Código postal' },
    { campo: 'municipio',    etiqueta: 'Municipio' },
    { campo: 'provincia',    etiqueta: 'Provincia' },
    { campo: 'forma_pago_id',etiqueta: 'Forma de pago' },
  ],
  articulo: [
    { campo: 'precio_venta', etiqueta: 'Precio venta (PVP)' },
    { campo: 'precio_coste', etiqueta: 'Precio coste' },
    { campo: 'tipo_iva_id',  etiqueta: 'Tipo IVA' },
    { campo: 'unidad_id',    etiqueta: 'Unidad de medida' },
    { campo: 'familia_id',   etiqueta: 'Familia' },
    { campo: 'codigo',       etiqueta: 'Código interno' },
  ]
};

const _ROL_ASIGNADO = {
  proveedor: 'admin',
  articulo:  'encargado_almacen'
};

async function _generarTareaPendiente(entidadTipo, entidadId, entidadNombre, registro, facturaRef) {
  if (!EMPRESA?.id) return;

  const requeridos = _CAMPOS_REQUERIDOS[entidadTipo] || [];
  const faltantes  = requeridos.filter(({ campo }) => {
    const v = registro[campo];
    return v === null || v === undefined || v === '' || v === 0;
  });

  if (!faltantes.length) return; // Todo completo, no hace falta tarea

  const etiquetas = faltantes.map(f => f.etiqueta);
  const rol = _ROL_ASIGNADO[entidadTipo] || 'admin';

  const nombreTipo = entidadTipo === 'proveedor' ? 'proveedor' : 'artículo';
  const titulo = `Completar datos del ${nombreTipo}: ${entidadNombre}`;

  const tarea = {
    empresa_id:       EMPRESA.id,
    entidad_tipo:     entidadTipo,
    entidad_id:       entidadId,
    entidad_nombre:   entidadNombre,
    titulo,
    campos_faltantes: etiquetas,
    origen:           'ocr',
    rol_asignado:     rol,
    estado:           'pendiente',
    factura_origen_ref: facturaRef || null,
    usuario_creador_id: (typeof CU !== 'undefined' && CU?.id) ? CU.id : null
  };

  const { error } = await sb.from('tareas_pendientes').insert(tarea);
  if (error) {
    console.warn('No se pudo crear tarea pendiente:', error.message);
    return;
  }

  const iconos = { proveedor: '🏢', articulo: '📦' };
  console.info(`[Tarea] ${iconos[entidadTipo] || '📋'} ${titulo} | Faltan: ${etiquetas.join(', ')} → ${rol}`);
}

// ═══════════════════════════════════════════════
// CREAR PROVEEDOR (solo cuando se confirma)
// ═══════════════════════════════════════════════
async function iaCrearProveedor(provData) {
  const nuevo = {
    empresa_id: EMPRESA.id,
    nombre: provData.nombre || 'Proveedor sin nombre',
    cif: provData.cif || null,
    direccion: provData.direccion || null,
    municipio: provData.municipio || null,
    cp: provData.cp || null,
    provincia: provData.provincia || null,
    telefono: provData.telefono || null,
    email: provData.email || null,
    web: provData.web || null,
    dias_pago: provData.dias_pago || 30,
    observaciones: provData.iban ? ('IBAN: ' + provData.iban) : null,
    activo: true
  };

  const { data, error } = await sb.from('proveedores').insert(nuevo).select().single();
  if (error) {
    toast('No se pudo crear el proveedor: ' + error.message, 'warning');
    return null;
  }
  proveedores.push(data);
  toast('Nuevo proveedor creado: ' + data.nombre, 'success');

  // Generar tarea si faltan campos obligatorios
  const facturaRef = _iaPreviewData?.numero || _iaPreviewData?.referencia || null;
  await _generarTareaPendiente('proveedor', data.id, data.nombre, data, facturaRef);

  return data.id;
}

// ═══════════════════════════════════════════════
// CREAR ARTÍCULO (solo cuando se confirma)
// Lógica de precios:
//   - precio_unitario del documento = PVP (precio bruto del proveedor)
//   - precio_coste = PVP * (1-dto1/100) * (1-dto2/100) * (1-dto3/100)  (neto)
//   - precio_venta = precio_coste * 1.3 (margen 30% por defecto)
// ═══════════════════════════════════════════════
async function iaCrearArticulo(lineaOCR, provId) {
  const desc = (lineaOCR.descripcion || '').trim();
  const codigo = (lineaOCR.codigo || '').trim();
  if (!desc && !codigo) return null;

  // ── Protección anti-duplicados: buscar en BD antes de crear ──
  if (codigo) {
    // Por código exacto
    const { data: byCode } = await sb.from('articulos').select('*')
      .eq('empresa_id', EMPRESA.id).eq('activo', true).ilike('codigo', codigo).limit(1);
    if (byCode?.length) { toast('🔗 Artículo existente (código): ' + byCode[0].nombre, 'info'); return byCode[0]; }
    // Por referencia_fabricante
    const { data: byRef } = await sb.from('articulos').select('*')
      .eq('empresa_id', EMPRESA.id).eq('activo', true).ilike('referencia_fabricante', codigo).limit(1);
    if (byRef?.length) { toast('🔗 Artículo existente (ref): ' + byRef[0].nombre, 'info'); return byRef[0]; }
    // Por ref_proveedor en articulos_proveedores
    const { data: byAP } = await sb.from('articulos_proveedores').select('articulo_id,articulos(*)')
      .eq('empresa_id', EMPRESA.id).ilike('ref_proveedor', codigo).limit(1);
    if (byAP?.length && byAP[0].articulos) { toast('🔗 Artículo existente (ref prov): ' + byAP[0].articulos.nombre, 'info'); return byAP[0].articulos; }
  }

  const pvp = lineaOCR.precio_unitario || 0;
  const d1 = lineaOCR.dto1_pct || 0;
  const d2 = lineaOCR.dto2_pct || 0;
  const d3 = lineaOCR.dto3_pct || 0;
  const precioCoste = pvp * (1 - d1/100) * (1 - d2/100) * (1 - d3/100);

  const nuevo = {
    empresa_id: EMPRESA.id,
    nombre: desc || codigo,
    codigo: codigo || null,
    referencia_fabricante: codigo || null,
    precio_coste: Math.round(precioCoste * 100) / 100,
    precio_venta: Math.round(pvp * 100) / 100,
    descuento: 0,
    tipo_iva_id: _iaGetTipoIvaId(lineaOCR.iva_pct || 21),
    es_activo: false, activo: true
  };

  const { data, error } = await sb.from('articulos').insert(nuevo).select().single();
  if (error) {
    toast('No se pudo crear artículo: ' + (desc || codigo), 'warning');
    return null;
  }
  articulos.push(data);

  // Vincular artículo al proveedor en tabla articulos_proveedores
  if (provId && data.id) {
    await _iaVincularArticuloProveedor(data.id, provId, lineaOCR);
  }

  // Generar tarea si faltan campos obligatorios del artículo
  // Nota: precio_coste y precio_venta ya se calculan arriba; si pvp=0 quedarán a 0
  const artFacturaRef = _iaPreviewData?.numero || _iaPreviewData?.referencia || null;
  await _generarTareaPendiente('articulo', data.id, data.nombre, {
    precio_venta: nuevo.precio_venta,
    precio_coste: nuevo.precio_coste,
    tipo_iva_id:  nuevo.tipo_iva_id,
    unidad_id:    nuevo.unidad_id    || null,
    familia_id:   nuevo.familia_id   || null,
    codigo:       nuevo.codigo
  }, artFacturaRef);

  toast('Nuevo artículo: ' + data.nombre, 'info');
  return data;
}

// ═══════════════════════════════════════════════
// VINCULAR ARTÍCULO ↔ PROVEEDOR
// Se usa tanto para artículos nuevos como existentes
// ═══════════════════════════════════════════════
async function _iaVincularArticuloProveedor(articuloId, provId, lineaOCR) {
  if (!articuloId || !provId) return;

  // Verificar si ya existe esta relación
  const yaExiste = await sb.from('articulos_proveedores')
    .select('id')
    .eq('articulo_id', articuloId)
    .eq('proveedor_id', provId)
    .eq('empresa_id', EMPRESA.id)
    .maybeSingle();

  if (yaExiste?.data) return; // Ya vinculado, no duplicar

  const pvp = lineaOCR.precio_unitario || 0;
  const d1 = lineaOCR.dto1_pct || 0;
  const d2 = lineaOCR.dto2_pct || 0;
  const d3 = lineaOCR.dto3_pct || 0;
  const neto = pvp * (1 - d1/100) * (1 - d2/100) * (1 - d3/100);

  // Construir texto de descuento compuesto (ej: "40+5+5")
  let dtoTexto = '';
  if (d1) dtoTexto = String(d1);
  if (d2) dtoTexto += '+' + d2;
  if (d3) dtoTexto += '+' + d3;

  const obj = {
    empresa_id: EMPRESA.id,
    articulo_id: articuloId,
    proveedor_id: provId,
    ref_proveedor: lineaOCR.codigo || null,
    precio_proveedor: Math.round(neto * 100) / 100,
    descuento: d1 || 0,
    es_principal: true,
    observaciones: dtoTexto ? ('Dto: ' + dtoTexto + '% sobre PVP ' + pvp.toFixed(2) + ' €') : null
  };

  const { error } = await sb.from('articulos_proveedores').insert(obj);
  if (error) {
    console.warn('No se pudo vincular artículo-proveedor:', error.message);
  }
}

// ═══════════════════════════════════════════════
// RELLENAR FORMULARIOS (después de validar)
// ═══════════════════════════════════════════════
async function iaRellenarFactura(data, provId) {
  fpLineas = [];
  fpEditId = null;
  fpProveedorActual = provId;

  const sel = document.getElementById('fp_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores || []).map(p => `<option value="${p.id}" ${p.id == provId ? 'selected' : ''}>${p.nombre}</option>`).join('');
  sel.onchange = function() { fp_aplicarReglaProveedor(this.value); };

  const fpSel = document.getElementById('fp_formapago');
  fpSel.innerHTML = '<option value="">— Sin especificar —</option>' +
    (formasPago || []).map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
  fp_poblarBancos();

  document.getElementById('fp_numero').value = data.numero_documento || await generarNumeroDoc('factura_proveedor');
  document.getElementById('fp_fecha').value = data.fecha || new Date().toISOString().split('T')[0];
  document.getElementById('fp_vencimiento').value = data.fecha_vencimiento || (() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0];
  })();
  document.getElementById('fp_observaciones').value = data.notas || '';
  if (provId) fp_aplicarReglaProveedor(provId);

  if (data.lineas && data.lineas.length > 0) {
    for (const linea of data.lineas) {
      fpLineas.push({
        articulo_id: linea._artId || null,
        codigo: linea.codigo || linea._artCodigo || '',
        nombre: linea.descripcion || '',
        cantidad: linea.cantidad || 1,
        precio: linea.precio_unitario || 0,
        dto1: linea.dto1_pct || 0,
        dto2: linea.dto2_pct || 0,
        dto3: linea.dto3_pct || 0,
        iva: linea.iva_pct || 21
      });
    }
  } else {
    fpLineas.push({ articulo_id: null, codigo: '', nombre: '', cantidad: 1, precio: 0, dto1:0, dto2:0, dto3:0, iva: 21 });
  }

  document.getElementById('mFPTit').textContent = 'Factura de Proveedor (importada con IA)';
  fp_renderLineas();
  openModal('mFacturaProv');
}

async function iaRellenarAlbaran(data, provId) {
  rcLineas = [];
  rcEditId = null;
  rcProveedorActual = provId;
  // Almacén por defecto: el principal (primero de la lista)
  rcAlmacenDestino = (typeof almacenes !== 'undefined' && almacenes.length) ? almacenes[0].id : null;

  // Poblar proveedor
  const sel = document.getElementById('rc_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores || []).map(p => `<option value="${p.id}" ${p.id == provId ? 'selected' : ''}>${p.nombre}</option>`).join('');

  // Poblar selector de almacén
  const almSel = document.getElementById('rc_almacen');
  if (almSel) {
    const alms = typeof almacenes !== 'undefined' ? almacenes : [];
    almSel.innerHTML = alms.length
      ? alms.map(a => `<option value="${a.id}" ${a.id === rcAlmacenDestino ? 'selected' : ''}>${a.nombre}</option>`).join('')
      : '<option value="">— Sin almacenes —</option>';
  }

  document.getElementById('rc_numero').value = data.numero_documento || '';
  document.getElementById('rc_fecha').value = data.fecha || new Date().toISOString().split('T')[0];
  document.getElementById('rc_observaciones').value = data.notas || '';

  if (data.lineas && data.lineas.length > 0) {
    for (const linea of data.lineas) {
      rcLineas.push({
        articulo_id: linea._artId || null,
        codigo: linea._artCodigo || '',
        nombre: linea.descripcion || '',
        cantidad_pedida: linea.cantidad || 1,
        cantidad_recibida: linea.cantidad || 1,
        precio: linea.precio_unitario || 0,
        dto1: linea.dto1_pct || 0,
        dto2: linea.dto2_pct || 0,
        dto3: linea.dto3_pct || 0
      });
    }
  } else {
    rcLineas.push({ articulo_id: null, codigo: '', nombre: '', cantidad_pedida: 1, cantidad_recibida: 1, precio: 0, dto1:0, dto2:0, dto3:0 });
  }

  document.getElementById('mRCTit').textContent = 'Albarán de Proveedor (importado con IA)';
  rc_renderLineas();
  openModal('mRecepcion');
}

async function iaRellenarPedido(data, provId) {
  pcLineas = [];
  pcEditId = null;
  pcProveedorActual = provId;

  const sel = document.getElementById('pc_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores || []).map(p => `<option value="${p.id}" ${p.id == provId ? 'selected' : ''}>${p.nombre}</option>`).join('');

  document.getElementById('pc_numero').value = data.numero_documento || '';
  document.getElementById('pc_fecha').value = data.fecha || new Date().toISOString().split('T')[0];
  const entrega = document.getElementById('pc_entrega');
  if (entrega) {
    entrega.value = data.fecha_vencimiento || (() => {
      const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split('T')[0];
    })();
  }
  document.getElementById('pc_observaciones').value = data.notas || '';

  if (data.lineas && data.lineas.length > 0) {
    for (const linea of data.lineas) {
      pcLineas.push({
        articulo_id: linea._artId || null,
        codigo: linea.codigo || linea._artCodigo || '',
        nombre: linea.descripcion || '',
        cantidad: linea.cantidad || 1,
        precio: linea.precio_unitario || 0,
        dto1: linea.dto1_pct || 0,
        dto2: linea.dto2_pct || 0,
        dto3: linea.dto3_pct || 0,
        iva: linea.iva_pct || 21
      });
    }
  } else {
    pcLineas.push({ articulo_id: null, codigo: '', nombre: '', cantidad: 1, precio: 0, dto1:0, dto2:0, dto3:0, iva: 21 });
  }

  document.getElementById('mPCTit').textContent = 'Pedido de Compra (importado con IA)';
  pc_renderLineas();
  openModal('mPedidoCompra');
}

async function iaRellenarPresupuestoCompra(data, provId) {
  prcLineas = [];
  prcEditId = null;
  prcProveedorActual = provId;

  const sel = document.getElementById('prc_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores || []).map(p => `<option value="${p.id}" ${p.id == provId ? 'selected' : ''}>${p.nombre}</option>`).join('');

  document.getElementById('prc_numero').value = data.numero_documento || '';
  document.getElementById('prc_fecha').value = data.fecha || new Date().toISOString().split('T')[0];
  const validez = document.getElementById('prc_validez');
  if (validez) {
    validez.value = data.fecha_vencimiento || (() => {
      const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0];
    })();
  }
  document.getElementById('prc_observaciones').value = data.notas || '';

  if (data.lineas && data.lineas.length > 0) {
    for (const linea of data.lineas) {
      prcLineas.push({
        articulo_id: linea._artId || null,
        codigo: linea.codigo || linea._artCodigo || '',
        nombre: linea.descripcion || '',
        cantidad: linea.cantidad || 1,
        precio: linea.precio_unitario || 0,
        dto1: linea.dto1_pct || 0,
        dto2: linea.dto2_pct || 0,
        dto3: linea.dto3_pct || 0,
        iva: linea.iva_pct || 21
      });
    }
  } else {
    prcLineas.push({ articulo_id: null, codigo: '', nombre: '', cantidad: 1, precio: 0, dto1:0, dto2:0, dto3:0, iva: 21 });
  }

  document.getElementById('mPRCTit').textContent = 'Presupuesto de Compra (importado con IA)';
  prc_renderLineas();
  openModal('mPresupuestoCompra');
}

// ═══════════════════════════════════════════════
// BUSCADOR DE ARTÍCULOS EN PREVIEW
// ═══════════════════════════════════════════════
let _iapSugTimer = null;

function _iaPreviewBuscarArt(input) {
  const idx = input.dataset.idx;
  const query = input.value.trim().toLowerCase();
  const sugDiv = document.getElementById('iap_sug_' + idx);
  if (!sugDiv) return;

  clearTimeout(_iapSugTimer);
  if (query.length < 2) { sugDiv.style.display = 'none'; return; }

  _iapSugTimer = setTimeout(() => {
    const resultados = (articulos || []).filter(a => {
      const nombre = (a.nombre || '').toLowerCase();
      const codigo = (a.codigo || '').toLowerCase();
      return nombre.includes(query) || query.includes(nombre) || codigo.includes(query);
    }).slice(0, 8);

    if (!resultados.length) {
      sugDiv.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:var(--gris-400)">Sin coincidencias — se creará nuevo</div>';
      sugDiv.style.display = 'block';
      return;
    }

    sugDiv.innerHTML = resultados.map(a =>
      `<div class="iap-sug-item" style="padding:6px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--gris-100);display:flex;justify-content:space-between;align-items:center"
           onmousedown="_iaPreviewSeleccionarArt(${idx}, ${a.id})"
           onmouseover="this.style.background='var(--gris-50)'"
           onmouseout="this.style.background='#fff'">
        <div>
          <span style="font-weight:600">${a.nombre||''}</span>
          ${a.codigo ? '<span style="color:var(--gris-400);margin-left:6px;font-size:10px">['+a.codigo+']</span>' : ''}
        </div>
        <span style="color:var(--azul);font-size:10px;font-weight:600">✓ Usar este</span>
      </div>`
    ).join('');
    sugDiv.style.display = 'block';
  }, 200);
}

function _iaPreviewSeleccionarArt(idx, artId) {
  const art = (articulos || []).find(a => a.id === artId);
  if (!art) return;

  // Actualizar el input de descripción
  const descInput = document.querySelector(`[data-iap="descripcion"][data-idx="${idx}"]`);
  if (descInput) descInput.value = art.nombre;

  // Actualizar el input de código
  const codInput = document.querySelector(`[data-iap="codigo"][data-idx="${idx}"]`);
  if (codInput) codInput.value = art.codigo || '';

  // Actualizar badge a "Existe"
  const tr = descInput?.closest('tr');
  if (tr) {
    const badgeTd = tr.querySelector('td:first-child');
    if (badgeTd) badgeTd.innerHTML = '<span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:8px;font-size:10px;white-space:nowrap">✓ ' + (art.codigo||'Existe') + '</span>';
  }

  // Guardar artículo seleccionado en datos del preview
  if (_iaPreviewData && _iaPreviewData.lineas && _iaPreviewData.lineas[idx]) {
    _iaPreviewData.lineas[idx]._artMatch = art;
    _iaPreviewData.lineas[idx].descripcion = art.nombre;
    _iaPreviewData.lineas[idx].codigo = art.codigo || '';
  }

  // Cerrar sugerencias
  const sugDiv = document.getElementById('iap_sug_' + idx);
  if (sugDiv) sugDiv.style.display = 'none';
}

// Cerrar sugerencias cuando se hace clic fuera
document.addEventListener('click', function(e) {
  if (!e.target.closest('.iap-sugerencias') && !e.target.matches('[data-iap="descripcion"]')) {
    document.querySelectorAll('.iap-sugerencias').forEach(s => s.style.display = 'none');
  }
});
