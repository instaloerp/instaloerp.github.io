/**
 * MÓDULO SEPA
 * - Mandatos SEPA (adeudo directo para clientes, autorización para proveedores)
 * - Generación de remesa SEPA (XML pain.008 + Excel) desde facturas
 */

// ═══════════════════════════════════════════════
//  MANDATO SEPA — Generación y firma
// ═══════════════════════════════════════════════

function generarMandatoSEPA(tipo) {
  // tipo: 'cliente' o 'proveedor'
  const entityId = tipo === 'cliente' ? cliActualId : provActualId;
  if (!entityId) { toast('Selecciona primero un ' + tipo, 'error'); return; }

  // Para cliente sin cuenta: permitir generar enlace de firma (el cliente facilitará IBAN al firmar)
  let _cliSinCuenta = false;
  if (tipo === 'cliente' && cliActualId) {
    const cuentas = _getCuentasCli(cliActualId);
    _cliSinCuenta = !cuentas || cuentas.length === 0;
  }

  document.getElementById('sepa_tipo').value = tipo;
  document.getElementById('sepa_entity_id').value = entityId;

  // Obtener datos de la entidad
  let entity, nombre, iban;
  if (tipo === 'cliente') {
    entity = clientes.find(c => c.id === entityId);
    nombre = entity?.nombre || '—';
    iban = entity?.iban || '';
  } else {
    entity = (proveedores||[]).find(p => p.id === entityId);
    nombre = entity?.nombre || '—';
    iban = entity?.iban || '';
  }

  // Resumen
  const cuentaEmpresa = (cuentasBancarias||[]).find(b => b.predeterminada) || (cuentasBancarias||[])[0];
  const ibanFormatted = iban ? iban.replace(/(.{4})/g, '$1 ').trim() : '<span style="color:var(--rojo)">Sin IBAN — edita la ficha para añadirlo</span>';

  let html = `<div style="background:var(--gris-50);border-radius:8px;padding:14px">`;
  if (tipo === 'cliente') {
    html += `<div style="font-size:12px;color:var(--gris-500);margin-bottom:6px">Mandato de adeudo directo SEPA</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">${nombre}</div>
      <div style="font-size:11.5px"><strong>Acreedor:</strong> ${EMPRESA?.nombre||'—'} · ${cuentaEmpresa?.iban?cuentaEmpresa.iban.replace(/(.{4})/g,'$1 ').trim():'Sin cuenta'}</div>
      <div style="font-size:11.5px"><strong>Deudor:</strong> ${nombre} · ${ibanFormatted}</div>`;
  } else {
    html += `<div style="font-size:12px;color:var(--gris-500);margin-bottom:6px">Mandato de autorización SEPA</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">${nombre}</div>
      <div style="font-size:11.5px"><strong>Emisor (nosotros):</strong> ${EMPRESA?.nombre||'—'} — autorizamos al proveedor a emitir giros</div>
      <div style="font-size:11.5px"><strong>Proveedor:</strong> ${nombre}</div>`;
  }

  // Mostrar estado actual del mandato si existe
  if (entity?.mandato_sepa_estado === 'firmado') {
    html += `<div style="margin-top:8px;padding:6px 10px;background:var(--verde-light,#ecfdf5);border-radius:6px;font-size:12px;color:var(--verde)">✅ Mandato firmado el ${entity.mandato_sepa_fecha||'—'}</div>`;
  } else if (entity?.mandato_sepa_estado === 'pendiente') {
    html += `<div style="margin-top:8px;padding:6px 10px;background:#fef3c7;border-radius:6px;font-size:12px;color:#92400e">⏳ Pendiente de firma</div>`;
  }
  html += `</div>`;

  document.getElementById('sepa_resumen').innerHTML = html;

  // Adaptar opción 2 según tipo (cliente: firma online + email / proveedor: enviar por email)
  const opFirma = document.getElementById('sepa_opcion_firma');
  opFirma.style.display = '';
  if (tipo === 'cliente') {
    const _subtitle = _cliSinCuenta
      ? 'El cliente no tiene cuenta bancaria registrada. Al abrir el enlace podrá introducirla y firmar el mandato en un solo paso.'
      : 'Envía el mandato al cliente para que lo firme y lo devuelva';
    opFirma.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">✍️ Enviar para firma</div>
      <p style="font-size:12px;color:var(--gris-400);margin-bottom:10px">${_subtitle}</p>
      <button class="btn btn-sm" onclick="enviarMandatoParaFirma()" style="background:var(--verde);color:#fff;border:none;font-weight:700">📧 Generar enlace de firma</button>
      <div id="sepa_firma_link" style="display:none;margin-top:10px;padding:10px;background:var(--gris-50);border-radius:8px;font-size:12px;word-break:break-all"></div>`;
  } else {
    opFirma.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">📧 Enviar por email al proveedor</div>
      <p style="font-size:12px;color:var(--gris-400);margin-bottom:10px">Envía el mandato por email al proveedor para que lo firme y lo devuelva</p>
      <button class="btn btn-sm" onclick="enviarMandatoEmailProveedor()" style="background:var(--verde);color:#fff;border:none;font-weight:700">📧 Enviar por email</button>
      <div id="sepa_firma_link" style="display:none;margin-top:10px;padding:10px;background:var(--gris-50);border-radius:8px;font-size:12px;word-break:break-all"></div>`;
  }

  // Reset
  const _firmaLink = document.getElementById('sepa_firma_link');
  if (_firmaLink) _firmaLink.style.display = 'none';
  document.getElementById('sepa_file').value = '';

  openModal('mMandatoSEPA');
}

