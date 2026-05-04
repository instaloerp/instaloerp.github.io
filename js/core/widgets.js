// ═══════════════════════════════════════════════════════════════════════
//  WIDGETS ENGINE — Motor de widgets para el dashboard configurable
//  instaloERP v1.1
// ═══════════════════════════════════════════════════════════════════════
//
//  Globals esperados: sb (Supabase), EMPRESA, CU, CP, fmtE(), goPage(),
//                     trabajos[], clientes[], estadoBadge(), catIco()
//
//  Uso:
//    renderWidgetDashboard('mi-contenedor');   // Renderiza dashboard
//    toggleDashEdit();                          // Activa modo edición
// ═══════════════════════════════════════════════════════════════════════

/* ──────────────────────────────────────────────
   Helpers de fecha reutilizables
   ────────────────────────────────────────────── */

/** Devuelve ISO string (YYYY-MM-DD) del primer día del mes actual */
function _wgInicioMes() {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), 1).toISOString().split('T')[0];
}

/** Devuelve ISO string del primer día del año actual */
function _wgInicioAno() {
  const h = new Date();
  return new Date(h.getFullYear(), 0, 1).toISOString().split('T')[0];
}

// ─── Periodo del widget Resumen Fiscal (persistido en localStorage) ───
function _wgFiscalGetPeriodo() {
  try {
    const saved = JSON.parse(localStorage.getItem('wg_fiscal_periodo') || 'null');
    if (saved && Number.isInteger(saved.year) && Number.isInteger(saved.tri)) return saved;
  } catch(e) {}
  const hoy = new Date();
  return { year: hoy.getFullYear(), tri: Math.floor(hoy.getMonth() / 3) };
}

async function _wgFiscalSetPeriodo(year, tri) {
  const p = { year: parseInt(year), tri: parseInt(tri) };
  if (isNaN(p.year) || isNaN(p.tri)) return;
  localStorage.setItem('wg_fiscal_periodo', JSON.stringify(p));
  // Recargar solo el widget panel_fiscal
  const wrapper = document.querySelector('[data-wid="panel_fiscal"] .wg-body');
  if (!wrapper) return;
  wrapper.innerHTML = '<div style="text-align:center;padding:12px;color:var(--gris-400);font-size:11px">Cargando…</div>';
  try {
    const def = (typeof _wgMap !== 'undefined') ? _wgMap['panel_fiscal'] : null;
    if (!def) return;
    const data = await def.fetch(EMPRESA?.id);
    wrapper.innerHTML = '';
    def.render(data, wrapper);
  } catch (e) {
    console.error('[panel_fiscal reload]', e);
    wrapper.innerHTML = '<div style="padding:12px;color:#DC2626;font-size:11px">Error al recargar</div>';
  }
}

/**
 * Genera array de rangos para los últimos N meses (inclusivo del actual).
 * Retorna [{label:'Ene', desde:'2026-01-01', hasta:'2026-02-01'}, ...]
 */
function _wgUltMeses(n) {
  const hoy = new Date();
  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const sig = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    meses.push({
      label: d.toLocaleString('es-ES', { month: 'short' }).replace('.', ''),
      desde: d.toISOString().split('T')[0],
      hasta: sig.toISOString().split('T')[0]
    });
  }
  return meses;
}

/**
 * Render helper para KPI compacto: número + subtexto + sparkline al lado
 * @param {HTMLElement} el - contenedor
 * @param {string} valor - texto del valor principal
 * @param {string} sub - subtexto
 * @param {number[]} spark - datos sparkline (puede ser null)
 * @param {string} color - color CSS
 */
function _renderKpi(el, valor, sub, spark, color) {
  const sparkHtml = spark && spark.length >= 2
    ? `<div class="wg-kpi-spark"><canvas class="wg-spark" height="28"></canvas></div>`
    : '';
  el.innerHTML = `
    <div class="wg-kpi-row">
      <div>
        <div class="wg-kpi-num" style="color:${color}">${valor}</div>
        <div class="wg-kpi-sub">${sub}</div>
      </div>
      ${sparkHtml}
    </div>`;
  if (spark && spark.length >= 2) {
    const canvas = el.querySelector('.wg-spark');
    if (canvas) {
      // Ajustar width al contenedor real
      requestAnimationFrame(() => {
        canvas.width = canvas.parentElement.offsetWidth || 80;
        canvas.height = 28;
        _drawSparkline(canvas, spark, color);
      });
    }
  }
}

/** Filtra facturas activas (excluye anulada, rectificada, borrador) */
function _wgFactActivas(arr) {
  return (arr || []).filter(f =>
    f.estado !== 'anulada' && f.estado !== 'rectificada' && f.estado !== 'borrador'
  );
}

/* ──────────────────────────────────────────────
   Sparkline — mini gráfico de línea en canvas
   ────────────────────────────────────────────── */

/**
 * Dibuja un sparkline (mini line chart) en un canvas pequeño.
 * @param {HTMLCanvasElement} canvas — canvas de ~100x30px
 * @param {number[]} values — serie de valores (mín. 2)
 * @param {string} color — color CSS (ej. 'var(--azul)')
 */
function _drawSparkline(canvas, values, color) {
  if (!canvas || !values || values.length < 2) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  // Ajustar resolución para pantallas retina
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);

  // Resolver CSS variable si es necesario
  const resolvedColor = _resolveColor(canvas, color);

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 4; // padding interno

  // Calcular puntos
  const points = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (W - pad * 2),
    y: pad + (1 - (v - min) / range) * (H - pad * 2)
  }));

  // Dibujar área rellena
  ctx.beginPath();
  ctx.moveTo(points[0].x, H);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, H);
  ctx.closePath();
  ctx.fillStyle = resolvedColor + '18'; // transparencia ~10%
  ctx.fill();

  // Dibujar línea suavizada (curva cuadrática)
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
    ctx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = resolvedColor;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Punto final (último valor)
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = resolvedColor;
  ctx.fill();
}

/** Resuelve un color CSS variable a valor hexadecimal */
function _resolveColor(el, color) {
  if (!color || !color.startsWith('var(')) return color || '#3B82F6';
  const varName = color.replace('var(', '').replace(')', '').trim();
  const resolved = getComputedStyle(el).getPropertyValue(varName).trim();
  return resolved || '#3B82F6';
}


/* ──────────────────────────────────────────────
   Bar Chart — gráfico de barras en canvas
   ────────────────────────────────────────────── */

/**
 * Dibuja un gráfico de barras (con soporte agrupado) en un canvas.
 * @param {HTMLCanvasElement} canvas — canvas ~300x180
 * @param {string[]} labels — etiquetas eje X (ej. meses)
 * @param {Array<{label:string, color:string, values:number[]}>} datasets — series
 */
function _drawBarChart(canvas, labels, datasets) {
  if (!canvas || !labels || !datasets) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);

  const padL = 10, padR = 10, padT = 18, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Máximo global
  let maxVal = 0;
  datasets.forEach(ds => ds.values.forEach(v => { if (Math.abs(v) > maxVal) maxVal = Math.abs(v); }));
  maxVal = maxVal || 1;

  const nGroups = labels.length;
  const nBars = datasets.length;
  const groupW = chartW / nGroups;
  const barGap = nBars > 1 ? 2 : 0;
  const totalBarSpace = groupW * 0.7; // 70% del grupo para barras
  const barW = Math.max(10, (totalBarSpace - barGap * (nBars - 1)) / nBars);
  const groupStart = (groupW - totalBarSpace) / 2; // centrar barras en grupo

  // Líneas de referencia horizontales (más sutiles)
  ctx.strokeStyle = '#F3F4F6';
  ctx.lineWidth = 0.8;
  for (let i = 0; i <= 3; i++) {
    const y = padT + (i / 3) * chartH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  // Dibujar barras
  datasets.forEach((ds, di) => {
    const resolvedColor = _resolveColor(canvas, ds.color);

    ds.values.forEach((val, gi) => {
      const barH = (Math.abs(val) / maxVal) * chartH;
      const x = padL + gi * groupW + groupStart + di * (barW + barGap);
      const y = padT + chartH - barH;

      // Barra con bordes redondeados superiores
      const r = Math.min(4, barW / 2);
      ctx.fillStyle = resolvedColor;
      ctx.beginPath();
      if (barH > r * 2) {
        ctx.moveTo(x, padT + chartH);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.lineTo(x + barW - r, y);
        ctx.arcTo(x + barW, y, x + barW, y + r, r);
        ctx.lineTo(x + barW, padT + chartH);
      } else {
        ctx.rect(x, y, barW, barH);
      }
      ctx.closePath();
      ctx.fill();

      // Valor encima de la barra (siempre que haya valor)
      if (val > 0) {
        ctx.fillStyle = barH > 18 ? '#FFF' : resolvedColor;
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        const labelY = barH > 18 ? y + 12 : y - 4;
        ctx.fillText(_shortNum(val), x + barW / 2, labelY);
      }
    });
  });

  // Etiquetas eje X
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    const x = padL + i * groupW + groupW / 2;
    ctx.fillText(lbl, x, H - 6);
  });
}

/** Formato corto para valores en barras (1200 → 1.2k) */
function _shortNum(n) {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toString();
}


/* ══════════════════════════════════════════════════════════════════════
   CATÁLOGO DE WIDGETS — Definiciones completas
   ══════════════════════════════════════════════════════════════════════ */

