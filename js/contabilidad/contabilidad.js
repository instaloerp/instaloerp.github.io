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

// Crear subcuenta individual al crear/editar un cliente o proveedor.
// Llamar: contCrearSubcuenta('cliente', 'NOMBRE', 'NIF')
//         contCrearSubcuenta('proveedor', 'NOMBRE', 'CIF')
async function contCrearSubcuenta(tipo, nombre, nif) {
  if (!nombre || !EMPRESA?.id) return;
  try {
    const prefijo = tipo === 'cliente' ? '430' : '400';
    const tipoContab = tipo === 'cliente' ? 'activo' : 'pasivo';
    const padreCode = prefijo;

    // Verificar que el padre existe
    const { data: padre } = await sb.from('cuentas_contables')
      .select('id').eq('empresa_id', EMPRESA.id).eq('codigo', padreCode).maybeSingle();
    if (!padre) return; // No hay plan contable cargado

    // Verificar si ya existe subcuenta para este nombre
    const { data: existe } = await sb.from('cuentas_contables')
      .select('id').eq('empresa_id', EMPRESA.id)
      .ilike('nombre', nombre.trim())
      .gte('codigo', prefijo + '0000').lte('codigo', prefijo + '9999')
      .maybeSingle();
    if (existe) return; // Ya tiene subcuenta

    // Obtener subcuentas existentes para evitar duplicados de código
    const { data: existentes } = await sb.from('cuentas_contables')
      .select('codigo').eq('empresa_id', EMPRESA.id)
      .gte('codigo', prefijo + '0000').lte('codigo', prefijo + '9999');
    const usados = new Set((existentes || []).map(c => c.codigo));

    // Generar código desde NIF
    const nifD = (nif || '').replace(/\D/g, '');
    let codigo;
    if (nifD.length >= 4) {
      codigo = prefijo + nifD.slice(-4);
    } else {
      let idx = 1;
      codigo = prefijo + String(idx).padStart(4, '0');
      while (usados.has(codigo)) { idx++; codigo = prefijo + String(idx).padStart(4, '0'); }
    }
    // Resolver colisión
    let autoIdx = 1;
    while (usados.has(codigo)) {
      autoIdx++;
      codigo = prefijo + String(autoIdx).padStart(4, '0');
    }

    await sb.from('cuentas_contables').insert({
      empresa_id: EMPRESA.id,
      codigo, nombre: nombre.trim(),
      tipo: tipoContab, grupo: 4,
      padre_codigo: padreCode, es_hoja: true, activa: true
    });

    // Actualizar padre a no-hoja
    await sb.from('cuentas_contables').update({ es_hoja: false })
      .eq('empresa_id', EMPRESA.id).eq('codigo', padreCode);

    console.log('[Contab] ✅ Subcuenta creada:', codigo, nombre.trim());
  } catch(e) {
    console.warn('[Contab] No se pudo crear subcuenta:', e.message);
  }
}

// Auto-crear subcuentas 430XXXX / 400XXXX para clientes y proveedores que no tengan
async function _contSyncSubcuentas() {
  if (!_contCuentas.length) return;
  // Solo si existen las cuentas padre 430 y/o 400
  const tiene430 = _contCuentas.some(c => c.codigo === '430');
  const tiene400 = _contCuentas.some(c => c.codigo === '400');
  if (!tiene430 && !tiene400) return;

  let cambios = 0;

  // ── Clientes → 430XXXX ──
  if (tiene430) {
    const allCli = (typeof clientes !== 'undefined' && clientes.length) ? clientes : [];
    const existentes = new Set(_contCuentas.filter(c => c.codigo.startsWith('430') && c.codigo.length === 7).map(c => (c.nombre || '').toUpperCase().trim()));
    const usados = new Set(_contCuentas.filter(c => c.codigo.startsWith('430') && c.codigo.length === 7).map(c => c.codigo));
    let autoIdx = 1;
    const toInsert = [];

    for (const cli of allCli) {
      if (existentes.has((cli.nombre || '').toUpperCase().trim())) continue;
      const nifD = (cli.nif || '').replace(/\D/g, '');
      let cod = nifD.length >= 4 ? '430' + nifD.slice(-4) : '430' + String(autoIdx).padStart(4, '0');
      while (usados.has(cod)) { autoIdx++; cod = '430' + String(autoIdx).padStart(4, '0'); }
      usados.add(cod);
      if (!nifD.length || nifD.length < 4) autoIdx++;
      toInsert.push({ empresa_id: EMPRESA.id, codigo: cod, nombre: cli.nombre || '', tipo: 'activo', grupo: 4, padre_codigo: '430', es_hoja: true, activa: true });
    }

    if (toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 50) {
        await sb.from('cuentas_contables').insert(toInsert.slice(i, i + 50));
      }
      await sb.from('cuentas_contables').update({ es_hoja: false }).eq('empresa_id', EMPRESA.id).eq('codigo', '430');
      cambios += toInsert.length;
    }
  }

  // ── Proveedores → 400XXXX ──
  if (tiene400) {
    const allProv = (typeof proveedores !== 'undefined' && proveedores.length) ? proveedores : [];
    const existPro = new Set(_contCuentas.filter(c => c.codigo.startsWith('400') && c.codigo.length === 7).map(c => (c.nombre || '').toUpperCase().trim()));
    const usadosPro = new Set(_contCuentas.filter(c => c.codigo.startsWith('400') && c.codigo.length === 7).map(c => c.codigo));
    let autoIdxP = 1;
    const toInsertP = [];

    for (const prov of allProv) {
      if (existPro.has((prov.nombre || '').toUpperCase().trim())) continue;
      const cifD = (prov.cif || prov.nif || '').replace(/\D/g, '');
      let cod = cifD.length >= 4 ? '400' + cifD.slice(-4) : '400' + String(autoIdxP).padStart(4, '0');
      while (usadosPro.has(cod)) { autoIdxP++; cod = '400' + String(autoIdxP).padStart(4, '0'); }
      usadosPro.add(cod);
      if (!cifD.length || cifD.length < 4) autoIdxP++;
      toInsertP.push({ empresa_id: EMPRESA.id, codigo: cod, nombre: prov.nombre || '', tipo: 'pasivo', grupo: 4, padre_codigo: '400', es_hoja: true, activa: true });
    }

    if (toInsertP.length) {
      for (let i = 0; i < toInsertP.length; i += 50) {
        await sb.from('cuentas_contables').insert(toInsertP.slice(i, i + 50));
      }
      await sb.from('cuentas_contables').update({ es_hoja: false }).eq('empresa_id', EMPRESA.id).eq('codigo', '400');
      cambios += toInsertP.length;
    }
  }

  // Recargar si hubo cambios
  if (cambios) {
    await _contCargarCuentas();
    console.log('[Contab] ✅ Sync subcuentas: ' + cambios + ' creadas');
  }
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
  await _contSyncSubcuentas(); // Auto-crear subcuentas 430/400 para clientes/proveedores nuevos

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
      <button class="btn btn-secondary" onclick="exportarContaSol()" title="Exportar a ContaSol">📥 Exportar ContaSol</button>
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

