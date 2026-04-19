/**
 * MÓDULO FACTURAS
 * Gestión completa de facturas: listado, filtrado, estados, detalle,
 * creación rápida, impresión, PDF, email y exportación Excel
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let facLocalData = [];
let facFiltrados = [];
let frLineas = [];
let frClienteActual = null;
let _facVerMap = {};  // { factura_id: maxVersion } — pre-cargado en loadFacturas

// ═══════════════════════════════════════════════
//  STEPPER DE PROGRESO (overlay con pasos animados)
// ═══════════════════════════════════════════════
let _stepperEl = null;
let _stepperSteps = [];
let _stepperCurrent = 0;

function _showStepper(titulo, pasos) {
  _closeStepper();
  _stepperSteps = pasos;
  _stepperCurrent = 0;

  const ol = document.createElement('div');
  ol.id = 'vfStepper';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10010;display:flex;align-items:center;justify-content:center;animation:vfFadeIn .2s';
  ol.innerHTML = `
    <style>
      @keyframes vfFadeIn{from{opacity:0}to{opacity:1}}
      @keyframes vfPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
      @keyframes vfSpin{to{transform:rotate(360deg)}}
      .vf-step{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;transition:all .3s;opacity:.4}
      .vf-step.active{opacity:1;background:rgba(59,130,246,.08)}
      .vf-step.done{opacity:.7}
      .vf-step .icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;transition:all .3s;flex-shrink:0}
      .vf-step.pending .icon{background:#e2e8f0;color:#94a3b8}
      .vf-step.active .icon{background:#3b82f6;color:#fff;animation:vfPulse 1.2s infinite}
      .vf-step.done .icon{background:#22c55e;color:#fff}
      .vf-step.error .icon{background:#ef4444;color:#fff}
      .vf-step .label{font-size:13px;font-weight:600;color:#334155}
      .vf-step.active .label{color:#1e40af;font-weight:700}
      .vf-step.done .label{color:#16a34a}
      .vf-step.error .label{color:#dc2626}
      .vf-step .sub{font-size:11px;color:#94a3b8;margin-top:1px}
      .vf-bar{height:4px;background:#e2e8f0;border-radius:2px;margin:12px 0 4px;overflow:hidden}
      .vf-bar-fill{height:100%;background:linear-gradient(90deg,#3b82f6,#1d4ed8);border-radius:2px;transition:width .4s ease;width:0%}
      .vf-spinner{width:16px;height:16px;border:2.5px solid rgba(59,130,246,.25);border-top-color:#3b82f6;border-radius:50%;animation:vfSpin .7s linear infinite;display:inline-block}
    </style>
    <div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:440px;width:94%;box-shadow:0 24px 80px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
        <div style="font-size:24px">${titulo.startsWith('<') ? titulo : '🧾'}</div>
        <div>
          <div style="font-size:15px;font-weight:800;color:#1e293b" id="vfStepTitle">${titulo.startsWith('<') ? 'Procesando' : titulo}</div>
          <div style="font-size:11px;color:#94a3b8" id="vfStepSub">Preparando...</div>
        </div>
      </div>
      <div class="vf-bar"><div class="vf-bar-fill" id="vfBarFill"></div></div>
      <div id="vfStepsList" style="margin-top:14px"></div>
    </div>
  `;
  document.body.appendChild(ol);
  _stepperEl = ol;

  // Renderizar pasos
  _renderStepperSteps();
  _updateStep(0);
}

function _renderStepperSteps() {
  const container = document.getElementById('vfStepsList');
  if (!container) return;
  container.innerHTML = _stepperSteps.map((p, i) => `
    <div class="vf-step pending" id="vfStep${i}">
      <div class="icon">${i + 1}</div>
      <div>
        <div class="label">${p.label}</div>
        <div class="sub" id="vfStepSub${i}">${p.sub || ''}</div>
      </div>
    </div>
  `).join('');
}

function _updateStep(idx, subText) {
  _stepperCurrent = idx;
  const total = _stepperSteps.length;
  const pct = Math.round(((idx) / total) * 100);
  const bar = document.getElementById('vfBarFill');
  if (bar) bar.style.width = pct + '%';

  const subEl = document.getElementById('vfStepSub');
  if (subEl) subEl.textContent = _stepperSteps[idx]?.label || '';

  for (let i = 0; i < total; i++) {
    const el = document.getElementById('vfStep' + i);
    if (!el) continue;
    const icon = el.querySelector('.icon');
    if (i < idx) {
      el.className = 'vf-step done';
      icon.innerHTML = '✓';
    } else if (i === idx) {
      el.className = 'vf-step active';
      icon.innerHTML = `<div class="vf-spinner"></div>`;
      if (subText) {
        const s = document.getElementById('vfStepSub' + i);
        if (s) s.textContent = subText;
      }
    } else {
      el.className = 'vf-step pending';
      icon.innerHTML = String(i + 1);
    }
  }
}

function _stepperDone(msg, ok = true) {
  const total = _stepperSteps.length;
  const bar = document.getElementById('vfBarFill');
  if (bar) {
    bar.style.width = '100%';
    bar.style.background = ok ? 'linear-gradient(90deg,#22c55e,#16a34a)' : 'linear-gradient(90deg,#ef4444,#dc2626)';
  }
  // Marcar todos como done o el último como error
  for (let i = 0; i < total; i++) {
    const el = document.getElementById('vfStep' + i);
    if (!el) continue;
    const icon = el.querySelector('.icon');
    if (i < total - 1) {
      el.className = 'vf-step done';
      icon.innerHTML = '✓';
    } else {
      el.className = ok ? 'vf-step done' : 'vf-step error';
      icon.innerHTML = ok ? '✓' : '✕';
      const s = document.getElementById('vfStepSub' + i);
      if (s) s.textContent = msg || '';
    }
  }
  const subEl = document.getElementById('vfStepSub');
  if (subEl) subEl.textContent = ok ? '¡Completado!' : 'Error';
  const titleEl = document.getElementById('vfStepTitle');
  if (titleEl) titleEl.textContent = ok ? '✅ Factura procesada' : '❌ Error en el proceso';

  // Auto-cerrar tras 2s si OK, 4s si error
  setTimeout(() => _closeStepper(), ok ? 2000 : 4000);
}

function _closeStepper() {
  if (_stepperEl) { _stepperEl.remove(); _stepperEl = null; }
}

// ═══════════════════════════════════════════════
//  CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadFacturas() {
  const { data } = await sb.from('facturas')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'eliminado')
    .order('created_at', { ascending: false });
  facLocalData = data || [];
  window.facturasData = facLocalData;

  // Pre-cargar versiones de TODAS las facturas para mostrar badge en listado
  _facVerMap = {};
  const allIds = facLocalData.map(f => f.id);
  if (allIds.length) {
    const { data: verRows } = await sb.from('factura_versiones')
      .select('factura_id, version').in('factura_id', allIds)
      .order('version', { ascending: false });
    if (verRows) {
      verRows.forEach(r => {
        if (!_facVerMap[r.factura_id] || r.version > _facVerMap[r.factura_id])
          _facVerMap[r.factura_id] = r.version;
      });
    }
  }

  // Poblar selector de año con los años presentes en las facturas
  const anioSel = document.getElementById('fAnio');
  if (anioSel) {
    const aniosPresentes = [...new Set(
      facLocalData.map(f => f.fecha ? new Date(f.fecha).getFullYear() : null).filter(Boolean)
    )].sort((a, b) => b - a);
    const anioActual = new Date().getFullYear();
    anioSel.innerHTML = '<option value="">Todos los años</option>' +
      aniosPresentes.map(a => `<option value="${a}" ${a === anioActual ? 'selected' : ''}>${a}</option>`).join('');
  }
  // Quitar filtro de fecha manual — el filtro de año hace ese trabajo
  const dEl = document.getElementById('fDesde');
  const hEl = document.getElementById('fHasta');
  if (dEl) dEl.value = '';
  if (hEl) hEl.value = '';
  facFiltrados = [...facLocalData];
  filtrarFacturas();
}

function renderFacturas(list) {
  const ESTADOS = {
    borrador:     { label:'Borrador',     ico:'✏️', color:'var(--gris-400)',   bg:'var(--gris-100)' },
    pendiente:    { label:'Pendiente',    ico:'⏳', color:'var(--amarillo)',   bg:'var(--amarillo-light)' },
    cobrada:      { label:'Cobrada',      ico:'✅', color:'var(--verde)',      bg:'var(--verde-light)' },
    pagada:       { label:'Cobrada',      ico:'✅', color:'var(--verde)',      bg:'var(--verde-light)' }, // compat legacy
    vencida:      { label:'Vencida',      ico:'⚠️', color:'var(--rojo)',       bg:'var(--rojo-light)' },
    rectificada:  { label:'Rectificada',  ico:'📐', color:'#d97706',          bg:'#fef3c7' },
    anulada:      { label:'Anulada',      ico:'🚫', color:'var(--gris-400)',   bg:'var(--gris-100)' },
  };

  // Auto-vencer facturas pendientes cuya fecha_vencimiento ha pasado
  const hoy = new Date().toISOString().split('T')[0];
  facLocalData.forEach(f => {
    if (f.estado === 'pendiente' && f.fecha_vencimiento && f.fecha_vencimiento < hoy) {
      f.estado = 'vencida';
      sb.from('facturas').update({ estado: 'vencida' }).eq('id', f.id)
        .then(r => { if (r.error) console.error('Error auto-vencer', f.numero, r.error.message); });
    }
  });

  // KPIs — dinámicos sobre la lista filtrada visible
  const noAnuladas = list.filter(f => f.estado !== 'anulada' && f.estado !== 'rectificada');
  const borradores = list.filter(f => f.estado === 'borrador');
  const pends    = list.filter(f => f.estado === 'pendiente');
  const vencidas = list.filter(f => f.estado === 'vencida');
  const cobradas = list.filter(f => f.estado === 'cobrada' || f.estado === 'pagada');
  const anuladas = list.filter(f => f.estado === 'anulada' || f.estado === 'rectificada');

  const kTotal    = document.getElementById('fk-total');
  const kBorr     = document.getElementById('fk-borradores');
  const kPend     = document.getElementById('fk-pendientes');
  const kVenc     = document.getElementById('fk-vencidas');
  const kCobr     = document.getElementById('fk-cobradas');
  const kAnul     = document.getElementById('fk-anuladas');
  const kImpPend  = document.getElementById('fk-imp-pend');
  const kImpCobr  = document.getElementById('fk-imp-cobr');
  if (kTotal)   kTotal.textContent   = noAnuladas.length;
  if (kBorr)    kBorr.textContent    = borradores.length;
  if (kPend)    kPend.textContent    = pends.length;
  if (kVenc)    kVenc.textContent    = vencidas.length;
  if (kCobr)    kCobr.textContent    = cobradas.length;
  if (kAnul)    kAnul.textContent    = anuladas.length;
  if (kImpPend) kImpPend.textContent = fmtE(pends.concat(vencidas).reduce((s, f) => s + (f.total || 0), 0));
  if (kImpCobr) kImpCobr.textContent = fmtE(cobradas.reduce((s, f) => s + (f.total || 0), 0));

  // Resaltar KPI activo
  const estActivo = document.getElementById('fEstado')?.value || '_todas';
  document.querySelectorAll('.fk-click').forEach(el => {
    const isActive = el.dataset.fk === estActivo;
    el.style.outline = isActive ? '2.5px solid var(--azul)' : 'none';
    el.style.outlineOffset = isActive ? '-1px' : '0';
    el.style.transform = isActive ? 'scale(1.03)' : '';
  });

  const tbody = document.getElementById('fTable');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(f => {
    const est = ESTADOS[f.estado] || { label: f.estado || '—', ico:'❔', color:'var(--gris-400)', bg:'var(--gris-100)' };
    // ¿Tiene rectificativa asociada? → bloqueada
    const tieneRect = facLocalData.some(r => r.rectificativa_de === f.id);
    const esRect = !!f.rectificativa_de;
    const bloqueada = tieneRect && (f.estado === 'anulada' || f.estado === 'rectificada');
    const rowStyle = bloqueada ? 'cursor:pointer;background:rgba(239,68,68,0.08);color:#991B1B' : 'cursor:pointer';
    const lockBadge = bloqueada ? '<span style="font-size:10px;background:#FEE2E2;color:#991B1B;padding:2px 6px;border-radius:4px;margin-left:4px;font-weight:700" title="Factura rectificada">🔒 Rectificada</span>' : '';

    // Badge de versión para borradores (como en presupuestos)
    const _fVer = _facVerMap[f.id] || 0;
    const _fVerBadge = _fVer > 1 ? `<button onclick="event.stopPropagation();toggleFacVersiones(${f.id},this)" style="font-size:10px;background:var(--azul-light);color:var(--azul);padding:2px 8px;border-radius:10px;font-weight:700;border:1.5px solid var(--azul);cursor:pointer;margin-left:4px" title="Ver versiones anteriores">v${_fVer} ▾</button>` : '';

    return `<tr data-fac-row="${f.id}" style="${rowStyle}" onclick="verDetalleFactura(${f.id})">
      <td style="font-weight:700;font-family:monospace;font-size:12.5px"><div style="display:flex;align-items:center;gap:2px">${(f.numero || '').startsWith('BORR-') ? '<span style="color:var(--gris-400);font-style:italic">' + f.numero + '</span>' : (f.numero || '—')}${_fVerBadge}${lockBadge}</div></td>
      <td><div style="font-weight:600">${f.cliente_nombre || '—'}</div></td>
      <td style="font-size:12px">${f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—'}</td>
      <td style="font-size:12px">${f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : '—'}</td>
      <td style="text-align:right;font-size:12.5px">${fmtE(f.base_imponible || 0)}</td>
      <td style="text-align:right;font-size:12.5px">${fmtE(f.total_iva || 0)}</td>
      <td style="text-align:right;font-weight:700">${fmtE(f.total || 0)}</td>
      <td onclick="event.stopPropagation()">
        <span onclick="cambiarEstadoFacMenu(event,${f.id})" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${est.color};background:${est.bg};cursor:pointer" title="Cambiar estado">${est.ico} ${est.label}</span>
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center">
          <button onclick="imprimirFactura(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid var(--gris-200);background:white;cursor:pointer;font-size:11px;font-weight:600;color:var(--gris-600)" title="Imprimir">🖨️</button>
          <button onclick="generarPdfFactura(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid var(--gris-200);background:white;cursor:pointer;font-size:11px;font-weight:600;color:var(--gris-600)" title="PDF">📥</button>
          <button onclick="enviarFacturaEmail(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid var(--gris-200);background:white;cursor:pointer;font-size:11px;font-weight:600;color:var(--gris-600)" title="Enviar email">📧</button>
          ${_isVfActivo() && f.estado !== 'borrador' && !(f.numero||'').startsWith('BORR-') ? (f.verifactu_estado === 'correcto' ? `<span style="padding:3px 8px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700" title="Registrada en AEAT · CSV: ${f.verifactu_csv||''}">✅ AEAT</span>` : f.verifactu_estado === 'anulado' ? `<span style="padding:3px 8px;border-radius:6px;background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700" title="Anulada en AEAT">🗑️</span><button onclick="event.stopPropagation();enviarFacturaAEAT(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #1D4ED8;background:#EFF6FF;cursor:pointer;font-size:11px;font-weight:700;color:#1D4ED8" title="Reenviar a AEAT">📡</button>` : `<button onclick="event.stopPropagation();enviarFacturaAEAT(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #1D4ED8;background:#EFF6FF;cursor:pointer;font-size:11px;font-weight:700;color:#1D4ED8" title="Enviar a AEAT (VeriFactu)">📡 AEAT</button>`) : ''}
          ${!bloqueada && !esRect && f.estado !== 'cobrada' && f.estado !== 'pagada' && f.estado !== 'anulada' && f.estado !== 'rectificada' ? `<button onclick="marcarCobrada(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #D97706;background:#FEF3C7;cursor:pointer;font-size:11px;font-weight:700;color:#92400E" title="Registrar cobro de esta factura">💰 Cobrar</button>` : ''}
          ${(()=>{
            const _tP = !!f.presupuesto_id;
            const _tA = !!f.albaran_id;
            const _tO = !!f.trabajo_id;
            const _bOK = 'padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none';
            let refs = '';
            if (_tP) refs += '<a onclick="event.stopPropagation();goPage(\'presupuestos\');setTimeout(()=>verDetallePresupuesto('+f.presupuesto_id+'),200)" style="'+_bOK+'" title="Ver presupuesto origen">📋</a> ';
            if (_tA) refs += '<a onclick="event.stopPropagation();goPage(\'albaranes\');setTimeout(()=>verDetalleAlbaran('+f.albaran_id+'),200)" style="'+_bOK+'" title="Ver albarán origen">📄</a> ';
            if (_tO) refs += '<a onclick="event.stopPropagation();goPage(\'trabajos\');abrirFichaObra('+f.trabajo_id+')" style="'+_bOK+'" title="Ver obra">🏗️</a> ';
            if (tieneRect) { const _r = facLocalData.find(r=>r.rectificativa_de===f.id); refs += '<a onclick="event.stopPropagation();verDetalleFactura('+(_r?_r.id:0)+')" style="padding:4px 10px;border-radius:6px;background:#FEE2E2;color:#991B1B;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none" title="Ver rectificativa">📝 '+(_r?_r.numero:'RECT')+'</a> '; }
            return refs;
          })()}
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="9"><div class="empty"><div class="ei">🧾</div><h3>Sin facturas</h3><p>Crea la primera con el botón "+ Nueva factura"</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  FILTRADO Y BÚSQUEDA
// ═══════════════════════════════════════════════
function filtrarFacturas() {
  const q    = (document.getElementById('fSearch')?.value || '').toLowerCase();
  const est  = document.getElementById('fEstado')?.value || '';
  const anio = document.getElementById('fAnio')?.value || '';
  const des  = document.getElementById('fDesde')?.value || '';
  const has  = document.getElementById('fHasta')?.value || '';
  facFiltrados = facLocalData.filter(f => {
    // Excluir rectificativas del listado principal (van a su pestaña)
    if (f.rectificativa_de) return false;
    // Filtro de estado
    // Las anuladas que tienen rectificativa asociada siempre se muestran (bloqueadas en rojo)
    const tieneRectAsociada = facLocalData.some(r => r.rectificativa_de === f.id);
    if (est === '_todas') {
      if ((f.estado === 'anulada' || f.estado === 'rectificada') && !tieneRectAsociada) return false; // Excluir anuladas/rectificadas sueltas
    } else if (est === 'cobrada') {
      if (f.estado !== 'cobrada' && f.estado !== 'pagada') return false; // Compat legacy
    } else if (est) {
      if (f.estado !== est) return false;
    }
    // Filtro de búsqueda
    if (q && !(f.numero || '').toLowerCase().includes(q) && !(f.cliente_nombre || '').toLowerCase().includes(q)) return false;
    // Filtro de año
    if (anio && f.fecha && new Date(f.fecha).getFullYear() !== parseInt(anio)) return false;
    // Filtro de fechas exactas (complementario al año)
    if (des && (!f.fecha || f.fecha < des)) return false;
    if (has && (!f.fecha || f.fecha > has)) return false;
    return true;
  });
  const _numSort = (n) => { const m = (n || '').match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  facFiltrados.sort((a, b) => _numSort(b.numero) - _numSort(a.numero));
  renderFacturas(facFiltrados);
}

// Filtrar al hacer clic en un KPI
function filtrarFacturasPorKpi(estado) {
  const sel = document.getElementById('fEstado');
  if (sel) {
    sel.value = estado;
    filtrarFacturas();
  }
}

// ═══════════════════════════════════════════════
//  GESTIÓN DE ESTADOS
// ═══════════════════════════════════════════════
async function cambiarEstadoFac(id, estado) {
  const f = facLocalData.find(x => x.id === id);
  const estadoAnterior = f?.estado || null;
  const { error } = await sb.from('facturas').update({ estado }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  if (f) f.estado = estado;
  window.facturasData = facLocalData;
  // Registrar en historial
  _registrarCambioEstado('factura', id, estadoAnterior, estado);
  toast('Estado actualizado ✓', 'success');
  filtrarFacturas();
  loadDashboard();
}

function cambiarEstadoFacMenu(event, id) {
  event.stopPropagation();
  document.querySelectorAll('.est-menu-popup').forEach(m => m.remove());
  const ESTADOS = [
    { key: 'borrador',     ico: '✏️', label: 'Borrador' },
    { key: 'pendiente',    ico: '⏳', label: 'Pendiente' },
    { key: 'cobrada',      ico: '✅', label: 'Cobrada' },
    { key: 'vencida',      ico: '⚠️', label: 'Vencida' },
    { key: 'rectificada',  ico: '📐', label: 'Rectificada' },
    { key: 'anulada',      ico: '🚫', label: 'Anulada' },
  ];
  const menu = document.createElement('div');
  menu.className = 'est-menu-popup';
  menu.style.cssText = 'position:absolute;z-index:9999;background:#fff;border:1.5px solid var(--gris-200);border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.12);padding:4px;min-width:160px';
  const rect = event.target.getBoundingClientRect();
  menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  menu.style.left = (rect.left + window.scrollX) + 'px';
  menu.innerHTML = ESTADOS.map(e =>
    `<div onclick="cambiarEstadoFac(${id},'${e.key}');this.parentElement.remove()" style="padding:7px 12px;cursor:pointer;font-size:13px;border-radius:7px;display:flex;align-items:center;gap:6px;font-weight:600" onmouseenter="this.style.background='var(--gris-50)'" onmouseleave="this.style.background='transparent'">${e.ico} ${e.label}</div>`
  ).join('');
  document.body.appendChild(menu);
  const _close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', _close); } };
  setTimeout(() => document.addEventListener('click', _close), 10);
}

function marcarCobrada(id) {
  const f = facLocalData.find(x => x.id === id);
  const hoy = new Date().toISOString().slice(0, 10);

  // Opciones de forma de pago desde administración
  const fpOpts = (typeof formasPago !== 'undefined' ? formasPago : [])
    .map(fp => `<option value="${fp.id}">${fp.nombre}</option>`).join('');

  const html = `
    <div style="padding:8px 0">
      <h3 style="font-size:16px;font-weight:800;margin-bottom:4px">💰 Registrar cobro</h3>
      <p style="font-size:13px;color:var(--gris-500);margin-bottom:20px">
        Factura <strong>${f?.numero || '—'}</strong> · <strong>${f ? fmtE(f.total || 0) : '—'}</strong>
      </p>

      <label style="display:block;margin-bottom:14px">
        <span style="font-size:12px;font-weight:700;color:var(--gris-600);display:block;margin-bottom:4px">Fecha de cobro</span>
        <input type="date" id="cobro_fecha" value="${hoy}"
          style="width:100%;padding:9px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:14px;outline:none">
        <span style="font-size:11px;color:var(--gris-400);margin-top:3px;display:block">
          Modifica si el cobro fue en una fecha anterior
        </span>
      </label>

      <label style="display:block;margin-bottom:14px">
        <span style="font-size:12px;font-weight:700;color:var(--gris-600);display:block;margin-bottom:4px">Forma de pago</span>
        ${fpOpts ? `<select id="cobro_fp" style="width:100%;padding:9px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:14px;outline:none">
          <option value="">— Sin especificar —</option>
          ${fpOpts}
        </select>` : `<p style="font-size:13px;color:var(--gris-400);padding:8px 0">
          No hay formas de pago configuradas. <a href="#" onclick="goPage('config');closeModal();return false" style="color:var(--azul)">Configúralas en Administración</a>.
        </p>`}
      </label>

      <label style="display:block;margin-bottom:20px">
        <span style="font-size:12px;font-weight:700;color:var(--gris-600);display:block;margin-bottom:4px">Notas (opcional)</span>
        <input type="text" id="cobro_notas" placeholder="Ej: Transferencia recibida el día 5..."
          style="width:100%;padding:9px 11px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:13px;outline:none">
      </label>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="closeModal('mCobroFac')">Cancelar</button>
        <button class="btn btn-primary" onclick="_confirmarCobro(${id})" style="background:var(--verde)">✅ Confirmar cobro</button>
      </div>
    </div>`;

  // Reutilizar modal genérico o crear uno temporal
  const existing = document.getElementById('mCobroFac');
  if (existing) {
    existing.remove();
  }
  const overlay = document.createElement('div');
  overlay.id = 'mCobroFac';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:5000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:94%;box-shadow:0 20px 60px rgba(0,0,0,.2)">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  document.getElementById('cobro_fecha')?.focus();
}

async function _confirmarCobro(id) {
  const fecha   = document.getElementById('cobro_fecha')?.value || new Date().toISOString().slice(0, 10);
  const fpId    = parseInt(document.getElementById('cobro_fp')?.value) || null;
  const notas   = document.getElementById('cobro_notas')?.value?.trim() || null;

  const upd = { estado: 'cobrada', fecha_cobro: fecha };
  if (fpId)  upd.forma_pago_id = fpId;
  if (notas) upd.notas_cobro   = notas;

  const { error } = await sb.from('facturas').update(upd).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const f = facLocalData.find(x => x.id === id);
  if (f) Object.assign(f, upd);
  window.facturasData = facLocalData;

  document.getElementById('mCobroFac')?.remove();
  toast('✅ Factura marcada como cobrada', 'success');
  filtrarFacturas();
  loadDashboard();
}

// Compat legacy
async function marcarPagada(id) { return marcarCobrada(id); }

// ═══════════════════════════════════════════════
//  VER DETALLE FACTURA
// ═══════════════════════════════════════════════
async function verDetalleFactura(id) {
  let f = facLocalData.find(x => x.id === id);
  if (!f) {
    // No cargado aún en memoria: traer de BD
    const { data } = await sb.from('facturas').select('*').eq('id', id).maybeSingle();
    if (!data) { toast('No se encontró la factura', 'error'); return; }
    f = data;
    facLocalData.push(f);
  }
  document.getElementById('facDetId').value = id;
  document.getElementById('facDetNro').textContent = f.numero || '—';
  document.getElementById('facDetCli').textContent = f.cliente_nombre || '—';
  document.getElementById('facDetFecha').textContent = f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—';
  document.getElementById('facDetVence').textContent = f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : '—';

  const ESTADOS = { borrador: 'Borrador', pendiente: 'Pendiente', cobrada: 'Cobrada', pagada: 'Cobrada', vencida: 'Vencida', rectificada: 'Rectificada', anulada: 'Anulada' };
  const COLORES = { pendiente: 'var(--amarillo)', cobrada: 'var(--verde)', pagada: 'var(--verde)', vencida: 'var(--rojo)', rectificada: '#d97706', anulada: 'var(--gris-400)' };
  const tipoVFLabels = {F1:'Completa',F2:'Simplificada',F3:'Sustitutiva',R1:'Rect. errores',R2:'Rect. concurso',R3:'Rect. incobrables',R4:'Rect. otras',R5:'Rect. simplificada'};
  const tipoVFBadge = f.tipo_rectificativa ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;color:#1e40af;background:#DBEAFE;margin-left:6px" title="${tipoVFLabels[f.tipo_rectificativa]||f.tipo_rectificativa}">${f.tipo_rectificativa}</span>` : '';
  document.getElementById('facDetEstado').innerHTML = `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:white;background:${COLORES[f.estado] || 'var(--gris-400)'}">${ESTADOS[f.estado] || f.estado || '—'}</span>${tipoVFBadge}`;

  // Forma de pago
  const fpEl = document.getElementById('facDetFpago');
  if (fpEl) {
    const fp = (typeof formasPago !== 'undefined' ? formasPago : []).find(x => x.id === f.forma_pago_id);
    fpEl.textContent = fp ? fp.nombre : '—';
  }

  // Líneas
  const lineas = f.lineas || [];
  let base = 0, ivaTotal = 0;
  document.getElementById('facDetLineas').innerHTML = lineas.map(l => {
    if (l._separator) {
      return `<tr><td colspan="6" style="padding:6px 10px;background:var(--gris-50);font-weight:700;font-size:11px;color:var(--gris-500);border-bottom:1px solid var(--gris-100)">${l.desc || ''}</td></tr>`;
    }
    const dto = l.dto || 0;
    const sub = (l.cant || 0) * (l.precio || 0) * (1 - dto / 100);
    const iv = sub * ((l.iva || 0) / 100);
    base += sub;
    ivaTotal += iv;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:8px 10px;font-size:13px">${l.desc || '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.cant || 0}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmtE(l.precio || 0)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${dto ? dto + '%' : '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.iva != null ? l.iva + '%' : '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub + iv)}</td>
    </tr>`;
  }).join('');

  document.getElementById('facDetBase').textContent = fmtE(f.base_imponible || base);
  document.getElementById('facDetIva').textContent = fmtE(f.total_iva || ivaTotal);
  document.getElementById('facDetTotal').textContent = fmtE(f.total || 0);

  // Observaciones
  const obsWrap = document.getElementById('facDetObsWrap');
  const obsDiv = document.getElementById('facDetObs');
  if (f.observaciones) {
    obsWrap.style.display = 'block';
    obsDiv.textContent = f.observaciones;
  } else {
    obsWrap.style.display = 'none';
  }

  // Referencias cruzadas
  const refsEl = document.getElementById('facDetRefs');
  let refsHtml = '';
  const _bOK = 'padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:3px';
  if (f.rectificativa_de) {
    const origFac = facLocalData.find(x => x.id === f.rectificativa_de);
    refsHtml += `<a onclick="closeModal('mFacturaDetalle');verDetalleFactura(${f.rectificativa_de})" style="${_bOK};background:#FEE2E2;color:#991B1B">📝 Rectifica: ${origFac ? origFac.numero : 'FAC-' + f.rectificativa_de}</a> `;
  }
  // Comprobar si tiene rectificativa asociada
  const rectAsociada = facLocalData.find(x => x.rectificativa_de === id);
  if (rectAsociada) {
    refsHtml += `<a onclick="closeModal('mFacturaDetalle');verDetalleFactura(${rectAsociada.id})" style="${_bOK};background:#FEF3C7;color:#92400E">📝 Rectificada por: ${rectAsociada.numero}</a> `;
  }
  if (f.presupuesto_id) {
    const pres = (typeof presupuestos !== 'undefined' ? presupuestos : []).find(p => p.id === f.presupuesto_id);
    refsHtml += `<a onclick="closeModal('mFacturaDetalle');goPage('presupuestos');setTimeout(()=>verDetallePresupuesto(${f.presupuesto_id}),200)" style="${_bOK}">📋 Presupuesto ${pres ? pres.numero : ''}</a> `;
  }
  if (f.albaran_id) {
    const alb = (typeof albaranesData !== 'undefined' ? albaranesData : []).find(a => a.id === f.albaran_id);
    refsHtml += `<a onclick="closeModal('mFacturaDetalle');goPage('albaranes');setTimeout(()=>verDetalleAlbaran(${f.albaran_id}),200)" style="${_bOK}">📄 Albarán ${alb ? alb.numero : ''}</a> `;
  }
  if (f.trabajo_id) {
    refsHtml += `<a onclick="closeModal('mFacturaDetalle');goPage('trabajos');abrirFichaObra(${f.trabajo_id})" style="${_bOK}">🏗️ Obra</a> `;
  }
  if (refsHtml) {
    refsEl.style.display = 'flex';
    refsEl.innerHTML = '<span style="font-size:11px;color:var(--gris-400);margin-right:6px">Origen:</span>' + refsHtml;
  } else {
    refsEl.style.display = 'none';
  }

  // Reglas de negocio — se usan en footer, botones editar/eliminar y versiones
  const esBorrador = f.estado === 'borrador' || (f.numero || '').startsWith('BORR-');
  const esRectificativa = !!f.rectificativa_de;
  const tieneRectificativa = !!rectAsociada;

  // Footer buttons
  const footerBtns = document.getElementById('facDetFooterBtns');
  if (footerBtns) {
    let btns = '';
    // Cobrar — si no cobrada/anulada y NO es rectificativa
    if (f.estado !== 'cobrada' && f.estado !== 'pagada' && f.estado !== 'anulada' && f.estado !== 'rectificada' && !esRectificativa) {
      btns += `<button class="btn btn-primary" onclick="closeModal('mFacturaDetalle');marcarCobrada(${f.id})" style="background:var(--verde)">💰 Registrar cobro</button>`;
    }
    // Recordatorio — si vencida o pendiente y NO es rectificativa
    if ((f.estado === 'vencida' || f.estado === 'pendiente') && !esRectificativa) {
      btns += `<button class="btn btn-sm" onclick="enviarRecordatorioVencida(${f.id})" style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B">📧 Enviar recordatorio</button>`;
    }
    // Rectificativa — si no es borrador, no es ya rectificativa, y no tiene una asociada
    if (f.estado !== 'borrador' && f.estado !== 'anulada' && f.estado !== 'rectificada' && !esRectificativa && !rectAsociada) {
      btns += `<button class="btn btn-sm" onclick="crearRectificativa(${f.id})" style="background:#FEE2E2;color:#991B1B;border:1px solid #EF4444">📝 Crear rectificativa</button>`;
    }
    // VeriFactu — enviar a AEAT si activo y no borrador (rectificativas también se envían)
    if (_isVfActivo() && !esBorrador) {
      if (f.verifactu_estado === 'correcto') {
        btns += `<span style="display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:12px;font-weight:700">✅ Registrada en AEAT${f.verifactu_csv ? ' · CSV: '+f.verifactu_csv : ''}</span>`;
        // Botón subsanar — corregir datos no fiscales y reenviar
        btns += `<button class="btn btn-sm" onclick="abrirSubsanacion(${f.id})" style="background:#FFF7ED;color:#9A3412;border:1px solid #FB923C;font-weight:600" title="Corregir descripciones u observaciones sin crear rectificativa">🔧 Subsanar</button>`;
        // Mostrar QR VeriFactu si existe
        if (f.verifactu_qr_url) {
          const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(f.verifactu_qr_url)}`;
          btns += `<a href="${f.verifactu_qr_url}" target="_blank" title="Verificar en AEAT" style="margin-left:4px"><img src="${qrImg}" style="width:48px;height:48px;border-radius:4px;vertical-align:middle;border:1px solid #d1d5db"></a>`;
        }
      } else if (f.verifactu_estado === 'anulado') {
        btns += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#FEF3C7;color:#92400E;font-size:11px;font-weight:600">🗑️ Anulada en AEAT</span>`;
        btns += `<button class="btn btn-sm" onclick="enviarFacturaAEAT(${f.id})" style="background:#EFF6FF;color:#1D4ED8;border:1px solid #1D4ED8;font-weight:700">📡 Reenviar a AEAT</button>`;
      } else if (f.verifactu_estado === 'incorrecto') {
        btns += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#FEF2F2;color:#991B1B;font-size:11px;font-weight:600">❌ Error AEAT</span>`;
        btns += `<button class="btn btn-sm" onclick="enviarFacturaAEAT(${f.id})" style="background:#EFF6FF;color:#1D4ED8;border:1px solid #1D4ED8;font-weight:700">📡 Reintentar</button>`;
      } else {
        btns += `<button class="btn btn-sm" onclick="enviarFacturaAEAT(${f.id})" style="background:#EFF6FF;color:#1D4ED8;border:1px solid #1D4ED8;font-weight:700">📡 Enviar a AEAT</button>`;
      }
    }
    // Emitir factura definitiva — solo borradores
    if (esBorrador && !esRectificativa) {
      btns += `<button class="btn btn-primary" onclick="emitirFacturaDefinitiva(${f.id})" style="background:var(--azul)">🧾 Emitir factura</button>`;
    }
    footerBtns.innerHTML = btns;
  }

  // Historial de estados
  const histEl = document.getElementById('facDetHistorial');
  if (histEl) {
    const historial = await _cargarHistorial('factura', id);
    histEl.innerHTML = historial.length
      ? '<div style="margin-top:12px;border-top:1px solid var(--gris-200);padding-top:10px"><div style="font-size:12px;font-weight:700;color:var(--gris-500);margin-bottom:6px">📋 Historial de cambios</div>' + _renderHistorialTimeline(historial) + '</div>'
      : '';
  }

  // Versiones de borrador
  const verEl = document.getElementById('facDetVersiones');
  if (verEl) {
    if (esBorrador && typeof _cargarVersionesBorrador === 'function') {
      const versiones = await _cargarVersionesBorrador(f.id);
      if (versiones && versiones.length) {
        verEl.innerHTML = '<div style="margin-top:12px;border-top:1px solid var(--gris-200);padding-top:10px">'
          + '<div style="font-size:12px;font-weight:700;color:var(--gris-500);margin-bottom:6px">📄 Versiones del borrador</div>'
          + _renderVersionesBorrador(versiones)
          + '</div>';
      } else {
        verEl.innerHTML = '';
      }
    } else {
      verEl.innerHTML = '';
    }
  }

  // Botones Editar / Eliminar (usa esBorrador, esRectificativa, tieneRectificativa de arriba)
  const btnEditarEl = document.getElementById('facDetBtnEditar');
  const btnEliminarEl = document.getElementById('facDetBtnEliminar');

  if (btnEditarEl) {
    if (esBorrador && !esRectificativa) {
      btnEditarEl.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="abrirEditor('factura',${f.id});closeModal('mFacturaDetalle')" title="Editar">✏️ Editar</button>`;
    } else {
      btnEditarEl.innerHTML = '';
    }
  }
  if (btnEliminarEl) {
    if (!esRectificativa && !tieneRectificativa && esBorrador) {
      btnEliminarEl.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="delFactura(${f.id});closeModal('mFacturaDetalle')" title="Eliminar" style="color:var(--rojo)">🗑️ Eliminar</button>`;
    } else {
      btnEliminarEl.innerHTML = '';
    }
  }

  openModal('mFacturaDetalle', true);
}

// ═══════════════════════════════════════════════
//  ELIMINAR FACTURA
// ═══════════════════════════════════════════════
async function delFactura(id) {
  const f = facLocalData.find(x => x.id === id);
  if (f) {
    if (f.rectificativa_de) { toast('No se puede eliminar una factura rectificativa', 'error'); return; }
    if (facLocalData.some(r => r.rectificativa_de === id)) { toast('No se puede eliminar: tiene rectificativa asociada', 'error'); return; }
    const esBorr = f.estado === 'borrador' || (f.numero || '').startsWith('BORR-');
    if (!esBorr) { toast('Solo se pueden eliminar facturas en borrador', 'error'); return; }
  }
  if (!confirm('¿Eliminar esta factura?')) return;
  await sb.from('facturas').delete().eq('id', id);
  facLocalData = facLocalData.filter(x => x.id !== id);
  facFiltrados = facFiltrados.filter(x => x.id !== id);
  window.facturasData = facLocalData;
  filtrarFacturas();
  toast('Eliminada', 'info');
  loadDashboard();
}

// ═══════════════════════════════════════════════
//  EXPORTAR A EXCEL
// ═══════════════════════════════════════════════
function exportarFacturas() {
  if (!window.XLSX) { toast('Cargando librería Excel...', 'info'); return; }
  const lista = facFiltrados.length ? facFiltrados : facLocalData;
  if (!confirm('¿Exportar ' + lista.length + ' facturas a Excel?')) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Número', 'Cliente', 'Fecha', 'Vencimiento', 'Base imponible', 'IVA', 'Total', 'Estado'],
    ...lista.map(f => [
      f.numero || '', f.cliente_nombre || '',
      f.fecha || '', f.fecha_vencimiento || '',
      f.base_imponible || 0, f.total_iva || 0, f.total || 0,
      f.estado || ''
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
  XLSX.writeFile(wb, 'facturas_' + new Date().toISOString().split('T')[0] + '.xlsx');
  toast('Exportado ✓', 'success');
}

// ═══════════════════════════════════════════════
//  NUMERACIÓN CORRELATIVA DE BORRADORES
// ═══════════════════════════════════════════════
async function _generarNumeroBorrador() {
  // 1. Buscar en facturas actuales con número BORR-%
  const { data } = await sb.from('facturas')
    .select('numero')
    .eq('empresa_id', EMPRESA.id)
    .not('numero', 'is', null)
    .like('numero', 'BORR-%')
    .order('created_at', { ascending: false })
    .limit(100);

  let maxNum = 0;
  if (data?.length) {
    data.forEach(d => {
      const match = (d.numero || '').match(/BORR-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
  }

  // 2. También buscar en snapshots de factura_versiones
  //    (borradores emitidos pierden su BORR-XXXX pero el snapshot lo conserva)
  const { data: snaps } = await sb.from('factura_versiones')
    .select('snapshot')
    .order('created_at', { ascending: false })
    .limit(200);
  if (snaps?.length) {
    snaps.forEach(s => {
      const num = s.snapshot?.numero || '';
      const match = num.match(/BORR-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
  }

  return 'BORR-' + String(maxNum + 1).padStart(4, '0');
}

// ═══════════════════════════════════════════════
//  VERSIONADO DE BORRADORES
//  Guarda snapshot completo en factura_versiones cada vez que se modifica
// ═══════════════════════════════════════════════
async function _guardarVersionBorrador(facturaId, datos, versionNum) {
  const { error } = await sb.from('factura_versiones').insert({
    factura_id: facturaId,
    version: versionNum,
    snapshot: datos,
  });
  if (error) {
    console.error('Error guardando versión borrador v' + versionNum + ':', error.message);
    // Si la tabla no existe, informar
    if (error.message && error.message.includes('factura_versiones')) {
      toast('⚠️ Tabla factura_versiones no existe. Ejecuta el SQL en Supabase.', 'error');
    }
  } else {
    console.log('✅ Versión borrador v' + versionNum + ' guardada OK');
  }
}

async function _cargarVersionesBorrador(facturaId) {
  const { data } = await sb.from('factura_versiones')
    .select('*')
    .eq('factura_id', facturaId)
    .order('version', { ascending: false })
    .limit(50);
  return data || [];
}

function _renderVersionesBorrador(versiones) {
  if (!versiones.length) return '<div style="color:var(--gris-400);font-size:12px;padding:8px 0">Sin versiones anteriores</div>';

  return '<div style="display:flex;flex-direction:column;gap:4px">' +
    versiones.map(v => {
      const fecha = v.created_at ? new Date(v.created_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
      const snap = v.snapshot || {};
      const total = snap.total != null ? fmtE(snap.total) : '—';
      const lineas = Array.isArray(snap.lineas) ? snap.lineas.filter(l => !l._separator).length : 0;
      return `<div onclick="_verVersionBorrador(${v.id})" style="display:flex;align-items:center;gap:8px;font-size:12px;padding:8px 10px;border-radius:6px;background:var(--gris-50);border:1px solid var(--gris-100);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--azul-light)'" onmouseout="this.style.background='var(--gris-50)'">
        <span style="font-weight:800;color:var(--azul);min-width:30px">v${v.version}</span>
        <span style="flex:1">${lineas} líneas · ${total}</span>
        <span style="color:var(--gris-400);font-size:11px">${v.usuario_nombre || ''}</span>
        <span style="color:var(--gris-400);font-size:10px;min-width:80px;text-align:right">${fecha}</span>
        <span style="font-size:11px;color:var(--azul);font-weight:600" title="Ver detalle">👁️</span>
      </div>`;
    }).join('') + '</div>';
}

// Ver detalle de una versión concreta de borrador
async function _verVersionBorrador(versionId) {
  const { data: v, error } = await sb.from('factura_versiones')
    .select('*').eq('id', versionId).single();
  if (error || !v) { toast('Error cargando versión', 'error'); return; }

  const snap = v.snapshot || {};
  const fecha = v.created_at ? new Date(v.created_at).toLocaleString('es-ES') : '';
  const lineas = Array.isArray(snap.lineas) ? snap.lineas.filter(l => !l._separator) : [];

  // Tabla de líneas
  let lineasHtml = '';
  if (lineas.length) {
    lineasHtml = `<table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead style="background:var(--gris-50)">
        <tr>
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:left">Descripción</th>
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--gris-500);width:50px;text-align:right">Cant.</th>
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--gris-500);width:80px;text-align:right">Precio</th>
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--gris-500);width:50px;text-align:right">IVA</th>
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--gris-500);width:80px;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>` +
      lineas.map(l => {
        const sub = (l.cant||1) * (l.precio||0) * (1 - (l.dto||0)/100);
        const tot = sub * (1 + (l.iva||21)/100);
        return `<tr style="border-bottom:1px solid var(--gris-100)">
          <td style="padding:6px 8px;font-size:12px">${l.desc || '—'}</td>
          <td style="padding:6px 8px;font-size:12px;text-align:right">${l.cant||1}</td>
          <td style="padding:6px 8px;font-size:12px;text-align:right">${fmtE(l.precio||0)}</td>
          <td style="padding:6px 8px;font-size:12px;text-align:right">${l.iva||21}%</td>
          <td style="padding:6px 8px;font-size:12px;text-align:right;font-weight:600">${fmtE(tot)}</td>
        </tr>`;
      }).join('') +
      `</tbody></table>`;
  }

  // Determinar si la factura actual es borrador (para mostrar u ocultar Restaurar)
  const _facObjVer = facLocalData.find(f => f.id === v.factura_id);
  const _esBorrVer = _facObjVer && _facObjVer.estado === 'borrador';

  // Overlay modal para la versión (estilos inline para funcionar desde cualquier contexto)
  const prev = document.getElementById('mVersionBorrador');
  if (prev) prev.remove();
  const overlay = document.createElement('div');
  overlay.id = 'mVersionBorrador';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div style="background:white;border-radius:16px;max-width:700px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
    <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #eee">
      <span style="font-size:22px">📄</span>
      <div style="flex:1">
        <h2 style="margin:0;font-size:15px;font-weight:800">Versión ${v.version}</h2>
        <div style="font-size:11px;color:#888">${fecha}</div>
      </div>
      ${_esBorrVer ? `<button onclick="_restaurarVersionBorrador(${v.factura_id},${v.id})" style="padding:6px 14px;border-radius:8px;background:#D1FAE5;color:#065F46;border:1px solid #10B981;font-size:12px;font-weight:700;cursor:pointer">♻️ Restaurar</button>` : ''}
      <button onclick="document.getElementById('mVersionBorrador').remove()" style="padding:6px 10px;border:none;background:none;font-size:18px;cursor:pointer;color:#999">✕</button>
    </div>
    <div style="padding:16px 20px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div><span style="font-size:11px;color:#888">Cliente</span><div style="font-weight:600;font-size:13px">${snap.cliente_nombre || '—'}</div></div>
        <div><span style="font-size:11px;color:#888">Fecha</span><div style="font-weight:600;font-size:13px">${snap.fecha || '—'}</div></div>
        <div><span style="font-size:11px;color:#888">Total</span><div style="font-weight:700;font-size:15px;color:#2563eb">${fmtE(snap.total || 0)}</div></div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">${lineasHtml || '<div style="padding:12px;color:#888">Sin líneas</div>'}</div>
      ${snap.observaciones ? '<div style="margin-top:8px;padding:8px 10px;background:#f9fafb;border-radius:8px;font-size:12px;color:#555">' + snap.observaciones + '</div>' : ''}
    </div>
    <div style="padding:12px 20px;border-top:1px solid #eee;display:flex;justify-content:flex-end">
      <button onclick="document.getElementById('mVersionBorrador').remove()" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:white;cursor:pointer;font-weight:600;font-size:13px">Cerrar</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

// Restaurar una versión anterior del borrador
async function _restaurarVersionBorrador(facturaId, versionId) {
  if (!confirm('¿Restaurar esta versión?\n\nSe creará una nueva versión con los datos de la seleccionada. No se pierde nada.')) return;

  const { data: v, error } = await sb.from('factura_versiones')
    .select('snapshot').eq('id', versionId).single();
  if (error || !v) { toast('Error cargando versión', 'error'); return; }

  // 1. Guardar el estado ACTUAL como nueva versión antes de sobreescribir
  const fActual = facLocalData.find(x => x.id === facturaId);
  if (fActual) {
    try {
      const countRes = await sb.from('factura_versiones').select('*', { count: 'exact', head: true })
        .eq('factura_id', facturaId);
      const vNum = ((countRes.count) || 0) + 1;
      await _guardarVersionBorrador(facturaId, fActual, vNum);
    } catch(e) { console.warn('Error guardando versión actual:', e); }
  }

  // 2. Aplicar los datos de la versión restaurada
  const snap = v.snapshot || {};
  const hoy = new Date().toISOString().split('T')[0];
  const updateObj = {
    lineas: snap.lineas || [],
    cliente_id: snap.cliente_id || null,
    cliente_nombre: snap.cliente_nombre || '',
    base_imponible: snap.base_imponible || 0,
    total_iva: snap.total_iva || 0,
    total: snap.total || 0,
    observaciones: snap.observaciones || null,
    fecha: hoy,
  };

  const { error: upErr } = await sb.from('facturas').update(updateObj).eq('id', facturaId);
  if (upErr) { toast('Error restaurando: ' + upErr.message, 'error'); return; }

  // 3. Guardar la restauración como nueva versión también
  try {
    const countRes2 = await sb.from('factura_versiones').select('*', { count: 'exact', head: true })
      .eq('factura_id', facturaId);
    const vNum2 = ((countRes2.count) || 0) + 1;
    await _guardarVersionBorrador(facturaId, { ...updateObj, id: facturaId, numero: fActual?.numero }, vNum2);
  } catch(e) { console.warn('Error guardando versión restaurada:', e); }

  // Cerrar modales
  const mVer = document.getElementById('mVersionBorrador');
  if (mVer) mVer.remove();
  closeModal('mFacturaDetalle');

  // Recargar y volver a abrir
  await loadFacturas();
  toast('♻️ Versión restaurada (nueva versión creada) ✓', 'success');
  verDetalleFactura(facturaId);
}

// ═══════════════════════════════════════════════
//  VERSIONES (desplegable desde la lista, como presupuestos)
// ═══════════════════════════════════════════════
async function toggleFacVersiones(facId, btnEl) {
  const row = document.querySelector(`tr[data-fac-row="${facId}"]`);
  if (!row) return;
  // Si ya hay subfilas expandidas, las quito
  const expanded = row.parentElement.querySelectorAll(`tr[data-fac-ver-of="${facId}"]`);
  if (expanded.length) {
    expanded.forEach(r => r.remove());
    btnEl.innerHTML = btnEl.innerHTML.replace('▴','▾');
    return;
  }
  const { data: vers, error } = await sb.from('factura_versiones')
    .select('*').eq('factura_id', facId).order('version', {ascending:false});
  if (error) { toast('Error cargando versiones: '+error.message,'error'); return; }
  if (!vers || !vers.length) { toast('No hay versiones anteriores','info'); return; }

  const nCols = row.children.length;
  const fmtEur = v => (v||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
  const maxVer = vers[0].version;
  const facObj = facLocalData.find(f => f.id === facId);
  const esBorrador = facObj && facObj.estado === 'borrador';
  let insertAfter = row;
  vers.forEach(v => {
    const d = v.snapshot || {};
    const fecha = new Date(v.created_at).toLocaleDateString('es-ES');
    const hora = new Date(v.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    const esActual = v.version === maxVer;
    const subRow = document.createElement('tr');
    subRow.setAttribute('data-fac-ver-of', facId);
    subRow.style.cssText = 'background:#f8fafc;border-left:3px solid var(--azul)';
    // Solo mostrar Restaurar si es borrador y no es la versión actual
    const btnRestaurar = (esBorrador && !esActual) ? `<button onclick="event.stopPropagation();_restaurarVersionBorrador(${facId},${v.id})" title="Restaurar esta versión" style="padding:4px 10px;border-radius:6px;border:1px solid var(--naranja);background:#fff;color:var(--naranja);cursor:pointer;font-size:11px;font-weight:600">♻️ Restaurar</button>` : '';
    subRow.innerHTML = `<td colspan="${nCols}" style="padding:8px 16px 8px 40px">
      <div style="display:flex;align-items:center;gap:14px;font-size:12px">
        <span style="font-weight:700;color:var(--azul);min-width:30px">v${v.version}</span>
        ${esActual ? '<span style="font-size:9px;background:#D1FAE5;color:#065F46;padding:2px 6px;border-radius:4px;font-weight:700">ACTUAL</span>' : ''}
        <span style="color:var(--gris-500)">${fecha} ${hora}</span>
        <span style="color:var(--gris-600);flex:1">${d.cliente_nombre||'—'} · ${fmtEur(d.total||0)}</span>
        <button onclick="event.stopPropagation();_verVersionBorrador(${v.id})" title="Ver esta versión" style="padding:4px 10px;border-radius:6px;border:1px solid var(--azul);background:#fff;color:var(--azul);cursor:pointer;font-size:11px;font-weight:600">👁️ Ver</button>
        ${btnRestaurar}
      </div>
    </td>`;
    insertAfter.after(subRow);
    insertAfter = subRow;
  });
  btnEl.innerHTML = btnEl.innerHTML.replace('▾','▴');
}

// ═══════════════════════════════════════════════
//  EMITIR FACTURA DEFINITIVA (borrador → factura real)
//  Asigna número correlativo, genera registro para VeriFactu
// ═══════════════════════════════════════════════
async function emitirFacturaDefinitiva(id) {
  const f = facLocalData.find(x => x.id === id);
  if (!f) { toast('Factura no encontrada', 'error'); return; }
  if (f.estado !== 'borrador') { toast('Solo se pueden emitir borradores', 'error'); return; }
  if (!(f.numero || '').startsWith('BORR-')) { toast('Este documento ya tiene número asignado', 'error'); return; }

  // Validar que tiene cliente y líneas
  if (!f.cliente_id) { toast('El borrador no tiene cliente asignado', 'error'); return; }
  const lineas = f.lineas || [];
  if (!lineas.filter(l => !l._separator).length) { toast('El borrador no tiene líneas', 'error'); return; }

  const okEmitir = await confirmModal({
    icono: '🧾',
    titulo: 'Emitir factura definitiva',
    mensaje: `Se asignará un número correlativo <strong style="color:#059669">definitivo</strong> y ya no se podrá editar.<br><br>Borrador actual: <strong>${f.numero}</strong>`,
    aviso: 'Esta acción no se puede deshacer',
    btnOk: 'Emitir factura',
    btnCancel: 'Cancelar'
  });
  if (!okEmitir) return;

  const vfActivo = _isVfActivo();
  const pasos = [
    { label: 'Generando número correlativo', sub: 'Consultando serie...' },
    { label: 'Guardando factura', sub: 'Actualizando base de datos...' },
    ...(vfActivo ? [
      { label: 'Registrando en AEAT', sub: 'Enviando XML firmado...' },
      { label: 'Verificando respuesta', sub: 'Procesando resultado...' },
    ] : []),
  ];
  _showStepper('Emitiendo factura', pasos);

  try {
    // Paso 1: Generar número
    _updateStep(0, 'Consultando serie de facturación...');
    const numero = await generarNumeroDoc('factura');
    const hoy = new Date().toISOString().split('T')[0];

    // Paso 2: Guardar
    _updateStep(1, 'Guardando ' + numero + '...');
    // Determinar tipo VeriFactu automáticamente
    const tipoVF = _determinarTipoFacturaVF(f);
    const updateObj = {
      numero,
      estado: 'pendiente',
      fecha: f.fecha || hoy,
      fecha_vencimiento: f.fecha_vencimiento || null,
      borrador_origen: f.numero,
      tipo_rectificativa: tipoVF,  // F1, F2 o F3 — la Edge Function lo lee
    };

    const { error } = await sb.from('facturas').update(updateObj).eq('id', id);
    if (error) {
      // Fallback: quitar campos opcionales si la columna no existe
      if (error.message && (error.message.includes('borrador_origen') || error.message.includes('tipo_rectificativa') || error.message.includes('column'))) {
        delete updateObj.borrador_origen;
        delete updateObj.tipo_rectificativa;
        const r2 = await sb.from('facturas').update(updateObj).eq('id', id);
        if (r2.error) { _stepperDone(r2.error.message, false); return; }
      } else {
        _stepperDone(error.message, false); return;
      }
    }

    await _registrarCambioEstado('factura', id, 'borrador', 'pendiente');

    if (f.estado_cobro === 'cobrado' || f._cobrado) {
      await sb.from('facturas').update({ estado: 'cobrada' }).eq('id', id);
      await _registrarCambioEstado('factura', id, 'pendiente', 'cobrada');
    }

    closeModal('mFacturaDetalle');
    await loadFacturas();
    loadDashboard();

    // Paso 3-4: VeriFactu
    if (vfActivo) {
      _updateStep(2, 'Enviando ' + numero + ' a AEAT...');
      try {
        await enviarFacturaAEAT(id, 'alta', { auto: true, stepper: true });
        _updateStep(3);
        const fUpd = facLocalData.find(x => x.id === id);
        const estado = fUpd?.verifactu_estado || 'enviado';
        if (estado === 'correcto' || estado === 'simulado') {
          _stepperDone('Factura ' + numero + ' registrada en AEAT ✓', true);
        } else if (estado === 'aceptado_errores') {
          _stepperDone('Aceptada con avisos', true);
        } else {
          _stepperDone('AEAT: ' + estado, false);
        }
      } catch (e) {
        _stepperDone('Error AEAT: ' + (e.message || ''), false);
      }
    } else {
      _stepperDone('Factura ' + numero + ' emitida ✓', true);
    }
  } catch (err) {
    _stepperDone(err.message || 'Error inesperado', false);
  }
}

// ═══════════════════════════════════════════════
//  INICIALIZACIÓN Y APERTURA
// ═══════════════════════════════════════════════
async function nuevaFacturaRapida() {
  frLineas = [];
  frClienteActual = cliActualId;

  const sel = document.getElementById('fr_cliente');
  sel.innerHTML = '<option value="">— Selecciona cliente —</option>' +
    clientes.map(c => `<option value="${c.id}" ${c.id===cliActualId?'selected':''}>${c.nombre}</option>`).join('');

  const serSel = document.getElementById('fr_serie');
  const serFact = (series||[]).filter(s => s.tipo === 'factura' || s.tipo === 'fact');
  const serUsables = serFact.length ? serFact : (series||[]);
  if (serUsables.length) {
    serSel.innerHTML = serUsables.map(s => `<option value="${s.id}">${s.serie ? s.serie + '-' : s.prefijo || s.nombre || 'FAC-'}</option>`).join('');
  } else {
    serSel.innerHTML = '<option value="">FAC-</option>';
  }
  document.getElementById('fr_numero').value = await generarNumeroDoc('factura');

  const fpSel = document.getElementById('fr_fpago');
  fpSel.innerHTML = '<option value="">— Sin especificar —</option>' +
    formasPago.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');

  if (cliActualId) {
    const c = clientes.find(x => x.id === cliActualId);
    if (c?.forma_pago_id) fpSel.value = c.forma_pago_id;
  }

  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fr_fecha').value = hoy;
  const v = new Date(); v.setDate(v.getDate()+30);
  document.getElementById('fr_vence').value = v.toISOString().split('T')[0];

  fr_addLinea();
  openModal('mFacturaRapida', true);
}

// ═══════════════════════════════════════════════
//  GENERACIÓN DE NÚMERO
// ═══════════════════════════════════════════════
async function fr_generarNumero(serieId) {
  const s = series.find(x => x.id == serieId);
  if (!s) return;
  const { count } = await sb.from('facturas').select('*', {count:'exact',head:true})
    .eq('empresa_id', EMPRESA.id).eq('serie_id', serieId);
  const num = (s.siguiente_numero || 1) + (count || 0);
  const pre = s.prefijo || (s.serie ? s.serie + '-' : 'FAC-');
  document.getElementById('fr_numero').value = pre + String(num).padStart(s.digitos||4,'0');
}

// ═══════════════════════════════════════════════
//  ACTUALIZACIÓN DE CLIENTE
// ═══════════════════════════════════════════════
function fr_actualizarCliente(id) {
  frClienteActual = id ? parseInt(id) : null;
  const c = clientes.find(x => x.id === frClienteActual);
  if (c?.forma_pago_id) document.getElementById('fr_fpago').value = c.forma_pago_id;
}

// ═══════════════════════════════════════════════
//  GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function fr_addLinea() {
  frLineas.push({ desc:'', cant:1, precio:0, dto1:0, dto2:0, dto3:0, iva:21 });
  fr_renderLineas();
  setTimeout(()=>{
    const all = document.querySelectorAll('#fr_lineas input[data-ac="articulos"]');
    const last = all[all.length-1];
    if (last) last.focus();
  },50);
}

function fr_removeLinea(idx) {
  frLineas.splice(idx, 1);
  fr_renderLineas();
}

function fr_updateLinea(idx, field, val) {
  // Si se acaba de seleccionar un artículo, no dejar que onblur sobreescriba desc con el texto parcial
  if (field === 'desc' && _frArtSelecting) return;
  if (field === 'dto1' || field === 'dto2' || field === 'dto3' || field === 'cant' || field === 'precio' || field === 'iva') {
    frLineas[idx][field] = parseFloat(val)||0;
  } else {
    frLineas[idx][field] = field === 'desc' ? val : parseFloat(val)||0;
  }
  fr_renderLineas();
}

function renderPPartidas(list) {
  let base = 0, ivaTotal = 0;
  document.getElementById('fr_lineas').innerHTML = frLineas.map((l, i) => {
    const subtotal = l.cant * l.precio * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
    const ivaAmt = subtotal * (l.iva/100);
    base += subtotal;
    ivaTotal += ivaAmt;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 10px"><input value="${l.desc}" placeholder="Descripción del artículo o servicio..."
        onchange="fr_updateLinea(${i},'desc',this.value)"
        style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.cant}" min="0.01" step="0.01"
        onchange="fr_updateLinea(${i},'cant',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01"
        onchange="fr_updateLinea(${i},'precio',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto1||0}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto1',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 1"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto2||0}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto2',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 2"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto3||0}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto3',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 3"></td>
      <td style="padding:7px 6px">
        <select onchange="fr_updateLinea(${i},'iva',this.value)"
          style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${tiposIva.map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(subtotal+ivaAmt)}</td>
      <td style="padding:7px 4px">
        <button onclick="fr_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button>
      </td>
    </tr>`;
  }).join('');

  const total = base + ivaTotal;
  document.getElementById('fr_base').textContent = fmtE(base);
  document.getElementById('fr_iva_total').textContent = fmtE(ivaTotal);
  document.getElementById('fr_total').textContent = fmtE(total);
}

let _frArtSelecting = false;
function _fr_onSelectArt(lineaIdx, art) {
  _frArtSelecting = true;
  frLineas[lineaIdx].desc = art.nombre || '';
  frLineas[lineaIdx].precio = art.precio_venta || 0;
  frLineas[lineaIdx].articulo_id = art.id;
  frLineas[lineaIdx].codigo = art.codigo || '';
  if (art.tipo_iva_id && typeof tiposIva!=='undefined') {
    const t = tiposIva.find(x=>x.id===art.tipo_iva_id);
    if (t) frLineas[lineaIdx].iva = t.porcentaje;
  }
  // Defer render to avoid blur/innerHTML race condition
  setTimeout(() => { fr_renderLineas(); }, 0);
  toast(`📦 ${art.codigo||''} — ${art.nombre}`,'info');
  setTimeout(() => { _frArtSelecting = false; }, 300);
}

function fr_renderLineas() {
  let base = 0, ivaTotal = 0;
  document.getElementById('fr_lineas').innerHTML = frLineas.map((l, i) => {
    const subtotal = l.cant * l.precio * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
    const ivaAmt = subtotal * (l.iva/100);
    base += subtotal;
    ivaTotal += ivaAmt;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 10px"><input value="${l.desc}" placeholder="Código o descripción del artículo..."
        data-ac="articulos" data-linea-idx="${i}"
        oninput="acBuscarArticulo(this, _fr_onSelectArt, 'precio_venta')"
        onkeydown="acKeydown(event)"
        onfocus="if(this.value.length>=1)acBuscarArticulo(this, _fr_onSelectArt, 'precio_venta')"
        onblur="setTimeout(()=>{const d=document.getElementById('acArticulos');if(d)d.style.display='none'},200);fr_updateLinea(${i},'desc',this.value)"
        autocomplete="off"
        style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.cant}" min="0.01" step="0.01"
        onchange="fr_updateLinea(${i},'cant',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01"
        onchange="fr_updateLinea(${i},'precio',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto1||0}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto1',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 1"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto2||0}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto2',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 2"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto3||0}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto3',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none" title="Descuento 3"></td>
      <td style="padding:7px 6px">
        <select onchange="fr_updateLinea(${i},'iva',this.value)"
          style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${tiposIva.map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(subtotal+ivaAmt)}</td>
      <td style="padding:7px 4px">
        <button onclick="fr_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button>
      </td>
    </tr>`;
  }).join('');

  const total = base + ivaTotal;
  document.getElementById('fr_base').textContent = fmtE(base);
  document.getElementById('fr_iva_total').textContent = fmtE(ivaTotal);
  document.getElementById('fr_total').textContent = fmtE(total);
}

// ═══════════════════════════════════════════════
//  GUARDAR FACTURA
// ═══════════════════════════════════════════════
async function guardarFacturaRapida(estado) {
  if (_creando) return;
  _creando = true;
  try {
    const clienteId = parseInt(document.getElementById('fr_cliente').value);
    if (!clienteId) { toast('Selecciona un cliente','error'); return; }

    const lineasValidas = frLineas.filter(l => l.desc || l.precio > 0);
    if (!lineasValidas.length) { toast('Añade al menos una línea','error'); return; }

    const c = clientes.find(x => x.id === clienteId);
    const serieId = parseInt(document.getElementById('fr_serie').value) || null;
    // Borradores: numeración correlativa propia BORR-0001...
    let numero = document.getElementById('fr_numero').value;
    if (estado === 'borrador' && typeof _generarNumeroBorrador === 'function') {
      numero = await _generarNumeroBorrador();
    }

    let base = 0, ivaTotal = 0;
    lineasValidas.forEach(l => {
      const sub = l.cant * l.precio * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
      base += sub;
      ivaTotal += sub * (l.iva/100);
    });

    const obj = {
      empresa_id: EMPRESA.id,
      numero, serie_id: serieId,
      cliente_id: clienteId,
      cliente_nombre: c?.nombre || '',
      fecha: document.getElementById('fr_fecha').value,
      fecha_vencimiento: document.getElementById('fr_vence').value || null,
      forma_pago_id: parseInt(document.getElementById('fr_fpago').value) || null,
      base_imponible: Math.round(base*100)/100,
      total_iva: Math.round(ivaTotal*100)/100,
      total: Math.round((base+ivaTotal)*100)/100,
      estado,
      observaciones: document.getElementById('fr_obs').value || null,
      lineas: lineasValidas,
    };

    // Mostrar stepper si es factura emitida con VeriFactu
    const vfActivo = estado === 'pendiente' && _isVfActivo();
    if (vfActivo) {
      _showStepper('Emitiendo factura', [
        { label: 'Guardando factura', sub: 'Insertando ' + (obj.numero || '') + '...' },
        { label: 'Registrando en AEAT', sub: 'Enviando XML firmado...' },
        { label: 'Verificando respuesta', sub: 'Procesando resultado...' },
      ]);
      _updateStep(0, 'Guardando ' + (obj.numero || '') + '...');
    }

    const { error } = await sb.from('facturas').insert(obj);
    if (error) {
      if (vfActivo) _stepperDone(error.message, false);
      else toast('Error: ' + error.message, 'error');
      return;
    }

    closeModal('mFacturaRapida');
    if (!vfActivo) toast(estado === 'pendiente' ? '🧾 Factura emitida ✓' : '💾 Borrador guardado ✓', 'success');

    // Refrescar listado de facturas
    await loadFacturas();
    if (cliActualId) await abrirFicha(cliActualId);
    await loadPresupuestos();
    loadDashboard();

    // ── VeriFactu: envío automático si es factura emitida (no borrador) ──
    if (vfActivo) {
      _updateStep(1, 'Enviando ' + numero + ' a AEAT...');
      const facCreada = facLocalData.find(f => f.numero === numero);
      if (facCreada) {
        try {
          await enviarFacturaAEAT(facCreada.id, 'alta', { auto: true, stepper: true });
          _updateStep(2);
          const fUpd = facLocalData.find(x => x.id === facCreada.id);
          const est = fUpd?.verifactu_estado || 'enviado';
          if (est === 'correcto' || est === 'simulado') {
            _stepperDone('Factura ' + numero + ' registrada en AEAT ✓', true);
          } else if (est === 'aceptado_errores') {
            _stepperDone('Aceptada con avisos', true);
          } else {
            _stepperDone('AEAT: ' + est, false);
          }
        } catch (e) {
          _stepperDone('Error AEAT: ' + (e.message || ''), false);
        }
      } else {
        _stepperDone('Factura guardada (no encontrada para AEAT)', false);
      }
    }
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  ALIASES PARA COMPATIBILIDAD
// ═══════════════════════════════════════════════
function p_addPartida() { fr_addLinea(); }
function p_removePartida(idx) { fr_removeLinea(idx); }
function p_updatePartida(idx, field, val) { fr_updateLinea(idx, field, val); }

async function abrirFacturaRapida() {
  await nuevaFacturaRapida();
}

// ═══════════════════════════════════════════════
//  FACTURA RECTIFICATIVA
// ═══════════════════════════════════════════════
//  Generar número correlativo para rectificativas (serie propia RECT-)
// ═══════════════════════════════════════════════
async function _generarNumeroRectificativa() {
  // Buscar serie configurada para rectificativas
  const sRect = (series||[]).find(s => s.tipo === 'factura_rectificativa');
  const prefijo = sRect?.serie ? sRect.serie + '-' : sRect?.prefijo || 'R-';
  const digitos = sRect?.digitos || 4;

  const { data } = await sb.from('facturas')
    .select('numero')
    .eq('empresa_id', EMPRESA.id)
    .not('numero', 'is', null)
    .not('rectificativa_de', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  let maxNum = 0;
  if (data?.length) {
    data.forEach(d => {
      const match = (d.numero || '').match(/(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
  }
  return prefijo + String(maxNum + 1).padStart(digitos, '0');
}

// ═══════════════════════════════════════════════
//  CREAR RECTIFICATIVA — Según documentación AEAT VeriFactu
//  Dos flujos: "I" (por diferencias) y "S" (por sustitución)
//  Ref: https://sede.agenciatributaria.gob.es/.../procedimientos-facturacion.html
// ═══════════════════════════════════════════════

// Estado temporal del editor de rectificativa
let _rectOrig = null;         // factura original
let _rectLineas = [];         // líneas editables
let _rectTipo = 'I';          // 'I' o 'S'
let _rectTipoR = 'R1';       // R1-R5 (tipo registro AEAT)

// ── Determinar tipo factura VeriFactu automáticamente ──
// F1 = completa (con destinatario), F2 = simplificada (sin destinatario, ≤400€/3000€),
// F3 = sustitutiva de simplificada, R1-R5 = rectificativas
function _determinarTipoFacturaVF(fac) {
  // Rectificativas: el tipo lo elige el usuario (R1-R5)
  if (fac.rectificativa_de) return fac.tipo_rectificativa || 'R1';
  // F3: sustitutiva de simplificada — se marca manualmente
  if (fac.tipo_rectificativa === 'F3') return 'F3';
  // F2: simplificada — sin destinatario
  if (!fac.cliente_id && !fac.cliente_nombre) return 'F2';
  // Verificar si el cliente tiene NIF/CIF — si no, podría ser simplificada
  const cli = (typeof clientes !== 'undefined' ? clientes : []).find(c => c.id === fac.cliente_id);
  if (cli && !cli.nif && !cli.cif && (fac.total || 0) <= 400) return 'F2';
  // Por defecto: F1 completa
  return 'F1';
}

async function crearRectificativa(id) {
  const orig = facLocalData.find(x => x.id === id);
  if (!orig) { toast('Factura no encontrada', 'error'); return; }
  if (orig.estado === 'borrador') { toast('No puedes rectificar un borrador', 'error'); return; }
  if (orig.rectificativa_de) { toast('Esta factura ya es una rectificativa', 'error'); return; }

  // Comprobar si ya existe rectificativa para esta factura
  const yaRect = facLocalData.find(f => f.rectificativa_de === id);
  if (yaRect) { toast('Ya existe la rectificativa ' + yaRect.numero, 'warning'); return; }

  _rectOrig = orig;
  // Mostrar selector de tipo
  _mostrarSelectorTipoRect();
}

function _mostrarSelectorTipoRect() {
  const orig = _rectOrig;
  // Cerrar modal detalle para evitar conflictos de z-index
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));

  const ol = document.createElement('div');
  ol.id = 'rectTipoSelector';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10001;display:flex;align-items:center;justify-content:center';
  ol.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:520px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <h3 style="margin:0 0 6px;font-size:17px;font-weight:800;color:#1e293b">Rectificar factura ${orig.numero}</h3>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b">Original: ${fmtE(orig.base_imponible||0)} base + ${fmtE(orig.total_iva||0)} IVA = <b>${fmtE(orig.total||0)}</b></p>

      <div style="display:flex;flex-direction:column;gap:10px">
        <button id="_rectBtnI" style="text-align:left;padding:16px 18px;border:2px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer;transition:all .15s">
          <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px">Por diferencias (I)</div>
          <div style="font-size:12px;color:#64748b;line-height:1.4">Corregir importes parcialmente. Solo se registra la diferencia.<br>
          <span style="color:#3b82f6">Ejemplo: quitar una línea de 200€ → rectificativa de -200€</span></div>
        </button>
        <button id="_rectBtnS" style="text-align:left;padding:16px 18px;border:2px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer;transition:all .15s">
          <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px">Por sustitución (S)</div>
          <div style="font-size:12px;color:#64748b;line-height:1.4">Reemplazar la factura completa con importes correctos.<br>
          <span style="color:#f59e0b">Ejemplo: factura de 1.000€ debía ser 800€ → rectificativa con 800€</span></div>
        </button>
      </div>

      <div style="margin-top:16px;text-align:right">
        <button id="_rectBtnCancel" style="padding:8px 18px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#64748b">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(ol);

  // Event listeners (más fiable que onclick inline)
  document.getElementById('_rectBtnI').addEventListener('click', () => _iniciarRectificativa('I'));
  document.getElementById('_rectBtnS').addEventListener('click', () => _iniciarRectificativa('S'));
  document.getElementById('_rectBtnCancel').addEventListener('click', () => ol.remove());
  ol.addEventListener('click', e => { if (e.target === ol) ol.remove(); });
}

function _iniciarRectificativa(tipo) {
  document.getElementById('rectTipoSelector')?.remove();
  _rectTipo = tipo;
  _rectTipoR = 'R1';  // reset al tipo más habitual
  const orig = _rectOrig;

  // Copiar líneas originales para edición
  _rectLineas = (orig.lineas || []).filter(l => !l._separator).map(l => ({
    desc: l.desc || '', cant: l.cant || 0, precio: l.precio || 0,
    dto1: l.dto1 || 0, dto2: l.dto2 || 0, dto3: l.dto3 || 0,
    iva: l.iva || 21, articulo_id: l.articulo_id || null,
    _origCant: l.cant || 0, _origPrecio: l.precio || 0,
    _incluir: true  // checkbox para tipo I
  }));

  _mostrarEditorRect();
}

function _mostrarEditorRect() {
  const orig = _rectOrig;
  const esI = _rectTipo === 'I';
  const titulo = esI ? 'Rectificativa por diferencias (I)' : 'Rectificativa por sustitución (S)';
  const subtitulo = esI
    ? 'Desmarca o modifica las líneas que quieres corregir. Solo se registrará la diferencia.'
    : 'Ajusta las líneas al importe CORRECTO final. Se informará a AEAT del importe original y el nuevo.';

  const ol = document.createElement('div');
  ol.id = 'rectEditor';
  ol.className = 'overlay open';
  ol.style.cssText = 'z-index:10002';
  ol.innerHTML = `
    <div class="modal modal-lg" style="max-width:860px">
      <div class="modal-h">
        <span>${esI ? '📐' : '🔄'}</span>
        <h2>${titulo}</h2>
        <button class="btn btn-ghost btn-icon" onclick="document.getElementById('rectEditor').remove()">✕</button>
      </div>
      <div class="modal-b">
        <p style="font-size:12.5px;color:var(--gris-500);margin:0 0 12px">${subtitulo}</p>
        <div style="background:var(--gris-50);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px">
          <b>Factura original:</b> ${orig.numero} — ${fmtE(orig.base_imponible||0)} base + ${fmtE(orig.total_iva||0)} IVA = <b>${fmtE(orig.total||0)}</b>
        </div>

        <div style="border:1px solid var(--gris-200);border-radius:8px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse">
            <thead style="background:var(--gris-50)">
              <tr>
                ${esI ? '<th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--gris-500);width:36px;text-align:center">Incl.</th>' : ''}
                <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:left">Descripción</th>
                <th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--gris-500);width:70px">Cant.</th>
                <th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--gris-500);width:90px">Precio</th>
                <th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--gris-500);width:60px">IVA%</th>
                <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);width:90px;text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody id="rect_lineas"></tbody>
          </table>
        </div>

        <div id="rect_resumen" style="margin-top:14px"></div>

        <div class="fg" style="margin-top:12px"><label style="font-weight:700;font-size:12px;color:var(--gris-600);margin-bottom:4px;display:block">Tipo de rectificativa (AEAT)</label>
          <select id="rect_tipoR" onchange="_rectTipoR=this.value;document.getElementById('rect_tipoR_desc').textContent=this.options[this.selectedIndex].dataset.desc||''"
            style="width:100%;padding:8px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12.5px;font-family:var(--font);outline:none;background:#fff;cursor:pointer">
            <option value="R1" selected data-desc="Errores en importes, base imponible, tipo IVA, etc. Es la más habitual.">R1 — Error en datos o importes (art. 80.1, 80.2 y 80.6 LIVA)</option>
            <option value="R2" data-desc="El cliente está en concurso de acreedores y no puede pagar.">R2 — Concurso de acreedores (art. 80.3 LIVA)</option>
            <option value="R3" data-desc="El cliente no paga pasados los plazos legales: crédito incobrable.">R3 — Créditos incobrables (art. 80.4 LIVA)</option>
            <option value="R4" data-desc="Otros errores: datos de cabecera, destinatario incorrecto, etc.">R4 — Otras causas (art. 80 resto / art. 84 LIVA)</option>
            <option value="R5" data-desc="Solo para rectificar facturas simplificadas (sin destinatario).">R5 — Rectificativa de factura simplificada</option>
          </select>
          <div id="rect_tipoR_desc" style="font-size:11px;color:var(--gris-400);margin-top:4px;line-height:1.3">Errores en importes, base imponible, tipo IVA, etc. Es la más habitual.</div>
        </div>

        <div class="fg" style="margin-top:12px"><label>Motivo de la rectificación</label>
          <textarea id="rect_motivo" rows="2" style="width:100%;padding:8px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12.5px;resize:none;font-family:var(--font);outline:none"
            placeholder="Descripción del motivo (ej: error en cantidad, descuento no aplicado...)">Rectificativa de ${orig.numero}</textarea>
        </div>
      </div>
      <div class="modal-f">
        <button class="btn btn-secondary" onclick="document.getElementById('rectEditor').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_guardarRectificativa()">Emitir rectificativa</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
  _rectRenderLineas();
}

function _rectToggleLinea(idx) {
  _rectLineas[idx]._incluir = !_rectLineas[idx]._incluir;
  _rectRenderLineas();
}

function _rectUpdateLinea(idx, field, val) {
  if (field === 'cant' || field === 'precio' || field === 'iva') {
    _rectLineas[idx][field] = parseFloat(val) || 0;
  } else {
    _rectLineas[idx][field] = val;
  }
  _rectRenderLineas();
}

function _rectRenderLineas() {
  const esI = _rectTipo === 'I';
  const orig = _rectOrig;
  const baseOrig = parseFloat(orig.base_imponible) || 0;
  const ivaOrig = parseFloat(orig.total_iva) || 0;

  let baseRect = 0, ivaRect = 0;

  document.getElementById('rect_lineas').innerHTML = _rectLineas.map((l, i) => {
    const sub = l.cant * l.precio * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
    const iva = sub * (l.iva / 100);

    if (esI) {
      // Tipo I: calcular diferencia vs original
      if (l._incluir) {
        const origSub = l._origCant * l._origPrecio * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
        const diff = sub - origSub;
        const diffIva = diff * (l.iva / 100);
        baseRect += diff;
        ivaRect += diffIva;
      } else {
        // Línea desmarcada = se quita entera → diferencia negativa
        const origSub = l._origCant * l._origPrecio * (1 - (l.dto1||0)/100) * (1 - (l.dto2||0)/100) * (1 - (l.dto3||0)/100);
        baseRect -= origSub;
        ivaRect -= origSub * (l.iva / 100);
      }
    } else {
      // Tipo S: importes correctos finales
      baseRect += sub;
      ivaRect += iva;
    }

    const opacidad = (esI && !l._incluir) ? 'opacity:.4' : '';
    const disabled = (esI && !l._incluir) ? 'disabled' : '';

    return `<tr style="border-top:1px solid var(--gris-100);${opacidad}">
      ${esI ? `<td style="padding:7px 6px;text-align:center">
        <input type="checkbox" ${l._incluir ? 'checked' : ''} onchange="_rectToggleLinea(${i})" style="cursor:pointer">
      </td>` : ''}
      <td style="padding:7px 10px;font-size:12.5px">${l.desc}</td>
      <td style="padding:7px 6px"><input type="number" value="${l.cant}" step="0.01" ${disabled}
        onchange="_rectUpdateLinea(${i},'cant',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" step="0.01" ${disabled}
        onchange="_rectUpdateLinea(${i},'precio',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px">
        <select ${disabled} onchange="_rectUpdateLinea(${i},'iva',this.value)"
          style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${tiposIva.map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub)}</td>
    </tr>`;
  }).join('');

  // Resumen
  const totalRect = baseRect + ivaRect;
  const resumenEl = document.getElementById('rect_resumen');

  if (esI) {
    // Tipo I: mostrar la diferencia que se va a registrar
    const hayDiff = Math.abs(baseRect) > 0.005 || Math.abs(ivaRect) > 0.005;
    resumenEl.innerHTML = `
      <div style="display:flex;justify-content:flex-end">
        <div style="width:320px;background:${hayDiff ? '#fef3c7' : '#f1f5f9'};border-radius:9px;padding:14px">
          <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">
            Diferencia a registrar (tipo I)
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:var(--gris-500)">Base imponible</span><span style="font-weight:600;color:${baseRect<0?'#dc2626':'#16a34a'}">${baseRect>=0?'+':''}${fmtE(baseRect)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:var(--gris-500)">Cuota IVA</span><span style="font-weight:600;color:${ivaRect<0?'#dc2626':'#16a34a'}">${ivaRect>=0?'+':''}${fmtE(ivaRect)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:15px;font-weight:800;border-top:2px solid rgba(0,0,0,.1);margin-top:4px">
            <span>Total rectificación</span><span style="color:${totalRect<0?'#dc2626':'#16a34a'}">${totalRect>=0?'+':''}${fmtE(totalRect)}</span>
          </div>
          ${!hayDiff ? '<div style="font-size:11px;color:#ef4444;margin-top:4px">⚠️ No hay diferencia — modifica cantidades o desmarca líneas</div>' : ''}
        </div>
      </div>`;
  } else {
    // Tipo S: mostrar importes finales correctos + originales rectificados
    resumenEl.innerHTML = `
      <div style="display:flex;justify-content:flex-end;gap:12px">
        <div style="width:240px;background:#fee2e2;border-radius:9px;padding:14px">
          <div style="font-size:11px;font-weight:700;color:#991b1b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">
            Original (se rectifica)
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:#7f1d1d">Base</span><span style="font-weight:600;text-decoration:line-through">${fmtE(baseOrig)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:#7f1d1d">Cuota</span><span style="font-weight:600;text-decoration:line-through">${fmtE(ivaOrig)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;font-weight:700;border-top:1px solid rgba(0,0,0,.1);margin-top:2px"><span>Total</span><span style="text-decoration:line-through">${fmtE(baseOrig+ivaOrig)}</span></div>
        </div>
        <div style="width:240px;background:#dcfce7;border-radius:9px;padding:14px">
          <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">
            Correcto (nuevo importe)
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:#14532d">Base</span><span style="font-weight:600">${fmtE(baseRect)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:#14532d">Cuota</span><span style="font-weight:600">${fmtE(ivaRect)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:15px;font-weight:800;border-top:2px solid rgba(0,0,0,.1);margin-top:2px"><span>Total</span><span style="color:var(--azul)">${fmtE(totalRect)}</span></div>
        </div>
      </div>`;
  }
}

async function _guardarRectificativa() {
  const orig = _rectOrig;
  const esI = _rectTipo === 'I';
  const baseOrig = parseFloat(orig.base_imponible) || 0;
  const ivaOrig = parseFloat(orig.total_iva) || 0;
  const totalOrig = parseFloat(orig.total) || 0;
  const estabaCobrada = orig.estado === 'cobrada' || orig.estado === 'pagada';

  // Calcular importes según tipo
  let baseRect = 0, ivaRect = 0, lineasGuardar = [];

  if (esI) {
    // Tipo I: solo la diferencia
    _rectLineas.forEach(l => {
      const origSub = l._origCant * l._origPrecio * (1-(l.dto1||0)/100) * (1-(l.dto2||0)/100) * (1-(l.dto3||0)/100);
      if (l._incluir) {
        const newSub = l.cant * l.precio * (1-(l.dto1||0)/100) * (1-(l.dto2||0)/100) * (1-(l.dto3||0)/100);
        const diff = newSub - origSub;
        if (Math.abs(diff) > 0.005) {
          const diffCant = l.cant - l._origCant;
          const diffPrecio = l.precio !== l._origPrecio ? l.precio : l._origPrecio;
          lineasGuardar.push({
            desc: l.desc, cant: diffCant !== 0 ? diffCant : l.cant,
            precio: diffCant !== 0 ? l._origPrecio : (l.precio - l._origPrecio),
            dto1: l.dto1, dto2: l.dto2, dto3: l.dto3, iva: l.iva
          });
          baseRect += diff;
          ivaRect += diff * (l.iva / 100);
        }
      } else {
        // Línea eliminada: registrar con cantidad negativa
        lineasGuardar.push({
          desc: l.desc, cant: -(l._origCant), precio: l._origPrecio,
          dto1: l.dto1, dto2: l.dto2, dto3: l.dto3, iva: l.iva
        });
        baseRect -= origSub;
        ivaRect -= origSub * (l.iva / 100);
      }
    });

    if (Math.abs(baseRect) < 0.005 && Math.abs(ivaRect) < 0.005) {
      toast('No hay diferencia para rectificar', 'warning');
      return;
    }
  } else {
    // Tipo S: importes correctos finales
    _rectLineas.forEach(l => {
      const sub = l.cant * l.precio * (1-(l.dto1||0)/100) * (1-(l.dto2||0)/100) * (1-(l.dto3||0)/100);
      baseRect += sub;
      ivaRect += sub * (l.iva / 100);
      lineasGuardar.push({
        desc: l.desc, cant: l.cant, precio: l.precio,
        dto1: l.dto1, dto2: l.dto2, dto3: l.dto3, iva: l.iva
      });
    });

    // Comprobar que hay cambio real
    if (Math.abs(baseRect - baseOrig) < 0.005 && Math.abs(ivaRect - ivaOrig) < 0.005) {
      toast('Los importes son idénticos a la original — no hay nada que rectificar', 'warning');
      return;
    }
  }

  baseRect = Math.round(baseRect * 100) / 100;
  ivaRect = Math.round(ivaRect * 100) / 100;
  const totalRect = Math.round((baseRect + ivaRect) * 100) / 100;

  const motivo = document.getElementById('rect_motivo')?.value || 'Rectificativa de ' + orig.numero;
  // Leer tipo R seleccionado del desplegable
  _rectTipoR = document.getElementById('rect_tipoR')?.value || 'R1';

  // Confirmación con detalle completo
  const msgTipo = esI ? 'por diferencias (I)' : 'por sustitución (S)';
  const tipoRLabels = {R1:'Error datos/importes',R2:'Concurso acreedores',R3:'Créditos incobrables',R4:'Otras causas',R5:'Rect. simplificada'};
  const msgImporte = esI ? fmtE(totalRect) : fmtE(totalRect) + ' (antes: ' + fmtE(totalOrig) + ')';
  const okRect = await confirmModal({
    icono: '📋',
    titulo: 'Emitir rectificativa de ' + orig.numero,
    mensaje: `<div style="text-align:left;font-size:13px;line-height:1.8">
      <div><strong>Tipo corrección:</strong> ${msgTipo}</div>
      <div><strong>Tipo AEAT:</strong> ${_rectTipoR} — ${tipoRLabels[_rectTipoR]||''}</div>
      <div><strong>Importe:</strong> ${msgImporte}</div>
      <div><strong>Motivo:</strong> ${motivo}</div>
    </div>`,
    aviso: 'Esta acción no se puede deshacer',
    btnOk: 'Emitir rectificativa',
    btnCancel: 'Cancelar',
    colorOk: '#dc2626'
  });
  if (!okRect) return;

  // Cerrar editor
  document.getElementById('rectEditor')?.remove();

  // Stepper
  const vfActivo = _isVfActivo();
  const pasos = [
    { label: 'Generando número', sub: 'Serie rectificativa...' },
    { label: 'Guardando rectificativa', sub: 'Insertando en base de datos...' },
    { label: 'Actualizando original', sub: 'Marcando como rectificada...' },
    ...(vfActivo ? [
      { label: 'Registrando en AEAT', sub: 'Enviando XML...' },
      { label: 'Verificando respuesta', sub: 'Procesando resultado...' },
    ] : []),
  ];
  _showStepper('Creando rectificativa', pasos);
  _updateStep(0);

  const numero = await _generarNumeroRectificativa();

  const obsText = motivo + (estabaCobrada && esI && totalRect < 0
    ? '. DEVOLUCIÓN PENDIENTE de ' + fmtE(Math.abs(totalRect)) + ' al cliente.'
    : '');

  // Serie: usar serie de rectificativas si existe, si no la de la original
  const sRect = (series||[]).find(s => s.tipo === 'factura_rectificativa');
  const obj = {
    empresa_id: EMPRESA.id,
    numero,
    serie_id: sRect?.id || orig.serie_id,
    cliente_id: orig.cliente_id,
    cliente_nombre: orig.cliente_nombre,
    fecha: new Date().toISOString().split('T')[0],
    fecha_vencimiento: null,
    forma_pago_id: orig.forma_pago_id,
    base_imponible: baseRect,
    total_iva: ivaRect,
    total: totalRect,
    estado: 'pendiente',
    observaciones: obsText,
    lineas: lineasGuardar,
    rectificativa_de: orig.id,
    presupuesto_id: orig.presupuesto_id || null,
    albaran_id: orig.albaran_id || null,
    trabajo_id: orig.trabajo_id || null,
    // ── Campos VeriFactu según AEAT ──
    tipo_rectificativa: _rectTipoR,  // R1-R5 seleccionado por el usuario
    tipo_rectificacion: _rectTipo,   // 'I' o 'S'
    factura_rectificada_numero: orig.numero,
    factura_rectificada_fecha: orig.fecha,
  };

  // Tipo S: añadir base_rectificada / cuota_rectificada (importes ORIGINALES)
  // Tipo I: NO se rellenan estos campos (documentación AEAT)
  if (!esI) {
    obj.base_rectificada = Math.round(baseOrig * 100) / 100;
    obj.cuota_rectificada = Math.round(ivaOrig * 100) / 100;
  }

  _updateStep(1, 'Insertando ' + numero + '...');
  let insertOk = false;
  const { data, error } = await sb.from('facturas').insert(obj).select().single();
  if (error) {
    if (error.message && (error.message.includes('tipo_rectificativa') || error.message.includes('column'))) {
      delete obj.tipo_rectificativa; delete obj.tipo_rectificacion;
      delete obj.base_rectificada; delete obj.cuota_rectificada;
      delete obj.factura_rectificada_numero; delete obj.factura_rectificada_fecha;
      const r2 = await sb.from('facturas').insert(obj).select().single();
      if (r2.error) { _stepperDone(r2.error.message, false); return; }
      insertOk = true;
    } else { _stepperDone(error.message, false); return; }
  } else { insertOk = true; }

  // Marcar original como rectificada (no anulada — sigue existiendo en AEAT)
  _updateStep(2, 'Actualizando ' + orig.numero + '...');
  await cambiarEstadoFac(orig.id, 'rectificada');

  // ── Liberar documentos vinculados si es sustitución total ──
  if (!esI || totalRect <= -totalOrig + 0.01) {
    if (orig.albaran_id) {
      await sb.from('albaranes').update({ estado: 'entregado' }).eq('id', orig.albaran_id);
      const _abLocal = (window.albaranesData || []).find(a => a.id === orig.albaran_id);
      if (_abLocal) _abLocal.estado = 'entregado';
    }
    if (Array.isArray(orig.albaran_ids) && orig.albaran_ids.length) {
      for (const aId of orig.albaran_ids) {
        await sb.from('albaranes').update({ estado: 'entregado' }).eq('id', aId);
        const _abL = (window.albaranesData || []).find(a => a.id === aId);
        if (_abL) _abL.estado = 'entregado';
      }
    }
    if (orig.presupuesto_id) {
      const { data: _albsPres } = await sb.from('albaranes')
        .select('id').eq('presupuesto_id', orig.presupuesto_id).eq('estado', 'facturado');
      if (_albsPres?.length) {
        for (const a of _albsPres) {
          await sb.from('albaranes').update({ estado: 'entregado' }).eq('id', a.id);
          const _abL2 = (window.albaranesData || []).find(x => x.id === a.id);
          if (_abL2) _abL2.estado = 'entregado';
        }
      }
    }
  }

  closeModal('mFacturaDetalle');
  await loadFacturas();
  loadDashboard();

  // ── VeriFactu: envío automático ──
  if (vfActivo) {
    _updateStep(3, 'Enviando ' + numero + ' a AEAT...');
    const rectCreada = facLocalData.find(f => f.numero === numero);
    if (rectCreada) {
      try {
        await enviarFacturaAEAT(rectCreada.id, 'alta', { auto: true, stepper: true });
        _updateStep(4);
        const fUpd = facLocalData.find(x => x.id === rectCreada.id);
        const est = fUpd?.verifactu_estado || 'enviado';
        if (est === 'correcto' || est === 'simulado') {
          _stepperDone('Rectificativa ' + numero + ' registrada en AEAT ✓', true);
        } else if (est === 'aceptado_errores') {
          _stepperDone('Aceptada con avisos', true);
        } else {
          _stepperDone('AEAT: ' + est, false);
        }
      } catch (e) {
        _stepperDone('Error AEAT: ' + (e.message || ''), false);
      }
    } else {
      _stepperDone('Rectificativa guardada', true);
    }
  } else {
    _stepperDone('Rectificativa ' + numero + ' creada ✓', true);
  }
}

// ═══════════════════════════════════════════════
//  RECORDATORIO FACTURA VENCIDA
// ═══════════════════════════════════════════════
async function enviarRecordatorioVencida(id) {
  const f = facLocalData.find(x => x.id === id);
  if (!f) { toast('Factura no encontrada', 'error'); return; }
  if (f.estado !== 'vencida' && f.estado !== 'pendiente') {
    toast('Solo se envían recordatorios de facturas pendientes o vencidas', 'warning'); return;
  }

  const cli = clientes.find(c => c.id === f.cliente_id);
  const email = cli?.email;
  if (!email) { toast('El cliente no tiene email configurado', 'error'); return; }

  const diasVencida = f.fecha_vencimiento
    ? Math.floor((Date.now() - new Date(f.fecha_vencimiento).getTime()) / 86400000)
    : 0;

  const asunto = 'Recordatorio: Factura ' + (f.numero || '') + ' pendiente de pago';
  const cuerpo =
    'Estimado/a ' + (f.cliente_nombre || cli?.nombre || 'cliente') + ',\n\n' +
    'Le recordamos que la factura ' + (f.numero || '') + ' por importe de ' + fmtE(f.total || 0) +
    ' con fecha de vencimiento ' + (f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : '—') +
    (diasVencida > 0 ? ' (vencida hace ' + diasVencida + ' días)' : '') +
    ' se encuentra pendiente de pago.\n\n' +
    'Le agradeceríamos que procediera al abono a la mayor brevedad.\n\n' +
    'Si ya ha realizado el pago, le rogamos disculpe esta comunicación y nos lo notifique.\n\n' +
    'Un saludo cordial,\n' + (EMPRESA.nombre || '');

  if (typeof nuevoCorreo === 'function') {
    closeModal('mFacturaDetalle');
    await nuevoCorreo(email, asunto, cuerpo, { tipo: 'recordatorio_factura', id: f.id, ref: f.numero || '' });
    goPage('correo');
  } else {
    toast('⚠️ Configura el correo electrónico en Administración → Correo', 'warning');
  }
}

// ═══════════════════════════════════════════════
//  HISTORIAL DE CAMBIOS DE ESTADO
// ═══════════════════════════════════════════════
async function _registrarCambioEstado(tipo, docId, estadoAnterior, estadoNuevo) {
  try {
    await sb.from('documento_historial').insert({
      empresa_id: EMPRESA.id,
      documento_tipo: tipo,
      documento_id: docId,
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      usuario_id: CU?.id || null,
      usuario_nombre: CU?.user_metadata?.nombre || CU?.email || null,
    });
  } catch (e) { console.warn('No se pudo registrar historial:', e); }
}

async function _cargarHistorial(tipo, docId) {
  const { data } = await sb.from('documento_historial')
    .select('*')
    .eq('documento_tipo', tipo)
    .eq('documento_id', docId)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}

function _renderHistorialTimeline(historial) {
  if (!historial.length) return '<div style="color:var(--gris-400);font-size:12px;padding:8px 0">Sin historial de cambios</div>';

  const ICOS = { borrador:'✏️', enviado:'📤', pendiente:'⏳', aceptado:'✅', rechazado:'❌',
    cobrada:'💰', pagada:'💰', vencida:'⚠️', anulada:'🚫', entregado:'📦', facturado:'🧾', completado:'✅' };

  return '<div style="display:flex;flex-direction:column;gap:6px">' +
    historial.map(h => {
      const fecha = h.created_at ? new Date(h.created_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
      const ico = ICOS[h.estado_nuevo] || '🔄';
      return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--gris-100)">
        <span>${ico}</span>
        <span style="flex:1"><strong>${h.estado_anterior || '—'}</strong> → <strong>${h.estado_nuevo}</strong></span>
        <span style="color:var(--gris-400);font-size:11px">${h.usuario_nombre || ''}</span>
        <span style="color:var(--gris-400);font-size:10px;min-width:80px;text-align:right">${fecha}</span>
      </div>`;
    }).join('') + '</div>';
}

// ═══════════════════════════════════════════════
//  IMPRIMIR FACTURA (ventana HTML)
// ═══════════════════════════════════════════════
function imprimirFactura(f) {
  if (typeof f === 'number') {
    // Buscar en datos cargados — si no existe, cargar de DB
    (async()=>{
      const {data}=await sb.from('facturas').select('*').eq('id',f).single();
      if(!data){toast('Factura no encontrada','error');return;}
      _imprimirFacturaHtml(data);
    })();
    return;
  }
  _imprimirFacturaHtml(f);
}

function _imprimirFacturaHtml(f) {
  if (typeof window._imprimirDocumento === 'function' && typeof _cfgFactura === 'function') {
    return window._imprimirDocumento(_cfgFactura(f));
  }
  // ─── Fallback antiguo (no debería ejecutarse) ───
  const c = clientes.find(x=>x.id===f.cliente_id);
  const lineas = f.lineas||[];
  let htmlLineas='', base=0, ivaTotal=0;
  lineas.forEach(l=>{
    if(l._separator){
      htmlLineas+=`<tr><td colspan="6" style="padding:6px 10px;background:#f1f5f9;font-weight:700;font-size:10px;color:#475569;border-bottom:1px solid #e2e8f0">${l.desc||''}</td></tr>`;
      return;
    }
    const dto1=l.dto1||0, dto2=l.dto2||0, dto3=l.dto3||0;
    const sub=(l.cant||1)*(l.precio||0)*(1-dto1/100)*(1-dto2/100)*(1-dto3/100);
    const iv=sub*((l.iva||0)/100);
    base+=sub; ivaTotal+=iv;
    htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.desc||''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cant||0}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${(l.precio||0).toFixed(2)} €</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${dto?dto+'%':'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.iva!=null?l.iva+'%':'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${(sub+iv).toFixed(2)} €</td></tr>`;
  });
  const dirEmpresa=[EMPRESA?.direccion,[EMPRESA?.cp,EMPRESA?.municipio].filter(Boolean).join(' '),EMPRESA?.provincia].filter(Boolean).join(', ');
  const dirCliente=c?[c.direccion_fiscal||c.direccion,[c.cp_fiscal||c.cp,c.municipio_fiscal||c.municipio].filter(Boolean).join(' '),c.provincia_fiscal||c.provincia].filter(Boolean).join(', '):'';
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:60px;height:60px;object-fit:contain;border-radius:8px">`:`<div style="width:60px;height:60px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const win=window.open('','_blank','width=850,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>Factura ${f.numero}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm 14mm 18mm 14mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;line-height:1.4}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm;position:relative}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}.btn-print{background:#1e40af;color:#fff}.btn-close{background:#e2e8f0;color:#475569}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style>
  </head><body>
  <div class="no-print btn-bar"><button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button><button class="btn-close" onclick="window.close()">✕ Cerrar</button></div>
  <div class="page">
    <div style="display:flex;gap:24px;margin-bottom:16px;align-items:stretch">
      <div style="flex:1"><div style="display:flex;align-items:flex-start;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div><div style="font-size:11px;color:#64748b">${EMPRESA?.razon_social||''}</div><div style="font-size:11px;color:#475569">${dirEmpresa}<br>CIF: ${EMPRESA?.cif||''} · Tel: ${EMPRESA?.telefono||''}</div></div></div></div>
      <div style="flex:1"><div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;border-left:4px solid #1e40af;height:100%"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:4px">CLIENTE</div><div style="font-size:15px;font-weight:700;margin-bottom:3px">${f.cliente_nombre||'—'}</div><div style="font-size:11px;color:#475569">${dirCliente}${c?.nif?'<br>NIF: '+c.nif:''}</div></div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px">
      <div style="font-size:11px;color:#1e40af;display:flex;align-items:baseline;gap:6px"><span style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px">FACTURA</span><span style="font-size:11px;font-weight:600;color:#475569">${f.numero||''}</span></div>
      <div style="display:flex;gap:16px;font-size:11px;color:#64748b"><span>Fecha: <b style="color:#334155">${f.fecha?new Date(f.fecha).toLocaleDateString('es-ES'):'—'}</b></span><span>Vencimiento: <b style="color:#334155">${f.fecha_vencimiento?new Date(f.fecha_vencimiento).toLocaleDateString('es-ES'):'—'}</b></span></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px">
      <thead><tr><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:60px">Cant.</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:90px">Precio</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:60px">Dto.</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:60px">IVA</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:90px">Total</th></tr></thead>
      <tbody>${htmlLineas}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end"><div style="width:260px">
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569"><span>Base imponible</span><b style="color:#1e2a3a">${(f.base_imponible||base).toFixed(2)} €</b></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569"><span>IVA</span><b style="color:#1e2a3a">${(f.total_iva||ivaTotal).toFixed(2)} €</b></div>
      <div style="display:flex;justify-content:space-between;padding:10px 14px;background:#1e40af;color:#fff;border-radius:6px;font-size:15px;font-weight:800;margin-top:4px"><span>TOTAL</span><b>${(f.total||0).toFixed(2)} €</b></div>
    </div></div>
    ${f.observaciones?`<div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">Observaciones</div><div style="font-size:11px;color:#475569">${f.observaciones}</div></div>`:''}
    <div style="position:absolute;bottom:20px;left:36px;right:36px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between"><span>${EMPRESA?.nombre||''} ${EMPRESA?.cif?' · CIF: '+EMPRESA.cif:''}</span><span>${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.email?' · '+EMPRESA.email:''}</span></div>
  </div></body></html>`);
  win.document.close();
}

// ═══════════════════════════════════════════════
//  ENVIAR FACTURA POR EMAIL
// ═══════════════════════════════════════════════
function enviarFacturaEmail(f) {
  if (typeof f === 'number') {
    (async()=>{
      const {data}=await sb.from('facturas').select('*').eq('id',f).single();
      if(!data){toast('Factura no encontrada','error');return;}
      _enviarFacturaEmail(data);
    })();
    return;
  }
  _enviarFacturaEmail(f);
}

// Helper: genera PDF en memoria y devuelve base64 (sin descarga ni firma)
async function _pdfFacturaBase64(f) {
  return await _generarPdfFactura(f, { soloBase64: true });
}

async function _enviarFacturaEmail(f) {
  const c = clientes.find(x=>x.id===f.cliente_id);
  const email = c?.email || '';
  const asuntoTxt = `Factura ${f.numero||''} — ${EMPRESA?.nombre||''}`;
  const totalFmt = (f.total||0).toFixed(2).replace('.',',')+' €';
  const fechaFmt = f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—';
  const vencFmt = f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : '—';

  // 1) Asegurar acceso_token (lo persistimos en BD para que el enlace funcione siempre)
  let token = f.acceso_token;
  if (!token) {
    token = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).substring(2)));
    const { error: tokErr } = await sb.from('facturas').update({ acceso_token: token }).eq('id', f.id);
    if (!tokErr) f.acceso_token = token; else token = null;
  }
  const enlace = token ? `https://instaloerp.github.io/doc.html?t=${token}` : '';

  // 2) Generar PDF en memoria (base64)
  let adjuntos = [];
  try {
    const b64 = await _pdfFacturaBase64(f);
    if (b64) adjuntos.push({ nombre: `Factura_${(f.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')}.pdf`, base64: b64, tipo_mime: 'application/pdf' });
  } catch(e) { console.warn('No se pudo generar PDF para adjuntar:', e); }

  const cuerpoTxt =
`Estimado/a ${f.cliente_nombre||'cliente'},

Le adjuntamos la factura ${f.numero||''} con fecha ${fechaFmt}.

Importe total: ${totalFmt} (IVA incluido)
Fecha de vencimiento: ${vencFmt}
${enlace ? '\n👉 Ver, descargar o imprimir online:\n'+enlace+'\n' : ''}
Para cualquier consulta, no dude en contactarnos.

Un saludo cordial,
${EMPRESA?.nombre||''}
${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}
${EMPRESA?.email||''}`;

  if (typeof nuevoCorreo === 'function') {
    closeModal('mFacturaDetalle');
    await nuevoCorreo(email, asuntoTxt, cuerpoTxt, { tipo: 'factura', id: f.id, ref: f.numero || '' }, adjuntos);
    goPage('correo');
  } else {
    toast('⚠️ El gestor de correo no está disponible. Configura una cuenta en Administración → Correo.', 'warning');
  }
}

// ═══════════════════════════════════════════════
//  GENERAR PDF FACTURA (jsPDF)
// ═══════════════════════════════════════════════
function generarPdfFactura(f) {
  if (typeof f === 'number') {
    (async()=>{
      const {data}=await sb.from('facturas').select('*').eq('id',f).single();
      if(!data){toast('Factura no encontrada','error');return;}
      _generarPdfFactura(data);
    })();
    return;
  }
  _generarPdfFactura(f);
}

// Construye cfg unificado para factura (sin capítulos, líneas planas)
function _cfgFactura(f) {
  const cli = clientes.find(x=>x.id===f.cliente_id) || {};
  // Eliminar marcadores de capítulo si los hubiera (factura va plana)
  const lineasPlanas = (f.lineas||[]).filter(l => l && l.tipo !== 'capitulo');
  const esBorrador = f.estado === 'borrador' || (f.numero || '').startsWith('BORR-');
  const versionTxt = f.version ? ' · v' + f.version : '';
  return {
    tipo: esBorrador ? 'FACTURA PROFORMA' : 'FACTURA',
    numero: esBorrador ? (f.numero || 'BORRADOR') + versionTxt : f.numero,
    marca_agua: esBorrador ? 'PROFORMA' : null,
    fecha: f.fecha,
    titulo: f.titulo || f.referencia,
    cliente: {
      nombre: f.cliente_nombre || cli.nombre || '—',
      nif: cli.nif,
      direccion: cli.direccion_fiscal || cli.direccion,
      cp: cli.cp_fiscal || cli.cp,
      municipio: cli.municipio_fiscal || cli.municipio,
      provincia: cli.provincia_fiscal || cli.provincia,
      email: cli.email, telefono: cli.telefono
    },
    lineas: lineasPlanas,
    base_imponible: f.base_imponible,
    total_iva: f.total_iva,
    total: f.total,
    observaciones: f.observaciones,
    datos_extra: [
      f.fecha_vencimiento ? ['Vencimiento', new Date(f.fecha_vencimiento).toLocaleDateString('es-ES')] : null,
      f.forma_pago ? ['Forma de pago', f.forma_pago] : null
    ].filter(Boolean),
    condiciones: [
      ['Forma de pago', f.forma_pago || 'Transferencia bancaria.'],
      ['Vencimiento', f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : 'Al contado.'],
      ['IVA', 'IVA al 21 % incluido en el total final.']
    ],
    firma_zona: false,
    verifactu_qr_url: f.verifactu_qr_url || null,
    verifactu_csv: f.verifactu_csv || null,
    verifactu_estado: f.verifactu_estado || null
  };
}

async function _generarPdfFactura(f, opts) {
  const _soloBase64 = !!(opts && opts.soloBase64);
  const cfg = _cfgFactura(f);
  const filename = 'Factura_'+(f.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')+'.pdf';

  if (_soloBase64) return await window._documentoPdfBase64(cfg);

  await window._descargarPdfDocumento(cfg, filename);

  if (typeof firmarYGuardarPDF === 'function') {
    try {
      const b64 = await window._documentoPdfBase64(cfg);
      if (b64) {
        const bin = atob(b64);
        const buf = new ArrayBuffer(bin.length);
        const view = new Uint8Array(buf);
        for (let i=0; i<bin.length; i++) view[i] = bin.charCodeAt(i);
        const cli = clientes.find(c => c.id === f.cliente_id);
        firmarYGuardarPDF(buf, {
          tipo_documento: 'factura', documento_id: f.id, numero: f.numero,
          entidad_tipo: 'cliente', entidad_id: f.cliente_id,
          entidad_nombre: f.cliente_nombre || cli?.nombre || ''
        }).then(r => {
          if (r && r.success && r.firma_info) toast('🔏 Factura firmada digitalmente ✓', 'success');
          else if (r && !r.firmado) toast('📄 Factura guardada (sin firma digital)', 'info');
        }).catch(e => { console.error('Error firmando factura:', e); });
      }
    } catch(e){ console.warn('No se pudo firmar copia factura:', e); }
  }
}

// ═══════════════════════════════════════════════
//  PESTAÑA RECTIFICATIVAS
// ═══════════════════════════════════════════════
async function loadRectificativas() {
  // Reusar datos de facturas si ya están cargados
  if (!facLocalData.length) {
    const { data } = await sb.from('facturas')
      .select('*').eq('empresa_id', EMPRESA.id)
      .neq('estado', 'eliminado')
      .order('created_at', { ascending: false });
    facLocalData = data || [];
    window.facturasData = facLocalData;
  }
  renderRectificativas();
}

function renderRectificativas() {
  const rects = facLocalData.filter(f => !!f.rectificativa_de);
  const tbody = document.getElementById('rectTable');
  if (!tbody) return;

  // KPIs
  const kTotal = document.getElementById('rk-total');
  const kImporte = document.getElementById('rk-importe');
  if (kTotal) kTotal.textContent = rects.length;
  if (kImporte) kImporte.textContent = fmtE(rects.reduce((s, f) => s + Math.abs(f.total || 0), 0));

  tbody.innerHTML = rects.length ? rects.map(f => {
    const origFac = facLocalData.find(x => x.id === f.rectificativa_de);
    const fecha = f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—';
    return `<tr style="cursor:pointer" onclick="verDetalleFactura(${f.id})">
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">${f.numero || '—'}</td>
      <td style="font-size:12px">${fecha}</td>
      <td><div style="font-weight:600">${f.cliente_nombre || '—'}</div></td>
      <td style="font-size:12px">
        <a onclick="event.stopPropagation();verDetalleFactura(${f.rectificativa_de})" style="color:#991B1B;font-weight:700;cursor:pointer;text-decoration:underline">${origFac ? origFac.numero : 'FAC-' + f.rectificativa_de}</a>
      </td>
      <td style="text-align:right;font-weight:700;color:#991B1B">${fmtE(f.total || 0)}</td>
      <td style="font-size:12px;color:var(--gris-400)">${f.observaciones || ''}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center">
          <button onclick="imprimirFactura(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid var(--gris-200);background:white;cursor:pointer;font-size:11px" title="Imprimir">🖨️</button>
          <button onclick="generarPdfFactura(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid var(--gris-200);background:white;cursor:pointer;font-size:11px" title="PDF">📥</button>
          ${_isVfActivo() ? (f.verifactu_estado === 'correcto' ? `<span style="padding:3px 8px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700" title="Registrada en AEAT · CSV: ${f.verifactu_csv||''}">✅ AEAT</span>` : f.verifactu_estado === 'anulado' ? `<span style="padding:3px 8px;border-radius:6px;background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700" title="Anulada en AEAT">🗑️</span><button onclick="enviarFacturaAEAT(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #1D4ED8;background:#EFF6FF;cursor:pointer;font-size:11px;font-weight:700;color:#1D4ED8" title="Reenviar a AEAT">📡</button>` : f.verifactu_estado === 'incorrecto' ? `<span style="padding:3px 8px;border-radius:6px;background:#FEF2F2;color:#991B1B;font-size:10px;font-weight:700" title="Error al enviar">❌</span><button onclick="enviarFacturaAEAT(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #1D4ED8;background:#EFF6FF;cursor:pointer;font-size:11px;font-weight:700;color:#1D4ED8" title="Reintentar envío">🔄</button>` : `<button onclick="enviarFacturaAEAT(${f.id})" style="padding:4px 8px;border-radius:6px;border:1px solid #1D4ED8;background:#EFF6FF;cursor:pointer;font-size:11px;font-weight:700;color:#1D4ED8" title="Enviar a AEAT">📡 AEAT</button>`) : ''}
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="7"><div class="empty"><div class="ei">📝</div><h3>Sin rectificativas</h3><p>Las facturas rectificativas aparecerán aquí al crearlas desde una factura original</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  VERIFACTU — Envío a AEAT
// ═══════════════════════════════════════════════

/** Comprueba si VeriFactu está activado en la config de empresa */
function _isVfActivo() {
  return !!(EMPRESA?.facturacion_electronica?.verifactu);
}

