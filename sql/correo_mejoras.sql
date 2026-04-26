-- ═══════════════════════════════════════════════
-- Correo: mejoras Spark-style (destacados, etiquetas, snooze, programado, plantillas)
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════

-- 1. Columna destacado (estrella)
ALTER TABLE correos ADD COLUMN IF NOT EXISTS destacado boolean DEFAULT false;

-- 2. Columna etiqueta (color/categoría)
ALTER TABLE correos ADD COLUMN IF NOT EXISTS etiqueta text;

-- 3. Columna snooze (posponer hasta fecha)
ALTER TABLE correos ADD COLUMN IF NOT EXISTS snooze_hasta timestamptz;

-- 4. Columna envío programado
ALTER TABLE correos ADD COLUMN IF NOT EXISTS envio_programado timestamptz;

-- 5. Tabla de plantillas de respuesta rápida
CREATE TABLE IF NOT EXISTS correo_plantillas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id bigint REFERENCES empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  contenido text NOT NULL,
  categoria text DEFAULT 'general',
  orden int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS para plantillas
ALTER TABLE correo_plantillas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "correo_plantillas_empresa" ON correo_plantillas;
CREATE POLICY "correo_plantillas_empresa" ON correo_plantillas
  FOR ALL USING (empresa_id = (SELECT empresa_id FROM perfiles WHERE user_id = auth.uid()));

-- Insertar plantillas de ejemplo
INSERT INTO correo_plantillas (empresa_id, nombre, contenido, categoria, orden)
SELECT e.id, p.nombre, p.contenido, p.categoria, p.orden
FROM empresas e,
(VALUES
  ('Acuse de recibo', 'Buenos días,

Acusamos recibo de su correo. Le confirmaremos en breve.

Un saludo.', 'general', 1),
  ('Solicitar presupuesto', 'Buenos días,

Nos gustaría solicitar presupuesto para los siguientes trabajos:

[Describir trabajos]

Quedamos a la espera de su respuesta.

Un saludo.', 'compras', 2),
  ('Confirmar pedido', 'Buenos días,

Le confirmamos el pedido de los materiales indicados. Por favor, confirme plazo de entrega.

Un saludo.', 'compras', 3),
  ('Envío factura', 'Buenos días,

Adjuntamos factura correspondiente a los trabajos realizados. El plazo de pago es de 30 días.

Quedamos a su disposición para cualquier consulta.

Un saludo.', 'ventas', 4)
) AS p(nombre, contenido, categoria, orden)
WHERE NOT EXISTS (SELECT 1 FROM correo_plantillas WHERE correo_plantillas.empresa_id = e.id LIMIT 1);

-- Índice para snooze (buscar correos con snooze vencido)
CREATE INDEX IF NOT EXISTS idx_correos_snooze ON correos (snooze_hasta) WHERE snooze_hasta IS NOT NULL;
