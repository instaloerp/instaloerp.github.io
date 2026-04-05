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
    if (!confirm('Esta familia tiene ' + hijos.length + ' subfamilia(s). ¿Eliminar todo?')) return;
    // Eliminar hijos primero
    for (const h of hijos) { await sb.from('familias_articulos').delete().eq('id', h.id); }
  } else {
    if (!confirm('¿Eliminar "' + f.nombre + '"?')) return;
  }
  await sb.from('familias_articulos').delete().eq('id', id);
  if (_cfgFamSelId === id) _cfgFamSelId = null;
  await reloadCfg('familias'); toast('Eliminado', 'info');
}

async function delCfg(tabla,id,tipo) {
  if(!confirm('¿Eliminar?'))return;
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
  if (!confirm('¿Eliminar esta cuenta bancaria?')) return;
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

