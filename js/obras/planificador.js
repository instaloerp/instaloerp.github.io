// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: Planificador Semanal (Weekly Scheduler)
// Gestión completa: vista semanal de partes de trabajo, navegación, filtros
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
// VARIABLES GLOBALES
// ─────────────────────────────────────────────────────────────────────
let planPartesData = [];
let planCurrentDate = new Date();
let planOperarioFilter = '';
let planUsuarios = [];

const PLAN_HORAS_INICIO = 7;
const PLAN_HORAS_FIN = 19;
const PLAN_HORA_HEIGHT = 60; // pixels

const PT_ESTADOS_PLAN = {
  programado:  { label:'Programado',  color:'#3B82F6', bg:'#EFF6FF',  ico:'📅' },
  en_curso:    { label:'En curso',    color:'#D97706', bg:'#FFFBEB',  ico:'🔧' },
  completado:  { label:'Completado',  color:'#059669', bg:'#ECFDF5',  ico:'✅' },
  revisado:    { label:'Revisado',    color:'#10B981', bg:'#D1FAE5',  ico:'👁️' },
  facturado:   { label:'Facturado',   color:'#8B5CF6', bg:'#F5F3FF',  ico:'🧾' },
  borrador:    { label:'Borrador',    color:'#9CA3AF', bg:'#F3F4F6',  ico:'✏️' },
};

// ═══════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════

async function initPlanificador() {
  planCurrentDate = new Date();
  // Mover al lunes de la semana actual
  planCurrentDate = getMonday(planCurrentDate);

  await cargarUsuarios();
  await cargarPartesParaPlanificador();
  renderPlanificador();
}

