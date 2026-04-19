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
  const tbody = document.getElementById('traspasos-table');
  if (!tbody) return;

  tbody.innerHTML = list.map(row => {
    const badgeColors = { pendiente:'#F97316', preparado:'#3B82F6', completado:'#16A34A', anulado:'#DC2626' };
    const badgeLabels = { pendiente:'Pendiente', preparado:'📦 Preparado', completado:'✅ Completado', anulado:'Anulado' };

    const lineCount = (row.lineas || []).length;
    const totalQty = (row.lineas || []).reduce((sum, l) => sum + (l.cantidad || 0), 0);

    return `
      <tr style="cursor:pointer" onclick="editTraspaso(${row.id})">
        <td><strong>${row.numero}</strong></td>
        <td>${new Date(row.fecha).toLocaleDateString()}</td>
        <td>${row.almacen_origen_nombre}</td>
        <td>→</td>
        <td>${row.almacen_destino_nombre}</td>
        <td style="text-align:right">${lineCount} líneas / ${totalQty} uds</td>
        <td>
          <span style="display:inline-block;padding:3px 10px;border-radius:12px;color:#fff;font-size:11px;font-weight:700;background:${badgeColors[row.estado]||'#888'}">
            ${badgeLabels[row.estado]||row.estado}
          </span>
        </td>
        <td class="text-center" onclick="event.stopPropagation()">
          <button class="btn-sm" onclick="editTraspaso(${row.id})">📋 Detalle</button>
          <button class="btn-sm btn-outline" onclick="delTraspaso(${row.id})">🗑️</button>
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

  const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  _s('kpi-total-traspasos', totalTraspasos);
  _s('kpi-pendientes', pendientes);
  _s('kpi-completados-mes', completadosMes);
  _s('kpi-valor-traspasos', fmtE(valorTraspasos));
}

// Abrir modal para nuevo traspaso
function nuevoTraspasoModal() {
  lineasTrasp = [];
  // Poblar selects de almacenes
  const opts = almacenes.filter(a => a.activo !== false).map(a => {
    const icon = a.tipo === 'furgoneta' ? '🚐' : a.tipo === 'externo' ? '📦' : '🏭';
    return `<option value="${a.id}">${icon} ${a.nombre}</option>`;
  }).join('');
  const selOrigen = document.getElementById('trasp-origen');
  const selDestino = document.getElementById('trasp-destino');
  if (selOrigen) selOrigen.innerHTML = '<option value="">Seleccionar origen...</option>' + opts;
  if (selDestino) selDestino.innerHTML = '<option value="">Seleccionar destino...</option>' + opts;
  setVal({
    'trasp-origen': '',
    'trasp-destino': '',
    'trasp-observaciones': '',
    'trasp-articulo-buscar': '',
    'trasp-articulo-id': '',
    'trasp-cantidad': '1'
  });
  tr_renderLineasTrasp();
  openModal('modal-nuevo-trasp');
}

// Buscar artículo para traspaso
function tr_buscarArticulo(texto) {
  const cont = document.getElementById('trasp-articulo-sugerencias');
  if (!cont) return;
  if (!texto || texto.length < 2) { cont.innerHTML = ''; return; }
  const txt = texto.toLowerCase();
  const results = articulos.filter(a => a.activo !== false &&
    ((a.nombre||'').toLowerCase().includes(txt) || (a.codigo||'').toLowerCase().includes(txt))
  ).slice(0, 8);
  cont.innerHTML = results.length ? `<div style="position:absolute;z-index:100;background:#fff;border:1px solid var(--gris-200);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:100%;max-height:200px;overflow-y:auto">
    ${results.map(a => `<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--gris-100)"
      onclick="tr_selArticulo(${a.id},'${(a.nombre||'').replace(/'/g,"\\'")}','${a.codigo||''}')">
      <span style="font-family:monospace;color:var(--azul);font-weight:700;font-size:11px">${a.codigo}</span> ${a.nombre}
    </div>`).join('')}
  </div>` : '';
}

function tr_selArticulo(id, nombre, codigo) {
  setVal({ 'trasp-articulo-id': id, 'trasp-articulo-buscar': `${codigo} — ${nombre}` });
  document.getElementById('trasp-articulo-sugerencias').innerHTML = '';
  document.getElementById('trasp-cantidad')?.focus();
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

// Marcar traspaso como en tránsito
async function marcarPreparado(traspId) {
  const id = traspId || _detalleTraspId;
  if (!id) return;
  const trasp = traspasosData.find(t => t.id === id);
  if (!trasp || trasp.estado !== 'pendiente') { toast('Solo se pueden preparar traspasos pendientes','warning'); return; }
  const okPrep = await confirmModal({titulo:'Marcar preparado',mensaje:'¿Marcar como Preparado?',aviso:'El material se descuenta del central y se deja en la estantería del operario',btnOk:'Marcar preparado'}); if (!okPrep) return;

  try {
    // Al marcar en tránsito: restamos del central (sale el material)
    for (const linea of trasp.lineas || []) {
      const { data: stockOrigen } = await sb.from('stock').select('*')
        .eq('empresa_id', EMPRESA.id).eq('articulo_id', linea.articulo_id)
        .eq('almacen_id', trasp.almacen_origen_id).single();

      if (stockOrigen) {
        await sb.from('stock').update({
          cantidad: Math.max(0, (stockOrigen.cantidad||0) - linea.cantidad),
          updated_at: new Date().toISOString()
        }).eq('id', stockOrigen.id);

        await sb.from('movimientos_stock').insert({
          empresa_id: EMPRESA.id, articulo_id: linea.articulo_id,
          almacen_id: trasp.almacen_origen_id, tipo: 'traspaso_salida',
          delta: -linea.cantidad, notas: `Salida traspaso → ${trasp.almacen_destino_nombre} (${trasp.numero})`,
          fecha: new Date().toISOString().slice(0,10),
          usuario_id: CU?.id||null, usuario_nombre: CU?.nombre||'Sistema'
        });
      }
    }

    await sb.from('traspasos').update({ estado: 'preparado' }).eq('id', id);
    toast('📦 Traspaso preparado — stock descontado del central, material en estantería', 'success');
    closeModal('modal-detalle-trasp');
    await loadTraspasos();
  } catch (e) {
    console.error('Error marcando en tránsito:', e);
    toast('Error: ' + e.message, 'error');
  }
}

// Completar traspaso (recepción en destino)
async function completarTraspaso(traspId) {
  const id = traspId || _detalleTraspId;
  if (!id) return;
  const trasp = traspasosData.find(t => t.id === id);
  if (!trasp) return;

  if (trasp.estado === 'completado') { toast('Ya está completado','warning'); return; }
  const okComp = await confirmModal({titulo:'Completar traspaso',mensaje:'¿Completar traspaso?',aviso:'Se sumará el stock en el almacén destino',btnOk:'Completar'}); if (!okComp) return;

  try {
    const yaDescontadoOrigen = (trasp.estado === 'preparado');

    for (const linea of trasp.lineas || []) {
      // Si viene de pendiente (no pasó por preparado), restar del origen
      if (!yaDescontadoOrigen) {
        const { data: stockOrigen } = await sb.from('stock').select('*')
          .eq('empresa_id', EMPRESA.id).eq('articulo_id', linea.articulo_id)
          .eq('almacen_id', trasp.almacen_origen_id).single();

        if (stockOrigen) {
          await sb.from('stock').update({
            cantidad: Math.max(0, (stockOrigen.cantidad||0) - linea.cantidad),
            updated_at: new Date().toISOString()
          }).eq('id', stockOrigen.id);

          await sb.from('movimientos_stock').insert({
            empresa_id: EMPRESA.id, articulo_id: linea.articulo_id,
            almacen_id: trasp.almacen_origen_id, tipo: 'traspaso_salida',
            delta: -linea.cantidad, notas: `Salida traspaso → ${trasp.almacen_destino_nombre} (${trasp.numero})`,
            fecha: new Date().toISOString().slice(0,10),
            usuario_id: CU?.id||null, usuario_nombre: CU?.nombre||'Sistema'
          });
        }
      }

      // Sumar al destino
      const { data: stockDestino } = await sb.from('stock').select('*')
        .eq('empresa_id', EMPRESA.id).eq('articulo_id', linea.articulo_id)
        .eq('almacen_id', trasp.almacen_destino_id).single();

      if (stockDestino) {
        await sb.from('stock').update({
          cantidad: (stockDestino.cantidad||0) + linea.cantidad,
          updated_at: new Date().toISOString()
        }).eq('id', stockDestino.id);
      } else {
        await sb.from('stock').insert({
          empresa_id: EMPRESA.id, articulo_id: linea.articulo_id,
          almacen_id: trasp.almacen_destino_id, cantidad: linea.cantidad,
          stock_minimo: 0, updated_at: new Date().toISOString()
        });
      }

      await sb.from('movimientos_stock').insert({
        empresa_id: EMPRESA.id, articulo_id: linea.articulo_id,
        almacen_id: trasp.almacen_destino_id, tipo: 'traspaso_entrada',
        delta: linea.cantidad, notas: `Entrada traspaso ← ${trasp.almacen_origen_nombre} (${trasp.numero})`,
        fecha: new Date().toISOString().slice(0,10),
        usuario_id: CU?.id||null, usuario_nombre: CU?.nombre||'Sistema'
      });
    }

    await sb.from('traspasos').update({ estado: 'completado' }).eq('id', id);
    toast('✅ Traspaso completado — stock actualizado en destino', 'success');
    closeModal('modal-detalle-trasp');
    await loadTraspasos();
  } catch (e) {
    console.error('Error completando traspaso:', e);
    toast('Error: ' + e.message, 'error');
  }
}

// Anular traspaso
async function anularTraspaso(traspId) {
  const id = traspId || _detalleTraspId;
  if (!id) return;
  const trasp = traspasosData.find(t => t.id === id);
  if (!trasp) return;
  if (trasp.estado === 'completado') { toast('No se puede anular un traspaso completado','warning'); return; }
  const okAnul = await confirmModal({titulo:'Anular traspaso',mensaje:'¿Anular este traspaso?',aviso:'Si estaba preparado, se devolverá el stock al origen',btnOk:'Anular',colorOk:'#dc2626'}); if (!okAnul) return;

  try {
    // Si estaba en tránsito, devolver stock al origen
    if (trasp.estado === 'preparado') {
      for (const linea of trasp.lineas || []) {
        const { data: stockOrigen } = await sb.from('stock').select('*')
          .eq('empresa_id', EMPRESA.id).eq('articulo_id', linea.articulo_id)
          .eq('almacen_id', trasp.almacen_origen_id).single();

        if (stockOrigen) {
          await sb.from('stock').update({
            cantidad: (stockOrigen.cantidad||0) + linea.cantidad,
            updated_at: new Date().toISOString()
          }).eq('id', stockOrigen.id);

          await sb.from('movimientos_stock').insert({
            empresa_id: EMPRESA.id, articulo_id: linea.articulo_id,
            almacen_id: trasp.almacen_origen_id, tipo: 'anulacion_traspaso',
            delta: linea.cantidad, notas: `Anulación traspaso ${trasp.numero} — stock devuelto`,
            fecha: new Date().toISOString().slice(0,10),
            usuario_id: CU?.id||null, usuario_nombre: CU?.nombre||'Sistema'
          });
        }
      }
    }

    await sb.from('traspasos').update({ estado: 'anulado' }).eq('id', id);
    toast('Traspaso anulado', 'success');
    closeModal('modal-detalle-trasp');
    await loadTraspasos();
  } catch (e) {
    console.error('Error anulando traspaso:', e);
    toast('Error: ' + e.message, 'error');
  }
}

// Borrar traspaso
async function delTraspaso(traspId) {
  const okDel = await confirmModal({titulo:'Borrar traspaso',mensaje:'¿Borrar este traspaso?',aviso:'Esta acción no se puede deshacer',btnOk:'Borrar',colorOk:'#dc2626'}); if (!okDel) return;

  try {
    await sb.from('traspasos').delete().eq('id', traspId);

    toast('Traspaso borrado', 'success');
    await loadTraspasos();
  } catch (e) {
    console.error('Error borrando traspaso:', e);
    toast('Error borrando traspaso: ' + e.message, 'error');
  }
}

// Variable para el traspaso que se está viendo en detalle
let _detalleTraspId = null;

// Editar/Ver detalle del traspaso
function editTraspaso(traspId) {
  const trasp = traspasosData.find(t => t.id === traspId);
  if (!trasp) { toast('Traspaso no encontrado','error'); return; }
  _detalleTraspId = traspId;

  const _t = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  _t('dt-numero', trasp.numero);
  _t('dt-origen', trasp.almacen_origen_nombre);
  _t('dt-destino', trasp.almacen_destino_nombre);
  _t('dt-fecha', new Date(trasp.fecha).toLocaleDateString());
  _t('dt-usuario', trasp.usuario_nombre || 'Sistema');

  // Badge de estado
  const dtEstado = document.getElementById('dt-estado');
  if (dtEstado) {
    const colores = { pendiente:'#F97316', preparado:'#3B82F6', completado:'#16A34A', anulado:'#DC2626' };
    const etiquetas = { pendiente:'Pendiente', preparado:'Preparado', completado:'Completado', anulado:'Anulado' };
    dtEstado.innerHTML = `<span style="display:inline-block;padding:3px 10px;border-radius:12px;color:#fff;font-size:12px;font-weight:700;background:${colores[trasp.estado]||'#888'}">${etiquetas[trasp.estado]||trasp.estado}</span>`;
  }

  // Líneas
  const tbody = document.getElementById('dt-lineas-tbody');
  if (tbody) {
    tbody.innerHTML = (trasp.lineas || []).map(l => `<tr>
      <td style="font-family:monospace;font-size:12px">${l.codigo||'—'}</td>
      <td>${l.nombre||'—'}</td>
      <td style="text-align:right;font-weight:600">${l.cantidad||0}</td>
      <td style="text-align:right;color:#888">${l.cantidad_necesaria!=null?l.cantidad_necesaria:'—'}</td>
      <td style="text-align:right;color:#888">${l.cantidad_disponible_central!=null?l.cantidad_disponible_central:'—'}</td>
    </tr>`).join('');
  }
  const totalQty = (trasp.lineas||[]).reduce((s,l) => s+(l.cantidad||0), 0);
  _t('dt-total-qty', totalQty);

  // Observaciones
  const obsWrap = document.getElementById('dt-observaciones-wrap');
  const obsDiv = document.getElementById('dt-observaciones');
  if (obsWrap && obsDiv) {
    if (trasp.observaciones) { obsWrap.style.display = ''; obsDiv.textContent = trasp.observaciones; }
    else { obsWrap.style.display = 'none'; }
  }

  // Mostrar/ocultar botones según estado
  const btnTransito = document.getElementById('dt-btn-transito');
  const btnCompletar = document.getElementById('dt-btn-completar');
  const btnAnular = document.getElementById('dt-btn-anular');
  if (btnTransito) btnTransito.style.display = trasp.estado === 'pendiente' ? '' : 'none';
  if (btnCompletar) btnCompletar.style.display = (trasp.estado === 'pendiente' || trasp.estado === 'preparado') ? '' : 'none';
  if (btnAnular) btnAnular.style.display = (trasp.estado !== 'completado' && trasp.estado !== 'anulado') ? '' : 'none';

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
    toast('🔄 Calculando reposición...', 'info');

    // 1. Buscar almacén central (origen)
    const central = almacenes.find(a => a.tipo === 'central' && a.activo !== false);
    if (!central) {
      toast('No se encontró un almacén central activo', 'error');
      // loading done
      return;
    }

    // 2. Buscar todas las furgonetas activas
    const furgonetas = almacenes.filter(a => a.tipo === 'furgoneta' && a.activo !== false);
    if (!furgonetas.length) {
      toast('No hay furgonetas activas', 'warning');
      // loading done
      return;
    }

    // 3. Cargar todo el stock (con mínimos)
    const { data: todoStock } = await sb.from('stock')
      .select('*, articulos(id, codigo, nombre, precio_coste)')
      .eq('empresa_id', EMPRESA.id);

    if (!todoStock) {
      toast('No se pudo cargar el stock', 'error');
      // loading done
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
        const maximo = s.stock_maximo || 0;
        if (minimo <= 0) continue; // Sin mínimo definido, saltar

        const actual = (s.cantidad || 0) + (s.stock_provisional || 0);
        if (actual >= minimo) continue; // Tiene suficiente, no reponer

        // Reponer hasta el máximo (o hasta el mínimo si no hay máximo definido)
        const objetivo = maximo > minimo ? maximo : minimo;
        const falta = objetivo - actual;
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
          stock_actual: actual,
          stock_minimo: minimo,
          stock_maximo: objetivo,
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

    // loading done

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
    // loading done
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
