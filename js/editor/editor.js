/**
 * Module: Editor de Documentos (Document Editor)
 * Comprehensive fullscreen document editor for presupuestos, albaranes, and facturas.
 * Handles line management, autosave, versioning, and audit logging.
 * Global scope - no export/import, all functions are global.
 * Variables: deLineas, deConfig, deReturnPage, DE_TIPOS, _autoguardTimer, _acTimer, _acIdx, _acLineaActual
 */

//  EDITOR DE DOCUMENTOS FULLSCREEN (REUTILIZABLE)
// ═══════════════════════════════════════════════
let deLineas = [];
let deConfig = {}; // {tipo, editId, ico, titulo, tipoSerie, conIva, conDto, conFecha2, ...}
let deReturnPage = 'presupuestos';

// Configuraciones por tipo de documento
const DE_TIPOS = {
  presupuesto: {
    ico:'📋', titulo:'Presupuesto', tipoSerie:'presupuesto', tabla:'presupuestos',
    conIva:true, conDto:true, conFecha2:true, fecha2Label:'Válido hasta', conFpago:true,
  },
  albaran: {
    ico:'📄', titulo:'Albarán', tipoSerie:'albaran', tabla:'albaranes',
    conIva:false, conDto:false, conFecha2:false, fecha2Label:'', conFpago:false,
  },
  factura: {
    ico:'🧾', titulo:'Factura', tipoSerie:'factura', tabla:'facturas',
    conIva:true, conDto:true, conFecha2:true, fecha2Label:'Vencimiento', conFpago:true,
  },
};

async function abrirEditor(tipo, editId) {
  const cfg = DE_TIPOS[tipo];
  if (!cfg) return;
  deConfig = {...cfg, tipo, editId: editId||null};
  deLineas = [];

  // Mostrar/ocultar columnas según tipo
  const thDto = document.getElementById('de_th_dto');
  const thIva = document.getElementById('de_th_iva');
  const ivaRow = document.getElementById('de_iva_row');
  if (thDto) thDto.style.display = cfg.conDto ? '' : 'none';
  if (thIva) thIva.style.display = cfg.conIva ? '' : 'none';
  if (ivaRow) ivaRow.style.display = cfg.conIva ? '' : 'none';

  const f2Label = document.getElementById('de_fecha2_label');
  const f2Input = document.getElementById('de_fecha2');
  if (f2Label) { f2Label.textContent = cfg.fecha2Label||''; f2Label.style.display = cfg.conFecha2?'':'none'; }
  if (f2Input) f2Input.style.display = cfg.conFecha2?'':'none';

  const fpagoLabel = document.getElementById('de_fpago_label');
  const fpagoSel = document.getElementById('de_fpago');
  if (fpagoLabel) fpagoLabel.style.display = cfg.conFpago?'':'none';
  if (fpagoSel) fpagoSel.style.display = cfg.conFpago?'':'none';

  // Poblar clientes
  const sel = document.getElementById('de_cliente');
  sel.innerHTML = '<option value="">— Selecciona cliente —</option>' +
    clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');

  // Forma de pago
  if (cfg.conFpago) {
    document.getElementById('de_fpago').innerHTML = '<option value="">— Sin especificar —</option>' +
      formasPago.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  }

  // Series
  const serSel = document.getElementById('de_serie');
  const serFilt = (series||[]).filter(s=>s.tipo===cfg.tipoSerie);
  const serUsa = serFilt.length ? serFilt : (series||[]);
  const prefDef = {presupuesto:'PRE-',albaran:'ALB-',factura:'FAC-'};
  if (serUsa.length) {
    serSel.innerHTML = serUsa.map(s=>`<option value="${s.id}">${s.prefijo||prefDef[tipo]||'DOC-'}</option>`).join('');
  } else {
    serSel.innerHTML = `<option value="">${prefDef[tipo]||'DOC-'}</option>`;
  }

  // Fechas por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('de_fecha').value = hoy;
  if (cfg.conFecha2) {
    const v = new Date(); v.setDate(v.getDate()+30);
    document.getElementById('de_fecha2').value = v.toISOString().split('T')[0];
  }
  document.getElementById('de_titulo').value = '';
  document.getElementById('de_obs_largo').value = '';
  de_actualizarCliente('');

  // Si es edición, cargar datos
  let docEstado = null;
  if (editId) {
    const { data: doc } = await sb.from(cfg.tabla).select('*').eq('id', editId).single();
    if (doc) {
      docEstado = doc.estado || null;
      sel.value = doc.cliente_id||'';
      de_actualizarCliente(doc.cliente_id);
      document.getElementById('de_numero').value = doc.numero||'';
      document.getElementById('de_fecha').value = doc.fecha||hoy;
      if (cfg.conFecha2) document.getElementById('de_fecha2').value = doc.fecha_validez||doc.fecha_vencimiento||'';
      document.getElementById('de_titulo').value = doc.titulo||doc.referencia||'';
      document.getElementById('de_obs_largo').value = doc.observaciones||'';
      if (cfg.conFpago && doc.forma_pago_id) document.getElementById('de_fpago').value = doc.forma_pago_id;
      // Cargar líneas
      deLineas = (doc.lineas||[]).map(l => {
        if (l.tipo==='capitulo') return {tipo:'capitulo', titulo:l.titulo||'', collapsed:false};
        if (l.tipo==='subcapitulo') return {tipo:'subcapitulo', titulo:l.titulo||'', collapsed:false};
        return {tipo:'linea', desc:l.desc||'', cant:l.cant||1, precio:l.precio||0, dto:l.dto||0, iva:l.iva!=null?l.iva:21};
      });
      // Versión actual (solo para no-borradores)
      deConfig._version = docEstado === 'borrador' ? 0 : (doc.version || 1);
      deConfig._estado = docEstado;
    }
  } else {
    document.getElementById('de_numero').value = '(sin asignar)';
    deLineas.push({tipo:'capitulo', titulo:'Capítulo 1', collapsed:false});
    deLineas.push({tipo:'linea', desc:'', cant:1, precio:0, dto:0, iva:deConfig.conIva?(prIvaDefault||21):0});
    deConfig._version = 1;
  }

  // Actualizar barra
  document.getElementById('de_ico').textContent = cfg.ico;
  const numVal = document.getElementById('de_numero').value;
  const isBorrador = docEstado === 'borrador';
  const isAnulado = docEstado === 'anulado';
  const isCaducado = docEstado === 'caducado';
  // Título y número en barra
  if (isBorrador) {
    document.getElementById('de_titulo_bar').textContent = 'Borrador '+cfg.titulo;
    document.getElementById('de_numero_bar').textContent = '(borrador)';
  } else {
    document.getElementById('de_titulo_bar').textContent = (editId?'':'Nuevo ')+cfg.titulo;
    document.getElementById('de_numero_bar').textContent = (numVal||'').startsWith('BORR-') ? '(borrador)' : (numVal||'');
  }

  // Botones dinámicos según modo y estado
  const btnBox = document.getElementById('de_buttons');
  const vBadge = document.getElementById('de_version_badge');
  if (editId && isBorrador && tipo==='presupuesto') {
    // ── BORRADOR: edición directa, sin versiones ──
    deConfig._mode = 'editing';
    de_showVersion(0);
    de_setReadonly(false);
    btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
      <button class="btn btn-secondary btn-sm" onclick="de_guardar('borrador')">📝 Borrador</button>
      <button class="btn btn-primary btn-sm" onclick="de_guardar('pendiente')">💾 Guardar</button>`;
  } else if (editId && isAnulado && tipo==='presupuesto') {
    // ── ANULADO: solo lectura, restaurar o eliminar (superadmin) ──
    deConfig._mode = 'view';
    de_showVersion(0);
    de_setReadonly(true);
    btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="restaurarEstadoPres(${editId},'pendiente')">♻️ Restaurar</button>
      ${CP?.es_superadmin?'<button class="btn btn-ghost btn-sm" style="color:var(--rojo)" onclick="eliminarDefinitivamente('+editId+')">🗑️ Eliminar</button>':''}
      <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>`;
  } else if (editId && isCaducado && tipo==='presupuesto') {
    // ── CADUCADO: solo lectura, reactivar ──
    deConfig._mode = 'view';
    de_showVersion(deConfig._version || 1);
    de_setReadonly(true);
    btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="restaurarEstadoPres(${editId},'pendiente')">♻️ Reactivar</button>
      <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>`;
  } else if (editId && docEstado==='aceptado' && tipo==='presupuesto') {
    // ── ACEPTADO: siempre bloqueado (solo superadmin puede editar) ──
    deConfig._mode = 'view';
    deConfig._bloqueado = true;
    const ver = deConfig._version || 1;
    de_showVersion(ver);
    de_setReadonly(true);
    if (CP?.es_superadmin) {
      btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>
        <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
        <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">🔓 Editar (superadmin)</button>
        <span style="color:var(--amarillo);font-size:12px;margin-left:8px">🔒 Aceptado</span>`;
    } else {
      btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>
        <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
        <span style="color:var(--rojo);font-size:12px;margin-left:8px">🔒 Bloqueado — solo superadmin puede editar</span>`;
    }
  } else if (editId) {
    // ── EXISTENTE (pendiente u otro): lectura + editar + versiones ──
    deConfig._mode = 'view';
    const ver = deConfig._version || 1;
    de_showVersion(ver);
    de_setReadonly(true);
    btnBox.innerHTML = `${tipo==='presupuesto'?'<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>':''}
      <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
      <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">✏️ Editar</button>`;
  } else {
    // ── NUEVO ──
    deConfig._mode = 'new';
    de_showVersion(0);
    de_setReadonly(false);
    if (tipo==='presupuesto') {
      btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
        <button class="btn btn-secondary btn-sm" onclick="de_guardar('borrador')">📝 Borrador</button>
        <button class="btn btn-primary btn-sm" onclick="de_guardar('pendiente')">💾 Guardar</button>`;
    } else {
      btnBox.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="de_guardar('borrador')">💾 Guardar borrador</button>
        <button class="btn btn-primary btn-sm" onclick="de_guardarYPdf()">📥 Guardar y PDF</button>`;
    }
  }

  de_renderLineas();

  // Re-aplicar readonly DESPUÉS de renderizar líneas (el render recrea los inputs)
  if (deConfig._mode === 'view') {
    de_setReadonly(true);
  }

  // Abrir editor fullscreen
  document.body.classList.add('editor-open');
  deReturnPage = document.querySelector('.page.active')?.id?.replace('page-','')||'presupuestos';
  goPage('doc-editor');
}