// ─── Generar PDF del mandato ─────────────────
async function imprimirMandatoSEPA() {
  const tipo = document.getElementById('sepa_tipo').value;
  const entityId = parseInt(document.getElementById('sepa_entity_id').value);

  let entity;
  if (tipo === 'cliente') {
    entity = clientes.find(c => c.id === entityId);
  } else {
    entity = (proveedores||[]).find(p => p.id === entityId);
  }
  if (!entity) { toast('Entidad no encontrada', 'error'); return; }

  const cuentaEmpresa = (cuentasBancarias||[]).find(b => b.predeterminada) || (cuentasBancarias||[])[0];
  const ref = entity.mandato_sepa_ref || ('SEPA-' + (tipo === 'cliente' ? 'C' : 'P') + '-' + entityId + '-' + Date.now().toString(36).toUpperCase());

  // Proveedor: al generar el PDF ya lo firmamos nosotros → marcar como firmado
  if (tipo === 'proveedor') {
    await _marcarMandatoProvFirmado(entityId, ref);
  }
  const hoy = new Date().toLocaleDateString('es-ES');
  const dirEmpresa = [EMPRESA?.direccion, [EMPRESA?.cp, EMPRESA?.municipio].filter(Boolean).join(' '), EMPRESA?.provincia].filter(Boolean).join(', ');
  const logoHtml = EMPRESA?.logo_url
    ? `<img src="${EMPRESA.logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:6px">`
    : `<div style="width:50px;height:50px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;

  const esCliente = tipo === 'cliente';
  const titulo = esCliente ? 'MANDATO DE ADEUDO DIRECTO SEPA' : 'ORDEN DE DOMICILIACIÓN DE ADEUDO DIRECTO SEPA';
  const subtitulo = esCliente
    ? 'Mediante la firma de este mandato, el deudor autoriza al acreedor a enviar instrucciones a la entidad bancaria del deudor para adeudar su cuenta.'
    : 'Mediante la firma de este documento, autorizamos al proveedor a emitir adeudos directos contra nuestra cuenta bancaria.';

  // Datos del acreedor / deudor
  const acreedor = {
    nombre: EMPRESA?.nombre || '—',
    cif: EMPRESA?.cif || '—',
    direccion: dirEmpresa,
    iban: cuentaEmpresa?.iban ? cuentaEmpresa.iban.replace(/(.{4})/g, '$1 ').trim() : '—',
    bic: cuentaEmpresa?.bic || '—',
    entidad: cuentaEmpresa?.entidad || cuentaEmpresa?.nombre || '—'
  };

  const deudor = {
    nombre: entity.nombre || '—',
    cif: entity.nif || entity.cif || '—',
    direccion: entity.direccion_fiscal || entity.direccion || '—',
    iban: entity.iban ? entity.iban.replace(/(.{4})/g, '$1 ').trim() : '________________ ________________ ________________',
    bic: entity.bic || '________________',
    entidad: entity.banco_entidad || '________________'
  };

  // Si es proveedor, intercambiar roles
  const acreedorDoc = esCliente ? acreedor : deudor;
  const deudorDoc = esCliente ? deudor : acreedor;

  const win = window.open('', '_blank', 'width=850,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>Mandato SEPA ${ref}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:A4;margin:15mm}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;font-size:12px}
.page{max-width:210mm;margin:0 auto;background:#fff;padding:30px 36px;min-height:297mm}
.btn-bar{text-align:center;padding:14px;background:#f5f5f5}
.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}
table.datos{width:100%;border-collapse:collapse;margin-bottom:18px}
table.datos th{background:#f1f5f9;padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;text-align:left;border:1px solid #e2e8f0}
table.datos td{padding:8px 12px;border:1px solid #e2e8f0;font-size:12px}
.firma-box{border:1.5px solid #e2e8f0;border-radius:8px;padding:20px;margin-top:20px}
@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}
</style></head><body>
<div class="no-print btn-bar">
  <button style="background:#1e40af;color:#fff" onclick="window.print()">🖨️ Imprimir</button>
  <button style="background:#e2e8f0;color:#475569" onclick="window.close()">✕ Cerrar</button>
</div>
<div class="page">
  <!-- Cabecera -->
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
    ${logoHtml}
    <div>
      <div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div>
      <div style="font-size:10px;color:#64748b">${dirEmpresa} · CIF: ${EMPRESA?.cif||''}</div>
    </div>
  </div>

  <!-- Título -->
  <div style="background:#1e40af;color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:20px;text-align:center">
    <div style="font-size:14px;font-weight:800;letter-spacing:1px">${titulo}</div>
    <div style="font-size:10px;opacity:0.8;margin-top:4px">Referencia del mandato: <strong>${ref}</strong></div>
  </div>

  <p style="font-size:11px;color:#475569;margin-bottom:18px;line-height:1.5">${subtitulo}</p>

  <!-- Datos del acreedor -->
  <table class="datos">
    <tr><th colspan="2" style="background:#1e40af;color:#fff;font-size:11px">DATOS DEL ACREEDOR</th></tr>
    <tr><td style="width:130px;font-weight:600">Nombre</td><td>${acreedorDoc.nombre}</td></tr>
    <tr><td style="font-weight:600">Identificador (CIF)</td><td>${acreedorDoc.cif}</td></tr>
    <tr><td style="font-weight:600">Dirección</td><td>${acreedorDoc.direccion}</td></tr>
  </table>

  <!-- Datos del deudor -->
  <table class="datos">
    <tr><th colspan="2" style="background:#92400e;color:#fff;font-size:11px">DATOS DEL DEUDOR</th></tr>
    <tr><td style="width:130px;font-weight:600">Nombre</td><td>${deudorDoc.nombre}</td></tr>
    <tr><td style="font-weight:600">NIF/CIF</td><td>${deudorDoc.cif}</td></tr>
    <tr><td style="font-weight:600">Dirección</td><td>${deudorDoc.direccion}</td></tr>
    <tr><td style="font-weight:600">IBAN</td><td style="font-family:monospace;letter-spacing:1px;font-size:13px">${deudorDoc.iban}</td></tr>
    <tr><td style="font-weight:600">BIC/SWIFT</td><td style="font-family:monospace">${deudorDoc.bic}</td></tr>
    <tr><td style="font-weight:600">Entidad bancaria</td><td>${deudorDoc.entidad}</td></tr>
  </table>

  <!-- Tipo de pago -->
  <table class="datos">
    <tr><th colspan="2" style="font-size:11px">TIPO DE PAGO</th></tr>
    <tr><td style="width:130px;font-weight:600">Tipo de adeudo</td><td>☑ Recurrente &nbsp;&nbsp; ☐ Puntual</td></tr>
    <tr><td style="font-weight:600">Fecha del mandato</td><td>${hoy}</td></tr>
  </table>

  <!-- Texto legal -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:20px;font-size:10px;color:#64748b;line-height:1.5">
    <strong>Nota:</strong> Sus derechos en relación con el presente mandato están recogidos en un documento que puede obtener de su entidad bancaria. El plazo para la presentación previa de la información (pre-notificación) sobre un adeudo en su cuenta es de al menos 14 días naturales. Podrá solicitar a su entidad bancaria que devuelvan cualquier adeudo realizado sin autorización. La reclamación deberá efectuarse en un plazo de 8 semanas a partir de la fecha de adeudo (13 meses en caso de operaciones no autorizadas).
  </div>

  <!-- Firma -->
  <div class="firma-box">
    <div style="font-weight:700;font-size:12px;margin-bottom:16px">FIRMA DEL ${esCliente ? 'DEUDOR' : 'EMISOR'}</div>
    <div style="display:flex;gap:30px">
      <div style="flex:1">
        <div style="font-size:10px;color:#64748b;margin-bottom:6px">Lugar y fecha</div>
        <div style="border-bottom:1px solid #1a1a2e;height:30px;margin-bottom:12px"></div>
      </div>
      <div style="flex:1">
        <div style="font-size:10px;color:#64748b;margin-bottom:6px">Firma</div>
        <div style="border-bottom:1px solid #1a1a2e;height:30px;margin-bottom:12px"></div>
      </div>
    </div>
    <div style="font-size:10px;color:#64748b">Nombre: ${esCliente ? deudorDoc.nombre : acreedorDoc.nombre}</div>
    <div style="font-size:10px;color:#64748b">NIF/CIF: ${esCliente ? deudorDoc.cif : acreedorDoc.cif}</div>
  </div>
</div></body></html>`);
  win.document.close();

  // Generar PDF con jsPDF y firmar
  if (typeof firmarYGuardarPDF === 'function' && window.jspdf) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p','mm','a4');
      const ML=15,MR=15,W=210;
      let y=20;
      // Cabecera empresa
      doc.setFontSize(16);doc.setFont(undefined,'bold');doc.setTextColor(30,64,175);
      doc.text(EMPRESA?.nombre||'',ML,y);y+=6;
      doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(71,85,105);
      doc.text(`CIF: ${EMPRESA?.cif||''} · ${dirEmpresa}`,ML,y);y+=10;
      // Título
      doc.setFillColor(30,64,175);doc.rect(ML,y-4,W-ML-MR,14,'F');
      doc.setFontSize(11);doc.setFont(undefined,'bold');doc.setTextColor(255,255,255);
      doc.text(titulo,W/2,y+3,{align:'center'});
      doc.setFontSize(8);doc.text('Referencia: '+ref,W/2,y+8,{align:'center'});y+=18;
      // Subtítulo
      doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(71,85,105);
      const subLines=doc.splitTextToSize(subtitulo,W-ML-MR);doc.text(subLines,ML,y);y+=subLines.length*4+6;
      // Tabla acreedor
      doc.autoTable({startY:y,head:[['DATOS DEL ACREEDOR','']],body:[['Nombre',acreedorDoc.nombre],['CIF',acreedorDoc.cif],['Dirección',acreedorDoc.direccion]],styles:{fontSize:9},headStyles:{fillColor:[30,64,175]},columnStyles:{0:{cellWidth:40,fontStyle:'bold'}},margin:{left:ML,right:MR}});
      y=doc.lastAutoTable.finalY+4;
      // Tabla deudor
      doc.autoTable({startY:y,head:[['DATOS DEL DEUDOR','']],body:[['Nombre',deudorDoc.nombre],['NIF/CIF',deudorDoc.cif],['Dirección',deudorDoc.direccion],['IBAN',deudorDoc.iban],['BIC/SWIFT',deudorDoc.bic],['Entidad bancaria',deudorDoc.entidad]],styles:{fontSize:9},headStyles:{fillColor:[146,64,14]},columnStyles:{0:{cellWidth:40,fontStyle:'bold'}},margin:{left:ML,right:MR}});
      y=doc.lastAutoTable.finalY+4;
      // Tipo de pago
      doc.autoTable({startY:y,head:[['TIPO DE PAGO','']],body:[['Tipo de adeudo','Recurrente'],['Fecha',hoy]],styles:{fontSize:9},columnStyles:{0:{cellWidth:40,fontStyle:'bold'}},margin:{left:ML,right:MR}});
      y=doc.lastAutoTable.finalY+6;
      // Texto legal
      doc.setFontSize(7.5);doc.setTextColor(100,116,139);
      const legalText='Nota: Sus derechos en relación con el presente mandato están recogidos en un documento que puede obtener de su entidad bancaria.';
      const legalLines=doc.splitTextToSize(legalText,W-ML-MR);doc.text(legalLines,ML,y);y+=legalLines.length*3.5+8;
      // Firma
      doc.setFontSize(10);doc.setFont(undefined,'bold');doc.setTextColor(0,0,0);
      doc.text('FIRMA DEL '+(esCliente?'DEUDOR':'EMISOR'),ML,y);y+=8;
      doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(100,116,139);
      doc.text('Lugar y fecha:',ML,y);doc.line(ML+30,y,ML+90,y);
      doc.text('Firma:',ML+100,y);doc.line(ML+115,y,W-MR,y);y+=8;
      doc.text('Nombre: '+(esCliente?deudorDoc.nombre:acreedorDoc.nombre),ML,y);y+=4;
      doc.text('NIF/CIF: '+(esCliente?deudorDoc.cif:acreedorDoc.cif),ML,y);

      const pdfData=doc.output('arraybuffer');
      firmarYGuardarPDF(pdfData,{
        tipo_documento:'mandato_sepa',
        documento_id:entityId,
        numero:ref,
        entidad_tipo:tipo,
        entidad_id:entityId,
        entidad_nombre:entity.nombre||''
      }).then(r=>{if(r&&r.success&&r.firma_info)toast('🔏 Mandato SEPA firmado digitalmente ✓','success');else if(r&&!r.firmado)toast('📄 Mandato SEPA guardado (sin firma digital)','info');}).catch(e=>{console.error('Error firmando mandato SEPA:',e);toast('⚠️ Error al firmar mandato SEPA','error');});
    } catch(e) { console.error('Error generando PDF mandato SEPA:',e); }
  }
}

