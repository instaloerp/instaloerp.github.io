// ═══════════════════════════════════════════════════════════════
// PARTE_FORMULARIO — Lado "rellenar" de los formularios estructurados
//
// Se monta dentro del modal mPartes. Permite asignar una plantilla
// al parte de trabajo, rellenar los campos respetando los condicionales
// (mostrar_si) y autoguardar las respuestas.
//
// Tablas: partes_formulario (1 fila por parte, único por parte_id)
//         form_plantillas, form_plantilla_campos (lectura)
// ═══════════════════════════════════════════════════════════════

let _pf = {
  parteId: null,                  // partes_trabajo.id (null si parte nuevo no guardado)
  partesFormularioId: null,       // partes_formulario.id
  plantillaId: null,
  plantillaIdPendiente: null,     // si se elige plantilla en parte nuevo, INSERT al guardar el parte
  plantillaVersion: null,
  campos: [],
  respuestas: {},                 // { codigo|"id_<nº>" : valor }
  plantillasDisponibles: [],
  debTimer: null
};

function _pfEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function _pfKey(c) { return c.codigo || ('id_' + c.id); }

// ─── 1. INIT al abrir mPartes ──────────────────────────────────
async function pf_init(parteId) {
  _pf = {
    parteId: parteId || null,
    partesFormularioId: null,
    plantillaId: null,
    plantillaIdPendiente: null,
    plantillaVersion: null,
    campos: [],
    respuestas: {},
    plantillasDisponibles: [],
    debTimer: null
  };

  if (typeof EMPRESA === 'undefined' || !EMPRESA?.id) { pf_render(); return; }

  try {
    const { data: plantillas } = await sb.from('form_plantillas')
      .select('id, nombre, categoria, version')
      .eq('empresa_id', EMPRESA.id)
      .eq('activa', true)
      .order('nombre', { ascending: true });
    _pf.plantillasDisponibles = plantillas || [];
  } catch(e) { console.warn('[pf_init] plantillas:', e); }

  if (parteId) {
    try {
      const { data: pf } = await sb.from('partes_formulario')
        .select('*').eq('parte_id', parteId).maybeSingle();
      if (pf) {
        _pf.partesFormularioId = pf.id;
        _pf.plantillaId = pf.plantilla_id;
        _pf.plantillaVersion = pf.plantilla_version;
        _pf.respuestas = pf.respuestas || {};
        const { data: campos } = await sb.from('form_plantilla_campos')
          .select('*').eq('plantilla_id', pf.plantilla_id).order('orden');
        _pf.campos = campos || [];
      }
    } catch(e) { console.warn('[pf_init] formulario asociado:', e); }
  }

  pf_render();
}

// ─── 2. RENDER ─────────────────────────────────────────────────
function pf_render() {
  const wrap = document.getElementById('pf_wrap');
  if (!wrap) return;

  if (!_pf.plantillaId) {
    wrap.innerHTML = pf_renderSelector();
    return;
  }
  wrap.innerHTML = pf_renderCampos();
}

function pf_renderSelector() {
  if (!_pf.plantillasDisponibles.length) {
    return `<div style="border:1px dashed var(--gris-200);border-radius:8px;padding:10px;background:var(--gris-100);font-size:11.5px;color:var(--gris-500);text-align:center">📋 No hay plantillas activas. Crea una en <a onclick="closeModal('mPartes');goPage('formularios')" style="color:var(--azul);cursor:pointer;text-decoration:underline">Formularios</a>.</div>`;
  }
  return `
    <div style="border:1px dashed var(--gris-200);border-radius:8px;padding:10px;background:var(--gris-100);margin-bottom:11px">
      <label style="font-size:12px;font-weight:700;color:var(--gris-600);display:block;margin-bottom:6px">📋 Formulario asociado</label>
      <div style="display:flex;gap:6px;align-items:center">
        <select id="pf_plantilla_sel" style="flex:1;padding:7px 10px;border:1.5px solid var(--gris-200);border-radius:8px;font-size:12.5px;background:#fff">
          <option value="">— Sin formulario —</option>
          ${_pf.plantillasDisponibles.map(p => `
            <option value="${p.id}">${_pfEsc(p.nombre)}${p.categoria ? ' · ' + _pfEsc(p.categoria) : ''} · v${p.version}</option>
          `).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="pf_asignar()" style="white-space:nowrap">+ Asignar</button>
      </div>
    </div>
  `;
}

