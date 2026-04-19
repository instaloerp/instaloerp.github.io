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
    conVersiones:true, conBorrador:true, versionesTabla:'factura_versiones', versionesFk:'factura_id',
  },
};

async function abrirEditor(tipo, editId) {
  // Protección: facturas con número no se pueden editar
  if (tipo === 'factura' && editId) {
    const fCheck = (typeof facLocalData !== 'undefined' ? facLocalData : []).find(x => x.id === editId);
    if (fCheck) {
      const esBorr = fCheck.estado === 'borrador' || (fCheck.numero || '').startsWith('BORR-');
      if (fCheck.rectificativa_de) { toast('Las facturas rectificativas no se pueden editar', 'error'); return; }
      if (!esBorr) { toast('Solo se pueden editar facturas en borrador', 'error'); return; }
      if ((typeof facLocalData !== 'undefined' ? facLocalData : []).some(r => r.rectificativa_de === editId)) { toast('Esta factura tiene rectificativa asociada y no se puede editar', 'error'); return; }
    }
  }
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

  // Limpiar selector de cliente (el buscador se llena al escribir)
  const sel = document.getElementById('de_cliente');
  if (sel) sel.value = '';
  const selSearch = document.getElementById('de_cliente_search');
  if (selSearch) selSearch.value = '';
  const selDrop = document.getElementById('de_cliente_drop');
  if (selDrop) selDrop.style.display = 'none';

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
    serSel.innerHTML = serUsa.map(s=>`<option value="${s.id}">${s.serie ? s.serie+'-' : s.prefijo||prefDef[tipo]||'DOC-'}</option>`).join('');
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
      de_setClienteSel(doc.cliente_id);
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
        if (l.tipo==='servicio') return {tipo:'servicio', desc:l.desc||'', cant:l.cant||1, precio:l.precio||0, dto1:l.dto1||0, dto2:l.dto2||0, dto3:l.dto3||0, iva:l.iva!=null?l.iva:21, articulo_id:l.articulo_id, codigo:l.codigo||'', servicio_id:l.articulo_id, srv_collapsed:false};
        return {tipo:'linea', desc:l.desc||'', cant:l.cant||1, precio:l.precio||0, dto:l.dto||0, iva:l.iva!=null?l.iva:21, articulo_id:l.articulo_id, codigo:l.codigo||''};
      });
      // Re-inyectar sub-líneas de servicios desde Supabase
      setTimeout(() => _de_reloadSrvLineas(), 100);
      // Versión actual
      if (docEstado === 'borrador' && tipo === 'factura') {
        // Borradores factura: leer versión real de factura_versiones
        const { data: _fv } = await sb.from('factura_versiones')
          .select('version').eq('factura_id', editId).order('version', { ascending: false }).limit(1);
        deConfig._version = (_fv && _fv.length) ? _fv[0].version : 0;
      } else {
        deConfig._version = docEstado === 'borrador' ? 0 : (doc.version || 1);
      }
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

  if (editId && isBorrador && _cB && tipo === 'factura') {
    // ── BORRADOR FACTURA: solo lectura, pulsar Editar para crear versión ──
    deConfig._mode = 'view';
    de_showVersion(deConfig._version || 0);
    de_setReadonly(true);
    const _vBtnFac = '<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>';
    btnBox.innerHTML = `${_vBtnFac}
      <button class="btn btn-primary btn-sm" onclick="de_entrarEdicionFactura()">✏️ Editar</button>
      <button class="btn btn-sm" onclick="de_emitirFactura()" style="background:#059669;color:white;border:none">🧾 Emitir factura</button>`;
  } else if (editId && isBorrador && _cB) {
    // ── BORRADOR (otros): edición directa ──
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
    if (_cB && tipo === 'factura') {
      btnBox.innerHTML = `<button class="btn btn-primary btn-sm" onclick="de_guardar('borrador')">💾 Guardar</button>
        <button class="btn btn-sm" onclick="de_emitirFactura()" style="background:#059669;color:white;border:none">🧾 Emitir factura</button>`;
    } else if (_cB) {
      btnBox.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="de_guardar('borrador')">📝 Borrador</button>
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
  if (ver && ver > 0 && (deConfig.tipo==='presupuesto' || deConfig.tipo==='factura')) {
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
  const okDesb = await confirmModal({titulo:'Desbloquear documento',mensaje:`¿Desbloquear este ${cfg.tipo}?`,aviso:`Fue exportado a "${destino}". Al desbloquearlo podrás editarlo y volver a exportarlo.`,btnOk:'Desbloquear',colorOk:'#dc2626'}); if (!okDesb) return;
  const { error } = await sb.from(cfg.tabla).update({ exportado_bloqueado: false, exportado_a: null }).eq('id', cfg.editId);
  if (error) { toast('Error: '+error.message,'error'); return; }
  toast('🔓 Documento desbloqueado por superadmin','success');
  // Reabrir el editor para refrescar estado
  abrirEditor(cfg.tipo, cfg.editId);
}

function de_entrarEdicionFactura() {
  const cfg = deConfig;
  if (!cfg.editId) { console.warn('de_entrarEdicionFactura: no editId'); return; }

  // 1. Desbloquear INMEDIATAMENTE (feedback al usuario)
  cfg._mode = 'editing';
  de_setReadonly(false);
  de_renderLineas();

  const btnBox = document.getElementById('de_buttons');
  const _vBtnFac = '<button class="btn btn-ghost btn-sm" onclick="de_verVersiones(event)">🕒 Versiones</button>';
  btnBox.innerHTML = `${_vBtnFac}
    <button class="btn btn-primary btn-sm" onclick="de_guardar('borrador')">💾 Guardar</button>
    <button class="btn btn-sm" onclick="de_emitirFactura()" style="background:#059669;color:white;border:none">🧾 Emitir factura</button>`;
  toast('✏️ Modo edición', 'info');

  // 2. Guardar snapshot en segundo plano y actualizar badge al terminar
  if (cfg.conVersiones) {
    _snapshotBorradorFactura(cfg).then(() => {
      de_showVersion(cfg._version || 0);
    }).catch(e => console.error('Error snapshot:', e));
  }
}

async function _snapshotBorradorFactura(cfg) {
  // Mismo patrón que de_entrarEdicion() — probado y funcional en presupuestos
  const vTabla = cfg.versionesTabla;
  const vFk = cfg.versionesFk;
  const tableOk = await de_ensureVersionTable(vTabla, true);
  if (!tableOk) { toast('⚠️ Tabla ' + vTabla + ' no encontrada', 'error'); return; }

  const { data: current } = await sb.from(cfg.tabla).select('*').eq('id', cfg.editId).single();
  if (!current) { toast('⚠️ No se pudo leer la factura', 'error'); return; }

  const ver = current.version || cfg._version || 1;
  const { count } = await sb.from(vTabla)
    .select('id', { count: 'exact', head: true })
    .eq(vFk, cfg.editId)
    .eq('version', ver);
  if (!count || count === 0) {
    const insertData = { version: ver, snapshot: current };
    insertData[vFk] = cfg.editId;
    const { error: insErr } = await sb.from(vTabla).insert(insertData);
    if (insErr) { toast('❌ Error versión: ' + insErr.message, 'error'); return; }
    toast('✅ Versión v' + ver + ' guardada', 'success');
  }
  cfg._version = ver + 1;
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
          const insertData = { version: ver };
          insertData[vFk] = cfg.editId;
          // factura_versiones usa 'snapshot'; presupuesto_versiones usa 'datos'
          if (cfg.tipo === 'factura') {
            insertData.snapshot = current;
          } else {
            insertData.datos = current;
          }
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

// ═══════════════════════════════════════════════
//  BUSCADOR DE CLIENTE (reemplaza al <select>)
// ═══════════════════════════════════════════════
let _deClienteHiIdx = -1;
function de_filtrarClientes(q) {
  const drop = document.getElementById('de_cliente_drop');
  if (!drop) return;
  const txt = (q||'').trim().toLowerCase();
  let lista = clientes || [];
  if (txt) {
    lista = lista.filter(c =>
      (c.nombre||'').toLowerCase().includes(txt) ||
      (c.nif||'').toLowerCase().includes(txt) ||
      (c.telefono||'').toLowerCase().includes(txt) ||
      (c.email||'').toLowerCase().includes(txt)
    );
  }
  lista = lista.slice(0, 50);
  _deClienteHiIdx = -1;
  if (!lista.length) {
    drop.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--gris-400)">Sin resultados</div>';
  } else {
    drop.innerHTML = lista.map((c,i) => `<div data-cli-id="${c.id}" data-idx="${i}" onclick="de_seleccionarCliente(${c.id})" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--gris-100);font-size:12px" onmouseover="this.style.background='var(--azul-light)'" onmouseout="this.style.background='#fff'">
      <div style="font-weight:600">${c.nombre||'—'}</div>
      <div style="font-size:11px;color:var(--gris-500)">${c.nif||''}${c.nif&&c.telefono?' · ':''}${c.telefono||''}</div>
    </div>`).join('');
  }
  drop.style.display = 'block';
}
function de_seleccionarCliente(id) {
  const c = clientes.find(x=>x.id===parseInt(id));
  if (!c) return;
  const hidden = document.getElementById('de_cliente');
  const search = document.getElementById('de_cliente_search');
  if (hidden) hidden.value = c.id;
  if (search) search.value = c.nombre || '';
  de_actualizarCliente(c.id);
  const drop = document.getElementById('de_cliente_drop');
  if (drop) drop.style.display = 'none';
}
function de_setClienteSel(id) {
  const c = clientes.find(x=>x.id===parseInt(id));
  const hidden = document.getElementById('de_cliente');
  const search = document.getElementById('de_cliente_search');
  if (hidden) hidden.value = c ? c.id : '';
  if (search) search.value = c ? (c.nombre||'') : '';
  de_actualizarCliente(c ? c.id : '');
}
function de_navegarClientes(ev) {
  const drop = document.getElementById('de_cliente_drop');
  if (!drop || drop.style.display === 'none') return;
  const items = drop.querySelectorAll('[data-cli-id]');
  if (!items.length) return;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    _deClienteHiIdx = Math.min(_deClienteHiIdx + 1, items.length - 1);
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    _deClienteHiIdx = Math.max(_deClienteHiIdx - 1, 0);
  } else if (ev.key === 'Enter') {
    if (_deClienteHiIdx >= 0 && items[_deClienteHiIdx]) {
      ev.preventDefault();
      de_seleccionarCliente(items[_deClienteHiIdx].dataset.cliId);
    }
    return;
  } else if (ev.key === 'Escape') {
    drop.style.display = 'none';
    return;
  } else {
    return;
  }
  items.forEach((el, i) => {
    el.style.background = i === _deClienteHiIdx ? 'var(--azul-light)' : '#fff';
  });
  if (items[_deClienteHiIdx]) items[_deClienteHiIdx].scrollIntoView({ block:'nearest' });
}
// Cerrar dropdown al clicar fuera
document.addEventListener('click', (e) => {
  const drop = document.getElementById('de_cliente_drop');
  const search = document.getElementById('de_cliente_search');
  if (!drop || !search) return;
  if (drop.style.display === 'none') return;
  if (!drop.contains(e.target) && e.target !== search) {
    drop.style.display = 'none';
  }
});

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

function de_removeLinea(i) {
  // Si es un servicio, eliminar también sus sub-líneas
  if (deLineas[i].tipo === 'servicio') {
    let count = 1;
    while (i + count < deLineas.length && deLineas[i + count].tipo === 'srv_linea' && deLineas[i + count].parent_srv_idx === i) {
      count++;
    }
    deLineas.splice(i, count);
  } else {
    deLineas.splice(i, 1);
  }
  de_renderLineas();
}

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

  // ═══ SERVICIO COMPUESTO: cargar sub-líneas ═══
  if (a.tipo === 'servicio') {
    deLineas[lineaIdx].tipo = 'servicio';
    deLineas[lineaIdx].srv_collapsed = false;
    deLineas[lineaIdx].servicio_id = a.id;
    // Eliminar sub-líneas previas de este servicio (por si se re-selecciona)
    _de_removeSrvLineas(lineaIdx);
    // Cargar líneas del servicio desde Supabase
    _de_loadSrvLineas(lineaIdx, a.id);
    toast(`🔧 Servicio: ${a.nombre}`,'info');
  } else {
    // Defer render to avoid blur/innerHTML race condition
    setTimeout(() => { de_renderLineas(); de_autoguardar(); }, 0);
    toast(`📦 ${a.codigo} — ${a.nombre}`,'info');
  }
  setTimeout(() => { _artSelecting = false; }, 300);
}

