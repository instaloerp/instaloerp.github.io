// ═══════════════════════════════════════════════════════════════
//  RENDERER HTML UNIFICADO — modelo único para presupuestos,
//  facturas y albaranes en TODOS los flujos:
//   · Previsualización  (modal)
//   · Impresión         (window.print)
//   · Descarga PDF      (html2pdf)
//   · Adjunto email     (base64 vía html2pdf)
//   · Firma cliente     (mismo HTML servido al cliente)
//
//  cfg = {
//    tipo:        'PRESUPUESTO' | 'FACTURA' | 'ALBARÁN',
//    numero, fecha, titulo,
//    cliente:     { nombre, nif, direccion, cp, municipio, provincia, email, telefono },
//    lineas:      [ { tipo:'capitulo', titulo:'…' } | { desc, cant, precio, dto, iva } ],
//    base_imponible, total_iva, total,
//    observaciones,
//    condiciones: [ [k,v], … ] | null,
//    firma_zona:  bool,
//    firma_aceptada: { nombre, fecha, ip, dispositivo, url } | null,
//    datos_extra: [ [k,v], … ]   // se mezclan en la tarjeta "Datos del documento"
//  }
// ═══════════════════════════════════════════════════════════════

(function(){
  'use strict';

  // ─── Helpers ──────────────────────────────────────────────
  function _esc(s){
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function _fmtE(n){
    return (Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  }
  function _fmtFecha(f){
    if (!f) return '—';
    try { return new Date(f).toLocaleDateString('es-ES'); } catch(e){ return '—'; }
  }
  function _empresa(){
    return (typeof window.EMPRESA !== 'undefined' && window.EMPRESA)
        || (typeof EMPRESA !== 'undefined' ? EMPRESA : null)
        || {};
  }
  function _logoSrc(E){
    if (E.logo_url) return E.logo_url;
    return 'assets/logo-empresa.png';
  }
  function _labelDatos(tipo){
    const t = (tipo||'').toUpperCase();
    if (t.startsWith('FACTURA')) return 'Datos de la factura';
    if (t === 'ALBARÁN' || t === 'ALBARAN') return 'Datos del albarán';
    return 'Datos del presupuesto';
  }
  function _agruparCapitulos(lineas){
    const caps = [];
    let actual = null;
    const huerfanas = [];
    (lineas||[]).forEach(l => {
      if (!l) return;
      if (l.tipo === 'capitulo') {
        if (actual) caps.push(actual);
        actual = { titulo: l.titulo || 'Capítulo', items: [], importe: 0 };
      } else if (l._separator) {
        return;
      } else {
        const cant   = Number(l.cant)||0;
        const precio = Number(l.precio)||0;
        const dto1 = Number(l.dto1||l.dto||0);
        const dto2 = Number(l.dto2||0);
        const dto3 = Number(l.dto3||0);
        const iva  = Number(l.iva||0);
        const sub  = cant * precio * (1-dto1/100) * (1-dto2/100) * (1-dto3/100);
        const conIva = sub * (1 + iva/100);
        const dtoTxt = (dto1||dto2||dto3)
          ? [dto1,dto2,dto3].filter(x=>x).map(x=>x+'%').join(' / ')
          : '—';
        const item = { desc:l.desc||'', cant, precio, dtoTxt, iva, sub, conIva };
        if (actual) { actual.items.push(item); actual.importe += conIva; }
        else huerfanas.push(item);
      }
    });
    if (actual) caps.push(actual);
    return { capitulos: caps, huerfanas };
  }

  // ─── Estilos comunes (inline para que viajen con el HTML) ──
  const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1e293b;background:#fff;line-height:1.45}
.doc{max-width:210mm;margin:0 auto;padding:10mm 16mm 22mm;position:relative}
.cabecera{position:relative;display:flex;justify-content:space-between;align-items:center;min-height:70px;margin-bottom:18px}
.cab-logo{position:absolute;top:50%;left:0;transform:translateY(-50%);display:flex;align-items:center;background:#fff;padding:2px 6px 2px 0}
.cab-logo img,.cab-logo-center img{height:90px;width:auto;max-width:240px;object-fit:contain;display:block}
.cab-logo-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.cab-qr{display:flex;flex-direction:column;align-items:center;flex-shrink:0}
.cab-qr .qr-lbl{font-size:7px;font-weight:700;color:#1e293b;margin-bottom:2px}
.cab-qr img{width:30mm;height:30mm}
.cab-qr .qr-veri{font-size:7px;font-weight:700;color:#1e40af;margin-top:2px}
.cab-empresa-info{text-align:right;font-size:9px;color:#64748b;line-height:1.5}
.cab-empresa-info .nombre-corp{font-size:10px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
.titulo-doc{margin:6px 0 14px;padding-bottom:10px;border-bottom:3px solid #1e40af}
.titulo-doc .tipo{font-size:26px;font-weight:800;color:#1e40af;text-transform:uppercase;letter-spacing:1.5px;line-height:1}
.titulo-doc .ref{font-size:13px;color:#64748b;font-weight:500;margin-top:6px}
.bloque-doble{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;margin-bottom:20px}
.tarjeta{background:#f8fafc;border-radius:10px;padding:14px 16px;border-left:4px solid #1e40af}
.tarjeta .label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:6px}
.tarjeta .nombre{font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px}
.tarjeta .datos{font-size:10.5px;color:#475569;line-height:1.55}
.tarjeta-datos .fila{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #e2e8f0;font-size:10.5px}
.tarjeta-datos .fila:last-child{border-bottom:none}
.tarjeta-datos .fila .k{color:#64748b;font-weight:500}
.tarjeta-datos .fila .v{color:#1e293b;font-weight:700;text-align:right}

.capitulo{margin-bottom:18px;page-break-inside:avoid;break-inside:avoid}
.cap-banda{display:flex;align-items:stretch;border-radius:8px;overflow:hidden;margin-bottom:10px}
.cap-num{background:#1e40af;color:#fff;font-weight:800;font-size:16px;padding:9px 0;width:50px;text-align:center;display:flex;align-items:center;justify-content:center}
.cap-titulo{background:#dbeafe;color:#1e40af;font-weight:700;font-size:11.5px;padding:9px 14px;flex:1;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center}
.cap-lineas{width:100%;border-collapse:separate;border-spacing:0;margin-top:6px;font-size:10px}
.cap-lineas thead th{background:#f1f5f9;color:#475569;padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left;border-bottom:1px solid #cbd5e1}
.cap-lineas thead th.r{text-align:right}
.cap-lineas tbody td{padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top}
.cap-lineas tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
.cap-lineas tbody tr:last-child td{border-bottom:none}
.cap-importe{margin-top:8px;background:#dbeafe;border-radius:6px;padding:9px 14px;color:#1e40af;font-weight:700;font-size:11.5px;letter-spacing:.4px;display:flex;justify-content:space-between;align-items:center}
.cap-importe .lbl{font-size:10px;letter-spacing:1px;text-transform:uppercase;opacity:.85}

.tabla{width:100%;border-collapse:separate;border-spacing:0;margin-bottom:14px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0}
.tabla thead th{background:#1e40af;color:#fff;padding:9px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left}
.tabla thead th.r{text-align:right}
.tabla tbody td{padding:8px 12px;font-size:10.5px;border-bottom:1px solid #f1f5f9}
.tabla tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
.tabla tbody tr:last-child td{border-bottom:none}
.tabla tbody tr:nth-child(even){background:#f8fafc}

.seccion-titulo{font-size:13px;font-weight:700;color:#1e40af;margin:18px 0 10px;padding-bottom:6px;border-bottom:2px solid #1e40af;display:inline-block;padding-right:30px}
.resumen-bloque{page-break-inside:avoid;break-inside:avoid;page-break-before:auto}
.resumen{background:#f8fafc;border-radius:10px;padding:14px 18px;margin-bottom:14px}
.resumen-cap{padding:6px 0;display:flex;justify-content:space-between;font-size:10.5px;color:#475569;border-bottom:1px dashed #e2e8f0}
.resumen-cap .num{display:inline-block;background:#1e40af;color:#fff;font-weight:700;font-size:9px;padding:2px 7px;border-radius:4px;margin-right:8px;letter-spacing:.4px}
.resumen-cap b{color:#1e293b;font-weight:700;font-variant-numeric:tabular-nums}
.resumen-fila{display:flex;justify-content:space-between;padding:6px 0;font-size:11px;color:#475569;border-bottom:1px dashed #e2e8f0}
.resumen-fila.subtotal{padding-top:10px;border-top:2px solid #cbd5e1;margin-top:6px;font-weight:700;color:#1e293b}
.resumen-fila:last-child{border-bottom:none}
.resumen-fila b{color:#1e293b;font-weight:700;font-variant-numeric:tabular-nums}
.resumen-total{margin-top:8px;display:flex;justify-content:space-between;align-items:center;background:#1e40af;color:#fff;padding:12px 16px;border-radius:8px;font-size:14px;font-weight:800;letter-spacing:.5px}

.observaciones{margin:14px 0;padding:10px 14px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8}
.observaciones .label{font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px}
.observaciones .texto{font-size:11px;color:#475569;white-space:pre-wrap}

.condiciones{margin-bottom:18px}
.cond-fila{display:grid;grid-template-columns:160px 1fr;gap:14px;padding:9px 14px;border-radius:6px;font-size:10.5px;margin-bottom:4px}
.cond-fila:nth-child(odd){background:#f8fafc}
.cond-fila .k{font-weight:700;color:#1e293b}
.cond-fila .v{color:#64748b}

.firma{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:24px;page-break-inside:avoid;break-inside:avoid}
.firma-bloque{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:16px;min-height:90px}
.firma-bloque .label{font-size:10px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}
.firma-bloque .info{font-size:10.5px;color:#475569;line-height:1.6}
.firma-bloque .info b{color:#1e293b}
.firma-bloque .linea{margin-top:18px;border-top:1px solid #94a3b8;padding-top:6px;font-size:9.5px;color:#94a3b8;text-align:center}
.firma-bloque.firmado{background:#ecfdf5;border:1px solid #6ee7b7}
.firma-bloque.firmado .label{color:#059669}

.pie{position:fixed;bottom:8mm;left:16mm;right:16mm;border-top:1px solid #e2e8f0;padding-top:6px;font-size:8.5px;color:#94a3b8;display:flex;justify-content:space-between}

@page{size:A4;margin:0}
@media print{
  body{background:#fff}
  .no-print{display:none!important}
  .doc{padding:14mm 14mm 18mm}
}
`;

  // ─── Construcción de bloques ──────────────────────────────
  function _renderCabecera(E, cfg){
    const dir = [E.direccion, E.cp && (E.cp+' '+(E.municipio||'')), E.provincia && '('+E.provincia+')'].filter(Boolean).join(' · ');
    const hasQR = cfg && cfg.verifactu_qr_url && cfg.verifactu_estado === 'correcto';
    const qrHtml = hasQR
      ? `<div class="cab-qr">
           <div class="qr-lbl">QR tributario:</div>
           <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=M&data=${encodeURIComponent(cfg.verifactu_qr_url)}" alt="QR VeriFactu">
           <div class="qr-veri">VERI*FACTU</div>
         </div>`
      : '';
    // Con QR: QR izq | logo centrado absoluto | datos dcha
    // Sin QR: logo izq absoluto | datos dcha (como antes)
    const logoClass = hasQR ? 'cab-logo-center' : 'cab-logo';
    return `
<div class="cabecera">
  ${qrHtml}
  <div class="${logoClass}"><img src="${_esc(_logoSrc(E))}" alt="Logo"></div>
  <div class="cab-empresa-info">
    <div class="nombre-corp">${_esc(E.nombre||'')}</div>
    ${E.cif ? `<div>CIF ${_esc(E.cif)}</div>` : ''}
    ${dir ? `<div>${_esc(dir)}</div>` : ''}
    ${E.telefono ? `<div>Tel. ${_esc(E.telefono)}</div>` : ''}
    ${E.email ? `<div>${_esc(E.email)}</div>` : ''}
  </div>
</div>`;
  }

  function _renderTitulo(cfg){
    const ref = cfg.titulo ? `<div class="ref">${_esc(cfg.titulo)}</div>` : '';
    return `
<div class="titulo-doc">
  <div class="tipo">${_esc(cfg.tipo||'DOCUMENTO')}</div>
  ${ref}
</div>`;
  }

  function _renderTarjetas(cfg){
    const c = cfg.cliente || {};
    const dirCli = [c.direccion, [c.cp, c.municipio].filter(Boolean).join(' '), c.provincia && '('+c.provincia+')'].filter(Boolean).join('<br>');
    const filasDatos = [];
    filasDatos.push(['Número', cfg.numero || '—']);
    filasDatos.push(['Fecha', _fmtFecha(cfg.fecha)]);
    (cfg.datos_extra || []).forEach(([k,v]) => { if (v != null && v !== '') filasDatos.push([k,v]); });
    return `
<div class="bloque-doble">
  <div class="tarjeta">
    <div class="label">Cliente</div>
    <div class="nombre">${_esc(c.nombre||'—')}</div>
    <div class="datos">
      ${c.nif ? `${(c.nif.length<=9?'DNI':'NIF')}: ${_esc(c.nif)}<br>` : ''}
      ${dirCli ? dirCli + '<br>' : ''}
      ${c.email ? _esc(c.email)+'<br>' : ''}
      ${c.telefono ? `Tel. ${_esc(c.telefono)}` : ''}
    </div>
  </div>
  <div class="tarjeta tarjeta-datos">
    <div class="label">${_esc(_labelDatos(cfg.tipo))}</div>
    ${filasDatos.map(([k,v]) => `<div class="fila"><span class="k">${_esc(k)}</span><span class="v">${_esc(v)}</span></div>`).join('')}
  </div>
</div>`;
  }

  function _renderCapitulo(cap, idx){
    const itemsHtml = cap.items.map(it => `
      <tr>
        <td>${_esc(it.desc)}</td>
        <td class="r">${it.cant}</td>
        <td class="r">${_fmtE(it.precio)}</td>
        <td class="r">${_esc(it.dtoTxt)}</td>
        <td class="r">${_fmtE(it.sub)}</td>
      </tr>`).join('');
    return `
<div class="capitulo">
  <div class="cap-banda">
    <div class="cap-num">${String(idx).padStart(2,'0')}</div>
    <div class="cap-titulo">${_esc(cap.titulo)}</div>
  </div>
  ${cap.items.length ? `
  <table class="cap-lineas">
    <thead>
      <tr>
        <th style="width:55%">Descripción</th>
        <th class="r" style="width:8%">Cant.</th>
        <th class="r" style="width:15%">Precio</th>
        <th class="r" style="width:10%">Dto.</th>
        <th class="r" style="width:12%">Importe</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>` : ''}
  <div class="cap-importe">
    <span class="lbl">Total capítulo ${String(idx).padStart(2,'0')}</span>
    <span>${_fmtE(cap.importe)}</span>
  </div>
</div>`;
  }

  function _renderTablaPlana(items){
    if (!items.length) return '';
    const filas = items.map(it => `
      <tr>
        <td>${_esc(it.desc)}</td>
        <td class="r">${it.cant}</td>
        <td class="r">${_fmtE(it.precio)}</td>
        <td class="r">${_esc(it.dtoTxt)}</td>
        <td class="r">${it.iva ? it.iva+' %' : '—'}</td>
        <td class="r">${_fmtE(it.conIva)}</td>
      </tr>`).join('');
    return `
<table class="tabla">
  <thead>
    <tr>
      <th style="width:50%">Descripción</th>
      <th class="r" style="width:8%">Cant.</th>
      <th class="r" style="width:13%">Precio</th>
      <th class="r" style="width:8%">Dto.</th>
      <th class="r" style="width:8%">IVA</th>
      <th class="r" style="width:13%">Total</th>
    </tr>
  </thead>
  <tbody>${filas}</tbody>
</table>`;
  }

  function _renderResumen(cfg, capitulos){
    const baseImp = cfg.base_imponible != null ? Number(cfg.base_imponible) : null;
    const ivaT    = cfg.total_iva     != null ? Number(cfg.total_iva)     : null;
    const total   = cfg.total         != null ? Number(cfg.total)         : null;
    if (baseImp == null && total == null) return '';

    const filasCap = capitulos.length > 1
      ? capitulos.map((c,i) => `
        <div class="resumen-cap">
          <span><span class="num">${String(i+1).padStart(2,'0')}</span>${_esc(c.titulo)}</span>
          <b>${_fmtE(c.importe)}</b>
        </div>`).join('')
      : '';

    return `
<div class="resumen-bloque">
  <div class="seccion-titulo">Resumen económico</div>
  <div class="resumen">
    ${filasCap}
    <div class="resumen-fila ${filasCap?'subtotal':''}"><span>Subtotal (sin IVA)</span><b>${_fmtE(baseImp||0)}</b></div>
    <div class="resumen-fila"><span>IVA</span><b>${_fmtE(ivaT||0)}</b></div>
  </div>
  <div class="resumen-total"><span>TOTAL CON IVA</span><span>${_fmtE(total||0)}</span></div>
</div>`;
  }

  function _renderObservaciones(obs){
    if (!obs) return '';
    return `
<div class="observaciones">
  <div class="label">Observaciones</div>
  <div class="texto">${_esc(obs)}</div>
</div>`;
  }

  function _renderCondiciones(conds){
    if (!conds || !conds.length) return '';
    const filas = conds.filter(([k,v]) => v != null && v !== '').map(([k,v]) =>
      `<div class="cond-fila"><div class="k">${_esc(k)}</div><div class="v">${_esc(v)}</div></div>`
    ).join('');
    if (!filas) return '';
    return `
<div class="resumen-bloque">
  <div class="seccion-titulo">Condiciones</div>
  <div class="condiciones">${filas}</div>
</div>`;
  }

  function _renderFirma(cfg, E){
    if (!cfg.firma_zona) return '';
    const firmado = cfg.firma_aceptada;
    const bloqueCli = firmado ? `
    <div class="firma-bloque firmado">
      <div class="label">✓ Aceptado por el cliente</div>
      <div class="info">
        <b>${_esc(firmado.nombre||'—')}</b><br>
        Fecha: ${_fmtFecha(firmado.fecha)}<br>
        ${firmado.ip ? `IP: ${_esc(firmado.ip)}` : ''}
      </div>
      ${firmado.url ? `<div class="linea">Firma digital registrada</div>` : `<div class="linea">Aceptación digital</div>`}
    </div>` : `
    <div class="firma-bloque">
      <div class="label">Aceptación del cliente</div>
      <div class="info">Fecha y firma:</div>
      <div class="linea">Conforme</div>
    </div>`;
    return `
<div class="firma">
  <div class="firma-bloque">
    <div class="label">Por la empresa instaladora</div>
    <div class="info">
      <b>${_esc(E.nombre||'')}</b>
      ${E.responsable ? '<br>'+_esc(E.responsable) : ''}
    </div>
    <div class="linea">Firma y sello</div>
  </div>
  ${bloqueCli}
</div>`;
  }


  function _renderPie(E){
    const partes = [E.nombre, E.cif && ('CIF '+E.cif), E.direccion, E.telefono, E.email].filter(Boolean).join(' · ');
    return `<div class="pie"><span>${_esc(partes)}</span><span class="pag"></span></div>`;
  }

  // ─── API pública ──────────────────────────────────────────
  function _buildHtmlDocumento(cfg){
    const E = _empresa();
    const { capitulos, huerfanas } = _agruparCapitulos(cfg.lineas);
    const cuerpoLineas = capitulos.length
      ? capitulos.map((c,i) => _renderCapitulo(c, i+1)).join('')
        + (huerfanas.length ? _renderTablaPlana(huerfanas) : '')
      : _renderTablaPlana(huerfanas);

    const marcaAguaHtml = cfg.marca_agua
      ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:90px;font-weight:900;color:rgba(239,68,68,0.08);letter-spacing:12px;white-space:nowrap;pointer-events:none;z-index:0;user-select:none">${_esc(cfg.marca_agua)}</div>`
      : '';

    // Base URL para que las rutas relativas funcionen en ventanas popup (about:blank)
    const baseUrl = (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('about:'))
      ? window.location.origin + window.location.pathname.replace(/[^/]*$/, '')
      : '';
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">${baseUrl ? `\n<base href="${baseUrl}">` : ''}
<title>${_esc(cfg.tipo||'Documento')} ${_esc(cfg.numero||'')}</title>
<style>${CSS}</style>
</head>
<body>
<div class="doc" style="position:relative">
  ${marcaAguaHtml}
  ${_renderCabecera(E, cfg)}
  ${_renderTitulo(cfg)}
  ${_renderTarjetas(cfg)}
  ${cuerpoLineas}
  ${_renderResumen(cfg, capitulos)}
  ${_renderObservaciones(cfg.observaciones)}
  ${_renderCondiciones(cfg.condiciones)}
  ${_renderFirma(cfg, E)}
</div>
${_renderPie(E)}
</body>
</html>`;
  }

  // Abre ventana con el documento + barra para imprimir/descargar/cerrar
  function _imprimirDocumento(cfg){
    const html = _buildHtmlDocumento(cfg);
    const filename = `${cfg.tipo||'Documento'}_${(cfg.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')}.pdf`;
    const cfgJson = btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
    const barra = `
<div class="no-print" style="position:sticky;top:0;background:#1e293b;padding:10px 16px;display:flex;gap:10px;justify-content:center;z-index:9999;box-shadow:0 2px 6px rgba(0,0,0,.2)">
  <button onclick="window.print()" style="padding:8px 18px;border:none;border-radius:6px;background:#1e40af;color:#fff;font-weight:700;cursor:pointer;font-size:13px">🖨️ Imprimir</button>
  <button onclick="window.opener && window.opener._descargarDocumentoDesdeVentana && window.opener._descargarDocumentoDesdeVentana('${cfgJson}','${_esc(filename)}')" style="padding:8px 18px;border:none;border-radius:6px;background:#059669;color:#fff;font-weight:700;cursor:pointer;font-size:13px">⬇️ Descargar PDF</button>
  <button onclick="window.close()" style="padding:8px 18px;border:none;border-radius:6px;background:#475569;color:#fff;font-weight:700;cursor:pointer;font-size:13px">✕ Cerrar</button>
</div>`;
    const htmlConBarra = html.replace('<body>', '<body>'+barra);
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) { toast && toast('El navegador bloqueó la ventana. Permite popups.', 'error'); return; }
    win.document.write(htmlConBarra);
    win.document.close();
  }

  // Llamado desde la ventana hija
  window._descargarDocumentoDesdeVentana = function(cfgB64, filename){
    try {
      const cfg = JSON.parse(decodeURIComponent(escape(atob(cfgB64))));
      _descargarPdfDocumento(cfg, filename);
    } catch(e){ console.error(e); }
  };

  // Espera (con polling) a que las imágenes del DOM hayan cargado
  function _esperarImagenes(root){
    const imgs = root.querySelectorAll('img');
    return Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() :
      new Promise(res => { img.onload = res; img.onerror = res; })
    ));
  }

  // Renderiza el HTML en un contenedor invisible y devuelve un jsPDF (vía html2pdf)
  async function _renderToPdf(cfg){
    if (!window.html2pdf) {
      throw new Error('html2pdf.js no está cargado');
    }
    const html = _buildHtmlDocumento(cfg);
    // Extraer sólo el .doc (sin <html><body>) para incrustarlo en un contenedor offscreen
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const doc = tmp.querySelector('.doc');
    const styleNode = tmp.querySelector('style');
    if (!doc) throw new Error('Documento mal formado');

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1';
    if (styleNode) wrapper.appendChild(styleNode.cloneNode(true));
    wrapper.appendChild(doc.cloneNode(true));
    document.body.appendChild(wrapper);

    try {
      await _esperarImagenes(wrapper);
      const opt = {
        margin:       [10, 0, 14, 0],   // mm — el .doc ya tiene padding interno
        filename:     `${cfg.tipo||'Documento'}_${(cfg.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')}.pdf`,
        image:        { type:'jpeg', quality:0.96 },
        html2canvas:  { scale:2, useCORS:true, allowTaint:false, backgroundColor:'#ffffff' },
        jsPDF:        { unit:'mm', format:'a4', orientation:'portrait' },
        pagebreak:    { mode:['css','legacy'], avoid:['.capitulo','.resumen-bloque','.firma','.firma-bloque'] }
      };
      const worker = window.html2pdf().set(opt).from(wrapper.querySelector('.doc'));
      const pdf = await worker.toPdf().get('pdf');
      // Stamp pie con numeración
      const totalPag = pdf.internal.getNumberOfPages();
      const E = _empresa();
      const partes = [E.nombre, E.cif && ('CIF '+E.cif), E.direccion, E.telefono, E.email].filter(Boolean).join(' · ');
      for (let i=1; i<=totalPag; i++){
        pdf.setPage(i);
        pdf.setFontSize(7.5);
        pdf.setTextColor(148,163,184);
        pdf.text(partes, 105, 287, { align:'center', maxWidth: 180 });
        pdf.text(`Página ${i} de ${totalPag}`, 200, 292, { align:'right' });
      }
      return pdf;
    } finally {
      wrapper.remove();
    }
  }

  async function _descargarPdfDocumento(cfg, filename){
    try {
      const pdf = await _renderToPdf(cfg);
      pdf.save(filename || `${cfg.tipo||'Documento'}_${(cfg.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')}.pdf`);
      if (window.toast) toast('📄 PDF descargado ✓','success');
    } catch (e) {
      console.error('Error generando PDF:', e);
      if (window.toast) toast('⚠️ Error al generar PDF: '+e.message,'error');
    }
  }

  async function _documentoPdfBase64(cfg){
    const pdf = await _renderToPdf(cfg);
    const dataUri = pdf.output('datauristring');
    return (dataUri||'').split(',')[1] || null;
  }

  // ─── Exponer en window ─────────────────────────────────────
  window._buildHtmlDocumento    = _buildHtmlDocumento;
  window._imprimirDocumento     = _imprimirDocumento;
  window._descargarPdfDocumento = _descargarPdfDocumento;
  window._documentoPdfBase64    = _documentoPdfBase64;
})();
