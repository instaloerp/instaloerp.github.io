-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Añadir columna presupuesto_compra_id a tablas del flujo compras
-- Permite la trazabilidad completa Presupuesto → Pedido → Albarán → Factura
-- y habilita la propagación bidireccional de la obra asignada.
-- Fecha: 2026-04-13 (build 125)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Pedidos de compra
ALTER TABLE pedidos_compra
  ADD COLUMN IF NOT EXISTS presupuesto_compra_id BIGINT
  REFERENCES presupuestos_compra(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_compra_presupuesto
  ON pedidos_compra(presupuesto_compra_id);

-- 2. Recepciones (albaranes de proveedor)
ALTER TABLE recepciones
  ADD COLUMN IF NOT EXISTS presupuesto_compra_id BIGINT
  REFERENCES presupuestos_compra(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recepciones_presupuesto
  ON recepciones(presupuesto_compra_id);

-- 3. Facturas de proveedor
ALTER TABLE facturas_proveedor
  ADD COLUMN IF NOT EXISTS presupuesto_compra_id BIGINT
  REFERENCES presupuestos_compra(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_presupuesto
  ON facturas_proveedor(presupuesto_compra_id);

-- 4. Refrescar el cache del schema de PostgREST para que Supabase JS
--    reconozca las nuevas columnas inmediatamente
NOTIFY pgrst, 'reload schema';

-- Verificación (opcional — ejecutar aparte si quieres comprobar):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('pedidos_compra','recepciones','facturas_proveedor')
--     AND column_name = 'presupuesto_compra_id';
