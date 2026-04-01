// ═══════════════════════════════════════════════
// Works/Jobs management - Trabajos/Obras
// ═══════════════════════════════════════════════

// Docs attached to work
let trDocsFiles = [];
let obraActualId = null;

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
  renderTrabajos(filtered);
}

function renderTrabajos(list) {
  if (!list) list = trabajos;
  document.getElementById('trabTable').innerHTML = list.length ?
    list.map(t=>`<tr style="cursor:pointer" onclick="abrirFichaObra(${t.id})">
      <td style="font-family:monospace;font-size:11.5px;font-weight:700;color:var(--azul)">${t.numero}</td>
      <td style="font-weight:700">${t.titulo}</td>
      <td>${t.cliente_nombre||'—'}</td>
      <td style="font-size:11.5px">${t.fecha||'—'}</td>
      <td>${estadoBadge(t.estado)}</td>
      <td>${prioBadge(t.prioridad)}</td>
      <td><div style="display:flex;gap:4px" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="abrirFichaObra(${t.id})" title="Ver ficha">👁️</button>
        <button class="btn btn-ghost btn-sm" onclick="delTrabajo(${t.id})" title="Eliminar">🗑️</button>
      </div></td>
    </tr>`).join('') :
    '<tr><td colspan="7"><div class="empty"><div class="ei">🏗️</div><h3>Sin obras</h3></div></td></tr>';
}

