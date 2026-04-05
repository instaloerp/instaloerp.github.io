/**
 * MÓDULO MANTENIMIENTOS
 * Contratos de mantenimiento con periodicidad, checklists y generación de partes
 */

// ═══════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let mantenimientos = [];
let mtFiltrados = [];
let mantActualId = null;
let mtChecklistTemp = []; // checklist temporal para el modal

// ═══════════════════════════════════════════════
// CARGA Y RENDERIZADO
// ═══════════════════════════════════════════════
async function loadMantenimientos() {
  if (!EMPRESA || !EMPRESA.id) return;
  try {
    const {data} = await sb.from('mantenimientos').select('*').eq('empresa_id', EMPRESA.id).order('proxima_revision', {ascending:true});
    mantenimientos = data || [];
  } catch(e) { mantenimientos = []; console.warn('Tabla mantenimientos no encontrada — créala en Supabase'); }
  filtrarMantenimientos();
  actualizarKpisMant();
}

function filtrarMantenimientos() {
  const q = (document.getElementById('mtSearch')?.value||'').toLowerCase();
  const est = document.getElementById('mtEstado')?.value||'';
  const per = document.getElementById('mtPeriodo')?.value||'';
  mtFiltrados = mantenimientos.filter(m => {
    if (est && m.estado !== est) return false;
    if (per && m.periodicidad !== per) return false;
    if (q && !(m.numero||'').toLowerCase().includes(q)
         && !(m.cliente_nombre||'').toLowerCase().includes(q)
         && !(m.equipo||'').toLowerCase().includes(q)
         && !(m.direccion||'').toLowerCase().includes(q)) return false;
    return true;
  });
  renderMantenimientos(mtFiltrados);
}

