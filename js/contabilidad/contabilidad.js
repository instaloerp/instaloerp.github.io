// ═══════════════════════════════════════════════
// CONTABILIDAD INTERMEDIA — Plan contable, asientos,
// libro diario, libro mayor, balance de sumas y saldos
// ═══════════════════════════════════════════════

let _contCuentas = [];
let _contAsientos = [];
let _contLineas = [];
let _contEjercicios = [];
let _contEjercicioSel = null;   // ejercicio fiscal activo
let _contFiltros = { desde: '', hasta: '', cuenta: '' };
let _contAsientoEditId = null;  // null = nuevo, id = editando
let _contLineasTemp = [];       // líneas temporales del asiento en edición

// ── Helpers ──────────────────────────────────
const _contFmt = n => new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const _contFecha = d => d ? new Date(d).toLocaleDateString('es-ES') : '—';

const _contGrupoNombre = g => ({
  1:'Financiación básica', 2:'Inmovilizado', 3:'Existencias',
  4:'Acreedores/Deudores', 5:'Cuentas financieras', 6:'Gastos', 7:'Ingresos'
}[g] || 'Grupo '+g);

const _contTipoColor = t => ({
  activo:'var(--azul)', pasivo:'var(--rojo)', patrimonio:'var(--violeta)',
  ingreso:'var(--verde)', gasto:'var(--amarillo)'
}[t] || 'var(--gris-500)');

const _contTipoBg = t => ({
  activo:'var(--azul-light)', pasivo:'var(--rojo-light)', patrimonio:'var(--violeta-light)',
  ingreso:'var(--verde-light)', gasto:'var(--amarillo-light)'
}[t] || 'var(--gris-100)');


// ═══════════════════════════════════════════════
//  CARGAR DATOS
// ═══════════════════════════════════════════════

async function _contCargarCuentas() {
  const { data } = await sb.from('cuentas_contables')
    .select('*').eq('empresa_id', EMPRESA.id)
    .order('codigo');
  _contCuentas = data || [];
}

async function _contCargarEjercicios() {
  const { data } = await sb.from('ejercicios_fiscales')
    .select('*').eq('empresa_id', EMPRESA.id)
    .order('fecha_inicio', { ascending: false });
  _contEjercicios = data || [];
  // Seleccionar el ejercicio abierto actual si no hay selección
  if (!_contEjercicioSel && _contEjercicios.length) {
    _contEjercicioSel = _contEjercicios.find(e => e.estado === 'abierto') || _contEjercicios[0];
  }
}

async function _contCargarAsientos(opts = {}) {
  let q = sb.from('asientos').select('*').eq('empresa_id', EMPRESA.id);
  if (_contEjercicioSel) q = q.eq('ejercicio_id', _contEjercicioSel.id);
  if (opts.desde) q = q.gte('fecha', opts.desde);
  if (opts.hasta) q = q.lte('fecha', opts.hasta);
  q = q.order('fecha', { ascending: false }).order('numero', { ascending: false });
  const { data } = await q;
  _contAsientos = data || [];
}

async function _contCargarLineasAsiento(asientoId) {
  const { data } = await sb.from('lineas_asiento')
    .select('*').eq('asiento_id', asientoId)
    .order('orden');
  return data || [];
}

// Cargar TODAS las líneas para reportes (mayor, balance)
async function _contCargarTodasLineas(opts = {}) {
  // Obtener IDs de asientos contabilizados en el rango
  const asientoIds = _contAsientos
    .filter(a => a.estado === 'contabilizado')
    .map(a => a.id);
  if (!asientoIds.length) { _contLineas = []; return; }
  const { data } = await sb.from('lineas_asiento')
    .select('*, asientos!inner(fecha, numero, descripcion, estado)')
    .in('asiento_id', asientoIds)
    .order('asiento_id');
  _contLineas = data || [];
}


// ═══════════════════════════════════════════════
//  PLAN CONTABLE — Página
// ═══════════════════════════════════════════════

