-- Añadir columna limite_poliza a cuentas_bancarias
-- Para cuentas de crédito (pólizas), el saldo disponible = limite_poliza + saldo
-- Ejemplo: límite 33000, saldo -32974.39 → disponible 25.61€
ALTER TABLE cuentas_bancarias
ADD COLUMN IF NOT EXISTS limite_poliza numeric DEFAULT NULL;

COMMENT ON COLUMN cuentas_bancarias.limite_poliza IS 'Límite de la póliza de crédito. Si tiene valor, el saldo mostrado = limite_poliza + saldo';
