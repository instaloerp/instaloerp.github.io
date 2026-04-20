// ═══════════════════════════════════════════════
// SISTEMA DE PERMISOS GRANULARES — instaloERP
// CRUD (Ver/Editar/Crear/Eliminar) por sección
// + sub-módulos + opciones de visualización
// + sistema de módulos por plan (básico/profesional/premium)
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
//  PLANES Y MÓDULOS
// ═══════════════════════════════════════════════

const PLANES_DEF = {
  basico: {
    label: 'Básico',
    ico: '⭐',
    color: '#2563EB',
    modulos: ['clientes','ventas','facturacion','agenda']
  },
  profesional: {
    label: 'Profesional',
    ico: '🚀',
    color: '#7C3AED',
    modulos: ['clientes','ventas','facturacion','agenda','compras','almacen']
  },
  premium: {
    label: 'Premium',
    ico: '👑',
    color: '#D97706',
    modulos: ['clientes','ventas','facturacion','agenda','compras','almacen','obras','flota','personal','comunicaciones','tesoreria']
  }
};

// Todos los módulos posibles (para UI)
const TODOS_MODULOS = [
  { key:'clientes',       label:'Clientes',        ico:'👥' },
  { key:'ventas',         label:'Ventas',           ico:'💰' },
  { key:'facturacion',    label:'Facturación',      ico:'🧾' },
  { key:'agenda',         label:'Agenda',           ico:'📅' },
  { key:'compras',        label:'Compras',          ico:'🛒' },
  { key:'almacen',        label:'Almacén / Catálogo',ico:'📦' },
  { key:'obras',          label:'Gestión de obras', ico:'🏗️' },
  { key:'flota',          label:'Flota',            ico:'🚗' },
  { key:'personal',       label:'Personal',         ico:'👤' },
  { key:'comunicaciones', label:'Comunicaciones',   ico:'📧' },
  { key:'tesoreria',      label:'Tesorería',        ico:'🏦' },
];

/**
 * Comprobar si un módulo está activo para la empresa actual
 * @param {string} modKey — clave del módulo (ej: 'compras', 'obras')
 * @returns {boolean}
 */
function moduloActivo(modKey) {
  // Secciones que siempre están activas (no dependen de módulos)
  const siempre = ['acceso','inicio','configuracion','opciones'];
  if (siempre.includes(modKey)) return true;

  // Si no hay empresa cargada, permitir todo (por seguridad)
  if (!EMPRESA) return true;

  // Si la empresa tiene modulos definidos, usar esos
  if (EMPRESA.modulos && typeof EMPRESA.modulos === 'object') {
    return EMPRESA.modulos[modKey] === true;
  }

  // Sin campo modulos → asumir premium (backward compat)
  return true;
}

/**
 * Obtener los módulos del plan actual de la empresa
 * @returns {string[]} — array de claves de módulos activos
 */
function getModulosActivos() {
  if (EMPRESA?.modulos && typeof EMPRESA.modulos === 'object') {
    return Object.keys(EMPRESA.modulos).filter(k => EMPRESA.modulos[k] === true);
  }
  // Sin datos → todo activo
  return TODOS_MODULOS.map(m => m.key);
}

/**
 * Obtener el plan que corresponde a los módulos actuales
 * @returns {string} — 'basico'|'profesional'|'premium'
 */
function getPlanActual() {
  const activos = getModulosActivos();
  if (activos.length >= PLANES_DEF.premium.modulos.length) return 'premium';
  if (activos.length >= PLANES_DEF.profesional.modulos.length) return 'profesional';
  return 'basico';
}


