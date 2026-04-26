-- Habilitar REPLICA IDENTITY FULL para que Supabase Realtime
-- incluya payload.old con todos los campos en los UPDATE events.
-- Necesario para detectar cambios en first_viewed_at (tracking de documentos).
ALTER TABLE documentos_compartidos REPLICA IDENTITY FULL;
