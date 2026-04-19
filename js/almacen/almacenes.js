// ═══════════════════════════════════════════════
// Warehouse management - Almacenes
// ═══════════════════════════════════════════════

function renderAlmacenes() {
  const tipoIco = { central:'🏭', furgoneta:'🚐', externo:'🏗️' };
  const tipoLabel = { central:'Central', furgoneta:'Furgoneta', externo:'Externo' };

  if (!almacenes.length) {
    document.getElementById('almGrid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="ei">🏭</div><h3>Sin almacenes</h3><p>Crea tu primer almacén o furgoneta</p></div>';
    return;
  }

  // Contar stock por almacén
  const stockCount = {};
  if (typeof stockData !== 'undefined' && stockData) {
    stockData.forEach(s => {
      if (!stockCount[s.almacen_id]) stockCount[s.almacen_id] = { refs: 0, bajos: 0 };
      stockCount[s.almacen_id].refs++;
      if (s.stock_minimo && s.cantidad <= s.stock_minimo) stockCount[s.almacen_id].bajos++;
    });
  }

  document.getElementById('almGrid').innerHTML = almacenes.map(a => {
    const ico = tipoIco[a.tipo] || '📦';
    const label = tipoLabel[a.tipo] || a.tipo;
    const sc = stockCount[a.id] || { refs: 0, bajos: 0 };
    const operario = a.operario_nombre ? `<div style="font-size:11px;color:var(--azul);margin-top:4px">👤 ${a.operario_nombre}</div>` : '';
    const matricula = a.matricula ? `<div style="font-size:11px;color:var(--gris-400)">🚗 ${a.matricula}</div>` : '';
    const stockInfo = sc.refs > 0
      ? `<div style="margin-top:8px;padding:8px;background:var(--gris-50);border-radius:6px;display:flex;gap:12px">
          <span style="font-size:11px"><strong>${sc.refs}</strong> refs</span>
          ${sc.bajos > 0 ? `<span style="font-size:11px;color:var(--rojo)">⚠️ ${sc.bajos} bajo mín.</span>` : `<span style="font-size:11px;color:var(--verde)">✓ Stock OK</span>`}
        </div>`
      : '';

    return `<div class="card" style="padding:17px;border-left:4px solid ${a.activo!==false?'var(--azul)':'var(--gris-200)'}">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:8px">
        <div style="font-size:28px">${ico}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:800">${a.nombre}</div>
          <div style="font-size:11px;color:var(--gris-400)">${label}</div>
        </div>
        <span class="badge ${a.activo!==false?'bg-green':'bg-gray'}">${a.activo!==false?'Activo':'Inactivo'}</span>
      </div>
      ${operario}
      ${matricula}
      ${a.direccion ? `<div style="font-size:11px;color:var(--gris-400);margin-top:2px">📍 ${a.direccion}</div>` : ''}
      ${stockInfo}
      <div style="display:flex;gap:7px;margin-top:12px;border-top:1px solid var(--gris-100);padding-top:10px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="editAlmacen(${a.id})">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="verStockAlmacen(${a.id})" style="font-size:11px">📊 Ver stock</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirCargaStock(${a.id})" style="font-size:11px;color:var(--verde)">+ Añadir artículo</button>
      </div>
    </div>`;
  }).join('');
}

function _cargarOperariosAlmacen(selectedId) {
  const sel = document.getElementById('alm_operario');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>';
  const users = typeof todosUsuarios !== 'undefined' ? todosUsuarios : [];
  users.filter(u => u.activo !== false).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.nombre || u.email;
    if (u.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function _toggleCamposFurgoneta() {
  const tipo = document.getElementById('alm_tipo').value;
  const esFurgo = (tipo === 'furgoneta');
  document.getElementById('alm_row_furgoneta').style.display = esFurgo ? '' : 'none';
}

function nuevoAlmacen() {
  document.getElementById('alm_id').value = '';
  setVal({ alm_nombre:'', alm_matricula:'', alm_dir:'', alm_notas:'' });
  document.getElementById('alm_tipo').value = 'central';
  document.getElementById('alm_activo').checked = true;
  _cargarOperariosAlmacen('');
  _toggleCamposFurgoneta();
  document.getElementById('mAlmTit').textContent = 'Nuevo Almacén';
  document.getElementById('alm_btn_delete').style.display = 'none';
  openModal('mAlmacen');
}

function editAlmacen(id) {
  const a = almacenes.find(x => x.id === id);
  if (!a) return;
  document.getElementById('alm_id').value = a.id;
  setVal({
    alm_nombre: a.nombre || '',
    alm_matricula: a.matricula || '',
    alm_dir: a.direccion || '',
    alm_notas: a.observaciones || ''
  });
  document.getElementById('alm_tipo').value = a.tipo || 'central';
  document.getElementById('alm_activo').checked = a.activo !== false;
  _cargarOperariosAlmacen(a.operario_id || '');
  _toggleCamposFurgoneta();
  document.getElementById('mAlmTit').textContent = 'Editar Almacén';
  document.getElementById('alm_btn_delete').style.display = '';
  openModal('mAlmacen', true);
}

async function saveAlmacen() {
  const nombre = document.getElementById('alm_nombre').value.trim();
  if (!nombre) { toast('Introduce el nombre', 'error'); return; }
  const id = document.getElementById('alm_id').value;
  const tipo = document.getElementById('alm_tipo').value;
  const operarioSel = document.getElementById('alm_operario');
  const operarioId = operarioSel?.value || null;
  const operarioNombre = operarioId ? operarioSel.options[operarioSel.selectedIndex]?.textContent : null;

  const obj = {
    empresa_id: EMPRESA.id,
    nombre,
    tipo,
    matricula: v('alm_matricula') || null,
    direccion: v('alm_dir') || null,
    activo: document.getElementById('alm_activo').checked,
    operario_id: operarioId || null,
    operario_nombre: operarioNombre || null,
    observaciones: v('alm_notas') || null
  };

  if (id) {
    const { error } = await sb.from('almacenes').update(obj).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { error } = await sb.from('almacenes').insert(obj);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  }

  closeModal('mAlmacen');
  const { data } = await sb.from('almacenes').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  almacenes = data || [];
  renderAlmacenes();
  toast('Almacén guardado ✓', 'success');
}

async function deleteAlmacen() {
  const id = document.getElementById('alm_id').value;
  if (!id) return;
  const a = almacenes.find(x => x.id == id);
  const ok = await confirmModal({titulo:'Eliminar almacén',mensaje:`¿Eliminar "${a?.nombre}"?`,aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!ok) return;
  const { error } = await sb.from('almacenes').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  closeModal('mAlmacen');
  const { data } = await sb.from('almacenes').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  almacenes = data || [];
  renderAlmacenes();
  toast('Almacén eliminado', 'success');
}

// Ver stock filtrado por almacén
function verStockAlmacen(almacenId) {
  goPage('stock');
  setTimeout(() => {
    const sel = document.getElementById('filter-almacen');
    if (sel) { sel.value = almacenId; filtrarStock(); }
  }, 300);
}

// ═══════════════════════════════════════════════
// Cargar stock a un almacén (añadir artículos)
// ═══════════════════════════════════════════════
let _cargaAlmacenId = null;

function abrirCargaStock(almacenId) {
  _cargaAlmacenId = almacenId;
  const a = almacenes.find(x => x.id === almacenId);
  document.getElementById('carga-alm-nombre').textContent = a?.nombre || 'Almacén';
  document.getElementById('carga-articulo-search').value = '';
  document.getElementById('carga-articulo-id').value = '';
  document.getElementById('carga-articulo-info').innerHTML = '';
  document.getElementById('carga-cantidad').value = '';
  document.getElementById('carga-minimo').value = '';
  document.getElementById('carga-dropdown').style.display = 'none';
  openModal('modal-carga-stock');
}

function buscarArticuloCarga() {
  const q = (document.getElementById('carga-articulo-search')?.value || '').toLowerCase();
  const dd = document.getElementById('carga-dropdown');
  if (!q || q.length < 2) { dd.style.display = 'none'; return; }

  const results = (typeof articulos !== 'undefined' ? articulos : [])
    .filter(a => (a.nombre||'').toLowerCase().includes(q) || (a.codigo||'').toLowerCase().includes(q))
    .slice(0, 10);

  if (!results.length) { dd.style.display = 'none'; return; }

  dd.style.display = 'block';
  dd.innerHTML = results.map(a =>
    `<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--gris-100);font-size:13px" onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background=''" onclick="seleccionarArticuloCarga(${a.id})">
      <strong>${a.nombre}</strong> <span style="color:var(--gris-400);font-size:11px">${a.codigo || ''}</span>
      ${a.unidad_medida ? `<span style="color:var(--gris-400);font-size:11px;margin-left:8px">(${a.unidad_medida})</span>` : ''}
    </div>`
  ).join('');
}

function seleccionarArticuloCarga(artId) {
  const a = articulos.find(x => x.id === artId);
  if (!a) return;
  document.getElementById('carga-articulo-id').value = artId;
  document.getElementById('carga-articulo-search').value = a.nombre;
  document.getElementById('carga-dropdown').style.display = 'none';
  document.getElementById('carga-articulo-info').innerHTML = `
    <div style="padding:8px;background:var(--gris-50);border-radius:6px;font-size:12px;margin-top:6px">
      <strong>${a.nombre}</strong> — ${a.codigo || 'Sin código'}
      ${a.unidad_medida ? ` · ${a.unidad_medida}` : ''}
      ${a.costo ? ` · Coste: ${fmtE(a.costo)}` : ''}
    </div>`;
}

async function guardarCargaStock() {
  const articuloId = parseInt(document.getElementById('carga-articulo-id').value);
  const cantidad = parseFloat(document.getElementById('carga-cantidad').value) || 0;
  const minimo = parseFloat(document.getElementById('carga-minimo').value) || 0;

  if (!articuloId) { toast('Selecciona un artículo', 'warning'); return; }
  if (cantidad <= 0) { toast('Introduce una cantidad', 'warning'); return; }

  try {
    // Check si ya existe stock de este artículo en este almacén
    const { data: existing } = await sb.from('stock')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .eq('articulo_id', articuloId)
      .eq('almacen_id', _cargaAlmacenId)
      .maybeSingle();

    if (existing) {
      // Actualizar cantidad
      const newCant = (existing.cantidad || 0) + cantidad;
      const { error } = await sb.from('stock').update({
        cantidad: newCant,
        stock_minimo: minimo || existing.stock_minimo || 0,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
      if (error) throw error;
    } else {
      // Insertar nuevo
      const { error } = await sb.from('stock').insert({
        empresa_id: EMPRESA.id,
        articulo_id: articuloId,
        almacen_id: _cargaAlmacenId,
        cantidad: cantidad,
        stock_minimo: minimo,
        stock_provisional: 0,
        stock_reservado: 0,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
    }

    // Registrar movimiento
    const art = articulos.find(a => a.id === articuloId);
    await sb.from('movimientos_stock').insert({
      empresa_id: EMPRESA.id,
      articulo_id: articuloId,
      almacen_id: _cargaAlmacenId,
      tipo: 'carga_inicial',
      cantidad: cantidad,
      delta: cantidad,
      notas: 'Carga inicial de stock',
      fecha: new Date().toISOString().slice(0,10),
      usuario_id: CU.id,
      usuario_nombre: CP?.nombre || CU.email
    });

    closeModal('modal-carga-stock');
    toast(`${art?.nombre}: +${cantidad} unidades ✓`, 'success');

    // Recargar stock data y re-renderizar almacenes
    if (typeof loadStock === 'function') loadStock();
    const { data } = await sb.from('stock').select('*').eq('empresa_id', EMPRESA.id);
    if (typeof stockData !== 'undefined') stockData = data || [];
    renderAlmacenes();
  } catch (e) {
    console.error('Error cargando stock:', e);
    toast('Error: ' + e.message, 'error');
  }
}
