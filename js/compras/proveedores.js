// ═══════════════════════════════════════════════
// Supplier CRUD functions - Proveedores
// ═══════════════════════════════════════════════

function renderProveedores(list) {
  document.getElementById('provCount').textContent=`${proveedores.length} proveedores`;
  document.getElementById('provTable').innerHTML = list.length ?
    list.map(p=>`<tr>
      <td><div style="font-weight:700">${p.nombre}</div><div style="font-size:11px;color:var(--gris-400)">${p.web||''}</div></td>
      <td style="font-family:monospace;font-size:12px">${p.cif||'—'}</td>
      <td>${p.telefono||'—'}</td>
      <td>${p.email_pedidos||p.email||'—'}</td>
      <td>${p.municipio||'—'}</td>
      <td><div style="display:flex;gap:4px">
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
  document.getElementById('mProvTit').textContent='Editar Proveedor';
  openModal('mProveedor');
}

async function saveProveedor() {
  const nombre=document.getElementById('pv_nombre').value.trim();
  if(!nombre){toast('Introduce el nombre','error');return;}
  const id=document.getElementById('pv_id').value;
  const obj={empresa_id:EMPRESA.id,nombre,cif:v('pv_cif'),telefono:v('pv_tel'),email_pedidos:v('pv_email_ped'),email:v('pv_email'),web:v('pv_web'),direccion:v('pv_dir'),municipio:v('pv_muni'),cp:v('pv_cp'),provincia:v('pv_prov'),dias_pago:parseInt(v('pv_dias'))||30,observaciones:v('pv_notas')};
  if(id){await sb.from('proveedores').update(obj).eq('id',id);}
  else{await sb.from('proveedores').insert(obj);}
  closeModal('mProveedor');
  const {data}=await sb.from('proveedores').select('*').eq('empresa_id',EMPRESA.id).order('nombre');
  proveedores=data||[]; renderProveedores(proveedores);
  toast('Proveedor guardado ✓','success');
}

async function delProv(id) {
  if(!confirm('¿Eliminar proveedor?'))return;
  await sb.from('proveedores').delete().eq('id',id);
  proveedores=proveedores.filter(p=>p.id!==id); renderProveedores(proveedores);
  toast('Proveedor eliminado','info');
}
