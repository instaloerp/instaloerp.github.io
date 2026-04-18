-- ═══════════════════════════════════════════════════════════════
--  LIMPIEZA DE DATOS DE PRUEBA — instaloERP
--  Borra: clientes, facturas, presupuestos, albaranes, compras,
--         proveedores, artículos, stock, trabajos, partes, etc.
--  Conserva: empresa, personal, flota, vehículos, almacenes,
--            configuración, certificados, VeriFactu config
-- ═══════════════════════════════════════════════════════════════

-- 1. VeriFactu registros (depende de facturas)
DELETE FROM verifactu_registros;

-- 2. Historial y auditoría
DELETE FROM documento_historial;
DELETE FROM audit_log;

-- 3. Versiones de documentos
DELETE FROM factura_versiones;
DELETE FROM presupuesto_versiones;

-- 4. Cuentas bancarias de entidades (clientes/proveedores)
DELETE FROM cuentas_bancarias_entidad;

-- 5. Facturas y rectificativas
DELETE FROM facturas;

-- 6. Albaranes
DELETE FROM albaranes;

-- 7. Presupuestos
DELETE FROM presupuestos;

-- 8. Compras (orden por dependencias)
DELETE FROM facturas_proveedor;
DELETE FROM recepciones;
DELETE FROM pedidos_compra;
DELETE FROM presupuestos_compra;

-- 9. Líneas de servicio
DELETE FROM servicio_lineas;

-- 10. Trabajos / Obras
DELETE FROM tareas_obra;
DELETE FROM partes_trabajo;
DELETE FROM trabajos;

-- 11. Stock e incidencias
DELETE FROM incidencias_stock;
DELETE FROM stock;
DELETE FROM traspasos;

-- 12. Artículos
DELETE FROM articulos;

-- 13. Documentos OCR
DELETE FROM documentos_ocr;

-- 14. Clientes
DELETE FROM clientes;

-- 15. Proveedores
DELETE FROM proveedores;

-- 16. Resetear contadores de series de numeración
UPDATE series_numeracion SET ultimo_numero = 0;

-- ═══════════════════════════════════════════════════════════════
--  VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
SELECT 'clientes' AS tabla, COUNT(*) FROM clientes
UNION ALL SELECT 'facturas', COUNT(*) FROM facturas
UNION ALL SELECT 'presupuestos', COUNT(*) FROM presupuestos
UNION ALL SELECT 'albaranes', COUNT(*) FROM albaranes
UNION ALL SELECT 'proveedores', COUNT(*) FROM proveedores
UNION ALL SELECT 'articulos', COUNT(*) FROM articulos
UNION ALL SELECT 'trabajos', COUNT(*) FROM trabajos
UNION ALL SELECT 'verifactu_registros', COUNT(*) FROM verifactu_registros;
