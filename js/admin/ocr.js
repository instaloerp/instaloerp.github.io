// ═══════════════════════════════════════════════
// Bandeja OCR — Documentos pendientes de gestionar por IA
// Formato tabla estilo presupuestos — click para previsualizar
// Reutiliza sistema de importación IA existente (mIAPreview split-screen)
// ═══════════════════════════════════════════════

let _ocrDocs = []; // cache local para filtro de búsqueda

// ─── Realtime + Polling — actualización automática de la bandeja ───
let _ocrChannel        = null;
let _ocrReloadTimer    = null;
let _ocrPollInterval   = null;
let _ocrLastFingerprint = '';  // huella: id:estado de cada doc — detecta cambios de estado Y de cantidad
let _ocrIgnoreNext     = false; // evita re-render tras borrado manual

// Construye una huella única con todos los ids y sus estados actuales
async function _ocrGetFingerprint() {
  const { data } = await sb.from('documentos_ocr')
    .select('id,estado')
    .eq('empresa_id', EMPRESA.id)
    .order('id', { ascending: true });
  return data ? data.map(r => `${r.id}:${r.estado}`).join(',') : '';
}

// Polling cada 10 s: detecta tanto nuevos docs como cambios de estado (pendiente → completado)
function _ocrStartPoll() {
  if (_ocrPollInterval) return;
  _ocrPollInterval = setInterval(async () => {
    if (!EMPRESA?.id) return;
    try {
      const fp = await _ocrGetFingerprint();
      if (fp !== _ocrLastFingerprint) {
        _ocrLastFingerprint = fp;
        const paginaActiva = document.getElementById('page-ocr')?.classList.contains('active');
        if (paginaActiva) {
          loadOCRInbox();
        } else {
          updateOCRBadge();
        }
      }
    } catch(e) { /* silent */ }
  }, 10000);
}

function _ocrStopPoll() {
  clearInterval(_ocrPollInterval);
  _ocrPollInterval = null;
}

function _ocrStartRealtime() {
  _ocrStartPoll(); // siempre arrancar polling como garantía
  if (_ocrChannel) return; // ya suscrito al realtime
  _ocrChannel = sb
    .channel('ocr-rt-' + (EMPRESA?.id || 'g'))
    .on('postgres_changes', {
      event:  '*',               // INSERT · UPDATE · DELETE
      schema: 'public',
      table:  'documentos_ocr',
      filter: `empresa_id=eq.${EMPRESA.id}`
    }, () => {
      if (_ocrIgnoreNext) { _ocrIgnoreNext = false; return; } // ignorar evento propio del delete
      clearTimeout(_ocrReloadTimer);
      _ocrReloadTimer = setTimeout(() => {
        const paginaActiva = document.getElementById('page-ocr')?.classList.contains('active');
        if (paginaActiva) {
          loadOCRInbox();
        } else {
          updateOCRBadge();
        }
      }, 500);
    })
    .subscribe((status) => {
      const dot = document.getElementById('ocrLiveDot');
      if (dot) dot.style.background = status === 'SUBSCRIBED' ? '#22C55E' : '#94A3B8';
    });
}

function _ocrStopRealtime() {
  if (_ocrChannel) { sb.removeChannel(_ocrChannel); _ocrChannel = null; }
  clearTimeout(_ocrReloadTimer);
  _ocrStopPoll();
}