// ── Definición de secciones ─────────────────────
const PERM_SECTIONS = [
  { key:'acceso', label:'Acceso', ico:'📱', crud:false, items:[
    {key:'web', label:'Acceso al ERP web (escritorio)'},
    {key:'app_operario', label:'App móvil — Modo Operario'},
    {key:'app_admin', label:'App móvil — Modo Administrador'},
    {key:'app_almacen', label:'App móvil — Modo Almacén'}
  ]},
  { key:'inicio', label:'Inicio', ico:'🏠', crud:false, items:[
    {key:'importes', label:'Importes totales en dashboard'}
  ]},
  { key:'clientes', label:'Clientes', ico:'👥', crud:true, items:[] },
  { key:'ventas', label:'Ventas', ico:'💰', crud:true, items:[
    {key:'presupuestos', label:'Presupuestos'},
    {key:'albaranes', label:'Albaranes de venta'}
  ]},
  { key:'facturacion', label:'Facturación', ico:'🧾', crud:true, items:[
    {key:'facturas', label:'Facturas'},
    {key:'rectificativas', label:'Rectificativas / Abonos'}
  ]},
  { key:'compras', label:'Compras', ico:'🛒', crud:true, items:[
    {key:'proveedores', label:'Proveedores'},
    {key:'presup_compra', label:'Presupuestos de compra'},
    {key:'pedidos', label:'Pedidos a proveedor'},
    {key:'albaranes_prov', label:'Albaranes de proveedor'},
    {key:'facturas_prov', label:'Facturas de proveedor'},
    {key:'calendario_pagos', label:'Calendario de pagos'},
    {key:'ocr', label:'OCR facturas'}
  ]},
  { key:'almacen', label:'Almacén / Catálogo', ico:'📦', crud:true, items:[
    {key:'articulos', label:'Artículos'},
    {key:'servicios', label:'Servicios'},
    {key:'almacenes', label:'Almacenes'},
    {key:'stock', label:'Control de stock'},
    {key:'consumos', label:'Consumos'},
    {key:'incidencias', label:'Incidencias'},
    {key:'traspasos', label:'Traspasos'},
    {key:'activos', label:'Activos'},
    {key:'etiquetas_qr', label:'Etiquetas QR'}
  ]},
  { key:'obras', label:'Gestión de obras', ico:'🏗️', crud:true, items:[
    {key:'trabajos', label:'Obras / Trabajos'},
    {key:'mantenimientos', label:'Mantenimientos'},
    {key:'partes', label:'Partes de trabajo'},
    {key:'planificador', label:'Planificador'}
  ]},
  { key:'agenda', label:'Agenda', ico:'📅', crud:false, items:[
    {key:'calendario', label:'Calendario'},
    {key:'tareas', label:'Mis tareas'}
  ]},
  { key:'flota', label:'Flota', ico:'🚗', crud:true, items:[
    {key:'vehiculos', label:'Vehículos'},
    {key:'gastos', label:'Gastos de flota'}
  ]},
  { key:'comunicaciones', label:'Comunicaciones', ico:'📧', crud:false, items:[
    {key:'correo', label:'Correo'}
  ]},
  { key:'personal', label:'Personal', ico:'👤', crud:false, items:[
    {key:'fichajes', label:'Fichajes'}
  ]},
  { key:'tesoreria', label:'Tesorería', ico:'🏦', crud:true, items:[
    {key:'cuentas', label:'Cuentas bancarias'},
    {key:'movimientos', label:'Movimientos'},
    {key:'conciliacion', label:'Conciliación'},
    {key:'importar', label:'Importar extractos'}
  ]},
  { key:'configuracion', label:'Configuración', ico:'⚙️', crud:true, items:[
    {key:'empresa', label:'Datos de empresa'},
    {key:'usuarios', label:'Gestión de usuarios'},
    {key:'audit_log', label:'Auditoría'},
    {key:'papelera', label:'Papelera'},
    {key:'laboratorio', label:'Laboratorio'}
  ]},
  { key:'opciones', label:'Opciones de visualización', ico:'👁️', crud:false, items:[
    {key:'precios_venta', label:'Mostrar precios de venta'},
    {key:'precios_compra', label:'Mostrar precios de compra'},
    {key:'rentabilidad', label:'Mostrar rentabilidad'},
    {key:'ver_stock', label:'Mostrar stock en listados'},
    {key:'sumatorios', label:'Mostrar sumatorios en listados'}
  ]}
];

