// ═══════════════════════════════════════════════
// Works/Jobs management - Trabajos/Obras
// ═══════════════════════════════════════════════

// Docs attached to work
let trDocsFiles = [];
let obraActualId = null;

// ═══════════════════════════════════════════════
// Helpers para abrir documentos (modal in-place) desde ficha obra — build 132
// Si el array global no está cargado aún, se hidrata desde DB antes de abrir el modal.
// Tras cerrar el modal el usuario permanece en la ficha de obra.
// ═══════════════════════════════════════════════
async function _obraEnsureAndEdit(getArr, pushItem, tableName, id, editFn) {
  try {
    const arr = getArr();
    const existe = Array.isArray(arr) && arr.find(x => x.id === id);
    if (!existe) {
      const { data, error } = await sb.from(tableName).select('*').eq('id', id).single();
      if (error || !data) { if (typeof toast==='function') toast('No se pudo cargar el documento'); return; }
      pushItem(data);
    }
    editFn(id);
  } catch (e) {
    console.error('Error abriendo documento desde ficha obra:', e);
    if (typeof toast==='function') toast('Error al abrir el documento');
  }
}
// build 138: desde ficha de obra también pasamos por la preview genérica
// (previewDoc ya hidrata solo el doc si no está en el array global)
function obraAbrirPresupCompra(id) { previewDoc('prc', id); }
function obraAbrirPedidoCompra(id)  { previewDoc('pc',  id); }
function obraAbrirRecepcion(id)     { previewDoc('rc',  id); }
function obraAbrirFacturaProv(id)   { previewDoc('fp',  id); }

// ═══ PESTAÑAS CHROME OBRAS ═══
let _obrasTabs = []; // [{id, numero, cliente}]

function _renderObraChromeTabs() {
  const bar = document.getElementById('obraChromeTabsBar');
  if (!bar) return;
  const addBtn = bar.querySelector('.obra-chrome-tab-add');
  // Limpiar pestañas existentes
  bar.querySelectorAll('.obra-chrome-tab').forEach(t => t.remove());
  // Renderizar — usar closures para capturar el ID con su tipo original (evita dataset que siempre devuelve string)
  _obrasTabs.forEach((tab, idx) => {
    const tabId = tab.id; // closure: mantiene el tipo original (int/string)
    const el = document.createElement('div');
    el.className = 'obra-chrome-tab' + (tabId == obraActualId ? ' active' : '');
    el.onclick = function() { _switchObraTab(tabId); };
    const closeBtn = document.createElement('span');
    closeBtn.className = 'oct-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = function(e) { e.stopPropagation(); _closeObraTab(tabId); };
    el.innerHTML = `<span class="oct-title">${tab.numero} · ${tab.cliente}</span>`;
    el.appendChild(closeBtn);
    bar.insertBefore(el, addBtn);
  });
}

function _addObraTab(id) {
  const t = trabajos.find(x => x.id == id);
  if (!t) return;
  const cli = t.cliente_id ? clientes.find(c => c.id === t.cliente_id) : null;
  const cliNombre = cli?.nombre || t.cliente_nombre || 'Sin cliente';
  // No duplicar (== para tolerar int vs string)
  if (!_obrasTabs.find(tab => tab.id == id)) {
    _obrasTabs.push({ id: t.id, numero: t.numero, cliente: cliNombre });
  }
  _renderObraChromeTabs();
}

function _switchObraTab(id) {
  if (id == obraActualId) return;
  abrirFichaObra(id);
}

function _closeObraTab(id) {
  _obrasTabs = _obrasTabs.filter(tab => tab.id != id);
  if (_obrasTabs.length === 0) {
    cerrarFichaObra();
    return;
  }
  // Si cerramos la activa, abrir la primera que quede
  if (id == obraActualId) {
    abrirFichaObra(_obrasTabs[0].id);
  } else {
    _renderObraChromeTabs();
  }
}

function openObraSearch() {
  const overlay = document.getElementById('obraSearchOverlay');
  overlay.classList.add('open');
  const input = document.getElementById('obraSearchInput');
  input.value = '';
  input.focus();
  _filterObrasSearch('');
}

function closeObraSearch() {
  document.getElementById('obraSearchOverlay')?.classList.remove('open');
}

let _obrasSearchCache = []; // Cache para resultados con datos enriquecidos

function _filterObrasSearch(q) {
  q = (q || '').toLowerCase().trim();
  const results = document.getElementById('obraSearchResults');

  // Enriquecer obras con datos de cliente para búsqueda completa
  _obrasSearchCache = trabajos.map(t => {
    const cli = t.cliente_id ? clientes.find(c => c.id === t.cliente_id) : null;
    const cliNombre = cli?.nombre || t.cliente_nombre || '';
    // Todos los campos buscables
    const searchText = [
      t.numero, t.titulo, t.descripcion, t.estado,
      t.direccion, t.direccion_obra, t.direccion_obra_texto,
      t.municipio, t.provincia, t.cp,
      t.categoria, t.prioridad,
      t.referencia_externa, t.codigo_externo,
      cliNombre, cli?.telefono, cli?.email, cli?.cif,
      cli?.direccion, cli?.municipio, cli?.provincia
    ].filter(Boolean).join(' ').toLowerCase();
    return { ...t, _cliNombre: cliNombre, _searchText: searchText };
  });

  let list = _obrasSearchCache;
  if (q) {
    const words = q.split(/\s+/);
    list = list.filter(t => words.every(w => t._searchText.includes(w)));
  }

  if (!list.length) {
    results.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:12px">Sin resultados</div>';
    return;
  }
  results.innerHTML = list.slice(0, 10).map((t, i) => {
    return `<div class="osb-item" onclick="_selectObraFromSearch(${i})">
      <span class="osb-num">${t.numero || '—'}</span>
      <span class="osb-title">${t.titulo || '—'}</span>
      <span class="osb-client">${t._cliNombre || '—'}</span>
    </div>`;
  }).join('');

  // Guardar lista filtrada para referencia por índice
  _obrasSearchCache._filtered = list.slice(0, 10);
}

function _selectObraFromSearch(idx) {
  const list = _obrasSearchCache._filtered;
  if (!list || !list[idx]) return;
  const obraId = list[idx].id;
  closeObraSearch();
  abrirFichaObra(obraId);
}

// ESC para cerrar buscador
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('obraSearchOverlay')?.classList.contains('open')) {
    closeObraSearch();
  }
});
let obraActualPresupuestos = [];
let obraTabActual = 'presupuestos'; // recordar pestaña activa

// ═══════════════════════════════════════════════
// HELPER: sanitizar nombre de archivo para Supabase Storage
// ═══════════════════════════════════════════════
function _sanitizeFileName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}

// ═══════════════════════════════════════════════
// BUSCADOR DE CLIENTES (modal Nueva Obra)
// ═══════════════════════════════════════════════
function initTrCliBuscador() {
  const inp = document.getElementById('tr_cli_search');
  const drop = document.getElementById('tr_cli_dropdown');
  const hidden = document.getElementById('tr_cli');
  const selDiv = document.getElementById('tr_cli_selected');
  if (!inp || !drop) return;

  inp.addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    hidden.value = '';
    if (selDiv) { selDiv.style.display = 'none'; selDiv.textContent = ''; }
    if (q.length < 1) { drop.style.display = 'none'; return; }
    const matches = clientes.filter(c => (c.nombre||'').toLowerCase().includes(q) || (c.telefono||'').includes(q) || (c.email||'').toLowerCase().includes(q)).slice(0, 8);
    let html = matches.map(c => {
      const dir = c.direccion_fiscal || c.direccion || c.municipio_fiscal || c.municipio || '';
      return `<div onmousedown="trSeleccionarCliente(${c.id})" class="hov-bg-white" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--gris-100)">
        <div style="font-weight:600;font-size:12.5px">${c.nombre}</div>
        ${dir ? `<div style="font-size:10.5px;color:var(--gris-400)">${dir}</div>` : ''}
      </div>`;
    }).join('');
    if (matches.length === 0) {
      html = `<div style="padding:10px 12px;text-align:center">
        <div style="font-size:12px;color:var(--gris-400);margin-bottom:6px">No se encontró "${this.value}"</div>
        <button onmousedown="trCrearClienteRapido()" class="btn btn-sm" style="background:var(--azul);color:#fff;border:none;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer">+ Crear cliente nuevo</button>
      </div>`;
    }
    drop.innerHTML = html;
    drop.style.display = 'block';
  });

  inp.addEventListener('blur', function() {
    setTimeout(() => { drop.style.display = 'none'; }, 200);
  });

  inp.addEventListener('focus', function() {
    if (this.value.trim().length >= 1) this.dispatchEvent(new Event('input'));
  });
}

function trSeleccionarCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  const inp = document.getElementById('tr_cli_search');
  const hidden = document.getElementById('tr_cli');
  const drop = document.getElementById('tr_cli_dropdown');
  const selDiv = document.getElementById('tr_cli_selected');
  if (inp) inp.value = c.nombre;
  if (hidden) hidden.value = c.id;
  if (drop) drop.style.display = 'none';
  if (selDiv) {
    const dir = c.direccion_fiscal || c.direccion || '';
    const muni = c.municipio_fiscal || c.municipio || '';
    const tel = c.telefono || '';
    const info = [dir, muni, tel].filter(Boolean).join(' · ');
    selDiv.innerHTML = `${c.nombre} ${info ? `<span style="color:var(--gris-400);font-weight:400">— ${info}</span>` : ''} <span onclick="trLimpiarCliente()" style="cursor:pointer;color:var(--rojo);margin-left:4px" title="Quitar cliente">✕</span>`;
    selDiv.style.display = 'block';
  }
}

function trLimpiarCliente() {
  const inp = document.getElementById('tr_cli_search');
  const hidden = document.getElementById('tr_cli');
  const selDiv = document.getElementById('tr_cli_selected');
  if (inp) { inp.value = ''; inp.focus(); }
  if (hidden) hidden.value = '';
  if (selDiv) { selDiv.style.display = 'none'; selDiv.textContent = ''; }
}

function trCrearClienteRapido() {
  // Cerrar dropdown
  const drop = document.getElementById('tr_cli_dropdown');
  if (drop) drop.style.display = 'none';
  const searchText = document.getElementById('tr_cli_search')?.value || '';
  // Subir z-index del modal cliente para que aparezca encima
  const mTrabajo = document.getElementById('mTrabajo');
  const mCliente = document.getElementById('mCliente');
  if (mTrabajo) mTrabajo.style.zIndex = '199';
  if (mCliente) mCliente.style.zIndex = '210';
  openModal('mCliente');
  // Pre-rellenar nombre
  setTimeout(() => {
    const nameInput = document.getElementById('c_nombre');
    if (nameInput && searchText) nameInput.value = searchText;
  }, 200);
  // Esperar a que se cierre el modal de cliente para restaurar z-index y auto-seleccionar
  const _prevClientesCount = clientes.length;
  const _check = setInterval(() => {
    const isOpen = mCliente && mCliente.classList.contains('open');
    if (!isOpen) {
      clearInterval(_check);
      if (mTrabajo) mTrabajo.style.zIndex = '';
      if (mCliente) mCliente.style.zIndex = '';
      // Si se añadió un cliente nuevo, seleccionarlo automáticamente
      if (clientes.length > _prevClientesCount) {
        const nuevo = clientes[clientes.length - 1];
        trSeleccionarCliente(nuevo.id);
      }
    }
  }, 300);
}

// ═══════════════════════════════════════════════
// ABRIR MODAL NUEVA OBRA (con defaults)
// ═══════════════════════════════════════════════
function abrirNuevaObra() {
  // Reset campos
  document.getElementById('tr_titulo').value = '';
  document.getElementById('tr_cli_search').value = '';
  document.getElementById('tr_cli').value = '';
  const selDiv = document.getElementById('tr_cli_selected');
  if (selDiv) { selDiv.style.display = 'none'; selDiv.textContent = ''; }
  document.getElementById('tr_cat').value = '';
  document.getElementById('tr_prio').value = '';
  // Fecha = hoy
  document.getElementById('tr_fecha').value = new Date().toISOString().split('T')[0];
  // Hora = ahora
  const now = new Date();
  document.getElementById('tr_hora').value = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  document.getElementById('tr_desc').value = '';
  // Reset docs
  trDocsFiles = [];
  const docList = document.getElementById('tr_doc_list');
  if (docList) docList.innerHTML = '';
  // Título modal
  document.getElementById('mTrabTit').textContent = 'Nueva Obra';
  // Init buscador
  initTrCliBuscador();
  openModal('mTrabajo');
}

