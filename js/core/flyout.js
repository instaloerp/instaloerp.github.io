// ═══════════════════════════════════════════════
// FLYOUT — Hover menus for the icon-bar sidebar
// ═══════════════════════════════════════════════

const FLYOUT_SECTIONS = {
  favoritos: { label: 'Favoritos', buildFn: '_buildFavoritosFlyout' },
  ventas: { label: 'Ventas', items: [
    { id:'clientes', ico:'👥', name:'Clientes' },
    { id:'presupuestos', ico:'📋', name:'Presupuestos' },
    { id:'albaranes', ico:'📄', name:'Albaranes' },
    { id:'facturas', ico:'🧾', name:'Facturas' },
    { id:'rectificativas', ico:'📝', name:'Rectificativas' }
  ]},
  compras: { label: 'Compras', items: [
    { id:'proveedores', ico:'🏭', name:'Proveedores', tag:'beta' },
    { id:'presupuestos-compra', ico:'📋', name:'Presupuestos', tag:'beta' },
    { id:'pedidos-compra', ico:'🛒', name:'Pedidos', tag:'beta' },
    { id:'albaranes-proveedor', ico:'📥', name:'Albaranes', tag:'beta' },
    { id:'facturas-proveedor', ico:'📑', name:'Facturas prov.', tag:'beta' },
    { id:'calendario-pagos', ico:'📅', name:'Calendario pagos', tag:'beta' },
    { id:'ocr', ico:'🤖', name:'Bandeja OCR', tag:'beta', badgeId:'ocrBadge' }
  ]},
  almacen: { label: 'Almacén', items: [
    { id:'articulos', ico:'📦', name:'Artículos' },
    { id:'servicios', ico:'🛠️', name:'Servicios' },
    { id:'almacenes', ico:'🏪', name:'Almacenes' },
    { id:'stock', ico:'📊', name:'Stock' },
    { id:'consumos', ico:'🔧', name:'Consumos' },
    { id:'incidencias-stock', ico:'⚠️', name:'Incidencias' },
    { id:'traspasos', ico:'🔄', name:'Traspasos', tag:'pronto' },
    { id:'activos', ico:'🔧', name:'Activos', tag:'pronto' }
  ]},
  obras: { label: 'Gestión de obras', items: [
    { id:'trabajos', ico:'🏗️', name:'Obras' },
    { id:'mantenimientos', ico:'🔧', name:'Mantenimientos', tag:'pronto' },
    { id:'partes', ico:'📝', name:'Partes', tag:'beta' },
    { id:'planificador', ico:'⏱️', name:'Planificador Semanal', tag:'beta' },
    { id:'calendario', ico:'📅', name:'Calendario', tag:'beta' },
    { id:'mistareas', ico:'✅', name:'Tareas', tag:'beta', badgeId:'sbBadgeTareas' }
  ]},
  flota: { label: 'Flota', items: [
    { id:'flota', ico:'🚐', name:'Vehículos' },
    { id:'flota-gastos', ico:'💰', name:'Gastos' }
  ]},
  tesoreria: { label: 'Tesorería', items: [
    { id:'tesoreria-cuentas', ico:'🏦', name:'Cuentas bancarias' },
    { id:'tesoreria-movimientos', ico:'📊', name:'Movimientos' },
    { id:'tesoreria-conciliacion', ico:'🔗', name:'Conciliación' },
    { id:'tesoreria-importar', ico:'📥', name:'Importar extractos' }
  ]},
  companias: { label: 'Compañías', items: [
    { id:'asitur', ico:'🛡️', name:'Asitur' }
  ]},
  comunicacion: { label: 'Comunicaciones', items: [
    { id:'correo', ico:'📧', name:'Correo', badgeId:'correo-badge' },
    { id:'mensajes', ico:'💬', name:'Mensajes', badgeId:'chat-badge' }
  ]},
  personal: { label: 'Personal', items: [
    { id:'fichajes', ico:'⏱️', name:'Fichajes' },
    { id:'ausencias', ico:'📋', name:'Ausencias' },
    { id:'timeline', ico:'👥', name:'Timeline' },
    { id:'calendario-laboral', ico:'📅', name:'Calendario laboral' }
  ]},
  config: { label: 'Configuración', items: [
    { id:'_empresas', ico:'🏢', name:'Empresas', action:"openModal('mEmpresas')" },
    { id:'usuarios', ico:'👷', name:'Usuarios', tag:'beta' },
    { id:'etiquetas-qr', ico:'🏷️', name:'Etiquetas QR', tag:'pronto' },
    { id:'audit-log', ico:'📜', name:'Registro actividad', tag:'beta' },
    { id:'papelera', ico:'🗑️', name:'Papelera', tag:'beta' },
    { id:'laboratorio', ico:'🧪', name:'Laboratorio', tag:'dev' },
    { id:'configuracion', ico:'⚙️', name:'Configuración', tag:'beta' }
  ]}
};

