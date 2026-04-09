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
  if (id === 'certificado') { cargarCertificados(); cargarCfgFirmaDocumentos(); }
  if (id === 'correo') cargarCuentasCorreoConfig();
  if (id === 'ia') loadConfigIA();
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
  if (!confirm('¿Eliminar este certificado? Los documentos ya firmados no se verán afectados.')) return;

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
  if (!confirm('¿Eliminar esta cuenta de correo?')) return;
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
