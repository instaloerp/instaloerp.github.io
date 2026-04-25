// ═══════════════════════════════════════════════
// FLOTA GPS — Mapa en tiempo real con Movertis
// ═══════════════════════════════════════════════

let _gpsMap = null;
let _gpsMarkers = [];
let _gpsVehiculos = [];
let _gpsAutoRefresh = null;
const _GPS_REFRESH_MS = 30000; // 30 segundos

// URL del Edge Function proxy
const _gpsProxyUrl = () => {
  if (typeof SUPABASE_URL !== 'undefined') return SUPABASE_URL + '/functions/v1/movertis';
  if (typeof sb !== 'undefined' && sb.supabaseUrl) return sb.supabaseUrl + '/functions/v1/movertis';
  return '';
};

// ── Llamar a Movertis via proxy ─────────────────
async function _gpsCall(action, params) {
  const url = _gpsProxyUrl();
  if (!url) throw new Error('URL de Supabase no disponible');

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (typeof SUPABASE_ANON !== 'undefined' ? SUPABASE_ANON : sb.supabaseKey || '')
    },
    body: JSON.stringify({ action, params })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Error ' + resp.status);
  }
  return resp.json();
}


// ═══════════════════════════════════════════════
//  RENDER PRINCIPAL
// ═══════════════════════════════════════════════

async function renderFlotaGPS() {
  const page = document.getElementById('page-flota-gps');
  if (!page) return;

  page.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px" id="gpsKpis"></div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-b" style="padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--gris-500)" id="gpsLastUpdate">Cargando...</span>
        <div style="flex:1"></div>
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;color:var(--gris-500)">
          <label class="toggle"><input type="checkbox" id="gpsAutoToggle" checked onchange="_gpsToggleAuto(this.checked)"><span class="toggle-sl"></span></label>
          Auto-refresh (30s)
        </label>
        <button class="btn btn-primary btn-sm" onclick="_gpsRefresh()">🔄 Actualizar</button>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
      <div id="gpsMapContainer" style="height:55vh;min-height:350px;background:var(--gris-100)"></div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="dt">
        <thead><tr>
          <th>Vehículo</th>
          <th style="width:90px">Velocidad</th>
          <th style="width:100px">Rumbo</th>
          <th>Ubicación</th>
          <th style="width:140px">Última señal</th>
          <th style="width:80px">Estado</th>
        </tr></thead>
        <tbody id="gpsTableBody"></tbody>
      </table>
    </div>`;

  // Inicializar mapa Leaflet
  _gpsInitMap();

  // Cargar datos
  await _gpsRefresh();

  // Auto-refresh
  _gpsStartAuto();
}


// ═══════════════════════════════════════════════
//  MAPA LEAFLET
// ═══════════════════════════════════════════════

function _gpsInitMap() {
  const container = document.getElementById('gpsMapContainer');
  if (!container || typeof L === 'undefined') {
    if (container) container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Leaflet no disponible. Recarga la página.</div>';
    return;
  }

  // Destruir mapa anterior si existe
  if (_gpsMap) { _gpsMap.remove(); _gpsMap = null; }

  _gpsMap = L.map(container, {
    zoomControl: true,
    attributionControl: false
  }).setView([43.35, -7.5], 9); // Centro aprox Lugo/Galicia

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(_gpsMap);

  // Fix render issue cuando el contenedor cambia de tamaño
  setTimeout(() => _gpsMap?.invalidateSize(), 200);
}

function _gpsUpdateMarkers() {
  if (!_gpsMap) return;

  // Limpiar markers anteriores
  _gpsMarkers.forEach(m => _gpsMap.removeLayer(m));
  _gpsMarkers = [];

  const bounds = [];

  _gpsVehiculos.forEach(v => {
    if (!v.lastPosition) return;
    const { lat, lon, speed, course } = v.lastPosition;
    if (!lat || !lon) return;

    // Determinar si está activo (señal en últimas 2 horas)
    const now = Math.floor(Date.now() / 1000);
    const age = now - (v.lastPosition.date || 0);
    const isActive = age < 7200; // 2 horas
    const isMoving = speed > 3;

    // Icono personalizado
    const icon = L.divIcon({
      className: 'gps-marker',
      html: `<div style="
        background:${isMoving ? 'var(--verde)' : isActive ? 'var(--azul)' : 'var(--gris-400)'};
        color:#fff;font-size:10px;font-weight:800;
        padding:3px 7px;border-radius:12px;
        white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);
        border:2px solid #fff;
        display:flex;align-items:center;gap:4px;
        ${isMoving ? 'animation:gps-pulse 2s infinite' : ''}
      ">${isMoving ? '🚐' : '🅿️'} ${v.name}${isMoving ? ' · ' + Math.round(speed) + ' km/h' : ''}</div>`,
      iconSize: null,
      iconAnchor: [50, 15]
    });

    const marker = L.marker([lat, lon], { icon }).addTo(_gpsMap);
    marker.bindPopup(_gpsPopup(v));
    _gpsMarkers.push(marker);
    bounds.push([lat, lon]);
  });

  // Ajustar vista al primer render
  if (bounds.length > 1) {
    _gpsMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  } else if (bounds.length === 1) {
    _gpsMap.setView(bounds[0], 14);
  }
}

