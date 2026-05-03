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
  pintura:      { label:'Pintura',               ico:'🎨', color:'#059669' },
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
          <h3>Items medidos (${items.filter(it => !it.archivado).length})</h3>
        </div>
        <div class="card-b" style="padding:6px">
          ${(function(){
            const activos = items.filter(it => !it.archivado);
            // Contar archivadas por grupo
            const archivCount = {};
            items.forEach(it => {
              if (it.archivado && it.version_grupo) {
                archivCount[it.version_grupo] = (archivCount[it.version_grupo]||0) + 1;
              }
            });
            if (!activos.length) return `<div style="text-align:center;padding:30px;color:var(--gris-400);font-size:13px">Sin items registrados todavía.</div>`;
            return activos.map((it, n) => {
              const archivados = it.version_grupo ? (archivCount[it.version_grupo]||0) : 0;
              return `
              <div style="border-bottom:1px solid var(--gris-100)">
                <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px">
                  <div style="width:30px;height:30px;border-radius:50%;background:${pl.color}15;color:${pl.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;margin-top:2px">${n+1}</div>
                  <div style="flex:1;font-size:12.5px;line-height:1.5">
                    ${it.validado ? '<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-right:6px">🔒 v'+(it.version||1)+'</span>' : (it.version&&it.version>1?'<span style="background:#F3F4F6;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-right:6px">v'+it.version+'</span>':'')}
                    ${m.tipo === 'bano' ? _medErpDetalleBano(it, true) : _medErpDescItem(m.tipo, it)}
                  </div>
                </div>
                ${archivados ? `<div onclick="_medErpVerHistorial('${it.version_grupo}')" style="padding:6px 12px;border-top:1px dashed var(--gris-200);font-size:11.5px;color:#3B82F6;cursor:pointer;background:#FAFBFC;font-weight:600">📜 ${archivados} versión${archivados>1?'es':''} anterior${archivados>1?'es':''} ›</div>` : ''}
              </div>
            `}).join('');
          })()}
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
    case 'bano': {
      // Soporte tanto modelo nuevo (ancho_mm/largo_mm + bloques) como legacy (metros + reformar)
      const a = it.ancho_mm, l = it.largo_mm, h = it.alto_mm;
      const m2 = it.metros || (a && l ? +((a/1000)*(l/1000)).toFixed(2) : null);
      const dim = (a && l) ? `${a}×${l}${h?'×'+h:''} mm` : (m2 ? `${m2} m²` : '?');
      const partes = [`Baño ${dim}`];
      if (it.alcance)             partes.push(e(it.alcance));
      else if (it.reformar)       partes.push(e(it.reformar));
      if (it.plato)               partes.push(`plato ${it.plato.ancho_mm||'?'}×${it.plato.largo_mm||'?'}${it.plato.tipo?' '+e(it.plato.tipo):''}`);
      if (it.banera)              partes.push(`bañera ${it.banera.tipo||''}`.trim());
      if (it.mampara)             partes.push(`mampara ${e(it.mampara.tipo||'')}`);
      if (it.inodoro)             partes.push(`WC ${e(it.inodoro)}`);
      if (it.ubicacion)           partes.push(`(${e(it.ubicacion)})`);
      return partes.filter(Boolean).join(' · ');
    }
    case 'pintura':
      return `Pintura ${it.metros||'?'} m² · ${it.manos||2} manos${it.tipo?' · '+e(it.tipo):''}${it.ubicacion?' ('+e(it.ubicacion)+')':''}`;
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

