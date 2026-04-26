-- Habilitar realtime en presupuestos para notificar firmas en vivo
-- REPLICA IDENTITY FULL necesario para que payload.old tenga todos los campos
ALTER TABLE presupuestos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE presupuestos;
