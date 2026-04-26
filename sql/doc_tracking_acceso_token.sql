-- Añadir acceso_token a documentos_compartidos
-- Para que la Edge Function pueda redirigir a doc.html?t=acceso_token
ALTER TABLE documentos_compartidos ADD COLUMN IF NOT EXISTS acceso_token TEXT;
