-- ═══════════════════════════════════════════════════════
-- Tesorería: Ficha banco ampliada + función fallback saldo
-- ═══════════════════════════════════════════════════════

-- 1. Nuevas columnas para ficha del banco
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS telefono_banco TEXT;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS contacto_banco TEXT;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS email_banco TEXT;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS sucursal TEXT;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS numero_cuenta TEXT;

-- 2. Función RPC para sumar movimientos (fallback saldo)
CREATE OR REPLACE FUNCTION sum_movimientos_cuenta(p_cuenta_id BIGINT)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(importe), 0)
  FROM movimientos_bancarios
  WHERE cuenta_id = p_cuenta_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