// ═══ SERVICIOS COMPUESTOS EN EDITOR ═══

/** Carga las sub-líneas de un servicio desde servicio_lineas y las inserta en deLineas */
async function _de_loadSrvLineas(parentIdx, servicioId) {
  try {
    const { data, error } = await sb.from('servicio_lineas')
      .select('*, articulo:articulo_id(nombre, codigo, precio_venta)')
      .eq('servicio_id', servicioId)
      .eq('empresa_id', EMPRESA.id)
      .order('orden');
    if (error) { console.error('Error cargando srv_lineas:', error); de_renderLineas(); return; }
    if (!data || !data.length) { de_renderLineas(); de_autoguardar(); return; }
    // Insertar sub-líneas justo después del servicio padre
    const subLineas = data.map(sl => ({
      tipo: 'srv_linea',
      parent_srv_idx: parentIdx,
      desc: sl.articulo?.nombre || sl.descripcion || '',
      cant: sl.cantidad || 1,
      precio: sl.precio_unitario || sl.articulo?.precio_venta || 0,
      dto1: 0, dto2: 0, dto3: 0,
      iva: deConfig.conIva ? (prIvaDefault||21) : 0,
      articulo_id: sl.articulo_id || null,
      codigo: sl.articulo?.codigo || '',
      _srv_linea_id: sl.id
    }));
    deLineas.splice(parentIdx + 1, 0, ...subLineas);
    // Recalcular precio del servicio padre = suma de sub-líneas
    _de_recalcSrvPrecio(parentIdx);
    de_renderLineas();
    de_autoguardar();
  } catch(e) {
    console.error('Error en _de_loadSrvLineas:', e);
    de_renderLineas();
  }
}

