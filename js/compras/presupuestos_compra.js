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

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadPresupuestosCompra() {
  if (!EMPRESA || !EMPRESA.id) return;
  const {data} = await sb.from('presupuestos_compra').select('*').eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false});
  presupuestosCompra = data || [];
  // Filtro por defecto: año en curso
  const y = new Date().getFullYear();
  const dEl = document.getElementById('prcFiltroDesde');
  const hEl = document.getElementById('prcFiltroHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
  // Poblar selector de proveedores
  const sel = document.getElementById('prcFiltroProveedor');
  if (sel && sel.options.length <= 1) {
    (proveedores||[]).forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.nombre;
      sel.appendChild(o);
    });
  }
  filtrarPresupuestosCompra();
  actualizarKpisPrc();
}

function filtrarPresupuestosCompra() {
  const est = document.getElementById('prcFiltroEstado')?.value || '';
  const prov = document.getElementById('prcFiltroProveedor')?.value || '';
  const desde = document.getElementById('prcFiltroDesde')?.value || '';
  const hasta = document.getElementById('prcFiltroHasta')?.value || '';
  prcFiltrados = presupuestosCompra.filter(p => {
    if (est && p.estado !== est) return false;
    if (prov && String(p.proveedor_id) !== prov) return false;
    if (desde && p.fecha && p.fecha < desde) return false;
    if (hasta && p.fecha && p.fecha > hasta) return false;
    return true;
  });
  renderPresupuestosCompra(prcFiltrados);
}

