-- ═══════════════════════════════════════════════
-- MÓDULO DE CONTABILIDAD INTERMEDIA
-- Tablas: plan contable, asientos, líneas, ejercicios
-- ═══════════════════════════════════════════════

-- 1. Ejercicios fiscales
CREATE TABLE IF NOT EXISTS ejercicios_fiscales (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,              -- "2026", "2025"
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  estado          TEXT DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ejercicios_emp ON ejercicios_fiscales(empresa_id);

-- 2. Plan contable (PGC simplificado)
CREATE TABLE IF NOT EXISTS cuentas_contables (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo          TEXT NOT NULL,              -- "100", "4000", "7000"
  nombre          TEXT NOT NULL,              -- "Capital social", "Proveedores"
  tipo            TEXT NOT NULL CHECK (tipo IN (
    'activo','pasivo','patrimonio','ingreso','gasto'
  )),
  grupo           INT NOT NULL,               -- 1-7 (grupo PGC)
  padre_codigo    TEXT,                        -- código de la cuenta padre (ej: "40" para "4000")
  es_hoja         BOOLEAN DEFAULT true,        -- solo las hojas reciben apuntes
  activa          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_cuentas_cont_emp ON cuentas_contables(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_cont_codigo ON cuentas_contables(empresa_id, codigo);

-- 3. Asientos contables (cabecera)
CREATE TABLE IF NOT EXISTS asientos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          INT,                         -- nº asiento en el ejercicio
  fecha           DATE NOT NULL,
  descripcion     TEXT,
  origen          TEXT DEFAULT 'manual' CHECK (origen IN (
    'manual','factura_emitida','factura_recibida','cobro','pago','nomina','cierre','apertura'
  )),
  origen_ref      TEXT,                        -- referencia al doc origen (ej: "F-V1-0001")
  origen_id       BIGINT,                      -- id del doc origen
  estado          TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador','contabilizado','anulado')),
  ejercicio_id    BIGINT REFERENCES ejercicios_fiscales(id),
  usuario_id      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asientos_emp ON asientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asientos_fecha ON asientos(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asientos_ejercicio ON asientos(empresa_id, ejercicio_id);

-- 4. Líneas de asiento (apuntes al Debe / Haber)
CREATE TABLE IF NOT EXISTS lineas_asiento (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asiento_id      BIGINT NOT NULL REFERENCES asientos(id) ON DELETE CASCADE,
  cuenta_id       BIGINT NOT NULL REFERENCES cuentas_contables(id),
  cuenta_codigo   TEXT NOT NULL,               -- desnormalizado para consultas rápidas
  descripcion     TEXT,
  debe            NUMERIC(14,2) DEFAULT 0,
  haber           NUMERIC(14,2) DEFAULT 0,
  orden           INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lineas_asiento ON lineas_asiento(asiento_id);
CREATE INDEX IF NOT EXISTS idx_lineas_cuenta ON lineas_asiento(cuenta_id);

-- 5. RLS Policies
ALTER TABLE ejercicios_fiscales ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_contables ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineas_asiento ENABLE ROW LEVEL SECURITY;

-- Ejercicios: acceso por empresa
CREATE POLICY "ejercicios_emp" ON ejercicios_fiscales
  FOR ALL USING (empresa_id IN (
    SELECT empresa_id FROM perfiles WHERE id = auth.uid()
  ));

-- Cuentas contables: acceso por empresa
CREATE POLICY "cuentas_cont_emp" ON cuentas_contables
  FOR ALL USING (empresa_id IN (
    SELECT empresa_id FROM perfiles WHERE id = auth.uid()
  ));

-- Asientos: acceso por empresa
CREATE POLICY "asientos_emp" ON asientos
  FOR ALL USING (empresa_id IN (
    SELECT empresa_id FROM perfiles WHERE id = auth.uid()
  ));

-- Líneas asiento: acceso via asiento
CREATE POLICY "lineas_asiento_emp" ON lineas_asiento
  FOR ALL USING (asiento_id IN (
    SELECT id FROM asientos WHERE empresa_id IN (
      SELECT empresa_id FROM perfiles WHERE id = auth.uid()
    )
  ));

-- 6. Plan Contable PGC Simplificado — función para insertar cuentas base
CREATE OR REPLACE FUNCTION insertar_plan_contable_base(p_empresa_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Grupo 1: Financiación básica
  INSERT INTO cuentas_contables (empresa_id, codigo, nombre, tipo, grupo, es_hoja, padre_codigo) VALUES
    (p_empresa_id, '10',   'Capital',                    'patrimonio', 1, false, NULL),
    (p_empresa_id, '100',  'Capital social',             'patrimonio', 1, true,  '10'),
    (p_empresa_id, '11',   'Reservas',                   'patrimonio', 1, false, NULL),
    (p_empresa_id, '113',  'Reservas voluntarias',       'patrimonio', 1, true,  '11'),
    (p_empresa_id, '12',   'Resultados pendientes',      'patrimonio', 1, false, NULL),
    (p_empresa_id, '120',  'Remanente',                  'patrimonio', 1, true,  '12'),
    (p_empresa_id, '129',  'Resultado del ejercicio',    'patrimonio', 1, true,  '12'),
    (p_empresa_id, '17',   'Deudas a largo plazo',       'pasivo',     1, false, NULL),
    (p_empresa_id, '170',  'Deudas l/p con entidades',   'pasivo',     1, true,  '17'),

  -- Grupo 2: Activo no corriente (inmovilizado)
    (p_empresa_id, '21',   'Inmovilizado material',      'activo',     2, false, NULL),
    (p_empresa_id, '211',  'Construcciones',              'activo',     2, true,  '21'),
    (p_empresa_id, '213',  'Maquinaria',                  'activo',     2, true,  '21'),
    (p_empresa_id, '214',  'Utillaje',                    'activo',     2, true,  '21'),
    (p_empresa_id, '216',  'Mobiliario',                  'activo',     2, true,  '21'),
    (p_empresa_id, '217',  'Equipos informáticos',        'activo',     2, true,  '21'),
    (p_empresa_id, '218',  'Elementos de transporte',     'activo',     2, true,  '21'),
    (p_empresa_id, '28',   'Amortización acumulada',      'activo',     2, false, NULL),
    (p_empresa_id, '281',  'A.A. inmovilizado material',  'activo',     2, true,  '28'),

  -- Grupo 3: Existencias
    (p_empresa_id, '30',   'Existencias comerciales',    'activo',     3, false, NULL),
    (p_empresa_id, '300',  'Mercaderías',                'activo',     3, true,  '30'),
    (p_empresa_id, '31',   'Materias primas',            'activo',     3, false, NULL),
    (p_empresa_id, '310',  'Materias primas',            'activo',     3, true,  '31'),

  -- Grupo 4: Acreedores y deudores (lo más usado)
    (p_empresa_id, '40',   'Proveedores',                'pasivo',     4, false, NULL),
    (p_empresa_id, '400',  'Proveedores',                'pasivo',     4, true,  '40'),
    (p_empresa_id, '410',  'Acreedores varios',          'pasivo',     4, true,  '40'),
    (p_empresa_id, '43',   'Clientes',                   'activo',     4, false, NULL),
    (p_empresa_id, '430',  'Clientes',                   'activo',     4, true,  '43'),
    (p_empresa_id, '435',  'Clientes dudoso cobro',      'activo',     4, true,  '43'),
    (p_empresa_id, '47',   'Administraciones públicas',  'pasivo',     4, false, NULL),
    (p_empresa_id, '472',  'H.P. IVA soportado',         'activo',     4, true,  '47'),
    (p_empresa_id, '473',  'H.P. retenciones IRPF',      'activo',     4, true,  '47'),
    (p_empresa_id, '475',  'H.P. acreedora por IVA',     'pasivo',     4, true,  '47'),
    (p_empresa_id, '476',  'Org. Seg. Social acreedora',  'pasivo',    4, true,  '47'),
    (p_empresa_id, '477',  'H.P. IVA repercutido',       'pasivo',     4, true,  '47'),

  -- Grupo 5: Cuentas financieras (tesorería)
    (p_empresa_id, '52',   'Deudas c/p',                 'pasivo',     5, false, NULL),
    (p_empresa_id, '520',  'Deudas c/p con entidades',   'pasivo',     5, true,  '52'),
    (p_empresa_id, '57',   'Tesorería',                  'activo',     5, false, NULL),
    (p_empresa_id, '570',  'Caja',                       'activo',     5, true,  '57'),
    (p_empresa_id, '572',  'Bancos c/c',                 'activo',     5, true,  '57'),

  -- Grupo 6: Gastos
    (p_empresa_id, '60',   'Compras',                    'gasto',      6, false, NULL),
    (p_empresa_id, '600',  'Compras de mercaderías',     'gasto',      6, true,  '60'),
    (p_empresa_id, '602',  'Compras de materias primas', 'gasto',      6, true,  '60'),
    (p_empresa_id, '62',   'Servicios exteriores',       'gasto',      6, false, NULL),
    (p_empresa_id, '621',  'Arrendamientos',             'gasto',      6, true,  '62'),
    (p_empresa_id, '622',  'Reparaciones y conservación','gasto',      6, true,  '62'),
    (p_empresa_id, '623',  'Servicios profesionales',    'gasto',      6, true,  '62'),
    (p_empresa_id, '624',  'Transportes',                'gasto',      6, true,  '62'),
    (p_empresa_id, '625',  'Primas de seguros',          'gasto',      6, true,  '62'),
    (p_empresa_id, '626',  'Servicios bancarios',        'gasto',      6, true,  '62'),
    (p_empresa_id, '627',  'Publicidad',                 'gasto',      6, true,  '62'),
    (p_empresa_id, '628',  'Suministros',                'gasto',      6, true,  '62'),
    (p_empresa_id, '629',  'Otros servicios',            'gasto',      6, true,  '62'),
    (p_empresa_id, '63',   'Tributos',                   'gasto',      6, false, NULL),
    (p_empresa_id, '631',  'Otros tributos',             'gasto',      6, true,  '63'),
    (p_empresa_id, '64',   'Gastos de personal',         'gasto',      6, false, NULL),
    (p_empresa_id, '640',  'Sueldos y salarios',         'gasto',      6, true,  '64'),
    (p_empresa_id, '642',  'Seg. Social a cargo empresa','gasto',      6, true,  '64'),
    (p_empresa_id, '66',   'Gastos financieros',         'gasto',      6, false, NULL),
    (p_empresa_id, '662',  'Intereses de deudas',        'gasto',      6, true,  '66'),
    (p_empresa_id, '68',   'Dotaciones amortización',    'gasto',      6, false, NULL),
    (p_empresa_id, '681',  'Amort. inmov. material',     'gasto',      6, true,  '68'),

  -- Grupo 7: Ingresos
    (p_empresa_id, '70',   'Ventas',                     'ingreso',    7, false, NULL),
    (p_empresa_id, '700',  'Ventas de mercaderías',      'ingreso',    7, true,  '70'),
    (p_empresa_id, '705',  'Prestaciones de servicios',  'ingreso',    7, true,  '70'),
    (p_empresa_id, '75',   'Otros ingresos',             'ingreso',    7, false, NULL),
    (p_empresa_id, '752',  'Ingresos por arrendamientos','ingreso',    7, true,  '75'),
    (p_empresa_id, '759',  'Ingresos por servicios diversos','ingreso',7, true,  '75'),
    (p_empresa_id, '76',   'Ingresos financieros',       'ingreso',    7, false, NULL),
    (p_empresa_id, '769',  'Otros ingresos financieros', 'ingreso',    7, true,  '76'),
    (p_empresa_id, '77',   'Beneficios extraordinarios', 'ingreso',    7, false, NULL),
    (p_empresa_id, '771',  'Beneficios inmovilizado',    'ingreso',    7, true,  '77')
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
END;
$$;
