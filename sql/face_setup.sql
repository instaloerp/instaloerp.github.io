-- ════════════════════════════════════════════════════════════════
--  FACe — Facturación electrónica a Administraciones Públicas
--  instaloERP v1.1
-- ════════════════════════════════════════════════════════════════

-- 1. Campos DIR3 en clientes (cada admin pública tiene 3 códigos)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS face_organo_gestor TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS face_unidad_tramitadora TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS face_oficina_contable TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS es_administracion_publica BOOLEAN DEFAULT false;

COMMENT ON COLUMN clientes.face_organo_gestor IS 'Código DIR3 del Órgano Gestor (FACe)';
COMMENT ON COLUMN clientes.face_unidad_tramitadora IS 'Código DIR3 de la Unidad Tramitadora (FACe)';
COMMENT ON COLUMN clientes.face_oficina_contable IS 'Código DIR3 de la Oficina Contable (FACe)';

-- 2. Campos FACe en facturas
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS face_estado TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS face_numero_registro TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS face_enviado_at TIMESTAMPTZ;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS face_organo_gestor TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS face_unidad_tramitadora TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS face_oficina_contable TEXT;

-- 3. Tabla de envíos FACe (historial completo)
CREATE TABLE IF NOT EXISTS face_envios (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  factura_id      BIGINT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  -- Datos del envío
  accion          TEXT NOT NULL CHECK (accion IN ('enviar','anular','consultar')),
  numero_registro TEXT,
  -- Estado FACe
  codigo_estado   TEXT,
  estado          TEXT,
  -- 1200=Registrada, 1300=Contabilizada, 2400=Pagada, 2500=Rechazada, 2600=Anulada
  motivo_rechazo  TEXT,
  -- XML
  xml_facturae    TEXT,
  xml_respuesta   TEXT,
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT now(),
  respondido_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_face_envios_empresa ON face_envios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_face_envios_factura ON face_envios(factura_id);
CREATE INDEX IF NOT EXISTS idx_face_envios_estado ON face_envios(estado);

-- RLS
ALTER TABLE face_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "face_envios_all" ON face_envios
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Config FACe en empresas.config (se usa el JSON existente)
-- empresas.config.face = { activo, modo: 'test'|'produccion' }
-- El certificado se reutiliza de certificados_digitales

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT 'face_envios' AS tabla, COUNT(*) FROM face_envios;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'clientes' AND column_name LIKE 'face_%'
ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'facturas' AND column_name LIKE 'face_%'
ORDER BY ordinal_position;
