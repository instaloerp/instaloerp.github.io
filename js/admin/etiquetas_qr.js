// ═══════════════════════════════════════════════
// ETIQUETAS QR - Generación e impresión
// ═══════════════════════════════════════════════

let _qrSeleccionados = new Set();

// ─── Generar QR en la ficha del artículo ──────
async function generarQrArticulo(codigo) {
  const container = document.getElementById('art_qr_preview');
  const label = document.getElementById('art_qr_codigo');
  if (!container) return;

  if (!codigo) {
    container.innerHTML = '<div style="color:var(--gris-400);font-size:13px">Guarda el artículo para generar el QR</div>';
    if (label) label.textContent = '';
    return;
  }

  try {
    const url = await QRCode.toDataURL(codigo, {
      width: 200,
      margin: 1,
      color: { dark: '#1B4FD8', light: '#FFFFFF' }
    });
    container.innerHTML = `<img src="${url}" style="width:200px;height:200px">`;
    if (label) label.textContent = codigo;
  } catch (e) {
    container.innerHTML = '<div style="color:var(--rojo);font-size:12px">Error generando QR</div>';
  }
}

// Imprimir QR individual desde la ficha
async function imprimirQrArticulo() {
  const codigo = document.getElementById('art_codigo')?.value;
  const nombre = document.getElementById('art_nombre')?.value;
  const pvp = document.getElementById('art_pvp')?.value;
  if (!codigo) { toast('Guarda el artículo primero', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [80, 50] });

  const qrUrl = await QRCode.toDataURL(codigo, { width: 300, margin: 1 });
  doc.addImage(qrUrl, 'PNG', 5, 3, 30, 30);
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.text(codigo, 40, 10);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7);
  const lines = doc.splitTextToSize(nombre || '', 35);
  doc.text(lines, 40, 16);
  if (pvp && parseFloat(pvp) > 0) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(parseFloat(pvp).toFixed(2) + ' €', 40, 28);
  }

  doc.save('QR_' + codigo + '.pdf');
  toast('QR descargado', 'success');
}

// ─── Página Etiquetas QR ──────────────────────

function cargarPaginaEtiquetasQR() {
  _qrSeleccionados = new Set();
  // Populate family filter
  const sel = document.getElementById('qrFamFiltro');
  if (sel) {
    const padres = familias.filter(f => !f.parent_id);
    sel.innerHTML = '<option value="">Todas las familias</option>' +
      padres.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
  }
  filtrarArticulosQR();
}

function filtrarArticulosQR() {
  const famId = document.getElementById('qrFamFiltro')?.value;
  let list = articulos.filter(a => a.activo !== false);
  if (famId) {
    const subIds = familias.filter(f => String(f.parent_id) === String(famId)).map(f => f.id);
    list = list.filter(a => String(a.familia_id) === String(famId) || subIds.includes(a.familia_id));
  }
  renderArticulosQR(list);
}