// Función PURA: calcula paneles SPC + plan de corte (despiece) por acabado
// Devuelve cortes[]: lista de paneles, cada uno con segmentos (corte, sobrante, reaprovechado)
function _medErpCalcPanelesSpc(paredes, modo) {
  const PANEL_CM = 117.5;
  modo = modo || 'aprovechar';
  const porColor = {};
  paredes.forEach((p, idxOrig) => {
    const a = parseFloat(p.ancho) || 0;
    if (!a) return;
    const c = (p.color || 'Sin acabado').trim() || 'Sin acabado';
    if (!porColor[c]) porColor[c] = { paños: [], pIdx: [], ancho_total: 0 };
    porColor[c].paños.push(a);
    porColor[c].pIdx.push(idxOrig + 1);
    porColor[c].ancho_total += a;
  });
  let total = 0;
  const calcCoste = (aEff) => {
    if (aEff <= 0.01) return { paneles: 0, nuevoSob: 0 };
    const enteros = Math.floor(aEff / PANEL_CM);
    const resto = +(aEff - enteros * PANEL_CM).toFixed(2);
    if (resto < 0.01) return { paneles: enteros, nuevoSob: 0 };
    return { paneles: enteros + 1, nuevoSob: +(PANEL_CM - resto).toFixed(2) };
  };

  // Función auxiliar: añade paneles enteros + recorte final, registra cortes
  const procesarRestoPaño = (aEff, labelPaño, paño_idx, paneles, cortes, sobrantes) => {
    let p = paneles;
    if (aEff <= 0.01) return { paneles: p };
    const enteros = Math.floor(aEff / PANEL_CM);
    const resto = +(aEff - enteros * PANEL_CM).toFixed(2);
    for (let k = 0; k < enteros; k++) {
      p++;
      cortes.push({ panelN: p, segmentos: [{ ancho: PANEL_CM, label: `${labelPaño} (entero)`, tipo: 'corte', paño: paño_idx }] });
    }
    if (resto > 0.01) {
      p++;
      const sob = +(PANEL_CM - resto).toFixed(2);
      const segs = [{ ancho: resto, label: labelPaño, tipo: 'corte', paño: paño_idx }];
      if (sob > 0.01) segs.push({ ancho: sob, label: 'Sobrante', tipo: 'sobrante' });
      cortes.push({ panelN: p, segmentos: segs });
      if (sob > 0.01) sobrantes.push({ ancho: sob, panelN: p, segIdx: 1 });
    }
    return { paneles: p };
  };

  for (const color in porColor) {
    const paños = porColor[color].paños;
    const pIdx = porColor[color].pIdx;
    let paneles = 0;
    const cortes = [];
    const sobrantes = []; // {ancho, panelN, segIdx}

    // Reemplaza un segmento sobrante por reaprovechamiento + desperdicio (si el sobrante era mayor que lo necesario)
    const consumirSobrante = (sob, anchoUsado, paño) => {
      const panelOrig = cortes[sob.panelN - 1];
      if (!panelOrig) return 0;
      const sobranteSegIdx = sob.segIdx;
      const desperdicio = +(sob.ancho - anchoUsado).toFixed(2);
      const labelPaño = `Paño ${paño}`;
      // Sustituir el segmento original por dos: uso real + desperdicio (si lo hay)
      const nuevos = [{ ancho: anchoUsado, label: `Reaprov. → ${labelPaño}`, tipo: 'reaprovechado', paño }];
      if (desperdicio > 0.01) nuevos.push({ ancho: desperdicio, label: 'Desperdicio (recorte)', tipo: 'sobrante' });
      panelOrig.segmentos.splice(sobranteSegIdx, 1, ...nuevos);
      return desperdicio;
    };

    paños.forEach((ancho, i) => {
      const labelPaño = `Paño ${pIdx[i]}`;
      if (modo === 'esteticas') {
        let bestIdx = -1, bestSize = Infinity;
        for (let j = 0; j < sobrantes.length; j++) {
          if (sobrantes[j].ancho >= ancho && sobrantes[j].ancho < bestSize) {
            bestIdx = j; bestSize = sobrantes[j].ancho;
          }
        }
        if (bestIdx >= 0) {
          const sob = sobrantes.splice(bestIdx, 1)[0];
          consumirSobrante(sob, ancho, pIdx[i]);
          return;
        }
        const r = procesarRestoPaño(ancho, labelPaño, pIdx[i], paneles, cortes, sobrantes);
        paneles = r.paneles;
      } else {
        const opciones = [{ ...calcCoste(ancho), idx: -1 }];
        for (let j = 0; j < sobrantes.length; j++) {
          const aEff = +(ancho - sobrantes[j].ancho).toFixed(2);
          opciones.push({ ...calcCoste(aEff), idx: j });
        }
        opciones.sort((a,b) => a.paneles - b.paneles || b.nuevoSob - a.nuevoSob);
        const mejor = opciones[0];
        let aEff = ancho;
        if (mejor.idx >= 0) {
          const sob = sobrantes.splice(mejor.idx, 1)[0];
          // Cuánto del sobrante usamos realmente
          const usadoDelSobrante = Math.min(sob.ancho, ancho);
          consumirSobrante(sob, usadoDelSobrante, pIdx[i]);
          aEff = +(ancho - usadoDelSobrante).toFixed(2);
        }
        const r = procesarRestoPaño(aEff, labelPaño, pIdx[i], paneles, cortes, sobrantes);
        paneles = r.paneles;
      }
    });

    porColor[color].paneles = paneles;
    porColor[color].cortes = cortes;
    porColor[color].sobrantes = sobrantes.map(s => s.ancho);
    total += paneles;
  }
  return { porColor, total, estrategia: modo };
}

