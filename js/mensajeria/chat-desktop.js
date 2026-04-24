// ═══════════════════════════════════════════════
// MENSAJERÍA — UI Desktop (ERP escritorio)
// Depende de chat.js (módulo compartido)
// ═══════════════════════════════════════════════

let _chatDesktopInited = false;
let _chatConvActivaDesktop = null;

// ═══════════════════════════════════════════════
//  ENTRY POINT — llamado por goPage('mensajes')
// ═══════════════════════════════════════════════
async function loadMensajesDesktop() {
  // Registrar callbacks del módulo compartido
  _chatOnConvUpdate = _chatDesktopOnConvUpdate;
  _chatOnNewMessage = _chatDesktopOnNewMessage;
  _chatOnMsgInConv  = _chatDesktopOnMsgInConv;

  // Cargar conversaciones
  const convs = await chatCargarConversaciones();
  _chatDesktopRenderConvList(convs);

  // Iniciar realtime si no está activo
  chatIniciarRealtime();

  // Actualizar badge
  _chatDesktopActualizarBadge();

  _chatDesktopInited = true;
}

// ═══════════════════════════════════════════════
//  RENDER: LISTA DE CONVERSACIONES
// ═══════════════════════════════════════════════
function _chatDesktopRenderConvList(convs) {
  const container = document.getElementById('chatConvList');
  if (!container) return;

  if (!convs || !convs.length) {
    container.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--gris-400);font-size:13px">
      <div style="font-size:36px;margin-bottom:8px">💬</div>
      No tienes conversaciones aún.<br>Pulsa <b>+ Nuevo</b> para empezar.
    </div>`;
    return;
  }

  let html = '';
  for (const conv of convs) {
    const unread = _chatUnread[conv.id] || 0;
    const titulo = conv.titulo || conv._nombreOtro || 'Sin título';
    const ico = conv.tipo === 'obra' ? '🏗️' : '👤';
    const preview = conv.ultimo_mensaje_texto || 'Sin mensajes';
    const fecha = chatFormatFechaCorta(conv.ultimo_mensaje_at);
    const iniciales = chatIniciales(titulo);
    const bgColor = conv.tipo === 'obra' ? 'var(--verde)' : 'var(--azul)';
    const isActive = _chatConvActivaDesktop === conv.id;

    html += `<div class="chat-conv-item${isActive ? ' active' : ''}" onclick="chatAbrirConversacion(${conv.id})" data-conv-id="${conv.id}" style="${unread && !isActive ? 'background:var(--azul-light)' : ''}">
      <div class="chat-avatar" style="background:${bgColor}">${iniciales}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:${unread ? '700' : '500'};font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ico} ${_chatEscapeHtml(titulo)}</span>
          <span style="font-size:11px;color:var(--gris-400);flex-shrink:0;margin-left:8px">${fecha}</span>
        </div>
        <div style="font-size:12px;color:var(--gris-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${_chatEscapeHtml(preview)}</div>
      </div>
      ${unread ? `<div style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0">${unread}</div>` : ''}
    </div>`;
  }
  container.innerHTML = html;
}

// ═══════════════════════════════════════════════
//  ABRIR CONVERSACIÓN
// ═══════════════════════════════════════════════
async function chatAbrirConversacion(convId) {
  _chatConvActivaDesktop = convId;

  // Responsive: añadir clase para mobile layout
  const wrap = document.querySelector('.chat-desktop-wrap');
  if (wrap) wrap.classList.add('chat-conv-open');

  // Mostrar panel de conversación
  const emptyState = document.getElementById('chatEmptyState');
  const convView = document.getElementById('chatConvView');
  if (emptyState) emptyState.style.display = 'none';
  if (convView) convView.style.display = 'flex';

  // Header
  const conv = _chatConversaciones.find(c => c.id === convId);
  const headerEl = document.getElementById('chatConvHeader');
  if (headerEl && conv) {
    const titulo = conv.titulo || conv._nombreOtro || 'Sin título';
    const ico = conv.tipo === 'obra' ? '🏗️' : '👤';
    const iniciales = chatIniciales(titulo);
    const bgColor = conv.tipo === 'obra' ? 'var(--verde)' : 'var(--azul)';
    const subtitulo = conv.tipo === 'obra' ? 'Chat de obra' : 'Mensaje directo';

    headerEl.innerHTML = `
      <button onclick="_chatDesktopVolverLista()" class="chat-input-btn" style="display:none;font-size:18px" id="chatBackBtn">←</button>
      <div class="chat-avatar" style="background:${bgColor};width:36px;height:36px;font-size:13px">${iniciales}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ico} ${_chatEscapeHtml(titulo)}</div>
        <div style="font-size:11px;color:var(--gris-400)">${subtitulo}</div>
      </div>
      ${conv.tipo === 'obra' ? `<button onclick="_chatDesktopVerParticipantes(${convId})" class="chat-input-btn" title="Participantes" style="font-size:16px">👥</button>` : ''}
    `;

    // Mostrar botón back en mobile
    if (window.innerWidth <= 768) {
      const backBtn = document.getElementById('chatBackBtn');
      if (backBtn) backBtn.style.display = 'block';
    }
  }

  // Cargar mensajes
  const msgs = await chatCargarMensajes(convId);
  _chatDesktopRenderMensajes(msgs);

  // Input bar
  const inputArea = document.getElementById('chatInputArea');
  if (inputArea) {
    inputArea.innerHTML = `<div class="chat-input-bar">
      <button onclick="_chatAdjuntarFoto(${convId})" class="chat-input-btn" title="Enviar foto">📷</button>
      <button onclick="_chatAdjuntarDoc(${convId})" class="chat-input-btn" title="Adjuntar documento">📎</button>
      <button onclick="_chatEnviarGps(${convId})" class="chat-input-btn" title="Enviar ubicación">📍</button>
      <input type="text" id="chatInput" placeholder="Escribe un mensaje..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_chatEnviarDesdeInput(${convId})}">
      <button onclick="_chatEnviarDesdeInput(${convId})" class="chat-send-btn">➤</button>
    </div>`;
  }

  // Marcar como leído
  chatMarcarLeido(convId);
  _chatUnread[convId] = 0;

  // Suscribir a Realtime de esta conversación
  chatSuscribirConversacion(convId);

  // Actualizar lista (marcar active, quitar badge)
  _chatDesktopRenderConvList(_chatConversaciones);
  _chatDesktopActualizarBadge();

  // Scroll al final
  _chatDesktopScrollBottom();
}

// ═══════════════════════════════════════════════
//  RENDER: MENSAJES
// ═══════════════════════════════════════════════
function _chatDesktopRenderMensajes(msgs) {
  const area = document.getElementById('chatMsgArea');
  if (!area) return;

  if (!msgs || !msgs.length) {
    area.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gris-400);font-size:13px">
      <div style="font-size:36px;margin-bottom:8px">✨</div>
      No hay mensajes aún. ¡Empieza la conversación!
    </div>`;
    return;
  }

  let html = '';
  let lastDate = '';

  for (const msg of msgs) {
    if (msg.eliminado) continue;

    // Separador de fecha
    const msgDate = new Date(msg.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
    if (msgDate !== lastDate) {
      html += `<div class="chat-date-sep"><span>${msgDate}</span></div>`;
      lastDate = msgDate;
    }

    const esMio = msg.autor_id === CU.id;
    html += chatRenderMensaje(msg, esMio);
  }

  // Botón cargar más
  if (msgs.length >= CHAT_PAGE_SIZE) {
    html = `<div style="text-align:center;padding:8px">
      <button onclick="_chatDesktopCargarMas()" class="btn btn-secondary btn-sm" style="font-size:11px">Cargar anteriores</button>
    </div>` + html;
  }

  area.innerHTML = html;
}

