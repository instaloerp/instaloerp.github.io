// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: Planificador Semanal (Weekly Scheduler) v1.2.1
// ═══════════════════════════════════════════════════════════════════════

// ─── VARIABLES GLOBALES ──────────────────────────────────────────────
let planPartesData = [];
let planCurrentDate = new Date();
let planOperarioFilter = '';
let planUsuarios = [];
let planHoraHeight = 28; // se recalcula dinámicamente

// Horario visible (0:00 a 23:00 = 24 filas)
const PLAN_HORAS_INICIO = 0;
const PLAN_HORAS_FIN = 24;

// Horario laboral por defecto (se puede cambiar desde admin)
let PLAN_HORA_LABORAL_INI = 7;
let PLAN_HORA_LABORAL_FIN = 19;

// Festivos (array de strings 'YYYY-MM-DD', se carga desde config)
let planFestivos = [];

// Modo fullscreen (cuando se abre desde ficha de obra)
let planFullscreen = false;
let planObraFija = null; // { id, titulo } si se abre desde una obra

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
  planCurrentDate = getMonday(new Date());
  await cargarConfigPlanificador();
  await cargarUsuarios();
  await cargarPartesParaPlanificador();
  calcularAlturaFilas();
  renderPlanificador();
  sincronizarScrollHoras();
  // Recalcular al redimensionar ventana
  window.addEventListener('resize', () => {
    calcularAlturaFilas();
    renderPlanificador();
  });
}

// Versión fullscreen para abrir desde ficha de obra
async function abrirPlanificadorDesdeObra(obraId, obraTitulo) {
  planObraFija = { id: obraId, titulo: obraTitulo };
  planFullscreen = true;
  goPage('planificador');
  // Esperar a que se muestre la página
  setTimeout(() => {
    const page = document.getElementById('page-planificador');
    if (page) page.classList.add('plan-fullscreen');
    initPlanificador();
  }, 100);
}

function cerrarPlanificadorFullscreen() {
  planFullscreen = false;
  planObraFija = null;
  const page = document.getElementById('page-planificador');
  if (page) page.classList.remove('plan-fullscreen');
  renderPlanificador();
}

