/**
 * MÓDULO CORREO ELECTRÓNICO (BETA)
 * Envío y recepción de correo integrado en el ERP
 * Vinculación con clientes, obras, presupuestos y facturas
 */

// ═══════════════════════════════════════════════
//  VARIABLES GLOBALES
// ═══════════════════════════════════════════════
let correos = [];
let correosFiltrados = [];
let carpetaActual = 'inbox';
let correoActual = null;

// ═══════════════════════════════════════════════
//  CARGA
// ═══════════════════════════════════════════════
async function loadCorreos() {
  try {
    const { data } = await sb.from('correos')
      .select('*').eq('empresa_id', EMPRESA.id)
      .order('fecha', { ascending: false })
      .limit(200);
    correos = data || [];
  } catch(e) {
    // Si la tabla no existe aún, cargar vacío
    correos = [];
  }
  filtrarCorreos();
}

// ═══════════════════════════════════════════════
//  CARPETAS
// ═══════════════════════════════════════════════
function cambiarCarpeta(folder) {
  carpetaActual = folder;
  // UI: marcar carpeta activa
  document.querySelectorAll('.mail-folder').forEach(el => {
    const isActive = el.dataset.folder === folder;
    el.style.background = isActive ? 'var(--azul-light)' : 'transparent';
    el.style.color = isActive ? 'var(--azul)' : 'var(--gris-600)';
    el.style.fontWeight = isActive ? '600' : '400';
  });
  filtrarCorreos();
}

