-- ═══════════════════════════════════════════════════════════
-- INSTALO ERP — Migración Supabase (versión limpia)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════

-- Limpieza previa (por si quedaron tablas a medias)
DROP TABLE IF EXISTS movimientos_stock CASCADE;
DROP TABLE IF EXISTS stock             CASCADE;
DROP TABLE IF EXISTS tareas_pendientes CASCADE;


-- ───────────────────────────────────────────────────────────
-- 1. COLUMNA NUEVA en perfiles
-- ───────────────────────────────────────────────────────────
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS acceso_almacen BOOLEAN DEFAULT false;


-- ───────────────────────────────────────────────────────────
-- 2. COLUMNAS NUEVAS en articulos
-- ───────────────────────────────────────────────────────────
ALTER TABLE articulos
  ADD COLUMN IF NOT EXISTS precio_coste NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(10,2) DEFAULT 0;


-- ───────────────────────────────────────────────────────────
-- 3. TABLA: stock
-- ───────────────────────────────────────────────────────────
CREATE TABLE stock (
  id           BIGSERIAL PRIMARY KEY,
  empresa_id   UUID          NOT NULL REFERENCES empresas(id)  ON DELETE CASCADE,
  articulo_id  BIGINT        NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
  cantidad     NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(10,2)          DEFAULT 0,
  updated_at   TIMESTAMPTZ            DEFAULT NOW(),
  UNIQUE (empresa_id, articulo_id)
);

CREATE INDEX idx_stock_empresa  ON stock(empresa_id);
CREATE INDEX idx_stock_articulo ON stock(articulo_id);

ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_empresa" ON stock FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));


-- ───────────────────────────────────────────────────────────
-- 4. TABLA: movimientos_stock
-- ───────────────────────────────────────────────────────────
CREATE TABLE movimientos_stock (
  id             BIGSERIAL PRIMARY KEY,
  empresa_id     UUID          NOT NULL REFERENCES empresas(id)  ON DELETE CASCADE,
  articulo_id    BIGINT        NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  tipo           TEXT          NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
  cantidad       NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  delta          NUMERIC(10,2) NOT NULL,
  notas          TEXT,
  usuario_id     UUID          REFERENCES perfiles(id),
  usuario_nombre TEXT,
  fecha          DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ            DEFAULT NOW()
);

CREATE INDEX idx_movstock_empresa  ON movimientos_stock(empresa_id);
CREATE INDEX idx_movstock_articulo ON movimientos_stock(articulo_id);
CREATE INDEX idx_movstock_fecha    ON movimientos_stock(fecha DESC);

ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movstock_empresa" ON movimientos_stock FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));


-- ───────────────────────────────────────────────────────────
-- 5. TABLA: tareas_pendientes
-- ───────────────────────────────────────────────────────────
CREATE TABLE tareas_pendientes (
  id                 BIGSERIAL PRIMARY KEY,
  empresa_id         UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  entidad_tipo       TEXT        NOT NULL,
  entidad_id         BIGINT,
  entidad_nombre     TEXT,
  titulo             TEXT        NOT NULL,
  campos_faltantes   TEXT[],
  origen             TEXT        DEFAULT 'auto',
  rol_asignado       TEXT        DEFAULT 'admin',
  estado             TEXT        DEFAULT 'pendiente' CHECK (estado IN ('pendiente','resuelta','ignorada')),
  usuario_creador_id UUID        REFERENCES perfiles(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tareas_empresa ON tareas_pendientes(empresa_id);
CREATE INDEX idx_tareas_estado  ON tareas_pendientes(estado);

ALTER TABLE tareas_pendientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tareas_empresa" ON tareas_pendientes FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));


-- ───────────────────────────────────────────────────────────
-- FIN — Verificación: debe devolver 3 filas con 0 en "filas"
-- ───────────────────────────────────────────────────────────
SELECT 'stock'              AS tabla, COUNT(*) AS filas FROM stock
UNION ALL
SELECT 'movimientos_stock',           COUNT(*) FROM movimientos_stock
UNION ALL
SELECT 'tareas_pendientes',           COUNT(*) FROM tareas_pendientes;
