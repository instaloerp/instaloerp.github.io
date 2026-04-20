// ═══════════════════════════════════════════════
// TESORERÍA — Cuentas bancarias, Movimientos,
// Conciliación e Importar extractos
// ═══════════════════════════════════════════════

let tesCuentas = [];
let tesMovimientos = [];
let tesConciliaciones = [];
let tesReglas = [];
let _tesCuentaSel = null;       // cuenta seleccionada en movimientos
let _tesMovFiltros = { estado: '', categoria: '', desde: '', hasta: '' };

// ── Helpers ──────────────────────────────────
const _tesFmt = n => new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const _tesFecha = d => d ? new Date(d).toLocaleDateString('es-ES') : '—';
const _tesColor = (imp) => imp >= 0 ? 'var(--verde)' : 'var(--rojo)';

// ── Cargar datos ─────────────────────────────
async function _tesCargarCuentas() {
  const {data} = await sb.from('cuentas_bancarias').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  tesCuentas = data || [];
}

async function _tesCargarMovimientos(cuentaId) {
  let q = sb.from('movimientos_bancarios').select('*').eq('empresa_id', EMPRESA.id);
  if (cuentaId) q = q.eq('cuenta_id', cuentaId);
  if (_tesMovFiltros.estado) q = q.eq('estado', _tesMovFiltros.estado);
  if (_tesMovFiltros.categoria) q = q.eq('categoria', _tesMovFiltros.categoria);
  if (_tesMovFiltros.desde) q = q.gte('fecha_operacion', _tesMovFiltros.desde);
  if (_tesMovFiltros.hasta) q = q.lte('fecha_operacion', _tesMovFiltros.hasta);
  q = q.order('fecha_operacion', {ascending:false}).limit(200);
  const {data} = await q;
  tesMovimientos = data || [];
}


// ═══════════════════════════════════════════════
//  CUENTAS BANCARIAS
// ═══════════════════════════════════════════════

