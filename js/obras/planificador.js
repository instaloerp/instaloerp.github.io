// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: Planificador Semanal (Weekly Scheduler) v1.2.1
// ═══════════════════════════════════════════════════════════════════════

// ─── HELPER: fecha local sin bug de timezone ────────────────────────
function fechaLocalStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── VARIABLES GLOBALES ──────────────────────────────────────────────
let planPartesData = [];
let planCurrentDate = new Date();
let planOperarioFilter = '';
let planUsuarios = [];
let planHoraHeight = 28; // se recalcula dinámicamente

// Horario visible (0:00 a 23:00 = 24 filas)
const PLAN_HORAS_INICIO = 0;
const PLAN_HORAS_FIN = 24;

// Horario laboral por defecto (8:30-16:30 → filas 8-16 inclusive)
let PLAN_HORA_LABORAL_INI = 8;
let PLAN_HORA_LABORAL_FIN = 17;

// Festivos (array de strings 'YYYY-MM-DD', se carga desde config)
let planFestivos = [];

// Modo fullscreen (cuando se abre desde ficha de obra)
let planFullscreen = false;
let planObraFija = null; // { id, titulo } si se abre desde una obra

const PT_ESTADOS_PLAN = {
  programado:  { label:'Programado',  color:'#3B82F6', bg:'#EFF6FF',  ico:'📅' },
  en_curso:    { label:'En curso',    color:'#D97706', bg:'#FFFBEB',  ico:'🔧' },
  completado:  { label:'Cumplimentado', color:'#059669', bg:'#ECFDF5',  ico:'✅' },
  revisado:    { label:'Revisado',    color:'#10B981', bg:'#D1FAE5',  ico:'👁️' },
  facturado:   { label:'Facturado',   color:'#8B5CF6', bg:'#F5F3FF',  ico:'🧾' },
  borrador:    { label:'Borrador',    color:'#9CA3AF', bg:'#F3F4F6',  ico:'✏️' },
};

// ═══════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════

let _planResizeTimer = null;
let _planResizeHandler = null;   // ← referencia para poder eliminar el listener
let _planScrollCleanup = null;   // ← cleanup del scroll listener

async function initPlanificador() {
  planCurrentDate = getMonday(new Date());
  await cargarConfigPlanificador();
  await cargarUsuarios();
  await cargarPartesParaPlanificador();
  calcularAlturaFilas();
  renderPlanificador();
  sincronizarScrollHoras();

  // Recalcular al redimensionar ventana (con debounce)
  // ► CRITICAL: eliminar handler anterior para no acumular listeners
  if (_planResizeHandler) window.removeEventListener('resize', _planResizeHandler);
  _planResizeHandler = () => {
    clearTimeout(_planResizeTimer);
    _planResizeTimer = setTimeout(() => {
      // Solo re-renderizar si la página del planificador está visible
      const page = document.getElementById('page-planificador');
      if (page && page.classList.contains('active')) {
        calcularAlturaFilas();
        renderPlanificador();
      }
    }, 150);
  };
  window.addEventListener('resize', _planResizeHandler);
}

