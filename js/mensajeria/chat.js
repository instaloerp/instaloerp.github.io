// ═══════════════════════════════════════════════
// MENSAJERÍA INTERNA — Chat tipo WhatsApp
// Módulo compartido entre ERP escritorio y app móvil
// ═══════════════════════════════════════════════

let _chatConversaciones = [];
let _chatMensajes = [];
let _chatConvActual = null;
let _chatUnread = {};
let _chatRealtimeChannel = null;
let _chatConvChannel = null;
const CHAT_PAGE_SIZE = 50;

// ═══════════════════════════════════════════════
//  CARGAR CONVERSACIONES
// ═══════════════════════════════════════════════
async function chatCargarConversaciones() {
  if (!EMPRESA || !CU) return [];
  // Obtener conversaciones donde el usuario es participante
  const { data: participaciones } = await sb.from('chat_participantes')
    .select('conversacion_id, ultimo_leido_at, silenciado')
    .eq('usuario_id', CU.id);
  if (!participaciones || !participaciones.length) { _chatConversaciones = []; return []; }

  const convIds = participaciones.map(p => p.conversacion_id);
  const { data: convs } = await sb.from('chat_conversaciones')
    .select('*')
    .in('id', convIds)
    .eq('empresa_id', EMPRESA.id)
    .order('ultimo_mensaje_at', { ascending: false });

  _chatConversaciones = (convs || []).map(c => {
    const part = participaciones.find(p => p.conversacion_id === c.id);
    return { ...c, ultimo_leido_at: part?.ultimo_leido_at, silenciado: part?.silenciado };
  });

  // Cargar unread counts
  await chatCargarUnread();

  // Para conversaciones directas, cargar nombre del otro participante
  await _chatCargarNombresDirectos();

  return _chatConversaciones;
}

async function _chatCargarNombresDirectos() {
  const directas = _chatConversaciones.filter(c => c.tipo === 'directo');
  if (!directas.length) return;

  const convIds = directas.map(c => c.id);
  const { data: parts } = await sb.from('chat_participantes')
    .select('conversacion_id, usuario_id')
    .in('conversacion_id', convIds);

  if (!parts) return;
  const otherUserIds = new Set();
  for (const p of parts) {
    if (p.usuario_id !== CU.id) otherUserIds.add(p.usuario_id);
  }

  if (!otherUserIds.size) return;
  const { data: perfiles } = await sb.from('perfiles')
    .select('id, nombre, avatar_url')
    .in('id', Array.from(otherUserIds));

  const perfilMap = {};
  (perfiles || []).forEach(p => { perfilMap[p.id] = p; });

  for (const c of directas) {
    const otherParts = parts.filter(p => p.conversacion_id === c.id && p.usuario_id !== CU.id);
    if (otherParts.length === 1) {
      const perfil = perfilMap[otherParts[0].usuario_id];
      c._otroUserId = otherParts[0].usuario_id;
      if (perfil) {
        c._nombreOtro = perfil.nombre;
        c._avatarOtro = perfil.avatar_url;
        if (!c.titulo) c.titulo = perfil.nombre;
      }
    }
  }
}

async function chatCargarUnread() {
  try {
    const { data } = await sb.rpc('get_unread_counts', { p_user_id: CU.id });
    _chatUnread = {};
    (data || []).forEach(r => { _chatUnread[r.conversacion_id] = r.unread_count; });
  } catch (e) {
    console.warn('[Chat] Error cargando unreads:', e);
  }
}

function chatGetTotalUnread() {
  return Object.values(_chatUnread).reduce((a, b) => a + b, 0);
}

// ═══════════════════════════════════════════════
//  CARGAR MENSAJES DE UNA CONVERSACIÓN
// ═══════════════════════════════════════════════
async function chatCargarMensajes(convId, limit) {
  const { data } = await sb.from('chat_mensajes')
    .select('*')
    .eq('conversacion_id', convId)
    .eq('eliminado', false)
    .order('created_at', { ascending: true })
    .limit(limit || CHAT_PAGE_SIZE);
  _chatMensajes = data || [];
  return _chatMensajes;
}

