// ═══════════════════════════════════════════════
// Bandeja OCR — Documentos pendientes de gestionar por IA
// Reutiliza el sistema de importación IA existente (mIAPreview split-screen)
// ═══════════════════════════════════════════════

// ─── Badge counter in sidebar ───
async function updateOCRBadge() {
  try {
    const { count, error } = await sb.from('documentos_ocr')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', EMPRESA.id)
      .eq('estado', 'pendiente');
    const badge = document.getElementById('ocrBadge');
    if (!badge) return;
    if (!error && count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) { /* silently ignore */ }
}

// ─── Load OCR inbox (grid de tarjetas) ───
async function loadOCRInbox() {
  const grid = document.getElementById('ocrGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gris-400)">Cargando documentos OCR...</div>';

  const filtro = document.getElementById('ocrFiltroEstado')?.value || '';

  let q = sb.from('documentos_ocr')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filtro) q = q.eq('estado', filtro);

  const { data, error } = await q;

  if (error) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--rojo)">
      Error al cargar: ${error.message}<br>
      <small>¿Has ejecutado crear_documentos_ocr.sql en Supabase?</small>
    </div>`;
    return;
  }

  if (!data || !data.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gris-400)">
      <div style="font-size:48px;margin-bottom:12px">🤖</div>
      <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">Sin documentos ${filtro ? 'con estado "' + filtro + '"' : 'pendientes'}</h3>
      <p style="font-size:12px">Los documentos subidos desde la app móvil aparecerán aquí</p>
    </div>`;
    return;
  }

  const estadoConfig = {
    pendiente:  { ico: '⏳', color: '#f59e0b', bg: '#fef3c7', label: 'Pendiente' },
    procesando: { ico: '⚙️', color: '#3b82f6', bg: '#dbeafe', label: 'Procesando' },
    completado: { ico: '✅', color: '#10b981', bg: '#d1fae5', label: 'Completado' },
    error:      { ico: '❌', color: '#ef4444', bg: '#fee2e2', label: 'Error' }
  };

  const tipoLabels = {
    factura_prov: '📑 Factura proveedor',
    albaran_prov: '📥 Albarán proveedor',
    otro: '📄 Otro documento'
  };

  grid.innerHTML = data.map(doc => {
    const est = estadoConfig[doc.estado] || estadoConfig.pendiente;
    const fecha = new Date(doc.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const imgUrl = doc.archivo_path ? sb.storage.from('fotos-partes').getPublicUrl(doc.archivo_path).data.publicUrl : '';
    const tipoLabel = doc.tipo_documento ? (tipoLabels[doc.tipo_documento] || doc.tipo_documento) : '📄 Sin clasificar';
    const vinculado = doc.documento_vinculado_id
      ? `<div style="font-size:11px;color:var(--verde);font-weight:600;margin-top:4px">✅ Vinculado → ${doc.documento_vinculado_tipo} #${doc.documento_vinculado_id}</div>`
      : '';
    const datos = doc.datos_extraidos;
    const resumen = datos ? _ocrResumen(datos) : '';

    return `<div class="card" style="padding:0;overflow:hidden">
      <div style="height:180px;background:var(--gris-100);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer" onclick="ocrPrevisualizar('${imgUrl}')">
        ${imgUrl
          ? `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<span style=\\'font-size:40px\\'>📄</span>'">`
          : '<span style="font-size:40px">📄</span>'}
      </div>
      <div style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:6px">
          <div style="font-weight:700;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${doc.archivo_nombre || 'Sin nombre'}</div>
          <span style="flex-shrink:0;font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;background:${est.bg};color:${est.color}">${est.ico} ${est.label}</span>
        </div>
        <div style="font-size:11.5px;color:var(--gris-500);margin-bottom:4px">📅 ${fecha}</div>
        ${resumen}
        ${vinculado}
        ${doc.notas ? `<div style="font-size:11px;color:var(--gris-400);margin-top:4px;font-style:italic">"${doc.notas}"</div>` : ''}
      </div>
      <div style="border-top:1px solid var(--gris-100);padding:10px 12px;display:flex;gap:8px">
        ${!doc.documento_vinculado_id
          ? `<button class="btn btn-primary btn-sm" onclick="ocrGestionar(${doc.id})" style="flex:1;font-size:12px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border:none;font-weight:600">🤖 Importar con IA</button>
             <button class="btn btn-ghost btn-sm" onclick="ocrEliminar(${doc.id})" style="font-size:12px;color:var(--rojo);font-weight:600" title="Rechazar">✕ Rechazar</button>`
          : `<button class="btn btn-secondary btn-sm" onclick="ocrVerVinculado(${doc.id})" style="flex:1;font-size:12px">📄 Ver documento creado</button>
             <button class="btn btn-ghost btn-sm" onclick="ocrEliminar(${doc.id})" style="font-size:12px;color:var(--rojo)" title="Eliminar">🗑️</button>`}
      </div>
    </div>`;
  }).join('');

  updateOCRBadge();
}

function _ocrResumen(datos) {
  const parts = [];
  if (datos.proveedor) {
    const nombre = typeof datos.proveedor === 'object' ? datos.proveedor.nombre : datos.proveedor;
    if (nombre) parts.push(`<strong>${nombre}</strong>`);
  }
  if (datos.numero || datos.numero_documento) parts.push(`Nº ${datos.numero || datos.numero_documento}`);
  if (datos.fecha) parts.push(datos.fecha);
  if (datos.total != null) parts.push(`Total: ${Number(datos.total).toFixed(2)} €`);
  if (!parts.length) return '';
  return `<div style="font-size:11.5px;color:var(--gris-700);margin-top:6px;padding:6px 8px;background:var(--gris-50);border-radius:6px">${parts.join(' · ')}</div>`;
}

// ═══════════════════════════════════════════════
// PREVISUALIZAR — Ver imagen del documento en grande
// ═══════════════════════════════════════════════
function ocrPrevisualizar(imgUrl) {
  if (!imgUrl) return;
  document.getElementById('modalContent').innerHTML = `
    <div style="max-width:90vw;max-height:85vh;text-align:center">
      <img src="${imgUrl}" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:8px;border:1px solid var(--gris-200)">
      <div style="margin-top:12px">
        <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-ghost" onclick="window.open('${imgUrl}','_blank');closeModal()" style="margin-left:8px">🔗 Abrir en nueva pestaña</button>
      </div>
    </div>
  `;
  openModal();
}

// ═══════════════════════════════════════════════
// GESTIONAR — Descargar imagen, convertir a base64 y lanzar el flujo IA existente
// ═══════════════════════════════════════════════
let _ocrCurrentDocId = null;

async function ocrGestionar(id) {
  // Check API key
  if (!EMPRESA?.anthropic_api_key) {
    toast('Configura primero la API Key de Anthropic en Configuración > Inteligencia Artificial', 'warning');
    return;
  }

  const { data: doc, error } = await sb.from('documentos_ocr').select('*').eq('id', id).single();
  if (error || !doc) { toast('Error al cargar documento', 'error'); return; }

  // Si ya tiene datos extraídos y está completado, abrir directamente el preview
  if (doc.estado === 'completado' && doc.datos_extraidos && doc.datos_extraidos.lineas) {
    _ocrCurrentDocId = id;
    _iaPreviewData = doc.datos_extraidos;
    _iaPreviewTipo = doc.tipo_documento === 'albaran_prov' ? 'albaran' : 'factura';
    _iaPreviewProvMatch = _iaBuscarProveedorExistente(doc.datos_extraidos.proveedor);
    if (doc.datos_extraidos.lineas) {
      for (const linea of doc.datos_extraidos.lineas) {
        linea._artMatch = _iaBuscarArticuloExistente(linea);
      }
    }
    // Cargar imagen para preview
    await _ocrCargarImagenEnPreview(doc);
    iaPreviewMostrar();
    return;
  }

  // Si está pendiente, necesitamos descargar la imagen y procesarla con IA
  _ocrCurrentDocId = id;
  toast('Descargando imagen para procesar...', 'info');

  try {
    // Descargar imagen desde storage
    const imgUrl = sb.storage.from('fotos-partes').getPublicUrl(doc.archivo_path).data.publicUrl;
    const response = await fetch(imgUrl);
    if (!response.ok) throw new Error('No se pudo descargar la imagen');

    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';

    // Convertir a base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Rellenar los globals del sistema IA existente
    _iaFileBase64 = base64;
    _iaFileName = doc.archivo_nombre || 'documento_ocr';
    _iaFileMime = mimeType;

    // Abrir el modal de importación con el archivo ya cargado, directamente
    // pero saltamos el modal de upload y vamos directo a procesamiento
    document.getElementById('ia_tipo_doc').value = doc.tipo_documento === 'albaran_prov' ? 'albaran' : 'factura';

    // Marcar documento como procesando
    await sb.from('documentos_ocr').update({
      estado: 'procesando',
      updated_at: new Date().toISOString()
    }).eq('id', id);

    // Lanzar procesamiento directamente
    await _ocrProcesarDirecto(id, doc);

  } catch(e) {
    toast('Error: ' + e.message, 'error');
    // Reset estado
    await sb.from('documentos_ocr').update({
      estado: 'error',
      notas: 'Error: ' + e.message,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    loadOCRInbox();
  }
}

// Procesar directamente sin pasar por el modal de upload
async function _ocrProcesarDirecto(ocrDocId, doc) {
  if (!_iaFileBase64) { toast('Sin imagen para procesar', 'error'); return; }

  toast('Procesando documento con IA...', 'info');

  try {
    let apiKey;
    try { apiKey = decodeURIComponent(escape(atob(EMPRESA.anthropic_api_key))); }
    catch(_) { apiKey = EMPRESA.anthropic_api_key; }

    const tipo = document.getElementById('ia_tipo_doc').value || 'factura';

    const resp = await fetch('https://gskkqqhbpnycvuioqetj.supabase.co/functions/v1/ocr-documento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anthropic-key': apiKey },
      body: JSON.stringify({ imagen_base64: _iaFileBase64, media_type: _iaFileMime, tipo, empresa_id: EMPRESA.id })
    });

    const result = await resp.json();
    if (!result.success) throw new Error(result.error || 'Error procesando documento');

    const data = result.data;

    // Guardar datos extraídos en documentos_ocr
    await sb.from('documentos_ocr').update({
      estado: 'completado',
      tipo_documento: tipo === 'albaran' ? 'albaran_prov' : 'factura_prov',
      datos_extraidos: data,
      updated_at: new Date().toISOString()
    }).eq('id', ocrDocId);

    // Configurar preview IA
    _iaPreviewData = data;
    _iaPreviewTipo = tipo;
    _iaPreviewProvMatch = _iaBuscarProveedorExistente(data.proveedor);
    if (data.lineas) {
      for (const linea of data.lineas) {
        linea._artMatch = _iaBuscarArticuloExistente(linea);
      }
    }

    // Mostrar split-screen preview
    iaPreviewMostrar();
    toast('Documento procesado correctamente', 'success');

  } catch(e) {
    toast('Error al procesar: ' + e.message, 'error');
    await sb.from('documentos_ocr').update({
      estado: 'error',
      notas: 'Error OCR: ' + e.message,
      updated_at: new Date().toISOString()
    }).eq('id', ocrDocId);
    loadOCRInbox();
  }
}

// Cargar imagen en el preview (para docs ya procesados)
async function _ocrCargarImagenEnPreview(doc) {
  try {
    const imgUrl = sb.storage.from('fotos-partes').getPublicUrl(doc.archivo_path).data.publicUrl;
    const response = await fetch(imgUrl);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    _iaFileBase64 = base64;
    _iaFileMime = mimeType;
    _iaFileName = doc.archivo_nombre || 'documento_ocr';
  } catch(e) {
    console.warn('No se pudo cargar imagen para preview:', e);
    _iaFileBase64 = null;
  }
}

// ─── Ver documento vinculado ───
function ocrVerVinculado(id) {
  sb.from('documentos_ocr').select('documento_vinculado_tipo,documento_vinculado_id').eq('id', id).single().then(({ data }) => {
    if (!data) return;
    if (data.documento_vinculado_tipo === 'factura_prov') goPage('facturas-proveedor');
    else if (data.documento_vinculado_tipo === 'albaran_prov') goPage('albaranes-proveedor');
    else goPage('ocr');
  });
}

// ─── Eliminar documento OCR ───
async function ocrEliminar(id) {
  if (!confirm('¿Eliminar este documento OCR?')) return;

  const { data: doc } = await sb.from('documentos_ocr').select('archivo_path').eq('id', id).single();
  const { error } = await sb.from('documentos_ocr').delete().eq('id', id);
  if (error) { toast('Error al eliminar: ' + error.message, 'error'); return; }

  if (doc?.archivo_path) {
    await sb.storage.from('fotos-partes').remove([doc.archivo_path]);
  }

  toast('Documento OCR eliminado', 'success');
  loadOCRInbox();
}

// ─── Hook: update badge on app init ───
if (typeof window._initHooks === 'undefined') window._initHooks = [];
window._initHooks.push(updateOCRBadge);

// Auto-refresh badge every 60s
setInterval(updateOCRBadge, 60000);
