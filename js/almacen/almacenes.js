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
      <div style="display:flex;gap:7px;margin-top:12px;border-top:1px solid var(--gris-100);padding-top:10px">
        <button class="btn btn-secondary btn-sm" onclick="editAlmacen(${a.id})">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="goPage('stock')" style="font-size:11px">📊 Ver stock</button>
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
  if (!confirm(`¿Eliminar "${a?.nombre}"?\n\nEsto no se puede deshacer.`)) return;
  const { error } = await sb.from('almacenes').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  closeModal('mAlmacen');
  const { data } = await sb.from('almacenes').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  almacenes = data || [];
  renderAlmacenes();
  toast('Almacén eliminado', 'success');
}