async function _chatDesktopCargarMas() {
  if (!_chatConvActivaDesktop) return;
  const antiguos = await chatCargarMasAntiguos(_chatConvActivaDesktop);
  if (antiguos && antiguos.length) {
    _chatDesktopRenderMensajes(_chatMensajes);
  }
}

function _chatDesktopScrollBottom() {
  setTimeout(() => {
    const area = document.getElementById('chatMsgArea');
    if (area) area.scrollTop = area.scrollHeight;
  }, 80);
}

// ═══════════════════════════════════════════════
//  NUEVO CHAT (modal)
// ═══════════════════════════════════════════════
async function chatNuevoDesktop() {
  // Cargar usuarios de la empresa
  const { data: usuarios } = await sb.from('perfiles')
    .select('id, nombre, rol, avatar_url')
    .eq('empresa_id', EMPRESA.id)
    .neq('id', CU.id)
    .order('nombre');

  let html = `<div class="chat-nuevo-modal" onclick="if(event.target===this)this.remove()">
    <div class="chat-nuevo-card">
      <div style="padding:16px 20px;border-bottom:1px solid var(--gris-200);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">Nueva conversación</h3>
        <button onclick="this.closest('.chat-nuevo-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--gris-400)">✕</button>
      </div>
      <div style="padding:16px 20px">
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:8px">💬 Mensaje directo</div>`;

  if (usuarios && usuarios.length) {
    for (const u of usuarios) {
      const ini = chatIniciales(u.nombre || u.rol || '?');
      html += `<div onclick="_chatDesktopIniciarDirecto('${u.id}','${_chatEscapeHtml(u.nombre || u.rol)}')"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-radius:8px;transition:background .12s"
        onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background=''">
        <div class="chat-avatar" style="background:var(--azul);width:36px;height:36px;font-size:12px">${ini}</div>
        <div>
          <div style="font-size:13px;font-weight:600">${_chatEscapeHtml(u.nombre || 'Sin nombre')}</div>
          <div style="font-size:11px;color:var(--gris-400)">${_chatEscapeHtml(u.rol || '')}</div>
        </div>
      </div>`;
    }
  } else {
    html += `<div style="padding:12px;text-align:center;color:var(--gris-400);font-size:12px">No hay otros usuarios en la empresa</div>`;
  }

  // Sección de chats de obra
  html += `</div>
        <div style="border-top:1px solid var(--gris-200);padding-top:16px">
          <div style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:8px">🏗️ Chat de obra</div>
          <p style="font-size:12px;color:var(--gris-400);margin:0">Los chats de obra se crean automáticamente al asignar operarios a una obra, o puedes crear uno desde la ficha de la obra.</p>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

async function _chatDesktopIniciarDirecto(userId, nombre) {
  // Cerrar modal
  document.querySelector('.chat-nuevo-modal')?.remove();

  // Buscar si ya existe
  const existente = _chatConversaciones.find(c =>
    c.tipo === 'directo' && (c._nombreOtro === nombre || c._otroUserId === userId)
  );

  if (existente) {
    chatAbrirConversacion(existente.id);
    return;
  }

  toast('Creando conversación...', 'info');
  const convId = await chatCrearDirecto(userId);
  if (convId) {
    await chatCargarConversaciones();
    _chatDesktopRenderConvList(_chatConversaciones);
    chatAbrirConversacion(convId);
  } else {
    toast('Error al crear la conversación', 'error');
  }
}

// ═══════════════════════════════════════════════
//  PARTICIPANTES (modal)
// ═══════════════════════════════════════════════
async function _chatDesktopVerParticipantes(convId) {
  const { data: parts } = await sb.from('chat_participantes')
    .select('usuario_id, rol')
    .eq('conversacion_id', convId);

  if (!parts) return;

  const userIds = parts.map(p => p.usuario_id);
  const { data: perfiles } = await sb.from('perfiles')
    .select('id, nombre, rol, avatar_url')
    .in('id', userIds);

  let html = `<div class="chat-nuevo-modal" onclick="if(event.target===this)this.remove()">
    <div class="chat-nuevo-card">
      <div style="padding:16px 20px;border-bottom:1px solid var(--gris-200);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">Participantes</h3>
        <button onclick="this.closest('.chat-nuevo-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--gris-400)">✕</button>
      </div>
      <div style="padding:12px 20px">`;

  for (const p of (perfiles || [])) {
    const partInfo = parts.find(x => x.usuario_id === p.id);
    const ini = chatIniciales(p.nombre || '?');
    const esAdmin = partInfo?.rol === 'admin';
    html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gris-100)">
      <div class="chat-avatar" style="background:var(--azul);width:36px;height:36px;font-size:12px">${ini}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${_chatEscapeHtml(p.nombre || 'Sin nombre')}</div>
        <div style="font-size:11px;color:var(--gris-400)">${_chatEscapeHtml(p.rol || '')}</div>
      </div>
      ${esAdmin ? '<span style="font-size:10px;padding:2px 8px;background:var(--azul-light);color:var(--azul);border-radius:4px;font-weight:600">Admin</span>' : ''}
    </div>`;
  }

  // Botón añadir participante
  html += `<div style="margin-top:12px;text-align:center">
    <button onclick="_chatDesktopAnadirParticipante(${convId})" class="btn btn-secondary btn-sm" style="font-size:12px">+ Añadir participante</button>
  </div>`;

  html += `</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function _chatDesktopAnadirParticipante(convId) {
  // Cerrar modal actual
  document.querySelector('.chat-nuevo-modal')?.remove();

  // Obtener participantes actuales
  const { data: partsActuales } = await sb.from('chat_participantes')
    .select('usuario_id')
    .eq('conversacion_id', convId);
  const yaEnChat = new Set((partsActuales || []).map(p => p.usuario_id));

  // Obtener todos los usuarios
  const { data: usuarios } = await sb.from('perfiles')
    .select('id, nombre, rol')
    .eq('empresa_id', EMPRESA.id)
    .order('nombre');

  const disponibles = (usuarios || []).filter(u => !yaEnChat.has(u.id));

  let html = `<div class="chat-nuevo-modal" onclick="if(event.target===this)this.remove()">
    <div class="chat-nuevo-card">
      <div style="padding:16px 20px;border-bottom:1px solid var(--gris-200);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">Añadir participante</h3>
        <button onclick="this.closest('.chat-nuevo-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--gris-400)">✕</button>
      </div>
      <div style="padding:12px 20px">`;

  if (disponibles.length) {
    for (const u of disponibles) {
      const ini = chatIniciales(u.nombre || '?');
      html += `<div onclick="_chatDesktopConfirmarAnadir(${convId},'${u.id}','${_chatEscapeHtml(u.nombre)}')"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-radius:8px;transition:background .12s"
        onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background=''">
        <div class="chat-avatar" style="background:var(--azul);width:36px;height:36px;font-size:12px">${ini}</div>
        <div>
          <div style="font-size:13px;font-weight:600">${_chatEscapeHtml(u.nombre || 'Sin nombre')}</div>
          <div style="font-size:11px;color:var(--gris-400)">${_chatEscapeHtml(u.rol || '')}</div>
        </div>
      </div>`;
    }
  } else {
    html += `<div style="padding:12px;text-align:center;color:var(--gris-400);font-size:12px">Todos los usuarios ya están en esta conversación</div>`;
  }

  html += `</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function _chatDesktopConfirmarAnadir(convId, userId, nombre) {
  document.querySelector('.chat-nuevo-modal')?.remove();
  await chatAddParticipante(convId, userId);
  toast(`${nombre} añadido al chat`, 'ok');
}

