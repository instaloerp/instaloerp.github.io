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

// Radio de geofence en metros
const _FIC_GEOFENCE_RADIO = 500;

// ═══════════════════════════════════════════════
//  CARGAR DATOS
// ═══════════════════════════════════════════════
async function loadFichajes() {
  if (!EMPRESA || !EMPRESA.id) return;
  const ahora = new Date();
  const mesActual = ahora.toISOString().slice(0, 7);

  let query = sb.from('fichajes')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', mesActual + '-01')
    .lte('fecha', mesActual + '-31')
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
      <div class="form-g">
        <div class="form-r" style="grid-template-columns:1fr 1fr">
          <div class="form-f">
            <label class="label">Hora</label>
            <input type="time" id="fic_hora_fichar" class="input" value="${horaActual}">
          </div>
          <div class="form-f">
            <label class="label">Trabajo / Obra</label>
            <select id="fic_trabajo_id" class="input">
              <option value="">— Sin asignar —</option>
              ${optsTrabajo}
            </select>
          </div>
        </div>
        <div class="form-r">
          <div class="form-f">
            <label class="label">Notas</label>
            <input type="text" id="fic_notas_fichar" class="input" placeholder="Notas opcionales...">
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

    <!-- KPIs Ausencias -->
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
      <div class="form-g">
        <div class="form-r">
          <div class="form-f">
            <label class="label">Tipo de ausencia</label>
            <select id="aus_tipo" class="input">
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
        <div class="form-r" style="grid-template-columns:1fr 1fr">
          <div class="form-f">
            <label class="label">Fecha inicio</label>
            <input type="date" id="aus_inicio" class="input" value="${hoy}">
          </div>
          <div class="form-f">
            <label class="label">Fecha fin</label>
            <input type="date" id="aus_fin" class="input" value="${hoy}">
          </div>
        </div>
        <div class="form-r">
          <div class="form-f">
            <label class="label">Motivo / Descripción</label>
            <textarea id="aus_motivo" class="input" rows="3" placeholder="Describe el motivo de la ausencia..."></textarea>
          </div>
        </div>
        <div class="form-r">
          <div class="form-f">
            <label class="label">Documento adjunto (justificante, etc.)</label>
            <input type="file" id="aus_doc" class="input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">
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
function _ficRenderCalendario(container) {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const tipoLabel = { festivo: '🔴 Festivo', cierre_empresa: '🏢 Cierre empresa', medio_dia: '🕐 Medio día' };

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2 style="font-size:17px;font-weight:800">Calendario Laboral ${anio}</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">${_ficCalLaboral.length} días marcados</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_ficNuevoDiaCalendario()">+ Añadir día</button>
    </div>

    <!-- Lista de días bloqueados -->
    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--gris-50);border-bottom:1.5px solid var(--gris-200)">
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase">Fecha</th>
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase">Tipo</th>
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase">Descripción</th>
            <th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${_ficCalLaboral.length === 0 ? '<tr><td colspan="4" style="padding:40px;text-align:center;color:var(--gris-400)">Sin días festivos marcados</td></tr>' : ''}
          ${_ficCalLaboral.map(d => {
            const fechaF = new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            return `
              <tr style="border-bottom:1px solid var(--gris-100)">
                <td style="padding:10px 16px;font-size:13px;font-weight:600">${fechaF}</td>
                <td style="padding:10px 16px;font-size:12px">${tipoLabel[d.tipo] || d.tipo}</td>
                <td style="padding:10px 16px;font-size:12px;color:var(--gris-500)">${d.descripcion || '—'}</td>
                <td style="padding:10px 16px;text-align:right">
                  <button class="btn btn-ghost btn-sm" onclick="_ficEliminarDiaCalendario(${d.id})">🗑️</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function _ficNuevoDiaCalendario() {
  const inner = document.getElementById('mFichaje')?.querySelector('.modal');
  if (!inner) return;

  inner.innerHTML = `
    <div class="modal-h"><span>📅</span><h2>Añadir Día al Calendario</h2><button class="btn btn-ghost btn-icon" onclick="closeModal('mFichaje')">✕</button></div>
    <div class="modal-b">
      <div class="form-g">
        <div class="form-r" style="grid-template-columns:1fr 1fr">
          <div class="form-f">
            <label class="label">Fecha</label>
            <input type="date" id="cal_fecha" class="input">
          </div>
          <div class="form-f">
            <label class="label">Tipo</label>
            <select id="cal_tipo" class="input">
              <option value="festivo">🔴 Festivo</option>
              <option value="cierre_empresa">🏢 Cierre empresa</option>
              <option value="medio_dia">🕐 Medio día</option>
            </select>
          </div>
        </div>
        <div class="form-r">
          <div class="form-f">
            <label class="label">Descripción</label>
            <input type="text" id="cal_desc" class="input" placeholder="Ej: Día de la Comunidad Autónoma">
          </div>
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
  const fecha = document.getElementById('cal_fecha')?.value;
  const tipo = document.getElementById('cal_tipo')?.value;
  const desc = document.getElementById('cal_desc')?.value || '';

  if (!fecha) { toast('Fecha obligatoria', 'error'); return; }

  const { error } = await sb.from('calendario_laboral').insert({
    empresa_id: EMPRESA.id,
    fecha,
    tipo,
    descripcion: desc,
    created_by: CU.id
  });

  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Día añadido al calendario ✓', 'success');
  closeModal('mFichaje');
  await _ficCargarCalendario();
  renderFichajes();
}

async function _ficEliminarDiaCalendario(id) {
  const ok = await confirmModal({ titulo: 'Eliminar día', mensaje: '¿Eliminar este día del calendario laboral?', btnOk: 'Eliminar', colorOk: '#DC2626' });
  if (!ok) return;

  await sb.from('calendario_laboral').delete().eq('id', id);
  _ficCalLaboral = _ficCalLaboral.filter(d => d.id !== id);
  toast('Día eliminado', 'info');
  renderFichajes();
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
      <div class="form-g">
        <div class="form-r">
          <div class="form-f">
            <label class="label" for="fic_fecha">Fecha</label>
            <input type="date" id="fic_fecha" class="input" value="${f.fecha}">
          </div>
        </div>
        <div class="form-r" style="grid-template-columns:1fr 1fr">
          <div class="form-f">
            <label class="label" for="fic_entrada">Hora entrada</label>
            <input type="time" id="fic_entrada" class="input" value="${f.hora_entrada ? f.hora_entrada.slice(0,5) : ''}">
          </div>
          <div class="form-f">
            <label class="label" for="fic_salida">Hora salida</label>
            <input type="time" id="fic_salida" class="input" value="${f.hora_salida ? f.hora_salida.slice(0,5) : ''}">
          </div>
        </div>
        <div class="form-r">
          <div class="form-f">
            <label class="label" for="fic_motivo">Motivo de la corrección <span style="color:var(--rojo)">*</span></label>
            <input type="text" id="fic_motivo" class="input" placeholder="Ej: Operario olvidó fichar entrada">
          </div>
        </div>
        <div class="form-r">
          <div class="form-f">
            <label class="label" for="fic_observaciones">Observaciones</label>
            <input type="text" id="fic_observaciones" class="input" placeholder="Notas adicionales (opcional)" value="${f.observaciones || f.notas || ''}">
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
  query = query
    .gte('fecha', mesFormat + '-01')
    .lte('fecha', mesFormat + '-31');

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
