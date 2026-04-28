# Proxy FACe - Deno Deploy

Proxy para facturacion electronica a Administraciones Publicas (FACe) del MINHAP.

Recibe peticiones de la Supabase Edge Function `face/index.ts`, firma el XML Facturae 3.2.2 con XAdES-EPES, construye el SOAP con WS-Security y envia a FACe via mTLS.

## Variables de entorno

| Variable | Descripcion |
|----------|-------------|
| `CERT_P12_BASE64` | Certificado .p12 codificado en base64 |
| `CERT_PASSWORD` | Contrasena del .p12 |
| `PROXY_SECRET` | Token Bearer para autenticar peticiones desde la Edge Function |

## Preparar el certificado

```bash
# Convertir .p12 a base64 (una sola linea)
base64 -i certificado.p12 | tr -d '\n' > cert_b64.txt

# O en Linux:
base64 -w 0 certificado.p12 > cert_b64.txt
```

El contenido de `cert_b64.txt` es el valor de `CERT_P12_BASE64`.

## Deploy en Deno Deploy

### Opcion A: Via dashboard (dash.deno.com)

1. Crear nuevo proyecto en https://dash.deno.com
2. Ir a Settings > Environment Variables
3. Configurar `CERT_P12_BASE64`, `CERT_PASSWORD`, `PROXY_SECRET`
4. Ir a la pestana de deploy y subir `index.ts`

### Opcion B: Via CLI (deployctl)

```bash
# Instalar deployctl
deno install --allow-all -n deployctl https://deno.land/x/deploy/deployctl.ts

# Deploy
cd deno-face-proxy
deployctl deploy --project=instaloerp-face-proxy --prod index.ts

# Configurar env vars en el dashboard despues del deploy
```

### Opcion C: Vinculado a GitHub

1. Crear repo o usar un subdirectorio del repo existente
2. En Deno Deploy, vincular al repo y apuntar entry point a `deno-face-proxy/index.ts`
3. Configurar env vars en Settings > Environment Variables
4. Cada push al branch principal hace deploy automatico

## Configurar la Edge Function

En los secrets de Supabase (Dashboard > Project Settings > Edge Functions > Secrets):

```
FACE_PROXY_URL=https://instaloerp-face-proxy.deno.dev
FACE_PROXY_SECRET=<mismo valor que PROXY_SECRET>
```

## API

### POST /

Todas las acciones usan POST con JSON body.

#### enviarFactura

```json
{
  "xml_facturae": "<?xml version=\"1.0\"...></fe:Facturae>",
  "correo": "facturacion@empresa.es",
  "modo": "test",
  "servicio": "face",
  "accion": "enviarFactura"
}
```

#### anularFactura

```json
{
  "modo": "test",
  "servicio": "face",
  "accion": "anularFactura",
  "numero_registro": "202600012345",
  "motivo": "Error en datos de factura"
}
```

#### consultarFactura

```json
{
  "modo": "test",
  "servicio": "face",
  "accion": "consultarFactura",
  "numero_registro": "202600012345"
}
```

### Headers requeridos

```
Authorization: Bearer <PROXY_SECRET>
Content-Type: application/json
```

### GET / (health check)

Devuelve estado del servicio y si el certificado carga correctamente.

## Respuesta

```json
{
  "ok": true,
  "status": 200,
  "xml_respuesta": "<soapenv:Envelope>...</soapenv:Envelope>",
  "endpoint": "https://se-face-webservice.redsara.es/facturasspp2",
  "servicio": "face",
  "accion": "enviarFactura",
  "modo": "test",
  "version": "v1.0-p12",
  "request_id": "a1b2c3d4",
  "timestamp": "2026-04-28T10:30:00Z",
  "duration_ms": 1234
}
```

## Flujo de firma

1. **XAdES-EPES enveloped** — El XML Facturae se firma con una ds:Signature insertada dentro del documento:
   - RSA-SHA256 para la firma
   - SHA-256 para los digests
   - Politica de firma Facturae v3.1
   - C14N 1.0 (inclusive)
   - Tres referencias: documento, SignedProperties, KeyInfo

2. **WS-Security SOAP** — El SOAP envelope se firma con:
   - RSA-SHA512 para la firma
   - SHA-512 para los digests
   - Exc-C14N
   - BinarySecurityToken con el certificado X.509
   - Timestamp firmado (Created + Expires)

3. **mTLS** — La conexion HTTPS usa el mismo certificado como client cert.

## Codigos de estado FACe

| Codigo | Estado |
|--------|--------|
| 1200 | Registrada |
| 1300 | Contabilizada |
| 2400 | Pagada |
| 2500 | Rechazada |
| 2600 | Anulada |
| 3100 | Propuesta de pago |
| 3200 | Pago ordenado |

## Test local

```bash
# Ejecutar localmente
CERT_P12_BASE64=... CERT_PASSWORD=... PROXY_SECRET=test123 deno run --allow-net --allow-env index.ts

# Probar health check
curl http://localhost:8000

# Probar envio (modo test)
curl -X POST http://localhost:8000 \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{
    "xml_facturae": "<?xml version=\"1.0\"...",
    "correo": "test@test.es",
    "modo": "test",
    "servicio": "face",
    "accion": "enviarFactura"
  }'
```

## Diferencias con deno-proxy/main.ts

El proxy existente en `deno-proxy/main.ts` maneja tanto VeriFactu como FACe usando cert/key PEM separados.
Este proxy (`deno-face-proxy/index.ts`) es una version dedicada exclusivamente a FACe que:

- Acepta certificado .p12 directamente (mas comodo, no hay que extraer PEM manualmente)
- Cachea el parseo del certificado (una sola vez por cold start)
- Tiene validacion de request mas estricta
- Incluye health check GET
- Logging con request_id para trazabilidad
- Timeout de 30s en las peticiones a FACe