// ── Mapeo página → permiso ──────────────────────
const PAGE_PERM_MAP = {
  // Clientes
  'clientes':            {sec:'clientes'},
  // Ventas
  'presupuestos':        {sec:'ventas', sub:'presupuestos'},
  'albaranes':           {sec:'ventas', sub:'albaranes'},
  // Facturación
  'facturas':            {sec:'facturacion', sub:'facturas'},
  'rectificativas':      {sec:'facturacion', sub:'rectificativas'},
  // Compras
  'proveedores':         {sec:'compras', sub:'proveedores'},
  'presupuestos-compra': {sec:'compras', sub:'presup_compra'},
  'pedidos-compra':      {sec:'compras', sub:'pedidos'},
  'albaranes-proveedor': {sec:'compras', sub:'albaranes_prov'},
  'facturas-proveedor':  {sec:'compras', sub:'facturas_prov'},
  'calendario-pagos':    {sec:'compras', sub:'calendario_pagos'},
  'ocr':                 {sec:'compras', sub:'ocr'},
  // Almacén
  'articulos':           {sec:'almacen', sub:'articulos'},
  'servicios':           {sec:'almacen', sub:'servicios'},
  'almacenes-page':      {sec:'almacen', sub:'almacenes'},
  'stock':               {sec:'almacen', sub:'stock'},
  'consumos':            {sec:'almacen', sub:'consumos'},
  'incidencias-stock':   {sec:'almacen', sub:'incidencias'},
  'traspasos':           {sec:'almacen', sub:'traspasos'},
  'activos':             {sec:'almacen', sub:'activos'},
  'etiquetas-qr':        {sec:'almacen', sub:'etiquetas_qr'},
  // Obras
  'trabajos':            {sec:'obras', sub:'trabajos'},
  'mantenimientos':      {sec:'obras', sub:'mantenimientos'},
  'partes':              {sec:'obras', sub:'partes'},
  'planificador':        {sec:'obras', sub:'planificador'},
  // Agenda
  'calendario':          {sec:'agenda', sub:'calendario'},
  'mistareas':           {sec:'agenda', sub:'tareas'},
  // Flota
  'flota':               {sec:'flota', sub:'vehiculos'},
  'flota-gastos':        {sec:'flota', sub:'gastos'},
  // Comunicaciones
  'correo':              {sec:'comunicaciones', sub:'correo'},
  // Personal
  'fichajes':            {sec:'personal', sub:'fichajes'},
  // Tesorería
  'tesoreria-cuentas':   {sec:'tesoreria', sub:'cuentas'},
  'tesoreria-movimientos':{sec:'tesoreria', sub:'movimientos'},
  'tesoreria-conciliacion':{sec:'tesoreria', sub:'conciliacion'},
  'tesoreria-importar':  {sec:'tesoreria', sub:'importar'},
  // Config
  'configuracion':       {sec:'configuracion', sub:'empresa'},
  'usuarios':            {sec:'configuracion', sub:'usuarios'},
  'audit-log':           {sec:'configuracion', sub:'audit_log'},
  'papelera':            {sec:'configuracion', sub:'papelera'},
  'laboratorio':         {sec:'configuracion', sub:'laboratorio'},
};

// Mapeo inverso: clave antigua → nueva sección (backward compat)
const _OLD_KEY_MAP = {
  'clientes':'clientes', 'presupuestos':'ventas', 'facturas':'facturacion',
  'compras':'compras', 'trabajos':'obras', 'partes':'obras',
  'stock':'almacen', 'flota':'flota', 'config':'configuracion', 'usuarios':'configuracion'
};

// ── Generar preset "todo true" ──────────────────
function _permAllTrue() {
  const p = {};
  PERM_SECTIONS.forEach(sec => {
    p[sec.key] = {};
    if (sec.crud) { p[sec.key].ver=true; p[sec.key].editar=true; p[sec.key].crear=true; p[sec.key].eliminar=true; }
    sec.items.forEach(it => { p[sec.key][it.key] = true; });
  });
  return p;
}

