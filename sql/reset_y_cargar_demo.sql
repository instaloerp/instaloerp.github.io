-- ============================================================
-- RESET COMPLETO + CARGA DE DATOS DEMO — Instalo ERP
-- Fecha: 2026-04-09
-- ============================================================
-- 1. Borra TODOS los datos transaccionales
-- 2. Vacía los buckets de Storage (fotos-partes, documentos)
-- 3. Resetea contadores de series
-- 4. Carga datos demo: 10 clientes, 50 artículos, 30 presupuestos
-- ============================================================
-- ⚠️  IRREVERSIBLE — Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PARTE 1: LIMPIEZA (ignora tablas que no existan)         ║
-- ╚═══════════════════════════════════════════════════════════╝

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Obras / Partes
    'consumos_parte','tareas_pendientes','notas_trabajo','documentos_trabajo',
    'operarios_obra','tareas_obra','pedidos_almacen','partes_trabajo',
    'revisiones_mantenimiento','notas_mantenimiento','documentos_mantenimiento',
    'mantenimientos','trabajos',
    -- Ventas
    'cuentas_bancarias_entidad','documentos_cliente','notas_cliente',
    'direcciones_cliente','contactos_cliente','certificados',
    'albaranes','facturas','presupuesto_versiones','presupuestos','clientes',
    -- Compras
    'documentos_factura_prov','pagos_proveedor','facturas_proveedor',
    'recepciones','pedidos_compra','presupuestos_compra',
    'articulos_proveedores','proveedores',
    -- Artículos / Stock
    'incidencias_stock','movimientos_stock','traspasos',
    'stock','articulos_historial','articulos',
    -- OCR / Documentos
    'documentos_ocr','documentos_generados','documentos',
    -- Personal
    'fichajes_ajustes','fichajes',
    -- Otros
    'correos','audit_log'
  ] LOOP
    BEGIN
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(t) || ' CASCADE';
      RAISE NOTICE 'Vaciada: %', t;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Tabla no existe (OK): %', t;
    END;
  END LOOP;
END $$;

-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PARTE 2: STORAGE — vaciar manualmente desde Supabase     ║
-- ║  Panel → Storage → fotos-partes → seleccionar → eliminar  ║
-- ║  Panel → Storage → documentos → seleccionar → eliminar    ║
-- ╚═══════════════════════════════════════════════════════════╝

-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PARTE 3: RESETEAR CONTADORES                             ║
-- ╚═══════════════════════════════════════════════════════════╝

UPDATE series_numeracion SET contador = 0;

-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PARTE 4: CARGAR DATOS DEMO                               ║
-- ╚═══════════════════════════════════════════════════════════╝

DO $$
DECLARE
  v_empresa_id  uuid;
  v_usuario_id  uuid;

  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  c6 uuid; c7 uuid; c8 uuid; c9 uuid; c10 uuid;

  hoy  date := CURRENT_DATE;
  i    int;
  pres_num  text;
  pres_fecha date;