function getMonday(d) {
  d = new Date(d);
  var day = d.getDay(),
      diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

async function cargarUsuarios() {
  if (!sb || !EMPRESA) return;
  try {
    const { data } = await sb.from('perfiles')
      .select('id,nombre,apellidos')
      .eq('empresa_id', EMPRESA.id)
      .order('nombre', { ascending: true });
    planUsuarios = data || [];
    console.log('Planificador: usuarios cargados =', planUsuarios.length);
    renderFiltroOperarios();
  } catch (e) {
    console.error('Error cargando usuarios:', e);
  }
}

async function cargarPartesParaPlanificador() {
  if (!sb || !EMPRESA) return;
  try {
    const startDate = new Date(planCurrentDate);
    const endDate = new Date(planCurrentDate);
    endDate.setDate(endDate.getDate() + 7);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const { data } = await sb.from('partes_trabajo')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .gte('fecha', startStr)
      .lt('fecha', endStr)
      .neq('estado', 'eliminado')
      .order('fecha', { ascending: true });

    planPartesData = data || [];
    console.log('Planificador: partes cargados =', planPartesData.length, planPartesData);
  } catch (e) {
    console.error('Error cargando partes:', e);
    toast('Error al cargar partes de trabajo', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FILTRADO
// ═══════════════════════════════════════════════════════════════════════

function renderFiltroOperarios() {
  const sel = document.getElementById('plan-filtro-operario');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todos los operarios</option>' +
    planUsuarios.map(u => `<option value="${u.id}">${u.nombre||''} ${u.apellidos||''}</option>`).join('');
}

function filtrarPlanificador() {
  const sel = document.getElementById('plan-filtro-operario');
  planOperarioFilter = sel ? sel.value : '';
  renderPlanificador();
}

// ═══════════════════════════════════════════════════════════════════════
// NAVEGACIÓN DE SEMANAS
// ═══════════════════════════════════════════════════════════════════════

function planificadorSemanaAnterior() {
  planCurrentDate.setDate(planCurrentDate.getDate() - 7);
  cargarPartesParaPlanificador().then(() => renderPlanificador());
}

function planificadorSemanaSiguiente() {
  planCurrentDate.setDate(planCurrentDate.getDate() + 7);
  cargarPartesParaPlanificador().then(() => renderPlanificador());
}

function planificadorHoyEnSemana() {
  planCurrentDate = getMonday(new Date());
  cargarPartesParaPlanificador().then(() => renderPlanificador());
}

// ═══════════════════════════════════════════════════════════════════════
// RENDERIZADO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

function renderPlanificador() {
  renderWeekLabel();
  renderDayHeaders();
  renderHoursColumn();
  renderGrid();
}

function renderWeekLabel() {
  const lbl = document.getElementById('planWeekLabel');
  if (!lbl) return;

  const startDate = new Date(planCurrentDate);
  const endDate = new Date(planCurrentDate);
  endDate.setDate(endDate.getDate() + 6);

  const opts = { weekday: 'long', month: 'short', day: 'numeric' };
  const start = startDate.toLocaleDateString('es-ES', opts);
  const end = endDate.toLocaleDateString('es-ES', opts);

  lbl.textContent = `${start} - ${end}`;
}

function renderDayHeaders() {
  const container = document.getElementById('planDaysHeader');
  if (!container) return;

  const hoyStr = new Date().toISOString().split('T')[0];
  container.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(planCurrentDate);
    d.setDate(d.getDate() + i);

    const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase();
    const dayDate = d.getDate();
    const dayMonth = d.toLocaleDateString('es-ES', { month: 'short' });
    const esHoy = d.toISOString().split('T')[0] === hoyStr;

    const div = document.createElement('div');
    div.className = 'plan-day-header' + (esHoy ? ' plan-today' : '');
    div.innerHTML = `<span class="plan-day-name">${dayName}</span><span class="plan-day-date">${dayDate} ${dayMonth}</span>`;
    container.appendChild(div);
  }
}

function renderHoursColumn() {
  const container = document.getElementById('planHoursColumn');
  if (!container) return;

  container.innerHTML = '';
  for (let h = PLAN_HORAS_INICIO; h < PLAN_HORAS_FIN; h++) {
    const div = document.createElement('div');
    div.className = 'plan-hour';
    div.textContent = `${h}:00`;
    container.appendChild(div);
  }
}

function renderGrid() {
  const container = document.getElementById('planGrid');
  if (!container) return;

  container.innerHTML = '';

  // Filtrar partes según el filtro de operario
  let partesFiltrados = planPartesData;
  if (planOperarioFilter) {
    partesFiltrados = planPartesData.filter(p => p.usuario_id === planOperarioFilter);
  }

  // Separar partes: con hora dentro del rango, con hora fuera del rango, sin hora
  const partesConHora = partesFiltrados.filter(p => {
    if (!p.hora_inicio) return false;
    const [h] = p.hora_inicio.split(':').map(Number);
    return h >= PLAN_HORAS_INICIO && h < PLAN_HORAS_FIN;
  });
  const partesFueraRango = partesFiltrados.filter(p => {
    if (!p.hora_inicio) return false;
    const [h] = p.hora_inicio.split(':').map(Number);
    return h < PLAN_HORAS_INICIO || h >= PLAN_HORAS_FIN;
  });
  const partesSinHora = partesFiltrados.filter(p => !p.hora_inicio);
  // Juntar sin hora + fuera de rango para mostrar debajo
  const partesExtra = [...partesSinHora, ...partesFueraRango];

  // Crear celdas para cada hora de cada día
  const hoyStr = new Date().toISOString().split('T')[0];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayDate = new Date(planCurrentDate);
    dayDate.setDate(dayDate.getDate() + dayIdx);
    const dayStr = dayDate.toISOString().split('T')[0];
    const esHoy = dayStr === hoyStr;

    for (let hourIdx = PLAN_HORAS_INICIO; hourIdx < PLAN_HORAS_FIN; hourIdx++) {
      const cell = document.createElement('div');
      cell.className = 'plan-grid-cell' + (esHoy ? ' plan-today-col' : '');
      cell.style.gridColumn = dayIdx + 1;
      cell.style.gridRow = (hourIdx - PLAN_HORAS_INICIO) + 1;

      const partesEnSlot = partesConHora.filter(p => {
        if (p.fecha !== dayStr) return false;
        const [hStart] = p.hora_inicio.split(':').map(Number);
        return hStart === hourIdx;
      });

      partesEnSlot.forEach(parte => {
        const parteEl = crearElementoParte(parte);
        cell.appendChild(parteEl);
      });

      container.appendChild(cell);
    }
  }

  // Mostrar partes SIN hora o FUERA de rango debajo de la rejilla
  const sinHoraContainer = document.getElementById('planSinHora');
  if (sinHoraContainer) {
    sinHoraContainer.innerHTML = '';
    if (partesExtra.length > 0) {
      sinHoraContainer.style.display = 'block';
      const titulo = document.createElement('h4');
      titulo.style.cssText = 'margin:0 0 10px;font-size:14px;color:#6B7280;font-weight:600';
      titulo.textContent = `📋 Partes sin hora o fuera de horario (${partesExtra.length})`;
      sinHoraContainer.appendChild(titulo);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px';

      partesExtra.forEach(parte => {
        const card = document.createElement('div');
        const estadoInfo = PT_ESTADOS_PLAN[parte.estado] || PT_ESTADOS_PLAN.borrador;
        const horaStr = parte.hora_inicio ? parte.hora_inicio.substring(0,5) : 'Sin hora';
        card.style.cssText = `background:${estadoInfo.bg};border:1px solid ${estadoInfo.color}30;border-left:3px solid ${estadoInfo.color};border-radius:6px;padding:8px 10px;cursor:pointer;font-size:12px`;
        card.innerHTML = `
          <div style="font-weight:600;margin-bottom:3px">${estadoInfo.ico} ${parte.trabajo_titulo || 'Sin título'}</div>
          <div style="color:#6B7280">${parte.fecha || ''} · ${horaStr} · ${parte.usuario_nombre || '—'}</div>
          <div style="margin-top:3px"><span style="background:${estadoInfo.color};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px">${estadoInfo.label}</span></div>`;
        card.onclick = () => { if (typeof verDetalleParte === 'function') verDetalleParte(parte.id); };
        grid.appendChild(card);
      });

      sinHoraContainer.appendChild(grid);
    } else {
      sinHoraContainer.style.display = 'none';
    }
  }

  // Resumen de partes cargados
  console.log(`Planificador: ${partesFiltrados.length} total, ${partesConHora.length} en rejilla, ${partesExtra.length} extra`);

  // Mensaje si no hay partes en absoluto
  if (partesFiltrados.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'plan-empty';
    emptyEl.innerHTML = '<div style="padding:40px 20px"><div style="font-size:20px;margin-bottom:10px">📋</div><p>No hay partes de trabajo para esta semana</p></div>';
    container.appendChild(emptyEl);
  }
}

function crearElementoParte(parte) {
  const el = document.createElement('div');
  const estadoClass = `estado-${parte.estado || 'borrador'}`;
  el.className = `plan-parte ${estadoClass}`;

  const horaInicio = parte.hora_inicio ? parte.hora_inicio.substring(0, 5) : '—';
  const horaFin = parte.hora_fin ? parte.hora_fin.substring(0, 5) : '—';
  const titulo = parte.trabajo_titulo || 'Sin título';
  const usuario = parte.usuario_nombre || '—';

  el.innerHTML = `<strong>${horaInicio}-${horaFin}</strong><br>${titulo}<br><small>${usuario}</small>`;
  el.style.cursor = 'pointer';
  el.title = `${titulo}\n${horaInicio}-${horaFin}\n${usuario}`;

  el.onclick = (e) => {
    e.stopPropagation();
    if (typeof verDetalleParte === 'function') {
      verDetalleParte(parte.id);
    }
  };

  return el;
}

// ═══════════════════════════════════════════════════════════════════════
// AUXILIARES (toast global definido en ui.js)
// ═══════════════════════════════════════════════════════════════════════
