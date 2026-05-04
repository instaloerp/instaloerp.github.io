// ═══════════════════════════════════════════════════════════════════
//  IMPORTADOR DE FACTURAS — Configuración → Facturación
//  Genérico con mapeo manual de columnas. Soporta cualquier export
//  Excel/HTML (incluido el formato SICI).
//  Flujo: 1) subir → 1.5) mapear columnas → 2) preview → 3) importar
// ═══════════════════════════════════════════════════════════════════

// Estado del importador
let _impHdrs = [];           // ['ID', 'COMPAÑIA', ...]  (cabeceras del fichero)
let _impFilas = [];          // Array de arrays con datos crudos por fila
let _impMapping = {};        // { erpField: indexCol, ... }
let _impSICIFacturas = [];          // [{numero, fecha, ...}] tras aplicar mapeo
let _impSICIClientesNuevos = new Map(); // nif → {nombre, direccion_fiscal, ...}

// Campos del ERP que se pueden mapear (label, key, obligatorio, hint para auto-detect)
const ERP_CAMPOS = [
  { key: 'numero',        label: 'Nº Factura *',       req: true,  hints: ['NUMERO FACTURA','Factura','NUM FACTURA'] },
  { key: 'prefijo',       label: 'Prefijo (opcional)', req: false, hints: ['PREFIJO'] },
  { key: 'anio',          label: 'Año (opcional, si nº y año van separados)', req: false, hints: ['AÑO','ANIO'] },
  { key: 'fecha',         label: 'Fecha emisión *',    req: true,  hints: ['FECHA'] },
  { key: 'fecha_cobro',   label: 'Fecha de cobro',     req: false, hints: ['FECHA DE COBRO','Pagado'] },
  { key: 'cobrado',       label: 'Cobrado (SI/NO)',    req: false, hints: ['COBRADO'] },
  { key: 'cliente_nombre',label: 'Nombre cliente *',   req: true,  hints: ['NOMBRE','Destinatario','RAZON SOCIAL','CLIENTE'] },
  { key: 'cliente_nif',   label: 'NIF / CIF cliente',  req: false, hints: ['NIF','CIF Destinatario','CIF'] },
  { key: 'direccion',     label: 'Dirección cliente',  req: false, hints: ['DOMICILIO','DIRECCION'] },
  { key: 'cp',            label: 'CP cliente',         req: false, hints: ['CP'] },
  { key: 'localidad',     label: 'Localidad cliente',  req: false, hints: ['LOCALIDAD','MUNICIPIO','POBLACION'] },
  { key: 'provincia',     label: 'Provincia cliente',  req: false, hints: ['PROVINCIA'] },
  { key: 'base',          label: 'Base imponible',     req: false, hints: ['BASE IMPONIBLE','Total sin IVA','BASE'] },
  { key: 'iva_total',     label: 'IVA total',          req: false, hints: ['IMPORTE IVA','TOTAL IVA'] },
  { key: 'total',         label: 'Total factura *',    req: true,  hints: ['TOTAL FACTURA','TOTAL','IMPORTE TOTAL'] },
  { key: 'tipo_iva',      label: '% IVA aplicado',     req: false, hints: ['TIPO IVA','% IVA','PORCENTAJE IVA'] },
  // Tramos por tipo IVA (para crear líneas con IVA correcto)
  { key: 'bruto21',       label: 'Base al 21%',        req: false, hints: ['IMPORTE BRUTO 21%','BASE 21'] },
  { key: 'bruto10',       label: 'Base al 10%',        req: false, hints: ['IMPORTE BRUTO 10%','BASE 10','IVA 10%'] },
  { key: 'bruto7',        label: 'Base al 7%',         req: false, hints: ['IMPORTE BRUTO 7%','BASE 7'] },
  { key: 'bruto4',        label: 'Base al 4%',         req: false, hints: ['IMPORTE BRUTO 4%','BASE 4'] },
  { key: 'concepto',      label: 'Concepto / Daño',    req: false, hints: ['TIPO DAÑO','TIPO DANO','Daño','Dano','CONCEPTO','DESCRIPCION'] },
  { key: 'expediente',    label: 'Expediente',         req: false, hints: ['EXPEDIENTE'] },
  { key: 'siniestro_dir', label: 'Domicilio siniestro', req: false, hints: ['SINIESTRO DOMICILIO'] },
  { key: 'siniestro_loc', label: 'Localidad siniestro', req: false, hints: ['SINIESTRO LOCALIDAD'] },
  { key: 'abono',         label: 'Es abono (V/N)',     req: false, hints: ['ABONO'] },
  { key: 'id_factura_abonada', label: 'ID factura abonada', req: false, hints: ['ID FACTURA ABONADA'] },
  { key: 'id_sici',       label: 'ID interno (para vincular abonos)', req: false, hints: ['ID FACTURA','ID'] },
  { key: 'observaciones', label: 'Observaciones',      req: false, hints: ['OBSERVACIONES','NOTAS'] },
];

