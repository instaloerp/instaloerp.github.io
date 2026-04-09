// ============================================================================
// MÓDULO TRASPASOS - Gestión de transferencias entre almacenes
// ============================================================================

let traspasosData = [];
let traspasosFilters = { estado: 'all', almacen: '', fechaFrom: '', fechaTo: '' };
let lineasTrasp = [];
let numeroTraspCounter = 1000;

// Cargar traspasos desde Supabase
async function loadTraspasos() {
  if (!EMPRESA || !EMPRESA.id) return;
  try {
    const { data, error } = await sb
      .from('traspasos')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    traspasosData = data || [];
    renderTraspasos(traspasosData);
    updateTrasposKPIs();
  } catch (e) {
    console.error('Error cargando traspasos:', e);
    toast('Error cargando traspasos: ' + e.message, 'error');
  }
}

// Renderizar tabla de traspasos
function renderTraspasos(list) {
  const tbody = document.querySelector('#traspasos-table tbody');
  if (!tbody) return;

  tbody.innerHTML = list.map(row => {
    const badgeClass = {
      'pendiente': 'badge-warning',
      'en_transito': 'badge-info',
      'completado': 'badge-success',
      'anulado': 'badge-danger'
    }[row.estado] || 'badge-secondary';

    const lineCount = (row.lineas || []).length;
    const totalQty = (row.lineas || []).reduce((sum, l) => sum + (l.cantidad || 0), 0);

    return `
      <tr>
        <td><strong>${row.numero}</strong></td>
        <td>${new Date(row.fecha).toLocaleDateString()}</td>
        <td>${row.almacen_origen_nombre}</td>
        <td>→</td>
        <td>${row.almacen_destino_nombre}</td>
        <td class="text-right">${lineCount} líneas / ${totalQty} items</td>
        <td>
          <span class="badge ${badgeClass}">
            ${row.estado.charAt(0).toUpperCase() + row.estado.slice(1)}
          </span>
        </td>
        <td class="text-center">
          <button class="btn-sm" onclick="editTraspaso(${row.id})" title="Ver detalle">Detalle</button>
          ${row.estado === 'pendiente' ? `<button class="btn-sm btn-success" onclick="completarTraspaso(${row.id})">Completar</button>` : ''}
          ${row.estado !== 'completado' && row.estado !== 'anulado' ? `<button class="btn-sm btn-danger" onclick="anularTraspaso(${row.id})">Anular</button>` : ''}
          <button class="btn-sm btn-outline" onclick="delTraspaso(${row.id})">Borrar</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filtrar traspasos
function filtrarTraspasos() {
  traspasosFilters.estado = v('filter-estado-trasp');
  traspasosFilters.almacen = v('filter-almacen-trasp');
  traspasosFilters.fechaFrom = v('filter-fecha-from');
  traspasosFilters.fechaTo = v('filter-fecha-to');

  let filtered = traspasosData.filter(row => {
    if (traspasosFilters.estado !== 'all' && row.estado !== traspasosFilters.estado) return false;
    if (traspasosFilters.almacen && row.almacen_origen_id !== parseInt(traspasosFilters.almacen)) return false;
    if (traspasosFilters.fechaFrom && new Date(row.fecha) < new Date(traspasosFilters.fechaFrom)) return false;
    if (traspasosFilters.fechaTo && new Date(row.fecha) > new Date(traspasosFilters.fechaTo)) return false;
    return true;
  });

  renderTraspasos(filtered);
}

// KPIs de traspasos
function updateTrasposKPIs() {
  const totalTraspasos = traspasosData.length;
  const pendientes = traspasosData.filter(t => t.estado === 'pendiente').length;
  const completadosMes = traspasosData.filter(t => {
    const fecha = new Date(t.created_at);
    const hoy = new Date();
    return t.estado === 'completado' &&
           fecha.getMonth() === hoy.getMonth() &&
           fecha.getFullYear() === hoy.getFullYear();
  }).length;
  const valorTraspasos = traspasosData.reduce((sum, t) => {
    return sum + ((t.lineas || []).reduce((lineSum, l) => {
      const art = articulos.find(a => a.id === l.articulo_id);
      return lineSum + ((art?.costo || 0) * l.cantidad);
    }, 0));
  }, 0);

  setVal({
    'kpi-total-traspasos': totalTraspasos,
    'kpi-pendientes': pendientes,
    'kpi-completados-mes': completadosMes,
    'kpi-valor-traspasos': fmtE(valorTraspasos)
  });
}

// Abrir modal para nuevo traspaso
function nuevoTraspasoModal() {
  lineasTrasp = [];
  setVal({
    'trasp-origen': '',
    'trasp-destino': '',
    'trasp-observaciones': ''
  });
  tr_renderLineasTrasp();
  openModal('modal-nuevo-trasp');
}

// Agregar línea a traspaso
function tr_addLineaTrasp() {
  const articuloId = parseInt(v('trasp-articulo-id'));
  const cantidad = parseFloat(v('trasp-cantidad')) || 0;

  if (!articuloId || cantidad <= 0) {
    toast('Seleccione artículo y cantidad válida', 'warning');
    return;
  }

  const art = articulos.find(a => a.id === articuloId);
  if (!art) {
    toast('Artículo no encontrado', 'error');
    return;
  }

  lineasTrasp.push({
    articulo_id: articuloId,
    codigo: art.codigo,
    nombre: art.nombre,
    cantidad: cantidad
  });

  setVal({
    'trasp-articulo-id': '',
    'trasp-cantidad': ''
  });

  tr_renderLineasTrasp();
  toast('Línea agregada', 'success');
}

// Remover línea de traspaso
function tr_removeLineaTrasp(index) {
  lineasTrasp.splice(index, 1);
  tr_renderLineasTrasp();
}

// Renderizar líneas del traspaso
function tr_renderLineasTrasp() {
  const tbody = document.querySelector('#traspasos-lineas-tabla tbody');
  if (!tbody) return;

  tbody.innerHTML = lineasTrasp.map((linea, idx) => `
    <tr>
      <td>${linea.codigo}</td>
      <td>${linea.nombre}</td>
      <td class="text-right">${linea.cantidad}</td>
      <td class="text-center">
        <button class="btn-sm btn-danger" onclick="tr_removeLineaTrasp(${idx})">Remover</button>
      </td>
    </tr>
  `).join('');

  const emptyRow = document.querySelector('#traspasos-lineas-empty');
  if (emptyRow) {
    emptyRow.style.display = lineasTrasp.length === 0 ? '' : 'none';
  }
}

// Guardar nuevo traspaso
async function guardarTraspaso() {
  const almacenOrigenId = parseInt(v('trasp-origen'));
  const almacenDestinoId = parseInt(v('trasp-destino'));
  const observaciones = v('trasp-observaciones').trim();

  if (!almacenOrigenId || !almacenDestinoId) {
    toast('Seleccione almacén origen y destino', 'warning');
    return;
  }

  if (almacenOrigenId === almacenDestinoId) {
    toast('El origen y destino no pueden ser el mismo almacén', 'warning');
    return;
  }

  if (lineasTrasp.length === 0) {
    toast('Agregue al menos una línea de artículo', 'warning');
    return;
  }

  try {
    // Generar número de traspaso
    const numero = `TR-${new Date().getFullYear()}-${String(++numeroTraspCounter).padStart(6, '0')}`;

    const almacenOrigen = almacenes.find(a => a.id === almacenOrigenId);
    const almacenDestino = almacenes.find(a => a.id === almacenDestinoId);

    const { data, error } = await sb.from('traspasos').insert({
      empresa_id: EMPRESA.id,
      numero: numero,
      almacen_origen_id: almacenOrigenId,
      almacen_destino_id: almacenDestinoId,
      almacen_origen_nombre: almacenOrigen?.nombre || 'N/A',
      almacen_destino_nombre: almacenDestino?.nombre || 'N/A',
      fecha: new Date().toISOString().split('T')[0],
      estado: 'pendiente',
      lineas: lineasTrasp,
      observaciones: observaciones,
      usuario_id: CU.id,
      usuario_nombre: CU.nombre,
      created_at: new Date().toISOString()
    }).select();

    if (error) throw error;

    toast('Traspaso creado: ' + numero, 'success');
    closeModal('modal-nuevo-trasp');
    await loadTraspasos();
  } catch (e) {
    console.error('Error guardando traspaso:', e);
    toast('Error guardando traspaso: ' + e.message, 'error');
  }
}

// Completar traspaso
async function completarTraspaso(traspId) {
  if (!confirm('¿Completar este traspaso? Se actualizará el stock en ambos almacenes.')) return;

  try {
    const trasp = traspasosData.find(t => t.id === traspId);
    if (!trasp) return;

    // Procesar cada línea
    for (const linea of trasp.lineas || []) {
      // Restar del almacén origen
      const { data: stockOrigen } = await sb
        .from('stock')
        .select('*')
        .eq('empresa_id', EMPRESA.id)
        .eq('articulo_id', linea.articulo_id)
        .eq('almacen_id', trasp.almacen_origen_id)
        .single();

      if (stockOrigen) {
        const cantidadNueva = Math.max(0, (stockOrigen.cantidad || 0) - linea.cantidad);
        await sb.from('stock').update({
          cantidad: cantidadNueva,
          updated_at: new Date().toISOString()
        }).eq('id', stockOrigen.id);

        // Movimiento de salida
        await sb.from('movimientos_stock').insert({
          empresa_id: EMPRESA.id,
          articulo_id: linea.articulo_id,
          almacen_id: trasp.almacen_origen_id,
          tipo: 'traspaso',
          cantidad: -linea.cantidad,
          delta: -linea.cantidad,
          notas: `Traspaso a ${trasp.almacen_destino_nombre}`,
          fecha: new Date().toISOString().slice(0,10),
          usuario_id: CU.id,
          usuario_nombre: CU.nombre
        });
      }

      // Sumar al almacén destino
      const { data: stockDestino } = await sb
        .from('stock')
        .select('*')
        .eq('empresa_id', EMPRESA.id)
        .eq('articulo_id', linea.articulo_id)
        .eq('almacen_id', trasp.almacen_destino_id)
        .single();

      if (stockDestino) {
        const cantidadNueva = (stockDestino.cantidad || 0) + linea.cantidad;
        await sb.from('stock').update({
          cantidad: cantidadNueva,
          updated_at: new Date().toISOString()
        }).eq('id', stockDestino.id);
      } else {
        await sb.from('stock').insert({
          empresa_id: EMPRESA.id,
          articulo_id: linea.articulo_id,
          almacen_id: trasp.almacen_destino_id,
          cantidad: linea.cantidad,
          stock_minimo: 0,
          ubicacion: '',
          updated_at: new Date().toISOString()
        });
      }

      // Movimiento de entrada
      await sb.from('movimientos_stock').insert({
        empresa_id: EMPRESA.id,
        articulo_id: linea.articulo_id,
        almacen_id: trasp.almacen_destino_id,
        tipo: 'traspaso',
        cantidad: linea.cantidad,
        delta: linea.cantidad,
        notas: `Traspaso desde ${trasp.almacen_origen_nombre}`,
        fecha: new Date().toISOString().slice(0,10),
        usuario_id: CU.id,
        usuario_nombre: CU.nombre
      });
    }

    // Actualizar estado del traspaso
    await sb.from('traspasos').update({
      estado: 'completado'
    }).eq('id', traspId);

    toast('Traspaso completado', 'success');
    await loadTraspasos();
  } catch (e) {
    console.error('Error completando traspaso:', e);
    toast('Error completando traspaso: ' + e.message, 'error');
  }
}

// Anular traspaso
async function anularTraspaso(traspId) {
  if (!confirm('¿Anular este traspaso?')) return;

  try {
    await sb.from('traspasos').update({
      estado: 'anulado'
    }).eq('id', traspId);

    toast('Traspaso anulado', 'success');
    await loadTraspasos();
  } catch (e) {
    console.error('Error anulando traspaso:', e);
    toast('Error anulando traspaso: ' + e.message, 'error');
  }
}

// Borrar traspaso
async function delTraspaso(traspId) {
  if (!confirm('¿Borrar este traspaso? Esta acción no se puede deshacer.')) return;

  try {
    await sb.from('traspasos').delete().eq('id', traspId);

    toast('Traspaso borrado', 'success');
    await loadTraspasos();
  } catch (e) {
    console.error('Error borrando traspaso:', e);
    toast('Error borrando traspaso: ' + e.message, 'error');
  }
}

// Editar/Ver detalle del traspaso
async function editTraspaso(traspId) {
  const trasp = traspasosData.find(t => t.id === traspId);
  if (!trasp) return;

  setVal({
    'det-numero': trasp.numero,
    'det-fecha': new Date(trasp.fecha).toLocaleDateString(),
    'det-origen': trasp.almacen_origen_nombre,
    'det-destino': trasp.almacen_destino_nombre,
    'det-estado': trasp.estado,
    'det-usuario': trasp.usuario_nombre,
    'det-observaciones': trasp.observaciones || ''
  });

  const tbody = document.querySelector('#detalle-traspasos-lineas tbody');
  if (tbody) {
    tbody.innerHTML = (trasp.lineas || []).map(linea => `
      <tr>
        <td>${linea.codigo}</td>
        <td>${linea.nombre}</td>
        <td class="text-right">${linea.cantidad}</td>
        <td class="text-right">${fmtE((articulos.find(a => a.id === linea.articulo_id)?.costo || 0) * linea.cantidad)}</td>
      </tr>
    `).join('');
  }

  openModal('modal-detalle-trasp');
}

// Exportar traspasos a Excel
function exportTraspasos() {
  const data = traspasosData.map(row => {
    const lineCount = (row.lineas || []).length;
    const totalQty = (row.lineas || []).reduce((sum, l) => sum + (l.cantidad || 0), 0);
    const totalValue = (row.lineas || []).reduce((sum, l) => {
      const art = articulos.find(a => a.id === l.articulo_id);
      return sum + ((art?.costo || 0) * l.cantidad);
    }, 0);

    return {
      'Número': row.numero,
      'Fecha': new Date(row.fecha).toLocaleDateString(),
      'Origen': row.almacen_origen_nombre,
      'Destino': row.almacen_destino_nombre,
      'Estado': row.estado,
      'Líneas': lineCount,
      'Cantidad Total': totalQty,
      'Valor': fmtE(totalValue),
      'Usuario': row.usuario_nombre,
      'Observaciones': row.observaciones || ''
    };
  });

  console.log('Exportar traspasos:', data);
  toast('Exportación preparada (ver consola)', 'success');
}

// Inicializar módulo
function initTraspasos() {
  const pageTraspasos = document.getElementById('page-traspasos');
  if (pageTraspasos) {
    loadTraspasos();

    // Listeners de filtros
    ['filter-estado-trasp', 'filter-almacen-trasp', 'filter-fecha-from', 'filter-fecha-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', filtrarTraspasos);
    });
  }
}

// ════════════════════════════════════════════════════════════
// REPOSICIÓN AUTOMÁTICA — Genera traspasos desde almacén central
// ════════════════════════════════════════════════════════════

async function generarReposicion() {
  if (!EMPRESA?.id) return;

  try {
    showLoading('Calculando reposición...');

    // 1. Buscar almacén central (origen)
    const central = almacenes.find(a => a.tipo === 'central' && a.activo !== false);
    if (!central) {
      toast('No se encontró un almacén central activo', 'error');
      hideLoading();
      return;
    }

    // 2. Buscar todas las furgonetas activas
    const furgonetas = almacenes.filter(a => a.tipo === 'furgoneta' && a.activo !== false);
    if (!furgonetas.length) {
      toast('No hay furgonetas activas', 'warning');
      hideLoading();
      return;
    }

    // 3. Cargar todo el stock (con mínimos)
    const { data: todoStock } = await sb.from('stock')
      .select('*, articulos(id, codigo, nombre, precio_coste)')
      .eq('empresa_id', EMPRESA.id);

    if (!todoStock) {
      toast('No se pudo cargar el stock', 'error');
      hideLoading();
      return;
    }

    // Stock del almacén central indexado por articulo_id
    const stockCentral = {};
    todoStock.filter(s => s.almacen_id === central.id).forEach(s => {
      stockCentral[s.articulo_id] = s;
    });

    let traspasosCreados = 0;
    let totalLineas = 0;

    // 4. Para cada furgoneta, calcular qué falta
    for (const furg of furgonetas) {
      const stockFurg = todoStock.filter(s => s.almacen_id === furg.id);
      const lineasRepo = [];

      for (const s of stockFurg) {
        const minimo = s.stock_minimo || 0;
        if (minimo <= 0) continue; // Sin mínimo definido, saltar

        const actual = (s.cantidad || 0) + (s.stock_provisional || 0);
        if (actual >= minimo) continue; // Tiene suficiente

        const falta = minimo - actual;
        if (falta <= 0) continue;

        // Verificar si hay en el central
        const enCentral = stockCentral[s.articulo_id]?.cantidad || 0;
        const art = s.articulos || {};

        lineasRepo.push({
          articulo_id: s.articulo_id,
          codigo: art.codigo || '—',
          nombre: art.nombre || 'Artículo ' + s.articulo_id,
          cantidad: Math.min(falta, enCentral), // No pedir más de lo que hay
          cantidad_necesaria: falta,
          cantidad_disponible_central: enCentral,
          precio: art.precio_coste || 0
        });
      }

      // Filtrar líneas con cantidad > 0 (hay material en central)
      const lineasConStock = lineasRepo.filter(l => l.cantidad > 0);
      const lineasSinStock = lineasRepo.filter(l => l.cantidad <= 0);

      if (lineasConStock.length === 0 && lineasSinStock.length === 0) continue;

      // 5. Crear traspaso pendiente
      const numero = `REPO-${new Date().toISOString().slice(0,10)}-${furg.nombre.replace(/\s+/g, '-').toUpperCase()}`;

      // Verificar si ya existe un traspaso de reposición para hoy y esta furgoneta
      const { data: existente } = await sb.from('traspasos')
        .select('id')
        .eq('empresa_id', EMPRESA.id)
        .eq('estado', 'pendiente')
        .like('numero', `REPO-${new Date().toISOString().slice(0,10)}-${furg.nombre.replace(/\s+/g, '-').toUpperCase()}%`)
        .limit(1);

      if (existente?.length) {
        console.log(`[Reposición] Ya existe traspaso pendiente para ${furg.nombre} hoy`);
        continue;
      }

      // Observaciones con detalles de lo que falta en central
      let obs = `Reposición automática generada el ${new Date().toLocaleDateString()}`;
      if (lineasSinStock.length > 0) {
        obs += `\n\n⚠️ SIN STOCK EN CENTRAL (${lineasSinStock.length}):\n`;
        obs += lineasSinStock.map(l => `• ${l.nombre}: necesita ${l.cantidad_necesaria}, central: 0`).join('\n');
      }

      const { error: errTrasp } = await sb.from('traspasos').insert({
        empresa_id: EMPRESA.id,
        numero: numero,
        almacen_origen_id: central.id,
        almacen_destino_id: furg.id,
        almacen_origen_nombre: central.nombre,
        almacen_destino_nombre: furg.nombre,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'pendiente',
        lineas: lineasConStock,
        observaciones: obs,
        usuario_id: CU?.id || null,
        usuario_nombre: CU?.nombre || 'Sistema (reposición automática)'
      });

      if (!errTrasp) {
        traspasosCreados++;
        totalLineas += lineasConStock.length;
      } else {
        console.error(`[Reposición] Error creando traspaso para ${furg.nombre}:`, errTrasp.message);
      }
    }

    // 6. Revisar stock central — alertas de bajo mínimo
    const stockCentralItems = todoStock.filter(s => s.almacen_id === central.id);
    const alertasCentral = [];

    for (const s of stockCentralItems) {
      const minimo = s.stock_minimo || 0;
      if (minimo <= 0) continue;

      // Calcular cuánto se va a sacar con los traspasos de reposición creados
      // (el stock real aún no se descuenta, solo se mira la situación proyectada)
      const cantActual = s.cantidad || 0;
      if (cantActual < minimo) {
        const art = s.articulos || {};
        alertasCentral.push({
          articulo_id: s.articulo_id,
          codigo: art.codigo || '—',
          nombre: art.nombre || 'Artículo',
          cantidad_actual: cantActual,
          stock_minimo: minimo,
          faltan: minimo - cantActual
        });
      }
    }

    // Crear tareas pendientes para pedidos si hay alertas
    if (alertasCentral.length > 0) {
      const resumenAlerta = alertasCentral.map(a => `• ${a.nombre} (${a.codigo}): tiene ${a.cantidad_actual}, mín ${a.stock_minimo}, faltan ${a.faltan}`).join('\n');

      await sb.from('tareas_pendientes').insert({
        empresa_id: EMPRESA.id,
        entidad_tipo: 'stock_bajo',
        entidad_id: central.id,
        entidad_nombre: central.nombre,
        titulo: `⚠️ ${alertasCentral.length} artículo(s) bajo mínimo en ${central.nombre}`,
        campos_faltantes: alertasCentral.map(a => `${a.nombre}: faltan ${a.faltan}`),
        origen: 'auto',
        rol_asignado: 'admin',
        estado: 'pendiente',
        usuario_creador_id: CU?.id || null
      });
    }

    hideLoading();

    if (traspasosCreados > 0) {
      toast(`✅ ${traspasosCreados} traspaso(s) de reposición creado(s) con ${totalLineas} líneas`, 'success');
      if (alertasCentral.length > 0) {
        toast(`⚠️ ${alertasCentral.length} artículo(s) bajo mínimo en ${central.nombre} — revisar pedidos`, 'warning');
      }
      await loadTraspasos();
    } else if (alertasCentral.length > 0) {
      toast(`⚠️ Furgonetas OK, pero ${alertasCentral.length} artículo(s) bajo mínimo en ${central.nombre}`, 'warning');
    } else {
      toast('✅ Todo OK: no hay material bajo mínimo', 'success');
    }

  } catch(e) {
    hideLoading();
    console.error('[Reposición]', e);
    toast('Error generando reposición: ' + (e.message || e), 'error');
  }
}

// Auto-inicializar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTraspasos);
} else {
  initTraspasos();
}