// Set de nodos expandidos (grupos, cuentas virtuales)
const _contExpandidas = new Set();

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

  const hayBusqueda = !!search;

  // Clasificar por nivel: grupo (≤2 dígitos), cuenta (3-4 dígitos), subcuenta (5+ dígitos)
  const grupos = filtered.filter(c => c.codigo.length <= 2);
  const cuentas = filtered.filter(c => c.codigo.length >= 3 && c.codigo.length <= 4);
  const subcuentas = filtered.filter(c => c.codigo.length >= 5);

  // Mapa de cuentas reales de 3-4 dígitos por su código
  const cuentasReales = new Set(cuentas.map(c => c.codigo));

  // Crear agrupaciones virtuales para subcuentas sin cuenta intermedia
  // Ej: si existe 4300001 pero no 430, crear nodo virtual "430"
  const virtuales = new Map(); // código 3d → { codigo, nombre, tipo, grupo, hijas[] }
  subcuentas.forEach(sc => {
    const prefijo3 = sc.codigo.substring(0, 3);
    // ¿Tiene cuenta real como padre?
    if (cuentasReales.has(prefijo3)) return;
    // ¿Tiene grupo padre?
    const grupoCode = sc.codigo.substring(0, 2);
    const grupoPadre = grupos.find(g => g.codigo === grupoCode);
    if (!grupoPadre && !hayBusqueda) return;

    if (!virtuales.has(prefijo3)) {
      virtuales.set(prefijo3, {
        codigo: prefijo3,
        nombre: _contNombreCuenta3d(prefijo3),
        tipo: sc.tipo || (grupoPadre?.tipo || ''),
        grupo: sc.grupo || (grupoPadre?.grupo || 0),
        virtual: true,
        hijas: []
      });
    }
    virtuales.get(prefijo3).hijas.push(sc);
  });

  // Función para renderizar una fila
  const renderRow = (c, nivel, numHijos, esVirtual) => {
    const expandida = _contExpandidas.has(c.codigo);
    const tieneHijos = numHijos > 0;
    const indent = nivel * 28;
    const opaco = (!esVirtual && !c.activa) ? 'opacity:.5;' : '';
    const bgNivel = nivel === 0 ? '' : (nivel === 1 ? 'background:var(--gris-50);' : 'background:var(--gris-100);');

    let flechaHtml = '';
    if (tieneHijos) {
      flechaHtml = '<span onclick="_contToggleExpand(\'' + c.codigo + '\')" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;margin-right:4px;font-size:10px;color:var(--gris-500);transition:transform .15s;transform:rotate(' + (expandida ? '90' : '0') + 'deg)">▶</span>';
    } else if (nivel > 0) {
      flechaHtml = '<span style="display:inline-block;width:24px"></span>';
    }

    const badgeHijos = (tieneHijos && numHijos > 0)
      ? '<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:var(--azul-light);color:var(--azul);font-weight:700;margin-left:6px">' + numHijos + '</span>' : '';

    const tipoLabel = (c.tipo || '').toUpperCase();
    const esClickable = tieneHijos ? ';font-weight:700;cursor:pointer' : '';
    const onClickNombre = tieneHijos ? ' onclick="_contToggleExpand(\'' + c.codigo + '\')"' : '';

    let acciones = '';
    if (!esVirtual) {
      acciones = '<button class="btn btn-ghost btn-sm" onclick="_contEditarCuenta(' + c.id + ')" title="Editar">✏️</button>' +
        (c.es_hoja ? '<button class="btn btn-ghost btn-sm" onclick="_contEliminarCuenta(' + c.id + ')" title="Eliminar">🗑️</button>' : '');
    }

    return '<tr style="' + opaco + bgNivel + '" data-codigo="' + c.codigo + '">' +
      '<td style="padding-left:' + (8 + indent) + 'px;font-family:monospace;font-weight:700;color:' + _contTipoColor(tipoLabel) + ';white-space:nowrap">' +
        flechaHtml + c.codigo + '</td>' +
      '<td style="' + esClickable + '"' + onClickNombre + '>' +
        c.nombre + badgeHijos + (esVirtual ? ' <span style="font-size:10px;color:var(--gris-400)">(cuenta)</span>' : '') + '</td>' +
      '<td><span style="font-size:11px;padding:2px 8px;border-radius:6px;background:' + _contTipoBg(tipoLabel) + ';color:' + _contTipoColor(tipoLabel) + ';font-weight:600">' + tipoLabel + '</span></td>' +
      '<td style="text-align:center">' + (c.grupo || '') + '</td>' +
      '<td style="text-align:center">' + (esVirtual ? '📂' : (c.es_hoja ? '✅' : '📂')) + '</td>' +
      '<td>' + acciones + '</td></tr>';
  };

  let html = '';

  // Nivel 0: Grupos (≤2 dígitos)
  grupos.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(g => {
    // Contar hijos directos: cuentas reales de 3-4d + virtuales de 3d
    const hijasReales = cuentas.filter(c => c.codigo.startsWith(g.codigo));
    const hijasVirtuales = [...virtuales.values()].filter(v => v.codigo.startsWith(g.codigo));
    // Subcuentas sin intermediario (directas al grupo, ej 4d→7d)
    const subcDirectas = subcuentas.filter(sc => {
      const p3 = sc.codigo.substring(0, 3);
      return sc.codigo.startsWith(g.codigo) && !cuentasReales.has(p3) && !virtuales.has(p3);
    });
    const totalHijos = hijasReales.length + hijasVirtuales.length + subcDirectas.length;

    html += renderRow(g, 0, totalHijos, false);

    if (!_contExpandidas.has(g.codigo) && !hayBusqueda) return;

    // Nivel 1: Cuentas reales (3-4 dígitos) bajo este grupo
    hijasReales.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(cuenta => {
      const subcDeEsta = subcuentas.filter(sc => sc.codigo.startsWith(cuenta.codigo) && sc.codigo.length > cuenta.codigo.length);
      html += renderRow(cuenta, 1, subcDeEsta.length, false);

      if (!_contExpandidas.has(cuenta.codigo) && !hayBusqueda) return;

      // Nivel 2: Subcuentas bajo esta cuenta real
      subcDeEsta.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(sc => {
        html += renderRow(sc, 2, 0, false);
      });
    });

    // Nivel 1: Cuentas virtuales (3 dígitos) bajo este grupo
    hijasVirtuales.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(virt => {
      html += renderRow(virt, 1, virt.hijas.length, true);

      if (!_contExpandidas.has(virt.codigo) && !hayBusqueda) return;

      // Nivel 2: Subcuentas bajo esta cuenta virtual
      virt.hijas.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(sc => {
        html += renderRow(sc, 2, 0, false);
      });
    });

    // Subcuentas directas sin cuenta intermedia ni virtual (caso raro)
    subcDirectas.sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(sc => {
      html += renderRow(sc, 1, 0, false);
    });
  });

  // Cuentas sueltas (sin grupo padre visible en filtered)
  const gruposCodigos = new Set(grupos.map(g => g.codigo));
  cuentas.filter(c => !gruposCodigos.has(c.codigo.substring(0, 2))).forEach(c => {
    html += renderRow(c, 0, 0, false);
  });
  subcuentas.filter(sc => {
    const p3 = sc.codigo.substring(0, 3);
    const p2 = sc.codigo.substring(0, 2);
    return !gruposCodigos.has(p2) && !cuentasReales.has(p3);
  }).forEach(sc => {
    html += renderRow(sc, 0, 0, false);
  });

  tbody.innerHTML = html;
}