// ─── Badge counter in sidebar ───
async function updateOCRBadge() {
  try {
    const { count, error } = await sb.from('documentos_ocr')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', EMPRESA.id)
      .in('estado', ['pendiente', 'borrador']);
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

// ─── Load OCR inbox ───
async function loadOCRInbox() {
  const tbody = document.getElementById('ocrTableBody');
  if (!tbody) return;
  // Solo mostrar "Cargando..." si la tabla está vacía (primera carga)
  if (!tbody.children.length || (tbody.children.length === 1 && tbody.querySelector('[colspan]'))) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gris-400)">Cargando documentos OCR...</td></tr>';
  }

  const filtro = document.getElementById('ocrFiltroEstado')?.value || '';

  let q = sb.from('documentos_ocr')
    .select('*')
    .eq('empresa_id', EMPRESA.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filtro === 'pendiente') q = q.in('estado', ['pendiente', 'borrador']);
  else if (filtro) q = q.eq('estado', filtro);

  const { data, error } = await q;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--rojo)">
      Error al cargar: ${error.message}<br>
      <small>¿Has ejecutado crear_documentos_ocr.sql en Supabase?</small>
    </td></tr>`;
    return;
  }

  _ocrDocs = data || [];
  // Inicializar huella (DEBE coincidir con el orden de _ocrGetFingerprint: id ASC)
  _ocrLastFingerprint = [..._ocrDocs].sort((a,b) => a.id - b.id).map(r => `${r.id}:${r.estado}`).join(',');
  _ocrUpdateKpis();
  _ocrRenderTable(_ocrDocs);
  updateOCRBadge();
  _ocrStartRealtime(); // iniciar suscripción si aún no está activa
}

// ─── Update KPIs ───
function _ocrUpdateKpis() {
  // Contar por estado (sobre todos los docs, no filtrados)
  // Hacemos query aparte para KPIs totales
  sb.from('documentos_ocr')
    .select('estado')
    .eq('empresa_id', EMPRESA.id)
    .then(({ data }) => {
      if (!data) return;
      const counts = { pendiente: 0, borrador: 0, procesando: 0, completado: 0, error: 0 };
      data.forEach(d => { if (counts[d.estado] !== undefined) counts[d.estado]++; });
      const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      el('ocrKpiPend', counts.pendiente + counts.borrador);
      el('ocrKpiProc', counts.procesando);
      el('ocrKpiComp', counts.completado);
      el('ocrKpiErr', counts.error);
    });
}

// ─── Render table rows ───
function _ocrRenderTable(docs) {
  const tbody = document.getElementById('ocrTableBody');
  if (!tbody) return;

  if (!docs || !docs.length) {
    const filtro = document.getElementById('ocrFiltroEstado')?.value || '';
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gris-400)">
      <div style="font-size:36px;margin-bottom:8px">🤖</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">Sin documentos ${filtro ? filtro + 's' : ''}</div>
      <div style="font-size:12px">Los documentos subidos desde la app móvil aparecerán aquí</div>
    </td></tr>`;
    return;
  }

  const estadoConfig = {
    pendiente:  { ico: '⏳', color: '#92400e', bg: '#fef3c7', label: 'PENDIENTE' },
    borrador:   { ico: '📱', color: '#6D28D9', bg: '#F5F3FF', label: 'SUBIDO APP' },
    procesando: { ico: '⚙️', color: '#1e40af', bg: '#dbeafe', label: 'PROCESANDO' },
    completado: { ico: '✅', color: '#065f46', bg: '#d1fae5', label: 'COMPLETADO' },
    error:      { ico: '❌', color: '#991b1b', bg: '#fee2e2', label: 'ERROR' }
  };

  // Buscar nombres de usuarios
  const userMap = {};
  if (typeof todosUsuarios !== 'undefined' && todosUsuarios) {
    todosUsuarios.forEach(u => { userMap[u.id] = u.nombre || u.email || '—'; });
  }

  tbody.innerHTML = docs.map(doc => {
    const est = estadoConfig[doc.estado] || estadoConfig.pendiente;
    const dt = new Date(doc.created_at);
    const fecha = dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' });
    const hora = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const ext = (doc.archivo_nombre || '').split('.').pop().toLowerCase();
    const esImg = ['jpg','jpeg','png','webp','heic','heif'].includes(ext);
    const esPdf = ext === 'pdf';
    const icoTipo = esPdf ? '📄' : (esImg ? '🖼️' : '📎');
    const datos = doc.datos_extraidos;
    const resumen = datos ? _ocrResumenTexto(datos) : '';
    const usuario = userMap[doc.usuario_id] || '—';
    const vinculado = doc.documento_vinculado_id
      ? `<div style="font-size:10px;color:var(--verde);font-weight:600">✅ → ${doc.documento_vinculado_tipo} #${doc.documento_vinculado_id}</div>`
      : '';

    return `<tr style="cursor:pointer" onclick="ocrPrevisualizar(${doc.id})">
      <td style="text-align:center;font-size:22px;padding:8px">${icoTipo}</td>
      <td style="padding:8px 12px">
        <div style="font-weight:700;font-size:13px">${doc.archivo_nombre || 'Sin nombre'}</div>
        ${resumen ? `<div style="font-size:11px;color:var(--gris-500);margin-top:1px">${resumen}</div>` : ''}
        ${vinculado}
      </td>
      <td style="font-size:12px;padding:8px">${usuario}</td>
      <td style="white-space:nowrap;font-size:12px;padding:8px">
        <div>${fecha}</div>
        <div style="color:var(--gris-400);font-size:11px">${hora}</div>
      </td>
      <td style="padding:8px">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${est.bg};color:${est.color};white-space:nowrap;display:inline-block">${est.ico} ${est.label}</span>
      </td>
      <td style="padding:8px;white-space:nowrap" onclick="event.stopPropagation()">
        ${!doc.documento_vinculado_id
          ? `<button class="btn btn-sm" onclick="ocrGestionar(${doc.id})" style="font-size:11px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:none;font-weight:600;margin-right:4px">🤖 Importar con IA</button><button class="btn btn-ghost btn-sm" onclick="ocrEliminar(${doc.id})" style="font-size:11px;color:var(--rojo)" title="Rechazar">✕</button>`
          : `<button class="btn btn-secondary btn-sm" onclick="ocrVerVinculado(${doc.id})" style="font-size:11px;margin-right:4px">Ver doc.</button><button class="btn btn-ghost btn-sm" onclick="ocrEliminar(${doc.id})" style="font-size:11px;color:var(--rojo)" title="Eliminar">🗑️</button>`}
      </td>
    </tr>`;
  }).join('');
}

