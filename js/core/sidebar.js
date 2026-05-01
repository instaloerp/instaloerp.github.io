// ═══════════════════════════════════════════════
// SIDEBAR - Navigation, collapsible sections, and favorites management
// ═══════════════════════════════════════════════

const ALL_PAGES = [
  {id:'dashboard',ico:'🏠',label:'Panel'},
  {id:'clientes',ico:'👥',label:'Clientes'},
  {id:'presupuestos',ico:'📋',label:'Presupuestos'},
  {id:'albaranes',ico:'📄',label:'Albaranes'},
  {id:'facturas',ico:'🧾',label:'Facturas'},
  {id:'rectificativas',ico:'📝',label:'Rectificativas'},
  {id:'proveedores',ico:'🏭',label:'Proveedores'},
  {id:'presupuestos-compra',ico:'📋',label:'Presupuestos compra'},
  {id:'pedidos-compra',ico:'🛒',label:'Pedidos'},
  {id:'albaranes-proveedor',ico:'📥',label:'Albaranes prov.'},
  {id:'facturas-proveedor',ico:'📑',label:'Facturas prov.'},
  {id:'calendario-pagos',ico:'📅',label:'Calendario pagos'},
  {id:'ocr',ico:'🤖',label:'Bandeja OCR'},
  {id:'flota',ico:'🚐',label:'Vehículos'},
  {id:'flota-gastos',ico:'💰',label:'Gastos flota'},
  {id:'flota-gps',ico:'📡',label:'GPS en vivo'},
  {id:'articulos',ico:'📦',label:'Artículos'},
  {id:'almacenes',ico:'🏪',label:'Almacenes'},
  {id:'stock',ico:'📊',label:'Stock'},
  {id:'consumos',ico:'🔧',label:'Consumos'},
  {id:'incidencias-stock',ico:'⚠️',label:'Incidencias Stock'},
  {id:'traspasos',ico:'🔄',label:'Traspasos'},
  {id:'activos',ico:'🔧',label:'Activos'},
  {id:'trabajos',ico:'🏗️',label:'Obras'},
  {id:'mantenimientos',ico:'🔧',label:'Mantenimientos'},
  {id:'partes',ico:'📝',label:'Partes'},
  {id:'formularios',ico:'📋',label:'Formularios'},
  {id:'planificador',ico:'⏱️',label:'Planificador Semanal'},
  {id:'calendario',ico:'📅',label:'Calendario'},
  {id:'mistareas',ico:'✅',label:'Tareas'},
  {id:'correo',ico:'📧',label:'Correo'},
  {id:'mensajes',ico:'💬',label:'Mensajes'},
  {id:'plan-contable',ico:'📊',label:'Plan Contable'},
  {id:'libro-diario',ico:'📖',label:'Libro Diario'},
  {id:'libro-mayor',ico:'📒',label:'Libro Mayor'},
  {id:'balance-sumas',ico:'📊',label:'Balance Sumas y Saldos'},
  {id:'cuenta-resultados',ico:'📈',label:'Cuenta de Resultados'},
  {id:'fichajes',ico:'⏱️',label:'Fichajes'},
  {id:'usuarios',ico:'👷',label:'Usuarios'},
  {id:'etiquetas-qr',ico:'🏷️',label:'Etiquetas QR'},
  {id:'audit-log',ico:'📜',label:'Registro actividad'},
  {id:'papelera',ico:'🗑️',label:'Papelera'},
  {id:'configuracion',ico:'⚙️',label:'Configuración'},
];

// Páginas marcadas como "pronto" — se ocultan automáticamente del sidebar
const PAGES_PRONTO = new Set([]);

// Páginas en modo BETA — vacío, todo es estable en v1.0
const PAGES_BETA = new Set([]);

