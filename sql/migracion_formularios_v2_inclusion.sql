-- ═══════════════════════════════════════════════════════════════
--  MIGRACIÓN — Formularios v2: lógica de inclusión por TIPO
--
--  Cambio: en mantenimiento RITE, las visitas SEMESTRALES también
--  incluyen las operaciones MENSUALES; las ANUALES incluyen
--  MENSUALES + SEMESTRALES + ANUALES. Solo CORRECTIVO queda aislado.
--
--  Ejecutar en Supabase → SQL Editor.
--  Idempotente: se puede ejecutar varias veces.
-- ═══════════════════════════════════════════════════════════════

-- 1) Operaciones MENSUALES (orden 200-399) — visibles en MENSUAL, SEMESTRAL, ANUAL
UPDATE form_plantilla_campos
SET mostrar_si = jsonb_set(mostrar_si, '{valor_in}', '["MENSUAL","SEMESTRAL","ANUAL"]'::jsonb)
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND orden >= 200 AND orden < 400
  AND mostrar_si IS NOT NULL;

-- 2) Operaciones SEMESTRALES (orden 400-599) — visibles en SEMESTRAL, ANUAL
UPDATE form_plantilla_campos
SET mostrar_si = jsonb_set(mostrar_si, '{valor_in}', '["SEMESTRAL","ANUAL"]'::jsonb)
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND orden >= 400 AND orden < 600
  AND mostrar_si IS NOT NULL;

-- 3) Operaciones ANUALES (orden 600-699) ya estaban bien (solo ANUAL),
--    pero lo ejecutamos también idempotentemente por si alguien las
--    modificó manualmente.
UPDATE form_plantilla_campos
SET mostrar_si = jsonb_set(mostrar_si, '{valor_in}', '["ANUAL"]'::jsonb)
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND orden >= 600 AND orden < 700
  AND mostrar_si IS NOT NULL;


-- ─── Verificación ──────────────────────────────────────────────
-- Devuelve un resumen de mostrar_si por rango de orden
SELECT
  CASE
    WHEN orden >= 100 AND orden < 200 THEN 'CORRECTIVO'
    WHEN orden >= 200 AND orden < 400 THEN 'MENSUAL'
    WHEN orden >= 400 AND orden < 600 THEN 'SEMESTRAL'
    WHEN orden >= 600 AND orden < 700 THEN 'ANUAL'
    ELSE 'OTRO'
  END AS rama,
  count(*) AS n_campos,
  count(DISTINCT mostrar_si->>'valor_in') AS variantes_mostrar_si,
  (array_agg(DISTINCT mostrar_si->>'valor_in'))[1] AS valor_in_ejemplo
FROM form_plantilla_campos
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND mostrar_si IS NOT NULL
GROUP BY rama
ORDER BY rama;
