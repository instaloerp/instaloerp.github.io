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
      cantidad_anterior: cantidadAnterior,
      cantidad_nueva: cantidadNueva,
      motivo: motivo,
      documento_tipo: null,
      documento_id: null,
      usuario_id: CU.id,
      usuario_nombre: CU.nombre,
      created_at: new Date().toISOString()
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
        <td>${new Date(mov.created_at).toLocaleDateString()}</td>
        <td>${mov.tipo}</td>
        <td class="text-right">${mov.cantidad_anterior}</td>
        <td class="text-right">${mov.cantidad}</td>
        <td class="text-right">${mov.cantidad_nueva}</td>
        <td>${mov.motivo || '—'}</td>
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

// Inicializar módulo al cargar página
function initStock() {
  const pageStock = document.getElementById('page-stock');
  if (pageStock) {
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

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStock);
} else {
  initStock();
}
