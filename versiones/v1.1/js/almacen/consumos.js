// ============================================================================
// MÓDULO CONSUMOS - Registro de materiales consumidos en partes de trabajo
// ============================================================================

let consumosData = [];

async function loadConsumos() {
  if (!EMPRESA || !EMPRESA.id) return;
  try {
    const { data, error } = await sb
      .from('consumos_parte')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    consumosData = data || [];
    renderConsumos(consumosData);
    updateConsumosKPIs(consumosData);
  } catch (e) {
    console.error('Error cargando consumos:', e);
    toast('Error cargando consumos: ' + e.message, 'error');
  }
}

function renderConsumos(list) {
  const tbody = document.getElementById('consumos-table');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--gris-400)">Sin consumos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => {
    const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString('es-ES') : '—';
    const tipoColor = c.tipo === 'merma' ? 'var(--naranja)' : c.tipo === 'rotura' ? 'var(--rojo)' : 'var(--azul)';
    const tipoLabel = c.tipo === 'merma' ? '⚠️ Merma' : c.tipo === 'rotura' ? '💥 Rotura' : '🔧 Consumo';
    const stockBadge = c.sin_stock
      ? '<span class="badge bg-red" style="font-size:10px">Sin stock</span>'
      : '<span class="badge bg-green" style="font-size:10px">OK</span>';

    return `<tr>
      <td style="font-size:12px">${fecha}</td>
      <td><span style="font-weight:700;font-size:12px">${c.parte_numero || '—'}</span></td>
      <td>
        <div style="font-weight:600;font-size:12.5px">${c.articulo_nombre || 'N/A'}</div>
        <div style="font-size:10.5px;color:var(--gris-400)">${c.articulo_codigo || ''}</div>
      </td>
      <td><span style="color:${tipoColor};font-weight:600;font-size:12px">${tipoLabel}</span>
        ${c.motivo_merma ? `<div style="font-size:10px;color:var(--gris-400)">${c.motivo_merma}</div>` : ''}
      </td>
      <td class="text-right" style="font-weight:700">${c.cantidad} ${c.unidad || 'ud'}</td>
      <td class="text-right">${fmtE(c.precio_unitario || 0)}</td>
      <td class="text-right" style="font-weight:700">${fmtE(c.total || 0)}</td>
      <td style="font-size:12px">${c.usuario_nombre || '—'}</td>
      <td style="text-align:center">${stockBadge}</td>
    </tr>`;
  }).join('');
}

function updateConsumosKPIs(list) {
  const total = list.length;
  const sinStock = list.filter(c => c.sin_stock).length;
  const mermas = list.filter(c => c.tipo === 'merma' || c.tipo === 'rotura').length;
  const valor = list.reduce((s, c) => s + (c.total || 0), 0);

  setVal({
    'kpi-consumos-total': total,
    'kpi-consumos-sinstock': sinStock,
    'kpi-consumos-mermas': mermas,
    'kpi-consumos-valor': fmtE(valor)
  });
}

function filtrarConsumos() {
  const desde = document.getElementById('consumos-desde')?.value;
  const hasta = document.getElementById('consumos-hasta')?.value;
  const tipo = document.getElementById('consumos-tipo')?.value;
  const texto = (document.getElementById('consumos-buscar')?.value || '').toLowerCase();

  let filtered = consumosData.filter(c => {
    if (desde && c.created_at < desde) return false;
    if (hasta && c.created_at > hasta + 'T23:59:59') return false;
    if (tipo && c.tipo !== tipo) return false;
    if (texto) {
      const match = (c.articulo_nombre || '').toLowerCase().includes(texto) ||
                    (c.articulo_codigo || '').toLowerCase().includes(texto) ||
                    (c.parte_numero || '').toLowerCase().includes(texto) ||
                    (c.usuario_nombre || '').toLowerCase().includes(texto);
      if (!match) return false;
    }
    return true;
  });

  renderConsumos(filtered);
  updateConsumosKPIs(filtered);
}

function exportConsumos() {
  if (!consumosData.length) { toast('No hay datos para exportar', 'warning'); return; }
  const rows = consumosData.map(c => ({
    'Fecha': c.created_at ? new Date(c.created_at).toLocaleDateString('es-ES') : '',
    'Parte': c.parte_numero || '',
    'Artículo': c.articulo_nombre || '',
    'Código': c.articulo_codigo || '',
    'Tipo': c.tipo || 'consumo',
    'Cantidad': c.cantidad,
    'Unidad': c.unidad || 'ud',
    'Precio': c.precio_unitario || 0,
    'Total': c.total || 0,
    'Operario': c.usuario_nombre || '',
    'Sin stock': c.sin_stock ? 'SÍ' : 'NO',
    'Motivo': c.motivo_merma || ''
  }));

  // CSV export
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(';'))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `consumos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exportación descargada', 'success');
}