/** Elimina las sub-líneas de un servicio padre en el índice dado */
function _de_removeSrvLineas(parentIdx) {
  let i = parentIdx + 1;
  while (i < deLineas.length && deLineas[i].tipo === 'srv_linea' && deLineas[i].parent_srv_idx === parentIdx) {
    deLineas.splice(i, 1);
  }
}

/** Recalcula el precio del servicio padre como suma de sus sub-líneas */
function _de_recalcSrvPrecio(parentIdx) {
  let total = 0;
  for (let i = parentIdx + 1; i < deLineas.length; i++) {
    if (deLineas[i].tipo !== 'srv_linea' || deLineas[i].parent_srv_idx !== parentIdx) break;
    const sl = deLineas[i];
    total += (sl.cant||0) * (sl.precio||0) * (1-(sl.dto1||0)/100) * (1-(sl.dto2||0)/100) * (1-(sl.dto3||0)/100);
  }
  deLineas[parentIdx].precio = Math.round(total*100)/100;
  deLineas[parentIdx].cant = 1;
}

/** Toggle expand/collapse de las sub-líneas de un servicio */
function de_toggleServicio(idx) {
  deLineas[idx].srv_collapsed = !deLineas[idx].srv_collapsed;
  de_renderLineas();
}

/** Re-inyecta sub-líneas de servicios al cargar un documento existente */
async function _de_reloadSrvLineas() {
  const servicios = [];
  deLineas.forEach((l, i) => {
    if (l.tipo === 'servicio' && l.articulo_id) {
      servicios.push({ idx: i, artId: l.articulo_id });
    }
  });
  // Cargar secuencialmente para mantener índices correctos (de atrás a adelante)
  for (let s = servicios.length - 1; s >= 0; s--) {
    const { idx, artId } = servicios[s];
    deLineas[idx].srv_collapsed = false;
    try {
      const { data } = await sb.from('servicio_lineas')
        .select('*, articulo:articulo_id(nombre, codigo, precio_venta)')
        .eq('servicio_id', artId)
        .eq('empresa_id', EMPRESA.id)
        .order('orden');
      if (data && data.length) {
        const subLineas = data.map(sl => ({
          tipo: 'srv_linea',
          parent_srv_idx: idx,
          desc: sl.articulo?.nombre || sl.descripcion || '',
          cant: sl.cantidad || 1,
          precio: sl.precio_unitario || sl.articulo?.precio_venta || 0,
          dto1: 0, dto2: 0, dto3: 0,
          iva: deConfig.conIva ? (prIvaDefault||21) : 0,
          articulo_id: sl.articulo_id || null,
          codigo: sl.articulo?.codigo || '',
          _srv_linea_id: sl.id
        }));
        deLineas.splice(idx + 1, 0, ...subLineas);
      }
    } catch(e) { console.warn('Error recargando srv_lineas para idx', idx, e); }
  }
  de_renderLineas();
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
  // Si es una sub-línea de servicio, recalcular precio del padre
  if (deLineas[i].tipo === 'srv_linea') {
    _de_recalcSrvPrecio(deLineas[i].parent_srv_idx);
  }
  de_renderLineas();
  de_autoguardar();
}

