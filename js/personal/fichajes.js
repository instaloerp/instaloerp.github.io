/**
 * MÓDULO FICHAJES v2 — Geofencing + Ausencias + Timeline Admin
 * Clock in/out automático por geolocalización, ausencias, timeline visual
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let fichajes = [];
let fichajeFiltro = { usuario_id: null, mes: null };
let timerInterval = null;
let fichajeFiltroMes = null;
let fichajeActualFecha = new Date().toISOString().split('T')[0];
let _ficAusencias = [];
let _ficCalLaboral = [];
let _ficGeoWatchId = null;
let _ficGeoNotificado = false; // evitar notificar repetidas veces
let _ficVista = 'fichajes';   // 'fichajes' | 'ausencias' | 'timeline' | 'calendario'

// Tipos de calendario laboral (configurables por empresa)
const _CAL_TIPOS_DEFAULT = [
  // — Festivos —
  { clave: 'festivo', nombre: 'Festivo nacional/autonómico', emoji: '🔴', color: '#DC2626', bg: '#FEE2E2' },
  { clave: 'festivo_local', nombre: 'Festivo local', emoji: '📍', color: '#EA580C', bg: '#FFEDD5' },
  // — Convenio siderometal Lugo —
  { clave: 'convenio', nombre: 'Día de convenio', emoji: '📋', color: '#7C3AED', bg: '#EDE9FE' },
  // — Vacaciones y cierre —
  { clave: 'vacaciones_empresa', nombre: 'Vacaciones empresa (cierre)', emoji: '🏖️', color: '#10B981', bg: '#D1FAE5', consume_vacaciones: true },
  { clave: 'vacaciones_personal', nombre: 'Vacaciones personales', emoji: '🌴', color: '#059669', bg: '#ECFDF5', consume_vacaciones: true },
  // — Jornada especial —
  { clave: 'puente', nombre: 'Puente', emoji: '🌉', color: '#0891B2', bg: '#CFFAFE' },
  { clave: 'medio_dia', nombre: 'Jornada reducida / Medio día', emoji: '🕐', color: '#D97706', bg: '#FEF3C7' },
  { clave: 'inhabil', nombre: 'Inhábil', emoji: '⛔', color: '#4B5563', bg: '#F3F4F6' },
  { clave: 'horas_cero', nombre: 'Horas cero', emoji: '0️⃣', color: '#374151', bg: '#F3F4F6' },
  { clave: 'libre_disposicion', nombre: 'Libre disposición', emoji: '🙋', color: '#0D9488', bg: '#CCFBF1' },
  // — Permisos retribuidos (Art.32 convenio siderometal Lugo) —
  { clave: 'permiso', nombre: 'Permiso retribuido', emoji: '📄', color: '#6D28D9', bg: '#F5F3FF', requiere_desc: true },
  // — Otros —
  { clave: 'otro', nombre: 'Otro', emoji: '📝', color: '#9CA3AF', bg: '#F9FAFB' },
];

// Subtipos de permisos según Art.32 Convenio Siderometal Lugo
const _PERMISOS_CONVENIO = [
  { clave: 'fallecimiento_conyuge_hijos', nombre: 'Fallecimiento cónyuge/hijos', dias: '7 días naturales' },
  { clave: 'fallecimiento_padres', nombre: 'Fallecimiento padres', dias: '4 días (5 con desplazamiento)' },
  { clave: 'fallecimiento_otros', nombre: 'Fallecimiento abuelos/suegros/nietos/cuñados/hermanos', dias: '2 días (4 con desplazamiento)' },
  { clave: 'fallecimiento_tios', nombre: 'Fallecimiento tíos (consanguinidad)', dias: '1 día' },
  { clave: 'hospitalizacion', nombre: 'Hospitalización/enfermedad grave familiar', dias: '5 días naturales (RDL 5/2023)' },
  { clave: 'matrimonio_propio', nombre: 'Matrimonio propio / Registro pareja de hecho', dias: '15 días naturales' },
  { clave: 'matrimonio_familiar', nombre: 'Matrimonio hijos/hermanos', dias: '1 día (+1 con desplazamiento)' },
  { clave: 'mudanza', nombre: 'Mudanza (cambio domicilio)', dias: '1 día laborable' },
  { clave: 'consulta_medica', nombre: 'Consulta médica', dias: 'Tiempo necesario (máx 20h/año cabecera)' },
  { clave: 'examen_prenatal', nombre: 'Exámenes prenatales', dias: 'Tiempo necesario' },
  { clave: 'fuerza_mayor', nombre: 'Fuerza mayor familiar', dias: '4 días/año retribuidos' },
  { clave: 'deber_publico', nombre: 'Deber público inescusable', dias: 'Tiempo indispensable' },
  { clave: 'lactancia', nombre: 'Permiso lactancia', dias: '1h/día hasta 9 meses (acumulable)' },
  { clave: 'nacimiento', nombre: 'Nacimiento/adopción (suspensión)', dias: '16 semanas' },
  { clave: 'permiso_parental', nombre: 'Permiso parental (hasta 8 años)', dias: '8 semanas' },
  { clave: 'formacion', nombre: 'Permiso individual formación (PIF)', dias: '20h/año acumulables 5 años' },
  { clave: 'otro_permiso', nombre: 'Otro permiso', dias: '' },
];

function _calGetTipos() {
  return (EMPRESA?.config?.tipos_calendario?.length > 0) ? EMPRESA.config.tipos_calendario : _CAL_TIPOS_DEFAULT;
}

function _calTipoInfo(clave) {
  const tipos = _calGetTipos();
  return tipos.find(t => t.clave === clave) || { clave, nombre: clave, emoji: '📝', color: '#9CA3AF', bg: '#F9FAFB' };
}

// Toggle subtipo permiso en modal calendario
function _calTipoChange() {
  const tipo = document.getElementById('cal_tipo')?.value;
  const wrap = document.getElementById('cal_permiso_wrap');
  if (wrap) wrap.style.display = (tipo === 'permiso') ? '' : 'none';
}

// Radio de geofence en metros
const _FIC_GEOFENCE_RADIO = 500;

// ═══════════════════════════════════════════════
//  CARGAR DATOS
// ═══════════════════════════════════════════════
async function loadFichajes() {
  if (!EMPRESA || !EMPRESA.id) return;
  const ahora = new Date();
  const mesActual = ahora.toISOString().slice(0, 7);
  const ultimoDia = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();

  let query = sb.from('fichajes')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', mesActual + '-01')
    .lte('fecha', mesActual + '-' + String(ultimoDia).padStart(2, '0'))
    .order('fecha', { ascending: false })
    .order('hora_entrada', { ascending: false });

  if (!CP.es_superadmin && CP.rol !== 'admin') {
    query = query.eq('usuario_id', CU.id);
  }

  const { data } = await query;
  fichajes = data || [];

  // Cargar ausencias
  await _ficCargarAusencias();

  renderFichajes();
  iniciarTimer();

  // Iniciar geofencing si es operario
  if (CP.rol === 'operario' || (!CP.es_superadmin && CP.rol !== 'admin')) {
    _ficIniciarGeofencing();
  }
}

async function _ficCargarAusencias() {
  let q = sb.from('ausencias').select('*').eq('empresa_id', EMPRESA.id).order('fecha_inicio', { ascending: false });
  if (!CP.es_superadmin && CP.rol !== 'admin') {
    q = q.eq('usuario_id', CU.id);
  }
  const { data } = await q;
  _ficAusencias = data || [];
}

async function _ficCargarCalendario() {
  const anio = new Date().getFullYear();
  const { data } = await sb.from('calendario_laboral')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`)
    .order('fecha');
  _ficCalLaboral = data || [];
}

// ═══════════════════════════════════════════════
//  RENDERIZAR VISTA PRINCIPAL
// ═══════════════════════════════════════════════
function renderFichajes() {
  const container = document.getElementById('page-fichajes');
  if (!container) return;
  const esAdmin = CP.es_superadmin || CP.rol === 'admin';
  _ficRenderFichajes(container, esAdmin);
}

// Funciones de carga para cada página independiente del sidebar
async function loadAusencias() {
  if (!EMPRESA || !EMPRESA.id) return;
  await _ficCargarAusencias();
  if (_ficCalLaboral.length === 0) await _ficCargarCalendario();
  const container = document.getElementById('page-ausencias');
  if (!container) return;
  const esAdmin = CP.es_superadmin || CP.rol === 'admin';
  _ficRenderAusencias(container, esAdmin);
}

async function loadTimeline() {
  if (!EMPRESA || !EMPRESA.id) return;
  await _ficCargarTimelineData();
  const container = document.getElementById('page-timeline');
  if (!container) return;
  _ficRenderTimeline(container);
}

async function loadCalendarioLaboral() {
  if (!EMPRESA || !EMPRESA.id) return;
  await _ficCargarCalendario();
  const container = document.getElementById('page-calendario-laboral');
  if (!container) return;
  _ficRenderCalendario(container);
}

// ═══════════════════════════════════════════════
//  VISTA FICHAJES (operario + admin)
// ═══════════════════════════════════════════════
function _ficRenderFichajes(container, esAdmin) {
  const hoy = new Date().toISOString().split('T')[0];
  const fichajesHoy = fichajes.filter(f => f.fecha === hoy && f.usuario_id === CU.id);
  const horasHoy = fichajesHoy.reduce((sum, f) => sum + (parseFloat(f.horas_total) || 0), 0);

  const hace7dias = new Date();
  hace7dias.setDate(hace7dias.getDate() - 7);
  const semanaInicio = hace7dias.toISOString().split('T')[0];
  const misFichajes = fichajes.filter(f => f.usuario_id === CU.id);
  const fichajesSemana = misFichajes.filter(f => f.fecha >= semanaInicio);
  const horasSemana = fichajesSemana.reduce((sum, f) => sum + (parseFloat(f.horas_total) || 0), 0);

  const mesActual = new Date().toISOString().slice(0, 7);
  const fichajesMes = misFichajes.filter(f => f.fecha.startsWith(mesActual));
  const horasMes = fichajesMes.reduce((sum, f) => sum + (parseFloat(f.horas_total) || 0), 0);

  const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida && f.usuario_id === CU.id);
  const estaSinFichar = !fichajePendiente;
  const textoEstado = estaSinFichar ? '❌ Sin fichar' : '✅ Trabajando';
  const tiempoTranscurrido = fichajePendiente ? calcularTiempoTranscurrido(fichajePendiente.hora_entrada) : '';

  // Solo mostrar botón fichar si NO es admin puro (admin no ficha)
  const mostrarBotonFichar = !esAdmin || CP.rol === 'operario';

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2 style="font-size:17px;font-weight:800">Fichajes</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">Control de jornada laboral</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="exportFichajes()">📊 Excel</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Horas hoy</div>
        <div style="font-size:26px;font-weight:800;color:var(--azul)">${horasHoy.toFixed(1)}h</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Horas semana</div>
        <div style="font-size:26px;font-weight:800;color:var(--verde)">${horasSemana.toFixed(1)}h</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Horas mes</div>
        <div style="font-size:26px;font-weight:800;color:var(--naranja)">${horasMes.toFixed(1)}h</div>
      </div>
      <div class="card" style="padding:14px;text-align:center;border:2px solid ${estaSinFichar?'var(--rojo-light)':'var(--verde-light)'}">
        <div style="font-size:11px;color:${estaSinFichar ? 'var(--rojo)' : 'var(--verde)'};margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">${textoEstado}</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px" id="fichajeEstadoTiempo">${tiempoTranscurrido}</div>
      </div>
    </div>

    ${mostrarBotonFichar ? `
    <!-- BOTÓN FICHAR -->
    <div style="margin-bottom:20px">
      <button class="btn ${estaSinFichar ? 'btn-success' : 'btn-danger'}" style="width:100%;padding:18px;font-size:16px;font-weight:800" onclick="_ficMostrarModalFichar(${estaSinFichar ? 'true' : 'false'})">
        ${estaSinFichar ? '🟢 FICHAR ENTRADA' : '🔴 FICHAR SALIDA'}
      </button>
      <div id="ficGeoStatus" style="text-align:center;font-size:11px;color:var(--gris-400);margin-top:6px"></div>
    </div>` : ''}

    <!-- FILTROS -->
    <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
      ${esAdmin ? `
        <select id="ficFiltroUsuario" onchange="filtrarFichajes()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
          <option value="">Todos los empleados</option>
          ${_ficOptsUsuarios()}
        </select>
      ` : ''}
      <select id="ficFiltroMes" onchange="filtrarFichajes()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
        <option value="">Mes actual</option>
        ${_getFicMesesOpciones()}
      </select>
    </div>

    <!-- TABLA HISTORIAL -->
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--gris-50);border-bottom:1.5px solid var(--gris-200)">
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Fecha</th>
            ${esAdmin ? '<th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Empleado</th>' : ''}
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Entrada</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Salida</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Horas</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Origen</th>
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Notas</th>
            ${esAdmin ? '<th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Acciones</th>' : ''}
          </tr>
        </thead>
        <tbody>${renderTablaFichajes()}</tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function _ficOptsUsuarios() {
  const uids = [...new Set(fichajes.map(f => f.usuario_id))];
  return uids.map(uid => {
    const nombre = fichajes.find(f => f.usuario_id === uid)?.usuario_nombre || 'Usuario';
    return `<option value="${uid}">${nombre}</option>`;
  }).join('');
}

function renderTablaFichajes() {
  const esAdmin = CP.es_superadmin || CP.rol === 'admin';
  const agrupado = {};
  fichajes.forEach(f => {
    if (!agrupado[f.fecha]) agrupado[f.fecha] = [];
    agrupado[f.fecha].push(f);
  });

  let html = '';
  Object.keys(agrupado).sort().reverse().forEach(fecha => {
    const items = agrupado[fecha];
    const fechaObj = new Date(fecha + 'T00:00:00');
    const fechaFormato = fechaObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

    items.forEach((f, idx) => {
      const horasTotal = f.horas_total ? parseFloat(f.horas_total).toFixed(2) : '—';
      const entrada = f.hora_entrada ? f.hora_entrada.slice(0, 5) : '—';
      const salida = f.hora_salida ? f.hora_salida.slice(0, 5) : '<span style="color:var(--verde)">abierto</span>';
      const origen = f.origen === 'geofence' ? '<span style="font-size:10px;background:var(--verde-light);color:var(--verde);padding:2px 6px;border-radius:4px">📍 GPS</span>'
                   : f.origen === 'auto' ? '<span style="font-size:10px;background:var(--azul-light);color:var(--azul);padding:2px 6px;border-radius:4px">🤖 Auto</span>'
                   : '<span style="font-size:10px;background:var(--gris-100);color:var(--gris-500);padding:2px 6px;border-radius:4px">✋ Manual</span>';

      html += `
        <tr style="border-bottom:1px solid var(--gris-100)">
          <td style="padding:10px 16px;font-size:12px">${idx === 0 ? `<strong>${fechaFormato}</strong>` : ''}</td>
          ${esAdmin ? `<td style="padding:10px 16px;font-size:12px">${f.usuario_nombre || '—'}</td>` : ''}
          <td style="padding:10px 16px;font-size:12px;text-align:center;font-weight:600">${entrada}</td>
          <td style="padding:10px 16px;font-size:12px;text-align:center;font-weight:600">${salida}</td>
          <td style="padding:10px 16px;font-size:12px;text-align:center;font-weight:700">${horasTotal}h</td>
          <td style="padding:10px 16px;text-align:center">${origen}</td>
          <td style="padding:10px 16px;font-size:12px;color:var(--gris-500)">${f.notas || f.observaciones || '—'}</td>
          ${esAdmin ? `
            <td style="padding:10px 16px;text-align:right">
              <button class="btn btn-ghost btn-sm" onclick="editFichaje(${f.id})">✏️</button>
              <button class="btn btn-ghost btn-sm" onclick="delFichaje(${f.id})">🗑️</button>
            </td>
          ` : ''}
        </tr>
      `;
    });
  });

  const cols = (CP.es_superadmin || CP.rol === 'admin') ? 8 : 6;
  return html || `<tr><td colspan="${cols}" style="padding:40px;text-align:center;color:var(--gris-400)"><div class="empty"><div class="ei">📝</div><p>Sin fichajes este mes</p></div></td></tr>`;
}

// ═══════════════════════════════════════════════
//  MODAL FICHAR (entrada/salida con detalles)
// ═══════════════════════════════════════════════
function _ficMostrarModalFichar(esEntrada) {
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
  const titulo = esEntrada ? '🟢 Fichar Entrada' : '🔴 Fichar Salida';

  // Obtener trabajos del día para el operario
  const hoy = ahora.toISOString().split('T')[0];
  const misTrabajos = (typeof trabajos !== 'undefined' ? trabajos : [])
    .filter(t => t.estado !== 'eliminado' && t.estado !== 'completado');
  const optsTrabajo = misTrabajos.map(t =>
    `<option value="${t.id}">${t.referencia || ''} — ${(t.nombre || t.descripcion || '').substring(0, 40)}</option>`
  ).join('');

  const inner = document.getElementById('mFichaje')?.querySelector('.modal');
  if (!inner) return;

  inner.innerHTML = `
    <div class="modal-h"><span>${esEntrada?'🟢':'🔴'}</span><h2>${titulo}</h2><button class="btn btn-ghost btn-icon" onclick="closeModal('mFichaje')">✕</button></div>
    <div class="modal-b">
      <input type="hidden" id="fic_tipo" value="${esEntrada ? 'entrada' : 'salida'}">
      <div style="display:flex;flex-direction:column;gap:11px">
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Hora</label>
            <input type="time" id="fic_hora_fichar" value="${horaActual}">
          </div>
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Trabajo / Obra</label>
            <select id="fic_trabajo_id">
              <option value="">— Sin asignar —</option>
              ${optsTrabajo}
            </select>
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Notas</label>
            <input type="text" id="fic_notas_fichar" placeholder="Notas opcionales...">
          </div>
        </div>
        <div id="ficGeoInfo" style="font-size:11px;color:var(--gris-400);padding:8px 0">
          📍 Obteniendo ubicación...
        </div>
      </div>
    </div>
    <div class="modal-f">
      <button class="btn btn-secondary" onclick="closeModal('mFichaje')">Cancelar</button>
      <button class="btn ${esEntrada?'btn-success':'btn-danger'}" onclick="_ficGuardarFichaje()">
        ${esEntrada ? '🟢 Fichar Entrada' : '🔴 Fichar Salida'}
      </button>
    </div>
  `;

  openModal('mFichaje', true);

  // Obtener GPS
  _ficObtenerGPS().then(pos => {
    const geoInfo = document.getElementById('ficGeoInfo');
    if (geoInfo && pos) {
      geoInfo.innerHTML = `📍 GPS: ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)} (±${pos.accuracy.toFixed(0)}m)`;
      geoInfo.dataset.lat = pos.latitude;
      geoInfo.dataset.lon = pos.longitude;
      geoInfo.dataset.accuracy = pos.accuracy;
    } else if (geoInfo) {
      geoInfo.innerHTML = '⚠️ No se pudo obtener ubicación GPS';
    }
  });
}

async function _ficGuardarFichaje() {
  const tipo = document.getElementById('fic_tipo')?.value;
  const hora = document.getElementById('fic_hora_fichar')?.value;
  const trabajoId = document.getElementById('fic_trabajo_id')?.value || null;
  const notas = document.getElementById('fic_notas_fichar')?.value || '';
  const geoInfo = document.getElementById('ficGeoInfo');
  const lat = geoInfo?.dataset.lat ? parseFloat(geoInfo.dataset.lat) : null;
  const lon = geoInfo?.dataset.lon ? parseFloat(geoInfo.dataset.lon) : null;
  const accuracy = geoInfo?.dataset.accuracy ? parseInt(geoInfo.dataset.accuracy) : null;

  if (!hora) { toast('Indica la hora', 'error'); return; }

  const hoy = new Date().toISOString().split('T')[0];
  const horaCompleta = hora + ':00';

  if (tipo === 'entrada') {
    const { error } = await sb.from('fichajes').insert({
      empresa_id: EMPRESA.id,
      usuario_id: CU.id,
      usuario_nombre: CP.nombre || '',
      fecha: hoy,
      hora_entrada: horaCompleta,
      tipo: 'entrada',
      latitud: lat, longitud: lon,
      latitud_entrada: lat, longitud_entrada: lon,
      precision_gps: accuracy,
      trabajo_id: trabajoId ? Number(trabajoId) : null,
      notas,
      origen: 'manual',
      dispositivo: navigator.userAgent.substring(0, 100)
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Entrada registrada ✓', 'success');
  } else {
    // Buscar fichaje pendiente
    const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida && f.usuario_id === CU.id);
    if (!fichajePendiente) { toast('No hay entrada abierta para hoy', 'error'); return; }

    const horasTrabajadas = calcularHorasEntre(fichajePendiente.hora_entrada, horaCompleta);

    await sb.from('fichajes').update({
      hora_salida: horaCompleta,
      horas_total: horasTrabajadas,
      latitud_salida: lat,
      longitud_salida: lon,
      notas: [fichajePendiente.notas, notas].filter(Boolean).join(' | ')
    }).eq('id', fichajePendiente.id);

    toast('Salida registrada ✓', 'success');
  }

  closeModal('mFichaje');
  await loadFichajes();
}

// Mantener compatibilidad con botones viejos
async function toggleEntrada() { _ficMostrarModalFichar(true); }
async function toggleSalida() { _ficMostrarModalFichar(false); }

// ═══════════════════════════════════════════════
//  GEOFENCING — Detectar proximidad a obra/cliente
// ═══════════════════════════════════════════════
async function _ficIniciarGeofencing() {
  if (!navigator.geolocation) return;
  if (_ficGeoWatchId) return; // ya activo

  // Registrar background sync en SW si disponible
  _ficRegistrarBackgroundGeo();

  _ficGeoWatchId = navigator.geolocation.watchPosition(
    pos => _ficEvaluarGeofence(pos.coords),
    err => {
      const el = document.getElementById('ficGeoStatus');
      if (el) el.textContent = '⚠️ GPS no disponible';
    },
    { enableHighAccuracy: true, maximumAge: 60000, timeout: 30000 }
  );

  const el = document.getElementById('ficGeoStatus');
  if (el) el.textContent = '📍 Geofencing activo — detectando ubicación...';
}

async function _ficEvaluarGeofence(coords) {
  const { latitude, longitude, accuracy } = coords;
  const hoy = new Date().toISOString().split('T')[0];

  // No evaluar si precisión > 200m (GPS pobre)
  if (accuracy > 200) return;

  const el = document.getElementById('ficGeoStatus');
  if (el) el.textContent = `📍 GPS activo (±${accuracy.toFixed(0)}m)`;

  // Obtener obras del día con coordenadas
  const obrasConGPS = await _ficObtenerUbicacionesObras();
  if (!obrasConGPS.length) return;

  // Calcular distancia a cada obra
  let obraCercana = null;
  let distanciaMin = Infinity;

  for (const obra of obrasConGPS) {
    const dist = _ficDistanciaMetros(latitude, longitude, obra.lat, obra.lon);
    if (dist < distanciaMin) {
      distanciaMin = dist;
      obraCercana = obra;
    }
  }

  if (el) el.textContent = `📍 GPS (±${accuracy.toFixed(0)}m) — ${obraCercana ? obraCercana.nombre + ': ' + distanciaMin.toFixed(0) + 'm' : 'Sin obras cercanas'}`;

  // ¿Está dentro del radio de geofence?
  if (distanciaMin <= _FIC_GEOFENCE_RADIO && obraCercana) {
    const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida && f.usuario_id === CU.id);

    if (!fichajePendiente && !_ficGeoNotificado) {
      // No fichado + cerca de obra → sugerir entrada
      _ficGeoNotificado = true;
      _ficSugerirFichaje('entrada', obraCercana, coords);
    }
  } else if (distanciaMin > _FIC_GEOFENCE_RADIO * 1.5) {
    // Lejos de todas las obras
    const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida && f.usuario_id === CU.id);

    if (fichajePendiente && _ficGeoNotificado) {
      // Fichado + lejos → sugerir salida
      _ficGeoNotificado = false;
      _ficSugerirFichaje('salida', obraCercana, coords);
    }
  }
}

async function _ficObtenerUbicacionesObras() {
  const ubicaciones = [];

  // 1. Prioridad: trabajos con coordenadas asignados hoy
  const hoy = new Date().toISOString().split('T')[0];
  const trab = typeof trabajos !== 'undefined' ? trabajos : [];

  for (const t of trab) {
    if (t.latitud && t.longitud) {
      ubicaciones.push({ tipo: 'trabajo', id: t.id, nombre: t.referencia || t.nombre || 'Obra', lat: t.latitud, lon: t.longitud });
    }
  }

  // 2. Fallback: clientes con coordenadas
  const cli = typeof clientes !== 'undefined' ? clientes : [];
  for (const c of cli) {
    if (c.latitud && c.longitud) {
      ubicaciones.push({ tipo: 'cliente', id: c.id, nombre: c.nombre || 'Cliente', lat: c.latitud, lon: c.longitud });
    }
  }

  return ubicaciones;
}

function _ficSugerirFichaje(tipo, obra, coords) {
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;

  const msg = tipo === 'entrada'
    ? `📍 Estás cerca de <strong>${obra.nombre}</strong>. ¿Fichar entrada a las ${horaActual}?`
    : `📍 Te has alejado de <strong>${obra.nombre}</strong>. ¿Fichar salida a las ${horaActual}?`;

  // Mostrar notificación interactiva
  const notiId = 'ficGeoNoti_' + Date.now();
  const notiHTML = `
    <div id="${notiId}" style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:white;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:20px;max-width:360px;width:90%;border:2px solid ${tipo==='entrada'?'var(--verde)':'var(--rojo)'}">
      <div style="font-size:14px;margin-bottom:14px">${msg}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('${notiId}').remove()" style="flex:1">Ignorar</button>
        <button class="btn btn-sm" onclick="_ficMostrarModalFichar(${tipo==='entrada'}); document.getElementById('${notiId}').remove()" style="flex:1;background:var(--gris-600);color:white">Ajustar</button>
        <button class="btn ${tipo==='entrada'?'btn-success':'btn-danger'} btn-sm" onclick="_ficFicharAutoGeo('${tipo}',${obra.id},'${obra.tipo}',${coords.latitude},${coords.longitude},${coords.accuracy});document.getElementById('${notiId}').remove()" style="flex:1">
          ${tipo === 'entrada' ? '✓ Entrada' : '✓ Salida'}
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', notiHTML);

  // Auto-dismiss después de 30s
  setTimeout(() => { document.getElementById(notiId)?.remove(); }, 30000);

  // Notificación push si soportada
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(tipo === 'entrada' ? 'Llegada detectada' : 'Salida detectada', {
      body: `Cerca de ${obra.nombre}. Toca para fichar.`,
      icon: '/assets/icon.svg',
      tag: 'geofence-' + tipo
    });
  }
}

async function _ficFicharAutoGeo(tipo, obraId, obraTipo, lat, lon, accuracy) {
  const hoy = new Date().toISOString().split('T')[0];
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}:${String(ahora.getSeconds()).padStart(2,'0')}`;

  if (tipo === 'entrada') {
    const obj = {
      empresa_id: EMPRESA.id,
      usuario_id: CU.id,
      usuario_nombre: CP.nombre || '',
      fecha: hoy,
      hora_entrada: horaActual,
      tipo: 'entrada',
      latitud: lat, longitud: lon,
      latitud_entrada: lat, longitud_entrada: lon,
      precision_gps: Math.round(accuracy),
      origen: 'geofence',
      dispositivo: navigator.userAgent.substring(0, 100)
    };
    if (obraTipo === 'trabajo') obj.trabajo_id = obraId;
    else obj.cliente_id = obraId;

    const { error } = await sb.from('fichajes').insert(obj);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('📍 Entrada registrada por GPS ✓', 'success');
  } else {
    const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida && f.usuario_id === CU.id);
    if (!fichajePendiente) return;

    const horasTrabajadas = calcularHorasEntre(fichajePendiente.hora_entrada, horaActual);
    await sb.from('fichajes').update({
      hora_salida: horaActual,
      horas_total: horasTrabajadas,
      latitud_salida: lat,
      longitud_salida: lon
    }).eq('id', fichajePendiente.id);

    toast('📍 Salida registrada por GPS ✓', 'success');
  }

  await loadFichajes();
}

// ═══════════════════════════════════════════════
//  BACKGROUND GEOLOCATION (Service Worker)
// ═══════════════════════════════════════════════
async function _ficRegistrarBackgroundGeo() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.ready;

    // Pedir permiso notificaciones
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    // Periodic Background Sync (si soportado)
    if ('periodicSync' in reg) {
      try {
        await reg.periodicSync.register('geofence-check', {
          minInterval: 5 * 60 * 1000 // cada 5 minutos
        });
      } catch (e) {
        // No soportado o sin permiso
      }
    }
  } catch (e) {
    // SW no disponible
  }
}

// ═══════════════════════════════════════════════
//  UTILIDADES GPS
// ═══════════════════════════════════════════════
function _ficDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function _ficObtenerGPS() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

// ═══════════════════════════════════════════════
//  VISTA AUSENCIAS
// ═══════════════════════════════════════════════
function _ficRenderAusencias(container, esAdmin) {
  const pendientes = _ficAusencias.filter(a => a.estado === 'pendiente');
  const aprobadas = _ficAusencias.filter(a => a.estado === 'aprobada');
  const rechazadas = _ficAusencias.filter(a => a.estado === 'rechazada');

  // Calcular vacaciones: 22 totales = 11 empresa + 11 personales
  const anio = new Date().getFullYear();
  const totalVac = CP?.tempo_dias_vacaciones || 22;
  const mitad = Math.floor(totalVac / 2); // 11
  const diasEmpresa = mitad;
  const diasPersonal = totalVac - mitad; // 11

  // Días empresa usados = días del calendario laboral que consumen vacaciones
  const tipos = _calGetTipos();
  const tiposQueConsumen = new Set(tipos.filter(t => t.consume_vacaciones).map(t => t.clave));
  const diasEmpresaUsados = _ficCalLaboral.filter(d => tiposQueConsumen.has(d.tipo)).length;

  // Días personales usados = ausencias tipo vacaciones aprobadas/pendientes del año
  const misVacaciones = _ficAusencias.filter(a =>
    a.tipo === 'vacaciones' && (a.estado === 'aprobada' || a.estado === 'pendiente') &&
    a.fecha_inicio?.startsWith(String(anio))
  );
  const diasPersonalUsados = misVacaciones.reduce((s, a) => s + (a.dias_totales || 0), 0);

  const diasLibresPersonal = Math.max(0, diasPersonal - diasPersonalUsados);
  const diasLibresEmpresa = Math.max(0, diasEmpresa - diasEmpresaUsados);

  // Plazo solicitud vacaciones: antes del 1 de abril
  const plazoVac = new Date(anio, 3, 1); // 1 abril
  const hoyDate = new Date();
  const fueraDePlazo = hoyDate >= plazoVac;

  const tipoLabel = { vacaciones: '🏖️ Vacaciones', baja_medica: '🏥 Baja médica', permiso: '📋 Permiso',
    asuntos_propios: '🙋 Asuntos propios', maternidad: '🤱 Maternidad', paternidad: '👨‍🍼 Paternidad', otro: '📝 Otro' };
  const estadoBadge = { pendiente: '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">⏳ Pendiente</span>',
    aprobada: '<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">✅ Aprobada</span>',
    rechazada: '<span style="background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">❌ Rechazada</span>' };

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2 style="font-size:17px;font-weight:800">Ausencias y Permisos</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">${esAdmin ? 'Gestión de solicitudes' : 'Mis solicitudes'}</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_ficNuevaAusencia()">+ Nueva solicitud</button>
    </div>

    <!-- VACACIONES -->
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gris-600);margin-bottom:10px;letter-spacing:0.5px">Vacaciones ${anio}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--azul)">${totalVac}</div>
          <div style="font-size:10px;color:var(--gris-500);text-transform:uppercase;font-weight:600">Total días</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--verde)">${diasLibresPersonal}</div>
          <div style="font-size:10px;color:var(--gris-500);text-transform:uppercase;font-weight:600">Libres personal</div>
          <div style="font-size:10px;color:var(--gris-400)">${diasPersonalUsados} de ${diasPersonal} usados</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--naranja)">${diasLibresEmpresa}</div>
          <div style="font-size:10px;color:var(--gris-500);text-transform:uppercase;font-weight:600">Libres empresa</div>
          <div style="font-size:10px;color:var(--gris-400)">${diasEmpresaUsados} de ${diasEmpresa} marcados</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:800;color:${fueraDePlazo ? 'var(--rojo)' : 'var(--verde)'}">${fueraDePlazo ? '⛔' : '✅'}</div>
          <div style="font-size:10px;color:${fueraDePlazo ? 'var(--rojo)' : 'var(--gris-500)'};text-transform:uppercase;font-weight:600">${fueraDePlazo ? 'Fuera de plazo' : 'En plazo'}</div>
          <div style="font-size:10px;color:var(--gris-400)">Límite: 1 abril</div>
        </div>
      </div>
    </div>

    <!-- KPIs Solicitudes -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700">Pendientes</div>
        <div style="font-size:26px;font-weight:800;color:var(--naranja)">${pendientes.length}</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700">Aprobadas</div>
        <div style="font-size:26px;font-weight:800;color:var(--verde)">${aprobadas.length}</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700">Rechazadas</div>
        <div style="font-size:26px;font-weight:800;color:var(--rojo)">${rechazadas.length}</div>
      </div>
    </div>

    <!-- Lista de ausencias -->
    <div style="display:flex;flex-direction:column;gap:10px">
      ${_ficAusencias.length === 0 ? '<div class="card" style="padding:40px;text-align:center;color:var(--gris-400)"><div class="empty"><div class="ei">📋</div><p>Sin solicitudes de ausencia</p></div></div>' : ''}
      ${_ficAusencias.map(a => {
        const fi = new Date(a.fecha_inicio + 'T00:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short' });
        const ff = new Date(a.fecha_fin + 'T00:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' });
        return `
          <div class="card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <strong style="font-size:13px">${tipoLabel[a.tipo] || a.tipo}</strong>
                  ${estadoBadge[a.estado] || ''}
                </div>
                ${esAdmin && a.usuario_nombre ? `<div style="font-size:11px;color:var(--gris-500);margin-bottom:2px">👤 ${a.usuario_nombre}</div>` : ''}
                <div style="font-size:12px;color:var(--gris-600)">${fi} → ${ff} (${a.dias_totales || '?'} días)</div>
                ${a.motivo ? `<div style="font-size:11px;color:var(--gris-500);margin-top:4px">${a.motivo}</div>` : ''}
                ${a.observaciones_admin ? `<div style="font-size:11px;color:var(--azul);margin-top:4px">💬 Admin: ${a.observaciones_admin}</div>` : ''}
              </div>
              <div style="display:flex;gap:4px">
                ${esAdmin && a.estado === 'pendiente' ? `
                  <button class="btn btn-success btn-sm" onclick="_ficAprobarAusencia(${a.id}, true)">✓</button>
                  <button class="btn btn-danger btn-sm" onclick="_ficAprobarAusencia(${a.id}, false)">✕</button>
                ` : ''}
                ${a.estado === 'pendiente' && a.usuario_id === CU.id ? `
                  <button class="btn btn-ghost btn-sm" onclick="_ficEliminarAusencia(${a.id})">🗑️</button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}

function _ficNuevaAusencia() {
  const inner = document.getElementById('mFichaje')?.querySelector('.modal');
  if (!inner) return;

  const hoy = new Date().toISOString().split('T')[0];

  inner.innerHTML = `
    <div class="modal-h"><span>📋</span><h2>Nueva Solicitud de Ausencia</h2><button class="btn btn-ghost btn-icon" onclick="closeModal('mFichaje')">✕</button></div>
    <div class="modal-b">
      <div style="display:flex;flex-direction:column;gap:11px">
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Tipo de ausencia</label>
            <select id="aus_tipo">
              <option value="vacaciones">🏖️ Vacaciones</option>
              <option value="permiso">📋 Permiso</option>
              <option value="baja_medica">🏥 Baja médica</option>
              <option value="asuntos_propios">🙋 Asuntos propios</option>
              <option value="maternidad">🤱 Maternidad</option>
              <option value="paternidad">👨‍🍼 Paternidad</option>
              <option value="otro">📝 Otro</option>
            </select>
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Fecha inicio</label>
            <input type="date" id="aus_inicio" value="${hoy}">
          </div>
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Fecha fin</label>
            <input type="date" id="aus_fin" value="${hoy}">
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Motivo / Descripción</label>
            <textarea id="aus_motivo" rows="3" placeholder="Describe el motivo de la ausencia..."></textarea>
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Documento adjunto (justificante, etc.)</label>
            <input type="file" id="aus_doc" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">
          </div>
        </div>
      </div>
    </div>
    <div class="modal-f">
      <button class="btn btn-secondary" onclick="closeModal('mFichaje')">Cancelar</button>
      <button class="btn btn-primary" onclick="_ficGuardarAusencia()">📋 Enviar Solicitud</button>
    </div>
  `;

  openModal('mFichaje', true);
}

async function _ficGuardarAusencia() {
  const tipo = document.getElementById('aus_tipo')?.value;
  const inicio = document.getElementById('aus_inicio')?.value;
  const fin = document.getElementById('aus_fin')?.value;
  const motivo = document.getElementById('aus_motivo')?.value || '';
  const docFile = document.getElementById('aus_doc')?.files?.[0];

  if (!inicio || !fin) { toast('Fechas obligatorias', 'error'); return; }
  if (fin < inicio) { toast('La fecha fin debe ser posterior a la de inicio', 'error'); return; }

  // Validar plazo de vacaciones: antes del 1 de abril (solo para tipo vacaciones, no admin)
  const esAdmin = CP.es_superadmin || CP.rol === 'admin';
  if (tipo === 'vacaciones' && !esAdmin) {
    const anioVac = new Date().getFullYear();
    const plazo = new Date(anioVac, 3, 1); // 1 abril
    if (new Date() >= plazo) {
      toast('El plazo para solicitar vacaciones terminó el 1 de abril. Contacta con tu responsable.', 'error');
      return;
    }
  }

  // Calcular días
  const d1 = new Date(inicio); const d2 = new Date(fin);
  const dias = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;

  // Subir documento si hay
  let docUrl = null;
  if (docFile) {
    const path = `ausencias/${EMPRESA.id}/${CU.id}/${Date.now()}_${docFile.name}`;
    const { error: upErr } = await sb.storage.from('documentos').upload(path, docFile);
    if (!upErr) {
      const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
      docUrl = urlData?.publicUrl || null;
    }
  }

  const { error } = await sb.from('ausencias').insert({
    empresa_id: EMPRESA.id,
    usuario_id: CU.id,
    usuario_nombre: CP.nombre || '',
    tipo,
    fecha_inicio: inicio,
    fecha_fin: fin,
    dias_totales: dias,
    motivo,
    documento_url: docUrl,
    estado: 'pendiente'
  });

  if (error) { toast('Error: ' + error.message, 'error'); return; }

  toast('Solicitud enviada ✓', 'success');
  closeModal('mFichaje');
  await _ficCargarAusencias();
  renderFichajes();
}

async function _ficAprobarAusencia(id, aprobar) {
  const obs = aprobar ? '' : prompt('Motivo del rechazo:') || '';
  if (!aprobar && !obs) return;

  const { error } = await sb.from('ausencias').update({
    estado: aprobar ? 'aprobada' : 'rechazada',
    aprobado_por: CU.id,
    aprobado_fecha: new Date().toISOString(),
    observaciones_admin: obs || null
  }).eq('id', id);

  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(aprobar ? 'Ausencia aprobada ✓' : 'Ausencia rechazada', aprobar ? 'success' : 'info');
  await _ficCargarAusencias();
  renderFichajes();
}

async function _ficEliminarAusencia(id) {
  const ok = await confirmModal({ titulo: 'Cancelar solicitud', mensaje: '¿Eliminar esta solicitud de ausencia?', btnOk: 'Eliminar', colorOk: '#DC2626' });
  if (!ok) return;

  await sb.from('ausencias').delete().eq('id', id);
  toast('Solicitud eliminada', 'info');
  await _ficCargarAusencias();
  renderFichajes();
}

// ═══════════════════════════════════════════════
//  VISTA TIMELINE ADMIN
// ═══════════════════════════════════════════════
let _ficTimelineData = [];

async function _ficCargarTimelineData() {
  const hoy = new Date().toISOString().split('T')[0];
  // Fichajes de hoy de todos
  const { data } = await sb.from('fichajes')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .eq('fecha', hoy)
    .order('hora_entrada');
  _ficTimelineData = data || [];
}

function _ficRenderTimeline(container) {
  const hoy = new Date().toISOString().split('T')[0];
  const ahora = new Date();
  const horaActualMin = ahora.getHours() * 60 + ahora.getMinutes();

  // Agrupar por usuario
  const byUser = {};
  _ficTimelineData.forEach(f => {
    if (!byUser[f.usuario_id]) byUser[f.usuario_id] = { nombre: f.usuario_nombre, fichajes: [] };
    byUser[f.usuario_id].fichajes.push(f);
  });

  // Calcular estado de cada usuario
  const operarios = Object.entries(byUser).map(([uid, data]) => {
    const pendiente = data.fichajes.find(f => f.tipo === 'entrada' && !f.hora_salida);
    const totalHoras = data.fichajes.reduce((sum, f) => sum + (parseFloat(f.horas_total) || 0), 0);
    const estado = pendiente ? 'trabajando' : (data.fichajes.length > 0 ? 'terminado' : 'sin_fichar');
    return { uid, nombre: data.nombre, estado, totalHoras, fichajes: data.fichajes, pendiente };
  });

  // Ordenar: trabajando primero, luego terminado, luego sin fichar
  const orden = { trabajando: 0, terminado: 1, sin_fichar: 2 };
  operarios.sort((a, b) => orden[a.estado] - orden[b.estado]);

  const trabajando = operarios.filter(o => o.estado === 'trabajando').length;
  const terminados = operarios.filter(o => o.estado === 'terminado').length;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2 style="font-size:17px;font-weight:800">Timeline de Hoy</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">${hoy} — ${trabajando} trabajando, ${terminados} terminados</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_ficCargarTimelineData().then(()=>renderFichajes())">🔄 Refrescar</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px">
      ${operarios.length === 0 ? '<div class="card" style="padding:40px;text-align:center;color:var(--gris-400)"><div class="empty"><div class="ei">👥</div><p>Sin actividad hoy</p></div></div>' : ''}
      ${operarios.map(op => {
        const colorBorde = op.estado === 'trabajando' ? 'var(--verde)' : op.estado === 'terminado' ? 'var(--gris-300)' : 'var(--rojo-light)';
        const iconEstado = op.estado === 'trabajando' ? '🟢' : op.estado === 'terminado' ? '⚪' : '🔴';
        const tiempo = op.pendiente ? calcularTiempoTranscurrido(op.pendiente.hora_entrada) : '';

        // Timeline bar (6:00 - 22:00 = 16h)
        const barStart = 6 * 60; // 6:00
        const barEnd = 22 * 60;  // 22:00
        const barWidth = barEnd - barStart;
        const segments = op.fichajes.map(f => {
          if (!f.hora_entrada) return '';
          const [h1, m1] = f.hora_entrada.split(':').map(Number);
          const start = Math.max(h1 * 60 + m1 - barStart, 0);
          const [h2, m2] = f.hora_salida ? f.hora_salida.split(':').map(Number) : [ahora.getHours(), ahora.getMinutes()];
          const end = Math.min(h2 * 60 + m2 - barStart, barWidth);
          const left = (start / barWidth * 100).toFixed(1);
          const width = ((end - start) / barWidth * 100).toFixed(1);
          const color = f.hora_salida ? 'var(--verde)' : 'var(--azul)';
          return `<div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${color};border-radius:3px;opacity:0.7" title="${f.hora_entrada?.slice(0,5)} - ${f.hora_salida?.slice(0,5) || 'ahora'}"></div>`;
        }).join('');

        // Marca hora actual
        const nowPos = ((horaActualMin - barStart) / barWidth * 100).toFixed(1);

        return `
          <div class="card" style="padding:14px;border-left:4px solid ${colorBorde}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <span>${iconEstado}</span>
                <strong style="font-size:13px">${op.nombre}</strong>
                ${tiempo ? `<span style="font-size:11px;color:var(--verde)">(${tiempo})</span>` : ''}
              </div>
              <div style="font-size:13px;font-weight:700;color:var(--azul)">${op.totalHoras.toFixed(1)}h</div>
            </div>
            <div style="position:relative;height:18px;background:var(--gris-100);border-radius:4px;overflow:hidden">
              ${segments}
              <div style="position:absolute;left:${nowPos}%;width:1px;height:100%;background:var(--rojo);z-index:1"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--gris-400)">
              <span>06:00</span><span>10:00</span><span>14:00</span><span>18:00</span><span>22:00</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}

// ═══════════════════════════════════════════════
//  VISTA CALENDARIO LABORAL (admin)
// ═══════════════════════════════════════════════
// Festivos nacionales España (fijos + calculados)
function _ficFestivosNacionales(anio) {
  // Semana Santa (Pascua con algoritmo de Butcher)
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesPascua = Math.floor((h + l - 7 * m + 114) / 31);
  const diaPascua = ((h + l - 7 * m + 114) % 31) + 1;
  const pascua = new Date(anio, mesPascua - 1, diaPascua);
  const viernesSanto = new Date(pascua); viernesSanto.setDate(pascua.getDate() - 2);

  const juevesSanto = new Date(pascua); juevesSanto.setDate(pascua.getDate() - 3);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return [
    // Nacionales
    { fecha: `${anio}-01-01`, desc: 'Año Nuevo', tipo: 'festivo' },
    { fecha: `${anio}-01-06`, desc: 'Reyes Magos', tipo: 'festivo' },
    { fecha: fmt(juevesSanto), desc: 'Jueves Santo', tipo: 'festivo' },
    { fecha: fmt(viernesSanto), desc: 'Viernes Santo', tipo: 'festivo' },
    { fecha: `${anio}-05-01`, desc: 'Fiesta del Trabajo', tipo: 'festivo' },
    { fecha: `${anio}-08-15`, desc: 'Asunción de la Virgen', tipo: 'festivo' },
    { fecha: `${anio}-10-12`, desc: 'Fiesta Nacional de España', tipo: 'festivo' },
    { fecha: `${anio}-11-01`, desc: 'Todos los Santos', tipo: 'festivo' },
    { fecha: `${anio}-12-06`, desc: 'Día de la Constitución', tipo: 'festivo' },
    { fecha: `${anio}-12-08`, desc: 'Inmaculada Concepción', tipo: 'festivo' },
    { fecha: `${anio}-12-25`, desc: 'Navidad', tipo: 'festivo' },
    // Galicia
    { fecha: `${anio}-05-17`, desc: 'Día das Letras Galegas', tipo: 'festivo' },
    { fecha: `${anio}-07-25`, desc: 'Santiago — Día Nacional de Galicia', tipo: 'festivo' },
  ];
}

function _ficRenderCalendario(container) {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const diasSemana = ['L','M','X','J','V','S','D'];

  const festivos = _ficFestivosNacionales(anio);
  const festivoMap = {};
  festivos.forEach(f => { festivoMap[f.fecha] = f.desc; });

  // Merge con calendario laboral guardado en BD
  const calMap = {};
  _ficCalLaboral.forEach(d => { calMap[d.fecha] = d; });

  const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;

  // Generar meses
  let mesesHtml = '';
  for (let mes = 0; mes < 12; mes++) {
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    let diaSemana = primerDia.getDay(); // 0=dom
    diaSemana = diaSemana === 0 ? 6 : diaSemana - 1; // 0=lun

    let celdas = '';
    // Cabecera días semana
    diasSemana.forEach((d, i) => {
      const color = i >= 5 ? 'var(--gris-400)' : 'var(--gris-600)';
      celdas += `<div style="text-align:center;font-size:10px;font-weight:700;color:${color};padding:2px 0">${d}</div>`;
    });
    // Celdas vacías antes del día 1
    for (let i = 0; i < diaSemana; i++) celdas += '<div></div>';

    for (let dia = 1; dia <= ultimoDia; dia++) {
      const fechaStr = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
      const dSem = new Date(anio, mes, dia).getDay();
      const esFinde = dSem === 0 || dSem === 6;
      const esFestivo = !!festivoMap[fechaStr];
      const enBD = !!calMap[fechaStr];
      const esHoy = fechaStr === hoyStr;

      let bg = 'transparent', color = 'var(--gris-700)', border = 'none', cursor = 'pointer', title = '';
      if (esHoy) { bg = 'var(--azul)'; color = '#fff'; }
      else if (enBD) {
        const _ti = _calTipoInfo(calMap[fechaStr].tipo);
        bg = _ti.bg; color = _ti.color; title = calMap[fechaStr].descripcion || _ti.nombre;
      }
      else if (esFestivo) { bg = '#FEF3C7'; color = '#D97706'; title = festivoMap[fechaStr]; }
      else if (esFinde) { color = 'var(--gris-300)'; }

      celdas += `<div onclick="_ficClickDiaCal('${fechaStr}','${(festivoMap[fechaStr]||'').replace(/'/g,"\\'")}')" title="${title}" style="text-align:center;font-size:12px;font-weight:${esHoy||esFestivo||enBD?'700':'500'};color:${color};background:${bg};border-radius:6px;padding:4px 2px;cursor:${cursor};line-height:1.4;border:${esHoy?'none':border}">${dia}</div>`;
    }

    mesesHtml += `
      <div class="card" style="padding:12px">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;text-align:center;color:var(--gris-700)">${meses[mes]}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px">
          ${celdas}
        </div>
      </div>
    `;
  }

  // Lista de festivos/marcados
  const todosFestivos = [...festivos.map(f => ({ ...f, tipo_cal: 'festivo', enBD: !!calMap[f.fecha] }))];
  _ficCalLaboral.forEach(d => {
    if (!festivoMap[d.fecha]) todosFestivos.push({ fecha: d.fecha, desc: d.descripcion || _calTipoInfo(d.tipo).nombre, tipo_cal: d.tipo, enBD: true, id: d.id });
  });
  todosFestivos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2 style="font-size:17px;font-weight:800">Calendario Laboral ${anio}</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">${_ficCalLaboral.length} días personalizados · ${festivos.length} festivos nacionales/autonómicos</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_calConfigTipos()">⚙️ Tipos</button>
      <button class="btn btn-primary btn-sm" onclick="_ficNuevoDiaCalendario()">+ Añadir día</button>
    </div>

    <!-- Leyenda -->
    <div style="display:flex;gap:12px;margin-bottom:16px;font-size:10.5px;color:var(--gris-500);flex-wrap:wrap">
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--azul);border-radius:3px;vertical-align:middle;margin-right:3px"></span>Hoy</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#FEF3C7;border-radius:3px;vertical-align:middle;margin-right:3px"></span>Nacional/Auton.</span>
      ${_calGetTipos().filter(t => t.clave !== 'otro').map(t =>
        `<span><span style="display:inline-block;width:10px;height:10px;background:${t.bg};border-radius:3px;vertical-align:middle;margin-right:3px"></span>${t.nombre.split('/')[0].split('·')[0].trim().substring(0,15)}</span>`
      ).join('')}
    </div>

    <!-- Calendario visual 6x2 -->
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:24px">
      ${mesesHtml}
    </div>

    <!-- Lista detallada en columnas -->
    <div class="card" style="padding:16px">
      <div style="font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;margin-bottom:10px;letter-spacing:0.5px">Días festivos y marcados</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px">
        ${todosFestivos.map(d => {
          const fechaF = new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
          const _ti = _calTipoInfo(d.tipo_cal);
          const dotColor = _ti.color;
          return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11.5px;border-bottom:1px solid var(--gris-50)">
            <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
            <span style="font-weight:600;color:var(--gris-600);min-width:50px">${fechaF}</span>
            <span style="color:var(--gris-500);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.desc || d.tipo}</span>
            ${d.id ? `<button class="btn btn-ghost" style="padding:0;font-size:10px;min-width:auto" onclick="_ficEliminarDiaCalendario(${d.id})">✕</button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// Click en día del calendario → abrir modal de añadir si no es festivo ya guardado
function _ficClickDiaCal(fecha, festivoDesc) {
  const existente = _ficCalLaboral.find(d => d.fecha === fecha);
  if (existente) {
    if (confirm('¿Eliminar "' + (existente.descripcion || existente.tipo) + '" del ' + fecha + '?')) {
      _ficEliminarDiaCalendario(existente.id);
    }
    return;
  }
  // Prellenar modal
  _ficNuevoDiaCalendario();
  setTimeout(() => {
    const inputFecha = document.getElementById('cal_fecha');
    const inputFechaFin = document.getElementById('cal_fecha_fin');
    if (inputFecha) inputFecha.value = fecha;
    if (inputFechaFin) inputFechaFin.value = fecha;
    if (festivoDesc) {
      const inputDesc = document.getElementById('cal_desc');
      if (inputDesc) inputDesc.value = festivoDesc;
    }
  }, 100);
}

function _ficNuevoDiaCalendario() {
  const inner = document.getElementById('mFichaje')?.querySelector('.modal');
  if (!inner) return;

  inner.innerHTML = `
    <div class="modal-h"><span>📅</span><h2>Añadir días al Calendario</h2><button class="btn btn-ghost btn-icon" onclick="closeModal('mFichaje')">✕</button></div>
    <div class="modal-b">
      <div style="display:flex;flex-direction:column;gap:11px">
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Fecha inicio</label>
            <input type="date" id="cal_fecha" onchange="const f=document.getElementById('cal_fecha_fin');if(!f.value)f.value=this.value">
          </div>
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Fecha fin <span style="font-weight:400;color:var(--gris-400)">(mismo día si solo 1)</span></label>
            <input type="date" id="cal_fecha_fin">
          </div>
        </div>
        <div class="fg">
          <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Tipo</label>
          <select id="cal_tipo" onchange="_calTipoChange()">
            ${_calGetTipos().map(t => `<option value="${t.clave}">${t.emoji} ${t.nombre}</option>`).join('')}
          </select>
        </div>
        <div id="cal_permiso_wrap" style="display:none">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Tipo de permiso (Art.32 Convenio Siderometal)</label>
            <select id="cal_subtipo_permiso" onchange="const o=this.options[this.selectedIndex];document.getElementById('cal_desc').value=o.text+(o.dataset.dias?' — '+o.dataset.dias:'')">
              ${_PERMISOS_CONVENIO.map(p => `<option value="${p.clave}" data-dias="${p.dias}">${p.nombre}${p.dias ? ' ('+p.dias+')' : ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fg">
          <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Descripción</label>
          <input type="text" id="cal_desc" placeholder="Ej: Vacaciones empresa, festivo local...">
        </div>
      </div>
    </div>
    <div class="modal-f">
      <button class="btn btn-secondary" onclick="closeModal('mFichaje')">Cancelar</button>
      <button class="btn btn-primary" onclick="_ficGuardarDiaCalendario()">📅 Guardar</button>
    </div>
  `;

  openModal('mFichaje', true);
}

async function _ficGuardarDiaCalendario() {
  const fechaInicio = document.getElementById('cal_fecha')?.value;
  const fechaFin = document.getElementById('cal_fecha_fin')?.value || fechaInicio;
  const tipo = document.getElementById('cal_tipo')?.value;
  const desc = document.getElementById('cal_desc')?.value || '';

  if (!fechaInicio) { toast('Fecha inicio obligatoria', 'error'); return; }

  // Generar array de fechas en el rango
  const fechas = [];
  const inicio = new Date(fechaInicio + 'T00:00:00');
  const fin = new Date((fechaFin || fechaInicio) + 'T00:00:00');
  if (fin < inicio) { toast('La fecha fin debe ser igual o posterior a la de inicio', 'error'); return; }

  const cursor = new Date(inicio);
  while (cursor <= fin) {
    fechas.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  if (fechas.length > 60) { toast('Máximo 60 días de una vez', 'error'); return; }

  // Filtrar fechas que ya existen en BD para no duplicar
  const existentes = new Set(_ficCalLaboral.map(d => d.fecha));
  const nuevas = fechas.filter(f => !existentes.has(f));
  if (nuevas.length === 0) { toast('Todos esos días ya están marcados', 'info'); closeModal('mFichaje'); return; }

  const rows = nuevas.map(f => ({ empresa_id: EMPRESA.id, fecha: f, tipo, descripcion: desc, created_by: CU.id }));
  const { error } = await sb.from('calendario_laboral').insert(rows);

  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(`${nuevas.length} día${nuevas.length > 1 ? 's' : ''} añadido${nuevas.length > 1 ? 's' : ''} al calendario`, 'success');
  closeModal('mFichaje');
  await _ficCargarCalendario();
  const cont = document.getElementById('page-calendario-laboral');
  if (cont) _ficRenderCalendario(cont);
}

async function _ficEliminarDiaCalendario(id) {
  const ok = await confirmModal({ titulo: 'Eliminar día', mensaje: '¿Eliminar este día del calendario laboral?', btnOk: 'Eliminar', colorOk: '#DC2626' });
  if (!ok) return;

  await sb.from('calendario_laboral').delete().eq('id', id);
  _ficCalLaboral = _ficCalLaboral.filter(d => d.id !== id);
  toast('Día eliminado', 'info');
  const cont = document.getElementById('page-calendario-laboral');
  if (cont) _ficRenderCalendario(cont);
}

// ═══════════════════════════════════════════════
//  CONFIGURAR TIPOS DE CALENDARIO
// ═══════════════════════════════════════════════
function _calConfigTipos() {
  const inner = document.getElementById('mFichaje')?.querySelector('.modal');
  if (!inner) return;

  const tipos = _calGetTipos();

  inner.innerHTML = `
    <div class="modal-h"><span>⚙️</span><h2>Tipos de Calendario Laboral</h2><button class="btn btn-ghost btn-icon" onclick="closeModal('mFichaje')">✕</button></div>
    <div class="modal-b" style="max-height:60vh;overflow-y:auto">
      <div id="_calTiposLista" style="display:flex;flex-direction:column;gap:6px">
        ${tipos.map((t, i) => `
          <div class="cfg-row" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gris-50);border-radius:8px">
            <span style="font-size:18px">${t.emoji}</span>
            <input value="${t.nombre}" onchange="_calTipoEditar(${i},'nombre',this.value)" style="flex:1;border:1px solid var(--gris-200);border-radius:6px;padding:6px 8px;font-size:12px">
            <input type="color" value="${t.color}" onchange="_calTipoEditar(${i},'color',this.value)" style="width:30px;height:30px;border:none;cursor:pointer;border-radius:4px">
            <label style="font-size:10px;color:var(--gris-400);white-space:nowrap" title="Descuenta vacaciones"><input type="checkbox" ${t.consume_vacaciones ? 'checked' : ''} onchange="_calTipoEditar(${i},'consume_vacaciones',this.checked)"> Desc. vac.</label>
            <button class="btn btn-ghost btn-sm" onclick="_calTipoEliminar(${i})" title="Eliminar tipo" style="color:var(--rojo)">✕</button>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gris-200)">
        <div class="fg-row" style="align-items:end">
          <div class="fg">
            <label style="font-size:11px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Nuevo tipo</label>
            <input id="_calNuevoNombre" placeholder="Ej: Festivo local, Jornada intensiva..." style="font-size:12px">
          </div>
          <div class="fg" style="flex:0 0 auto">
            <button class="btn btn-secondary btn-sm" onclick="_calTipoAnadir()">+ Añadir</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-f">
      <button class="btn btn-secondary" onclick="closeModal('mFichaje')">Cancelar</button>
      <button class="btn btn-primary" onclick="_calGuardarTipos()">💾 Guardar tipos</button>
    </div>
  `;

  openModal('mFichaje', true);
}

function _calTipoEditar(idx, campo, valor) {
  const tipos = _calGetTipos();
  if (tipos[idx]) tipos[idx][campo] = valor;
  // Actualizar bg basado en color si se cambia el color
  if (campo === 'color') {
    const hex = valor;
    tipos[idx].bg = hex + '20'; // color con transparencia
  }
}

function _calTipoEliminar(idx) {
  const tipos = [..._calGetTipos()];
  tipos.splice(idx, 1);
  if (!EMPRESA.config) EMPRESA.config = {};
  EMPRESA.config.tipos_calendario = tipos;
  _calConfigTipos(); // re-render
}

function _calTipoAnadir() {
  const nombre = document.getElementById('_calNuevoNombre')?.value?.trim();
  if (!nombre) { toast('Escribe un nombre', 'error'); return; }
  const clave = nombre.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  const tipos = [..._calGetTipos()];
  if (tipos.find(t => t.clave === clave)) { toast('Ya existe un tipo similar', 'error'); return; }
  tipos.push({ clave, nombre, emoji: '📌', color: '#6B7280', bg: '#F3F4F6', consume_vacaciones: false });
  if (!EMPRESA.config) EMPRESA.config = {};
  EMPRESA.config.tipos_calendario = tipos;
  _calConfigTipos(); // re-render
}

async function _calGuardarTipos() {
  const config = EMPRESA.config || {};
  const { error } = await sb.from('empresas').update({ config }).eq('id', EMPRESA.id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  EMPRESA.config = config;
  toast('Tipos de calendario guardados', 'success');
  closeModal('mFichaje');
  const cont = document.getElementById('page-calendario-laboral');
  if (cont) _ficRenderCalendario(cont);
}

// ═══════════════════════════════════════════════
//  EDITAR FICHAJE (admin)
// ═══════════════════════════════════════════════
function editFichaje(id) {
  const f = fichajes.find(x => x.id === id);
  if (!f) return;

  const inner = document.getElementById('mFichaje')?.querySelector('.modal');
  if (!inner) return;

  inner.innerHTML = `
    <div class="modal-h"><span>⏱️</span><h2>Editar Fichaje</h2><button class="btn btn-ghost btn-icon" onclick="closeModal('mFichaje')">✕</button></div>
    <div class="modal-b">
      <input type="hidden" id="fic_id" value="${f.id}">
      <div style="display:flex;flex-direction:column;gap:11px">
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px" for="fic_fecha">Fecha</label>
            <input type="date" id="fic_fecha" value="${f.fecha}">
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px" for="fic_entrada">Hora entrada</label>
            <input type="time" id="fic_entrada" value="${f.hora_entrada ? f.hora_entrada.slice(0,5) : ''}">
          </div>
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px" for="fic_salida">Hora salida</label>
            <input type="time" id="fic_salida" value="${f.hora_salida ? f.hora_salida.slice(0,5) : ''}">
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px" for="fic_motivo">Motivo de la corrección <span style="color:var(--rojo)">*</span></label>
            <input type="text" id="fic_motivo" placeholder="Ej: Operario olvidó fichar entrada">
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px" for="fic_observaciones">Observaciones</label>
            <input type="text" id="fic_observaciones" placeholder="Notas adicionales (opcional)" value="${f.observaciones || f.notas || ''}">
          </div>
        </div>
        ${f.latitud_entrada ? `<div style="font-size:11px;color:var(--gris-400);padding:4px 0">📍 Entrada: ${f.latitud_entrada?.toFixed(5)}, ${f.longitud_entrada?.toFixed(5)} | Origen: ${f.origen || 'manual'}</div>` : ''}
      </div>
    </div>
    <div class="modal-f">
      <button class="btn btn-secondary" onclick="closeModal('mFichaje')">Cancelar</button>
      <button class="btn btn-primary" onclick="saveFichaje()">💾 Guardar</button>
    </div>
  `;

  openModal('mFichaje', true);
}

async function saveFichaje() {
  const id = document.getElementById('fic_id').value;
  const fecha = document.getElementById('fic_fecha').value;
  const entrada = document.getElementById('fic_entrada').value;
  const salida = document.getElementById('fic_salida').value;
  const observaciones = document.getElementById('fic_observaciones').value;
  const motivo = (document.getElementById('fic_motivo')?.value || '').trim();

  if (!fecha || !entrada) {
    toast('Fecha y hora de entrada son obligatorias', 'error');
    return;
  }
  if (!motivo) {
    toast('El motivo de la corrección es obligatorio', 'error');
    document.getElementById('fic_motivo')?.focus();
    return;
  }

  let horasTotal = null;
  if (entrada && salida) {
    horasTotal = calcularHorasEntre(entrada + ':00', salida + ':00');
  }

  const obj = {
    fecha,
    hora_entrada: entrada + ':00',
    hora_salida: salida ? salida + ':00' : null,
    horas_total: horasTotal,
    observaciones
  };

  if (id) {
    const original = fichajes.find(f => String(f.id) === String(id));
    if (original) {
      const cambios = [];
      if (original.hora_entrada !== obj.hora_entrada) cambios.push({ campo: 'hora_entrada', antes: original.hora_entrada, despues: obj.hora_entrada });
      if ((original.hora_salida || null) !== (obj.hora_salida || null)) cambios.push({ campo: 'hora_salida', antes: original.hora_salida, despues: obj.hora_salida });
      if ((original.horas_total || null) !== (obj.horas_total || null)) cambios.push({ campo: 'horas_total', antes: String(original.horas_total), despues: String(obj.horas_total) });
      if (cambios.length > 0) {
        const ajustes = cambios.map(c => ({
          fichaje_id: id,
          campo_modificado: c.campo,
          valor_anterior: c.antes || null,
          valor_nuevo: c.despues || null,
          ajustado_por: CU.id,
          motivo
        }));
        await sb.from('fichajes_ajustes').insert(ajustes);
      }
    }

    const { error } = await sb.from('fichajes').update(obj).eq('id', id);
    if (error) {
      toast('Error: ' + error.message, 'error');
      return;
    }
    toast('Fichaje corregido ✓ (audit registrado)', 'success');
  }

  closeModal('mFichaje');
  await loadFichajes();
}

async function delFichaje(id) {
  const ok = await confirmModal({titulo:'Eliminar fichaje',mensaje:'¿Eliminar este fichaje?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!ok) return;

  const { error } = await sb.from('fichajes').delete().eq('id', id);
  if (error) {
    toast('Error: ' + error.message, 'error');
    return;
  }

  fichajes = fichajes.filter(f => f.id !== id);
  toast('Fichaje eliminado', 'info');
  renderFichajes();
}

// ═══════════════════════════════════════════════
//  FILTROS
// ═══════════════════════════════════════════════
function _getFicMesesOpciones() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const ahora = new Date();
  let opts = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${meses[d.getMonth()]} ${d.getFullYear()}`;
    opts += `<option value="${val}">${label}</option>`;
  }
  return opts;
}

async function filtrarFichajes() {
  const usuarioId = document.getElementById('ficFiltroUsuario')?.value || '';
  const mes = document.getElementById('ficFiltroMes')?.value || '';

  let query = sb.from('fichajes')
    .select('*')
    .eq('empresa_id', EMPRESA.id);

  if (usuarioId) {
    query = query.eq('usuario_id', usuarioId);
  } else if (!CP.es_superadmin && CP.rol !== 'admin') {
    query = query.eq('usuario_id', CU.id);
  }

  const mesFormat = mes || new Date().toISOString().slice(0, 7);
  const [yy, mm] = mesFormat.split('-').map(Number);
  const ultDia = new Date(yy, mm, 0).getDate();
  query = query
    .gte('fecha', mesFormat + '-01')
    .lte('fecha', mesFormat + '-' + String(ultDia).padStart(2, '0'));

  const { data } = await query.order('fecha', { ascending: false }).order('hora_entrada', { ascending: false });
  fichajes = data || [];

  renderFichajes();
}

// ═══════════════════════════════════════════════
//  EXPORTAR CSV (compatible ITSS)
// ═══════════════════════════════════════════════
function exportFichajes() {
  if (fichajes.length === 0) {
    toast('No hay fichajes para exportar', 'error');
    return;
  }

  const empresa = (typeof EMPRESA !== 'undefined' && EMPRESA?.razon_social) ? EMPRESA.razon_social : '';
  const sep = ';';

  let csv = `\uFEFF`;
  csv += `"REGISTRO DE JORNADA LABORAL"\n`;
  csv += `"Empresa: ${empresa}"\n`;
  csv += `"Exportado: ${new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}"\n`;
  csv += `\n`;

  const cols = ['Fecha','Día semana','Empleado','Hora entrada','Hora salida','Horas trabajadas','Origen','Estado','Observaciones'];
  csv += cols.map(c => `"${c}"`).join(sep) + '\n';

  const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  fichajes.forEach(f => {
    const fechaObj = f.fecha ? new Date(f.fecha + 'T00:00:00') : null;
    const diaSem = fechaObj ? diasSemana[fechaObj.getDay()] : '';
    const estado = !f.hora_salida ? 'Abierto' : 'Completo';
    const origen = f.origen === 'geofence' ? 'GPS' : f.origen === 'auto' ? 'Automático' : 'Manual';
    const row = [
      f.fecha || '',
      diaSem,
      f.usuario_nombre || '',
      f.hora_entrada ? f.hora_entrada.slice(0, 5) : '',
      f.hora_salida ? f.hora_salida.slice(0, 5) : '',
      f.horas_total ? parseFloat(f.horas_total).toFixed(2).replace('.', ',') : '',
      origen,
      estado,
      f.observaciones || f.notas || ''
    ];
    csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(sep) + '\n';
  });

  const totalHoras = fichajes.reduce((s, f) => s + (parseFloat(f.horas_total) || 0), 0);
  csv += `\n"Total horas"${sep}${sep}${sep}${sep}${sep}"${totalHoras.toFixed(2).replace('.', ',')}"\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.setAttribute('href', URL.createObjectURL(blob));
  link.setAttribute('download', `registro_jornada_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast(`Exportados ${fichajes.length} registros ✓`, 'success');
}

// ═══════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════
function calcularHorasEntre(hora1, hora2) {
  const [h1, m1] = hora1.split(':').map(Number);
  const [h2, m2] = hora2.split(':').map(Number);
  const minutos1 = h1 * 60 + m1;
  const minutos2 = h2 * 60 + m2;
  let diferencia = minutos2 - minutos1;
  if (diferencia < 0) diferencia += 24 * 60;
  return diferencia / 60;
}

function calcularTiempoTranscurrido(horaEntrada) {
  if (!horaEntrada) return '';
  const [h, m] = horaEntrada.split(':').map(Number);
  const ahora = new Date();
  const entrada = new Date();
  entrada.setHours(h, m, 0);
  let minutos = Math.floor((ahora - entrada) / 60000);
  if (minutos < 0) return '—';
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  if (horas > 0) return `${horas}h ${mins}m`;
  return `${mins}m`;
}

function iniciarTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const hoy = new Date().toISOString().split('T')[0];
    const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida && f.usuario_id === CU.id);
    if (fichajePendiente) {
      const tiempoEl = document.getElementById('fichajeEstadoTiempo');
      if (tiempoEl) {
        tiempoEl.textContent = calcularTiempoTranscurrido(fichajePendiente.hora_entrada);
      }
    }
  }, 30000);
}