async function renderTesCuentas() {
  await _tesCargarCuentas();
  const page = document.getElementById('page-tesoreria-cuentas');
  if (!page) return;

  // Calcular KPIs
  const saldoTotal = tesCuentas.filter(c=>c.activa!==false).reduce((s,c) => s + (parseFloat(c.saldo)||0), 0);
  const numActivas = tesCuentas.filter(c=>c.activa!==false).length;

  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <h2 style="font-size:17px;font-weight:800">🏦 Cuentas bancarias</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">Gestiona tus cuentas y saldos</p>
      </div>
      ${canDo('tesoreria','crear') ? '<button class="btn btn-primary" onclick="tesNuevaCuenta()">+ Nueva cuenta</button>' : ''}
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:11px;color:var(--gris-400);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Saldo total</div>
        <div style="font-size:22px;font-weight:800;color:${saldoTotal>=0?'var(--verde)':'var(--rojo)'};margin-top:4px">${_tesFmt(saldoTotal)} €</div>
      </div>
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:11px;color:var(--gris-400);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Cuentas activas</div>
        <div style="font-size:22px;font-weight:800;margin-top:4px">${numActivas}</div>
      </div>
    </div>

    <!-- Lista cuentas -->
    <div class="card" style="padding:0;overflow:hidden">
      <div id="tesCuentasLista" style="padding:12px">${_tesCuentasHTML()}</div>
    </div>
  `;
}

function _tesCuentasHTML() {
  if (!tesCuentas.length) {
    return `<div style="text-align:center;padding:40px;color:var(--gris-400)">
      <div style="font-size:40px;margin-bottom:8px">🏦</div>
      <strong>Sin cuentas bancarias</strong><br>
      <span style="font-size:12px">Añade tu primera cuenta para empezar a gestionar tu tesorería</span>
    </div>`;
  }

  return tesCuentas.map(c => {
    const saldo = parseFloat(c.saldo) || 0;
    const activa = c.activa !== false;
    const color = c.color || '#2563EB';
    return `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;
      border:1px solid var(--gris-200);margin-bottom:8px;cursor:pointer;transition:all .15s;
      opacity:${activa?1:0.5}" onclick="tesEditarCuenta('${c.id}')">
      <div style="width:44px;height:44px;border-radius:10px;background:${color}15;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span style="font-size:20px">🏦</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px">${c.nombre}</div>
        <div style="font-size:11px;color:var(--gris-400);margin-top:2px">
          ${c.iban ? c.iban : ''}${c.entidad ? (c.iban?' · ':'')+c.entidad : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:16px;font-weight:800;color:${saldo>=0?'var(--verde)':'var(--rojo)'}">${_tesFmt(saldo)} €</div>
        ${c.saldo_fecha ? `<div style="font-size:10px;color:var(--gris-400)">Actualizado ${_tesFecha(c.saldo_fecha)}</div>` : ''}
      </div>
      <button class="btn btn-secondary btn-sm" style="flex-shrink:0;font-size:11px" onclick="event.stopPropagation();goPage('tesoreria-movimientos');_tesCuentaSel='${c.id}'">
        Movimientos →
      </button>
    </div>`;
  }).join('');
}

// ── Modal nueva/editar cuenta ────────────────
function tesNuevaCuenta() {
  _tesMostrarModalCuenta(null);
}

function tesEditarCuenta(id) {
  if (!canDo('tesoreria','editar')) { toast('Sin permiso','error'); return; }
  const c = tesCuentas.find(x=>x.id===id);
  if (c) _tesMostrarModalCuenta(c);
}

function _tesMostrarModalCuenta(c) {
  const esNueva = !c;
  const html = `
    <div style="padding:20px">
      <h3 style="font-size:16px;font-weight:800;margin-bottom:16px">${esNueva ? '🏦 Nueva cuenta bancaria' : '✏️ Editar cuenta'}</h3>
      <div style="display:grid;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:600">Nombre *</label>
          <input id="tes_c_nombre" class="input" value="${c?.nombre||''}" placeholder="Ej: CaixaBank Principal">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600">IBAN</label>
            <input id="tes_c_iban" class="input" value="${c?.iban||''}" placeholder="ES12 1234 5678 9012 3456 7890">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600">Entidad</label>
            <input id="tes_c_entidad" class="input" value="${c?.entidad||''}" placeholder="CaixaBank, Santander...">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600">SWIFT/BIC</label>
            <input id="tes_c_swift" class="input" value="${c?.bic||''}" placeholder="CAIXESBBXXX">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600">Saldo actual</label>
            <input id="tes_c_saldo" class="input" type="number" step="0.01" value="${c?.saldo||0}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600">Color</label>
            <input id="tes_c_color" type="color" value="${c?.color||'#2563EB'}" style="width:100%;height:36px;border:1px solid var(--gris-200);border-radius:8px;cursor:pointer">
          </div>
          <div style="display:flex;align-items:end;gap:8px">
            <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer">
              <input id="tes_c_activo" type="checkbox" ${c?.activa!==false?'checked':''}>
              Cuenta activa
            </label>
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600">Notas</label>
          <textarea id="tes_c_notas" class="input" rows="2" placeholder="Notas internas...">${c?.notas||''}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        ${!esNueva ? `<button class="btn" style="background:var(--rojo);color:#fff;margin-right:auto" onclick="tesEliminarCuenta('${c.id}')">Eliminar</button>` : ''}
        <button class="btn btn-secondary" onclick="closeModal('mTesCuenta')">Cancelar</button>
        <button class="btn btn-primary" onclick="tesGuardarCuenta('${c?.id||''}')">${esNueva?'Crear cuenta':'Guardar'}</button>
      </div>
    </div>`;

  // Reusar modal genérico
  let modal = document.getElementById('mTesCuenta');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mTesCuenta';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content" style="max-width:520px"><div id="mTesCuentaBody"></div></div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('mTesCuentaBody').innerHTML = html;
  openModal('mTesCuenta');
}

async function tesGuardarCuenta(id) {
  const nombre = document.getElementById('tes_c_nombre').value.trim();
  if (!nombre) { toast('Introduce el nombre','error'); return; }

  const obj = {
    empresa_id: EMPRESA.id,
    nombre,
    iban: document.getElementById('tes_c_iban').value.trim() || null,
    entidad: document.getElementById('tes_c_entidad').value.trim() || null,
    bic: document.getElementById('tes_c_swift').value.trim() || null,
    saldo: parseFloat(document.getElementById('tes_c_saldo').value) || 0,
    saldo_fecha: new Date().toISOString(),
    color: document.getElementById('tes_c_color').value,
    activa: document.getElementById('tes_c_activo').checked,
    notas: document.getElementById('tes_c_notas').value.trim() || null
  };

  let error;
  if (id) {
    ({error} = await sb.from('cuentas_bancarias').update(obj).eq('id', id));
  } else {
    ({error} = await sb.from('cuentas_bancarias').insert(obj));
  }

  if (error) { toast('Error: '+error.message,'error'); return; }
  closeModal('mTesCuenta');
  toast(id ? 'Cuenta actualizada ✓' : 'Cuenta creada ✓', 'success');
  renderTesCuentas();
}

async function tesEliminarCuenta(id) {
  if (!canDo('tesoreria','eliminar')) { toast('Sin permiso para eliminar','error'); return; }
  if (typeof confirmModal === 'function') {
    confirmModal('¿Eliminar esta cuenta y todos sus movimientos?', async () => {
      const {error} = await sb.from('cuentas_bancarias').delete().eq('id', id);
      if (error) { toast('Error: '+error.message,'error'); return; }
      closeModal('mTesCuenta');
      toast('Cuenta eliminada','success');
      renderTesCuentas();
    });
  }
}


// ═══════════════════════════════════════════════
//  MOVIMIENTOS BANCARIOS
// ═══════════════════════════════════════════════

async function renderTesMovimientos() {
  await _tesCargarCuentas();
  const cId = _tesCuentaSel || (tesCuentas[0]?.id || null);
  _tesCuentaSel = cId;
  await _tesCargarMovimientos(cId);

  const page = document.getElementById('page-tesoreria-movimientos');
  if (!page) return;

  const cuentaActual = tesCuentas.find(c=>c.id===cId);
  const ingresos = tesMovimientos.filter(m=>m.importe>0).reduce((s,m)=>s+parseFloat(m.importe),0);
  const gastos = tesMovimientos.filter(m=>m.importe<0).reduce((s,m)=>s+Math.abs(parseFloat(m.importe)),0);

  const optsCuenta = tesCuentas.map(c => `<option value="${c.id}" ${c.id===cId?'selected':''}>${c.nombre}</option>`).join('');

  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <h2 style="font-size:17px;font-weight:800">📊 Movimientos bancarios</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">${cuentaActual ? cuentaActual.nombre : 'Todas las cuentas'}</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="input" style="font-size:12px;min-width:180px" onchange="_tesCuentaSel=this.value;renderTesMovimientos()">
          <option value="">Todas las cuentas</option>
          ${optsCuenta}
        </select>
        ${canDo('tesoreria','crear') ? '<button class="btn btn-primary" onclick="tesNuevoMovimiento()">+ Nuevo movimiento</button>' : ''}
      </div>
    </div>

    <!-- KPIs período -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--gris-400);font-weight:700;text-transform:uppercase">Ingresos</div>
        <div style="font-size:18px;font-weight:800;color:var(--verde);margin-top:2px">+${_tesFmt(ingresos)} €</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--gris-400);font-weight:700;text-transform:uppercase">Gastos</div>
        <div style="font-size:18px;font-weight:800;color:var(--rojo);margin-top:2px">-${_tesFmt(gastos)} €</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--gris-400);font-weight:700;text-transform:uppercase">Neto</div>
        <div style="font-size:18px;font-weight:800;color:${(ingresos-gastos)>=0?'var(--verde)':'var(--rojo)'};margin-top:2px">${_tesFmt(ingresos-gastos)} €</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:10px;color:var(--gris-400);font-weight:700;text-transform:uppercase">Movimientos</div>
        <div style="font-size:18px;font-weight:800;margin-top:2px">${tesMovimientos.length}</div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card" style="padding:10px 14px;margin-bottom:12px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label style="font-size:11px;font-weight:700;color:var(--gris-400)">Filtros:</label>
        <select class="input" style="font-size:11px;min-width:120px" onchange="_tesMovFiltros.estado=this.value;renderTesMovimientos()">
          <option value="">Estado: Todos</option>
          <option value="pendiente" ${_tesMovFiltros.estado==='pendiente'?'selected':''}>Pendiente</option>
          <option value="parcial" ${_tesMovFiltros.estado==='parcial'?'selected':''}>Parcial</option>
          <option value="conciliado" ${_tesMovFiltros.estado==='conciliado'?'selected':''}>Conciliado</option>
          <option value="ignorado" ${_tesMovFiltros.estado==='ignorado'?'selected':''}>Ignorado</option>
        </select>
        <select class="input" style="font-size:11px;min-width:120px" onchange="_tesMovFiltros.categoria=this.value;renderTesMovimientos()">
          <option value="">Categoría: Todas</option>
          <option value="ventas" ${_tesMovFiltros.categoria==='ventas'?'selected':''}>Ventas</option>
          <option value="compras" ${_tesMovFiltros.categoria==='compras'?'selected':''}>Compras</option>
          <option value="nominas" ${_tesMovFiltros.categoria==='nominas'?'selected':''}>Nóminas</option>
          <option value="impuestos" ${_tesMovFiltros.categoria==='impuestos'?'selected':''}>Impuestos</option>
          <option value="otros" ${_tesMovFiltros.categoria==='otros'?'selected':''}>Otros</option>
        </select>
        <input type="date" class="input" style="font-size:11px" value="${_tesMovFiltros.desde}" onchange="_tesMovFiltros.desde=this.value;renderTesMovimientos()">
        <span style="font-size:11px;color:var(--gris-400)">a</span>
        <input type="date" class="input" style="font-size:11px" value="${_tesMovFiltros.hasta}" onchange="_tesMovFiltros.hasta=this.value;renderTesMovimientos()">
        <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="_tesMovFiltros={estado:'',categoria:'',desde:'',hasta:''};renderTesMovimientos()">Limpiar</button>
      </div>
    </div>

    <!-- Tabla movimientos -->
    <div class="card" style="padding:0;overflow:auto">
      <table class="tbl" style="width:100%">
        <thead>
          <tr>
            <th style="width:90px">Fecha</th>
            <th>Concepto</th>
            <th style="width:90px">Categoría</th>
            <th style="width:110px;text-align:right">Importe</th>
            <th style="width:110px;text-align:right">Saldo</th>
            <th style="width:85px;text-align:center">Estado</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody id="tesMovTable">${_tesMovTablaHTML()}</tbody>
      </table>
    </div>
  `;
}

function _tesMovTablaHTML() {
  if (!tesMovimientos.length) {
    return `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gris-400)">
      <div style="font-size:40px;margin-bottom:8px">📊</div>
      <strong>Sin movimientos</strong><br>
      <span style="font-size:12px">Añade movimientos manualmente o importa un extracto bancario</span>
    </td></tr>`;
  }

  const estadoColors = { pendiente:'#F59E0B', parcial:'#3B82F6', conciliado:'#10B981', ignorado:'#94A3B8' };
  const estadoLabels = { pendiente:'Pendiente', parcial:'Parcial', conciliado:'Conciliado', ignorado:'Ignorado' };
  const catIcos = { ventas:'💰', compras:'🛒', nominas:'👷', impuestos:'🏛️', otros:'📋' };

  return tesMovimientos.map(m => {
    const imp = parseFloat(m.importe) || 0;
    const saldo = m.saldo_posterior != null ? parseFloat(m.saldo_posterior) : null;
    const estCol = estadoColors[m.estado] || '#94A3B8';
    return `<tr style="cursor:pointer" onclick="tesEditarMovimiento('${m.id}')">
      <td style="font-size:12px;white-space:nowrap">${_tesFecha(m.fecha_operacion)}</td>
      <td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(m.concepto||'').replace(/"/g,'&quot;')}">${m.concepto||'—'}</td>
      <td style="font-size:11px">${catIcos[m.categoria]||''} ${m.categoria||'—'}</td>
      <td style="text-align:right;font-weight:700;color:${_tesColor(imp)};font-size:13px">${imp>0?'+':''}${_tesFmt(imp)} €</td>
      <td style="text-align:right;font-size:12px;color:var(--gris-500)">${saldo!=null?_tesFmt(saldo)+' €':'—'}</td>
      <td style="text-align:center"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:${estCol}15;color:${estCol}">${estadoLabels[m.estado]||m.estado}</span></td>
      <td style="text-align:center;font-size:14px">›</td>
    </tr>`;
  }).join('');
}

// ── Modal nuevo/editar movimiento ────────────
function tesNuevoMovimiento() {
  _tesMostrarModalMov(null);
}

function tesEditarMovimiento(id) {
  if (!canDo('tesoreria','editar')) { toast('Sin permiso','error'); return; }
  const m = tesMovimientos.find(x=>x.id===id);
  if (m) _tesMostrarModalMov(m);
}

function _tesMostrarModalMov(m) {
  const esNuevo = !m;
  const optsCuenta = tesCuentas.map(c =>
    `<option value="${c.id}" ${(m?.cuenta_id||_tesCuentaSel)===c.id?'selected':''}>${c.nombre}</option>`
  ).join('');

  const html = `
    <div style="padding:20px">
      <h3 style="font-size:16px;font-weight:800;margin-bottom:16px">${esNuevo ? '📊 Nuevo movimiento' : '✏️ Editar movimiento'}</h3>
      <div style="display:grid;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:600">Cuenta *</label>
          <select id="tes_m_cuenta" class="input">${optsCuenta}</select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600">Fecha operación *</label>
            <input id="tes_m_fecha" class="input" type="date" value="${m?.fecha_operacion||new Date().toISOString().slice(0,10)}">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600">Fecha valor</label>
            <input id="tes_m_fechavalor" class="input" type="date" value="${m?.fecha_valor||''}">
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600">Concepto</label>
          <input id="tes_m_concepto" class="input" value="${m?.concepto||''}" placeholder="Descripción del movimiento">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600">Importe * <span style="font-size:10px;color:var(--gris-400)">(+ ingreso, - gasto)</span></label>
            <input id="tes_m_importe" class="input" type="number" step="0.01" value="${m?.importe||''}">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600">Categoría</label>
            <select id="tes_m_cat" class="input">
              <option value="">— Sin categoría —</option>
              <option value="ventas" ${m?.categoria==='ventas'?'selected':''}>💰 Ventas</option>
              <option value="compras" ${m?.categoria==='compras'?'selected':''}>🛒 Compras</option>
              <option value="nominas" ${m?.categoria==='nominas'?'selected':''}>👷 Nóminas</option>
              <option value="impuestos" ${m?.categoria==='impuestos'?'selected':''}>🏛️ Impuestos</option>
              <option value="otros" ${m?.categoria==='otros'?'selected':''}>📋 Otros</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600">Referencia</label>
            <input id="tes_m_ref" class="input" value="${m?.referencia||''}" placeholder="Ref. bancaria">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600">Estado</label>
            <select id="tes_m_estado" class="input">
              <option value="pendiente" ${m?.estado==='pendiente'?'selected':''}>Pendiente</option>
              <option value="parcial" ${m?.estado==='parcial'?'selected':''}>Parcial</option>
              <option value="conciliado" ${m?.estado==='conciliado'?'selected':''}>Conciliado</option>
              <option value="ignorado" ${m?.estado==='ignorado'?'selected':''}>Ignorado</option>
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600">Notas</label>
          <textarea id="tes_m_notas" class="input" rows="2">${m?.notas||''}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        ${!esNuevo ? `<button class="btn" style="background:var(--rojo);color:#fff;margin-right:auto" onclick="tesEliminarMovimiento('${m.id}')">Eliminar</button>` : ''}
        <button class="btn btn-secondary" onclick="closeModal('mTesMov')">Cancelar</button>
        <button class="btn btn-primary" onclick="tesGuardarMovimiento('${m?.id||''}')">${esNuevo?'Crear':'Guardar'}</button>
      </div>
    </div>`;

  let modal = document.getElementById('mTesMov');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mTesMov';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content" style="max-width:520px"><div id="mTesMovBody"></div></div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('mTesMovBody').innerHTML = html;
  openModal('mTesMov');
}

async function tesGuardarMovimiento(id) {
  const cuenta_id = document.getElementById('tes_m_cuenta').value;
  const fecha_operacion = document.getElementById('tes_m_fecha').value;
  const importe = parseFloat(document.getElementById('tes_m_importe').value);

  if (!cuenta_id) { toast('Selecciona una cuenta','error'); return; }
  if (!fecha_operacion) { toast('Introduce la fecha','error'); return; }
  if (isNaN(importe) || importe === 0) { toast('Introduce un importe válido','error'); return; }

  const obj = {
    empresa_id: EMPRESA.id,
    cuenta_id,
    fecha_operacion,
    fecha_valor: document.getElementById('tes_m_fechavalor').value || null,
    concepto: document.getElementById('tes_m_concepto').value.trim() || null,
    importe,
    categoria: document.getElementById('tes_m_cat').value || null,
    referencia: document.getElementById('tes_m_ref').value.trim() || null,
    estado: document.getElementById('tes_m_estado').value,
    notas: document.getElementById('tes_m_notas').value.trim() || null,
    origen: 'manual'
  };

  let error;
  if (id) {
    ({error} = await sb.from('movimientos_bancarios').update(obj).eq('id', id));
  } else {
    ({error} = await sb.from('movimientos_bancarios').insert(obj));
  }

  if (error) { toast('Error: '+error.message,'error'); return; }

  // Actualizar saldo de la cuenta
  await _tesRecalcularSaldo(cuenta_id);

  closeModal('mTesMov');
  toast(id ? 'Movimiento actualizado ✓' : 'Movimiento creado ✓', 'success');
  renderTesMovimientos();
}

async function tesEliminarMovimiento(id) {
  if (!canDo('tesoreria','eliminar')) { toast('Sin permiso para eliminar','error'); return; }
  const m = tesMovimientos.find(x=>x.id===id);
  if (typeof confirmModal === 'function') {
    confirmModal('¿Eliminar este movimiento?', async () => {
      const {error} = await sb.from('movimientos_bancarios').delete().eq('id', id);
      if (error) { toast('Error: '+error.message,'error'); return; }
      closeModal('mTesMov');
      if (m?.cuenta_id) await _tesRecalcularSaldo(m.cuenta_id);
      toast('Movimiento eliminado','success');
      renderTesMovimientos();
    });
  }
}

// Recalcular saldo de una cuenta sumando todos sus movimientos
async function _tesRecalcularSaldo(cuentaId) {
  const {data} = await sb.from('movimientos_bancarios')
    .select('importe')
    .eq('cuenta_id', cuentaId);
  const total = (data||[]).reduce((s,m) => s + (parseFloat(m.importe)||0), 0);
  await sb.from('cuentas_bancarias').update({
    saldo: total,
    saldo_fecha: new Date().toISOString()
  }).eq('id', cuentaId);
}


// ═══════════════════════════════════════════════
//  CONCILIACIÓN (placeholder — se completará en task #96)
// ═══════════════════════════════════════════════

async function renderTesConciliacion() {
  const page = document.getElementById('page-tesoreria-conciliacion');
  if (!page) return;
  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <h2 style="font-size:17px;font-weight:800">🔗 Conciliación bancaria</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">Vincula movimientos con facturas emitidas y recibidas</p>
      </div>
    </div>
    <div class="card">
      <div class="card-b" style="padding:40px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">🔗</div>
        <h3 style="font-size:15px;font-weight:700;margin-bottom:8px">Conciliación bancaria</h3>
        <p style="font-size:13px;color:var(--gris-400);max-width:400px;margin:0 auto">
          Próximamente podrás vincular movimientos bancarios con tus facturas de venta y compra,
          incluyendo pagos parciales y agrupados.
        </p>
      </div>
    </div>`;
}


// ═══════════════════════════════════════════════
//  IMPORTAR EXTRACTOS (placeholder — se completará en task #95)
// ═══════════════════════════════════════════════

async function renderTesImportar() {
  const page = document.getElementById('page-tesoreria-importar');
  if (!page) return;
  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <h2 style="font-size:17px;font-weight:800">📥 Importar extractos</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">Importa movimientos desde ficheros Norma 43 o CSV</p>
      </div>
    </div>
    <div class="card">
      <div class="card-b" style="padding:40px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">📥</div>
        <h3 style="font-size:15px;font-weight:700;margin-bottom:8px">Importar extractos bancarios</h3>
        <p style="font-size:13px;color:var(--gris-400);max-width:400px;margin:0 auto">
          Próximamente podrás importar extractos en formato Norma 43 (AEB) y CSV
          para cargar movimientos automáticamente.
        </p>
      </div>
    </div>`;
}