function renderMantenimientos(list) {
  if (!list) list = mantenimientos;
  const hoy = new Date().toISOString().slice(0,10);
  const tb = document.getElementById('mtTable');
  if (!tb) return;
  tb.innerHTML = list.length ? list.map(m => {
    const vencido = m.proxima_revision && m.proxima_revision < hoy && m.estado === 'activo';
    const proximo = m.proxima_revision && !vencido && m.proxima_revision <= sumarDias(hoy, 15);
    return `<tr style="cursor:pointer" onclick="abrirFichaMant(${m.id})">
      <td style="font-family:monospace;font-size:11.5px;font-weight:700;color:var(--azul)">${m.numero||'—'}</td>
      <td style="font-weight:600">${m.cliente_nombre||'—'}</td>
      <td>${m.equipo||'—'}<br><span style="font-size:10.5px;color:var(--gris-400)">${m.categoria||''}</span></td>
      <td>${periodoBadge(m.periodicidad)}</td>
      <td style="font-weight:700;color:${vencido?'var(--rojo)':proximo?'var(--naranja)':'var(--gris-700)'}">${m.proxima_revision||'—'} ${vencido?'⚠️':proximo?'⏰':''}</td>
      <td>${estadoMantBadge(m.estado)}</td>
      <td><div style="display:flex;gap:4px" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="abrirFichaMant(${m.id})" title="Ver ficha">👁️</button>
        <button class="btn btn-ghost btn-sm" onclick="generarParteDesdeLista(${m.id})" title="Generar parte">📝</button>
        <button class="btn btn-ghost btn-sm" onclick="delMantenimiento(${m.id})" title="Eliminar">🗑️</button>
      </div></td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="7"><div class="empty"><div class="ei">🔧</div><h3>Sin mantenimientos</h3><p>Crea tu primer contrato de mantenimiento</p></div></td></tr>';
}

// ═══════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════
function actualizarKpisMant() {
  const hoy = new Date().toISOString().slice(0,10);
  const activos = mantenimientos.filter(m => m.estado === 'activo').length;
  const vencidos = mantenimientos.filter(m => m.estado === 'activo' && m.proxima_revision && m.proxima_revision < hoy).length;
  const proximos = mantenimientos.filter(m => m.estado === 'activo' && m.proxima_revision && m.proxima_revision >= hoy && m.proxima_revision <= sumarDias(hoy, 15)).length;
  const el = id => document.getElementById(id);
  if (el('mtKpiActivos')) el('mtKpiActivos').textContent = activos;
  if (el('mtKpiVencidos')) el('mtKpiVencidos').textContent = vencidos;
  if (el('mtKpiProximos')) el('mtKpiProximos').textContent = proximos;
  if (el('mtKpiTotal')) el('mtKpiTotal').textContent = mantenimientos.length;
}

// ═══════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════
function estadoMantBadge(e) {
  const m = {
    activo: '<span class="badge bg-green">✅ Activo</span>',
    pendiente: '<span class="badge bg-yellow">⏳ Pendiente</span>',
    vencido: '<span class="badge bg-red">⚠️ Vencido</span>',
    cancelado: '<span class="badge bg-gray">🚫 Cancelado</span>'
  };
  return m[e] || `<span class="badge bg-gray">${e||'—'}</span>`;
}

function periodoBadge(p) {
  const m = {
    mensual: '<span class="badge" style="background:#E8F4FD;color:var(--azul)">Mensual</span>',
    trimestral: '<span class="badge" style="background:#FFF4ED;color:var(--acento)">Trimestral</span>',
    semestral: '<span class="badge" style="background:#F0FDF4;color:var(--verde)">Semestral</span>',
    anual: '<span class="badge" style="background:#F3E8FF;color:var(--violeta)">Anual</span>'
  };
  return m[p] || `<span class="badge bg-gray">${p||'—'}</span>`;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0,10);
}

function calcProximaRevision(desde, periodicidad) {
  const d = new Date(desde);
  switch(periodicidad) {
    case 'mensual': d.setMonth(d.getMonth()+1); break;
    case 'trimestral': d.setMonth(d.getMonth()+3); break;
    case 'semestral': d.setMonth(d.getMonth()+6); break;
    case 'anual': d.setFullYear(d.getFullYear()+1); break;
  }
  return d.toISOString().slice(0,10);
}

function datoFichaMant(label, val) {
  if(!val||val==='—') return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;color:var(--gris-400)">—</span></div>`;
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;font-weight:600">${val}</span></div>`;
}

// ═══════════════════════════════════════════════
// VISTA FICHA / LISTA
// ═══════════════════════════════════════════════
function setMantVista(vista) {
  const vl = document.getElementById('mtVista-lista');
  const vf = document.getElementById('mtVista-ficha');
  if (vl) vl.style.display = vista === 'lista' ? 'block' : 'none';
  if (vf) vf.style.display = vista === 'ficha' ? 'block' : 'none';
}

function cerrarFichaMant() {
  mantActualId = null;
  setMantVista('lista');
  document.getElementById('pgTitle').textContent = 'Mantenimientos';
  document.getElementById('pgSub').textContent = _fechaHoraActual();
}

// ═══════════════════════════════════════════════
// ABRIR FICHA DE MANTENIMIENTO
// ═══════════════════════════════════════════════
async function abrirFichaMant(id) {
  mantActualId = id;
  const m = mantenimientos.find(x=>x.id===id);
  if (!m) { toast('Mantenimiento no encontrado','error'); return; }

  if (!document.getElementById('page-mantenimientos')?.classList.contains('active')) {
    goPage('mantenimientos');
  }
  setMantVista('ficha');

  // Cabecera
  document.getElementById('fichaMantTitulo').textContent = m.equipo || 'Mantenimiento';
  document.getElementById('pgTitle').textContent = m.numero || 'Mantenimiento';
  document.getElementById('pgSub').textContent = _fechaHoraActual();
  document.getElementById('fichaMantSub').textContent = [m.numero, m.categoria||'', m.cliente_nombre||'', periodoBadgeText(m.periodicidad)].filter(Boolean).join(' · ');
  document.getElementById('fichaMantEstado').innerHTML = estadoMantBadge(m.estado);

  // Datos del contrato
  document.getElementById('fichaMantDatos').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaMant('Número', m.numero)}
      ${datoFichaMant('Equipo', m.equipo)}
      ${datoFichaMant('Categoría', m.categoria||'—')}
      ${datoFichaMant('Periodicidad', periodoBadgeText(m.periodicidad))}
      ${datoFichaMant('Estado', m.estado)}
      ${datoFichaMant('Inicio contrato', m.fecha_inicio||'—')}
      ${datoFichaMant('Fin contrato', m.fecha_fin||'—')}
      ${datoFichaMant('Próxima revisión', m.proxima_revision||'—')}
      ${datoFichaMant('Importe', m.importe ? fmtE(m.importe) : '—')}
      ${datoFichaMant('Dirección', m.direccion||'—')}
      ${m.observaciones?`<div style="margin-top:6px;padding:8px;background:var(--gris-50);border-radius:7px;font-size:11.5px;color:var(--gris-600);line-height:1.5">${m.observaciones}</div>`:''}
    </div>`;

  // Cliente
  const cli = m.cliente_id ? clientes.find(c=>c.id===m.cliente_id) : null;
  document.getElementById('fichaMantCliente').innerHTML = cli ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer" onclick="abrirFicha(${cli.id})">
      <div class="av av-sm" style="background:${avC(cli.nombre)};width:30px;height:30px;font-size:11px">${ini(cli.nombre)}</div>
      <div>
        <div style="font-weight:700;font-size:12.5px;color:var(--azul)">${cli.nombre}</div>
        <div style="font-size:10.5px;color:var(--gris-400)">${cli.telefono||cli.movil||''}</div>
      </div>
    </div>
  ` : '<div style="color:var(--gris-400);font-size:12px;padding:8px 0">Sin cliente asignado</div>';

  // Cargar datos paralelos (con protección si tabla no existe aún)
  const safeQ = (q) => q.then(r=>r).catch(()=>({data:[]}));
  const [revisiones, partes, docs, notas] = await Promise.all([
    safeQ(sb.from('revisiones_mantenimiento').select('*').eq('mantenimiento_id',id).order('fecha',{ascending:false})),
    safeQ(sb.from('partes_trabajo').select('*').eq('mantenimiento_id',id).order('fecha',{ascending:false})),
    safeQ(sb.from('documentos_mantenimiento').select('*').eq('mantenimiento_id',id).order('created_at',{ascending:false})),
    safeQ(sb.from('notas_mantenimiento').select('*').eq('mantenimiento_id',id).order('created_at',{ascending:false})),
  ]);

  const revData = revisiones.data||[];
  const partesData = partes.data||[];
  const docsData = docs.data||[];
  const notasData = notas.data||[];
  const checklist = m.checklist || [];

  // KPIs
  document.getElementById('mk-revisiones').textContent = revData.length;
  document.getElementById('mk-checklist').textContent = checklist.length;
  document.getElementById('mk-partes').textContent = partesData.length;
  document.getElementById('mk-documentos').textContent = docsData.length;
  document.getElementById('mk-notas').textContent = notasData.length;

  // Resumen
  const horasPartes = partesData.reduce((s,p)=>s+(parseFloat(p.horas)||0),0);
  const revRealizadas = revData.filter(r=>r.estado==='realizada').length;
  document.getElementById('fichaMantResumen').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaMant('Revisiones realizadas', revRealizadas+' / '+revData.length)}
      ${datoFichaMant('Partes generados', partesData.length+'')}
      ${datoFichaMant('Horas totales', horasPartes.toFixed(1)+' h')}
      ${datoFichaMant('Tareas checklist', checklist.length+'')}
    </div>`;

  // ── REVISIONES ──
  const hoy = new Date().toISOString().slice(0,10);
  document.getElementById('mant-hist-revisiones').innerHTML = revData.length ?
    revData.map(r => {
      const vencida = r.fecha_prevista && r.fecha_prevista < hoy && r.estado !== 'realizada';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <div>
          <div style="font-weight:700;font-size:12.5px">${r.fecha_prevista||'—'} ${vencida?'<span style="color:var(--rojo)">⚠️ Vencida</span>':''}</div>
          <div style="font-size:10.5px;color:var(--gris-400)">${r.operario_nombre||'—'} · ${r.observaciones||'Sin observaciones'}</div>
        </div>
        <div>${r.estado==='realizada'?'<span class="badge bg-green">✅ Realizada</span>':'<span class="badge bg-yellow">⏳ Pendiente</span>'}</div>
      </div>`;
    }).join('') :
    `<div class="empty" style="padding:30px 0"><div class="ei">📅</div><p>Sin revisiones registradas</p>
      <button class="btn btn-primary btn-sm" onclick="crearRevisionMant()" style="margin-top:10px">+ Programar revisión</button>
    </div>`;

  // ── CHECKLIST (plantilla) ──
  document.getElementById('mant-hist-checklist').innerHTML = checklist.length ?
    `<div style="margin-bottom:12px;font-size:11.5px;color:var(--gris-400)">Esta plantilla se carga automáticamente en los partes de trabajo generados desde este mantenimiento.</div>` +
    checklist.map((item, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100)">
        <span style="font-size:14px;color:var(--azul)">☐</span>
        <span style="flex:1;font-size:12.5px">${typeof item === 'string' ? item : item.texto||item}</span>
        <span style="font-size:11px;color:var(--gris-400);background:var(--gris-50);padding:2px 8px;border-radius:4px">${i+1}</span>
      </div>`).join('') +
    `<div style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="editarChecklistMant()">✏️ Editar checklist</button></div>` :
    `<div class="empty" style="padding:30px 0"><div class="ei">✅</div><p>Sin checklist definido</p>
      <button class="btn btn-primary btn-sm" onclick="editarChecklistMant()" style="margin-top:10px">+ Crear checklist</button>
    </div>`;

  // ── PARTES ──
  document.getElementById('mant-hist-partes').innerHTML = partesData.length ?
    partesData.map(p => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100)">
        <div>
          <div style="font-weight:700;font-size:12.5px">${p.numero||'—'}</div>
          <div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.operario_nombre||'—'} · ${parseFloat(p.horas||0).toFixed(1)}h</div>
        </div>
        <div style="font-weight:700;font-size:12.5px">${fmtE(p.coste_total||0)}</div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📝</div><p>Sin partes generados</p></div>';

  // ── DOCUMENTOS ──
  const TIPO_ICO = {foto:'📷',certificado:'📜',contrato:'📋',manual:'📖',garantia:'🛡️',otro:'📄'};
  document.getElementById('mant-hist-documentos').innerHTML = `
    <div>
      <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
        <select id="mantDocTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
          <option value="certificado">📜 Certificado</option><option value="contrato">📋 Contrato</option><option value="foto">📷 Foto</option>
          <option value="manual">📖 Manual</option><option value="garantia">🛡️ Garantía</option><option value="otro">📄 Otro</option>
        </select>
        <input id="mantDocNombre" placeholder="Nombre..." style="flex:1;min-width:120px;padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <label class="btn btn-primary btn-sm" for="mantDocFile" style="cursor:pointer;font-size:11px">📎 Subir</label>
        <input type="file" id="mantDocFile" style="display:none" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" onchange="subirDocMant(this)">
      </div>
      ${docsData.length ? docsData.map(d => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100)">
          <span style="font-size:18px">${TIPO_ICO[d.tipo]||'📄'}</span>
          <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px">${d.nombre}</div><div style="font-size:10.5px;color:var(--gris-400)">${d.tipo} · ${new Date(d.created_at).toLocaleDateString('es-ES')}</div></div>
          <a href="${d.url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:10.5px;padding:3px 7px">👁️</a>
          <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="eliminarDocMant(${d.id})">🗑️</button>
        </div>`).join('') :
        '<div style="color:var(--gris-400);font-size:12.5px;padding:14px 0;text-align:center">Sin documentos</div>'
      }
    </div>`;

  // ── NOTAS ──
  const NOTA_ICO = {nota:'📝',llamada:'📞',incidencia:'⚠️',material:'📦'};
  const notaForm = `
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:end">
      <select id="mantNotaTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <option value="nota">📝 Nota</option><option value="llamada">📞 Llamada</option><option value="incidencia">⚠️ Incidencia</option><option value="material">📦 Material</option>
      </select>
      <input id="mantNotaTexto" placeholder="Escribe una nota..." style="flex:1;min-width:200px;padding:6px 9px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:12px;outline:none">
      <button class="btn btn-primary btn-sm" style="font-size:11.5px" onclick="guardarNotaMant()">💾 Guardar</button>
    </div>`;
  const notaList = notasData.length ?
    notasData.map(n => `
      <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <span style="font-size:16px;flex-shrink:0">${NOTA_ICO[n.tipo]||'📝'}</span>
        <div style="flex:1"><div style="font-size:12.5px;line-height:1.5">${n.texto}</div><div style="font-size:10.5px;color:var(--gris-400);margin-top:3px">${n.creado_por_nombre||'—'} · ${new Date(n.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>
        <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="eliminarNotaMant(${n.id})">🗑️</button>
      </div>`).join('') :
    '<div style="color:var(--gris-400);font-size:12.5px;padding:14px 0;text-align:center">Sin notas</div>';
  document.getElementById('mant-hist-notas').innerHTML = notaForm + notaList;

  mantTab('revisiones');
}

function periodoBadgeText(p) {
  return {mensual:'Mensual',trimestral:'Trimestral',semestral:'Semestral',anual:'Anual'}[p]||p||'';
}

// ═══════════════════════════════════════════════
// PESTAÑAS
// ═══════════════════════════════════════════════
const MANT_TAB_TITLES = {revisiones:'📅 Revisiones',checklist:'✅ Checklist',partes:'📝 Partes de trabajo',documentos:'📎 Documentos',notas:'💬 Notas'};

function mantTab(tab) {
  ['revisiones','checklist','partes','documentos','notas'].forEach(t => {
    const el = document.getElementById('mant-hist-'+t);
    if (el) el.style.display = t===tab?'block':'none';
    const kpi = document.getElementById('mkpi-'+t);
    if (kpi) kpi.classList.toggle('ficha-kpi-active', t===tab);
  });
  const titulo = document.getElementById('fichaMantHistTitulo');
  if (titulo) titulo.textContent = MANT_TAB_TITLES[tab] || tab;
}

// ═══════════════════════════════════════════════
// CHECKLIST DEL MODAL (crear/editar)
// ═══════════════════════════════════════════════
function addMantCheckItem() {
  const input = document.getElementById('mt_checklist_new');
  const texto = input.value.trim();
  if (!texto) return;
  mtChecklistTemp.push(texto);
  input.value = '';
  renderMtChecklistModal();
}

function removeMtCheckItem(idx) {
  mtChecklistTemp.splice(idx, 1);
  renderMtChecklistModal();
}

function renderMtChecklistModal() {
  document.getElementById('mt_checklist_items').innerHTML = mtChecklistTemp.map((item, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--gris-50);border:1px solid var(--gris-200);border-radius:6px">
      <span style="font-size:12px;color:var(--azul)">☐</span>
      <span style="flex:1;font-size:12px">${item}</span>
      <button onclick="removeMtCheckItem(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:13px">✕</button>
    </div>`).join('');
}

// ═══════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════
let mtEditId = null;

function nuevoMantenimiento() {
  mtEditId = null;
  mtChecklistTemp = [];
  document.getElementById('mMantTit').textContent = 'Nuevo Mantenimiento';
  document.getElementById('mt_equipo').value = '';
  document.getElementById('mt_periodo').value = 'anual';
  document.getElementById('mt_fecha_inicio').value = new Date().toISOString().slice(0,10);
  document.getElementById('mt_fecha_fin').value = '';
  document.getElementById('mt_proxima').value = '';
  document.getElementById('mt_importe').value = '0';
  document.getElementById('mt_direccion').value = '';
  document.getElementById('mt_obs').value = '';
  document.getElementById('mt_cat').value = 'Caldera';
  // Poblar select clientes
  const sel = document.getElementById('mt_cli');
  if (sel) {
    sel.innerHTML = '<option value="">— Seleccionar —</option>';
    clientes.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre; sel.appendChild(o); });
  }
  renderMtChecklistModal();
  openModal('mMantenimiento');
}

function editarMantActual() {
  if (!mantActualId) return;
  const m = mantenimientos.find(x=>x.id===mantActualId);
  if (!m) return;
  mtEditId = m.id;
  mtChecklistTemp = Array.isArray(m.checklist) ? [...m.checklist] : [];
  document.getElementById('mMantTit').textContent = 'Editar Mantenimiento';
  document.getElementById('mt_equipo').value = m.equipo||'';
  document.getElementById('mt_periodo').value = m.periodicidad||'anual';
  document.getElementById('mt_fecha_inicio').value = m.fecha_inicio||'';
  document.getElementById('mt_fecha_fin').value = m.fecha_fin||'';
  document.getElementById('mt_proxima').value = m.proxima_revision||'';
  document.getElementById('mt_importe').value = m.importe||0;
  document.getElementById('mt_direccion').value = m.direccion||'';
  document.getElementById('mt_obs').value = m.observaciones||'';
  document.getElementById('mt_cat').value = m.categoria||'Caldera';
  const sel = document.getElementById('mt_cli');
  if (sel) {
    sel.innerHTML = '<option value="">— Seleccionar —</option>';
    clientes.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre; sel.appendChild(o); });
    if (m.cliente_id) sel.value = m.cliente_id;
  }
  renderMtChecklistModal();
  openModal('mMantenimiento');
}

function editarChecklistMant() {
  if (!mantActualId) return;
  const m = mantenimientos.find(x=>x.id===mantActualId);
  if (!m) return;
  editarMantActual();
  // Focus en la sección de checklist tras abrir el modal
  setTimeout(() => document.getElementById('mt_checklist_new')?.focus(), 300);
}

async function saveMantenimiento() {
  const equipo = document.getElementById('mt_equipo').value.trim();
  if (!equipo) { toast('Indica el equipo o instalación','error'); return; }
  const cliId = parseInt(document.getElementById('mt_cli').value) || null;
  const cli = clientes.find(c=>c.id===cliId);
  const periodicidad = document.getElementById('mt_periodo').value;
  const proxima = document.getElementById('mt_proxima').value ||
    calcProximaRevision(document.getElementById('mt_fecha_inicio').value || new Date().toISOString().slice(0,10), periodicidad);

  const obj = {
    empresa_id: EMPRESA.id,
    equipo,
    cliente_id: cliId, cliente_nombre: cli?.nombre||'',
    categoria: document.getElementById('mt_cat').value,
    periodicidad,
    fecha_inicio: document.getElementById('mt_fecha_inicio').value || null,
    fecha_fin: document.getElementById('mt_fecha_fin').value || null,
    proxima_revision: proxima,
    importe: parseFloat(document.getElementById('mt_importe').value)||0,
    direccion: document.getElementById('mt_direccion').value.trim() || null,
    observaciones: document.getElementById('mt_obs').value.trim() || null,
    checklist: mtChecklistTemp,
  };

  if (mtEditId) {
    const { error } = await sb.from('mantenimientos').update(obj).eq('id', mtEditId);
    if (error) { toast('Error: '+error.message,'error'); return; }
    closeModal('mMantenimiento');
    await loadMantenimientos();
    await abrirFichaMant(mtEditId);
    toast('Mantenimiento actualizado ✓','success');
  } else {
    const num = `MNT-${new Date().getFullYear()}-${String(mantenimientos.length+1).padStart(3,'0')}`;
    obj.numero = num;
    obj.estado = 'activo';
    const { error } = await sb.from('mantenimientos').insert(obj);
    if (error) { toast('Error: '+error.message,'error'); return; }
    closeModal('mMantenimiento');
    await loadMantenimientos();
    toast(`Mantenimiento ${num} creado ✓`,'success');
  }
}

async function delMantenimiento(id) {
  if (!confirm('¿Eliminar mantenimiento?')) return;
  await sb.from('mantenimientos').delete().eq('id', id);
  mantenimientos = mantenimientos.filter(m=>m.id!==id);
  filtrarMantenimientos();
  actualizarKpisMant();
  toast('Eliminado','info');
}

// ═══════════════════════════════════════════════
// GENERAR PARTE DE TRABAJO DESDE MANTENIMIENTO
// ═══════════════════════════════════════════════
async function generarParteMant() {
  if (!mantActualId) return;
  generarParteDesdeLista(mantActualId);
}

async function generarParteDesdeLista(mantId) {
  const m = mantenimientos.find(x=>x.id===mantId);
  if (!m) return;
  if (!confirm(`¿Generar parte de trabajo para "${m.equipo}"?\nSe cargará el checklist con ${(m.checklist||[]).length} tareas.`)) return;

  // Crear parte de trabajo vinculado al mantenimiento
  const numParte = `PRT-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`;
  const checklistParaParte = (m.checklist||[]).map(item => ({
    texto: typeof item === 'string' ? item : item.texto||item,
    completado: false
  }));

  const { error } = await sb.from('partes_trabajo').insert({
    empresa_id: EMPRESA.id,
    numero: numParte,
    mantenimiento_id: mantId,
    cliente_id: m.cliente_id,
    cliente_nombre: m.cliente_nombre,
    fecha: new Date().toISOString().slice(0,10),
    descripcion: `Mantenimiento ${m.periodicidad}: ${m.equipo}`,
    checklist: checklistParaParte,
    estado: 'pendiente',
    operario_id: CU.id,
    operario_nombre: CP?.nombre||'',
  });
  if (error) { toast('Error: '+error.message,'error'); return; }

  // Actualizar próxima revisión
  const nuevaProxima = calcProximaRevision(new Date().toISOString().slice(0,10), m.periodicidad);
  await sb.from('mantenimientos').update({proxima_revision: nuevaProxima}).eq('id', mantId);
  m.proxima_revision = nuevaProxima;

  // Registrar revisión
  await sb.from('revisiones_mantenimiento').insert({
    empresa_id: EMPRESA.id,
    mantenimiento_id: mantId,
    fecha_prevista: new Date().toISOString().slice(0,10),
    estado: 'realizada',
    operario_nombre: CP?.nombre||'',
    operario_id: CU.id,
    parte_id: null,
    observaciones: 'Parte generado: ' + numParte
  });

  await loadMantenimientos();
  if (mantActualId === mantId) await abrirFichaMant(mantId);
  toast(`Parte ${numParte} generado con checklist ✓`, 'success');
}

async function crearRevisionMant() {
  if (!mantActualId) return;
  const m = mantenimientos.find(x=>x.id===mantActualId);
  if (!m) return;
  const fecha = m.proxima_revision || new Date().toISOString().slice(0,10);
  await sb.from('revisiones_mantenimiento').insert({
    empresa_id: EMPRESA.id,
    mantenimiento_id: mantActualId,
    fecha_prevista: fecha,
    estado: 'pendiente',
    operario_nombre: '',
    operario_id: null,
  });
  await abrirFichaMant(mantActualId);
  mantTab('revisiones');
  toast('Revisión programada ✓','success');
}

// ═══════════════════════════════════════════════
// NOTAS DE MANTENIMIENTO
// ═══════════════════════════════════════════════
async function guardarNotaMant() {
  if (!mantActualId) return;
  const texto = document.getElementById('mantNotaTexto').value.trim();
  if (!texto) { toast('Escribe el texto','error'); return; }
  const tipo = document.getElementById('mantNotaTipo').value;
  await sb.from('notas_mantenimiento').insert({
    empresa_id: EMPRESA.id, mantenimiento_id: mantActualId,
    texto, tipo, creado_por: CU.id, creado_por_nombre: CP?.nombre||CU?.email||''
  });
  document.getElementById('mantNotaTexto').value = '';
  await abrirFichaMant(mantActualId);
  mantTab('notas');
  toast('Nota guardada ✓','success');
}

async function eliminarNotaMant(id) {
  if (!confirm('¿Eliminar nota?')) return;
  await sb.from('notas_mantenimiento').delete().eq('id', id);
  await abrirFichaMant(mantActualId);
  mantTab('notas');
  toast('Eliminada','info');
}

// ═══════════════════════════════════════════════
// DOCUMENTOS DE MANTENIMIENTO
// ═══════════════════════════════════════════════
async function subirDocMant(input) {
  if (!mantActualId) return;
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10*1024*1024) { toast('Máx 10MB','error'); return; }
  const nombre = document.getElementById('mantDocNombre')?.value.trim() || file.name;
  const tipo = document.getElementById('mantDocTipo')?.value || 'otro';
  const path = `${EMPRESA.id}/mantenimientos/${mantActualId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file);
  if (upErr) { toast('Error: '+upErr.message,'error'); return; }
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
  await sb.from('documentos_mantenimiento').insert({
    empresa_id: EMPRESA.id, mantenimiento_id: mantActualId,
    nombre, tipo, url: urlData?.publicUrl||'', path, tamaño: file.size,
    creado_por: CU.id
  });
  input.value = '';
  if (document.getElementById('mantDocNombre')) document.getElementById('mantDocNombre').value = '';
  await abrirFichaMant(mantActualId);
  mantTab('documentos');
  toast('Documento subido ✓','success');
}

async function eliminarDocMant(id) {
  if (!confirm('¿Eliminar documento?')) return;
  await sb.from('documentos_mantenimiento').delete().eq('id', id);
  await abrirFichaMant(mantActualId);
  mantTab('documentos');
  toast('Eliminado','info');
}

// ═══════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════
function exportarMantenimientos() {
  const data = mtFiltrados.length ? mtFiltrados : mantenimientos;
  if (!data.length) { toast('No hay datos','info'); return; }
  if (!confirm(`¿Exportar ${data.length} mantenimiento(s) a Excel?`)) return;
  const rows = data.map(m => ({
    'Número': m.numero,
    'Cliente': m.cliente_nombre,
    'Equipo': m.equipo,
    'Categoría': m.categoria,
    'Periodicidad': m.periodicidad,
    'Estado': m.estado,
    'Próxima revisión': m.proxima_revision,
    'Importe': parseFloat(m.importe||0),
    'Dirección': m.direccion,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mantenimientos');
  XLSX.writeFile(wb, `mantenimientos_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Exportado ✓','success');
}