async function chatCargarMasAntiguos(convId) {
  if (!_chatMensajes.length) return [];
  const oldest = _chatMensajes[0].created_at;
  const { data } = await sb.from('chat_mensajes')
    .select('*')
    .eq('conversacion_id', convId)
    .eq('eliminado', false)
    .lt('created_at', oldest)
    .order('created_at', { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  const older = (data || []).reverse();
  _chatMensajes = [...older, ..._chatMensajes];
  return older;
}

// ═══════════════════════════════════════════════
//  MARCAR COMO LEÍDO
// ═══════════════════════════════════════════════
async function chatMarcarLeido(convId) {
  await sb.from('chat_participantes')
    .update({ ultimo_leido_at: new Date().toISOString() })
    .eq('conversacion_id', convId)
    .eq('usuario_id', CU.id);
  delete _chatUnread[convId];
}

// ═══════════════════════════════════════════════
//  ENVIAR MENSAJES
// ═══════════════════════════════════════════════
async function chatEnviarTexto(convId, texto) {
  if (!texto?.trim()) return null;
  const { data, error } = await sb.from('chat_mensajes').insert({
    conversacion_id: convId,
    autor_id: CU.id,
    autor_nombre: CP?.nombre || CU.email,
    tipo: 'texto',
    contenido: texto.trim()
  }).select().single();
  if (error) { console.error('[Chat] Error enviando:', error); return null; }
  _chatCallPush(convId, data);
  return data;
}

async function chatEnviarFoto(convId, file) {
  if (!file) return null;
  const blob = await _chatComprimirImagen(file, 1200, 0.8);
  const ext = file.name?.split('.').pop() || 'jpg';
  const filename = `chat/${EMPRESA.id}/${convId}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from('chat-archivos').upload(filename, blob, {
    contentType: file.type || 'image/jpeg'
  });
  if (upErr) { toast('Error al subir foto', 'error'); return null; }
  const { data: urlData } = sb.storage.from('chat-archivos').getPublicUrl(filename);
  const { data, error } = await sb.from('chat_mensajes').insert({
    conversacion_id: convId,
    autor_id: CU.id,
    autor_nombre: CP?.nombre || CU.email,
    tipo: 'foto',
    archivo_url: urlData.publicUrl,
    archivo_nombre: file.name,
    archivo_size: blob.size,
    archivo_mime: file.type || 'image/jpeg'
  }).select().single();
  if (error) { console.error('[Chat] Error enviando foto:', error); return null; }
  _chatCallPush(convId, data);
  return data;
}

async function chatEnviarDocumento(convId, file) {
  if (!file) return null;
  if (file.size > 20 * 1024 * 1024) { toast('Archivo demasiado grande (máx 20MB)', 'error'); return null; }
  const filename = `chat/${EMPRESA.id}/${convId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await sb.storage.from('chat-archivos').upload(filename, file, {
    contentType: file.type
  });
  if (upErr) { toast('Error al subir documento', 'error'); return null; }
  const { data: urlData } = sb.storage.from('chat-archivos').getPublicUrl(filename);
  const { data, error } = await sb.from('chat_mensajes').insert({
    conversacion_id: convId,
    autor_id: CU.id,
    autor_nombre: CP?.nombre || CU.email,
    tipo: 'documento',
    archivo_url: urlData.publicUrl,
    archivo_nombre: file.name,
    archivo_size: file.size,
    archivo_mime: file.type
  }).select().single();
  if (error) { console.error('[Chat] Error enviando documento:', error); return null; }
  _chatCallPush(convId, data);
  return data;
}

async function chatEnviarUbicacion(convId) {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Reverse geocode (best-effort)
        let direccion = null;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`);
          const geo = await res.json();
          direccion = geo.display_name || null;
        } catch (e) {}
        const { data, error } = await sb.from('chat_mensajes').insert({
          conversacion_id: convId,
          autor_id: CU.id,
          autor_nombre: CP?.nombre || CU.email,
          tipo: 'gps',
          latitud: lat,
          longitud: lng,
          direccion_texto: direccion,
          contenido: `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        }).select().single();
        if (error) { toast('Error al enviar ubicación', 'error'); resolve(null); return; }
        _chatCallPush(convId, data);
        resolve(data);
      },
      (err) => {
        toast('No se pudo obtener la ubicación GPS', 'error');
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ═══════════════════════════════════════════════
//  CREAR / BUSCAR CONVERSACIONES
// ═══════════════════════════════════════════════
async function chatCrearDirecto(otroUsuarioId) {
  // Buscar si ya existe una conversación directa entre los dos
  const { data: misConvs } = await sb.from('chat_participantes')
    .select('conversacion_id')
    .eq('usuario_id', CU.id);
  if (misConvs && misConvs.length) {
    const { data: suyas } = await sb.from('chat_participantes')
      .select('conversacion_id')
      .eq('usuario_id', otroUsuarioId)
      .in('conversacion_id', misConvs.map(c => c.conversacion_id));
    if (suyas && suyas.length) {
      // Verificar que es de tipo 'directo'
      for (const s of suyas) {
        const conv = _chatConversaciones.find(c => c.id === s.conversacion_id && c.tipo === 'directo');
        if (conv) return conv.id;
        // Si no está en cache, buscar en DB
        const { data: check } = await sb.from('chat_conversaciones')
          .select('id')
          .eq('id', s.conversacion_id)
          .eq('tipo', 'directo')
          .single();
        if (check) return check.id;
      }
    }
  }

  // No existe, crear nueva
  const { data: conv, error } = await sb.from('chat_conversaciones').insert({
    empresa_id: EMPRESA.id,
    tipo: 'directo',
    creado_por: CU.id
  }).select().single();
  if (error || !conv) { toast('Error al crear conversación', 'error'); return null; }

  // Añadir participantes
  await sb.from('chat_participantes').insert([
    { conversacion_id: conv.id, usuario_id: CU.id, rol: 'admin' },
    { conversacion_id: conv.id, usuario_id: otroUsuarioId, rol: 'miembro' }
  ]);

  return conv.id;
}

async function chatEnsureObraChat(trabajoId, titulo) {
  // Buscar si ya existe
  const { data: existing } = await sb.from('chat_conversaciones')
    .select('id')
    .eq('empresa_id', EMPRESA.id)
    .eq('tipo', 'obra')
    .eq('trabajo_id', trabajoId)
    .maybeSingle();
  if (existing) return existing.id;

  // Crear
  const { data: conv, error } = await sb.from('chat_conversaciones').insert({
    empresa_id: EMPRESA.id,
    tipo: 'obra',
    trabajo_id: trabajoId,
    titulo: titulo || `Obra #${trabajoId}`,
    creado_por: CU.id
  }).select().single();
  if (error || !conv) return null;

  // Añadir al creador como admin
  await sb.from('chat_participantes').insert({
    conversacion_id: conv.id, usuario_id: CU.id, rol: 'admin'
  });

  return conv.id;
}

async function chatAddParticipante(convId, userId) {
  const { error } = await sb.from('chat_participantes').upsert({
    conversacion_id: convId,
    usuario_id: userId,
    rol: 'miembro'
  }, { onConflict: 'conversacion_id,usuario_id' });
  if (!error) {
    // Mensaje de sistema
    const { data: perfil } = await sb.from('perfiles').select('nombre').eq('id', userId).single();
    await sb.from('chat_mensajes').insert({
      conversacion_id: convId,
      autor_id: CU.id,
      autor_nombre: 'Sistema',
      tipo: 'sistema',
      contenido: `${perfil?.nombre || 'Usuario'} se ha unido al chat`
    });
  }
}

// ═══════════════════════════════════════════════
//  REALTIME
// ═══════════════════════════════════════════════
function chatIniciarRealtime() {
  if (_chatRealtimeChannel) return;
  // Pedir permiso de notificaciones nativas
  chatPedirPermisoNotificaciones();
  _chatRealtimeChannel = sb.channel('chat-global')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_conversaciones',
      filter: `empresa_id=eq.${EMPRESA.id}`
    }, (payload) => {
      // Actualizar lista de conversaciones
      if (payload.eventType === 'UPDATE') {
        const idx = _chatConversaciones.findIndex(c => c.id === payload.new.id);
        if (idx >= 0) {
          _chatConversaciones[idx] = { ..._chatConversaciones[idx], ...payload.new };
          // Re-sort
          _chatConversaciones.sort((a, b) => new Date(b.ultimo_mensaje_at) - new Date(a.ultimo_mensaje_at));
        }
      }
      if (typeof _chatOnConvUpdate === 'function') _chatOnConvUpdate(payload);
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_mensajes'
    }, (payload) => {
      const msg = payload.new;
      // No notificar mis propios mensajes
      if (msg.autor_id === CU.id) return;
      // Si no estoy en esa conversación, ignorar
      if (!_chatConversaciones.find(c => c.id === msg.conversacion_id)) return;
      // Incrementar unread si no estamos viendo esa conversación
      if (_chatConvActual !== msg.conversacion_id) {
        _chatUnread[msg.conversacion_id] = (_chatUnread[msg.conversacion_id] || 0) + 1;
        // Notificar
        _chatNotificar(msg);
      }
      if (typeof _chatOnNewMessage === 'function') _chatOnNewMessage(msg);
    })
    .subscribe();
}

