// ═══════════════════════════════════════════════════════════════════
//  IMPORTAR HISTÓRICO SICI — Configuración → Facturación
//  Soporta DOS formatos de SICI:
//   • Formato simple (26 cols): listadoBuscadorFacturas
//   • Formato completo (56 cols): facturas.xls — TRAE DOMICILIOS,
//     COBROS REALES, RECTIFICATIVAS VINCULADAS, etc.
// ═══════════════════════════════════════════════════════════════════
let _impSICIFacturas = [];          // [{...}]
let _impSICIClientesNuevos = new Map(); // nif → {nombre, domicilio, cp, ...}
let _impSICIFormato = 'simple';     // 'simple' | 'completo'

// ─── Parser bimodal de números: "6.240,65" o "6822" (céntimos) ───
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

// ─── Parser fecha: DD/MM/AA, DD-MM-AAAA, AAAA-MM-DD → YYYY-MM-DD ───
function _impParseFecha(s) {
  if (!s) return null;
  const txt = String(s).trim();
  if (txt === '' || txt === '00-00-0000' || txt === '00/00/0000') return null;
  // Probar varios formatos
  let m = txt.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); // DD-MM-AAAA o DD/MM/AAAA
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); // DD/MM/AA
  if (m) return `20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/); // AAAA-MM-DD
  if (m) return txt;
  return null;
}

// ─── Detectar prefijo de número de factura ───
function _impPrefijo(numero) {
  if (!numero) return '?';
  const m = String(numero).trim().match(/^([A-Z]+)/);
  return m ? m[1] : '?';
}

// ─── Normalizar NIF para comparación ───
function _impNorm(x) { return String(x || '').replace(/\s+/g, '').toUpperCase(); }

// ─── Normalizar nombre de cabecera (quitar acentos y mayúsculas) ───
function _impNormHdr(h) {
  return String(h || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 %]/g, ' ').replace(/\s+/g, ' ');
}

// ─── Manejar fichero subido ───
async function impSICIHandleFile(file) {
  if (!file) return;
  document.getElementById('impSICIFileName').style.display = '';
  document.getElementById('impSICIFileName').textContent = '⏳ Procesando ' + file.name + '...';
  try {
    // Leer como ArrayBuffer y decodificar manualmente para soportar ISO-8859 y UTF-8
    const buf = await file.arrayBuffer();
    const td = new TextDecoder('utf-8', { fatal: false });
    let html = td.decode(buf);
    // Si el HTML parece tener caracteres mal decodificados (Ã), reintentar con ISO-8859-1
    if (/Ã[\x80-\xBF]/.test(html.slice(0, 5000))) {
      html = new TextDecoder('iso-8859-1').decode(buf);
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tabla = doc.querySelector('table');
    if (!tabla) { toast('❌ No se encontró ninguna tabla en el fichero', 'error'); return; }
    const filas = Array.from(tabla.querySelectorAll('tr'));
    if (filas.length < 2) { toast('❌ El fichero está vacío', 'error'); return; }

    // Cabeceras normalizadas
    const headers = Array.from(filas[0].querySelectorAll('th, td')).map(c => _impNormHdr(c.textContent));
    const idx = (lista) => {
      for (const n of lista) {
        const i = headers.indexOf(_impNormHdr(n));
        if (i >= 0) return i;
      }
      return -1;
    };

    // Detectar formato
    const tieneCompleto = idx(['BASE IMPONIBLE']) >= 0 && idx(['DOMICILIO']) >= 0 && idx(['COBRADO']) >= 0;
    _impSICIFormato = tieneCompleto ? 'completo' : 'simple';

    let COL;
    if (_impSICIFormato === 'completo') {
      COL = {
        id: idx(['ID']),
        compania: idx(['COMPANIA']),
        expediente: idx(['EXPEDIENTE']),
        dano: idx(['TIPO DANO']),
        prefijo: idx(['PREFIJO']),
        numero: idx(['NUMERO FACTURA']),
        fecha: idx(['FECHA']),
        destinatarioTipo: idx(['DESTINATARIO']),
        nombre: idx(['NOMBRE']),
        nif: idx(['NIF']),
        domicilio: idx(['DOMICILIO']),
        cp: idx(['CP']),
        localidad: idx(['LOCALIDAD']),
        provincia: idx(['PROVINCIA']),
        siniestroDom: idx(['SINIESTRO DOMICILIO']),
        siniestroCp: idx(['SINIESTRO CP']),
        siniestroLoc: idx(['SINIESTRO LOCALIDAD']),
        abono: idx(['ABONO']),
        idFactAbon: idx(['ID FACTURA ABONADA']),
        baseImponible: idx(['BASE IMPONIBLE']),
        importeIva: idx(['IMPORTE IVA']),
        totalFactura: idx(['TOTAL FACTURA']),
        cobrado: idx(['COBRADO']),
        fechaCobro: idx(['FECHA DE COBRO']),
        tipoIva: idx(['TIPO IVA']),
        tramitador: idx(['TRAMITADOR']),
        observaciones: idx(['OBSERVACIONES']),
        // Bases por tramo
        bruto4: idx(['IMPORTE BRUTO 4%']),
        bruto7: idx(['IMPORTE BRUTO 7%']),
        bruto10: idx(['IMPORTE BRUTO 10%']),
        bruto21: idx(['IMPORTE BRUTO 21%']),
        iva4:   idx(['IMPORTE IVA 4%']),
        iva7:   idx(['IMPORTE IVA 7%']),
        iva10:  idx(['IMPORTE IVA 10%']),
        iva21:  idx(['IMPORTE IVA 21%']),
      };
    } else {
      COL = {
        numero: idx(['Factura']),
        fecha: idx(['Fecha']),
        nombre: idx(['Destinatario']),
        nif: idx(['CIF Destinatario']),
        asegurado: idx(['Asegurado']),
        expediente: idx(['Expediente']),
        dano: idx(['Daño','Dano']),
        cobrado: idx(['Pagado']),
        baseImponible: idx(['Total sin IVA']),
        bruto21: idx(['IVA 21%']),
        iva21: idx(['Total 21%']),
        bruto10: idx(['IVA 10%']),
        iva10: idx(['Total 10%']),
        totalFactura: idx(['Total Factura']),
        observaciones: idx(['Observaciones']),
      };
    }

    if (COL.numero < 0 || COL.fecha < 0 || COL.totalFactura < 0) {
      toast('❌ Cabeceras no reconocidas. ¿Es un export válido de SICI?', 'error');
      console.warn('Headers detectados:', headers);
      return;
    }

    _impSICIFacturas = [];
    _impSICIClientesNuevos = new Map();

    // Mapa de ID interno SICI → numero (para vincular rectificativas)
    const idSiciANumero = new Map();

    // Existentes en ERP
    const clientesPorNif = new Map();
    (clientes || []).forEach(c => { if (c.nif) clientesPorNif.set(_impNorm(c.nif), c); });

    for (let i = 1; i < filas.length; i++) {
      const celdas = Array.from(filas[i].querySelectorAll('td')).map(c => c.textContent.trim());
      if (celdas.length === 0) continue;

      // Construir número completo: en formato completo viene "ASI98" + año aparte → reconstruir "ASI98/2026"
      let numero = celdas[COL.numero] || '';
      if (_impSICIFormato === 'completo' && COL.prefijo >= 0) {
        const pref = celdas[COL.prefijo];
        // Si NUMERO FACTURA ya empieza por el prefijo, usarlo tal cual; si no, anteponerlo
        if (pref && !numero.startsWith(pref)) numero = pref + numero.replace(/^[A-Z]+/,'');
      }
      const fecha = _impParseFecha(celdas[COL.fecha]);
      // Año desde la fecha → para añadir al número si no lo tiene
      if (fecha && !numero.includes('/')) numero = numero + '/' + fecha.slice(0,4);
      if (!numero) continue;

      const idSici = _impSICIFormato === 'completo' && COL.id >= 0 ? celdas[COL.id] : null;
      if (idSici) idSiciANumero.set(String(idSici), numero);

      const prefijo = _impPrefijo(numero);
      const nif = celdas[COL.nif] || null;
      const nifNorm = _impNorm(nif);
      const nombre = celdas[COL.nombre] || '—';
      const totalFact = _impParseNum(celdas[COL.totalFactura]);
      const baseImp   = _impParseNum(celdas[COL.baseImponible]);
      // IVA total: completo lo trae directo; simple suma 21+10
      let totalIva = 0;
      if (_impSICIFormato === 'completo' && COL.importeIva >= 0) {
        totalIva = _impParseNum(celdas[COL.importeIva]);
      } else {
        if (COL.iva21 >= 0) totalIva += _impParseNum(celdas[COL.iva21]);
        if (COL.iva10 >= 0) totalIva += _impParseNum(celdas[COL.iva10]);
      }

      // Cobro: COBRADO=SI/NO + FECHA DE COBRO (formato completo). En simple solo Pagado=fecha o NaN
      let estado;
      let fechaCobroReal = null;
      if (_impSICIFormato === 'completo') {
        const cob = (celdas[COL.cobrado] || '').toUpperCase().trim();
        fechaCobroReal = _impParseFecha(celdas[COL.fechaCobro]);
        estado = (cob === 'SI' || cob === 'S') ? 'cobrada' : 'pendiente';
        // Decisión Jordi: aseguradoras todas cobradas, JI según realidad
        if (prefijo !== 'JI') estado = 'cobrada';
      } else {
        const pagada = !!celdas[COL.cobrado];
        estado = (prefijo !== 'JI') ? 'cobrada' : (pagada ? 'cobrada' : 'pendiente');
      }

      // Rectificativa
      const esRectFmt = _impSICIFormato === 'completo'
        ? (celdas[COL.abono] || '').toUpperCase().trim() === 'V'
        : (prefijo === 'AASI' || prefijo === 'AAXA');
      const esRect = esRectFmt || totalFact < 0;
      let rectificaA = null;
      if (esRect && _impSICIFormato === 'completo' && COL.idFactAbon >= 0) {
        const idAbon = celdas[COL.idFactAbon];
        if (idAbon && idAbon !== '0') rectificaA = idAbon; // se resuelve a número en pasada 2
      } else if (esRect && _impSICIFormato === 'simple') {
        const obs = celdas[COL.observaciones] || '';
        const m = obs.match(/(?:DE\s+)?([A-Z]+\s*\d+\/\d{4})/i);
        if (m) rectificaA = m[1].replace(/\s+/g, '');
      }

      // Cliente: ¿existe?
      let clienteExist = nifNorm ? clientesPorNif.get(nifNorm) : null;
      let clienteNuevoFlag = false;
      if (!clienteExist && nifNorm) {
        if (!_impSICIClientesNuevos.has(nifNorm)) {
          // Datos del cliente (con todo lo que tengamos)
          const cliData = { nombre, nif };
          if (_impSICIFormato === 'completo') {
            if (celdas[COL.domicilio]) cliData.direccion = celdas[COL.domicilio];
            if (celdas[COL.cp]) cliData.cp = celdas[COL.cp];
            if (celdas[COL.localidad]) cliData.municipio = celdas[COL.localidad];
            if (celdas[COL.provincia]) cliData.provincia = celdas[COL.provincia];
          }
          _impSICIClientesNuevos.set(nifNorm, cliData);
        }
        clienteNuevoFlag = true;
      } else if (!nifNorm) {
        clienteNuevoFlag = !clienteExist;
      }

      // Construir descripción de línea
      const asegurado = _impSICIFormato === 'completo' ? '' : (COL.asegurado >= 0 ? celdas[COL.asegurado] : '');
      const expediente = COL.expediente >= 0 ? celdas[COL.expediente] : '';
      const dano = COL.dano >= 0 ? celdas[COL.dano] : '';
      const sinDom = _impSICIFormato === 'completo' && COL.siniestroDom >= 0 ? celdas[COL.siniestroDom] : '';
      const sinLoc = _impSICIFormato === 'completo' && COL.siniestroLoc >= 0 ? celdas[COL.siniestroLoc] : '';
      const obsSici = COL.observaciones >= 0 ? celdas[COL.observaciones] : '';

      let lineaDesc;
      if (prefijo === 'JI') {
        lineaDesc = obsSici && obsSici !== 'nan' ? obsSici : `Trabajos según expediente ${expediente || ''}`.trim();
      } else {
        const partes = [];
        if (dano && dano !== 'nan') partes.push(`Reparación daños por ${String(dano).toLowerCase()}`);
        else partes.push('Reparación de daños');
        if (sinDom && sinDom !== 'nan') {
          const dirObra = [sinDom, sinLoc].filter(x => x && x !== 'nan').join(' — ');
          partes.push(`Domicilio del siniestro: ${dirObra}`);
        }
        if (expediente && expediente !== 'nan') partes.push(`Expediente: ${expediente}`);
        lineaDesc = partes.join(' · ');
      }

      // Construir líneas a partir de los tramos de IVA
      const lineas = [];
      const tramos = [
        { iva: 21, base: COL.bruto21 >= 0 ? _impParseNum(celdas[COL.bruto21]) : 0 },
        { iva: 10, base: COL.bruto10 >= 0 ? _impParseNum(celdas[COL.bruto10]) : 0 },
        { iva:  7, base: COL.bruto7  >= 0 ? _impParseNum(celdas[COL.bruto7])  : 0 },
        { iva:  4, base: COL.bruto4  >= 0 ? _impParseNum(celdas[COL.bruto4])  : 0 },
      ].filter(t => t.base !== 0);
      if (tramos.length) {
        for (const t of tramos) {
          lineas.push({
            desc: tramos.length > 1 ? `${lineaDesc} (IVA ${t.iva}%)` : lineaDesc,
            cant: 1, precio: t.base, dto1: 0, dto2: 0, dto3: 0, iva: t.iva,
          });
        }
      } else {
        // Fallback: una línea con la base total e IVA del campo TIPO IVA o 21
        const ivaFallback = (_impSICIFormato === 'completo' && COL.tipoIva >= 0)
          ? (parseInt(celdas[COL.tipoIva]) || 21) : 21;
        lineas.push({
          desc: lineaDesc, cant: 1, precio: baseImp || totalFact, dto1: 0, dto2: 0, dto3: 0, iva: ivaFallback,
        });
      }

      // Forma de pago: JI → Transferencia 15d (predeterminada); Resto → null
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
        _orig_idx: i,
        numero, prefijo, fecha, fecha_vencimiento: venc,
        cliente_id: clienteExist?.id || null,
        cliente_nif: nif,
        cliente_nombre: nombre,
        cliente_nuevo: clienteNuevoFlag,
        forma_pago_id: fpId,
        estado,
        fecha_cobro: fechaCobroReal,
        es_rectificativa: esRect,
        rectifica_a_idsici: esRect && _impSICIFormato === 'completo' ? rectificaA : null,
        rectifica_a_numero: esRect && _impSICIFormato === 'simple' ? rectificaA : null,
        base_imponible: Math.round(baseImp * 100) / 100,
        total_iva: Math.round(totalIva * 100) / 100,
        total: Math.round(totalFact * 100) / 100,
        lineas,
        observaciones: (obsSici && obsSici !== 'nan') ? obsSici : null,
      });
    }

    // Pasada 2: resolver rectificativas (id sici → numero)
    for (const f of _impSICIFacturas) {
      if (f.rectifica_a_idsici && idSiciANumero.has(f.rectifica_a_idsici)) {
        f.rectifica_a_numero = idSiciANumero.get(f.rectifica_a_idsici);
      }
    }

    if (!_impSICIFacturas.length) {
      toast('❌ No se pudo extraer ninguna factura', 'error');
      return;
    }
    impSICIMostrarPreview();
  } catch (e) {
    console.error('[ImportSICI]', e);
    toast('❌ Error procesando fichero: ' + e.message, 'error');
  }
}

// ─── Mostrar preview con todas las facturas ───
function impSICIMostrarPreview() {
  document.getElementById('impSICIPaso1').style.display = 'none';
  document.getElementById('impSICIPaso2').style.display = '';
  document.getElementById('impSICIBtnImportar').disabled = false;
  document.getElementById('impSICIBtnVolver').style.display = '';

  const total = _impSICIFacturas.length;
  const totalImp = _impSICIFacturas.reduce((s, f) => s + f.total, 0);
  const cobradas = _impSICIFacturas.filter(f => f.estado === 'cobrada').length;
  const pendientes = total - cobradas;
  const rects = _impSICIFacturas.filter(f => f.es_rectificativa).length;
  const cliNuevos = _impSICIClientesNuevos.size;
  const fmtBadge = _impSICIFormato === 'completo'
    ? '<span style="display:inline-block;font-size:10px;font-weight:700;background:#10B981;color:#fff;padding:2px 8px;border-radius:4px;margin-left:8px">FORMATO COMPLETO ✓</span>'
    : '<span style="display:inline-block;font-size:10px;font-weight:700;background:#D97706;color:#fff;padding:2px 8px;border-radius:4px;margin-left:8px">FORMATO BÁSICO</span>';

  document.getElementById('impSICIResumen').innerHTML = `
    <div style="font-size:12px;color:var(--gris-600);margin-bottom:10px">SICI ${fmtBadge}</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;text-align:center">
      <div><div style="font-size:22px;font-weight:800;color:var(--azul)">${total}</div><div style="font-size:11px;color:var(--gris-500)">Facturas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#10B981">${cobradas}</div><div style="font-size:11px;color:var(--gris-500)">Cobradas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#D97706">${pendientes}</div><div style="font-size:11px;color:var(--gris-500)">Pendientes</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#7C3AED">${rects}</div><div style="font-size:11px;color:var(--gris-500)">Rectificativas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#059669">${totalImp.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €</div><div style="font-size:11px;color:var(--gris-500)">Importe total</div></div>
    </div>
    <div style="margin-top:10px;text-align:center;font-size:12px;color:var(--gris-600)">
      ${cliNuevos > 0 ? `🆕 Se crearán <strong>${cliNuevos}</strong> clientes nuevos${_impSICIFormato === 'completo' ? ' (con dirección, CP, localidad y provincia)' : ' (solo nombre y NIF)'}` : '✅ Todos los clientes ya existen en tu ERP'}
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
  }).join('') + (lista.length > 200 ? `<tr><td colspan="7" style="padding:10px;text-align:center;color:var(--gris-400);font-size:11px">... y ${lista.length - 200} más (no se muestran en preview)</td></tr>` : '');
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
  document.getElementById('impSICIPaso2').style.display = 'none';
  document.getElementById('impSICIPaso3').style.display = 'none';
  document.getElementById('impSICIPaso4').style.display = 'none';
  document.getElementById('impSICIBtnImportar').disabled = true;
  document.getElementById('impSICIBtnVolver').style.display = 'none';
  document.getElementById('impSICIFileName').style.display = 'none';
  document.getElementById('impSICIFile').value = '';
  _impSICIFacturas = [];
  _impSICIClientesNuevos = new Map();
}

