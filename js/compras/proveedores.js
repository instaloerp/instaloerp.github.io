// ═══════════════════════════════════════════════
// Supplier CRUD functions - Proveedores
// ═══════════════════════════════════════════════

let provActualId = null;
let provVista = 'lista';

function setProvVista(v) {
  provVista = v;
  document.getElementById('provVista-lista').style.display = v === 'ficha' ? 'none' : 'block';
  document.getElementById('provVista-ficha').style.display = v === 'ficha' ? 'block' : 'none';
  if (v === 'lista') {
    document.getElementById('pgTitle').textContent = '🏭 Proveedores';
    document.getElementById('pgSub').textContent = _fechaHoraActual();
    const tb = document.getElementById('topbarBtns');
    if (tb) tb.innerHTML = '';
    provActualId = null;
  }
}

function renderProveedores(list) {
  document.getElementById('provCount').textContent=`${proveedores.length} proveedores`;
  document.getElementById('provTable').innerHTML = list.length ?
    list.map(p=>`<tr style="cursor:pointer" onclick="abrirFichaProveedor(${p.id})">
      <td><div style="font-weight:700">${p.nombre}</div><div style="font-size:11px;color:var(--gris-400)">${p.web||''}</div></td>
      <td style="font-family:monospace;font-size:12px">${p.cif||'—'}</td>
      <td>${p.telefono||'—'}</td>
      <td>${p.email_pedidos||p.email||'—'}</td>
      <td>${p.municipio||'—'}</td>
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="editProv(${p.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delProv(${p.id})">🗑️</button>
      </div></td>
    </tr>`).join('') :
    '<tr><td colspan="6"><div class="empty"><div class="ei">🏭</div><h3>Sin proveedores</h3></div></td></tr>';
}

function editProv(id) {
  const p=proveedores.find(x=>x.id===id); if(!p) return;
  document.getElementById('pv_id').value=p.id;
  setVal({pv_nombre:p.nombre,pv_cif:p.cif||'',pv_tel:p.telefono||'',pv_email_ped:p.email_pedidos||'',pv_email:p.email||'',pv_web:p.web||'',pv_dir:p.direccion||'',pv_muni:p.municipio||'',pv_cp:p.cp||'',pv_prov:p.provincia||'',pv_dias:p.dias_pago||30,pv_notas:p.observaciones||''});
  // Poblar selector de banco
  poblarBancoProveedor(p.banco_predeterminado_id);
  document.getElementById('mProvTit').textContent='Editar Proveedor';
  openModal('mProveedor');
}

function editProvActual() {
  if (provActualId) editProv(provActualId);
}

function poblarBancoProveedor(selectedId) {
  const sel = document.getElementById('pv_banco');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>' +
    (typeof cuentasBancarias !== 'undefined' ? cuentasBancarias : []).map(b =>
      `<option value="${b.id}" ${b.id == selectedId ? 'selected' : ''}>${b.nombre}${b.iban ? ' — ' + b.iban.slice(-8) : ''}</option>`
    ).join('');
}

async function saveProveedor() {
  const nombre=document.getElementById('pv_nombre').value.trim();
  if(!nombre){toast('Introduce el nombre','error');return;}
  const id=document.getElementById('pv_id').value;
  const bancoId = document.getElementById('pv_banco')?.value || null;
  const banco = (typeof cuentasBancarias !== 'undefined' ? cuentasBancarias : []).find(b => b.id == bancoId);
  const obj={empresa_id:EMPRESA.id,nombre,cif:v('pv_cif'),telefono:v('pv_tel'),email_pedidos:v('pv_email_ped'),email:v('pv_email'),web:v('pv_web'),direccion:v('pv_dir'),municipio:v('pv_muni'),cp:v('pv_cp'),provincia:v('pv_prov'),dias_pago:parseInt(v('pv_dias'))||30,observaciones:v('pv_notas'),banco_predeterminado_id:bancoId?parseInt(bancoId):null,banco_predeterminado_nombre:banco?banco.nombre:null};
  if(id){await sb.from('proveedores').update(obj).eq('id',id);}
  else{await sb.from('proveedores').insert(obj);}
  closeModal('mProveedor');
  const {data}=await sb.from('proveedores').select('*').eq('empresa_id',EMPRESA.id).order('nombre');
  proveedores=data||[]; renderProveedores(proveedores);
  toast('Proveedor guardado ✓','success');
  // Si estábamos en la ficha, recargar
  if (provActualId && id == provActualId) abrirFichaProveedor(provActualId);
}

