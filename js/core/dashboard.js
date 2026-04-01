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
}
