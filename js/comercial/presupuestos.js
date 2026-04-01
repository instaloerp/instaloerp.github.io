/**
 * MÓDULO PRESUPUESTOS
 * Gestión completa de presupuestos: listado, filtrado, estados, conversión a otros documentos
 * Incluye control de versiones y gestión del ciclo de vida del presupuesto
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let presupuestos = [];
let presFiltrados = [];
let _kpiFilterActivo = '';

// ═══════════════════════════════════════════════
//  CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadPresupuestos() {
  const { data } = await sb.from('presupuestos')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'eliminado')
    .order('created_at', { ascending: false });
  presupuestos = data || [];
  // Filtro por defecto: año en curso
  const y = new Date().getFullYear();
  const dEl = document.getElementById('presDesde');
  const hEl = document.getElementById('presHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
  filtrarPresupuestos();
}

function getEstadoPres(p) {
  return p.estado || 'borrador';
}

function renderPresupuestos(list) {
  const ESTADOS = {
    borrador:   { label:'Borrador',   ico:'✏️', color:'var(--gris-500)',   bg:'var(--gris-100)' },
    pendiente:  { label:'Pendiente',  ico:'⏳', color:'var(--amarillo)',   bg:'var(--amarillo-light)' },
    aceptado:   { label:'Aceptado',   ico:'✅', color:'var(--verde)',      bg:'var(--verde-light)' },
    caducado:   { label:'Caducado',   ico:'⏰', color:'var(--rojo)',       bg:'var(--rojo-light)' },
    anulado:    { label:'Anulado',    ico:'🚫', color:'var(--gris-400)',   bg:'var(--gris-100)' },
  };

  const hoy = new Date().toISOString().split('T')[0];
  presupuestos.forEach(p => {
    if (p.estado === 'pendiente' && p.fecha_validez && p.fecha_validez < hoy) {
      console.log('Auto-caducando', p.numero, '— validez:', p.fecha_validez, '< hoy:', hoy);
      p.estado = 'caducado';
      sb.from('presupuestos').update({estado:'caducado'}).eq('id', p.id)
        .then(r => { if(r.error) console.error('Error auto-caducar', p.numero, r.error.message); });
    }
  });

  const kTotal    = document.getElementById('pk-total');
  const kPend     = document.getElementById('pk-pendientes');
  const kAcep     = document.getElementById('pk-aceptados');
  const kCad      = document.getElementById('pk-caducados');
  const kImpPend  = document.getElementById('pk-imp-pend');
  const kImpAcep  = document.getElementById('pk-imp-acep');
  const activos = presupuestos.filter(p=>p.estado!=='anulado' && p.estado!=='caducado');
  const pends = presupuestos.filter(p=>p.estado==='pendiente');
  const aceps = presupuestos.filter(p=>p.estado==='aceptado');
  if (kTotal)   kTotal.textContent   = activos.length;
  if (kPend)    kPend.textContent    = pends.length;
  if (kAcep)    kAcep.textContent    = aceps.length;
  if (kCad)     kCad.textContent     = presupuestos.filter(p=>p.estado==='caducado').length;
  if (kImpPend) kImpPend.textContent = fmtE(pends.reduce((s,p)=>s+(p.total||0),0));
  if (kImpAcep) kImpAcep.textContent = fmtE(aceps.reduce((s,p)=>s+(p.total||0),0));

  const tbody = document.getElementById('presTable');
  if (!tbody) return;

  const fmtDT = (d) => { if(!d) return '—'; const dt=new Date(d); return dt.toLocaleDateString('es-ES')+' '+dt.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); };

  tbody.innerHTML = list.length ? list.map(p => {
    const estado = getEstadoPres(p);
    const est = ESTADOS[estado] || { label: estado||'—', ico:'❔', color:'var(--gris-400)', bg:'var(--gris-100)' };
    const hasVer = (p.version||1) > 1;
    const verBadge = hasVer ? `<button onclick="event.stopPropagation();togglePresVersiones(${p.id},this)" style="font-size:10px;background:var(--azul-light);color:var(--azul);padding:2px 8px;border-radius:10px;font-weight:700;border:1.5px solid var(--azul);cursor:pointer;margin-left:4px" title="Ver versiones anteriores">v${p.version} ▾</button>` : '';
    const fechaCreado = fmtDT(p.created_at);
    const fechaModif = p.updated_at ? fmtDT(p.updated_at) : '';
    const fechaInfo = fechaModif && fechaModif !== fechaCreado ? `<div style="font-size:10px;color:var(--gris-400)" title="Modificado: ${fechaModif}">mod. ${fechaModif}</div>` : '';
    return `<tr style="cursor:pointer" onclick="verDetallePresupuesto(${p.id})">
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">
        <div style="display:flex;align-items:center;gap:2px">${(p.numero||'').startsWith('BORR-') ? '<span style="color:var(--gris-400);font-style:italic">(borrador)</span>' : (p.numero||'—')}${verBadge}</div>
        <div style="font-size:10px;color:var(--gris-400);font-weight:400;font-family:var(--font)">${fechaCreado}</div>
        ${fechaInfo}
      </td>
      <td><div style="font-weight:600">${p.cliente_nombre||'—'}</div></td>
      <td style="color:var(--gris-600);font-size:12.5px">${p.titulo||'—'}</td>
      <td style="font-size:12px">${p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—'}</td>
      <td style="font-size:12px">${p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—'}</td>
      <td style="font-weight:700">${fmtE(p.total||0)}</td>
      <td onclick="event.stopPropagation()">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${est.color};background:${est.bg}">${est.ico} ${est.label}</span>
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="editarPresupuesto(${p.id})" title="Abrir">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="imprimirPresupuesto(${p.id})" title="Imprimir / PDF">🖨️</button>
          <button class="btn btn-ghost btn-sm" onclick="enviarPresupuestoEmail(${p.id})" title="Enviar por email">📧</button>
          <button class="btn btn-ghost btn-sm" onclick="presToObra(${p.id})" title="Crear obra">🏗️</button>
          <button class="btn btn-ghost btn-sm" onclick="presToAlbaran(${p.id})" title="Crear albarán">📄</button>
          <button class="btn btn-ghost btn-sm" onclick="presToFactura(${p.id})" title="Crear factura">🧾</button>
          <button class="btn btn-ghost btn-sm" onclick="delPresupuesto(${p.id})" title="Anular">🚫</button>
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="8"><div class="empty"><div class="ei">📋</div><h3>Sin presupuestos</h3><p>Crea el primero con el botón "+ Nuevo presupuesto"</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  FILTRADO Y BÚSQUEDA
// ═══════════════════════════════════════════════
function filtrarPorKpi(estado) {
  _kpiFilterActivo = estado;
  document.querySelectorAll('.kpi-filter').forEach(el => {
    el.style.outline = el.dataset.filtro === estado ? '3px solid var(--azul)' : 'none';
    el.style.outlineOffset = '2px';
  });
  const sel = document.getElementById('presEstado');
  if (sel) {
    if (estado === '') sel.value = '';
    else if (estado === 'caducado') sel.value = 'caducado';
    else sel.value = estado;
  }
  filtrarPresupuestos();
}

function filtrarPresupuestos() {
  const q   = (document.getElementById('presSearch')?.value||'').toLowerCase();
  const est = document.getElementById('presEstado')?.value||'';
  const des = document.getElementById('presDesde')?.value||'';
  const has = document.getElementById('presHasta')?.value||'';
  const hayBusqueda = !!q;
  const kpi = _kpiFilterActivo;
  presFiltrados = presupuestos.filter(p => {
    if (kpi) {
      if (p.estado !== kpi) return false;
    } else if (est === 'todos') {
      // mostrar todo
    } else if (est) {
      if (p.estado !== est) return false;
    } else if (!hayBusqueda) {
      if (p.estado === 'anulado' || p.estado === 'caducado') return false;
    }
    return (!q || (p.numero||'').toLowerCase().includes(q) || (p.cliente_nombre||'').toLowerCase().includes(q) || (p.titulo||'').toLowerCase().includes(q)) &&
      (!des || (p.fecha && p.fecha >= des)) &&
      (!has || (p.fecha && p.fecha <= has));
  });
  renderPresupuestos(presFiltrados);
}

// ═══════════════════════════════════════════════
//  GESTIÓN DE ESTADOS
// ═══════════════════════════════════════════════
async function cambiarEstadoPres(id, estado) {
  const { error } = await sb.from('presupuestos').update({ estado }).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  const p = presupuestos.find(x=>x.id===id);
  if (p) p.estado = estado;
  registrarAudit('cambiar_estado', 'presupuesto', id, 'Estado → '+estado+(p?' — '+p.numero:''));
  renderPresupuestos(presupuestos);
  toast('Estado actualizado ✓','success');
  loadDashboard();
}

function cambiarEstadoPresMenu(event, id) {
  event.stopPropagation();
  document.querySelectorAll('.est-menu-popup').forEach(m=>m.remove());
  const ESTADOS = [
    {key:'pendiente',ico:'⏳',label:'Pendiente'},
    {key:'aceptado',ico:'✅',label:'Aceptado'},
    {key:'rechazado',ico:'❌',label:'Rechazado'},
    {key:'anulado',ico:'🚫',label:'Anulado'},
  ];
  const menu = document.createElement('div');
  menu.className = 'est-menu-popup';
  menu.style.cssText = 'position:fixed;z-index:9999;background:white;border-radius:10px;box-shadow:var(--sh-lg);padding:6px;min-width:160px';
  menu.innerHTML = ESTADOS.map(e=>`<button onclick="cambiarEstadoPres(${id},'${e.key}');this.parentElement.remove()" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-family:var(--font)" onmouseenter="this.style.background='var(--gris-50)'" onmouseleave="this.style.background='none'">${e.ico} ${e.label}</button>`).join('');
  document.body.appendChild(menu);
  const rect = event.target.getBoundingClientRect();
  menu.style.top = (rect.bottom+4)+'px';
  menu.style.left = rect.left+'px';
  setTimeout(()=>{
    const handler = (e)=>{ if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',handler);} };
    document.addEventListener('click', handler);
  }, 10);
}

// ═══════════════════════════════════════════════
//  VER Y EDITAR
// ═══════════════════════════════════════════════
function verDetallePresupuesto(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('presDetId').value = id;
  document.getElementById('presDetNro').textContent = p.numero||'—';
  document.getElementById('presDetCli').textContent = p.cliente_nombre||'—';
  document.getElementById('presDetFecha').textContent = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
  document.getElementById('presDetValido').textContent = p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—';
  document.getElementById('presDetTitulo').textContent = p.titulo||'—';
  document.getElementById('presDetTotal').textContent = fmtE(p.total||0);

  const lineas = p.lineas || [];
  let base=0, ivaTotal=0;
  document.getElementById('presDetLineas').innerHTML = lineas.map(l => {
    if (l.tipo==='capitulo') {
      return `<tr style="background:var(--azul-light);border-top:2px solid var(--azul)">
        <td colspan="6" style="padding:8px 10px;font-weight:700;font-size:13px;color:var(--azul)">📁 ${l.titulo||''}</td>
      </tr>`;
    }
    const sub = (l.cant||0)*(l.precio||0)*(1-((l.dto||0)/100));
    const iv = sub*((l.iva||0)/100);
    base+=sub; ivaTotal+=iv;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:8px 10px;font-size:13px">${l.desc||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.cant||0}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmtE(l.precio||0)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.dto?l.dto+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.iva!=null?l.iva+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub+iv)}</td>
    </tr>`;
  }).join('');
  document.getElementById('presDetBase').textContent = fmtE(p.base_imponible||base);
  document.getElementById('presDetIva').textContent = fmtE(p.total_iva||ivaTotal);
  document.getElementById('presDetTotal2').textContent = fmtE(p.total||0);

  const obs = document.getElementById('presDetObs');
  const obsWrap = document.getElementById('presDetObsWrap');
  if (p.observaciones) { obs.textContent = p.observaciones; obsWrap.style.display='block'; }
  else { obsWrap.style.display='none'; }

  openModal('mPresDetalle', true);
}

async function editarPresupuesto(id) {
  abrirEditor('presupuesto', id);
}

// ═══════════════════════════════════════════════
//  ELIMINAR Y RESTAURAR
// ═══════════════════════════════════════════════
async function delPresupuesto(id) {
  if (!confirm('¿Anular este presupuesto? Se marcará como anulado y no se eliminará.')) return;
  const p = presupuestos.find(x=>x.id===id);
  const { error } = await sb.from('presupuestos').update({estado:'anulado'}).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  if (p) p.estado = 'anulado';
  registrarAudit('anular', 'presupuesto', id, 'Anulado '+(p?.numero||''));
  filtrarPresupuestos();
  toast('🚫 Presupuesto anulado','info');
  loadDashboard();
}

async function restaurarEstadoPres(id, nuevoEstado) {
  const p = presupuestos.find(x=>x.id===id);
  const esCaducado = p?.estado === 'caducado';
  const msg = esCaducado
    ? '♻️ Reactivar presupuesto '+(p?.numero||'')+'?\n\nSe extenderá la fecha de validez 15 días desde hoy y volverá a estado "pendiente".'
    : '¿Restaurar este presupuesto a estado "'+nuevoEstado+'"?';
  if (!confirm(msg)) return;

  const updateData = {estado: nuevoEstado};
  if (esCaducado) {
    const nueva = new Date();
    nueva.setDate(nueva.getDate() + 15);
    updateData.fecha_validez = nueva.toISOString().split('T')[0];
  }

  const { error } = await sb.from('presupuestos').update(updateData).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  if (p) { p.estado = nuevoEstado; if (updateData.fecha_validez) p.fecha_validez = updateData.fecha_validez; }
  registrarAudit('restaurar_estado', 'presupuesto', id, 'Restaurado a '+nuevoEstado+(esCaducado?' (+15 días validez)':'')+' — '+(p?.numero||''));
  toast('♻️ Presupuesto restaurado a '+nuevoEstado+(esCaducado?' — validez extendida 15 días':''),'success');
  await loadPresupuestos();
  loadDashboard();
  cerrarEditor();
}

async function eliminarDefinitivamente(id) {
  if (!CP?.es_superadmin) { toast('Solo superadmin puede eliminar definitivamente','error'); return; }
  const p = presupuestos.find(x=>x.id===id);

  let vinculados = [];
  try {
    const [r1, r2, r3] = await Promise.all([
      sb.from('albaranes').select('id,numero').eq('presupuesto_id', id),
      sb.from('facturas').select('id,numero').eq('presupuesto_id', id),
      sb.from('trabajos').select('id,numero').eq('presupuesto_id', id),
    ]);
    if (r1.data?.length) vinculados.push(...r1.data.map(d=>({tabla:'albaranes',id:d.id,num:d.numero,label:'Albarán'})));
    if (r2.data?.length) vinculados.push(...r2.data.map(d=>({tabla:'facturas',id:d.id,num:d.numero,label:'Factura'})));
    if (r3.data?.length) vinculados.push(...r3.data.map(d=>({tabla:'trabajos',id:d.id,num:d.numero,label:'Obra'})));
  } catch(e) { console.warn('Error checking vinculados:', e); }

  let msg = '⚠️ ELIMINAR DEFINITIVAMENTE el presupuesto '+(p?.numero||id)+'?\n\n⛔ Esta acción NO se puede deshacer.\nEl documento se eliminará permanentemente del sistema.';
  if (vinculados.length) {
    const lista = vinculados.map(v=>v.label+' '+v.num).join(', ');
    msg += '\n\n🔗 Docs vinculados que también se eliminarán:\n'+lista;
  }
  if (!confirm(msg)) return;

  for (const v of vinculados) {
    const { error: vErr } = await sb.from(v.tabla).update({estado:'eliminado'}).eq('id', v.id);
    if (vErr) console.warn('Error soft-delete vinculado:', v.tabla, v.id, vErr.message);
  }
  const { error } = await sb.from('presupuestos').update({estado:'eliminado'}).eq('id', id);
  if (error) {
    console.error('Error soft-delete presupuesto:', error.message);
    toast('Error al eliminar: '+error.message+'\n\n💡 Ejecuta SQL_papelera.sql en Supabase para habilitar la papelera','error');
    return;
  }

  const detalle = 'Eliminado '+(p?.numero||'')+(vinculados.length?' + '+vinculados.map(v=>v.label+' '+v.num).join(', '):'');
  registrarAudit('eliminar', 'presupuesto', id, detalle);
  presupuestos = presupuestos.filter(x=>x.id!==id);
  filtrarPresupuestos();
  toast('🗑️ Presupuesto eliminado'+(vinculados.length?' (+ '+vinculados.length+' docs vinculados)':''),'info');
  loadDashboard();
  if (deConfig.editId === id) cerrarEditor();
}

// ═══════════════════════════════════════════════
//  DUPLICAR Y EXPORTAR
// ═══════════════════════════════════════════════
async function duplicarPres(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  const nuevo = {...p}; delete nuevo.id; delete nuevo.created_at;
  nuevo.estado = 'borrador';
  nuevo.fecha  = new Date().toISOString().split('T')[0];
  nuevo.numero = await generarNumeroDoc('presupuesto');
  const { error } = await sb.from('presupuestos').insert(nuevo);
  if (error) { toast('Error: '+error.message,'error'); return; }
  toast('Duplicado ✓','success');
  await loadPresupuestos();
}

function exportarPresupuestos() {
  if (!window.XLSX) { toast('Cargando...','info'); return; }
  const lista = presFiltrados.length ? presFiltrados : presupuestos;
  if (!confirm('¿Exportar ' + lista.length + ' presupuestos a Excel?')) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Número','Cliente','Título','Fecha','Válido hasta','Total','Estado'],
    ...lista.map(p=>[p.numero||'',p.cliente_nombre||'',p.titulo||'',p.fecha||'',p.fecha_validez||'',p.total||0,p.estado||''])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(()=>({wch:20}));
  XLSX.utils.book_append_sheet(wb,ws,'Presupuestos');
  XLSX.writeFile(wb,'presupuestos_'+new Date().toISOString().split('T')[0]+'.xlsx');
  toast('Exportado ✓','success');
}

// ═══════════════════════════════════════════════
//  CONVERSIONES
// ═══════════════════════════════════════════════
async function presToFactura(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  if (!confirm('¿Convertir el presupuesto '+p.numero+' en factura?')) return;
  const numero = await generarNumeroDoc('factura');
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate()+30);
  const { error } = await sb.from('facturas').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: p.base_imponible, total_iva: p.total_iva, total: p.total,
    estado: 'pendiente', observaciones: p.observaciones, lineas: p.lineas,
    presupuesto_id: p.id,
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await sb.from('presupuestos').update({estado:'aceptado'}).eq('id',id);
  const pp = presupuestos.find(x=>x.id===id); if(pp) pp.estado='aceptado';
  renderPresupuestos(presupuestos);
  toast('✅ Factura creada — presupuesto aceptado','success');
  loadDashboard();
}

async function presToAlbaran(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  if (!confirm('¿Crear albarán desde el presupuesto '+p.numero+'?')) return;
  const numero = await generarNumeroDoc('albaran');
  const lineas = (p.lineas||[]).filter(l=>l.tipo!=='capitulo').map(l=>({
    desc:l.desc||'', cant:l.cant||1, precio:l.precio||0
  }));
  let total=0; lineas.forEach(l=>total+=l.cant*l.precio);
  const { error } = await sb.from('albaranes').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
    fecha: new Date().toISOString().split('T')[0],
    referencia: p.titulo||null,
    total: Math.round(total*100)/100,
    estado: 'pendiente', observaciones: p.observaciones, lineas,
    presupuesto_id: p.id,
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await sb.from('presupuestos').update({estado:'aceptado'}).eq('id',id);
  const pp = presupuestos.find(x=>x.id===id); if(pp) pp.estado='aceptado';
  renderPresupuestos(presFiltrados.length ? presFiltrados : presupuestos);
  toast('📄 Albarán creado — presupuesto aceptado','success');
  loadDashboard();
}

async function presToObra(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  if (!confirm('¿Crear obra desde el presupuesto '+p.numero+'?')) return;
  const c = clientes.find(x=>x.id===p.cliente_id);
  const dirParts = [c?.direccion_fiscal||c?.direccion, c?.cp_fiscal||c?.cp, c?.municipio_fiscal||c?.municipio, c?.provincia_fiscal||c?.provincia].filter(Boolean).join(', ');
  const numObra = `TRB-${new Date().getFullYear()}-${String(trabajos.length+1).padStart(3,'0')}`;
  const { error } = await sb.from('trabajos').insert({
    empresa_id: EMPRESA.id,
    numero: numObra,
    titulo: p.titulo || 'Obra desde '+p.numero,
    cliente_id: p.cliente_id, cliente_nombre: c?.nombre||p.cliente_nombre||'',
    estado: 'pendiente',
    presupuesto_id: p.id,
    descripcion: p.observaciones||null,
    direccion_obra_texto: dirParts||null,
    operario_id: CU.id, operario_nombre: CP?.nombre||'',
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await sb.from('presupuestos').update({estado:'aceptado'}).eq('id',id);
  const pp = presupuestos.find(x=>x.id===id); if(pp) pp.estado='aceptado';
  registrarAudit('crear_obra', 'presupuesto', id, 'Obra creada desde '+p.numero);
  renderPresupuestos(presFiltrados.length ? presFiltrados : presupuestos);
  toast('🏗️ Obra creada — presupuesto aceptado','success');
  loadDashboard();
}

async function presupuestoTieneVinculados(presId) {
  try {
    const [r1, r2, r3] = await Promise.all([
      sb.from('albaranes').select('id',{count:'exact',head:true}).eq('presupuesto_id', presId),
      sb.from('facturas').select('id',{count:'exact',head:true}).eq('presupuesto_id', presId),
      sb.from('trabajos').select('id',{count:'exact',head:true}).eq('presupuesto_id', presId),
    ]);
    return (r1.count||0) + (r2.count||0) + (r3.count||0) > 0;
  } catch(e) { console.warn('Error checking vinculados:', e); return false; }
}

// ═══════════════════════════════════════════════
//  IMPRESIÓN Y EMAIL
// ═══════════════════════════════════════════════
function imprimirPresupuesto(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) { toast('Presupuesto no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===p.cliente_id);
  const capLineas = p.lineas||[];
  let htmlLineas = '';
  capLineas.forEach(l => {
    if (l.tipo==='capitulo') {
      htmlLineas += `<tr class="cap-row"><td colspan="6"><span class="cap-icon">■</span> ${l.titulo||''}</td></tr>`;
    } else if (l.tipo==='subcapitulo') {
      htmlLineas += `<tr class="sub-row"><td colspan="6"><span class="sub-icon">▸</span> ${l.titulo||''}</td></tr>`;
    } else {
      const dto = l.dto||0;
      const sub = (l.cant||1)*(l.precio||0)*(1-dto/100);
      const iva = sub*((l.iva||0)/100);
      htmlLineas += `<tr class="item-row">
        <td class="desc-cell">${l.desc||''}</td>
        <td class="num-cell">${l.cant||1}</td>
        <td class="num-cell">${(l.precio||0).toFixed(2)} €</td>
        <td class="num-cell">${dto?dto+'%':'—'}</td>
        <td class="num-cell">${l.iva||0}%</td>
        <td class="num-cell total-cell">${(sub+iva).toFixed(2)} €</td>
      </tr>`;
    }
  });
  const dirEmpresa = [EMPRESA?.direccion, [EMPRESA?.cp, EMPRESA?.municipio].filter(Boolean).join(' '), EMPRESA?.provincia].filter(Boolean).join(', ');
  const dirCliente = c ? [c.direccion_fiscal||c.direccion, [c.cp_fiscal||c.cp, c.municipio_fiscal||c.municipio].filter(Boolean).join(' '), c.provincia_fiscal||c.provincia].filter(Boolean).join(', ') : '';
  const logoHtml = EMPRESA?.logo_url ? `<img src="${EMPRESA.logo_url}" class="logo-img">` : `<div class="logo-placeholder">${(EMPRESA?.nombre||'JI').substring(0,2).toUpperCase()}</div>`;
  const win = window.open('','_blank','width=850,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>Presupuesto ${p.numero}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    @page{size:A4;margin:12mm 14mm 18mm 14mm}
    body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;line-height:1.4}
    .page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm;position:relative}
    .header-row{display:flex;gap:24px;margin-bottom:16px;align-items:stretch}
    .header-col{flex:1;min-width:0}
    .emp-block{display:flex;align-items:flex-start;gap:14px}
    .logo-img{width:60px;height:60px;object-fit:contain;border-radius:8px}
    .logo-placeholder{width:60px;height:60px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;letter-spacing:1px;flex-shrink:0}
    .emp-info .name{font-size:16px;font-weight:700;color:#1e40af;margin-bottom:1px}
    .emp-info .razon{font-size:11px;color:#64748b;margin-bottom:2px}
    .emp-info .datos{font-size:11px;color:#475569;line-height:1.55}
    .cli-block{background:#f1f5f9;border-radius:8px;padding:12px 16px;border-left:4px solid #1e40af;height:100%}
    .cli-block .label{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:4px}
    .cli-block .nombre{font-size:15px;font-weight:700;color:#1e2a3a;margin-bottom:3px}
    .cli-block .detalle{font-size:11px;color:#475569;line-height:1.55}
    .cli-block .detalle span{margin-right:12px}
    .doc-bar{display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px}
    .doc-bar .doc-left{font-size:11px;color:#1e40af;display:flex;align-items:baseline;gap:6px}
    .doc-bar .doc-left .tipo{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px}
    .doc-bar .doc-left .nro{font-size:11px;font-weight:600;color:#475569}
    .doc-bar .fechas{font-size:11px;color:#64748b;display:flex;gap:16px}
    .doc-bar .fechas b{color:#334155;font-weight:600}
    ${p.titulo?'.ref-line{font-size:10.5px;color:#92400e;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 14px;border-radius:4px;margin-bottom:10px}':''}
    .items-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}
    .items-table thead th{background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.7px;text-align:left}
    .items-table thead th.r{text-align:right}
    .cap-row td{background:#eef2ff;padding:7px 10px;font-weight:700;font-size:10.5px;color:#1e40af;border-bottom:1px solid #dbeafe}
    .cap-icon{color:#1e40af;margin-right:4px}
    .sub-row td{background:#f8fafc;padding:5px 10px 5px 22px;font-weight:600;font-size:10px;color:#475569;border-bottom:1px solid #f1f5f9}
    .sub-icon{color:#94a3b8;margin-right:3px}
    .item-row td{border-bottom:1px solid #f1f5f9}
    .desc-cell{padding:6px 10px;color:#334155}
    .num-cell{padding:6px 8px;text-align:right;color:#475569;white-space:nowrap}
    .total-cell{font-weight:700;color:#1e2a3a}
    .items-table tbody tr:last-child td{border-bottom:none}
    .totals-block{display:flex;justify-content:flex-end;margin-bottom:16px}
    .totals-inner{min-width:230px}
    .totals-row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569}
    .totals-row b{color:#1e2a3a}
    .totals-row.grand{padding:10px 14px;background:#1e40af;color:#fff;border-radius:6px;font-size:15px;font-weight:800;margin-top:4px}
    .totals-row.grand b{color:#fff}
    .obs-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:10px;color:#475569;line-height:1.5}
    .obs-box .obs-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px}
    .validez-box{background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:8px 14px;margin-bottom:12px;font-size:10px;color:#92400e;text-align:center}
    .footer{position:absolute;bottom:20px;left:36px;right:36px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between}
    @media print{
      body{background:#fff}
      .page{padding:0;box-shadow:none;min-height:auto}
      .no-print{display:none!important}
      .footer{position:fixed;bottom:8mm;left:14mm;right:14mm}
    }
    .btn-bar{text-align:center;padding:16px;background:#f5f5f5}
    .btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px;transition:all .2s}
    .btn-print{background:#1e40af;color:#fff}
    .btn-print:hover{background:#1d4ed8}
    .btn-close{background:#e2e8f0;color:#475569}
    .btn-close:hover{background:#cbd5e1}
  </style></head><body>
  <div class="no-print btn-bar">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
  <div class="page">
    <div class="header-row">
      <div class="header-col">
        <div class="emp-block">
          ${logoHtml}
          <div class="emp-info">
            <div class="name">${EMPRESA?.nombre||'Mi Empresa'}</div>
            ${EMPRESA?.razon_social?'<div class="razon">'+EMPRESA.razon_social+'</div>':''}
            <div class="datos">
              ${EMPRESA?.cif?'CIF: '+EMPRESA.cif+'<br>':''}
              ${dirEmpresa?dirEmpresa+'<br>':''}
              ${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.telefono&&EMPRESA?.email?' · ':''}${EMPRESA?.email?EMPRESA.email:''}
              ${EMPRESA?.web?'<br>'+EMPRESA.web:''}
            </div>
          </div>
        </div>
      </div>
      <div class="header-col">
        <div class="cli-block">
          <div class="label">Cliente</div>
          <div class="nombre">${p.cliente_nombre||'—'}</div>
          <div class="detalle">
            ${c?.nif?'<span><b>NIF:</b> '+c.nif+'</span>':''}
            ${c?.telefono?'<span><b>Tel:</b> '+c.telefono+'</span>':''}
            ${c?.email?'<br><b>Email:</b> '+c.email:''}
            ${dirCliente?'<br>'+dirCliente:''}
          </div>
        </div>
      </div>
    </div>
    <div class="doc-bar">
      <div class="doc-left"><span class="tipo">PRESUPUESTO</span><span class="nro">${p.numero||'—'}${p.version>1?' · v'+p.version:''}</span></div>
      <div class="fechas">
        <span><b>Fecha:</b> ${p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'}</span>
        <span><b>Válido hasta:</b> ${p.fecha_validez?new Date(p.fecha_validez).toLocaleDateString('es-ES'):'—'}</span>
      </div>
    </div>
    ${p.titulo?'<div class="ref-line"><b>Ref:</b> '+p.titulo+'</div>':''}
    <table class="items-table">
      <thead><tr>
        <th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Dto.</th><th class="r">IVA</th><th class="r">Total</th>
      </tr></thead>
      <tbody>${htmlLineas}</tbody>
    </table>
    <div class="totals-block">
      <div class="totals-inner">
        <div class="totals-row"><span>Base imponible</span><b>${(p.base_imponible||0).toFixed(2)} €</b></div>
        <div class="totals-row"><span>IVA</span><b>${(p.total_iva||0).toFixed(2)} €</b></div>
        <div class="totals-row grand"><span>TOTAL</span><b>${(p.total||0).toFixed(2)} €</b></div>
      </div>
    </div>
    ${p.observaciones?'<div class="obs-box"><div class="obs-title">Observaciones</div>'+p.observaciones.replace(/\n/g,'<br>')+'</div>':''}
    <div class="validez-box">
      Este presupuesto tiene una validez de ${p.fecha_validez?Math.max(0,Math.round((new Date(p.fecha_validez)-new Date(p.fecha))/(1000*60*60*24)))+' días':'—'} desde la fecha de emisión.
      Para aceptarlo, póngase en contacto con nosotros antes de la fecha de validez indicada.
    </div>
    <div class="footer">
      <span>${EMPRESA?.nombre||''} ${EMPRESA?.cif?' · CIF: '+EMPRESA.cif:''}</span>
      <span>${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.email?' · '+EMPRESA.email:''}</span>
    </div>
  </div>
  </body></html>`);
  win.document.close();
}

function enviarPresupuestoEmail(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) { toast('Presupuesto no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===p.cliente_id);
  const email = c?.email || '';
  const asunto = encodeURIComponent(`Presupuesto ${p.numero||''} — ${EMPRESA?.nombre||''}`);
  const totalFmt = (p.total||0).toFixed(2).replace('.',',') + ' €';
  const fechaFmt = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
  const validezFmt = p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—';
  const cuerpo = encodeURIComponent(
`Estimado/a ${p.cliente_nombre||'cliente'},

Le adjuntamos el presupuesto ${p.numero||''} con fecha ${fechaFmt}.

Importe total: ${totalFmt} (IVA incluido)
Válido hasta: ${validezFmt}

Para aceptar este presupuesto, puede responder a este correo o contactarnos directamente.

Un saludo cordial,
${EMPRESA?.nombre||''}
${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}
${EMPRESA?.email||''}
${EMPRESA?.web||''}`
  );
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, '_self');
  toast('📧 Abriendo cliente de correo...','info');
}

// ═══════════════════════════════════════════════
//  GUARDAR PRESUPUESTO Y GENERAR PDF
// ═══════════════════════════════════════════════
async function guardarPresupYPdf() {
  // Guardar primero como borrador
  const clienteId=parseInt(document.getElementById('pr_cliente').value);
  if(!clienteId){toast('Selecciona un cliente','error');return;}
  const lineas=prLineas.filter(l=>l.desc||l.precio>0||l.tipo==='capitulo');
  if(!lineas.filter(l=>l.tipo!=='capitulo').length){toast('Añade al menos una línea','error');return;}
  const c=clientes.find(x=>x.id===clienteId);
  let base=0,ivaT=0;
  lineas.filter(l=>l.tipo!=='capitulo').forEach(l=>{const s=l.cant*l.precio*(1-(l.dto||0)/100);base+=s;ivaT+=s*((l.iva||0)/100);});
  const editId = parseInt(document.getElementById('mPresupRapido').dataset.editId);
  const datos = {
    empresa_id:EMPRESA.id, numero:document.getElementById('pr_numero').value,
    cliente_id:clienteId, cliente_nombre:c?.nombre||'',
    fecha:document.getElementById('pr_fecha').value,
    fecha_validez:document.getElementById('pr_valido').value||null,
    titulo:document.getElementById('pr_titulo').value||null,
    forma_pago_id:parseInt(document.getElementById('pr_fpago').value)||null,
    base_imponible:Math.round(base*100)/100,
    total_iva:Math.round(ivaT*100)/100,
    total:Math.round((base+ivaT)*100)/100,
    observaciones:document.getElementById('pr_obs').value||null,
    lineas, estado:'borrador',
  };
  let error, savedId = editId;
  if (editId) {
    ({error} = await sb.from('presupuestos').update(datos).eq('id', editId));
  } else {
    const res = await sb.from('presupuestos').insert(datos).select('id').single();
    error = res.error;
    if (res.data) savedId = res.data.id;
  }
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mPresupRapido');
  toast('💾 Guardado ✓ — Generando PDF...','success');
  await loadPresupuestos();
  loadDashboard();
  // Generar PDF
  const pres = presupuestos.find(x=>x.id===savedId) || {...datos, id:savedId};
  generarPdfPresupuesto(pres);
}

// ═══════════════════════════════════════════════
//  GENERACIÓN DE PDF PRESUPUESTO
// ═══════════════════════════════════════════════
function generarPdfPresupuesto(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','mm','a4');
  const W = 210, H = 297;
  const ML = 15, MR = 15;
  const azul = [27,79,216];
  const gris = [100,116,139];
  const negro = [30,41,59];

  let y = 15;

  // ─── CABECERA EMPRESA ───
  // Logo (si hay)
  // Nombre empresa
  doc.setFontSize(18);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text(EMPRESA.nombre||'Mi Empresa', ML, y+6);

  doc.setFontSize(8.5);
  doc.setTextColor(...gris);
  doc.setFont(undefined, 'normal');
  const empInfo = [];
  if (EMPRESA.cif) empInfo.push('CIF: '+EMPRESA.cif);
  if (EMPRESA.direccion) empInfo.push(EMPRESA.direccion);
  const empLoc = [EMPRESA.cp, EMPRESA.municipio, EMPRESA.provincia].filter(Boolean).join(', ');
  if (empLoc) empInfo.push(empLoc);
  if (EMPRESA.telefono) empInfo.push('Tel: '+EMPRESA.telefono);
  if (EMPRESA.email) empInfo.push(EMPRESA.email);
  empInfo.forEach((t,i)=> doc.text(t, ML, y+12+i*3.5));

  // ─── TÍTULO DOCUMENTO ───
  doc.setFontSize(22);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text('PRESUPUESTO', W-MR, y+6, {align:'right'});

  doc.setFontSize(11);
  doc.setTextColor(...negro);
  doc.text(p.numero||'—', W-MR, y+13, {align:'right'});

  y += 12 + empInfo.length*3.5 + 8;

  // ─── LÍNEA SEPARADORA ───
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.8);
  doc.line(ML, y, W-MR, y);
  y += 8;

  // ─── DATOS CLIENTE Y PRESUPUESTO ───
  // Cliente
  doc.setFontSize(8);
  doc.setTextColor(...gris);
  doc.text('CLIENTE', ML, y);
  doc.setFontSize(12);
  doc.setTextColor(...negro);
  doc.setFont(undefined, 'bold');
  doc.text(p.cliente_nombre||'—', ML, y+5.5);

  // Buscar datos cliente
  const cli = clientes.find(x=>x.id===p.cliente_id);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  let cy = y+10;
  if (cli?.nif) { doc.text('NIF: '+cli.nif, ML, cy); cy+=3.8; }
  if (cli?.direccion) { doc.text(cli.direccion, ML, cy); cy+=3.8; }
  const cliLoc = [cli?.cp, cli?.municipio, cli?.provincia].filter(Boolean).join(', ');
  if (cliLoc) { doc.text(cliLoc, ML, cy); cy+=3.8; }
  if (cli?.email) { doc.text(cli.email, ML, cy); cy+=3.8; }

  // Datos presupuesto (columna derecha)
  const rx = 130;
  const datosP = [
    ['Fecha', p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—'],
    ['Válido hasta', p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—'],
  ];
  if (p.titulo) datosP.push(['Referencia', p.titulo]);

  datosP.forEach(([k,v],i)=>{
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text(k, rx, y+i*8);
    doc.setFontSize(10);
    doc.setTextColor(...negro);
    doc.setFont(undefined, 'bold');
    doc.text(v, rx, y+4+i*8);
    doc.setFont(undefined, 'normal');
  });

  y = Math.max(cy, y+datosP.length*8) + 8;

  // ─── TABLA LÍNEAS ───
  const lineas = (p.lineas||[]);
  const tableBody = [];
  let currentCap = null;

  lineas.forEach(l => {
    if (l.tipo==='capitulo') {
      currentCap = l.titulo||'Capítulo';
      tableBody.push([{content:'\u{1F4C1} '+currentCap, colSpan:6, styles:{fontStyle:'bold',fillColor:[238,243,255],textColor:azul,fontSize:9}}]);
    } else {
      const sub = (l.cant||0)*(l.precio||0)*(1-((l.dto||0)/100));
      const iv = sub*((l.iva||0)/100);
      tableBody.push([
        l.desc||'',
        {content:String(l.cant||0), styles:{halign:'right'}},
        {content:fmtE(l.precio||0), styles:{halign:'right'}},
        {content:l.dto?l.dto+'%':'—', styles:{halign:'right'}},
        {content:l.iva!=null?l.iva+'%':'—', styles:{halign:'right'}},
        {content:fmtE(sub+iv), styles:{halign:'right',fontStyle:'bold'}},
      ]);
    }
  });

  doc.autoTable({
    startY: y,
    margin: {left:ML, right:MR},
    head: [['Descripción','Cant.','Precio','Dto.','IVA','Total']],
    body: tableBody,
    headStyles: {fillColor:azul, textColor:[255,255,255], fontSize:8.5, fontStyle:'bold', cellPadding:3},
    bodyStyles: {fontSize:8.5, textColor:negro, cellPadding:2.5},
    alternateRowStyles: {fillColor:[248,250,252]},
    columnStyles: {
      0: {cellWidth:'auto'},
      1: {cellWidth:18, halign:'right'},
      2: {cellWidth:24, halign:'right'},
      3: {cellWidth:18, halign:'right'},
      4: {cellWidth:18, halign:'right'},
      5: {cellWidth:28, halign:'right'},
    },
    theme: 'grid',
    styles: {lineColor:[226,232,240], lineWidth:0.3},
  });

  y = doc.lastAutoTable.finalY + 8;

  // ─── TOTALES ───
  const totX = 130;
  const totW = W-MR-totX;

  // Base imponible
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  doc.text('Base imponible', totX, y);
  doc.setTextColor(...negro);
  doc.text(fmtE(p.base_imponible||0), W-MR, y, {align:'right'});
  y+=5;

  // IVA
  doc.setTextColor(...gris);
  doc.text('IVA', totX, y);
  doc.setTextColor(...negro);
  doc.text(fmtE(p.total_iva||0), W-MR, y, {align:'right'});
  y+=6;

  // Línea
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.5);
  doc.line(totX, y, W-MR, y);
  y+=5;

  // Total
  doc.setFontSize(13);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text('TOTAL', totX, y);
  doc.text(fmtE(p.total||0), W-MR, y, {align:'right'});
  doc.setFont(undefined, 'normal');
  y+=10;

  // ─── OBSERVACIONES ───
  if (p.observaciones) {
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text('OBSERVACIONES', ML, y);
    y+=4;
    doc.setFontSize(8.5);
    doc.setTextColor(...negro);
    const obsLines = doc.splitTextToSize(p.observaciones, W-ML-MR);
    doc.text(obsLines, ML, y);
    y += obsLines.length * 3.5 + 5;
  }

  // ─── PIE DE PÁGINA ───
  const footY = H-12;
  doc.setFontSize(7.5);
  doc.setTextColor(...gris);
  doc.setDrawColor(226,232,240);
  doc.setLineWidth(0.3);
  doc.line(ML, footY-4, W-MR, footY-4);
  doc.text(EMPRESA.nombre||'', ML, footY);
  if (EMPRESA.telefono) doc.text('Tel: '+EMPRESA.telefono, ML+50, footY);
  if (EMPRESA.email) doc.text(EMPRESA.email, ML+100, footY);
  doc.text('Página 1 de 1', W-MR, footY, {align:'right'});

  // ─── DESCARGAR ───
  doc.save('Presupuesto_'+(p.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')+'.pdf');
  toast('📄 PDF descargado ✓','success');
}
