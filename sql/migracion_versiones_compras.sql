-- ═══════════════════════════════════════════════
-- Migración: Versionado de documentos de compra
-- build 127 · 2026-04-13
-- ═══════════════════════════════════════════════
-- Cuando un documento está "en uso" (tiene documentos
-- posteriores) y se modifica, se crea una nueva versión
-- en lugar de sobreescribir la original.
-- ═══════════════════════════════════════════════

-- Presupuestos de compra
ALTER TABLE presupuestos_compra ADD COLUMN IF NOT EXISTS version_padre_id BIGINT REFERENCES presupuestos_compra(id) ON DELETE SET NULL;
ALTER TABLE presupuestos_compra ADD COLUMN IF NOT EXISTS version_num INT DEFAULT 1;
ALTER TABLE presupuestos_compra ADD COLUMN IF NOT EXISTS version_activa BOOLEAN DEFAULT TRUE;

-- Pedidos de compra
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS version_padre_id BIGINT REFERENCES pedidos_compra(id) ON DELETE SET NULL;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS version_num INT DEFAULT 1;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS version_activa BOOLEAN DEFAULT TRUE;

-- Recepciones (albaranes de proveedor)
ALTER TABLE recepciones ADD COLUMN IF NOT EXISTS version_padre_id BIGINT REFERENCES recepciones(id) ON DELETE SET NULL;
ALTER TABLE recepciones ADD COLUMN IF NOT EXISTS version_num INT DEFAULT 1;
ALTER TABLE recepciones ADD COLUMN IF NOT EXISTS version_activa BOOLEAN DEFAULT TRUE;

-- Facturas de proveedor
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS version_padre_id BIGINT REFERENCES facturas_proveedor(id) ON DELETE SET NULL;
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS version_num INT DEFAULT 1;
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS version_activa BOOLEAN DEFAULT TRUE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_prc_version_padre ON presupuestos_compra(version_padre_id);
CREATE INDEX IF NOT EXISTS idx_pc_version_padre ON pedidos_compra(version_padre_id);
CREATE INDEX IF NOT EXISTS idx_rc_version_padre ON recepciones(version_padre_id);
CREATE INDEX IF NOT EXISTS idx_fp_version_padre ON facturas_proveedor(version_padre_id);

-- Forzar reload del schema cache
NOTIFY pgrst, 'reload schema';