// ═══════════════════════════════════════════════
// FILTROS Y LISTADO
// ═══════════════════════════════════════════════
function initFiltroTrabajos() {
  const y = new Date().getFullYear();
  const dEl = document.getElementById('trDesde');
  const hEl = document.getElementById('trHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
}

function filtrarTrabajos() {
  const q = (document.getElementById('trSearch')?.value||'').toLowerCase();
  const est = document.getElementById('trEstado')?.value||'';
  const des = document.getElementById('trDesde')?.value||'';
  const has = document.getElementById('trHasta')?.value||'';
  const filtered = trabajos.filter(t => {
    if (est && t.estado !== est) return false;
    if (q && !(t.numero||'').toLowerCase().includes(q) && !(t.titulo||'').toLowerCase().includes(q) && !(t.cliente_nombre||'').toLowerCase().includes(q)) return false;
    if (des && t.fecha && t.fecha < des) return false;
    if (has && t.fecha && t.fecha > has) return false;
    return true;
  });
  // Orden predeterminado: número de documento, más reciente primero (numérico)
  const _numSort = (n) => { const m = (n||'').match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  filtered.sort((a,b) => _numSort(b.numero) - _numSort(a.numero));
  renderTrabajos(filtered);
}

function renderTrabajos(list) {
  if (!list) list = trabajos;
  document.getElementById('trabTable').innerHTML = list.length ?
    list.map(t=>{
      const _fDate = t.fecha || (t.created_at ? t.created_at.substring(0,10) : null);
      const _fShow = _fDate ? new Date(_fDate).toLocaleDateString('es-ES') : '—';
      return `<tr style="cursor:pointer" onclick="abrirFichaObra('${t.id}')">
      <td style="font-family:monospace;font-size:11.5px;font-weight:700;color:var(--azul)">${t.numero}</td>
      <td style="font-weight:700">${t.titulo}</td>
      <td>${t.cliente_nombre||'—'}</td>
      <td style="font-size:11.5px">${_fShow}</td>
      <td>${estadoBadge(t.estado)}</td>
    </tr>`;
    }).join('') :
    '<tr><td colspan="5"><div class="empty"><div class="ei">🏗️</div><h3>Sin obras</h3></div></td></tr>';
}

// ═══════════════════════════════════════════════
// VISTA FICHA / LISTA
// ═══════════════════════════════════════════════
function setObraVista(vista) {
  const vl = document.getElementById('trVista-lista');
  const vf = document.getElementById('trVista-ficha');
  if (vl) vl.style.display = vista === 'lista' ? 'block' : 'none';
  if (vf) vf.style.display = vista === 'ficha' ? 'block' : 'none';
  // Ocultar topbar en ficha de obra (la cabecera ya tiene toda la info)
  const tb = document.getElementById('topbar');
  if (tb) tb.style.display = vista === 'ficha' ? 'none' : '';
}

function cerrarFichaObra() {
  obraActualId = null;
  _obrasTabs = [];
  _renderObraChromeTabs();
  setObraVista('lista');
  document.getElementById('pgTitle').textContent = '🏗️ Obras';
  document.getElementById('pgSub').textContent = _fechaHoraActual();
}

// ═══════════════════════════════════════════════
// ABRIR FICHA DE OBRA
// ═══════════════════════════════════════════════
async function abrirFichaObra(id, _esAccesoDirecto) {
  obraActualId = id;
  const t = trabajos.find(x=>x.id==id);
  if (!t) { toast('Obra no encontrada','error'); return; }

  // Registrar acceso solo cuando es apertura directa (no refresh interno)
  if (_esAccesoDirecto !== false) {
    registrarActividadObra(id, 'Obra consultada', `👁️ ${t.numero} — ${t.titulo}`);
  }

  // Asegurar que estamos en la página de obras y vista ficha
  if (!document.getElementById('page-trabajos')?.classList.contains('active')) {
    goPage('trabajos');
  }
  setObraVista('ficha');

  // Registrar pestaña chrome
  _addObraTab(id);

  // Cabecera — cliente en grande, obra en subtítulo
  const _cli = t.cliente_id ? clientes.find(c=>c.id===t.cliente_id) : null;
  const _cliNombre = _cli?.nombre || t.cliente_nombre || 'Sin cliente';
  document.getElementById('fichaObraClienteNombre').textContent = _cliNombre;
  document.getElementById('fichaObraTitulo').textContent = t.titulo || '';
  document.getElementById('pgTitle').textContent = t.numero;
  document.getElementById('pgSub').textContent = _fechaHoraActual();
  document.getElementById('fichaObraSub').textContent = t.numero;
  // Avatar con iniciales del cliente
  const _avEl = document.getElementById('fichaObraAvatar');
  if (_avEl) { _avEl.style.background = avC(_cliNombre); _avEl.textContent = ini(_cliNombre); }
  document.getElementById('fichaObraEstado').innerHTML = estadoBadge(t.estado);

  // Datos de la obra (panel izquierdo)
  document.getElementById('fichaObraDatos').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaObra('Número', t.numero)}
      ${datoFichaObra('Estado', `<span data-campo="estado">${t.estado ? t.estado.replace('_',' ') : '—'}</span>`)}
      ${datoFichaObra('Categoría', t.categoria||'—')}
      ${datoFichaObra('Prioridad', t.prioridad||'Normal')}
      ${datoFichaObra('Fecha', t.fecha||'—')}
      ${datoFichaObra('Hora', t.hora||'—')}
      ${datoFichaObra('Dirección', t.direccion_obra_texto||'—')}
      ${datoFichaObra('Operario', t.operario_nombre||'—')}
      ${t.descripcion?`<div style="margin-top:6px;padding:8px;background:var(--gris-50);border-radius:7px;font-size:11.5px;color:var(--gris-600);line-height:1.5">${t.descripcion}</div>`:''}
    </div>`;

  // Datos del cliente (panel izquierdo)
  const cli = t.cliente_id ? clientes.find(c=>c.id===t.cliente_id) : null;
  document.getElementById('fichaObraCliente').innerHTML = cli ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer" onclick="abrirFicha('${cli.id}')">
      <div class="av av-sm" style="background:${avC(cli.nombre)};width:30px;height:30px;font-size:11px">${ini(cli.nombre)}</div>
      <div>
        <div style="font-weight:700;font-size:12.5px;color:var(--azul)">${cli.nombre}</div>
        <div style="font-size:10.5px;color:var(--gris-400)">${cli.nif||''} · ${cli.telefono||cli.movil||''}</div>
      </div>
    </div>
    ${datoFichaObra('Email', cli.email ? `<a href="mailto:${cli.email}" style="color:var(--azul);text-decoration:none;font-size:11px">${cli.email}</a>` : '—')}
    ${datoFichaObra('Teléfono', cli.telefono ? `<a href="tel:${cli.telefono}" style="color:inherit;text-decoration:none">${cli.telefono}</a>` : '—')}
    ${datoFichaObra('Municipio', cli.municipio_fiscal||cli.municipio||'—')}
  ` : '<div style="color:var(--gris-400);font-size:12px;padding:8px 0">Sin cliente asignado</div>';

  // ── Cargar datos relacionados en paralelo (con protección si tabla no existe) ──
  const safeQuery = (q) => q.then(r=>r).catch(()=>({data:[]}));
  // Construir OR clauses incluyendo trabajo_id para traer todo lo vinculado a esta obra
  const presOrClauses = [`trabajo_id.eq.${id}`];
  if (t.presupuesto_id) presOrClauses.push(`id.eq.${t.presupuesto_id}`);
  if (t.cliente_id) presOrClauses.push(`cliente_id.eq.${t.cliente_id}`);
  const docOrClauses = [`trabajo_id.eq.${id}`];
  if (t.presupuesto_id) docOrClauses.push(`presupuesto_id.eq.${t.presupuesto_id}`);
  if (t.cliente_id) docOrClauses.push(`cliente_id.eq.${t.cliente_id}`);

  const [presups, albs, facts, partes, docs, notas, audit, tareas, equipo, presupCompra, pedidosCompra, recepcionesProv, facturasProv] = await Promise.all([
    safeQuery(sb.from('presupuestos').select('*').eq('empresa_id',EMPRESA.id).or(presOrClauses.join(',')).neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).or(docOrClauses.join(',')).neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).or(docOrClauses.join(',')).neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('partes_trabajo').select('*').eq('trabajo_id',id).order('fecha',{ascending:false}).limit(50)),
    safeQuery(sb.from('documentos_trabajo').select('*').eq('trabajo_id',id).order('created_at',{ascending:false})),
    safeQuery(sb.from('notas_trabajo').select('*').eq('trabajo_id',id).order('created_at',{ascending:false})),
    safeQuery(sb.from('audit_log').select('*').eq('entidad','trabajo').eq('entidad_id',String(id)).order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('tareas_obra').select('*').eq('trabajo_id',id).order('created_at',{ascending:true})),
    safeQuery(sb.from('operarios_obra').select('*').eq('trabajo_id',id).order('created_at',{ascending:true})),
    // ── Compras vinculadas a la obra (build 126) ──
    safeQuery(sb.from('presupuestos_compra').select('*').eq('empresa_id',EMPRESA.id).eq('trabajo_id',id).order('created_at',{ascending:false}).limit(50)),
    safeQuery(sb.from('pedidos_compra').select('*').eq('empresa_id',EMPRESA.id).eq('trabajo_id',id).order('created_at',{ascending:false}).limit(50)),
    safeQuery(sb.from('recepciones').select('*').eq('empresa_id',EMPRESA.id).eq('trabajo_id',id).order('created_at',{ascending:false}).limit(50)),
    safeQuery(sb.from('facturas_proveedor').select('*').eq('empresa_id',EMPRESA.id).eq('trabajo_id',id).order('created_at',{ascending:false}).limit(50)),
  ]);

  // Filtrar presupuestos/albaranes/facturas que realmente pertenecen a esta obra
  const presupData = (presups.data||[]).filter(p =>
    p.trabajo_id === id || (t.presupuesto_id && p.id === t.presupuesto_id)
  );
  obraActualPresupuestos = presupData;
  // Crear set con TODOS los presupuesto_id vinculados a esta obra para buscar alb/fact
  const _presIdsObra = new Set(presupData.map(p=>p.id));
  const albData = (albs.data||[]).filter(a =>
    a.trabajo_id === id || _presIdsObra.has(a.presupuesto_id)
  );
  let _allFacts = facts.data||[];
  // Primer paso: facturas directamente vinculadas a la obra
  const _factDirectas = _allFacts.filter(f =>
    f.trabajo_id === id || _presIdsObra.has(f.presupuesto_id) || albData.some(a => a.id === f.albaran_id)
  );
  const _factDirectasIds = new Set(_factDirectas.map(f=>f.id));
  // Buscar rectificativas de facturas de esta obra que no vinieron en la consulta principal
  const _rectFaltantes = _factDirectas.filter(f => !_allFacts.some(r => r.rectificativa_de === f.id));
  if (_factDirectasIds.size) {
    const { data: _rectData } = await sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id)
      .in('rectificativa_de', [..._factDirectasIds]).neq('estado','eliminado');
    if (_rectData?.length) _allFacts = [..._allFacts, ..._rectData.filter(r => !_factDirectasIds.has(r.id))];
  }
  // Segundo paso: incluir rectificativas de facturas ya incluidas
  const factData = _allFacts.filter(f =>
    _factDirectasIds.has(f.id) || (f.rectificativa_de && _factDirectasIds.has(f.rectificativa_de))
  );
  const partesData = partes.data||[];
  const docsData = docs.data||[];
  const notasData = notas.data||[];
  const auditData = audit.data||[];
  obraTareasData = tareas.data||[];
  // Compras vinculadas (build 126)
  const presupCompraData = presupCompra.data||[];
  const pedidosCompraData = pedidosCompra.data||[];
  const recepcionesProvData = recepcionesProv.data||[];
  const facturasProvData = facturasProv.data||[];

  // KPIs — cantidades
  const _partesComp = partesData.filter(p => ['completado','revisado','facturado'].includes(p.estado)).length;
  const _tareasComp = obraTareasData.filter(t => t.estado === 'completada').length;
  const _tareasTotal = obraTareasData.filter(t => t.estado !== 'rechazada').length;
  const _fotosPartes = partesData.reduce((n,p) => n + (Array.isArray(p.fotos) ? p.fotos.length : 0), 0);

  document.getElementById('ok-seguimiento').textContent = _tareasTotal ? `${_tareasComp}/${_tareasTotal}` : '0';
  document.getElementById('ok-partes').textContent = partesData.length ? `${_partesComp}/${partesData.length}` : '0';
  document.getElementById('ok-presup').textContent = presupData.length + presupCompraData.length;
  document.getElementById('ok-facturacion').textContent = (albData.length + factData.length + facturasProvData.length) || '0';
  document.getElementById('ok-documentos').textContent = (docsData.length + _fotosPartes) || '0';
  document.getElementById('ok-materiales').textContent = (pedidosCompraData.length + recepcionesProvData.length) || '—';
  document.getElementById('ok-mensajes').textContent = '—';
  document.getElementById('ok-historial').textContent = auditData.length;

  // ── WORKFLOW — Panel de estado del proyecto ──
  renderObraWorkflow(t, presupData, albData, factData, partesData);

  // ── Botón cerrar/reabrir obra ──
  renderBtnCerrarObra(t, presupData, albData, factData, partesData);

  // Totales para resumen económico
  const totalPresup = presupData.reduce((s,p)=>s+(p.total||0),0);
  const totalAlb = albData.reduce((s,a)=>s+(a.total||0),0);
  const totalFact = factData.reduce((s,f)=>s+(f.total||0),0);
  const pendienteCobro = factData.filter(f=>f.estado==='pendiente'||f.estado==='vencida').reduce((s,f)=>s+(f.total||0),0);
  const horasPartes = partesData.reduce((s,p)=>s+(parseFloat(p.horas)||0),0);
  const costePartes = partesData.reduce((s,p)=>s+(parseFloat(p.coste_total)||0),0);

  // Resumen económico (panel izquierdo)
  document.getElementById('fichaObraResumen').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaObra('Presupuestado', fmtE(totalPresup))}
      ${datoFichaObra('Albaranado', fmtE(totalAlb))}
      ${datoFichaObra('Facturado', fmtE(totalFact))}
      ${pendienteCobro>0 ? datoFichaObra('Pte. cobro', '<span style="color:var(--rojo);font-weight:800">'+fmtE(pendienteCobro)+'</span>') : ''}
      <div style="border-top:1.5px solid var(--gris-200);margin:6px 0"></div>
      ${datoFichaObra('Horas partes', horasPartes.toFixed(1)+' h')}
      ${datoFichaObra('Coste partes', fmtE(costePartes))}
      ${totalFact>0 && costePartes>0 ? datoFichaObra('Margen', fmtE(totalFact-costePartes)) : ''}
    </div>`;

  // ── EQUIPO ASIGNADO (panel izquierdo) ──
  const equipoData = equipo.data||[];
  renderEquipoObra(id, equipoData);

  // ── REGISTRO DE ACTIVIDAD (pestaña completa) ──
  const _isSuperadmin = CP?.rol === 'superadmin' || CP?.rol === 'admin';
  const _fmtAudit = (d) => new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const _accionIco = (a) => {
    if (!a) return '📝';
    const al = a.toLowerCase();
    if (al.includes('crear') || al.includes('creado') || al.includes('nueva')) return '🆕';
    if (al.includes('editar') || al.includes('modific') || al.includes('actualiz')) return '✏️';
    if (al.includes('estado') || al.includes('cambio')) return '🔄';
    if (al.includes('documento') || al.includes('archivo') || al.includes('subir')) return '📎';
    if (al.includes('nota') || al.includes('comentario')) return '💬';
    if (al.includes('compra')) return '🛒';
    if (al.includes('pedido')) return '🚚';
    if (al.includes('presupuesto')) return '📋';
    if (al.includes('albar')) return '📄';
    if (al.includes('factura')) return '🧾';
    if (al.includes('tarea')) return '✅';
    if (al.includes('eliminar') || al.includes('borrar')) return '🗑️';
    if (al.includes('aprobar') || al.includes('aceptar')) return '✅';
    return '📝';
  };

  // Construir timeline combinando audit_log + eventos implícitos
  const _timeline = [];
  // Evento de creación de la obra
  _timeline.push({
    fecha: t.created_at, usuario: t.operario_nombre || '—',
    accion: 'Obra creada', detalle: `${t.numero} — ${t.titulo}`, tipo: 'crear'
  });
  // Documentos subidos
  docsData.forEach(d => _timeline.push({
    fecha: d.created_at, usuario: '—',
    accion: 'Documento subido', detalle: `📎 ${d.nombre} (${d.tipo})`, tipo: 'documento'
  }));
  // Notas añadidas
  notasData.forEach(n => _timeline.push({
    fecha: n.created_at, usuario: n.creado_por_nombre || '—',
    accion: 'Nota añadida', detalle: `💬 ${(n.texto||'').substring(0,80)}`, tipo: 'nota'
  }));
  // Presupuestos vinculados
  presupData.forEach(p => _timeline.push({
    fecha: p.created_at, usuario: '—',
    accion: 'Presupuesto vinculado', detalle: `📋 ${p.numero} — ${p.titulo||''} (${p.estado})`, tipo: 'presupuesto'
  }));
  // Albaranes
  albData.forEach(a => _timeline.push({
    fecha: a.created_at, usuario: '—',
    accion: 'Albarán creado', detalle: `📄 ${a.numero} — ${fmtE(a.total)}`, tipo: 'albaran'
  }));
  // Facturas
  factData.forEach(f => _timeline.push({
    fecha: f.created_at, usuario: '—',
    accion: 'Factura emitida', detalle: `🧾 ${f.numero} — ${fmtE(f.total)}`, tipo: 'factura'
  }));
  // Compras: presupuestos, pedidos, albaranes y facturas de proveedor (build 126)
  presupCompraData.forEach(p => _timeline.push({
    fecha: p.created_at, usuario: '—',
    accion: 'Presupuesto compra', detalle: `🛒 ${p.numero||'—'} — ${p.proveedor_nombre||''} (${fmtE(p.total||0)})`, tipo: 'compra'
  }));
  pedidosCompraData.forEach(p => _timeline.push({
    fecha: p.created_at, usuario: '—',
    accion: 'Pedido a proveedor', detalle: `🚚 ${p.numero||'—'} — ${p.proveedor_nombre||''} (${fmtE(p.total||0)})`, tipo: 'compra'
  }));
  recepcionesProvData.forEach(r => _timeline.push({
    fecha: r.created_at, usuario: '—',
    accion: 'Albarán de proveedor', detalle: `📄 ${r.numero||r.numero_albaran||'—'} — ${r.proveedor_nombre||''} (${fmtE(r.total||0)})`, tipo: 'compra'
  }));
  facturasProvData.forEach(f => _timeline.push({
    fecha: f.created_at, usuario: '—',
    accion: 'Factura de proveedor', detalle: `🧾 ${f.numero||'—'} — ${f.proveedor_nombre||''} (${fmtE(f.total||0)})`, tipo: 'compra'
  }));
  // Audit log entries
  auditData.forEach(a => _timeline.push({
    fecha: a.created_at, usuario: a.usuario_nombre || '—',
    accion: a.accion || 'Acción', detalle: a.detalle || '', tipo: 'audit',
    id: a.id
  }));
  // Ordenar cronológicamente (más reciente primero)
  _timeline.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  // (KPI de historial se actualiza arriba junto con los demás KPIs)

  const registroHtml = _timeline.length ? _timeline.map(e => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gris-100);align-items:flex-start">
      <div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:${
        e.tipo==='crear'?'#DBEAFE': e.tipo==='documento'?'#F3E8FF':
        e.tipo==='nota'?'#FEF3C7': e.tipo==='presupuesto'?'#DBEAFE':
        e.tipo==='albaran'?'#D1FAE5': e.tipo==='factura'?'#FEE2E2': e.tipo==='compra'?'#FED7AA': '#F3F4F6'
      };display:flex;align-items:center;justify-content:center;font-size:14px">${_accionIco(e.accion)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;font-size:12px">${e.accion}</span>
          <span style="font-size:10px;color:var(--gris-400);white-space:nowrap">${_fmtAudit(e.fecha)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--gris-600);margin-top:2px;overflow-wrap:break-word">${e.detalle}</div>
        <div style="font-size:10px;color:var(--gris-400);margin-top:1px">por ${e.usuario}</div>
      </div>
      ${_isSuperadmin && e.id ? `<button onclick="eliminarAuditEntry(${e.id})" style="background:none;border:none;cursor:pointer;color:var(--gris-300);font-size:12px;padding:2px" title="Eliminar (solo superadmin)">🗑️</button>` : ''}
    </div>
  `).join('') : '<div style="color:var(--gris-400);font-size:12.5px;padding:30px 0;text-align:center">Sin actividad registrada</div>';

  // (Registro se renderiza dentro de Historial más abajo)

  // ── Helpers para barras resumen ──
  function resumenBar(items) {
    return `<div style="display:flex;gap:12px;padding:8px 10px;margin-bottom:10px;background:var(--gris-50);border-radius:8px;font-size:11.5px;flex-wrap:wrap">${items.join('')}</div>`;
  }
  function resumenItem(label, val, color) {
    return `<div><span style="color:var(--gris-400)">${label}:</span> <strong style="color:${color||'var(--gris-900)'}">${val}</strong></div>`;
  }

  // ── PRESUPUESTOS ── (con botones inteligentes de conversión)
  const _presupHeader = `<div style="display:flex;justify-content:flex-end;margin-bottom:10px">
    <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="nuevoPresupObraActual()">+ Nuevo presupuesto</button>
  </div>`;
  const presupHtml = _presupHeader + (presupData.length ?
    resumenBar([resumenItem('Total presupuestado', fmtE(totalPresup), 'var(--azul)'), resumenItem('Docs', presupData.length+'')]) +
    presupData.map(p=>{
      const noAnulado = p.estado !== 'eliminado' && p.estado !== 'anulado';
      const esBorrador = p.estado === 'borrador' || (p.numero||'').startsWith('BORR-');
      // Comprobar documentos existentes para este presupuesto
      const tieneAlb = albData.some(a=>a.presupuesto_id===p.id);
      const _factAct = factData.filter(f => !f.rectificativa_de && !(f.estado === 'anulada' && factData.some(r => r.rectificativa_de === f.id)));
      const tieneFac = _factAct.some(f=>f.presupuesto_id===p.id) || albData.filter(a=>a.presupuesto_id===p.id).some(a=>_factAct.some(f=>f.albaran_id===a.id));
      const _bOK = 'padding:3px 8px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;cursor:pointer;text-decoration:none';
      const _bBtn = 'font-size:11px;padding:3px 6px';
      let acciones = '';
      if (esBorrador) {
        acciones += `<button onclick="event.stopPropagation();abrirEditor('presupuesto',${p.id})" style="padding:3px 8px;border-radius:6px;background:var(--amarillo-light);color:var(--amarillo);font-size:10px;font-weight:700;border:1px solid var(--amarillo);cursor:pointer">✏️ Editar borrador</button>`;
      } else if (noAnulado) {
        // Pendiente: Enviar al cliente + Aprobar
        if (p.estado === 'pendiente') {
          acciones += `<button onclick="event.stopPropagation();enviarPresupuestoCliente(${p.id})" style="padding:3px 8px;border-radius:6px;background:#3b82f6;color:#fff;font-size:10px;font-weight:700;border:none;cursor:pointer" title="Enviar enlace de firma al cliente">📩 Enviar</button> `;
          acciones += `<button onclick="event.stopPropagation();abrirModalAprobar(${p.id})" style="padding:3px 8px;border-radius:6px;background:var(--verde);color:#fff;font-size:10px;font-weight:700;border:none;cursor:pointer">✅ Aprobar</button>`;
        } else if (p.estado === 'aceptado') {
          // Aceptado: botones de conversión
          if (tieneAlb) { const alb=albData.find(a=>a.presupuesto_id===p.id); acciones += `<a onclick="event.stopPropagation();verDetalleAlbaran(${alb.id})" style="${_bOK}">✅ Albarán</a> `; }
          else if (!tieneFac) acciones += `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();obraPresToAlbaran(${p.id})" title="Albaranar" style="${_bBtn}">📄 Albaranar</button> `;
          if (tieneFac) { acciones += `<span style="${_bOK}">✅ Factura</span>`; }
          else {
            const _albsPO = albData.filter(a=>a.presupuesto_id===p.id);
            const _fAnulO = factData.find(f => !f.rectificativa_de && f.estado === 'anulada' && (f.presupuesto_id===p.id || _albsPO.some(a=>f.albaran_id===a.id)) && factData.some(r => r.rectificativa_de === f.id));
            if (_fAnulO) {
              const _fRectO = factData.find(r => r.rectificativa_de === _fAnulO.id);
              acciones += `<span style="padding:3px 8px;border-radius:6px;background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700">🚫 ${_fAnulO.numero||'Anulada'}</span> `;
              if (_fRectO) acciones += `<span style="padding:3px 8px;border-radius:6px;background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700">📝 ${_fRectO.numero||'RECT'}</span> `;
            }
            acciones += `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();obraPresToFactura(${p.id})" title="Facturar" style="${_bBtn}">🧾 Facturar</button>`;
          }
        }
      }
      return `
      <div class="ficha-doc-row" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--gris-100);border-radius:6px;cursor:pointer" onclick="${esBorrador ? `abrirEditor('presupuesto',${p.id})` : `verDetallePresupuesto(${p.id})`}">
        <div style="flex:1">
          <div style="font-weight:700;font-size:12.5px">${esBorrador ? '<span style="color:var(--gris-400);font-style:italic">Borrador</span>' : p.numero}</div>
          <div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.titulo||'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(p.total)}</div>${estadoBadgeP(p.estado)}</div>
          <div style="display:flex;gap:3px;margin-left:8px;align-items:center" onclick="event.stopPropagation()">${acciones}</div>
        </div>
      </div>`;
    }).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📋</div><p>Sin presupuestos vinculados</p></div>');

  // ── PRESUPUESTOS DE COMPRA (proveedor) — build 126 ──
  const PRC_EST_VIS = {borrador:{ico:'📝',col:'#6B7280',bg:'#F3F4F6',label:'Borrador'},pendiente:{ico:'⏳',col:'#F59E0B',bg:'#FEF3C7',label:'Pendiente'},aceptado:{ico:'✅',col:'#10B981',bg:'#D1FAE5',label:'Aceptado'},rechazado:{ico:'❌',col:'#EF4444',bg:'#FEE2E2',label:'Rechazado'},caducado:{ico:'⌛',col:'#6B7280',bg:'#F3F4F6',label:'Caducado'}};
  const totalPresupCompra = presupCompraData.reduce((s,p)=>s+(parseFloat(p.total)||0),0);
  const presupCompraHtml = presupCompraData.length ? `
    <div style="margin-top:18px;padding-top:14px;border-top:2px solid var(--gris-100)">
      <h4 style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--gris-700)">🛒 Presupuestos de proveedor (${presupCompraData.length})</h4>
      ${resumenBar([resumenItem('Total compra prevista', fmtE(totalPresupCompra), 'var(--naranja)'), resumenItem('Docs', presupCompraData.length+'')])}
      ${presupCompraData.map(p=>{
        const est = PRC_EST_VIS[p.estado] || PRC_EST_VIS.borrador;
        return `<div class="ficha-doc-row" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--gris-100);border-radius:6px;cursor:pointer" onclick="obraAbrirPresupCompra(${p.id})">
          <div style="flex:1">
            <div style="font-weight:700;font-size:12.5px">${p.numero||'—'}</div>
            <div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.proveedor_nombre||'—'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800;font-size:13px">${fmtE(p.total||0)}</div>
            <span style="background:${est.bg};color:${est.col};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${est.ico} ${est.label}</span>
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  document.getElementById('obra-hist-presupuestos').innerHTML = presupHtml + presupCompraHtml;

  // ── ALBARANES ── (con checkboxes para selección múltiple)
  // Calcular total real de cada albarán desde líneas si total es 0
  albData.forEach(a => {
    if (!a.total && Array.isArray(a.lineas) && a.lineas.length) {
      a._totalCalc = a.lineas.reduce((s,l) => s + ((l.cant||0)*(l.precio||0)), 0);
    } else {
      a._totalCalc = a.total || 0;
    }
  });
  const totalAlbReal = albData.reduce((s,a) => s + a._totalCalc, 0);
  const _factActAlb = factData.filter(f => !f.rectificativa_de && !(f.estado === 'anulada' && factData.some(r => r.rectificativa_de === f.id)));
  const albSinFacturar = albData.filter(a => a.estado !== 'facturado' && a.estado !== 'anulado' && !_factActAlb.some(f=>f.albaran_id===a.id));
  const albHtml = albData.length ?
    resumenBar([resumenItem('Total albaranes', fmtE(totalAlbReal), 'var(--gris-700)'), resumenItem('Docs', albData.length+'')]) +
    (albSinFacturar.length >= 2 ? `<div style="text-align:right;margin-bottom:8px"><button class="btn btn-sm" id="btnFacturarSeleccionados" onclick="obraFacturarAlbSeleccionados()" style="background:#7C3AED;color:#fff;border:none;font-weight:700;font-size:11px;padding:5px 12px;border-radius:6px;opacity:.5;pointer-events:none">🧾 Facturar albaranes seleccionados</button></div>` : '') +
    albData.map(a=>{
      const _factAct2 = factData.filter(f => !f.rectificativa_de && !(f.estado === 'anulada' && factData.some(r => r.rectificativa_de === f.id)));
      const tieneFac = _factAct2.some(f=>f.albaran_id===a.id) || (a.presupuesto_id && _factAct2.some(f=>f.presupuesto_id===a.presupuesto_id));
      const _bOK = 'padding:3px 8px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700';
      const esFacturable = !tieneFac && a.estado !== 'anulado';
      return `
      <div class="ficha-doc-row" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--gris-100);border-radius:6px;cursor:pointer" onclick="verDetalleAlbaran(${a.id})">
        ${esFacturable && albSinFacturar.length >= 2 ? `<input type="checkbox" class="alb-check" data-alb-id="${a.id}" onclick="event.stopPropagation();actualizarBtnFacturarSeleccionados()" style="width:16px;height:16px;cursor:pointer;flex-shrink:0">` : ''}
        <div style="flex:1">
          <div style="font-weight:700;font-size:12.5px">${a.numero}</div>
          <div style="font-size:10.5px;color:var(--gris-400)">${a.fecha||'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(a._totalCalc)}</div>${estadoBadgeA(a.estado)}</div>
          <div onclick="event.stopPropagation()">${tieneFac ? `<span style="${_bOK};margin-left:8px">✅ Facturado</span>` : (()=>{
            let _ab = '';
            const _fAnulAb = factData.find(f => !f.rectificativa_de && f.estado === 'anulada' && (f.albaran_id===a.id || (a.presupuesto_id && f.presupuesto_id===a.presupuesto_id)) && factData.some(r => r.rectificativa_de === f.id));
            if (_fAnulAb) {
              const _fRectAb = factData.find(r => r.rectificativa_de === _fAnulAb.id);
              _ab += `<span style="padding:3px 8px;border-radius:6px;background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;margin-left:8px">🚫 ${_fAnulAb.numero||'Anulada'}</span> `;
              if (_fRectAb) _ab += `<span style="padding:3px 8px;border-radius:6px;background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700">📝 ${_fRectAb.numero||'RECT'}</span> `;
            }
            if (a.estado!=='anulado') _ab += `<button class="btn btn-ghost btn-sm" onclick="obraAlbToFactura(${a.id})" title="Facturar" style="font-size:11px;padding:3px 6px;margin-left:8px">🧾 Facturar</button>`;
            return _ab;
          })()}</div>
        </div>
      </div>`;
    }).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📄</div><p>Sin albaranes vinculados</p></div>';
  // ── FACTURAS ──
  // Calcular total real de cada factura desde líneas si total es 0
  factData.forEach(f => {
    if (!f.total && Array.isArray(f.lineas) && f.lineas.length) {
      f._totalCalc = f.lineas.filter(l=>!l._separator).reduce((s,l) => s + ((l.cant||0)*(l.precio||0)), 0);
    } else {
      f._totalCalc = f.total || 0;
    }
  });
  const totalFactReal = factData.reduce((s,f) => s + f._totalCalc, 0);
  const factResumen = [resumenItem('Total facturado', fmtE(totalFactReal), 'var(--verde)')];
  if (pendienteCobro > 0) factResumen.push(resumenItem('Pte. cobro', fmtE(pendienteCobro), 'var(--rojo)'));
  const factHtml = factData.length ?
    resumenBar(factResumen) +
    factData.map(f=>{
      const _esRect = !!f.rectificativa_de;
      const _esAnul = f.estado === 'anulada';
      const _numStyle = _esAnul ? 'font-weight:700;font-size:12.5px;color:#991B1B' : (_esRect ? 'font-weight:700;font-size:12.5px;color:#92400E' : 'font-weight:700;font-size:12.5px');
      const _prefix = _esRect ? '📝 ' : (_esAnul ? '🚫 ' : '');
      const _click = f.estado === 'borrador' ? `abrirEditor('factura',${f.id})` : `verDetalleFactura(${f.id})`;
      return `
      <div class="ficha-doc-row" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--gris-100);border-radius:6px;cursor:pointer" onclick="${_click}">
        <div><div style="${_numStyle}">${_prefix}${f.numero||'—'}</div><div style="font-size:10.5px;color:var(--gris-400)">${f.fecha||'—'}${_esRect ? ' · Rectificativa' : ''}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(f._totalCalc)}</div>${estadoBadgeF(f.estado)}</div>
      </div>`;
    }).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">🧾</div><p>Sin facturas vinculadas</p></div>';

  // ── FACTURACIÓN (Albaranes + Facturas combinados) ──
  const _facFilterBtns = `<div style="display:flex;gap:6px;margin-bottom:10px;justify-content:space-between;align-items:center;flex-wrap:wrap" id="facturacionFiltros">
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm" style="font-size:10.5px" onclick="filtrarFacturacion('todos')" data-filt="todos">Todos</button>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="filtrarFacturacion('albaranes')" data-filt="albaranes">📄 Albaranes (${albData.length})</button>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="filtrarFacturacion('facturas')" data-filt="facturas">🧾 Facturas (${factData.length})</button>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm" style="font-size:11px;background:var(--azul);color:#fff;border:none;font-weight:700" onclick="nuevoAlbaranObraActual()">+ Albarán</button>
      <button class="btn btn-sm" style="font-size:11px;background:var(--azul);color:#fff;border:none;font-weight:700" onclick="nuevaFacturaObraActual()">+ Factura</button>
    </div>
  </div>`;
  // ── FACTURAS DE PROVEEDOR — build 126 ──
  const FP_EST_VIS = {pendiente:{ico:'⏳',col:'#F59E0B',bg:'#FEF3C7',label:'Pendiente'},pagada:{ico:'✅',col:'#10B981',bg:'#D1FAE5',label:'Pagada'},vencida:{ico:'⚠️',col:'#EF4444',bg:'#FEE2E2',label:'Vencida'},anulada:{ico:'❌',col:'#6B7280',bg:'#F3F4F6',label:'Anulada'}};
  const _hoy = new Date().toISOString().slice(0,10);
  const _fpEstEf = f => (f.estado==='pendiente' && f.fecha_vencimiento && f.fecha_vencimiento < _hoy) ? 'vencida' : (f.estado||'pendiente');
  const totalFactProv = facturasProvData.reduce((s,f)=>s+(parseFloat(f.total)||0),0);
  const factProvHtml = facturasProvData.length ? `
    <div style="margin-top:18px;padding-top:14px;border-top:2px solid var(--gris-100)">
      <h4 style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--gris-700)">🧾 Facturas de proveedor (${facturasProvData.length})</h4>
      ${resumenBar([resumenItem('Total compras', fmtE(totalFactProv), 'var(--rojo)'), resumenItem('Docs', facturasProvData.length+'')])}
      ${facturasProvData.map(f=>{
        const ef = _fpEstEf(f);
        const est = FP_EST_VIS[ef] || FP_EST_VIS.pendiente;
        return `<div class="ficha-doc-row" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--gris-100);border-radius:6px;cursor:pointer" onclick="obraAbrirFacturaProv(${f.id})">
          <div style="flex:1">
            <div style="font-weight:700;font-size:12.5px">${f.numero||'—'}</div>
            <div style="font-size:10.5px;color:var(--gris-400)">${f.fecha||'—'} · ${f.proveedor_nombre||'—'}${f.fecha_vencimiento?' · vto. '+f.fecha_vencimiento:''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800;font-size:13px">${fmtE(f.total||0)}</div>
            <span style="background:${est.bg};color:${est.col};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${est.ico} ${est.label}</span>
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  document.getElementById('obra-hist-facturacion').innerHTML = _facFilterBtns +
    `<div id="_fac_alb">${albHtml}</div>` +
    `<div id="_fac_fact" style="margin-top:${albData.length && factData.length ? '16px' : '0'}">${factHtml}</div>` +
    factProvHtml;
  aplicarFiltroFacturacion();

  // ── PARTES DE TRABAJO ──
  const ESTADOS_PARTE = {borrador:'Borrador',programado:'Programado',en_curso:'En curso',completado:'Cumplimentado',revisado:'Revisado',facturado:'Facturado'};
  const EST_PARTE_ICO = {borrador:'📝',programado:'📅',en_curso:'🔧',completado:'✅',revisado:'👁️',facturado:'🧾'};
  const EST_PARTE_COL = {borrador:'#9CA3AF',programado:'#3B82F6',en_curso:'#F59E0B',completado:'#10B981',revisado:'#059669',facturado:'#8B5CF6'};
  const EST_PARTE_BG  = {borrador:'#F3F4F6',programado:'#EFF6FF',en_curso:'#FFFBEB',completado:'#ECFDF5',revisado:'#D1FAE5',facturado:'#F5F3FF'};

  // Progreso partes (completados / total)
  const estadosCompletados = ['completado','revisado','facturado'];
  const partesCompletados = partesData.filter(p => estadosCompletados.includes(p.estado)).length;
  const partesTotal = partesData.length;
  const partesPorcent = partesTotal ? Math.round((partesCompletados / partesTotal) * 100) : 0;

  let partesHtml = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <span style="font-size:13px;font-weight:700;color:var(--gris-700)">${EST_PARTE_ICO.completado} ${partesCompletados}/${partesTotal} cumplimentados</span>
    <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="nuevoParteDesdeObra(${id})">+ Nuevo parte</button>
  </div>`;

  // Barra de progreso (como las tareas)
  if (partesTotal > 0) {
    partesHtml += `<div style="margin-bottom:14px">
      <div style="height:8px;background:var(--gris-100);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${partesPorcent}%;background:${partesPorcent===100?'linear-gradient(90deg,#34D399,#059669)':'linear-gradient(90deg,#60A5FA,#2563EB)'};border-radius:4px;transition:width .5s"></div>
      </div>
    </div>`;
    // Horas programadas (todos los partes) vs realizadas (hora_inicio→hora_fin reales de todos los partes)
    const horasRealizadas = partesData.reduce((s,p) => {
      if (p.hora_inicio && p.hora_fin) {
        const [hi,mi] = p.hora_inicio.split(':').map(Number);
        const [hf,mf] = p.hora_fin.split(':').map(Number);
        let mins = (hf*60+mf) - (hi*60+mi);
        if (mins < 0) mins += 24*60; // cruce de medianoche
        return s + mins/60;
      }
      return s;
    }, 0);
    partesHtml += resumenBar([
      resumenItem('Horas programadas', horasPartes.toFixed(1)+' h', 'var(--azul)'),
      resumenItem('Horas realizadas', horasRealizadas.toFixed(1)+' h', 'var(--acento)'),
      resumenItem('Coste', fmtE(costePartes), 'var(--gris-700)'),
      resumenItem('Partes', partesData.length+'')
    ]);
    // ── Agrupar por operario, ordenar por hora inicio ──
    const _operarioGroups = {};
    partesData.forEach(p => {
      const opName = p.usuario_nombre || p.operario_nombre || 'Sin asignar';
      const opId = p.usuario_id || 'none';
      if (!_operarioGroups[opId]) _operarioGroups[opId] = { nombre: opName, partes: [] };
      _operarioGroups[opId].partes.push(p);
    });
    // Ordenar partes de cada operario por fecha + hora_inicio
    Object.values(_operarioGroups).forEach(g => {
      g.partes.sort((a, b) => {
        const da = (a.fecha || '') + (a.hora_inicio || '');
        const db = (b.fecha || '') + (b.hora_inicio || '');
        return da.localeCompare(db);
      });
    });

    const _operarioIds = Object.keys(_operarioGroups);
    // Si solo hay 1 operario, no mostrar desplegable
    const _showGroupHeaders = _operarioIds.length > 1;

    _operarioIds.forEach(opId => {
      const group = _operarioGroups[opId];
      const groupId = 'partesGroup_' + opId.replace(/[^a-zA-Z0-9]/g, '_');

      if (_showGroupHeaders) {
        const completadosGrp = group.partes.filter(p => estadosCompletados.includes(p.estado)).length;
        partesHtml += `<div style="margin-top:10px">
          <div onclick="const b=document.getElementById('${groupId}');b.style.display=b.style.display==='none'?'':'none';this.querySelector('.grp-arrow').textContent=b.style.display==='none'?'▶':'▼'"
               style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 10px;background:var(--gris-50);border-radius:8px;margin-bottom:6px">
            <span style="font-size:18px">👷</span>
            <span style="font-weight:700;font-size:13px;flex:1">${group.nombre}</span>
            <span style="font-size:11px;color:var(--gris-400)">${completadosGrp}/${group.partes.length} cumplimentados</span>
            <span class="grp-arrow" style="font-size:10px;color:var(--gris-400)">▼</span>
          </div>
          <div id="${groupId}">`;
      }

      group.partes.forEach(p => {
        const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'}) : '—';
        const hi = p.hora_inicio ? p.hora_inicio.substring(0,5) : '';
        const hf = p.hora_fin ? p.hora_fin.substring(0,5) : '';
        const horasTxt = parseFloat(p.horas||0).toFixed(1);
        const est = ESTADOS_PARTE[p.estado]||p.estado||'—';
        const estIco = EST_PARTE_ICO[p.estado]||'📝';
        const estCol = EST_PARTE_COL[p.estado]||'#6B7280';
        const estBg = EST_PARTE_BG[p.estado]||'#F3F4F6';

        // Color de fondo tarjeta según estado y hora
        let _cardBg = '#fff', _cardBorder = 'var(--gris-100)';
        if (estadosCompletados.includes(p.estado)) {
          _cardBg = '#F0FDF4'; _cardBorder = '#BBF7D0';
        } else if (p.estado === 'en_curso') {
          _cardBg = '#EFF6FF'; _cardBorder = '#BFDBFE';
        } else if (p.estado === 'programado' || p.estado === 'borrador') {
          const _now = new Date();
          const _todayStr = _now.getFullYear() + '-' + String(_now.getMonth()+1).padStart(2,'0') + '-' + String(_now.getDate()).padStart(2,'0');
          if (p.fecha && p.fecha < _todayStr) {
            _cardBg = '#FEF2F2'; _cardBorder = '#FECACA'; // rojo — caducado
          } else if (p.fecha === _todayStr) {
            let _pasoFin = false, _pasoIni = false;
            if (p.hora_fin) { const [h,m] = p.hora_fin.split(':').map(Number); const d = new Date(); d.setHours(h,m,0,0); if (_now > d) _pasoFin = true; }
            if (p.hora_inicio) { const [h,m] = p.hora_inicio.split(':').map(Number); const d = new Date(); d.setHours(h,m,0,0); if (_now > d) _pasoIni = true; }
            if (_pasoFin) { _cardBg = '#FEF2F2'; _cardBorder = '#FECACA'; }
            else if (_pasoIni) { _cardBg = '#FFFBEB'; _cardBorder = '#FDE68A'; }
          }
        }

        // Siguiente acción rápida
        const nextActions = {
          borrador:   {label:'📅 Programar', fn:`programarParteBorrador(${p.id})`, bg:'#3B82F6'},
          programado: {label:'🔧 Iniciar', fn:`avanzarEstadoParte(${p.id},'en_curso')`, bg:'var(--acento)'},
          en_curso:   {label:'✅ Cumplimentar', fn:`avanzarEstadoParte(${p.id},'completado')`, bg:'var(--verde)'},
          completado: {label:'👁️ Revisar', fn:`avanzarEstadoParte(${p.id},'revisado')`, bg:'#10B981'},
          revisado:   {label:'🧾 Facturar', fn:`avanzarEstadoParte(${p.id},'facturado')`, bg:'#8B5CF6'},
        };
        const nextAct = nextActions[p.estado];

        partesHtml += `<div class="parte-row" style="background:${_cardBg};border-left-color:${_cardBorder}" onclick="verDetalleParte(${p.id})">
          <div style="min-width:60px;text-align:center">
            <div style="font-size:15px;font-weight:800;color:var(--gris-800)">${hi || '—'}</div>
            <div style="font-size:10px;color:var(--gris-400)">${hf ? hi + '-' + hf : ''}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
              <span style="font-size:12px;font-weight:600;color:var(--gris-700)">${fecha}</span>
              <span style="background:${estBg};color:${estCol};padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600">${estIco} ${est}</span>
              <span style="font-size:10px;color:var(--gris-400)">${horasTxt}h</span>
            </div>
            <div style="font-size:10.5px;color:var(--gris-400)">${p.numero||'—'}${!_showGroupHeaders ? ' · '+(p.usuario_nombre||p.operario_nombre||'—') : ''}</div>
            ${p.descripcion?'<div style="font-size:11px;color:var(--gris-500);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:350px">'+p.descripcion+'</div>':''}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            ${nextAct ? `<button class="btn btn-sm" style="font-size:10px;background:${nextAct.bg};color:#fff;border:none;padding:3px 8px;border-radius:6px;font-weight:600;white-space:nowrap" onclick="event.stopPropagation();${nextAct.fn}">${nextAct.label}</button>` : '<span style="font-size:10px;color:#8B5CF6;font-weight:700">✓ Facturado</span>'}
            <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="event.stopPropagation();editarParte(${p.id})">✏️</button>
            <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="event.stopPropagation();verDetalleParte(${p.id})">👁️</button>
          </div>
        </div>`;
      });

      if (_showGroupHeaders) {
        partesHtml += `</div></div>`;
      }
    });
  } else {
    partesHtml += '<div class="empty" style="padding:30px 0"><div class="ei">📝</div><p>Sin partes de trabajo</p></div>';
  }
  document.getElementById('obra-hist-partes').innerHTML = partesHtml;

  // ── SEGUIMIENTO (Tareas + Notas) ──
  renderObraTareas(); // renderiza en variable _tareasHtml
  const _tareasEl = document.getElementById('obra-hist-seguimiento');

  const NOTA_ICO = {nota:'📝',llamada:'📞',visita:'🚗',incidencia:'⚠️',material:'📦'};
  const notaForm = `
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:end">
      <select id="obraNotaTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <option value="nota">📝 Nota</option><option value="llamada">📞 Llamada</option><option value="visita">🚗 Visita</option><option value="incidencia">⚠️ Incidencia</option><option value="material">📦 Material</option>
      </select>
      <input id="obraNotaTexto" placeholder="Escribe una nota..." style="flex:1;min-width:200px;padding:6px 9px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:12px;outline:none;font-family:var(--font)">
      <button class="btn btn-primary btn-sm" style="font-size:11.5px;white-space:nowrap" onclick="guardarNotaObra()">💾 Guardar</button>
    </div>`;
  const notaList = notasData.length ?
    notasData.map(n => `
      <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <span style="font-size:16px;flex-shrink:0">${NOTA_ICO[n.tipo]||'📝'}</span>
        <div style="flex:1"><div style="font-size:12.5px;line-height:1.5">${n.texto}</div><div style="font-size:10.5px;color:var(--gris-400);margin-top:3px">${n.creado_por_nombre||'—'} · ${new Date(n.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>
        <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="eliminarNotaObra(${n.id})">🗑️</button>
      </div>`).join('') :
    '<div style="color:var(--gris-400);font-size:12.5px;padding:14px 0;text-align:center">Sin notas todavía</div>';

  // Seguimiento: NOTAS arriba, TAREAS abajo con filtros por usuario
  if (_tareasEl) {
    const tareasContent = _tareasEl.innerHTML;

    // Construir filtro de usuarios para tareas
    const _esAdmin = CP?.rol === 'superadmin' || CP?.rol === 'admin';
    const _userId = CP?.id;
    const _tareasUsuarios = [...new Set(obraTareasData.filter(t=>t.responsable_id).map(t=>t.responsable_id))];
    const _tareasNombres = {};
    obraTareasData.forEach(t => { if(t.responsable_id && t.responsable_nombre) _tareasNombres[t.responsable_id]=t.responsable_nombre; });

    let _tareaFiltroHtml = '';
    if (_esAdmin && _tareasUsuarios.length > 0) {
      _tareaFiltroHtml = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px" id="tareasFiltroUsuario">
        <button class="btn btn-sm" data-tfilt="todos" onclick="filtrarTareasUsuario('todos')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:var(--azul);color:#fff;font-weight:600;cursor:pointer">Todos</button>
        ${_tareasUsuarios.map(uid => {
          const nombre = _tareasNombres[uid] || 'Sin nombre';
          const primerNombre = nombre.split(' ')[0];
          return `<button class="btn btn-sm" data-tfilt="${uid}" onclick="filtrarTareasUsuario('${uid}')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">👷 ${primerNombre}</button>`;
        }).join('')}
        <button class="btn btn-sm" data-tfilt="sin_asignar" onclick="filtrarTareasUsuario('sin_asignar')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">Sin asignar</button>
      </div>`;
    }

    _tareasEl.innerHTML =
      `<h4 style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--gris-700)">💬 Notas</h4>
      ${notaForm}${notaList}
      <div style="margin-top:20px;padding-top:14px;border-top:2px solid var(--gris-100)">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--gris-700)">📋 Tareas</h4>
        ${_tareaFiltroHtml}
        <div id="tareasContentFiltered">${tareasContent}</div>
      </div>`;

    // Si NO es admin, filtrar automáticamente por el usuario actual
    if (!_esAdmin && _userId) {
      filtrarTareasUsuario(String(_userId));
    }
  }

  // ── DOCUMENTOS (pestaña propia) ──
  renderObraDocumentos(docsData, partesData, presupData, albData, factData);

  // ── HISTORIAL (solo audit log + filtros) ──
  const _histEl = document.getElementById('obra-hist-historial');
  if (_histEl) {
    const _tiposFiltro = [...new Set(_timeline.map(e => e.tipo))];
    const _filtrosHtml = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px" id="historialFiltros">
      <button class="btn btn-sm" data-hfilt="todos" onclick="filtrarHistorial('todos')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:var(--azul);color:#fff;font-weight:600;cursor:pointer">Todos (${_timeline.length})</button>
      ${_tiposFiltro.includes('audit') ? `<button class="btn btn-sm" data-hfilt="audit" onclick="filtrarHistorial('audit')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">📝 Audit</button>` : ''}
      ${_tiposFiltro.includes('crear') ? `<button class="btn btn-sm" data-hfilt="crear" onclick="filtrarHistorial('crear')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">🆕 Creación</button>` : ''}
      ${_tiposFiltro.includes('nota') ? `<button class="btn btn-sm" data-hfilt="nota" onclick="filtrarHistorial('nota')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">💬 Notas</button>` : ''}
      ${_tiposFiltro.includes('presupuesto') ? `<button class="btn btn-sm" data-hfilt="presupuesto" onclick="filtrarHistorial('presupuesto')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">📋 Presupuestos</button>` : ''}
      ${_tiposFiltro.includes('albaran') ? `<button class="btn btn-sm" data-hfilt="albaran" onclick="filtrarHistorial('albaran')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">📄 Albaranes</button>` : ''}
      ${_tiposFiltro.includes('factura') ? `<button class="btn btn-sm" data-hfilt="factura" onclick="filtrarHistorial('factura')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">🧾 Facturas</button>` : ''}
      ${_tiposFiltro.includes('compra') ? `<button class="btn btn-sm" data-hfilt="compra" onclick="filtrarHistorial('compra')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">🛒 Compras</button>` : ''}
      ${_tiposFiltro.includes('documento') ? `<button class="btn btn-sm" data-hfilt="documento" onclick="filtrarHistorial('documento')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">📎 Documentos</button>` : ''}
    </div>`;
    const _headerHtml = `<div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;color:var(--gris-400)">${_timeline.length} eventos registrados</span>
      ${_isSuperadmin ? '<span style="font-size:10px;color:var(--gris-400);background:var(--gris-50);padding:2px 8px;border-radius:4px">Modo superadmin</span>' : '<span style="font-size:10px;color:var(--gris-400);background:var(--gris-50);padding:2px 8px;border-radius:4px">Solo lectura</span>'}
    </div>`;
    _histEl.innerHTML = _filtrosHtml + _headerHtml + `<div id="historialItems">${registroHtml}</div>`;
    // Guardamos la timeline en variable global para el filtro
    window._obraTimeline = _timeline;
    window._obraIsSuperadmin = _isSuperadmin;
  }

  // ── MATERIALES ──
  const _matEl = document.getElementById('obra-hist-materiales');
  if (_matEl) {
    // Botones de acción + filtros + lista de movimientos
    const _matBtns = `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" data-matfilt="todos" onclick="filtrarMateriales('todos')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:var(--azul);color:#fff;font-weight:600;cursor:pointer">Todos</button>
        <button class="btn btn-sm" data-matfilt="pedido" onclick="filtrarMateriales('pedido')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">🚚 Pedidos</button>
        <button class="btn btn-sm" data-matfilt="salida" onclick="filtrarMateriales('salida')" style="font-size:10.5px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:#fff;color:var(--gris-600);font-weight:600;cursor:pointer">📤 Salidas</button>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="nuevoPedidoProveedorObra()">🚚 Pedido a proveedor</button>
        <button class="btn btn-sm" style="font-size:11px;background:#D97706;color:#fff;border:none" onclick="nuevaSalidaAlmacenObra()">📤 Salida de almacén</button>
      </div>
    </div>`;
    // Estados visuales para pedidos / recepciones (build 126)
    const PC_EST_VIS = {borrador:{ico:'📝',col:'#6B7280',bg:'#F3F4F6',label:'Borrador'},pendiente:{ico:'⏳',col:'#F59E0B',bg:'#FEF3C7',label:'Pendiente'},confirmado:{ico:'✅',col:'#3B82F6',bg:'#DBEAFE',label:'Confirmado'},recibido:{ico:'📦',col:'#10B981',bg:'#D1FAE5',label:'Recibido'},cancelado:{ico:'❌',col:'#EF4444',bg:'#FEE2E2',label:'Cancelado'}};
    const RC_EST_VIS = {pendiente:{ico:'⏳',col:'#F59E0B',bg:'#FEF3C7',label:'Pendiente'},recepcionado:{ico:'✅',col:'#10B981',bg:'#D1FAE5',label:'Recepcionado'},incidencia:{ico:'⚠️',col:'#EF4444',bg:'#FEE2E2',label:'Incidencia'},facturado:{ico:'🧾',col:'#8B5CF6',bg:'#EDE9FE',label:'Facturado'}};
    const totalPed = pedidosCompraData.reduce((s,p)=>s+(parseFloat(p.total)||0),0);
    const totalRec = recepcionesProvData.reduce((s,r)=>s+(parseFloat(r.total)||0),0);

    const pedidosHtml = pedidosCompraData.length ? `
      <div style="margin-bottom:16px">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--gris-700)">🚚 Pedidos a proveedor (${pedidosCompraData.length})</h4>
        ${resumenBar([resumenItem('Total pedido', fmtE(totalPed), 'var(--azul)'), resumenItem('Docs', pedidosCompraData.length+'')])}
        ${pedidosCompraData.map(p=>{
          const est = PC_EST_VIS[p.estado] || PC_EST_VIS.pendiente;
          return `<div class="ficha-doc-row" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--gris-100);border-radius:6px;cursor:pointer" onclick="obraAbrirPedidoCompra(${p.id})">
            <div style="flex:1">
              <div style="font-weight:700;font-size:12.5px">${p.numero||'—'}</div>
              <div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.proveedor_nombre||'—'}${p.fecha_entrega_prevista?' · entrega '+p.fecha_entrega_prevista:''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:800;font-size:13px">${fmtE(p.total||0)}</div>
              <span style="background:${est.bg};color:${est.col};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${est.ico} ${est.label}</span>
            </div>
          </div>`;
        }).join('')}
      </div>` : '';

    const recepcionesHtml = recepcionesProvData.length ? `
      <div style="margin-bottom:16px">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--gris-700)">📄 Albaranes de proveedor (${recepcionesProvData.length})</h4>
        ${resumenBar([resumenItem('Total recibido', fmtE(totalRec), 'var(--verde)'), resumenItem('Docs', recepcionesProvData.length+'')])}
        ${recepcionesProvData.map(r=>{
          const est = RC_EST_VIS[r.estado] || RC_EST_VIS.pendiente;
          return `<div class="ficha-doc-row" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--gris-100);border-radius:6px;cursor:pointer" onclick="obraAbrirRecepcion(${r.id})">
            <div style="flex:1">
              <div style="font-weight:700;font-size:12.5px">${r.numero||r.numero_albaran||'—'}</div>
              <div style="font-size:10.5px;color:var(--gris-400)">${r.fecha||'—'} · ${r.proveedor_nombre||'—'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:800;font-size:13px">${fmtE(r.total||0)}</div>
              <span style="background:${est.bg};color:${est.col};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${est.ico} ${est.label}</span>
            </div>
          </div>`;
        }).join('')}
      </div>` : '';

    const sinCompras = !pedidosCompraData.length && !recepcionesProvData.length;
    const _matList = `<div id="obraMatList" style="min-height:120px">
      ${pedidosHtml}
      ${recepcionesHtml}
      ${sinCompras ? `<div class="empty" style="padding:30px 0">
        <div class="ei">📦</div>
        <p style="color:var(--gris-400)">Sin movimientos de material registrados.<br>Crea un pedido a proveedor o una salida de almacén.</p>
      </div>` : ''}
    </div>`;
    _matEl.innerHTML = _matBtns + _matList;
  }

  // ── MENSAJES (correos vinculados a la obra y a sus documentos) ──
  cargarMensajesObra(t.id, t, presupData, albData, factData, partesData);

  // Activar pestaña recordada (o seguimiento si es la primera vez)
  obraTab(obraTabActual || 'seguimiento');
}

// ═══════════════════════════════════════════════
// MENSAJES — Correos vinculados a la obra
// ═══════════════════════════════════════════════
async function cargarMensajesObra(obraId, obra, presupData, albData, factData, partesData) {
  const container = document.getElementById('obra-hist-mensajes');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner" style="margin:0 auto"></div></div>';

  // Botón Nuevo correo (siempre visible aunque no haya mensajes)
  const headerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <div id="obraMsgsCount" style="font-size:12px;color:var(--gris-400)"></div>
      <button class="btn btn-primary btn-sm" onclick="nuevoCorreoObra(${obraId})">✉️ Nuevo correo</button>
    </div>`;

  try {
    // IDs de docs vinculados a la obra
    const presIds = (presupData||[]).map(p=>p.id);
    const albIds  = (albData||[]).map(a=>a.id);
    const factIds = (factData||[]).map(f=>f.id);
    const parteIds = (partesData||[]).map(p=>p.id);

    // Montar OR clauses para una sola query a correos
    const ors = [`and(vinculado_tipo.eq.obra,vinculado_id.eq.${obraId})`];
    if (presIds.length)  ors.push(`and(vinculado_tipo.eq.presupuesto,vinculado_id.in.(${presIds.join(',')}))`);
    if (albIds.length)   ors.push(`and(vinculado_tipo.eq.albaran,vinculado_id.in.(${albIds.join(',')}))`);
    if (factIds.length)  ors.push(`and(vinculado_tipo.eq.factura,vinculado_id.in.(${factIds.join(',')}))`);
    if (parteIds.length) ors.push(`and(vinculado_tipo.eq.parte,vinculado_id.in.(${parteIds.join(',')}))`);

    const { data, error } = await sb.from('correos')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .or(ors.join(','))
      .order('fecha', { ascending: false });

    if (error) throw error;

    const msgs = data || [];

    // Actualizar contador KPI de la pestaña
    const kpi = document.getElementById('ok-mensajes');
    if (kpi) kpi.textContent = msgs.length || '0';

    if (msgs.length === 0) {
      container.innerHTML = headerHTML + `
        <div class="empty" style="padding:40px 0">
          <div class="ei">💬</div>
          <h3>Sin mensajes</h3>
          <p style="color:var(--gris-400)">No hay correos vinculados a esta obra ni a sus documentos.<br>Pulsa <b>✉️ Nuevo correo</b> para enviar uno desde aquí.</p>
        </div>`;
      return;
    }

    // Mapas para badge "viene de…"
    const presNum = new Map((presupData||[]).map(p=>[p.id, p.numero||('#'+p.id)]));
    const albNum  = new Map((albData||[]).map(a=>[a.id, a.numero||('#'+a.id)]));
    const factNum = new Map((factData||[]).map(f=>[f.id, f.numero||('#'+f.id)]));
    const parteNum= new Map((partesData||[]).map(p=>[p.id, p.numero||('#'+p.id)]));

    const badgeFor = (m) => {
      if (m.vinculado_tipo === 'presupuesto') return `<span style="font-size:10px;background:var(--azul-light,#dbeafe);color:var(--azul);padding:2px 6px;border-radius:4px;margin-left:6px">📋 ${presNum.get(m.vinculado_id) || m.vinculado_ref || ''}</span>`;
      if (m.vinculado_tipo === 'albaran')     return `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;margin-left:6px">📦 ${albNum.get(m.vinculado_id) || m.vinculado_ref || ''}</span>`;
      if (m.vinculado_tipo === 'factura')     return `<span style="font-size:10px;background:var(--verde-light,#dcfce7);color:var(--verde);padding:2px 6px;border-radius:4px;margin-left:6px">🧾 ${factNum.get(m.vinculado_id) || m.vinculado_ref || ''}</span>`;
      if (m.vinculado_tipo === 'parte')       return `<span style="font-size:10px;background:#e0e7ff;color:#4338ca;padding:2px 6px;border-radius:4px;margin-left:6px">📝 ${parteNum.get(m.vinculado_id) || m.vinculado_ref || ''}</span>`;
      if (m.vinculado_tipo === 'obra')        return `<span style="font-size:10px;background:var(--gris-100);color:var(--gris-500);padding:2px 6px;border-radius:4px;margin-left:6px">🏗️ Obra</span>`;
      return '';
    };

    container.innerHTML = headerHTML + msgs.map(m => {
      const fecha = m.fecha ? new Date(m.fecha).toLocaleString('es-ES', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
      const tipoIcon = m.tipo === 'enviado' ? '📤' : '📥';
      const adjIcon = m.tiene_adjuntos ? ' 📎' : '';
      return `<div onclick="goPage('correo');setTimeout(()=>abrirCorreo(${m.id}),400)" style="padding:10px 14px;border:1px solid var(--gris-100);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background=''">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-weight:600;font-size:12.5px">${tipoIcon} ${m.de_nombre || m.de || '—'}${badgeFor(m)}</span>
          <span style="font-size:11px;color:var(--gris-400)">${fecha}</span>
        </div>
        <div style="font-size:12.5px;color:var(--gris-600)">${m.asunto || '(sin asunto)'}${adjIcon}</div>
      </div>`;
    }).join('');

    const cnt = document.getElementById('obraMsgsCount');
    if (cnt) cnt.textContent = `${msgs.length} correo${msgs.length > 1 ? 's' : ''} relacionado${msgs.length > 1 ? 's' : ''} con esta obra`;
  } catch (e) {
    container.innerHTML = headerHTML + `<div class="empty" style="padding:20px"><p style="color:var(--rojo)">Error cargando mensajes: ${e.message}</p></div>`;
  }
}