let sbCollapsed = JSON.parse(localStorage.getItem('sb_collapsed')||'{}');
let sbFavoritos = JSON.parse(localStorage.getItem('sb_favoritos')||'["dashboard","correo","mistareas","clientes"]');
let sbHidden = JSON.parse(localStorage.getItem('sb_hidden')||'[]');
let sbShown = JSON.parse(localStorage.getItem('sb_shown')||'[]');
let sbItemOrder = JSON.parse(localStorage.getItem('sb_item_order')||'{}');
let sbSectionOrder = JSON.parse(localStorage.getItem('sb_section_order')||'[]');
if (!sbFavoritos.includes('dashboard')) { sbFavoritos.unshift('dashboard'); localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos)); }
let favEditMode = false;

// ── Supabase persistence for sidebar preferences ──
let _sbSyncBusy = false;
let _sbSyncTimer = null;

// Save sidebar prefs to Supabase (debounced 1s)
function _sbSaveToSupabase() {
  clearTimeout(_sbSyncTimer);
  _sbSyncTimer = setTimeout(async () => {
    if (_sbSyncBusy || typeof sb === 'undefined' || typeof CU === 'undefined' || !CU) return;
    _sbSyncBusy = true;
    try {
      const prefs = {
        favoritos: sbFavoritos,
        hidden: sbHidden,
        shown: sbShown,
        collapsed: sbCollapsed,
        itemOrder: sbItemOrder,
        sectionOrder: sbSectionOrder
      };
      await sb.from('perfiles').update({ preferencias_sidebar: prefs }).eq('id', CU.id);
    } catch (e) { console.warn('sidebar: no se pudo guardar prefs en Supabase', e); }
    _sbSyncBusy = false;
  }, 1000);
}

// Load sidebar prefs from Supabase (called after login)
async function sbCargarPrefsSupabase() {
  try {
    if (typeof sb === 'undefined' || typeof CU === 'undefined' || !CU) return;
    const { data } = await sb.from('perfiles').select('preferencias_sidebar').eq('id', CU.id).single();
    if (data && data.preferencias_sidebar) {
      const p = data.preferencias_sidebar;
      if (Array.isArray(p.favoritos) && p.favoritos.length) {
        sbFavoritos = p.favoritos;
        if (!sbFavoritos.includes('dashboard')) sbFavoritos.unshift('dashboard');
        localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
      }
      if (Array.isArray(p.hidden)) {
        sbHidden = p.hidden;
        localStorage.setItem('sb_hidden', JSON.stringify(sbHidden));
      }
      if (Array.isArray(p.shown)) {
        sbShown = p.shown;
        localStorage.setItem('sb_shown', JSON.stringify(sbShown));
      }
      if (p.collapsed && typeof p.collapsed === 'object') {
        sbCollapsed = p.collapsed;
        localStorage.setItem('sb_collapsed', JSON.stringify(sbCollapsed));
      }
      if (p.itemOrder && typeof p.itemOrder === 'object') {
        sbItemOrder = p.itemOrder;
        localStorage.setItem('sb_item_order', JSON.stringify(sbItemOrder));
      }
      if (Array.isArray(p.sectionOrder) && p.sectionOrder.length) {
        sbSectionOrder = p.sectionOrder;
        localStorage.setItem('sb_section_order', JSON.stringify(sbSectionOrder));
      }
      applySbOrder();
      renderFavoritos();
      applySbCollapsed();
    }
  } catch (e) { console.warn('sidebar: no se pudieron cargar prefs de Supabase', e); }
}

let _sbWasDragging = false;
function toggleSbSection(id, el) {
  // No toggle si acaba de hacer drag
  if (_sbWasDragging) { _sbWasDragging = false; return; }
  const sec = document.getElementById(id);
  if (!sec) return;
  const yaAbierta = !sec.classList.contains('collapsed');

  // Cerrar TODAS las secciones primero
  document.querySelectorAll('.sb-section-items').forEach(s => {
    s.classList.add('collapsed');
    const hdr = s.previousElementSibling;
    if (hdr && hdr.classList.contains('sb-sec')) hdr.classList.add('collapsed');
  });

  // Si estaba cerrada, abrirla (si estaba abierta, queda todo cerrado = acordeón)
  if (!yaAbierta) {
    sec.classList.remove('collapsed');
    el.classList.remove('collapsed');
  }

  // Guardar estado
  document.querySelectorAll('.sb-section-items').forEach(s => {
    sbCollapsed[s.id] = s.classList.contains('collapsed');
  });
  localStorage.setItem('sb_collapsed', JSON.stringify(sbCollapsed));
  _sbSaveToSupabase();
}