// ── Presets por rol ─────────────────────────────
const PERM_PRESETS = {
  admin: _permAllTrue(),

  oficina: {
    acceso:        {web:true, app_operario:false, app_admin:true, app_almacen:false},
    inicio:        {importes:true},
    clientes:      {ver:true, editar:true, crear:true, eliminar:true},
    ventas:        {ver:true, editar:true, crear:true, eliminar:true, presupuestos:true, albaranes:true},
    facturacion:   {ver:true, editar:true, crear:true, eliminar:true, facturas:true, rectificativas:true},
    compras:       {ver:true, editar:true, crear:true, eliminar:true, proveedores:true, presup_compra:true, pedidos:true, albaranes_prov:true, facturas_prov:true, calendario_pagos:true, ocr:true},
    almacen:       {ver:true, editar:true, crear:true, eliminar:true, articulos:true, servicios:true, almacenes:true, stock:true, consumos:true, incidencias:true, traspasos:true, activos:true, etiquetas_qr:true},
    obras:         {ver:true, editar:true, crear:true, eliminar:true, trabajos:true, mantenimientos:true, partes:true, planificador:true},
    agenda:        {calendario:true, tareas:true},
    flota:         {ver:true, editar:true, crear:true, eliminar:true, vehiculos:true, gastos:true},
    comunicaciones:{correo:true},
    personal:      {fichajes:true},
    tesoreria:     {ver:true, editar:true, crear:true, eliminar:false, cuentas:true, movimientos:true, conciliacion:true, importar:true},
    configuracion: {ver:false, editar:false, crear:false, eliminar:false, empresa:false, usuarios:false, audit_log:false, papelera:false, laboratorio:false},
    opciones:      {precios_venta:true, precios_compra:true, rentabilidad:true, ver_stock:true, sumatorios:true}
  },

  almacen: {
    acceso:        {web:true, app_operario:false, app_admin:false, app_almacen:true},
    inicio:        {importes:false},
    clientes:      {ver:false, editar:false, crear:false, eliminar:false},
    ventas:        {ver:false, editar:false, crear:false, eliminar:false, presupuestos:false, albaranes:false},
    facturacion:   {ver:false, editar:false, crear:false, eliminar:false, facturas:false, rectificativas:false},
    compras:       {ver:true, editar:true, crear:true, eliminar:false, proveedores:true, presup_compra:true, pedidos:true, albaranes_prov:true, facturas_prov:false, calendario_pagos:false, ocr:false},
    almacen:       {ver:true, editar:true, crear:true, eliminar:true, articulos:true, servicios:true, almacenes:true, stock:true, consumos:true, incidencias:true, traspasos:true, activos:true, etiquetas_qr:true},
    obras:         {ver:true, editar:true, crear:false, eliminar:false, trabajos:true, mantenimientos:true, partes:true, planificador:false},
    agenda:        {calendario:true, tareas:true},
    flota:         {ver:false, editar:false, crear:false, eliminar:false, vehiculos:false, gastos:false},
    comunicaciones:{correo:false},
    personal:      {fichajes:true},
    tesoreria:     {ver:false, editar:false, crear:false, eliminar:false, cuentas:false, movimientos:false, conciliacion:false, importar:false},
    configuracion: {ver:false, editar:false, crear:false, eliminar:false, empresa:false, usuarios:false, audit_log:false, papelera:false, laboratorio:false},
    opciones:      {precios_venta:false, precios_compra:true, rentabilidad:false, ver_stock:true, sumatorios:true}
  },

  operario: {
    acceso:        {web:false, app_operario:true, app_admin:false, app_almacen:false},
    inicio:        {importes:false},
    clientes:      {ver:false, editar:false, crear:false, eliminar:false},
    ventas:        {ver:false, editar:false, crear:false, eliminar:false, presupuestos:false, albaranes:false},
    facturacion:   {ver:false, editar:false, crear:false, eliminar:false, facturas:false, rectificativas:false},
    compras:       {ver:false, editar:false, crear:false, eliminar:false, proveedores:false, presup_compra:false, pedidos:false, albaranes_prov:false, facturas_prov:false, calendario_pagos:false, ocr:false},
    almacen:       {ver:false, editar:false, crear:false, eliminar:false, articulos:false, servicios:false, almacenes:false, stock:false, consumos:false, incidencias:false, traspasos:false, activos:false, etiquetas_qr:false},
    obras:         {ver:true, editar:true, crear:false, eliminar:false, trabajos:true, mantenimientos:false, partes:true, planificador:false},
    agenda:        {calendario:true, tareas:true},
    flota:         {ver:false, editar:false, crear:false, eliminar:false, vehiculos:false, gastos:false},
    comunicaciones:{correo:false},
    personal:      {fichajes:true},
    tesoreria:     {ver:false, editar:false, crear:false, eliminar:false, cuentas:false, movimientos:false, conciliacion:false, importar:false},
    configuracion: {ver:false, editar:false, crear:false, eliminar:false, empresa:false, usuarios:false, audit_log:false, papelera:false, laboratorio:false},
    opciones:      {precios_venta:false, precios_compra:false, rentabilidad:false, ver_stock:false, sumatorios:false}
  },

  comercial: {
    acceso:        {web:true, app_operario:true, app_admin:false, app_almacen:false},
    inicio:        {importes:false},
    clientes:      {ver:true, editar:true, crear:true, eliminar:false},
    ventas:        {ver:true, editar:true, crear:true, eliminar:false, presupuestos:true, albaranes:true},
    facturacion:   {ver:true, editar:false, crear:false, eliminar:false, facturas:true, rectificativas:false},
    compras:       {ver:false, editar:false, crear:false, eliminar:false, proveedores:false, presup_compra:false, pedidos:false, albaranes_prov:false, facturas_prov:false, calendario_pagos:false, ocr:false},
    almacen:       {ver:true, editar:false, crear:false, eliminar:false, articulos:true, servicios:true, almacenes:false, stock:false, consumos:false, incidencias:false, traspasos:false, activos:false, etiquetas_qr:false},
    obras:         {ver:true, editar:false, crear:false, eliminar:false, trabajos:true, mantenimientos:false, partes:false, planificador:false},
    agenda:        {calendario:true, tareas:true},
    flota:         {ver:false, editar:false, crear:false, eliminar:false, vehiculos:false, gastos:false},
    comunicaciones:{correo:true},
    personal:      {fichajes:true},
    tesoreria:     {ver:false, editar:false, crear:false, eliminar:false, cuentas:false, movimientos:false, conciliacion:false, importar:false},
    configuracion: {ver:false, editar:false, crear:false, eliminar:false, empresa:false, usuarios:false, audit_log:false, papelera:false, laboratorio:false},
    opciones:      {precios_venta:true, precios_compra:false, rentabilidad:false, ver_stock:false, sumatorios:true}
  }
};


