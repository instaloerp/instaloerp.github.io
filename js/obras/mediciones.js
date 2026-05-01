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
        <button class="btn btn-ghost btn-sm" onclick="exportarMedicionPDF(${m.id})" title="Exportar PDF">📤</button>
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
      <button class="btn btn-secondary btn-sm" onclick="exportarMedicionPDF(${m.id})">📤 Exportar PDF</button>
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

// ════════════════════════════════════════════════════════════════
// SVG ESQUEMA DE VENTANA (estilo carpintería tipo Crisol — opción A)
// ════════════════════════════════════════════════════════════════
// Genera un SVG técnico de la ventana respetando proporciones reales,
// con cotas en mm a los lados y símbolo de apertura.
// El símbolo de apertura usa la convención: triángulo apuntando a las
// bisagras (3 líneas formando un triángulo cerrado).
function _medSvgVentana(item) {
  const ancho = parseFloat(item.ancho) || 100;       // cm en la BD
  const alto  = parseFloat(item.alto) || 100;
  const apert = (item.tipo_apertura || '').toLowerCase();
  // Lado de las bisagras (default: izquierda) — campo futuro `lado_bisagras`
  const lado = (item.lado_bisagras || 'izquierda').toLowerCase();
  // Convertimos cm a mm para mostrar
  const anchoMm = Math.round(ancho * 10);
  const altoMm  = Math.round(alto * 10);

  // Base del SVG: 200x230 (con margen para cotas). Caja del marco proporcional.
  const SVG_W = 200, SVG_H = 230;
  const PAD_X = 36, PAD_Y = 30;     // margen interno para cotas
  const MAX_W = 110, MAX_H = 160;   // tamaño máx del marco
  // Mantener proporción real
  const ratio = ancho / alto;
  let mw, mh;
  if (ratio > MAX_W / MAX_H) { mw = MAX_W; mh = MAX_W / ratio; }
  else                      { mh = MAX_H; mw = MAX_H * ratio; }
  // Centramos el marco horizontalmente respecto al área de dibujo
  const FX = PAD_X + (MAX_W - mw) / 2;
  const FY = PAD_Y + (MAX_H - mh) / 2;
  const cx = FX + mw / 2;
  const cy = FY + mh / 2;

  // Símbolo de apertura — devuelve líneas SVG según el tipo
  const lineas = [];
  const traz = 'stroke="#1F2937" stroke-width="1" fill="none" stroke-linecap="round"';
  // Punto del eje de bisagras (centro del lado correspondiente)
  let bx, by; // punto al que apuntan las V
  if      (lado === 'derecha')  { bx = FX + mw; by = cy; }
  else if (lado === 'arriba')   { bx = cx; by = FY; }
  else if (lado === 'abajo')    { bx = cx; by = FY + mh; }
  else                          { bx = FX;       by = cy; }   // izquierda por defecto

  if (apert.includes('practicable') || apert.includes('oscilo')) {
    // V apuntando a la bisagra (2 líneas desde las esquinas opuestas).
    // Practicable y oscilo-batiente comparten el mismo símbolo — el texto
    // bajo el dibujo identifica el tipo concreto.
    if (lado === 'izquierda') {
      lineas.push(`<line x1="${FX+mw}" y1="${FY}"    x2="${bx}" y2="${by}" ${traz}/>`);
      lineas.push(`<line x1="${FX+mw}" y1="${FY+mh}" x2="${bx}" y2="${by}" ${traz}/>`);
    } else if (lado === 'derecha') {
      lineas.push(`<line x1="${FX}" y1="${FY}"    x2="${bx}" y2="${by}" ${traz}/>`);
      lineas.push(`<line x1="${FX}" y1="${FY+mh}" x2="${bx}" y2="${by}" ${traz}/>`);
    }
  } else if (apert.includes('abatible') || apert.includes('proyectante')) {
    // Triángulo apuntando al eje inferior (proyectante)
    lineas.push(`<line x1="${FX}"    y1="${FY}" x2="${cx}" y2="${FY+mh}" ${traz}/>`);
    lineas.push(`<line x1="${FX+mw}" y1="${FY}" x2="${cx}" y2="${FY+mh}" ${traz}/>`);
  } else if (apert.includes('corredera')) {
    // Dos rectángulos solapados con flechas indicando deslizamiento
    const midX = FX + mw/2;
    lineas.push(`<line x1="${midX}" y1="${FY}" x2="${midX}" y2="${FY+mh}" ${traz}/>`);
    // flechas hacia el centro
    lineas.push(`<path d="M ${FX+8} ${FY+mh-6} L ${midX-4} ${FY+mh-6} M ${midX-7} ${FY+mh-9} L ${midX-4} ${FY+mh-6} L ${midX-7} ${FY+mh-3}" ${traz}/>`);
    lineas.push(`<path d="M ${FX+mw-8} ${FY+mh-6} L ${midX+4} ${FY+mh-6} M ${midX+7} ${FY+mh-9} L ${midX+4} ${FY+mh-6} L ${midX+7} ${FY+mh-3}" ${traz}/>`);
  } else if (apert.includes('fij')) {
    // Texto FIJO en el centro
    lineas.push(`<text x="${cx}" y="${cy+3}" text-anchor="middle" font-size="10" fill="#1F2937" font-family="monospace" letter-spacing=".5">FIJO</text>`);
  }

  // Cajón de persiana proporcional encima del hueco
  let cajonHtml = '';
  let cotaCajonHtml = '';
  let frameTop = FY;
  if (item.cajon_tipo && item.cajon_tipo !== 'ninguno' && item.cajon_alto_mm) {
    const cajonMm = parseFloat(item.cajon_alto_mm);
    const cajonH = (cajonMm / altoMm) * mh;  // proporcional al alto en mm
    const ny = FY - cajonH - 1;
    cajonHtml = `<rect x="${FX}" y="${ny}" width="${mw}" height="${cajonH}" fill="rgba(120,120,120,.18)" stroke="#1F2937" stroke-width=".7"/>`;
    if (item.cajon_tipo === 'monoblock') {
      cajonHtml += `<line x1="${FX}" y1="${ny}" x2="${FX+mw}" y2="${ny+cajonH}" stroke="#1F2937" stroke-width=".3" stroke-dasharray="1.5,1"/>`;
      cajonHtml += `<line x1="${FX}" y1="${ny+cajonH}" x2="${FX+mw}" y2="${ny}" stroke="#1F2937" stroke-width=".3" stroke-dasharray="1.5,1"/>`;
    }
    // Cota cajón
    cotaCajonHtml = `
      <line x1="${FX+mw+8}" y1="${ny}" x2="${FX+mw+13}" y2="${ny}" stroke="#1F2937" stroke-width=".3"/>
      <line x1="${FX+mw+10}" y1="${ny}" x2="${FX+mw+10}" y2="${FY}" stroke="#1F2937" stroke-width=".3"/>
      <polygon points="${FX+mw+10},${ny} ${FX+mw+8.5},${ny+2} ${FX+mw+11.5},${ny+2}" fill="#1F2937"/>
      <polygon points="${FX+mw+10},${FY} ${FX+mw+8.5},${FY-2} ${FX+mw+11.5},${FY-2}" fill="#1F2937"/>
      <text x="${FX+mw+15}" y="${ny + cajonH/2 + 3}" font-size="6" fill="#1F2937" font-family="monospace">${cajonMm}</text>
    `;
    frameTop = ny;
  }

  // Cota horizontal arriba (ancho)
  const cotaHorizontal = `
    <line x1="${FX}" y1="${frameTop-13}" x2="${FX}" y2="${frameTop-8}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX+mw}" y1="${frameTop-13}" x2="${FX+mw}" y2="${frameTop-8}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX}" y1="${frameTop-10}" x2="${FX+mw}" y2="${frameTop-10}" stroke="#1F2937" stroke-width=".4"/>
    <polygon points="${FX},${frameTop-10} ${FX+3},${frameTop-12} ${FX+3},${frameTop-8}" fill="#1F2937"/>
    <polygon points="${FX+mw},${frameTop-10} ${FX+mw-3},${frameTop-12} ${FX+mw-3},${frameTop-8}" fill="#1F2937"/>
    <text x="${FX+mw/2}" y="${frameTop-15}" text-anchor="middle" font-size="7" fill="#1F2937" font-family="monospace" font-weight="500">${anchoMm}</text>
  `;

  // Cota vertical (alto del hueco — sin cajón)
  const cotaVertical = `
    <line x1="${FX+mw+22}" y1="${FY}" x2="${FX+mw+27}" y2="${FY}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX+mw+22}" y1="${FY+mh}" x2="${FX+mw+27}" y2="${FY+mh}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX+mw+24}" y1="${FY}" x2="${FX+mw+24}" y2="${FY+mh}" stroke="#1F2937" stroke-width=".4"/>
    <polygon points="${FX+mw+24},${FY} ${FX+mw+22},${FY+3} ${FX+mw+26},${FY+3}" fill="#1F2937"/>
    <polygon points="${FX+mw+24},${FY+mh} ${FX+mw+22},${FY+mh-3} ${FX+mw+26},${FY+mh-3}" fill="#1F2937"/>
    <text x="${FX+mw+30}" y="${FY+mh/2+2}" font-size="7" fill="#1F2937" font-family="monospace" font-weight="500">${altoMm}</text>
  `;

  return `
    <svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:170px;height:auto">
      ${cajonHtml}
      <rect x="${FX}" y="${FY}" width="${mw}" height="${mh}" fill="rgba(160,200,230,.35)" stroke="#1F2937" stroke-width="1.2"/>
      ${lineas.join('\n')}
      ${cotaHorizontal}
      ${cotaVertical}
      ${cotaCajonHtml}
    </svg>`;
}

