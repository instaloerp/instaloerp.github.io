/**
 * PREVIEW GENÉRICO DE DOCUMENTOS DE COMPRAS — build 138
 *
 * Unifica el patrón que ya usa Ventas (clic fila → modal preview → botón Editar → editor)
 * para los 4 tipos de Compras:
 *   - prc: presupuestos_compra
 *   - pc:  pedidos_compra
 *   - rc:  recepciones
 *   - fp:  facturas_proveedor
 *
 * La función pinta un modal dinámico con la misma estructura visual que Ventas:
 *   header con número + proveedor + pildora de estado (candado si bloqueado)
 *   + botones de acción (Imprimir/PDF, Enviar, Editar, Estado, Anular)
 *   + cuadros de datos (fecha, campos específicos, total)
 *   + tabla de líneas + totales
 *   + observaciones
 *   + badges cruzados de la cadena (obra/presupuesto/pedido/recepción/factura)
 *
 * Al pulsar "Editar" cierra el preview y abre el editor completo existente.
 * Es seguro llamar desde cualquier pantalla (ficha de obra incluida): al cerrar el
 * modal el usuario permanece en la pantalla desde la que lo abrió.
 */

// ──────────────────────────────────────────────────
// CONFIG POR TIPO
// ──────────────────────────────────────────────────
const PREVIEW_CONFIG = {
  prc: {
    tabla: 'presupuestos_compra',
    iconHeader: '📋',
    arrGetter: () => (typeof presupuestosCompra !== 'undefined' ? presupuestosCompra : []),
    arrPush:   (d) => { if (typeof presupuestosCompra !== 'undefined') presupuestosCompra.push(d); },
    estadosMap: () => (typeof PRC_ESTADOS !== 'undefined' ? PRC_ESTADOS : {}),
    editar: (id) => editarPresupuestoCompra(id),
    imprimir: (id) => (typeof imprimirPresupuestoCompra === 'function' ? imprimirPresupuestoCompra(id) : null),
    enviar: (id) => (typeof enviarPresupuestoCompraEmail === 'function' ? enviarPresupuestoCompraEmail(id) : null),
    anular: (id) => (typeof eliminarPresupuestoCompra === 'function' ? eliminarPresupuestoCompra(id) : null),
    camposHeader: (d) => [
      { label:'Fecha',        val: d.fecha ? new Date(d.fecha).toLocaleDateString('es-ES') : '—' },
      { label:'Válido hasta', val: d.fecha_validez ? new Date(d.fecha_validez).toLocaleDateString('es-ES') : '—' },
      { label:'Título',       val: d.titulo || '—' },
    ],
    hayIva: true,
  },
  pc: {
    tabla: 'pedidos_compra',
    iconHeader: '📦',
    arrGetter: () => (typeof pedidosCompra !== 'undefined' ? pedidosCompra : []),
    arrPush:   (d) => { if (typeof pedidosCompra !== 'undefined') pedidosCompra.push(d); },
    estadosMap: () => (typeof PC_ESTADOS !== 'undefined' ? PC_ESTADOS : {}),
    editar: (id) => editarPedidoCompra(id),
    imprimir: (id) => (typeof imprimirPedidoCompra === 'function' ? imprimirPedidoCompra(id) : null),
    enviar: (id) => (typeof enviarPedidoCompraEmail === 'function' ? enviarPedidoCompraEmail(id) : null),
    anular: (id) => (typeof delPedidoCompra === 'function' ? delPedidoCompra(id) : null),
    camposHeader: (d) => [
      { label:'Fecha',         val: d.fecha ? new Date(d.fecha).toLocaleDateString('es-ES') : '—' },
      { label:'Entrega prev.', val: d.fecha_entrega_prevista ? new Date(d.fecha_entrega_prevista).toLocaleDateString('es-ES') : '—' },
      { label:'Título',        val: d.titulo || '—' },
    ],
    hayIva: true,
  },
  rc: {
    tabla: 'recepciones',
    iconHeader: '📥',
    arrGetter: () => (typeof recepciones !== 'undefined' ? recepciones : []),
    arrPush:   (d) => { if (typeof recepciones !== 'undefined') recepciones.push(d); },
    estadosMap: () => (typeof RC_ESTADOS !== 'undefined' ? RC_ESTADOS : {}),
    editar: (id) => editarRecepcion(id),
    imprimir: (id) => (typeof imprimirRecepcion === 'function' ? imprimirRecepcion(id) : null),
    enviar: (id) => (typeof enviarRecepcionEmail === 'function' ? enviarRecepcionEmail(id) : null),
    anular: (id) => (typeof delRecepcion === 'function' ? delRecepcion(id) : null),
    camposHeader: (d) => [
      { label:'Fecha recepción',  val: d.fecha ? new Date(d.fecha).toLocaleDateString('es-ES') : '—' },
      { label:'Albarán proveedor',val: d.numero_albaran_proveedor || '—' },
      { label:'Almacén',          val: _prevAlmacenLabel(d.almacen_id) },
    ],
    hayIva: false,
  },
  fp: {
    tabla: 'facturas_proveedor',
    iconHeader: '🧾',
    arrGetter: () => (typeof facturasProveedor !== 'undefined' ? facturasProveedor : []),
    arrPush:   (d) => { if (typeof facturasProveedor !== 'undefined') facturasProveedor.push(d); },
    estadosMap: () => (typeof FP_ESTADOS !== 'undefined' ? FP_ESTADOS : {}),
    estadoEfectivo: (d) => (typeof _fpEstadoEfectivo === 'function' ? _fpEstadoEfectivo(d) : d.estado),
    editar: (id) => editarFacturaProv(id),
    imprimir: (id) => (typeof imprimirFacturaProv === 'function' ? imprimirFacturaProv(id) : null),
    enviar: (id) => (typeof enviarFacturaProvEmail === 'function' ? enviarFacturaProvEmail(id) : null),
    anular: (id) => (typeof delFacturaProv === 'function' ? delFacturaProv(id) : null),
    camposHeader: (d) => [
      { label:'Fecha emisión', val: d.fecha ? new Date(d.fecha).toLocaleDateString('es-ES') : '—' },
      { label:'Nº factura prov.', val: d.numero_factura_proveedor || '—' },
      { label:'Vencimiento',   val: d.fecha_vencimiento ? new Date(d.fecha_vencimiento).toLocaleDateString('es-ES') : '—' },
    ],
    hayIva: true,
  },
};

