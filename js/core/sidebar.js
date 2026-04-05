// ═══════════════════════════════════════════════
// SIDEBAR - Navigation, collapsible sections, and favorites management
// ═══════════════════════════════════════════════

const ALL_PAGES = [
  {id:'dashboard',ico:'🏠',label:'Panel'},
  {id:'clientes',ico:'👥',label:'Clientes'},
  {id:'presupuestos',ico:'📋',label:'Presupuestos'},
  {id:'albaranes',ico:'📄',label:'Albaranes'},
  {id:'facturas',ico:'🧾',label:'Facturas'},
  {id:'proveedores',ico:'🏭',label:'Proveedores'},
  {id:'presupuestos-compra',ico:'📋',label:'Presupuestos compra'},
  {id:'pedidos-compra',ico:'🛒',label:'Pedidos'},
  {id:'albaranes-proveedor',ico:'📥',label:'Albaranes prov.'},
  {id:'facturas-proveedor',ico:'📑',label:'Facturas prov.'},
  {id:'calendario-pagos',ico:'📅',label:'Calendario pagos'},
  {id:'articulos',ico:'📦',label:'Artículos'},
  {id:'almacenes',ico:'🏪',label:'Almacenes'},
  {id:'stock',ico:'📊',label:'Stock'},
  {id:'traspasos',ico:'🔄',label:'Traspasos'},
  {id:'activos',ico:'🔧',label:'Activos'},
  {id:'trabajos',ico:'🏗️',label:'Obras'},
  {id:'mantenimientos',ico:'🔧',label:'Mantenimientos'},
  {id:'partes',ico:'📝',label:'Partes'},
  {id:'planificador',ico:'⏱️',label:'Planificador Semanal'},
  {id:'calendario',ico:'📅',label:'Calendario'},
  {id:'mistareas',ico:'✅',label:'Tareas'},
  {id:'correo',ico:'📧',label:'Correo'},
  {id:'fichajes',ico:'⏱️',label:'Fichajes'},
  {id:'usuarios',ico:'👷',label:'Usuarios'},
  {id:'etiquetas-qr',ico:'🏷️',label:'Etiquetas QR'},
  {id:'audit-log',ico:'📜',label:'Registro actividad'},
  {id:'papelera',ico:'🗑️',label:'Papelera'},
  {id:'configuracion',ico:'⚙️',label:'Configuración'},
];

// Páginas marcadas como "pronto" — se ocultan automáticamente del sidebar
const PAGES_PRONTO = new Set([
  'almacenes','stock',
  'traspasos','activos','mantenimientos','fichajes','etiquetas-qr'
]);

// Páginas en modo BETA — funcionan pero se marca con badge
const PAGES_BETA = new Set([
  'facturas','proveedores','presupuestos-compra','pedidos-compra',
  'albaranes-proveedor','facturas-proveedor','calendario-pagos','correo'
]);

let sbCollapsed = JSON.parse(localStorage.getItem('sb_collapsed')||'{}');
let sbFavoritos = JSON.parse(localStorage.getItem('sb_favoritos')||'["clientes","trabajos","presupuestos"]');
let sbHidden = JSON.parse(localStorage.getItem('sb_hidden')||'[]');
let sbShown = JSON.parse(localStorage.getItem('sb_shown')||'[]');
if (!sbFavoritos.includes('dashboard')) { sbFavoritos.unshift('dashboard'); localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos)); }
let favEditMode = false;

function toggleSbSection(id, el) {
  // Cuando el sidebar está en modo hover-expanded, el hover de secciones lo gestiona ui.js
  if (document.body.classList.contains('sb-hover-expanded')) return;
  if (document.body.classList.contains('sb-collapsed')) return;
  const sec = document.getElementById(id);
  if (!sec) return;
  const isCollapsed = sec.classList.toggle('collapsed');
  el.classList.toggle('collapsed', isCollapsed);
  sbCollapsed[id] = isCollapsed;
  localStorage.setItem('sb_collapsed', JSON.stringify(sbCollapsed));
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
  if (CP.es_superadmin) return true;
  if (!CP.permisos) return false;

  // Get required permission for this page
  const _permisosPagina = {
    'clientes': 'clientes',
    'presupuestos': 'presupuestos',
    'albaranes': 'facturas',
    'facturas': 'facturas',
    'proveedores': 'clientes',
    'presupuestos-compra': 'presupuestos',
    'pedidos-compra': 'presupuestos',
    'albaranes-proveedor': 'facturas',
    'facturas-proveedor': 'facturas',
    'calendario-pagos': 'facturas',
    'articulos': 'stock',
    'stock': 'stock',
    'traspasos': 'stock',
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
    btn.style.display = (inFavs || isHidden || isProonto || !hasPermission) ? 'none' : '';
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
  renderFavoritos();
}