const WIDGET_CATALOG = [

  // ═══════════════════════════════════════════
  //  PANELES COMPUESTOS — Combinan múltiples KPIs en una vista rica
  // ═══════════════════════════════════════════

  // ── Panel: Resumen Financiero (Facturación mes + año + compras + resultado) ──
  {
    id: 'panel_financiero', label: 'Resumen financiero', ico: '💶',
    cat: 'panel', size: 'lg',
    async fetch(eid) {
      const meses = _wgUltMeses(6);
      const mesLabels = meses.map(m => m.label);
      const [rV, rC] = await Promise.all([
        sb.from('facturas').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('facturas_proveedor').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
      ]);
      const ventas = _wgFactActivas(rV.data);
      const compras = (rC.data || []).filter(f => f.estado !== 'anulada');

      const factMes = ventas.filter(f => f.fecha >= _wgInicioMes()).reduce((s, f) => s + (f.base_imponible || 0), 0);
      const factAno = ventas.filter(f => f.fecha >= _wgInicioAno()).reduce((s, f) => s + (f.base_imponible || 0), 0);
      const compraAno = compras.filter(f => f.fecha >= _wgInicioAno()).reduce((s, f) => s + (f.base_imponible || 0), 0);
      const compraMes = compras.filter(f => f.fecha >= _wgInicioMes()).reduce((s, f) => s + (f.base_imponible || 0), 0);
      const resultado = factMes - compraMes;
      const resultadoAno = factAno - compraAno;

      const sparkVentas = meses.map(m => ventas.filter(f => f.fecha >= m.desde && f.fecha < m.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));
      const sparkCompras = meses.map(m => compras.filter(f => f.fecha >= m.desde && f.fecha < m.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));
      const sparkResultado = meses.map((m, i) => sparkVentas[i] - sparkCompras[i]);

      const factMesAnt = sparkVentas.length >= 2 ? sparkVentas[sparkVentas.length - 2] : 0;
      const compraMesAnt = sparkCompras.length >= 2 ? sparkCompras[sparkCompras.length - 2] : 0;
      const varVentas = factMesAnt > 0 ? ((factMes - factMesAnt) / factMesAnt * 100) : 0;
      const varCompras = compraMesAnt > 0 ? ((compraMes - compraMesAnt) / compraMesAnt * 100) : 0;

      // Num facturas emitidas este mes y total
      const facturasMes = ventas.filter(f => f.fecha >= _wgInicioMes()).length;
      const facturasTotal = ventas.filter(f => f.fecha >= _wgInicioAno()).length;

      // Mejor y peor mes
      const maxMes = Math.max(...sparkVentas);
      const maxMesIdx = sparkVentas.indexOf(maxMes);

      return { factMes, factAno, compraMes, compraAno, resultado, resultadoAno,
               sparkVentas, sparkCompras, sparkResultado, mesLabels,
               varVentas, varCompras, factMesAnt, compraMesAnt,
               facturasMes, facturasTotal, maxMes, maxMesLabel: mesLabels[maxMesIdx],
               _rawVentas: ventas, _rawCompras: compras };
    },
    render(data, el) {
      const resColor = data.resultado >= 0 ? '#10B981' : '#EF4444';
      const varVIcon = data.varVentas >= 0 ? '▲' : '▼';
      const varVColor = data.varVentas >= 0 ? '#10B981' : '#EF4444';
      const varCIcon = data.varCompras >= 0 ? '▲' : '▼';
      const varCColor = data.varCompras <= 0 ? '#10B981' : '#EF4444'; // menos compras = mejor
      const margen = data.factMes > 0 ? ((data.resultado / data.factMes) * 100).toFixed(0) : 0;
      const margenAno = data.factAno > 0 ? ((data.resultadoAno / data.factAno) * 100).toFixed(0) : 0;
      const mediaMes = data.factAno / (new Date().getMonth() + 1);

      el.innerHTML = `
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <!-- Columna izquierda: KPIs principales -->
          <div style="flex:1;min-width:280px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <!-- Facturado mes -->
            <div class="wg-card-accent" style="--card-accent:#3B82F6">
              <div class="wg-card-ico">📈</div>
              <div class="wg-card-big">${fmtE(data.factMes)}</div>
              <div class="wg-card-title">Facturado mes</div>
              <div class="wg-card-row">
                <span style="color:${varVColor};font-weight:700;font-size:11px">${varVIcon} ${Math.abs(data.varVentas).toFixed(0)}%</span>
                <span class="wg-card-dim" style="margin-top:0">vs ${fmtE(data.factMesAnt)}</span>
              </div>
              <div class="wg-card-dim">${data.facturasMes} facturas emitidas</div>
            </div>
            <!-- Compras mes -->
            <div class="wg-card-accent" style="--card-accent:#EF4444">
              <div class="wg-card-ico">🧾</div>
              <div class="wg-card-big">${fmtE(data.compraMes)}</div>
              <div class="wg-card-title">Compras mes</div>
              <div class="wg-card-row">
                <span style="color:${varCColor};font-weight:700;font-size:11px">${varCIcon} ${Math.abs(data.varCompras).toFixed(0)}%</span>
                <span class="wg-card-dim" style="margin-top:0">vs ${fmtE(data.compraMesAnt)}</span>
              </div>
              <div class="wg-card-dim">${data.factMes > 0 ? ((data.compraMes / data.factMes) * 100).toFixed(0) : 0}% sobre ventas</div>
            </div>
            <!-- Resultado mes -->
            <div class="wg-card-accent" style="--card-accent:${resColor}">
              <div class="wg-card-ico">${data.resultado >= 0 ? '✅' : '⚠️'}</div>
              <div class="wg-card-big">${fmtE(data.resultado)}</div>
              <div class="wg-card-title">Resultado mes</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                <span style="font-weight:700;font-size:12px;color:${resColor}">Margen ${margen}%</span>
              </div>
              <div class="wg-bar-track" style="margin-top:6px"><div class="wg-bar-fill" style="width:${Math.min(Math.abs(margen), 100)}%;background:${resColor}"></div></div>
            </div>
            <!-- Acumulado año -->
            <div class="wg-card-accent" style="--card-accent:#8B5CF6">
              <div class="wg-card-ico">📊</div>
              <div class="wg-card-big">${fmtE(data.factAno)}</div>
              <div class="wg-card-title">Acumulado ${new Date().getFullYear()}</div>
              <div class="wg-card-dim" style="margin-top:4px">Media ${fmtE(mediaMes)}/mes</div>
              <div class="wg-card-dim">Margen anual ${margenAno}%</div>
              <div class="wg-card-dim" style="color:#8B5CF6;font-weight:600">★ Mejor: ${data.maxMesLabel} (${fmtE(data.maxMes)})</div>
            </div>
          </div>
          <!-- Columna derecha: gráfico comparativo con selector de periodo -->
          <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0">
              <div style="font-size:12px;font-weight:700;color:var(--gris-600);letter-spacing:0.01em">Ventas vs Compras</div>
              <div id="wg-fin-periodo-tabs" style="display:flex;gap:2px;background:var(--gris-100,#F3F4F6);border-radius:6px;padding:2px">
                <button data-p="semana" style="font-size:10px;font-weight:600;padding:3px 8px;border:none;border-radius:4px;cursor:pointer;background:transparent;color:var(--gris-500)">S</button>
                <button data-p="mes" style="font-size:10px;font-weight:600;padding:3px 8px;border:none;border-radius:4px;cursor:pointer;background:#fff;color:var(--gris-800);box-shadow:0 1px 2px rgba(0,0,0,.08)">M</button>
                <button data-p="trimestre" style="font-size:10px;font-weight:600;padding:3px 8px;border:none;border-radius:4px;cursor:pointer;background:transparent;color:var(--gris-500)">T</button>
                <button data-p="ano" style="font-size:10px;font-weight:600;padding:3px 8px;border:none;border-radius:4px;cursor:pointer;background:transparent;color:var(--gris-500)">A</button>
              </div>
            </div>
            <div id="wg-chart-fin-wrap" style="flex:1;min-height:120px;position:relative">
              <canvas class="wg-chart" id="wg-chart-fin" style="position:absolute;top:0;left:0;width:100%;height:100%"></canvas>
            </div>
            <div style="display:flex;gap:16px;justify-content:center;flex-shrink:0">
              <span style="font-size:10px;display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#3B82F6;display:inline-block"></span>Ventas</span>
              <span style="font-size:10px;display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#EF4444;display:inline-block"></span>Compras</span>
              <span style="font-size:10px;display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#10B981;display:inline-block"></span>Resultado</span>
            </div>
          </div>
        </div>`;

      // ── Función para redibujar el gráfico según periodo ──
      const ventas = data._rawVentas || [];
      const compras = data._rawCompras || [];

      function _buildChartData(periodo) {
        const hoy = new Date();
        let rangos = [];
        if (periodo === 'semana') {
          // Últimas 8 semanas
          for (let i = 7; i >= 0; i--) {
            const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (i * 7));
            const ini = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - 6);
            const lbl = ini.getDate() + '-' + fin.getDate() + ' ' + fin.toLocaleString('es-ES', { month: 'short' }).replace('.', '');
            rangos.push({ label: lbl, desde: ini.toISOString().split('T')[0], hasta: new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1).toISOString().split('T')[0] });
          }
        } else if (periodo === 'mes') {
          rangos = _wgUltMeses(6);
        } else if (periodo === 'trimestre') {
          // Últimos 4 trimestres
          for (let i = 3; i >= 0; i--) {
            const q = Math.floor(hoy.getMonth() / 3) - i;
            const y = hoy.getFullYear() + Math.floor(q / 4) + (q < 0 ? -1 : 0);
            const qn = ((q % 4) + 4) % 4;
            const ini = new Date(y, qn * 3, 1);
            const fin = new Date(y, qn * 3 + 3, 1);
            rangos.push({ label: 'T' + (qn + 1) + ' ' + y, desde: ini.toISOString().split('T')[0], hasta: fin.toISOString().split('T')[0] });
          }
        } else { // año
          for (let i = 2; i >= 0; i--) {
            const y = hoy.getFullYear() - i;
            rangos.push({ label: '' + y, desde: y + '-01-01', hasta: (y + 1) + '-01-01' });
          }
        }
        const labels = rangos.map(r => r.label);
        const vData = rangos.map(r => ventas.filter(f => f.fecha >= r.desde && f.fecha < r.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));
        const cData = rangos.map(r => compras.filter(f => f.fecha >= r.desde && f.fecha < r.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));
        return { labels, vData, cData };
      }

      function _redrawChart(periodo) {
        const { labels, vData, cData } = _buildChartData(periodo);
        const wrap = el.querySelector('#wg-chart-fin-wrap');
        const chart = el.querySelector('#wg-chart-fin');
        if (!chart || !wrap) return;
        chart.width = wrap.offsetWidth || 300;
        chart.height = wrap.offsetHeight || 190;
        _drawBarChart(chart, labels, [
          { label: 'Ventas', color: '#3B82F6', values: vData },
          { label: 'Compras', color: '#EF4444', values: cData }
        ]);
      }

      // Bind tabs del selector de periodo
      const tabs = el.querySelectorAll('#wg-fin-periodo-tabs button');
      tabs.forEach(btn => {
        btn.onclick = () => {
          tabs.forEach(b => { b.style.background = 'transparent'; b.style.color = 'var(--gris-500)'; b.style.boxShadow = 'none'; });
          btn.style.background = '#fff';
          btn.style.color = 'var(--gris-800)';
          btn.style.boxShadow = '0 1px 2px rgba(0,0,0,.08)';
          _redrawChart(btn.dataset.p);
        };
      });

      // Dibujar gráfico inicial (mes)
      requestAnimationFrame(() => _redrawChart('mes'));
    }
  },

  // ── Panel: Tesorería (Pendiente cobro + pago + saldo + posición neta + antigüedad) ──
  {
    id: 'panel_tesoreria', label: 'Tesorería', ico: '🏦',
    cat: 'panel', size: 'md',
    async fetch(eid) {
      const [rFact, rProv, rBanco] = await Promise.all([
        sb.from('facturas').select('fecha,base_imponible,estado,fecha_vencimiento').eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('facturas_proveedor').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('cuentas_bancarias').select('saldo_actual,nombre').eq('empresa_id', eid).eq('activa', true),
      ]);
      const pendCobro = (rFact.data || []).filter(f => f.estado === 'pendiente' || f.estado === 'vencida');
      const vencidas = pendCobro.filter(f => f.estado === 'vencida');
      const totalCobro = pendCobro.reduce((s, f) => s + (f.base_imponible || 0), 0);
      const totalVencido = vencidas.reduce((s, f) => s + (f.base_imponible || 0), 0);

      // Antigüedad deuda por cobrar
      const hoy = new Date();
      const aging = { d30: 0, d60: 0, d90: 0, dmas: 0 };
      pendCobro.forEach(f => {
        const dias = Math.floor((hoy - new Date(f.fecha)) / 86400000);
        const imp = f.base_imponible || 0;
        if (dias <= 30) aging.d30 += imp;
        else if (dias <= 60) aging.d60 += imp;
        else if (dias <= 90) aging.d90 += imp;
        else aging.dmas += imp;
      });

      const pendPago = (rProv.data || []).filter(f => f.estado === 'pendiente');
      const totalPago = pendPago.reduce((s, f) => s + (f.base_imponible || 0), 0);

      const saldo = (rBanco.data || []).reduce((s, c) => s + (c.saldo_actual || 0), 0);
      const nCuentas = (rBanco.data || []).length;
      const cuentas = (rBanco.data || []).map(c => ({ nombre: c.nombre, saldo: c.saldo_actual || 0 }));

      const posicionNeta = saldo + totalCobro - totalPago;
      // Ratio cobertura: cuánto cobro hay por cada euro de pago
      const ratio = totalPago > 0 ? (totalCobro / totalPago) : totalCobro > 0 ? 99 : 0;

      return { totalCobro, countCobro: pendCobro.length, totalVencido, countVencido: vencidas.length,
               totalPago, countPago: pendPago.length, saldo, nCuentas, cuentas, posicionNeta,
               aging, ratio };
    },
    render(data, el) {
      const posColor = data.posicionNeta >= 0 ? '#10B981' : '#EF4444';
      const ratioColor = data.ratio >= 1.5 ? '#10B981' : data.ratio >= 1 ? '#F59E0B' : '#EF4444';
      const ratioLabel = data.ratio >= 1.5 ? 'Saludable' : data.ratio >= 1 ? 'Ajustado' : 'Riesgo';
      // Barra visual cobrar vs pagar
      const totalFlow = data.totalCobro + data.totalPago || 1;
      const pctCobro = (data.totalCobro / totalFlow * 100).toFixed(0);
      const pctPago = (data.totalPago / totalFlow * 100).toFixed(0);
      // Aging bar
      const agingTotal = data.totalCobro || 1;
      const agPct = k => ((data.aging[k] / agingTotal) * 100).toFixed(0);

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px">
          <!-- Fila 1: Cobrar vs Pagar -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="wg-card-accent" style="--card-accent:#F59E0B">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:18px">📥</span>
                <div>
                  <div class="wg-card-big" style="font-size:20px">${fmtE(data.totalCobro)}</div>
                  <div class="wg-card-title">Por cobrar · ${data.countCobro} fact.</div>
                </div>
              </div>
              ${data.totalVencido > 0 ? `<div style="margin-top:6px;padding:4px 10px;background:rgba(239,68,68,.08);border-radius:6px;font-size:10px;color:#EF4444;font-weight:600">⚠ ${fmtE(data.totalVencido)} vencido (${data.countVencido} fact.)</div>` : '<div style="margin-top:6px;font-size:10px;color:#10B981;font-weight:600">✓ Sin facturas vencidas</div>'}
            </div>
            <div class="wg-card-accent" style="--card-accent:#EF4444">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:18px">📤</span>
                <div>
                  <div class="wg-card-big" style="font-size:20px">${fmtE(data.totalPago)}</div>
                  <div class="wg-card-title">Por pagar · ${data.countPago} fact.</div>
                </div>
              </div>
              <div style="margin-top:6px;font-size:10px;color:var(--gris-500)">Ratio cobro/pago: <strong style="color:${ratioColor}">${data.ratio.toFixed(1)}x</strong> <span style="color:${ratioColor}">(${ratioLabel})</span></div>
            </div>
          </div>
          <!-- Barra visual comparativa -->
          <div>
            <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:#F3F4F6">
              <div style="width:${pctCobro}%;background:linear-gradient(90deg,#F59E0B,#FBBF24);transition:width .4s" title="Por cobrar ${pctCobro}%"></div>
              <div style="width:${pctPago}%;background:linear-gradient(90deg,#EF4444,#F87171);transition:width .4s" title="Por pagar ${pctPago}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--gris-400);margin-top:3px">
              <span>📥 Cobrar ${pctCobro}%</span>
              <span>📤 Pagar ${pctPago}%</span>
            </div>
          </div>
          <!-- Aging deuda -->
          <div style="background:var(--gris-50,#F9FAFB);border-radius:10px;padding:10px 12px">
            <div style="font-size:10px;font-weight:700;color:var(--gris-500);margin-bottom:6px">Antigüedad deuda por cobrar</div>
            <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:#E5E7EB">
              <div style="width:${agPct('d30')}%;background:#10B981" title="0-30d"></div>
              <div style="width:${agPct('d60')}%;background:#F59E0B" title="31-60d"></div>
              <div style="width:${agPct('d90')}%;background:#F97316" title="61-90d"></div>
              <div style="width:${agPct('dmas')}%;background:#EF4444" title=">90d"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:9px;color:var(--gris-400)">
              <span><span style="color:#10B981">●</span> 0-30d ${fmtE(data.aging.d30)}</span>
              <span><span style="color:#F59E0B">●</span> 31-60d ${fmtE(data.aging.d60)}</span>
              <span><span style="color:#F97316">●</span> 61-90d ${fmtE(data.aging.d90)}</span>
              <span><span style="color:#EF4444">●</span> >90d ${fmtE(data.aging.dmas)}</span>
            </div>
          </div>
          <!-- Saldo + Posición neta -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="wg-card-accent" style="--card-accent:${data.saldo >= 0 ? '#10B981' : '#EF4444'}">
              <div style="font-size:10px;color:var(--gris-500);font-weight:600">🏦 Saldo bancario</div>
              <div style="font-size:20px;font-weight:800;color:${data.saldo >= 0 ? '#10B981' : '#EF4444'};margin-top:2px">${fmtE(data.saldo)}</div>
              <div style="font-size:9px;color:var(--gris-400);margin-top:2px">${data.nCuentas} cuenta${data.nCuentas !== 1 ? 's' : ''} activa${data.nCuentas !== 1 ? 's' : ''}</div>
            </div>
            <div class="wg-card-accent" style="--card-accent:${data.posicionNeta >= 0 ? '#10B981' : '#EF4444'}">
              <div style="font-size:10px;color:var(--gris-500);font-weight:600">📐 Posición neta</div>
              <div style="font-size:20px;font-weight:800;color:${posColor};margin-top:2px">${fmtE(data.posicionNeta)}</div>
              <div style="font-size:9px;color:var(--gris-400);margin-top:2px">Saldo + cobros − pagos</div>
            </div>
          </div>
        </div>`;
    }
  },

  // ── Panel: Actividad Comercial (Presupuestos + Clientes + Obras + Funnel) ──
  {
    id: 'panel_comercial', label: 'Actividad comercial', ico: '📋',
    cat: 'panel', size: 'md',
    async fetch(eid) {
      const meses = _wgUltMeses(6);
      const { data: presups } = await sb.from('presupuestos')
        .select('fecha,estado,total,created_at')
        .eq('empresa_id', eid).neq('estado', 'eliminado');

      const todos = presups || [];
      const pend = todos.filter(p => p.estado === 'pendiente' || p.estado === 'enviado');
      const aceptados = todos.filter(p => p.estado === 'aceptado');
      const rechazados = todos.filter(p => p.estado === 'rechazado');
      const totalPend = pend.reduce((s, p) => s + (p.total || 0), 0);
      const totalAceptado = aceptados.reduce((s, p) => s + (p.total || 0), 0);

      // Funnel
      const totalPresups = todos.length;
      const tasaConversion = totalPresups > 0 ? ((aceptados.length / totalPresups) * 100) : 0;
      const tasaRechazo = totalPresups > 0 ? ((rechazados.length / totalPresups) * 100) : 0;

      // Presupuestos este mes vs anterior
      const presupsMes = todos.filter(p => (p.fecha || (p.created_at || '').split('T')[0]) >= _wgInicioMes()).length;
      const sparkPresups = meses.map(m => todos.filter(p => {
        const f = p.fecha || (p.created_at || '').split('T')[0];
        return f >= m.desde && f < m.hasta;
      }).length);

      const allClientes = (typeof clientes !== 'undefined' ? clientes : []);
      const totalClientes = allClientes.length;
      const clientesNuevosMes = allClientes.filter(c => {
        const f = (c.created_at || '').split('T')[0];
        return f >= _wgInicioMes();
      }).length;
      const sparkClientes = meses.map(m => allClientes.filter(c => {
        const f = (c.created_at || '').split('T')[0];
        return f >= m.desde && f < m.hasta;
      }).length);

      const allObras = (typeof trabajos !== 'undefined' ? trabajos : []);
      const obrasActivas = allObras.filter(t => t.estado === 'en_curso' || t.estado === 'planificado' || t.estado === 'pendiente');
      const obrasEnCurso = allObras.filter(t => t.estado === 'en_curso').length;
      const obrasPlanificadas = allObras.filter(t => t.estado === 'planificado' || t.estado === 'pendiente').length;

      return { pendCount: pend.length, totalPend, totalAceptado,
               aceptadosCount: aceptados.length, rechazadosCount: rechazados.length,
               tasaConversion: tasaConversion.toFixed(0), tasaRechazo: tasaRechazo.toFixed(0),
               totalPresups, presupsMes, sparkPresups,
               totalClientes, clientesNuevosMes, sparkClientes,
               obrasActivas: obrasActivas.length, obrasEnCurso, obrasPlanificadas };
    },
    render(data, el) {
      const convPct = parseInt(data.tasaConversion);
      const convColor = convPct >= 50 ? '#10B981' : convPct >= 30 ? '#F59E0B' : '#EF4444';

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px">
          <!-- Presupuestos -->
          <div class="wg-card-accent" style="--card-accent:#8B5CF6">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-size:10px;font-weight:600;color:var(--gris-500)">📋 Presupuestos pendientes</div>
                <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
                  <span style="font-size:24px;font-weight:800;color:#8B5CF6">${data.pendCount}</span>
                  <span style="font-size:13px;color:var(--gris-500);font-weight:600">${fmtE(data.totalPend)}</span>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-size:9px;color:var(--gris-400)">${data.presupsMes} este mes · ${data.totalPresups} total</div>
              </div>
            </div>
            <!-- Mini funnel -->
            <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
              <div style="flex:1;height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${data.tasaConversion}%;background:linear-gradient(90deg,${convColor},${convColor}cc);border-radius:4px;transition:width .4s"></div>
              </div>
              <span style="font-size:11px;font-weight:800;color:${convColor}">${data.tasaConversion}%</span>
            </div>
            <div style="display:flex;gap:14px;margin-top:5px;font-size:10px;color:var(--gris-400)">
              <span>✅ ${data.aceptadosCount} aceptados (${fmtE(data.totalAceptado)})</span>
              <span>❌ ${data.rechazadosCount} rechazados</span>
            </div>
          </div>
          <!-- Clientes + Obras -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="wg-card-accent" style="--card-accent:#3B82F6">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:20px">👥</span>
                <div>
                  <div style="font-size:22px;font-weight:800;color:#3B82F6">${data.totalClientes}</div>
                  <div class="wg-card-title">Clientes</div>
                </div>
              </div>
              <div style="font-size:10px;margin-top:6px;color:${data.clientesNuevosMes > 0 ? '#10B981' : 'var(--gris-400)'}">
                ${data.clientesNuevosMes > 0 ? `+${data.clientesNuevosMes} nuevos este mes` : 'Sin altas este mes'}
              </div>
            </div>
            <div class="wg-card-accent" style="--card-accent:#0EA5E9">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:20px">🏗️</span>
                <div>
                  <div style="font-size:22px;font-weight:800;color:#0EA5E9">${data.obrasActivas}</div>
                  <div class="wg-card-title">Obras activas</div>
                </div>
              </div>
              <div style="font-size:10px;margin-top:6px;color:var(--gris-500)">
                🔨 ${data.obrasEnCurso} en curso · 📅 ${data.obrasPlanificadas} planif.
              </div>
            </div>
          </div>
        </div>`;
    }
  },

  // ═══════════════════════════════════════════
  //  WIDGETS TIPO LISTA (size: md) — Enriquecidos
  // ═══════════════════════════════════════════

  // ── Lista: Facturas pendientes cobro ──
  {
    id: 'list_facturas_pend', label: 'Facturas pend. cobro', ico: '🧾',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const { data } = await sb.from('facturas')
        .select('id,numero,cliente_nombre,base_imponible,estado,fecha_vencimiento,fecha')
        .eq('empresa_id', eid)
        .in('estado', ['pendiente', 'vencida'])
        .order('fecha_vencimiento', { ascending: true })
        .limit(8);
      const items = data || [];
      const total = items.reduce((s, f) => s + (f.base_imponible || 0), 0);
      const vencidas = items.filter(f => f.estado === 'vencida');
      const totalVencido = vencidas.reduce((s, f) => s + (f.base_imponible || 0), 0);
      return { items, total, vencidas: vencidas.length, totalVencido };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:6px">🎉</div><div style="font-size:13px;font-weight:600;color:#10B981">Todo cobrado</div><div style="font-size:11px;color:var(--gris-400)">No hay facturas pendientes de cobro</div></div>';
        return;
      }
      const hoy = new Date();
      // Cabecera resumen
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:2px solid var(--gris-100);margin-bottom:4px">
        <div>
          <span style="font-size:16px;font-weight:800;color:var(--acento,#F59E0B)">${fmtE(data.total)}</span>
          <span style="font-size:11px;color:var(--gris-400);margin-left:4px">${data.items.length} facturas</span>
        </div>
        ${data.vencidas > 0 ? `<div style="padding:2px 8px;background:rgba(239,68,68,.08);border-radius:4px;font-size:10px;color:#EF4444;font-weight:600">⚠ ${data.vencidas} vencida${data.vencidas > 1 ? 's' : ''} · ${fmtE(data.totalVencido)}</div>` : '<div style="font-size:10px;color:#10B981;font-weight:600">✓ Sin vencidas</div>'}
      </div>`;
      // Lista
      html += data.items.map(f => {
        const dias = f.fecha_vencimiento ? Math.floor((hoy - new Date(f.fecha_vencimiento)) / 86400000) : null;
        const diasTxt = dias !== null ? (dias > 0 ? `hace ${dias}d` : dias === 0 ? 'hoy' : `en ${Math.abs(dias)}d`) : '';
        const diasColor = dias !== null ? (dias > 0 ? '#EF4444' : dias <= 7 ? '#F59E0B' : '#10B981') : 'var(--gris-400)';
        const badgeBg = f.estado === 'vencida' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)';
        const badgeColor = f.estado === 'vencida' ? '#EF4444' : '#F59E0B';
        return `
        <div class="wg-list-row" onclick="goPage('facturas')">
          <div style="width:3px;border-radius:2px;background:${badgeColor};align-self:stretch;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-weight:700;font-size:12px">${f.numero || '—'}</span>
              <span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${badgeBg};color:${badgeColor};font-weight:700">${f.estado === 'vencida' ? 'Vencida' : 'Pendiente'}</span>
            </div>
            <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.cliente_nombre || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-weight:800;font-size:13px">${fmtE(f.base_imponible)}</div>
            ${diasTxt ? `<div style="font-size:9px;color:${diasColor};font-weight:600">Vence ${diasTxt}</div>` : ''}
          </div>
        </div>`;
      }).join('');
      el.innerHTML = html;
    }
  },

  // ── Lista: Presupuestos pendientes ──
  {
    id: 'list_presup_pend', label: 'Presupuestos pend.', ico: '📋',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const { data } = await sb.from('presupuestos')
        .select('id,numero,cliente_nombre,total,estado,created_at')
        .eq('empresa_id', eid)
        .in('estado', ['pendiente', 'borrador', 'enviado'])
        .order('created_at', { ascending: false })
        .limit(8);
      const items = data || [];
      const total = items.reduce((s, p) => s + (p.total || 0), 0);
      const porEstado = { pendiente: 0, borrador: 0, enviado: 0 };
      items.forEach(p => { if (porEstado[p.estado] !== undefined) porEstado[p.estado]++; });
      return { items, total, porEstado };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:6px">📋</div><div style="font-size:13px;font-weight:600;color:var(--gris-500)">Sin presupuestos pendientes</div></div>';
        return;
      }
      const hoy = new Date();
      const estadoConfig = {
        borrador: { bg: 'rgba(156,163,175,.1)', color: '#6B7280', label: 'Borrador' },
        pendiente: { bg: 'rgba(245,158,11,.1)', color: '#F59E0B', label: 'Pendiente' },
        enviado: { bg: 'rgba(59,130,246,.1)', color: '#3B82F6', label: 'Enviado' }
      };
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:2px solid var(--gris-100);margin-bottom:4px">
        <div>
          <span style="font-size:16px;font-weight:800;color:#8B5CF6">${fmtE(data.total)}</span>
          <span style="font-size:11px;color:var(--gris-400);margin-left:4px">${data.items.length} presupuestos</span>
        </div>
        <div style="display:flex;gap:6px">
          ${Object.entries(data.porEstado).filter(([,v]) => v > 0).map(([k, v]) => {
            const c = estadoConfig[k] || estadoConfig.pendiente;
            return `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${c.bg};color:${c.color};font-weight:700">${v} ${c.label.toLowerCase()}</span>`;
          }).join('')}
        </div>
      </div>`;
      html += data.items.map(p => {
        const dias = Math.floor((hoy - new Date(p.created_at)) / 86400000);
        const diasTxt = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias}d`;
        const ec = estadoConfig[p.estado] || estadoConfig.pendiente;
        return `
        <div class="wg-list-row" onclick="goPage('presupuestos')">
          <div style="width:3px;border-radius:2px;background:${ec.color};align-self:stretch;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-weight:700;font-size:12px">${p.numero || '—'}</span>
              <span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${ec.bg};color:${ec.color};font-weight:700">${ec.label}</span>
            </div>
            <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.cliente_nombre || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-weight:800;font-size:13px">${fmtE(p.total)}</div>
            <div style="font-size:9px;color:var(--gris-400)">${diasTxt}</div>
          </div>
        </div>`;
      }).join('');
      el.innerHTML = html;
    }
  },

  // ── Lista: Obras activas ──
  {
    id: 'list_obras', label: 'Obras activas', ico: '🏗️',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const allObras = (typeof trabajos !== 'undefined' ? trabajos : []);
      const activas = allObras.filter(t => t.estado !== 'finalizado' && t.estado !== 'cancelado').slice(0, 8);
      const enCurso = activas.filter(t => t.estado === 'en_curso').length;
      const planif = activas.filter(t => t.estado === 'planificado' || t.estado === 'pendiente').length;
      return { items: activas, enCurso, planif, total: activas.length };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:6px">🏗️</div><div style="font-size:13px;font-weight:600;color:var(--gris-500)">Sin obras activas</div></div>';
        return;
      }
      const estadoColors = { en_curso: '#3B82F6', planificado: '#F59E0B', pendiente: '#9CA3AF' };
      const estadoLabels = { en_curso: 'En curso', planificado: 'Planificada', pendiente: 'Pendiente' };
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:2px solid var(--gris-100);margin-bottom:4px">
        <div>
          <span style="font-size:16px;font-weight:800;color:#0EA5E9">${data.total}</span>
          <span style="font-size:11px;color:var(--gris-400);margin-left:4px">obras activas</span>
        </div>
        <div style="display:flex;gap:6px">
          ${data.enCurso > 0 ? `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,.1);color:#3B82F6;font-weight:700">🔨 ${data.enCurso} en curso</span>` : ''}
          ${data.planif > 0 ? `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(245,158,11,.1);color:#F59E0B;font-weight:700">📅 ${data.planif} planif.</span>` : ''}
        </div>
      </div>`;
      html += data.items.map(t => {
        const color = estadoColors[t.estado] || '#9CA3AF';
        const label = estadoLabels[t.estado] || t.estado;
        const dias = t.created_at ? Math.floor((new Date() - new Date(t.created_at)) / 86400000) : null;
        return `
        <div class="wg-list-row" onclick="goPage('trabajos')">
          <div style="width:3px;border-radius:2px;background:${color};align-self:stretch;flex-shrink:0"></div>
          <span style="font-size:16px;flex-shrink:0">${typeof catIco === 'function' ? catIco(t.categoria) : '🔧'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.titulo || '—'}</div>
            <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.cliente_nombre || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${color}18;color:${color};font-weight:700">${label}</span>
            ${dias !== null ? `<div style="font-size:9px;color:var(--gris-400);margin-top:1px">${dias}d abierta</div>` : ''}
          </div>
        </div>`;
      }).join('');
      el.innerHTML = html;
    }
  },

  // ── Lista: Mis tareas ──
  {
    id: 'list_tareas', label: 'Mis tareas', ico: '✅',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const userId = CU?.id;
      if (!userId) return { items: [], urgentes: 0, enProgreso: 0, vencidas: 0, total: 0 };
      const { data } = await sb.from('tareas_obra')
        .select('id,texto,estado,prioridad,fecha_limite,trabajo_id')
        .eq('empresa_id', eid)
        .eq('responsable_id', userId)
        .neq('estado', 'completada')
        .neq('estado', 'rechazada')
        .order('created_at', { ascending: false })
        .limit(10);
      const items = data || [];
      const urgentes = items.filter(t => t.prioridad === 'Urgente' || t.prioridad === 'Alta').length;
      const enProgreso = items.filter(t => t.estado === 'en_progreso').length;
      const vencidas = items.filter(t => t.fecha_limite && new Date(t.fecha_limite) < new Date()).length;
      return { items, urgentes, enProgreso, vencidas, total: items.length };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:6px">🎯</div><div style="font-size:13px;font-weight:600;color:#10B981">Todo al día</div><div style="font-size:11px;color:var(--gris-400)">No tienes tareas pendientes</div></div>';
        return;
      }
      const prioConfig = {
        Urgente: { ico: '🔴', bg: 'rgba(239,68,68,.08)', color: '#EF4444' },
        Alta:    { ico: '🟠', bg: 'rgba(249,115,22,.08)', color: '#F97316' },
        Normal:  { ico: '⚪', bg: 'rgba(156,163,175,.06)', color: '#6B7280' },
        Baja:    { ico: '🔵', bg: 'rgba(59,130,246,.06)', color: '#3B82F6' }
      };
      const hoy = new Date();
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:2px solid var(--gris-100);margin-bottom:4px">
        <div>
          <span style="font-size:16px;font-weight:800;color:#3B82F6">${data.total}</span>
          <span style="font-size:11px;color:var(--gris-400);margin-left:4px">tareas</span>
        </div>
        <div style="display:flex;gap:6px">
          ${data.urgentes > 0 ? `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.1);color:#EF4444;font-weight:700">${data.urgentes} urgente${data.urgentes > 1 ? 's' : ''}</span>` : ''}
          ${data.enProgreso > 0 ? `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,.1);color:#3B82F6;font-weight:700">${data.enProgreso} en progreso</span>` : ''}
          ${data.vencidas > 0 ? `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.1);color:#EF4444;font-weight:700">⚠ ${data.vencidas} vencida${data.vencidas > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>`;
      html += data.items.map(t => {
        const p = prioConfig[t.prioridad] || prioConfig.Normal;
        const vencida = t.fecha_limite && new Date(t.fecha_limite) < hoy;
        const dias = t.fecha_limite ? Math.floor((new Date(t.fecha_limite) - hoy) / 86400000) : null;
        const diasTxt = dias !== null ? (dias < 0 ? `${Math.abs(dias)}d tarde` : dias === 0 ? 'Hoy' : `${dias}d`) : '';
        const diasColor = vencida ? '#EF4444' : (dias !== null && dias <= 2) ? '#F59E0B' : 'var(--gris-400)';
        const estadoBg = t.estado === 'en_progreso' ? 'rgba(59,130,246,.1)' : 'transparent';
        const estadoColor = t.estado === 'en_progreso' ? '#3B82F6' : 'var(--gris-400)';
        return `
        <div class="wg-list-row" style="background:${p.bg}">
          <span style="font-size:11px;flex-shrink:0">${p.ico}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${vencida ? '#EF4444' : 'inherit'}">${t.texto}</div>
            <div style="display:flex;gap:8px;margin-top:1px">
              ${t.estado === 'en_progreso' ? `<span style="font-size:9px;padding:0 5px;border-radius:3px;background:${estadoBg};color:${estadoColor};font-weight:700">En progreso</span>` : ''}
              ${diasTxt ? `<span style="font-size:9px;color:${diasColor};font-weight:600">${vencida ? '⚠ ' : '📅 '}${diasTxt}</span>` : ''}
            </div>
          </div>
          <span style="font-size:9px;color:${p.color};font-weight:700;flex-shrink:0">${t.prioridad || 'Normal'}</span>
        </div>`;
      }).join('');
      el.innerHTML = html;
    }
  },

  // ═══════════════════════════════════════════
  //  WIDGETS TIPO GRÁFICO (size: md) — Enriquecidos
  // ═══════════════════════════════════════════

  // ── Gráfico: Facturación 6 meses ──
  {
    id: 'chart_facturacion_6m', label: 'Facturación 6 meses', ico: '📊',
    cat: 'grafico', size: 'md',
    async fetch(eid) {
      const meses = _wgUltMeses(6);
      const { data } = await sb.from('facturas')
        .select('fecha,base_imponible,estado')
        .eq('empresa_id', eid).neq('estado', 'eliminado');
      const activas = _wgFactActivas(data);
      const values = meses.map(m =>
        activas.filter(f => f.fecha >= m.desde && f.fecha < m.hasta)
          .reduce((s, f) => s + (f.base_imponible || 0), 0)
      );
      const total = values.reduce((s, v) => s + v, 0);
      const media = total / values.length;
      const max = Math.max(...values);
      const maxIdx = values.indexOf(max);
      const mesActual = values[values.length - 1];
      const mesAnterior = values.length >= 2 ? values[values.length - 2] : 0;
      const variacion = mesAnterior > 0 ? ((mesActual - mesAnterior) / mesAnterior * 100) : 0;
      return { labels: meses.map(m => m.label), values, total, media, max, maxLabel: meses[maxIdx]?.label, mesActual, variacion };
    },
    render(data, el) {
      const varIcon = data.variacion >= 0 ? '▲' : '▼';
      const varColor = data.variacion >= 0 ? '#10B981' : '#EF4444';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;flex-wrap:wrap;gap:6px">
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <div><div style="font-size:9px;color:var(--gris-400);font-weight:600">TOTAL 6M</div><div style="font-size:14px;font-weight:800;color:#3B82F6">${fmtE(data.total)}</div></div>
            <div><div style="font-size:9px;color:var(--gris-400);font-weight:600">MEDIA</div><div style="font-size:14px;font-weight:800;color:var(--gris-600)">${fmtE(data.media)}</div></div>
            <div><div style="font-size:9px;color:var(--gris-400);font-weight:600">MEJOR MES</div><div style="font-size:14px;font-weight:800;color:#10B981">${data.maxLabel} (${fmtE(data.max)})</div></div>
          </div>
          <div style="text-align:right">
            <span style="font-size:11px;font-weight:700;color:${varColor}">${varIcon} ${Math.abs(data.variacion).toFixed(0)}% vs anterior</span>
          </div>
        </div>
        <canvas class="wg-chart" height="150"></canvas>`;
      requestAnimationFrame(() => {
        const c = el.querySelector('.wg-chart');
        c.width = c.parentElement.offsetWidth || 280;
        _drawBarChart(c, data.labels, [
          { label: 'Facturación', color: '#3B82F6', values: data.values }
        ]);
      });
    }
  },

  // ── Gráfico: Cobros vs Pagos 6 meses ──
  {
    id: 'chart_cobros_pagos', label: 'Cobros vs Pagos', ico: '⚖️',
    cat: 'grafico', size: 'md',
    async fetch(eid) {
      const meses = _wgUltMeses(6);
      const [rV, rC] = await Promise.all([
        sb.from('facturas').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('facturas_proveedor').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
      ]);
      const ventas = _wgFactActivas(rV.data);
      const compras = (rC.data || []).filter(f => f.estado !== 'anulada');

      const vValues = meses.map(m => ventas.filter(f => f.fecha >= m.desde && f.fecha < m.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));
      const cValues = meses.map(m => compras.filter(f => f.fecha >= m.desde && f.fecha < m.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));

      const totalV = vValues.reduce((s, v) => s + v, 0);
      const totalC = cValues.reduce((s, v) => s + v, 0);
      const resultado = totalV - totalC;
      const margen = totalV > 0 ? ((resultado / totalV) * 100).toFixed(0) : 0;
      // Meses con resultado positivo
      const mesesPositivos = vValues.filter((v, i) => v - cValues[i] > 0).length;

      return { labels: meses.map(m => m.label), ventas: vValues, compras: cValues, totalV, totalC, resultado, margen, mesesPositivos, totalMeses: meses.length };
    },
    render(data, el) {
      const resColor = data.resultado >= 0 ? '#10B981' : '#EF4444';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;flex-wrap:wrap;gap:6px">
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div><div style="font-size:9px;color:var(--gris-400);font-weight:600">VENTAS 6M</div><div style="font-size:14px;font-weight:800;color:#3B82F6">${fmtE(data.totalV)}</div></div>
            <div><div style="font-size:9px;color:var(--gris-400);font-weight:600">COMPRAS 6M</div><div style="font-size:14px;font-weight:800;color:#EF4444">${fmtE(data.totalC)}</div></div>
            <div><div style="font-size:9px;color:var(--gris-400);font-weight:600">RESULTADO</div><div style="font-size:14px;font-weight:800;color:${resColor}">${fmtE(data.resultado)}</div></div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--gris-400)">Margen <strong style="color:${resColor}">${data.margen}%</strong></div>
            <div style="font-size:9px;color:var(--gris-400)">${data.mesesPositivos}/${data.totalMeses} meses positivos</div>
          </div>
        </div>
        <canvas class="wg-chart" height="150"></canvas>
        <div style="display:flex;gap:14px;justify-content:center;margin-top:4px">
          <span style="font-size:10px;display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:#3B82F6;display:inline-block"></span>Ventas</span>
          <span style="font-size:10px;display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:#EF4444;display:inline-block"></span>Compras</span>
        </div>`;
      requestAnimationFrame(() => {
        const c = el.querySelector('.wg-chart');
        c.width = c.parentElement.offsetWidth || 280;
        _drawBarChart(c, data.labels, [
          { label: 'Ventas', color: '#3B82F6', values: data.ventas },
          { label: 'Compras', color: '#EF4444', values: data.compras }
        ]);
      });
    }
  }

  // ═══════════════════════════════════════════
  //  WIDGETS GESTORÍA / CONTABILIDAD
  // ═══════════════════════════════════════════

  // ── Lista: Facturas proveedor pendientes de pago ──
  ,{
    id: 'list_facturas_prov_pend', label: 'Facturas prov. pend.', ico: '📑',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const { data } = await sb.from('facturas_proveedor')
        .select('id,numero,proveedor_nombre,base_imponible,total,estado,fecha_vencimiento,fecha')
        .eq('empresa_id', eid)
        .in('estado', ['pendiente'])
        .order('fecha_vencimiento', { ascending: true })
        .limit(8);
      const items = data || [];
      const total = items.reduce((s, f) => s + (f.total || f.base_imponible || 0), 0);
      const hoy = new Date();
      const vencidas = items.filter(f => f.fecha_vencimiento && new Date(f.fecha_vencimiento) < hoy);
      const totalVencido = vencidas.reduce((s, f) => s + (f.total || f.base_imponible || 0), 0);
      return { items, total, vencidas: vencidas.length, totalVencido };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:6px">✅</div><div style="font-size:13px;font-weight:600;color:#10B981">Todo pagado</div><div style="font-size:11px;color:var(--gris-400)">No hay facturas de proveedor pendientes</div></div>';
        return;
      }
      const hoy = new Date();
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:2px solid var(--gris-100);margin-bottom:4px">
        <div>
          <span style="font-size:16px;font-weight:800;color:#EF4444">${fmtE(data.total)}</span>
          <span style="font-size:11px;color:var(--gris-400);margin-left:4px">${data.items.length} facturas</span>
        </div>
        ${data.vencidas > 0 ? `<div style="padding:2px 8px;background:rgba(239,68,68,.08);border-radius:4px;font-size:10px;color:#EF4444;font-weight:600">⚠ ${data.vencidas} vencida${data.vencidas > 1 ? 's' : ''} · ${fmtE(data.totalVencido)}</div>` : '<div style="font-size:10px;color:#10B981;font-weight:600">✓ Sin vencidas</div>'}
      </div>`;
      html += data.items.map(f => {
        const dias = f.fecha_vencimiento ? Math.floor((hoy - new Date(f.fecha_vencimiento)) / 86400000) : null;
        const diasTxt = dias !== null ? (dias > 0 ? `hace ${dias}d` : dias === 0 ? 'hoy' : `en ${Math.abs(dias)}d`) : '';
        const diasColor = dias !== null ? (dias > 0 ? '#EF4444' : dias <= 7 ? '#F59E0B' : '#10B981') : 'var(--gris-400)';
        const vencida = dias !== null && dias > 0;
        return `
        <div class="wg-list-row" onclick="goPage('facturas-proveedor')">
          <div style="width:3px;border-radius:2px;background:${vencida ? '#EF4444' : '#F59E0B'};align-self:stretch;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-weight:700;font-size:12px">${f.numero || '—'}</span>
              ${vencida ? '<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.1);color:#EF4444;font-weight:700">Vencida</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.proveedor_nombre || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-weight:800;font-size:13px">${fmtE(f.total || f.base_imponible)}</div>
            ${diasTxt ? `<div style="font-size:9px;color:${diasColor};font-weight:600">Vence ${diasTxt}</div>` : ''}
          </div>
        </div>`;
      }).join('');
      el.innerHTML = html;
    }
  },

  // ── Panel: Resumen fiscal (IVA repercutido vs soportado, resultado trimestre) ──
  {
    id: 'panel_fiscal', label: 'Resumen fiscal', ico: '🧮',
    cat: 'panel', size: 'md',
    async fetch(eid) {
      // Periodo seleccionado por el usuario (persistido en localStorage)
      const periodo = _wgFiscalGetPeriodo();
      const year = periodo.year;
      const trimestre = periodo.tri;
      const trimestreLabel = `${trimestre + 1}T ${year}`;
      const trDesde = new Date(year, trimestre * 3, 1).toISOString().split('T')[0];
      const trHasta = new Date(year, (trimestre + 1) * 3, 1).toISOString().split('T')[0];
      const anoDesde = `${year}-01-01`;
      const anoHasta = `${year + 1}-01-01`;

      const [rV, rC] = await Promise.all([
        sb.from('facturas').select('fecha,base_imponible,total_iva,total,estado')
          .eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('facturas_proveedor').select('fecha,base_imponible,total_iva,total,estado')
          .eq('empresa_id', eid).neq('estado', 'eliminado'),
      ]);
      const ventas = _wgFactActivas(rV.data);
      const compras = (rC.data || []).filter(f => f.estado !== 'anulada');

      // IVA trimestre
      const ventasTr = ventas.filter(f => f.fecha >= trDesde && f.fecha < trHasta);
      const comprasTr = compras.filter(f => f.fecha >= trDesde && f.fecha < trHasta);
      const ivaRepTr = ventasTr.reduce((s, f) => s + (f.total_iva || 0), 0);
      const ivaSopTr = comprasTr.reduce((s, f) => s + (f.total_iva || 0), 0);
      const liquidacionTr = ivaRepTr - ivaSopTr;
      const basesVentaTr = ventasTr.reduce((s, f) => s + (f.base_imponible || 0), 0);
      const basesCompraTr = comprasTr.reduce((s, f) => s + (f.base_imponible || 0), 0);

      // IVA año (del año seleccionado)
      const ventasAno = ventas.filter(f => f.fecha >= anoDesde && f.fecha < anoHasta);
      const comprasAno = compras.filter(f => f.fecha >= anoDesde && f.fecha < anoHasta);
      const ivaRepAno = ventasAno.reduce((s, f) => s + (f.total_iva || 0), 0);
      const ivaSopAno = comprasAno.reduce((s, f) => s + (f.total_iva || 0), 0);
      const liquidacionAno = ivaRepAno - ivaSopAno;

      // Resultado fiscal año (bases)
      const resultadoAno = ventasAno.reduce((s, f) => s + (f.base_imponible || 0), 0) -
                           comprasAno.reduce((s, f) => s + (f.base_imponible || 0), 0);

      // Número de facturas
      const nFactVenta = ventasTr.length;
      const nFactCompra = comprasTr.length;

      // Años disponibles para el selector (de las facturas que hay en BD)
      const aniosSet = new Set();
      ventas.forEach(f => { if (f.fecha) aniosSet.add(parseInt(f.fecha.slice(0,4))); });
      compras.forEach(f => { if (f.fecha) aniosSet.add(parseInt(f.fecha.slice(0,4))); });
      const hoyYear = new Date().getFullYear();
      aniosSet.add(hoyYear);
      const aniosDisp = Array.from(aniosSet).filter(y => y >= 2020 && y <= 2100).sort((a,b) => b - a);

      return { trimestreLabel, ivaRepTr, ivaSopTr, liquidacionTr, basesVentaTr, basesCompraTr,
               nFactVenta, nFactCompra,
               ivaRepAno, ivaSopAno, liquidacionAno, resultadoAno,
               year, trimestre, aniosDisp };
    },
    render(data, el) {
      const liqColor = data.liquidacionTr >= 0 ? '#EF4444' : '#10B981'; // positivo = a pagar, negativo = a devolver
      const liqLabel = data.liquidacionTr >= 0 ? 'A ingresar' : 'A compensar';
      const liqAnoColor = data.liquidacionAno >= 0 ? '#EF4444' : '#10B981';
      const resAnoColor = data.resultadoAno >= 0 ? '#10B981' : '#EF4444';

      // Botones de trimestre
      const tris = [0,1,2,3];
      const trisHtml = tris.map(t => {
        const sel = t === data.trimestre;
        return `<button onclick="_wgFiscalSetPeriodo(${data.year}, ${t})" style="font-size:11px;font-weight:700;padding:4px 10px;border:1.5px solid ${sel?'#3B82F6':'var(--gris-200)'};border-radius:6px;background:${sel?'#3B82F6':'#fff'};color:${sel?'#fff':'var(--gris-600)'};cursor:pointer">T${t+1}</button>`;
      }).join('');
      const aniosHtml = (data.aniosDisp || [data.year]).map(y =>
        `<option value="${y}" ${y===data.year?'selected':''}>${y}</option>`
      ).join('');

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px">
          <!-- Selector de periodo -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="font-size:10px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:0.05em;margin-right:auto">📅 ${data.trimestreLabel}</div>
            <select onchange="_wgFiscalSetPeriodo(this.value, ${data.trimestre})" style="font-size:11px;padding:3px 6px;border:1.5px solid var(--gris-200);border-radius:6px;outline:none;background:#fff;font-weight:600">${aniosHtml}</select>
            <div style="display:flex;gap:4px">${trisHtml}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="wg-card-accent" style="--card-accent:#3B82F6">
              <div class="wg-card-title">IVA Repercutido</div>
              <div class="wg-card-big" style="font-size:18px;color:#3B82F6">${fmtE(data.ivaRepTr)}</div>
              <div class="wg-card-dim">${data.nFactVenta} fact. emitidas · Base ${fmtE(data.basesVentaTr)}</div>
            </div>
            <div class="wg-card-accent" style="--card-accent:#EF4444">
              <div class="wg-card-title">IVA Soportado</div>
              <div class="wg-card-big" style="font-size:18px;color:#EF4444">${fmtE(data.ivaSopTr)}</div>
              <div class="wg-card-dim">${data.nFactCompra} fact. recibidas · Base ${fmtE(data.basesCompraTr)}</div>
            </div>
          </div>
          <!-- Liquidación trimestre -->
          <div class="wg-card-accent" style="--card-accent:${liqColor}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div class="wg-card-title">Liquidación IVA ${data.trimestreLabel}</div>
                <div class="wg-card-big" style="font-size:20px;color:${liqColor}">${fmtE(Math.abs(data.liquidacionTr))}</div>
              </div>
              <div style="padding:4px 10px;background:${liqColor}12;border-radius:6px;font-size:11px;font-weight:700;color:${liqColor}">${liqLabel}</div>
            </div>
          </div>
          <!-- Acumulado año -->
          <div style="background:var(--gris-50,#F9FAFB);border-radius:10px;padding:10px 12px">
            <div style="font-size:10px;font-weight:700;color:var(--gris-500);margin-bottom:6px">Acumulado ${new Date().getFullYear()}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              <div>
                <div style="font-size:9px;color:var(--gris-400)">IVA Rep.</div>
                <div style="font-size:13px;font-weight:800;color:#3B82F6">${fmtE(data.ivaRepAno)}</div>
              </div>
              <div>
                <div style="font-size:9px;color:var(--gris-400)">IVA Sop.</div>
                <div style="font-size:13px;font-weight:800;color:#EF4444">${fmtE(data.ivaSopAno)}</div>
              </div>
              <div>
                <div style="font-size:9px;color:var(--gris-400)">Resultado fiscal</div>
                <div style="font-size:13px;font-weight:800;color:${resAnoColor}">${fmtE(data.resultadoAno)}</div>
              </div>
            </div>
          </div>
        </div>`;
    }
  },

  // ═══════════════════════════════════════════
  //  WIDGETS COMUNICACIÓN
  // ═══════════════════════════════════════════

  // ── Correo: últimos correos recibidos ──
  {
    id: 'list_correo', label: 'Correo reciente', ico: '📧',
    cat: 'comunicacion', size: 'md',
    async fetch(eid) {
      const { data } = await sb.from('correos')
        .select('id,tipo,de,de_nombre,asunto,fecha,leido,tiene_adjuntos,carpeta')
        .eq('empresa_id', eid)
        .eq('tipo', 'recibido')
        .not('carpeta', 'eq', 'spam')
        .order('fecha', { ascending: false })
        .limit(10);
      const items = data || [];
      const sinLeer = items.filter(c => !c.leido).length;
      // Total sin leer (aprox.)
      const { count } = await sb.from('correos')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', eid).eq('tipo', 'recibido').eq('leido', false);
      const hoyStr = new Date().toISOString().split('T')[0];
      const recibidosHoy = items.filter(c => (c.fecha || '').startsWith(hoyStr)).length;
      return { items, sinLeer, totalSinLeer: count || sinLeer, recibidosHoy };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:6px">📭</div><div style="font-size:13px;font-weight:600;color:var(--gris-500)">Bandeja vacía</div></div>';
        return;
      }
      const hoy = new Date();
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:2px solid var(--gris-100);margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:8px">
          ${data.totalSinLeer > 0
            ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:10px;background:#3B82F6;color:#fff;font-size:11px;font-weight:800;padding:0 5px">${data.totalSinLeer}</span><span style="font-size:11px;color:var(--gris-500);font-weight:600">sin leer</span>`
            : '<span style="font-size:11px;color:#10B981;font-weight:600">✓ Todo leído</span>'}
        </div>
        <div style="font-size:10px;color:var(--gris-400)">${data.recibidosHoy} hoy</div>
      </div>`;
      html += data.items.slice(0, 7).map(c => {
        const mins = Math.floor((hoy - new Date(c.fecha)) / 60000);
        const tiempoTxt = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
        const bold = !c.leido ? 'font-weight:700' : 'font-weight:400;color:var(--gris-500)';
        return `
        <div class="wg-list-row" onclick="goPage('correo')">
          ${!c.leido ? '<div style="width:6px;height:6px;border-radius:50%;background:#3B82F6;flex-shrink:0"></div>' : '<div style="width:6px;flex-shrink:0"></div>'}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;${bold};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.de_nombre || c.de || '—'}</span>
              ${c.tiene_adjuntos ? '<span style="font-size:10px;flex-shrink:0">📎</span>' : ''}
            </div>
            <div style="font-size:11px;${!c.leido ? 'font-weight:600;color:var(--gris-700)' : 'color:var(--gris-400)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.asunto || '(sin asunto)'}</div>
          </div>
          <div style="font-size:9px;color:var(--gris-400);flex-shrink:0;white-space:nowrap">${tiempoTxt}</div>
        </div>`;
      }).join('');
      el.innerHTML = html;
    }
  },

  // ── Mensajería: chats con mensajes recientes ──
  {
    id: 'list_mensajeria', label: 'Mensajería', ico: '💬',
    cat: 'comunicacion', size: 'md',
    async fetch(eid) {
      const userId = CU?.id;
      if (!userId) return { convs: [], sinLeer: 0 };

      // Mis participaciones
      const { data: parts } = await sb.from('chat_participantes')
        .select('conversacion_id,ultimo_leido_at')
        .eq('usuario_id', userId);
      const convIds = (parts || []).map(p => p.conversacion_id);
      if (!convIds.length) return { convs: [], sinLeer: 0 };

      // Conversaciones
      const { data: convs } = await sb.from('chat_conversaciones')
        .select('id,nombre,tipo,ultimo_mensaje,ultimo_mensaje_at,ultimo_mensaje_autor')
        .in('id', convIds)
        .order('ultimo_mensaje_at', { ascending: false })
        .limit(8);

      // Calcular no leídos
      const leidoMap = {};
      (parts || []).forEach(p => { leidoMap[p.conversacion_id] = p.ultimo_leido_at; });
      let sinLeer = 0;
      (convs || []).forEach(c => {
        const ultimoLeido = leidoMap[c.id];
        if (c.ultimo_mensaje_at && (!ultimoLeido || c.ultimo_mensaje_at > ultimoLeido)) {
          c._sinLeer = true;
          sinLeer++;
        }
      });

      return { convs: convs || [], sinLeer };
    },
    render(data, el) {
      if (!data.convs.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:6px">💬</div><div style="font-size:13px;font-weight:600;color:var(--gris-500)">Sin conversaciones</div><div style="font-size:11px;color:var(--gris-400)">Inicia un chat desde Mensajería</div></div>';
        return;
      }
      const hoy = new Date();
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:2px solid var(--gris-100);margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:8px">
          ${data.sinLeer > 0
            ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:10px;background:#10B981;color:#fff;font-size:11px;font-weight:800;padding:0 5px">${data.sinLeer}</span><span style="font-size:11px;color:var(--gris-500);font-weight:600">chats con mensajes nuevos</span>`
            : '<span style="font-size:11px;color:var(--gris-400)">Todo al día</span>'}
        </div>
        <div style="font-size:10px;color:var(--gris-400)">${data.convs.length} chats</div>
      </div>`;
      html += data.convs.map(c => {
        const mins = c.ultimo_mensaje_at ? Math.floor((hoy - new Date(c.ultimo_mensaje_at)) / 60000) : 9999;
        const tiempoTxt = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
        const tipoIco = c.tipo === 'grupo' ? '👥' : '💬';
        const unread = c._sinLeer;
        const bold = unread ? 'font-weight:700' : 'font-weight:400;color:var(--gris-500)';
        // Nombre de conversación o autor del último mensaje
        const nombre = c.nombre || c.ultimo_mensaje_autor || 'Chat';
        // Truncar último mensaje
        const msg = (c.ultimo_mensaje || '').slice(0, 60) + ((c.ultimo_mensaje || '').length > 60 ? '…' : '');
        return `
        <div class="wg-list-row" onclick="goPage('mensajeria')">
          ${unread ? '<div style="width:6px;height:6px;border-radius:50%;background:#10B981;flex-shrink:0"></div>' : '<div style="width:6px;flex-shrink:0"></div>'}
          <span style="font-size:14px;flex-shrink:0">${tipoIco}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;${bold};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nombre}</div>
            <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${msg || '...'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:9px;color:var(--gris-400)">${tiempoTxt}</div>
            ${unread ? '<div style="width:8px;height:8px;border-radius:50%;background:#10B981;margin:3px 0 0 auto"></div>' : ''}
          </div>
        </div>`;
      }).join('');
      el.innerHTML = html;
    }
  },

  // ═══════════════════════════════════════════
  //  WIDGET AUTOMATIZACIONES (BANDEJA)
  // ═══════════════════════════════════════════

  // ── Lista: Tareas pendientes de la bandeja de automatizaciones ──
  {
    id: 'list_bandeja', label: 'Automatizaciones', ico: '⚡',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      // Pendientes
      const { data: pend, count: countPend } = await sb.from('bandeja_entrada')
        .select('id,titulo,tipo,estado,created_at,descripcion', { count: 'exact' })
        .eq('empresa_id', eid)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(6);
      // Errores
      const { count: countErr } = await sb.from('bandeja_entrada')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', eid)
        .eq('estado', 'error');
      // Completados hoy
      const hoyStr = new Date().toISOString().split('T')[0];
      const { count: countHoy } = await sb.from('bandeja_entrada')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', eid)
        .eq('estado', 'completado')
        .gte('created_at', hoyStr);
      return { items: pend || [], pendientes: countPend || 0, errores: countErr || 0, completadosHoy: countHoy || 0 };
    },
    render(el, data) {
      // Cabecera con badges
      const badges = [];
      if (data.pendientes > 0) badges.push(`<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#FEF3C7;color:#D97706">${data.pendientes} pendiente${data.pendientes > 1 ? 's' : ''}</span>`);
      if (data.errores > 0) badges.push(`<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#FEE2E2;color:#DC2626">${data.errores} error${data.errores > 1 ? 'es' : ''}</span>`);
      if (data.completadosHoy > 0) badges.push(`<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#D1FAE5;color:#059669">${data.completadosHoy} hoy ✓</span>`);

      const TIPO_ICO = {
        crear_albaran: '📦', crear_factura: '🧾', registrar_gasto: '💸',
        crear_pedido: '📋', registrar_proveedor: '🏢', personalizada: '⚙️'
      };

      let html = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${badges.join('')}</div>`;

      if (!data.items.length) {
        html += `<div style="text-align:center;padding:20px;color:var(--gris-400);font-size:12px">📥 Sin tareas pendientes</div>`;
      } else {
        html += data.items.map(b => {
          const ico = TIPO_ICO[b.tipo] || '⚡';
          const fecha = b.created_at ? new Date(b.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          return `<div class="wg-list-row" onclick="goPage('bandeja')" style="cursor:pointer">
            <span style="font-size:16px;flex-shrink:0">${ico}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.titulo}</div>
              <div style="font-size:10px;color:var(--gris-400)">${fecha}</div>
            </div>
          </div>`;
        }).join('');
      }

      // Link al final
      if (data.pendientes > data.items.length) {
        html += `<div onclick="goPage('bandeja')" style="text-align:center;font-size:11px;color:var(--azul);font-weight:600;cursor:pointer;padding:6px 0;margin-top:4px">Ver todas (${data.pendientes}) →</div>`;
      }
      el.innerHTML = html;
    }
  }

]; // fin WIDGET_CATALOG


/* ══════════════════════════════════════════════════════════════════════
   CONFIGURACIÓN POR DEFECTO SEGÚN ROL
   ══════════════════════════════════════════════════════════════════════ */

const DASH_DEFAULTS = {
  admin: [
    'panel_financiero', 'panel_tesoreria', 'panel_comercial',
    'list_correo', 'list_mensajeria',
    'list_tareas', 'list_obras',
    'list_facturas_pend', 'list_presup_pend', 'list_bandeja'
  ],
  gestoria: [
    'panel_financiero', 'panel_tesoreria', 'panel_fiscal',
    'list_facturas_pend', 'list_facturas_prov_pend'
  ],
  operario: [
    'panel_comercial', 'list_tareas', 'list_obras'
  ],
  oficina: [
    'panel_comercial',
    'list_correo', 'list_mensajeria',
    'list_tareas', 'list_obras',
    'list_presup_pend', 'list_bandeja'
  ],
};


/* ══════════════════════════════════════════════════════════════════════
   ESTADO INTERNO DEL DASHBOARD
   ══════════════════════════════════════════════════════════════════════ */

let _dashEditMode = false;
let _dashContainerId = null;

/** Mapa rápido id → widget definition */
const _wgMap = {};
WIDGET_CATALOG.forEach(w => { _wgMap[w.id] = w; });

/** Etiquetas de categoría para el panel de edición */
const _CAT_LABELS = {
  panel: '📊 Paneles',
  lista: '📋 Listas',
  grafico: '📈 Gráficos',
  comunicacion: '💬 Comunicación',
  alerta: '🔔 Alertas'
};


/* ══════════════════════════════════════════════════════════════════════
   RENDERIZADO DEL DASHBOARD
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Renderiza el dashboard de widgets en un contenedor.
 * Lee la configuración del usuario desde localStorage o usa la por defecto del rol.
 * @param {string} containerId — ID del elemento contenedor
 */
async function renderWidgetDashboard(containerId) {
  _dashContainerId = containerId;
  const container = document.getElementById(containerId);
  if (!container) { console.warn('[widgets] Contenedor no encontrado:', containerId); return; }

  // Leer config del usuario o usar defaults del rol
  const widgetIds = _loadDashConfig();

  // Limpiar contenedor
  container.innerHTML = '';

  // Inyectar estilos si no existen
  _injectWidgetStyles();

  // Si estamos en modo edición, construir panel de añadir
  if (_dashEditMode) {
    _buildAddPanel(container);
  }

  // Crear grid
  const grid = document.createElement('div');
  grid.className = 'wg-grid';
  grid.id = 'wg-grid';
  container.appendChild(grid);

  // Renderizar cada widget
  const promises = widgetIds.map(wid => _renderSingleWidget(wid, grid));
  await Promise.allSettled(promises);

  // Bind long-press para entrar en modo edición
  if (!_dashEditMode) {
    _bindLongPress(grid);
  } else {
    // Añadir clase wiggle a todos los widgets
    grid.querySelectorAll('.wg').forEach(w => w.classList.add('wg-wiggle'));
  }
}

/**
 * Renderiza un widget individual, incluyendo carga de datos y render.
 * @param {string} wid — ID del widget
 * @param {HTMLElement} grid — Contenedor grid
 */
/** Mapa de permisos requeridos por widget (widgets sensibles) */
const _WG_PERM_REQ = {
  panel_financiero:   {sec:'facturacion', sub:'facturas'},
  panel_tesoreria:    {sec:'tesoreria', sub:'ver'},
  panel_fiscal:       {sec:'facturacion', sub:'facturas'},
  list_facturas_pend: {sec:'facturacion', sub:'facturas'},
  list_facturas_prov_pend: {sec:'compras', sub:'facturas_prov'},
  list_bandeja:       {sec:'compras', sub:'bandeja'},
  chart_facturacion_6m: {sec:'facturacion', sub:'facturas'},
  chart_cobros_pagos: {sec:'facturacion', sub:'facturas'},
};

async function _renderSingleWidget(wid, grid) {
  const def = _wgMap[wid];
  if (!def) { console.warn('[widgets] Widget desconocido:', wid); return; }
  // Verificar permisos — no renderizar si el usuario no tiene acceso
  const req = _WG_PERM_REQ[wid];
  if (req && typeof canDo === 'function' && !canDo(req.sec, req.sub)) return;

  // Wrapper del widget
  const wrapper = document.createElement('div');
  wrapper.dataset.wid = wid;

  // Tamaño: custom override o el por defecto del widget
  const customSize = _getWidgetSize(wid) || def.size;
  wrapper.className = `wg wg-${customSize}`;

  // Cabecera
  const header = document.createElement('div');
  header.className = 'wg-head';
  const sizeLabel = { sm: '1col', md: '2col', lg: '4col' };
  header.innerHTML = `
    <span class="wg-ico">${def.ico}</span>
    <span class="wg-label">${def.label}</span>
    ${_dashEditMode ? `<button class="wg-resize" onclick="_cycleWidgetSize('${wid}')" title="Redimensionar: ${sizeLabel[customSize]}">${customSize === 'sm' ? '◻' : customSize === 'md' ? '◻◻' : '◻◻◻◻'}</button>` : ''}
    ${_dashEditMode ? `<button class="wg-rm" onclick="_removeWidget('${wid}')" title="Quitar widget">&times;</button>` : ''}
  `;
  // En modo edición, hacer draggable + handle
  if (_dashEditMode) {
    wrapper.draggable = true;
    wrapper.addEventListener('dragstart', _onDragStart);
    wrapper.addEventListener('dragend', _onDragEnd);
    wrapper.addEventListener('dragover', _onDragOver);
    wrapper.addEventListener('drop', _onDrop);
    wrapper.addEventListener('dragenter', _onDragEnter);
    wrapper.addEventListener('dragleave', _onDragLeave);

    const handle = document.createElement('span');
    handle.className = 'wg-drag';
    handle.textContent = '⠿';
    handle.title = 'Arrastrar para reordenar';
    header.insertBefore(handle, header.firstChild);
  }
  wrapper.appendChild(header);

  // Cuerpo (zona de render)
  const body = document.createElement('div');
  body.className = 'wg-body';
  body.innerHTML = '<div style="text-align:center;padding:12px;color:var(--gris-400);font-size:11px">Cargando…</div>';
  wrapper.appendChild(body);
  grid.appendChild(wrapper);

  // Fetch + render
  try {
    const eid = EMPRESA?.id;
    const data = await def.fetch(eid);
    body.innerHTML = '';
    def.render(data, body);
  } catch (err) {
    console.error(`[widgets] Error en ${wid}:`, err);
    body.innerHTML = `<div class="empty" style="padding:8px"><div class="ei">⚠️</div><p style="font-size:11px;color:var(--gris-400)">Error al cargar</p></div>`;
  }
}


/* ══════════════════════════════════════════════════════════════════════
   MODO EDICIÓN — Long-press para activar, panel de previsualización
   ══════════════════════════════════════════════════════════════════════ */

let _longPressTimer = null;
const _LONG_PRESS_MS = 800; // milisegundos para activar

/** Registra long-press en todos los widgets del grid */
function _bindLongPress(grid) {
  if (_dashEditMode) return; // ya estamos en edición, no re-bind

  const widgets = grid.querySelectorAll('.wg');
  widgets.forEach(w => {
    // Pointer events (funciona en touch y mouse)
    w.addEventListener('pointerdown', _onLongPressStart, { passive: true });
    w.addEventListener('pointerup', _onLongPressCancel);
    w.addEventListener('pointerleave', _onLongPressCancel);
    w.addEventListener('pointermove', _onLongPressMove);
  });
}

function _onLongPressStart(e) {
  if (_dashEditMode) return;
  _longPressTimer = setTimeout(() => {
    _longPressTimer = null;
    // Vibración háptica si disponible
    if (navigator.vibrate) navigator.vibrate(30);
    _enterEditMode();
  }, _LONG_PRESS_MS);
}

function _onLongPressCancel() {
  if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
}

function _onLongPressMove(e) {
  // Cancelar si mueve más de 10px (es scroll, no long-press)
  if (_longPressTimer && (e.movementX > 5 || e.movementY > 5)) {
    clearTimeout(_longPressTimer); _longPressTimer = null;
  }
}

/** Entra en modo edición (llamado por long-press) */
function _enterEditMode() {
  if (_dashEditMode) return;
  _dashEditMode = true;
  renderWidgetDashboard(_dashContainerId);
}

/**
 * Alterna el modo de edición del dashboard.
 */
function toggleDashEdit() {
  _dashEditMode = !_dashEditMode;
  renderWidgetDashboard(_dashContainerId);
}

/**
 * Construye el panel de previsualización de widgets con mini-cards.
 * Se inserta DENTRO del container pero ANTES del grid.
 */
function _buildAddPanel(container) {
  const panel = document.createElement('div');
  panel.id = 'wg-add-panel';
  panel.className = 'wg-add-panel';

  // Cabecera
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-weight:800;font-size:15px;color:var(--gris-700)">Personalizar dashboard</div>
        <div style="font-size:11px;color:var(--gris-400);margin-top:1px">Añade, quita, reordena o redimensiona widgets</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="_resetDashConfig()" title="Restaurar por defecto">↺ Resetear</button>
        <button class="btn btn-primary btn-sm" onclick="toggleDashEdit()">✓ Listo</button>
      </div>
    </div>
  `;

  // Filtrar widgets según permisos del usuario
  const currentIds = _loadDashConfig();
  const visibleWidgets = WIDGET_CATALOG.filter(w => {
    const req = _WG_PERM_REQ[w.id];
    if (!req) return true; // sin restricción
    return typeof canDo === 'function' ? canDo(req.sec, req.sub) : true;
  });

  // Agrupar widgets visibles por categoría
  const byCat = {};
  visibleWidgets.forEach(w => {
    if (!byCat[w.cat]) byCat[w.cat] = [];
    byCat[w.cat].push(w);
  });

  // Descripciones cortas para cada widget
  const _WG_DESC = {
    panel_financiero: 'Facturación, compras, resultado y acumulado anual con gráfico comparativo',
    panel_tesoreria: 'Cobros, pagos, saldo bancario, antigüedad deuda y posición neta',
    panel_comercial: 'Presupuestos, clientes, obras activas y tasa de conversión',
    list_facturas_pend: 'Facturas pendientes de cobro con días vencimiento y alertas',
    list_presup_pend: 'Presupuestos pendientes con estado y antigüedad',
    list_obras: 'Obras activas con estado y tiempo abierta',
    list_tareas: 'Tus tareas pendientes con prioridad y fechas',
    chart_facturacion_6m: 'Gráfico de barras con facturación mensual, totales y tendencia',
    chart_cobros_pagos: 'Comparativa visual ventas vs compras con margen acumulado',
    list_correo: 'Últimos correos recibidos con contador de no leídos',
    list_mensajeria: 'Conversaciones de chat recientes con mensajes nuevos',
    list_facturas_prov_pend: 'Facturas de proveedor pendientes con vencimiento y total',
    panel_fiscal: 'IVA repercutido/soportado trimestral, liquidación y acumulado anual',
    list_bandeja: 'Tareas automáticas pendientes con errores y completadas hoy',
  };

  const sizeLabels = { sm: '1 col', md: '2 col', lg: 'Ancho completo' };
  const sizeColors = { sm: '#9CA3AF', md: '#3B82F6', lg: '#8B5CF6' };

  Object.keys(byCat).forEach(cat => {
    const catDiv = document.createElement('div');
    catDiv.style.marginBottom = '14px';

    const catLabel = document.createElement('div');
    catLabel.style.cssText = 'font-size:12px;font-weight:700;color:var(--gris-500);margin-bottom:8px';
    catLabel.textContent = _CAT_LABELS[cat] || cat;
    catDiv.appendChild(catLabel);

    const catGrid = document.createElement('div');
    catGrid.className = 'wg-preview-grid';

    byCat[cat].forEach(w => {
      const isActive = currentIds.includes(w.id);
      const desc = _WG_DESC[w.id] || w.label;
      const card = document.createElement('div');
      card.className = 'wg-preview-card' + (isActive ? ' active' : '');
      card.dataset.wid = w.id;
      card.innerHTML = `
        <div class="wg-preview-top">
          <span class="wg-preview-ico">${w.ico}</span>
          <div class="wg-preview-info">
            <div class="wg-preview-name">${w.label}</div>
            <div class="wg-preview-desc">${desc}</div>
          </div>
          <div class="wg-preview-toggle">${isActive ? '✓' : '+'}</div>
        </div>
        <div class="wg-preview-meta">
          <span class="wg-preview-size" style="color:${sizeColors[w.size]}">${sizeLabels[w.size]}</span>
          <span class="wg-preview-cat">${_CAT_LABELS[w.cat]?.split(' ')[0] || ''}</span>
        </div>
      `;
      card.onclick = () => {
        _toggleWidgetFromChip(w.id, card);
        // Actualizar visual
        const nowActive = _loadDashConfig().includes(w.id);
        card.classList.toggle('active', nowActive);
        card.querySelector('.wg-preview-toggle').textContent = nowActive ? '✓' : '+';
      };
      catGrid.appendChild(card);
    });

    catDiv.appendChild(catGrid);
    panel.appendChild(catDiv);
  });

  container.insertBefore(panel, container.firstChild);
}