// ════════════════════════════════════════════════════════════════
// EXPORTAR PDF DE LA MEDICIÓN — formato unificado vía html-documento.js
// ════════════════════════════════════════════════════════════════
async function exportarMedicionPDF(id) {
  const m = (id ? _medErpData.find(x => x.id === id) : _medErpActual);
  if (!m) {
    if (typeof toast === 'function') toast('Medición no encontrada', 'error');
    return;
  }
  if (typeof window._imprimirDocumento !== 'function') {
    if (typeof toast === 'function') toast('Generador de PDF no disponible', 'error');
    return;
  }
  const pl = MED_ERP_TIPOS[m.tipo] || MED_ERP_TIPOS.otra;
  const cli = (Array.isArray(clientes) ? clientes : []).find(c => c.id === m.cliente_id);
  const usuario = (typeof todosUsuarios !== 'undefined' && Array.isArray(todosUsuarios))
    ? todosUsuarios.find(u => u.id === m.usuario_id)?.nombre
    : null;
  const items = m.items || [];

  // Sección: items medidos
  const filasItems = items.map((it, i) => {
    const svg = (m.tipo === 'ventanas') ? _medSvgVentana(it) : '';
    const desc = _medErpDescItem(m.tipo, it);
    const ubic = it.ubicacion || it.estancia || '';
    return `
      <div style="display:grid;grid-template-columns:${svg ? '180px' : '0px'} 1fr;gap:14px;padding:10px 0;border-bottom:1px dashed #E5E7EB;page-break-inside:avoid">
        ${svg ? `<div style="display:flex;flex-direction:column;align-items:center">${svg}<div style="font-size:8px;color:#1E40AF;font-weight:500;margin-top:2px;text-transform:uppercase;letter-spacing:.4px">${_medErpEsc((it.tipo_apertura || pl.label).toString())}</div></div>` : ''}
        <div style="font-size:10.5px;line-height:1.55">
          <div style="font-weight:500;color:#111827;font-size:12px;margin-bottom:5px">${i+1}. ${ubic ? _medErpEsc(ubic) : pl.label}</div>
          <div style="color:#374151">${desc}</div>
          ${it.observaciones ? `<div style="margin-top:4px;font-size:10px;color:#6B7280;font-style:italic">${_medErpEsc(it.observaciones)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const seccionItems = {
    titulo: `${pl.label.toUpperCase()} MEDIDOS (${items.length})`,
    html: filasItems || '<div style="padding:14px;text-align:center;color:#6B7280;font-style:italic">Sin items registrados</div>',
    pageBreakBefore: false,
    large: true
  };

  // Sección: notas (si las hay)
  const seccionNotas = m.notas ? {
    titulo: 'NOTAS Y OBSERVACIONES',
    html: `<div style="padding:10px 14px;font-size:11px;color:#374151;line-height:1.55;white-space:pre-wrap">${_medErpEsc(m.notas)}</div>`
  } : null;

  // Construir cfg
  const datos_extra = [
    ['Operario', usuario || '—'],
    ['Tipo', pl.label],
  ];

  const cfg = {
    tipo: 'INFORME DE MEDICIÓN',
    numero: 'MED-' + String(m.id).padStart(6, '0'),
    fecha: m.fecha,
    titulo: pl.label,
    cliente: cli ? {
      id: cli.id,
      nombre: cli.nombre,
      cif: cli.cif_nif,
      direccion: cli.direccion_fiscal,
      cp: cli.cp_fiscal,
      municipio: cli.municipio_fiscal,
      provincia: cli.provincia_fiscal,
      telefono: cli.telefono,
    } : null,
    datos_extra,
    lineas: [],
    secciones_html: [seccionItems, seccionNotas].filter(Boolean),
    documento_id: m.id,
    id: m.id,
  };

  try {
    window._imprimirDocumento(cfg);
  } catch (e) {
    console.error('[exportarMedicionPDF]', e);
    if (typeof toast === 'function') toast('Error al generar PDF: ' + e.message, 'error');
  }
}
