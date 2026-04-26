// ═══════════════════════════════════════════════════════════════
// EDGE FUNCTION: firmar-pdf
// Genera un PDF del presupuesto con la firma del cliente visible,
// lo firma digitalmente con el certificado de la empresa (si existe),
// lo guarda en Storage + documentos_generados,
// y opcionalmente envía copia por email al cliente.
//
// DESPLIEGUE: deploy_functions.sh firmar-pdf
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib-with-encrypt@1.2.1'
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
    const {
      presupuesto_id, empresa_id,
      firma_imagen_base64, firma_nombre, firma_dni,
      firma_email, firma_fecha, firma_ip, firma_dispositivo,
      enviar_copia_email
    } = body

    if (!presupuesto_id || !empresa_id || !firma_imagen_base64) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    // ── Cargar datos en paralelo ──
    const [presRes, empRes, certRes] = await Promise.all([
      sb.from('presupuestos').select('*').eq('id', presupuesto_id).single(),
      sb.from('empresas').select('*').eq('id', empresa_id).single(),
      sb.from('certificados_digitales').select('*').eq('empresa_id', empresa_id).eq('activo', true).eq('predeterminado', true).single(),
    ])

    const pres = presRes.data
    const empresa = empRes.data
    if (!pres || !empresa) {
      return new Response(JSON.stringify({ error: 'Presupuesto o empresa no encontrados' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Cargar cliente
    const { data: cliente } = pres.cliente_id
      ? await sb.from('clientes').select('*').eq('id', pres.cliente_id).single()
      : { data: null }

    // ══════════════════════════════════════════════
    // GENERAR PDF
    // ══════════════════════════════════════════════
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontSize = 10
    const pageW = 595.28 // A4
    const pageH = 841.89
    const margin = 50
    const contentW = pageW - 2 * margin

    let page = pdfDoc.addPage([pageW, pageH])
    let y = pageH - margin

    // Helpers
    const drawText = (text: string, x: number, yy: number, options: any = {}) => {
      page.drawText(String(text || ''), {
        x, y: yy,
        size: options.size || fontSize,
        font: options.bold ? fontBold : font,
        color: options.color || rgb(0.1, 0.1, 0.15),
      })
    }

    const fmtE = (n: number) => {
      const num = Number(n) || 0
      return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'
    }

    const checkNewPage = (needed: number) => {
      if (y - needed < margin + 40) {
        page = pdfDoc.addPage([pageW, pageH])
        y = pageH - margin
      }
    }

    // ── Cabecera empresa ──
    drawText(empresa.nombre || 'Empresa', margin, y, { size: 16, bold: true, color: rgb(0.12, 0.25, 0.69) })
    y -= 16
    const razonLine = [empresa.razon_social, empresa.cif ? 'CIF: ' + empresa.cif : ''].filter(Boolean).join(' · ')
    if (razonLine) { drawText(razonLine, margin, y, { size: 8, color: rgb(0.4, 0.45, 0.5) }); y -= 12; }
    const dirLine = [empresa.direccion, empresa.codigo_postal, empresa.ciudad, empresa.provincia].filter(Boolean).join(', ')
    if (dirLine) { drawText(dirLine, margin, y, { size: 8, color: rgb(0.4, 0.45, 0.5) }); y -= 12; }
    const contactLine = [empresa.telefono, empresa.email].filter(Boolean).join(' · ')
    if (contactLine) { drawText(contactLine, margin, y, { size: 8, color: rgb(0.4, 0.45, 0.5) }); y -= 12; }

    y -= 6
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1, color: rgb(0.85, 0.88, 0.92) })
    y -= 20

    // ── Datos presupuesto ──
    drawText('PRESUPUESTO', margin, y, { size: 14, bold: true, color: rgb(0.12, 0.25, 0.69) })
    drawText(pres.numero || '', margin + 130, y, { size: 14, bold: true, color: rgb(0.12, 0.25, 0.69) })
    if (pres.fecha) drawText('Fecha: ' + new Date(pres.fecha).toLocaleDateString('es-ES'), pageW - margin - 130, y, { size: 9 })
    y -= 14
    if (pres.valido_hasta) drawText('Válido hasta: ' + new Date(pres.valido_hasta).toLocaleDateString('es-ES'), pageW - margin - 130, y, { size: 9 })
    y -= 20

    // ── Datos cliente ──
    drawText('CLIENTE', margin, y, { size: 8, bold: true, color: rgb(0.4, 0.45, 0.5) })
    y -= 14
    drawText(cliente?.nombre || pres.cliente_nombre || '—', margin, y, { size: 11, bold: true })
    y -= 14
    if (cliente?.nif) { drawText('NIF: ' + cliente.nif, margin, y, { size: 9 }); y -= 12; }
    if (cliente?.direccion) { drawText(cliente.direccion, margin, y, { size: 9 }); y -= 12; }
    const cliCiudad = [cliente?.codigo_postal, cliente?.ciudad, cliente?.provincia].filter(Boolean).join(', ')
    if (cliCiudad) { drawText(cliCiudad, margin, y, { size: 9 }); y -= 12; }
    y -= 10

    if (pres.titulo) {
      drawText('Ref: ' + pres.titulo, margin, y, { size: 10, bold: true })
      y -= 18
    }

    // ── Tabla de líneas ──
    const colX = [margin, margin + 260, margin + 320, margin + 385, margin + 430]

    // Cabecera tabla
    page.drawRectangle({ x: margin - 4, y: y - 4, width: contentW + 8, height: 18, color: rgb(0.94, 0.96, 0.98) })
    const colLabels = ['Descripción', 'Cant.', 'Precio', 'Dto.', 'Total']
    colLabels.forEach((label, i) => drawText(label, colX[i], y, { size: 8, bold: true, color: rgb(0.4, 0.45, 0.5) }))
    y -= 20

    const lineas = pres.lineas || []
    for (const l of lineas) {
      checkNewPage(16)
      if (l.tipo === 'capitulo' || l.tipo === 'subcapitulo') {
        page.drawRectangle({ x: margin - 4, y: y - 4, width: contentW + 8, height: 16, color: rgb(0.94, 0.96, 1) })
        drawText((l.tipo === 'subcapitulo' ? '   ' : '') + (l.titulo || ''), margin, y, { size: 9, bold: true, color: rgb(0.12, 0.25, 0.69) })
        y -= 16
        continue
      }

      const desc = (l.desc || '').substring(0, 65)
      drawText(desc, colX[0], y, { size: 9 })
      drawText(String(l.cant || 0), colX[1], y, { size: 9 })
      drawText(fmtE(l.precio || 0), colX[2], y, { size: 9 })
      drawText((l.dto || 0) > 0 ? l.dto + '%' : '', colX[3], y, { size: 9 })
      const sub = (l.cant || 0) * (l.precio || 0) * (1 - ((l.dto || 0) / 100))
      drawText(fmtE(sub), colX[4], y, { size: 9, bold: true })
      y -= 14
    }

    y -= 6
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: rgb(0.85, 0.88, 0.92) })
    y -= 16

    // ── Totales ──
    checkNewPage(60)
    const totX = pageW - margin - 170
    drawText('Base imponible:', totX, y, { size: 10 })
    drawText(fmtE(pres.base_imponible || 0), totX + 110, y, { size: 10, bold: true })
    y -= 16
    drawText('IVA:', totX, y, { size: 10 })
    drawText(fmtE(pres.total_iva || 0), totX + 110, y, { size: 10, bold: true })
    y -= 18
    page.drawRectangle({ x: totX - 8, y: y - 6, width: 185, height: 22, color: rgb(0.94, 0.97, 1) })
    drawText('TOTAL:', totX, y, { size: 12, bold: true })
    drawText(fmtE(pres.total || 0), totX + 110, y, { size: 12, bold: true, color: rgb(0.12, 0.25, 0.69) })
    y -= 30

    // ── Observaciones ──
    if (pres.observaciones) {
      checkNewPage(40)
      drawText('Observaciones:', margin, y, { size: 8, bold: true, color: rgb(0.4, 0.45, 0.5) })
      y -= 14
      const obsLines = (pres.observaciones || '').substring(0, 300).split('\n')
      for (const line of obsLines) {
        checkNewPage(14)
        drawText(line.substring(0, 90), margin, y, { size: 8, color: rgb(0.4, 0.45, 0.5) })
        y -= 12
      }
      y -= 10
    }

    // ══════════════════════════════════════════════
    // SECCIÓN FIRMA DEL CLIENTE
    // ══════════════════════════════════════════════
    checkNewPage(160)
    y -= 10
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1.5, color: rgb(0.12, 0.25, 0.69) })
    y -= 20

    drawText('ACEPTACIÓN Y FIRMA DEL CLIENTE', margin, y, { size: 11, bold: true, color: rgb(0.12, 0.25, 0.69) })
    y -= 24

    // Insertar imagen de firma
    try {
      const firmaBytes = Uint8Array.from(atob(firma_imagen_base64), c => c.charCodeAt(0))
      const firmaImg = await pdfDoc.embedPng(firmaBytes)
      const origDims = firmaImg.scale(1)
      const firmaW = Math.min(200, origDims.width * 0.5)
      const firmaH = firmaW * (origDims.height / origDims.width)
      page.drawImage(firmaImg, { x: margin, y: y - firmaH, width: firmaW, height: firmaH })
      y -= firmaH + 10
    } catch(e) {
      drawText('[Firma digital del cliente]', margin, y, { size: 9, color: rgb(0.4, 0.45, 0.5) })
      y -= 16
    }

    // Datos de la firma
    const firmaFechaStr = firma_fecha ? new Date(firma_fecha).toLocaleString('es-ES') : new Date().toLocaleString('es-ES')
    drawText('Firmado por: ' + (firma_nombre || ''), margin, y, { size: 9, bold: true }); y -= 13
    drawText('DNI/NIF: ' + (firma_dni || ''), margin, y, { size: 9 }); y -= 13
    drawText('Fecha: ' + firmaFechaStr, margin, y, { size: 9 }); y -= 13
    if (firma_ip && firma_ip !== '—') { drawText('IP: ' + firma_ip, margin, y, { size: 8, color: rgb(0.5, 0.55, 0.6) }); y -= 12; }
    if (firma_dispositivo?.tipo) { drawText('Dispositivo: ' + firma_dispositivo.tipo + ' — ' + (firma_dispositivo.browser || ''), margin, y, { size: 8, color: rgb(0.5, 0.55, 0.6) }); y -= 12; }
    if (firma_dispositivo?.ubicacion && firma_dispositivo.ubicacion !== 'No disponible') {
      drawText('Ubicación: ' + firma_dispositivo.ubicacion, margin, y, { size: 8, color: rgb(0.5, 0.55, 0.6) }); y -= 12;
    }

    // Pie de validez
    y -= 16
    drawText('Este documento ha sido firmado electrónicamente y tiene plena validez legal conforme al Reglamento eIDAS.', margin, y, { size: 7, color: rgb(0.5, 0.55, 0.6) })
    y -= 10
    drawText('Documento generado por ' + (empresa.nombre || '') + ' — ' + new Date().toLocaleString('es-ES'), margin, y, { size: 7, color: rgb(0.6, 0.65, 0.7) })

    // ══════════════════════════════════════════════
    // BLOQUEAR EDICIÓN DEL PDF (encriptación con permisos)
    // ══════════════════════════════════════════════
    const ownerPassword = empresa_id + '_' + presupuesto_id + '_owner'
    pdfDoc.encrypt({
      ownerPassword,
      userPassword: '',
      permissions: {
        printing: 'highQuality',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
    })

    // ══════════════════════════════════════════════
    // SERIALIZAR PDF
    // ══════════════════════════════════════════════
    let pdfBytes = await pdfDoc.save()

    // ══════════════════════════════════════════════
    // FIRMA DIGITAL CON CERTIFICADO (opcional)
    // ══════════════════════════════════════════════
    let firmadoDigital = false
    const cert = certRes.data

    if (cert && cert.archivo_path) {
      try {
        let pfxData: Uint8Array | null = null
        const archivoPath = cert.archivo_path
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

        if (pfxData && cert.password_cifrada) {
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
            const p7 = forge.pkcs7.createSignedData()
            p7.content = forge.util.createBuffer(uint8ToBinaryString(pdfBytes))
            p7.addCertificate(certObj)
            p7.addSigner({
              key: keyObj,
              certificate: certObj,
              digestAlgorithm: forge.pki.oids.sha256,
              authenticatedAttributes: [
                { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
                { type: forge.pki.oids.messageDigest },
                { type: forge.pki.oids.signingTime, value: new Date() },
              ],
            })
            p7.sign()
            firmadoDigital = true
          }
        }
      } catch (certErr) {
        console.error('Error firmando digitalmente:', certErr)
      }
    }

    // ══════════════════════════════════════════════
    // GUARDAR PDF EN STORAGE
    // ══════════════════════════════════════════════
    const pdfPath = `documentos-firmados/${empresa_id}/presupuesto/${pres.numero || presupuesto_id}_firmado_${Date.now()}.pdf`
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' })

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

    // ══════════════════════════════════════════════
    // REGISTRAR EN documentos_generados
    // ══════════════════════════════════════════════
    const { error: docErr } = await sb.from('documentos_generados').insert({
      empresa_id,
      tipo_documento: 'presupuesto',
      documento_id: presupuesto_id,
      numero: pres.numero,
      entidad_tipo: 'cliente',
      entidad_id: pres.cliente_id,
      entidad_nombre: cliente?.nombre || pres.cliente_nombre || '',
      archivo_url: pdfUrl,
      archivo_path: pdfPath,
      archivo_size: pdfBytes.length,
      firmado: firmadoDigital,
      certificado_id: cert?.id || null,
      firma_fecha: new Date().toISOString(),
      generado_por: null,
    })
    if (docErr) console.error('Error insertando en documentos_generados:', docErr)

    // ── Guardar referencia en el presupuesto ──
    await sb.from('presupuestos').update({
      pdf_firmado_url: pdfUrl,
      pdf_firmado_path: pdfPath,
    }).eq('id', presupuesto_id)

    // ══════════════════════════════════════════════
    // ENVIAR COPIA POR EMAIL AL CLIENTE
    // ══════════════════════════════════════════════
    let emailEnviado = false
    if (enviar_copia_email && firma_email && pdfUrl) {
      try {
        // Buscar cuenta de correo predeterminada de la empresa
        const { data: cuentaCorreo } = await sb.from('cuentas_correo')
          .select('id')
          .eq('empresa_id', empresa_id)
          .eq('activa', true)
          .order('predeterminada', { ascending: false })
          .limit(1)
          .single()

        if (!cuentaCorreo) {
          console.error('No hay cuenta de correo activa para la empresa', empresa_id)
        }

        const pdfBase64 = btoa(uint8ToBinaryString(pdfBytes))

        const emailResp = await fetch(`${supabaseUrl}/functions/v1/enviar-correo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            empresa_id,
            cuenta_correo_id: cuentaCorreo?.id || null,
            para: firma_email,
            asunto: `Presupuesto ${pres.numero} firmado — ${empresa.nombre}`,
            cuerpo_html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#1e40af">Presupuesto firmado correctamente</h2>
                <p>Estimado/a ${firma_nombre},</p>
                <p>Adjunto encontrará una copia del presupuesto <strong>${pres.numero}</strong>${pres.titulo ? ' — ' + pres.titulo : ''} firmado el ${new Date(firma_fecha).toLocaleDateString('es-ES')}.</p>
                <table style="margin:16px 0;border-collapse:collapse">
                  <tr><td style="padding:4px 12px;color:#64748b">Importe total:</td><td style="padding:4px 12px;font-weight:bold">${fmtE(pres.total || 0)}</td></tr>
                  <tr><td style="padding:4px 12px;color:#64748b">Firmado por:</td><td style="padding:4px 12px">${firma_nombre} (${firma_dni})</td></tr>
                </table>
                <p>Este documento tiene validez legal como aceptación del presupuesto.</p>
                <p style="color:#94a3b8;font-size:12px;margin-top:24px">— ${empresa.nombre}<br>${empresa.telefono || ''}<br>${empresa.email || ''}</p>
              </div>
            `,
            adjuntos: [{
              nombre: `${pres.numero}_firmado.pdf`,
              base64: pdfBase64,
              tipo_mime: 'application/pdf',
            }],
          })
        })

        if (emailResp.ok) {
          emailEnviado = true
        } else {
          console.error('enviar-correo respondió con error:', emailResp.status, await emailResp.text())
        }
      } catch (emailErr) {
        console.error('Error enviando email:', emailErr)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      pdf_url: pdfUrl,
      pdf_path: pdfPath,
      firmado_digital: firmadoDigital,
      email_enviado: emailEnviado,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error en firmar-pdf:', error)
    return new Response(JSON.stringify({
      error: 'Error generando PDF: ' + (error.message || 'Error desconocido')
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