/** Toggle widget desde chip del panel: comprueba estado LIVE cada vez */
function _toggleWidgetFromChip(wid, chip) {
  const ids = _loadDashConfig();
  if (ids.includes(wid)) {
    // Quitar
    _removeWidget(wid);
    chip.classList.remove('active');
  } else {
    // Añadir
    _addWidget(wid);
    chip.classList.add('active');
  }
}

/** Resetear config al default del rol */
function _resetDashConfig() {
  try {
    localStorage.removeItem(`dash_widgets_${CU?.id}`);
    localStorage.removeItem(`dash_sizes_${CU?.id}`);
  } catch(e) {}
  renderWidgetDashboard(_dashContainerId);
}

/**
 * Añade un widget al dashboard actual y guarda.
 * @param {string} wid — ID del widget a añadir
 */
function _addWidget(wid) {
  const ids = _loadDashConfig();
  if (ids.includes(wid)) return;
  ids.push(wid);
  _saveDashConfig(ids);
  // Re-renderizar solo el nuevo widget
  const grid = document.getElementById('wg-grid');
  if (grid) _renderSingleWidget(wid, grid);
}

/**
 * Elimina un widget del dashboard actual y guarda.
 * @param {string} wid — ID del widget a quitar
 */
function _removeWidget(wid) {
  const ids = _loadDashConfig().filter(id => id !== wid);
  _saveDashConfig(ids);
  // Quitar del DOM
  const el = document.querySelector(`.wg[data-wid="${wid}"]`);
  if (el) el.remove();
}


