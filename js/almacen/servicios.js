// ═══════════════════════════════════════════════════
// instaloERP · Servicios (compuestos)
// Usa la tabla 'articulos' con tipo='servicio' + tabla 'servicio_lineas'
// ═══════════════════════════════════════════════════

let _srvLineas = [];        // líneas del servicio en edición
let _srvLineasDB = [];      // líneas guardadas en BD (para el servicio abierto)
let _srvLineaCounter = 0;   // counter para IDs temporales
let srvFiltrados = [];       // servicios filtrados para la tabla

// ── Helpers ──
function _getServicios() {
  return (typeof articulos !== 'undefined' ? articulos : []).filter(a => a.tipo === 'servicio');
}

// ── Render listado ──
function renderServicios() {
  const servicios = _getServicios();
  srvFiltrados = servicios;
  updateServiciosKPIs(servicios);
  _renderServiciosTabla(servicios);
}

function updateServiciosKPIs(list) {
  const activos = list.filter(s => s.activo !== false);
  const porHora = list.filter(s => s.unidad_servicio === 'hora');
  // compuestos: se sabrá cuando carguemos líneas, por ahora mostramos count pendiente
  document.getElementById('srv_kpi_total').textContent = list.length;
  document.getElementById('srv_kpi_activos').textContent = activos.length;
  document.getElementById('srv_kpi_por_hora').textContent = porHora.length;
  // Compuestos lo actualizaremos async
  _updateCompuestosKPI();
}

async function _updateCompuestosKPI() {
  if (!EMPRESA) return;
  try {
    const { data } = await sb.from('servicio_lineas')
      .select('servicio_id')
      .eq('empresa_id', EMPRESA.id);
    const uniqueServs = new Set((data || []).map(l => l.servicio_id));
    document.getElementById('srv_kpi_compuestos').textContent = uniqueServs.size;
  } catch(e) {}
}

function _renderServiciosTabla(list) {
  const tbody = document.getElementById('srvTable');
  if (!tbody) return;
  const count = document.getElementById('srvCount');
  if (count) count.textContent = `${list.length} de ${_getServicios().length} servicios`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gris-400)">
      <div style="font-size:36px;margin-bottom:12px">🛠️</div>
      <p style="font-size:13px">No hay servicios. Crea el primero con el botón <strong>+ Nuevo servicio</strong></p>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const tipoLabel = s.unidad_servicio === 'hora'
      ? '<span class="badge bg-blue">⏱️ Por hora</span>'
      : '<span class="badge bg-green">💰 Fijo</span>';
    const iva = tiposIva.find(i => i.id === s.tipo_iva_id);
    return `<tr onclick="editServicio(${s.id})" style="cursor:pointer">
      <td style="font-family:monospace;font-weight:700;font-size:12px;color:var(--azul)">🛠️ ${s.codigo || '—'}</td>
      <td>
        <div style="font-weight:700">${s.nombre}</div>
        ${s.descripcion ? `<div style="font-size:11px;color:var(--gris-400);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.descripcion}</div>` : ''}
      </td>
      <td>${tipoLabel}</td>
      <td style="font-weight:700;color:var(--verde)">${fmtE(s.precio_venta)}${s.unidad_servicio === 'hora' ? '/h' : ''}</td>
      <td id="srv_lineas_count_${s.id}" style="font-size:12px;color:var(--gris-400)">—</td>
      <td>${s.activo !== false ? '<span class="badge bg-green">Sí</span>' : '<span class="badge bg-gray">No</span>'}</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-icon" onclick="event.stopPropagation();editServicio(${s.id})" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-icon" onclick="event.stopPropagation();delServicio(${s.id})" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  // Cargar conteo de líneas async
  _loadLineasCounts(list);
}