async function renderContPlanContable() {
  const page = document.getElementById('page-plan-contable');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando plan contable...</div>';

  await _contCargarCuentas();

  // Si no hay cuentas, ofrecer crear plan base
  if (!_contCuentas.length) {
    page.innerHTML = `
      <div style="padding:60px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">📊</div>
        <h2 style="color:var(--gris-700);margin-bottom:8px">Plan Contable</h2>
        <p style="color:var(--gris-400);margin-bottom:20px">No hay cuentas contables configuradas. ¿Quieres cargar el Plan General Contable simplificado?</p>
        <button class="btn btn-primary" onclick="_contCrearPlanBase()">📋 Cargar PGC simplificado</button>
      </div>`;
    return;
  }

  // KPIs
  const hojas = _contCuentas.filter(c => c.es_hoja && c.activa);
  const grupos = [...new Set(_contCuentas.map(c => c.grupo))];

  let html = '';

  // KPI cards
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:16px">
    <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📊</div><div class="sv">${_contCuentas.length}</div><div class="sl">Cuentas totales</div></div>
    <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">📝</div><div class="sv">${hojas.length}</div><div class="sl">Cuentas operativas</div></div>
    <div class="sc" style="--c:var(--violeta);--bg:var(--violeta-light)"><div class="si">📂</div><div class="sv">${grupos.length}</div><div class="sl">Grupos PGC</div></div>
  </div>`;

  // Toolbar
  html += `<div class="card" style="margin-bottom:14px">
    <div class="card-b" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="contCuentaSearch" placeholder="🔍 Buscar cuenta..." oninput="_contFiltrarPlan()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;width:250px">
      <select id="contGrupoFilter" onchange="_contFiltrarPlan()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">
        <option value="">Todos los grupos</option>
        ${[1,2,3,4,5,6,7].map(g => `<option value="${g}">${g} — ${_contGrupoNombre(g)}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="_contNuevaCuenta()">+ Nueva cuenta</button>
    </div>
  </div>`;

  // Tabla
  html += `<div class="card" style="padding:0;overflow:hidden">
    <table class="dt">
      <thead><tr>
        <th style="width:80px">Código</th>
        <th>Nombre</th>
        <th style="width:100px">Tipo</th>
        <th style="width:60px">Grupo</th>
        <th style="width:80px">Operativa</th>
        <th style="width:80px">Acciones</th>
      </tr></thead>
      <tbody id="contPlanTable"></tbody>
    </table>
  </div>`;

  page.innerHTML = html;
  _contFiltrarPlan();
}

function _contFiltrarPlan() {
  const search = (document.getElementById('contCuentaSearch')?.value || '').toLowerCase();
  const grupo = document.getElementById('contGrupoFilter')?.value || '';
  const tbody = document.getElementById('contPlanTable');
  if (!tbody) return;

  const filtered = _contCuentas.filter(c => {
    if (grupo && c.grupo !== parseInt(grupo)) return false;
    if (search && !c.codigo.includes(search) && !c.nombre.toLowerCase().includes(search)) return false;
    return true;
  });

  tbody.innerHTML = filtered.map(c => {
    const indent = c.es_hoja ? 'padding-left:' + (c.codigo.length * 8) + 'px' : 'font-weight:700';
    return `<tr style="${!c.activa ? 'opacity:0.4' : ''}">
      <td><code style="font-size:13px;font-weight:700;color:${_contTipoColor(c.tipo)}">${c.codigo}</code></td>
      <td style="${indent}">${c.es_hoja ? '' : '📂 '}${c.nombre}</td>
      <td><span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${_contTipoBg(c.tipo)};color:${_contTipoColor(c.tipo)};font-weight:600">${c.tipo}</span></td>
      <td style="text-align:center">${c.grupo}</td>
      <td style="text-align:center">${c.es_hoja ? '✅' : '—'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="_contEditarCuenta(${c.id})" title="Editar">✏️</button>
        ${c.es_hoja ? '' : ''}
      </td>
    </tr>`;
  }).join('');
}

async function _contCrearPlanBase() {
  if (!confirm('¿Cargar el Plan General Contable simplificado? Se crearán ~65 cuentas base.')) return;
  try {
    const { error } = await sb.rpc('insertar_plan_contable_base', { p_empresa_id: EMPRESA.id });
    if (error) throw error;
    showToast('Plan contable cargado correctamente', 'ok');
    renderContPlanContable();
  } catch (e) {
    showToast('Error cargando plan: ' + e.message, 'error');
  }
}

function _contNuevaCuenta() {
  document.getElementById('contCuentaId').value = '';
  document.getElementById('contCuentaCodigo').value = '';
  document.getElementById('contCuentaNombre').value = '';
  document.getElementById('contCuentaTipo').value = 'gasto';
  document.getElementById('contCuentaGrupo').value = '6';
  document.getElementById('contCuentaPadre').value = '';
  document.getElementById('contCuentaHoja').checked = true;
  document.getElementById('contCuentaActiva').checked = true;
  document.getElementById('mContCuentaTit').textContent = 'Nueva Cuenta Contable';
  openModal('mContCuenta');
}

function _contEditarCuenta(id) {
  const c = _contCuentas.find(x => x.id === id);
  if (!c) return;
  document.getElementById('contCuentaId').value = c.id;
  document.getElementById('contCuentaCodigo').value = c.codigo;
  document.getElementById('contCuentaNombre').value = c.nombre;
  document.getElementById('contCuentaTipo').value = c.tipo;
  document.getElementById('contCuentaGrupo').value = c.grupo;
  document.getElementById('contCuentaPadre').value = c.padre_codigo || '';
  document.getElementById('contCuentaHoja').checked = c.es_hoja;
  document.getElementById('contCuentaActiva').checked = c.activa;
  document.getElementById('mContCuentaTit').textContent = 'Editar Cuenta ' + c.codigo;
  openModal('mContCuenta');
}

async function _contGuardarCuenta() {
  const id = document.getElementById('contCuentaId').value;
  const obj = {
    empresa_id: EMPRESA.id,
    codigo: document.getElementById('contCuentaCodigo').value.trim(),
    nombre: document.getElementById('contCuentaNombre').value.trim(),
    tipo: document.getElementById('contCuentaTipo').value,
    grupo: parseInt(document.getElementById('contCuentaGrupo').value),
    padre_codigo: document.getElementById('contCuentaPadre').value.trim() || null,
    es_hoja: document.getElementById('contCuentaHoja').checked,
    activa: document.getElementById('contCuentaActiva').checked
  };
  if (!obj.codigo || !obj.nombre) return showToast('Código y nombre son obligatorios', 'error');

  try {
    if (id) {
      const { error } = await sb.from('cuentas_contables').update(obj).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('cuentas_contables').insert(obj);
      if (error) throw error;
    }
    closeModal('mContCuenta');
    showToast('Cuenta guardada', 'ok');
    renderContPlanContable();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}


// ═══════════════════════════════════════════════
//  LIBRO DIARIO — Página (lista de asientos)
// ═══════════════════════════════════════════════

async function renderContLibroDiario() {
  const page = document.getElementById('page-libro-diario');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando libro diario...</div>';

  await _contCargarEjercicios();
  await _contCargarAsientos(_contFiltros);

  // KPIs
  const contabilizados = _contAsientos.filter(a => a.estado === 'contabilizado');
  const borradores = _contAsientos.filter(a => a.estado === 'borrador');

  let html = '';

  // KPI cards
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:16px">
    <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📖</div><div class="sv">${_contAsientos.length}</div><div class="sl">Asientos totales</div></div>
    <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">✅</div><div class="sv">${contabilizados.length}</div><div class="sl">Contabilizados</div></div>
    <div class="sc" style="--c:var(--amarillo);--bg:var(--amarillo-light)"><div class="si">📝</div><div class="sv">${borradores.length}</div><div class="sl">Borradores</div></div>
  </div>`;

  // Toolbar
  html += `<div class="card" style="margin-bottom:14px">
    <div class="card-b" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="fg" style="margin:0"><label style="font-size:10px">Desde</label><input type="date" id="contDiarioDesde" value="${_contFiltros.desde}" onchange="_contFiltrarDiario()" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12px"></div>
      <div class="fg" style="margin:0"><label style="font-size:10px">Hasta</label><input type="date" id="contDiarioHasta" value="${_contFiltros.hasta}" onchange="_contFiltrarDiario()" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12px"></div>
      <select id="contEjercicioSel" onchange="_contCambiarEjercicio()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">
        ${_contEjercicios.map(e => `<option value="${e.id}" ${_contEjercicioSel?.id === e.id ? 'selected' : ''}>${e.nombre} (${e.estado})</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="_contNuevoAsiento()">+ Nuevo asiento</button>
    </div>
  </div>`;

  // Tabla de asientos
  html += `<div class="card" style="padding:0;overflow:hidden">
    <table class="dt">
      <thead><tr>
        <th style="width:50px">Nº</th>
        <th style="width:90px">Fecha</th>
        <th>Descripción</th>
        <th style="width:100px">Origen</th>
        <th style="width:100px;text-align:right">Debe</th>
        <th style="width:100px;text-align:right">Haber</th>
        <th style="width:90px">Estado</th>
        <th style="width:80px">Acciones</th>
      </tr></thead>
      <tbody id="contDiarioTable"></tbody>
    </table>
  </div>`;

  page.innerHTML = html;
  await _contRenderDiarioRows();
}

async function _contRenderDiarioRows() {
  const tbody = document.getElementById('contDiarioTable');
  if (!tbody) return;

  if (!_contAsientos.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--gris-400)">No hay asientos en este periodo</td></tr>';
    return;
  }

  // Cargar líneas de todos los asientos para mostrar totales
  const ids = _contAsientos.map(a => a.id);
  const { data: lineas } = await sb.from('lineas_asiento')
    .select('asiento_id, debe, haber')
    .in('asiento_id', ids);

  const totalesPorAsiento = {};
  (lineas || []).forEach(l => {
    if (!totalesPorAsiento[l.asiento_id]) totalesPorAsiento[l.asiento_id] = { debe: 0, haber: 0 };
    totalesPorAsiento[l.asiento_id].debe += parseFloat(l.debe || 0);
    totalesPorAsiento[l.asiento_id].haber += parseFloat(l.haber || 0);
  });

  const estadoBadge = e => ({
    borrador: '<span class="badge bg-gray">📝 Borrador</span>',
    contabilizado: '<span class="badge bg-green">✅ Contabilizado</span>',
    anulado: '<span class="badge bg-red">❌ Anulado</span>'
  }[e] || e);

  const origenBadge = o => ({
    manual: '✍️ Manual',
    factura_emitida: '🧾 Fac. emitida',
    factura_recibida: '📥 Fac. recibida',
    cobro: '💰 Cobro',
    pago: '💳 Pago',
    nomina: '👷 Nómina',
    cierre: '🔒 Cierre',
    apertura: '📖 Apertura'
  }[o] || o);

  tbody.innerHTML = _contAsientos.map(a => {
    const t = totalesPorAsiento[a.id] || { debe: 0, haber: 0 };
    const descuadre = Math.abs(t.debe - t.haber) > 0.01;
    return `<tr style="cursor:pointer" onclick="_contVerAsiento(${a.id})">
      <td style="font-weight:700;color:var(--azul)">${a.numero || '—'}</td>
      <td>${_contFecha(a.fecha)}</td>
      <td>${a.descripcion || ''}${a.origen_ref ? ' <span style="font-size:11px;color:var(--gris-400)">(${a.origen_ref})</span>' : ''}</td>
      <td style="font-size:11px">${origenBadge(a.origen)}</td>
      <td style="text-align:right;font-weight:600">${_contFmt(t.debe)} €</td>
      <td style="text-align:right;font-weight:600">${_contFmt(t.haber)} €</td>
      <td>${estadoBadge(a.estado)}${descuadre ? ' <span style="color:var(--rojo);font-size:11px" title="Descuadrado">⚠️</span>' : ''}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_contEditarAsiento(${a.id})" title="Editar">✏️</button>
        ${a.estado === 'borrador' ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_contContabilizarAsiento(${a.id})" title="Contabilizar">✅</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function _contFiltrarDiario() {
  _contFiltros.desde = document.getElementById('contDiarioDesde')?.value || '';
  _contFiltros.hasta = document.getElementById('contDiarioHasta')?.value || '';
  renderContLibroDiario();
}

async function _contCambiarEjercicio() {
  const id = parseInt(document.getElementById('contEjercicioSel')?.value);
  _contEjercicioSel = _contEjercicios.find(e => e.id === id) || null;
  renderContLibroDiario();
}


// ═══════════════════════════════════════════════
//  ASIENTOS — Modal de creación/edición
// ═══════════════════════════════════════════════

function _contNuevoAsiento() {
  _contAsientoEditId = null;
  _contLineasTemp = [
    { cuenta_id: '', cuenta_codigo: '', descripcion: '', debe: 0, haber: 0 },
    { cuenta_id: '', cuenta_codigo: '', descripcion: '', debe: 0, haber: 0 }
  ];
  document.getElementById('contAsientoFecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('contAsientoDesc').value = '';
  document.getElementById('contAsientoOrigen').value = 'manual';
  document.getElementById('contAsientoRef').value = '';
  document.getElementById('mContAsientoTit').textContent = 'Nuevo Asiento Contable';
  _contRenderLineasModal();
  openModal('mContAsiento');
}

async function _contEditarAsiento(id) {
  const a = _contAsientos.find(x => x.id === id);
  if (!a) return;
  _contAsientoEditId = id;
  document.getElementById('contAsientoFecha').value = a.fecha;
  document.getElementById('contAsientoDesc').value = a.descripcion || '';
  document.getElementById('contAsientoOrigen').value = a.origen || 'manual';
  document.getElementById('contAsientoRef').value = a.origen_ref || '';
  document.getElementById('mContAsientoTit').textContent = 'Asiento #' + (a.numero || id);

  // Cargar líneas
  const lineas = await _contCargarLineasAsiento(id);
  _contLineasTemp = lineas.map(l => ({
    id: l.id,
    cuenta_id: l.cuenta_id,
    cuenta_codigo: l.cuenta_codigo,
    descripcion: l.descripcion || '',
    debe: parseFloat(l.debe || 0),
    haber: parseFloat(l.haber || 0)
  }));
  if (_contLineasTemp.length < 2) {
    while (_contLineasTemp.length < 2) {
      _contLineasTemp.push({ cuenta_id: '', cuenta_codigo: '', descripcion: '', debe: 0, haber: 0 });
    }
  }

  _contRenderLineasModal();
  openModal('mContAsiento');
}

async function _contVerAsiento(id) {
  await _contEditarAsiento(id);
}

function _contRenderLineasModal() {
  const container = document.getElementById('contAsientoLineas');
  if (!container) return;

  // Preparar opciones de cuentas (solo hojas)
  const cuentasHoja = _contCuentas.filter(c => c.es_hoja && c.activa);

  let html = `<table style="width:100%;border-collapse:collapse">
    <thead style="background:var(--gris-50)">
      <tr>
        <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:left;width:200px">Cuenta</th>
        <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:left">Descripción</th>
        <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);width:110px;text-align:right">Debe</th>
        <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);width:110px;text-align:right">Haber</th>
        <th style="width:32px"></th>
      </tr>
    </thead>
    <tbody>`;

  _contLineasTemp.forEach((l, i) => {
    html += `<tr>
      <td style="padding:4px 6px">
        <select onchange="_contLineaCuenta(${i}, this.value)" style="width:100%;padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:6px;font-size:12px">
          <option value="">— Cuenta —</option>
          ${cuentasHoja.map(c => `<option value="${c.id}" ${l.cuenta_id == c.id ? 'selected' : ''}>${c.codigo} ${c.nombre}</option>`).join('')}
        </select>
      </td>
      <td style="padding:4px 6px"><input value="${l.descripcion}" onchange="_contLineasTemp[${i}].descripcion=this.value" style="width:100%;padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:6px;font-size:12px" placeholder="Concepto"></td>
      <td style="padding:4px 6px"><input type="number" step="0.01" value="${l.debe || ''}" onchange="_contLineaDebe(${i}, this.value)" style="width:100%;padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:6px;font-size:12px;text-align:right" placeholder="0,00"></td>
      <td style="padding:4px 6px"><input type="number" step="0.01" value="${l.haber || ''}" onchange="_contLineaHaber(${i}, this.value)" style="width:100%;padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:6px;font-size:12px;text-align:right" placeholder="0,00"></td>
      <td style="padding:4px"><button class="btn btn-ghost btn-sm" onclick="_contEliminarLinea(${i})" title="Eliminar" style="color:var(--rojo)">✕</button></td>
    </tr>`;
  });

  html += `</tbody></table>`;

  // Totales
  const totalDebe = _contLineasTemp.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0);
  const totalHaber = _contLineasTemp.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  const descuadre = Math.abs(totalDebe - totalHaber);

  html += `<div style="display:flex;align-items:center;gap:12px;margin-top:8px;padding:8px 10px;background:var(--gris-50);border-radius:8px">
    <button class="btn btn-ghost btn-sm" onclick="_contAgregarLinea()">+ Añadir línea</button>
    <div style="flex:1"></div>
    <span style="font-size:12px;font-weight:700;color:var(--gris-600)">Debe: ${_contFmt(totalDebe)} €</span>
    <span style="font-size:12px;font-weight:700;color:var(--gris-600)">Haber: ${_contFmt(totalHaber)} €</span>
    ${descuadre > 0.01 ? `<span style="font-size:12px;font-weight:700;color:var(--rojo)">⚠️ Descuadre: ${_contFmt(descuadre)} €</span>` : '<span style="font-size:12px;font-weight:700;color:var(--verde)">✅ Cuadrado</span>'}
  </div>`;

  container.innerHTML = html;
}

function _contLineaCuenta(idx, val) {
  const c = _contCuentas.find(x => x.id == val);
  _contLineasTemp[idx].cuenta_id = val ? parseInt(val) : '';
  _contLineasTemp[idx].cuenta_codigo = c ? c.codigo : '';
}

function _contLineaDebe(idx, val) {
  _contLineasTemp[idx].debe = parseFloat(val) || 0;
  if (_contLineasTemp[idx].debe > 0) _contLineasTemp[idx].haber = 0;
  _contRenderLineasModal();
}

function _contLineaHaber(idx, val) {
  _contLineasTemp[idx].haber = parseFloat(val) || 0;
  if (_contLineasTemp[idx].haber > 0) _contLineasTemp[idx].debe = 0;
  _contRenderLineasModal();
}

function _contAgregarLinea() {
  _contLineasTemp.push({ cuenta_id: '', cuenta_codigo: '', descripcion: '', debe: 0, haber: 0 });
  _contRenderLineasModal();
}

function _contEliminarLinea(idx) {
  if (_contLineasTemp.length <= 2) return showToast('Mínimo 2 líneas', 'error');
  _contLineasTemp.splice(idx, 1);
  _contRenderLineasModal();
}

async function _contGuardarAsiento() {
  const fecha = document.getElementById('contAsientoFecha').value;
  const descripcion = document.getElementById('contAsientoDesc').value.trim();
  const origen = document.getElementById('contAsientoOrigen').value;
  const origen_ref = document.getElementById('contAsientoRef').value.trim();

  if (!fecha) return showToast('La fecha es obligatoria', 'error');

  // Validar líneas
  const lineasValidas = _contLineasTemp.filter(l => l.cuenta_id && (l.debe > 0 || l.haber > 0));
  if (lineasValidas.length < 2) return showToast('Mínimo 2 líneas con cuenta y monto', 'error');

  try {
    let asientoId = _contAsientoEditId;

    if (asientoId) {
      // Actualizar cabecera
      const { error } = await sb.from('asientos').update({
        fecha, descripcion, origen, origen_ref: origen_ref || null
      }).eq('id', asientoId);
      if (error) throw error;

      // Borrar líneas existentes y reinsertar
      await sb.from('lineas_asiento').delete().eq('asiento_id', asientoId);
    } else {
      // Calcular número de asiento
      const maxNum = _contAsientos.reduce((m, a) => Math.max(m, a.numero || 0), 0);
      const { data, error } = await sb.from('asientos').insert({
        empresa_id: EMPRESA.id,
        numero: maxNum + 1,
        fecha, descripcion, origen,
        origen_ref: origen_ref || null,
        ejercicio_id: _contEjercicioSel?.id || null,
        usuario_id: CU.id,
        estado: 'borrador'
      }).select().single();
      if (error) throw error;
      asientoId = data.id;
    }

    // Insertar líneas
    const lineasInsert = lineasValidas.map((l, i) => ({
      asiento_id: asientoId,
      cuenta_id: parseInt(l.cuenta_id),
      cuenta_codigo: l.cuenta_codigo,
      descripcion: l.descripcion || null,
      debe: l.debe || 0,
      haber: l.haber || 0,
      orden: i
    }));
    const { error: errLineas } = await sb.from('lineas_asiento').insert(lineasInsert);
    if (errLineas) throw errLineas;

    closeModal('mContAsiento');
    showToast('Asiento guardado', 'ok');
    renderContLibroDiario();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function _contContabilizarAsiento(id) {
  // Verificar que cuadra
  const lineas = await _contCargarLineasAsiento(id);
  const totalD = lineas.reduce((s, l) => s + parseFloat(l.debe || 0), 0);
  const totalH = lineas.reduce((s, l) => s + parseFloat(l.haber || 0), 0);
  if (Math.abs(totalD - totalH) > 0.01) {
    return showToast('El asiento está descuadrado. Debe = Haber para contabilizar.', 'error');
  }
  if (!confirm('¿Contabilizar este asiento? No se podrá editar después.')) return;
  try {
    const { error } = await sb.from('asientos').update({ estado: 'contabilizado' }).eq('id', id);
    if (error) throw error;
    showToast('Asiento contabilizado', 'ok');
    renderContLibroDiario();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}


// ═══════════════════════════════════════════════
//  LIBRO MAYOR — Página (movimientos por cuenta)
// ═══════════════════════════════════════════════

async function renderContLibroMayor() {
  const page = document.getElementById('page-libro-mayor');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando libro mayor...</div>';

  await _contCargarCuentas();
  await _contCargarEjercicios();
  await _contCargarAsientos();

  const cuentasHoja = _contCuentas.filter(c => c.es_hoja && c.activa);

  let html = '';

  // Toolbar
  html += `<div class="card" style="margin-bottom:14px">
    <div class="card-b" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="fg" style="margin:0;min-width:250px">
        <label style="font-size:10px">Cuenta</label>
        <select id="contMayorCuenta" onchange="_contRenderMayor()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">
          <option value="">— Seleccionar cuenta —</option>
          ${cuentasHoja.map(c => `<option value="${c.id}">${c.codigo} — ${c.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="fg" style="margin:0"><label style="font-size:10px">Desde</label><input type="date" id="contMayorDesde" onchange="_contRenderMayor()" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12px"></div>
      <div class="fg" style="margin:0"><label style="font-size:10px">Hasta</label><input type="date" id="contMayorHasta" onchange="_contRenderMayor()" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12px"></div>
    </div>
  </div>`;

  // Contenido (se rellena dinámicamente)
  html += `<div id="contMayorContent"></div>`;

  page.innerHTML = html;
}

async function _contRenderMayor() {
  const container = document.getElementById('contMayorContent');
  if (!container) return;
  const cuentaId = document.getElementById('contMayorCuenta')?.value;
  if (!cuentaId) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Selecciona una cuenta para ver sus movimientos</div>';
    return;
  }

  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gris-400)">Cargando...</div>';

  const cuenta = _contCuentas.find(c => c.id == cuentaId);
  const desde = document.getElementById('contMayorDesde')?.value || '';
  const hasta = document.getElementById('contMayorHasta')?.value || '';

  // Obtener líneas de esta cuenta
  let q = sb.from('lineas_asiento')
    .select('*, asientos!inner(fecha, numero, descripcion, estado)')
    .eq('cuenta_id', cuentaId)
    .eq('asientos.estado', 'contabilizado');
  if (desde) q = q.gte('asientos.fecha', desde);
  if (hasta) q = q.lte('asientos.fecha', hasta);
  const { data: lineas } = await q;

  // Ordenar por fecha
  const sorted = (lineas || []).sort((a, b) => {
    const fa = a.asientos?.fecha || '';
    const fb = b.asientos?.fecha || '';
    return fa.localeCompare(fb) || (a.asientos?.numero || 0) - (b.asientos?.numero || 0);
  });

  // Calcular saldos
  let saldoAcum = 0;
  const rows = sorted.map(l => {
    const debe = parseFloat(l.debe || 0);
    const haber = parseFloat(l.haber || 0);
    saldoAcum += debe - haber;
    return { ...l, saldoAcum };
  });

  const totalDebe = rows.reduce((s, r) => s + parseFloat(r.debe || 0), 0);
  const totalHaber = rows.reduce((s, r) => s + parseFloat(r.haber || 0), 0);

  let html = '';

  // Cabecera de cuenta
  html += `<div class="card" style="margin-bottom:14px">
    <div class="card-h">
      <h3 style="flex:1"><code style="color:${_contTipoColor(cuenta.tipo)};font-weight:800">${cuenta.codigo}</code> — ${cuenta.nombre}</h3>
      <span style="font-size:12px;padding:3px 10px;border-radius:6px;background:${_contTipoBg(cuenta.tipo)};color:${_contTipoColor(cuenta.tipo)};font-weight:600">${cuenta.tipo}</span>
    </div>
  </div>`;

  // KPIs de la cuenta
  html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
    <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📥</div><div class="sv">${_contFmt(totalDebe)} €</div><div class="sl">Total Debe</div></div>
    <div class="sc" style="--c:var(--rojo);--bg:var(--rojo-light)"><div class="si">📤</div><div class="sv">${_contFmt(totalHaber)} €</div><div class="sl">Total Haber</div></div>
    <div class="sc" style="--c:${saldoAcum >= 0 ? 'var(--verde)' : 'var(--rojo)'};--bg:${saldoAcum >= 0 ? 'var(--verde-light)' : 'var(--rojo-light)'}"><div class="si">💰</div><div class="sv">${_contFmt(saldoAcum)} €</div><div class="sl">Saldo</div></div>
  </div>`;

  // Tabla de movimientos
  html += `<div class="card" style="padding:0;overflow:hidden">
    <table class="dt">
      <thead><tr>
        <th style="width:50px">Nº</th>
        <th style="width:90px">Fecha</th>
        <th>Concepto</th>
        <th style="width:110px;text-align:right">Debe</th>
        <th style="width:110px;text-align:right">Haber</th>
        <th style="width:110px;text-align:right">Saldo</th>
      </tr></thead>
      <tbody>`;

  if (!rows.length) {
    html += '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gris-400)">Sin movimientos en este periodo</td></tr>';
  } else {
    rows.forEach(r => {
      html += `<tr>
        <td style="font-weight:700;color:var(--azul)">${r.asientos?.numero || '—'}</td>
        <td>${_contFecha(r.asientos?.fecha)}</td>
        <td>${r.descripcion || r.asientos?.descripcion || ''}</td>
        <td style="text-align:right;${parseFloat(r.debe) > 0 ? 'font-weight:600' : 'color:var(--gris-300)'}">${parseFloat(r.debe) > 0 ? _contFmt(r.debe) + ' €' : '—'}</td>
        <td style="text-align:right;${parseFloat(r.haber) > 0 ? 'font-weight:600' : 'color:var(--gris-300)'}">${parseFloat(r.haber) > 0 ? _contFmt(r.haber) + ' €' : '—'}</td>
        <td style="text-align:right;font-weight:700;color:${r.saldoAcum >= 0 ? 'var(--verde)' : 'var(--rojo)'}">${_contFmt(r.saldoAcum)} €</td>
      </tr>`;
    });
    // Totales
    html += `<tr style="background:var(--gris-50);font-weight:700">
      <td colspan="3" style="text-align:right;padding:10px 12px">TOTALES</td>
      <td style="text-align:right;padding:10px 12px">${_contFmt(totalDebe)} €</td>
      <td style="text-align:right;padding:10px 12px">${_contFmt(totalHaber)} €</td>
      <td style="text-align:right;padding:10px 12px;color:${saldoAcum >= 0 ? 'var(--verde)' : 'var(--rojo)'}">${_contFmt(saldoAcum)} €</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
}


// ═══════════════════════════════════════════════
//  BALANCE DE SUMAS Y SALDOS — Página
// ═══════════════════════════════════════════════

async function renderContBalance() {
  const page = document.getElementById('page-balance-sumas');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Calculando balance...</div>';

  await _contCargarCuentas();
  await _contCargarEjercicios();
  await _contCargarAsientos();
  await _contCargarTodasLineas();

  // Agrupar por cuenta: totales debe/haber y saldo
  const saldos = {};
  _contLineas.forEach(l => {
    const cod = l.cuenta_codigo;
    if (!saldos[cod]) saldos[cod] = { debe: 0, haber: 0 };
    saldos[cod].debe += parseFloat(l.debe || 0);
    saldos[cod].haber += parseFloat(l.haber || 0);
  });

  // Enriquecer con datos de la cuenta
  const filas = Object.entries(saldos).map(([codigo, s]) => {
    const cuenta = _contCuentas.find(c => c.codigo === codigo);
    const saldo = s.debe - s.haber;
    return {
      codigo,
      nombre: cuenta?.nombre || codigo,
      tipo: cuenta?.tipo || '',
      grupo: cuenta?.grupo || 0,
      debe: s.debe,
      haber: s.haber,
      saldoDeudor: saldo > 0 ? saldo : 0,
      saldoAcreedor: saldo < 0 ? Math.abs(saldo) : 0
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo));

  // Totales generales
  const totDebe = filas.reduce((s, f) => s + f.debe, 0);
  const totHaber = filas.reduce((s, f) => s + f.haber, 0);
  const totSD = filas.reduce((s, f) => s + f.saldoDeudor, 0);
  const totSA = filas.reduce((s, f) => s + f.saldoAcreedor, 0);

  let html = '';

  // KPIs
  html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
    <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📥</div><div class="sv">${_contFmt(totDebe)} €</div><div class="sl">Total Debe</div></div>
    <div class="sc" style="--c:var(--rojo);--bg:var(--rojo-light)"><div class="si">📤</div><div class="sv">${_contFmt(totHaber)} €</div><div class="sl">Total Haber</div></div>
    <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">📊</div><div class="sv">${_contFmt(totSD)} €</div><div class="sl">Saldos Deudores</div></div>
    <div class="sc" style="--c:var(--amarillo);--bg:var(--amarillo-light)"><div class="si">📊</div><div class="sv">${_contFmt(totSA)} €</div><div class="sl">Saldos Acreedores</div></div>
  </div>`;

  // Tabla
  html += `<div class="card" style="padding:0;overflow:hidden">
    <table class="dt">
      <thead><tr>
        <th style="width:80px">Cuenta</th>
        <th>Nombre</th>
        <th style="width:110px;text-align:right">Sumas Debe</th>
        <th style="width:110px;text-align:right">Sumas Haber</th>
        <th style="width:110px;text-align:right">Saldo Deudor</th>
        <th style="width:110px;text-align:right">Saldo Acreedor</th>
      </tr></thead>
      <tbody>`;

  if (!filas.length) {
    html += '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gris-400)">No hay asientos contabilizados</td></tr>';
  } else {
    // Agrupar por grupo PGC
    let grupoActual = 0;
    filas.forEach(f => {
      if (f.grupo !== grupoActual) {
        grupoActual = f.grupo;
        html += `<tr style="background:var(--gris-50)"><td colspan="6" style="padding:8px 12px;font-weight:700;font-size:12px;color:var(--gris-600)">Grupo ${grupoActual} — ${_contGrupoNombre(grupoActual)}</td></tr>`;
      }
      html += `<tr>
        <td><code style="font-weight:700;color:${_contTipoColor(f.tipo)}">${f.codigo}</code></td>
        <td>${f.nombre}</td>
        <td style="text-align:right">${_contFmt(f.debe)} €</td>
        <td style="text-align:right">${_contFmt(f.haber)} €</td>
        <td style="text-align:right;${f.saldoDeudor > 0 ? 'font-weight:600;color:var(--azul)' : 'color:var(--gris-300)'}">${f.saldoDeudor > 0 ? _contFmt(f.saldoDeudor) + ' €' : '—'}</td>
        <td style="text-align:right;${f.saldoAcreedor > 0 ? 'font-weight:600;color:var(--rojo)' : 'color:var(--gris-300)'}">${f.saldoAcreedor > 0 ? _contFmt(f.saldoAcreedor) + ' €' : '—'}</td>
      </tr>`;
    });

    // Totales
    html += `<tr style="background:var(--gris-100);font-weight:800">
      <td colspan="2" style="text-align:right;padding:10px 12px">TOTALES</td>
      <td style="text-align:right;padding:10px 12px">${_contFmt(totDebe)} €</td>
      <td style="text-align:right;padding:10px 12px">${_contFmt(totHaber)} €</td>
      <td style="text-align:right;padding:10px 12px">${_contFmt(totSD)} €</td>
      <td style="text-align:right;padding:10px 12px">${_contFmt(totSA)} €</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  page.innerHTML = html;
}


// ═══════════════════════════════════════════════
//  CUENTA DE RESULTADOS (PyG simplificada)
// ═══════════════════════════════════════════════

async function renderContResultados() {
  const page = document.getElementById('page-cuenta-resultados');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Calculando cuenta de resultados...</div>';

  await _contCargarCuentas();
  await _contCargarEjercicios();
  await _contCargarAsientos();
  await _contCargarTodasLineas();

  // Agrupar por cuenta: saldos
  const saldos = {};
  _contLineas.forEach(l => {
    const cod = l.cuenta_codigo;
    if (!saldos[cod]) saldos[cod] = 0;
    saldos[cod] += parseFloat(l.debe || 0) - parseFloat(l.haber || 0);
  });

  // Ingresos (grupo 7): saldo acreedor = ingreso positivo
  const ingresos = _contCuentas
    .filter(c => c.grupo === 7 && c.es_hoja && saldos[c.codigo])
    .map(c => ({ ...c, importe: -(saldos[c.codigo] || 0) })) // negamos porque en G7 el haber es mayor
    .filter(c => c.importe !== 0);

  // Gastos (grupo 6): saldo deudor = gasto positivo
  const gastos = _contCuentas
    .filter(c => c.grupo === 6 && c.es_hoja && saldos[c.codigo])
    .map(c => ({ ...c, importe: saldos[c.codigo] || 0 }))
    .filter(c => c.importe !== 0);

  const totalIngresos = ingresos.reduce((s, c) => s + c.importe, 0);
  const totalGastos = gastos.reduce((s, c) => s + c.importe, 0);
  const resultado = totalIngresos - totalGastos;

  let html = '';

  // KPIs
  html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
    <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">📈</div><div class="sv">${_contFmt(totalIngresos)} €</div><div class="sl">Total Ingresos</div></div>
    <div class="sc" style="--c:var(--rojo);--bg:var(--rojo-light)"><div class="si">📉</div><div class="sv">${_contFmt(totalGastos)} €</div><div class="sl">Total Gastos</div></div>
    <div class="sc" style="--c:${resultado >= 0 ? 'var(--verde)' : 'var(--rojo)'};--bg:${resultado >= 0 ? 'var(--verde-light)' : 'var(--rojo-light)'}"><div class="si">${resultado >= 0 ? '🟢' : '🔴'}</div><div class="sv">${_contFmt(resultado)} €</div><div class="sl">${resultado >= 0 ? 'Beneficio' : 'Pérdida'}</div></div>
  </div>`;

  // Ingresos
  html += `<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
    <div class="card-h"><h3>📈 Ingresos</h3></div>
    <table class="dt">
      <thead><tr><th style="width:80px">Cuenta</th><th>Concepto</th><th style="width:120px;text-align:right">Importe</th></tr></thead>
      <tbody>`;
  if (!ingresos.length) {
    html += '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--gris-400)">Sin ingresos registrados</td></tr>';
  } else {
    ingresos.forEach(c => {
      html += `<tr><td><code style="color:var(--verde);font-weight:700">${c.codigo}</code></td><td>${c.nombre}</td><td style="text-align:right;font-weight:600;color:var(--verde)">${_contFmt(c.importe)} €</td></tr>`;
    });
    html += `<tr style="background:var(--verde-light);font-weight:800"><td colspan="2" style="text-align:right;padding:10px 12px">TOTAL INGRESOS</td><td style="text-align:right;padding:10px 12px;color:var(--verde)">${_contFmt(totalIngresos)} €</td></tr>`;
  }
  html += '</tbody></table></div>';

  // Gastos
  html += `<div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
    <div class="card-h"><h3>📉 Gastos</h3></div>
    <table class="dt">
      <thead><tr><th style="width:80px">Cuenta</th><th>Concepto</th><th style="width:120px;text-align:right">Importe</th></tr></thead>
      <tbody>`;
  if (!gastos.length) {
    html += '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--gris-400)">Sin gastos registrados</td></tr>';
  } else {
    gastos.forEach(c => {
      html += `<tr><td><code style="color:var(--rojo);font-weight:700">${c.codigo}</code></td><td>${c.nombre}</td><td style="text-align:right;font-weight:600;color:var(--rojo)">${_contFmt(c.importe)} €</td></tr>`;
    });
    html += `<tr style="background:var(--rojo-light);font-weight:800"><td colspan="2" style="text-align:right;padding:10px 12px">TOTAL GASTOS</td><td style="text-align:right;padding:10px 12px;color:var(--rojo)">${_contFmt(totalGastos)} €</td></tr>`;
  }
  html += '</tbody></table></div>';

  // Resultado
  html += `<div class="card" style="padding:0;overflow:hidden">
    <table class="dt">
      <tbody><tr style="background:${resultado >= 0 ? 'var(--verde-light)' : 'var(--rojo-light)'};font-weight:800;font-size:15px">
        <td style="padding:14px 16px">${resultado >= 0 ? '🟢 BENEFICIO DEL EJERCICIO' : '🔴 PÉRDIDA DEL EJERCICIO'}</td>
        <td style="text-align:right;padding:14px 16px;color:${resultado >= 0 ? 'var(--verde)' : 'var(--rojo)'}">${_contFmt(resultado)} €</td>
      </tr></tbody>
    </table>
  </div>`;

  page.innerHTML = html;
}


// ═══════════════════════════════════════════════
//  EJERCICIOS FISCALES
// ═══════════════════════════════════════════════

async function _contCrearEjercicioActual() {
  const year = new Date().getFullYear();
  try {
    const { error } = await sb.from('ejercicios_fiscales').insert({
      empresa_id: EMPRESA.id,
      nombre: String(year),
      fecha_inicio: `${year}-01-01`,
      fecha_fin: `${year}-12-31`,
      estado: 'abierto'
    });
    if (error) throw error;
    showToast('Ejercicio ' + year + ' creado', 'ok');
    await _contCargarEjercicios();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
