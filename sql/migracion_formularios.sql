-- ═══════════════════════════════════════════════════════════════
--  MIGRACIÓN — Formularios estructurados en partes de trabajo
--  Fase 1: tablas + RLS + seed plantilla "Mantenimiento RITE"
--
--  Idempotente: se puede ejecutar varias veces sin duplicar.
--  Ejecutar en Supabase → SQL Editor.
--
--  Crea:
--    · form_plantillas          — definición del formulario
--    · form_plantilla_campos    — campos ordenados (con código estable y
--                                  visibilidad condicional)
--    · partes_formulario        — instancia rellenada por el operario
--
--  RLS:
--    · Patrón empresa_id IN (SELECT empresa_id FROM perfiles WHERE id=auth.uid())
--    · Acceso anon vía token_publico para Fase 5 (firma remota del formulario)
--
--  Seed por empresa (solo si no existe ya):
--    · "Mantenimiento RITE – Sala de calderas"  (categoría: rite)
--      con ramificación por TIPO DE MANTENIMIENTO:
--        MENSUAL (12 op)  ·  SEMESTRAL (11 op)  ·  ANUAL (8 op)  ·  CORRECTIVO (4 campos)
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. Tabla form_plantillas ──────────────────────────────────
CREATE TABLE IF NOT EXISTS form_plantillas (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre              TEXT NOT NULL,
  descripcion         TEXT,
  categoria           TEXT,
  version             INT  NOT NULL DEFAULT 1,
  activa              BOOLEAN DEFAULT true,
  plantilla_padre_id  BIGINT REFERENCES form_plantillas(id) ON DELETE SET NULL,
  created_by          UUID,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_plant_emp   ON form_plantillas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_form_plant_cat   ON form_plantillas(empresa_id, categoria, activa);
CREATE INDEX IF NOT EXISTS idx_form_plant_padre ON form_plantillas(plantilla_padre_id);


-- ─── 2. Tabla form_plantilla_campos ────────────────────────────
CREATE TABLE IF NOT EXISTS form_plantilla_campos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plantilla_id    BIGINT NOT NULL REFERENCES form_plantillas(id) ON DELETE CASCADE,
  orden           INT NOT NULL,
  codigo          TEXT,                     -- identificador estable opcional (ej: 'tipo_mantenimiento')
  tipo            TEXT NOT NULL,            -- texto | texto_largo | numero | fecha | hora |
                                            -- dropdown | checkbox | radio | foto | firma |
                                            -- seccion | tabla
  etiqueta        TEXT NOT NULL,
  obligatorio     BOOLEAN DEFAULT false,
  mostrar_si      JSONB,                    -- { codigo: 'campo', valor_in: ['A','B'] } | null
  config          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_form_plant_campos        ON form_plantilla_campos(plantilla_id, orden);
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_plant_codigo
  ON form_plantilla_campos(plantilla_id, codigo) WHERE codigo IS NOT NULL;


-- ─── 3. Tabla partes_formulario ────────────────────────────────
CREATE TABLE IF NOT EXISTS partes_formulario (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parte_id            BIGINT NOT NULL REFERENCES partes_trabajo(id) ON DELETE CASCADE,
  plantilla_id        BIGINT NOT NULL REFERENCES form_plantillas(id),
  plantilla_version   INT NOT NULL,                 -- congelado al asociar
  respuestas          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { campo_id: valor, ... }
  firma_cliente_form  TEXT,                         -- firma específica del formulario (Fase 5)
  estado              TEXT DEFAULT 'borrador',      -- borrador | completado | firmado
  token_publico       TEXT,                         -- token para enlace de firma remota
  firmado_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
-- 1 formulario por parte (cardinalidad acordada con Jordi)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partes_form_parte_unico
  ON partes_formulario(parte_id);
CREATE INDEX IF NOT EXISTS idx_partes_form_emp ON partes_formulario(empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partes_form_token
  ON partes_formulario(token_publico) WHERE token_publico IS NOT NULL;


-- ─── 4. Trigger updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION _form_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_form_plantillas_upd  ON form_plantillas;
CREATE TRIGGER       trg_form_plantillas_upd
  BEFORE UPDATE ON form_plantillas
  FOR EACH ROW EXECUTE FUNCTION _form_set_updated_at();

DROP TRIGGER IF EXISTS trg_partes_formulario_upd ON partes_formulario;
CREATE TRIGGER       trg_partes_formulario_upd
  BEFORE UPDATE ON partes_formulario
  FOR EACH ROW EXECUTE FUNCTION _form_set_updated_at();


-- ─── 5. RLS — habilitar ────────────────────────────────────────
ALTER TABLE form_plantillas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_plantilla_campos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE partes_formulario      ENABLE ROW LEVEL SECURITY;


-- ─── 6. RLS — políticas ────────────────────────────────────────
DO $$
BEGIN
  -- 6a. form_plantillas: acceso autenticado por empresa
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname='empresa_access' AND tablename='form_plantillas'
  ) THEN
    CREATE POLICY empresa_access ON form_plantillas
      FOR ALL TO public
      USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));
  END IF;

  -- 6b. form_plantilla_campos: heredan de la plantilla
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname='empresa_access' AND tablename='form_plantilla_campos'
  ) THEN
    CREATE POLICY empresa_access ON form_plantilla_campos
      FOR ALL TO public
      USING (
        plantilla_id IN (
          SELECT id FROM form_plantillas
          WHERE empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid())
        )
      );
  END IF;

  -- 6c. partes_formulario: acceso autenticado por empresa
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname='empresa_access' AND tablename='partes_formulario'
  ) THEN
    CREATE POLICY empresa_access ON partes_formulario
      FOR ALL TO public
      USING (empresa_id IN (SELECT empresa_id FROM perfiles WHERE id = auth.uid()));
  END IF;

  -- 6d. partes_formulario: SELECT anon vía token (firma remota — Fase 5)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname='anon_form_token_select' AND tablename='partes_formulario'
  ) THEN
    CREATE POLICY anon_form_token_select ON partes_formulario
      FOR SELECT TO anon
      USING (token_publico IS NOT NULL);
  END IF;

  -- 6e. partes_formulario: UPDATE anon vía token mientras no esté firmado
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname='anon_form_token_update' AND tablename='partes_formulario'
  ) THEN
    CREATE POLICY anon_form_token_update ON partes_formulario
      FOR UPDATE TO anon
      USING (token_publico IS NOT NULL AND estado <> 'firmado')
      WITH CHECK (token_publico IS NOT NULL);
  END IF;

  -- 6f. form_plantillas: SELECT anon cuando hay token activo (lectura página pública)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname='anon_form_plantilla_select' AND tablename='form_plantillas'
  ) THEN
    CREATE POLICY anon_form_plantilla_select ON form_plantillas
      FOR SELECT TO anon
      USING (
        EXISTS (
          SELECT 1 FROM partes_formulario pf
          WHERE pf.plantilla_id = form_plantillas.id
            AND pf.token_publico IS NOT NULL
        )
      );
  END IF;

  -- 6g. form_plantilla_campos: SELECT anon idem
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname='anon_form_campos_select' AND tablename='form_plantilla_campos'
  ) THEN
    CREATE POLICY anon_form_campos_select ON form_plantilla_campos
      FOR SELECT TO anon
      USING (
        plantilla_id IN (
          SELECT plantilla_id FROM partes_formulario
          WHERE token_publico IS NOT NULL
        )
      );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════
