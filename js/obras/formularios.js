// ═══════════════════════════════════════════════════════════════
// FORMULARIOS — Constructor visual de plantillas (page-formularios)
//
// CRUD de plantillas de formulario asociadas a partes de trabajo.
// Editor de campos ordenable (SortableJS) con condicionalidad por
// código estable.
//
// Versionado opción A: SIEMPRE crear v+1 al editar una plantilla
// existente (la versión anterior queda congelada con activa=false).
//
// Tablas: form_plantillas, form_plantilla_campos
// ═══════════════════════════════════════════════════════════════

// Estado global
let _formPlantillas = [];
let _formEditor = null;        // { id, datos: {nombre,...}, campos: [], dirty }
let _formCampoEditIdx = -1;    // índice del campo en edición en el modal
let _formSortable = null;

const TIPOS_CAMPO = [
  { v: 'seccion',     label: 'Sección / separador' },
  { v: 'texto',       label: 'Texto corto' },
  { v: 'texto_largo', label: 'Texto largo' },
  { v: 'numero',      label: 'Número' },
  { v: 'fecha',       label: 'Fecha' },
  { v: 'hora',        label: 'Hora' },
  { v: 'dropdown',    label: 'Desplegable' },
  { v: 'radio',       label: 'Opción única (radio)' },
  { v: 'checkbox',    label: 'Opción múltiple (checkbox)' },
  { v: 'foto',        label: 'Foto / archivo' },
  { v: 'firma',       label: 'Firma' },
];

const TIPOS_CON_OPCIONES = new Set(['dropdown', 'radio', 'checkbox']);

function _formEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ─── 1. LISTADO ─────────────────────────────────────────────────
async function loadFormPlantillas() {
  if (typeof EMPRESA === 'undefined' || !EMPRESA?.id) return;

  // Mostrar vista lista, ocultar editor
  document.getElementById('formVista-lista').style.display = '';
  document.getElementById('formVista-editor').style.display = 'none';

  try {
    const { data, error } = await sb.from('form_plantillas')
      .select('id, nombre, descripcion, categoria, version, activa, plantilla_padre_id, created_at, updated_at')
      .eq('empresa_id', EMPRESA.id)
      .order('categoria', { ascending: true })
      .order('version', { ascending: false });

    if (error) throw error;

    // Solo mostramos las activas; las inactivas se pueden ver con un toggle
    _formPlantillas = data || [];
    await _formCargarConteoCampos();
    renderFormPlantillas();
  } catch (e) {
    console.error('[formularios] Error cargando plantillas:', e);
    if (typeof toast === 'function') toast('Error cargando plantillas: ' + e.message, 'error');
  }
}

async function _formCargarConteoCampos() {
  if (!_formPlantillas.length) return;
  const ids = _formPlantillas.map(p => p.id);
  // Contar campos por plantilla
  const { data: campos } = await sb.from('form_plantilla_campos')
    .select('plantilla_id')
    .in('plantilla_id', ids);
  const conteoCampos = {};
  (campos || []).forEach(r => { conteoCampos[r.plantilla_id] = (conteoCampos[r.plantilla_id] || 0) + 1; });
  // Contar partes que usan cada plantilla (Fase 6 — badges informativos)
  const { data: usos } = await sb.from('partes_formulario')
    .select('plantilla_id')
    .in('plantilla_id', ids);
  const conteoUsos = {};
  (usos || []).forEach(r => { conteoUsos[r.plantilla_id] = (conteoUsos[r.plantilla_id] || 0) + 1; });
  _formPlantillas.forEach(p => {
    p._n_campos = conteoCampos[p.id] || 0;
    p._n_usos   = conteoUsos[p.id] || 0;
  });
}

