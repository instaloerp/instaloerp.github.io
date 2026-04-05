// ═══════════════════════════════════════════════════════════════
// FIRMA DIGITAL — Helper para firmar y guardar documentos PDF
// ═══════════════════════════════════════════════════════════════

/**
 * Firma un PDF y lo guarda en documentos_generados.
 *
 * @param {Uint8Array|ArrayBuffer|Blob} pdfData — El PDF a firmar
 * @param {Object} docInfo — Info del documento:
 *   tipo_documento: 'factura'|'presupuesto'|'albaran'|'pedido_compra'|'presupuesto_compra'|'mandato_sepa'|'parte_trabajo'
 *   documento_id: ID del registro
 *   numero: Número del documento (FAC-2026-001, etc.)
 *   entidad_tipo: 'cliente'|'proveedor'|'obra'
 *   entidad_id: ID de la entidad
 *   entidad_nombre: Nombre de la entidad
 * @returns {Object} { success, pdf_firmado_url, firma_info, error }
 */
async function firmarYGuardarPDF(pdfData, docInfo) {
  try {
    // Verificar que hay certificado configurado
    if (typeof _certActual !== 'undefined' && !_certActual) {
      // Intentar cargar
      const { data } = await sb.from('certificados_digitales')
        .select('id')
        .eq('empresa_id', EMPRESA.id)
        .eq('activo', true)
        .eq('predeterminado', true)
        .single();
      if (!data) {
        console.warn('⚠️ No hay certificado digital configurado — documento guardado sin firmar');
        // Guardar sin firmar
        return await _guardarDocSinFirma(pdfData, docInfo);
      }
    }

    // Convertir PDF a base64
    let pdfBytes;
    if (pdfData instanceof Blob) {
      pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    } else if (pdfData instanceof ArrayBuffer) {
      pdfBytes = new Uint8Array(pdfData);
    } else {
      pdfBytes = pdfData;
    }

    let base64 = '';
    const chunk = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      base64 += String.fromCharCode.apply(null, pdfBytes.subarray(i, i + chunk));
    }
    base64 = btoa(base64);

    // Añadir usuario actual
    const userId = (await sb.auth.getUser())?.data?.user?.id || null;
    docInfo.usuario_id = userId;

    // Llamar a la Edge Function
    const { data, error } = await sb.functions.invoke('firmar-pdf', {
      body: {
        pdf_base64: base64,
        empresa_id: EMPRESA.id,
        documento_info: docInfo
      }
    });

    if (error) {
      console.warn('⚠️ Error firmando PDF:', error.message);
      // Fallback: guardar sin firmar
      return await _guardarDocSinFirma(pdfData, docInfo);
    }

    if (data?.success) {
      toast('📝 Documento firmado y guardado', 'success');
    }
    return data;

  } catch (e) {
    console.warn('⚠️ Error en firmarYGuardarPDF:', e.message);
    // Fallback: guardar sin firmar
    return await _guardarDocSinFirma(pdfData, docInfo);
  }
}

/**
 * Guarda un documento PDF SIN firmar (fallback si no hay certificado o falla la firma)
 */
async function _guardarDocSinFirma(pdfData, docInfo) {
  try {
    let pdfBytes;
    if (pdfData instanceof Blob) {
      pdfBytes = pdfData;
    } else if (pdfData instanceof ArrayBuffer) {
      pdfBytes = new Blob([pdfData], { type: 'application/pdf' });
    } else {
      pdfBytes = new Blob([pdfData], { type: 'application/pdf' });
    }

    const path = `documentos-firmados/${EMPRESA.id}/${docInfo.tipo_documento}/${docInfo.numero || docInfo.documento_id}_${Date.now()}.pdf`;

    // Subir al Storage
    const { error: upErr } = await sb.storage.from('documentos').upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true
    });

    let archivoUrl = '';
    if (!upErr) {
      const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
      archivoUrl = urlData?.publicUrl || '';
    } else {
      console.warn('⚠️ Error subiendo PDF:', upErr.message);
      return { success: false, error: upErr.message };
    }

    // Registrar en BD
    const userId = (await sb.auth.getUser())?.data?.user?.id || null;
    await sb.from('documentos_generados').insert({
      empresa_id: EMPRESA.id,
      tipo_documento: docInfo.tipo_documento,
      documento_id: docInfo.documento_id,
      numero: docInfo.numero,
      entidad_tipo: docInfo.entidad_tipo,
      entidad_id: docInfo.entidad_id,
      entidad_nombre: docInfo.entidad_nombre,
      archivo_url: archivoUrl,
      archivo_path: path,
      archivo_size: pdfBytes.size || 0,
      firmado: false,
      generado_por: userId,
    });

    return { success: true, pdf_firmado_url: archivoUrl, firmado: false };
  } catch (e) {
    console.warn('⚠️ Error guardando documento:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Obtener documentos generados de una entidad (para mostrar en ficha)
 */
async function obtenerDocumentosEntidad(entidadTipo, entidadId) {
  try {
    const { data, error } = await sb.from('documentos_generados')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .eq('entidad_tipo', entidadTipo)
      .eq('entidad_id', entidadId)
      .order('created_at', { ascending: false });
    return error ? [] : (data || []);
  } catch (e) {
    return [];
  }
}

/**
 * Obtener documentos de un documento específico
 */
async function obtenerDocumentosDeRegistro(tipoDocumento, documentoId) {
  try {
    const { data, error } = await sb.from('documentos_generados')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .eq('tipo_documento', tipoDocumento)
      .eq('documento_id', documentoId)
      .order('created_at', { ascending: false });
    return error ? [] : (data || []);
  } catch (e) {
    return [];
  }
}
