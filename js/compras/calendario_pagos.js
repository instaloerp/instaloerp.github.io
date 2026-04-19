/**
 * MÓDULO CALENDARIO DE PAGOS Y COBROS
 * Vista unificada de:
 * - Pagos pendientes a proveedores (facturas_proveedor)
 * - Cobros pendientes de clientes (facturas)
 * Con vencimientos, banco asignado y gestión de pagos/cobros
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let calPagosData = [];
let calPagosFiltrados = [];
let cuentasBancarias = [];

// ═══════════════════════════════════════════════
//  CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadCalendarioPagos() {
  // Cargar facturas de proveedor (pagos)
  const { data: fps } = await sb.from('facturas_proveedor')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'anulada')
    .order('fecha_vencimiento', { ascending: true });

  // Cargar facturas de venta (cobros)
  const { data: fvs } = await sb.from('facturas')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'anulada')
    .order('fecha_vencimiento', { ascending: true });

  // Cargar cuentas bancarias
  try {
    const { data: bancos } = await sb.from('cuentas_bancarias')
      .select('*').eq('empresa_id', EMPRESA.id).order('nombre');
    cuentasBancarias = bancos || [];
  } catch(e) {
    cuentasBancarias = [];
  }

  const hoy = new Date().toISOString().split('T')[0];

  // Construir lista de PAGOS (facturas proveedor)
  const pagos = (fps || []).map(fp => {
    const vencido = fp.estado === 'pendiente' && fp.fecha_vencimiento && fp.fecha_vencimiento < hoy;
    return {
      id: fp.id,
      tipo_movimiento: 'pago',
      tipo: 'factura_proveedor',
      fecha_vencimiento: fp.fecha_vencimiento,
      entidad_id: fp.proveedor_id,
      entidad_nombre: fp.proveedor_nombre || '—',
      factura_numero: fp.numero,
      factura_id: fp.id,
      importe: fp.total || 0,
      banco_id: fp.banco_id || null,
      banco_nombre: fp.banco_nombre || '',
      estado: fp.estado === 'pagada' ? 'pagado' : (vencido ? 'vencido' : 'pendiente'),
      fecha_pago: fp.fecha_pago || null,
      observaciones: fp.observaciones || ''
    };
  });

  // Construir lista de COBROS (facturas venta)
  const cobros = (fvs || []).map(fv => {
    const estCobrada = fv.estado === 'cobrada' || fv.estado === 'pagada';
    const vencido = !estCobrada && fv.estado !== 'borrador' && fv.fecha_vencimiento && fv.fecha_vencimiento < hoy;
    return {
      id: fv.id,
      tipo_movimiento: 'cobro',
      tipo: 'factura',
      fecha_vencimiento: fv.fecha_vencimiento,
      entidad_id: fv.cliente_id,
      entidad_nombre: fv.cliente_nombre || '—',
      factura_numero: fv.numero,
      factura_id: fv.id,
      importe: fv.total || 0,
      banco_id: null,
      banco_nombre: '',
      estado: estCobrada ? 'cobrado' : (vencido ? 'vencido' : (fv.estado === 'borrador' ? 'borrador' : 'pendiente')),
      fecha_pago: null,
      observaciones: fv.observaciones || ''
    };
  }).filter(c => c.estado !== 'borrador'); // excluir borradores

  calPagosData = [...pagos, ...cobros];

  // Poblar selector de bancos
  const bSel = document.getElementById('cpBanco');
  if (bSel && bSel.options.length <= 1) {
    cuentasBancarias.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.nombre + (b.iban ? ' — ' + b.iban.slice(-8) : '');
      bSel.appendChild(o);
    });
  }

  // Filtro por defecto: próximos 3 meses
  const dEl = document.getElementById('cpDesde');
  const hEl = document.getElementById('cpHasta');
  if (dEl && !dEl.value) dEl.value = hoy;
  if (hEl && !hEl.value) {
    const h3m = new Date(); h3m.setMonth(h3m.getMonth() + 3);
    hEl.value = h3m.toISOString().split('T')[0];
  }

  filtrarCalendarioPagos();
}

function renderCalendarioPagos(list) {
  const ESTADOS = {
    pendiente: { label:'Pendiente', ico:'⏳', color:'var(--amarillo)', bg:'var(--amarillo-light)' },
    vencido:   { label:'Vencido',   ico:'⚠️', color:'var(--rojo)',     bg:'var(--rojo-light)' },
    pagado:    { label:'Pagado',    ico:'✅', color:'var(--verde)',    bg:'var(--verde-light)' },
    cobrado:   { label:'Cobrado',   ico:'✅', color:'var(--verde)',    bg:'var(--verde-light)' },
  };

  // KPIs - separar pagos y cobros
  const pagosAll  = calPagosData.filter(p => p.tipo_movimiento === 'pago');
  const cobrosAll = calPagosData.filter(p => p.tipo_movimiento === 'cobro');

  const pagosPend   = pagosAll.filter(p => p.estado === 'pendiente' || p.estado === 'vencido');
  const cobrosPend  = cobrosAll.filter(p => p.estado === 'pendiente' || p.estado === 'vencido');
  const vencidos    = calPagosData.filter(p => p.estado === 'vencido');

  const impPagosPend  = pagosPend.reduce((s, p) => s + p.importe, 0);
  const impCobrosPend = cobrosPend.reduce((s, p) => s + p.importe, 0);

  const kTotal   = document.getElementById('cpk-total');
  const kPend    = document.getElementById('cpk-pendientes');
  const kVenc    = document.getElementById('cpk-vencidos');
  const kImpPend = document.getElementById('cpk-imp-pend');
  const kImpPag  = document.getElementById('cpk-imp-pagado');
  if (kTotal)   kTotal.textContent   = calPagosData.length;
  if (kPend)    kPend.textContent    = pagosPend.length + cobrosPend.length;
  if (kVenc)    kVenc.textContent    = vencidos.length;
  if (kImpPend) kImpPend.innerHTML   = `<span style="color:var(--rojo)">${fmtE(impPagosPend)}</span> <span style="font-size:10px;color:var(--gris-400)">pagos</span> · <span style="color:var(--verde)">${fmtE(impCobrosPend)}</span> <span style="font-size:10px;color:var(--gris-400)">cobros</span>`;
  if (kImpPag)  kImpPag.textContent  = fmtE(impCobrosPend - impPagosPend);

  const tbody = document.getElementById('cpTable');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(p => {
    const est = ESTADOS[p.estado] || ESTADOS.pendiente;
    const esVencido = p.estado === 'vencido';
    const esPago = p.tipo_movimiento === 'pago';
    const esCobro = p.tipo_movimiento === 'cobro';
    const tipoTag = esPago
      ? '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:#FEE2E2;color:#991B1B">PAGO</span>'
      : '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:#DCFCE7;color:#166534">COBRO</span>';

    const bancoOpts = esPago ? cuentasBancarias.map(b =>
      `<option value="${b.id}" ${b.id === p.banco_id ? 'selected' : ''}>${b.nombre}</option>`
    ).join('') : '';

    const accionPagar = esPago && p.estado !== 'pagado'
      ? `<button onclick="registrarPagoCalendario(${p.factura_id})" style="padding:4px 8px;border-radius:6px;border:1px solid #10B981;background:#D1FAE5;cursor:pointer;font-size:11px;font-weight:700;color:#065F46" title="Marcar como pagado">💰 Pagar</button>`
      : '';
    const accionCobrar = esCobro && p.estado !== 'cobrado'
      ? `<button onclick="registrarCobroCalendario(${p.factura_id})" style="padding:4px 8px;border-radius:6px;border:1px solid #10B981;background:#D1FAE5;cursor:pointer;font-size:11px;font-weight:700;color:#065F46" title="Marcar como cobrado">💰 Cobrar</button>`
      : '';

    return `<tr style="${esVencido ? 'background:rgba(239,68,68,.06)' : ''}">
      <td style="font-weight:600;font-size:12.5px;${esVencido ? 'color:var(--rojo)' : ''}">
        ${p.fecha_vencimiento ? new Date(p.fecha_vencimiento).toLocaleDateString('es-ES') : '—'}
        ${esVencido ? '<div style="font-size:10px;color:var(--rojo);font-weight:700">VENCIDO</div>' : ''}
      </td>
      <td>${tipoTag}</td>
      <td><div style="font-weight:600">${p.entidad_nombre}</div></td>
      <td style="font-family:monospace;font-size:12.5px;font-weight:600">${p.factura_numero || '—'}</td>
      <td onclick="event.stopPropagation()">
        ${esPago ? `<select onchange="asignarBancoPago(${p.factura_id},this.value)" style="padding:4px 8px;border:1px solid var(--gris-200);border-radius:6px;font-size:12px;outline:none;width:100%">
          <option value="">— Sin banco —</option>
          ${bancoOpts}
        </select>` : '<span style="font-size:11px;color:var(--gris-400)">—</span>'}
      </td>
      <td style="text-align:right;font-weight:700;${esCobro ? 'color:var(--verde)' : 'color:var(--rojo)'}">${esCobro ? '+' : '-'}${fmtE(p.importe)}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${est.color};background:${est.bg}">${est.ico} ${est.label}</span>
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px">
          ${accionPagar}${accionCobrar}
          <button onclick="${esPago ? 'verFacturaProv' : 'verFacturaVenta'}(${p.factura_id})" style="padding:4px 8px;border-radius:6px;border:1px solid var(--gris-200);background:white;cursor:pointer;font-size:11px;font-weight:600;color:var(--gris-600)" title="Ver factura">📑</button>
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="8"><div class="empty"><div class="ei">📅</div><h3>Sin movimientos pendientes</h3><p>Los pagos y cobros aparecerán aquí al crear facturas</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  FILTRADO
// ═══════════════════════════════════════════════
function filtrarCalendarioPagos() {
  const q    = (document.getElementById('cpSearch')?.value || '').toLowerCase();
  const est  = document.getElementById('cpEstado')?.value || '';
  const bco  = document.getElementById('cpBanco')?.value || '';
  const des  = document.getElementById('cpDesde')?.value || '';
  const has  = document.getElementById('cpHasta')?.value || '';
  const tipo = document.getElementById('cpTipo')?.value || '';

  calPagosFiltrados = calPagosData.filter(p =>
    (!q    || (p.entidad_nombre || '').toLowerCase().includes(q) || (p.factura_numero || '').toLowerCase().includes(q)) &&
    (!est  || p.estado === est) &&
    (!bco  || String(p.banco_id) === bco) &&
    (!des  || (p.fecha_vencimiento && p.fecha_vencimiento >= des)) &&
    (!has  || (p.fecha_vencimiento && p.fecha_vencimiento <= has)) &&
    (!tipo || p.tipo_movimiento === tipo)
  );

  // Ordenar: vencidos primero, luego por fecha
  calPagosFiltrados.sort((a, b) => {
    if (a.estado === 'vencido' && b.estado !== 'vencido') return -1;
    if (b.estado === 'vencido' && a.estado !== 'vencido') return 1;
    if (!a.fecha_vencimiento) return 1;
    if (!b.fecha_vencimiento) return -1;
    return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
  });

  renderCalendarioPagos(calPagosFiltrados);
}

// ═══════════════════════════════════════════════
//  ACCIONES
// ═══════════════════════════════════════════════
async function asignarBancoPago(facturaId, bancoId) {
  const banco = cuentasBancarias.find(b => b.id == bancoId);
  const { error } = await sb.from('facturas_proveedor').update({
    banco_id: bancoId ? parseInt(bancoId) : null,
    banco_nombre: banco ? banco.nombre : null
  }).eq('id', facturaId);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  const item = calPagosData.find(p => p.factura_id === facturaId && p.tipo_movimiento === 'pago');
  if (item) {
    item.banco_id = bancoId ? parseInt(bancoId) : null;
    item.banco_nombre = banco ? banco.nombre : '';
  }
  toast('Banco asignado ✓', 'success');
}

async function registrarPagoCalendario(facturaId) {
  const fp = calPagosData.find(p => p.factura_id === facturaId && p.tipo_movimiento === 'pago');
  if (!fp) return;
  const okPago = await confirmModal({titulo:'Registrar pago',mensaje:`¿Registrar pago de ${fmtE(fp.importe)} a ${fp.entidad_nombre}?`,btnOk:'Registrar pago'}); if (!okPago) return;

  await sb.from('pagos_proveedor').insert({
    empresa_id: EMPRESA.id,
    factura_id: facturaId,
    proveedor_id: fp.entidad_id,
    importe: fp.importe,
    fecha_pago: new Date().toISOString().split('T')[0]
  });

  await sb.from('facturas_proveedor').update({
    estado: 'pagada',
    fecha_pago: new Date().toISOString().split('T')[0]
  }).eq('id', facturaId);

  toast('💰 Pago registrado ✓', 'success');
  await loadCalendarioPagos();
  if (typeof loadFacturasProv === 'function') loadFacturasProv();
  loadDashboard();
}

async function registrarCobroCalendario(facturaId) {
  const fc = calPagosData.find(p => p.factura_id === facturaId && p.tipo_movimiento === 'cobro');
  if (!fc) return;
  const okCobro = await confirmModal({titulo:'Registrar cobro',mensaje:`¿Registrar cobro de ${fmtE(fc.importe)} de ${fc.entidad_nombre}?`,btnOk:'Registrar cobro'}); if (!okCobro) return;

  await sb.from('facturas').update({
    estado: 'cobrada'
  }).eq('id', facturaId);

  toast('💰 Cobro registrado ✓', 'success');
  await loadCalendarioPagos();
  if (typeof loadFacturas === 'function') loadFacturas();
  loadDashboard();
}

function verFacturaProv(id) {
  if (typeof editarFacturaProv === 'function') {
    goPage('facturas-proveedor');
    setTimeout(() => editarFacturaProv(id), 200);
  }
}

function verFacturaVenta(id) {
  goPage('facturas');
  // Si hay función para abrir detalle de factura, úsala
}

// ═══════════════════════════════════════════════
//  EXPORTAR
// ═══════════════════════════════════════════════
async function exportarCalendarioPagos() {
  if (!window.XLSX) { toast('Cargando librería Excel...', 'info'); return; }
  const lista = calPagosFiltrados.length ? calPagosFiltrados : calPagosData;
  const okExp = await confirmModal({titulo:'Exportar',mensaje:`¿Exportar ${lista.length} movimientos a Excel?`,btnOk:'Exportar'}); if (!okExp) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Tipo', 'Vencimiento', 'Entidad', 'Factura', 'Banco', 'Importe', 'Estado'],
    ...lista.map(p => [
      p.tipo_movimiento === 'pago' ? 'PAGO' : 'COBRO',
      p.fecha_vencimiento || '', p.entidad_nombre || '',
      p.factura_numero || '', p.banco_nombre || '',
      p.importe || 0, p.estado || ''
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Calendario Pagos y Cobros');
  XLSX.writeFile(wb, 'calendario_pagos_cobros_' + new Date().toISOString().split('T')[0] + '.xlsx');
  toast('Exportado ✓', 'success');
}
