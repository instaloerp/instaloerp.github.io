/**
 * MÓDULO ALBARANES
 * Gestión completa de albaranes: CRUD, listado, filtrado, conversión a facturas
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let albaranesData = [];
let abFiltrados = [];

// ═══════════════════════════════════════════════
//  CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadAlbaranes() {
  const { data } = await sb.from('albaranes')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'eliminado')
    .order('created_at', { ascending: false });
  albaranesData = data || [];
  abFiltrados = [...albaranesData];
  renderAlbaranes(albaranesData);
}

function renderAlbaranes(list) {
  const ESTADOS = {
    pendiente:  { label:'Pendiente',  color:'var(--amarillo)' },
    entregado:  { label:'Entregado',  color:'var(--verde)' },
    facturado:  { label:'Facturado',  color:'var(--azul)' },
    anulado:    { label:'Anulado',    color:'var(--gris-400)' },
  };

  // KPIs
  const kTotal    = document.getElementById('ak-total');
  const kPend     = document.getElementById('ak-pendientes');
  const kEntr     = document.getElementById('ak-entregados');
  const kFact     = document.getElementById('ak-facturados');
  const kImporte  = document.getElementById('ak-importe');
  if (kTotal)   kTotal.textContent   = albaranesData.length;
  if (kPend)    kPend.textContent    = albaranesData.filter(a=>a.estado==='pendiente').length;
  if (kEntr)    kEntr.textContent    = albaranesData.filter(a=>a.estado==='entregado').length;
  if (kFact)    kFact.textContent    = albaranesData.filter(a=>a.estado==='facturado').length;
  if (kImporte) kImporte.textContent = fmtE(albaranesData.reduce((s,a)=>s+(a.total||0),0));

  const tbody = document.getElementById('abTable');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(a => {
    const est = ESTADOS[a.estado] || { label: a.estado||'—', color:'var(--gris-400)' };
    return `<tr style="cursor:pointer" onclick="verDetalleAlbaran(${a.id})">
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">${a.numero||'—'}</td>
      <td><div style="font-weight:600">${a.cliente_nombre||'—'}</div></td>
      <td style="color:var(--gris-600);font-size:12.5px">${a.referencia||'—'}</td>
      <td style="font-size:12px">${a.fecha ? new Date(a.fecha).toLocaleDateString('es-ES') : '—'}</td>
      <td style="font-weight:700">${fmtE(a.total||0)}</td>
      <td>
        <select onclick="event.stopPropagation()" onchange="cambiarEstadoAlb(${a.id},this.value)"
          style="padding:4px 8px;border-radius:6px;border:1.5px solid var(--gris-200);font-size:12px;outline:none;cursor:pointer">
          ${Object.entries(ESTADOS).map(([k,v])=>`<option value="${k}" ${a.estado===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </td>
      <td>
        <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="editarAlbaran(${a.id})" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="duplicarAlbaran(${a.id})" title="Duplicar">📋</button>
          <button class="btn btn-ghost btn-sm" onclick="albaranToFactura(${a.id})" title="Convertir a factura">🧾</button>
          <button class="btn btn-ghost btn-sm" onclick="delAlbaran(${a.id})" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="7"><div class="empty"><div class="ei">📄</div><h3>Sin albaranes</h3><p>Crea el primero con el botón "+ Nuevo albarán"</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  FILTRADO Y BÚSQUEDA
// ═══════════════════════════════════════════════
function filtrarAlbaranes() {
  const q   = (document.getElementById('abSearch')?.value||'').toLowerCase();
  const est = document.getElementById('abEstado')?.value||'';
  const des = document.getElementById('abDesde')?.value||'';
  const has = document.getElementById('abHasta')?.value||'';
  abFiltrados = albaranesData.filter(a =>
    (!q   || (a.numero||'').toLowerCase().includes(q) || (a.cliente_nombre||'').toLowerCase().includes(q) || (a.referencia||'').toLowerCase().includes(q)) &&
    (!est || a.estado === est) &&
    (!des || (a.fecha && a.fecha >= des)) &&
    (!has || (a.fecha && a.fecha <= has))
  );
  renderAlbaranes(abFiltrados);
}

// ═══════════════════════════════════════════════
//  GESTIÓN DE ESTADOS
// ═══════════════════════════════════════════════
async function cambiarEstadoAlb(id, estado) {
  const { error } = await sb.from('albaranes').update({ estado }).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  const a = albaranesData.find(x=>x.id===id);
  if (a) a.estado = estado;
  toast('Estado actualizado ✓','success');
  renderAlbaranes(abFiltrados.length ? abFiltrados : albaranesData);
  loadDashboard();
}

// ═══════════════════════════════════════════════
//  ELIMINAR Y DUPLICAR
// ═══════════════════════════════════════════════
async function delAlbaran(id) {
  if (!confirm('¿Eliminar este albarán?')) return;
  await sb.from('albaranes').delete().eq('id', id);
  albaranesData = albaranesData.filter(x=>x.id!==id);
  abFiltrados = abFiltrados.filter(x=>x.id!==id);
  renderAlbaranes(abFiltrados.length ? abFiltrados : albaranesData);
  toast('Eliminado','info');
  loadDashboard();
}

async function duplicarAlbaran(id) {
  const a = albaranesData.find(x=>x.id===id);
  if (!a) return;
  const nuevo = {...a}; delete nuevo.id; delete nuevo.created_at;
  nuevo.estado = 'pendiente';
  nuevo.fecha  = new Date().toISOString().split('T')[0];
  nuevo.numero = await generarNumeroDoc('albaran');
  const { error } = await sb.from('albaranes').insert(nuevo);
  if (error) { toast('Error: '+error.message,'error'); return; }
  toast('Duplicado ✓','success');
  await loadAlbaranes();
}

// ═══════════════════════════════════════════════
//  CONVERSIONES
// ═══════════════════════════════════════════════
async function albaranToFactura(id) {
  const a = albaranesData.find(x=>x.id===id);
  if (!a) return;
  if (!confirm('¿Convertir el albarán '+a.numero+' en factura?')) return;
  const numero = await generarNumeroDoc('factura');
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate()+30);
  const { error } = await sb.from('facturas').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: a.cliente_id, cliente_nombre: a.cliente_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: a.total||0, total_iva: 0, total: a.total||0,
    estado: 'pendiente', observaciones: a.observaciones,
    lineas: a.lineas, albaran_id: a.id,
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await sb.from('albaranes').update({estado:'facturado'}).eq('id',id);
  const ab = albaranesData.find(x=>x.id===id); if(ab) ab.estado='facturado';
  renderAlbaranes(abFiltrados.length ? abFiltrados : albaranesData);
  toast('✅ Factura creada — albarán marcado como facturado','success');
  loadDashboard();
}

// ═══════════════════════════════════════════════
//  VER DETALLE Y EDITAR
// ═══════════════════════════════════════════════
function verDetalleAlbaran(id) {
  const a = albaranesData.find(x=>x.id===id);
  if (!a) return;
  document.getElementById('abDetId').value = id;
  document.getElementById('abDetNro').textContent = a.numero||'—';
  document.getElementById('abDetCli').textContent = a.cliente_nombre||'—';
  document.getElementById('abDetFecha').textContent = a.fecha ? new Date(a.fecha).toLocaleDateString('es-ES') : '—';
  document.getElementById('abDetRef').textContent = a.referencia||'—';

  const ESTADOS = {pendiente:'Pendiente',entregado:'Entregado',facturado:'Facturado',anulado:'Anulado'};
  const COLORES = {pendiente:'var(--amarillo)',entregado:'var(--verde)',facturado:'var(--azul)',anulado:'var(--gris-400)'};
  document.getElementById('abDetEstado').innerHTML = `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:white;background:${COLORES[a.estado]||'var(--gris-400)'}">${ESTADOS[a.estado]||a.estado||'—'}</span>`;

  const lineas = a.lineas || [];
  let total = 0;
  document.getElementById('abDetLineas').innerHTML = lineas.map(l => {
    const sub = (l.cant||0)*(l.precio||0); total += sub;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:8px 10px;font-size:13px">${l.desc||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.cant||0}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmtE(l.precio||0)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub)}</td>
    </tr>`;
  }).join('');
  document.getElementById('abDetTotal').textContent = fmtE(a.total||total);

  const obsWrap = document.getElementById('abDetObsWrap');
  const obsDiv = document.getElementById('abDetObs');
  if (a.observaciones) {
    obsWrap.style.display = 'block';
    obsDiv.textContent = a.observaciones;
  } else {
    obsWrap.style.display = 'none';
  }
  openModal('mAbDetalle', true);
}

async function editarAlbaran(id) {
  abrirEditor('albaran', id);
}

// ═══════════════════════════════════════════════
//  EXPORTAR
// ═══════════════════════════════════════════════
function exportarAlbaranes() {
  if (!window.XLSX) { toast('Cargando...','info'); return; }
  if (!confirm('¿Exportar ' + albaranesData.length + ' albaranes a Excel?')) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Número','Cliente','Referencia','Fecha','Total','Estado'],
    ...albaranesData.map(a=>[a.numero||'',a.cliente_nombre||'',a.referencia||'',a.fecha||'',a.total||0,a.estado||''])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(()=>({wch:20}));
  XLSX.utils.book_append_sheet(wb,ws,'Albaranes');
  XLSX.writeFile(wb,'albaranes_'+new Date().toISOString().split('T')[0]+'.xlsx');
  toast('Exportado ✓','success');
}
