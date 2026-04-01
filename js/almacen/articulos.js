// ═══════════════════════════════════════════════
// MÓDULO ARTÍCULOS - Ficha completa, multi-proveedor, historial, foto
// ═══════════════════════════════════════════════

let artFiltrados = [];
let _artKpiFilter = ''; // KPI filter activo
let artProveedores = [];  // proveedores del artículo abierto
let artHistorial = [];    // historial del artículo abierto
let artFotoFile = null;   // archivo foto pendiente de subir

// ─── PESTAÑAS ─────────────────────────────────
function artTab(tab, el) {
  document.querySelectorAll('.art-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.art-panel').forEach(p => p.style.display = 'none');
  el.classList.add('active');
  document.getElementById('artPanel_' + tab).style.display = '';
}

// ─── RENDERIZAR LISTADO ───────────────────────
function renderArticulos(list) {
  artFiltrados = list;
  document.getElementById('artCount').textContent = `${list.length} de ${articulos.length} artículos`;

  // Populate filtro familias (solo padres)
  const sf = document.getElementById('selFamFiltro');
  if (sf) {
    const famVal = sf.value;
    const padres = familias.filter(f => !f.parent_id);
    sf.innerHTML = '<option value="">Todas las familias</option>' + padres.map(f => {
      const nHijos = familias.filter(h => h.parent_id === f.id).length;
      return `<option value="${f.id}">${f.nombre}${nHijos ? ' (' + nHijos + ')' : ''}</option>`;
    }).join('');
    sf.value = famVal;
    actualizarFiltroSubfamilias();
  }

  const tbody = document.getElementById('artTable');
  tbody.innerHTML = list.length ?
    list.map(a => {
      const fam = familias.find(f => f.id === a.familia_id);
      const famPadre = fam && fam.parent_id ? familias.find(f => f.id === fam.parent_id) : null;
      const famLabel = famPadre ? `${famPadre.nombre} <span style="color:var(--gris-300)">›</span> ${fam.nombre}` : (fam?.nombre || '—');
      const iva = tiposIva.find(i => i.id === a.tipo_iva_id);
      const margen = a.precio_coste > 0 ? (((a.precio_venta - a.precio_coste) / a.precio_coste) * 100).toFixed(1) : '—';
      const margenColor = margen === '—' ? 'var(--gris-400)' : parseFloat(margen) >= 30 ? 'var(--verde)' : parseFloat(margen) >= 15 ? 'var(--amarillo)' : 'var(--rojo)';
      const fotoMini = a.foto_url ? `<img src="${a.foto_url}" style="width:28px;height:28px;border-radius:5px;object-fit:cover">` : '';

      return `<tr style="cursor:pointer" ondblclick="editArticulo('${a.id}')">
        <td style="font-family:monospace;font-weight:700;font-size:12px;color:var(--azul)">${fotoMini} ${a.codigo || '—'}</td>
        <td>
          <div style="font-weight:700">${a.nombre}</div>
          ${a.descripcion ? `<div style="font-size:11px;color:var(--gris-400);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.descripcion}</div>` : ''}
          ${a.es_activo ? '<span class="badge bg-yellow" style="font-size:9.5px">Activo/Maquinaria</span>' : ''}
        </td>
        <td>${famLabel}</td>
        <td style="font-weight:600">${fmtE(a.precio_coste)}</td>
        <td style="font-weight:700;color:var(--verde)">${fmtE(a.precio_venta)}</td>
        <td style="font-weight:700;color:${margenColor}">${margen === '—' ? '—' : margen + '%'}</td>
        <td>${iva ? iva.porcentaje + '%' : '—'}</td>
        <td>${a.activo !== false ? '<span class="badge bg-green">Sí</span>' : '<span class="badge bg-gray">No</span>'}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editArticulo('${a.id}')" title="Abrir ficha">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();duplicarArticulo('${a.id}')" title="Duplicar">📋</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delArticulo('${a.id}')" title="Eliminar">🗑️</button>
        </div></td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="9"><div class="empty"><div class="ei">📦</div><h3>Sin artículos</h3><p>Añade tu catálogo de artículos o importa desde Excel</p></div></td></tr>';

  updateArticulosKPIs();
}

// ─── KPIs ──────────────────────────────────────
function updateArticulosKPIs() {
  const activos = articulos.filter(a => a.activo !== false);
  const inactivos = articulos.filter(a => a.activo === false);
  const famsUsadas = new Set(articulos.map(a => a.familia_id).filter(Boolean));
  const valorPVP = activos.reduce((sum, a) => sum + (a.precio_venta || 0), 0);
  // Bajo stock: artículos con stock_minimo > 0 y sin stock suficiente (necesita datos de stock real, por ahora solo cuenta los que tienen stock_minimo > 0)
  const bajoStock = articulos.filter(a => (a.stock_minimo || 0) > 0 && a.activo !== false);

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('art_kpi_total', articulos.length);
  el('art_kpi_activos', activos.length);
  el('art_kpi_inactivos', inactivos.length);
  el('art_kpi_bajo_stock', bajoStock.length);
  el('art_kpi_familias', famsUsadas.size);
  el('art_kpi_valor', fmtE(valorPVP));

  // Highlight KPI activo
  document.querySelectorAll('.art-kpi-filter').forEach(el => {
    el.style.outline = el.dataset.filtro === _artKpiFilter ? '3px solid var(--azul)' : 'none';
    el.style.outlineOffset = '2px';
  });
}

// ─── Filtro por KPI clickable ─────────────────
function filtrarArtKpi(tipo) {
  _artKpiFilter = _artKpiFilter === tipo ? '' : tipo; // toggle
  // Sincronizar con select activo
  const sel = document.getElementById('selActivoFiltro');
  if (sel) {
    if (tipo === 'activos') sel.value = '1';
    else if (tipo === 'inactivos') sel.value = '0';
    else sel.value = '';
  }
  filtrarArticulos();
}

// ─── Actualizar subfamilias en filtro ─────────
function actualizarFiltroSubfamilias() {
  const famId = document.getElementById('selFamFiltro')?.value;
  const ssf = document.getElementById('selSubFamFiltro');
  if (!ssf) return;
  if (!famId) {
    ssf.style.display = 'none';
    ssf.value = '';
    return;
  }
  const hijos = familias.filter(f => String(f.parent_id) === String(famId));
  if (hijos.length === 0) {
    ssf.style.display = 'none';
    ssf.value = '';
    return;
  }
  const prev = ssf.value;
  ssf.innerHTML = '<option value="">Todas las subfamilias</option>' + hijos.map(h => `<option value="${h.id}">${h.nombre}</option>`).join('');
  ssf.value = prev;
  ssf.style.display = '';
}

// ─── Wildcard search helper ───────────────────
function wildcardMatch(text, pattern) {
  if (!pattern) return true;
  // Convertir patrón con * a regex
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    return new RegExp('^' + escaped + '$', 'i').test(text);
  } catch { return text.toLowerCase().includes(pattern.toLowerCase()); }
}

function textoMatchArticulo(a, pattern) {
  // Si contiene *, usar wildcard match contra cada campo concatenado
  if (pattern.includes('*')) {
    const campos = [a.nombre, a.codigo, a.referencia_fabricante, a.codigo_barras, a.descripcion].filter(Boolean);
    return campos.some(c => wildcardMatch(c, pattern));
  }
  // Búsqueda normal: includes
  const q = pattern.toLowerCase();
  return (a.nombre || '').toLowerCase().includes(q) ||
    (a.codigo || '').toLowerCase().includes(q) ||
    (a.referencia_fabricante || '').toLowerCase().includes(q) ||
    (a.codigo_barras || '').toLowerCase().includes(q) ||
    (a.descripcion || '').toLowerCase().includes(q);
}

// ─── FILTROS ───────────────────────────────────
function filtrarArticulos() {
  const texto = (document.getElementById('artBuscar')?.value || '').trim();
  const famId = document.getElementById('selFamFiltro')?.value;
  const subFamId = document.getElementById('selSubFamFiltro')?.value;
  const activo = document.getElementById('selActivoFiltro')?.value;

  // Actualizar subfamilias dropdown al cambiar familia
  actualizarFiltroSubfamilias();

  let list = [...articulos];

  // Texto / wildcard
  if (texto) {
    list = list.filter(a => textoMatchArticulo(a, texto));
  }

  // Familia + subfamilia
  if (subFamId) {
    list = list.filter(a => String(a.familia_id) === String(subFamId));
  } else if (famId) {
    const subIds = familias.filter(f => String(f.parent_id) === String(famId)).map(f => f.id);
    list = list.filter(a => String(a.familia_id) === String(famId) || subIds.includes(a.familia_id));
  }

  // Activo / inactivo
  if (activo === '1') list = list.filter(a => a.activo !== false);
  if (activo === '0') list = list.filter(a => a.activo === false);

  // KPI filter override
  if (_artKpiFilter === 'activos') list = list.filter(a => a.activo !== false);
  if (_artKpiFilter === 'inactivos') list = list.filter(a => a.activo === false);
  if (_artKpiFilter === 'sin_stock') list = list.filter(a => (a.stock_minimo || 0) > 0);

  renderArticulos(list);
}

function buscarArt(v) { document.getElementById('artBuscar').value = v; filtrarArticulos(); }
function filtrarArtFam(fid) { document.getElementById('selFamFiltro').value = fid; filtrarArticulos(); }

// ─── NUEVO ARTÍCULO ────────────────────────────
function nuevoArticulo() {
  // Primero abrir modal (que resetea campos y populate selects)
  openModal('mArticulo');

  // Luego configurar para nuevo
  document.getElementById('art_id').value = '';
  document.getElementById('mArtTit').textContent = 'Nuevo Artículo';
  document.getElementById('mArtSub').textContent = '';
  setVal({ art_codigo: '', art_nombre: '', art_desc: '', art_coste: '0', art_venta: '0', art_ref_fab: '', art_barras: '', art_obs: '', art_stock_min: '0', art_margen: '' });
  setArtFamilia('');
  const defIva = tiposIva.find(i => i.por_defecto);
  setArtIva(defIva?.id || '');
  const defUd = unidades.find(u => u.abreviatura === 'ud');
  setArtUnidad(defUd?.id || '');
  document.getElementById('art_es_activo').checked = false;
  document.getElementById('art_activo').checked = true;

  // Generar código automático
  generarCodigoArticulo();

  // Reset pestañas
  resetArtTabs();
  artProveedores = [];
  artHistorial = [];
  artFotoFile = null;

  // Mensajes de "guarda primero" en pestañas
  document.getElementById('artProvTable').innerHTML = '<p style="color:var(--gris-400);font-size:12.5px;text-align:center;padding:24px 0">Guarda el artículo primero para gestionar proveedores</p>';
  document.getElementById('artHistTable').innerHTML = '<p style="color:var(--gris-400);font-size:12.5px;text-align:center;padding:24px 0">Guarda el artículo primero para ver historial</p>';
  resetArtFotoPreview(null);
  document.getElementById('artProvCount').textContent = '0';
  document.getElementById('art_foto_mini').innerHTML = '📦';

  // Ocultar forms inline
  document.getElementById('artProvForm').style.display = 'none';
  document.getElementById('artHistForm').style.display = 'none';
}

function generarCodigoArticulo() {
  const maxNum = articulos.reduce((max, a) => {
    const m = (a.codigo || '').match(/ART-?(\d+)/i);
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, 0);
  document.getElementById('art_codigo').value = 'ART-' + String(maxNum + 1).padStart(3, '0');
}

function resetArtTabs() {
  document.querySelectorAll('.art-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  document.querySelectorAll('.art-panel').forEach((p, i) => p.style.display = i === 0 ? '' : 'none');
}

// ─── CALCULAR MARGEN ───────────────────────────
function calcularMargenArt() {
  const coste = parseFloat(document.getElementById('art_coste').value) || 0;
  const venta = parseFloat(document.getElementById('art_venta').value) || 0;
  const margenEl = document.getElementById('art_margen');
  if (coste > 0) {
    const pct = ((venta - coste) / coste * 100).toFixed(1);
    margenEl.value = pct + '%';
    margenEl.style.color = pct >= 30 ? 'var(--verde)' : pct >= 15 ? 'var(--amarillo)' : 'var(--rojo)';
  } else {
    margenEl.value = '—';
    margenEl.style.color = 'var(--gris-400)';
  }
}

// ─── EDITAR (abrir ficha) ─────────────────────
async function editArticulo(id) {
  const a = articulos.find(x => String(x.id) === String(id));
  if (!a) return;

  // Primero abrir modal (resetea y populate selects)
  openModal('mArticulo');

  // Luego rellenar todos los campos
  document.getElementById('art_id').value = a.id;
  document.getElementById('mArtTit').textContent = a.nombre || 'Artículo';
  document.getElementById('mArtSub').textContent = a.codigo || '';

  setVal({
    art_codigo: a.codigo || '', art_nombre: a.nombre || '', art_desc: a.descripcion || '',
    art_coste: a.precio_coste || 0, art_venta: a.precio_venta || 0,
    art_ref_fab: a.referencia_fabricante || '', art_barras: a.codigo_barras || '',
    art_obs: a.observaciones || '', art_stock_min: a.stock_minimo || 0
  });
  setArtFamilia(a.familia_id);
  setArtIva(a.tipo_iva_id);
  setArtUnidad(a.unidad_venta_id);
  document.getElementById('art_es_activo').checked = a.es_activo || false;
  document.getElementById('art_activo').checked = a.activo !== false;
  calcularMargenArt();

  // Reset pestañas a General
  resetArtTabs();
  artFotoFile = null;

  // Foto mini y preview
  if (a.foto_url) {
    document.getElementById('art_foto_mini').innerHTML = `<img src="${a.foto_url}" style="width:36px;height:36px;object-fit:cover;border-radius:8px">`;
    resetArtFotoPreview(a.foto_url);
  } else {
    document.getElementById('art_foto_mini').innerHTML = '📦';
    resetArtFotoPreview(null);
  }

  // Ocultar forms inline
  document.getElementById('artProvForm').style.display = 'none';
  document.getElementById('artHistForm').style.display = 'none';

  // Cargar proveedores e historial en paralelo
  await Promise.all([
    loadArtProveedores(a.id),
    loadArtHistorial(a.id)
  ]);
}

// ─── DUPLICAR ──────────────────────────────────
function duplicarArticulo(id) {
  const a = articulos.find(x => String(x.id) === String(id));
  if (!a) return;

  nuevoArticulo();
  // Sobrescribir con datos del original
  setVal({
    art_nombre: a.nombre + ' (copia)', art_desc: a.descripcion || '',
    art_coste: a.precio_coste || 0, art_venta: a.precio_venta || 0,
    art_ref_fab: a.referencia_fabricante || '', art_barras: '',
    art_obs: a.observaciones || '', art_stock_min: a.stock_minimo || 0
  });
  setArtFamilia(a.familia_id);
  setArtIva(a.tipo_iva_id);
  setArtUnidad(a.unidad_venta_id);
  document.getElementById('art_es_activo').checked = a.es_activo || false;
  document.getElementById('mArtTit').textContent = 'Duplicar Artículo';
  calcularMargenArt();
}

// ─── GUARDAR ARTÍCULO ─────────────────────────
async function saveArticulo() {
  const codigo = document.getElementById('art_codigo').value.trim();
  const nombre = document.getElementById('art_nombre').value.trim();
  if (!codigo || !nombre) { toast('Código y nombre son obligatorios', 'error'); return; }
  const id = document.getElementById('art_id').value;

  const obj = {
    empresa_id: EMPRESA.id,
    codigo, nombre,
    descripcion: v('art_desc') || null,
    familia_id: parseInt(document.getElementById('art_subfamilia').value) || parseInt(document.getElementById('art_familia').value) || null,
    tipo_iva_id: parseInt(document.getElementById('art_iva').value) || null,
    unidad_venta_id: parseInt(document.getElementById('art_unidad').value) || null,
    precio_coste: parseFloat(v('art_coste')) || 0,
    precio_venta: parseFloat(v('art_venta')) || 0,
    referencia_fabricante: v('art_ref_fab') || null,
    codigo_barras: v('art_barras') || null,
    stock_minimo: parseFloat(v('art_stock_min')) || 0,
    es_activo: document.getElementById('art_es_activo').checked,
    activo: document.getElementById('art_activo').checked,
    observaciones: v('art_obs') || null
  };

  // Subir foto si hay nueva
  if (artFotoFile) {
    const fotoUrl = await subirFotoArticulo(artFotoFile, id || 'new_' + Date.now());
    if (fotoUrl) obj.foto_url = fotoUrl;
  }

  let savedId = id;
  if (id) {
    const { error } = await sb.from('articulos').update(obj).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { data, error } = await sb.from('articulos').insert(obj).select('id').single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    savedId = data.id;
    document.getElementById('art_id').value = savedId;
    // Actualizar mensajes de las pestañas (ya no es nuevo)
    document.getElementById('mArtSub').textContent = codigo;
  }

  // Recargar lista
  const { data } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('codigo');
  articulos = data || [];
  filtrarArticulos();

  // Si la foto se subió con id temporal, actualizar
  if (artFotoFile && !id && savedId) {
    const fotoUrl = await subirFotoArticulo(artFotoFile, savedId);
    if (fotoUrl) {
      await sb.from('articulos').update({ foto_url: fotoUrl }).eq('id', savedId);
    }
  }
  artFotoFile = null;

  toast(id ? 'Artículo actualizado ✓' : 'Artículo creado ✓', 'success');

  // Si es nuevo, recargar proveedores/historial (ahora se pueden añadir)
  if (!id && savedId) {
    loadArtProveedores(savedId);
    loadArtHistorial(savedId);
  }
}

// ─── ELIMINAR ──────────────────────────────────
async function delArticulo(id) {
  if (!confirm('¿Eliminar este artículo y todos sus datos asociados?')) return;
  await sb.from('articulos').delete().eq('id', id);
  articulos = articulos.filter(a => String(a.id) !== String(id));
  filtrarArticulos();
  toast('Artículo eliminado', 'info');
}


// ═══════════════════════════════════════════════
// MULTI-PROVEEDOR
// ═══════════════════════════════════════════════

async function loadArtProveedores(articuloId) {
  const { data, error } = await sb.from('articulos_proveedores')
    .select('*')
    .eq('articulo_id', articuloId)
    .eq('empresa_id', EMPRESA.id)
    .order('es_principal', { ascending: false });

  artProveedores = data || [];
  document.getElementById('artProvCount').textContent = artProveedores.length;
  renderArtProveedores();
}

function renderArtProveedores() {
  const container = document.getElementById('artProvTable');
  if (!artProveedores.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px 0;color:var(--gris-400)">
      <div style="font-size:28px;margin-bottom:6px">🏭</div>
      <p style="font-size:12.5px">No hay proveedores asignados</p>
      <p style="font-size:11px">Haz clic en "Añadir proveedor" para asociar uno</p>
    </div>`;
    return;
  }

  container.innerHTML = `<div class="tw"><table class="dt" style="font-size:12.5px">
    <thead><tr>
      <th></th><th>Proveedor</th><th>Ref. proveedor</th><th>Precio</th><th>Dto.</th><th>Plazo</th><th>Notas</th><th style="width:70px"></th>
    </tr></thead>
    <tbody>${artProveedores.map(ap => {
      const prov = proveedores.find(p => p.id === ap.proveedor_id);
      return `<tr>
        <td>${ap.es_principal ? '⭐' : ''}</td>
        <td style="font-weight:600">${prov?.nombre || '—'}</td>
        <td style="font-family:monospace;font-size:11.5px">${ap.ref_proveedor || '—'}</td>
        <td style="font-weight:600">${fmtE(ap.precio_proveedor)}</td>
        <td>${ap.descuento ? ap.descuento + '%' : '—'}</td>
        <td>${ap.plazo_entrega_dias ? ap.plazo_entrega_dias + ' días' : '—'}</td>
        <td style="font-size:11px;color:var(--gris-400)">${ap.observaciones || ''}</td>
        <td><div style="display:flex;gap:3px">
          <button class="btn btn-ghost btn-sm" onclick="editArtProveedor('${ap.id}')" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="delArtProveedor('${ap.id}')" title="Eliminar">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function nuevoArtProveedor() {
  const artId = document.getElementById('art_id').value;
  if (!artId) { toast('Guarda el artículo primero', 'error'); return; }

  document.getElementById('artprov_id').value = '';
  // Populate proveedor select
  const sel = document.getElementById('artprov_proveedor');
  sel.innerHTML = '<option value="">— Seleccionar proveedor —</option>' + proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  sel.value = '';
  setVal({ artprov_ref: '', artprov_precio: '0', artprov_dto: '0', artprov_plazo: '0', artprov_obs: '' });
  document.getElementById('artprov_principal').checked = artProveedores.length === 0; // principal si es el primero
  document.getElementById('artProvForm').style.display = '';
}

function editArtProveedor(id) {
  const ap = artProveedores.find(x => String(x.id) === String(id));
  if (!ap) return;

  document.getElementById('artprov_id').value = ap.id;
  const sel = document.getElementById('artprov_proveedor');
  sel.innerHTML = '<option value="">— Seleccionar proveedor —</option>' + proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  sel.value = ap.proveedor_id;
  setVal({
    artprov_ref: ap.ref_proveedor || '',
    artprov_precio: ap.precio_proveedor || 0,
    artprov_dto: ap.descuento || 0,
    artprov_plazo: ap.plazo_entrega_dias || 0,
    artprov_obs: ap.observaciones || ''
  });
  document.getElementById('artprov_principal').checked = ap.es_principal;
  document.getElementById('artProvForm').style.display = '';
}

function cancelArtProv() {
  document.getElementById('artProvForm').style.display = 'none';
}

async function saveArtProveedor() {
  const artId = document.getElementById('art_id').value;
  const provId = document.getElementById('artprov_proveedor').value;
  if (!provId) { toast('Selecciona un proveedor', 'error'); return; }

  const apId = document.getElementById('artprov_id').value;
  const esPrincipal = document.getElementById('artprov_principal').checked;

  const obj = {
    empresa_id: EMPRESA.id,
    articulo_id: parseInt(artId),
    proveedor_id: parseInt(provId),
    ref_proveedor: v('artprov_ref') || null,
    precio_proveedor: parseFloat(v('artprov_precio')) || 0,
    descuento: parseFloat(v('artprov_dto')) || 0,
    plazo_entrega_dias: parseInt(v('artprov_plazo')) || 0,
    es_principal: esPrincipal,
    observaciones: v('artprov_obs') || null
  };

  // Si marcamos como principal, desmarcar los demás
  if (esPrincipal) {
    await sb.from('articulos_proveedores')
      .update({ es_principal: false })
      .eq('articulo_id', artId)
      .eq('empresa_id', EMPRESA.id);
  }

  if (apId) {
    const { error } = await sb.from('articulos_proveedores').update(obj).eq('id', apId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { error } = await sb.from('articulos_proveedores').insert(obj);
    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        toast('Este proveedor ya está asignado a este artículo', 'error');
      } else {
        toast('Error: ' + error.message, 'error');
      }
      return;
    }
  }

  // Si es principal, actualizar el precio coste del artículo
  if (esPrincipal) {
    const nuevoPrecio = parseFloat(v('artprov_precio')) || 0;
    if (nuevoPrecio > 0) {
      await sb.from('articulos').update({ precio_coste: nuevoPrecio }).eq('id', artId);
      document.getElementById('art_coste').value = nuevoPrecio;
      calcularMargenArt();
      // Actualizar en memoria
      const art = articulos.find(a => String(a.id) === String(artId));
      if (art) art.precio_coste = nuevoPrecio;
    }
  }

  cancelArtProv();
  await loadArtProveedores(artId);
  toast(apId ? 'Proveedor actualizado ✓' : 'Proveedor añadido ✓', 'success');
}

async function delArtProveedor(id) {
  if (!confirm('¿Eliminar este proveedor del artículo?')) return;
  await sb.from('articulos_proveedores').delete().eq('id', id);
  const artId = document.getElementById('art_id').value;
  await loadArtProveedores(artId);
  toast('Proveedor eliminado', 'info');
}


// ═══════════════════════════════════════════════
// HISTORIAL DE COMPRAS / TRAZABILIDAD
// ═══════════════════════════════════════════════

async function loadArtHistorial(articuloId) {
  const { data } = await sb.from('articulos_historial')
    .select('*')
    .eq('articulo_id', articuloId)
    .eq('empresa_id', EMPRESA.id)
    .order('fecha', { ascending: false });

  artHistorial = data || [];
  renderArtHistorial();
  updateArtHistKPIs();
}

function renderArtHistorial() {
  const container = document.getElementById('artHistTable');
  if (!artHistorial.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px 0;color:var(--gris-400)">
      <div style="font-size:28px;margin-bottom:6px">📋</div>
      <p style="font-size:12.5px">No hay registros de compra</p>
      <p style="font-size:11px">Los registros se crean automáticamente al recibir mercancía o puedes añadirlos manualmente</p>
    </div>`;
    return;
  }

  container.innerHTML = `<div class="tw"><table class="dt" style="font-size:12.5px">
    <thead><tr>
      <th>Fecha</th><th>Tipo</th><th>Proveedor</th><th>Cant.</th><th>Precio ud.</th><th>Total</th><th>Documento</th><th>Lote</th><th style="width:40px"></th>
    </tr></thead>
    <tbody>${artHistorial.map(h => {
      const prov = proveedores.find(p => p.id === h.proveedor_id);
      const tipoColor = h.tipo === 'compra' ? 'var(--verde)' : h.tipo === 'devolucion' ? 'var(--rojo)' : 'var(--amarillo)';
      const tipoLabel = h.tipo === 'compra' ? 'Compra' : h.tipo === 'devolucion' ? 'Devolución' : 'Ajuste';
      const fecha = h.fecha ? new Date(h.fecha).toLocaleDateString('es-ES') : '—';
      return `<tr>
        <td>${fecha}</td>
        <td><span class="badge" style="background:${tipoColor};color:#fff;font-size:10px">${tipoLabel}</span></td>
        <td>${prov?.nombre || '—'}</td>
        <td style="font-weight:600">${h.cantidad}</td>
        <td>${fmtE(h.precio_unitario)}</td>
        <td style="font-weight:700">${fmtE(h.total)}</td>
        <td style="font-size:11px;font-family:monospace">${h.documento_ref || '—'}</td>
        <td style="font-size:11px">${h.lote || '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="delArtHistorial('${h.id}')" title="Eliminar">🗑️</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function updateArtHistKPIs() {
  const compras = artHistorial.filter(h => h.tipo === 'compra');
  const totalUds = compras.reduce((s, h) => s + (parseFloat(h.cantidad) || 0), 0);
  const totalGasto = compras.reduce((s, h) => s + (parseFloat(h.total) || 0), 0);
  const precioMedio = compras.length > 0 ? totalGasto / totalUds : 0;
  const ultCompra = compras.length > 0 ? new Date(compras[0].fecha).toLocaleDateString('es-ES') : '—';

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('artHist_total_compras', compras.length);
  el('artHist_total_uds', totalUds % 1 === 0 ? totalUds : totalUds.toFixed(2));
  el('artHist_precio_medio', fmtE(precioMedio));
  el('artHist_ult_compra', ultCompra);
}

function nuevoArtHistorial() {
  const artId = document.getElementById('art_id').value;
  if (!artId) { toast('Guarda el artículo primero', 'error'); return; }

  document.getElementById('arthist_id').value = '';
  // Populate proveedor select (con los proveedores de este artículo primero)
  const sel = document.getElementById('arthist_proveedor');
  const artProvIds = artProveedores.map(ap => ap.proveedor_id);
  const provOrdenados = [
    ...proveedores.filter(p => artProvIds.includes(p.id)),
    ...proveedores.filter(p => !artProvIds.includes(p.id))
  ];
  sel.innerHTML = '<option value="">— Sin proveedor —</option>' + provOrdenados.map(p => {
    const esAsignado = artProvIds.includes(p.id) ? ' ⭐' : '';
    return `<option value="${p.id}">${p.nombre}${esAsignado}</option>`;
  }).join('');

  // Pre-seleccionar proveedor principal
  const principal = artProveedores.find(ap => ap.es_principal);
  sel.value = principal?.proveedor_id || '';

  document.getElementById('arthist_fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('arthist_tipo').value = 'compra';
  setVal({ arthist_cantidad: '1', arthist_precio: principal?.precio_proveedor || '0', arthist_doc: '', arthist_lote: '', arthist_obs: '' });
  document.getElementById('artHistForm').style.display = '';
}

function cancelArtHist() {
  document.getElementById('artHistForm').style.display = 'none';
}

async function saveArtHistorial() {
  const artId = document.getElementById('art_id').value;
  const cantidad = parseFloat(v('arthist_cantidad')) || 0;
  const precio = parseFloat(v('arthist_precio')) || 0;
  if (cantidad <= 0) { toast('La cantidad debe ser mayor que 0', 'error'); return; }

  const obj = {
    empresa_id: EMPRESA.id,
    articulo_id: parseInt(artId),
    proveedor_id: parseInt(document.getElementById('arthist_proveedor').value) || null,
    fecha: v('arthist_fecha') || new Date().toISOString(),
    tipo: v('arthist_tipo') || 'compra',
    cantidad,
    precio_unitario: precio,
    total: cantidad * precio,
    documento_ref: v('arthist_doc') || null,
    lote: v('arthist_lote') || null,
    observaciones: v('arthist_obs') || null,
    usuario_id: CU?.id || null
  };

  const { error } = await sb.from('articulos_historial').insert(obj);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  cancelArtHist();
  await loadArtHistorial(artId);
  toast('Registro añadido ✓', 'success');
}

async function delArtHistorial(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  await sb.from('articulos_historial').delete().eq('id', id);
  const artId = document.getElementById('art_id').value;
  await loadArtHistorial(artId);
  toast('Registro eliminado', 'info');
}


// ═══════════════════════════════════════════════
// FOTO DEL ARTÍCULO
// ═══════════════════════════════════════════════

function previewArtFoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('La imagen no puede superar 2MB', 'error'); return; }

  artFotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('art_foto_preview').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain">`;
    document.getElementById('btnQuitarFoto').style.display = '';
    document.getElementById('art_foto_mini').innerHTML = `<img src="${e.target.result}" style="width:36px;height:36px;object-fit:cover;border-radius:8px">`;
  };
  reader.readAsDataURL(file);
}

function resetArtFotoPreview(url) {
  const preview = document.getElementById('art_foto_preview');
  const btnQuitar = document.getElementById('btnQuitarFoto');
  if (url) {
    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain">`;
    btnQuitar.style.display = '';
  } else {
    preview.innerHTML = '<div style="color:var(--gris-400);font-size:13px"><div style="font-size:48px;margin-bottom:8px">📷</div>Sin foto</div>';
    btnQuitar.style.display = 'none';
  }
}

async function quitarArtFoto() {
  const id = document.getElementById('art_id').value;
  artFotoFile = null;
  resetArtFotoPreview(null);
  document.getElementById('art_foto_mini').innerHTML = '📦';
  document.getElementById('art_foto_input').value = '';

  if (id) {
    await sb.from('articulos').update({ foto_url: null }).eq('id', id);
    const art = articulos.find(a => String(a.id) === String(id));
    if (art) art.foto_url = null;
    toast('Foto eliminada', 'info');
  }
}

async function subirFotoArticulo(file, artId) {
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${EMPRESA.id}/${artId}.${ext}`;

    const { error: upErr } = await sb.storage.from('articulos').upload(path, file, {
      upsert: true,
      contentType: file.type
    });

    if (upErr) {
      console.error('Error subiendo foto:', upErr.message);
      // Si el bucket no existe, guardar como data URL
      return await fileToDataUrl(file);
    }

    const { data } = sb.storage.from('articulos').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error('Error foto:', e);
    return await fileToDataUrl(file);
  }
}

function fileToDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}


// ═══════════════════════════════════════════════
// EXPORTAR / IMPORTAR EXCEL
// ═══════════════════════════════════════════════

function exportarArticulosExcel() {
  const data = (artFiltrados.length ? artFiltrados : articulos).map(a => {
    const fam = familias.find(f => f.id === a.familia_id);
    const famPadre = fam && fam.parent_id ? familias.find(f => f.id === fam.parent_id) : null;
    const famLabel = famPadre ? `${famPadre.nombre} > ${fam.nombre}` : (fam?.nombre || '');
    const iva = tiposIva.find(i => i.id === a.tipo_iva_id);
    const ud = unidades.find(u => u.id === a.unidad_venta_id);
    return {
      'Código': a.codigo,
      'Nombre': a.nombre,
      'Descripción': a.descripcion || '',
      'Familia': famLabel,
      'Ref. fabricante': a.referencia_fabricante || '',
      'Código barras': a.codigo_barras || '',
      'Precio coste': a.precio_coste || 0,
      'Precio venta': a.precio_venta || 0,
      'Margen %': a.precio_coste > 0 ? (((a.precio_venta - a.precio_coste) / a.precio_coste) * 100).toFixed(1) : '',
      'IVA': iva ? iva.porcentaje + '%' : '',
      'Unidad': ud?.abreviatura || '',
      'Stock mínimo': a.stock_minimo || 0,
      'Activo': a.activo !== false ? 'Sí' : 'No',
      'Es maquinaria': a.es_activo ? 'Sí' : 'No'
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Artículos');
  ws['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 30 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
  XLSX.writeFile(wb, `Articulos_${EMPRESA.nombre}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('Excel exportado ✓', 'success');
}

async function importarArticulosExcel() {
  const file = document.getElementById('art_import_file').files[0];
  if (!file) { toast('Selecciona un archivo Excel', 'error'); return; }

  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  if (!rows.length) { toast('El archivo está vacío', 'error'); return; }

  let creados = 0, errores = 0;
  const progEl = document.getElementById('art_import_prog');

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nombre = r['Nombre'] || r['nombre'] || r['NOMBRE'] || r['Descripción'] || r['descripcion'] || '';
    if (!nombre) { errores++; continue; }

    const codigo = r['Código'] || r['codigo'] || r['CODIGO'] || r['Ref'] || r['ref'] || `IMP-${String(i + 1).padStart(3, '0')}`;
    const famNombre = r['Familia'] || r['familia'] || r['FAMILIA'] || '';
    const fam = famNombre ? familias.find(f => f.nombre.toLowerCase() === famNombre.toLowerCase()) : null;

    const obj = {
      empresa_id: EMPRESA.id,
      codigo: String(codigo).trim(),
      nombre: nombre.trim(),
      descripcion: r['Descripción'] || r['descripcion'] || null,
      familia_id: fam?.id || null,
      precio_coste: parseFloat(r['Precio coste'] || r['precio_coste'] || r['Coste'] || r['coste'] || 0) || 0,
      precio_venta: parseFloat(r['Precio venta'] || r['precio_venta'] || r['PVP'] || r['pvp'] || r['Venta'] || 0) || 0,
      referencia_fabricante: r['Ref. fabricante'] || r['ref_fabricante'] || null,
      codigo_barras: r['Código barras'] || r['codigo_barras'] || r['EAN'] || null,
      stock_minimo: parseFloat(r['Stock mínimo'] || r['stock_minimo'] || 0) || 0,
      activo: true
    };

    const ivaDefault = tiposIva.find(i => i.por_defecto);
    if (ivaDefault) obj.tipo_iva_id = ivaDefault.id;

    const { error } = await sb.from('articulos').insert(obj);
    if (error) { errores++; console.error('Error importando:', nombre, error.message); }
    else { creados++; }

    if (progEl) progEl.textContent = `Procesando ${i + 1} de ${rows.length}...`;
  }

  const { data: fresh } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('codigo');
  articulos = fresh || [];
  filtrarArticulos();
  closeModal('mImportarArticulos');
  toast(`Importación completada: ${creados} creados, ${errores} errores`, creados > 0 ? 'success' : 'error');
}

// Alias para compatibilidad con topbar
function exportarArticulos() { exportarArticulosExcel(); }
