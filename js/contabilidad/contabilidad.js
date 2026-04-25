// ═══════════════════════════════════════════════
// CONTABILIDAD INTERMEDIA — Plan contable, asientos,
// libro diario, libro mayor, balance de sumas y saldos
// ═══════════════════════════════════════════════

let _contCuentas = [];
let _contAsientos = [];
let _contLineas = [];
let _contEjercicios = [];
let _contEjercicioSel = null;
let _contFiltros = { desde: '', hasta: '', cuenta: '' };
let _contAsientoEditId = null;
let _contLineasTemp = [];

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

async function _contCargarTodasLineas() {
  const asientoIds = _contAsientos
    .filter(a => a.estado === 'contabilizado')
    .map(a => a.id);
  if (!asientoIds.length) { _contLineas = []; return; }
  _contLineas = [];
  for (let i = 0; i < asientoIds.length; i += 50) {
    const batch = asientoIds.slice(i, i + 50);
    const { data } = await sb.from('lineas_asiento')
      .select('*').in('asiento_id', batch).order('orden');
    if (data) _contLineas.push(...data);
  }
}


// ═══════════════════════════════════════════════
//  PLAN CONTABLE
// ═══════════════════════════════════════════════

async function renderContPlanContable() {
  const page = document.getElementById('page-plan-contable');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando plan contable...</div>';

  await _contCargarCuentas();

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

  const hojas = _contCuentas.filter(c => c.es_hoja && c.activa);
  const grupos = [...new Set(_contCuentas.map(c => c.grupo))];

  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:16px">
    <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📊</div><div class="sv">${_contCuentas.length}</div><div class="sl">Cuentas totales</div></div>
    <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">📝</div><div class="sv">${hojas.length}</div><div class="sl">Cuentas operativas</div></div>
    <div class="sc" style="--c:var(--violeta);--bg:var(--violeta-light)"><div class="si">📂</div><div class="sv">${grupos.length}</div><div class="sl">Grupos PGC</div></div>
  </div>`;

  html += `<div class="card" style="margin-bottom:14px">
    <div class="card-b" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="contCuentaSearch" placeholder="🔍 Buscar cuenta..." oninput="_contFiltrarPlan()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;width:250px">
      <select id="contGrupoFilter" onchange="_contFiltrarPlan()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">
        <option value="">Todos los grupos</option>
        ${[1,2,3,4,5,6,7].map(g => '<option value="'+g+'">'+g+' — '+_contGrupoNombre(g)+'</option>').join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="_contNuevaCuenta()">+ Nueva cuenta</button>
    </div>
  </div>`;

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
    return '<tr style="' + (!c.activa ? 'opacity:.5' : '') + '">' +
      '<td style="font-family:monospace;font-weight:700;color:' + _contTipoColor(c.tipo) + '">' + c.codigo + '</td>' +
      '<td style="' + indent + '">' + c.nombre + '</td>' +
      '<td><span style="font-size:11px;padding:2px 8px;border-radius:6px;background:' + _contTipoBg(c.tipo) + ';color:' + _contTipoColor(c.tipo) + ';font-weight:600">' + c.tipo + '</span></td>' +
      '<td style="text-align:center">' + c.grupo + '</td>' +
      '<td style="text-align:center">' + (c.es_hoja ? '✅' : '📂') + '</td>' +
      '<td>' +
        '<button class="btn btn-ghost btn-sm" onclick="_contEditarCuenta(' + c.id + ')" title="Editar">✏️</button>' +
        (c.es_hoja ? '<button class="btn btn-ghost btn-sm" onclick="_contEliminarCuenta(' + c.id + ')" title="Eliminar">🗑️</button>' : '') +
      '</td></tr>';
  }).join('');
}


// ── CRUD Cuentas ──────────────────────────────

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
  if (!obj.codigo || !obj.nombre) { showToast('Código y nombre obligatorios', 'error'); return; }

  let error;
  if (id) {
    ({ error } = await sb.from('cuentas_contables').update(obj).eq('id', id));
  } else {
    ({ error } = await sb.from('cuentas_contables').insert(obj));
  }
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Cuenta guardada', 'ok');
  closeModal('mContCuenta');
  renderContPlanContable();
}

async function _contEliminarCuenta(id) {
  const c = _contCuentas.find(x => x.id === id);
  if (!c || !confirm('¿Eliminar la cuenta ' + c.codigo + ' — ' + c.nombre + '?')) return;
  const { error } = await sb.from('cuentas_contables').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Cuenta eliminada', 'ok');
  renderContPlanContable();
}


// ═══════════════════════════════════════════════
//  LIBRO DIARIO
// ═══════════════════════════════════════════════

async function renderContLibroDiario() {
  const page = document.getElementById('page-libro-diario');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando libro diario...</div>';

  await _contCargarEjercicios();
  await _contCargarCuentas();
  await _contCargarAsientos();

  if (!_contEjercicios.length) {
    page.innerHTML = '<div style="padding:60px;text-align:center">' +
      '<div style="font-size:48px;margin-bottom:16px">📅</div>' +
      '<h2 style="color:var(--gris-700);margin-bottom:8px">Libro Diario</h2>' +
      '<p style="color:var(--gris-400);margin-bottom:20px">Primero necesitas crear un ejercicio fiscal.</p>' +
      '<button class="btn btn-primary" onclick="_contCrearEjercicio()">📅 Crear Ejercicio ' + new Date().getFullYear() + '</button></div>';
    return;
  }

  const borradores = _contAsientos.filter(a => a.estado === 'borrador').length;
  const contabilizados = _contAsientos.filter(a => a.estado === 'contabilizado').length;

  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:16px">' +
    '<div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📖</div><div class="sv">' + _contAsientos.length + '</div><div class="sl">Asientos</div></div>' +
    '<div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">✅</div><div class="sv">' + contabilizados + '</div><div class="sl">Contabilizados</div></div>' +
    '<div class="sc" style="--c:var(--amarillo);--bg:var(--amarillo-light)"><div class="si">✏️</div><div class="sv">' + borradores + '</div><div class="sl">Borradores</div></div>' +
  '</div>';

  html += '<div class="card" style="margin-bottom:14px"><div class="card-b" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
    '<select id="contEjercicioSelect" onchange="_contCambiarEjercicio()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">' +
      _contEjercicios.map(e => '<option value="' + e.id + '"' + (_contEjercicioSel?.id === e.id ? ' selected' : '') + '>' + e.nombre + ' (' + e.estado + ')</option>').join('') +
    '</select>' +
    '<input type="date" id="contFiltroDesde" value="' + _contFiltros.desde + '" onchange="_contRefreshDiario()" style="padding:7px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">' +
    '<input type="date" id="contFiltroHasta" value="' + _contFiltros.hasta + '" onchange="_contRefreshDiario()" style="padding:7px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">' +
    '<div style="flex:1"></div>' +
    '<button class="btn btn-secondary" onclick="_contCrearEjercicio()">📅 + Ejercicio</button>' +
    '<button class="btn btn-warning" onclick="_contContabilizarFacturas()" style="background:var(--amarillo);color:#fff;border:none">⚡ Contabilizar facturas</button>' +
    '<button class="btn btn-primary" onclick="_contNuevoAsiento()">+ Nuevo Asiento</button>' +
  '</div></div>';

  html += '<div class="card" style="padding:0;overflow:hidden"><table class="dt">' +
    '<thead><tr><th style="width:50px">Nº</th><th style="width:100px">Fecha</th><th>Descripción</th><th style="width:100px">Origen</th><th style="width:80px">Estado</th><th style="width:120px">Acciones</th></tr></thead>' +
    '<tbody id="contDiarioTable"></tbody></table></div>';

  page.innerHTML = html;
  _contRenderDiarioTable();
}

function _contRenderDiarioTable() {
  const tbody = document.getElementById('contDiarioTable');
  if (!tbody) return;

  const origenIco = { manual:'✍️', factura_emitida:'🧾', factura_recibida:'📥', cobro:'💰', pago:'💳', nomina:'👷', cierre:'🔒', apertura:'📖' };
  const estadoHtml = e => {
    if (e === 'contabilizado') return '<span style="color:var(--verde);font-weight:600">✅ Cont.</span>';
    if (e === 'anulado') return '<span style="color:var(--rojo);font-weight:600">❌ Anulado</span>';
    return '<span style="color:var(--amarillo);font-weight:600">✏️ Borrador</span>';
  };

  tbody.innerHTML = _contAsientos.map(a => '<tr>' +
    '<td style="font-weight:700;color:var(--gris-500)">' + (a.numero || '—') + '</td>' +
    '<td>' + _contFecha(a.fecha) + '</td>' +
    '<td>' + (a.descripcion || '<span style="color:var(--gris-300)">Sin descripción</span>') + '</td>' +
    '<td>' + (origenIco[a.origen] || '') + ' ' + (a.origen_ref || '') + '</td>' +
    '<td>' + estadoHtml(a.estado) + '</td>' +
    '<td>' +
      '<button class="btn btn-ghost btn-sm" onclick="_contVerAsiento(' + a.id + ')" title="Ver">👁️</button>' +
      (a.estado === 'borrador' ? '<button class="btn btn-ghost btn-sm" onclick="_contEditarAsiento(' + a.id + ')" title="Editar">✏️</button>' : '') +
      (a.estado === 'borrador' ? '<button class="btn btn-ghost btn-sm" onclick="_contContabilizar(' + a.id + ')" title="Contabilizar">✅</button>' : '') +
      (a.estado === 'borrador' ? '<button class="btn btn-ghost btn-sm" onclick="_contEliminarAsiento(' + a.id + ')" title="Eliminar">🗑️</button>' : '') +
    '</td></tr>'
  ).join('');

  if (!_contAsientos.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gris-400)">No hay asientos en este ejercicio</td></tr>';
  }
}

async function _contCambiarEjercicio() {
  const id = parseInt(document.getElementById('contEjercicioSelect')?.value);
  _contEjercicioSel = _contEjercicios.find(e => e.id === id) || null;
  await _contRefreshDiario();
}

async function _contRefreshDiario() {
  _contFiltros.desde = document.getElementById('contFiltroDesde')?.value || '';
  _contFiltros.hasta = document.getElementById('contFiltroHasta')?.value || '';
  await _contCargarAsientos({ desde: _contFiltros.desde, hasta: _contFiltros.hasta });
  _contRenderDiarioTable();
}


// ── Ejercicios ────────────────────────────────

async function _contCrearEjercicio() {
  const year = parseInt(prompt('Año del ejercicio fiscal:', new Date().getFullYear()));
  if (!year || isNaN(year)) return;
  const obj = {
    empresa_id: EMPRESA.id,
    nombre: String(year),
    fecha_inicio: year + '-01-01',
    fecha_fin: year + '-12-31',
    estado: 'abierto'
  };
  const { data, error } = await sb.from('ejercicios_fiscales').insert(obj).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Ejercicio ' + year + ' creado', 'ok');
  _contEjercicioSel = data;
  renderContLibroDiario();
}


// ── CRUD Asientos ─────────────────────────────

function _contNuevoAsiento() {
  _contAsientoEditId = null;
  _contLineasTemp = [
    { cuenta_codigo: '', descripcion: '', debe: 0, haber: 0 },
    { cuenta_codigo: '', descripcion: '', debe: 0, haber: 0 }
  ];
  document.getElementById('contAsientoFecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('contAsientoDesc').value = '';
  document.getElementById('contAsientoOrigen').value = 'manual';
  document.getElementById('contAsientoRef').value = '';
  document.getElementById('mContAsientoTit').textContent = 'Nuevo Asiento Contable';
  _contRenderLineasEditor();
  openModal('mContAsiento');
}

async function _contEditarAsiento(id) {
  _contAsientoEditId = id;
  const a = _contAsientos.find(x => x.id === id);
  if (!a) return;
  document.getElementById('contAsientoFecha').value = a.fecha;
  document.getElementById('contAsientoDesc').value = a.descripcion || '';
  document.getElementById('contAsientoOrigen').value = a.origen;
  document.getElementById('contAsientoRef').value = a.origen_ref || '';
  document.getElementById('mContAsientoTit').textContent = 'Editar Asiento #' + (a.numero || id);

  const lineas = await _contCargarLineasAsiento(id);
  _contLineasTemp = lineas.map(l => ({
    id: l.id, cuenta_codigo: l.cuenta_codigo,
    descripcion: l.descripcion || '', debe: l.debe || 0, haber: l.haber || 0
  }));
  if (_contLineasTemp.length < 2) {
    while (_contLineasTemp.length < 2) _contLineasTemp.push({ cuenta_codigo: '', descripcion: '', debe: 0, haber: 0 });
  }
  _contRenderLineasEditor();
  openModal('mContAsiento');
}

function _contRenderLineasEditor() {
  const container = document.getElementById('contAsientoLineas');
  if (!container) return;

  const totalDebe = _contLineasTemp.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0);
  const totalHaber = _contLineasTemp.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  const diff = Math.abs(totalDebe - totalHaber);
  const cuadra = diff < 0.01;

  let html = '<table style="width:100%;font-size:13px;border-collapse:collapse">' +
    '<thead><tr style="background:var(--gris-50)">' +
    '<th style="padding:6px;text-align:left;width:120px">Cuenta</th>' +
    '<th style="padding:6px;text-align:left">Concepto</th>' +
    '<th style="padding:6px;text-align:right;width:110px">Debe</th>' +
    '<th style="padding:6px;text-align:right;width:110px">Haber</th>' +
    '<th style="padding:6px;width:40px"></th>' +
    '</tr></thead><tbody>';

  _contLineasTemp.forEach((l, i) => {
    html += '<tr>' +
      '<td style="padding:4px"><input value="' + l.cuenta_codigo + '" onchange="_contLineasTemp[' + i + '].cuenta_codigo=this.value" placeholder="4300" style="width:100%;padding:5px;border:1px solid var(--gris-200);border-radius:6px;font-family:monospace;font-size:13px"></td>' +
      '<td style="padding:4px"><input value="' + l.descripcion + '" onchange="_contLineasTemp[' + i + '].descripcion=this.value" placeholder="Concepto" style="width:100%;padding:5px;border:1px solid var(--gris-200);border-radius:6px;font-size:13px"></td>' +
      '<td style="padding:4px"><input type="number" step="0.01" value="' + (l.debe || '') + '" onchange="_contLineasTemp[' + i + '].debe=parseFloat(this.value)||0;_contRenderLineasEditor()" placeholder="0.00" style="width:100%;padding:5px;border:1px solid var(--gris-200);border-radius:6px;font-size:13px;text-align:right"></td>' +
      '<td style="padding:4px"><input type="number" step="0.01" value="' + (l.haber || '') + '" onchange="_contLineasTemp[' + i + '].haber=parseFloat(this.value)||0;_contRenderLineasEditor()" placeholder="0.00" style="width:100%;padding:5px;border:1px solid var(--gris-200);border-radius:6px;font-size:13px;text-align:right"></td>' +
      '<td style="padding:4px;text-align:center"><button onclick="_contLineasTemp.splice(' + i + ',1);_contRenderLineasEditor()" style="border:none;background:none;cursor:pointer;font-size:14px;color:var(--rojo)">✕</button></td>' +
    '</tr>';
  });

  html += '</tbody><tfoot><tr style="border-top:2px solid var(--gris-300);font-weight:800">' +
    '<td colspan="2" style="padding:8px"><button onclick="_contLineasTemp.push({cuenta_codigo:\'\',descripcion:\'\',debe:0,haber:0});_contRenderLineasEditor()" class="btn btn-ghost btn-sm">+ Línea</button></td>' +
    '<td style="padding:8px;text-align:right">' + _contFmt(totalDebe) + '</td>' +
    '<td style="padding:8px;text-align:right">' + _contFmt(totalHaber) + '</td>' +
    '<td></td></tr>' +
    '<tr><td colspan="5" style="padding:4px 8px;font-size:12px;text-align:right;color:' + (cuadra ? 'var(--verde)' : 'var(--rojo)') + '">' +
      (cuadra ? '✅ Asiento cuadrado' : '⚠️ Descuadre: ' + _contFmt(diff)) +
    '</td></tr></tfoot></table>';

  container.innerHTML = html;
}

async function _contGuardarAsiento() {
  const fecha = document.getElementById('contAsientoFecha').value;
  if (!fecha) { showToast('Fecha obligatoria', 'error'); return; }

  const lineasValidas = _contLineasTemp.filter(l => l.cuenta_codigo.trim());
  if (lineasValidas.length < 2) { showToast('Mínimo 2 líneas con cuenta', 'error'); return; }

  for (const l of lineasValidas) {
    const cuenta = _contCuentas.find(c => c.codigo === l.cuenta_codigo.trim());
    if (!cuenta) { showToast('Cuenta ' + l.cuenta_codigo + ' no existe en el plan contable', 'error'); return; }
    if (!cuenta.es_hoja) { showToast('Cuenta ' + l.cuenta_codigo + ' no es operativa (es grupo)', 'error'); return; }
  }

  const asientoObj = {
    empresa_id: EMPRESA.id, fecha,
    descripcion: document.getElementById('contAsientoDesc').value.trim() || null,
    origen: document.getElementById('contAsientoOrigen').value,
    origen_ref: document.getElementById('contAsientoRef').value.trim() || null,
    ejercicio_id: _contEjercicioSel?.id || null,
    estado: 'borrador'
  };

  try {
    let asientoId;
    if (_contAsientoEditId) {
      const { error } = await sb.from('asientos').update(asientoObj).eq('id', _contAsientoEditId);
      if (error) throw error;
      asientoId = _contAsientoEditId;
      await sb.from('lineas_asiento').delete().eq('asiento_id', asientoId);
    } else {
      const maxNum = _contAsientos.reduce((m, a) => Math.max(m, a.numero || 0), 0);
      asientoObj.numero = maxNum + 1;
      asientoObj.usuario_id = (typeof CU !== 'undefined' && CU?.id) ? CU.id : null;
      const { data, error } = await sb.from('asientos').insert(asientoObj).select().single();
      if (error) throw error;
      asientoId = data.id;
    }

    const lineasInsert = lineasValidas.map((l, i) => {
      const cuenta = _contCuentas.find(c => c.codigo === l.cuenta_codigo.trim());
      return {
        asiento_id: asientoId, cuenta_id: cuenta.id, cuenta_codigo: l.cuenta_codigo.trim(),
        descripcion: l.descripcion || null, debe: parseFloat(l.debe) || 0, haber: parseFloat(l.haber) || 0, orden: i
      };
    });
    const { error: lineError } = await sb.from('lineas_asiento').insert(lineasInsert);
    if (lineError) throw lineError;

    showToast('Asiento guardado', 'ok');
    closeModal('mContAsiento');
    renderContLibroDiario();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function _contContabilizar(id) {
  if (!confirm('¿Contabilizar este asiento? No se podrá editar después.')) return;
  const lineas = await _contCargarLineasAsiento(id);
  const totalD = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  const totalH = lineas.reduce((s, l) => s + (l.haber || 0), 0);
  if (Math.abs(totalD - totalH) >= 0.01) { showToast('El asiento no cuadra (Debe ≠ Haber)', 'error'); return; }

  const { error } = await sb.from('asientos').update({ estado: 'contabilizado' }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Asiento contabilizado', 'ok');
  renderContLibroDiario();
}

async function _contEliminarAsiento(id) {
  if (!confirm('¿Eliminar este asiento?')) return;
  const { error } = await sb.from('asientos').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Asiento eliminado', 'ok');
  renderContLibroDiario();
}

async function _contVerAsiento(id) {
  const a = _contAsientos.find(x => x.id === id);
  if (!a) return;
  const lineas = await _contCargarLineasAsiento(id);
  const totalD = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  const totalH = lineas.reduce((s, l) => s + (l.haber || 0), 0);

  let html = '<div style="padding:20px">' +
    '<h3 style="margin-bottom:12px">📖 Asiento #' + (a.numero || a.id) + ' — ' + _contFecha(a.fecha) + '</h3>' +
    '<p style="color:var(--gris-500);margin-bottom:16px">' + (a.descripcion || 'Sin descripción') + ' · ' + a.origen + (a.origen_ref ? ' · Ref: ' + a.origen_ref : '') + '</p>' +
    '<table style="width:100%;font-size:13px;border-collapse:collapse">' +
    '<thead><tr style="background:var(--gris-50);font-weight:700"><th style="padding:8px;text-align:left">Cuenta</th><th style="padding:8px;text-align:left">Concepto</th><th style="padding:8px;text-align:right">Debe</th><th style="padding:8px;text-align:right">Haber</th></tr></thead><tbody>';

  lineas.forEach(l => {
    const cta = _contCuentas.find(c => c.id === l.cuenta_id);
    html += '<tr style="border-bottom:1px solid var(--gris-100)">' +
      '<td style="padding:6px;font-family:monospace;font-weight:700">' + l.cuenta_codigo + ' <span style="font-weight:400;font-family:var(--font);color:var(--gris-500)">' + (cta?.nombre || '') + '</span></td>' +
      '<td style="padding:6px">' + (l.descripcion || '') + '</td>' +
      '<td style="padding:6px;text-align:right;' + (l.debe ? 'font-weight:700' : 'color:var(--gris-300)') + '">' + _contFmt(l.debe) + '</td>' +
      '<td style="padding:6px;text-align:right;' + (l.haber ? 'font-weight:700' : 'color:var(--gris-300)') + '">' + _contFmt(l.haber) + '</td></tr>';
  });

  html += '</tbody><tfoot><tr style="border-top:2px solid var(--gris-300);font-weight:800">' +
    '<td colspan="2" style="padding:8px">Totales</td>' +
    '<td style="padding:8px;text-align:right">' + _contFmt(totalD) + '</td>' +
    '<td style="padding:8px;text-align:right">' + _contFmt(totalH) + '</td>' +
    '</tr></tfoot></table>' +
    '<div style="text-align:right;margin-top:12px"><button class="btn btn-secondary" onclick="closeModal(\'mContVerAsiento\')">Cerrar</button></div></div>';

  let overlay = document.getElementById('mContVerAsiento');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'mContVerAsiento';
    overlay.innerHTML = '<div class="modal modal-lg"><div id="mContVerAsientoBody"></div></div>';
    document.body.appendChild(overlay);
  }
  document.getElementById('mContVerAsientoBody').innerHTML = html;
  openModal('mContVerAsiento');
}


// ═══════════════════════════════════════════════
//  LIBRO MAYOR
// ═══════════════════════════════════════════════

async function renderContLibroMayor() {
  const page = document.getElementById('page-libro-mayor');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando libro mayor...</div>';

  await _contCargarEjercicios();
  await _contCargarCuentas();
  await _contCargarAsientos();
  await _contCargarTodasLineas();

  if (!_contCuentas.length) {
    page.innerHTML = '<div style="padding:60px;text-align:center;color:var(--gris-400)"><div style="font-size:48px;margin-bottom:12px">📒</div><p>Primero configura el plan contable.</p></div>';
    return;
  }

  const porCuenta = {};
  _contLineas.forEach(l => {
    if (!porCuenta[l.cuenta_codigo]) porCuenta[l.cuenta_codigo] = { debe: 0, haber: 0, lineas: [] };
    porCuenta[l.cuenta_codigo].debe += l.debe || 0;
    porCuenta[l.cuenta_codigo].haber += l.haber || 0;
    porCuenta[l.cuenta_codigo].lineas.push(l);
  });

  let html = '<div class="card" style="margin-bottom:14px"><div class="card-b" style="padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
    '<select id="contMayorEjercicio" onchange="_contCambiarEjercicioMayor()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">' +
      _contEjercicios.map(e => '<option value="' + e.id + '"' + (_contEjercicioSel?.id === e.id ? ' selected' : '') + '>' + e.nombre + '</option>').join('') +
    '</select>' +
    '<input type="text" id="contMayorSearch" placeholder="🔍 Buscar cuenta..." oninput="_contFiltrarMayor()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;width:200px">' +
    '<span style="flex:1"></span>' +
    '<span style="font-size:12px;color:var(--gris-400)">' + Object.keys(porCuenta).length + ' cuentas con movimientos</span>' +
  '</div></div>';

  const cuentasConMov = _contCuentas.filter(c => porCuenta[c.codigo]);
  html += '<div id="contMayorCards">';
  cuentasConMov.forEach(c => {
    const info = porCuenta[c.codigo];
    const saldo = info.debe - info.haber;
    html += '<div class="card" style="margin-bottom:10px" data-codigo="' + c.codigo + '" data-nombre="' + c.nombre.toLowerCase() + '">' +
      '<div class="card-b" style="padding:12px 16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<div><span style="font-family:monospace;font-weight:800;color:' + _contTipoColor(c.tipo) + '">' + c.codigo + '</span>' +
          '<span style="font-weight:600;margin-left:8px">' + c.nombre + '</span></div>' +
          '<div style="font-weight:800;font-size:15px;color:' + (saldo >= 0 ? 'var(--azul)' : 'var(--rojo)') + '">' + _contFmt(Math.abs(saldo)) + ' ' + (saldo >= 0 ? 'D' : 'H') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:20px;font-size:12px;color:var(--gris-500)">' +
          '<span>Debe: <b style="color:var(--gris-700)">' + _contFmt(info.debe) + '</b></span>' +
          '<span>Haber: <b style="color:var(--gris-700)">' + _contFmt(info.haber) + '</b></span>' +
          '<span>' + info.lineas.length + ' apuntes</span>' +
        '</div></div></div>';
  });
  html += '</div>';

  if (!cuentasConMov.length) {
    html += '<div style="padding:40px;text-align:center;color:var(--gris-400)">No hay movimientos contabilizados en este ejercicio</div>';
  }

  page.innerHTML = html;
}

function _contFiltrarMayor() {
  const search = (document.getElementById('contMayorSearch')?.value || '').toLowerCase();
  document.querySelectorAll('#contMayorCards .card').forEach(card => {
    const codigo = card.dataset.codigo || '';
    const nombre = card.dataset.nombre || '';
    card.style.display = (!search || codigo.includes(search) || nombre.includes(search)) ? '' : 'none';
  });
}

async function _contCambiarEjercicioMayor() {
  const id = parseInt(document.getElementById('contMayorEjercicio')?.value);
  _contEjercicioSel = _contEjercicios.find(e => e.id === id) || null;
  renderContLibroMayor();
}


// ═══════════════════════════════════════════════
//  BALANCE DE SUMAS Y SALDOS
// ═══════════════════════════════════════════════

async function renderContBalance() {
  const page = document.getElementById('page-balance-sumas');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando balance...</div>';

  await _contCargarEjercicios();
  await _contCargarCuentas();
  await _contCargarAsientos();
  await _contCargarTodasLineas();

  const porCuenta = {};
  _contLineas.forEach(l => {
    if (!porCuenta[l.cuenta_codigo]) porCuenta[l.cuenta_codigo] = { debe: 0, haber: 0 };
    porCuenta[l.cuenta_codigo].debe += l.debe || 0;
    porCuenta[l.cuenta_codigo].haber += l.haber || 0;
  });

  let totalDebe = 0, totalHaber = 0, totalSaldoD = 0, totalSaldoH = 0;
  let rows = '';
  _contCuentas.filter(c => porCuenta[c.codigo]).forEach(c => {
    const info = porCuenta[c.codigo];
    const saldo = info.debe - info.haber;
    const saldoD = saldo > 0 ? saldo : 0;
    const saldoH = saldo < 0 ? Math.abs(saldo) : 0;
    totalDebe += info.debe; totalHaber += info.haber;
    totalSaldoD += saldoD; totalSaldoH += saldoH;

    rows += '<tr>' +
      '<td style="font-family:monospace;font-weight:700;color:' + _contTipoColor(c.tipo) + '">' + c.codigo + '</td>' +
      '<td>' + c.nombre + '</td>' +
      '<td style="text-align:right">' + _contFmt(info.debe) + '</td>' +
      '<td style="text-align:right">' + _contFmt(info.haber) + '</td>' +
      '<td style="text-align:right;font-weight:700;color:' + (saldoD ? 'var(--azul)' : 'var(--gris-300)') + '">' + _contFmt(saldoD) + '</td>' +
      '<td style="text-align:right;font-weight:700;color:' + (saldoH ? 'var(--rojo)' : 'var(--gris-300)') + '">' + _contFmt(saldoH) + '</td></tr>';
  });

  let html = '<div class="card" style="margin-bottom:14px"><div class="card-b" style="padding:12px 16px;display:flex;gap:10px;align-items:center">' +
    '<select onchange="_contEjercicioSel=_contEjercicios.find(e=>e.id===parseInt(this.value));renderContBalance()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">' +
      _contEjercicios.map(e => '<option value="' + e.id + '"' + (_contEjercicioSel?.id === e.id ? ' selected' : '') + '>' + e.nombre + '</option>').join('') +
    '</select></div></div>' +
    '<div class="card" style="padding:0;overflow:hidden"><table class="dt">' +
    '<thead><tr><th style="width:80px">Cuenta</th><th>Nombre</th>' +
    '<th style="width:110px;text-align:right">Sumas Debe</th><th style="width:110px;text-align:right">Sumas Haber</th>' +
    '<th style="width:110px;text-align:right">Saldo Deudor</th><th style="width:110px;text-align:right">Saldo Acreedor</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gris-400)">Sin movimientos contabilizados</td></tr>') + '</tbody>' +
    '<tfoot><tr style="font-weight:800;border-top:2px solid var(--gris-300)">' +
    '<td colspan="2" style="padding:8px">TOTALES</td>' +
    '<td style="text-align:right;padding:8px">' + _contFmt(totalDebe) + '</td>' +
    '<td style="text-align:right;padding:8px">' + _contFmt(totalHaber) + '</td>' +
    '<td style="text-align:right;padding:8px;color:var(--azul)">' + _contFmt(totalSaldoD) + '</td>' +
    '<td style="text-align:right;padding:8px;color:var(--rojo)">' + _contFmt(totalSaldoH) + '</td>' +
    '</tr></tfoot></table></div>';

  page.innerHTML = html;
}


// ═══════════════════════════════════════════════
//  CUENTA DE RESULTADOS
// ═══════════════════════════════════════════════

async function renderContResultados() {
  const page = document.getElementById('page-cuenta-resultados');
  if (!page) return;
  page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gris-400)">Cargando cuenta de resultados...</div>';

  await _contCargarEjercicios();
  await _contCargarCuentas();
  await _contCargarAsientos();
  await _contCargarTodasLineas();

  const porCuenta = {};
  _contLineas.forEach(l => {
    if (!porCuenta[l.cuenta_codigo]) porCuenta[l.cuenta_codigo] = { debe: 0, haber: 0 };
    porCuenta[l.cuenta_codigo].debe += l.debe || 0;
    porCuenta[l.cuenta_codigo].haber += l.haber || 0;
  });

  let totalIngresos = 0, ingresosRows = '';
  _contCuentas.filter(c => c.grupo === 7 && c.es_hoja && porCuenta[c.codigo]).forEach(c => {
    const info = porCuenta[c.codigo];
    const saldo = info.haber - info.debe;
    totalIngresos += saldo;
    ingresosRows += '<tr><td style="font-family:monospace;font-weight:600;color:var(--verde)">' + c.codigo + '</td>' +
      '<td>' + c.nombre + '</td>' +
      '<td style="text-align:right;font-weight:600;color:var(--verde)">' + _contFmt(saldo) + '</td></tr>';
  });

  let totalGastos = 0, gastosRows = '';
  _contCuentas.filter(c => c.grupo === 6 && c.es_hoja && porCuenta[c.codigo]).forEach(c => {
    const info = porCuenta[c.codigo];
    const saldo = info.debe - info.haber;
    totalGastos += saldo;
    gastosRows += '<tr><td style="font-family:monospace;font-weight:600;color:var(--amarillo)">' + c.codigo + '</td>' +
      '<td>' + c.nombre + '</td>' +
      '<td style="text-align:right;font-weight:600;color:var(--amarillo)">' + _contFmt(saldo) + '</td></tr>';
  });

  const resultado = totalIngresos - totalGastos;

  let html = '<div class="card" style="margin-bottom:14px"><div class="card-b" style="padding:12px 16px;display:flex;gap:10px;align-items:center">' +
    '<select onchange="_contEjercicioSel=_contEjercicios.find(e=>e.id===parseInt(this.value));renderContResultados()" style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px">' +
      _contEjercicios.map(e => '<option value="' + e.id + '"' + (_contEjercicioSel?.id === e.id ? ' selected' : '') + '>' + e.nombre + '</option>').join('') +
    '</select></div></div>' +

    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">' +
    '<div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">📈</div><div class="sv">' + _contFmt(totalIngresos) + '</div><div class="sl">Total Ingresos</div></div>' +
    '<div class="sc" style="--c:var(--amarillo);--bg:var(--amarillo-light)"><div class="si">📉</div><div class="sv">' + _contFmt(totalGastos) + '</div><div class="sl">Total Gastos</div></div>' +
    '<div class="sc" style="--c:' + (resultado >= 0 ? 'var(--verde)' : 'var(--rojo)') + ';--bg:' + (resultado >= 0 ? 'var(--verde-light)' : 'var(--rojo-light)') + '"><div class="si">' + (resultado >= 0 ? '🟢' : '🔴') + '</div><div class="sv">' + _contFmt(resultado) + '</div><div class="sl">Resultado</div></div>' +
    '</div>' +

    '<div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">' +
    '<div style="padding:12px 16px;font-weight:700;background:var(--verde-light);color:var(--verde);border-bottom:1px solid var(--gris-100)">📈 Ingresos (Grupo 7)</div>' +
    '<table class="dt"><thead><tr><th style="width:80px">Cuenta</th><th>Concepto</th><th style="width:120px;text-align:right">Importe</th></tr></thead>' +
    '<tbody>' + (ingresosRows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--gris-400)">Sin ingresos</td></tr>') + '</tbody>' +
    '<tfoot><tr style="font-weight:800;border-top:2px solid var(--gris-300)"><td colspan="2" style="padding:8px">Total Ingresos</td>' +
    '<td style="text-align:right;padding:8px;color:var(--verde)">' + _contFmt(totalIngresos) + '</td></tr></tfoot></table></div>' +

    '<div class="card" style="padding:0;overflow:hidden">' +
    '<div style="padding:12px 16px;font-weight:700;background:var(--amarillo-light);color:var(--amarillo);border-bottom:1px solid var(--gris-100)">📉 Gastos (Grupo 6)</div>' +
    '<table class="dt"><thead><tr><th style="width:80px">Cuenta</th><th>Concepto</th><th style="width:120px;text-align:right">Importe</th></tr></thead>' +
    '<tbody>' + (gastosRows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--gris-400)">Sin gastos</td></tr>') + '</tbody>' +
    '<tfoot><tr style="font-weight:800;border-top:2px solid var(--gris-300)"><td colspan="2" style="padding:8px">Total Gastos</td>' +
    '<td style="text-align:right;padding:8px;color:var(--amarillo)">' + _contFmt(totalGastos) + '</td></tr></tfoot></table></div>';

  page.innerHTML = html;
}


// ═══════════════════════════════════════════════
//  CONTABILIZACIÓN AUTOMÁTICA DE FACTURAS
// ═══════════════════════════════════════════════

function _contBuscarCuenta(codigo) {
  return _contCuentas.find(c => c.codigo === codigo && c.es_hoja);
}

// ── Subcuentas individualizadas por NIF (430XXXX / 400XXXX) ──
// Patrón gestoría: prefijo (430/400) + últimos 4 dígitos numéricos del NIF
// Si hay colisión (otro tercero con mismos 4 dígitos), incrementa hasta encontrar libre
const _contSubcuentaCache = {}; // { 'venta_B12345678': '4305678', ... }

function _contExtraerDigitosNif(nif) {
  if (!nif) return null;
  const soloDigitos = nif.replace(/[^0-9]/g, '');
  if (soloDigitos.length < 4) return null;
  return soloDigitos.slice(-4);
}

async function _contObtenerSubcuenta(tipo, nif, nombre) {
  // tipo: 'venta' (→430) o 'compra' (→400)
  // Devuelve el código de subcuenta (ej: '4309726')
  // Si no hay NIF, usa la cuenta genérica 430 o 400
  const prefijo = tipo === 'venta' ? '430' : '400';
  if (!nif) return prefijo;

  // Cache para no repetir queries
  const cacheKey = tipo + '_' + nif.toUpperCase().trim();
  if (_contSubcuentaCache[cacheKey]) return _contSubcuentaCache[cacheKey];

  const digitos = _contExtraerDigitosNif(nif);
  if (!digitos) return prefijo;

  let candidato = prefijo + digitos; // ej: '4309726'

  // Buscar si ya existe esta subcuenta en cuentas_contables
  const { data: existentes } = await sb.from('cuentas_contables')
    .select('codigo,nombre')
    .eq('empresa_id', EMPRESA.id)
    .like('codigo', prefijo + '%')
    .gt('codigo', prefijo)  // excluir la cuenta padre '430'/'400'
    .order('codigo');

  // Buscar si este NIF ya tiene subcuenta asignada (por nombre)
  const nombreUpper = (nombre || '').toUpperCase().trim();
  const yaAsignada = (existentes || []).find(c =>
    c.nombre && c.nombre.toUpperCase().trim() === nombreUpper
  );
  if (yaAsignada) {
    _contSubcuentaCache[cacheKey] = yaAsignada.codigo;
    return yaAsignada.codigo;
  }

  // Verificar colisión: ¿el candidato ya existe para otro tercero?
  const codigosUsados = new Set((existentes || []).map(c => c.codigo));
  while (codigosUsados.has(candidato)) {
    // Incrementar último dígito
    let num = parseInt(candidato.slice(prefijo.length), 10);
    num++;
    candidato = prefijo + String(num).padStart(4, '0');
    // Seguridad: no pasar de 9999
    if (candidato.length > 7) { candidato = prefijo; break; }
  }

  // Si encontramos código libre, crear la subcuenta en BD
  if (candidato !== prefijo) {
    const tipoCuenta = tipo === 'venta' ? 'activo' : 'pasivo';
    const grupo = 4;
    const { error } = await sb.from('cuentas_contables').insert({
      empresa_id: EMPRESA.id,
      codigo: candidato,
      nombre: nombre || ('Tercero ' + nif),
      tipo: tipoCuenta,
      grupo: grupo,
      es_hoja: true,
      padre_codigo: prefijo
    }).select();
    if (error && !error.message.includes('duplicate')) {
      console.warn('[Contab] Error creando subcuenta ' + candidato + ':', error.message);
      return prefijo; // fallback a cuenta genérica
    }
    // Recargar cuentas para que _contBuscarCuenta la encuentre
    await _contCargarCuentas();
    _contSubcuentaCache[cacheKey] = candidato;
  }

  return candidato;
}

async function _contCrearAsientoAuto(obj) {
  // obj = { fecha, descripcion, origen, origen_ref, origen_id, lineas:[{cuenta_codigo, descripcion, debe, haber}] }
  const { data: ultimoArr } = await sb.from('asientos').select('numero')
    .eq('empresa_id', EMPRESA.id).order('numero', { ascending: false }).limit(1);
  const maxNum = ultimoArr?.[0]?.numero || 0;

  const asientoObj = {
    empresa_id: EMPRESA.id,
    fecha: obj.fecha,
    descripcion: obj.descripcion,
    origen: obj.origen,
    origen_ref: obj.origen_ref || null,
    origen_id: obj.origen_id || null,
    ejercicio_id: _contEjercicioSel?.id || null,
    estado: 'contabilizado',
    numero: maxNum + 1,
    usuario_id: (typeof CU !== 'undefined' && CU?.id) ? CU.id : null
  };

  const { data, error } = await sb.from('asientos').insert(asientoObj).select().single();
  if (error) throw new Error('Error creando asiento: ' + error.message);

  const lineasInsert = obj.lineas.map((l, i) => {
    const cuenta = _contBuscarCuenta(l.cuenta_codigo);
    if (!cuenta) throw new Error('Cuenta ' + l.cuenta_codigo + ' no encontrada en el plan contable');
    return {
      asiento_id: data.id,
      cuenta_id: cuenta.id,
      cuenta_codigo: l.cuenta_codigo,
      descripcion: l.descripcion || null,
      debe: parseFloat(l.debe) || 0,
      haber: parseFloat(l.haber) || 0,
      orden: i
    };
  });

  const { error: lineError } = await sb.from('lineas_asiento').insert(lineasInsert);
  if (lineError) throw new Error('Error creando líneas: ' + lineError.message);

  return data;
}

async function _contGenerarLineasFacturaVenta(f) {
  // Factura emitida → Debe 430XXXX / Haber 705 + 477
  const lineas = [];
  const base = parseFloat(f.base_imponible) || 0;
  const iva = parseFloat(f.total_iva) || 0;
  const retencion = parseFloat(f.retencion) || 0;
  const total = parseFloat(f.total) || 0;
  const desc = (f.numero || '') + ' ' + (f.cliente_nombre || '');

  // Subcuenta individualizada del cliente (430 + 4 últimos dígitos NIF)
  const subcuenta = await _contObtenerSubcuenta('venta', f.cliente_nif, f.cliente_nombre);

  // Debe: 430XXXX Cliente
  lineas.push({ cuenta_codigo: subcuenta, descripcion: desc.trim(), debe: total, haber: 0 });

  // Haber: 705 Prestaciones de servicios
  lineas.push({ cuenta_codigo: '705', descripcion: desc.trim(), debe: 0, haber: base });

  // Haber: 477 IVA repercutido
  if (iva > 0) {
    lineas.push({ cuenta_codigo: '477', descripcion: 'IVA rep. ' + (f.numero || ''), debe: 0, haber: iva });
  }

  // Si hay retención IRPF
  if (retencion > 0) {
    lineas.push({ cuenta_codigo: '473', descripcion: 'Ret. IRPF ' + (f.numero || ''), debe: 0, haber: retencion });
    lineas[0].debe = total - retencion;
  }

  return lineas;
}

async function _contGenerarLineasFacturaCompra(f) {
  // Factura recibida → Debe 600 + 472 / Haber 400XXXX
  const lineas = [];
  const base = parseFloat(f.base_imponible) || 0;
  const iva = parseFloat(f.total_iva) || 0;
  const retencion = parseFloat(f.retencion) || 0;
  const total = parseFloat(f.total) || 0;
  const desc = (f.numero || '') + ' ' + (f.proveedor_nombre || '');

  // Subcuenta individualizada del proveedor (400 + 4 últimos dígitos CIF)
  const nifProv = f._proveedor_cif || null;
  const subcuenta = await _contObtenerSubcuenta('compra', nifProv, f.proveedor_nombre);

  // Debe: cuenta de gasto (600 por defecto, configurable por factura)
  const cuentaGasto = f.cuenta_gasto || '600';
  lineas.push({ cuenta_codigo: cuentaGasto, descripcion: desc.trim(), debe: base, haber: 0 });

  // Debe: 472 IVA soportado
  if (iva > 0) {
    lineas.push({ cuenta_codigo: '472', descripcion: 'IVA sop. ' + (f.numero || ''), debe: iva, haber: 0 });
  }

  // Haber: 400XXXX Proveedor
  lineas.push({ cuenta_codigo: subcuenta, descripcion: desc.trim(), debe: 0, haber: total });

  // Si hay retención IRPF
  if (retencion > 0) {
    lineas.push({ cuenta_codigo: '473', descripcion: 'Ret. IRPF ' + (f.numero || ''), debe: retencion, haber: 0 });
    // Ajustar haber proveedor
    const idxProv = lineas.findIndex(l => l.cuenta_codigo === subcuenta);
    lineas[idxProv].haber = total - retencion;
  }

  return lineas;
}

async function _contContabilizarFacturas() {
  if (!_contEjercicioSel) { showToast('Primero selecciona un ejercicio fiscal', 'error'); return; }
  await _contCargarCuentas();

  // Verificar cuentas fijas (subcuentas 430XXXX/400XXXX se crean automáticamente)
  const cuentasReq = ['705','477','472','600'];
  const faltan = cuentasReq.filter(c => !_contBuscarCuenta(c));
  if (faltan.length) {
    showToast('Faltan cuentas en el plan contable: ' + faltan.join(', '), 'error');
    return;
  }

  const fechaDesde = _contEjercicioSel.fecha_inicio;
  const fechaHasta = _contEjercicioSel.fecha_fin;

  // Obtener asientos que ya referencian facturas (evitar duplicados)
  const { data: existentes } = await sb.from('asientos')
    .select('origen,origen_id')
    .eq('empresa_id', EMPRESA.id)
    .in('origen', ['factura_emitida','factura_recibida'])
    .neq('estado', 'anulado');
  const yaContab = new Set((existentes || []).map(a => a.origen + '_' + a.origen_id));

  // Facturas de venta del ejercicio (incluye cliente_nif para subcuentas)
  const { data: fVentas } = await sb.from('facturas')
    .select('id,numero,serie,cliente_nombre,cliente_nif,fecha,base_imponible,total_iva,retencion,total,estado')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', fechaDesde).lte('fecha', fechaHasta)
    .in('estado', ['emitida','cobrada','enviada','aceptada','pendiente']);

  // Facturas de compra del ejercicio (incluye proveedor_id para obtener CIF)
  const { data: fCompras } = await sb.from('facturas_proveedor')
    .select('id,numero,proveedor_id,proveedor_nombre,fecha,base_imponible,total_iva,retencion,total,estado,cuenta_gasto')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', fechaDesde).lte('fecha', fechaHasta);

  // Obtener CIFs de proveedores para subcuentas
  const provIds = [...new Set((fCompras || []).map(f => f.proveedor_id).filter(Boolean))];
  let provCifMap = {};
  if (provIds.length) {
    const { data: provs } = await sb.from('proveedores').select('id,cif').in('id', provIds);
    (provs || []).forEach(p => { provCifMap[p.id] = p.cif; });
  }
  // Inyectar CIF en cada factura de compra
  (fCompras || []).forEach(f => { f._proveedor_cif = provCifMap[f.proveedor_id] || null; });

  const ventasPend = (fVentas || []).filter(f => !yaContab.has('factura_emitida_' + f.id));
  const comprasPend = (fCompras || []).filter(f => !yaContab.has('factura_recibida_' + f.id));
  const totalPend = ventasPend.length + comprasPend.length;

  if (!totalPend) {
    showToast('Todas las facturas del ejercicio ya están contabilizadas', 'ok');
    return;
  }

  if (!confirm('Se van a contabilizar ' + totalPend + ' facturas:\n' +
    '• ' + ventasPend.length + ' facturas de venta\n' +
    '• ' + comprasPend.length + ' facturas de compra\n\n' +
    '¿Continuar?')) return;

  let ok = 0, errores = 0;

  for (const f of ventasPend) {
    try {
      await _contCrearAsientoAuto({
        fecha: f.fecha,
        descripcion: 'Fact. emitida ' + (f.numero || f.id) + ' — ' + (f.cliente_nombre || ''),
        origen: 'factura_emitida',
        origen_ref: f.numero || String(f.id),
        origen_id: f.id,
        lineas: await _contGenerarLineasFacturaVenta(f)
      });
      ok++;
    } catch (e) { console.error('Error fact. venta ' + f.id, e); errores++; }
  }

  for (const f of comprasPend) {
    try {
      await _contCrearAsientoAuto({
        fecha: f.fecha,
        descripcion: 'Fact. recibida ' + (f.numero || f.id) + ' — ' + (f.proveedor_nombre || ''),
        origen: 'factura_recibida',
        origen_ref: f.numero || String(f.id),
        origen_id: f.id,
        lineas: await _contGenerarLineasFacturaCompra(f)
      });
      ok++;
    } catch (e) { console.error('Error fact. compra ' + f.id, e); errores++; }
  }

  if (errores) {
    showToast(ok + ' contabilizadas, ' + errores + ' errores — ver consola', 'error');
  } else {
    showToast('✅ ' + ok + ' facturas contabilizadas', 'ok');
  }

  renderContLibroDiario();
}


// ── Auto-contabilizar factura individual ──────
// Llamar desde facturas.js / facturas_prov.js / recepciones.js etc.
// tipo: 'venta' | 'compra'   facturaId: id de la factura
async function _contAutoContabilizar(tipo, facturaId) {
  try {
    if (!_contCuentas.length) await _contCargarCuentas();
    if (!_contEjercicios.length) await _contCargarEjercicios();

    // Solo verificar cuentas fijas (las subcuentas 430XXXX/400XXXX se crean automáticamente)
    const cuentasReq = tipo === 'venta' ? ['705','477'] : ['600','472'];
    const faltan = cuentasReq.filter(c => !_contBuscarCuenta(c));
    if (faltan.length) { console.warn('[Contab] Faltan cuentas:', faltan); return; }

    // No duplicar
    const origenTipo = tipo === 'venta' ? 'factura_emitida' : 'factura_recibida';
    const { data: existe } = await sb.from('asientos')
      .select('id').eq('empresa_id', EMPRESA.id)
      .eq('origen', origenTipo).eq('origen_id', facturaId)
      .neq('estado', 'anulado').limit(1);
    if (existe?.length) return;

    // Obtener factura (incluye NIF para subcuentas)
    let f;
    if (tipo === 'venta') {
      const { data } = await sb.from('facturas')
        .select('id,numero,cliente_nombre,cliente_nif,fecha,base_imponible,total_iva,retencion,total')
        .eq('id', facturaId).single();
      f = data;
    } else {
      const { data } = await sb.from('facturas_proveedor')
        .select('id,numero,proveedor_id,proveedor_nombre,fecha,base_imponible,total_iva,retencion,total,cuenta_gasto')
        .eq('id', facturaId).single();
      f = data;
      // Obtener CIF del proveedor
      if (f && f.proveedor_id) {
        const { data: prov } = await sb.from('proveedores').select('cif').eq('id', f.proveedor_id).single();
        f._proveedor_cif = prov?.cif || null;
      }
    }
    if (!f) return;

    // Ejercicio para la fecha
    const ej = _contEjercicios.find(e => e.estado === 'abierto' && f.fecha >= e.fecha_inicio && f.fecha <= e.fecha_fin);
    if (!ej) { console.warn('[Contab] Sin ejercicio abierto para', f.fecha); return; }
    _contEjercicioSel = ej;

    const lineas = tipo === 'venta'
      ? await _contGenerarLineasFacturaVenta(f)
      : await _contGenerarLineasFacturaCompra(f);
    const descLabel = tipo === 'venta' ? 'Fact. emitida' : 'Fact. recibida';
    const nombre = tipo === 'venta' ? (f.cliente_nombre || '') : (f.proveedor_nombre || '');

    await _contCrearAsientoAuto({
      fecha: f.fecha,
      descripcion: descLabel + ' ' + (f.numero || f.id) + ' — ' + nombre,
      origen: origenTipo,
      origen_ref: f.numero || String(f.id),
      origen_id: f.id,
      lineas
    });
    console.log('[Contab] ✅ Asiento auto:', origenTipo, f.numero || f.id);
  } catch (e) {
    console.error('[Contab] Error auto-contabilizar:', e);
  }
}