/** Enviar factura a AEAT vía Edge Function
 *  @param {number} facturaId
 *  @param {string} action - 'alta' | 'anulacion'
 *  @param {object} opts - { auto: true } para envío automático sin confirmación
 */
async function enviarFacturaAEAT(facturaId, action = 'alta', opts = {}) {
  const fac = facLocalData.find(f => f.id === facturaId);
  if (!fac) { toast('Factura no encontrada', 'error'); return; }

  // Validaciones
  if (fac.estado === 'borrador' || (fac.numero || '').startsWith('BORR-')) {
    if (!opts.auto) toast('No se pueden enviar borradores a AEAT. Emite la factura primero.', 'error');
    return;
  }
  if (fac.verifactu_estado === 'correcto' && action === 'alta') {
    if (!opts.auto) toast('Esta factura ya está registrada en AEAT', 'info');
    return;
  }

  // Confirmación (saltar si es envío automático)
  if (!opts.auto) {
    const modoLabel = (EMPRESA._vf_modo || 'test') === 'produccion' ? 'PRODUCCIÓN' : 'PRUEBAS';
    const confirmMsg = action === 'alta'
      ? `¿Enviar factura ${fac.numero} a AEAT (${modoLabel})?`
      : `¿Enviar ANULACIÓN de factura ${fac.numero} a AEAT (${modoLabel})?`;
    if (!confirm(confirmMsg)) return;
  }

  if (!opts.stepper) toast('Enviando a AEAT...', 'info');

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { toast('Sesión expirada. Inicia sesión de nuevo.', 'error'); return; }

    const resp = await fetch(
      `${SUPA_URL}/functions/v1/verifactu`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          factura_id: facturaId,
          empresa_id: EMPRESA.id,
        }),
      }
    );

    const result = await resp.json();

    console.log('🔍 VeriFactu respuesta completa:', JSON.stringify(result, null, 2));

    if (!resp.ok) {
      toast(`Error AEAT: ${result.error || result.message || 'Error desconocido'}`, 'error');
      console.error('VeriFactu error:', result);
      return;
    }

    // Actualizar datos locales
    fac.verifactu_estado = result.estado || 'enviado';
    fac.verifactu_csv = result.csv || null;
    fac.verifactu_qr_url = result.qr_url || null;
    fac.verifactu_huella = result.huella || null;

    // Mostrar resultado según estado (solo si no lo maneja el stepper)
    if (!opts.stepper) {
      if (result.estado === 'anulado') {
        toast(`🗑️ Registro de ${fac.numero} anulado en AEAT correctamente`, 'success');
      } else if (result.estado === 'correcto') {
        toast(`✅ Factura ${fac.numero} registrada en AEAT correctamente`, 'success');
      } else if (result.estado === 'aceptado_errores') {
        toast(`⚠️ AEAT aceptó con errores: ${result.descripcion_error || ''}`, 'warning');
      } else if (result.estado === 'incorrecto') {
        toast(`❌ AEAT rechazó: ${result.descripcion_error || result.codigo_error || 'Error'}`, 'error');
      } else if (result.estado === 'simulado') {
        toast(`🧪 Simulación completada — hash: ${(result.huella||'').substring(0,12)}...`, 'info');
      } else {
        toast(`📡 Estado: ${result.estado}`, 'info');
      }
    }

    // Refrescar UI
    try {
      await loadFacturas();
      // Si estamos en la vista de rectificativas, repintar esa tabla también
      if (document.getElementById('rectTable')) {
        renderRectificativas();
      }
      // Si el modal de detalle está abierto, refrescarlo
      const detId = document.getElementById('facDetId');
      if (detId && parseInt(detId.value) === facturaId) {
        verDetalleFactura(facturaId);
      }
    } catch (uiErr) {
      console.warn('Error refrescando UI tras VeriFactu:', uiErr);
    }

  } catch (err) {
    toast(`Error de conexión: ${err.message}`, 'error');
    console.error('VeriFactu fetch error:', err);
  }
}