// Nombre descriptivo para cuentas virtuales de 3 dígitos
function _contNombreCuenta3d(codigo) {
  const map = {
    '100':'Capital social','101':'Fondo social','102':'Capital','103':'Socios por desembolsos',
    '110':'Prima de emisión','111':'Otros instr. patrimonio','112':'Reserva legal',
    '113':'Reservas voluntarias','118':'Aportaciones de socios','119':'Diferencias',
    '120':'Remanente','121':'Resultados negativos','129':'Resultado del ejercicio',
    '130':'Subvenciones oficiales','131':'Donaciones','133':'Ajustes valoración',
    '170':'Deudas a L/P entidades crédito','171':'Deudas a L/P','173':'Proveedores inmov. L/P',
    '174':'Acreedores arrendamiento L/P','175':'Efectos a pagar L/P',
    '176':'Pasivos por derivados L/P','177':'Obligaciones y bonos',
    '190':'Acciones emitidas','192':'Suscriptores de acciones',
    '210':'Terrenos y bienes naturales','211':'Construcciones','212':'Instalaciones técnicas',
    '213':'Maquinaria','214':'Utillaje','215':'Otras instalaciones',
    '216':'Mobiliario','217':'Equipos procesos información','218':'Elementos transporte','219':'Otro inmov. material',
    '220':'Inversiones en terrenos','221':'Inversiones en construcciones',
    '230':'Adaptaciones terrenos','231':'Construcciones en curso','232':'Instalaciones en montaje',
    '240':'Participaciones L/P empresas grupo','241':'Participaciones L/P asociadas',
    '250':'Inversiones financieras L/P','251':'Valores renta fija L/P','252':'Créditos L/P',
    '260':'Fianzas constituidas L/P','261':'Depósitos constituidos L/P',
    '280':'Amort. acum. inmov. intangible','281':'Amort. acum. inmov. material',
    '290':'Deterioro valor inmov. intangible','291':'Deterioro valor inmov. material',
    '300':'Mercaderías','310':'Materias primas','320':'Elementos y conj. incorporables',
    '330':'Productos en curso','340':'Productos semiterminados','350':'Productos terminados',
    '360':'Subproductos y residuos','390':'Deterioro valor mercaderías',
    '400':'Proveedores','401':'Proveedores ef. comerciales pagar','403':'Proveedores empresas grupo',
    '406':'Envases a devolver proveedores','407':'Anticipos a proveedores','410':'Acreedores prest. servicios',
    '430':'Clientes','431':'Clientes ef. comerciales cobrar','432':'Clientes operaciones factoring',
    '433':'Clientes empresas grupo','435':'Clientes dudoso cobro','436':'Clientes de dudoso cobro',
    '437':'Envases a devolver clientes','438':'Anticipos de clientes',
    '440':'Deudores','460':'Anticipos remuneraciones',
    '470':'H.P. deudora por IVA','471':'Organismos Seg. Social deudores',
    '472':'H.P. IVA soportado','473':'H.P. retenciones y pagos a cuenta',
    '474':'Activos imp. diferido','475':'H.P. acreedora por IVA',
    '476':'Organismos Seg. Social acreedores','477':'H.P. IVA repercutido',
    '479':'Pasivos diferencias temporarias',
    '480':'Gastos anticipados','485':'Ingresos anticipados',
    '490':'Deterioro valor créditos comerciales',
    '520':'Deudas C/P entidades crédito','521':'Deudas C/P','523':'Proveedores inmov. C/P',
    '524':'Acreedores arrendamiento C/P','525':'Efectos a pagar C/P',
    '526':'Dividendo activo a pagar','527':'Intereses C/P deudas',
    '530':'Participaciones C/P empresas grupo','540':'Inversiones financieras C/P',
    '541':'Valores renta fija C/P','542':'Créditos C/P','543':'Créditos C/P enajenación inmov.',
    '544':'Créditos C/P personal','545':'Dividendo a cobrar',
    '550':'Titular de la explotación','551':'Cuenta corriente con socios',
    '555':'Partidas pendientes aplicación',
    '560':'Fianzas recibidas C/P','561':'Depósitos recibidos C/P',
    '570':'Caja','571':'Bancos','572':'Bancos e instituciones crédito c/c',
    '573':'Bancos e inst. crédito c/ahorro','574':'Bancos e inst. crédito c/crédito',
    '600':'Compras de mercaderías','601':'Compras de materias primas','602':'Compras otros aprovisionamientos',
    '606':'Descuentos s/compras p.p.','607':'Trabajos realizados por otras empresas',
    '608':'Devoluciones compras','609':'Rappels por compras',
    '620':'Gastos I+D ejercicio','621':'Arrendamientos y cánones','622':'Reparaciones y conservación',
    '623':'Servicios profesionales independientes','624':'Transportes','625':'Primas de seguros',
    '626':'Servicios bancarios','627':'Publicidad y propaganda','628':'Suministros','629':'Otros servicios',
    '630':'Impuesto beneficios','631':'Otros tributos','634':'Ajustes neg. imposición s/beneficios',
    '636':'Devolución impuestos','638':'Ajustes positivos imp. s/beneficios',
    '640':'Sueldos y salarios','641':'Indemnizaciones','642':'Seguridad Social cargo empresa',
    '649':'Otros gastos sociales',
    '650':'Pérdidas créditos comerciales incobrables','651':'Resultados operaciones en común',
    '659':'Otras pérdidas gestión corriente',
    '660':'Gastos financieros actualización provisiones','661':'Intereses obligaciones',
    '662':'Intereses deudas','663':'Pérdidas valoración instrumentos financieros',
    '665':'Intereses descuento efectos','666':'Pérdidas participaciones',
    '667':'Pérdidas créditos no comerciales','668':'Diferencias negativas cambio',
    '669':'Otros gastos financieros',
    '680':'Amortización inmov. intangible','681':'Amortización inmov. material',
    '690':'Pérdidas por deterioro inmov. intangible','691':'Pérdidas deterioro inmov. material',
    '694':'Pérdidas deterioro créditos L/P',
    '700':'Ventas mercaderías','701':'Ventas productos terminados','702':'Ventas productos semiterminados',
    '703':'Ventas subproductos','704':'Ventas envases','705':'Prestaciones de servicios',
    '706':'Descuentos s/ventas p.p.','708':'Devoluciones ventas','709':'Rappels sobre ventas',
    '740':'Subvenciones a la explotación','746':'Subvenciones donaciones transferidas',
    '750':'Ingresos por arrendamientos','751':'Resultados operaciones en común',
    '752':'Ingresos por comisiones','753':'Ingresos propiedad industrial',
    '754':'Ingresos por cesión recursos','755':'Ingresos por servicios diversos','759':'Ingresos por servicios diversos',
    '760':'Ingresos participaciones','761':'Ingresos valores renta fija',
    '762':'Ingresos créditos','763':'Beneficios valoración instrumentos financieros',
    '766':'Beneficios participaciones','768':'Diferencias positivas cambio','769':'Otros ingresos financieros',
    '770':'Beneficios procedentes inmov. intangible','771':'Beneficios procedentes inmov. material',
    '773':'Beneficios procedentes participaciones L/P','775':'Beneficios operaciones inmov.',
    '790':'Reversión deterioro inmov. intangible','791':'Reversión deterioro inmov. material',
    '794':'Reversión deterioro créditos L/P'
  };
  return map[codigo] || 'Cuenta ' + codigo;
}

