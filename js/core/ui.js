// ═══════════════════════════════════════════════
// UI HELPERS - Screen, modal, page, and form utilities
// ═══════════════════════════════════════════════

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function openModal(id, skipReset){
  // Solo resetear si NO venimos de una edición
  if(!skipReset){
    ['c_id','pv_id','art_id','alm_id','ser_id','iva_id','ud_id','fp_id','fam_id'].forEach(hid=>{const el=document.getElementById(hid);if(el)el.value='';});
  }
  // Guardar valores de selects antes de repopular
  const savedSelects = {};
  if(skipReset){
    ['c_fpago','pv_fpago'].forEach(sid=>{
      const sel=document.getElementById(sid); if(sel) savedSelects[sid]=sel.value;
    });
  }
  populateSelects();
  if(skipReset){
    Object.entries(savedSelects).forEach(([sid,val])=>{const sel=document.getElementById(sid);if(sel)sel.value=val;});
  }
  if(id==='mPresup'){pPartidas=[];renderPPartidas();document.getElementById('p_fecha').value=new Date().toISOString().split('T')[0];}
  if(id==='mCliente'&&!skipReset){
    document.getElementById('mCliTit').textContent='Nuevo Cliente';
    ['c_nombre','c_nif','c_tel','c_movil','c_email','c_dir','c_muni','c_cp','c_prov','c_notas'].forEach(fid=>{const el=document.getElementById(fid);if(el)el.value='';});
    const cd=document.getElementById('c_descuento');if(cd)cd.value=0;
  }
  if(id==='mNuevoUsuario'&&!skipReset){
    document.getElementById('mUsrTit').textContent='Nuevo Usuario';
    ['usr_id','usr_nombre','usr_apellidos','usr_email','usr_tel','usr_pass'].forEach(fid=>{const el=document.getElementById(fid);if(el)el.value='';});
    const up=document.getElementById('usrFotoPreview');
    if(up){up.innerHTML='?';up.style.background='var(--azul)';}
    usuariosFotoFile=null;
    setPermisosByRol('operario');
  }
  const modalEl = document.getElementById(id);
  if(!modalEl){ console.error('Modal not found:',id); toast('Error: modal no encontrado','error'); return; }
  modalEl.classList.add('open');
}

function closeModal(id){document.getElementById(id)?.classList.remove('open');}

// Close modal when clicking overlay
document.addEventListener('click',e=>{if(e.target.classList.contains('overlay'))closeModal(e.target.id);});