function cerrarEditor() {
  document.body.classList.remove('editor-open');
  if (typeof goBack === 'function' && navStack.length) {
    goBack();
  } else {
    goPage(deReturnPage);
  }
}

function de_showVersion(ver, suffix) {
  const vBadge = document.getElementById('de_version_badge');
  const vDoc = document.getElementById('de_version_doc');
  const vLabel = document.getElementById('de_version_label');
  const text = 'v' + ver + (suffix ? ' ' + suffix : '');
  if (ver && ver > 0 && deConfig.tipo==='presupuesto') {
    if (vBadge) { vBadge.textContent = text; vBadge.style.display = ''; }
    if (vDoc) { vDoc.textContent = text; vDoc.style.display = ''; }
    if (vLabel) vLabel.style.display = '';
  } else {
    if (vBadge) vBadge.style.display = 'none';
    if (vDoc) vDoc.style.display = 'none';
    if (vLabel) vLabel.style.display = 'none';
  }
}

function de_setReadonly(ro) {
  const ed = document.getElementById('page-doc-editor');
  if (!ed) return;
  // Disable/enable all inputs, selects, textareas and buttons inside the editor body (not topbar)
  const body = ed.querySelectorAll('input, select, textarea');
  body.forEach(el => { el.disabled = ro; if(ro) el.style.opacity='0.7'; else el.style.opacity='1'; });
  // Hide add line/chapter buttons in readonly
  const addBtns = ed.querySelectorAll('[onclick*="de_addLinea"], [onclick*="de_addCapitulo"], [onclick*="de_addSubcapitulo"]');
  addBtns.forEach(b => b.style.display = ro ? 'none' : '');
  // Hide delete buttons
  const delBtns = ed.querySelectorAll('[onclick*="de_removeLinea"]');
  delBtns.forEach(b => b.style.display = ro ? 'none' : '');
  // Disable drag
  const rows = ed.querySelectorAll('#de_lineas tr[draggable]');
  rows.forEach(r => { r.draggable = !ro; if(ro) r.style.cursor='default'; });
}

async function de_entrarEdicion() {
  const cfg = deConfig;
  if (!cfg.editId) return;

  // Aceptado = bloqueado, solo superadmin puede editar
  if (cfg._estado === 'aceptado' && cfg._bloqueado && !CP?.es_superadmin) {
    toast('🔒 Presupuesto bloqueado — solo superadmin puede editar','error');
    return;
  }

  if (cfg.tipo==='presupuesto') {
    // Snapshot current version before editing (solo si no existe ya)
    const tableOk = await de_ensureVersionTable();
    if (tableOk) {
      const { data: current } = await sb.from('presupuestos').select('*').eq('id', cfg.editId).single();
      if (current) {
        const ver = current.version || cfg._version || 1;
        // Comprobar si ya existe snapshot de esta versión (evitar duplicados)
        const { count } = await sb.from('presupuesto_versiones')
          .select('id', {count:'exact', head:true})
          .eq('presupuesto_id', cfg.editId)
          .eq('version', ver);
        if (!count || count === 0) {
          const { error: insErr } = await sb.from('presupuesto_versiones').insert({
            presupuesto_id: cfg.editId,
            version: ver,
            datos: current,
          });
          if (insErr) {
            console.warn('Error guardando versión:', insErr.message);
            toast('⚠️ No se pudo guardar snapshot de la versión anterior','error');
          }
        }
      }
    } else {
      toast('⚠️ Tabla de versiones no encontrada. Ejecuta SQL_versiones.sql en Supabase','error');
    }
    // Increment version
    cfg._version = (cfg._version||1) + 1;
    de_showVersion(cfg._version);
  }

  // Switch to editing mode
  cfg._mode = 'editing';
  de_setReadonly(false);
  de_renderLineas(); // re-render to restore drag handles

  const btnBox = document.getElementById('de_buttons');
  btnBox.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
    <button class="btn btn-primary btn-sm" onclick="de_guardarVersion()">💾 Guardar</button>`;
  toast('✏️ Modo edición — versión v'+cfg._version,'info');
}

async function de_guardarVersion() {
  const cfg = deConfig;
  const datos = de_buildDatos();
  if (!datos) return;
  // Keep current estado (don't reset to borrador when editing)
  if (cfg.tipo==='presupuesto') datos.version = cfg._version || 1;

  let error;
  ({error} = await sb.from(cfg.tabla).update(datos).eq('id', cfg.editId));
  if (error && datos.version && error.message && error.message.includes('version')) {
    delete datos.version;
    ({error} = await sb.from(cfg.tabla).update(datos).eq('id', cfg.editId));
  }
  if (error) { toast('Error: '+error.message,'error'); return; }
  registrarAudit('modificar', cfg.tipo, cfg.editId, 'Editado '+cfg.tipo+' '+datos.numero+' — v'+(cfg._version||1));
  toast(cfg.ico+' Versión v'+(cfg._version||1)+' guardada ✓','success');
  if (cfg.tipo==='presupuesto') await loadPresupuestos();
  if (cfg.tipo==='albaran') await loadAlbaranes();
  loadDashboard();
  // Return to view mode
  cfg._mode = 'view';
  de_setReadonly(true);
  const btnBox = document.getElementById('de_buttons');
  // Aceptado = siempre re-bloquear después de guardar (superadmin)
  if (cfg._estado === 'aceptado' && cfg.tipo === 'presupuesto') {
    cfg._bloqueado = true;
    if (CP?.es_superadmin) {
      btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>
        <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
        <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">🔓 Editar (superadmin)</button>
        <span style="color:var(--amarillo);font-size:12px;margin-left:8px">🔒 Aceptado</span>`;
    } else {
      btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>
        <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
        <span style="color:var(--rojo);font-size:12px;margin-left:8px">🔒 Bloqueado</span>`;
    }
  } else {
    btnBox.innerHTML = `${cfg.tipo==='presupuesto'?'<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>':''}
      <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
      <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">✏️ Editar</button>`;
  }
}

function de_actualizarCliente(id) {
  const c = clientes.find(x=>x.id===parseInt(id));
  const nif = document.getElementById('de_cli_nif');
  const dir = document.getElementById('de_cli_dir');
  const tel = document.getElementById('de_cli_tel');
  const email = document.getElementById('de_cli_email');
  if (c) {
    if (nif) nif.textContent = c.nif || '—';
    const loc = [c.direccion_fiscal||c.direccion, c.cp_fiscal||c.cp, c.municipio_fiscal||c.municipio, c.provincia_fiscal||c.provincia].filter(Boolean).join(', ');
    if (dir) dir.textContent = loc || '—';
    if (tel) tel.textContent = c.telefono || '—';
    if (email) email.textContent = c.email || '—';
    if (deConfig.conFpago && c.forma_pago_id) document.getElementById('de_fpago').value = c.forma_pago_id;
  } else {
    if (nif) nif.textContent = '—';
    if (dir) dir.textContent = '—';
    if (tel) tel.textContent = '—';
    if (email) email.textContent = '—';
  }
}

function de_addCapitulo() {
  const caps = deLineas.filter(l=>l.tipo==='capitulo').length;
  deLineas.push({tipo:'capitulo', titulo:'Capítulo '+(caps+1), collapsed:false});
  de_renderLineas();
}

function de_addSubcapitulo() {
  const subs = deLineas.filter(l=>l.tipo==='subcapitulo').length;
  deLineas.push({tipo:'subcapitulo', titulo:'Subcapítulo '+(subs+1), collapsed:false});
  de_renderLineas();
}

function de_addLinea() {
  const iva = deConfig.conIva ? (prIvaDefault||21) : 0;
  deLineas.push({tipo:'linea', desc:'', cant:1, precio:0, dto:0, iva});
  de_renderLineas();
  // Focus en la nueva línea de descripción
  setTimeout(()=>{
    const inp = document.querySelector(`input[data-linea="${deLineas.length-1}"]`);
    if (inp) inp.focus();
  },50);
}

function de_removeLinea(i) { deLineas.splice(i,1); de_renderLineas(); }

// ═══ AUTOCOMPLETADO DE ARTÍCULOS ═══
let _acTimer = null;
let _acIdx = -1;
let _acLineaActual = -1;