function renderFormPlantillas() {
  const tbody = document.getElementById('formPlantillasTable');
  const count = document.getElementById('formCount');
  if (!tbody) return;

  const showInactivas = document.getElementById('formMostrarInactivas')?.checked;
  const lista = showInactivas ? _formPlantillas : _formPlantillas.filter(p => p.activa);

  count && (count.textContent = `${lista.length} plantilla${lista.length === 1 ? '' : 's'}`);

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gris-400)">Sin plantillas. Pulsa "+ Nueva plantilla" para crear la primera.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => {
    const usoBadge = p._n_usos
      ? `<span class="badge bg-blue" style="margin-left:6px" title="Partes que usan esta plantilla">📋 ${p._n_usos}</span>`
      : '';
    return `
    <tr>
      <td>
        <strong>${_formEsc(p.nombre)}</strong>${usoBadge}
        ${p.descripcion ? `<div style="font-size:11px;color:var(--gris-400);margin-top:2px">${_formEsc(p.descripcion)}</div>` : ''}
      </td>
      <td>${p.categoria ? `<span class="badge bg-blue">${_formEsc(p.categoria)}</span>` : '—'}</td>
      <td>v${p.version}</td>
      <td>${p._n_campos || 0}</td>
      <td>${p.activa ? '<span class="badge bg-green">Activa</span>' : '<span class="badge bg-gray">Inactiva</span>'}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="editarPlantillaForm(${p.id})">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="duplicarPlantillaForm(${p.id})" title="Duplicar">📑</button>
        <button class="btn btn-ghost btn-sm" onclick="exportarPlantillaForm(${p.id})" title="Exportar JSON">💾</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleActivaPlantillaForm(${p.id})" title="${p.activa ? 'Desactivar' : 'Activar'}">${p.activa ? '🚫' : '✅'}</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── 2. CRUD DE PLANTILLAS ──────────────────────────────────────
function nuevaPlantillaForm() {
  _formEditor = {
    id: null,           // null = nueva
    plantilla_padre_id: null,
    version: 1,
    datos: { nombre: '', descripcion: '', categoria: '', activa: true },
    campos: [],
    dirty: false
  };
  abrirEditorForm();
}

async function editarPlantillaForm(id) {
  try {
    const { data: plant, error: e1 } = await sb.from('form_plantillas')
      .select('*').eq('id', id).single();
    if (e1) throw e1;

    const { data: campos, error: e2 } = await sb.from('form_plantilla_campos')
      .select('*').eq('plantilla_id', id).order('orden', { ascending: true });
    if (e2) throw e2;

    _formEditor = {
      id: plant.id,
      plantilla_padre_id: plant.plantilla_padre_id,
      version: plant.version,
      datos: {
        nombre: plant.nombre,
        descripcion: plant.descripcion || '',
        categoria: plant.categoria || '',
        activa: plant.activa
      },
      campos: (campos || []).map(c => ({
        id: c.id,
        orden: c.orden,
        codigo: c.codigo || '',
        tipo: c.tipo,
        etiqueta: c.etiqueta,
        obligatorio: !!c.obligatorio,
        mostrar_si: c.mostrar_si || null,
        config: c.config || {}
      })),
      dirty: false
    };
    abrirEditorForm();
  } catch (e) {
    console.error(e);
    if (typeof toast === 'function') toast('No se pudo cargar la plantilla: ' + e.message, 'error');
  }
}

async function duplicarPlantillaForm(id) {
  try {
    const { data: plant, error: e1 } = await sb.from('form_plantillas')
      .select('*').eq('id', id).single();
    if (e1) throw e1;
    const { data: campos, error: e2 } = await sb.from('form_plantilla_campos')
      .select('orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config')
      .eq('plantilla_id', id).order('orden');
    if (e2) throw e2;

    const { data: nueva, error: e3 } = await sb.from('form_plantillas').insert({
      empresa_id: EMPRESA.id,
      nombre: 'Copia de ' + plant.nombre,
      descripcion: plant.descripcion,
      categoria: plant.categoria,
      version: 1,
      activa: true
    }).select().single();
    if (e3) throw e3;

    if (campos && campos.length) {
      const filas = campos.map(c => ({ plantilla_id: nueva.id, ...c }));
      const { error: e4 } = await sb.from('form_plantilla_campos').insert(filas);
      if (e4) throw e4;
    }

    if (typeof toast === 'function') toast('Plantilla duplicada', 'success');
    await loadFormPlantillas();
  } catch (e) {
    console.error(e);
    if (typeof toast === 'function') toast('Error al duplicar: ' + e.message, 'error');
  }
}

// Fase 6 — Exportar plantilla a JSON descargable
async function exportarPlantillaForm(id) {
  try {
    const { data: plant, error: e1 } = await sb.from('form_plantillas')
      .select('nombre, descripcion, categoria, version').eq('id', id).single();
    if (e1) throw e1;
    const { data: campos, error: e2 } = await sb.from('form_plantilla_campos')
      .select('orden, codigo, tipo, etiqueta, obligatorio, mostrar_si, config')
      .eq('plantilla_id', id).order('orden');
    if (e2) throw e2;
    const json = {
      _formato: 'instaloERP_form_plantilla_v1',
      _exportado_at: new Date().toISOString(),
      nombre: plant.nombre,
      descripcion: plant.descripcion || '',
      categoria: plant.categoria || '',
      version: plant.version,
      campos: campos || []
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantilla_${plant.nombre.replace(/[^a-zA-Z0-9-]/g,'_')}_v${plant.version}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    if (typeof toast === 'function') toast('Plantilla exportada', 'success');
  } catch (e) {
    console.error(e);
    if (typeof toast === 'function') toast('Error al exportar: ' + e.message, 'error');
  }
}

// Fase 6 — Importar plantilla desde JSON
async function importarPlantillaForm(input) {
  const file = input.files?.[0];
  input.value = '';  // permite re-importar el mismo archivo después
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    // Aceptamos tanto el formato exportado como uno mínimo {nombre, campos:[...]}
    if (!json.nombre || !Array.isArray(json.campos)) {
      throw new Error('JSON no válido: faltan "nombre" o "campos"');
    }
    const { data: nueva, error: eP } = await sb.from('form_plantillas').insert({
      empresa_id: EMPRESA.id,
      nombre: json.nombre + ' (importada)',
      descripcion: json.descripcion || '',
      categoria: json.categoria || '',
      version: 1,
      activa: true
    }).select().single();
    if (eP) throw eP;
    if (json.campos.length) {
      const filas = json.campos.map(c => ({
        plantilla_id: nueva.id,
        orden: c.orden,
        codigo: c.codigo || null,
        tipo: c.tipo,
        etiqueta: c.etiqueta,
        obligatorio: !!c.obligatorio,
        mostrar_si: c.mostrar_si || null,
        config: c.config || {}
      }));
      const { error: eC } = await sb.from('form_plantilla_campos').insert(filas);
      if (eC) throw eC;
    }
    if (typeof toast === 'function') toast(`Plantilla "${json.nombre}" importada`, 'success');
    await loadFormPlantillas();
  } catch (e) {
    console.error(e);
    if (typeof toast === 'function') toast('Error al importar: ' + e.message, 'error');
  }
}

async function toggleActivaPlantillaForm(id) {
  const p = _formPlantillas.find(x => x.id === id);
  if (!p) return;
  try {
    const { error } = await sb.from('form_plantillas')
      .update({ activa: !p.activa }).eq('id', id);
    if (error) throw error;
    if (typeof toast === 'function') toast(p.activa ? 'Plantilla desactivada' : 'Plantilla activada', 'success');
    await loadFormPlantillas();
  } catch (e) {
    console.error(e);
    if (typeof toast === 'function') toast('Error: ' + e.message, 'error');
  }
}

// ─── 3. EDITOR DE PLANTILLA ─────────────────────────────────────
function abrirEditorForm() {
  document.getElementById('formVista-lista').style.display = 'none';
  const v = document.getElementById('formVista-editor');
  v.style.display = '';
  v.innerHTML = _formEditorHTML();
  setTimeout(_formInitSortable, 50);
}

function volverListadoForm() {
  if (_formEditor?.dirty) {
    if (!confirm('Hay cambios sin guardar. ¿Salir igualmente?')) return;
  }
  _formEditor = null;
  if (_formSortable) { try { _formSortable.destroy(); } catch(e){} _formSortable = null; }
  loadFormPlantillas();
}

function _formEditorHTML() {
  const e = _formEditor;
  const titulo = e.id ? `Editando: ${_formEsc(e.datos.nombre)}` : 'Nueva plantilla';
  const subtitulo = e.id
    ? `v${e.version} · al guardar se creará v${e.version + 1}`
    : 'Versión 1';

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button class="btn-back-circle" onclick="volverListadoForm()" title="Volver">←</button>
      <div style="flex:1">
        <h2 style="font-size:17px;font-weight:800">${_formEsc(titulo)}</h2>
        <p style="font-size:11.5px;color:var(--gris-400)">${subtitulo}</p>
      </div>
      <button class="btn btn-secondary" onclick="volverListadoForm()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarPlantillaForm()">💾 Guardar</button>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>Datos básicos</h3></div>
      <div class="card-b">
        <div class="fg-row" style="margin-bottom:11px">
          <div class="fg">
            <label>Nombre *</label>
            <input id="frmPlantNombre" value="${_formEsc(e.datos.nombre)}" oninput="_formMarkDirty()">
          </div>
          <div class="fg">
            <label>Categoría</label>
            <input id="frmPlantCategoria" value="${_formEsc(e.datos.categoria)}" placeholder="ej: rite, correctivo, custom" oninput="_formMarkDirty()">
          </div>
        </div>
        <div class="fg" style="margin-bottom:11px">
          <label>Descripción</label>
          <textarea id="frmPlantDescripcion" rows="2" oninput="_formMarkDirty()">${_formEsc(e.datos.descripcion)}</textarea>
        </div>
        <div class="fg">
          <label><input type="checkbox" id="frmPlantActiva" ${e.datos.activa ? 'checked' : ''} onchange="_formMarkDirty()"> Plantilla activa (visible al crear partes)</label>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h">
        <h3>Campos del formulario (${e.campos.length})</h3>
        <div class="card-ha">
          <button class="btn btn-primary btn-sm" onclick="addCampoForm()">+ Añadir campo</button>
        </div>
      </div>
      <div class="card-b" style="padding:6px">
        <ul id="frmCamposList" style="list-style:none;padding:0;margin:0">
          ${e.campos.map((c, idx) => _formCampoFila(c, idx)).join('')}
        </ul>
        ${!e.campos.length ? '<p style="text-align:center;color:var(--gris-400);padding:20px;font-size:13px">Sin campos. Pulsa "+ Añadir campo".</p>' : ''}
      </div>
    </div>
  `;
}