function _gpsPopup(v) {
  const p = v.lastPosition || {};
  const now = Math.floor(Date.now() / 1000);
  const age = now - (p.date || 0);
  const ago = _gpsTimeAgo(age);
  const isMoving = p.speed > 3;

  return `<div style="min-width:180px;font-size:12px;line-height:1.6">
    <div style="font-weight:800;font-size:14px;margin-bottom:4px">${isMoving ? '🚐' : '🅿️'} ${v.name}</div>
    <div><b>Velocidad:</b> ${Math.round(p.speed || 0)} km/h</div>
    <div><b>Rumbo:</b> ${_gpsRumbo(p.course)}</div>
    <div><b>Coordenadas:</b> ${p.lat?.toFixed(5)}, ${p.lon?.toFixed(5)}</div>
    <div><b>Última señal:</b> ${ago}</div>
    <div style="margin-top:6px">
      <a href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank" style="color:var(--azul);text-decoration:underline">📍 Ver en Google Maps</a>
    </div>
  </div>`;
}


// ═══════════════════════════════════════════════
//  TABLA + KPIs
// ═══════════════════════════════════════════════

function _gpsUpdateTable() {
  const tbody = document.getElementById('gpsTableBody');
  if (!tbody) return;

  const now = Math.floor(Date.now() / 1000);

  tbody.innerHTML = _gpsVehiculos.map(v => {
    const p = v.lastPosition || {};
    const age = now - (p.date || 0);
    const isActive = age < 7200;
    const isMoving = (p.speed || 0) > 3;

    let estado = '';
    if (!isActive) estado = '<span style="color:var(--gris-400)">⚫ Sin señal</span>';
    else if (isMoving) estado = '<span style="color:var(--verde);font-weight:700">🟢 Moviendo</span>';
    else estado = '<span style="color:var(--azul)">🔵 Parado</span>';

    return `<tr style="cursor:pointer" onclick="_gpsCentrar(${p.lat},${p.lon})">
      <td style="font-weight:700">${v.name}</td>
      <td>${Math.round(p.speed || 0)} km/h</td>
      <td style="font-size:12px">${_gpsRumbo(p.course)}</td>
      <td style="font-size:12px;color:var(--gris-500)">${p.lat?.toFixed(4)}, ${p.lon?.toFixed(4)}</td>
      <td style="font-size:12px">${_gpsTimeAgo(age)}</td>
      <td>${estado}</td>
    </tr>`;
  }).join('');
}

