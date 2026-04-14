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
    conVersiones:true, conBorrador:true, versionesTabla:'presupuesto_versiones', versionesFk:'presupuesto_id',
  },
  albaran: {
    ico:'📄', titulo:'Albarán', tipoSerie:'albaran', tabla:'albaranes',
    conIva:true, conDto:true, conFecha2:false, fecha2Label:'', conFpago:true,
    conVersiones:true, conBorrador:true, versionesTabla:'albaran_versiones', versionesFk:'albaran_id',
  },
  factura: {
    ico:'🧾', titulo:'Factura', tipoSerie:'factura', tabla:'facturas',
    conIva:true, conDto:true, conFecha2:true, fecha2Label:'Vencimiento', conFpago:true,
    conVersiones:false, conBorrador:true,
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
      deConfig._exportado_bloqueado = doc.exportado_bloqueado || false;
      deConfig._exportado_a = doc.exportado_a || null;
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
  const _cV = cfg.conVersiones;
  const _cB = cfg.conBorrador;
  const _vBtn = _cV ? '<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>' : '';

  if (editId && isBorrador && _cB) {
    // ── BORRADOR: edición directa, sin versiones ──
    deConfig._mode = 'editing';
    de_showVersion(0);
    de_setReadonly(false);
    btnBox.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="de_guardar('borrador')">📝 Borrador</button>
      <button class="btn btn-primary btn-sm" onclick="de_guardar('pendiente')">💾 Guardar</button>`;
  } else if (editId && isAnulado && _cB) {
    // ── ANULADO: solo lectura, restaurar o eliminar (superadmin) ──
    deConfig._mode = 'view';
    de_showVersion(0);
    de_setReadonly(true);
    btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="restaurarEstadoPres(${editId},'pendiente')">♻️ Restaurar</button>
      ${CP?.es_superadmin?'<button class="btn btn-ghost btn-sm" style="color:var(--rojo)" onclick="eliminarDefinitivamente('+editId+')">🗑️ Eliminar</button>':''}`;
  } else if (editId && isCaducado && tipo==='presupuesto') {
    // ── CADUCADO (solo presupuestos): solo lectura, reactivar ──
    deConfig._mode = 'view';
    de_showVersion(deConfig._version || 1);
    de_setReadonly(true);
    btnBox.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="restaurarEstadoPres(${editId},'pendiente')">♻️ Reactivar</button>`;
  } else if (editId && docEstado==='aceptado' && tipo==='presupuesto') {
    // ── ACEPTADO (solo presupuestos): siempre bloqueado (solo superadmin puede editar) ──
    deConfig._mode = 'view';
    deConfig._bloqueado = true;
    const ver = deConfig._version || 1;
    de_showVersion(ver);
    de_setReadonly(true);
    if (CP?.es_superadmin) {
      btnBox.innerHTML = `${_vBtn}
                <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">🔓 Editar (superadmin)</button>
        <span style="color:var(--amarillo);font-size:12px;margin-left:8px">🔒 Aceptado</span>`;
    } else {
      btnBox.innerHTML = `${_vBtn}
                <span style="color:var(--rojo);font-size:12px;margin-left:8px">🔒 Bloqueado — solo superadmin puede editar</span>`;
    }
  } else if (editId && deConfig._exportado_bloqueado) {
    // ── EXPORTADO/BLOQUEADO: solo lectura, superadmin puede desbloquear ──
    deConfig._mode = 'view';
    deConfig._bloqueado = true;
    const ver = deConfig._version || 1;
    de_showVersion(ver);
    de_setReadonly(true);
    const destino = deConfig._exportado_a || 'otro documento';
    if (CP?.es_superadmin) {
      btnBox.innerHTML = `${_vBtn}
                <button class="btn btn-ghost btn-sm" style="color:var(--rojo)" onclick="de_desbloquearExportado()">🔓 Desbloquear</button>
        <span style="color:var(--amarillo);font-size:12px;margin-left:8px">🔒 Exportado a ${destino}</span>`;
    } else {
      btnBox.innerHTML = `${_vBtn}
                <span style="color:var(--rojo);font-size:12px;margin-left:8px">🔒 Exportado a ${destino} — solo superadmin puede desbloquear</span>`;
    }
  } else if (editId) {
    // ── EXISTENTE (pendiente u otro): lectura + editar + versiones ──
    deConfig._mode = 'view';
    const ver = deConfig._version || 1;
    de_showVersion(ver);
    de_setReadonly(true);
    btnBox.innerHTML = `${_vBtn}
            <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">✏️ Editar</button>`;
  } else {
    // ── NUEVO ──
    deConfig._mode = 'new';
    de_showVersion(0);
    de_setReadonly(false);
    if (_cB) {
      btnBox.innerHTML = `  <button class="btn btn-secondary btn-sm" onclick="de_guardar('borrador')">📝 Borrador</button>
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
  // Flush autosave pendiente antes de cerrar
  try { de_autoguardar_flush(); } catch(e) {}
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

async function de_desbloquearExportado() {
  if (!CP?.es_superadmin) { toast('Solo superadmin puede desbloquear','error'); return; }
  const cfg = deConfig;
  if (!cfg.editId) return;
  const destino = cfg._exportado_a || 'otro documento';
  if (!confirm(`⚠️ SUPERADMIN: ¿Desbloquear este ${cfg.tipo}?\n\nFue exportado a "${destino}". Al desbloquearlo podrás editarlo y volver a exportarlo.\n\n¿Continuar?`)) return;
  const { error } = await sb.from(cfg.tabla).update({ exportado_bloqueado: false, exportado_a: null }).eq('id', cfg.editId);
  if (error) { toast('Error: '+error.message,'error'); return; }
  toast('🔓 Documento desbloqueado por superadmin','success');
  // Reabrir el editor para refrescar estado
  abrirEditor(cfg.tipo, cfg.editId);
}

async function de_entrarEdicion() {
  const cfg = deConfig;
  if (!cfg.editId) return;

  // Aceptado = bloqueado, solo superadmin puede editar
  if (cfg._estado === 'aceptado' && cfg._bloqueado && !CP?.es_superadmin) {
    toast('🔒 Documento bloqueado — solo superadmin puede editar','error');
    return;
  }

  if (cfg.conVersiones) {
    // Snapshot current version before editing (solo si no existe ya)
    const vTabla = cfg.versionesTabla;
    const vFk = cfg.versionesFk;
    const tableOk = await de_ensureVersionTable(vTabla);
    if (tableOk) {
      const { data: current } = await sb.from(cfg.tabla).select('*').eq('id', cfg.editId).single();
      if (current) {
        const ver = current.version || cfg._version || 1;
        const { count } = await sb.from(vTabla)
          .select('id', {count:'exact', head:true})
          .eq(vFk, cfg.editId)
          .eq('version', ver);
        if (!count || count === 0) {
          const insertData = { version: ver, datos: current };
          insertData[vFk] = cfg.editId;
          const { error: insErr } = await sb.from(vTabla).insert(insertData);
          if (insErr) {
            console.warn('Error guardando versión:', insErr.message);
            toast('⚠️ No se pudo guardar snapshot de la versión anterior','error');
          }
        }
      }
    } else {
      toast('⚠️ Tabla de versiones no encontrada. Ejecuta el SQL correspondiente en Supabase','error');
    }
    cfg._version = (cfg._version||1) + 1;
    de_showVersion(cfg._version);
  }

  // Switch to editing mode
  cfg._mode = 'editing';
  de_setReadonly(false);
  de_renderLineas(); // re-render to restore drag handles

  const btnBox = document.getElementById('de_buttons');
  btnBox.innerHTML = `    <button class="btn btn-primary btn-sm" onclick="de_guardarVersion()">💾 Guardar</button>`;
  toast('✏️ Modo edición — versión v'+cfg._version,'info');
}

async function de_guardarVersion() {
  const cfg = deConfig;
  const datos = de_buildDatos();
  if (!datos) return;
  // Keep current estado (don't reset to borrador when editing)
  if (cfg.conVersiones) datos.version = cfg._version || 1;

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
  const _vBtn2 = cfg.conVersiones ? '<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>' : '';
  // Aceptado = siempre re-bloquear después de guardar (superadmin)
  if (cfg._estado === 'aceptado' && cfg.tipo === 'presupuesto') {
    cfg._bloqueado = true;
    if (CP?.es_superadmin) {
      btnBox.innerHTML = `${_vBtn2}
                <button class="btn btn-primary btn-sm" onclick="de_entrarEdicion()">🔓 Editar (superadmin)</button>
        <span style="color:var(--amarillo);font-size:12px;margin-left:8px">🔒 Aceptado</span>`;
    } else {
      btnBox.innerHTML = `${_vBtn2}
                <span style="color:var(--rojo);font-size:12px;margin-left:8px">🔒 Bloqueado</span>`;
    }
  } else {
    btnBox.innerHTML = `${_vBtn2}
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
  deLineas.push({tipo:'linea', desc:'', cant:1, precio:0, dto1:0, dto2:0, dto3:0, iva});
  de_renderLineas();
  // Focus en la nueva línea de descripción
  setTimeout(()=>{
    const inp = document.querySelector(`input[data-linea-idx="${deLineas.length-1}"]`);
    if (inp) inp.focus();
  },50);
}

function de_removeLinea(i) { deLineas.splice(i,1); de_renderLineas(); }

// ═══ AUTOCOMPLETADO DE ARTÍCULOS (usa sistema genérico de ui.js) ═══
let _artSelecting = false;

function de_buscarArticulo(input, lineaIdx) {
  // Usa el sistema genérico acBuscarArticulo de ui.js
  input.dataset.lineaIdx = lineaIdx;
  if (typeof acBuscarArticulo === 'function') {
    acBuscarArticulo(input, _de_onSelectArt, 'precio_venta');
  }
}

function _de_onSelectArt(lineaIdx, a) {
  _artSelecting = true;
  deLineas[lineaIdx].desc = a.nombre || '';
  deLineas[lineaIdx].precio = a.precio_venta || 0;
  deLineas[lineaIdx].articulo_id = a.id;
  deLineas[lineaIdx].codigo = a.codigo || '';
  if (a.tipo_iva_id && tiposIva?.length) {
    const tipoIva = tiposIva.find(t=>t.id===a.tipo_iva_id);
    if (tipoIva) deLineas[lineaIdx].iva = tipoIva.porcentaje;
  }
  const inp = document.querySelector(`input[data-linea-idx="${lineaIdx}"]`);
  if (inp) inp.value = a.nombre || '';
  // Defer render to avoid blur/innerHTML race condition
  setTimeout(() => { de_renderLineas(); de_autoguardar(); }, 0);
  toast(`📦 ${a.codigo} — ${a.nombre}`,'info');
  setTimeout(() => { _artSelecting = false; }, 300);
}

function de_seleccionarArticulo(lineaIdx, artId) {
  // Legacy: redirigir al nuevo sistema
  const a = articulos.find(x=>x.id===artId);
  if (a) _de_onSelectArt(lineaIdx, a);
}

function de_acKeydown(event, lineaIdx) {
  // Usa el sistema genérico acKeydown de ui.js
  if (typeof acKeydown === 'function') acKeydown(event);
}

// Cerrar dropdown al hacer click fuera (legacy, ahora gestionado por ui.js)
document.addEventListener('click', (e) => {
  if (!e.target.closest('#acArticulos') && !e.target.matches('input[data-linea-idx]') && !e.target.matches('[data-ac]')) {
    const d = document.getElementById('acArticulos');
    if (d) d.style.display='none';
  }
});

function de_updateLinea(i,f,v) {
  // Si se acaba de seleccionar un artículo, no dejar que onchange sobreescriba desc con el texto parcial
  if (f === 'desc' && _artSelecting) return;
  if (f === 'dto1' || f === 'dto2' || f === 'dto3' || f === 'cant' || f === 'precio' || f === 'iva') {
    deLineas[i][f] = parseFloat(v)||0;
  } else {
    deLineas[i][f] = (f==='desc'||f==='titulo') ? v : parseFloat(v)||0;
  }
  de_renderLineas();
  de_autoguardar();
}

// Autosave: debounced, saves silently after 30 seconds of inactivity.
// Also saves inmediatamente en blur y visibilitychange (ver listeners abajo).
const DE_AUTOSAVE_MS = 30000; // 30 segundos — no somos colaborativos
let _autoguardTimer = null;
let _autoguardDirty = false; // true si hay cambios pendientes desde el último save

async function _de_autoguardar_do() {
  // Ejecuta el guardado real. Devuelve true si guardó.
  if (!deConfig || !deConfig.editId) return false;
  if (deConfig._mode === 'view') return false;
  const datos = de_buildDatos();
  if (!datos) return false;
  // NUNCA tocar el estado en el autosave — mantener el que tiene en BD
  if (deConfig.tipo==='presupuesto') datos.version = deConfig._version || 1;
  const { error } = await sb.from(deConfig.tabla).update(datos).eq('id', deConfig.editId);
  if (error && datos.version && error.message && error.message.includes('version')) {
    delete datos.version;
    await sb.from(deConfig.tabla).update(datos).eq('id', deConfig.editId);
  }
  if (!error) {
    _autoguardDirty = false;
    const indicator = document.getElementById('de_autosave_indicator');
    if (indicator) { indicator.textContent = '✓ Guardado'; indicator.style.opacity='1'; setTimeout(()=>indicator.style.opacity='0', 2000); }
    return true;
  }
  return false;
}

function de_autoguardar() {
  if (!deConfig.editId && deConfig._mode === 'new') return; // Don't autosave unsaved new docs
  if (deConfig._mode === 'view') return; // Don't autosave in read-only mode
  _autoguardDirty = true;
  clearTimeout(_autoguardTimer);
  _autoguardTimer = setTimeout(() => { _de_autoguardar_do(); }, DE_AUTOSAVE_MS);
}

// Guardado inmediato (flush). Usado por blur / visibilitychange / cierre.
async function de_autoguardar_flush() {
  if (!_autoguardDirty) return;
  clearTimeout(_autoguardTimer);
  _autoguardTimer = null;
  await _de_autoguardar_do();
}

// ¿El editor actual tiene contenido real (cliente manualmente seleccionado, líneas con texto/precio, observaciones, título)?
// IMPORTANTE: no llamar a de_buildDatos porque dispara toasts de validación.
// Tampoco se considera "contenido" un cliente preseleccionado al crear desde la ficha sin tocar nada más.
function deHasContent() {
  try {
    // Líneas con descripción o precio
    if (Array.isArray(deLineas) && deLineas.some(l => l && (
      (l.desc && String(l.desc).trim()) ||
      (l.descripcion && String(l.descripcion).trim()) ||
      l.articulo_id ||
      (parseFloat(l.precio)||0) > 0 ||
      (parseFloat(l.cant)||0) > 1
    ))) return true;
    // Título/observaciones
    const tit = document.getElementById('de_titulo');
    if (tit && tit.value && tit.value.trim()) return true;
    const obs = document.getElementById('de_obs_largo');
    if (obs && obs.value && obs.value.trim()) return true;
  } catch(e) {}
  return false;
}

// Smart close del editor de Ventas.
async function deSmartClose() {
  if (!deConfig) { cerrarEditor(); return; }
  const isNew = !deConfig.editId;
  const isView = deConfig._mode === 'view';
  // En modo view (lectura) cerramos sin más
  if (isView) { cerrarEditor(); return; }
  // Flush de autosave primero (puede dejar _autoguardDirty=false y guardar silenciosamente)
  await de_autoguardar_flush();
  if (isNew) {
    if (!deHasContent()) { cerrarEditor(); return; }
    // Nuevo con datos → guardar borrador (de_guardar cierra solo)
    try { await de_guardar('borrador'); } catch(e) { cerrarEditor(); }
    return;
  }
  // Existente: tras flush ya quedó guardado todo. Cerrar.
  cerrarEditor();
}
window.deSmartClose = deSmartClose;

// Listeners globales: al salir de un campo o cambiar de pestaña, flush.
(function _de_installAutosaveListeners(){
  if (window._deAutosaveListenersInstalled) return;
  window._deAutosaveListenersInstalled = true;
  // blur dentro del editor (capture para pillar cualquier input/textarea/select)
  document.addEventListener('focusout', (ev) => {
    if (!document.body.classList.contains('editor-open')) return;
    const t = ev.target;
    if (!t) return;
    const tag = (t.tagName||'').toLowerCase();
    if (tag==='input' || tag==='textarea' || tag==='select') {
      de_autoguardar_flush();
    }
  }, true);
  // cambio de pestaña / minimiza ventana
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && document.body.classList.contains('editor-open')) {
      de_autoguardar_flush();
    }
  });
  // cerrar/refresh pestaña (best-effort)
  window.addEventListener('pagehide', () => {
    if (document.body.classList.contains('editor-open')) de_autoguardar_flush();
  });
})();

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
      const dto1 = showDto ? (l.dto1||0) : 0;
      const dto2 = showDto ? (l.dto2||0) : 0;
      const dto3 = showDto ? (l.dto3||0) : 0;
      const sub = l.cant*l.precio*(1-dto1/100)*(1-dto2/100)*(1-dto3/100);
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
            data-linea-idx="${i}"
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
          <input type="number" value="${l.dto1||0}" min="0" max="100" step="0.1"
            onchange="de_updateLinea(${i},'dto1',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 1">
        </td><td style="padding:6px 5px">
          <input type="number" value="${l.dto2||0}" min="0" max="100" step="0.1"
            onchange="de_updateLinea(${i},'dto2',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 2">
        </td><td style="padding:6px 5px">
          <input type="number" value="${l.dto3||0}" min="0" max="100" step="0.1"
            onchange="de_updateLinea(${i},'dto3',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 3">
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
const _versionTableCache = {};
async function de_ensureVersionTable(tableName) {
  const tbl = tableName || 'presupuesto_versiones';
  if (_versionTableCache[tbl] !== undefined) return _versionTableCache[tbl];
  try {
    const { error } = await sb.from(tbl).select('id').limit(1);
    _versionTableCache[tbl] = !error;
    if (error) console.warn('⚠️ Tabla '+tbl+' no existe.');
  } catch(e) {
    _versionTableCache[tbl] = false;
  }
  return _versionTableCache[tbl];
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
    const dto1 = cfg.conDto?(l.dto1||0):0;
    const dto2 = cfg.conDto?(l.dto2||0):0;
    const dto3 = cfg.conDto?(l.dto3||0):0;
    const s = l.cant*l.precio*(1-dto1/100)*(1-dto2/100)*(1-dto3/100);
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
  const _tituloVal = document.getElementById('de_titulo').value||null;
  datos.titulo = _tituloVal;
  if (cfg.tipo==='albaran') datos.referencia = _tituloVal;
  // Vincular a obra si se creó desde una ficha de obra
  if (cfg.trabajo_id) datos.trabajo_id = cfg.trabajo_id;
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

  // REGLA: un documento con número asignado NUNCA puede volver a borrador
  const tieneNumero = datos.numero && datos.numero !== '(sin asignar)' && !(datos.numero||'').startsWith('BORR-');
  if (estado === 'borrador' && tieneNumero && cfg.conBorrador) {
    estado = 'pendiente'; // forzar a pendiente si ya tiene número
  }

  datos.estado = estado||'borrador';
  if (cfg.conVersiones && estado !== 'borrador') datos.version = cfg._version || 1;

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
  const _toastMsg = isNew
    ? (datos.estado === 'borrador' ? 'Borrador creado' : cfg.titulo + ' ' + datos.numero + ' creado')
    : 'Guardado';
  toast(cfg.ico+' '+_toastMsg+' ✓','success');

  // Recargar lista correspondiente
  if (cfg.tipo==='presupuesto') await loadPresupuestos();
  if (cfg.tipo==='albaran') await loadAlbaranes();
  loadDashboard();

  // Siempre cerrar editor al guardar manualmente (borrador o pendiente)
  // El autoguardado no pasa por esta función, así que no se ve afectado
  const _obraOrigen = cfg.trabajo_id || null;
  cerrarEditor();
  if (_obraOrigen && typeof abrirFichaObra === 'function') {
    const {data:_trR} = await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    if (_trR) trabajos = _trR;
    await abrirFichaObra(_obraOrigen, false);
  }

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

  if (!deConfig.editId || !deConfig.conVersiones) return;
  const vTabla = deConfig.versionesTabla;
  const vFk = deConfig.versionesFk;
  const tableOk = await de_ensureVersionTable(vTabla);
  if (!tableOk) {
    toast('⚠️ Tabla de versiones no existe. Ejecuta el SQL correspondiente en Supabase','error');
    return;
  }
  const { data: vers, error: verErr } = await sb.from(vTabla)
    .select('*').eq(vFk, deConfig.editId).order('version', {ascending:false});
  if (verErr) { toast('Error: '+verErr.message,'error'); return; }
  if (!vers || !vers.length) { toast('No hay versiones anteriores','info'); return; }

  let items = '';
  vers.forEach(v => {
    const d = v.datos||{};
    const fecha = new Date(v.created_at).toLocaleDateString('es-ES');
    const hora = new Date(v.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    items += `<div class="hov-bg" style="padding:8px 12px;border-bottom:1px solid var(--gris-100);display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer">
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
  const vTabla = deConfig.versionesTabla || 'presupuesto_versiones';
  const { data: v } = await sb.from(vTabla).select('datos').eq('id', versionId).single();
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

// ═══ FUNCIONES DE PRESUPUESTO ═══
// NOTA: Las siguientes funciones están definidas en presupuestos.js y NO deben duplicarse aquí
// para evitar sobreescritura (editor.js carga después y machacaría las versiones con firma):
//   - guardarPresupYPdf()
//   - generarPdfPresupuesto()
//   - descargarPdfPresupuesto()
//   - imprimirPresupuesto()
//   - enviarPresupuestoEmail()
//   - cambiarEstadoPresMenu()
//   - editarPresupuesto()
//   - verDetallePresupuesto()
//   - presToAlbaran() / presToObra()
// ═══════════════════════════════════════════════
