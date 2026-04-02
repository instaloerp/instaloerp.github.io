// ═══════════════════════════════════════════════
// Works/Jobs management - Trabajos/Obras
// ═══════════════════════════════════════════════

// Docs attached to work
let trDocsFiles = [];
let obraActualId = null;
let obraTabActual = 'presupuestos'; // recordar pestaña activa

// ═══════════════════════════════════════════════
// HELPER: sanitizar nombre de archivo para Supabase Storage
// ═══════════════════════════════════════════════
function _sanitizeFileName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}

// ═══════════════════════════════════════════════
// BUSCADOR DE CLIENTES (modal Nueva Obra)
// ═══════════════════════════════════════════════
function initTrCliBuscador() {
  const inp = document.getElementById('tr_cli_search');
  const drop = document.getElementById('tr_cli_dropdown');
  const hidden = document.getElementById('tr_cli');
  const selDiv = document.getElementById('tr_cli_selected');
  if (!inp || !drop) return;

  inp.addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    hidden.value = '';
    if (selDiv) { selDiv.style.display = 'none'; selDiv.textContent = ''; }
    if (q.length < 1) { drop.style.display = 'none'; return; }
    const matches = clientes.filter(c => (c.nombre||'').toLowerCase().includes(q) || (c.telefono||'').includes(q) || (c.email||'').toLowerCase().includes(q)).slice(0, 8);
    let html = matches.map(c => {
      const dir = c.direccion_fiscal || c.direccion || c.municipio_fiscal || c.municipio || '';
      return `<div onmousedown="trSeleccionarCliente(${c.id})" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--gris-100);transition:background .1s" onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background='#fff'">
        <div style="font-weight:600;font-size:12.5px">${c.nombre}</div>
        ${dir ? `<div style="font-size:10.5px;color:var(--gris-400)">${dir}</div>` : ''}
      </div>`;
    }).join('');
    if (matches.length === 0) {
      html = `<div style="padding:10px 12px;text-align:center">
        <div style="font-size:12px;color:var(--gris-400);margin-bottom:6px">No se encontró "${this.value}"</div>
        <button onmousedown="trCrearClienteRapido()" class="btn btn-sm" style="background:var(--azul);color:#fff;border:none;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer">+ Crear cliente nuevo</button>
      </div>`;
    }
    drop.innerHTML = html;
    drop.style.display = 'block';
  });

  inp.addEventListener('blur', function() {
    setTimeout(() => { drop.style.display = 'none'; }, 200);
  });

  inp.addEventListener('focus', function() {
    if (this.value.trim().length >= 1) this.dispatchEvent(new Event('input'));
  });
}

function trSeleccionarCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  const inp = document.getElementById('tr_cli_search');
  const hidden = document.getElementById('tr_cli');
  const drop = document.getElementById('tr_cli_dropdown');
  const selDiv = document.getElementById('tr_cli_selected');
  if (inp) inp.value = c.nombre;
  if (hidden) hidden.value = c.id;
  if (drop) drop.style.display = 'none';
  if (selDiv) {
    const dir = c.direccion_fiscal || c.direccion || '';
    const muni = c.municipio_fiscal || c.municipio || '';
    const tel = c.telefono || '';
    const info = [dir, muni, tel].filter(Boolean).join(' · ');
    selDiv.innerHTML = `${c.nombre} ${info ? `<span style="color:var(--gris-400);font-weight:400">— ${info}</span>` : ''} <span onclick="trLimpiarCliente()" style="cursor:pointer;color:var(--rojo);margin-left:4px" title="Quitar cliente">✕</span>`;
    selDiv.style.display = 'block';
  }
}

function trLimpiarCliente() {
  const inp = document.getElementById('tr_cli_search');
  const hidden = document.getElementById('tr_cli');
  const selDiv = document.getElementById('tr_cli_selected');
  if (inp) { inp.value = ''; inp.focus(); }
  if (hidden) hidden.value = '';
  if (selDiv) { selDiv.style.display = 'none'; selDiv.textContent = ''; }
}

function trCrearClienteRapido() {
  // Cerrar dropdown
  const drop = document.getElementById('tr_cli_dropdown');
  if (drop) drop.style.display = 'none';
  const searchText = document.getElementById('tr_cli_search')?.value || '';
  // Subir z-index del modal cliente para que aparezca encima
  const mTrabajo = document.getElementById('mTrabajo');
  const mCliente = document.getElementById('mCliente');
  if (mTrabajo) mTrabajo.style.zIndex = '199';
  if (mCliente) mCliente.style.zIndex = '210';
  openModal('mCliente');
  // Pre-rellenar nombre
  setTimeout(() => {
    const nameInput = document.getElementById('c_nombre');
    if (nameInput && searchText) nameInput.value = searchText;
  }, 200);
  // Esperar a que se cierre el modal de cliente para restaurar z-index y auto-seleccionar
  const _prevClientesCount = clientes.length;
  const _check = setInterval(() => {
    const isOpen = mCliente && mCliente.classList.contains('open');
    if (!isOpen) {
      clearInterval(_check);
      if (mTrabajo) mTrabajo.style.zIndex = '';
      if (mCliente) mCliente.style.zIndex = '';
      // Si se añadió un cliente nuevo, seleccionarlo automáticamente
      if (clientes.length > _prevClientesCount) {
        const nuevo = clientes[clientes.length - 1];
        trSeleccionarCliente(nuevo.id);
      }
    }
  }, 300);
}

// ═══════════════════════════════════════════════
// ABRIR MODAL NUEVA OBRA (con defaults)
// ═══════════════════════════════════════════════
function abrirNuevaObra() {
  // Reset campos
  document.getElementById('tr_titulo').value = '';
  document.getElementById('tr_cli_search').value = '';
  document.getElementById('tr_cli').value = '';
  const selDiv = document.getElementById('tr_cli_selected');
  if (selDiv) { selDiv.style.display = 'none'; selDiv.textContent = ''; }
  document.getElementById('tr_cat').value = '';
  document.getElementById('tr_prio').value = '';
  // Fecha = hoy
  document.getElementById('tr_fecha').value = new Date().toISOString().split('T')[0];
  // Hora = ahora
  const now = new Date();
  document.getElementById('tr_hora').value = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  document.getElementById('tr_desc').value = '';
  // Reset docs
  trDocsFiles = [];
  const docList = document.getElementById('tr_doc_list');
  if (docList) docList.innerHTML = '';
  // Título modal
  document.getElementById('mTrabTit').textContent = 'Nueva Obra';
  // Init buscador
  initTrCliBuscador();
  openModal('mTrabajo');
}