// ─── Filtro de búsqueda local ───
function filtrarOCR() {
  const q = (document.getElementById('ocrSearch')?.value || '').toLowerCase().trim();
  if (!q) { _ocrRenderTable(_ocrDocs); return; }
  const filtered = _ocrDocs.filter(d => {
    const nombre = (d.archivo_nombre || '').toLowerCase();
    const resumen = d.datos_extraidos ? _ocrResumenTexto(d.datos_extraidos).toLowerCase() : '';
    return nombre.includes(q) || resumen.includes(q);
  });
  _ocrRenderTable(filtered);
}

// Resumen en texto plano
function _ocrResumenTexto(datos) {
  const parts = [];
  if (datos.proveedor) {
    const nombre = typeof datos.proveedor === 'object' ? datos.proveedor.nombre : datos.proveedor;
    if (nombre) parts.push(nombre);
  }
  if (datos.numero || datos.numero_documento) parts.push('Nº ' + (datos.numero || datos.numero_documento));
  if (datos.total != null) parts.push(Number(datos.total).toFixed(2) + ' €');
  return parts.join(' · ');
}

// ═══════════════════════════════════════════════
// PREVISUALIZAR — Modal con imagen o PDF del documento
// ═══════════════════════════════════════════════
async function ocrPrevisualizar(id) {
  const { data: doc, error } = await sb.from('documentos_ocr').select('*').eq('id', id).single();
  if (error || !doc) { toast('Error al cargar documento', 'error'); return; }

  const imgUrl = doc.archivo_path ? sb.storage.from('documentos').getPublicUrl(doc.archivo_path).data.publicUrl : '';
  if (!imgUrl) { toast('Sin archivo para previsualizar', 'error'); return; }

  const ext = (doc.archivo_nombre || '').split('.').pop().toLowerCase();
  const esPdf = ext === 'pdf';
  const est = { pendiente: '⏳ Pendiente', procesando: '⚙️ Procesando', completado: '✅ Completado', error: '❌ Error' };

  let contenido;
  if (esPdf) {
    contenido = `<iframe src="${imgUrl}" style="width:100%;height:70vh;border:none;border-radius:8px"></iframe>`;
  } else {
    contenido = `<img src="${imgUrl}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:8px;border:1px solid var(--gris-200)">`;
  }

  const container = document.getElementById('ocrPreviewContent');
  if (!container) { toast('Error: modal OCR no encontrado', 'error'); return; }
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <h3 style="font-size:15px;font-weight:800;margin:0">${doc.archivo_nombre || 'Documento OCR'}</h3>
        <div style="font-size:12px;color:var(--gris-400);margin-top:2px">${new Date(doc.created_at).toLocaleString('es-ES')} · ${est[doc.estado] || doc.estado}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="window.open('${imgUrl}','_blank')" style="font-size:11px">🔗 Abrir en nueva pestaña</button>
    </div>
    <div style="text-align:center;background:var(--gris-50);border-radius:10px;padding:12px;min-height:300px;display:flex;align-items:center;justify-content:center">
      ${contenido}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      ${!doc.documento_vinculado_id
        ? `<button class="btn btn-primary" onclick="closeModal('mOcrPreview');ocrGestionar(${doc.id})" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);border:none;font-weight:600">🤖 Importar con IA</button>
           <button class="btn btn-ghost" onclick="closeModal('mOcrPreview');ocrEliminar(${doc.id})" style="color:var(--rojo)">✕ Rechazar</button>`
        : `<button class="btn btn-secondary" onclick="closeModal('mOcrPreview');ocrVerVinculado(${doc.id})">📄 Ver documento creado</button>`}
      <button class="btn btn-secondary" onclick="closeModal('mOcrPreview')">Cerrar</button>
    </div>
  `;
  openModal('mOcrPreview');
}

// ═══════════════════════════════════════════════
// GESTIONAR — Descargar imagen, convertir a base64 y lanzar el flujo IA existente
// ═══════════════════════════════════════════════
let _ocrCurrentDocId = null;

async function ocrGestionar(id) {
  if (!EMPRESA?.anthropic_api_key) {
    toast('Configura primero la API Key de Anthropic en Configuración > Inteligencia Artificial', 'warning');
    return;
  }

  const { data: doc, error } = await sb.from('documentos_ocr').select('*').eq('id', id).single();
  if (error || !doc) { toast('Error al cargar documento', 'error'); return; }

  // Si ya tiene datos extraídos y está completado, abrir directamente el preview
  if (doc.estado === 'completado' && doc.datos_extraidos && doc.datos_extraidos.lineas) {
    _ocrCurrentDocId = id;
    _iaPreviewData = _ocrSanitizeNumeros(doc.datos_extraidos);
    // Usar tipo detectado por la IA
    _iaPreviewTipo = doc.datos_extraidos.tipo_documento || doc.tipo_documento || 'factura';
    // Normalizar nombres
    if (_iaPreviewTipo === 'albaran_prov') _iaPreviewTipo = 'albaran';
    if (_iaPreviewTipo === 'factura_prov') _iaPreviewTipo = 'factura';
    _iaPreviewProvMatch = _iaBuscarProveedorExistente(doc.datos_extraidos.proveedor);
    if (doc.datos_extraidos.lineas) {
      for (const linea of doc.datos_extraidos.lineas) {
        linea._artMatch = _iaBuscarArticuloExistente(linea);
      }
    }
    await _ocrCargarImagenEnPreview(doc);
    iaPreviewMostrar();
    return;
  }

  // Si está pendiente → procesar directamente, la IA detecta el tipo automáticamente
  _ocrCurrentDocId = id;
  toast('Descargando imagen para procesar con IA...', 'info');

  try {
    const imgUrl = sb.storage.from('documentos').getPublicUrl(doc.archivo_path).data.publicUrl;
    if (!imgUrl) throw new Error('No se pudo obtener URL del archivo');
    const response = await fetch(imgUrl);
    if (!response.ok) throw new Error('No se pudo descargar la imagen (HTTP ' + response.status + ')');

    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    _iaFileBase64 = base64;
    _iaFileName = doc.archivo_nombre || 'documento_ocr';
    _iaFileMime = mimeType;

    // No enviamos tipo — la IA lo detecta automáticamente
    // El usuario puede corregirlo en la pantalla de preview antes de validar
    document.getElementById('ia_tipo_doc').value = 'factura'; // fallback por defecto

    await sb.from('documentos_ocr').update({
      estado: 'procesando',
      updated_at: new Date().toISOString()
    }).eq('id', id);

    await _ocrProcesarDirecto(id, doc);

  } catch(e) {
    toast('Error: ' + e.message, 'error');
    await sb.from('documentos_ocr').update({
      estado: 'error',
      notas: 'Error: ' + e.message,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    loadOCRInbox();
  }
}

// ─── Sanitizar campos numéricos: la OCR confunde O(letra) con 0(cero) ───
// Se aplica a todos los importes y cantidades antes de mostrar el preview.
function _ocrSanitizeNumeros(data) {
  if (!data || typeof data !== 'object') return data;

  // Convierte cadena que debería ser número: reemplaza O/o por 0, elimina espacios y letras extra
  function limpiarNum(v) {
    if (v === null || v === undefined) return v;
    const s = String(v)
      .replace(/[Oo]/g, '0')   // O/o → 0
      .replace(/[Ss]/g, '5')   // S/s → 5 (confusión frecuente)
      .replace(/[Il]/g, '1')   // I/l → 1
      .replace(/[^0-9.,\-]/g, '') // quitar cualquier otro carácter no numérico
      .replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Campos de importe en el nivel raíz
  const camposNum = ['total','subtotal','base_imponible','iva','iva_importe',
                     'iva_porcentaje','irpf','irpf_importe','descuento','recargo'];
  camposNum.forEach(k => { if (k in data) data[k] = limpiarNum(data[k]); });

  // Líneas
  if (Array.isArray(data.lineas)) {
    data.lineas = data.lineas.map(l => {
      const camposLinea = ['cantidad','precio_unitario','precio','total','descuento','iva'];
      camposLinea.forEach(k => { if (k in l) l[k] = limpiarNum(l[k]); });
      return l;
    });
  }

  return data;
}

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
      body: JSON.stringify({ imagen_base64: _iaFileBase64, media_type: _iaFileMime, tipo, empresa_id: EMPRESA.id, empresa_nombre: EMPRESA.nombre || '', empresa_cif: EMPRESA.cif || '' })
    });

    const result = await resp.json();
    if (!result.success) throw new Error(result.error || 'Error procesando documento');

    const data = _ocrSanitizeNumeros(result.data);

    // Usar tipo detectado por la IA (data.tipo_documento) o fallback
    const tipoDetectado = data.tipo_documento || tipo || 'factura';

    await sb.from('documentos_ocr').update({
      estado: 'completado',
      tipo_documento: tipoDetectado,
      datos_extraidos: data,
      updated_at: new Date().toISOString()
    }).eq('id', ocrDocId);

    _iaPreviewData = data;
    // Normalizar para el preview
    let tipoPreview = tipoDetectado;
    if (tipoPreview === 'albaran_prov') tipoPreview = 'albaran';
    if (tipoPreview === 'factura_prov') tipoPreview = 'factura';
    _iaPreviewTipo = tipoPreview;
    _iaPreviewProvMatch = _iaBuscarProveedorExistente(data.proveedor);
    if (data.lineas) {
      for (const linea of data.lineas) {
        linea._artMatch = _iaBuscarArticuloExistente(linea);
      }
    }

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

async function _ocrCargarImagenEnPreview(doc) {
  try {
    const imgUrl = sb.storage.from('documentos').getPublicUrl(doc.archivo_path).data.publicUrl;
    if (!imgUrl) throw new Error('No se pudo obtener URL del archivo');
    const response = await fetch(imgUrl);
    if (!response.ok) throw new Error('HTTP ' + response.status);
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

  // 1. Borrado optimista: quitar de la cache local y re-renderizar YA (sin esperar a la DB)
  _ocrDocs = _ocrDocs.filter(d => d.id !== id);
  _ocrRenderTable(_ocrDocs);
  _ocrUpdateKpis();
  // Recalcular huella local para que el polling no re-dispare después del borrado
  _ocrLastFingerprint = _ocrDocs.map(r => `${r.id}:${r.estado}`).join(',');

  // 2. Cancelar cualquier reload pendiente (del realtime) para evitar que el item reaparezca
  clearTimeout(_ocrReloadTimer);
  _ocrIgnoreNext = true; // el DELETE en la DB dispara un evento realtime — lo ignoramos

  // 3. Borrar en la DB (en segundo plano)
  const { data: doc } = await sb.from('documentos_ocr').select('archivo_path').eq('id', id).single();
  const { error } = await sb.from('documentos_ocr').delete().eq('id', id);
  if (error) {
    toast('Error al eliminar: ' + error.message, 'error');
    // Revertir: recargar para restaurar el estado real
    _ocrIgnoreNext = false;
    loadOCRInbox();
    return;
  }

  // 4. Borrar el archivo del storage
  if (doc?.archivo_path) {
    await sb.storage.from('documentos').remove([doc.archivo_path]);
  }

  toast('Documento OCR eliminado', 'success');
  updateOCRBadge();
  // No llamamos loadOCRInbox() — ya está actualizado con el borrado optimista
}

// ─── Hook: update badge on app init ───
if (typeof window._initHooks === 'undefined') window._initHooks = [];
window._initHooks.push(updateOCRBadge);

// El badge se actualiza automáticamente mediante el polling de 15s (_ocrStartPoll)
// No hace falta un setInterval adicional aquí
