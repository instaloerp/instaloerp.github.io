// ═══════════════════════════════════════════════
// FLYOUT — Hover menus for the icon-bar sidebar
// ═══════════════════════════════════════════════

const FLYOUT_SECTIONS = {
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
    { id:'ocr', ico:'🤖', name:'Bandeja OCR', tag:'beta', badgeId:'ocrBadge' },
    { id:'bandeja', ico:'⚡', name:'Automatizaciones', tag:'beta' }
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
    { id:'flota-gastos', ico:'💰', name:'Gastos' },
    { id:'flota-gps', ico:'📡', name:'GPS en vivo' }
  ]},
  tesoreria: { label: 'Tesorería', items: [
    { id:'tesoreria-cuentas', ico:'🏦', name:'Cuentas bancarias' },
    { id:'tesoreria-movimientos', ico:'📊', name:'Movimientos' },
    { id:'tesoreria-conciliacion', ico:'🔗', name:'Conciliación' },
    { id:'tesoreria-importar', ico:'📥', name:'Importar extractos' }
  ]},
  contabilidad: { label: 'Contabilidad', items: [
    { id:'plan-contable', ico:'📊', name:'Plan Contable' },
    { id:'libro-diario', ico:'📖', name:'Libro Diario' },
    { id:'libro-mayor', ico:'📒', name:'Libro Mayor' },
    { id:'balance-sumas', ico:'📊', name:'Balance Sumas y Saldos' },
    { id:'cuenta-resultados', ico:'📈', name:'Cuenta de Resultados' }
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

  // Position vertically centered on the icon, clamped to viewport
  const rect = el.getBoundingClientRect();
  const flyH = flyout.offsetHeight;
  const iconCenter = rect.top + rect.height / 2;
  const maxTop = window.innerHeight - flyH - 10;
  let top = iconCenter - flyH / 2;
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

// ── Ocultar iconos del sidebar cuando el usuario no tiene permisos ──
function applyIconbarPerms() {
  if (!CP) return;
  // Admin/superadmin ven todo
  if (CP.es_superadmin || CP.rol === 'admin') {
    document.querySelectorAll('.ib-item[data-flyout]').forEach(el => {
      if (el.id === 'ibAdminItem') return; // config se gestiona aparte
      el.style.display = 'flex';
    });
    return;
  }

  document.querySelectorAll('.ib-item[data-flyout]').forEach(el => {
    const flyKey = el.dataset.flyout;
    if (!flyKey || flyKey === 'user') return;
    if (el.id === 'ibAdminItem') return; // config se gestiona aparte

    const sec = FLYOUT_SECTIONS[flyKey];
    if (!sec) { el.style.display = 'none'; return; }

    // Comprobar si al menos un sub-item del flyout es accesible
    let hasAccess = false;
    if (sec.items) {
      for (const it of sec.items) {
        if (typeof userCanAccess === 'function' && userCanAccess(it.id)) {
          hasAccess = true;
          break;
        }
      }
    }

    el.style.display = hasAccess ? 'flex' : 'none';
  });
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


// ═══════════════════════════════════════════════
//  SIDEBAR REORDER — Long-press + drag & drop
// ═══════════════════════════════════════════════

let _sbEditMode = false;
let _sbLongPressTimer = null;
let _sbDraggedEl = null;

/** Obtiene todos los ib-item reordenables (excluye logo, bottom, seps) */
function _getSortableItems() {
  const bar = document.getElementById('sbIconbar');
  if (!bar) return [];
  return [...bar.querySelectorAll('.ib-item')].filter(el => {
    if (el.closest('.ib-bottom')) return false; // Claude IA + avatar no se mueven
    if (el.style.display === 'none') return false; // ocultos por permisos
    return true;
  });
}

/** Activa modo edición del sidebar */
function _enterSbEditMode() {
  if (_sbEditMode) return;
  _sbEditMode = true;
  _hideFlyout(true);

  const bar = document.getElementById('sbIconbar');
  if (!bar) return;

  // Quitar separadores temporalmente
  bar.querySelectorAll('.ib-sep').forEach(s => s.style.display = 'none');

  // Añadir wiggle y draggable a cada item visible
  _getSortableItems().forEach(el => {
    el.classList.add('ib-editing');
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', _sbDragStart);
    el.addEventListener('dragover', _sbDragOver);
    el.addEventListener('dragenter', _sbDragEnter);
    el.addEventListener('dragleave', _sbDragLeave);
    el.addEventListener('drop', _sbDrop);
    el.addEventListener('dragend', _sbDragEnd);
  });

  // Botón confirmar al final (antes de ib-bottom)
  const btn = document.createElement('div');
  btn.id = 'sbEditDone';
  btn.className = 'ib-item';
  btn.style.cssText = 'background:#10B981;color:#fff;font-size:16px;margin-top:6px;border-radius:8px;animation:none';
  btn.textContent = '✓';
  btn.title = 'Confirmar orden';
  btn.onclick = _exitSbEditMode;
  const bottom = bar.querySelector('.ib-bottom');
  if (bottom) bar.insertBefore(btn, bottom);
  else bar.appendChild(btn);

  // Vibrar si soportado
  if (navigator.vibrate) navigator.vibrate(30);
}

/** Sale del modo edición y guarda el orden */
function _exitSbEditMode() {
  if (!_sbEditMode) return;
  _sbEditMode = false;

  const bar = document.getElementById('sbIconbar');
  if (!bar) return;

  // Quitar wiggle y draggable
  bar.querySelectorAll('.ib-editing').forEach(el => {
    el.classList.remove('ib-editing', 'ib-drag-over');
    el.removeAttribute('draggable');
  });

  // Quitar botón confirmar
  const btn = document.getElementById('sbEditDone');
  if (btn) btn.remove();

  // Restaurar separadores
  bar.querySelectorAll('.ib-sep').forEach(s => s.style.display = '');

  // Guardar orden
  _saveSbOrder();

  if (navigator.vibrate) navigator.vibrate(15);
}

/** Guarda el orden actual de los iconos en localStorage */
function _saveSbOrder() {
  const items = _getSortableItems();
  const order = items.map(el => {
    // Identificar por data-flyout o por id
    return el.dataset.flyout || el.id || '';
  }).filter(Boolean);
  try {
    localStorage.setItem(`sb_order_${CU?.id}`, JSON.stringify(order));
  } catch (_) {}
}

/** Carga y aplica el orden guardado */
function applySbOrder() {
  let order;
  try {
    const raw = localStorage.getItem(`sb_order_${CU?.id}`);
    if (!raw) return;
    order = JSON.parse(raw);
    if (!Array.isArray(order) || order.length === 0) return;
  } catch (_) { return; }

  const bar = document.getElementById('sbIconbar');
  if (!bar) return;

  // Recoger todos los ib-item (no bottom)
  const allItems = [...bar.querySelectorAll('.ib-item')].filter(el => !el.closest('.ib-bottom'));

  // Mapear por identificador
  const itemMap = {};
  allItems.forEach(el => {
    const key = el.dataset.flyout || el.id || '';
    if (key) itemMap[key] = el;
  });

  // Encontrar el punto de inserción (antes del primer ib-sep o ib-bottom)
  const firstSep = bar.querySelector('.ib-sep');
  const bottom = bar.querySelector('.ib-bottom');

  // Quitar todos los separadores temporalmente
  const seps = [...bar.querySelectorAll('.ib-sep')];
  seps.forEach(s => s.remove());

  // Quitar todos los items no-bottom
  allItems.forEach(el => el.remove());

  // Reinsertar en el orden guardado
  const insertBefore = bottom || null;
  const inserted = new Set();

  order.forEach(key => {
    const el = itemMap[key];
    if (el) {
      bar.insertBefore(el, insertBefore);
      inserted.add(key);
    }
  });

  // Añadir al final los que no estaban en el orden guardado (nuevos iconos)
  Object.keys(itemMap).forEach(key => {
    if (!inserted.has(key)) {
      bar.insertBefore(itemMap[key], insertBefore);
    }
  });

  // Re-añadir separadores (al final de los items, antes de bottom)
  seps.forEach(s => bar.insertBefore(s, insertBefore));
}

// ── Drag & Drop handlers ──
function _sbDragStart(e) {
  _sbDraggedEl = this;
  this.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

function _sbDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function _sbDragEnter(e) {
  e.preventDefault();
  if (this !== _sbDraggedEl && this.classList.contains('ib-editing')) {
    this.classList.add('ib-drag-over');
  }
}

function _sbDragLeave() {
  this.classList.remove('ib-drag-over');
}

function _sbDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('ib-drag-over');

  if (!_sbDraggedEl || _sbDraggedEl === this) return;

  // Determinar si insertar antes o después
  const bar = document.getElementById('sbIconbar');
  const items = _getSortableItems();
  const fromIdx = items.indexOf(_sbDraggedEl);
  const toIdx = items.indexOf(this);

  if (fromIdx < toIdx) {
    this.after(_sbDraggedEl);
  } else {
    this.before(_sbDraggedEl);
  }
}

function _sbDragEnd() {
  this.style.opacity = '1';
  document.querySelectorAll('.ib-drag-over').forEach(el => el.classList.remove('ib-drag-over'));
  _sbDraggedEl = null;
}

// ── Touch drag para móvil ──
function _sbTouchStart(e) {
  if (!_sbEditMode) return;
  const touch = e.touches[0];
  _sbDraggedEl = this;
  this.style.opacity = '0.4';
  e.preventDefault();
}

function _sbTouchMove(e) {
  if (!_sbEditMode || !_sbDraggedEl) return;
  e.preventDefault();
  const touch = e.touches[0];
  const target = document.elementFromPoint(touch.clientX, touch.clientY);
  // Limpiar todos los drag-over
  document.querySelectorAll('.ib-drag-over').forEach(el => el.classList.remove('ib-drag-over'));
  if (target && target.classList.contains('ib-editing') && target !== _sbDraggedEl) {
    target.classList.add('ib-drag-over');
  }
}

function _sbTouchEnd(e) {
  if (!_sbEditMode || !_sbDraggedEl) return;
  const overEl = document.querySelector('.ib-drag-over');
  if (overEl && overEl !== _sbDraggedEl) {
    const items = _getSortableItems();
    const fromIdx = items.indexOf(_sbDraggedEl);
    const toIdx = items.indexOf(overEl);
    if (fromIdx < toIdx) overEl.after(_sbDraggedEl);
    else overEl.before(_sbDraggedEl);
  }
  _sbDraggedEl.style.opacity = '1';
  document.querySelectorAll('.ib-drag-over').forEach(el => el.classList.remove('ib-drag-over'));
  _sbDraggedEl = null;
}

// ── Long-press binding ──
function _bindSbLongPress() {
  const bar = document.getElementById('sbIconbar');
  if (!bar) return;

  bar.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.ib-item');
    if (!item || item.closest('.ib-bottom') || _sbEditMode) return;

    _sbLongPressTimer = setTimeout(() => {
      _enterSbEditMode();
      // Añadir touch handlers para móvil
      _getSortableItems().forEach(el => {
        el.addEventListener('touchstart', _sbTouchStart, { passive: false });
        el.addEventListener('touchmove', _sbTouchMove, { passive: false });
        el.addEventListener('touchend', _sbTouchEnd);
      });
    }, 600);
  });

  bar.addEventListener('pointerup', () => clearTimeout(_sbLongPressTimer));
  bar.addEventListener('pointerleave', () => clearTimeout(_sbLongPressTimer));
  bar.addEventListener('pointermove', (e) => {
    // Cancelar si se mueve mucho (>10px = scroll, no long-press)
    if (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2) {
      clearTimeout(_sbLongPressTimer);
    }
  });
}

// Init al cargar
document.addEventListener('DOMContentLoaded', () => {
  _bindSbLongPress();
});