function renderArticulosQR(list) {
  const tbody = document.getElementById('qrArtTable');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(a => {
    const fam = familias.find(f => f.id === a.familia_id);
    const famPadre = fam && fam.parent_id ? familias.find(f => f.id === fam.parent_id) : null;
    const famLabel = famPadre ? `${famPadre.nombre} › ${fam.nombre}` : (fam?.nombre || '—');
    const checked = _qrSeleccionados.has(a.id) ? 'checked' : '';
    return `<tr>
      <td><input type="checkbox" ${checked} onchange="toggleQrSel(${a.id}, this.checked)"></td>
      <td style="font-family:monospace;font-weight:700;font-size:12px;color:var(--azul)">${a.codigo || '—'}</td>
      <td style="font-weight:600">${a.nombre}</td>
      <td>${famLabel}</td>
      <td style="font-weight:700;color:var(--verde)">${fmtE(a.precio_venta)}</td>
      <td><input type="number" min="1" value="1" style="width:60px;padding:4px 6px;border:1px solid var(--gris-200);border-radius:5px;font-size:12px;text-align:center" id="qrCant_${a.id}"></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--gris-400);padding:24px">Sin artículos</td></tr>';

  actualizarQrCount();
}

function toggleQrSel(id, checked) {
  if (checked) _qrSeleccionados.add(id);
  else _qrSeleccionados.delete(id);
  actualizarQrCount();
}

function seleccionarTodosQR(sel) {
  const checks = document.querySelectorAll('#qrArtTable input[type="checkbox"]');
  checks.forEach(cb => { cb.checked = sel; });
  if (sel) {
    articulos.filter(a => a.activo !== false).forEach(a => _qrSeleccionados.add(a.id));
  } else {
    _qrSeleccionados.clear();
  }
  const checkAll = document.getElementById('qrCheckAll');
  if (checkAll) checkAll.checked = sel;
  actualizarQrCount();
}

function actualizarQrCount() {
  const el = document.getElementById('qrSelCount');
  if (el) el.textContent = _qrSeleccionados.size + ' seleccionado' + (_qrSeleccionados.size !== 1 ? 's' : '');
}

// ─── Generar PDF con etiquetas ────────────────
async function generarEtiquetasQR() {
  if (_qrSeleccionados.size === 0) { toast('Selecciona al menos un artículo', 'error'); return; }

  const formato = parseInt(document.getElementById('qrFormato').value) || 24;
  const mostrarPrecio = document.getElementById('qrMostrarPrecio')?.checked;

  // Configuraciones por formato (cols x rows, tamaño etiqueta en mm)
  const configs = {
    65: { cols: 5, rows: 13, w: 38.1, h: 21.2, qrSize: 14, fontSize: 5, codeSize: 5 },
    40: { cols: 4, rows: 10, w: 52.5, h: 29.7, qrSize: 20, fontSize: 6, codeSize: 6 },
    24: { cols: 3, rows: 8, w: 63.5, h: 33.9, qrSize: 24, fontSize: 7, codeSize: 7 },
    14: { cols: 2, rows: 7, w: 99.1, h: 38.1, qrSize: 28, fontSize: 8, codeSize: 8 }
  };
  const cfg = configs[formato] || configs[24];

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Margenes A4
  const pageW = 210, pageH = 297;
  const marginX = (pageW - cfg.cols * cfg.w) / 2;
  const marginY = (pageH - cfg.rows * cfg.h) / 2;

  // Recopilar artículos con cantidades
  let items = [];
  for (const id of _qrSeleccionados) {
    const a = articulos.find(x => x.id === id);
    if (!a) continue;
    const cant = parseInt(document.getElementById('qrCant_' + id)?.value) || 1;
    for (let i = 0; i < cant; i++) items.push(a);
  }

  if (items.length === 0) { toast('Sin artículos para imprimir', 'error'); return; }

  toast('Generando ' + items.length + ' etiqueta(s)...', 'info');

  let idx = 0;
  const perPage = cfg.cols * cfg.rows;

  for (let page = 0; idx < items.length; page++) {
    if (page > 0) doc.addPage();

    for (let row = 0; row < cfg.rows && idx < items.length; row++) {
      for (let col = 0; col < cfg.cols && idx < items.length; col++, idx++) {
        const a = items[idx];
        const x = marginX + col * cfg.w;
        const y = marginY + row * cfg.h;

        // QR
        try {
          const qrUrl = await QRCode.toDataURL(a.codigo || 'ART', { width: 300, margin: 1 });
          doc.addImage(qrUrl, 'PNG', x + 1, y + 1, cfg.qrSize, cfg.qrSize);
        } catch (e) {}

        // Texto al lado del QR
        const textX = x + cfg.qrSize + 2;
        const textW = cfg.w - cfg.qrSize - 4;

        doc.setFontSize(cfg.codeSize);
        doc.setFont(undefined, 'bold');
        doc.text(a.codigo || '', textX, y + cfg.codeSize * 0.4 + 2);

        doc.setFontSize(cfg.fontSize);
        doc.setFont(undefined, 'normal');
        const nombre = doc.splitTextToSize(a.nombre || '', textW);
        doc.text(nombre.slice(0, 2), textX, y + cfg.codeSize * 0.4 + 2 + cfg.fontSize * 0.4 + 1);

        if (mostrarPrecio && a.precio_venta > 0) {
          doc.setFontSize(cfg.fontSize + 1);
          doc.setFont(undefined, 'bold');
          doc.text(parseFloat(a.precio_venta).toFixed(2) + ' €', textX, y + cfg.h - 2);
        }
      }
    }
  }

  doc.save('Etiquetas_QR_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('PDF generado con ' + items.length + ' etiquetas ✓', 'success');
}