function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+id)?.classList.add('active');
  document.querySelectorAll('.sb-item').forEach(b=>{if(b.getAttribute('onclick')?.includes("'"+id+"'"))b.classList.add('active');});
  const titles={dashboard:'Panel',clientes:'Clientes',proveedores:'Proveedores',articulos:'Artículos',almacenes:'Almacenes',trabajos:'Obras',presupuestos:'Presupuestos',albaranes:'Albaranes',facturas:'Facturas','pedidos-compra':'Pedidos de compra',recepciones:'Recepciones','facturas-proveedor':'Facturas proveedor',stock:'Stock',traspasos:'Traspasos',activos:'Activos',partes:'Partes de trabajo',fichajes:'Fichajes','audit-log':'Registro de actividad',papelera:'Papelera',usuarios:'Usuarios',configuracion:'Configuración'};
  document.getElementById('pgTitle').textContent = titles[id]||id;
  document.getElementById('pgSub').textContent = '';
  // Topbar buttons por página
  const tb = document.getElementById('topbarBtns');
  if (tb) {
    const btns = {
      clientes: '',
      presupuestos: `<button class="btn btn-ghost btn-sm" onclick="exportarPresupuestos()">📤 Exportar</button><button class="btn btn-primary btn-sm" onclick="abrirNuevoPresupuesto()">+ Nuevo presupuesto</button>`,
      albaranes: `<button class="btn btn-ghost btn-sm" onclick="exportarAlbaranes()">📤 Exportar</button><button class="btn btn-primary btn-sm" onclick="abrirNuevoAlbaran()">+ Nuevo albarán</button>`,
      facturas: `<button class="btn btn-primary btn-sm" onclick="abrirNuevaFactura()">+ Nueva factura</button>`,
      proveedores: `<button class="btn btn-secondary btn-sm" onclick="openModal('mImportarProveedores')">📥 Importar</button><button class="btn btn-primary btn-sm" onclick="openModal('mProveedor')">+ Nuevo</button>`,
      articulos: `<button class="btn btn-ghost btn-sm" onclick="exportarArticulos()">📤 Exportar</button><button class="btn btn-secondary btn-sm" onclick="openModal('mImportarArticulos')">📥 Importar</button><button class="btn btn-primary btn-sm" onclick="nuevoArticulo()">+ Nuevo</button>`,
      almacenes: `<button class="btn btn-primary btn-sm" onclick="openModal('mAlmacen')">+ Nuevo almacén</button>`,
      trabajos: `<button class="btn btn-primary btn-sm" onclick="openModal('mTrabajo')">+ Nueva obra</button>`,
      usuarios: `<button class="btn btn-primary btn-sm" onclick="openModal('mNuevoUsuario')">+ Nuevo usuario</button>`,
      dashboard: '',
      'audit-log': '',
      papelera: '',
      'pedidos-compra': '<button class="btn btn-primary btn-sm" onclick="nuevoPedidoCompra()">+ Nuevo pedido</button>',
      recepciones: '<button class="btn btn-primary btn-sm" onclick="nuevaRecepcion()">+ Nueva recepción</button>',
      'facturas-proveedor': '<button class="btn btn-primary btn-sm" onclick="nuevaFacturaProv()">+ Nueva factura</button>',
      stock: '',
      traspasos: '<button class="btn btn-primary btn-sm" onclick="nuevoTraspasoModal()">+ Nuevo traspaso</button>',
      partes: '<button class="btn btn-primary btn-sm" onclick="nuevoParteModal()">+ Nuevo parte</button>',
      fichajes: '',
    };
    tb.innerHTML = btns[id] !== undefined ? btns[id] : `<button class="btn btn-primary btn-sm" onclick="nuevoRapido()">+ Nuevo</button>`;
  }
  if(id==='configuracion') renderConfigLists();
  if(id==='mEmpresas') renderEmpresasList();
  if(id==='usuarios') loadUsuarios();
  if(id==='audit-log') loadAuditLog();
  if(id==='papelera') loadPapelera();
  if(id==='presupuestos') loadPresupuestos();
  if(id==='albaranes') loadAlbaranes();
  if(id==='fichajes') loadFichajes();
  if(id==='partes') loadPartes();
  if(id==='stock') loadStock();
  if(id==='traspasos') loadTraspasos();
  if(id==='pedidos-compra') loadPedidosCompra();
  if(id==='recepciones') loadRecepciones();
  if(id==='facturas-proveedor') loadFacturasProv();
  if(id==='clientes'){
    cliFiltroList=[...clientes];
    renderClientes(clientes);
    setCliVista(cliVista==='ficha'?'tarjetas':cliVista);
  }
}

function cfgTab(id,el){
  document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.cfg-menu-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('cfg-'+id).classList.add('active');
  el.classList.add('active');
}

function nuevoRapido(){
  const a=document.querySelector('.page.active')?.id?.replace('page-','');
  const m={clientes:'mCliente',proveedores:'mProveedor',articulos:'mArticulo',almacenes:'mAlmacen',trabajos:'mTrabajo'};
  if(m[a])openModal(m[a]);
}

function importarRapido(){
  const a=document.querySelector('.page.active')?.id?.replace('page-','');
  const m={clientes:'mImportarClientes',proveedores:'mImportarProveedores',articulos:'mImportarArticulos'};
  if(m[a]) openModal(m[a]);
}

