// ═══════════════════════════════════════════════
//  DASHBOARD — Panel de control
// ═══════════════════════════════════════════════

async function loadDashboard() {
  const eid = EMPRESA.id;
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
  const inicioAno = new Date(hoy.getFullYear(), 0, 1).toISOString().split('T')[0];

  // Cargar datos en paralelo
  const [facts, presups, presupAcep] = await Promise.all([
    sb.from('facturas').select('*').eq('empresa_id', eid).neq('estado','eliminado'),
    sb.from('presupuestos').select('*').eq('empresa_id', eid).neq('estado','eliminado').order('created_at',{ascending:false}).limit(5),
    sb.from('presupuestos').select('id', {count:'exact',head:true}).eq('empresa_id', eid).eq('estado','aceptado'),
  ]);

  const todasFacturas = facts.data || [];
  const todosPresups = presups.data || [];

  // KPIs facturación — excluir anuladas, rectificadas Y rectificativas (abonos) de los totales
  const facturasActivas = todasFacturas.filter(f => f.estado !== 'anulada' && f.estado !== 'rectificada' && !f.rectificativa_de);
  const factMes = facturasActivas.filter(f => f.fecha >= inicioMes).reduce((s,f) => s + (f.total||0), 0);
  const factAno = facturasActivas.filter(f => f.fecha >= inicioAno).reduce((s,f) => s + (f.total||0), 0);
  const pendCobro = todasFacturas.filter(f => (f.estado === 'pendiente' || f.estado === 'vencida') && !f.rectificativa_de).reduce((s,f) => s + (f.total||0), 0);
  const vencidas = todasFacturas.filter(f => f.estado === 'vencida' && !f.rectificativa_de).length;
  const presupPend = todosPresups.filter(p => p.estado === 'pendiente' || p.estado === 'enviado').length;

  // KPIs facturas proveedor pendientes pago
  const { data: factsProv } = await sb.from('facturas_proveedor').select('total,estado').eq('empresa_id', eid).eq('estado','pendiente');
  const pendPago = (factsProv||[]).reduce((s,f) => s + (f.total||0), 0);

  // KPI presupuestos aceptados (count)
  const numAceptados = presupAcep.count || 0;

  // Actualizar KPIs (usar ?. por si falta algún elemento en el HTML)
  const _d = id => document.getElementById(id);
  if (_d('d-fact-mes'))    _d('d-fact-mes').textContent = fmtE(factMes);
  if (_d('d-fact-ano'))    _d('d-fact-ano').textContent = fmtE(factAno);
  if (_d('d-pend-cobro'))  _d('d-pend-cobro').textContent = fmtE(pendCobro);
  if (_d('d-pend-pago'))   _d('d-pend-pago').textContent = fmtE(pendPago);
  if (_d('d-presup-mes'))  _d('d-presup-mes').textContent = presupPend;
  if (_d('d-presup-acep')) _d('d-presup-acep').textContent = numAceptados;
  if (_d('d-vencidas'))    _d('d-vencidas').textContent = vencidas;
  if (_d('d-cli'))         _d('d-cli').textContent = clientes.length;
  if (_d('d-trab'))        _d('d-trab').textContent = trabajos.filter(t=>t.estado==='en_curso'||t.estado==='planificado'||t.estado==='pendiente').length;

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

  // Facturas pendientes cobro — excluir rectificativas (abonos)
  const factPend = todasFacturas.filter(f=>(f.estado==='pendiente'||f.estado==='vencida') && !f.rectificativa_de).slice(0,5);
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

  // ── INCIDENCIAS STOCK PENDIENTES ──
  try {
    const { data: incPend, error: incErr } = await sb.from('incidencias_stock')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', EMPRESA.id)
      .eq('estado', 'pendiente');
    if (!incErr && incPend !== null) {
      const cnt = typeof incPend === 'number' ? incPend : 0;
      const el = document.getElementById('dash-incidencias');
      if (el && cnt > 0) {
        el.style.display = '';
        el.innerHTML = `<div class="card" style="padding:14px;border-left:4px solid var(--rojo);cursor:pointer" onclick="goPage('incidencias-stock')">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:24px">⚠️</div>
            <div style="flex:1"><div style="font-weight:800;font-size:14px">${cnt} incidencia${cnt>1?'s':''} de stock pendiente${cnt>1?'s':''}</div>
            <div style="font-size:11px;color:var(--gris-400)">Materiales consumidos sin stock disponible</div></div>
            <span class="badge bg-red">${cnt}</span>
          </div>
        </div>`;
      }
    }
  } catch(e) { /* silent */ }

  // ── PARTES COMPLETADOS PENDIENTES DE REVISAR ──
  await loadDashboardPartesCompletados();

  // ── DOCUMENTOS OCR PENDIENTES ──
  await loadDashboardDocsOcr();

  // ── BADGE CORREO NO LEÍDO ──
  if (typeof actualizarBadgeCorreo === 'function') actualizarBadgeCorreo();

  // ── Refrescar badge correo cada 2 min globalmente ──
  if (!window._badgeCorreoGlobalInterval && typeof actualizarBadgeCorreo === 'function') {
    window._badgeCorreoGlobalInterval = setInterval(actualizarBadgeCorreo, 2 * 60 * 1000);
  }
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
  const favBadgeTareas = document.getElementById('fav-tareas-badge');
  if (sbBadge) {
    if (misTareas.length > 0) {
      sbBadge.textContent = misTareas.length;
      sbBadge.style.display = 'inline-flex';
      if (favBadgeTareas) { favBadgeTareas.textContent = misTareas.length; favBadgeTareas.style.display = 'inline-flex'; }
    } else {
      sbBadge.style.display = 'none';
      if (favBadgeTareas) favBadgeTareas.style.display = 'none';
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

// ═══════════════════════════════════════════════
// PARTES COMPLETADOS — Pendientes de revisar
// ═══════════════════════════════════════════════
async function loadDashboardPartesCompletados() {
  const el = document.getElementById('dash-partes-completados');
  if (!el) return;

  const { data, error } = await sb.from('partes_trabajo')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .in('estado', ['completado', 'pendiente_firma_cliente'])
    .order('updated_at', { ascending: false });
  if (error) { console.warn('[dashboard partes completados]', error.message); el.style.display='none'; return; }

  const partes = data || [];
  if (!partes.length) { el.style.display = 'none'; return; }

  el.style.display = '';
  el.innerHTML = `<div class="card" style="padding:14px;border-left:4px solid var(--azul)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:24px">📋</div>
        <div>
          <div style="font-weight:800;font-size:14px">${partes.length} parte${partes.length>1?'s':''} completado${partes.length>1?'s':''} pendiente${partes.length>1?'s':''} de revisar</div>
          <div style="font-size:11px;color:var(--gris-400)">Enviados desde la app móvil · Ordenados por fecha de recepción</div>
        </div>
      </div>
      <span class="badge bg-blue">${partes.length}</span>
    </div>
    <div style="max-height:250px;overflow-y:auto">
      ${partes.slice(0, 10).map(p => {
        const fecha = p.updated_at ? new Date(p.updated_at).toLocaleString('es-ES', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
        const estadoBadge = p.estado === 'pendiente_firma_cliente'
          ? '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#FEF3C7;color:#92400E;font-weight:700">Pend. firma</span>'
          : '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#DBEAFE;color:#1E40AF;font-weight:700">Completado</span>';
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="goPage('partes');setTimeout(()=>verDetalleParte(${p.id}),400)">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:12px">${p.numero || '—'} <span style="color:var(--gris-400);font-weight:400;font-size:11px">· ${p.operario_nombre || ''}</span></div>
            <div style="font-size:11px;color:var(--gris-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.trabajo_titulo || p.cliente_nombre || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:10px;color:var(--gris-400)">${fecha}</div>
            ${estadoBadge}
          </div>
        </div>`;
      }).join('')}
      ${partes.length > 10 ? `<div style="text-align:center;padding:8px"><button class="btn btn-secondary btn-sm" onclick="goPage('partes')">Ver los ${partes.length} partes</button></div>` : ''}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════
// DOCUMENTOS OCR — Pendientes de validar
// ═══════════════════════════════════════════════
async function loadDashboardDocsOcr() {
  const el = document.getElementById('dash-docs-ocr');
  if (!el) return;

  // Solo documentos que requieren acción: pendientes (sin procesar) y borradores (de app)
  const { data } = await sb.from('documentos_ocr')
    .select('id,archivo_nombre,estado,tipo_documento,datos_extraidos,created_at')
    .eq('empresa_id', EMPRESA.id)
    .in('estado', ['borrador', 'pendiente'])
    .order('created_at', { ascending: false })
    .limit(5);

  const docs = data || [];
  if (!docs.length) { el.style.display = 'none'; return; }

  el.style.display = '';
  el.innerHTML = `
    <div class="card-h"><h3>📷 Documentos OCR pendientes</h3><div class="card-ha"><button class="btn btn-secondary btn-sm" onclick="goPage('ocr')">Gestionar</button></div></div>
    <div class="card-b" style="max-height:200px;overflow-y:auto">
      ${docs.map(d => {
        const fecha = d.created_at ? new Date(d.created_at).toLocaleString('es-ES', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
        const nombre = d.datos_extraidos?.numero_documento || d.archivo_nombre || 'Documento';
        return `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--gris-100);font-size:12px;cursor:pointer" onclick="goPage('ocr')">
          <span style="font-size:14px">📄</span>
          <span style="flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nombre}</span>
          <span style="color:var(--gris-400);flex-shrink:0;font-size:10px">${fecha}</span>
          <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#FEE2E2;color:#991B1B;font-weight:700">${d.estado}</span>
        </div>`;
      }).join('')}
    </div>`;
}
