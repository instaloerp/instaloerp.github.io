// ═══════════════════════════════════════════════
// Warehouse management - Almacenes
// ═══════════════════════════════════════════════

function renderAlmacenes() {
  const tipoIco={central:'🏭',furgoneta:'🚐',externo:'🏗️'};
  document.getElementById('almGrid').innerHTML = almacenes.length ?
    almacenes.map(a=>`
      <div class="card" style="padding:17px">
        <div style="display:flex;align-items:center;gap:11px;margin-bottom:13px">
          <div style="font-size:28px">${tipoIco[a.tipo]||'📦'}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800">${a.nombre}</div>
            <div style="font-size:11px;color:var(--gris-400)">${a.tipo} ${a.matricula?'· '+a.matricula:''}</div>
          </div>
          <span class="badge ${a.activo?'bg-green':'bg-gray'}">${a.activo?'Activo':'Inactivo'}</span>
        </div>
        <div style="display:flex;gap:7px">
          <button class="btn btn-secondary btn-sm" onclick="editAlmacen(${a.id})">✏️ Editar</button>
        </div>
      </div>`).join('') :
    '<div class="empty" style="grid-column:1/-1"><div class="ei">🏭</div><h3>Sin almacenes</h3></div>';
}

function editAlmacen(id) {
  const a=almacenes.find(x=>x.id===id); if(!a) return;
  document.getElementById('alm_id').value=a.id;
  setVal({alm_nombre:a.nombre,alm_matricula:a.matricula||'',alm_dir:a.direccion||''});
  document.getElementById('alm_tipo').value=a.tipo||'central';
  document.getElementById('mAlmTit').textContent='Editar Almacén';
  openModal('mAlmacen');
}

async function saveAlmacen() {
  const nombre=document.getElementById('alm_nombre').value.trim();
  if(!nombre){toast('Introduce el nombre','error');return;}
  const id=document.getElementById('alm_id').value;
  const obj={empresa_id:EMPRESA.id,nombre,tipo:document.getElementById('alm_tipo').value,matricula:v('alm_matricula'),direccion:v('alm_dir')};
  if(id){await sb.from('almacenes').update(obj).eq('id',id);}
  else{await sb.from('almacenes').insert(obj);}
  closeModal('mAlmacen');
  const {data}=await sb.from('almacenes').select('*').eq('empresa_id',EMPRESA.id).order('nombre');
  almacenes=data||[]; renderAlmacenes();
  toast('Almacén guardado ✓','success');
}

