// ═══════════════════════════════════════════════
// FLOTA - Vehículos y Gastos
// ═══════════════════════════════════════════════

let flotaVehiculos = [];
let flotaGastos = [];

// ── Cargar datos ──────────────────────────────
async function _flotaCargar() {
  const eid = EMPRESA.id;
  const [vRes, gRes] = await Promise.all([
    sb.from('vehiculos').select('*').eq('empresa_id', eid).order('nombre'),
    sb.from('vehiculo_gastos').select('*').eq('empresa_id', eid).order('fecha', { ascending: false })
  ]);
  flotaVehiculos = vRes.data || [];
  flotaGastos = gRes.data || [];
}

// ═══════════════════════════════════════════════
//  VEHÍCULOS
// ═══════════════════════════════════════════════

async function renderFlota() {
  await _flotaCargar();
  _flotaKPIs();
  _flotaTabla();
}

function _flotaKPIs() {
  const activos = flotaVehiculos.filter(v => v.activo !== false);
  const hoy = new Date();
  const mesActual = hoy.toISOString().slice(0, 7); // YYYY-MM

  // KPI 1: Vehículos activos
  document.getElementById('flota_kpi_vehiculos').textContent = activos.length;

  // KPI 2: Gasto mes actual
  const gastoMes = flotaGastos
    .filter(g => (g.fecha || '').slice(0, 7) === mesActual)
    .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);
  document.getElementById('flota_kpi_gasto_mes').textContent = _flotaFmt(gastoMes) + '€';

  // KPI 3: Coste/km (12 meses) — placeholder hasta Movertis
  document.getElementById('flota_kpi_coste_km').textContent = '—';

  // KPI 4: Amortización mensual total
  const amortTotal = activos.reduce((s, v) => {
    const precio = parseFloat(v.precio_compra) || 0;
    const meses = parseInt(v.amort_meses) || 96;
    return s + (precio / meses);
  }, 0);
  document.getElementById('flota_kpi_amort').textContent = amortTotal > 0
    ? _flotaFmt(amortTotal) + '€/mes' : '—';
}

