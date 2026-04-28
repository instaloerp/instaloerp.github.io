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

  const padL = 10, padR = 10, padT = 14, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Máximo global
  let maxVal = 0;
  datasets.forEach(ds => ds.values.forEach(v => { if (Math.abs(v) > maxVal) maxVal = Math.abs(v); }));
  maxVal = maxVal || 1;

  const nGroups = labels.length;
  const nBars = datasets.length;
  const groupW = chartW / nGroups;
  const barGap = 3;
  const barW = Math.max(8, (groupW - barGap * (nBars + 1)) / nBars);

  // Líneas de referencia horizontales
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * chartH;
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
      const x = padL + gi * groupW + barGap + di * (barW + barGap);
      const y = padT + chartH - barH;

      // Barra con bordes redondeados superiores
      ctx.fillStyle = resolvedColor;
      ctx.beginPath();
      const r = Math.min(3, barW / 2);
      ctx.moveTo(x, y + r);
      ctx.arcTo(x, y, x + barW, y, r);
      ctx.arcTo(x + barW, y, x + barW, y + barH, r);
      ctx.lineTo(x + barW, padT + chartH);
      ctx.lineTo(x, padT + chartH);
      ctx.closePath();
      ctx.fill();

      // Valor encima de la barra (solo si cabe)
      if (barH > 14) {
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(_shortNum(val), x + barW / 2, y + 10);
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

  // Leyenda (si hay más de 1 dataset)
  if (datasets.length > 1) {
    let lx = padL;
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    datasets.forEach(ds => {
      const rc = _resolveColor(canvas, ds.color);
      ctx.fillStyle = rc;
      ctx.fillRect(lx, 2, 8, 8);
      ctx.fillStyle = '#6B7280';
      ctx.fillText(ds.label, lx + 11, 9);
      lx += ctx.measureText(ds.label).width + 24;
    });
  }
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
      const [rV, rC] = await Promise.all([
        sb.from('facturas').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('facturas_proveedor').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
      ]);
      const ventas = _wgFactActivas(rV.data);
      const compras = (rC.data || []).filter(f => f.estado !== 'anulada');

      const factMes = ventas.filter(f => f.fecha >= _wgInicioMes()).reduce((s, f) => s + (f.base_imponible || 0), 0);
      const factAno = ventas.filter(f => f.fecha >= _wgInicioAno()).reduce((s, f) => s + (f.base_imponible || 0), 0);
      const compraMes = compras.filter(f => f.fecha >= _wgInicioMes()).reduce((s, f) => s + (f.base_imponible || 0), 0);
      const resultado = factMes - compraMes;

      const sparkVentas = meses.map(m => ventas.filter(f => f.fecha >= m.desde && f.fecha < m.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));
      const sparkCompras = meses.map(m => compras.filter(f => f.fecha >= m.desde && f.fecha < m.hasta).reduce((s, f) => s + (f.base_imponible || 0), 0));
      const sparkResultado = meses.map((m, i) => sparkVentas[i] - sparkCompras[i]);

      // Variación vs mes anterior
      const factMesAnt = sparkVentas.length >= 2 ? sparkVentas[sparkVentas.length - 2] : 0;
      const variacion = factMesAnt > 0 ? ((factMes - factMesAnt) / factMesAnt * 100) : 0;

      return { factMes, factAno, compraMes, resultado, sparkVentas, sparkCompras, sparkResultado, variacion };
    },
    render(data, el) {
      const resColor = data.resultado >= 0 ? 'var(--verde)' : 'var(--rojo)';
      const varIcon = data.variacion >= 0 ? '↑' : '↓';
      const varColor = data.variacion >= 0 ? 'var(--verde)' : 'var(--rojo)';
      el.innerHTML = `
        <div class="wg-panel-grid wg-panel-4">
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--azul)">${fmtE(data.factMes)}</div>
            <div class="wg-panel-label">Facturado mes</div>
            <div class="wg-panel-extra" style="color:${varColor}">${varIcon} ${Math.abs(data.variacion).toFixed(0)}% vs anterior</div>
            <canvas class="wg-spark-sm" data-spark='${JSON.stringify(data.sparkVentas)}' data-color="var(--azul)"></canvas>
          </div>
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--rojo)">${fmtE(data.compraMes)}</div>
            <div class="wg-panel-label">Compras mes</div>
            <div class="wg-panel-extra">${((data.compraMes / (data.factMes || 1)) * 100).toFixed(0)}% de ventas</div>
            <canvas class="wg-spark-sm" data-spark='${JSON.stringify(data.sparkCompras)}' data-color="var(--rojo)"></canvas>
          </div>
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:${resColor}">${fmtE(data.resultado)}</div>
            <div class="wg-panel-label">Resultado mes</div>
            <div class="wg-panel-extra">Margen ${data.factMes > 0 ? ((data.resultado / data.factMes) * 100).toFixed(0) : 0}%</div>
            <canvas class="wg-spark-sm" data-spark='${JSON.stringify(data.sparkResultado)}' data-color="${resColor}"></canvas>
          </div>
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--verde)">${fmtE(data.factAno)}</div>
            <div class="wg-panel-label">Acumulado ${new Date().getFullYear()}</div>
            <div class="wg-panel-extra">Media ${fmtE(data.factAno / (new Date().getMonth() + 1))}/mes</div>
            <canvas class="wg-spark-sm" data-spark='${JSON.stringify(data.sparkVentas)}' data-color="var(--verde)"></canvas>
          </div>
        </div>`;
      // Dibujar sparklines
      requestAnimationFrame(() => {
        el.querySelectorAll('.wg-spark-sm').forEach(c => {
          const vals = JSON.parse(c.dataset.spark || '[]');
          c.width = c.parentElement.offsetWidth || 100;
          c.height = 24;
          if (vals.length >= 2) _drawSparkline(c, vals, c.dataset.color);
        });
      });
    }
  },

  // ── Panel: Tesorería (Pendiente cobro + pago + saldo bancario) ──
  {
    id: 'panel_tesoreria', label: 'Tesorería', ico: '🏦',
    cat: 'panel', size: 'md',
    async fetch(eid) {
      const meses = _wgUltMeses(6);
      const [rFact, rProv, rBanco] = await Promise.all([
        sb.from('facturas').select('fecha,base_imponible,estado,fecha_vencimiento').eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('facturas_proveedor').select('fecha,base_imponible,estado').eq('empresa_id', eid).neq('estado', 'eliminado'),
        sb.from('cuentas_bancarias').select('saldo_actual,nombre').eq('empresa_id', eid).eq('activa', true),
      ]);
      const pendCobro = (rFact.data || []).filter(f => f.estado === 'pendiente' || f.estado === 'vencida');
      const vencidas = pendCobro.filter(f => f.estado === 'vencida');
      const totalCobro = pendCobro.reduce((s, f) => s + (f.base_imponible || 0), 0);
      const totalVencido = vencidas.reduce((s, f) => s + (f.base_imponible || 0), 0);

      const pendPago = (rProv.data || []).filter(f => f.estado === 'pendiente');
      const totalPago = pendPago.reduce((s, f) => s + (f.base_imponible || 0), 0);

      const saldo = (rBanco.data || []).reduce((s, c) => s + (c.saldo_actual || 0), 0);
      const nCuentas = (rBanco.data || []).length;

      // Posición neta = saldo + por cobrar - por pagar
      const posicionNeta = saldo + totalCobro - totalPago;

      return { totalCobro, countCobro: pendCobro.length, totalVencido, countVencido: vencidas.length,
               totalPago, countPago: pendPago.length, saldo, nCuentas, posicionNeta };
    },
    render(data, el) {
      const posColor = data.posicionNeta >= 0 ? 'var(--verde)' : 'var(--rojo)';
      el.innerHTML = `
        <div class="wg-panel-grid wg-panel-2x2">
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--acento)">${fmtE(data.totalCobro)}</div>
            <div class="wg-panel-label">Por cobrar · ${data.countCobro} fact.</div>
            ${data.totalVencido > 0 ? `<div class="wg-panel-extra" style="color:var(--rojo)">⚠ ${fmtE(data.totalVencido)} vencido (${data.countVencido})</div>` : '<div class="wg-panel-extra" style="color:var(--verde)">Sin vencidos</div>'}
          </div>
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--rojo)">${fmtE(data.totalPago)}</div>
            <div class="wg-panel-label">Por pagar · ${data.countPago} fact.</div>
            <div class="wg-panel-extra">A proveedores</div>
          </div>
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:${data.saldo >= 0 ? 'var(--verde)' : 'var(--rojo)'}">${fmtE(data.saldo)}</div>
            <div class="wg-panel-label">Saldo bancario</div>
            <div class="wg-panel-extra">${data.nCuentas} cuenta${data.nCuentas !== 1 ? 's' : ''} activa${data.nCuentas !== 1 ? 's' : ''}</div>
          </div>
          <div class="wg-panel-cell" style="background:${data.posicionNeta >= 0 ? 'rgba(16,185,129,.06)' : 'rgba(239,68,68,.06)'};border-radius:8px">
            <div class="wg-panel-val" style="color:${posColor}">${fmtE(data.posicionNeta)}</div>
            <div class="wg-panel-label">Posición neta</div>
            <div class="wg-panel-extra">Saldo + cobros − pagos</div>
          </div>
        </div>`;
    }
  },

  // ── Panel: Actividad Comercial (Presupuestos + Clientes + Obras) ──
  {
    id: 'panel_comercial', label: 'Actividad comercial', ico: '📋',
    cat: 'panel', size: 'md',
    async fetch(eid) {
      const meses = _wgUltMeses(6);
      const { data: presups } = await sb.from('presupuestos')
        .select('fecha,estado,total,created_at')
        .eq('empresa_id', eid).neq('estado', 'eliminado');

      const pend = (presups || []).filter(p => p.estado === 'pendiente' || p.estado === 'enviado');
      const aceptados = (presups || []).filter(p => p.estado === 'aceptado');
      const totalPend = pend.reduce((s, p) => s + (p.total || 0), 0);

      // Tasa de conversión
      const totalPresups = (presups || []).length;
      const tasaConversion = totalPresups > 0 ? ((aceptados.length / totalPresups) * 100) : 0;

      const totalClientes = (typeof clientes !== 'undefined' ? clientes : []).length;
      const clientesNuevosMes = (typeof clientes !== 'undefined' ? clientes : []).filter(c => {
        const f = (c.created_at || '').split('T')[0];
        return f >= _wgInicioMes();
      }).length;

      const obrasActivas = (typeof trabajos !== 'undefined' ? trabajos : [])
        .filter(t => t.estado === 'en_curso' || t.estado === 'planificado' || t.estado === 'pendiente');

      return { pendCount: pend.length, totalPend, tasaConversion: tasaConversion.toFixed(0),
               totalClientes, clientesNuevosMes, obrasActivas: obrasActivas.length };
    },
    render(data, el) {
      el.innerHTML = `
        <div class="wg-panel-grid wg-panel-3">
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--violeta)">${data.pendCount}</div>
            <div class="wg-panel-label">Presupuestos pend.</div>
            <div class="wg-panel-extra">${fmtE(data.totalPend)} en cartera</div>
            <div class="wg-panel-extra">Conversión: ${data.tasaConversion}%</div>
          </div>
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--azul)">${data.totalClientes}</div>
            <div class="wg-panel-label">Clientes</div>
            <div class="wg-panel-extra">+${data.clientesNuevosMes} este mes</div>
          </div>
          <div class="wg-panel-cell">
            <div class="wg-panel-val" style="color:var(--azul)">${data.obrasActivas}</div>
            <div class="wg-panel-label">Obras activas</div>
            <div class="wg-panel-extra">En curso / planificadas</div>
          </div>
        </div>`;
    }
  },

  // ═══════════════════════════════════════════
  //  WIDGETS TIPO LISTA (size: md)
  // ═══════════════════════════════════════════

  // ── Lista: Facturas pendientes cobro ──
  {
    id: 'list_facturas_pend', label: 'Facturas pend. cobro', ico: '🧾',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const { data } = await sb.from('facturas')
        .select('id,numero,cliente_nombre,base_imponible,estado,fecha_vencimiento')
        .eq('empresa_id', eid)
        .in('estado', ['pendiente', 'vencida'])
        .order('fecha_vencimiento', { ascending: true })
        .limit(6);
      return { items: data || [] };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div class="empty"><div class="ei">✅</div><p>Todo cobrado</p></div>';
        return;
      }
      el.innerHTML = data.items.map(f => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gris-100);font-size:12px;cursor:pointer" onclick="goPage('facturas')">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700">${f.numero || '—'}</div>
            <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.cliente_nombre || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:8px">
            <div style="font-weight:800;font-size:12px">${fmtE(f.base_imponible)}</div>
            ${f.estado === 'vencida'
              ? '<span class="badge bg-red" style="font-size:9px">Vencida</span>'
              : '<span class="badge bg-yellow" style="font-size:9px">Pendiente</span>'}
          </div>
        </div>`).join('');
    }
  },

  // ── Lista: Presupuestos pendientes ──
  {
    id: 'list_presup_pend', label: 'Presupuestos pend.', ico: '📋',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const { data } = await sb.from('presupuestos')
        .select('id,numero,cliente_nombre,total,estado')
        .eq('empresa_id', eid)
        .in('estado', ['pendiente', 'borrador'])
        .order('created_at', { ascending: false })
        .limit(6);
      return { items: data || [] };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div class="empty"><div class="ei">📋</div><p>Sin presupuestos pendientes</p></div>';
        return;
      }
      el.innerHTML = data.items.map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gris-100);font-size:12px;cursor:pointer" onclick="goPage('presupuestos')">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700">${p.numero || '—'}</div>
            <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.cliente_nombre || '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:8px">
            <div style="font-weight:800;font-size:12px">${fmtE(p.total)}</div>
            ${p.estado === 'borrador'
              ? '<span class="badge bg-gray" style="font-size:9px">Borrador</span>'
              : '<span class="badge bg-yellow" style="font-size:9px">Pendiente</span>'}
          </div>
        </div>`).join('');
    }
  },

  // ── Lista: Obras activas ──
  {
    id: 'list_obras', label: 'Obras activas', ico: '🏗️',
    cat: 'lista', size: 'md',
    async fetch(_eid) {
      const activas = (typeof trabajos !== 'undefined' ? trabajos : [])
        .filter(t => t.estado !== 'finalizado' && t.estado !== 'cancelado')
        .slice(0, 6);
      return { items: activas };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div class="empty"><div class="ei">🏗️</div><p>Sin obras activas</p></div>';
        return;
      }
      el.innerHTML = data.items.map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gris-100);font-size:12px;cursor:pointer" onclick="goPage('trabajos')">
          <span style="font-size:14px">${typeof catIco === 'function' ? catIco(t.categoria) : '🔧'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.titulo || '—'}</div>
            <div style="font-size:11px;color:var(--gris-400)">${t.cliente_nombre || '—'}</div>
          </div>
          ${typeof estadoBadge === 'function' ? estadoBadge(t.estado) : `<span class="badge" style="font-size:9px">${t.estado}</span>`}
        </div>`).join('');
    }
  },

  // ── Lista: Mis tareas ──
  {
    id: 'list_tareas', label: 'Mis tareas', ico: '✅',
    cat: 'lista', size: 'md',
    async fetch(eid) {
      const userId = CU?.id;
      if (!userId) return { items: [] };
      const { data } = await sb.from('tareas_obra')
        .select('id,texto,estado,prioridad,fecha_limite,trabajo_id')
        .eq('empresa_id', eid)
        .eq('responsable_id', userId)
        .neq('estado', 'completada')
        .neq('estado', 'rechazada')
        .order('created_at', { ascending: false })
        .limit(8);
      return { items: data || [] };
    },
    render(data, el) {
      if (!data.items.length) {
        el.innerHTML = '<div class="empty"><div class="ei">✅</div><p>Sin tareas pendientes</p></div>';
        return;
      }
      const prioIco = { Urgente: '🔴', Alta: '🟠', Normal: '⚪', Baja: '🔵' };
      el.innerHTML = data.items.map(t => {
        const vencida = t.fecha_limite && new Date(t.fecha_limite) < new Date();
        return `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--gris-100);font-size:12px">
          <span style="font-size:10px">${prioIco[t.prioridad] || '⚪'}</span>
          <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${t.texto}</div>
          ${t.fecha_limite ? `<span style="font-size:10px;color:${vencida ? 'var(--rojo)' : 'var(--gris-400)'}">${t.fecha_limite}</span>` : ''}
          <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${t.estado === 'en_progreso' ? '#DBEAFE' : 'var(--gris-50)'};color:${t.estado === 'en_progreso' ? 'var(--azul)' : 'var(--gris-500)'};font-weight:700;white-space:nowrap">${(t.estado || 'pendiente').replace('_', ' ')}</span>
        </div>`;
      }).join('');
    }
  },

  // ═══════════════════════════════════════════
  //  WIDGETS TIPO GRÁFICO (size: md)
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
      return { labels: meses.map(m => m.label), values };
    },
    render(data, el) {
      el.innerHTML = '<canvas class="wg-chart" height="160"></canvas>';
      requestAnimationFrame(() => {
        const c = el.querySelector('.wg-chart');
        c.width = c.parentElement.offsetWidth || 280;
        _drawBarChart(c, data.labels, [
          { label: 'Facturación', color: 'var(--azul)', values: data.values }
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

      return { labels: meses.map(m => m.label), ventas: vValues, compras: cValues };
    },
    render(data, el) {
      el.innerHTML = '<canvas class="wg-chart" height="160"></canvas>';
      requestAnimationFrame(() => {
        const c = el.querySelector('.wg-chart');
        c.width = c.parentElement.offsetWidth || 280;
        _drawBarChart(c, data.labels, [
          { label: 'Ventas', color: 'var(--azul)', values: data.ventas },
          { label: 'Compras', color: 'var(--rojo)', values: data.compras }
        ]);
      });
    }
  }

]; // fin WIDGET_CATALOG


/* ══════════════════════════════════════════════════════════════════════
   CONFIGURACIÓN POR DEFECTO SEGÚN ROL
   ══════════════════════════════════════════════════════════════════════ */

const DASH_DEFAULTS = {
  admin: [
    'panel_financiero', 'panel_tesoreria', 'panel_comercial',
    'list_tareas', 'list_obras', 'list_facturas_pend', 'list_presup_pend',
    'chart_facturacion_6m', 'chart_cobros_pagos'
  ],
  gestoria: [
    'panel_financiero', 'panel_tesoreria',
    'list_facturas_pend', 'chart_facturacion_6m', 'chart_cobros_pagos'
  ],
  operario: [
    'panel_comercial', 'list_tareas', 'list_obras'
  ],
  oficina: [
    'panel_financiero', 'panel_tesoreria', 'panel_comercial',
    'list_tareas', 'list_facturas_pend', 'list_presup_pend', 'list_obras'
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
}

/**
 * Renderiza un widget individual, incluyendo carga de datos y render.
 * @param {string} wid — ID del widget
 * @param {HTMLElement} grid — Contenedor grid
 */
async function _renderSingleWidget(wid, grid) {
  const def = _wgMap[wid];
  if (!def) { console.warn('[widgets] Widget desconocido:', wid); return; }

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
   MODO EDICIÓN
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Alterna el modo de edición del dashboard.
 * Muestra/oculta panel de añadir widgets y botones de eliminar.
 */
function toggleDashEdit() {
  _dashEditMode = !_dashEditMode;

  // Cambiar texto del botón
  const btn = document.getElementById('btnDashEdit');
  if (btn) btn.textContent = _dashEditMode ? '✓ Listo' : '⚙️ Personalizar';

  // Re-renderizar todo el dashboard (con o sin controles de edición)
  renderWidgetDashboard(_dashContainerId);
}

/**
 * Construye el panel de añadir widgets (solo en modo edición).
 * Se inserta DENTRO del grid container pero ANTES del grid.
 */
function _buildAddPanel(container) {
  const panel = document.createElement('div');
  panel.id = 'wg-add-panel';
  panel.className = 'wg-add-panel';

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-weight:800;font-size:14px">➕ Añadir widgets</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="_resetDashConfig()" title="Restaurar widgets por defecto del rol">↺ Resetear</button>
        <button class="btn btn-primary btn-sm" onclick="toggleDashEdit()">✓ Listo</button>
      </div>
    </div>
  `;

  // Agrupar por categoría
  const currentIds = _loadDashConfig();
  const byCat = {};
  WIDGET_CATALOG.forEach(w => {
    if (!byCat[w.cat]) byCat[w.cat] = [];
    byCat[w.cat].push(w);
  });

  Object.keys(byCat).forEach(cat => {
    const catDiv = document.createElement('div');
    catDiv.style.marginBottom = '10px';

    const catLabel = document.createElement('div');
    catLabel.style.cssText = 'font-size:12px;font-weight:700;color:var(--gris-500);margin-bottom:6px';
    catLabel.textContent = _CAT_LABELS[cat] || cat;
    catDiv.appendChild(catLabel);

    const catGrid = document.createElement('div');
    catGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';

    byCat[cat].forEach(w => {
      const isActive = currentIds.includes(w.id);
      const chip = document.createElement('div');
      chip.className = 'wg-add-chip' + (isActive ? ' active' : '');
      chip.dataset.wid = w.id;
      chip.innerHTML = `<span>${w.ico}</span> ${w.label}`;
      chip.onclick = () => _toggleWidgetFromChip(w.id, chip);
      catGrid.appendChild(chip);
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
        const valid = parsed.filter(id => _wgMap[id]);
        if (valid.length > 0) return valid;
        // Si todos son inválidos (ej. migración de kpi_* a panel_*), resetear
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
    .wg { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.07); overflow: hidden; transition: box-shadow .15s; display:flex; flex-direction:column; }
    .wg:hover { box-shadow: 0 3px 12px rgba(0,0,0,.1); }
    .wg-sm { grid-column: span 1; }
    .wg-md { grid-column: span 2; }
    .wg-lg { grid-column: span 4; }

    /* ── Cabecera ── */
    .wg-head {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 14px 0; font-size: 11px; color: var(--gris-400);
    }
    .wg-ico { font-size: 14px; }
    .wg-label { font-weight: 700; flex: 1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    /* ── Cuerpo ── */
    .wg-body { padding: 8px 14px 12px; flex:1; display:flex; flex-direction:column; }

    /* ── KPI layout (para widgets individuales si se mantienen) ── */
    .wg-kpi-row { display:flex; align-items:flex-end; gap:10px; }
    .wg-kpi-num { font-size:22px; font-weight:800; line-height:1.1; white-space:nowrap; }
    .wg-kpi-sub { font-size:10px; color:var(--gris-400); margin-top:2px; }
    .wg-kpi-spark { flex:1; min-width:0; }

    /* ── Panel compuesto: grid interno ── */
    .wg-panel-grid { display:grid; gap:12px; }
    .wg-panel-4 { grid-template-columns: repeat(4, 1fr); }
    .wg-panel-3 { grid-template-columns: repeat(3, 1fr); }
    .wg-panel-2x2 { grid-template-columns: repeat(2, 1fr); }
    .wg-panel-cell { padding:8px 10px; border-radius:8px; background:var(--gris-50,#F9FAFB); }
    .wg-panel-val { font-size:20px; font-weight:800; line-height:1.2; white-space:nowrap; }
    .wg-panel-label { font-size:11px; color:var(--gris-500); font-weight:600; margin-top:2px; }
    .wg-panel-extra { font-size:10px; margin-top:2px; font-weight:500; }
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
    .wg-add-panel { background:var(--gris-50,#F9FAFB); border:2px dashed var(--gris-200,#E5E7EB); border-radius:10px; padding:14px; margin-bottom:14px; }
    .wg-add-chip { display:inline-flex; align-items:center; gap:4px; padding:5px 10px; border-radius:6px; font-size:11px; font-weight:600; background:#fff; border:1px solid var(--gris-200,#E5E7EB); cursor:pointer; transition:all .15s; user-select:none; }
    .wg-add-chip:hover { border-color:var(--azul); color:var(--azul); }
    .wg-add-chip.active { background:var(--azul-light,#DBEAFE); border-color:var(--azul,#3B82F6); color:var(--azul,#3B82F6); opacity:.7; }

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