// Renderiza HTML visual del despiece (para modal y PDF) — solo 3 colores (leyenda)
function _medErpRenderDespieceSpc(spcCalc) {
  if (!spcCalc || !spcCalc.porColor) return '';
  const PANEL_CM = 117.5;
  // Solo 3 colores que coinciden con la leyenda
  const COLOR_CORTE      = '#3B82F6';   // azul
  const COLOR_REAPROV    = '#FEF3C7';   // amarillo claro
  const COLOR_SOBRANTE   = '#E5E7EB';   // gris
  let html = '';
  for (const acabado in spcCalc.porColor) {
    const d = spcCalc.porColor[acabado];
    if (!d.cortes || !d.cortes.length) continue;
    html += `<div style="margin-bottom:18px">
      <div style="font-weight:700;font-size:13px;color:#0C4A6E;margin-bottom:6px;padding:6px 10px;background:#DBEAFE;border-radius:7px">📋 ${acabado} — ${d.paneles} panel${d.paneles>1?'es':''} · ${d.ancho_total} cm de paño total</div>`;
    d.cortes.forEach(panel => {
      const segs = panel.segmentos.map(seg => {
        const pct = (seg.ancho / PANEL_CM) * 100;
        let bg, txt;
        if (seg.tipo === 'sobrante')        { bg = COLOR_SOBRANTE;  txt = '#374151'; }
        else if (seg.tipo === 'reaprovechado') { bg = COLOR_REAPROV; txt = '#92400E'; }
        else                                 { bg = COLOR_CORTE;    txt = '#fff'; }
        return `<div title="${seg.label} · ${seg.ancho}cm" style="width:${pct}%;background:${bg};color:${txt};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;padding:6px 2px;overflow:hidden;white-space:nowrap;border-right:1px solid #fff">${seg.ancho}cm</div>`;
      }).join('');
      const segsTxt = panel.segmentos.map(seg => `${seg.ancho}cm (${seg.label})`).join(' + ');
      html += `<div style="margin-bottom:6px">
        <div style="font-size:10.5px;color:#374151;font-weight:600;margin-bottom:2px">Panel ${panel.panelN}: ${segsTxt}</div>
        <div style="display:flex;border:1.5px solid #1E40AF;border-radius:5px;overflow:hidden;height:30px;background:#fff">${segs}</div>
      </div>`;
    });
    if (d.sobrantes && d.sobrantes.length) {
      html += `<div style="font-size:10.5px;color:#92400E;margin-top:4px;font-style:italic">⚠ Sobrantes finales: ${d.sobrantes.map(x=>x+'cm').join(', ')} (descartables)</div>`;
    }
  }
  return html;
}