function _contToggleExpand(codigo) {
  if (_contExpandidas.has(codigo)) {
    _contExpandidas.delete(codigo);
  } else {
    _contExpandidas.add(codigo);
  }
  _contFiltrarPlan();
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

  // Haber: 477 IVA repercutido (también en rectificativas con IVA negativo)
  if (iva !== 0) {
    lineas.push({ cuenta_codigo: '477', descripcion: 'IVA rep. ' + (f.numero || ''), debe: 0, haber: iva });
  }

  // Si hay retención IRPF
  if (retencion !== 0) {
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

  // Debe: 472 IVA soportado (también en rectificativas con IVA negativo)
  if (iva !== 0) {
    lineas.push({ cuenta_codigo: '472', descripcion: 'IVA sop. ' + (f.numero || ''), debe: iva, haber: 0 });
  }

  // Haber: 400XXXX Proveedor
  lineas.push({ cuenta_codigo: subcuenta, descripcion: desc.trim(), debe: 0, haber: total });

  // Si hay retención IRPF
  if (retencion !== 0) {
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

// ═══════════════════════════════════════════════
//  EXPORTAR A CONTASOL (APU + IVR + IVS + MAE + CLI + PRO)
// ═══════════════════════════════════════════════

async function exportarContaSol() {
  // Auto-cargar ejercicios si no están cargados (ej: entrar directo a Plan Contable)
  if (!_contEjercicios.length) await _contCargarEjercicios();
  if (!_contEjercicioSel && _contEjercicios.length) {
    _contEjercicioSel = _contEjercicios.find(e => e.estado === 'abierto') || _contEjercicios[0];
  }
  if (!_contEjercicioSel) { toast('No hay ejercicio fiscal creado. Crea uno primero en Libro Diario.', 'error'); return; }

  const overlay = document.createElement('div');
  overlay.id = '_contasolExportModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:99999';

  const ej = _contEjercicioSel;
  const desde = ej.fecha_inicio || (new Date().getFullYear() + '-01-01');
  const hasta = ej.fecha_fin || (new Date().getFullYear() + '-12-31');

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px;max-width:440px;width:94%;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:var(--font)">
      <h3 style="font-size:16px;font-weight:800;margin:0 0 6px">📊 Exportar a ContaSol</h3>
      <p style="font-size:12px;color:var(--gris-400);margin:0 0 16px">Genera ficheros Excel compatibles con la importación de ContaSol</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--gris-600)">Desde</label>
          <input type="date" id="_csDesde" value="${desde}" style="width:100%;padding:7px 10px;border:1px solid var(--gris-200);border-radius:8px;font-size:12px;font-family:var(--font)">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--gris-600)">Hasta</label>
          <input type="date" id="_csHasta" value="${hasta}" style="width:100%;padding:7px 10px;border:1px solid var(--gris-200);border-radius:8px;font-size:12px;font-family:var(--font)">
        </div>
      </div>
      <div style="font-size:12px;color:var(--gris-600);margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><input type="checkbox" id="_csAPU" checked> <strong>APU</strong> — Asientos contables</label>
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><input type="checkbox" id="_csIVR" checked> <strong>IVR</strong> — Libro IVA Repercutido (ventas)</label>
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><input type="checkbox" id="_csIVS" checked> <strong>IVS</strong> — Libro IVA Soportado (compras)</label>
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><input type="checkbox" id="_csMAE" checked> <strong>MAE</strong> — Plan Contable</label>
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><input type="checkbox" id="_csCLI" checked> <strong>CLI</strong> — Clientes</label>
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="_csPRO" checked> <strong>PRO</strong> — Proveedores</label>
      </div>
      <div style="font-size:11px;color:var(--gris-400);margin-bottom:14px;background:var(--gris-50);padding:8px 12px;border-radius:8px">
        💡 Longitud de cuentas: <strong>7 dígitos</strong> (ej: 4300001). Asegúrate de que ContaSol tenga configurada la misma longitud.
      </div>
      <div id="_csProgreso" style="display:none;margin-bottom:14px;padding:10px;background:var(--azul-light);border-radius:8px;font-size:12px;color:var(--azul);text-align:center"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('_contasolExportModal')?.remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_ejecutarExportContaSol()" style="font-weight:700">📥 Generar ficheros</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function _ejecutarExportContaSol() {
  const desde = document.getElementById('_csDesde')?.value;
  const hasta = document.getElementById('_csHasta')?.value;
  if (!desde || !hasta) { toast('Selecciona rango de fechas', 'error'); return; }

  const prog = document.getElementById('_csProgreso');
  prog.style.display = 'block';
  const setProgreso = t => { prog.textContent = t; };

  try {
    // Formato fecha DD/MM/AAAA que exige ContaSol
    const fmtFecha = d => {
      if (!d) return '';
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return dd + '/' + mm + '/' + yyyy;
    };

    // Helper: crear workbook de 1 hoja y descargarlo
    const _descargarXlsx = (nombre, aoaData) => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoaData);
      XLSX.utils.book_append_sheet(wb, ws, nombre);
      XLSX.writeFile(wb, `${nombre}.xlsx`);
    };

    const archivosGenerados = [];

    // ══════════════════════════════════════════════
    //  MAE: Plan Contable
    //  A=Cuenta(10A), B=Descripcion(40A), C=Desc.extendida(255A),
    //  D=Mensaje(255A), E=Departamento(4N), F=Subdepartamento(4N)
    // ══════════════════════════════════════════════
    if (document.getElementById('_csMAE')?.checked) {
      setProgreso('Exportando Plan Contable...');
      await _contCargarCuentas();
      const maeData = _contCuentas.map(c => [
        _padCuenta(c.codigo),                  // A: Cuenta
        (c.nombre || '').substring(0, 40),     // B: Descripcion
        '',                                     // C: Descripcion extendida
        '',                                     // D: Mensaje emergente
        '',                                     // E: Departamento
        ''                                      // F: Subdepartamento
      ]);
      if (maeData.length) { _descargarXlsx('MAE', maeData); archivosGenerados.push('MAE'); }
    }

    // ══════════════════════════════════════════════
    //  CLI: Clientes — formato oficial ContaSol
    //  A=Codigo(10A), B=Nombre(100A), C=CIF(12A), D=Sigla(2A),
    //  E=Domicilio(100A), F=Num.calle(6A), G=CP(5N), H=Poblacion(30A),
    //  I=Provincia(20A), J=Telefono(12A), K=Fax(12A), L=Movil(12A)
    //  Genera desde tabla clientes directamente (no depende de subcuentas)
    // ══════════════════════════════════════════════
    if (document.getElementById('_csCLI')?.checked) {
      setProgreso('Exportando Clientes...');
      let allClientes = (typeof clientes !== 'undefined' && clientes.length) ? clientes : [];
      if (!allClientes.length) {
        try {
          const { data } = await sb.from('clientes').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
          allClientes = data || [];
        } catch(_) {}
      }
      // Mapa de subcuentas existentes por nombre (para reutilizar códigos ya asignados)
      const subcuentasCli = _contCuentas.filter(c => c.codigo.startsWith('430') && c.codigo.length >= 5);
      const mapaSubcuentas = new Map();
      subcuentasCli.forEach(sc => mapaSubcuentas.set((sc.nombre || '').toUpperCase().trim(), sc.codigo));

      const cliData = [];
      const usados = new Set(subcuentasCli.map(sc => sc.codigo));
      let autoIdx = 1;

      for (const cli of allClientes) {
        // Buscar si ya tiene subcuenta asignada en el plan contable
        let codigo = mapaSubcuentas.get((cli.nombre || '').toUpperCase().trim());
        if (!codigo) {
          // Generar código a partir de los últimos 4 dígitos del NIF
          const nifDigits = (cli.nif || '').replace(/\D/g, '');
          if (nifDigits.length >= 4) {
            codigo = '430' + nifDigits.slice(-4);
          } else {
            codigo = '430' + String(autoIdx).padStart(4, '0');
          }
          // Evitar duplicados
          while (usados.has(codigo)) {
            autoIdx++;
            codigo = '430' + String(autoIdx).padStart(4, '0');
          }
          usados.add(codigo);
          if (!nifDigits.length || nifDigits.length < 4) autoIdx++;
        }

        cliData.push([
          _padCuenta(codigo),                                  // A: Codigo contable
          (cli.nombre || '').substring(0, 100),                // B: Nombre
          (cli.nif || '').substring(0, 12),                    // C: CIF
          '',                                                   // D: Sigla domicilio
          (cli.direccion || '').substring(0, 100),             // E: Domicilio
          '',                                                   // F: Numero calle
          cli.cp || '',                                         // G: Codigo postal
          (cli.poblacion || cli.municipio || '').substring(0, 30), // H: Poblacion
          (cli.provincia || '').substring(0, 20),              // I: Provincia
          (cli.telefono || '').substring(0, 12),               // J: Telefono
          '',                                                   // K: Fax
          ''                                                    // L: Movil
        ]);
      }
      if (cliData.length) { _descargarXlsx('CLI', cliData); archivosGenerados.push('CLI'); }
    }

    // ══════════════════════════════════════════════
    //  PRO: Proveedores — formato oficial ContaSol
    //  A=Codigo(10A), B=Nombre(100A), C=CIF(12A), D=Sigla(2A),
    //  E=Domicilio(100A), F=Num.calle(6A), G=CP(5N), H=Poblacion(30A),
    //  I=Provincia(20A), J=Telefono(15A), K=Fax(15A), L=Movil(15A)
    //  Genera desde tabla proveedores directamente
    // ══════════════════════════════════════════════
    if (document.getElementById('_csPRO')?.checked) {
      setProgreso('Exportando Proveedores...');
      let allProvs = (typeof proveedores !== 'undefined' && proveedores.length) ? proveedores : [];
      if (!allProvs.length) {
        try {
          const { data } = await sb.from('proveedores').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
          allProvs = data || [];
        } catch(_) {}
      }
      const subcuentasPro = _contCuentas.filter(c => c.codigo.startsWith('400') && c.codigo.length >= 5);
      const mapaSubPro = new Map();
      subcuentasPro.forEach(sc => mapaSubPro.set((sc.nombre || '').toUpperCase().trim(), sc.codigo));

      const proData = [];
      const usadosPro = new Set(subcuentasPro.map(sc => sc.codigo));
      let autoIdxPro = 1;

      for (const prov of allProvs) {
        let codigo = mapaSubPro.get((prov.nombre || '').toUpperCase().trim());
        if (!codigo) {
          const cifDigits = (prov.cif || prov.nif || '').replace(/\D/g, '');
          if (cifDigits.length >= 4) {
            codigo = '400' + cifDigits.slice(-4);
          } else {
            codigo = '400' + String(autoIdxPro).padStart(4, '0');
          }
          while (usadosPro.has(codigo)) {
            autoIdxPro++;
            codigo = '400' + String(autoIdxPro).padStart(4, '0');
          }
          usadosPro.add(codigo);
          if (!cifDigits.length || cifDigits.length < 4) autoIdxPro++;
        }

        proData.push([
          _padCuenta(codigo),                                  // A: Codigo contable
          (prov.nombre || '').substring(0, 100),               // B: Nombre
          (prov.cif || prov.nif || '').substring(0, 12),       // C: CIF
          '',                                                   // D: Sigla domicilio
          (prov.direccion || '').substring(0, 100),            // E: Domicilio
          '',                                                   // F: Numero calle
          prov.cp || '',                                        // G: Codigo postal
          (prov.poblacion || '').substring(0, 30),             // H: Poblacion
          (prov.provincia || '').substring(0, 20),             // I: Provincia
          (prov.telefono || '').substring(0, 15),              // J: Telefono
          '',                                                   // K: Fax
          ''                                                    // L: Movil
        ]);
      }
      if (proData.length) { _descargarXlsx('PRO', proData); archivosGenerados.push('PRO'); }
    }

    // ══════════════════════════════════════════════
    //  Cargar asientos del período (para APU, IVR, IVS)
    // ══════════════════════════════════════════════
    const necesitaAsientos = document.getElementById('_csAPU')?.checked
      || document.getElementById('_csIVR')?.checked
      || document.getElementById('_csIVS')?.checked;

    let asientos = [];
    let todasLineas = [];

    if (necesitaAsientos) {
      setProgreso('Cargando asientos del período...');
      let qAs = sb.from('asientos').select('*').eq('empresa_id', EMPRESA.id)
        .eq('estado', 'contabilizado')
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha').order('numero');
      if (_contEjercicioSel) qAs = qAs.eq('ejercicio_id', _contEjercicioSel.id);
      const { data: asData } = await qAs;
      asientos = asData || [];
      if (!asientos.length) {
        toast('No hay asientos contabilizados en el período seleccionado', 'warning');
      }

      const asientoIds = asientos.map(a => a.id);
      for (let i = 0; i < asientoIds.length; i += 50) {
        const batch = asientoIds.slice(i, i + 50);
        const { data } = await sb.from('lineas_asiento')
          .select('*').in('asiento_id', batch).order('orden');
        if (data) todasLineas = todasLineas.concat(data);
      }
    }

    // ══════════════════════════════════════════════
    //  Procesar asientos → APU, IVR, IVS
    // ══════════════════════════════════════════════
    if (necesitaAsientos && asientos.length) {
      const apuData = [];
      let codigoIva = 0;
      const ivrRows = [];
      const ivsRows = [];

      for (const as of asientos) {
        const lineas = todasLineas.filter(l => l.asiento_id === as.id).sort((a, b) => (a.orden || 0) - (b.orden || 0));

        const esVenta = as.origen === 'factura_emitida';
        const esCompra = as.origen === 'factura_recibida';

        let facOriginal = null;
        if (esVenta && as.origen_id) {
          facOriginal = (typeof facturasData !== 'undefined' ? window.facturasData : []).find(f => f.id === as.origen_id);
        }
        if (esCompra && as.origen_id) {
          try {
            const { data: fp } = await sb.from('facturas_proveedor').select('*').eq('id', as.origen_id).maybeSingle();
            facOriginal = fp;
          } catch(_) {}
        }

        let codigoIvaAsiento = 0;
        if ((esVenta || esCompra) && facOriginal) {
          codigoIva++;
          codigoIvaAsiento = codigoIva;

          const base = parseFloat(facOriginal.base_imponible) || 0;
          const ivaTotal = parseFloat(facOriginal.total_iva) || 0;
          const pctIva = base > 0 ? Math.round(ivaTotal / base * 100 * 100) / 100 : 21;
          const total = parseFloat(facOriginal.total) || (base + ivaTotal);
          const nif = esVenta
            ? (facOriginal.cliente_nif || '').substring(0, 12)
            : (facOriginal.proveedor_nif || facOriginal._proveedor_cif || '').substring(0, 12);
          const nombre = esVenta
            ? (facOriginal.cliente_nombre || '').substring(0, 40)
            : (facOriginal.proveedor_nombre || '').substring(0, 100);
          const cuentaTercero = _padCuenta(
            (lineas.find(l => esVenta ? l.cuenta_codigo?.startsWith('430') : l.cuenta_codigo?.startsWith('400'))
              ?.cuenta_codigo) || (esVenta ? '4300000' : '4000000')
          );

          // ── IVR: IVA Repercutido (ventas) ──
          // A=Codigo(5N), B=Libro(1N), C=Fecha, D=Cuenta(10A), E=Factura(12A),
          // F=Nombre(40A), G=CIF(12A), H=Tipo op(1N: 0=General),
          // I=Base1(15ND), J=Base2, K=Base3,
          // L=%IVA1(5ND), M=%IVA2, N=%IVA3,
          // O=%Rec1, P=%Rec2, Q=%Rec3,
          // R=Imp.IVA1(15ND), S=Imp.IVA2, T=Imp.IVA3,
          // U=Imp.Rec1, V=Imp.Rec2, W=Imp.Rec3,
          // X=Total(15ND)
          if (esVenta) {
            ivrRows.push([
              codigoIvaAsiento,                     // A: Codigo
              1,                                     // B: Libro IVA
              fmtFecha(as.fecha),                   // C: Fecha
              cuentaTercero,                         // D: Cuenta cliente
              (facOriginal.numero || '').substring(0, 12), // E: Factura
              nombre.substring(0, 40),               // F: Nombre
              nif,                                   // G: CIF
              0,                                     // H: Tipo op (0=General)
              base,                                  // I: Base 1
              0,                                     // J: Base 2
              0,                                     // K: Base 3
              pctIva,                                // L: % IVA 1
              0,                                     // M: % IVA 2
              0,                                     // N: % IVA 3
              0,                                     // O: % Recargo 1
              0,                                     // P: % Recargo 2
              0,                                     // Q: % Recargo 3
              ivaTotal,                              // R: Importe IVA 1
              0,                                     // S: Importe IVA 2
              0,                                     // T: Importe IVA 3
              0,                                     // U: Importe recargo 1
              0,                                     // V: Importe recargo 2
              0,                                     // W: Importe recargo 3
              total                                  // X: Total
            ]);
          } else {
            // ── IVS: IVA Soportado (compras) ──
            // A=Codigo(5N), B=Libro(1N), C=Fecha, D=Cuenta(10A), E=Factura(12A),
            // F=Nombre(100A), G=CIF(12A), H=Tipo op(1N: 0=Interior),
            // I=Deducible(1N: 0=Deducible, 1=No ded, 2=Prorrata),
            // J=Base1(15ND), K=Base2, L=Base3,
            // M=%IVA1(5ND), N=%IVA2, O=%IVA3,
            // P=%Rec1, Q=%Rec2, R=%Rec3,
            // S=Imp.IVA1(15ND), T=Imp.IVA2, U=Imp.IVA3,
            // V=Imp.Rec1, W=Imp.Rec2, X=Imp.Rec3,
            // Y=Total(15ND)
            ivsRows.push([
              codigoIvaAsiento,                     // A: Codigo
              1,                                     // B: Libro IVA
              fmtFecha(as.fecha),                   // C: Fecha
              cuentaTercero,                         // D: Cuenta proveedor
              (facOriginal.numero || '').substring(0, 12), // E: Factura
              nombre.substring(0, 100),              // F: Nombre
              nif,                                   // G: CIF
              0,                                     // H: Tipo op (0=Interior)
              0,                                     // I: Deducible (0=Deducible)
              base,                                  // J: Base 1
              0,                                     // K: Base 2
              0,                                     // L: Base 3
              pctIva,                                // M: % IVA 1
              0,                                     // N: % IVA 2
              0,                                     // O: % IVA 3
              0,                                     // P: % Recargo 1
              0,                                     // Q: % Recargo 2
              0,                                     // R: % Recargo 3
              ivaTotal,                              // S: Importe IVA 1
              0,                                     // T: Importe IVA 2
              0,                                     // U: Importe IVA 3
              0,                                     // V: Importe recargo 1
              0,                                     // W: Importe recargo 2
              0,                                     // X: Importe recargo 3
              total                                  // Y: Total
            ]);
          }
        }

        // ── APU: Asientos contables ──
        // A=Diario(3N), B=Fecha, C=Asiento(5N), D=Orden(6N),
        // E=Cuenta(10A), F=Pesetas(15ND), G=Concepto(60A), H=Documento(5A),
        // I=Debe€(15ND), J=Haber€(15ND), K=Moneda(1A), L=Punteo(1N),
        // M=TipoIVA(1A: R/S), N=CodIVA(5N), O=Depart(4N), P=Subdepart(4N), Q=Imagen(255A)
        lineas.forEach((l, idx) => {
          const debe = parseFloat(l.debe) || 0;
          const haber = parseFloat(l.haber) || 0;
          const esLineaTercero = esVenta ? l.cuenta_codigo?.startsWith('430') : l.cuenta_codigo?.startsWith('400');
          const tipoIvaLinea = esLineaTercero ? (esVenta ? 'R' : 'S') : '';
          const codIvaLinea = (esLineaTercero && codigoIvaAsiento) ? codigoIvaAsiento : '';

          apuData.push([
            1,                                                       // A: Diario (1=General)
            fmtFecha(as.fecha),                                     // B: Fecha DD/MM/AAAA
            as.numero || 0,                                          // C: Asiento
            idx + 1,                                                 // D: Orden
            _padCuenta(l.cuenta_codigo),                            // E: Cuenta (7+ dígitos)
            0,                                                       // F: Importe pesetas (obsoleto)
            (l.descripcion || as.descripcion || '').substring(0, 60), // G: Concepto (max 60)
            (as.origen_ref || '').substring(0, 5),                  // H: Documento (max 5)
            debe,                                                    // I: Debe €
            haber,                                                   // J: Haber €
            'E',                                                     // K: Moneda (E=euros)
            0,                                                       // L: Punteo
            tipoIvaLinea,                                            // M: Tipo IVA
            codIvaLinea,                                             // N: Código IVA
            '',                                                      // O: Departamento
            '',                                                      // P: Subdepartamento
            ''                                                       // Q: Archivo imagen
          ]);
        });
      }

      // Descargar APU
      if (document.getElementById('_csAPU')?.checked && apuData.length) {
        setProgreso('Generando fichero APU...');
        _descargarXlsx('APU', apuData);
        archivosGenerados.push('APU');
      }

      // Descargar IVR
      if (document.getElementById('_csIVR')?.checked && ivrRows.length) {
        setProgreso('Generando fichero IVR...');
        _descargarXlsx('IVR', ivrRows);
        archivosGenerados.push('IVR');
      }

      // Descargar IVS
      if (document.getElementById('_csIVS')?.checked && ivsRows.length) {
        setProgreso('Generando fichero IVS...');
        _descargarXlsx('IVS', ivsRows);
        archivosGenerados.push('IVS');
      }
    }

    // ── Resultado ──
    if (archivosGenerados.length === 0) {
      toast('No hay datos para exportar', 'warning');
      document.getElementById('_contasolExportModal')?.remove();
      return;
    }

    toast(`✅ Exportación ContaSol: ${archivosGenerados.join(', ')} (${archivosGenerados.length} archivo${archivosGenerados.length > 1 ? 's' : ''})`, 'success');
    document.getElementById('_contasolExportModal')?.remove();

  } catch(e) {
    console.error('[ContaSol Export]', e);
    toast('❌ Error al exportar: ' + (e.message || 'Error desconocido'), 'error');
    setProgreso('');
    prog.style.display = 'none';
  }
}

// Ajustar cuenta a 7 dígitos para ContaSol
function _padCuenta(codigo) {
  if (!codigo) return '0000000';
  const c = String(codigo).trim();
  // Si ya tiene 7+ dígitos, devolver tal cual
  if (c.length >= 7) return c.substring(0, 10);
  // Rellenar con ceros a la derecha hasta 7 (ej: '705' → '7050000')
  return c.padEnd(7, '0');
}
