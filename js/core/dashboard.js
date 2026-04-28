// ═══════════════════════════════════════════════
//  DASHBOARD — Panel de control (motor de widgets)
// ═══════════════════════════════════════════════

async function loadDashboard() {
  // Subtítulo con nombre empresa y fecha
  const sub = document.getElementById('dash-sub');
  if (sub) {
    const mes = new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    sub.textContent = (EMPRESA?.nombre || '') + ' · ' + mes;
  }

  // Renderizar widgets dinámicos según rol y config del usuario
  await renderWidgetDashboard('dash-widgets');

  // ── BADGE CORREO NO LEÍDO (global) ──
  if (typeof actualizarBadgeCorreo === 'function') actualizarBadgeCorreo();
  if (!window._badgeCorreoGlobalInterval && typeof actualizarBadgeCorreo === 'function') {
    window._badgeCorreoGlobalInterval = setInterval(actualizarBadgeCorreo, 5 * 60 * 1000);
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


// Helper: generar quick-link solo si la página es accesible
function _dashQuickLink(pageId, ico, label) {
  if (typeof canAccessPage === 'function' && !canAccessPage(pageId)) return '';
  return `<div class="card" style="padding:14px;text-align:center;cursor:pointer;transition:transform .1s" onclick="goPage('${pageId}')" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
    <div style="font-size:24px;margin-bottom:6px">${ico}</div>
    <div style="font-size:12px;font-weight:700">${label}</div>
  </div>`;
}

// ═══════════════════════════════════════════════
//  DASHBOARD GESTORÍA — Vista contable (LEGACY — ahora gestionado por widgets.js)
// ═══════════════════════════════════════════════
async function loadDashboardGestoria() {
  // Ya no se usa — el sistema de widgets renderiza según DASH_DEFAULTS.gestoria
  return;
  const eid = EMPRESA.id;
  const page = document.getElementById('dash-gestoria') || document.getElementById('page-dashboard');
  if (!page) return;

  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
  const inicioTri = new Date(hoy.getFullYear(), Math.floor(hoy.getMonth()/3)*3, 1).toISOString().split('T')[0];
  const inicioAno = new Date(hoy.getFullYear(), 0, 1).toISOString().split('T')[0];
  const mesLabel = hoy.toLocaleString('es-ES', {month:'long', year:'numeric'});
  const triLabel = `T${Math.floor(hoy.getMonth()/3)+1} ${hoy.getFullYear()}`;

  // Cargar datos en paralelo
  const [rFacts, rFactsProv, rTeso] = await Promise.all([
    sb.from('facturas').select('numero,fecha,cliente_nombre,base_imponible,total,estado,rectificativa_de').eq('empresa_id', eid).neq('estado','eliminado'),
    sb.from('facturas_proveedor').select('numero,fecha,proveedor_nombre,base_imponible,total,estado').eq('empresa_id', eid).neq('estado','eliminado'),
    sb.from('cuentas_bancarias').select('nombre,saldo_actual,banco').eq('empresa_id', eid).eq('activa', true),
  ]);

  const factVenta = (rFacts.data || []).filter(f => f.estado !== 'anulada' && f.estado !== 'rectificada' && f.estado !== 'borrador');
  const factCompra = (rFactsProv.data || []).filter(f => f.estado !== 'anulada');
  const cuentas = rTeso.data || [];

  // KPIs
  const ventaMes = factVenta.filter(f => f.fecha >= inicioMes).reduce((s,f) => s + (f.base_imponible||0), 0);
  const ventaTri = factVenta.filter(f => f.fecha >= inicioTri).reduce((s,f) => s + (f.base_imponible||0), 0);
  const ventaAno = factVenta.filter(f => f.fecha >= inicioAno).reduce((s,f) => s + (f.base_imponible||0), 0);
  const compraMes = factCompra.filter(f => f.fecha >= inicioMes).reduce((s,f) => s + (f.base_imponible||0), 0);
  const compraTri = factCompra.filter(f => f.fecha >= inicioTri).reduce((s,f) => s + (f.base_imponible||0), 0);
  const compraAno = factCompra.filter(f => f.fecha >= inicioAno).reduce((s,f) => s + (f.base_imponible||0), 0);
  const pendCobro = (rFacts.data||[]).filter(f => f.estado === 'pendiente' || f.estado === 'vencida').reduce((s,f) => s + (f.base_imponible||0), 0);
  const pendPago = (rFactsProv.data||[]).filter(f => f.estado === 'pendiente').reduce((s,f) => s + (f.base_imponible||0), 0);
  const saldoTotal = cuentas.reduce((s,c) => s + (c.saldo_actual||0), 0);

  // IVA estimado trimestre
  const ivaRepercutido = factVenta.filter(f => f.fecha >= inicioTri).reduce((s,f) => s + ((f.total||0) - (f.base_imponible||0)), 0);
  const ivaSoportado = factCompra.filter(f => f.fecha >= inicioTri).reduce((s,f) => s + ((f.total||0) - (f.base_imponible||0)), 0);
  const ivaLiquidar = ivaRepercutido - ivaSoportado;

  // Últimas facturas emitidas y recibidas
  const ultFactVenta = (rFacts.data||[]).filter(f => f.estado !== 'eliminado' && f.estado !== 'borrador').sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')).slice(0,8);
  const ultFactCompra = (rFactsProv.data||[]).filter(f => f.estado !== 'eliminado').sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')).slice(0,8);

  function factRow(f, tipo) {
    const nombre = tipo === 'venta' ? (f.cliente_nombre||'—') : (f.proveedor_nombre||'—');
    const stColor = f.estado === 'vencida' ? 'var(--rojo)' : f.estado === 'cobrada' || f.estado === 'pagada' ? 'var(--verde)' : 'var(--gris-500)';
    const stLabel = f.estado === 'pendiente' ? 'Pdte' : f.estado === 'vencida' ? 'Vencida' : f.estado === 'cobrada' || f.estado === 'pagada' ? 'OK' : f.estado;
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100);font-size:12px;cursor:pointer" onclick="goPage('${tipo === 'venta' ? 'facturas' : 'facturas-proveedor'}')">
      <span style="font-weight:700;width:90px;flex-shrink:0">${f.numero||'—'}</span>
      <span style="flex:1;color:var(--gris-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nombre}</span>
      <span style="color:var(--gris-400);font-size:10px;flex-shrink:0">${f.fecha||''}</span>
      <span style="font-weight:800;width:80px;text-align:right;flex-shrink:0">${fmtE(f.base_imponible)}</span>
      <span style="font-size:9px;padding:2px 6px;border-radius:4px;font-weight:700;color:${stColor};flex-shrink:0">${stLabel}</span>
    </div>`;
  }

  page.innerHTML = `
    <!-- Cabecera gestoría -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div>
        <h2 style="font-size:20px;font-weight:800;margin:0">📊 Panel contable</h2>
        <div style="font-size:12px;color:var(--gris-400);margin-top:2px">${EMPRESA.nombre || ''} · ${mesLabel}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${canAccessPage('plan-contable') ? '<button class="btn btn-secondary btn-sm" onclick="goPage(\'plan-contable\')">📊 Plan Contable</button>' : ''}
        ${canAccessPage('libro-diario') ? '<button class="btn btn-secondary btn-sm" onclick="goPage(\'libro-diario\')">📖 Libro Diario</button>' : ''}
        ${canAccessPage('cuenta-resultados') ? '<button class="btn btn-primary btn-sm" onclick="goPage(\'cuenta-resultados\')">📈 PyG</button>' : ''}
      </div>
    </div>

    <!-- KPIs principales -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:16px">
      <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">💶</div><div class="sv">${fmtE(ventaMes)}</div><div class="sl">Ventas netas (mes)</div></div>
      <div class="sc" style="--c:var(--rojo);--bg:var(--rojo-light)"><div class="si">🧾</div><div class="sv">${fmtE(compraMes)}</div><div class="sl">Compras netas (mes)</div></div>
      <div class="sc" style="--c:${ventaMes - compraMes >= 0 ? 'var(--verde)' : 'var(--rojo)'};--bg:${ventaMes - compraMes >= 0 ? 'var(--verde-light)' : 'var(--rojo-light)'}"><div class="si">📈</div><div class="sv">${fmtE(ventaMes - compraMes)}</div><div class="sl">Resultado mes</div></div>
      <div class="sc" style="--c:var(--violeta);--bg:var(--violeta-light)"><div class="si">🏦</div><div class="sv">${fmtE(saldoTotal)}</div><div class="sl">Saldo bancario</div></div>
    </div>

    <!-- KPIs trimestre y año -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:16px">
      <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📊</div><div class="sv">${fmtE(ventaTri)}</div><div class="sl">Ventas ${triLabel}</div></div>
      <div class="sc" style="--c:var(--rojo);--bg:var(--rojo-light)"><div class="si">📊</div><div class="sv">${fmtE(compraTri)}</div><div class="sl">Compras ${triLabel}</div></div>
      <div class="sc" style="--c:${ivaLiquidar >= 0 ? '#D97706' : 'var(--verde)'};--bg:${ivaLiquidar >= 0 ? '#FFFBEB' : 'var(--verde-light)'}"><div class="si">🏛️</div><div class="sv">${fmtE(ivaLiquidar)}</div><div class="sl">IVA a ${ivaLiquidar >= 0 ? 'liquidar' : 'compensar'} (${triLabel})</div></div>
      <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">💰</div><div class="sv">${fmtE(ventaAno)}</div><div class="sl">Facturado ${hoy.getFullYear()}</div></div>
    </div>

    <!-- Pendientes cobro/pago -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-bottom:16px">
      <div class="sc" style="--c:var(--verde);--bg:var(--verde-light);cursor:pointer" onclick="goPage('facturas')">
        <div class="si">⏳</div><div class="sv">${fmtE(pendCobro)}</div><div class="sl">Pendiente de cobro</div>
      </div>
      <div class="sc" style="--c:var(--rojo);--bg:var(--rojo-light);cursor:pointer" onclick="goPage('facturas-proveedor')">
        <div class="si">⏳</div><div class="sv">${fmtE(pendPago)}</div><div class="sl">Pendiente de pago</div>
      </div>
    </div>

    <!-- Listas: Últimas facturas emitidas y recibidas -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="dash-card dash-card--blue">
        <div class="card-h"><h3>🧾 Últimas facturas emitidas</h3><div class="card-ha"><button class="btn btn-secondary btn-sm" onclick="goPage('facturas')">Ver todas</button></div></div>
        <div class="card-b" style="max-height:320px;overflow-y:auto">
          ${ultFactVenta.length ? ultFactVenta.map(f => factRow(f,'venta')).join('') : '<div class="empty"><div class="ei">🧾</div><p>Sin facturas</p></div>'}
        </div>
      </div>
      <div class="dash-card dash-card--red">
        <div class="card-h"><h3>📑 Últimas facturas recibidas</h3><div class="card-ha"><button class="btn btn-secondary btn-sm" onclick="goPage('facturas-proveedor')">Ver todas</button></div></div>
        <div class="card-b" style="max-height:320px;overflow-y:auto">
          ${ultFactCompra.length ? ultFactCompra.map(f => factRow(f,'compra')).join('') : '<div class="empty"><div class="ei">📑</div><p>Sin facturas</p></div>'}
        </div>
      </div>
    </div>

    <!-- Accesos rápidos contabilidad -->
    <div style="margin-top:18px">
      <div style="font-size:13px;font-weight:800;color:var(--gris-600);margin-bottom:10px">⚡ Accesos rápidos</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        ${_dashQuickLink('plan-contable','📊','Plan Contable')}
        ${_dashQuickLink('libro-diario','📖','Libro Diario')}
        ${_dashQuickLink('libro-mayor','📒','Libro Mayor')}
        ${_dashQuickLink('balance-sumas','📈','Balance Sumas')}
        ${_dashQuickLink('cuenta-resultados','💹','Cuenta de Resultados')}
        ${_dashQuickLink('tesoreria-movimientos','🏦','Movimientos banco')}
        ${_dashQuickLink('clientes','👥','Clientes')}
        ${_dashQuickLink('proveedores','🏭','Proveedores')}
        ${_dashQuickLink('facturas','🧾','Facturas emitidas')}
        ${_dashQuickLink('facturas-proveedor','📑','Facturas recibidas')}
      </div>
    </div>

    ${cuentas.length ? `
    <!-- Cuentas bancarias -->
    <div style="margin-top:18px">
      <div style="font-size:13px;font-weight:800;color:var(--gris-600);margin-bottom:10px">🏦 Cuentas bancarias</div>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(cuentas.length,3)},1fr);gap:10px">
        ${cuentas.map(c => `
          <div class="card" style="padding:14px;cursor:pointer" onclick="goPage('tesoreria-cuentas')">
            <div style="font-size:12px;font-weight:700;margin-bottom:4px">${c.nombre||'Cuenta'}</div>
            <div style="font-size:10px;color:var(--gris-400);margin-bottom:8px">${c.banco||''}</div>
            <div style="font-size:18px;font-weight:800;color:${(c.saldo_actual||0)>=0?'var(--verde)':'var(--rojo)'}">${fmtE(c.saldo_actual||0)}</div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;
}
