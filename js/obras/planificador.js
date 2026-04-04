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
let todosUsuarios = [];

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
  if (!window.sb || !window.EMPRESA) return;
  try {
    const { data } = await window.sb.from('usuarios')
      .select('id,nombre,apellidos,activo')
      .eq('empresa_id', window.EMPRESA.id)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    todosUsuarios = data || [];
    renderFiltroOperarios();
  } catch (e) {
    console.error('Error cargando usuarios:', e);
  }
}

async function cargarPartesParaPlanificador() {
  if (!window.sb || !window.EMPRESA) return;
  try {
    const startDate = new Date(planCurrentDate);
    const endDate = new Date(planCurrentDate);
    endDate.setDate(endDate.getDate() + 7);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const { data } = await window.sb.from('partes_trabajo')
      .select('*')
      .eq('empresa_id', window.EMPRESA.id)
      .gte('fecha', startStr)
      .lt('fecha', endStr)
      .neq('estado', 'eliminado')
      .order('fecha', { ascending: true });

    planPartesData = data || [];
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
    todosUsuarios.map(u => `<option value="${u.id}">${u.nombre||''} ${u.apellidos||''}</option>`).join('');
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

  container.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(planCurrentDate);
    d.setDate(d.getDate() + i);

    const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase();
    const dayDate = d.getDate();
    const dayMonth = d.toLocaleDateString('es-ES', { month: 'short' });

    const div = document.createElement('div');
    div.className = 'plan-day-header';
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

  // Crear celdas para cada hora de cada día
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    for (let hourIdx = PLAN_HORAS_INICIO; hourIdx < PLAN_HORAS_FIN; hourIdx++) {
      const cell = document.createElement('div');
      cell.className = 'plan-grid-cell';
      cell.style.gridColumn = dayIdx + 1;
      cell.style.gridRow = (hourIdx - PLAN_HORAS_INICIO) + 1;

      // Buscar partes que caigan en este slot
      const dayDate = new Date(planCurrentDate);
      dayDate.setDate(dayDate.getDate() + dayIdx);
      const dayStr = dayDate.toISOString().split('T')[0];

      const partesEnSlot = partesFiltrados.filter(p => {
        if (p.fecha !== dayStr) return false;
        if (!p.hora_inicio) return false;
        const [hStart, minStart] = p.hora_inicio.split(':').map(Number);
        return hStart === hourIdx;
      });

      // Mostrar partes en la celda
      partesEnSlot.forEach(parte => {
        const parteEl = crearElementoParte(parte);
        cell.appendChild(parteEl);
      });

      container.appendChild(cell);
    }
  }

  // Mensaje si no hay partes
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
// AUXILIARES
// ═══════════════════════════════════════════════════════════════════════

function toast(msg, tipo) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = tipo === 'error' ? '#EF4444' : '#10B981';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}