function _flotaTabla() {
  const tbody = document.getElementById('flotaTable');
  if (!flotaVehiculos.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gris-400)">' +
      '<div style="font-size:40px;margin-bottom:8px">🚐</div><strong>Sin vehículos</strong>' +
      '<br><span style="font-size:12px">Añade tu primer vehículo para empezar</span></td></tr>';
    return;
  }

  const hoy = new Date();
  const hace12m = new Date(hoy);
  hace12m.setFullYear(hace12m.getFullYear() - 1);
  const hace12mStr = hace12m.toISOString().slice(0, 10);

  tbody.innerHTML = flotaVehiculos.map(v => {
    const precio = parseFloat(v.precio_compra) || 0;
    const meses = parseInt(v.amort_meses) || 96;

    // Amortización restante
    let amortRestante = '—';
    if (v.fecha_compra && precio > 0) {
      const compra = new Date(v.fecha_compra);
      const mesesTranscurridos = _flotaMesesEntre(compra, hoy);
      const restantes = Math.max(0, meses - mesesTranscurridos);
      amortRestante = restantes > 0 ? `${restantes} meses` : '<span style="color:var(--verde)">✓ Amortizado</span>';
    }

    // Gasto 12 meses (directos + parte proporcional de gastos de flota)
    const gastosDirectos = flotaGastos
      .filter(g => g.vehiculo_id === v.id && g.fecha >= hace12mStr)
      .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);
    const activos = flotaVehiculos.filter(x => x.activo !== false).length || 1;
    const gastosFlota = flotaGastos
      .filter(g => !g.vehiculo_id && g.fecha >= hace12mStr)
      .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);
    const gasto12m = gastosDirectos + (gastosFlota / activos);

    const inactivo = v.activo === false;

    return `<tr style="${inactivo ? 'opacity:.5' : ''}" onclick="editVehiculo(${v.id})" class="clickable-row">
      <td><strong>${_flotaEsc(v.nombre)}</strong>${inactivo ? ' <span class="badge bg-gray" style="font-size:9px">Inactivo</span>' : ''}</td>
      <td>${_flotaEsc(v.matricula || '—')}</td>
      <td>${v.fecha_compra ? _flotaFecha(v.fecha_compra) : '—'}</td>
      <td style="text-align:right">${precio > 0 ? _flotaFmt(precio) + '€' : '—'}</td>
      <td style="text-align:right">${amortRestante}</td>
      <td style="text-align:right">${gasto12m > 0 ? _flotaFmt(gasto12m) + '€' : '—'}</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editVehiculo(${v.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delVehiculo(${v.id})" style="color:var(--rojo)">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function nuevoVehiculo() {
  document.getElementById('veh_id').value = '';
  setVal({ veh_nombre: '', veh_matricula: '', veh_fecha_compra: '', veh_precio_compra: '', veh_movertis: '' });
  document.getElementById('veh_amort').value = '96';
  document.getElementById('veh_activo').checked = true;
  document.getElementById('veh_activo_wrap').style.display = 'none';
  document.getElementById('veh_amort_info').style.display = 'none';
  document.getElementById('veh_titulo').textContent = 'Nuevo vehículo';
  openModal('mVehiculo');
}

function editVehiculo(id) {
  const v = flotaVehiculos.find(x => x.id === id);
  if (!v) return;
  document.getElementById('veh_id').value = v.id;
  setVal({
    veh_nombre: v.nombre || '',
    veh_matricula: v.matricula || '',
    veh_fecha_compra: v.fecha_compra || '',
    veh_precio_compra: v.precio_compra ? _flotaFmtInput(v.precio_compra) : '',
    veh_movertis: v.movertis_unit_id || ''
  });
  document.getElementById('veh_amort').value = v.amort_meses || 96;
  document.getElementById('veh_activo').checked = v.activo !== false;
  document.getElementById('veh_activo_wrap').style.display = 'flex';
  document.getElementById('veh_titulo').textContent = 'Editar vehículo';

  // Info amortización
  _flotaShowAmortInfo(v);

  openModal('mVehiculo', true);
}

function _flotaShowAmortInfo(v) {
  const info = document.getElementById('veh_amort_info');
  if (!v.fecha_compra || !v.precio_compra) { info.style.display = 'none'; return; }
  const precio = parseFloat(v.precio_compra) || 0;
  const meses = parseInt(v.amort_meses) || 96;
  const compra = new Date(v.fecha_compra);
  const hoy = new Date();
  const transcurridos = _flotaMesesEntre(compra, hoy);
  const restantes = Math.max(0, meses - transcurridos);
  const cuotaMes = precio / meses;
  const pendiente = cuotaMes * restantes;

  if (restantes <= 0) {
    info.innerHTML = '✅ Vehículo totalmente amortizado';
  } else {
    info.innerHTML = `📊 Cuota: <strong>${_flotaFmt(cuotaMes)}€/mes</strong> · ` +
      `Faltan <strong>${restantes} meses</strong> · ` +
      `Pendiente: <strong>${_flotaFmt(pendiente)}€</strong>`;
  }
  info.style.display = 'block';
}

async function saveVehiculo() {
  const nombre = document.getElementById('veh_nombre').value.trim();
  if (!nombre) { toast('Introduce el nombre del vehículo', 'error'); return; }
  const id = document.getElementById('veh_id').value;

  const precioStr = document.getElementById('veh_precio_compra').value;
  const precio = precioStr ? _parseNumES(precioStr) : null;

  const obj = {
    empresa_id: EMPRESA.id,
    nombre,
    matricula: v('veh_matricula') || null,
    fecha_compra: v('veh_fecha_compra') || null,
    precio_compra: precio,
    amort_meses: parseInt(document.getElementById('veh_amort').value) || 96,
    movertis_unit_id: v('veh_movertis') ? parseInt(v('veh_movertis')) : null,
    activo: document.getElementById('veh_activo').checked
  };

  if (id) {
    const { error } = await sb.from('vehiculos').update(obj).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { error } = await sb.from('vehiculos').insert(obj);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  }

  closeModal('mVehiculo');
  await renderFlota();
  toast('Vehículo guardado ✓', 'success');
}

async function delVehiculo(id) {
  const v = flotaVehiculos.find(x => x.id === id);
  if (!v) return;
  // Comprobar si tiene gastos asociados
  const gastosAsociados = flotaGastos.filter(g => g.vehiculo_id === id).length;
  const msg = gastosAsociados > 0
    ? `¿Eliminar "${v.nombre}"?\n\nTiene ${gastosAsociados} gasto(s) asociado(s) que también se eliminarán.\n\nEsto no se puede deshacer.`
    : `¿Eliminar "${v.nombre}"?\n\nEsto no se puede deshacer.`;
  if (!confirm(msg)) return;

  // Eliminar gastos asociados primero
  if (gastosAsociados > 0) {
    await sb.from('vehiculo_gastos').delete().eq('vehiculo_id', id);
  }
  const { error } = await sb.from('vehiculos').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  await renderFlota();
  toast('Vehículo eliminado', 'success');
}


// ═══════════════════════════════════════════════
//  GASTOS
// ═══════════════════════════════════════════════

async function renderGastos() {
  if (!flotaVehiculos.length && !flotaGastos.length) await _flotaCargar();
  _gastoPopulateSelects();
  _gastoTabla();
}

function _gastoPopulateSelects() {
  // Select de filtro por vehículo
  const sel = document.getElementById('filtro_gasto_vehiculo');
  if (!sel) return;
  // Mantener opciones fijas y añadir vehículos
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Todos los vehículos</option><option value="flota">Gastos de flota</option>';
  flotaVehiculos.filter(v => v.activo !== false).forEach(v => {
    sel.innerHTML += `<option value="${v.id}">${_flotaEsc(v.nombre)}</option>`;
  });
  sel.value = currentVal;

  // Select del modal de gasto
  const selModal = document.getElementById('gasto_vehiculo');
  if (selModal) {
    const modalVal = selModal.value;
    selModal.innerHTML = '<option value="">🚐 Toda la flota (se reparte)</option>';
    flotaVehiculos.filter(v => v.activo !== false).forEach(v => {
      selModal.innerHTML += `<option value="${v.id}">🚐 ${_flotaEsc(v.nombre)}</option>`;
    });
    selModal.value = modalVal;
  }
}

function _gastoTabla() {
  const tbody = document.getElementById('gastosTable');
  const conceptoLabels = {
    gasoil: '⛽ Gasoil', seguro: '🛡️ Seguro', mantenimiento: '🔧 Mantenimiento',
    itv: '📋 ITV', neumaticos: '🛞 Neumáticos', otros: '📎 Otros'
  };

  // Filtros
  const filtroVeh = document.getElementById('filtro_gasto_vehiculo')?.value || '';
  const filtroConc = document.getElementById('filtro_gasto_concepto')?.value || '';
  const filtroMes = document.getElementById('filtro_gasto_mes')?.value || '';

  let gastos = [...flotaGastos];

  if (filtroVeh === 'flota') {
    gastos = gastos.filter(g => !g.vehiculo_id);
  } else if (filtroVeh) {
    gastos = gastos.filter(g => g.vehiculo_id == filtroVeh);
  }
  if (filtroConc) {
    gastos = gastos.filter(g => g.concepto === filtroConc);
  }
  if (filtroMes) {
    gastos = gastos.filter(g => (g.fecha || '').slice(0, 7) === filtroMes);
  }

  if (!gastos.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gris-400)">' +
      '<div style="font-size:40px;margin-bottom:8px">💰</div><strong>Sin gastos</strong>' +
      '<br><span style="font-size:12px">Registra gastos de vehículos o flota</span></td></tr>';
    return;
  }

  // Total filtrado
  const total = gastos.reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);

  tbody.innerHTML = gastos.map(g => {
    const veh = g.vehiculo_id ? flotaVehiculos.find(x => x.id === g.vehiculo_id) : null;
    const vehNombre = veh ? _flotaEsc(veh.nombre) : '<span style="color:var(--azul);font-style:italic">Toda la flota</span>';
    return `<tr onclick="editGasto(${g.id})" class="clickable-row">
      <td>${_flotaFecha(g.fecha)}</td>
      <td>${vehNombre}</td>
      <td>${conceptoLabels[g.concepto] || g.concepto}</td>
      <td style="text-align:right;font-weight:600">${_flotaFmt(parseFloat(g.importe) || 0)}€</td>
      <td style="font-size:12px;color:var(--gris-500)">${_flotaEsc(g.notas || '')}</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editGasto(${g.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delGasto(${g.id})" style="color:var(--rojo)">🗑️</button>
      </td>
    </tr>`;
  }).join('') +
  `<tr style="background:var(--gris-50);font-weight:700">
    <td colspan="3" style="text-align:right">Total (${gastos.length} gastos):</td>
    <td style="text-align:right">${_flotaFmt(total)}€</td>
    <td colspan="2"></td>
  </tr>`;
}

function nuevoGasto() {
  document.getElementById('gasto_id').value = '';
  setVal({ gasto_importe: '', gasto_notas: '' });
  document.getElementById('gasto_vehiculo').value = '';
  document.getElementById('gasto_concepto').value = 'gasoil';
  document.getElementById('gasto_fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('gasto_titulo').textContent = 'Nuevo gasto';
  _gastoPopulateSelects();
  openModal('mGasto');
}

function editGasto(id) {
  const g = flotaGastos.find(x => x.id === id);
  if (!g) return;
  document.getElementById('gasto_id').value = g.id;
  _gastoPopulateSelects();
  document.getElementById('gasto_vehiculo').value = g.vehiculo_id || '';
  document.getElementById('gasto_concepto').value = g.concepto || 'otros';
  document.getElementById('gasto_importe').value = g.importe ? _flotaFmtInput(g.importe) : '';
  document.getElementById('gasto_fecha').value = g.fecha || '';
  document.getElementById('gasto_notas').value = g.notas || '';
  document.getElementById('gasto_titulo').textContent = 'Editar gasto';
  openModal('mGasto', true);
}

async function saveGasto() {
  const importeStr = document.getElementById('gasto_importe').value.trim();
  const importe = _parseNumES(importeStr);
  if (!importe || importe <= 0) { toast('Introduce un importe válido', 'error'); return; }
  const fecha = v('gasto_fecha');
  if (!fecha) { toast('Introduce la fecha', 'error'); return; }

  const id = document.getElementById('gasto_id').value;
  const vehVal = document.getElementById('gasto_vehiculo').value;

  const obj = {
    empresa_id: EMPRESA.id,
    vehiculo_id: vehVal ? parseInt(vehVal) : null,
    concepto: document.getElementById('gasto_concepto').value,
    importe,
    fecha,
    notas: v('gasto_notas') || null
  };

  if (id) {
    const { error } = await sb.from('vehiculo_gastos').update(obj).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { error } = await sb.from('vehiculo_gastos').insert(obj);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  }

  closeModal('mGasto');
  await _flotaCargar();
  _gastoTabla();
  toast('Gasto guardado ✓', 'success');
}

async function delGasto(id) {
  const g = flotaGastos.find(x => x.id === id);
  if (!g) return;
  if (!confirm('¿Eliminar este gasto?\n\nEsto no se puede deshacer.')) return;
  const { error } = await sb.from('vehiculo_gastos').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await _flotaCargar();
  _gastoTabla();
  toast('Gasto eliminado', 'success');
}


// ═══════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════

function _flotaFmt(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _flotaFmtInput(n) {
  // Para rellenar inputs: sin separadores de miles, con coma decimal
  const num = parseFloat(n) || 0;
  return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _flotaFecha(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function _flotaMesesEntre(d1, d2) {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

function _flotaEsc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
