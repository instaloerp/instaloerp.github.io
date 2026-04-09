// ============================================================================
// MÓDULO INCIDENCIAS STOCK - Alertas de consumo sin stock disponible
// ============================================================================

let incidenciasData = [];

async function loadIncidencias() {
  if (!EMPRESA || !EMPRESA.id) return;
  try {
    const { data, error } = await sb
      .from('incidencias_stock')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    incidenciasData = data || [];
    renderIncidencias(incidenciasData);
    updateIncidenciasKPIs(incidenciasData);
  } catch (e) {
    console.error('Error cargando incidencias:', e);
    toast('Error cargando incidencias: ' + e.message, 'error');
  }
}

function renderIncidencias(list) {
  const grid = document.getElementById('incidencias-grid');
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="ei">✅</div><h3>Sin incidencias</h3><p>No hay alertas de stock pendientes</p></div>';
    return;
  }

  grid.innerHTML = list.map(inc => {
    const fecha = inc.created_at ? new Date(inc.created_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const esPendiente = inc.estado === 'pendiente';
    const borderColor = esPendiente ? 'var(--rojo)' : 'var(--verde)';
    const estadoBadge = esPendiente
      ? '<span class="badge bg-red">⏳ Pendiente</span>'
      : '<span class="badge bg-green">✅ Resuelta</span>';

    const resolucionHTML = inc.resolucion ? `
      <div style="margin-top:10px;padding:10px;background:var(--gris-50);border-radius:8px;border-left:3px solid var(--verde)">
        <div style="font-size:10px;color:var(--gris-400);margin-bottom:4px">Resolución — ${inc.resuelta_por || ''} ${inc.resuelta_at ? '(' + new Date(inc.resuelta_at).toLocaleDateString('es-ES') + ')' : ''}</div>
        <div style="font-size:12px">${inc.resolucion}</div>
      </div>` : '';

    return `<div class="card" style="padding:16px;border-left:4px solid ${borderColor}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div style="font-weight:800;font-size:14px">⚠️ ${inc.articulo_nombre || 'Artículo desconocido'}</div>
          <div style="font-size:11px;color:var(--gris-400);margin-top:2px">${fecha}</div>
        </div>
        ${estadoBadge}
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:8px">
        <div><span style="color:var(--gris-400)">Cantidad:</span> <strong>${inc.cantidad}</strong></div>
        <div><span style="color:var(--gris-400)">Almacén:</span> <strong>${inc.almacen_nombre || '—'}</strong></div>
        <div><span style="color:var(--gris-400)">Parte:</span> <strong>${inc.parte_numero || '—'}</strong></div>
        <div><span style="color:var(--gris-400)">Operario:</span> <strong>${inc.usuario_nombre || '—'}</strong></div>
      </div>
      ${resolucionHTML}
      ${esPendiente ? `<div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="abrirResolucion(${inc.id})">✅ Resolver</button></div>` : ''}
    </div>`;
  }).join('');
}

function updateIncidenciasKPIs(list) {
  const pendientes = list.filter(i => i.estado === 'pendiente').length;
  const resueltas = list.filter(i => i.estado === 'resuelta').length;
  setVal({
    'kpi-inc-pendientes': pendientes,
    'kpi-inc-resueltas': resueltas,
    'kpi-inc-total': list.length
  });
}

function filtrarIncidencias() {
  const estado = document.getElementById('inc-estado')?.value;
  const texto = (document.getElementById('inc-buscar')?.value || '').toLowerCase();

  let filtered = incidenciasData.filter(inc => {
    if (estado && inc.estado !== estado) return false;
    if (texto) {
      const match = (inc.articulo_nombre || '').toLowerCase().includes(texto) ||
                    (inc.parte_numero || '').toLowerCase().includes(texto) ||
                    (inc.almacen_nombre || '').toLowerCase().includes(texto) ||
                    (inc.usuario_nombre || '').toLowerCase().includes(texto);
      if (!match) return false;
    }
    return true;
  });

  renderIncidencias(filtered);
  updateIncidenciasKPIs(filtered);
}

function abrirResolucion(id) {
  const inc = incidenciasData.find(i => i.id === id);
  if (!inc) return;

  document.getElementById('resolver-inc-id').value = id;
  document.getElementById('resolver-inc-texto').value = '';
  document.getElementById('resolver-inc-info').innerHTML = `
    <div style="margin-bottom:6px"><strong>⚠️ ${inc.articulo_nombre}</strong></div>
    <div>Cantidad consumida: <strong>${inc.cantidad}</strong></div>
    <div>Almacén: <strong>${inc.almacen_nombre || '—'}</strong></div>
    <div>Parte: <strong>${inc.parte_numero || '—'}</strong></div>
    <div>Operario: <strong>${inc.usuario_nombre || '—'}</strong></div>
    <div>Fecha: <strong>${inc.created_at ? new Date(inc.created_at).toLocaleDateString('es-ES') : '—'}</strong></div>
  `;
  openModal('modal-resolver-incidencia');
}

async function guardarResolucion() {
  const id = parseInt(document.getElementById('resolver-inc-id').value);
  const resolucion = document.getElementById('resolver-inc-texto').value.trim();

  if (!resolucion) { toast('Escribe la resolución', 'warning'); return; }

  try {
    const { error } = await sb.from('incidencias_stock').update({
      estado: 'resuelta',
      resolucion: resolucion,
      resuelta_por: CP?.nombre || CU?.email || 'Admin',
      resuelta_at: new Date().toISOString()
    }).eq('id', id);

    if (error) throw error;

    closeModal('modal-resolver-incidencia');
    toast('Incidencia resuelta ✓', 'success');
    await loadIncidencias();
  } catch (e) {
    console.error('Error resolviendo incidencia:', e);
    toast('Error: ' + e.message, 'error');
  }
}

function exportIncidencias() {
  if (!incidenciasData.length) { toast('No hay datos para exportar', 'warning'); return; }
  const rows = incidenciasData.map(i => ({
    'Fecha': i.created_at ? new Date(i.created_at).toLocaleDateString('es-ES') : '',
    'Artículo': i.articulo_nombre || '',
    'Cantidad': i.cantidad,
    'Almacén': i.almacen_nombre || '',
    'Parte': i.parte_numero || '',
    'Operario': i.usuario_nombre || '',
    'Estado': i.estado || 'pendiente',
    'Resolución': i.resolucion || '',
    'Resuelta por': i.resuelta_por || '',
    'Fecha resolución': i.resuelta_at ? new Date(i.resuelta_at).toLocaleDateString('es-ES') : ''
  }));

  const headers = Object.keys(rows[0]);
  const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(';'))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `incidencias_stock_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exportación descargada', 'success');
}