/** Elimina una sub-línea individual de un servicio */
function de_removeSrvLinea(i) {
  const parentIdx = deLineas[i].parent_srv_idx;
  deLineas.splice(i, 1);
  // Actualizar parent_srv_idx de las sub-líneas restantes que apuntan al mismo padre
  for (let j = parentIdx + 1; j < deLineas.length; j++) {
    if (deLineas[j].tipo === 'srv_linea' && deLineas[j].parent_srv_idx === parentIdx) continue;
    if (deLineas[j].tipo === 'srv_linea') break; // ya pasamos a otro servicio
    break;
  }
  _de_recalcSrvPrecio(parentIdx);
  de_renderLineas();
  de_autoguardar();
}

/** Añade una nueva sub-línea vacía a un servicio */
function de_addSrvLinea(parentIdx) {
  // Encontrar la última sub-línea de este servicio
  let insertAt = parentIdx + 1;
  while (insertAt < deLineas.length && deLineas[insertAt].tipo === 'srv_linea' && deLineas[insertAt].parent_srv_idx === parentIdx) {
    insertAt++;
  }
  deLineas.splice(insertAt, 0, {
    tipo: 'srv_linea',
    parent_srv_idx: parentIdx,
    desc: '',
    cant: 1,
    precio: 0,
    dto1: 0, dto2: 0, dto3: 0,
    iva: deConfig.conIva ? (prIvaDefault||21) : 0,
    articulo_id: null,
    codigo: ''
  });
  de_renderLineas();
  // Focus en el input de descripción de la nueva sub-línea
  setTimeout(() => {
    const inp = document.querySelector(`input[data-srvlinea-idx="${insertAt}"]`);
    if (inp) inp.focus();
  }, 50);
}