async function delProv(id) {
  const ok = await confirmModal({titulo:'Eliminar proveedor',mensaje:'¿Eliminar este proveedor?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!ok) return;
  await sb.from('proveedores').delete().eq('id',id);
  proveedores=proveedores.filter(p=>p.id!==id); renderProveedores(proveedores);
  if (provActualId === id) setProvVista('lista');
  toast('Proveedor eliminado','info');
}

// ═══════════════════════════════════════════════
//  CUENTAS BANCARIAS INLINE — FICHA PROVEEDOR
//  Múltiples cuentas con predeterminada + mandato SEPA
// ═══════════════════════════════════════════════
let _cbeProvEditId = null;

function _getCuentasProv(provId) {
  return (typeof cuentasBancariasEntidad !== 'undefined' ? cuentasBancariasEntidad : [])
    .filter(cb => cb.tipo_entidad === 'proveedor' && cb.entidad_id === provId);
}

function _renderFichaProvBanco(p) {
  const el = document.getElementById('fichaProvBanco');
  if (!el) return;
  const cuentas = _getCuentasProv(p.id);

  if (cuentas.length === 0) {
    el.innerHTML = `
      <div style="margin-top:10px;text-align:center">
        <button onclick="_nuevaCuentaProv()" style="font-size:11px;color:var(--azul);background:var(--azul-light,#e8f0fe);border:1px dashed var(--azul);cursor:pointer;padding:8px 16px;border-radius:8px;width:100%">
          🏦 Añadir cuenta bancaria / IBAN
        </button>
      </div>`;
    return;
  }

  let html = `<div style="margin-top:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;letter-spacing:0.5px">🏦 Cuentas bancarias (${cuentas.length})</span>
      <button onclick="_nuevaCuentaProv()" style="font-size:10px;color:var(--verde-dark,#16a34a);background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:4px" title="Añadir otra cuenta">➕ Nueva</button>
    </div>`;

  cuentas.forEach(cb => {
    const ibanFmt = cb.iban ? cb.iban.replace(/(.{4})/g,'$1 ').trim() : '';
    const esPred = cb.predeterminada;
    const borderColor = esPred ? 'var(--azul)' : 'var(--gris-100)';
    let mandatoTag = '';
    if (cb.mandato_sepa_estado === 'firmado') {
      mandatoTag = '<span style="font-size:9px;padding:1px 5px;background:#dcfce7;color:#166534;border-radius:3px;font-weight:600">SEPA ✅</span>';
    } else {
      mandatoTag = '<span style="font-size:9px;padding:1px 5px;background:#fef3c7;color:#92400e;border-radius:3px;font-weight:600">SEPA ⚠️</span>';
    }

    html += `<div style="padding:8px 10px;background:var(--gris-50);border-radius:7px;border:1.5px solid ${borderColor};margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:5px">
          ${esPred?'<span style="font-size:9px;padding:1px 5px;background:var(--azul);color:white;border-radius:3px;font-weight:700">PREDETERMINADA</span>':''}
          ${mandatoTag}
          <span style="font-size:10px;color:var(--gris-400)">${cb.banco_entidad||''}</span>
        </div>
        <div style="display:flex;gap:2px">
          ${!esPred?`<button onclick="_setPredeterminadaProv(${cb.id})" style="font-size:9px;color:var(--azul);background:none;border:none;cursor:pointer;padding:1px 4px" title="Hacer predeterminada">⭐</button>`:''}
          <button onclick="_editarCuentaProv(${cb.id})" style="font-size:9px;color:var(--azul);background:none;border:none;cursor:pointer;padding:1px 4px" title="Editar">✏️</button>
          <button onclick="_eliminarCuentaProv(${cb.id})" style="font-size:9px;color:var(--rojo);background:none;border:none;cursor:pointer;padding:1px 4px" title="Eliminar">🗑️</button>
        </div>
      </div>
      <div style="font-family:monospace;font-size:11.5px;font-weight:600;letter-spacing:0.5px;color:var(--gris-700)">${ibanFmt}</div>
      ${cb.titular?`<div style="font-size:10.5px;color:var(--gris-500);margin-top:2px">Titular: ${cb.titular}</div>`:''}
      ${cb.mandato_sepa_estado!=='firmado'?`<div style="margin-top:4px"><button onclick="_gestionarMandatoCuentaProv(${cb.id})" style="font-size:9.5px;padding:3px 8px;border:1px solid #f59e0b;background:#fffbeb;border-radius:4px;cursor:pointer;color:#92400e;font-weight:600">📄 Gestionar mandato SEPA</button></div>`:''}
    </div>`;
  });

  html += '</div>';
  el.innerHTML = html;
}

function _nuevaCuentaProv() { _cbeProvEditId = null; _mostrarFormCuentaProv(null); }
function _editarCuentaProv(cbeId) { _cbeProvEditId = cbeId; _mostrarFormCuentaProv((cuentasBancariasEntidad||[]).find(x=>x.id===cbeId)); }

function _mostrarFormCuentaProv(cb) {
  const p = proveedores.find(x => x.id === provActualId);
  if (!p) return;
  const el = document.getElementById('fichaProvBanco');
  if (!el) return;
  const esNueva = !cb;
  const titularVal = cb ? (cb.titular||p.nombre) : p.nombre;
  const ibanVal = cb ? cb.iban.replace(/(.{4})/g,'$1 ').trim() : '';
  const bicVal = cb ? (cb.bic||'') : '';
  const entidadVal = cb ? (cb.banco_entidad||'') : '';
  el.innerHTML = `
    <div style="margin-top:10px;padding:12px;background:var(--gris-50);border-radius:8px;border:1px solid var(--azul,#4285f4)">
      <div style="font-size:10px;font-weight:700;color:var(--azul);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">🏦 ${esNueva?'Nueva cuenta bancaria':'Editar cuenta'}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div>
          <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">IBAN</label>
          <div style="display:flex;gap:4px;align-items:center">
            <input id="fip_iban" type="text" value="${ibanVal}" placeholder="ES00 0000 0000 0000 0000 0000" oninput="validarIBANLive(this)" style="flex:1;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px;font-family:monospace;letter-spacing:0.5px">
            <span id="fip_iban_status" style="font-size:14px;min-width:18px;text-align:center"></span>
          </div>
          <div id="fip_iban_msg" style="font-size:10px;margin-top:2px;min-height:14px"></div>
        </div>
        <div style="display:flex;gap:6px">
          <div style="flex:1">
            <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">BIC/SWIFT</label>
            <input id="fip_bic" type="text" value="${bicVal}" placeholder="BSCHESMMXXX" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px">
          </div>
          <div style="flex:1">
            <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">Entidad bancaria</label>
            <input id="fip_banco_entidad" type="text" value="${entidadVal}" placeholder="Nombre del banco" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px">
          </div>
        </div>
        <div>
          <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">Titular de la cuenta</label>
          <input id="fip_banco_titular" type="text" value="${titularVal}" placeholder="Nombre del titular" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px">
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
        <button onclick="_cancelarCuentaProv()" style="font-size:11px;padding:6px 14px;border:1px solid var(--gris-200);background:white;border-radius:6px;cursor:pointer;color:var(--gris-600)">Cancelar</button>
        <button onclick="_guardarCuentaProv()" style="font-size:11px;padding:6px 14px;border:none;background:var(--azul);color:white;border-radius:6px;cursor:pointer;font-weight:600">💾 Guardar</button>
      </div>
    </div>`;
  const ibanEl = document.getElementById('fip_iban');
  if (ibanEl) { if (ibanEl.value.trim()) validarIBANLive(ibanEl); else ibanEl.focus(); }
}

function _cancelarCuentaProv() { const p = proveedores.find(x => x.id === provActualId); if (p) _renderFichaProvBanco(p); }

async function _guardarCuentaProv() {
  const iban = document.getElementById('fip_iban').value.replace(/\s/g,'').toUpperCase() || null;
  const bic = document.getElementById('fip_bic').value.trim().toUpperCase() || null;
  const banco_entidad = document.getElementById('fip_banco_entidad').value.trim() || null;
  const titular = document.getElementById('fip_banco_titular').value.trim() || null;

  if (!iban) { toast('Introduce un IBAN', 'error'); return; }
  if (iban && typeof _validarIBAN === 'function' && !_validarIBAN(iban)) {
    const okIban = await confirmModal({titulo:'IBAN no válido',mensaje:'El IBAN no parece válido. ¿Guardar igualmente?',aviso:'Verifica el IBAN antes de continuar',btnOk:'Guardar igualmente',colorOk:'#dc2626'}); if (!okIban) return;
  }

  const cuentasExist = _getCuentasProv(provActualId);
  const esNueva = !_cbeProvEditId;
  const esPrimera = esNueva && cuentasExist.length === 0;

  if (_cbeProvEditId) {
    const { error } = await sb.from('cuentas_bancarias_entidad').update({ iban, bic, banco_entidad, titular }).eq('id', _cbeProvEditId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    const idx = cuentasBancariasEntidad.findIndex(x => x.id === _cbeProvEditId);
    if (idx >= 0) Object.assign(cuentasBancariasEntidad[idx], { iban, bic, banco_entidad, titular });
    toast('Cuenta actualizada ✓', 'success');
  } else {
    const obj = {
      empresa_id: EMPRESA.id, tipo_entidad: 'proveedor', entidad_id: provActualId,
      iban, bic, banco_entidad, titular,
      predeterminada: esPrimera
    };
    const { data, error } = await sb.from('cuentas_bancarias_entidad').insert(obj).select();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (data && data[0]) cuentasBancariasEntidad.push(data[0]);
    toast('Cuenta añadida ✓', 'success');

    if (esPrimera) {
      await sb.from('proveedores').update({ iban, bic, banco_entidad }).eq('id', provActualId);
      const pi = proveedores.findIndex(x => x.id === provActualId);
      if (pi >= 0) Object.assign(proveedores[pi], { iban, bic, banco_entidad });
    }
  }

  const p = proveedores.find(x => x.id === provActualId);
  _renderFichaProvBanco(p);

  if (esNueva) {
    setTimeout(async () => {
      const okSepa = await confirmModal({titulo:'Mandato SEPA',mensaje:'Cuenta bancaria guardada.\n\nPara autorizar adeudos directos necesitas un mandato SEPA.',btnOk:'Gestionar mandato SEPA',btnCancel:'Ahora no'});
      if (okSepa && typeof generarMandatoSEPA === 'function') generarMandatoSEPA('proveedor');
    }, 300);
  }
}

async function _setPredeterminadaProv(cbeId) {
  const cuentas = _getCuentasProv(provActualId);
  for (const cb of cuentas) {
    if (cb.predeterminada) {
      await sb.from('cuentas_bancarias_entidad').update({ predeterminada: false }).eq('id', cb.id);
      cb.predeterminada = false;
    }
  }
  await sb.from('cuentas_bancarias_entidad').update({ predeterminada: true }).eq('id', cbeId);
  const cb = cuentasBancariasEntidad.find(x => x.id === cbeId);
  if (cb) {
    cb.predeterminada = true;
    await sb.from('proveedores').update({ iban: cb.iban, bic: cb.bic, banco_entidad: cb.banco_entidad }).eq('id', provActualId);
    const pi = proveedores.findIndex(x => x.id === provActualId);
    if (pi >= 0) Object.assign(proveedores[pi], { iban: cb.iban, bic: cb.bic, banco_entidad: cb.banco_entidad });
  }
  toast('Cuenta predeterminada actualizada ⭐', 'success');
  const p = proveedores.find(x => x.id === provActualId);
  _renderFichaProvBanco(p);
}

async function _eliminarCuentaProv(cbeId) {
  const okElim = await confirmModal({titulo:'Eliminar cuenta',mensaje:'¿Eliminar esta cuenta bancaria?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!okElim) return;
  await sb.from('cuentas_bancarias_entidad').delete().eq('id', cbeId);
  cuentasBancariasEntidad = cuentasBancariasEntidad.filter(x => x.id !== cbeId);
  toast('Cuenta eliminada', 'info');
  const p = proveedores.find(x => x.id === provActualId);
  _renderFichaProvBanco(p);
}

function _gestionarMandatoCuentaProv(cbeId) {
  if (typeof generarMandatoSEPA === 'function') {
    window._mandatoCuentaId = cbeId;
    generarMandatoSEPA('proveedor');
  }
}

// ═══════════════════════════════════════════════
//  FICHA DE PROVEEDOR
// ═══════════════════════════════════════════════
function datoFichaProv(label, val) {
  return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;border-bottom:1px solid var(--gris-50)"><span style="color:var(--gris-400)">${label}</span><span style="font-weight:600;color:var(--gris-700);text-align:right;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${val}</span></div>`;
}

async function abrirFichaProveedor(id) {
  provActualId = id;
  _fichaProvArtsCargados = null; // Resetear cache de artículos
  const p = proveedores.find(x => x.id === id);
  if (!p) return;

  document.getElementById('fichaProvNombre').textContent = p.nombre;
  document.getElementById('pgTitle').textContent = p.nombre;
  document.getElementById('pgSub').textContent = _fechaHoraActual();
  const tb = document.getElementById('topbarBtns');
  if (tb) tb.innerHTML = '';
  setProvVista('ficha');

  // Avatar
  const av = document.getElementById('fichaProvAvatar');
  if (av) { av.style.background = avC(p.nombre); av.textContent = ini(p.nombre); }
  const sub = document.getElementById('fichaProvSub');
  if (sub) sub.textContent = [p.municipio, p.provincia].filter(Boolean).join(' · ');

  // Datos principales
  const fpName = (typeof formasPago !== 'undefined' ? formasPago : []).find(f => f.id === p.forma_pago_id)?.nombre || '—';
  document.getElementById('fichaProvDatos').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaProv('CIF/NIF', p.cif || '—')}
      ${datoFichaProv('Teléfono', p.telefono || '—')}
      ${datoFichaProv('Email pedidos', p.email_pedidos || '—')}
      ${datoFichaProv('Email facturación', p.email || '—')}
      ${datoFichaProv('Web', p.web || '—')}
      ${datoFichaProv('Dirección', p.direccion || '—')}
      ${datoFichaProv('Municipio', p.municipio || '—')}
      ${datoFichaProv('CP / Provincia', (p.cp || '') + ' ' + (p.provincia || ''))}
      ${datoFichaProv('Forma de pago', fpName)}
      ${datoFichaProv('Días de pago', p.dias_pago || 30)}
      ${p.observaciones ? `<div style="margin-top:6px;padding:8px;background:var(--gris-50);border-radius:7px;font-size:11.5px;color:var(--gris-600)">${p.observaciones}</div>` : ''}
    </div>
    <div id="fichaProvBanco"></div>`;
  _renderFichaProvBanco(p);

  // Regla de pago
  const bancoNombre = p.banco_predeterminado_nombre || '—';
  document.getElementById('fichaProvRegla').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaProv('Banco', bancoNombre)}
      ${datoFichaProv('Días vencimiento', p.dias_pago || 30)}
      ${datoFichaProv('Forma de pago', fpName)}
      <div style="margin-top:6px;font-size:10.5px;color:var(--gris-400)">Al crear facturas de este proveedor, el banco y vencimiento se asignarán automáticamente.</div>
    </div>`;

  // Cargar todo en paralelo
  const [peds, recs, fps, artProv] = await Promise.all([
    sb.from('pedidos_compra').select('*').eq('proveedor_id', id).eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false}).limit(20),
    sb.from('recepciones').select('*').eq('proveedor_id', id).eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false}).limit(20),
    sb.from('facturas_proveedor').select('*').eq('proveedor_id', id).eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false}).limit(20),
    sb.from('articulos_proveedores').select('id').eq('proveedor_id', id).eq('empresa_id', EMPRESA.id),
  ]);

  // KPIs
  document.getElementById('fpk-pedidos').textContent = (peds.data || []).length;
  document.getElementById('fpk-albaranes').textContent = (recs.data || []).length;
  document.getElementById('fpk-facturas').textContent = (fps.data || []).length;
  const pagosPend = (fps.data || []).filter(f => f.estado === 'pendiente');
  document.getElementById('fpk-pagospend').textContent = pagosPend.length;
  document.getElementById('fpk-articulos').textContent = (artProv.data || []).length;
  document.getElementById('fpk-notas').textContent = '0';

  const totalFact = (fps.data || []).reduce((s, f) => s + (f.total || 0), 0);
  const pendientePago = pagosPend.reduce((s, f) => s + (f.total || 0), 0);

  function resumenBar(items) {
    return `<div style="display:flex;gap:12px;padding:8px 10px;margin-bottom:10px;background:var(--gris-50);border-radius:8px;font-size:11.5px;flex-wrap:wrap">${items.join('')}</div>`;
  }
  function resumenItem(label, val, color) {
    return `<div><span style="color:var(--gris-400)">${label}:</span> <strong style="color:${color || 'var(--gris-900)'}">${val}</strong></div>`;
  }

  // Pedidos
  const pedHtml = (peds.data || []).length ?
    (peds.data || []).map(pc => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="previewDoc('pc',${pc.id})">
        <div><div style="font-weight:700;font-size:12.5px">${pc.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${pc.fecha ? new Date(pc.fecha).toLocaleDateString('es-ES') : '—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(pc.total)}</div><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--gris-100)">${pc.estado}</span></div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">🛒</div><p>Sin pedidos</p></div>';
  document.getElementById('ficha-prov-pedidos').innerHTML = pedHtml;

  // Albaranes (recepciones)
  const recHtml = (recs.data || []).length ?
    (recs.data || []).map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="previewDoc('rc',${r.id})">
        <div><div style="font-weight:700;font-size:12.5px">${r.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}</div></div>
        <div style="text-align:right"><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--gris-100)">${r.estado}</span></div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📥</div><p>Sin albaranes</p></div>';
  document.getElementById('ficha-prov-albaranes').innerHTML = recHtml;

  // Facturas
  const factResumen = [resumenItem('Total facturado', fmtE(totalFact), 'var(--gris-700)')];
  if (pendientePago > 0) factResumen.push(resumenItem('Pendiente pago', fmtE(pendientePago), 'var(--rojo)'));
  const factHtml = (fps.data || []).length ?
    resumenBar(factResumen) +
    (fps.data || []).map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="previewDoc('fp',${f.id})">
        <div><div style="font-weight:700;font-size:12.5px">${f.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—'} · ${f.fecha_vencimiento ? 'Vence: ' + new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : ''}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(f.total)}</div><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${f.estado === 'pagada' ? 'var(--verde-light)' : f.estado === 'pendiente' ? 'var(--amarillo-light)' : 'var(--gris-100)'};color:${f.estado === 'pagada' ? 'var(--verde)' : f.estado === 'pendiente' ? '#92400E' : 'var(--gris-600)'}">${f.estado}</span></div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📑</div><p>Sin facturas</p></div>';
  document.getElementById('ficha-prov-facturas').innerHTML = factHtml;

  // Calendario (pagos pendientes de este proveedor)
  const calHtml = pagosPend.length ?
    resumenBar([resumenItem('Pendiente total', fmtE(pendientePago), 'var(--rojo)')]) +
    pagosPend.map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100)">
        <div><div style="font-weight:700;font-size:12.5px">${f.numero}</div><div style="font-size:10.5px;color:${f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().split('T')[0] ? 'var(--rojo)' : 'var(--gris-400)'}">${f.fecha_vencimiento ? 'Vence: ' + new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : '—'}${f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().split('T')[0] ? ' — VENCIDO' : ''}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-weight:800;font-size:13px;color:var(--rojo)">${fmtE(f.total)}</div>
          <button onclick="registrarPagoCalendario(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #10B981;background:#D1FAE5;cursor:pointer;font-size:11px;font-weight:700;color:#065F46">💰 Pagar</button>
        </div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">✅</div><h3>Sin pagos pendientes</h3><p>Todas las facturas están pagadas</p></div>';
  document.getElementById('ficha-prov-calendario').innerHTML = calHtml;

  // Artículos (se carga on-demand al seleccionar la pestaña)
  document.getElementById('ficha-prov-articulos').innerHTML = '';

  // Notas (por ahora vacío, se puede expandir)
  document.getElementById('ficha-prov-notas').innerHTML = '<div class="empty" style="padding:30px 0"><div class="ei">📝</div><p>Sin notas</p></div>';

  // Activar primera pestaña
  fichaProvTab('pedidos');
}

function fichaProvTab(tab) {
  const tabs = ['pedidos', 'albaranes', 'facturas', 'calendario', 'articulos', 'notas'];
  const icos = { pedidos: '🛒 Pedidos', albaranes: '📥 Albaranes', facturas: '📑 Facturas', calendario: '📅 Pagos pendientes', articulos: '📦 Artículos', notas: '📝 Notas' };
  // Cargar artículos on-demand al seleccionar la pestaña
  if (tab === 'articulos' && provActualId) loadFichaProvArticulos(provActualId);
  tabs.forEach(t => {
    const el = document.getElementById('ficha-prov-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    const kpi = document.getElementById('fpkpi-' + t);
    if (kpi) {
      kpi.classList.toggle('ficha-prov-kpi-active', t === tab);
      kpi.style.opacity = t === tab ? '1' : '.7';
      kpi.style.boxShadow = t === tab ? '0 0 0 2px var(--azul)' : 'none';
    }
  });
  document.getElementById('fichaProvHistTitulo').textContent = icos[tab] || tab;
}

// Acciones rápidas desde ficha
function nuevoPedidoCompraDesdeProveedor() {
  if (typeof nuevoPedidoCompra === 'function') {
    nuevoPedidoCompra();
    setTimeout(() => {
      const sel = document.getElementById('pc_proveedor');
      if (sel && provActualId) sel.value = provActualId;
    }, 100);
  }
}

function nuevaRecepcionDesdeProveedor() {
  if (typeof nuevaRecepcion === 'function') {
    nuevaRecepcion();
    setTimeout(() => {
      const sel = document.getElementById('rc_proveedor');
      if (sel && provActualId) sel.value = provActualId;
    }, 100);
  }
}

function nuevaFacturaProvDesdeProveedor() {
  if (typeof nuevaFacturaProv === 'function') {
    nuevaFacturaProv();
    setTimeout(() => {
      const sel = document.getElementById('fp_proveedor');
      if (sel && provActualId) {
        sel.value = provActualId;
        fp_aplicarReglaProveedor(provActualId);
      }
    }, 100);
  }
}

// ═══════════════════════════════════════════════
//  PESTAÑA ARTÍCULOS — Ficha Proveedor
//  Muestra artículos vinculados con datos de compra
// ═══════════════════════════════════════════════
let _fichaProvArtsCargados = null;
let _fichaProvArtsData = [];       // datos completos
let _fichaProvArtsPag = 0;         // página actual
const _FPART_POR_PAG = 50;        // artículos por página

async function loadFichaProvArticulos(provId) {
  const container = document.getElementById('ficha-prov-articulos');
  if (!container) return;
  if (_fichaProvArtsCargados === provId) return;

  container.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--gris-400)"><p style="font-size:12px">⏳ Cargando artículos...</p></div>';

  try {
    const { data: vinculos, error } = await sb.from('articulos_proveedores')
      .select('*, articulos(*)')
      .eq('proveedor_id', provId)
      .eq('empresa_id', EMPRESA.id)
      .order('es_principal', { ascending: false });

    if (error) { container.innerHTML = `<div style="color:var(--rojo);padding:20px;font-size:12px">Error: ${error.message}</div>`; return; }

    if (!vinculos || !vinculos.length) {
      container.innerHTML = `<div class="empty" style="padding:20px 0">
        <div class="ei">📦</div><h3>Sin artículos vinculados</h3>
        <p>Se vinculan automáticamente al procesar albaranes o desde la ficha del artículo.</p>
      </div>`;
      _fichaProvArtsCargados = provId;
      return;
    }

    // Últimas compras desde recepciones
    const artIds = vinculos.map(v => v.articulo_id);
    const { data: recsData } = await sb.from('recepciones')
      .select('id, numero, fecha, lineas')
      .eq('proveedor_id', provId).eq('empresa_id', EMPRESA.id)
      .order('fecha', { ascending: false }).limit(200);

    const ultimaCompra = {}, totalComprado = {};
    (recsData || []).forEach(rec => {
      (Array.isArray(rec.lineas) ? rec.lineas : []).forEach(lin => {
        const aid = lin.articulo_id || lin.articuloId;
        if (!aid || !artIds.includes(aid)) return;
        const cant = parseFloat(lin.cantidad || lin.qty || 0);
        totalComprado[aid] = (totalComprado[aid] || 0) + cant;
        if (!ultimaCompra[aid] || rec.fecha > ultimaCompra[aid].fecha)
          ultimaCompra[aid] = { fecha: rec.fecha, numero: rec.numero };
      });
    });

    // Preparar datos enriquecidos
    const familias = typeof familiasArticulos !== 'undefined' ? familiasArticulos : [];
    _fichaProvArtsData = vinculos.map(vn => {
      const art = vn.articulos || {};
      return { ...vn, art, fam: familias.find(f => f.id === art.familia_id),
        uc: ultimaCompra[vn.articulo_id] || null,
        tc: totalComprado[vn.articulo_id] || 0,
        unidad: art.unidad_medida || art.unidad || 'ud',
        codArt: art.codigo || art.referencia || '',
        _nombre: (art.nombre || '').toLowerCase(),
        _ref: (vn.ref_proveedor || '').toLowerCase()
      };
    });
    _fichaProvArtsPag = 0;
    _fichaProvArtsCargados = provId;
    renderFichaProvArticulos();
  } catch (e) {
    container.innerHTML = `<div style="color:var(--rojo);padding:20px;font-size:12px">Error: ${e.message}</div>`;
  }
}

function renderFichaProvArticulos() {
  const container = document.getElementById('ficha-prov-articulos');
  if (!container) return;
  const q = (document.getElementById('fpArtBuscar')?.value || '').toLowerCase().trim();
  const filtered = q ? _fichaProvArtsData.filter(d => d._nombre.includes(q) || d._ref.includes(q)) : _fichaProvArtsData;
  const totalPags = Math.max(1, Math.ceil(filtered.length / _FPART_POR_PAG));
  if (_fichaProvArtsPag >= totalPags) _fichaProvArtsPag = totalPags - 1;
  const desde = _fichaProvArtsPag * _FPART_POR_PAG;
  const pagina = filtered.slice(desde, desde + _FPART_POR_PAG);

  const total = _fichaProvArtsData.length;
  const principales = _fichaProvArtsData.filter(d => d.es_principal).length;
  const activos = _fichaProvArtsData.filter(d => d.art.activo !== false).length;

  let html = `<div style="display:flex;align-items:center;gap:8px;padding:6px 0 8px;flex-wrap:wrap">
    <input type="text" id="fpArtBuscar" placeholder="🔍 Buscar artículo o ref..." oninput="fpArtBuscarInput()" value="${q ? q.replace(/"/g,'&quot;') : ''}" style="flex:1;min-width:140px;padding:5px 10px;border:1px solid var(--gris-200);border-radius:7px;font-size:11.5px">
    <span style="font-size:10.5px;color:var(--gris-400)">${total} total · <span style="color:var(--verde)">${principales} principal</span> · ${activos} activos</span>
  </div>`;

  html += `<div class="tw" style="max-height:420px;overflow-y:auto"><table class="dt" style="font-size:11.5px">
    <thead><tr style="position:sticky;top:0;background:var(--blanco);z-index:1">
      <th style="width:22px;padding:4px 2px"></th>
      <th style="padding:4px 6px">Artículo</th>
      <th style="padding:4px 6px">Ref. prov.</th>
      <th style="padding:4px 6px;text-align:right">Precio</th>
      <th style="padding:4px 6px;text-align:right">Comprado</th>
      <th style="padding:4px 6px;text-align:right">Últ. compra</th>
    </tr></thead><tbody>`;

  if (!pagina.length) {
    html += `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--gris-400);font-size:12px">Sin resultados</td></tr>`;
  } else {
    pagina.forEach(d => {
      html += `<tr style="cursor:pointer" onclick="if(typeof openArticulo==='function')openArticulo(${d.articulo_id})">
        <td style="padding:3px 2px;text-align:center;font-size:10px">${d.es_principal ? '<span style="color:var(--verde)">⭐</span>' : ''}</td>
        <td style="padding:3px 6px"><div style="font-weight:700;font-size:11.5px;line-height:1.3">${d.art.nombre || '—'}</div><div style="font-size:9.5px;color:var(--gris-400)">${d.codArt}${d.fam ? ' · ' + d.fam.nombre : ''}${d.art.activo === false ? ' <span style="color:var(--rojo)">inactivo</span>' : ''}</div></td>
        <td style="padding:3px 6px;font-family:monospace;font-size:10.5px">${d.ref_proveedor || '—'}</td>
        <td style="padding:3px 6px;text-align:right;font-weight:700">${d.precio_proveedor ? fmtE(d.precio_proveedor) : '—'}</td>
        <td style="padding:3px 6px;text-align:right">${d.tc > 0 ? d.tc + ' ' + d.unidad : '—'}</td>
        <td style="padding:3px 6px;text-align:right;font-size:10.5px;color:var(--gris-500)">${d.uc ? new Date(d.uc.fecha).toLocaleDateString('es-ES') : '—'}</td>
      </tr>`;
    });
  }
  html += '</tbody></table></div>';

  // Paginación
  if (filtered.length > _FPART_POR_PAG) {
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:10.5px;color:var(--gris-400)">
      <span>Pág. ${_fichaProvArtsPag + 1} de ${totalPags} (${filtered.length} artículos)</span>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" ${_fichaProvArtsPag === 0 ? 'disabled' : ''} onclick="_fichaProvArtsPag--;renderFichaProvArticulos()" style="padding:2px 8px;font-size:10.5px">← Anterior</button>
        <button class="btn btn-ghost btn-sm" ${_fichaProvArtsPag >= totalPags - 1 ? 'disabled' : ''} onclick="_fichaProvArtsPag++;renderFichaProvArticulos()" style="padding:2px 8px;font-size:10.5px">Siguiente →</button>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

let _fpArtBuscarTimer = null;
function fpArtBuscarInput() {
  clearTimeout(_fpArtBuscarTimer);
  _fpArtBuscarTimer = setTimeout(() => { _fichaProvArtsPag = 0; renderFichaProvArticulos(); }, 200);
}
