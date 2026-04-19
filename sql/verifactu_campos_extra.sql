-- ════════════════════════════════════════════════════════════════
--  VeriFactu — Campos extra: clave_regimen y calificacion_operacion
--  instaloERP v1.1
-- ════════════════════════════════════════════════════════════════

-- 1. Clave de régimen fiscal
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS clave_regimen TEXT DEFAULT '01';

COMMENT ON COLUMN facturas.clave_regimen IS
  'Clave régimen fiscal VeriFactu: '
  '01=General, 02=Export, 03=Op.especiales, 04=Oro inversión, '
  '05=Agencias viaje, 06=Grupos IVA, 07=RECC, 08=IPSI/IGIC, '
  '09=Adq.intracom, 10=Cobros terceros, 11=Arrendamiento, '
  '12=Reg.simplificado, 14=Recargo equivalencia, 15=Inversión sujeto pasivo';

-- 2. Calificación de la operación
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS calificacion_operacion TEXT DEFAULT 'S1';

COMMENT ON COLUMN facturas.calificacion_operacion IS
  'Calificación operación VeriFactu: '
  'S1=Sujeta no exenta, S2=Sujeta exenta, '
  'N1=No sujeta art.7, N2=No sujeta localización';