async function _loadLineasCounts(list) {
  if (!EMPRESA) return;
  try {
    const { data } = await sb.from('servicio_lineas')
      .select('servicio_id')
      .eq('empresa_id', EMPRESA.id);
    const counts = {};
    (data || []).forEach(l => { counts[l.servicio_id] = (counts[l.servicio_id] || 0) + 1; });
    list.forEach(s => {
      const el = document.getElementById(`srv_lineas_count_${s.id}`);
      if (el) {
        const c = counts[s.id] || 0;
        el.textContent = c > 0 ? `${c} línea${c > 1 ? 's' : ''}` : 'Simple';
        if (c > 0) el.style.color = 'var(--azul)';
      }
    });
  } catch(e) {}
}

// ── Filtrar ──
function filtrarServicios() {
  const q = (document.getElementById('srvBuscar')?.value || '').toLowerCase();
  const tipo = document.getElementById('selSrvTipo')?.value || '';
  let list = _getServicios();
  if (q) list = list.filter(s => (s.nombre||'').toLowerCase().includes(q) || (s.codigo||'').toLowerCase().includes(q));
  if (tipo) list = list.filter(s => s.unidad_servicio === tipo);
  srvFiltrados = list;
  _renderServiciosTabla(list);
}

// ── Nuevo servicio ──
function nuevoServicio() {
  document.getElementById('srv_id').value = '';
  document.getElementById('srv_codigo').value = _generarCodigoServicio();
  document.getElementById('srv_nombre').value = '';
  document.getElementById('srv_desc').value = '';
  document.getElementById('srv_pvp').value = '';
  document.getElementById('srv_unidad_servicio').value = 'ud';
  document.getElementById('srv_activo').checked = true;
  document.getElementById('srv_titulo').textContent = 'Nuevo servicio';
  document.getElementById('srv_codigo_label').textContent = '';
  srvTipoPrecioChange();

  // IVA
  const selIva = document.getElementById('srv_iva');
  selIva.innerHTML = tiposIva.map(i => `<option value="${i.id}" ${i.porcentaje === 21 ? 'selected' : ''}>${i.nombre} (${i.porcentaje}%)</option>`).join('');

  // Limpiar líneas
  _srvLineas = [];
  _srvLineasDB = [];
  _srvLineaCounter = 0;
  _renderSrvLineas();

  openModal('mServicio');
}

