// ═══════════════════════════════════════════════════════════════════
//  IMPORTAR HISTÓRICO SICI — Configuración → Facturación
//  Lee el listadoBuscadorFacturas (HTML disfrazado de .xls), genera
//  preview y crea facturas + clientes en el ERP con la lógica acordada.
// ═══════════════════════════════════════════════════════════════════
let _impSICIFacturas = []; // [{numero, fecha, cliente, total, ...}]
let _impSICIClientesNuevos = new Map(); // nif → {nombre, ...}

// ─── Parser bimodal de números: "6.240,65" o "6822" (céntimos) ───
function _impParseNum(s) {
  if (s === null || s === undefined || s === '') return 0;
  const txt = String(s).replace('€', '').trim();
  if (txt === '' || txt === 'NaN') return 0;
  if (txt.indexOf(',') >= 0) {
    // Formato europeo: 6.240,65 / -1.073,61
    return parseFloat(txt.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Entero en céntimos: 6822 → 68,22
  const n = parseInt(txt, 10);
  return isNaN(n) ? 0 : n / 100;
}

// ─── Parser fecha DD/MM/AA → YYYY-MM-DD ───
function _impParseFecha(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  let yy = m[3];
  if (yy.length === 2) yy = '20' + yy;
  return `${yy}-${mm}-${dd}`;
}

// ─── Detectar prefijo de número de factura ───
function _impPrefijo(numero) {
  if (!numero) return '?';
  const m = String(numero).trim().match(/^([A-Z]+)/);
  return m ? m[1] : '?';
}

// ─── Manejar fichero subido ───
async function impSICIHandleFile(file) {
  if (!file) return;
  document.getElementById('impSICIFileName').style.display = '';
  document.getElementById('impSICIFileName').textContent = '⏳ Procesando ' + file.name + '...';
  try {
    const html = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tabla = doc.querySelector('table');
    if (!tabla) {
      toast('❌ No se encontró ninguna tabla en el fichero', 'error');
      return;
    }
    const filas = Array.from(tabla.querySelectorAll('tr'));
    if (filas.length < 2) { toast('❌ El fichero está vacío', 'error'); return; }
    // Cabeceras
    const headers = Array.from(filas[0].querySelectorAll('th, td')).map(c => c.textContent.trim());
    const idx = (nombre) => headers.findIndex(h => h.trim() === nombre);
    const COL = {
      numero: idx('Factura'),
      fecha: idx('Fecha'),
      destinatario: idx('Destinatario'),
      cif: idx('CIF Destinatario'),
      asegurado: idx('Asegurado'),
      expediente: idx('Expediente'),
      dano: idx('Daño'),
      pagado: idx('Pagado'),
      base21: idx('IVA 21%'),       // ¡OJO! En SICI esta columna es la BASE al 21%
      iva21:  idx('Total 21%'),     //         y esta es el importe del IVA
      base10: idx('IVA 10%'),
      iva10:  idx('Total 10%'),
      totalSinIva: idx('Total sin IVA'),
      totalFactura: idx('Total Factura'),
      observaciones: idx('Observaciones'),
    };
    if (COL.numero < 0 || COL.fecha < 0 || COL.totalFactura < 0) {
      toast('❌ Cabeceras no reconocidas. ¿Es un export válido de SICI?', 'error');
      return;
    }

    _impSICIFacturas = [];
    _impSICIClientesNuevos = new Map();

    // Ya existentes en el ERP por NIF (case-insensitive sin espacios)
    const norm = (x) => String(x || '').replace(/\s+/g, '').toUpperCase();
    const clientesPorNif = new Map();
    (clientes || []).forEach(c => { if (c.nif) clientesPorNif.set(norm(c.nif), c); });

    for (let i = 1; i < filas.length; i++) {
      const celdas = Array.from(filas[i].querySelectorAll('td')).map(c => c.textContent.trim());
      if (celdas.length === 0) continue;
      const numero = celdas[COL.numero];
      if (!numero) continue;

      const cif = celdas[COL.cif] || null;
      const cifNorm = norm(cif);
      const destinatario = celdas[COL.destinatario] || '—';
      const prefijo = _impPrefijo(numero);
      const totalFact = _impParseNum(celdas[COL.totalFactura]);
      const totalSinIva = _impParseNum(celdas[COL.totalSinIva]);
      const base21 = _impParseNum(celdas[COL.base21]);
      const iva21 = _impParseNum(celdas[COL.iva21]);
      const base10 = COL.base10 >= 0 ? _impParseNum(celdas[COL.base10]) : 0;
      const iva10  = COL.iva10  >= 0 ? _impParseNum(celdas[COL.iva10])  : 0;
      const fecha = _impParseFecha(celdas[COL.fecha]);
      const asegurado = COL.asegurado >= 0 ? celdas[COL.asegurado] : '';
      const expediente = COL.expediente >= 0 ? celdas[COL.expediente] : '';
      const dano = COL.dano >= 0 ? celdas[COL.dano] : '';
      const obsSici = COL.observaciones >= 0 ? celdas[COL.observaciones] : '';

      // Estado: JI → pendiente, resto → cobrada (decisión de Jordi)
      const esJI = prefijo === 'JI';
      const estado = esJI ? 'pendiente' : 'cobrada';
      // Detectar rectificativa: prefijo AASI/AAXA o total negativo + obsSici contiene "ABONO"
      const esRect = (prefijo === 'AASI' || prefijo === 'AAXA') || (totalFact < 0 && /abono/i.test(obsSici));
      // Extraer número de factura rectificada (de las observaciones)
      let rectificaA = null;
      if (esRect) {
        const m = obsSici && obsSici.match(/(?:DE\s+)?([A-Z]+\s*\d+\/\d{4})/i);
        if (m) rectificaA = m[1].replace(/\s+/g, '');
      }

      // Cliente: ¿existe por NIF?
      let clienteExist = cifNorm ? clientesPorNif.get(cifNorm) : null;
      let clienteNuevoFlag = false;
      if (!clienteExist && cifNorm) {
        // Marcar para crear (deduplicado por NIF)
        if (!_impSICIClientesNuevos.has(cifNorm)) {
          _impSICIClientesNuevos.set(cifNorm, {
            nif: cif,
            nombre: destinatario,
          });
        }
        clienteNuevoFlag = true;
      } else if (!cifNorm) {
        // Sin NIF → tratar nombre como ID (no ideal, pero importable)
        clienteNuevoFlag = !clienteExist;
      }

      // Construir descripción de línea
      let lineaDesc;
      if (esJI || !asegurado) {
        lineaDesc = obsSici || `Trabajos según expediente ${expediente || ''}`.trim();
      } else {
        const partes = [];
        if (dano) partes.push(`Reparación daños por ${dano}`);
        else partes.push('Reparación de daños');
        if (asegurado) partes.push(`Asegurado: ${asegurado}`);
        if (expediente) partes.push(`Expediente: ${expediente}`);
        lineaDesc = partes.join(' — ');
      }

      // Líneas: una por cada IVA con base
      const lineas = [];
      if (base21) {
        lineas.push({
          desc: lineaDesc,
          cant: 1,
          precio: base21,
          dto1: 0, dto2: 0, dto3: 0,
          iva: 21,
        });
      }
      if (base10) {
        lineas.push({
          desc: lineaDesc + ' (IVA reducido)',
          cant: 1,
          precio: base10,
          dto1: 0, dto2: 0, dto3: 0,
          iva: 10,
        });
      }
      if (!lineas.length) {
        lineas.push({
          desc: lineaDesc,
          cant: 1,
          precio: totalSinIva || totalFact,
          dto1: 0, dto2: 0, dto3: 0,
          iva: 21,
        });
      }

      // Forma de pago: si es JI usar Transferencia 15d (predeterminada). Resto sin forma.
      let fpId = null;
      if (esJI) {
        fpId = parseInt(EMPRESA?.config?.forma_pago_default_id) || null;
      }
      // Vencimiento: solo JI, fecha + 15 días
      let venc = null;
      if (esJI && fecha && fpId) {
        const fp = (formasPago || []).find(x => x.id === fpId);
        const dias = fp ? (fp.dias_vencimiento || 15) : 15;
        const d = new Date(fecha);
        d.setDate(d.getDate() + dias);
        venc = d.toISOString().split('T')[0];
      }

      _impSICIFacturas.push({
        _orig_idx: i,
        numero, prefijo, fecha, fecha_vencimiento: venc,
        cliente_id: clienteExist?.id || null,
        cliente_nif: cif,
        cliente_nombre: destinatario,
        cliente_nuevo: clienteNuevoFlag,
        forma_pago_id: fpId,
        estado,
        es_rectificativa: esRect,
        rectifica_a_numero: rectificaA,
        base_imponible: Math.round((base21 + base10) * 100) / 100 || Math.round(totalSinIva * 100) / 100,
        total_iva: Math.round((iva21 + iva10) * 100) / 100,
        total: Math.round(totalFact * 100) / 100,
        lineas,
        observaciones: obsSici || null,
      });
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

  // Resumen
  const total = _impSICIFacturas.length;
  const totalImp = _impSICIFacturas.reduce((s, f) => s + f.total, 0);
  const cobradas = _impSICIFacturas.filter(f => f.estado === 'cobrada').length;
  const pendientes = total - cobradas;
  const rects = _impSICIFacturas.filter(f => f.es_rectificativa).length;
  const cliNuevos = _impSICIClientesNuevos.size;

  document.getElementById('impSICIResumen').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;text-align:center">
      <div><div style="font-size:22px;font-weight:800;color:var(--azul)">${total}</div><div style="font-size:11px;color:var(--gris-500)">Facturas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#10B981">${cobradas}</div><div style="font-size:11px;color:var(--gris-500)">Cobradas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#D97706">${pendientes}</div><div style="font-size:11px;color:var(--gris-500)">Pendientes</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#7C3AED">${rects}</div><div style="font-size:11px;color:var(--gris-500)">Rectificativas</div></div>
      <div><div style="font-size:22px;font-weight:800;color:#059669">${totalImp.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €</div><div style="font-size:11px;color:var(--gris-500)">Importe total</div></div>
    </div>
    <div style="margin-top:10px;text-align:center;font-size:12px;color:var(--gris-600)">
      ${cliNuevos > 0 ? `🆕 Se crearán ${cliNuevos} clientes nuevos` : '✅ Todos los clientes ya existen en tu ERP'}
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
  const cifAId = new Map(); // nif → id de cliente recién creado
  const clientesACrear = Array.from(_impSICIClientesNuevos.values());
  for (let i = 0; i < clientesACrear.length; i++) {
    const c = clientesACrear[i];
    const obj = {
      empresa_id: EMPRESA.id,
      nombre: c.nombre,
      nif: c.nif,
    };
    const { data, error } = await sb.from('clientes').insert(obj).select().single();
    if (error) {
      errores.push(`Cliente ${c.nombre} (${c.nif}): ${error.message}`);
    } else if (data) {
      cifAId.set(String(c.nif).replace(/\s+/g,'').toUpperCase(), data.id);
      stats.clientesCreados++;
      // Añadir al array global para que esté disponible en pantalla sin recargar
      if (typeof clientes !== 'undefined') clientes.push(data);
    }
    setProg(5 + Math.round((i / clientesACrear.length) * 15), 'Creando clientes nuevos...', `${i+1}/${clientesACrear.length}`);
  }

  // 2) Detectar serie de facturas (la primera disponible o crear FAC-IMP)
  let serieId = null;
  const serFact = (series || []).filter(s => s.tipo === 'factura' || s.tipo === 'fact');
  if (serFact.length) serieId = serFact[0].id;

  // 3) Comprobar facturas existentes para evitar duplicados (por número)
  setProg(22, 'Comprobando duplicados...', '');
  const { data: existentes } = await sb.from('facturas').select('numero').eq('empresa_id', EMPRESA.id);
  const numExistentes = new Set((existentes || []).map(x => x.numero));

  // 4) Insertar facturas (lotes de 50 para no saturar)
  const totalFx = _impSICIFacturas.length;
  setProg(25, 'Importando facturas...', `0/${totalFx}`);
  for (let i = 0; i < totalFx; i++) {
    const f = _impSICIFacturas[i];
    if (numExistentes.has(f.numero)) {
      stats.omitidas++;
      continue;
    }
    let cliId = f.cliente_id;
    if (!cliId && f.cliente_nif) {
      cliId = cifAId.get(String(f.cliente_nif).replace(/\s+/g,'').toUpperCase());
    }
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
    // Fallback si falla por alguna columna no existente
    if (error && error.message && /column/i.test(error.message)) {
      const objLight = {...obj};
      delete objLight.cuenta_id;
      ({ error } = await sb.from('facturas').insert(objLight));
    }
    if (error) {
      errores.push(`${f.numero}: ${error.message}`);
      stats.facturasFallo++;
    } else {
      stats.facturasOk++;
    }
    if (i % 10 === 0) {
      const pct = 25 + Math.round(((i+1) / totalFx) * 70);
      setProg(pct, 'Importando facturas...', `${i+1}/${totalFx} · ${stats.facturasOk} OK · ${stats.facturasFallo} fallos · ${stats.omitidas} omitidas (duplicado)`);
      await new Promise(r => setTimeout(r, 0)); // ceder al render
    }
  }

  setProg(100, '¡Importación completa!', '');
  await new Promise(r => setTimeout(r, 400));

  // 5) Mostrar resultado
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

  // 6) Refrescar listado de facturas en background
  if (typeof loadFacturas === 'function') loadFacturas();
  if (typeof cargarTodos === 'function') cargarTodos();

  toast(`✅ ${stats.facturasOk} facturas importadas`, 'success');
}
