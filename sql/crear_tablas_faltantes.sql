-- ═══════════════════════════════════════════════════════════════
--  CREAR TABLAS FALTANTES — instaloERP
--  1. mantenimientos (tabla principal)
--  2. revisiones_mantenimiento
--  3. documentos_mantenimiento
--  4. notas_mantenimiento
--  5. ALTER empresas: añadir columna config
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. MANTENIMIENTOS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS mantenimientos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  equipo          TEXT NOT NULL,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  TEXT,
  categoria       TEXT DEFAULT 'Caldera',
  periodicidad    TEXT DEFAULT 'anual' CHECK (periodicidad IN ('mensual','trimestral','semestral','anual')),
  estado          TEXT DEFAULT 'activo' CHECK (estado IN ('activo','pendiente','vencido','cancelado')),
  fecha_inicio    DATE,
  fecha_fin       DATE,
  proxima_revision DATE,
  importe         NUMERIC(12,2) DEFAULT 0,
  direccion       TEXT,
  observaciones   TEXT,
  checklist       JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mant_empresa ON mantenimientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mant_cliente ON mantenimientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mant_proxima ON mantenimientos(proxima_revision);

-- RLS
ALTER TABLE mantenimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mantenimientos_all" ON mantenimientos
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 2. REVISIONES DE MANTENIMIENTO ──────────────────────────
CREATE TABLE IF NOT EXISTS revisiones_mantenimiento (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  mantenimiento_id  BIGINT NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
  fecha_prevista    DATE,
  fecha             DATE,
  estado            TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','realizada','cancelada')),
  operario_nombre   TEXT,
  operario_id       UUID,
  parte_id          BIGINT,
  observaciones     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rev_mant ON revisiones_mantenimiento(mantenimiento_id);

ALTER TABLE revisiones_mantenimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rev_mant_all" ON revisiones_mantenimiento
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. DOCUMENTOS DE MANTENIMIENTO ─────────────────────────
CREATE TABLE IF NOT EXISTS documentos_mantenimiento (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  mantenimiento_id  BIGINT NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  tipo              TEXT DEFAULT 'otro',
  url               TEXT,
  path              TEXT,
  tamaño            BIGINT DEFAULT 0,
  creado_por        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_mant ON documentos_mantenimiento(mantenimiento_id);

ALTER TABLE documentos_mantenimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_mant_all" ON documentos_mantenimiento
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 4. NOTAS DE MANTENIMIENTO ──────────────────────────────
CREATE TABLE IF NOT EXISTS notas_mantenimiento (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  mantenimiento_id  BIGINT NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
  texto             TEXT NOT NULL,
  tipo              TEXT DEFAULT 'nota',
  creado_por        UUID,
  creado_por_nombre TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nota_mant ON notas_mantenimiento(mantenimiento_id);

ALTER TABLE notas_mantenimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nota_mant_all" ON notas_mantenimiento
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 5. AÑADIR COLUMNA CONFIG A EMPRESAS ────────────────────
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- ═══════════════════════════════════════════════════════════════
--  VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
SELECT 'mantenimientos' AS tabla, COUNT(*) FROM mantenimientos
UNION ALL SELECT 'revisiones_mantenimiento', COUNT(*) FROM revisiones_mantenimiento
UNION ALL SELECT 'documentos_mantenimiento', COUNT(*) FROM documentos_mantenimiento
UNION ALL SELECT 'notas_mantenimiento', COUNT(*) FROM notas_mantenimiento;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'empresas' AND column_name = 'config';
