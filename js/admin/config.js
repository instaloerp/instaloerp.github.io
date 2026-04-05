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
    cuentasBancarias.map(b => `<div class="cfg-row">
      <div class="cr-main"><strong>${b.nombre}</strong><small>${b.iban || '—'} · ${b.entidad || ''}</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="editCuentaBancaria(${b.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCuentaBancaria(${b.id})">🗑️</button>
      </div>
    </div>`).join('') :
    '<div style="padding:24px;color:var(--gris-400);font-size:13px;text-align:center">Sin cuentas bancarias — crea la primera</div>';
}

function nuevaCuentaBancaria() {
  const nombre = prompt('Nombre de la cuenta (ej: CaixaBank Principal):');
  if (!nombre) return;
  const iban = prompt('IBAN (opcional):') || '';
  const entidad = prompt('Entidad bancaria (opcional):') || '';
  sb.from('cuentas_bancarias').insert({
    empresa_id: EMPRESA.id, nombre, iban, entidad, activa: true
  }).then(r => {
    if (r.error) { toast('Error: ' + r.error.message, 'error'); return; }
    toast('Cuenta creada ✓', 'success');
    cargarBancosConfig();
  });
}

function editCuentaBancaria(id) {
  const b = cuentasBancarias.find(x => x.id === id);
  if (!b) return;
  const nombre = prompt('Nombre:', b.nombre);
  if (!nombre) return;
  const iban = prompt('IBAN:', b.iban || '') || '';
  const entidad = prompt('Entidad:', b.entidad || '') || '';
  sb.from('cuentas_bancarias').update({ nombre, iban, entidad }).eq('id', id).then(r => {
    if (r.error) { toast('Error: ' + r.error.message, 'error'); return; }
    toast('Cuenta actualizada ✓', 'success');
    cargarBancosConfig();
  });
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