function applySbCollapsed() {
  Object.entries(sbCollapsed).forEach(([id, collapsed]) => {
    const sec = document.getElementById(id);
    if (sec && collapsed) {
      sec.classList.add('collapsed');
      const prev = sec.previousElementSibling;
      if (prev && prev.classList.contains('sb-sec')) prev.classList.add('collapsed');
    }
  });
}

function renderFavoritos() {
  const list = document.getElementById('sbFavList');
  if (!list) return;
  if (sbFavoritos.length === 0 && !favEditMode) {
    document.getElementById('sbFavSection').style.display = 'none';
    return;
  }
  document.getElementById('sbFavSection').style.display = 'block';

  if (favEditMode) {
    // ── MODO EDICIÓN: Lista única con ⭐ y 🙈 por cada item ──
    // Primero los favoritos actuales (reordenables), luego el resto
    let html = '<div style="font-size:11px;color:rgba(255,255,255,.45);padding:4px 11px 8px">⭐ = favorito &nbsp; 🙈 = ocultar del menú</div>';

    // Favoritos (con drag & drop)
    html += sbFavoritos.map((id, idx) => {
      const p = ALL_PAGES.find(x => x.id === id);
      if (!p) return '';
      const esFijo = id === 'dashboard';
      const isHidden = sbHidden.includes(id);
      const isProonto = PAGES_PRONTO.has(id);
      const hasPermission = userCanAccess(p.id);
      // Hide if no permission (unless admin/superadmin)
      if (!hasPermission) return '';
      return `<div ${esFijo?'':'draggable="true"'} data-idx="${idx}"
        ${esFijo?'':'ondragstart="favDragStart(event,'+idx+')" ondragover="favDragOver(event)" ondrop="favDrop(event,'+idx+')" ondragleave="favDragLeave(event)"'}
        style="display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:7px;color:#fff;font-size:14px;${esFijo?'opacity:.6;cursor:default':'cursor:grab'};transition:background .12s;user-select:none;border-left:3px solid rgba(255,200,0,.6)">
        <span style="opacity:.4;font-size:12px;flex-shrink:0;width:14px">${esFijo?'📌':'⠿'}</span>
        <span style="font-size:17px;width:20px;text-align:center;flex-shrink:0">${p.ico}</span>
        <span style="flex:1;font-size:13px">${p.label}${isProonto?' <span style="font-size:9px;opacity:.5;background:rgba(255,255,255,.15);padding:1px 5px;border-radius:3px">pronto</span>':(typeof PAGES_BETA!=='undefined'&&PAGES_BETA.has(id))?' <span style="font-size:9px;background:rgba(59,130,246,.35);color:#93c5fd;padding:1px 5px;border-radius:3px">beta</span>':''}</span>
        ${esFijo?'':`<button onclick="toggleFavItem('${id}')" style="background:none;border:none;cursor:pointer;font-size:15px;padding:2px;flex-shrink:0" title="Quitar de favoritos">⭐</button>`}
        ${esFijo?'':`<button onclick="toggleHideItem('${id}')" style="background:none;border:none;cursor:pointer;font-size:15px;padding:2px;flex-shrink:0;opacity:${isHidden?'1':'.3'}" title="${isHidden?'Mostrar':'Ocultar'}">${isHidden?'🙈':'🙈'}</button>`}
      </div>`;
    }).join('');

    // Separador
    html += '<div style="border-top:1px solid rgba(255,255,255,.12);margin:8px 4px"></div>';

    // Resto de items (no están en favoritos)
    const resto = ALL_PAGES.filter(p => !sbFavoritos.includes(p.id));
    html += resto.map(p => {
      const isHidden = sbHidden.includes(p.id);
      const isProonto = PAGES_PRONTO.has(p.id);
      const isShown = sbShown.includes(p.id);
      const hasPermission = userCanAccess(p.id);
      // Opacidad: oculto→.3, pronto (no activado)→.5, sin permiso→.15, visible→1
      let opacity = '1';
      if (isHidden) opacity = '.35';
      else if (!hasPermission) opacity = '.15';
      else if (isProonto && !isShown) opacity = '.5';
      return `<div style="display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:7px;color:#fff;font-size:14px;opacity:${opacity};transition:opacity .15s;${!hasPermission?'cursor:not-allowed':''}">
        <span style="width:14px;flex-shrink:0"></span>
        <span style="font-size:17px;width:20px;text-align:center;flex-shrink:0">${p.ico}</span>
        <span style="flex:1;font-size:13px">${p.label}${isProonto?' <span style="font-size:9px;opacity:.6;background:rgba(255,255,255,.15);padding:1px 5px;border-radius:3px">pronto</span>':(typeof PAGES_BETA!=='undefined'&&PAGES_BETA.has(p.id))?' <span style="font-size:9px;background:rgba(59,130,246,.35);color:#93c5fd;padding:1px 5px;border-radius:3px">beta</span>':''} ${!hasPermission?' <span style="font-size:9px;opacity:.6;background:rgba(255,100,100,.25);color:#ff9999;padding:1px 5px;border-radius:3px">sin acceso</span>':''}</span>
        <button onclick="${hasPermission?`toggleFavItem('${p.id}')`:'return'}" style="background:none;border:none;cursor:${hasPermission?'pointer':'not-allowed'};font-size:15px;padding:2px;flex-shrink:0;opacity:.3" title="${hasPermission?'Añadir a favoritos':'Sin permiso'}" ${!hasPermission?'disabled':''}}>⭐</button>
        <button onclick="${hasPermission?`toggleHideItem('${p.id}')`:'return'}" style="background:none;border:none;cursor:${hasPermission?'pointer':'not-allowed'};font-size:15px;padding:2px;flex-shrink:0;opacity:${isHidden?'1':'.3'}" title="${!hasPermission?'Sin permiso':(isHidden?'Mostrar':'Ocultar')}" ${!hasPermission?'disabled':''}>${isHidden?'🙈':'🙈'}</button>
      </div>`;
    }).join('');

    list.innerHTML = html;
  } else {
    // Modo normal — solo los favoritos como botones (con badges si aplica)
    list.innerHTML = sbFavoritos.map(id => {
      const p = ALL_PAGES.find(x => x.id === id);
      if (!p) return '';
      if (!userCanAccess(p.id)) return '';
      let badge = '';
      if (id === 'correo') badge = '<span id="fav-correo-badge" style="display:none;margin-left:auto;background:var(--rojo);color:#fff;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700"></span>';
      if (id === 'mistareas') badge = '<span id="fav-tareas-badge" style="display:none;margin-left:auto;background:#ef4444;color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;padding:0 5px;align-items:center;justify-content:center"></span>';
      return `<button class="sb-fav-item" onclick="goPage('${p.id}')">
        <span style="font-size:18px;width:21px;text-align:center;flex-shrink:0">${p.ico}</span>
        <span>${p.label}</span>
        ${badge}
      </button>`;
    }).join('');
  }

  applySbItemVisibility();
}

