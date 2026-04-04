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

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadRecepciones() {
  if (!EMPRESA || !EMPRESA.id) return;
  const {data} = await sb.from('recepciones').select('*').eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false});
  recepciones = data || [];
  // Filtro por defecto: año en curso
  const y = new Date().getFullYear();
  const dEl = document.getElementById('rcFiltroDesde');
  const hEl = document.getElementById('rcFiltroHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
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
  const btnMulti = document.getElementById('rcFacturarMulti');
  if (btnMulti) btnMulti.style.display = 'none';
  const html = list.length ? list.map(r => {
    const estado = {pendiente:'⏳', verificada:'✓', almacenada:'📦'}[r.estado]||'?';
    return `<tr>
      <td style="text-align:center;width:30px">${r.exportado_bloqueado ? '' : `<input type="checkbox" class="rc-check" value="${r.id}" data-proveedor="${r.proveedor_id||''}" onchange="rcCheckChanged()" style="cursor:pointer">`}</td>
      <td><div style="font-weight:700">${r.numero}</div><div style="font-size:11px;color:var(--gris-400)">${new Date(r.fecha).toLocaleDateString('es-ES')}</div></td>
      <td><div style="font-weight:600">${r.proveedor_nombre}</div></td>
      <td>${r.usuario_nombre||'—'}</td>
      <td><span style="display:inline-block;padding:3px 8px;border-radius:4px;background:var(--gris-100);font-size:12px">${estado} ${r.estado}</span></td>
      <td style="text-align:right;font-weight:600">${r.lineas ? fmtE(r.lineas.reduce((s,l) => s + (l.cantidad_recibida * l.precio), 0)) : '0'}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="imprimirRecepcion(${r.id})" title="Imprimir">🖨️</button>
        <button class="btn btn-ghost btn-sm" onclick="enviarRecepcionEmail(${r.id})" title="Enviar por email">📧</button>
        <button class="btn btn-ghost btn-sm" onclick="editarRecepcion(${r.id})">✏️</button>
        ${r.estado==='pendiente'?`<button class="btn btn-ghost btn-sm" onclick="verificarRecepcion(${r.id})">✓</button>`:''}
        ${r.estado==='verificada'?`<button class="btn btn-ghost btn-sm" onclick="almacenarRecepcion(${r.id})">📦</button>`:''}
        ${r.exportado_bloqueado ? '<span title="Exportado a factura" style="font-size:11px;color:var(--rojo)">🔒</span>' : `<button class="btn btn-ghost btn-sm" onclick="recepcionToFacturaProv(${r.id})" title="Crear factura proveedor">🧾</button>
        <button class="btn btn-ghost btn-sm" onclick="delRecepcion(${r.id})">🗑️</button>`}
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty"><div class="ei">📥</div><h3>Sin recepciones</h3></div></td></tr>';
  document.getElementById('rcTable').innerHTML = html;
}

function actualizarKpisRecepciones() {
  const total = recepciones.reduce((s,r) => s + (r.lineas ? r.lineas.reduce((sum,l) => sum + (l.cantidad_recibida * l.precio), 0) : 0), 0);
  const pendientes = recepciones.filter(r => r.estado === 'pendiente').length;
  const esteMes = recepciones.filter(r => {
    const f = new Date(r.fecha);
    const hoy = new Date();
    return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
  }).length;
  document.getElementById('rcKpiTotal').textContent = fmtE(total);
  document.getElementById('rcKpiPend').textContent = pendientes;
  document.getElementById('rcKpiMes').textContent = esteMes;
  document.getElementById('rcKpiValor').textContent = fmtE(recepciones.filter(r => r.estado==='almacenada').reduce((s,r) => s + (r.lineas ? r.lineas.reduce((sum,l) => sum + (l.cantidad_recibida * l.precio), 0) : 0), 0));
}

// ═══════════════════════════════════════════════
// FILTRADO
// ═══════════════════════════════════════════════
function filtrarRecepciones() {
  const estado = v('rcFiltroEstado');
  const prov = v('rcFiltroProveedor');
  const desde = v('rcFiltroDesde');
  const hasta = v('rcFiltroHasta');

  let filtered = recepciones;
  if (estado) filtered = filtered.filter(r => r.estado === estado);
  if (prov) filtered = filtered.filter(r => r.proveedor_id == prov);
  if (desde) filtered = filtered.filter(r => new Date(r.fecha) >= new Date(desde));
  if (hasta) filtered = filtered.filter(r => new Date(r.fecha) <= new Date(hasta));

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
  document.getElementById('mRCTit').textContent = 'Nueva Recepción';

  rc_addLinea();
  openModal('mRecepcion');
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

  document.getElementById('mRCTit').textContent = 'Editar Recepción';
  rc_renderLineas();
  openModal('mRecepcion');
}

// ═══════════════════════════════════════════════
// GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function rc_addLinea() {
  rcLineas.push({articulo_id:null, codigo:'', nombre:'', cantidad_pedida:0, cantidad_recibida:0, precio:0});
  rc_renderLineas();
}

function rc_removeLinea(idx) {
  rcLineas.splice(idx, 1);
  rc_renderLineas();
}

function rc_updateLinea(idx, field, val) {
  if (field === 'articulo_id') {
    const art = (articulos||[]).find(a => a.id == val);
    if (art) {
      rcLineas[idx].articulo_id = art.id;
      rcLineas[idx].codigo = art.codigo;
      rcLineas[idx].nombre = art.nombre;
      rcLineas[idx].precio = art.precio_coste || 0;
    }
  } else {
    rcLineas[idx][field] = parseFloat(val) || 0;
  }
  rc_renderLineas();
}

function rc_renderLineas() {
  let total = 0;
  const html = rcLineas.map((l, i) => {
    const subtotal = l.cantidad_recibida * l.precio;
    total += subtotal;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 6px">
        <select onchange="rc_updateLinea(${i},'articulo_id',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          <option value="">${l.nombre||'—'}</option>
          ${(articulos||[]).map(a => `<option value="${a.id}" ${a.id===l.articulo_id?'selected':''}>${a.codigo} - ${a.nombre}</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 6px;text-align:right"><input type="number" value="${l.cantidad_pedida}" min="0" step="0.01" onchange="rc_updateLinea(${i},'cantidad_pedida',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" readonly></td>
      <td style="padding:7px 6px"><input type="number" value="${l.cantidad_recibida}" min="0" step="0.01" onchange="rc_updateLinea(${i},'cantidad_recibida',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01" onchange="rc_updateLinea(${i},'precio',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(subtotal)}</td>
      <td style="padding:7px 4px"><button onclick="rc_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button></td>
    </tr>`;
  }).join('');

  document.getElementById('rc_lineas').innerHTML = html;
  document.getElementById('rc_total').textContent = fmtE(total);
}

// ═══════════════════════════════════════════════
// GUARDAR RECEPCIÓN
// ═══════════════════════════════════════════════
async function guardarRecepcion() {
  if (_creando) return;
  _creando = true;
  try {
    const numero = v('rc_numero').trim();
    const provId = parseInt(v('rc_proveedor'));
    const almacenId = parseInt(v('rc_almacen'));

    if (!numero) {toast('Introduce número de recepción','error');return;}
    if (!provId) {toast('Selecciona proveedor','error');return;}
    if (!almacenId) {toast('Selecciona almacén','error');return;}
    if (rcLineas.length === 0) {toast('Agrega al menos una línea','error');return;}

    const prov = (proveedores||[]).find(p => p.id === provId);
    const obj = {
      empresa_id: EMPRESA.id,
      numero,
      pedido_compra_id: rcEditId ? recepciones.find(x=>x.id===rcEditId)?.pedido_compra_id : null,
      proveedor_id: provId,
      proveedor_nombre: prov?.nombre || '',
      almacen_destino_id: almacenId,
      fecha: v('rc_fecha'),
      estado: rcEditId ? recepciones.find(x=>x.id===rcEditId)?.estado : 'pendiente',
      lineas: rcLineas,
      observaciones: v('rc_observaciones'),
      usuario_id: CU.id,
      usuario_nombre: CP?.nombre || CU.email
    };

    if (rcEditId) {
      await sb.from('recepciones').update(obj).eq('id', rcEditId);
    } else {
      await sb.from('recepciones').insert(obj);
    }

    closeModal('mRecepcion');
    loadRecepciones();
    toast('Recepción guardada ✓', 'success');
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
// VERIFICAR RECEPCIÓN
// ═══════════════════════════════════════════════
async function verificarRecepcion(id) {
  if (!confirm('¿Verificar recepción?')) return;
  await sb.from('recepciones').update({estado:'verificada'}).eq('id', id);
  loadRecepciones();
  toast('Recepción verificada ✓', 'success');
}

// ═══════════════════════════════════════════════
// ALMACENAR RECEPCIÓN (ACTUALIZAR STOCK)
// ═══════════════════════════════════════════════
async function almacenarRecepcion(id) {
  if (!confirm('¿Almacenar y actualizar stock?')) return;

  const r = recepciones.find(x => x.id === id);
  if (!r) return;

  // Actualizar stock en almacén
  for (const linea of (r.lineas||[])) {
    if (linea.articulo_id) {
      const {data:stock} = await sb.from('stock').select('*').eq('almacen_id', r.almacen_destino_id).eq('articulo_id', linea.articulo_id);
      if (stock && stock.length > 0) {
        const nuevoStock = (stock[0].cantidad||0) + linea.cantidad_recibida;
        await sb.from('stock').update({cantidad:nuevoStock}).eq('id', stock[0].id);
      } else {
        await sb.from('stock').insert({
          empresa_id: EMPRESA.id,
          almacen_id: r.almacen_destino_id,
          articulo_id: linea.articulo_id,
          cantidad: linea.cantidad_recibida
        });
      }
    }
  }

  await sb.from('recepciones').update({estado:'almacenada'}).eq('id', id);
  loadRecepciones();
  toast('Recepción almacenada y stock actualizado ✓', 'success');
}

// ═══════════════════════════════════════════════
// ELIMINAR RECEPCIÓN
// ═══════════════════════════════════════════════
async function delRecepcion(id) {
  if (!confirm('¿Eliminar recepción?')) return;
  await sb.from('recepciones').delete().eq('id', id);
  recepciones = recepciones.filter(r => r.id !== id);
  renderRecepciones(recepciones);
  toast('Recepción eliminada', 'info');
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
    const total = r.lineas ? r.lineas.reduce((s, l) => s + ((l.cantidad_recibida || l.cant || 0) * (l.precio || 0)), 0) : (r.total || 0);
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
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    await sb.from('recepciones').update({ exportado_a:'factura_proveedor', exportado_bloqueado:true }).eq('id', id);
    const rr = recepciones.find(x=>x.id===id); if(rr) { rr.exportado_a='factura_proveedor'; rr.exportado_bloqueado=true; }
    toast('🧾 Factura proveedor creada — albarán bloqueado', 'success');
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
        totalGlobal += ((l.cantidad_recibida || l.cant || 0) * (l.precio || 0));
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
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    // Marcar todos como bloqueados
    for (const r of recs) {
      await sb.from('recepciones').update({ exportado_a:'factura_proveedor', exportado_bloqueado:true }).eq('id', r.id);
      const rr = recepciones.find(x=>x.id===r.id); if(rr) { rr.exportado_a='factura_proveedor'; rr.exportado_bloqueado=true; }
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
  if (!r) return toast('Recepción no encontrada', 'error');
  const prov = proveedores.find(x => x.id === r.proveedor_id);
  const email = prov?.email || '';
  const subject = encodeURIComponent(`Recepción ${r.numero||''} — ${EMPRESA.nombre}`);
  const body = encodeURIComponent(
    `Estimado proveedor,\n\nLe confirmamos la recepción del material:\n\n` +
    `Nº Recepción: ${r.numero||'—'}\n` +
    `Fecha: ${r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}\n` +
    `Pedido origen: ${r.pedido_numero||'—'}\n\n` +
    `Atentamente,\n${EMPRESA.nombre}\nTel: ${EMPRESA.telefono||''}`
  );
  window.open(`mailto:${email}?subject=${subject}&body=${body}`);
  toast('Abriendo correo…', 'info');
}