function _formCampoFila(c, idx) {
  const tipoLabel = TIPOS_CAMPO.find(t => t.v === c.tipo)?.label || c.tipo;
  const ico = c.tipo === 'seccion' ? '📑' :
              c.tipo === 'foto' ? '📷' :
              c.tipo === 'firma' ? '✍️' :
              c.tipo === 'radio' ? '⚪' :
              c.tipo === 'checkbox' ? '☑️' :
              c.tipo === 'dropdown' ? '⤵️' : '✏️';
  const oblig = c.obligatorio ? '<span style="color:var(--rojo);font-weight:700">*</span> ' : '';
  const cond = c.mostrar_si
    ? `<div style="font-size:10.5px;color:var(--gris-400);margin-top:2px">👁️ Solo si <code>${_formEsc(c.mostrar_si.codigo)}</code> = ${_formEsc((c.mostrar_si.valor_in || []).join(', '))}</div>`
    : '';
  const codigo = c.codigo
    ? `<span style="background:var(--gris-100);padding:1px 6px;border-radius:4px;font-size:10px;font-family:monospace;color:var(--gris-600);margin-left:6px">🔑 ${_formEsc(c.codigo)}</span>`
    : '';
  const isSeccion = c.tipo === 'seccion';
  return `
    <li data-idx="${idx}" style="display:flex;align-items:center;gap:8px;padding:9px 11px;border:1px solid var(--gris-200);border-radius:8px;margin-bottom:6px;background:${isSeccion ? 'var(--gris-100)' : '#fff'};cursor:grab">
      <span style="color:var(--gris-400);font-size:18px;user-select:none">≡</span>
      <span style="font-size:18px">${ico}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:${isSeccion ? '700' : '600'};font-size:13px;color:var(--gris-800)">${oblig}${_formEsc(c.etiqueta)}${codigo}</div>
        <div style="font-size:11px;color:var(--gris-500)">${_formEsc(tipoLabel)}</div>
        ${cond}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="editCampoForm(${idx})" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-sm" onclick="removeCampoForm(${idx})" title="Eliminar">🗑️</button>
    </li>
  `;
}