/** Anular factura en AEAT */
async function anularFacturaAEAT(facturaId) {
  return enviarFacturaAEAT(facturaId, 'anulacion');
}

// ═══════════════════════════════════════════════
//  SUBSANACIÓN — Corregir datos NO fiscales de factura emitida
//  (descripciones, observaciones, datos informativos)
//  Se reenvía a AEAT como nueva alta que reemplaza el registro anterior
// ═══════════════════════════════════════════════
let _subsLineas = [];
let _subsFacId = null;

function abrirSubsanacion(id) {
  const f = facLocalData.find(x => x.id === id);
  if (!f) { toast('Factura no encontrada', 'error'); return; }
  if (f.verifactu_estado !== 'correcto' && f.verifactu_estado !== 'simulado') {
    toast('Solo se pueden subsanar facturas registradas en AEAT', 'warning'); return;
  }

  _subsFacId = id;
  _subsLineas = (f.lineas || []).filter(l => !l._separator).map(l => ({
    ...l, _origDesc: l.desc || ''
  }));

  const ol = document.createElement('div');
  ol.id = 'subsEditor';
  ol.className = 'overlay open';
  ol.style.cssText = 'z-index:10002';
  ol.innerHTML = `
    <div class="modal modal-lg" style="max-width:780px">
      <div class="modal-h">
        <span>🔧</span>
        <h2>Subsanar factura ${f.numero}</h2>
        <button class="btn btn-ghost btn-icon" onclick="document.getElementById('subsEditor').remove()">✕</button>
      </div>
      <div class="modal-b">
        <div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#9A3412;line-height:1.5">
          <b>Subsanación</b> — Corrige solo datos <b>no fiscales</b>: descripciones de líneas, observaciones, textos informativos.<br>
          <b>NO</b> se pueden cambiar importes, cantidades, precios, IVA, NIF ni datos del cliente.<br>
          Si se modifican observaciones, se reenviará el registro a AEAT con subsanación.
        </div>

        <div style="margin-bottom:14px">
          <label style="font-weight:700;font-size:13px;margin-bottom:6px;display:block">Líneas de factura (solo descripción editable)</label>
          <div style="border:1px solid var(--gris-200);border-radius:8px;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead style="background:var(--gris-50)">
                <tr>
                  <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);text-align:left">Descripción</th>
                  <th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--gris-500);width:60px;text-align:right">Cant.</th>
                  <th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--gris-500);width:80px;text-align:right">Precio</th>
                  <th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--gris-500);width:50px;text-align:right">IVA</th>
                  <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--gris-500);width:90px;text-align:right">Subtotal</th>
                </tr>
              </thead>
              <tbody id="subs_lineas"></tbody>
            </table>
          </div>
        </div>

        <div class="fg"><label>Observaciones / Notas</label>
          <textarea id="subs_obs" rows="3" style="width:100%;padding:8px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12.5px;resize:none;font-family:var(--font);outline:none">${f.observaciones || f.notas || ''}</textarea>
        </div>
      </div>
      <div class="modal-f">
        <button class="btn btn-secondary" onclick="document.getElementById('subsEditor').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_guardarSubsanacion()" style="background:#EA580C">🔧 Guardar subsanación</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
  _subsRenderLineas();
}

function _subsUpdateDesc(idx, val) {
  _subsLineas[idx].desc = val;
  // No re-render para no perder foco del input
}

function _subsRenderLineas() {
  document.getElementById('subs_lineas').innerHTML = _subsLineas.map((l, i) => {
    const sub = (l.cant||0) * (l.precio||0) * (1-(l.dto1||0)/100) * (1-(l.dto2||0)/100) * (1-(l.dto3||0)/100);
    const changed = l.desc !== l._origDesc;
    const bgStyle = changed ? 'background:#FFF7ED' : '';
    return `<tr style="border-top:1px solid var(--gris-100);${bgStyle}">
      <td style="padding:7px 10px">
        <input value="${(l.desc||'').replace(/"/g,'&quot;')}"
          onchange="_subsUpdateDesc(${i},this.value);this.closest('tr').style.background=this.value!=='${(l._origDesc||'').replace(/'/g,"\\'")}' ? '#FFF7ED' : ''"
          style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:5px 8px;font-size:12.5px;outline:none;background:transparent">
        ${changed ? '<span style="font-size:10px;color:#9A3412;display:block;margin-top:2px">Antes: '+l._origDesc+'</span>' : ''}
      </td>
      <td style="padding:7px 6px;text-align:right;font-size:12px;color:var(--gris-500)">${l.cant}</td>
      <td style="padding:7px 6px;text-align:right;font-size:12px;color:var(--gris-500)">${fmtE(l.precio||0)}</td>
      <td style="padding:7px 6px;text-align:right;font-size:12px;color:var(--gris-500)">${l.iva||21}%</td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub)}</td>
    </tr>`;
  }).join('');
}

async function _guardarSubsanacion() {
  const f = facLocalData.find(x => x.id === _subsFacId);
  if (!f) { toast('Factura no encontrada', 'error'); return; }

  const nuevaObs = document.getElementById('subs_obs')?.value || '';

  // Reconstruir líneas con descripciones actualizadas
  const lineasActualizadas = (f.lineas || []).map((l, i) => {
    if (l._separator) return l;
    // Buscar la línea correspondiente en _subsLineas
    const idx = (f.lineas || []).filter((x, j) => j < i && !x._separator).length;
    const sl = _subsLineas[idx];
    if (sl) return { ...l, desc: sl.desc };
    return l;
  });

  // Verificar que hay cambios
  const origObs = f.observaciones || f.notas || '';
  const hayDescCambio = _subsLineas.some(l => l.desc !== l._origDesc);
  const hayObsCambio = nuevaObs !== origObs;

  if (!hayDescCambio && !hayObsCambio) {
    toast('No hay cambios para subsanar', 'info');
    return;
  }

  // DescripcionOperacion (observaciones) SÍ está en el RegistroAlta AEAT.
  // Descripciones de líneas NO están en el registro (solo el desglose por tipo IVA).
  // Si cambian observaciones → subsanación AEAT (Subsanacion="S")
  // Si solo cambian descripciones de líneas → solo guardar local (FAQ AEAT: no exige nuevo registro)
  const necesitaAEAT = hayObsCambio && _isVfActivo() &&
    (f.verifactu_estado === 'correcto' || f.verifactu_estado === 'simulado');

  const msgAEAT = necesitaAEAT
    ? 'Las <b>observaciones</b> forman parte del registro AEAT (DescripcionOperacion).<br>Se reenviará el registro con el mecanismo de subsanación.'
    : 'Solo se han modificado datos <b>no fiscales</b> que no están en el registro AEAT.<br>Los importes no cambian.';

  const ok = await confirmModal({
    icono: '🔧',
    titulo: 'Subsanar factura ' + f.numero,
    mensaje: msgAEAT,
    aviso: necesitaAEAT ? 'Se enviará un nuevo registro sustitutivo a AEAT' : 'El registro en AEAT no cambia.',
    btnOk: necesitaAEAT ? '🔧 Subsanar y reenviar a AEAT' : '🔧 Guardar subsanación',
    colorOk: '#EA580C'
  });
  if (!ok) return;

  document.getElementById('subsEditor')?.remove();

  // Stepper
  const pasos = [
    { label: 'Guardando cambios', sub: 'Actualizando descripciones y observaciones...' },
    ...(necesitaAEAT ? [
      { label: 'Subsanando en AEAT', sub: 'Enviando registro sustitutivo (Subsanacion=S)...' },
      { label: 'Verificando respuesta', sub: 'Procesando resultado AEAT...' },
    ] : []),
    { label: 'Actualizando datos locales', sub: 'Refrescando vista...' },
  ];
  _showStepper('Subsanando factura', pasos);
  let paso = 0;
  _updateStep(paso);

  // 1. Guardar cambios en BD
  const updateObj = { lineas: lineasActualizadas };
  if (hayObsCambio) updateObj.observaciones = nuevaObs;

  const { error } = await sb.from('facturas').update(updateObj).eq('id', f.id);
  if (error) { _stepperDone('Error: ' + error.message, false); return; }

  // Actualizar datos locales
  f.lineas = lineasActualizadas;
  if (hayObsCambio) f.observaciones = nuevaObs;

  // 2. Si observaciones cambiaron → subsanación AEAT
  if (necesitaAEAT) {
    paso++;
    _updateStep(paso);
    try {
      const resp = await sb.functions.invoke('verifactu', {
        body: { action: 'subsanacion', factura_id: f.id, empresa_id: f.empresa_id }
      });
      paso++;
      _updateStep(paso);
      const data = resp.data;
      if (data && data.ok && (data.estado === 'correcto' || data.estado === 'simulado' || data.estado === 'aceptado_errores')) {
        console.log('[Subsanación AEAT] OK:', data);
      } else {
        console.warn('[Subsanación AEAT] Respuesta:', data);
        _stepperDone('Subsanación local guardada, pero AEAT respondió: ' + (data?.descripcion_error || data?.estado || 'error desconocido'), false);
        return;
      }
    } catch (err) {
      console.error('[Subsanación AEAT] Error:', err);
      _stepperDone('Subsanación local guardada, pero error al enviar a AEAT: ' + err.message, false);
      return;
    }
  }

  // 3. Refrescar vista
  paso++;
  _updateStep(paso);
  await loadFacturas();
  _stepperDone('Subsanación de ' + f.numero + ' guardada correctamente ✓', true);

  // Refrescar detalle si está abierto
  const detId = document.getElementById('facDetId');
  if (detId && parseInt(detId.value) === f.id) {
    verDetalleFactura(f.id);
  }
}
