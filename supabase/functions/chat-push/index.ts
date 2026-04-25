// ════════════════════════════════════════════════════════════════
//  Edge Function: chat-push — Web Push Notifications para mensajería
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  POST /chat-push  (llamado por Database Webhook en INSERT de chat_mensajes)
//  Body: { type:'INSERT', table:'chat_mensajes', record:{...} }
//
//  Env vars requeridas:
//    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (generadas con web-push)
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas en Supabase)
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:jordi@jordiinstalacions.es';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    }});
  }

  try {
    const body = await req.json();
    const msg = body.record || body;

    if (!msg.conversacion_id || !msg.autor_id) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400 });
    }

    // Admin client (bypasses RLS)
    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Participantes de la conversación (excluyendo al autor del mensaje)
    const { data: parts } = await sbAdmin
      .from('chat_participantes')
      .select('usuario_id')
      .eq('conversacion_id', msg.conversacion_id)
      .neq('usuario_id', msg.autor_id);

    if (!parts?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no recipients' }));
    }

    // 2. Suscripciones push de esos usuarios
    const { data: subs } = await sbAdmin
      .from('push_suscripciones')
      .select('*')
      .in('usuario_id', parts.map((p: any) => p.usuario_id));

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no push subs' }));
    }

    // 3. Payload de la notificación
    let texto = msg.contenido || '';
    if (msg.tipo === 'foto') texto = '📷 Foto';
    else if (msg.tipo === 'gps') texto = '📍 Ubicación compartida';
    else if (msg.tipo === 'documento') texto = '📄 ' + (msg.archivo_nombre || 'Documento');

    const payload = JSON.stringify({
      title: '💬 ' + (msg.autor_nombre || 'Nuevo mensaje'),
      body: texto,
      data: { conversacion_id: msg.conversacion_id, url: '/app.html' }
    });

    // 4. Enviar push a cada suscripción
    let sent = 0;
    const expired: number[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400 }
        );
        sent++;
      } catch (e: any) {
        console.error(`Push failed for sub ${sub.id}:`, e?.statusCode, e?.body);
        // 410 Gone o 404 = suscripción expirada
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          expired.push(sub.id);
        }
      }
    }

    // 5. Limpiar suscripciones expiradas
    if (expired.length) {
      await sbAdmin.from('push_suscripciones').delete().in('id', expired);
    }

    return new Response(JSON.stringify({ sent, expired: expired.length, total: subs.length }));
  } catch (e) {
    console.error('chat-push error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