function chatSuscribirConversacion(convId) {
  chatDesuscribirConversacion();
  _chatConvActual = convId;
  _chatConvChannel = sb.channel(`chat-conv-${convId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_mensajes',
      filter: `conversacion_id=eq.${convId}`
    }, (payload) => {
      const msg = payload.new;
      // Añadir al array local si no existe
      if (!_chatMensajes.find(m => m.id === msg.id)) {
        _chatMensajes.push(msg);
      }
      // Marcar como leído automáticamente
      chatMarcarLeido(convId);
      if (typeof _chatOnMsgInConv === 'function') _chatOnMsgInConv(msg);
    })
    .subscribe();
}

function chatDesuscribirConversacion() {
  if (_chatConvChannel) {
    sb.removeChannel(_chatConvChannel);
    _chatConvChannel = null;
  }
  _chatConvActual = null;
}

// ═══════════════════════════════════════════════
//  NOTIFICACIONES
// ═══════════════════════════════════════════════
function _chatNotificar(msg) {
  const conv = _chatConversaciones.find(c => c.id === msg.conversacion_id);
  const titulo = conv?.titulo || msg.autor_nombre || 'Nuevo mensaje';
  let texto = msg.contenido || '';
  if (msg.tipo === 'foto') texto = '📷 Foto';
  else if (msg.tipo === 'gps') texto = '📍 Ubicación compartida';
  else if (msg.tipo === 'documento') texto = '📄 ' + (msg.archivo_nombre || 'Documento');

  // 1. Toast dentro de la app
  if (typeof toast === 'function') {
    toast(`💬 ${titulo}: ${texto}`, 'info');
  }

  // 2. Sonido de notificación (doble tono tipo WhatsApp)
  _chatSonarNotificacion();

  // 3. Notificación nativa del navegador (aparece en el sistema operativo)
  _chatNotificacionNativa(titulo, texto, msg.conversacion_id);

  _chatActualizarBadge();
}

// Pedir permiso de notificaciones al iniciar el chat
function chatPedirPermisoNotificaciones() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function _chatNotificacionNativa(titulo, texto, convId) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    if (Notification.permission === 'default') Notification.requestPermission();
    return;
  }

  try {
    const n = new Notification('💬 ' + titulo, {
      body: texto,
      icon: 'assets/icon-180.png',
      badge: 'assets/icon-180.png',
      tag: 'chat-' + convId, // Agrupa por conversación (evita spam)
      renotify: true,
      vibrate: [200, 100, 200]
    });
    n.onclick = () => {
      window.focus();
      // Navegar a la conversación
      if (typeof goPage === 'function') {
        goPage('mensajes');
        setTimeout(() => {
          if (typeof chatAbrirConversacion === 'function') chatAbrirConversacion(convId);
        }, 300);
      } else if (typeof navigateTo === 'function') {
        navigateTo('chat');
        setTimeout(() => {
          if (typeof _chatMobileAbrir === 'function') _chatMobileAbrir(convId);
        }, 300);
      }
      n.close();
    };
    // Auto-cerrar a los 8 segundos
    setTimeout(() => n.close(), 8000);
  } catch (e) {}
}

// AudioContext persistente — se reutiliza y se desbloquea con interacción del usuario
let _chatAudioCtx = null;

function _chatGetAudioCtx() {
  if (!_chatAudioCtx) {
    _chatAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resumir si está suspendido (política de autoplay del navegador)
  if (_chatAudioCtx.state === 'suspended') {
    _chatAudioCtx.resume();
  }
  return _chatAudioCtx;
}

// Desbloquear AudioContext con cualquier interacción del usuario
(function() {
  const _unlock = () => {
    _chatGetAudioCtx();
    document.removeEventListener('click', _unlock);
    document.removeEventListener('touchstart', _unlock);
    document.removeEventListener('keydown', _unlock);
  };
  document.addEventListener('click', _unlock, { once: false });
  document.addEventListener('touchstart', _unlock, { once: false });
  document.addEventListener('keydown', _unlock, { once: false });
})();

function _chatSonarNotificacion() {
  try {
    const ctx = _chatGetAudioCtx();
    if (ctx.state === 'suspended') return; // No se puede reproducir aún

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);

    // Primer tono
    o1.type = 'sine';
    o1.frequency.setValueAtTime(880, ctx.currentTime);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.12);

    // Segundo tono (más agudo, tipo WhatsApp)
    o2.type = 'sine';
    o2.frequency.setValueAtTime(1320, ctx.currentTime + 0.15);
    o2.start(ctx.currentTime + 0.15);
    o2.stop(ctx.currentTime + 0.3);

    // Volumen
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.setValueAtTime(0.25, ctx.currentTime + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  } catch (e) { console.warn('Chat sound error:', e); }
}

function _chatActualizarBadge() {
  const total = chatGetTotalUnread();
  // Desktop badge
  const sbBadge = document.getElementById('chat-sb-badge');
  if (sbBadge) {
    sbBadge.textContent = total > 99 ? '99+' : String(total);
    sbBadge.style.display = total > 0 ? 'inline-flex' : 'none';
  }
  // Mobile badge
  const mobBadge = document.getElementById('chatBadge');
  if (mobBadge) {
    mobBadge.textContent = total > 99 ? '99+' : String(total);
    mobBadge.style.display = total > 0 ? '' : 'none';
  }
}

// ═══════════════════════════════════════════════
//  PUSH NOTIFICATIONS (llamar a Edge Function)
// ═══════════════════════════════════════════════
async function _chatCallPush(convId, msg) {
  try {
    const session = await sb.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return;
    const url = sb.supabaseUrl || '';
    fetch(`${url}/functions/v1/push-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        conversacion_id: convId,
        mensaje_id: msg.id,
        autor_nombre: msg.autor_nombre,
        contenido: msg.contenido,
        tipo: msg.tipo
      })
    }).catch(() => {});
  } catch (e) {}
}

