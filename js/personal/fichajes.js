/**
 * MÓDULO FICHAJES
 * Gestión de fichajes (entrada/salida): registro de horas trabajadas
 * Incluye KPIs, historial, filtros y exportación a Excel
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let fichajes = [];
let fichajeFiltro = { usuario_id: null, mes: null };
let timerInterval = null;
let fichajeFiltroMes = null;
let fichajeActualFecha = new Date().toISOString().split('T')[0];

// ═══════════════════════════════════════════════
//  CARGAR DATOS
// ═══════════════════════════════════════════════
async function loadFichajes() {
  if (!EMPRESA || !EMPRESA.id) return;
  // Cargar todos los fichajes del mes actual
  const ahora = new Date();
  const mesActual = ahora.toISOString().slice(0, 7);

  let query = sb.from('fichajes')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', mesActual + '-01')
    .lte('fecha', mesActual + '-31')
    .order('fecha', { ascending: false })
    .order('hora_entrada', { ascending: false });

  // Si el usuario no es admin, solo mostrar sus propios fichajes
  if (!CP.es_superadmin && CP.rol !== 'admin') {
    query = query.eq('usuario_id', CU.id);
  }

  const { data } = await query;
  fichajes = data || [];

  renderFichajes();
  iniciarTimer();
}

// ═══════════════════════════════════════════════
//  RENDERIZAR VISTA
// ═══════════════════════════════════════════════
function renderFichajes() {
  const container = document.getElementById('page-fichajes');
  if (!container) return;

  // Calcular KPIs
  const hoy = new Date().toISOString().split('T')[0];
  const fichajesHoy = fichajes.filter(f => f.fecha === hoy);
  const horasHoy = fichajesHoy.reduce((sum, f) => sum + (parseFloat(f.horas_total) || 0), 0);

  // Horas semana (últimos 7 días)
  const hace7dias = new Date();
  hace7dias.setDate(hace7dias.getDate() - 7);
  const semanaInicio = hace7dias.toISOString().split('T')[0];
  const fichajesSemana = fichajes.filter(f => f.fecha >= semanaInicio);
  const horasSemana = fichajesSemana.reduce((sum, f) => sum + (parseFloat(f.horas_total) || 0), 0);

  // Horas mes actual
  const mesActual = new Date().toISOString().slice(0, 7);
  const fichajesMes = fichajes.filter(f => f.fecha.startsWith(mesActual));
  const horasMes = fichajesMes.reduce((sum, f) => sum + (parseFloat(f.horas_total) || 0), 0);

  // Fichajes pendientes (entrada sin salida)
  const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida);

  // Estado actual
  const estaSinFichar = !fichajePendiente;
  const textoEstado = estaSinFichar ? '❌ Sin fichar' : '✅ Trabajando';
  const tiempoTranscurrido = fichajePendiente ? calcularTiempoTranscurrido(fichajePendiente.hora_entrada) : '';

  // Construir HTML
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2 style="font-size:17px;font-weight:800">Fichajes</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">Gestión de entrada/salida</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="exportFichajes()">📊 Excel</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Horas hoy</div>
        <div style="font-size:26px;font-weight:800;color:var(--azul)">${horasHoy.toFixed(1)}h</div>
        <div style="font-size:10px;color:var(--gris-400);margin-top:4px">${fichajesHoy.length} registros</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Horas semana</div>
        <div style="font-size:26px;font-weight:800;color:var(--verde)">${horasSemana.toFixed(1)}h</div>
        <div style="font-size:10px;color:var(--gris-400);margin-top:4px">${fichajesSemana.length} registros</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:11px;color:var(--gris-500);margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Horas mes</div>
        <div style="font-size:26px;font-weight:800;color:var(--naranja)">${horasMes.toFixed(1)}h</div>
        <div style="font-size:10px;color:var(--gris-400);margin-top:4px">${fichajesMes.length} registros</div>
      </div>
      <div class="card" style="padding:14px;text-align:center;border:2px solid var(--azul-light)">
        <div style="font-size:11px;color:${estaSinFichar ? 'var(--rojo)' : 'var(--verde)'};margin-bottom:6px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px">${textoEstado}</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px" id="fichajeEstadoTiempo">${tiempoTranscurrido}</div>
      </div>
    </div>

    <!-- BOTÓN FICHAR -->
    <div style="margin-bottom:20px">
      <button class="btn ${estaSinFichar ? 'btn-success' : 'btn-danger'}" style="width:100%;padding:18px;font-size:16px;font-weight:800" onclick="toggle${estaSinFichar ? 'Entrada' : 'Salida'}()">
        ${estaSinFichar ? '🟢 FICHAR ENTRADA' : '🔴 FICHAR SALIDA'}
      </button>
    </div>

    <!-- FILTROS -->
    <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center">
      ${CP.es_superadmin || CP.rol === 'admin' ? `
        <select id="ficFiltroUsuario" onchange="filtrarFichajes()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
          <option value="">Todos los empleados</option>
          ${fichajes.map(f => f.usuario_id).filter((v, i, a) => a.indexOf(v) === i).map(uid => {
            const nombre = fichajes.find(f => f.usuario_id === uid)?.usuario_nombre || 'Usuario';
            return `<option value="${uid}">${nombre}</option>`;
          }).join('')}
        </select>
      ` : ''}
      <select id="ficFiltroMes" onchange="filtrarFichajes()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
        <option value="">Mes actual</option>
        <option value="201">Enero</option>
        <option value="202">Febrero</option>
        <option value="203">Marzo</option>
        <option value="204">Abril</option>
        <option value="205">Mayo</option>
        <option value="206">Junio</option>
        <option value="207">Julio</option>
        <option value="208">Agosto</option>
        <option value="209">Septiembre</option>
        <option value="2010">Octubre</option>
        <option value="2011">Noviembre</option>
        <option value="2012">Diciembre</option>
      </select>
    </div>

    <!-- TABLA HISTORIAL -->
    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--gris-50);border-bottom:1.5px solid var(--gris-200)">
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Fecha</th>
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Empleado</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Entrada</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Salida</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Total horas</th>
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Observaciones</th>
            ${CP.es_superadmin || CP.rol === 'admin' ? '<th style="text-align:right;padding:12px 16px;font-size:12px;font-weight:700;color:var(--gris-600);text-transform:uppercase;letter-spacing:0.5px">Acciones</th>' : ''}
          </tr>
        </thead>
        <tbody id="fichajesTable">
          ${renderTablaFichajes()}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function renderTablaFichajes() {
  // Agrupar por fecha
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
      const salida = f.hora_salida ? f.hora_salida.slice(0, 5) : '(abierto)';

      html += `
        <tr style="border-bottom:1px solid var(--gris-100);hover:background:var(--gris-50)">
          <td style="padding:12px 16px;font-size:12px">${idx === 0 ? fechaFormato : ''}</td>
          <td style="padding:12px 16px;font-size:12px">${f.usuario_nombre || '—'}</td>
          <td style="padding:12px 16px;font-size:12px;text-align:center;font-weight:600">${entrada}</td>
          <td style="padding:12px 16px;font-size:12px;text-align:center;font-weight:600">${salida}</td>
          <td style="padding:12px 16px;font-size:12px;text-align:center;font-weight:700">${horasTotal}h</td>
          <td style="padding:12px 16px;font-size:12px;color:var(--gris-500)">${f.observaciones || '—'}</td>
          ${CP.es_superadmin || CP.rol === 'admin' ? `
            <td style="padding:12px 16px;text-align:right">
              <button class="btn btn-ghost btn-sm" onclick="editFichaje(${f.id})">✏️</button>
              <button class="btn btn-ghost btn-sm" onclick="delFichaje(${f.id})">🗑️</button>
            </td>
          ` : ''}
        </tr>
      `;
    });
  });

  return html || '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--gris-400)"><div class="empty"><div class="ei">📝</div><p>Sin fichajes</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  FICHAR ENTRADA / SALIDA
// ═══════════════════════════════════════════════
async function toggleEntrada() {
  const hoy = new Date().toISOString().split('T')[0];
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:${String(ahora.getSeconds()).padStart(2, '0')}`;

  // Obtener ubicación (opcional)
  let latitud = null, longitud = null;
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      latitud = pos.coords.latitude;
      longitud = pos.coords.longitude;
    } catch (e) {
      // Sin ubicación
    }
  }

  const { error } = await sb.from('fichajes').insert({
    empresa_id: EMPRESA.id,
    usuario_id: CU.id,
    usuario_nombre: CP.nombre || '',
    fecha: hoy,
    hora_entrada: horaActual,
    tipo: 'entrada',
    latitud,
    longitud
  });

  if (error) {
    toast('Error al fichar: ' + error.message, 'error');
    return;
  }

  toast('Entrada registrada ✓', 'success');
  await loadFichajes();
}

async function toggleSalida() {
  const hoy = new Date().toISOString().split('T')[0];
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:${String(ahora.getSeconds()).padStart(2, '0')}`;

  // Obtener ubicación (opcional)
  let latitud = null, longitud = null;
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      latitud = pos.coords.latitude;
      longitud = pos.coords.longitude;
    } catch (e) {
      // Sin ubicación
    }
  }

  // Buscar última entrada del día sin salida
  const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida);

  if (!fichajePendiente) {
    toast('No hay entrada registrada para hoy', 'error');
    return;
  }

  // Calcular horas trabajadas
  const horasTrabajadas = calcularHorasEntre(fichajePendiente.hora_entrada, horaActual);

  const { error } = await sb.from('fichajes').insert({
    empresa_id: EMPRESA.id,
    usuario_id: CU.id,
    usuario_nombre: CP.nombre || '',
    fecha: hoy,
    hora_entrada: fichajePendiente.hora_entrada,
    hora_salida: horaActual,
    horas_total: horasTrabajadas,
    tipo: 'salida',
    latitud,
    longitud
  });

  if (error) {
    toast('Error al fichar: ' + error.message, 'error');
    return;
  }

  // Marcar la entrada como completada
  await sb.from('fichajes')
    .update({ hora_salida: horaActual, horas_total: horasTrabajadas })
    .eq('id', fichajePendiente.id);

  toast('Salida registrada ✓', 'success');
  await loadFichajes();
}

// ═══════════════════════════════════════════════
//  EDITAR FICHAJE
// ═══════════════════════════════════════════════
function editFichaje(id) {
  const f = fichajes.find(x => x.id === id);
  if (!f) return;

  document.getElementById('fic_id').value = f.id;
  document.getElementById('fic_fecha').value = f.fecha;
  document.getElementById('fic_entrada').value = f.hora_entrada ? f.hora_entrada.slice(0, 5) : '';
  document.getElementById('fic_salida').value = f.hora_salida ? f.hora_salida.slice(0, 5) : '';
  document.getElementById('fic_observaciones').value = f.observaciones || '';

  openModal('mFichaje');
}

async function saveFichaje() {
  const id = document.getElementById('fic_id').value;
  const fecha = document.getElementById('fic_fecha').value;
  const entrada = document.getElementById('fic_entrada').value;
  const salida = document.getElementById('fic_salida').value;
  const observaciones = document.getElementById('fic_observaciones').value;

  if (!fecha || !entrada) {
    toast('Fecha y entrada son obligatorias', 'error');
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
    const { error } = await sb.from('fichajes').update(obj).eq('id', id);
    if (error) {
      toast('Error: ' + error.message, 'error');
      return;
    }
    toast('Fichaje actualizado ✓', 'success');
  }

  closeModal('mFichaje');
  document.getElementById('fic_id').value = '';
  await loadFichajes();
}

async function delFichaje(id) {
  if (!confirm('¿Eliminar fichaje?')) return;

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
async function filtrarFichajes() {
  const usuarioId = document.getElementById('ficFiltroUsuario')?.value || '';
  const mes = document.getElementById('ficFiltroMes')?.value || '';

  // Crear query base
  let query = sb.from('fichajes')
    .select('*')
    .eq('empresa_id', EMPRESA.id);

  // Filtro usuario
  if (usuarioId) {
    query = query.eq('usuario_id', usuarioId);
  } else if (!CP.es_superadmin && CP.rol !== 'admin') {
    query = query.eq('usuario_id', CU.id);
  }

  // Filtro mes
  if (mes) {
    const [year, month] = mes.match(/\d{4}/) ? [mes.slice(0, 4), mes.slice(4)] : [new Date().getFullYear(), mes];
    const mesFormat = `${year}-${String(month).padStart(2, '0')}`;
    query = query
      .gte('fecha', mesFormat + '-01')
      .lte('fecha', mesFormat + '-31');
  } else {
    const ahora = new Date();
    const mesActual = ahora.toISOString().slice(0, 7);
    query = query
      .gte('fecha', mesActual + '-01')
      .lte('fecha', mesActual + '-31');
  }

  const { data } = await query.order('fecha', { ascending: false }).order('hora_entrada', { ascending: false });
  fichajes = data || [];

  renderFichajes();
}

// ═══════════════════════════════════════════════
//  EXPORTAR A EXCEL
// ═══════════════════════════════════════════════
function exportFichajes() {
  if (fichajes.length === 0) {
    toast('No hay fichajes para exportar', 'error');
    return;
  }

  // Preparar datos
  const datos = fichajes.map(f => ({
    'Fecha': f.fecha || '',
    'Empleado': f.usuario_nombre || '',
    'Entrada': f.hora_entrada ? f.hora_entrada.slice(0, 5) : '',
    'Salida': f.hora_salida ? f.hora_salida.slice(0, 5) : '',
    'Horas': f.horas_total ? parseFloat(f.horas_total).toFixed(2) : '',
    'Observaciones': f.observaciones || ''
  }));

  // Crear CSV
  const headers = ['Fecha', 'Empleado', 'Entrada', 'Salida', 'Horas', 'Observaciones'];
  let csv = headers.join(',') + '\n';

  datos.forEach(row => {
    csv += [
      row.Fecha,
      '"' + row.Empleado + '"',
      row.Entrada,
      row.Salida,
      row.Horas,
      '"' + row.Observaciones + '"'
    ].join(',') + '\n';
  });

  // Descargar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `fichajes_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast('Fichajes exportados ✓', 'success');
}

// ═══════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════
function calcularHorasEntre(hora1, hora2) {
  // Formato: HH:MM o HH:MM:SS
  const [h1, m1] = hora1.split(':').map(Number);
  const [h2, m2] = hora2.split(':').map(Number);

  const minutos1 = h1 * 60 + m1;
  const minutos2 = h2 * 60 + m2;

  let diferencia = minutos2 - minutos1;
  if (diferencia < 0) diferencia += 24 * 60; // Cruzar medianoche

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
    const fichajePendiente = fichajes.find(f => f.fecha === hoy && f.tipo === 'entrada' && !f.hora_salida);

    if (fichajePendiente) {
      const tiempoEl = document.getElementById('fichajeEstadoTiempo');
      if (tiempoEl) {
        tiempoEl.textContent = calcularTiempoTranscurrido(fichajePendiente.hora_entrada);
      }
    }
  }, 30000); // Actualizar cada 30 segundos
}