// ─── Enviar mandato para firma (cliente) ─────────────────
async function enviarMandatoParaFirma() {
  const entityId = parseInt(document.getElementById('sepa_entity_id').value);
  const tipo = document.getElementById('sepa_tipo').value;
  if (tipo !== 'cliente') return;

  const c = clientes.find(x => x.id === entityId);
  if (!c) return;

  // Generar token único
  const token = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2));
  const ref = 'SEPA-C-' + entityId + '-' + Date.now().toString(36).toUpperCase();

  // Cuenta destino: la que se estaba gestionando desde la ficha, o la predeterminada
  let cuentaDestinoId = window._mandatoCuentaId || null;
  if (!cuentaDestinoId) {
    const pred = (cuentasBancariasEntidad||[]).find(cb => cb.tipo_entidad==='cliente' && cb.entidad_id===entityId && cb.predeterminada);
    cuentaDestinoId = pred ? pred.id : null;
  }

  const { error } = await sb.from('clientes').update({
    mandato_sepa_token: token,
    mandato_sepa_ref: ref,
    mandato_sepa_estado: 'pendiente',
    mandato_sepa_fecha: new Date().toISOString().split('T')[0],
    mandato_sepa_cuenta_id: cuentaDestinoId,
  }).eq('id', entityId);

  if (error) { toast('Error: ' + error.message, 'error'); return; }

  // Actualizar el cliente en memoria
  if (c) {
    c.mandato_sepa_token = token;
    c.mandato_sepa_ref = ref;
    c.mandato_sepa_estado = 'pendiente';
  }

  // Generar link
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
  const firmaUrl = `${baseUrl}/firma.html?token=${token}`;

  const linkDiv = document.getElementById('sepa_firma_link');
  if (linkDiv) {
    linkDiv.style.display = 'block';
    linkDiv.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">Enlace de firma generado:</div>
      <a href="${firmaUrl}" target="_blank" style="color:var(--azul);word-break:break-all">${firmaUrl}</a>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${firmaUrl}');toast('Enlace copiado','success')" style="font-size:11px">📋 Copiar</button>
        <button class="btn btn-sm" onclick="enviarMandatoEmail(${entityId},'${firmaUrl}')" style="font-size:11px">📧 Email</button>
      </div>`;
  }
  toast('Enlace de firma generado — envíalo al cliente', 'success');
}

function enviarMandatoEmail(clienteId, firmaUrl) {
  const c = clientes.find(x => x.id === clienteId);
  if (!c?.email) { toast('El cliente no tiene email', 'error'); return; }
  const asuntoTxt = `Mandato SEPA — ${EMPRESA?.nombre || ''}`;
  const cuerpoTxt = `Estimado/a ${c.nombre},\n\nLe enviamos el mandato de adeudo directo SEPA para su autorización.\n\nPuede ver y firmar el mandato en el siguiente enlace:\n${firmaUrl}\n\nEste mandato nos autoriza a domiciliar los cobros de sus facturas en su cuenta bancaria.\n\nGracias,\n${EMPRESA?.nombre || ''}\n${EMPRESA?.telefono ? 'Tel: ' + EMPRESA.telefono : ''}`;
  // Usar modal correo ERP si hay cuenta SMTP configurada
  if (typeof nuevoCorreo === 'function' && typeof _correoCuentaActiva !== 'undefined' && _correoCuentaActiva) {
    nuevoCorreo(c.email, asuntoTxt, cuerpoTxt, { tipo: 'mandato_sepa', id: clienteId });
    if (typeof goPage === 'function') goPage('correo');
    return;
  }
  window.open(`mailto:${c.email}?subject=${encodeURIComponent(asuntoTxt)}&body=${encodeURIComponent(cuerpoTxt)}`);
  toast('Abriendo cliente de correo...', 'info');
}

// ─── Marcar mandato proveedor como firmado (nosotros firmamos) ───
async function _marcarMandatoProvFirmado(entityId, ref) {
  const hoy = new Date().toISOString().split('T')[0];
  const updateData = { mandato_sepa_ref: ref, mandato_sepa_estado: 'firmado', mandato_sepa_fecha: hoy };

  // Actualizar tabla proveedores
  await sb.from('proveedores').update(updateData).eq('id', entityId);

  // Actualizar en memoria
  const p = (proveedores||[]).find(x => x.id === entityId);
  if (p) Object.assign(p, updateData);

  // Actualizar cuentas_bancarias_entidad si existe
  const cbe = (cuentasBancariasEntidad||[]).find(x => x.tipo_entidad === 'proveedor' && x.entidad_id === entityId && x.predeterminada);
  if (cbe) {
    await sb.from('cuentas_bancarias_entidad').update(updateData).eq('id', cbe.id);
    Object.assign(cbe, updateData);
  }
}

// ─── Enviar mandato por email al proveedor ─────────────────
async function enviarMandatoEmailProveedor() {
  const entityId = parseInt(document.getElementById('sepa_entity_id').value);
  const p = (proveedores||[]).find(x => x.id === entityId);
  if (!p) { toast('Proveedor no encontrado', 'error'); return; }
  if (!p.email) { toast('El proveedor no tiene email — edita la ficha para añadirlo', 'error'); return; }

  // Generar referencia si no existe
  const ref = p.mandato_sepa_ref || ('SEPA-P-' + entityId + '-' + Date.now().toString(36).toUpperCase());

  // Proveedor: nosotros firmamos → marcar como firmado directamente
  await _marcarMandatoProvFirmado(entityId, ref);

  // Actualizar referencia local
  const cbe = (cuentasBancariasEntidad||[]).find(x => x.tipo_entidad === 'proveedor' && x.entidad_id === entityId && x.predeterminada);
  if (cbe) { /* ya actualizado en _marcarMandatoProvFirmado */
  }

  // Abrir mailto
  const empresaNombre = EMPRESA?.nombre || '';
  const asunto = encodeURIComponent(`Mandato de domiciliación SEPA — ${empresaNombre} — Ref: ${ref}`);
  const cuerpo = encodeURIComponent(
    `Estimado/a ${p.nombre},\n\n` +
    `Adjunto le remitimos el mandato de domiciliación SEPA firmado por nuestra parte, mediante el cual autorizamos el adeudo directo en nuestra cuenta bancaria para el pago de sus facturas.\n\n` +
    `Referencia del mandato: ${ref}\n` +
    `Deudor: ${empresaNombre}\n` +
    `CIF: ${EMPRESA?.cif || ''}\n\n` +
    `Rogamos conserven este documento en sus archivos.\n\n` +
    `IMPORTANTE: Antes de enviar, adjunte el PDF del mandato generado desde el botón "Generar PDF" del sistema.\n\n` +
    `Un saludo,\n${empresaNombre}\n${EMPRESA?.telefono ? 'Tel: ' + EMPRESA.telefono : ''}`
  );
  // Usar modal correo ERP si hay cuenta SMTP configurada
  if (typeof nuevoCorreo === 'function' && typeof _correoCuentaActiva !== 'undefined' && _correoCuentaActiva) {
    nuevoCorreo(p.email, decodeURIComponent(asunto), decodeURIComponent(cuerpo), { tipo: 'mandato_sepa_prov', id: entityId });
    if (typeof goPage === 'function') goPage('correo');
  } else {
    window.open(`mailto:${p.email}?subject=${asunto}&body=${cuerpo}`);
  }

  // Mostrar confirmación en el modal
  const linkDiv = document.getElementById('sepa_firma_link');
  if (linkDiv) {
    linkDiv.style.display = 'block';
    linkDiv.innerHTML = `
      <div style="padding:8px 12px;background:var(--verde-light,#ecfdf5);border-radius:6px;font-size:12px;color:var(--verde)">
        ✅ Se ha abierto el cliente de correo para enviar a <strong>${p.email}</strong>
        <div style="margin-top:6px;font-size:11px;color:var(--gris-400)">Recuerda adjuntar el PDF del mandato al email</div>
      </div>`;
  }
  toast('Abriendo cliente de correo — adjunta el PDF del mandato', 'info');
}

// ─── Subir mandato firmado ─────────────────
async function subirMandatoFirmado() {
  const tipo = document.getElementById('sepa_tipo').value;
  const entityId = parseInt(document.getElementById('sepa_entity_id').value);
  const file = document.getElementById('sepa_file').files[0];
  if (!file) { toast('Selecciona un archivo', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('Máximo 10MB', 'error'); return; }

  toast('Subiendo mandato firmado...', 'info');
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `mandatos_sepa/${tipo}_${entityId}_${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage.from('documentos').upload(path, file, { upsert: true });
  if (upErr) {
    // Fallback a fotos-partes
    const { error: upErr2 } = await sb.storage.from('fotos-partes').upload(path, file, { upsert: true });
    if (upErr2) { toast('Error subiendo: ' + upErr.message, 'error'); return; }
    const { data: urlData } = sb.storage.from('fotos-partes').getPublicUrl(path);
    await _completarMandatoFirmado(tipo, entityId, urlData?.publicUrl);
    return;
  }
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
  await _completarMandatoFirmado(tipo, entityId, urlData?.publicUrl);
}

// Regenerar manualmente el PDF del mandato firmado a partir de una cuenta bancaria con estado firmado
async function _regenerarPDFMandatoCuenta(cbeId) {
  try {
    const cb = (cuentasBancariasEntidad||[]).find(x => x.id === cbeId);
    if (!cb) { toast('Cuenta no encontrada', 'error'); return; }
    if (cb.mandato_sepa_estado !== 'firmado') { toast('La cuenta no tiene mandato firmado', 'info'); return; }
    const tipo = cb.tipo_entidad || 'cliente';
    const entityId = cb.entidad_id;
    const entityOrig = tipo === 'cliente'
      ? clientes.find(x=>x.id===entityId)
      : (proveedores||[]).find(x=>x.id===entityId);
    if (!entityOrig) { toast('Entidad no encontrada', 'error'); return; }
    // Clonar y sobreescribir IBAN/BIC/banco con los de la cuenta concreta
    const entity = Object.assign({}, entityOrig, {
      iban: cb.iban, bic: cb.bic, banco_entidad: cb.banco_entidad
    });
    const cuentaEmpresa = (typeof cuentasBancarias !== 'undefined' && cuentasBancarias)
      ? (cuentasBancarias.find(b=>b.predeterminada) || cuentasBancarias[0]) : null;
    const firmaUrl = cb.mandato_sepa_firma_url || entityOrig.mandato_sepa_firma_url || null;
    const ref = cb.mandato_sepa_ref || entityOrig.mandato_sepa_ref
      || ('SEPA-' + (tipo==='cliente'?'C':'P') + '-' + entityId + '-' + Date.now().toString(36).toUpperCase());
    if (!firmaUrl) {
      toast('No hay imagen de firma guardada para esta cuenta', 'error');
      return;
    }
    toast('Generando PDF del mandato…', 'info');
    await _generarYGuardarSEPAFirmadoPDF(tipo, entity, cuentaEmpresa, firmaUrl, ref);
    toast('✅ PDF regenerado', 'success');
    if (typeof cliActualId !== 'undefined' && cliActualId === entityId && typeof abrirFicha === 'function') {
      await abrirFicha(cliActualId);
    }
  } catch(e) {
    console.error('[_regenerarPDFMandatoCuenta]', e);
    toast('Error regenerando PDF: ' + (e.message||e), 'error');
  }
}
window._regenerarPDFMandatoCuenta = _regenerarPDFMandatoCuenta;

// Generar PDF del mandato SEPA incluyendo la imagen de firma del cliente/proveedor y guardarlo en documentos_generados
async function _generarYGuardarSEPAFirmadoPDF(tipo, entity, cuentaEmpresa, firmaUrl, ref) {
  if (!window.jspdf) { console.warn('jsPDF no disponible para SEPA firmado'); return; }
  try {
    const esCliente = tipo === 'cliente';
    const titulo = esCliente ? 'MANDATO DE ADEUDO DIRECTO SEPA' : 'ORDEN DE DOMICILIACIÓN DE ADEUDO DIRECTO SEPA';
    const subtitulo = esCliente
      ? 'Mediante la firma de este mandato, el deudor autoriza al acreedor a enviar instrucciones a la entidad bancaria del deudor para adeudar su cuenta.'
      : 'Mediante la firma de este documento, autorizamos al proveedor a emitir adeudos directos contra nuestra cuenta bancaria.';
    const dirEmpresa = [EMPRESA?.direccion, [EMPRESA?.cp, EMPRESA?.municipio].filter(Boolean).join(' '), EMPRESA?.provincia].filter(Boolean).join(', ');
    const hoy = new Date().toLocaleDateString('es-ES');
    const acreedor = {
      nombre: EMPRESA?.nombre || '—', cif: EMPRESA?.cif || '—', direccion: dirEmpresa,
      iban: cuentaEmpresa?.iban ? cuentaEmpresa.iban.replace(/(.{4})/g,'$1 ').trim() : '—',
      bic: cuentaEmpresa?.bic || '—', entidad: cuentaEmpresa?.entidad || cuentaEmpresa?.banco_entidad || '—'
    };
    const deudor = {
      nombre: entity.nombre || '—', cif: entity.nif || entity.cif || '—',
      direccion: entity.direccion_fiscal || entity.direccion || '—',
      iban: entity.iban ? entity.iban.replace(/(.{4})/g,'$1 ').trim() : '—',
      bic: entity.bic || '—', entidad: entity.banco_entidad || '—'
    };
    // Si el cliente no tiene IBAN en entity, intenta leer la cuenta predeterminada
    if (esCliente && (!entity.iban || deudor.iban==='—')) {
      try {
        const { data: cbe } = await sb.from('cuentas_bancarias_entidad').select('*')
          .eq('tipo_entidad','cliente').eq('entidad_id', entity.id).eq('predeterminada', true).maybeSingle();
        if (cbe) {
          deudor.iban = cbe.iban ? cbe.iban.replace(/(.{4})/g,'$1 ').trim() : deudor.iban;
          deudor.bic = cbe.bic || deudor.bic;
          deudor.entidad = cbe.banco_entidad || deudor.entidad;
        }
      } catch(e) { /* ignore */ }
    }
    const acreedorDoc = esCliente ? acreedor : deudor;
    const deudorDoc = esCliente ? deudor : acreedor;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','mm','a4');
    const ML=15,MR=15,W=210;
    let y=20;
    doc.setFontSize(16);doc.setFont(undefined,'bold');doc.setTextColor(30,64,175);
    doc.text(EMPRESA?.nombre||'',ML,y);y+=6;
    doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(71,85,105);
    doc.text(`CIF: ${EMPRESA?.cif||''} · ${dirEmpresa}`,ML,y);y+=10;
    doc.setFillColor(30,64,175);doc.rect(ML,y-4,W-ML-MR,14,'F');
    doc.setFontSize(11);doc.setFont(undefined,'bold');doc.setTextColor(255,255,255);
    doc.text(titulo,W/2,y+3,{align:'center'});
    doc.setFontSize(8);doc.text('Referencia: '+ref,W/2,y+8,{align:'center'});y+=18;
    doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(71,85,105);
    const subLines=doc.splitTextToSize(subtitulo,W-ML-MR);doc.text(subLines,ML,y);y+=subLines.length*4+6;
    doc.autoTable({startY:y,head:[['DATOS DEL ACREEDOR','']],body:[['Nombre',acreedorDoc.nombre],['CIF',acreedorDoc.cif],['Dirección',acreedorDoc.direccion]],styles:{fontSize:9},headStyles:{fillColor:[30,64,175]},columnStyles:{0:{cellWidth:40,fontStyle:'bold'}},margin:{left:ML,right:MR}});
    y=doc.lastAutoTable.finalY+4;
    doc.autoTable({startY:y,head:[['DATOS DEL DEUDOR','']],body:[['Nombre',deudorDoc.nombre],['NIF/CIF',deudorDoc.cif],['Dirección',deudorDoc.direccion],['IBAN',deudorDoc.iban],['BIC/SWIFT',deudorDoc.bic],['Entidad bancaria',deudorDoc.entidad]],styles:{fontSize:9},headStyles:{fillColor:[146,64,14]},columnStyles:{0:{cellWidth:40,fontStyle:'bold'}},margin:{left:ML,right:MR}});
    y=doc.lastAutoTable.finalY+4;
    doc.autoTable({startY:y,head:[['TIPO DE PAGO','']],body:[['Tipo de adeudo','Recurrente'],['Fecha firma',hoy]],styles:{fontSize:9},columnStyles:{0:{cellWidth:40,fontStyle:'bold'}},margin:{left:ML,right:MR}});
    y=doc.lastAutoTable.finalY+8;
    doc.setFontSize(10);doc.setFont(undefined,'bold');doc.setTextColor(0,0,0);
    doc.text('FIRMA DEL '+(esCliente?'DEUDOR':'EMISOR'),ML,y);y+=6;
    doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(100,116,139);
    doc.text('Nombre: '+(esCliente?deudorDoc.nombre:acreedorDoc.nombre),ML,y);y+=4;
    doc.text('NIF/CIF: '+(esCliente?deudorDoc.cif:acreedorDoc.cif),ML,y);y+=4;
    doc.text('Fecha firma: '+hoy,ML,y);y+=4;

    // Embed signature image (PNG) from URL
    if (firmaUrl) {
      try {
        const resp = await fetch(firmaUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(blob); });
        doc.addImage(dataUrl, 'PNG', ML, y+2, 60, 25);
        y += 30;
      } catch(e) { console.warn('No se pudo embeber firma:', e); }
    }

    const pdfData = doc.output('arraybuffer');
    // Identificar cuenta en el nombre: últimos 4 dígitos del IBAN
    const ibanRaw = (deudorDoc.iban||'').replace(/\s/g,'');
    const last4 = ibanRaw.length>=4 ? ibanRaw.slice(-4) : '';
    const numeroDoc = last4 ? `${ref} · IBAN **${last4}` : ref;

    // Evitar duplicados por race condition (realtime doble-fire): solo bloquear si existe uno creado hace < 15s
    try {
      const hace15s = new Date(Date.now() - 15000).toISOString();
      const { data: existe } = await sb.from('documentos_generados')
        .select('id, creado_en').eq('entidad_tipo', tipo).eq('entidad_id', entity.id)
        .eq('tipo_documento','mandato_sepa').eq('numero', numeroDoc)
        .gte('creado_en', hace15s).limit(1);
      if (existe && existe.length) { console.log('[SEPA] Doc duplicado reciente, skip'); return; }
    } catch(e) { /* ignore, seguimos */ }

    if (typeof firmarYGuardarPDF === 'function') {
      await firmarYGuardarPDF(pdfData, {
        tipo_documento:'mandato_sepa',
        documento_id: entity.id,
        numero: numeroDoc,
        entidad_tipo: tipo,
        entidad_id: entity.id,
        entidad_nombre: entity.nombre||''
      });
    }
  } catch(e) { console.error('Error _generarYGuardarSEPAFirmadoPDF:', e); }
}