// ──────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────
function _prevAlmacenLabel(almacenId) {
  if (!almacenId) return '—';
  const arr = (typeof almacenes !== 'undefined' ? almacenes : []);
  const a = arr.find(x => x.id === almacenId);
  return a ? (a.nombre || a.codigo || ('#' + almacenId)) : ('#' + almacenId);
}

function _prevProveedor(d) {
  const provs = (typeof proveedores !== 'undefined' ? proveedores : []);
  const p = provs.find(x => x.id === d.proveedor_id);
  return p ? (p.nombre || p.razon_social || ('Proveedor #' + d.proveedor_id)) : (d.proveedor_nombre || '—');
}

function _prevFmtE(n) {
  if (typeof fmtE === 'function') return fmtE(n||0);
  return (Number(n||0)).toLocaleString('es-ES', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
}

// Hidrata el documento desde DB si no está en el array global aún
async function _prevHidratarSiHaceFalta(tipo, id) {
  const cfg = PREVIEW_CONFIG[tipo];
  const arr = cfg.arrGetter();
  const existe = arr.find(x => x.id === id);
  if (existe) return existe;
  const { data, error } = await sb.from(cfg.tabla).select('*').eq('id', id).single();
  if (error || !data) { if (typeof toast==='function') toast('No se pudo cargar el documento'); return null; }
  cfg.arrPush(data);
  return data;
}

// Pildora de estado con candado si está bloqueado
function _prevPildoraEstado(cfg, d) {
  const estadoReal = cfg.estadoEfectivo ? cfg.estadoEfectivo(d) : d.estado;
  const map = cfg.estadosMap();
  const ec = map[estadoReal] || { ico:'?', label: estadoReal || '—', color:'var(--gris-500)', bg:'var(--gris-100)' };
  const bloqueado = !!d.exportado_bloqueado;
  const candado = bloqueado ? '🔒 ' : '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;color:${ec.color};background:${ec.bg};border:${bloqueado?'1.5px solid '+ec.color:'none'}">${candado}${ec.ico} ${ec.label}</span>`;
}

// Badges cruzados (cadena)
function _prevBadgesCadena(tipo, d) {
  const prcs = (typeof presupuestosCompra !== 'undefined' ? presupuestosCompra : []);
  const pcs  = (typeof pedidosCompra       !== 'undefined' ? pedidosCompra       : []);
  const rcs  = (typeof recepciones         !== 'undefined' ? recepciones         : []);
  const fps  = (typeof facturasProveedor   !== 'undefined' ? facturasProveedor   : []);
  const st = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer';
  let out = '';
  // Obra ligada si existe
  if (d.obra_id) {
    const obras = (typeof trabajos !== 'undefined' ? trabajos : []);
    const o = obras.find(x => x.id === d.obra_id);
    if (o) out += `<a href="#" onclick="event.preventDefault();_prevCerrar();goPage('trabajos');abrirFichaObra(${o.id})" style="${st};background:#FEF3C7;color:#92400E">🏗️ ${o.numero||('Obra '+o.id)}</a> `;
  }
  if (tipo === 'prc') {
    const pedidos = pcs.filter(x => x.presupuesto_compra_id === d.id);
    pedidos.forEach(p => out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('pc',${p.id})" style="${st}">📦 Pedido ${p.numero||''}</a> `);
    const pedIds = pedidos.map(p => p.id);
    const recs = rcs.filter(r => r.presupuesto_compra_id === d.id || (r.pedido_compra_id && pedIds.includes(r.pedido_compra_id)));
    recs.forEach(r => out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('rc',${r.id})" style="${st}">📥 Albarán ${r.numero||''}</a> `);
    const recIds = recs.map(r => r.id);
    const facs = fps.filter(f => f.presupuesto_compra_id === d.id || (f.pedido_compra_id && pedIds.includes(f.pedido_compra_id)) || (f.recepcion_id && recIds.includes(f.recepcion_id)));
    facs.forEach(f => out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('fp',${f.id})" style="${st}">🧾 Factura ${f.numero||''}</a> `);
  } else if (tipo === 'pc') {
    if (d.presupuesto_compra_id) {
      const pr = prcs.find(x => x.id === d.presupuesto_compra_id);
      if (pr) out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('prc',${pr.id})" style="${st}">📋 Presup. ${pr.numero||''}</a> `;
    }
    const recs = rcs.filter(r => r.pedido_compra_id === d.id);
    recs.forEach(r => out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('rc',${r.id})" style="${st}">📥 Albarán ${r.numero||''}</a> `);
    const recIds = recs.map(r => r.id);
    const facs = fps.filter(f => f.pedido_compra_id === d.id || (f.recepcion_id && recIds.includes(f.recepcion_id)));
    facs.forEach(f => out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('fp',${f.id})" style="${st}">🧾 Factura ${f.numero||''}</a> `);
  } else if (tipo === 'rc') {
    if (d.pedido_compra_id) {
      const pc = pcs.find(x => x.id === d.pedido_compra_id);
      if (pc) out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('pc',${pc.id})" style="${st}">📦 Pedido ${pc.numero||''}</a> `;
    }
    if (d.presupuesto_compra_id) {
      const pr = prcs.find(x => x.id === d.presupuesto_compra_id);
      if (pr) out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('prc',${pr.id})" style="${st}">📋 Presup. ${pr.numero||''}</a> `;
    }
    const facs = fps.filter(f => f.recepcion_id === d.id || (Array.isArray(f.recepcion_ids) && f.recepcion_ids.includes(d.id)));
    facs.forEach(f => out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('fp',${f.id})" style="${st}">🧾 Factura ${f.numero||''}</a> `);
  } else if (tipo === 'fp') {
    if (d.recepcion_id) {
      const r = rcs.find(x => x.id === d.recepcion_id);
      if (r) out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('rc',${r.id})" style="${st}">📥 Albarán ${r.numero||''}</a> `;
    }
    if (d.pedido_compra_id) {
      const pc = pcs.find(x => x.id === d.pedido_compra_id);
      if (pc) out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('pc',${pc.id})" style="${st}">📦 Pedido ${pc.numero||''}</a> `;
    }
    if (d.presupuesto_compra_id) {
      const pr = prcs.find(x => x.id === d.presupuesto_compra_id);
      if (pr) out += `<a href="#" onclick="event.preventDefault();_prevCerrar();previewDoc('prc',${pr.id})" style="${st}">📋 Presup. ${pr.numero||''}</a> `;
    }
  }
  return out;
}

// Calcula totales a partir de líneas (si el doc no los trae pre-calculados)
function _prevCalcTotales(lineas, hayIva) {
  let base=0, ivaTot=0;
  (lineas||[]).forEach(l => {
    if (l.tipo === 'capitulo') return;
    const sub = (Number(l.cant)||0) * (Number(l.precio)||0) * (1 - ((Number(l.dto)||0)/100));
    base += sub;
    if (hayIva) ivaTot += sub * ((Number(l.iva)||0)/100);
  });
  return { base, ivaTot, total: base + ivaTot };
}

// ──────────────────────────────────────────────────
// CIERRE DEL MODAL
// ──────────────────────────────────────────────────
function _prevCerrar() {
  const m = document.getElementById('mPreviewDoc');
  if (m) m.remove();
  // Restaurar scroll solo si no hay otros modales abiertos
  const otros = document.querySelectorAll('.overlay.open').length;
  if (!otros) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

// ──────────────────────────────────────────────────
// API PÚBLICA
// ──────────────────────────────────────────────────
async function previewDoc(tipo, id) {
  const cfg = PREVIEW_CONFIG[tipo];
  if (!cfg) { console.warn('previewDoc: tipo desconocido', tipo); return; }
  const d = await _prevHidratarSiHaceFalta(tipo, id);
  if (!d) return;

  _prevCerrar(); // por si hubiera otro abierto

  const proveedor = _prevProveedor(d);
  const lineas = d.lineas || [];
  const { base, ivaTot, total } = _prevCalcTotales(lineas, cfg.hayIva);
  const baseShow = d.base_imponible != null ? Number(d.base_imponible) : base;
  const ivaShow  = d.total_iva      != null ? Number(d.total_iva)      : ivaTot;
  const totalShow= d.total          != null ? Number(d.total)          : total;

  const campos = cfg.camposHeader(d);
  const camposHtml = campos.map(c => `
    <div style="background:var(--gris-50);border-radius:8px;padding:12px">
      <div style="font-size:11px;color:var(--gris-400);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${c.label}</div>
      <div style="font-weight:700;font-size:12.5px">${c.val}</div>
    </div>`).join('') + `
    <div style="background:var(--azul-light);border-radius:8px;padding:12px">
      <div style="font-size:11px;color:var(--azul);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Total</div>
      <div style="font-weight:800;font-size:18px;color:var(--azul)">${_prevFmtE(totalShow)}</div>
    </div>`;

  const lineasHtml = (lineas.length ? lineas.map(l => {
    if (l.tipo === 'capitulo') {
      return `<tr style="background:var(--azul-light);border-top:2px solid var(--azul)">
        <td colspan="6" style="padding:8px 10px;font-weight:700;font-size:13px;color:var(--azul)">📁 ${l.titulo||''}</td>
      </tr>`;
    }
    const sub = (Number(l.cant)||0)*(Number(l.precio)||0)*(1-((Number(l.dto)||0)/100));
    const iv  = cfg.hayIva ? sub * ((Number(l.iva)||0)/100) : 0;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:8px 10px;font-size:13px">${l.desc || l.articulo_descripcion || '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.cant||0}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${_prevFmtE(l.precio||0)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.dto?l.dto+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${cfg.hayIva ? (l.iva!=null?l.iva+'%':'—') : '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">${_prevFmtE(sub+iv)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--gris-400);font-size:12px">Sin líneas</td></tr>`);

  const obsHtml = d.observaciones ? `
    <div style="margin-top:12px;padding:12px;background:var(--gris-50);border-radius:8px">
      <div style="font-size:11px;font-weight:700;color:var(--gris-400);text-transform:uppercase;margin-bottom:4px">Observaciones</div>
      <div style="font-size:13px;color:var(--gris-600);white-space:pre-wrap">${d.observaciones}</div>
    </div>` : '';

  const badgesHtml = _prevBadgesCadena(tipo, d);
  const badgesWrap = badgesHtml ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">${badgesHtml}</div>` : '';

  const pildora = _prevPildoraEstado(cfg, d);

  // Botones de cabecera (visibilidad según tipo/estado)
  const btnImprimir = cfg.imprimir ? `<button class="btn btn-secondary btn-sm" onclick="PREVIEW_CONFIG['${tipo}'].imprimir(${id})" title="Imprimir / PDF">🖨️ Imprimir / PDF</button>` : '';
  const btnEnviar   = cfg.enviar   ? `<button class="btn btn-secondary btn-sm" onclick="PREVIEW_CONFIG['${tipo}'].enviar(${id})" title="Enviar por email">📧 Enviar</button>` : '';
  const btnEditar   = `<button class="btn btn-secondary btn-sm" onclick="_prevCerrar();PREVIEW_CONFIG['${tipo}'].editar(${id})" title="Editar">✏️ Editar</button>`;
  const btnAnular   = cfg.anular   ? `<button class="btn btn-secondary btn-sm" onclick="PREVIEW_CONFIG['${tipo}'].anular(${id});_prevCerrar()" title="Anular" style="color:var(--rojo)">🚫 Anular</button>` : '';

  const ivaRow = cfg.hayIva ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid var(--gris-200)"><span style="color:var(--gris-500)">IVA</span><span style="font-weight:600">${_prevFmtE(ivaShow)}</span></div>` : '';
  const baseRow = cfg.hayIva ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid var(--gris-200)"><span style="color:var(--gris-500)">Base imponible</span><span style="font-weight:600">${_prevFmtE(baseShow)}</span></div>` : '';

  // MODAL
  const overlay = document.createElement('div');
  overlay.id = 'mPreviewDoc';
  overlay.className = 'overlay';
  overlay.onclick = function(e) { if (e.target === overlay) _prevCerrar(); };
  overlay.innerHTML = `
    <div class="modal modal-lg" onclick="event.stopPropagation()">
      <div class="modal-h" style="align-items:center">
        <span>${cfg.iconHeader}</span>
        <div>
          <h2 style="font-size:16px;font-weight:800">${d.numero || '—'}</h2>
          <div style="font-size:12px;color:var(--gris-500)">${proveedor}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;margin-right:8px;align-items:center;flex-wrap:wrap">
          ${pildora}
          ${btnImprimir}
          ${btnEnviar}
          ${btnEditar}
          ${btnAnular}
        </div>
        <button class="btn btn-ghost btn-icon" onclick="_prevCerrar()">✕</button>
      </div>
      <div class="modal-b">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">
          ${camposHtml}
        </div>
        <div style="border:1px solid var(--gris-200);border-radius:8px;overflow:hidden;margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse">
            <thead style="background:var(--gris-50)">
              <tr>
                <th style="padding:9px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:left">Descripción</th>
                <th style="padding:9px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:right;width:70px">Cant.</th>
                <th style="padding:9px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:right;width:100px">Precio</th>
                <th style="padding:9px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:right;width:70px">Dto.</th>
                <th style="padding:9px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:right;width:70px">IVA</th>
                <th style="padding:9px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:right;width:100px">Total</th>
              </tr>
            </thead>
            <tbody>${lineasHtml}</tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end">
          <div style="width:260px;background:var(--gris-50);border-radius:9px;padding:14px">
            ${baseRow}
            ${ivaRow}
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:16px;font-weight:800"><span>TOTAL</span><span style="color:var(--azul)">${_prevFmtE(totalShow)}</span></div>
          </div>
        </div>
        ${obsHtml}
        ${badgesWrap}
      </div>
      <div class="modal-f" style="display:flex;justify-content:flex-end;align-items:center;gap:8px">
        <button class="btn btn-secondary" onclick="_prevCerrar()">Cerrar</button>
        <button class="btn btn-primary" onclick="_prevCerrar();PREVIEW_CONFIG['${tipo}'].editar(${id})">✏️ Editar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // El CSS .overlay tiene opacity:0 por defecto; se activa con .open (igual que openModal de ui.js)
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.body.style.overflow = 'hidden';

  // Cerrar con ESC
  const onKey = (e) => { if (e.key === 'Escape') { _prevCerrar(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

// Exponer globalmente
window.previewDoc = previewDoc;
window._prevCerrar = _prevCerrar;
window.PREVIEW_CONFIG = PREVIEW_CONFIG;