function pf_renderCampos() {
  const valores = _pf.respuestas;
  const visibles = _pf.campos.filter(c => pf_evalMostrarSi(c, valores));
  const plantNombre = _pf.plantillasDisponibles.find(p => p.id === _pf.plantillaId)?.nombre || 'Formulario';

  return `<div class="card" style="margin-bottom:11px">
    <div class="card-h">
      <span>📋</span>
      <h3>${_pfEsc(plantNombre)} · v${_pf.plantillaVersion}</h3>
      <div class="card-ha">
        <button class="btn btn-ghost btn-sm" onclick="pf_quitar()" title="Quitar formulario">🗑️ Quitar</button>
      </div>
    </div>
    <div class="card-b">
      ${visibles.length ? visibles.map(c => pf_renderCampo(c, valores)).join('') : '<p style="text-align:center;color:var(--gris-400);font-size:12px;padding:10px">Selecciona el TIPO DE MANTENIMIENTO para ver las operaciones.</p>'}
    </div>
  </div>`;
}

function pf_renderCampo(c, valores) {
  const key = _pfKey(c);
  const val = valores[key] ?? '';
  const oblig = c.obligatorio ? '<span style="color:var(--rojo);font-weight:700">*</span> ' : '';

  if (c.tipo === 'seccion') {
    return `<h4 style="font-size:12.5px;font-weight:800;background:var(--gris-100);color:var(--gris-700);padding:7px 11px;margin:14px -8px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.04em">${_pfEsc(c.etiqueta)}</h4>`;
  }

  let input = '';
  switch (c.tipo) {
    case 'texto':
      input = `<input type="text" value="${_pfEsc(val)}" oninput="pf_onInput('${key}', this.value)">`;
      break;
    case 'texto_largo':
      input = `<textarea rows="3" oninput="pf_onInput('${key}', this.value)" autocorrect="on" spellcheck="true">${_pfEsc(val)}</textarea>`;
      break;
    case 'numero':
      input = `<input type="number" value="${_pfEsc(val)}" oninput="pf_onInput('${key}', this.value)">`;
      break;
    case 'fecha':
      input = `<input type="date" value="${_pfEsc(val)}" onchange="pf_onInput('${key}', this.value)">`;
      break;
    case 'hora':
      input = `<input type="time" value="${_pfEsc(val)}" onchange="pf_onInput('${key}', this.value)">`;
      break;
    case 'radio': {
      const ops = c.config?.opciones || [];
      input = `<div style="display:flex;flex-wrap:wrap;gap:6px">${ops.map(op => {
        const sel = (val === op);
        return `<label style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1.5px solid ${sel?'var(--azul)':'var(--gris-200)'};border-radius:6px;cursor:pointer;font-size:12px;font-weight:${sel?'700':'500'};color:${sel?'var(--azul)':'var(--gris-700)'};background:${sel?'#eff6ff':'#fff'}">
          <input type="radio" name="pf_${key}" value="${_pfEsc(op)}" ${sel?'checked':''} onchange="pf_onInput('${key}', this.value)" style="margin:0;accent-color:var(--azul)">
          ${_pfEsc(op)}
        </label>`;
      }).join('')}</div>`;
      break;
    }
    case 'dropdown': {
      const ops = c.config?.opciones || [];
      input = `<select onchange="pf_onInput('${key}', this.value)"><option value="">—</option>${ops.map(op => `<option value="${_pfEsc(op)}" ${val===op?'selected':''}>${_pfEsc(op)}</option>`).join('')}</select>`;
      break;
    }
    case 'checkbox': {
      const ops = c.config?.opciones || [];
      const valArr = Array.isArray(val) ? val : (val ? [val] : []);
      input = `<div style="display:flex;flex-wrap:wrap;gap:6px">${ops.map(op => {
        const sel = valArr.includes(op);
        return `<label style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1.5px solid ${sel?'var(--azul)':'var(--gris-200)'};border-radius:6px;cursor:pointer;font-size:12px;background:${sel?'#eff6ff':'#fff'}">
          <input type="checkbox" value="${_pfEsc(op)}" ${sel?'checked':''} onchange="pf_onCheckbox('${key}', '${_pfEsc(op).replace(/'/g,'&#39;')}', this.checked)" style="margin:0;accent-color:var(--azul)">
          ${_pfEsc(op)}
        </label>`;
      }).join('')}</div>`;
      break;
    }
    case 'foto': {
      const fotos = Array.isArray(val) ? val : [];
      const max = c.config?.max || 10;
      const puedeAdir = fotos.length < max;
      input = `<div>
        ${fotos.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">${fotos.map((u,i)=>`<div style="position:relative;display:inline-block">
          <img src="${_pfEsc(u)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--gris-200)">
          <button onclick="pf_quitarFoto('${key}', ${i})" style="position:absolute;top:-5px;right:-5px;background:var(--rojo);color:#fff;border:none;width:20px;height:20px;border-radius:50%;font-size:11px;cursor:pointer;line-height:1;padding:0">×</button>
        </div>`).join('')}</div>` : ''}
        ${puedeAdir ? `<input type="file" multiple accept="image/*" onchange="pf_onFotos('${key}', this.files, ${max})" style="font-size:11px">
        <span class="hint">${fotos.length}/${max} foto${max===1?'':'s'}</span>` : `<span class="hint">Máximo ${max} fotos alcanzado</span>`}
      </div>`;
      break;
    }
    case 'firma':
      input = `<div style="font-size:11px;color:var(--gris-400);padding:8px;border:1px dashed var(--gris-200);border-radius:6px">✍️ Firma — se rellenará desde la app móvil o por el cliente vía firma remota</div>`;
      break;
    default:
      input = `<input type="text" value="${_pfEsc(val)}" oninput="pf_onInput('${key}', this.value)">`;
  }

  return `<div class="fg" style="margin-bottom:10px"><label>${oblig}${_pfEsc(c.etiqueta)}</label>${input}</div>`;
}

function pf_evalMostrarSi(c, valores) {
  if (!c.mostrar_si) return true;
  const cod = c.mostrar_si.codigo;
  const valoresIn = c.mostrar_si.valor_in || [];
  if (!cod) return true;
  const v = valores[cod];
  return valoresIn.includes(v);
}

// ─── 3. EVENTOS ────────────────────────────────────────────────
function pf_onInput(key, valor) {
  _pf.respuestas[key] = valor;
  // Si cambia un campo con código, puede afectar a condicionales → re-render
  const campoMod = _pf.campos.find(c => c.codigo === key);
  if (campoMod) pf_render();
  pf_scheduleSave();
}

function pf_onCheckbox(key, op, marcado) {
  let arr = _pf.respuestas[key];
  if (!Array.isArray(arr)) arr = [];
  if (marcado) {
    if (!arr.includes(op)) arr.push(op);
  } else {
    arr = arr.filter(x => x !== op);
  }
  _pf.respuestas[key] = arr;
  pf_scheduleSave();
}

async function pf_onFotos(key, files, max) {
  if (!files || !files.length) return;
  const arr = Array.isArray(_pf.respuestas[key]) ? [..._pf.respuestas[key]] : [];

  for (const file of files) {
    if (arr.length >= max) break;
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const filename = `${EMPRESA.id}/form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
      const { error } = await sb.storage.from('fotos-partes').upload(filename, file);
      if (!error) {
        const { data } = sb.storage.from('fotos-partes').getPublicUrl(filename);
        arr.push(data.publicUrl);
      }
    } catch (e) { console.error('[pf_onFotos]', e); }
  }
  _pf.respuestas[key] = arr;
  pf_render();
  pf_scheduleSave();
}