async function _completarMandatoFirmado(tipo, entityId, firmaUrl) {
  const ref = 'SEPA-' + (tipo === 'cliente' ? 'C' : 'P') + '-' + entityId + '-' + Date.now().toString(36).toUpperCase();
  const tabla = tipo === 'cliente' ? 'clientes' : 'proveedores';

  const updateData = {
    mandato_sepa_estado: 'firmado',
    mandato_sepa_fecha: new Date().toISOString().split('T')[0],
    mandato_sepa_ref: ref
  };
  if (firmaUrl) updateData.mandato_sepa_firma_url = firmaUrl;

  const { error } = await sb.from(tabla).update(updateData).eq('id', entityId);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  // Actualizar también la(s) cuenta(s) bancaria(s) con el estado firmado
  // Preferir la cuenta destino del mandato; luego la predeterminada; si no, todas
  try {
    const entityRec = tipo==='cliente'
      ? clientes.find(x=>x.id===entityId)
      : (proveedores||[]).find(x=>x.id===entityId);
    const cuentaDestinoId = entityRec?.mandato_sepa_cuenta_id || window._mandatoCuentaId || null;
    let q;
    if (cuentaDestinoId) {
      q = sb.from('cuentas_bancarias_entidad').update(updateData).eq('id', cuentaDestinoId);
    } else {
      const { data: _pred } = await sb.from('cuentas_bancarias_entidad').select('id')
        .eq('tipo_entidad', tipo).eq('entidad_id', entityId).eq('predeterminada', true);
      q = sb.from('cuentas_bancarias_entidad').update(updateData)
        .eq('tipo_entidad', tipo).eq('entidad_id', entityId);
      if (_pred && _pred.length) q = q.eq('predeterminada', true);
    }
    const { data: cbeUpd, error: cbeErr } = await q.select();
    if (cbeErr) console.warn('No se pudo actualizar cuenta SEPA:', cbeErr.message);
    if (Array.isArray(cuentasBancariasEntidad) && Array.isArray(cbeUpd)) {
      cbeUpd.forEach(r => {
        const idx = cuentasBancariasEntidad.findIndex(x => x.id === r.id);
        if (idx >= 0) Object.assign(cuentasBancariasEntidad[idx], r);
      });
    }
  } catch(e) { console.warn('Update cuenta SEPA falló:', e); }

  // Actualizar en memoria
  if (tipo === 'cliente') {
    const c = clientes.find(x => x.id === entityId);
    if (c) Object.assign(c, updateData);
  } else {
    const p = (proveedores||[]).find(x => x.id === entityId);
    if (p) Object.assign(p, updateData);
  }

  closeModal('mMandatoSEPA');
  toast('✅ Mandato SEPA firmado y registrado', 'success');

  // Generar y guardar PDF firmado con imagen de firma → aparece en Documentos firmados
  try {
    const entity = tipo === 'cliente'
      ? clientes.find(x => x.id === entityId)
      : (proveedores||[]).find(x => x.id === entityId);
    if (entity) {
      const cuentaEmpresa = (cuentasBancarias||[]).find(b => b.predeterminada) || (cuentasBancarias||[])[0];
      await _generarYGuardarSEPAFirmadoPDF(tipo, entity, cuentaEmpresa, firmaUrl, ref);
    }
  } catch(e) { console.warn('No se pudo generar PDF SEPA firmado:', e); }

  // Recargar ficha del cliente si está abierta
  if (tipo === 'cliente' && typeof cliActualId !== 'undefined' && cliActualId) {
    // Recargar cuentas bancarias desde Supabase
    const { data: cbe } = await sb.from('cuentas_bancarias_entidad').select('*').eq('tipo_entidad', 'cliente').eq('entidad_id', cliActualId);
    if (cbe) {
      cuentasBancariasEntidad = cuentasBancariasEntidad.filter(x => !(x.tipo_entidad === 'cliente' && x.entidad_id === cliActualId));
      cuentasBancariasEntidad.push(...cbe);
    }
    await abrirFicha(cliActualId);
  }
}