function _gpsUpdateKpis() {
  const el = document.getElementById('gpsKpis');
  if (!el) return;

  const now = Math.floor(Date.now() / 1000);
  const total = _gpsVehiculos.length;
  const activos = _gpsVehiculos.filter(v => v.lastPosition && (now - v.lastPosition.date) < 7200).length;
  const moviendo = _gpsVehiculos.filter(v => v.lastPosition && v.lastPosition.speed > 3).length;
  const parados = activos - moviendo;

  el.innerHTML = `
    <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">🚐</div><div class="sv">${total}</div><div class="sl">Vehículos</div></div>
    <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">🟢</div><div class="sv">${moviendo}</div><div class="sl">En movimiento</div></div>
    <div class="sc" style="--c:var(--violeta);--bg:var(--violeta-light)"><div class="si">🔵</div><div class="sv">${parados}</div><div class="sl">Parados</div></div>
    <div class="sc" style="--c:var(--gris-500);--bg:var(--gris-100)"><div class="si">⚫</div><div class="sv">${total - activos}</div><div class="sl">Sin señal</div></div>
  `;
}


// ═══════════════════════════════════════════════
//  REFRESH + AUTO
// ═══════════════════════════════════════════════

async function _gpsRefresh() {
  try {
    const data = await _gpsCall('vehicles');
    if (!Array.isArray(data)) {
      console.warn('GPS: respuesta inesperada', data);
      return;
    }
    _gpsVehiculos = data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    _gpsUpdateKpis();
    _gpsUpdateMarkers();
    _gpsUpdateTable();

    const el = document.getElementById('gpsLastUpdate');
    if (el) el.textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-ES');
  } catch (e) {
    console.error('GPS refresh error:', e);
    const el = document.getElementById('gpsLastUpdate');
    if (el) el.textContent = '⚠️ Error: ' + e.message;

    // Si el proxy no está desplegado, llamar directo (fallback temporal)
    if (e.message.includes('404') || e.message.includes('no disponible')) {
      await _gpsRefreshDirect();
    }
  }
}

// Fallback: llamar directo a Movertis (solo para testing, expone token)
async function _gpsRefreshDirect() {
  try {
    // Token guardado temporalmente — se eliminará cuando el proxy esté desplegado
    const resp = await fetch('https://devapi.hellomovertis.com/vehicle/showvehicles', {
      method: 'POST',
      headers: {
        'Authorization': '4667eb0dd9987b7c1b896a0496f084d80463FD8EF5C2AD3BEEA95773C1C59C709539D93A',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: [], flags: { basicData: true, lastMessagePosition: true } })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    _gpsVehiculos = (data || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    _gpsUpdateKpis();
    _gpsUpdateMarkers();
    _gpsUpdateTable();
    const el = document.getElementById('gpsLastUpdate');
    if (el) el.textContent = 'Actualizado (directo): ' + new Date().toLocaleTimeString('es-ES');
  } catch (e) {
    console.error('GPS direct error:', e);
  }
}

function _gpsStartAuto() {
  _gpsStopAuto();
  _gpsAutoRefresh = setInterval(() => {
    if (document.getElementById('page-flota-gps')?.classList.contains('active')) {
      _gpsRefresh();
    } else {
      _gpsStopAuto();
    }
  }, _GPS_REFRESH_MS);
}

function _gpsStopAuto() {
  if (_gpsAutoRefresh) { clearInterval(_gpsAutoRefresh); _gpsAutoRefresh = null; }
}

function _gpsToggleAuto(on) {
  if (on) _gpsStartAuto();
  else _gpsStopAuto();
}

function _gpsCentrar(lat, lon) {
  if (_gpsMap && lat && lon) {
    _gpsMap.setView([lat, lon], 16);
  }
}


// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function _gpsRumbo(deg) {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx] + ' (' + Math.round(deg) + '°)';
}

function _gpsTimeAgo(seconds) {
  if (seconds < 60) return 'Hace ' + seconds + 's';
  if (seconds < 3600) return 'Hace ' + Math.floor(seconds / 60) + ' min';
  if (seconds < 86400) return 'Hace ' + Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'min';
  const days = Math.floor(seconds / 86400);
  if (days === 1) return 'Ayer';
  if (days < 30) return 'Hace ' + days + ' días';
  return 'Hace ' + Math.floor(days / 30) + ' meses';
}

// Limpiar al salir de la página
document.addEventListener('visibilitychange', () => {
  if (document.hidden) _gpsStopAuto();
});
