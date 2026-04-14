/**
 * SMART CLOSE para editores (Ventas + Compras) — build 144
 *
 * Comportamiento del botón "Atrás" circular azul:
 *   - Doc nuevo vacío  → cerrar sin guardar
 *   - Doc nuevo dirty  → guardar como borrador y cerrar
 *   - Doc existente clean → cerrar
 *   - Doc existente dirty → preguntar Sí/No/Cancelar:
 *        Sí       → guardar y cerrar
 *        No       → cerrar sin guardar (descarta cambios)
 *        Cancelar → no cerrar, seguir editando
 *
 * Uso:
 *   await smartClose({
 *     isNew: bool,       // true si es un doc que aún no existe en BD
 *     isDirty: bool,     // true si hay cambios sin guardar
 *     hasContent: bool,  // true si el doc vacío tiene al menos algún dato (para decidir si guardar borrador)
 *     guardar: async fn, // guarda como borrador/pendiente sin cerrar el modal
 *     cerrar: fn,        // cierra el modal
 *     titulo: string     // texto para el dialog (ej: "presupuesto de compra")
 *   });
 */

async function smartClose(opts) {
  const { isNew, isDirty, hasContent, guardar, cerrar, titulo = 'documento' } = opts;

  // Doc nuevo
  if (isNew) {
    if (!hasContent) {
      // nuevo vacío → cerrar
      cerrar();
      return;
    }
    // nuevo con datos → guardar borrador y cerrar
    const ok = await guardar('borrador');
    if (ok !== false) cerrar();
    return;
  }

  // Doc existente
  if (!isDirty) {
    cerrar();
    return;
  }

  // Existente con cambios → diálogo Sí/No/Cancelar
  const choice = await _smartCloseDialog(titulo);
  if (choice === 'cancel') return;
  if (choice === 'no') { cerrar(); return; }
  // 'yes'
  const ok = await guardar();
  if (ok !== false) cerrar();
}

function _smartCloseDialog(titulo) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:440px;width:90%;padding:24px;box-shadow:0 20px 40px rgba(0,0,0,.25);transform:translateY(10px);transition:transform .15s">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:44px;height:44px;border-radius:50%;background:#FEF3C7;display:flex;align-items:center;justify-content:center;font-size:22px">⚠️</div>
          <div style="font-size:16px;font-weight:700;color:#111">¿Guardar los cambios?</div>
        </div>
        <div style="color:#555;font-size:13.5px;line-height:1.5;margin-bottom:20px">
          Has hecho cambios en este ${titulo} que no se han guardado. ¿Qué quieres hacer?
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-ghost" data-r="cancel" style="min-width:100px">Cancelar</button>
          <button class="btn btn-secondary" data-r="no" style="min-width:100px">No guardar</button>
          <button class="btn btn-primary" data-r="yes" style="min-width:100px">Sí, guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.firstElementChild.style.transform = 'translateY(0)';
    });
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-r]');
      if (btn) {
        const r = btn.getAttribute('data-r');
        overlay.remove();
        resolve(r);
      } else if (e.target === overlay) {
        overlay.remove();
        resolve('cancel');
      }
    });
  });
}

// ─── Dirty tracking para modales de Compras ─────────────────────────
// Marca el modal como dirty cuando cambia cualquier input dentro.
// Se resetea al abrir el modal (nuevo o editar).
const _dirtyFlags = {};

function dirtyInit(modalId) {
  _dirtyFlags[modalId] = false;
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (modal._dirtyListenerInstalled) return;
  modal._dirtyListenerInstalled = true;
  modal.addEventListener('input', () => { _dirtyFlags[modalId] = true; }, true);
  modal.addEventListener('change', () => { _dirtyFlags[modalId] = true; }, true);
}

function dirtyReset(modalId) { _dirtyFlags[modalId] = false; }
function dirtyIs(modalId)    { return !!_dirtyFlags[modalId]; }
function dirtySet(modalId, v){ _dirtyFlags[modalId] = !!v; }

// Exponer helpers en window
window.smartClose = smartClose;
window.dirtyInit = dirtyInit;
window.dirtyReset = dirtyReset;
window.dirtyIs = dirtyIs;
window.dirtySet = dirtySet;
