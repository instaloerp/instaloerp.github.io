/**
 * MÓDULO ALBARANES
 * Gestión completa de albaranes: CRUD, listado, filtrado, conversión a facturas
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let albaranesData = [];
let abFiltrados = [];

// ═══════════════════════════════════════════════
//  CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadAlbaranes() {
  const { data } = await sb.from('albaranes')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'eliminado')
    .order('created_at', { ascending: false });
  albaranesData = data || [];
  window.albaranesData = albaranesData; // Sincronizar para acceso cruzado desde otros módulos
  // Filtro por defecto: año en curso
  const y = new Date().getFullYear();
  const dEl = document.getElementById('abDesde');
  const hEl = document.getElementById('abHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
  abFiltrados = [...albaranesData];
  filtrarAlbaranes();
}

function renderAlbaranes(list) {
  const ESTADOS = {
    borrador:   { label:'Borrador',   ico:'✏️', color:'var(--gris-400)',   bg:'var(--gris-100)' },
    pendiente:  { label:'Pendiente',  ico:'⏳', color:'var(--amarillo)',   bg:'var(--amarillo-light)' },
    entregado:  { label:'Entregado',  ico:'✅', color:'var(--verde)',      bg:'var(--verde-light)' },
    facturado:  { label:'Facturado',  ico:'🧾', color:'var(--azul)',       bg:'var(--azul-light)' },
    anulado:    { label:'Anulado',    ico:'🚫', color:'var(--gris-400)',   bg:'var(--gris-100)' },
  };

  // KPIs
  const kTotal    = document.getElementById('ak-total');
  const kPend     = document.getElementById('ak-pendientes');
  const kEntr     = document.getElementById('ak-entregados');
  const kFact     = document.getElementById('ak-facturados');
  const kImporte  = document.getElementById('ak-importe');
  if (kTotal)   kTotal.textContent   = albaranesData.length;
  if (kPend)    kPend.textContent    = albaranesData.filter(a=>a.estado==='pendiente').length;
  if (kEntr)    kEntr.textContent    = albaranesData.filter(a=>a.estado==='entregado').length;
  if (kFact)    kFact.textContent    = albaranesData.filter(a=>a.estado==='facturado').length;
  if (kImporte) kImporte.textContent = fmtE(albaranesData.reduce((s,a)=>s+(a.total||0),0));

  const tbody = document.getElementById('abTable');
  if (!tbody) return;

  // Botón facturar seleccionados
  const btnMulti = document.getElementById('abFacturarMulti');
  if (btnMulti) btnMulti.style.display = 'none';

  tbody.innerHTML = list.length ? list.map(a => {
    const est = ESTADOS[a.estado] || { label: a.estado||'—', color:'var(--gris-400)' };
    const noFacturado = a.estado !== 'facturado' && a.estado !== 'anulado';
    return `<tr style="cursor:pointer" onclick="verDetalleAlbaran(${a.id})">
      <td onclick="event.stopPropagation()" style="text-align:center;width:30px">
        ${noFacturado ? `<input type="checkbox" class="ab-check" value="${a.id}" data-cliente="${a.cliente_id||''}" onchange="abCheckChanged()" style="cursor:pointer">` : ''}
      </td>
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">${(a.numero||'').startsWith('BORR-') ? '<span style="color:var(--gris-400);font-style:italic">Borrador</span>' : (a.numero||'—')}</td>
      <td><div style="font-weight:600">${a.cliente_nombre||'—'}</div></td>
      <td style="color:var(--gris-600);font-size:12.5px">${a.referencia||'—'}</td>
      <td style="font-size:12px">${a.fecha ? new Date(a.fecha).toLocaleDateString('es-ES') : '—'}</td>
      <td style="font-weight:700">${fmtE(a.total||0)}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${est.color};background:${est.bg}">${est.ico} ${est.label}</span>
      </td>
      <td>
        <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center" onclick="event.stopPropagation()">
          ${(()=>{
            const _tO = !!a.trabajo_id;
            const _tF = (window.facturasData||[]).some(f=>f.albaran_id===a.id) || (a.presupuesto_id && (window.facturasData||[]).some(f=>f.presupuesto_id===a.presupuesto_id));
            const _tP = !!a.presupuesto_id;
            const _bOK = 'padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none';
            const _bBtn = 'padding:4px 8px;border-radius:6px;border:1px solid #D1D5DB;background:white;cursor:pointer;font-size:11px;font-weight:600;color:#374151';
            let btns = '';
            // Presupuesto origen: badge verde clickable si viene de un presupuesto
            if (_tP) btns += '<a onclick="event.stopPropagation();verDetallePresupuesto('+a.presupuesto_id+')" style="'+_bOK+'">✅ Presupuesto</a> ';
            // Obra: badge verde si existe, botón si no y no facturado, oculto si facturado
            if (_tO) { btns += '<a onclick="event.stopPropagation();goPage(\'trabajos\');abrirFichaObra('+a.trabajo_id+')" style="'+_bOK+'">✅ Obra</a> '; }
            else if (!_tF) btns += '<button onclick="albaranToObra('+a.id+')" style="'+_bBtn+'" title="Crear obra">🏗️ Crear obra</button> ';
            // Factura: badge verde si existe, botón si no
            if (_tF) btns += '<span style="padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700">✅ Facturado</span>';
            else btns += '<button onclick="albaranToFactura('+a.id+')" style="'+_bBtn+'" title="Facturar">🧾 Facturar</button>';
            return btns;
          })()}
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="8"><div class="empty"><div class="ei">📄</div><h3>Sin albaranes</h3><p>Crea el primero con el botón "+ Nuevo albarán"</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  FILTRADO Y BÚSQUEDA
// ═══════════════════════════════════════════════
function filtrarAlbaranes() {
  const q   = (document.getElementById('abSearch')?.value||'').toLowerCase();
  const est = document.getElementById('abEstado')?.value||'';
  const des = document.getElementById('abDesde')?.value||'';
  const has = document.getElementById('abHasta')?.value||'';
  abFiltrados = albaranesData.filter(a =>
    (!q   || (a.numero||'').toLowerCase().includes(q) || (a.cliente_nombre||'').toLowerCase().includes(q) || (a.referencia||'').toLowerCase().includes(q)) &&
    (!est || a.estado === est) &&
    (!des || (a.fecha && a.fecha >= des)) &&
    (!has || (a.fecha && a.fecha <= has))
  );
  // Orden predeterminado: número de documento, más reciente primero (numérico)
  const _numSort = (n) => { const m = (n||'').match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  abFiltrados.sort((a,b) => _numSort(b.numero) - _numSort(a.numero));
  renderAlbaranes(abFiltrados);
}

// ═══════════════════════════════════════════════
//  GESTIÓN DE ESTADOS
// ═══════════════════════════════════════════════
async function cambiarEstadoAlb(id, estado) {
  const { error } = await sb.from('albaranes').update({ estado }).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  const a = albaranesData.find(x=>x.id===id);
  if (a) a.estado = estado;
  toast('Estado actualizado ✓','success');
  renderAlbaranes(abFiltrados.length ? abFiltrados : albaranesData);
  loadDashboard();
}

// ═══════════════════════════════════════════════
//  ELIMINAR Y DUPLICAR
// ═══════════════════════════════════════════════
async function delAlbaran(id) {
  if (!confirm('¿Eliminar este albarán?')) return;
  await sb.from('albaranes').delete().eq('id', id);
  albaranesData = albaranesData.filter(x=>x.id!==id);
  abFiltrados = abFiltrados.filter(x=>x.id!==id);
  renderAlbaranes(abFiltrados.length ? abFiltrados : albaranesData);
  toast('Eliminado','info');
  loadDashboard();
}

async function duplicarAlbaran(id) {
  if (_creando) return;
  _creando = true;
  try {
    const a = albaranesData.find(x=>x.id===id);
    if (!a) return;
    const nuevo = {...a}; delete nuevo.id; delete nuevo.created_at;
    nuevo.estado = 'pendiente';
    nuevo.fecha  = new Date().toISOString().split('T')[0];
    nuevo.numero = await generarNumeroDoc('albaran');
    const { error } = await sb.from('albaranes').insert(nuevo);
    if (error) { toast('Error: '+error.message,'error'); return; }
    toast('Duplicado ✓','success');
    await loadAlbaranes();
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  CONVERSIONES
// ═══════════════════════════════════════════════
async function albaranToFactura(id) {
  if (_creando) return;
  _creando = true;
  try {
    const a = albaranesData.find(x=>x.id===id);
    if (!a) return;
    // Comprobar si ya tiene factura
    const _fD4 = window.facturasData || [];
    if (_fD4.some(f=>f.albaran_id===a.id) || (a.presupuesto_id && _fD4.some(f=>f.presupuesto_id===a.presupuesto_id))) { toast('🔒 Este albarán ya tiene factura','error'); return; }
    if (!confirm('¿Convertir el albarán '+a.numero+' en factura?')) return;
    const numero = await generarNumeroDoc('factura');
    const hoy = new Date(); const v = new Date(); v.setDate(v.getDate()+30);
    // Asignar trabajo_id si el albarán pertenece a una obra
    const _trabVinc = a.trabajo_id || (a.presupuesto_id && typeof trabajos !== 'undefined' ? (trabajos.find(t=>t.presupuesto_id===a.presupuesto_id)||{}).id : null) || null;
    const { error } = await sb.from('facturas').insert({
      empresa_id: EMPRESA.id, numero,
      cliente_id: a.cliente_id, cliente_nombre: a.cliente_nombre,
      fecha: hoy.toISOString().split('T')[0],
      fecha_vencimiento: v.toISOString().split('T')[0],
      base_imponible: a.total||0, total_iva: 0, total: a.total||0,
      estado: 'pendiente', observaciones: a.observaciones,
      lineas: a.lineas, albaran_id: a.id,
      presupuesto_id: a.presupuesto_id || null,
      ...(_trabVinc ? {trabajo_id: _trabVinc} : {}),
    });
    if (error) { toast('Error: '+error.message,'error'); return; }
    await sb.from('albaranes').update({estado:'facturado'}).eq('id',id);
    const ab = albaranesData.find(x=>x.id===id); if(ab) { ab.estado='facturado'; }
    window.albaranesData = albaranesData;
    // Refrescar facturas en memoria
    const {data:facRefresh} = await sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    window.facturasData = facRefresh||[];
    filtrarAlbaranes();
    closeModal('mAbDetalle');
    toast('✅ Factura creada — albarán marcado como facturado','success');
    loadDashboard();
    // Refrescar ficha de obra si está abierta y estamos en la página de obras
    const _pg1 = document.querySelector('.page.active')?.id;
    if (_pg1 === 'page-trabajos' && typeof obraActualId !== 'undefined' && obraActualId && typeof abrirFichaObra === 'function') abrirFichaObra(obraActualId);
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  VER DETALLE Y EDITAR
// ═══════════════════════════════════════════════
function verDetalleAlbaran(id) {
  const a = albaranesData.find(x=>x.id===id);
  if (!a) return;
  document.getElementById('abDetId').value = id;
  document.getElementById('abDetNro').textContent = a.numero||'—';
  document.getElementById('abDetCli').textContent = a.cliente_nombre||'—';
  document.getElementById('abDetFecha').textContent = a.fecha ? new Date(a.fecha).toLocaleDateString('es-ES') : '—';
  document.getElementById('abDetRef').textContent = a.referencia||'—';

  const ESTADOS = {borrador:'Borrador',pendiente:'Pendiente',entregado:'Entregado',facturado:'Facturado',anulado:'Anulado'};
  const COLORES = {pendiente:'var(--amarillo)',entregado:'var(--verde)',facturado:'var(--azul)',anulado:'var(--gris-400)'};
  document.getElementById('abDetEstado').innerHTML = `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:white;background:${COLORES[a.estado]||'var(--gris-400)'}">${ESTADOS[a.estado]||a.estado||'—'}</span>`;

  const lineas = a.lineas || [];
  let total = 0;
  document.getElementById('abDetLineas').innerHTML = lineas.map(l => {
    const _br = (l.cant||0)*(l.precio||0); const sub = _br*(1-(l.dto||l.dto1||0)/100)*(1-(l.dto2||0)/100)*(1-(l.dto3||0)/100); total += sub;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:8px 10px;font-size:13px">${l.desc||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.cant||0}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmtE(l.precio||0)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub)}</td>
    </tr>`;
  }).join('');
  document.getElementById('abDetTotal').textContent = fmtE(a.total||total);

  const obsWrap = document.getElementById('abDetObsWrap');
  const obsDiv = document.getElementById('abDetObs');
  if (a.observaciones) {
    obsWrap.style.display = 'block';
    obsDiv.textContent = a.observaciones;
  } else {
    obsWrap.style.display = 'none';
  }
  // ── Lógica inteligente de botones y referencias cruzadas ──
  const tieneObra    = !!a.trabajo_id || trabajos.some(t => t.presupuesto_id && (window.albaranesData||[]).some(ab => ab.id === a.id && ab.presupuesto_id === t.presupuesto_id));
  const tieneFactura = (window.facturasData||[]).some(f => f.albaran_id === a.id) || (a.presupuesto_id && (window.facturasData||[]).some(f => f.presupuesto_id === a.presupuesto_id));

  // Badges de referencia (navegación a documentos vinculados) — estilo verde unificado
  const refDiv = document.getElementById('abDetRefs');
  if (refDiv) {
    let refs = '';
    const _refStyle = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer';
    if (a.presupuesto_id) {
      const pres = presupuestos.find(x=>x.id===a.presupuesto_id);
      refs += `<a href="#" onclick="event.preventDefault();closeModal('mAbDetalle');verDetallePresupuesto(${a.presupuesto_id})" style="${_refStyle}">✅ Presupuesto ${pres?.numero||''}</a> `;
    }
    if (a.trabajo_id) {
      const obra = trabajos.find(t=>t.id===a.trabajo_id);
      refs += `<a href="#" onclick="event.preventDefault();closeModal('mAbDetalle');goPage('trabajos');abrirFichaObra(${a.trabajo_id})" style="${_refStyle}">✅ Obra ${obra?.numero||''}</a> `;
    }
    if (tieneFactura) {
      const fac = (window.facturasData||[]).find(f => f.albaran_id === a.id);
      refs += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700">✅ Factura ${fac?.numero||''}</span> `;
    }
    refDiv.innerHTML = refs;
    refDiv.style.display = refs ? 'flex' : 'none';
  }

  // Mostrar/ocultar cada botón según si ya existe el documento
  const abFooterObra = document.getElementById('abDetFooterObra');
  if (abFooterObra) abFooterObra.style.display = (a.trabajo_id || tieneObra || tieneFactura) ? 'none' : 'block';

  const abFooterBtns = document.getElementById('abDetFooterBtns');
  if (abFooterBtns) {
    const btnFac = abFooterBtns.querySelector('[onclick*="albaranToFactura"]');
    if (btnFac) btnFac.style.display = tieneFactura ? 'none' : '';
    abFooterBtns.style.display = tieneFactura ? 'none' : 'flex';
  }

  openModal('mAbDetalle', true);
}

async function editarAlbaran(id) {
  abrirEditor('albaran', id);
}

// ═══════════════════════════════════════════════
//  EXPORTAR
// ═══════════════════════════════════════════════
function exportarAlbaranes() {
  if (!window.XLSX) { toast('Cargando...','info'); return; }
  const lista = abFiltrados.length ? abFiltrados : albaranesData;
  if (!confirm('¿Exportar ' + lista.length + ' albaranes a Excel?')) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Número','Cliente','Referencia','Fecha','Total','Estado'],
    ...lista.map(a=>[a.numero||'',a.cliente_nombre||'',a.referencia||'',a.fecha||'',a.total||0,a.estado||''])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(()=>({wch:20}));
  XLSX.utils.book_append_sheet(wb,ws,'Albaranes');
  XLSX.writeFile(wb,'albaranes_'+new Date().toISOString().split('T')[0]+'.xlsx');
  toast('Exportado ✓','success');
}

// ═══════════════════════════════════════════════
//  FACTURACIÓN MÚLTIPLE
// ═══════════════════════════════════════════════

function abCheckChanged() {
  const checks = document.querySelectorAll('.ab-check:checked');
  const btn = document.getElementById('abFacturarMulti');
  if (!btn) return;
  if (checks.length < 2) { btn.style.display = 'none'; return; }
  // Verificar que todos sean del mismo cliente
  const clientes = new Set();
  checks.forEach(c => clientes.add(c.dataset.cliente));
  if (clientes.size > 1) {
    btn.style.display = 'inline-flex';
    btn.disabled = true;
    btn.title = 'Los albaranes seleccionados deben ser del mismo cliente';
    btn.textContent = '⚠️ Clientes distintos';
  } else {
    btn.style.display = 'inline-flex';
    btn.disabled = false;
    btn.title = '';
    btn.textContent = `🧾 Facturar ${checks.length} albaranes`;
  }
}

async function facturarAlbaranesMulti() {
  if (_creando) return;
  _creando = true;
  try {
    const checks = document.querySelectorAll('.ab-check:checked');
    if (checks.length < 2) return;
    const ids = [...checks].map(c => parseInt(c.value));
    const albs = ids.map(id => albaranesData.find(x => x.id === id)).filter(Boolean);
    if (!albs.length) return;

    // Verificar mismo cliente
    const clienteIds = new Set(albs.map(a => a.cliente_id));
    if (clienteIds.size > 1) { toast('Todos los albaranes deben ser del mismo cliente','error'); return; }

    const nums = albs.map(a => a.numero).join(', ');
    if (!confirm(`¿Crear una factura agrupando ${albs.length} albaranes?\n\n${nums}`)) return;

    // Combinar líneas con referencia al albarán
    let lineasTodas = [];
    let totalGlobal = 0;
    albs.forEach(a => {
      // Separador con nombre del albarán
      lineasTodas.push({ desc: `── ${a.numero} (${a.fecha||''}) ──`, cant: 0, precio: 0, _separator: true });
      (a.lineas || []).forEach(l => {
        lineasTodas.push({ ...l });
        const _br2 = (l.cant || 0) * (l.precio || 0);
        totalGlobal += _br2*(1-(l.dto||l.dto1||0)/100)*(1-(l.dto2||0)/100)*(1-(l.dto3||0)/100);
      });
    });

    const numero = await generarNumeroDoc('factura');
    const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);

    const { error } = await sb.from('facturas').insert({
      empresa_id: EMPRESA.id, numero,
      cliente_id: albs[0].cliente_id, cliente_nombre: albs[0].cliente_nombre,
      fecha: hoy.toISOString().split('T')[0],
      fecha_vencimiento: v.toISOString().split('T')[0],
      base_imponible: Math.round(totalGlobal * 100) / 100,
      total_iva: 0, total: Math.round(totalGlobal * 100) / 100,
      estado: 'pendiente',
      observaciones: `Factura agrupada: ${nums}`,
      lineas: lineasTodas,
      albaran_ids: ids,
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }

    // Marcar todos como facturados
    for (const a of albs) {
      await sb.from('albaranes').update({ estado: 'facturado' }).eq('id', a.id);
      const ab = albaranesData.find(x => x.id === a.id);
      if (ab) { ab.estado = 'facturado'; }
    }
    renderAlbaranes(abFiltrados.length ? abFiltrados : albaranesData);
    toast(`✅ Factura ${numero} creada con ${albs.length} albaranes`, 'success');
    loadDashboard();
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  ALBARÁN → OBRA
// ═══════════════════════════════════════════════
async function albaranToObra(id) {
  if (_creando) return;
  _creando = true;
  try {
    const a = albaranesData.find(x=>x.id===id);
    if (!a) return;
    // Comprobar si ya tiene obra vinculada
    if (a.trabajo_id && (typeof trabajos !== 'undefined') && trabajos.some(t=>t.id===a.trabajo_id)) {
      toast('🔒 Este albarán ya tiene obra vinculada','error'); return;
    }
    if (!confirm(`¿Crear obra desde el albarán ${a.numero}?`)) return;
    const c = clientes.find(x=>x.id===a.cliente_id);
    const dirParts = [c?.direccion_fiscal||c?.direccion, c?.cp_fiscal||c?.cp, c?.municipio_fiscal||c?.municipio, c?.provincia_fiscal||c?.provincia].filter(Boolean).join(', ');
    // Calcular número de obra correcto (max existente + 1)
    const yr = new Date().getFullYear();
    const maxNum = (trabajos||[]).reduce((mx, t) => {
      const m = (t.numero||'').match(/TRB-\d+-(\d+)/);
      return m ? Math.max(mx, parseInt(m[1])) : mx;
    }, 0);
    const numObra = `TRB-${yr}-${String(maxNum+1).padStart(3,'0')}`;
    const { data: obraData, error } = await sb.from('trabajos').insert({
      empresa_id: EMPRESA.id,
      numero: numObra,
      titulo: a.referencia || 'Obra desde '+a.numero,
      cliente_id: a.cliente_id, cliente_nombre: c?.nombre||a.cliente_nombre||'',
      estado: 'pendiente',
      fecha: new Date().toISOString().split('T')[0],
      presupuesto_id: a.presupuesto_id || null,
      descripcion: a.observaciones||null,
      direccion_obra_texto: dirParts||null,
      operario_id: CU.id, operario_nombre: CP?.nombre||'',
    }).select().single();
    if (error) { toast('Error: '+error.message,'error'); return; }
    // Vincular albarán a la obra recién creada
    if (obraData?.id) {
      await sb.from('albaranes').update({ trabajo_id: obraData.id }).eq('id', id);
      const ab = albaranesData.find(x=>x.id===id);
      if (ab) ab.trabajo_id = obraData.id;
      // Si el albarán tiene presupuesto, vincular también el presupuesto a la obra
      if (a.presupuesto_id) {
        await sb.from('presupuestos').update({ trabajo_id: obraData.id }).eq('id', a.presupuesto_id);
      }
    }
    // Refrescar trabajos en memoria
    const {data:tRefresh} = await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    if (typeof trabajos !== 'undefined') { trabajos.length = 0; (tRefresh||[]).forEach(t=>trabajos.push(t)); }
    filtrarAlbaranes();
    toast('🏗️ Obra creada desde albarán','success');
    if (typeof loadDashboard === 'function') loadDashboard();
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  IMPRIMIR / PDF ALBARÁN
// ═══════════════════════════════════════════════
function imprimirAlbaran(id) {
  const a = albaranesData.find(x=>x.id===id);
  if (!a) { toast('Albarán no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===a.cliente_id);
  const lineas = a.lineas||[];
  let htmlLineas = '';
  let total = 0;
  lineas.forEach(l => {
    const _br3 = (l.cant||1)*(l.precio||0);
    const sub = _br3*(1-(l.dto||l.dto1||0)/100)*(1-(l.dto2||0)/100)*(1-(l.dto3||0)/100);
    total += sub;
    htmlLineas += `<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.desc||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cant||0}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${(l.precio||0).toFixed(2)} €</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${sub.toFixed(2)} €</td></tr>`;
  });
  const dirEmpresa = [EMPRESA?.direccion, [EMPRESA?.cp, EMPRESA?.municipio].filter(Boolean).join(' '), EMPRESA?.provincia].filter(Boolean).join(', ');
  const dirCliente = c ? [c.direccion_fiscal||c.direccion, [c.cp_fiscal||c.cp, c.municipio_fiscal||c.municipio].filter(Boolean).join(' '), c.provincia_fiscal||c.provincia].filter(Boolean).join(', ') : '';
  const logoHtml = EMPRESA?.logo_url ? `<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:8px">` : `<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const win = window.open('','_blank','width=850,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>Albarán ${a.numero}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm 14mm 18mm 14mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;line-height:1.4}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm}@media print{body{background:#fff}.page{padding:0;min-height:auto}}</style>
  </head><body><div class="page">
    <div style="display:flex;gap:24px;margin-bottom:16px;align-items:stretch">
      <div style="flex:1"><div style="display:flex;align-items:flex-start;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div><div style="font-size:11px;color:#64748b">${EMPRESA?.razon_social||''}</div><div style="font-size:11px;color:#475569">${dirEmpresa}<br>CIF: ${EMPRESA?.cif||''} · Tel: ${EMPRESA?.telefono||''}</div></div></div></div>
      <div style="flex:1"><div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;border-left:4px solid #1e40af;height:100%"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:4px">CLIENTE</div><div style="font-size:15px;font-weight:700;margin-bottom:3px">${a.cliente_nombre||'—'}</div><div style="font-size:11px;color:#475569">${dirCliente}${c?.nif?'<br>NIF: '+c.nif:''}</div></div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px">
      <div style="font-size:11px;color:#1e40af;display:flex;align-items:baseline;gap:6px"><span style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px">ALBARÁN</span><span style="font-size:11px;font-weight:600;color:#475569">${a.numero||''}</span></div>
      <div style="font-size:11px;color:#64748b">Fecha: <b style="color:#334155">${a.fecha ? new Date(a.fecha).toLocaleDateString('es-ES') : '—'}</b></div>
    </div>
    ${a.referencia?`<div style="font-size:10.5px;color:#92400e;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 14px;border-radius:4px;margin-bottom:10px">Ref: ${a.referencia}</div>`:''}
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px">
      <thead><tr><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:right;width:70px">Cant.</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:right;width:100px">Precio</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:right;width:100px">Total</th></tr></thead>
      <tbody>${htmlLineas}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end"><div style="width:220px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px"><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800"><span>TOTAL</span><span style="color:#1e40af">${(a.total||total).toFixed(2)} €</span></div></div></div>
    ${a.observaciones?`<div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">Observaciones</div><div style="font-size:11px;color:#475569">${a.observaciones}</div></div>`:''}
    <div style="margin-top:30px;text-align:center;font-size:9px;color:#94a3b8">Recibí conforme: ___________________________ &nbsp;&nbsp;&nbsp; Fecha: ___/___/___</div>
  </div></body></html>`);
  win.document.close();
  setTimeout(()=>win.print(), 300);
}

// ═══════════════════════════════════════════════
//  ENVIAR ALBARÁN POR EMAIL
// ═══════════════════════════════════════════════
async function enviarAlbaranEmail(id) {
  const a = albaranesData.find(x=>x.id===id);
  if (!a) { toast('Albarán no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===a.cliente_id);
  const email = c?.email || '';
  const asuntoTxt = `Albarán ${a.numero||''} — ${EMPRESA?.nombre||''}`;
  const totalFmt = (a.total||0).toFixed(2).replace('.',',') + ' €';
  const fechaFmt = a.fecha ? new Date(a.fecha).toLocaleDateString('es-ES') : '—';

  // 1) Token público
  let token = a.acceso_token;
  if (!token) {
    token = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).substring(2)));
    const { error: tokErr } = await sb.from('albaranes').update({ acceso_token: token }).eq('id', a.id);
    if (!tokErr) a.acceso_token = token; else token = null;
  }
  const enlace = token ? `https://instaloerp.github.io/doc.html?t=${token}` : '';

  // 2) PDF base64
  let adjuntos = [];
  try {
    const b64 = await generarPdfAlbaran(a, { soloBase64: true });
    if (b64) adjuntos.push({ nombre: `Albaran_${(a.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')}.pdf`, base64: b64, tipo_mime: 'application/pdf' });
  } catch(e) { console.warn('No se pudo generar PDF para adjuntar:', e); }

  const cuerpoTxt =
`Estimado/a ${a.cliente_nombre||'cliente'},

Le adjuntamos el albarán ${a.numero||''} con fecha ${fechaFmt}.

Importe total: ${totalFmt}
${a.referencia ? 'Referencia: '+a.referencia : ''}
${enlace ? '\n👉 Ver, descargar o imprimir online:\n'+enlace+'\n' : ''}
Quedamos a su disposición para cualquier consulta.

Un saludo,
${EMPRESA?.nombre||''}
${EMPRESA?.telefono ? 'Tel: '+EMPRESA.telefono : ''}
${EMPRESA?.email || ''}`;

  if (typeof nuevoCorreo === 'function') {
    closeModal('mAbDetalle');
    await nuevoCorreo(email, asuntoTxt, cuerpoTxt, { tipo: 'albaran', id: a.id, ref: a.numero || '' }, adjuntos);
    if (typeof goPage === 'function') goPage('correo');
  } else {
    toast('Módulo de correo no disponible','error');
  }
}

// ═══════════════════════════════════════════════
//  GENERAR PDF ALBARÁN (jsPDF)
// ═══════════════════════════════════════════════
async function generarPdfAlbaran(idOrObj, opts) {
  const a = typeof idOrObj==='object' ? idOrObj : albaranesData.find(x=>x.id===idOrObj);
  if (!a) { toast('Albarán no encontrado','error'); return; }
  const _soloBase64 = !!(opts && opts.soloBase64);
  const cli = clientes.find(x=>x.id===a.cliente_id) || {};
  const doc = await window._buildPdfDocumento({
    tipo: 'ALBARÁN',
    numero: a.numero,
    fecha: a.fecha,
    titulo: a.titulo || a.referencia,
    cliente: {
      nombre: a.cliente_nombre || cli.nombre || '—',
      nif: cli.nif,
      direccion: cli.direccion_fiscal || cli.direccion,
      cp: cli.cp, municipio: cli.municipio, provincia: cli.provincia,
      email: cli.email, telefono: cli.telefono
    },
    lineas: a.lineas || [],
    base_imponible: a.base_imponible,
    total_iva: a.total_iva,
    total: a.total,
    observaciones: a.observaciones,
    condiciones: [
      ['Recepción', 'Recibí conforme — firma y fecha en la zona inferior.'],
      ['Referencia', a.referencia || '—']
    ],
    firma_zona: true
  });
  if (_soloBase64) {
    const dataUri = doc.output('datauristring');
    return (dataUri || '').split(',')[1] || null;
  }
  doc.save('Albaran_'+(a.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')+'.pdf');
  toast('📄 PDF albarán descargado ✓','success');
  if (typeof firmarYGuardarPDF === 'function') {
    const pdfData = doc.output('arraybuffer');
    firmarYGuardarPDF(pdfData, {
      tipo_documento: 'albaran', documento_id: a.id, numero: a.numero,
      entidad_tipo: 'cliente', entidad_id: a.cliente_id,
      entidad_nombre: a.cliente_nombre || cli?.nombre || ''
    }).then(r => {
      if (r && r.success && r.firma_info) toast('🔏 Albarán firmado digitalmente ✓', 'success');
      else if (r && !r.firmado) toast('📄 Albarán guardado (sin firma digital)', 'info');
    }).catch(e => { console.error('Error firmando albarán:', e); });
  }
  return;
  // ─── Código antiguo (deprecado) ───
  const { jsPDF } = window.jspdf;
  const doc2 = new jsPDF('p','mm','a4');
  const W=210, ML=15, MR=15, H=297;
  const azul=[27,79,216], gris=[100,116,139], negro=[30,41,59];
  let y=15;
  // Cabecera empresa
  doc.setFontSize(18); doc.setTextColor(...azul); doc.setFont(undefined,'bold');
  doc.text(EMPRESA?.nombre||'Mi Empresa', ML, y+6);
  doc.setFontSize(8.5); doc.setTextColor(...gris); doc.setFont(undefined,'normal');
  const empInfo=[];
  if(EMPRESA?.cif) empInfo.push('CIF: '+EMPRESA.cif);
  if(EMPRESA?.direccion) empInfo.push(EMPRESA.direccion);
  const empLoc=[EMPRESA?.cp,EMPRESA?.municipio,EMPRESA?.provincia].filter(Boolean).join(', ');
  if(empLoc) empInfo.push(empLoc);
  if(EMPRESA?.telefono) empInfo.push('Tel: '+EMPRESA.telefono);
  if(EMPRESA?.email) empInfo.push(EMPRESA.email);
  empInfo.forEach((t,i)=>doc.text(t,ML,y+12+i*3.5));
  // Título documento
  doc.setFontSize(22); doc.setTextColor(...azul); doc.setFont(undefined,'bold');
  doc.text('ALBARÁN', W-MR, y+6, {align:'right'});
  doc.setFontSize(11); doc.setTextColor(...negro);
  doc.text(a.numero||'—', W-MR, y+13, {align:'right'});
  y+=12+empInfo.length*3.5+8;
  // Línea separadora
  doc.setDrawColor(...azul); doc.setLineWidth(0.8); doc.line(ML,y,W-MR,y); y+=8;
  // Datos cliente
  const cli = clientes.find(x=>x.id===a.cliente_id);
  doc.setFontSize(8); doc.setTextColor(...gris); doc.text('CLIENTE',ML,y);
  doc.setFontSize(12); doc.setTextColor(...negro); doc.setFont(undefined,'bold');
  doc.text(a.cliente_nombre||'—',ML,y+5.5);
  doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
  let cy=y+10;
  if(cli?.nif){doc.text('NIF: '+cli.nif,ML,cy);cy+=3.8;}
  if(cli?.direccion){doc.text(cli.direccion,ML,cy);cy+=3.8;}
  const cliLoc=[cli?.cp,cli?.municipio,cli?.provincia].filter(Boolean).join(', ');
  if(cliLoc){doc.text(cliLoc,ML,cy);cy+=3.8;}
  // Datos albarán (derecha)
  const rx=130;
  const datosA=[['Fecha',a.fecha?new Date(a.fecha).toLocaleDateString('es-ES'):'—']];
  if(a.referencia) datosA.push(['Referencia',a.referencia]);
  datosA.forEach(([k,v],i)=>{
    doc.setFontSize(8);doc.setTextColor(...gris);doc.text(k,rx,y+i*8);
    doc.setFontSize(10);doc.setTextColor(...negro);doc.setFont(undefined,'bold');
    doc.text(v,rx,y+4+i*8);doc.setFont(undefined,'normal');
  });
  y=Math.max(cy,y+datosA.length*8)+8;
  // Tabla líneas
  const lineas=a.lineas||[];
  const tableBody=lineas.map(l=>{
    const _br4=(l.cant||0)*(l.precio||0);const sub=_br4*(1-(l.dto||l.dto1||0)/100)*(1-(l.dto2||0)/100)*(1-(l.dto3||0)/100);
    return [l.desc||'',{content:String(l.cant||0),styles:{halign:'right'}},{content:fmtE(l.precio||0),styles:{halign:'right'}},{content:fmtE(sub),styles:{halign:'right',fontStyle:'bold'}}];
  });
  doc.autoTable({startY:y,margin:{left:ML,right:MR},head:[['Descripción','Cant.','Precio','Total']],body:tableBody,headStyles:{fillColor:azul,textColor:[255,255,255],fontSize:8.5,fontStyle:'bold',cellPadding:3},bodyStyles:{fontSize:8.5,textColor:negro,cellPadding:2.5},alternateRowStyles:{fillColor:[248,250,252]},columnStyles:{0:{cellWidth:'auto'},1:{cellWidth:20,halign:'right'},2:{cellWidth:28,halign:'right'},3:{cellWidth:30,halign:'right'}},theme:'grid',styles:{lineColor:[226,232,240],lineWidth:0.3}});
  y=doc.lastAutoTable.finalY+8;
  // Total
  const totX=130;
  doc.setDrawColor(...azul);doc.setLineWidth(0.5);doc.line(totX,y,W-MR,y);y+=5;
  doc.setFontSize(13);doc.setTextColor(...azul);doc.setFont(undefined,'bold');
  doc.text('TOTAL',totX,y); doc.text(fmtE(a.total||0),W-MR,y,{align:'right'});
  doc.setFont(undefined,'normal');y+=10;
  // Observaciones
  if(a.observaciones){doc.setFontSize(8);doc.setTextColor(...gris);doc.text('OBSERVACIONES',ML,y);y+=4;doc.setFontSize(8.5);doc.setTextColor(...negro);const ol=doc.splitTextToSize(a.observaciones,W-ML-MR);doc.text(ol,ML,y);y+=ol.length*3.5+5;}
  // Firma
  doc.setFontSize(8);doc.setTextColor(...gris);
  doc.text('Recibí conforme: ____________________________     Fecha: ___/___/___',ML,y+10);
  // Pie
  const footYCalc=Math.max(y+20, H-12);const finalFootY=footYCalc>H-8?H-12:footYCalc;
  doc.setFontSize(7.5);doc.setTextColor(...gris);doc.setDrawColor(226,232,240);doc.setLineWidth(0.3);doc.line(ML,finalFootY-4,W-MR,finalFootY-4);
  doc.text(EMPRESA?.nombre||'',ML,finalFootY);if(EMPRESA?.telefono)doc.text('Tel: '+EMPRESA.telefono,ML+50,finalFootY);if(EMPRESA?.email)doc.text(EMPRESA.email,ML+100,finalFootY);
  if (_soloBase64) {
    const dataUri = doc.output('datauristring');
    return (dataUri || '').split(',')[1] || null;
  }

  doc.save('Albaran_'+(a.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')+'.pdf');
  toast('📄 PDF albarán descargado ✓','success');

  // Firmar y guardar copia en documentos_generados
  if (typeof firmarYGuardarPDF === 'function') {
    const pdfData = doc.output('arraybuffer');
    const cli = clientes.find(c => c.id === a.cliente_id);
    firmarYGuardarPDF(pdfData, {
      tipo_documento: 'albaran',
      documento_id: a.id,
      numero: a.numero,
      entidad_tipo: 'cliente',
      entidad_id: a.cliente_id,
      entidad_nombre: a.cliente_nombre || cli?.nombre || ''
    }).then(r => {
      if (r && r.success && r.firma_info) toast('🔏 Albarán firmado digitalmente ✓', 'success');
      else if (r && !r.firmado) toast('📄 Albarán guardado (sin firma digital)', 'info');
    }).catch(e => { console.error('Error firmando albarán:', e); toast('⚠️ Error al firmar albarán', 'error'); });
  }
}