// ═══════════════════════════════════════════════
// FILTROS Y LISTADO
// ═══════════════════════════════════════════════
function initFiltroTrabajos() {
  const y = new Date().getFullYear();
  const dEl = document.getElementById('trDesde');
  const hEl = document.getElementById('trHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
}

function filtrarTrabajos() {
  const q = (document.getElementById('trSearch')?.value||'').toLowerCase();
  const est = document.getElementById('trEstado')?.value||'';
  const des = document.getElementById('trDesde')?.value||'';
  const has = document.getElementById('trHasta')?.value||'';
  const filtered = trabajos.filter(t => {
    if (est && t.estado !== est) return false;
    if (q && !(t.numero||'').toLowerCase().includes(q) && !(t.titulo||'').toLowerCase().includes(q) && !(t.cliente_nombre||'').toLowerCase().includes(q)) return false;
    if (des && t.fecha && t.fecha < des) return false;
    if (has && t.fecha && t.fecha > has) return false;
    return true;
  });
  // Orden predeterminado: número de documento, más reciente primero (numérico)
  const _numSort = (n) => { const m = (n||'').match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  filtered.sort((a,b) => _numSort(b.numero) - _numSort(a.numero));
  renderTrabajos(filtered);
}

function renderTrabajos(list) {
  if (!list) list = trabajos;
  document.getElementById('trabTable').innerHTML = list.length ?
    list.map(t=>{
      const _fDate = t.fecha || (t.created_at ? t.created_at.substring(0,10) : null);
      const _fShow = _fDate ? new Date(_fDate).toLocaleDateString('es-ES') : '—';
      return `<tr style="cursor:pointer" onclick="abrirFichaObra(${t.id})">
      <td style="font-family:monospace;font-size:11.5px;font-weight:700;color:var(--azul)">${t.numero}</td>
      <td style="font-weight:700">${t.titulo}</td>
      <td>${t.cliente_nombre||'—'}</td>
      <td style="font-size:11.5px">${_fShow}</td>
      <td>${estadoBadge(t.estado)}</td>
    </tr>`;
    }).join('') :
    '<tr><td colspan="5"><div class="empty"><div class="ei">🏗️</div><h3>Sin obras</h3></div></td></tr>';
}

// ═══════════════════════════════════════════════
// VISTA FICHA / LISTA
// ═══════════════════════════════════════════════
function setObraVista(vista) {
  const vl = document.getElementById('trVista-lista');
  const vf = document.getElementById('trVista-ficha');
  if (vl) vl.style.display = vista === 'lista' ? 'block' : 'none';
  if (vf) vf.style.display = vista === 'ficha' ? 'block' : 'none';
  // Ocultar topbar en ficha de obra (la cabecera ya tiene toda la info)
  const tb = document.getElementById('topbar');
  if (tb) tb.style.display = vista === 'ficha' ? 'none' : '';
}

function cerrarFichaObra() {
  obraActualId = null;
  setObraVista('lista');
  document.getElementById('pgTitle').textContent = 'Obras';
  document.getElementById('pgSub').textContent = '';
}

// ═══════════════════════════════════════════════
// ABRIR FICHA DE OBRA
// ═══════════════════════════════════════════════
async function abrirFichaObra(id) {
  obraActualId = id;
  const t = trabajos.find(x=>x.id===id);
  if (!t) { toast('Obra no encontrada','error'); return; }

  // Asegurar que estamos en la página de obras y vista ficha
  if (!document.getElementById('page-trabajos')?.classList.contains('active')) {
    goPage('trabajos');
  }
  setObraVista('ficha');

  // Cabecera — cliente en grande, obra en subtítulo
  const _cli = t.cliente_id ? clientes.find(c=>c.id===t.cliente_id) : null;
  const _cliNombre = _cli?.nombre || t.cliente_nombre || 'Sin cliente';
  document.getElementById('fichaObraClienteNombre').textContent = _cliNombre;
  document.getElementById('fichaObraTitulo').textContent = t.titulo || '';
  document.getElementById('pgTitle').textContent = t.numero;
  document.getElementById('pgSub').textContent = t.titulo;
  document.getElementById('fichaObraSub').textContent = t.numero;
  // Avatar con iniciales del cliente
  const _avEl = document.getElementById('fichaObraAvatar');
  if (_avEl) { _avEl.style.background = avC(_cliNombre); _avEl.textContent = ini(_cliNombre); }
  document.getElementById('fichaObraEstado').innerHTML = estadoBadge(t.estado);

  // Datos de la obra (panel izquierdo)
  document.getElementById('fichaObraDatos').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaObra('Número', t.numero)}
      ${datoFichaObra('Estado', t.estado ? t.estado.replace('_',' ') : '—')}
      ${datoFichaObra('Categoría', t.categoria||'—')}
      ${datoFichaObra('Prioridad', t.prioridad||'Normal')}
      ${datoFichaObra('Fecha', t.fecha||'—')}
      ${datoFichaObra('Hora', t.hora||'—')}
      ${datoFichaObra('Dirección', t.direccion_obra_texto||'—')}
      ${datoFichaObra('Operario', t.operario_nombre||'—')}
      ${t.descripcion?`<div style="margin-top:6px;padding:8px;background:var(--gris-50);border-radius:7px;font-size:11.5px;color:var(--gris-600);line-height:1.5">${t.descripcion}</div>`:''}
    </div>`;

  // Datos del cliente (panel izquierdo)
  const cli = t.cliente_id ? clientes.find(c=>c.id===t.cliente_id) : null;
  document.getElementById('fichaObraCliente').innerHTML = cli ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer" onclick="abrirFicha(${cli.id})">
      <div class="av av-sm" style="background:${avC(cli.nombre)};width:30px;height:30px;font-size:11px">${ini(cli.nombre)}</div>
      <div>
        <div style="font-weight:700;font-size:12.5px;color:var(--azul)">${cli.nombre}</div>
        <div style="font-size:10.5px;color:var(--gris-400)">${cli.nif||''} · ${cli.telefono||cli.movil||''}</div>
      </div>
    </div>
    ${datoFichaObra('Email', cli.email ? `<a href="mailto:${cli.email}" style="color:var(--azul);text-decoration:none;font-size:11px">${cli.email}</a>` : '—')}
    ${datoFichaObra('Teléfono', cli.telefono ? `<a href="tel:${cli.telefono}" style="color:inherit;text-decoration:none">${cli.telefono}</a>` : '—')}
    ${datoFichaObra('Municipio', cli.municipio_fiscal||cli.municipio||'—')}
  ` : '<div style="color:var(--gris-400);font-size:12px;padding:8px 0">Sin cliente asignado</div>';

  // ── Cargar datos relacionados en paralelo (con protección si tabla no existe) ──
  const safeQuery = (q) => q.then(r=>r).catch(()=>({data:[]}));
  // Construir OR clauses incluyendo trabajo_id para traer todo lo vinculado a esta obra
  const presOrClauses = [`trabajo_id.eq.${id}`];
  if (t.presupuesto_id) presOrClauses.push(`id.eq.${t.presupuesto_id}`);
  if (t.cliente_id) presOrClauses.push(`cliente_id.eq.${t.cliente_id}`);
  const docOrClauses = [`trabajo_id.eq.${id}`];
  if (t.presupuesto_id) docOrClauses.push(`presupuesto_id.eq.${t.presupuesto_id}`);
  if (t.cliente_id) docOrClauses.push(`cliente_id.eq.${t.cliente_id}`);

  const [presups, albs, facts, partes, docs, notas, audit, tareas] = await Promise.all([
    safeQuery(sb.from('presupuestos').select('*').eq('empresa_id',EMPRESA.id).or(presOrClauses.join(',')).neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).or(docOrClauses.join(',')).neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).or(docOrClauses.join(',')).neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('partes_trabajo').select('*').eq('trabajo_id',id).order('fecha',{ascending:false}).limit(50)),
    safeQuery(sb.from('documentos_trabajo').select('*').eq('trabajo_id',id).order('created_at',{ascending:false})),
    safeQuery(sb.from('notas_trabajo').select('*').eq('trabajo_id',id).order('created_at',{ascending:false})),
    safeQuery(sb.from('audit_log').select('*').eq('entidad','trabajo').eq('entidad_id',String(id)).order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('tareas_obra').select('*').eq('trabajo_id',id).order('created_at',{ascending:true})),
  ]);

  // Filtrar presupuestos/albaranes/facturas que realmente pertenecen a esta obra
  const presupData = (presups.data||[]).filter(p =>
    p.trabajo_id === id || (t.presupuesto_id && p.id === t.presupuesto_id)
  );
  // Crear set con TODOS los presupuesto_id vinculados a esta obra para buscar alb/fact
  const _presIdsObra = new Set(presupData.map(p=>p.id));
  const albData = (albs.data||[]).filter(a =>
    a.trabajo_id === id || _presIdsObra.has(a.presupuesto_id)
  );
  const factData = (facts.data||[]).filter(f =>
    f.trabajo_id === id || _presIdsObra.has(f.presupuesto_id) || albData.some(a => a.id === f.albaran_id)
  );
  const partesData = partes.data||[];
  const docsData = docs.data||[];
  const notasData = notas.data||[];
  const auditData = audit.data||[];
  obraTareasData = tareas.data||[];

  // KPIs — solo cantidades
  document.getElementById('ok-presup').textContent = presupData.length;
  document.getElementById('ok-albaranes').textContent = albData.length;
  document.getElementById('ok-facturas').textContent = factData.length;
  document.getElementById('ok-partes').textContent = partesData.length;
  document.getElementById('ok-docs').textContent = docsData.length;
  document.getElementById('ok-notas').textContent = notasData.length;
  updateTareasKpi();

  // ── WORKFLOW — Panel de estado del proyecto ──
  renderObraWorkflow(t, presupData, albData, factData, partesData);

  // Totales para resumen económico
  const totalPresup = presupData.reduce((s,p)=>s+(p.total||0),0);
  const totalAlb = albData.reduce((s,a)=>s+(a.total||0),0);
  const totalFact = factData.reduce((s,f)=>s+(f.total||0),0);
  const pendienteCobro = factData.filter(f=>f.estado==='pendiente'||f.estado==='vencida').reduce((s,f)=>s+(f.total||0),0);
  const horasPartes = partesData.reduce((s,p)=>s+(parseFloat(p.horas)||0),0);
  const costePartes = partesData.reduce((s,p)=>s+(parseFloat(p.coste_total)||0),0);

  // Resumen económico (panel izquierdo)
  document.getElementById('fichaObraResumen').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaObra('Presupuestado', fmtE(totalPresup))}
      ${datoFichaObra('Albaranado', fmtE(totalAlb))}
      ${datoFichaObra('Facturado', fmtE(totalFact))}
      ${pendienteCobro>0 ? datoFichaObra('Pte. cobro', '<span style="color:var(--rojo);font-weight:800">'+fmtE(pendienteCobro)+'</span>') : ''}
      <div style="border-top:1.5px solid var(--gris-200);margin:6px 0"></div>
      ${datoFichaObra('Horas partes', horasPartes.toFixed(1)+' h')}
      ${datoFichaObra('Coste partes', fmtE(costePartes))}
      ${totalFact>0 && costePartes>0 ? datoFichaObra('Margen', fmtE(totalFact-costePartes)) : ''}
    </div>`;

  // Registro / Auditoría (panel izquierdo)
  // KPI de registro
  document.getElementById('ok-registro').textContent = auditData.length;

  // ── REGISTRO DE ACTIVIDAD (pestaña completa) ──
  const _isSuperadmin = CP?.rol === 'superadmin' || CP?.rol === 'admin';
  const _fmtAudit = (d) => new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const _accionIco = (a) => {
    if (!a) return '📝';
    const al = a.toLowerCase();
    if (al.includes('crear') || al.includes('creado') || al.includes('nueva')) return '🆕';
    if (al.includes('editar') || al.includes('modific') || al.includes('actualiz')) return '✏️';
    if (al.includes('estado') || al.includes('cambio')) return '🔄';
    if (al.includes('documento') || al.includes('archivo') || al.includes('subir')) return '📎';
    if (al.includes('nota') || al.includes('comentario')) return '💬';
    if (al.includes('presupuesto')) return '📋';
    if (al.includes('albar')) return '📄';
    if (al.includes('factura')) return '🧾';
    if (al.includes('tarea')) return '✅';
    if (al.includes('eliminar') || al.includes('borrar')) return '🗑️';
    if (al.includes('aprobar') || al.includes('aceptar')) return '✅';
    return '📝';
  };

  // Construir timeline combinando audit_log + eventos implícitos
  const _timeline = [];
  // Evento de creación de la obra
  _timeline.push({
    fecha: t.created_at, usuario: t.operario_nombre || '—',
    accion: 'Obra creada', detalle: `${t.numero} — ${t.titulo}`, tipo: 'crear'
  });
  // Documentos subidos
  docsData.forEach(d => _timeline.push({
    fecha: d.created_at, usuario: '—',
    accion: 'Documento subido', detalle: `📎 ${d.nombre} (${d.tipo})`, tipo: 'documento'
  }));
  // Notas añadidas
  notasData.forEach(n => _timeline.push({
    fecha: n.created_at, usuario: n.creado_por_nombre || '—',
    accion: 'Nota añadida', detalle: `💬 ${(n.texto||'').substring(0,80)}`, tipo: 'nota'
  }));
  // Presupuestos vinculados
  presupData.forEach(p => _timeline.push({
    fecha: p.created_at, usuario: '—',
    accion: 'Presupuesto vinculado', detalle: `📋 ${p.numero} — ${p.titulo||''} (${p.estado})`, tipo: 'presupuesto'
  }));
  // Albaranes
  albData.forEach(a => _timeline.push({
    fecha: a.created_at, usuario: '—',
    accion: 'Albarán creado', detalle: `📄 ${a.numero} — ${fmtE(a.total)}`, tipo: 'albaran'
  }));
  // Facturas
  factData.forEach(f => _timeline.push({
    fecha: f.created_at, usuario: '—',
    accion: 'Factura emitida', detalle: `🧾 ${f.numero} — ${fmtE(f.total)}`, tipo: 'factura'
  }));
  // Audit log entries
  auditData.forEach(a => _timeline.push({
    fecha: a.created_at, usuario: a.usuario_nombre || '—',
    accion: a.accion || 'Acción', detalle: a.detalle || '', tipo: 'audit',
    id: a.id
  }));
  // Ordenar cronológicamente (más reciente primero)
  _timeline.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  const registroHtml = _timeline.length ? _timeline.map(e => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gris-100);align-items:flex-start">
      <div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:${
        e.tipo==='crear'?'#DBEAFE': e.tipo==='documento'?'#F3E8FF':
        e.tipo==='nota'?'#FEF3C7': e.tipo==='presupuesto'?'#DBEAFE':
        e.tipo==='albaran'?'#D1FAE5': e.tipo==='factura'?'#FEE2E2': '#F3F4F6'
      };display:flex;align-items:center;justify-content:center;font-size:14px">${_accionIco(e.accion)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;font-size:12px">${e.accion}</span>
          <span style="font-size:10px;color:var(--gris-400);white-space:nowrap">${_fmtAudit(e.fecha)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--gris-600);margin-top:2px;overflow-wrap:break-word">${e.detalle}</div>
        <div style="font-size:10px;color:var(--gris-400);margin-top:1px">por ${e.usuario}</div>
      </div>
      ${_isSuperadmin && e.id ? `<button onclick="eliminarAuditEntry(${e.id})" style="background:none;border:none;cursor:pointer;color:var(--gris-300);font-size:12px;padding:2px" title="Eliminar (solo superadmin)">🗑️</button>` : ''}
    </div>
  `).join('') : '<div style="color:var(--gris-400);font-size:12.5px;padding:30px 0;text-align:center">Sin actividad registrada</div>';

  document.getElementById('obra-hist-registro').innerHTML = `
    <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;color:var(--gris-400)">${_timeline.length} eventos registrados</span>
      ${_isSuperadmin ? '<span style="font-size:10px;color:var(--gris-400);background:var(--gris-50);padding:2px 8px;border-radius:4px">Modo superadmin</span>' : '<span style="font-size:10px;color:var(--gris-400);background:var(--gris-50);padding:2px 8px;border-radius:4px">Solo lectura</span>'}
    </div>
    ${registroHtml}
  `;

  // ── Helpers para barras resumen ──
  function resumenBar(items) {
    return `<div style="display:flex;gap:12px;padding:8px 10px;margin-bottom:10px;background:var(--gris-50);border-radius:8px;font-size:11.5px;flex-wrap:wrap">${items.join('')}</div>`;
  }
  function resumenItem(label, val, color) {
    return `<div><span style="color:var(--gris-400)">${label}:</span> <strong style="color:${color||'var(--gris-900)'}">${val}</strong></div>`;
  }

  // ── PRESUPUESTOS ── (con botones inteligentes de conversión)
  const presupHtml = presupData.length ?
    resumenBar([resumenItem('Total presupuestado', fmtE(totalPresup), 'var(--azul)'), resumenItem('Docs', presupData.length+'')]) +
    presupData.map(p=>{
      const noAnulado = p.estado !== 'eliminado' && p.estado !== 'anulado';
      const esBorrador = p.estado === 'borrador' || (p.numero||'').startsWith('BORR-');
      // Comprobar documentos existentes para este presupuesto
      const tieneAlb = albData.some(a=>a.presupuesto_id===p.id);
      const tieneFac = factData.some(f=>f.presupuesto_id===p.id) || albData.filter(a=>a.presupuesto_id===p.id).some(a=>factData.some(f=>f.albaran_id===a.id));
      const _bOK = 'padding:3px 8px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;cursor:pointer;text-decoration:none';
      const _bBtn = 'font-size:11px;padding:3px 6px';
      let acciones = '';
      if (esBorrador) {
        acciones += `<button onclick="event.stopPropagation();abrirEditor('presupuesto',${p.id})" style="padding:3px 8px;border-radius:6px;background:var(--amarillo-light);color:var(--amarillo);font-size:10px;font-weight:700;border:1px solid var(--amarillo);cursor:pointer">✏️ Editar borrador</button>`;
      } else if (noAnulado) {
        // Pendiente: Aprobar (sin Albaranar/Facturar)
        if (p.estado === 'pendiente') {
          acciones += `<button onclick="event.stopPropagation();abrirModalAprobar(${p.id})" style="padding:3px 8px;border-radius:6px;background:var(--verde);color:#fff;font-size:10px;font-weight:700;border:none;cursor:pointer">✅ Aprobar</button>`;
        } else if (p.estado === 'aceptado') {
          // Aceptado: botones de conversión
          if (tieneAlb) { const alb=albData.find(a=>a.presupuesto_id===p.id); acciones += `<a onclick="event.stopPropagation();verDetalleAlbaran(${alb.id})" style="${_bOK}">✅ Albarán</a> `; }
          else if (!tieneFac) acciones += `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();obraPresToAlbaran(${p.id})" title="Albaranar" style="${_bBtn}">📄 Albaranar</button> `;
          if (tieneFac) { acciones += `<span style="${_bOK}">✅ Factura</span>`; }
          else acciones += `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();obraPresToFactura(${p.id})" title="Facturar" style="${_bBtn}">🧾 Facturar</button>`;
        }
      }
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100)">
        <div style="cursor:pointer;flex:1" onclick="${esBorrador ? `abrirEditor('presupuesto',${p.id})` : `verDetallePresupuesto(${p.id})`}">
          <div style="font-weight:700;font-size:12.5px">${esBorrador ? '<span style="color:var(--gris-400);font-style:italic">Borrador</span>' : p.numero}</div>
          <div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.titulo||'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(p.total)}</div>${estadoBadgeP(p.estado)}</div>
          <div style="display:flex;gap:3px;margin-left:8px;align-items:center">${acciones}</div>
        </div>
      </div>`;
    }).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📋</div><p>Sin presupuestos vinculados</p></div>';
  document.getElementById('obra-hist-presupuestos').innerHTML = presupHtml;

  // ── ALBARANES ── (con botones inteligentes de conversión)
  const albSinFacturar = albData.filter(a => a.estado !== 'facturado' && a.estado !== 'anulado' && !factData.some(f=>f.albaran_id===a.id));
  const albHtml = albData.length ?
    resumenBar([resumenItem('Total albaranes', fmtE(totalAlb), 'var(--gris-700)'), resumenItem('Docs', albData.length+'')]) +
    (albSinFacturar.length >= 2 ? `<div style="text-align:right;margin-bottom:8px"><button class="btn btn-sm" onclick="obraFacturarTodosAlb()" style="background:#7C3AED;color:#fff;border:none;font-weight:700;font-size:11px;padding:5px 12px;border-radius:6px">🧾 Facturar ${albSinFacturar.length} albaranes juntos</button></div>` : '') +
    albData.map(a=>{
      const tieneFac = factData.some(f=>f.albaran_id===a.id) || (a.presupuesto_id && factData.some(f=>f.presupuesto_id===a.presupuesto_id));
      const _bOK = 'padding:3px 8px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700';
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100)">
        <div style="cursor:pointer;flex:1" onclick="verDetalleAlbaran(${a.id})">
          <div style="font-weight:700;font-size:12.5px">${a.numero}</div>
          <div style="font-size:10.5px;color:var(--gris-400)">${a.fecha||'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(a.total)}</div>${estadoBadgeA(a.estado)}</div>
          ${tieneFac ? `<span style="${_bOK};margin-left:8px">✅ Facturado</span>` : (a.estado!=='anulado' ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();obraAlbToFactura(${a.id})" title="Facturar" style="font-size:11px;padding:3px 6px;margin-left:8px">🧾 Facturar</button>` : '')}
        </div>
      </div>`;
    }).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📄</div><p>Sin albaranes vinculados</p></div>';
  document.getElementById('obra-hist-albaranes').innerHTML = albHtml;

  // ── FACTURAS ──
  const factResumen = [resumenItem('Total facturado', fmtE(totalFact), 'var(--verde)')];
  if (pendienteCobro > 0) factResumen.push(resumenItem('Pte. cobro', fmtE(pendienteCobro), 'var(--rojo)'));
  const factHtml = factData.length ?
    resumenBar(factResumen) +
    factData.map(f=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="abrirEditor('factura',${f.id})">
        <div><div style="font-weight:700;font-size:12.5px">${f.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${f.fecha||'—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(f.total)}</div>${estadoBadgeF(f.estado)}</div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">🧾</div><p>Sin facturas vinculadas</p></div>';
  document.getElementById('obra-hist-facturas').innerHTML = factHtml;

  // ── PARTES DE TRABAJO ──
  const partesHtml = partesData.length ?
    resumenBar([
      resumenItem('Total horas', horasPartes.toFixed(1)+' h', 'var(--acento)'),
      resumenItem('Coste', fmtE(costePartes), 'var(--gris-700)'),
      resumenItem('Partes', partesData.length+'')
    ]) +
    partesData.map(p=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100)">
        <div>
          <div style="font-weight:700;font-size:12.5px">${p.numero||'—'}</div>
          <div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.operario_nombre||'—'} · ${parseFloat(p.horas||0).toFixed(1)}h</div>
          ${p.descripcion?'<div style="font-size:11px;color:var(--gris-500);margin-top:2px">'+p.descripcion+'</div>':''}
        </div>
        <div style="text-align:right;font-weight:700;font-size:12.5px">${fmtE(p.coste_total||0)}</div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📝</div><p>Sin partes de trabajo</p></div>';
  document.getElementById('obra-hist-partes').innerHTML = partesHtml;

  // ── TAREAS ──
  renderObraTareas();

  // ── DOCUMENTOS ──
  const TIPO_ICO = {manual:'📖',garantia:'🛡️',certificado:'📜',foto:'📷',contrato:'📋',plano:'📐',otro:'📄'};
  document.getElementById('obra-hist-documentos').innerHTML = `
    <div>
      <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
        <select id="obraDocTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
          <option value="foto">📷 Foto</option><option value="plano">📐 Plano</option><option value="certificado">📜 Certificado</option>
          <option value="manual">📖 Manual</option><option value="garantia">🛡️ Garantía</option><option value="contrato">📋 Contrato</option><option value="otro">📄 Otro</option>
        </select>
        <input id="obraDocNombre" placeholder="Nombre..." style="flex:1;min-width:120px;padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <label class="btn btn-primary btn-sm" for="obraDocFile" style="cursor:pointer;font-size:11px">📎 Subir</label>
        <input type="file" id="obraDocFile" style="display:none" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" onchange="subirDocObra(this)">
      </div>
      ${docsData.length ? docsData.map(d => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100)">
          <span style="font-size:18px">${TIPO_ICO[d.tipo]||'📄'}</span>
          <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.nombre}</div><div style="font-size:10.5px;color:var(--gris-400)">${d.tipo} · ${new Date(d.created_at).toLocaleDateString('es-ES')}</div></div>
          <a href="${d.url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:10.5px;padding:3px 7px">👁️</a>
          <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="eliminarDocObra(${d.id})">🗑️</button>
        </div>`).join('') :
        '<div style="color:var(--gris-400);font-size:12.5px;padding:14px 0;text-align:center">Sin documentos adjuntos</div>'
      }
    </div>`;

  // ── NOTAS ──
  const NOTA_ICO = {nota:'📝',llamada:'📞',visita:'🚗',incidencia:'⚠️',material:'📦'};
  const notaForm = `
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:end">
      <select id="obraNotaTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <option value="nota">📝 Nota</option><option value="llamada">📞 Llamada</option><option value="visita">🚗 Visita</option><option value="incidencia">⚠️ Incidencia</option><option value="material">📦 Material</option>
      </select>
      <input id="obraNotaTexto" placeholder="Escribe una nota..." style="flex:1;min-width:200px;padding:6px 9px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:12px;outline:none;font-family:var(--font)">
      <button class="btn btn-primary btn-sm" style="font-size:11.5px;white-space:nowrap" onclick="guardarNotaObra()">💾 Guardar</button>
    </div>`;
  const notaList = notasData.length ?
    notasData.map(n => `
      <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <span style="font-size:16px;flex-shrink:0">${NOTA_ICO[n.tipo]||'📝'}</span>
        <div style="flex:1"><div style="font-size:12.5px;line-height:1.5">${n.texto}</div><div style="font-size:10.5px;color:var(--gris-400);margin-top:3px">${n.creado_por_nombre||'—'} · ${new Date(n.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>
        <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="eliminarNotaObra(${n.id})">🗑️</button>
      </div>`).join('') :
    '<div style="color:var(--gris-400);font-size:12.5px;padding:14px 0;text-align:center">Sin notas todavía</div>';
  document.getElementById('obra-hist-notas').innerHTML = notaForm + notaList;

  // Activar pestaña recordada (o presupuestos si es la primera vez)
  obraTab(obraTabActual || 'presupuestos');
}

