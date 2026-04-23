-- ═══════════════════════════════════════════════════════════════
-- AUTOMATIZACIONES + BANDEJA DE ENTRADA
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabla de reglas de automatización
CREATE TABLE IF NOT EXISTS automatizaciones (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  -- Condiciones de disparo (todas opcionales, se evalúan con AND)
  condicion_remitente   TEXT,          -- patrón: contiene este texto en el email del remitente
  condicion_asunto      TEXT,          -- patrón: contiene este texto en el asunto
  condicion_adjunto     TEXT,          -- patrón: nombre de adjunto contiene este texto (ej: ".pdf", "factura")
  condicion_cuerpo      TEXT,          -- patrón: cuerpo contiene este texto
  -- Acción a ejecutar
  accion          TEXT NOT NULL CHECK (accion IN (
    'crear_factura_prov',
    'crear_albaran_prov',
    'crear_pedido_compra',
    'procesar_nominas',
    'crear_cliente',
    'crear_tarea',
    'archivar_documento',
    'personalizada'
  )),
  -- Modo de ejecución
  modo            TEXT NOT NULL DEFAULT 'manual' CHECK (modo IN ('manual', 'automatico')),
  -- Configuración extra (mapeo de campos, plantilla, etc.)
  config          JSONB DEFAULT '{}',
  -- Estado
  activa          BOOLEAN DEFAULT true,
  -- Auditoría
  creado_por      UUID REFERENCES perfiles(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla bandeja de entrada (tareas detectadas)
CREATE TABLE IF NOT EXISTS bandeja_entrada (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  automatizacion_id BIGINT REFERENCES automatizaciones(id) ON DELETE SET NULL,
  correo_id       BIGINT,              -- referencia al correo que disparó la tarea
  -- Qué se detectó
  tipo            TEXT NOT NULL,        -- mismo valor que automatizaciones.accion
  titulo          TEXT NOT NULL,        -- resumen legible: "Factura de Proveedor X - 1.234€"
  descripcion     TEXT,                 -- detalle adicional
  -- Datos extraídos del correo/adjunto para pre-rellenar al ejecutar
  datos_extraidos JSONB DEFAULT '{}',
  -- Adjuntos relacionados (nombre + path en storage si ya se subió)
  adjuntos        JSONB DEFAULT '[]',
  -- Estado del flujo
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente',    -- detectado, esperando revisión
    'aprobado',     -- alguien lo aprobó, ejecutándose
    'completado',   -- acción ejecutada correctamente
    'rechazado',    -- descartado manualmente
    'error'         -- falló al ejecutar
  )),
  -- Resultado de la ejecución
  resultado_tipo  TEXT,                 -- ej: 'factura_proveedor', 'cliente', 'tarea'
  resultado_id    TEXT,                 -- ID del registro creado
  resultado_error TEXT,                 -- mensaje de error si falló
  -- Quién y cuándo
  ejecutado_por   UUID REFERENCES perfiles(id),
  ejecutado_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_automatizaciones_empresa ON automatizaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_bandeja_empresa_estado ON bandeja_entrada(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_bandeja_correo ON bandeja_entrada(correo_id);

-- 4. RLS
ALTER TABLE automatizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandeja_entrada ENABLE ROW LEVEL SECURITY;

-- Policies: cualquier usuario autenticado de la empresa puede ver y gestionar
CREATE POLICY "automatizaciones_empresa" ON automatizaciones
  FOR ALL USING (
    empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid())
  );

CREATE POLICY "bandeja_empresa" ON bandeja_entrada
  FOR ALL USING (
    empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid())
  );

-- 5. Trigger updated_at para automatizaciones
CREATE OR REPLACE FUNCTION update_automatizaciones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_automatizaciones_updated_at
  BEFORE UPDATE ON automatizaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_automatizaciones_updated_at();
