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
  renderFacturasProv(facturasProveedor);
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

  const fpSel = document.getElementById('fp_formapago');
  fpSel.innerHTML = '<option value="">— Sin especificar —</option>' +
    (formasPago||[]).map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');

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

function fp_renderLineas() {
  let base = 0, ivaTotal = 0;
  const html = fpLineas.map((l, i) => {
    const subtotal = l.cantidad * l.precio;
    const ivaAmt = subtotal * (l.iva / 100);
    base += subtotal;
    ivaTotal += ivaAmt;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 6px">
        <select onchange="fp_updateLinea(${i},'articulo_id',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          <option value="">${l.nombre||'—'}</option>
          ${(articulos||[]).map(a => `<option value="${a.id}" ${a.id===l.articulo_id?'selected':''}>${a.codigo} - ${a.nombre}</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 6px"><input type="number" value="${l.cantidad}" min="0.01" step="0.01" onchange="fp_updateLinea(${i},'cantidad',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01" onchange="fp_updateLinea(${i},'precio',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px">
        <select onchange="fp_updateLinea(${i},'iva',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${(tiposIva||[]).map(t => `<option value="${t.porcentaje}" ${t.porcentaje===l.iva?'selected':''}>${t.porcentaje}%</option>`).join('')}
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

  const obj = {
    empresa_id: EMPRESA.id,
    numero,
    proveedor_id: provId,
    proveedor_nombre: prov?.nombre || '',
    fecha,
    fecha_vencimiento: vencimiento,
    forma_pago_id: fpId ? parseInt(fpId) : null,
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
