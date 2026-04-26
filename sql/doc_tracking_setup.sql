-- ═══════════════════════════════════════════════════════════════
-- TRACKING DE DOCUMENTOS COMPARTIDOS — instaloERP
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. TABLA PRINCIPAL
CREATE TABLE IF NOT EXISTS documentos_compartidos (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo_documento        TEXT NOT NULL,
  documento_id          TEXT NOT NULL,
  documento_numero      TEXT DEFAULT '',
  destinatario_nombre   TEXT,
  destinatario_email    TEXT,
  destinatario_telefono TEXT,
  canal                 TEXT DEFAULT 'email' CHECK (canal IN ('email','sms','whatsapp','otro')),
  created_by            UUID,
  first_viewed_at       TIMESTAMPTZ,
  last_viewed_at        TIMESTAMPTZ,
  view_count            INTEGER DEFAULT 0,
  notificado            BOOLEAN DEFAULT false,
  pdf_url               TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_doc_compartidos_empresa
  ON documentos_compartidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_doc_compartidos_token
  ON documentos_compartidos(token);
CREATE INDEX IF NOT EXISTS idx_doc_compartidos_doc
  ON documentos_compartidos(empresa_id, tipo_documento, documento_id);

-- 3. ROW LEVEL SECURITY (permisivo, igual que el resto de tablas del ERP)
ALTER TABLE documentos_compartidos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'documentos_compartidos'
      AND policyname = 'documentos_compartidos_all'
  ) THEN
    CREATE POLICY "documentos_compartidos_all"
      ON documentos_compartidos FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. REALTIME (necesario para notificaciones en vivo de "documento visto")
ALTER PUBLICATION supabase_realtime ADD TABLE documentos_compartidos;