/* ══════════════════════════════════════════════════════════════════════
   PERSISTENCIA — localStorage
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Lee la config de widgets del usuario desde localStorage.
 * Si no existe, devuelve la config por defecto según el rol.
 * @returns {string[]} Array de widget IDs
 */
function _loadDashConfig() {
  const key = `dash_widgets_${CU?.id}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filtrar IDs que ya no existen en el catálogo
        let valid = parsed.filter(id => _wgMap[id]);
        // Migración: quitar charts duplicados si ya tiene panel_financiero
        if (valid.includes('panel_financiero')) {
          const dup = ['chart_facturacion_6m', 'chart_cobros_pagos'];
          const before = valid.length;
          valid = valid.filter(id => !dup.includes(id));
          if (valid.length !== before) _saveDashConfig(valid); // auto-guardar migración
        }
        if (valid.length > 0) return valid;
      }
    }
  } catch (e) { /* ignorar */ }

  // Fallback: defaults por rol
  const rol = CP?.rol || 'oficina';
  return [...(DASH_DEFAULTS[rol] || DASH_DEFAULTS.oficina)];
}

/**
 * Guarda la config de widgets del usuario en localStorage.
 * @param {string[]} ids — Array de widget IDs en el orden deseado
 */
function _saveDashConfig(ids) {
  const key = `dash_widgets_${CU?.id}`;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch (e) {
    console.warn('[widgets] Error guardando config:', e);
  }
}


/* ══════════════════════════════════════════════════════════════════════
   REDIMENSIONAR WIDGETS
   ══════════════════════════════════════════════════════════════════════ */

/** Lee tamaños custom de localStorage */
function _loadWidgetSizes() {
  const key = `dash_sizes_${CU?.id}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return {};
}