BEGIN
  -- Obtener empresa y usuario
  SELECT id INTO v_empresa_id FROM empresas LIMIT 1;
  SELECT id INTO v_usuario_id FROM perfiles WHERE empresa_id = v_empresa_id LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ninguna empresa.';
  END IF;

  -- ═════════════════════════════════════════════
  --  CLIENTES (10)
  -- ═════════════════════════════════════════════

  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Hotel Parador de Lugo S.L.', 'B27001234', '982200100', 'admin@paradorlugo.es', 'Rúa da Raíña, 1', 'Lugo', 'Lugo', '27001') RETURNING id INTO c1;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Comunidad de Propietarios Rúa Nova', 'H27009876', '982300200', 'presidenta@ruanova.es', 'Rúa Nova, 15', 'Lugo', 'Lugo', '27002') RETURNING id INTO c2;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Restaurante A Taberna do Porto', 'B27005555', '982400300', 'info@tabernaporto.es', 'Porto, 8', 'Lugo', 'Lugo', '27003') RETURNING id INTO c3;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Clínica Dental Sonrisa Galega', 'B27006666', '982500400', 'clinica@sonrisagalega.es', 'Av. da Coruña, 45', 'Lugo', 'Lugo', '27004') RETURNING id INTO c4;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Supermercados Maruxa S.A.', 'A27007777', '982600500', 'compras@maruxa.es', 'Polígono Industrial, 12', 'Lugo', 'Lugo', '27005') RETURNING id INTO c5;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Carlos Fernández López', '33123456A', '666100200', 'carlos.fl@gmail.com', 'Travesía do Miño, 3', 'Lugo', 'Lugo', '27001') RETURNING id INTO c6;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'María González Vázquez', '33234567B', '666200300', 'mgonzalez@hotmail.com', 'Rúa das Flores, 22', 'Lugo', 'Lugo', '27002') RETURNING id INTO c7;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Farmacia Rodríguez Pardo', 'B27008888', '982700600', 'farmacia@rpardo.es', 'Rúa do Progreso, 55', 'Lugo', 'Lugo', '27004') RETURNING id INTO c8;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Gasolinera As Pontes S.L.', 'B27009999', '982800700', 'info@gaspontes.es', 'Estrada Nacional, km 18', 'As Pontes', 'A Coruña', '15320') RETURNING id INTO c9;
  INSERT INTO clientes (empresa_id, nombre, nif, telefono, email, direccion_fiscal, municipio_fiscal, provincia_fiscal, cp_fiscal)
  VALUES (v_empresa_id, 'Industrias Metálicas Noroeste S.L.', 'B27010101', '982900800', 'admin@imnsl.es', 'Polígono Cervo, 7', 'Cervo', 'Lugo', '27891') RETURNING id INTO c10;

  -- ═════════════════════════════════════════════
  --  ARTÍCULOS (50 referencias)
  -- ═════════════════════════════════════════════

  INSERT INTO articulos (empresa_id, codigo, nombre, precio_venta, descripcion, activo) VALUES
    (v_empresa_id, 'FON-001', 'Grifo monomando lavabo',                 45.00,  'Grifo monomando para lavabo, cromo', true),
    (v_empresa_id, 'FON-002', 'Grifo monomando fregadero',              55.00,  'Grifo monomando para fregadero, caño alto', true),
    (v_empresa_id, 'FON-003', 'Grifo monomando ducha',                  65.00,  'Grifo monomando con ducha de mano', true),
    (v_empresa_id, 'FON-004', 'Válvula de paso 1/2"',                   8.50,   'Válvula de paso esfera 1/2 pulgada', true),
    (v_empresa_id, 'FON-005', 'Válvula de paso 3/4"',                   11.00,  'Válvula de paso esfera 3/4 pulgada', true),
    (v_empresa_id, 'FON-006', 'Válvula de paso 1"',                     15.00,  'Válvula de paso esfera 1 pulgada', true),
    (v_empresa_id, 'FON-007', 'Tubo cobre 15mm (metro)',                4.20,   'Tubo de cobre recocido 15mm', true),
    (v_empresa_id, 'FON-008', 'Tubo cobre 22mm (metro)',                6.80,   'Tubo de cobre recocido 22mm', true),
    (v_empresa_id, 'FON-009', 'Tubo multicapa 16mm (metro)',            2.90,   'Tubo multicapa PEX-AL-PEX 16mm', true),
    (v_empresa_id, 'FON-010', 'Tubo multicapa 20mm (metro)',            3.80,   'Tubo multicapa PEX-AL-PEX 20mm', true),
    (v_empresa_id, 'FON-011', 'Inodoro completo con cisterna',          180.00, 'Inodoro cerámico blanco con cisterna alta', true),
    (v_empresa_id, 'FON-012', 'Lavabo mural 60x48cm',                   95.00,  'Lavabo mural cerámico blanco', true),
    (v_empresa_id, 'FON-013', 'Plato de ducha 80x80 resina',           145.00,  'Plato de ducha cuadrado resina antideslizante', true),
    (v_empresa_id, 'FON-014', 'Bañera acrílica 170x75cm',              280.00,  'Bañera acrílica rectangular blanca', true),
    (v_empresa_id, 'FON-015', 'Calentador eléctrico 80L',              320.00,  'Calentador eléctrico termostático 80 litros', true),
    (v_empresa_id, 'CAL-001', 'Caldera de condensación 24kW',          1200.00, 'Caldera de gas condensación 24kW ErP A', true),
    (v_empresa_id, 'CAL-002', 'Radiador aluminio 10 elementos',         85.00,  'Radiador de aluminio, 10 elementos, 600mm', true),
    (v_empresa_id, 'CAL-003', 'Radiador aluminio 8 elementos',          68.00,  'Radiador de aluminio, 8 elementos, 600mm', true),
    (v_empresa_id, 'CAL-004', 'Termostato programable WiFi',            65.00,  'Termostato programable con control WiFi', true),
    (v_empresa_id, 'CAL-005', 'Cabeza termostática radiador',           18.00,  'Cabeza termostática para válvula radiador', true),
    (v_empresa_id, 'CAL-006', 'Válvula radiador 3/8" recta',           12.00,  'Válvula radiador con cabeza termostática', true),
    (v_empresa_id, 'CAL-007', 'Detentor 3/8" recto',                    9.00,  'Detentor regulable para radiador', true),
    (v_empresa_id, 'CAL-008', 'Tubo corrugado aislado 22mm (metro)',    5.50,   'Tubo cobre aislado con armaflex 22mm', true),
    (v_empresa_id, 'CAL-009', 'Bomba circuladora calefacción',         145.00,  'Bomba circuladora para calefacción 25-60', true),
    (v_empresa_id, 'CAL-010', 'Vaso de expansión 18L',                  55.00,  'Vaso de expansión membrana 18 litros', true),
    (v_empresa_id, 'ELE-001', 'Cuadro eléctrico vivienda 24 módulos',  95.00,  'Cuadro ICP+IGA+diferenciales 24 módulos', true),
    (v_empresa_id, 'ELE-002', 'Interruptor automático 16A',             12.00,  'Interruptor automático magnetotérmico 16A', true),
    (v_empresa_id, 'ELE-003', 'Interruptor diferencial 25A/30mA',       35.00,  'Diferencial 2P 25A 30mA tipo AC', true),
    (v_empresa_id, 'ELE-004', 'Cable rígido 1.5mm² (metro)',            0.85,   'Cable eléctrico rígido 1.5mm² libre halógenos', true),
    (v_empresa_id, 'ELE-005', 'Cable rígido 2.5mm² (metro)',            1.20,   'Cable eléctrico rígido 2.5mm² libre halógenos', true),
    (v_empresa_id, 'ELE-006', 'Caja de registro superficie',            4.50,   'Caja de registro estanca IP55', true),
    (v_empresa_id, 'ELE-007', 'Enchufe base schuko',                    6.50,   'Base enchufe schuko 16A con toma tierra', true),
    (v_empresa_id, 'ELE-008', 'Interruptor simple',                     5.80,   'Interruptor simple 10A serie estándar', true),
    (v_empresa_id, 'ELE-009', 'Punto de luz LED techo',                18.00,   'Foco LED empotrable techo 7W blanco cálido', true),
    (v_empresa_id, 'ELE-010', 'Luminaria LED 36W panel',               45.00,   'Panel LED 60x60 36W 4000K', true),
    (v_empresa_id, 'MO-001',  'Mano de obra fontanería (hora)',         45.00,  'Hora de operario fontanero', true),
    (v_empresa_id, 'MO-002',  'Mano de obra calefacción (hora)',        48.00,  'Hora de operario calefactor', true),
    (v_empresa_id, 'MO-003',  'Mano de obra electricidad (hora)',       50.00,  'Hora de operario electricista', true),
    (v_empresa_id, 'MO-004',  'Mano de obra oficial 1ª (hora)',         55.00,  'Hora oficial de primera', true),
    (v_empresa_id, 'MO-005',  'Desplazamiento (km)',                     0.40,  'Kilometraje desplazamiento a obra', true),
    (v_empresa_id, 'MAT-001', 'Silicona sanitaria blanca',               6.50,  'Cartucho silicona sanitaria blanca 280ml', true),
    (v_empresa_id, 'MAT-002', 'Cinta teflón 12mm',                      1.20,  'Cinta de teflón para roscas', true),
    (v_empresa_id, 'MAT-003', 'Codo cobre 15mm 90°',                    1.80,  'Codo de soldadura cobre 15mm 90 grados', true),
    (v_empresa_id, 'MAT-004', 'Te cobre 15mm',                          2.20,  'Te de soldadura cobre 15mm', true),
    (v_empresa_id, 'MAT-005', 'Reducción cobre 22-15mm',                2.50,  'Reducción concéntrica cobre 22 a 15mm', true),
    (v_empresa_id, 'MAT-006', 'Soldadura estaño plata 2% (varilla)',    4.80,  'Varilla de soldadura estaño-plata 2%', true),
    (v_empresa_id, 'MAT-007', 'Decapante flux para cobre',              5.50,  'Pasta flux para soldadura de cobre 100g', true),
    (v_empresa_id, 'MAT-008', 'Espuma de poliuretano 750ml',            8.90,  'Espuma expansiva de poliuretano pistola 750ml', true),
    (v_empresa_id, 'MAT-009', 'Tornillo hexagonal M8x40 (caja 50ud)',  12.00,  'Caja 50 tornillos DIN 933 M8x40 galvanizado', true),
    (v_empresa_id, 'MAT-010', 'Brida plástica 200mm (bolsa 100ud)',     3.50,  'Bolsa 100 bridas de nylon 200mm blancas', true);

  -- ═════════════════════════════════════════════
  --  PRESUPUESTOS (30 total)
  --  · 10 pendientes activos (recientes)
  --  · 10 pendientes caducados (> 30 días)
  --  · 10 borradores
  -- ═════════════════════════════════════════════

  -- 10 PENDIENTES ACTIVOS
  FOR i IN 1..10 LOOP
    pres_num   := 'PRE-2026-' || LPAD(i::text, 4, '0');
    pres_fecha := hoy - (i * 2);

    INSERT INTO presupuestos (
      empresa_id, numero, cliente_id, cliente_nombre,
      fecha, estado, base_imponible, total_iva, total,
      titulo, observaciones, lineas
    ) VALUES (
      v_empresa_id, pres_num,
      CASE (i % 10) WHEN 1 THEN c1 WHEN 2 THEN c2 WHEN 3 THEN c3 WHEN 4 THEN c4 WHEN 5 THEN c5
        WHEN 6 THEN c6 WHEN 7 THEN c7 WHEN 8 THEN c8 WHEN 9 THEN c9 ELSE c10 END,
      CASE (i % 10) WHEN 1 THEN 'Hotel Parador de Lugo S.L.' WHEN 2 THEN 'Comunidad Rúa Nova'
        WHEN 3 THEN 'Restaurante A Taberna do Porto' WHEN 4 THEN 'Clínica Dental Sonrisa Galega'
        WHEN 5 THEN 'Supermercados Maruxa S.A.' WHEN 6 THEN 'Carlos Fernández López'
        WHEN 7 THEN 'María González Vázquez' WHEN 8 THEN 'Farmacia Rodríguez Pardo'
        WHEN 9 THEN 'Gasolinera As Pontes S.L.' ELSE 'Industrias Metálicas Noroeste S.L.' END,
      pres_fecha, 'pendiente',
      ROUND((800 + i * 150)::numeric, 2),
      ROUND((800 + i * 150) * 0.21::numeric, 2),
      ROUND((800 + i * 150) * 1.21::numeric, 2),
      CASE (i % 5) WHEN 0 THEN 'Instalación fontanería baño completo'
        WHEN 1 THEN 'Sustitución caldera y radiadores' WHEN 2 THEN 'Reforma eléctrica vivienda'
        WHEN 3 THEN 'Mantenimiento anual instalaciones' ELSE 'Reparación urgente avería' END,
      'Presupuesto pendiente de aprobación',
      jsonb_build_array(
        jsonb_build_object('tipo','linea','desc','Mano de obra fontanería','cant', 8 + i,'precio',45,'dto',0,'iva',21),
        jsonb_build_object('tipo','linea','desc','Materiales varios','cant',1,'precio', 200 + i * 30,'dto',5,'iva',21)
      )
    );
  END LOOP;

  -- 10 PENDIENTES CADUCADOS (> 30 días)
  FOR i IN 11..20 LOOP
    pres_num   := 'PRE-2026-' || LPAD(i::text, 4, '0');
    pres_fecha := hoy - (35 + i);

    INSERT INTO presupuestos (
      empresa_id, numero, cliente_id, cliente_nombre,
      fecha, estado, base_imponible, total_iva, total,
      titulo, observaciones, lineas
    ) VALUES (
      v_empresa_id, pres_num,
      CASE ((i-10) % 10) WHEN 1 THEN c1 WHEN 2 THEN c2 WHEN 3 THEN c3 WHEN 4 THEN c4 WHEN 5 THEN c5
        WHEN 6 THEN c6 WHEN 7 THEN c7 WHEN 8 THEN c8 WHEN 9 THEN c9 ELSE c10 END,
      CASE ((i-10) % 10) WHEN 1 THEN 'Hotel Parador de Lugo S.L.' WHEN 2 THEN 'Comunidad Rúa Nova'
        WHEN 3 THEN 'Restaurante A Taberna do Porto' WHEN 4 THEN 'Clínica Dental Sonrisa Galega'
        WHEN 5 THEN 'Supermercados Maruxa S.A.' WHEN 6 THEN 'Carlos Fernández López'
        WHEN 7 THEN 'María González Vázquez' WHEN 8 THEN 'Farmacia Rodríguez Pardo'
        WHEN 9 THEN 'Gasolinera As Pontes S.L.' ELSE 'Industrias Metálicas Noroeste S.L.' END,
      pres_fecha, 'pendiente',
      ROUND((500 + i * 80)::numeric, 2),
      ROUND((500 + i * 80) * 0.21::numeric, 2),
      ROUND((500 + i * 80) * 1.21::numeric, 2),
      CASE (i % 5) WHEN 0 THEN 'Instalación calefacción suelo radiante'
        WHEN 1 THEN 'Cambio tuberías agua fría y caliente' WHEN 2 THEN 'Cuadro eléctrico vivienda'
        WHEN 3 THEN 'Revisión anual caldera gas' ELSE 'Instalación griferías baño y cocina' END,
      'Presupuesto caducado — pendiente de seguimiento',
      jsonb_build_array(
        jsonb_build_object('tipo','linea','desc','Mano de obra calefacción','cant', 6 + i,'precio',48,'dto',0,'iva',21),
        jsonb_build_object('tipo','linea','desc','Materiales calefacción','cant',1,'precio', 150 + i * 20,'dto',0,'iva',21)
      )
    );
  END LOOP;

  -- 10 BORRADORES
  FOR i IN 21..30 LOOP
    pres_num   := 'BORR-2026-' || LPAD((i-20)::text, 4, '0');
    pres_fecha := hoy - (i - 20);

    INSERT INTO presupuestos (
      empresa_id, numero, cliente_id, cliente_nombre,
      fecha, estado, base_imponible, total_iva, total,
      titulo, observaciones, lineas
    ) VALUES (
      v_empresa_id, pres_num,
      CASE ((i-20) % 10) WHEN 1 THEN c1 WHEN 2 THEN c2 WHEN 3 THEN c3 WHEN 4 THEN c4 WHEN 5 THEN c5
        WHEN 6 THEN c6 WHEN 7 THEN c7 WHEN 8 THEN c8 WHEN 9 THEN c9 ELSE c10 END,
      CASE ((i-20) % 10) WHEN 1 THEN 'Hotel Parador de Lugo S.L.' WHEN 2 THEN 'Comunidad Rúa Nova'
        WHEN 3 THEN 'Restaurante A Taberna do Porto' WHEN 4 THEN 'Clínica Dental Sonrisa Galega'
        WHEN 5 THEN 'Supermercados Maruxa S.A.' WHEN 6 THEN 'Carlos Fernández López'
        WHEN 7 THEN 'María González Vázquez' WHEN 8 THEN 'Farmacia Rodríguez Pardo'
        WHEN 9 THEN 'Gasolinera As Pontes S.L.' ELSE 'Industrias Metálicas Noroeste S.L.' END,
      pres_fecha, 'borrador',
      ROUND((300 + i * 50)::numeric, 2),
      ROUND((300 + i * 50) * 0.21::numeric, 2),
      ROUND((300 + i * 50) * 1.21::numeric, 2),
      'Borrador pendiente de revisar ' || (i - 20),
      'Borrador en elaboración',
      jsonb_build_array(
        jsonb_build_object('tipo','linea','desc','Concepto en elaboración','cant',1,'precio', 300 + i * 50,'dto',0,'iva',21)
      )
    );
  END LOOP;

  RAISE NOTICE '✓ Demo cargado: 10 clientes, 50 artículos, 30 presupuestos (10 activos + 10 caducados + 10 borradores)';

