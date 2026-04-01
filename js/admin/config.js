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

  // Familias
  document.getElementById('familiasList').innerHTML = familias.length ?
    familias.map(f=>`<div class="cfg-row">
      <div class="cr-main"><strong>${f.nombre}</strong><small>${familias.find(x=>x.id===f.parent_id)?.nombre||'Familia raíz'}</small></div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" onclick="editFamilia(${f.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCfg('familias_articulos',${f.id},'familias')">🗑️</button>
      </div>
    </div>`).join('') : '<div style="padding:16px;color:var(--gris-400);font-size:13px;text-align:center">Sin familias</div>';

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

function editFamilia(id) {
  const f=familias.find(x=>x.id===id); if(!f)return;
  document.getElementById('fam_id').value=f.id;
  setVal({fam_nombre:f.nombre});
  document.getElementById('fam_parent').value=f.parent_id||'';
  openModal('mFamilia');
}

async function saveFamilia() {
  const nombre=v('fam_nombre'); if(!nombre){toast('Introduce el nombre','error');return;}
  const id=document.getElementById('fam_id').value;
  const pid=parseInt(document.getElementById('fam_parent').value)||null;
  const obj={empresa_id:EMPRESA.id,nombre,parent_id:pid};
  if(id){await sb.from('familias_articulos').update(obj).eq('id',id);}
  else{await sb.from('familias_articulos').insert(obj);}
  closeModal('mFamilia'); await reloadCfg('familias'); toast('Familia guardada ✓','success');
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
}

