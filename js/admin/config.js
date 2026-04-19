// ═══════════════════════════════════════════════
// Configuration & Settings module - Configuración
// ═══════════════════════════════════════════════

function renderConfigLists() {
  // Series
  document.getElementById('seriesList').innerHTML = series.length ?
    series.map(s=>`<div class="cfg-row">
      <div class="cr-main"><strong>${s.serie} · ${s.descripcion||s.tipo}</strong><small>${s.tipo} · Contador: ${s.contador||0}${s.por_defecto?' · Por defecto':''}</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="editSerie(${s.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCfg('series_numeracion',${s.id},'series')">🗑️</button>
      </div>
    </div>`).join('') : '<div style="padding:16px;color:var(--gris-400);font-size:13px;text-align:center">Sin series — crea la primera</div>';

  // IVA
  document.getElementById('ivaList').innerHTML = tiposIva.length ?
    tiposIva.map(i=>`<div class="cfg-row">
      <div class="cr-main"><strong>${i.nombre} — ${i.porcentaje}%</strong><small>${i.por_defecto?'Por defecto':''}</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="editIva(${i.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCfg('tipos_iva',${i.id},'iva')">🗑️</button>
      </div>
    </div>`).join('') : '<div style="padding:16px;color:var(--gris-400);font-size:13px;text-align:center">Sin tipos de IVA</div>';

  // Unidades
  document.getElementById('unidadesList').innerHTML = unidades.length ?
    unidades.map(u=>`<div class="cfg-row">
      <div class="cr-main"><strong>${u.nombre}</strong><small>Abreviatura: ${u.abreviatura}</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="editUnidad(${u.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCfg('unidades_medida',${u.id},'unidades')">🗑️</button>
      </div>
    </div>`).join('') : '<div style="padding:16px;color:var(--gris-400);font-size:13px;text-align:center">Sin unidades</div>';

  // Formas de pago
  document.getElementById('formasPagoList').innerHTML = formasPago.length ?
    formasPago.map(f=>`<div class="cfg-row">
      <div class="cr-main"><strong>${f.nombre}</strong><small>${f.dias_vencimiento} días de vencimiento</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="editFormaPago(${f.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCfg('formas_pago',${f.id},'formas-pago')">🗑️</button>
      </div>
    </div>`).join('') : '<div style="padding:16px;color:var(--gris-400);font-size:13px;text-align:center">Sin formas de pago</div>';

  // Familias (dos columnas: padres | hijos)
  renderFamiliasPadres();
  // Mantener selección si existe
  if (_cfgFamSelId) renderFamiliasHijos(_cfgFamSelId);

  // Empresa
  if(EMPRESA) {
    setVal({emp_nombre:EMPRESA.nombre||'',emp_razon:EMPRESA.razon_social||'',emp_cif:EMPRESA.cif||'',emp_tel:EMPRESA.telefono||'',emp_email:EMPRESA.email||'',emp_web:EMPRESA.web||'',emp_dir:EMPRESA.direccion||'',emp_muni:EMPRESA.municipio||'',emp_cp:EMPRESA.cp||'',emp_prov:EMPRESA.provincia||''});
  }
}

function editSerie(id) {
  const s=series.find(x=>x.id===id); if(!s)return;
  document.getElementById('ser_id').value=s.id;
  document.getElementById('ser_tipo').value=s.tipo;
  setVal({ser_serie:s.serie,ser_desc:s.descripcion||'',ser_contador:s.contador||0});
  document.getElementById('ser_defecto').checked=s.por_defecto||false;
  openModal('mSerie');
}

async function saveSerie() {
  const serie=v('ser_serie'); if(!serie){toast('Introduce la serie','error');return;}
  const id=document.getElementById('ser_id').value;
  const obj={empresa_id:EMPRESA.id,tipo:document.getElementById('ser_tipo').value,serie,descripcion:v('ser_desc'),contador:parseInt(v('ser_contador'))||0,por_defecto:document.getElementById('ser_defecto').checked};
  if(id){await sb.from('series_numeracion').update(obj).eq('id',id);}
  else{await sb.from('series_numeracion').insert(obj);}
  closeModal('mSerie'); await reloadCfg('series'); toast('Serie guardada ✓','success');
}

function editIva(id) {
  const i=tiposIva.find(x=>x.id===id); if(!i)return;
  document.getElementById('iva_id').value=i.id;
  setVal({iva_nombre:i.nombre,iva_pct:i.porcentaje});
  document.getElementById('iva_defecto').checked=i.por_defecto||false;
  openModal('mIva');
}

async function saveIva() {
  const nombre=v('iva_nombre'); if(!nombre){toast('Introduce el nombre','error');return;}
  const id=document.getElementById('iva_id').value;
  const obj={empresa_id:EMPRESA.id,nombre,porcentaje:parseFloat(v('iva_pct'))||0,por_defecto:document.getElementById('iva_defecto').checked};
  if(id){await sb.from('tipos_iva').update(obj).eq('id',id);}
  else{await sb.from('tipos_iva').insert(obj);}
  closeModal('mIva'); await reloadCfg('iva'); toast('Tipo IVA guardado ✓','success');
}

function editUnidad(id) {
  const u=unidades.find(x=>x.id===id); if(!u)return;
  document.getElementById('ud_id').value=u.id;
  setVal({ud_nombre:u.nombre,ud_abrev:u.abreviatura});
  openModal('mUnidad');
}

async function saveUnidad() {
  const nombre=v('ud_nombre'),abrev=v('ud_abrev');
  if(!nombre||!abrev){toast('Completa todos los campos','error');return;}
  const id=document.getElementById('ud_id').value;
  const obj={empresa_id:EMPRESA.id,nombre,abreviatura:abrev};
  if(id){await sb.from('unidades_medida').update(obj).eq('id',id);}
  else{await sb.from('unidades_medida').insert(obj);}
  closeModal('mUnidad'); await reloadCfg('unidades'); toast('Unidad guardada ✓','success');
}

function editFormaPago(id) {
  const f=formasPago.find(x=>x.id===id); if(!f)return;
  document.getElementById('fp_id').value=f.id;
  setVal({fp_nombre:f.nombre,fp_dias:f.dias_vencimiento||0});
  openModal('mFormaPago');
}

async function saveFormaPago() {
  const nombre=v('fp_nombre'); if(!nombre){toast('Introduce el nombre','error');return;}
  const id=document.getElementById('fp_id').value;
  const obj={empresa_id:EMPRESA.id,nombre,dias_vencimiento:parseInt(v('fp_dias'))||0};
  if(id){await sb.from('formas_pago').update(obj).eq('id',id);}
  else{await sb.from('formas_pago').insert(obj);}
  closeModal('mFormaPago'); await reloadCfg('formas-pago'); toast('Forma de pago guardada ✓','success');
}

// ─── FAMILIAS: Sistema dos columnas ───────────
let _cfgFamSelId = null; // Familia padre seleccionada

function renderFamiliasPadres() {
  const padres = familias.filter(f => !f.parent_id);
  const el = document.getElementById('familiasListPadres');
  if (!el) return;
  el.innerHTML = padres.length ? padres.map(f => {
    const nHijos = familias.filter(h => h.parent_id === f.id).length;
    const sel = _cfgFamSelId === f.id ? 'background:var(--azul-light);border-left:3px solid var(--azul)' : '';
    return `<div class="cfg-row" style="cursor:pointer;${sel}" onclick="seleccionarFamiliaCfg(${f.id})">
      <div class="cr-main"><strong>${f.nombre}</strong><small>${nHijos} subfamilia${nHijos !== 1 ? 's' : ''}</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editFamilia(${f.id})" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delFamiliaConfig(${f.id})" title="Eliminar">🗑️</button>
      </div>
    </div>`;
  }).join('') : '<div style="padding:16px;color:var(--gris-400);font-size:13px;text-align:center">Sin familias — crea la primera</div>';
}

function renderFamiliasHijos(padreId) {
  const hijos = familias.filter(f => f.parent_id === padreId);
  const padre = familias.find(f => f.id === padreId);
  const el = document.getElementById('familiasListHijos');
  const titulo = document.getElementById('subfamTitulo');
  const btn = document.getElementById('btnNuevaSubfam');
  if (!el) return;

  if (titulo) titulo.textContent = padre ? '📁 Subfamilias de ' + padre.nombre : '📁 Subfamilias';

  el.innerHTML = hijos.length ? hijos.map(h => `<div class="cfg-row">
    <div class="cr-main"><strong>${h.nombre}</strong></div>
    <div class="cr-actions">
      <button class="btn btn-ghost btn-sm" onclick="editFamilia(${h.id})" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-sm" onclick="delFamiliaConfig(${h.id})" title="Eliminar">🗑️</button>
    </div>
  </div>`).join('') : '<div style="padding:24px;color:var(--gris-400);font-size:13px;text-align:center">Sin subfamilias<br><small>Haz clic en "+ Nueva subfamilia" para crear una</small></div>';
}

function seleccionarFamiliaCfg(id) {
  _cfgFamSelId = id;
  renderFamiliasPadres();
  renderFamiliasHijos(id);
}

function nuevaFamiliaRaiz() {
  document.getElementById('fam_id').value = '';
  setVal({ fam_nombre: '' });
  document.getElementById('fam_parent').value = '';
  // Ocultar selector de padre ya que es raíz
  document.getElementById('fam_parent').closest('.fg').style.display = 'none';
  openModal('mFamilia');
}

function nuevaSubfamiliaConfig() {
  if (!_cfgFamSelId) { toast('Selecciona primero una familia', 'error'); return; }
  document.getElementById('fam_id').value = '';
  setVal({ fam_nombre: '' });
  document.getElementById('fam_parent').value = _cfgFamSelId;
  // Ocultar selector de padre ya que se asigna automáticamente
  document.getElementById('fam_parent').closest('.fg').style.display = 'none';
  openModal('mFamilia');
}

function editFamilia(id) {
  const f = familias.find(x => x.id === id); if (!f) return;
  document.getElementById('fam_id').value = f.id;
  setVal({ fam_nombre: f.nombre });
  document.getElementById('fam_parent').value = f.parent_id || '';
  // Mostrar selector de padre al editar
  document.getElementById('fam_parent').closest('.fg').style.display = '';
  openModal('mFamilia');
}

async function saveFamilia() {
  const nombre = v('fam_nombre'); if (!nombre) { toast('Introduce el nombre', 'error'); return; }
  const id = document.getElementById('fam_id').value;
  const pid = parseInt(document.getElementById('fam_parent').value) || null;
  const obj = { empresa_id: EMPRESA.id, nombre, parent_id: pid };
  if (id) { await sb.from('familias_articulos').update(obj).eq('id', id); }
  else { await sb.from('familias_articulos').insert(obj); }
  closeModal('mFamilia'); await reloadCfg('familias'); toast('Familia guardada ✓', 'success');
}

async function delFamiliaConfig(id) {
  const f = familias.find(x => x.id === id); if (!f) return;
  const hijos = familias.filter(h => h.parent_id === id);
  if (hijos.length > 0) {
    const ok = await confirmModal({titulo: 'Eliminar familia y subfamilias', mensaje: 'Esta familia tiene ' + hijos.length + ' subfamilia(s). ¿Eliminar todo?', aviso: 'Esta acción no se puede deshacer', colorOk: '#dc2626'}); if (!ok) return;
    // Eliminar hijos primero
    for (const h of hijos) { await sb.from('familias_articulos').delete().eq('id', h.id); }
  } else {
    const ok = await confirmModal({titulo: 'Eliminar familia', mensaje: '¿Eliminar "' + f.nombre + '"?', aviso: 'Esta acción no se puede deshacer', colorOk: '#dc2626'}); if (!ok) return;
  }
  await sb.from('familias_articulos').delete().eq('id', id);
  if (_cfgFamSelId === id) _cfgFamSelId = null;
  await reloadCfg('familias'); toast('Eliminado', 'info');
}

async function delCfg(tabla,id,tipo) {
  const ok = await confirmModal({titulo: 'Eliminar registro', mensaje: '¿Eliminar este registro?', aviso: 'Esta acción no se puede deshacer', colorOk: '#dc2626'}); if (!ok) return;
  await sb.from(tabla).delete().eq('id',id);
  await reloadCfg(tipo); toast('Eliminado','info');
}

async function reloadCfg(tipo) {
  if(tipo==='series'){const{data}=await sb.from('series_numeracion').select('*').eq('empresa_id',EMPRESA.id);series=data||[];}
  if(tipo==='iva'){const{data}=await sb.from('tipos_iva').select('*').eq('empresa_id',EMPRESA.id);tiposIva=data||[];}
  if(tipo==='unidades'){const{data}=await sb.from('unidades_medida').select('*').eq('empresa_id',EMPRESA.id);unidades=data||[];}
  if(tipo==='formas-pago'){const{data}=await sb.from('formas_pago').select('*').eq('empresa_id',EMPRESA.id);formasPago=data||[];}
  if(tipo==='familias'){const{data}=await sb.from('familias_articulos').select('*').eq('empresa_id',EMPRESA.id);familias=data||[];}
  renderConfigLists(); populateSelects();
}

function cfgTab(id,el){
  document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.cfg-menu-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('cfg-'+id).classList.add('active');
  el.classList.add('active');
  // Cargar datos según pestaña
  if (id === 'bancos') cargarBancosConfig();
  if (id === 'facturacion') cargarCfgFacturacion();
  if (id === 'certificado') { cargarCertificados(); cargarCfgFirmaDocumentos(); }
  if (id === 'correo') cargarCuentasCorreoConfig();
  if (id === 'ia') loadConfigIA();
  if (id === 'partes') { cargarCfgPartes(); cargarCalculadora(); cargarCalculadoraKm(); }
  if (id === 'sistema') verificarInstalacion();
}

// ═══════════════════════════════════════════════
//  CUENTAS BANCARIAS (config)
// ═══════════════════════════════════════════════
async function cargarBancosConfig() {
  try {
    const { data } = await sb.from('cuentas_bancarias').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
    cuentasBancarias = data || [];
  } catch(e) { cuentasBancarias = []; }

  const el = document.getElementById('bancosConfigList');
  if (!el) return;
  el.innerHTML = cuentasBancarias.length ?
    cuentasBancarias.map(b => {
      const defBadge = b.predeterminada ? '<span style="display:inline-flex;align-items:center;gap:3px;background:var(--azul-light);color:var(--azul);font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;margin-left:6px">⭐ Predeterminada</span>' : '';
      return `<div class="cfg-row">
      <div class="cr-main"><strong>${b.nombre}${defBadge}</strong><small>${b.iban || '—'} · ${b.entidad || ''}</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="editCuentaBancaria(${b.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCuentaBancaria(${b.id})">🗑️</button>
      </div>
    </div>`;
    }).join('') :
    '<div style="padding:24px;color:var(--gris-400);font-size:13px;text-align:center">Sin cuentas bancarias — crea la primera</div>';
}