// Botón Nuevo correo desde la pestaña Mensajes de la obra
async function nuevoCorreoObra(obraId) {
  if (typeof nuevoCorreo !== 'function') {
    toast('Módulo de correo no disponible','error');
    return;
  }
  // Cargar obra y cliente desde BD
  const { data: trabajo } = await sb.from('trabajos').select('id,numero,titulo,cliente_id').eq('id', obraId).single();
  const cli = trabajo?.cliente_id ? (clientes||[]).find(c=>c.id===trabajo.cliente_id) : null;
  const para = cli?.email || '';
  const refObra = trabajo?.numero || trabajo?.titulo || ('#'+obraId);
  const asunto = `Obra ${refObra}${trabajo?.titulo?' — '+trabajo.titulo:''}`;
  const cuerpo = `Estimado/a ${cli?.nombre||'cliente'},\n\nEn relación a la obra ${refObra}:\n\n\n\nUn saludo,\n${EMPRESA?.nombre||''}`;
  nuevoCorreo(para, asunto, cuerpo, { tipo: 'obra', id: obraId, ref: refObra });
  if (typeof goPage === 'function') goPage('correo');
}

// ═══════════════════════════════════════════════
// DOCUMENTOS — Vista organizada por categorías
// ═══════════════════════════════════════════════
let _obraDocFilter = 'todos';

