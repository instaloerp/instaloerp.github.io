// ═══════════════════════════════════════════════
// UI HELPERS - Screen, modal, page, and form utilities
// ═══════════════════════════════════════════════

// ── Config helpers — Tarifas y parámetros configurables ──
function cfgTarifaHora() { return (EMPRESA?.config_partes?.tarifa_hora) ?? 35; }
function cfgTarifaKm()   { return (EMPRESA?.config_partes?.tarifa_km) ?? 0.26; }
function cfgMargenOcr()  { return (EMPRESA?.config_partes?.margen_ocr ?? 30) / 100; }
function cfgIvaPartes()  { return (EMPRESA?.config_partes?.iva_partes) ?? 21; }

// ── Helper: poblar selector de obras en modales de compras ──
function poblarSelectorObra(selectId, selectedId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const obras = (typeof trabajos !== 'undefined' ? trabajos : []).filter(t => t.estado !== 'finalizada' && t.estado !== 'cancelada');
  sel.innerHTML = '<option value="">— Sin asignar —</option>' +
    obras.map(t => `<option value="${t.id}" ${t.id == selectedId ? 'selected' : ''}>${t.numero || ''} — ${t.titulo || t.cliente_nombre || ''}</option>`).join('');
}

// ── Propagación bidireccional de obra en cadena de compras ──
async function propagarObraCompras(trabajo_id, refs) {
  // refs = { presupuesto_compra_id, pedido_compra_id, recepcion_id, factura_proveedor_id }
  const tid = trabajo_id || null;
  const updates = [];

  // 1. Recopilar toda la cadena hacia arriba
  let prcId = refs.presupuesto_compra_id || null;
  let pcId = refs.pedido_compra_id || null;
  let rcId = refs.recepcion_id || null;

  // Si tenemos recepción pero no pedido, buscar el pedido
  if (rcId && !pcId) {
    const {data} = await sb.from('recepciones').select('pedido_compra_id,presupuesto_compra_id').eq('id', rcId).single();
    if (data) { pcId = data.pedido_compra_id || pcId; prcId = data.presupuesto_compra_id || prcId; }
  }
  // Si tenemos pedido pero no presupuesto, buscar el presupuesto
  if (pcId && !prcId) {
    const {data} = await sb.from('pedidos_compra').select('presupuesto_compra_id').eq('id', pcId).single();
    if (data) prcId = data.presupuesto_compra_id || prcId;
  }

  // 2. Actualizar toda la cadena hacia arriba
  if (prcId) updates.push(sb.from('presupuestos_compra').update({trabajo_id: tid}).eq('id', prcId));
  if (pcId)  updates.push(sb.from('pedidos_compra').update({trabajo_id: tid}).eq('id', pcId));
  if (rcId)  updates.push(sb.from('recepciones').update({trabajo_id: tid}).eq('id', rcId));

  // 3. Actualizar hacia abajo — facturas que referencian estos documentos
  if (rcId)  updates.push(sb.from('facturas_proveedor').update({trabajo_id: tid}).match({recepcion_id: rcId, empresa_id: EMPRESA.id}));
  if (pcId)  updates.push(sb.from('facturas_proveedor').update({trabajo_id: tid}).match({pedido_compra_id: pcId, empresa_id: EMPRESA.id}).is('recepcion_id', null));
  if (prcId) updates.push(sb.from('facturas_proveedor').update({trabajo_id: tid}).match({presupuesto_compra_id: prcId, empresa_id: EMPRESA.id}).is('pedido_compra_id', null).is('recepcion_id', null));

  // 4. Actualizar pedidos que vienen del presupuesto
  if (prcId) updates.push(sb.from('pedidos_compra').update({trabajo_id: tid}).match({presupuesto_compra_id: prcId, empresa_id: EMPRESA.id}));
  // Recepciones que vienen del pedido
  if (pcId)  updates.push(sb.from('recepciones').update({trabajo_id: tid}).match({pedido_compra_id: pcId, empresa_id: EMPRESA.id}));

  await Promise.all(updates);
}

// ── Fecha y hora para el topbar ──
function _fechaHoraActual() {
  const now = new Date();
  const fecha = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return fecha + ', ' + hora;
}
// Actualizar hora del topbar cada minuto
setInterval(() => {
  const sub = document.getElementById('pgSub');
  if (sub && sub.textContent.match(/^\w.+\d{4},\s\d{2}:\d{2}$/)) {
    sub.textContent = _fechaHoraActual();
  }
}, 60000);

// ── Sidebar: siempre visible, con opción de pantalla completa ──
function toggleSidebar() {
  document.body.classList.toggle('sb-fullscreen');
}

// Aplicar secciones colapsadas desde preferencias guardadas
(function initSidebar() {
  if (typeof applySbCollapsed === 'function') applySbCollapsed();
})();

// ═══════════════════════════════════════════════
//  ORDENACIÓN GENÉRICA DE TABLAS
// ═══════════════════════════════════════════════
const _sortState = {}; // { tbodyId: { col: index, asc: true } }