// Check if user has permission to access a page
function userCanAccess(pageId) {
  // Permission-free pages
  const pagesLibres = ['dashboard', 'calendario', 'mistareas', 'correo', 'fichajes'];
  if (pagesLibres.includes(pageId)) return true;

  // Check if user has permission
  if (typeof CP === 'undefined' || !CP) return false;
  if (CP.es_superadmin || CP.rol === 'admin') return true;
  if (!CP.permisos) return false;

  // Get required permission for this page
  const _permisosPagina = {
    'clientes': 'clientes',
    'presupuestos': 'presupuestos',
    'albaranes': 'facturas',
    'facturas': 'facturas',
    'rectificativas': 'facturas',
    'proveedores': 'compras',
    'presupuestos-compra': 'compras',
    'pedidos-compra': 'compras',
    'albaranes-proveedor': 'compras',
    'facturas-proveedor': 'compras',
    'calendario-pagos': 'compras',
    'ocr': 'compras',
    'flota': 'flota',
    'flota-gastos': 'flota',
    'articulos': 'stock',
    'servicios': 'stock',
    'stock': 'stock',
    'consumos': 'stock',
    'incidencias-stock': 'stock',
    'traspasos': 'stock',
    'activos': 'stock',
    'trabajos': 'trabajos',
    'mantenimientos': 'trabajos',
    'partes': 'partes',
    'planificador': 'partes',
    'usuarios': 'usuarios',
    'configuracion': 'config',
    'audit-log': 'usuarios',
    'etiquetas-qr': 'stock',
    'papelera': 'usuarios'
  };

  const permNeeded = _permisosPagina[pageId];
  if (!permNeeded) return true; // Unknown pages are allowed
  return CP.permisos[permNeeded] !== false;
}