// ═══════════════════════════════════════════════
// VISTA FICHA / LISTA
// ═══════════════════════════════════════════════
function setObraVista(vista) {
  const vl = document.getElementById('trVista-lista');
  const vf = document.getElementById('trVista-ficha');
  if (vl) vl.style.display = vista === 'lista' ? 'block' : 'none';
  if (vf) vf.style.display = vista === 'ficha' ? 'block' : 'none';
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

  // Cabecera
  document.getElementById('fichaObraTitulo').textContent = t.titulo;
  document.getElementById('pgTitle').textContent = t.numero;
  document.getElementById('pgSub').textContent = t.titulo;
  document.getElementById('fichaObraSub').textContent = [t.numero, t.categoria||'', t.cliente_nombre||''].filter(Boolean).join(' · ');
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
    ${datoFichaObra('Email', cli.email||'—')}
    ${datoFichaObra('Teléfono', cli.telefono||'—')}
    ${datoFichaObra('Municipio', cli.municipio_fiscal||'—')}
  ` : '<div style="color:var(--gris-400);font-size:12px;padding:8px 0">Sin cliente asignado</div>';

  // ── Cargar datos relacionados en paralelo (con protección si tabla no existe) ──
  const safeQuery = (q) => q.then(r=>r).catch(()=>({data:[]}));
  const [presups, albs, facts, partes, docs, notas, audit] = await Promise.all([
    safeQuery(sb.from('presupuestos').select('*').eq('empresa_id',EMPRESA.id).or(t.presupuesto_id ? `id.eq.${t.presupuesto_id}` : `cliente_id.eq.${t.cliente_id||0}`).neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('albaranes').select('*').eq('empresa_id',EMPRESA.id).or(t.cliente_id ? `cliente_id.eq.${t.cliente_id}` : 'id.eq.0').neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('facturas').select('*').eq('empresa_id',EMPRESA.id).or(t.cliente_id ? `cliente_id.eq.${t.cliente_id}` : 'id.eq.0').neq('estado','eliminado').order('created_at',{ascending:false}).limit(20)),
    safeQuery(sb.from('partes_trabajo').select('*').eq('trabajo_id',id).order('fecha',{ascending:false}).limit(50)),
    safeQuery(sb.from('documentos_trabajo').select('*').eq('trabajo_id',id).order('created_at',{ascending:false})),
    safeQuery(sb.from('notas_trabajo').select('*').eq('trabajo_id',id).order('created_at',{ascending:false})),
    safeQuery(sb.from('audit_log').select('*').eq('entidad','trabajo').eq('entidad_id',String(id)).order('created_at',{ascending:false}).limit(20)),
  ]);

  // Filtrar presupuestos/albaranes/facturas que realmente pertenecen a esta obra
  const presupData = (presups.data||[]).filter(p =>
    (t.presupuesto_id && p.id === t.presupuesto_id) || (p.trabajo_id === id)
  );
  // Si no hay relación directa, mostrar los del cliente vinculados a esta obra
  const albData = (albs.data||[]).filter(a => a.trabajo_id === id || a.presupuesto_id === t.presupuesto_id);
  const factData = (facts.data||[]).filter(f => f.trabajo_id === id || f.presupuesto_id === t.presupuesto_id);
  const partesData = partes.data||[];
  const docsData = docs.data||[];
  const notasData = notas.data||[];
  const auditData = audit.data||[];

  // KPIs — solo cantidades
  document.getElementById('ok-presup').textContent = presupData.length;
  document.getElementById('ok-albaranes').textContent = albData.length;
  document.getElementById('ok-facturas').textContent = factData.length;
  document.getElementById('ok-partes').textContent = partesData.length;
  document.getElementById('ok-docs').textContent = docsData.length;
  document.getElementById('ok-notas').textContent = notasData.length;

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
  document.getElementById('fichaObraAudit').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFichaObra('Creado', t.created_at ? new Date(t.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—')}
      ${datoFichaObra('Creado por', t.operario_nombre||'—')}
      ${t.updated_at ? datoFichaObra('Modificado', new Date(t.updated_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})) : ''}
      ${t.presupuesto_id ? datoFichaObra('Origen', 'Desde presupuesto') : datoFichaObra('Origen', 'Creación directa')}
      ${auditData.length ? '<div style="margin-top:8px;border-top:1px solid var(--gris-100);padding-top:6px"><div style="font-size:10.5px;color:var(--gris-400);margin-bottom:4px;font-weight:700">Últimos movimientos</div>' +
        auditData.slice(0,5).map(a => `<div style="font-size:10.5px;padding:3px 0;border-bottom:1px solid var(--gris-50)"><span style="color:var(--gris-400)">${new Date(a.created_at).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span> ${a.usuario_nombre||'—'}: ${a.detalle||a.accion}</div>`).join('') +
        '</div>' : ''}
    </div>`;

  // ── Helpers para barras resumen ──
  function resumenBar(items) {
    return `<div style="display:flex;gap:12px;padding:8px 10px;margin-bottom:10px;background:var(--gris-50);border-radius:8px;font-size:11.5px;flex-wrap:wrap">${items.join('')}</div>`;
  }
  function resumenItem(label, val, color) {
    return `<div><span style="color:var(--gris-400)">${label}:</span> <strong style="color:${color||'var(--gris-900)'}">${val}</strong></div>`;
  }

  // ── PRESUPUESTOS ──
  const presupHtml = presupData.length ?
    resumenBar([resumenItem('Total presupuestado', fmtE(totalPresup), 'var(--azul)'), resumenItem('Docs', presupData.length+'')]) +
    presupData.map(p=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="abrirEditor('presupuesto',${p.id})">
        <div><div style="font-weight:700;font-size:12.5px">${p.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.titulo||'—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(p.total)}</div>${estadoBadgeP(p.estado)}</div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📋</div><p>Sin presupuestos vinculados</p></div>';
  document.getElementById('obra-hist-presupuestos').innerHTML = presupHtml;

  // ── ALBARANES ──
  const albHtml = albData.length ?
    resumenBar([resumenItem('Total albaranes', fmtE(totalAlb), 'var(--gris-700)'), resumenItem('Docs', albData.length+'')]) +
    albData.map(a=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="abrirEditor('albaran',${a.id})">
        <div><div style="font-weight:700;font-size:12.5px">${a.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${a.fecha||'—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(a.total)}</div>${estadoBadgeA(a.estado)}</div>
      </div>`).join('') :
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

  // Activar pestaña Presupuestos por defecto
  obraTab('presupuestos');
}

// ═══════════════════════════════════════════════
// PESTAÑAS DE LA FICHA
// ═══════════════════════════════════════════════
const OBRA_TAB_TITLES = {presupuestos:'📋 Presupuestos',albaranes:'📄 Albaranes',facturas:'🧾 Facturas',partes:'📝 Partes de trabajo',documentos:'📎 Documentos',notas:'💬 Notas'};

function obraTab(tab) {
  ['presupuestos','albaranes','facturas','partes','documentos','notas'].forEach(t => {
    const el = document.getElementById('obra-hist-'+t);
    if (el) el.style.display = t===tab?'block':'none';
    const kpi = document.getElementById('okpi-'+t);
    if (kpi) kpi.classList.toggle('ficha-kpi-active', t===tab);
  });
  const titulo = document.getElementById('fichaObraHistTitulo');
  if (titulo) titulo.textContent = OBRA_TAB_TITLES[tab] || tab;
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

  // 1. Presupuesto
  const tienePresup = presupData.length > 0;
  etapas.presupuesto = tienePresup;

  // 2. Aprobado — algún presupuesto aceptado/aprobado
  const presupAprobado = presupData.some(p =>
    ['aceptado','aprobado','accepted','en_curso'].includes((p.estado||'').toLowerCase())
  );
  etapas.aprobado = presupAprobado;

  // 3. Material — si hay pedidos de compra vinculados o estado incluye material
  // Simplificación: si el estado de la obra es 'en_curso' o superior y hay presup aprobado
  etapas.material = presupAprobado && (t.estado === 'en_curso' || t.estado === 'finalizado' || t.estado === 'completado');

  // 4. Programado — tiene fecha asignada
  etapas.programado = !!t.fecha;

  // 5. En ejecución — tiene partes de trabajo o estado en_curso
  etapas.ejecucion = partesData.length > 0 || t.estado === 'en_curso';

  // 6. Albarán — tiene al menos un albarán
  etapas.albaran = albData.length > 0;

  // 7. Factura — tiene al menos una factura
  etapas.factura = factData.length > 0;

  // 8. Cobrado — todas las facturas cobradas
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
    texto: 'Presupuesto aprobado. Programa una fecha para ejecutar el trabajo.',
    accion: 'editarObraActual()', boton: '📅 Programar fecha', prioridad: 'alta'
  };
  if (!etapas.ejecucion) return {
    texto: 'Obra programada. Cuando empiece el trabajo, crea un parte.',
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
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;font-weight:600">${val}</span></div>`;
}

// ═══════════════════════════════════════════════
// ACCIONES RÁPIDAS DESDE LA FICHA
// ═══════════════════════════════════════════════
function editarObraActual() {
  if (!obraActualId) return;
  // Rellenar modal con datos actuales y abrir
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  document.getElementById('tr_titulo').value = t.titulo||'';
  // Buscar el índice del cliente en el select
  const sel = document.getElementById('tr_cli');
  if (sel) { for(let i=0;i<sel.options.length;i++) { if(parseInt(sel.options[i].value)===t.cliente_id) { sel.selectedIndex=i; break; } } }
  document.getElementById('tr_cat').value = t.categoria||'Fontanería';
  document.getElementById('tr_prio').value = t.prioridad||'Normal';
  document.getElementById('tr_fecha').value = t.fecha||'';
  document.getElementById('tr_hora').value = t.hora||'09:00';
  document.getElementById('tr_dir').value = t.direccion_obra_texto||'';
  document.getElementById('tr_desc').value = t.descripcion||'';
  document.getElementById('mTrabTit').textContent = 'Editar Obra';
  openModal('mTrabajo');
}

function nuevoPresupObraActual() {
  if (!obraActualId) return;
  const t = trabajos.find(x=>x.id===obraActualId);
  if (!t) return;
  // Abrir nuevo presupuesto vinculado al cliente de la obra
  if (typeof abrirNuevoPresupuesto === 'function') {
    abrirNuevoPresupuesto();
    setTimeout(() => {
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
  document.getElementById('obraNotaTexto').value = '';
  await abrirFichaObra(obraActualId);
  obraTab('notas');
  toast('Nota guardada ✓','success');
}

async function eliminarNotaObra(id) {
  if (!confirm('¿Eliminar nota?')) return;
  await sb.from('notas_trabajo').delete().eq('id', id);
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
  const path = `${EMPRESA.id}/obras/${obraActualId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file);
  if (upErr) { toast('Error subiendo: '+upErr.message,'error'); return; }
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
  const url = urlData?.publicUrl || '';
  await sb.from('documentos_trabajo').insert({
    empresa_id: EMPRESA.id, trabajo_id: obraActualId,
    nombre, tipo, url, path, tamaño: file.size,
    creado_por: CU.id
  });
  input.value = '';
  document.getElementById('obraDocNombre').value = '';
  await abrirFichaObra(obraActualId);
  obraTab('documentos');
  toast('Documento subido ✓','success');
}

async function eliminarDocObra(id) {
  if (!confirm('¿Eliminar documento?')) return;
  await sb.from('documentos_trabajo').delete().eq('id', id);
  await abrirFichaObra(obraActualId);
  obraTab('documentos');
  toast('Documento eliminado','info');
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
  const cli=clientes.find(c=>c.id===cliId);

  // Si estamos editando
  if (obraActualId && document.getElementById('mTrabTit').textContent === 'Editar Obra') {
    const { error } = await sb.from('trabajos').update({
      titulo,
      cliente_id: cliId, cliente_nombre: cli?.nombre||'',
      prioridad: v('tr_prio'), categoria: v('tr_cat'),
      fecha: v('tr_fecha'), hora: v('tr_hora'),
      direccion_obra_texto: v('tr_dir'), descripcion: v('tr_desc'),
    }).eq('id', obraActualId);
    if (error) { toast('Error: '+error.message,'error'); return; }
    closeModal('mTrabajo');
    document.getElementById('mTrabTit').textContent = 'Nueva Obra';
    const {data}=await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
    trabajos=data||[];
    await abrirFichaObra(obraActualId);
    toast('Obra actualizada ✓','success');
    return;
  }

  const num=`TRB-${new Date().getFullYear()}-${String(trabajos.length+1).padStart(3,'0')}`;
  const {error}=await sb.from('trabajos').insert({
    empresa_id:EMPRESA.id,numero:num,titulo,
    cliente_id:cliId,cliente_nombre:cli?.nombre||'',
    prioridad:v('tr_prio'),categoria:v('tr_cat'),
    fecha:v('tr_fecha'),hora:v('tr_hora'),
    direccion_obra_texto:v('tr_dir'),descripcion:v('tr_desc'),
    estado:'pendiente',operario_id:CU.id,operario_nombre:CP?.nombre||''
  });
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mTrabajo');
  const {data}=await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  trabajos=data||[]; renderTrabajos(); loadDashboard();
  toast(`Obra ${num} creada ✓`,'success');
}

async function delTrabajo(id) {
  if(!confirm('¿Eliminar obra?'))return;
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