// Versión fullscreen para abrir desde ficha de obra
async function abrirPlanificadorDesdeObra(obraId, obraTitulo) {
  planObraFija = { id: obraId, titulo: obraTitulo };
  planFullscreen = true;

  // Crear overlay fullscreen
  let overlay = document.getElementById('planFullscreenOverlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'planFullscreenOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:#fff;display:flex;flex-direction:column;overflow:auto';

  // Banner superior: obra + operario + navegación + cerrar
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:var(--gris-50);border-bottom:1px solid var(--gris-200);flex-shrink:0">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:15px;font-weight:700;color:var(--gris-800)">📅 Programar parte — <span style="color:var(--azul)">${obraTitulo}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <select id="plan-filtro-operario-fs" onchange="filtrarPlanificadorFS()" style="padding:6px 10px;border:1px solid var(--gris-300);border-radius:8px;font-size:13px"></select>
        <button onclick="planificadorSemanaAnteriorFS()" style="padding:6px 10px;border:1px solid var(--gris-300);border-radius:8px;background:#fff;cursor:pointer">‹</button>
        <span id="planWeekLabelFS" style="font-size:12px;font-weight:600;color:var(--gris-600);min-width:200px;text-align:center"></span>
        <button onclick="planificadorSemanaSiguienteFS()" style="padding:6px 10px;border:1px solid var(--gris-300);border-radius:8px;background:#fff;cursor:pointer">›</button>
        <button onclick="planificadorHoyEnSemanaFS()" style="padding:6px 10px;border:1px solid var(--gris-300);border-radius:8px;background:#fff;cursor:pointer;font-size:12px">Hoy</button>
        <button onclick="cerrarPlanificadorFullscreen()" style="padding:6px 14px;border:none;background:#EF4444;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px">✕ Cerrar</button>
      </div>
    </div>
    <div style="padding:8px 12px;font-size:12px;color:#6B7280;background:#FFFBEB;border-bottom:1px solid #FDE68A;flex-shrink:0">
      💡 Selecciona un operario arriba y haz click en el hueco horario para crear el parte. La obra <strong>${obraTitulo}</strong> se asignará automáticamente.
    </div>
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
      <div class="plan-container" id="planContainerFS" style="flex:1;margin:0;border-radius:0;border:none;height:auto;min-height:auto">
        <div class="plan-header" id="planHeaderFS">
          <div class="plan-hours-header"></div>
          <div class="plan-days-header" id="planDaysHeaderFS"></div>
        </div>
        <div class="plan-body" style="flex:1;overflow:hidden">
          <div class="plan-hours-column" id="planHoursColumnFS"></div>
          <div class="plan-grid-container" id="planGridContainerFS" style="flex:1;overflow:auto">
            <div class="plan-grid" id="planGridFS"></div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Inicializar
  planCurrentDate = getMonday(new Date());
  await cargarConfigPlanificador();
  await cargarUsuarios();
  await cargarPartesParaPlanificador();

  // Popular filtro operarios en fullscreen
  const selFS = document.getElementById('plan-filtro-operario-fs');
  selFS.innerHTML = planUsuarios.map(u =>
    `<option value="${u.id}">${u.nombre||''} ${u.apellidos||''}</option>`
  ).join('');
  const ultimo = localStorage.getItem('plan-filtro-operario');
  if (ultimo && selFS.querySelector(`option[value="${ultimo}"]`)) {
    selFS.value = ultimo;
    planOperarioFilter = ultimo;
  } else if (planUsuarios.length > 0) {
    selFS.value = planUsuarios[0].id;
    planOperarioFilter = planUsuarios[0].id;
  }

  calcularAlturaFilasFS();
  renderPlanificadorFS();
  sincronizarScrollHorasFS();
}

function cerrarPlanificadorFullscreen() {
  planFullscreen = false;
  planObraFija = null;
  const overlay = document.getElementById('planFullscreenOverlay');
  if (overlay) overlay.remove();
  // Volver a la ficha de obra si existe
  if (typeof obraActualId !== 'undefined' && obraActualId) {
    try { abrirFichaObra(obraActualId, false); } catch(e) {}
  }
}

// ── Funciones FS (fullscreen) que usan los IDs con sufijo FS ──
function calcularAlturaFilasFS() {
  const container = document.getElementById('planContainerFS');
  const header = document.getElementById('planHeaderFS');
  if (!container || !header) {
    planHoraHeight = 28;
    return;
  }
  const available = container.clientHeight - header.offsetHeight;
  const totalRows = PLAN_HORAS_FIN - PLAN_HORAS_INICIO;
  planHoraHeight = Math.max(20, Math.floor(available / totalRows));
}

function renderPlanificadorFS() {
  calcularAlturaFilasFS();
  // Week label
  const lbl = document.getElementById('planWeekLabelFS');
  if (lbl) {
    const s = new Date(planCurrentDate);
    const e = new Date(planCurrentDate);
    e.setDate(e.getDate() + 6);
    const opts = { weekday:'long', month:'short', day:'numeric' };
    lbl.textContent = `${s.toLocaleDateString('es-ES',opts)} - ${e.toLocaleDateString('es-ES',opts)}`;
  }
  // Day headers
  renderDayHeadersTo('planDaysHeaderFS');
  // Hours column
  renderHoursColumnTo('planHoursColumnFS');
  // Grid
  renderGridTo('planGridFS');
}

function filtrarPlanificadorFS() {
  const sel = document.getElementById('plan-filtro-operario-fs');
  planOperarioFilter = sel ? sel.value : '';
  localStorage.setItem('plan-filtro-operario', planOperarioFilter);
  renderPlanificadorFS();
}
function planificadorSemanaAnteriorFS() {
  planCurrentDate.setDate(planCurrentDate.getDate() - 7);
  cargarPartesParaPlanificador().then(() => renderPlanificadorFS());
}
function planificadorSemanaSiguienteFS() {
  planCurrentDate.setDate(planCurrentDate.getDate() + 7);
  cargarPartesParaPlanificador().then(() => renderPlanificadorFS());
}
function planificadorHoyEnSemanaFS() {
  planCurrentDate = getMonday(new Date());
  cargarPartesParaPlanificador().then(() => renderPlanificadorFS());
}
function sincronizarScrollHorasFS() {
  const gc = document.getElementById('planGridContainerFS');
  const hc = document.getElementById('planHoursColumnFS');
  if (!gc || !hc) return;
  let _rafFS = 0;
  gc.addEventListener('scroll', () => {
    cancelAnimationFrame(_rafFS);
    _rafFS = requestAnimationFrame(() => { hc.scrollTop = gc.scrollTop; });
  }, { passive: true });
}

function getMonday(d) {
  d = new Date(d);
  d.setHours(0, 0, 0, 0); // ¡CRÍTICO! Normalizar a medianoche
  var day = d.getDay(),
      diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

// Calcular altura de cada fila para llenar todo el espacio disponible
function calcularAlturaFilas() {
  const totalRows = PLAN_HORAS_FIN - PLAN_HORAS_INICIO; // 24
  // Usar viewport directamente: 100vh - 200px (container) - ~65px (header días)
  const vh = window.innerHeight;
  const containerH = vh - 200;
  const headerH = 65; // altura aproximada de la cabecera de días
  const available = containerH - headerH;
  planHoraHeight = Math.max(18, Math.floor(available / totalRows));
}

// Cargar config de horario laboral y festivos desde empresa
async function cargarConfigPlanificador() {
  if (!sb || !EMPRESA) return;
  try {
    const { data } = await sb.from('empresas')
      .select('config')
      .eq('id', EMPRESA.id)
      .single();
    if (data && data.config) {
      const cfg = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      if (cfg.hora_laboral_ini != null) PLAN_HORA_LABORAL_INI = cfg.hora_laboral_ini;
      if (cfg.hora_laboral_fin != null) PLAN_HORA_LABORAL_FIN = cfg.hora_laboral_fin;
      if (Array.isArray(cfg.festivos)) planFestivos = cfg.festivos;
    }
  } catch (e) {
    console.log('Planificador: sin config especial, usando horario por defecto');
  }
}

async function cargarUsuarios() {
  if (!sb || !EMPRESA) return;
  try {
    const { data } = await sb.from('perfiles')
      .select('id,nombre,apellidos')
      .eq('empresa_id', EMPRESA.id)
      .order('nombre', { ascending: true });
    planUsuarios = data || [];
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
    const startStr = fechaLocalStr(startDate);
    const endStr = fechaLocalStr(endDate);

    // 1) Partes de la semana (todos excepto eliminado)
    const { data: semanales } = await sb.from('partes_trabajo')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .gte('fecha', startStr)
      .lt('fecha', endStr)
      .neq('estado', 'eliminado')
      .order('fecha', { ascending: true });

    // 2) TODOS los borradores (sin filtro de fecha, siempre visibles)
    const { data: borradores } = await sb.from('partes_trabajo')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .eq('estado', 'borrador')
      .order('created_at', { ascending: false });

    // Combinar sin duplicados
    const idsSemanales = new Set((semanales || []).map(p => p.id));
    const borradoresExtra = (borradores || []).filter(p => !idsSemanales.has(p.id));
    planPartesData = [...(semanales || []), ...borradoresExtra];
  } catch (e) {
    console.error('Error cargando partes:', e);
    toast('Error al cargar partes de trabajo', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SCROLL SINCRONIZADO
// ═══════════════════════════════════════════════════════════════════════

function sincronizarScrollHoras() {
  // ► Limpiar listener anterior para no acumular
  if (_planScrollCleanup) _planScrollCleanup();

  const gridContainer = document.getElementById('planGridContainer');
  const hoursCol = document.getElementById('planHoursColumn');
  if (!gridContainer || !hoursCol) return;
  let _rafScroll = 0;
  const handler = () => {
    cancelAnimationFrame(_rafScroll);
    _rafScroll = requestAnimationFrame(() => { hoursCol.scrollTop = gridContainer.scrollTop; });
  };
  gridContainer.addEventListener('scroll', handler, { passive: true });
  _planScrollCleanup = () => {
    gridContainer.removeEventListener('scroll', handler);
    _planScrollCleanup = null;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// FILTRADO — UN SOLO OPERARIO
// ═══════════════════════════════════════════════════════════════════════

function renderFiltroOperarios() {
  const sel = document.getElementById('plan-filtro-operario');
  if (!sel) return;
  sel.innerHTML = planUsuarios.map(u =>
    `<option value="${u.id}">${u.nombre||''} ${u.apellidos||''}</option>`
  ).join('');

  const ultimo = localStorage.getItem('plan-filtro-operario');
  if (ultimo && sel.querySelector(`option[value="${ultimo}"]`)) {
    sel.value = ultimo;
    planOperarioFilter = ultimo;
  } else if (planUsuarios.length > 0) {
    sel.value = planUsuarios[0].id;
    planOperarioFilter = planUsuarios[0].id;
    localStorage.setItem('plan-filtro-operario', planOperarioFilter);
  }
}

function filtrarPlanificador() {
  const sel = document.getElementById('plan-filtro-operario');
  planOperarioFilter = sel ? sel.value : '';
  localStorage.setItem('plan-filtro-operario', planOperarioFilter);
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
  // Limpiar modales huérfanos que puedan haber quedado
  ['planConfirmModal','planCrearParteModal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.remove();
  });
  // Si estamos en fullscreen, usar las funciones FS
  if (planFullscreen && document.getElementById('planFullscreenOverlay')) {
    renderPlanificadorFS();
    return;
  }
  calcularAlturaFilas();
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
  lbl.textContent = `${startDate.toLocaleDateString('es-ES', opts)} - ${endDate.toLocaleDateString('es-ES', opts)}`;
}

function renderDayHeaders() { renderDayHeadersTo('planDaysHeader'); }
function renderDayHeadersTo(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const hoyStr = fechaLocalStr(new Date());
  container.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(planCurrentDate);
    d.setDate(d.getDate() + i);
    const dayStr = fechaLocalStr(d);
    const esHoy = dayStr === hoyStr;
    const esFinde = (d.getDay() === 0 || d.getDay() === 6);
    const esFestivo = planFestivos.includes(dayStr);

    const div = document.createElement('div');
    let cls = 'plan-day-header';
    if (esHoy) cls += ' plan-today';
    if (esFinde || esFestivo) cls += ' plan-nolab-day';
    div.className = cls;

    const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase();
    const dayDate = d.getDate();
    const dayMonth = d.toLocaleDateString('es-ES', { month: 'short' });
    div.innerHTML = `<span class="plan-day-name">${dayName}</span><span class="plan-day-date">${dayDate} ${dayMonth}</span>`;
    if (esFestivo) div.innerHTML += '<span class="plan-festivo-badge">Festivo</span>';
    container.appendChild(div);
  }
}

function renderHoursColumn() { renderHoursColumnTo('planHoursColumn'); }
function renderHoursColumnTo(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let h = PLAN_HORAS_INICIO; h < PLAN_HORAS_FIN; h++) {
    const div = document.createElement('div');
    const esLaboral = (h >= PLAN_HORA_LABORAL_INI && h < PLAN_HORA_LABORAL_FIN);
    // Media-hora: h==8 → gris arriba (8:00-8:30 fuera), h==16 → gris abajo (16:30-16:59 fuera)
    const halfTop = (h === PLAN_HORA_LABORAL_INI);
    const halfBot = (h === PLAN_HORA_LABORAL_FIN - 1);
    let hourCls = 'plan-hour';
    if (!esLaboral) hourCls += ' plan-hour-nolab';
    else if (halfTop) hourCls += ' plan-hour-halfnolab-top';
    else if (halfBot) hourCls += ' plan-hour-halfnolab-bot';
    div.className = hourCls;
    div.style.height = planHoraHeight + 'px';
    div.textContent = `${h}:00`;
    container.appendChild(div);
  }
}

function renderGrid() { renderGridTo('planGrid'); }
/** Pinta una línea roja horizontal en la posición de la hora actual */
function _renderNowLine(container, hoyStr) {
  // Buscar si hoy está en la semana visible
  let todayCol = -1;
  for (let i = 0; i < 7; i++) {
    const d = new Date(planCurrentDate);
    d.setDate(d.getDate() + i);
    if (fechaLocalStr(d) === hoyStr) { todayCol = i; break; }
  }
  if (todayCol < 0) return; // hoy no está visible

  const now = new Date();
  const nowHour = now.getHours();
  const nowMin = now.getMinutes();
  if (nowHour < PLAN_HORAS_INICIO || nowHour >= PLAN_HORAS_FIN) return;

  const topPx = ((nowHour - PLAN_HORAS_INICIO) + nowMin / 60) * planHoraHeight;

  // Línea cruza TODO el calendario horizontalmente
  const line = document.createElement('div');
  line.className = 'plan-now-line';
  line.style.cssText = `position:absolute;top:${topPx}px;left:0;width:100%`;
  container.appendChild(line);

  // Auto-scroll para que la hora actual quede visible
  const scrollParent = container.closest('[style*="overflow"]') || container.parentElement;
  if (scrollParent && scrollParent.scrollHeight > scrollParent.clientHeight) {
    const scrollTarget = Math.max(0, topPx - scrollParent.clientHeight / 3);
    scrollParent.scrollTop = scrollTarget;
  }
}

function renderGridTo(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalRows = PLAN_HORAS_FIN - PLAN_HORAS_INICIO;

  // Filtrar por operario
  let partesFiltrados = planPartesData;
  if (planOperarioFilter) {
    partesFiltrados = planPartesData.filter(p => p.usuario_id === planOperarioFilter);
  }

  // Partes con hora → rejilla (excepto borradores)
  const partesParaRejilla = partesFiltrados.filter(p => p.hora_inicio && p.estado !== 'borrador');
  const partesBorradores = partesFiltrados.filter(p => p.estado === 'borrador');
  const partesSinHora = partesFiltrados.filter(p => !p.hora_inicio && p.estado !== 'borrador');
  const partesExtra = [...partesBorradores, ...partesSinHora];

  const hoyStr = fechaLocalStr(new Date());

  // ── Construir todo en un DocumentFragment (un solo DOM insert) ──
  const frag = document.createDocumentFragment();

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayDate = new Date(planCurrentDate);
    dayDate.setDate(dayDate.getDate() + dayIdx);
    const dayStr = fechaLocalStr(dayDate);
    const esHoy = dayStr === hoyStr;
    const esFinde = (dayDate.getDay() === 0 || dayDate.getDay() === 6);
    const esFestivo = planFestivos.includes(dayStr);

    for (let hourIdx = PLAN_HORAS_INICIO; hourIdx < PLAN_HORAS_FIN; hourIdx++) {
      const cell = document.createElement('div');
      const esLaboral = (hourIdx >= PLAN_HORA_LABORAL_INI && hourIdx < PLAN_HORA_LABORAL_FIN);
      const halfTop = (hourIdx === PLAN_HORA_LABORAL_INI);   // 8:00 → gris arriba (8:00-8:30)
      const halfBot = (hourIdx === PLAN_HORA_LABORAL_FIN - 1); // 16:00 → gris abajo (16:30-16:59)

      let cls = 'plan-grid-cell';
      if (esHoy) cls += ' plan-today-col';
      if (!esLaboral) cls += ' plan-cell-nolab';
      else if (halfTop && !(esFinde || esFestivo)) cls += ' plan-cell-halfnolab-top';
      else if (halfBot && !(esFinde || esFestivo)) cls += ' plan-cell-halfnolab-bot';
      if (esFinde || esFestivo) cls += ' plan-cell-finde';
      cell.className = cls;

      cell.style.cssText = `grid-column:${dayIdx+1};grid-row:${(hourIdx-PLAN_HORAS_INICIO)+1}`;

      cell.dataset.fecha = dayStr;
      cell.dataset.hora = String(hourIdx).padStart(2,'0') + ':00:00';
      cell.dataset.hourIdx = hourIdx;
      cell.dataset.nolab = (!esLaboral || esFinde || esFestivo) ? '1' : '';
      cell.dataset.motivo = esFestivo ? 'festivo' : esFinde ? 'fin de semana' : (!esLaboral ? 'fuera del horario laboral' : '');

      frag.appendChild(cell);
    }
  }

  // ── Colocar partes en la rejilla (posición absoluta) ──
  const colWidth = 100 / 7;
  partesParaRejilla.forEach(parte => {
    if (!parte.fecha) return;
    const dayIdx = getDayIndex(parte.fecha);
    if (dayIdx < 0 || dayIdx > 6) return;

    const [hIni] = parte.hora_inicio.split(':').map(Number);
    let hFin = hIni + 1, mFin = 0;
    if (parte.hora_fin) {
      const pts = parte.hora_fin.split(':').map(Number);
      hFin = pts[0]; mFin = pts[1] || 0;
    }

    const rowStart = hIni - PLAN_HORAS_INICIO;
    const rowEnd = hFin - PLAN_HORAS_INICIO + (mFin > 0 ? mFin / 60 : 0);
    if (rowStart < 0 || rowStart >= totalRows) return;

    const topPx = rowStart * planHoraHeight;
    const heightPx = Math.max((rowEnd - rowStart) * planHoraHeight, planHoraHeight);

    const el = crearElementoParte(parte, heightPx);
    el.style.cssText += `;position:absolute;top:${topPx}px;height:${heightPx}px;left:${dayIdx*colWidth}%;width:calc(${colWidth}% - 4px);margin-left:2px`;
    frag.appendChild(el);
  });

  // Mensaje vacío
  if (partesFiltrados.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'plan-empty';
    emptyEl.innerHTML = '<div style="padding:40px 20px"><div style="font-size:20px;margin-bottom:10px">📋</div><p>No hay partes de trabajo para este operario esta semana</p></div>';
    frag.appendChild(emptyEl);
  }

  // ── UN solo DOM write: limpiar + insertar todo ──
  container.style.gridTemplateRows = `repeat(${totalRows}, ${planHoraHeight}px)`;
  container.innerHTML = '';
  container.appendChild(frag);

  // ── Línea roja de hora actual (solo si hoy está visible) ──
  _renderNowLine(container, hoyStr);

  // ── Event delegation (usar asignación directa, NO addEventListener) ──
  container.onclick = (e) => {
    const cell = e.target.closest('.plan-grid-cell');
    if (!cell || e.target.closest('.plan-parte')) return;
    if (cell.dataset.nolab) toast(`⚠️ Atención: esta hora es ${cell.dataset.motivo}`, 'info');
    abrirCrearParteRapido(cell.dataset.fecha, parseInt(cell.dataset.hourIdx));
  };
  container.ondragover = (e) => {
    e.preventDefault();
    const cell = e.target.closest('.plan-grid-cell');
    if (cell) cell.classList.add('plan-cell-dragover');
  };
  container.ondragleave = (e) => {
    const cell = e.target.closest('.plan-grid-cell');
    if (cell) cell.classList.remove('plan-cell-dragover');
  };
  container.ondrop = (e) => {
    e.preventDefault();
    const cell = e.target.closest('.plan-grid-cell');
    if (!cell) return;
    cell.classList.remove('plan-cell-dragover');
    const parteId = e.dataTransfer.getData('text/plain');
    if (parteId) confirmarMoverParte(parseInt(parteId), cell.dataset.fecha, parseInt(cell.dataset.hourIdx), cell.dataset.nolab === '1');
  };

  // ── Sección extra: borradores + sin hora ──
  renderPartesSinCita(partesExtra);
}

function renderPartesSinCita(partesExtra) {
  const sinHoraContainer = document.getElementById('planSinHora');
  if (!sinHoraContainer) return;
  sinHoraContainer.innerHTML = '';
  if (partesExtra.length > 0) {
    sinHoraContainer.style.display = 'block';
    const titulo = document.createElement('h4');
    titulo.style.cssText = 'margin:0 0 10px;font-size:14px;color:#6B7280;font-weight:600';
    titulo.textContent = `📋 Partes sin cita (${partesExtra.length})`;
    sinHoraContainer.appendChild(titulo);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px';

    partesExtra.forEach(parte => {
      const card = document.createElement('div');
      const estadoInfo = PT_ESTADOS_PLAN[parte.estado] || PT_ESTADOS_PLAN.borrador;
      const horaStr = parte.hora_inicio ? parte.hora_inicio.substring(0,5) : 'Sin hora';
      card.draggable = true;
      card.style.cssText = `background:${estadoInfo.bg};border:1px solid ${estadoInfo.color}30;border-left:3px solid ${estadoInfo.color};border-radius:6px;padding:8px 10px;cursor:grab;font-size:12px`;
      card.innerHTML = `
        <div style="font-weight:600;margin-bottom:3px">${estadoInfo.ico} ${parte.trabajo_titulo || 'Sin título'}</div>
        <div style="color:#6B7280">${parte.fecha || ''} · ${horaStr} · ${parte.usuario_nombre || '—'}</div>
        <div style="margin-top:3px"><span style="background:${estadoInfo.color};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px">${estadoInfo.label}</span></div>`;
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', String(parte.id));
        card.style.opacity = '0.5';
      });
      card.addEventListener('dragend', () => { card.style.opacity = '1'; });
      card.onclick = () => { if (typeof verDetalleParte === 'function') verDetalleParte(parte.id); };
      grid.appendChild(card);
    });
    sinHoraContainer.appendChild(grid);
  } else {
    sinHoraContainer.style.display = 'none';
  }
}

// Calcular índice del día (0=lunes, 6=domingo)
function getDayIndex(fechaStr) {
  const parteDate = new Date(fechaStr + 'T00:00:00');
  const monday = new Date(planCurrentDate);
  monday.setHours(0, 0, 0, 0);
  const diffMs = parteDate.getTime() - monday.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function crearElementoParte(parte, alturaTotal) {
  const el = document.createElement('div');
  const estadoInfo = PT_ESTADOS_PLAN[parte.estado] || PT_ESTADOS_PLAN.borrador;

  el.className = 'plan-parte';
  // Fondo semitransparente: color del estado con 20% opacidad → se ve la rejilla detrás
  el.style.background = estadoInfo.color + '30';
  el.style.color = estadoInfo.color;
  el.style.borderLeft = '3px solid ' + estadoInfo.color;

  const esLibre = parte.es_parte_libre;
  const titulo = parte.trabajo_titulo || 'Sin título';
  const numero = parte.numero || '';
  const horaInicio = parte.hora_inicio ? parte.hora_inicio.substring(0, 5) : '—';
  const horaFin = parte.hora_fin ? parte.hora_fin.substring(0, 5) : '—';
  const usuario = parte.usuario_nombre || '—';
  const clienteTag = esLibre && parte.cliente_nombre ? `<small style="opacity:.8">👤 ${parte.cliente_nombre}</small>` : '';
  const libreIco = esLibre ? '📋 ' : '';

  // ── Contenido adaptable al tamaño del hueco ──
  if (alturaTotal >= 60) {
    // Grande: todo visible
    el.innerHTML = `<strong>${horaInicio}-${horaFin}</strong> ${estadoInfo.ico}<br>${libreIco}${titulo}<br><small>${usuario}</small>${clienteTag ? '<br>' + clienteTag : ''}`;
  } else if (alturaTotal >= 38) {
    // Mediano: obra + número
    el.innerHTML = `<strong>${numero || titulo}</strong> ${estadoInfo.ico}<br><small>${libreIco}${titulo}</small>`;
  } else {
    // Pequeño: solo número/obra, la hora ya se sabe por la posición
    el.innerHTML = `${estadoInfo.ico} <strong>${numero || titulo}</strong>`;
    el.style.whiteSpace = 'nowrap';
    el.style.textOverflow = 'ellipsis';
  }
  // Solo permitir arrastrar partes programados (y borradores desde abajo)
  const puedeArrastrar = (parte.estado === 'programado');
  el.title = `${numero} — ${titulo}\n${horaInicio}-${horaFin}\n${usuario}\n${estadoInfo.label}` +
    (puedeArrastrar ? '\n\n↕ Arrastra para mover' : '');

  if (puedeArrastrar) {
    el.draggable = true;
    el.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', String(parte.id));
      el.style.opacity = '0.4';
    });
    el.addEventListener('dragend', () => { el.style.opacity = '1'; });
  } else {
    el.draggable = false;
    el.style.cursor = 'pointer';
  }

  el.onclick = (e) => {
    e.stopPropagation();
    if (typeof verDetalleParte === 'function') verDetalleParte(parte.id);
  };
  return el;
}