// Ocultar/mostrar items del sidebar principal
function applySbItemVisibility() {
  document.querySelectorAll('.sb-item').forEach(btn => {
    const match = btn.getAttribute('onclick')?.match(/goPage\('([^']+)'\)/);
    if (!match) return;
    const pageId = match[1];
    const inFavs = sbFavoritos.includes(pageId);
    const isHidden = sbHidden.includes(pageId);
    const isProonto = PAGES_PRONTO.has(pageId) && !sbShown.includes(pageId);
    const hasPermission = userCanAccess(pageId);

    // Check si el módulo está contratado
    const mapping = typeof PAGE_PERM_MAP !== 'undefined' ? PAGE_PERM_MAP[pageId] : null;
    const modContratado = mapping ? (typeof moduloActivo === 'function' ? moduloActivo(mapping.sec) : true) : true;

    // Quitar clase locked previa
    btn.classList.remove('sb-locked');
    const oldLock = btn.querySelector('.sb-lock-badge');
    if (oldLock) oldLock.remove();

    if (!modContratado) {
      // Módulo no contratado → mostrar con candado
      btn.style.display = (inFavs || isHidden) ? 'none' : '';
      btn.style.opacity = '0.45';
      btn.style.pointerEvents = 'auto';
      btn.classList.add('sb-locked');
      if (!btn.querySelector('.sb-lock-badge')) {
        btn.insertAdjacentHTML('beforeend', '<span class="sb-lock-badge" style="margin-left:auto;font-size:11px">🔒</span>');
      }
    } else if (inFavs || isHidden || isProonto || !hasPermission) {
      btn.style.display = 'none';
      btn.style.opacity = '';
    } else {
      btn.style.display = '';
      btn.style.opacity = '';
    }
  });
  // Ocultar secciones enteras si todos sus items están ocultos
  document.querySelectorAll('.sb-section-items').forEach(sec => {
    const visibles = sec.querySelectorAll('.sb-item:not([style*="display: none"])');
    const header = sec.previousElementSibling;
    if (header && header.classList.contains('sb-sec')) {
      header.style.display = visibles.length === 0 ? 'none' : '';
    }
    if (visibles.length === 0) sec.style.display = 'none';
    else sec.style.display = '';
  });
  // Aplicar permisos CRUD a botones de acción (crear/editar/eliminar)
  if (typeof applyPermButtons === 'function') applyPermButtons();
}

// Drag & Drop para reordenar favoritos
let favDragIdx = null;

function favDragStart(e, idx) {
  favDragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
}

function favDragOver(e) {
  e.preventDefault();
  e.currentTarget.style.background = 'rgba(255,255,255,.15)';
}

function favDragLeave(e) {
  e.currentTarget.style.background = '';
}