function de_buscarArticulo(input, lineaIdx) {
  clearTimeout(_acTimer);
  const q = input.value.trim().toLowerCase();
  const drop = document.getElementById('acArticulos');
  if (!drop) return;
  _acLineaActual = lineaIdx;
  if (q.length < 1) { drop.style.display='none'; return; }
  _acTimer = setTimeout(()=>{
    console.log('🔍 Buscando artículos:', q, '| Total artículos cargados:', articulos.length);
    const results = articulos.filter(a =>
      (a.activo !== false) &&
      ((a.codigo||'').toLowerCase().includes(q) ||
       (a.nombre||'').toLowerCase().includes(q) ||
       (a.referencia_fabricante||'').toLowerCase().includes(q))
    ).slice(0, 8);
    _acIdx = -1;
    if (results.length === 0 && articulos.length === 0) {
      drop.innerHTML = '<div class="ac-empty">No hay artículos creados en el sistema</div>';
    } else if (results.length === 0) {
      drop.innerHTML = '<div class="ac-empty">Sin resultados — se usará como texto libre</div>';
    } else {
      drop.innerHTML = results.map((a, ri) =>
        `<div class="ac-item" data-ri="${ri}" onmousedown="de_seleccionarArticulo(${lineaIdx},${a.id})">
          <span class="ac-code">${a.codigo||''}</span>
          <span class="ac-name">${a.nombre||''}</span>
          <span class="ac-price">${(a.precio_venta||0).toFixed(2)} €</span>
        </div>`
      ).join('');
    }
    // Posicionar debajo del input
    const rect = input.getBoundingClientRect();
    drop.style.top = (rect.bottom + 2) + 'px';
    drop.style.left = rect.left + 'px';
    drop.style.width = Math.max(rect.width, 350) + 'px';
    drop.style.display = 'block';
  }, 120);
}

function de_seleccionarArticulo(lineaIdx, artId) {
  const a = articulos.find(x=>x.id===artId);
  if (!a) return;
  deLineas[lineaIdx].desc = a.nombre || '';
  deLineas[lineaIdx].precio = a.precio_venta || 0;
  deLineas[lineaIdx].articulo_id = a.id;
  deLineas[lineaIdx].codigo = a.codigo || '';
  if (a.tipo_iva_id && tiposIva?.length) {
    const tipoIva = tiposIva.find(t=>t.id===a.tipo_iva_id);
    if (tipoIva) deLineas[lineaIdx].iva = tipoIva.porcentaje;
  }
  const drop = document.getElementById('acArticulos');
  if (drop) drop.style.display = 'none';
  de_renderLineas();
  toast(`📦 ${a.codigo} — ${a.nombre}`,'info');
}

function de_acKeydown(event, lineaIdx) {
  const drop = document.getElementById('acArticulos');
  if (!drop || drop.style.display==='none') return;
  const items = drop.querySelectorAll('.ac-item');
  if (!items.length) return;
  if (event.key==='ArrowDown') {
    event.preventDefault();
    _acIdx = Math.min(_acIdx+1, items.length-1);
    de_acHighlight();
  } else if (event.key==='ArrowUp') {
    event.preventDefault();
    _acIdx = Math.max(_acIdx-1, 0);
    de_acHighlight();
  } else if (event.key==='Enter' && _acIdx>=0) {
    event.preventDefault();
    items[_acIdx]?.dispatchEvent(new Event('mousedown'));
  } else if (event.key==='Escape') {
    drop.style.display='none';
  }
}

function de_acHighlight() {
  const drop = document.getElementById('acArticulos');
  if (!drop) return;
  drop.querySelectorAll('.ac-item').forEach((el,ri)=>{
    el.classList.toggle('ac-sel', ri===_acIdx);
  });
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
  if (!e.target.closest('#acArticulos') && !e.target.matches('input[data-linea]')) {
    const d = document.getElementById('acArticulos');
    if (d) d.style.display='none';
  }
});

function de_updateLinea(i,f,v) {
  deLineas[i][f] = (f==='desc'||f==='titulo') ? v : parseFloat(v)||0;
  de_renderLineas();
  de_autoguardar();
}

// Autosave: debounced, saves silently after 3 seconds of inactivity
let _autoguardTimer = null;
function de_autoguardar() {
  if (!deConfig.editId && deConfig._mode === 'new') return; // Don't autosave unsaved new docs
  if (deConfig._mode === 'view') return; // Don't autosave in read-only mode
  clearTimeout(_autoguardTimer);
  _autoguardTimer = setTimeout(async () => {
    const datos = de_buildDatos();
    if (!datos) return;
    if (!deConfig.editId) return;
    // NUNCA tocar el estado en el autosave — mantener el que tiene en BD
    if (deConfig.tipo==='presupuesto') datos.version = deConfig._version || 1;
    const { error } = await sb.from(deConfig.tabla).update(datos).eq('id', deConfig.editId);
    if (error && datos.version && error.message && error.message.includes('version')) {
      delete datos.version;
      await sb.from(deConfig.tabla).update(datos).eq('id', deConfig.editId);
    }
    if (!error) {
      const indicator = document.getElementById('de_autosave_indicator');
      if (indicator) { indicator.textContent = '✓ Guardado'; indicator.style.opacity='1'; setTimeout(()=>indicator.style.opacity='0', 2000); }
    }
  }, 3000);
}

function de_toggleCapitulo(i) {
  deLineas[i].collapsed = !deLineas[i].collapsed;
  de_renderLineas();
}

/* --- Drag & Drop --- */
let deDragIdx = null;
let deDragType = null;

function de_dragStart(ev, idx) {
  deDragIdx = idx;
  deDragType = deLineas[idx].tipo;
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', String(idx));
  requestAnimationFrame(()=>{ const tr=ev.target.closest&&ev.target.closest('tr'); if(tr) tr.style.opacity='0.4'; });
}

function de_dragEnd(ev) {
  const tr=ev.target.closest&&ev.target.closest('tr'); if(tr) tr.style.opacity='1';
  document.querySelectorAll('#de_lineas tr').forEach(r=>{r.classList.remove('de-drag-over');r.classList.remove('de-drag-over-top');});
  deDragIdx = null;
  deDragType = null;
}

function de_dragOver(ev, idx) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('#de_lineas tr').forEach(r=>{r.classList.remove('de-drag-over');r.classList.remove('de-drag-over-top');});
  const tr = ev.target.closest&&ev.target.closest('tr');
  if(tr) {
    const rect = tr.getBoundingClientRect();
    const mid = rect.top + rect.height/2;
    tr.classList.add(ev.clientY < mid ? 'de-drag-over-top' : 'de-drag-over');
  }
}

function de_drop(ev, targetIdx) {
  ev.preventDefault();
  document.querySelectorAll('#de_lineas tr').forEach(r=>{r.classList.remove('de-drag-over');r.classList.remove('de-drag-over-top');});
  if (deDragIdx===null || deDragIdx===targetIdx) return;

  const isChapter = (t) => t==='capitulo'||t==='subcapitulo';

  if (deDragType==='capitulo') {
    // Drag a whole chapter: collect it + all children (subcaps + lines) until next capitulo
    let endIdx = deDragIdx+1;
    while (endIdx < deLineas.length && deLineas[endIdx].tipo!=='capitulo') endIdx++;
    const chunk = deLineas.splice(deDragIdx, endIdx - deDragIdx);
    let insertAt = targetIdx > deDragIdx ? targetIdx - chunk.length : targetIdx;
    if (insertAt < 0) insertAt = 0;
    deLineas.splice(insertAt, 0, ...chunk);
  } else if (deDragType==='subcapitulo') {
    // Drag a subcapítulo: collect it + its child lines until next chapter/subcapítulo
    let endIdx = deDragIdx+1;
    while (endIdx < deLineas.length && !isChapter(deLineas[endIdx].tipo)) endIdx++;
    const chunk = deLineas.splice(deDragIdx, endIdx - deDragIdx);
    let insertAt = targetIdx > deDragIdx ? targetIdx - chunk.length : targetIdx;
    if (insertAt < 0) insertAt = 0;
    // If dropping on a chapter or subcapítulo, insert right after it (inside the chapter)
    if (deLineas[insertAt]?.tipo==='capitulo' || deLineas[insertAt]?.tipo==='subcapitulo') {
      insertAt = insertAt + 1;
    }
    deLineas.splice(insertAt, 0, ...chunk);
  } else {
    // Single line: can drop on a chapter/subcapítulo row (adds as first line of that section)
    const item = deLineas.splice(deDragIdx, 1)[0];
    let insertAt = targetIdx > deDragIdx ? targetIdx - 1 : targetIdx;
    if (insertAt < 0) insertAt = 0;
    // If dropping on a chapter/subcapitulo, insert right after it
    if (isChapter(deLineas[insertAt]?.tipo)) {
      insertAt = insertAt + 1;
    }
    deLineas.splice(insertAt, 0, item);
  }
  de_renderLineas();
}