function renderObraDocumentos(docsData, partesData, presupData, albData, factData) {
  const container = document.getElementById('obra-hist-documentos');
  if (!container) return;

  // ── 1. Recopilar TODAS las fotos de partes ──
  const fotosPartes = [];
  partesData.forEach(p => {
    if (Array.isArray(p.fotos)) {
      p.fotos.forEach((url, idx) => {
        fotosPartes.push({
          _cat: 'fotos',
          _source: 'parte',
          url,
          nombre: `Foto ${idx+1} — ${p.numero || 'Parte'}`,
          subtitulo: `${p.usuario_nombre || '—'} · ${p.fecha || '—'}`,
          fecha: p.fecha || p.created_at || '',
          parteId: p.id,
          isImage: true,
        });
      });
    }
  });

  // ── 2. Documentos adjuntos (tabla documentos_trabajo) clasificados ──
  const TIPO_ICO = {manual:'📖',garantia:'🛡️',certificado:'📜',foto:'📷',contrato:'📋',plano:'📐',otro:'📄'};
  const IMG_EXTS = ['jpg','jpeg','png','gif','webp','bmp'];
  const docsClasificados = docsData.map(d => {
    const ext = (d.url||'').split('.').pop().toLowerCase();
    const isImg = IMG_EXTS.includes(ext) || d.tipo === 'foto';
    let cat = 'otros';
    if (d.tipo === 'foto' || isImg) cat = 'fotos';
    else if (['plano','certificado','manual','garantia','contrato'].includes(d.tipo)) cat = 'otros';
    return {
      _cat: cat,
      _source: 'doc',
      id: d.id,
      url: d.url,
      nombre: d.nombre || 'Documento',
      subtitulo: `${d.tipo || 'otro'} · ${new Date(d.created_at).toLocaleDateString('es-ES')}${d.tamanyo ? ' · ' + fmtBytes(d.tamanyo) : ''}`,
      fecha: d.created_at || '',
      tipo: d.tipo,
      ico: TIPO_ICO[d.tipo] || '📄',
      isImage: isImg,
      tamanyo: d.tamanyo || 0,
    };
  });

  // ── 3. Presupuestos con firma/documento adjunto ──
  const docsPresup = presupData.filter(p => p.firma_url).map(p => ({
    _cat: 'presupuestos',
    _source: 'presupuesto',
    url: p.firma_url,
    nombre: `${p.numero || 'Presupuesto'} — Doc. firmado`,
    subtitulo: `${p.cliente_nombre || '—'} · ${p.fecha || '—'} · ${fmtE(p.total||0)}`,
    fecha: p.fecha || p.created_at || '',
    ico: '📋',
    isImage: false,
  }));

  // ── 4. Combinar todo ──
  const todosItems = [...fotosPartes, ...docsClasificados, ...docsPresup];

  // Contadores por categoría
  const counts = { todos: todosItems.length, fotos: 0, presupuestos: 0, albaranes: 0, facturas: 0, otros: 0 };
  todosItems.forEach(d => { if (counts[d._cat] !== undefined) counts[d._cat]++; });
  // Reclasificar docs que no son fotos ni presupuestos
  docsClasificados.filter(d => d._cat === 'otros').forEach(() => counts.otros++);

  // ── 5. Tabs de filtro ──
  const tabs = [
    { key:'todos',        label:'Todos',        ico:'📁' },
    { key:'fotos',        label:'Fotos',        ico:'📷' },
    { key:'presupuestos', label:'Presupuestos', ico:'📋' },
    { key:'albaranes',    label:'Albaranes',    ico:'📄' },
    { key:'facturas',     label:'Facturas',     ico:'🧾' },
    { key:'otros',        label:'Otros',        ico:'📎' },
  ];

  const tabsHtml = tabs.map(t => {
    const cnt = counts[t.key] || 0;
    return `<button class="btn btn-sm" id="docTab-${t.key}" onclick="filtrarObraDocs('${t.key}')"
      style="font-size:11px;padding:4px 10px;border-radius:16px;border:1px solid var(--gris-200);background:${_obraDocFilter===t.key?'var(--azul)':'#fff'};color:${_obraDocFilter===t.key?'#fff':'var(--gris-600)'};font-weight:600;cursor:pointer;transition:none">
      ${t.ico} ${t.label} <span style="opacity:.7;font-size:10px">${cnt}</span>
    </button>`;
  }).join('');

  // ── 6. Formulario de subida ──
  const uploadForm = `
    <div style="margin:10px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <select id="obraDocTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <option value="foto">📷 Foto</option><option value="plano">📐 Plano</option><option value="certificado">📜 Certificado</option>
        <option value="manual">📖 Manual</option><option value="garantia">🛡️ Garantía</option><option value="contrato">📋 Contrato</option><option value="otro">📄 Otro</option>
      </select>
      <input id="obraDocNombre" placeholder="Nombre..." style="flex:1;min-width:120px;padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
      <label class="btn btn-primary btn-sm" for="obraDocFile" style="cursor:pointer;font-size:11px">📎 Subir documento</label>
      <input type="file" id="obraDocFile" style="display:none" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" onchange="subirDocObra(this)">
    </div>`;

  // Guardar items para filtrado rápido sin recargar ficha
  window._obraDocsItems = todosItems;

  // ── 7. Renderizar items filtrados ──
  const filtrados = _obraDocFilter === 'todos' ? todosItems : todosItems.filter(d => d._cat === _obraDocFilter);

  let itemsHtml = '';
  if (filtrados.length === 0) {
    itemsHtml = '<div style="color:var(--gris-400);font-size:12.5px;padding:30px 0;text-align:center">Sin documentos en esta categoría</div>';
  } else {
    // ¿Es vista de fotos? → galería tipo grid
    const vistaFotos = (_obraDocFilter === 'fotos' || (_obraDocFilter === 'todos' && filtrados.every(d => d.isImage)));
    const soloFotos = filtrados.filter(d => d.isImage);
    const noFotos = filtrados.filter(d => !d.isImage);

    // Galería de fotos
    if (soloFotos.length > 0) {
      itemsHtml += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px">`;
      soloFotos.forEach(f => {
        const deleteBtn = f._source === 'doc' && f.id
          ? `<button onclick="event.stopPropagation();eliminarDocObra(${f.id})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;display:none" class="doc-del-btn">✕</button>`
          : '';
        itemsHtml += `
          <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--gris-200);cursor:pointer;aspect-ratio:1"
               onclick="window.open('${f.url}','_blank')"
               onmouseenter="showImgPreview('${f.url}',event);this.querySelector('.doc-del-btn')&&(this.querySelector('.doc-del-btn').style.display='block')"
               onmousemove="moveImgPreview(event)"
               onmouseleave="hideImgPreview();this.querySelector('.doc-del-btn')&&(this.querySelector('.doc-del-btn').style.display='none')">
            <img src="${f.url}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:var(--gris-50);color:var(--gris-400);font-size:28px;position:absolute;inset:0">📷</div>
            ${deleteBtn}
            <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));padding:6px 8px 5px;color:#fff;font-size:10px;line-height:1.3">
              <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nombre}</div>
              <div style="opacity:.8">${f.subtitulo}${f.tamanyo ? ' · ' + fmtBytes(f.tamanyo) : ''}</div>
            </div>
          </div>`;
      });
      itemsHtml += '</div>';
    }

    // Lista de documentos no-imagen
    if (noFotos.length > 0) {
      noFotos.forEach(d => {
        const deleteBtn = d._source === 'doc' && d.id
          ? `<button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="event.stopPropagation();eliminarDocObra(${d.id})">🗑️</button>`
          : '';
        itemsHtml += `
          <div class="ficha-doc-row" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--gris-100);cursor:pointer;border-radius:6px" onclick="window.open('${d.url}','_blank')">
            <span style="font-size:18px">${d.ico || '📄'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.nombre}</div>
              <div style="font-size:10.5px;color:var(--gris-400)">${d.subtitulo}</div>
            </div>
            ${d.tamanyo ? '<span style="font-size:10px;color:var(--gris-400);white-space:nowrap">' + fmtBytes(d.tamanyo) + '</span>' : ''}
            <a href="${d.url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:10.5px;padding:3px 7px" onclick="event.stopPropagation()">👁️</a>
            ${deleteBtn}
          </div>`;
      });
    }
  }

  container.innerHTML = `
    <div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${tabsHtml}</div>
      ${uploadForm}
      <div id="obraDocsContent">${itemsHtml}</div>
    </div>`;
}