function _formInitSortable() {
  const list = document.getElementById('frmCamposList');
  if (!list || typeof Sortable === 'undefined') return;
  if (_formSortable) { try { _formSortable.destroy(); } catch(e){} }
  _formSortable = Sortable.create(list, {
    animation: 150,
    handle: 'li',
    ghostClass: 'frm-drag-ghost',
    onEnd: (ev) => {
      if (ev.oldIndex === ev.newIndex) return;
      const item = _formEditor.campos.splice(ev.oldIndex, 1)[0];
      _formEditor.campos.splice(ev.newIndex, 0, item);
      _formMarkDirty();
      // Re-render para refrescar índices en onclick
      _formRefreshLista();
    }
  });
}

function _formRefreshLista() {
  const list = document.getElementById('frmCamposList');
  if (!list) return;
  list.innerHTML = _formEditor.campos.map((c, idx) => _formCampoFila(c, idx)).join('');
  _formInitSortable();
  // Actualizar contador
  const cardH = document.querySelector('#formVista-editor .card-h h3');
  if (cardH) cardH.textContent = `Campos del formulario (${_formEditor.campos.length})`;
}

function _formMarkDirty() {
  if (_formEditor) _formEditor.dirty = true;
}

// ─── 4. MODAL DE CAMPO ──────────────────────────────────────────
function addCampoForm() {
  _formCampoEditIdx = -1;
  _formCargarCampoEnModal({
    codigo: '',
    tipo: 'texto',
    etiqueta: '',
    obligatorio: false,
    mostrar_si: null,
    config: {}
  });
  if (typeof openModal === 'function') openModal('mFormCampo');
  else document.getElementById('mFormCampo').style.display = 'flex';
}

