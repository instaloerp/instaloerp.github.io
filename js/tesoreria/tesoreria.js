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

// ── Auto-relleno por IBAN ───────────────────
// Mapa: código entidad (4 dígitos del IBAN ES pos 4-7) → { nombre, bic }
const _tesEntidadesIBAN = {
  '0049': { nombre: 'Santander', bic: 'BSCHESMMXXX' },
  '0075': { nombre: 'Santander (Banesto)', bic: 'BSCHESMMXXX' },
  '0081': { nombre: 'Sabadell', bic: 'BSABESBBXXX' },
  '0182': { nombre: 'BBVA', bic: 'BBVAESMMXXX' },
  '2100': { nombre: 'CaixaBank', bic: 'CAIXESBBXXX' },
  '0128': { nombre: 'Bankinter', bic: 'BKBKESMMXXX' },
  '2085': { nombre: 'Ibercaja', bic: 'CAZABORJXXX' },
  '2095': { nombre: 'Kutxabank', bic: 'BASABORJXXX' },
  '2080': { nombre: 'Abanca', bic: 'CAABORJXXX' },
  '0073': { nombre: 'Openbank', bic: 'OPENESMMXXX' },
  '0019': { nombre: 'Deutsche Bank', bic: 'DEUTESBBXXX' },
  '0065': { nombre: 'Barclays', bic: 'BARCESMMXXX' },
  '0487': { nombre: 'Banco Mare Nostrum', bic: 'GBMNESMMXXX' },
  '0186': { nombre: 'Banco Mediolanum', bic: 'BFIVESBBXXX' },
  '0239': { nombre: 'EVO Banco', bic: 'ABORESMAXXX' },
  '1465': { nombre: 'ING', bic: 'INGDESMMXXX' },
  '0162': { nombre: 'Banco Cooperativo', bic: 'BCOEESMMXXX' },
  '3058': { nombre: 'Cajamar', bic: 'CCABORJXXX' },
  '3085': { nombre: 'Caja Rural', bic: 'BCOEESMMXXX' },
  '0030': { nombre: 'Banco Español de Crédito', bic: 'ESPCESMMXXX' },
  '0057': { nombre: 'Banco Depositario BBVA', bic: 'BBVAESMMXXX' },
  '2038': { nombre: 'Bankia (ahora CaixaBank)', bic: 'CAABORJXXX' },
  '2103': { nombre: 'Unicaja', bic: 'UCJAES2MXXX' },
  '0083': { nombre: 'Renta 4', bic: 'RENTEAMMXXX' },
  '0487': { nombre: 'Banco Mare Nostrum', bic: 'GBMNESMMXXX' },
  '0234': { nombre: 'Banca Privada Wiese', bic: '' },
  '0138': { nombre: 'Bankoa (Abanca)', bic: 'BKOAES22XXX' },
  '3183': { nombre: 'Caja Rural de Asturias', bic: '' },
  '0108': { nombre: 'Banco de Galicia', bic: '' },
};

function _tesAutorellenoIBAN() {
  const ibanEl = document.getElementById('tes_c_iban');
  if (!ibanEl) return;
  const iban = ibanEl.value.replace(/\s/g,'').toUpperCase();
  // IBAN español: ES + 2 dígitos control + 4 dígitos entidad + 4 dígitos sucursal + ...
  if (iban.length < 8 || !iban.startsWith('ES')) return;

  const codEntidad = iban.substring(4, 8);
  const codSucursal = iban.length >= 12 ? iban.substring(8, 12) : '';
  const entidad = _tesEntidadesIBAN[codEntidad];

  // Nº cuenta: extraer de IBAN español (posiciones 4-23 = entidad+sucursal+DC+cuenta)
  // Formato: EEEE SSSS DD CCCCCCCCCC
  if (iban.length >= 24) {
    const numCuentaEl = document.getElementById('tes_c_numcuenta');
    if (numCuentaEl && !numCuentaEl.value.trim()) {
      const ccc = iban.substring(4); // 20 dígitos: entidad(4)+sucursal(4)+dc(2)+cuenta(10)
      numCuentaEl.value = ccc.substring(0,4) + ' ' + ccc.substring(4,8) + ' ' + ccc.substring(8,10) + ' ' + ccc.substring(10);
    }
  }

  if (entidad) {
    // Solo auto-rellenar si están vacíos
    const nombreEl = document.getElementById('tes_c_nombre');
    const entidadEl = document.getElementById('tes_c_entidad');
    const bicEl = document.getElementById('tes_c_swift');
    const sucursalEl = document.getElementById('tes_c_sucursal');

    if (entidadEl && !entidadEl.value.trim()) entidadEl.value = entidad.nombre;
    if (bicEl && !bicEl.value.trim() && entidad.bic) bicEl.value = entidad.bic;
    if (nombreEl && !nombreEl.value.trim()) nombreEl.value = entidad.nombre + (iban.length >= 24 ? ' ···' + iban.slice(-4) : '');
    if (sucursalEl && !sucursalEl.value.trim() && codSucursal) sucursalEl.value = 'Oficina ' + codSucursal;
  }
}

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

  const verSaldos = canDo('tesoreria','ver_saldos');

  // Topbar: botón nueva cuenta
  const tb = document.getElementById('topbarBtns');
  if (tb) tb.innerHTML = canDo('tesoreria','crear') ? '<button class="btn btn-primary" onclick="tesNuevaCuenta()">+ Nueva cuenta</button>' : '';

  // Calcular KPIs
  const saldoTotal = tesCuentas.filter(c=>c.activa!==false).reduce((s,c) => s + (parseFloat(c.saldo)||0), 0);
  const numActivas = tesCuentas.filter(c=>c.activa!==false).length;

  const numConectadas = tesCuentas.filter(c=>c.nordigen_conectado).length;

  page.innerHTML = `
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:16px">
      ${verSaldos ? `<div class="sc" style="--c:${saldoTotal>=0?'var(--verde)':'var(--rojo)'};--bg:${saldoTotal>=0?'var(--verde-light)':'var(--rojo-light)'}"><div class="si">💶</div><div class="sv">${_tesFmt(saldoTotal)} €</div><div class="sl">Saldo total</div></div>` : ''}
      <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">🏦</div><div class="sv">${numActivas}</div><div class="sl">Cuentas activas</div></div>
      ${numConectadas ? `<div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">🔗</div><div class="sv">${numConectadas}</div><div class="sl">Open Banking</div></div>` : ''}
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

  const verSaldos = canDo('tesoreria','ver_saldos');
  return tesCuentas.map(c => {
    const saldo = parseFloat(c.saldo) || 0;
    const activa = c.activa !== false;
    const color = c.color || '#2563EB';
    return `
    <div style="padding:14px 16px;border-radius:12px;border:1px solid var(--gris-200);margin-bottom:8px;transition:all .15s;opacity:${activa?1:0.5}">
      <div style="display:flex;align-items:center;gap:14px;cursor:pointer" onclick="tesEditarCuenta('${c.id}')">
        <div style="width:44px;height:44px;border-radius:10px;background:${color}15;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:20px">🏦</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${c.nombre}</div>
          <div style="font-size:11px;color:var(--gris-400);margin-top:2px">
            ${c.iban ? c.iban : ''}${c.entidad ? (c.iban?' · ':'')+c.entidad : ''}
          </div>
        </div>
        ${verSaldos ? `<div style="text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:800;color:${saldo>=0?'var(--verde)':'var(--rojo)'}">${_tesFmt(saldo)} €</div>
          ${c.saldo_fecha ? `<div style="font-size:10px;color:var(--gris-400)">Actualizado ${_tesFecha(c.saldo_fecha)}</div>` : ''}
        </div>` : ''}
        <button class="btn btn-secondary btn-sm" style="flex-shrink:0;font-size:11px" onclick="event.stopPropagation();_tesCuentaSel='${c.id}';goPage('tesoreria-movimientos')">
          Movimientos →
        </button>
      </div>
      ${_tesCuentaOpenBankingBtns(c)}
    </div>`;
  }).join('');
}