// ═══════════════════════════════════════════════
//  REMESA SEPA — Generación desde facturas
// ═══════════════════════════════════════════════

async function generarRemesaSEPA() {
  // Obtener facturas pendientes de cobro con IBAN del cliente
  const facturasPendientes = (typeof facLocalData !== 'undefined' ? facLocalData : [])
    .filter(f => f.estado === 'enviada' || f.estado === 'pendiente' || f.estado === 'vencida');

  if (!facturasPendientes.length) {
    toast('No hay facturas pendientes de cobro para la remesa', 'info');
    return;
  }

  // Verificar que tienen IBAN
  let sinIban = 0;
  const facturasValidas = [];
  for (const f of facturasPendientes) {
    const cli = clientes.find(c => c.id === f.cliente_id);
    if (cli?.iban) {
      facturasValidas.push({ ...f, _cliente: cli });
    } else {
      sinIban++;
    }
  }

  if (!facturasValidas.length) {
    toast(`Ninguna factura tiene IBAN del cliente (${sinIban} sin IBAN)`, 'error');
    return;
  }

  if (!confirm(`¿Generar remesa SEPA con ${facturasValidas.length} factura(s)?\n${sinIban > 0 ? sinIban + ' factura(s) excluidas por no tener IBAN del cliente.' : ''}`)) return;

  const cuentaEmpresa = (cuentasBancarias||[]).find(b => b.predeterminada) || (cuentasBancarias||[])[0];
  if (!cuentaEmpresa?.iban) {
    toast('Configura una cuenta bancaria de empresa con IBAN en Configuración > Cuentas bancarias', 'error');
    return;
  }

  // Generar ambos formatos
  _generarRemesaExcel(facturasValidas, cuentaEmpresa);
  _generarRemesaXML(facturasValidas, cuentaEmpresa);

  toast(`✅ Remesa generada: ${facturasValidas.length} adeudos`, 'success');
}