function favDrop(e, idx) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  if (favDragIdx === null || favDragIdx === idx) return;
  const item = sbFavoritos.splice(favDragIdx, 1)[0];
  sbFavoritos.splice(idx, 0, item);
  localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
  _sbSaveToSupabase();
  favDragIdx = null;
  renderFavoritos();
}

function toggleFavEdit() {
  favEditMode = !favEditMode;
  document.getElementById('btnFavEdit').textContent = favEditMode ? '✓' : '✏️';
  renderFavoritos();
}

// Toggle favorito: si está, lo quita; si no está, lo añade
function toggleFavItem(id) {
  if (id === 'dashboard') return;
  if (sbFavoritos.includes(id)) {
    sbFavoritos = sbFavoritos.filter(x => x !== id);
  } else {
    sbFavoritos.push(id);
  }
  localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
  _sbSaveToSupabase();
  renderFavoritos();
}

// Toggle ocultar: si está oculto, lo muestra; si no, lo oculta
function toggleHideItem(id) {
  if (id === 'dashboard') return;
  if (sbHidden.includes(id)) {
    sbHidden = sbHidden.filter(x => x !== id);
  } else {
    sbHidden.push(id);
    // Si lo ocultas y estaba en favoritos, quitarlo también
    if (sbFavoritos.includes(id)) {
      sbFavoritos = sbFavoritos.filter(x => x !== id);
      localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
    }
  }
  localStorage.setItem('sb_hidden', JSON.stringify(sbHidden));
  _sbSaveToSupabase();
  renderFavoritos();
}

// Compat: old function names
function addFav(id) { toggleFavItem(id); }
function removeFav(id) { toggleFavItem(id); }
function toggleHideSbItem(id) { toggleHideItem(id); }
function toggleShowProonto(id) {
  if (sbShown.includes(id)) {
    sbShown = sbShown.filter(x => x !== id);
  } else {
    sbShown.push(id);
  }
  localStorage.setItem('sb_shown', JSON.stringify(sbShown));
  _sbSaveToSupabase();
  renderFavoritos();
}

// ═══════════════════════════════════════════════
// REORDENAR — Drag & drop de items y secciones
// ═══════════════════════════════════════════════

// Helper: extraer pageId de un .sb-item
function _sbGetPageId(item) {
  const m = item.getAttribute('onclick')?.match(/goPage\('([^']+)'\)/);
  return m ? m[1] : null;
}

// Helper: obtener el secId (id del .sb-section-items) de un .sb-item
function _sbGetSectionOf(item) {
  const parent = item.closest('.sb-section-items');
  return parent ? parent.id : null;
}

// ── Aplicar orden guardado al DOM ──
function applySbOrder() {
  const nav = document.getElementById('sbNav');
  if (!nav) return;

  // 1. Reordenar items dentro de sus secciones
  for (const [secId, order] of Object.entries(sbItemOrder)) {
    const sec = document.getElementById(secId);
    if (!sec || !Array.isArray(order)) continue;
    const items = Array.from(sec.querySelectorAll('.sb-item'));
    const itemMap = {};
    items.forEach(item => {
      const pid = _sbGetPageId(item);
      if (pid) itemMap[pid] = item;
    });
    // Append in saved order (items not in order stay at the end)
    for (const pid of order) {
      if (itemMap[pid]) {
        sec.appendChild(itemMap[pid]);
        delete itemMap[pid];
      }
    }
    // Remaining items (new pages not yet in saved order)
    for (const item of Object.values(itemMap)) {
      sec.appendChild(item);
    }
  }

  // 2. Reordenar secciones
  if (sbSectionOrder.length) {
    // Recoger los "grupos" de sección: header + items (o #adminSection wrapper)
    const groups = {};
    const children = Array.from(nav.children);
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (el.id === 'sbFavSection') continue; // Favoritos siempre primero
      if (el.id === 'adminSection') {
        const secItems = el.querySelector('.sb-section-items');
        if (secItems) groups[secItems.id] = [el];
      } else if (el.classList.contains('sb-sec')) {
        const next = children[i + 1];
        if (next && next.classList.contains('sb-section-items')) {
          groups[next.id] = [el, next];
          i++;
        }
      }
    }
    // Append en orden guardado
    for (const secId of sbSectionOrder) {
      if (groups[secId]) {
        groups[secId].forEach(el => nav.appendChild(el));
        delete groups[secId];
      }
    }
    // Secciones que no estaban en el orden guardado (nuevas)
    for (const els of Object.values(groups)) {
      els.forEach(el => nav.appendChild(el));
    }
  }
}