END $$;

-- ╔═══════════════════════════════════════════════════════════╗
-- ║  VERIFICACIÓN FINAL                                       ║
-- ╚═══════════════════════════════════════════════════════════╝

SELECT '✅ clientes' AS tabla, count(*) AS registros FROM clientes
UNION ALL SELECT '✅ artículos', count(*) FROM articulos
UNION ALL SELECT '✅ presupuestos', count(*) FROM presupuestos
UNION ALL SELECT '🟢 empresas', count(*) FROM empresas
UNION ALL SELECT '🟢 perfiles', count(*) FROM perfiles
UNION ALL SELECT '🟢 almacenes', count(*) FROM almacenes
UNION ALL SELECT '🔴 partes (vacío)', count(*) FROM partes_trabajo
UNION ALL SELECT '🔴 trabajos (vacío)', count(*) FROM trabajos
UNION ALL SELECT '🔴 facturas (vacío)', count(*) FROM facturas
UNION ALL SELECT '🔴 doc_ocr (vacío)', count(*) FROM documentos_ocr
UNION ALL SELECT '🔴 stock (vacío)', count(*) FROM stock
UNION ALL SELECT '🔴 storage', count(*) FROM storage.objects WHERE bucket_id IN ('fotos-partes','documentos')
ORDER BY 1;
