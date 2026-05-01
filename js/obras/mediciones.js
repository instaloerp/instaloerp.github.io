// ════════════════════════════════════════════════════════════════
// MEDICIONES — vista ERP escritorio (v1, modo lectura)
// ════════════════════════════════════════════════════════════════
// Listado y detalle de mediciones tomadas desde la PWA móvil.
// Edición avanzada se hace todavía desde la app móvil.
// ════════════════════════════════════════════════════════════════

let _medErpData = [];     // mediciones cargadas
let _medErpActual = null; // medición abierta en detalle

// Plantillas de tipos (espejo simplificado de las de la PWA — solo lo que
// necesitamos para listado y descripción de items)
const MED_ERP_TIPOS = {
  ventanas:     { label:'Ventanas',     ico:'🪟', color:'#0891B2' },
  bano:         { label:'Baño',         ico:'🚿', color:'#7C3AED' },
  suelo:        { label:'Suelo',        ico:'🟫', color:'#D97706' },
  pintura:      { label:'Pintura',      ico:'🎨', color:'#059669' },
  calefaccion:  { label:'Calefacción',  ico:'🔥', color:'#DC2626' },
  climatizacion:{ label:'Climatización',ico:'❄️', color:'#0EA5E9' },
  fontaneria:   { label:'Fontanería',   ico:'🚰', color:'#0891B2' },
  electrico:    { label:'Eléctrico',    ico:'⚡', color:'#EAB308' },
  caldera_acs:  { label:'Caldera/ACS',  ico:'🔄', color:'#9333EA' },
  ventilacion:  { label:'Ventilación',  ico:'💨', color:'#06B6D4' },
  puertas:      { label:'Puertas',      ico:'🚪', color:'#92400E' },
  otra:         { label:'Otra',         ico:'📦', color:'#64748B' },
};

async function loadMedicionesERP() {
  if (typeof EMPRESA === 'undefined' || !EMPRESA?.id) return;
  const tbody = document.getElementById('medErpTabla');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gris-400)">Cargando…</td></tr>';
  try {
    const { data, error } = await sb.from('mediciones')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .neq('estado', 'archivado')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    _medErpData = data || [];
    renderMedicionesERP();
  } catch (e) {
    console.error('[mediciones]', e);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#a32d2d">Error: ${e.message}</td></tr>`;
  }
}

