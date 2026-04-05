// ═══════════════════════════════════════════════
// Supplier CRUD functions - Proveedores
// ═══════════════════════════════════════════════

let provActualId = null;
let provVista = 'lista';

function setProvVista(v) {
  provVista = v;
  document.getElementById('provVista-lista').style.display = v === 'ficha' ? 'none' : 'block';
  document.getElementById('provVista-ficha').style.display = v === 'ficha' ? 'block' : 'none';
  if (v === 'lista') {
    document.getElementById('pgTitle').textContent = 'Proveedores';
    document.getElementById('pgSub').textContent = '';
    const tb = document.getElementById('topbarBtns');
    if (tb) tb.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="openModal('mImportarProveedores')">📥 Importar</button><button class="btn btn-primary btn-sm" onclick="openModal('mProveedor')">+ Nuevo</button>`;
    provActualId = null;
  }
}

function renderProveedores(list) {
  document.getElementById('provCount').textContent=`${proveedores.length} proveedores`;
  document.getElementById('provTable').innerHTML = list.length ?
    list.map(p=>`<tr style="cursor:pointer" onclick="abrirFichaProveedor(${p.id})">
      <td><div style="font-weight:700">${p.nombre}</div><div style="font-size:11px;color:var(--gris-400)">${p.web||''}</div></td>
      <td style="font-family:monospace;font-size:12px">${p.cif||'—'}</td>
      <td>${p.telefono||'—'}</td>
      <td>${p.email_pedidos||p.email||'—'}</td>
      <td>${p.municipio||'—'}</td>
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:4px">
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
  // Poblar selector de banco
  poblarBancoProveedor(p.banco_predeterminado_id);
  document.getElementById('mProvTit').textContent='Editar Proveedor';
  openModal('mProveedor');
}

function editProvActual() {
  if (provActualId) editProv(provActualId);
}

function poblarBancoProveedor(selectedId) {
  const sel = document.getElementById('pv_banco');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>' +
    (typeof cuentasBancarias !== 'undefined' ? cuentasBancarias : []).map(b =>
      `<option value="${b.id}" ${b.id == selectedId ? 'selected' : ''}>${b.nombre}${b.iban ? ' — ' + b.iban.slice(-8) : ''}</option>`
    ).join('');
}

async function saveProveedor() {
  const nombre=document.getElementById('pv_nombre').value.trim();
  if(!nombre){toast('Introduce el nombre','error');return;}
  const id=document.getElementById('pv_id').value;
  const bancoId = document.getElementById('pv_banco')?.value || null;
  const banco = (typeof cuentasBancarias !== 'undefined' ? cuentasBancarias : []).find(b => b.id == bancoId);
  const obj={empresa_id:EMPRESA.id,nombre,cif:v('pv_cif'),telefono:v('pv_tel'),email_pedidos:v('pv_email_ped'),email:v('pv_email'),web:v('pv_web'),direccion:v('pv_dir'),municipio:v('pv_muni'),cp:v('pv_cp'),provincia:v('pv_prov'),dias_pago:parseInt(v('pv_dias'))||30,observaciones:v('pv_notas'),banco_predeterminado_id:bancoId?parseInt(bancoId):null,banco_predeterminado_nombre:banco?banco.nombre:null};
  if(id){await sb.from('proveedores').update(obj).eq('id',id);}
  else{await sb.from('proveedores').insert(obj);}
  closeModal('mProveedor');
  const {data}=await sb.from('proveedores').select('*').eq('empresa_id',EMPRESA.id).order('nombre');
  proveedores=data||[]; renderProveedores(proveedores);
  toast('Proveedor guardado ✓','success');
  // Si estábamos en la ficha, recargar
  if (provActualId && id == provActualId) abrirFichaProveedor(provActualId);
}

async function delProv(id) {
  if(!confirm('¿Eliminar proveedor?'))return;
  await sb.from('proveedores').delete().eq('id',id);
  proveedores=proveedores.filter(p=>p.id!==id); renderProveedores(proveedores);
  if (provActualId === id) setProvVista('lista');
  toast('Proveedor eliminado','info');
}

// ═══════════════════════════════════════════════
//  FICHA DE PROVEEDOR
// ═══════════════════════════════════════════════
function datoFichaProv(label, val) {
  return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;border-bottom:1px solid var(--gris-50)"><span style="color:var(--gris-400)">${label}</span><span style="font-weight:600;color:var(--gris-700);text-align:right;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${val}</span></div>`;
}

async function abrirFichaProveedor(id) {
  provActualId = id;
  const p = proveedores.find(x => x.id === id);
  if (!p) return;

  document.getElementById('fichaProvNombre').textContent = p.nombre;
  document.getElementById('pgTitle').textContent = p.nombre;
  document.getElementById('pgSub').textContent = 'Proveedor';
  const tb = document.getElementById('topbarBtns');
  if (tb) tb.innerHTML = '';
  setProvVista('ficha');

  // Avatar
  const av = document.getElementById('fichaProvAvatar');
  if (av) { av.style.background = avC(p.nombre); av.textContent = ini(p.nombre); }
  const sub = document.getElementById('fichaProvSub');
  if (sub) sub.textContent = [p.municipio, p.provincia].filter(Boolean).join(' · ');

  // Datos principales
  const fpName = (typeof formasPago !== 'undefined' ? formasPago : []).find(f => f.id === p.forma_pago_id)?.nombre || '—';
  document.getElementById('fichaProvDatos').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaProv('CIF/NIF', p.cif || '—')}
      ${datoFichaProv('Teléfono', p.telefono || '—')}
      ${datoFichaProv('Email pedidos', p.email_pedidos || '—')}
      ${datoFichaProv('Email facturación', p.email || '—')}
      ${datoFichaProv('Web', p.web || '—')}
      ${datoFichaProv('Dirección', p.direccion || '—')}
      ${datoFichaProv('Municipio', p.municipio || '—')}
      ${datoFichaProv('CP / Provincia', (p.cp || '') + ' ' + (p.provincia || ''))}
      ${datoFichaProv('Forma de pago', fpName)}
      ${datoFichaProv('Días de pago', p.dias_pago || 30)}
      ${p.observaciones ? `<div style="margin-top:6px;padding:8px;background:var(--gris-50);border-radius:7px;font-size:11.5px;color:var(--gris-600)">${p.observaciones}</div>` : ''}
    </div>`;

  // Regla de pago
  const bancoNombre = p.banco_predeterminado_nombre || '—';
  document.getElementById('fichaProvRegla').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaProv('Banco', bancoNombre)}
      ${datoFichaProv('Días vencimiento', p.dias_pago || 30)}
      ${datoFichaProv('Forma de pago', fpName)}
      <div style="margin-top:6px;font-size:10.5px;color:var(--gris-400)">Al crear facturas de este proveedor, el banco y vencimiento se asignarán automáticamente.</div>
    </div>`;

  // Cargar todo en paralelo
  const [peds, recs, fps] = await Promise.all([
    sb.from('pedidos_compra').select('*').eq('proveedor_id', id).eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false}).limit(20),
    sb.from('recepciones').select('*').eq('proveedor_id', id).eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false}).limit(20),
    sb.from('facturas_proveedor').select('*').eq('proveedor_id', id).eq('empresa_id', EMPRESA.id).order('fecha', {ascending:false}).limit(20),
  ]);

  // KPIs
  document.getElementById('fpk-pedidos').textContent = (peds.data || []).length;
  document.getElementById('fpk-albaranes').textContent = (recs.data || []).length;
  document.getElementById('fpk-facturas').textContent = (fps.data || []).length;
  const pagosPend = (fps.data || []).filter(f => f.estado === 'pendiente');
  document.getElementById('fpk-pagospend').textContent = pagosPend.length;
  document.getElementById('fpk-notas').textContent = '0';

  const totalFact = (fps.data || []).reduce((s, f) => s + (f.total || 0), 0);
  const pendientePago = pagosPend.reduce((s, f) => s + (f.total || 0), 0);

  function resumenBar(items) {
    return `<div style="display:flex;gap:12px;padding:8px 10px;margin-bottom:10px;background:var(--gris-50);border-radius:8px;font-size:11.5px;flex-wrap:wrap">${items.join('')}</div>`;
  }
  function resumenItem(label, val, color) {
    return `<div><span style="color:var(--gris-400)">${label}:</span> <strong style="color:${color || 'var(--gris-900)'}">${val}</strong></div>`;
  }

  // Pedidos
  const pedHtml = (peds.data || []).length ?
    (peds.data || []).map(pc => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="editarPedidoCompra(${pc.id})">
        <div><div style="font-weight:700;font-size:12.5px">${pc.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${pc.fecha ? new Date(pc.fecha).toLocaleDateString('es-ES') : '—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(pc.total)}</div><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--gris-100)">${pc.estado}</span></div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">🛒</div><p>Sin pedidos</p></div>';
  document.getElementById('ficha-prov-pedidos').innerHTML = pedHtml;

  // Albaranes (recepciones)
  const recHtml = (recs.data || []).length ?
    (recs.data || []).map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="editarRecepcion(${r.id})">
        <div><div style="font-weight:700;font-size:12.5px">${r.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}</div></div>
        <div style="text-align:right"><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--gris-100)">${r.estado}</span></div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📥</div><p>Sin albaranes</p></div>';
  document.getElementById('ficha-prov-albaranes').innerHTML = recHtml;

  // Facturas
  const factResumen = [resumenItem('Total facturado', fmtE(totalFact), 'var(--gris-700)')];
  if (pendientePago > 0) factResumen.push(resumenItem('Pendiente pago', fmtE(pendientePago), 'var(--rojo)'));
  const factHtml = (fps.data || []).length ?
    resumenBar(factResumen) +
    (fps.data || []).map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="editarFacturaProv(${f.id})">
        <div><div style="font-weight:700;font-size:12.5px">${f.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—'} · ${f.fecha_vencimiento ? 'Vence: ' + new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : ''}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(f.total)}</div><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${f.estado === 'pagada' ? 'var(--verde-light)' : f.estado === 'pendiente' ? 'var(--amarillo-light)' : 'var(--gris-100)'};color:${f.estado === 'pagada' ? 'var(--verde)' : f.estado === 'pendiente' ? '#92400E' : 'var(--gris-600)'}">${f.estado}</span></div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📑</div><p>Sin facturas</p></div>';
  document.getElementById('ficha-prov-facturas').innerHTML = factHtml;

  // Calendario (pagos pendientes de este proveedor)
  const calHtml = pagosPend.length ?
    resumenBar([resumenItem('Pendiente total', fmtE(pendientePago), 'var(--rojo)')]) +
    pagosPend.map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100)">
        <div><div style="font-weight:700;font-size:12.5px">${f.numero}</div><div style="font-size:10.5px;color:${f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().split('T')[0] ? 'var(--rojo)' : 'var(--gris-400)'}">${f.fecha_vencimiento ? 'Vence: ' + new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : '—'}${f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().split('T')[0] ? ' — VENCIDO' : ''}</div></div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-weight:800;font-size:13px;color:var(--rojo)">${fmtE(f.total)}</div>
          <button onclick="registrarPagoCalendario(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #10B981;background:#D1FAE5;cursor:pointer;font-size:11px;font-weight:700;color:#065F46">💰 Pagar</button>
        </div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">✅</div><h3>Sin pagos pendientes</h3><p>Todas las facturas están pagadas</p></div>';
  document.getElementById('ficha-prov-calendario').innerHTML = calHtml;

  // Notas (por ahora vacío, se puede expandir)
  document.getElementById('ficha-prov-notas').innerHTML = '<div class="empty" style="padding:30px 0"><div class="ei">📝</div><p>Sin notas</p></div>';

  // Activar primera pestaña
  fichaProvTab('pedidos');
}

function fichaProvTab(tab) {
  const tabs = ['pedidos', 'albaranes', 'facturas', 'calendario', 'notas'];
  const icos = { pedidos: '🛒 Pedidos', albaranes: '📥 Albaranes', facturas: '📑 Facturas', calendario: '📅 Pagos pendientes', notas: '📝 Notas' };
  tabs.forEach(t => {
    const el = document.getElementById('ficha-prov-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    const kpi = document.getElementById('fpkpi-' + t);
    if (kpi) {
      kpi.classList.toggle('ficha-prov-kpi-active', t === tab);
      kpi.style.opacity = t === tab ? '1' : '.7';
      kpi.style.boxShadow = t === tab ? '0 0 0 2px var(--azul)' : 'none';
    }
  });
  document.getElementById('fichaProvHistTitulo').textContent = icos[tab] || tab;
}

// Acciones rápidas desde ficha
function nuevoPedidoCompraDesdeProveedor() {
  if (typeof nuevoPedidoCompra === 'function') {
    nuevoPedidoCompra();
    setTimeout(() => {
      const sel = document.getElementById('pc_proveedor');
      if (sel && provActualId) sel.value = provActualId;
    }, 100);
  }
}

function nuevaRecepcionDesdeProveedor() {
  if (typeof nuevaRecepcion === 'function') {
    nuevaRecepcion();
    setTimeout(() => {
      const sel = document.getElementById('rc_proveedor');
      if (sel && provActualId) sel.value = provActualId;
    }, 100);
  }
}

function nuevaFacturaProvDesdeProveedor() {
  if (typeof nuevaFacturaProv === 'function') {
    nuevaFacturaProv();
    setTimeout(() => {
      const sel = document.getElementById('fp_proveedor');
      if (sel && provActualId) {
        sel.value = provActualId;
        fp_aplicarReglaProveedor(provActualId);
      }
    }, 100);
  }
}
