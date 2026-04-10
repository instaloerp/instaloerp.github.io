-- ============================================================
-- FIX: Artículos creados desde OCR — v114
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Ver artículos creados desde OCR (para revisar antes de actualizar)
SELECT id, codigo, nombre, precio_coste, precio_venta, es_activo, activo,
       observaciones
FROM articulos
WHERE codigo LIKE 'OCR-%'
   OR observaciones LIKE '%OCR%'
ORDER BY created_at DESC;

-- 2. Desactivar es_activo en artículos OCR (se marca manualmente)
UPDATE articulos
SET es_activo = false
WHERE (codigo LIKE 'OCR-%' OR observaciones LIKE '%OCR%')
  AND es_activo = true;

-- 3. Poner precio_venta = precio_coste donde precio_venta sea 0 o NULL
--    (el precio_coste es el bruto del documento, mejor que nada)
UPDATE articulos
SET precio_venta = precio_coste
WHERE (codigo LIKE 'OCR-%' OR observaciones LIKE '%OCR%')
  AND (precio_venta IS NULL OR precio_venta = 0)
  AND precio_coste > 0;

-- 4. Intentar poner precio_venta desde articulos_proveedores si existe
--    (precio_proveedor es el PVP bruto del documento)
UPDATE articulos a
SET precio_venta = ap.precio_proveedor
FROM articulos_proveedores ap
WHERE a.id = ap.articulo_id
  AND ap.precio_proveedor > 0
  AND (a.codigo LIKE 'OCR-%' OR a.observaciones LIKE '%OCR%')
  AND (a.precio_venta IS NULL OR a.precio_venta = 0 OR a.precio_venta = a.precio_coste);

-- 5. Verificar resultado
SELECT id, codigo, nombre, precio_coste, precio_venta, es_activo
FROM articulos
WHERE codigo LIKE 'OCR-%'
   OR observaciones LIKE '%OCR%'
ORDER BY created_at DESC;