function _renderDocsItems(filtrados, cat) {
  if (filtrados.length === 0) return '<div style="color:var(--gris-400);font-size:12.5px;padding:30px 0;text-align:center">Sin documentos en esta categoría</div>';
  let html = '';
  const soloFotos = filtrados.filter(d => d.isImage);
  const noFotos = filtrados.filter(d => !d.isImage);
  if (soloFotos.length > 0) {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px">';
    soloFotos.forEach(f => {
      const deleteBtn = f._source === 'doc' && f.id
        ? `<button onclick="event.stopPropagation();eliminarDocObra(${f.id})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;display:none" class="doc-del-btn">✕</button>`
        : '';
      html += `<div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--gris-200);cursor:pointer;aspect-ratio:1" onclick="window.open('${f.url}','_blank')" onmouseenter="showImgPreview('${f.url}',event);this.querySelector('.doc-del-btn')&&(this.querySelector('.doc-del-btn').style.display='block')" onmousemove="moveImgPreview(event)" onmouseleave="hideImgPreview();this.querySelector('.doc-del-btn')&&(this.querySelector('.doc-del-btn').style.display='none')">
        <img src="${f.url}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:var(--gris-50);color:var(--gris-400);font-size:28px;position:absolute;inset:0">📷</div>
        ${deleteBtn}
        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));padding:6px 8px 5px;color:#fff;font-size:10px;line-height:1.3">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nombre}</div>
          <div style="opacity:.8">${f.subtitulo}${f.tamanyo ? ' · ' + fmtBytes(f.tamanyo) : ''}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }
  if (noFotos.length > 0) {
    noFotos.forEach(d => {
      const deleteBtn = d._source === 'doc' && d.id
        ? `<button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="event.stopPropagation();eliminarDocObra(${d.id})">🗑️</button>`
        : '';
      html += `<div class="ficha-doc-row" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--gris-100);cursor:pointer;border-radius:6px" onclick="window.open('${d.url}','_blank')">
        <span style="font-size:18px">${d.ico || '📄'}</span>
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.nombre}</div><div style="font-size:10.5px;color:var(--gris-400)">${d.subtitulo}</div></div>
        ${d.tamanyo ? '<span style="font-size:10px;color:var(--gris-400);white-space:nowrap">' + fmtBytes(d.tamanyo) + '</span>' : ''}
        <a href="${d.url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:10.5px;padding:3px 7px" onclick="event.stopPropagation()">👁️</a>
        ${deleteBtn}
      </div>`;
    });
  }
  return html;
}

function filtrarObraDocs(cat) {
  _obraDocFilter = cat;
  // Actualizar botones de filtro activo
  document.querySelectorAll('[id^="docTab-"]').forEach(b => {
    const key = b.id.replace('docTab-','');
    b.style.background = key === cat ? 'var(--azul)' : '#fff';
    b.style.color = key === cat ? '#fff' : 'var(--gris-600)';
  });
  // Filtrar items directamente sin recargar la ficha
  const contentEl = document.getElementById('obraDocsContent');
  if (!contentEl || !window._obraDocsItems) return;
  const items = window._obraDocsItems;
  const filtrados = cat === 'todos' ? items : items.filter(d => d._cat === cat);
  contentEl.innerHTML = _renderDocsItems(filtrados, cat);
}

// ═══════════════════════════════════════════════
// PESTAÑAS DE LA FICHA
// ═══════════════════════════════════════════════
const OBRA_TAB_TITLES = {seguimiento:'✅ Seguimiento',partes:'📝 Partes de trabajo',presupuestos:'📋 Presupuestos',facturacion:'🧾 Facturación',documentos:'📎 Documentos',materiales:'📦 Materiales',mensajes:'💬 Mensajes',historial:'🕐 Historial'};
const OBRA_TABS = ['seguimiento','partes','presupuestos','facturacion','documentos','materiales','mensajes','historial'];
const OBRA_KPI_TO_TAB = {seguimiento:'seguimiento',partes:'partes',presupuestos:'presupuestos',facturacion:'facturacion',documentos:'documentos',materiales:'materiales',mensajes:'mensajes',historial:'historial'};
const OBRA_ALL_KPIS = ['seguimiento','partes','presupuestos','facturacion','documentos','materiales','mensajes','historial'];

let _facturacionFiltro = 'todos'; // 'todos','albaranes','facturas'

function obraTab(tab, filtro) {
  // Si se llama con un tab que es KPI (albaranes/facturas), resolver al tab real
  const tabReal = OBRA_KPI_TO_TAB[tab] || tab;
  obraTabActual = tabReal;

  // Mostrar/ocultar secciones de contenido
  OBRA_TABS.forEach(t => {
    const el = document.getElementById('obra-hist-'+t);
    if (el) el.style.display = t===tabReal?'block':'none';
  });

  // Activar KPI correcto
  OBRA_ALL_KPIS.forEach(k => {
    const kpi = document.getElementById('okpi-'+k);
    if (kpi) {
      const kpiTab = OBRA_KPI_TO_TAB[k] || k;
      kpi.classList.toggle('ficha-kpi-active', kpiTab===tabReal);
    }
  });

  // Título del panel
  const titulo = document.getElementById('fichaObraHistTitulo');
  if (titulo) titulo.textContent = OBRA_TAB_TITLES[tabReal] || tabReal;

  // Filtro interno de facturación
  if (tabReal === 'facturacion' && filtro) {
    _facturacionFiltro = filtro;
    aplicarFiltroFacturacion();
  }
}

// ═══════════════════════════════════════════════
// GESTOR DE TAREAS DE OBRA
// ═══════════════════════════════════════════════
let obraTareasData = [];

const TAREA_ESTADOS = {
  pendiente:  { label:'Pendiente',  color:'#D97706', bg:'#FFFBEB', ico:'⏳' },
  en_curso:   { label:'En curso',   color:'#2563EB', bg:'#EFF6FF', ico:'🔄' },
  completada: { label:'Completada', color:'#059669', bg:'#ECFDF5', ico:'✔️' },
  bloqueada:  { label:'Bloqueada',  color:'#DC2626', bg:'#FEF2F2', ico:'🚫' },
  rechazada:  { label:'Rechazada',  color:'#9333EA', bg:'#FAF5FF', ico:'✖️' },
};

const TAREA_PRIORIDADES = {
  baja:    { label:'Baja',    color:'#6B7280', ico:'▽' },
  normal:  { label:'Normal',  color:'#2563EB', ico:'◆' },
  alta:    { label:'Alta',    color:'#D97706', ico:'▲' },
  urgente: { label:'Urgente', color:'#DC2626', ico:'🔺' },
};

const TAREA_PLANTILLAS = [
  { texto:'Revisar presupuesto con el cliente', prioridad:'alta' },
  { texto:'Pedir material necesario', prioridad:'alta' },
  { texto:'Programar fecha de visita', prioridad:'alta' },
  { texto:'Fotos antes del trabajo', prioridad:'normal' },
  { texto:'Ejecutar instalación', prioridad:'normal' },
  { texto:'Fotos después del trabajo', prioridad:'normal' },
  { texto:'Recoger firma del cliente', prioridad:'normal' },
  { texto:'Crear albarán de entrega', prioridad:'alta' },
  { texto:'Retirar escombros / limpieza', prioridad:'baja' },
  { texto:'Verificar funcionamiento', prioridad:'alta' },
];

function renderObraTareas() {
  const container = document.getElementById('obra-hist-seguimiento');
  if (!container) return;

  // Separar por estado
  const pendientes = obraTareasData.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso' || t.estado === 'bloqueada');
  const completadas = obraTareasData.filter(t => t.estado === 'completada');
  const progreso = obraTareasData.length ? Math.round((completadas.length / obraTareasData.length) * 100) : 0;

  // Barra de progreso
  let html = `<div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:12px;font-weight:700;color:var(--gris-600)">${completadas.length} de ${obraTareasData.length} completadas</span>
      <span style="font-size:13px;font-weight:800;color:${progreso===100?'#059669':'var(--azul)'}">${progreso}%</span>
    </div>
    <div style="height:8px;background:var(--gris-100);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${progreso}%;background:${progreso===100?'linear-gradient(90deg,#34D399,#059669)':'linear-gradient(90deg,#60A5FA,#2563EB)'};border-radius:4px;transition:width .5s"></div>
    </div>
  </div>`;

  // Formulario de añadir tarea
  html += `<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:end">
    <input id="obraTareaTexto" placeholder="Nueva tarea..." style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:12.5px;outline:none;font-family:var(--font)" onkeydown="if(event.key==='Enter'){event.preventDefault();guardarTareaObra()}">
    <select id="obraTareaPrio" style="padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
      <option value="normal">◆ Normal</option>
      <option value="alta">▲ Alta</option>
      <option value="urgente">🔺 Urgente</option>
      <option value="baja">▽ Baja</option>
    </select>
    <select id="obraTareaResp" style="padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none;max-width:140px">
      <option value="">Sin asignar</option>
    </select>
    <input id="obraTareaFecha" type="date" style="padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
    <button class="btn btn-primary btn-sm" onclick="guardarTareaObra()" style="font-size:11.5px;white-space:nowrap">+ Añadir</button>
  </div>`;

  // Plantillas rápidas
  html += `<div style="margin-bottom:14px">
    <details>
      <summary style="font-size:11px;color:var(--gris-400);cursor:pointer;user-select:none;font-weight:600">💡 Tareas predefinidas (clic para desplegar)</summary>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
        ${TAREA_PLANTILLAS.map(p => {
          const yaExiste = obraTareasData.some(t => t.texto === p.texto);
          return yaExiste
            ? `<button disabled style="background:var(--gris-100);border:1px solid var(--gris-200);padding:4px 8px;border-radius:6px;font-size:10.5px;color:var(--gris-300);text-decoration:line-through;cursor:default">${p.texto}</button>`
            : `<button onclick="addTareaPlantilla('${p.texto.replace(/'/g,"\\'")}','${p.prioridad}')" class="hov-bg-azul" style="background:var(--gris-50);border:1px solid var(--gris-200);padding:4px 8px;border-radius:6px;font-size:10.5px;cursor:pointer;color:var(--gris-600)" >${p.texto}</button>`;
        }).join('')}
      </div>
      <div style="margin-top:8px;text-align:right">
        <button onclick="cargarTodasPlantillas()" class="btn btn-sm" style="font-size:10.5px;background:var(--violeta);color:#fff;border:none;border-radius:6px;padding:5px 12px;cursor:pointer">📋 Cargar todas las plantillas</button>
      </div>
    </details>
  </div>`;

  // Separar tareas activas, completadas y rechazadas
  const rechazadas = obraTareasData.filter(t => t.estado === 'rechazada');
  const activas = obraTareasData.filter(t => t.estado !== 'completada' && t.estado !== 'rechazada');

  // Lista de tareas activas
  if (activas.length) {
    html += activas.map(t => renderTareaItem(t)).join('');
  } else if (!completadas.length && !rechazadas.length) {
    html += `<div style="text-align:center;padding:30px 0;color:var(--gris-400)">
      <div style="font-size:32px;margin-bottom:8px">✅</div>
      <p style="font-size:13px">Sin tareas. Añade una arriba o usa las plantillas.</p>
    </div>`;
  }

  // Tareas completadas (colapsable)
  if (completadas.length) {
    html += `<details style="margin-top:12px" ${activas.length ? '' : 'open'}>
      <summary style="font-size:11.5px;color:var(--gris-400);cursor:pointer;user-select:none;font-weight:700;padding:6px 0;border-top:1px solid var(--gris-100)">
        ✔️ ${completadas.length} tarea${completadas.length>1?'s':''} completada${completadas.length>1?'s':''}
      </summary>
      <div style="opacity:0.7">${completadas.map(t => renderTareaItem(t)).join('')}</div>
    </details>`;
  }

  // Tareas rechazadas (colapsable)
  if (rechazadas.length) {
    html += `<details style="margin-top:8px">
      <summary style="font-size:11.5px;color:#9333EA;cursor:pointer;user-select:none;font-weight:700;padding:6px 0;border-top:1px solid var(--gris-100)">
        ✖️ ${rechazadas.length} tarea${rechazadas.length>1?'s':''} rechazada${rechazadas.length>1?'s':''}
      </summary>
      <div style="opacity:0.6">${rechazadas.map(t => renderTareaItem(t)).join('')}</div>
    </details>`;
  }

  container.innerHTML = html;

  // Poblar select de responsables
  poblarSelectResponsables();
}

function renderTareaItem(t) {
  const est = TAREA_ESTADOS[t.estado] || TAREA_ESTADOS.pendiente;
  const prio = TAREA_PRIORIDADES[t.prioridad] || TAREA_PRIORIDADES.normal;
  const isCerrada = t.estado === 'completada' || t.estado === 'rechazada';
  const vencida = t.fecha_limite && !isCerrada && new Date(t.fecha_limite) < new Date();
  const hoy = t.fecha_limite && new Date(t.fecha_limite).toDateString() === new Date().toDateString();
  const fechaCreacion = t.created_at ? new Date(t.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'short'}) : '';

  return `<div data-tarea-resp="${t.responsable_id||''}" style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--gris-100);${isCerrada?'text-decoration:line-through;opacity:0.6':''}">
    <!-- Checkbox -->
    <div onclick="toggleTareaObra(${t.id})" style="cursor:pointer;width:22px;height:22px;border-radius:6px;border:2px solid ${t.estado==='completada'?'#059669':t.estado==='rechazada'?'#9333EA':'var(--gris-300)'};background:${t.estado==='completada'?'#ECFDF5':t.estado==='rechazada'?'#FAF5FF':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${t.estado==='completada'?'<span style="color:#059669;font-size:13px;font-weight:800">✓</span>':t.estado==='rechazada'?'<span style="color:#9333EA;font-size:13px;font-weight:800">✕</span>':''}</div>
    <!-- Contenido -->
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;font-weight:600;line-height:1.4;color:${isCerrada?'var(--gris-400)':'var(--gris-800)'}">${t.texto}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px;align-items:center">
        <span style="font-size:10px;color:${prio.color};font-weight:700">${prio.ico} ${prio.label}</span>
        ${t.responsable_nombre ? `<span style="font-size:10px;background:var(--gris-100);padding:1px 6px;border-radius:4px;color:var(--gris-600)">👤 ${t.responsable_nombre}</span>` : ''}
        ${t.fecha_limite ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600;${vencida?'background:#FEF2F2;color:#DC2626':hoy?'background:#FFFBEB;color:#D97706':'background:var(--gris-50);color:var(--gris-500)'}">📅 ${new Date(t.fecha_limite).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}${vencida?' ¡Vencida!':hoy?' Hoy':''}</span>` : ''}
        ${fechaCreacion ? `<span style="font-size:9px;color:var(--gris-300)">Creada ${fechaCreacion}</span>` : ''}
      </div>
    </div>
    <!-- Acciones -->
    <div style="display:flex;gap:2px;flex-shrink:0;align-items:center">
      <select onchange="cambiarEstadoTarea(${t.id},this.value)" style="padding:2px 4px;border:1px solid var(--gris-200);border-radius:4px;font-size:10px;cursor:pointer;background:${est.bg};color:${est.color};font-weight:700;outline:none">
        ${Object.entries(TAREA_ESTADOS).map(([k,v])=>`<option value="${k}" ${k===t.estado?'selected':''}>${v.ico} ${v.label}</option>`).join('')}
      </select>
      <button onclick="editarTareaObra(${t.id})" style="background:none;border:none;cursor:pointer;color:var(--gris-400);font-size:13px;padding:2px 4px" title="Editar tarea">✏️</button>
    </div>
  </div>`;
}

async function poblarSelectResponsables() {
  const sel = document.getElementById('obraTareaResp');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Sin asignar</option>';
  // Cargar todos los perfiles de la empresa
  try {
    const { data } = await sb.from('perfiles').select('id,nombre,apellidos').eq('empresa_id',EMPRESA.id);
    if (data && data.length) {
      data.forEach(u => {
        const nombre = ((u.nombre||'')+ ' '+(u.apellidos||'')).trim() || 'Sin nombre';
        sel.innerHTML += `<option value="${u.id}">${nombre}</option>`;
      });
    } else if (CP) {
      sel.innerHTML += `<option value="${CU?.id||''}">${CP.nombre||''} ${CP.apellidos||''}</option>`;
    }
  } catch(e) {
    if (CP) sel.innerHTML += `<option value="${CU?.id||''}">${CP.nombre||''} ${CP.apellidos||''}</option>`;
  }
  sel.value = current;
}

async function guardarTareaObra() {
  if (_creando) return;
  _creando = true;
  try {
    if (!obraActualId) return;
    const texto = document.getElementById('obraTareaTexto')?.value?.trim();
    if (!texto) { toast('Escribe la tarea','error'); return; }

    const prioridad = document.getElementById('obraTareaPrio')?.value || 'normal';
    const responsable_id = document.getElementById('obraTareaResp')?.value || null;
    const fecha_limite = document.getElementById('obraTareaFecha')?.value || null;

    // Buscar nombre del responsable desde el select
    let responsable_nombre = '';
    if (responsable_id) {
      const selResp = document.getElementById('obraTareaResp');
      if (selResp) {
        const opt = selResp.querySelector(`option[value="${responsable_id}"]`);
        if (opt) responsable_nombre = opt.textContent.trim();
      }
    }

    const payload = {
      empresa_id: EMPRESA.id,
      trabajo_id: obraActualId,
      texto,
      estado: 'pendiente',
      prioridad,
      responsable_id: responsable_id || null,
      responsable_nombre: responsable_nombre || null,
      fecha_limite: fecha_limite || null,
      creado_por: CU?.id || null,
      creado_por_nombre: CP ? (CP.nombre||'')+' '+(CP.apellidos||'') : null,
    };

    const { data, error } = await sb.from('tareas_obra').insert(payload).select().single();
    if (error) {
      // Si la tabla no existe, guardar en local temporalmente
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        const localTarea = { id: Date.now(), ...payload, created_at: new Date().toISOString() };
        obraTareasData.push(localTarea);
        toast('Tarea añadida (modo local) ✓','info');
      } else {
        toast('Error: '+error.message,'error'); return;
      }
    } else {
      obraTareasData.push(data);
      toast('Tarea añadida ✓','success');
    }
    await registrarActividadObra(obraActualId, 'Tarea añadida', `✅ ${texto} | Prioridad: ${prioridad}${responsable_nombre ? ' | Resp: '+responsable_nombre : ''}${fecha_limite ? ' | Límite: '+fecha_limite : ''}`);

    // Limpiar input
    document.getElementById('obraTareaTexto').value = '';
    document.getElementById('obraTareaFecha').value = '';
    updateTareasKpi();
    renderObraTareas();
    if (typeof loadDashboard === 'function') loadDashboard();
  } finally {
    _creando = false;
  }
}

function addTareaPlantilla(texto, prioridad) {
  // Verificar si ya existe
  if (obraTareasData.some(t => t.texto === texto)) {
    toast('Esa tarea ya existe','info'); return;
  }
  // Rellenar formulario sin guardar — el usuario ajusta fecha/responsable/prioridad y pulsa Añadir
  const inp = document.getElementById('obraTareaTexto');
  if (inp) { inp.value = texto; inp.focus(); inp.scrollIntoView({behavior:'smooth',block:'center'}); }
  document.getElementById('obraTareaPrio').value = prioridad;
  toast('Plantilla cargada — ajusta los campos y pulsa Añadir','info');
}

/* Cargar TODAS las plantillas de golpe (las que no existan aún) */
async function cargarTodasPlantillas() {
  if (!obraActualId) return;
  let count = 0;
  for (const p of TAREA_PLANTILLAS) {
    if (obraTareasData.some(t => t.texto === p.texto)) continue;
    const payload = {
      empresa_id: EMPRESA.id,
      trabajo_id: obraActualId,
      texto: p.texto,
      estado: 'pendiente',
      prioridad: p.prioridad,
      responsable_id: null,
      responsable_nombre: null,
      fecha_limite: null,
      creado_por: CU?.id || null,
      creado_por_nombre: CP ? (CP.nombre||'')+' '+(CP.apellidos||'') : null,
    };
    const { data, error } = await sb.from('tareas_obra').insert(payload).select().single();
    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        obraTareasData.push({ id: Date.now()+count, ...payload, created_at: new Date().toISOString() });
      }
    } else {
      obraTareasData.push(data);
    }
    count++;
  }
  if (count) {
    await registrarActividadObra(obraActualId, 'Plantillas de tareas cargadas', `📋 ${count} tarea(s) añadida(s) desde plantilla`);
    toast(`${count} tareas añadidas ✓`,'success');
    updateTareasKpi();
    renderObraTareas();
  } else {
    toast('Todas las plantillas ya existen','info');
  }
}

async function toggleTareaObra(id) {
  const tarea = obraTareasData.find(t => t.id === id);
  if (!tarea) return;
  // Si está completada o rechazada → reabrir como pendiente; si no → completar
  const nuevoEstado = (tarea.estado === 'completada' || tarea.estado === 'rechazada') ? 'pendiente' : 'completada';

  const { error } = await sb.from('tareas_obra').update({ estado: nuevoEstado, completada_at: nuevoEstado === 'completada' ? new Date().toISOString() : null }).eq('id', id);
  if (error && !(error.code === '42P01' || error.message?.includes('does not exist'))) {
    toast('Error: '+error.message,'error'); return;
  }
  const estadoAnterior = tarea.estado;
  tarea.estado = nuevoEstado;
  tarea.completada_at = nuevoEstado === 'completada' ? new Date().toISOString() : null;
  const accion = nuevoEstado === 'completada' ? 'Tarea completada' : 'Tarea reabierta';
  await registrarActividadObra(obraActualId, accion, `${nuevoEstado === 'completada' ? '✅' : '🔄'} "${tarea.texto}" — ${estadoAnterior} → ${nuevoEstado}`);
  updateTareasKpi();
  renderObraTareas();
  if (typeof loadDashboard === 'function') loadDashboard();
}

async function cambiarEstadoTarea(id, nuevoEstado) {
  const tarea = obraTareasData.find(t => t.id === id);
  if (!tarea) return;
  const estadoAnterior = tarea.estado;

  const updateData = { estado: nuevoEstado };
  if (nuevoEstado === 'completada') updateData.completada_at = new Date().toISOString();
  else if (estadoAnterior === 'completada') updateData.completada_at = null;

  const { error } = await sb.from('tareas_obra').update(updateData).eq('id', id);
  if (error && !(error.code === '42P01' || error.message?.includes('does not exist'))) {
    toast('Error: '+error.message,'error'); return;
  }
  tarea.estado = nuevoEstado;
  if (updateData.completada_at !== undefined) tarea.completada_at = updateData.completada_at;

  const estInfo = TAREA_ESTADOS[nuevoEstado] || {};
  const accion = nuevoEstado === 'rechazada' ? 'Tarea rechazada'
    : nuevoEstado === 'completada' ? 'Tarea completada'
    : 'Estado tarea cambiado';
  await registrarActividadObra(obraActualId, accion, `${estInfo.ico||'🔀'} "${tarea.texto}" — ${estadoAnterior} → ${nuevoEstado}`);
  updateTareasKpi();
  renderObraTareas();
  if (typeof loadDashboard === 'function') loadDashboard();
  toast(`${estInfo.ico||''} Tarea ${estInfo.label?.toLowerCase()||nuevoEstado}`, 'success');
}

function editarTareaObra(id) {
  const tarea = obraTareasData.find(t => t.id === id);
  if (!tarea) return;

  // Eliminar modal anterior si existe
  document.getElementById('modal-editar-tarea')?.remove();

  const fechaVal = tarea.fecha_limite || '';
  const modal = document.createElement('div');
  modal.id = 'modal-editar-tarea';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:100%;max-width:480px;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--gris-100);display:flex;align-items:center;justify-content:space-between">
        <h3 style="margin:0;font-size:15px;font-weight:800">✏️ Editar tarea</h3>
        <button onclick="document.getElementById('modal-editar-tarea').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--gris-400);padding:4px">✕</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;display:block">Descripción</label>
          <textarea id="et-texto" rows="2" style="width:100%;padding:10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;font-family:var(--font);resize:vertical;outline:none">${tarea.texto}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;display:block">Prioridad</label>
            <select id="et-prioridad" style="width:100%;padding:9px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none;cursor:pointer">
              ${Object.entries(TAREA_PRIORIDADES).map(([k,v]) => `<option value="${k}" ${k===tarea.prioridad?'selected':''}>${v.ico} ${v.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;display:block">Fecha límite</label>
            <input id="et-fecha" type="date" value="${fechaVal}" style="width:100%;padding:9px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
          </div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;display:block">Responsable</label>
          <select id="et-responsable" style="width:100%;padding:9px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none;cursor:pointer">
            <option value="">Sin asignar</option>
          </select>
        </div>
        <div style="font-size:10.5px;color:var(--gris-400);display:flex;gap:12px;flex-wrap:wrap">
          <span>Creada: ${tarea.created_at ? new Date(tarea.created_at).toLocaleString('es-ES') : '—'}</span>
          ${tarea.creado_por_nombre ? `<span>Por: ${tarea.creado_por_nombre}</span>` : ''}
          ${tarea.completada_at ? `<span>Completada: ${new Date(tarea.completada_at).toLocaleString('es-ES')}</span>` : ''}
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--gris-100);display:flex;justify-content:flex-end;gap:8px;background:var(--gris-50)">
        <button onclick="document.getElementById('modal-editar-tarea').remove()" style="padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid var(--gris-200);background:#fff;color:var(--gris-600)">Cancelar</button>
        <button onclick="guardarEdicionTarea(${id})" style="padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:var(--azul);color:#fff">💾 Guardar cambios</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Poblar select de responsables en el modal
  (async () => {
    const sel = document.getElementById('et-responsable');
    try {
      const { data } = await sb.from('perfiles').select('id,nombre,apellidos').eq('empresa_id', EMPRESA.id);
      if (data && data.length) {
        data.forEach(u => {
          const nombre = ((u.nombre||'')+' '+(u.apellidos||'')).trim() || 'Sin nombre';
          sel.innerHTML += `<option value="${u.id}">${nombre}</option>`;
        });
      } else if (CP) {
        sel.innerHTML += `<option value="${CU?.id||''}">${CP.nombre||''} ${CP.apellidos||''}</option>`;
      }
    } catch(e) {
      if (CP) sel.innerHTML += `<option value="${CU?.id||''}">${CP.nombre||''} ${CP.apellidos||''}</option>`;
    }
    sel.value = tarea.responsable_id || '';
  })();

  // Focus en el textarea
  setTimeout(() => document.getElementById('et-texto')?.focus(), 100);
}

async function guardarEdicionTarea(id) {
  const tarea = obraTareasData.find(t => t.id === id);
  if (!tarea) return;

  const nuevoTexto = document.getElementById('et-texto')?.value?.trim();
  const nuevaPrioridad = document.getElementById('et-prioridad')?.value;
  const nuevaFecha = document.getElementById('et-fecha')?.value || null;
  const nuevoRespId = document.getElementById('et-responsable')?.value || null;
  const nuevoRespNombre = nuevoRespId ? document.getElementById('et-responsable')?.selectedOptions[0]?.textContent?.trim() : null;

  if (!nuevoTexto) { toast('El texto no puede estar vacío','error'); return; }

  // Detectar qué ha cambiado para el registro
  const cambios = [];
  if (nuevoTexto !== tarea.texto) cambios.push(`texto: "${tarea.texto}" → "${nuevoTexto}"`);
  if (nuevaPrioridad !== tarea.prioridad) cambios.push(`prioridad: ${tarea.prioridad} → ${nuevaPrioridad}`);
  if ((nuevaFecha||null) !== (tarea.fecha_limite||null)) cambios.push(`fecha límite: ${tarea.fecha_limite||'sin fecha'} → ${nuevaFecha||'sin fecha'}`);
  if ((nuevoRespId||null) !== (tarea.responsable_id||null)) cambios.push(`responsable: ${tarea.responsable_nombre||'sin asignar'} → ${nuevoRespNombre||'sin asignar'}`);

  if (!cambios.length) {
    document.getElementById('modal-editar-tarea')?.remove();
    return;
  }

  const updateData = {
    texto: nuevoTexto,
    prioridad: nuevaPrioridad,
    fecha_limite: nuevaFecha,
    responsable_id: nuevoRespId,
    responsable_nombre: nuevoRespNombre,
  };

  const { error } = await sb.from('tareas_obra').update(updateData).eq('id', id);
  if (error && !(error.code === '42P01' || error.message?.includes('does not exist'))) {
    toast('Error: '+error.message,'error'); return;
  }

  // Actualizar datos locales
  tarea.texto = nuevoTexto;
  tarea.prioridad = nuevaPrioridad;
  tarea.fecha_limite = nuevaFecha;
  tarea.responsable_id = nuevoRespId;
  tarea.responsable_nombre = nuevoRespNombre;

  await registrarActividadObra(obraActualId, 'Tarea editada', `✏️ ${cambios.join(' | ')}`);

  document.getElementById('modal-editar-tarea')?.remove();
  renderObraTareas();
  if (typeof loadDashboard === 'function') loadDashboard();
  toast('Tarea editada ✓', 'success');
}

function updateTareasKpi() {
  const el = document.getElementById('ok-seguimiento');
  if (el) {
    const sinRechazadas = obraTareasData.filter(t => t.estado !== 'rechazada');
    const completadas = sinRechazadas.filter(t => t.estado === 'completada').length;
    const total = sinRechazadas.length;
    el.textContent = total ? `${completadas}/${total}` : '0';
  }
}

// Filtro de tareas por usuario en pestaña Seguimiento
let _tareaFiltroActual = 'todos';

function filtrarTareasUsuario(uid) {
  _tareaFiltroActual = uid;
  // Mostrar/ocultar items de tarea basándose en data-resp-id
  document.querySelectorAll('[data-tarea-resp]').forEach(el => {
    const respId = el.dataset.tareaResp || '';
    if (uid === 'todos') {
      el.style.display = '';
    } else if (uid === 'sin_asignar') {
      el.style.display = !respId ? '' : 'none';
    } else {
      el.style.display = respId === uid ? '' : 'none';
    }
  });
  // Actualizar botones activos
  document.querySelectorAll('#tareasFiltroUsuario button').forEach(b => {
    const isActive = b.dataset.tfilt === uid;
    b.style.background = isActive ? 'var(--azul)' : '#fff';
    b.style.color = isActive ? '#fff' : 'var(--gris-600)';
  });
}

// Checkboxes de albaranes para facturación múltiple
function actualizarBtnFacturarSeleccionados() {
  const checks = document.querySelectorAll('.alb-check:checked');
  const btn = document.getElementById('btnFacturarSeleccionados');
  if (btn) {
    const n = checks.length;
    btn.style.opacity = n >= 1 ? '1' : '.5';
    btn.style.pointerEvents = n >= 1 ? 'auto' : 'none';
    btn.textContent = n > 0 ? `🧾 Facturar ${n} albarán${n>1?'es':''} seleccionado${n>1?'s':''}` : '🧾 Facturar albaranes seleccionados';
  }
}

function obraFacturarAlbSeleccionados() {
  const checks = document.querySelectorAll('.alb-check:checked');
  const ids = Array.from(checks).map(c => parseInt(c.dataset.albId));
  if (ids.length === 0) { toast('Selecciona al menos un albarán','warning'); return; }
  // Reutilizar la función existente de facturar múltiples albaranes
  if (typeof obraFacturarAlbaranesMultiples === 'function') {
    obraFacturarAlbaranesMultiples(ids);
  } else if (typeof obraFacturarTodosAlb === 'function') {
    // Fallback: usar la existente pasando los IDs seleccionados
    window._albIdsSeleccionados = ids;
    obraFacturarTodosAlb();
  }
}

// Filtro interno de la pestaña Facturación
function filtrarFacturacion(filtro) {
  _facturacionFiltro = filtro;
  aplicarFiltroFacturacion();
}

function aplicarFiltroFacturacion() {
  const albEl = document.getElementById('_fac_alb');
  const factEl = document.getElementById('_fac_fact');
  if (!albEl || !factEl) return;
  albEl.style.display = (_facturacionFiltro === 'facturas') ? 'none' : '';
  factEl.style.display = (_facturacionFiltro === 'albaranes') ? 'none' : '';
  // Actualizar botones activos
  document.querySelectorAll('#facturacionFiltros button').forEach(b => {
    const isActive = b.dataset.filt === _facturacionFiltro;
    b.style.background = isActive ? 'var(--azul)' : 'var(--gris-100)';
    b.style.color = isActive ? '#fff' : 'var(--gris-600)';
    b.style.fontWeight = isActive ? '700' : '500';
  });
}

// ═══════════════════════════════════════════════
// MATERIALES — Pedidos a proveedor y salidas de almacén
// ═══════════════════════════════════════════════
let _materialesFiltro = 'todos';

function filtrarMateriales(tipo) {
  _materialesFiltro = tipo;
  document.querySelectorAll('[data-matfilt]').forEach(b => {
    const isActive = b.dataset.matfilt === tipo;
    b.style.background = isActive ? 'var(--azul)' : '#fff';
    b.style.color = isActive ? '#fff' : 'var(--gris-600)';
  });
  // TODO: Filtrar lista de movimientos cuando se implemente la tabla
}

function nuevoPedidoProveedorObra() {
  if (!obraActualId) return;
  toast('Funcionalidad de pedido a proveedor en desarrollo', 'info');
  // TODO: Abrir modal de nuevo pedido a proveedor vinculado a la obra
}

function nuevaSalidaAlmacenObra() {
  if (!obraActualId) return;
  toast('Funcionalidad de salida de almacén en desarrollo', 'info');
  // TODO: Abrir modal de salida de almacén vinculado a la obra
}

// ═══════════════════════════════════════════════
// FILTRO DE HISTORIAL (audit log)
// ═══════════════════════════════════════════════
let _historialFiltro = 'todos';

function filtrarHistorial(tipo) {
  _historialFiltro = tipo;
  const timeline = window._obraTimeline || [];
  const isSuperadmin = window._obraIsSuperadmin || false;
  const filtrados = tipo === 'todos' ? timeline : timeline.filter(e => e.tipo === tipo);

  const _fmtAudit = (d) => new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const _accionIco = (a) => {
    const al = (a||'').toLowerCase();
    if (al.includes('crear') || al.includes('creada') || al.includes('nuevo')) return '🆕';
    if (al.includes('editar') || al.includes('modific')) return '✏️';
    if (al.includes('estado')) return '🔄';
    if (al.includes('nota')) return '💬';
    if (al.includes('factura')) return '🧾';
    if (al.includes('albar')) return '📄';
    if (al.includes('presup')) return '📋';
    if (al.includes('parte')) return '📝';
    if (al.includes('document') || al.includes('subido')) return '📎';
    if (al.includes('eliminar') || al.includes('borrar')) return '🗑️';
    if (al.includes('aprobar') || al.includes('aceptar')) return '✅';
    return '📝';
  };

  const html = filtrados.length ? filtrados.map(e => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gris-100);align-items:flex-start">
      <div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:${
        e.tipo==='crear'?'#DBEAFE': e.tipo==='documento'?'#F3E8FF':
        e.tipo==='nota'?'#FEF3C7': e.tipo==='presupuesto'?'#DBEAFE':
        e.tipo==='albaran'?'#D1FAE5': e.tipo==='factura'?'#FEE2E2': e.tipo==='compra'?'#FED7AA': '#F3F4F6'
      };display:flex;align-items:center;justify-content:center;font-size:14px">${_accionIco(e.accion)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;font-size:12px">${e.accion}</span>
          <span style="font-size:10px;color:var(--gris-400);white-space:nowrap">${_fmtAudit(e.fecha)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--gris-600);margin-top:2px;overflow-wrap:break-word">${e.detalle}</div>
        <div style="font-size:10px;color:var(--gris-400);margin-top:1px">por ${e.usuario}</div>
      </div>
      ${isSuperadmin && e.id ? `<button onclick="eliminarAuditEntry(${e.id})" style="background:none;border:none;cursor:pointer;color:var(--gris-300);font-size:12px;padding:2px" title="Eliminar (solo superadmin)">🗑️</button>` : ''}
    </div>
  `).join('') : '<div style="color:var(--gris-400);font-size:12.5px;padding:30px 0;text-align:center">Sin eventos en esta categoría</div>';

  const itemsEl = document.getElementById('historialItems');
  if (itemsEl) itemsEl.innerHTML = html;

  // Actualizar botones activos
  document.querySelectorAll('#historialFiltros button').forEach(b => {
    const isActive = b.dataset.hfilt === _historialFiltro;
    b.style.background = isActive ? 'var(--azul)' : '#fff';
    b.style.color = isActive ? '#fff' : 'var(--gris-600)';
  });
}

// ═══════════════════════════════════════════════
// WORKFLOW / PANEL DE ESTADO DE LA OBRA
// ═══════════════════════════════════════════════

const WORKFLOW_ETAPAS = [
  { id:'presupuesto', ico:'📋', label:'Presupuesto', desc:'Crear presupuesto' },
  { id:'aprobado',    ico:'✅', label:'Aprobado',     desc:'Cliente acepta' },
  { id:'material',    ico:'📦', label:'Material',     desc:'Pedir material' },
  { id:'programado',  ico:'📅', label:'Programado',   desc:'Asignar fecha' },
  { id:'ejecucion',   ico:'🔨', label:'En ejecución', desc:'Trabajo en curso' },
  { id:'albaran',     ico:'📄', label:'Albarán',      desc:'Entregar albarán' },
  { id:'factura',     ico:'🧾', label:'Facturado',    desc:'Emitir factura' },
  { id:'cobrado',     ico:'💰', label:'Cobrado',      desc:'Cobro recibido' },
];

function detectarEtapasObra(t, presupData, albData, factData, partesData) {
  const etapas = {};

  // 1. Presupuesto — tiene al menos un presupuesto vinculado
  const tienePresup = presupData.length > 0;
  etapas.presupuesto = tienePresup;

  // 2. Aprobado — algún presupuesto aceptado/aprobado
  const presupAprobado = presupData.some(p =>
    ['aceptado','aprobado','accepted','en_curso'].includes((p.estado||'').toLowerCase())
  );
  etapas.aprobado = presupAprobado;

  // 3. Material — módulo de compras/pedidos pendiente de desarrollar
  //    Por ahora: auto-pasa si hay presupuesto aprobado (no bloquea el workflow)
  etapas.material = presupAprobado;

  // 4. Programado — tiene al menos un parte con estado >= programado (NO borradores)
  const estadosReales = ['programado','en_curso','completado','revisado','facturado'];
  const tienePartesProgramados = partesData.some(p => estadosReales.includes(p.estado));
  etapas.programado = tienePartesProgramados;

  // 5. En ejecución — tiene partes en_curso o superior, o estado de obra en_curso
  const estadosEjecucion = ['en_curso','completado','revisado','facturado'];
  etapas.ejecucion = partesData.some(p => estadosEjecucion.includes(p.estado)) || t.estado === 'en_curso';

  // 6. Albarán — tiene al menos un albarán
  etapas.albaran = albData.length > 0;

  // 7. Factura — tiene al menos una factura
  etapas.factura = factData.length > 0;

  // 8. Cobrado — tiene facturas y TODAS están cobradas
  const factCobradas = factData.length > 0 && factData.every(f =>
    ['cobrada','pagada','paid'].includes((f.estado||'').toLowerCase())
  );
  etapas.cobrado = factCobradas;

  return etapas;
}

function siguientePasoObra(etapas, t) {
  // Devuelve {texto, accion, botonLabel, icono} del siguiente paso lógico
  if (!etapas.presupuesto) return {
    texto: 'Esta obra no tiene presupuesto. Crea uno para empezar el flujo.',
    accion: 'nuevoPresupObraActual()', boton: '📋 Crear presupuesto', prioridad: 'alta'
  };
  if (!etapas.aprobado) return {
    texto: 'El presupuesto está pendiente de aprobación del cliente.',
    accion: null, boton: null, prioridad: 'media',
    tip: 'Cuando el cliente acepte, cambia el estado del presupuesto a "Aceptado"'
  };
  if (!etapas.programado) return {
    texto: 'Presupuesto aprobado. Programa la primera cita con el operario.',
    accion: 'programarCitaObraActual()', boton: '📅 Programar cita', prioridad: 'alta'
  };
  if (!etapas.ejecucion) return {
    texto: 'Obra programada. Cuando empiece el trabajo, registra el avance en los partes.',
    accion: 'nuevoParteObraActual()', boton: '📝 Crear parte de trabajo', prioridad: 'media'
  };
  if (!etapas.albaran) return {
    texto: 'Trabajo en curso. Genera el albarán cuando termines.',
    accion: 'nuevoAlbaranObraActual()', boton: '📄 Crear albarán', prioridad: 'media'
  };
  if (!etapas.factura) return {
    texto: 'Albarán entregado. Emite la factura para cobrar.',
    accion: null, boton: null, prioridad: 'alta',
    tip: 'Ve a Facturas y crea una nueva factura desde el albarán'
  };
  if (!etapas.cobrado) return {
    texto: 'Factura emitida. Pendiente de cobro.',
    accion: null, boton: null, prioridad: 'baja',
    tip: 'Cuando el cliente pague, marca la factura como "Cobrada"'
  };
  return { texto: '¡Obra completada! Todos los pasos finalizados.', accion: null, boton: null, prioridad: 'ok' };
}

function renderObraWorkflow(t, presupData, albData, factData, partesData) {
  const etapas = detectarEtapasObra(t, presupData, albData, factData, partesData);
  const paso = siguientePasoObra(etapas, t);

  // Encontrar la etapa activa actual (la primera no completada)
  let etapaActiva = WORKFLOW_ETAPAS.length; // todas completas por defecto
  for (let i = 0; i < WORKFLOW_ETAPAS.length; i++) {
    if (!etapas[WORKFLOW_ETAPAS[i].id]) { etapaActiva = i; break; }
  }

  // Renderizar barra de progreso
  const barEl = document.getElementById('obraWorkflowBar');
  if (barEl) {
    barEl.innerHTML = WORKFLOW_ETAPAS.map((e, i) => {
      const completada = etapas[e.id];
      const activa = i === etapaActiva;
      const futura = i > etapaActiva;
      let bg, color, border, opacity;
      if (completada) {
        bg = 'linear-gradient(135deg, #ECFDF5, #D1FAE5)';
        color = '#059669';
        border = '2px solid #34D399';
        opacity = '1';
      } else if (activa) {
        bg = 'linear-gradient(135deg, #EFF6FF, #DBEAFE)';
        color = '#2563EB';
        border = '2px solid #60A5FA';
        opacity = '1';
      } else {
        bg = 'var(--gris-50)';
        color = 'var(--gris-400)';
        border = '1px solid var(--gris-200)';
        opacity = '0.6';
      }
      const checkOrNum = completada ? '<span style="font-size:10px">✔</span>' : (activa ? '►' : '');
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;background:${bg};color:${color};border-bottom:${border};opacity:${opacity};transition:background .3s,color .3s,opacity .3s;position:relative;min-width:0" title="${e.desc}">
        <div style="font-size:16px;line-height:1">${e.ico}</div>
        <div style="font-size:9.5px;font-weight:700;margin-top:2px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;padding:0 2px">${e.label}</div>
        <div style="position:absolute;top:3px;right:5px;font-size:8px;font-weight:800">${checkOrNum}</div>
      </div>`;
    }).join('');
  }

  // Renderizar acción siguiente
  const actEl = document.getElementById('obraWorkflowAction');
  if (actEl) {
    const prioColors = { alta: '#DC2626', media: '#D97706', baja: '#6B7280', ok: '#059669' };
    const prioLabels = { alta: 'URGENTE', media: 'PENDIENTE', baja: 'SEGUIMIENTO', ok: 'COMPLETADO' };
    const prioBg = { alta: '#FEF2F2', media: '#FFFBEB', baja: '#F9FAFB', ok: '#ECFDF5' };
    const pc = prioColors[paso.prioridad] || '#6B7280';
    const pl = prioLabels[paso.prioridad] || '';
    const pb = prioBg[paso.prioridad] || '#F9FAFB';

    let html = `<span style="background:${pb};color:${pc};padding:3px 8px;border-radius:6px;font-size:10px;font-weight:800;letter-spacing:.5px;white-space:nowrap">${pl}</span>`;
    html += `<span style="font-size:12.5px;color:var(--gris-700);flex:1">${paso.texto}</span>`;
    if (paso.tip) {
      html += `<span style="font-size:11px;color:var(--gris-400);font-style:italic">💡 ${paso.tip}</span>`;
    }
    if (paso.accion && paso.boton) {
      html += `<button class="btn btn-primary btn-sm" onclick="${paso.accion}" style="white-space:nowrap;font-size:11.5px">${paso.boton}</button>`;
    }
    actEl.innerHTML = html;
  }

  // Calcular progreso porcentual
  const completadas = WORKFLOW_ETAPAS.filter(e => etapas[e.id]).length;
  const porcent = Math.round((completadas / WORKFLOW_ETAPAS.length) * 100);

  // ── AUTO-DERIVAR ESTADO DE LA OBRA ──
  // No auto-derivar si está cerrada manualmente (finalizado) — requiere reabrir explícitamente
  const nuevoEstado = derivarEstadoObra(etapas);
  if (nuevoEstado && t.estado !== nuevoEstado && t.estado !== 'finalizado') {
    const estadoAnterior = t.estado;
    // Actualizar en Supabase sin bloquear el render
    sb.from('trabajos').update({ estado: nuevoEstado }).eq('id', t.id).then(() => {
      t.estado = nuevoEstado;
      // Refrescar badge y dato en la ficha
      const estBadgeEl = document.getElementById('fichaObraEstado');
      if (estBadgeEl) estBadgeEl.innerHTML = estadoBadge(nuevoEstado);
      const datosEl = document.getElementById('fichaObraDatos');
      if (datosEl) {
        const estSpan = datosEl.querySelector('[data-campo="estado"]');
        if (estSpan) estSpan.textContent = nuevoEstado.replace('_',' ');
      }
      // Actualizar en la lista local
      const idx = trabajos.findIndex(tr => tr.id === t.id);
      if (idx >= 0) trabajos[idx].estado = nuevoEstado;
      // Registrar cambio en audit_log
      registrarAudit('cambio_estado_auto', 'trabajo', t.id,
        `Estado cambiado automáticamente: ${estadoAnterior} → ${nuevoEstado}`);
    });
  }

  return { etapas, paso, porcent, completadas };
}