// ═══════════════════════════════════════════════
// PESTAÑAS DE LA FICHA
// ═══════════════════════════════════════════════
const OBRA_TAB_TITLES = {presupuestos:'📋 Presupuestos',albaranes:'📄 Albaranes',facturas:'🧾 Facturas',partes:'📝 Partes de trabajo',tareas:'✅ Tareas',documentos:'📎 Documentos',notas:'💬 Notas',registro:'🕐 Registro de actividad'};

function obraTab(tab) {
  obraTabActual = tab; // recordar pestaña activa
  ['presupuestos','albaranes','facturas','partes','tareas','documentos','notas','registro'].forEach(t => {
    const el = document.getElementById('obra-hist-'+t);
    if (el) el.style.display = t===tab?'block':'none';
    const kpi = document.getElementById('okpi-'+t);
    if (kpi) kpi.classList.toggle('ficha-kpi-active', t===tab);
  });
  const titulo = document.getElementById('fichaObraHistTitulo');
  if (titulo) titulo.textContent = OBRA_TAB_TITLES[tab] || tab;
}

// ═══════════════════════════════════════════════
// GESTOR DE TAREAS DE OBRA
// ═══════════════════════════════════════════════
let obraTareasData = [];

const TAREA_ESTADOS = {
  pendiente:  { label:'Pendiente',  color:'#D97706', bg:'#FFFBEB', ico:'⏳' },
  en_curso:   { label:'En curso',   color:'#2563EB', bg:'#EFF6FF', ico:'🔄' },
  completada: { label:'Completada', color:'#059669', bg:'#ECFDF5', ico:'✔️' },
  bloqueada:  { label:'Bloqueada',  color:'#DC2626', bg:'#FEF2F2', ico:'🚫' },
};

