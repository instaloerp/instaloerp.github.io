-- ════════════════════════════════════════════════════════════════════════════
--  instaloERP — Script de instalación completo
--  Versión: 1.1 · Fecha: 2026-04-19
-- ════════════════════════════════════════════════════════════════════════════
--  Este script crea TODAS las tablas, columnas, índices, políticas RLS
--  y funciones necesarias para una instalación limpia de instaloERP.
--
--  ✅ IDEMPOTENTE: se puede ejecutar varias veces sin riesgo.
--     Usa IF NOT EXISTS, DO $$ blocks y ADD COLUMN IF NOT EXISTS.
--
--  📋 INSTRUCCIONES:
--     1. Crear proyecto en Supabase (supabase.com)
--     2. Ir a SQL Editor
--     3. Pegar este script COMPLETO y ejecutar
--     4. Crear los Storage Buckets (ver sección final)
--     5. Configurar la empresa desde el ERP
--
--  ⚠️  REQUISITOS PREVIOS:
--     - Supabase con Auth activado
--     - Al menos 1 usuario registrado en Auth
-- ════════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  1. CORE — Empresas y Perfiles                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS empresas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre          TEXT NOT NULL,
  razon_social    TEXT,
  cif             TEXT,
  telefono        TEXT,
  email           TEXT,
  direccion       TEXT,
  cp              TEXT,
  municipio       TEXT,
  provincia       TEXT,
  logo_url        TEXT,
  plan            TEXT DEFAULT 'trial',
  licencia_hasta  TIMESTAMPTZ,
  config          JSONB DEFAULT '{}',
  config_firma    JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS perfiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT,
  email           TEXT,
  telefono        TEXT,
  rol             TEXT DEFAULT 'usuario' CHECK (rol IN ('admin','usuario','tecnico','comercial','almacen','lectura')),
  activo          BOOLEAN DEFAULT true,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  2. CONFIGURACIÓN — IVA, Unidades, Formas de pago, Series           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS tipos_iva (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  porcentaje      NUMERIC(5,2) NOT NULL,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unidades_medida (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  abreviatura     TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS formas_pago (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  plazo_dias      INT DEFAULT 0,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS series_numeracion (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,
  prefijo         TEXT,
  contador        INT DEFAULT 0,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  3. CLIENTES                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS clientes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  razon_social    TEXT,
  nif             TEXT,
  telefono        TEXT,
  telefonos       JSONB DEFAULT '[]',
  email           TEXT,
  direccion_fiscal TEXT,
  municipio_fiscal TEXT,
  provincia_fiscal TEXT,
  cp_fiscal       TEXT,
  contacto_principal TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);

CREATE TABLE IF NOT EXISTS contactos_cliente (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id      BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre          TEXT,
  cargo           TEXT,
  telefono        TEXT,
  email           TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contactos_cliente ON contactos_cliente(cliente_id);

CREATE TABLE IF NOT EXISTS direcciones_cliente (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id      BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo            TEXT DEFAULT 'obra',
  direccion       TEXT,
  municipio       TEXT,
  provincia       TEXT,
  cp              TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_direcciones_cliente ON direcciones_cliente(cliente_id);

CREATE TABLE IF NOT EXISTS documentos_cliente (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id      BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  tipo            TEXT DEFAULT 'otro',
  url             TEXT,
  path            TEXT,
  tamaño          BIGINT DEFAULT 0,
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_cliente ON documentos_cliente(cliente_id);

CREATE TABLE IF NOT EXISTS notas_cliente (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id      BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  texto           TEXT NOT NULL,
  tipo            TEXT DEFAULT 'nota',
  creado_por      UUID,
  creado_por_nombre TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notas_cliente ON notas_cliente(cliente_id);

CREATE TABLE IF NOT EXISTS cuentas_bancarias_entidad (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
  nombre          TEXT,
  iban            TEXT,
  entidad         TEXT,
  titular         TEXT,
  predeterminada  BOOLEAN DEFAULT false,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias ON cuentas_bancarias_entidad(empresa_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  4. PROVEEDORES                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS proveedores (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  razon_social    TEXT,
  nif             TEXT,
  telefono        TEXT,
  email           TEXT,
  direccion       TEXT,
  municipio       TEXT,
  provincia       TEXT,
  cp              TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa ON proveedores(empresa_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  5. ARTÍCULOS, FAMILIAS, SERVICIOS y ALMACÉN                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS familias_articulos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  orden           INT DEFAULT 0,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articulos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo          TEXT,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  precio_venta    NUMERIC(12,2) DEFAULT 0,
  precio_compra   NUMERIC(12,2) DEFAULT 0,
  familia_id      BIGINT REFERENCES familias_articulos(id) ON DELETE SET NULL,
  unidad_medida   TEXT,
  iva             NUMERIC(5,2) DEFAULT 21,
  stock_minimo    NUMERIC(12,2) DEFAULT 0,
  imagen_url      TEXT,
  foto_url        TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articulos_empresa ON articulos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_articulos_familia ON articulos(familia_id);

CREATE TABLE IF NOT EXISTS articulos_historial (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  articulo_id     BIGINT NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cambio          JSONB,
  usuario_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_art_hist ON articulos_historial(articulo_id);

CREATE TABLE IF NOT EXISTS servicios (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo          TEXT,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  precio_venta    NUMERIC(12,2) DEFAULT 0,
  familia_id      BIGINT REFERENCES familias_articulos(id) ON DELETE SET NULL,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servicios_empresa ON servicios(empresa_id);

CREATE TABLE IF NOT EXISTS almacenes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  ubicacion       TEXT,
  responsable     TEXT,
  responsable_id  UUID,
  tipo            TEXT DEFAULT 'almacen',
  vehiculo_id     BIGINT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacenes_empresa ON almacenes(empresa_id);

CREATE TABLE IF NOT EXISTS stock (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  articulo_id     BIGINT NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
  almacen_id      BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  cantidad        NUMERIC(12,2) DEFAULT 0,
  cantidad_reservada NUMERIC(12,2) DEFAULT 0,
  ultima_actualizacion TIMESTAMPTZ DEFAULT now(),
  UNIQUE (articulo_id, almacen_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_empresa ON stock(empresa_id);
CREATE INDEX IF NOT EXISTS idx_stock_articulo ON stock(articulo_id);
CREATE INDEX IF NOT EXISTS idx_stock_almacen ON stock(almacen_id);

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  articulo_id     BIGINT NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
  almacen_id      BIGINT REFERENCES almacenes(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL,
  cantidad        NUMERIC(12,2) NOT NULL,
  referencia      TEXT,
  fecha           TIMESTAMPTZ DEFAULT now(),
  usuario_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mov_stock_empresa ON movimientos_stock(empresa_id);

CREATE TABLE IF NOT EXISTS traspasos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  almacen_origen_id  BIGINT REFERENCES almacenes(id) ON DELETE SET NULL,
  almacen_destino_id BIGINT REFERENCES almacenes(id) ON DELETE SET NULL,
  fecha           DATE DEFAULT CURRENT_DATE,
  estado          TEXT DEFAULT 'borrador',
  lineas          JSONB DEFAULT '[]',
  observaciones   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidencias_stock (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  articulo_id     BIGINT REFERENCES articulos(id) ON DELETE SET NULL,
  almacen_id      BIGINT REFERENCES almacenes(id) ON DELETE SET NULL,
  tipo            TEXT,
  descripcion     TEXT,
  fecha           TIMESTAMPTZ DEFAULT now(),
  usuario_id      UUID,
  resuelto        BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articulos_proveedores (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  articulo_id     BIGINT NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
  proveedor_id    BIGINT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  codigo_proveedor TEXT,
  precio          NUMERIC(12,2),
  plazo_entrega   INT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_art_prov ON articulos_proveedores(articulo_id, proveedor_id);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  6. VENTAS — Presupuestos, Albaranes, Facturas                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS presupuestos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  validez         DATE,
  estado          TEXT DEFAULT 'borrador' CHECK (estado IN (
    'borrador','pendiente','aceptado','rechazado','facturado','anulado','eliminado'
  )),
  titulo          TEXT,
  observaciones   TEXT,
  lineas          JSONB DEFAULT '[]',
  base_imponible  NUMERIC(12,2) DEFAULT 0,
  total_iva       NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  forma_pago      TEXT,
  firma_token     TEXT,
  firma_url       TEXT,
  firma_fecha     TIMESTAMPTZ,
  trabajo_id      BIGINT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_empresa ON presupuestos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_cliente ON presupuestos(cliente_id);

CREATE TABLE IF NOT EXISTS presupuesto_versiones (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID,
  presupuesto_id  BIGINT NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  version         INT NOT NULL DEFAULT 1,
  snapshot        JSONB NOT NULL,
  usuario_id      UUID,
  usuario_nombre  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pv_presupuesto ON presupuesto_versiones(presupuesto_id);

CREATE TABLE IF NOT EXISTS albaranes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  estado          TEXT DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente','facturado','anulado','eliminado'
  )),
  observaciones   TEXT,
  lineas          JSONB DEFAULT '[]',
  base_imponible  NUMERIC(12,2) DEFAULT 0,
  total_iva       NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  trabajo_id      BIGINT,
  oculto          BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_albaranes_empresa ON albaranes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_cliente ON albaranes(cliente_id);

CREATE TABLE IF NOT EXISTS facturas (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  TEXT,
  cliente_nif     TEXT,
  cliente_direccion TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  estado          TEXT DEFAULT 'borrador' CHECK (estado IN (
    'borrador','pendiente','cobrada','vencida','anulada','rectificada','eliminado'
  )),
  observaciones   TEXT,
  lineas          JSONB DEFAULT '[]',
  base_imponible  NUMERIC(12,2) DEFAULT 0,
  total_iva       NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  forma_pago      TEXT,
  firma_token     TEXT,
  firma_url       TEXT,
  firma_fecha     TIMESTAMPTZ,
  trabajo_id      BIGINT,
  borrador_origen TEXT,
  -- Rectificativas
  rectificativa_de             BIGINT REFERENCES facturas(id) ON DELETE SET NULL,
  factura_rectificada_numero   TEXT,
  factura_rectificada_fecha    DATE,
  tipo_rectificativa           TEXT,
  tipo_rectificacion           TEXT DEFAULT 'I',
  base_rectificada             NUMERIC(12,2),
  cuota_rectificada            NUMERIC(12,2),
  -- VeriFactu
  verifactu_estado    TEXT,
  verifactu_csv       TEXT,
  verifactu_qr_url    TEXT,
  verifactu_huella    TEXT,
  verifactu_enviado_at TIMESTAMPTZ,
  clave_regimen       TEXT DEFAULT '01',
  calificacion_operacion TEXT DEFAULT 'S1',
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facturas_empresa ON facturas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado  ON facturas(estado);

CREATE TABLE IF NOT EXISTS factura_versiones (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID,
  factura_id      BIGINT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  version         INT NOT NULL DEFAULT 1,
  snapshot        JSONB NOT NULL,
  usuario_id      UUID,
  usuario_nombre  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fv_factura ON factura_versiones(factura_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  7. COMPRAS — Presupuestos, Pedidos, Recepciones, Facturas prov.    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS presupuestos_compra (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  proveedor_id    BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  estado          TEXT DEFAULT 'borrador',
  observaciones   TEXT,
  lineas          JSONB DEFAULT '[]',
  base_imponible  NUMERIC(12,2) DEFAULT 0,
  total_iva       NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  trabajo_id      BIGINT,
  -- Versionado
  version_padre_id BIGINT REFERENCES presupuestos_compra(id) ON DELETE SET NULL,
  version_num      INT DEFAULT 1,
  version_activa   BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prc_empresa ON presupuestos_compra(empresa_id);
CREATE INDEX IF NOT EXISTS idx_prc_version_padre ON presupuestos_compra(version_padre_id);

CREATE TABLE IF NOT EXISTS pedidos_compra (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  proveedor_id    BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  estado          TEXT DEFAULT 'borrador',
  observaciones   TEXT,
  lineas          JSONB DEFAULT '[]',
  base_imponible  NUMERIC(12,2) DEFAULT 0,
  total_iva       NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  trabajo_id      BIGINT,
  presupuesto_compra_id BIGINT REFERENCES presupuestos_compra(id) ON DELETE SET NULL,
  -- Versionado
  version_padre_id BIGINT REFERENCES pedidos_compra(id) ON DELETE SET NULL,
  version_num      INT DEFAULT 1,
  version_activa   BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_empresa ON pedidos_compra(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pc_version_padre ON pedidos_compra(version_padre_id);

CREATE TABLE IF NOT EXISTS recepciones (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  proveedor_id    BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  estado          TEXT DEFAULT 'borrador',
  observaciones   TEXT,
  lineas          JSONB DEFAULT '[]',
  base_imponible  NUMERIC(12,2) DEFAULT 0,
  total_iva       NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  trabajo_id      BIGINT,
  pedido_compra_id BIGINT REFERENCES pedidos_compra(id) ON DELETE SET NULL,
  presupuesto_compra_id BIGINT REFERENCES presupuestos_compra(id) ON DELETE SET NULL,
  -- Versionado
  version_padre_id BIGINT REFERENCES recepciones(id) ON DELETE SET NULL,
  version_num      INT DEFAULT 1,
  version_activa   BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rc_empresa ON recepciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rc_version_padre ON recepciones(version_padre_id);

CREATE TABLE IF NOT EXISTS facturas_proveedor (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  proveedor_id    BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  estado          TEXT DEFAULT 'pendiente',
  observaciones   TEXT,
  lineas          JSONB DEFAULT '[]',
  base_imponible  NUMERIC(12,2) DEFAULT 0,
  total_iva       NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  trabajo_id      BIGINT,
  presupuesto_compra_id BIGINT REFERENCES presupuestos_compra(id) ON DELETE SET NULL,
  pedido_compra_id      BIGINT REFERENCES pedidos_compra(id) ON DELETE SET NULL,
  recepcion_id          BIGINT REFERENCES recepciones(id) ON DELETE SET NULL,
  recepcion_ids         BIGINT[],
  -- Versionado
  version_padre_id BIGINT REFERENCES facturas_proveedor(id) ON DELETE SET NULL,
  version_num      INT DEFAULT 1,
  version_activa   BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_empresa ON facturas_proveedor(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fp_version_padre ON facturas_proveedor(version_padre_id);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_pedido ON facturas_proveedor(pedido_compra_id);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_recepcion ON facturas_proveedor(recepcion_id);

CREATE TABLE IF NOT EXISTS pagos_proveedor (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  factura_id      BIGINT REFERENCES facturas_proveedor(id) ON DELETE CASCADE,
  fecha           DATE DEFAULT CURRENT_DATE,
  importe         NUMERIC(12,2) NOT NULL,
  forma_pago      TEXT,
  estado          TEXT DEFAULT 'pendiente',
  observaciones   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagos_prov ON pagos_proveedor(factura_id);

CREATE TABLE IF NOT EXISTS documentos_factura_prov (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  factura_id      BIGINT NOT NULL REFERENCES facturas_proveedor(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  tipo            TEXT DEFAULT 'otro',
  url             TEXT,
  path            TEXT,
  tamaño          BIGINT DEFAULT 0,
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_fp ON documentos_factura_prov(factura_id);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  8. OBRAS — Trabajos, Partes, Tareas, Pedidos almacén               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS trabajos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          TEXT,
  nombre          TEXT NOT NULL,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  TEXT,
  direccion       TEXT,
  estado          TEXT DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente','en_curso','pausado','finalizado','cancelado','eliminado'
  )),
  fecha_inicio    DATE,
  fecha_prevista_fin DATE,
  fecha_fin       DATE,
  descripcion     TEXT,
  responsable_id  UUID,
  responsable_nombre TEXT,
  observaciones   TEXT,
  presupuesto_total NUMERIC(12,2) DEFAULT 0,
  coste_total     NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trabajos_empresa ON trabajos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_cliente ON trabajos(cliente_id);

CREATE TABLE IF NOT EXISTS partes_trabajo (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  trabajo_id      BIGINT NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  numero          TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  operarios       JSONB DEFAULT '[]',
  actividades     JSONB DEFAULT '[]',
  estado          TEXT DEFAULT 'borrador' CHECK (estado IN (
    'borrador','validado','facturado','anulado'
  )),
  observaciones   TEXT,
  fotos           JSONB DEFAULT '[]',
  firma_cliente   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partes_empresa ON partes_trabajo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_partes_trabajo ON partes_trabajo(trabajo_id);

CREATE TABLE IF NOT EXISTS consumos_parte (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parte_id        BIGINT NOT NULL REFERENCES partes_trabajo(id) ON DELETE CASCADE,
  articulo_id     BIGINT REFERENCES articulos(id) ON DELETE SET NULL,
  articulo_nombre TEXT,
  cantidad        NUMERIC(12,2) DEFAULT 1,
  precio          NUMERIC(12,2) DEFAULT 0,
  almacen_id      BIGINT REFERENCES almacenes(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consumos_parte ON consumos_parte(parte_id);

CREATE TABLE IF NOT EXISTS tareas_obra (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trabajo_id      BIGINT NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  descripcion     TEXT NOT NULL,
  estado          TEXT DEFAULT 'pendiente',
  fecha_inicio    DATE,
  fecha_fin       DATE,
  responsable_id  UUID,
  responsable_nombre TEXT,
  orden           INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tareas_obra ON tareas_obra(trabajo_id);

CREATE TABLE IF NOT EXISTS tareas_pendientes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  descripcion     TEXT NOT NULL,
  asignado_a      UUID,
  asignado_nombre TEXT,
  trabajo_id      BIGINT REFERENCES trabajos(id) ON DELETE SET NULL,
  vencimiento     DATE,
  completado      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tareas_pend ON tareas_pendientes(empresa_id);

CREATE TABLE IF NOT EXISTS operarios_obra (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trabajo_id      BIGINT NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  usuario_id      UUID,
  nombre          TEXT,
  rol             TEXT,
  fecha_inicio    DATE,
  fecha_fin       DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operarios_obra ON operarios_obra(trabajo_id);

CREATE TABLE IF NOT EXISTS pedidos_almacen (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  trabajo_id      BIGINT REFERENCES trabajos(id) ON DELETE SET NULL,
  numero          TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  estado          TEXT DEFAULT 'pendiente',
  lineas          JSONB DEFAULT '[]',
  observaciones   TEXT,
  solicitado_por  UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ped_alm ON pedidos_almacen(empresa_id);

CREATE TABLE IF NOT EXISTS notas_trabajo (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trabajo_id      BIGINT NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  texto           TEXT NOT NULL,
  tipo            TEXT DEFAULT 'nota',
  creado_por      UUID,
  creado_por_nombre TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notas_trabajo ON notas_trabajo(trabajo_id);

CREATE TABLE IF NOT EXISTS documentos_trabajo (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trabajo_id      BIGINT NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  tipo            TEXT DEFAULT 'otro',
  url             TEXT,
  path            TEXT,
  tamaño          BIGINT DEFAULT 0,
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_trabajo ON documentos_trabajo(trabajo_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  9. MANTENIMIENTOS                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

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
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mant_empresa ON mantenimientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mant_cliente ON mantenimientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mant_proxima ON mantenimientos(proxima_revision);

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
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rev_mant ON revisiones_mantenimiento(mantenimiento_id);

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
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_mant ON documentos_mantenimiento(mantenimiento_id);

CREATE TABLE IF NOT EXISTS notas_mantenimiento (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  mantenimiento_id  BIGINT NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
  texto             TEXT NOT NULL,
  tipo              TEXT DEFAULT 'nota',
  creado_por        UUID,
  creado_por_nombre TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nota_mant ON notas_mantenimiento(mantenimiento_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  10. FLOTA — Vehículos y Gastos                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS vehiculos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  matricula       TEXT,
  fecha_compra    DATE,
  precio_compra   NUMERIC(12,2),
  amort_meses     INT DEFAULT 96,
  seguro_anual    NUMERIC(12,2),
  impuesto_anual  NUMERIC(12,2),
  movertis_unit_id INT,
  conductor_id    UUID,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehiculos_empresa ON vehiculos(empresa_id);

CREATE TABLE IF NOT EXISTS vehiculo_gastos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vehiculo_id     BIGINT REFERENCES vehiculos(id) ON DELETE CASCADE,
  concepto        TEXT DEFAULT 'otros',
  importe         NUMERIC(12,2) NOT NULL,
  fecha           DATE DEFAULT CURRENT_DATE,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_veh_gastos ON vehiculo_gastos(empresa_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  11. PERSONAL — Fichajes                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS fichajes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL,
  fecha           DATE DEFAULT CURRENT_DATE,
  hora_entrada    TIMESTAMPTZ,
  hora_salida     TIMESTAMPTZ,
  duracion_minutos INT,
  tipo            TEXT DEFAULT 'normal',
  observaciones   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fichajes_empresa ON fichajes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fichajes_usuario ON fichajes(usuario_id);

CREATE TABLE IF NOT EXISTS fichajes_ajustes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fichaje_id      BIGINT NOT NULL REFERENCES fichajes(id) ON DELETE CASCADE,
  usuario_id      UUID,
  ajuste_minutos  INT NOT NULL,
  razon           TEXT,
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  12. DOCUMENTOS, OCR y CERTIFICADOS                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS documentos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  tipo            TEXT DEFAULT 'otro',
  url             TEXT,
  path            TEXT,
  tamaño          BIGINT DEFAULT 0,
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documentos_ocr (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT,
  tipo            TEXT,
  archivo_path    TEXT,
  datos_extraidos JSONB,
  estado          TEXT DEFAULT 'pendiente',
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documentos_generados (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT,
  tipo            TEXT,
  entidad_tipo    TEXT,
  entidad_id      TEXT,
  documento_id    BIGINT,
  url             TEXT,
  path            TEXT,
  hash_contenido  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docgen_entidad ON documentos_generados(entidad_tipo, entidad_id);

CREATE TABLE IF NOT EXISTS certificados_digitales (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  titular         TEXT,
  nif_titular     TEXT,
  tipo            TEXT,
  archivo_url     TEXT,
  archivo_path    TEXT,
  password_cifrado TEXT,
  fecha_caducidad DATE,
  activo          BOOLEAN DEFAULT true,
  predeterminado  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cert_empresa ON certificados_digitales(empresa_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  13. VERIFACTU — Configuración y Registros (blockchain AEAT)        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS verifactu_config (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  activo          BOOLEAN DEFAULT false,
  modo            TEXT DEFAULT 'simulacion' CHECK (modo IN ('simulacion', 'test', 'produccion')),
  nif             TEXT,
  nombre_razon    TEXT,
  certificado_storage_path TEXT,
  certificado_password     TEXT,
  nombre_sistema   TEXT DEFAULT 'instaloERP',
  id_sistema       TEXT DEFAULT '01',
  version_sistema  TEXT DEFAULT '1.1',
  numero_instalacion TEXT DEFAULT '001',
  nif_fabricante   TEXT,
  nombre_fabricante TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (empresa_id)
);

CREATE TABLE IF NOT EXISTS verifactu_registros (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  factura_id      BIGINT REFERENCES facturas(id) ON DELETE SET NULL,
  tipo_registro   TEXT NOT NULL CHECK (tipo_registro IN ('alta', 'anulacion')),
  nif_emisor      TEXT NOT NULL,
  num_serie       TEXT NOT NULL,
  fecha_expedicion TEXT NOT NULL,
  tipo_factura    TEXT,
  cuota_total     NUMERIC(14,2),
  importe_total   NUMERIC(14,2),
  fecha_hora_huso TEXT,
  huella          TEXT,
  huella_anterior TEXT,
  es_primer_registro BOOLEAN DEFAULT false,
  registro_anterior_id BIGINT REFERENCES verifactu_registros(id),
  estado          TEXT DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente','enviado','correcto','aceptado_errores','incorrecto','error_envio','simulado'
  )),
  csv_aeat         TEXT,
  codigo_error     TEXT,
  descripcion_error TEXT,
  xml_enviado      TEXT,
  xml_respuesta    TEXT,
  qr_url           TEXT,
  factura_rectificada_num   TEXT,
  factura_rectificada_fecha TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  enviado_at       TIMESTAMPTZ,
  respuesta_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vf_reg_empresa ON verifactu_registros(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vf_reg_factura ON verifactu_registros(factura_id);
CREATE INDEX IF NOT EXISTS idx_vf_reg_estado  ON verifactu_registros(estado);
CREATE INDEX IF NOT EXISTS idx_vf_reg_huella  ON verifactu_registros(huella);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  13b. CUENTAS BANCARIAS (empresa), CORREO, SERVICIOS COMPUESTOS     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT,
  iban            TEXT,
  bic             TEXT,
  entidad         TEXT,
  titular         TEXT,
  observaciones   TEXT,
  predeterminada  BOOLEAN DEFAULT false,
  activa          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_emp ON cuentas_bancarias(empresa_id);

CREATE TABLE IF NOT EXISTS cuentas_correo (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  email           TEXT NOT NULL,
  nombre_mostrado TEXT,
  smtp_host       TEXT,
  smtp_port       INT DEFAULT 587,
  smtp_usuario    TEXT,
  password_cifrado TEXT,
  seguridad       TEXT DEFAULT 'tls',
  imap_host       TEXT,
  imap_port       INT DEFAULT 993,
  imap_seguridad  TEXT DEFAULT 'ssl',
  sync_habilitada BOOLEAN DEFAULT false,
  predeterminada  BOOLEAN DEFAULT false,
  activa          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cuentas_correo_emp ON cuentas_correo(empresa_id);

CREATE TABLE IF NOT EXISTS servicio_lineas (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  servicio_id     BIGINT NOT NULL REFERENCES articulos(id) ON DELETE CASCADE,
  articulo_id     BIGINT REFERENCES articulos(id) ON DELETE SET NULL,
  descripcion     TEXT,
  cantidad        NUMERIC(12,2) DEFAULT 1,
  precio_unitario NUMERIC(12,2) DEFAULT 0,
  orden           INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_srv_lineas ON servicio_lineas(servicio_id);

CREATE TABLE IF NOT EXISTS invitaciones (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token           TEXT NOT NULL UNIQUE,
  email           TEXT,
  nombre          TEXT,
  empresa_nombre  TEXT,
  dias_prueba     INT DEFAULT 14,
  expira_en       TIMESTAMPTZ,
  usado           BOOLEAN DEFAULT false,
  usado_en        TIMESTAMPTZ,
  usado_por       UUID,
  creado_por      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitaciones_token ON invitaciones(token);

CREATE TABLE IF NOT EXISTS solicitudes_acceso (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          TEXT,
  email           TEXT,
  empresa_nombre  TEXT,
  telefono        TEXT,
  mensaje         TEXT,
  estado          TEXT DEFAULT 'pendiente',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documento_historial (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  documento_tipo  TEXT,
  documento_id    BIGINT,
  estado_anterior TEXT,
  estado_nuevo    TEXT,
  usuario_id      UUID,
  usuario_nombre  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_hist ON documento_historial(documento_tipo, documento_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  14. AUDITORÍA y CORREO                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  tabla           TEXT,
  entidad         TEXT,
  entidad_id      TEXT,
  operacion       TEXT,
  registro_id     TEXT,
  cambios         JSONB,
  detalle         TEXT,
  usuario_id      UUID,
  usuario_nombre  TEXT,
  fecha           TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_empresa ON audit_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_entidad ON audit_log(entidad, entidad_id);

CREATE TABLE IF NOT EXISTS correos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  asunto          TEXT,
  remitente       TEXT,
  destinatarios   JSONB DEFAULT '[]',
  cc              JSONB DEFAULT '[]',
  cuerpo          TEXT,
  adjuntos        JSONB DEFAULT '[]',
  estado          TEXT DEFAULT 'enviado',
  tipo            TEXT,
  entidad_tipo    TEXT,
  entidad_id      TEXT,
  fecha_envio     TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_correos_empresa ON correos(empresa_id);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  15. ROW LEVEL SECURITY (RLS)                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Habilitamos RLS en todas las tablas y creamos políticas permisivas.
-- En producción, se recomienda restringir por empresa_id usando
-- perfiles.empresa_id = auth.uid().

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas','perfiles',
    'tipos_iva','unidades_medida','formas_pago','series_numeracion',
    'clientes','contactos_cliente','direcciones_cliente','documentos_cliente',
    'notas_cliente','cuentas_bancarias_entidad',
    'proveedores','articulos_proveedores',
    'familias_articulos','articulos','articulos_historial','servicios',
    'almacenes','stock','movimientos_stock','traspasos','incidencias_stock',
    'presupuestos','presupuesto_versiones','albaranes','facturas','factura_versiones',
    'presupuestos_compra','pedidos_compra','recepciones',
    'facturas_proveedor','pagos_proveedor','documentos_factura_prov',
    'trabajos','partes_trabajo','consumos_parte',
    'tareas_obra','tareas_pendientes','operarios_obra',
    'pedidos_almacen','notas_trabajo','documentos_trabajo',
    'mantenimientos','revisiones_mantenimiento','documentos_mantenimiento','notas_mantenimiento',
    'vehiculos','vehiculo_gastos',
    'fichajes','fichajes_ajustes',
    'documentos','documentos_ocr','documentos_generados','certificados_digitales',
    'verifactu_config','verifactu_registros',
    'cuentas_bancarias','cuentas_correo','servicio_lineas',
    'invitaciones','solicitudes_acceso','documento_historial',
    'audit_log','correos'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- Política permisiva global (para desarrollo / empresa única)
-- En multi-tenant, reemplazar por política que filtre por empresa_id
DO $$
DECLARE
  t text;
  pol_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas','perfiles',
    'tipos_iva','unidades_medida','formas_pago','series_numeracion',
    'clientes','contactos_cliente','direcciones_cliente','documentos_cliente',
    'notas_cliente','cuentas_bancarias_entidad',
    'proveedores','articulos_proveedores',
    'familias_articulos','articulos','articulos_historial','servicios',
    'almacenes','stock','movimientos_stock','traspasos','incidencias_stock',
    'presupuestos','presupuesto_versiones','albaranes','facturas','factura_versiones',
    'presupuestos_compra','pedidos_compra','recepciones',
    'facturas_proveedor','pagos_proveedor','documentos_factura_prov',
    'trabajos','partes_trabajo','consumos_parte',
    'tareas_obra','tareas_pendientes','operarios_obra',
    'pedidos_almacen','notas_trabajo','documentos_trabajo',
    'mantenimientos','revisiones_mantenimiento','documentos_mantenimiento','notas_mantenimiento',
    'vehiculos','vehiculo_gastos',
    'fichajes','fichajes_ajustes',
    'documentos','documentos_ocr','documentos_generados','certificados_digitales',
    'verifactu_config','verifactu_registros',
    'cuentas_bancarias','cuentas_correo','servicio_lineas',
    'invitaciones','solicitudes_acceso','documento_historial',
    'audit_log','correos'
  ] LOOP
    pol_name := t || '_all';
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)',
        pol_name, t
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;  -- Policy ya existe
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  16. FUNCIÓN DE VERIFICACIÓN                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Llama a esta función desde el ERP para comprobar que todo está instalado

CREATE OR REPLACE FUNCTION verificar_instalacion()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resultado JSONB := '{}';
  tablas_requeridas TEXT[] := ARRAY[
    'empresas','perfiles',
    'tipos_iva','unidades_medida','formas_pago','series_numeracion',
    'clientes','contactos_cliente','direcciones_cliente','documentos_cliente',
    'notas_cliente','cuentas_bancarias_entidad',
    'proveedores','articulos_proveedores',
    'familias_articulos','articulos','articulos_historial','servicios',
    'almacenes','stock','movimientos_stock','traspasos','incidencias_stock',
    'presupuestos','presupuesto_versiones','albaranes','facturas','factura_versiones',
    'presupuestos_compra','pedidos_compra','recepciones',
    'facturas_proveedor','pagos_proveedor','documentos_factura_prov',
    'trabajos','partes_trabajo','consumos_parte',
    'tareas_obra','tareas_pendientes','operarios_obra',
    'pedidos_almacen','notas_trabajo','documentos_trabajo',
    'mantenimientos','revisiones_mantenimiento','documentos_mantenimiento','notas_mantenimiento',
    'vehiculos','vehiculo_gastos',
    'fichajes','fichajes_ajustes',
    'documentos','documentos_ocr','documentos_generados','certificados_digitales',
    'verifactu_config','verifactu_registros',
    'cuentas_bancarias','cuentas_correo','servicio_lineas',
    'invitaciones','solicitudes_acceso','documento_historial',
    'audit_log','correos'
  ];
  t text;
  existe boolean;
  tablas_ok TEXT[] := '{}';
  tablas_falta TEXT[] := '{}';
BEGIN
  FOREACH t IN ARRAY tablas_requeridas LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) INTO existe;

    IF existe THEN
      tablas_ok := array_append(tablas_ok, t);
    ELSE
      tablas_falta := array_append(tablas_falta, t);
    END IF;
  END LOOP;

  resultado := jsonb_build_object(
    'version', '1.1',
    'fecha_verificacion', now(),
    'total_tablas', array_length(tablas_requeridas, 1),
    'tablas_ok', array_length(tablas_ok, 1),
    'tablas_faltantes', array_length(tablas_falta, 1),
    'faltantes', to_jsonb(tablas_falta),
    'instalacion_completa', (array_length(tablas_falta, 1) IS NULL OR array_length(tablas_falta, 1) = 0)
  );

  RETURN resultado;
END;
$$;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  17. DATOS INICIALES POR DEFECTO                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Se insertan solo si las tablas están vacías (primera instalación)

-- Nota: La empresa y el perfil se crean desde la app al registrarse.
-- Aquí solo insertamos datos de referencia que necesita cualquier empresa.

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  18. STORAGE BUCKETS                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Crear manualmente en Supabase Dashboard → Storage:
--
--   1. fotos-partes    (público)  — Fotos de partes de trabajo, avatares, logos
--   2. documentos      (privado)  — Documentos generales, PDFs, contratos
--   3. articulos       (público)  — Imágenes de artículos
--   4. certificados    (privado)  — Certificados digitales .pfx/.p12
--
-- O ejecutar estas sentencias SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-partes', 'fotos-partes', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('articulos', 'articulos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('certificados', 'certificados', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage: permitir upload/download a usuarios autenticados
DO $$
BEGIN
  -- fotos-partes: público lectura, autenticados escritura
  BEGIN
    CREATE POLICY "fotos_partes_read" ON storage.objects FOR SELECT
      USING (bucket_id = 'fotos-partes');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "fotos_partes_write" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'fotos-partes' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "fotos_partes_update" ON storage.objects FOR UPDATE
      USING (bucket_id = 'fotos-partes' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "fotos_partes_delete" ON storage.objects FOR DELETE
      USING (bucket_id = 'fotos-partes' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- documentos: solo autenticados
  BEGIN
    CREATE POLICY "documentos_read" ON storage.objects FOR SELECT
      USING (bucket_id = 'documentos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "documentos_write" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'documentos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "documentos_update" ON storage.objects FOR UPDATE
      USING (bucket_id = 'documentos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "documentos_delete" ON storage.objects FOR DELETE
      USING (bucket_id = 'documentos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- articulos: público lectura
  BEGIN
    CREATE POLICY "articulos_read" ON storage.objects FOR SELECT
      USING (bucket_id = 'articulos');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "articulos_write" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'articulos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "articulos_update" ON storage.objects FOR UPDATE
      USING (bucket_id = 'articulos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "articulos_delete" ON storage.objects FOR DELETE
      USING (bucket_id = 'articulos' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- certificados: solo autenticados
  BEGIN
    CREATE POLICY "certificados_read" ON storage.objects FOR SELECT
      USING (bucket_id = 'certificados' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "certificados_write" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'certificados' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "certificados_update" ON storage.objects FOR UPDATE
      USING (bucket_id = 'certificados' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "certificados_delete" ON storage.objects FOR DELETE
      USING (bucket_id = 'certificados' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  19. REFRESCAR SCHEMA CACHE                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  20. VERIFICACIÓN FINAL                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

SELECT verificar_instalacion();

-- ════════════════════════════════════════════════════════════════════════════
--  ✅ INSTALACIÓN COMPLETADA
-- ════════════════════════════════════════════════════════════════════════════
--  Siguiente paso: abrir el ERP en el navegador y registrar el primer usuario.
--  El sistema creará automáticamente la empresa y el perfil.
--
--  Para VeriFactu: ir a Configuración → Facturación → activar VeriFactu
--  y rellenar el NIF, razón social y modo (test/producción).
--
--  Edge Function VeriFactu: desplegar con:
--    supabase functions deploy verifactu
--
--  Variables de entorno necesarias en Supabase:
--    VERIFACTU_PROXY_URL   — URL del proxy mTLS (Deno Deploy)
--    VERIFACTU_PROXY_SECRET — Token de autenticación del proxy
-- ════════════════════════════════════════════════════════════════════════════