/** Guarda tamaños custom en localStorage */
function _saveWidgetSizes(sizes) {
  const key = `dash_sizes_${CU?.id}`;
  try { localStorage.setItem(key, JSON.stringify(sizes)); } catch(e) {}
}

/** Obtiene el tamaño custom de un widget (o null si usa el default) */
function _getWidgetSize(wid) {
  return _loadWidgetSizes()[wid] || null;
}

/** Cicla el tamaño de un widget: sm → md → lg → sm */
function _cycleWidgetSize(wid) {
  const def = _wgMap[wid];
  if (!def) return;
  const currentSize = _getWidgetSize(wid) || def.size;
  const cycle = ['sm', 'md', 'lg'];
  const idx = cycle.indexOf(currentSize);
  const newSize = cycle[(idx + 1) % cycle.length];

  // Guardar
  const sizes = _loadWidgetSizes();
  if (newSize === def.size) {
    delete sizes[wid]; // volver al default = no guardar
  } else {
    sizes[wid] = newSize;
  }
  _saveWidgetSizes(sizes);

  // Actualizar DOM directamente
  const el = document.querySelector(`.wg[data-wid="${wid}"]`);
  if (el) {
    el.classList.remove('wg-sm', 'wg-md', 'wg-lg');
    el.classList.add(`wg-${newSize}`);
    // Actualizar botón de resize
    const btn = el.querySelector('.wg-resize');
    if (btn) {
      const sizeLabel = { sm: '1col', md: '2col', lg: '4col' };
      btn.title = 'Redimensionar: ' + sizeLabel[newSize];
      btn.textContent = newSize === 'sm' ? '◻' : newSize === 'md' ? '◻◻' : '◻◻◻◻';
    }
  }
}


