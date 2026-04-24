-- ═══════════════════════════════════════════════
-- FIX: Columnas que faltan en tablas existentes
-- para que el flujo OCR + Inbox funcione
-- ═══════════════════════════════════════════════

-- ─── 1. movimientos_stock: faltan delta, notas, tipo_stock, usuario_nombre ───
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS delta NUMERIC(12,2);
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS tipo_stock TEXT DEFAULT 'real';
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;

-- ─── 2. tareas_pendientes: el código usa un esquema diferente al original ───
-- Añadir columnas que usa el código OCR/traspasos
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS entidad_tipo TEXT;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS entidad_id TEXT;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS entidad_nombre TEXT;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS titulo TEXT;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS campos_faltantes JSONB;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS origen TEXT;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS rol_asignado TEXT DEFAULT 'admin';
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente';
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS factura_origen_ref TEXT;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS usuario_creador_id UUID;
ALTER TABLE tareas_pendientes ADD COLUMN IF NOT EXISTS fecha_completada TIMESTAMPTZ;


-- ─── 3. documentos_factura_prov: columnas con nombres distintos ───
-- El código usa factura_prov_id, nombre_archivo, storage_path, mime_type, tamano
ALTER TABLE documentos_factura_prov ADD COLUMN IF NOT EXISTS factura_prov_id BIGINT REFERENCES facturas_proveedor(id) ON DELETE CASCADE;
ALTER TABLE documentos_factura_prov ADD COLUMN IF NOT EXISTS nombre_archivo TEXT;
ALTER TABLE documentos_factura_prov ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documentos_factura_prov ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documentos_factura_prov ADD COLUMN IF NOT EXISTS tamano BIGINT DEFAULT 0;

-- ─── RLS policies (por si no existen) ───
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'movimientos_stock' AND policyname = 'movimientos_stock_empresa') THEN
    CREATE POLICY movimientos_stock_empresa ON movimientos_stock FOR ALL USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tareas_pendientes' AND policyname = 'tareas_pendientes_empresa') THEN
    CREATE POLICY tareas_pendientes_empresa ON tareas_pendientes FOR ALL USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'documentos_factura_prov' AND policyname = 'documentos_factura_prov_empresa') THEN
    CREATE POLICY documentos_factura_prov_empresa ON documentos_factura_prov FOR ALL USING (true);
  END IF;
END $$;