const TAREA_PRIORIDADES = {
  baja:    { label:'Baja',    color:'#6B7280', ico:'▽' },
  normal:  { label:'Normal',  color:'#2563EB', ico:'◆' },
  alta:    { label:'Alta',    color:'#D97706', ico:'▲' },
  urgente: { label:'Urgente', color:'#DC2626', ico:'🔺' },
};

const TAREA_PLANTILLAS = [
  { texto:'Revisar presupuesto con el cliente', prioridad:'alta' },
  { texto:'Pedir material necesario', prioridad:'alta' },
  { texto:'Programar fecha de visita', prioridad:'alta' },
  { texto:'Fotos antes del trabajo', prioridad:'normal' },
  { texto:'Ejecutar instalación', prioridad:'normal' },
  { texto:'Fotos después del trabajo', prioridad:'normal' },
  { texto:'Recoger firma del cliente', prioridad:'normal' },
  { texto:'Crear albarán de entrega', prioridad:'alta' },
  { texto:'Retirar escombros / limpieza', prioridad:'baja' },
  { texto:'Verificar funcionamiento', prioridad:'alta' },
];

function renderObraTareas() {
  const container = document.getElementById('obra-hist-tareas');
  if (!container) return;

  // Separar por estado
  const pendientes = obraTareasData.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso' || t.estado === 'bloqueada');
  const completadas = obraTareasData.filter(t => t.estado === 'completada');
  const progreso = obraTareasData.length ? Math.round((completadas.length / obraTareasData.length) * 100) : 0;

  // Barra de progreso
  let html = `<div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:12px;font-weight:700;color:var(--gris-600)">${completadas.length} de ${obraTareasData.length} completadas</span>
      <span style="font-size:13px;font-weight:800;color:${progreso===100?'#059669':'var(--azul)'}">${progreso}%</span>
    </div>
    <div style="height:8px;background:var(--gris-100);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${progreso}%;background:${progreso===100?'linear-gradient(90deg,#34D399,#059669)':'linear-gradient(90deg,#60A5FA,#2563EB)'};border-radius:4px;transition:width .5s"></div>
    </div>
  </div>`;

  // Formulario de añadir tarea
  html += `<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:end">
    <input id="obraTareaTexto" placeholder="Nueva tarea..." style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:12.5px;outline:none;font-family:var(--font)" onkeydown="if(event.key==='Enter'){event.preventDefault();guardarTareaObra()}">
    <select id="obraTareaPrio" style="padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
      <option value="normal">◆ Normal</option>
      <option value="alta">▲ Alta</option>
      <option value="urgente">🔺 Urgente</option>
      <option value="baja">▽ Baja</option>
    </select>
    <select id="obraTareaResp" style="padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none;max-width:140px">
      <option value="">Sin asignar</option>
    </select>
    <input id="obraTareaFecha" type="date" style="padding:6px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
    <button class="btn btn-primary btn-sm" onclick="guardarTareaObra()" style="font-size:11.5px;white-space:nowrap">+ Añadir</button>
  </div>`;

  // Plantillas rápidas
  html += `<div style="margin-bottom:14px">
    <details>
      <summary style="font-size:11px;color:var(--gris-400);cursor:pointer;user-select:none;font-weight:600">💡 Tareas predefinidas (clic para desplegar)</summary>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
        ${TAREA_PLANTILLAS.map(p => {
          const yaExiste = obraTareasData.some(t => t.texto === p.texto);
          return yaExiste
            ? `<button disabled style="background:var(--gris-100);border:1px solid var(--gris-200);padding:4px 8px;border-radius:6px;font-size:10.5px;color:var(--gris-300);text-decoration:line-through;cursor:default">${p.texto}</button>`
            : `<button onclick="addTareaPlantilla('${p.texto.replace(/'/g,"\\'")}','${p.prioridad}')" style="background:var(--gris-50);border:1px solid var(--gris-200);padding:4px 8px;border-radius:6px;font-size:10.5px;cursor:pointer;color:var(--gris-600);transition:all .15s" onmouseover="this.style.background='var(--azul-light)';this.style.borderColor='var(--azul)'" onmouseout="this.style.background='var(--gris-50)';this.style.borderColor='var(--gris-200)'">${p.texto}</button>`;
        }).join('')}
      </div>
      <div style="margin-top:8px;text-align:right">
        <button onclick="cargarTodasPlantillas()" class="btn btn-sm" style="font-size:10.5px;background:var(--violeta);color:#fff;border:none;border-radius:6px;padding:5px 12px;cursor:pointer">📋 Cargar todas las plantillas</button>
      </div>
    </details>
  </div>`;

  // Lista de tareas pendientes
  if (pendientes.length) {
    html += pendientes.map(t => renderTareaItem(t)).join('');
  } else if (!completadas.length) {
    html += `<div style="text-align:center;padding:30px 0;color:var(--gris-400)">
      <div style="font-size:32px;margin-bottom:8px">✅</div>
      <p style="font-size:13px">Sin tareas. Añade una arriba o usa las plantillas.</p>
    </div>`;
  }

  // Tareas completadas (colapsable)
  if (completadas.length) {
    html += `<details style="margin-top:12px" ${pendientes.length ? '' : 'open'}>
      <summary style="font-size:11.5px;color:var(--gris-400);cursor:pointer;user-select:none;font-weight:700;padding:6px 0;border-top:1px solid var(--gris-100)">
        ✔️ ${completadas.length} tarea${completadas.length>1?'s':''} completada${completadas.length>1?'s':''}
      </summary>
      <div style="opacity:0.7">${completadas.map(t => renderTareaItem(t)).join('')}</div>
    </details>`;
  }

  container.innerHTML = html;

  // Poblar select de responsables
  poblarSelectResponsables();
}

function renderTareaItem(t) {
  const est = TAREA_ESTADOS[t.estado] || TAREA_ESTADOS.pendiente;
  const prio = TAREA_PRIORIDADES[t.prioridad] || TAREA_PRIORIDADES.normal;
  const isCompleta = t.estado === 'completada';
  const vencida = t.fecha_limite && !isCompleta && new Date(t.fecha_limite) < new Date();
  const hoy = t.fecha_limite && new Date(t.fecha_limite).toDateString() === new Date().toDateString();

  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--gris-100);transition:background .15s;${isCompleta?'text-decoration:line-through;opacity:0.6':''}" onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background=''">
    <!-- Checkbox -->
    <div onclick="toggleTareaObra(${t.id})" style="cursor:pointer;width:22px;height:22px;border-radius:6px;border:2px solid ${isCompleta?'#059669':'var(--gris-300)'};background:${isCompleta?'#ECFDF5':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;transition:all .2s" onmouseover="this.style.borderColor='${isCompleta?'#059669':'var(--azul)'}'" onmouseout="this.style.borderColor='${isCompleta?'#059669':'var(--gris-300)'}'">${isCompleta?'<span style="color:#059669;font-size:13px;font-weight:800">✓</span>':''}</div>
    <!-- Contenido -->
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;font-weight:600;line-height:1.4;color:${isCompleta?'var(--gris-400)':'var(--gris-800)'}">${t.texto}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px;align-items:center">
        <span style="font-size:10px;color:${prio.color};font-weight:700">${prio.ico} ${prio.label}</span>
        ${t.responsable_nombre ? `<span style="font-size:10px;background:var(--gris-100);padding:1px 6px;border-radius:4px;color:var(--gris-600)">👤 ${t.responsable_nombre}</span>` : ''}
        ${t.fecha_limite ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600;${vencida?'background:#FEF2F2;color:#DC2626':hoy?'background:#FFFBEB;color:#D97706':'background:var(--gris-50);color:var(--gris-500)'}">📅 ${new Date(t.fecha_limite).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}${vencida?' ¡Vencida!':hoy?' Hoy':''}</span>` : ''}
      </div>
    </div>
    <!-- Acciones -->
    <div style="display:flex;gap:2px;flex-shrink:0">
      ${!isCompleta ? `<select onchange="cambiarEstadoTarea(${t.id},this.value)" style="padding:2px 4px;border:1px solid var(--gris-200);border-radius:4px;font-size:10px;cursor:pointer;background:${est.bg};color:${est.color};font-weight:700;outline:none">
        ${Object.entries(TAREA_ESTADOS).map(([k,v])=>`<option value="${k}" ${k===t.estado?'selected':''}>${v.ico} ${v.label}</option>`).join('')}
      </select>` : ''}
      <button onclick="eliminarTareaObra(${t.id})" style="background:none;border:none;cursor:pointer;color:var(--gris-400);font-size:14px;padding:2px 4px" title="Eliminar">✕</button>
    </div>
  </div>`;
}

async function poblarSelectResponsables() {
  const sel = document.getElementById('obraTareaResp');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Sin asignar</option>';
  // Cargar todos los perfiles de la empresa
  try {
    const { data } = await sb.from('perfiles').select('id,nombre,apellidos').eq('empresa_id',EMPRESA.id);
    if (data && data.length) {
      data.forEach(u => {
        const nombre = ((u.nombre||'')+ ' '+(u.apellidos||'')).trim() || 'Sin nombre';
        sel.innerHTML += `<option value="${u.id}">${nombre}</option>`;
      });
    } else if (CP) {
      sel.innerHTML += `<option value="${CU?.id||''}">${CP.nombre||''} ${CP.apellidos||''}</option>`;
    }
  } catch(e) {
    if (CP) sel.innerHTML += `<option value="${CU?.id||''}">${CP.nombre||''} ${CP.apellidos||''}</option>`;
  }
  sel.value = current;
}

async function guardarTareaObra() {
  if (!obraActualId) return;
  const texto = document.getElementById('obraTareaTexto')?.value?.trim();
  if (!texto) { toast('Escribe la tarea','error'); return; }

  const prioridad = document.getElementById('obraTareaPrio')?.value || 'normal';
  const responsable_id = document.getElementById('obraTareaResp')?.value || null;
  const fecha_limite = document.getElementById('obraTareaFecha')?.value || null;

  // Buscar nombre del responsable desde el select
  let responsable_nombre = '';
  if (responsable_id) {
    const selResp = document.getElementById('obraTareaResp');
    if (selResp) {
      const opt = selResp.querySelector(`option[value="${responsable_id}"]`);
      if (opt) responsable_nombre = opt.textContent.trim();
    }
  }

  const payload = {
    empresa_id: EMPRESA.id,
    trabajo_id: obraActualId,
    texto,
    estado: 'pendiente',
    prioridad,
    responsable_id: responsable_id || null,
    responsable_nombre: responsable_nombre || null,
    fecha_limite: fecha_limite || null,
    creado_por: CU?.id || null,
    creado_por_nombre: CP ? (CP.nombre||'')+' '+(CP.apellidos||'') : null,
  };

  const { data, error } = await sb.from('tareas_obra').insert(payload).select().single();
  if (error) {
    // Si la tabla no existe, guardar en local temporalmente
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      const localTarea = { id: Date.now(), ...payload, created_at: new Date().toISOString() };
      obraTareasData.push(localTarea);
      toast('Tarea añadida (modo local) ✓','info');
    } else {
      toast('Error: '+error.message,'error'); return;
    }
  } else {
    obraTareasData.push(data);
    toast('Tarea añadida ✓','success');
  }
  await registrarActividadObra(obraActualId, 'Tarea añadida', `✅ ${texto} | Prioridad: ${prioridad}${responsable_nombre ? ' | Resp: '+responsable_nombre : ''}${fecha_limite ? ' | Límite: '+fecha_limite : ''}`);

  // Limpiar input
  document.getElementById('obraTareaTexto').value = '';
  document.getElementById('obraTareaFecha').value = '';
  updateTareasKpi();
  renderObraTareas();
}

function addTareaPlantilla(texto, prioridad) {
  // Verificar si ya existe
  if (obraTareasData.some(t => t.texto === texto)) {
    toast('Esa tarea ya existe','info'); return;
  }
  // Rellenar formulario sin guardar — el usuario ajusta fecha/responsable/prioridad y pulsa Añadir
  const inp = document.getElementById('obraTareaTexto');
  if (inp) { inp.value = texto; inp.focus(); inp.scrollIntoView({behavior:'smooth',block:'center'}); }
  document.getElementById('obraTareaPrio').value = prioridad;
  toast('Plantilla cargada — ajusta los campos y pulsa Añadir','info');
}

/* Cargar TODAS las plantillas de golpe (las que no existan aún) */
async function cargarTodasPlantillas() {
  if (!obraActualId) return;
  let count = 0;
  for (const p of TAREA_PLANTILLAS) {
    if (obraTareasData.some(t => t.texto === p.texto)) continue;
    const payload = {
      empresa_id: EMPRESA.id,
      trabajo_id: obraActualId,
      texto: p.texto,
      estado: 'pendiente',
      prioridad: p.prioridad,
      responsable_id: null,
      responsable_nombre: null,
      fecha_limite: null,
      creado_por: CU?.id || null,
      creado_por_nombre: CP ? (CP.nombre||'')+' '+(CP.apellidos||'') : null,
    };
    const { data, error } = await sb.from('tareas_obra').insert(payload).select().single();
    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        obraTareasData.push({ id: Date.now()+count, ...payload, created_at: new Date().toISOString() });
      }
    } else {
      obraTareasData.push(data);
    }
    count++;
  }
  if (count) {
    await registrarActividadObra(obraActualId, 'Plantillas de tareas cargadas', `📋 ${count} tarea(s) añadida(s) desde plantilla`);
    toast(`${count} tareas añadidas ✓`,'success');
    updateTareasKpi();
    renderObraTareas();
  } else {
    toast('Todas las plantillas ya existen','info');
  }
}

async function toggleTareaObra(id) {
  const tarea = obraTareasData.find(t => t.id === id);
  if (!tarea) return;
  const nuevoEstado = tarea.estado === 'completada' ? 'pendiente' : 'completada';

  const { error } = await sb.from('tareas_obra').update({ estado: nuevoEstado, completada_at: nuevoEstado === 'completada' ? new Date().toISOString() : null }).eq('id', id);
  if (error && !(error.code === '42P01' || error.message?.includes('does not exist'))) {
    toast('Error: '+error.message,'error'); return;
  }
  tarea.estado = nuevoEstado;
  tarea.completada_at = nuevoEstado === 'completada' ? new Date().toISOString() : null;
  await registrarActividadObra(obraActualId, nuevoEstado === 'completada' ? 'Tarea completada' : 'Tarea reabierta', `${nuevoEstado === 'completada' ? '✅' : '🔄'} ${tarea.texto}`);
  updateTareasKpi();
  renderObraTareas();
}

async function cambiarEstadoTarea(id, estado) {
  const tarea = obraTareasData.find(t => t.id === id);
  if (!tarea) return;

  const { error } = await sb.from('tareas_obra').update({ estado }).eq('id', id);
  if (error && !(error.code === '42P01' || error.message?.includes('does not exist'))) {
    toast('Error: '+error.message,'error'); return;
  }
  tarea.estado = estado;
  await registrarActividadObra(obraActualId, 'Estado tarea cambiado', `🔀 "${tarea.texto}" → ${estado}`);
  updateTareasKpi();
  renderObraTareas();
}

async function eliminarTareaObra(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  const tareaElim = obraTareasData.find(t => t.id === id);
  const { error } = await sb.from('tareas_obra').delete().eq('id', id);
  if (error && !(error.code === '42P01' || error.message?.includes('does not exist'))) {
    toast('Error: '+error.message,'error'); return;
  }
  obraTareasData = obraTareasData.filter(t => t.id !== id);
  await registrarActividadObra(obraActualId, 'Tarea eliminada', `🗑️ ${tareaElim?.texto || 'Tarea #'+id}`);
  updateTareasKpi();
  renderObraTareas();
  toast('Tarea eliminada','info');
}

function updateTareasKpi() {
  const el = document.getElementById('ok-tareas');
  if (el) {
    const completadas = obraTareasData.filter(t => t.estado === 'completada').length;
    const total = obraTareasData.length;
    el.textContent = total ? `${completadas}/${total}` : '0';
  }
}

// ═══════════════════════════════════════════════
// WORKFLOW / PANEL DE ESTADO DE LA OBRA
// ═══════════════════════════════════════════════

const WORKFLOW_ETAPAS = [
  { id:'presupuesto', ico:'📋', label:'Presupuesto', desc:'Crear presupuesto' },
  { id:'aprobado',    ico:'✅', label:'Aprobado',     desc:'Cliente acepta' },
  { id:'material',    ico:'📦', label:'Material',     desc:'Pedir material' },
  { id:'programado',  ico:'📅', label:'Programado',   desc:'Asignar fecha' },
  { id:'ejecucion',   ico:'🔨', label:'En ejecución', desc:'Trabajo en curso' },
  { id:'albaran',     ico:'📄', label:'Albarán',      desc:'Entregar albarán' },
  { id:'factura',     ico:'🧾', label:'Facturado',    desc:'Emitir factura' },
  { id:'cobrado',     ico:'💰', label:'Cobrado',      desc:'Cobro recibido' },
];

function detectarEtapasObra(t, presupData, albData, factData, partesData) {
  const etapas = {};

  // 1. Presupuesto — tiene al menos un presupuesto vinculado
  const tienePresup = presupData.length > 0;
  etapas.presupuesto = tienePresup;

  // 2. Aprobado — algún presupuesto aceptado/aprobado
  const presupAprobado = presupData.some(p =>
    ['aceptado','aprobado','accepted','en_curso'].includes((p.estado||'').toLowerCase())
  );
  etapas.aprobado = presupAprobado;

  // 3. Material — pendiente de desarrollar módulo de compras/pedidos
  //    Por ahora: se marca si la obra está en_curso o superior (implica material gestionado)
  etapas.material = presupAprobado && (t.estado === 'en_curso' || t.estado === 'finalizado' || t.estado === 'completado');

  // 4. Programado — tiene al menos un parte de trabajo o tarea con fecha programada
  //    La fecha de la obra NO cuenta (es la fecha de alta), necesitamos una cita real
  const tienePartesProgramados = partesData.length > 0;
  const tieneTareasProgramadas = (typeof obraTareasData !== 'undefined' && obraTareasData.length > 0);
  etapas.programado = tienePartesProgramados || tieneTareasProgramadas;

  // 5. En ejecución — tiene partes de trabajo reales o estado en_curso
  etapas.ejecucion = partesData.length > 0 || t.estado === 'en_curso';

  // 6. Albarán — tiene al menos un albarán
  etapas.albaran = albData.length > 0;

  // 7. Factura — tiene al menos una factura
  etapas.factura = factData.length > 0;

  // 8. Cobrado — tiene facturas y TODAS están cobradas
  const factCobradas = factData.length > 0 && factData.every(f =>
    ['cobrada','pagada','paid'].includes((f.estado||'').toLowerCase())
  );
  etapas.cobrado = factCobradas;

  return etapas;
}

function siguientePasoObra(etapas, t) {
  // Devuelve {texto, accion, botonLabel, icono} del siguiente paso lógico
  if (!etapas.presupuesto) return {
    texto: 'Esta obra no tiene presupuesto. Crea uno para empezar el flujo.',
    accion: 'nuevoPresupObraActual()', boton: '📋 Crear presupuesto', prioridad: 'alta'
  };
  if (!etapas.aprobado) return {
    texto: 'El presupuesto está pendiente de aprobación del cliente.',
    accion: null, boton: null, prioridad: 'media',
    tip: 'Cuando el cliente acepte, cambia el estado del presupuesto a "Aceptado"'
  };
  if (!etapas.programado) return {
    texto: 'Presupuesto aprobado. Crea un parte de trabajo para programar la ejecución.',
    accion: 'nuevoParteObraActual()', boton: '📝 Crear parte de trabajo', prioridad: 'alta'
  };
  if (!etapas.ejecucion) return {
    texto: 'Obra programada. Cuando empiece el trabajo, registra el avance en los partes.',
    accion: 'nuevoParteObraActual()', boton: '📝 Crear parte de trabajo', prioridad: 'media'
  };
  if (!etapas.albaran) return {
    texto: 'Trabajo en curso. Genera el albarán cuando termines.',
    accion: 'nuevoAlbaranObraActual()', boton: '📄 Crear albarán', prioridad: 'media'
  };
  if (!etapas.factura) return {
    texto: 'Albarán entregado. Emite la factura para cobrar.',
    accion: null, boton: null, prioridad: 'alta',
    tip: 'Ve a Facturas y crea una nueva factura desde el albarán'
  };
  if (!etapas.cobrado) return {
    texto: 'Factura emitida. Pendiente de cobro.',
    accion: null, boton: null, prioridad: 'baja',
    tip: 'Cuando el cliente pague, marca la factura como "Cobrada"'
  };
  return { texto: '¡Obra completada! Todos los pasos finalizados.', accion: null, boton: null, prioridad: 'ok' };
}

function renderObraWorkflow(t, presupData, albData, factData, partesData) {
  const etapas = detectarEtapasObra(t, presupData, albData, factData, partesData);
  const paso = siguientePasoObra(etapas, t);

  // Encontrar la etapa activa actual (la primera no completada)
  let etapaActiva = WORKFLOW_ETAPAS.length; // todas completas por defecto
  for (let i = 0; i < WORKFLOW_ETAPAS.length; i++) {
    if (!etapas[WORKFLOW_ETAPAS[i].id]) { etapaActiva = i; break; }
  }

  // Renderizar barra de progreso
  const barEl = document.getElementById('obraWorkflowBar');
  if (barEl) {
    barEl.innerHTML = WORKFLOW_ETAPAS.map((e, i) => {
      const completada = etapas[e.id];
      const activa = i === etapaActiva;
      const futura = i > etapaActiva;
      let bg, color, border, opacity;
      if (completada) {
        bg = 'linear-gradient(135deg, #ECFDF5, #D1FAE5)';
        color = '#059669';
        border = '2px solid #34D399';
        opacity = '1';
      } else if (activa) {
        bg = 'linear-gradient(135deg, #EFF6FF, #DBEAFE)';
        color = '#2563EB';
        border = '2px solid #60A5FA';
        opacity = '1';
      } else {
        bg = 'var(--gris-50)';
        color = 'var(--gris-400)';
        border = '1px solid var(--gris-200)';
        opacity = '0.6';
      }
      const checkOrNum = completada ? '<span style="font-size:10px">✔</span>' : (activa ? '►' : '');
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;background:${bg};color:${color};border-bottom:${border};opacity:${opacity};transition:all .3s;position:relative;min-width:0" title="${e.desc}">
        <div style="font-size:16px;line-height:1">${e.ico}</div>
        <div style="font-size:9.5px;font-weight:700;margin-top:2px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;padding:0 2px">${e.label}</div>
        <div style="position:absolute;top:3px;right:5px;font-size:8px;font-weight:800">${checkOrNum}</div>
      </div>`;
    }).join('');
  }

  // Renderizar acción siguiente
  const actEl = document.getElementById('obraWorkflowAction');
  if (actEl) {
    const prioColors = { alta: '#DC2626', media: '#D97706', baja: '#6B7280', ok: '#059669' };
    const prioLabels = { alta: 'URGENTE', media: 'PENDIENTE', baja: 'SEGUIMIENTO', ok: 'COMPLETADO' };
    const prioBg = { alta: '#FEF2F2', media: '#FFFBEB', baja: '#F9FAFB', ok: '#ECFDF5' };
    const pc = prioColors[paso.prioridad] || '#6B7280';
    const pl = prioLabels[paso.prioridad] || '';
    const pb = prioBg[paso.prioridad] || '#F9FAFB';

    let html = `<span style="background:${pb};color:${pc};padding:3px 8px;border-radius:6px;font-size:10px;font-weight:800;letter-spacing:.5px;white-space:nowrap">${pl}</span>`;
    html += `<span style="font-size:12.5px;color:var(--gris-700);flex:1">${paso.texto}</span>`;
    if (paso.tip) {
      html += `<span style="font-size:11px;color:var(--gris-400);font-style:italic">💡 ${paso.tip}</span>`;
    }
    if (paso.accion && paso.boton) {
      html += `<button class="btn btn-primary btn-sm" onclick="${paso.accion}" style="white-space:nowrap;font-size:11.5px">${paso.boton}</button>`;
    }
    actEl.innerHTML = html;
  }

  // Calcular progreso porcentual
  const completadas = WORKFLOW_ETAPAS.filter(e => etapas[e.id]).length;
  const porcent = Math.round((completadas / WORKFLOW_ETAPAS.length) * 100);
  return { etapas, paso, porcent, completadas };
}

