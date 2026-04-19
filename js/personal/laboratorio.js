/**
 * LABORATORIO DE PRUEBAS — Instalo ERP
 * ─────────────────────────────────────────────────────────────
 * Página de desarrollo/testing solo visible para superadmin.
 *
 * AUTO-INSTALABLE: Este script se inyecta solo en el sidebar
 * y crea su propia página. No necesita que index_split.html
 * tenga el botón ni el div de página previamente.
 *
 * CÓMO USAR:
 *   1. Añade un nuevo panel con objeto en _LAB_PANELS
 *   2. Prueba la feature desde aquí
 *   3. Cuando esté lista, mueve el código al módulo correspondiente
 *      y cambia estado a 'archivado'
 * ─────────────────────────────────────────────────────────────
 */

// ── Auto-bootstrap: esperar a que CP esté disponible ────────
(function _labBootstrap() {
  // Intentar instalar cada 500ms hasta que CP esté listo (max 30s)
  let intentos = 0;
  const timer = setInterval(() => {
    intentos++;
    if (intentos > 60) { clearInterval(timer); return; } // max 30s
    if (typeof CP === 'undefined' || !CP || !CP.es_superadmin) {
      if (intentos > 60) clearInterval(timer);
      return;
    }
    clearInterval(timer);
    _labInstall();
  }, 500);
})();

function _labInstall() {
  // 1) Crear botón en sidebar (si no existe)
  if (!document.getElementById('btnLaboratorio')) {
    const secAdmin = document.getElementById('sec-admin');
    if (secAdmin) {
      const btn = document.createElement('button');
      btn.className = 'sb-item';
      btn.id = 'btnLaboratorio';
      btn.onclick = function() { goPage('laboratorio'); };
      btn.innerHTML = '<span class="ico">🧪</span> Laboratorio<span class="sb-beta" style="background:#7C3AED;color:#fff">dev</span>';
      btn.style.display = 'flex';
      secAdmin.appendChild(btn);
    }
  } else {
    document.getElementById('btnLaboratorio').style.display = 'flex';
  }

  // 2) Crear página (si no existe)
  if (!document.getElementById('page-laboratorio')) {
    const pagesContainer = document.getElementById('content')
      || document.getElementById('pagesContainer')
      || document.querySelector('.pages')
      || document.querySelector('main');
    if (pagesContainer) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.id = 'page-laboratorio';
      pagesContainer.appendChild(pageDiv);
    }
  }

  // 3) Registrar en goPage si no está (patchear ui.js)
  // goPage ya tiene el handler gracias a ui.js, pero si no lo tiene,
  // hacemos override del goPage para capturarlo
  const originalGoPage = window._originalGoPage || window.goPage;
  if (originalGoPage && !window._labGoPagePatched) {
    window._originalGoPage = originalGoPage;
    window._labGoPagePatched = true;
    window.goPage = function(id) {
      if (id === 'laboratorio') {
        // Ocultar todas las páginas y mostrar la de laboratorio
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const labPage = document.getElementById('page-laboratorio');
        if (labPage) {
          labPage.classList.add('active');
          // Actualizar título
          const titleEl = document.getElementById('pgTitle') || document.querySelector('.topbar-title,.tb-title') || document.querySelector('h1');
          if (titleEl) titleEl.textContent = '🧪 Laboratorio de pruebas';
        }
        loadLaboratorio();
        return;
      }
      return originalGoPage.call(this, id);
    };
  }

  console.log('🧪 Laboratorio instalado correctamente');
}


// ── Registro de paneles activos ─────────────────────────────
const _LAB_PANELS = [
  {
    id: 'fichaje-tests',
    titulo: '⏱️ Fichaje — Pruebas (app móvil)',
    estado: 'en-pruebas',   // 'en-pruebas' | 'listo' | 'archivado'
    descripcion: 'Simula los eventos del módulo de fichaje de la app móvil desde el desktop.',
    render: _labPanelFichaje
  },
  // ── Añadir nuevos paneles aquí ──
];

