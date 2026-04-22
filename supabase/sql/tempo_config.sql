-- ═══════════════════════════════════════════════════════════════
--  TEMPO — Tablas de configuración
--  Tipos de ausencia + Config empleado + Pausas fichaje
-- ═══════════════════════════════════════════════════════════════

-- 1. Tipos de ausencia configurables por empresa
CREATE TABLE IF NOT EXISTS tipos_ausencia (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nombre text NOT NULL,                    -- "Vacaciones", "Baja médica", "Permiso retribuido"...
  color text DEFAULT '#6366F1',            -- color visual
  consume_vacaciones boolean DEFAULT false, -- si descuenta de los días de vacaciones
  requiere_aprobacion boolean DEFAULT true,
  por_horas boolean DEFAULT false,         -- false=por días, true=por horas (ej: cita médica)
  activo boolean DEFAULT true,
  orden integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Insertar tipos por defecto (se ejecuta solo si la tabla está vacía)
-- Se insertarán desde el frontend al configurar la empresa

-- 2. Configuración Tempo por empleado
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS tempo_horas_semanales numeric DEFAULT 40,
  ADD COLUMN IF NOT EXISTS tempo_dias_vacaciones integer DEFAULT 22,
  ADD COLUMN IF NOT EXISTS tempo_dias_vacaciones_usados integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tempo_tipo_contrato text DEFAULT 'completa',  -- completa | parcial
  ADD COLUMN IF NOT EXISTS tempo_dias_laborales text DEFAULT 'L,M,X,J,V';  -- días que trabaja

-- 3. Pausas en fichajes (para pausa/reanudación)
ALTER TABLE fichajes
  ADD COLUMN IF NOT EXISTS pausas jsonb DEFAULT '[]',
  -- formato: [{inicio:"HH:MM", fin:"HH:MM"}, ...]
  ADD COLUMN IF NOT EXISTS horas_pausa numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'activo';
  -- activo | pausado | finalizado

-- 4. RLS para tipos_ausencia
ALTER TABLE tipos_ausencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_aus_select" ON tipos_ausencia FOR SELECT
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "tipos_aus_insert" ON tipos_ausencia FOR INSERT
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "tipos_aus_update" ON tipos_ausencia FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

CREATE POLICY "tipos_aus_delete" ON tipos_ausencia FOR DELETE
  USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));

-- 5. Publicación realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tipos_ausencia;

-- 6. Insertar tipos de ausencia por defecto para empresas que no tengan
-- (ejecutar después de crear la tabla)
INSERT INTO tipos_ausencia (empresa_id, nombre, color, consume_vacaciones, requiere_aprobacion, por_horas, orden)
SELECT e.id, t.nombre, t.color, t.consume_vacaciones, t.requiere_aprobacion, t.por_horas, t.orden
FROM empresas e
CROSS JOIN (VALUES
  ('Vacaciones',       '#10B981', true,  true,  false, 1),
  ('Baja médica',      '#EF4444', false, true,  false, 2),
  ('Permiso retribuido','#3B82F6', false, true,  false, 3),
  ('Asuntos propios',  '#F59E0B', false, true,  false, 4),
  ('Cita médica',      '#8B5CF6', false, true,  true,  5),
  ('Otro',             '#6B7280', false, true,  false, 6)
) AS t(nombre, color, consume_vacaciones, requiere_aprobacion, por_horas, orden)
WHERE NOT EXISTS (SELECT 1 FROM tipos_ausencia ta WHERE ta.empresa_id = e.id);
