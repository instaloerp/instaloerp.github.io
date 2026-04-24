-- ═══════════════════════════════════════════════════════════════
-- MENSAJERÍA INTERNA — Chat tipo WhatsApp para instaloERP
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. CONVERSACIONES (un registro por chat: grupo de obra o directo 1:1)
CREATE TABLE IF NOT EXISTS chat_conversaciones (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('obra', 'directo')),
  trabajo_id      BIGINT REFERENCES trabajos(id) ON DELETE SET NULL,
  titulo          TEXT,
  avatar_url      TEXT,
  ultimo_mensaje_at   TIMESTAMPTZ DEFAULT now(),
  ultimo_mensaje_texto TEXT,
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_conv_empresa ON chat_conversaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_trabajo ON chat_conversaciones(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_ultimo ON chat_conversaciones(empresa_id, ultimo_mensaje_at DESC);

-- 2. PARTICIPANTES (vincula usuarios a conversaciones)
CREATE TABLE IF NOT EXISTS chat_participantes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id BIGINT NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  ultimo_leido_at TIMESTAMPTZ DEFAULT now(),
  silenciado      BOOLEAN DEFAULT false,
  rol             TEXT DEFAULT 'miembro' CHECK (rol IN ('admin', 'miembro')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (conversacion_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_part_conv ON chat_participantes(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_chat_part_user ON chat_participantes(usuario_id);

-- 3. MENSAJES
CREATE TABLE IF NOT EXISTS chat_mensajes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id BIGINT NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
  autor_id        UUID NOT NULL,
  autor_nombre    TEXT,
  tipo            TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'foto', 'gps', 'documento', 'sistema')),
  contenido       TEXT,
  archivo_url     TEXT,
  archivo_nombre  TEXT,
  archivo_size    BIGINT,
  archivo_mime    TEXT,
  latitud         DOUBLE PRECISION,
  longitud        DOUBLE PRECISION,
  direccion_texto TEXT,
  respuesta_a_id  BIGINT REFERENCES chat_mensajes(id) ON DELETE SET NULL,
  editado         BOOLEAN DEFAULT false,
  eliminado       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_mensajes(conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_autor ON chat_mensajes(autor_id);

-- 4. SUSCRIPCIONES PUSH (para notificaciones offline)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id      UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  device_info     TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(usuario_id);

-- 5. TRIGGER: Actualizar último mensaje en conversación (denormalización para rendimiento)
CREATE OR REPLACE FUNCTION update_ultimo_mensaje()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversaciones
  SET ultimo_mensaje_at = NEW.created_at,
      ultimo_mensaje_texto = CASE
        WHEN NEW.tipo = 'texto' THEN LEFT(NEW.contenido, 100)
        WHEN NEW.tipo = 'foto' THEN '📷 Foto'
        WHEN NEW.tipo = 'gps' THEN '📍 Ubicación'
        WHEN NEW.tipo = 'documento' THEN '📄 ' || COALESCE(NEW.archivo_nombre, 'Documento')
        WHEN NEW.tipo = 'sistema' THEN LEFT(NEW.contenido, 100)
        ELSE NEW.contenido
      END
  WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_ultimo_mensaje ON chat_mensajes;
CREATE TRIGGER trg_chat_ultimo_mensaje
AFTER INSERT ON chat_mensajes
FOR EACH ROW
EXECUTE FUNCTION update_ultimo_mensaje();

-- 6. FUNCIÓN RPC: Contar mensajes no leídos por conversación
CREATE OR REPLACE FUNCTION get_unread_counts(p_user_id UUID)
RETURNS TABLE(conversacion_id BIGINT, unread_count BIGINT) AS $$
  SELECT cp.conversacion_id,
         COUNT(cm.id)::BIGINT AS unread_count
  FROM chat_participantes cp
  LEFT JOIN chat_mensajes cm ON cm.conversacion_id = cp.conversacion_id
    AND cm.created_at > cp.ultimo_leido_at
    AND cm.autor_id != p_user_id
    AND cm.eliminado = false
  WHERE cp.usuario_id = p_user_id
  GROUP BY cp.conversacion_id
  HAVING COUNT(cm.id) > 0;
$$ LANGUAGE sql STABLE;

-- 7. REALTIME: Habilitar para las tablas de chat
ALTER PUBLICATION supabase_realtime ADD TABLE chat_mensajes;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversaciones;

-- 8. STORAGE: Bucket para archivos del chat
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-archivos', 'chat-archivos', true)
ON CONFLICT (id) DO NOTHING;

-- 9. RLS: Habilitar y crear políticas básicas
ALTER TABLE chat_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas (para anon y authenticated, como el resto del ERP)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_conversaciones','chat_participantes','chat_mensajes','push_subscriptions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_all" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Storage policy para chat-archivos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'chat_archivos_public'
  ) THEN
    CREATE POLICY chat_archivos_public ON storage.objects
      FOR ALL USING (bucket_id = 'chat-archivos')
      WITH CHECK (bucket_id = 'chat-archivos');
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- FIN — Mensajería lista para usar
-- ═══════════════════════════════════════════════