// ═══════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════
function _chatComprimirImagen(file, maxDim, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => resolve(b), 'image/jpeg', quality || 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

function chatFormatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (d.toDateString() === hoy.toDateString()) return `${hh}:${mm}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${hh}:${mm}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`;
}

function chatFormatFechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) {
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function chatIniciales(nombre) {
  if (!nombre) return '?';
  const parts = nombre.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : nombre.substring(0, 2).toUpperCase();
}

// ═══════════════════════════════════════════════
//  RENDER HELPERS (compartidos)
// ═══════════════════════════════════════════════
function chatRenderMensaje(msg, esMio) {
  const align = esMio ? 'right' : 'left';
  const bg = esMio ? 'var(--azul-light)' : 'var(--gris-50)';
  const borderR = esMio ? '16px 4px 16px 16px' : '4px 16px 16px 16px';

  let body = '';
  switch (msg.tipo) {
    case 'texto':
      body = `<div style="font-size:14px;line-height:1.5;word-break:break-word">${_chatEscapeHtml(msg.contenido || '')}</div>`;
      break;
    case 'foto':
      body = `<img src="${msg.archivo_url}" style="max-width:240px;max-height:280px;border-radius:8px;cursor:pointer;display:block" onclick="window.open('${msg.archivo_url}','_blank')" loading="lazy">`;
      if (msg.contenido) body += `<div style="font-size:13px;margin-top:4px">${_chatEscapeHtml(msg.contenido)}</div>`;
      break;
    case 'gps':
      body = chatRenderGps(msg);
      break;
    case 'documento':
      body = chatRenderDocumento(msg);
      break;
    case 'sistema':
      return `<div style="text-align:center;padding:4px 0;margin:8px 0">
        <span style="background:var(--gris-100);color:var(--gris-500);font-size:11px;padding:3px 10px;border-radius:10px">${_chatEscapeHtml(msg.contenido || '')}</span>
      </div>`;
  }

  const hora = chatFormatFecha(msg.created_at);
  const nombre = !esMio ? `<div style="font-size:11px;font-weight:600;color:var(--azul);margin-bottom:2px">${_chatEscapeHtml(msg.autor_nombre || '')}</div>` : '';

  return `<div style="display:flex;justify-content:flex-${esMio ? 'end' : 'start'};padding:2px 12px;margin:2px 0" data-msg-id="${msg.id}">
    <div style="max-width:80%;background:${bg};padding:8px 12px;border-radius:${borderR}">
      ${nombre}${body}
      <div style="font-size:10px;color:var(--gris-400);text-align:right;margin-top:2px">${hora}</div>
    </div>
  </div>`;
}

function chatRenderGps(msg) {
  const gmapsUrl = `https://www.google.com/maps?q=${msg.latitud},${msg.longitud}`;
  const wazeUrl = `https://waze.com/ul?ll=${msg.latitud},${msg.longitud}&navigate=yes`;
  return `<div style="min-width:200px">
    <div style="text-align:center;font-size:40px;padding:8px 0">📍</div>
    <div style="font-size:11px;color:var(--gris-500);text-align:center">${Number(msg.latitud).toFixed(5)}, ${Number(msg.longitud).toFixed(5)}</div>
    ${msg.direccion_texto ? `<div style="font-size:12px;text-align:center;margin-top:4px;color:var(--gris-600)">${_chatEscapeHtml(msg.direccion_texto)}</div>` : ''}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button onclick="window.open('${gmapsUrl}','_blank')" style="flex:1;padding:6px;border:1px solid var(--azul);background:var(--azul);color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Google Maps</button>
      <button onclick="window.open('${wazeUrl}','_blank')" style="flex:1;padding:6px;border:1px solid var(--gris-300);background:#fff;color:var(--gris-700);border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Waze</button>
    </div>
  </div>`;
}

function chatRenderDocumento(msg) {
  const size = msg.archivo_size ? (msg.archivo_size < 1024 * 1024 ? Math.round(msg.archivo_size / 1024) + ' KB' : (msg.archivo_size / (1024 * 1024)).toFixed(1) + ' MB') : '';
  return `<div onclick="window.open('${msg.archivo_url}','_blank')" style="cursor:pointer;display:flex;align-items:center;gap:8px;min-width:180px">
    <div style="font-size:28px;flex-shrink:0">📄</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_chatEscapeHtml(msg.archivo_nombre || 'Documento')}</div>
      <div style="font-size:11px;color:var(--gris-400)">${size}</div>
    </div>
  </div>`;
}

function _chatEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════
//  RENDER: INPUT BAR (compartido)
// ═══════════════════════════════════════════════
function chatRenderInputBar(convId) {
  return `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-top:1px solid var(--gris-200);background:#fff">
    <button onclick="_chatAdjuntarFoto(${convId})" style="background:none;border:none;cursor:pointer;font-size:20px;padding:4px;flex-shrink:0" title="Enviar foto">📷</button>
    <button onclick="_chatAdjuntarDoc(${convId})" style="background:none;border:none;cursor:pointer;font-size:20px;padding:4px;flex-shrink:0" title="Adjuntar documento">📎</button>
    <button onclick="_chatEnviarGps(${convId})" style="background:none;border:none;cursor:pointer;font-size:20px;padding:4px;flex-shrink:0" title="Enviar ubicación">📍</button>
    <input type="text" id="chatInput" placeholder="Escribe un mensaje..." style="flex:1;padding:8px 14px;border:1px solid var(--gris-200);border-radius:20px;font-size:14px;font-family:var(--font);outline:none" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_chatEnviarDesdeInput(${convId})}">
    <button onclick="_chatEnviarDesdeInput(${convId})" style="background:var(--azul);color:#fff;border:none;cursor:pointer;width:36px;height:36px;border-radius:50%;font-size:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center">➤</button>
  </div>`;
}

async function _chatEnviarDesdeInput(convId) {
  const input = document.getElementById('chatInput');
  if (!input || !input.value.trim()) return;
  const texto = input.value;
  input.value = '';
  input.focus();
  await chatEnviarTexto(convId, texto);
}

function _chatAdjuntarFoto(convId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.onchange = async () => {
    if (!input.files[0]) return;
    toast('Enviando foto...', 'info');
    await chatEnviarFoto(convId, input.files[0]);
  };
  input.click();
}

function _chatAdjuntarDoc(convId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';
  input.onchange = async () => {
    if (!input.files[0]) return;
    toast('Subiendo documento...', 'info');
    await chatEnviarDocumento(convId, input.files[0]);
  };
  input.click();
}

async function _chatEnviarGps(convId) {
  toast('Obteniendo ubicación GPS...', 'info');
  await chatEnviarUbicacion(convId);
}

// ═══════════════════════════════════════════════
//  RENDER: LISTA DE CONVERSACIONES (compartido)
// ═══════════════════════════════════════════════
function chatRenderConvItem(conv) {
  const unread = _chatUnread[conv.id] || 0;
  const titulo = conv.titulo || conv._nombreOtro || 'Sin título';
  const ico = conv.tipo === 'obra' ? '🏗️' : '👤';
  const preview = conv.ultimo_mensaje_texto || 'Sin mensajes';
  const fecha = chatFormatFechaCorta(conv.ultimo_mensaje_at);
  const iniciales = chatIniciales(titulo);
  const bgColor = conv.tipo === 'obra' ? 'var(--verde)' : 'var(--azul)';

  return `<div class="chat-conv-item" onclick="chatAbrirConversacion(${conv.id})" style="display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;transition:background .12s;border-bottom:1px solid var(--gris-100)${unread ? ';background:var(--azul-light)' : ''}" onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background='${unread ? 'var(--azul-light)' : ''}'">
    <div style="width:42px;height:42px;border-radius:50%;background:${bgColor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${iniciales}</div>
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

// Callbacks que cada plataforma (desktop/mobile) sobreescribe
let _chatOnConvUpdate = null;
let _chatOnNewMessage = null;
let _chatOnMsgInConv = null;
