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
        ${doc.documento_vinculado_id
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
      ${doc.documento_vinculado_id
        ? `<button class="btn btn-secondary" onclick="closeModal('mOcrPreview');ocrVerVinculado(${doc.id})">📄 Ver documento creado</button>`
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

// ═══════════════════════════════════════════════
// VALIDAR — Documentos que vienen de la app móvil
// El operario ya escaneó, creó artículos y metió stock provisional.
// Admin revisa datos + confirma stock + genera albarán/factura.
// Pantalla completa split-screen.
// ═══════════════════════════════════════════════
let _ocrValidarDoc = null;
let _ocrValidarProvMatch = null;

async function ocrValidar(id) {
  const { data: doc, error } = await sb.from('documentos_ocr').select('*').eq('id', id).single();
  if (error || !doc) { toast('Error al cargar documento', 'error'); return; }
  const datos = doc.datos_extraidos || {};
  const materiales = datos.materiales_seleccionados || [];
  if (!materiales.length) { toast('Este documento no tiene materiales registrados', 'warning'); return; }
  _ocrValidarDoc = doc;

  // Imagen
  let imgUrl = doc.archivo_path ? sb.storage.from('documentos').getPublicUrl(doc.archivo_path).data.publicUrl : '';
  const fotosArr = datos.fotos_urls || [];

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
  const provExiste = !!_ocrValidarProvMatch;

  // HTML proveedor
  const provHtml = `
    <div style="background:${provExiste ? '#F0FDF4' : '#FEF3C7'};border:1px solid ${provExiste ? '#BBF7D0' : '#FDE68A'};border-radius:10px;padding:10px">
      <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:${provExiste ? '#065F46' : '#92400E'}">
        🏭 Proveedor ${provExiste ? '✓ ' + _ocrValidarProvMatch.nombre : '— NO encontrado'}
      </div>
      ${provExiste
        ? '<div style="font-size:11px;color:var(--gris-500)">' + (_ocrValidarProvMatch.cif ? 'CIF: ' + _ocrValidarProvMatch.cif : '') + '</div>'
        : '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
            '<div><label style="font-size:10px;font-weight:600">Nombre</label>' +
              '<input type="text" id="ocrValProvNombre" value="' + provNombre.replace(/"/g, '&quot;') + '" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600"></div>' +
            '<div><label style="font-size:10px;font-weight:600">CIF/NIF</label>' +
              '<input type="text" id="ocrValProvCif" value="' + provCif.replace(/"/g, '&quot;') + '" style="width:100%;border:1px solid #FDE68A;border-radius:6px;padding:4px 8px;font-size:12px"></div>' +
          '</div>'}
    </div>`;

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
    const enCatalogo = m.en_catalogo || !!art;

    return `<tr data-idx="${idx}" style="border-bottom:1px solid var(--gris-100)">
      <td style="padding:6px 8px">
        <input type="text" value="${nombreDisplay.replace(/"/g, '&quot;')}" data-validar-nombre="${idx}"
          style="width:100%;border:1px solid ${enCatalogo ? 'var(--gris-200)' : '#FDE68A'};border-radius:5px;padding:4px 6px;font-size:12px;font-weight:600;background:${enCatalogo ? '#fff' : '#FFFBEB'}">
        <div style="display:flex;gap:4px;align-items:center;margin-top:2px">
          <input type="text" value="${codigoDisplay.replace(/"/g, '&quot;')}" data-validar-codigo="${idx}" placeholder="Código"
            style="width:100px;border:1px solid var(--gris-200);border-radius:4px;padding:2px 5px;font-size:10px;color:var(--gris-500)">
          ${!enCatalogo ? '<span style="font-size:9px;background:#FEF3C7;color:#92400E;padding:1px 5px;border-radius:8px;font-weight:600">NUEVO</span>' : '<span style="font-size:9px;background:#D1FAE5;color:#065F46;padding:1px 5px;border-radius:8px;font-weight:600">CATÁLOGO</span>'}
        </div>
      </td>
      <td style="text-align:center;padding:6px;font-weight:700;font-size:14px">${m.cantidad}</td>
      <td style="text-align:center;padding:6px">
        <input type="text" value="${(m.unidad || 'ud').replace(/"/g, '&quot;')}" data-validar-unidad="${idx}"
          style="width:45px;text-align:center;border:1px solid var(--gris-200);border-radius:5px;padding:3px;font-size:11px;color:var(--gris-600)">
      </td>
      <td style="text-align:center;padding:6px">
        <input type="number" value="${precioCoste}" min="0" step="0.01" data-validar-precio="${idx}"
          style="width:70px;text-align:center;border:1px solid var(--gris-200);border-radius:5px;padding:3px;font-size:12px">
      </td>
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

  // Imágenes
  let imgHtml = '';
  if (fotosArr.length) {
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
            <div>
              <label style="font-size:10px;font-weight:600;color:var(--gris-500)">Operario / Furgoneta</label>
              <div class="input" style="margin-top:2px;font-size:12px;background:var(--gris-50);padding:6px 8px;color:var(--gris-600)">👷 ${operarioNombre} · 🚐 ${furgonetaNombre}</div>
            </div>
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
                <th style="padding:6px 8px;text-align:left">Material / Código</th>
                <th style="padding:6px;text-align:center;width:55px">Leído</th>
                <th style="padding:6px;text-align:center;width:40px">Ud</th>
                <th style="padding:6px;text-align:center;width:75px">Precio</th>
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
    unidad: (document.querySelector(`[data-validar-unidad="${idx}"]`)?.value || m.unidad || 'ud').trim()
  }));

  const tipoLabel = tipoDoc === 'factura' ? 'factura' : 'albarán';
  if (!confirm(`¿Confirmar la validación?\n\n• Stock provisional → real\n• Se genera ${tipoLabel} de proveedor nº ${numDocEdit || '(auto)'}`)) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Validar, confirmar stock y generar documento'; }
    return;
  }

  try {
    toast('Validando materiales...', 'info');
    let okCount = 0, errCount = 0;

    // Paso 0: proveedor
    let proveedorId = _ocrValidarProvMatch?.id || null;
    if (!proveedorId) {
      const pNombre = document.getElementById('ocrValProvNombre')?.value?.trim() || '';
      const pCif = document.getElementById('ocrValProvCif')?.value?.trim() || '';
      if (pNombre) {
        if (typeof iaCrearProveedor === 'function') {
          proveedorId = await iaCrearProveedor({ nombre: pNombre, cif: pCif || null,
            observaciones: 'Creado desde validación OCR — doc ' + (numDocEdit || doc.id) });
        } else {
          const { data: nuevoP, error: provErr } = await sb.from('proveedores').insert({
            empresa_id: EMPRESA.id, nombre: pNombre, cif: pCif || null, activo: true,
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
      if (!m.articulo_id || ed.cantidad <= 0) continue;
      try {
        // Actualizar artículo
        const updateFields = {};
        if (ed.nombre && ed.nombre !== (m.nombre || '')) updateFields.nombre = ed.nombre;
        if (ed.codigo) updateFields.referencia_fabricante = ed.codigo;
        if (ed.precio > 0) updateFields.precio_coste = ed.precio;
        if (proveedorId && !m.en_catalogo) updateFields.proveedor_id = proveedorId;
        if (Object.keys(updateFields).length) await sb.from('articulos').update(updateFields).eq('id', m.articulo_id);

        // Vincular proveedor
        if (proveedorId) {
          const { data: existeVinc } = await sb.from('articulos_proveedores')
            .select('id').eq('articulo_id', m.articulo_id).eq('proveedor_id', proveedorId).eq('empresa_id', EMPRESA.id).limit(1);
          if (!existeVinc?.length) {
            await sb.from('articulos_proveedores').insert({
              empresa_id: EMPRESA.id, articulo_id: m.articulo_id, proveedor_id: proveedorId,
              ref_proveedor: ed.codigo || m.codigo || null, precio_proveedor: ed.precio || 0, es_principal: !m.en_catalogo
            });
          }
        }

        // Stock: provisional → real
        const { data: stockRows } = await sb.from('stock')
          .select('id, almacen_id, cantidad, stock_provisional, almacenes(nombre, tipo)')
          .eq('empresa_id', EMPRESA.id).eq('articulo_id', m.articulo_id).gt('stock_provisional', 0);
        if (!stockRows?.length) { toast('⚠️ ' + (ed.nombre||'').substring(0,20) + ': sin stock provisional', 'warning'); continue; }

        const stk = stockRows[0];
        const cantOriginal = m.cantidad || 0;
        const mover = Math.min(ed.cantidad, stk.stock_provisional || 0);

        await sb.from('stock').update({
          cantidad: (stk.cantidad || 0) + mover,
          stock_provisional: Math.max(0, (stk.stock_provisional || 0) - cantOriginal)
        }).eq('id', stk.id);

        await sb.from('movimientos_stock').insert({
          empresa_id: EMPRESA.id, articulo_id: m.articulo_id, almacen_id: stk.almacen_id,
          tipo: 'entrada', cantidad: mover, delta: mover,
          notas: 'Validación OCR: ' + (ed.nombre || '?') + ' — doc ' + (numDocEdit || doc.id),
          tipo_stock: 'real', fecha: new Date().toISOString().slice(0, 10),
          usuario_id: CP?.id || null, usuario_nombre: CP?.nombre || 'admin'
        });

        if (ed.cantidad < cantOriginal) {
          await sb.from('movimientos_stock').insert({
            empresa_id: EMPRESA.id, articulo_id: m.articulo_id, almacen_id: stk.almacen_id,
            tipo: 'ajuste', cantidad: -(cantOriginal - ed.cantidad), delta: -(cantOriginal - ed.cantidad),
            notas: 'Ajuste validación: ' + cantOriginal + ' → ' + ed.cantidad, tipo_stock: 'provisional',
            fecha: new Date().toISOString().slice(0, 10), usuario_id: CP?.id || null, usuario_nombre: CP?.nombre || 'admin'
          });
        }
        okCount++;
      } catch(e) {
        errCount++;
        console.error('[Validar OCR] Error material', i, ed.nombre, e);
        toast('❌ ' + (ed.nombre||'').substring(0,25) + ': ' + e.message, 'error');
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

    // Paso 3: generar documento de compra
    const lineasDoc = ediciones.map((ed, i) => ({
      _artId: materiales[i].articulo_id, _artCodigo: ed.codigo,
      descripcion: ed.nombre, codigo: ed.codigo, cantidad: ed.cantidad,
      unidad: ed.unidad || 'ud',
      precio_unitario: ed.precio, dto1_pct: 0, dto2_pct: 0, dto3_pct: 0, iva_pct: 21
    }));
    const docData = {
      numero_documento: numDocEdit, fecha: fechaEdit, fecha_vencimiento: '',
      notas: notasEdit || ('Validado desde OCR móvil — operario: ' + (datos.operario || '?')),
      lineas: lineasDoc
    };

    closeModal('mOcrValidar');
    toast('✅ Stock validado: ' + okCount + ' materiales. Generando documento...', 'success');

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

// ─── Hook: update badge on app init ───
if (typeof window._initHooks === 'undefined') window._initHooks = [];
window._initHooks.push(updateOCRBadge);

// El badge se actualiza automáticamente mediante el polling de 15s (_ocrStartPoll)
// No hace falta un setInterval adicional aquí