function renderPresupuestosCompra(list) {
  if (!list) list = presupuestosCompra;
  const tb = document.getElementById('prcTable');
  if (!tb) return;
  tb.innerHTML = list.length ? list.map(p => {
    const total = parseFloat(p.total||0).toFixed(2);
    return `<tr>
      <td><strong style="color:var(--azul);font-family:monospace;font-size:11.5px">${p.numero||'—'}</strong><br><span style="font-size:11px;color:var(--gris-400)">${p.fecha||'—'}</span></td>
      <td>${p.proveedor_nombre||'—'}</td>
      <td style="font-size:11.5px">${p.validez||'—'}</td>
      <td>${estadoBadgePrc(p.estado)}</td>
      <td style="text-align:right;font-weight:700">${total} €</td>
      <td style="text-align:right">
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="imprimirPresupuestoCompra(${p.id})" title="Imprimir">🖨️</button>
          <button class="btn btn-ghost btn-sm" onclick="enviarPresupuestoCompraEmail(${p.id})" title="Enviar por email">📧</button>
          <button class="btn btn-ghost btn-sm" onclick="editarPresupuestoCompra(${p.id})" title="Editar">✏️</button>
          ${p.exportado_bloqueado ? '<span title="Exportado a '+p.exportado_a+'" style="font-size:11px;color:var(--rojo)">🔒</span>' : `<button class="btn btn-ghost btn-sm" onclick="prcToPedido(${p.id})" title="Generar pedido">📦</button>
          <button class="btn btn-ghost btn-sm" onclick="prcToRecepcion(${p.id})" title="Recepcionar">📥</button>
          <button class="btn btn-ghost btn-sm" onclick="prcToFacturaProv(${p.id})" title="Facturar">🧾</button>
          <button class="btn btn-ghost btn-sm" onclick="eliminarPresupuestoCompra(${p.id})" title="Eliminar">🗑️</button>`}
        </div>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty"><div class="ei">📋</div><h3>Sin presupuestos de compra</h3><p>Crea tu primer presupuesto de compra</p></div></td></tr>';
}

function estadoBadgePrc(e) {
  const m = {
    borrador: '<span class="badge bg-gray">Borrador</span>',
    enviado: '<span class="badge" style="background:#EDF4FF;color:var(--azul)">Enviado</span>',
    aceptado: '<span class="badge bg-green">Aceptado</span>',
    rechazado: '<span class="badge bg-red">Rechazado</span>'
  };
  return m[e] || `<span class="badge bg-gray">${e||'—'}</span>`;
}

// ═══════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════
function actualizarKpisPrc() {
  const total = presupuestosCompra.length;
  const pend = presupuestosCompra.filter(p => p.estado === 'borrador' || p.estado === 'enviado').length;
  const acept = presupuestosCompra.filter(p => p.estado === 'aceptado').length;
  const importe = presupuestosCompra.reduce((s, p) => s + parseFloat(p.total||0), 0);
  const el = id => document.getElementById(id);
  if (el('prcKpiTotal')) el('prcKpiTotal').textContent = total;
  if (el('prcKpiPend')) el('prcKpiPend').textContent = pend;
  if (el('prcKpiAcept')) el('prcKpiAcept').textContent = acept;
  if (el('prcKpiImporte')) el('prcKpiImporte').textContent = importe.toFixed(2) + ' €';
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

  prc_addLinea();
  openModal('mPresupuestoCompra');
}

// ═══════════════════════════════════════════════
// EDITAR PRESUPUESTO
// ═══════════════════════════════════════════════
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
  document.getElementById('prc_validez').value = p.validez || '';
  document.getElementById('prc_observaciones').value = p.observaciones || '';

  document.getElementById('mPRCTit').textContent = 'Editar Presupuesto de Compra';

  if (prcLineas.length === 0) prc_addLinea();
  prc_renderLineas();
  openModal('mPresupuestoCompra');
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

function prc_updateLinea(idx, field, val) {
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
  prcLineas[lineaIdx].articulo_id = art.id;
  prcLineas[lineaIdx].codigo = art.codigo || '';
  prcLineas[lineaIdx].nombre = art.nombre || '';
  prcLineas[lineaIdx].precio = art.precio_coste || art.precio_venta || 0;
  if (art.tipo_iva_id && typeof tiposIva!=='undefined') {
    const t = tiposIva.find(x=>x.id===art.tipo_iva_id);
    if (t) prcLineas[lineaIdx].iva = t.porcentaje;
  }
  prc_renderLineas();
  toast(`📦 ${art.codigo||''} — ${art.nombre}`,'info');
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
      validez,
      estado,
      base_imponible: base,
      total_iva: ivaTotal,
      total: base + ivaTotal,
      lineas: prcLineas,
      observaciones: v('prc_observaciones'),
      usuario_id: CU.id
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
  if (!confirm('¿Eliminar presupuesto de compra?')) return;
  await sb.from('presupuestos_compra').delete().eq('id', id);
  presupuestosCompra = presupuestosCompra.filter(p => p.id !== id);
  filtrarPresupuestosCompra();
  actualizarKpisPrc();
  toast('Eliminado', 'info');
}

// ═══════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════
function exportPresupuestosCompra() {
  const data = prcFiltrados.length ? prcFiltrados : presupuestosCompra;
  if (!data.length) { toast('No hay datos para exportar', 'info'); return; }
  if (!confirm(`¿Exportar ${data.length} presupuesto(s) de compra a Excel?`)) return;
  const rows = data.map(p => ({
    'Número': p.numero,
    'Fecha': p.fecha,
    'Proveedor': p.proveedor_nombre,
    'Estado': p.estado,
    'Validez': p.validez,
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
    if (!confirm(`¿Crear pedido de compra desde ${p.numero}?`)) return;
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
    if (!confirm(`¿Crear albarán de proveedor desde ${p.numero}?`)) return;
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
      total: p.total,
      presupuesto_compra_id: p.id,
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
    if (!confirm(`¿Crear factura de proveedor desde ${p.numero}?`)) return;
    const numero = await generarNumeroDoc('factura_proveedor');
    const hoy = new Date(); const venc = new Date(); venc.setDate(venc.getDate() + 30);
    const { error } = await sb.from('facturas_proveedor').insert({
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
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
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
    const sub = cant * precio;
    const ivaAmt = sub * (iva/100);
    baseCalc += sub;
    ivaCalc += ivaAmt;
    htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.nombre||l.desc||l.descripcion||''}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${cant}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${precio.toFixed(2)} €</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${iva}%</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${(sub+ivaAmt).toFixed(2)} €</td></tr>`;
  });
  const dirEmpresa=[EMPRESA?.direccion,[EMPRESA?.cp,EMPRESA?.municipio].filter(Boolean).join(' '),EMPRESA?.provincia].filter(Boolean).join(', ');
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:8px">`:`<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const totalFinal = p.total || (baseCalc + ivaCalc);
  const win=window.open('','_blank','width=850,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Pres. Compra ${p.numero}</title><style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style></head><body><div class="no-print btn-bar"><button style="background:#1e40af;color:#fff" onclick="window.print()">🖨️ Imprimir</button><button style="background:#e2e8f0;color:#475569" onclick="window.close()">✕ Cerrar</button></div><div class="page"><div style="display:flex;gap:24px;margin-bottom:16px"><div style="flex:1"><div style="display:flex;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div><div style="font-size:11px;color:#475569">${dirEmpresa}<br>CIF: ${EMPRESA?.cif||''}</div></div></div></div><div style="flex:1"><div style="background:#fef3c7;border-radius:8px;padding:12px 16px;border-left:4px solid #f59e0b"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;margin-bottom:4px">PROVEEDOR</div><div style="font-size:15px;font-weight:700">${p.proveedor_nombre||'—'}</div><div style="font-size:11px;color:#475569">${prov?.direccion||''} ${prov?.cif?'<br>CIF: '+prov.cif:''}</div></div></div></div><div style="display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px"><div style="color:#1e40af"><span style="font-size:14px;font-weight:800">PRESUPUESTO COMPRA</span> <span style="font-size:11px;color:#475569">${p.numero||''}</span></div><div style="font-size:11px;color:#64748b">Fecha: <b>${p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'}</b>${p.validez?' · Válido hasta: <b>'+new Date(p.validez).toLocaleDateString('es-ES')+'</b>':''}</div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><thead><tr><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:60px">Cant.</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:90px">Precio</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:50px">IVA</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Total</th></tr></thead><tbody>${htmlLineas}</tbody></table><div style="display:flex;justify-content:flex-end"><div style="width:240px;background:#fef3c7;border-radius:8px;padding:12px 16px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:4px"><span>Base imponible</span><span>${(p.base_imponible||baseCalc).toFixed(2)} €</span></div><div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px"><span>IVA</span><span>${(p.total_iva||ivaCalc).toFixed(2)} €</span></div><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;border-top:1.5px solid #d97706;padding-top:6px"><span>TOTAL</span><span style="color:#92400e">${totalFinal.toFixed(2)} €</span></div></div></div>${p.observaciones?`<div style="margin-top:14px;padding:10px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">Observaciones</div><div style="font-size:11px;color:#475569">${p.observaciones}</div></div>`:''}</div></body></html>`);
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
      if(p.validez)doc.text(' · Válido hasta: '+new Date(p.validez).toLocaleDateString('es-ES'),ML+60,y);
      y+=8;
      doc.setFontSize(11);doc.setFont(undefined,'bold');doc.setTextColor(146,64,14);
      doc.text('PROVEEDOR',ML,y);y+=5;
      doc.setFontSize(12);doc.setTextColor(0,0,0);doc.text(p.proveedor_nombre||'—',ML,y);y+=5;
      if(prov?.cif){doc.setFontSize(9);doc.setTextColor(71,85,105);doc.text('CIF: '+prov.cif,ML,y);y+=4;}
      if(prov?.direccion){doc.text(prov.direccion,ML,y);y+=6;}else{y+=4;}
      y+=4;
      const headers=[['Descripción','Cant.','Precio','IVA','Total']];
      const rows=lineas.map(l=>{const cant=l.cantidad||l.cant||0;const precio=l.precio||0;const iva=l.iva!==undefined?l.iva:21;const sub=cant*precio;const total=sub+sub*(iva/100);return[l.nombre||l.desc||l.descripcion||'',String(cant),precio.toFixed(2)+' €',iva+'%',total.toFixed(2)+' €'];});
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
  if (typeof enviarDocumentoPorEmail === 'function' && typeof _correoCuentaActiva !== 'undefined' && _correoCuentaActiva) {
    nuevoCorreo(email, asuntoTxt, cuerpoTxt, { tipo: 'presupuesto_compra', id: p.id, ref: p.numero || '' });
    goPage('correo');
  } else {
    window.open(`mailto:${email}?subject=${encodeURIComponent(asuntoTxt)}&body=${encodeURIComponent(cuerpoTxt)}`);
    toast('📧 Abriendo cliente de correo...','info');
  }
}