// ═══════════════════════════════════════════════
// HELPER: dato ficha
// ═══════════════════════════════════════════════
function datoFichaObra(label, val) {
  if(!val||val==='—') return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;color:var(--gris-400)">—</span></div>`;
  // Si el valor es largo (>25 chars), mostrar en 2 líneas (label arriba, valor abajo)
  const valText = val.replace(/<[^>]*>/g, '');
  if (valText.length > 25) {
    return `<div style="padding:4px 0;border-bottom:1px solid var(--gris-100)"><div style="font-size:10px;color:var(--gris-400);text-transform:uppercase;letter-spacing:.3px">${label}</div><div style="font-size:11.5px;font-weight:600;margin-top:1px;overflow-wrap:break-word">${val}</div></div>`;
  }
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;font-weight:600">${val}</span></div>`;
}

// ═══════════════════════════════════════════════
// ACCIONES RÁPIDAS DESDE LA FICHA
// ═══════════════════════════════════════════════
function editarObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  document.getElementById('tr_titulo').value = t.titulo||'';
  // Buscador de cliente
  initTrCliBuscador();
  const cli = clientes.find(c=>c.id===t.cliente_id);
  document.getElementById('tr_cli_search').value = cli?.nombre || t.cliente_nombre || '';
  document.getElementById('tr_cli').value = t.cliente_id || '';
  const selDiv = document.getElementById('tr_cli_selected');
  if (selDiv && cli) {
    const info = [cli.direccion_fiscal||cli.direccion||'', cli.municipio_fiscal||cli.municipio||'', cli.telefono||''].filter(Boolean).join(' · ');
    selDiv.innerHTML = `${cli.nombre} ${info ? `<span style="color:var(--gris-400);font-weight:400">— ${info}</span>` : ''} <span onclick="trLimpiarCliente()" style="cursor:pointer;color:var(--rojo);margin-left:4px" title="Quitar cliente">✕</span>`;
    selDiv.style.display = 'block';
  }
  document.getElementById('tr_cat').value = t.categoria||'';
  document.getElementById('tr_prio').value = t.prioridad||'';
  document.getElementById('tr_fecha').value = t.fecha||'';
  document.getElementById('tr_hora').value = t.hora||'';
  document.getElementById('tr_desc').value = t.descripcion||'';
  document.getElementById('mTrabTit').textContent = 'Editar Obra';
  openModal('mTrabajo');
}

function nuevoPresupObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  // Abrir nuevo presupuesto vinculado al cliente y obra
  if (typeof abrirNuevoPresupuesto === 'function') {
    abrirNuevoPresupuesto();
    setTimeout(() => {
      // Vincular a la obra
      if (typeof deConfig !== 'undefined') deConfig.trabajo_id = obraActualId;
      // Auto-fill cliente
      const sel = document.getElementById('de_cliente');
      if (sel && t.cliente_id) {
        sel.value = t.cliente_id;
        if (typeof de_actualizarCliente === 'function') de_actualizarCliente(t.cliente_id);
      }
    }, 300);
  }
}

function nuevoAlbaranObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  if (typeof abrirNuevoAlbaran === 'function') {
    abrirNuevoAlbaran();
    setTimeout(() => {
      // Vincular a la obra
      if (typeof deConfig !== 'undefined') deConfig.trabajo_id = obraActualId;
      // Auto-fill cliente
      const sel = document.getElementById('de_cliente');
      if (sel && t.cliente_id) {
        sel.value = t.cliente_id;
        if (typeof de_actualizarCliente === 'function') de_actualizarCliente(t.cliente_id);
      }
    }, 300);
  }
}

function nuevoParteObraActual() {
  if (!obraActualId) return;
  if (typeof nuevoParteModal === 'function') {
    nuevoParteModal();
    setTimeout(() => {
      const sel = document.getElementById('pt_trabajo');
      if (sel) {
        sel.value = obraActualId;
        sel.dispatchEvent(new Event('change'));
      }
    }, 300);
  }
}

