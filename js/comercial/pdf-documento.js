// ─── Generador unificado de PDF para presupuestos / facturas / albaranes ───
// Replica el formato profesional del modelo Jordi Instalaciones:
//   · Cabecera empresa arriba a la derecha (compacta)
//   · Título grande del documento + fecha a la derecha
//   · Subtítulo/referencia debajo
//   · Bloque doble: EMPRESA INSTALADORA  |  CLIENTE
//   · Capítulos numerados (01, 02, …) con descripciones en prosa
//   · IMPORTE por capítulo en banda azul claro
//   · Página final: Resumen económico + Condiciones + Zona de firma
//   · Pie de página repetido

(function(){
  const W = 210, H = 297;
  const ML = 18, MR = 18;
  const azul = [27, 79, 216];
  const azulSuave = [232, 240, 254];
  const azulBanda = [219, 234, 254];
  const gris = [100, 116, 139];
  const grisClaro = [226, 232, 240];
  const negro = [30, 41, 59];

  function _fmtE(n) {
    return (Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  }
  function _fechaLarga(f) {
    if (!f) return '—';
    try {
      return new Date(f).toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});
    } catch(e){ return '—'; }
  }

  function _drawCabecera(doc) {
    const E = (window.EMPRESA || (typeof EMPRESA !== 'undefined' ? EMPRESA : null)) || {};
    // Bloque empresa pequeño arriba derecha
    doc.setFontSize(9);
    doc.setTextColor(...negro);
    doc.setFont(undefined, 'bold');
    doc.text((E.nombre||'').toUpperCase(), W-MR, 14, {align:'right'});
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...gris);
    const lines = [];
    if (E.cif) lines.push('CIF '+E.cif);
    const dir = [E.direccion, E.cp && (E.cp+' '+(E.municipio||'')), E.provincia && '('+E.provincia+')'].filter(Boolean).join(' · ');
    if (dir) lines.push(dir);
    if (E.telefono) lines.push('Tel. '+E.telefono);
    if (E.email) lines.push(E.email);
    lines.forEach((t,i)=> doc.text(t, W-MR, 18.5+i*3.5, {align:'right'}));
  }

  function _drawPie(doc, paginaIdx, totalPag) {
    const E = (window.EMPRESA || (typeof EMPRESA !== 'undefined' ? EMPRESA : null)) || {};
    const fy = H - 14;
    doc.setDrawColor(...grisClaro);
    doc.setLineWidth(0.3);
    doc.line(ML, fy-4, W-MR, fy-4);
    doc.setFontSize(7.5);
    doc.setTextColor(...gris);
    const partes = [E.nombre, E.cif && ('CIF '+E.cif), E.direccion, E.telefono, E.email].filter(Boolean);
    doc.text(partes.join(' · '), W/2, fy, {align:'center'});
    doc.text('Página '+paginaIdx+' de '+totalPag, W/2, fy+4, {align:'center'});
  }

  // ── Reescribe los pies con el total final de páginas ──
  function _stampPies(doc) {
    const total = doc.internal.getNumberOfPages();
    for (let i=1; i<=total; i++) {
      doc.setPage(i);
      _drawPie(doc, i, total);
    }
  }

  function _checkPage(doc, y, needed) {
    if (y + needed > H - 22) {
      doc.addPage();
      _drawCabecera(doc);
      return 36;
    }
    return y;
  }

  function _agruparCapitulos(lineas) {
    const caps = [];
    let actual = null;
    let huerfanas = [];
    lineas.forEach(l => {
      if (l.tipo === 'capitulo') {
        if (actual) caps.push(actual);
        actual = { titulo: l.titulo || 'Capítulo', items: [], importe: 0 };
      } else {
        const sub = (l.cant||0)*(l.precio||0)*(1-((l.dto||0)/100));
        const conIva = sub * (1 + ((l.iva||0)/100));
        const item = { desc: l.desc||'', cant: l.cant||0, precio: l.precio||0, iva: l.iva||0, dto: l.dto||0, sub, conIva };
        if (actual) { actual.items.push(item); actual.importe += conIva; }
        else huerfanas.push(item);
      }
    });
    if (actual) caps.push(actual);
    return { capitulos: caps, huerfanas };
  }

  async function _buildPdfDocumento(cfg) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','mm','a4');
    const tipo = cfg.tipo || 'DOCUMENTO';
    const E = (window.EMPRESA || (typeof EMPRESA !== 'undefined' ? EMPRESA : null)) || {};

    // ── Cabecera primera página ──
    _drawCabecera(doc);

    // ── Título grande izquierda + fecha derecha ──
    let y = 48;
    doc.setFont(undefined,'bold');
    doc.setFontSize(24);
    doc.setTextColor(...azul);
    doc.text(tipo, ML, y);

    doc.setFontSize(11);
    doc.setTextColor(...negro);
    doc.setFont(undefined,'normal');
    doc.text(_fechaLarga(cfg.fecha), W-MR, y-3, {align:'right'});
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text('Fecha', W-MR, y+1, {align:'right'});
    if (cfg.numero) {
      doc.setFontSize(9);
      doc.setTextColor(...negro);
      doc.text('Nº ' + cfg.numero, W-MR, y+6, {align:'right'});
    }

    y += 6;

    // ── Subtítulo / referencia ──
    if (cfg.titulo) {
      y += 4;
      doc.setFontSize(12);
      doc.setTextColor(...negro);
      doc.setFont(undefined,'bold');
      const tLines = doc.splitTextToSize(cfg.titulo, W-ML-MR);
      doc.text(tLines, ML, y);
      y += tLines.length * 5.5;
      doc.setFont(undefined,'normal');
    }

    y += 8;

    // ── Bloque doble: EMPRESA INSTALADORA | CLIENTE ──
    const colW = (W - ML - MR - 6) / 2;
    const cx1 = ML, cx2 = ML + colW + 6;
    const boxY = y;
    const boxH = 40;

    // cabeceras
    doc.setFillColor(...azulSuave);
    doc.rect(cx1, boxY, colW, 6, 'F');
    doc.rect(cx2, boxY, colW, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...azul);
    doc.setFont(undefined,'bold');
    doc.text('EMPRESA INSTALADORA', cx1+3, boxY+4);
    doc.text('CLIENTE', cx2+3, boxY+4);
    doc.setFont(undefined,'normal');

    // contenido empresa
    let ey = boxY + 11;
    doc.setFontSize(9.5);
    doc.setTextColor(...negro);
    doc.setFont(undefined,'bold');
    doc.text(E.nombre||'—', cx1+3, ey); ey += 4.5;
    doc.setFont(undefined,'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...gris);
    if (E.cif) { doc.text('CIF: '+E.cif, cx1+3, ey); ey += 3.8; }
    if (E.direccion) {
      const empDir = [E.direccion, [E.cp, E.municipio].filter(Boolean).join(' '), E.provincia && '('+E.provincia+')'].filter(Boolean).join(' – ');
      const dl = doc.splitTextToSize(empDir, colW-6);
      doc.text(dl, cx1+3, ey); ey += dl.length*3.8;
    }
    if (E.telefono) { doc.text('Tel.: '+E.telefono, cx1+3, ey); ey += 3.8; }
    if (E.email) { doc.text(E.email, cx1+3, ey); ey += 3.8; }

    // contenido cliente
    const c = cfg.cliente || {};
    let cy = boxY + 11;
    doc.setFontSize(9.5);
    doc.setTextColor(...negro);
    doc.setFont(undefined,'bold');
    doc.text(c.nombre||'—', cx2+3, cy); cy += 4.5;
    doc.setFont(undefined,'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...gris);
    if (c.nif) { doc.text((c.nif.length<=9?'DNI: ':'NIF: ')+c.nif, cx2+3, cy); cy += 3.8; }
    if (c.direccion) {
      const cl = doc.splitTextToSize(c.direccion, colW-6);
      doc.text(cl, cx2+3, cy); cy += cl.length*3.8;
    }
    const loc = [c.cp, c.municipio, c.provincia && '('+c.provincia+')'].filter(Boolean).join(' ');
    if (loc) { doc.text(loc, cx2+3, cy); cy += 3.8; }
    if (c.email) { doc.text(c.email, cx2+3, cy); cy += 3.8; }
    if (c.telefono) { doc.text('Tel.: '+c.telefono, cx2+3, cy); cy += 3.8; }

    // marco
    const realH = Math.max(ey, cy) - boxY + 4;
    doc.setDrawColor(...grisClaro);
    doc.setLineWidth(0.3);
    doc.rect(cx1, boxY, colW, realH);
    doc.rect(cx2, boxY, colW, realH);

    y = boxY + realH + 12;

    // ── Capítulos / Líneas ──
    const { capitulos, huerfanas } = _agruparCapitulos(cfg.lineas || []);

    if (capitulos.length === 0 && huerfanas.length === 0) {
      // nada
    } else if (capitulos.length === 0) {
      // Sin capítulos → tabla simple
      y = _renderTablaSimple(doc, y, huerfanas);
    } else {
      // Render por capítulos
      capitulos.forEach((cap, idx) => {
        y = _renderCapitulo(doc, y, cap, idx+1);
      });
      if (huerfanas.length) {
        y = _checkPage(doc, y, 30);
        y += 4;
        y = _renderTablaSimple(doc, y, huerfanas);
      }
    }

    // ── Página final: Resumen + Condiciones + Firma ──
    const necesitaPaginaFinal = cfg.condiciones || cfg.firma_zona;
    const altoFinal = 80 + (cfg.condiciones ? cfg.condiciones.length*12 : 0) + (cfg.firma_zona ? 40 : 0);

    if (necesitaPaginaFinal && y + altoFinal > H - 25) {
      doc.addPage();
      _drawCabecera(doc);
      y = 36;
    } else {
      y += 8;
    }

    // ── Resumen económico ──
    if (cfg.base_imponible != null || cfg.total != null) {
      doc.setFontSize(13);
      doc.setTextColor(...azul);
      doc.setFont(undefined,'bold');
      doc.text('Resumen económico', ML, y);
      doc.setFont(undefined,'normal');
      y += 5;
      doc.setDrawColor(...azul);
      doc.setLineWidth(0.4);
      doc.line(ML, y, ML+50, y);
      y += 6;

      const filas = [
        ['Subtotal (sin IVA)', _fmtE(cfg.base_imponible||0), false],
        ['IVA', _fmtE(cfg.total_iva||0), false],
        ['TOTAL CON IVA', _fmtE(cfg.total||0), true],
      ];
      filas.forEach(([k,v,bold]) => {
        if (bold) {
          doc.setFillColor(...azul);
          doc.rect(ML, y-4.5, W-ML-MR, 8, 'F');
          doc.setTextColor(255,255,255);
          doc.setFont(undefined,'bold');
          doc.setFontSize(11);
          doc.text(k, ML+4, y+1);
          doc.text(v, W-MR-4, y+1, {align:'right'});
          doc.setFont(undefined,'normal');
        } else {
          doc.setFontSize(10);
          doc.setTextColor(...negro);
          doc.text(k, ML+4, y);
          doc.text(v, W-MR-4, y, {align:'right'});
          doc.setDrawColor(...grisClaro);
          doc.setLineWidth(0.2);
          doc.line(ML, y+2.5, W-MR, y+2.5);
        }
        y += bold ? 12 : 7;
      });
      y += 4;
    }

    // ── Observaciones ──
    if (cfg.observaciones) {
      y = _checkPage(doc, y, 20);
      doc.setFontSize(11);
      doc.setTextColor(...azul);
      doc.setFont(undefined,'bold');
      doc.text('Observaciones', ML, y);
      doc.setFont(undefined,'normal');
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(...negro);
      const ol = doc.splitTextToSize(cfg.observaciones, W-ML-MR);
      doc.text(ol, ML, y);
      y += ol.length*4 + 6;
    }

    // ── Condiciones ──
    if (cfg.condiciones && cfg.condiciones.length) {
      y = _checkPage(doc, y, 30);
      doc.setFontSize(13);
      doc.setTextColor(...azul);
      doc.setFont(undefined,'bold');
      doc.text('Condiciones', ML, y);
      doc.setFont(undefined,'normal');
      y += 5;
      doc.setDrawColor(...azul);
      doc.setLineWidth(0.4);
      doc.line(ML, y, ML+30, y);
      y += 6;

      cfg.condiciones.forEach(([k,v]) => {
        const labelW = 55;
        const valLines = doc.splitTextToSize(v||'', W-ML-MR-labelW-4);
        const filaH = Math.max(valLines.length*4 + 3, 8);
        y = _checkPage(doc, y, filaH+2);
        doc.setFillColor(248,250,252);
        doc.rect(ML, y-4, W-ML-MR, filaH, 'F');
        doc.setFontSize(9);
        doc.setTextColor(...negro);
        doc.setFont(undefined,'bold');
        doc.text(k, ML+3, y);
        doc.setFont(undefined,'normal');
        doc.setTextColor(...gris);
        doc.text(valLines, ML+labelW, y);
        y += filaH + 1;
      });
      y += 6;
    }

    // ── Zona de firma ──
    if (cfg.firma_zona) {
      y = _checkPage(doc, y, 36);
      const fcolW = (W - ML - MR - 6) / 2;
      const fx1 = ML, fx2 = ML + fcolW + 6;

      doc.setFontSize(9);
      doc.setTextColor(...negro);
      doc.setFont(undefined,'bold');
      doc.text('Por la empresa instaladora', fx1, y);
      doc.text('Aceptación del cliente', fx2, y);
      doc.setFont(undefined,'normal');
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(...gris);
      doc.text(E.nombre||'', fx1, y);
      doc.text('Fecha y firma:', fx2, y);
      y += 4;
      if (E.titular) doc.text(E.titular, fx1, y);

      // Sello de firma digital de la empresa
      const cert = (typeof _certActual !== 'undefined') ? _certActual : null;
      if (cert) {
        y += 4;
        const sy = y;
        doc.setDrawColor(30, 64, 175);
        doc.setLineWidth(0.4);
        doc.roundedRect(fx1, sy, fcolW - 4, 18, 1.5, 1.5, 'S');
        doc.setFontSize(7);
        doc.setTextColor(30, 64, 175);
        doc.setFont(undefined,'bold');
        doc.text('FIRMADO DIGITALMENTE', fx1 + 3, sy + 4);
        doc.setFont(undefined,'normal');
        doc.setFontSize(6.5);
        doc.text(cert.titular || E.nombre || '', fx1 + 3, sy + 8);
        if (cert.nif_titular) doc.text('NIF: ' + cert.nif_titular, fx1 + 3, sy + 11.5);
        doc.text('Fecha: ' + new Date().toLocaleDateString('es-ES'), fx1 + 3, sy + 15);
        y = sy + 20;
      } else {
        y += 18;
      }

      // Si está aceptado, mostrar bloque verde con datos firma
      if (cfg.firma_aceptada) {
        const fa = cfg.firma_aceptada;
        const fd = fa.dispositivo || {};
        // bloque debajo
        y += 2;
        doc.setFillColor(220, 252, 231);
        doc.setDrawColor(34, 197, 94);
        doc.setLineWidth(0.3);
        doc.roundedRect(ML, y, W-ML-MR, 26, 2, 2, 'FD');
        doc.setFontSize(9);
        doc.setTextColor(22, 101, 52);
        doc.setFont(undefined,'bold');
        doc.text('PRESUPUESTO ACEPTADO POR EL CLIENTE', ML+4, y+5);
        doc.setFont(undefined,'normal');
        doc.setFontSize(8);
        doc.setTextColor(...negro);
        let fy = y + 10;
        doc.text('Firmado por: '+(fa.nombre||'—'), ML+4, fy); fy+=4;
        doc.text('Fecha: '+(fa.fecha?new Date(fa.fecha).toLocaleString('es-ES'):'—'), ML+4, fy); fy+=4;
        if (fa.ip) { doc.text('IP: '+fa.ip, ML+4, fy); fy+=4; }
        // imagen firma (fetch como blob para evitar CORS)
        if (fa.url) {
          try {
            const resp = await fetch(fa.url);
            const blob = await resp.blob();
            const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
            doc.addImage(dataUrl, 'PNG', W-MR-55, y+4, 50, 18);
          } catch(e){ console.warn('No se pudo insertar firma en PDF:', e); }
        }
        y += 30;
      }
    }

    // ── Pies de página con numeración correcta ──
    _stampPies(doc);

    return doc;
  }

  function _renderCapitulo(doc, y, cap, num) {
    // Banda título capítulo
    y = _checkPage(doc, y, 14);
    const bandH = 9;
    // Cuadrado número azul
    doc.setFillColor(...azul);
    doc.rect(ML, y, 16, bandH, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont(undefined,'bold');
    doc.setFontSize(11);
    doc.text(String(num).padStart(2,'0'), ML+8, y+6.2, {align:'center'});

    // Banda título
    doc.setFillColor(...azulBanda);
    doc.rect(ML+16, y, W-ML-MR-16, bandH, 'F');
    doc.setTextColor(...azul);
    doc.setFontSize(10);
    doc.setFont(undefined,'bold');
    const tituloUp = (cap.titulo||'').toUpperCase();
    const tlines = doc.splitTextToSize(tituloUp, W-ML-MR-22);
    doc.text(tlines[0]||'', ML+20, y+6);
    doc.setFont(undefined,'normal');

    y += bandH + 5;

    // Descripciones de cada ítem como prosa
    doc.setFontSize(9.5);
    doc.setTextColor(...negro);
    cap.items.forEach(it => {
      if (!it.desc) return;
      // Se respeta el texto tal cual; los saltos de línea \n vienen como párrafos
      const parrafos = String(it.desc).split(/\n+/);
      parrafos.forEach(p => {
        if (!p.trim()) return;
        const lines = doc.splitTextToSize(p.trim(), W-ML-MR);
        y = _checkPage(doc, y, lines.length*4.2+2);
        doc.text(lines, ML, y);
        y += lines.length*4.2 + 2;
      });
    });

    // Banda IMPORTE
    y += 3;
    y = _checkPage(doc, y, 12);
    doc.setFillColor(...azulBanda);
    doc.rect(ML, y, W-ML-MR, 8, 'F');
    doc.setTextColor(...azul);
    doc.setFont(undefined,'bold');
    doc.setFontSize(10);
    doc.text('IMPORTE: ' + _fmtE(cap.importe), ML+4, y+5.5);
    doc.setFont(undefined,'normal');
    y += 14;

    return y;
  }

  function _renderTablaSimple(doc, y, items) {
    const body = items.map(it => [
      it.desc,
      {content: String(it.cant), styles:{halign:'right'}},
      {content: _fmtE(it.precio), styles:{halign:'right'}},
      {content: it.dto?(it.dto+'%'):'—', styles:{halign:'right'}},
      {content: (it.iva||0)+'%', styles:{halign:'right'}},
      {content: _fmtE(it.conIva), styles:{halign:'right',fontStyle:'bold'}},
    ]);
    doc.autoTable({
      startY: y,
      margin: {left:ML, right:MR},
      head: [['Descripción','Cant.','Precio','Dto.','IVA','Total']],
      body,
      headStyles: {fillColor:azul, textColor:[255,255,255], fontSize:9, fontStyle:'bold', cellPadding:3},
      bodyStyles: {fontSize:9, textColor:negro, cellPadding:2.5},
      alternateRowStyles: {fillColor:[248,250,252]},
      columnStyles: {
        0: {cellWidth:'auto'},
        1: {cellWidth:18, halign:'right'},
        2: {cellWidth:24, halign:'right'},
        3: {cellWidth:16, halign:'right'},
        4: {cellWidth:16, halign:'right'},
        5: {cellWidth:28, halign:'right'},
      },
      theme: 'grid',
      styles: {lineColor:grisClaro, lineWidth:0.3},
      didDrawPage: () => _drawCabecera(doc),
    });
    return doc.lastAutoTable.finalY + 6;
  }

  // exponer global
  window._buildPdfDocumento = _buildPdfDocumento;
  window._fmtEPdf = _fmtE;
})();