// ═══════════════════════════════════════════════════════════════════════
// DRAG & DROP — CONFIRMACIÓN + MOVER PARTE
// ═══════════════════════════════════════════════════════════════════════

function confirmarMoverParte(parteId, nuevaFecha, nuevaHora, esNoLaboral) {
  const parte = planPartesData.find(p => p.id === parteId);
  if (!parte) return;

  const titulo = parte.trabajo_titulo || 'Sin título';
  const numero = parte.numero || '';
  const horaStr = String(nuevaHora).padStart(2, '0') + ':00';

  // Formatear fecha legible
  const fechaObj = new Date(nuevaFecha + 'T00:00:00');
  const fechaLegible = fechaObj.toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' });

  const esBorrador = parte.estado === 'borrador';
  const accion = esBorrador ? 'programar' : 'mover';
  const msg = esBorrador
    ? `¿Programar "${numero || titulo}" para el ${fechaLegible} a las ${horaStr}?\n\nEl parte pasará de Borrador a Programado.`
    : `¿Mover "${numero || titulo}" al ${fechaLegible} a las ${horaStr}?`;

  // Mostrar modal de confirmación
  mostrarConfirmacionPlan(msg, () => {
    moverParte(parteId, nuevaFecha, nuevaHora, esNoLaboral);
  });
}