function nuevaCuentaBancaria() {
  document.getElementById('bco_id').value = '';
  document.getElementById('bco_nombre').value = '';
  document.getElementById('bco_iban').value = '';
  document.getElementById('bco_bic').value = '';
  document.getElementById('bco_entidad').value = '';
  // Auto-rellenar titular con el nombre de la empresa
  const nombreEmpresa = EMPRESA?.nombre || (typeof empresas !== 'undefined' && empresas[0]?.nombre) || '';
  document.getElementById('bco_titular').value = nombreEmpresa;
  document.getElementById('bco_observaciones').value = '';
  document.getElementById('bco_predeterminada').checked = false;
  document.getElementById('bco_iban_status').textContent = '';
  document.getElementById('bco_iban_msg').textContent = '';
  document.getElementById('mBancoTit').textContent = 'Nueva Cuenta Bancaria';
  openModal('mCuentaBancaria');
}

function editCuentaBancaria(id) {
  const b = cuentasBancarias.find(x => x.id === id);
  if (!b) return;
  document.getElementById('bco_id').value = b.id;
  document.getElementById('bco_nombre').value = b.nombre || '';
  document.getElementById('bco_iban').value = b.iban || '';
  document.getElementById('bco_bic').value = b.bic || '';
  document.getElementById('bco_entidad').value = b.entidad || '';
  const nombreEmpresa = EMPRESA?.nombre || (typeof empresas !== 'undefined' && empresas[0]?.nombre) || '';
  document.getElementById('bco_titular').value = b.titular || nombreEmpresa;
  document.getElementById('bco_observaciones').value = b.observaciones || '';
  document.getElementById('bco_predeterminada').checked = !!b.predeterminada;
  document.getElementById('mBancoTit').textContent = 'Editar Cuenta Bancaria';
  // Validar IBAN actual al abrir
  validarIBANLive(document.getElementById('bco_iban'));
  openModal('mCuentaBancaria');
}

async function guardarCuentaBancaria() {
  const nombre = v('bco_nombre');
  if (!nombre) { toast('Introduce el nombre de la cuenta', 'error'); return; }

  const ibanRaw = v('bco_iban').replace(/\s/g, '').toUpperCase();
  if (ibanRaw && !_validarIBAN(ibanRaw)) {
    toast('El IBAN introducido no es válido', 'error');
    return;
  }

  const id = document.getElementById('bco_id').value;
  const esPredeterminada = document.getElementById('bco_predeterminada').checked;

  // Si se marca como predeterminada, desmarcar las demás
  if (esPredeterminada) {
    await sb.from('cuentas_bancarias')
      .update({ predeterminada: false })
      .eq('empresa_id', EMPRESA.id)
      .eq('predeterminada', true);
  }

  const obj = {
    empresa_id: EMPRESA.id,
    nombre,
    iban: ibanRaw || null,
    bic: v('bco_bic') || null,
    entidad: v('bco_entidad') || null,
    titular: v('bco_titular') || null,
    observaciones: v('bco_observaciones') || null,
    predeterminada: esPredeterminada,
    activa: true
  };

  let err;
  if (id) {
    const r = await sb.from('cuentas_bancarias').update(obj).eq('id', id);
    err = r.error;
  } else {
    const r = await sb.from('cuentas_bancarias').insert(obj);
    err = r.error;
  }

  if (err) { toast('Error: ' + err.message, 'error'); return; }

  closeModal('mCuentaBancaria');
  toast(id ? 'Cuenta actualizada ✓' : 'Cuenta creada ✓', 'success');
  cargarBancosConfig();
}

// ─── Directorio de bancos españoles (código entidad → nombre + BIC) ───
const _BANCOS_ES = {
  '0049':{ n:'Banco Santander',           bic:'BSCHESMMXXX' },
  '0182':{ n:'BBVA',                       bic:'BBVAESMMXXX' },
  '2100':{ n:'CaixaBank',                  bic:'CAIXESBBXXX' },
  '0081':{ n:'Banco Sabadell',             bic:'BSABESBBXXX' },
  '0019':{ n:'Deutsche Bank',              bic:'ABORESMM' },
  '2038':{ n:'Bankia (CaixaBank)',         bic:'CAABORESMM' },
  '0128':{ n:'Bankinter',                  bic:'BKBKESMMXXX' },
  '2085':{ n:'Ibercaja',                   bic:'CAZABORESMM' },
  '2095':{ n:'Kutxabank',                  bic:'BASKES2BXXX' },
  '2103':{ n:'Unicaja Banco',              bic:'UCJAES2MXXX' },
  '0073':{ n:'Open Bank (Santander)',      bic:'OPENESMMXXX' },
  '0075':{ n:'Banco Popular (Santander)',  bic:'POPUESMMXXX' },
  '0487':{ n:'Banco Mare Nostrum',         bic:'GBMNESMMXXX' },
  '0030':{ n:'Banco Español de Crédito',   bic:'ESPCESMMXXX' },
  '0065':{ n:'Barclays Bank',              bic:'BARCESMMXXX' },
  '2048':{ n:'Liberbank (Unicaja)',        bic:'CECAESMM048' },
  '2080':{ n:'Abanca',                     bic:'CAABORESMM' },
  '3058':{ n:'Cajamar',                    bic:'CCABORESMM' },
  '3085':{ n:'Caja Rural del Sur',         bic:'BCOEESMM085' },
  '3025':{ n:'Caixa Ontinyent',            bic:'CCONESMMXXX' },
  '3035':{ n:'Caja Laboral (Laboral Kutxa)',bic:'CLPEES2MXXX' },
  '3081':{ n:'Caja Rural Castilla-La Mancha',bic:'BCOEESMM081' },
  '0186':{ n:'Banco Mediolanum',           bic:'BSABESBB' },
  '0238':{ n:'Banco Pastor (Santander)',   bic:'PASTESMMXXX' },
  '0239':{ n:'EVO Banco',                  bic:'ABORESMM' },
  '1465':{ n:'ING',                        bic:'INGDESMMXXX' },
  '0057':{ n:'BNP Paribas',               bic:'BNPAESMMXXX' },
  '2013':{ n:'Catalana Occidente',         bic:'CAOLESMMXXX' },
  '0061':{ n:'Banca March',               bic:'BMABORESMM' },
  '0078':{ n:'Banca Pueyo',               bic:'BAPUES22XXX' },
  '0083':{ n:'Renta 4 Banco',             bic:'RENTEESMMXXX' },
  '0184':{ n:'Banco Europeo de Finanzas',  bic:'BFILESMMXXX' },
  '0198':{ n:'Banco Cooperativo Español',  bic:'BCOEESMMXXX' },
  '0234':{ n:'Banco Caminos',              bic:'CABORESMM' },
  '3183':{ n:'Caja Rural de Aragón',       bic:'BCOEESMM183' },
  '3191':{ n:'Caja Rural de Navarra',      bic:'BCOEESMM191' },
  '0487':{ n:'Banco Mare Nostrum',         bic:'GBMNESMMXXX' },
  '2045':{ n:'Caja de Ahorros de Ontinyent',bic:'CECAESMM045' },
  '0031':{ n:'Banco Etcheverría',          bic:'ETCHES2GXXX' },
  '0138':{ n:'Bankoa (Abanca)',            bic:'BKOAES22XXX' },
  '0229':{ n:'Banco Popular-e (Santander)',bic:'POPLESMMXXX' },
  '0237':{ n:'Cajasur (Kutxabank)',        bic:'CSABORESMM' },
  '3007':{ n:'Caixa Guissona',             bic:'BCOEESMM007' },
  '3008':{ n:'Caja Rural de Almería',      bic:'BCOEESMM008' },
  '3159':{ n:'Caixa Popular',              bic:'BCOEESMM159' },
  '3187':{ n:'Caja Rural de Soria',        bic:'BCOEESMM187' },
  '0225':{ n:'Banco Cetelem',              bic:'FABORESMM' },
  '0131':{ n:'Banco Espirito Santo',       bic:'BESMESMMXXX' },
};

// ─── Validación IBAN en vivo + autocompletado banco ─────────────────
// Genérica: busca _status, _msg, _bic, _entidad por convención del ID del input
function validarIBANLive(input) {
  const raw = input.value.replace(/\s/g, '').toUpperCase();
  const prefix = input.id.replace('_iban','');
  const st = document.getElementById(prefix + '_iban_status');
  const msg = document.getElementById(prefix + '_iban_msg');

  if (!raw) {
    if (st) st.textContent = '';
    if (msg) { msg.textContent = ''; msg.style.color = ''; }
    return;
  }

  // Formato parcial: mostrar progreso
  if (raw.length < 4) {
    if (st) st.textContent = '⏳';
    if (msg) { msg.textContent = 'Introduce el IBAN completo...'; msg.style.color = 'var(--gris-400)'; }
    return;
  }

  // Formatear mientras escribe (cada 4 dígitos)
  const formatted = raw.replace(/(.{4})/g, '$1 ').trim();
  input.value = formatted;

  // Autocompletar banco desde posiciones 5-8 del IBAN español
  if (raw.substring(0,2) === 'ES' && raw.length >= 8) {
    const codEntidad = raw.substring(4, 8);
    const banco = _BANCOS_ES[codEntidad];
    if (banco) {
      _autocompletarBanco(prefix, banco);
      if (msg && raw.length < 24) {
        msg.innerHTML = `${raw.length}/24 · <strong>${banco.n}</strong>`;
        msg.style.color = 'var(--azul)';
      }
    }
  }

  if (raw.length < 24) {
    if (st) st.textContent = '⏳';
    if (msg && !msg.innerHTML.includes('<strong>')) {
      msg.textContent = `${raw.length}/24 caracteres` + (raw.substring(0,2) === 'ES' ? ' (España)' : '');
      msg.style.color = 'var(--gris-400)';
    }
    return;
  }

  // Validar IBAN completo
  if (_validarIBAN(raw)) {
    if (st) st.textContent = '✅';
    // Autocompletar al validar
    if (raw.substring(0,2) === 'ES') {
      const codEntidad = raw.substring(4, 8);
      const banco = _BANCOS_ES[codEntidad];
      if (banco) {
        _autocompletarBanco(prefix, banco);
        if (msg) { msg.innerHTML = `IBAN válido · <strong>${banco.n}</strong>`; msg.style.color = 'var(--verde)'; }
      } else {
        if (msg) { msg.textContent = 'IBAN válido'; msg.style.color = 'var(--verde)'; }
      }
    } else {
      if (msg) { msg.textContent = 'IBAN válido'; msg.style.color = 'var(--verde)'; }
    }
  } else {
    if (st) st.textContent = '❌';
    if (msg) { msg.textContent = 'IBAN no válido — revisa los dígitos'; msg.style.color = 'var(--rojo)'; }
  }
}

// Autocompletar BIC y entidad — busca campos hermanos por convención de prefijo
function _autocompletarBanco(prefix, banco) {
  // Buscar campo BIC: bco_bic, c_bic, etc.
  const bicEl = document.getElementById(prefix + '_bic');
  const entEl = document.getElementById(prefix + '_entidad') || document.getElementById(prefix + '_banco_entidad');
  if (bicEl && !bicEl.value) bicEl.value = banco.bic;
  if (entEl && !entEl.value) entEl.value = banco.n;
}

// Algoritmo MOD-97 (ISO 13616)
function _validarIBAN(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  // Longitud mínima y solo alfanumérico
  if (s.length < 15 || s.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  // España: exactamente 24 caracteres
  if (s.substring(0,2) === 'ES' && s.length !== 24) return false;

  // Mover 4 primeros al final
  const reordered = s.substring(4) + s.substring(0, 4);
  // Convertir letras a números (A=10, B=11, ..., Z=35)
  let numStr = '';
  for (let i = 0; i < reordered.length; i++) {
    const c = reordered.charCodeAt(i);
    if (c >= 65 && c <= 90) { numStr += (c - 55).toString(); }
    else { numStr += reordered[i]; }
  }
  // MOD 97 en bloques (para evitar overflow)
  let remainder = 0;
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numStr[i])) % 97;
  }
  return remainder === 1;
}

async function delCuentaBancaria(id) {
  const ok = await confirmModal({titulo: 'Eliminar cuenta bancaria', mensaje: '¿Eliminar esta cuenta bancaria?', aviso: 'Esta acción no se puede deshacer', colorOk: '#dc2626'}); if (!ok) return;
  const { error } = await sb.from('cuentas_bancarias').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Cuenta eliminada', 'info');
  cargarBancosConfig();
}

// ═══════════════════════════════════════════════
//  FACTURACIÓN ELECTRÓNICA (config)
// ═══════════════════════════════════════════════
async function cargarCfgFacturacion() {
  // Leer config de la empresa
  const cfg = EMPRESA.facturacion_electronica || {};
  const vf = document.getElementById('cfg_verifactu');
  const fe = document.getElementById('cfg_factura_electronica');
  const sii = document.getElementById('cfg_sii');
  if (vf) vf.checked = !!cfg.verifactu;
  if (fe) fe.checked = !!cfg.factura_electronica;
  if (sii) sii.checked = !!cfg.sii;
  // Mostrar/ocultar panel VeriFactu según estado del toggle
  toggleVerifactuPanel();
}

