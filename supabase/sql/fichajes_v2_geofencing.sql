-- ═══════════════════════════════════════════════════════════════
--  FICHAJES V2 — Geofencing + Ausencias + Timeline
--  Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Añadir campos de geolocalización a trabajos (para geofencing)
ALTER TABLE trabajos
  ADD COLUMN IF NOT EXISTS latitud double precision,
  ADD COLUMN IF NOT EXISTS longitud double precision;

-- 2. Añadir campos de geolocalización a clientes (fallback)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS latitud double precision,
  ADD COLUMN IF NOT EXISTS longitud double precision;

-- 3. Ampliar tabla fichajes con campos de geofencing
ALTER TABLE fichajes
  ADD COLUMN IF NOT EXISTS latitud_entrada double precision,
  ADD COLUMN IF NOT EXISTS longitud_entrada double precision,
  ADD COLUMN IF NOT EXISTS latitud_salida double precision,
  ADD COLUMN IF NOT EXISTS longitud_salida double precision,
  ADD COLUMN IF NOT EXISTS trabajo_id bigint REFERENCES trabajos(id),
  ADD COLUMN IF NOT EXISTS cliente_id bigint REFERENCES clientes(id),
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'manual',  -- 'manual' | 'geofence' | 'auto'
  ADD COLUMN IF NOT EXISTS precision_gps integer,          -- metros de precisión GPS
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS dispositivo text;               -- user agent / device info

-- Migrar lat/lon existentes a entrada (los fichajes antiguos solo tenían un par)
UPDATE fichajes SET latitud_entrada = latitud, longitud_entrada = longitud
  WHERE latitud IS NOT NULL AND latitud_entrada IS NULL;

-- 4. Tabla de ausencias
CREATE TABLE IF NOT EXISTS ausencias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  usuario_id uuid NOT NULL REFERENCES auth.users(id),
  usuario_nombre text,
  tipo text NOT NULL DEFAULT 'permiso',  -- vacaciones | baja_medica | permiso | asuntos_propios | maternidad | paternidad | otro
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  dias_totales integer,
  motivo text,
  documento_url text,                     -- adjunto (justificante médico, etc.)
  estado text NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada
  aprobado_por uuid REFERENCES auth.users(id),
  aprobado_fecha timestamptz,
  observaciones_admin text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_ausencias_empresa_usuario ON ausencias(empresa_id, usuario_id);
CREATE INDEX IF NOT EXISTS idx_ausencias_estado ON ausencias(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_ausencias_fechas ON ausencias(empresa_id, fecha_inicio, fecha_fin);

-- 5. Tabla calendario laboral (días bloqueados por admin)
CREATE TABLE IF NOT EXISTS calendario_laboral (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  fecha date NOT NULL,
  tipo text NOT NULL DEFAULT 'festivo',  -- festivo | cierre_empresa | medio_dia
  descripcion text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(empresa_id, fecha)
);

-- 6. RLS Policies
ALTER TABLE ausencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_laboral ENABLE ROW LEVEL SECURITY;

-- Ausencias: cada usuario ve las suyas, admin ve todas de su empresa
CREATE POLICY "ausencias_select" ON ausencias FOR SELECT
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "ausencias_insert" ON ausencias FOR INSERT
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "ausencias_update" ON ausencias FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "ausencias_delete" ON ausencias FOR DELETE
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

-- Calendario laboral
CREATE POLICY "cal_lab_select" ON calendario_laboral FOR SELECT
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "cal_lab_insert" ON calendario_laboral FOR INSERT
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "cal_lab_update" ON calendario_laboral FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "cal_lab_delete" ON calendario_laboral FOR DELETE
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

-- 7. Índices adicionales para fichajes
CREATE INDEX IF NOT EXISTS idx_fichajes_geofence ON fichajes(empresa_id, usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_fichajes_trabajo ON fichajes(trabajo_id) WHERE trabajo_id IS NOT NULL;