function de_renderLineas() {
  const cfg = deConfig;
  let base=0, ivaT=0, html='';
  let secBase=0, secIva=0, secActual=-1, secType=''; // tracks current chapter or subcapitulo
  let parentCollapsed = false, subCollapsed = false;
  const showDto = cfg.conDto;
  const showIva = cfg.conIva;
  const totalCols = 4+(showDto?1:0)+(showIva?1:0)+2;
  const isChapter = (t) => t==='capitulo'||t==='subcapitulo';

  function subtotalRow(label) {
    return `<tr style="background:var(--gris-50)">
      <td></td>
      <td colspan="${totalCols-3}" style="padding:5px 12px;font-size:11px;color:var(--gris-500);text-align:right;font-weight:600">${label}</td>
      <td style="padding:5px 12px;text-align:right;font-weight:700;font-size:13px;color:var(--azul)">${fmtE(secBase+secIva)}</td>
      <td></td></tr>`;
  }

  deLineas.forEach((l,i) => {
    if (l.tipo==='capitulo') {
      // Close previous sub/chapter subtotal
      if (secActual>=0 && (secBase+secIva)>0) {
        html += subtotalRow(secType==='subcapitulo'?'Subtotal subcapítulo':'Subtotal capítulo');
      }
      secBase=0; secIva=0; secActual=i; secType='capitulo';
      parentCollapsed = !!l.collapsed;
      subCollapsed = false;
      const collapsed = !!l.collapsed;
      const arrow = collapsed ? '▶' : '▼';
      html += `<tr draggable="true" ondragstart="de_dragStart(event,${i})" ondragend="de_dragEnd(event)" ondragover="de_dragOver(event,${i})" ondrop="de_drop(event,${i})" style="background:var(--azul-light);border-top:2px solid var(--azul);cursor:grab">
        <td style="padding:6px 4px;text-align:center;color:var(--gris-400);cursor:grab;font-size:11px;user-select:none" title="Arrastrar capítulo">⠿</td>
        <td colspan="${totalCols-3}" style="padding:8px 10px">
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="de_toggleCapitulo(${i})" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--azul);padding:2px 4px;min-width:18px" title="${collapsed?'Expandir':'Contraer'}">${arrow}</button>
            <span style="font-size:14px">📁</span>
            <input value="${l.titulo||''}" placeholder="Nombre del capítulo..."
              onchange="de_updateLinea(${i},'titulo',this.value)"
              style="font-weight:700;font-size:13px;border:none;outline:none;background:transparent;flex:1;color:var(--azul)">
          </div>
        </td>
        <td style="text-align:center"><button onclick="de_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:14px">✕</button></td>
      </tr>`;
    } else if (l.tipo==='subcapitulo') {
      // Close previous subcapítulo subtotal
      if (secActual>=0 && secType==='subcapitulo' && (secBase+secIva)>0 && !parentCollapsed) {
        html += subtotalRow('Subtotal subcapítulo');
      }
      secBase=0; secIva=0; secActual=i; secType='subcapitulo';
      subCollapsed = !!l.collapsed;
      if (parentCollapsed) return;
      const collapsed = !!l.collapsed;
      const arrow = collapsed ? '▶' : '▼';
      html += `<tr draggable="true" ondragstart="de_dragStart(event,${i})" ondragend="de_dragEnd(event)" ondragover="de_dragOver(event,${i})" ondrop="de_drop(event,${i})" style="background:#eef4ff;border-top:1.5px solid #b0c4ff;cursor:grab">
        <td style="padding:5px 4px;text-align:center;color:var(--gris-400);cursor:grab;font-size:11px;user-select:none" title="Arrastrar subcapítulo">⠿</td>
        <td colspan="${totalCols-3}" style="padding:7px 10px;padding-left:28px">
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="de_toggleCapitulo(${i})" style="background:none;border:none;cursor:pointer;font-size:11px;color:#5b7eba;padding:2px 4px;min-width:16px" title="${collapsed?'Expandir':'Contraer'}">${arrow}</button>
            <span style="font-size:13px">📂</span>
            <input value="${l.titulo||''}" placeholder="Nombre del subcapítulo..."
              onchange="de_updateLinea(${i},'titulo',this.value)"
              style="font-weight:600;font-size:12.5px;border:none;outline:none;background:transparent;flex:1;color:#5b7eba">
          </div>
        </td>
        <td style="text-align:center"><button onclick="de_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:14px">✕</button></td>
      </tr>`;
    } else {
      const dto = showDto ? (l.dto||0) : 0;
      const sub = l.cant*l.precio*(1-dto/100);
      const iva = showIva ? (l.iva||0) : 0;
      const iv = sub*(iva/100);
      base+=sub; ivaT+=iv; secBase+=sub; secIva+=iv;

      // If inside collapsed chapter or subcapítulo, count totals but don't render
      if (parentCollapsed || subCollapsed) return;

      const ivaFixed = (tiposIva||[{porcentaje:21},{porcentaje:10},{porcentaje:4},{porcentaje:0}])
        .map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('');

      const inSub = secType==='subcapitulo';
      const inCap = secActual>=0;
      const padLeft = inSub ? 'padding-left:48px' : (inCap ? 'padding-left:28px' : '');

      html += `<tr draggable="true" ondragstart="de_dragStart(event,${i})" ondragend="de_dragEnd(event)" ondragover="de_dragOver(event,${i})" ondrop="de_drop(event,${i})" style="border-top:1px solid var(--gris-100);cursor:grab">
        <td style="padding:6px 4px;text-align:center;color:var(--gris-300);cursor:grab;font-size:11px;user-select:none" title="Arrastrar línea">⠿</td>
        <td style="padding:6px 10px;${padLeft}">
          <input value="${l.desc}" placeholder="Código o descripción del artículo..."
            oninput="de_buscarArticulo(this,${i})"
            onchange="de_updateLinea(${i},'desc',this.value)"
            onfocus="if(this.value.length>=1)de_buscarArticulo(this,${i})"
            onblur="setTimeout(()=>{const d=document.getElementById('acArticulos');if(d)d.style.display='none'},200)"
            onkeydown="de_acKeydown(event,${i})"
            autocomplete="off"
            data-linea="${i}"
            style="width:100%;border:none;outline:none;font-size:13px;background:transparent">
        </td>
        <td style="padding:6px 5px">
          <input type="number" value="${l.cant}" min="0.01" step="0.01"
            onchange="de_updateLinea(${i},'cant',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>
        <td style="padding:6px 5px">
          <input type="number" value="${l.precio}" min="0" step="0.01"
            onchange="de_updateLinea(${i},'precio',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>
        ${showDto?`<td style="padding:6px 5px">
          <input type="number" value="${l.dto||0}" min="0" max="100" step="0.1"
            onchange="de_updateLinea(${i},'dto',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>`:''}
        ${showIva?`<td style="padding:6px 5px">
          <select onchange="de_updateLinea(${i},'iva',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
            ${ivaFixed}
          </select>
        </td>`:''}
        <td style="padding:6px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub+iv)}</td>
        <td style="text-align:center"><button onclick="de_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:14px;padding:2px 4px">✕</button></td>
      </tr>`;
    }
  });

  // Close last section subtotal
  if (secActual>=0 && (secBase+secIva)>0) {
    html += subtotalRow(secType==='subcapitulo'?'Subtotal subcapítulo':'Subtotal capítulo');
  }

  document.getElementById('de_lineas').innerHTML = html;
  document.getElementById('de_base').textContent = fmtE(base);
  if (deConfig.conIva) document.getElementById('de_iva_tot').textContent = fmtE(ivaT);
  document.getElementById('de_total').textContent = fmtE(base+ivaT);
  document.getElementById('de_numero_bar').textContent = document.getElementById('de_numero').value;
  // Re-aplicar readonly si estamos en modo vista (el innerHTML recrea los inputs sin disabled)
  if (deConfig._mode === 'view') {
    de_setReadonly(true);
  }
}

// ═══ VERSIONING ═══
let _versionTableReady = false;
let _versionTableExists = false;
async function de_ensureVersionTable() {
  if (_versionTableReady) return _versionTableExists;
  try {
    const { error } = await sb.from('presupuesto_versiones').select('id').limit(1);
    if (error) {
      _versionTableExists = false;
      console.warn('⚠️ Tabla presupuesto_versiones no existe. Ejecuta SQL_versiones.sql en Supabase SQL Editor.');
    } else {
      _versionTableExists = true;
    }
  } catch(e) {
    _versionTableExists = false;
  }
  _versionTableReady = true;
  return _versionTableExists;
}

function de_buildDatos() {
  const cfg = deConfig;
  const clienteId = parseInt(document.getElementById('de_cliente').value);
  const isBorradorSave = arguments[0] === true; // called with (true) for borrador
  if (!clienteId && !isBorradorSave) { toast('Selecciona un cliente','error'); return null; }
  const isChap = (t) => t==='capitulo'||t==='subcapitulo';
  const lineas = deLineas.filter(l=>l.desc||l.precio>0||isChap(l.tipo));
  if (!lineas.filter(l=>!isChap(l.tipo)).length && !isBorradorSave) { toast('Añade al menos una línea','error'); return null; }
  const c = clientes.find(x=>x.id===clienteId);
  let base=0, ivaT=0;
  lineas.filter(l=>!isChap(l.tipo)).forEach(l=>{
    const dto = cfg.conDto?(l.dto||0):0;
    const s = l.cant*l.precio*(1-dto/100);
    base+=s;
    if (cfg.conIva) ivaT+=s*((l.iva||0)/100);
  });

  const datos = {
    empresa_id:EMPRESA.id,
    numero:document.getElementById('de_numero').value,
    cliente_id:clienteId, cliente_nombre:c?.nombre||'',
    fecha:document.getElementById('de_fecha').value,
    total:Math.round((base+ivaT)*100)/100,
    observaciones:document.getElementById('de_obs_largo').value||null,
    lineas,
  };
  if (cfg.conIva) {
    datos.base_imponible = Math.round(base*100)/100;
    datos.total_iva = Math.round(ivaT*100)/100;
  }
  if (cfg.conFecha2) {
    const f2 = document.getElementById('de_fecha2').value;
    if (cfg.tipo==='presupuesto') datos.fecha_validez = f2||null;
    else datos.fecha_vencimiento = f2||null;
  }
  if (cfg.conFpago) datos.forma_pago_id = parseInt(document.getElementById('de_fpago').value)||null;
  datos.titulo = document.getElementById('de_titulo').value||null;
  if (cfg.tipo==='albaran') datos.referencia = datos.titulo;
  return datos;
}

// ═══ AUDIT LOG ═══
async function registrarAudit(accion, entidad, entidad_id, detalle) {
  try {
    const { error } = await sb.from('audit_log').insert({
      empresa_id: EMPRESA.id,
      usuario_id: CU?.id || null,
      usuario_nombre: CP?.nombre || CU?.email || 'Desconocido',
      accion,
      entidad,
      entidad_id: entidad_id ? String(entidad_id) : null,
      detalle: detalle || null,
    });
    if (error) console.warn('Audit log error:', error.message, '— ¿Has ejecutado SQL_audit_log.sql?');
  } catch(e) { console.warn('Audit log exception:', e); }
}

async function de_guardar(estado) {
  const cfg = deConfig;
  const datos = de_buildDatos(estado === 'borrador');
  if (!datos) return;

  // REGLA: un presupuesto con número asignado NUNCA puede volver a borrador
  const tieneNumero = datos.numero && datos.numero !== '(sin asignar)' && !(datos.numero||'').startsWith('BORR-');
  if (estado === 'borrador' && tieneNumero && cfg.tipo === 'presupuesto') {
    estado = 'pendiente'; // forzar a pendiente si ya tiene número
  }

  datos.estado = estado||'borrador';
  if (cfg.tipo==='presupuesto' && estado !== 'borrador') datos.version = cfg._version || 1;

  // Number assignment logic for presupuestos:
  // - Borrador: NO number (stays as "(sin asignar)")
  // - Pendiente/any other: assign number
  let isNew = !cfg.editId;
  const needsNumber = datos.numero === '(sin asignar)' || !datos.numero || (datos.numero||'').startsWith('BORR-');
  if (needsNumber && estado !== 'borrador') {
    datos.numero = await generarNumeroDoc(cfg.tipo);
    document.getElementById('de_numero').value = datos.numero;
    document.getElementById('de_numero_bar').textContent = datos.numero;
  } else if (needsNumber && estado === 'borrador') {
    // Borrador without number — use temp placeholder
    datos.numero = 'BORR-' + Date.now().toString(36).toUpperCase();
    document.getElementById('de_numero_bar').textContent = '(borrador)';
    // Borrador: fecha optional
    if (!datos.fecha) datos.fecha = null;
  }

  let error, savedId = cfg.editId;
  if (cfg.editId) {
    ({error} = await sb.from(cfg.tabla).update(datos).eq('id', cfg.editId));
  } else {
    const res = await sb.from(cfg.tabla).insert(datos).select('id').single();
    error = res.error;
    if (res.data) savedId = res.data.id;
  }
  // If version column doesn't exist yet, retry without it
  if (error && datos.version && error.message && error.message.includes('version')) {
    delete datos.version;
    if (cfg.editId) {
      ({error} = await sb.from(cfg.tabla).update(datos).eq('id', cfg.editId));
    } else {
      const res = await sb.from(cfg.tabla).insert(datos).select('id').single();
      error = res.error;
      if (res.data) savedId = res.data.id;
    }
  }
  if (error) { toast('Error: '+error.message,'error'); return; }
  deConfig.editId = savedId;
  registrarAudit(isNew?'crear':'modificar', cfg.tipo, savedId, (isNew?'Nuevo ':'Editado ')+cfg.tipo+' '+datos.numero+' — estado: '+datos.estado+(datos.version?' — v'+datos.version:''));
  toast(cfg.ico+' '+(isNew?'Borrador creado':'Guardado')+' ✓','success');

  // After save of presupuesto — handle mode transitions
  if (cfg.tipo==='presupuesto') {
    if (datos.estado === 'borrador') {
      // Borrador: stays editable
    } else {
      // Pendiente/Aceptado/etc: switch to view mode
      cfg._mode = 'view';
      de_setReadonly(true);
      de_showVersion(cfg._version || 1);
      const btnBox2 = document.getElementById('de_buttons');
      btnBox2.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>
        <button class="btn btn-secondary btn-sm" onclick="cerrarEditor()">✕ Cerrar</button>
        <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">✏️ Editar</button>`;
    }
  }

  // Recargar lista correspondiente
  if (cfg.tipo==='presupuesto') await loadPresupuestos();
  if (cfg.tipo==='albaran') await loadAlbaranes();
  loadDashboard();
  return savedId;
}

async function de_guardarYPdf() {
  const id = await de_guardar('borrador');
  if (!id) return;
  if (deConfig.tipo==='presupuesto') {
    await loadPresupuestos();
    const p = presupuestos.find(x=>x.id===id);
    if (p) generarPdfPresupuesto(p);
  } else {
    toast('PDF para '+deConfig.titulo+' — próximamente','info');
  }
}

async function de_crearNuevaVersion() {
  const cfg = deConfig;
  if (!cfg.editId || cfg.tipo!=='presupuesto') return;

  // 1. Snapshot current version before overwriting
  await de_ensureVersionTable();
  const { data: current } = await sb.from('presupuestos').select('*').eq('id', cfg.editId).single();
  if (current) {
    const ver = current.version || cfg._version || 1;
    await sb.from('presupuesto_versiones').insert({
      presupuesto_id: cfg.editId,
      version: ver,
      datos: current,
    });
  }

  // 2. Increment version
  const newVer = (cfg._version||1) + 1;
  cfg._version = newVer;

  // 3. Save with new version number (mantener estado actual, nunca borrador si tiene número)
  const datos = de_buildDatos();
  if (!datos) return;
  // NO tocar estado — mantener el que tiene en BD
  datos.version = newVer;

  const { error } = await sb.from('presupuestos').update(datos).eq('id', cfg.editId);
  if (error) { toast('Error: '+error.message,'error'); return; }

  // 4. Update UI
  de_showVersion(newVer);
  document.getElementById('de_numero_bar').textContent = datos.numero;

  toast('📝 Nueva versión v'+newVer+' creada ✓','success');
  if (cfg.tipo==='presupuesto') await loadPresupuestos();
  loadDashboard();
}

async function de_verVersiones(ev) {
  // Remove existing dropdown
  const old = document.getElementById('de_ver_dropdown');
  if (old) { old.remove(); return; }

  if (!deConfig.editId) return;
  const tableOk = await de_ensureVersionTable();
  if (!tableOk) {
    toast('⚠️ Tabla de versiones no existe. Ejecuta SQL_versiones.sql en Supabase SQL Editor','error');
    return;
  }
  const { data: vers, error: verErr } = await sb.from('presupuesto_versiones')
    .select('*').eq('presupuesto_id', deConfig.editId).order('version', {ascending:false});
  if (verErr) { toast('Error: '+verErr.message,'error'); return; }
  if (!vers || !vers.length) { toast('No hay versiones anteriores','info'); return; }

  let items = '';
  vers.forEach(v => {
    const d = v.datos||{};
    const fecha = new Date(v.created_at).toLocaleDateString('es-ES');
    const hora = new Date(v.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    items += `<div style="padding:8px 12px;border-bottom:1px solid var(--gris-100);display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer" onmouseenter="this.style.background='var(--gris-50)'" onmouseleave="this.style.background=''">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:12px">v${v.version} <span style="font-weight:400;color:var(--gris-400);font-size:11px">${fecha} ${hora}</span></div>
        <div style="font-size:11px;color:var(--gris-500)">${d.cliente_nombre||'—'} — ${fmtE(d.total||0)}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();document.getElementById('de_ver_dropdown').remove();abrirVersionEnEditor(${deConfig.editId},${v.id})" title="Ver" style="font-size:12px;padding:3px 6px">👁️</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();document.getElementById('de_ver_dropdown').remove();restaurarVersionDirecta(${deConfig.editId},${v.id})" title="Restaurar" style="font-size:12px;padding:3px 6px">♻️</button>
      </div>
    </div>`;
  });

  const dd = document.createElement('div');
  dd.id = 'de_ver_dropdown';
  dd.style.cssText = 'position:fixed;top:48px;right:180px;width:360px;max-height:400px;overflow:auto;background:white;border:1.5px solid var(--gris-200);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.15);z-index:100';
  dd.innerHTML = `<div style="padding:10px 12px;border-bottom:1.5px solid var(--gris-200);display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:700;font-size:13px">📋 Versiones anteriores</span>
    <button onclick="document.getElementById('de_ver_dropdown').remove()" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--gris-400)">✕</button>
  </div>${items}`;
  document.body.appendChild(dd);

  // Close on click outside
  setTimeout(()=>{
    const close = (e)=>{ if(!dd.contains(e.target)){ dd.remove(); document.removeEventListener('click',close); }};
    document.addEventListener('click', close);
  }, 100);
}

async function de_restaurarVersion(versionId) {
  const { data: v } = await sb.from('presupuesto_versiones').select('datos').eq('id', versionId).single();
  if (!v) { toast('Error cargando versión','error'); return; }
  const d = v.datos;
  // Load version data into editor
  document.getElementById('de_cliente').value = d.cliente_id||'';
  de_actualizarCliente(d.cliente_id);
  document.getElementById('de_fecha').value = d.fecha||'';
  if (deConfig.conFecha2) document.getElementById('de_fecha2').value = d.fecha_validez||d.fecha_vencimiento||'';
  document.getElementById('de_titulo').value = d.titulo||d.referencia||'';
  document.getElementById('de_obs_largo').value = d.observaciones||'';
  if (deConfig.conFpago && d.forma_pago_id) document.getElementById('de_fpago').value = d.forma_pago_id;
  deLineas = (d.lineas||[]).map(l => {
    if (l.tipo==='capitulo') return {tipo:'capitulo', titulo:l.titulo||'', collapsed:false};
    if (l.tipo==='subcapitulo') return {tipo:'subcapitulo', titulo:l.titulo||'', collapsed:false};
    return {tipo:'linea', desc:l.desc||'', cant:l.cant||1, precio:l.precio||0, dto:l.dto||0, iva:l.iva!=null?l.iva:21};
  });
  deConfig._version = d.version||1;
  de_renderLineas();
  de_showVersion(d.version||1);
  const mV = document.getElementById('mVersiones');
  if (mV) mV.remove();
  toast('Versión restaurada — guarda para aplicar los cambios','info');
}

// ═══ CAMBIAR ESTADO CON MENÚ CONTEXTUAL ═══
// ═══ GUARDAR PRESUPUESTO Y DESCARGAR PDF ═══
async function guardarPresupYPdf() {
  // Guardar primero como borrador
  const clienteId=parseInt(document.getElementById('pr_cliente').value);
  if(!clienteId){toast('Selecciona un cliente','error');return;}
  const lineas=prLineas.filter(l=>l.desc||l.precio>0||l.tipo==='capitulo');
  if(!lineas.filter(l=>l.tipo!=='capitulo').length){toast('Añade al menos una línea','error');return;}
  const c=clientes.find(x=>x.id===clienteId);
  let base=0,ivaT=0;
  lineas.filter(l=>l.tipo!=='capitulo').forEach(l=>{const s=l.cant*l.precio*(1-(l.dto||0)/100);base+=s;ivaT+=s*((l.iva||0)/100);});
  const editId = parseInt(document.getElementById('mPresupRapido').dataset.editId);
  const datos = {
    empresa_id:EMPRESA.id, numero:document.getElementById('pr_numero').value,
    cliente_id:clienteId, cliente_nombre:c?.nombre||'',
    fecha:document.getElementById('pr_fecha').value,
    fecha_validez:document.getElementById('pr_valido').value||null,
    titulo:document.getElementById('pr_titulo').value||null,
    forma_pago_id:parseInt(document.getElementById('pr_fpago').value)||null,
    base_imponible:Math.round(base*100)/100,
    total_iva:Math.round(ivaT*100)/100,
    total:Math.round((base+ivaT)*100)/100,
    observaciones:document.getElementById('pr_obs').value||null,
    lineas, estado:'borrador',
  };
  let error, savedId = editId;
  if (editId) {
    ({error} = await sb.from('presupuestos').update(datos).eq('id', editId));
  } else {
    const res = await sb.from('presupuestos').insert(datos).select('id').single();
    error = res.error;
    if (res.data) savedId = res.data.id;
  }
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mPresupRapido');
  toast('💾 Guardado ✓ — Generando PDF...','success');
  await loadPresupuestos();
  loadDashboard();
  // Generar PDF
  const pres = presupuestos.find(x=>x.id===savedId) || {...datos, id:savedId};
  generarPdfPresupuesto(pres);
}

// ═══ GENERACIÓN DE PDF PRESUPUESTO ═══
function generarPdfPresupuesto(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','mm','a4');
  const W = 210, H = 297;
  const ML = 15, MR = 15;
  const azul = [27,79,216];
  const gris = [100,116,139];
  const negro = [30,41,59];

  let y = 15;

  // ─── CABECERA EMPRESA ───
  // Logo (si hay)
  // Nombre empresa
  doc.setFontSize(18);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text(EMPRESA.nombre||'Mi Empresa', ML, y+6);

  doc.setFontSize(8.5);
  doc.setTextColor(...gris);
  doc.setFont(undefined, 'normal');
  const empInfo = [];
  if (EMPRESA.cif) empInfo.push('CIF: '+EMPRESA.cif);
  if (EMPRESA.direccion) empInfo.push(EMPRESA.direccion);
  const empLoc = [EMPRESA.cp, EMPRESA.municipio, EMPRESA.provincia].filter(Boolean).join(', ');
  if (empLoc) empInfo.push(empLoc);
  if (EMPRESA.telefono) empInfo.push('Tel: '+EMPRESA.telefono);
  if (EMPRESA.email) empInfo.push(EMPRESA.email);
  empInfo.forEach((t,i)=> doc.text(t, ML, y+12+i*3.5));

  // ─── TÍTULO DOCUMENTO ───
  doc.setFontSize(22);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text('PRESUPUESTO', W-MR, y+6, {align:'right'});

  doc.setFontSize(11);
  doc.setTextColor(...negro);
  doc.text(p.numero||'—', W-MR, y+13, {align:'right'});

  y += 12 + empInfo.length*3.5 + 8;

  // ─── LÍNEA SEPARADORA ───
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.8);
  doc.line(ML, y, W-MR, y);
  y += 8;

  // ─── DATOS CLIENTE Y PRESUPUESTO ───
  // Cliente
  doc.setFontSize(8);
  doc.setTextColor(...gris);
  doc.text('CLIENTE', ML, y);
  doc.setFontSize(12);
  doc.setTextColor(...negro);
  doc.setFont(undefined, 'bold');
  doc.text(p.cliente_nombre||'—', ML, y+5.5);

  // Buscar datos cliente
  const cli = clientes.find(x=>x.id===p.cliente_id);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  let cy = y+10;
  if (cli?.nif) { doc.text('NIF: '+cli.nif, ML, cy); cy+=3.8; }
  if (cli?.direccion) { doc.text(cli.direccion, ML, cy); cy+=3.8; }
  const cliLoc = [cli?.cp, cli?.municipio, cli?.provincia].filter(Boolean).join(', ');
  if (cliLoc) { doc.text(cliLoc, ML, cy); cy+=3.8; }
  if (cli?.email) { doc.text(cli.email, ML, cy); cy+=3.8; }

  // Datos presupuesto (columna derecha)
  const rx = 130;
  const datosP = [
    ['Fecha', p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—'],
    ['Válido hasta', p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—'],
  ];
  if (p.titulo) datosP.push(['Referencia', p.titulo]);

  datosP.forEach(([k,v],i)=>{
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text(k, rx, y+i*8);
    doc.setFontSize(10);
    doc.setTextColor(...negro);
    doc.setFont(undefined, 'bold');
    doc.text(v, rx, y+4+i*8);
    doc.setFont(undefined, 'normal');
  });

  y = Math.max(cy, y+datosP.length*8) + 8;

  // ─── TABLA LÍNEAS ───
  const lineas = (p.lineas||[]);
  const tableBody = [];
  let currentCap = null;

  lineas.forEach(l => {
    if (l.tipo==='capitulo') {
      currentCap = l.titulo||'Capítulo';
      tableBody.push([{content:'\u{1F4C1} '+currentCap, colSpan:6, styles:{fontStyle:'bold',fillColor:[238,243,255],textColor:azul,fontSize:9}}]);
    } else {
      const sub = (l.cant||0)*(l.precio||0)*(1-((l.dto||0)/100));
      const iv = sub*((l.iva||0)/100);
      tableBody.push([
        l.desc||'',
        {content:String(l.cant||0), styles:{halign:'right'}},
        {content:fmtE(l.precio||0), styles:{halign:'right'}},
        {content:l.dto?l.dto+'%':'—', styles:{halign:'right'}},
        {content:l.iva!=null?l.iva+'%':'—', styles:{halign:'right'}},
        {content:fmtE(sub+iv), styles:{halign:'right',fontStyle:'bold'}},
      ]);
    }
  });

  doc.autoTable({
    startY: y,
    margin: {left:ML, right:MR},
    head: [['Descripción','Cant.','Precio','Dto.','IVA','Total']],
    body: tableBody,
    headStyles: {fillColor:azul, textColor:[255,255,255], fontSize:8.5, fontStyle:'bold', cellPadding:3},
    bodyStyles: {fontSize:8.5, textColor:negro, cellPadding:2.5},
    alternateRowStyles: {fillColor:[248,250,252]},
    columnStyles: {
      0: {cellWidth:'auto'},
      1: {cellWidth:18, halign:'right'},
      2: {cellWidth:24, halign:'right'},
      3: {cellWidth:18, halign:'right'},
      4: {cellWidth:18, halign:'right'},
      5: {cellWidth:28, halign:'right'},
    },
    theme: 'grid',
    styles: {lineColor:[226,232,240], lineWidth:0.3},
  });

  y = doc.lastAutoTable.finalY + 8;

  // ─── TOTALES ───
  const totX = 130;
  const totW = W-MR-totX;

  // Base imponible
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  doc.text('Base imponible', totX, y);
  doc.setTextColor(...negro);
  doc.text(fmtE(p.base_imponible||0), W-MR, y, {align:'right'});
  y+=5;

  // IVA
  doc.setTextColor(...gris);
  doc.text('IVA', totX, y);
  doc.setTextColor(...negro);
  doc.text(fmtE(p.total_iva||0), W-MR, y, {align:'right'});
  y+=6;

  // Línea
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.5);
  doc.line(totX, y, W-MR, y);
  y+=5;

  // Total
  doc.setFontSize(13);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text('TOTAL', totX, y);
  doc.text(fmtE(p.total||0), W-MR, y, {align:'right'});
  doc.setFont(undefined, 'normal');
  y+=10;

  // ─── OBSERVACIONES ───
  if (p.observaciones) {
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text('OBSERVACIONES', ML, y);
    y+=4;
    doc.setFontSize(8.5);
    doc.setTextColor(...negro);
    const obsLines = doc.splitTextToSize(p.observaciones, W-ML-MR);
    doc.text(obsLines, ML, y);
    y += obsLines.length * 3.5 + 5;
  }

  // ─── PIE DE PÁGINA ───
  const footY = H-12;
  doc.setFontSize(7.5);
  doc.setTextColor(...gris);
  doc.setDrawColor(226,232,240);
  doc.setLineWidth(0.3);
  doc.line(ML, footY-4, W-MR, footY-4);
  doc.text(EMPRESA.nombre||'', ML, footY);
  if (EMPRESA.telefono) doc.text('Tel: '+EMPRESA.telefono, ML+50, footY);
  if (EMPRESA.email) doc.text(EMPRESA.email, ML+100, footY);
  doc.text('Página 1 de 1', W-MR, footY, {align:'right'});

  // ─── DESCARGAR ───
  doc.save('Presupuesto_'+(p.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')+'.pdf');
  toast('📄 PDF descargado ✓','success');
}

// PDF desde la lista o detalle (sin guardar, solo generar)
function descargarPdfPresupuesto(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) { toast('Presupuesto no encontrado','error'); return; }
  generarPdfPresupuesto(p);
}

function imprimirPresupuesto(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) { toast('Presupuesto no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===p.cliente_id);
  const capLineas = p.lineas||[];
  let htmlLineas = '';
  capLineas.forEach(l => {
    if (l.tipo==='capitulo') {
      htmlLineas += `<tr class="cap-row"><td colspan="6"><span class="cap-icon">■</span> ${l.titulo||''}</td></tr>`;
    } else if (l.tipo==='subcapitulo') {
      htmlLineas += `<tr class="sub-row"><td colspan="6"><span class="sub-icon">▸</span> ${l.titulo||''}</td></tr>`;
    } else {
      const dto = l.dto||0;
      const sub = (l.cant||1)*(l.precio||0)*(1-dto/100);
      const iva = sub*((l.iva||0)/100);
      htmlLineas += `<tr class="item-row">
        <td class="desc-cell">${l.desc||''}</td>
        <td class="num-cell">${l.cant||1}</td>
        <td class="num-cell">${(l.precio||0).toFixed(2)} €</td>
        <td class="num-cell">${dto?dto+'%':'—'}</td>
        <td class="num-cell">${l.iva||0}%</td>
        <td class="num-cell total-cell">${(sub+iva).toFixed(2)} €</td>
      </tr>`;
    }
  });
  const dirEmpresa = [EMPRESA?.direccion, [EMPRESA?.cp, EMPRESA?.municipio].filter(Boolean).join(' '), EMPRESA?.provincia].filter(Boolean).join(', ');
  const dirCliente = c ? [c.direccion_fiscal||c.direccion, [c.cp_fiscal||c.cp, c.municipio_fiscal||c.municipio].filter(Boolean).join(' '), c.provincia_fiscal||c.provincia].filter(Boolean).join(', ') : '';
  const logoHtml = EMPRESA?.logo_url ? `<img src="${EMPRESA.logo_url}" class="logo-img">` : `<div class="logo-placeholder">${(EMPRESA?.nombre||'JI').substring(0,2).toUpperCase()}</div>`;
  const win = window.open('','_blank','width=850,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>Presupuesto ${p.numero}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    @page{size:A4;margin:12mm 14mm 18mm 14mm}
    body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;line-height:1.4}
    .page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm;position:relative}

    /* CABECERA: empresa izq + cliente der — PROTAGONISTAS */
    .header-row{display:flex;gap:24px;margin-bottom:16px;align-items:stretch}
    .header-col{flex:1;min-width:0}
    .emp-block{display:flex;align-items:flex-start;gap:14px}
    .logo-img{width:60px;height:60px;object-fit:contain;border-radius:8px}
    .logo-placeholder{width:60px;height:60px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;letter-spacing:1px;flex-shrink:0}
    .emp-info .name{font-size:16px;font-weight:700;color:#1e40af;margin-bottom:1px}
    .emp-info .razon{font-size:11px;color:#64748b;margin-bottom:2px}
    .emp-info .datos{font-size:11px;color:#475569;line-height:1.55}
    .cli-block{background:#f1f5f9;border-radius:8px;padding:12px 16px;border-left:4px solid #1e40af;height:100%}
    .cli-block .label{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:4px}
    .cli-block .nombre{font-size:15px;font-weight:700;color:#1e2a3a;margin-bottom:3px}
    .cli-block .detalle{font-size:11px;color:#475569;line-height:1.55}
    .cli-block .detalle span{margin-right:12px}

    /* BARRA DOC — discreta, debajo de cabecera */
    .doc-bar{display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px}
    .doc-bar .doc-left{font-size:11px;color:#1e40af;display:flex;align-items:baseline;gap:6px}
    .doc-bar .doc-left .tipo{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px}
    .doc-bar .doc-left .nro{font-size:11px;font-weight:600;color:#475569}
    .doc-bar .fechas{font-size:11px;color:#64748b;display:flex;gap:16px}
    .doc-bar .fechas b{color:#334155;font-weight:600}

    /* REFERENCIA */
    ${p.titulo?'.ref-line{font-size:10.5px;color:#92400e;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 14px;border-radius:4px;margin-bottom:10px}':''}

    /* TABLA */
    .items-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}
    .items-table thead th{background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.7px;text-align:left}
    .items-table thead th.r{text-align:right}
    .cap-row td{background:#eef2ff;padding:7px 10px;font-weight:700;font-size:10.5px;color:#1e40af;border-bottom:1px solid #dbeafe}
    .cap-icon{color:#1e40af;margin-right:4px}
    .sub-row td{background:#f8fafc;padding:5px 10px 5px 22px;font-weight:600;font-size:10px;color:#475569;border-bottom:1px solid #f1f5f9}
    .sub-icon{color:#94a3b8;margin-right:3px}
    .item-row td{border-bottom:1px solid #f1f5f9}
    .desc-cell{padding:6px 10px;color:#334155}
    .num-cell{padding:6px 8px;text-align:right;color:#475569;white-space:nowrap}
    .total-cell{font-weight:700;color:#1e2a3a}
    .items-table tbody tr:last-child td{border-bottom:none}

    /* TOTALES */
    .totals-block{display:flex;justify-content:flex-end;margin-bottom:16px}
    .totals-inner{min-width:230px}
    .totals-row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569}
    .totals-row b{color:#1e2a3a}
    .totals-row.grand{padding:10px 14px;background:#1e40af;color:#fff;border-radius:6px;font-size:15px;font-weight:800;margin-top:4px}
    .totals-row.grand b{color:#fff}

    /* OBSERVACIONES */
    .obs-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:10px;color:#475569;line-height:1.5}
    .obs-box .obs-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px}

    /* VALIDEZ */
    .validez-box{background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:8px 14px;margin-bottom:12px;font-size:10px;color:#92400e;text-align:center}

    /* FOOTER */
    .footer{position:absolute;bottom:20px;left:36px;right:36px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between}

    /* PRINT */
    @media print{
      body{background:#fff}
      .page{padding:0;box-shadow:none;min-height:auto}
      .no-print{display:none!important}
      .footer{position:fixed;bottom:8mm;left:14mm;right:14mm}
    }
    /* BOTONES */
    .btn-bar{text-align:center;padding:16px;background:#f5f5f5}
    .btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px;transition:all .2s}
    .btn-print{background:#1e40af;color:#fff}
    .btn-print:hover{background:#1d4ed8}
    .btn-close{background:#e2e8f0;color:#475569}
    .btn-close:hover{background:#cbd5e1}
  </style></head><body>
  <div class="no-print btn-bar">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
  <div class="page">
    <!-- CABECERA: EMPRESA + CLIENTE — protagonistas -->
    <div class="header-row">
      <div class="header-col">
        <div class="emp-block">
          ${logoHtml}
          <div class="emp-info">
            <div class="name">${EMPRESA?.nombre||'Mi Empresa'}</div>
            ${EMPRESA?.razon_social?'<div class="razon">'+EMPRESA.razon_social+'</div>':''}
            <div class="datos">
              ${EMPRESA?.cif?'CIF: '+EMPRESA.cif+'<br>':''}
              ${dirEmpresa?dirEmpresa+'<br>':''}
              ${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.telefono&&EMPRESA?.email?' · ':''}${EMPRESA?.email?EMPRESA.email:''}
              ${EMPRESA?.web?'<br>'+EMPRESA.web:''}
            </div>
          </div>
        </div>
      </div>
      <div class="header-col">
        <div class="cli-block">
          <div class="label">Cliente</div>
          <div class="nombre">${p.cliente_nombre||'—'}</div>
          <div class="detalle">
            ${c?.nif?'<span><b>NIF:</b> '+c.nif+'</span>':''}
            ${c?.telefono?'<span><b>Tel:</b> '+c.telefono+'</span>':''}
            ${c?.email?'<br><b>Email:</b> '+c.email:''}
            ${dirCliente?'<br>'+dirCliente:''}
          </div>
        </div>
      </div>
    </div>

    <!-- BARRA DOC — discreta -->
    <div class="doc-bar">
      <div class="doc-left"><span class="tipo">PRESUPUESTO</span><span class="nro">${p.numero||'—'}${p.version>1?' · v'+p.version:''}</span></div>
      <div class="fechas">
        <span><b>Fecha:</b> ${p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'}</span>
        <span><b>Válido hasta:</b> ${p.fecha_validez?new Date(p.fecha_validez).toLocaleDateString('es-ES'):'—'}</span>
      </div>
    </div>

    ${p.titulo?'<div class="ref-line"><b>Ref:</b> '+p.titulo+'</div>':''}

    <!-- TABLA DE LÍNEAS -->
    <table class="items-table">
      <thead><tr>
        <th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Dto.</th><th class="r">IVA</th><th class="r">Total</th>
      </tr></thead>
      <tbody>${htmlLineas}</tbody>
    </table>

    <!-- TOTALES -->
    <div class="totals-block">
      <div class="totals-inner">
        <div class="totals-row"><span>Base imponible</span><b>${(p.base_imponible||0).toFixed(2)} €</b></div>
        <div class="totals-row"><span>IVA</span><b>${(p.total_iva||0).toFixed(2)} €</b></div>
        <div class="totals-row grand"><span>TOTAL</span><b>${(p.total||0).toFixed(2)} €</b></div>
      </div>
    </div>

    ${p.observaciones?'<div class="obs-box"><div class="obs-title">Observaciones</div>'+p.observaciones.replace(/\n/g,'<br>')+'</div>':''}

    <div class="validez-box">
      Este presupuesto tiene una validez de ${p.fecha_validez?Math.max(0,Math.round((new Date(p.fecha_validez)-new Date(p.fecha))/(1000*60*60*24)))+' días':'—'} desde la fecha de emisión.
      Para aceptarlo, póngase en contacto con nosotros antes de la fecha de validez indicada.
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <span>${EMPRESA?.nombre||''} ${EMPRESA?.cif?' · CIF: '+EMPRESA.cif:''}</span>
      <span>${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.email?' · '+EMPRESA.email:''}</span>
    </div>
  </div>
  </body></html>`);
  win.document.close();
}

function enviarPresupuestoEmail(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) { toast('Presupuesto no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===p.cliente_id);
  const email = c?.email || '';
  const asunto = encodeURIComponent(`Presupuesto ${p.numero||''} — ${EMPRESA?.nombre||''}`);
  const totalFmt = (p.total||0).toFixed(2).replace('.',',') + ' €';
  const fechaFmt = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
  const validezFmt = p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—';
  const cuerpo = encodeURIComponent(
`Estimado/a ${p.cliente_nombre||'cliente'},

Le adjuntamos el presupuesto ${p.numero||''} con fecha ${fechaFmt}.

Importe total: ${totalFmt} (IVA incluido)
Válido hasta: ${validezFmt}

Para aceptar este presupuesto, puede responder a este correo o contactarnos directamente.

Un saludo cordial,
${EMPRESA?.nombre||''}
${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}
${EMPRESA?.email||''}
${EMPRESA?.web||''}`
  );
  // Abrir cliente de correo con mailto
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, '_self');
  toast('📧 Abriendo cliente de correo...','info');
}

function cambiarEstadoPresMenu(event, id) {
  event.stopPropagation();
  // Remove any existing menu
  document.querySelectorAll('.est-menu-popup').forEach(m=>m.remove());
  const ESTADOS = [
    {key:'pendiente',ico:'⏳',label:'Pendiente'},
    {key:'aceptado',ico:'✅',label:'Aceptado'},
    {key:'rechazado',ico:'❌',label:'Rechazado'},
    {key:'anulado',ico:'🚫',label:'Anulado'},
  ];
  const menu = document.createElement('div');
  menu.className = 'est-menu-popup';
  menu.style.cssText = 'position:fixed;z-index:9999;background:white;border-radius:10px;box-shadow:var(--sh-lg);padding:6px;min-width:160px';
  menu.innerHTML = ESTADOS.map(e=>`<button onclick="cambiarEstadoPres(${id},'${e.key}');this.parentElement.remove()" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-family:var(--font)" onmouseenter="this.style.background='var(--gris-50)'" onmouseleave="this.style.background='none'">${e.ico} ${e.label}</button>`).join('');
  document.body.appendChild(menu);
  const rect = event.target.getBoundingClientRect();
  menu.style.top = (rect.bottom+4)+'px';
  menu.style.left = rect.left+'px';
  // Close on click outside
  setTimeout(()=>{
    const handler = (e)=>{ if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',handler);} };
    document.addEventListener('click', handler);
  }, 10);
}

// ═══ VER DETALLE PRESUPUESTO ═══
function verDetallePresupuesto(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('presDetId').value = id;
  document.getElementById('presDetNro').textContent = p.numero||'—';
  document.getElementById('presDetCli').textContent = p.cliente_nombre||'—';
  document.getElementById('presDetFecha').textContent = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
  document.getElementById('presDetValido').textContent = p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—';
  document.getElementById('presDetTitulo').textContent = p.titulo||'—';
  document.getElementById('presDetTotal').textContent = fmtE(p.total||0);

  // Líneas
  const lineas = p.lineas || [];
  let base=0, ivaTotal=0;
  document.getElementById('presDetLineas').innerHTML = lineas.map(l => {
    if (l.tipo==='capitulo') {
      return `<tr style="background:var(--azul-light);border-top:2px solid var(--azul)">
        <td colspan="6" style="padding:8px 10px;font-weight:700;font-size:13px;color:var(--azul)">📁 ${l.titulo||''}</td>
      </tr>`;
    }
    const sub = (l.cant||0)*(l.precio||0)*(1-((l.dto||0)/100));
    const iv = sub*((l.iva||0)/100);
    base+=sub; ivaTotal+=iv;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:8px 10px;font-size:13px">${l.desc||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.cant||0}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmtE(l.precio||0)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.dto?l.dto+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.iva!=null?l.iva+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub+iv)}</td>
    </tr>`;
  }).join('');
  document.getElementById('presDetBase').textContent = fmtE(p.base_imponible||base);
  document.getElementById('presDetIva').textContent = fmtE(p.total_iva||ivaTotal);
  document.getElementById('presDetTotal2').textContent = fmtE(p.total||0);

  // Observaciones
  const obs = document.getElementById('presDetObs');
  const obsWrap = document.getElementById('presDetObsWrap');
  if (p.observaciones) { obs.textContent = p.observaciones; obsWrap.style.display='block'; }
  else { obsWrap.style.display='none'; }

  openModal('mPresDetalle', true);
}

// ═══ EDITAR PRESUPUESTO ═══
async function editarPresupuesto(id) {
  abrirEditor('presupuesto', id);
}

// ═══ PRESUPUESTO → ALBARÁN ═══
async function presToAlbaran(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  if (!confirm('¿Crear albarán desde el presupuesto '+p.numero+'?')) return;
  const numero = await generarNumeroDoc('albaran');
  // Simplificar líneas para albarán (sin IVA/dto)
  const lineas = (p.lineas||[]).filter(l=>l.tipo!=='capitulo').map(l=>({
    desc:l.desc||'', cant:l.cant||1, precio:l.precio||0
  }));
  let total=0; lineas.forEach(l=>total+=l.cant*l.precio);
  const { error } = await sb.from('albaranes').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
    fecha: new Date().toISOString().split('T')[0],
    referencia: p.titulo||null,
    total: Math.round(total*100)/100,
    estado: 'pendiente', observaciones: p.observaciones, lineas,
    presupuesto_id: p.id,
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await sb.from('presupuestos').update({estado:'aceptado'}).eq('id',id);
  const pp = presupuestos.find(x=>x.id===id); if(pp) pp.estado='aceptado';
  renderPresupuestos(presFiltrados.length ? presFiltrados : presupuestos);
  toast('📄 Albarán creado — presupuesto aceptado','success');
  loadDashboard();
}

// ═══ PRESUPUESTO → OBRA ═══
async function presToObra(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  if (!confirm('¿Crear obra desde el presupuesto '+p.numero+'?')) return;
  const c = clientes.find(x=>x.id===p.cliente_id);
  const dirParts = [c?.direccion_fiscal||c?.direccion, c?.cp_fiscal||c?.cp, c?.municipio_fiscal||c?.municipio, c?.provincia_fiscal||c?.provincia].filter(Boolean).join(', ');
  const numObra = `TRB-${new Date().getFullYear()}-${String(trabajos.length+1).padStart(3,'0')}`;
  const { error } = await sb.from('trabajos').insert({
    empresa_id: EMPRESA.id,
    numero: numObra,
    titulo: p.titulo || 'Obra desde '+p.numero,
    cliente_id: p.cliente_id, cliente_nombre: c?.nombre||p.cliente_nombre||'',
    estado: 'pendiente',
    presupuesto_id: p.id,
    descripcion: p.observaciones||null,
    direccion_obra_texto: dirParts||null,
    operario_id: CU.id, operario_nombre: CP?.nombre||'',
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await sb.from('presupuestos').update({estado:'aceptado'}).eq('id',id);
  const pp = presupuestos.find(x=>x.id===id); if(pp) pp.estado='aceptado';
  registrarAudit('crear_obra', 'presupuesto', id, 'Obra creada desde '+p.numero);
  renderPresupuestos(presFiltrados.length ? presFiltrados : presupuestos);
  toast('🏗️ Obra creada — presupuesto aceptado','success');
  loadDashboard();
}

// ═══════════════════════════════════════════════