// ── Entrada principal ────────────────────────────────────────
function loadLaboratorio() {
  const container = document.getElementById('page-laboratorio');
  if (!container) return;

  const paneles = _LAB_PANELS.filter(p => p.estado !== 'archivado');

  container.innerHTML = `
    <!-- Cabecera -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div>
        <h2 style="font-size:17px;font-weight:800">🧪 Laboratorio de pruebas</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">Solo visible para superadmin · Los cambios aquí no afectan a producción</p>
      </div>
    </div>

    <!-- Aviso -->
    <div style="background:#FEF3C7;border:1.5px solid #D97706;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;gap:10px;align-items:flex-start">
      <span style="font-size:18px">⚠️</span>
      <div style="font-size:12.5px;color:#92400E;line-height:1.6">
        <strong>Entorno de desarrollo.</strong> Los botones de este panel simulan eventos reales de la app.
        Los fichajes que registres desde aquí SÍ se guardan en la base de datos.
        Usa "Resetear estado" para limpiar sin afectar a la BD.
      </div>
    </div>

    <!-- Paneles -->
    <div id="labPaneles">
      ${paneles.length === 0
        ? '<div class="card" style="padding:40px;text-align:center;color:var(--gris-400)">No hay paneles activos</div>'
        : paneles.map(p => _labRenderPanel(p)).join('')
      }
    </div>

    <!-- Instrucciones para desarrolladores -->
    <details style="margin-top:16px">
      <summary style="cursor:pointer;font-size:12px;color:var(--gris-400);padding:8px 0;user-select:none">
        ▶ Cómo añadir un nuevo panel al laboratorio
      </summary>
      <div style="background:var(--gris-50);border-radius:8px;padding:14px;margin-top:6px;font-size:12px;color:var(--gris-600);line-height:1.8">
        <strong>1.</strong> En <code>laboratorio.js</code>, añade un objeto al array <code>_LAB_PANELS</code>:<br>
        <code style="display:block;background:#fff;padding:8px;border-radius:6px;margin:6px 0;font-size:11px;border:1px solid var(--gris-200)">
          { id: 'mi-feature', titulo: '✨ Mi feature', estado: 'en-pruebas',<br>
          &nbsp;&nbsp;descripcion: 'Descripción breve',<br>
          &nbsp;&nbsp;render: _labPanelMiFeature }
        </code>
        <strong>2.</strong> Define la función <code>_labPanelMiFeature()</code> que devuelve HTML.<br>
        <strong>3.</strong> Cuando la feature esté lista → cambia <code>estado</code> a <code>'archivado'</code> y mueve el código.
      </div>
    </details>
  `;
}

function _labRenderPanel(panel) {
  const badgeColor = panel.estado === 'listo' ? '#059669' : '#D97706';
  const badgeText  = panel.estado === 'listo' ? 'Listo para prod' : 'En pruebas';

  return `
    <div class="card" style="margin-bottom:16px;padding:0;overflow:hidden">
      <!-- Cabecera del panel -->
      <div style="background:var(--gris-50);border-bottom:1px solid var(--gris-200);padding:12px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:15px;font-weight:800;flex:1">${panel.titulo}</span>
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;background:${badgeColor}20;color:${badgeColor};border:1px solid ${badgeColor}40">
          ${badgeText}
        </span>
      </div>
      <!-- Descripción -->
      <div style="padding:10px 16px 0;font-size:12px;color:var(--gris-500)">${panel.descripcion}</div>
      <!-- Contenido del panel -->
      <div style="padding:14px 16px" id="labPanel-${panel.id}">
        ${panel.render()}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// PANEL: FICHAJE (tests de la app móvil desde desktop)
// ═══════════════════════════════════════════════════════════
function _labPanelFichaje() {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">

      <!-- Estado actual en BD -->
      <div style="grid-column:1/-1;background:#EFF6FF;border-radius:10px;padding:12px 14px;font-size:12.5px;color:#1E3A5F">
        <div style="font-weight:700;margin-bottom:6px">📋 Verificar estado en Supabase</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="_labFichajeVerEstado()" style="${_labBtn('#2563EB')}">
            🔍 Ver fichajes de hoy (BD)
          </button>
          <button onclick="_labFichajeExportHoy()" style="${_labBtn('#6366F1')}">
            📊 Exportar hoy a CSV
          </button>
        </div>
        <div id="labFichajeEstadoBD" style="margin-top:10px;font-size:12px;color:var(--gris-600)"></div>
      </div>

      <!-- Simular eventos de la app móvil -->
      <div style="grid-column:1/-1">
        <div style="font-size:11px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
          Simular eventos de la app móvil
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">

          <button onclick="_labSimular('popup-entrada')" style="${_labBtnOutline('#2563EB')}">
            🔔 Popup bloqueante entrada (8:30)
          </button>

          <button onclick="_labSimular('banner-entrada')" style="${_labBtnOutline('#D97706')}">
            📍 Banner sugerencia entrada (desde parte)
          </button>

          <button onclick="_labSimular('popup-salida')" style="${_labBtnOutline('#059669')}">
            🏁 Popup último parte completado
          </button>

          <button onclick="_labSimular('aviso-1630')" style="${_labBtnOutline('#EF4444')}">
            ⏰ Aviso 16:30 (vibración + pantalla roja)
          </button>

        </div>
      </div>

      <!-- Crear fichajes de prueba directamente en BD -->
      <div style="grid-column:1/-1">
        <div style="font-size:11px;font-weight:700;color:var(--gris-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
          Crear registros de prueba en BD
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:end">
          <div>
            <label style="font-size:11px;color:var(--gris-500);display:block;margin-bottom:4px">Usuario</label>
            <select id="labFichajeUser" style="width:100%;padding:7px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12px;outline:none">
              <option value="">— Yo mismo —</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--gris-500);display:block;margin-bottom:4px">Hora entrada</label>
            <input type="time" id="labFichajeHoraEntrada" value="08:30" style="width:100%;padding:7px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12px;outline:none">
          </div>
          <div>
            <label style="font-size:11px;color:var(--gris-500);display:block;margin-bottom:4px">Hora salida</label>
            <input type="time" id="labFichajeHoraSalida" style="width:100%;padding:7px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12px;outline:none" placeholder="(opcional)">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button onclick="_labFichajeCrear()" style="${_labBtn('#059669')}">
            ➕ Crear fichaje de prueba
          </button>
          <button onclick="_labFichajeBorrarHoy()" style="${_labBtn('#EF4444')}">
            🗑️ Borrar MIS fichajes de hoy (BD)
          </button>
        </div>
        <div id="labFichajeMsg" style="margin-top:8px;font-size:12px;color:var(--gris-500)"></div>
      </div>

    </div>
  `;
}

