-- ════════════════════════════════════════════════════════════════
--  Eliminar trigger pg_net de chat_push
--  (se reemplaza por Database Webhook configurado desde el Dashboard)
-- ════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS chat_push_trigger ON chat_mensajes;
DROP FUNCTION IF EXISTS notify_chat_push();
