/**
 * MÓDULO CALENDARIO DE PAGOS
 * Vista unificada de pagos pendientes a proveedores con vencimientos,
 * banco asignado y gestión de pagos
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
  // Cargar facturas de proveedor pendientes + pagadas recientes
  const { data: fps } = await sb.from('facturas_proveedor')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'anulada')
    .order('fecha_vencimiento', { ascending: true });

  // Cargar cuentas bancarias de la empresa (si existe la tabla)
  try {
    const { data: bancos } = await sb.from('cuentas_bancarias')
      .select('*').eq('empresa_id', EMPRESA.id).order('nombre');
    cuentasBancarias = bancos || [];
  } catch(e) {
    // Si la tabla no existe, usar array vacío
    cuentasBancarias = [];
  }

  const hoy = new Date().toISOString().split('T')[0];

  // Construir lista de pagos desde facturas proveedor
  calPagosData = (fps || []).map(fp => {
    const vencido = fp.estado === 'pendiente' && fp.fecha_vencimiento && fp.fecha_vencimiento < hoy;
    return {
      id: fp.id,
      tipo: 'factura_proveedor',
      fecha_vencimiento: fp.fecha_vencimiento,
      proveedor_id: fp.proveedor_id,
      proveedor_nombre: fp.proveedor_nombre || '—',
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
  };

  // KPIs
  const noAnulados = calPagosData;
  const pends = noAnulados.filter(p => p.estado === 'pendiente');
  const vencidos = noAnulados.filter(p => p.estado === 'vencido');
  const pagados = noAnulados.filter(p => p.estado === 'pagado');
  const hoy = new Date();
  const pagadosMes = pagados.filter(p => {
    if (!p.fecha_pago) return false;
    const fp = new Date(p.fecha_pago);
    return fp.getMonth() === hoy.getMonth() && fp.getFullYear() === hoy.getFullYear();
  });

  const kTotal   = document.getElementById('cpk-total');
  const kPend    = document.getElementById('cpk-pendientes');
  const kVenc    = document.getElementById('cpk-vencidos');
  const kImpPend = document.getElementById('cpk-imp-pend');
  const kImpPag  = document.getElementById('cpk-imp-pagado');
  if (kTotal)   kTotal.textContent   = noAnulados.length;
  if (kPend)    kPend.textContent    = pends.length;
  if (kVenc)    kVenc.textContent    = vencidos.length;
  if (kImpPend) kImpPend.textContent = fmtE(pends.concat(vencidos).reduce((s, p) => s + p.importe, 0));
  if (kImpPag)  kImpPag.textContent  = fmtE(pagadosMes.reduce((s, p) => s + p.importe, 0));

  const tbody = document.getElementById('cpTable');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(p => {
    const est = ESTADOS[p.estado] || ESTADOS.pendiente;
    const esVencido = p.estado === 'vencido';
    const bancoOpts = cuentasBancarias.map(b =>
      `<option value="${b.id}" ${b.id === p.banco_id ? 'selected' : ''}>${b.nombre}</option>`
    ).join('');

    return `<tr style="${esVencido ? 'background:rgba(239,68,68,.06)' : ''}">
      <td style="font-weight:600;font-size:12.5px;${esVencido ? 'color:var(--rojo)' : ''}">
        ${p.fecha_vencimiento ? new Date(p.fecha_vencimiento).toLocaleDateString('es-ES') : '—'}
        ${esVencido ? '<div style="font-size:10px;color:var(--rojo);font-weight:700">VENCIDO</div>' : ''}
      </td>
      <td><div style="font-weight:600">${p.proveedor_nombre}</div></td>
      <td style="font-family:monospace;font-size:12.5px;font-weight:600">${p.factura_numero || '—'}</td>
      <td onclick="event.stopPropagation()">
        <select onchange="asignarBancoPago(${p.factura_id},this.value)" style="padding:4px 8px;border:1px solid var(--gris-200);border-radius:6px;font-size:12px;outline:none;width:100%">
          <option value="">— Sin banco —</option>
          ${bancoOpts}
        </select>
      </td>
      <td style="text-align:right;font-weight:700">${fmtE(p.importe)}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${est.color};background:${est.bg}">${est.ico} ${est.label}</span>
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px">
          ${p.estado !== 'pagado' ? `<button onclick="registrarPagoCalendario(${p.factura_id})" style="padding:4px 8px;border-radius:6px;border:1px solid #10B981;background:#D1FAE5;cursor:pointer;font-size:11px;font-weight:700;color:#065F46" title="Marcar como pagado">💰 Pagar</button>` : ''}
          <button onclick="verFacturaProv(${p.factura_id})" style="padding:4px 8px;border-radius:6px;border:1px solid var(--gris-200);background:white;cursor:pointer;font-size:11px;font-weight:600;color:var(--gris-600)" title="Ver factura">📑</button>
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="7"><div class="empty"><div class="ei">📅</div><h3>Sin pagos pendientes</h3><p>Los pagos aparecerán aquí al crear facturas de proveedor</p></div></td></tr>';
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

  calPagosFiltrados = calPagosData.filter(p =>
    (!q   || (p.proveedor_nombre || '').toLowerCase().includes(q) || (p.factura_numero || '').toLowerCase().includes(q)) &&
    (!est || p.estado === est) &&
    (!bco || String(p.banco_id) === bco) &&
    (!des || (p.fecha_vencimiento && p.fecha_vencimiento >= des)) &&
    (!has || (p.fecha_vencimiento && p.fecha_vencimiento <= has))
  );

  // Ordenar por fecha vencimiento ascendente (próximos primero)
  calPagosFiltrados.sort((a, b) => {
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
  // Actualizar localmente
  const item = calPagosData.find(p => p.factura_id === facturaId);
  if (item) {
    item.banco_id = bancoId ? parseInt(bancoId) : null;
    item.banco_nombre = banco ? banco.nombre : '';
  }
  toast('Banco asignado ✓', 'success');
}

async function registrarPagoCalendario(facturaId) {
  const fp = calPagosData.find(p => p.factura_id === facturaId);
  if (!fp) return;
  if (!confirm(`¿Registrar pago de ${fmtE(fp.importe)} a ${fp.proveedor_nombre}?`)) return;

  // Registrar pago
  await sb.from('pagos_proveedor').insert({
    empresa_id: EMPRESA.id,
    factura_id: facturaId,
    proveedor_id: fp.proveedor_id,
    importe: fp.importe,
    fecha_pago: new Date().toISOString().split('T')[0],
    usuario_id: CU.id
  });

  // Marcar factura como pagada
  await sb.from('facturas_proveedor').update({
    estado: 'pagada',
    fecha_pago: new Date().toISOString().split('T')[0]
  }).eq('id', facturaId);

  toast('💰 Pago registrado ✓', 'success');
  await loadCalendarioPagos();
  if (typeof loadFacturasProv === 'function') loadFacturasProv();
  loadDashboard();
}

function verFacturaProv(id) {
  // Navegar a facturas proveedor y abrir detalle (si la función existe)
  if (typeof editarFacturaProv === 'function') {
    goPage('facturas-proveedor');
    setTimeout(() => editarFacturaProv(id), 200);
  }
}

// ═══════════════════════════════════════════════
//  EXPORTAR
// ═══════════════════════════════════════════════
function exportarCalendarioPagos() {
  if (!window.XLSX) { toast('Cargando librería Excel...', 'info'); return; }
  const lista = calPagosFiltrados.length ? calPagosFiltrados : calPagosData;
  if (!confirm('¿Exportar ' + lista.length + ' pagos a Excel?')) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Vencimiento', 'Proveedor', 'Factura', 'Banco', 'Importe', 'Estado'],
    ...lista.map(p => [
      p.fecha_vencimiento || '', p.proveedor_nombre || '',
      p.factura_numero || '', p.banco_nombre || '',
      p.importe || 0, p.estado || ''
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Calendario Pagos');
  XLSX.writeFile(wb, 'calendario_pagos_' + new Date().toISOString().split('T')[0] + '.xlsx');
  toast('Exportado ✓', 'success');
}