// ── Modal nueva/editar cuenta ────────────────
function tesNuevaCuenta() {
  _tesMostrarModalCuenta(null);
}

function tesEditarCuenta(id) {
  if (!canDo('tesoreria','editar')) { toast('Sin permiso','error'); return; }
  const c = tesCuentas.find(x=> String(x.id) === String(id));
  if (c) _tesMostrarModalCuenta(c);
}

function _tesMostrarModalCuenta(c) {
  const esNueva = !c;
  const verSaldos = canDo('tesoreria','ver_saldos');
  const esConectada = c?.nordigen_conectado;
  const _esc = v => (v||'').replace(/"/g,'&quot;');

  // Reusar o crear overlay
  let modal = document.getElementById('mTesCuenta');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mTesCuenta';
    modal.className = 'overlay';
    modal.innerHTML = `<div class="modal" style="max-width:560px"><div id="mTesCuentaBody"></div></div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('mTesCuentaBody').innerHTML = `
    <div class="modal-h">
      <span>🏦</span>
      <h2>${esNueva ? 'Nueva cuenta bancaria' : 'Editar cuenta'}</h2>
      <button class="btn btn-ghost btn-icon" onclick="closeModal('mTesCuenta')">✕</button>
    </div>
    <div class="modal-b">
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg" style="flex:2"><label>Nombre *</label><input id="tes_c_nombre" value="${_esc(c?.nombre)}" placeholder="Ej: CaixaBank Principal"></div>
        <div class="fg"><label>Entidad</label><input id="tes_c_entidad" value="${_esc(c?.entidad)}" placeholder="CaixaBank, Santander..."></div>
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg" style="flex:2"><label>IBAN</label><input id="tes_c_iban" value="${_esc(c?.iban)}" placeholder="ES12 1234 5678 9012 3456 7890" oninput="_tesAutorellenoIBAN()"></div>
        <div class="fg"><label>SWIFT/BIC</label><input id="tes_c_swift" value="${_esc(c?.bic)}" placeholder="CAIXESBBXXX"></div>
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg"><label>Nº cuenta (si no IBAN)</label><input id="tes_c_numcuenta" value="${_esc(c?.numero_cuenta)}" placeholder="1234 5678 90 1234567890"></div>
        <div class="fg"><label>Titular</label><input id="tes_c_titular" value="${_esc(c?.titular)}" placeholder="Nombre del titular"></div>
      </div>

      <div style="border-top:1px solid var(--gris-100);margin:14px 0 10px;padding-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--gris-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Datos del banco / sucursal</div>
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg"><label>Sucursal</label><input id="tes_c_sucursal" value="${_esc(c?.sucursal)}" placeholder="Oficina / sucursal"></div>
        <div class="fg"><label>Teléfono banco</label><input id="tes_c_telfbanco" value="${_esc(c?.telefono_banco)}" placeholder="981 123 456"></div>
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg"><label>Persona de contacto</label><input id="tes_c_contacto" value="${_esc(c?.contacto_banco)}" placeholder="Nombre del gestor"></div>
        <div class="fg"><label>Email banco</label><input id="tes_c_emailbanco" value="${_esc(c?.email_banco)}" placeholder="gestor@banco.es"></div>
      </div>

      <div style="border-top:1px solid var(--gris-100);margin:14px 0 10px;padding-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--gris-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Configuración</div>
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        ${verSaldos && !esConectada ? `<div class="fg"><label>Saldo actual</label><input id="tes_c_saldo" type="number" step="0.01" value="${c?.saldo||0}"></div>` : ''}
        <div class="fg"><label>Color</label><input id="tes_c_color" type="color" value="${c?.color||'#2563EB'}" style="width:100%;height:36px;border:1px solid var(--gris-200);border-radius:8px;cursor:pointer"></div>
        <div class="fg" style="flex:0 0 auto;display:flex;align-items:flex-end;gap:8px;padding-bottom:4px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
            <input type="checkbox" id="tes_c_activo" ${c?.activa!==false?'checked':''} style="width:18px;height:18px"> Activa
          </label>
          ${esConectada ? '<span style="font-size:10px;color:#16A34A;font-weight:600;white-space:nowrap">🔗 Open Banking</span>' : ''}
        </div>
      </div>
      <div class="fg" style="margin-bottom:11px">
        <label>Observaciones</label>
        <textarea id="tes_c_notas" rows="2" style="width:100%;padding:8px 12px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;font-family:var(--font);resize:vertical" placeholder="Notas internas...">${_esc(c?.notas||c?.observaciones)}</textarea>
      </div>
    </div>
    <div class="modal-f" style="display:flex;justify-content:space-between">
      ${!esNueva ? `<button class="btn btn-ghost btn-sm" style="color:var(--rojo)" onclick="tesEliminarCuenta('${c.id}')">🗑️ Eliminar</button>` : '<div></div>'}
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="closeModal('mTesCuenta')">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="tesGuardarCuenta('${c?.id||''}')">${esNueva?'Crear cuenta':'Guardar'}</button>
      </div>
    </div>`;

  openModal('mTesCuenta');
}

async function tesGuardarCuenta(id) {
  const nombre = document.getElementById('tes_c_nombre').value.trim();
  if (!nombre) { toast('Introduce el nombre','error'); return; }

  const saldoEl = document.getElementById('tes_c_saldo');
  const obj = {
    empresa_id: EMPRESA.id,
    nombre,
    iban: document.getElementById('tes_c_iban').value.trim() || null,
    numero_cuenta: document.getElementById('tes_c_numcuenta')?.value.trim() || null,
    entidad: document.getElementById('tes_c_entidad').value.trim() || null,
    bic: document.getElementById('tes_c_swift').value.trim() || null,
    titular: document.getElementById('tes_c_titular')?.value.trim() || null,
    sucursal: document.getElementById('tes_c_sucursal')?.value.trim() || null,
    telefono_banco: document.getElementById('tes_c_telfbanco')?.value.trim() || null,
    contacto_banco: document.getElementById('tes_c_contacto')?.value.trim() || null,
    email_banco: document.getElementById('tes_c_emailbanco')?.value.trim() || null,
    color: document.getElementById('tes_c_color').value,
    activa: document.getElementById('tes_c_activo').checked,
    notas: document.getElementById('tes_c_notas').value.trim() || null
  };
  // Solo incluir saldo si el usuario tiene permiso de ver_saldos y es cuenta manual
  if (saldoEl) {
    obj.saldo = parseFloat(saldoEl.value) || 0;
    obj.saldo_fecha = new Date().toISOString();
  }

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
  if (typeof confirmModal !== 'function') return;
  const ok = await confirmModal({
    titulo: 'Eliminar cuenta',
    mensaje: '¿Eliminar esta cuenta bancaria y todos sus movimientos asociados?',
    aviso: 'Esta acción no se puede deshacer',
    btnOk: 'Eliminar',
    colorOk: '#DC2626'
  });
  if (!ok) return;
  const {error} = await sb.from('cuentas_bancarias').delete().eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  closeModal('mTesCuenta');
  toast('Cuenta eliminada','success');
  renderTesCuentas();
}


// ═══════════════════════════════════════════════
//  MOVIMIENTOS BANCARIOS
// ═══════════════════════════════════════════════

async function renderTesMovimientos() {
  await _tesCargarCuentas();
  // _tesCuentaSel: null/undefined = sin filtro (todas), string/number = filtrar por cuenta
  // No forzar al primer banco si el usuario eligió "todas"
  const cId = _tesCuentaSel != null && _tesCuentaSel !== '' ? _tesCuentaSel : null;
  await _tesCargarMovimientos(cId);

  const page = document.getElementById('page-tesoreria-movimientos');
  if (!page) return;

  const verSaldos = canDo('tesoreria','ver_saldos');
  const cuentaActual = tesCuentas.find(c=>String(c.id)===String(cId));
  const ingresos = tesMovimientos.filter(m=>m.importe>0).reduce((s,m)=>s+parseFloat(m.importe),0);
  const gastos = tesMovimientos.filter(m=>m.importe<0).reduce((s,m)=>s+Math.abs(parseFloat(m.importe)),0);

  const optsCuenta = tesCuentas.map(c => `<option value="${c.id}" ${String(c.id)===String(cId)?'selected':''}>${c.nombre}</option>`).join('');

  // Topbar: botón volver + nuevo movimiento
  const tb = document.getElementById('topbarBtns');
  if (tb) tb.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="goPage('tesoreria-cuentas')">← Cuentas</button>${canDo('tesoreria','crear') ? ' <button class="btn btn-primary btn-sm" onclick="tesNuevoMovimiento()">+ Nuevo movimiento</button>' : ''}`;

  page.innerHTML = `
    <!-- Barra filtros (patrón Presupuestos) -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-b" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none;min-width:180px" onchange="_tesCuentaSel=this.value?Number(this.value):null;renderTesMovimientos()">
          <option value="" ${!cId?'selected':''}>Todas las cuentas</option>
          ${optsCuenta}
        </select>
        <select style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none" onchange="_tesMovFiltros.estado=this.value;renderTesMovimientos()">
          <option value="">Estado: Todos</option>
          <option value="pendiente" ${_tesMovFiltros.estado==='pendiente'?'selected':''}>Pendiente</option>
          <option value="parcial" ${_tesMovFiltros.estado==='parcial'?'selected':''}>Parcial</option>
          <option value="conciliado" ${_tesMovFiltros.estado==='conciliado'?'selected':''}>Conciliado</option>
          <option value="ignorado" ${_tesMovFiltros.estado==='ignorado'?'selected':''}>Ignorado</option>
        </select>
        <select style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none" onchange="_tesMovFiltros.categoria=this.value;renderTesMovimientos()">
          <option value="">Categoría: Todas</option>
          <option value="ventas" ${_tesMovFiltros.categoria==='ventas'?'selected':''}>Ventas</option>
          <option value="compras" ${_tesMovFiltros.categoria==='compras'?'selected':''}>Compras</option>
          <option value="nominas" ${_tesMovFiltros.categoria==='nominas'?'selected':''}>Nóminas</option>
          <option value="impuestos" ${_tesMovFiltros.categoria==='impuestos'?'selected':''}>Impuestos</option>
          <option value="otros" ${_tesMovFiltros.categoria==='otros'?'selected':''}>Otros</option>
        </select>
        <input type="date" value="${_tesMovFiltros.desde}" onchange="_tesMovFiltros.desde=this.value;renderTesMovimientos()"
          style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
        <input type="date" value="${_tesMovFiltros.hasta}" onchange="_tesMovFiltros.hasta=this.value;renderTesMovimientos()"
          style="padding:7px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
        <button class="btn btn-ghost btn-sm" onclick="_tesMovFiltros={estado:'',categoria:'',desde:'',hasta:''};renderTesMovimientos()">Limpiar</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
      <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">💰</div><div class="sv">+${_tesFmt(ingresos)} €</div><div class="sl">Ingresos</div></div>
      <div class="sc" style="--c:var(--rojo);--bg:var(--rojo-light)"><div class="si">💸</div><div class="sv">-${_tesFmt(gastos)} €</div><div class="sl">Gastos</div></div>
      <div class="sc" style="--c:${(ingresos-gastos)>=0?'var(--verde)':'var(--rojo)'};--bg:${(ingresos-gastos)>=0?'var(--verde-light)':'var(--rojo-light)'}"><div class="si">📊</div><div class="sv">${_tesFmt(ingresos-gastos)} €</div><div class="sl">Neto</div></div>
      <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">📋</div><div class="sv">${tesMovimientos.length}</div><div class="sl">Movimientos</div></div>
    </div>

    <!-- Tabla movimientos -->
    <div class="card">
      <div class="tw">
        <table class="dt">
          <thead>
            <tr>
              <th style="width:90px">Fecha</th>
              <th>Concepto</th>
              <th style="width:90px">Categoría</th>
              <th style="width:110px;text-align:right">Importe</th>
              ${verSaldos ? '<th style="width:110px;text-align:right">Saldo</th>' : ''}
              <th style="width:85px;text-align:center">Estado</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="tesMovTable">${_tesMovTablaHTML(verSaldos)}</tbody>
        </table>
      </div>
    </div>
  `;
}

function _tesMovTablaHTML(verSaldos) {
  const numCols = verSaldos ? 7 : 6;
  if (!tesMovimientos.length) {
    return `<tr><td colspan="${numCols}" style="text-align:center;padding:40px;color:var(--gris-400)">
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
      ${verSaldos ? `<td style="text-align:right;font-size:12px;color:var(--gris-500)">${saldo!=null?_tesFmt(saldo)+' €':'—'}</td>` : ''}
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
  const m = tesMovimientos.find(x=> String(x.id) === String(id));
  if (m) _tesMostrarModalMov(m);
}

function _tesMostrarModalMov(m) {
  const esNuevo = !m;
  const _esc = v => (v||'').replace(/"/g,'&quot;');
  const optsCuenta = tesCuentas.map(c =>
    `<option value="${c.id}" ${String(m?.cuenta_id||_tesCuentaSel)===String(c.id)?'selected':''}>${c.nombre}</option>`
  ).join('');

  let modal = document.getElementById('mTesMov');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mTesMov';
    modal.className = 'overlay';
    modal.innerHTML = `<div class="modal" style="max-width:560px"><div id="mTesMovBody"></div></div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('mTesMovBody').innerHTML = `
    <div class="modal-h">
      <span>📊</span>
      <h2>${esNuevo ? 'Nuevo movimiento' : 'Editar movimiento'}</h2>
      <button class="btn btn-ghost btn-icon" onclick="closeModal('mTesMov')">✕</button>
    </div>
    <div class="modal-b">
      <div class="fg" style="margin-bottom:11px">
        <label>Cuenta *</label>
        <select id="tes_m_cuenta">${optsCuenta}</select>
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg"><label>Fecha operación *</label><input id="tes_m_fecha" type="date" value="${m?.fecha_operacion||new Date().toISOString().slice(0,10)}"></div>
        <div class="fg"><label>Fecha valor</label><input id="tes_m_fechavalor" type="date" value="${m?.fecha_valor||''}"></div>
      </div>
      <div class="fg" style="margin-bottom:11px">
        <label>Concepto</label>
        <input id="tes_m_concepto" value="${_esc(m?.concepto)}" placeholder="Descripción del movimiento">
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg"><label>Importe * <span style="font-size:10px;color:var(--gris-400)">(+ ingreso, - gasto)</span></label><input id="tes_m_importe" type="number" step="0.01" value="${m?.importe||''}"></div>
        <div class="fg"><label>Categoría</label>
          <select id="tes_m_cat">
            <option value="">— Sin categoría —</option>
            <option value="ventas" ${m?.categoria==='ventas'?'selected':''}>Ventas</option>
            <option value="compras" ${m?.categoria==='compras'?'selected':''}>Compras</option>
            <option value="nominas" ${m?.categoria==='nominas'?'selected':''}>Nóminas</option>
            <option value="impuestos" ${m?.categoria==='impuestos'?'selected':''}>Impuestos</option>
            <option value="otros" ${m?.categoria==='otros'?'selected':''}>Otros</option>
          </select>
        </div>
      </div>
      <div class="fg-row" style="margin-bottom:11px">
        <div class="fg"><label>Referencia</label><input id="tes_m_ref" value="${_esc(m?.referencia)}" placeholder="Ref. bancaria"></div>
        <div class="fg"><label>Estado</label>
          <select id="tes_m_estado">
            <option value="pendiente" ${m?.estado==='pendiente'?'selected':''}>Pendiente</option>
            <option value="parcial" ${m?.estado==='parcial'?'selected':''}>Parcial</option>
            <option value="conciliado" ${m?.estado==='conciliado'?'selected':''}>Conciliado</option>
            <option value="ignorado" ${m?.estado==='ignorado'?'selected':''}>Ignorado</option>
          </select>
        </div>
      </div>
      <div class="fg" style="margin-bottom:11px">
        <label>Notas</label>
        <textarea id="tes_m_notas" rows="2" style="resize:vertical">${_esc(m?.notas)}</textarea>
      </div>
    </div>
    <div class="modal-f" style="display:flex;justify-content:space-between">
      ${!esNuevo ? `<button class="btn btn-ghost btn-sm" style="color:var(--rojo)" onclick="tesEliminarMovimiento('${m.id}')">🗑️ Eliminar</button>` : '<div></div>'}
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="closeModal('mTesMov')">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="tesGuardarMovimiento('${m?.id||''}')">${esNuevo?'Crear':'Guardar'}</button>
      </div>
    </div>`;

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
  if (typeof confirmModal !== 'function') return;
  const ok = await confirmModal({
    titulo: 'Eliminar movimiento',
    mensaje: '¿Eliminar este movimiento bancario?',
    aviso: 'Esta acción no se puede deshacer',
    btnOk: 'Eliminar',
    colorOk: '#DC2626'
  });
  if (!ok) return;
  const m = tesMovimientos.find(x=> String(x.id) === String(id));
  const {error} = await sb.from('movimientos_bancarios').delete().eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  closeModal('mTesMov');
  if (m?.cuenta_id) await _tesRecalcularSaldo(m.cuenta_id);
  toast('Movimiento eliminado','success');
  renderTesMovimientos();
}

// Recalcular saldo de una cuenta sumando todos sus movimientos
// Solo para cuentas sin Open Banking; las conectadas usan el saldo real del banco
async function _tesRecalcularSaldo(cuentaId) {
  // Si la cuenta está conectada por OB, no pisar el saldo real del banco
  const cuenta = tesCuentas.find(c => c.id === cuentaId);
  if (cuenta?.nordigen_conectado) return;

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
//  CONCILIACIÓN BANCARIA
//  Vincula movimientos con facturas (N:N, pagos parciales)
// ═══════════════════════════════════════════════

let _concFactVenta = [];
let _concFactCompra = [];
let _concMovPend = [];

async function renderTesConciliacion() {
  const page = document.getElementById('page-tesoreria-conciliacion');
  if (!page) return;

  // Cargar movimientos pendientes/parciales
  const {data: movs} = await sb.from('movimientos_bancarios').select('*')
    .eq('empresa_id', EMPRESA.id)
    .in('estado', ['pendiente','parcial'])
    .order('fecha_operacion', {ascending:false}).limit(200);
  _concMovPend = movs || [];

  // Cargar facturas venta no anuladas
  const {data: fv} = await sb.from('facturas').select('id,numero,fecha,total,cliente_nombre,estado')
    .eq('empresa_id', EMPRESA.id).neq('estado','anulada').neq('estado','eliminado')
    .order('fecha',{ascending:false}).limit(500);
  _concFactVenta = fv || [];

  // Cargar facturas compra no anuladas
  const {data: fc} = await sb.from('facturas_proveedor').select('id,numero,fecha,total,proveedor_nombre,estado')
    .eq('empresa_id', EMPRESA.id).neq('estado','anulada')
    .order('fecha',{ascending:false}).limit(500);
  _concFactCompra = fc || [];

  // Cargar conciliaciones existentes
  const {data: concs} = await sb.from('conciliaciones').select('*').eq('empresa_id', EMPRESA.id);
  tesConciliaciones = concs || [];

  // Calcular importes ya conciliados por factura
  const concByFact = {};
  const concByFactProv = {};
  tesConciliaciones.forEach(c => {
    if (c.factura_id) concByFact[c.factura_id] = (concByFact[c.factura_id]||0) + parseFloat(c.importe||0);
    if (c.factura_prov_id) concByFactProv[c.factura_prov_id] = (concByFactProv[c.factura_prov_id]||0) + parseFloat(c.importe||0);
  });

  const pendientes = _concMovPend.length;
  const totalPend = _concMovPend.reduce((s,m)=>s+Math.abs(parseFloat(m.importe)||0),0);

  // Topbar: botón auto-conciliar
  const tb = document.getElementById('topbarBtns');
  if (tb) tb.innerHTML = '<button class="btn btn-secondary" onclick="_concAutoMatch()">⚡ Auto-conciliar</button>';

  page.innerHTML = `
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
      <div class="sc" style="--c:var(--amarillo);--bg:var(--amarillo-light)"><div class="si">⏳</div><div class="sv">${pendientes}</div><div class="sl">Pendientes</div></div>
      <div class="sc" style="--c:var(--azul);--bg:var(--azul-light)"><div class="si">💶</div><div class="sv">${_tesFmt(totalPend)} €</div><div class="sl">Importe pendiente</div></div>
      <div class="sc" style="--c:var(--verde);--bg:var(--verde-light)"><div class="si">✅</div><div class="sv">${tesConciliaciones.length}</div><div class="sl">Conciliados</div></div>
    </div>

    <!-- Lista de movimientos pendientes -->
    <div class="card">
      <div class="tw">
        <table class="dt">
        <thead>
          <tr>
            <th style="width:85px">Fecha</th>
            <th>Concepto</th>
            <th style="width:110px;text-align:right">Importe</th>
            <th style="width:100px;text-align:right">Conciliado</th>
            <th style="width:80px;text-align:center">Estado</th>
            <th style="width:100px;text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>${_concMovPend.length ? _concMovPend.map(m => {
    const imp = parseFloat(m.importe)||0;
    const conc = parseFloat(m.importe_conciliado)||0;
    const pend = Math.abs(imp) - Math.abs(conc);
    return `<tr>
      <td style="font-size:12px">${_tesFecha(m.fecha_operacion)}</td>
      <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.concepto||'—'}</td>
      <td style="text-align:right;font-weight:700;color:${_tesColor(imp)}">${imp>0?'+':''}${_tesFmt(imp)} €</td>
      <td style="text-align:right;font-size:12px;color:var(--gris-500)">${conc?_tesFmt(conc)+' €':'—'}</td>
      <td style="text-align:center"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:${m.estado==='parcial'?'#3B82F615':'#F59E0B15'};color:${m.estado==='parcial'?'#3B82F6':'#F59E0B'}">${m.estado==='parcial'?'Parcial':'Pendiente'}</span></td>
      <td style="text-align:center">
        <button class="btn btn-primary btn-sm" style="font-size:10px" onclick="_concVincular('${m.id}',${imp})">🔗 Vincular</button>
        <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="_concIgnorar('${m.id}')">Ignorar</button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gris-400)">
      <div style="font-size:36px;margin-bottom:8px">✅</div>
      <strong>Todo conciliado</strong><br><span style="font-size:12px">No hay movimientos pendientes de conciliar</span>
    </td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

// Modal para vincular un movimiento con factura(s)
function _concVincular(movId, importe) {
  const esIngreso = importe > 0;
  const facturas = esIngreso ? _concFactVenta : _concFactCompra;
  const label = esIngreso ? 'Factura de venta (cobro)' : 'Factura de compra (pago)';
  const absImp = Math.abs(importe);
  const mov = _concMovPend.find(m=>m.id===movId);
  const yaConciliado = Math.abs(parseFloat(mov?.importe_conciliado)||0);
  const pendiente = absImp - yaConciliado;

  const optsFacturas = facturas.map(f =>
    `<option value="${f.id}">${f.numero||'S/N'} — ${f.cliente_nombre||f.proveedor_nombre||'?'} — ${_tesFmt(f.total)} €</option>`
  ).join('');

  let modal = document.getElementById('mConc');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mConc';
    modal.className = 'overlay';
    modal.innerHTML = `<div class="modal" style="max-width:520px"><div id="mConcBody"></div></div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('mConcBody').innerHTML = `
    <div class="modal-h">
      <span>🔗</span>
      <h2>Conciliar movimiento</h2>
      <button class="btn btn-ghost btn-icon" onclick="closeModal('mConc')">✕</button>
    </div>
    <div class="modal-b">
      <div style="padding:10px 14px;border-radius:8px;background:var(--gris-50);margin-bottom:14px;font-size:12px;color:var(--gris-500)">
        ${mov?.concepto||'Sin concepto'} · <strong style="color:${_tesColor(importe)}">${importe>0?'+':''}${_tesFmt(importe)} €</strong>
        ${yaConciliado>0 ? ` · Ya conciliado: ${_tesFmt(yaConciliado)} € · Pendiente: ${_tesFmt(pendiente)} €` : ''}
      </div>
      <div class="fg" style="margin-bottom:11px">
        <label>${label}</label>
        <select id="conc_factura" style="font-size:12px">${optsFacturas}</select>
      </div>
      <div class="fg" style="margin-bottom:11px">
        <label>Importe a conciliar</label>
        <input id="conc_importe" type="number" step="0.01" value="${pendiente.toFixed(2)}">
        <div style="font-size:10px;color:var(--gris-400);margin-top:2px">Puede ser parcial (menor que el total del movimiento)</div>
      </div>
      <div class="fg" style="margin-bottom:11px">
        <label>Notas</label>
        <input id="conc_notas" placeholder="Opcional">
      </div>
    </div>
    <div class="modal-f" style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-secondary btn-sm" onclick="closeModal('mConc')">Cancelar</button>
      <button class="btn btn-primary btn-sm" onclick="_concGuardar('${movId}',${importe})">Conciliar</button>
    </div>`;

  openModal('mConc');
}

async function _concGuardar(movId, movImporte) {
  const esIngreso = movImporte > 0;
  const factId = document.getElementById('conc_factura').value;
  const impConc = parseFloat(document.getElementById('conc_importe').value);
  const notas = document.getElementById('conc_notas').value.trim() || null;

  if (!factId) { toast('Selecciona una factura','error'); return; }
  if (!impConc || impConc <= 0) { toast('Importe inválido','error'); return; }

  const obj = {
    empresa_id: EMPRESA.id,
    movimiento_id: movId,
    importe: impConc,
    notas,
    usuario_id: CU?.id || null
  };
  if (esIngreso) obj.factura_id = factId;
  else obj.factura_prov_id = factId;

  const {error} = await sb.from('conciliaciones').insert(obj);
  if (error) { toast('Error: '+error.message,'error'); return; }

  // Actualizar importe_conciliado y estado del movimiento
  const mov = _concMovPend.find(m=>m.id===movId);
  const nuevoConc = Math.abs(parseFloat(mov?.importe_conciliado)||0) + impConc;
  const absTotal = Math.abs(movImporte);
  const nuevoEstado = nuevoConc >= absTotal ? 'conciliado' : 'parcial';

  await sb.from('movimientos_bancarios').update({
    importe_conciliado: nuevoConc,
    estado: nuevoEstado
  }).eq('id', movId);

  closeModal('mConc');
  toast(`Movimiento ${nuevoEstado === 'conciliado' ? 'conciliado ✓' : 'parcialmente conciliado'}`,'success');
  renderTesConciliacion();
}

async function _concIgnorar(movId) {
  if (typeof confirmModal !== 'function') return;
  const ok = await confirmModal({
    titulo: 'Ignorar movimiento',
    mensaje: '¿Marcar este movimiento como ignorado?',
    btnOk: 'Ignorar',
    colorOk: '#94A3B8'
  });
  if (!ok) return;
  await sb.from('movimientos_bancarios').update({estado:'ignorado'}).eq('id', movId);
  toast('Movimiento ignorado','success');
  renderTesConciliacion();
}

// Auto-conciliación: busca coincidencias exactas de importe entre movimientos y facturas
async function _concAutoMatch() {
  let matched = 0;

  for (const mov of _concMovPend) {
    const imp = parseFloat(mov.importe) || 0;
    const absImp = Math.abs(imp);
    if (absImp === 0) continue;

    // Buscar factura con total exacto
    let factura = null;
    let esProv = false;

    if (imp > 0) {
      // Ingreso → buscar factura de venta con ese total
      factura = _concFactVenta.find(f => {
        const concExist = tesConciliaciones.filter(c=>c.factura_id===f.id).reduce((s,c)=>s+parseFloat(c.importe||0),0);
        return Math.abs(parseFloat(f.total) - concExist - absImp) < 0.02;
      });
    } else {
      // Gasto → buscar factura proveedor con ese total
      esProv = true;
      factura = _concFactCompra.find(f => {
        const concExist = tesConciliaciones.filter(c=>c.factura_prov_id===f.id).reduce((s,c)=>s+parseFloat(c.importe||0),0);
        return Math.abs(parseFloat(f.total) - concExist - absImp) < 0.02;
      });
    }

    if (factura) {
      const obj = {
        empresa_id: EMPRESA.id,
        movimiento_id: mov.id,
        importe: absImp,
        notas: 'Auto-conciliado',
        usuario_id: CU?.id || null
      };
      if (esProv) obj.factura_prov_id = factura.id;
      else obj.factura_id = factura.id;

      const {error} = await sb.from('conciliaciones').insert(obj);
      if (!error) {
        await sb.from('movimientos_bancarios').update({
          importe_conciliado: absImp,
          estado: 'conciliado'
        }).eq('id', mov.id);
        matched++;
      }
    }
  }

  if (matched > 0) {
    toast(`⚡ ${matched} movimiento${matched>1?'s':''} conciliado${matched>1?'s':''} automáticamente`,'success');
    renderTesConciliacion();
  } else {
    toast('No se encontraron coincidencias exactas','info');
  }
}


// ═══════════════════════════════════════════════
//  IMPORTAR EXTRACTOS — Norma 43 (AEB) y CSV
// ═══════════════════════════════════════════════

let _impMovsPrev = []; // movimientos parseados para preview

async function renderTesImportar() {
  await _tesCargarCuentas();
  const page = document.getElementById('page-tesoreria-importar');
  if (!page) return;

  const optsCuenta = tesCuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  // Topbar limpio para importar
  const tb = document.getElementById('topbarBtns');
  if (tb) tb.innerHTML = '';

  page.innerHTML = `
    <div class="card" style="padding:20px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:end">
        <div>
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">Cuenta destino *</label>
          <select id="imp_cuenta" class="input">${optsCuenta}</select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">Formato del fichero</label>
          <select id="imp_formato" class="input">
            <option value="auto">Detectar automáticamente</option>
            <option value="n43">Norma 43 (AEB Cuaderno 43)</option>
            <option value="csv">CSV genérico</option>
          </select>
        </div>
      </div>
      <div style="margin-top:16px">
        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">Fichero</label>
        <div id="impDropZone" style="border:2px dashed var(--gris-300);border-radius:12px;padding:30px;text-align:center;cursor:pointer;transition:all .2s"
          onclick="document.getElementById('imp_file').click()"
          ondragover="event.preventDefault();this.style.borderColor='var(--azul)';this.style.background='var(--azul-light)'"
          ondragleave="this.style.borderColor='var(--gris-300)';this.style.background=''"
          ondrop="event.preventDefault();this.style.borderColor='var(--gris-300)';this.style.background='';_impFileSelected(event.dataTransfer.files[0])">
          <div style="font-size:36px;margin-bottom:8px">📄</div>
          <div style="font-size:13px;font-weight:600">Arrastra tu fichero aquí o haz clic para seleccionar</div>
          <div style="font-size:11px;color:var(--gris-400);margin-top:4px">Norma 43 (.n43, .txt, .aeb) o CSV (.csv)</div>
        </div>
        <input type="file" id="imp_file" accept=".n43,.txt,.aeb,.csv,.tsv" style="display:none" onchange="_impFileSelected(this.files[0])">
      </div>
    </div>

    <!-- Preview de movimientos parseados -->
    <div id="impPreview" style="display:none">
      <div class="card" style="padding:14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <span style="font-size:13px;font-weight:700" id="impPreviewCount">0 movimientos</span>
          <span style="font-size:12px;color:var(--gris-400)" id="impPreviewResumen"></span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="_impCancelar()">Cancelar</button>
          <button class="btn btn-primary" onclick="_impConfirmar()">✅ Importar todos</button>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:auto;max-height:400px">
        <table class="dt" style="width:100%">
          <thead><tr><th>Fecha</th><th>Concepto</th><th style="text-align:right">Importe</th><th>Referencia</th></tr></thead>
          <tbody id="impPreviewTable"></tbody>
        </table>
      </div>
    </div>

    <!-- Info formatos -->
    <div class="card" style="padding:16px;margin-top:16px;background:#f8fafc">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">ℹ️ Formatos soportados</div>
      <div style="font-size:12px;color:var(--gris-500);line-height:1.6">
        <strong>Norma 43 (Cuaderno 43 AEB)</strong> — Formato estándar español. Tu banco lo ofrece al descargar extractos. Extensiones .n43, .txt, .aeb<br>
        <strong>CSV genérico</strong> — Fichero con columnas: fecha, concepto, importe (separador ; o ,). La primera fila debe ser cabecera.
      </div>
    </div>
  `;
}

function _impFileSelected(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const content = e.target.result;
    const formato = document.getElementById('imp_formato').value;

    // Detectar formato
    let movs;
    if (formato === 'n43' || (formato === 'auto' && _impEsNorma43(content))) {
      movs = _impParseNorma43(content);
    } else {
      movs = _impParseCSV(content);
    }

    _impMovsPrev = movs;
    _impMostrarPreview(movs);
  };
  reader.readAsText(file, 'ISO-8859-1'); // Norma 43 usa latin1
}

function _impEsNorma43(content) {
  // Norma 43 empieza con registros tipo 11 (cabecera cuenta) o 00
  const lines = content.split('\n');
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed) continue;
    return /^\d{2}/.test(trimmed) && trimmed.length >= 72;
  }
  return false;
}

// ── Parser Norma 43 (AEB Cuaderno 43) ────────
function _impParseNorma43(content) {
  const lines = content.split('\n');
  const movs = [];
  let currentMov = null;

  for (const line of lines) {
    const l = line.replace(/\r/g, '');
    if (l.length < 2) continue;
    const tipo = l.substring(0, 2);

    if (tipo === '22') {
      // Registro de movimiento principal
      // Pos 10-15: fecha operación (AAMMDD)
      // Pos 16-21: fecha valor (AAMMDD)
      // Pos 22-23: concepto común (2 dígitos)
      // Pos 27: signo (1=haber/ingreso, 2=debe/gasto)
      // Pos 28-41: importe (14 dígitos, 2 decimales)
      // Pos 42-52: nº documento
      // Pos 53-62: referencia 1
      // Pos 63-78: referencia 2
      const fechaOp = _impN43Fecha(l.substring(10, 16));
      const fechaVal = _impN43Fecha(l.substring(16, 22));
      const signo = l.substring(27, 28);
      const impRaw = parseInt(l.substring(28, 42)) / 100;
      const importe = signo === '2' ? -impRaw : impRaw;
      const ref1 = l.substring(52, 62).trim();
      const ref2 = l.substring(62, 78).trim();

      currentMov = {
        fecha_operacion: fechaOp,
        fecha_valor: fechaVal,
        importe,
        referencia: (ref1 + ' ' + ref2).trim() || null,
        concepto: '',
        _conceptoParts: []
      };
      movs.push(currentMov);
    }
    else if (tipo === '23' && currentMov) {
      // Registro complementario de concepto
      // Pos 4-42: concepto libre (campo 1)
      // Pos 43-80: concepto libre (campo 2)
      const c1 = l.substring(4, 42).trim();
      const c2 = (l.length > 42) ? l.substring(42, 80).trim() : '';
      if (c1) currentMov._conceptoParts.push(c1);
      if (c2) currentMov._conceptoParts.push(c2);
    }
  }

  // Unir partes de concepto
  movs.forEach(m => {
    m.concepto = m._conceptoParts.join(' ').trim() || 'Movimiento importado';
    delete m._conceptoParts;
  });

  return movs;
}

function _impN43Fecha(aammdd) {
  if (!aammdd || aammdd.length !== 6) return new Date().toISOString().slice(0,10);
  const yy = parseInt(aammdd.substring(0, 2));
  const mm = aammdd.substring(2, 4);
  const dd = aammdd.substring(4, 6);
  const year = yy > 50 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

// ── Parser CSV genérico ──────────────────────
function _impParseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detectar separador
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g,''));

  // Buscar columnas clave
  const idate = header.findIndex(h => /fecha|date|f\.\s*oper/i.test(h));
  const iconcept = header.findIndex(h => /concepto|descripci|detail|text/i.test(h));
  const iamount = header.findIndex(h => /importe|amount|cantidad|monto|cargo|abono/i.test(h));
  const iref = header.findIndex(h => /ref|document|numer/i.test(h));

  // Si hay columnas cargo/abono separadas
  const icargo = header.findIndex(h => /cargo|debe|debit/i.test(h));
  const iabono = header.findIndex(h => /abono|haber|credit|ingreso/i.test(h));

  if (idate === -1) { toast('No se encuentra columna de fecha en el CSV','error'); return []; }

  const movs = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = _csvSplitLine(lines[i], sep);
    if (!cols || cols.length < 2) continue;

    const fechaRaw = cols[idate]?.replace(/['"]/g,'').trim();
    const fecha = _impParseFecha(fechaRaw);
    if (!fecha) continue;

    let importe;
    if (iamount !== -1) {
      importe = _impParseNum(cols[iamount]);
    } else if (icargo !== -1 || iabono !== -1) {
      const cargo = icargo !== -1 ? Math.abs(_impParseNum(cols[icargo])) : 0;
      const abono = iabono !== -1 ? Math.abs(_impParseNum(cols[iabono])) : 0;
      importe = abono > 0 ? abono : -cargo;
    } else {
      continue;
    }

    if (!importe || importe === 0) continue;

    movs.push({
      fecha_operacion: fecha,
      fecha_valor: null,
      concepto: (iconcept !== -1 ? cols[iconcept]?.replace(/['"]/g,'').trim() : '') || 'Movimiento CSV',
      importe,
      referencia: iref !== -1 ? cols[iref]?.replace(/['"]/g,'').trim() || null : null
    });
  }
  return movs;
}

function _csvSplitLine(line, sep) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function _impParseFecha(s) {
  if (!s) return null;
  // DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  let m;
  if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/))) {
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if ((m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/))) {
    return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  return null;
}

function _impParseNum(s) {
  if (!s) return 0;
  s = s.replace(/['"]/g,'').trim();
  // Formato español: 1.234,56 → 1234.56
  if (s.includes(',') && (s.indexOf(',') > s.lastIndexOf('.') || !s.includes('.'))) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  return parseFloat(s) || 0;
}

function _impMostrarPreview(movs) {
  const prev = document.getElementById('impPreview');
  const table = document.getElementById('impPreviewTable');
  const count = document.getElementById('impPreviewCount');
  const resumen = document.getElementById('impPreviewResumen');

  if (!movs.length) {
    toast('No se encontraron movimientos en el fichero','error');
    return;
  }

  const ingresos = movs.filter(m=>m.importe>0).reduce((s,m)=>s+m.importe,0);
  const gastos = movs.filter(m=>m.importe<0).reduce((s,m)=>s+Math.abs(m.importe),0);

  count.textContent = `${movs.length} movimiento${movs.length>1?'s':''}`;
  resumen.textContent = ` · Ingresos: +${_tesFmt(ingresos)} € · Gastos: -${_tesFmt(gastos)} €`;

  table.innerHTML = movs.map(m => `
    <tr>
      <td style="font-size:12px;white-space:nowrap">${_tesFecha(m.fecha_operacion)}</td>
      <td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.concepto}</td>
      <td style="text-align:right;font-weight:700;color:${_tesColor(m.importe)}">${m.importe>0?'+':''}${_tesFmt(m.importe)} €</td>
      <td style="font-size:11px;color:var(--gris-400)">${m.referencia||''}</td>
    </tr>`).join('');

  prev.style.display = '';
}

function _impCancelar() {
  _impMovsPrev = [];
  document.getElementById('impPreview').style.display = 'none';
  document.getElementById('imp_file').value = '';
}

async function _impConfirmar() {
  const cuentaId = document.getElementById('imp_cuenta').value;
  if (!cuentaId) { toast('Selecciona una cuenta','error'); return; }
  if (!_impMovsPrev.length) { toast('No hay movimientos','error'); return; }

  const formato = document.getElementById('imp_formato').value;
  const origen = formato === 'csv' ? 'csv' : 'norma43';

  // Insertar en lotes de 50
  let insertados = 0;
  const lotes = [];
  for (let i = 0; i < _impMovsPrev.length; i += 50) {
    lotes.push(_impMovsPrev.slice(i, i + 50));
  }

  for (const lote of lotes) {
    const rows = lote.map(m => ({
      empresa_id: EMPRESA.id,
      cuenta_id: cuentaId,
      fecha_operacion: m.fecha_operacion,
      fecha_valor: m.fecha_valor || null,
      concepto: m.concepto,
      importe: m.importe,
      referencia: m.referencia,
      estado: 'pendiente',
      origen,
      origen_ref: null
    }));

    const {error, data} = await sb.from('movimientos_bancarios').insert(rows).select();
    if (error) { toast('Error importando: '+error.message,'error'); break; }
    insertados += (data?.length || 0);
  }

  // Recalcular saldo
  await _tesRecalcularSaldo(cuentaId);

  _impMovsPrev = [];
  toast(`✅ ${insertados} movimientos importados correctamente`, 'success');
  renderTesImportar();
}


// ═══════════════════════════════════════════════
//  OPEN BANKING — GoCardless (ex-Nordigen)
//  Conexión directa con bancos vía API
// ═══════════════════════════════════════════════

let _obInstitutions = null; // cache de bancos disponibles

async function _obCall(body) {
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  const resp = await fetch(`${SUPA_URL}/functions/v1/enablebanking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPA_KEY
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// Añadir botón Open Banking en la vista de cuentas
function _tesCuentaOpenBankingBtns(cuenta) {
  if (!cuenta) return '';
  if (cuenta.nordigen_conectado) {
    const lastSync = cuenta.nordigen_ultimo_sync ? _tesFecha(cuenta.nordigen_ultimo_sync) : 'Nunca';
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#10B98115;color:#10B981">🔗 Conectado</span>
        <span style="font-size:10px;color:var(--gris-400)">Última sync: ${lastSync}</span>
        <button class="btn btn-primary btn-sm" style="font-size:10px" onclick="event.stopPropagation();obSyncCuenta('${cuenta.id}','${cuenta.nordigen_account_id}')">🔄 Sincronizar</button>
        <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="event.stopPropagation();obDesconectar('${cuenta.id}','${cuenta.nordigen_requisition_id}')">Desconectar</button>
      </div>`;
  }
  if (cuenta.nordigen_requisition_id && !cuenta.nordigen_conectado) {
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#F59E0B15;color:#F59E0B">⏳ Pendiente autorización</span>
        <button class="btn btn-primary btn-sm" style="font-size:10px" onclick="event.stopPropagation();obCheckStatus('${cuenta.id}','${cuenta.nordigen_requisition_id}')">Verificar estado</button>
        <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="event.stopPropagation();obDesconectar('${cuenta.id}','${cuenta.nordigen_requisition_id}')">Cancelar</button>
      </div>`;
  }
  return `
    <div style="margin-top:8px">
      <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="event.stopPropagation();obConectar('${cuenta.id}')">🏦 Conectar banco (Open Banking)</button>
    </div>`;
}

// Modal para seleccionar banco y conectar
async function obConectar(cuentaId) {
  let modal = document.getElementById('mOB');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mOB';
    modal.className = 'overlay';
    modal.innerHTML = `<div class="modal" style="max-width:520px"><div id="mOBBody"></div></div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('mOBBody').innerHTML = `
    <div style="padding:32px;text-align:center">
      <div class="spinner" style="margin:0 auto 16px"></div>
      <div style="font-size:13px;color:var(--gris-400)">Conectando con Open Banking...</div>
    </div>`;
  openModal('mOB');

  try {
    if (!_obInstitutions) {
      // Intentar ES primero, si no hay resultados cargar todos (sandbox)
      let resp = await _obCall({ action: 'institutions', country: 'ES' });
      let list = Array.isArray(resp) ? resp : (resp?.aspsps || resp?.data || []);
      if (!list.length) {
        resp = await _obCall({ action: 'institutions', country: '' });
        list = Array.isArray(resp) ? resp : (resp?.aspsps || resp?.data || []);
      }
      _obInstitutions = list;
    }
    const bancos = Array.isArray(_obInstitutions) ? [..._obInstitutions] : [];
    bancos.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const numBancos = bancos.length;
    document.getElementById('mOBBody').innerHTML = `
      <div class="modal-h">
        <span>🏦</span>
        <h2>Conectar banco</h2>
        <button class="btn btn-ghost btn-icon" onclick="closeModal('mOB')">✕</button>
      </div>
      <div class="modal-b" style="padding-bottom:0">
        <div style="font-size:11.5px;color:var(--gris-400);margin-bottom:12px">
          Acceso de solo lectura a movimientos · PSD2 · ${numBancos} banco${numBancos!==1?'s':''}
        </div>
        <div class="fg" style="margin-bottom:12px">
          <input id="ob_buscar" placeholder="🔍 Buscar banco..." oninput="_obFiltrarBancos(this.value)">
        </div>
        <div id="obBancosList" style="max-height:340px;overflow-y:auto;border:1px solid var(--gris-200);border-radius:10px">
          ${_obBancosHTML(bancos, cuentaId)}
        </div>
      </div>
      <div class="modal-f" style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:#166534">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#dcfce7;font-size:10px">🔒</span>
          Enable Banking · AISP regulado PSD2
        </div>
        <button class="btn btn-secondary btn-sm" onclick="closeModal('mOB')">Cancelar</button>
      </div>`;

  } catch (err) {
    document.getElementById('mOBBody').innerHTML = `
      <div style="padding:40px 30px;text-align:center">
        <div style="width:48px;height:48px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px">⚠️</div>
        <div style="font-size:14px;font-weight:700;margin-bottom:6px">Error al cargar bancos</div>
        <div style="font-size:12px;color:var(--gris-400);margin-bottom:20px;max-width:320px;margin-left:auto;margin-right:auto">${err.message}</div>
        <button class="btn btn-secondary" onclick="closeModal('mOB')">Cerrar</button>
      </div>`;
  }
}

function _obBancosHTML(bancos, cuentaId) {
  if (!bancos.length) return '<div style="padding:30px;text-align:center;color:var(--gris-400);font-size:12px">No se encontraron bancos disponibles</div>';
  return bancos.map(b => {
    const safeName = (b.id||b.name||'').replace(/'/g, "\\'");
    const safeCountry = (b.country||'ES').replace(/'/g, "\\'");
    return `
    <div class="ob-banco" data-name="${(b.name||'').toLowerCase()}" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--gris-100);cursor:pointer;transition:background .15s"
      onmouseover="this.style.background='var(--azul-50,#eff6ff)'" onmouseout="this.style.background=''"
      onclick="_obSeleccionarBanco('${safeName}','${safeCountry}','${cuentaId}')">
      ${b.logo ? `<img src="${b.logo}" style="width:36px;height:36px;border-radius:8px;object-fit:contain;border:1px solid var(--gris-200);background:#fff">` : `<div style="width:36px;height:36px;border-radius:8px;background:var(--azul-50,#eff6ff);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--azul)">🏦</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.name}</div>
        ${b.bic ? `<div style="font-size:10px;color:var(--gris-400);margin-top:1px">${b.bic}</div>` : (b.country ? `<div style="font-size:10px;color:var(--gris-400);margin-top:1px">${b.country}</div>` : '')}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gris-300)" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>`;
  }).join('');
}

