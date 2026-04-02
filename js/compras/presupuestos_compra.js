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
          ${p.exportado_bloqueado ? '<span title="Exportado a '+p.exportado_a+'" style="font-size:11px;color:var(--rojo)">🔒</span>' : `<button class="btn btn-ghost btn-sm" onclick="prcToPedido(${p.id})" title="Crear pedido">📦</button>
          <button class="btn btn-ghost btn-sm" onclick="prcToRecepcion(${p.id})" title="Crear albarán proveedor">📥</button>
          <button class="btn btn-ghost btn-sm" onclick="prcToFacturaProv(${p.id})" title="Crear factura proveedor">🧾</button>
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
// CRUD
// ═══════════════════════════════════════════════
function nuevoPresupuestoCompra() {
  toast('Módulo de presupuestos de compra en desarrollo', 'info');
}

function editarPresupuestoCompra(id) {
  toast('Edición de presupuesto de compra en desarrollo', 'info');
}

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
    total: p.total,
    presupuesto_compra_id: p.id,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await sb.from('presupuestos_compra').update({ estado: 'aceptado', exportado_a:'pedido', exportado_bloqueado:true }).eq('id', id);
  const pp = presupuestosCompra.find(x => x.id === id); if (pp) { pp.estado = 'aceptado'; pp.exportado_a='pedido'; pp.exportado_bloqueado=true; }
  filtrarPresupuestosCompra(); actualizarKpisPrc();
  toast('📦 Pedido creado — presupuesto bloqueado', 'success');
}

async function prcToRecepcion(id) {
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
}

async function prcToFacturaProv(id) {
  const p = presupuestosCompra.find(x => x.id === id);
  if (!p) return;
  if (p.exportado_bloqueado) { toast('🔒 Este presupuesto ya fue exportado a '+p.exportado_a,'error'); return; }
  if (!confirm(`¿Crear factura de proveedor desde ${p.numero}?`)) return;
  const numero = await generarNumeroDoc('factura_proveedor');
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);
  const { error } = await sb.from('facturas_proveedor').insert({
    empresa_id: EMPRESA.id, numero,
    proveedor_id: p.proveedor_id, proveedor_nombre: p.proveedor_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: p.total || 0, total_iva: 0, total: p.total || 0,
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
}

// ═══════════════════════════════════════════════
//  IMPRIMIR / PDF / EMAIL PRESUPUESTO COMPRA
// ═══════════════════════════════════════════════
function imprimirPresupuestoCompra(id) {
  const p = presupuestosCompra.find(x=>x.id===id);
  if (!p) { toast('No encontrado','error'); return; }
  const prov = (proveedores||[]).find(x=>x.id===p.proveedor_id);
  const lineas = p.lineas||[];
  let htmlLineas='', total=0;
  lineas.forEach(l=>{const sub=(l.cantidad||l.cant||0)*(l.precio||0);total+=sub;htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.desc||l.descripcion||''}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cantidad||l.cant||0}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${(l.precio||0).toFixed(2)} €</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${sub.toFixed(2)} €</td></tr>`;});
  const dirEmpresa=[EMPRESA?.direccion,[EMPRESA?.cp,EMPRESA?.municipio].filter(Boolean).join(' '),EMPRESA?.provincia].filter(Boolean).join(', ');
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:8px">`:`<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const win=window.open('','_blank','width=850,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Pres. Compra ${p.numero}</title><style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style></head><body><div class="no-print btn-bar"><button style="background:#1e40af;color:#fff" onclick="window.print()">🖨️ Imprimir</button><button style="background:#e2e8f0;color:#475569" onclick="window.close()">✕ Cerrar</button></div><div class="page"><div style="display:flex;gap:24px;margin-bottom:16px"><div style="flex:1"><div style="display:flex;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div><div style="font-size:11px;color:#475569">${dirEmpresa}<br>CIF: ${EMPRESA?.cif||''}</div></div></div></div><div style="flex:1"><div style="background:#fef3c7;border-radius:8px;padding:12px 16px;border-left:4px solid #f59e0b"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;margin-bottom:4px">PROVEEDOR</div><div style="font-size:15px;font-weight:700">${p.proveedor_nombre||'—'}</div><div style="font-size:11px;color:#475569">${prov?.direccion||''} ${prov?.cif?'<br>CIF: '+prov.cif:''}</div></div></div></div><div style="display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px"><div style="color:#1e40af"><span style="font-size:14px;font-weight:800">PRESUPUESTO COMPRA</span> <span style="font-size:11px;color:#475569">${p.numero||''}</span></div><div style="font-size:11px;color:#64748b">Fecha: <b>${p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'}</b></div></div><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><thead><tr><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:70px">Cant.</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Precio</th><th style="background:#92400e;color:#fff;padding:7px 10px;font-size:9px;text-align:right;width:100px">Total</th></tr></thead><tbody>${htmlLineas}</tbody></table><div style="display:flex;justify-content:flex-end"><div style="width:220px;background:#fef3c7;border-radius:8px;padding:12px 16px"><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800"><span>TOTAL</span><span style="color:#92400e">${(p.total||total).toFixed(2)} €</span></div></div></div>${p.observaciones?`<div style="margin-top:14px;padding:10px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">Observaciones</div><div style="font-size:11px;color:#475569">${p.observaciones}</div></div>`:''}</div></body></html>`);
  win.document.close();
}

function enviarPresupuestoCompraEmail(id) {
  const p = presupuestosCompra.find(x=>x.id===id);
  if (!p) return;
  const prov = (proveedores||[]).find(x=>x.id===p.proveedor_id);
  const email = prov?.email||'';
  const asunto = encodeURIComponent(`Solicitud presupuesto ${p.numero||''} — ${EMPRESA?.nombre||''}`);
  const cuerpo = encodeURIComponent(`Estimados,\n\nLes solicitamos presupuesto para los siguientes artículos/servicios:\n\nReferencia: ${p.numero||''}\nFecha: ${p.fecha||''}\n\nQuedamos a la espera de su oferta.\n\nUn saludo,\n${EMPRESA?.nombre||''}\n${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}`);
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`);
  toast('📧 Abriendo cliente de correo...','info');
}