// ═══════════════════════════════════════════════
//  COMPROBACIÓN DE PERMISOS
// ═══════════════════════════════════════════════

/**
 * Comprobar si el usuario tiene permiso para una acción
 * @param {string} sec   — clave de sección (ej: 'ventas', 'compras')
 * @param {string} action — 'ver'|'editar'|'crear'|'eliminar' o clave de sub-item
 * @returns {boolean}
 */
function canDo(sec, action) {
  if (!CP) return false;
  // Módulo no contratado → sin acceso (ni para admin)
  if (!moduloActivo(sec)) return false;
  if (CP.es_superadmin || CP.rol === 'admin') return true;
  const p = CP.permisos;
  if (!p) return false;

  // Formato nuevo: {ventas: {ver:true, editar:true, presupuestos:true, ...}}
  const val = p[sec];
  if (val && typeof val === 'object') {
    if (!action) return val.ver !== false;
    return val[action] === true;
  }

  // Formato antiguo: {clientes:true, presupuestos:true, ...}
  // Intentar mapear a la sección antigua
  if (typeof val === 'boolean') return val;
  // Buscar en claves antiguas
  const oldKey = Object.keys(_OLD_KEY_MAP).find(k => _OLD_KEY_MAP[k] === sec);
  if (oldKey && typeof p[oldKey] === 'boolean') return p[oldKey];

  return false;
}