function editCampoForm(idx) {
  _formCampoEditIdx = idx;
  _formCargarCampoEnModal(_formEditor.campos[idx]);
  if (typeof openModal === 'function') openModal('mFormCampo');
  else document.getElementById('mFormCampo').style.display = 'flex';
}

function _formCargarCampoEnModal(c) {
  // tipo
  const sel = document.getElementById('frmCampoTipo');
  if (sel && !sel._poblado) {
    sel.innerHTML = TIPOS_CAMPO.map(t => `<option value="${t.v}">${t.label}</option>`).join('');
    sel._poblado = true;
  }
  sel.value = c.tipo || 'texto';
  document.getElementById('frmCampoEtiqueta').value = c.etiqueta || '';
  document.getElementById('frmCampoCodigo').value = c.codigo || '';
  document.getElementById('frmCampoOblig').checked = !!c.obligatorio;
  // opciones
  const opts = (c.config?.opciones || []).join('\n');
  document.getElementById('frmCampoOpciones').value = opts;
  // max para foto
  document.getElementById('frmCampoMax').value = c.config?.max ?? '';
  // condición
  if (c.mostrar_si) {
    document.getElementById('frmCampoVisib').value = 'cond';
    document.getElementById('frmCampoCondCodigo').value = c.mostrar_si.codigo || '';
    document.getElementById('frmCampoCondValores').value = (c.mostrar_si.valor_in || []).join(', ');
  } else {
    document.getElementById('frmCampoVisib').value = '';
    document.getElementById('frmCampoCondCodigo').value = '';
    document.getElementById('frmCampoCondValores').value = '';
  }
  _formActualizarVisibCondModal();
  _formActualizarVisibTipoModal();
}

