// ═══════════════════════════════════════════════
// MÓDULO ARTÍCULOS - Catálogo completo con KPIs, filtros, margen y exportación
// ═══════════════════════════════════════════════

let artFiltrados = [];

// ─── RENDERIZAR ────────────────────────────────
function renderArticulos(list) {
  artFiltrados = list;
  document.getElementById('artCount').textContent = `${list.length} de ${articulos.length} artículos`;

  // Populate filtro familias
  const sf = document.getElementById('selFamFiltro');
  if (sf) {
    const famVal = sf.value;
    sf.innerHTML = '<option value="">Todas las familias</option>' + familias.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
    sf.value = famVal;
  }

  // Populate proveedor en modal
  const sp = document.getElementById('art_proveedor');
  if (sp) {
    const pVal = sp.value;
    sp.innerHTML = '<option value="">— Sin proveedor —</option>' + proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    sp.value = pVal;
  }

  const tbody = document.getElementById('artTable');
  tbody.innerHTML = list.length ?
    list.map(a => {
      const fam = familias.find(f => f.id === a.familia_id);
      const iva = tiposIva.find(i => i.id === a.tipo_iva_id);
      const prov = proveedores.find(p => p.id === a.proveedor_id);
      const margen = a.precio_coste > 0 ? (((a.precio_venta - a.precio_coste) / a.precio_coste) * 100).toFixed(1) : '—';
      const margenColor = margen === '—' ? 'var(--gris-400)' : parseFloat(margen) >= 30 ? 'var(--verde)' : parseFloat(margen) >= 15 ? 'var(--amarillo)' : 'var(--rojo)';

      return `<tr>
        <td style="font-family:monospace;font-weight:700;font-size:12px;color:var(--azul)">${a.codigo || '—'}</td>
        <td>
          <div style="font-weight:700">${a.nombre}</div>
          ${a.descripcion ? `<div style="font-size:11px;color:var(--gris-400);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.descripcion}</div>` : ''}
          ${a.es_activo ? '<span class="badge bg-yellow" style="font-size:9.5px">Activo/Maquinaria</span>' : ''}
        </td>
        <td>${fam?.nombre || '—'}</td>
        <td style="font-size:11.5px">${prov?.nombre || '—'}</td>
        <td style="font-weight:600">${fmtE(a.precio_coste)}</td>
        <td style="font-weight:700;color:var(--verde)">${fmtE(a.precio_venta)}</td>
        <td style="font-weight:700;color:${margenColor}">${margen === '—' ? '—' : margen + '%'}</td>
        <td>${iva ? iva.porcentaje + '%' : '—'}</td>
        <td>${a.activo !== false ? '<span class="badge bg-green">Sí</span>' : '<span class="badge bg-gray">No</span>'}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="editArticulo(${a.id})" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="duplicarArticulo(${a.id})" title="Duplicar">📋</button>
          <button class="btn btn-ghost btn-sm" onclick="delArticulo(${a.id})" title="Eliminar">🗑️</button>
        </div></td>
      </tr>`;
    }).join('') :
    '<tr><td colspan="10"><div class="empty"><div class="ei">📦</div><h3>Sin artículos</h3><p>Añade tu catálogo de artículos o importa desde Excel</p></div></td></tr>';

  updateArticulosKPIs();
}

// ─── KPIs ──────────────────────────────────────
function updateArticulosKPIs() {
  const activos = articulos.filter(a => a.activo !== false);
  const famsUsadas = new Set(articulos.map(a => a.familia_id).filter(Boolean));
  const valorPVP = activos.reduce((sum, a) => sum + (a.precio_venta || 0), 0);

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('art_kpi_total', articulos.length);
  el('art_kpi_activos', activos.length);
  el('art_kpi_familias', famsUsadas.size);
  el('art_kpi_valor', fmtE(valorPVP));
}

// ─── FILTROS ───────────────────────────────────
function filtrarArticulos() {
  const texto = (document.getElementById('artBuscar')?.value || '').toLowerCase();
  const famId = document.getElementById('selFamFiltro')?.value;
  const activo = document.getElementById('selActivoFiltro')?.value;

  let list = [...articulos];

  if (texto) {
    list = list.filter(a =>
      (a.nombre || '').toLowerCase().includes(texto) ||
      (a.codigo || '').toLowerCase().includes(texto) ||
      (a.referencia_fabricante || '').toLowerCase().includes(texto) ||
      (a.codigo_barras || '').toLowerCase().includes(texto) ||
      (a.descripcion || '').toLowerCase().includes(texto)
    );
  }
  if (famId) list = list.filter(a => a.familia_id === parseInt(famId));
  if (activo === '1') list = list.filter(a => a.activo !== false);
  if (activo === '0') list = list.filter(a => a.activo === false);

  renderArticulos(list);
}

// Compatibilidad con funciones antiguas
function buscarArt(v) { document.getElementById('artBuscar').value = v; filtrarArticulos(); }
function filtrarArtFam(fid) { document.getElementById('selFamFiltro').value = fid; filtrarArticulos(); }

// ─── NUEVO ARTÍCULO ────────────────────────────
function nuevoArticulo() {
  document.getElementById('art_id').value = '';
  document.getElementById('mArtTit').textContent = 'Nuevo Artículo';
  setVal({ art_codigo: '', art_nombre: '', art_desc: '', art_coste: '0', art_venta: '0', art_ref_fab: '', art_barras: '', art_obs: '', art_stock_min: '0', art_margen: '' });
  document.getElementById('art_familia').value = '';
  document.getElementById('art_iva').value = tiposIva.find(i => i.por_defecto)?.id || '';
  document.getElementById('art_unidad').value = unidades.find(u => u.abreviatura === 'ud')?.id || '';
  document.getElementById('art_proveedor').value = '';
  document.getElementById('art_es_activo').checked = false;
  document.getElementById('art_activo').checked = true;

  // Generar código automático
  generarCodigoArticulo();

  openModal('mArticulo');
}

function generarCodigoArticulo() {
  const maxNum = articulos.reduce((max, a) => {
    const m = (a.codigo || '').match(/ART-?(\d+)/i);
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, 0);
  document.getElementById('art_codigo').value = 'ART-' + String(maxNum + 1).padStart(3, '0');
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

// ─── EDITAR ────────────────────────────────────
function editArticulo(id) {
  const a = articulos.find(x => x.id === id);
  if (!a) return;
  document.getElementById('art_id').value = a.id;
  document.getElementById('mArtTit').textContent = 'Editar Artículo';
  setVal({
    art_codigo: a.codigo || '', art_nombre: a.nombre || '', art_desc: a.descripcion || '',
    art_coste: a.precio_coste || 0, art_venta: a.precio_venta || 0,
    art_ref_fab: a.referencia_fabricante || '', art_barras: a.codigo_barras || '',
    art_obs: a.observaciones || '', art_stock_min: a.stock_minimo || 0
  });
  document.getElementById('art_familia').value = a.familia_id || '';
  document.getElementById('art_iva').value = a.tipo_iva_id || '';
  document.getElementById('art_unidad').value = a.unidad_venta_id || '';
  document.getElementById('art_proveedor').value = a.proveedor_id || '';
  document.getElementById('art_es_activo').checked = a.es_activo || false;
  document.getElementById('art_activo').checked = a.activo !== false;
  calcularMargenArt();
  openModal('mArticulo');
}

// ─── DUPLICAR ──────────────────────────────────
function duplicarArticulo(id) {
  const a = articulos.find(x => x.id === id);
  if (!a) return;
  editArticulo(id);
  document.getElementById('art_id').value = ''; // Quitar ID para que cree uno nuevo
  document.getElementById('mArtTit').textContent = 'Duplicar Artículo';
  generarCodigoArticulo();
  document.getElementById('art_nombre').value = a.nombre + ' (copia)';
}

// ─── GUARDAR ───────────────────────────────────
async function saveArticulo() {
  const codigo = document.getElementById('art_codigo').value.trim();
  const nombre = document.getElementById('art_nombre').value.trim();
  if (!codigo || !nombre) { toast('Código y nombre son obligatorios', 'error'); return; }
  const id = document.getElementById('art_id').value;

  const obj = {
    empresa_id: EMPRESA.id,
    codigo, nombre,
    descripcion: v('art_desc') || null,
    familia_id: parseInt(document.getElementById('art_familia').value) || null,
    tipo_iva_id: parseInt(document.getElementById('art_iva').value) || null,
    unidad_venta_id: parseInt(document.getElementById('art_unidad').value) || null,
    proveedor_id: parseInt(document.getElementById('art_proveedor').value) || null,
    precio_coste: parseFloat(v('art_coste')) || 0,
    precio_venta: parseFloat(v('art_venta')) || 0,
    referencia_fabricante: v('art_ref_fab') || null,
    codigo_barras: v('art_barras') || null,
    stock_minimo: parseFloat(v('art_stock_min')) || 0,
    es_activo: document.getElementById('art_es_activo').checked,
    activo: document.getElementById('art_activo').checked,
    observaciones: v('art_obs') || null
  };

  if (id) {
    const { error } = await sb.from('articulos').update(obj).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  } else {
    const { error } = await sb.from('articulos').insert(obj);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
  }

  closeModal('mArticulo');
  const { data } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('codigo');
  articulos = data || [];
  filtrarArticulos();
  toast(id ? 'Artículo actualizado ✓' : 'Artículo creado ✓', 'success');
}

// ─── ELIMINAR ──────────────────────────────────
async function delArticulo(id) {
  if (!confirm('¿Eliminar este artículo?')) return;
  await sb.from('articulos').delete().eq('id', id);
  articulos = articulos.filter(a => a.id !== id);
  filtrarArticulos();
  toast('Artículo eliminado', 'info');
}

// ─── EXPORTAR A EXCEL ──────────────────────────
function exportarArticulosExcel() {
  const data = (artFiltrados.length ? artFiltrados : articulos).map(a => {
    const fam = familias.find(f => f.id === a.familia_id);
    const iva = tiposIva.find(i => i.id === a.tipo_iva_id);
    const prov = proveedores.find(p => p.id === a.proveedor_id);
    const ud = unidades.find(u => u.id === a.unidad_venta_id);
    return {
      'Código': a.codigo,
      'Nombre': a.nombre,
      'Descripción': a.descripcion || '',
      'Familia': fam?.nombre || '',
      'Proveedor': prov?.nombre || '',
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

  // Ajustar anchos
  ws['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];

  XLSX.writeFile(wb, `Articulos_${EMPRESA.nombre}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('Excel exportado ✓', 'success');
}

// ─── IMPORTAR DESDE EXCEL ──────────────────────
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

    // Buscar familia por nombre
    const famNombre = r['Familia'] || r['familia'] || r['FAMILIA'] || '';
    const fam = famNombre ? familias.find(f => f.nombre.toLowerCase() === famNombre.toLowerCase()) : null;

    // Buscar proveedor por nombre
    const provNombre = r['Proveedor'] || r['proveedor'] || r['PROVEEDOR'] || '';
    const prov = provNombre ? proveedores.find(p => p.nombre.toLowerCase() === provNombre.toLowerCase()) : null;

    const obj = {
      empresa_id: EMPRESA.id,
      codigo: String(codigo).trim(),
      nombre: nombre.trim(),
      descripcion: r['Descripción'] || r['descripcion'] || null,
      familia_id: fam?.id || null,
      proveedor_id: prov?.id || null,
      precio_coste: parseFloat(r['Precio coste'] || r['precio_coste'] || r['Coste'] || r['coste'] || 0) || 0,
      precio_venta: parseFloat(r['Precio venta'] || r['precio_venta'] || r['PVP'] || r['pvp'] || r['Venta'] || 0) || 0,
      referencia_fabricante: r['Ref. fabricante'] || r['ref_fabricante'] || null,
      codigo_barras: r['Código barras'] || r['codigo_barras'] || r['EAN'] || null,
      stock_minimo: parseFloat(r['Stock mínimo'] || r['stock_minimo'] || 0) || 0,
      activo: true
    };

    // IVA por defecto
    const ivaDefault = tiposIva.find(i => i.por_defecto);
    if (ivaDefault) obj.tipo_iva_id = ivaDefault.id;

    const { error } = await sb.from('articulos').insert(obj);
    if (error) { errores++; console.error('Error importando:', nombre, error.message); }
    else { creados++; }

    if (progEl) progEl.textContent = `Procesando ${i + 1} de ${rows.length}...`;
  }

  // Recargar
  const { data: fresh } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('codigo');
  articulos = fresh || [];
  filtrarArticulos();
  closeModal('mImportarArticulos');
  toast(`Importación completada: ${creados} creados, ${errores} errores`, creados > 0 ? 'success' : 'error');
}