function _obFiltrarBancos(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.ob-banco').forEach(el => {
    const name = el.dataset.name || '';
    el.style.display = name.includes(q) ? '' : 'none';
  });
}

async function _obSeleccionarBanco(institutionId, institutionCountry, cuentaId) {
  const body = document.getElementById('mOBBody');
  body.innerHTML = `
    <div style="padding:30px;text-align:center">
      <div class="spinner" style="margin:0 auto 12px"></div>
      <div style="font-size:13px;color:var(--gris-400)">Creando enlace de autorización...</div>
    </div>`;

  try {
    // URL de retorno: debe coincidir EXACTAMENTE con la registrada en Enable Banking
    const redirectUrl = window.location.origin + '/index.html';

    const result = await _obCall({
      action: 'connect',
      institution_id: institutionId,
      institution_country: institutionCountry || 'ES',
      redirect_url: redirectUrl,
      empresa_id: EMPRESA.id,
      cuenta_id: cuentaId
    });

    body.innerHTML = `
      <div style="padding:40px 30px;text-align:center">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--azul-50,#eff6ff);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:26px">🏦</div>
        <h3 style="font-size:15px;font-weight:700;margin-bottom:6px">Autoriza el acceso en tu banco</h3>
        <p style="font-size:12px;color:var(--gris-400);margin-bottom:24px;max-width:340px;margin-left:auto;margin-right:auto;line-height:1.5">
          Se abrirá la web de tu banco. Autoriza el acceso de solo lectura y volverás aquí automáticamente.
        </p>
        <a href="${result.link}" target="_blank" class="btn btn-primary" style="font-size:13px;padding:10px 28px;border-radius:8px">
          Ir al banco para autorizar →
        </a>
        <div style="margin-top:14px">
          <button class="btn btn-secondary btn-sm" onclick="closeModal('mOB');renderTesCuentas()">Verificar después</button>
        </div>
      </div>`;

  } catch (err) {
    body.innerHTML = `
      <div style="padding:30px;text-align:center">
        <div style="font-size:36px;margin-bottom:12px">❌</div>
        <div style="font-size:14px;font-weight:700;margin-bottom:8px">Error</div>
        <div style="font-size:12px;color:var(--gris-400);margin-bottom:16px">${err.message}</div>
        <button class="btn btn-secondary" onclick="closeModal('mOB')">Cerrar</button>
      </div>`;
  }
}

