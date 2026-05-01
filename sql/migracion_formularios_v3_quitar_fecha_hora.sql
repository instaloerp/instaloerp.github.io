-- ═══════════════════════════════════════════════════════════════
--  MIGRACIÓN — Formularios v3: quitar fecha/hora redundantes
--
--  Los campos 'visita_fecha' y 'visita_hora' del formulario RITE
--  son redundantes: la fecha y horario ya están en partes_trabajo
--  (parte.fecha, parte.hora_inicio, parte.hora_fin, parte.inicio_at,
--  parte.completado_at) y aparecen en la tarjeta "DATOS DEL PARTE"
--  del PDF.
--
--  Esta migración:
--    1. Elimina los campos visita_fecha y visita_hora.
--    2. Elimina la sección "Datos de la visita" (queda vacía).
--    3. Limpia las respuestas obsoletas en partes_formulario.
--
--  Idempotente.
--  Ejecutar en Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- 1) Eliminar campos visita_fecha y visita_hora
DELETE FROM form_plantilla_campos
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND codigo IN ('visita_fecha', 'visita_hora');

-- 2) Eliminar la sección "Datos de la visita" (sin contenido tras lo anterior)
DELETE FROM form_plantilla_campos
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND tipo = 'seccion'
  AND etiqueta = 'Datos de la visita';

-- 3) Limpiar respuestas obsoletas en partes_formulario
UPDATE partes_formulario
SET respuestas = (respuestas - 'visita_fecha' - 'visita_hora')
WHERE respuestas ? 'visita_fecha' OR respuestas ? 'visita_hora';


-- ─── Verificación ──────────────────────────────────────────────
-- Confirmar que ya no quedan campos visita_fecha/visita_hora ni la sección
SELECT 'campos restantes' AS info, count(*) AS n
FROM form_plantilla_campos
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite');

SELECT 'codigos visita restantes (debe ser 0)' AS info, count(*) AS n
FROM form_plantilla_campos
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND codigo IN ('visita_fecha', 'visita_hora');

SELECT 'seccion datos visita restante (debe ser 0)' AS info, count(*) AS n
FROM form_plantilla_campos
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND tipo = 'seccion'
  AND etiqueta = 'Datos de la visita';

SELECT 'respuestas con campos viejos (debe ser 0)' AS info, count(*) AS n
FROM partes_formulario
WHERE respuestas ? 'visita_fecha' OR respuestas ? 'visita_hora';

-- Estructura actual de la cabecera (debe quedar solo TIPO DE MANTENIMIENTO)
SELECT id, orden, codigo, tipo, etiqueta
FROM form_plantilla_campos
WHERE plantilla_id IN (SELECT id FROM form_plantillas WHERE categoria = 'rite')
  AND orden < 100
ORDER BY orden;