function _formActualizarVisibCondModal() {
  const v = document.getElementById('frmCampoVisib').value;
  document.getElementById('frmCampoCondWrap').style.display = (v === 'cond') ? '' : 'none';
}

function _formActualizarVisibTipoModal() {
  const t = document.getElementById('frmCampoTipo').value;
  document.getElementById('frmCampoOpcionesWrap').style.display = TIPOS_CON_OPCIONES.has(t) ? '' : 'none';
  document.getElementById('frmCampoMaxWrap').style.display = (t === 'foto') ? '' : 'none';
}

function guardarCampoForm() {
  const tipo = document.getElementById('frmCampoTipo').value;
  const etiqueta = document.getElementById('frmCampoEtiqueta').value.trim();
  const codigo = document.getElementById('frmCampoCodigo').value.trim() || null;
  const obligatorio = document.getElementById('frmCampoOblig').checked;

  if (!etiqueta) { alert('La etiqueta es obligatoria'); return; }

  // Validar código único en la plantilla (excepto el actual)
  if (codigo) {
    const dup = _formEditor.campos.findIndex((c, i) => c.codigo === codigo && i !== _formCampoEditIdx);
    if (dup >= 0) { alert('Ya existe un campo con el código "' + codigo + '"'); return; }
  }

  // Construir config
  const config = {};
  if (TIPOS_CON_OPCIONES.has(tipo)) {
    const ops = document.getElementById('frmCampoOpciones').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!ops.length) { alert('Las opciones no pueden estar vacías'); return; }
    config.opciones = ops;
  }
  if (tipo === 'foto') {
    const max = parseInt(document.getElementById('frmCampoMax').value, 10);
    if (max && max > 0) config.max = max;
  }

  // Construir mostrar_si
  let mostrar_si = null;
  if (document.getElementById('frmCampoVisib').value === 'cond') {
    const cod = document.getElementById('frmCampoCondCodigo').value.trim();
    const valores = document.getElementById('frmCampoCondValores').value
      .split(',').map(s => s.trim()).filter(Boolean);
    if (!cod) { alert('Debes indicar el código del campo del que depende'); return; }
    if (!valores.length) { alert('Debes indicar al menos un valor'); return; }
    mostrar_si = { codigo: cod, valor_in: valores };
  }

  const campo = { codigo, tipo, etiqueta, obligatorio, mostrar_si, config };

  if (_formCampoEditIdx === -1) {
    _formEditor.campos.push(campo);
  } else {
    // preservar id si lo tiene
    const prev = _formEditor.campos[_formCampoEditIdx];
    _formEditor.campos[_formCampoEditIdx] = { ...campo, id: prev.id };
  }
  _formMarkDirty();
  _formRefreshLista();
  if (typeof closeModal === 'function') closeModal('mFormCampo');
  else document.getElementById('mFormCampo').style.display = 'none';
}

function removeCampoForm(idx) {
  const c = _formEditor.campos[idx];
  if (!confirm(`¿Eliminar el campo "${c.etiqueta}"?`)) return;
  _formEditor.campos.splice(idx, 1);
  _formMarkDirty();
  _formRefreshLista();
}

