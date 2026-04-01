/**
 * MÓDULO PEDIDOS DE COMPRA
 * Gestión de compras: creación, edición, seguimiento de recepción
 */

// ═══════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let pcLineas = [];
let pcProveedorActual = null;
let pcEditId = null;
let pedidosCompra = [];

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadPedidosCompra() {
  if (!EMPRESA || !EMPRESA.id) return;
  const {data} = await sb.from('pedidos_compra').select('*').eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false});
  pedidosCompra = data || [];
  // Filtro por defecto: año en curso
  const y = new Date().getFullYear();
  const dEl = document.getElementById('pcFiltroDesde');
  const hEl = document.getElementById('pcFiltroHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
  filtrarPedidosCompra();
  actualizarKpisPedidos();
}

function renderPedidosCompra(list) {
  const html = list.length ? list.map(pc => {
    const estado = {borrador:'⏳', enviado:'✉️', recibido_parcial:'📦', recibido:'✓', anulado:'✗'}[pc.estado]||'?';
    return `<tr>
      <td><div style="font-weight:700">${pc.numero}</div><div style="font-size:11px;color:var(--gris-400)">${new Date(pc.fecha).toLocaleDateString('es-ES')}</div></td>
      <td><div style="font-weight:600">${pc.proveedor_nombre}</div></td>
      <td>${pc.fecha_entrega_prevista ? new Date(pc.fecha_entrega_prevista).toLocaleDateString('es-ES') : '—'}</td>
      <td><span style="display:inline-block;padding:3px 8px;border-radius:4px;background:var(--gris-100);font-size:12px">${estado} ${pc.estado}</span></td>
      <td style="text-align:right;font-weight:600">${fmtE(pc.total)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="editarPedidoCompra(${pc.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delPedidoCompra(${pc.id})">🗑️</button>
        ${pc.estado==='enviado'?`<button class="btn btn-ghost btn-sm" onclick="pedidoToRecepcion(${pc.id})" title="Crear albarán proveedor">📥</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="pedidoToFacturaProv(${pc.id})" title="Crear factura proveedor">🧾</button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty"><div class="ei">🛒</div><h3>Sin pedidos</h3></div></td></tr>';
  document.getElementById('pcTable').innerHTML = html;
}

function actualizarKpisPedidos() {
  const total = pedidosCompra.reduce((s,p) => s + (p.total||0), 0);
  const pendientes = pedidosCompra.filter(p => ['borrador','enviado'].includes(p.estado)).length;
  const recibidos = pedidosCompra.filter(p => p.estado === 'recibido').length;
  document.getElementById('pcKpiTotal').textContent = fmtE(total);
  document.getElementById('pcKpiPend').textContent = pendientes;
  document.getElementById('pcKpiRecib').textContent = recibidos;
  document.getElementById('pcKpiImporte').textContent = fmtE(pedidosCompra.filter(p => p.estado==='recibido').reduce((s,p) => s + (p.total||0), 0));
}

// ═══════════════════════════════════════════════
// FILTRADO
// ═══════════════════════════════════════════════
function filtrarPedidosCompra() {
  const estado = v('pcFiltroEstado');
  const prov = v('pcFiltroProveedor');
  const desde = v('pcFiltroDesde');
  const hasta = v('pcFiltroHasta');

  let filtered = pedidosCompra;
  if (estado) filtered = filtered.filter(p => p.estado === estado);
  if (prov) filtered = filtered.filter(p => p.proveedor_id == prov);
  if (desde) filtered = filtered.filter(p => new Date(p.fecha) >= new Date(desde));
  if (hasta) filtered = filtered.filter(p => new Date(p.fecha) <= new Date(hasta));

  renderPedidosCompra(filtered);
}

// ═══════════════════════════════════════════════
// CREAR NUEVO PEDIDO
// ═══════════════════════════════════════════════
async function nuevoPedidoCompra() {
  pcLineas = [];
  pcEditId = null;
  pcProveedorActual = null;

  const sel = document.getElementById('pc_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores||[]).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('pc_fecha').value = hoy;
  const v1 = new Date(); v1.setDate(v1.getDate() + 7);
  document.getElementById('pc_entrega').value = v1.toISOString().split('T')[0];

  document.getElementById('pc_numero').value = await generarNumeroDoc('pedido_compra');
  document.getElementById('pc_observaciones').value = '';
  document.getElementById('mPCTit').textContent = 'Nuevo Pedido de Compra';

  pc_addLinea();
  openModal('mPedidoCompra');
}

// ═══════════════════════════════════════════════
// EDITAR PEDIDO
// ═══════════════════════════════════════════════
async function editarPedidoCompra(id) {
  const pc = pedidosCompra.find(x => x.id === id);
  if (!pc) return;

  pcEditId = id;
  pcProveedorActual = pc.proveedor_id;
  pcLineas = pc.lineas || [];

  const sel = document.getElementById('pc_proveedor');
  sel.innerHTML = (proveedores||[]).map(p => `<option value="${p.id}" ${p.id===pc.proveedor_id?'selected':''}>${p.nombre}</option>`).join('');

  setVal({
    pc_numero: pc.numero,
    pc_fecha: pc.fecha,
    pc_entrega: pc.fecha_entrega_prevista,
    pc_observaciones: pc.observaciones || ''
  });

  document.getElementById('mPCTit').textContent = 'Editar Pedido de Compra';
  pc_renderLineas();
  openModal('mPedidoCompra');
}

// ═══════════════════════════════════════════════
// GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function pc_addLinea() {
  pcLineas.push({articulo_id:null, codigo:'', nombre:'', cantidad:1, precio:0, iva:21});
  pc_renderLineas();
}

function pc_removeLinea(idx) {
  pcLineas.splice(idx, 1);
  pc_renderLineas();
}

function pc_updateLinea(idx, field, val) {
  if (field === 'articulo_id') {
    const art = (articulos||[]).find(a => a.id == val);
    if (art) {
      pcLineas[idx].articulo_id = art.id;
      pcLineas[idx].codigo = art.codigo;
      pcLineas[idx].nombre = art.nombre;
      pcLineas[idx].precio = art.precio_coste || 0;
      pcLineas[idx].iva = art.iva_default || 21;
    }
  } else if (['cantidad','precio','iva'].includes(field)) {
    pcLineas[idx][field] = parseFloat(val) || 0;
  } else {
    pcLineas[idx][field] = val;
  }
  pc_renderLineas();
}

function pc_renderLineas() {
  let base = 0, ivaTotal = 0;
  const html = pcLineas.map((l, i) => {
    const subtotal = l.cantidad * l.precio;
    const ivaAmt = subtotal * (l.iva / 100);
    base += subtotal;
    ivaTotal += ivaAmt;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 6px">
        <select onchange="pc_updateLinea(${i},'articulo_id',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          <option value="">${l.nombre||'—'}</option>
          ${(articulos||[]).map(a => `<option value="${a.id}" ${a.id===l.articulo_id?'selected':''}>${a.codigo} - ${a.nombre}</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 6px"><input type="number" value="${l.cantidad}" min="0.01" step="0.01" onchange="pc_updateLinea(${i},'cantidad',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01" onchange="pc_updateLinea(${i},'precio',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px">
        <select onchange="pc_updateLinea(${i},'iva',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${(tiposIva||[]).map(t => `<option value="${t.porcentaje}" ${t.porcentaje===l.iva?'selected':''}>${t.porcentaje}%</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(subtotal+ivaAmt)}</td>
      <td style="padding:7px 4px"><button onclick="pc_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button></td>
    </tr>`;
  }).join('');

  document.getElementById('pc_lineas').innerHTML = html;
  document.getElementById('pc_base').textContent = fmtE(base);
  document.getElementById('pc_iva_total').textContent = fmtE(ivaTotal);
  document.getElementById('pc_total').textContent = fmtE(base + ivaTotal);
}

// ═══════════════════════════════════════════════
// GUARDAR PEDIDO
// ═══════════════════════════════════════════════
async function guardarPedidoCompra(estado) {
  const numero = v('pc_numero').trim();
  const provId = parseInt(v('pc_proveedor'));
  const fecha = v('pc_fecha');
  const entrega = v('pc_entrega');

  if (!numero) {toast('Introduce número de pedido','error');return;}
  if (!provId) {toast('Selecciona proveedor','error');return;}
  if (pcLineas.length === 0) {toast('Agrega al menos una línea','error');return;}

  const prov = (proveedores||[]).find(p => p.id === provId);
  let base = 0, ivaTotal = 0;
  pcLineas.forEach(l => {
    const subtotal = l.cantidad * l.precio;
    base += subtotal;
    ivaTotal += subtotal * (l.iva / 100);
  });

  const obj = {
    empresa_id: EMPRESA.id,
    numero,
    proveedor_id: provId,
    proveedor_nombre: prov?.nombre || '',
    fecha,
    fecha_entrega_prevista: entrega,
    estado,
    base_imponible: base,
    total_iva: ivaTotal,
    total: base + ivaTotal,
    lineas: pcLineas,
    observaciones: v('pc_observaciones'),
    usuario_id: CU.id
  };

  if (pcEditId) {
    await sb.from('pedidos_compra').update(obj).eq('id', pcEditId);
  } else {
    await sb.from('pedidos_compra').insert(obj);
  }

  closeModal('mPedidoCompra');
  loadPedidosCompra();
  toast('Pedido guardado ✓', 'success');
}

// ═══════════════════════════════════════════════
// CAMBIAR ESTADO
// ═══════════════════════════════════════════════
async function cambiarEstadoPC(id, nuevoEstado) {
  await sb.from('pedidos_compra').update({estado: nuevoEstado}).eq('id', id);
  loadPedidosCompra();
  toast('Estado actualizado', 'success');
}

// ═══════════════════════════════════════════════
// CONVERTIR A RECEPCIÓN
// ═══════════════════════════════════════════════
async function pedidoToRecepcion(id) {
  const pc = pedidosCompra.find(x => x.id === id);
  if (!pc) return;

  // Crear recepción con líneas del pedido
  const lineas = (pc.lineas||[]).map(l => ({
    ...l,
    cantidad_pedida: l.cantidad,
    cantidad_recibida: 0
  }));

  const numero = await generarNumeroDoc('recepcion');
  const obj = {
    empresa_id: EMPRESA.id,
    numero,
    pedido_compra_id: id,
    proveedor_id: pc.proveedor_id,
    proveedor_nombre: pc.proveedor_nombre,
    almacen_destino_id: (almacenes||[]).length > 0 ? almacenes[0].id : null,
    fecha: new Date().toISOString().split('T')[0],
    estado: 'pendiente',
    lineas,
    observaciones: '',
    usuario_id: CU.id,
    usuario_nombre: CP?.nombre || CU.email
  };

  await sb.from('recepciones').insert(obj);
  await cambiarEstadoPC(id, 'enviado');
  goPage('albaranes-proveedor');
  toast('Albarán de proveedor creado desde pedido ✓', 'success');
}

// ═══════════════════════════════════════════════
// ELIMINAR PEDIDO
// ═══════════════════════════════════════════════
async function delPedidoCompra(id) {
  if (!confirm('¿Eliminar pedido de compra?')) return;
  await sb.from('pedidos_compra').delete().eq('id', id);
  pedidosCompra = pedidosCompra.filter(p => p.id !== id);
  renderPedidosCompra(pedidosCompra);
  toast('Pedido eliminado', 'info');
}

// ═══════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════
function exportPedidosCompra() {
  const csv = 'Número,Proveedor,Fecha,Entrega Prevista,Estado,Base,IVA,Total\n' +
    pedidosCompra.map(p => `"${p.numero}","${p.proveedor_nombre}","${p.fecha}","${p.fecha_entrega_prevista}","${p.estado}",${p.base_imponible},${p.total_iva},${p.total}`).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos_compra_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════
// CONVERSIONES ADICIONALES
// ═══════════════════════════════════════════════
async function pedidoToFacturaProv(id) {
  const pc = pedidosCompra.find(x => x.id === id);
  if (!pc) return;
  if (!confirm(`¿Crear factura de proveedor desde el pedido ${pc.numero}?`)) return;
  const numero = await generarNumeroDoc('factura_proveedor');
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);
  const { error } = await sb.from('facturas_proveedor').insert({
    empresa_id: EMPRESA.id, numero,
    proveedor_id: pc.proveedor_id, proveedor_nombre: pc.proveedor_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: pc.base_imponible || pc.total || 0,
    total_iva: pc.total_iva || 0,
    total: pc.total || 0,
    estado: 'pendiente',
    observaciones: pc.observaciones,
    lineas: pc.lineas,
    pedido_compra_id: pc.id,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await cambiarEstadoPC(id, 'recibido');
  toast('🧾 Factura proveedor creada', 'success');
  goPage('facturas-proveedor');
}