// ── Guardar orden actual del DOM ──
function _sbSaveCurrentOrder() {
  const nav = document.getElementById('sbNav');
  if (!nav) return;

  // Items dentro de cada sección
  const newItemOrder = {};
  nav.querySelectorAll('.sb-section-items').forEach(sec => {
    const order = [];
    sec.querySelectorAll('.sb-item').forEach(item => {
      const pid = _sbGetPageId(item);
      if (pid) order.push(pid);
    });
    if (order.length) newItemOrder[sec.id] = order;
  });
  sbItemOrder = newItemOrder;
  localStorage.setItem('sb_item_order', JSON.stringify(sbItemOrder));

  // Orden de secciones
  const newSectionOrder = [];
  const children = Array.from(nav.children);
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.id === 'sbFavSection') continue;
    if (el.id === 'adminSection') {
      const secItems = el.querySelector('.sb-section-items');
      if (secItems) newSectionOrder.push(secItems.id);
    } else if (el.classList.contains('sb-section-items')) {
      newSectionOrder.push(el.id);
    }
  }
  sbSectionOrder = newSectionOrder;
  localStorage.setItem('sb_section_order', JSON.stringify(sbSectionOrder));

  _sbSaveToSupabase();
}

// ── Drag & drop — ITEMS dentro de secciones ──
let _sbDragItem = null;
let _sbDragSec = null;

function _sbItemDragStart(e) {
  _sbDragItem = e.currentTarget;
  _sbDragSec = _sbGetSectionOf(_sbDragItem);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'item');
  setTimeout(() => _sbDragItem.classList.add('sb-dragging'), 0);
}

function _sbItemDragOver(e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (!_sbDragItem || target === _sbDragItem) return;
  // Solo permitir drop dentro de la misma sección
  if (_sbGetSectionOf(target) !== _sbDragSec) return;
  e.dataTransfer.dropEffect = 'move';
  // Mostrar indicador arriba/abajo
  const rect = target.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  target.classList.remove('sb-drop-above', 'sb-drop-below');
  target.classList.add(e.clientY < midY ? 'sb-drop-above' : 'sb-drop-below');
}

function _sbItemDragLeave(e) {
  e.currentTarget.classList.remove('sb-drop-above', 'sb-drop-below');
}

function _sbItemDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove('sb-drop-above', 'sb-drop-below');
  if (!_sbDragItem || target === _sbDragItem) return;
  if (_sbGetSectionOf(target) !== _sbDragSec) return;

  const parent = target.parentElement;
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  if (before) {
    parent.insertBefore(_sbDragItem, target);
  } else {
    parent.insertBefore(_sbDragItem, target.nextSibling);
  }
  _sbSaveCurrentOrder();
}

function _sbItemDragEnd(e) {
  if (_sbDragItem) {
    _sbDragItem.classList.remove('sb-dragging');
    // Prevenir que el click del drop navegue a otra página
    _sbDragItem.addEventListener('click', _sbPreventClick, { once: true, capture: true });
    setTimeout(() => _sbDragItem?.removeEventListener('click', _sbPreventClick, { capture: true }), 100);
  }
  document.querySelectorAll('.sb-drop-above,.sb-drop-below').forEach(el => {
    el.classList.remove('sb-drop-above', 'sb-drop-below');
  });
  _sbDragItem = null;
  _sbDragSec = null;
}

function _sbPreventClick(e) { e.stopPropagation(); e.preventDefault(); }