function _generarRemesaExcel(facturas, cuentaEmpresa) {
  const rows = facturas.map(f => ({
    'Nº Factura': f.numero,
    'Fecha': f.fecha,
    'Vencimiento': f.fecha_vencimiento || '',
    'Cliente': f._cliente.nombre,
    'NIF/CIF Cliente': f._cliente.nif || f._cliente.cif || '',
    'IBAN Cliente': f._cliente.iban,
    'BIC Cliente': f._cliente.bic || '',
    'Importe': parseFloat(f.total || 0),
    'Concepto': 'Factura ' + (f.numero || ''),
    'Referencia Mandato': f._cliente.mandato_sepa_ref || '',
    'IBAN Acreedor': cuentaEmpresa.iban,
    'Acreedor': EMPRESA?.nombre || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Remesa SEPA');
  XLSX.writeFile(wb, `remesa_sepa_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function _generarRemesaXML(facturas, cuentaEmpresa) {
  const msgId = 'REMESA-' + Date.now().toString(36).toUpperCase();
  const fechaISO = new Date().toISOString().replace(/\.\d{3}Z/, 'Z');
  const fechaCobro = new Date();
  fechaCobro.setDate(fechaCobro.getDate() + 5); // D+5
  const fechaCobroISO = fechaCobro.toISOString().split('T')[0];
  const totalImporte = facturas.reduce((s, f) => s + parseFloat(f.total || 0), 0);
  const numTx = facturas.length;
  const bic = cuentaEmpresa.bic || 'NOTPROVIDED';

  // XML pain.008.001.02 (SEPA Direct Debit)
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${fechaISO}</CreDtTm>
      <NbOfTxs>${numTx}</NbOfTxs>
      <CtrlSum>${totalImporte.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${_xmlEsc(EMPRESA?.nombre || '')}</Nm>
        <Id><OrgId><Othr><Id>${_xmlEsc(EMPRESA?.cif || '')}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></OrgId></Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-001</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${numTx}</NbOfTxs>
      <CtrlSum>${totalImporte.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${fechaCobroISO}</ReqdColltnDt>
      <Cdtr>
        <Nm>${_xmlEsc(EMPRESA?.nombre || '')}</Nm>
        <PstlAdr><Ctry>ES</Ctry></PstlAdr>
      </Cdtr>
      <CdtrAcct><Id><IBAN>${cuentaEmpresa.iban.replace(/\s/g, '')}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>${bic}</BIC></FinInstnId></CdtrAgt>
      <CdtrSchmeId>
        <Id><PrvtId><Othr><Id>${_xmlEsc(EMPRESA?.cif || '')}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id>
      </CdtrSchmeId>`;

  // Transacciones individuales
  facturas.forEach(f => {
    const cli = f._cliente;
    const mandatoRef = cli.mandato_sepa_ref || ('AUTO-' + cli.id);
    const mandatoFecha = cli.mandato_sepa_fecha || new Date().toISOString().split('T')[0];
    const cliBic = cli.bic || 'NOTPROVIDED';

    xml += `
      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${_xmlEsc((f.numero || 'F') + '-' + f.id)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${parseFloat(f.total || 0).toFixed(2)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${_xmlEsc(mandatoRef)}</MndtId>
            <DtOfSgntr>${mandatoFecha}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt><FinInstnId><BIC>${cliBic}</BIC></FinInstnId></DbtrAgt>
        <Dbtr>
          <Nm>${_xmlEsc(cli.nombre || '')}</Nm>
          <Id><OrgId><Othr><Id>${_xmlEsc(cli.nif || cli.cif || '')}</Id></Othr></OrgId></Id>
        </Dbtr>
        <DbtrAcct><Id><IBAN>${(cli.iban || '').replace(/\s/g, '')}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${_xmlEsc('Factura ' + (f.numero || f.id))}</Ustrd></RmtInf>
      </DrctDbtTxInf>`;
  });

  xml += `
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;

  // Descargar XML
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `remesa_sepa_${new Date().toISOString().slice(0, 10)}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

function _xmlEsc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