let _flyoutHideTimer = null;
let _flyoutCurrentEl = null;

function _getBadgeCount(badgeId) {
  const el = document.getElementById(badgeId);
  if (!el || el.style.display === 'none') return 0;
  return parseInt(el.textContent) || 0;
}

function _buildTagHtml(tag) {
  if (!tag) return '';
  const cls = tag === 'beta' ? 'fly-tag-beta' : tag === 'pronto' ? 'fly-tag-pronto' : 'fly-tag-dev';
  return `<span class="fly-tag ${cls}">${tag}</span>`;
}

function _buildSectionFlyout(sec) {
  let html = `<div class="fly-title">${sec.label}</div>`;
  for (const it of sec.items) {
    // Check permissions
    if (typeof userCanAccess === 'function' && !userCanAccess(it.id)) continue;
    // Check hidden
    if (typeof sbHidden !== 'undefined' && sbHidden.includes(it.id)) continue;
    // Check pronto
    if (typeof PAGES_PRONTO !== 'undefined' && PAGES_PRONTO.has(it.id) &&
        (typeof sbShown === 'undefined' || !sbShown.includes(it.id))) continue;

    const badgeCount = it.badgeId ? _getBadgeCount(it.badgeId) : 0;
    const action = it.action || `goPage('${it.id}')`;

    html += `<div class="fly-item" onclick="${action};_hideFlyout(true)">`;
    html += `<span class="ico">${it.ico}</span>${it.name}`;
    if (badgeCount > 0) html += `<span class="fly-badge">${badgeCount}</span>`;
    else html += _buildTagHtml(it.tag);
    html += `</div>`;
  }
  return html;
}

function _buildFavoritosFlyout() {
  let html = '<div class="fly-title">Favoritos</div>';
  const favs = typeof sbFavoritos !== 'undefined' ? sbFavoritos : ['dashboard'];
  const pages = typeof ALL_PAGES !== 'undefined' ? ALL_PAGES : [];

  for (const id of favs) {
    const p = pages.find(x => x.id === id);
    if (!p) continue;
    if (typeof userCanAccess === 'function' && !userCanAccess(p.id)) continue;
    html += `<div class="fly-item" onclick="goPage('${p.id}');_hideFlyout(true)">`;
    html += `<span class="ico">${p.ico}</span>${p.label}`;
    html += `</div>`;
  }

  // Edit button
  html += `<div style="border-top:1px solid var(--gris-200);margin-top:4px;padding-top:4px">`;
  html += `<div class="fly-item" onclick="goPage('dashboard');toggleFavEdit();_hideFlyout(true)" style="color:var(--gris-400)">`;
  html += `<span class="ico">✏️</span>Editar favoritos</div></div>`;
  return html;
}

function _buildUserFlyout() {
  const nombre = document.getElementById('sbNombre')?.textContent || '...';
  const rol = document.getElementById('sbRol')?.textContent || '';
  const email = (typeof CU !== 'undefined' && CU?.email) ? CU.email : '';

  let html = `<div class="fly-user-header">`;
  html += `<div class="fly-user-name">${nombre}</div>`;
  html += `<div class="fly-user-role">${rol}</div>`;
  if (email) html += `<div class="fly-user-email">${email}</div>`;
  html += `</div>`;
  // Versión y build
  const buildEl = document.getElementById('erpBuildVersion');
  const buildTxt = buildEl ? buildEl.textContent : '';
  if (buildTxt) html += `<div style="padding:4px 14px;font-size:10px;color:var(--gris-300);border-bottom:1px solid var(--gris-100);margin-bottom:2px">${buildTxt}</div>`;
  html += `<div class="fly-item fly-danger" onclick="_confirmarCerrarSesion()"><span class="ico">⏻</span>Cerrar sesión</div>`;
  return html;
}

