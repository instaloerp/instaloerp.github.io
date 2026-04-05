/**
 * MÓDULO CLIENTES
 * Gestión completa de clientes: CRUD, fichas, direcciones, contactos, documentos, notas
 * Incluye funcionalidad rápida para presupuestos, albaranes y obras desde cliente
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let cliVista = 'tabla';
let cliFiltroTipo = '';
let cliFiltroList = [];
let cliActualId = null;

// ═══════════════════════════════════════════════
//  VISTA Y RENDERIZADO
// ═══════════════════════════════════════════════
function setCliVista(v) {
  cliVista = v;
  document.getElementById('cliVista-lista').style.display = v === 'ficha' ? 'none' : 'block';
  document.getElementById('cliVista-ficha').style.display = v === 'ficha' ? 'block' : 'none';
  if (v === 'tarjetas' || v === 'tabla' || v === 'lista') {
    document.getElementById('cliGridTarjetas').style.display = v === 'tarjetas' ? 'grid' : 'none';
    document.getElementById('cliGridTabla').style.display = v === 'tabla' ? 'block' : (v === 'lista' ? 'none' : 'none');
    if (v !== 'lista') renderClientes(cliFiltroList.length ? cliFiltroList : clientes);
    else renderClientes(clientes); // si viene de ficha, renderizar todos
    // Resetear topbar al volver a la lista
    document.getElementById('pgTitle').textContent = 'Clientes';
    document.getElementById('pgSub').textContent = _fechaHoraActual();
    const tb = document.getElementById('topbarBtns');
    if (tb) tb.innerHTML = '';
    cliActualId = null;
    // Mostrar la vista correcta (tabla por defecto al volver)
    if (v === 'lista') {
      document.getElementById('cliGridTabla').style.display = 'block';
      cliVista = 'tabla';
    }
  }
  if (v === 'ficha' && cliActualId) {
    const c = clientes.find(x => x.id === cliActualId);
    if (c) {
      document.getElementById('pgTitle').textContent = c.nombre;
      document.getElementById('pgSub').textContent = _fechaHoraActual();
    }
  }
}

function renderClientes(list) {
  document.getElementById('cliCount').textContent = `${clientes.length} clientes · mostrando ${list.length}`;

  // Vista tarjetas
  document.getElementById('cliGridTarjetas').innerHTML = list.length ?
    list.map(c => `
      <div class="card" style="padding:0;overflow:hidden;cursor:pointer" onclick="abrirFicha(${c.id})">
        <div style="background:linear-gradient(135deg,${avC(c.nombre)},${avC(c.nombre)}cc);padding:20px;display:flex;align-items:center;gap:13px">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;flex-shrink:0">${ini(c.nombre)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nombre}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.75);margin-top:2px">${c.tipo||'Particular'}</div>
          </div>
          <span style="background:rgba(255,255,255,.2);color:#fff;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;flex-shrink:0">${c.tipo||'Particular'}</span>
        </div>
        <div style="padding:14px 16px">
          ${c.telefono ? `<div style="font-size:12.5px;color:var(--gris-600);margin-bottom:5px">📱 ${c.telefono}</div>` : ''}
          ${c.email ? `<div style="font-size:12.5px;color:var(--gris-600);margin-bottom:5px">✉️ ${c.email}</div>` : ''}
          ${c.municipio_fiscal ? `<div style="font-size:12.5px;color:var(--gris-600);margin-bottom:5px">📍 ${c.municipio_fiscal}${c.provincia_fiscal?', '+c.provincia_fiscal:''}</div>` : ''}
          ${c.nif ? `<div style="font-size:11px;color:var(--gris-400);font-family:monospace">NIF: ${c.nif}</div>` : ''}
        </div>
        <div style="padding:10px 16px;border-top:1px solid var(--gris-100);display:flex;gap:7px" onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" onclick="abrirFicha(${c.id})">👁️ Ver ficha</button>
          <button class="btn btn-ghost btn-sm" onclick="editCliente(${c.id})">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="delCliente(${c.id})">🗑️</button>
        </div>
      </div>`).join('') :
    '<div class="empty" style="grid-column:1/-1"><div class="ei">👥</div><h3>Sin clientes</h3><p>Crea tu primer cliente con el botón "+ Nuevo cliente"</p></div>';

  // Vista tabla
  document.getElementById('cliTable').innerHTML = list.length ?
    list.map(c=>`<tr>
      <td style="cursor:pointer" onclick="abrirFicha(${c.id})"><div style="display:flex;align-items:center;gap:8px"><div class="av av-sm" style="background:${avC(c.nombre)}">${ini(c.nombre)}</div><div><div style="font-weight:700">${c.nombre}</div><div style="font-size:11px;color:var(--gris-400)">${c.email||''}</div></div></div></td>
      <td><span class="badge bg-blue">${c.tipo||'Particular'}</span></td>
      <td>${c.telefono||c.movil||'—'}</td>
      <td style="font-size:12px">${c.email||'—'}</td>
      <td>${c.municipio_fiscal||'—'}</td>
      <td style="font-family:monospace;font-size:12px">${c.nif||'—'}</td>
      <td>—</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="abrirFicha(${c.id})">👁️</button>
        <button class="btn btn-ghost btn-sm" onclick="editCliente(${c.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="delCliente(${c.id})">🗑️</button>
      </div></td>
    </tr>`).join('') :
    '<tr><td colspan="8"><div class="empty"><div class="ei">👥</div><h3>Sin clientes</h3></div></td></tr>';
}

// ═══════════════════════════════════════════════
//  BÚSQUEDA Y FILTROS
// ═══════════════════════════════════════════════
function buscarCli(v) {
  const q = v.trim().toLowerCase();
  if (!q) { cliFiltroList = [...clientes]; renderClientes(cliFiltroList); return; }
  // Soporta búsqueda multi-palabra: todas las palabras deben coincidir
  const palabras = q.split(/\s+/);
  const filtered = clientes.filter(c => {
    const txt = [
      c.nombre, c.nif, c.email, c.telefono, c.movil,
      c.municipio_fiscal, c.provincia_fiscal, c.cp_fiscal,
      c.direccion_fiscal, c.razon_social, c.observaciones,
      c.tipo, c.web
    ].filter(Boolean).join(' ').toLowerCase();
    return palabras.every(p => txt.includes(p));
  });
  cliFiltroList = filtered;
  renderClientes(filtered);
}

function filtrarCliTipo(v) {
  cliFiltroList = v ? clientes.filter(c=>c.tipo===v) : [...clientes];
  renderClientes(cliFiltroList);
}

// filtrarCliProv eliminado — provincia se busca desde el buscador general

function exportarClientes() {
  if (!confirm('¿Exportar ' + clientes.length + ' clientes a Excel?')) return;
  const wb = XLSX.utils.book_new();
  const data = [
    ['Nombre','Tipo','NIF/CIF','Teléfono','Móvil','Email','Dirección','Municipio','CP','Provincia','Observaciones'],
    ...clientes.map(c => [c.nombre||'',c.tipo||'',c.nif||'',c.telefono||'',c.movil||'',c.email||'',c.direccion_fiscal||'',c.municipio_fiscal||'',c.cp_fiscal||'',c.provincia_fiscal||'',c.observaciones||''])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, 'clientes_'+new Date().toISOString().split('T')[0]+'.xlsx');
  toast('Clientes exportados a Excel ✓','success');
}

// ═══════════════════════════════════════════════
//  FICHA DE CLIENTE
// ═══════════════════════════════════════════════
async function abrirFicha(id) {
  cliActualId = id;
  const c = clientes.find(x=>x.id===id);
  if (!c) return;
  document.getElementById('fichaCliNombre').textContent = c.nombre;
  document.getElementById('pgTitle').textContent = c.nombre;
  document.getElementById('pgSub').textContent = _fechaHoraActual();
  setCliVista('ficha');

  // Avatar y subtítulo
  const av = document.getElementById('fichaCliAvatar');
  if (av) { av.style.background = avC(c.nombre); av.textContent = ini(c.nombre); }
  const sub = document.getElementById('fichaCliSub');
  if (sub) sub.textContent = [c.tipo||'Particular', c.municipio_fiscal, c.provincia_fiscal].filter(Boolean).join(' · ');

  // Datos principales (compacto) — tarifa en vez de descuento
  const tarifa = c.tarifa || (c.descuento_habitual ? 'Dto. ' + c.descuento_habitual + '%' : 'General');
  document.getElementById('fichaCliDatos').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${datoFicha('Tipo',c.tipo||'Particular')}
      ${datoFicha('NIF/CIF',c.nif||'—')}
      ${datoFicha('Teléfono',c.telefono||'—')}
      ${datoFicha('Móvil',c.movil||'—')}
      ${datoFicha('Email',c.email||'—')}
      ${datoFicha('Web',c.web||'—')}
      ${datoFicha('Municipio',c.municipio_fiscal||'—')}
      ${datoFicha('Provincia',c.provincia_fiscal||'—')}
      ${datoFicha('Dir. fiscal',c.direccion_fiscal||'—')}
      ${datoFicha('Forma pago',formasPago.find(f=>f.id===c.forma_pago_id)?.nombre||'—')}
      ${datoFicha('Tarifa',tarifa)}
      ${c.mandato_sepa_estado?datoFicha('Mandato SEPA',c.mandato_sepa_estado==='firmado'?'✅ Firmado':'⏳ '+c.mandato_sepa_estado):''}
      ${c.observaciones?`<div style="margin-top:6px;padding:8px;background:var(--gris-50);border-radius:7px;font-size:11.5px;color:var(--gris-600)">${c.observaciones}</div>`:''}
    </div>
    <div id="fichaCliBanco"></div>`;
  _renderFichaCliBanco(c);

  // Cargar todo en paralelo (incluye albaranes)
  const [dirs, conts, trabs, presups, albs, facts, docs, notas] = await Promise.all([
    sb.from('direcciones_cliente').select('*').eq('cliente_id',id),
    sb.from('contactos_cliente').select('*').eq('cliente_id',id),
    sb.from('trabajos').select('*').eq('cliente_id',id).neq('estado','eliminado').order('created_at',{ascending:false}).limit(10),
    sb.from('presupuestos').select('*').eq('cliente_id',id).neq('estado','eliminado').order('created_at',{ascending:false}).limit(10),
    sb.from('albaranes').select('*').eq('cliente_id',id).neq('estado','eliminado').order('created_at',{ascending:false}).limit(10),
    sb.from('facturas').select('*').eq('cliente_id',id).neq('estado','eliminado').order('created_at',{ascending:false}).limit(10),
    sb.from('documentos_cliente').select('*').eq('cliente_id',id).order('created_at',{ascending:false}),
    sb.from('notas_cliente').select('*').eq('cliente_id',id).order('created_at',{ascending:false}),
  ]);

  // Cargar documentos de las obras del cliente
  const trabIds = (trabs.data||[]).map(t => t.id);
  let docsObras = [];
  if (trabIds.length) {
    const { data: docsObraData } = await sb.from('documentos_trabajo').select('*').in('trabajo_id', trabIds).order('created_at',{ascending:false});
    docsObras = (docsObraData||[]).map(d => {
      const obra = (trabs.data||[]).find(t => t.id === d.trabajo_id);
      return { ...d, _obraNumero: obra?.numero || '', _obraTitulo: obra?.titulo || '', _fromObra: true };
    });
  }

  // KPIs — solo cantidades
  document.getElementById('fk-trabajos').textContent = trabs.data?.length||0;
  document.getElementById('fk-presup').textContent = presups.data?.length||0;
  document.getElementById('fk-albaranes').textContent = (albs.data||[]).length;
  document.getElementById('fk-facturas').textContent = (facts.data||[]).length;
  document.getElementById('fk-docs').textContent = (docs.data||[]).length + docsObras.length;
  document.getElementById('fk-notas').textContent = (notas.data||[]).length;

  // Totales para resúmenes dentro de cada panel
  const totalPresup = (presups.data||[]).reduce((s,p)=>s+(p.total||0),0);
  const totalAlb = (albs.data||[]).reduce((s,a)=>s+(a.total||0),0);
  const totalFact = (facts.data||[]).reduce((s,f)=>s+(f.total||0),0);
  const pendienteCobro = (facts.data||[]).filter(f=>f.estado==='pendiente'||f.estado==='vencida').reduce((s,f)=>s+(f.total||0),0);
  const vencidas = (facts.data||[]).filter(f=>f.estado==='vencida').length;

  // Helper: barra resumen de importes
  function resumenBar(items) {
    return `<div style="display:flex;gap:12px;padding:8px 10px;margin-bottom:10px;background:var(--gris-50);border-radius:8px;font-size:11.5px;flex-wrap:wrap">${items.join('')}</div>`;
  }
  function resumenItem(label, val, color) {
    return `<div><span style="color:var(--gris-400)">${label}:</span> <strong style="color:${color||'var(--gris-900)'}">${val}</strong></div>`;
  }

  // Documentos
  const TIPO_ICO = {manual:'📖',garantia:'🛡️',certificado:'📜',foto:'📷',contrato:'📋',otro:'📄'};
  document.getElementById('ficha-hist-documentos').innerHTML = `
    <div>
      <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
        <select id="docTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
          <option value="manual">📖 Manual</option><option value="garantia">🛡️ Garantía</option><option value="certificado">📜 Certificado</option>
          <option value="foto">📷 Foto</option><option value="contrato">📋 Contrato</option><option value="otro">📄 Otro</option>
        </select>
        <input id="docNombre" placeholder="Nombre..." style="flex:1;min-width:120px;padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <label class="btn btn-primary btn-sm" for="docFile" style="cursor:pointer;font-size:11px">📎 Subir</label>
        <input type="file" id="docFile" style="display:none" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" onchange="subirDocumento(this)">
      </div>
      ${(docs.data||[]).length ? '<div style="font-size:10px;color:var(--gris-400);font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:6px 0 2px">Documentos del cliente</div>' + (docs.data||[]).map(d => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100)">
          <span style="font-size:18px">${TIPO_ICO[d.tipo]||'📄'}</span>
          <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.nombre}</div><div style="font-size:10.5px;color:var(--gris-400)">${d.tipo} · ${new Date(d.created_at).toLocaleDateString('es-ES')}</div></div>
          <a href="${d.url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:10.5px;padding:3px 7px">👁️</a>
          <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="eliminarDoc(${d.id})">🗑️</button>
        </div>`).join('') : ''}
      ${docsObras.length ? '<div style="font-size:10px;color:var(--azul);font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:8px 0 2px;margin-top:4px;border-top:1px solid var(--gris-100)">Documentos de obras</div>' + docsObras.map(d => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100)">
          <span style="font-size:18px">${TIPO_ICO[d.tipo]||'📄'}</span>
          <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.nombre}</div><div style="font-size:10.5px;color:var(--gris-400)">${d.tipo} · ${new Date(d.created_at).toLocaleDateString('es-ES')} · <span style="color:var(--azul)">🏗️ ${d._obraNumero}${d._obraTitulo ? ' — '+d._obraTitulo : ''}</span></div></div>
          <a href="${d.url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:10.5px;padding:3px 7px">👁️</a>
        </div>`).join('') : ''}
      ${!(docs.data||[]).length && !docsObras.length ? '<div style="color:var(--gris-400);font-size:12.5px;padding:14px 0;text-align:center">Sin documentos adjuntos</div>' : ''}
    </div>`;

  // Notas — formulario integrado + listado
  const NOTA_ICO = {nota:'📝',llamada:'📞',visita:'🚗',email:'✉️'};
  const notaForm = `
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:end">
      <select id="notaTipo" style="padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:11.5px;outline:none">
        <option value="nota">📝 Nota</option><option value="llamada">📞 Llamada</option><option value="visita">🚗 Visita</option><option value="email">✉️ Email</option>
      </select>
      <input id="notaTexto" placeholder="Escribe una nota..." style="flex:1;min-width:200px;padding:6px 9px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:12px;outline:none;font-family:var(--font)">
      <button class="btn btn-primary btn-sm" style="font-size:11.5px;white-space:nowrap" onclick="guardarNota()">💾 Guardar</button>
    </div>`;
  const notaList = (notas.data||[]).length ?
    (notas.data||[]).map(n => `
      <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--gris-100)">
        <span style="font-size:16px;flex-shrink:0">${NOTA_ICO[n.tipo]||'📝'}</span>
        <div style="flex:1"><div style="font-size:12.5px;line-height:1.5">${n.texto}</div><div style="font-size:10.5px;color:var(--gris-400);margin-top:3px">${new Date(n.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>
        <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 5px" onclick="eliminarNota(${n.id})">🗑️</button>
      </div>`).join('') :
    '<div style="color:var(--gris-400);font-size:12.5px;padding:14px 0;text-align:center">Sin notas todavía</div>';
  document.getElementById('ficha-hist-notas').innerHTML = notaForm + notaList;

  // Direcciones
  document.getElementById('fichaDirList').innerHTML = (dirs.data||[]).length ?
    (dirs.data||[]).map(d=>`
      <div style="padding:8px 14px;border-bottom:1px solid var(--gris-100);display:flex;gap:8px">
        <div style="flex:1"><div style="font-weight:700;font-size:12px">${d.nombre} ${d.es_fiscal?'<span class="badge bg-blue" style="font-size:9px">Fiscal</span>':''}</div><div style="font-size:11px;color:var(--gris-500)">${d.direccion||''} ${d.municipio||''} ${d.cp||''} ${d.provincia||''}</div></div>
        <button class="btn btn-ghost btn-sm" style="padding:2px 5px;font-size:10px" onclick="delDireccion(${d.id})">🗑️</button>
      </div>`).join('') :
    '<div style="padding:10px 14px;color:var(--gris-400);font-size:12px">Sin direcciones</div>';

  // Contactos
  document.getElementById('fichaContList').innerHTML = (conts.data||[]).length ?
    (conts.data||[]).map(ct=>`
      <div style="padding:8px 14px;border-bottom:1px solid var(--gris-100);display:flex;gap:8px;align-items:center">
        <div class="av av-sm" style="background:${avC(ct.nombre)};width:24px;height:24px;font-size:9px">${ini(ct.nombre)}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:12px">${ct.nombre} ${ct.principal?'<span class="badge bg-green" style="font-size:9px">Principal</span>':''}</div><div style="font-size:11px;color:var(--gris-500)">${ct.cargo||''} ${ct.telefono||ct.movil||''} ${ct.email||''}</div></div>
        <button class="btn btn-ghost btn-sm" style="padding:2px 5px;font-size:10px" onclick="delContacto(${ct.id})">🗑️</button>
      </div>`).join('') :
    '<div style="padding:10px 14px;color:var(--gris-400);font-size:12px">Sin contactos</div>';

  // Historial trabajos (clicables)
  document.getElementById('ficha-hist-trabajos').innerHTML = (trabs.data||[]).length ?
    (trabs.data||[]).map(t=>`
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="navTrabajo(${t.id})">
        <span style="font-size:15px">${catIco(t.categoria)}</span>
        <div style="flex:1"><div style="font-weight:700;font-size:12.5px">${t.titulo}</div><div style="font-size:10.5px;color:var(--gris-400)">${t.numero} · ${t.fecha||'—'}</div></div>
        ${estadoBadge(t.estado)}
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">🏗️</div><p>Sin obras</p></div>';

  // Historial presupuestos (clicables + barra resumen)
  const presupHtml = (presups.data||[]).length ?
    resumenBar([resumenItem('Total presupuestado', fmtE(totalPresup), 'var(--azul)')]) +
    (presups.data||[]).map(p=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="abrirEditor('presupuesto',${p.id})">
        <div><div style="font-weight:700;font-size:12.5px">${p.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${p.fecha||'—'} · ${p.categoria||'—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(p.total)}</div>${estadoBadgeP(p.estado)}</div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📋</div><p>Sin presupuestos</p></div>';
  document.getElementById('ficha-hist-presupuestos').innerHTML = presupHtml;

  // Historial albaranes (clicables + barra resumen)
  const albHtml = (albs.data||[]).length ?
    resumenBar([resumenItem('Total albaranes', fmtE(totalAlb), 'var(--gris-700)')]) +
    (albs.data||[]).map(a=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="abrirEditor('albaran',${a.id})">
        <div><div style="font-weight:700;font-size:12.5px">${a.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${a.fecha||'—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(a.total)}</div>${estadoBadgeA(a.estado)}</div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">📄</div><p>Sin albaranes</p></div>';
  document.getElementById('ficha-hist-albaranes').innerHTML = albHtml;

  // Historial facturas (clicables + barra resumen con pendiente/vencida)
  const factResumen = [resumenItem('Total facturado', fmtE(totalFact), 'var(--verde)')];
  if (pendienteCobro > 0) factResumen.push(resumenItem('Pendiente cobro', fmtE(pendienteCobro), 'var(--rojo)'));
  if (vencidas > 0) factResumen.push(resumenItem('Vencidas', vencidas+'', 'var(--rojo)'));
  const factHtml = (facts.data||[]).length ?
    resumenBar(factResumen) +
    (facts.data||[]).map(f=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-100);cursor:pointer" onclick="abrirEditor('factura',${f.id})">
        <div><div style="font-weight:700;font-size:12.5px">${f.numero}</div><div style="font-size:10.5px;color:var(--gris-400)">${f.fecha||'—'}</div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:13px">${fmtE(f.total)}</div>${estadoBadgeF(f.estado)}</div>
      </div>`).join('') :
    '<div class="empty" style="padding:30px 0"><div class="ei">🧾</div><p>Sin facturas</p></div>';
  document.getElementById('ficha-hist-facturas').innerHTML = factHtml;

  // Activar pestaña Obras por defecto
  fichaTab('trabajos');
}

// Navegación a trabajo/obra — abre la ficha de la obra
function navTrabajo(id) {
  abrirFichaObra(id);
}

// ═══════════════════════════════════════════════
//  CUENTAS BANCARIAS INLINE — FICHA CLIENTE
//  Soporta múltiples cuentas con predeterminada + mandato SEPA
// ═══════════════════════════════════════════════
let _cbeEditId = null; // ID de la cuenta que estamos editando (null = nueva)

function _getCuentasCli(clienteId) {
  return (typeof cuentasBancariasEntidad !== 'undefined' ? cuentasBancariasEntidad : [])
    .filter(cb => cb.tipo_entidad === 'cliente' && cb.entidad_id === clienteId);
}

function _renderFichaCliBanco(c) {
  const el = document.getElementById('fichaCliBanco');
  if (!el) return;
  const cuentas = _getCuentasCli(c.id);

  if (cuentas.length === 0) {
    // Sin cuentas: botón para añadir
    el.innerHTML = `
      <div style="margin-top:10px;text-align:center">
        <button onclick="_nuevaCuentaCli()" style="font-size:11px;color:var(--azul);background:var(--azul-light,#e8f0fe);border:1px dashed var(--azul);cursor:pointer;padding:8px 16px;border-radius:8px;width:100%">
          🏦 Añadir cuenta bancaria / IBAN
        </button>
      </div>`;
    return;
  }

  // Mostrar todas las cuentas
  let html = `<div style="margin-top:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;letter-spacing:0.5px">🏦 Cuentas bancarias (${cuentas.length})</span>
      <button onclick="_nuevaCuentaCli()" style="font-size:10px;color:var(--verde-dark,#16a34a);background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:4px" title="Añadir otra cuenta">➕ Nueva</button>
    </div>`;

  cuentas.forEach(cb => {
    const ibanFmt = cb.iban ? cb.iban.replace(/(.{4})/g,'$1 ').trim() : '';
    const esPred = cb.predeterminada;
    const borderColor = esPred ? 'var(--azul)' : 'var(--gris-100)';
    // Mandato SEPA
    let mandatoTag = '';
    if (cb.mandato_sepa_estado === 'firmado') {
      mandatoTag = '<span style="font-size:9px;padding:1px 5px;background:#dcfce7;color:#166534;border-radius:3px;font-weight:600">SEPA ✅</span>';
    } else {
      mandatoTag = '<span style="font-size:9px;padding:1px 5px;background:#fef3c7;color:#92400e;border-radius:3px;font-weight:600">SEPA ⚠️</span>';
    }

    html += `<div style="padding:8px 10px;background:var(--gris-50);border-radius:7px;border:1.5px solid ${borderColor};margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:5px">
          ${esPred?'<span style="font-size:9px;padding:1px 5px;background:var(--azul);color:white;border-radius:3px;font-weight:700">PREDETERMINADA</span>':''}
          ${mandatoTag}
          <span style="font-size:10px;color:var(--gris-400)">${cb.banco_entidad||''}</span>
        </div>
        <div style="display:flex;gap:2px">
          ${!esPred?`<button onclick="_setPredeterminadaCli(${cb.id})" style="font-size:9px;color:var(--azul);background:none;border:none;cursor:pointer;padding:1px 4px" title="Hacer predeterminada">⭐</button>`:''}
          <button onclick="_editarCuentaCli(${cb.id})" style="font-size:9px;color:var(--azul);background:none;border:none;cursor:pointer;padding:1px 4px" title="Editar">✏️</button>
          <button onclick="_eliminarCuentaCli(${cb.id})" style="font-size:9px;color:var(--rojo);background:none;border:none;cursor:pointer;padding:1px 4px" title="Eliminar">🗑️</button>
        </div>
      </div>
      <div style="font-family:monospace;font-size:11.5px;font-weight:600;letter-spacing:0.5px;color:var(--gris-700)">${ibanFmt}</div>
      ${cb.titular?`<div style="font-size:10.5px;color:var(--gris-500);margin-top:2px">Titular: ${cb.titular}</div>`:''}
      ${cb.mandato_sepa_estado!=='firmado'?`<div style="margin-top:4px"><button onclick="_gestionarMandatoCuenta(${cb.id})" style="font-size:9.5px;padding:3px 8px;border:1px solid #f59e0b;background:#fffbeb;border-radius:4px;cursor:pointer;color:#92400e;font-weight:600">📄 Gestionar mandato SEPA</button></div>`:''}
    </div>`;
  });

  html += '</div>';
  el.innerHTML = html;
}

function _nuevaCuentaCli() {
  _cbeEditId = null;
  _mostrarFormCuentaCli(null);
}

function _editarCuentaCli(cbeId) {
  _cbeEditId = cbeId;
  const cb = (cuentasBancariasEntidad||[]).find(x => x.id === cbeId);
  _mostrarFormCuentaCli(cb);
}

function _mostrarFormCuentaCli(cb) {
  const c = clientes.find(x => x.id === cliActualId);
  if (!c) return;
  const el = document.getElementById('fichaCliBanco');
  if (!el) return;
  const esNueva = !cb;
  const titularVal = esNueva ? c.nombre : (cb.titular || c.nombre);
  const ibanVal = cb ? cb.iban.replace(/(.{4})/g,'$1 ').trim() : '';
  const bicVal = cb ? (cb.bic||'') : '';
  const entidadVal = cb ? (cb.banco_entidad||'') : '';
  el.innerHTML = `
    <div style="margin-top:10px;padding:12px;background:var(--gris-50);border-radius:8px;border:1px solid var(--azul,#4285f4)">
      <div style="font-size:10px;font-weight:700;color:var(--azul);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">🏦 ${esNueva?'Nueva cuenta bancaria':'Editar cuenta'}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div>
          <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">IBAN</label>
          <div style="display:flex;gap:4px;align-items:center">
            <input id="fi_iban" type="text" value="${ibanVal}" placeholder="ES00 0000 0000 0000 0000 0000" oninput="validarIBANLive(this)" style="flex:1;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px;font-family:monospace;letter-spacing:0.5px">
            <span id="fi_iban_status" style="font-size:14px;min-width:18px;text-align:center"></span>
          </div>
          <div id="fi_iban_msg" style="font-size:10px;margin-top:2px;min-height:14px"></div>
        </div>
        <div style="display:flex;gap:6px">
          <div style="flex:1">
            <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">BIC/SWIFT</label>
            <input id="fi_bic" type="text" value="${bicVal}" placeholder="BSCHESMMXXX" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px">
          </div>
          <div style="flex:1">
            <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">Entidad bancaria</label>
            <input id="fi_banco_entidad" type="text" value="${entidadVal}" placeholder="Nombre del banco" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px">
          </div>
        </div>
        <div>
          <label style="font-size:10px;color:var(--gris-500);display:block;margin-bottom:2px">Titular de la cuenta</label>
          <input id="fi_banco_titular" type="text" value="${titularVal}" placeholder="Nombre del titular" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--gris-200);border-radius:6px">
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
        <button onclick="_cancelarCuentaCli()" style="font-size:11px;padding:6px 14px;border:1px solid var(--gris-200);background:white;border-radius:6px;cursor:pointer;color:var(--gris-600)">Cancelar</button>
        <button onclick="_guardarCuentaCli()" style="font-size:11px;padding:6px 14px;border:none;background:var(--azul);color:white;border-radius:6px;cursor:pointer;font-weight:600">💾 Guardar</button>
      </div>
    </div>`;
  const ibanEl = document.getElementById('fi_iban');
  if (ibanEl) {
    if (ibanEl.value.trim()) validarIBANLive(ibanEl);
    else ibanEl.focus();
  }
}

function _cancelarCuentaCli() {
  const c = clientes.find(x => x.id === cliActualId);
  if (c) _renderFichaCliBanco(c);
}

async function _guardarCuentaCli() {
  const iban = document.getElementById('fi_iban').value.replace(/\s/g,'').toUpperCase() || null;
  const bic = document.getElementById('fi_bic').value.trim().toUpperCase() || null;
  const banco_entidad = document.getElementById('fi_banco_entidad').value.trim() || null;
  const titular = document.getElementById('fi_banco_titular').value.trim() || null;

  if (!iban) { toast('Introduce un IBAN', 'error'); return; }
  if (iban && typeof _validarIBAN === 'function' && !_validarIBAN(iban)) {
    if (!confirm('El IBAN no parece válido. ¿Guardar igualmente?')) return;
  }

  const cuentasExist = _getCuentasCli(cliActualId);
  const esNueva = !_cbeEditId;
  const esPrimera = esNueva && cuentasExist.length === 0;

  if (_cbeEditId) {
    // Actualizar cuenta existente
    const { error } = await sb.from('cuentas_bancarias_entidad').update({ iban, bic, banco_entidad, titular }).eq('id', _cbeEditId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    const idx = cuentasBancariasEntidad.findIndex(x => x.id === _cbeEditId);
    if (idx >= 0) Object.assign(cuentasBancariasEntidad[idx], { iban, bic, banco_entidad, titular });
    toast('Cuenta actualizada ✓', 'success');
  } else {
    // Crear nueva
    const obj = {
      empresa_id: EMPRESA.id, tipo_entidad: 'cliente', entidad_id: cliActualId,
      iban, bic, banco_entidad, titular,
      predeterminada: esPrimera // La primera es automáticamente predeterminada
    };
    const { data, error } = await sb.from('cuentas_bancarias_entidad').insert(obj).select();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (data && data[0]) cuentasBancariasEntidad.push(data[0]);
    toast('Cuenta añadida ✓', 'success');

    // También actualizar el campo iban en clientes para retrocompatibilidad
    if (esPrimera) {
      await sb.from('clientes').update({ iban, bic, banco_entidad, banco_titular: titular }).eq('id', cliActualId);
      const ci = clientes.findIndex(x => x.id === cliActualId);
      if (ci >= 0) Object.assign(clientes[ci], { iban, bic, banco_entidad, banco_titular: titular });
    }
  }

  const c = clientes.find(x => x.id === cliActualId);
  _renderFichaCliBanco(c);

  // Avisar sobre mandato SEPA para la nueva cuenta
  if (esNueva) {
    setTimeout(() => {
      if (confirm('Cuenta bancaria guardada.\n\n⚠️ Para adeudos directos (domiciliación) necesitas un mandato SEPA firmado.\n\n¿Gestionar mandato SEPA ahora?')) {
        const newCb = _getCuentasCli(cliActualId).find(cb => cb.iban === iban);
        if (newCb) _gestionarMandatoCuenta(newCb.id);
        else if (typeof generarMandatoSEPA === 'function') generarMandatoSEPA('cliente');
      }
    }, 300);
  }
}

async function _setPredeterminadaCli(cbeId) {
  const cuentas = _getCuentasCli(cliActualId);
  // Quitar predeterminada a todas
  for (const cb of cuentas) {
    if (cb.predeterminada) {
      await sb.from('cuentas_bancarias_entidad').update({ predeterminada: false }).eq('id', cb.id);
      cb.predeterminada = false;
    }
  }
  // Poner predeterminada a la seleccionada
  await sb.from('cuentas_bancarias_entidad').update({ predeterminada: true }).eq('id', cbeId);
  const cb = cuentasBancariasEntidad.find(x => x.id === cbeId);
  if (cb) {
    cb.predeterminada = true;
    // Sincronizar con clientes para retrocompatibilidad
    await sb.from('clientes').update({ iban: cb.iban, bic: cb.bic, banco_entidad: cb.banco_entidad, banco_titular: cb.titular }).eq('id', cliActualId);
    const ci = clientes.findIndex(x => x.id === cliActualId);
    if (ci >= 0) Object.assign(clientes[ci], { iban: cb.iban, bic: cb.bic, banco_entidad: cb.banco_entidad, banco_titular: cb.titular });
  }
  toast('Cuenta predeterminada actualizada ⭐', 'success');
  const c = clientes.find(x => x.id === cliActualId);
  _renderFichaCliBanco(c);
}

async function _eliminarCuentaCli(cbeId) {
  if (!confirm('¿Eliminar esta cuenta bancaria?')) return;
  await sb.from('cuentas_bancarias_entidad').delete().eq('id', cbeId);
  cuentasBancariasEntidad = cuentasBancariasEntidad.filter(x => x.id !== cbeId);
  toast('Cuenta eliminada', 'info');
  const c = clientes.find(x => x.id === cliActualId);
  _renderFichaCliBanco(c);
}

function _gestionarMandatoCuenta(cbeId) {
  // Abrir el modal de mandato SEPA pasando el ID de la cuenta
  if (typeof generarMandatoSEPA === 'function') {
    window._mandatoCuentaId = cbeId;
    generarMandatoSEPA('cliente');
  }
}

function datoFicha(label, val) {
  if(!val||val==='—') return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;color:var(--gris-400)">—</span></div>`;
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gris-100)"><span style="font-size:11.5px;color:var(--gris-500)">${label}</span><span style="font-size:11.5px;font-weight:600">${val}</span></div>`;
}

const FICHA_TAB_TITLES = {trabajos:'🏗️ Obras',presupuestos:'📋 Presupuestos',albaranes:'📄 Albaranes',facturas:'🧾 Facturas',documentos:'📎 Documentos',notas:'📝 Notas'};

function fichaTab(tab) {
  ['trabajos','presupuestos','albaranes','facturas','documentos','notas'].forEach(t => {
    const el = document.getElementById('ficha-hist-'+t);
    if (el) el.style.display = t===tab?'block':'none';
    const kpi = document.getElementById('fkpi-'+t);
    if (kpi) kpi.classList.toggle('ficha-kpi-active', t===tab);
  });
  const titulo = document.getElementById('fichaHistTitulo');
  if (titulo) titulo.textContent = FICHA_TAB_TITLES[tab] || tab;
}

function editCliActual() { if(cliActualId) editCliente(cliActualId); }

// ═══════════════════════════════════════════════
//  DOCUMENTOS Y NOTAS
// ═══════════════════════════════════════════════
async function guardarNota() {
  if (!cliActualId) return;
  const texto = document.getElementById('notaTexto').value.trim();
  if (!texto) { toast('Escribe el texto de la nota','error'); return; }
  const tipo = document.getElementById('notaTipo').value;
  const { error } = await sb.from('notas_cliente').insert({
    empresa_id: EMPRESA.id, cliente_id: cliActualId,
    texto, tipo, creado_por: CU.id
  });
  if (error) { toast('Error: '+error.message,'error'); return; }
  document.getElementById('notaTexto').value = '';
  await abrirFicha(cliActualId);
  fichaTab('notas');
  toast('Nota guardada ✓','success');
}

async function subirDocumento(input) {
  if (!cliActualId) return;
  const file = input.files[0];
  if (!file) return;
  const nombre = document.getElementById('docNombre').value.trim() || file.name;
  const tipo = document.getElementById('docTipo').value;
  toast('Subiendo documento...','info');
  const path = `docs/clientes/${cliActualId}/${Date.now()}_${file.name}`;
  const { data, error } = await sb.storage.from('fotos-partes').upload(path, file);
  if (error) { toast('Error al subir: '+error.message,'error'); return; }
  const { data: url } = sb.storage.from('fotos-partes').getPublicUrl(path);
  await sb.from('documentos_cliente').insert({
    empresa_id: EMPRESA.id, cliente_id: cliActualId,
    nombre, tipo, url: url.publicUrl,
    tamanio: file.size, subido_por: CU.id
  });
  input.value = '';
  document.getElementById('docNombre').value = '';
  await abrirFicha(cliActualId);
  fichaTab('documentos');
  toast('Documento subido ✓','success');
}

async function eliminarDoc(id) {
  if (!confirm('¿Eliminar documento?')) return;
  await sb.from('documentos_cliente').delete().eq('id',id);
  await abrirFicha(cliActualId);
  toast('Documento eliminado','info');
}

async function eliminarNota(id) {
  if (!confirm('¿Eliminar nota?')) return;
  await sb.from('notas_cliente').delete().eq('id',id);
  await abrirFicha(cliActualId);
  toast('Nota eliminada','info');
}

// ═══════════════════════════════════════════════
//  CREAR CLIENTE DESDE DOCUMENTO
// ═══════════════════════════════════════════════
let _desdeDocumento = null;

function nuevoClienteDesde(desde) {
  _desdeDocumento = desde;
  openModal('mCliente');
  setTimeout(() => {
    const mCli = document.getElementById('mCliente');
    if (mCli) {
      mCli.style.zIndex = '2000';
      mCli.style.background = 'rgba(0,0,0,0.7)';
    }
  }, 50);
}

function _cerrarClienteDesdeDocumento() {
  const mCli = document.getElementById('mCliente');
  if (mCli) {
    mCli.style.zIndex = '';
    mCli.style.background = '';
  }
}

function _volverADocumentoConCliente() {
  if (!_desdeDocumento) return;
  const desde = _desdeDocumento;
  _desdeDocumento = null;
  const ultimo = clientes[clientes.length-1];
  if (!ultimo) return;
  const sels = {presup:'pr_cliente', albaran:'ab_cliente', factura:'fr_cliente'};
  const selId = sels[desde];
  if (selId) {
    const sel = document.getElementById(selId);
    if (sel) {
      if (!sel.querySelector('option[value="'+ultimo.id+'"]')) {
        const opt = document.createElement('option');
        opt.value = ultimo.id;
        opt.textContent = ultimo.nombre;
        sel.appendChild(opt);
      }
      sel.value = ultimo.id;
      sel.dispatchEvent(new Event('change'));
    }
  }
  toast('Cliente "' + ultimo.nombre + '" creado y seleccionado ✓', 'success');
}

// ═══════════════════════════════════════════════
//  ACCESOS RÁPIDOS A DOCUMENTOS
// ═══════════════════════════════════════════════
function abrirNuevoAlbaran() {
  abrirEditor('albaran');
}

function abrirNuevaFactura() {
  abrirEditor('factura');
}

function abrirNuevoPresupuesto() {
  abrirEditor('presupuesto');
}

// ═══════════════════════════════════════════════
//  GENERADOR DE NÚMERO AUTOMÁTICO
// ═══════════════════════════════════════════════
async function generarNumeroDoc(tipo) {
  const prefijos = {presupuesto:'PRE-', albaran:'ALB-', factura:'FAC-', presupuesto_compra:'PRC-', pedido_compra:'PED-', recepcion:'REC-', factura_proveedor:'FPR-'};
  const tablas  = {presupuesto:'presupuestos', albaran:'albaranes', factura:'facturas', presupuesto_compra:'presupuestos_compra', pedido_compra:'pedidos_compra', recepcion:'recepciones', factura_proveedor:'facturas_proveedor'};
  const allSeries = series||[];

  let s = allSeries.find(x => x.tipo === tipo);
  if (!s && tipo === 'factura') s = allSeries.find(x => x.tipo === 'fact' || x.tipo === 'facturas');
  if (!s && tipo === 'presupuesto') s = allSeries.find(x => x.tipo === 'pres' || x.tipo === 'presup');
  if (!s && tipo === 'albaran') s = allSeries.find(x => x.tipo === 'alb' || x.tipo === 'albaran');

  const tabla = tablas[tipo] || tipo;
  const prefijo = s?.prefijo || prefijos[tipo] || 'DOC-';
  const digitos = s?.digitos || 4;

  const { data: ultimo } = await sb.from(tabla)
    .select('numero')
    .eq('empresa_id', EMPRESA.id)
    .not('numero','is',null)
    .not('numero','like','BORR-%')
    .order('created_at', { ascending: false })
    .limit(20);

  let maxNum = 0;
  if (ultimo?.length) {
    ultimo.forEach(d => {
      const match = (d.numero||'').match(/(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
  }

  const base = s?.siguiente_numero ? Math.max(s.siguiente_numero - 1, maxNum) : maxNum;
  const siguiente = base + 1;

  return prefijo + String(siguiente).padStart(digitos, '0');
}

// ═══════════════════════════════════════════════
//  PRESUPUESTO RÁPIDO
// ═══════════════════════════════════════════════
let prLineas = [];

async function nuevoPresupCliActual() {
  prLineas = [];
  document.getElementById('mPresupRapido').dataset.editId = '';
  const sel = document.getElementById('pr_cliente');
  sel.innerHTML = '<option value="">— Selecciona cliente —</option>' +
    clientes.map(c=>`<option value="${c.id}" ${c.id===cliActualId?'selected':''}>${c.nombre}</option>`).join('');

  const fpSel = document.getElementById('pr_fpago');
  fpSel.innerHTML = '<option value="">— Sin especificar —</option>' +
    formasPago.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');

  if (cliActualId) {
    const c = clientes.find(x=>x.id===cliActualId);
    if (c?.forma_pago_id) fpSel.value = c.forma_pago_id;
  }

  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('pr_fecha').value = hoy;
  const v30 = new Date(); v30.setDate(v30.getDate()+30);
  document.getElementById('pr_valido').value = v30.toISOString().split('T')[0];
  document.getElementById('pr_titulo').value = '';
  document.getElementById('pr_obs').value = '';

  const prSerSel = document.getElementById('pr_serie');
  const prSeries = (series||[]).filter(s => s.tipo === 'presupuesto');
  const prSerUsables = prSeries.length ? prSeries : (series||[]);
  if (prSerUsables.length) {
    prSerSel.innerHTML = prSerUsables.map(s=>`<option value="${s.id}">${s.prefijo||'PRE-'}</option>`).join('');
  } else {
    prSerSel.innerHTML = '<option value="">PRE-</option>';
  }
  document.getElementById('pr_numero').value = await generarNumeroDoc('presupuesto');

  pr_addLinea();
  openModal('mPresupRapido', true);
}

function pr_actualizarCliente(id) {
  const c = clientes.find(x=>x.id===parseInt(id));
  if (c?.forma_pago_id) document.getElementById('pr_fpago').value = c.forma_pago_id;
}

// prIvaDefault is declared in app.js

function pr_addCapitulo() {
  const caps = prLineas.filter(l=>l.tipo==='capitulo').length;
  prLineas.push({tipo:'capitulo', titulo:'Capítulo '+(caps+1)});
  pr_renderLineas();
}

function pr_addLinea() {
  prLineas.push({tipo:'linea', desc:'', cant:1, precio:0, dto:0, iva:prIvaDefault});
  pr_renderLineas();
}

function pr_removeLinea(i) { prLineas.splice(i,1); pr_renderLineas(); }

function pr_updateLinea(i,f,v) {
  prLineas[i][f] = (f==='desc'||f==='titulo') ? v : parseFloat(v)||0;
  pr_renderLineas();
}

function pr_renderLineas() {
  const ivaOpts = (tiposIva||[{porcentaje:21},{porcentaje:10},{porcentaje:4},{porcentaje:0}])
    .map(t=>`<option value="${t.porcentaje}">${t.porcentaje}%</option>`).join('');

  let base=0, ivaT=0;
  let html = '';
  let capBase=0, capIva=0, capActual=-1;

  prLineas.forEach((l,i) => {
    if (l.tipo==='capitulo') {
      if (capActual >= 0) {
        html += `<tr style="background:var(--gris-50)">
          <td colspan="5" style="padding:6px 10px;font-size:11px;color:var(--gris-500);text-align:right;font-weight:600">Subtotal capítulo</td>
          <td style="padding:6px 10px;text-align:right;font-weight:700;font-size:13px;color:var(--azul)">${fmtE(capBase+capIva)}</td>
          <td></td>
        </tr>`;
        capBase=0; capIva=0;
      }
      capActual = i;
      html += `<tr style="background:var(--azul-light);border-top:2px solid var(--azul)">
        <td colspan="6" style="padding:8px 10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px">📁</span>
            <input value="${l.titulo}" placeholder="Nombre del capítulo..."
              onchange="pr_updateLinea(${i},'titulo',this.value)"
              style="font-weight:700;font-size:13px;border:none;outline:none;background:transparent;flex:1;color:var(--azul)">
          </div>
        </td>
        <td style="padding:8px 4px;text-align:center">
          <button onclick="pr_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:14px">✕</button>
        </td>
      </tr>`;
    } else {
      const sub = l.cant*l.precio*(1-(l.dto||0)/100);
      const iv = sub*(l.iva/100);
      base+=sub; ivaT+=iv;
      capBase+=sub; capIva+=iv;
      const ivaOptsFixed = (tiposIva||[{porcentaje:21},{porcentaje:10},{porcentaje:4},{porcentaje:0}])
        .map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('');
      html += `<tr style="border-top:1px solid var(--gris-100)">
        <td style="padding:7px 10px;${capActual>=0?'padding-left:24px':''}">
          <input value="${l.desc}" placeholder="Descripción del concepto..."
            onchange="pr_updateLinea(${i},'desc',this.value)"
            style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent">
        </td>
        <td style="padding:7px 6px;width:70px">
          <input type="number" value="${l.cant}" min="0.01" step="0.01"
            onchange="pr_updateLinea(${i},'cant',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>
        <td style="padding:7px 6px;width:100px">
          <input type="number" value="${l.precio}" min="0" step="0.01"
            onchange="pr_updateLinea(${i},'precio',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>
        <td style="padding:7px 6px;width:70px">
          <input type="number" value="${l.dto||0}" min="0" max="100" step="0.1"
            onchange="pr_updateLinea(${i},'dto',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none">
        </td>
        <td style="padding:7px 6px;width:75px">
          <select onchange="pr_updateLinea(${i},'iva',this.value)"
            style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
            ${ivaOptsFixed}
          </select>
        </td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px;width:100px">${fmtE(sub+iv)}</td>
        <td style="width:32px">
          <button onclick="pr_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:14px;padding:2px 4px">✕</button>
        </td>
      </tr>`;
    }
  });

  if (capActual >= 0 && capBase+capIva > 0) {
    html += `<tr style="background:var(--gris-50)">
      <td colspan="5" style="padding:6px 10px;font-size:11px;color:var(--gris-500);text-align:right;font-weight:600">Subtotal capítulo</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;font-size:13px;color:var(--azul)">${fmtE(capBase+capIva)}</td>
      <td></td>
    </tr>`;
  }

  document.getElementById('pr_lineas').innerHTML = html;
  document.getElementById('pr_base').textContent = fmtE(base);
  document.getElementById('pr_iva_tot').textContent = fmtE(ivaT);
  document.getElementById('pr_total').textContent = fmtE(base+ivaT);
}

async function guardarPresupRapido(estado) {
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
    lineas,
  };
  let error;
  if (editId) {
    datos.estado = estado;
    ({error} = await sb.from('presupuestos').update(datos).eq('id', editId));
  } else {
    datos.estado = estado;
    ({error} = await sb.from('presupuestos').insert(datos));
  }
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mPresupRapido');
  toast(editId ? '📋 Presupuesto actualizado ✓' : (estado==='enviado'?'📋 Presupuesto enviado ✓':'💾 Borrador guardado ✓'),'success');
  if(cliActualId) await abrirFicha(cliActualId);
  await loadPresupuestos();
  loadDashboard();
}

// ═══════════════════════════════════════════════
//  ALBARÁN RÁPIDO
// ═══════════════════════════════════════════════
let abLineas = [];

async function nuevoAlbaranCliActual() {
  abLineas = [];
  document.getElementById('mAlbaranRapido').dataset.editId = '';
  const sel = document.getElementById('ab_cliente');
  sel.innerHTML = '<option value="">— Selecciona cliente —</option>' +
    clientes.map(c=>`<option value="${c.id}" ${c.id===cliActualId?'selected':''}>${c.nombre}</option>`).join('');
  document.getElementById('ab_fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('ab_ref').value = '';
  document.getElementById('ab_obs').value = '';

  const abSerSel = document.getElementById('ab_serie');
  const abSeries = (series||[]).filter(s => s.tipo === 'albaran');
  const abSerUsables = abSeries.length ? abSeries : (series||[]);
  if (abSerUsables.length) {
    abSerSel.innerHTML = abSerUsables.map(s=>`<option value="${s.id}">${s.prefijo||'ALB-'}</option>`).join('');
  } else {
    abSerSel.innerHTML = '<option value="">ALB-</option>';
  }
  document.getElementById('ab_numero').value = await generarNumeroDoc('albaran');
  ab_addLinea();
  openModal('mAlbaranRapido', true);
}

function ab_addLinea() { abLineas.push({desc:'',cant:1,precio:0}); ab_renderLineas(); }
function ab_removeLinea(i) { abLineas.splice(i,1); ab_renderLineas(); }
function ab_updateLinea(i,f,v) { abLineas[i][f]=f==='desc'?v:parseFloat(v)||0; ab_renderLineas(); }

function ab_renderLineas() {
  let total=0;
  document.getElementById('ab_lineas').innerHTML = abLineas.map((l,i)=>{
    const sub=l.cant*l.precio; total+=sub;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 10px"><input value="${l.desc}" placeholder="Descripción..." onchange="ab_updateLinea(${i},'desc',this.value)" style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.cant}" min="0.01" step="0.01" onchange="ab_updateLinea(${i},'cant',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01" onchange="ab_updateLinea(${i},'precio',this.value)" style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(sub)}</td>
      <td><button onclick="ab_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button></td>
    </tr>`;
  }).join('');
  document.getElementById('ab_total').textContent=fmtE(total);
}

async function guardarAlbaran() {
  const clienteId=parseInt(document.getElementById('ab_cliente').value);
  if(!clienteId){toast('Selecciona un cliente','error');return;}
  const lineas=abLineas.filter(l=>l.desc||l.precio>0);
  if(!lineas.length){toast('Añade al menos una línea','error');return;}
  const c=clientes.find(x=>x.id===clienteId);
  let total=0; lineas.forEach(l=>total+=l.cant*l.precio);
  const editId = parseInt(document.getElementById('mAlbaranRapido').dataset.editId);
  const datos = {
    empresa_id:EMPRESA.id, numero:document.getElementById('ab_numero').value,
    cliente_id:clienteId, cliente_nombre:c?.nombre||'',
    fecha:document.getElementById('ab_fecha').value,
    referencia:document.getElementById('ab_ref').value||null,
    total:Math.round(total*100)/100,
    observaciones:document.getElementById('ab_obs').value||null, lineas,
  };
  let error;
  if (editId) {
    ({error} = await sb.from('albaranes').update(datos).eq('id', editId));
  } else {
    datos.estado = 'pendiente';
    ({error} = await sb.from('albaranes').insert(datos));
  }
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mAlbaranRapido');
  toast(editId ? '📄 Albarán actualizado ✓' : '📄 Albarán guardado ✓','success');
  if(cliActualId) await abrirFicha(cliActualId);
  await loadAlbaranes();
  loadDashboard();
}

function nuevoObraCliActual() { nuevoTrabCliActual(); }

function nuevoTrabCliActual() {
  abrirNuevaObra();
  // Pre-seleccionar cliente actual
  const c = clientes.find(x=>x.id===cliActualId);
  if(c) trSeleccionarCliente(c.id);
}

// ═══════════════════════════════════════════════
//  DIRECCIONES Y CONTACTOS
// ═══════════════════════════════════════════════
async function saveDireccion() {
  if(!cliActualId){toast('Abre la ficha de un cliente primero','error');return;}
  const nombre=document.getElementById('dir_nombre').value.trim();
  if(!nombre){toast('Introduce el nombre','error');return;}
  const {error}=await sb.from('direcciones_cliente').insert({
    empresa_id:EMPRESA.id, cliente_id:cliActualId,
    nombre, direccion:v('dir_dir'), municipio:v('dir_muni'),
    cp:v('dir_cp'), provincia:v('dir_prov'),
    es_fiscal:document.getElementById('dir_fiscal').checked
  });
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mDireccion');
  await abrirFicha(cliActualId);
  toast('Dirección añadida ✓','success');
}

async function delDireccion(id) {
  if(!confirm('¿Eliminar dirección?'))return;
  await sb.from('direcciones_cliente').delete().eq('id',id);
  await abrirFicha(cliActualId);
  toast('Eliminada','info');
}

async function saveContacto() {
  if(!cliActualId){toast('Abre la ficha de un cliente primero','error');return;}
  const nombre=document.getElementById('cont_nombre').value.trim();
  if(!nombre){toast('Introduce el nombre','error');return;}
  const {error}=await sb.from('contactos_cliente').insert({
    empresa_id:EMPRESA.id, cliente_id:cliActualId,
    nombre, cargo:v('cont_cargo'), telefono:v('cont_tel'),
    movil:v('cont_movil'), email:v('cont_email'),
    principal:document.getElementById('cont_principal').checked
  });
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mContacto');
  await abrirFicha(cliActualId);
  toast('Contacto añadido ✓','success');
}

async function delContacto(id) {
  if(!confirm('¿Eliminar contacto?'))return;
  await sb.from('contactos_cliente').delete().eq('id',id);
  await abrirFicha(cliActualId);
  toast('Eliminado','info');
}

// ═══════════════════════════════════════════════
//  CRUD CLIENTES
// ═══════════════════════════════════════════════
function editCliente(id) {
  const c = clientes.find(x=>x.id===id); if(!c) return;
  document.getElementById('c_id').value = c.id;
  setVal({c_nombre:c.nombre,c_nif:c.nif||'',c_tel:c.telefono||'',c_movil:c.movil||'',c_email:c.email||'',c_dir:c.direccion_fiscal||'',c_muni:c.municipio_fiscal||'',c_cp:c.cp_fiscal||'',c_prov:c.provincia_fiscal||'',c_descuento:c.descuento_habitual||0,c_notas:c.observaciones||'',c_iban:c.iban||'',c_bic:c.bic||'',c_banco_entidad:c.banco_entidad||'',c_banco_titular:c.banco_titular||''});
  document.getElementById('c_tipo').value = c.tipo||'Particular';
  document.getElementById('mCliTit').textContent = 'Editar Cliente';
  // Validar IBAN si existe
  const ibanEl = document.getElementById('c_iban');
  if (ibanEl && ibanEl.value) validarIBANLive(ibanEl);
  openModal('mCliente', true);
}

async function saveCliente() {
  const nombre = document.getElementById('c_nombre').value.trim();
  if (!nombre) { toast('Introduce el nombre','error'); return; }

  const nif = v('c_nif').trim().toUpperCase();
  const tipo = v('c_tipo');
  if (nif && !validarNIF(nif, tipo)) {
    if (!confirm('El NIF/CIF no parece válido. ¿Guardar igualmente?')) return;
  }

  const id = document.getElementById('c_id').value;
  const obj = {
    empresa_id: EMPRESA.id, nombre, tipo,
    nif: nif || null,
    telefono: v('c_tel'), movil: v('c_movil'), email: v('c_email'),
    direccion_fiscal: v('c_dir'), municipio_fiscal: v('c_muni'),
    cp_fiscal: v('c_cp'), provincia_fiscal: v('c_prov'),
    descuento_habitual: parseFloat(v('c_descuento'))||0,
    observaciones: v('c_notas'),
    iban: v('c_iban').replace(/\s/g,'').toUpperCase() || null,
    bic: v('c_bic').toUpperCase() || null,
    banco_entidad: v('c_banco_entidad') || null,
    banco_titular: v('c_banco_titular') || null
  };
  const fpId = parseInt(document.getElementById('c_fpago').value);
  if (fpId) obj.forma_pago_id = fpId;

  if (id && id !== '') {
    const { error } = await sb.from('clientes').update(obj).eq('id', parseInt(id));
    if (error) { toast('Error al actualizar: '+error.message,'error'); return; }
    registrarAudit('modificar', 'cliente', parseInt(id), 'Editado cliente: '+nombre);
    toast('Cliente actualizado ✓','success');
  } else {
    const { error } = await sb.from('clientes').insert(obj);
    if (error) { toast('Error al guardar: '+error.message,'error'); return; }
    registrarAudit('crear', 'cliente', null, 'Nuevo cliente: '+nombre);
    toast('Cliente guardado ✓','success');
  }
  closeModal('mCliente');
  const { data } = await sb.from('clientes').select('*').eq('empresa_id',EMPRESA.id).order('nombre');
  clientes = data||[];
  cliFiltroList = [...clientes];
  renderClientes(clientes);
  populateSelects();
  loadDashboard();
  _cerrarClienteDesdeDocumento();
  _volverADocumentoConCliente();
}

function checkNIFLive(input) {
  const val = input.value.trim().toUpperCase();
  if (!val) { input.style.borderColor=''; return; }
  const tipo = document.getElementById('c_tipo').value;
  const ok = validarNIF(val, tipo);
  input.style.borderColor = ok ? 'var(--verde)' : (val.length >= 9 ? 'var(--rojo)' : '');
}

function validarNIF(nif, tipo) {
  if (!nif) return true;
  const n = nif.toUpperCase().replace(/\s/g,'');
  if (tipo === 'Empresa') {
    return /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(n);
  } else {
    if (/^\d{8}[A-Z]$/.test(n)) {
      const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
      return n[8] === letras[parseInt(n.slice(0,8)) % 23];
    }
    if (/^[XYZ]\d{7}[A-Z]$/.test(n)) {
      const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
      const num = n.replace('X','0').replace('Y','1').replace('Z','2');
      return n[8] === letras[parseInt(num.slice(0,8)) % 23];
    }
    return false;
  }
}

const CP_PROV = {
  '01':'Álava','02':'Albacete','03':'Alicante','04':'Almería','05':'Ávila',
  '06':'Badajoz','07':'Baleares','08':'Barcelona','09':'Burgos','10':'Cáceres',
  '11':'Cádiz','12':'Castellón','13':'Ciudad Real','14':'Córdoba','15':'La Coruña',
  '16':'Cuenca','17':'Girona','18':'Granada','19':'Guadalajara','20':'Guipúzcoa',
  '21':'Huelva','22':'Huesca','23':'Jaén','24':'León','25':'Lleida',
  '26':'La Rioja','27':'Lugo','28':'Madrid','29':'Málaga','30':'Murcia',
  '31':'Navarra','32':'Ourense','33':'Asturias','34':'Palencia','35':'Las Palmas',
  '36':'Pontevedra','37':'Salamanca','38':'Sta. Cruz de Tenerife','39':'Cantabria',
  '40':'Segovia','41':'Sevilla','42':'Soria','43':'Tarragona','44':'Teruel',
  '45':'Toledo','46':'Valencia','47':'Valladolid','48':'Vizcaya','49':'Zamora',
  '50':'Zaragoza','51':'Ceuta','52':'Melilla'
};

function cpToProvincia(cp, field) {
  if (cp.length >= 2) {
    const prov = CP_PROV[cp.slice(0,2)];
    if (prov) {
      const el = document.getElementById(field);
      if (el && !el.value) el.value = prov;
    }
  }
}

async function buscarEmpresaPorCIF() {
  const cif = v('c_nif').trim().toUpperCase();
  if (!cif) { toast('Introduce primero el CIF','error'); return; }
  toast('Buscando empresa...','info');
  try {
    const res = await fetch('https://api.cnpj.ws/'+cif);
    if (res.ok) {
      const data = await res.json();
      if (data.name) document.getElementById('c_nombre').value = data.name;
    } else {
      toast('No se encontraron datos para ese CIF','info');
    }
  } catch(e) {
    toast('No se pudo conectar con el servicio de búsqueda','info');
  }
}

async function delCliente(id) {
  if(!confirm('¿Eliminar cliente?'))return;
  await sb.from('clientes').delete().eq('id',id);
  clientes=clientes.filter(c=>c.id!==id); renderClientes(clientes); loadDashboard();
  toast('Cliente eliminado','info');
}
