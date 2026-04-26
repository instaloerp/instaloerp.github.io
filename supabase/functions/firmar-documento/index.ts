// ═══════════════════════════════════════════════════════════════
// EDGE FUNCTION: firmar-documento
// Firma digitalmente cualquier PDF con el certificado de la empresa.
// 1. Carga el certificado PFX de la empresa
// 2. Añade sello visual de firma al PDF (pdf-lib)
// 3. Genera firma PKCS#7 detached del contenido completo
// 4. Guarda PDF sellado + firma PKCS#7 en Storage y BD
// 5. Devuelve PDF sellado en base64 para descarga inmediata
//
// BODY:
// {
//   pdf_base64: string,           // PDF en base64
//   empresa_id: string,
//   documento_info: {             // Info para documentos_generados
//     tipo_documento: string,
//     documento_id: number|string,
//     numero: string,
//     entidad_tipo?: string,
//     entidad_id?: number,
//     entidad_nombre?: string,
//     usuario_id?: string
//   }
// }
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// pdf-lib ya no se usa para sello visual (lo genera la plantilla HTML del frontend)
// import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'
import forge from 'https://esm.sh/node-forge@1.3.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Convierte Uint8Array a string binario sin desbordar la pila (chunks de 8 KB)
function uint8ToBinaryString(u8: Uint8Array): string {
  let bin = ''
  const chunk = 8192
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)))
  }
  return bin
}