function populateSelects(){
  // Clientes
  const cOpts='<option value="">— Sin cliente —</option>'+clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
  ['tr_cli'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=cOpts;});
  // Formas pago
  const fpOpts='<option value="">— Sin forma de pago —</option>'+formasPago.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  ['c_fpago','pv_fpago'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=fpOpts;});
  // Selector de familia padre (en modal de config) - sigue siendo select normal
  const famParent=document.getElementById('fam_parent');
  if(famParent)famParent.innerHTML='<option value="">— Familia raíz —</option>'+familias.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  // Empresas
  renderEmpresasList();
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Familias
// ═══════════════════════════════════════════════
function acFamilia(q) {
  const drop = document.getElementById('acFamiliaDropdown');
  const query = (q || '').toLowerCase().trim();

  // Construir lista jerárquica
  const padres = familias.filter(f => !f.parent_id);
  const hijos = familias.filter(f => f.parent_id);
  let items = [];
  padres.forEach(p => {
    items.push({ id: p.id, nombre: p.nombre, nivel: 0 });
    hijos.filter(h => h.parent_id === p.id).forEach(h => {
      items.push({ id: h.id, nombre: h.nombre, padre: p.nombre, nivel: 1 });
    });
  });
  // Huérfanas
  const parentIds = padres.map(p => p.id);
  hijos.filter(h => !parentIds.includes(h.parent_id)).forEach(h => {
    items.push({ id: h.id, nombre: h.nombre, nivel: 0 });
  });

  // Filtrar si hay texto
  let filtered = query ? items.filter(i => i.nombre.toLowerCase().includes(query)) : items;

  // Generar HTML
  let html = '';
  if (!query) {
    html += '<div class="ac-item" onmousedown="event.preventDefault();acFamiliaSelect(\'\',\'\')"><span style="color:var(--gris-400)">— Sin familia —</span></div>';
  }
  filtered.forEach(i => {
    const prefix = i.nivel === 1 ? '<span style="color:var(--gris-300);margin-right:4px">└</span>' : '';
    const sub = i.padre ? `<small style="color:var(--gris-400);margin-left:6px">(${i.padre})</small>` : '';
    html += `<div class="ac-item" onmousedown="event.preventDefault();acFamiliaSelect('${i.id}','${i.nombre.replace(/'/g,"\\'")}')">
      ${prefix}<strong>${i.nombre}</strong>${sub}
    </div>`;
  });

  // Opción de crear nueva
  const exactMatch = items.some(i => i.nombre.toLowerCase() === query);
  if (query && !exactMatch) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearFamiliaDesdeAC('${query.replace(/'/g,"\\'")}', false)">
      + Crear familia "${q.trim()}"
    </div>`;
    if (padres.length > 0) {
      html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearFamiliaDesdeAC('${query.replace(/'/g,"\\'")}', true)">
        + Crear como subfamilia de...
      </div>`;
    }
  } else if (!query) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearFamiliaDesdeAC('', false)">
      + Nueva familia...
    </div>`;
  }

  drop.innerHTML = html || '<div class="ac-empty">Sin resultados</div>';
  drop.style.display = '';
}

function acFamiliaHide() { document.getElementById('acFamiliaDropdown').style.display = 'none'; }

function acFamiliaSelect(id, nombre) {
  document.getElementById('art_familia').value = id;
  document.getElementById('art_familia_input').value = nombre;
  acFamiliaHide();
}

// Setter para cargar familia al editar artículo
function setArtFamilia(familiaId) {
  const fam = familias.find(f => f.id == familiaId);
  document.getElementById('art_familia').value = familiaId || '';
  document.getElementById('art_familia_input').value = fam?.nombre || '';
}

async function crearFamiliaDesdeAC(nombre, esSub) {
  acFamiliaHide();
  let parentId = null;

  if (esSub) {
    const padres = familias.filter(f => !f.parent_id);
    const opciones = padres.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
    const resp = prompt('Elige la familia padre:\n\n' + opciones + '\n\nEscribe el número:');
    if (!resp) return;
    const idx = parseInt(resp) - 1;
    if (idx < 0 || idx >= padres.length) { toast('Opción no válida', 'error'); return; }
    parentId = padres[idx].id;
  }

  if (!nombre) {
    nombre = prompt(esSub ? 'Nombre de la subfamilia:' : 'Nombre de la nueva familia:');
    if (!nombre || !nombre.trim()) return;
  }

  const obj = { empresa_id: EMPRESA.id, nombre: nombre.trim(), parent_id: parentId };
  const { data, error } = await sb.from('familias_articulos').insert(obj).select('id').single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const { data: fresh } = await sb.from('familias_articulos').select('*').eq('empresa_id', EMPRESA.id);
  familias = fresh || [];
  acFamiliaSelect(data.id, nombre.trim());
  toast('Familia "' + nombre.trim() + '" creada ✓', 'success');
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Tipo IVA
// ═══════════════════════════════════════════════
function acIva(q) {
  const drop = document.getElementById('acIvaDropdown');
  const query = (q || '').toLowerCase().trim();

  let filtered = query ? tiposIva.filter(i => i.nombre.toLowerCase().includes(query) || String(i.porcentaje).includes(query)) : tiposIva;

  let html = '';
  if (!query) html += '<div class="ac-item" onmousedown="event.preventDefault();acIvaSelect(\'\',\'\')"><span style="color:var(--gris-400)">— Sin IVA —</span></div>';
  filtered.forEach(i => {
    html += `<div class="ac-item" onmousedown="event.preventDefault();acIvaSelect('${i.id}','${i.nombre} (${i.porcentaje}%)')">
      <strong>${i.nombre}</strong><span style="margin-left:8px;color:var(--gris-500)">${i.porcentaje}%</span>
      ${i.por_defecto ? '<span style="margin-left:6px;font-size:10px;color:var(--azul)">por defecto</span>' : ''}
    </div>`;
  });

  const exactMatch = tiposIva.some(i => i.nombre.toLowerCase() === query);
  if (query && !exactMatch) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearIvaDesdeAC('${query.replace(/'/g,"\\'")}')">
      + Crear tipo IVA "${q.trim()}"
    </div>`;
  } else if (!query) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearIvaDesdeAC('')">
      + Nuevo tipo IVA...
    </div>`;
  }

  drop.innerHTML = html || '<div class="ac-empty">Sin resultados</div>';
  drop.style.display = '';
}

function acIvaHide() { document.getElementById('acIvaDropdown').style.display = 'none'; }

function acIvaSelect(id, label) {
  document.getElementById('art_iva').value = id;
  document.getElementById('art_iva_input').value = label;
  acIvaHide();
}

function setArtIva(ivaId) {
  const iva = tiposIva.find(i => i.id == ivaId);
  document.getElementById('art_iva').value = ivaId || '';
  document.getElementById('art_iva_input').value = iva ? `${iva.nombre} (${iva.porcentaje}%)` : '';
}

async function crearIvaDesdeAC(nombre) {
  acIvaHide();
  if (!nombre) { nombre = prompt('Nombre del tipo IVA (ej: Reducido):'); }
  if (!nombre || !nombre.trim()) return;
  const pct = prompt('Porcentaje IVA (ej: 10):');
  if (pct === null) return;

  const obj = { empresa_id: EMPRESA.id, nombre: nombre.trim(), porcentaje: parseFloat(pct) || 0, por_defecto: false };
  const { data, error } = await sb.from('tipos_iva').insert(obj).select('id').single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const { data: fresh } = await sb.from('tipos_iva').select('*').eq('empresa_id', EMPRESA.id);
  tiposIva = fresh || [];
  acIvaSelect(data.id, nombre.trim() + ' (' + (parseFloat(pct)||0) + '%)');
  toast('Tipo IVA "' + nombre.trim() + '" creado ✓', 'success');
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE: Unidad de medida
// ═══════════════════════════════════════════════
function acUnidad(q) {
  const drop = document.getElementById('acUnidadDropdown');
  const query = (q || '').toLowerCase().trim();

  let filtered = query ? unidades.filter(u => u.nombre.toLowerCase().includes(query) || u.abreviatura.toLowerCase().includes(query)) : unidades;

  let html = '';
  if (!query) html += '<div class="ac-item" onmousedown="event.preventDefault();acUnidadSelect(\'\',\'\')"><span style="color:var(--gris-400)">— Sin unidad —</span></div>';
  filtered.forEach(u => {
    html += `<div class="ac-item" onmousedown="event.preventDefault();acUnidadSelect('${u.id}','${u.nombre} (${u.abreviatura})')">
      <strong>${u.nombre}</strong><span style="margin-left:8px;color:var(--gris-500)">${u.abreviatura}</span>
    </div>`;
  });

  const exactMatch = unidades.some(u => u.nombre.toLowerCase() === query);
  if (query && !exactMatch) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearUnidadDesdeAC('${query.replace(/'/g,"\\'")}')">
      + Crear unidad "${q.trim()}"
    </div>`;
  } else if (!query) {
    html += `<div class="ac-item" style="color:var(--azul);font-weight:600" onmousedown="event.preventDefault();crearUnidadDesdeAC('')">
      + Nueva unidad...
    </div>`;
  }

  drop.innerHTML = html || '<div class="ac-empty">Sin resultados</div>';
  drop.style.display = '';
}