async function obCheckStatus(cuentaId, requisitionId) {
  toast('Verificando estado...','info');
  try {
    // Recargar cuenta desde BD para ver si ya tiene nordigen_account_id (callback ya procesado)
    await _tesCargarCuentas();
    const cuenta = tesCuentas.find(c => c.id == cuentaId);
    if (cuenta?.nordigen_conectado && cuenta?.nordigen_account_id) {
      toast('✅ Banco conectado correctamente. Sincronizando movimientos...','success');
      await obSyncCuenta(cuentaId, cuenta.nordigen_account_id);
      renderTesCuentas();
    } else {
      toast('⏳ La autorización aún no se ha completado. Abre el enlace del banco y autoriza el acceso.','info');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function obSyncCuenta(cuentaId, nordigenAccountId) {
  toast('🔄 Sincronizando movimientos...','info');
  try {
    const result = await _obCall({
      action: 'sync',
      empresa_id: EMPRESA.id,
      cuenta_id: cuentaId,
      nordigen_account_id: nordigenAccountId
    });
    toast(`✅ ${result.message}`, 'success');
    renderTesCuentas();
  } catch (err) {
    toast('Error sincronizando: ' + err.message, 'error');
  }
}

async function obDesconectar(cuentaId, requisitionId) {
  const ok = await confirmModal({
    titulo: 'Desconectar banco',
    mensaje: '¿Desconectar este banco? Los movimientos ya importados se conservan.',
    btnOk: 'Desconectar',
    colorOk: '#dc2626'
  });
  if (!ok) return;
  try {
    await _obCall({ action: 'disconnect', cuenta_id: cuentaId });
    toast('Banco desconectado', 'success');
    renderTesCuentas();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// Comprobar si venimos de un retorno de Open Banking
// Enable Banking redirige con ?code=XXX&state=instaloerp_CUENTAID_TIMESTAMP
function _obCheckReturn() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state') || '';

  // Extraer cuentaId del state: formato "instaloerp_CUENTAID_TIMESTAMP"
  let cuentaId = null;
  if (state.startsWith('instaloerp_')) {
    const parts = state.split('_');
    if (parts.length >= 3) cuentaId = parts[1];
  }

  // Si el banco devolvió un error (usuario canceló, server_error, etc.)
  const obError = params.get('error');
  if (obError) {
    window.history.replaceState({}, '', window.location.pathname);
    const desc = params.get('error_description') || obError;
    setTimeout(() => {
      toast(`⚠️ Autorización bancaria cancelada: ${desc}`, 'warning');
      goPage('tesoreria-cuentas');
    }, 500);
    return;
  }

  if (code && cuentaId) {
    // Limpiar URL
    window.history.replaceState({}, '', window.location.pathname);

    // Si no hay sesión activa, guardar para después del login
    if (typeof EMPRESA === 'undefined' || !EMPRESA?.id) {
      sessionStorage.setItem('ob_pending_code', code);
      sessionStorage.setItem('ob_pending_cuenta', cuentaId);
      return;
    }

    _obProcessCallback(code, cuentaId);
  }
}

/** Procesar callback de Open Banking (code → sesión → sync) */
async function _obProcessCallback(code, cuentaId) {
  toast('🔄 Procesando autorización bancaria...', 'info');
  try {
    const result = await _obCall({ action: 'callback', code: code, cuenta_id: cuentaId, empresa_id: EMPRESA.id });
    if (result.status === 'LN' && result.accounts?.length) {
      const extra = result.created_extra || 0;
      toast(`✅ ${result.total_accounts || result.accounts.length} cuenta${result.accounts.length>1?'s':''} conectada${result.accounts.length>1?'s':''}${extra ? ` (${extra} nueva${extra>1?'s':''} creada${extra>1?'s':''})` : ''}`, 'success');
      // Recargar cuentas para tener las nuevas
      await _tesCargarCuentas();
      // Sincronizar todas las cuentas conectadas
      for (const accUid of result.accounts) {
        const cuenta = tesCuentas.find(c => c.nordigen_account_id === accUid);
        if (cuenta) {
          try {
            await obSyncCuenta(cuenta.id, accUid);
          } catch (syncErr) {
            console.warn('Error sincronizando cuenta', accUid, syncErr);
          }
        }
      }
    } else if (result.status === 'NO_ACCOUNTS') {
      toast('⚠️ No se encontraron cuentas en la autorización.', 'error');
    }
    goPage('tesoreria-cuentas');
  } catch (err) {
    toast('Error procesando autorización: ' + err.message, 'error');
    goPage('tesoreria-cuentas');
  }
}

/** Llamar después del login para procesar OB pendiente */
function obCheckPending() {
  const code = sessionStorage.getItem('ob_pending_code');
  const cuentaId = sessionStorage.getItem('ob_pending_cuenta');
  if (code && cuentaId) {
    sessionStorage.removeItem('ob_pending_code');
    sessionStorage.removeItem('ob_pending_cuenta');
    setTimeout(() => _obProcessCallback(code, cuentaId), 1000);
  }
}

// Ejecutar al cargar
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => setTimeout(_obCheckReturn, 2000));
}