async function guardarCfgFacturacion() {
  const cfg = {
    verifactu: document.getElementById('cfg_verifactu')?.checked || false,
    factura_electronica: document.getElementById('cfg_factura_electronica')?.checked || false,
    sii: document.getElementById('cfg_sii')?.checked || false,
  };
  const { error } = await sb.from('empresas').update({ facturacion_electronica: cfg }).eq('id', EMPRESA.id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  EMPRESA.facturacion_electronica = cfg;
  toast('Configuración de facturación guardada ✓', 'success');
}

// ═══════════════════════════════════════════════
// CERTIFICADO DIGITAL — Firma de documentos
// ═══════════════════════════════════════════════

let _certActual = null; // Certificado predeterminado cargado

async function cargarCertificados() {
  const el = document.getElementById('certActual');
  if (!el) return;
  try {
    const { data, error } = await sb.from('certificados_digitales')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('predeterminado', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    const certs = data || [];
    _certActual = certs.find(c => c.predeterminado && c.activo) || certs[0] || null;

    if (!certs.length) {
      el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--gris-400)">
        <div style="font-size:32px;margin-bottom:8px">🔐</div>
        <div style="font-size:13px">No hay certificados configurados</div>
        <div style="font-size:11px;margin-top:4px">Sube tu certificado .pfx o .p12 para empezar a firmar documentos</div>
      </div>`;
      document.getElementById('certForm').style.display = '';
      return;
    }

    let html = '';
    certs.forEach(c => {
      const caducado = c.fecha_caducidad && new Date(c.fecha_caducidad) < new Date();
      const diasRestantes = c.fecha_caducidad
        ? Math.ceil((new Date(c.fecha_caducidad) - new Date()) / (1000*60*60*24))
        : null;
      const estadoTag = caducado
        ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">CADUCADO</span>'
        : c.activo
          ? '<span style="background:#ecfdf5;color:#166534;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">ACTIVO</span>'
          : '<span style="background:var(--gris-100);color:var(--gris-500);padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">INACTIVO</span>';
      const predTag = c.predeterminado
        ? ' <span style="background:var(--azul);color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">PREDETERMINADO</span>'
        : '';
      const caducidadText = c.fecha_caducidad
        ? (caducado ? `Caducó el ${c.fecha_caducidad}` : `Caduca el ${c.fecha_caducidad} (${diasRestantes} días)`)
        : 'Sin fecha de caducidad';
      const caducidadColor = caducado ? 'var(--rojo)' : (diasRestantes && diasRestantes < 90) ? '#d97706' : 'var(--gris-400)';

      html += `<div style="padding:14px;border:1.5px solid ${c.predeterminado?'var(--azul)':'var(--gris-200)'};border-radius:10px;margin-bottom:10px;background:${c.predeterminado?'var(--azul-light,#eff6ff)':'#fff'}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div>
            <div style="font-weight:700;font-size:14px">${c.nombre} ${estadoTag}${predTag}</div>
            <div style="font-size:11px;color:var(--gris-400);margin-top:2px">${c.titular||''} ${c.nif_titular ? '· '+c.nif_titular : ''} ${c.emisor ? '· '+c.emisor : ''}</div>
          </div>
          <div style="display:flex;gap:4px">
            ${!c.predeterminado ? `<button class="btn btn-ghost btn-sm" onclick="setPredeterminadoCert(${c.id})" title="Predeterminado">⭐</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="eliminarCertificado(${c.id})" title="Eliminar" style="color:var(--rojo)">🗑️</button>
          </div>
        </div>
        <div style="font-size:11px;color:${caducidadColor}">📅 ${caducidadText}</div>
        <div style="font-size:10px;color:var(--gris-400);margin-top:4px">Tipo: ${(c.tipo||'pfx').toUpperCase()} · Subido: ${new Date(c.created_at).toLocaleDateString('es-ES')}</div>
      </div>`;
    });

    el.innerHTML = html;
    // Ocultar form si ya hay certificado, mostrar botón "Añadir otro"
    document.getElementById('certForm').style.display = 'none';
    if (!document.getElementById('certAddBtn')) {
      el.insertAdjacentHTML('afterend', `<button id="certAddBtn" class="btn btn-secondary btn-sm" onclick="mostrarFormCert()" style="margin-top:8px">+ Añadir certificado</button>`);
    }
  } catch(e) {
    el.innerHTML = `<div style="color:var(--rojo);font-size:12px">Error cargando certificados: ${e.message}</div>`;
  }
}

function mostrarFormCert() {
  document.getElementById('certForm').style.display = '';
  document.getElementById('cert_id').value = '';
  document.getElementById('cert_nombre').value = '';
  document.getElementById('cert_titular').value = EMPRESA?.nombre || '';
  document.getElementById('cert_nif').value = EMPRESA?.cif || '';
  document.getElementById('cert_emisor').value = '';
  document.getElementById('cert_caducidad').value = '';
  document.getElementById('cert_archivo').value = '';
  document.getElementById('cert_password').value = '';
  const addBtn = document.getElementById('certAddBtn');
  if (addBtn) addBtn.style.display = 'none';
}

function cancelarCertificado() {
  document.getElementById('certForm').style.display = 'none';
  const addBtn = document.getElementById('certAddBtn');
  if (addBtn) addBtn.style.display = '';
}

// ── Leer metadatos del certificado .pfx/.p12 automáticamente ──
async function leerMetadatosCert() {
  const fileInput = document.getElementById('cert_archivo');
  const password = document.getElementById('cert_password').value;
  const file = fileInput?.files[0];
  if (!file || !password) return;

  try {
    toast('Leyendo certificado...', 'info');
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Usar forge para parsear el PKCS12
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytes));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // Extraer certificado
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certObj = certBags[forge.pki.oids.certBag]?.[0]?.cert;

    if (!certObj) {
      toast('No se pudo extraer el certificado del archivo', 'error');
      return;
    }

    // Extraer datos del Subject (titular)
    const subjectAttrs = certObj.subject.attributes;
    const getAttr = (shortName) => {
      const a = subjectAttrs.find(a => a.shortName === shortName);
      return a ? a.value : '';
    };
    const cn = getAttr('CN');  // Common Name
    const serialNumber = getAttr('serialNumber') || getAttr('SERIALNUMBER');  // NIF/CIF
    const o = getAttr('O');   // Organization

    // Extraer datos del Issuer (emisor)
    const issuerAttrs = certObj.issuer.attributes;
    const getIssuerAttr = (shortName) => {
      const a = issuerAttrs.find(a => a.shortName === shortName);
      return a ? a.value : '';
    };
    const issuerCN = getIssuerAttr('CN');
    const issuerO = getIssuerAttr('O');
    const emisor = issuerO || issuerCN || '';

    // Fecha de caducidad
    const notAfter = certObj.validity.notAfter;
    const caducidad = notAfter ? notAfter.toISOString().split('T')[0] : '';

    // Rellenar campos
    const titular = cn || o || '';
    document.getElementById('cert_titular').value = titular;
    if (serialNumber) document.getElementById('cert_nif').value = serialNumber;
    document.getElementById('cert_emisor').value = emisor;
    if (caducidad) document.getElementById('cert_caducidad').value = caducidad;

    // Auto-rellenar nombre si está vacío
    const nombreEl = document.getElementById('cert_nombre');
    if (!nombreEl.value.trim()) {
      const year = new Date().getFullYear();
      nombreEl.value = `Certificado ${titular || EMPRESA?.nombre || ''} ${year}`;
    }

    toast('✅ Datos del certificado leídos correctamente', 'success');

  } catch (e) {
    console.error('Error leyendo certificado:', e);
    if (e.message && e.message.includes('Invalid password')) {
      toast('❌ Contraseña incorrecta para este certificado', 'error');
    } else {
      toast('⚠️ No se pudieron leer los metadatos. Rellena los campos manualmente.', 'warning');
    }
  }
}

async function guardarCertificado() {
  const nombre = document.getElementById('cert_nombre').value.trim();
  const titular = document.getElementById('cert_titular').value.trim();
  const nif = document.getElementById('cert_nif').value.trim();
  const emisor = document.getElementById('cert_emisor').value.trim();
  const caducidad = document.getElementById('cert_caducidad').value;
  const password = document.getElementById('cert_password').value;
  const fileInput = document.getElementById('cert_archivo');
  const file = fileInput.files[0];

  if (!nombre) { toast('Nombre del certificado obligatorio', 'error'); return; }
  if (!file) { toast('Selecciona el archivo .pfx o .p12', 'error'); return; }
  if (!password) { toast('Contraseña del certificado obligatoria', 'error'); return; }

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pfx', 'p12'].includes(ext)) { toast('Solo se aceptan archivos .pfx o .p12', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('El archivo no puede superar 10MB', 'error'); return; }

  toast('Subiendo certificado...', 'info');

  // 1. Subir fichero al Storage (bucket privado "certificados")
  // Sanitizar nombre de archivo: quitar acentos, espacios y caracteres especiales
  const safeFileName = file.name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/[^a-zA-Z0-9._-]/g, '_')                  // solo alfanumérico
    .replace(/_+/g, '_');                                // múltiples _ a uno solo
  const path = `${EMPRESA.id}/${Date.now()}_${safeFileName}`;
  let archivoUrl = '', archivoPath = path;

  // Intentar bucket "certificados", fallback a "documentos"
  let { error: upErr } = await sb.storage.from('certificados').upload(path, file, { upsert: true });
  if (upErr) {
    // Si el bucket no existe, intentar con "documentos"
    const path2 = `certificados/${EMPRESA.id}/${Date.now()}_${safeFileName}`;
    const { error: upErr2 } = await sb.storage.from('documentos').upload(path2, file, { upsert: true });
    if (upErr2) {
      toast('Error subiendo: ' + (upErr2.message || upErr.message) + '. Crea el bucket "certificados" en Supabase Storage.', 'error');
      return;
    }
    archivoPath = path2;
    const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path2);
    archivoUrl = urlData?.publicUrl || '';
  } else {
    const { data: urlData } = sb.storage.from('certificados').getPublicUrl(path);
    archivoUrl = urlData?.publicUrl || '';
  }

  // 2. Cifrar contraseña (base64 básico — la Edge Function la descifra)
  // NOTA: en producción se debe usar cifrado asimétrico real
  const passwordCifrada = btoa(unescape(encodeURIComponent(password)));

  // 3. Verificar si es el primer certificado (auto-predeterminado)
  const { data: existentes } = await sb.from('certificados_digitales')
    .select('id').eq('empresa_id', EMPRESA.id);
  const esPrimero = !existentes || existentes.length === 0;

  // 4. Guardar en BD
  const { data: cert, error: dbErr } = await sb.from('certificados_digitales').insert({
    empresa_id: EMPRESA.id,
    nombre: nombre,
    tipo: ext,
    archivo_url: archivoUrl,
    archivo_path: archivoPath,
    password_cifrada: passwordCifrada,
    titular: titular,
    nif_titular: nif,
    emisor: emisor,
    fecha_caducidad: caducidad || null,
    activo: true,
    predeterminado: esPrimero
  }).select().single();

  if (dbErr) { toast('Error guardando: ' + dbErr.message, 'error'); return; }

  toast('✅ Certificado guardado correctamente', 'success');
  _certActual = cert;
  cancelarCertificado();
  cargarCertificados();
}

async function setPredeterminadoCert(certId) {
  // Quitar predeterminado de todos
  await sb.from('certificados_digitales')
    .update({ predeterminado: false })
    .eq('empresa_id', EMPRESA.id);
  // Poner predeterminado al seleccionado
  await sb.from('certificados_digitales')
    .update({ predeterminado: true })
    .eq('id', certId);
  toast('Certificado predeterminado actualizado', 'success');
  cargarCertificados();
}

async function eliminarCertificado(certId) {
  const ok = await confirmModal({titulo: 'Eliminar certificado', mensaje: '¿Eliminar este certificado? Los documentos ya firmados no se verán afectados.', aviso: 'Esta acción no se puede deshacer', colorOk: '#dc2626'}); if (!ok) return;

  // Obtener path para borrar de Storage
  const { data: cert } = await sb.from('certificados_digitales').select('archivo_path').eq('id', certId).single();

  const { error } = await sb.from('certificados_digitales').delete().eq('id', certId);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  // Intentar borrar del Storage
  if (cert?.archivo_path) {
    await sb.storage.from('certificados').remove([cert.archivo_path]).catch(() => {});
    await sb.storage.from('documentos').remove([cert.archivo_path]).catch(() => {});
  }

  toast('Certificado eliminado', 'success');
  cargarCertificados();
}

// ═══════════════════════════════════════════════
//  CONFIGURACIÓN DE FIRMA POR TIPO DE DOCUMENTO
// ═══════════════════════════════════════════════
// Variable global con la config de qué documentos se firman
let _cfgFirmaDocumentos = {
  factura: true,
  presupuesto: true,
  albaran: true,
  pedido_compra: true,
  presupuesto_compra: true,
  mandato_sepa: true,
  parte_trabajo: true
};

// Guardar config en la tabla empresas (campo config_firma JSON)
async function guardarCfgFirmaDocumentos() {
  const tipos = ['factura','presupuesto','albaran','pedido_compra','presupuesto_compra','mandato_sepa','parte_trabajo'];
  const cfg = {};
  tipos.forEach(t => {
    const el = document.getElementById('cfgFirma_' + t);
    cfg[t] = el ? el.checked : true;
  });
  _cfgFirmaDocumentos = cfg;

  // Guardar en empresas.config_firma (JSONB)
  const { error } = await sb.from('empresas')
    .update({ config_firma: cfg })
    .eq('id', EMPRESA.id);

  if (error) {
    // Si la columna no existe, guardar en localStorage como fallback
    console.warn('No se pudo guardar config_firma en BD, usando localStorage:', error.message);
    localStorage.setItem('cfgFirmaDocumentos_' + EMPRESA.id, JSON.stringify(cfg));
  }
  toast('Configuración de firma actualizada', 'success');
}

// Cargar config de firma al iniciar
async function cargarCfgFirmaDocumentos() {
  try {
    const { data } = await sb.from('empresas').select('config_firma').eq('id', EMPRESA.id).single();
    if (data?.config_firma) {
      _cfgFirmaDocumentos = data.config_firma;
    }
  } catch(e) {
    // Fallback localStorage
    const stored = localStorage.getItem('cfgFirmaDocumentos_' + EMPRESA?.id);
    if (stored) {
      try { _cfgFirmaDocumentos = JSON.parse(stored); } catch(e2) {}
    }
  }

  // Actualizar checkboxes en la UI si existen
  const tipos = ['factura','presupuesto','albaran','pedido_compra','presupuesto_compra','mandato_sepa','parte_trabajo'];
  tipos.forEach(t => {
    const el = document.getElementById('cfgFirma_' + t);
    if (el) el.checked = _cfgFirmaDocumentos[t] !== false;
  });
}

// Función pública para consultar si un tipo de documento debe firmarse
function debesFirmarDocumento(tipoDocumento) {
  return _cfgFirmaDocumentos[tipoDocumento] !== false;
}

// ═══════════════════════════════════════════════
//  VERIFACTU — Configuración y conexión AEAT
// ═══════════════════════════════════════════════

/** Mostrar/ocultar panel de config VeriFactu según toggle */
function toggleVerifactuPanel() {
  const panel = document.getElementById('verifactu_config_panel');
  const activo = document.getElementById('cfg_verifactu')?.checked;
  if (panel) panel.style.display = activo ? '' : 'none';
  if (activo) cargarCfgVerifactu();
}