// Modal del despiece (interactivo desde ERP)
function _medErpVerDespiece(itemId) {
  const m = _medErpActual;
  if (!m) return;
  const item = (m.items||[]).find(it => it._uid === itemId);
  if (!item || !item.paredes) return;
  const estrategia = (item.paredes.spc_calc && item.paredes.spc_calc.estrategia) || item.paredes.spc_estrategia || 'aprovechar';
  const calc = _medErpCalcPanelesSpc(item.paredes.paredes_spc || [], estrategia);
  const ov = document.createElement('div');
  ov.id = '_medErpDespieceModal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9100;display:flex;align-items:center;justify-content:center;padding:18px';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:780px;width:100%;max-height:90vh;display:flex;flex-direction:column">
      <div style="padding:14px 18px;border-bottom:1px solid var(--gris-200);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:700;font-size:16px">📋 Despiece de paneles SPC</div>
          <div style="font-size:11px;color:#6B7280">Estrategia: ${estrategia==='esteticas'?'menos uniones':'menos paneles'} · Total: ${calc.total} paneles</div>
        </div>
        <button onclick="document.getElementById('_medErpDespieceModal').remove()" style="background:none;border:none;font-size:22px;color:#9CA3AF;cursor:pointer;line-height:1">✕</button>
      </div>
      <div style="padding:16px 20px;overflow-y:auto;flex:1">
        ${_medErpRenderDespieceSpc(calc)}
        <div style="margin-top:14px;padding:10px;background:#F9FAFB;border-radius:8px;font-size:11px;color:#6B7280">
          <strong>Leyenda:</strong>
          <span style="display:inline-block;width:14px;height:10px;background:#3B82F6;vertical-align:middle;margin:0 4px"></span> corte para paño ·
          <span style="display:inline-block;width:14px;height:10px;background:#FEF3C7;border:1px solid #F59E0B;vertical-align:middle;margin:0 4px"></span> reaprovechado en otro paño ·
          <span style="display:inline-block;width:14px;height:10px;background:#E5E7EB;vertical-align:middle;margin:0 4px"></span> sobrante final
        </div>
      </div>
      <div style="padding:12px 18px;border-top:1px solid var(--gris-200);display:flex;justify-content:flex-end;gap:8px">
        <button onclick="window.print()" style="padding:9px 16px;background:#3B82F6;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">🖨 Imprimir</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// Ver versiones anteriores (archivadas) de un grupo en el ERP
function _medErpVerHistorial(grupo) {
  if (!_medErpActual) return;
  const e = _medErpEsc;
  const items = _medErpActual.items || [];
  const archivadas = items.map((it, i) => ({...it, _idx: i})).filter(it => it.version_grupo === grupo && it.archivado);
  if (!archivadas.length) { if (typeof toast === 'function') toast('No hay versiones anteriores', 'info'); return; }
  archivadas.sort((a,b) => (b.version||1) - (a.version||1));
  const filas = archivadas.map(it => {
    return `<div style="background:#FAFBFC;border:1px solid var(--gris-200);border-radius:10px;margin-bottom:14px;overflow:hidden">
      <div style="padding:10px 14px;background:#F3F4F6;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--gris-200)">
        <span style="background:#fff;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;color:var(--gris-700)">v${it.version||1}</span>
        ${it.validado ? '<span style="background:#D1FAE5;color:#065F46;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700">🔒 validado</span>' : ''}
        <span style="font-size:12.5px;color:var(--gris-500);flex:1">${e(it.ubicacion || 'Baño')}</span>
      </div>
      <div style="padding:14px">${_medErpDetalleBano(it, false)}</div>
    </div>`;
  }).join('');
  const ov = document.createElement('div');
  ov.id = '_medErpHistorialModal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:780px;width:100%;max-height:88vh;display:flex;flex-direction:column">
      <div style="padding:14px 18px;border-bottom:1px solid var(--gris-200);display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:16px">📜 Versiones anteriores (${archivadas.length})</div>
        <button onclick="document.getElementById('_medErpHistorialModal').remove()" style="background:none;border:none;font-size:22px;color:var(--gris-400);cursor:pointer;padding:0;line-height:1">✕</button>
      </div>
      <div style="padding:16px 20px;overflow-y:auto;flex:1">${filas}</div>
    </div>`;
  document.body.appendChild(ov);
}

// Cambiar estrategia desde el detalle ERP (interactivo) — persiste en BD
async function _medErpCambiarEstrategiaSpc(itemId, modo) {
  const m = _medErpActual;
  if (!m) return;
  const item = (m.items || []).find(it => it._uid === itemId);
  if (!item || !item.paredes || !item.paredes.paredes_spc) return;
  // Recalcular
  const calc = _medErpCalcPanelesSpc(item.paredes.paredes_spc, modo);
  item.paredes.spc_calc = calc;
  item.paredes.spc_estrategia = modo;
  // Persistir en BD: guardar el array items completo (sin _uid que es solo para el DOM)
  try {
    const itemsLimpios = (m.items || []).map(it => {
      const { _uid, ...rest } = it;
      return rest;
    });
    const { error } = await sb.from('mediciones').update({ items: itemsLimpios }).eq('id', m.id);
    if (error) throw error;
    if (typeof toast === 'function') toast('Estrategia: ' + (modo==='esteticas'?'menos uniones':'menos paneles'), 'ok', 1500);
  } catch (e) {
    console.error('[mediciones] error al guardar estrategia SPC:', e);
    if (typeof toast === 'function') toast('Error al guardar estrategia', 'error');
  }
  // Re-renderizar el detalle
  renderMedicionDetalleERP();
}

// ════════════════════════════════════════════════════════════════
// DETALLE COMPLETO DE UN BAÑO — todos los bloques (modelo nuevo)
// interactivo=true → muestra botones de estrategia (vista web ERP)
// interactivo=false → vista estática (PDF)
// ════════════════════════════════════════════════════════════════
function _medErpDetalleBano(it, interactivo) {
  const e = _medErpEsc;
  // Asignar id único al item para callbacks (solo en interactivo)
  if (interactivo && !it._uid) it._uid = 'b' + Math.random().toString(36).slice(2, 9);
  const linea = (icon, titulo, valor) =>
    valor ? `<div style="display:flex;gap:6px;padding:3px 0"><span style="width:18px;flex-shrink:0">${icon}</span><span style="font-weight:600;color:#374151;min-width:100px">${titulo}</span><span style="color:#111827;flex:1">${valor}</span></div>` : '';
  const join = arr => arr.filter(Boolean).join(' · ');

  // Mapeo de tipo_trabajo a etiqueta legible
  const tiposLabel = {
    'reforma_completa':    'Reforma completa de baño',
    'cambio_ban_plato':    'Cambio bañera por plato',
    'cambio_plato_ducha':  'Cambio de plato de ducha',
    'sustitucion_sanit':   'Sustitución de sanitarios',
    'cambio_mampara':      'Cambio de mampara',
    'reforma_parcial':     'Reforma parcial (suelos/paredes)',
  };

  // Dimensiones (cm preferido sobre mm; convertir si necesario)
  const aCm = it.ancho_cm != null ? it.ancho_cm : (it.ancho_mm ? Math.round(it.ancho_mm/10) : null);
  const lCm = it.largo_cm != null ? it.largo_cm : (it.largo_mm ? Math.round(it.largo_mm/10) : null);
  const hCm = it.alto_cm  != null ? it.alto_cm  : (it.alto_mm  ? Math.round(it.alto_mm/10)  : null);
  const m2suelo  = (aCm && lCm) ? +((aCm/100)*(lCm/100)).toFixed(2) : null;
  const m2par    = (aCm && lCm && hCm) ? +((2*(aCm+lCm)/100) * (hCm/100)).toFixed(2) : null;
  const dimTxt = (aCm && lCm) ? `${aCm}×${lCm}${hCm?'×'+hCm:''} cm${m2suelo?' · '+m2suelo+' m² suelo':''}${m2par?' · '+m2par+' m² alicat.':''}` : '—';

  let html = `<div style="background:#FAFBFC;border-radius:8px;padding:10px 12px">`;
  html += `<div style="font-size:13px;font-weight:700;color:#1F2937;margin-bottom:6px">${e(it.ubicacion || 'Baño')}</div>`;
  html += `<div style="font-size:11.5px;color:#374151;display:grid;gap:1px">`;

  // Tipo de trabajo
  const trabajoLabel = tiposLabel[it.tipo_trabajo] || (it.alcance || '');
  const trabTxt = join([trabajoLabel, it.alcance_libre, (it.demolicion === 'Sí' || it.demolicion === true) ? 'demolición previa' : '']);
  if (trabTxt) html += linea('🛠️', 'Trabajo', trabTxt);

  // Dimensiones
  html += linea('📐', 'Dimensiones', dimTxt);

  // Instalaciones (al principio según el orden actual)
  if (it.instalaciones) {
    const i = it.instalaciones;
    const arr = [];
    if (i.elec_n)     arr.push(`${i.elec_n} pts. eléctricos`);
    if (Array.isArray(i.iluminacion) && i.iluminacion.length) arr.push(`luz: ${i.iluminacion.map(e).join(', ')}`);
    if (Array.isArray(i.font_puntos) && i.font_puntos.length) arr.push(`fontanería: ${i.font_puntos.map(e).join(', ')}`);
    if (Array.isArray(i.des_puntos)  && i.des_puntos.length)  arr.push(`desagües: ${i.des_puntos.map(e).join(', ')}`);
    // Compat con modelo viejo
    if (i.puntos_luz) arr.push(`${i.puntos_luz} luces`);
    if (i.enchufes)   arr.push(`${i.enchufes} enchufes`);
    if (i.extractor_tipo && i.extractor_tipo !== 'Sin extractor') arr.push(e(i.extractor_tipo));
    if (i.modif_bajantes)   arr.push('modif. bajantes');
    if (i.modif_tomas_agua) arr.push('modif. tomas agua');
    if (arr.length) html += linea('⚡', 'Instalaciones', arr.join(' · '));
  }

  // Pavimento
  if (it.pavimento && it.pavimento.tipo) {
    html += linea('🟫', 'Pavimento', e(it.pavimento.tipo));
  }

  // Paredes (incluye paneles SPC con cálculo + esquineros)
  if (it.paredes) {
    const pa = it.paredes;
    let val = e(pa.tipo || '');
    if (pa.observ) val += (val ? ' · ' : '') + e(pa.observ);
    // Paneles SPC: si hay paredes_spc, SIEMPRE calcular paneles
    // (usa spc_calc guardado si existe; si no, lo calcula al vuelo desde los paños).
    if (Array.isArray(pa.paredes_spc) && pa.paredes_spc.length) {
      const estrategia = (pa.spc_calc && pa.spc_calc.estrategia) || pa.spc_estrategia || 'aprovechar';
      const calc = (pa.spc_calc && pa.spc_calc.porColor)
        ? pa.spc_calc
        : _medErpCalcPanelesSpc(pa.paredes_spc, estrategia);
      const filas = Object.entries(calc.porColor).map(([color, d]) => {
        const sob = (d.sobrantes && d.sobrantes.length) ? ` <span style="color:#92400E">(sobra ${d.sobrantes.map(s=>s+'cm').join(', ')})</span>` : '';
        return `<div style="font-size:10.5px;color:#0C4A6E"> ↳ <strong>${e(color)}</strong>: ${d.ancho_total} cm → <strong>${d.paneles}</strong> panel${d.paneles>1?'es':''}${sob}</div>`;
      }).join('');
      if (filas) val += `<br>${filas}<div style="font-size:10.5px;color:#0C4A6E;font-weight:700;margin-top:1px"> ↳ Total paneles: ${calc.total} (estrategia: ${calc.estrategia==='esteticas'?'menos uniones':'menos paneles'})</div>`;
      // Botones de estrategia + despiece (solo en vista web interactiva)
      if (interactivo) {
        const isAprov = calc.estrategia !== 'esteticas';
        val += `<div style="margin-top:6px;display:flex;gap:5px"><button type="button" onclick="event.stopPropagation();_medErpCambiarEstrategiaSpc('${it._uid}','aprovechar')" style="flex:1;padding:5px;border-radius:6px;font-size:10.5px;font-weight:${isAprov?'700':'500'};border:${isAprov?'2px':'1px'} solid ${isAprov?'#0C4A6E':'#93C5FD'};background:${isAprov?'#DBEAFE':'#fff'};color:#0C4A6E;cursor:pointer">Menos paneles</button><button type="button" onclick="event.stopPropagation();_medErpCambiarEstrategiaSpc('${it._uid}','esteticas')" style="flex:1;padding:5px;border-radius:6px;font-size:10.5px;font-weight:${!isAprov?'700':'500'};border:${!isAprov?'2px':'1px'} solid ${!isAprov?'#0C4A6E':'#93C5FD'};background:${!isAprov?'#DBEAFE':'#fff'};color:#0C4A6E;cursor:pointer">Menos uniones</button><button type="button" onclick="event.stopPropagation();_medErpVerDespiece('${it._uid}')" style="flex:1.2;padding:5px;border-radius:6px;font-size:10.5px;font-weight:700;border:1.5px solid #3B82F6;background:#3B82F6;color:#fff;cursor:pointer">📋 Despiece</button></div>`;
      }
    }
    if (pa.esquineros_n) {
      val += `<br><span style="font-size:10.5px;color:#374151"> ↳ ${pa.esquineros_n} esquineros${pa.esquineros_color?' '+e(pa.esquineros_color).toLowerCase():''}</span>`;
    }
    if (val) html += linea('🧱', 'Paredes', val);
  }

  // Techo
  if (it.techo) {
    const t = it.techo;
    const arr = [];
    if (t.tipo) arr.push(e(t.tipo));
    if (t.pintar === true) arr.push('+ pintar');
    if (arr.length) html += linea('☀️', 'Techo', arr.join(' '));
  }

  // Plato
  if (it.plato) {
    const p = it.plato;
    const aP = p.ancho_cm != null ? p.ancho_cm : (p.ancho_mm ? Math.round(p.ancho_mm/10) : null);
    const lP = p.largo_cm != null ? p.largo_cm : (p.largo_mm ? Math.round(p.largo_mm/10) : null);
    const dim = (aP && lP) ? `${aP}×${lP} cm` : '';
    html += linea('🚿', 'Plato', join([dim, e(p.tipo || ''), p.color ? `color ${e(p.color)}` : '']));
  }

  // Bañera
  if (it.banera) {
    const b = it.banera;
    const lB = b.largo_cm != null ? b.largo_cm : (b.largo_mm ? Math.round(b.largo_mm/10) : null);
    const aB = b.ancho_cm != null ? b.ancho_cm : (b.ancho_mm ? Math.round(b.ancho_mm/10) : null);
    const dim = (lB && aB) ? `${lB}×${aB} cm` : '';
    html += linea('🛁', 'Bañera', join([dim, e(b.tipo||''), e(b.posicion||''), b.hidromasaje === true ? 'hidromasaje' : '']));
  }

  // Mampara (modelo nuevo: uso/posición/configs)
  if (it.mampara) {
    const m = it.mampara;
    const aM = m.ancho_cm != null ? m.ancho_cm : (m.ancho_mm ? Math.round(m.ancho_mm/10) : null);
    const hM = m.alto_cm  != null ? m.alto_cm  : (m.alto_mm  ? Math.round(m.alto_mm/10)  : null);
    const l1 = m.lateral1_cm != null ? m.lateral1_cm : (m.lateral1_mm ? Math.round(m.lateral1_mm/10) : null);
    const l2 = m.lateral2_cm != null ? m.lateral2_cm : (m.lateral2_mm ? Math.round(m.lateral2_mm/10) : null);
    const cabecera = join([e(m.uso||''), e(m.posicion||''), e(m.perfileria||''), hM ? `${hM} cm alto` : 'altura estándar']);
    const dimFrente = aM ? `frente ${aM} cm${m.config_frente?' ('+e(m.config_frente)+')':''}` : (m.config_frente?e(m.config_frente):'');
    const dimL1 = l1 ? `lat1 ${l1} cm${m.config_lat1?' ('+e(m.config_lat1)+')':''}` : (m.config_lat1?e(m.config_lat1):'');
    const dimL2 = l2 ? `lat2 ${l2} cm${m.config_lat2?' ('+e(m.config_lat2)+')':''}` : (m.config_lat2?e(m.config_lat2):'');
    let val = cabecera;
    if (dimFrente) val += `<br><span style="font-size:10.5px"> ↳ ${dimFrente}</span>`;
    if (dimL1)     val += `<br><span style="font-size:10.5px"> ↳ ${dimL1}</span>`;
    if (dimL2)     val += `<br><span style="font-size:10.5px"> ↳ ${dimL2}</span>`;
    // Compat con modelo viejo
    if (!aM && !m.uso && m.tipo) val = join([e(m.tipo), e(m.perfileria||'')]);
    html += linea('🪞', 'Mampara', val);
  }

  // Sanitarios
  const sanArr = [];
  if (it.inodoro) {
    let txt = `WC ${e(it.inodoro)}`;
    if (it.inodoro === 'Suelo') {
      const sub = [];
      if (it.inodoro_tipo)         sub.push(e(it.inodoro_tipo));
      if (it.inodoro_salida)       sub.push(`salida ${e(it.inodoro_salida).toLowerCase()}`);
      if (it.inodoro_alimentacion) sub.push(`alim. ${e(it.inodoro_alimentacion).toLowerCase()}`);
      if (sub.length) txt += ` (${sub.join(', ')})`;
    }
    sanArr.push(txt);
  }
  if (it.lavabo) sanArr.push(`lavabo ${e(it.lavabo)}`);
  if (it.bide)   sanArr.push(`bidé ${e(it.bide)}`);
  if (sanArr.length) html += linea('🚽', 'Sanitarios', sanArr.join(' · '));

  // Grifería
  if (it.griferia) {
    const g = it.griferia;
    const arr = [];
    if (g.ducha)   arr.push(`ducha ${e(g.ducha)}`);
    if (g.lavabo)  arr.push(`lavabo ${e(g.lavabo)}`);
    if (g.acabado) arr.push(`acabado ${e(g.acabado)}`);
    if (arr.length) html += linea('🚰', 'Grifería', arr.join(' · '));
  }

  // Mueble lavabo
  if (it.mueble) {
    const mu = it.mueble;
    const aMu = mu.ancho_cm != null ? mu.ancho_cm : (mu.ancho_mm ? Math.round(mu.ancho_mm/10) : null);
    const fMu = mu.fondo_cm != null ? mu.fondo_cm : (mu.fondo_mm ? Math.round(mu.fondo_mm/10) : null);
    const dim = aMu ? `${aMu}${fMu?'×'+fMu:''} cm` : '';
    const aper = mu.apertura_tipo && mu.apertura_n ? `${mu.apertura_n} ${e(mu.apertura_tipo).toLowerCase()}` : '';
    html += linea('🪟', 'Mueble', join([dim, e(mu.posicion||''), aper, mu.gama ? `gama ${e(mu.gama).toLowerCase()}` : '']));
  }

  // Espejo
  if (it.espejo) {
    const es = it.espejo;
    const aE = es.ancho_cm != null ? es.ancho_cm : (es.ancho_mm ? Math.round(es.ancho_mm/10) : null);
    const hE = es.alto_cm  != null ? es.alto_cm  : (es.alto_mm  ? Math.round(es.alto_mm/10)  : null);
    const dim = (aE && hE) ? `${aE}×${hE} cm` : '';
    const extras = (es.extras && es.extras.length) ? es.extras.map(e).join(', ') : (es.led ? 'LED' : '');
    html += linea('🪞', 'Espejo', join([dim, extras]));
  }

  // Accesorios
  if (Array.isArray(it.accesorios) && it.accesorios.length) {
    html += linea('🪥', 'Accesorios', it.accesorios.map(e).join(', '));
  }
  if (it.acc_observ) {
    html += linea('', '', `<em style="color:#6B7280;font-size:11px">${e(it.acc_observ)}</em>`);
  }

  // Observaciones generales
  if (it.observaciones) {
    html += `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #E5E7EB;font-size:11px;color:#6B7280;font-style:italic">📝 ${e(it.observaciones)}</div>`;
  }

  html += `</div></div>`;
  return html;
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
  // Preferir _medErpActual (siempre tiene los cambios in-memory más recientes)
  // sobre _medErpData (puede estar desactualizado tras cambios de estrategia, etc.)
  let m;
  if (id) {
    if (_medErpActual && _medErpActual.id === id) {
      m = _medErpActual;
    } else {
      m = _medErpData.find(x => x.id === id);
    }
  } else {
    m = _medErpActual;
  }
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
  // Solo items activos (excluir versiones archivadas)
  const items = (m.items || []).filter(it => !it.archivado);

  // Sección: items medidos
  const filasItems = items.map((it, i) => {
    const svg = (m.tipo === 'ventanas') ? _medSvgVentana(it) : '';
    const ubic = it.ubicacion || it.estancia || '';
    // Para baño usamos la vista detallada (todas las secciones) + despiece SPC si aplica
    if (m.tipo === 'bano') {
      let despieceHtml = '';
      const par = it.paredes || {};
      if (par.paredes_spc && par.paredes_spc.length) {
        const estrategia = (par.spc_calc && par.spc_calc.estrategia) || par.spc_estrategia || 'aprovechar';
        const calc = _medErpCalcPanelesSpc(par.paredes_spc, estrategia);
        const dp = _medErpRenderDespieceSpc(calc);
        if (dp) {
          despieceHtml = `<div style="margin-top:12px;padding-top:8px;border-top:2px solid #DBEAFE;page-break-inside:avoid">
            <div style="font-weight:700;font-size:11.5px;color:#0C4A6E;margin-bottom:6px">📋 DESPIECE DE PANELES SPC (${calc.total} paneles · ${estrategia==='esteticas'?'menos uniones':'menos paneles'})</div>
            ${dp}
          </div>`;
        }
      }
      return `
        <div style="padding:10px 0;border-bottom:1px dashed #E5E7EB;page-break-inside:avoid">
          <div style="font-weight:500;color:#111827;font-size:12px;margin-bottom:5px">${i+1}. ${ubic ? _medErpEsc(ubic) : pl.label}</div>
          ${_medErpDetalleBano(it)}
          ${despieceHtml}
        </div>`;
    }
    const desc = _medErpDescItem(m.tipo, it);
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
