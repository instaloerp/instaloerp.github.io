// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: Planificador Semanal (Weekly Scheduler) v1.2.0
// ═══════════════════════════════════════════════════════════════════════

// ─── VARIABLES GLOBALES ──────────────────────────────────────────────
let planPartesData = [];
let planCurrentDate = new Date();
let planOperarioFilter = '';
let planUsuarios = [];

// Horario visible (6:00 a 00:00 = 18 filas)
const PLAN_HORAS_INICIO = 6;
const PLAN_HORAS_FIN = 24;
const PLAN_HORA_HEIGHT = 28; // pixels por fila (cabe todo sin scroll)

// Horario laboral por defecto (se puede cambiar desde admin)
let PLAN_HORA_LABORAL_INI = 7;
let PLAN_HORA_LABORAL_FIN = 19;

// Festivos (array de strings 'YYYY-MM-DD', se carga desde config)
let planFestivos = [];

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
  renderPlanificador();
  sincronizarScrollHoras();
}

function getMonday(d) {
  d = new Date(d);
  var day = d.getDay(),
      diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
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

    // 1) Partes de la semana (todos los estados excepto eliminado)
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

    // Combinar sin duplicados (un borrador de esta semana ya sale en semanales)
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
// FILTRADO
// ═══════════════════════════════════════════════════════════════════════

function renderFiltroOperarios() {
  const sel = document.getElementById('plan-filtro-operario');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todos los operarios</option>' +
    planUsuarios.map(u => `<option value="${u.id}">${u.nombre||''} ${u.apellidos||''}</option>`).join('');
  // Restaurar última selección
  const ultimo = localStorage.getItem('plan-filtro-operario');
  if (ultimo && sel.querySelector(`option[value="${ultimo}"]`)) {
    sel.value = ultimo;
    planOperarioFilter = ultimo;
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
    div.style.height = PLAN_HORA_HEIGHT + 'px';
    div.textContent = `${h}:00`;
    container.appendChild(div);
  }
}

function renderGrid() {
  const container = document.getElementById('planGrid');
  if (!container) return;
  container.innerHTML = '';

  const totalRows = PLAN_HORAS_FIN - PLAN_HORAS_INICIO;
  container.style.gridTemplateRows = `repeat(${totalRows}, ${PLAN_HORA_HEIGHT}px)`;

  // Filtrar por operario
  let partesFiltrados = planPartesData;
  if (planOperarioFilter) {
    partesFiltrados = planPartesData.filter(p => p.usuario_id === planOperarioFilter);
  }

  // TODOS en rejilla excepto borradores sin hora
  // Borradores van abajo (sección extra)
  const partesParaRejilla = partesFiltrados.filter(p => p.hora_inicio && p.estado !== 'borrador');
  const partesBorradores = partesFiltrados.filter(p => p.estado === 'borrador');
  const partesSinHora = partesFiltrados.filter(p => !p.hora_inicio && p.estado !== 'borrador');
  const partesExtra = [...partesBorradores, ...partesSinHora];

  const hoyStr = new Date().toISOString().split('T')[0];

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

      // Click en celda vacía → aviso si fuera de horario
      cell.onclick = () => {
        if (!esLaboral || esFinde || esFestivo) {
          const motivo = esFestivo ? 'festivo' : esFinde ? 'fin de semana' : 'fuera del horario laboral';
          toast(`⚠️ Atención: esta hora es ${motivo}`, 'info');
        }
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
        if (parteId) moverParte(parseInt(parteId), dayStr, hourIdx, !esLaboral || esFinde || esFestivo);
      });

      // Partes en este slot
      const partesEnSlot = partesParaRejilla.filter(p => {
        if (p.fecha !== dayStr) return false;
        const [hStart] = p.hora_inicio.split(':').map(Number);
        return hStart === hourIdx;
      });

      partesEnSlot.forEach(parte => {
        cell.appendChild(crearElementoParte(parte));
      });

      container.appendChild(cell);
    }
  }

  // ── Sección extra: borradores + sin hora ──
  const sinHoraContainer = document.getElementById('planSinHora');
  if (sinHoraContainer) {
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

  // Mensaje vacío
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
  const estadoInfo = PT_ESTADOS_PLAN[parte.estado] || PT_ESTADOS_PLAN.borrador;

  // Drag & drop
  el.draggable = true;
  el.style.cursor = 'grab';
  el.addEventListener('dragstart', e => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', String(parte.id));
    el.style.opacity = '0.4';
  });
  el.addEventListener('dragend', () => { el.style.opacity = '1'; });

  el.innerHTML = `<strong>${horaInicio}-${horaFin}</strong> ${estadoInfo.ico}<br>${titulo}<br><small>${usuario}</small>`;
  el.title = `${titulo}\n${horaInicio}-${horaFin}\n${usuario}\n${estadoInfo.label}\n\n↕ Arrastra para mover`;

  el.onclick = (e) => {
    e.stopPropagation();
    if (typeof verDetalleParte === 'function') verDetalleParte(parte.id);
  };
  return el;
}

// ═══════════════════════════════════════════════════════════════════════
// DRAG & DROP — MOVER PARTE
// ═══════════════════════════════════════════════════════════════════════

async function moverParte(parteId, nuevaFecha, nuevaHora, esNoLaboral) {
  if (!sb) return;

  // Aviso si se mueve a horario no laboral
  if (esNoLaboral) {
    toast('⚠️ Parte movido a horario no laboral', 'info');
  }

  const horaStr = String(nuevaHora).padStart(2, '0') + ':00:00';

  // Calcular hora_fin (+1h por defecto, o mantener duración original)
  const parte = planPartesData.find(p => p.id === parteId);
  let horaFinStr = String(nuevaHora + 1).padStart(2, '0') + ':00:00';
  if (parte && parte.hora_inicio && parte.hora_fin) {
    const [hIni] = parte.hora_inicio.split(':').map(Number);
    const [hFin] = parte.hora_fin.split(':').map(Number);
    const duracion = hFin - hIni;
    if (duracion > 0) {
      horaFinStr = String(Math.min(nuevaHora + duracion, 23)).padStart(2, '0') + ':00:00';
    }
  }

  // Preparar update
  const updateData = {
    fecha: nuevaFecha,
    hora_inicio: horaStr,
    hora_fin: horaFinStr,
  };

  // Si era borrador, pasar a programado al arrastrarlo
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

    // Recargar y re-render
    await cargarPartesParaPlanificador();
    renderPlanificador();
  } catch (e) {
    console.error('Error moviendo parte:', e);
    toast('❌ Error al mover parte', 'error');
  }
}