// ═══════════════════════════════════════════════
// CONVERSIONES DESDE FICHA DE OBRA (autónomas)
// ═══════════════════════════════════════════════

async function obraAprobarPres(presId) {
  if (!obraActualId) return;
  if (!confirm('¿Aprobar este presupuesto?')) return;
  const { error } = await sb.from('presupuestos').update({ estado: 'aceptado' }).eq('id', presId);
  if (error) { toast('Error: '+error.message,'error'); return; }
  const p = (typeof presupuestos !== 'undefined') ? presupuestos.find(x=>x.id===presId) : null;
  if (p) p.estado = 'aceptado';
  registrarAudit('cambiar_estado', 'presupuesto', presId, 'Aprobado desde ficha de obra'+(p?' — '+p.numero:''));
  toast('✅ Presupuesto aprobado','success');
  abrirFichaObra(obraActualId);
  if (typeof loadDashboard === 'function') loadDashboard();
}

async function obraPresToAlbaran(presId) {
  if (!obraActualId) return;
  const { data: p, error: err } = await sb.from('presupuestos').select('*').eq('id', presId).single();
  if (err || !p) { toast('Error al cargar presupuesto', 'error'); return; }
  // No permitir si es borrador
  if (p.estado === 'borrador' || (p.numero||'').startsWith('BORR-')) { toast('🔒 No se puede albaranar un borrador — guárdalo primero','error'); return; }
  // Comprobar si ya tiene albarán o factura
  const _aD3 = window.albaranesData || (typeof albaranesData!=='undefined' ? albaranesData : []);
  const _fD5 = window.facturasData || [];
  if (_aD3.some(a=>a.presupuesto_id===p.id)) { toast('🔒 Este presupuesto ya tiene albarán','error'); return; }
  if (_fD5.some(f=>f.presupuesto_id===p.id)) { toast('🔒 Este presupuesto ya tiene factura, no se puede albaranar','error'); return; }
  if (!confirm(`¿Crear albarán desde ${p.numero}?`)) return;

  const numero = await generarNumeroDoc('albaran');
  const lineas = (p.lineas || []).filter(l => l.tipo !== 'capitulo').map(l => ({
    desc: l.desc || '', cant: l.cant || 1, precio: l.precio || 0
  }));
  let total = 0; lineas.forEach(l => total += l.cant * l.precio);

  const { error } = await sb.from('albaranes').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
    fecha: new Date().toISOString().split('T')[0],
    referencia: p.titulo || null,
    total: Math.round(total * 100) / 100,
    estado: 'pendiente', observaciones: p.observaciones, lineas,
    presupuesto_id: p.id,
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await sb.from('presupuestos').update({ estado: 'aceptado' }).eq('id', presId);
  // Refrescar albaranes globales para que presupuestos detecte el nuevo
  const {data:_albR} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.albaranesData = _albR||[]; if (typeof albaranesData!=='undefined') albaranesData = _albR||[];
  await registrarActividadObra(obraActualId, 'Albarán creado', `📄 ${numero} desde presupuesto ${p.numero}`);
  toast('📄 Albarán creado', 'success');
  abrirFichaObra(obraActualId);
}

async function obraPresToFactura(presId) {
  if (!obraActualId) return;
  const { data: p, error: err } = await sb.from('presupuestos').select('*').eq('id', presId).single();
  if (err || !p) { toast('Error al cargar presupuesto', 'error'); return; }
  // No permitir si es borrador
  if (p.estado === 'borrador' || (p.numero||'').startsWith('BORR-')) { toast('🔒 No se puede facturar un borrador — guárdalo primero','error'); return; }
  // Comprobar si ya tiene factura
  const _fD2 = window.facturasData || [];
  const _aD4 = window.albaranesData || (typeof albaranesData!=='undefined' ? albaranesData : []);
  const _albsP2 = _aD4.filter(a=>a.presupuesto_id===p.id);
  if (_fD2.some(f=>f.presupuesto_id===p.id) || _albsP2.some(a=>_fD2.some(f=>f.albaran_id===a.id))) { toast('🔒 Este presupuesto ya tiene factura','error'); return; }
  if (!confirm(`¿Crear factura desde ${p.numero}?`)) return;

  const numero = await generarNumeroDoc('factura');
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);

  const { error } = await sb.from('facturas').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: p.base_imponible, total_iva: p.total_iva, total: p.total,
    estado: 'pendiente', observaciones: p.observaciones, lineas: p.lineas,
    presupuesto_id: p.id,
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await sb.from('presupuestos').update({ estado: 'aceptado' }).eq('id', presId);
  // Marcar albaranes del mismo presupuesto como facturados
  const _albsDelPres2 = _aD4.filter(a=>a.presupuesto_id===p.id);
  for (const alb of _albsDelPres2) {
    await sb.from('albaranes').update({estado:'facturado'}).eq('id',alb.id);
  }
  // Refrescar facturas y albaranes globales
  const {data:_fR2} = await sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.facturasData = _fR2||[];
  const {data:_aR2} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.albaranesData = _aR2||[]; if (typeof albaranesData!=='undefined') albaranesData = _aR2||[];
  await registrarActividadObra(obraActualId, 'Factura creada', `🧾 ${numero} desde presupuesto ${p.numero}`);
  toast('🧾 Factura creada', 'success');
  abrirFichaObra(obraActualId);
}

