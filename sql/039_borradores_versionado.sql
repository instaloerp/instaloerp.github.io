-- ═══════════════════════════════════════════════════════════
--  Build 39 — Sistema de borradores con versionado
-- ═══════════════════════════════════════════════════════════

-- 1. Tabla de versiones de borrador
CREATE TABLE IF NOT EXISTS factura_versiones (
  id          bigserial PRIMARY KEY,
  empresa_id  bigint NOT NULL,
  factura_id  bigint NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  version     int NOT NULL DEFAULT 1,
  snapshot    jsonb NOT NULL,            -- copia completa del borrador en ese momento
  usuario_id  uuid,
  usuario_nombre text,
  created_at  timestamptz DEFAULT now()
);

-- Índice para consultas por factura
CREATE INDEX IF NOT EXISTS idx_fv_factura ON factura_versiones(factura_id);

-- RLS
ALTER TABLE factura_versiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factura_versiones_empresa" ON factura_versiones
  USING (empresa_id = (current_setting('app.empresa_id', true))::bigint);

-- Policy permisiva para insert/update/delete por empresa
CREATE POLICY "factura_versiones_all" ON factura_versiones
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Columna borrador_origen en facturas (referencia al borrador que generó la factura)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'facturas' AND column_name = 'borrador_origen'
  ) THEN
    ALTER TABLE facturas ADD COLUMN borrador_origen text;
    COMMENT ON COLUMN facturas.borrador_origen IS 'Número BORR-XXXX del borrador que originó esta factura definitiva';
  END IF;
END $$;