function acUnidadHide() { document.getElementById('acUnidadDropdown').style.display = 'none'; }

function acUnidadSelect(id, label) {
  document.getElementById('art_unidad').value = id;
  document.getElementById('art_unidad_input').value = label;
  acUnidadHide();
}

function setArtUnidad(unidadId) {
  const ud = unidades.find(u => u.id == unidadId);
  document.getElementById('art_unidad').value = unidadId || '';
  document.getElementById('art_unidad_input').value = ud ? `${ud.nombre} (${ud.abreviatura})` : '';
}

async function crearUnidadDesdeAC(nombre) {
  acUnidadHide();
  if (!nombre) { nombre = prompt('Nombre de la unidad (ej: Metro lineal):'); }
  if (!nombre || !nombre.trim()) return;
  const abrev = prompt('Abreviatura (ej: ml):');
  if (!abrev || !abrev.trim()) return;

  const obj = { empresa_id: EMPRESA.id, nombre: nombre.trim(), abreviatura: abrev.trim() };
  const { data, error } = await sb.from('unidades_medida').insert(obj).select('id').single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const { data: fresh } = await sb.from('unidades_medida').select('*').eq('empresa_id', EMPRESA.id);
  unidades = fresh || [];
  acUnidadSelect(data.id, nombre.trim() + ' (' + abrev.trim() + ')');
  toast('Unidad "' + nombre.trim() + '" creada ✓', 'success');
}