// Deriva el estado de la obra a partir de las etapas completadas del workflow
function derivarEstadoObra(etapas) {
  if (etapas.cobrado) return 'finalizado';
  if (etapas.factura) return 'facturado';
  if (etapas.albaran) return 'en_curso';
  if (etapas.ejecucion) return 'en_curso';
  if (etapas.programado) return 'planificado';
  // Aprobado sin partes programados = sigue pendiente (no planificado)
  if (etapas.aprobado) return 'pendiente';
  if (etapas.presupuesto) return 'pendiente';
  return 'pendiente';
}

// ═══════════════════════════════════════════════
// CERRAR / REABRIR OBRA (con validación)
// ═══════════════════════════════════════════════

function renderBtnCerrarObra(t, presupData, albData, factData, partesData) {
  const el = document.getElementById('fichaObraCerrarBtn');
  if (!el) return;
  if (t.estado === 'finalizado') {
    el.innerHTML = `<button class="btn btn-sm" style="background:#FFFBEB;color:#D97706;border:1px solid #D97706" onclick="reabrirObra()">🔓 Reabrir obra</button>`;
  } else {
    el.innerHTML = `<button class="btn btn-sm" style="background:#ECFDF5;color:#059669;border:1px solid #059669" onclick="cerrarObra()">🔒 Cerrar obra</button>`;
  }
}

