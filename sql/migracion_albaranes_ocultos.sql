-- ============================================================
-- Migración: mover albaranes ocultos de partes_trabajo.albaranes_compra
-- a la tabla documentos_ocr para que aparezcan en Bandeja OCR
-- ============================================================
-- Fecha: 2026-04-09
-- Contexto: el flujo 2 (wizard OCR) guardaba los documentos solo
-- en el campo JSON albaranes_compra del parte, sin crear registro
-- en documentos_ocr. Esto provocaba que la oficina no los viera
-- en la Bandeja OCR.
-- ============================================================

-- 1. Insertar cada albarán oculto como documento OCR pendiente
INSERT INTO documentos_ocr (
  empresa_id,
  usuario_id,
  archivo_path,
  archivo_nombre,
  estado,
  tipo_documento,
  datos_extraidos,
  created_at
)
SELECT
  pt.empresa_id,
  pt.usuario_id,
  COALESCE((alb->>'fotos')::jsonb->>0, ''),                     -- primera foto como archivo_path
  'Migrado_Parte_' || pt.numero || '_Alb_' || COALESCE(alb->>'numero', 'sin_numero'),
  'pendiente',
  'albaran',
  jsonb_build_object(
    'migrado_desde', 'partes_trabajo.albaranes_compra',
    'parte_id', pt.id,
    'parte_numero', pt.numero,
    'numero_albaran', COALESCE(alb->>'numero', 'sin número'),
    'fotos', COALESCE((alb->>'fotos')::jsonb, '[]'::jsonb),
    'nota', 'Documento migrado automáticamente — pendiente de validación en oficina'
  ),
  COALESCE(pt.updated_at, pt.created_at, now())
FROM partes_trabajo pt,
     jsonb_array_elements(pt.albaranes_compra::jsonb) AS alb
WHERE pt.albaranes_compra IS NOT NULL
  AND jsonb_array_length(pt.albaranes_compra::jsonb) > 0
  -- Solo migrar los que NO existen ya en documentos_ocr (evitar duplicados)
  AND NOT EXISTS (
    SELECT 1 FROM documentos_ocr d
    WHERE d.empresa_id = pt.empresa_id
      AND d.datos_extraidos->>'parte_id' = pt.id::text
      AND d.datos_extraidos->>'numero_albaran' = COALESCE(alb->>'numero', 'sin número')
  );

-- 2. Ver cuántos se han migrado
-- (ejecutar este SELECT después del INSERT para verificar)
SELECT
  'Migrados' AS estado,
  count(*) AS total
FROM documentos_ocr
WHERE datos_extraidos->>'migrado_desde' = 'partes_trabajo.albaranes_compra';

-- ============================================================
-- NOTA: NO borramos partes_trabajo.albaranes_compra porque
-- el parte sigue necesitando la referencia para mostrar qué
-- albaranes están vinculados. La Bandeja OCR ahora tiene su
-- propia copia para gestionar desde oficina.
-- ============================================================