// ── Helpers de estilo ────────────────────────────────────────
function _labBtn(color) {
  return `background:${color};color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit`;
}
function _labBtnOutline(color) {
  return `background:#fff;color:${color};border:1.5px solid ${color};border-radius:8px;padding:10px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;display:flex;align-items:center;gap:6px`;
}

// ── Acciones del panel fichaje ───────────────────────────────
async function _labFichajeVerEstado() {
  const el = document.getElementById('labFichajeEstadoBD');
  if (!el) return;
  el.innerHTML = '<span style="color:var(--gris-400)">Consultando...</span>';

  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await sb.from('fichajes')
    .select('id, usuario_nombre, hora_entrada, hora_salida, horas_total, metodo')
    .eq('empresa_id', EMPRESA.id)
    .eq('fecha', hoy)
    .order('hora_entrada', { ascending: true });

  if (error) { el.innerHTML = `<span style="color:var(--rojo)">Error: ${error.message}</span>`; return; }
  if (!data?.length) { el.innerHTML = '<span style="color:var(--gris-400)">Sin fichajes hoy en BD</span>'; return; }

  el.innerHTML = data.map(f => `
    <div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--gris-100);align-items:center">
      <span style="font-weight:700;color:#1E3A5F;min-width:80px">${f.usuario_nombre || '—'}</span>
      <span>🟢 ${f.hora_entrada?.slice(0,5)||'?'}</span>
      <span>${f.hora_salida ? '🔴 '+f.hora_salida.slice(0,5) : '<span style="color:var(--gris-400)">abierto</span>'}</span>
      <span style="color:var(--gris-400)">${f.horas_total ? parseFloat(f.horas_total).toFixed(1)+'h' : '—'}</span>
      <span style="font-size:10px;background:var(--gris-100);padding:1px 6px;border-radius:6px">${f.metodo||'app'}</span>
    </div>
  `).join('');
}

function _labFichajeExportHoy() {
  if (typeof exportFichajes === 'function') {
    exportFichajes();
  } else {
    toast('Función exportFichajes no disponible en desktop', 'info');
  }
}

