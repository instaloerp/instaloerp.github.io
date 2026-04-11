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

    // Enriquecer: si parte_numero está vacío, intentar obtenerlo del parte_id
    const sinNumero = consumosData.filter(c => !c.parte_numero && c.parte_id);
    if (sinNumero.length) {
      const parteIds = [...new Set(sinNumero.map(c => c.parte_id))];
      const { data: partes } = await sb.from('partes').select('id,numero').in('id', parteIds);
      if (partes) {
        const map = {};
        partes.forEach(p => { map[p.id] = p.numero; });
        consumosData.forEach(c => { if (!c.parte_numero && c.parte_id) c.parte_numero = map[c.parte_id] || null; });
      }
    }

    renderConsumos(consumosData);
    updateConsumosKPIs(consumosData);
  } catch (e) {
    console.error('Error cargando consumos:', e);
    toast('Error cargando consumos: ' + e.message, 'error');
  }
}

const _CONSUMO_TIPO = {
  consumo: { label:'Consumo', ico:'🔧', color:'#1e40af', bg:'#dbeafe' },
  merma:   { label:'Merma',   ico:'⚠️', color:'#92400e', bg:'#fef3c7' },
  rotura:  { label:'Rotura',  ico:'💥', color:'#991b1b', bg:'#fee2e2' }
};

function renderConsumos(list) {
  const tbody = document.getElementById('consumos-table');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--gris-400)">Sin consumos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => {
    const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString('es-ES') : '—';
    const t = _CONSUMO_TIPO[c.tipo] || _CONSUMO_TIPO.consumo;
    const stockCfg = c.sin_stock
      ? { label:'Sin stock', color:'#991b1b', bg:'#fee2e2' }
      : { label:'OK', color:'#065f46', bg:'#d1fae5' };

    return `<tr>
      <td style="font-size:12px">${fecha}</td>
      <td><span style="font-weight:700;font-size:12px">${c.parte_numero || '—'}</span></td>
      <td>
        <div style="font-weight:600;font-size:12.5px">${c.articulo_nombre || 'N/A'}</div>
        <div style="font-size:10.5px;color:var(--gris-400)">${c.articulo_codigo || ''}</div>
      </td>
      <td>
        <span style="padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;color:${t.color};background:${t.bg};white-space:nowrap">${t.ico} ${t.label}</span>
        ${c.motivo_merma ? `<div style="font-size:9.5px;color:var(--gris-400);margin-top:2px">${c.motivo_merma}</div>` : ''}
      </td>
      <td class="text-right" style="font-weight:700">${c.cantidad} ${(c.unidad || 'ud').toUpperCase()}</td>
      <td class="text-right">${fmtE(c.precio_unitario || 0)}</td>
      <td class="text-right" style="font-weight:700">${fmtE(c.total || 0)}</td>
      <td style="font-size:12px">${c.usuario_nombre || '—'}</td>
      <td style="text-align:center">
        <span style="padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;color:${stockCfg.color};background:${stockCfg.bg};white-space:nowrap">${stockCfg.label}</span>
      </td>
    </tr>`;
  }).join('');
}

function updateConsumosKPIs(list) {
  const total = list.length;
  const sinStock = list.filter(c => c.sin_stock).length;
  const mermas = list.filter(c => c.tipo === 'merma' || c.tipo === 'rotura').length;
  const valor = list.reduce((s, c) => s + (c.total || 0), 0);

  const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  _s('kpi-consumos-total', total);
  _s('kpi-consumos-sinstock', sinStock);
  _s('kpi-consumos-mermas', mermas);
  _s('kpi-consumos-valor', fmtE(valor));
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