/**
 * Comprobar si el usuario puede acceder a una página del sidebar
 * Reemplaza a userCanAccess() — backward compatible
 * @param {string} pageId — id de la página (ej: 'clientes', 'presupuestos-compra')
 * @returns {boolean}
 */
function canAccessPage(pageId) {
  if (!CP) return false;

  // Dashboard siempre accesible
  if (pageId === 'dashboard') return true;

  const m = PAGE_PERM_MAP[pageId];
  if (!m) return true; // página desconocida → permitir

  // Módulo no contratado → bloquear incluso para admin
  if (!moduloActivo(m.sec)) return false;

  if (CP.es_superadmin || CP.rol === 'admin') return true;

  const p = CP.permisos;
  if (!p) return false;

  const secData = p[m.sec];

  // Formato nuevo
  if (secData && typeof secData === 'object') {
    // La sección tiene "ver"? (secciones CRUD)
    if ('ver' in secData && !secData.ver) return false;
    // Sub-ítem desactivado?
    if (m.sub && secData[m.sub] === false) return false;
    return true;
  }

  // Formato antiguo — buscar clave directa
  if (typeof secData === 'boolean') return secData;

  // Buscar clave antigua mapeada
  // ej: pageId='proveedores' → sec='compras' → oldKey='compras' → p.compras
  const oldKeys = Object.entries(_OLD_KEY_MAP).filter(([k,v]) => v === m.sec).map(([k]) => k);
  for (const ok of oldKeys) {
    if (typeof p[ok] === 'boolean') return p[ok];
  }

  // Páginas sin mapeo antiguo: calendario, mistareas, correo, fichajes — permitir por defecto
  return true;
}

// Alias — reemplaza a userCanAccess
function userCanAccess(pageId) { return canAccessPage(pageId); }


// ═══════════════════════════════════════════════
//  UI: EDITOR DE PERMISOS
// ═══════════════════════════════════════════════

/**
 * Renderiza el editor completo de permisos en un contenedor
 * @param {string} containerId — id del div contenedor
 */
function renderPermisosEditor(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;

  let html = '';
  PERM_SECTIONS.forEach(sec => {
    const hasCrud = sec.crud;
    const hasItems = sec.items.length > 0;

    // — Header de sección —
    html += `<div class="pe-sec" id="pe_sec_${sec.key}">`;
    html += `<div class="pe-header" onclick="peToggle('${sec.key}')">`;
    html += `<div class="pe-h-left">`;
    html += `<span class="pe-arrow" id="pe_arrow_${sec.key}">▸</span>`;
    html += `<span class="pe-ico">${sec.ico}</span>`;
    html += `<span class="pe-label">${sec.label}</span>`;
    html += `</div>`;

    if (hasCrud) {
      html += `<div class="pe-crud" onclick="event.stopPropagation()">`;
      [{k:'ver',l:'Ver'},{k:'editar',l:'Editar'},{k:'crear',l:'Crear'},{k:'eliminar',l:'Elim.'}].forEach(a => {
        html += `<label class="pe-crud-label" title="${a.l}">`;
        html += `<input type="checkbox" id="pe_${sec.key}_${a.k}" onchange="peOnCrud('${sec.key}','${a.k}')">`;
        html += `<span>${a.l}</span></label>`;
      });
      html += `</div>`;
    }
    html += `</div>`; // .pe-header

    // — Sub-ítems —
    if (hasItems) {
      html += `<div class="pe-items" id="pe_items_${sec.key}" style="display:none">`;
      // Toggle all
      html += `<div class="pe-toggle-all">`;
      html += `<label class="pe-item-label"><input type="checkbox" id="pe_${sec.key}_ALL" onchange="peToggleAll('${sec.key}',this.checked)"><span style="font-weight:700;color:var(--gris-600)">Todos los permisos</span></label>`;
      html += `</div>`;
      html += `<div class="pe-items-grid">`;
      sec.items.forEach(it => {
        html += `<label class="pe-item-label"><input type="checkbox" id="pe_${sec.key}_${it.key}"><span>${it.label}</span></label>`;
      });
      html += `</div></div>`; // .pe-items-grid + .pe-items
    }

    html += `</div>`; // .pe-sec
  });

  c.innerHTML = html;
}