/* ══════════════════════════════════════════════════════════════════════
   DRAG & DROP — Reordenar widgets arrastrando
   ══════════════════════════════════════════════════════════════════════ */

let _draggedWid = null; // widget ID que se está arrastrando

function _onDragStart(e) {
  _draggedWid = this.dataset.wid;
  this.classList.add('wg-dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Necesario para Firefox
  e.dataTransfer.setData('text/plain', _draggedWid);
}

function _onDragEnd(e) {
  this.classList.remove('wg-dragging');
  // Limpiar indicadores de todos los widgets
  document.querySelectorAll('.wg-drop-before,.wg-drop-after').forEach(el => {
    el.classList.remove('wg-drop-before', 'wg-drop-after');
  });
  _draggedWid = null;
}

function _onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function _onDragEnter(e) {
  e.preventDefault();
  const target = this;
  if (target.dataset.wid === _draggedWid) return;
  // Mostrar indicador visual de dónde se insertará
  const rect = target.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const midX = rect.left + rect.width / 2;
  // Decidir si antes o después según posición del cursor
  const after = (e.clientY > midY) || (e.clientY === midY && e.clientX > midX);
  target.classList.toggle('wg-drop-before', !after);
  target.classList.toggle('wg-drop-after', after);
}

function _onDragLeave(e) {
  this.classList.remove('wg-drop-before', 'wg-drop-after');
}

function _onDrop(e) {
  e.preventDefault();
  const targetWid = this.dataset.wid;
  if (!_draggedWid || targetWid === _draggedWid) return;

  // Determinar posición de inserción
  const rect = this.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const midX = rect.left + rect.width / 2;
  const after = (e.clientY > midY) || (e.clientY === midY && e.clientX > midX);

  // Actualizar orden en config
  const ids = _loadDashConfig();
  const fromIdx = ids.indexOf(_draggedWid);
  const toIdx = ids.indexOf(targetWid);
  if (fromIdx === -1 || toIdx === -1) return;

  // Quitar el arrastrado
  ids.splice(fromIdx, 1);
  // Recalcular toIdx después del splice
  const newToIdx = ids.indexOf(targetWid);
  // Insertar antes o después del target
  ids.splice(after ? newToIdx + 1 : newToIdx, 0, _draggedWid);
  _saveDashConfig(ids);

  // Mover el elemento DOM directamente (sin re-render)
  const grid = document.getElementById('wg-grid');
  const draggedEl = grid.querySelector(`.wg[data-wid="${_draggedWid}"]`);
  const targetEl = this;

  this.classList.remove('wg-drop-before', 'wg-drop-after');

  if (after) {
    targetEl.after(draggedEl);
  } else {
    targetEl.before(draggedEl);
  }
}


/* ══════════════════════════════════════════════════════════════════════
   ESTILOS INYECTADOS — Se añaden al <head> una sola vez
   ══════════════════════════════════════════════════════════════════════ */

function _injectWidgetStyles() {
  if (document.getElementById('wg-styles')) return;

  const style = document.createElement('style');
  style.id = 'wg-styles';
  style.textContent = `
    /* ── Grid principal — 4 columnas ── */
    .wg-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      padding: 4px 0;
    }

    /* ── Widget base ── */
    .wg { background: #fff; border-radius: 14px; border:1px solid rgba(0,0,0,.05); box-shadow: 0 1px 3px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.03); overflow: hidden; transition: box-shadow .2s, transform .2s; display:flex; flex-direction:column; }
    .wg:hover { box-shadow: 0 2px 6px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06); }
    .wg-sm { grid-column: span 1; }
    .wg-md { grid-column: span 2; }
    .wg-lg { grid-column: span 4; }

    /* ── Cabecera ── */
    .wg-head {
      display: flex; align-items: center; gap: 7px;
      padding: 12px 16px 0; font-size: 11px; color: var(--gris-400);
    }
    .wg-ico { font-size: 15px; }
    .wg-label { font-weight: 700; flex: 1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:0.01em; }

    /* ── Cuerpo ── */
    .wg-body { padding: 10px 16px 14px; flex:1; display:flex; flex-direction:column; }

    /* ── KPI layout (para widgets individuales si se mantienen) ── */
    .wg-kpi-row { display:flex; align-items:flex-end; gap:10px; }
    .wg-kpi-num { font-size:22px; font-weight:800; line-height:1.1; white-space:nowrap; }
    .wg-kpi-sub { font-size:10px; color:var(--gris-400); margin-top:2px; }
    .wg-kpi-spark { flex:1; min-width:0; }

    /* ── Card con acento lateral — usado en paneles compuestos ── */
    .wg-card-accent {
      padding: 12px 14px; border-radius: 12px;
      background: #fff;
      border-left: 3.5px solid var(--card-accent, #3B82F6);
      position: relative;
      box-shadow: 0 1px 4px rgba(0,0,0,.05);
    }
    .wg-card-ico { font-size:15px; margin-bottom:3px; }
    .wg-card-big { font-size:22px; font-weight:800; line-height:1.15; letter-spacing:-0.5px; }
    .wg-card-title { font-size:11px; font-weight:600; color:var(--gris-500); margin-top:1px; }
    .wg-card-row { display:flex; align-items:center; gap:6px; margin-top:3px; }
    .wg-card-dim { font-size:10px; color:var(--gris-400); margin-top:2px; line-height:1.3; }

    /* ── Fila de lista enriquecida ── */
    .wg-list-row {
      display:flex; align-items:center; gap:8px; padding:7px 6px;
      border-bottom:1px solid var(--gris-100,#F3F4F6); cursor:pointer;
      border-radius:8px; transition:background .12s;
    }
    .wg-list-row:hover { background:var(--gris-50,#F9FAFB); }
    .wg-list-row:last-child { border-bottom:none; }

    /* ── Barra de progreso ── */
    .wg-bar-track { height:6px; background:#E5E7EB; border-radius:3px; margin-top:4px; overflow:hidden; }
    .wg-bar-fill { height:100%; border-radius:3px; transition:width .5s ease; }

    /* ── Sparkline mini ── */
    .wg-spark-sm { display:block; width:100%; height:24px; margin-top:6px; }

    /* ── Botones modo edición ── */
    .wg-rm { background:none; border:none; cursor:pointer; font-size:16px; color:var(--gris-400); line-height:1; padding:0 2px; transition:color .15s; }
    .wg-rm:hover { color:var(--rojo); }
    .wg-resize { background:none; border:1px solid var(--gris-200,#E5E7EB); cursor:pointer; font-size:9px; color:var(--gris-400); line-height:1; padding:1px 4px; border-radius:3px; transition:all .15s; letter-spacing:-1px; }
    .wg-resize:hover { border-color:var(--azul); color:var(--azul); }
    .wg-drag { cursor:grab; font-size:12px; color:var(--gris-300); user-select:none; padding:0 2px; }
    .wg-drag:active { cursor:grabbing; }

    /* ── Drag & drop ── */
    .wg-dragging { opacity:.4; transform:scale(.97); }
    .wg-drop-before { box-shadow:-3px 0 0 0 var(--azul,#3B82F6),0 1px 3px rgba(0,0,0,.06) !important; }
    .wg-drop-after { box-shadow:3px 0 0 0 var(--azul,#3B82F6),0 1px 3px rgba(0,0,0,.06) !important; }

    /* ── Panel añadir ── */
    .wg-add-panel { background:var(--gris-50,#F9FAFB); border:2px dashed var(--gris-200,#E5E7EB); border-radius:12px; padding:16px; margin-bottom:14px; }

    /* ── Preview cards para catálogo de widgets ── */
    .wg-preview-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
    .wg-preview-card {
      background:#fff; border:1.5px solid var(--gris-200,#E5E7EB); border-radius:10px;
      padding:10px 12px; cursor:pointer; transition:all .15s; user-select:none;
    }
    .wg-preview-card:hover { border-color:var(--azul,#3B82F6); box-shadow:0 2px 8px rgba(59,130,246,.1); }
    .wg-preview-card.active {
      border-color:var(--azul,#3B82F6); background:rgba(59,130,246,.04);
    }
    .wg-preview-top { display:flex; align-items:flex-start; gap:8px; }
    .wg-preview-ico { font-size:22px; flex-shrink:0; line-height:1; }
    .wg-preview-info { flex:1; min-width:0; }
    .wg-preview-name { font-size:12px; font-weight:700; color:var(--gris-700,#374151); line-height:1.2; }
    .wg-preview-desc { font-size:10px; color:var(--gris-400,#9CA3AF); margin-top:2px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .wg-preview-toggle {
      flex-shrink:0; width:24px; height:24px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:14px; font-weight:800; transition:all .15s;
      background:var(--gris-100,#F3F4F6); color:var(--gris-400);
    }
    .wg-preview-card.active .wg-preview-toggle { background:var(--azul,#3B82F6); color:#fff; }
    .wg-preview-meta { display:flex; gap:8px; margin-top:6px; }
    .wg-preview-size { font-size:9px; font-weight:700; }
    .wg-preview-cat { font-size:9px; color:var(--gris-400); }

    /* ── Wiggle animation (modo edición tipo iOS) ── */
    @keyframes wg-wiggle {
      0%,100% { transform:rotate(0deg); }
      25% { transform:rotate(-0.5deg); }
      75% { transform:rotate(0.5deg); }
    }
    .wg-wiggle { animation: wg-wiggle .3s ease-in-out infinite; }
    .wg-wiggle:hover { animation-play-state:paused; }

    /* ── Legacy chip (unused but safe) ── */
    .wg-add-chip { display:none; }

    /* ── Sparkline: full width ── */
    .wg-spark { display:block; width:100%; height:28px; }

    /* ── Chart: responsive ── */
    .wg-chart { display:block; width:100%; }

    /* ── Responsive ── */
    @media (max-width:1100px) {
      .wg-grid { grid-template-columns:repeat(2,1fr); }
      .wg-lg { grid-column:span 2; }
      .wg-panel-4 { grid-template-columns:repeat(2,1fr); }
    }
    @media (max-width:768px) {
      .wg-grid { grid-template-columns:repeat(2,1fr); }
      .wg-lg { grid-column:span 2; }
      .wg-panel-4 { grid-template-columns:repeat(2,1fr); }
      .wg-panel-3 { grid-template-columns:repeat(1,1fr); }
    }
    @media (max-width:500px) {
      .wg-grid { grid-template-columns:1fr; }
      .wg-sm,.wg-md,.wg-lg { grid-column:span 1; }
      .wg-panel-4,.wg-panel-3,.wg-panel-2x2 { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}
