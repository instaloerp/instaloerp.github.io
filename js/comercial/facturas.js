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