/** Expandir / colapsar sub-ítems */
function peToggle(secKey) {
  const items = document.getElementById('pe_items_' + secKey);
  const arrow = document.getElementById('pe_arrow_' + secKey);
  if (!items) return;
  const open = items.style.display !== 'none';
  items.style.display = open ? 'none' : '';
  if (arrow) arrow.textContent = open ? '▸' : '▾';
}

/** Cuando se cambia un toggle CRUD */
function peOnCrud(secKey, action) {
  const ver = document.getElementById(`pe_${secKey}_ver`);
  if (action === 'ver' && ver && !ver.checked) {
    // Sin "Ver" → desactivar todo
    ['editar','crear','eliminar'].forEach(a => {
      const el = document.getElementById(`pe_${secKey}_${a}`);
      if (el) el.checked = false;
    });
    // Desactivar sub-ítems
    peToggleAll(secKey, false);
    const allCb = document.getElementById(`pe_${secKey}_ALL`);
    if (allCb) allCb.checked = false;
  } else if (action !== 'ver' && ver) {
    // Activar cualquier CRUD → auto-activar Ver
    ver.checked = true;
  }
}

/** Toggle all sub-items de una sección */
function peToggleAll(secKey, checked) {
  const sec = PERM_SECTIONS.find(s => s.key === secKey);
  if (!sec) return;
  sec.items.forEach(it => {
    const el = document.getElementById(`pe_${secKey}_${it.key}`);
    if (el) el.checked = checked;
  });
}

/** Leer permisos del UI → objeto JSONB */
function readPermisosFromUI() {
  const perms = {};
  PERM_SECTIONS.forEach(sec => {
    perms[sec.key] = {};
    if (sec.crud) {
      ['ver','editar','crear','eliminar'].forEach(a => {
        const el = document.getElementById(`pe_${sec.key}_${a}`);
        perms[sec.key][a] = el ? el.checked : false;
      });
    }
    sec.items.forEach(it => {
      const el = document.getElementById(`pe_${sec.key}_${it.key}`);
      perms[sec.key][it.key] = el ? el.checked : false;
    });
  });
  return perms;
}

/** Escribir objeto JSONB → UI */
function writePermisosToUI(perms) {
  if (!perms) perms = {};
  PERM_SECTIONS.forEach(sec => {
    const secData = perms[sec.key];
    if (sec.crud) {
      ['ver','editar','crear','eliminar'].forEach(a => {
        const el = document.getElementById(`pe_${sec.key}_${a}`);
        if (el) el.checked = secData && typeof secData === 'object' ? (secData[a] === true) : false;
      });
    }
    let allChecked = true;
    sec.items.forEach(it => {
      const el = document.getElementById(`pe_${sec.key}_${it.key}`);
      let val = false;
      if (secData && typeof secData === 'object') {
        val = secData[it.key] === true;
      }
      if (el) el.checked = val;
      if (!val) allChecked = false;
    });
    // "Todos" toggle
    const allCb = document.getElementById(`pe_${sec.key}_ALL`);
    if (allCb) allCb.checked = sec.items.length > 0 && allChecked;
  });
}

/** Aplicar preset de rol → UI (override de la función vieja) */
function setPermisosByRol(rol) {
  const preset = PERM_PRESETS[rol];
  if (!preset) return;

  // Si el editor granular está renderizado, usarlo
  const container = document.getElementById('permisosEditorContainer');
  if (container && container.innerHTML) {
    writePermisosToUI(preset);
    return;
  }

  // Fallback: toggles simples (formato antiguo)
  const simple = {
    clientes: preset.clientes?.ver || false,
    presupuestos: preset.ventas?.ver || false,
    facturas: preset.facturacion?.ver || false,
    compras: preset.compras?.ver || false,
    trabajos: preset.obras?.ver || false,
    partes: preset.obras?.partes || false,
    stock: preset.almacen?.ver || false,
    flota: preset.flota?.ver || false,
    config: preset.configuracion?.ver || false,
    usuarios: preset.configuracion?.usuarios || false,
  };
  Object.keys(simple).forEach(k => {
    const el = document.getElementById('up_'+k);
    if (el) el.checked = simple[k];
  });
}