--  SEED — plantilla "Mantenimiento RITE – Sala de calderas"
--  Una plantilla por empresa, ramificada por TIPO DE MANTENIMIENTO
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_emp_id UUID;
  v_pid    BIGINT;
BEGIN
  FOR v_emp_id IN SELECT id FROM empresas LOOP

    IF NOT EXISTS (
      SELECT 1 FROM form_plantillas
      WHERE empresa_id = v_emp_id AND categoria = 'rite'
    ) THEN
      INSERT INTO form_plantillas (empresa_id, nombre, descripcion, categoria)
      VALUES (
        v_emp_id,
        'Mantenimiento RITE – Sala de calderas',
        'Parte de mantenimiento preventivo/correctivo conforme al RITE. La rama de operaciones se decide al elegir el TIPO DE MANTENIMIENTO.',
        'rite'
      ) RETURNING id INTO v_pid;

      -- ─── Cabecera (siempre) ────────────────────────────────
      INSERT INTO form_plantilla_campos (plantilla_id, orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config) VALUES
        (v_pid,  10, NULL,                'seccion',     'Datos de la visita', false, NULL, '{}'::jsonb),
        (v_pid,  20, 'visita_fecha',      'fecha',       'Visita realizada el', true,  NULL, '{}'::jsonb),
        (v_pid,  30, 'visita_hora',       'hora',        'Hora',                false, NULL, '{}'::jsonb),
        (v_pid,  40, 'tipo_mantenimiento','radio',       'TIPO DE MANTENIMIENTO', true, NULL,
          '{"opciones":["MENSUAL","SEMESTRAL","ANUAL","CORRECTIVO"]}'::jsonb);

      -- ─── Rama CORRECTIVO ───────────────────────────────────
      INSERT INTO form_plantilla_campos (plantilla_id, orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config) VALUES
        (v_pid, 100, NULL, 'seccion',     'Mantenimiento correctivo', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["CORRECTIVO"]}'::jsonb, '{}'::jsonb),
        (v_pid, 110, NULL, 'texto_largo', 'Descripción de la avería', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["CORRECTIVO"]}'::jsonb, '{}'::jsonb),
        (v_pid, 120, NULL, 'texto_largo', 'Causa', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["CORRECTIVO"]}'::jsonb, '{}'::jsonb),
        (v_pid, 130, NULL, 'texto_largo', 'Resolución', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["CORRECTIVO"]}'::jsonb, '{}'::jsonb),
        (v_pid, 140, NULL, 'texto_largo', 'Materiales utilizados', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["CORRECTIVO"]}'::jsonb, '{}'::jsonb);

      -- ─── Rama MENSUAL (12 operaciones × radio + observaciones) ─
      INSERT INTO form_plantilla_campos (plantilla_id, orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config) VALUES
        (v_pid, 200, NULL, 'seccion',     'Operaciones mensuales (M)', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 210, NULL, 'radio',       'Comprobación estanquidad y niveles refrigerante/aceite en equipos frigoríficos', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 211, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 220, NULL, 'radio',       'Limpieza del quemador de la caldera', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 221, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 230, NULL, 'radio',       'Revisión del vaso de expansión', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 231, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 240, NULL, 'radio',       'Revisión sistemas de tratamiento de agua', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 241, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 250, NULL, 'radio',       'Comprobación estanquidad cierre quemador-caldera', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 251, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 260, NULL, 'radio',       'Comprobación niveles de agua en circuitos', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 261, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 270, NULL, 'radio',       'Comprobación tarado elementos de seguridad', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 271, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 280, NULL, 'radio',       'Revisión y limpieza filtros de aire', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 281, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 290, NULL, 'radio',       'Revisión aparatos de humectación y enfriamiento evaporativo', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 291, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 300, NULL, 'radio',       'Revisión bombas y ventiladores', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 301, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 310, NULL, 'radio',       'Comprobación nivel de gasóleo en depósitos (avisar si es bajo)', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 311, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 320, NULL, 'radio',       'Purgar radiadores', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 321, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["MENSUAL"]}'::jsonb, '{}'::jsonb);

      -- ─── Rama SEMESTRAL (11 operaciones) ───────────────────
      INSERT INTO form_plantilla_campos (plantilla_id, orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config) VALUES
        (v_pid, 400, NULL, 'seccion',     'Operaciones semestrales (2A)', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 410, NULL, 'radio',       'Drenaje, limpieza y tratamiento de torres de refrigeración', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 411, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 420, NULL, 'radio',       'Comprobación y limpieza, si procede, de circuito de humos de calderas', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 421, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 430, NULL, 'radio',       'Comprobación y limpieza, si procede, de conductos de humos y chimenea', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 431, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 440, NULL, 'radio',       'Comprobación de material refractario', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 441, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 450, NULL, 'radio',       'Comprobación estanquidad de válvulas de interceptación', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 451, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 460, NULL, 'radio',       'Revisión y limpieza de filtros de agua', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 461, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 470, NULL, 'radio',       'Revisión y limpieza de aparatos de recuperación de calor', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 471, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 480, NULL, 'radio',       'Revisión de unidades terminales agua-aire', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 481, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 490, NULL, 'radio',       'Revisión de unidades terminales de distribución de aire', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 491, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 500, NULL, 'radio',       'Revisión equipos autónomos', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 501, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 510, NULL, 'radio',       'Revisión del sistema de control automático', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 511, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["SEMESTRAL"]}'::jsonb, '{}'::jsonb);

      -- ─── Rama ANUAL (8 operaciones) ────────────────────────
      INSERT INTO form_plantilla_campos (plantilla_id, orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config) VALUES
        (v_pid, 600, NULL, 'seccion',     'Operaciones anuales (A)', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 610, NULL, 'radio',       'Limpieza de los evaporadores', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 611, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 620, NULL, 'radio',       'Limpieza de los condensadores', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 621, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 630, NULL, 'radio',       'Revisión general de calderas individuales de gasóleo', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 631, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 640, NULL, 'radio',       'Comprobación estanquidad de circuitos de tuberías', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 641, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 650, NULL, 'radio',       'Revisión de baterías de intercambio térmico', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 651, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 660, NULL, 'radio',       'Revisión y limpieza de unidades de impulsión y retorno de aire', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 661, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 670, NULL, 'radio',       'Revisión del estado del aislamiento térmico', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 671, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb),

        (v_pid, 680, NULL, 'radio',       'Purgar radiadores', true,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{"opciones":["Correcto","Incorrecto","No aplica"]}'::jsonb),
        (v_pid, 681, NULL, 'texto_largo', 'Observaciones', false,
          '{"codigo":"tipo_mantenimiento","valor_in":["ANUAL"]}'::jsonb, '{}'::jsonb);

      -- ─── Cierre (siempre) ──────────────────────────────────
      INSERT INTO form_plantilla_campos (plantilla_id, orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config) VALUES
        (v_pid, 900, NULL, 'seccion',     'Observaciones y recomendaciones', false, NULL, '{}'::jsonb),
        (v_pid, 910, NULL, 'texto_largo', 'Observaciones / puntos de mejora detectados', false, NULL, '{}'::jsonb),
        (v_pid, 920, NULL, 'foto',        'Evidencias fotográficas',  false, NULL, '{"max":6}'::jsonb),
        (v_pid, 930, NULL, 'foto',        'Ticket de combustión',     false, NULL, '{"max":2}'::jsonb);

    END IF;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════
--  VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════

SELECT 'plantillas creadas' AS info, count(*) AS n FROM form_plantillas;
SELECT 'campos creados'     AS info, count(*) AS n FROM form_plantilla_campos;

SELECT p.id, p.empresa_id, p.nombre, p.categoria, p.version, p.activa,
       (SELECT count(*) FROM form_plantilla_campos c WHERE c.plantilla_id = p.id) AS n_campos
FROM form_plantillas p
ORDER BY p.empresa_id, p.categoria;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('form_plantillas','form_plantilla_campos','partes_formulario');

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('form_plantillas','form_plantilla_campos','partes_formulario')
ORDER BY tablename, policyname;
