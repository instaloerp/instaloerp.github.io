-- ═══════════════════════════════════════════════════════════
-- FIX: Borrar movimientos Open Banking con signo incorrecto
-- Ejecutar ANTES de re-sincronizar desde la Edge Function corregida
-- ═══════════════════════════════════════════════════════════

-- 1) Ver cuántos movimientos Open Banking hay (solo consulta)
SELECT cuenta_id, COUNT(*) as total,
       SUM(CASE WHEN importe > 0 THEN 1 ELSE 0 END) as positivos,
       SUM(CASE WHEN importe < 0 THEN 1 ELSE 0 END) as negativos,
       SUM(importe) as suma_total
FROM movimientos_bancarios
WHERE origen = 'nordigen'
GROUP BY cuenta_id;

-- 2) Borrar TODOS los movimientos importados por Open Banking
--    (se reimportarán con signos correctos al sincronizar)
DELETE FROM movimientos_bancarios
WHERE origen = 'nordigen';

-- 3) Limpiar conciliaciones vinculadas a esos movimientos (si las hay)
--    Las conciliaciones referencian movimiento_id, que ya no existe
DELETE FROM conciliaciones
WHERE movimiento_id NOT IN (SELECT id FROM movimientos_bancarios);

-- 4) Resetear saldo de cuentas conectadas a 0 (la sync lo recalculará)
UPDATE cuentas_bancarias
SET saldo = 0,
    saldo_fecha = NOW(),
    nordigen_ultimo_sync = NULL
WHERE nordigen_conectado = true;

-- Después de ejecutar esto:
-- 1. Desplegar la Edge Function corregida
-- 2. Ir a Tesorería > Cuentas y pulsar "Sincronizar" en cada cuenta conectada
-- 3. Los movimientos se reimportarán con los signos correctos