function initSortableHeaders() {
  document.querySelectorAll('th[data-sort]').forEach(th => {
    if (th._sortInit) return; // Evitar listeners duplicados
    th._sortInit = true;
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.style.whiteSpace = 'nowrap';
    // Añadir indicador de ordenación
    if (!th.querySelector('.sort-ico')) {
      th.innerHTML += ' <span class="sort-ico" style="font-size:10px;opacity:0.3">⇅</span>';
    }
    th.addEventListener('click', () => {
      const table = th.closest('table');
      const tbody = table?.querySelector('tbody');
      if (!tbody || !tbody.id) return;
      const col = th.dataset.sort;
      const tipo = th.dataset.sortType || 'text'; // text, num, date
      const state = _sortState[tbody.id] || {};
      const asc = state.col === col ? !state.asc : true;
      _sortState[tbody.id] = { col, asc };
      // Actualizar iconos en todos los th de esta tabla
      table.querySelectorAll('th[data-sort] .sort-ico').forEach(ico => {
        ico.textContent = '⇅'; ico.style.opacity = '0.3';
      });
      th.querySelector('.sort-ico').textContent = asc ? '↑' : '↓';
      th.querySelector('.sort-ico').style.opacity = '1';
      // Ordenar filas del tbody
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const colIdx = Array.from(th.parentElement.children).indexOf(th);
      rows.sort((a, b) => {
        const cellA = a.cells[colIdx];
        const cellB = b.cells[colIdx];
        if (!cellA || !cellB) return 0;
        let vA = (cellA.dataset.sortVal || cellA.textContent).trim();
        let vB = (cellB.dataset.sortVal || cellB.textContent).trim();
        if (tipo === 'num') {
          vA = parseFloat(vA.replace(/[^\d.,-]/g,'').replace(',','.')) || 0;
          vB = parseFloat(vB.replace(/[^\d.,-]/g,'').replace(',','.')) || 0;
          return asc ? vA - vB : vB - vA;
        }
        if (tipo === 'date') {
          // Soporta dd/mm/yyyy y yyyy-mm-dd
          const pD = (s) => { if (!s || s==='—') return 0; const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return new Date(m[3],m[2]-1,m[1]).getTime(); return new Date(s).getTime()||0; };
          return asc ? pD(vA) - pD(vB) : pD(vB) - pD(vA);
        }
        // text
        return asc ? vA.localeCompare(vB,'es',{sensitivity:'base'}) : vB.localeCompare(vA,'es',{sensitivity:'base'});
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => setTimeout(initSortableHeaders, 500));

// ── Pila de navegación global ──
let navStack = [];

function _captureNavState() {
  const activePage = document.querySelector('.page.active')?.id?.replace('page-','');
  if (!activePage) return null;
  const state = { page: activePage };
  if (activePage === 'trabajos' && typeof obraActualId !== 'undefined' && obraActualId) {
    state.fichaObra = obraActualId;
  }
  if (activePage === 'mantenimientos' && typeof mantActualId !== 'undefined' && mantActualId) {
    state.fichaMant = mantActualId;
  }
  if (activePage === 'clientes' && typeof cliActualId !== 'undefined' && cliActualId) {
    state.fichaCliente = cliActualId;
  }
  return state;
}

function goBack() {
  if (!navStack.length) return;
  const state = navStack.pop();
  goPage(state.page, { _isBack: true });
  // Restaurar ficha si estábamos en una
  if (state.fichaObra && typeof abrirFichaObra === 'function') {
    abrirFichaObra(state.fichaObra);
  }
  if (state.fichaMant && typeof abrirFichaMant === 'function') {
    abrirFichaMant(state.fichaMant);
  }
  if (state.fichaCliente && typeof abrirFicha === 'function') {
    abrirFicha(state.fichaCliente);
  }
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Modales de solo lectura que NO necesitan populateSelects
const _readOnlyModals = new Set(['dtlPartes','modal-detalle-trasp','modal-movimientos-stock','mArtVistaRapida','mImportarIA','mOcrPreview']);

function openModal(id, skipReset){
  // Solo resetear si NO venimos de una edición
  if(!skipReset){
    ['c_id','pv_id','art_id','alm_id','ser_id','iva_id','ud_id','fp_id','fam_id'].forEach(hid=>{const el=document.getElementById(hid);if(el)el.value='';});
  }
  // Saltar populateSelects para modales de solo lectura (evita reflow costoso)
  if(!_readOnlyModals.has(id)){
    const savedSelects = {};
    if(skipReset){
      ['c_fpago','pv_fpago'].forEach(sid=>{
        const sel=document.getElementById(sid); if(sel) savedSelects[sid]=sel.value;
      });
    }
    populateSelects();
    if(skipReset){
      Object.entries(savedSelects).forEach(([sid,val])=>{const sel=document.getElementById(sid);if(sel)sel.value=val;});
    }
  }
  if(id==='mPresup'){pPartidas=[];renderPPartidas();document.getElementById('p_fecha').value=new Date().toISOString().split('T')[0];}
  if(id==='mCliente'&&!skipReset){
    document.getElementById('mCliTit').textContent='Nuevo Cliente';
    ['c_nombre','c_nif','c_tel','c_movil','c_email','c_dir','c_muni','c_cp','c_prov','c_notas'].forEach(fid=>{const el=document.getElementById(fid);if(el)el.value='';});
    const cd=document.getElementById('c_descuento');if(cd)cd.value=0;
  }
  if(id==='mNuevoUsuario'&&!skipReset){
    document.getElementById('mUsrTit').textContent='Nuevo Usuario';
    ['usr_id','usr_nombre','usr_apellidos','usr_email','usr_tel','usr_pass'].forEach(fid=>{const el=document.getElementById(fid);if(el)el.value='';});
    const up=document.getElementById('usrFotoPreview');
    if(up){up.innerHTML='?';up.style.background='var(--azul)';}
    usuariosFotoFile=null;
    setPermisosByRol('operario');
  }
  const modalEl = document.getElementById(id);
  if(!modalEl){ console.error('Modal not found:',id); toast('Error: modal no encontrado','error'); return; }
  modalEl.classList.add('open');
  // Bloquear scroll del body y compensar scrollbar para evitar salto de layout
  const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow='hidden';
  if(scrollbarW > 0) document.body.style.paddingRight = scrollbarW + 'px';
}

function closeModal(id){
  document.getElementById(id)?.classList.remove('open');
  // Restaurar scroll solo si no hay más modales abiertos
  if(!document.querySelector('.overlay.open')){
    document.body.style.overflow='';
    document.body.style.paddingRight='';
  }
}

// Close modal when clicking overlay
document.addEventListener('click',e=>{if(e.target.classList.contains('overlay'))closeModal(e.target.id);});

// Info de páginas "pronto" — icono, título y descripción + features previstos
const PAGE_PRONTO_INFO = {
  'facturas':            {ico:'🧾', titulo:'Facturas de venta', desc:'Gestión completa de facturas de venta: emisión, envío, cobro y seguimiento de pagos.', features:['Generación automática desde albaranes y presupuestos','Envío por email con enlace de pago','Control de vencimientos y cobros','Exportación contable']},
  'proveedores':         {ico:'🏭', titulo:'Proveedores', desc:'Directorio de proveedores con datos de contacto, condiciones y documentos asociados.', features:['Ficha completa de proveedor','Historial de compras y condiciones','Documentación vinculada','Evaluación de proveedores']},
  'presupuestos-compra': {ico:'📋', titulo:'Presupuestos de compra', desc:'Solicita y compara presupuestos de proveedores para tus compras.', features:['Solicitud de presupuesto a múltiples proveedores','Comparativa de ofertas','Conversión a pedido con un clic','Vinculación con obras']},
  'pedidos-compra':      {ico:'🛒', titulo:'Pedidos de compra', desc:'Crea pedidos, haz seguimiento de entregas y controla la recepción de materiales.', features:['Pedidos desde presupuestos aprobados','Seguimiento de estado y entregas','Recepción parcial de mercancía','Vinculación automática con obras']},
  'albaranes-proveedor': {ico:'📥', titulo:'Albaranes de proveedor', desc:'Registro de albaranes recibidos y control de mercancía entrante.', features:['Registro de entradas por proveedor','Control de cantidades recibidas','Vinculación con pedidos','Actualización automática de stock']},
  'facturas-proveedor':  {ico:'📑', titulo:'Facturas de proveedor', desc:'Control de facturas recibidas, vencimientos y pagos a proveedores.', features:['Registro de facturas de compra','Control de vencimientos','Programación de pagos','Conciliación con albaranes']},
  'calendario-pagos':    {ico:'📅', titulo:'Calendario de pagos', desc:'Vista de todos los pagos pendientes con fecha de vencimiento y banco asignado.', features:['Vista de pagos pendientes por fecha','Asignación de banco','Detección de vencidos','Exportación a Excel']},
  'almacenes':           {ico:'🏪', titulo:'Almacenes', desc:'Gestión multi-almacén: ubicaciones, capacidad y configuración.', features:['Múltiples almacenes y ubicaciones','Configuración de capacidad','Asignación a obras','Inventario por almacén']},
  'stock':               {ico:'📊', titulo:'Stock', desc:'Control de inventario en tiempo real con mínimos, máximos y alertas.', features:['Inventario en tiempo real','Alertas de stock mínimo','Valoración de existencias','Movimientos y trazabilidad']},
  'traspasos':           {ico:'🔄', titulo:'Traspasos', desc:'Movimientos de material entre almacenes con trazabilidad completa.', features:['Transferencia entre almacenes','Trazabilidad de cada movimiento','Aprobación de traspasos','Historial completo']},
  'activos':             {ico:'🔧', titulo:'Activos', desc:'Registro de herramientas, vehículos y equipos con mantenimiento y asignación.', features:['Inventario de herramientas y equipos','Control de mantenimiento preventivo','Asignación a operarios y obras','Alertas de caducidad y revisiones']},
  'mantenimientos':      {ico:'🔧', titulo:'Mantenimientos', desc:'Contratos de mantenimiento recurrente: planificación y seguimiento.', features:['Contratos con periodicidad configurable','Generación automática de partes','Historial de intervenciones','Facturación recurrente']},
  'bandeja':             {ico:'⚡', titulo:'Inbox', desc:'Todo lo que el ERP detecta automáticamente: facturas, albaranes, nóminas, formularios y más. Revisa, previsualiza y ejecuta.', features:['Detección automática de correos','Previsualización de adjuntos','Procesamiento OCR integrado','Subida manual de documentos']},
  'correo':              {ico:'📧', titulo:'Correo', desc:'Envía y recibe correos directamente desde el ERP, vinculados a obras y clientes.', features:['Bandeja de entrada integrada','Envío de presupuestos y facturas','Respuestas vinculadas a obras','Plantillas personalizables']},
  'fichajes':            {ico:'⏱️', titulo:'Fichajes', desc:'Control de entradas y salidas de empleados, horarios y horas trabajadas.', features:['Fichaje por app y QR','Horarios y turnos','Informes de horas','Integración con partes de trabajo']},
  'etiquetas-qr':        {ico:'🏷️', titulo:'Etiquetas QR', desc:'Genera etiquetas QR para artículos, almacenes y activos.', features:['Generación masiva de QR','Etiquetas personalizables','Escaneo desde móvil','Acceso rápido a fichas']},
};

// ═══════════════════════════════════════════════
// PERMISSION MAPPING FOR PAGES
// ═══════════════════════════════════════════════
const _permisosPagina = {
  'clientes': 'clientes',
  'presupuestos': 'presupuestos',
  'albaranes': 'facturas',
  'facturas': 'facturas',
  'rectificativas': 'facturas',
  'proveedores': 'clientes',
  'presupuestos-compra': 'presupuestos',
  'pedidos-compra': 'presupuestos',
  'albaranes-proveedor': 'facturas',
  'facturas-proveedor': 'facturas',
  'calendario-pagos': 'facturas',
  'articulos': 'stock',
  'servicios': 'stock',
  'stock': 'stock',
  'traspasos': 'stock',
  'flota': 'flota',
  'flota-gastos': 'flota',
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

function goPage(id, opts){
  opts = opts || {};

  // ── Composer de correo: si hay contenido sin enviar y vamos a salir, ofrecer guardar borrador
  try {
    const _activa = document.querySelector('.page.active')?.id?.replace('page-','');
    if (_activa === 'correo' && id !== 'correo' && !opts._desdeCorreoEnviado) {
      const view = document.getElementById('mailView');
      const cuerpoEl = document.getElementById('mail_cuerpo');
      if (view && cuerpoEl) {
        const cuerpo = cuerpoEl.value?.trim() || '';
        const asunto = document.getElementById('mail_asunto')?.value?.trim() || '';
        const para   = document.getElementById('mail_para')?.value?.trim() || '';
        const tieneAdj = !!view.dataset.adjuntos;
        if (cuerpo || asunto || para || tieneAdj) {
          // Diferimos: pedimos al modal del composer y, según respuesta, navegamos o no
          if (typeof _modalCorreoSinEnviar === 'function') {
            _modalCorreoSinEnviar().then(async r => {
              if (r === 'cancelar') return; // no navegar
              if (r === 'borrador' && typeof guardarBorradorCorreo === 'function') {
                await guardarBorradorCorreo();
              } else if (typeof cancelarCorreo === 'function') {
                cancelarCorreo(true);
              }
              goPage(id, { ...opts, _desdeCorreoEnviado: true });
            });
            return; // bloquear navegación inmediata
          }
        }
      }
    }
  } catch(e) { /* no romper navegación */ }

  // ── Check módulo contratado ──
  if (typeof PAGE_PERM_MAP !== 'undefined' && typeof moduloActivo === 'function') {
    const _map = PAGE_PERM_MAP[id];
    if (_map && !moduloActivo(_map.sec)) {
      toast('🔒 Este módulo no está incluido en tu plan actual. Contacta con soporte para ampliar.', 'error');
      return;
    }
  }
  // ── Permission Check (usa canAccessPage de permisos.js) ──
  if (typeof canAccessPage === 'function' && !canAccessPage(id)) {
    toast('🔒 No tienes permiso para acceder a esta sección', 'error');
    return;
  }

  // Si la página es "pronto", inyectar contenido de "en construcción"
  if (typeof PAGES_PRONTO !== 'undefined' && PAGES_PRONTO.has(id)) {
    const info = PAGE_PRONTO_INFO[id];
    if (info) {
      const pageEl = document.getElementById('page-'+id);
      if (pageEl) {
        pageEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div><h2 style="font-size:17px;font-weight:800">${info.ico} ${info.titulo}</h2><p style="font-size:11.5px;color:var(--gris-400)">${info.desc}</p></div>
          </div>
          <div class="card">
            <div class="card-b" style="padding:40px;text-align:center">
              <div style="font-size:48px;margin-bottom:16px">${info.ico}</div>
              <h3 style="font-size:16px;font-weight:700;margin-bottom:8px">${info.titulo} — Próximamente</h3>
              <p style="color:var(--gris-400);font-size:13px;max-width:460px;margin:0 auto;line-height:1.6">${info.desc}</p>
              ${info.features ? `<div style="margin-top:20px;text-align:left;max-width:380px;margin-left:auto;margin-right:auto">
                <div style="font-size:12px;font-weight:700;color:var(--gris-600);margin-bottom:8px">Funcionalidades previstas:</div>
                ${info.features.map(f => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12.5px;color:var(--gris-500);border-bottom:1px solid var(--gris-100)"><span style="color:var(--verde);font-size:14px">✓</span> ${f}</div>`).join('')}
              </div>` : ''}
              <div style="margin-top:24px;padding:12px 16px;background:var(--azul-light);border-radius:8px;display:inline-block">
                <span style="font-size:13px;color:var(--azul);font-weight:600">🚧 Esta sección está en desarrollo</span>
              </div>
            </div>
          </div>`;
      }
    }
  }
  // Badge BETA eliminado — solo fecha y hora en pgSub
  // Guardar estado actual en la pila (salvo si es navegación "atrás")
  if (!opts._isBack) {
    const prev = _captureNavState();
    if (prev && prev.page !== id) navStack.push(prev);
    // Limitar pila a 20 entradas
    if (navStack.length > 20) navStack.shift();
  }
  // Detener auto-sync de correo al salir de esa sección
  if(id!=='correo' && typeof detenerAutoSyncCorreo==='function') detenerAutoSyncCorreo();

  // Colapsar sidebar al navegar
  if (typeof _sbCollapse === 'function') _sbCollapse();

  // ── Limpieza DOM: vaciar tbody de páginas pesadas al salir ──
  // Evita acumulación de nodos que ralentizan los inputs
  document.querySelectorAll('.page.active').forEach(p => {
    if (p.id !== 'page-' + id) {
      const tbodies = p.querySelectorAll('tbody');
      tbodies.forEach(tb => { if (tb.children.length > 50) tb.innerHTML = ''; });
    }
  });

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+id)?.classList.add('active');
  document.querySelectorAll('.sb-item').forEach(b=>{if(b.getAttribute('onclick')?.includes("'"+id+"'"))b.classList.add('active');});
  const titles={dashboard:'🏠 Panel',clientes:'👥 Clientes',proveedores:'🏭 Proveedores',articulos:'📦 Artículos',servicios:'🛠️ Servicios',almacenes:'🏬 Almacenes',asitur:'🛡️ Asitur',trabajos:'🏗️ Obras',mantenimientos:'🔧 Mantenimientos',presupuestos:'📋 Presupuestos',albaranes:'📄 Albaranes',facturas:'💶 Facturas','presupuestos-compra':'📋 Presupuestos de compra','pedidos-compra':'📦 Pedidos de compra','albaranes-proveedor':'📄 Albaranes de proveedor','facturas-proveedor':'🧾 Facturas de proveedor','calendario-pagos':'📅 Calendario de Pagos',correo:'📧 Correo',stock:'📊 Stock',traspasos:'🔄 Traspasos',activos:'🔧 Activos',partes:'📝 Partes de trabajo',planificador:'⏱️ Planificador Semanal',fichajes:'⏱️ Fichajes','audit-log':'📜 Registro de actividad',papelera:'🗑️ Papelera',usuarios:'👷 Usuarios',configuracion:'⚙️ Configuración','etiquetas-qr':'🏷️ Etiquetas QR',mistareas:'✅ Tareas',calendario:'📅 Calendario',ocr:'🤖 Bandeja OCR',laboratorio:'🧪 Laboratorio de pruebas',flota:'🚐 Flota','flota-gastos':'💰 Gastos de flota','tesoreria-cuentas':'🏦 Cuentas bancarias','tesoreria-movimientos':'🏦 Movimientos','tesoreria-conciliacion':'🏦 Conciliación','tesoreria-importar':'🏦 Importar extractos',ausencias:'📋 Ausencias',timeline:'👥 Timeline operarios','calendario-laboral':'📅 Calendario laboral'};
  document.getElementById('pgTitle').textContent = titles[id]||id;
  document.getElementById('pgSub').textContent = _fechaHoraActual();
  // Topbar limpio — sin botones
  const tb = document.getElementById('topbarBtns');
  if (tb) tb.innerHTML = '';
  if(id==='configuracion') renderConfigLists();
  if(id==='etiquetas-qr') cargarPaginaEtiquetasQR();
  if(id==='mEmpresas') renderEmpresasList();
  if(id==='usuarios') loadUsuarios();
  if(id==='audit-log') loadAuditLog();
  if(id==='papelera') loadPapelera();
  if(id==='presupuestos') loadPresupuestos();
  if(id==='albaranes') loadAlbaranes();
  if(id==='facturas') loadFacturas();
  if(id==='rectificativas' && typeof loadRectificativas==='function') loadRectificativas();
  if(id==='fichajes') loadFichajes();
  if(id==='ausencias') loadAusencias();
  if(id==='timeline') loadTimeline();
  if(id==='calendario-laboral') loadCalendarioLaboral();
  if(id==='laboratorio' && typeof loadLaboratorio==='function') loadLaboratorio();
  if(id==='partes') loadPartes();
  if(id==='planificador' && typeof initPlanificador==='function') initPlanificador();
  if(id==='calendario' && typeof renderCalendario==='function') renderCalendario();
  if(id==='mistareas' && typeof cargarMisTareas==='function') cargarMisTareas();
  if(id==='articulos' && typeof renderArticulos==='function') renderArticulos(articulos);
  if(id==='servicios' && typeof renderServicios==='function') renderServicios();
  if(id==='asitur') { const f=document.getElementById('asiturFrame'); if(f&&f.src==='about:blank') f.src='https://conectahogar.asitur.es/'; }
  if(id==='stock') loadStock();
  if(id==='consumos' && typeof loadConsumos==='function') loadConsumos();
  if(id==='incidencias-stock' && typeof loadIncidencias==='function') loadIncidencias();
  if(id==='flota' && typeof renderFlota==='function') renderFlota();
  if(id==='flota-gastos' && typeof renderGastos==='function') renderGastos();
  if(id==='tesoreria-cuentas' && typeof renderTesCuentas==='function') renderTesCuentas();
  if(id==='tesoreria-movimientos' && typeof renderTesMovimientos==='function') renderTesMovimientos();
  if(id==='tesoreria-conciliacion' && typeof renderTesConciliacion==='function') renderTesConciliacion();
  if(id==='tesoreria-importar' && typeof renderTesImportar==='function') renderTesImportar();
  if(id==='traspasos') loadTraspasos();
  if(id==='mantenimientos') loadMantenimientos();
  if(id==='presupuestos-compra') loadPresupuestosCompra();
  if(id==='pedidos-compra') loadPedidosCompra();
  if(id==='albaranes-proveedor') loadRecepciones();
  if(id==='facturas-proveedor') loadFacturasProv();
  if(id==='calendario-pagos') loadCalendarioPagos();
  if(id==='ocr') loadOCRInbox();
  if(id==='bandeja') loadBandeja();
  if(id==='correo') loadCorreos();
  if(id==='trabajos'){
    // Solo cerrar ficha si NO es navegación "atrás" (goBack restaurará la ficha)
    if(!opts._isBack && typeof cerrarFichaObra==='function') cerrarFichaObra();
    filtrarTrabajos ? filtrarTrabajos() : renderTrabajos();
  }
  if(id==='mantenimientos'){
    if(!opts._isBack && typeof cerrarFichaMant==='function') cerrarFichaMant();
  }
  if(id==='clientes'){
    cliFiltroList=[...clientes];
    renderClientes(clientes);
    if(!opts._isBack) setCliVista(cliVista==='ficha'?'tarjetas':cliVista);
  }
  // Reinicializar headers ordenables después de cargar datos
  setTimeout(initSortableHeaders, 300);
}

function cfgTab(id,el){
  document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.cfg-menu-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('cfg-'+id).classList.add('active');
  el.classList.add('active');
}

function nuevoRapido(){
  const a=document.querySelector('.page.active')?.id?.replace('page-','');
  const m={clientes:'mCliente',proveedores:'mProveedor',articulos:'mArticulo',almacenes:'mAlmacen',trabajos:'mTrabajo'};
  if(m[a])openModal(m[a]);
}

function importarRapido(){
  const a=document.querySelector('.page.active')?.id?.replace('page-','');
  const m={clientes:'mImportarClientes',proveedores:'mImportarProveedores',articulos:'mImportarArticulos'};
  if(m[a]) openModal(m[a]);
}

function populateSelects(){
  // Clientes
  // tr_cli ya no es select, es buscador con autocomplete — no necesita populateSelects
  // Se mantiene compatibilidad: si existe como select (versión antigua), se puebla
  const trCliEl = document.getElementById('tr_cli');
  if (trCliEl && trCliEl.tagName === 'SELECT') {
    const cOpts='<option value="">— Sin cliente —</option>'+clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
    trCliEl.innerHTML = cOpts;
  }
  // Formas pago
  const fpOpts='<option value="">— Sin forma de pago —</option>'+formasPago.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  ['c_fpago','pv_fpago'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=fpOpts;});
  // Selector de familia padre (en modal de config) - sigue siendo select normal
  const famParent=document.getElementById('fam_parent');
  if(famParent)famParent.innerHTML='<option value="">— Familia raíz —</option>'+familias.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  // Empresas
  renderEmpresasList();
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Familias
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Familia (solo padres)
// ═══════════════════════════════════════════════
function acFamilia(q) {
  const drop = document.getElementById('acFamiliaDropdown');
  const query = (q || '').toLowerCase().trim();

  // Solo familias padre (sin parent_id)
  const padres = familias.filter(f => !f.parent_id);
  let filtered = query ? padres.filter(p => p.nombre.toLowerCase().includes(query)) : padres;

  let html = '';
  if (!query) {
    html += '<div class="ac-item" onmousedown="event.preventDefault();acFamiliaSelect(\'\',\'\')"><span style="color:var(--gris-400)">— Sin familia —</span></div>';
  }
  filtered.forEach(f => {
    const nHijos = familias.filter(h => h.parent_id === f.id).length;
    const badge = nHijos ? `<small style="color:var(--gris-400);margin-left:6px">(${nHijos} sub)</small>` : '';
    html += `<div class="ac-item" onmousedown="event.preventDefault();acFamiliaSelect('${f.id}','${f.nombre.replace(/'/g,"\\'")}')">
      <strong>${f.nombre}</strong>${badge}
    </div>`;
  });

  // Crear nueva familia
  const exactMatch = padres.some(f => f.nombre.toLowerCase() === query);
  if (query && !exactMatch) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearFamiliaDesdeAC('${query.replace(/'/g,"\\'")}')">
      + Crear familia "${q.trim()}"
    </div>`;
  } else if (!query) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearFamiliaDesdeAC('')">
      + Nueva familia...
    </div>`;
  }

  drop.innerHTML = html || '<div class="ac-empty">Sin resultados</div>';
  drop.style.display = '';
}

function acFamiliaHide() { document.getElementById('acFamiliaDropdown').style.display = 'none'; }

function acFamiliaSelect(id, nombre) {
  document.getElementById('art_familia').value = id;
  document.getElementById('art_familia_input').value = nombre;
  acFamiliaHide();
  // Limpiar subfamilia al cambiar familia
  document.getElementById('art_subfamilia').value = '';
  document.getElementById('art_subfamilia_input').value = '';
  // Mostrar/ocultar campo subfamilia
  actualizarSubfamiliaVisibilidad(id);
}

// Mostrar campo subfamilia solo si la familia seleccionada tiene hijos o si se quiere crear
function actualizarSubfamiliaVisibilidad(familiaId) {
  const wrap = document.getElementById('art_subfamilia_wrap');
  if (!familiaId) { wrap.style.display = 'none'; return; }
  // Siempre mostrar: permite crear subfamilias aunque no existan aún
  wrap.style.display = '';
}

// Setter para cargar familia al editar artículo
function setArtFamilia(familiaId) {
  if (!familiaId) {
    document.getElementById('art_familia').value = '';
    document.getElementById('art_familia_input').value = '';
    document.getElementById('art_subfamilia_wrap').style.display = 'none';
    return;
  }
  const fam = familias.find(f => f.id == familiaId);
  if (fam && fam.parent_id) {
    // Es una subfamilia: poner el padre en Familia y esta en Subfamilia
    const padre = familias.find(f => f.id == fam.parent_id);
    document.getElementById('art_familia').value = padre ? padre.id : '';
    document.getElementById('art_familia_input').value = padre ? padre.nombre : '';
    document.getElementById('art_subfamilia').value = fam.id;
    document.getElementById('art_subfamilia_input').value = fam.nombre;
    actualizarSubfamiliaVisibilidad(padre ? padre.id : '');
  } else {
    // Es familia padre
    document.getElementById('art_familia').value = familiaId;
    document.getElementById('art_familia_input').value = fam?.nombre || '';
    document.getElementById('art_subfamilia').value = '';
    document.getElementById('art_subfamilia_input').value = '';
    actualizarSubfamiliaVisibilidad(familiaId);
  }
}

async function crearFamiliaDesdeAC(nombre) {
  acFamiliaHide();
  if (!nombre) {
    nombre = prompt('Nombre de la nueva familia:');
    if (!nombre || !nombre.trim()) return;
  }
  const obj = { empresa_id: EMPRESA.id, nombre: nombre.trim(), parent_id: null };
  const { data, error } = await sb.from('familias_articulos').insert(obj).select('id').single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const { data: fresh } = await sb.from('familias_articulos').select('*').eq('empresa_id', EMPRESA.id);
  familias = fresh || [];
  acFamiliaSelect(data.id, nombre.trim());
  toast('Familia "' + nombre.trim() + '" creada ✓', 'success');
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Subfamilia (hijos de la familia seleccionada)
// ═══════════════════════════════════════════════
function acSubfamilia(q) {
  const drop = document.getElementById('acSubfamiliaDropdown');
  const query = (q || '').toLowerCase().trim();
  const padreId = document.getElementById('art_familia').value;
  if (!padreId) { drop.style.display = 'none'; return; }

  const hijos = familias.filter(f => String(f.parent_id) === String(padreId));
  let filtered = query ? hijos.filter(h => h.nombre.toLowerCase().includes(query)) : hijos;

  let html = '';
  if (!query) {
    html += '<div class="ac-item" onmousedown="event.preventDefault();acSubfamiliaSelect(\'\',\'\')"><span style="color:var(--gris-400)">— Sin subfamilia —</span></div>';
  }
  filtered.forEach(h => {
    html += `<div class="ac-item" onmousedown="event.preventDefault();acSubfamiliaSelect('${h.id}','${h.nombre.replace(/'/g,"\\'")}')">
      <strong>${h.nombre}</strong>
    </div>`;
  });

  // Crear nueva subfamilia
  const exactMatch = hijos.some(h => h.nombre.toLowerCase() === query);
  if (query && !exactMatch) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearSubfamiliaDesdeAC('${query.replace(/'/g,"\\'")}')">
      + Crear subfamilia "${q.trim()}"
    </div>`;
  } else if (!query) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearSubfamiliaDesdeAC('')">
      + Nueva subfamilia...
    </div>`;
  }

  drop.innerHTML = html || '<div class="ac-empty">Sin subfamilias</div>';
  drop.style.display = '';
}

function acSubfamiliaHide() { document.getElementById('acSubfamiliaDropdown').style.display = 'none'; }

function acSubfamiliaSelect(id, nombre) {
  document.getElementById('art_subfamilia').value = id;
  document.getElementById('art_subfamilia_input').value = nombre;
  acSubfamiliaHide();
}

function setArtSubfamilia(subId) {
  const sub = familias.find(f => f.id == subId);
  document.getElementById('art_subfamilia').value = subId || '';
  document.getElementById('art_subfamilia_input').value = sub?.nombre || '';
}

async function crearSubfamiliaDesdeAC(nombre) {
  acSubfamiliaHide();
  const padreId = document.getElementById('art_familia').value;
  if (!padreId) { toast('Selecciona primero una familia', 'error'); return; }

  if (!nombre) {
    nombre = prompt('Nombre de la nueva subfamilia:');
    if (!nombre || !nombre.trim()) return;
  }
  const obj = { empresa_id: EMPRESA.id, nombre: nombre.trim(), parent_id: parseInt(padreId) };
  const { data, error } = await sb.from('familias_articulos').insert(obj).select('id').single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const { data: fresh } = await sb.from('familias_articulos').select('*').eq('empresa_id', EMPRESA.id);
  familias = fresh || [];
  acSubfamiliaSelect(data.id, nombre.trim());
  toast('Subfamilia "' + nombre.trim() + '" creada ✓', 'success');
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Tipo IVA
// ═══════════════════════════════════════════════
function acIva(q) {
  const drop = document.getElementById('acIvaDropdown');
  const query = (q || '').toLowerCase().trim();

  let filtered = query ? tiposIva.filter(i => i.nombre.toLowerCase().includes(query) || String(i.porcentaje).includes(query)) : tiposIva;

  let html = '';
  if (!query) html += '<div class="ac-item" onmousedown="event.preventDefault();acIvaSelect(\'\',\'\')"><span style="color:var(--gris-400)">— Sin IVA —</span></div>';
  filtered.forEach(i => {
    html += `<div class="ac-item" onmousedown="event.preventDefault();acIvaSelect('${i.id}','${i.nombre} (${i.porcentaje}%)')">
      <strong>${i.nombre}</strong><span style="margin-left:8px;color:var(--gris-500)">${i.porcentaje}%</span>
      ${i.por_defecto ? '<span style="margin-left:6px;font-size:10px;color:var(--azul)">por defecto</span>' : ''}
    </div>`;
  });

  const exactMatch = tiposIva.some(i => i.nombre.toLowerCase() === query);
  if (query && !exactMatch) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearIvaDesdeAC('${query.replace(/'/g,"\\'")}')">
      + Crear tipo IVA "${q.trim()}"
    </div>`;
  } else if (!query) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearIvaDesdeAC('')">
      + Nuevo tipo IVA...
    </div>`;
  }

  drop.innerHTML = html || '<div class="ac-empty">Sin resultados</div>';
  drop.style.display = '';
}

function acIvaHide() { document.getElementById('acIvaDropdown').style.display = 'none'; }

function acIvaSelect(id, label) {
  document.getElementById('art_iva').value = id;
  document.getElementById('art_iva_input').value = label;
  acIvaHide();
}

function setArtIva(ivaId) {
  const iva = tiposIva.find(i => i.id == ivaId);
  document.getElementById('art_iva').value = ivaId || '';
  document.getElementById('art_iva_input').value = iva ? `${iva.nombre} (${iva.porcentaje}%)` : '';
}

async function crearIvaDesdeAC(nombre) {
  acIvaHide();
  if (!nombre) { nombre = prompt('Nombre del tipo IVA (ej: Reducido):'); }
  if (!nombre || !nombre.trim()) return;
  const pct = prompt('Porcentaje IVA (ej: 10):');
  if (pct === null) return;

  const obj = { empresa_id: EMPRESA.id, nombre: nombre.trim(), porcentaje: parseFloat(pct) || 0, por_defecto: false };
  const { data, error } = await sb.from('tipos_iva').insert(obj).select('id').single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const { data: fresh } = await sb.from('tipos_iva').select('*').eq('empresa_id', EMPRESA.id);
  tiposIva = fresh || [];
  acIvaSelect(data.id, nombre.trim() + ' (' + (parseFloat(pct)||0) + '%)');
  toast('Tipo IVA "' + nombre.trim() + '" creado ✓', 'success');
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Unidad de medida
// ═══════════════════════════════════════════════
function acUnidad(q) {
  const drop = document.getElementById('acUnidadDropdown');
  const query = (q || '').toLowerCase().trim();

  let filtered = query ? unidades.filter(u => u.nombre.toLowerCase().includes(query) || u.abreviatura.toLowerCase().includes(query)) : unidades;

  let html = '';
  if (!query) html += '<div class="ac-item" onmousedown="event.preventDefault();acUnidadSelect(\'\',\'\')"><span style="color:var(--gris-400)">— Sin unidad —</span></div>';
  filtered.forEach(u => {
    html += `<div class="ac-item" onmousedown="event.preventDefault();acUnidadSelect('${u.id}','${u.nombre} (${u.abreviatura})')">
      <strong>${u.nombre}</strong><span style="margin-left:8px;color:var(--gris-500)">${u.abreviatura}</span>
    </div>`;
  });

  const exactMatch = unidades.some(u => u.nombre.toLowerCase() === query);
  if (query && !exactMatch) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearUnidadDesdeAC('${query.replace(/'/g,"\\'")}')">
      + Crear unidad "${q.trim()}"
    </div>`;
  } else if (!query) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearUnidadDesdeAC('')">
      + Nueva unidad...
    </div>`;
  }

  drop.innerHTML = html || '<div class="ac-empty">Sin resultados</div>';
  drop.style.display = '';
}

function acUnidadHide() { document.getElementById('acUnidadDropdown').style.display = 'none'; }

function acUnidadSelect(id, label) {
  document.getElementById('art_unidad').value = id;
  document.getElementById('art_unidad_input').value = label;
  acUnidadHide();
}

function setArtUnidad(unidadId) {
  const ud = unidades.find(u => u.id == unidadId);
  document.getElementById('art_unidad').value = unidadId || '';
  document.getElementById('art_unidad_input').value = ud ? `${ud.nombre} (${ud.abreviatura})` : '';
}

async function crearUnidadDesdeAC(nombre) {
  acUnidadHide();
  if (!nombre) { nombre = prompt('Nombre de la unidad (ej: Metro lineal):'); }
  if (!nombre || !nombre.trim()) return;
  const abrev = prompt('Abreviatura (ej: ml):');
  if (!abrev || !abrev.trim()) return;

  const obj = { empresa_id: EMPRESA.id, nombre: nombre.trim(), abreviatura: abrev.trim() };
  const { data, error } = await sb.from('unidades_medida').insert(obj).select('id').single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const { data: fresh } = await sb.from('unidades_medida').select('*').eq('empresa_id', EMPRESA.id);
  unidades = fresh || [];
  acUnidadSelect(data.id, nombre.trim() + ' (' + abrev.trim() + ')');
  toast('Unidad "' + nombre.trim() + '" creada ✓', 'success');
}

function v(id){return document.getElementById(id)?.value||'';}

function setVal(obj){Object.entries(obj).forEach(([k,val])=>{const el=document.getElementById(k);if(el)el.value=val;});}

function showErr(id,msg){const el=document.getElementById(id);el.textContent=msg;el.style.display='block';}

function fmtE(n){return(parseFloat(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}

/** Formatea bytes a texto legible (KB, MB) */
function fmtBytes(bytes){if(!bytes||bytes===0)return'';if(bytes<1024)return bytes+' B';if(bytes<1048576)return(bytes/1024).toFixed(1)+' KB';return(bytes/1048576).toFixed(1)+' MB';}

function ini(n){return(n||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';}

const AVC=['#1B4FD8','#16A34A','#D97706','#DC2626','#7C3AED','#0891B2','#DB2777','#0F766E'];

// ═══════════════════════════════════════════════
// PREVIEW HOVER DE IMÁGENES (zoom al pasar ratón)
// ═══════════════════════════════════════════════
let _hoverPreview = null;
let _hoverUrl = '';
const _PREVIEW_W = 620;  // ancho máximo preview
const _PREVIEW_H = 520;  // alto máximo preview

function showImgPreview(url, e) {
  if (!url) return;
  _hoverUrl = url;
  if (!_hoverPreview) {
    _hoverPreview = document.createElement('div');
    _hoverPreview.id = 'imgHoverPreview';
    _hoverPreview.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:#111;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.45);padding:4px;display:none';
    _hoverPreview.innerHTML = `<img style="display:block;border-radius:6px;max-width:${_PREVIEW_W - 8}px;max-height:${_PREVIEW_H - 8}px;object-fit:contain">`;
    document.body.appendChild(_hoverPreview);
  }
  const img = _hoverPreview.querySelector('img');
  if (img.getAttribute('data-src') !== url) {
    img.setAttribute('data-src', url);
    img.src = url;
  }
  _hoverPreview.style.display = 'block';
  _positionPreview(e);
}

function moveImgPreview(e) {
  // No reposicionar — la preview se fija al entrar para no tapar las fotos vecinas
}

function hideImgPreview() {
  _hoverUrl = '';
  if (_hoverPreview) _hoverPreview.style.display = 'none';
}

function _positionPreview(e) {
  if (!_hoverPreview) return;
  const gap = 8;
  const vw = window.innerWidth, vh = window.innerHeight;

  // Buscar el elemento miniatura sobre el que estamos haciendo hover
  const thumb = e.target.closest('[onmouseenter*="showImgPreview"]') || e.target;
  const rect = thumb.getBoundingClientRect();

  // Centrar horizontalmente con la miniatura
  let left = rect.left + rect.width / 2 - _PREVIEW_W / 2;
  if (left + _PREVIEW_W + gap > vw) left = vw - _PREVIEW_W - gap;
  if (left < gap) left = gap;

  // Intentar poner ENCIMA de la fila de miniaturas; si no cabe, DEBAJO
  let top = rect.top - _PREVIEW_H - gap - 8;
  if (top < gap) {
    // No cabe arriba → poner debajo
    top = rect.bottom + gap;
  }
  // Si tampoco cabe debajo, forzar arriba pegado al borde
  if (top + _PREVIEW_H > vh - gap) top = gap;

  _hoverPreview.style.left = left + 'px';
  _hoverPreview.style.top = top + 'px';
}

function avC(n){return AVC[(n||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%AVC.length];}

function catIco(c){return{Fontanería:'🚿',Calefacción:'🔥','Aire Acondicionado':'❄️','Energías Renovables':'☀️',Reforma:'🛁',Electricidad:'⚡'}[c]||'🔧';}

function estadoBadge(e){const m={pendiente:'<span class="badge bg-gray">⏳ Pendiente</span>',planificado:'<span class="badge bg-blue">📅 Planificado</span>',en_curso:'<span class="badge bg-yellow">🔧 En curso</span>',facturado:'<span class="badge" style="background:#F5F3FF;color:#7C3AED">🧾 Facturado</span>',finalizado:'<span class="badge bg-green">✅ Finalizado</span>'};return m[e]||`<span class="badge bg-gray">${e||'—'}</span>`;}

function estadoBadgeP(e){const m={borrador:'<span class="badge bg-gray">✏️ Borrador</span>',pendiente:'<span class="badge bg-yellow">⏳ Pendiente</span>',aceptado:'<span class="badge bg-green">✅ Aceptado</span>',caducado:'<span class="badge bg-red">⏰ Caducado</span>',anulado:'<span class="badge bg-gray">🚫 Anulado</span>'};return m[e]||`<span class="badge bg-gray">${e||'—'}</span>`;}

function estadoBadgeF(e){const m={pendiente:'<span class="badge bg-yellow">⏳ Pendiente</span>',cobrada:'<span class="badge bg-green">✅ Cobrada</span>',pagada:'<span class="badge bg-green">✅ Cobrada</span>',vencida:'<span class="badge bg-red">⚠️ Vencida</span>',anulada:'<span class="badge bg-gray">🚫 Anulada</span>'};return m[e]||`<span class="badge bg-gray">${e||'—'}</span>`;}

function estadoBadgeA(e){const m={borrador:'<span class="badge bg-gray">✏️ Borrador</span>',pendiente:'<span class="badge bg-yellow">⏳ Pendiente</span>',entregado:'<span class="badge bg-green">✅ Entregado</span>',facturado:'<span class="badge bg-blue">🧾 Facturado</span>',anulado:'<span class="badge bg-gray">🚫 Anulado</span>'};return m[e]||`<span class="badge bg-gray">${e||'—'}</span>`;}

function prioBadge(p){const m={Urgente:'<span class="badge bg-red">🔴</span>',Alta:'<span class="badge" style="background:#FFF4ED;color:var(--acento)">🟠</span>',Normal:'<span class="badge bg-gray">⚪</span>',Baja:'<span class="badge bg-gray">🔵</span>'};return m[p]||'';}

function toast(msg,type='info'){const c=document.getElementById('toast');const t=document.createElement('div');t.className=`ti ${type}`;t.innerHTML=`<span>${{success:'✅',error:'❌',info:'ℹ️'}[type]}</span> ${msg}`;c.appendChild(t);setTimeout(()=>t.classList.add('show'),10);setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300);},3800);}

/**
 * Modal de confirmación bonito — reemplaza confirm() nativo.
 * Devuelve Promise<boolean>.
 *
 * @param {Object} opts
 *   titulo:     Título principal (ej: 'Emitir factura definitiva')
 *   mensaje:    Texto descriptivo (acepta HTML)
 *   aviso:      Texto de aviso rojo (ej: 'Esta acción no se puede deshacer')
 *   icono:      Emoji grande (default: '⚠️')
 *   btnOk:      Texto botón aceptar (default: 'Aceptar')
 *   btnCancel:  Texto botón cancelar (default: 'Cancelar')
 *   colorOk:    Color botón aceptar (default: '#059669')
 */
function confirmModal(opts = {}) {
  return new Promise(resolve => {
    const id = '_confirmOverlay_' + Date.now();
    const ov = document.createElement('div');
    ov.id = id;
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10010;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s';
    const colorOk = opts.colorOk || '#059669';
    ov.innerHTML = `
      <div style="background:white;border-radius:16px;padding:32px 36px;max-width:${opts.ancho || '440px'};width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center">
        <div style="font-size:48px;margin-bottom:12px">${opts.icono || '⚠️'}</div>
        <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#111">${opts.titulo || 'Confirmar'}</h2>
        <div style="color:#555;font-size:14px;line-height:1.6;margin:0 0 8px;text-align:left">${opts.mensaje || ''}</div>
        ${opts.aviso ? `<p style="color:#b91c1c;font-size:13px;font-weight:600;margin:8px 0 20px">⚠️ ${opts.aviso}</p>` : '<div style="height:16px"></div>'}
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="${id}_no" style="padding:10px 24px;border-radius:10px;border:1px solid #ddd;background:#f5f5f5;color:#555;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s">${opts.btnCancel || 'Cancelar'}</button>
          <button id="${id}_si" style="padding:10px 28px;border-radius:10px;border:none;background:${colorOk};color:white;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px ${colorOk}66;transition:opacity .15s">${opts.btnOk || 'Aceptar'}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = (val) => { ov.remove(); resolve(val); };
    const btnSi = document.getElementById(id + '_si');
    const btnNo = document.getElementById(id + '_no');
    btnSi.onclick = () => close(true);
    btnNo.onclick = () => close(false);
    ov.addEventListener('click', e => { if (e.target === ov) close(false); });
    // Capturar Enter/Escape y evitar que se propague al fondo
    ov.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
    });
    btnSi.focus();
  });
}

// ═══════════════════════════════════════════════
//  NAVEGACIÓN TAB / ENTER EN LÍNEAS DE DOCUMENTO
//  Tab = avanza campo (sin confirmar). Enter = confirma y avanza.
//  Al final de la fila, Enter crea nueva línea automáticamente.
//  Funciona en: editor, pedidos, recepciones, facturas prov, factura rápida
// ═══════════════════════════════════════════════
const _LINE_TABLES = '#de_lineas, #prc_lineas, #pc_lineas, #rc_lineas, #fp_lineas, #fr_lineas';
const _ADD_LINE_FNS = {
  de_lineas:  () => typeof de_addLinea==='function' && de_addLinea(),
  prc_lineas: () => typeof prc_addLinea==='function' && prc_addLinea(),
  pc_lineas:  () => typeof pc_addLinea==='function' && pc_addLinea(),
  rc_lineas:  () => typeof rc_addLinea==='function' && rc_addLinea(),
  fp_lineas:  () => typeof fp_addLinea==='function' && fp_addLinea(),
  fr_lineas:  () => typeof fr_addLinea==='function' && fr_addLinea(),
};

function _lineNavFocusNew(tbody) {
  setTimeout(() => {
    const rows = tbody.querySelectorAll('tr');
    if (!rows.length) return;
    const lastRow = rows[rows.length - 1];
    const firstInput = lastRow.querySelector('input:not([type="hidden"]), select');
    if (firstInput) { firstInput.focus(); if (firstInput.select) firstInput.select(); }
  }, 50);
}

document.addEventListener('keydown', function(e) {
  const isEnter = e.key === 'Enter';
  const isTab = e.key === 'Tab' && !e.shiftKey;
  if (!isEnter && !isTab) return;
  if (e.defaultPrevented) return;

  const el = e.target;
  if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;

  // No interferir con el autocompletado de artículos (dropdown abierto)
  const acDrop = document.getElementById('acArticulos');
  if (acDrop && acDrop.style.display !== 'none' && isEnter) return;

  // Solo actuar dentro de tablas de líneas
  const tbody = el.closest(_LINE_TABLES);
  if (!tbody) return;

  const row = el.closest('tr');
  if (!row) return;

  // Buscar campos editables en la fila (excluir botones ✕)
  const fields = Array.from(row.querySelectorAll('input:not([type="hidden"]):not([style*="display:none"]), select'));
  const idx = fields.indexOf(el);
  if (idx < 0) return;

  e.preventDefault();

  // Guardar posición ANTES de que blur/onchange destruya el DOM
  const tbodyId = tbody.id;
  const allRows = Array.from(tbody.querySelectorAll('tr'));
  const rowIdx = allRows.indexOf(row);
  const nextFieldIdx = idx + 1;
  const isLastField = idx >= fields.length - 1;

  // Blur para confirmar el valor (dispara onchange → re-render)
  el.blur();

  // Navegar DESPUÉS de que el render se complete, buscando por posición en el DOM nuevo
  setTimeout(() => {
    const tb = document.getElementById(tbodyId);
    if (!tb) return;

    if (!isLastField) {
      // Avanzar al siguiente campo de la misma fila
      const rows = tb.querySelectorAll('tr');
      const targetRow = rows[rowIdx];
      if (!targetRow) return;
      const targetFields = Array.from(targetRow.querySelectorAll('input:not([type="hidden"]):not([style*="display:none"]), select'));
      const target = targetFields[nextFieldIdx];
      if (target) { target.focus(); if (target.select) target.select(); }
    } else if (isEnter) {
      // Enter en el último campo → crear nueva línea
      if (_ADD_LINE_FNS[tbodyId]) _ADD_LINE_FNS[tbodyId]();
      _lineNavFocusNew(tb);
    } else {
      // Tab en último campo → saltar a la primera celda de la siguiente fila
      const rows = tb.querySelectorAll('tr');
      if (rowIdx < rows.length - 1) {
        const nextRow = rows[rowIdx + 1];
        const first = nextRow.querySelector('input:not([type="hidden"]), select');
        if (first) { first.focus(); if (first.select) first.select(); }
      }
    }
  }, 50);
});

// setPermisosByRol → movido a js/core/permisos.js (sistema granular nivel 3)

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
  if (!e.target.closest('#acArticulos') && !e.target.matches('[data-ac]')) {
    const d = document.getElementById('acArticulos');
    if (d) d.style.display='none';
  }
});

// ═══════════════════════════════════════════════
//  AUTOCOMPLETE GENÉRICO — Para artículos en TODAS las tablas de líneas
//  Reemplaza los <select> por <input> con búsqueda en vivo
// ═══════════════════════════════════════════════
const _AC = { timer:null, idx:-1, input:null, results:[], onSelect:null };

/**
 * Buscar artículos — se llama desde oninput de cualquier campo de línea
 * @param {HTMLInputElement} input — el input con data-ac="articulos" y data-linea-idx
 * @param {Function} onSelect — callback(lineaIdx, articulo) cuando se selecciona
 * @param {string} priceField — 'precio_venta' o 'precio_coste' según contexto
 */
function acBuscarArticulo(input, onSelect, priceField) {
  clearTimeout(_AC.timer);
  const q = input.value.trim().toLowerCase();
  const drop = document.getElementById('acArticulos');
  if (!drop) return;
  _AC.input = input;
  _AC.onSelect = onSelect;
  if (q.length < 1) { drop.style.display='none'; _AC.results=[]; return; }
  _AC.timer = setTimeout(()=>{
    const results = (typeof articulos!=='undefined'?articulos:[]).filter(a =>
      (a.activo !== false) &&
      ((a.codigo||'').toLowerCase().includes(q) ||
       (a.nombre||'').toLowerCase().includes(q) ||
       (a.referencia_fabricante||'').toLowerCase().includes(q) ||
       (a.descripcion||'').toLowerCase().includes(q))
    ).slice(0, 10);
    _AC.idx = -1;
    _AC.results = results;
    const pf = priceField || 'precio_venta';
    if (results.length === 0 && (typeof articulos==='undefined'||articulos.length===0)) {
      drop.innerHTML = '<div class="ac-empty">No hay artículos en el catálogo</div>';
    } else if (results.length === 0) {
      drop.innerHTML = '<div class="ac-empty">Sin resultados — se usará como texto libre</div>';
    } else {
      drop.innerHTML = results.map((a, ri) => {
        const thumb = a.foto_url
          ? `<img src="${a.foto_url}" style="width:28px;height:28px;object-fit:cover;border-radius:4px;flex-shrink:0">`
          : '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:4px;background:var(--gris-100);font-size:14px;flex-shrink:0">' + (a.tipo==='servicio'?'🔧':'📦') + '</span>';
        return `<div class="ac-item${ri===0?' ac-sel':''}" data-ri="${ri}" onmousedown="_acSelIdx(${ri})" style="display:flex;align-items:center;gap:8px">
          ${thumb}
          <span class="ac-code">${a.codigo||''}</span>
          <span class="ac-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${a.nombre||''}</span>
          <span class="ac-price">${((a[pf]||a.precio_venta||0)).toFixed(2)} €</span>
        </div>`;
      }).join('');
      // Pre-seleccionar el primero si solo hay uno
      if (results.length === 1) _AC.idx = 0;
    }
    const rect = input.getBoundingClientRect();
    drop.style.top = (rect.bottom + 2) + 'px';
    drop.style.left = rect.left + 'px';
    drop.style.width = Math.max(rect.width, 350) + 'px';
    drop.style.display = 'block';
  }, 100);
}

let _acSelecting = false;
function _acSelIdx(ri) {
  const a = _AC.results[ri];
  if (!a || !_AC.input || !_AC.onSelect) return;
  _acSelecting = true;
  const lineaIdx = parseInt(_AC.input.dataset.lineaIdx);
  // Update input value BEFORE blur fires so blur handler gets the correct name
  _AC.input.value = a.nombre || '';
  const drop = document.getElementById('acArticulos');
  if (drop) drop.style.display = 'none';
  _AC.results = [];
  _AC.onSelect(lineaIdx, a);
  // After render completes (deferred), move focus to quantity field
  setTimeout(()=>{
    _acSelecting = false;
    // Find the row by looking for the description input with this lineaIdx (DOM was recreated)
    const descInput = document.querySelector(`[data-linea-idx="${lineaIdx}"]`);
    const row = descInput ? descInput.closest('tr') : null;
    if (!row) return;
    // Get all editable fields in this row; skip the description input and focus the next one (quantity)
    const fields = Array.from(row.querySelectorAll('input[type="number"], select'));
    if (fields.length > 0) {
      fields[0].focus();
      fields[0].select();
    }
  }, 60);
}

function acKeydown(event) {
  const drop = document.getElementById('acArticulos');
  if (!drop || drop.style.display==='none') return;
  const items = drop.querySelectorAll('.ac-item');
  if (!items.length) return;

  if (event.key==='ArrowDown') {
    event.preventDefault(); event.stopPropagation();
    _AC.idx = Math.min(_AC.idx+1, items.length-1);
    _acHighlight();
  } else if (event.key==='ArrowUp') {
    event.preventDefault(); event.stopPropagation();
    _AC.idx = Math.max(_AC.idx-1, 0);
    _acHighlight();
  } else if (event.key==='Enter') {
    // Si hay resultados y uno está seleccionado (o solo queda 1) → seleccionar
    if (_AC.results.length === 1) {
      event.preventDefault(); event.stopPropagation();
      _acSelIdx(0);
    } else if (_AC.idx >= 0) {
      event.preventDefault(); event.stopPropagation();
      _acSelIdx(_AC.idx);
    }
    // Si no hay selección y hay múltiples → dejar que Enter haga su función normal
  } else if (event.key==='Escape') {
    drop.style.display='none';
    _AC.results = [];
  } else if (event.key==='Tab') {
    // Tab cierra el dropdown y avanza (comportamiento normal)
    drop.style.display='none';
    _AC.results = [];
  }
}

function _acHighlight() {
  const drop = document.getElementById('acArticulos');
  if (!drop) return;
  drop.querySelectorAll('.ac-item').forEach((el,ri) => {
    el.classList.toggle('ac-sel', ri === _AC.idx);
  });
  // Scroll into view
  const sel = drop.querySelector('.ac-sel');
  if (sel) sel.scrollIntoView({ block:'nearest' });
}


// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE SOLAPAMIENTO DE HORARIO EN PARTES DE TRABAJO
// Un operario no puede tener dos partes en el mismo rango horario.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica si existe un parte que se solape con el rango horario indicado.
 * @param {string|number} usuarioId  — ID del operario
 * @param {string}        fecha      — YYYY-MM-DD
 * @param {string}        horaIni    — HH:MM o HH:MM:SS
 * @param {string}        horaFin    — HH:MM o HH:MM:SS
 * @param {number|null}   excluirId  — ID del parte a ignorar (para ediciones)
 * @returns {object|null} El parte conflictivo, o null si no hay solapamiento
 */
async function _validarSolapeHorario(usuarioId, fecha, horaIni, horaFin, excluirId = null) {
  if (!usuarioId || !fecha || !horaIni || !horaFin) return null;

  const toMins = t => {
    const str = (t || '00:00').substring(0, 5);
    const [h, m] = str.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const ni = toMins(horaIni);
  const nf = toMins(horaFin);
  if (ni >= nf) return null; // rango inválido, no bloquear

  let q = sb.from('partes_trabajo')
    .select('id, numero, hora_inicio, hora_fin, trabajo_titulo, usuario_nombre')
    .eq('empresa_id', EMPRESA.id)
    .eq('usuario_id', String(usuarioId))
    .eq('fecha', fecha)
    .neq('estado', 'cancelado')
    .not('hora_inicio', 'is', null)
    .not('hora_fin',    'is', null);

  if (excluirId) q = q.neq('id', excluirId);

  const { data } = await q;
  if (!data?.length) return null;

  // Comparar en minutos para evitar problemas con formato HH:MM vs HH:MM:SS
  return data.find(p => {
    const pi = toMins(p.hora_inicio);
    const pf = toMins(p.hora_fin);
    return ni < pf && nf > pi; // solapamiento: inicio nuevo < fin existente Y fin nuevo > inicio existente
  }) || null;
}

/** Muestra el toast de solapamiento con info del parte conflictivo */
function _toastSolape(p) {
  const hI = (p.hora_inicio || '').substring(0, 5);
  const hF = (p.hora_fin    || '').substring(0, 5);
  const tit = p.trabajo_titulo ? ` · ${p.trabajo_titulo}` : '';
  toast(`⚠️ Conflicto de horario: ya hay un parte de ${hI} a ${hF}${tit}`, 'error');
}