// ─── Helpers ───
function _impParseNum(s) {
  if (s === null || s === undefined || s === '') return 0;
  const txt = String(s).replace('€', '').replace('%','').trim();
  if (txt === '' || txt === 'NaN' || txt === 'nan') return 0;
  if (txt.indexOf(',') >= 0) {
    return parseFloat(txt.replace(/\./g, '').replace(',', '.')) || 0;
  }
  const n = parseInt(txt, 10);
  return isNaN(n) ? 0 : n / 100;
}
function _impParseFecha(s) {
  if (!s) return null;
  const txt = String(s).trim();
  if (txt === '' || txt === '00-00-0000' || txt === '00/00/0000') return null;
  let m = txt.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return txt;
  return null;
}
function _impPrefijo(numero) {
  if (!numero) return '?';
  const m = String(numero).trim().match(/^([A-Z]+)/);
  return m ? m[1] : '?';
}
function _impNorm(x) { return String(x || '').replace(/\s+/g, '').toUpperCase(); }
function _impNormHdr(h) {
  return String(h || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 %]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Letra de columna estilo Excel (A, B, ..., Z, AA, AB, ...)
function _impColLetra(idx) {
  let s = ''; let n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

// ─── PASO 1: Manejar fichero subido → leer y mostrar mapeo ───
async function impSICIHandleFile(file) {
  if (!file) return;
  document.getElementById('impSICIFileName').style.display = '';
  document.getElementById('impSICIFileName').textContent = '⏳ Procesando ' + file.name + '...';
  try {
    const buf = await file.arrayBuffer();
    let html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (/Ã[\x80-\xBF]/.test(html.slice(0, 5000))) {
      html = new TextDecoder('iso-8859-1').decode(buf);
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tabla = doc.querySelector('table');
    if (!tabla) { toast('❌ No se encontró ninguna tabla en el fichero', 'error'); return; }
    const filas = Array.from(tabla.querySelectorAll('tr'));
    if (filas.length < 2) { toast('❌ El fichero está vacío', 'error'); return; }

    // OJO: SICI usa <th> en filas de datos para ciertas columnas. Leer ambos.
    _impHdrs = Array.from(filas[0].querySelectorAll('td, th')).map(c => c.textContent.trim());
    _impFilas = filas.slice(1).map(fr =>
      Array.from(fr.querySelectorAll('td, th')).map(c => c.textContent.trim())
    ).filter(arr => arr.length > 0);

    if (!_impHdrs.length || !_impFilas.length) {
      toast('❌ No se pudieron leer columnas o filas', 'error');
      return;
    }

    // Auto-detección inicial del mapeo
    _impMapping = autoDetectarMapping(_impHdrs);

    // Mostrar paso 1.5 (mapeo)
    document.getElementById('impSICIPaso1').style.display = 'none';
    document.getElementById('impSICIPasoMap').style.display = '';
    document.getElementById('impSICIBtnAplicarMap').style.display = '';
    document.getElementById('impSICIBtnVolver').style.display = '';
    document.getElementById('impSICIBtnImportar').disabled = true;

    renderMapping();
    renderPreviewMuestra();
  } catch (e) {
    console.error('[Import]', e);
    toast('❌ Error procesando fichero: ' + e.message, 'error');
  }
}

// ─── Auto-detección de mapeo basada en cabeceras ───
function autoDetectarMapping(hdrs) {
  const hdrsNorm = hdrs.map(h => _impNormHdr(h));
  const map = {};
  for (const campo of ERP_CAMPOS) {
    let idxFound = -1;
    for (const hint of campo.hints) {
      const hintNorm = _impNormHdr(hint);
      // Coincidencia exacta primero
      idxFound = hdrsNorm.indexOf(hintNorm);
      if (idxFound >= 0) break;
      // Si no, coincidencia parcial
      idxFound = hdrsNorm.findIndex(h => h && h.includes(hintNorm));
      if (idxFound >= 0) break;
    }
    map[campo.key] = idxFound;
  }
  return map;
}

// ─── Renderizar la pantalla de mapeo ───
function renderMapping() {
  const cont = document.getElementById('impMapTabla');
  // Cabecera
  let html = `
    <div style="display:grid;grid-template-columns:1fr 60px 1.5fr;gap:0;background:var(--gris-50);border-bottom:1px solid var(--gris-200);font-size:11px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:.03em">
      <div style="padding:8px 12px">Campo del ERP</div>
      <div style="padding:8px;text-align:center">Excel</div>
      <div style="padding:8px 12px">Columna del fichero</div>
    </div>
  `;
  // Generar opciones de dropdown (todas las columnas + "no mapear")
  const opcionesCols = ['<option value="-1">— No mapear —</option>']
    .concat(_impHdrs.map((h, i) => {
      const letra = _impColLetra(i);
      return `<option value="${i}">${letra}: ${h || '(sin nombre)'}</option>`;
    })).join('');

  for (const campo of ERP_CAMPOS) {
    const sel = _impMapping[campo.key];
    const letraExcel = sel >= 0 ? _impColLetra(sel) : '—';
    const reqStyle = campo.req ? 'color:#DC2626;font-weight:700' : '';
    html += `
      <div style="display:grid;grid-template-columns:1fr 60px 1.5fr;gap:0;border-bottom:1px solid var(--gris-100);align-items:center">
        <div style="padding:8px 12px;font-size:13px;${reqStyle}">${campo.label}</div>
        <div style="padding:6px;text-align:center;font-weight:700;color:var(--azul);font-size:13px">${letraExcel}</div>
        <div style="padding:6px 12px">
          <select onchange="cambiarMapping('${campo.key}', this.value)" style="width:100%;padding:5px 8px;border:1.5px solid var(--gris-200);border-radius:6px;font-size:12px;outline:none">
            ${opcionesCols.replace(`value="${sel}"`, `value="${sel}" selected`)}
          </select>
        </div>
      </div>
    `;
  }
  cont.innerHTML = html;
}

function cambiarMapping(key, valor) {
  _impMapping[key] = parseInt(valor);
  renderMapping(); // re-render para actualizar la letra Excel mostrada
}

// ─── Mostrar muestra de las primeras 3 filas ───
function renderPreviewMuestra() {
  const tbl = document.getElementById('impMapPreview');
  const filas = _impFilas.slice(0, 3);
  let html = '<thead><tr style="background:var(--gris-100)">';
  for (let i = 0; i < _impHdrs.length; i++) {
    html += `<th style="padding:5px 8px;border-bottom:1px solid var(--gris-200);text-align:left;font-size:10px;white-space:nowrap"><span style="color:var(--azul);font-weight:800">${_impColLetra(i)}</span><br/><span style="font-weight:600">${_impHdrs[i] || '—'}</span></th>`;
  }
  html += '</tr></thead><tbody>';
  for (const fila of filas) {
    html += '<tr>';
    for (let i = 0; i < _impHdrs.length; i++) {
      const v = (fila[i] || '').toString().substring(0, 50);
      html += `<td style="padding:4px 8px;border-bottom:1px solid var(--gris-100);font-size:10px;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis">${v}</td>`;
    }
    html += '</tr>';
  }
  tbl.innerHTML = html + '</tbody>';
}

// ─── Aplicar mapeo: construir _impSICIFacturas con la lógica acordada ───
function impSICIAplicarMapeo() {
  // Validación: campos obligatorios
  for (const campo of ERP_CAMPOS) {
    if (campo.req && (_impMapping[campo.key] === undefined || _impMapping[campo.key] < 0)) {
      toast(`❌ Falta mapear el campo obligatorio: ${campo.label.replace('*','').trim()}`, 'error');
      return;
    }
  }
  // Helper para leer celda según mapping
  const get = (fila, key) => {
    const idx = _impMapping[key];
    if (idx === undefined || idx < 0) return '';
    return fila[idx] || '';
  };

  _impSICIFacturas = [];
  _impSICIClientesNuevos = new Map();

  const clientesPorNif = new Map();
  (clientes || []).forEach(c => { if (c.nif) clientesPorNif.set(_impNorm(c.nif), c); });

  // Mapa idSici → numero (para vincular rectificativas)
  const idSiciANumero = new Map();

  for (let i = 0; i < _impFilas.length; i++) {
    const fila = _impFilas[i];
    let numero = get(fila, 'numero');
    if (!numero) continue;
    // Reconstruir número con prefijo si está separado
    const prefMap = get(fila, 'prefijo');
    if (prefMap && !numero.startsWith(prefMap)) numero = prefMap + numero.replace(/^[A-Z]+/,'');
    const fecha = _impParseFecha(get(fila, 'fecha'));
    if (fecha && !numero.includes('/')) numero = numero + '/' + fecha.slice(0,4);

    const idSici = get(fila, 'id_sici');
    if (idSici) idSiciANumero.set(String(idSici), numero);

    const prefijo = _impPrefijo(numero);
    const nif = get(fila, 'cliente_nif');
    const nifNorm = _impNorm(nif);
    const nombre = get(fila, 'cliente_nombre') || '—';
    const totalFact = _impParseNum(get(fila, 'total'));
    const baseImp   = _impParseNum(get(fila, 'base'));
    let totalIva = _impParseNum(get(fila, 'iva_total'));

    // Tramos de IVA
    const bruto21 = _impParseNum(get(fila, 'bruto21'));
    const bruto10 = _impParseNum(get(fila, 'bruto10'));
    const bruto7  = _impParseNum(get(fila, 'bruto7'));
    const bruto4  = _impParseNum(get(fila, 'bruto4'));
    // Si no hay IVA total mapeado pero sí tramos, calcularlo
    if (!totalIva && (bruto21 || bruto10 || bruto7 || bruto4)) {
      totalIva = (bruto21*0.21 + bruto10*0.10 + bruto7*0.07 + bruto4*0.04);
    }

    // Cobrado
    const cobradoTxt = String(get(fila, 'cobrado') || '').toUpperCase().trim();
    const fechaCobroReal = _impParseFecha(get(fila, 'fecha_cobro'));
    let estado;
    if (cobradoTxt === 'SI' || cobradoTxt === 'S' || cobradoTxt === 'TRUE' || cobradoTxt === '1') estado = 'cobrada';
    else if (fechaCobroReal) estado = 'cobrada';
    else estado = 'pendiente';
    // Override Jordi: aseguradoras siempre cobradas
    if (prefijo !== 'JI') estado = 'cobrada';

    // Rectificativa
    const abonoFlag = String(get(fila, 'abono') || '').toUpperCase().trim() === 'V';
    const esRect = abonoFlag || totalFact < 0;
    let rectificaA = null;
    if (esRect) {
      const idAbon = get(fila, 'id_factura_abonada');
      if (idAbon && idAbon !== '0') rectificaA = idAbon;
    }

    // Cliente
    let clienteExist = nifNorm ? clientesPorNif.get(nifNorm) : null;
    let clienteNuevoFlag = false;
    if (!clienteExist && nifNorm) {
      if (!_impSICIClientesNuevos.has(nifNorm)) {
        const cliData = { nombre, nif };
        const dir = get(fila, 'direccion'); if (dir) cliData.direccion_fiscal = dir;
        const cp = get(fila, 'cp');         if (cp)  cliData.cp_fiscal        = cp;
        const loc = get(fila, 'localidad'); if (loc) cliData.municipio_fiscal = loc;
        const prv = get(fila, 'provincia'); if (prv) cliData.provincia_fiscal = prv;
        _impSICIClientesNuevos.set(nifNorm, cliData);
      }
      clienteNuevoFlag = true;
    } else if (!nifNorm) {
      clienteNuevoFlag = !clienteExist;
    }

    // Descripción de línea
    const concepto = get(fila, 'concepto');
    const expediente = get(fila, 'expediente');
    const sinDir = get(fila, 'siniestro_dir');
    const sinLoc = get(fila, 'siniestro_loc');
    const obsTxt = get(fila, 'observaciones');

    let lineaDesc;
    if (prefijo === 'JI') {
      lineaDesc = obsTxt || `Trabajos según expediente ${expediente || ''}`.trim();
    } else {
      const partes = [];
      if (concepto && concepto.toLowerCase() !== 'nan') partes.push(`Reparación daños por ${String(concepto).toLowerCase()}`);
      else partes.push('Reparación de daños');
      if (sinDir) {
        const dirObra = [sinDir, sinLoc].filter(x => x && x.toLowerCase() !== 'nan').join(' — ');
        partes.push(`Domicilio del siniestro: ${dirObra}`);
      }
      if (expediente) partes.push(`Expediente: ${expediente}`);
      lineaDesc = partes.join(' · ');
    }

    // Líneas
    const tramos = [
      { iva: 21, base: bruto21 },
      { iva: 10, base: bruto10 },
      { iva: 7,  base: bruto7 },
      { iva: 4,  base: bruto4 },
    ].filter(t => t.base !== 0);
    const lineas = [];
    if (tramos.length) {
      for (const t of tramos) {
        lineas.push({
          desc: tramos.length > 1 ? `${lineaDesc} (IVA ${t.iva}%)` : lineaDesc,
          cant: 1, precio: t.base, dto1: 0, dto2: 0, dto3: 0, iva: t.iva,
        });
      }
    } else {
      const ivaFB = parseInt(get(fila, 'tipo_iva')) || 21;
      lineas.push({
        desc: lineaDesc, cant: 1, precio: baseImp || totalFact, dto1: 0, dto2: 0, dto3: 0, iva: ivaFB,
      });
    }

    // Forma pago: solo JI → predeterminada (transferencia 15d)
    let fpId = null;
    if (prefijo === 'JI') fpId = parseInt(EMPRESA?.config?.forma_pago_default_id) || null;
    let venc = null;
    if (prefijo === 'JI' && fecha && fpId) {
      const fp = (formasPago || []).find(x => x.id === fpId);
      const dias = fp ? (fp.dias_vencimiento || 15) : 15;
      const d = new Date(fecha);
      d.setDate(d.getDate() + dias);
      venc = d.toISOString().split('T')[0];
    }

    _impSICIFacturas.push({
      _id_sici: idSici,
      numero, prefijo, fecha, fecha_vencimiento: venc,
      cliente_id: clienteExist?.id || null,
      cliente_nif: nif,
      cliente_nombre: nombre,
      cliente_nuevo: clienteNuevoFlag,
      forma_pago_id: fpId,
      estado,
      fecha_cobro: fechaCobroReal,
      es_rectificativa: esRect,
      rectifica_a_idsici: esRect ? rectificaA : null,
      base_imponible: Math.round((bruto21+bruto10+bruto7+bruto4 || baseImp) * 100) / 100,
      total_iva: Math.round(totalIva * 100) / 100,
      total: Math.round(totalFact * 100) / 100,
      lineas,
      observaciones: (obsTxt && obsTxt.toLowerCase() !== 'nan') ? obsTxt : null,
    });
  }

  // Pasada 2: resolver idSici → numero
  for (const f of _impSICIFacturas) {
    if (f.rectifica_a_idsici && idSiciANumero.has(f.rectifica_a_idsici)) {
      f.rectifica_a_numero = idSiciANumero.get(f.rectifica_a_idsici);
    }
  }

  if (!_impSICIFacturas.length) {
    toast('❌ No se pudo extraer ninguna factura con el mapeo dado', 'error');
    return;
  }
  impSICIMostrarPreview();
}

// ─── PASO 2: Mostrar preview ───
function impSICIMostrarPreview() {
  document.getElementById('impSICIPasoMap').style.display = 'none';
  document.getElementById('impSICIPaso2').style.display = '';
  document.getElementById('impSICIBtnAplicarMap').style.display = 'none';
  document.getElementById('impSICIBtnImportar').disabled = false;

  const total = _impSICIFacturas.length;
  const totalImp = _impSICIFacturas.reduce((s, f) => s + f.total, 0);
  const cobradas = _impSICIFacturas.filter(f => f.estado === 'cobrada').length;
  const pendientes = total - cobradas;
  const rects = _impSICIFacturas.filter(f => f.es_rectificativa).length;
  const cliNuevos = _impSICIClientesNuevos.size;
  const conDireccion = Array.from(_impSICIClientesNuevos.values()).filter(c => c.direccion_fiscal).length;

  document.getElementById('impSICIResumen').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;text-align:center">
      <div><div style="font-size:22px;font-weight:800;color:var(--azul)">${total}</div><div style="font-size:11px;color:var(--gris-500)">Facturas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#10B981">${cobradas}</div><div style="font-size:11px;color:var(--gris-500)">Cobradas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#D97706">${pendientes}</div><div style="font-size:11px;color:var(--gris-500)">Pendientes</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#7C3AED">${rects}</div><div style="font-size:11px;color:var(--gris-500)">Rectificativas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#059669">${totalImp.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €</div><div style="font-size:11px;color:var(--gris-500)">Importe total</div></div>
    </div>
    <div style="margin-top:10px;text-align:center;font-size:12px;color:var(--gris-600)">
      ${cliNuevos > 0 ? `🆕 Se crearán <strong>${cliNuevos}</strong> clientes nuevos · ${conDireccion} con dirección completa` : '✅ Todos los clientes ya existen en tu ERP'}
    </div>
  `;
  impSICIRenderTabla(_impSICIFacturas);
}

function impSICIRenderTabla(lista) {
  const tbody = document.getElementById('impSICITbody');
  tbody.innerHTML = lista.slice(0, 200).map(f => {
    const colorEst = f.estado === 'cobrada' ? '#10B981' : '#D97706';
    const tagRect = f.es_rectificativa ? `<span style="display:inline-block;font-size:9px;background:#7C3AED;color:#fff;padding:1px 5px;border-radius:3px;margin-left:4px">RECT</span>` : '';
    const cliNew = f.cliente_nuevo ? `<span style="font-size:11px;color:#D97706;font-weight:700">🆕 Sí</span>` : `<span style="font-size:11px;color:#10B981">Existe</span>`;
    return `<tr style="border-bottom:1px solid var(--gris-100)">
      <td style="padding:6px 10px;font-weight:600">${f.numero}${tagRect}</td>
      <td style="padding:6px 10px">${f.fecha || '—'}</td>
      <td style="padding:6px 10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.cliente_nombre}">${f.cliente_nombre}</td>
      <td style="padding:6px 10px">${f.cliente_nif || '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:600;${f.total<0?'color:#DC2626':''}">${f.total.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €</td>
      <td style="padding:6px 10px"><span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;color:#fff;background:${colorEst}">${f.estado}</span></td>
      <td style="padding:6px 10px">${cliNew}</td>
    </tr>`;
  }).join('') + (lista.length > 200 ? `<tr><td colspan="7" style="padding:10px;text-align:center;color:var(--gris-400);font-size:11px">... y ${lista.length - 200} más</td></tr>` : '');
}

function impSICIFiltrar(txt) {
  const q = (document.getElementById('impSICIBuscar').value || '').toLowerCase();
  const pref = document.getElementById('impSICIFiltroPref').value;
  let lista = _impSICIFacturas;
  if (pref) lista = lista.filter(f => f.prefijo === pref);
  if (q) lista = lista.filter(f =>
    String(f.numero).toLowerCase().includes(q) ||
    String(f.cliente_nombre).toLowerCase().includes(q) ||
    String(f.cliente_nif || '').toLowerCase().includes(q)
  );
  impSICIRenderTabla(lista);
}

function impSICIVolverPaso1() {
  document.getElementById('impSICIPaso1').style.display = '';
  document.getElementById('impSICIPasoMap').style.display = 'none';
  document.getElementById('impSICIPaso2').style.display = 'none';
  document.getElementById('impSICIPaso3').style.display = 'none';
  document.getElementById('impSICIPaso4').style.display = 'none';
  document.getElementById('impSICIBtnImportar').disabled = true;
  document.getElementById('impSICIBtnAplicarMap').style.display = 'none';
  document.getElementById('impSICIBtnVolver').style.display = 'none';
  document.getElementById('impSICIFileName').style.display = 'none';
  document.getElementById('impSICIFile').value = '';
  _impHdrs = []; _impFilas = []; _impMapping = {};
  _impSICIFacturas = []; _impSICIClientesNuevos = new Map();
}

// ─── PASO 3: Importar ───
async function impSICIImportar() {
  if (!_impSICIFacturas.length) return;
  const ok = await confirmModal({
    titulo: 'Importar facturas',
    mensaje: `¿Confirmas la importación de ${_impSICIFacturas.length} facturas y la creación de ${_impSICIClientesNuevos.size} clientes nuevos?`,
    btnOk: 'Importar todo',
  });
  if (!ok) return;

  document.getElementById('impSICIPaso2').style.display = 'none';
  document.getElementById('impSICIPaso3').style.display = '';
  document.getElementById('impSICIBtnImportar').disabled = true;
  document.getElementById('impSICIBtnVolver').style.display = 'none';

  const setProg = (pct, txt, det) => {
    document.getElementById('impSICIProgresoBar').style.width = pct + '%';
    if (txt) document.getElementById('impSICIProgresoTxt').textContent = txt;
    if (det) document.getElementById('impSICIProgresoDetalle').textContent = det;
  };

  const errores = [];
  const stats = { facturasOk: 0, facturasFallo: 0, clientesCreados: 0, omitidas: 0 };

  // 1) Crear clientes nuevos
  setProg(5, 'Creando clientes nuevos...', `${_impSICIClientesNuevos.size} clientes`);
  const cifAId = new Map();
  const clientesACrear = Array.from(_impSICIClientesNuevos.values());
  for (let i = 0; i < clientesACrear.length; i++) {
    const c = clientesACrear[i];
    const obj = { empresa_id: EMPRESA.id, nombre: c.nombre, nif: c.nif };
    if (c.direccion_fiscal) obj.direccion_fiscal = c.direccion_fiscal;
    if (c.cp_fiscal)        obj.cp_fiscal        = c.cp_fiscal;
    if (c.municipio_fiscal) obj.municipio_fiscal = c.municipio_fiscal;
    if (c.provincia_fiscal) obj.provincia_fiscal = c.provincia_fiscal;
    let { data, error } = await sb.from('clientes').insert(obj).select().single();
    if (error && error.message && /column/i.test(error.message)) {
      const min = { empresa_id: EMPRESA.id, nombre: c.nombre, nif: c.nif };
      ({ data, error } = await sb.from('clientes').insert(min).select().single());
    }
    if (error) errores.push(`Cliente ${c.nombre} (${c.nif}): ${error.message}`);
    else if (data) {
      cifAId.set(_impNorm(c.nif), data.id);
      stats.clientesCreados++;
      if (typeof clientes !== 'undefined') clientes.push(data);
    }
    setProg(5 + Math.round((i / Math.max(clientesACrear.length,1)) * 15), 'Creando clientes nuevos...', `${i+1}/${clientesACrear.length}`);
  }

  // 2) Serie por defecto
  let serieId = null;
  const serFact = (series || []).filter(s => s.tipo === 'factura' || s.tipo === 'fact');
  if (serFact.length) serieId = serFact[0].id;

  // 3) Comprobar duplicados
  setProg(22, 'Comprobando duplicados...', '');
  const { data: existentes } = await sb.from('facturas').select('numero').eq('empresa_id', EMPRESA.id);
  const numExistentes = new Set((existentes || []).map(x => x.numero));

  // 4) Insertar facturas
  const totalFx = _impSICIFacturas.length;
  setProg(25, 'Importando facturas...', `0/${totalFx}`);
  for (let i = 0; i < totalFx; i++) {
    const f = _impSICIFacturas[i];
    if (numExistentes.has(f.numero)) { stats.omitidas++; continue; }
    let cliId = f.cliente_id;
    if (!cliId && f.cliente_nif) cliId = cifAId.get(_impNorm(f.cliente_nif));
    const obj = {
      empresa_id: EMPRESA.id,
      numero: f.numero, serie_id: serieId,
      cliente_id: cliId || null, cliente_nombre: f.cliente_nombre,
      fecha: f.fecha, fecha_vencimiento: f.fecha_vencimiento,
      forma_pago_id: f.forma_pago_id,
      base_imponible: f.base_imponible, total_iva: f.total_iva, total: f.total,
      estado: f.estado, observaciones: f.observaciones, lineas: f.lineas,
    };
    let { error } = await sb.from('facturas').insert(obj);
    if (error && error.message && /column/i.test(error.message)) {
      const lite = {...obj}; delete lite.cuenta_id;
      ({ error } = await sb.from('facturas').insert(lite));
    }
    if (error) { errores.push(`${f.numero}: ${error.message}`); stats.facturasFallo++; }
    else stats.facturasOk++;
    if (i % 10 === 0) {
      const pct = 25 + Math.round(((i+1) / totalFx) * 70);
      setProg(pct, 'Importando facturas...', `${i+1}/${totalFx} · ${stats.facturasOk} OK · ${stats.facturasFallo} fallos · ${stats.omitidas} omitidas`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  setProg(100, '¡Importación completa!', '');
  await new Promise(r => setTimeout(r, 400));

  document.getElementById('impSICIPaso3').style.display = 'none';
  document.getElementById('impSICIPaso4').style.display = '';
  const okBg = stats.facturasFallo === 0 ? '#D1FAE5' : '#FEF3C7';
  const okColor = stats.facturasFallo === 0 ? '#065F46' : '#92400E';
  document.getElementById('impSICIResultado').style.background = okBg;
  document.getElementById('impSICIResultado').style.color = okColor;
  document.getElementById('impSICIResultado').innerHTML = `
    <div style="font-size:18px;font-weight:800;margin-bottom:10px">${stats.facturasFallo === 0 ? '✅ Importación completada' : '⚠️ Importación con errores'}</div>
    <div style="font-size:14px;line-height:1.7">
      <div>✓ Facturas creadas: <strong>${stats.facturasOk}</strong></div>
      <div>👥 Clientes creados: <strong>${stats.clientesCreados}</strong></div>
      ${stats.omitidas ? `<div>⏭ Omitidas (ya existían): <strong>${stats.omitidas}</strong></div>` : ''}
      ${stats.facturasFallo ? `<div style="color:#DC2626">✗ Fallos: <strong>${stats.facturasFallo}</strong></div>` : ''}
    </div>
    ${errores.length ? `<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Ver detalle de errores (${errores.length})</summary><pre style="margin-top:8px;font-size:11px;background:rgba(0,0,0,0.05);padding:10px;border-radius:6px;max-height:200px;overflow:auto">${errores.slice(0,50).join('\n')}</pre></details>` : ''}
  `;

  if (typeof loadFacturas === 'function') await loadFacturas();
  if (typeof cargarTodos === 'function') await cargarTodos();
  toast(`✅ ${stats.facturasOk} facturas importadas`, 'success');
}
