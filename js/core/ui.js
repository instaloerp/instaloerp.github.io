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
  populateSelects();
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
      articulos: `<button class="btn btn-ghost btn-sm" onclick="exportarArticulos()">📤 Exportar</button><button class="btn btn-secondary btn-sm" onclick="openModal('mImportarArticulos')">📥 Importar</button><button class="btn btn-primary btn-sm" onclick="openModal('mArticulo')">+ Nuevo</button>`,
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
  // IVA
  const ivaOpts='<option value="">— Seleccionar —</option>'+tiposIva.map(i=>`<option value="${i.id}">${i.nombre} (${i.porcentaje}%)</option>`).join('');
  const artIva=document.getElementById('art_iva');if(artIva)artIva.innerHTML=ivaOpts;
  // Unidades
  const udOpts='<option value="">— Seleccionar —</option>'+unidades.map(u=>`<option value="${u.id}">${u.nombre} (${u.abreviatura})</option>`).join('');
  const artUd=document.getElementById('art_unidad');if(artUd)artUd.innerHTML=udOpts;
  // Familias
  const famOpts='<option value="">— Sin familia —</option>'+familias.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  ['art_familia','fam_parent'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=(id==='fam_parent'?'<option value="">— Familia raíz —</option>':famOpts.split('<option value="">— Sin familia —</option>')[1])||famOpts;});
  const artFam=document.getElementById('art_familia');if(artFam)artFam.innerHTML=famOpts;
  const famParent=document.getElementById('fam_parent');if(famParent)famParent.innerHTML='<option value="">— Familia raíz —</option>'+familias.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
  // Empresas
  renderEmpresasList();
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