async function obraAlbToFactura(albId) {
  if (!obraActualId) return;
  const { data: a, error: err } = await sb.from('albaranes').select('*').eq('id', albId).single();
  if (err || !a) { toast('Error al cargar albarán', 'error'); return; }
  // Comprobar si ya tiene factura
  const _fD3 = window.facturasData || [];
  if (_fD3.some(f=>f.albaran_id===a.id)) { toast('🔒 Este albarán ya tiene factura','error'); return; }
  if (!confirm(`¿Crear factura desde ${a.numero}?`)) return;

  const numero = await generarNumeroDoc('factura');
  const hoy = new Date(); const v = new Date(); v.setDate(v.getDate() + 30);

  const { error } = await sb.from('facturas').insert({
    empresa_id: EMPRESA.id, numero,
    cliente_id: a.cliente_id, cliente_nombre: a.cliente_nombre,
    fecha: hoy.toISOString().split('T')[0],
    fecha_vencimiento: v.toISOString().split('T')[0],
    base_imponible: a.total || 0, total_iva: 0, total: a.total || 0,
    estado: 'pendiente', observaciones: a.observaciones,
    lineas: a.lineas, albaran_id: a.id,
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  await sb.from('albaranes').update({ estado: 'facturado' }).eq('id', albId);
  // Refrescar facturas y albaranes globales
  const {data:_fR3} = await sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.facturasData = _fR3||[];
  const {data:_aR3} = await sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  window.albaranesData = _aR3||[]; if (typeof albaranesData!=='undefined') albaranesData = _aR3||[];
  await registrarActividadObra(obraActualId, 'Factura creada', `🧾 ${numero} desde albarán ${a.numero}`);
  toast('🧾 Factura creada', 'success');
  abrirFichaObra(obraActualId);
}

async function obraFacturarTodosAlb() {
  if (!obraActualId) return;
  // Obtener todos los albaranes no facturados de esta obra
  const { data: albs } = await sb.from('albaranes').select('*').eq('empresa_id', EMPRESA.id).eq('trabajo_id', obraActualId).neq('estado', 'facturado').neq('estado', 'anulado').neq('estado', 'eliminado');
  if (!albs || albs.length < 1) { toast('No hay albaranes pendientes de facturar', 'info'); return; }

  // Verificar mismo cliente
  const clienteIds = new Set(albs.map(a => a.cliente_id));
  if (clienteIds.size > 1) { toast('Los albaranes tienen clientes distintos', 'error'); return; }

  const nums = albs.map(a => a.numero).join(', ');
  if (!confirm(`¿Crear una factura agrupando ${albs.length} albarán${albs.length > 1 ? 'es' : ''}?\n\n${nums}`)) return;

  // Combinar líneas
  let lineasTodas = [];
  let totalGlobal = 0;
  albs.forEach(a => {
    lineasTodas.push({ desc: `── ${a.numero} (${a.fecha || ''}) ──`, cant: 0, precio: 0, _separator: true });
    (a.lineas || []).forEach(l => {
      lineasTodas.push({ ...l });
      totalGlobal += (l.cant || 0) * (l.precio || 0);
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
    observaciones: `Factura agrupada obra: ${nums}`,
    lineas: lineasTodas,
    albaran_ids: albs.map(a => a.id),
    trabajo_id: obraActualId,
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  // Marcar todos como facturados
  for (const a of albs) {
    await sb.from('albaranes').update({ estado: 'facturado' }).eq('id', a.id);
  }
  await registrarActividadObra(obraActualId, 'Factura agrupada creada', `🧾 ${numero} agrupando ${albs.length} albarán(es): ${nums}`);
  toast(`✅ Factura ${numero} creada con ${albs.length} albarán${albs.length > 1 ? 'es' : ''}`, 'success');
  abrirFichaObra(obraActualId); // Refrescar
}

// ═══════════════════════════════════════════════
// NOTAS DE OBRA
// ═══════════════════════════════════════════════
async function guardarNotaObra() {
  if (!obraActualId) return;
  const texto = document.getElementById('obraNotaTexto').value.trim();
  if (!texto) { toast('Escribe el texto de la nota','error'); return; }
  const tipo = document.getElementById('obraNotaTipo').value;
  const { error } = await sb.from('notas_trabajo').insert({
    empresa_id: EMPRESA.id, trabajo_id: obraActualId,
    texto, tipo, creado_por: CU.id, creado_por_nombre: CP?.nombre||CU?.email||''
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  await registrarActividadObra(obraActualId, 'Nota añadida', `📝 ${tipo}: ${texto.substring(0,80)}${texto.length>80?'…':''}`);
  document.getElementById('obraNotaTexto').value = '';
  await abrirFichaObra(obraActualId);
  obraTab('notas');
  toast('Nota guardada ✓','success');
}

async function eliminarNotaObra(id) {
  if (!confirm('¿Eliminar nota?')) return;
  await sb.from('notas_trabajo').delete().eq('id', id);
  await registrarActividadObra(obraActualId, 'Nota eliminada', `🗑️ Nota #${id} eliminada`);
  await abrirFichaObra(obraActualId);
  obraTab('notas');
  toast('Nota eliminada','info');
}

// ═══════════════════════════════════════════════
// DOCUMENTOS DE OBRA
// ═══════════════════════════════════════════════
async function subirDocObra(input) {
  if (!obraActualId) return;
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10*1024*1024) { toast('Archivo demasiado grande (máx 10MB)','error'); return; }
  const nombre = document.getElementById('obraDocNombre')?.value.trim() || file.name;
  const tipo = document.getElementById('obraDocTipo')?.value || 'otro';
  const safeName = _sanitizeFileName(file.name);
  const path = `${EMPRESA.id}/obras/${obraActualId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file);
  if (upErr) { toast('Error subiendo: '+upErr.message,'error'); return; }
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
  const url = urlData?.publicUrl || '';
  const { error: dbErr } = await sb.from('documentos_trabajo').insert({
    empresa_id: EMPRESA.id, trabajo_id: obraActualId,
    nombre, tipo, url, path, tamanyo: file.size,
    creado_por: CU.id
  });
  if (dbErr) { toast('Error guardando registro: '+dbErr.message,'error'); return; }
  await registrarActividadObra(obraActualId, 'Documento subido', `📎 ${nombre} (${tipo})`);
  input.value = '';
  document.getElementById('obraDocNombre').value = '';
  await abrirFichaObra(obraActualId);
  obraTab('documentos');
  toast('Documento subido ✓','success');
}

async function eliminarDocObra(id) {
  if (!confirm('¿Eliminar documento?')) return;
  await sb.from('documentos_trabajo').delete().eq('id', id);
  await registrarActividadObra(obraActualId, 'Documento eliminado', `🗑️ Documento #${id} eliminado`);
  await abrirFichaObra(obraActualId);
  obraTab('documentos');
  toast('Documento eliminado','info');
}

async function eliminarAuditEntry(id) {
  if (!(CP?.rol === 'superadmin' || CP?.rol === 'admin')) { toast('Solo el superadmin puede eliminar registros','error'); return; }
  if (!confirm('¿Eliminar esta entrada del registro?')) return;
  await sb.from('audit_log').delete().eq('id', id);
  await abrirFichaObra(obraActualId);
  obraTab('registro');
  toast('Entrada eliminada del registro','info');
}

// Función helper para registrar actividad en una obra
async function registrarActividadObra(trabajoId, accion, detalle) {
  try {
    await sb.from('audit_log').insert({
      empresa_id: EMPRESA.id,
      entidad: 'trabajo',
      entidad_id: String(trabajoId),
      accion: accion,
      detalle: detalle || '',
      usuario_id: CU?.id || null,
      usuario_nombre: CP?.nombre || CU?.email || 'Sistema',
    });
  } catch(e) { /* silent */ }
}

// ═══════════════════════════════════════════════
// ADJUNTAR DOCS (modal creación)
// ═══════════════════════════════════════════════
function tr_addDocs(files) {
  Array.from(files).forEach(f => { if(!trDocsFiles.find(x=>x.name===f.name)) trDocsFiles.push(f); });
  tr_renderDocs();
}

function tr_dropDocs(e) {
  e.preventDefault();
  document.getElementById('tr_doc_zone').style.borderColor='var(--gris-300)';
  tr_addDocs(e.dataTransfer.files);
}

function tr_removeDoc(name) {
  trDocsFiles = trDocsFiles.filter(f=>f.name!==name);
  tr_renderDocs();
}

function tr_renderDocs() {
  const icons = {'pdf':'📄','doc':'📝','docx':'📝','jpg':'🖼️','jpeg':'🖼️','png':'🖼️','xlsx':'📊','xls':'📊'};
  document.getElementById('tr_doc_list').innerHTML = trDocsFiles.map(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    const ico = icons[ext]||'📎';
    const size = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : Math.round(f.size/1024)+'KB';
    return `<div style="display:flex;align-items:center;gap:5px;background:var(--gris-50);border:1px solid var(--gris-200);border-radius:6px;padding:4px 9px;font-size:12px">
      ${ico} <span>${f.name}</span> <span style="color:var(--gris-400)">${size}</span>
      <button onclick="tr_removeDoc('${f.name}')" style="background:none;border:none;cursor:pointer;color:var(--rojo);margin-left:3px;font-size:13px">✕</button>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
// CREAR / ELIMINAR OBRA
// ═══════════════════════════════════════════════
async function saveTrabajo() {
  const titulo=document.getElementById('tr_titulo').value.trim();
  if(!titulo){toast('Introduce el título','error');return;}
  const cliId=parseInt(document.getElementById('tr_cli').value)||null;
  if(!cliId){toast('Selecciona un cliente','error');return;}
  const cli=clientes.find(c=>c.id===cliId);
  const desc = document.getElementById('tr_desc').value.trim();
  if(desc.length < 10){toast('La descripción debe tener al menos 10 caracteres','error');return;}
  // Dirección se obtiene del cliente
  const dirCliente = cli ? [cli.direccion_fiscal||cli.direccion||'', cli.cp_fiscal||cli.cp||'', cli.municipio_fiscal||cli.municipio||'', cli.provincia_fiscal||cli.provincia||''].filter(Boolean).join(', ') : '';

  // Si estamos editando
  if (obraActualId && document.getElementById('mTrabTit').textContent === 'Editar Obra') {
    const { error } = await sb.from('trabajos').update({
      titulo,
      cliente_id: cliId, cliente_nombre: cli?.nombre||'',
      prioridad: v('tr_prio'), categoria: v('tr_cat'),
      fecha: v('tr_fecha'), hora: v('tr_hora'),
      direccion_obra_texto: dirCliente, descripcion: desc,
    }).eq('id', obraActualId);
    if (error) { toast('Error: '+error.message,'error'); return; }
    await registrarActividadObra(obraActualId, 'Obra editada', `Título: ${titulo} | Cliente: ${cli?.nombre||'—'} | Categoría: ${v('tr_cat')||'—'} | Prioridad: ${v('tr_prio')||'—'}`);
    closeModal('mTrabajo');
    document.getElementById('mTrabTit').textContent = 'Nueva Obra';
    const {data}=await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    trabajos=data||[];
    await abrirFichaObra(obraActualId);
    toast('Obra actualizada ✓','success');
    return;
  }

  const num=`TRB-${new Date().getFullYear()}-${String(trabajos.length+1).padStart(3,'0')}`;
  const {data:insertData,error}=await sb.from('trabajos').insert({
    empresa_id:EMPRESA.id,numero:num,titulo,
    cliente_id:cliId,cliente_nombre:cli?.nombre||'',
    prioridad:v('tr_prio'),categoria:v('tr_cat'),
    fecha:v('tr_fecha'),hora:v('tr_hora'),
    direccion_obra_texto:dirCliente,descripcion:desc,
    estado:'pendiente',operario_id:CU.id,operario_nombre:CP?.nombre||''
  }).select();
  if(error){toast('Error: '+error.message,'error');return;}

  // Subir documentos adjuntos si hay
  const newTrabajoId = insertData?.[0]?.id;
  if (newTrabajoId && trDocsFiles.length > 0) {
    for (const file of trDocsFiles) {
      const safeName = _sanitizeFileName(file.name);
      const path = `${EMPRESA.id}/obras/${newTrabajoId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await sb.storage.from('documentos').upload(path, file);
      if (upErr) { toast('Error subiendo '+file.name+': '+upErr.message,'error'); continue; }
      const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
      const url = urlData?.publicUrl || '';
      const ext = file.name.split('.').pop().toLowerCase();
      const tipo = ['jpg','jpeg','png','gif','bmp','webp'].includes(ext) ? 'foto'
        : ['pdf'].includes(ext) ? 'otro'
        : ['doc','docx'].includes(ext) ? 'contrato'
        : ['xlsx','xls'].includes(ext) ? 'otro' : 'otro';
      await sb.from('documentos_trabajo').insert({
        empresa_id: EMPRESA.id, trabajo_id: newTrabajoId,
        nombre: file.name, tipo, url, path, tamanyo: file.size,
        creado_por: CU.id
      });
    }
    trDocsFiles = [];
    document.getElementById('tr_doc_list').innerHTML = '';
  }

  // Registrar actividad
  if (newTrabajoId) {
    await registrarActividadObra(newTrabajoId, 'Obra creada', `${num} — ${titulo} | Cliente: ${cli?.nombre||'Sin cliente'}`);
    if (trDocsFiles.length > 0) {
      await registrarActividadObra(newTrabajoId, 'Documentos adjuntados', `${trDocsFiles.length} documento(s) al crear la obra`);
    }
  }
  closeModal('mTrabajo');
  const {data}=await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  trabajos=data||[]; renderTrabajos(); loadDashboard();
  toast(`Obra ${num} creada ✓`,'success');
}

async function delTrabajo(id) {
  if(!confirm('¿Eliminar obra?'))return;
  const obraElim = trabajos.find(t=>t.id===id);
  await registrarActividadObra(id, 'Obra eliminada', `🗑️ ${obraElim?.numero||''} — ${obraElim?.titulo||'Sin título'}`);
  await sb.from('trabajos').delete().eq('id',id);
  trabajos=trabajos.filter(t=>t.id!==id); renderTrabajos(); loadDashboard();
  toast('Eliminado','info');
}

// ═══════════════════════════════════════════════
// EXPORTAR OBRAS
// ═══════════════════════════════════════════════
function exportarObras() {
  const list = document.getElementById('trSearch')?.value || document.getElementById('trEstado')?.value ?
    trabajos.filter(t => {
      const q = (document.getElementById('trSearch')?.value||'').toLowerCase();
      const est = document.getElementById('trEstado')?.value||'';
      const des = document.getElementById('trDesde')?.value||'';
      const has = document.getElementById('trHasta')?.value||'';
      if (est && t.estado !== est) return false;
      if (q && !(t.numero||'').toLowerCase().includes(q) && !(t.titulo||'').toLowerCase().includes(q) && !(t.cliente_nombre||'').toLowerCase().includes(q)) return false;
      if (des && t.fecha && t.fecha < des) return false;
      if (has && t.fecha && t.fecha > has) return false;
      return true;
    }) : trabajos;
  if (!list.length) { toast('No hay datos para exportar','info'); return; }
  if (!confirm(`¿Exportar ${list.length} obra(s) a Excel?`)) return;
  const rows = list.map(t => ({
    'Número': t.numero,
    'Título': t.titulo,
    'Cliente': t.cliente_nombre,
    'Fecha': t.fecha,
    'Estado': t.estado,
    'Prioridad': t.prioridad,
    'Categoría': t.categoria,
    'Dirección': t.direccion_obra_texto,
    'Operario': t.operario_nombre,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Obras');
  XLSX.writeFile(wb, `obras_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Exportado ✓','success');
}

// ═══════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════
function prioBadge(p) {
  const m={Urgente:'<span class="badge bg-red">🔴</span>',Alta:'<span class="badge" style="background:#FFF4ED;color:var(--acento)">🟠</span>',Normal:'<span class="badge bg-gray">⚪</span>',Baja:'<span class="badge bg-gray">🔵</span>'};
  return m[p]||'';
}
