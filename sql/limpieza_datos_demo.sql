-- ============================================================
-- LIMPIEZA DE DATOS DE PRUEBA / DEMO
-- Fecha: 2026-04-09
-- ============================================================
-- BORRA todo lo transaccional. MANTIENE configuración:
--   empresas, perfiles, almacenes, familias_articulos,
--   unidades_medida, tipos_iva, formas_pago, series_numeracion,
--   cuentas_correo, cuentas_bancarias, certificados_digitales
-- ============================================================
-- ⚠️  EJECUTAR CON CUIDADO — NO SE PUEDE DESHACER
-- ============================================================

-- ── 1. OBRAS / PARTES (borrar hijos antes que padres) ──
TRUNCATE TABLE consumos_parte              CASCADE;
TRUNCATE TABLE tareas_pendientes           CASCADE;
TRUNCATE TABLE notas_trabajo               CASCADE;
TRUNCATE TABLE documentos_trabajo          CASCADE;
TRUNCATE TABLE operarios_obra              CASCADE;
TRUNCATE TABLE tareas_obra                 CASCADE;
TRUNCATE TABLE partes_trabajo              CASCADE;
TRUNCATE TABLE revisiones_mantenimiento    CASCADE;
TRUNCATE TABLE notas_mantenimiento         CASCADE;
TRUNCATE TABLE documentos_mantenimiento    CASCADE;
TRUNCATE TABLE mantenimientos              CASCADE;
TRUNCATE TABLE trabajos                    CASCADE;

-- ── 2. VENTAS ──
TRUNCATE TABLE cuentas_bancarias_entidad   CASCADE;
TRUNCATE TABLE documentos_cliente          CASCADE;
TRUNCATE TABLE notas_cliente               CASCADE;
TRUNCATE TABLE direcciones_cliente         CASCADE;
TRUNCATE TABLE contactos_cliente           CASCADE;
TRUNCATE TABLE certificados                CASCADE;
TRUNCATE TABLE albaranes                   CASCADE;
TRUNCATE TABLE facturas                    CASCADE;
TRUNCATE TABLE presupuesto_versiones       CASCADE;
TRUNCATE TABLE presupuestos                CASCADE;
TRUNCATE TABLE clientes                    CASCADE;

-- ── 3. COMPRAS ──
TRUNCATE TABLE documentos_factura_prov     CASCADE;
TRUNCATE TABLE pagos_proveedor             CASCADE;
TRUNCATE TABLE facturas_proveedor          CASCADE;
TRUNCATE TABLE recepciones                 CASCADE;
TRUNCATE TABLE pedidos_compra              CASCADE;
TRUNCATE TABLE presupuestos_compra         CASCADE;
TRUNCATE TABLE articulos_proveedores       CASCADE;
TRUNCATE TABLE proveedores                 CASCADE;

-- ── 4. ARTÍCULOS / STOCK ──
TRUNCATE TABLE incidencias_stock           CASCADE;
TRUNCATE TABLE movimientos_stock           CASCADE;
TRUNCATE TABLE traspasos                   CASCADE;
TRUNCATE TABLE pedidos_almacen             CASCADE;
TRUNCATE TABLE stock                       CASCADE;
TRUNCATE TABLE articulos_historial         CASCADE;
TRUNCATE TABLE articulos                   CASCADE;

-- ── 5. OCR / DOCUMENTOS ──
TRUNCATE TABLE documentos_ocr              CASCADE;
TRUNCATE TABLE documentos_generados        CASCADE;
TRUNCATE TABLE documentos                  CASCADE;

-- ── 6. PERSONAL ──
TRUNCATE TABLE fichajes_ajustes            CASCADE;
TRUNCATE TABLE fichajes                    CASCADE;

-- ── 7. OTROS ──
TRUNCATE TABLE correos                     CASCADE;
TRUNCATE TABLE audit_log                   CASCADE;

-- ── 8. RESETEAR CONTADORES DE SERIES ──
UPDATE series_numeracion SET contador = 0;

-- ── 9. VERIFICACIÓN ──
SELECT 'trabajos' AS tabla, count(*) AS registros FROM trabajos
UNION ALL SELECT 'partes_trabajo', count(*) FROM partes_trabajo
UNION ALL SELECT 'clientes', count(*) FROM clientes
UNION ALL SELECT 'proveedores', count(*) FROM proveedores
UNION ALL SELECT 'articulos', count(*) FROM articulos
UNION ALL SELECT 'presupuestos', count(*) FROM presupuestos
UNION ALL SELECT 'facturas', count(*) FROM facturas
UNION ALL SELECT 'documentos_ocr', count(*) FROM documentos_ocr
UNION ALL SELECT 'stock', count(*) FROM stock
UNION ALL SELECT 'fichajes', count(*) FROM fichajes
UNION ALL SELECT 'series_numeracion (contador)', max(contador) FROM series_numeracion;

-- ============================================================
-- NOTA: También deberías vaciar los buckets de Storage en
-- Supabase (fotos-partes, documentos) manualmente desde
-- el panel de Supabase → Storage → seleccionar → eliminar
-- ============================================================