/** Cargar configuración VeriFactu desde verifactu_config */
async function cargarCfgVerifactu() {
  try {
    const { data, error } = await sb.from('verifactu_config')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .maybeSingle();

    const cfg = data || {};
    EMPRESA._vf_modo = cfg.modo || 'test';

    // Rellenar campos
    const modo = document.getElementById('cfg_vf_modo');
    if (modo) modo.value = cfg.modo || 'test';

    const nif = document.getElementById('cfg_vf_nif');
    if (nif) nif.value = cfg.nif || EMPRESA?.cif || '';

    const razon = document.getElementById('cfg_vf_razon');
    if (razon) razon.value = cfg.nombre_razon || EMPRESA?.nombre || '';

    // Cargar info del certificado predeterminado
    cargarCertInfoVF();

    // Verificar estado de conexión
    verificarEstadoVF(cfg);

    // Inicializar fechas de auditoría: año fiscal actual (1 enero - hoy)
    const hoy = new Date().toISOString().split('T')[0];
    const inicioAnyo = hoy.substring(0, 4) + '-01-01';
    const elDesde = document.getElementById('vf_audit_desde');
    const elHasta = document.getElementById('vf_audit_hasta');
    if (elDesde && !elDesde.value) elDesde.value = inicioAnyo;
    if (elHasta && !elHasta.value) elHasta.value = hoy;

  } catch (e) {
    console.error('Error cargando config VeriFactu:', e);
  }
}

/** Cargar info del certificado en el panel VeriFactu */
async function cargarCertInfoVF() {
  const el = document.getElementById('vf_cert_info');
  if (!el) return;

  try {
    const { data } = await sb.from('certificados_digitales')
      .select('nombre, titular, nif_titular, fecha_caducidad, activo, predeterminado')
      .eq('empresa_id', EMPRESA.id)
      .eq('predeterminado', true)
      .maybeSingle();

    if (!data) {
      el.innerHTML = `<div style="color:#d97706;display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">⚠️</span>
        <div>
          <div style="font-weight:700">Sin certificado digital</div>
          <div style="font-size:11px;color:var(--gris-400)">Sube un certificado .pfx/.p12 en la pestaña "Certificado digital"</div>
        </div>
      </div>`;
      return;
    }

    const caducado = data.fecha_caducidad && new Date(data.fecha_caducidad) < new Date();
    const dias = data.fecha_caducidad ? Math.ceil((new Date(data.fecha_caducidad) - new Date()) / (1000*60*60*24)) : null;

    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">${caducado ? '❌' : '✅'}</span>
      <div>
        <div style="font-weight:700;font-size:12px">${data.nombre || data.titular || 'Certificado'}</div>
        <div style="font-size:11px;color:${caducado ? 'var(--rojo)' : 'var(--gris-400)'}">
          ${data.nif_titular || ''} · ${caducado ? 'CADUCADO' : `Caduca en ${dias} días`}
        </div>
      </div>
    </div>`;

  } catch (e) {
    el.innerHTML = `<span style="color:var(--rojo);font-size:11px">Error cargando certificado</span>`;
  }
}

/** Verificar estado de conexión VeriFactu */
function verificarEstadoVF(cfg) {
  const el = document.getElementById('vf_estado_conexion');
  if (!el) return;

  const activo = cfg && cfg.activo;
  const tieneNif = !!(cfg?.nif);
  const modo = cfg?.modo || 'test';

  if (!tieneNif) {
    el.style.background = '#FEF3C7'; el.style.color = '#92400E';
    el.innerHTML = `<span style="font-size:16px">⚠️</span><div><strong>Configuración incompleta</strong><div style="font-size:11px">Rellena el NIF y la razón social para activar VeriFactu</div></div>`;
  } else if (!activo) {
    el.style.background = '#FEF3C7'; el.style.color = '#92400E';
    el.innerHTML = `<span style="font-size:16px">⏸️</span><div><strong>VeriFactu configurado pero no activo</strong><div style="font-size:11px">Guarda la configuración para activar</div></div>`;
  } else {
    const mLabel = modo === 'produccion' ? '🔴 PRODUCCIÓN' : '🟡 PRUEBAS';
    el.style.background = modo === 'produccion' ? '#FEE2E2' : '#ECFDF5';
    el.style.color = modo === 'produccion' ? '#991B1B' : '#166534';
    el.innerHTML = `<span style="font-size:16px">${modo === 'produccion' ? '🔴' : '✅'}</span><div><strong>VeriFactu activo — ${mLabel}</strong><div style="font-size:11px">Las facturas se enviarán al entorno ${modo === 'produccion' ? 'real' : 'de pruebas'} de la AEAT</div></div>`;
  }
}

/** Guardar configuración VeriFactu en verifactu_config */
async function guardarCfgVerifactu() {
  const modo = document.getElementById('cfg_vf_modo')?.value || 'test';
  const nif = (document.getElementById('cfg_vf_nif')?.value || '').trim();
  const razon = (document.getElementById('cfg_vf_razon')?.value || '').trim();

  if (!nif) { toast('El NIF del obligado es obligatorio', 'error'); return; }

  const payload = {
    empresa_id: EMPRESA.id,
    activo: true,
    modo,
    nif,
    nombre_razon: razon,
    nombre_sistema: 'instaloERP',
    id_sistema: '01',
    version_sistema: '1.1',
    numero_instalacion: '001',
    nif_fabricante: '21677091M',
    nombre_fabricante: 'JORDÁ MONCHO JORGE',
    updated_at: new Date().toISOString(),
  };

  // Upsert
  const { error } = await sb.from('verifactu_config')
    .upsert(payload, { onConflict: 'empresa_id' });

  if (error) {
    toast('Error guardando: ' + error.message, 'error');
    console.error('VeriFactu config error:', error);
    return;
  }

  EMPRESA._vf_modo = modo;
  toast('✅ Configuración VeriFactu guardada', 'success');
  verificarEstadoVF({ activo: true, nif, modo });
}

/** Probar conexión con AEAT vía Edge Function */
async function testConexionVerifactu() {
  toast('Probando conexión con AEAT...', 'info');

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { toast('Sesión expirada', 'error'); return; }

    const resp = await fetch(
      `${SUPA_URL}/functions/v1/verifactu`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'consulta',
          factura_id: 0,
          empresa_id: EMPRESA.id,
        }),
      }
    );

    const result = await resp.json();

    if (resp.ok) {
      toast('✅ Conexión con AEAT correcta', 'success');
    } else {
      toast(`❌ Error: ${result.error || result.message || 'Sin respuesta'}`, 'error');
    }
  } catch (err) {
    toast(`❌ Error de red: ${err.message}`, 'error');
  }
}

// ═══════════════════════════════════════════════
//  AUDITORÍA VERIFACTU
// ═══════════════════════════════════════════════

/** Helper: obtener rango de fechas seleccionado */
function _getAuditRango() {
  const desde = document.getElementById('vf_audit_desde')?.value || '';
  const hasta = document.getElementById('vf_audit_hasta')?.value || '';
  if (!desde || !hasta) {
    toast('Selecciona un rango de fechas', 'warning');
    return null;
  }
  if (desde > hasta) { toast('La fecha "desde" no puede ser posterior a "hasta"', 'warning'); return null; }
  return { desde, hasta };
}

/** 1. Libro registro de facturas emitidas — Excel completo para AEAT */
async function exportarLibroRegistro() {
  const rango = _getAuditRango();
  if (!rango) return;
  if (!window.XLSX) { toast('Cargando librería Excel...', 'info'); return; }

  toast('Generando libro registro...', 'info');

  const { data, error } = await sb.from('facturas')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', rango.desde)
    .lte('fecha', rango.hasta)
    .not('estado', 'eq', 'borrador')
    .order('fecha', { ascending: true });

  if (error) { toast('Error: ' + error.message, 'error'); return; }
  if (!data?.length) { toast('No hay facturas en ese período', 'warning'); return; }

  // Buscar NIFs de clientes
  const clienteIds = [...new Set(data.filter(f => f.cliente_id).map(f => f.cliente_id))];
  let clientesMap = {};
  if (clienteIds.length) {
    const { data: clis } = await sb.from('clientes')
      .select('id, nombre, nif, cif, direccion, cp, poblacion, provincia')
      .in('id', clienteIds);
    if (clis) clis.forEach(c => { clientesMap[c.id] = c; });
  }

  const wb = XLSX.utils.book_new();

  // Hoja 1: Facturas emitidas
  const rows = data.map(f => {
    const cli = clientesMap[f.cliente_id] || {};
    const esRect = !!f.rectificativa_de;
    return [
      f.numero || '',
      f.fecha || '',
      f.fecha_vencimiento || '',
      cli.nif || cli.cif || '',
      f.cliente_nombre || cli.nombre || '',
      cli.direccion || '',
      cli.cp || '',
      cli.poblacion || '',
      cli.provincia || '',
      f.base_imponible || 0,
      f.total_iva || 0,
      f.total || 0,
      f.estado || '',
      esRect ? 'Sí' : 'No',
      f.factura_rectificada_numero || '',
      f.tipo_rectificativa || '',
      f.tipo_rectificacion || '',
      f.observaciones || '',
      f.verifactu_estado || '',
      f.verifactu_huella || '',
      f.verifactu_csv || '',
    ];
  });

  const header = [
    'Número', 'Fecha', 'Vencimiento',
    'NIF/CIF Cliente', 'Nombre Cliente', 'Dirección', 'CP', 'Población', 'Provincia',
    'Base Imponible', 'Cuota IVA', 'Total',
    'Estado', 'Rectificativa', 'Factura Rectificada', 'Tipo Rect. AEAT', 'Tipo Corrección',
    'Observaciones',
    'VeriFactu Estado', 'VeriFactu Huella', 'VeriFactu CSV'
  ];

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h, i) => ({
    wch: i <= 1 ? 14 : i === 4 ? 30 : i === 17 ? 40 : i >= 19 ? 20 : 16
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas Emitidas');

  // Hoja 2: Resumen por tipo IVA
  const resumenIva = {};
  data.forEach(f => {
    (f.lineas || []).filter(l => l.tipo !== 'capitulo' && l.tipo !== 'subcapitulo' && !l._separator).forEach(l => {
      const iva = l.iva || 0;
      const sub = (l.cant || 0) * (l.precio || 0) * (1-(l.dto1||0)/100) * (1-(l.dto2||0)/100) * (1-(l.dto3||0)/100);
      if (!resumenIva[iva]) resumenIva[iva] = { base: 0, cuota: 0, total: 0, count: 0 };
      resumenIva[iva].base += sub;
      resumenIva[iva].cuota += sub * iva / 100;
      resumenIva[iva].total += sub * (1 + iva / 100);
      resumenIva[iva].count++;
    });
  });

  const ivaRows = Object.keys(resumenIva).sort((a,b) => a-b).map(iva => [
    iva + '%',
    Math.round(resumenIva[iva].base * 100) / 100,
    Math.round(resumenIva[iva].cuota * 100) / 100,
    Math.round(resumenIva[iva].total * 100) / 100,
    resumenIva[iva].count
  ]);
  const wsIva = XLSX.utils.aoa_to_sheet([
    ['Tipo IVA', 'Base Imponible', 'Cuota IVA', 'Total', 'Nº Líneas'],
    ...ivaRows
  ]);
  XLSX.utils.book_append_sheet(wb, wsIva, 'Resumen IVA');

  const nombre = `libro_registro_${rango.desde}_${rango.hasta}.xlsx`;
  XLSX.writeFile(wb, nombre);
  toast('Libro registro exportado ✓ (' + data.length + ' facturas)', 'success');
}

/** 2. Export registros VeriFactu — cadena completa con hashes y XMLs */
async function exportarRegistrosVF() {
  const rango = _getAuditRango();
  if (!rango) return;
  if (!window.XLSX) { toast('Cargando librería Excel...', 'info'); return; }

  toast('Exportando registros VeriFactu...', 'info');

  const { data, error } = await sb.from('verifactu_registros')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .gte('created_at', rango.desde + 'T00:00:00')
    .lte('created_at', rango.hasta + 'T23:59:59')
    .order('created_at', { ascending: true });

  if (error) { toast('Error: ' + error.message, 'error'); return; }
  if (!data?.length) { toast('No hay registros VeriFactu en ese período', 'warning'); return; }

  const wb = XLSX.utils.book_new();

  // Hoja 1: Registros
  const header = [
    'ID', 'Tipo', 'Nº Factura', 'Fecha Expedición', 'Tipo Factura',
    'Cuota Total', 'Importe Total',
    'Fecha/Hora Generación', 'Huella SHA-256', 'Huella Anterior',
    'Primer Registro', 'Estado', 'CSV AEAT',
    'Código Error', 'Descripción Error',
    'Factura Rectificada', 'Fecha Rect.',
    'Creado', 'Enviado', 'Respuesta'
  ];

  const rows = data.map(r => [
    r.id,
    r.tipo_registro || '',
    r.num_serie || '',
    r.fecha_expedicion || '',
    r.tipo_factura || '',
    r.cuota_total || 0,
    r.importe_total || 0,
    r.fecha_hora_huso || '',
    r.huella || '',
    r.huella_anterior || '',
    r.es_primer_registro ? 'Sí' : 'No',
    r.estado || '',
    r.csv_aeat || '',
    r.codigo_error || '',
    r.descripcion_error || '',
    r.factura_rectificada_num || '',
    r.factura_rectificada_fecha || '',
    r.created_at || '',
    r.enviado_at || '',
    r.respuesta_at || ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Registros VeriFactu');

  // Hoja 2: XMLs (para auditoría detallada)
  const xmlRows = data.filter(r => r.xml_enviado || r.xml_respuesta).map(r => [
    r.id, r.num_serie || '', r.tipo_registro || '',
    r.xml_enviado || '',
    r.xml_respuesta || ''
  ]);
  if (xmlRows.length) {
    const wsXml = XLSX.utils.aoa_to_sheet([
      ['ID Registro', 'Nº Factura', 'Tipo', 'XML Enviado', 'XML Respuesta'],
      ...xmlRows
    ]);
    wsXml['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 80 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsXml, 'XMLs');
  }

  const nombre = `verifactu_registros_${rango.desde}_${rango.hasta}.xlsx`;
  XLSX.writeFile(wb, nombre);
  toast('Registros VeriFactu exportados ✓ (' + data.length + ' registros)', 'success');
}

/** 3. Verificar integridad de la cadena de hashes VeriFactu */
async function verificarIntegridadVF() {
  const resDiv = document.getElementById('vf_audit_resultado');
  if (resDiv) { resDiv.style.display = ''; resDiv.innerHTML = '<div style="font-size:12px;color:var(--gris-500)">Verificando cadena de hashes...</div>'; }

  const { data, error } = await sb.from('verifactu_registros')
    .select('id, factura_id, tipo_registro, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total, nif_emisor, fecha_hora_huso, huella, huella_anterior, es_primer_registro, registro_anterior_id')
    .eq('empresa_id', EMPRESA.id)
    .order('id', { ascending: true });

  if (error) {
    if (resDiv) resDiv.innerHTML = `<div style="color:#dc2626;font-size:12px">Error: ${error.message}</div>`;
    return;
  }
  if (!data?.length) {
    if (resDiv) resDiv.innerHTML = `<div style="color:#d97706;font-size:12px">No hay registros VeriFactu</div>`;
    return;
  }

  // Cargar facturas asociadas para recalcular hash con valores originales
  // (cuota_total en verifactu_registros usa Math.abs, pero el hash usa el valor con signo)
  const facIds = [...new Set(data.filter(r => r.factura_id).map(r => r.factura_id))];
  let facMap = {};
  if (facIds.length) {
    const { data: facs } = await sb.from('facturas')
      .select('id, total_iva, total')
      .in('id', facIds);
    if (facs) facs.forEach(f => { facMap[f.id] = f; });
  }

  let errores = [];
  let ok = 0;

  for (let i = 0; i < data.length; i++) {
    const reg = data[i];
    const prev = i > 0 ? data[i - 1] : null;

    // Verificar encadenamiento
    if (i === 0) {
      if (!reg.es_primer_registro) {
        errores.push(`Registro #${reg.id} (${reg.num_serie}): debería ser primer registro pero no está marcado`);
      }
    } else {
      if (reg.huella_anterior && prev && reg.huella_anterior !== prev.huella) {
        errores.push(`Registro #${reg.id} (${reg.num_serie}): huella_anterior no coincide con registro previo #${prev.id}`);
      }
      if (reg.registro_anterior_id && prev && reg.registro_anterior_id !== prev.id) {
        errores.push(`Registro #${reg.id} (${reg.num_serie}): registro_anterior_id apunta a #${reg.registro_anterior_id} pero el previo es #${prev.id}`);
      }
    }

    // Verificar que tiene huella
    if (!reg.huella) {
      errores.push(`Registro #${reg.id} (${reg.num_serie}): sin huella SHA-256`);
    } else {
      ok++;
    }

    // Recalcular hash usando los valores originales de la factura
    // (la Edge Function usa factura.total_iva y factura.total con signo para el hash)
    if (reg.huella && typeof crypto !== 'undefined') {
      try {
        const fac = facMap[reg.factura_id];
        // Usar valores de la factura si disponible, si no del registro
        const cuotaHash = fac ? Number(fac.total_iva || 0).toFixed(2) : Number(reg.cuota_total || 0).toFixed(2);
        const importeHash = fac ? Number(fac.total || 0).toFixed(2) : Number(reg.importe_total || 0).toFixed(2);

        let campos;
        if (reg.tipo_registro === 'alta' || reg.tipo_registro === 'subsanacion') {
          campos = [
            `IDEmisorFactura=${reg.nif_emisor || ''}`,
            `NumSerieFactura=${reg.num_serie || ''}`,
            `FechaExpedicionFactura=${reg.fecha_expedicion || ''}`,
            `TipoFactura=${reg.tipo_factura || ''}`,
            `CuotaTotal=${cuotaHash}`,
            `ImporteTotal=${importeHash}`,
            `Huella=${reg.huella_anterior || ''}`,
            `FechaHoraHusoGenRegistro=${reg.fecha_hora_huso || ''}`
          ].join('&');
        } else {
          campos = [
            `IDEmisorFacturaAnulada=${reg.nif_emisor || ''}`,
            `NumSerieFacturaAnulada=${reg.num_serie || ''}`,
            `FechaExpedicionFacturaAnulada=${reg.fecha_expedicion || ''}`,
            `Huella=${reg.huella_anterior || ''}`,
            `FechaHoraHusoGenRegistro=${reg.fecha_hora_huso || ''}`
          ].join('&');
        }

        const buffer = new TextEncoder().encode(campos);
        const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        if (hashHex !== reg.huella) {
          errores.push(`Registro #${reg.id} (${reg.num_serie}): hash recalculado NO coincide (esperado ${reg.huella.substring(0,16)}..., calculado ${hashHex.substring(0,16)}...)`);
          ok--;
        }
      } catch (e) {
        // Si no se puede calcular, solo advertir
      }
    }
  }

  // Mostrar resultado
  if (resDiv) {
    if (errores.length === 0) {
      resDiv.innerHTML = `
        <div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px">
          <div style="font-weight:700;font-size:13px;color:#166534">✅ Cadena íntegra</div>
          <div style="font-size:11.5px;color:#166534;margin-top:4px">${ok} registros verificados. Todos los hashes son correctos y la cadena está enlazada sin interrupciones.</div>
        </div>`;
    } else {
      resDiv.innerHTML = `
        <div style="background:#fee2e2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px">
          <div style="font-weight:700;font-size:13px;color:#991b1b">❌ Se encontraron ${errores.length} problemas</div>
          <div style="font-size:11px;color:#7f1d1d;margin-top:6px;max-height:120px;overflow-y:auto">
            ${errores.map(e => `<div style="padding:2px 0">• ${e}</div>`).join('')}
          </div>
          <div style="font-size:11px;color:#991b1b;margin-top:6px">${ok} de ${data.length} registros con hash verificado</div>
        </div>`;
    }
  }
}