function mostrarConfirmacionPlan(mensaje, onConfirm) {
  // Quitar modal anterior si existe
  const prev = document.getElementById('planConfirmModal');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = 'planConfirmModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2)';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:12px">📅 Confirmar</div>
    <div style="font-size:13px;color:#4B5563;line-height:1.5;white-space:pre-line;margin-bottom:20px">${mensaje}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="planConfirmNo" style="padding:8px 16px;border-radius:8px;border:1px solid #D1D5DB;background:#fff;cursor:pointer;font-weight:600;font-size:13px">Cancelar</button>
      <button id="planConfirmSi" style="padding:8px 16px;border-radius:8px;border:none;background:#3B82F6;color:#fff;cursor:pointer;font-weight:600;font-size:13px">Confirmar</button>
    </div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Cerrar al click fuera
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('planConfirmNo').onclick = () => overlay.remove();
  document.getElementById('planConfirmSi').onclick = () => {
    overlay.remove();
    // Separar eliminación del overlay del callback para dar tiempo a Chrome a repintar
    requestAnimationFrame(() => onConfirm());
  };
}

async function moverParte(parteId, nuevaFecha, nuevaHora, esNoLaboral) {
  if (!sb) return;

  if (esNoLaboral) {
    toast('⚠️ Parte movido a horario no laboral', 'info');
  }

  const horaStr = String(nuevaHora).padStart(2, '0') + ':00:00';

  // Calcular hora_fin manteniendo duración original
  const parte = planPartesData.find(p => p.id === parteId);
  let horaFinStr = String(nuevaHora + 1).padStart(2, '0') + ':00:00';
  if (parte && parte.hora_inicio && parte.hora_fin) {
    const [hIni, mIni] = parte.hora_inicio.split(':').map(Number);
    const [hFin, mFin] = parte.hora_fin.split(':').map(Number);
    const duracionMin = (hFin * 60 + (mFin||0)) - (hIni * 60 + (mIni||0));
    if (duracionMin > 0) {
      const nuevoFinMin = nuevaHora * 60 + duracionMin;
      const nuevoFinH = Math.min(Math.floor(nuevoFinMin / 60), 23);
      const nuevoFinM = nuevoFinMin % 60;
      horaFinStr = String(nuevoFinH).padStart(2, '0') + ':' + String(nuevoFinM).padStart(2, '0') + ':00';
    }
  }

  const updateData = {
    fecha: nuevaFecha,
    hora_inicio: horaStr,
    hora_fin: horaFinStr,
  };

  // Si era borrador, pasar a programado
  if (parte && parte.estado === 'borrador') {
    updateData.estado = 'programado';
  }

  console.log('[Planificador] Moviendo parte', parteId, 'a', nuevaFecha, horaStr, '-', horaFinStr, updateData);

  try {
    // Usar .select() para confirmar que la fila se actualizó realmente
    const { data, error } = await sb.from('partes_trabajo')
      .update(updateData)
      .eq('id', parteId)
      .eq('empresa_id', EMPRESA.id)
      .select();

    if (error) {
      toast('❌ Error al mover parte: ' + error.message, 'error');
      console.error('[Planificador] Error update:', error);
      return;
    }

    if (!data || data.length === 0) {
      toast('❌ El parte no se actualizó (sin permisos o no encontrado)', 'error');
      console.error('[Planificador] Update devolvió 0 filas. Parte ID:', parteId);
      return;
    }

    console.log('[Planificador] Update OK, datos:', data[0].fecha, data[0].hora_inicio);
    toast('✅ Parte movido correctamente', 'success');

    // Recargar datos del planificador
    await cargarPartesParaPlanificador();
    renderPlanificador();

    // También refrescar partesData global para que el detalle muestre la fecha nueva
    if (typeof loadPartes === 'function') {
      try { await loadPartes(); } catch(e) {}
    }
  } catch (e) {
    console.error('Error moviendo parte:', e);
    toast('❌ Error al mover parte', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CREAR PARTE RÁPIDO DESDE PLANIFICADOR
// ═══════════════════════════════════════════════════════════════════════

function abrirCrearParteRapido(fecha, hora) {
  // Quitar modal anterior si existe
  const prev = document.getElementById('planCrearParteModal');
  if (prev) prev.remove();

  // ── Calcular hora inicio adaptada al hueco del operario ──
  // Hora base según la celda clicada
  let iniMin = hora * 60; // minutos desde medianoche
  // Si la celda es la de las 8 (inicio jornada), ajustar a 8:30
  if (hora === PLAN_HORA_LABORAL_INI) iniMin = hora * 60 + 30;

  // Buscar partes del operario en esta fecha para evitar solapamientos
  const _partesOp = planPartesData.filter(p =>
    p.fecha === fecha &&
    p.usuario_id === planOperarioFilter &&
    p.estado !== 'borrador' &&
    p.hora_inicio
  );
  // Si hay algún parte que ocupa esta hora, empezar donde acaba
  _partesOp.forEach(p => {
    const [ph, pm] = p.hora_inicio.split(':').map(Number);
    const pIniMin = ph * 60 + (pm || 0);
    let pFinMin = pIniMin + 60; // default 1h
    if (p.hora_fin) {
      const [fh, fm] = p.hora_fin.split(':').map(Number);
      pFinMin = fh * 60 + (fm || 0);
    }
    // Si el parte ocupa la hora donde pinchamos, empezar al final de ese parte
    if (pIniMin < iniMin + 120 && pFinMin > iniMin) {
      iniMin = Math.max(iniMin, pFinMin);
    }
  });

  const horaStr = String(Math.floor(iniMin / 60)).padStart(2, '0') + ':' + String(iniMin % 60).padStart(2, '0');
  // Hora fin = inicio + 2h (duración mínima)
  const _finMin = iniMin + 120;
  const _finH = Math.min(Math.floor(_finMin / 60), 23);
  const _finM = _finMin % 60;
  const horaFinDefault = String(_finH).padStart(2, '0') + ':' + String(_finM).padStart(2, '0');
  const fechaObj = new Date(fecha + 'T00:00:00');
  const fechaLegible = fechaObj.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });

  // Obtener nombre del operario seleccionado
  const operario = planUsuarios.find(u => u.id === planOperarioFilter);
  const operarioNombre = operario ? `${operario.nombre || ''} ${operario.apellidos || ''}`.trim() : '—';

  const overlay = document.createElement('div');
  overlay.id = 'planCrearParteModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:500px;width:94%;box-shadow:0 20px 60px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">📅 Nuevo parte de trabajo</div>
    <div style="font-size:12px;color:#6B7280;margin-bottom:12px">${operarioNombre}</div>

    ${!planObraFija ? `
    <!-- Selector Con obra / Parte libre -->
    <div style="display:flex;gap:0;margin-bottom:14px;border:1px solid #D1D5DB;border-radius:8px;overflow:hidden">
      <button id="planToggleObra" onclick="planToggleTipo('obra')" style="flex:1;padding:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:#3B82F6;color:#fff;transition:all .15s">🏗️ Con obra</button>
      <button id="planToggleLibre" onclick="planToggleTipo('libre')" style="flex:1;padding:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:#F3F4F6;color:#6B7280;transition:all .15s">📋 Parte libre</button>
    </div>` : ''}

    <!-- Sección CON OBRA -->
    <div id="planSeccionObra" style="margin-bottom:12px;position:relative">
      ${planObraFija
        ? `<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Obra</label>
           <div style="padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;background:#F9FAFB">${planObraFija.titulo}</div>
           <input type="hidden" id="planNuevoObraId" value="${planObraFija.id}">
           <input type="hidden" id="planNuevoObraTitulo" value="${planObraFija.titulo}">`
        : `<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Obra *</label>
           <input type="text" id="planBuscaObra" autocomplete="off" placeholder="Buscar por número, nombre o cliente..." style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box">
           <input type="hidden" id="planNuevoObraId" value="">
           <input type="hidden" id="planNuevoObraTitulo" value="">
           <div id="planObraResults" style="position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid #D1D5DB;border-top:none;border-radius:0 0 8px 8px;max-height:180px;overflow:auto;z-index:10;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>`}
    </div>

    <!-- Sección PARTE LIBRE -->
    <div id="planSeccionLibre" style="display:none;margin-bottom:12px">
      <div style="margin-bottom:10px">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Descripción del trabajo *</label>
        <input type="text" id="planLibreDescripcion" placeholder="Ej: Reparación fuga, Instalación caldera..." style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="position:relative">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Cliente</label>
        <div style="display:flex;gap:6px">
          <div style="flex:1;position:relative">
            <input type="text" id="planBuscaCliente" autocomplete="off" placeholder="Buscar cliente..." style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box">
            <input type="hidden" id="planLibreClienteId" value="">
            <input type="hidden" id="planLibreClienteNombre" value="">
            <div id="planClienteResults" style="position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid #D1D5DB;border-top:none;border-radius:0 0 8px 8px;max-height:160px;overflow:auto;z-index:10;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
          </div>
          <button onclick="planCrearClienteRapido()" title="Crear nuevo cliente" style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:8px;background:#fff;cursor:pointer;font-size:16px;white-space:nowrap">➕</button>
        </div>
      </div>
    </div>

    <!-- Fecha y check multi-día -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div style="flex:1">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Fecha *</label>
        <input type="date" id="planNuevoFechaIni" value="${fecha}" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="padding-top:18px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;font-weight:600;color:#374151;white-space:nowrap">
          <input type="checkbox" id="planMultiDiaCheck" style="width:16px;height:16px;cursor:pointer"> Varios días
        </label>
      </div>
    </div>

    <!-- Fecha fin (solo visible en multi-día) -->
    <div id="planFechaFinWrap" style="display:none;margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Fecha fin</label>
      <input type="date" id="planNuevoFechaFin" value="${fecha}" min="${fecha}" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box">
    </div>

    <!-- Horarios (editables en día normal, bloqueados en multi-día) -->
    <div id="planHorasWrap" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px">
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Hora inicio</label>
        <input type="time" id="planNuevoHoraIni" value="${horaStr}" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Hora fin</label>
        <input type="time" id="planNuevoHoraFin" value="${horaFinDefault}" style="width:100%;padding:7px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box">
      </div>
    </div>

    <div id="planMultiDiaInfo" style="display:none;padding:8px 10px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;font-size:11.5px;color:#1E40AF;margin-bottom:12px"></div>

    <div style="margin-bottom:16px">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Instrucciones (opcional)</label>
      <textarea id="planNuevoInstrucciones" rows="2" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box" placeholder="Instrucciones para el operario..."></textarea>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="planCrearNo" style="padding:8px 16px;border-radius:8px;border:1px solid #D1D5DB;background:#fff;cursor:pointer;font-weight:600;font-size:13px">Cancelar</button>
      <button id="planCrearBorrador" style="padding:8px 16px;border-radius:8px;border:1px solid #9CA3AF;background:#F3F4F6;cursor:pointer;font-weight:600;font-size:13px;color:#374151">✏️ Borrador</button>
      <button id="planCrearProgramar" style="padding:8px 16px;border-radius:8px;border:none;background:#3B82F6;color:#fff;cursor:pointer;font-weight:600;font-size:13px">📅 Programar</button>
    </div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('planCrearNo').onclick = () => overlay.remove();
  document.getElementById('planCrearBorrador').onclick = () => crearPartesDesdeModal('borrador');
  document.getElementById('planCrearProgramar').onclick = () => crearPartesDesdeModal('programado');

  // ── Multi-día toggle ──
  const multiCheck = document.getElementById('planMultiDiaCheck');
  const fechaFinWrap = document.getElementById('planFechaFinWrap');
  const fechaIniEl = document.getElementById('planNuevoFechaIni');
  const fechaFinEl = document.getElementById('planNuevoFechaFin');
  const horaIniEl = document.getElementById('planNuevoHoraIni');
  const horaFinEl = document.getElementById('planNuevoHoraFin');
  const infoEl = document.getElementById('planMultiDiaInfo');

  function toggleMultiDia() {
    const multi = multiCheck.checked;
    fechaFinWrap.style.display = multi ? 'block' : 'none';
    if (multi) {
      // Fijar jornada completa y bloquear horas
      horaIniEl.value = '08:30';
      horaFinEl.value = '16:30';
      horaIniEl.readOnly = true;
      horaFinEl.readOnly = true;
      horaIniEl.style.background = '#F3F4F6';
      horaFinEl.style.background = '#F3F4F6';
      // Fecha fin mínimo = día siguiente
      const nextDay = new Date(fechaIniEl.value + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      fechaFinEl.min = nextDay.toISOString().split('T')[0];
      if (fechaFinEl.value <= fechaIniEl.value) {
        fechaFinEl.value = fechaFinEl.min;
      }
    } else {
      horaIniEl.readOnly = false;
      horaFinEl.readOnly = false;
      horaIniEl.style.background = '';
      horaFinEl.style.background = '';
      fechaFinEl.value = fechaIniEl.value;
    }
    actualizarInfoMultiDia();
  }

  function actualizarInfoMultiDia() {
    if (!multiCheck.checked) { infoEl.style.display = 'none'; return; }
    const fi = fechaIniEl.value, ff = fechaFinEl.value;
    if (!fi || !ff || ff <= fi) { infoEl.style.display = 'none'; return; }
    const dias = _contarDiasLaborables(fi, ff);
    infoEl.innerHTML = `📋 Se crearán <strong>${dias} partes</strong> (1 por día laborable, L-V) del ${new Date(fi+'T00:00:00').toLocaleDateString('es-ES')} al ${new Date(ff+'T00:00:00').toLocaleDateString('es-ES')}, jornada completa 08:30-16:30`;
    infoEl.style.display = 'block';
  }

  multiCheck.addEventListener('change', toggleMultiDia);
  fechaIniEl.addEventListener('change', () => { if (multiCheck.checked) { fechaFinEl.min = fechaIniEl.value; } actualizarInfoMultiDia(); });
  fechaFinEl.addEventListener('change', actualizarInfoMultiDia);

  // ── Buscador de obras (modo "Con obra") ──
  if (!planObraFija) _initBuscadorObrasModal();
}

/** Cuenta días laborables (L-V) entre dos fechas inclusive */
function _contarDiasLaborables(fechaIni, fechaFin) {
  let count = 0;
  const d = new Date(fechaIni + 'T12:00:00'); // mediodía para evitar timezone
  const end = new Date(fechaFin + 'T12:00:00');
  while (d <= end) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) count++; // L=1 ... V=5
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Devuelve array de fechas laborables (YYYY-MM-DD) entre ini y fin inclusive */
function _obtenerDiasLaborables(fechaIni, fechaFin) {
  const dias = [];
  const d = new Date(fechaIni + 'T12:00:00'); // mediodía para evitar problemas de timezone
  const end = new Date(fechaFin + 'T12:00:00');
  while (d <= end) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) { // L=1 ... V=5, excluye S=6 y D=0
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dias.push(`${yyyy}-${mm}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

/** Inicializa el buscador de obras dentro del modal */
// ─── Toggle Con obra / Parte libre ───────────────────────────────────
function planToggleTipo(tipo) {
  const secObra  = document.getElementById('planSeccionObra');
  const secLibre = document.getElementById('planSeccionLibre');
  const btnObra  = document.getElementById('planToggleObra');
  const btnLibre = document.getElementById('planToggleLibre');
  if (!secObra || !secLibre) return;

  if (tipo === 'obra') {
    secObra.style.display  = 'block';
    secLibre.style.display = 'none';
    if (btnObra)  { btnObra.style.background = '#3B82F6'; btnObra.style.color = '#fff'; }
    if (btnLibre) { btnLibre.style.background = '#F3F4F6'; btnLibre.style.color = '#6B7280'; }
    setTimeout(() => document.getElementById('planBuscaObra')?.focus(), 80);
  } else {
    secObra.style.display  = 'none';
    secLibre.style.display = 'block';
    // Limpiar selección de obra
    const obraIdEl = document.getElementById('planNuevoObraId');
    if (obraIdEl) obraIdEl.value = '';
    if (btnLibre) { btnLibre.style.background = '#8B5CF6'; btnLibre.style.color = '#fff'; }
    if (btnObra)  { btnObra.style.background = '#F3F4F6'; btnObra.style.color = '#6B7280'; }
    _initBuscadorClientesModal();
    setTimeout(() => document.getElementById('planLibreDescripcion')?.focus(), 80);
  }
}

// ─── Buscador de clientes para parte libre ────────────────────────────
function _initBuscadorClientesModal() {
  const inputBusca = document.getElementById('planBuscaCliente');
  const resultsDiv = document.getElementById('planClienteResults');
  if (!inputBusca || !resultsDiv || inputBusca._ready) return;
  inputBusca._ready = true;

  const clientesDisponibles = (typeof clientes !== 'undefined' && Array.isArray(clientes)) ? clientes : [];

  inputBusca.addEventListener('input', () => {
    const q = inputBusca.value.toLowerCase().trim();
    if (q.length < 1) { resultsDiv.style.display = 'none'; return; }

    const resultados = clientesDisponibles.filter(c => {
      return (c.nombre || '').toLowerCase().includes(q) ||
             (c.nif    || '').toLowerCase().includes(q) ||
             (c.email  || '').toLowerCase().includes(q) ||
             (c.telefono || '').toLowerCase().includes(q);
    }).slice(0, 8);

    if (resultados.length === 0) {
      resultsDiv.innerHTML = '<div style="padding:10px;color:#9CA3AF;font-size:12px">Sin resultados — usa ➕ para crear</div>';
      resultsDiv.style.display = 'block';
      return;
    }

    resultsDiv.innerHTML = resultados.map(c => `
      <div class="plan-cli-result" data-id="${c.id}" data-nombre="${(c.nombre||'').replace(/"/g,'&quot;')}"
           style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #F3F4F6;font-size:12px">
        <div style="font-weight:700;color:#1F2937">${c.nombre || '—'}</div>
        <div style="color:#6B7280;font-size:11px">${[c.telefono, c.email].filter(Boolean).join(' · ') || c.nif || ''}</div>
      </div>`).join('');
    resultsDiv.style.display = 'block';

    resultsDiv.querySelectorAll('.plan-cli-result').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = '#F5F3FF');
      el.addEventListener('mouseleave', () => el.style.background = '#fff');
      el.addEventListener('click', () => {
        document.getElementById('planLibreClienteId').value    = el.dataset.id;
        document.getElementById('planLibreClienteNombre').value = el.dataset.nombre;
        inputBusca.value = el.dataset.nombre;
        inputBusca.style.borderColor = '#8B5CF6';
        inputBusca.style.fontWeight  = '600';
        resultsDiv.style.display = 'none';
      });
    });
  });

  inputBusca.addEventListener('blur', () => {
    setTimeout(() => { resultsDiv.style.display = 'none'; }, 200);
  });
}

// ─── Crear cliente rápido desde el planificador ───────────────────────
function planCrearClienteRapido() {
  // Mini-modal inline sobre el mismo overlay
  const existente = document.getElementById('planMiniClienteModal');
  if (existente) { existente.remove(); return; }

  const mini = document.createElement('div');
  mini.id = 'planMiniClienteModal';
  mini.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center';
  const inputStyle = 'width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;box-sizing:border-box';
  const labelStyle = 'font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:4px';
  mini.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:20px;max-width:420px;width:94%;box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:800;margin-bottom:14px">➕ Nuevo cliente</div>

      <div style="margin-bottom:10px">
        <label style="${labelStyle}">Nombre *</label>
        <input id="planCliNombre" type="text" style="${inputStyle}" placeholder="Nombre o razón social">
      </div>

      <div style="margin-bottom:10px">
        <label style="${labelStyle}">Teléfonos *</label>
        <div id="phonesContainer_planCli"></div>
      </div>

      <div style="margin-bottom:10px">
        <label style="${labelStyle}">Dirección *</label>
        <input id="planCliDir" type="text" style="${inputStyle}" placeholder="Calle, número, piso...">
      </div>

      <div style="display:grid;grid-template-columns:90px 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="${labelStyle}">CP *</label>
          <input id="planCliCp" type="text" style="${inputStyle}" placeholder="46001" maxlength="5">
        </div>
        <div>
          <label style="${labelStyle}">Municipio *</label>
          <input id="planCliMun" type="text" style="${inputStyle}" placeholder="Valencia">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div>
          <label style="${labelStyle}">Provincia *</label>
          <input id="planCliProv" type="text" style="${inputStyle}" placeholder="Valencia">
        </div>
        <div>
          <label style="${labelStyle}">NIF/CIF</label>
          <input id="planCliNif" type="text" style="${inputStyle}" placeholder="12345678A">
        </div>
      </div>

      <div style="margin-bottom:14px">
        <label style="${labelStyle}">Email</label>
        <input id="planCliEmail" type="email" style="${inputStyle}" placeholder="correo@ejemplo.com">
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('planMiniClienteModal').remove()" style="padding:8px 14px;border:1px solid #D1D5DB;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600">Cancelar</button>
        <button onclick="planGuardarClienteRapido()" style="padding:8px 14px;border:none;border-radius:8px;background:#8B5CF6;color:#fff;cursor:pointer;font-size:13px;font-weight:700">Guardar cliente</button>
      </div>
    </div>`;
  document.body.appendChild(mini);
  mini.addEventListener('click', e => { if (e.target === mini) mini.remove(); });
  setTimeout(() => {
    document.getElementById('planCliNombre')?.focus();
    if (typeof _phonesInit === 'function') _phonesInit('planCli');
  }, 80);
}

async function planGuardarClienteRapido() {
  const nombre = document.getElementById('planCliNombre')?.value.trim();
  const dir    = document.getElementById('planCliDir')?.value.trim() || null;
  const cp     = document.getElementById('planCliCp')?.value.trim() || null;
  const mun    = document.getElementById('planCliMun')?.value.trim() || null;
  const prov   = document.getElementById('planCliProv')?.value.trim() || null;
  const nif    = document.getElementById('planCliNif')?.value.trim() || null;
  const email  = document.getElementById('planCliEmail')?.value.trim() || null;

  // Recoger teléfonos del componente dinámico
  const { telefono, telefonos } = (typeof _phonesGet === 'function') ? _phonesGet('planCli') : { telefono: null, telefonos: [] };

  // Validar campos obligatorios
  const errores = [];
  if (!nombre)   errores.push('nombre');
  if (!telefono) errores.push('teléfono');
  if (!dir)      errores.push('dirección');
  if (!cp)       errores.push('código postal');
  if (!mun)      errores.push('municipio');
  if (!prov)     errores.push('provincia');
  if (errores.length) {
    toast('Faltan campos obligatorios: ' + errores.join(', '), 'error');
    return;
  }

  const { data, error } = await sb.from('clientes').insert({
    empresa_id: EMPRESA.id,
    nombre,
    telefono,
    telefonos: telefonos.length ? telefonos : [],
    direccion_fiscal: dir,
    cp_fiscal: cp,
    municipio_fiscal: mun,
    provincia_fiscal: prov,
    nif,
    email
  }).select('id,nombre').single();

  if (error) { toast('Error al crear cliente: ' + error.message, 'error'); return; }

  // Añadir al array local para buscarlo inmediatamente
  if (typeof clientes !== 'undefined' && Array.isArray(clientes)) {
    clientes.push({ id: data.id, nombre: data.nombre, telefono, nif, email,
      direccion_fiscal: dir, cp_fiscal: cp, municipio_fiscal: mun, provincia_fiscal: prov });

  }

  // Seleccionar el nuevo cliente en el buscador
  document.getElementById('planLibreClienteId').value     = data.id;
  document.getElementById('planLibreClienteNombre').value = data.nombre;
  const inputBusca = document.getElementById('planBuscaCliente');
  if (inputBusca) {
    inputBusca.value = data.nombre;
    inputBusca.style.borderColor = '#8B5CF6';
    inputBusca.style.fontWeight  = '600';
  }

  document.getElementById('planMiniClienteModal')?.remove();
  toast('Cliente creado correctamente', 'success');
}

function _initBuscadorObrasModal() {
  const inputBusca = document.getElementById('planBuscaObra');
  const resultsDiv = document.getElementById('planObraResults');
  if (!inputBusca || !resultsDiv) return;

  const obrasDisponibles = (typeof trabajos !== 'undefined' && Array.isArray(trabajos))
    ? trabajos.filter(t => t.estado !== 'eliminado')
    : [];

  inputBusca.addEventListener('input', () => {
    const q = inputBusca.value.toLowerCase().trim();
    if (q.length < 1) { resultsDiv.style.display = 'none'; return; }

    const resultados = obrasDisponibles.filter(t => {
      const num = (t.numero || '').toLowerCase();
      const tit = (t.titulo || '').toLowerCase();
      const cli = (t.cliente_nombre || '').toLowerCase();
      return num.includes(q) || tit.includes(q) || cli.includes(q);
    }).slice(0, 8);

    if (resultados.length === 0) {
      resultsDiv.innerHTML = '<div style="padding:10px;color:#9CA3AF;font-size:12px">Sin resultados</div>';
      resultsDiv.style.display = 'block';
      return;
    }

    resultsDiv.innerHTML = resultados.map(t => `
      <div class="plan-obra-result" data-id="${t.id}" data-titulo="${(t.titulo||'').replace(/"/g,'&quot;')}"
           style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #F3F4F6;font-size:12px;transition:background .1s">
        <div style="font-weight:700;color:#1F2937">${t.numero || '—'} — ${t.titulo || 'Sin título'}</div>
        <div style="color:#6B7280;font-size:11px">${t.cliente_nombre || 'Sin cliente'}</div>
      </div>`).join('');
    resultsDiv.style.display = 'block';

    resultsDiv.querySelectorAll('.plan-obra-result').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = '#EFF6FF');
      el.addEventListener('mouseleave', () => el.style.background = '#fff');
      el.addEventListener('click', () => {
        document.getElementById('planNuevoObraId').value = el.dataset.id;
        document.getElementById('planNuevoObraTitulo').value = el.dataset.titulo;
        inputBusca.value = el.querySelector('div').textContent;
        inputBusca.style.borderColor = '#3B82F6';
        inputBusca.style.fontWeight = '600';
        resultsDiv.style.display = 'none';
      });
    });
  });

  inputBusca.addEventListener('blur', () => {
    setTimeout(() => { resultsDiv.style.display = 'none'; }, 200);
  });
  setTimeout(() => inputBusca.focus(), 100);
}

