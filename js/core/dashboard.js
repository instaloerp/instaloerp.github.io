// ═══════════════════════════════════════════════
//  DASHBOARD — Panel de control
// ═══════════════════════════════════════════════

async function loadDashboard() {
  const eid = EMPRESA.id;
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
  const inicioAno = new Date(hoy.getFullYear(), 0, 1).toISOString().split('T')[0];

  // Cargar datos en paralelo
  const [facts, presups] = await Promise.all([
    sb.from('facturas').select('*').eq('empresa_id', eid).neq('estado','eliminado'),
    sb.from('presupuestos').select('*').eq('empresa_id', eid).neq('estado','eliminado').order('created_at',{ascending:false}).limit(5),
  ]);

  const todasFacturas = facts.data || [];
  const todosPresups = presups.data || [];

  // KPIs facturación
  const factMes = todasFacturas.filter(f => f.fecha >= inicioMes).reduce((s,f) => s + (f.total||0), 0);
  const factAno = todasFacturas.filter(f => f.fecha >= inicioAno).reduce((s,f) => s + (f.total||0), 0);
  const pendCobro = todasFacturas.filter(f => f.estado === 'pendiente').reduce((s,f) => s + (f.total||0), 0);
  const vencidas = todasFacturas.filter(f => f.estado === 'vencida').length;
  const presupPend = todosPresups.filter(p => p.estado === 'pendiente' || p.estado === 'enviado').length;

  // KPIs facturas proveedor pendientes pago
  const { data: factsProv } = await sb.from('facturas_proveedor').select('total,estado').eq('empresa_id', eid).eq('estado','pendiente');
  const pendPago = (factsProv||[]).reduce((s,f) => s + (f.total||0), 0);

  // Actualizar KPIs
  document.getElementById('d-fact-mes').textContent = fmtE(factMes);
  document.getElementById('d-fact-ano').textContent = fmtE(factAno);
  document.getElementById('d-pend-cobro').textContent = fmtE(pendCobro);
  document.getElementById('d-pend-pago').textContent = fmtE(pendPago);
  document.getElementById('d-presup-mes').textContent = presupPend;
  document.getElementById('d-vencidas').textContent = vencidas;
  document.getElementById('d-cli').textContent = clientes.length;
  document.getElementById('d-trab').textContent = trabajos.filter(t=>t.estado==='en_curso'||t.estado==='planificado'||t.estado==='pendiente').length;

  // Trabajos activos
  const trabActivos = trabajos.filter(t=>t.estado!=='finalizado'&&t.estado!=='cancelado').slice(0,5);
  document.getElementById('d-trabajos-list').innerHTML = trabActivos.length ?
    trabActivos.map(t=>`
      <div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <span style="font-size:16px">${catIco(t.categoria)}</span>
        <div style="flex:1"><div style="font-weight:700;font-size:12.5px">${t.titulo}</div><div style="font-size:11px;color:var(--gris-400)">${t.cliente_nombre||'—'} · ${t.fecha||'—'}</div></div>
        ${estadoBadge(t.estado)}
      </div>`).join('') :
    '<div class="empty"><div class="ei">🏗️</div><p>Sin obras activas</p></div>';

  // Facturas pendientes cobro
  const factPend = todasFacturas.filter(f=>f.estado==='pendiente'||f.estado==='vencida').slice(0,5);
  document.getElementById('d-fact-list').innerHTML = factPend.length ?
    factPend.map(f=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <div>
          <div style="font-weight:700;font-size:12.5px">${f.numero}</div>
          <div style="font-size:11px;color:var(--gris-400)">${f.cliente_nombre||'—'} · Vence: ${f.fecha_vencimiento||'—'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;font-size:13px;color:${f.estado==='vencida'?'var(--rojo)':'var(--gris-800)'}">${fmtE(f.total)}</div>
          ${f.estado==='vencida'?'<span class="badge bg-red">Vencida</span>':'<span class="badge bg-yellow">Pendiente</span>'}
        </div>
      </div>`).join('') :
    '<div class="empty"><div class="ei">✅</div><p>Todo cobrado</p></div>';

  // Presupuestos pendientes
  document.getElementById('d-presup-list').innerHTML = todosPresups.filter(p=>p.estado==='pendiente'||p.estado==='borrador').slice(0,5).length ?
    todosPresups.filter(p=>p.estado==='pendiente'||p.estado==='borrador').slice(0,5).map(p=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <div>
          <div style="font-weight:700;font-size:12.5px">${p.numero||'—'}</div>
          <div style="font-size:11px;color:var(--gris-400)">${p.cliente_nombre||'—'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;font-size:13px">${fmtE(p.total)}</div>
          ${estadoBadgeP(p.estado)}
        </div>
      </div>`).join('') :
    '<div class="empty"><div class="ei">📋</div><p>Sin presupuestos pendientes</p></div>';

  // ── MIS TAREAS (todas las tareas asignadas al usuario actual) ──
  await loadDashboardTareas();

  // ── PARTES AUTO-GENERADOS POR GREMIO ──
  await loadDashboardPartesGremio();
}

async function loadDashboardTareas() {
  const userId = CU?.id;
  if (!userId) return;

  const { data: tareas } = await sb.from('tareas_obra')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .eq('responsable_id', userId)
    .neq('estado', 'completada')
    .neq('estado', 'rechazada')
    .order('created_at', { ascending: false })
    .limit(15);

  const misTareas = tareas || [];
  const el = document.getElementById('d-tareas-list');
  const countEl = document.getElementById('d-tareas-count');
  if (!el) return;

  if (countEl) countEl.textContent = misTareas.length ? misTareas.length + ' pendiente' + (misTareas.length > 1 ? 's' : '') : '';

  // Badge en sidebar con nº de tareas pendientes
  const sbBadge = document.getElementById('sbBadgeTareas');
  if (sbBadge) {
    if (misTareas.length > 0) {
      sbBadge.textContent = misTareas.length;
      sbBadge.style.display = 'inline-flex';
    } else {
      sbBadge.style.display = 'none';
    }
  }

  if (!misTareas.length) {
    el.innerHTML = '<div class="empty"><div class="ei">✅</div><p>Sin tareas pendientes</p></div>';
    return;
  }

  // Buscar obra asociada a cada tarea para poder navegar
  const trabajoIds = [...new Set(misTareas.map(t => t.trabajo_id).filter(Boolean))];
  const obrasMap = {};
  trabajoIds.forEach(tid => {
    const ob = trabajos.find(t => t.id === tid);
    if (ob) obrasMap[tid] = ob;
  });

  const prioColor = { Urgente: 'var(--rojo)', Alta: 'var(--acento)', Normal: 'var(--gris-500)', Baja: 'var(--azul)' };
  const prioIco = { Urgente: '🔴', Alta: '🟠', Normal: '⚪', Baja: '🔵' };

  el.innerHTML = misTareas.map(t => {
    const obra = obrasMap[t.trabajo_id];
    const obraLabel = obra ? obra.numero + ' · ' + (obra.titulo || '').substring(0, 30) : '';
    const onclick = obra
      ? `goPage('trabajos');abrirFichaObra(${obra.id});setTimeout(()=>obraTab('seguimiento'),300)`
      : '';
    const fechaLimite = t.fecha_limite
      ? `<span style="font-size:10px;color:${new Date(t.fecha_limite) < new Date() ? 'var(--rojo)' : 'var(--gris-400)'}">${t.fecha_limite}</span>`
      : '';

    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--gris-100);cursor:${onclick?'pointer':'default'}" ${onclick ? `onclick="${onclick}"` : ''}>
      <span style="font-size:12px;margin-top:2px">${prioIco[t.prioridad] || '⚪'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.texto}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:2px">
          ${obraLabel ? `<span style="font-size:10px;color:var(--azul)">🏗️ ${obraLabel}</span>` : ''}
          ${fechaLimite}
        </div>
      </div>
      <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${t.estado==='en_progreso'?'#DBEAFE':'var(--gris-50)'};color:${t.estado==='en_progreso'?'var(--azul)':'var(--gris-500)'};font-weight:700;white-space:nowrap">${(t.estado||'pendiente').replace('_',' ')}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
// PARTES AUTO-GENERADOS POR GREMIO — KPI
// ═══════════════════════════════════════════════

async function loadDashboardPartesGremio() {
  const el = document.getElementById('d-partes-gremio');
  const countEl = document.getElementById('d-partes-gremio-count');
  if (!el) return; // El widget no existe en el HTML aún → skip silencioso

  const { data } = await sb.from('partes_trabajo')
    .select('id,numero,gremio,gremio_label,estado,trabajo_titulo,trabajo_id,parte_origen_num')
    .eq('empresa_id', EMPRESA.id)
    .eq('auto_generado', true)
    .in('estado', ['borrador', 'programado'])
    .order('created_at', { ascending: false });

  const partesGremio = data || [];
  if (countEl) countEl.textContent = partesGremio.length || '0';

  if (!partesGremio.length) {
    el.innerHTML = '<div class="empty" style="padding:16px 0"><div class="ei">✅</div><p>Todos los partes de gremio gestionados</p></div>';
    return;
  }

  // Agrupar por gremio
  const _GREMIO_ICO = {fontaneria:'🔧',electricidad:'⚡',albanileria:'🧱',pintura:'🎨',carpinteria:'🪚',climatizacion:'❄️',calefaccion:'🔥',cerrajeria:'🔑',cristaleria:'🪟',limpieza:'🧹',otro:'📋'};
  const grupos = {};
  partesGremio.forEach(p => {
    const gid = p.gremio || 'otro';
    if (!grupos[gid]) grupos[gid] = { label: p.gremio_label || gid, ico: _GREMIO_ICO[gid] || '📋', partes: [] };
    grupos[gid].partes.push(p);
  });

  let html = '';
  Object.values(grupos).forEach(g => {
    html += `<div style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:16px">${g.ico}</span>
        <span style="font-weight:700;font-size:12px">${g.label}</span>
        <span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px">${g.partes.length}</span>
      </div>
      ${g.partes.map(p => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0 4px 24px;border-bottom:1px solid var(--gris-100);cursor:pointer;font-size:11.5px" onclick="goPage('partes');setTimeout(()=>verDetalleParte(${p.id}),400)">
        <span style="font-family:monospace;font-weight:600;color:var(--azul)">${p.numero}</span>
        <span style="color:var(--gris-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${p.trabajo_titulo || '—'}</span>
        <span style="font-size:10px;color:var(--gris-400)">de ${p.parte_origen_num || '—'}</span>
      </div>`).join('')}
    </div>`;
  });

  el.innerHTML = html;
}