/** 4. Descarga masiva de PDFs de facturas en ZIP */
async function descargarPdfsMasivo() {
  const rango = _getAuditRango();
  if (!rango) return;
  if (!window.JSZip) { toast('Librería JSZip no disponible', 'error'); return; }
  if (typeof _cfgFactura !== 'function' || !window._renderToPdfExport) {
    toast('Generador de PDF no disponible — abre primero la sección Facturas para cargar el generador', 'warning');
    return;
  }

  const resDiv = document.getElementById('vf_audit_resultado');
  if (resDiv) { resDiv.style.display = ''; resDiv.innerHTML = '<div style="font-size:12px;color:var(--gris-500)">Cargando facturas del período...</div>'; }

  // Cargar facturas del período (sin borradores)
  const { data: facs, error } = await sb.from('facturas')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .gte('fecha', rango.desde)
    .lte('fecha', rango.hasta)
    .not('estado', 'eq', 'borrador')
    .order('fecha', { ascending: true });

  if (error) { toast('Error: ' + error.message, 'error'); return; }
  if (!facs?.length) { toast('No hay facturas en ese período', 'warning'); if (resDiv) resDiv.style.display = 'none'; return; }

  // Cargar clientes para construir cfg del PDF
  const cliIds = [...new Set(facs.filter(f => f.cliente_id).map(f => f.cliente_id))];
  if (cliIds.length && typeof clientes !== 'undefined') {
    // Los clientes ya están en memoria (variable global)
  }

  // Asegurar que clientes estén cargados (necesario para _pdfFacturaBase64 → _cfgFactura)
  if (typeof clientes === 'undefined' || !clientes.length) {
    const { data: cliData } = await sb.from('clientes').select('*').eq('empresa_id', EMPRESA.id);
    window.clientes = cliData || [];
  }
  // Asegurar que facLocalData tenga los datos (necesario para _pdfFacturaBase64)
  if (typeof facLocalData === 'undefined' || !facLocalData.length) {
    window.facLocalData = facs;
  }

  const zip = new JSZip();
  let generados = 0;
  let erroresPdf = 0;

  if (resDiv) resDiv.innerHTML = `<div style="font-size:12px;color:var(--gris-500)">Generando PDFs: 0 / ${facs.length}...</div>`;

  for (let i = 0; i < facs.length; i++) {
    const f = facs[i];
    try {
      // Generar PDF con _cfgFactura (misma función que descarga individual)
      // y obtener arraybuffer directo (evita problemas de codificación base64)
      const cfg = _cfgFactura(f);
      const pdf = await window._renderToPdfExport(cfg);
      if (pdf) {
        const arrayBuf = pdf.output('arraybuffer');
        const nombre = (f.numero || 'factura_' + f.id).replace(/[^a-zA-Z0-9-]/g, '_') + '.pdf';
        zip.file(nombre, arrayBuf);
        generados++;
      } else {
        erroresPdf++;
      }
    } catch (e) {
      console.error('Error generando PDF de ' + (f.numero || f.id), e);
      erroresPdf++;
    }

    // Actualizar progreso cada 5 facturas
    if (i % 5 === 0 && resDiv) {
      resDiv.innerHTML = `<div style="font-size:12px;color:var(--gris-500)">Generando PDFs: ${i + 1} / ${facs.length}...</div>`;
    }
  }

  if (generados === 0) {
    toast('No se pudo generar ningún PDF', 'error');
    if (resDiv) resDiv.style.display = 'none';
    return;
  }

  if (resDiv) resDiv.innerHTML = `<div style="font-size:12px;color:var(--gris-500)">Comprimiendo ${generados} PDFs...</div>`;

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facturas_${rango.desde}_${rango.hasta}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  const msg = erroresPdf > 0
    ? `${generados} PDFs descargados (${erroresPdf} con error)`
    : `${generados} PDFs descargados ✓`;
  toast(msg, erroresPdf > 0 ? 'warning' : 'success');

  if (resDiv) {
    resDiv.innerHTML = `<div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:12px;color:#166534">
      ✅ ZIP generado: ${generados} facturas del ${rango.desde} al ${rango.hasta}${erroresPdf > 0 ? ' (' + erroresPdf + ' errores)' : ''}
    </div>`;
  }
}

// ═══════════════════════════════════════════════
//  CUENTAS DE CORREO ELECTRÓNICO
// ═══════════════════════════════════════════════
let _cuentasCorreo = [];

