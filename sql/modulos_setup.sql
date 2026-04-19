-- ═══════════════════════════════════════════════
-- MÓDULOS POR PLAN — instaloERP
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════

-- 1. Añadir campo modulos a empresas (si no existe)
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modulos JSONB DEFAULT '{}';

-- 2. Empresas existentes → premium (todos los módulos activados)
UPDATE empresas
SET modulos = '{
  "clientes": true,
  "ventas": true,
  "facturacion": true,
  "agenda": true,
  "compras": true,
  "almacen": true,
  "obras": true,
  "flota": true,
  "personal": true,
  "comunicaciones": true
}'::jsonb
WHERE modulos IS NULL OR modulos = '{}'::jsonb;

-- 3. Actualizar plan de empresas existentes a premium
UPDATE empresas SET plan = 'premium' WHERE plan = 'trial' OR plan IS NULL;