// ═══════════════════════════════════════════════
//  FILTRAR CONVERSACIONES (búsqueda)
// ═══════════════════════════════════════════════
function _chatFiltrarConvs() {
  const q = (document.getElementById('chatSearchConv')?.value || '').toLowerCase().trim();
  if (!q) {
    _chatDesktopRenderConvList(_chatConversaciones);
    return;
  }
  const filtered = _chatConversaciones.filter(c => {
    const titulo = (c.titulo || c._nombreOtro || '').toLowerCase();
    const preview = (c.ultimo_mensaje_texto || '').toLowerCase();
    return titulo.includes(q) || preview.includes(q);
  });
  _chatDesktopRenderConvList(filtered);
}

// ═══════════════════════════════════════════════
//  VOLVER A LISTA (mobile responsive)
// ═══════════════════════════════════════════════
function _chatDesktopVolverLista() {
  const wrap = document.querySelector('.chat-desktop-wrap');
  if (wrap) wrap.classList.remove('chat-conv-open');

  _chatConvActivaDesktop = null;
  chatDesuscribirConversacion();

  const emptyState = document.getElementById('chatEmptyState');
  const convView = document.getElementById('chatConvView');
  if (emptyState) emptyState.style.display = 'flex';
  if (convView) convView.style.display = 'none';

  _chatDesktopRenderConvList(_chatConversaciones);
}

