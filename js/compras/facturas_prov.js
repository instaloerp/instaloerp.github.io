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

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadFacturasProv() {
  if (!EMPRESA || !EMPRESA.id) return;
  const {data} = await sb.from('facturas_proveedor').select('*').eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false});
  facturasProveedor = data || [];
  // Filtro por defecto: año en curso
  const y = new Date().getFullYear();
  const dEl = document.getElementById('fpFiltroDesde');
  const hEl = document.getElementById('fpFiltroHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
  filtrarFacturasProv();
  actualizarKpisFacturas();
}

function renderFacturasProv(list) {
  const html = list.length ? list.map(fp => {
    const estado = {pendiente:'⏳', pagada:'✓', anulada:'✗'}[fp.estado]||'?';
    const vencida = fp.estado === 'pendiente' && new Date(fp.fecha_vencimiento) < new Date() ? ' style="color:var(--rojo);font-weight:700)"' : '';
    return `<tr${vencida}>
      <td><div style="font-weight:700">${fp.numero}</div><div style="font-size:11px;color:var(--gris-400)">${new Date(fp.fecha).toLocaleDateString('es-ES')}</div></td>
      <td><div style="font-weight:600">${fp.proveedor_nombre}</div></td>
      <td>${new Date(fp.fecha_vencimiento).toLocaleDateString('es-ES')}</td>
      <td><span style="display:inline-block;padding:3px 8px;border-radius:4px;background:var(--gris-100);font-size:12px">${estado} ${fp.estado}</span></td>
      <td style="text-align:right;font-weight:600">${fmtE(fp.total)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="imprimirFacturaProv(${fp.id})" title="Imprimir">🖨️</button>
        <button class="btn btn-ghost btn-sm" onclick="enviarFacturaProvEmail(${fp.id})" title="Enviar por email">📧</button>
        <button class="btn btn-ghost btn-sm" onclick="editarFacturaProv(${fp.id})">✏️</button>
        ${fp.estado==='pendiente'?`<button class="btn btn-ghost btn-sm" onclick="pagarFacturaProv(${fp.id})">💰</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="delFacturaProv(${fp.id})">🗑️</button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty"><div class="ei">📑</div><h3>Sin facturas</h3></div></td></tr>';
  document.getElementById('fpTable').innerHTML = html;
}

function actualizarKpisFacturas() {
  const total = facturasProveedor.reduce((s,f) => s + (f.total||0), 0);
  const pendientes = facturasProveedor.filter(f => f.estado === 'pendiente').length;
  const pagadasMes = facturasProveedor.filter(f => {
    const fm = new Date(f.fecha);
    const hoy = new Date();
    return f.estado === 'pagada' && fm.getMonth() === hoy.getMonth() && fm.getFullYear() === hoy.getFullYear();
  }).length;
  const pendientePago = facturasProveedor.filter(f => f.estado === 'pendiente').reduce((s,f) => s + (f.total||0), 0);
  document.getElementById('fpKpiTotal').textContent = fmtE(total);
  document.getElementById('fpKpiPend').textContent = pendientes;
  document.getElementById('fpKpiMesPagadas').textContent = pagadasMes;
  document.getElementById('fpKpiPendiente').textContent = fmtE(pendientePago);
}

// ═══════════════════════════════════════════════
// FILTRADO
// ═══════════════════════════════════════════════
function filtrarFacturasProv() {
  const estado = v('fpFiltroEstado');
  const prov = v('fpFiltroProveedor');
  const desde = v('fpFiltroDesde');
  const hasta = v('fpFiltroHasta');

  let filtered = facturasProveedor;
  if (estado) filtered = filtered.filter(f => f.estado === estado);
  if (prov) filtered = filtered.filter(f => f.proveedor_id == prov);
  if (desde) filtered = filtered.filter(f => new Date(f.fecha) >= new Date(desde));
  if (hasta) filtered = filtered.filter(f => new Date(f.fecha) <= new Date(hasta));

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
  fp_renderLineas();
  openModal('mFacturaProv');
}

// ═══════════════════════════════════════════════
// GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function fp_addLinea() {
  fpLineas.push({articulo_id:null, codigo:'', nombre:'', cantidad:1, precio:0, iva:21});
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

function fp_updateLinea(idx, field, val) {
  if (field === 'articulo_id') {
    const art = (articulos||[]).find(a => a.id == val);
    if (art) {
      fpLineas[idx].articulo_id = art.id;
      fpLineas[idx].codigo = art.codigo;
      fpLineas[idx].nombre = art.nombre;
      fpLineas[idx].precio = art.precio_coste || 0;
      fpLineas[idx].iva = art.iva_default || 21;
    }
  } else if (['cantidad','precio','iva'].includes(field)) {
    fpLineas[idx][field] = parseFloat(val) || 0;
  } else {
    fpLineas[idx][field] = val;
  }
  fp_renderLineas();
}

function _fp_onSelectArt(lineaIdx, art) {
  fpLineas[lineaIdx].articulo_id = art.id;
  fpLineas[lineaIdx].codigo = art.codigo || '';
  fpLineas[lineaIdx].nombre = art.nombre || '';
  fpLineas[lineaIdx].precio = art.precio_coste || art.precio_venta || 0;
  if (art.tipo_iva_id && typeof tiposIva!=='undefined') {
    const t = tiposIva.find(x=>x.id===art.tipo_iva_id);
    if (t) fpLineas[lineaIdx].iva = t.porcentaje;
  }
  fp_renderLineas();
  toast(`📦 ${art.codigo||''} — ${art.nombre}`,'info');
}

function fp_renderLineas() {
  let base = 0, ivaTotal = 0;
  const html = fpLineas.map((l, i) => {
    const subtotal = l.cantidad * l.precio;
    const ivaAmt = subtotal * (l.iva / 100);
    base += subtotal;
    ivaTotal += ivaAmt;
    const descVal = l.nombre || '';
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
      <td style="padding:7px 6px"><input type="number" value="${l.cantidad}" min="0.01" step="0.01" onchange="fp_updateLinea(${i},'cantidad',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01" onchange="fp_updateLinea(${i},'precio',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px">
        <select onchange="fp_updateLinea(${i},'iva',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${ivaOpts}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(subtotal+ivaAmt)}</td>
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
      const subtotal = l.cantidad * l.precio;
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
      usuario_id: CU.id
    };

    if (fpEditId) {
      await sb.from('facturas_proveedor').update(obj).eq('id', fpEditId);
    } else {
      await sb.from('facturas_proveedor').insert(obj);
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
      fecha_pago: new Date().toISOString().split('T')[0],
      usuario_id: CU.id
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
    const sub=(l.cantidad||l.cant||0)*(l.precio||0);base+=sub;
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
  const valid = ['image/jpeg','image/png','image/jpg','image/webp','application/pdf'];
  if (!valid.includes(file.type)) {
    toast('Formato no soportado. Usa JPG, PNG o PDF.', 'error');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    toast('Archivo demasiado grande (max 20MB)', 'error');
    return;
  }
  _iaFileName = file.name;
  const fn = document.getElementById('iaFileName');
  fn.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
  fn.style.display = 'block';
  document.getElementById('iaDropZone').style.borderColor = 'var(--azul)';

  const reader = new FileReader();
  reader.onload = function(e) {
    // Remove data:xxx;base64, prefix
    _iaFileBase64 = e.target.result.split(',')[1];
    document.getElementById('iaBtnProcesar').disabled = false;
  };
  reader.readAsDataURL(file);
}

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

  // Animate progress bar
  bar.style.width = '10%';
  txt.textContent = 'Enviando documento a la IA...';

  try {
    // Decode API key
    let apiKey;
    try { apiKey = decodeURIComponent(escape(atob(EMPRESA.anthropic_api_key))); }
    catch(_) { apiKey = EMPRESA.anthropic_api_key; }

    const tipo = document.getElementById('ia_tipo_doc').value || 'factura';

    bar.style.width = '30%';
    txt.textContent = 'Analizando documento con Claude Vision...';

    const resp = await fetch('https://gskkqqhbpnycvuioqetj.supabase.co/functions/v1/ocr-documento', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPA_KEY,
        'x-anthropic-key': apiKey
      },
      body: JSON.stringify({
        imagen_base64: _iaFileBase64,
        tipo: tipo,
        empresa_id: EMPRESA.id
      })
    });

    bar.style.width = '70%';
    txt.textContent = 'Procesando resultados...';

    const result = await resp.json();

    if (!result.success) {
      throw new Error(result.error || 'Error procesando documento');
    }

    bar.style.width = '85%';
    txt.textContent = 'Creando proveedor y articulos si es necesario...';

    const data = result.data;

    // --- Auto-crear proveedor si no existe ---
    let provId = null;
    if (data.proveedor) {
      provId = await iaResolverProveedor(data.proveedor);
    }

    bar.style.width = '95%';
    txt.textContent = 'Rellenando formulario...';

    // --- Auto-crear articulos si no existen y rellenar formulario ---
    await iaRellenarFactura(data, provId);

    bar.style.width = '100%';
    txt.textContent = 'Completado!';

    closeModal('mImportarIA');
    toast('Documento importado con IA. Revisa los datos antes de guardar.', 'success');

  } catch(e) {
    errDiv.textContent = 'Error: ' + e.message;
    errDiv.style.display = 'block';
    bar.style.width = '0%';
    prog.style.display = 'none';
    btn.disabled = false;
  }
}

// Buscar proveedor existente por CIF o nombre, o crear uno nuevo
async function iaResolverProveedor(provData) {
  // Buscar por CIF
  if (provData.cif) {
    const existente = (proveedores || []).find(p =>
      p.cif && p.cif.replace(/[\s\-\.]/g,'').toUpperCase() === provData.cif.replace(/[\s\-\.]/g,'').toUpperCase()
    );
    if (existente) {
      toast('Proveedor encontrado: ' + existente.nombre, 'info');
      return existente.id;
    }
  }

  // Buscar por nombre (coincidencia parcial)
  if (provData.nombre) {
    const nombreNorm = provData.nombre.toLowerCase().trim();
    const existente = (proveedores || []).find(p =>
      p.nombre && p.nombre.toLowerCase().trim() === nombreNorm
    );
    if (existente) {
      toast('Proveedor encontrado: ' + existente.nombre, 'info');
      return existente.id;
    }
  }

  // No existe — crear nuevo
  const nuevo = {
    empresa_id: EMPRESA.id,
    nombre: provData.nombre || 'Proveedor sin nombre',
    cif: provData.cif || null,
    direccion: provData.direccion || null,
    telefono: provData.telefono || null,
    email: provData.email || null,
    activo: true,
    usuario_id: CU.id
  };

  const { data, error } = await sb.from('proveedores').insert(nuevo).select().single();
  if (error) {
    toast('No se pudo crear el proveedor: ' + error.message, 'warning');
    return null;
  }

  // Añadir al array global
  proveedores.push(data);
  toast('Nuevo proveedor creado: ' + data.nombre, 'success');
  return data.id;
}

// Buscar articulo por nombre/descripcion, o crear nuevo
async function iaResolverArticulo(lineaOCR) {
  const desc = (lineaOCR.descripcion || '').trim();
  if (!desc) return null;

  // Buscar por nombre exacto o similar
  const descNorm = desc.toLowerCase();
  let art = (articulos || []).find(a =>
    a.nombre && a.nombre.toLowerCase() === descNorm
  );

  if (!art) {
    // Buscar coincidencia parcial (contiene)
    art = (articulos || []).find(a =>
      a.nombre && (a.nombre.toLowerCase().includes(descNorm) || descNorm.includes(a.nombre.toLowerCase()))
    );
  }

  if (art) return art;

  // Crear articulo nuevo
  const nuevo = {
    empresa_id: EMPRESA.id,
    nombre: desc,
    codigo: '',
    precio_coste: lineaOCR.precio_unitario || 0,
    precio_venta: (lineaOCR.precio_unitario || 0) * 1.3, // Margen 30% por defecto
    tipo_iva_id: _iaGetTipoIvaId(lineaOCR.iva_pct || 21),
    activo: true,
    usuario_id: CU.id
  };

  const { data, error } = await sb.from('articulos').insert(nuevo).select().single();
  if (error) {
    toast('No se pudo crear articulo: ' + desc, 'warning');
    return null;
  }

  articulos.push(data);
  toast('Nuevo articulo creado: ' + desc, 'info');
  return data;
}

function _iaGetTipoIvaId(porcentaje) {
  if (typeof tiposIva === 'undefined') return null;
  const t = tiposIva.find(x => x.porcentaje === porcentaje);
  return t ? t.id : (tiposIva[0]?.id || null);
}

// Rellenar el formulario de factura con los datos OCR
async function iaRellenarFactura(data, provId) {
  // Inicializar formulario
  fpLineas = [];
  fpEditId = null;
  fpProveedorActual = provId;

  // Poblar selector proveedor
  const sel = document.getElementById('fp_proveedor');
  sel.innerHTML = '<option value="">— Selecciona proveedor —</option>' +
    (proveedores || []).map(p => `<option value="${p.id}" ${p.id == provId ? 'selected' : ''}>${p.nombre}</option>`).join('');
  sel.onchange = function() { fp_aplicarReglaProveedor(this.value); };

  // Poblar formas de pago y bancos
  const fpSel = document.getElementById('fp_formapago');
  fpSel.innerHTML = '<option value="">— Sin especificar —</option>' +
    (formasPago || []).map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
  fp_poblarBancos();

  // Numero factura
  document.getElementById('fp_numero').value = data.numero_documento || await generarNumeroDoc('factura_proveedor');
  // Fechas
  document.getElementById('fp_fecha').value = data.fecha || new Date().toISOString().split('T')[0];
  document.getElementById('fp_vencimiento').value = data.fecha_vencimiento || (() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  })();
  // Observaciones
  document.getElementById('fp_observaciones').value = data.notas || '';

  // Aplicar reglas del proveedor (forma pago, banco, vencimiento)
  if (provId) fp_aplicarReglaProveedor(provId);

  // Procesar lineas
  if (data.lineas && data.lineas.length > 0) {
    for (const linea of data.lineas) {
      const art = await iaResolverArticulo(linea);
      fpLineas.push({
        articulo_id: art ? art.id : null,
        codigo: art ? (art.codigo || '') : '',
        nombre: linea.descripcion || (art ? art.nombre : ''),
        cantidad: linea.cantidad || 1,
        precio: linea.precio_unitario || 0,
        iva: linea.iva_pct || 21
      });
    }
  } else {
    // Al menos una linea vacia
    fpLineas.push({ articulo_id: null, codigo: '', nombre: '', cantidad: 1, precio: 0, iva: 21 });
  }

  document.getElementById('mFPTit').textContent = 'Factura de Proveedor (importada con IA)';
  fp_renderLineas();
  openModal('mFacturaProv');
}
