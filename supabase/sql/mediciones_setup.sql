-- ════════════════════════════════════════════════════════════════
-- MEDICIONES (visitas técnicas) — visitar al cliente, tomar medidas
-- y generar presupuesto/parte después.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mediciones (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id   UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  cliente_id   BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  trabajo_id   BIGINT,                                     -- opcional, vincular a obra existente
  -- Identificación rápida
  tipo         TEXT NOT NULL CHECK (tipo IN ('ventanas','bano','suelo','pintura','otra')),
  titulo       TEXT,                                       -- p.ej. "Ventanas Salón + Cocina"
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  estado       TEXT NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador','medido','presupuestado','convertido','archivado')),
  -- Datos
  items        JSONB DEFAULT '[]'::jsonb,                  -- array de items con campos según tipo
  fotos        JSONB DEFAULT '[]'::jsonb,                  -- array de paths a storage
  notas        TEXT,
  -- Resultado al convertir a presupuesto/parte
  resultado_tipo TEXT,                                     -- 'presupuesto', 'parte', etc.
  resultado_id   BIGINT,
  -- Auditoría
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mediciones_empresa_fecha ON public.mediciones(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mediciones_cliente ON public.mediciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mediciones_usuario ON public.mediciones(usuario_id);

-- RLS
ALTER TABLE public.mediciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mediciones_empresa" ON public.mediciones;
CREATE POLICY "mediciones_empresa" ON public.mediciones
  FOR ALL USING (
    empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid())
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_mediciones_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mediciones_updated_at ON public.mediciones;
CREATE TRIGGER trg_mediciones_updated_at
  BEFORE UPDATE ON public.mediciones
  FOR EACH ROW EXECUTE FUNCTION public.update_mediciones_updated_at();

-- Realtime (opcional pero útil para sincronizar entre dispositivos del mismo admin)
ALTER PUBLICATION supabase_realtime ADD TABLE public.mediciones;

SELECT 'mediciones creada' AS status;