// ═══════════════════════════════════════════════
//  ENFORCEMENT: ocultar/mostrar botones CRUD
//  según permisos del usuario logueado
// ═══════════════════════════════════════════════

/**
 * Mapeo de botones de acción → permiso CRUD requerido
 * data-perm="seccion:accion" en el HTML, ej: data-perm="clientes:crear"
 * Se evalúa con canDo() automáticamente
 */
function applyPermButtons() {
  document.querySelectorAll('[data-perm]').forEach(el => {
    const [sec, action] = el.dataset.perm.split(':');
    el.style.display = canDo(sec, action) ? '' : 'none';
  });
}

/**
 * Guard para acciones protegidas — llamar antes de ejecutar crear/editar/eliminar
 * @param {string} sec — sección de permisos
 * @param {string} action — 'crear'|'editar'|'eliminar'
 * @returns {boolean} — true si permitido
 */
function guardPerm(sec, action) {
  if (canDo(sec, action)) return true;
  const labels = {crear:'crear',editar:'editar',eliminar:'eliminar'};
  toast(`🔒 No tienes permiso para ${labels[action] || action} en esta sección`, 'error');
  return false;
}


// ═══════════════════════════════════════════════
//  PANEL CONFIGURACIÓN: PLAN Y MÓDULOS
// ═══════════════════════════════════════════════

function renderPlanConfig() {
  const activos = getModulosActivos();
  const planKey = getPlanActual();
  const plan = PLANES_DEF[planKey];

  // — Info del plan actual —
  const infoEl = document.getElementById('planActualInfo');
  if (infoEl) {
    infoEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;padding:20px;background:linear-gradient(135deg,rgba(217,119,6,.08),rgba(217,119,6,.04));border:2px solid rgba(217,119,6,.2);border-radius:12px">
        <div style="font-size:40px">${plan.ico}</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:${plan.color}">Plan ${plan.label}</div>
          <div style="font-size:12.5px;color:var(--gris-500);margin-top:2px">${activos.length} de ${TODOS_MODULOS.length} módulos activos</div>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px">
        ${TODOS_MODULOS.map(m => {
          const activo = activos.includes(m.key);
          return `<span style="padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;${activo
            ? 'background:#ECFDF5;color:#059669;border:1px solid #A7F3D0'
            : 'background:var(--gris-50);color:var(--gris-400);border:1px solid var(--gris-200)'}">${m.ico} ${m.label} ${activo ? '✓' : '🔒'}</span>`;
        }).join('')}
      </div>`;
  }

  // — Comparativa de planes —
  const compEl = document.getElementById('planesComparativa');
  if (compEl) {
    let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">';
    Object.entries(PLANES_DEF).forEach(([key, p]) => {
      const isCurrent = key === planKey;
      html += `<div style="border:2px solid ${isCurrent ? p.color : 'var(--gris-200)'};border-radius:12px;padding:16px;${isCurrent ? 'background:rgba('+_hexToRgb(p.color)+',.04)' : ''}">
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:28px">${p.ico}</div>
          <div style="font-size:15px;font-weight:800;color:${p.color};margin-top:4px">${p.label}</div>
          ${isCurrent ? '<div style="font-size:10px;font-weight:700;color:#059669;background:#ECFDF5;padding:2px 8px;border-radius:10px;display:inline-block;margin-top:4px">PLAN ACTUAL</div>' : ''}
        </div>
        <div style="font-size:12px;color:var(--gris-600)">
          ${TODOS_MODULOS.map(m => {
            const included = p.modulos.includes(m.key);
            return `<div style="padding:4px 0;${included ? '' : 'opacity:.35'}">${included ? '✅' : '❌'} ${m.label}</div>`;
          }).join('')}
        </div>
      </div>`;
    });
    html += '</div>';
    compEl.innerHTML = html;
  }
}

// Helper: hex color to rgb string
function _hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
