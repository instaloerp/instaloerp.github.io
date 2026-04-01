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
  {id:'articulos',ico:'📦',label:'Artículos'},
  {id:'almacenes',ico:'🏪',label:'Almacenes'},
  {id:'stock',ico:'📊',label:'Stock'},
  {id:'traspasos',ico:'🔄',label:'Traspasos'},
  {id:'activos',ico:'🔧',label:'Activos'},
  {id:'trabajos',ico:'🏗️',label:'Obras'},
  {id:'partes',ico:'📝',label:'Partes'},
  {id:'fichajes',ico:'⏱️',label:'Fichajes'},
  {id:'usuarios',ico:'👷',label:'Usuarios'},
  {id:'configuracion',ico:'⚙️',label:'Configuración'},
];

let sbCollapsed = JSON.parse(localStorage.getItem('sb_collapsed')||'{}');
let sbFavoritos = JSON.parse(localStorage.getItem('sb_favoritos')||'["clientes","trabajos","presupuestos"]');
// Asegurar que dashboard siempre está primero en favoritos
if (!sbFavoritos.includes('dashboard')) { sbFavoritos.unshift('dashboard'); localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos)); }
let favEditMode = false;

function toggleSbSection(id, el) {
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
      // Also mark the header
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
    // Modo edición con drag & drop
    list.innerHTML = sbFavoritos.map((id, idx) => {
      const p = ALL_PAGES.find(x => x.id === id);
      if (!p) return '';
      const esFijo = id === 'dashboard';
      return `<div ${esFijo?'':'draggable="true"'} data-idx="${idx}"
        ${esFijo?'':'ondragstart="favDragStart(event,'+idx+')" ondragover="favDragOver(event)" ondrop="favDrop(event,'+idx+')" ondragleave="favDragLeave(event)"'}
        style="display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:7px;color:#fff;font-size:15px;${esFijo?'opacity:.7;cursor:default':'cursor:grab'};transition:background .12s;user-select:none">
        <span style="opacity:.5;font-size:14px;flex-shrink:0">${esFijo?'📌':'⠿'}</span>
        <span style="font-size:18px;width:21px;text-align:center;flex-shrink:0">${p.ico}</span>
        <span style="flex:1">${p.label}${esFijo?' <span style="font-size:10px;opacity:.6">(fijo)</span>':''}</span>
        ${esFijo?'':`<span onclick="removeFav('${id}')" style="color:var(--rojo);font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0">✕</span>`}
      </div>`;
    }).join('');

    const available = ALL_PAGES.filter(p => !sbFavoritos.includes(p.id));
    if (available.length) {
      list.innerHTML += '<div style="border-top:1px solid rgba(255,255,255,.15);margin:8px 4px;padding-top:8px">' +
        '<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.6);padding:0 7px 6px">Añadir a favoritos:</div>' +
        available.map(p => `<button class="sb-fav-item" onclick="addFav('${p.id}')">
          <span style="font-size:18px;width:21px;text-align:center;flex-shrink:0">${p.ico}</span>
          <span style="flex:1">${p.label}</span>
          <span style="color:var(--verde);font-size:18px;font-weight:700;flex-shrink:0">+</span>
        </button>`).join('') + '</div>';
    }
  } else {
    // Modo normal
    list.innerHTML = sbFavoritos.map(id => {
      const p = ALL_PAGES.find(x => x.id === id);
      if (!p) return '';
      return `<button class="sb-fav-item" onclick="goPage('${p.id}')">
        <span style="font-size:18px;width:21px;text-align:center;flex-shrink:0">${p.ico}</span>
        <span>${p.label}</span>
      </button>`;
    }).join('');
  }
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

function addFav(id) {
  if (!sbFavoritos.includes(id)) {
    sbFavoritos.push(id);
    localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
    renderFavoritos();
  }
}

function removeFav(id) {
  if (id === 'dashboard') return; // Panel siempre fijo
  sbFavoritos = sbFavoritos.filter(x => x !== id);
  localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
  renderFavoritos();
}