async function _labFichajeCrear() {
  const msg = document.getElementById('labFichajeMsg');
  const horaEntrada = document.getElementById('labFichajeHoraEntrada')?.value;
  const horaSalida  = document.getElementById('labFichajeHoraSalida')?.value;
  const userId      = document.getElementById('labFichajeUser')?.value || CU.id;

  if (!horaEntrada) { if(msg) msg.innerHTML = '<span style="color:var(--rojo)">Introduce hora de entrada</span>'; return; }

  const hoy = new Date().toISOString().split('T')[0];
  const usuarioNombre = userId === CU.id
    ? (CP?.nombre || 'Yo')
    : (partesData?.find?.(p => p.usuario_id === userId)?.usuario_nombre || userId);

  let horas = null;
  if (horaSalida) {
    const [he, me] = horaEntrada.split(':').map(Number);
    const [hs, ms] = horaSalida.split(':').map(Number);
    horas = +((hs * 60 + ms - he * 60 - me) / 60).toFixed(2);
  }

  const { error } = await sb.from('fichajes').insert({
    empresa_id: EMPRESA.id,
    usuario_id: userId,
    usuario_nombre: usuarioNombre,
    fecha: hoy,
    hora_entrada: horaEntrada + ':00',
    hora_salida: horaSalida ? horaSalida + ':00' : null,
    horas_total: horas,
    tipo: 'entrada',
    metodo: 'manual',
    observaciones: '[TEST LAB]'
  });

  if (error) {
    if(msg) msg.innerHTML = `<span style="color:var(--rojo)">Error: ${error.message}</span>`;
  } else {
    if(msg) msg.innerHTML = `<span style="color:var(--verde)">✅ Fichaje creado: ${horaEntrada}${horaSalida?' → '+horaSalida:''} [TEST LAB]</span>`;
    _labFichajeVerEstado();
  }
}

async function _labFichajeBorrarHoy() {
  const okLab = await confirmModal({titulo:'Borrar fichajes TEST',mensaje:'¿Borrar TODOS los fichajes de HOY marcados como [TEST LAB]?',aviso:'Solo se eliminarán los registros con observaciones=[TEST LAB]',btnOk:'Borrar',colorOk:'#dc2626'}); if (!okLab) return;

  const hoy = new Date().toISOString().split('T')[0];
  const { error } = await sb.from('fichajes')
    .delete()
    .eq('empresa_id', EMPRESA.id)
    .eq('usuario_id', CU.id)
    .eq('fecha', hoy)
    .eq('observaciones', '[TEST LAB]');

  if (error) {
    toast('Error al borrar: ' + error.message, 'error');
  } else {
    toast('Fichajes de prueba eliminados ✓', 'success');
    _labFichajeVerEstado();
    const msg = document.getElementById('labFichajeMsg');
    if (msg) msg.innerHTML = '<span style="color:var(--verde)">Registros [TEST LAB] eliminados de BD</span>';
  }
}

// Simular eventos de la app móvil (abre aviso informativo en desktop)
function _labSimular(evento) {
  const msgs = {
    'popup-entrada': '🔔 Este popup aparece en la APP MÓVIL a partir de las 8:30 si no hay entrada registrada.\n\nPara probarlo en el móvil: ve a ≡ Más → 🧪 Panel de pruebas → "Simular popup de entrada"',
    'banner-entrada': '📍 Este banner aparece en la APP MÓVIL al iniciar un parte sin fichaje previo.\n\nPara probarlo: ve a ≡ Más → 🧪 Panel de pruebas → "Simular banner"',
    'popup-salida': '🏁 Este popup aparece en la APP MÓVIL al completar el último parte del día.\n\nPara probarlo: ve a ≡ Más → 🧪 Panel de pruebas → "Simular último parte completado"',
    'aviso-1630': '⏰ Este aviso se lanza en la APP MÓVIL a las 16:30 con vibración.\n\nPara probarlo: ve a ≡ Más → 🧪 Panel de pruebas → "Simular aviso 16:30"',
  };
  const desc = msgs[evento] || 'Evento no reconocido';
  _labModalInfo(desc);
}

function _labModalInfo(texto) {
  const existing = document.getElementById('labInfoModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'labInfoModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:460px;width:100%;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.3)">
      <div style="font-size:15px;font-weight:700;margin-bottom:12px;color:#1E3A5F">ℹ️ Evento de app móvil</div>
      <div style="font-size:13px;color:#374151;white-space:pre-line;line-height:1.7">${texto}</div>
      <button onclick="document.getElementById('labInfoModal')?.remove()" style="margin-top:16px;width:100%;padding:10px;border:none;border-radius:8px;background:#1E3A5F;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
        Entendido
      </button>
    </div>
  `;
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}
