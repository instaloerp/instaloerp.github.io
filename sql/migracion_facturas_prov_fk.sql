-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Añadir pedido_compra_id, recepcion_id y recepcion_ids
-- a facturas_proveedor para trazabilidad completa de la cadena
--   presupuesto → pedido → albarán → factura
-- Fecha: 2026-04-14 (build 135)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Enlace a pedido de compra origen
ALTER TABLE facturas_proveedor
  ADD COLUMN IF NOT EXISTS pedido_compra_id BIGINT
  REFERENCES pedidos_compra(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_pedido
  ON facturas_proveedor(pedido_compra_id);

-- 2. Enlace a recepción/albarán origen (factura desde 1 albarán)
ALTER TABLE facturas_proveedor
  ADD COLUMN IF NOT EXISTS recepcion_id BIGINT
  REFERENCES recepciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_recepcion
  ON facturas_proveedor(recepcion_id);

-- 3. Enlace a múltiples recepciones (factura agrupada desde varios albaranes)
ALTER TABLE facturas_proveedor
  ADD COLUMN IF NOT EXISTS recepcion_ids BIGINT[];

-- 4. Refrescar el cache del schema de PostgREST
NOTIFY pgrst, 'reload schema';

-- Verificación (opcional):
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'facturas_proveedor'
--     AND column_name IN ('pedido_compra_id','recepcion_id','recepcion_ids');
