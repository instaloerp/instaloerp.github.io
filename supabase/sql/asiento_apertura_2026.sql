-- ═══════════════════════════════════════════════════════════════
-- ASIENTO DE APERTURA 2026
-- Basado en Balance de Situación a 31/12/2025
-- Jordi Instalaciones S.C.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_empresa_id UUID := '00000000-0000-0000-0000-000000000001';
  v_ejercicio_id BIGINT;
  v_asiento_id BIGINT;
BEGIN

-- ─── 1. Crear cuentas que faltan en el plan contable ───────────
-- Algunas partidas del balance usan cuentas que no están en el PGC simplificado

INSERT INTO cuentas_contables (empresa_id, codigo, nombre, tipo, grupo, es_hoja, padre_codigo)
VALUES
  -- Grupo 1: Financiación básica
  (v_empresa_id, '174',  'Acreedores arrendamiento financiero L/P', 'pasivo', 1, true, '17'),
  -- Grupo 2: Amortización acumulada (subcuenta específica)
  (v_empresa_id, '219',  'Otro inmovilizado material',     'activo',  2, true,  '21'),
  -- Grupo 4: Otros deudores/acreedores
  (v_empresa_id, '440',  'Deudores diversos',              'activo',  4, true,  '43'),
  (v_empresa_id, '41',   'Acreedores varios (grupo)',       'pasivo',  4, false, NULL),
  (v_empresa_id, '419',  'Acreedores varios por operaciones', 'pasivo', 4, true, '41'),
  -- Grupo 5: Deudas a corto plazo
  (v_empresa_id, '521',  'Deudas c/p arrendamiento financiero', 'pasivo', 5, true, '52'),
  (v_empresa_id, '523',  'Proveedores inmovilizado c/p',   'pasivo',  5, true,  '52'),
  (v_empresa_id, '525',  'Otras deudas c/p',               'pasivo',  5, true,  '52'),
  (v_empresa_id, '551',  'Cuenta corriente con socios',     'activo',  5, true,  '57')
ON CONFLICT (empresa_id, codigo) DO NOTHING;

RAISE NOTICE 'Cuentas adicionales creadas (o ya existían)';

-- ─── 2. Obtener ejercicio 2026 ────────────────────────────────
SELECT id INTO v_ejercicio_id
  FROM ejercicios_fiscales
  WHERE empresa_id = v_empresa_id AND nombre = '2026';

IF v_ejercicio_id IS NULL THEN
  RAISE EXCEPTION 'No se encontró el ejercicio 2026. Créalo primero.';
END IF;

-- ─── 3. Verificar que no exista ya un asiento de apertura ─────
IF EXISTS (
  SELECT 1 FROM asientos
  WHERE empresa_id = v_empresa_id
    AND ejercicio_id = v_ejercicio_id
    AND origen = 'apertura'
) THEN
  RAISE EXCEPTION 'Ya existe un asiento de apertura para 2026. Elimínalo primero si quieres recrearlo.';
END IF;

-- ─── 4. Crear el asiento de apertura ──────────────────────────
INSERT INTO asientos (empresa_id, numero, fecha, descripcion, origen, origen_ref, estado, ejercicio_id)
VALUES (v_empresa_id, 1, '2026-01-01', 'Asiento de apertura 2026 — Saldos cierre 2025', 'apertura', 'APERTURA-2026', 'contabilizado', v_ejercicio_id)
RETURNING id INTO v_asiento_id;

RAISE NOTICE 'Asiento de apertura creado con id: %', v_asiento_id;

-- ─── 5. Insertar líneas del asiento ───────────────────────────
-- ACTIVO (Debe) — saldos deudores
INSERT INTO lineas_asiento (asiento_id, cuenta_id, cuenta_codigo, descripcion, debe, haber, orden)
VALUES
  -- Activo no corriente: Inmovilizado material 31.657,67
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '219'),
   '219', 'Inmovilizado material', 31657.67, 0, 1),

  -- Existencias 27.249,10
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '300'),
   '300', 'Mercaderías', 27249.10, 0, 2),

  -- Clientes por ventas 516.171,02
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '430'),
   '430', 'Clientes por ventas y prestaciones', 516171.02, 0, 3),

  -- Otros deudores 9.198,24
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '440'),
   '440', 'Otros deudores', 9198.24, 0, 4),

  -- Efectivo y otros activos líquidos 4.539,88
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '572'),
   '572', 'Bancos c/c', 4539.88, 0, 5);

-- PATRIMONIO NETO Y PASIVO (Haber) — saldos acreedores
INSERT INTO lineas_asiento (asiento_id, cuenta_id, cuenta_codigo, descripcion, debe, haber, orden)
VALUES
  -- Capital social 1.000,00
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '100'),
   '100', 'Capital social', 0, 1000.00, 6),

  -- Reservas voluntarias 37.324,88
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '113'),
   '113', 'Reservas voluntarias', 0, 37324.88, 7),

  -- Resultado del ejercicio 2025 → Remanente (120)
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '120'),
   '120', 'Resultado ejercicio 2025 (remanente)', 0, 5275.19, 8),

  -- Deudas L/P con entidades de crédito 65.590,54
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '170'),
   '170', 'Deudas L/P entidades crédito', 0, 65590.54, 9),

  -- Deudas C/P con entidades de crédito 107.318,95
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '520'),
   '520', 'Deudas C/P entidades crédito', 0, 107318.95, 10),

  -- Acreedores arrendamiento financiero C/P 1.106,18
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '521'),
   '521', 'Acreedores arrend. financiero C/P', 0, 1106.18, 11),

  -- Otras deudas a corto plazo 29.720,10
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '525'),
   '525', 'Otras deudas C/P', 0, 29720.10, 12),

  -- Proveedores 164.185,25
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '400'),
   '400', 'Proveedores', 0, 164185.25, 13),

  -- Otros acreedores 177.294,82
  (v_asiento_id, (SELECT id FROM cuentas_contables WHERE empresa_id = v_empresa_id AND codigo = '410'),
   '410', 'Acreedores varios', 0, 177294.82, 14);

-- ─── 6. Verificar que cuadra ──────────────────────────────────
DECLARE
  v_total_debe  NUMERIC;
  v_total_haber NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debe),0), COALESCE(SUM(haber),0)
    INTO v_total_debe, v_total_haber
    FROM lineas_asiento WHERE asiento_id = v_asiento_id;

  RAISE NOTICE 'Total DEBE:  % €', v_total_debe;
  RAISE NOTICE 'Total HABER: % €', v_total_haber;
  RAISE NOTICE 'Diferencia:  % €', v_total_debe - v_total_haber;

  IF ABS(v_total_debe - v_total_haber) > 0.01 THEN
    RAISE EXCEPTION 'ERROR: El asiento NO cuadra. Debe=%, Haber=%', v_total_debe, v_total_haber;
  END IF;

  RAISE NOTICE '✅ Asiento de apertura 2026 creado y cuadrado correctamente';
END;

END $$;

-- Verificación final
SELECT
  a.id, a.numero, a.fecha, a.descripcion, a.origen, a.estado,
  (SELECT SUM(debe) FROM lineas_asiento WHERE asiento_id = a.id) AS total_debe,
  (SELECT SUM(haber) FROM lineas_asiento WHERE asiento_id = a.id) AS total_haber,
  (SELECT COUNT(*) FROM lineas_asiento WHERE asiento_id = a.id) AS num_lineas
FROM asientos a
WHERE a.empresa_id = '00000000-0000-0000-0000-000000000001'
  AND a.origen = 'apertura'
ORDER BY a.fecha;