function pf_quitarFoto(key, idx) {
  const arr = _pf.respuestas[key];
  if (!Array.isArray(arr)) return;
  arr.splice(idx, 1);
  _pf.respuestas[key] = arr;
  pf_render();
  pf_scheduleSave();
}

function pf_scheduleSave() {
  clearTimeout(_pf.debTimer);
  _pf.debTimer = setTimeout(() => pf_save().catch(()=>{}), 1500);
}

async function pf_save() {
  if (!_pf.partesFormularioId) return;
  try {
    await sb.from('partes_formulario')
      .update({ respuestas: _pf.respuestas })
      .eq('id', _pf.partesFormularioId);
  } catch (e) { console.warn('[pf_save]', e); }
}

// ─── 4. ASIGNAR / QUITAR ───────────────────────────────────────
async function pf_asignar() {
  const sel = document.getElementById('pf_plantilla_sel');
  const plantillaId = parseInt(sel?.value, 10) || null;
  if (!plantillaId) {
    if (typeof toast === 'function') toast('Selecciona una plantilla', 'error');
    return;
  }
  const plant = _pf.plantillasDisponibles.find(p => p.id === plantillaId);
  if (!plant) return;

  // Cargar campos siempre (locales o de DB)
  let campos = [];
  try {
    const { data } = await sb.from('form_plantilla_campos')
      .select('*').eq('plantilla_id', plantillaId).order('orden');
    campos = data || [];
  } catch (e) { console.warn(e); }

  if (!_pf.parteId) {
    // Parte aún no creado: dejar pendiente, no INSERT
    _pf.plantillaIdPendiente = plantillaId;
    _pf.plantillaId = plantillaId;
    _pf.plantillaVersion = plant.version;
    _pf.campos = campos;
    _pf.respuestas = {};
    pf_render();
    return;
  }

  // Parte existente: INSERT en partes_formulario
  try {
    const { data, error } = await sb.from('partes_formulario').insert({
      empresa_id: EMPRESA.id,
      parte_id: _pf.parteId,
      plantilla_id: plantillaId,
      plantilla_version: plant.version,
      respuestas: {}
    }).select().single();
    if (error) throw error;
    _pf.partesFormularioId = data.id;
    _pf.plantillaId = plantillaId;
    _pf.plantillaVersion = plant.version;
    _pf.campos = campos;
    _pf.respuestas = {};
    pf_render();
    if (typeof toast === 'function') toast('Formulario asignado', 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Error: ' + e.message, 'error');
  }
}

async function pf_quitar() {
  if (!confirm('¿Quitar el formulario y todas sus respuestas? Esta acción no se puede deshacer.')) return;
  try {
    if (_pf.partesFormularioId) {
      await sb.from('partes_formulario').delete().eq('id', _pf.partesFormularioId);
    }
  } catch (e) { console.warn('[pf_quitar]', e); }
  _pf.partesFormularioId = null;
  _pf.plantillaId = null;
  _pf.plantillaIdPendiente = null;
  _pf.plantillaVersion = null;
  _pf.respuestas = {};
  _pf.campos = [];
  pf_render();
  if (typeof toast === 'function') toast('Formulario quitado', 'success');
}

// ─── 5. HOOK desde guardarParte() ──────────────────────────────
// Llamado tras INSERT del parte nuevo, con el id recién creado
async function pf_postCrearParte(parteId) {
  _pf.parteId = parteId;
  if (_pf.plantillaIdPendiente && !_pf.partesFormularioId) {
    const plant = _pf.plantillasDisponibles.find(p => p.id === _pf.plantillaIdPendiente);
    try {
      const { data, error } = await sb.from('partes_formulario').insert({
        empresa_id: EMPRESA.id,
        parte_id: parteId,
        plantilla_id: _pf.plantillaIdPendiente,
        plantilla_version: plant?.version || 1,
        respuestas: _pf.respuestas || {}
      }).select().single();
      if (!error && data) _pf.partesFormularioId = data.id;
    } catch (e) { console.warn('[pf_postCrearParte]', e); }
  } else if (_pf.partesFormularioId) {
    // El parte ya existía y el formulario ya está asociado → forzar guardado de respuestas
    try {
      await sb.from('partes_formulario')
        .update({ respuestas: _pf.respuestas })
        .eq('id', _pf.partesFormularioId);
    } catch (e) { console.warn('[pf_postCrearParte save]', e); }
  }
}

// ─── 6. VALIDACIÓN antes de cambiar a 'completado' / 'enviado' ─
// Devuelve { ok: true } o { ok: false, faltantes: [etiquetas] }
function pf_validar() {
  if (!_pf.plantillaId) return { ok: true, faltantes: [] };
  const valores = _pf.respuestas;
  const faltantes = [];
  for (const c of _pf.campos) {
    if (!c.obligatorio || c.tipo === 'seccion') continue;
    if (!pf_evalMostrarSi(c, valores)) continue;
    const key = _pfKey(c);
    const v = valores[key];
    const vacio = (v == null || v === '' || (Array.isArray(v) && v.length === 0));
    if (vacio) faltantes.push(c.etiqueta);
  }
  return { ok: faltantes.length === 0, faltantes };
}

// ─── 7. EXPORTAR ───────────────────────────────────────────────
window.pf_init           = pf_init;
window.pf_render         = pf_render;
window.pf_asignar        = pf_asignar;
window.pf_quitar         = pf_quitar;
window.pf_onInput        = pf_onInput;
window.pf_onCheckbox     = pf_onCheckbox;
window.pf_onFotos        = pf_onFotos;
window.pf_quitarFoto     = pf_quitarFoto;
window.pf_save           = pf_save;
window.pf_postCrearParte = pf_postCrearParte;
window.pf_validar        = pf_validar;
