// ═══════════════════════════════════════════════════════════
// CALENDARIO — Planificación visual de tareas y obras
// ═══════════════════════════════════════════════════════════

let calFechaActual = new Date();
let calTareasCache = [];
let calTrabajosCache = [];

const CAL_DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

// ── Navegación del calendario ──

function calMesAnterior() {
  calFechaActual.setMonth(calFechaActual.getMonth() - 1);
  renderCalendario();
}
function calMesSiguiente() {
  calFechaActual.setMonth(calFechaActual.getMonth() + 1);
  renderCalendario();
}
function calHoy() {
  calFechaActual = new Date();
  renderCalendario();
}

// ── Cargar datos ──

async function cargarDatosCalendario() {
  if (!EMPRESA) return;
  try {
    const [tarRes, trRes] = await Promise.all([
      sb.from('tareas_obra').select('*').eq('empresa_id', EMPRESA.id),
      sb.from('trabajos').select('id,numero,titulo,descripcion,fecha,operario_nombre,estado,cliente_id').eq('empresa_id', EMPRESA.id).neq('estado','eliminado'),
    ]);
    calTareasCache = tarRes.data || [];
    calTrabajosCache = trRes.data || [];
  } catch(e) {
    calTareasCache = [];
    calTrabajosCache = (typeof trabajos !== 'undefined') ? trabajos : [];
  }
  // Poblar select de usuarios
  poblarCalFiltroUsuario();
}

async function poblarCalFiltroUsuario() {
  const sel = document.getElementById('cal-filtro-usuario');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  try {
    const { data } = await sb.from('perfiles').select('id,nombre,apellidos').eq('empresa_id', EMPRESA.id);
    if (data) data.forEach(u => {
      const n = ((u.nombre||'')+' '+(u.apellidos||'')).trim() || 'Sin nombre';
      sel.innerHTML += `<option value="${u.id}">${n}</option>`;
    });
  } catch(e) {}
  sel.value = current;
  // También poblar el de Mis Tareas
  const sel2 = document.getElementById('mt-filtro-usuario');
  if (sel2) {
    const c2 = sel2.value;
    sel2.innerHTML = sel.innerHTML;
    sel2.value = c2;
  }
}

// ── Renderizar calendario ──

