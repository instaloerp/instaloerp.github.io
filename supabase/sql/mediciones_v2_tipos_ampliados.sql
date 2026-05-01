-- ════════════════════════════════════════════════════════════════
-- MIGRACIÓN: ampliar tipos permitidos en `mediciones`
-- ════════════════════════════════════════════════════════════════
-- La versión inicial solo permitía 5 tipos (ventanas, bano, suelo,
-- pintura, otra). Se añaden 7 nuevos para cubrir el sector de
-- instalaciones: calefacción, climatización, fontanería, eléctrico,
-- caldera/ACS, ventilación, puertas.
--
-- Ejecutar en Supabase SQL Editor (idempotente — se puede ejecutar
-- varias veces sin daño).
-- ════════════════════════════════════════════════════════════════

-- 1) Soltar el constraint anterior (si existe).
ALTER TABLE public.mediciones
  DROP CONSTRAINT IF EXISTS mediciones_tipo_check;

-- 2) Recrearlo con la lista ampliada.
ALTER TABLE public.mediciones
  ADD CONSTRAINT mediciones_tipo_check
  CHECK (tipo IN (
    'ventanas',
    'bano',
    'suelo',
    'pintura',
    'calefaccion',
    'climatizacion',
    'fontaneria',
    'electrico',
    'caldera_acs',
    'ventilacion',
    'puertas',
    'otra'
  ));

-- Verificación
SELECT 'mediciones_tipo_check actualizado — 12 tipos permitidos' AS status;