function _confirmarCerrarSesion() {
  _hideFlyout(true);
  doLogout(); // doLogout ya tiene su propio confirm()
}

function _showFlyout(el, html) {
  clearTimeout(_flyoutHideTimer);
  const flyout = document.getElementById('sbFlyout');
  if (!flyout) return;

  flyout.innerHTML = html;
  flyout.classList.add('show');

  // Position vertically aligned to the icon
  const rect = el.getBoundingClientRect();
  const flyH = flyout.offsetHeight;
  const maxTop = window.innerHeight - flyH - 10;
  let top = rect.top;
  if (top > maxTop) top = maxTop;
  if (top < 8) top = 8;
  flyout.style.top = top + 'px';

  _flyoutCurrentEl = el;
}

function _hideFlyout(immediate) {
  clearTimeout(_flyoutHideTimer);
  if (immediate) {
    const flyout = document.getElementById('sbFlyout');
    if (flyout) flyout.classList.remove('show');
    document.querySelectorAll('.ib-item.ib-active').forEach(i => i.classList.remove('ib-active'));
    _flyoutCurrentEl = null;
  } else {
    _flyoutHideTimer = setTimeout(() => {
      const flyout = document.getElementById('sbFlyout');
      if (flyout) flyout.classList.remove('show');
      document.querySelectorAll('.ib-item.ib-active').forEach(i => i.classList.remove('ib-active'));
      _flyoutCurrentEl = null;
    }, 200);
  }
}

function _showTooltip(el) {
  const tip = document.getElementById('sbTooltip');
  if (!tip) return;
  tip.textContent = el.dataset.tip || '';
  const rect = el.getBoundingClientRect();
  tip.style.top = (rect.top + rect.height / 2 - 12) + 'px';
  tip.style.display = 'block';
}

function _hideTooltip() {
  const tip = document.getElementById('sbTooltip');
  if (tip) tip.style.display = 'none';
}

// Initialize flyout behavior
function initFlyout() {
  const flyout = document.getElementById('sbFlyout');
  if (!flyout) return;

  // Flyout keeps open when mouse enters it
  flyout.addEventListener('mouseenter', () => clearTimeout(_flyoutHideTimer));
  flyout.addEventListener('mouseleave', () => _hideFlyout());

  // Icon bar items
  document.querySelectorAll('.ib-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const secKey = el.dataset.flyout;
      if (secKey) {
        const sec = FLYOUT_SECTIONS[secKey];
        if (!sec) return;
        let html;
        if (sec.buildFn) {
          html = window[sec.buildFn]();
        } else {
          html = _buildSectionFlyout(sec);
        }
        _showFlyout(el, html);
        _hideTooltip();
      } else {
        // No flyout — show tooltip
        _showTooltip(el);
      }
      el.classList.add('ib-active');
    });

    el.addEventListener('mouseleave', () => {
      _hideTooltip();
      if (!el.dataset.flyout) el.classList.remove('ib-active');
      _hideFlyout();
    });
  });

  // Avatar (user flyout)
  const avatar = document.getElementById('sbAv');
  if (avatar) {
    avatar.addEventListener('mouseenter', () => {
      _showFlyout(avatar, _buildUserFlyout());
    });
    avatar.addEventListener('mouseleave', () => _hideFlyout());
  }
}

// Show/hide admin config icon based on adminSection visibility
function _syncAdminIcon() {
  const adminSection = document.getElementById('adminSection');
  const ibAdmin = document.getElementById('ibAdminItem');
  if (ibAdmin && adminSection) {
    ibAdmin.style.display = (adminSection.style.display !== 'none') ? 'flex' : 'none';
  }
}

// Observe adminSection for style changes
function _observeAdminSection() {
  const adminSection = document.getElementById('adminSection');
  if (!adminSection) return;
  const observer = new MutationObserver(() => _syncAdminIcon());
  observer.observe(adminSection, { attributes: true, attributeFilter: ['style'] });
}

// Update logo if empresa has logo_url
function _syncLogo() {
  if (typeof EMPRESA !== 'undefined' && EMPRESA?.logo_url) {
    const img = document.getElementById('ibLogoImg');
    if (img) img.src = EMPRESA.logo_url;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initFlyout();
  _observeAdminSection();

  // Close flyout on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sidebar')) {
      _hideFlyout(true);
    }
  });
});
