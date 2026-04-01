// ═══════════════════════════════════════════════
// Articles/SKU management - Artículos
// ═══════════════════════════════════════════════

function renderArticulos(list) {
  document.getElementById('artCount').textContent=`${articulos.length} artículos`;
  // Populate filter familias
  const sf=document.getElementById('selFamFiltro');
  sf.innerHTML='<option value="">Todas las familias</option>'+familias.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  document.getElementById('artTable').innerHTML = list.length ?
    list.map(a=>{
      const fam=familias.find(f=>f.id===a.familia_id);
      const iva=tiposIva.find(i=>i.id===a.tipo_iva_id);
      return `<tr>
        <td style="font-family:monospace;font-weight:700;font-size:12px;color:var(--azul)">${a.codigo}</td>
        <td><div style="font-weight:700">${a.nombre}</div>${a.es_activo?'<span class="badge bg-yellow" style="font-size:9.5px">Activo</span>':''}</td>
        <td>${fam?.nombre||'—'}</td>
        <td style="font-weight:700">${fmtE(a.precio_coste)}</td>
        <td style="font-weight:700;color:var(--verde)">${fmtE(a.precio_venta)}</td>
        <td>${iva?iva.porcentaje+'%':'—'}</td>
        <td>${a.activo?'<span class="badge bg-green">Sí</span>':'<span class="badge bg-gray">No</span>'}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="editArticulo(${a.id})">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="delArticulo(${a.id})">🗑️</button>
        </div></td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="8"><div class="empty"><div class="ei">📦</div><h3>Sin artículos</h3><p>Añade tu catálogo de artículos</p></div></td></tr>';
}

function buscarArt(v) { renderArticulos(articulos.filter(a=>a.nombre.toLowerCase().includes(v.toLowerCase())||a.codigo.toLowerCase().includes(v.toLowerCase()))); }

function filtrarArtFam(fid) { renderArticulos(fid?articulos.filter(a=>a.familia_id===parseInt(fid)):articulos); }

function editArticulo(id) {
  const a=articulos.find(x=>x.id===id); if(!a) return;
  document.getElementById('art_id').value=a.id;
  setVal({art_codigo:a.codigo,art_nombre:a.nombre,art_coste:a.precio_coste,art_venta:a.precio_venta,art_ref_fab:a.referencia_fabricante||'',art_barras:a.codigo_barras||'',art_obs:a.observaciones||''});
  document.getElementById('art_familia').value=a.familia_id||'';
  document.getElementById('art_iva').value=a.tipo_iva_id||'';
  document.getElementById('art_unidad').value=a.unidad_venta_id||'';
  document.getElementById('art_es_activo').checked=a.es_activo||false;
  document.getElementById('art_activo').checked=a.activo!==false;
  document.getElementById('mArtTit').textContent='Editar Artículo';
  openModal('mArticulo');
}

async function saveArticulo() {
  const codigo=document.getElementById('art_codigo').value.trim();
  const nombre=document.getElementById('art_nombre').value.trim();
  if(!codigo||!nombre){toast('Código y nombre son obligatorios','error');return;}
  const id=document.getElementById('art_id').value;
  const obj={empresa_id:EMPRESA.id,codigo,nombre,
    familia_id:parseInt(document.getElementById('art_familia').value)||null,
    tipo_iva_id:parseInt(document.getElementById('art_iva').value)||null,
    unidad_venta_id:parseInt(document.getElementById('art_unidad').value)||null,
    precio_coste:parseFloat(v('art_coste'))||0,
    precio_venta:parseFloat(v('art_venta'))||0,
    referencia_fabricante:v('art_ref_fab'),
    codigo_barras:v('art_barras'),
    es_activo:document.getElementById('art_es_activo').checked,
    activo:document.getElementById('art_activo').checked,
    observaciones:v('art_obs')
  };
  if(id){await sb.from('articulos').update(obj).eq('id',id);}
  else{const{error}=await sb.from('articulos').insert(obj);if(error){toast('Error: '+error.message,'error');return;}}
  closeModal('mArticulo');
  const {data}=await sb.from('articulos').select('*').eq('empresa_id',EMPRESA.id).order('codigo');
  articulos=data||[]; renderArticulos(articulos);
  toast('Artículo guardado ✓','success');
}

async function delArticulo(id) {
  if(!confirm('¿Eliminar artículo?'))return;
  await sb.from('articulos').delete().eq('id',id);
  articulos=articulos.filter(a=>a.id!==id); renderArticulos(articulos);
  toast('Artículo eliminado','info');
}

