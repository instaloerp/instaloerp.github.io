-- ════════════════════════════════════════════════════════════════
--  VeriFactu — Tablas y configuración
--  instaloERP v1.1 · build 67+
-- ════════════════════════════════════════════════════════════════

-- 1. Configuración VeriFactu por empresa
CREATE TABLE IF NOT EXISTS verifactu_config (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id),
  activo        BOOLEAN DEFAULT false,
  modo          TEXT DEFAULT 'simulacion' CHECK (modo IN ('simulacion', 'test', 'produccion')),
  -- Datos del obligado emisor (se rellenan desde config empresa)
  nif           TEXT,          -- NIF empresa (9 chars)
  nombre_razon  TEXT,          -- Razón social
  -- Certificado digital (.pfx / .p12)
  certificado_storage_path TEXT,  -- Ruta en Supabase Storage
  certificado_password     TEXT,  -- Password del .pfx (encriptado)
  -- Datos del sistema informático (para el XML)
  nombre_sistema   TEXT DEFAULT 'instaloERP',
  id_sistema       TEXT DEFAULT '01',
  version_sistema  TEXT DEFAULT '1.1',
  numero_instalacion TEXT DEFAULT '001',
  -- Timestamps
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (empresa_id)
);

-- 2. Registro de envíos VeriFactu (blockchain local)
-- Cada fila = un RegistroAlta o RegistroAnulacion enviado (o pendiente)
CREATE TABLE IF NOT EXISTS verifactu_registros (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id),
  factura_id      BIGINT REFERENCES facturas(id),
  -- Tipo de registro
  tipo_registro   TEXT NOT NULL CHECK (tipo_registro IN ('alta', 'anulacion')),
  -- Identificación factura (campos usados en el hash)
  nif_emisor      TEXT NOT NULL,        -- 9 chars
  num_serie       TEXT NOT NULL,        -- Número factura (max 60)
  fecha_expedicion TEXT NOT NULL,       -- dd-MM-yyyy
  tipo_factura    TEXT,                  -- F1, F2, R1, R2, R3, R4, R5
  -- Importes (para el hash)
  cuota_total     NUMERIC(14,2),
  importe_total   NUMERIC(14,2),
  -- Hash / blockchain
  fecha_hora_huso TEXT,                 -- ISO 8601 con timezone
  huella          TEXT,                  -- SHA-256 hex (64 chars)
  huella_anterior TEXT,                  -- Hash del registro anterior
  es_primer_registro BOOLEAN DEFAULT false,
  -- Referencia al registro anterior en la cadena
  registro_anterior_id BIGINT REFERENCES verifactu_registros(id),
  -- Estado del envío
  estado          TEXT DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente',        -- Generado, pendiente de envío
    'enviado',          -- Enviado a AEAT, esperando respuesta
    'correcto',         -- AEAT aceptó
    'aceptado_errores', -- AEAT aceptó con errores
    'incorrecto',       -- AEAT rechazó
    'error_envio',      -- Error de red/certificado
    'simulado'          -- Modo simulación (validado local, sin envío)
  )),
  -- Respuesta AEAT
  csv_aeat         TEXT,                -- Código Seguro Verificación
  codigo_error     TEXT,
  descripcion_error TEXT,
  -- XML completo (para auditoría)
  xml_enviado      TEXT,
  xml_respuesta    TEXT,
  -- QR de validación
  qr_url           TEXT,
  -- Rectificativa: referencia a factura original
  factura_rectificada_num   TEXT,
  factura_rectificada_fecha TEXT,
  -- Timestamps
  created_at       TIMESTAMPTZ DEFAULT now(),
  enviado_at       TIMESTAMPTZ,
  respuesta_at     TIMESTAMPTZ
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_vf_reg_empresa ON verifactu_registros(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vf_reg_factura ON verifactu_registros(factura_id);
CREATE INDEX IF NOT EXISTS idx_vf_reg_estado  ON verifactu_registros(estado);
CREATE INDEX IF NOT EXISTS idx_vf_reg_huella  ON verifactu_registros(huella);

-- 3. Añadir columnas VeriFactu a la tabla facturas (si no existen)
-- Estas son las que ya preparamos en crearRectificativa()
DO $$ BEGIN
  ALTER TABLE facturas ADD COLUMN IF NOT EXISTS verifactu_estado TEXT;
  ALTER TABLE facturas ADD COLUMN IF NOT EXISTS verifactu_csv TEXT;
  ALTER TABLE facturas ADD COLUMN IF NOT EXISTS verifactu_qr_url TEXT;
  ALTER TABLE facturas ADD COLUMN IF NOT EXISTS verifactu_huella TEXT;
  ALTER TABLE facturas ADD COLUMN IF NOT EXISTS verifactu_enviado_at TIMESTAMPTZ;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 4. RLS (Row Level Security)
ALTER TABLE verifactu_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifactu_registros ENABLE ROW LEVEL SECURITY;

-- Políticas: usuarios solo ven datos de su empresa
CREATE POLICY IF NOT EXISTS "verifactu_config_empresa" ON verifactu_config
  FOR ALL USING (empresa_id IN (
    SELECT empresa_id FROM perfiles WHERE id = auth.uid()
  ));

CREATE POLICY IF NOT EXISTS "verifactu_registros_empresa" ON verifactu_registros
  FOR ALL USING (empresa_id IN (
    SELECT empresa_id FROM perfiles WHERE id = auth.uid()
  ));

-- ════════════════════════════════════════════════════════════════
--  NOTAS DE IMPLEMENTACIÓN
-- ════════════════════════════════════════════════════════════════
--
-- Hash SHA-256 para RegistroAlta (campos concatenados con &):
--   IDEmisorFactura & NumSerieFactura & FechaExpedicionFactura &
--   TipoFactura & CuotaTotal & ImporteTotal &
--   HuellaAnterior & FechaHoraHusoGenRegistro
--
-- Hash SHA-256 para RegistroAnulacion:
--   IDEmisorFacturaAnulada & NumSerieFacturaAnulada &
--   FechaExpedicionFacturaAnulada &
--   HuellaAnterior & FechaHoraHusoGenRegistro
--
-- QR URL (producción):
--   https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR
--     ?nif=NIF&numserie=NUM&fecha=dd-MM-yyyy&importe=TOTAL
--
-- QR URL (pruebas):
--   https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR
--     ?nif=NIF&numserie=NUM&fecha=dd-MM-yyyy&importe=TOTAL
--
-- Endpoints SOAP:
--   Test:  https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP
--   Prod:  https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP
-- ════════════════════════════════════════════════════════════════