// ═══════════════════════════════════════════════
//  FILTRADO Y RENDERIZADO
// ═══════════════════════════════════════════════
function filtrarCorreos() {
  const q = (document.getElementById('mailSearch')?.value || '').toLowerCase();

  correosFiltrados = correos.filter(c => {
    // Filtrar por carpeta
    if (carpetaActual === 'inbox' && c.tipo !== 'recibido') return false;
    if (carpetaActual === 'sent' && c.tipo !== 'enviado') return false;
    if (carpetaActual === 'drafts' && c.tipo !== 'borrador') return false;
    // Búsqueda
    if (q) {
      const txt = [c.asunto, c.de, c.para, c.cuerpo_texto].filter(Boolean).join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  renderListaCorreos(correosFiltrados);

  // Badge de no leídos
  const noLeidos = correos.filter(c => c.tipo === 'recibido' && !c.leido).length;
  const badge = document.getElementById('mailBadgeInbox');
  if (badge) {
    if (noLeidos > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = noLeidos;
    } else {
      badge.style.display = 'none';
    }
  }
}

function renderListaCorreos(list) {
  const container = document.getElementById('mailList');
  if (!container) return;

  if (!list.length) {
    const msgs = {
      inbox: 'No hay correos en la bandeja de entrada',
      sent: 'No hay correos enviados',
      drafts: 'No hay borradores'
    };
    container.innerHTML = `<div style="padding:30px 20px;text-align:center;color:var(--gris-400);font-size:13px">
      <div style="font-size:32px;margin-bottom:8px">${carpetaActual === 'inbox' ? '📥' : carpetaActual === 'sent' ? '📤' : '📝'}</div>
      ${msgs[carpetaActual] || 'Sin correos'}
    </div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const esNoLeido = c.tipo === 'recibido' && !c.leido;
    const esActivo = correoActual && correoActual.id === c.id;
    const fecha = c.fecha ? new Date(c.fecha) : null;
    const fechaStr = fecha ? (
      fecha.toDateString() === new Date().toDateString()
        ? fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    ) : '';

    return `<div onclick="abrirCorreo(${c.id})" style="padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:2px;border-left:3px solid ${esActivo ? 'var(--azul)' : 'transparent'};background:${esActivo ? 'var(--azul-light)' : esNoLeido ? 'rgba(59,130,246,.04)' : 'transparent'};transition:background .12s" onmouseenter="this.style.background=this.style.background||'var(--gris-50)'" onmouseleave="this.style.background=${esActivo ? "'var(--azul-light)'" : esNoLeido ? "'rgba(59,130,246,.04)'" : "'transparent'"}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
        <span style="font-size:12.5px;font-weight:${esNoLeido ? '700' : '500'};color:var(--gris-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${c.tipo === 'enviado' ? 'Para: ' + (c.para || '—') : (c.de || '—')}</span>
        <span style="font-size:10px;color:var(--gris-400);flex-shrink:0;margin-left:8px">${fechaStr}</span>
      </div>
      <div style="font-size:12px;font-weight:${esNoLeido ? '600' : '400'};color:var(--gris-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.asunto || '(sin asunto)'}</div>
      <div style="font-size:11px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">${(c.cuerpo_texto || '').substring(0, 80)}</div>
      ${c.vinculado_tipo ? `<span style="font-size:9px;background:var(--azul-light);color:var(--azul);padding:1px 5px;border-radius:3px;margin-top:3px;display:inline-block">${c.vinculado_tipo}</span>` : ''}
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
//  ABRIR CORREO
// ═══════════════════════════════════════════════
async function abrirCorreo(id) {
  const c = correos.find(x => x.id === id);
  if (!c) return;
  correoActual = c;

  // Marcar como leído
  if (c.tipo === 'recibido' && !c.leido) {
    c.leido = true;
    sb.from('correos').update({ leido: true }).eq('id', id);
  }

  // Re-renderizar lista para marcar activo
  renderListaCorreos(correosFiltrados);

  // Renderizar vista del correo
  const view = document.getElementById('mailView');
  if (!view) return;

  const fecha = c.fecha ? new Date(c.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  view.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--gris-200);display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h3 style="font-size:15px;font-weight:700;margin-bottom:6px">${c.asunto || '(sin asunto)'}</h3>
        <div style="font-size:12px;color:var(--gris-500)">
          ${c.tipo === 'enviado' ? '<b>Para:</b> ' + (c.para || '—') : '<b>De:</b> ' + (c.de || '—')}
          <span style="margin-left:12px">${fecha}</span>
        </div>
        ${c.para && c.tipo !== 'enviado' ? `<div style="font-size:12px;color:var(--gris-400)"><b>Para:</b> ${c.para}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        ${c.tipo === 'recibido' ? `<button class="btn btn-secondary btn-sm" onclick="responderCorreo(${c.id})">↩️ Responder</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="reenviarCorreo(${c.id})">↪️ Reenviar</button>
        <button class="btn btn-ghost btn-sm" onclick="eliminarCorreo(${c.id})" style="color:var(--rojo)">🗑️</button>
      </div>
    </div>
    <div style="flex:1;padding:20px;overflow-y:auto;font-size:13.5px;line-height:1.7;color:var(--gris-700)">
      ${c.cuerpo_html || (c.cuerpo_texto || '').replace(/\n/g, '<br>')}
    </div>
    ${c.vinculado_tipo ? `<div style="padding:8px 20px;border-top:1px solid var(--gris-200);font-size:12px;color:var(--gris-400)">
      Vinculado a: <b>${c.vinculado_tipo}</b> ${c.vinculado_ref || ''}
    </div>` : ''}`;
}

// ═══════════════════════════════════════════════
//  NUEVO CORREO / RESPONDER / REENVIAR
// ═══════════════════════════════════════════════
function nuevoCorreo(para, asunto, cuerpo) {
  const view = document.getElementById('mailView');
  if (!view) return;

  // Poblar selector de clientes para autocompletar
  const clienteOpts = (typeof clientes !== 'undefined' ? clientes : [])
    .filter(c => c.email)
    .map(c => `<option value="${c.email}">${c.nombre} — ${c.email}</option>`)
    .join('');
  const provOpts = (typeof proveedores !== 'undefined' ? proveedores : [])
    .filter(p => p.email || p.email_pedidos)
    .map(p => `<option value="${p.email_pedidos || p.email}">${p.nombre} — ${p.email_pedidos || p.email}</option>`)
    .join('');

  view.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--gris-200)">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">✉️ Nuevo correo</h3>
      <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <label style="width:50px;font-size:12px;font-weight:600;color:var(--gris-500)">Para:</label>
        <input id="mail_para" value="${para || ''}" list="mailContactos" placeholder="email@ejemplo.com" style="flex:1;padding:6px 10px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:13px;outline:none">
        <datalist id="mailContactos">${clienteOpts}${provOpts}</datalist>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <label style="width:50px;font-size:12px;font-weight:600;color:var(--gris-500)">Asunto:</label>
        <input id="mail_asunto" value="${asunto || ''}" placeholder="Asunto del correo" style="flex:1;padding:6px 10px;border:1.5px solid var(--gris-200);border-radius:7px;font-size:13px;outline:none">
      </div>
    </div>
    <div style="flex:1;padding:12px 20px;overflow-y:auto">
      <textarea id="mail_cuerpo" placeholder="Escribe tu mensaje..." style="width:100%;height:100%;min-height:200px;border:none;outline:none;font-size:13.5px;line-height:1.7;resize:none;font-family:var(--font)">${cuerpo || ''}</textarea>
    </div>
    <div style="padding:12px 20px;border-top:1px solid var(--gris-200);display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="guardarBorradorCorreo()">💾 Guardar borrador</button>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="cancelarCorreo()">Cancelar</button>
        <button class="btn btn-primary" onclick="enviarCorreo()">📤 Enviar</button>
      </div>
    </div>`;
}

function responderCorreo(id) {
  const c = correos.find(x => x.id === id);
  if (!c) return;
  const asunto = (c.asunto || '').startsWith('Re: ') ? c.asunto : 'Re: ' + (c.asunto || '');
  const cuerpo = '\n\n—————————————\n' + (c.cuerpo_texto || '');
  nuevoCorreo(c.de || '', asunto, cuerpo);
}

function reenviarCorreo(id) {
  const c = correos.find(x => x.id === id);
  if (!c) return;
  const asunto = (c.asunto || '').startsWith('Fwd: ') ? c.asunto : 'Fwd: ' + (c.asunto || '');
  const cuerpo = '\n\n—————————————\nReenviado de: ' + (c.de || '') + '\n' + (c.cuerpo_texto || '');
  nuevoCorreo('', asunto, cuerpo);
}

function cancelarCorreo() {
  correoActual = null;
  const view = document.getElementById('mailView');
  if (view) {
    view.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--gris-400);font-size:14px">
      <div style="text-align:center"><div style="font-size:48px;margin-bottom:12px">✉️</div><p>Selecciona un correo para leerlo</p></div>
    </div>`;
  }
}

// ═══════════════════════════════════════════════
//  ENVIAR CORREO (vía mailto: o SMTP si configurado)
// ═══════════════════════════════════════════════
async function enviarCorreo() {
  const para = document.getElementById('mail_para')?.value?.trim();
  const asunto = document.getElementById('mail_asunto')?.value?.trim();
  const cuerpo = document.getElementById('mail_cuerpo')?.value?.trim();

  if (!para) { toast('Introduce un destinatario', 'error'); return; }
  if (!asunto) { toast('Introduce un asunto', 'error'); return; }

  // Guardar en base de datos
  try {
    await sb.from('correos').insert({
      empresa_id: EMPRESA.id,
      tipo: 'enviado',
      de: EMPRESA.email || CP.nombre,
      para,
      asunto,
      cuerpo_texto: cuerpo,
      fecha: new Date().toISOString(),
      leido: true,
      usuario_id: CU.id
    });
  } catch(e) {
    // Si la tabla no existe, continuar con mailto
  }

  // Abrir cliente de correo nativo
  const mailtoUrl = `mailto:${para}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  window.open(mailtoUrl);

  toast('📤 Correo preparado — se abrirá tu cliente de correo', 'info');
  cancelarCorreo();
  await loadCorreos();
}

async function guardarBorradorCorreo() {
  const para = document.getElementById('mail_para')?.value?.trim() || '';
  const asunto = document.getElementById('mail_asunto')?.value?.trim() || '';
  const cuerpo = document.getElementById('mail_cuerpo')?.value?.trim() || '';

  try {
    await sb.from('correos').insert({
      empresa_id: EMPRESA.id,
      tipo: 'borrador',
      de: EMPRESA.email || CP.nombre,
      para,
      asunto,
      cuerpo_texto: cuerpo,
      fecha: new Date().toISOString(),
      leido: true,
      usuario_id: CU.id
    });
    toast('💾 Borrador guardado', 'success');
    cancelarCorreo();
    await loadCorreos();
  } catch(e) {
    toast('Error al guardar borrador', 'error');
  }
}

async function eliminarCorreo(id) {
  if (!confirm('¿Eliminar este correo?')) return;
  try {
    await sb.from('correos').delete().eq('id', id);
    correos = correos.filter(c => c.id !== id);
    correoActual = null;
    cancelarCorreo();
    filtrarCorreos();
    toast('Correo eliminado', 'info');
  } catch(e) {
    toast('Error al eliminar', 'error');
  }
}
