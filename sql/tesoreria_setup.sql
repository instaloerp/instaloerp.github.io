-- ═══════════════════════════════════════════════
-- TESORERÍA — instaloERP
-- ADAPTADO: cuentas_bancarias ya existe con id BIGINT
-- ═══════════════════════════════════════════════

-- 1. Añadir columnas que faltan a cuentas_bancarias existente
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'EUR';
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS saldo NUMERIC(12,2) DEFAULT 0;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS saldo_fecha TIMESTAMPTZ;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#2563EB';
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS nordigen_requisition_id TEXT;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS nordigen_account_id TEXT;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS nordigen_conectado BOOLEAN DEFAULT false;
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS nordigen_ultimo_sync TIMESTAMPTZ;

-- 2. Movimientos bancarios (cuenta_id BIGINT → FK a cuentas_bancarias.id)
CREATE TABLE IF NOT EXISTS movimientos_bancarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cuenta_id       BIGINT NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE CASCADE,
  fecha_operacion DATE NOT NULL,
  fecha_valor     DATE,
  concepto        TEXT,
  importe         NUMERIC(12,2) NOT NULL,
  saldo_posterior NUMERIC(12,2),
  referencia      TEXT,
  categoria       TEXT,
  estado          TEXT DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','parcial','conciliado','ignorado')),
  importe_conciliado NUMERIC(12,2) DEFAULT 0,
  origen          TEXT DEFAULT 'manual'
    CHECK (origen IN ('manual','norma43','csv','nordigen')),
  origen_ref      TEXT,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Reglas de conciliación automática
CREATE TABLE IF NOT EXISTS reglas_conciliacion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  campo       TEXT NOT NULL DEFAULT 'concepto'
    CHECK (campo IN ('concepto','referencia','importe')),
  operador    TEXT NOT NULL DEFAULT 'contiene'
    CHECK (operador IN ('contiene','empieza','exacto','mayor_que','menor_que')),
  valor       TEXT NOT NULL,
  accion      TEXT NOT NULL DEFAULT 'categorizar'
    CHECK (accion IN ('categorizar','ignorar','conciliar_cliente','conciliar_proveedor')),
  categoria   TEXT,
  cliente_id  UUID,
  proveedor_id UUID,
  activo      BOOLEAN DEFAULT true,
  prioridad   INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. Conciliaciones (N:N entre movimientos y facturas)
CREATE TABLE IF NOT EXISTS conciliaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  movimiento_id   UUID NOT NULL REFERENCES movimientos_bancarios(id) ON DELETE CASCADE,
  factura_id      UUID,
  factura_prov_id UUID,
  importe         NUMERIC(12,2) NOT NULL,
  notas           TEXT,
  usuario_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CHECK (factura_id IS NOT NULL OR factura_prov_id IS NOT NULL)
);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_mov_empresa_fecha ON movimientos_bancarios(empresa_id, fecha_operacion DESC);
CREATE INDEX IF NOT EXISTS idx_mov_cuenta_fecha ON movimientos_bancarios(cuenta_id, fecha_operacion DESC);
CREATE INDEX IF NOT EXISTS idx_mov_estado ON movimientos_bancarios(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_cuentas_empresa ON cuentas_bancarias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_reglas_empresa ON reglas_conciliacion(empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_conc_movimiento ON conciliaciones(movimiento_id);
CREATE INDEX IF NOT EXISTS idx_conc_factura ON conciliaciones(factura_id) WHERE factura_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conc_factura_prov ON conciliaciones(factura_prov_id) WHERE factura_prov_id IS NOT NULL;

-- 6. RLS
ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglas_conciliacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliaciones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cuentas_bancarias_empresa' AND tablename = 'cuentas_bancarias') THEN
    CREATE POLICY "cuentas_bancarias_empresa" ON cuentas_bancarias FOR ALL USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'movimientos_bancarios_empresa' AND tablename = 'movimientos_bancarios') THEN
    CREATE POLICY "movimientos_bancarios_empresa" ON movimientos_bancarios FOR ALL USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'reglas_conciliacion_empresa' AND tablename = 'reglas_conciliacion') THEN
    CREATE POLICY "reglas_conciliacion_empresa" ON reglas_conciliacion FOR ALL USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'conciliaciones_empresa' AND tablename = 'conciliaciones') THEN
    CREATE POLICY "conciliaciones_empresa" ON conciliaciones FOR ALL USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));
  END IF;
END $$;

-- 7. Activar tesorería en empresas existentes
UPDATE empresas
SET modulos = modulos || '{"tesoreria": true}'::jsonb
WHERE modulos IS NOT NULL AND modulos != '{}'::jsonb
  AND NOT (modulos ? 'tesoreria');
