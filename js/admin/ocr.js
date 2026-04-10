// ═══════════════════════════════════════════════
// Bandeja OCR — Documentos pendientes de gestionar por IA
// Formato tabla estilo presupuestos — click para previsualizar
// Reutiliza sistema de importación IA existente (mIAPreview split-screen)
// ═══════════════════════════════════════════════

let _ocrDocs = []; // cache local para filtro de búsqueda

// ─── Renderizar PDF como imágenes (sin visor del navegador) ───
async function _renderPdfPages(url, containerId) {
  const container = document.getElementById(containerId);
  if (!container || typeof pdfjsLib === 'undefined') {
    if (container) container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--gris-400)">PDF.js no disponible</div>`;
    return;
  }
  container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gris-400)">Cargando PDF...</div>';
  try {
    // Soportar data:application/pdf;base64,... convirtiéndolo a Uint8Array para pdfjsLib
    let pdfSource = url;
    if (url.startsWith('data:application/pdf;base64,')) {
      const b64 = url.split(',')[1];
      const binStr = atob(b64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      pdfSource = { data: bytes };
    }
    const pdf = await pdfjsLib.getDocument(pdfSource).promise;
    container.innerHTML = '';
    const scale = 1.5;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.cssText = 'width:100%;border-radius:6px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.1)';
      canvas.title = 'Página ' + i + ' de ' + pdf.numPages;
      container.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch(e) {
    console.error('[PDF render]', e);
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--rojo)">Error renderizando PDF: ${e.message}</div>`;
  }
}

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
        ${doc.estado === 'completado'
          ? `<span style="font-size:11px;color:var(--gris-400)">Ya validado</span>`
          : doc.documento_vinculado_id
          ? `<button class="btn btn-secondary btn-sm" onclick="ocrVerVinculado(${doc.id})" style="font-size:11px;margin-right:4px">Ver doc.</button><button class="btn btn-ghost btn-sm" onclick="ocrEliminar(${doc.id})" style="font-size:11px;color:var(--rojo)" title="Eliminar">🗑️</button>`
          : datos?.materiales_seleccionados
            ? `<button class="btn btn-sm" onclick="ocrValidar(${doc.id})" style="font-size:11px;background:linear-gradient(135deg,#059669,#10B981);color:#fff;border:none;font-weight:600;margin-right:4px">✅ Validar</button><button class="btn btn-ghost btn-sm" onclick="ocrEliminar(${doc.id})" style="font-size:11px;color:var(--rojo)" title="Rechazar">✕</button>`
            : `<button class="btn btn-sm" onclick="ocrGestionar(${doc.id})" style="font-size:11px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:none;font-weight:600;margin-right:4px">🤖 Importar con IA</button><button class="btn btn-ghost btn-sm" onclick="ocrEliminar(${doc.id})" style="font-size:11px;color:var(--rojo)" title="Rechazar">✕</button>`}
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

  let imgUrl = doc.archivo_path ? sb.storage.from('documentos').getPublicUrl(doc.archivo_path).data.publicUrl : '';

  // Documentos migrados: pueden tener fotos en datos_extraidos en lugar de archivo_path
  const esMigrado = doc.datos_extraidos?.migrado_desde === 'partes_trabajo.albaranes_compra';
  const fotosJson = doc.datos_extraidos?.fotos || doc.datos_extraidos?.fotos_urls || [];
  const fotosMigradas = Array.isArray(fotosJson) ? fotosJson : [];

  if (!imgUrl && !fotosMigradas.length) { toast('Sin archivo para previsualizar', 'error'); return; }

  const ext = (doc.archivo_nombre || '').split('.').pop().toLowerCase();
  const esPdf = ext === 'pdf';
  const est = { pendiente: '⏳ Pendiente', procesando: '⚙️ Procesando', completado: '✅ Completado', error: '❌ Error', borrador: '📱 Subido App' };

  let contenido;
  if (fotosMigradas.length && !imgUrl) {
    // Mostrar fotos embebidas del documento migrado (base64 o URLs)
    contenido = fotosMigradas.map((foto, i) => {
      const src = foto.startsWith && foto.startsWith('data:') ? foto
        : foto.startsWith && foto.startsWith('http') ? foto
        : sb.storage.from('documentos').getPublicUrl(foto).data.publicUrl;
      return `<div style="margin-bottom:8px"><img src="${src}" style="max-width:100%;max-height:60vh;object-fit:contain;border-radius:8px;border:1px solid var(--gris-200)"><div style="font-size:10px;color:var(--gris-400);margin-top:4px">Página ${i+1}</div></div>`;
    }).join('');
    if (esMigrado) contenido = `<div style="padding:8px 12px;background:#FEF3C7;border-radius:8px;margin-bottom:10px;font-size:11px;color:#92400E">⚠️ Documento migrado desde parte — las fotos son del escaneo original</div>` + contenido;
  } else if (esPdf) {
    contenido = `<div id="ocrPdfPages" style="width:100%;max-height:70vh;overflow-y:auto;border-radius:8px;background:var(--gris-100);padding:8px"></div>`;
    // Renderizar PDF con PDF.js después de insertar el HTML
    setTimeout(() => _renderPdfPages(imgUrl, 'ocrPdfPages'), 50);
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
      ${doc.estado === 'completado'
        ? (doc.documento_vinculado_id
            ? `<button class="btn btn-secondary" onclick="closeModal('mOcrPreview');ocrVerVinculado(${doc.id})">📄 Ver documento creado</button>`
            : `<div style="color:var(--verde);font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px">✅ Documento ya validado</div>`)
        : doc.datos_extraidos?.materiales_seleccionados
          ? `<button class="btn btn-primary" onclick="closeModal('mOcrPreview');ocrValidar(${doc.id})" style="background:linear-gradient(135deg,#059669,#10B981);border:none;font-weight:600">✅ Validar materiales</button>
             <button class="btn btn-ghost" onclick="closeModal('mOcrPreview');ocrEliminar(${doc.id})" style="color:var(--rojo)">✕ Rechazar</button>`
          : `<button class="btn btn-primary" onclick="closeModal('mOcrPreview');ocrGestionar(${doc.id})" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);border:none;font-weight:600">🤖 Importar con IA</button>
             <button class="btn btn-ghost" onclick="closeModal('mOcrPreview');ocrEliminar(${doc.id})" style="color:var(--rojo)">✕ Rechazar</button>`}
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
  // Bloquear si ya está completado
  const { data: _chk } = await sb.from('documentos_ocr').select('estado').eq('id', id).single();
  if (_chk?.estado === 'completado') {
    toast('Este documento ya fue validado', 'info');
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

    // Llamada con reintentos automáticos (máx 3 intentos, espera progresiva)
    const _ocrBody = JSON.stringify({ imagen_base64: _iaFileBase64, media_type: _iaFileMime, tipo, empresa_id: EMPRESA.id, empresa_nombre: EMPRESA.nombre || '', empresa_cif: EMPRESA.cif || '' });
    const _ocrHeaders = { 'Content-Type': 'application/json', 'x-anthropic-key': apiKey };
    const _ocrUrl = 'https://gskkqqhbpnycvuioqetj.supabase.co/functions/v1/ocr-documento';

    let result = null;
    const maxIntentos = 3;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      try {
        const resp = await fetch(_ocrUrl, { method: 'POST', headers: _ocrHeaders, body: _ocrBody });
        const json = await resp.json();
        if (json.success) { result = json; break; }
        // Error de API (529 overloaded, 500, etc.) — reintentar
        const esRetryable = resp.status === 529 || resp.status === 500 || resp.status === 503 || (json.error && /overloaded|rate.?limit|timeout|busy/i.test(json.error));
        if (esRetryable && intento < maxIntentos) {
          const espera = intento * 5; // 5s, 10s
          toast(`⏳ Servidor IA ocupado — reintentando en ${espera}s (${intento}/${maxIntentos})...`, 'warning');
          await new Promise(r => setTimeout(r, espera * 1000));
          continue;
        }
        throw new Error(json.error || 'Error procesando documento');
      } catch(fetchErr) {
        if (intento < maxIntentos && /overloaded|fetch|network|timeout/i.test(fetchErr.message)) {
          const espera = intento * 5;
          toast(`⏳ Error de conexión — reintentando en ${espera}s (${intento}/${maxIntentos})...`, 'warning');
          await new Promise(r => setTimeout(r, espera * 1000));
          continue;
        }
        throw fetchErr;
      }
    }
    if (!result) throw new Error('No se pudo procesar el documento después de ' + maxIntentos + ' intentos. Inténtalo de nuevo más tarde.');

    const data = _ocrSanitizeNumeros(result.data);

    // Usar tipo detectado por la IA (data.tipo_documento) o fallback
    let tipoDetectado = data.tipo_documento || tipo || 'factura';
    if (tipoDetectado === 'albaran_prov') tipoDetectado = 'albaran';
    if (tipoDetectado === 'factura_prov') tipoDetectado = 'factura';

    // Convertir líneas IA al formato materiales_seleccionados unificado
    const lineas = data.lineas || [];
    const matSel = lineas.map(l => {
      const artMatch = typeof _iaBuscarArticuloExistente === 'function' ? _iaBuscarArticuloExistente(l) : null;
      return {
        nombre: l.descripcion || l.nombre || '',
        codigo: l.codigo || '',
        cantidad: l.cantidad || 1,
        unidad: l.unidad || 'ud',
        precio: l.precio_unitario || 0,
        dto1_pct: l.dto1_pct || 0,
        dto2_pct: l.dto2_pct || 0,
        dto3_pct: l.dto3_pct || 0,
        iva_pct: l.iva_pct ?? 21,
        articulo_id: artMatch?.id || null,
        en_catalogo: !!artMatch
      };
    });

    // Guardar con formato unificado — estado pendiente para que el admin valide
    const datosUnificados = {
      ...data,
      materiales_seleccionados: matSel,
      origen_ia: true // marcar que viene de importación IA (no de app móvil)
    };

    await sb.from('documentos_ocr').update({
      estado: 'pendiente',
      tipo_documento: tipoDetectado,
      datos_extraidos: datosUnificados,
      updated_at: new Date().toISOString()
    }).eq('id', ocrDocId);

    toast('Documento procesado. Abriendo validación...', 'success');
    loadOCRInbox();
    // Abrir el modal de validación unificado
    ocrValidar(ocrDocId);

  } catch(e) {
    // Mensaje amigable para errores comunes
    let msgUser = e.message;
    if (/overloaded|529/i.test(msgUser)) msgUser = 'Servidor IA ocupado. Inténtalo de nuevo en unos minutos.';
    else if (/rate.?limit|429/i.test(msgUser)) msgUser = 'Límite de uso de IA alcanzado. Espera unos minutos.';
    else if (/timeout|network|fetch/i.test(msgUser)) msgUser = 'Error de conexión. Verifica tu internet e inténtalo de nuevo.';
    else if (/api.?key|unauthorized|401|403/i.test(msgUser)) msgUser = 'API Key inválida o sin permisos. Revisa la configuración de IA.';
    toast('❌ ' + msgUser, 'error');
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

// ═══════════════════════════════════════════════
// VALIDAR — Documentos que vienen de la app móvil
// El operario ya escaneó, creó artículos y metió stock provisional.
// Admin revisa datos + confirma stock + genera albarán/factura.
// Pantalla completa split-screen.
// ═══════════════════════════════════════════════
let _ocrValidarDoc = null;
let _ocrValidarProvMatch = null;
let _ocrValidarProvExiste = false;

// Helper function to toggle all material selection checkboxes
function _ocrToggleSelectAll(checked) {
  const checkboxes = document.querySelectorAll('[data-validar-select]');
  checkboxes.forEach(cb => {
    cb.checked = checked;
  });
}

async function ocrValidar(id) {
  const { data: doc, error } = await sb.from('documentos_ocr').select('*').eq('id', id).single();
  if (error || !doc) { toast('Error al cargar documento', 'error'); return; }
  if (doc.estado === 'completado') { toast('Este documento ya fue validado', 'info'); return; }
  const datos = doc.datos_extraidos || {};
  const materiales = datos.materiales_seleccionados || [];
  if (!materiales.length) { toast('Este documento no tiene materiales registrados', 'warning'); return; }
  _ocrValidarDoc = doc;

  // Imagen — usar signed URLs para buckets privados
  let imgUrl = '';
  if (doc.archivo_path) {
    const { data: signedData } = await sb.storage.from('documentos').createSignedUrl(doc.archivo_path, 3600);
    imgUrl = signedData?.signedUrl || '';
    if (!imgUrl) {
      // Fallback a public URL
      imgUrl = sb.storage.from('documentos').getPublicUrl(doc.archivo_path).data?.publicUrl || '';
    }
  }
  // fotos_urls del móvil pueden ser public URLs — verificar y convertir a signed si es necesario
  let fotosArr = [];
  const rawFotos = datos.fotos_urls || [];
  if (rawFotos.length) {
    // Las URLs guardadas pueden no funcionar si el bucket es privado, generar signed URLs desde archivo_path
    // Extraer los paths de storage desde las URLs o usar archivo_path base
    for (const url of rawFotos) {
      // Intentar extraer el path del storage de la URL pública
      const match = url.match(/\/documentos\/(.+?)(\?|$)/);
      if (match) {
        const { data: sf } = await sb.storage.from('documentos').createSignedUrl(decodeURIComponent(match[1]), 3600);
        fotosArr.push(sf?.signedUrl || url);
      } else {
        fotosArr.push(url); // usar la URL tal cual
      }
    }
  }

  // Stock provisional actual
  const artIds = materiales.filter(m => m.articulo_id).map(m => m.articulo_id);
  let stockMap = {};
  if (artIds.length) {
    const { data: stockRows } = await sb.from('stock')
      .select('articulo_id, almacen_id, cantidad, stock_provisional, almacenes(nombre, tipo)')
      .eq('empresa_id', EMPRESA.id).in('articulo_id', artIds);
    if (stockRows) stockRows.forEach(s => {
      if (!stockMap[s.articulo_id]) stockMap[s.articulo_id] = [];
      stockMap[s.articulo_id].push(s);
    });
  }

  // Nombres actualizados
  let artMap = {};
  if (artIds.length) {
    const { data: arts } = await sb.from('articulos').select('id,nombre,codigo,precio_coste').in('id', artIds);
    if (arts) arts.forEach(a => { artMap[a.id] = a; });
  }

  // Usuarios
  const userMap = {};
  if (typeof todosUsuarios !== 'undefined' && todosUsuarios) todosUsuarios.forEach(u => { userMap[u.id] = u.nombre || u.email || '—'; });
  const operarioNombre = datos.operario || userMap[doc.usuario_id] || '—';
  const furgonetaNombre = datos.furgoneta || '—';

  // Proveedor
  const provRaw = datos.proveedor || null;
  const provNombre = provRaw?.nombre || (typeof provRaw === 'string' ? provRaw : '') || '';
  const provCif = provRaw?.cif || provRaw?.nif || datos.cif || datos.nif || '';
  const numDoc = datos.numero || datos.numero_documento || '';
  const fechaOcr = datos.fecha || new Date(doc.created_at).toISOString().split('T')[0];
  const tipoDoc = doc.tipo_documento || datos.tipo_documento || 'albaran';

  _ocrValidarProvMatch = typeof _iaBuscarProveedorExistente === 'function'
    ? _iaBuscarProveedorExistente(typeof provRaw === 'object' ? provRaw : { nombre: provNombre, cif: provCif })
    : null;
  // Si fue auto-creado por OCR móvil, tratarlo como "nuevo editable"
  const _provAutoOcr = _ocrValidarProvMatch && /creado autom/i.test(_ocrValidarProvMatch.observaciones || '');
  const provExiste = !!_ocrValidarProvMatch && !_provAutoOcr;
  _ocrValidarProvExiste = provExiste;

  // HTML proveedor — datos del match o del OCR/IA
  const _pm = _ocrValidarProvMatch || {}; // proveedor match (BD)
  const _pr = (typeof provRaw === 'object' ? provRaw : {}) || {}; // proveedor raw (OCR/IA)
  const _pv = (f) => (_pm[f] || _pr[f] || '').toString().replace(/"/g, '&quot;'); // campo con fallback
  const _pvNombre = _pm.nombre || provNombre;

  const provHtml = provExiste
    ? `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:10px">
        <div style="font-weight:700;font-size:12px;color:#065F46">🏭 Proveedor ✓ ${_ocrValidarProvMatch.nombre}</div>
        <div style="font-size:11px;color:var(--gris-500)">${_ocrValidarProvMatch.cif ? 'CIF: ' + _ocrValidarProvMatch.cif : ''}${_ocrValidarProvMatch.telefono ? ' · Tel: ' + _ocrValidarProvMatch.telefono : ''}</div>
      </div>`
    : `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:10px">
        <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#92400E">
          🏭 Proveedor ${_provAutoOcr ? '⚠️ Auto-creado por OCR — revisa los datos' : '— NO encontrado (se creará)'}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div><label style="font-size:10px;font-weight:600">Nombre</label>
            <input type="text" id="ocrValProvNombre" value="${_pvNombre.replace(/"/g, '&quot;')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600"></div>
          <div><label style="font-size:10px;font-weight:600">CIF/NIF</label>
            <input type="text" id="ocrValProvCif" value="${_pv('cif') || _pv('nif')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">Dirección</label>
            <input type="text" id="ocrValProvDir" value="${_pv('direccion')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">Municipio</label>
            <input type="text" id="ocrValProvMun" value="${_pv('municipio')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">CP</label>
            <input type="text" id="ocrValProvCp" value="${_pv('cp')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">Provincia</label>
            <input type="text" id="ocrValProvProvincia" value="${_pv('provincia')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">Teléfono</label>
            <input type="text" id="ocrValProvTel" value="${_pv('telefono')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">Email</label>
            <input type="text" id="ocrValProvEmail" value="${_pv('email')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">Web</label>
            <input type="text" id="ocrValProvWeb" value="${_pv('web')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
          <div><label style="font-size:10px;font-weight:600">IBAN</label>
            <input type="text" id="ocrValProvIban" value="${_pv('iban')}" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>
        </div>
      </div>`;

  // Detectar si hay campos de descuento/IVA (importación IA) vs simple (app móvil)
  const esImportIA = !!datos.origen_ia;
  const tieneDtos = materiales.some(m => (m.dto1_pct || 0) > 0 || (m.dto2_pct || 0) > 0 || (m.dto3_pct || 0) > 0);
  const tieneIvaVariado = materiales.some(m => m.iva_pct !== undefined && m.iva_pct !== 21);
  const mostrarDtoIva = esImportIA || tieneDtos || tieneIvaVariado;

  // Filas materiales
  const filasHtml = materiales.map((m, idx) => {
    const art = m.articulo_id ? artMap[m.articulo_id] : null;
    const stocks = m.articulo_id ? (stockMap[m.articulo_id] || []) : [];
    // Buscar registro con stock provisional (puede ser furgoneta u otro almacén)
    const furgStock = stocks.find(s => s.almacenes?.tipo === 'furgoneta') || stocks.find(s => (s.stock_provisional || 0) > 0) || stocks[0];
    const provActual = stocks.reduce((sum, s) => sum + (s.stock_provisional || 0), 0);
    const realActual = stocks.reduce((sum, s) => sum + (s.cantidad || 0), 0);
    const nombreDisplay = art ? art.nombre : (m.nombre || '?');
    const codigoDisplay = art ? (art.codigo || '') : (m.codigo || '');
    const precioCoste = m.precio || art?.precio_coste || 0;
    // en_catalogo viene del móvil: true si el artículo ya existía antes del escaneo
    const enCatalogo = !!m.en_catalogo;

    return `<tr data-idx="${idx}" style="border-bottom:1px solid var(--gris-100)" data-validar-row="${idx}">
      <td style="text-align:center;padding:6px">
        <input type="checkbox" data-validar-select="${idx}" checked style="width:18px;height:18px;cursor:pointer;accent-color:#10B981">
      </td>
      <td style="padding:6px 8px">
        <input type="text" value="${nombreDisplay.replace(/"/g, '&quot;')}" data-validar-nombre="${idx}"
          style="width:100%;border:1px solid ${enCatalogo ? 'var(--gris-200)' : '#FDE68A'};border-radius:5px;padding:4px 6px;font-size:12px;font-weight:600;background:${enCatalogo ? '#fff' : '#FFFBEB'}">
        <div style="display:flex;gap:4px;align-items:center;margin-top:2px">
          <input type="text" value="${codigoDisplay.replace(/"/g, '&quot;')}" data-validar-codigo="${idx}" placeholder="Código"
            style="width:100px;border:1px solid var(--gris-200);border-radius:4px;padding:2px 5px;font-size:10px;color:var(--gris-500)">
          ${!enCatalogo ? '<span style="font-size:9px;background:#FEF3C7;color:#92400E;padding:1px 5px;border-radius:8px;font-weight:600">PROVISIONAL</span>' : '<span style="font-size:9px;background:#D1FAE5;color:#065F46;padding:1px 5px;border-radius:8px;font-weight:600">CATÁLOGO</span>'}
        </div>
      </td>
      <td style="text-align:center;padding:6px;font-weight:700;font-size:14px">${m.cantidad}</td>
      <td style="text-align:center;padding:6px">
        <select data-validar-unidad="${idx}" style="width:55px;text-align:center;border:1px solid var(--gris-200);border-radius:5px;padding:3px;font-size:11px;color:var(--gris-600);background:#fff;cursor:pointer">
          ${(typeof unidades !== 'undefined' ? unidades : []).map(u => {
            const abr = u.abreviatura || u.nombre || '';
            const sel = abr.toLowerCase() === (m.unidad || 'ud').toLowerCase() ? 'selected' : '';
            return '<option value="' + abr.replace(/"/g, '&quot;') + '" ' + sel + '>' + abr + '</option>';
          }).join('')}
          ${(typeof unidades !== 'undefined' && !unidades.some(u => (u.abreviatura||u.nombre||'').toLowerCase() === (m.unidad||'ud').toLowerCase()))
            ? '<option value="' + (m.unidad||'ud').replace(/"/g,'&quot;') + '" selected>' + (m.unidad||'ud') + '</option>' : ''}
        </select>
      </td>
      <td style="text-align:center;padding:6px">
        <input type="number" value="${precioCoste}" min="0" step="0.01" data-validar-precio="${idx}"
          style="width:70px;text-align:center;border:1px solid var(--gris-200);border-radius:5px;padding:3px;font-size:12px">
      </td>
      ${mostrarDtoIva ? `
      <td style="text-align:center;padding:4px">
        <input type="number" value="${m.dto1_pct || 0}" min="0" max="100" step="0.5" data-validar-dto1="${idx}"
          style="width:42px;text-align:center;border:1px solid var(--gris-200);border-radius:4px;padding:2px;font-size:11px">
      </td>
      <td style="text-align:center;padding:4px">
        <input type="number" value="${m.dto2_pct || 0}" min="0" max="100" step="0.5" data-validar-dto2="${idx}"
          style="width:42px;text-align:center;border:1px solid var(--gris-200);border-radius:4px;padding:2px;font-size:11px">
      </td>
      <td style="text-align:center;padding:4px">
        <input type="number" value="${m.iva_pct ?? 21}" min="0" max="100" step="1" data-validar-iva="${idx}"
          style="width:42px;text-align:center;border:1px solid var(--gris-200);border-radius:4px;padding:2px;font-size:11px">
      </td>` : ''}
      <td style="text-align:center;padding:6px">
        <span style="color:var(--naranja);font-weight:700">${provActual}</span>
        <span style="font-size:9px;color:var(--gris-400)">prov</span>
      </td>
      <td style="text-align:center;padding:6px">
        <span style="font-weight:700">${realActual}</span>
        <span style="font-size:9px;color:var(--gris-400)">real</span>
      </td>
      <td style="text-align:center;padding:6px">
        <input type="number" value="${m.cantidad}" min="0" step="1" data-validar-qty="${idx}"
          style="width:60px;text-align:center;border:2px solid #10B981;border-radius:8px;padding:5px;font-size:13px;font-weight:700">
      </td>
    </tr>`;
  }).join('');

  // Imágenes / PDF
  let imgHtml = '';
  const _extVal = (doc.archivo_nombre || '').split('.').pop().toLowerCase();
  const _esPdfVal = _extVal === 'pdf';
  if (_esPdfVal && imgUrl) {
    imgHtml = `<div id="ocrValPdfPages" style="width:100%"></div>`;
  } else if (fotosArr.length) {
    imgHtml = fotosArr.map(url =>
      `<img src="${url}" style="max-width:100%;object-fit:contain;border-radius:8px;border:1px solid var(--gris-200);margin-bottom:8px;cursor:pointer" onclick="window.open('${url}','_blank')" title="Click para ampliar">`
    ).join('');
  } else if (imgUrl) {
    imgHtml = `<img src="${imgUrl}" style="max-width:100%;object-fit:contain;border-radius:8px;border:1px solid var(--gris-200);cursor:pointer" onclick="window.open('${imgUrl}','_blank')" title="Click para ampliar">`;
  }

  const container = document.getElementById('ocrValidarContent');
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;height:100%;overflow:hidden">
      <!-- COL IZQUIERDA: foto -->
      <div style="overflow-y:auto;padding:16px;background:#f8f9fa;border-right:1px solid var(--gris-200)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:700;font-size:14px">📄 Documento escaneado</div>
          ${imgUrl ? '<button class="btn btn-ghost btn-sm" onclick="window.open(\'' + imgUrl + '\',\'_blank\')" style="font-size:11px">🔗 Abrir en pestaña</button>' : ''}
        </div>
        <div style="text-align:center">
          ${imgHtml || '<div style="padding:60px;color:var(--gris-400)">Sin imagen</div>'}
        </div>
      </div>

      <!-- COL DERECHA: datos + materiales -->
      <div style="overflow-y:auto;padding:16px;display:flex;flex-direction:column">
        <!-- Tipo + datos documento -->
        <div style="margin-bottom:12px">
          <div style="font-weight:700;font-size:14px;color:var(--azul);margin-bottom:8px;display:flex;align-items:center;gap:8px">
            📋 Tipo de documento:
            <select id="ocrValTipoDoc" style="padding:4px 10px;border:1.5px solid var(--azul);border-radius:8px;font-size:13px;font-weight:700;color:var(--azul);background:#eef2ff;cursor:pointer">
              <option value="albaran" ${tipoDoc === 'albaran' ? 'selected' : ''}>📥 Albarán de proveedor</option>
              <option value="factura" ${tipoDoc === 'factura' ? 'selected' : ''}>🧾 Factura de proveedor</option>
              <option value="presupuesto" ${tipoDoc === 'presupuesto' ? 'selected' : ''}>📝 Presupuesto de proveedor</option>
              <option value="pedido" ${tipoDoc === 'pedido' ? 'selected' : ''}>📦 Pedido a proveedor</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div>
              <label style="font-size:10px;font-weight:600;color:var(--gris-500)">Nº documento</label>
              <input type="text" id="ocrValNumero" value="${numDoc.replace(/"/g, '&quot;')}" class="input" style="margin-top:2px;font-size:13px;font-weight:600">
            </div>
            <div>
              <label style="font-size:10px;font-weight:600;color:var(--gris-500)">Fecha</label>
              <input type="date" id="ocrValFecha" value="${fechaOcr}" class="input" style="margin-top:2px;font-size:13px">
            </div>
            ${operarioNombre !== '—' ? `<div>
              <label style="font-size:10px;font-weight:600;color:var(--gris-500)">Operario / Furgoneta</label>
              <div class="input" style="margin-top:2px;font-size:12px;background:var(--gris-50);padding:6px 8px;color:var(--gris-600)">👷 ${operarioNombre} · 🚐 ${furgonetaNombre}</div>
            </div>` : `<div>
              <label style="font-size:10px;font-weight:600;color:var(--gris-500)">Origen</label>
              <div class="input" style="margin-top:2px;font-size:12px;background:var(--gris-50);padding:6px 8px;color:var(--gris-600)">🤖 Importación IA</div>
            </div>`}
          </div>
          <div style="margin-top:6px">
            <label style="font-size:10px;font-weight:600;color:var(--gris-500)">Observaciones</label>
            <input type="text" id="ocrValNotas" value="" class="input" style="margin-top:2px;font-size:12px" placeholder="Notas adicionales...">
          </div>
        </div>

        <!-- Proveedor -->
        <div style="margin-bottom:12px">${provHtml}</div>

        <!-- Materiales -->
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">📦 Materiales — ${materiales.length} artículo(s)</div>
        <div style="font-size:10px;color:var(--gris-500);margin-bottom:6px">
          Edita nombre, código, precio y cantidad. Al validar se confirma el stock y se genera el documento de compra.
        </div>
        <div style="flex:1;overflow-y:auto;border:1px solid var(--gris-200);border-radius:10px;min-height:120px">
          <table style="width:100%;border-collapse:collapse">
            <thead style="position:sticky;top:0;z-index:2">
              <tr style="background:var(--gris-50);font-size:9px;font-weight:700;color:var(--gris-500);text-transform:uppercase">
                <th style="padding:6px;text-align:center;width:35px">
                  <input type="checkbox" id="ocrValSelectAll" onchange="_ocrToggleSelectAll(this.checked)" style="width:18px;height:18px;cursor:pointer;accent-color:#10B981">
                </th>
                <th style="padding:6px 8px;text-align:left">Material / Código</th>
                <th style="padding:6px;text-align:center;width:55px">Leído</th>
                <th style="padding:6px;text-align:center;width:40px">Ud</th>
                <th style="padding:6px;text-align:center;width:75px">Precio</th>
                ${mostrarDtoIva ? '<th style="padding:6px;text-align:center;width:45px">Dto1%</th><th style="padding:6px;text-align:center;width:45px">Dto2%</th><th style="padding:6px;text-align:center;width:45px">IVA%</th>' : ''}
                <th style="padding:6px;text-align:center;width:60px">Prov.</th>
                <th style="padding:6px;text-align:center;width:55px">Real</th>
                <th style="padding:6px;text-align:center;width:65px">Validar</th>
              </tr>
            </thead>
            <tbody>${filasHtml}</tbody>
          </table>
        </div>

        <!-- Botones -->
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;flex-shrink:0;padding-bottom:4px">
          <button class="btn btn-ghost" onclick="closeModal('mOcrValidar')" style="font-size:12px">Cancelar</button>
          <button class="btn" onclick="closeModal('mOcrValidar');ocrEliminar(${doc.id})" style="font-size:12px;color:var(--rojo);background:transparent;border:1px solid var(--rojo)">✕ Rechazar</button>
          <button class="btn btn-primary" id="ocrBtnValidar" onclick="_ocrConfirmarValidacion()" style="font-size:14px;background:linear-gradient(135deg,#059669,#10B981);border:none;font-weight:700;padding:10px 28px">
            ✅ Validar, confirmar stock y generar documento
          </button>
        </div>
      </div>
    </div>
  `;
  openModal('mOcrValidar');

  // Si es PDF, renderizar páginas como imágenes (sin controles del navegador)
  if (_esPdfVal && imgUrl) {
    setTimeout(() => _renderPdfPages(imgUrl, 'ocrValPdfPages'), 100);
  }
}

// ─── Confirmar: stock provisional→real + actualizar artículos + generar documento ───
async function _ocrConfirmarValidacion() {
  if (!_ocrValidarDoc) return;
  const btn = document.getElementById('ocrBtnValidar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Validando...'; }

  const doc = _ocrValidarDoc;
  const datos = doc.datos_extraidos || {};
  const materiales = datos.materiales_seleccionados || [];

  const tipoDoc = document.getElementById('ocrValTipoDoc')?.value || 'albaran';
  const numDocEdit = document.getElementById('ocrValNumero')?.value?.trim() || '';
  const fechaEdit = document.getElementById('ocrValFecha')?.value || new Date().toISOString().split('T')[0];
  const notasEdit = document.getElementById('ocrValNotas')?.value?.trim() || '';

  const ediciones = materiales.map((m, idx) => ({
    nombre: (document.querySelector(`[data-validar-nombre="${idx}"]`)?.value || m.nombre).trim(),
    codigo: (document.querySelector(`[data-validar-codigo="${idx}"]`)?.value || m.codigo || '').trim(),
    cantidad: parseFloat(document.querySelector(`[data-validar-qty="${idx}"]`)?.value) || 0,
    precio: parseFloat(document.querySelector(`[data-validar-precio="${idx}"]`)?.value) || 0,
    unidad: (document.querySelector(`[data-validar-unidad="${idx}"]`)?.value || m.unidad || 'ud').trim(),
    dto1_pct: parseFloat(document.querySelector(`[data-validar-dto1="${idx}"]`)?.value) || 0,
    dto2_pct: parseFloat(document.querySelector(`[data-validar-dto2="${idx}"]`)?.value) || 0,
    iva_pct: parseFloat(document.querySelector(`[data-validar-iva="${idx}"]`)?.value ?? 21),
    seleccionado: document.querySelector(`[data-validar-select="${idx}"]`)?.checked || false
  }));

  const tipoLabels = {factura:'factura',albaran:'albarán',pedido:'pedido',presupuesto:'presupuesto'};
  const tipoLabel = tipoLabels[tipoDoc] || 'albarán';
  const seleccionados = ediciones.filter(e => e.seleccionado).length;
  if (!confirm(`¿Confirmar la validación?\n\n• Se procesarán ${seleccionados} de ${materiales.length} artículo(s)\n• Se generará ${tipoLabel} de proveedor nº ${numDocEdit || '(auto)'}\n• Se crearán artículos/proveedor nuevos si no existen`)) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Validar, confirmar stock y generar documento'; }
    return;
  }

  try {
    toast('Validando materiales...', 'info');
    let okCount = 0, errCount = 0;

    // Paso 0: proveedor — leer todos los campos del formulario
    let proveedorId = _ocrValidarProvMatch?.id || null;
    const pNombre = document.getElementById('ocrValProvNombre')?.value?.trim() || '';
    const pCif = document.getElementById('ocrValProvCif')?.value?.trim() || '';
    const pProvData = {
      nombre: pNombre, cif: pCif || null,
      direccion: document.getElementById('ocrValProvDir')?.value?.trim() || null,
      municipio: document.getElementById('ocrValProvMun')?.value?.trim() || null,
      cp: document.getElementById('ocrValProvCp')?.value?.trim() || null,
      provincia: document.getElementById('ocrValProvProvincia')?.value?.trim() || null,
      telefono: document.getElementById('ocrValProvTel')?.value?.trim() || null,
      email: document.getElementById('ocrValProvEmail')?.value?.trim() || null,
      web: document.getElementById('ocrValProvWeb')?.value?.trim() || null,
      iban: document.getElementById('ocrValProvIban')?.value?.trim() || null
    };
    if (proveedorId && pNombre && !_ocrValidarProvExiste) {
      // Proveedor auto-creado por OCR: actualizar con todos los datos editados por admin
      const updateProv = { ...pProvData, observaciones: 'Validado por admin desde OCR' };
      // Limpiar nulls para no sobreescribir datos existentes con null
      Object.keys(updateProv).forEach(k => { if (updateProv[k] === null || updateProv[k] === '') delete updateProv[k]; });
      await sb.from('proveedores').update(updateProv).eq('id', proveedorId);
      toast('✏️ Proveedor actualizado: ' + pNombre, 'success');
    } else if (!proveedorId) {
      if (pNombre) {
        if (typeof iaCrearProveedor === 'function') {
          proveedorId = await iaCrearProveedor({ ...pProvData,
            observaciones: 'Creado desde validación OCR — doc ' + (numDocEdit || doc.id) });
        } else {
          const { data: nuevoP, error: provErr } = await sb.from('proveedores').insert({
            empresa_id: EMPRESA.id, ...pProvData, activo: true,
            observaciones: 'Creado desde validación OCR'
          }).select().single();
          if (!provErr && nuevoP) {
            proveedorId = nuevoP.id;
            if (typeof proveedores !== 'undefined' && Array.isArray(proveedores)) proveedores.push(nuevoP);
            toast('✅ Proveedor creado: ' + nuevoP.nombre, 'success');
          }
        }
      }
    }

    // Paso 1: procesar materiales (stock + artículos)
    for (let i = 0; i < materiales.length; i++) {
      const m = materiales[i];
      const ed = ediciones[i];
      // Skip unchecked materials
      const isChecked = document.querySelector(`[data-validar-select="${i}"]`)?.checked || false;
      if (!isChecked) continue;
      if (ed.cantidad <= 0) continue;
      try {
        let articuloId = m.articulo_id;

        // Si no tiene articulo_id (viene de IA sin crear), crear o buscar el artículo
        if (!articuloId) {
          // Buscar primero en caché local
          const artExiste = typeof _iaBuscarArticuloExistente === 'function'
            ? _iaBuscarArticuloExistente({ codigo: ed.codigo, descripcion: ed.nombre })
            : null;
          if (artExiste) {
            articuloId = artExiste.id;
          }
          // Si no encontró localmente, buscar en BD (protección anti-duplicados)
          if (!articuloId && ed.codigo) {
            const _codBusca = (ed.codigo || '').trim();
            const { data: dbByRef } = await sb.from('articulos').select('id,nombre,codigo,referencia_fabricante')
              .eq('empresa_id', EMPRESA.id).eq('activo', true).ilike('referencia_fabricante', _codBusca).limit(1);
            if (dbByRef?.length) { articuloId = dbByRef[0].id; toast('🔗 BD: ' + dbByRef[0].nombre, 'info'); }
            if (!articuloId) {
              const { data: dbByAP } = await sb.from('articulos_proveedores').select('articulo_id,articulos(id,nombre)')
                .eq('empresa_id', EMPRESA.id).ilike('ref_proveedor', _codBusca).limit(1);
              if (dbByAP?.length && dbByAP[0].articulos) { articuloId = dbByAP[0].articulos.id; toast('🔗 BD prov: ' + dbByAP[0].articulos.nombre, 'info'); }
            }
          }
          if (!articuloId) {
            // Crear artículo nuevo — es_activo:false (se marca manualmente), activo:true para que aparezca
            const _sufijo = Math.random().toString(36).substr(2, 4).toUpperCase();
            const codigoAuto = 'OCR-' + ((ed.codigo||'').replace(/[^a-zA-Z0-9-]/g,'').toUpperCase() || Date.now().toString(36).toUpperCase()) + '-' + _sufijo;
            // Calcular precio neto (con descuentos) como precio_coste, y el bruto como precio_venta
            const _pvpBruto = ed.precio || 0;
            const _d1 = (ed.dto1_pct || 0) / 100, _d2 = (ed.dto2_pct || 0) / 100;
            const _precioNeto = _pvpBruto * (1 - _d1) * (1 - _d2);
            const { data: nuevoArt, error: artErr } = await sb.from('articulos').insert({
              empresa_id: EMPRESA.id, codigo: codigoAuto, nombre: ed.nombre || 'Material OCR',
              referencia_fabricante: ed.codigo || null,
              precio_coste: Math.round(_precioNeto * 100) / 100,
              precio_venta: Math.round(_pvpBruto * 100) / 100,
              es_activo: false, activo: true,
              proveedor_id: proveedorId || null,
              observaciones: 'Creado desde validación OCR — doc ' + (numDocEdit || doc.id)
            }).select().single();
            if (!artErr && nuevoArt) {
              articuloId = nuevoArt.id;
              toast('✅ Artículo creado: ' + nuevoArt.nombre, 'info');
            } else {
              toast('❌ Error creando artículo: ' + (artErr?.message || ''), 'error');
              errCount++; continue;
            }
          }
          m.articulo_id = articuloId; // actualizar para las líneas del documento
        } else {
          // Artículo ya existe — actualizar campos si es nuevo (no catálogo)
          const updateFields = {};
          if (ed.nombre && ed.nombre !== (m.nombre || '')) updateFields.nombre = ed.nombre;
          if (ed.codigo) updateFields.referencia_fabricante = ed.codigo;
          if (ed.precio > 0) updateFields.precio_coste = ed.precio;
          if (proveedorId && !m.en_catalogo) updateFields.proveedor_id = proveedorId;
          // es_activo NO se toca automáticamente — solo se marca manualmente
          if (Object.keys(updateFields).length) await sb.from('articulos').update(updateFields).eq('id', articuloId);
        }

        // Vincular proveedor
        if (proveedorId && articuloId) {
          const { data: existeVinc } = await sb.from('articulos_proveedores')
            .select('id').eq('articulo_id', articuloId).eq('proveedor_id', proveedorId).eq('empresa_id', EMPRESA.id).limit(1);
          if (!existeVinc?.length) {
            await sb.from('articulos_proveedores').insert({
              empresa_id: EMPRESA.id, articulo_id: articuloId, proveedor_id: proveedorId,
              ref_proveedor: ed.codigo || m.codigo || null, precio_proveedor: ed.precio || 0, es_principal: !m.en_catalogo
            });
          }
        }

        // Stock PROVISIONAL — solo si NO viene de la app del operario
        // (la app ya crea stock provisional en la furgoneta via _fabOcrConfirmar)
        const _desdeApp = !!(datos.operario || datos.furgoneta);
        if (articuloId && ed.cantidad > 0 && !_desdeApp) {
          try {
            // Determinar almacén principal
            let _almProvId = null;
            const _princ = (almacenes||[]).find(a => a.tipo === 'principal');
            _almProvId = _princ?.id || (almacenes||[])[0]?.id || null;
            if (_almProvId) {
              const { data: stEx } = await sb.from('stock').select('*')
                .eq('almacen_id', _almProvId).eq('articulo_id', articuloId).eq('empresa_id', EMPRESA.id).limit(1);
              if (stEx?.length) {
                await sb.from('stock').update({
                  stock_provisional: (stEx[0].stock_provisional || 0) + ed.cantidad
                }).eq('id', stEx[0].id);
              } else {
                await sb.from('stock').insert({
                  empresa_id: EMPRESA.id, almacen_id: _almProvId, articulo_id: articuloId,
                  cantidad: 0, stock_provisional: ed.cantidad, stock_reservado: 0
                });
              }
              await sb.from('movimientos_stock').insert({
                empresa_id: EMPRESA.id, articulo_id: articuloId, almacen_id: _almProvId,
                tipo: 'entrada_provisional', cantidad: ed.cantidad, delta: ed.cantidad,
                notas: 'OCR provisional: ' + (ed.nombre||'').substring(0,40) + ' — doc ' + (numDocEdit || doc.id),
                tipo_stock: 'provisional', fecha: new Date().toISOString().slice(0, 10),
                usuario_id: CP?.id || null, usuario_nombre: CP?.nombre || CU?.email || 'admin'
              });
            }
          } catch(stockErr) {
            console.error('[OCR provisional stock]', articuloId, stockErr);
          }
        }
        okCount++;
      } catch(e) {
        errCount++;
        console.error('[Validar OCR] Error material', i, ed.nombre, e);
        toast('❌ ' + (ed.nombre||'').substring(0,25) + ': ' + e.message, 'error');
      }
    }

    // Paso 1b: limpiar materiales DESELECCIONADOS (la app móvil ya los creó)
    const _desdeApp = !!(datos.operario || datos.furgoneta);
    if (_desdeApp) {
      for (let i = 0; i < materiales.length; i++) {
        const isChecked = document.querySelector(`[data-validar-select="${i}"]`)?.checked || false;
        if (isChecked) continue; // solo limpiar los NO seleccionados
        const m = materiales[i];
        const artId = m.articulo_id;
        if (!artId) continue;
        try {
          // Borrar stock provisional de la furgoneta
          const furgId = datos.furgoneta_id || null;
          if (furgId) {
            await sb.from('stock').delete()
              .eq('empresa_id', EMPRESA.id).eq('articulo_id', artId).eq('almacen_id', furgId);
            await sb.from('movimientos_stock').delete()
              .eq('empresa_id', EMPRESA.id).eq('articulo_id', artId).eq('almacen_id', furgId);
          }
          // Si el artículo es auto-creado por OCR (código empieza por OCR-), borrar
          const { data: artCheck } = await sb.from('articulos').select('id,codigo')
            .eq('id', artId).limit(1);
          if (artCheck?.[0]?.codigo?.startsWith('OCR-')) {
            // Borrar stock en TODOS los almacenes (por si se creó en más sitios)
            await sb.from('stock').delete().eq('empresa_id', EMPRESA.id).eq('articulo_id', artId);
            await sb.from('movimientos_stock').delete().eq('empresa_id', EMPRESA.id).eq('articulo_id', artId);
            await sb.from('articulos_proveedores').delete().eq('empresa_id', EMPRESA.id).eq('articulo_id', artId);
            await sb.from('articulos').delete().eq('id', artId);
            toast('🗑️ Eliminado: ' + (m.nombre || '').substring(0,30), 'info');
          }
        } catch(cleanErr) {
          console.warn('[OCR cleanup]', m.nombre, cleanErr);
        }
      }
    }

    // Paso 2: marcar doc OCR completado
    await sb.from('documentos_ocr').update({
      estado: 'completado',
      notas: 'Validado por ' + (CP?.nombre || 'admin') + ' — ' + okCount + ' OK' + (errCount ? ', ' + errCount + ' err' : ''),
      updated_at: new Date().toISOString()
    }).eq('id', doc.id);

    await sb.from('tareas_pendientes').update({
      estado: 'completada', fecha_completada: new Date().toISOString()
    }).eq('entidad_tipo', 'documento_ocr').eq('entidad_id', doc.id).eq('empresa_id', EMPRESA.id);

    // Paso 3: generar documento de compra (solo items seleccionados)
    const lineasDoc = ediciones.filter(ed => ed.seleccionado).map((ed, i) => {
      const origIdx = ediciones.findIndex(e => e === ed);
      return {
        _artId: materiales[origIdx].articulo_id, _artCodigo: ed.codigo,
        descripcion: ed.nombre, codigo: ed.codigo, cantidad: ed.cantidad,
        unidad: ed.unidad || 'ud',
        precio_unitario: ed.precio,
        dto1_pct: ed.dto1_pct || 0, dto2_pct: ed.dto2_pct || 0, dto3_pct: 0,
        iva_pct: ed.iva_pct ?? 21
      };
    });
    const docData = {
      numero_documento: numDocEdit, fecha: fechaEdit, fecha_vencimiento: '',
      notas: notasEdit || ('Validado desde OCR' + (datos.operario ? ' — operario: ' + datos.operario : '')),
      lineas: lineasDoc
    };

    closeModal('mOcrValidar');
    toast('✅ Validado: ' + okCount + ' materiales. Generando documento...', 'success');

    if (tipoDoc === 'factura' && typeof iaRellenarFactura === 'function') {
      await iaRellenarFactura(docData, proveedorId);
    } else if (tipoDoc === 'pedido' && typeof iaRellenarPedido === 'function') {
      await iaRellenarPedido(docData, proveedorId);
    } else if (tipoDoc === 'presupuesto' && typeof iaRellenarPresupuestoCompra === 'function') {
      await iaRellenarPresupuestoCompra(docData, proveedorId);
    } else if (typeof iaRellenarAlbaran === 'function') {
      await iaRellenarAlbaran(docData, proveedorId);
    } else {
      toast('⚠️ No se pudo abrir el formulario de ' + tipoDoc + '. Créalo manualmente.', 'warning');
    }

    _ocrValidarDoc = null;
    _ocrValidarProvMatch = null;
    loadOCRInbox();

  } catch(e) {
    console.error('[Validar OCR] Error general:', e);
    toast('Error en validación: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Validar, confirmar stock y generar documento'; }
  }
}

// ═══════════════════════════════════════════════
// Subir archivos manualmente desde Bandeja OCR (desktop)
// ═══════════════════════════════════════════════
async function ocrSubirArchivos(files) {
  if (!files || !files.length) return;
  const eid = EMPRESA?.id;
  if (!eid) { toast('Error: empresa no cargada', 'error'); return; }

  // Solo procesamos el primer archivo (la IA trabaja de uno en uno)
  const file = files[0];
  try {
    toast('📤 Subiendo ' + file.name + '...', 'info');
    const ext = file.name.split('.').pop().toLowerCase();
    const ts = Date.now();
    const storagePath = `${eid}/ocr/manual_${ts}_${Math.random().toString(36).substr(2,6)}.${ext}`;

    const { error: upErr } = await sb.storage.from('documentos').upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream'
    });
    if (upErr) { toast('❌ Error subiendo ' + file.name + ': ' + upErr.message, 'error'); return; }

    const { data: docData, error: insErr } = await sb.from('documentos_ocr').insert({
      empresa_id: eid,
      usuario_id: CP?.id || CU?.id || null,
      archivo_path: storagePath,
      archivo_nombre: file.name,
      estado: 'pendiente',
      tipo_documento: 'albaran',
      datos_extraidos: null,
      created_at: new Date().toISOString()
    }).select().single();
    if (insErr || !docData) { toast('❌ Error registrando ' + file.name + ': ' + (insErr?.message || ''), 'error'); return; }

    // Limpiar input
    const inp = document.getElementById('ocrFileUpload');
    if (inp) inp.value = '';

    // Lanzar procesado IA directamente
    toast('🤖 Procesando con IA...', 'info');
    loadOCRInbox();
    ocrGestionar(docData.id);

  } catch(e) {
    toast('❌ ' + file.name + ': ' + e.message, 'error');
  }
}

// ─── Hook: update badge on app init ───
if (typeof window._initHooks === 'undefined') window._initHooks = [];
window._initHooks.push(updateOCRBadge);

// El badge se actualiza automáticamente mediante el polling de 15s (_ocrStartPoll)
// No hace falta un setInterval adicional aquí