/** Crea uno o varios partes desde el modal (soporta multi-día) */
async function crearPartesDesdeModal(estado) {
  // Detectar modo: con obra o parte libre
  const esLibre = document.getElementById('planSeccionLibre')?.style.display !== 'none' && !planObraFija;

  const _obraIdRaw = document.getElementById('planNuevoObraId')?.value;
  const trabajo_id = _obraIdRaw ? parseInt(_obraIdRaw) : null;

  // Validaciones específicas de cada modo
  if (!esLibre && !planObraFija && !trabajo_id) {
    toast('Busca y selecciona una obra', 'error'); return;
  }
  if (esLibre) {
    const desc = document.getElementById('planLibreDescripcion')?.value.trim();
    if (!desc) { toast('Indica la descripción del trabajo', 'error'); return; }
  }

  const fechaIni = document.getElementById('planNuevoFechaIni')?.value;
  const esMultiDia = document.getElementById('planMultiDiaCheck')?.checked || false;
  const fechaFin = esMultiDia ? (document.getElementById('planNuevoFechaFin')?.value || fechaIni) : fechaIni;
  const horaIni = esMultiDia ? '08:30:00' : ((document.getElementById('planNuevoHoraIni')?.value || '08:30') + ':00');
  const horaFin = esMultiDia ? '16:30:00' : ((document.getElementById('planNuevoHoraFin')?.value || '16:30') + ':00');
  const instrucciones = document.getElementById('planNuevoInstrucciones')?.value || null;

  // Título: si es libre usa la descripción; si es obra usa el título de la obra
  const trabajo_titulo = esLibre
    ? (document.getElementById('planLibreDescripcion')?.value.trim() || 'Parte libre')
    : (document.getElementById('planNuevoObraTitulo')?.value || '');

  // Datos de cliente para parte libre
  const _clienteId  = esLibre ? (parseInt(document.getElementById('planLibreClienteId')?.value) || null) : null;
  const _clienteNom = esLibre ? (document.getElementById('planLibreClienteNombre')?.value || null) : null;

  if (!fechaIni) { toast('Selecciona una fecha', 'error'); return; }

  // Validar duración mínima 2h en día normal
  if (!esMultiDia) {
    const [hiH,hiM] = horaIni.split(':').map(Number);
    const [hfH,hfM] = horaFin.split(':').map(Number);
    const diffMins = (hfH*60+hfM) - (hiH*60+hiM);
    if (diffMins < 120) { toast('La duración mínima es de 2 horas', 'error'); return; }
    // Validar solapamiento con partes existentes del mismo operario
    const _iniM = hiH * 60 + hiM, _finM = hfH * 60 + hfM;
    const _solape = planPartesData.find(p =>
      p.fecha === fechaIni && p.usuario_id === planOperarioFilter &&
      p.estado !== 'borrador' && p.hora_inicio && (() => {
        const [a,b] = p.hora_inicio.split(':').map(Number);
        const pIni = a*60+(b||0);
        let pFin = pIni + 60;
        if (p.hora_fin) { const [c,d] = p.hora_fin.split(':').map(Number); pFin = c*60+(d||0); }
        return _iniM < pFin && _finM > pIni;
      })()
    );
    if (_solape) { toast('⚠️ Se solapa con otro parte del mismo operario (' + (_solape.hora_inicio||'').substring(0,5) + '-' + (_solape.hora_fin||'').substring(0,5) + ')', 'error'); return; }
  }

  // Calcular horas de la jornada
  const [hiH, hiM] = horaIni.split(':').map(Number);
  const [hfH, hfM] = horaFin.split(':').map(Number);
  let minsDia = (hfH * 60 + hfM) - (hiH * 60 + hiM);
  if (minsDia <= 0) minsDia = 480; // fallback 8h
  const horasDia = (minsDia / 60).toFixed(2);

  // Cerrar modal
  const modal = document.getElementById('planCrearParteModal');
  if (modal) modal.remove();

  // Operario seleccionado
  const operario = planUsuarios.find(u => u.id === planOperarioFilter);
  const usuario_id = planOperarioFilter;
  const usuario_nombre = operario ? `${operario.nombre || ''} ${operario.apellidos || ''}`.trim() : '';

  // Determinar días: si multi-día, solo laborables (L-V)
  const dias = esMultiDia ? _obtenerDiasLaborables(fechaIni, fechaFin) : [fechaIni];

  const yearStr = new Date().getFullYear();
  let creados = 0;
  let errores = 0;

  for (let i = 0; i < dias.length; i++) {
    const diaFecha = dias[i];
    const numero = `PRT-${yearStr}-${String(Date.now()).slice(-4)}${dias.length > 1 ? String.fromCharCode(65 + i) : ''}`;

    const payload = {
      empresa_id: EMPRESA.id,
      numero,
      trabajo_id: trabajo_id || null,
      trabajo_titulo,
      es_parte_libre: esLibre,
      cliente_id:     _clienteId   || null,
      cliente_nombre: _clienteNom  || null,
      usuario_id,
      usuario_nombre,
      fecha: diaFecha,
      hora_inicio: horaIni,
      hora_fin: horaFin,
      horas: horasDia,
      estado,
      instrucciones: dias.length > 1
        ? `[Día ${i + 1}/${dias.length}] ${instrucciones || ''}`
        : instrucciones,
    };

    if (estado === 'programado' && typeof CU !== 'undefined' && CU) {
      payload.programado_por = CU.id || null;
      payload.programado_por_nombre = (typeof CP !== 'undefined' && CP) ? CP.nombre || '' : '';
    }

    try {
      const { error } = await sb.from('partes_trabajo').insert(payload);
      if (error) { errores++; console.error('Error creando parte:', error); }
      else creados++;
    } catch (e) { errores++; console.error('Error:', e); }

    // Pequeña pausa entre inserts para números únicos
    if (dias.length > 1 && i < dias.length - 1) await new Promise(r => setTimeout(r, 50));
  }

  if (creados > 0) {
    toast(`✅ ${creados} parte${creados > 1 ? 's' : ''} creado${creados > 1 ? 's' : ''} como ${estado}${errores > 0 ? ` (${errores} error${errores > 1 ? 'es' : ''})` : ''}`, 'success');
  } else {
    toast('❌ Error al crear partes', 'error');
  }

  // Si fullscreen (desde ficha obra), cerrar y volver
  if (planFullscreen) {
    cerrarPlanificadorFullscreen();
    return;
  }

  // Recargar planificador
  await cargarPartesParaPlanificador();
  if (typeof loadPartes === 'function') { try { await loadPartes(); } catch(e) {} }
  renderPlanificador();
}