/** Autocompletado en sub-líneas de servicio: busca artículos y los asigna */
function de_buscarArtSrvLinea(input, lineaIdx) {
  input.dataset.lineaIdx = lineaIdx;
  if (typeof acBuscarArticulo === 'function') {
    acBuscarArticulo(input, _de_onSelectArtSrvLinea, 'precio_venta');
  }
}

function _de_onSelectArtSrvLinea(lineaIdx, a) {
  _artSelecting = true;
  deLineas[lineaIdx].desc = a.nombre || '';
  deLineas[lineaIdx].precio = a.precio_venta || 0;
  deLineas[lineaIdx].articulo_id = a.id;
  deLineas[lineaIdx].codigo = a.codigo || '';
  const parentIdx = deLineas[lineaIdx].parent_srv_idx;
  _de_recalcSrvPrecio(parentIdx);
  setTimeout(() => { de_renderLineas(); de_autoguardar(); }, 0);
  toast(`📦 ${a.codigo} — ${a.nombre}`,'info');
  setTimeout(() => { _artSelecting = false; }, 300);
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
    } else if (l.tipo === 'servicio') {
      // ═══ SERVICIO COMPUESTO: fila padre con expand/collapse ═══
      const dto1 = showDto ? (l.dto1||0) : 0;
      const dto2 = showDto ? (l.dto2||0) : 0;
      const dto3 = showDto ? (l.dto3||0) : 0;
      const sub = l.cant*l.precio*(1-dto1/100)*(1-dto2/100)*(1-dto3/100);
      const iva = showIva ? (l.iva||0) : 0;
      const iv = sub*(iva/100);
      base+=sub; ivaT+=iv; secBase+=sub; secIva+=iv;
      if (parentCollapsed || subCollapsed) return;

      const collapsed = !!l.srv_collapsed;
      const arrow = collapsed ? '▶' : '▼';
      const ivaFixed = (tiposIva||[{porcentaje:21},{porcentaje:10},{porcentaje:4},{porcentaje:0}])
        .map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('');
      const inSub = secType==='subcapitulo';
      const inCap = secActual>=0;
      const padLeft = inSub ? 'padding-left:48px' : (inCap ? 'padding-left:28px' : '');

      html += `<tr draggable="true" ondragstart="de_dragStart(event,${i})" ondragend="de_dragEnd(event)" ondragover="de_dragOver(event,${i})" ondrop="de_drop(event,${i})" style="border-top:2px solid var(--verde,#22c55e);background:#f0fdf4;cursor:grab">
        <td style="padding:6px 4px;text-align:center;color:var(--gris-400);cursor:grab;font-size:11px;user-select:none" title="Arrastrar servicio">⠿</td>
        <td style="padding:6px 10px;${padLeft}">
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="de_toggleServicio(${i})" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--verde,#22c55e);padding:2px 4px;min-width:18px" title="${collapsed?'Expandir componentes':'Contraer componentes'}">${arrow}</button>
            <span style="font-size:14px">🔧</span>
            <span style="font-weight:600;font-size:13px;color:#15803d;flex:1">${l.desc||'Servicio'}</span>
          </div>
        </td>
        <td style="padding:6px 5px">
          <input type="number" value="${l.cant}" min="0.01" step="0.01"
            onchange="de_updateLinea(${i},'cant',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>
        <td style="padding:6px 5px;text-align:right;font-size:12px;font-weight:600;color:#15803d">${fmtE(l.precio)}</td>
        ${showDto?`<td style="padding:6px 5px">
          <input type="number" value="${l.dto1||0}" min="0" max="100" step="0.1"
            onchange="de_updateLinea(${i},'dto1',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td><td style="padding:6px 5px">
          <input type="number" value="${l.dto2||0}" min="0" max="100" step="0.1"
            onchange="de_updateLinea(${i},'dto2',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td><td style="padding:6px 5px">
          <input type="number" value="${l.dto3||0}" min="0" max="100" step="0.1"
            onchange="de_updateLinea(${i},'dto3',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>`:''}
        ${showIva?`<td style="padding:6px 5px">
          <select onchange="de_updateLinea(${i},'iva',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
            ${ivaFixed}
          </select>
        </td>`:''}
        <td style="padding:6px 10px;text-align:right;font-weight:700;font-size:13px;color:#15803d">${fmtE(sub+iv)}</td>
        <td style="text-align:center"><button onclick="de_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:14px;padding:2px 4px">✕</button></td>
      </tr>`;

    } else if (l.tipo === 'srv_linea') {
      // ═══ SUB-LÍNEA DE SERVICIO: editable, visible si padre no está colapsado ═══
      const parentIdx = l.parent_srv_idx;
      const parentLine = deLineas[parentIdx];
      if (!parentLine || parentLine.srv_collapsed || parentCollapsed || subCollapsed) return;

      const slSub = l.cant * l.precio;
      const inSub = secType==='subcapitulo';
      const inCap = secActual>=0;
      const basePad = inSub ? 78 : (inCap ? 58 : 38);

      // Comprobar si la siguiente línea ya NO es srv_linea del mismo padre → es la última, añadir botón +
      const isLast = (i+1 >= deLineas.length || deLineas[i+1].tipo !== 'srv_linea' || deLineas[i+1].parent_srv_idx !== parentIdx);

      html += `<tr style="border-top:1px dashed #bbf7d0;background:#f7fef9">
        <td style="padding:4px 4px;text-align:center;color:#86efac;font-size:9px">┗</td>
        <td style="padding:4px 10px;padding-left:${basePad}px">
          <input value="${l.desc||''}" placeholder="Código o descripción..."
            oninput="de_buscarArtSrvLinea(this,${i})"
            onchange="de_updateLinea(${i},'desc',this.value)"
            onfocus="if(this.value.length>=1)de_buscarArtSrvLinea(this,${i})"
            onblur="setTimeout(()=>{const d=document.getElementById('acArticulos');if(d)d.style.display='none'},200)"
            onkeydown="de_acKeydown(event,${i})"
            autocomplete="off"
            data-linea-idx="${i}"
            data-srvlinea-idx="${i}"
            style="width:100%;border:none;outline:none;font-size:12px;background:transparent;color:#4b5563">
        </td>
        <td style="padding:4px 5px">
          <input type="number" value="${l.cant}" min="0.01" step="0.01"
            onchange="de_updateLinea(${i},'cant',this.value)"
            style="width:100%;border:1px solid #d1fae5;border-radius:4px;padding:3px 5px;font-size:11px;text-align:right;outline:none;background:#f7fef9">
        </td>
        <td style="padding:4px 5px">
          <input type="number" value="${l.precio}" min="0" step="0.01"
            onchange="de_updateLinea(${i},'precio',this.value)"
            style="width:100%;border:1px solid #d1fae5;border-radius:4px;padding:3px 5px;font-size:11px;text-align:right;outline:none;background:#f7fef9">
        </td>
        ${showDto?'<td></td><td></td><td></td>':''}
        ${showIva?'<td></td>':''}
        <td style="padding:4px 10px;text-align:right;font-size:11px;color:#6b7280">${fmtE(slSub)}</td>
        <td style="text-align:center"><button onclick="de_removeSrvLinea(${i})" style="background:none;border:none;cursor:pointer;color:#f87171;font-size:12px;padding:2px 4px" title="Quitar componente">✕</button></td>
      </tr>`;
      // Botón + después de la última sub-línea
      if (isLast) {
        html += `<tr style="background:#f0fdf4">
          <td></td>
          <td colspan="${totalCols-2}" style="padding:2px 10px;padding-left:${basePad}px">
            <button onclick="de_addSrvLinea(${parentIdx})" style="background:none;border:1px dashed #86efac;border-radius:4px;cursor:pointer;color:#22c55e;font-size:11px;padding:3px 10px;display:flex;align-items:center;gap:4px" title="Añadir componente al servicio">
              <span style="font-size:14px">+</span> Añadir componente
            </button>
          </td>
          <td></td>
        </tr>`;
      }

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
async function de_ensureVersionTable(tableName, forceRecheck) {
  const tbl = tableName || 'presupuesto_versiones';
  if (!forceRecheck && _versionTableCache[tbl] !== undefined) return _versionTableCache[tbl];
  try {
    const { error } = await sb.from(tbl).select('id').limit(1);
    _versionTableCache[tbl] = !error;
    if (error) console.warn('⚠️ Tabla '+tbl+' no accesible:', error.message);
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
  // Filtrar srv_linea (sub-líneas informativas de servicios, no se guardan)
  const lineas = deLineas.filter(l=> l.tipo !== 'srv_linea' && (l.desc||l.precio>0||isChap(l.tipo)));
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
  if (cfg.tipo==='presupuesto') datos.titulo = _tituloVal;
  else if (cfg.tipo==='albaran') datos.referencia = _tituloVal;
  // facturas: no tienen columna titulo ni referencia — el título se ignora
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

  // Auto-actualizar fecha a hoy en cada guardado (nueva versión/borrador)
  if (cfg.editId && (cfg.tipo === 'factura' || cfg.tipo === 'presupuesto')) {
    const hoy = new Date().toISOString().split('T')[0];
    datos.fecha = hoy;
    const fechaInput = document.getElementById('de_fecha');
    if (fechaInput) fechaInput.value = hoy;
  }

  // Number assignment logic for presupuestos:
  // - Borrador: NO number (stays as "(sin asignar)")
  // - Pendiente/any other: assign number
  let isNew = !cfg.editId;
  const yaTieneBorrador = (datos.numero||'').startsWith('BORR-');
  const needsNumber = datos.numero === '(sin asignar)' || !datos.numero;
  // Si ya tiene número BORR- y estamos re-guardando borrador, NO regenerar número
  const needsNewBorrNumber = !datos.numero || datos.numero === '(sin asignar)';
  if ((needsNumber || yaTieneBorrador) && estado !== 'borrador') {
    datos.numero = await generarNumeroDoc(cfg.tipo);
    document.getElementById('de_numero').value = datos.numero;
    document.getElementById('de_numero_bar').textContent = datos.numero;
  } else if (estado === 'borrador' && needsNewBorrNumber) {
    // Borrador NUEVO: numeración correlativa para facturas, timestamp para el resto
    if (cfg.tipo === 'factura' && typeof _generarNumeroBorrador === 'function') {
      datos.numero = await _generarNumeroBorrador();
    } else {
      datos.numero = 'BORR-' + Date.now().toString(36).toUpperCase();
    }
    document.getElementById('de_numero_bar').textContent = '(borrador ' + datos.numero + ')';
    // Borrador: fecha optional
    if (!datos.fecha) datos.fecha = null;
  } else if (estado === 'borrador' && yaTieneBorrador) {
    // Borrador existente: mantener número, solo actualizar barra
    document.getElementById('de_numero_bar').textContent = '(borrador ' + datos.numero + ')';
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

  // Versionado de borradores de factura
  if (cfg.tipo === 'factura' && estado === 'borrador' && savedId && typeof _guardarVersionBorrador === 'function') {
    try {
      // Contar versiones existentes con select simple
      const { data: versExist } = await sb.from('factura_versiones')
        .select('version').eq('factura_id', savedId).order('version', { ascending: false }).limit(1);
      const maxVer = (versExist && versExist.length) ? versExist[0].version : 0;
      const vNum = maxVer + 1;
      await _guardarVersionBorrador(savedId, { ...datos, id: savedId }, vNum);
      console.log('Versión borrador v' + vNum + ' guardada para factura ' + savedId);
    } catch(e) { console.warn('Versionado borrador error:', e); }
  }
  registrarAudit(isNew?'crear':'modificar', cfg.tipo, savedId, (isNew?'Nuevo ':'Editado ')+cfg.tipo+' '+datos.numero+' — estado: '+datos.estado+(datos.version?' — v'+datos.version:''));
  const _toastMsg = isNew
    ? (datos.estado === 'borrador' ? 'Borrador ' + datos.numero + ' guardado' : cfg.titulo + ' ' + datos.numero + ' creado')
    : 'Borrador ' + datos.numero + ' guardado';
  toast(cfg.ico+' '+_toastMsg+' ✓','success');

  // Recargar lista correspondiente
  if (cfg.tipo==='presupuesto') await loadPresupuestos();
  if (cfg.tipo==='albaran') await loadAlbaranes();
  if (cfg.tipo==='factura' && typeof loadFacturas === 'function') await loadFacturas();
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

function de_emitirFactura() {
  // Modal personalizado para confirmar emisión
  const overlay = document.createElement('div');
  overlay.id = '_emitirOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:32px 36px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center">
      <div style="font-size:48px;margin-bottom:12px">🧾</div>
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111">Emitir factura definitiva</h2>
      <p style="color:#555;font-size:15px;line-height:1.5;margin:0 0 8px">Se asignará un número correlativo <strong style="color:#059669">FAC-XXXX</strong> y ya no se podrá editar.</p>
      <p style="color:#b91c1c;font-size:13px;font-weight:600;margin:0 0 24px">⚠️ Esta acción no se puede deshacer</p>
      <div style="display:flex;gap:12px;justify-content:center">
        <button onclick="document.getElementById('_emitirOverlay').remove()" style="padding:10px 24px;border-radius:10px;border:1px solid #ddd;background:#f5f5f5;color:#555;font-size:15px;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="document.getElementById('_emitirOverlay').remove();_doEmitirFactura()" style="padding:10px 28px;border-radius:10px;border:none;background:#059669;color:white;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(5,150,105,.4)">Emitir factura</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function _doEmitirFactura() {
  // Guardar primero como borrador por si hay cambios sin guardar
  const id = await de_guardar('borrador');
  if (!id) return;
  // Ahora emitir usando la función de facturas.js
  if (typeof emitirFacturaDefinitiva === 'function') {
    await emitirFacturaDefinitiva(id, { skipConfirm: true });
  } else {
    // Fallback: guardar directamente como pendiente
    await de_guardar('pendiente');
  }
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
  const maxVer = vers.length ? vers[0].version : 0;
  const esFact = deConfig.tipo === 'factura';
  vers.forEach(v => {
    const d = v.datos || v.snapshot || {};
    const fecha = new Date(v.created_at).toLocaleDateString('es-ES');
    const hora = new Date(v.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    const esUltima = v.version === maxVer;
    // Facturas: usar funciones propias de facturas.js; presupuestos: las de presupuestos.js
    const fnVer = esFact
      ? `_verVersionBorrador(${v.id})`
      : `abrirVersionEnEditor(${deConfig.editId},${v.id})`;
    const fnRestore = esFact
      ? `_restaurarVersionBorrador(${deConfig.editId},${v.id})`
      : `restaurarVersionDirecta(${deConfig.editId},${v.id})`;
    items += `<div class="hov-bg" style="padding:8px 12px;border-bottom:1px solid var(--gris-100);display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:12px">v${v.version}${esUltima?' <span style="font-size:10px;background:var(--azul);color:white;padding:1px 6px;border-radius:4px">actual</span>':''} <span style="font-weight:400;color:var(--gris-400);font-size:11px">${fecha} ${hora}</span></div>
        <div style="font-size:11px;color:var(--gris-500)">${d.cliente_nombre||'—'} — ${fmtE(d.total||0)}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();document.getElementById('de_ver_dropdown').remove();${fnVer}" title="Ver (solo lectura)" style="font-size:12px;padding:3px 6px">👁️</button>
        ${!esUltima?`<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();document.getElementById('de_ver_dropdown').remove();${fnRestore}" title="Restaurar" style="font-size:12px;padding:3px 6px">♻️</button>`:''}
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
  const { data: v } = await sb.from(vTabla).select('*').eq('id', versionId).single();
  if (!v) { toast('Error cargando versión','error'); return; }
  const d = v.datos || v.snapshot || {};
  // Load version data into editor
  de_setClienteSel(d.cliente_id);
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