function renderMedicionesERP() {
  const tbody = document.getElementById('medErpTabla');
  const count = document.getElementById('medErpCount');
  if (!tbody) return;

  const q = (document.getElementById('medErpSearch')?.value || '').toLowerCase().trim();
  const fEstado = document.getElementById('medErpEstado')?.value || '';
  const fTipo   = document.getElementById('medErpTipo')?.value || '';

  const lista = _medErpData.filter(m => {
    if (fEstado && m.estado !== fEstado) return false;
    if (fTipo && m.tipo !== fTipo) return false;
    if (q) {
      const cli = (Array.isArray(clientes) ? clientes : []).find(c => c.id === m.cliente_id);
      const txt = [
        cli?.nombre, cli?.cif_nif,
        m.titulo, m.notas,
        m.id ? 'med-' + m.id : '',
      ].filter(Boolean).join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  if (count) count.textContent = `${lista.length} medición${lista.length === 1 ? '' : 'es'}`;

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gris-400)">
      <div style="font-size:36px;margin-bottom:6px">📐</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:3px">Sin mediciones</div>
      <div style="font-size:12px">Las mediciones se crean desde la app móvil al visitar al cliente.</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(m => {
    const pl = MED_ERP_TIPOS[m.tipo] || MED_ERP_TIPOS.otra;
    const cli = (Array.isArray(clientes) ? clientes : []).find(c => c.id === m.cliente_id);
    const cliNombre = cli?.nombre || '<span style="color:#9CA3AF;font-style:italic">Sin cliente</span>';
    const usuario = (typeof todosUsuarios !== 'undefined' && Array.isArray(todosUsuarios))
      ? todosUsuarios.find(u => u.id === m.usuario_id)?.nombre
      : null;
    const nItems = (m.items || []).length;
    const fechaTxt = m.fecha ? new Date(m.fecha).toLocaleDateString('es-ES') : '—';
    const estadoBadge = m.estado === 'presupuestado'
      ? '<span class="badge bg-green">Presupuestado</span>'
      : m.estado === 'medido'
      ? '<span class="badge bg-amarillo">Medido</span>'
      : '<span class="badge bg-blue">Borrador</span>';
    const yaPresup = m.estado === 'presupuestado' || m.resultado_id;
    return `<tr style="cursor:pointer" onclick="verMedicionERP(${m.id})">
      <td><span style="display:inline-flex;align-items:center;gap:5px"><span style="font-size:15px">${pl.ico}</span>${pl.label}</span></td>
      <td>${cliNombre}${cli?.cif_nif ? `<div style="font-size:11px;color:var(--gris-400)">${cli.cif_nif}</div>` : ''}</td>
      <td style="color:var(--gris-500)">${fechaTxt}</td>
      <td style="text-align:center;color:var(--gris-500)">${nItems}</td>
      <td>${estadoBadge}</td>
      <td style="font-size:12px;color:var(--gris-500)">${usuario || '—'}</td>
      <td style="text-align:right;white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="verMedicionERP(${m.id})" title="Ver">👁️</button>
        ${!yaPresup && m.cliente_id ? `<button class="btn btn-ghost btn-sm" onclick="generarPresupuestoDesdeMedicion(${m.id})" title="Generar presupuesto">📑</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function medErpFiltrar() {
  renderMedicionesERP();
}

async function verMedicionERP(id) {
  const m = _medErpData.find(x => x.id === id);
  if (!m) return;
  _medErpActual = m;
  if (typeof goPage === 'function') goPage('medicion-detalle');
  // Refresca datos por si cambió desde la app
  try {
    const { data } = await sb.from('mediciones').select('*').eq('id', id).single();
    if (data) _medErpActual = data;
  } catch(_) {}
  renderMedicionDetalleERP();
}

function renderMedicionDetalleERP() {
  const cont = document.getElementById('medErpDetalleCont');
  if (!cont || !_medErpActual) return;
  const m = _medErpActual;
  const pl = MED_ERP_TIPOS[m.tipo] || MED_ERP_TIPOS.otra;
  const cli = (Array.isArray(clientes) ? clientes : []).find(c => c.id === m.cliente_id);
  const usuario = (typeof todosUsuarios !== 'undefined' && Array.isArray(todosUsuarios))
    ? todosUsuarios.find(u => u.id === m.usuario_id)?.nombre
    : null;
  const items = m.items || [];
  const fechaTxt = m.fecha ? new Date(m.fecha).toLocaleDateString('es-ES') : '—';
  const yaPresup = m.estado === 'presupuestado' || m.resultado_id;

  cont.innerHTML = `
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <button class="btn btn-ghost btn-sm" onclick="goPage('mediciones')">← Volver</button>
      <h2 style="margin:0;font-size:18px;font-weight:700;color:var(--gris-700);display:flex;align-items:center;gap:8px">
        <span style="font-size:22px">${pl.ico}</span> ${pl.label}
      </h2>
      <span style="font-size:12px;color:var(--gris-400)">MED-${m.id} · ${fechaTxt}</span>
      <div style="flex:1"></div>
      ${!yaPresup && m.cliente_id ? `<button class="btn btn-primary btn-sm" onclick="generarPresupuestoDesdeMedicion(${m.id})">📑 Generar presupuesto</button>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 320px;gap:14px;align-items:start">

      <div class="card">
        <div class="card-h">
          <h3>Items medidos (${items.length})</h3>
        </div>
        <div class="card-b" style="padding:6px">
          ${items.length === 0
            ? `<div style="text-align:center;padding:30px;color:var(--gris-400);font-size:13px">Sin items registrados todavía.</div>`
            : items.map((it, i) => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border-bottom:1px solid var(--gris-100)">
                <div style="width:30px;height:30px;border-radius:50%;background:${pl.color}15;color:${pl.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${i+1}</div>
                <div style="flex:1;font-size:12.5px;line-height:1.5">
                  ${_medErpDescItem(m.tipo, it)}
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="card">
          <div class="card-b" style="padding:14px 16px">
            <div style="font-size:10.5px;color:var(--gris-400);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Cliente</div>
            ${cli ? `
              <div style="font-weight:700;color:var(--gris-700)">${_medErpEsc(cli.nombre)}</div>
              ${cli.cif_nif ? `<div style="font-size:11.5px;color:var(--gris-500);margin-top:2px">${_medErpEsc(cli.cif_nif)}</div>` : ''}
              ${cli.direccion_fiscal ? `<div style="font-size:11px;color:var(--gris-400);margin-top:3px">📍 ${_medErpEsc(cli.direccion_fiscal)}${cli.municipio_fiscal ? ', ' + _medErpEsc(cli.municipio_fiscal) : ''}</div>` : ''}
            ` : '<div style="font-style:italic;color:var(--gris-400)">Sin cliente asignado</div>'}
          </div>
        </div>

        <div class="card">
          <div class="card-b" style="padding:14px 16px">
            <div style="font-size:10.5px;color:var(--gris-400);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Estado</div>
            <div style="font-size:13px;color:var(--gris-700)">${m.estado || '—'}</div>
            ${usuario ? `<div style="font-size:11px;color:var(--gris-400);margin-top:6px">Operario: ${_medErpEsc(usuario)}</div>` : ''}
            <div style="font-size:11px;color:var(--gris-400)">Fecha: ${fechaTxt}</div>
          </div>
        </div>

        ${m.notas ? `
          <div class="card">
            <div class="card-b" style="padding:14px 16px">
              <div style="font-size:10.5px;color:var(--gris-400);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Notas</div>
              <div style="font-size:12px;color:var(--gris-700);line-height:1.5;white-space:pre-wrap">${_medErpEsc(m.notas)}</div>
            </div>
          </div>
        ` : ''}
      </div>

    </div>
  `;
}

// Descripción legible de un item según su tipo (espejo simplificado de la PWA).
function _medErpDescItem(tipo, it) {
  const e = _medErpEsc;
  switch(tipo) {
    case 'ventanas':
      return `${it.cantidad||1}× Ventana ${it.ancho||'?'}×${it.alto||'?'} cm${it.tipo_apertura?' '+e(it.tipo_apertura):''}${it.material?' · '+e(it.material):''}${it.ubicacion?' ('+e(it.ubicacion)+')':''}`;
    case 'bano':
      return `Baño ${it.metros||'?'} m²${it.reformar?' · '+e(it.reformar):''}${it.ubicacion?' ('+e(it.ubicacion)+')':''}`;
    case 'suelo': {
      const m2 = (it.largo && it.ancho) ? (parseFloat(it.largo)*parseFloat(it.ancho)).toFixed(2)+' m²' : '?';
      return `Suelo ${m2}${it.tipo?' · '+e(it.tipo):''}${it.ubicacion?' ('+e(it.ubicacion)+')':''}`;
    }
    case 'pintura':
      return `Pintura ${it.metros||'?'} m² · ${it.manos||2} manos${it.tipo?' · '+e(it.tipo):''}${it.ubicacion?' ('+e(it.ubicacion)+')':''}`;
    case 'calefaccion':
      return `${e(it.tipo||'Radiador')}${it.estancia?' · '+e(it.estancia):''}${it.m2?' · '+it.m2+' m²':''}${it.combustible?' · '+e(it.combustible):''}`;
    case 'climatizacion':
      return `${e(it.unidad||'Split')}${it.estancia?' · '+e(it.estancia):''}${it.btu?' · '+it.btu+' BTU':''}`;
    case 'fontaneria':
      return `${e(it.punto||'Punto')}${it.ubicacion?' · '+e(it.ubicacion):''}${it.diametro?' · '+e(it.diametro):''}`;
    case 'electrico':
      return `${e(it.circuito||'Circuito')}${it.estancia?' · '+e(it.estancia):''}${it.puntos?' · '+it.puntos+' pts':''}${it.magnetotermico?' · '+e(it.magnetotermico):''}`;
    case 'caldera_acs':
      return `${e(it.tipo||'Caldera')}${it.potencia?' · '+it.potencia+' kW':''}${it.combustible?' · '+e(it.combustible):''}`;
    case 'ventilacion':
      return `${e(it.tipo||'Ventilación')}${it.estancia?' · '+e(it.estancia):''}${it.caudal?' · '+it.caudal+' m³/h':''}`;
    case 'puertas':
      return `Puerta ${e(it.tipo||'')}${it.ancho&&it.alto?' '+it.ancho+'×'+it.alto+' cm':''}${it.ubicacion?' · '+e(it.ubicacion):''}`;
    default:
      return `${it.cantidad||1} ${e(it.unidad||'ud')} · ${e(it.titulo||'(sin concepto)')}`;
  }
}

function _medErpEsc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Generar presupuesto desde una medición (placeholder — la lógica completa
// se hace en la PWA por ahora; aquí mostramos un toast informativo).
function generarPresupuestoDesdeMedicion(id) {
  if (typeof toast === 'function') {
    toast('Por ahora, generar presupuesto se hace desde la app móvil. Próximamente desde el ERP.', 'info', 5000);
  } else {
    alert('Por ahora, generar presupuesto se hace desde la app móvil.');
  }
}
