// ═══════════════════════════════════════════════════════════════════
//  MODO DISCRETO — Oculta importes a usuarios sin permiso ver_saldos
//  · Si el usuario NO tiene `tesoreria.ver_saldos`: importes borrosos.
//  · Hover sobre el importe → se revela temporalmente.
//  · Toggle global "👁️ Mostrar/Ocultar importes" en sidebar para forzarlo.
// ═══════════════════════════════════════════════════════════════════

(function() {
  // Inyectar estilos si no existen
  if (!document.getElementById('mod-discreto-css')) {
    const css = document.createElement('style');
    css.id = 'mod-discreto-css';
    css.textContent = `
      /* Modo discreto: borroso por defecto, hover revela */
      body.priv-mode .priv-amount,
      body.priv-mode .sv,
      body.priv-mode [data-priv="amount"] {
        filter: blur(7px);
        transition: filter .15s ease, letter-spacing .15s ease;
        cursor: help;
        user-select: none;
        letter-spacing: -0.5px;
      }
      body.priv-mode .priv-amount:hover,
      body.priv-mode .sv:hover,
      body.priv-mode [data-priv="amount"]:hover {
        filter: none;
        cursor: auto;
        user-select: auto;
        letter-spacing: normal;
      }
      /* Indicador visual en el toggle */
      .priv-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 600;
        border: 1.5px solid var(--gris-200);
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
        transition: all .15s;
      }
      .priv-toggle-btn:hover { background: var(--gris-50); }
      body.priv-mode .priv-toggle-btn { background: #FEF3C7; border-color: #D97706; color: #92400E; }
    `;
    document.head.appendChild(css);
  }
})();

// Estado: usuario tiene permiso? + override manual desde toggle
function _privTienePermiso() {
  return typeof canDo === 'function' && canDo('tesoreria', 'ver_saldos');
}

function _privModoActivo() {
  // Si NO tiene permiso → siempre activo (no se puede desactivar)
  if (!_privTienePermiso()) return true;
  // Si tiene permiso → respetar toggle del localStorage
  return localStorage.getItem('priv_mode_activo') === '1';
}

function aplicarModoDiscreto() {
  const activo = _privModoActivo();
  document.body.classList.toggle('priv-mode', activo);
  // Al activarse, escanear el DOM y marcar elementos con €
  if (activo) marcarImportesEnDOM();
  // Refrescar toggle UI: solo visible para usuarios con permiso (los demás no pueden cambiarlo)
  const btn = document.getElementById('privToggleBtn');
  if (btn) {
    const tienePermiso = _privTienePermiso();
    btn.style.display = tienePermiso ? '' : 'none';
    btn.innerHTML = activo ? '👁️‍🗨️ Discreto' : '👁️ Visible';
    btn.title = activo
      ? 'Modo discreto activo: importes ocultos. Click para mostrar.'
      : 'Importes visibles. Click para ocultar (modo discreto).';
  }
}

function togglearModoDiscreto() {
  if (!_privTienePermiso()) {
    if (typeof toast === 'function') toast('Tu permiso no permite cambiar el modo discreto', 'warning');
    return;
  }
  const actual = localStorage.getItem('priv_mode_activo') === '1';
  localStorage.setItem('priv_mode_activo', actual ? '0' : '1');
  aplicarModoDiscreto();
}

// Marca como `priv-amount` cualquier elemento hoja que contenga un importe (€ o números con %)
function marcarImportesEnDOM(root) {
  const scope = root || document.body;
  if (!scope.querySelectorAll) return;
  // Selectores objetivo: span, div, td, strong, b — sin hijos elementos
  const candidatos = scope.querySelectorAll('span, div, td, strong, b, p');
  // Regex de importe: número con € (con decimales o sin), o números grandes con separador miles
  const reImporte = /(?:^|\s)-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s*€/;
  candidatos.forEach(el => {
    if (el.children.length > 0) return;            // solo nodos hoja
    if (el.classList.contains('priv-amount')) return;
    if (el.classList.contains('sv')) return;        // ya cubierto por CSS
    const txt = el.textContent || '';
    if (reImporte.test(txt)) el.classList.add('priv-amount');
  });
}

// Re-marcar al cambiar de pantalla / al renderizar
function _privObservar() {
  if (window._privObserverActivo) return;
  window._privObserverActivo = true;
  const obs = new MutationObserver((muts) => {
    if (!document.body.classList.contains('priv-mode')) return;
    let necesitaScan = false;
    for (const m of muts) {
      if (m.addedNodes.length) { necesitaScan = true; break; }
    }
    if (necesitaScan) {
      // Throttle: 200ms
      clearTimeout(window._privScanTimer);
      window._privScanTimer = setTimeout(marcarImportesEnDOM, 200);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

// Inicialización: aplicar al cargar y al cambiar de página
document.addEventListener('DOMContentLoaded', () => {
  aplicarModoDiscreto();
  _privObservar();
});
// Re-aplicar también tras login/cambio de empresa
window.addEventListener('load', () => {
  setTimeout(aplicarModoDiscreto, 500);
  _privObservar();
});
