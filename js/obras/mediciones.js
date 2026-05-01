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
  ventanas:     { label:'Carpintería metálica', ico:'🪟', color:'#0891B2' },
  bano:         { label:'Baño',                  ico:'🚿', color:'#7C3AED' },
  suelo:        { label:'Suelo',                 ico:'🟫', color:'#D97706' },
  pintura:      { label:'Pintura',               ico:'🎨', color:'#059669' },
  calefaccion:  { label:'Calefacción',           ico:'🔥', color:'#DC2626' },
  climatizacion:{ label:'Climatización',         ico:'❄️', color:'#0EA5E9' },
  fontaneria:   { label:'Fontanería',            ico:'🚰', color:'#0891B2' },
  electrico:    { label:'Eléctrico',             ico:'⚡', color:'#EAB308' },
  caldera_acs:  { label:'Caldera/ACS',           ico:'🔄', color:'#9333EA' },
  ventilacion:  { label:'Ventilación',           ico:'💨', color:'#06B6D4' },
  puertas:      { label:'Carpintería madera',    ico:'🚪', color:'#92400E' },
  otra:         { label:'Otra',                  ico:'📦', color:'#64748B' },
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
    case 'ventanas': {
      // Modelo nuevo: ancho_mm/alto_mm + hojas[]; legacy: ancho/alto en cm + tipo_apertura
      const aMm = it.ancho_mm ? parseInt(it.ancho_mm) : (it.ancho ? Math.round(parseFloat(it.ancho)*10) : null);
      const hMm = it.alto_mm  ? parseInt(it.alto_mm)  : (it.alto  ? Math.round(parseFloat(it.alto) *10) : null);
      const dim = (aMm && hMm) ? `${aMm}×${hMm} mm` : `${it.ancho||'?'}×${it.alto||'?'} cm`;
      const tipologiaLabel = ({
        'ventana':'Ventana','balconera':'Balconera','puerta-entrada':'Puerta',
        'corredera':'Corredera','elevable':'Elevable'
      })[it.tipologia] || 'Ventana';
      const hojas = Array.isArray(it.hojas) ? it.hojas : [];
      const nh = it.num_hojas || hojas.length || 1;
      const sim = it.hojas_simetricas !== false;
      let hojasTxt = '';
      if (nh > 1) {
        hojasTxt = ` · ${nh} hojas${sim ? ' (sim.)' : ' (asim.)'}`;
      } else if (it.tipo_apertura) {
        hojasTxt = ` · ${e(it.tipo_apertura)}`;
      } else if (hojas[0] && hojas[0].tipo) {
        hojasTxt = ` · ${e(hojas[0].tipo)}`;
      }
      const cajon = it.cajon || (it.cajon_tipo && it.cajon_tipo !== 'ninguno' ? { tipo: it.cajon_tipo, alto_mm: it.cajon_alto_mm } : null);
      const cajonTxt = (cajon && cajon.tipo && cajon.tipo !== 'ninguno')
        ? ` · cajón ${e(cajon.tipo)}${cajon.alto_mm ? ' '+cajon.alto_mm+'mm' : ''}`
        : '';
      const bal = it.balconera || null;
      const balTxt = bal ? [
        bal.umbral && bal.umbral !== 'Estándar' ? `umbral ${e(bal.umbral)}` : '',
        bal.tirador ? `tirador ${e(bal.tirador)}` : '',
        bal.zocalo_mm ? `zócalo ${bal.zocalo_mm}mm` : '',
        bal.fijo_lateral ? 'fijo lateral' : '',
        bal.montante_sup ? 'montante' : '',
      ].filter(Boolean).join(', ') : '';
      const balPrefix = balTxt ? ' · '+balTxt : '';
      const matTxt = it.material ? ' · '+e(it.material) : '';
      const cristalTxt = it.cristal ? ' · '+e(it.cristal) : '';
      const extras = [];
      if (it.mosquitera)  extras.push('mosquitera');
      if (it.vierteaguas) extras.push('vierteaguas');
      if (it.tapajuntas)  extras.push('tapajuntas');
      if (it.premarco)    extras.push('premarco');
      const extrasTxt = extras.length ? ' · '+extras.join(', ') : '';
      const ubicTxt = it.ubicacion ? ' ('+e(it.ubicacion)+')' : '';
      return `${it.cantidad||1}× ${tipologiaLabel} ${dim}${hojasTxt}${cajonTxt}${balPrefix}${matTxt}${cristalTxt}${extrasTxt}${ubicTxt}`;
    }
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
      return `${it.cantidad||1}× ${e(it.elemento||it.tipo||'Carpintería madera')}${it.ancho&&it.alto?' '+it.ancho+'×'+it.alto+' cm':''}${it.material?' · '+e(it.material):''}${it.ubicacion?' ('+e(it.ubicacion)+')':''}`;
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
  // ── Datos: nuevo modelo (ancho_mm/alto_mm + hojas[]) o legacy (cm + tipo_apertura)
  const anchoMm = item.ancho_mm
    ? parseInt(item.ancho_mm)
    : Math.round((parseFloat(item.ancho) || 100) * 10);
  const altoMm = item.alto_mm
    ? parseInt(item.alto_mm)
    : Math.round((parseFloat(item.alto) || 100) * 10);

  // Hojas: nuevo modelo array, o construir 1 hoja desde legacy
  let hojas = Array.isArray(item.hojas) && item.hojas.length ? item.hojas.slice() : null;
  const numHojas = item.num_hojas || (hojas ? hojas.length : 1);
  const simetricas = item.hojas_simetricas !== false;
  if (!hojas) {
    hojas = [{
      tipo: item.tipo_apertura || 'practicable',
      lado_bisagras: item.lado_bisagras || 'izquierda',
      ancho: anchoMm
    }];
  }
  // Asegurar longitud == numHojas
  while (hojas.length < numHojas) hojas.push({ tipo: 'practicable', lado_bisagras: 'izquierda' });
  hojas = hojas.slice(0, numHojas);

  // Calcular anchos de cada hoja en mm
  const anchosHojas = [];
  if (simetricas) {
    const w = anchoMm / numHojas;
    for (let i = 0; i < numHojas; i++) anchosHojas.push(w);
  } else {
    let suma = 0;
    for (let i = 0; i < numHojas; i++) {
      const w = parseFloat(hojas[i].ancho) || (anchoMm / numHojas);
      anchosHojas.push(w);
      suma += w;
    }
    // Si no cuadra el total, escalar proporcionalmente
    if (suma > 0 && Math.abs(suma - anchoMm) > 1) {
      const factor = anchoMm / suma;
      for (let i = 0; i < anchosHojas.length; i++) anchosHojas[i] *= factor;
    }
  }

  // ── Geometría SVG
  const SVG_W = 220, SVG_H = 240;
  const PAD_X = 36, PAD_Y = 32;
  const MAX_W = 130, MAX_H = 160;
  const ratio = anchoMm / altoMm;
  let mw, mh;
  if (ratio > MAX_W / MAX_H) { mw = MAX_W; mh = MAX_W / ratio; }
  else                      { mh = MAX_H; mw = MAX_H * ratio; }
  const FX = PAD_X + (MAX_W - mw) / 2;
  const FY = PAD_Y + (MAX_H - mh) / 2;

  // Cajón de persiana (nuevo modelo: item.cajon, legacy: cajon_tipo/cajon_alto_mm)
  const cajon = item.cajon
    || (item.cajon_tipo && item.cajon_tipo !== 'ninguno'
        ? { tipo: item.cajon_tipo, alto_mm: item.cajon_alto_mm }
        : null);

  let cajonHtml = '';
  let cotaCajonHtml = '';
  let frameTop = FY;
  if (cajon && cajon.tipo && cajon.tipo !== 'ninguno') {
    // Fallback: si el alto no está, asumimos 200 mm (altura estándar)
    const cajonMm = parseFloat(cajon.alto_mm) || 200;
    const cajonH = (cajonMm / altoMm) * mh;
    const ny = FY - cajonH - 1;
    cajonHtml = `<rect x="${FX}" y="${ny}" width="${mw}" height="${cajonH}" fill="rgba(120,120,120,.18)" stroke="#1F2937" stroke-width=".7"/>`;
    if (cajon.tipo === 'monoblock') {
      cajonHtml += `<line x1="${FX}" y1="${ny}" x2="${FX+mw}" y2="${ny+cajonH}" stroke="#1F2937" stroke-width=".3" stroke-dasharray="1.5,1"/>`;
      cajonHtml += `<line x1="${FX}" y1="${ny+cajonH}" x2="${FX+mw}" y2="${ny}" stroke="#1F2937" stroke-width=".3" stroke-dasharray="1.5,1"/>`;
    }
    cotaCajonHtml = `
      <line x1="${FX+mw+8}" y1="${ny}" x2="${FX+mw+13}" y2="${ny}" stroke="#1F2937" stroke-width=".3"/>
      <line x1="${FX+mw+10}" y1="${ny}" x2="${FX+mw+10}" y2="${FY}" stroke="#1F2937" stroke-width=".3"/>
      <polygon points="${FX+mw+10},${ny} ${FX+mw+8.5},${ny+2} ${FX+mw+11.5},${ny+2}" fill="#1F2937"/>
      <polygon points="${FX+mw+10},${FY} ${FX+mw+8.5},${FY-2} ${FX+mw+11.5},${FY-2}" fill="#1F2937"/>
      <text x="${FX+mw+15}" y="${ny + cajonH/2 + 3}" font-size="6" fill="#1F2937" font-family="monospace">${cajonMm}</text>
    `;
    frameTop = ny;
  }

  // ── Símbolo de apertura por hoja
  const traz = 'stroke="#1F2937" stroke-width="1" fill="none" stroke-linecap="round"';
  const lineas = [];
  const divisores = [];

  let xCursor = FX;
  for (let i = 0; i < numHojas; i++) {
    const wHoja = (anchosHojas[i] / anchoMm) * mw;
    const hx = xCursor;
    const hy = FY;
    const hw = wHoja;
    const hh = mh;
    const hcx = hx + hw / 2;
    const hcy = hy + hh / 2;
    const tipoH  = ((hojas[i] && hojas[i].tipo) || '').toLowerCase();
    const ladoH  = ((hojas[i] && hojas[i].lado_bisagras) || 'izquierda').toLowerCase();

    if (tipoH.includes('practicable') || (tipoH.includes('oscilo') && !tipoH.includes('paralela'))) {
      // Convención: las DOS líneas salen de las dos esquinas del lado de las bisagras
      // y convergen en el centro del lado opuesto (ápice = lado de la manilla).
      if (ladoH === 'derecha') {
        // Bisagras a la derecha → líneas desde esquinas derechas, ápice en el centro izquierdo
        lineas.push(`<line x1="${hx+hw}" y1="${hy}"    x2="${hx}" y2="${hcy}" ${traz}/>`);
        lineas.push(`<line x1="${hx+hw}" y1="${hy+hh}" x2="${hx}" y2="${hcy}" ${traz}/>`);
      } else {
        // Bisagras a la izquierda (default) → líneas desde esquinas izquierdas, ápice centro-derecha
        lineas.push(`<line x1="${hx}" y1="${hy}"    x2="${hx+hw}" y2="${hcy}" ${traz}/>`);
        lineas.push(`<line x1="${hx}" y1="${hy+hh}" x2="${hx+hw}" y2="${hcy}" ${traz}/>`);
      }
      // Si es oscilo-batiente, añadir triángulo punteado del eje basculante (inferior)
      if (tipoH.includes('oscilo')) {
        // 2 líneas punteadas desde las esquinas inferiores (eje bisagras inferiores)
        // hacia el centro superior (ápice arriba)
        lineas.push(`<line x1="${hx}"    y1="${hy+hh}" x2="${hcx}" y2="${hy}" stroke="#1F2937" stroke-width=".5" stroke-dasharray="2,1.5" fill="none"/>`);
        lineas.push(`<line x1="${hx+hw}" y1="${hy+hh}" x2="${hcx}" y2="${hy}" stroke="#1F2937" stroke-width=".5" stroke-dasharray="2,1.5" fill="none"/>`);
      }
    } else if (tipoH.includes('paralela')) {
      // Oscilo-paralela (PSK): V invertida + flechas de deslizamiento
      if (ladoH === 'derecha') {
        lineas.push(`<line x1="${hx+hw}" y1="${hy}"    x2="${hx}" y2="${hcy}" ${traz}/>`);
        lineas.push(`<line x1="${hx+hw}" y1="${hy+hh}" x2="${hx}" y2="${hcy}" ${traz}/>`);
      } else {
        lineas.push(`<line x1="${hx}" y1="${hy}"    x2="${hx+hw}" y2="${hcy}" ${traz}/>`);
        lineas.push(`<line x1="${hx}" y1="${hy+hh}" x2="${hx+hw}" y2="${hcy}" ${traz}/>`);
      }
      // Flecha horizontal indicando paralela
      const ay2 = hy + hh - 4;
      lineas.push(`<line x1="${hx+5}" y1="${ay2}" x2="${hx+hw-5}" y2="${ay2}" stroke="#1F2937" stroke-width=".7" stroke-dasharray="2,1.5" fill="none"/>`);
      lineas.push(`<line x1="${hx+hw-5}" y1="${ay2}" x2="${hx+hw-8}" y2="${ay2-2}" stroke="#1F2937" stroke-width=".7" fill="none"/>`);
      lineas.push(`<line x1="${hx+hw-5}" y1="${ay2}" x2="${hx+hw-8}" y2="${ay2+2}" stroke="#1F2937" stroke-width=".7" fill="none"/>`);
    } else if (tipoH.includes('elevable')) {
      // Elevable (HS): flecha horizontal + símbolo lift (flecha arriba pequeña)
      const ay = hy + hh / 2;
      const dir = (i % 2 === 0) ? 1 : -1;
      const x1 = (dir > 0 ? hx + 6      : hx + hw - 6);
      const x2 = (dir > 0 ? hx + hw - 6 : hx + 6     );
      lineas.push(`<line x1="${x1}" y1="${ay}" x2="${x2}" y2="${ay}" ${traz}/>`);
      lineas.push(`<line x1="${x2}" y1="${ay}" x2="${x2 - 3*dir}" y2="${ay-2}" ${traz}/>`);
      lineas.push(`<line x1="${x2}" y1="${ay}" x2="${x2 - 3*dir}" y2="${ay+2}" ${traz}/>`);
      // Símbolo elevación (flecha arriba)
      const sx = hcx, sy = hy + hh - 5;
      lineas.push(`<line x1="${sx}" y1="${sy}" x2="${sx}" y2="${sy-7}" ${traz}/>`);
      lineas.push(`<line x1="${sx}" y1="${sy-7}" x2="${sx-2}" y2="${sy-5}" ${traz}/>`);
      lineas.push(`<line x1="${sx}" y1="${sy-7}" x2="${sx+2}" y2="${sy-5}" ${traz}/>`);
    } else if (tipoH.includes('plegable')) {
      // Plegable (libro): zigzag horizontal indicando pliegues
      const segN = Math.max(3, Math.min(5, Math.round(hw / 8)));
      const segW = hw / segN;
      let path = `M ${hx} ${hy+hh-3}`;
      for (let s = 1; s <= segN; s++) {
        const xp = hx + segW * s;
        const yp = (s % 2 === 0) ? (hy + hh - 3) : (hy + hh/2);
        path += ` L ${xp} ${yp}`;
      }
      lineas.push(`<path d="${path}" ${traz}/>`);
    } else if (tipoH.includes('proyectante')) {
      // Proyectante: bisagras arriba (eje superior) → líneas desde esquinas
      // superiores hacia el centro inferior (ápice abajo, lado de apertura)
      lineas.push(`<line x1="${hx}"    y1="${hy}" x2="${hcx}" y2="${hy+hh}" ${traz}/>`);
      lineas.push(`<line x1="${hx+hw}" y1="${hy}" x2="${hcx}" y2="${hy+hh}" ${traz}/>`);
    } else if (tipoH.includes('abatible')) {
      // Abatible (eje inferior, basculante hacia exterior): bisagras abajo →
      // líneas desde esquinas inferiores hacia el centro superior (ápice arriba)
      const ladoEs = (ladoH === 'arriba');
      if (ladoEs) {
        // Eje superior (igual que proyectante)
        lineas.push(`<line x1="${hx}"    y1="${hy}" x2="${hcx}" y2="${hy+hh}" ${traz}/>`);
        lineas.push(`<line x1="${hx+hw}" y1="${hy}" x2="${hcx}" y2="${hy+hh}" ${traz}/>`);
      } else {
        // Eje inferior (default)
        lineas.push(`<line x1="${hx}"    y1="${hy+hh}" x2="${hcx}" y2="${hy}" ${traz}/>`);
        lineas.push(`<line x1="${hx+hw}" y1="${hy+hh}" x2="${hcx}" y2="${hy}" ${traz}/>`);
      }
    } else if (tipoH.includes('corredera')) {
      // flecha indicando deslizamiento
      const ay = hy + hh - 6;
      const dir = (i % 2 === 0) ? 1 : -1;
      const x1 = (dir > 0 ? hx + 6      : hx + hw - 6);
      const x2 = (dir > 0 ? hx + hw - 6 : hx + 6     );
      lineas.push(`<line x1="${x1}" y1="${ay}" x2="${x2}" y2="${ay}" ${traz}/>`);
      lineas.push(`<line x1="${x2}" y1="${ay}" x2="${x2 - 3*dir}" y2="${ay-2}" ${traz}/>`);
      lineas.push(`<line x1="${x2}" y1="${ay}" x2="${x2 - 3*dir}" y2="${ay+2}" ${traz}/>`);
    } else if (tipoH.includes('fij')) {
      lineas.push(`<text x="${hcx}" y="${hcy+3}" text-anchor="middle" font-size="${numHojas>2?7:9}" fill="#1F2937" font-family="monospace" letter-spacing=".5">FIJO</text>`);
    }

    // Divisor entre hojas (no antes de la primera)
    if (i > 0) {
      divisores.push(`<line x1="${hx}" y1="${FY}" x2="${hx}" y2="${FY+mh}" stroke="#1F2937" stroke-width=".8"/>`);
    }

    xCursor += wHoja;
  }

  // ── Cota horizontal total (arriba)
  const cotaHorizontal = `
    <line x1="${FX}" y1="${frameTop-13}" x2="${FX}" y2="${frameTop-8}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX+mw}" y1="${frameTop-13}" x2="${FX+mw}" y2="${frameTop-8}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX}" y1="${frameTop-10}" x2="${FX+mw}" y2="${frameTop-10}" stroke="#1F2937" stroke-width=".4"/>
    <polygon points="${FX},${frameTop-10} ${FX+3},${frameTop-12} ${FX+3},${frameTop-8}" fill="#1F2937"/>
    <polygon points="${FX+mw},${frameTop-10} ${FX+mw-3},${frameTop-12} ${FX+mw-3},${frameTop-8}" fill="#1F2937"/>
    <text x="${FX+mw/2}" y="${frameTop-15}" text-anchor="middle" font-size="7" fill="#1F2937" font-family="monospace" font-weight="500">${anchoMm}</text>
  `;

  // Cotas parciales por hoja si es asimétrica y >1 hoja
  let cotasHojas = '';
  if (numHojas > 1 && !simetricas) {
    let xc = FX;
    const cy = FY + mh + 8;
    for (let i = 0; i < numHojas; i++) {
      const wHoja = (anchosHojas[i] / anchoMm) * mw;
      cotasHojas += `
        <line x1="${xc}" y1="${cy}" x2="${xc}" y2="${cy+5}" stroke="#1F2937" stroke-width=".3"/>
        <line x1="${xc+wHoja}" y1="${cy}" x2="${xc+wHoja}" y2="${cy+5}" stroke="#1F2937" stroke-width=".3"/>
        <line x1="${xc}" y1="${cy+2.5}" x2="${xc+wHoja}" y2="${cy+2.5}" stroke="#1F2937" stroke-width=".3"/>
        <text x="${xc + wHoja/2}" y="${cy+10}" text-anchor="middle" font-size="6" fill="#1F2937" font-family="monospace">${Math.round(anchosHojas[i])}</text>
      `;
      xc += wHoja;
    }
  }

  // Cota vertical (alto)
  const cotaVertical = `
    <line x1="${FX+mw+22}" y1="${FY}" x2="${FX+mw+27}" y2="${FY}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX+mw+22}" y1="${FY+mh}" x2="${FX+mw+27}" y2="${FY+mh}" stroke="#1F2937" stroke-width=".4"/>
    <line x1="${FX+mw+24}" y1="${FY}" x2="${FX+mw+24}" y2="${FY+mh}" stroke="#1F2937" stroke-width=".4"/>
    <polygon points="${FX+mw+24},${FY} ${FX+mw+22},${FY+3} ${FX+mw+26},${FY+3}" fill="#1F2937"/>
    <polygon points="${FX+mw+24},${FY+mh} ${FX+mw+22},${FY+mh-3} ${FX+mw+26},${FY+mh-3}" fill="#1F2937"/>
    <text x="${FX+mw+30}" y="${FY+mh/2+2}" font-size="7" fill="#1F2937" font-family="monospace" font-weight="500">${altoMm}</text>
  `;

  // Zócalo opaco inferior (balconera/puerta entrada)
  let zocaloHtml = '';
  const bal = item.balconera || null;
  if (bal && bal.zocalo_mm && bal.zocalo_mm > 0) {
    const zMm = parseFloat(bal.zocalo_mm);
    const zH = (zMm / altoMm) * mh;
    const zy = FY + mh - zH;
    zocaloHtml = `<rect x="${FX}" y="${zy}" width="${mw}" height="${zH}" fill="rgba(120,120,120,.3)" stroke="#1F2937" stroke-width=".5"/>`;
    zocaloHtml += `<text x="${FX+mw/2}" y="${zy + zH/2 + 2}" text-anchor="middle" font-size="6" fill="#1F2937" font-family="monospace">opaco ${zMm}</text>`;
  }
  // Umbral inferior (línea más gruesa) si tipologia balconera/puerta-entrada
  let umbralHtml = '';
  if (item.tipologia === 'balconera' || item.tipologia === 'puerta-entrada') {
    umbralHtml = `<line x1="${FX-2}" y1="${FY+mh}" x2="${FX+mw+2}" y2="${FY+mh}" stroke="#1F2937" stroke-width="2"/>`;
  }

  // Calculamos un viewBox que respete el cajón (que se dibuja por encima del marco)
  // y la cota horizontal arriba (frameTop-18). Con cajón el frameTop puede ser negativo.
  const minY = Math.min(0, frameTop - 22);   // 22 = espacio para la cota del ancho
  const vbY  = minY;
  const vbH  = SVG_H - minY;                  // amplía el viewBox hacia arriba

  return `
    <svg viewBox="0 ${vbY} ${SVG_W} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:180px;height:auto">
      ${cajonHtml}
      <rect x="${FX}" y="${FY}" width="${mw}" height="${mh}" fill="rgba(160,200,230,.35)" stroke="#1F2937" stroke-width="1.2"/>
      ${zocaloHtml}
      ${divisores.join('\n')}
      ${lineas.join('\n')}
      ${umbralHtml}
      ${cotaHorizontal}
      ${cotaVertical}
      ${cotaCajonHtml}
      ${cotasHojas}
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
