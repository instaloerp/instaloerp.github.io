/**
 * MÓDULO PRESUPUESTOS
 * Gestión completa de presupuestos: listado, filtrado, estados, conversión a otros documentos
 * Incluye control de versiones y gestión del ciclo de vida del presupuesto
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let presupuestos = [];
let presFiltrados = [];
let _kpiFilterActivo = '';

// ═══════════════════════════════════════════════
//  CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadPresupuestos() {
  const { data } = await sb.from('presupuestos')
    .select('*').eq('empresa_id', EMPRESA.id)
    .neq('estado', 'eliminado')
    .order('created_at', { ascending: false });
  presupuestos = data || [];
  // Filtro por defecto: último año (hoy - 1 año hasta hoy)
  const _hoy = new Date();
  const _hace1a = new Date(_hoy);
  _hace1a.setFullYear(_hace1a.getFullYear() - 1);
  const _fmtDate = d => d.toISOString().split('T')[0];
  const dEl = document.getElementById('presDesde');
  const hEl = document.getElementById('presHasta');
  if (dEl && !dEl.value) dEl.value = _fmtDate(_hace1a);
  if (hEl && !hEl.value) hEl.value = _fmtDate(_hoy);
  // Activar "Aceptados" como filtro por defecto la primera vez
  if (!_kpiFilterActivo) filtrarPorKpi('aceptado');
  else filtrarPresupuestos();
}

function getEstadoPres(p) {
  return p.estado || 'borrador';
}

function renderPresupuestos(list) {
  const ESTADOS = {
    borrador:   { label:'Borrador',   ico:'✏️', color:'var(--gris-500)',   bg:'var(--gris-100)' },
    pendiente:  { label:'Pendiente',  ico:'⏳', color:'var(--amarillo)',   bg:'var(--amarillo-light)' },
    aceptado:   { label:'Aceptado',   ico:'✅', color:'var(--verde)',      bg:'var(--verde-light)' },
    caducado:   { label:'Caducado',   ico:'⏰', color:'var(--rojo)',       bg:'var(--rojo-light)' },
    anulado:    { label:'Anulado',    ico:'🚫', color:'var(--gris-400)',   bg:'var(--gris-100)' },
  };

  const hoy = new Date().toISOString().split('T')[0];
  presupuestos.forEach(p => {
    if (p.estado === 'pendiente' && p.fecha_validez && p.fecha_validez < hoy) {
      console.log('Auto-caducando', p.numero, '— validez:', p.fecha_validez, '< hoy:', hoy);
      p.estado = 'caducado';
      sb.from('presupuestos').update({estado:'caducado'}).eq('id', p.id)
        .then(r => { if(r.error) console.error('Error auto-caducar', p.numero, r.error.message); });
    }
  });

  const kTotal    = document.getElementById('pk-total');
  const kPend     = document.getElementById('pk-pendientes');
  const kAcep     = document.getElementById('pk-aceptados');
  const kCad      = document.getElementById('pk-caducados');
  const kBorr     = document.getElementById('pk-borradores');
  const kImpPend  = document.getElementById('pk-imp-pend');
  const kImpAcep  = document.getElementById('pk-imp-acep');
  const noAnulados = presupuestos.filter(p=>p.estado!=='anulado');
  const pends = presupuestos.filter(p=>p.estado==='pendiente');
  const aceps = presupuestos.filter(p=>p.estado==='aceptado');
  const borrs = presupuestos.filter(p=>p.estado==='borrador');
  if (kTotal)   kTotal.textContent   = noAnulados.length;
  if (kPend)    kPend.textContent    = pends.length;
  if (kAcep)    kAcep.textContent    = aceps.length;
  if (kCad)     kCad.textContent     = presupuestos.filter(p=>p.estado==='caducado').length;
  if (kBorr)    kBorr.textContent    = borrs.length;
  if (kImpPend) kImpPend.textContent = fmtE(pends.reduce((s,p)=>s+(p.total||0),0));
  if (kImpAcep) kImpAcep.textContent = fmtE(aceps.reduce((s,p)=>s+(p.total||0),0));

  const tbody = document.getElementById('presTable');
  if (!tbody) return;

  const fmtDT = (d) => { if(!d) return '—'; const dt=new Date(d); return dt.toLocaleDateString('es-ES')+' '+dt.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); };

  tbody.innerHTML = list.length ? list.map(p => {
    const estado = getEstadoPres(p);
    const est = ESTADOS[estado] || { label: estado||'—', ico:'❔', color:'var(--gris-400)', bg:'var(--gris-100)' };
    const hasVer = (p.version||1) > 1;
    const verBadge = hasVer ? `<button onclick="event.stopPropagation();togglePresVersiones(${p.id},this)" style="font-size:10px;background:var(--azul-light);color:var(--azul);padding:2px 8px;border-radius:10px;font-weight:700;border:1.5px solid var(--azul);cursor:pointer;margin-left:4px" title="Ver versiones anteriores">v${p.version} ▾</button>` : '';
    const fechaCreado = fmtDT(p.created_at);
    const fechaModif = p.updated_at ? fmtDT(p.updated_at) : '';
    const fechaInfo = fechaModif && fechaModif !== fechaCreado ? `<div style="font-size:10px;color:var(--gris-400)" title="Modificado: ${fechaModif}">mod. ${fechaModif}</div>` : '';
    const _esBorr = p.estado==='borrador' || (p.numero||'').startsWith('BORR-');
    return `<tr style="cursor:pointer" onclick="${_esBorr ? `abrirEditor('presupuesto',${p.id})` : `verDetallePresupuesto(${p.id})`}">
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">
        <div style="display:flex;align-items:center;gap:2px">${(p.numero||'').startsWith('BORR-') ? '<span style="color:var(--gris-400);font-style:italic">(borrador)</span>' : (p.numero||'—')}${verBadge}</div>
        <div style="font-size:10px;color:var(--gris-400);font-weight:400;font-family:var(--font)">${fechaCreado}</div>
        ${fechaInfo}
      </td>
      <td><div style="font-weight:600">${p.cliente_nombre||'—'}</div></td>
      <td style="color:var(--gris-600);font-size:12.5px">${p.titulo||'—'}</td>
      <td style="font-size:12px">${p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—'}</td>
      <td style="font-size:12px">${p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—'}</td>
      <td style="font-weight:700">${fmtE(p.total||0)}</td>
      <td onclick="event.stopPropagation()">
        <span onclick="cambiarEstadoPresMenu(event,${p.id})" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;color:${est.color};background:${est.bg};cursor:pointer" title="Cambiar estado">${est.ico} ${est.label}</span>
        ${(()=>{
          if (p.estado!=='aceptado') return '';
          let _h = '';
          if (p.firma_fecha) _h += '<div style="font-size:9px;color:var(--gris-400);margin-top:2px;text-align:center">'+new Date(p.firma_fecha).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</div>';
          // Tipo de aprobación
          if (p.firma_ip && p.firma_dispositivo) {
            // Firma digital del cliente (tiene IP + dispositivo)
            _h += '<div style="font-size:8px;margin-top:1px;text-align:center"><span style="color:#059669" title="Firmado digitalmente por '+((p.firma_nombre||''))+' — IP: '+(p.firma_ip||'')+' — DNI: '+((p.firma_dispositivo||{}).dni||'N/A')+'">🖊️ Firma digital</span></div>';
          } else if (p.firma_url) {
            // Documento subido
            _h += '<div style="font-size:8px;margin-top:1px;text-align:center"><a href="'+p.firma_url+'" target="_blank" onclick="event.stopPropagation()" style="color:var(--azul);text-decoration:none" title="Ver documento firmado adjunto">📎 Doc. firmado</a></div>';
          } else if (p.firma_fecha) {
            // Aprobado directo (tiene fecha pero no doc ni firma)
            _h += '<div style="font-size:8px;margin-top:1px;text-align:center"><span style="color:#D97706" title="Aprobado por '+(p.firma_nombre||'operario')+' sin documento">⚠️ Sin documento</span></div>';
          } else {
            // Aprobado antes del sistema de firmas
            _h += '<div style="font-size:8px;margin-top:1px;text-align:center"><span style="color:var(--gris-400)" title="Sin datos de aprobación">— sin datos —</span></div>';
          }
          return _h;
        })()}
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center">
          ${(()=>{
            // Borrador: no mostrar botones
            if (p.estado === 'borrador') return '';
            if (p.estado === 'caducado') return '<button onclick="event.stopPropagation();reactivarPresupuesto('+p.id+')" style="padding:4px 8px;border-radius:6px;border:1px solid #F59E0B;background:#FFFBEB;cursor:pointer;font-size:11px;font-weight:600;color:#92400E" title="Reactivar">🔄 Reactivar</button>';
            if (p.estado === 'anulado') return '<span style="font-size:10px;color:var(--gris-400)">Anulado</span>';
            // Pendiente: Aprobar + Crear obra
            if (p.estado === 'pendiente') {
              const _tO2 = trabajos.some(t=>t.presupuesto_id===p.id);
              const _obraEnviar = _tO2 ? trabajos.find(t=>t.presupuesto_id===p.id) : null;
              let _pBtns = '<button onclick="event.stopPropagation();enviarPresupuestoCliente('+p.id+','+(_obraEnviar?_obraEnviar.id:'null')+')" style="padding:4px 10px;border-radius:6px;border:none;background:#3b82f6;cursor:pointer;font-size:11px;font-weight:700;color:#fff" title="Enviar enlace de firma al cliente">📩 Enviar</button> ';
              _pBtns += '<button onclick="event.stopPropagation();abrirModalAprobar('+p.id+')" style="padding:4px 10px;border-radius:6px;border:1px solid #10B981;background:#D1FAE5;cursor:pointer;font-size:11px;font-weight:700;color:#065F46" title="Aprobar presupuesto">✅ Aprobar</button> ';
              if (_tO2) { const _ob2=trabajos.find(t=>t.presupuesto_id===p.id); _pBtns += '<a onclick="event.stopPropagation();goPage(\'trabajos\');abrirFichaObra('+_ob2.id+')" style="padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none">✅ Obra</a>'; }
              else _pBtns += '<button onclick="presToObra('+p.id+')" style="padding:4px 8px;border-radius:6px;border:1px solid #D1D5DB;background:white;cursor:pointer;font-size:11px;font-weight:600;color:#374151" title="Crear obra">🏗️ Crear obra</button>';
              return _pBtns;
            }
            // Aceptado: botones de conversión
            const _tO = trabajos.some(t=>t.presupuesto_id===p.id);
            const _tA = (window.albaranesData||[]).some(a=>a.presupuesto_id===p.id);
            const _albsP = (window.albaranesData||[]).filter(a=>a.presupuesto_id===p.id);
            const _tF = (window.facturasData||[]).some(f=>f.presupuesto_id===p.id) || _albsP.some(a=>(window.facturasData||[]).some(f=>f.albaran_id===a.id));
            const _bOK = 'padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none';
            let btns = '';
            if (_tO) { const _ob=trabajos.find(t=>t.presupuesto_id===p.id); btns += '<a onclick="event.stopPropagation();goPage(\'trabajos\');abrirFichaObra('+_ob.id+')" style="'+_bOK+'">✅ Obra</a> '; }
            else if (!_tF) btns += '<button onclick="presToObra('+p.id+')" style="padding:4px 8px;border-radius:6px;border:1px solid #D1D5DB;background:white;cursor:pointer;font-size:11px;font-weight:600;color:#374151" title="Crear obra">🏗️ Crear obra</button> ';
            if (_tA) { const _ab=(window.albaranesData||[]).find(a=>a.presupuesto_id===p.id); btns += '<a onclick="event.stopPropagation();verDetalleAlbaran('+_ab.id+')" style="'+_bOK+'">✅ Albarán</a> '; }
            else if (!_tF) btns += '<button onclick="presToAlbaran('+p.id+')" style="padding:4px 8px;border-radius:6px;border:1px solid #D1D5DB;background:white;cursor:pointer;font-size:11px;font-weight:600;color:#374151" title="Albaranar">📄 Albaranar</button> ';
            if (_tF) btns += '<span style="padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700">✅ Factura</span>';
            else btns += '<button onclick="presToFactura('+p.id+')" style="padding:4px 8px;border-radius:6px;border:1px solid #D1D5DB;background:white;cursor:pointer;font-size:11px;font-weight:600;color:#374151" title="Facturar">🧾 Facturar</button>';
            return btns;
          })()}
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="8"><div class="empty"><div class="ei">📋</div><h3>Sin presupuestos</h3><p>Crea el primero con el botón "+ Nuevo presupuesto"</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  FILTRADO Y BÚSQUEDA
// ═══════════════════════════════════════════════
function filtrarPorKpi(estado) {
  // '' desde el botón Total → usar '_todos' interno para distinguirlo
  _kpiFilterActivo = estado === '' ? '_todos' : estado;
  document.querySelectorAll('.kpi-filter').forEach(el => {
    const match = el.dataset.filtro === estado;
    el.style.outline = match ? '3px solid var(--azul)' : 'none';
    el.style.outlineOffset = '2px';
  });
  const sel = document.getElementById('presEstado');
  if (sel) sel.value = 'todos';
  filtrarPresupuestos();
}

function filtrarPresupuestos() {
  const q   = (document.getElementById('presSearch')?.value||'').toLowerCase();
  const est = document.getElementById('presEstado')?.value||'';
  const des = document.getElementById('presDesde')?.value||'';
  const has = document.getElementById('presHasta')?.value||'';
  const hayBusqueda = !!q;
  const kpi = _kpiFilterActivo;
  presFiltrados = presupuestos.filter(p => {
    if (kpi === '_todos') {
      // Total: mostrar TODO excepto anulados
      if (p.estado === 'anulado') return false;
    } else if (kpi) {
      if (p.estado !== kpi) return false;
    } else if (est === 'todos') {
      // dropdown "todos"
    } else if (est) {
      if (p.estado !== est) return false;
    } else if (!hayBusqueda) {
      if (p.estado === 'anulado' || p.estado === 'caducado' || p.estado === 'borrador') return false;
    }
    // Si hay filtro KPI activo, ignorar rango de fechas para no ocultar resultados
    const ignorarFechas = !!kpi;
    return (!q || (p.numero||'').toLowerCase().includes(q) || (p.cliente_nombre||'').toLowerCase().includes(q) || (p.titulo||'').toLowerCase().includes(q)) &&
      (ignorarFechas || !des || (p.fecha && p.fecha >= des)) &&
      (ignorarFechas || !has || (p.fecha && p.fecha <= has));
  });
  // Orden predeterminado: número de documento, más reciente primero (numérico)
  const _numSort = (n) => { const m = (n||'').match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  presFiltrados.sort((a,b) => _numSort(b.numero) - _numSort(a.numero));
  renderPresupuestos(presFiltrados);
}

// ═══════════════════════════════════════════════
//  GESTIÓN DE ESTADOS
// ═══════════════════════════════════════════════
async function cambiarEstadoPres(id, estado) {
  const { error } = await sb.from('presupuestos').update({ estado }).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  const p = presupuestos.find(x=>x.id===id);
  if (p) p.estado = estado;
  registrarAudit('cambiar_estado', 'presupuesto', id, 'Estado → '+estado+(p?' — '+p.numero:''));
  renderPresupuestos(presupuestos);
  toast('Estado actualizado ✓','success');
  loadDashboard();
}

function cambiarEstadoPresMenu(event, id) {
  event.stopPropagation();
  document.querySelectorAll('.est-menu-popup').forEach(m=>m.remove());
  const ESTADOS = [
    {key:'pendiente',ico:'⏳',label:'Pendiente'},
    {key:'aceptado',ico:'✅',label:'Aceptado'},
    {key:'rechazado',ico:'❌',label:'Rechazado'},
    {key:'anulado',ico:'🚫',label:'Anulado'},
  ];
  const menu = document.createElement('div');
  menu.className = 'est-menu-popup';
  menu.style.cssText = 'position:fixed;z-index:9999;background:white;border-radius:10px;box-shadow:var(--sh-lg);padding:6px;min-width:160px';
  menu.innerHTML = ESTADOS.map(e=>`<button onclick="cambiarEstadoPres(${id},'${e.key}');this.parentElement.remove()" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-family:var(--font)" onmouseenter="this.style.background='var(--gris-50)'" onmouseleave="this.style.background='none'">${e.ico} ${e.label}</button>`).join('');
  document.body.appendChild(menu);
  const rect = event.target.getBoundingClientRect();
  menu.style.top = (rect.bottom+4)+'px';
  menu.style.left = rect.left+'px';
  setTimeout(()=>{
    const handler = (e)=>{ if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',handler);} };
    document.addEventListener('click', handler);
  }, 10);
}

// ═══════════════════════════════════════════════
//  VER Y EDITAR
// ═══════════════════════════════════════════════
async function verDetallePresupuesto(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('presDetId').value = id;
  document.getElementById('presDetNro').textContent = p.numero||'—';
  document.getElementById('presDetCli').textContent = p.cliente_nombre||'—';
  document.getElementById('presDetFecha').textContent = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
  document.getElementById('presDetValido').textContent = p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—';
  document.getElementById('presDetTitulo').textContent = p.titulo||'—';
  document.getElementById('presDetTotal').textContent = fmtE(p.total||0);

  const lineas = p.lineas || [];
  let base=0, ivaTotal=0;
  document.getElementById('presDetLineas').innerHTML = lineas.map(l => {
    if (l.tipo==='capitulo') {
      return `<tr style="background:var(--azul-light);border-top:2px solid var(--azul)">
        <td colspan="6" style="padding:8px 10px;font-weight:700;font-size:13px;color:var(--azul)">📁 ${l.titulo||''}</td>
      </tr>`;
    }
    const sub = (l.cant||0)*(l.precio||0)*(1-((l.dto||0)/100));
    const iv = sub*((l.iva||0)/100);
    base+=sub; ivaTotal+=iv;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:8px 10px;font-size:13px">${l.desc||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.cant||0}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${fmtE(l.precio||0)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.dto?l.dto+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px">${l.iva!=null?l.iva+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub+iv)}</td>
    </tr>`;
  }).join('');
  document.getElementById('presDetBase').textContent = fmtE(p.base_imponible||base);
  document.getElementById('presDetIva').textContent = fmtE(p.total_iva||ivaTotal);
  document.getElementById('presDetTotal2').textContent = fmtE(p.total||0);

  const obs = document.getElementById('presDetObs');
  const obsWrap = document.getElementById('presDetObsWrap');
  if (p.observaciones) { obs.textContent = p.observaciones; obsWrap.style.display='block'; }
  else { obsWrap.style.display='none'; }

  // ── Lógica inteligente de botones y referencias cruzadas ──
  // Consultar directamente a Supabase para garantizar datos frescos
  const [_rAlb, _rFac, _rObr] = await Promise.all([
    sb.from('albaranes').select('id,numero,presupuesto_id').eq('empresa_id',EMPRESA.id).eq('presupuesto_id',p.id).neq('estado','eliminado'),
    sb.from('facturas').select('id,numero,presupuesto_id,albaran_id').eq('empresa_id',EMPRESA.id).neq('estado','eliminado'),
    sb.from('trabajos').select('id,numero,presupuesto_id').eq('empresa_id',EMPRESA.id).eq('presupuesto_id',p.id).neq('estado','eliminado'),
  ]);
  const _albsP = _rAlb.data||[];
  const _facsAll = _rFac.data||[];
  const _obrasP = _rObr.data||[];
  const tieneObra = _obrasP.length > 0;
  const tieneAlbaran = _albsP.length > 0;
  // Factura: directa (presupuesto→factura) o indirecta (presupuesto→albarán→factura)
  const tieneFactura = _facsAll.some(f => f.presupuesto_id === p.id) || _albsP.some(a => _facsAll.some(f => f.albaran_id === a.id));

  // Badges de referencia — estilo verde unificado, clickables
  const refDiv = document.getElementById('presDetRefs');
  if (refDiv) {
    let refs = '';
    const _refStyle = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer';
    if (tieneObra) {
      const obra = _obrasP[0];
      refs += `<a href="#" onclick="event.preventDefault();closeModal('mPresDetalle');goPage('trabajos');abrirFichaObra(${obra.id})" style="${_refStyle}">✅ Obra ${obra.numero||''}</a> `;
    }
    if (tieneAlbaran) {
      const alb = _albsP[0];
      refs += `<a href="#" onclick="event.preventDefault();closeModal('mPresDetalle');verDetalleAlbaran(${alb.id})" style="${_refStyle}">✅ Albarán ${alb.numero||''}</a> `;
    }
    if (tieneFactura) {
      let fac = _facsAll.find(f => f.presupuesto_id === p.id);
      if (!fac && _albsP.length) {
        fac = _facsAll.find(f => f.albaran_id === _albsP[0].id);
      }
      refs += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700">✅ Factura ${fac?.numero||''}</span> `;
    }
    // Información de aprobación según método
    if (p.estado === 'aceptado') {
      if (p.firma_ip && p.firma_dispositivo) {
        const _fd = p.firma_dispositivo || {};
        refs += `<span style="${_refStyle};background:#ECFDF5;color:#059669;border:1px solid #A7F3D0" title="IP: ${p.firma_ip||'—'} · DNI: ${_fd.dni||'N/A'} · ${_fd.ubicacion||''}">🖊️ Firma digital — ${p.firma_nombre||'—'}</span> `;
        if (p.firma_url) {
          refs += `<a href="${p.firma_url}" target="_blank" style="${_refStyle};background:#EFF6FF;color:#1E40AF;border:1px solid #BFDBFE">📎 Ver firma</a> `;
        }
      } else if (p.firma_url) {
        refs += `<a href="${p.firma_url}" target="_blank" style="${_refStyle};background:#EFF6FF;color:#1E40AF;border:1px solid #BFDBFE">📎 Doc. firmado</a> `;
      } else if (p.firma_fecha) {
        refs += `<span style="${_refStyle};background:#FFFBEB;color:#D97706;border:1px solid #FDE68A">⚠️ Sin documento — ${p.firma_nombre||'operario'}</span> `;
      } else {
        refs += `<span style="${_refStyle};background:#F3F4F6;color:#6B7280;border:1px solid #E5E7EB">— Sin datos de aprobación —</span> `;
      }
    }
    refDiv.innerHTML = refs;
    refDiv.style.display = refs ? 'flex' : 'none';
  }

  // Botón Aprobar en cabecera: solo visible si está pendiente
  const btnAprobar = document.getElementById('presDetBtnAprobar');
  if (btnAprobar) btnAprobar.style.display = (p.estado === 'pendiente') ? '' : 'none';

  // Botón Aprobar en footer: solo visible si está pendiente
  const btnFooterAprobar = document.getElementById('presDetFooterAprobar');
  if (btnFooterAprobar) btnFooterAprobar.style.display = (p.estado === 'pendiente') ? '' : 'none';

  // Mostrar/ocultar botones según estado y documentos existentes
  const esPendiente = p.estado === 'pendiente';
  const noConvertible = p.estado === 'borrador' || p.estado === 'caducado' || p.estado === 'anulado';

  // Crear obra: visible si pendiente o aceptado, y no tiene obra ni factura
  const presFooterObra = document.getElementById('presDetFooterObra');
  if (presFooterObra) presFooterObra.style.display = (noConvertible || tieneObra || tieneFactura) ? 'none' : 'block';

  // Albaranar/Facturar: solo para aceptados (NO pendientes)
  const presFooterBtns = document.getElementById('presDetFooterBtns');
  if (presFooterBtns) {
    if (noConvertible || esPendiente) {
      // Pendiente o no convertible: ocultar Albaranar/Facturar
      presFooterBtns.style.display = 'none';
    } else {
      const btnAlb = presFooterBtns.querySelector('[onclick*="presToAlbaran"]');
      const btnFac = presFooterBtns.querySelector('[onclick*="presToFactura"]');
      if (btnAlb) btnAlb.style.display = (tieneAlbaran || tieneFactura) ? 'none' : '';
      if (btnFac) btnFac.style.display = tieneFactura ? 'none' : '';
      const albVisible = !(tieneAlbaran || tieneFactura);
      const facVisible = !tieneFactura;
      presFooterBtns.style.display = (albVisible || facVisible) ? 'flex' : 'none';
    }
  }

  openModal('mPresDetalle', true);
}

async function editarPresupuesto(id) {
  abrirEditor('presupuesto', id);
}

// ═══════════════════════════════════════════════
//  ELIMINAR Y RESTAURAR
// ═══════════════════════════════════════════════
async function delPresupuesto(id) {
  if (!confirm('¿Anular este presupuesto? Se marcará como anulado y no se eliminará.')) return;
  const p = presupuestos.find(x=>x.id===id);
  const { error } = await sb.from('presupuestos').update({estado:'anulado'}).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  if (p) p.estado = 'anulado';
  registrarAudit('anular', 'presupuesto', id, 'Anulado '+(p?.numero||''));
  filtrarPresupuestos();
  toast('🚫 Presupuesto anulado','info');
  loadDashboard();
}

async function restaurarEstadoPres(id, nuevoEstado, fromEditor) {
  const p = presupuestos.find(x=>x.id===id);
  const esCaducado = p?.estado === 'caducado';
  const msg = esCaducado
    ? '♻️ Reactivar presupuesto '+(p?.numero||'')+'?\n\nSe extenderá la fecha de validez 15 días desde hoy y volverá a estado "pendiente".'
    : '¿Restaurar este presupuesto a estado "'+nuevoEstado+'"?';
  if (!confirm(msg)) return;

  const updateData = {estado: nuevoEstado};
  if (esCaducado) {
    const nueva = new Date();
    nueva.setDate(nueva.getDate() + 15);
    updateData.fecha_validez = nueva.toISOString().split('T')[0];
  }

  const { error } = await sb.from('presupuestos').update(updateData).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  if (p) { p.estado = nuevoEstado; if (updateData.fecha_validez) p.fecha_validez = updateData.fecha_validez; }
  registrarAudit('restaurar_estado', 'presupuesto', id, 'Restaurado a '+nuevoEstado+(esCaducado?' (+15 días validez)':'')+' — '+(p?.numero||''));
  toast('♻️ Presupuesto restaurado a '+nuevoEstado+(esCaducado?' — validez extendida 15 días':''),'success');
  await loadPresupuestos();
  loadDashboard();
  if (fromEditor) cerrarEditor();
}

function reactivarPresupuesto(id) {
  restaurarEstadoPres(id, 'pendiente', false);
}

async function eliminarDefinitivamente(id) {
  if (!CP?.es_superadmin) { toast('Solo superadmin puede eliminar definitivamente','error'); return; }
  const p = presupuestos.find(x=>x.id===id);

  let vinculados = [];
  try {
    const [r1, r2, r3] = await Promise.all([
      sb.from('albaranes').select('id,numero').eq('presupuesto_id', id),
      sb.from('facturas').select('id,numero').eq('presupuesto_id', id),
      sb.from('trabajos').select('id,numero').eq('presupuesto_id', id),
    ]);
    if (r1.data?.length) vinculados.push(...r1.data.map(d=>({tabla:'albaranes',id:d.id,num:d.numero,label:'Albarán'})));
    if (r2.data?.length) vinculados.push(...r2.data.map(d=>({tabla:'facturas',id:d.id,num:d.numero,label:'Factura'})));
    if (r3.data?.length) vinculados.push(...r3.data.map(d=>({tabla:'trabajos',id:d.id,num:d.numero,label:'Obra'})));
  } catch(e) { console.warn('Error checking vinculados:', e); }

  let msg = '⚠️ ELIMINAR DEFINITIVAMENTE el presupuesto '+(p?.numero||id)+'?\n\n⛔ Esta acción NO se puede deshacer.\nEl documento se eliminará permanentemente del sistema.';
  if (vinculados.length) {
    const lista = vinculados.map(v=>v.label+' '+v.num).join(', ');
    msg += '\n\n🔗 Docs vinculados que también se eliminarán:\n'+lista;
  }
  if (!confirm(msg)) return;

  for (const v of vinculados) {
    const { error: vErr } = await sb.from(v.tabla).update({estado:'eliminado'}).eq('id', v.id);
    if (vErr) console.warn('Error soft-delete vinculado:', v.tabla, v.id, vErr.message);
  }
  const { error } = await sb.from('presupuestos').update({estado:'eliminado'}).eq('id', id);
  if (error) {
    console.error('Error soft-delete presupuesto:', error.message);
    toast('Error al eliminar: '+error.message+'\n\n💡 Ejecuta SQL_papelera.sql en Supabase para habilitar la papelera','error');
    return;
  }

  const detalle = 'Eliminado '+(p?.numero||'')+(vinculados.length?' + '+vinculados.map(v=>v.label+' '+v.num).join(', '):'');
  registrarAudit('eliminar', 'presupuesto', id, detalle);
  presupuestos = presupuestos.filter(x=>x.id!==id);
  filtrarPresupuestos();
  toast('🗑️ Presupuesto eliminado'+(vinculados.length?' (+ '+vinculados.length+' docs vinculados)':''),'info');
  loadDashboard();
  if (deConfig.editId === id) cerrarEditor();
}

// ═══════════════════════════════════════════════
//  DUPLICAR Y EXPORTAR
// ═══════════════════════════════════════════════
async function duplicarPres(id) {
  if (_creando) return;
  _creando = true;
  try {
    const p = presupuestos.find(x=>x.id===id);
    if (!p) return;
    const nuevo = {...p}; delete nuevo.id; delete nuevo.created_at;
    nuevo.estado = 'borrador';
    nuevo.fecha  = new Date().toISOString().split('T')[0];
    nuevo.numero = await generarNumeroDoc('presupuesto');
    const { error } = await sb.from('presupuestos').insert(nuevo);
    if (error) { toast('Error: '+error.message,'error'); return; }
    toast('Duplicado ✓','success');
    await loadPresupuestos();
  } finally {
    _creando = false;
  }
}

function exportarPresupuestos() {
  if (!window.XLSX) { toast('Cargando...','info'); return; }
  const lista = presFiltrados.length ? presFiltrados : presupuestos;
  if (!confirm('¿Exportar ' + lista.length + ' presupuestos a Excel?')) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Número','Cliente','Título','Fecha','Válido hasta','Total','Estado'],
    ...lista.map(p=>[p.numero||'',p.cliente_nombre||'',p.titulo||'',p.fecha||'',p.fecha_validez||'',p.total||0,p.estado||''])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(()=>({wch:20}));
  XLSX.utils.book_append_sheet(wb,ws,'Presupuestos');
  XLSX.writeFile(wb,'presupuestos_'+new Date().toISOString().split('T')[0]+'.xlsx');
  toast('Exportado ✓','success');
}

// ═══════════════════════════════════════════════
//  CONVERSIONES
// ═══════════════════════════════════════════════
async function presToFactura(id) {
  if (_creando) return;
  _creando = true;
  try {
    const p = presupuestos.find(x=>x.id===id);
      if (!p) return;
    // Comprobar si ya tiene factura (directa o indirecta vía albarán)
    const _aD = window.albaranesData || (typeof albaranesData!=='undefined' ? albaranesData : []);
    const _fD = window.facturasData || [];
    const _albsP = _aD.filter(a=>a.presupuesto_id===p.id);
    const yaFacturado = _fD.some(f=>f.presupuesto_id===p.id) || _albsP.some(a=>_fD.some(f=>f.albaran_id===a.id));
    if (yaFacturado) { toast('🔒 Este presupuesto ya tiene factura','error'); return; }
    if (!confirm('¿Convertir el presupuesto '+p.numero+' en factura?')) return;
    const numero = await generarNumeroDoc('factura');
    const hoy = new Date(); const v = new Date(); v.setDate(v.getDate()+30);
    // Buscar si este presupuesto tiene obra vinculada para asignar trabajo_id
    // Buscar por presupuesto_id de la obra O por trabajo_id del presupuesto
    const _obraVinc = trabajos.find(t=>t.presupuesto_id===p.id) || (p.trabajo_id ? trabajos.find(t=>t.id===p.trabajo_id) : null);
    const { error } = await sb.from('facturas').insert({
      empresa_id: EMPRESA.id, numero,
      cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
      fecha: hoy.toISOString().split('T')[0],
      fecha_vencimiento: v.toISOString().split('T')[0],
      base_imponible: p.base_imponible, total_iva: p.total_iva, total: p.total,
      estado: 'pendiente', observaciones: p.observaciones, lineas: p.lineas,
      presupuesto_id: p.id,
      ...(_obraVinc ? {trabajo_id: _obraVinc.id} : {}),
    });
    if (error) { toast('Error: '+error.message,'error'); return; }
    // El presupuesto se queda en su estado actual
    // Si hay albaranes del mismo presupuesto, marcarlos como facturados
    const _albsDelPres = _aD.filter(a=>a.presupuesto_id===p.id);
    for (const alb of _albsDelPres) {
      await sb.from('albaranes').update({estado:'facturado'}).eq('id',alb.id);
      alb.estado = 'facturado';
    }
    // Refrescar facturas y albaranes en memoria
    const {data:facRefresh} = await sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    window.facturasData = facRefresh||[];
    const {data:albRefresh2} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    if (typeof albaranesData!=='undefined') albaranesData = albRefresh2||[];
    window.albaranesData = albRefresh2||[];
    filtrarPresupuestos();
    closeModal('mPresDetalle');
    toast('✅ Factura creada','success');
    loadDashboard();
    // Refrescar ficha de obra si está abierta
    { const _pg = document.querySelector('.page.active')?.id; if (_pg === 'page-trabajos' && typeof obraActualId !== 'undefined' && obraActualId && typeof abrirFichaObra === 'function') abrirFichaObra(obraActualId); }
  } finally {
    _creando = false;
  }
}

async function presToAlbaran(id) {
  if (_creando) return;
  _creando = true;
  try {
    const p = presupuestos.find(x=>x.id===id);
    if (!p) return;
    // Comprobar si ya tiene albarán o factura directa
    const _aD2 = window.albaranesData || (typeof albaranesData!=='undefined' ? albaranesData : []);
    const _fD6 = window.facturasData || [];
    if (_aD2.some(a=>a.presupuesto_id===p.id)) { toast('🔒 Este presupuesto ya tiene albarán','error'); return; }
    if (_fD6.some(f=>f.presupuesto_id===p.id)) { toast('🔒 Este presupuesto ya tiene factura, no se puede albaranar','error'); return; }
    if (!confirm('¿Crear albarán desde el presupuesto '+p.numero+'?')) return;
    const numero = await generarNumeroDoc('albaran');
    const lineas = (p.lineas||[]).filter(l=>l.tipo!=='capitulo').map(l=>({
      desc:l.desc||'', cant:l.cant||1, precio:l.precio||0
    }));
    let total=0; lineas.forEach(l=>total+=l.cant*l.precio);
    // Buscar si este presupuesto tiene obra vinculada para asignar trabajo_id
    // Buscar por presupuesto_id de la obra O por trabajo_id del presupuesto
    const _obraVinc2 = trabajos.find(t=>t.presupuesto_id===p.id) || (p.trabajo_id ? trabajos.find(t=>t.id===p.trabajo_id) : null);
    const { error } = await sb.from('albaranes').insert({
      empresa_id: EMPRESA.id, numero,
      cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
      fecha: new Date().toISOString().split('T')[0],
      referencia: p.titulo||null,
      total: Math.round(total*100)/100,
      estado: 'pendiente', observaciones: p.observaciones, lineas,
      presupuesto_id: p.id,
      ...(_obraVinc2 ? {trabajo_id: _obraVinc2.id} : {}),
    });
    if (error) { toast('Error: '+error.message,'error'); return; }
    // El presupuesto se queda en su estado actual
    // Refrescar albaranes en memoria para que la lógica inteligente detecte el nuevo registro
    const {data:albRefresh} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    albaranesData = albRefresh||[];
    window.albaranesData = albaranesData;
    filtrarPresupuestos();
    closeModal('mPresDetalle');
    toast('📄 Albarán creado','success');
    loadDashboard();
    // Refrescar ficha de obra si está abierta
    { const _pg = document.querySelector('.page.active')?.id; if (_pg === 'page-trabajos' && typeof obraActualId !== 'undefined' && obraActualId && typeof abrirFichaObra === 'function') abrirFichaObra(obraActualId); }
  } finally {
    _creando = false;
  }
}

async function presToObra(id) {
  if (_creando) return;
  _creando = true;
  try {
    const p = presupuestos.find(x=>x.id===id);
    if (!p) return;
    // Comprobar si ya tiene obra
    if (trabajos.some(t=>t.presupuesto_id===p.id)) { toast('🔒 Este presupuesto ya tiene obra','error'); return; }
    if (!confirm('¿Crear obra desde el presupuesto '+p.numero+'?')) return;
    const c = clientes.find(x=>x.id===p.cliente_id);
    const dirParts = [c?.direccion_fiscal||c?.direccion, c?.cp_fiscal||c?.cp, c?.municipio_fiscal||c?.municipio, c?.provincia_fiscal||c?.provincia].filter(Boolean).join(', ');
    const yr = new Date().getFullYear();
    const maxNum = (trabajos||[]).reduce((mx, t) => { const m = (t.numero||'').match(/TRB-\d+-(\d+)/); return m ? Math.max(mx, parseInt(m[1])) : mx; }, 0);
    const numObra = `TRB-${yr}-${String(maxNum+1).padStart(3,'0')}`;
    const { error } = await sb.from('trabajos').insert({
      empresa_id: EMPRESA.id,
      numero: numObra,
      titulo: p.titulo || 'Obra desde '+p.numero,
      cliente_id: p.cliente_id, cliente_nombre: c?.nombre||p.cliente_nombre||'',
      estado: 'pendiente',
      fecha: new Date().toISOString().split('T')[0],
      presupuesto_id: p.id,
      descripcion: p.observaciones||null,
      direccion_obra_texto: dirParts||null,
      operario_id: CU.id, operario_nombre: CP?.nombre||'',
    });
    if (error) { toast('Error: '+error.message,'error'); return; }
    // El presupuesto se queda en su estado actual — no cambia a aceptado automáticamente
    registrarAudit('crear_obra', 'presupuesto', id, 'Obra creada desde '+p.numero);
    // Refrescar trabajos en memoria para que los badges se actualicen
    const {data:tRefresh} = await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    if (typeof trabajos !== 'undefined') { trabajos.length = 0; (tRefresh||[]).forEach(t=>trabajos.push(t)); }
    filtrarPresupuestos();
    closeModal('mPresDetalle');
    toast('🏗️ Obra creada — aprueba el presupuesto cuando el cliente firme','success');
    loadDashboard();
    // Refrescar ficha de obra si está abierta
    { const _pg = document.querySelector('.page.active')?.id; if (_pg === 'page-trabajos' && typeof obraActualId !== 'undefined' && obraActualId && typeof abrirFichaObra === 'function') abrirFichaObra(obraActualId); }
  } finally {
    _creando = false;
  }
}

async function presupuestoTieneVinculados(presId) {
  try {
    const [r1, r2, r3] = await Promise.all([
      sb.from('albaranes').select('id',{count:'exact',head:true}).eq('presupuesto_id', presId),
      sb.from('facturas').select('id',{count:'exact',head:true}).eq('presupuesto_id', presId),
      sb.from('trabajos').select('id',{count:'exact',head:true}).eq('presupuesto_id', presId),
    ]);
    return (r1.count||0) + (r2.count||0) + (r3.count||0) > 0;
  } catch(e) { console.warn('Error checking vinculados:', e); return false; }
}

// ═══════════════════════════════════════════════
//  APROBACIÓN Y FIRMA DE PRESUPUESTOS
// ═══════════════════════════════════════════════

// Abre el modal de aprobación (llamado desde botones ✅ Aprobar)
function abrirModalAprobar(presId) {
  document.getElementById('aprobarPresId').value = presId;
  document.getElementById('aprobarPresFile').value = '';
  const linkDiv = document.getElementById('aprobarPresLink');
  if (linkDiv) { linkDiv.style.display = 'none'; linkDiv.innerHTML = ''; }
  openModal('mAprobarPres');
}

// Opción A: Subir documento firmado
async function aprobarConDocumento() {
  const presId = parseInt(document.getElementById('aprobarPresId').value);
  const file = document.getElementById('aprobarPresFile').files[0];
  if (!file) { toast('Selecciona un archivo','error'); return; }
  if (file.size > 10*1024*1024) { toast('El archivo no puede superar 10MB','error'); return; }

  toast('Subiendo documento...','info');
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `firmas/pres_${presId}_firma_${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file, { upsert: true });
  if (upErr) {
    // Si el bucket no existe, intentar con fotos-partes
    const { error: upErr2 } = await sb.storage.from('fotos-partes').upload(path, file, { upsert: true });
    if (upErr2) { toast('Error subiendo: '+upErr.message+'. Verifica que el bucket "documentos" existe en Supabase Storage','error'); return; }
    const { data: urlData } = sb.storage.from('fotos-partes').getPublicUrl(path);
    await _completarAprobacion(presId, urlData?.publicUrl || null, 'Documento firmado subido');
    return;
  }
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
  await _completarAprobacion(presId, urlData?.publicUrl || null, 'Documento firmado subido');
}

// Opción B: Generar enlace para firma del cliente
async function enviarParaFirma() {
  const presId = parseInt(document.getElementById('aprobarPresId').value);
  if (!presId) return;
  // Generar token único
  const token = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).substring(2));
  const { error } = await sb.from('presupuestos').update({ firma_token: token }).eq('id', presId);
  if (error) { toast('Error: '+error.message,'error'); return; }
  // El enlace de firma apunta a firma.html en el mismo dominio
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
  const firmaUrl = `${baseUrl}/firma.html?token=${token}`;
  const linkDiv = document.getElementById('aprobarPresLink');
  if (linkDiv) {
    linkDiv.style.display = 'block';
    linkDiv.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">Enlace de firma generado:</div>
      <a href="${firmaUrl}" target="_blank" style="color:var(--azul);word-break:break-all">${firmaUrl}</a>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${firmaUrl}');toast('Enlace copiado','success')" style="font-size:11px">📋 Copiar enlace</button>
        <button class="btn btn-sm" onclick="enviarEnlaceFirmaEmail(${presId},'${firmaUrl}')" style="font-size:11px">📧 Enviar por email</button>
      </div>`;
  }
  toast('Enlace de firma generado — envíalo al cliente','success');
}

// Enviar enlace de firma por email al cliente
async function enviarEnlaceFirmaEmail(presId, firmaUrl) {
  const p = presupuestos.find(x=>x.id===presId);
  if (!p) return;
  const c = clientes.find(x=>x.id===p.cliente_id);
  if (!c?.email) { toast('El cliente no tiene email configurado','error'); return; }
  const asunto = `Presupuesto ${p.numero} — Firma requerida`;
  const cuerpo = `Hola ${c.nombre},\n\nTe enviamos el presupuesto ${p.numero} por importe de ${(p.total||0).toFixed(2)} € para tu aprobación.\n\nPuedes ver y firmar el presupuesto en el siguiente enlace:\n${firmaUrl}\n\nGracias,\n${EMPRESA?.nombre||''}`;
  window.open(`mailto:${c.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`);
  toast('Abriendo email...','info');
}

// Opción C: Aprobar directamente sin documento
async function aprobarDirecto() {
  const presId = parseInt(document.getElementById('aprobarPresId').value);
  if (!presId) return;
  if (!confirm('¿Aprobar sin documento firmado?')) return;
  await _completarAprobacion(presId, null, 'Aprobado sin documento');
}

// Función interna: completar aprobación
async function _completarAprobacion(presId, firmaUrl, detalle) {
  const _userName = CP?.nombre || CU?.email || 'Operario';
  const updateData = {
    estado: 'aceptado',
    firma_fecha: new Date().toISOString(),
    firma_nombre: _userName,
    firma_dispositivo: {
      aprobado_por: _userName,
      email: CU?.email || '',
      metodo: firmaUrl ? 'documento_subido' : 'aprobacion_directa',
      fecha_local: new Date().toLocaleString('es-ES'),
    },
  };
  if (firmaUrl) updateData.firma_url = firmaUrl;

  const { error } = await sb.from('presupuestos').update(updateData).eq('id', presId);
  if (error) {
    // Si las columnas de firma no existen, aprobar solo con estado
    const { error: e2 } = await sb.from('presupuestos').update({ estado: 'aceptado' }).eq('id', presId);
    if (e2) { toast('Error: '+e2.message,'error'); return; }
  }
  const p = presupuestos.find(x=>x.id===presId); if(p) p.estado = 'aceptado';
  registrarAudit('aprobar', 'presupuesto', presId, detalle + (p?' — '+p.numero:''));
  closeModal('mAprobarPres');
  closeModal('mPresDetalle');
  filtrarPresupuestos();
  toast('✅ Presupuesto aprobado','success');
  loadDashboard();
  // Refrescar ficha de obra si está abierta
  const _pg = document.querySelector('.page.active')?.id;
  if (_pg === 'page-trabajos' && typeof obraActualId !== 'undefined' && obraActualId && typeof abrirFichaObra === 'function') abrirFichaObra(obraActualId);
}

// ═══════════════════════════════════════════════
//  IMPRESIÓN Y EMAIL
// ═══════════════════════════════════════════════
function _buildFirmaHtml(p) {
  if (p.estado === 'aceptado' && p.firma_fecha) {
    var _fFecha = new Date(p.firma_fecha).toLocaleString('es-ES');
    var _fDisp = p.firma_dispositivo || {};
    var html = '<div style="margin:16px 0;page-break-inside:avoid">';
    html += '<div style="display:flex;gap:24px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;background:#f8fafc">';
    html += '<div style="flex:1">';
    html += '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e40af;margin-bottom:6px">✅ Presupuesto aceptado por el cliente</div>';
    html += '<div style="font-size:11px;color:#334155;line-height:1.6">';
    html += '<b>Firmado por:</b> ' + (p.firma_nombre || '—') + '<br>';
    if (_fDisp.dni) html += '<b>DNI/NIF:</b> ' + _fDisp.dni + '<br>';
    html += '<b>Fecha:</b> ' + _fFecha + '<br>';
    html += '<b>IP:</b> ' + (p.firma_ip || '—') + '<br>';
    if (_fDisp.ubicacion && _fDisp.ubicacion !== 'No disponible') html += '<b>Ubicación:</b> ' + _fDisp.ubicacion + '<br>';
    html += '<b>Dispositivo:</b> ' + (_fDisp.tipo || '—') + ' — ' + (_fDisp.browser || '—');
    html += '</div></div>';
    if (p.firma_url) {
      html += '<div style="text-align:center"><div style="font-size:8px;color:#94a3b8;margin-bottom:4px">Firma del cliente</div>';
      html += '<img src="' + p.firma_url + '" style="max-width:180px;max-height:80px;border:1px solid #e2e8f0;border-radius:4px;background:#fff"></div>';
    }
    html += '</div></div>';
    return html;
  }
  var dias = p.fecha_validez ? Math.max(0, Math.round((new Date(p.fecha_validez) - new Date(p.fecha)) / (1000*60*60*24))) + ' días' : '—';
  return '<div class="validez-box">Este presupuesto tiene una validez de ' + dias + ' desde la fecha de emisión. Para aceptarlo, póngase en contacto con nosotros antes de la fecha de validez indicada.</div>';
}

function imprimirPresupuesto(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) { toast('Presupuesto no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===p.cliente_id);
  const capLineas = p.lineas||[];
  let htmlLineas = '';
  capLineas.forEach(l => {
    if (l.tipo==='capitulo') {
      htmlLineas += `<tr class="cap-row"><td colspan="6"><span class="cap-icon">■</span> ${l.titulo||''}</td></tr>`;
    } else if (l.tipo==='subcapitulo') {
      htmlLineas += `<tr class="sub-row"><td colspan="6"><span class="sub-icon">▸</span> ${l.titulo||''}</td></tr>`;
    } else {
      const dto = l.dto||0;
      const sub = (l.cant||1)*(l.precio||0)*(1-dto/100);
      const iva = sub*((l.iva||0)/100);
      htmlLineas += `<tr class="item-row">
        <td class="desc-cell">${l.desc||''}</td>
        <td class="num-cell">${l.cant||1}</td>
        <td class="num-cell">${(l.precio||0).toFixed(2)} €</td>
        <td class="num-cell">${dto?dto+'%':'—'}</td>
        <td class="num-cell">${l.iva||0}%</td>
        <td class="num-cell total-cell">${(sub+iva).toFixed(2)} €</td>
      </tr>`;
    }
  });
  const dirEmpresa = [EMPRESA?.direccion, [EMPRESA?.cp, EMPRESA?.municipio].filter(Boolean).join(' '), EMPRESA?.provincia].filter(Boolean).join(', ');
  const dirCliente = c ? [c.direccion_fiscal||c.direccion, [c.cp_fiscal||c.cp, c.municipio_fiscal||c.municipio].filter(Boolean).join(' '), c.provincia_fiscal||c.provincia].filter(Boolean).join(', ') : '';
  const logoHtml = EMPRESA?.logo_url ? `<img src="${EMPRESA.logo_url}" class="logo-img">` : `<div class="logo-placeholder">${(EMPRESA?.nombre||'JI').substring(0,2).toUpperCase()}</div>`;
  const win = window.open('','_blank','width=850,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>Presupuesto ${p.numero}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    @page{size:A4;margin:12mm 14mm 18mm 14mm}
    body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;line-height:1.4}
    .page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm;position:relative}
    .header-row{display:flex;gap:24px;margin-bottom:16px;align-items:stretch}
    .header-col{flex:1;min-width:0}
    .emp-block{display:flex;align-items:flex-start;gap:14px}
    .logo-img{width:60px;height:60px;object-fit:contain;border-radius:8px}
    .logo-placeholder{width:60px;height:60px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;letter-spacing:1px;flex-shrink:0}
    .emp-info .name{font-size:16px;font-weight:700;color:#1e40af;margin-bottom:1px}
    .emp-info .razon{font-size:11px;color:#64748b;margin-bottom:2px}
    .emp-info .datos{font-size:11px;color:#475569;line-height:1.55}
    .cli-block{background:#f1f5f9;border-radius:8px;padding:12px 16px;border-left:4px solid #1e40af;height:100%}
    .cli-block .label{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:4px}
    .cli-block .nombre{font-size:15px;font-weight:700;color:#1e2a3a;margin-bottom:3px}
    .cli-block .detalle{font-size:11px;color:#475569;line-height:1.55}
    .cli-block .detalle span{margin-right:12px}
    .doc-bar{display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px}
    .doc-bar .doc-left{font-size:11px;color:#1e40af;display:flex;align-items:baseline;gap:6px}
    .doc-bar .doc-left .tipo{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px}
    .doc-bar .doc-left .nro{font-size:11px;font-weight:600;color:#475569}
    .doc-bar .fechas{font-size:11px;color:#64748b;display:flex;gap:16px}
    .doc-bar .fechas b{color:#334155;font-weight:600}
    ${p.titulo?'.ref-line{font-size:10.5px;color:#92400e;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 14px;border-radius:4px;margin-bottom:10px}':''}
    .items-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}
    .items-table thead th{background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.7px;text-align:left}
    .items-table thead th.r{text-align:right}
    .cap-row td{background:#eef2ff;padding:7px 10px;font-weight:700;font-size:10.5px;color:#1e40af;border-bottom:1px solid #dbeafe}
    .cap-icon{color:#1e40af;margin-right:4px}
    .sub-row td{background:#f8fafc;padding:5px 10px 5px 22px;font-weight:600;font-size:10px;color:#475569;border-bottom:1px solid #f1f5f9}
    .sub-icon{color:#94a3b8;margin-right:3px}
    .item-row td{border-bottom:1px solid #f1f5f9}
    .desc-cell{padding:6px 10px;color:#334155}
    .num-cell{padding:6px 8px;text-align:right;color:#475569;white-space:nowrap}
    .total-cell{font-weight:700;color:#1e2a3a}
    .items-table tbody tr:last-child td{border-bottom:none}
    .totals-block{display:flex;justify-content:flex-end;margin-bottom:16px}
    .totals-inner{min-width:230px}
    .totals-row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569}
    .totals-row b{color:#1e2a3a}
    .totals-row.grand{padding:10px 14px;background:#1e40af;color:#fff;border-radius:6px;font-size:15px;font-weight:800;margin-top:4px}
    .totals-row.grand b{color:#fff}
    .obs-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:10px;color:#475569;line-height:1.5}
    .obs-box .obs-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px}
    .validez-box{background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:8px 14px;margin-bottom:12px;font-size:10px;color:#92400e;text-align:center}
    .footer{position:absolute;bottom:20px;left:36px;right:36px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between}
    @media print{
      body{background:#fff}
      .page{padding:0;box-shadow:none;min-height:auto}
      .no-print{display:none!important}
      .footer{position:fixed;bottom:8mm;left:14mm;right:14mm}
    }
    .btn-bar{text-align:center;padding:16px;background:#f5f5f5}
    .btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px;transition:all .2s}
    .btn-print{background:#1e40af;color:#fff}
    .btn-print:hover{background:#1d4ed8}
    .btn-close{background:#e2e8f0;color:#475569}
    .btn-close:hover{background:#cbd5e1}
  </style></head><body>
  <div class="no-print btn-bar">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
  <div class="page">
    <div class="header-row">
      <div class="header-col">
        <div class="emp-block">
          ${logoHtml}
          <div class="emp-info">
            <div class="name">${EMPRESA?.nombre||'Mi Empresa'}</div>
            ${EMPRESA?.razon_social?'<div class="razon">'+EMPRESA.razon_social+'</div>':''}
            <div class="datos">
              ${EMPRESA?.cif?'CIF: '+EMPRESA.cif+'<br>':''}
              ${dirEmpresa?dirEmpresa+'<br>':''}
              ${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.telefono&&EMPRESA?.email?' · ':''}${EMPRESA?.email?EMPRESA.email:''}
              ${EMPRESA?.web?'<br>'+EMPRESA.web:''}
            </div>
          </div>
        </div>
      </div>
      <div class="header-col">
        <div class="cli-block">
          <div class="label">Cliente</div>
          <div class="nombre">${p.cliente_nombre||'—'}</div>
          <div class="detalle">
            ${c?.nif?'<span><b>NIF:</b> '+c.nif+'</span>':''}
            ${c?.telefono?'<span><b>Tel:</b> '+c.telefono+'</span>':''}
            ${c?.email?'<br><b>Email:</b> '+c.email:''}
            ${dirCliente?'<br>'+dirCliente:''}
          </div>
        </div>
      </div>
    </div>
    <div class="doc-bar">
      <div class="doc-left"><span class="tipo">PRESUPUESTO</span><span class="nro">${p.numero||'—'}${p.version>1?' · v'+p.version:''}</span></div>
      <div class="fechas">
        <span><b>Fecha:</b> ${p.fecha?new Date(p.fecha).toLocaleDateString('es-ES'):'—'}</span>
        <span><b>Válido hasta:</b> ${p.fecha_validez?new Date(p.fecha_validez).toLocaleDateString('es-ES'):'—'}</span>
      </div>
    </div>
    ${p.titulo?'<div class="ref-line"><b>Ref:</b> '+p.titulo+'</div>':''}
    <table class="items-table">
      <thead><tr>
        <th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Dto.</th><th class="r">IVA</th><th class="r">Total</th>
      </tr></thead>
      <tbody>${htmlLineas}</tbody>
    </table>
    <div class="totals-block">
      <div class="totals-inner">
        <div class="totals-row"><span>Base imponible</span><b>${(p.base_imponible||0).toFixed(2)} €</b></div>
        <div class="totals-row"><span>IVA</span><b>${(p.total_iva||0).toFixed(2)} €</b></div>
        <div class="totals-row grand"><span>TOTAL</span><b>${(p.total||0).toFixed(2)} €</b></div>
      </div>
    </div>
    ${p.observaciones?'<div class="obs-box"><div class="obs-title">Observaciones</div>'+p.observaciones.replace(/\n/g,'<br>')+'</div>':''}
    `+_buildFirmaHtml(p)+`
    <div class="footer">
      <span>${EMPRESA?.nombre||''} ${EMPRESA?.cif?' · CIF: '+EMPRESA.cif:''}</span>
      <span>${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.email?' · '+EMPRESA.email:''}</span>
    </div>
  </div>
  </body></html>`);
  win.document.close();
}

function enviarPresupuestoEmail(id) {
  const p = presupuestos.find(x=>x.id===id);
  if (!p) { toast('Presupuesto no encontrado','error'); return; }
  const c = clientes.find(x=>x.id===p.cliente_id);
  const email = c?.email || '';
  const asunto = encodeURIComponent(`Presupuesto ${p.numero||''} — ${EMPRESA?.nombre||''}`);
  const totalFmt = (p.total||0).toFixed(2).replace('.',',') + ' €';
  const fechaFmt = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
  const validezFmt = p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—';
  const cuerpo = encodeURIComponent(
`Estimado/a ${p.cliente_nombre||'cliente'},

Le adjuntamos el presupuesto ${p.numero||''} con fecha ${fechaFmt}.

Importe total: ${totalFmt} (IVA incluido)
Válido hasta: ${validezFmt}

Para aceptar este presupuesto, puede responder a este correo o contactarnos directamente.

Un saludo cordial,
${EMPRESA?.nombre||''}
${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}
${EMPRESA?.email||''}
${EMPRESA?.web||''}`
  );
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, '_self');
  toast('📧 Abriendo cliente de correo...','info');
}

// ═══════════════════════════════════════════════
//  GUARDAR PRESUPUESTO Y GENERAR PDF
// ═══════════════════════════════════════════════
async function guardarPresupYPdf() {
  if (_creando) return;
  _creando = true;
  try {
    // Guardar primero como borrador
    const clienteId=parseInt(document.getElementById('pr_cliente').value);
    if(!clienteId){toast('Selecciona un cliente','error');return;}
    const lineas=prLineas.filter(l=>l.desc||l.precio>0||l.tipo==='capitulo');
    if(!lineas.filter(l=>l.tipo!=='capitulo').length){toast('Añade al menos una línea','error');return;}
    const c=clientes.find(x=>x.id===clienteId);
    let base=0,ivaT=0;
    lineas.filter(l=>l.tipo!=='capitulo').forEach(l=>{const s=l.cant*l.precio*(1-(l.dto||0)/100);base+=s;ivaT+=s*((l.iva||0)/100);});
    const editId = parseInt(document.getElementById('mPresupRapido').dataset.editId);
    const datos = {
      empresa_id:EMPRESA.id, numero:document.getElementById('pr_numero').value,
      cliente_id:clienteId, cliente_nombre:c?.nombre||'',
      fecha:document.getElementById('pr_fecha').value,
      fecha_validez:document.getElementById('pr_valido').value||null,
      titulo:document.getElementById('pr_titulo').value||null,
      forma_pago_id:parseInt(document.getElementById('pr_fpago').value)||null,
      base_imponible:Math.round(base*100)/100,
      total_iva:Math.round(ivaT*100)/100,
      total:Math.round((base+ivaT)*100)/100,
      observaciones:document.getElementById('pr_obs').value||null,
      lineas, estado:'borrador',
    };
    let error, savedId = editId;
    if (editId) {
      ({error} = await sb.from('presupuestos').update(datos).eq('id', editId));
    } else {
      const res = await sb.from('presupuestos').insert(datos).select('id').single();
      error = res.error;
      if (res.data) savedId = res.data.id;
    }
    if(error){toast('Error: '+error.message,'error');return;}
    closeModal('mPresupRapido');
    toast('💾 Guardado ✓ — Generando PDF...','success');
    await loadPresupuestos();
    loadDashboard();
    // Generar PDF
    const pres = presupuestos.find(x=>x.id===savedId) || {...datos, id:savedId};
    generarPdfPresupuesto(pres);
  } finally {
    _creando = false;
  }
}

// ═══════════════════════════════════════════════
//  GENERACIÓN DE PDF PRESUPUESTO
// ═══════════════════════════════════════════════
async function generarPdfPresupuesto(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','mm','a4');
  const W = 210, H = 297;
  const ML = 15, MR = 15;
  const azul = [27,79,216];
  const gris = [100,116,139];
  const negro = [30,41,59];

  let y = 15;

  // ─── CABECERA EMPRESA ───
  // Logo (si hay)
  // Nombre empresa
  doc.setFontSize(18);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text(EMPRESA.nombre||'Mi Empresa', ML, y+6);

  doc.setFontSize(8.5);
  doc.setTextColor(...gris);
  doc.setFont(undefined, 'normal');
  const empInfo = [];
  if (EMPRESA.cif) empInfo.push('CIF: '+EMPRESA.cif);
  if (EMPRESA.direccion) empInfo.push(EMPRESA.direccion);
  const empLoc = [EMPRESA.cp, EMPRESA.municipio, EMPRESA.provincia].filter(Boolean).join(', ');
  if (empLoc) empInfo.push(empLoc);
  if (EMPRESA.telefono) empInfo.push('Tel: '+EMPRESA.telefono);
  if (EMPRESA.email) empInfo.push(EMPRESA.email);
  empInfo.forEach((t,i)=> doc.text(t, ML, y+12+i*3.5));

  // ─── TÍTULO DOCUMENTO ───
  doc.setFontSize(22);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text('PRESUPUESTO', W-MR, y+6, {align:'right'});

  doc.setFontSize(11);
  doc.setTextColor(...negro);
  doc.text(p.numero||'—', W-MR, y+13, {align:'right'});

  y += 12 + empInfo.length*3.5 + 8;

  // ─── LÍNEA SEPARADORA ───
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.8);
  doc.line(ML, y, W-MR, y);
  y += 8;

  // ─── DATOS CLIENTE Y PRESUPUESTO ───
  // Cliente
  doc.setFontSize(8);
  doc.setTextColor(...gris);
  doc.text('CLIENTE', ML, y);
  doc.setFontSize(12);
  doc.setTextColor(...negro);
  doc.setFont(undefined, 'bold');
  doc.text(p.cliente_nombre||'—', ML, y+5.5);

  // Buscar datos cliente
  const cli = clientes.find(x=>x.id===p.cliente_id);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  let cy = y+10;
  if (cli?.nif) { doc.text('NIF: '+cli.nif, ML, cy); cy+=3.8; }
  if (cli?.direccion) { doc.text(cli.direccion, ML, cy); cy+=3.8; }
  const cliLoc = [cli?.cp, cli?.municipio, cli?.provincia].filter(Boolean).join(', ');
  if (cliLoc) { doc.text(cliLoc, ML, cy); cy+=3.8; }
  if (cli?.email) { doc.text(cli.email, ML, cy); cy+=3.8; }

  // Datos presupuesto (columna derecha)
  const rx = 130;
  const datosP = [
    ['Fecha', p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—'],
    ['Válido hasta', p.fecha_validez ? new Date(p.fecha_validez).toLocaleDateString('es-ES') : '—'],
  ];
  if (p.titulo) datosP.push(['Referencia', p.titulo]);

  datosP.forEach(([k,v],i)=>{
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text(k, rx, y+i*8);
    doc.setFontSize(10);
    doc.setTextColor(...negro);
    doc.setFont(undefined, 'bold');
    doc.text(v, rx, y+4+i*8);
    doc.setFont(undefined, 'normal');
  });

  y = Math.max(cy, y+datosP.length*8) + 8;

  // ─── TABLA LÍNEAS ───
  const lineas = (p.lineas||[]);
  const tableBody = [];
  let currentCap = null;

  lineas.forEach(l => {
    if (l.tipo==='capitulo') {
      currentCap = l.titulo||'Capítulo';
      tableBody.push([{content:'\u{1F4C1} '+currentCap, colSpan:6, styles:{fontStyle:'bold',fillColor:[238,243,255],textColor:azul,fontSize:9}}]);
    } else {
      const sub = (l.cant||0)*(l.precio||0)*(1-((l.dto||0)/100));
      const iv = sub*((l.iva||0)/100);
      tableBody.push([
        l.desc||'',
        {content:String(l.cant||0), styles:{halign:'right'}},
        {content:fmtE(l.precio||0), styles:{halign:'right'}},
        {content:l.dto?l.dto+'%':'—', styles:{halign:'right'}},
        {content:l.iva!=null?l.iva+'%':'—', styles:{halign:'right'}},
        {content:fmtE(sub+iv), styles:{halign:'right',fontStyle:'bold'}},
      ]);
    }
  });

  doc.autoTable({
    startY: y,
    margin: {left:ML, right:MR},
    head: [['Descripción','Cant.','Precio','Dto.','IVA','Total']],
    body: tableBody,
    headStyles: {fillColor:azul, textColor:[255,255,255], fontSize:8.5, fontStyle:'bold', cellPadding:3},
    bodyStyles: {fontSize:8.5, textColor:negro, cellPadding:2.5},
    alternateRowStyles: {fillColor:[248,250,252]},
    columnStyles: {
      0: {cellWidth:'auto'},
      1: {cellWidth:18, halign:'right'},
      2: {cellWidth:24, halign:'right'},
      3: {cellWidth:18, halign:'right'},
      4: {cellWidth:18, halign:'right'},
      5: {cellWidth:28, halign:'right'},
    },
    theme: 'grid',
    styles: {lineColor:[226,232,240], lineWidth:0.3},
  });

  y = doc.lastAutoTable.finalY + 8;

  // ─── TOTALES ───
  const totX = 130;
  const totW = W-MR-totX;

  // Base imponible
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  doc.text('Base imponible', totX, y);
  doc.setTextColor(...negro);
  doc.text(fmtE(p.base_imponible||0), W-MR, y, {align:'right'});
  y+=5;

  // IVA
  doc.setTextColor(...gris);
  doc.text('IVA', totX, y);
  doc.setTextColor(...negro);
  doc.text(fmtE(p.total_iva||0), W-MR, y, {align:'right'});
  y+=6;

  // Línea
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.5);
  doc.line(totX, y, W-MR, y);
  y+=5;

  // Total
  doc.setFontSize(13);
  doc.setTextColor(...azul);
  doc.setFont(undefined, 'bold');
  doc.text('TOTAL', totX, y);
  doc.text(fmtE(p.total||0), W-MR, y, {align:'right'});
  doc.setFont(undefined, 'normal');
  y+=10;

  // ─── OBSERVACIONES ───
  if (p.observaciones) {
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text('OBSERVACIONES', ML, y);
    y+=4;
    doc.setFontSize(8.5);
    doc.setTextColor(...negro);
    const obsLines = doc.splitTextToSize(p.observaciones, W-ML-MR);
    doc.text(obsLines, ML, y);
    y += obsLines.length * 3.5 + 5;
  }

  // ─── FIRMA DEL CLIENTE ───
  if (p.estado==='aceptado' && p.firma_fecha) {
    if (y > H-60) { doc.addPage(); y = ML; }
    y += 4;
    doc.setDrawColor(...azul);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, W-ML-MR, 28, 2, 2);
    doc.setFontSize(8);
    doc.setTextColor(...azul);
    doc.setFont(undefined, 'bold');
    doc.text('✅ PRESUPUESTO ACEPTADO POR EL CLIENTE', ML+4, y+5);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...negro);
    const _fd = p.firma_dispositivo||{};
    let _fy = y+10;
    doc.text('Firmado por: '+(p.firma_nombre||'—'), ML+4, _fy); _fy+=4;
    if (_fd.dni) { doc.text('DNI/NIF: '+_fd.dni, ML+4, _fy); _fy+=4; }
    doc.text('Fecha: '+new Date(p.firma_fecha).toLocaleString('es-ES'), ML+4, _fy); _fy+=4;
    doc.text('IP: '+(p.firma_ip||'—'), ML+4, _fy); _fy+=4;
    if (_fd.ubicacion && _fd.ubicacion !== 'No disponible') { doc.text('Ubicación: '+_fd.ubicacion, ML+4, _fy); _fy+=4; }
    doc.text('Dispositivo: '+(_fd.tipo||'—')+' — '+(_fd.browser||'—'), ML+4, _fy); _fy+=4;
    // Insertar imagen de firma si existe
    if (p.firma_url) {
      try {
        const _fImg = new Image(); _fImg.crossOrigin = 'anonymous';
        await new Promise((res,rej)=>{_fImg.onload=res;_fImg.onerror=rej;_fImg.src=p.firma_url;});
        const _fc = document.createElement('canvas'); _fc.width=_fImg.width; _fc.height=_fImg.height;
        _fc.getContext('2d').drawImage(_fImg,0,0);
        doc.addImage(_fc.toDataURL('image/png'), 'PNG', W-MR-55, y+6, 50, 18);
      } catch(e) { /* firma no disponible */ }
    }
    y = _fy + 6;
  }

  // ─── PIE DE PÁGINA ───
  const footY = H-12;
  doc.setFontSize(7.5);
  doc.setTextColor(...gris);
  doc.setDrawColor(226,232,240);
  doc.setLineWidth(0.3);
  doc.line(ML, footY-4, W-MR, footY-4);
  doc.text(EMPRESA.nombre||'', ML, footY);
  if (EMPRESA.telefono) doc.text('Tel: '+EMPRESA.telefono, ML+50, footY);
  if (EMPRESA.email) doc.text(EMPRESA.email, ML+100, footY);
  doc.text('Página 1 de 1', W-MR, footY, {align:'right'});

  // ─── DESCARGAR ───
  doc.save('Presupuesto_'+(p.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')+'.pdf');
  toast('📄 PDF descargado ✓','success');
}