function v(id){return document.getElementById(id)?.value||'';}

function setVal(obj){Object.entries(obj).forEach(([k,val])=>{const el=document.getElementById(k);if(el)el.value=val;});}

function showErr(id,msg){const el=document.getElementById(id);el.textContent=msg;el.style.display='block';}

function fmtE(n){return(parseFloat(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}

function ini(n){return(n||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';}

const AVC=['#1B4FD8','#16A34A','#D97706','#DC2626','#7C3AED','#0891B2','#DB2777','#0F766E'];

function avC(n){return AVC[(n||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%AVC.length];}

function catIco(c){return{Fontanería:'🚿',Calefacción:'🔥','Aire Acondicionado':'❄️','Energías Renovables':'☀️',Reforma:'🛁',Electricidad:'⚡'}[c]||'🔧';}

function estadoBadge(e){const m={pendiente:'<span class="badge bg-gray">⏳ Pendiente</span>',planificado:'<span class="badge bg-blue">📅 Planificado</span>',en_curso:'<span class="badge bg-yellow">🔧 En curso</span>',finalizado:'<span class="badge bg-green">✅ Finalizado</span>'};return m[e]||`<span class="badge bg-gray">${e||'—'}</span>`;}

function estadoBadgeP(e){const m={borrador:'<span class="badge bg-gray">✏️ Borrador</span>',pendiente:'<span class="badge bg-yellow">⏳ Pendiente</span>',aceptado:'<span class="badge bg-green">✅ Aceptado</span>',caducado:'<span class="badge bg-red">⏰ Caducado</span>',anulado:'<span class="badge bg-gray">🚫 Anulado</span>'};return m[e]||`<span class="badge bg-gray">${e||'—'}</span>`;}

function estadoBadgeF(e){const m={pendiente:'<span class="badge bg-yellow">⏳ Pendiente</span>',cobrada:'<span class="badge bg-green">✅ Cobrada</span>',vencida:'<span class="badge bg-red">⚠️ Vencida</span>',anulada:'<span class="badge bg-gray">🚫 Anulada</span>'};return m[e]||`<span class="badge bg-gray">${e||'—'}</span>`;}

function prioBadge(p){const m={Urgente:'<span class="badge bg-red">🔴</span>',Alta:'<span class="badge" style="background:#FFF4ED;color:var(--acento)">🟠</span>',Normal:'<span class="badge bg-gray">⚪</span>',Baja:'<span class="badge bg-gray">🔵</span>'};return m[p]||'';}

function toast(msg,type='info'){const c=document.getElementById('toast');const t=document.createElement('div');t.className=`ti ${type}`;t.innerHTML=`<span>${{success:'✅',error:'❌',info:'ℹ️'}[type]}</span> ${msg}`;c.appendChild(t);setTimeout(()=>t.classList.add('show'),10);setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300);},3800);}

function setPermisosByRol(rol) {
  const presets = {
    operario:      {clientes:false, presupuestos:false, facturas:false, trabajos:true,  partes:true,  stock:false, config:false, usuarios:false},
    administrativo:{clientes:true,  presupuestos:true,  facturas:true,  trabajos:true,  partes:true,  stock:true,  config:false, usuarios:false},
    encargado:     {clientes:false, presupuestos:false, facturas:false, trabajos:true,  partes:true,  stock:true,  config:false, usuarios:false},
    admin:         {clientes:true,  presupuestos:true,  facturas:true,  trabajos:true,  partes:true,  stock:true,  config:true,  usuarios:true},
  };
  const p = presets[rol] || presets.operario;
  Object.keys(p).forEach(k => { const el = document.getElementById('up_'+k); if(el) el.checked = p[k]; });
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
  if (!e.target.closest('#acArticulos') && !e.target.matches('input[data-linea]')) {
    const d = document.getElementById('acArticulos');
    if (d) d.style.display='none';
  }
});