// ─── Importar (paso 3) ───
async function impSICIImportar() {
  if (!_impSICIFacturas.length) return;
  const ok = await confirmModal({
    titulo: 'Importar histórico SICI',
    mensaje: `¿Confirmas la importación de ${_impSICIFacturas.length} facturas y la creación de ${_impSICIClientesNuevos.size} clientes nuevos? Esto NO se puede deshacer fácilmente.`,
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
    if (c.direccion) obj.direccion = c.direccion;
    if (c.cp) obj.cp = c.cp;
    if (c.municipio) obj.municipio = c.municipio;
    if (c.provincia) obj.provincia = c.provincia;
    let { data, error } = await sb.from('clientes').insert(obj).select().single();
    // Fallback si alguna columna no existe
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

  // 2) Detectar serie de facturas
  let serieId = null;
  const serFact = (series || []).filter(s => s.tipo === 'factura' || s.tipo === 'fact');
  if (serFact.length) serieId = serFact[0].id;

  // 3) Comprobar facturas existentes (no duplicar)
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
      numero: f.numero,
      serie_id: serieId,
      cliente_id: cliId || null,
      cliente_nombre: f.cliente_nombre,
      fecha: f.fecha,
      fecha_vencimiento: f.fecha_vencimiento,
      forma_pago_id: f.forma_pago_id,
      base_imponible: f.base_imponible,
      total_iva: f.total_iva,
      total: f.total,
      estado: f.estado,
      observaciones: f.observaciones,
      lineas: f.lineas,
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

  if (typeof loadFacturas === 'function') loadFacturas();
  if (typeof cargarTodos === 'function') cargarTodos();
  toast(`✅ ${stats.facturasOk} facturas importadas`, 'success');
}