async function cerrarObra() {
  if (!obraActualId) return;
  const t = trabajos.find(x => x.id === obraActualId);
  if (!t) return;

  // Recopilar datos actuales de la obra
  const eid = EMPRESA.id;
  const [presups, albs, facts, partes] = await Promise.all([
    safeQuery(sb.from('presupuestos').select('id,estado,numero').eq('empresa_id',eid).eq('trabajo_id',obraActualId).neq('estado','eliminado')),
    safeQuery(sb.from('albaranes').select('id,estado,numero').eq('empresa_id',eid).eq('trabajo_id',obraActualId).neq('estado','eliminado')),
    safeQuery(sb.from('facturas').select('id,estado,numero,total').eq('empresa_id',eid).eq('trabajo_id',obraActualId).neq('estado','eliminado')),
    safeQuery(sb.from('partes_trabajo').select('id,estado,numero').eq('trabajo_id',obraActualId)),
  ]);
  const presupData = presups.data || [];
  const albData = albs.data || [];
  const factData = facts.data || [];
  const partesData = partes.data || [];

  // Validar pendientes
  const avisos = [];
  const partesNoValidados = partesData.filter(p => !['completado','revisado','facturado'].includes(p.estado));
  if (partesNoValidados.length) {
    avisos.push(`📝 ${partesNoValidados.length} parte(s) sin validar (${partesNoValidados.map(p=>p.numero||'borrador').join(', ')})`);
  }
  const presupPendientes = presupData.filter(p => ['borrador','pendiente'].includes(p.estado));
  if (presupPendientes.length) {
    avisos.push(`📋 ${presupPendientes.length} presupuesto(s) pendiente(s) (${presupPendientes.map(p=>p.numero||'borrador').join(', ')})`);
  }
  const _factActAlb = factData.filter(f => !f.rectificativa_de && !(f.estado === 'anulada' && factData.some(r => r.rectificativa_de === f.id)));
  const albSinFacturar = albData.filter(a => a.estado !== 'facturado' && a.estado !== 'anulado' && !_factActAlb.some(f=>f.albaran_id===a.id));
  if (albSinFacturar.length) {
    avisos.push(`📄 ${albSinFacturar.length} albarán(es) sin facturar (${albSinFacturar.map(a=>a.numero).join(', ')})`);
  }
  const factSinCobrar = factData.filter(f => !['cobrada','pagada','paid','anulada'].includes((f.estado||'').toLowerCase()));
  if (factSinCobrar.length) {
    avisos.push(`🧾 ${factSinCobrar.length} factura(s) sin cobrar (${factSinCobrar.map(f=>f.numero).join(', ')})`);
  }

  // Mostrar confirmación
  let msg = '¿Estás seguro de que quieres cerrar esta obra?';
  if (avisos.length) {
    msg = '⚠️ Hay elementos pendientes:\n\n' + avisos.join('\n') + '\n\n¿Cerrar la obra de todas formas?';
  }
  const okCerrar = await confirmModal({titulo:'Cerrar obra',mensaje:msg,btnOk:'Cerrar obra',colorOk:'#dc2626'}); if (!okCerrar) return;

  // Cerrar obra
  const { error } = await sb.from('trabajos').update({ estado: 'finalizado' }).eq('id', obraActualId);
  if (error) { toast('Error al cerrar: ' + error.message, 'error'); return; }

  t.estado = 'finalizado';
  const idx = trabajos.findIndex(tr => tr.id === obraActualId);
  if (idx >= 0) trabajos[idx].estado = 'finalizado';

  registrarAudit('cerrar_obra', 'trabajo', obraActualId,
    'Obra cerrada manualmente' + (avisos.length ? ' — Avisos: ' + avisos.join('; ') : ''));

  toast('Obra cerrada correctamente', 'success');
  abrirFichaObra(obraActualId);
}

async function reabrirObra() {
  if (!obraActualId) return;
  const t = trabajos.find(x => x.id === obraActualId);
  if (!t) return;

  const okReabrir = await confirmModal({titulo:'Reabrir obra',mensaje:'¿Reabrir esta obra? Se generará un registro en el historial.',btnOk:'Reabrir'}); if (!okReabrir) return;

  // Calcular cuál sería el estado correcto según el workflow
  const eid = EMPRESA.id;
  const [presups, albs, facts, partes] = await Promise.all([
    safeQuery(sb.from('presupuestos').select('*').eq('empresa_id',eid).eq('trabajo_id',obraActualId).neq('estado','eliminado')),
    safeQuery(sb.from('albaranes').select('*').eq('empresa_id',eid).eq('trabajo_id',obraActualId).neq('estado','eliminado')),
    safeQuery(sb.from('facturas').select('*').eq('empresa_id',eid).eq('trabajo_id',obraActualId).neq('estado','eliminado')),
    safeQuery(sb.from('partes_trabajo').select('*').eq('trabajo_id',obraActualId)),
  ]);
  const etapas = detectarEtapasObra(t, presups.data||[], albs.data||[], facts.data||[], partes.data||[]);
  const nuevoEstado = derivarEstadoObra(etapas);

  const { error } = await sb.from('trabajos').update({ estado: nuevoEstado }).eq('id', obraActualId);
  if (error) { toast('Error al reabrir: ' + error.message, 'error'); return; }

  t.estado = nuevoEstado;
  const idx = trabajos.findIndex(tr => tr.id === obraActualId);
  if (idx >= 0) trabajos[idx].estado = nuevoEstado;

  registrarAudit('reabrir_obra', 'trabajo', obraActualId,
    'Obra reabierta — nuevo estado: ' + nuevoEstado);

  toast('Obra reabierta', 'success');
  abrirFichaObra(obraActualId);
}

// ═══════════════════════════════════════════════
// HELPER: dato ficha
// ═══════════════════════════════════════════════
function datoFichaObra(label, val) {
  if(!val||val==='—') return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;color:var(--gris-400)">—</span></div>`;
  // Si el valor es largo (>25 chars), mostrar en 2 líneas (label arriba, valor abajo)
  const valText = val.replace(/<[^>]*>/g, '');
  if (valText.length > 25) {
    return `<div style="padding:4px 0;border-bottom:1px solid var(--gris-100)"><div style="font-size:10px;color:var(--gris-400);text-transform:uppercase;letter-spacing:.3px">${label}</div><div style="font-size:11.5px;font-weight:600;margin-top:1px;overflow-wrap:break-word">${val}</div></div>`;
  }
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;font-weight:600">${val}</span></div>`;
}

// ═══════════════════════════════════════════════
// ACCIONES RÁPIDAS DESDE LA FICHA
// ═══════════════════════════════════════════════
function editarObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  document.getElementById('tr_titulo').value = t.titulo||'';
  // Buscador de cliente
  initTrCliBuscador();
  const cli = clientes.find(c=>c.id===t.cliente_id);
  document.getElementById('tr_cli_search').value = cli?.nombre || t.cliente_nombre || '';
  document.getElementById('tr_cli').value = t.cliente_id || '';
  const selDiv = document.getElementById('tr_cli_selected');
  if (selDiv && cli) {
    const info = [cli.direccion_fiscal||cli.direccion||'', cli.municipio_fiscal||cli.municipio||'', cli.telefono||''].filter(Boolean).join(' · ');
    selDiv.innerHTML = `${cli.nombre} ${info ? `<span style="color:var(--gris-400);font-weight:400">— ${info}</span>` : ''} <span onclick="trLimpiarCliente()" style="cursor:pointer;color:var(--rojo);margin-left:4px" title="Quitar cliente">✕</span>`;
    selDiv.style.display = 'block';
  }
  document.getElementById('tr_cat').value = t.categoria||'';
  document.getElementById('tr_prio').value = t.prioridad||'';
  document.getElementById('tr_fecha').value = t.fecha||'';
  document.getElementById('tr_hora').value = t.hora||'';
  document.getElementById('tr_desc').value = t.descripcion||'';
  document.getElementById('mTrabTit').textContent = 'Editar Obra';
  openModal('mTrabajo');
}

function nuevoPresupObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  // Abrir nuevo presupuesto vinculado al cliente y obra
  if (typeof abrirNuevoPresupuesto === 'function') {
    abrirNuevoPresupuesto();
    setTimeout(() => {
      // Vincular a la obra
      if (typeof deConfig !== 'undefined') deConfig.trabajo_id = obraActualId;
      // Auto-fill cliente
      if (t.cliente_id && typeof de_setClienteSel === 'function') {
        de_setClienteSel(t.cliente_id);
      }
    }, 300);
  }
}

function nuevoAlbaranObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  if (typeof abrirNuevoAlbaran === 'function') {
    abrirNuevoAlbaran();
    setTimeout(() => {
      // Vincular a la obra
      if (typeof deConfig !== 'undefined') deConfig.trabajo_id = obraActualId;
      // Auto-fill cliente
      if (t.cliente_id && typeof de_setClienteSel === 'function') {
        de_setClienteSel(t.cliente_id);
      }
    }, 300);
  }
}

function nuevaFacturaObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  if (typeof abrirNuevaFactura === 'function') {
    abrirNuevaFactura();
    setTimeout(() => {
      if (typeof deConfig !== 'undefined') deConfig.trabajo_id = obraActualId;
      if (t.cliente_id && typeof de_setClienteSel === 'function') {
        de_setClienteSel(t.cliente_id);
      }
    }, 300);
  }
}

function nuevoParteObraActual() {
  if (!obraActualId) return;
  nuevoParteDesdeObra(obraActualId);
}

function programarCitaObraActual() {
  if (!obraActualId) return;
  const obra = trabajos.find(t => t.id === obraActualId);
  const titulo = obra ? (obra.numero ? obra.numero + ' – ' : '') + (obra.titulo || obra.descripcion || 'Obra') : 'Obra';
  abrirPlanificadorDesdeObra(obraActualId, titulo);
}

/** Programar un parte en borrador: abre el detalle para que el admin revise y programe */
function programarParteBorrador(parteId) {
  // Abrir detalle del parte — desde ahí el admin puede cambiar fecha/hora y avanzar estado
  if (typeof verDetalleParte === 'function') {
    verDetalleParte(parteId);
  } else {
    // Fallback: cambiar estado directamente
    avanzarEstadoParte(parteId, 'programado');
  }
}

// ═══════════════════════════════════════════════
// CONVERSIONES DESDE FICHA DE OBRA (autónomas)
// ═══════════════════════════════════════════════

async function obraAprobarPres(presId) {
  if (!obraActualId) return;
  const okAprob = await confirmModal({titulo:'Aprobar presupuesto',mensaje:'¿Aprobar este presupuesto?',btnOk:'Aprobar'}); if (!okAprob) return;
  const { error } = await sb.from('presupuestos').update({ estado: 'aceptado' }).eq('id', presId);
  if (error) { toast('Error: '+error.message,'error'); return; }
  const p = (typeof presupuestos !== 'undefined') ? presupuestos.find(x=>x.id===presId) : null;
  if (p) p.estado = 'aceptado';
  registrarAudit('cambiar_estado', 'presupuesto', presId, 'Aprobado desde ficha de obra'+(p?' — '+p.numero:''));
  toast('✅ Presupuesto aprobado','success');
  abrirFichaObra(obraActualId, false);
  if (typeof loadDashboard === 'function') loadDashboard();
}

async function obraPresToAlbaran(presId) {
  if (!obraActualId) return;
  const { data: p, error: err } = await sb.from('presupuestos').select('*').eq('id', presId).single();
  if (err || !p) { toast('Error al cargar presupuesto', 'error'); return; }
  // No permitir si es borrador
  if (p.estado === 'borrador' || (p.numero||'').startsWith('BORR-')) { toast('🔒 No se puede albaranar un borrador — guárdalo primero','error'); return; }
  // Comprobar si ya tiene albarán o factura
  const _aD3 = window.albaranesData || (typeof albaranesData!=='undefined' ? albaranesData : []);
  const _fD5 = window.facturasData || [];
  if (_aD3.some(a=>a.presupuesto_id===p.id && a.estado!=='anulado')) { toast('🔒 Este presupuesto ya tiene albarán','error'); return; }
  const _fAct5 = _fD5.filter(f => !f.rectificativa_de && !(f.estado === 'anulada' && _fD5.some(r => r.rectificativa_de === f.id)));
  if (_fAct5.some(f=>f.presupuesto_id===p.id)) { toast('🔒 Este presupuesto ya tiene factura, no se puede albaranar','error'); return; }
  const okAlb = await confirmModal({titulo:'Crear albarán',mensaje:`¿Crear albarán desde ${p.numero}?`,btnOk:'Crear albarán'}); if (!okAlb) return;

  const numero = await generarNumeroDoc('albaran');
  const lineas = (p.lineas || []).filter(l => l.tipo !== 'capitulo').map(l => ({
    desc: l.desc || '', cant: l.cant || 1, precio: l.precio || 0
  }));
  let total = 0; lineas.forEach(l => total += l.cant * l.precio);

  const { error } = await sb.from('albaranes').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
    fecha: new Date().toISOString().split('T')[0],
    referencia: p.titulo || null,
    total: Math.round(total * 100) / 100,
    estado: 'pendiente', observaciones: p.observaciones, lineas,
    presupuesto_id: p.id,
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await sb.from('presupuestos').update({ estado: 'aceptado' }).eq('id', presId);
  // Refrescar albaranes globales para que presupuestos detecte el nuevo
  const {data:_albR} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.albaranesData = _albR||[]; if (typeof albaranesData!=='undefined') albaranesData = _albR||[];
  await registrarActividadObra(obraActualId, 'Albarán creado', `📄 ${numero} desde presupuesto ${p.numero}`);
  toast('📄 Albarán creado', 'success');
  abrirFichaObra(obraActualId, false);
}

async function obraPresToFactura(presId) {
  if (!obraActualId) return;
  const { data: p, error: err } = await sb.from('presupuestos').select('*').eq('id', presId).single();
  if (err || !p) { toast('Error al cargar presupuesto', 'error'); return; }
  // No permitir si es borrador
  if (p.estado === 'borrador' || (p.numero||'').startsWith('BORR-')) { toast('🔒 No se puede facturar un borrador — guárdalo primero','error'); return; }
  // Comprobar si ya tiene factura
  const _fD2 = window.facturasData || [];
  const _aD4 = window.albaranesData || (typeof albaranesData!=='undefined' ? albaranesData : []);
  const _albsP2 = _aD4.filter(a=>a.presupuesto_id===p.id);
  const _fAct2b = _fD2.filter(f => !f.rectificativa_de && !(f.estado === 'anulada' && _fD2.some(r => r.rectificativa_de === f.id)));
  if (_fAct2b.some(f=>f.presupuesto_id===p.id) || _albsP2.some(a=>_fAct2b.some(f=>f.albaran_id===a.id))) { toast('🔒 Este presupuesto ya tiene factura','error'); return; }
  const okFactP = await confirmModal({titulo:'Crear factura',mensaje:`¿Crear borrador de factura desde ${p.numero}?`,btnOk:'Crear factura'}); if (!okFactP) return;

  const numero = await _generarNumeroBorrador();
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);

  const { error } = await sb.from('facturas').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: p.base_imponible, total_iva: p.total_iva, total: p.total,
    estado: 'borrador', observaciones: p.observaciones, lineas: p.lineas,
    presupuesto_id: p.id,
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await sb.from('presupuestos').update({ estado: 'aceptado' }).eq('id', presId);
  // Marcar albaranes del mismo presupuesto como facturados
  const _albsDelPres2 = _aD4.filter(a=>a.presupuesto_id===p.id);
  for (const alb of _albsDelPres2) {
    await sb.from('albaranes').update({estado:'facturado'}).eq('id',alb.id);
  }
  // Refrescar facturas y albaranes globales
  const {data:_fR2} = await sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.facturasData = _fR2||[];
  const {data:_aR2} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.albaranesData = _aR2||[]; if (typeof albaranesData!=='undefined') albaranesData = _aR2||[];
  await registrarActividadObra(obraActualId, 'Borrador factura creado', `🧾 ${numero} desde presupuesto ${p.numero}`);
  toast('✅ Borrador de factura creado — revísalo y emítelo cuando esté listo', 'success');
  abrirFichaObra(obraActualId, false);
}

async function obraAlbToFactura(albId) {
  if (!obraActualId) return;
  const { data: a, error: err } = await sb.from('albaranes').select('*').eq('id', albId).single();
  if (err || !a) { toast('Error al cargar albarán', 'error'); return; }
  // Comprobar si ya tiene factura
  const _fD3 = window.facturasData || [];
  const _fAct3 = _fD3.filter(f => !f.rectificativa_de && !(f.estado === 'anulada' && _fD3.some(r => r.rectificativa_de === f.id)));
  if (_fAct3.some(f=>f.albaran_id===a.id)) { toast('🔒 Este albarán ya tiene factura','error'); return; }
  const okFactA = await confirmModal({titulo:'Crear factura',mensaje:`¿Crear borrador de factura desde ${a.numero}?`,btnOk:'Crear factura'}); if (!okFactA) return;

  const numero = await _generarNumeroBorrador();
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);

  const { error } = await sb.from('facturas').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: a.cliente_id, cliente_nombre: a.cliente_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: a.total || 0, total_iva: 0, total: a.total || 0,
    estado: 'borrador', observaciones: a.observaciones,
    lineas: a.lineas, albaran_id: a.id,
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await sb.from('albaranes').update({ estado: 'facturado' }).eq('id', albId);
  // Refrescar facturas y albaranes globales
  const {data:_fR3} = await sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.facturasData = _fR3||[];
  const {data:_aR3} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.albaranesData = _aR3||[]; if (typeof albaranesData!=='undefined') albaranesData = _aR3||[];
  await registrarActividadObra(obraActualId, 'Borrador factura creado', `🧾 ${numero} desde albarán ${a.numero}`);
  toast('✅ Borrador de factura creado — revísalo y emítelo cuando esté listo', 'success');
  abrirFichaObra(obraActualId, false);
}

async function obraFacturarTodosAlb() {
  if (!obraActualId) return;
  // Si hay IDs seleccionados (desde checkboxes), usarlos; si no, facturar todos
  const _selIds = window._albIdsSeleccionados || null;
  window._albIdsSeleccionados = null;
  let query = sb.from('albaranes').select('*').eq('empresa_id', EMPRESA.id).eq('trabajo_id', obraActualId).neq('estado', 'facturado').neq('estado', 'anulado').neq('estado', 'eliminado');
  if (_selIds && _selIds.length > 0) query = query.in('id', _selIds);
  const { data: albs } = await query;
  if (!albs || albs.length < 1) { toast('No hay albaranes pendientes de facturar', 'info'); return; }

  // Verificar mismo cliente
  const clienteIds = new Set(albs.map(a => a.cliente_id));
  if (clienteIds.size > 1) { toast('Los albaranes tienen clientes distintos', 'error'); return; }

  const nums = albs.map(a => a.numero).join(', ');
  const okAgrp = await confirmModal({titulo:'Agrupar en factura',mensaje:`¿Crear una factura agrupando ${albs.length} albarán${albs.length > 1 ? 'es' : ''}?`,aviso:nums,btnOk:'Crear factura'}); if (!okAgrp) return;

  // Combinar líneas
  let lineasTodas = [];
  let totalGlobal = 0;
  albs.forEach(a => {
    lineasTodas.push({ desc: `── ${a.numero} (${a.fecha || ''}) ──`, cant: 0, precio: 0, _separator: true });
    (a.lineas || []).forEach(l => {
      lineasTodas.push({ ...l });
      totalGlobal += (l.cant || 0) * (l.precio || 0);
    });
  });

  const numero = await _generarNumeroBorrador();
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);
  const { error } = await sb.from('facturas').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: albs[0].cliente_id, cliente_nombre: albs[0].cliente_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: Math.round(totalGlobal * 100) / 100,
    total_iva: 0, total: Math.round(totalGlobal * 100) / 100,
    estado: 'borrador',
    observaciones: `Factura agrupada obra: ${nums}`,
    lineas: lineasTodas,
    albaran_ids: albs.map(a => a.id),
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  // Marcar todos como facturados
  for (const a of albs) {
    await sb.from('albaranes').update({ estado: 'facturado' }).eq('id', a.id);
  }
  await registrarActividadObra(obraActualId, 'Factura agrupada creada', `🧾 ${numero} agrupando ${albs.length} albarán(es): ${nums}`);
  toast(`✅ Borrador ${numero} creado con ${albs.length} albarán${albs.length > 1 ? 'es' : ''} — revísalo y emítelo`, 'success');
  abrirFichaObra(obraActualId, false); // Refrescar
}