// ═══════════════════════════════════════════════
//  CALLBACKS — Realtime
// ═══════════════════════════════════════════════
function _chatDesktopOnConvUpdate(payload) {
  // Refrescar lista
  _chatDesktopRenderConvList(_chatConversaciones);
}

function _chatDesktopOnNewMessage(msg) {
  // Nuevo mensaje en otra conversación (ya gestionado en chat.js: unread++)
  _chatDesktopRenderConvList(_chatConversaciones);
  _chatDesktopActualizarBadge();
}

function _chatDesktopOnMsgInConv(msg) {
  // Nuevo mensaje en la conversación activa
  const area = document.getElementById('chatMsgArea');
  if (!area) return;

  // Si solo tenía el empty state, limpiar
  if (area.querySelector('.chat-date-sep') === null && _chatMensajes.length <= 1) {
    area.innerHTML = '';
  }

  const esMio = msg.autor_id === CU.id;

  // Añadir separador de fecha si necesario
  const msgDate = new Date(msg.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
  const lastSep = area.querySelectorAll('.chat-date-sep span');
  const lastDateText = lastSep.length ? lastSep[lastSep.length - 1].textContent : '';
  if (msgDate !== lastDateText) {
    area.insertAdjacentHTML('beforeend', `<div class="chat-date-sep"><span>${msgDate}</span></div>`);
  }

  area.insertAdjacentHTML('beforeend', chatRenderMensaje(msg, esMio));
  _chatDesktopScrollBottom();

  // Actualizar lista lateral
  _chatDesktopRenderConvList(_chatConversaciones);
}

// ═══════════════════════════════════════════════
//  BADGE SIDEBAR
// ═══════════════════════════════════════════════
function _chatDesktopActualizarBadge() {
  const total = chatGetTotalUnread();
  const badge = document.getElementById('chat-badge');
  if (badge) {
    badge.textContent = total || '';
    badge.style.display = total > 0 ? '' : 'none';
  }
}
