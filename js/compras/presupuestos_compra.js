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
          <button class="btn btn-ghost btn-sm" onclick="editarPresupuestoCompra(${p.id})" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="eliminarPresupuestoCompra(${p.id})" title="Eliminar">🗑️</button>
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