async function renderCalendario() {
  await cargarDatosCalendario();

  const year = calFechaActual.getFullYear();
  const month = calFechaActual.getMonth();
  const label = document.getElementById('calMesLabel');
  if (label) label.textContent = new Date(year, month, 1).toLocaleString('es-ES',{month:'long',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase());

  const filtroUser = document.getElementById('cal-filtro-usuario')?.value || '';

  // Filtrar tareas del mes
  let tareasMes = calTareasCache.filter(t => {
    if (!t.fecha_limite) return false;
    const d = new Date(t.fecha_limite);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  if (filtroUser) tareasMes = tareasMes.filter(t => String(t.responsable_id) === filtroUser || String(t.creado_por) === filtroUser);

  // Obras con fecha en el mes
  let obrasMes = calTrabajosCache.filter(t => {
    if (!t.fecha) return false;
    const d = new Date(t.fecha);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // KPIs
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const pendMes = tareasMes.filter(t => t.estado !== 'completada').length;
  const vencMes = tareasMes.filter(t => t.estado !== 'completada' && new Date(t.fecha_limite) < hoy).length;
  const el = id => document.getElementById(id);
  if (el('cal-kpi-tareas')) el('cal-kpi-tareas').textContent = tareasMes.length;
  if (el('cal-kpi-obras')) el('cal-kpi-obras').textContent = obrasMes.length;
  if (el('cal-kpi-pend')) el('cal-kpi-pend').textContent = pendMes;
  if (el('cal-kpi-venc')) el('cal-kpi-venc').textContent = vencMes;

  // Agrupar por día
  const tareasMap = {};
  tareasMes.forEach(t => {
    const day = new Date(t.fecha_limite).getDate();
    if (!tareasMap[day]) tareasMap[day] = [];
    tareasMap[day].push(t);
  });
  const obrasMap = {};
  obrasMes.forEach(t => {
    const day = new Date(t.fecha).getDate();
    if (!obrasMap[day]) obrasMap[day] = [];
    obrasMap[day].push(t);
  });

  // Generar grid
  const grid = document.getElementById('calGrid');
  if (!grid) return;

  let html = '';

  // Cabecera días de la semana
  CAL_DIAS.forEach(d => {
    html += `<div style="padding:10px 4px;text-align:center;font-weight:700;font-size:11px;color:var(--gris-500);background:var(--gris-50);border-bottom:1px solid var(--gris-100)">${d}</div>`;
  });

  // Primer día del mes (lunes=0)
  const primerDia = new Date(year, month, 1);
  let startDay = primerDia.getDay() - 1; // 0=lun
  if (startDay < 0) startDay = 6; // domingo

  const diasMes = new Date(year, month + 1, 0).getDate();
  const todayDate = new Date();
  const isCurrentMonth = todayDate.getFullYear() === year && todayDate.getMonth() === month;
  const todayDay = todayDate.getDate();

  // Celdas vacías antes
  for (let i = 0; i < startDay; i++) {
    html += `<div style="padding:6px;min-height:80px;background:var(--gris-50);border-bottom:1px solid var(--gris-100);border-right:1px solid var(--gris-100)"></div>`;
  }

  // Días del mes
  for (let d = 1; d <= diasMes; d++) {
    const isToday = isCurrentMonth && d === todayDay;
    const isWeekend = ((startDay + d - 1) % 7) >= 5;
    const dayTareas = tareasMap[d] || [];
    const dayObras = obrasMap[d] || [];
    const hasItems = dayTareas.length || dayObras.length;

    html += `<div onclick="calSelectDay(${d})" style="padding:4px 6px;min-height:80px;cursor:${hasItems?'pointer':'default'};border-bottom:1px solid var(--gris-100);border-right:1px solid var(--gris-100);${isToday?'background:#EFF6FF;':''}${isWeekend?'background:var(--gris-50);':''}">`

    // Número del día
    html += `<div style="font-size:12px;font-weight:${isToday?'800':'600'};color:${isToday?'var(--azul)':'var(--gris-700)'};margin-bottom:3px">${d}</div>`;

    // Indicadores de obras
    dayObras.forEach(o => {
      html += `<div style="font-size:9px;padding:1px 4px;margin-bottom:2px;background:#DBEAFE;color:#1E40AF;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${o.titulo||o.numero||''}">🏗️ ${o.numero||o.titulo||'Obra'}</div>`;
    });

    // Indicadores de tareas (máximo 3 visibles)
    const maxShow = 3 - dayObras.length;
    dayTareas.slice(0, Math.max(maxShow,1)).forEach(t => {
      const isVencida = t.estado !== 'completada' && new Date(t.fecha_limite) < hoy;
      const isDone = t.estado === 'completada';
      const bg = isDone ? '#ECFDF5' : isVencida ? '#FEF2F2' : '#FFFBEB';
      const color = isDone ? '#059669' : isVencida ? '#DC2626' : '#D97706';
      html += `<div style="font-size:9px;padding:1px 4px;margin-bottom:2px;background:${bg};color:${color};border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${t.texto||''}">${isDone?'✔':'⏳'} ${t.texto||'Tarea'}</div>`;
    });
    if (dayTareas.length > maxShow && maxShow > 0) {
      html += `<div style="font-size:9px;color:var(--gris-400)">+${dayTareas.length - maxShow} más</div>`;
    }

    html += '</div>';
  }

  grid.innerHTML = html;

  // Ocultar detalle
  const det = document.getElementById('calDayDetail');
  if (det) det.style.display = 'none';
}

// ── Detalle del día ──

function calSelectDay(day) {
  const year = calFechaActual.getFullYear();
  const month = calFechaActual.getMonth();
  const filtroUser = document.getElementById('cal-filtro-usuario')?.value || '';
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  let tareasDia = calTareasCache.filter(t => {
    if (!t.fecha_limite) return false;
    const d = new Date(t.fecha_limite);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
  if (filtroUser) tareasDia = tareasDia.filter(t => String(t.responsable_id) === filtroUser || String(t.creado_por) === filtroUser);

  let obrasDia = calTrabajosCache.filter(t => {
    if (!t.fecha) return false;
    const d = new Date(t.fecha);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });

  const det = document.getElementById('calDayDetail');
  if (!det) return;

  if (!tareasDia.length && !obrasDia.length) {
    det.style.display = 'none';
    return;
  }

  const fechaStr = new Date(year, month, day).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});

  let html = `<div style="font-weight:800;font-size:14px;margin-bottom:12px;color:var(--gris-700)">${fechaStr.replace(/^\w/,c=>c.toUpperCase())}</div>`;

  if (obrasDia.length) {
    html += `<div style="font-weight:700;font-size:11px;color:var(--azul);margin-bottom:6px;text-transform:uppercase">🏗️ Obras</div>`;
    obrasDia.forEach(o => {
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--gris-50);border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="if(typeof abrirFichaObra==='function'){goPage('trabajos');abrirFichaObra(${o.id})}">
        <div style="font-size:18px">🏗️</div>
        <div>
          <div style="font-weight:700;font-size:12px">${o.numero||''} — ${o.titulo||o.descripcion||'Sin título'}</div>
          <div style="font-size:10.5px;color:var(--gris-500)">${o.operario_nombre||'Sin asignar'} · ${o.estado||''}</div>
        </div>
      </div>`;
    });
  }

  if (tareasDia.length) {
    html += `<div style="font-weight:700;font-size:11px;color:var(--naranja);margin-bottom:6px;margin-top:8px;text-transform:uppercase">✅ Tareas</div>`;
    tareasDia.forEach(t => {
      const isVencida = t.estado !== 'completada' && new Date(t.fecha_limite) < hoy;
      const isDone = t.estado === 'completada';
      const trabajo = calTrabajosCache.find(tr => tr.id === t.trabajo_id);

      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:${isDone?'#ECFDF5':isVencida?'#FEF2F2':'var(--gris-50)'};border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="if(typeof abrirFichaObra==='function' && ${t.trabajo_id}){goPage('trabajos');abrirFichaObra(${t.trabajo_id});setTimeout(()=>obraTab('seguimiento'),300)}">
        <div style="font-size:16px">${isDone?'✔️':isVencida?'🚨':'⏳'}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:12px;${isDone?'text-decoration:line-through;opacity:.6':''}">${t.texto||'Tarea'}</div>
          <div style="font-size:10.5px;color:var(--gris-500)">
            ${trabajo ? (trabajo.numero||trabajo.titulo||'Obra') + ' · ' : ''}${t.responsable_nombre||'Sin asignar'} · ${t.prioridad||'normal'}
            ${isVencida ? ' · <span style="color:#DC2626;font-weight:700">¡Vencida!</span>' : ''}
          </div>
        </div>
        <div style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700;background:${isDone?'#D1FAE5':'#FEF3C7'};color:${isDone?'#059669':'#D97706'}">${t.estado||'pendiente'}</div>
      </div>`;
    });
  }

  det.innerHTML = html;
  det.style.display = 'block';
}


// ═══════════════════════════════════════════════════════════
// MIS TAREAS — Vista global de tareas del usuario
// ═══════════════════════════════════════════════════════════

let mtTareasCache = [];

async function cargarMisTareas() {
  if (!EMPRESA) return;
  try {
    const { data } = await sb.from('tareas_obra').select('*').eq('empresa_id', EMPRESA.id).order('created_at',{ascending:false});
    mtTareasCache = data || [];
  } catch(e) {
    mtTareasCache = [];
  }
  // Poblar selects
  await poblarCalFiltroUsuario();
  renderMisTareas();
}

function renderMisTareas() {
  const container = document.getElementById('mtLista');
  if (!container) return;

  const filtroEstado = document.getElementById('mt-filtro-estado')?.value || '';
  const filtroUser = document.getElementById('mt-filtro-usuario')?.value || '';
  const filtroPrio = document.getElementById('mt-filtro-prioridad')?.value || '';

  let tareas = [...mtTareasCache];

  // Filtros
  if (filtroEstado) tareas = tareas.filter(t => t.estado === filtroEstado);
  if (filtroUser) tareas = tareas.filter(t => String(t.responsable_id) === filtroUser);
  if (filtroPrio) tareas = tareas.filter(t => t.prioridad === filtroPrio);

  const hoy = new Date(); hoy.setHours(0,0,0,0);

  // KPIs
  const pendientes = tareas.filter(t => t.estado !== 'completada').length;
  const completadas = tareas.filter(t => t.estado === 'completada').length;
  const vencidas = tareas.filter(t => t.estado !== 'completada' && t.fecha_limite && new Date(t.fecha_limite) < hoy).length;

  const el = id => document.getElementById(id);
  if (el('mt-kpi-total')) el('mt-kpi-total').textContent = tareas.length;
  if (el('mt-kpi-pend')) el('mt-kpi-pend').textContent = pendientes;
  if (el('mt-kpi-done')) el('mt-kpi-done').textContent = completadas;
  if (el('mt-kpi-venc')) el('mt-kpi-venc').textContent = vencidas;

  if (!tareas.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--gris-400)">
      <div style="font-size:36px;margin-bottom:10px">✅</div>
      <p style="font-size:13px">No hay tareas con estos filtros</p>
    </div>`;
    return;
  }

  // Agrupar por obra
  const porObra = {};
  tareas.forEach(t => {
    const key = t.trabajo_id || 'sin_obra';
    if (!porObra[key]) porObra[key] = [];
    porObra[key].push(t);
  });

  const PRIO_ICO = { baja:'▽', normal:'◆', alta:'▲', urgente:'🔺' };
  const PRIO_COLOR = { baja:'#6B7280', normal:'#2563EB', alta:'#D97706', urgente:'#DC2626' };
  const EST_ICO = { pendiente:'⏳', en_curso:'🔄', completada:'✔️', bloqueada:'🚫', rechazada:'✖️' };
  const EST_COLOR = { pendiente:'#D97706', en_curso:'#2563EB', completada:'#059669', bloqueada:'#DC2626', rechazada:'#9333EA' };
  const EST_BG = { pendiente:'#FFFBEB', en_curso:'#EFF6FF', completada:'#ECFDF5', bloqueada:'#FEF2F2', rechazada:'#FAF5FF' };

  let html = '';

  // Obtener nombres de obras
  const calTrabajos = (typeof calTrabajosCache !== 'undefined' && calTrabajosCache.length) ? calTrabajosCache : (typeof trabajos !== 'undefined' ? trabajos : []);

  Object.keys(porObra).forEach(obraId => {
    const tareasObra = porObra[obraId];
    const trabajo = obraId !== 'sin_obra' ? calTrabajos.find(tr => String(tr.id) === String(obraId)) : null;
    const obraLabel = trabajo ? `🏗️ ${trabajo.numero||''} — ${trabajo.titulo||trabajo.descripcion||''}` : '📋 Sin obra asignada';

    html += `<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--gris-100);cursor:${trabajo?'pointer':'default'}" ${trabajo ? `onclick="goPage('trabajos');abrirFichaObra(${trabajo.id});setTimeout(()=>obraTab('seguimiento'),300)"`:''}>
        <span style="font-weight:800;font-size:13px;color:var(--gris-700)">${obraLabel}</span>
        <span style="font-size:10px;color:var(--gris-400);background:var(--gris-100);padding:2px 8px;border-radius:10px">${tareasObra.length} tarea${tareasObra.length>1?'s':''}</span>
      </div>`;

    tareasObra.forEach(t => {
      const isVencida = t.estado !== 'completada' && t.estado !== 'rechazada' && t.fecha_limite && new Date(t.fecha_limite) < hoy;
      const isDone = t.estado === 'completada';
      const isRech = t.estado === 'rechazada';
      const isCerrada = isDone || isRech;
      const prioColor = PRIO_COLOR[t.prioridad] || PRIO_COLOR.normal;
      const prioIco = PRIO_ICO[t.prioridad] || '◆';
      const estColor = EST_COLOR[t.estado] || EST_COLOR.pendiente;
      const estBg = EST_BG[t.estado] || EST_BG.pendiente;
      const estIco = EST_ICO[t.estado] || '⏳';
      const clickObra = trabajo ? `goPage('trabajos');abrirFichaObra(${trabajo.id});setTimeout(()=>obraTab('seguimiento'),300)` : '';

      html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--gris-100);${isCerrada?'opacity:.6':''};cursor:${clickObra?'pointer':'default'}" onclick="${clickObra}">
        <div onclick="event.stopPropagation();mtToggleTarea('${t.id}')" style="width:20px;height:20px;border-radius:50%;border:2px solid ${isDone?'#059669':isRech?'#9333EA':'var(--gris-300)'};display:flex;align-items:center;justify-content:center;cursor:pointer;background:${isDone?'#059669':isRech?'#9333EA':'transparent'};flex-shrink:0">
          ${isDone?'<span style="color:#fff;font-size:11px">✓</span>':isRech?'<span style="color:#fff;font-size:11px">✕</span>':''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12.5px;${isCerrada?'text-decoration:line-through':''};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.texto||'Tarea'}</div>
          <div style="font-size:10.5px;color:var(--gris-500);display:flex;gap:8px;flex-wrap:wrap;margin-top:2px">
            <span style="color:${prioColor};font-weight:700">${prioIco} ${t.prioridad||'normal'}</span>
            ${t.responsable_nombre ? `<span>👤 ${t.responsable_nombre}</span>` : ''}
            ${t.fecha_limite ? `<span ${isVencida?'style="color:#DC2626;font-weight:700"':''}>📅 ${new Date(t.fecha_limite).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}${isVencida?' ¡Vencida!':''}</span>` : ''}
          </div>
        </div>
        <div style="font-size:10px;padding:3px 10px;border-radius:6px;font-weight:700;background:${estBg};color:${estColor};white-space:nowrap">${estIco} ${t.estado||'pendiente'}</div>
      </div>`;
    });

    html += '</div>';
  });

  container.innerHTML = html;
}

// Toggle completar tarea desde Mis Tareas
async function mtToggleTarea(id) {
  const tarea = mtTareasCache.find(t => String(t.id) === String(id));
  if (!tarea) return;
  const nuevoEstado = tarea.estado === 'completada' ? 'pendiente' : 'completada';
  const { error } = await sb.from('tareas_obra').update({ estado: nuevoEstado, completada_at: nuevoEstado === 'completada' ? new Date().toISOString() : null }).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  tarea.estado = nuevoEstado;
  toast(nuevoEstado === 'completada' ? 'Tarea completada ✓' : 'Tarea reabierta','success');
  renderMisTareas();
}

// Eventos de filtros
document.addEventListener('DOMContentLoaded', () => {
  ['mt-filtro-estado','mt-filtro-usuario','mt-filtro-prioridad'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderMisTareas);
  });
  const calUser = document.getElementById('cal-filtro-usuario');
  if (calUser) calUser.addEventListener('change', renderCalendario);
});