function getMonday(d) {
  d = new Date(d);
  var day = d.getDay(),
      diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Calcular altura de cada fila para llenar todo el espacio disponible
function calcularAlturaFilas() {
  const totalRows = PLAN_HORAS_FIN - PLAN_HORAS_INICIO; // 24
  // Usar viewport directamente: 100vh - 250px (container) - ~65px (header días)
  const vh = window.innerHeight;
  const containerH = vh - 250;
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
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

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
  const gridContainer = document.getElementById('planGridContainer');
  const hoursCol = document.getElementById('planHoursColumn');
  if (!gridContainer || !hoursCol) return;
  gridContainer.addEventListener('scroll', function() {
    hoursCol.scrollTop = gridContainer.scrollTop;
  });
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

function renderDayHeaders() {
  const container = document.getElementById('planDaysHeader');
  if (!container) return;
  const hoyStr = new Date().toISOString().split('T')[0];
  container.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(planCurrentDate);
    d.setDate(d.getDate() + i);
    const dayStr = d.toISOString().split('T')[0];
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

function renderHoursColumn() {
  const container = document.getElementById('planHoursColumn');
  if (!container) return;
  container.innerHTML = '';
  for (let h = PLAN_HORAS_INICIO; h < PLAN_HORAS_FIN; h++) {
    const div = document.createElement('div');
    const esLaboral = (h >= PLAN_HORA_LABORAL_INI && h < PLAN_HORA_LABORAL_FIN);
    div.className = 'plan-hour' + (esLaboral ? '' : ' plan-hour-nolab');
    div.style.height = planHoraHeight + 'px';
    div.textContent = `${h}:00`;
    container.appendChild(div);
  }
}

function renderGrid() {
  const container = document.getElementById('planGrid');
  if (!container) return;
  container.innerHTML = '';

  const totalRows = PLAN_HORAS_FIN - PLAN_HORAS_INICIO;
  container.style.gridTemplateRows = `repeat(${totalRows}, ${planHoraHeight}px)`;

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

  const hoyStr = new Date().toISOString().split('T')[0];

  // ── Generar celdas de la rejilla ──
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayDate = new Date(planCurrentDate);
    dayDate.setDate(dayDate.getDate() + dayIdx);
    const dayStr = dayDate.toISOString().split('T')[0];
    const esHoy = dayStr === hoyStr;
    const esFinde = (dayDate.getDay() === 0 || dayDate.getDay() === 6);
    const esFestivo = planFestivos.includes(dayStr);

    for (let hourIdx = PLAN_HORAS_INICIO; hourIdx < PLAN_HORAS_FIN; hourIdx++) {
      const cell = document.createElement('div');
      const esLaboral = (hourIdx >= PLAN_HORA_LABORAL_INI && hourIdx < PLAN_HORA_LABORAL_FIN);

      let cls = 'plan-grid-cell';
      if (esHoy) cls += ' plan-today-col';
      if (!esLaboral) cls += ' plan-cell-nolab';
      if (esFinde || esFestivo) cls += ' plan-cell-finde';
      cell.className = cls;

      cell.style.gridColumn = dayIdx + 1;
      cell.style.gridRow = (hourIdx - PLAN_HORAS_INICIO) + 1;

      // ── Click en celda vacía → crear nuevo parte ──
      cell.onclick = () => {
        if (!esLaboral || esFinde || esFestivo) {
          const motivo = esFestivo ? 'festivo' : esFinde ? 'fin de semana' : 'fuera del horario laboral';
          toast(`⚠️ Atención: esta hora es ${motivo}`, 'info');
        }
        abrirCrearParteRapido(dayStr, hourIdx);
      };

      // ── Drop target (drag & drop) ──
      cell.dataset.fecha = dayStr;
      cell.dataset.hora = String(hourIdx).padStart(2,'0') + ':00:00';
      cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('plan-cell-dragover'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('plan-cell-dragover'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('plan-cell-dragover');
        const parteId = e.dataTransfer.getData('text/plain');
        if (parteId) confirmarMoverParte(parseInt(parteId), dayStr, hourIdx, !esLaboral || esFinde || esFestivo);
      });

      container.appendChild(cell);
    }
  }

  // ── Colocar partes en la rejilla (posición absoluta, span múltiple) ──
  partesParaRejilla.forEach(parte => {
    if (!parte.fecha) return;
    const dayIdx = getDayIndex(parte.fecha);
    if (dayIdx < 0 || dayIdx > 6) return;

    const [hIni, mIni] = parte.hora_inicio.split(':').map(Number);
    let hFin = hIni + 1;
    let mFin = 0;
    if (parte.hora_fin) {
      const parts = parte.hora_fin.split(':').map(Number);
      hFin = parts[0];
      mFin = parts[1] || 0;
    }

    const rowStart = hIni - PLAN_HORAS_INICIO;
    const rowEnd = hFin - PLAN_HORAS_INICIO + (mFin > 0 ? mFin / 60 : 0);
    if (rowStart < 0 || rowStart >= totalRows) return;

    const topPx = rowStart * planHoraHeight;
    const heightPx = Math.max((rowEnd - rowStart) * planHoraHeight, planHoraHeight);

    const el = crearElementoParte(parte, heightPx);
    el.style.position = 'absolute';
    el.style.top = topPx + 'px';
    el.style.height = heightPx + 'px';
    const colWidth = 100 / 7;
    el.style.left = (dayIdx * colWidth) + '%';
    el.style.width = 'calc(' + colWidth + '% - 4px)';
    el.style.marginLeft = '2px';

    container.appendChild(el);
  });

  // ── Sección extra: borradores + sin hora ──
  renderPartesSinCita(partesExtra);

  // Mensaje vacío
  if (partesFiltrados.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'plan-empty';
    emptyEl.innerHTML = '<div style="padding:40px 20px"><div style="font-size:20px;margin-bottom:10px">📋</div><p>No hay partes de trabajo para este operario esta semana</p></div>';
    container.appendChild(emptyEl);
  }
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
  const mondayTime = new Date(planCurrentDate).getTime();
  const diffMs = parteDate.getTime() - mondayTime;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function crearElementoParte(parte, alturaTotal) {
  const el = document.createElement('div');
  const estadoInfo = PT_ESTADOS_PLAN[parte.estado] || PT_ESTADOS_PLAN.borrador;

  el.className = 'plan-parte';
  el.style.background = estadoInfo.color;
  el.style.color = '#fff';
  el.style.borderRadius = '5px';
  el.style.padding = '2px 5px';
  el.style.fontSize = '10px';
  el.style.fontWeight = '600';
  el.style.overflow = 'hidden';
  el.style.cursor = 'grab';
  el.style.zIndex = '2';
  el.style.boxSizing = 'border-box';
  el.style.borderLeft = '3px solid rgba(0,0,0,.2)';

  const titulo = parte.trabajo_titulo || 'Sin título';
  const numero = parte.numero || '';
  const horaInicio = parte.hora_inicio ? parte.hora_inicio.substring(0, 5) : '—';
  const horaFin = parte.hora_fin ? parte.hora_fin.substring(0, 5) : '—';
  const usuario = parte.usuario_nombre || '—';

  // ── Contenido adaptable al tamaño del hueco ──
  if (alturaTotal >= 60) {
    // Grande: todo visible
    el.innerHTML = `<strong>${horaInicio}-${horaFin}</strong> ${estadoInfo.ico}<br>${titulo}<br><small>${usuario}</small>`;
  } else if (alturaTotal >= 38) {
    // Mediano: obra + número
    el.innerHTML = `<strong>${numero || titulo}</strong> ${estadoInfo.ico}<br><small>${titulo}</small>`;
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
    onConfirm();
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

  try {
    const { error } = await sb.from('partes_trabajo')
      .update(updateData)
      .eq('id', parteId);

    if (error) {
      toast('❌ Error al mover parte: ' + error.message, 'error');
      return;
    }

    toast('✅ Parte movido correctamente', 'success');
    await cargarPartesParaPlanificador();
    renderPlanificador();
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

  const horaStr = String(hora).padStart(2, '0') + ':00';
  const horaFinStr = String(hora + 1).padStart(2, '0') + ':00';
  const fechaObj = new Date(fecha + 'T00:00:00');
  const fechaLegible = fechaObj.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });

  // Obtener nombre del operario seleccionado
  const operario = planUsuarios.find(u => u.id === planOperarioFilter);
  const operarioNombre = operario ? `${operario.nombre || ''} ${operario.apellidos || ''}`.trim() : '—';

  // Preparar opciones de obras
  const obrasOptions = (typeof trabajos !== 'undefined' && Array.isArray(trabajos))
    ? trabajos.filter(t => t.estado !== 'eliminado' && t.estado !== 'completada').map(t =>
        `<option value="${t.id}" data-titulo="${(t.titulo||'').replace(/"/g,'&quot;')}">${t.numero || ''} — ${t.titulo || 'Sin título'}</option>`
      ).join('')
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'planCrearParteModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:440px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.2)';
  box.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">📅 Nuevo parte de trabajo</div>
    <div style="font-size:12px;color:#6B7280;margin-bottom:16px">${fechaLegible} · ${horaStr}-${horaFinStr} · ${operarioNombre}</div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Obra *</label>
      <select id="planNuevoObra" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px">
        <option value="">Selecciona una obra...</option>
        ${planObraFija
          ? `<option value="${planObraFija.id}" selected>${planObraFija.titulo}</option>`
          : obrasOptions}
      </select>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Instrucciones (opcional)</label>
      <textarea id="planNuevoInstrucciones" rows="2" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:13px;resize:vertical" placeholder="Instrucciones para el operario..."></textarea>
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
  document.getElementById('planCrearBorrador').onclick = () => {
    crearParteDesdeplanificador(fecha, hora, 'borrador');
  };
  document.getElementById('planCrearProgramar').onclick = () => {
    crearParteDesdeplanificador(fecha, hora, 'programado');
  };
}

async function crearParteDesdeplanificador(fecha, hora, estado) {
  const selObra = document.getElementById('planNuevoObra');
  const instrucciones = document.getElementById('planNuevoInstrucciones');

  const trabajo_id = parseInt(selObra?.value);
  if (!trabajo_id) {
    toast('Selecciona una obra', 'error');
    return;
  }

  // Obtener titulo de la obra
  const selOption = selObra.options[selObra.selectedIndex];
  let trabajo_titulo = selOption?.dataset?.titulo || selOption?.textContent || '';
  // Limpiar — quitar número si tiene formato "NUM — TITULO"
  if (trabajo_titulo.includes(' — ')) {
    trabajo_titulo = trabajo_titulo.split(' — ').slice(1).join(' — ');
  }

  const horaIni = String(hora).padStart(2, '0') + ':00:00';
  const horaFin = String(hora + 1).padStart(2, '0') + ':00:00';

  // Operario seleccionado
  const operario = planUsuarios.find(u => u.id === planOperarioFilter);
  const usuario_id = planOperarioFilter;
  const usuario_nombre = operario ? `${operario.nombre || ''} ${operario.apellidos || ''}`.trim() : '';

  // Generar número
  const yearStr = new Date().getFullYear();
  const numero = `PRT-${yearStr}-${String(Date.now()).slice(-4)}`;

  const payload = {
    empresa_id: EMPRESA.id,
    numero,
    trabajo_id,
    trabajo_titulo,
    usuario_id,
    usuario_nombre,
    fecha,
    hora_inicio: horaIni,
    hora_fin: horaFin,
    horas: '1.00',
    estado,
    instrucciones: instrucciones?.value || null,
  };

  // Si se programa, guardar quién programó
  if (estado === 'programado' && typeof CU !== 'undefined' && CU) {
    payload.programado_por = CU.id || null;
    payload.programado_por_nombre = (typeof CP !== 'undefined' && CP) ? CP.nombre || '' : '';
  }

  try {
    const { error } = await sb.from('partes_trabajo').insert(payload);
    if (error) {
      toast('❌ Error: ' + error.message, 'error');
      return;
    }

    // Cerrar modal
    const modal = document.getElementById('planCrearParteModal');
    if (modal) modal.remove();

    toast(`✅ Parte ${numero} creado como ${estado}`, 'success');

    // Recargar
    await cargarPartesParaPlanificador();
    // También recargar lista de partes global si existe
    if (typeof loadPartes === 'function') {
      try { await loadPartes(); } catch(e) {}
    }
    renderPlanificador();
  } catch (e) {
    console.error('Error creando parte:', e);
    toast('❌ Error al crear parte', 'error');
  }
}