// Sanitiza texto para que solo contenga caracteres WinAnsi (pdf-lib)
function sanitizeWinAnsi(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { pdf_base64, empresa_id, documento_info } = body

    if (!pdf_base64 || !empresa_id) {
      return new Response(JSON.stringify({ error: 'Faltan pdf_base64 y empresa_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    // Cargar certificado y empresa
    const [empRes, certRes] = await Promise.all([
      sb.from('empresas').select('nombre,cif').eq('id', empresa_id).single(),
      sb.from('certificados_digitales').select('*').eq('empresa_id', empresa_id).eq('activo', true).eq('predeterminado', true).single(),
    ])

    const empresa = empRes.data
    const cert = certRes.data

    if (!empresa) {
      return new Response(JSON.stringify({ error: 'Empresa no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Decodificar PDF original
    const pdfBytesOriginal = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0))

    // ══════════════════════════════════════════════
    // FIRMA DIGITAL CON CERTIFICADO
    // ══════════════════════════════════════════════
    let firmadoDigital = false
    let p7DerB64: string | null = null
    let certTitular = ''
    let certNif = ''
    let certEmisor = ''
    let pdfBytesFinal = pdfBytesOriginal

    if (cert && cert.archivo_path && cert.password_cifrada) {
      try {
        // 1. Descargar PFX — probar varias combinaciones de bucket/path
        let pfxData: Uint8Array | null = null
        const archivoPath = cert.archivo_path
        // Generar variantes: path completo y sin prefijo de bucket
        const pathVariantes = [archivoPath]
        for (const prefix of ['certificados/', 'documentos/']) {
          if (archivoPath.startsWith(prefix)) {
            pathVariantes.push(archivoPath.substring(prefix.length))
          }
        }
        for (const bucket of ['certificados', 'documentos']) {
          for (const p of pathVariantes) {
            const { data: pfxBlob, error: dlErr } = await sb.storage.from(bucket).download(p)
            if (!dlErr && pfxBlob) {
              pfxData = new Uint8Array(await pfxBlob.arrayBuffer())
              break
            }
          }
          if (pfxData) break
        }

        if (pfxData) {
          // 2. Extraer certificado y clave privada del PFX
          const p12Der = forge.util.decode64(btoa(uint8ToBinaryString(pfxData)))
          const p12Asn1 = forge.asn1.fromDer(p12Der)
          // Decodificar contraseña (guardada como btoa(unescape(encodeURIComponent(pass))))
          const passDecoded = decodeURIComponent(escape(atob(cert.password_cifrada)))
          const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passDecoded)

          const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
          const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
          const certObj = certBags[forge.pki.oids.certBag]?.[0]?.cert
          const keyObj = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key

          if (certObj && keyObj) {
            certTitular = cert.titular || certObj.subject.getField('CN')?.value || empresa.nombre || ''
            certNif = cert.nif_titular || ''
            certEmisor = cert.emisor || certObj.issuer.getField('CN')?.value || ''
            const fechaFirma = new Date()

            // 3. Sello visual NO se añade aquí — ya lo incluye la plantilla HTML del frontend.
            //    Solo generamos la firma PKCS#7 criptográfica sobre el PDF tal cual llega.

            // 4. Generar firma PKCS#7 detached del PDF completo
            const p7 = forge.pkcs7.createSignedData()
            p7.content = forge.util.createBuffer(uint8ToBinaryString(pdfBytesFinal))
            p7.addCertificate(certObj)
            p7.addSigner({
              key: keyObj,
              certificate: certObj,
              digestAlgorithm: forge.pki.oids.sha256,
              authenticatedAttributes: [
                { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
                { type: forge.pki.oids.messageDigest },
                { type: forge.pki.oids.signingTime, value: fechaFirma },
              ],
            })
            p7.sign({ detached: true })

            // 5. Serializar la firma PKCS#7 en DER → base64
            const p7Asn1 = p7.toAsn1()
            const p7DerBytes = forge.asn1.toDer(p7Asn1).getBytes()
            p7DerB64 = forge.util.encode64(p7DerBytes)

            firmadoDigital = true
            console.log('✅ PDF firmado digitalmente:', certTitular)
          }
        }
      } catch (certErr) {
        console.error('Error firmando digitalmente:', certErr)
      }
    }

    // ══════════════════════════════════════════════
    // GUARDAR PDF EN STORAGE
    // ══════════════════════════════════════════════
    const docInfo = documento_info || {}
    const tipo = docInfo.tipo_documento || 'documento'
    const numRaw = String(docInfo.numero || docInfo.documento_id || Date.now())
    const num = numRaw.replace(/[^a-zA-Z0-9._-]/g, '_')  // sanitizar para Storage keys
    const ts = Date.now()
    const basePath = `documentos-firmados/${empresa_id}/${tipo}`
    const pdfPath = `${basePath}/${num}_${ts}.pdf`
    const pdfBlob = new Blob([pdfBytesFinal], { type: 'application/pdf' })

    const { error: upErr } = await sb.storage.from('documentos').upload(pdfPath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    })

    let pdfUrl = ''
    if (!upErr) {
      const { data: urlData } = sb.storage.from('documentos').getPublicUrl(pdfPath)
      pdfUrl = urlData?.publicUrl || ''
    } else {
      console.error('Error subiendo PDF:', upErr)
    }

    // Guardar firma PKCS#7 como archivo .p7s junto al PDF (para verificación)
    let firmaPath = ''
    if (p7DerB64) {
      firmaPath = `${basePath}/${num}_${ts}.p7s`
      const firmaBytes = Uint8Array.from(atob(p7DerB64), c => c.charCodeAt(0))
      const firmaBlob = new Blob([firmaBytes], { type: 'application/pkcs7-signature' })
      await sb.storage.from('documentos').upload(firmaPath, firmaBlob, {
        contentType: 'application/pkcs7-signature',
        upsert: true,
      }).catch(e => console.error('Error subiendo .p7s:', e))
    }

    // ══════════════════════════════════════════════
    // REGISTRAR EN documentos_generados
    // ══════════════════════════════════════════════
    if (docInfo.tipo_documento) {
      await sb.from('documentos_generados').insert({
        empresa_id,
        tipo_documento: docInfo.tipo_documento,
        documento_id: docInfo.documento_id || null,
        numero: docInfo.numero || null,
        entidad_tipo: docInfo.entidad_tipo || null,
        entidad_id: docInfo.entidad_id || null,
        entidad_nombre: docInfo.entidad_nombre || null,
        archivo_url: pdfUrl,
        archivo_path: pdfPath,
        archivo_size: pdfBytesFinal.length,
        firmado: firmadoDigital,
        certificado_id: cert?.id || null,
        firma_fecha: new Date().toISOString(),
        firma_p7s_path: firmaPath || null,
        generado_por: docInfo.usuario_id || null,
      }).then(r => { if (r.error) console.error('Error en documentos_generados:', r.error) })
    }

    // Devolver PDF firmado como base64 para descarga inmediata
    const pdfFirmadoBase64 = btoa(uint8ToBinaryString(pdfBytesFinal))

    return new Response(JSON.stringify({
      success: true,
      firmado_digital: firmadoDigital,
      pdf_url: pdfUrl,
      pdf_path: pdfPath,
      pdf_base64: pdfFirmadoBase64,
      firma_p7s_path: firmaPath || null,
      certificado: cert ? { titular: certTitular, nif: certNif, emisor: certEmisor } : null,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error en firmar-documento:', error)
    return new Response(JSON.stringify({
      error: 'Error: ' + (error.message || 'Error desconocido')
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
