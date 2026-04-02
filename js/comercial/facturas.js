/**
 * MÓDULO FACTURA RÁPIDA
 * Gestión rápida de facturas con líneas editables en tiempo real
 * Interfaz simplificada para emisión rápida de facturas
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let frLineas = [];
let frClienteActual = null;

// ═══════════════════════════════════════════════
//  INICIALIZACIÓN Y APERTURA
// ═══════════════════════════════════════════════
async function nuevaFacturaRapida() {
  frLineas = [];
  frClienteActual = cliActualId;

  const sel = document.getElementById('fr_cliente');
  sel.innerHTML = '<option value="">— Selecciona cliente —</option>' +
    clientes.map(c => `<option value="${c.id}" ${c.id===cliActualId?'selected':''}>${c.nombre}</option>`).join('');

  const serSel = document.getElementById('fr_serie');
  const serFact = (series||[]).filter(s => s.tipo === 'factura' || s.tipo === 'fact');
  const serUsables = serFact.length ? serFact : (series||[]);
  if (serUsables.length) {
    serSel.innerHTML = serUsables.map(s => `<option value="${s.id}">${s.prefijo||s.nombre||'FAC-'}</option>`).join('');
  } else {
    serSel.innerHTML = '<option value="">FAC-</option>';
  }
  document.getElementById('fr_numero').value = await generarNumeroDoc('factura');

  const fpSel = document.getElementById('fr_fpago');
  fpSel.innerHTML = '<option value="">— Sin especificar —</option>' +
    formasPago.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');

  if (cliActualId) {
    const c = clientes.find(x => x.id === cliActualId);
    if (c?.forma_pago_id) fpSel.value = c.forma_pago_id;
  }

  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fr_fecha').value = hoy;
  const v = new Date(); v.setDate(v.getDate()+30);
  document.getElementById('fr_vence').value = v.toISOString().split('T')[0];

  fr_addLinea();
  openModal('mFacturaRapida', true);
}

// ═══════════════════════════════════════════════
//  GENERACIÓN DE NÚMERO
// ═══════════════════════════════════════════════
async function fr_generarNumero(serieId) {
  const s = series.find(x => x.id == serieId);
  if (!s) return;
  const { count } = await sb.from('facturas').select('*', {count:'exact',head:true})
    .eq('empresa_id', EMPRESA.id).eq('serie_id', serieId);
  const num = (s.siguiente_numero || 1) + (count || 0);
  document.getElementById('fr_numero').value = s.prefijo + String(num).padStart(s.digitos||4,'0');
}

// ═══════════════════════════════════════════════
//  ACTUALIZACIÓN DE CLIENTE
// ═══════════════════════════════════════════════
function fr_actualizarCliente(id) {
  frClienteActual = id ? parseInt(id) : null;
  const c = clientes.find(x => x.id === frClienteActual);
  if (c?.forma_pago_id) document.getElementById('fr_fpago').value = c.forma_pago_id;
}

// ═══════════════════════════════════════════════
//  GESTIÓN DE LÍNEAS
// ═══════════════════════════════════════════════
function fr_addLinea() {
  frLineas.push({ desc:'', cant:1, precio:0, dto:0, iva:21 });
  fr_renderLineas();
}

function fr_removeLinea(idx) {
  frLineas.splice(idx, 1);
  fr_renderLineas();
}

function fr_updateLinea(idx, field, val) {
  frLineas[idx][field] = field === 'desc' ? val : parseFloat(val)||0;
  fr_renderLineas();
}

function renderPPartidas(list) {
  let base = 0, ivaTotal = 0;
  document.getElementById('fr_lineas').innerHTML = frLineas.map((l, i) => {
    const subtotal = l.cant * l.precio * (1 - l.dto/100);
    const ivaAmt = subtotal * (l.iva/100);
    base += subtotal;
    ivaTotal += ivaAmt;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 10px"><input value="${l.desc}" placeholder="Descripción del artículo o servicio..."
        onchange="fr_updateLinea(${i},'desc',this.value)"
        style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.cant}" min="0.01" step="0.01"
        onchange="fr_updateLinea(${i},'cant',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01"
        onchange="fr_updateLinea(${i},'precio',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px">
        <select onchange="fr_updateLinea(${i},'iva',this.value)"
          style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${tiposIva.map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(subtotal+ivaAmt)}</td>
      <td style="padding:7px 4px">
        <button onclick="fr_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button>
      </td>
    </tr>`;
  }).join('');

  const total = base + ivaTotal;
  document.getElementById('fr_base').textContent = fmtE(base);
  document.getElementById('fr_iva_total').textContent = fmtE(ivaTotal);
  document.getElementById('fr_total').textContent = fmtE(total);
}

function fr_renderLineas() {
  let base = 0, ivaTotal = 0;
  document.getElementById('fr_lineas').innerHTML = frLineas.map((l, i) => {
    const subtotal = l.cant * l.precio * (1 - l.dto/100);
    const ivaAmt = subtotal * (l.iva/100);
    base += subtotal;
    ivaTotal += ivaAmt;
    return `<tr style="border-top:1px solid var(--gris-100)">
      <td style="padding:7px 10px"><input value="${l.desc}" placeholder="Descripción del artículo o servicio..."
        onchange="fr_updateLinea(${i},'desc',this.value)"
        style="width:100%;border:none;outline:none;font-size:12.5px;background:transparent"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.cant}" min="0.01" step="0.01"
        onchange="fr_updateLinea(${i},'cant',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.precio}" min="0" step="0.01"
        onchange="fr_updateLinea(${i},'precio',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px"><input type="number" value="${l.dto}" min="0" max="100" step="0.1"
        onchange="fr_updateLinea(${i},'dto',this.value)"
        style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 6px;font-size:12px;text-align:right;outline:none"></td>
      <td style="padding:7px 6px">
        <select onchange="fr_updateLinea(${i},'iva',this.value)"
          style="width:100%;border:1px solid var(--gris-200);border-radius:5px;padding:4px 5px;font-size:12px;outline:none">
          ${tiposIva.map(t=>`<option value="${t.porcentaje}" ${t.porcentaje==l.iva?'selected':''}>${t.porcentaje}%</option>`).join('')}
        </select>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:13px">${fmtE(subtotal+ivaAmt)}</td>
      <td style="padding:7px 4px">
        <button onclick="fr_removeLinea(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;padding:2px 6px">✕</button>
      </td>
    </tr>`;
  }).join('');

  const total = base + ivaTotal;
  document.getElementById('fr_base').textContent = fmtE(base);
  document.getElementById('fr_iva_total').textContent = fmtE(ivaTotal);
  document.getElementById('fr_total').textContent = fmtE(total);
}

// ═══════════════════════════════════════════════
//  GUARDAR FACTURA
// ═══════════════════════════════════════════════
async function guardarFacturaRapida(estado) {
  const clienteId = parseInt(document.getElementById('fr_cliente').value);
  if (!clienteId) { toast('Selecciona un cliente','error'); return; }

  const lineasValidas = frLineas.filter(l => l.desc || l.precio > 0);
  if (!lineasValidas.length) { toast('Añade al menos una línea','error'); return; }

  const c = clientes.find(x => x.id === clienteId);
  const serieId = parseInt(document.getElementById('fr_serie').value) || null;
  const numero = document.getElementById('fr_numero').value;

  let base = 0, ivaTotal = 0;
  lineasValidas.forEach(l => {
    const sub = l.cant * l.precio * (1 - l.dto/100);
    base += sub;
    ivaTotal += sub * (l.iva/100);
  });

  const obj = {
    empresa_id: EMPRESA.id,
    numero, serie_id: serieId,
    cliente_id: clienteId,
    cliente_nombre: c?.nombre || '',
    fecha: document.getElementById('fr_fecha').value,
    fecha_vencimiento: document.getElementById('fr_vence').value || null,
    forma_pago_id: parseInt(document.getElementById('fr_fpago').value) || null,
    base_imponible: Math.round(base*100)/100,
    total_iva: Math.round(ivaTotal*100)/100,
    total: Math.round((base+ivaTotal)*100)/100,
    estado,
    observaciones: document.getElementById('fr_obs').value || null,
    lineas: lineasValidas,
  };

  const { error } = await sb.from('facturas').insert(obj);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  closeModal('mFacturaRapida');
  toast(estado === 'pendiente' ? '🧾 Factura emitida ✓' : '💾 Borrador guardado ✓', 'success');

  if (cliActualId) await abrirFicha(cliActualId);
  await loadPresupuestos();
  loadDashboard();
}

// ═══════════════════════════════════════════════
//  ALIASES PARA COMPATIBILIDAD
// ═══════════════════════════════════════════════
function p_addPartida() { fr_addLinea(); }
function p_removePartida(idx) { fr_removeLinea(idx); }
function p_updatePartida(idx, field, val) { fr_updateLinea(idx, field, val); }

async function abrirFacturaRapida() {
  await nuevaFacturaRapida();
}

// ═══════════════════════════════════════════════
//  IMPRIMIR FACTURA (ventana HTML)
// ═══════════════════════════════════════════════
function imprimirFactura(f) {
  if (typeof f === 'number') {
    // Buscar en datos cargados — si no existe, cargar de DB
    (async()=>{
      const {data}=await sb.from('facturas').select('*').eq('id',f).single();
      if(!data){toast('Factura no encontrada','error');return;}
      _imprimirFacturaHtml(data);
    })();
    return;
  }
  _imprimirFacturaHtml(f);
}

function _imprimirFacturaHtml(f) {
  const c = clientes.find(x=>x.id===f.cliente_id);
  const lineas = f.lineas||[];
  let htmlLineas='', base=0, ivaTotal=0;
  lineas.forEach(l=>{
    if(l._separator){
      htmlLineas+=`<tr><td colspan="6" style="padding:6px 10px;background:#f1f5f9;font-weight:700;font-size:10px;color:#475569;border-bottom:1px solid #e2e8f0">${l.desc||''}</td></tr>`;
      return;
    }
    const dto=l.dto||0, sub=(l.cant||1)*(l.precio||0)*(1-dto/100), iv=sub*((l.iva||0)/100);
    base+=sub; ivaTotal+=iv;
    htmlLineas+=`<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">${l.desc||''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.cant||0}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${(l.precio||0).toFixed(2)} €</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${dto?dto+'%':'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px">${l.iva!=null?l.iva+'%':'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:700">${(sub+iv).toFixed(2)} €</td></tr>`;
  });
  const dirEmpresa=[EMPRESA?.direccion,[EMPRESA?.cp,EMPRESA?.municipio].filter(Boolean).join(' '),EMPRESA?.provincia].filter(Boolean).join(', ');
  const dirCliente=c?[c.direccion_fiscal||c.direccion,[c.cp_fiscal||c.cp,c.municipio_fiscal||c.municipio].filter(Boolean).join(' '),c.provincia_fiscal||c.provincia].filter(Boolean).join(', '):'';
  const logoHtml=EMPRESA?.logo_url?`<img src="${EMPRESA.logo_url}" style="width:60px;height:60px;object-fit:contain;border-radius:8px">`:`<div style="width:60px;height:60px;background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff">${(EMPRESA?.nombre||'E').substring(0,2).toUpperCase()}</div>`;
  const win=window.open('','_blank','width=850,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><title>Factura ${f.numero}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:12mm 14mm 18mm 14mm}body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a2e;background:#f5f5f5;line-height:1.4}.page{max-width:210mm;margin:0 auto;background:#fff;padding:28px 36px;min-height:297mm;position:relative}.btn-bar{text-align:center;padding:16px;background:#f5f5f5}.btn-bar button{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin:0 6px}.btn-print{background:#1e40af;color:#fff}.btn-close{background:#e2e8f0;color:#475569}@media print{body{background:#fff}.page{padding:0;min-height:auto}.no-print{display:none!important}}</style>
  </head><body>
  <div class="no-print btn-bar"><button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button><button class="btn-close" onclick="window.close()">✕ Cerrar</button></div>
  <div class="page">
    <div style="display:flex;gap:24px;margin-bottom:16px;align-items:stretch">
      <div style="flex:1"><div style="display:flex;align-items:flex-start;gap:14px">${logoHtml}<div><div style="font-size:16px;font-weight:700;color:#1e40af">${EMPRESA?.nombre||''}</div><div style="font-size:11px;color:#64748b">${EMPRESA?.razon_social||''}</div><div style="font-size:11px;color:#475569">${dirEmpresa}<br>CIF: ${EMPRESA?.cif||''} · Tel: ${EMPRESA?.telefono||''}</div></div></div></div>
      <div style="flex:1"><div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;border-left:4px solid #1e40af;height:100%"><div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:4px">CLIENTE</div><div style="font-size:15px;font-weight:700;margin-bottom:3px">${f.cliente_nombre||'—'}</div><div style="font-size:11px;color:#475569">${dirCliente}${c?.nif?'<br>NIF: '+c.nif:''}</div></div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 16px;margin-bottom:14px">
      <div style="font-size:11px;color:#1e40af;display:flex;align-items:baseline;gap:6px"><span style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px">FACTURA</span><span style="font-size:11px;font-weight:600;color:#475569">${f.numero||''}</span></div>
      <div style="display:flex;gap:16px;font-size:11px;color:#64748b"><span>Fecha: <b style="color:#334155">${f.fecha?new Date(f.fecha).toLocaleDateString('es-ES'):'—'}</b></span><span>Vencimiento: <b style="color:#334155">${f.fecha_vencimiento?new Date(f.fecha_vencimiento).toLocaleDateString('es-ES'):'—'}</b></span></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px">
      <thead><tr><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-transform:uppercase;text-align:left">Descripción</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:60px">Cant.</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:90px">Precio</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:60px">Dto.</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:60px">IVA</th><th style="background:#1e40af;color:#fff;padding:7px 10px;font-size:9px;font-weight:600;text-align:right;width:90px">Total</th></tr></thead>
      <tbody>${htmlLineas}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end"><div style="width:260px">
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569"><span>Base imponible</span><b style="color:#1e2a3a">${(f.base_imponible||base).toFixed(2)} €</b></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#475569"><span>IVA</span><b style="color:#1e2a3a">${(f.total_iva||ivaTotal).toFixed(2)} €</b></div>
      <div style="display:flex;justify-content:space-between;padding:10px 14px;background:#1e40af;color:#fff;border-radius:6px;font-size:15px;font-weight:800;margin-top:4px"><span>TOTAL</span><b>${(f.total||0).toFixed(2)} €</b></div>
    </div></div>
    ${f.observaciones?`<div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border-radius:6px;border-left:3px solid #94a3b8"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px">Observaciones</div><div style="font-size:11px;color:#475569">${f.observaciones}</div></div>`:''}
    <div style="position:absolute;bottom:20px;left:36px;right:36px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between"><span>${EMPRESA?.nombre||''} ${EMPRESA?.cif?' · CIF: '+EMPRESA.cif:''}</span><span>${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}${EMPRESA?.email?' · '+EMPRESA.email:''}</span></div>
  </div></body></html>`);
  win.document.close();
}

// ═══════════════════════════════════════════════
//  ENVIAR FACTURA POR EMAIL
// ═══════════════════════════════════════════════
function enviarFacturaEmail(f) {
  if (typeof f === 'number') {
    (async()=>{
      const {data}=await sb.from('facturas').select('*').eq('id',f).single();
      if(!data){toast('Factura no encontrada','error');return;}
      _enviarFacturaEmail(data);
    })();
    return;
  }
  _enviarFacturaEmail(f);
}

function _enviarFacturaEmail(f) {
  const c = clientes.find(x=>x.id===f.cliente_id);
  const email = c?.email || '';
  const asunto = encodeURIComponent(`Factura ${f.numero||''} — ${EMPRESA?.nombre||''}`);
  const totalFmt = (f.total||0).toFixed(2).replace('.',',')+' €';
  const fechaFmt = f.fecha ? new Date(f.fecha).toLocaleDateString('es-ES') : '—';
  const vencFmt = f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString('es-ES') : '—';
  const cuerpo = encodeURIComponent(
`Estimado/a ${f.cliente_nombre||'cliente'},

Le adjuntamos la factura ${f.numero||''} con fecha ${fechaFmt}.

Importe total: ${totalFmt} (IVA incluido)
Fecha de vencimiento: ${vencFmt}

Para cualquier consulta, no dude en contactarnos.

Un saludo cordial,
${EMPRESA?.nombre||''}
${EMPRESA?.telefono?'Tel: '+EMPRESA.telefono:''}
${EMPRESA?.email||''}`);
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`);
  toast('📧 Abriendo cliente de correo...','info');
}

// ═══════════════════════════════════════════════
//  GENERAR PDF FACTURA (jsPDF)
// ═══════════════════════════════════════════════
function generarPdfFactura(f) {
  if (typeof f === 'number') {
    (async()=>{
      const {data}=await sb.from('facturas').select('*').eq('id',f).single();
      if(!data){toast('Factura no encontrada','error');return;}
      _generarPdfFactura(data);
    })();
    return;
  }
  _generarPdfFactura(f);
}

function _generarPdfFactura(f) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','mm','a4');
  const W=210, ML=15, MR=15, H=297;
  const azul=[27,79,216], gris=[100,116,139], negro=[30,41,59];
  let y=15;
  // Cabecera
  doc.setFontSize(18);doc.setTextColor(...azul);doc.setFont(undefined,'bold');
  doc.text(EMPRESA?.nombre||'Mi Empresa',ML,y+6);
  doc.setFontSize(8.5);doc.setTextColor(...gris);doc.setFont(undefined,'normal');
  const empInfo=[];
  if(EMPRESA?.cif)empInfo.push('CIF: '+EMPRESA.cif);
  if(EMPRESA?.direccion)empInfo.push(EMPRESA.direccion);
  const empLoc=[EMPRESA?.cp,EMPRESA?.municipio,EMPRESA?.provincia].filter(Boolean).join(', ');
  if(empLoc)empInfo.push(empLoc);
  if(EMPRESA?.telefono)empInfo.push('Tel: '+EMPRESA.telefono);
  if(EMPRESA?.email)empInfo.push(EMPRESA.email);
  empInfo.forEach((t,i)=>doc.text(t,ML,y+12+i*3.5));
  doc.setFontSize(22);doc.setTextColor(...azul);doc.setFont(undefined,'bold');
  doc.text('FACTURA',W-MR,y+6,{align:'right'});
  doc.setFontSize(11);doc.setTextColor(...negro);
  doc.text(f.numero||'—',W-MR,y+13,{align:'right'});
  y+=12+empInfo.length*3.5+8;
  doc.setDrawColor(...azul);doc.setLineWidth(0.8);doc.line(ML,y,W-MR,y);y+=8;
  // Cliente
  const cli=clientes.find(x=>x.id===f.cliente_id);
  doc.setFontSize(8);doc.setTextColor(...gris);doc.text('CLIENTE',ML,y);
  doc.setFontSize(12);doc.setTextColor(...negro);doc.setFont(undefined,'bold');
  doc.text(f.cliente_nombre||'—',ML,y+5.5);
  doc.setFont(undefined,'normal');doc.setFontSize(9);doc.setTextColor(...gris);
  let cy=y+10;
  if(cli?.nif){doc.text('NIF: '+cli.nif,ML,cy);cy+=3.8;}
  if(cli?.direccion){doc.text(cli.direccion,ML,cy);cy+=3.8;}
  const cliLoc=[cli?.cp,cli?.municipio,cli?.provincia].filter(Boolean).join(', ');
  if(cliLoc){doc.text(cliLoc,ML,cy);cy+=3.8;}
  // Datos factura
  const rx=130;
  const datosF=[['Fecha',f.fecha?new Date(f.fecha).toLocaleDateString('es-ES'):'—'],['Vencimiento',f.fecha_vencimiento?new Date(f.fecha_vencimiento).toLocaleDateString('es-ES'):'—']];
  datosF.forEach(([k,v],i)=>{doc.setFontSize(8);doc.setTextColor(...gris);doc.text(k,rx,y+i*8);doc.setFontSize(10);doc.setTextColor(...negro);doc.setFont(undefined,'bold');doc.text(v,rx,y+4+i*8);doc.setFont(undefined,'normal');});
  y=Math.max(cy,y+datosF.length*8)+8;
  // Tabla
  const lineas=f.lineas||[];
  const tableBody=[];
  let base=0,ivaT=0;
  lineas.forEach(l=>{
    if(l._separator){tableBody.push([{content:l.desc||'',colSpan:6,styles:{fontStyle:'bold',fillColor:[241,245,249],fontSize:8}}]);return;}
    const dto=l.dto||0,sub=(l.cant||0)*(l.precio||0)*(1-dto/100),iv=sub*((l.iva||0)/100);
    base+=sub;ivaT+=iv;
    tableBody.push([l.desc||'',{content:String(l.cant||0),styles:{halign:'right'}},{content:fmtE(l.precio||0),styles:{halign:'right'}},{content:dto?dto+'%':'—',styles:{halign:'right'}},{content:l.iva!=null?l.iva+'%':'—',styles:{halign:'right'}},{content:fmtE(sub+iv),styles:{halign:'right',fontStyle:'bold'}}]);
  });
  doc.autoTable({startY:y,margin:{left:ML,right:MR},head:[['Descripción','Cant.','Precio','Dto.','IVA','Total']],body:tableBody,headStyles:{fillColor:azul,textColor:[255,255,255],fontSize:8.5,fontStyle:'bold',cellPadding:3},bodyStyles:{fontSize:8.5,textColor:negro,cellPadding:2.5},alternateRowStyles:{fillColor:[248,250,252]},columnStyles:{0:{cellWidth:'auto'},1:{cellWidth:18,halign:'right'},2:{cellWidth:24,halign:'right'},3:{cellWidth:18,halign:'right'},4:{cellWidth:18,halign:'right'},5:{cellWidth:28,halign:'right'}},theme:'grid',styles:{lineColor:[226,232,240],lineWidth:0.3}});
  y=doc.lastAutoTable.finalY+8;
  // Totales
  const totX=130;
  doc.setFontSize(9);doc.setTextColor(...gris);doc.text('Base imponible',totX,y);doc.setTextColor(...negro);doc.text(fmtE(f.base_imponible||base),W-MR,y,{align:'right'});y+=5;
  doc.setTextColor(...gris);doc.text('IVA',totX,y);doc.setTextColor(...negro);doc.text(fmtE(f.total_iva||ivaT),W-MR,y,{align:'right'});y+=6;
  doc.setDrawColor(...azul);doc.setLineWidth(0.5);doc.line(totX,y,W-MR,y);y+=5;
  doc.setFontSize(13);doc.setTextColor(...azul);doc.setFont(undefined,'bold');
  doc.text('TOTAL',totX,y);doc.text(fmtE(f.total||0),W-MR,y,{align:'right'});
  doc.setFont(undefined,'normal');y+=10;
  if(f.observaciones){doc.setFontSize(8);doc.setTextColor(...gris);doc.text('OBSERVACIONES',ML,y);y+=4;doc.setFontSize(8.5);doc.setTextColor(...negro);const ol=doc.splitTextToSize(f.observaciones,W-ML-MR);doc.text(ol,ML,y);}
  // Pie
  const footY=H-12;doc.setFontSize(7.5);doc.setTextColor(...gris);doc.setDrawColor(226,232,240);doc.setLineWidth(0.3);doc.line(ML,footY-4,W-MR,footY-4);
  doc.text(EMPRESA?.nombre||'',ML,footY);if(EMPRESA?.telefono)doc.text('Tel: '+EMPRESA.telefono,ML+50,footY);if(EMPRESA?.email)doc.text(EMPRESA.email,ML+100,footY);
  doc.save('Factura_'+(f.numero||'').replace(/[^a-zA-Z0-9-]/g,'_')+'.pdf');
  toast('📄 PDF factura descargado ✓','success');
}