function _generarCodigoServicio() {
  const servicios = _getServicios();
  let max = 0;
  servicios.forEach(s => {
    const m = (s.codigo || '').match(/^SRV-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return `SRV-${String(max + 1).padStart(3, '0')}`;
}

function srvTipoPrecioChange() {
  const tipo = document.getElementById('srv_unidad_servicio').value;
  document.getElementById('srv_pvp_label').textContent = tipo === 'hora' ? 'PVP (€/hora)' : 'PVP (€)';
}

// ── Editar servicio ──
async function editServicio(id) {
  const s = articulos.find(a => a.id === id);
  if (!s) return;

  document.getElementById('srv_id').value = s.id;
  document.getElementById('srv_codigo').value = s.codigo || '';
  document.getElementById('srv_nombre').value = s.nombre || '';
  document.getElementById('srv_desc').value = s.descripcion || '';
  document.getElementById('srv_pvp').value = s.precio_venta || '';
  document.getElementById('srv_unidad_servicio').value = s.unidad_servicio || 'ud';
  document.getElementById('srv_activo').checked = s.activo !== false;
  document.getElementById('srv_titulo').textContent = s.nombre || 'Editar servicio';
  document.getElementById('srv_codigo_label').textContent = s.codigo || '';
  srvTipoPrecioChange();

  // IVA
  const selIva = document.getElementById('srv_iva');
  selIva.innerHTML = tiposIva.map(i => `<option value="${i.id}" ${i.id === s.tipo_iva_id ? 'selected' : ''}>${i.nombre} (${i.porcentaje}%)</option>`).join('');

  // Cargar líneas
  _srvLineaCounter = 0;
  const { data: lineas } = await sb.from('servicio_lineas')
    .select('*, articulos:articulo_id(id,codigo,nombre,precio_venta)')
    .eq('servicio_id', id)
    .eq('empresa_id', EMPRESA.id)
    .order('orden');
  _srvLineasDB = lineas || [];
  _srvLineas = _srvLineasDB.map(l => ({
    _tempId: ++_srvLineaCounter,
    dbId: l.id,
    articulo_id: l.articulo_id,
    articulo_nombre: l.articulos?.nombre || l.descripcion || '',
    articulo_codigo: l.articulos?.codigo || '',
    descripcion: l.descripcion || '',
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario || l.articulos?.precio_venta || 0
  }));
  _renderSrvLineas();

  openModal('mServicio');
}

// ── Líneas compuestas: render ──
function _renderSrvLineas() {
  const container = document.getElementById('srv_lineas_container');
  if (!container) return;

  if (_srvLineas.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--gris-300);font-size:12px">
      Sin líneas — servicio simple. Pulsa <strong>+ Añadir línea</strong> para componer.
    </div>`;
    document.getElementById('srv_lineas_total').textContent = '';
    return;
  }

  container.innerHTML = _srvLineas.map((l, idx) => {
    const fotoThumb = l.articulo_id
      ? (articulos.find(a=>a.id===l.articulo_id)?.foto_url
        ? `<img src="${articulos.find(a=>a.id===l.articulo_id).foto_url}" style="width:30px;height:30px;object-fit:cover;border-radius:6px">`
        : `<span style="width:30px;height:30px;border-radius:6px;background:var(--gris-200);display:inline-flex;align-items:center;justify-content:center;font-size:14px">📦</span>`)
      : `<span style="width:30px;height:30px;border-radius:6px;background:var(--azul-light);display:inline-flex;align-items:center;justify-content:center;font-size:14px">✏️</span>`;
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:4px;background:#fff;border-radius:8px;border:1px solid var(--gris-100);font-size:12px" data-temp-id="${l._tempId}">
      <div style="flex:2;min-width:0;display:flex;align-items:center;gap:8px;position:relative">
        ${fotoThumb}
        <div style="flex:1;min-width:0">
          <input type="text" value="${_escHtml(l.articulo_nombre || l.descripcion)}" placeholder="Buscar artículo o escribir concepto..."
            style="width:100%;border:1px solid var(--gris-200);border-radius:6px;padding:6px 8px;font-size:12px;font-family:var(--font);outline:none"
            oninput="srvLineaBuscar(this,${l._tempId})" onfocus="srvLineaBuscar(this,${l._tempId})"
            id="srv_linea_nombre_${l._tempId}">
          <div id="srv_linea_ac_${l._tempId}" style="display:none;position:absolute;top:100%;left:0;z-index:999;background:#fff;border:1px solid var(--gris-200);border-radius:8px;max-height:200px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.15);font-size:12px;width:320px;margin-top:4px"></div>
        </div>
      </div>
      <div style="width:70px"><input type="number" value="${l.cantidad}" min="0.01" step="0.01" style="width:100%;border:1px solid var(--gris-200);border-radius:6px;padding:6px 4px;font-size:12px;text-align:center;font-family:var(--font);outline:none" onchange="srvLineaCant(${l._tempId},this.value)"></div>
      <div style="width:90px"><input type="number" value="${l.precio_unitario}" step="0.01" style="width:100%;border:1px solid var(--gris-200);border-radius:6px;padding:6px 4px;font-size:12px;text-align:right;font-family:var(--font);outline:none" onchange="srvLineaPrecio(${l._tempId},this.value)"></div>
      <div style="width:70px;text-align:right;font-weight:800;font-size:12px;color:var(--verde)">${fmtE(l.cantidad * l.precio_unitario)}</div>
      <button onclick="srvDelLinea(${l._tempId})" style="width:28px;height:28px;border:none;background:var(--rojo-light);color:var(--rojo);border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0" title="Quitar">✕</button>
    </div>`;
  }).join('');

  const total = _srvLineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
  document.getElementById('srv_lineas_total').textContent = total > 0 ? `Total composición: ${fmtE(total)}` : '';
}

function _escHtml(s) { return (s||'').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ── Líneas: CRUD ──
function srvAddLinea() {
  _srvLineas.push({
    _tempId: ++_srvLineaCounter,
    dbId: null,
    articulo_id: null,
    articulo_nombre: '',
    articulo_codigo: '',
    descripcion: '',
    cantidad: 1,
    precio_unitario: 0
  });
  _renderSrvLineas();
  // Foco en el nuevo input
  setTimeout(() => {
    const inp = document.getElementById(`srv_linea_nombre_${_srvLineaCounter}`);
    if (inp) inp.focus();
  }, 50);
}

function srvDelLinea(tempId) {
  _srvLineas = _srvLineas.filter(l => l._tempId !== tempId);
  _renderSrvLineas();
}

function srvLineaCant(tempId, val) {
  const l = _srvLineas.find(x => x._tempId === tempId);
  if (l) { l.cantidad = parseFloat(val) || 0; _renderSrvLineas(); }
}

function srvLineaPrecio(tempId, val) {
  const l = _srvLineas.find(x => x._tempId === tempId);
  if (l) { l.precio_unitario = parseFloat(val) || 0; _renderSrvLineas(); }
}

// ── Líneas: autocomplete artículo ──
function srvLineaBuscar(input, tempId) {
  const q = (input.value || '').trim().toLowerCase();
  const acEl = document.getElementById(`srv_linea_ac_${tempId}`);
  if (!acEl) return;

  if (q.length < 1) { acEl.style.display = 'none'; return; }

  const matches = articulos.filter(a =>
    a.tipo !== 'servicio' &&
    ((a.nombre||'').toLowerCase().includes(q) || (a.codigo||'').toLowerCase().includes(q))
  ).slice(0, 6);

  if (matches.length === 0) {
    acEl.style.display = 'none';
    // Guardar como descripción libre
    const l = _srvLineas.find(x => x._tempId === tempId);
    if (l) { l.articulo_id = null; l.descripcion = input.value; l.articulo_nombre = input.value; }
    return;
  }

  acEl.innerHTML = matches.map(a => `
    <div style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--gris-50);display:flex;align-items:center;gap:8px"
      onmousedown="srvLineaSelectArt(${tempId},${a.id},'${_escHtml(a.nombre)}','${_escHtml(a.codigo)}',${a.precio_venta||0})">
      ${a.foto_url ? `<img src="${a.foto_url}" style="width:28px;height:28px;object-fit:cover;border-radius:4px">` : '<span style="font-size:16px">📦</span>'}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.nombre}</div>
        <div style="font-size:10px;color:var(--gris-400)">${a.codigo} · ${fmtE(a.precio_venta)}</div>
      </div>
    </div>
  `).join('');
  // Abrir hacia arriba si no hay espacio abajo
  acEl.style.top = '';
  acEl.style.bottom = '';
  acEl.style.display = 'block';
  const rect = acEl.getBoundingClientRect();
  const modalBody = acEl.closest('.modal-b');
  if (modalBody) {
    const modalRect = modalBody.getBoundingClientRect();
    if (rect.bottom > modalRect.bottom) {
      acEl.style.top = 'auto';
      acEl.style.bottom = '100%';
      acEl.style.marginTop = '0';
      acEl.style.marginBottom = '4px';
    }
  }
}

function srvLineaSelectArt(tempId, artId, nombre, codigo, precio) {
  const l = _srvLineas.find(x => x._tempId === tempId);
  if (!l) return;
  l.articulo_id = artId;
  l.articulo_nombre = nombre;
  l.articulo_codigo = codigo;
  l.precio_unitario = precio;
  l.descripcion = '';
  const acEl = document.getElementById(`srv_linea_ac_${tempId}`);
  if (acEl) acEl.style.display = 'none';
  _renderSrvLineas();
}

// Cerrar autocomplete al hacer click fuera
document.addEventListener('click', e => {
  if (!e.target.closest('[id^="srv_linea_ac_"]') && !e.target.closest('[id^="srv_linea_nombre_"]')) {
    document.querySelectorAll('[id^="srv_linea_ac_"]').forEach(el => el.style.display = 'none');
  }
});

// ── Guardar servicio ──
async function saveServicio() {
  const codigo = document.getElementById('srv_codigo').value.trim();
  const nombre = document.getElementById('srv_nombre').value.trim();
  if (!codigo || !nombre) { toast('Código y nombre son obligatorios', 'error'); return; }

  const id = document.getElementById('srv_id').value;

  const obj = {
    empresa_id: EMPRESA.id,
    codigo, nombre,
    tipo: 'servicio',
    descripcion: document.getElementById('srv_desc').value.trim() || null,
    tipo_iva_id: parseInt(document.getElementById('srv_iva').value) || null,
    unidad_servicio: document.getElementById('srv_unidad_servicio').value || 'ud',
    precio_venta: parseFloat(document.getElementById('srv_pvp').value) || 0,
    activo: document.getElementById('srv_activo').checked
  };

  showLoading('Guardando servicio...');
  try {
    let savedId;
    if (id) {
      const { error } = await sb.from('articulos').update(obj).eq('id', id);
      if (error) throw error;
      savedId = parseInt(id);
    } else {
      const { data, error } = await sb.from('articulos').insert(obj).select('id').single();
      if (error) throw error;
      savedId = data.id;
    }

    // Guardar líneas
    await _saveServicioLineas(savedId);

    closeModal('mServicio');
    toast('Servicio guardado ✓', 'success');

    // Refrescar
    const { data: fresh } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
    if (fresh) articulos = fresh;
    renderServicios();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

async function _saveServicioLineas(servicioId) {
  // Borrar líneas viejas que ya no existen
  const oldIds = _srvLineasDB.map(l => l.id);
  const keepIds = _srvLineas.filter(l => l.dbId).map(l => l.dbId);
  const toDelete = oldIds.filter(id => !keepIds.includes(id));

  if (toDelete.length > 0) {
    await sb.from('servicio_lineas').delete().in('id', toDelete);
  }

  // Upsert líneas
  for (let i = 0; i < _srvLineas.length; i++) {
    const l = _srvLineas[i];
    const row = {
      empresa_id: EMPRESA.id,
      servicio_id: servicioId,
      articulo_id: l.articulo_id || null,
      descripcion: l.articulo_id ? null : (l.descripcion || l.articulo_nombre || null),
      cantidad: l.cantidad || 1,
      precio_unitario: l.precio_unitario || 0,
      orden: i
    };
    if (l.dbId) {
      await sb.from('servicio_lineas').update(row).eq('id', l.dbId);
    } else {
      await sb.from('servicio_lineas').insert(row);
    }
  }
}

// ── Eliminar servicio ──
async function delServicio(id) {
  if (!confirm('¿Eliminar este servicio?')) return;
  showLoading('Eliminando...');
  try {
    await sb.from('servicio_lineas').delete().eq('servicio_id', id);
    await sb.from('articulos').delete().eq('id', id);
    toast('Servicio eliminado', 'success');
    const { data } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
    if (data) articulos = data;
    renderServicios();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

// ── Exportar Excel ──
async function exportarServiciosExcel() {
  const servicios = _getServicios();
  if (servicios.length === 0) { toast('No hay servicios para exportar', 'error'); return; }

  showLoading('Exportando servicios...');
  try {
    const rows = [];
    for (const s of servicios) {
      const iva = tiposIva.find(i => i.id === s.tipo_iva_id);
      // Cargar líneas
      const { data: lineas } = await sb.from('servicio_lineas')
        .select('*, articulos:articulo_id(nombre,codigo)')
        .eq('servicio_id', s.id)
        .order('orden');

      const lineasStr = (lineas || []).map(l =>
        `${l.articulos?.nombre || l.descripcion || '?'} x${l.cantidad} @${l.precio_unitario}`
      ).join(' | ');

      rows.push({
        'Código': s.codigo || '',
        'Nombre': s.nombre || '',
        'Tipo': s.unidad_servicio === 'hora' ? 'hora' : 'ud',
        'PVP': s.precio_venta || 0,
        'IVA %': iva?.porcentaje ?? 21,
        'Descripción': s.descripcion || '',
        'Activo': s.activo !== false ? 'Sí' : 'No',
        'Líneas': lineasStr
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Servicios');
    XLSX.writeFile(wb, `Servicios_${EMPRESA.nombre || 'export'}.xlsx`);
    toast('Excel descargado ✓', 'success');
  } catch(e) {
    toast('Error exportando: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

// ── Importar Excel ──
async function importarServiciosExcel() {
  const fileInput = document.getElementById('srvImportFile');
  if (!fileInput?.files?.length) { toast('Selecciona un archivo Excel', 'error'); return; }

  const file = fileInput.files[0];
  const progEl = document.getElementById('srvImportProgress');
  const barEl = document.getElementById('srvImportBar');
  const statusEl = document.getElementById('srvImportStatus');
  const btn = document.getElementById('btnImportSrv');

  progEl.style.display = 'block';
  btn.disabled = true;

  try {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    if (rows.length === 0) { toast('El Excel está vacío', 'error'); return; }

    // Mapa de servicios existentes por código
    const existentes = {};
    _getServicios().forEach(s => { existentes[(s.codigo||'').toUpperCase()] = s; });

    let creados = 0, actualizados = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const codigo = String(r['Código'] || r['codigo'] || r['CÓDIGO'] || '').trim();
      if (!codigo) continue;

      const nombre = String(r['Nombre'] || r['nombre'] || r['NOMBRE'] || '').trim();
      if (!nombre) continue;

      const tipoRaw = String(r['Tipo'] || r['tipo'] || r['TIPO'] || 'ud').trim().toLowerCase();
      const unidad = tipoRaw === 'hora' || tipoRaw === 'h' ? 'hora' : 'ud';
      const pvp = parseFloat(r['PVP'] || r['pvp'] || r['Pvp'] || 0) || 0;
      const desc = String(r['Descripción'] || r['descripcion'] || r['DESCRIPCION'] || '').trim();
      const ivaVal = parseFloat(r['IVA %'] || r['IVA'] || r['iva'] || 21) || 21;
      const ivaObj = tiposIva.find(i => i.porcentaje === ivaVal) || tiposIva.find(i => i.porcentaje === 21);

      const obj = {
        empresa_id: EMPRESA.id,
        codigo, nombre,
        tipo: 'servicio',
        descripcion: desc || null,
        unidad_servicio: unidad,
        precio_venta: pvp,
        tipo_iva_id: ivaObj?.id || null,
        activo: true
      };

      const existing = existentes[codigo.toUpperCase()];
      if (existing) {
        await sb.from('articulos').update(obj).eq('id', existing.id);
        actualizados++;
      } else {
        await sb.from('articulos').insert(obj);
        creados++;
      }

      const pct = Math.round(((i + 1) / rows.length) * 100);
      barEl.style.width = pct + '%';
      statusEl.textContent = `${i + 1} de ${rows.length} — ${creados} nuevos, ${actualizados} actualizados`;
      await new Promise(r => setTimeout(r, 30));
    }

    toast(`✅ Importación: ${creados} nuevos, ${actualizados} actualizados`, 'success');
    closeModal('mImportarServicios');

    const { data } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
    if (data) articulos = data;
    renderServicios();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    progEl.style.display = 'none';
    barEl.style.width = '0%';
  }
}

// ── Init: mostrar nombre archivo al seleccionar ──
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('srvImportFile');
  if (inp) inp.addEventListener('change', () => {
    const fn = document.getElementById('srvImportFileName');
    if (fn) fn.textContent = inp.files[0]?.name || '';
  });
});