// ─── 5. GUARDADO CON VERSIONADO OPCIÓN A ────────────────────────
async function guardarPlantillaForm() {
  // Leer datos actuales del DOM
  const nombre = document.getElementById('frmPlantNombre').value.trim();
  const categoria = document.getElementById('frmPlantCategoria').value.trim() || null;
  const descripcion = document.getElementById('frmPlantDescripcion').value.trim() || null;
  const activa = document.getElementById('frmPlantActiva').checked;

  if (!nombre) { alert('El nombre es obligatorio'); return; }
  if (!_formEditor.campos.length) { alert('La plantilla debe tener al menos un campo'); return; }

  _formEditor.datos = { nombre, categoria, descripcion, activa };

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    if (_formEditor.id == null) {
      // ─── CASO 1: nueva plantilla ───────────────────────────
      const { data: nueva, error } = await sb.from('form_plantillas').insert({
        empresa_id: EMPRESA.id,
        nombre, categoria, descripcion,
        version: 1,
        activa,
        plantilla_padre_id: null,
        created_by: (typeof CU !== 'undefined' && CU?.id) ? CU.id : null
      }).select().single();
      if (error) throw error;

      const filas = _formEditor.campos.map((c, i) => ({
        plantilla_id: nueva.id,
        orden: (i + 1) * 10,
        codigo: c.codigo || null,
        tipo: c.tipo,
        etiqueta: c.etiqueta,
        obligatorio: !!c.obligatorio,
        mostrar_si: c.mostrar_si || null,
        config: c.config || {}
      }));
      const { error: eC } = await sb.from('form_plantilla_campos').insert(filas);
      if (eC) throw eC;

      if (typeof toast === 'function') toast('Plantilla creada', 'success');
    } else {
      // ─── CASO 2: edición → SIEMPRE crear v+1 (opción A) ───
      const versionAnterior = _formEditor.version;
      const padreId = _formEditor.plantilla_padre_id || _formEditor.id;

      // 2a. INSERT nueva versión
      const { data: nueva, error: eN } = await sb.from('form_plantillas').insert({
        empresa_id: EMPRESA.id,
        nombre, categoria, descripcion,
        version: versionAnterior + 1,
        activa,
        plantilla_padre_id: padreId,
        created_by: (typeof CU !== 'undefined' && CU?.id) ? CU.id : null
      }).select().single();
      if (eN) throw eN;

      // 2b. INSERT campos
      const filas = _formEditor.campos.map((c, i) => ({
        plantilla_id: nueva.id,
        orden: (i + 1) * 10,
        codigo: c.codigo || null,
        tipo: c.tipo,
        etiqueta: c.etiqueta,
        obligatorio: !!c.obligatorio,
        mostrar_si: c.mostrar_si || null,
        config: c.config || {}
      }));
      const { error: eC } = await sb.from('form_plantilla_campos').insert(filas);
      if (eC) throw eC;

      // 2c. Marcar versión anterior como inactiva
      const { error: eU } = await sb.from('form_plantillas')
        .update({ activa: false })
        .eq('id', _formEditor.id);
      if (eU) throw eU;

      if (typeof toast === 'function') toast(`Guardada como versión ${versionAnterior + 1}`, 'success');
    }

    _formEditor.dirty = false;
    if (_formSortable) { try { _formSortable.destroy(); } catch(e){} _formSortable = null; }
    await loadFormPlantillas();
  } catch (e) {
    console.error('[formularios] Error guardando:', e);
    if (typeof toast === 'function') toast('Error al guardar: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
  }
}

// ─── 6. EXPORTAR API GLOBAL ─────────────────────────────────────
window.loadFormPlantillas       = loadFormPlantillas;
window.renderFormPlantillas     = renderFormPlantillas;
window.nuevaPlantillaForm       = nuevaPlantillaForm;
window.editarPlantillaForm      = editarPlantillaForm;
window.duplicarPlantillaForm    = duplicarPlantillaForm;
window.toggleActivaPlantillaForm= toggleActivaPlantillaForm;
window.volverListadoForm        = volverListadoForm;
window.addCampoForm             = addCampoForm;
window.editCampoForm            = editCampoForm;
window.removeCampoForm          = removeCampoForm;
window.guardarCampoForm         = guardarCampoForm;
window.guardarPlantillaForm     = guardarPlantillaForm;
window._formActualizarVisibCondModal = _formActualizarVisibCondModal;
window._formActualizarVisibTipoModal = _formActualizarVisibTipoModal;
window._formMarkDirty           = _formMarkDirty;
