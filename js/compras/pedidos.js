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
  const container = _listContainer('pcTable');
  if (!container) return;
  const html = list.length ? list.map(pc => {
    const estado = {borrador:'⏳', enviado:'✉️', recibido_parcial:'📦', recibido:'✓', anulado:'✗'}[pc.estado]||'?';
    const statusColor = {borrador:'#9ca3af', enviado:'#3b82f6', recibido_parcial:'#f59e0b', recibido:'#10b981', anulado:'#ef4444'}[pc.estado] || '#9ca3af';
    return `<div class="list-row" style="border-left-color:${statusColor}" onclick="editarPedidoCompra(${pc.id})">
      <div class="lr-left">
        <div class="lr-num">${pc.numero}</div>
        <div style="font-size:10px;color:var(--gris-400)">${new Date(pc.fecha).toLocaleDateString('es-ES')}</div>
      </div>
      <div class="lr-center">
        <div class="lr-title">${pc.proveedor_nombre}</div>
        <div class="lr-meta">
          <span class="lr-badge" style="background:${statusColor};color:#fff">${estado} ${pc.estado}</span>
          <span class="lr-sub">${pc.fecha_entrega_prevista ? new Date(pc.fecha_entrega_prevista).toLocaleDateString('es-ES') : '—'}</span>
        </div>
      </div>
      <div class="lr-right">
        <div class="lr-amount">${fmtE(pc.total)}</div>
        <div class="lr-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="imprimirPedidoCompra(${pc.id})" title="Imprimir">🖨️</button>
          <button class="btn btn-ghost btn-sm" onclick="enviarPedidoCompraEmail(${pc.id})" title="Enviar por email">📧</button>
          <button class="btn btn-ghost btn-sm" onclick="editarPedidoCompra(${pc.id})">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="delPedidoCompra(${pc.id})">🗑️</button>
          ${pc.exportado_bloqueado ? '<span title="Exportado a '+pc.exportado_a+'" style="font-size:11px;color:var(--rojo)">🔒</span>' : `${pc.estado==='enviado'?`<button class="btn btn-ghost btn-sm" onclick="pedidoToRecepcion(${pc.id})" title="Crear albarán proveedor">📥</button>`:''}
          <button class="btn btn-ghost btn-sm" onclick="pedidoToFacturaProv(${pc.id})" title="Crear factura proveedor">🧾</button>`}
        </div>
      </div>
    </div>`;
  }).join('') : '<div class="empty"><div class="ei">🛒</div><h3>Sin pedidos</h3></div>';
  container.innerHTML = html;
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
  if (_creando) return;
  _creando = true;
  try {
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
  } finally {
    _creando = false;
  }
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
  if (_creando) return;
  _creando = true;
  try {
    const pc = pedidosCompra.find(x => x.id === id);
    if (!pc) return;
    if (pc.exportado_bloqueado) { toast('🔒 Este pedido ya fue exportado a '+pc.exportado_a,'error'); return; }

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
    await sb.from('pedidos_compra').update({ exportado_a:'recepcion', exportado_bloqueado:true }).eq('id', id);
    await cambiarEstadoPC(id, 'enviado');
    const pp = pedidosCompra.find(x=>x.id===id); if(pp) { pp.exportado_a='recepcion'; pp.exportado_bloqueado=true; }
    goPage('albaranes-proveedor');
    toast('Albarán de proveedor creado — pedido bloqueado', 'success');
  } finally {
    _creando = false;
  }
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
  if (_creando) return;
  _creando = true;
  try {
    const pc = pedidosCompra.find(x => x.id === id);
    if (!pc) return;
    if (pc.exportado_bloqueado) { toast('🔒 Este pedido ya fue exportado a '+pc.exportado_a,'error'); return; }
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
    await sb.from('pedidos_compra').update({ exportado_a:'factura_proveedor', exportado_bloqueado:true }).eq('id', id);
    await cambiarEstadoPC(id, 'recibido');
    const pp = pedidosCompra.find(x=>x.id===id); if(pp) { pp.exportado_a='factura_proveedor'; pp.exportado_bloqueado=true; }
    toast('🧾 Factura proveedor creada — pedido bloqueado', 'success');
    goPage('facturas-proveedor');
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  IMPRIMIR / EMAIL PEDIDO COMPRA
// ═══════════════════════════════════════════════
function imprimirPedidoCompra(id) {
  const p = pedidosCompra.find(x=>x.id===id);
  if (!p) { toast('No encontrado','error'); return; }
  const prov = (proveedores||[]).find(x=>x.id===p.proveedor_id);
  const lineas = p.lineas||[];
  let htmlLineas='', total=0;
  lineas.forEach(l=>{const sub=(l.cantidad||l.cant||0)*(l.precio||0);total+=sub;htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.desc||l.descripcion||''}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cantidad||l.cant||0}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${(l.precio||0).toFixed(2)} €</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${sub.toFixed(2)} €</td></tr>`;});
  const dirEmpresa=[EMPRESA?.direccion,[EMPRESA?.cp,EMPRESA?.municipio].filter(Boolean).join(' '),EMPRESA?.provincia].filter(Boolean).join(', ');
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:8px">`:`<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const win=window.open('','_blank','width=850,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Pedido ${p.numero}</title><style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style></head><body><div class="no-print btn-bar"><button style="background:#1e40af;color:#fff" onclick="window.print()">🖨️ Imprimir</button><button style="background:#e2e8f0;color:#475569" onclick="window.close()">✕ Cerrar</button></div><div class="page"><div style="display:flex;gap:24px;margin-bottom:16px"><div style="flex:1"><div style="display:flex;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div><div style="font-size:11px;color:#475569">${dirEmpresa}<br>CIF: ${EMPRESA?.cif||''}</div></div></div></div><div style="flex:1"><div style="background:#fef3c7;border-radius:8px;padding:12px 16px;border-left:4px solid #f59e0b"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;margin-bottom:4px">PROVEEDOR</div><div style="font-size:15px;font-weight:700">${p.proveedor_nombre||'—'}</div><div style="font-size:11px;color:#475569">${prov?.direccion||''} ${prov?.cif?'<br>CIF: '+prov.cif:''}</div></div></div></div><div style="display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px"><div style="color:#1e40af"><span style="font-size:14px;font-weight:800">PEDIDO DE COMPRA</span> <span style="font-size:11px;color:#475569">${p.numero||''}</span></div><div style="font-size:11px;color:#64748b">Fecha: <b>${p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'}</b></div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><thead><tr><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:70px">Cant.</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Precio</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Total</th></tr></thead><tbody>${htmlLineas}</tbody></table><div style="display:flex;justify-content:flex-end"><div style="width:220px;background:#fef3c7;border-radius:8px;padding:12px 16px"><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800"><span>TOTAL</span><span style="color:#92400e">${(p.total||total).toFixed(2)} €</span></div></div></div>${p.observaciones?`<div style="margin-top:14px;padding:10px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">Observaciones</div><div style="font-size:11px;color:#475569">${p.observaciones}</div></div>`:''}</div></body></html>`);
  win.document.close();
}

function enviarPedidoCompraEmail(id) {
  const p = pedidosCompra.find(x=>x.id===id);
  if (!p) return;
  const prov = (proveedores||[]).find(x=>x.id===p.proveedor_id);
  const email = prov?.email||'';
  const totalFmt = (p.total||0).toFixed(2).replace('.',',')+' €';
  const asunto = encodeURIComponent(`Pedido ${p.numero||''} — ${EMPRESA?.nombre||''}`);
  const cuerpo = encodeURIComponent(`Estimados,\n\nLes confirmamos el pedido ${p.numero||''} por importe de ${totalFmt}.\n\nFecha: ${p.fecha||''}\n${p.observaciones?'Obs: '+p.observaciones+'\n':''}\nRogamos confirmación de plazo de entrega.\n\nUn saludo,\n${EMPRESA?.nombre||''}\n${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}`);
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`);
  toast('📧 Abriendo cliente de correo...','info');
}
