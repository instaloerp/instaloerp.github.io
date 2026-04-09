// ============================================================================
// MÓDULO STOCK - Gestión de inventario por almacén y artículo
// ============================================================================

let stockData = [];
let stockFilters = { almacen: '', familia: '', texto: '', estado: 'all' };
let articulosModal = null;
let movimientosModal = null;

// Cargar stock desde Supabase
async function loadStock() {
  if (!EMPRESA || !EMPRESA.id) return;
  try {
    const { data, error } = await sb
      .from('stock')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    stockData = data || [];
    renderStock(stockData);
    updateStockKPIs();
  } catch (e) {
    console.error('Error cargando stock:', e);
    toast('Error cargando stock: ' + e.message, 'error');
  }
}

// Renderizar tabla de stock
function renderStock(list) {
  const tbody = document.querySelector('#stock-table tbody');
  if (!tbody) return;

  tbody.innerHTML = list.map(row => {
    const art = articulos.find(a => a.id === row.articulo_id);
    const fam = familias.find(f => f.id === art?.familia_id);
    const alm = almacenes.find(a => a.id === row.almacen_id);
    const status = row.cantidad <= 0 ? 'agotado' : row.cantidad < row.stock_minimo ? 'bajo' : 'ok';
    const cost = (art?.costo || 0) * row.cantidad;

    return `
      <tr class="status-${status}">
        <td>${art?.nombre || 'N/A'}</td>
        <td>${art?.codigo || 'N/A'}</td>
        <td>${fam?.nombre || 'N/A'}</td>
        <td>${alm?.nombre || 'N/A'}</td>
        <td class="text-right">${row.cantidad}</td>
        <td class="text-right">${row.stock_minimo}</td>
        <td>
          <span class="badge badge-${status}">
            ${status === 'ok' ? 'OK' : status === 'bajo' ? 'Bajo' : 'Agotado'}
          </span>
        </td>
        <td class="text-right">${fmtE(cost)}</td>
        <td class="text-center">
          <button class="btn-sm" onclick="ajustarStock(${row.articulo_id}, ${row.almacen_id})">Ajustar</button>
          <button class="btn-sm" onclick="verMovimientos(${row.articulo_id}, ${row.almacen_id})">Ver</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filtrar stock según criterios
function filtrarStock() {
  stockFilters.almacen = v('filter-almacen');
  stockFilters.familia = v('filter-familia');
  stockFilters.texto = v('filter-texto').toLowerCase();
  stockFilters.estado = v('filter-estado');

  let filtered = stockData.filter(row => {
    const art = articulos.find(a => a.id === row.articulo_id);
    const status = row.cantidad <= 0 ? 'agotado' : row.cantidad < row.stock_minimo ? 'bajo' : 'ok';

    if (stockFilters.almacen && row.almacen_id !== parseInt(stockFilters.almacen)) return false;
    if (stockFilters.familia && art?.familia_id !== parseInt(stockFilters.familia)) return false;
    if (stockFilters.texto && !art?.nombre.toLowerCase().includes(stockFilters.texto)) return false;
    if (stockFilters.estado !== 'all' && status !== stockFilters.estado) return false;

    return true;
  });

  renderStock(filtered);
}

// KPIs del stock
function updateStockKPIs() {
  const totalRefs = new Set(stockData.map(s => s.articulo_id)).size;
  const bajoMinimo = stockData.filter(s => s.cantidad < s.stock_minimo).length;
  const valorStock = stockData.reduce((sum, s) => {
    const art = articulos.find(a => a.id === s.articulo_id);
    return sum + ((art?.costo || 0) * s.cantidad);
  }, 0);
  const almacenesActivos = new Set(stockData.map(s => s.almacen_id)).size;

  setVal({
    'kpi-total-refs': totalRefs,
    'kpi-bajo-minimo': bajoMinimo,
    'kpi-valor-stock': fmtE(valorStock),
    'kpi-almacenes': almacenesActivos
  });
}

// Abrir modal para ajustar stock
function ajustarStock(articuloId, almacenId) {
  const art = articulos.find(a => a.id === articuloId);
  const stock = stockData.find(s => s.articulo_id === articuloId && s.almacen_id === almacenId);

  setVal({
    'ajuste-articulo': art?.nombre,
    'ajuste-codigo': art?.codigo,
    'ajuste-cantidad-actual': stock?.cantidad || 0,
    'ajuste-tipo': 'entrada',
    'ajuste-cantidad': '',
    'ajuste-motivo': '',
    'ajuste-articulo-id': articuloId,
    'ajuste-almacen-id': almacenId
  });

  openModal('modal-ajuste-stock');
}

// Guardar ajuste de stock
async function guardarAjuste() {
  const articuloId = parseInt(v('ajuste-articulo-id'));
  const almacenId = parseInt(v('ajuste-almacen-id'));
  const tipo = v('ajuste-tipo');
  const cantidad = parseFloat(v('ajuste-cantidad')) || 0;
  const motivo = v('ajuste-motivo').trim();

  if (cantidad <= 0) {
    toast('Ingrese una cantidad válida', 'warning');
    return;
  }

  if (!motivo) {
    toast('Ingrese el motivo del ajuste', 'warning');
    return;
  }

  try {
    const stock = stockData.find(s => s.articulo_id === articuloId && s.almacen_id === almacenId);
    const cantidadAnterior = stock?.cantidad || 0;
    const cantidadNueva = tipo === 'entrada' ? cantidadAnterior + cantidad : cantidadAnterior - cantidad;

    if (cantidadNueva < 0) {
      toast('Stock insuficiente para salida', 'warning');
      return;
    }

    // Actualizar stock
    const { error: errStock } = await sb.from('stock').upsert({
      id: stock?.id,
      empresa_id: EMPRESA.id,
      articulo_id: articuloId,
      almacen_id: almacenId,
      cantidad: cantidadNueva,
      stock_minimo: stock?.stock_minimo || 0,
      ubicacion: stock?.ubicacion || '',
      updated_at: new Date().toISOString()
    });

    if (errStock) throw errStock;

    // Registrar movimiento
    const { error: errMov } = await sb.from('movimientos_stock').insert({
      empresa_id: EMPRESA.id,
      articulo_id: articuloId,
      almacen_id: almacenId,
      tipo: 'ajuste',
      cantidad: cantidad,
      delta: cantidad,
      notas: motivo,
      fecha: new Date().toISOString().slice(0,10),
      usuario_id: CU.id,
      usuario_nombre: CU.nombre
    });

    if (errMov) throw errMov;

    toast('Ajuste guardado correctamente', 'success');
    closeModal('modal-ajuste-stock');
    await loadStock();
  } catch (e) {
    console.error('Error guardando ajuste:', e);
    toast('Error guardando ajuste: ' + e.message, 'error');
  }
}

// Ver movimientos de stock de un artículo
async function verMovimientos(articuloId, almacenId) {
  try {
    const { data, error } = await sb
      .from('movimientos_stock')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .eq('articulo_id', articuloId)
      .eq('almacen_id', almacenId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const art = articulos.find(a => a.id === articuloId);
    const alm = almacenes.find(a => a.id === almacenId);

    setVal({
      'movimientos-titulo': `${art?.nombre} - ${alm?.nombre}`
    });

    const tbody = document.querySelector('#movimientos-table tbody');
    if (!tbody) return;

    tbody.innerHTML = (data || []).map(mov => `
      <tr>
        <td>${mov.fecha || new Date(mov.created_at).toLocaleDateString()}</td>
        <td>${mov.tipo}</td>
        <td class="text-right">${mov.delta || mov.cantidad || 0}</td>
        <td>${mov.notas || '—'}</td>
        <td>${mov.usuario_nombre || 'N/A'}</td>
      </tr>
    `).join('');

    openModal('modal-movimientos-stock');
  } catch (e) {
    console.error('Error cargando movimientos:', e);
    toast('Error cargando movimientos: ' + e.message, 'error');
  }
}

// Exportar stock a Excel
function exportStock() {
  const data = stockData.map(row => {
    const art = articulos.find(a => a.id === row.articulo_id);
    const alm = almacenes.find(a => a.id === row.almacen_id);
    const status = row.cantidad <= 0 ? 'Agotado' : row.cantidad < row.stock_minimo ? 'Bajo' : 'OK';

    return {
      'Artículo': art?.nombre || 'N/A',
      'Código': art?.codigo || 'N/A',
      'Almacén': alm?.nombre || 'N/A',
      'Cantidad': row.cantidad,
      'Mínimo': row.stock_minimo,
      'Estado': status,
      'Costo Unitario': fmtE(art?.costo || 0),
      'Valor Total': fmtE((art?.costo || 0) * row.cantidad),
      'Actualizado': new Date(row.updated_at).toLocaleDateString()
    };
  });

  // Exportar usando librería externa (SheetJS, etc.)
  console.log('Exportar:', data);
  toast('Exportación preparada (ver consola)', 'success');
}

// Poblar filtros dropdowns
function populateStockFilters() {
  // Almacenes
  const selAlm = document.getElementById('filter-almacen');
  if (selAlm && typeof almacenes !== 'undefined') {
    const current = selAlm.value;
    selAlm.innerHTML = '<option value="">Todos los almacenes</option>';
    almacenes.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.nombre;
      if (String(a.id) === current) opt.selected = true;
      selAlm.appendChild(opt);
    });
  }
  // Familias
  const selFam = document.getElementById('filter-familia');
  if (selFam && typeof familias !== 'undefined') {
    selFam.innerHTML = '<option value="">Todas las familias</option>';
    familias.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.nombre;
      selFam.appendChild(opt);
    });
  }
}

// Inicializar módulo al cargar página
function initStock() {
  const pageStock = document.getElementById('page-stock');
  if (pageStock) {
    populateStockFilters();
    loadStock();

    // Listeners de filtros
    ['filter-almacen', 'filter-familia', 'filter-texto', 'filter-estado'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', filtrarStock);
    });

    const searchEl = document.getElementById('filter-texto');
    if (searchEl) searchEl.addEventListener('keyup', filtrarStock);
  }
}

// ════════════════════════════════════════════════════════════
// CÁLCULO DE STOCK MÍNIMO basado en consumos históricos
// ════════════════════════════════════════════════════════════

let _calcMinData = []; // datos calculados
let _calcMinPeriodo = 30; // días por defecto (1 mes)
let _calcMinAlmacenId = null;

async function abrirCalculoMinimos() {
  openModal('modal-calculo-minimos');
  // Por defecto: 1 mes, primera furgoneta
  const selAlm = document.getElementById('calc-min-almacen');
  const selPeriodo = document.getElementById('calc-min-periodo');
  if (selAlm) {
    const furgs = almacenes.filter(a => a.tipo === 'furgoneta' && a.activo !== false);
    selAlm.innerHTML = '<option value="">Todas las furgonetas</option>' +
      almacenes.filter(a => a.activo !== false).map(a => {
        const icon = a.tipo === 'furgoneta' ? '🚐' : a.tipo === 'externo' ? '📦' : '🏭';
        return `<option value="${a.id}">${icon} ${a.nombre}</option>`;
      }).join('');
  }
  await calcularMinimos();
}

async function calcularMinimos() {
  const selAlm = document.getElementById('calc-min-almacen');
  const selPeriodo = document.getElementById('calc-min-periodo');
  _calcMinAlmacenId = selAlm?.value ? parseInt(selAlm.value) : null;
  _calcMinPeriodo = parseInt(selPeriodo?.value) || 30;

  const tbody = document.getElementById('calc-min-tabla');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--gris-400)">Cargando consumos...</td></tr>';

  try {
    // Fecha de corte
    const desde = new Date();
    desde.setDate(desde.getDate() - _calcMinPeriodo);
    const desdeISO = desde.toISOString();

    // Cargar consumos del periodo
    let query = sb.from('consumos_parte')
      .select('articulo_id, articulo_nombre, articulo_codigo, almacen_id, cantidad, tipo')
      .eq('empresa_id', EMPRESA.id)
      .gte('created_at', desdeISO)
      .eq('tipo', 'consumo'); // Solo consumos reales, no mermas

    if (_calcMinAlmacenId) {
      query = query.eq('almacen_id', _calcMinAlmacenId);
    }

    const { data: consumos } = await query;
    if (!consumos || !consumos.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--gris-400)">No hay consumos en este periodo</td></tr>';
      _calcMinData = [];
      _updateCalcMinResumen();
      return;
    }

    // Agrupar por artículo + almacén
    const mapa = {}; // key: articuloId_almacenId
    consumos.forEach(c => {
      const almId = c.almacen_id || 'sin';
      const key = `${c.articulo_id}_${almId}`;
      if (!mapa[key]) {
        mapa[key] = {
          articulo_id: c.articulo_id,
          almacen_id: almId === 'sin' ? null : almId,
          nombre: c.articulo_nombre || 'Sin nombre',
          codigo: c.articulo_codigo || '—',
          total_consumido: 0,
          num_consumos: 0
        };
      }
      mapa[key].total_consumido += (c.cantidad || 0);
      mapa[key].num_consumos++;
    });

    // Calcular promedios y mínimos sugeridos
    const semanas = _calcMinPeriodo / 7;
    const dias = _calcMinPeriodo;

    // Cargar stock actual para comparar
    let stockQuery = sb.from('stock').select('articulo_id, almacen_id, cantidad, stock_minimo, stock_maximo, stock_provisional')
      .eq('empresa_id', EMPRESA.id);
    if (_calcMinAlmacenId) stockQuery = stockQuery.eq('almacen_id', _calcMinAlmacenId);
    const { data: stockActual } = await stockQuery;
    const stockMap = {};
    (stockActual || []).forEach(s => {
      stockMap[`${s.articulo_id}_${s.almacen_id}`] = s;
    });

    _calcMinData = Object.values(mapa).map(item => {
      const porSemana = semanas > 0 ? Math.ceil(item.total_consumido / semanas) : item.total_consumido;
      const porDia = dias > 0 ? (item.total_consumido / dias) : 0;
      // Mínimo sugerido: consumo de 1 semana (redondeado arriba)
      const minimoSugerido = Math.max(1, porSemana);
      // Máximo sugerido: consumo de 2 semanas (para que no se reponga inmediatamente)
      const maximoSugerido = Math.max(minimoSugerido + 1, Math.ceil(porSemana * 2));
      const stockKey = `${item.articulo_id}_${item.almacen_id}`;
      const stk = stockMap[stockKey];
      const minimoActual = stk?.stock_minimo || 0;
      const maximoActual = stk?.stock_maximo || 0;
      const cantidadActual = (stk?.cantidad || 0) + (stk?.stock_provisional || 0);
      const alm = almacenes.find(a => a.id === item.almacen_id);

      return {
        ...item,
        almacen_nombre: alm?.nombre || 'Sin almacén',
        almacen_tipo: alm?.tipo || '',
        por_dia: porDia,
        por_semana: porSemana,
        minimo_sugerido: minimoSugerido,
        maximo_sugerido: maximoSugerido,
        minimo_actual: minimoActual,
        maximo_actual: maximoActual,
        cantidad_actual: cantidadActual,
        aplicar: minimoActual !== minimoSugerido || maximoActual !== maximoSugerido
      };
    });

    // Ordenar por consumo semanal descendente
    _calcMinData.sort((a, b) => b.por_semana - a.por_semana);

    _renderCalcMinTabla();
    _updateCalcMinResumen();

  } catch(e) {
    console.error('[CalcMinimos]', e);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:red">Error: ${e.message}</td></tr>`;
  }
}

function _renderCalcMinTabla() {
  const tbody = document.getElementById('calc-min-tabla');
  if (!tbody) return;

  tbody.innerHTML = _calcMinData.map((d, idx) => {
    const iconAlm = d.almacen_tipo === 'furgoneta' ? '🚐' : d.almacen_tipo === 'externo' ? '📦' : '🏭';
    const cambioMin = d.minimo_sugerido !== d.minimo_actual;
    const cambioMax = d.maximo_sugerido !== d.maximo_actual;
    const diffMinClass = cambioMin ? 'color:#F97316;font-weight:700' : 'color:#888';
    const diffMaxClass = cambioMax ? 'color:#3B82F6;font-weight:700' : 'color:#888';
    const stockStatus = d.cantidad_actual < d.minimo_sugerido
      ? '<span style="color:red;font-weight:700">BAJO</span>'
      : d.cantidad_actual >= d.maximo_sugerido
      ? '<span style="color:#16A34A">OK</span>'
      : '<span style="color:#F97316">MEDIO</span>';

    return `<tr>
      <td><input type="checkbox" ${d.aplicar ? 'checked' : ''} onchange="_calcMinData[${idx}].aplicar=this.checked;_updateCalcMinResumen()"></td>
      <td style="font-family:monospace;font-size:11px">${d.codigo}</td>
      <td><div style="font-weight:600;font-size:12px">${d.nombre}</div></td>
      <td style="font-size:12px">${iconAlm} ${d.almacen_nombre}</td>
      <td style="text-align:right;font-weight:700">${d.total_consumido}</td>
      <td style="text-align:right;font-weight:700">${d.por_semana}/sem</td>
      <td style="text-align:right;font-size:12px">${d.minimo_actual || '—'} / ${d.maximo_actual || '—'}</td>
      <td style="text-align:center;white-space:nowrap">
        <input type="number" min="0" value="${d.minimo_sugerido}" style="width:50px;text-align:center;padding:3px 4px;border:1px solid #ddd;border-radius:5px;font-weight:700;font-size:12px;${diffMinClass}"
          onchange="_calcMinData[${idx}].minimo_sugerido=parseInt(this.value)||0;_updateCalcMinResumen()">
        <span style="color:#888;font-size:11px">/</span>
        <input type="number" min="0" value="${d.maximo_sugerido}" style="width:50px;text-align:center;padding:3px 4px;border:1px solid #ddd;border-radius:5px;font-weight:700;font-size:12px;${diffMaxClass}"
          onchange="_calcMinData[${idx}].maximo_sugerido=parseInt(this.value)||0;_updateCalcMinResumen()">
      </td>
      <td style="text-align:center">${stockStatus}</td>
    </tr>`;
  }).join('');
}

function _updateCalcMinResumen() {
  const seleccionados = _calcMinData.filter(d => d.aplicar);
  const cambios = seleccionados.filter(d => d.minimo_sugerido !== d.minimo_actual);
  const el = document.getElementById('calc-min-resumen');
  if (el) {
    el.textContent = `${_calcMinData.length} artículos analizados · ${seleccionados.length} seleccionados · ${cambios.length} con cambios`;
  }
  const btn = document.getElementById('btn-aplicar-minimos');
  if (btn) btn.disabled = cambios.length === 0;
}

async function aplicarMinimosCalculados() {
  const cambios = _calcMinData.filter(d => d.aplicar && (d.minimo_sugerido !== d.minimo_actual || d.maximo_sugerido !== d.maximo_actual));
  if (!cambios.length) {
    toast('No hay cambios que aplicar', 'warning');
    return;
  }

  if (!confirm(`¿Aplicar stock mínimo/máximo a ${cambios.length} artículo(s)?`)) return;

  toast(`🔄 Aplicando ${cambios.length} mínimos/máximos...`, 'info');
  let ok = 0, errores = 0;

  for (const d of cambios) {
    if (!d.almacen_id || !d.articulo_id) continue;

    // Intentar actualizar el stock existente
    const { data: existe } = await sb.from('stock')
      .select('id')
      .eq('empresa_id', EMPRESA.id)
      .eq('articulo_id', d.articulo_id)
      .eq('almacen_id', d.almacen_id)
      .limit(1);

    if (existe?.length) {
      const { error } = await sb.from('stock')
        .update({ stock_minimo: d.minimo_sugerido, stock_maximo: d.maximo_sugerido })
        .eq('empresa_id', EMPRESA.id)
        .eq('articulo_id', d.articulo_id)
        .eq('almacen_id', d.almacen_id);
      if (error) { errores++; console.error(error); }
      else { ok++; d.minimo_actual = d.minimo_sugerido; d.maximo_actual = d.maximo_sugerido; }
    } else {
      // Crear registro de stock con mínimo (sin cantidad)
      const { error } = await sb.from('stock').insert({
        empresa_id: EMPRESA.id,
        articulo_id: d.articulo_id,
        almacen_id: d.almacen_id,
        cantidad: 0,
        stock_minimo: d.minimo_sugerido,
        stock_provisional: 0,
        stock_reservado: 0
      });
      if (error) { errores++; console.error(error); }
      else { ok++; d.minimo_actual = d.minimo_sugerido; }
    }
  }

  // loading done
  toast(`✅ ${ok} mínimo(s) aplicado(s)${errores ? `, ${errores} error(es)` : ''}`, errores ? 'warning' : 'success');
  _renderCalcMinTabla();
  _updateCalcMinResumen();

  // Refrescar datos de stock
  if (typeof loadStock === 'function') loadStock();
  if (typeof _invalidarArtStockMap === 'function') _invalidarArtStockMap();
}

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStock);
} else {
  initStock();
}