// ── Drag & drop — SECCIONES ──
let _sbDragSecHeader = null;

function _sbSecDragStart(e) {
  _sbDragSecHeader = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'section');
  setTimeout(() => _sbDragSecHeader.classList.add('sb-dragging'), 0);
}

function _sbSecDragOver(e) {
  e.preventDefault();
  if (!_sbDragSecHeader) return;
  const target = e.currentTarget;
  if (target === _sbDragSecHeader) return;
  e.dataTransfer.dropEffect = 'move';
  const rect = target.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  target.classList.remove('sb-drop-above', 'sb-drop-below');
  target.classList.add(e.clientY < midY ? 'sb-drop-above' : 'sb-drop-below');
}

function _sbSecDragLeave(e) {
  e.currentTarget.classList.remove('sb-drop-above', 'sb-drop-below');
}

function _sbSecDrop(e) {
  e.preventDefault();
  const targetHeader = e.currentTarget;
  targetHeader.classList.remove('sb-drop-above', 'sb-drop-below');
  if (!_sbDragSecHeader || targetHeader === _sbDragSecHeader) return;

  const nav = document.getElementById('sbNav');
  if (!nav) return;

  // Obtener elementos a mover (header + items, o adminSection wrapper)
  const dragEls = _sbGetSectionEls(_sbDragSecHeader);
  const targetEls = _sbGetSectionEls(targetHeader);
  if (!dragEls.length || !targetEls.length) return;

  const rect = targetHeader.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  const refEl = before ? targetEls[0] : targetEls[targetEls.length - 1].nextSibling;

  // Mover todos los elementos del grupo
  dragEls.forEach(el => {
    if (refEl) nav.insertBefore(el, refEl);
    else nav.appendChild(el);
  });

  _sbSaveCurrentOrder();
}

function _sbSecDragEnd() {
  if (_sbDragSecHeader) {
    _sbDragSecHeader.classList.remove('sb-dragging');
    _sbWasDragging = true; // Evitar que el click toggle la sección
    setTimeout(() => { _sbWasDragging = false; }, 100);
  }
  document.querySelectorAll('.sb-drop-above,.sb-drop-below').forEach(el => {
    el.classList.remove('sb-drop-above', 'sb-drop-below');
  });
  _sbDragSecHeader = null;
}

// Helper: obtener los elementos DOM de una sección (header + items, o adminSection)
function _sbGetSectionEls(header) {
  // Admin section está envuelto en #adminSection
  const adminWrap = header.closest('#adminSection');
  if (adminWrap) return [adminWrap];
  // Normal: header + siguiente .sb-section-items
  const next = header.nextElementSibling;
  if (next && next.classList.contains('sb-section-items')) return [header, next];
  return [header];
}

// ── Inicializar drag & drop en el sidebar ──
function initSbDragDrop() {
  // Items: hacer draggable cada .sb-item
  document.querySelectorAll('.sb-section-items .sb-item').forEach(item => {
    if (item._sbDragInit) return;
    item._sbDragInit = true;
    item.draggable = true;
    item.addEventListener('dragstart', _sbItemDragStart);
    item.addEventListener('dragover', _sbItemDragOver);
    item.addEventListener('dragleave', _sbItemDragLeave);
    item.addEventListener('drop', _sbItemDrop);
    item.addEventListener('dragend', _sbItemDragEnd);
  });

  // Secciones: hacer draggable cada .sb-sec header
  document.querySelectorAll('#sbNav .sb-sec').forEach(sec => {
    if (sec._sbDragInit) return;
    sec._sbDragInit = true;
    sec.draggable = true;
    sec.addEventListener('dragstart', _sbSecDragStart);
    sec.addEventListener('dragover', _sbSecDragOver);
    sec.addEventListener('dragleave', _sbSecDragLeave);
    sec.addEventListener('drop', _sbSecDrop);
    sec.addEventListener('dragend', _sbSecDragEnd);
  });
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
  applySbOrder();
  initSbDragDrop();
});