// ═══════════════════════════════════════════════
// FIRMA REMOTA — ENVIAR PRESUPUESTO AL CLIENTE
// ═══════════════════════════════════════════════
// Generar token corto (12 caracteres alfanuméricos)
function generarTokenCorto() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  arr.forEach(v => token += chars[v % chars.length]);
  return token;
}

async function enviarPresupuestoCliente(presId, obraIdOverride) {
  const obraId = obraIdOverride || obraActualId;
  const { data: p, error: err } = await sb.from('presupuestos').select('*').eq('id', presId).single();
  if (err || !p) { toast('Error al cargar presupuesto', 'error'); return; }

  // Buscar email del cliente
  const cli = p.cliente_id ? clientes.find(c => c.id === p.cliente_id) : null;
  const emailCliente = cli?.email || '';

  // Generar token corto si no existe o si es un UUID largo
  let firmaToken = p.firma_token;
  if (!firmaToken || firmaToken.length > 16) {
    firmaToken = generarTokenCorto();
    const { error: tokErr } = await sb.from('presupuestos').update({
      firma_token: firmaToken,
      firma_enviado_por: CU?.id || null,
      firma_enviado_por_nombre: CP ? (CP.nombre || '') + ' ' + (CP.apellidos || '') : CU?.email || '',
    }).eq('id', presId);
    if (tokErr) {
      await sb.from('presupuestos').update({ firma_token: firmaToken }).eq('id', presId);
    }
  } else {
    await sb.from('presupuestos').update({
      firma_enviado_por: CU?.id || null,
      firma_enviado_por_nombre: CP ? (CP.nombre || '') + ' ' + (CP.apellidos || '') : CU?.email || '',
    }).eq('id', presId).then(() => {}).catch(() => {});
  }

  // Construir URL corta de firma
  const firmaUrl = `https://instaloerp.github.io/f.html?t=${firmaToken}`;
  const empresaNombre = EMPRESA.nombre || 'Nuestra empresa';
  const importeStr = (p.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 });

  // Construir asunto/cuerpo
  const asunto = `Presupuesto ${p.numero} — ${empresaNombre}`;
  const cuerpo =
    `Estimado/a ${cli?.nombre || 'cliente'},\n\n` +
    `Le enviamos el presupuesto ${p.numero}${p.titulo ? ' (' + p.titulo + ')' : ''} por importe de ${importeStr} €.\n\n` +
    `Puede revisar el detalle y firmarlo digitalmente en el siguiente enlace:\n\n` +
    `>> ${firmaUrl}\n\n` +
    `Si tiene alguna duda, no dude en contactarnos.\n\n` +
    `Atentamente,\n${CP?.nombre || ''} ${CP?.apellidos || ''}\n${empresaNombre}${EMPRESA.telefono ? '\nTel: ' + EMPRESA.telefono : ''}`;

  // Registrar en actividad de la obra (si hay obra)
  if (obraId) {
    await registrarActividadObra(obraId, 'Presupuesto enviado al cliente', `📩 ${p.numero} enviado a ${cli?.nombre || 'cliente'}${emailCliente ? ' (' + emailCliente + ')' : ''}`);
  }

  // Abrir composer SMTP del ERP
  if (typeof nuevoCorreo === 'function') {
    nuevoCorreo(emailCliente, asunto, cuerpo, { tipo: 'presupuesto', id: p.id, ref: p.numero || '' });
    if (typeof goPage === 'function') goPage('correo');
    toast('📩 Enlace de firma listo — revisa y envía el correo', 'success');
  } else {
    toast('Módulo de correo no disponible', 'error');
  }

  // Refrescar ficha si estamos en una obra
  if (obraId && obraActualId) abrirFichaObra(obraActualId, false);
}

// ═══════════════════════════════════════════════
// NOTAS DE OBRA
// ═══════════════════════════════════════════════
async function guardarNotaObra() {
  if (!obraActualId) return;
  const texto = document.getElementById('obraNotaTexto').value.trim();
  if (!texto) { toast('Escribe el texto de la nota','error'); return; }
  const tipo = document.getElementById('obraNotaTipo').value;
  const { error } = await sb.from('notas_trabajo').insert({
    empresa_id: EMPRESA.id, trabajo_id: obraActualId,
    texto, tipo, creado_por: CU.id, creado_por_nombre: CP?.nombre||CU?.email||''
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await registrarActividadObra(obraActualId, 'Nota añadida', `📝 ${tipo}: ${texto.substring(0,80)}${texto.length>80?'…':''}`);
  document.getElementById('obraNotaTexto').value = '';
  await abrirFichaObra(obraActualId, false);
  obraTab('seguimiento');
  toast('Nota guardada ✓','success');
}

async function eliminarNotaObra(id) {
  const okNota = await confirmModal({titulo:'Eliminar nota',mensaje:'¿Eliminar esta nota?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!okNota) return;
  await sb.from('notas_trabajo').delete().eq('id', id);
  await registrarActividadObra(obraActualId, 'Nota eliminada', `🗑️ Nota #${id} eliminada`);
  await abrirFichaObra(obraActualId, false);
  obraTab('seguimiento');
  toast('Nota eliminada','info');
}

// ═══════════════════════════════════════════════
// DOCUMENTOS DE OBRA
// ═══════════════════════════════════════════════
async function subirDocObra(input) {
  if (!obraActualId) return;
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10*1024*1024) { toast('Archivo demasiado grande (máx 10MB)','error'); return; }
  const nombre = document.getElementById('obraDocNombre')?.value.trim() || file.name;
  const tipo = document.getElementById('obraDocTipo')?.value || 'otro';
  const safeName = _sanitizeFileName(file.name);
  const path = `${EMPRESA.id}/obras/${obraActualId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file);
  if (upErr) { toast('Error subiendo: '+upErr.message,'error'); return; }
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
  const url = urlData?.publicUrl || '';
  const { error: dbErr } = await sb.from('documentos_trabajo').insert({
    empresa_id: EMPRESA.id, trabajo_id: obraActualId,
    nombre, tipo, url, path, tamanyo: file.size,
    creado_por: CU.id
  });
  if (dbErr) { toast('Error guardando registro: '+dbErr.message,'error'); return; }
  await registrarActividadObra(obraActualId, 'Documento subido', `📎 ${nombre} (${tipo})`);
  input.value = '';
  document.getElementById('obraDocNombre').value = '';
  await abrirFichaObra(obraActualId, false);
  obraTab('historial');
  toast('Documento subido ✓','success');
}

async function eliminarDocObra(id) {
  const okDoc = await confirmModal({titulo:'Eliminar documento',mensaje:'¿Eliminar este documento?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!okDoc) return;
  await sb.from('documentos_trabajo').delete().eq('id', id);
  await registrarActividadObra(obraActualId, 'Documento eliminado', `🗑️ Documento #${id} eliminado`);
  await abrirFichaObra(obraActualId, false);
  obraTab('historial');
  toast('Documento eliminado','info');
}

async function eliminarAuditEntry(id) {
  if (!(CP?.rol === 'superadmin' || CP?.rol === 'admin')) { toast('Solo el superadmin puede eliminar registros','error'); return; }
  const okAudit = await confirmModal({titulo:'Eliminar entrada',mensaje:'¿Eliminar esta entrada del registro?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!okAudit) return;
  await sb.from('audit_log').delete().eq('id', id);
  await abrirFichaObra(obraActualId, false);
  obraTab('historial');
  toast('Entrada eliminada del registro','info');
}

// Función helper para registrar actividad en una obra
async function registrarActividadObra(trabajoId, accion, detalle) {
  try {
    await sb.from('audit_log').insert({
      empresa_id: EMPRESA.id,
      entidad: 'trabajo',
      entidad_id: String(trabajoId),
      accion: accion,
      detalle: detalle || '',
      usuario_id: CU?.id || null,
      usuario_nombre: CP?.nombre || CU?.email || 'Sistema',
    });
  } catch(e) { /* silent */ }
}

// ═══════════════════════════════════════════════
// ADJUNTAR DOCS (modal creación)
// ═══════════════════════════════════════════════
function tr_addDocs(files) {
  Array.from(files).forEach(f => { if(!trDocsFiles.find(x=>x.name===f.name)) trDocsFiles.push(f); });
  tr_renderDocs();
}

function tr_dropDocs(e) {
  e.preventDefault();
  document.getElementById('tr_doc_zone').style.borderColor='var(--gris-300)';
  tr_addDocs(e.dataTransfer.files);
}

function tr_removeDoc(name) {
  trDocsFiles = trDocsFiles.filter(f=>f.name!==name);
  tr_renderDocs();
}

function tr_renderDocs() {
  const icons = {'pdf':'📄','doc':'📝','docx':'📝','jpg':'🖼️','jpeg':'🖼️','png':'🖼️','xlsx':'📊','xls':'📊'};
  document.getElementById('tr_doc_list').innerHTML = trDocsFiles.map(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    const ico = icons[ext]||'📎';
    const size = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : Math.round(f.size/1024)+'KB';
    return `<div style="display:flex;align-items:center;gap:5px;background:var(--gris-50);border:1px solid var(--gris-200);border-radius:6px;padding:4px 9px;font-size:12px">
      ${ico} <span>${f.name}</span> <span style="color:var(--gris-400)">${size}</span>
      <button onclick="tr_removeDoc('${f.name}')" style="background:none;border:none;cursor:pointer;color:var(--rojo);margin-left:3px;font-size:13px">✕</button>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
// CREAR / ELIMINAR OBRA
// ═══════════════════════════════════════════════
async function saveTrabajo() {
  if (_creando) return;
  _creando = true;
  try {
    const titulo=document.getElementById('tr_titulo').value.trim();
    if(!titulo){toast('Introduce el título','error');return;}
    const cliId=parseInt(document.getElementById('tr_cli').value)||null;
    if(!cliId){toast('Selecciona un cliente','error');return;}
    const cli=clientes.find(c=>c.id===cliId);
    const desc = document.getElementById('tr_desc').value.trim();
    if(desc.length < 10){toast('La descripción debe tener al menos 10 caracteres','error');return;}
    // Dirección se obtiene del cliente
    const dirCliente = cli ? [cli.direccion_fiscal||cli.direccion||'', cli.cp_fiscal||cli.cp||'', cli.municipio_fiscal||cli.municipio||'', cli.provincia_fiscal||cli.provincia||''].filter(Boolean).join(', ') : '';

    // Si estamos editando
    if (obraActualId && document.getElementById('mTrabTit').textContent === 'Editar Obra') {
      const { error } = await sb.from('trabajos').update({
        titulo,
        cliente_id: cliId, cliente_nombre: cli?.nombre||'',
        prioridad: v('tr_prio'), categoria: v('tr_cat'),
        fecha: v('tr_fecha'), hora: v('tr_hora'),
        direccion_obra_texto: dirCliente, descripcion: desc,
      }).eq('id', obraActualId);
      if (error) { toast('Error: '+error.message,'error'); return; }
      await registrarActividadObra(obraActualId, 'Obra editada', `Título: ${titulo} | Cliente: ${cli?.nombre||'—'} | Categoría: ${v('tr_cat')||'—'} | Prioridad: ${v('tr_prio')||'—'}`);
      closeModal('mTrabajo');
      document.getElementById('mTrabTit').textContent = 'Nueva Obra';
      const {data}=await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
      trabajos=data||[];
      await abrirFichaObra(obraActualId, false);
      toast('Obra actualizada ✓','success');
      return;
    }

    const num=`TRB-${new Date().getFullYear()}-${String(trabajos.length+1).padStart(3,'0')}`;
    const {data:insertData,error}=await sb.from('trabajos').insert({
    empresa_id:EMPRESA.id,numero:num,titulo,
    cliente_id:cliId,cliente_nombre:cli?.nombre||'',
    prioridad:v('tr_prio'),categoria:v('tr_cat'),
    fecha:v('tr_fecha'),hora:v('tr_hora'),
    direccion_obra_texto:dirCliente,descripcion:desc,
    estado:'pendiente',operario_id:CU.id,operario_nombre:CP?.nombre||''
  }).select();
  if(error){toast('Error: '+error.message,'error');return;}

  // Subir documentos adjuntos si hay
  const newTrabajoId = insertData?.[0]?.id;
  if (newTrabajoId && trDocsFiles.length > 0) {
    for (const file of trDocsFiles) {
      const safeName = _sanitizeFileName(file.name);
      const path = `${EMPRESA.id}/obras/${newTrabajoId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await sb.storage.from('documentos').upload(path, file);
      if (upErr) { toast('Error subiendo '+file.name+': '+upErr.message,'error'); continue; }
      const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
      const url = urlData?.publicUrl || '';
      const ext = file.name.split('.').pop().toLowerCase();
      const tipo = ['jpg','jpeg','png','gif','bmp','webp'].includes(ext) ? 'foto'
        : ['pdf'].includes(ext) ? 'otro'
        : ['doc','docx'].includes(ext) ? 'contrato'
        : ['xlsx','xls'].includes(ext) ? 'otro' : 'otro';
      await sb.from('documentos_trabajo').insert({
        empresa_id: EMPRESA.id, trabajo_id: newTrabajoId,
        nombre: file.name, tipo, url, path, tamanyo: file.size,
        creado_por: CU.id
      });
    }
    trDocsFiles = [];
    document.getElementById('tr_doc_list').innerHTML = '';
  }

  // Registrar actividad
  if (newTrabajoId) {
    await registrarActividadObra(newTrabajoId, 'Obra creada', `${num} — ${titulo} | Cliente: ${cli?.nombre||'Sin cliente'}`);
    if (trDocsFiles.length > 0) {
      await registrarActividadObra(newTrabajoId, 'Documentos adjuntados', `${trDocsFiles.length} documento(s) al crear la obra`);
    }
  }
    closeModal('mTrabajo');
    const {data}=await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    trabajos=data||[]; renderTrabajos(); loadDashboard();
    toast(`Obra ${num} creada ✓`,'success');
    if (typeof window._afterSaveObra === 'function') { window._afterSaveObra(); window._afterSaveObra = null; }
  } finally {
    _creando = false;
  }
}

async function delTrabajo(id) {
  const okDel = await confirmModal({titulo:'Eliminar obra',mensaje:'¿Eliminar esta obra?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!okDel) return;
  const obraElim = trabajos.find(t=>t.id===id);
  await registrarActividadObra(id, 'Obra eliminada', `🗑️ ${obraElim?.numero||''} — ${obraElim?.titulo||'Sin título'}`);
  await sb.from('trabajos').delete().eq('id',id);
  trabajos=trabajos.filter(t=>t.id!==id); renderTrabajos(); loadDashboard();
  toast('Eliminado','info');
}

// ═══════════════════════════════════════════════
// EXPORTAR OBRAS
// ═══════════════════════════════════════════════
async function exportarObras() {
  const list = document.getElementById('trSearch')?.value || document.getElementById('trEstado')?.value ?
    trabajos.filter(t => {
      const q = (document.getElementById('trSearch')?.value||'').toLowerCase();
      const est = document.getElementById('trEstado')?.value||'';
      const des = document.getElementById('trDesde')?.value||'';
      const has = document.getElementById('trHasta')?.value||'';
      if (est && t.estado !== est) return false;
      if (q && !(t.numero||'').toLowerCase().includes(q) && !(t.titulo||'').toLowerCase().includes(q) && !(t.cliente_nombre||'').toLowerCase().includes(q)) return false;
      if (des && t.fecha && t.fecha < des) return false;
      if (has && t.fecha && t.fecha > has) return false;
      return true;
    }) : trabajos;
  if (!list.length) { toast('No hay datos para exportar','info'); return; }
  const okExp = await confirmModal({titulo:'Exportar',mensaje:`¿Exportar ${list.length} obra(s) a Excel?`,btnOk:'Exportar'}); if (!okExp) return;
  const rows = list.map(t => ({
    'Número': t.numero,
    'Título': t.titulo,
    'Cliente': t.cliente_nombre,
    'Fecha': t.fecha,
    'Estado': t.estado,
    'Prioridad': t.prioridad,
    'Categoría': t.categoria,
    'Dirección': t.direccion_obra_texto,
    'Operario': t.operario_nombre,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Obras');
  XLSX.writeFile(wb, `obras_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Exportado ✓','success');
}

// ═══════════════════════════════════════════════
// EQUIPO ASIGNADO A OBRA
// ═══════════════════════════════════════════════
let obraEquipoData = [];

function renderEquipoObra(obraId, data) {
  obraEquipoData = data || [];
  const container = document.getElementById('fichaObraEquipo');
  if (!container) return;

  const AVC = ['#1B4FD8','#16A34A','#D97706','#DC2626','#7C3AED','#0891B2'];
  const ROL_LABEL = { operario:'Operario', encargado:'Encargado', jefe_obra:'Jefe de obra' };

  let html = '';
  if (obraEquipoData.length) {
    html += obraEquipoData.map(op => {
      const ini = (op.usuario_nombre||'?')[0].toUpperCase();
      const bgColor = AVC[(op.usuario_nombre||'').charCodeAt(0)%AVC.length];
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gris-100)">
        <div style="width:32px;height:32px;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0">${ini}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${op.usuario_nombre||'—'}</div>
          <div style="font-size:10px;color:var(--gris-400)">${ROL_LABEL[op.rol_obra]||'Operario'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 5px;color:var(--rojo)" onclick="quitarOperarioObra(${obraId},${op.id})" title="Quitar">✕</button>
      </div>`;
    }).join('');
  } else {
    html += '<div style="color:var(--gris-400);font-size:11.5px;text-align:center;padding:8px 0">Sin operarios asignados</div>';
  }

  // Selector para añadir
  html += `<div style="margin-top:8px">
    <select id="sel_add_operario_obra" style="width:100%;padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
      <option value="">+ Añadir operario...</option>
      ${(typeof todosUsuarios !== 'undefined' ? todosUsuarios : [])
        .filter(u => u.activo !== false && !obraEquipoData.some(o => o.usuario_id === u.id))
        .map(u => `<option value="${u.id}" data-nombre="${(u.nombre||'')} ${(u.apellidos||'')}">${u.nombre||''} ${u.apellidos||''} ${u.rol === 'operario' ? '👷' : '🖥️'}</option>`).join('')}
    </select>
    <button class="btn btn-primary btn-sm" style="width:100%;margin-top:6px;font-size:11px" onclick="addOperarioObra(${obraId})">👷 Asignar</button>
  </div>`;

  container.innerHTML = html;
}

async function addOperarioObra(obraId) {
  const sel = document.getElementById('sel_add_operario_obra');
  if (!sel || !sel.value) { toast('Selecciona un operario','error'); return; }
  const uid = sel.value;
  const nombre = sel.options[sel.selectedIndex].getAttribute('data-nombre') || '';

  const { error } = await sb.from('operarios_obra').insert({
    empresa_id: EMPRESA.id,
    trabajo_id: obraId,
    usuario_id: uid,
    usuario_nombre: nombre.trim(),
    rol_obra: 'operario',
    asignado_por: CU?.id || null,
    asignado_por_nombre: CP?.nombre || '',
  });
  if (error) {
    if (error.code === '23505') toast('Este operario ya está asignado','error');
    else toast('Error: '+error.message,'error');
    return;
  }
  toast(nombre.trim()+' asignado a la obra ✓','success');
  // Registrar en audit_log
  registrarActividadObra(obraId, 'Equipo modificado', `👷 ${nombre.trim()} asignado a la obra`);
  // Recargar equipo
  const { data } = await sb.from('operarios_obra').select('*').eq('trabajo_id',obraId).order('created_at',{ascending:true});
  renderEquipoObra(obraId, data||[]);
}

async function quitarOperarioObra(obraId, operarioObraId) {
  const op = obraEquipoData.find(o => o.id === operarioObraId);
  const okQuitar = await confirmModal({titulo:'Quitar operario',mensaje:`¿Quitar a ${op?.usuario_nombre || 'este operario'} de la obra?`,btnOk:'Quitar',colorOk:'#dc2626'}); if (!okQuitar) return;
  await sb.from('operarios_obra').delete().eq('id', operarioObraId);
  toast('Operario quitado de la obra','info');
  registrarActividadObra(obraId, 'Equipo modificado', `❌ ${op?.usuario_nombre||'Operario'} quitado de la obra`);
  const { data } = await sb.from('operarios_obra').select('*').eq('trabajo_id',obraId).order('created_at',{ascending:true});
  renderEquipoObra(obraId, data||[]);
}

// ═══════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════
function prioBadge(p) {
  const m={Urgente:'<span class="badge bg-red">🔴</span>',Alta:'<span class="badge" style="background:#FFF4ED;color:var(--acento)">🟠</span>',Normal:'<span class="badge bg-gray">⚪</span>',Baja:'<span class="badge bg-gray">🔵</span>'};
  return m[p]||'';
}
