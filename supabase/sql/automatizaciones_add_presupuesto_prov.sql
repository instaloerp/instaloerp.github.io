-- ════════════════════════════════════════════════════════════════
-- Migración: añadir 'crear_presupuesto_prov' al CHECK de automatizaciones.accion
-- Build 145 (2026-04-30)
-- ════════════════════════════════════════════════════════════════

-- 1. Detectar el nombre del constraint existente y eliminarlo
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.automatizaciones'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%accion%IN%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.automatizaciones DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

-- 2. Recrear el CHECK con el nuevo valor incluido
ALTER TABLE public.automatizaciones
  ADD CONSTRAINT automatizaciones_accion_check
  CHECK (accion IN (
    'crear_presupuesto_prov',
    'crear_pedido_compra',
    'crear_albaran_prov',
    'crear_factura_prov',
    'procesar_nominas',
    'crear_cliente',
    'crear_tarea',
    'archivar_documento',
    'personalizada'
  ));

-- 3. Verificación
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.automatizaciones'::regclass AND contype = 'c';
