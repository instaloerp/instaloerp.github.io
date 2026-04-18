// ═══════════════════════════════════════════════
// FLOTA - Vehículos y Gastos
// Sincronizado con Almacenes tipo furgoneta
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

// ── Cargar select de conductores ─────────────
function _flotaCargarConductores(selectedId) {
  const sel = document.getElementById('veh_conductor');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>';
  const users = typeof todosUsuarios !== 'undefined' ? todosUsuarios : [];
  users.filter(u => u.activo !== false).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.nombre || u.email;
    if (u.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
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
  const mesActual = hoy.toISOString().slice(0, 7);

  document.getElementById('flota_kpi_vehiculos').textContent = activos.length;

  const gastoMes = flotaGastos
    .filter(g => (g.fecha || '').slice(0, 7) === mesActual)
    .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);
  document.getElementById('flota_kpi_gasto_mes').textContent = _flotaFmt(gastoMes) + '€';

  // Coste/km: placeholder hasta Movertis
  document.getElementById('flota_kpi_coste_km').textContent = '—';

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
  const users = typeof todosUsuarios !== 'undefined' ? todosUsuarios : [];

  tbody.innerHTML = flotaVehiculos.map(veh => {
    const precio = parseFloat(veh.precio_compra) || 0;
    const meses = parseInt(veh.amort_meses) || 96;

    // Amortización restante
    let amortRestante = '—';
    if (veh.fecha_compra && precio > 0) {
      const compra = new Date(veh.fecha_compra);
      const mesesTranscurridos = _flotaMesesEntre(compra, hoy);
      const restantes = Math.max(0, meses - mesesTranscurridos);
      amortRestante = restantes > 0 ? `${restantes} meses` : '<span style="color:var(--verde)">✓ Amortizado</span>';
    }

    // Gasto 12 meses
    const gastosDirectos = flotaGastos
      .filter(g => g.vehiculo_id === veh.id && g.fecha >= hace12mStr)
      .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);
    const numActivos = flotaVehiculos.filter(x => x.activo !== false).length || 1;
    const gastosFlota = flotaGastos
      .filter(g => !g.vehiculo_id && g.fecha >= hace12mStr)
      .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);
    const gasto12m = gastosDirectos + (gastosFlota / numActivos);

    // Conductor
    const conductor = veh.conductor_id ? users.find(u => u.id === veh.conductor_id) : null;
    const conductorNombre = conductor ? _flotaEsc(conductor.nombre || conductor.email) : '<span style="color:var(--gris-300)">—</span>';

    const inactivo = veh.activo === false;

    return `<tr style="${inactivo ? 'opacity:.5' : ''}" onclick="editVehiculo(${veh.id})" class="clickable-row">
      <td><strong>${_flotaEsc(veh.nombre)}</strong>${inactivo ? ' <span class="badge bg-gray" style="font-size:9px">Inactivo</span>' : ''}</td>
      <td>${_flotaEsc(veh.matricula || '—')}</td>
      <td>${conductorNombre}</td>
      <td>${veh.fecha_compra ? _flotaFecha(veh.fecha_compra) : '—'}</td>
      <td style="text-align:right">${precio > 0 ? _flotaFmt(precio) + '€' : '—'}</td>
      <td style="text-align:right">${amortRestante}</td>
      <td style="text-align:right">${gasto12m > 0 ? _flotaFmt(gasto12m) + '€' : '—'}</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editVehiculo(${veh.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delVehiculo(${veh.id})" style="color:var(--rojo)">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function nuevoVehiculo() {
  document.getElementById('veh_id').value = '';
  setVal({ veh_nombre: '', veh_matricula: '', veh_fecha_compra: '', veh_precio_compra: '', veh_movertis: '', veh_seguro: '', veh_impuesto: '' });
  document.getElementById('veh_amort').value = '96';
  document.getElementById('veh_activo').checked = true;
  document.getElementById('veh_activo_wrap').style.display = 'none';
  document.getElementById('veh_amort_info').style.display = 'none';
  document.getElementById('veh_titulo').textContent = 'Nuevo vehículo';
  _flotaCargarConductores('');
  openModal('mVehiculo');
}

function editVehiculo(id) {
  const veh = flotaVehiculos.find(x => x.id === id);
  if (!veh) return;
  document.getElementById('veh_id').value = veh.id;
  setVal({
    veh_nombre: veh.nombre || '',
    veh_matricula: veh.matricula || '',
    veh_fecha_compra: veh.fecha_compra || '',
    veh_precio_compra: veh.precio_compra ? _flotaFmtInput(veh.precio_compra) : '',
    veh_seguro: veh.seguro_anual ? _flotaFmtInput(veh.seguro_anual) : '',
    veh_impuesto: veh.impuesto_anual ? _flotaFmtInput(veh.impuesto_anual) : '',
    veh_movertis: veh.movertis_unit_id || ''
  });
  document.getElementById('veh_amort').value = veh.amort_meses || 96;
  document.getElementById('veh_activo').checked = veh.activo !== false;
  document.getElementById('veh_activo_wrap').style.display = 'flex';
  document.getElementById('veh_titulo').textContent = 'Editar vehículo';
  _flotaCargarConductores(veh.conductor_id || '');
  _flotaShowAmortInfo(veh);
  openModal('mVehiculo', true);
}

function _flotaShowAmortInfo(veh) {
  const info = document.getElementById('veh_amort_info');
  const precio = parseFloat(veh.precio_compra) || 0;
  const meses = parseInt(veh.amort_meses) || 96;
  const seguro = parseFloat(veh.seguro_anual) || 0;
  const impuesto = parseFloat(veh.impuesto_anual) || 0;
  const fijosMes = (seguro + impuesto) / 12;

  let parts = [];

  if (veh.fecha_compra && precio > 0) {
    const compra = new Date(veh.fecha_compra);
    const hoy = new Date();
    const transcurridos = _flotaMesesEntre(compra, hoy);
    const restantes = Math.max(0, meses - transcurridos);
    const cuotaMes = precio / meses;
    const pendiente = cuotaMes * restantes;
    if (restantes <= 0) {
      parts.push('✅ Amortizado');
    } else {
      parts.push(`📊 Amort: <strong>${_flotaFmt(cuotaMes)}€/mes</strong> · Faltan <strong>${restantes} meses</strong>`);
    }
  }
  if (seguro > 0) parts.push(`🛡️ Seguro: <strong>${_flotaFmt(seguro)}€/año</strong> (${_flotaFmt(seguro/12)}€/mes)`);
  if (impuesto > 0) parts.push(`🏛️ Impuesto: <strong>${_flotaFmt(impuesto)}€/año</strong> (${_flotaFmt(impuesto/12)}€/mes)`);

  if (!parts.length) { info.style.display = 'none'; return; }
  info.innerHTML = parts.join('<br>');
  info.style.display = 'block';
}

async function saveVehiculo() {
  const nombre = document.getElementById('veh_nombre').value.trim();
  if (!nombre) { toast('Introduce el nombre del vehículo', 'error'); return; }
  const id = document.getElementById('veh_id').value;

  const precioStr = document.getElementById('veh_precio_compra').value;
  const precio = precioStr ? _parseNumES(precioStr) : null;
  const seguroStr = document.getElementById('veh_seguro').value;
  const seguro = seguroStr ? _parseNumES(seguroStr) : null;
  const impuestoStr = document.getElementById('veh_impuesto').value;
  const impuesto = impuestoStr ? _parseNumES(impuestoStr) : null;

  const conductorSel = document.getElementById('veh_conductor');
  const conductorId = conductorSel?.value || null;
  const conductorNombre = conductorId
    ? conductorSel.options[conductorSel.selectedIndex]?.textContent
    : null;

  const obj = {
    empresa_id: EMPRESA.id,
    nombre,
    matricula: v('veh_matricula') || null,
    fecha_compra: v('veh_fecha_compra') || null,
    precio_compra: precio,
    amort_meses: parseInt(document.getElementById('veh_amort').value) || 96,
    seguro_anual: seguro,
    impuesto_anual: impuesto,
    movertis_unit_id: v('veh_movertis') ? parseInt(v('veh_movertis')) : null,
    conductor_id: conductorId || null,
    activo: document.getElementById('veh_activo').checked
  };

  let vehiculoId = id;

  if (id) {
    const { error } = await sb.from('vehiculos').update(obj).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { data, error } = await sb.from('vehiculos').insert(obj).select('id').single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    vehiculoId = data.id;
  }

  // ── Sincronizar con Almacenes ──
  await _flotaSyncAlmacen(vehiculoId, obj, conductorId, conductorNombre);

  closeModal('mVehiculo');
  // Recargar almacenes globales para que el sidebar y otros módulos lo vean
  const { data: almData } = await sb.from('almacenes').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  almacenes = almData || [];
  await renderFlota();
  toast('Vehículo guardado ✓', 'success');
}

// ── Sincronización Vehículo → Almacén furgoneta ──
async function _flotaSyncAlmacen(vehiculoId, vehObj, conductorId, conductorNombre) {
  // Buscar almacén vinculado a este vehículo
  const { data: almExist } = await sb.from('almacenes')
    .select('id')
    .eq('empresa_id', EMPRESA.id)
    .eq('vehiculo_id', vehiculoId)
    .limit(1);

  const almData = {
    empresa_id: EMPRESA.id,
    nombre: vehObj.nombre,
    tipo: 'furgoneta',
    matricula: vehObj.matricula,
    operario_id: conductorId || null,
    operario_nombre: conductorNombre || null,
    activo: vehObj.activo,
    vehiculo_id: vehiculoId
  };

  if (almExist && almExist.length > 0) {
    // Actualizar almacén existente
    await sb.from('almacenes').update(almData).eq('id', almExist[0].id);
  } else {
    // Crear nuevo almacén furgoneta
    await sb.from('almacenes').insert(almData);
  }
}

async function delVehiculo(id) {
  const veh = flotaVehiculos.find(x => x.id === id);
  if (!veh) return;
  const gastosAsociados = flotaGastos.filter(g => g.vehiculo_id === id).length;
  const msg = gastosAsociados > 0
    ? `¿Eliminar "${veh.nombre}"?\n\nTiene ${gastosAsociados} gasto(s) asociado(s) que también se eliminarán.\nEl almacén-furgoneta asociado se desactivará.\n\nEsto no se puede deshacer.`
    : `¿Eliminar "${veh.nombre}"?\n\nEl almacén-furgoneta asociado se desactivará.\n\nEsto no se puede deshacer.`;
  if (!confirm(msg)) return;

  // Desactivar almacén vinculado (no eliminar para no perder stock)
  await sb.from('almacenes').update({ activo: false })
    .eq('empresa_id', EMPRESA.id).eq('vehiculo_id', id);

  // Eliminar gastos asociados
  if (gastosAsociados > 0) {
    await sb.from('vehiculo_gastos').delete().eq('vehiculo_id', id);
  }
  const { error } = await sb.from('vehiculos').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  // Recargar almacenes globales
  const { data: almData } = await sb.from('almacenes').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  almacenes = almData || [];

  await renderFlota();
  if (typeof renderAlmacenes === 'function') renderAlmacenes();
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
  const sel = document.getElementById('filtro_gasto_vehiculo');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Todos los vehículos</option><option value="flota">Gastos de flota</option>';
  flotaVehiculos.filter(v => v.activo !== false).forEach(veh => {
    sel.innerHTML += `<option value="${veh.id}">${_flotaEsc(veh.nombre)}</option>`;
  });
  sel.value = currentVal;

  const selModal = document.getElementById('gasto_vehiculo');
  if (selModal) {
    const modalVal = selModal.value;
    selModal.innerHTML = '<option value="">🚐 Toda la flota (se reparte)</option>';
    flotaVehiculos.filter(v => v.activo !== false).forEach(veh => {
      selModal.innerHTML += `<option value="${veh.id}">🚐 ${_flotaEsc(veh.nombre)}</option>`;
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

  const filtroVeh = document.getElementById('filtro_gasto_vehiculo')?.value || '';
  const filtroConc = document.getElementById('filtro_gasto_concepto')?.value || '';
  const filtroMes = document.getElementById('filtro_gasto_mes')?.value || '';

  let gastos = [...flotaGastos];

  if (filtroVeh === 'flota') {
    gastos = gastos.filter(g => !g.vehiculo_id);
  } else if (filtroVeh) {
    gastos = gastos.filter(g => g.vehiculo_id == filtroVeh);
  }
  if (filtroConc) gastos = gastos.filter(g => g.concepto === filtroConc);
  if (filtroMes) gastos = gastos.filter(g => (g.fecha || '').slice(0, 7) === filtroMes);

  if (!gastos.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gris-400)">' +
      '<div style="font-size:40px;margin-bottom:8px">💰</div><strong>Sin gastos</strong>' +
      '<br><span style="font-size:12px">Registra gastos de vehículos o flota</span></td></tr>';
    return;
  }

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