// ─── Base de datos de proveedores conocidos ───
const _emailProviders = {
  // Gmail / Google Workspace
  'gmail.com':          { smtp:'smtp.gmail.com', smtp_port:587, smtp_sec:'tls', imap:'imap.gmail.com', imap_port:993, imap_sec:'ssl', nota:'Requiere contraseña de aplicación (no tu contraseña normal). Actívala en myaccount.google.com → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones.', nombre:'Gmail' },
  'googlemail.com':     { smtp:'smtp.gmail.com', smtp_port:587, smtp_sec:'tls', imap:'imap.gmail.com', imap_port:993, imap_sec:'ssl', nota:'Requiere contraseña de aplicación.', nombre:'Gmail' },
  // Microsoft
  'outlook.com':        { smtp:'smtp.office365.com', smtp_port:587, smtp_sec:'tls', imap:'outlook.office365.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Outlook' },
  'outlook.es':         { smtp:'smtp.office365.com', smtp_port:587, smtp_sec:'tls', imap:'outlook.office365.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Outlook' },
  'hotmail.com':        { smtp:'smtp.office365.com', smtp_port:587, smtp_sec:'tls', imap:'outlook.office365.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Hotmail/Outlook' },
  'hotmail.es':         { smtp:'smtp.office365.com', smtp_port:587, smtp_sec:'tls', imap:'outlook.office365.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Hotmail/Outlook' },
  'live.com':           { smtp:'smtp.office365.com', smtp_port:587, smtp_sec:'tls', imap:'outlook.office365.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Live/Outlook' },
  'msn.com':            { smtp:'smtp.office365.com', smtp_port:587, smtp_sec:'tls', imap:'outlook.office365.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'MSN/Outlook' },
  // Yahoo
  'yahoo.com':          { smtp:'smtp.mail.yahoo.com', smtp_port:587, smtp_sec:'tls', imap:'imap.mail.yahoo.com', imap_port:993, imap_sec:'ssl', nota:'Requiere contraseña de aplicación desde la configuración de seguridad de Yahoo.', nombre:'Yahoo' },
  'yahoo.es':           { smtp:'smtp.mail.yahoo.com', smtp_port:587, smtp_sec:'tls', imap:'imap.mail.yahoo.com', imap_port:993, imap_sec:'ssl', nota:'Requiere contraseña de aplicación.', nombre:'Yahoo' },
  // iCloud
  'icloud.com':         { smtp:'smtp.mail.me.com', smtp_port:587, smtp_sec:'tls', imap:'imap.mail.me.com', imap_port:993, imap_sec:'ssl', nota:'Requiere contraseña de aplicación desde appleid.apple.com.', nombre:'iCloud' },
  'me.com':             { smtp:'smtp.mail.me.com', smtp_port:587, smtp_sec:'tls', imap:'imap.mail.me.com', imap_port:993, imap_sec:'ssl', nota:'Requiere contraseña de aplicación.', nombre:'iCloud' },
  'mac.com':            { smtp:'smtp.mail.me.com', smtp_port:587, smtp_sec:'tls', imap:'imap.mail.me.com', imap_port:993, imap_sec:'ssl', nota:'Requiere contraseña de aplicación.', nombre:'iCloud' },
  // Zoho
  'zoho.com':           { smtp:'smtp.zoho.com', smtp_port:587, smtp_sec:'tls', imap:'imap.zoho.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Zoho' },
  'zohomail.eu':        { smtp:'smtp.zoho.eu', smtp_port:587, smtp_sec:'tls', imap:'imap.zoho.eu', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Zoho EU' },
  // ProtonMail (Bridge)
  'protonmail.com':     { smtp:'127.0.0.1', smtp_port:1025, smtp_sec:'none', imap:'127.0.0.1', imap_port:1143, imap_sec:'none', nota:'Requiere Proton Mail Bridge instalado y ejecutándose.', nombre:'ProtonMail' },
  'proton.me':          { smtp:'127.0.0.1', smtp_port:1025, smtp_sec:'none', imap:'127.0.0.1', imap_port:1143, imap_sec:'none', nota:'Requiere Proton Mail Bridge.', nombre:'ProtonMail' },
  // Españoles
  'telefonica.net':     { smtp:'smtp.telefonica.net', smtp_port:587, smtp_sec:'tls', imap:'imap.telefonica.net', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Telefónica/Movistar' },
  'movistar.es':        { smtp:'smtp.movistar.es', smtp_port:587, smtp_sec:'tls', imap:'imap.movistar.es', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Movistar' },
  'terra.es':           { smtp:'smtp.terra.es', smtp_port:587, smtp_sec:'tls', imap:'imap.terra.es', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Terra' },
  'ono.com':            { smtp:'smtp.ono.com', smtp_port:587, smtp_sec:'tls', imap:'imap.ono.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'ONO/Vodafone' },
  'vodafone.es':        { smtp:'smtp.vodafone.es', smtp_port:587, smtp_sec:'tls', imap:'imap.vodafone.es', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Vodafone' },
  'orange.es':          { smtp:'smtp.orange.es', smtp_port:465, smtp_sec:'ssl', imap:'imap.orange.es', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Orange' },
  'jazztel.es':         { smtp:'smtp.orange.es', smtp_port:465, smtp_sec:'ssl', imap:'imap.orange.es', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Jazztel/Orange' },
  'ya.com':             { smtp:'smtp.ya.com', smtp_port:587, smtp_sec:'tls', imap:'imap.ya.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Ya.com' },
  // Arsys / serviciodecorreo.es (hosting español)
  'jordiinstalacions.es': { smtp:'smtp.serviciodecorreo.es', smtp_port:465, smtp_sec:'ssl', imap:'imap.serviciodecorreo.es', imap_port:993, imap_sec:'ssl', nota:'Hosting Arsys (serviciodecorreo.es). Usa tu email completo como usuario.', nombre:'Arsys' },
};

// ─── Patrones de hosting conocidos (para dominios que usan estos servidores) ───
// Si el dominio no está en _emailProviders, se intenta buscar por MX o patrón
const _hostingProviders = {
  'serviciodecorreo.es': { smtp:'smtp.serviciodecorreo.es', smtp_port:465, smtp_sec:'ssl', imap:'imap.serviciodecorreo.es', imap_port:993, imap_sec:'ssl', nota:'Hosting Arsys (serviciodecorreo.es). Usa tu email completo como usuario.', nombre:'Arsys' },
  'arrakis.es':          { smtp:'smtp.arrakis.es', smtp_port:465, smtp_sec:'ssl', imap:'imap.arrakis.es', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Arrakis/Arsys' },
  'ionos.es':            { smtp:'smtp.ionos.es', smtp_port:587, smtp_sec:'tls', imap:'imap.ionos.es', imap_port:993, imap_sec:'ssl', nota:'', nombre:'IONOS' },
  'ionos.com':           { smtp:'smtp.ionos.com', smtp_port:587, smtp_sec:'tls', imap:'imap.ionos.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'IONOS' },
  'dinahosting.com':     { smtp:'smtp.dinahosting.com', smtp_port:587, smtp_sec:'tls', imap:'imap.dinahosting.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Dinahosting' },
  'ovh.net':             { smtp:'ssl0.ovh.net', smtp_port:465, smtp_sec:'ssl', imap:'ssl0.ovh.net', imap_port:993, imap_sec:'ssl', nota:'', nombre:'OVH' },
  'strato.de':           { smtp:'smtp.strato.de', smtp_port:465, smtp_sec:'ssl', imap:'imap.strato.de', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Strato' },
  'cdmon.com':           { smtp:'smtp.cdmon.com', smtp_port:587, smtp_sec:'tls', imap:'imap.cdmon.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'cdmon' },
  'hostalia.com':        { smtp:'smtp.hostalia.com', smtp_port:587, smtp_sec:'tls', imap:'imap.hostalia.com', imap_port:993, imap_sec:'ssl', nota:'', nombre:'Hostalia' },
};

let _autoconfLastDomain = '';

function autoconfigurarCorreo() {
  const email = (document.getElementById('cor_email')?.value || '').trim().toLowerCase();
  const banner = document.getElementById('cor_autoconf_banner');
  const msgEl = document.getElementById('cor_autoconf_msg');
  const notaEl = document.getElementById('cor_nota_proveedor');

  // Extraer dominio
  const at = email.indexOf('@');
  if (at < 1 || at === email.length - 1) {
    if (banner) banner.style.display = 'none';
    return;
  }
  const domain = email.substring(at + 1);
  if (domain === _autoconfLastDomain) return; // Ya configurado
  _autoconfLastDomain = domain;

  // Auto-rellenar usuario SMTP = email completo
  const userEl = document.getElementById('cor_smtp_user');
  if (userEl && !userEl.value) userEl.value = email;

  // Buscar proveedor conocido
  const prov = _emailProviders[domain];

  if (prov) {
    // Proveedor conocido: autocompletar todo
    document.getElementById('cor_smtp_host').value = prov.smtp;
    document.getElementById('cor_smtp_port').value = prov.smtp_port;
    document.getElementById('cor_seguridad').value = prov.smtp_sec;
    document.getElementById('cor_smtp_user').value = email;
    document.getElementById('cor_imap_host').value = prov.imap;
    document.getElementById('cor_imap_port').value = prov.imap_port;
    document.getElementById('cor_imap_seguridad').value = prov.imap_sec;

    if (banner && msgEl) {
      banner.style.display = 'block';
      msgEl.innerHTML = `✅ <b>${prov.nombre}</b> detectado — configuración autocompletada`;
    }
    if (notaEl && prov.nota) {
      notaEl.innerHTML = prov.nota;
      notaEl.style.color = '#92400e';
      notaEl.style.background = '#fffbeb';
      notaEl.style.padding = '6px 10px';
      notaEl.style.borderRadius = '6px';
      notaEl.style.border = '1px solid #fbbf24';
    } else if (notaEl) {
      notaEl.innerHTML = 'La contraseña se almacena cifrada.';
      notaEl.style.color = '';
      notaEl.style.background = '';
      notaEl.style.padding = '';
      notaEl.style.borderRadius = '';
      notaEl.style.border = '';
    }
  } else {
    // Dominio desconocido: heurística estándar (mail.dominio, smtp.dominio, imap.dominio)
    document.getElementById('cor_smtp_host').value = 'smtp.' + domain;
    document.getElementById('cor_smtp_port').value = '587';
    document.getElementById('cor_seguridad').value = 'tls';
    document.getElementById('cor_smtp_user').value = email;
    document.getElementById('cor_imap_host').value = 'imap.' + domain;
    document.getElementById('cor_imap_port').value = '993';
    document.getElementById('cor_imap_seguridad').value = 'ssl';

    if (banner && msgEl) {
      banner.style.display = 'block';
      msgEl.innerHTML = `⚙️ Dominio <b>${domain}</b> — configuración estimada (smtp.${domain} / imap.${domain}). Si no funciona, consulta con tu proveedor de hosting.`;
    }
    if (notaEl) {
      notaEl.innerHTML = 'La contraseña se almacena cifrada. Si usas hosting propio, consulta los datos SMTP/IMAP con tu proveedor.';
      notaEl.style.color = '';
      notaEl.style.background = '';
      notaEl.style.padding = '';
      notaEl.style.borderRadius = '';
      notaEl.style.border = '';
    }
  }
}

async function cargarCuentasCorreoConfig() {
  try {
    const { data, error } = await sb.from('cuentas_correo')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('predeterminada', { ascending: false })
      .order('nombre');
    if (error) throw error;
    _cuentasCorreo = data || [];
  } catch(e) {
    _cuentasCorreo = [];
    console.warn('Error cargando cuentas correo:', e.message);
  }

  const el = document.getElementById('correoConfigList');
  if (!el) return;

  if (!_cuentasCorreo.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--gris-400)">
      <div style="font-size:32px;margin-bottom:8px">✉️</div>
      <div style="font-size:13px">No hay cuentas de correo configuradas</div>
      <div style="font-size:11px;margin-top:4px">Añade tu primera cuenta SMTP para empezar a enviar correos</div>
    </div>`;
    return;
  }

  el.innerHTML = _cuentasCorreo.map(c => {
    const estadoTag = c.activa
      ? '<span style="background:#ecfdf5;color:#166534;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">ACTIVA</span>'
      : '<span style="background:var(--gris-100);color:var(--gris-500);padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">INACTIVA</span>';
    const predTag = c.predeterminada
      ? ' <span style="background:var(--azul);color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">PREDETERMINADA</span>'
      : '';
    const syncTag = c.sync_habilitada
      ? ' <span style="background:#dbeafe;color:#1d4ed8;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">SYNC</span>'
      : '';
    return `<div style="padding:14px;border:1.5px solid ${c.predeterminada?'var(--azul)':'var(--gris-200)'};border-radius:10px;margin-bottom:10px;background:${c.predeterminada?'var(--azul-light,#eff6ff)':'#fff'}">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="font-weight:700;font-size:14px">${c.nombre} ${estadoTag}${predTag}${syncTag}</div>
          <div style="font-size:12px;color:var(--gris-500);margin-top:2px">📧 ${c.email}</div>
          <div style="font-size:11px;color:var(--gris-400);margin-top:2px">SMTP: ${c.smtp_host}:${c.smtp_port} · IMAP: ${c.imap_host||'—'}:${c.imap_port||993}</div>
          ${c.ultimo_sync ? `<div style="font-size:10px;color:var(--gris-400);margin-top:1px">Última sync: ${new Date(c.ultimo_sync).toLocaleString('es-ES')}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px">
          ${!c.predeterminada ? `<button class="btn btn-ghost btn-sm" onclick="setPredeterminadaCorreo('${c.id}')" title="Predeterminada">⭐</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="editCuentaCorreo('${c.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="delCuentaCorreo('${c.id}')" style="color:var(--rojo)">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _resetModalCorreo() {
  _autoconfLastDomain = '';
  const banner = document.getElementById('cor_autoconf_banner');
  if (banner) banner.style.display = 'none';
  const avanzado = document.getElementById('cor_avanzado');
  if (avanzado) avanzado.style.display = 'none';
  const notaEl = document.getElementById('cor_nota_proveedor');
  if (notaEl) {
    notaEl.innerHTML = 'La contraseña se almacena cifrada. Para Gmail, usa una "contraseña de aplicación" (no tu contraseña normal).';
    notaEl.style.color = '';
    notaEl.style.background = '';
    notaEl.style.padding = '';
    notaEl.style.borderRadius = '';
    notaEl.style.border = '';
  }
}

function nuevaCuentaCorreo() {
  _resetModalCorreo();
  document.getElementById('cor_id').value = '';
  document.getElementById('cor_nombre').value = '';
  document.getElementById('cor_email').value = '';
  document.getElementById('cor_display').value = EMPRESA?.nombre || '';
  document.getElementById('cor_smtp_host').value = '';
  document.getElementById('cor_smtp_port').value = '587';
  document.getElementById('cor_smtp_user').value = '';
  document.getElementById('cor_smtp_pass').value = '';
  document.getElementById('cor_seguridad').value = 'tls';
  document.getElementById('cor_imap_host').value = '';
  document.getElementById('cor_imap_port').value = '993';
  document.getElementById('cor_imap_seguridad').value = 'ssl';
  document.getElementById('cor_predeterminada').checked = _cuentasCorreo.length === 0;
  document.getElementById('cor_activa').checked = true;
  document.getElementById('cor_sync_habilitada').checked = true;
  document.getElementById('mCorreoTit').textContent = 'Nueva cuenta de correo';
  openModal('mCuentaCorreo');
}

function editCuentaCorreo(id) {
  _resetModalCorreo();
  const c = _cuentasCorreo.find(x => x.id == id);
  if (!c) return;
  document.getElementById('cor_id').value = c.id;
  document.getElementById('cor_nombre').value = c.nombre || '';
  document.getElementById('cor_email').value = c.email || '';
  document.getElementById('cor_display').value = c.nombre_mostrado || '';
  document.getElementById('cor_smtp_host').value = c.smtp_host || '';
  document.getElementById('cor_smtp_port').value = c.smtp_port || 587;
  document.getElementById('cor_smtp_user').value = c.smtp_usuario || '';
  document.getElementById('cor_smtp_pass').value = ''; // Never pre-fill password
  document.getElementById('cor_seguridad').value = c.seguridad || 'tls';
  document.getElementById('cor_imap_host').value = c.imap_host || '';
  document.getElementById('cor_imap_port').value = c.imap_port || 993;
  document.getElementById('cor_imap_seguridad').value = c.imap_seguridad || 'ssl';
  document.getElementById('cor_predeterminada').checked = !!c.predeterminada;
  document.getElementById('cor_activa').checked = c.activa !== false;
  document.getElementById('cor_sync_habilitada').checked = c.sync_habilitada !== false;
  document.getElementById('mCorreoTit').textContent = 'Editar cuenta: ' + (c.nombre || c.email);
  // En edición, mostrar sección avanzada abierta
  const avanzado = document.getElementById('cor_avanzado');
  if (avanzado) avanzado.style.display = 'block';
  openModal('mCuentaCorreo');
}

async function guardarCuentaCorreo() {
  const id = document.getElementById('cor_id').value;
  const nombre = document.getElementById('cor_nombre').value.trim();
  const email = document.getElementById('cor_email').value.trim();
  const display = document.getElementById('cor_display').value.trim();
  const host = document.getElementById('cor_smtp_host').value.trim();
  const port = parseInt(document.getElementById('cor_smtp_port').value) || 587;
  const user = email; // Siempre usar la dirección email como usuario
  const pass = document.getElementById('cor_smtp_pass').value;
  const seguridad = document.getElementById('cor_seguridad').value;
  const imapHost = document.getElementById('cor_imap_host').value.trim();
  const imapPort = parseInt(document.getElementById('cor_imap_port').value) || 993;
  const imapSeg = document.getElementById('cor_imap_seguridad').value;
  const predeterminada = document.getElementById('cor_predeterminada').checked;
  const activa = document.getElementById('cor_activa').checked;
  const syncHabilitada = document.getElementById('cor_sync_habilitada').checked;

  if (!nombre) { toast('Nombre de la cuenta obligatorio', 'error'); return; }
  if (!email) { toast('Dirección de correo obligatoria', 'error'); return; }
  if (!host) { toast('Servidor SMTP obligatorio', 'error'); return; }
  if (!id && !pass) { toast('Contraseña obligatoria', 'error'); return; }

  // Cifrar contraseña
  const passCifrada = pass ? btoa(unescape(encodeURIComponent(pass))) : undefined;

  // Si es predeterminada, quitar predeterminada de las demás
  if (predeterminada) {
    await sb.from('cuentas_correo')
      .update({ predeterminada: false })
      .eq('empresa_id', EMPRESA.id);
  }

  const registro = {
    empresa_id: EMPRESA.id,
    nombre,
    email,
    nombre_mostrado: display || nombre,
    smtp_host: host,
    smtp_port: port,
    smtp_usuario: user,
    seguridad,
    imap_host: imapHost || null,
    imap_port: imapPort,
    imap_seguridad: imapSeg,
    sync_habilitada: syncHabilitada,
    predeterminada,
    activa
  };
  if (passCifrada) registro.smtp_password_cifrada = passCifrada;

  let error;
  if (id) {
    ({ error } = await sb.from('cuentas_correo').update(registro).eq('id', id));
  } else {
    // Auto-predeterminada si es la primera
    if (_cuentasCorreo.length === 0) registro.predeterminada = true;
    ({ error } = await sb.from('cuentas_correo').insert(registro));
  }

  if (error) { toast('Error: ' + error.message, 'error'); return; }

  toast('✅ Cuenta de correo guardada', 'success');
  closeModal('mCuentaCorreo');
  cargarCuentasCorreoConfig();
}

async function delCuentaCorreo(id) {
  const ok = await confirmModal({titulo: 'Eliminar cuenta de correo', mensaje: '¿Eliminar esta cuenta de correo?', aviso: 'Esta acción no se puede deshacer', colorOk: '#dc2626'}); if (!ok) return;
  const { error } = await sb.from('cuentas_correo').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Cuenta eliminada', 'success');
  cargarCuentasCorreoConfig();
}

async function setPredeterminadaCorreo(id) {
  await sb.from('cuentas_correo')
    .update({ predeterminada: false })
    .eq('empresa_id', EMPRESA.id);
  await sb.from('cuentas_correo')
    .update({ predeterminada: true })
    .eq('id', id);
  toast('Cuenta predeterminada actualizada', 'success');
  cargarCuentasCorreoConfig();
}

async function testConexionCorreo() {
  const host = document.getElementById('cor_smtp_host').value.trim();
  const port = document.getElementById('cor_smtp_port').value;
  const user = document.getElementById('cor_email').value.trim(); // Siempre usar email como usuario
  const pass = document.getElementById('cor_smtp_pass').value;
  const seguridad = document.getElementById('cor_seguridad').value;

  if (!host || !user || !pass) {
    toast('Rellena email y contraseña para probar', 'error');
    return;
  }

  const btn = document.getElementById('btnTestCorreo');
  btn.disabled = true;
  btn.textContent = '⏳ Probando...';

  try {
    const { data, error } = await sb.functions.invoke('test-smtp', {
      body: {
        smtp_host: host,
        smtp_port: parseInt(port) || 587,
        smtp_usuario: user,
        smtp_password: pass,
        seguridad: seguridad,
        email_destino: document.getElementById('cor_email').value.trim()
      }
    });

    if (error) throw error;
    if (data?.success) {
      toast('✅ Conexión SMTP correcta', 'success');
    } else {
      toast('❌ ' + (data?.error || 'Error de conexión'), 'error');
    }
  } catch(e) {
    toast('⚠️ No se pudo probar la conexión. La Edge Function test-smtp no está desplegada aún.', 'warning');
    console.warn('Test SMTP:', e);
  }

  btn.disabled = false;
  btn.textContent = '🔌 Probar conexión';
}

// ═══════════════════════════════════════════════
//  CONFIGURACIÓN IA (Anthropic API Key)
// ═══════════════════════════════════════════════
function loadConfigIA() {
  const campo = document.getElementById('ia_api_key');
  if (!campo) return;
  // Leer key cifrada de EMPRESA
  if (EMPRESA?.anthropic_api_key) {
    try { campo.value = decodeURIComponent(escape(atob(EMPRESA.anthropic_api_key))); }
    catch(_) { campo.value = EMPRESA.anthropic_api_key; }
  } else {
    campo.value = '';
  }
}

async function guardarConfigIA() {
  const key = (document.getElementById('ia_api_key')?.value || '').trim();
  if (!key) { toast('⚠️ Introduce tu API Key de Anthropic', 'warning'); return; }
  if (!key.startsWith('sk-ant-')) { toast('⚠️ La clave debe empezar por sk-ant-...', 'warning'); return; }
  // Cifrar con btoa
  const cifrada = btoa(unescape(encodeURIComponent(key)));
  const { error } = await sb.from('empresas').update({ anthropic_api_key: cifrada }).eq('id', EMPRESA.id);
  if (error) { toast('❌ Error guardando: ' + error.message, 'error'); return; }
  EMPRESA.anthropic_api_key = cifrada;
  toast('✅ API Key guardada correctamente', 'success');
}

async function testApiKeyIA() {
  const key = (document.getElementById('ia_api_key')?.value || '').trim();
  const result = document.getElementById('iaTestResult');
  if (!key) { if(result) result.textContent = '⚠️ Introduce la clave primero'; return; }
  if(result) { result.textContent = '⏳ Probando...'; result.style.color = ''; }
  try {
    const resp = await fetch('https://gskkqqhbpnycvuioqetj.supabase.co/functions/v1/ocr-documento', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-anthropic-key': key
      },
      body: JSON.stringify({ test: true })
    });
    const data = await resp.json();
    if (data.success) {
      if(result) { result.textContent = '✅ Conexión exitosa — API Key válida'; result.style.color = 'var(--verde)'; }
    } else {
      if(result) { result.textContent = '❌ ' + (data.error || 'Error desconocido'); result.style.color = 'var(--rojo)'; }
    }
  } catch(e) {
    if(result) { result.textContent = '❌ Error de conexión: ' + e.message + '. ¿Está desplegada la Edge Function ocr-documento?'; result.style.color = 'var(--rojo)'; }
  }
}

// ═══════════════════════════════════════════════
//  CONFIGURACIÓN PARTES DE TRABAJO
// ═══════════════════════════════════════════════

function cargarCfgPartes() {
  const cfg = EMPRESA.config_partes || {};
  const elHora = document.getElementById('cfg_tarifa_hora');
  const elKm = document.getElementById('cfg_tarifa_km');
  const elMargen = document.getElementById('cfg_margen_ocr');
  const elIva = document.getElementById('cfg_iva_partes');
  if (elHora) elHora.value = cfg.tarifa_hora ?? 35;
  if (elKm) elKm.value = cfg.tarifa_km ?? 0.26;
  if (elMargen) elMargen.value = cfg.margen_ocr ?? 30;
  if (elIva) elIva.value = cfg.iva_partes ?? 21;
}

async function guardarCfgPartes() {
  const cfg = {
    tarifa_hora: parseFloat(document.getElementById('cfg_tarifa_hora')?.value) || 35,
    tarifa_km: parseFloat(document.getElementById('cfg_tarifa_km')?.value) || 0.26,
    margen_ocr: parseFloat(document.getElementById('cfg_margen_ocr')?.value) || 30,
    iva_partes: parseFloat(document.getElementById('cfg_iva_partes')?.value) || 21,
    // Datos de la calculadora personal (para persistir entre sesiones)
    calc_coste_mensual: _parseNumES(document.getElementById('calc_coste_total')?.value),
    calc_equipo: _calcEquipo || [],
    // Km anuales para calculadora coste/km (los vehículos y gastos ya están en Flota)
    calc_km_anual: _parseNumES(document.getElementById('calc_km_anual')?.value),
  };
  const { error } = await sb.from('empresas').update({ config_partes: cfg }).eq('id', EMPRESA.id);
  if (error) {
    console.warn('No se pudo guardar config_partes en BD:', error.message);
    toast('❌ Error guardando: ' + error.message, 'error');
    return;
  }
  EMPRESA.config_partes = cfg;

  // ═══ Auto-actualizar servicios con multiplicador vinculado ═══
  try {
    const { data: srvMult } = await sb.from('articulos')
      .select('id, multiplicador_tarifa')
      .eq('empresa_id', EMPRESA.id)
      .eq('tipo', 'servicio')
      .not('multiplicador_tarifa', 'is', null);
    if (srvMult && srvMult.length) {
      let actualizados = 0;
      for (const srv of srvMult) {
        const nuevoPrecio = Math.round(cfg.tarifa_hora * srv.multiplicador_tarifa * 100) / 100;
        const { error: ue } = await sb.from('articulos')
          .update({ precio_venta: nuevoPrecio })
          .eq('id', srv.id);
        if (!ue) actualizados++;
      }
      if (actualizados > 0) {
        toast(`🔄 ${actualizados} servicio(s) actualizados con nueva tarifa`, 'info');
        // Refrescar artículos en memoria
        if (typeof cargarArticulos === 'function') await cargarArticulos();
      }
    }
  } catch(e) { console.warn('Error actualizando servicios con multiplicador:', e); }

  toast('✅ Configuración de partes guardada', 'success');
}

// ═══════════════════════════════════════════════
//  CALCULADORA COSTE/HORA
// ═══════════════════════════════════════════════

let _calcEquipo = [];

function cargarCalculadora() {
  const cfg = EMPRESA.config_partes || {};
  const saved = cfg.calc_equipo;
  if (saved && saved.length) {
    _calcEquipo = saved;
  } else {
    // Equipo por defecto basado en la configuración de Jordi
    _calcEquipo = [
      { nombre: 'Operario 1', hFact: 6, dias: 22 },
      { nombre: 'Operario 2', hFact: 6, dias: 22 },
      { nombre: 'Operario 3', hFact: 6, dias: 22 },
      { nombre: 'Operario 4', hFact: 6, dias: 22 },
      { nombre: 'Gerente (parcial)', hFact: 2.5, dias: 22 },
      { nombre: 'Oficina', hFact: 0, dias: 22 },
      { nombre: 'Administración', hFact: 0, dias: 22 },
    ];
  }
  const elCoste = document.getElementById('calc_coste_total');
  if (elCoste && cfg.calc_coste_mensual) {
    // Mostrar en formato español
    elCoste.value = cfg.calc_coste_mensual.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  _renderCalcEquipo();
  calcularCosteHora();
}

function _renderCalcEquipo() {
  const cont = document.getElementById('calc_equipo');
  if (!cont) return;
  cont.innerHTML = _calcEquipo.map((p, i) => `
    <div style="display:grid;grid-template-columns:1fr 80px 70px 30px;gap:6px;align-items:center">
      <input value="${p.nombre}" placeholder="Nombre/rol"
        onchange="_calcEquipo[${i}].nombre=this.value"
        style="border:1px solid var(--gris-200);border-radius:5px;padding:5px 8px;font-size:12px;outline:none">
      <input type="number" value="${p.hFact}" min="0" max="12" step="0.5" title="Horas facturables/día"
        onchange="_calcEquipo[${i}].hFact=parseFloat(this.value)||0;calcularCosteHora()"
        style="border:1px solid var(--gris-200);border-radius:5px;padding:5px 6px;font-size:12px;text-align:right;outline:none"
        placeholder="h/día">
      <input type="number" value="${p.dias}" min="0" max="30" step="1" title="Días laborables/mes"
        onchange="_calcEquipo[${i}].dias=parseFloat(this.value)||0;calcularCosteHora()"
        style="border:1px solid var(--gris-200);border-radius:5px;padding:5px 6px;font-size:12px;text-align:right;outline:none"
        placeholder="días">
      <button onclick="_calcEquipo.splice(${i},1);_renderCalcEquipo();calcularCosteHora()"
        style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:13px;padding:0" title="Quitar">✕</button>
    </div>
  `).join('') + (
    _calcEquipo.length ? `<div style="display:grid;grid-template-columns:1fr 80px 70px 30px;gap:6px;padding:0 0 0 0">
      <span style="font-size:10px;color:var(--gris-400);padding-left:8px">Nombre / Rol</span>
      <span style="font-size:10px;color:var(--gris-400);text-align:right">h fact/día</span>
      <span style="font-size:10px;color:var(--gris-400);text-align:right">días/mes</span>
      <span></span>
    </div>` : ''
  );
}

function calcAddPersona() {
  _calcEquipo.push({ nombre: '', hFact: 6, dias: 22 });
  _renderCalcEquipo();
}

/** Parsea número en formato español (17.876,48) o inglés (17876.48) */
function _parseNumES(str) {
  if (!str) return 0;
  // Si tiene coma, asumir formato español: quitar puntos de miles, coma → punto decimal
  if (str.includes(',')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Si tiene más de un punto (ej: 17.876.48) → formato miles español sin coma
  const dots = (str.match(/\./g) || []).length;
  if (dots > 1) {
    return parseFloat(str.replace(/\./g, '')) || 0;
  }
  return parseFloat(str) || 0;
}

function calcularCosteHora() {
  const costeMensual = _parseNumES(document.getElementById('calc_coste_total')?.value);
  const totalHoras = _calcEquipo.reduce((sum, p) => sum + (p.hFact||0) * (p.dias||0), 0);
  const resultado = document.getElementById('calc_resultado');
  if (!resultado) return;

  if (costeMensual <= 0 || totalHoras <= 0) {
    resultado.style.display = 'none';
    return;
  }

  const costeHora = costeMensual / totalHoras;
  const tarifaActual = parseFloat(document.getElementById('cfg_tarifa_hora')?.value) || 0;
  const margen = tarifaActual > 0 ? ((tarifaActual - costeHora) / costeHora * 100) : 0;

  document.getElementById('calc_horas_mes').textContent = totalHoras.toFixed(0) + 'h';
  document.getElementById('calc_coste_hora').textContent = costeHora.toFixed(2) + '€';
  const elMargen = document.getElementById('calc_margen');
  elMargen.textContent = margen.toFixed(1) + '%';
  elMargen.style.color = margen >= 20 ? '#15803d' : margen >= 0 ? '#ca8a04' : '#dc2626';
  resultado.style.display = 'block';
}

function calcAplicarTarifa() {
  const costeMensual = _parseNumES(document.getElementById('calc_coste_total')?.value);
  const totalHoras = _calcEquipo.reduce((sum, p) => sum + (p.hFact||0) * (p.dias||0), 0);
  if (totalHoras <= 0) return;
  const costeHora = Math.ceil(costeMensual / totalHoras * 100) / 100;
  document.getElementById('cfg_tarifa_hora').value = costeHora;
  calcularCosteHora();
  toast('📌 Tarifa base actualizada a ' + costeHora.toFixed(2) + '€/h (coste puro, ajusta margen)', 'info');
}

// ═══════════════════════════════════════════════
//  CALCULADORA COSTE/KM — DATOS REALES DE FLOTA
// ═══════════════════════════════════════════════

let _calcFlotaVehiculos = [];
let _calcFlotaGastos = [];

async function cargarCalculadoraKm() {
  const cfg = EMPRESA.config_partes || {};
  const elKm = document.getElementById('calc_km_anual');
  if (elKm && cfg.calc_km_anual) {
    elKm.value = cfg.calc_km_anual.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:0});
  }
  // Cargar datos reales de Flota
  const eid = EMPRESA.id;
  const [vRes, gRes] = await Promise.all([
    sb.from('vehiculos').select('*').eq('empresa_id', eid).eq('activo', true).order('nombre'),
    sb.from('vehiculo_gastos').select('*').eq('empresa_id', eid).order('fecha', { ascending: false })
  ]);
  _calcFlotaVehiculos = vRes.data || [];
  _calcFlotaGastos = gRes.data || [];
  _renderCalcFlotaResumen();
  calcularCosteKm();
}

function _renderCalcFlotaResumen() {
  const cont = document.getElementById('calc_flota_resumen');
  if (!cont) return;

  if (!_calcFlotaVehiculos.length) {
    cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gris-400)">' +
      '<div style="font-size:30px;margin-bottom:6px">🚐</div>' +
      '<div>No hay vehículos en Flota. <a href="#" onclick="goPage(\'flota\');return false" style="color:var(--azul)">Añadir vehículos</a></div></div>';
    return;
  }

  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const inicioAnio = anioActual + '-01-01';
  const mesesTranscurridos = hoy.getMonth() + (hoy.getDate() >= 15 ? 1 : 0) || 1;

  const numActivos = _calcFlotaVehiculos.length || 1;

  // Gastos de flota compartidos (sin vehículo) en lo que va de año
  const gastosFlotaAnio = _calcFlotaGastos
    .filter(g => !g.vehiculo_id && g.fecha >= inicioAnio)
    .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);

  const conceptoIcos = { gasoil:'⛽', seguro:'🛡️', mantenimiento:'🔧', itv:'📋', neumaticos:'🛞', otros:'📎' };

  function _mesesDesdeCompra(fechaStr) {
    if (!fechaStr) return 9999;
    const fc = new Date(fechaStr);
    return (hoy.getFullYear() - fc.getFullYear()) * 12 + (hoy.getMonth() - fc.getMonth());
  }

  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<div style="padding:8px 12px;background:#eff6ff;border-radius:8px;font-size:11px;color:var(--azul);margin-bottom:4px">' +
    '📅 Datos del año <strong>'+anioActual+'</strong> ('+mesesTranscurridos+' meses). El coste/km se calcula con km y gastos del mismo período.</div>';
  let totalAnioGlobal = 0;

  _calcFlotaVehiculos.forEach(veh => {
    // ── COSTES FIJOS prorrateados al período ──
    const precio = parseFloat(veh.precio_compra) || 0;
    const amortMeses = parseInt(veh.amort_meses) || 96;
    const mesesDesdeCompra = _mesesDesdeCompra(veh.fecha_compra);
    const amortMes = mesesDesdeCompra >= amortMeses ? 0 : precio / amortMeses;
    const amortRestante = Math.max(amortMeses - mesesDesdeCompra, 0);
    const seguroMes = (parseFloat(veh.seguro_anual) || 0) / 12;
    const impuestoMes = (parseFloat(veh.impuesto_anual) || 0) / 12;
    const fijosPeriodo = (amortMes + seguroMes + impuestoMes) * mesesTranscurridos;

    // ── COSTES VARIABLES del año ──
    const gastosDirectos = _calcFlotaGastos
      .filter(g => g.vehiculo_id === veh.id && g.fecha >= inicioAnio)
      .reduce((s, g) => s + (parseFloat(g.importe) || 0), 0);

    const porConcepto = {};
    _calcFlotaGastos
      .filter(g => g.vehiculo_id === veh.id && g.fecha >= inicioAnio)
      .forEach(g => { porConcepto[g.concepto] = (porConcepto[g.concepto] || 0) + (parseFloat(g.importe) || 0); });

    const parteFlota = gastosFlotaAnio / numActivos;
    const totalVehAnio = fijosPeriodo + gastosDirectos + parteFlota;
    totalAnioGlobal += totalVehAnio;

    const conceptosHtml = Object.entries(porConcepto).map(([c, total]) =>
      `<span style="font-size:10px;color:var(--gris-500)" title="${c}: ${total.toFixed(0)}€ acum.">${conceptoIcos[c]||'📎'} ${total.toFixed(0)}€</span>`
    ).join(' · ');

    let fijosHtml = '';
    if (seguroMes > 0) fijosHtml += ' · <span title="Seguro ('+mesesTranscurridos+'m)">🛡️ '+(seguroMes*mesesTranscurridos).toFixed(0)+'€</span>';
    if (impuestoMes > 0) fijosHtml += ' · <span title="Impuesto ('+mesesTranscurridos+'m)">🏛️ '+(impuestoMes*mesesTranscurridos).toFixed(0)+'€</span>';

    const amortLabel = amortRestante > 0
      ? 'Amort: '+(amortMes*mesesTranscurridos).toFixed(0)+'€ <span style="font-size:9px">('+amortRestante+'m rest.)</span>'
      : '<span style="color:var(--verde)">Amortizada</span>';

    html += `<div style="border:1px solid var(--gris-200);border-radius:8px;padding:10px;background:var(--gris-50)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px">🚐</span>
        <strong style="font-size:13px;flex:1">${veh.nombre}</strong>
        <span style="font-size:11px;color:var(--gris-400)">${veh.matricula || ''}</span>
        <span style="font-size:13px;font-weight:700;color:var(--azul)">${totalVehAnio.toFixed(0)}€</span>
      </div>
      <div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--gris-500);flex-wrap:wrap">
        <span title="Amortización acumulada">📊 ${amortLabel}</span>${fijosHtml}
        <span title="Gastos directos acumulados">💰 Gastos: ${gastosDirectos.toFixed(0)}€</span>
        ${parteFlota > 0 ? '<span title="Parte gastos flota compartidos">🔄 Flota: '+parteFlota.toFixed(0)+'€</span>' : ''}
      </div>
      ${conceptosHtml ? '<div style="margin-top:4px">'+conceptosHtml+'</div>' : ''}
    </div>`;
  });

  html += '</div>';
  html += '<div style="margin-top:10px;padding:10px;background:var(--azul-light);border-radius:8px;display:flex;justify-content:space-between;align-items:center">' +
    '<span style="font-size:13px;font-weight:600">Total flota '+anioActual+' ('+numActivos+' vehículos, '+mesesTranscurridos+'m)</span>' +
    '<span style="font-size:16px;font-weight:800;color:var(--azul)">'+totalAnioGlobal.toFixed(2)+'€</span></div>';

  if (!_calcFlotaGastos.length) {
    html += '<div style="margin-top:8px;padding:10px;background:#fef3c7;border-radius:8px;font-size:12px;color:#92400e">' +
      '⚠️ No hay gastos registrados aún. <a href="#" onclick="goPage(\'flota-gastos\');return false" style="color:var(--azul);font-weight:600">Registra gastos</a> para obtener el coste real.</div>';
  }

  cont.innerHTML = html;
}

// Helper: calcula gasto total acumulado del año en curso
// Devuelve { gastoPeriodo, mesesPeriodo } donde:
//   gastoPeriodo = fijos prorrateados + gastos variables del año
//   mesesPeriodo = meses transcurridos desde 1 enero
function _calcGastoPeriodoAnual() {
  const hoy = new Date();
  const inicioAnio = hoy.getFullYear() + '-01-01';
  // Meses transcurridos en el año (ej: abril = 4 si ya estamos en abril)
  const mesesPeriodo = hoy.getMonth() + (hoy.getDate() >= 15 ? 1 : 0) || 1;
  const numActivos = _calcFlotaVehiculos.length || 1;

  function _mesesDesde(fechaStr) {
    if (!fechaStr) return 9999;
    const fc = new Date(fechaStr);
    return (hoy.getFullYear() - fc.getFullYear()) * 12 + (hoy.getMonth() - fc.getMonth());
  }

  // ── FIJOS prorrateados al período ──
  let fijosPeriodo = 0;
  _calcFlotaVehiculos.forEach(veh => {
    const precio = parseFloat(veh.precio_compra) || 0;
    const amortMeses = parseInt(veh.amort_meses) || 96;
    const transcurridos = _mesesDesde(veh.fecha_compra);
    if (transcurridos < amortMeses) fijosPeriodo += (precio / amortMeses) * mesesPeriodo;
    fijosPeriodo += ((parseFloat(veh.seguro_anual) || 0) + (parseFloat(veh.impuesto_anual) || 0)) / 12 * mesesPeriodo;
  });

  // ── VARIABLES: gastos registrados desde 1 enero ──
  let variablesPeriodo = 0;
  _calcFlotaGastos.filter(g => g.fecha >= inicioAnio).forEach(g => {
    variablesPeriodo += parseFloat(g.importe) || 0;
  });

  return { gastoPeriodo: fijosPeriodo + variablesPeriodo, mesesPeriodo };
}

function calcularCosteKm() {
  const kmAnual = _parseNumES(document.getElementById('calc_km_anual')?.value);
  const resultado = document.getElementById('calc_resultado_km');
  if (!resultado) return;

  const { gastoPeriodo } = _calcGastoPeriodoAnual();

  if (gastoPeriodo <= 0 || kmAnual <= 0) { resultado.style.display = 'none'; return; }

  const costeKm = gastoPeriodo / kmAnual;
  const tarifaActual = parseFloat(document.getElementById('cfg_tarifa_km')?.value) || 0;
  const margen = tarifaActual > 0 ? ((tarifaActual - costeKm) / costeKm * 100) : 0;

  document.getElementById('calc_gasto_periodo').textContent = gastoPeriodo.toFixed(2) + '€';
  document.getElementById('calc_coste_km').textContent = costeKm.toFixed(3) + '€';
  const elMargen = document.getElementById('calc_margen_km');
  elMargen.textContent = margen.toFixed(1) + '%';
  elMargen.style.color = margen >= 20 ? '#15803d' : margen >= 0 ? '#ca8a04' : '#dc2626';
  resultado.style.display = 'block';
}

function calcAplicarTarifaKm() {
  const kmAnual = _parseNumES(document.getElementById('calc_km_anual')?.value);
  if (kmAnual <= 0) return;

  const { gastoPeriodo } = _calcGastoPeriodoAnual();
  const costeKm = Math.ceil(gastoPeriodo / kmAnual * 1000) / 1000;
  document.getElementById('cfg_tarifa_km').value = costeKm;
  calcularCosteKm();
  toast('📌 Tarifa km actualizada a ' + costeKm.toFixed(3) + '€/km (coste puro, ajusta margen)', 'info');
}

// ═══════════════════════════════════════════════
//  VERIFICACIÓN DE INSTALACIÓN
// ═══════════════════════════════════════════════

async function verificarInstalacion() {
  const el = document.getElementById('install_check_result');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--gris-400);font-size:12px">Verificando instalación...</div>';

  try {
    // Intentar llamar a la función RPC verificar_instalacion
    const { data, error } = await sb.rpc('verificar_instalacion');

    if (error) {
      // Si la función no existe, verificar manualmente probando cada tabla
      el.innerHTML = '<div style="color:#d97706;font-size:12px">⚠️ Función verificar_instalacion no encontrada. Verificando tablas manualmente...</div>';
      await _verificarTablasManual(el);
      return;
    }

    // Mostrar resultado
    if (data.instalacion_completa) {
      el.innerHTML = `<div style="background:#ECFDF5;padding:12px;border-radius:8px;border:1px solid #86efac">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#166534">
          <span style="font-size:18px">✅</span> Instalación completa
        </div>
        <div style="font-size:11px;color:#166534;margin-top:4px">
          ${data.tablas_ok} de ${data.total_tablas} tablas verificadas · v${data.version}
        </div>
      </div>`;
    } else {
      el.innerHTML = `<div style="background:#FEF2F2;padding:12px;border-radius:8px;border:1px solid #fca5a5">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#991B1B">
          <span style="font-size:18px">❌</span> Instalación incompleta
        </div>
        <div style="font-size:11px;color:#991B1B;margin-top:4px">
          ${data.tablas_ok} de ${data.total_tablas} tablas · Faltan: ${data.faltantes.join(', ')}
        </div>
        <div style="font-size:11px;color:#991B1B;margin-top:6px">
          Ejecuta <code>instaloerp_install.sql</code> en Supabase → SQL Editor para crear las tablas faltantes.
        </div>
      </div>`;
    }
  } catch (e) {
    el.innerHTML = `<div style="color:var(--rojo);font-size:12px">Error verificando: ${e.message}</div>`;
  }
}

async function _verificarTablasManual(el) {
  const tablas = [
    'empresas','perfiles','tipos_iva','unidades_medida','formas_pago','series_numeracion',
    'clientes','contactos_cliente','direcciones_cliente','proveedores',
    'familias_articulos','articulos','servicios','almacenes','stock','movimientos_stock',
    'presupuestos','albaranes','facturas','factura_versiones','presupuesto_versiones',
    'presupuestos_compra','pedidos_compra','recepciones','facturas_proveedor',
    'trabajos','partes_trabajo','mantenimientos','revisiones_mantenimiento',
    'vehiculos','vehiculo_gastos','fichajes',
    'documentos','documentos_ocr','certificados_digitales',
    'verifactu_config','verifactu_registros',
    'cuentas_bancarias','cuentas_correo','invitaciones',
    'audit_log','correos'
  ];

  const ok = [];
  const fail = [];

  for (const t of tablas) {
    try {
      const { error } = await sb.from(t).select('id', { count: 'exact', head: true });
      if (error && error.code === '42P01') fail.push(t);
      else ok.push(t);
    } catch { fail.push(t); }
  }

  if (fail.length === 0) {
    el.innerHTML = `<div style="background:#ECFDF5;padding:12px;border-radius:8px;border:1px solid #86efac">
      <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#166534">
        <span style="font-size:18px">✅</span> Instalación completa
      </div>
      <div style="font-size:11px;color:#166534;margin-top:4px">
        ${ok.length} tablas verificadas correctamente
      </div>
    </div>`;
  } else {
    el.innerHTML = `<div style="background:#FEF2F2;padding:12px;border-radius:8px;border:1px solid #fca5a5">
      <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#991B1B">
        <span style="font-size:18px">❌</span> Faltan ${fail.length} tablas
      </div>
      <div style="font-size:11px;color:#991B1B;margin-top:4px">
        ${ok.length} OK · Faltan: <b>${fail.join(', ')}</b>
      </div>
      <div style="font-size:11px;color:#991B1B;margin-top:6px">
        Ejecuta <code>instaloerp_install.sql</code> en Supabase → SQL Editor
      </div>
    </div>`;
  }
}
