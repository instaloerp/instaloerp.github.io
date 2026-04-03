// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: Partes de Trabajo (Work Reports)
// Gestión completa: listado, creación, edición, firma digital, exportación
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
// VARIABLES GLOBALES
// ─────────────────────────────────────────────────────────────────────
let partesData = [];
let partesFiltrados = [];
let pt_edicion = null;              // ID del parte en edición
let pt_materiales = [];             // Array de materiales temporales
let pt_fotos = [];                  // Array de fotos temporales
let pt_acMouseOver = false;         // Para evitar cerrar dropdown de autocomplete
let pt_acTimer = null;              // Timer para debounce de búsqueda
let pt_checklist = [];              // Array de items del checklist

// ═══════════════════════════════════════════════════════════════════════
// CARGA Y RENDERIZADO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

async function loadPartes() {
  if (!EMPRESA || !EMPRESA.id) return;
  try {
    const { data } = await sb.from('partes_trabajo')
      .select('*')
      .eq('empresa_id', EMPRESA.id)
      .neq('estado', 'eliminado')
      .order('created_at', { ascending: false });

    partesData = data || [];
    partesFiltrados = [...partesData];
    renderPartes(partesData);
    // Poblar filtro de operarios
    const selFiltroUsr = document.getElementById('pt-filter-usuario');
    if (selFiltroUsr) {
      const usrs = typeof todosUsuarios !== 'undefined' ? todosUsuarios.filter(u => u.activo !== false) : [];
      selFiltroUsr.innerHTML = '<option value="">Todos los operarios</option>' +
        usrs.map(u => `<option value="${u.id}">${u.nombre||''} ${u.apellidos||''}</option>`).join('');
    }
  } catch (e) {
    console.error('Error cargando partes:', e);
    toast('Error al cargar partes', 'error');
  }
}

// Estados globales del parte (flujo de 3 fases)
const PT_ESTADOS = {
  programado:  { label:'Programado',  color:'#3B82F6', bg:'#EFF6FF',  ico:'📅' },
  en_curso:    { label:'En curso',    color:'#D97706', bg:'#FFFBEB',  ico:'🔧' },
  completado:  { label:'Completado',  color:'#059669', bg:'#ECFDF5',  ico:'✅' },
  revisado:    { label:'Revisado',    color:'#10B981', bg:'#D1FAE5',  ico:'👁️' },
  facturado:   { label:'Facturado',   color:'#8B5CF6', bg:'#F5F3FF',  ico:'🧾' },
  borrador:    { label:'Borrador',    color:'#9CA3AF', bg:'#F3F4F6',  ico:'✏️' },
  enviado:     { label:'Enviado',     color:'#3B82F6', bg:'#EFF6FF',  ico:'📤' },
};

function renderPartes(list) {
  // ─ Calcular KPIs
  const kpiTotal = partesData.length;
  const kpiHoras = partesData.reduce((s, p) => s + (parseFloat(p.horas) || 0), 0);
  const kpiProg = partesData.filter(p => p.estado === 'programado').length;
  const kpiPend = partesData.filter(p => p.estado === 'completado').length;
  const kpiMat = partesData.reduce((s, p) => {
    if (!p.materiales || !Array.isArray(p.materiales)) return s;
    return s + p.materiales.reduce((sm, m) => sm + (parseFloat(m.total) || 0), 0);
  }, 0);

  // ─ Actualizar elementos de KPI
  const el = id => document.getElementById(id);
  if (el('pt-kpi-total')) el('pt-kpi-total').textContent = kpiTotal;
  if (el('pt-kpi-horas')) el('pt-kpi-horas').textContent = kpiHoras.toFixed(1);
  if (el('pt-kpi-pendientes')) { el('pt-kpi-pendientes').textContent = kpiProg; }
  if (el('pt-kpi-material')) el('pt-kpi-material').textContent = kpiPend;

  // ─ Renderizar tabla
  const tbody = document.getElementById('ptTable');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(p => {
    const est = PT_ESTADOS[p.estado] || { label: p.estado || '—', color: '#6B7280', bg: '#F3F4F6', ico:'📝' };
    const hora_inicio = p.hora_inicio ? p.hora_inicio.substring(0, 5) : '—';
    const hora_fin = p.hora_fin ? p.hora_fin.substring(0, 5) : '—';
    const horas = (parseFloat(p.horas) || 0).toFixed(1);
    const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';

    return `<tr style="cursor:pointer;transition:background .2s" onmouseover="this.style.background='var(--gris-50)'" onmouseout="this.style.background=''" onclick="verDetalleParte(${p.id})">
      <td style="font-family:monospace;font-weight:700;font-size:12.5px;color:var(--azul)">${p.numero || '—'}</td>
      <td>${p.trabajo_titulo || '—'}</td>
      <td>${p.usuario_nombre || '—'}</td>
      <td style="font-size:12.5px">${fecha}</td>
      <td style="font-size:12.5px">${hora_inicio} - ${hora_fin}</td>
      <td style="text-align:center;font-weight:600">${horas}h</td>
      <td style="text-align:center">
        <span style="background:${est.bg};color:${est.color};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">${est.ico} ${est.label}</span>
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="verDetalleParte(${p.id})" title="Ver">👁️</button>
          <button class="btn btn-ghost btn-sm" onclick="editarParte(${p.id})" title="Editar">✏️</button>
        </div>
      </td>
    </tr>`;
  }).join('') :
  '<tr><td colspan="8"><div class="empty"><div class="ei">📝</div><h3>Sin partes de trabajo</h3><p>Crea el primero con el botón "+ Nuevo parte"</p></div></td></tr>';
}

// ═══════════════════════════════════════════════════════════════════════
// FILTRADO Y BÚSQUEDA
// ═══════════════════════════════════════════════════════════════════════

function filtrarPartes() {
  const q = (document.getElementById('pt-filter-texto')?.value || document.getElementById('ptSearch')?.value || '').toLowerCase();
  const estado = document.getElementById('pt-filter-estado')?.value || document.getElementById('ptEstado')?.value || '';
  const desde = document.getElementById('pt-filter-desde')?.value || document.getElementById('ptDesde')?.value || '';
  const hasta = document.getElementById('pt-filter-hasta')?.value || document.getElementById('ptHasta')?.value || '';
  const usuario_id = document.getElementById('pt-filter-usuario')?.value || document.getElementById('ptUsuario')?.value || '';
  const trabajo_id = document.getElementById('ptTrabajo')?.value || '';

  partesFiltrados = partesData.filter(p =>
    (!q || (p.numero || '').toLowerCase().includes(q) ||
            (p.usuario_nombre || '').toLowerCase().includes(q) ||
            (p.trabajo_titulo || '').toLowerCase().includes(q) ||
            (p.descripcion || '').toLowerCase().includes(q)) &&
    (!estado || p.estado === estado) &&
    (!desde || (p.fecha && p.fecha >= desde)) &&
    (!hasta || (p.fecha && p.fecha <= hasta)) &&
    (!usuario_id || p.usuario_id === usuario_id) &&
    (!trabajo_id || p.trabajo_id === parseInt(trabajo_id))
  );

  renderPartes(partesFiltrados);
}

// ═══════════════════════════════════════════════════════════════════════
// CREAR NUEVO PARTE - MODAL
// ═══════════════════════════════════════════════════════════════════════

function nuevoParteModal(preselObraId) {
  pt_edicion = null;
  pt_materiales = [];
  pt_fotos = [];

  // Poblar select de obras
  const selTr = document.getElementById('pt_trabajo');
  if (selTr) {
    selTr.innerHTML = '<option value="">— Selecciona obra —</option>' +
      (typeof trabajos !== 'undefined' ? trabajos : []).map(t => `<option value="${t.id}">${t.numero ? t.numero+' – ' : ''}${t.titulo}</option>`).join('');
    if (preselObraId) selTr.value = preselObraId;
  }

  // Poblar select de operario — todos los usuarios activos (admins pueden asignar a cualquiera)
  poblarSelectOperario();

  // Limpiar campos de texto
  ['pt_fecha', 'pt_inicio', 'pt_fin', 'pt_desc', 'pt_observaciones', 'pt_instrucciones', 'pt_pendientes', 'pt_direccion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  pt_checklist = [];

  // Prefijar fecha de hoy y horario por defecto
  const hoy = new Date().toISOString().split('T')[0];
  const elFecha = document.getElementById('pt_fecha');
  if (elFecha) elFecha.value = hoy;
  const elInicio = document.getElementById('pt_inicio');
  if (elInicio && !elInicio.value) elInicio.value = '08:00';
  const elFin = document.getElementById('pt_fin');
  if (elFin && !elFin.value) elFin.value = '14:00';

  document.getElementById('mParteTit').textContent = 'Nuevo Parte de Trabajo';
  window._pt_presupuesto_id = null;
  window._pt_presupuesto_numero = null;
  pt_renderChecklist();
  pt_renderMateriales();
  pt_renderFotos();
  limpiarFirma();
  initFirmaCanvas();
  openModal('mPartes');
}

// Abrir nuevo parte pre-seleccionando la obra (llamado desde ficha de obra)
function nuevoParteDesdeObra(obraId) {
  nuevoParteModal(obraId);
}

// Programar cita desde obra con datos del presupuesto
function programarCitaDesdeObra(obraId, presupuestoId, presupuestoNumero, clienteDireccion) {
  nuevoParteModal(obraId);
  // Pre-rellenar campos
  if (presupuestoNumero) {
    const instrEl = document.getElementById('pt_instrucciones');
    if (instrEl) instrEl.value = `Trabajo según presupuesto ${presupuestoNumero}`;
  }
  if (clienteDireccion) {
    const dirEl = document.getElementById('pt_direccion');
    if (dirEl) dirEl.value = clienteDireccion;
  }
  // Guardar referencia al presupuesto (se usará al guardar)
  window._pt_presupuesto_id = presupuestoId || null;
  window._pt_presupuesto_numero = presupuestoNumero || null;
}

// ═══════════════════════════════════════════════════════════════════════
// CHECKLIST
// ═══════════════════════════════════════════════════════════════════════

function pt_addCheckItem() {
  const input = document.getElementById('pt_checklist_new');
  const texto = input?.value?.trim();
  if (!texto) return;
  pt_checklist.push({ texto, done: false });
  input.value = '';
  pt_renderChecklist();
}

function pt_removeCheckItem(i) {
  pt_checklist.splice(i, 1);
  pt_renderChecklist();
}

function pt_toggleCheckItem(i) {
  if (pt_checklist[i]) pt_checklist[i].done = !pt_checklist[i].done;
  pt_renderChecklist();
}

function pt_renderChecklist() {
  const container = document.getElementById('pt_checklist_items');
  if (!container) return;
  container.innerHTML = pt_checklist.map((c, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:${c.done?'#ECFDF5':'white'};border:1px solid var(--gris-200);border-radius:6px">
      <input type="checkbox" ${c.done?'checked':''} onchange="pt_toggleCheckItem(${i})" style="cursor:pointer">
      <span style="flex:1;font-size:12.5px;${c.done?'text-decoration:line-through;color:var(--gris-400)':''}">${c.texto}</span>
      <button onclick="pt_removeCheckItem(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:12px;padding:0 4px">✕</button>
    </div>
  `).join('');
}

// Poblar select de operarios con todos los usuarios activos
function poblarSelectOperario(selVal) {
  const selUsr = document.getElementById('pt_usuario');
  if (!selUsr) return;
  const usuarios = typeof todosUsuarios !== 'undefined' ? todosUsuarios.filter(u => u.activo !== false) : [];
  if (usuarios.length > 0) {
    selUsr.innerHTML = usuarios.map(u => {
      const rolTag = u.rol === 'operario' ? ' 👷' : '';
      return `<option value="${u.id}">${u.nombre||''} ${u.apellidos||''}${rolTag}</option>`;
    }).join('');
    selUsr.value = selVal || CU?.id || '';
    selUsr.disabled = false;
  } else {
    selUsr.innerHTML = `<option value="${CU?.id||''}">${CP?.nombre||''} ${CP?.apellidos||''}</option>`;
    selUsr.disabled = true;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EDITAR PARTE
// ═══════════════════════════════════════════════════════════════════════

async function editarParte(id) {
  const parte = partesData.find(p => p.id === id);
  if (!parte) { toast('Parte no encontrado', 'error'); return; }

  pt_edicion = id;
  pt_materiales = parte.materiales ? [...parte.materiales] : [];
  pt_fotos = parte.fotos ? [...parte.fotos] : [];

  // Poblar selects
  const selTr = document.getElementById('pt_trabajo');
  if (selTr) {
    selTr.innerHTML = '<option value="">— Selecciona obra —</option>' +
      (typeof trabajos !== 'undefined' ? trabajos : []).map(t => `<option value="${t.id}">${t.numero ? t.numero+' – ' : ''}${t.titulo}</option>`).join('');
  }
  // Poblar select de operario con todos los usuarios
  poblarSelectOperario(parte.usuario_id);

  // Cargar datos en el formulario
  pt_checklist = parte.checklist ? [...parte.checklist] : [];
  window._pt_presupuesto_id = parte.presupuesto_id || null;
  window._pt_presupuesto_numero = parte.presupuesto_numero || null;
  setVal({
    pt_trabajo: parte.trabajo_id || '',
    pt_fecha: parte.fecha || '',
    pt_inicio: parte.hora_inicio || '',
    pt_fin: parte.hora_fin || '',
    pt_desc: parte.descripcion || '',
    pt_observaciones: parte.observaciones || '',
    pt_usuario: parte.usuario_id || '',
    pt_instrucciones: parte.instrucciones || '',
    pt_direccion: parte.direccion || '',
    pt_pendientes: parte.trabajos_pendientes || '',
  });

  document.getElementById('mParteTit').textContent = 'Editar Parte de Trabajo';
  pt_renderChecklist();
  pt_renderMateriales();
  pt_renderFotos();
  if (parte.firma_url) {
    document.getElementById('pt_canvas').style.display = 'none';
    document.getElementById('pt_firma_preview').innerHTML = `<img src="${parte.firma_url}" style="max-width:200px;border:1px solid var(--gris-200);border-radius:4px">`;
    document.getElementById('pt_firma_preview').style.display = 'block';
  } else {
    limpiarFirma();
    initFirmaCanvas();
  }

  openModal('mPartes');
}

// ═══════════════════════════════════════════════════════════════════════
// GESTIÓN DE MATERIALES EN MODAL
// ═══════════════════════════════════════════════════════════════════════

function pt_addMaterial() {
  pt_materiales.push({
    articulo_id: null,
    nombre: '',
    cantidad: 1,
    precio: 0,
    total: 0
  });
  pt_renderMateriales();
}

function pt_removeMaterial(i) {
  pt_materiales.splice(i, 1);
  pt_renderMateriales();
}

function pt_renderMateriales() {
  const container = document.getElementById('pt_mats');
  if (!container) return;

  if (pt_materiales.length === 0) {
    container.innerHTML = '<div style="color:var(--gris-400);text-align:center;padding:20px">Sin materiales añadidos</div>';
    return;
  }

  container.innerHTML = `<div style="overflow-x:auto">
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid var(--gris-200)">
          <th style="text-align:left;padding:8px;font-weight:700">Artículo</th>
          <th style="text-align:center;padding:8px;font-weight:700;width:80px">Cantidad</th>
          <th style="text-align:right;padding:8px;font-weight:700;width:100px">Precio unit.</th>
          <th style="text-align:right;padding:8px;font-weight:700;width:100px">Total</th>
          <th style="text-align:center;padding:8px;font-weight:700;width:40px"></th>
        </tr>
      </thead>
      <tbody>
        ${pt_materiales.map((m, i) => `<tr style="border-bottom:1px solid var(--gris-100)">
          <td style="padding:8px">
            <input type="text" id="pt_mat_art_${i}" value="${m.nombre}" placeholder="Buscar artículo..."
              style="width:100%;padding:6px;border:1px solid var(--gris-200);border-radius:4px;font-size:12px"
              oninput="pt_buscarArticulo(this.value, ${i})" />
            <div id="pt_ac_dropdown_${i}" style="position:absolute;background:white;border:1px solid var(--gris-200);border-radius:4px;max-height:200px;overflow-y:auto;width:200px;display:none;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.1)"></div>
          </td>
          <td style="padding:8px;text-align:center">
            <input type="number" value="${m.cantidad}" min="0.01" step="0.01"
              onchange="pt_materiales[${i}].cantidad=parseFloat(this.value)||1;pt_calcMaterial(${i});pt_renderMateriales()"
              style="width:100%;padding:6px;border:1px solid var(--gris-200);border-radius:4px;font-size:12px;text-align:center" />
          </td>
          <td style="padding:8px;text-align:right">
            <input type="number" value="${m.precio}" min="0" step="0.01"
              onchange="pt_materiales[${i}].precio=parseFloat(this.value)||0;pt_calcMaterial(${i});pt_renderMateriales()"
              style="width:100%;padding:6px;border:1px solid var(--gris-200);border-radius:4px;font-size:12px;text-align:right" />
          </td>
          <td style="padding:8px;text-align:right;font-weight:700">${fmtE(m.total || 0)}</td>
          <td style="padding:8px;text-align:center">
            <button onclick="pt_removeMaterial(${i})" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px">✕</button>
          </td>
        </tr>`).join('')}
      </tbody>
      <tfoot style="border-top:2px solid var(--gris-200)">
        <tr>
          <td colspan="3" style="padding:8px;text-align:right;font-weight:700">TOTAL MATERIALES:</td>
          <td style="padding:8px;text-align:right;font-weight:700;font-size:14px">${fmtE(pt_materiales.reduce((s, m) => s + (m.total || 0), 0))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

function pt_calcMaterial(i) {
  const m = pt_materiales[i];
  if (m) m.total = (parseFloat(m.cantidad) || 0) * (parseFloat(m.precio) || 0);
}

// ─ Autocomplete de artículos
async function pt_buscarArticulo(q, i) {
  const dropdown = document.getElementById(`pt_ac_dropdown_${i}`);
  if (!q || q.length < 2) { if (dropdown) dropdown.style.display = 'none'; return; }

  clearTimeout(pt_acTimer);
  pt_acTimer = setTimeout(() => {
    const resultados = articulos.filter(a =>
      (a.nombre || '').toLowerCase().includes(q.toLowerCase()) ||
      (a.codigo || '').toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8);

    if (resultados.length > 0 && dropdown) {
      dropdown.style.display = 'block';
      dropdown.innerHTML = resultados.map(a => `
        <div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--gris-100);transition:background .2s"
          onmouseover="this.style.background='var(--gris-50)'"
          onmouseout="this.style.background='white'"
          onmousedown="pt_seleccionarArticulo(${i}, ${a.id}, '${(a.nombre || '').replace(/'/g, "\\'")}', ${a.precio || 0})">
          <strong>${a.nombre}</strong><br>
          <small style="color:var(--gris-500)">${a.codigo || ''} · ${fmtE(a.precio || 0)}</small>
        </div>
      `).join('');
    } else if (dropdown) {
      dropdown.style.display = 'none';
    }
  }, 300);
}

function pt_seleccionarArticulo(i, art_id, nombre, precio) {
  pt_materiales[i].articulo_id = art_id;
  pt_materiales[i].nombre = nombre;
  pt_materiales[i].precio = precio;
  pt_calcMaterial(i);

  const dropdown = document.getElementById(`pt_ac_dropdown_${i}`);
  if (dropdown) dropdown.style.display = 'none';

  const input = document.getElementById(`pt_mat_art_${i}`);
  if (input) input.value = nombre;

  pt_renderMateriales();
}

// ═══════════════════════════════════════════════════════════════════════
// GESTIÓN DE FOTOS
// ═══════════════════════════════════════════════════════════════════════

function pt_addFoto(inputElement) {
  const files = inputElement.files;
  if (!files || files.length === 0) return;

  Array.from(files).forEach(f => {
    const reader = new FileReader();
    reader.onload = (e) => {
      pt_fotos.push({
        nombre: f.name,
        data: e.target.result,
        tamanio: f.size
      });
      pt_renderFotos();
    };
    reader.readAsDataURL(f);
  });

  inputElement.value = '';
}

function pt_removeFoto(i) {
  pt_fotos.splice(i, 1);
  pt_renderFotos();
}

function pt_renderFotos() {
  const container = document.getElementById('pt_fotos_list');
  if (!container) return;

  if (pt_fotos.length === 0) {
    container.innerHTML = '<div style="color:var(--gris-400);text-align:center;padding:20px">Sin fotos añadidas</div>';
    return;
  }

  container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px">
    ${pt_fotos.map((f, i) => `
      <div style="position:relative;border:1px solid var(--gris-200);border-radius:6px;overflow:hidden;background:var(--gris-50)">
        <img src="${f.data}" style="width:100%;height:100px;object-fit:cover" />
        <button onclick="pt_removeFoto(${i})"
          style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.7);color:white;border:none;border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">✕</button>
        <div style="font-size:10px;color:var(--gris-500);padding:2px 4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nombre}</div>
      </div>
    `).join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// FIRMA DIGITAL - CANVAS
// ═══════════════════════════════════════════════════════════════════════

let pt_canvas = null;
let pt_ctx = null;
let pt_isDrawing = false;

function initFirmaCanvas() {
  pt_canvas = document.getElementById('pt_canvas');
  if (!pt_canvas) return;

  pt_ctx = pt_canvas.getContext('2d');
  pt_canvas.width = 300;
  pt_canvas.height = 120;

  // Fondo blanco
  pt_ctx.fillStyle = '#FFFFFF';
  pt_ctx.fillRect(0, 0, pt_canvas.width, pt_canvas.height);
  pt_ctx.strokeStyle = '#E5E7EB';
  pt_ctx.lineWidth = 1;
  pt_ctx.strokeRect(0, 0, pt_canvas.width, pt_canvas.height);

  pt_canvas.onmousedown = (e) => {
    pt_isDrawing = true;
    const rect = pt_canvas.getBoundingClientRect();
    pt_ctx.beginPath();
    pt_ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  pt_canvas.onmousemove = (e) => {
    if (!pt_isDrawing) return;
    const rect = pt_canvas.getBoundingClientRect();
    pt_ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    pt_ctx.lineWidth = 2;
    pt_ctx.strokeStyle = '#000000';
    pt_ctx.lineCap = 'round';
    pt_ctx.lineJoin = 'round';
    pt_ctx.stroke();
  };

  pt_canvas.onmouseup = () => pt_isDrawing = false;
  pt_canvas.onmouseout = () => pt_isDrawing = false;

  // Touch support para móvil
  pt_canvas.ontouchstart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = pt_canvas.getBoundingClientRect();
    pt_isDrawing = true;
    pt_ctx.beginPath();
    pt_ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
  };

  pt_canvas.ontouchmove = (e) => {
    if (!pt_isDrawing) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = pt_canvas.getBoundingClientRect();
    pt_ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    pt_ctx.lineWidth = 2;
    pt_ctx.strokeStyle = '#000000';
    pt_ctx.lineCap = 'round';
    pt_ctx.lineJoin = 'round';
    pt_ctx.stroke();
  };

  pt_canvas.ontouchend = () => pt_isDrawing = false;
}

function limpiarFirma() {
  if (pt_canvas) {
    pt_ctx.fillStyle = '#FFFFFF';
    pt_ctx.fillRect(0, 0, pt_canvas.width, pt_canvas.height);
    pt_ctx.strokeStyle = '#E5E7EB';
    pt_ctx.lineWidth = 1;
    pt_ctx.strokeRect(0, 0, pt_canvas.width, pt_canvas.height);
  }
  const preview = document.getElementById('pt_firma_preview');
  if (preview) {
    preview.innerHTML = '';
    preview.style.display = 'none';
  }
  if (document.getElementById('pt_canvas')) {
    document.getElementById('pt_canvas').style.display = 'block';
  }
}

function guardarFirma() {
  if (!pt_canvas) return null;
  const isEmpty = !pt_ctx.getImageData(0, 0, pt_canvas.width, pt_canvas.height).data.some(p => p !== 0 && p !== 255);
  if (isEmpty) return null;
  return pt_canvas.toDataURL('image/png');
}

// ═══════════════════════════════════════════════════════════════════════
// GUARDAR PARTE - BD
// ═══════════════════════════════════════════════════════════════════════

async function guardarParte(estado = 'borrador') {
  // Validar campos obligatorios
  const trabajo_id = parseInt(v('pt_trabajo')) || null;
  const fecha = v('pt_fecha');
  const hora_inicio = v('pt_inicio');
  const hora_fin = v('pt_fin');

  if (!trabajo_id) { toast('Selecciona una obra', 'error'); return; }
  if (!fecha) { toast('Indica la fecha', 'error'); return; }
  if (!hora_inicio) { toast('Indica la hora de inicio', 'error'); return; }
  if (!hora_fin) { toast('Indica la hora de fin', 'error'); return; }

  // Calcular horas
  const ini = new Date(`2000-01-01T${hora_inicio}`);
  const fin = new Date(`2000-01-01T${hora_fin}`);
  const horas = Math.max(0, (fin - ini) / 3600000);

  // Obtener info de la obra
  const trabajo = trabajos.find(t => t.id === trabajo_id);
  const trabajo_titulo = trabajo?.titulo || '';

  // Información del operario seleccionado
  const selUsr = document.getElementById('pt_usuario');
  const usuario_id = selUsr?.value || CU?.id || null;
  const selOption = selUsr?.options[selUsr.selectedIndex];
  const usuario_nombre = selOption ? selOption.textContent.replace(/👷|🖥️/g,'').trim() : (CP?.nombre || '');

  // Materiales
  const materiales = pt_materiales.filter(m => m.articulo_id && m.cantidad > 0);

  // Fotos: subir a Supabase Storage
  let fotos_urls = [];
  for (const foto of pt_fotos) {
    if (foto.data && foto.data.startsWith('data:')) {
      // Es una foto nueva en base64
      try {
        const blob = await (await fetch(foto.data)).blob();
        const filename = `${EMPRESA.id}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
        const { error } = await sb.storage.from('fotos-partes').upload(filename, blob);
        if (!error) {
          const { data } = sb.storage.from('fotos-partes').getPublicUrl(filename);
          fotos_urls.push(data.publicUrl);
        }
      } catch (e) {
        console.error('Error subiendo foto:', e);
      }
    } else if (typeof foto === 'string') {
      // Es una URL que ya estaba en la BD
      fotos_urls.push(foto);
    }
  }

  // Firma
  let firma_url = null;
  const firma_data = guardarFirma();
  if (firma_data) {
    try {
      const blob = await (await fetch(firma_data)).blob();
      const filename = `${EMPRESA.id}/${Date.now()}_firma.png`;
      const { error } = await sb.storage.from('fotos-partes').upload(filename, blob);
      if (!error) {
        const { data } = sb.storage.from('fotos-partes').getPublicUrl(filename);
        firma_url = data.publicUrl;
      }
    } catch (e) {
      console.error('Error subiendo firma:', e);
    }
  }

  // Preparar payload
  const payload = {
    empresa_id: EMPRESA.id,
    trabajo_id,
    trabajo_titulo,
    usuario_id,
    usuario_nombre,
    fecha,
    hora_inicio,
    hora_fin,
    horas: horas.toFixed(2),
    descripcion: v('pt_desc'),
    materiales: materiales.length > 0 ? materiales : null,
    fotos: fotos_urls.length > 0 ? fotos_urls : null,
    firma_url,
    estado,
    observaciones: v('pt_observaciones') || null,
    // Nuevos campos fase programación
    instrucciones: v('pt_instrucciones') || null,
    checklist: pt_checklist.length > 0 ? pt_checklist : null,
    direccion: v('pt_direccion') || null,
    trabajos_pendientes: v('pt_pendientes') || null,
    presupuesto_id: window._pt_presupuesto_id || null,
    presupuesto_numero: window._pt_presupuesto_numero || null,
  };
  // Si se programa, guardar quién programó
  if (estado === 'programado' && !pt_edicion) {
    payload.programado_por = CU?.id || null;
    payload.programado_por_nombre = CP?.nombre || '';
  }

  // Insertar o actualizar
  let error;
  if (pt_edicion) {
    // Actualizar
    const numero = partesData.find(p => p.id === pt_edicion)?.numero;
    ({ error } = await sb.from('partes_trabajo')
      .update(payload)
      .eq('id', pt_edicion));
    if (!error) toast(`Parte ${numero} actualizado ✓`, 'success');
  } else {
    // Crear nuevo - generar número
    const numero = `PRT-${new Date().getFullYear()}-${String(partesData.length + 1).padStart(4, '0')}`;
    payload.numero = numero;
    ({ error } = await sb.from('partes_trabajo').insert(payload));
    if (!error) toast(`Parte ${numero} creado ✓`, 'success');
  }

  if (error) {
    toast('Error: ' + error.message, 'error');
    return;
  }

  closeModal('mPartes');
  await loadPartes();
}

// ═══════════════════════════════════════════════════════════════════════
// CAMBIAR ESTADO
// ═══════════════════════════════════════════════════════════════════════

async function cambiarEstadoParte(id, estado) {
  const updateObj = { estado };
  const parte = partesData.find(p => p.id === id);

  // Si se marca como revisado, guardar quién revisó
  if (estado === 'revisado') {
    updateObj.revisado_por = CU?.id || null;
    updateObj.revisado_por_nombre = CP?.nombre || '';
    updateObj.revisado_at = new Date().toISOString();
  }
  if (estado === 'completado') {
    updateObj.completado_at = new Date().toISOString();
  }

  const { error } = await sb.from('partes_trabajo').update(updateObj).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  if (parte) Object.assign(parte, updateObj);

  // ── AUTOMATIZACIONES POST-CAMBIO ──
  if (parte) {
    const fechaCorta = new Date().toLocaleDateString('es-ES');

    // Cuando operario completa → tarea para el admin que programó
    if (estado === 'completado') {
      const responsableId = parte.programado_por || null;
      const responsableNombre = parte.programado_por_nombre || 'Administración';
      // Tarea: revisar parte
      try {
        await sb.from('tareas_obra').insert({
          empresa_id: EMPRESA.id,
          trabajo_id: parte.trabajo_id || null,
          texto: `📝 Parte ${parte.numero} completado por ${parte.usuario_nombre||'operario'} el ${fechaCorta} — Pendiente de revisión`,
          estado: 'pendiente',
          prioridad: 'alta',
          responsable_id: responsableId,
          responsable_nombre: responsableNombre,
          creado_por: CU?.id || null,
          creado_por_nombre: CP?.nombre || 'Sistema',
        });
      } catch(e) { console.error('Error creando tarea revisión:', e); }

      // Si hay trabajos pendientes → tarea extra
      if (parte.trabajos_pendientes) {
        try {
          await sb.from('tareas_obra').insert({
            empresa_id: EMPRESA.id,
            trabajo_id: parte.trabajo_id || null,
            texto: `⚠️ Trabajos pendientes en parte ${parte.numero}: ${parte.trabajos_pendientes.substring(0,100)}${parte.trabajos_pendientes.length>100?'...':''}`,
            estado: 'pendiente',
            prioridad: 'urgente',
            responsable_id: responsableId,
            responsable_nombre: responsableNombre,
            creado_por: null,
            creado_por_nombre: 'Sistema — Parte completado',
          });
        } catch(e) { console.error('Error creando tarea pendientes:', e); }
      }

      // Registro en audit_log de la obra
      if (parte.trabajo_id) {
        registrarActividadObra(parte.trabajo_id, 'Parte completado', `✅ ${parte.numero} completado por ${parte.usuario_nombre||'—'} · ${parseFloat(parte.horas||0).toFixed(1)}h${parte.trabajos_pendientes ? ' ⚠️ Con trabajos pendientes' : ''}`);
      }
    }

    // Cuando admin revisa → registro
    if (estado === 'revisado' && parte.trabajo_id) {
      registrarActividadObra(parte.trabajo_id, 'Parte revisado', `👁️ ${parte.numero} revisado por ${CP?.nombre||'—'}`);
    }
  }

  const estInfo = PT_ESTADOS[estado] || {};
  toast(`${estInfo.ico||''} ${estInfo.label||estado} ✓`, 'success');
  renderPartes(partesFiltrados.length ? partesFiltrados : partesData);
}

async function avanzarEstadoParte(id, nuevoEstado) {
  await cambiarEstadoParte(id, nuevoEstado);
  closeModal('dtlPartes');
  // Si ahora está completado, reabrir para que el admin vea el resultado
  if (nuevoEstado === 'revisado' || nuevoEstado === 'completado') {
    setTimeout(() => verDetalleParte(id), 300);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// VER DETALLE
// ═══════════════════════════════════════════════════════════════════════

function verDetalleParte(id) {
  const parte = partesData.find(p => p.id === id);
  if (!parte) return;

  const hora_inicio = parte.hora_inicio ? parte.hora_inicio.substring(0, 5) : '—';
  const hora_fin = parte.hora_fin ? parte.hora_fin.substring(0, 5) : '—';
  const horas = (parseFloat(parte.horas) || 0).toFixed(1);
  const fecha = parte.fecha ? new Date(parte.fecha).toLocaleDateString('es-ES') : '—';
  const est = PT_ESTADOS[parte.estado] || PT_ESTADOS.borrador;

  // Materiales
  let matHTML = '';
  if (parte.materiales && Array.isArray(parte.materiales) && parte.materiales.length > 0) {
    matHTML = `<div style="margin:16px 0">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">Materiales utilizados</h4>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead>
          <tr style="background:var(--gris-50);border-bottom:1px solid var(--gris-200)">
            <th style="text-align:left;padding:8px">Artículo</th>
            <th style="text-align:center;padding:8px">Cantidad</th>
            <th style="text-align:right;padding:8px">Precio</th>
            <th style="text-align:right;padding:8px">Total</th>
          </tr>
        </thead>
        <tbody>
          ${parte.materiales.map(m => `<tr style="border-bottom:1px solid var(--gris-100)">
            <td style="padding:8px">${m.nombre || '—'}</td>
            <td style="padding:8px;text-align:center">${(parseFloat(m.cantidad) || 0).toFixed(2)}</td>
            <td style="padding:8px;text-align:right">${fmtE(m.precio || 0)}</td>
            <td style="padding:8px;text-align:right;font-weight:700">${fmtE(m.total || 0)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot style="border-top:2px solid var(--gris-200)">
          <tr>
            <td colspan="3" style="padding:8px;text-align:right;font-weight:700">TOTAL:</td>
            <td style="padding:8px;text-align:right;font-weight:700;font-size:13px">${fmtE(parte.materiales.reduce((s, m) => s + (m.total || 0), 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }

  // Fotos
  let fotosHTML = '';
  if (parte.fotos && Array.isArray(parte.fotos) && parte.fotos.length > 0) {
    fotosHTML = `<div style="margin:16px 0">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">Fotos</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px">
        ${parte.fotos.map(f => `<img src="${f}" style="width:100%;height:80px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="window.open('${f}')" title="Clic para ampliar" />`).join('')}
      </div>
    </div>`;
  }

  // Firma
  let firmaHTML = '';
  if (parte.firma_url) {
    firmaHTML = `<div style="margin:16px 0">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">Firma</h4>
      <img src="${parte.firma_url}" style="max-width:200px;border:1px solid var(--gris-200);border-radius:4px" />
    </div>`;
  }

  // Checklist
  let checkHTML = '';
  if (parte.checklist && Array.isArray(parte.checklist) && parte.checklist.length > 0) {
    checkHTML = `<div style="margin:16px 0">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">✅ Checklist</h4>
      ${parte.checklist.map(c => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0">
        <span style="font-size:14px">${c.done ? '☑️' : '⬜'}</span>
        <span style="font-size:12.5px;${c.done?'text-decoration:line-through;color:var(--gris-400)':''}">${c.texto||''}</span>
      </div>`).join('')}
    </div>`;
  }

  // Siguiente acción según estado
  const nextAction = {
    programado: {label:'🔧 Iniciar trabajo', estado:'en_curso', color:'var(--acento)'},
    en_curso:   {label:'✅ Marcar completado', estado:'completado', color:'var(--verde)'},
    completado: {label:'👁️ Aprobar / Revisar', estado:'revisado', color:'#10B981'},
    revisado:   {label:'🧾 Marcar facturado', estado:'facturado', color:'#8B5CF6'},
  };
  const next = nextAction[parte.estado];

  const html = `<div style="padding:20px;max-height:70vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div>
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:700">${parte.numero}</h2>
        <p style="margin:0;color:var(--gris-600);font-size:13px">${parte.trabajo_titulo||'Sin obra'}</p>
        ${parte.presupuesto_numero ? `<p style="margin:4px 0 0;font-size:11px;color:var(--azul)">📋 Presupuesto: ${parte.presupuesto_numero}</p>` : ''}
      </div>
      <span style="background:${est.bg};color:${est.color};padding:6px 12px;border-radius:16px;font-size:11px;font-weight:700">
        ${est.ico} ${est.label}
      </span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;padding:12px;background:var(--gris-50);border-radius:8px">
      <div>
        <div style="font-size:11px;color:var(--gris-600);font-weight:700;text-transform:uppercase">Fecha</div>
        <div style="font-size:14px;font-weight:600">${fecha}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--gris-600);font-weight:700;text-transform:uppercase">Horario</div>
        <div style="font-size:14px;font-weight:600">${hora_inicio} - ${hora_fin}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--gris-600);font-weight:700;text-transform:uppercase">Horas</div>
        <div style="font-size:14px;font-weight:600">${horas}h</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--gris-600);font-weight:700;text-transform:uppercase">Operario</div>
        <div style="font-size:14px;font-weight:600">${parte.usuario_nombre || '—'}</div>
      </div>
      ${parte.direccion ? `<div style="grid-column:1/-1">
        <div style="font-size:11px;color:var(--gris-600);font-weight:700;text-transform:uppercase">Dirección</div>
        <div style="font-size:13px;font-weight:600">${parte.direccion}</div>
      </div>` : ''}
    </div>

    ${parte.instrucciones ? `<div style="margin:16px 0;padding:12px;background:#EFF6FF;border-left:3px solid var(--azul);border-radius:4px">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">📋 Instrucciones del trabajo</h4>
      <p style="margin:0;font-size:13px;line-height:1.5;white-space:pre-wrap">${parte.instrucciones}</p>
    </div>` : ''}

    ${checkHTML}

    ${parte.descripcion ? `<div style="margin:16px 0;padding:12px;background:var(--gris-50);border-left:3px solid var(--verde);border-radius:4px">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">🔧 Trabajo realizado</h4>
      <p style="margin:0;font-size:13px;line-height:1.5;white-space:pre-wrap">${parte.descripcion}</p>
    </div>` : ''}

    ${matHTML}
    ${fotosHTML}
    ${firmaHTML}

    ${parte.trabajos_pendientes ? `<div style="margin:16px 0;padding:12px;background:#FFF8DC;border-left:3px solid var(--acento);border-radius:4px">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">⚠️ Trabajos pendientes</h4>
      <p style="margin:0;font-size:13px;line-height:1.5;white-space:pre-wrap">${parte.trabajos_pendientes}</p>
    </div>` : ''}

    ${parte.observaciones ? `<div style="margin:16px 0;padding:12px;background:var(--gris-50);border-left:3px solid var(--gris-400);border-radius:4px">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">📝 Observaciones</h4>
      <p style="margin:0;font-size:13px;line-height:1.5;white-space:pre-wrap">${parte.observaciones}</p>
    </div>` : ''}

    ${parte.revision_notas ? `<div style="margin:16px 0;padding:12px;background:#ECFDF5;border-left:3px solid #10B981;border-radius:4px">
      <h4 style="margin:0 0 8px;font-size:13px;font-weight:700">👁️ Notas de revisión</h4>
      <p style="margin:0;font-size:13px;line-height:1.5;white-space:pre-wrap">${parte.revision_notas}</p>
      ${parte.revisado_por_nombre ? `<div style="font-size:10.5px;color:var(--gris-400);margin-top:6px">Revisado por ${parte.revisado_por_nombre} · ${parte.revisado_at ? new Date(parte.revisado_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</div>` : ''}
    </div>` : ''}

    <div style="margin:20px 0;padding-top:20px;border-top:1px solid var(--gris-200);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${next ? `<button onclick="avanzarEstadoParte(${parte.id},'${next.estado}')" class="btn btn-sm" style="background:${next.color};color:#fff;font-weight:700">${next.label}</button>` : ''}
      <button onclick="editarParte(${parte.id});closeModal('dtlPartes')" class="btn btn-secondary btn-sm">✏️ Editar</button>
      <button onclick="exportarPartePDF(${parte.id})" class="btn btn-ghost btn-sm">📄 PDF</button>

      ${parte.estado !== 'facturado' ? `
        <select onchange="if(this.value)cambiarEstadoParte(${parte.id},this.value);closeModal('dtlPartes')" style="padding:6px 10px;border:1px solid var(--gris-300);border-radius:6px;font-size:12px;cursor:pointer;margin-left:auto">
          <option value="">Estado...</option>
          ${Object.keys(PT_ESTADOS).filter(e => e !== parte.estado).map(e => `<option value="${e}">${PT_ESTADOS[e].ico} ${PT_ESTADOS[e].label}</option>`).join('')}
        </select>
      ` : ''}
    </div>
  </div>`;

  document.getElementById('dtlPartesContent').innerHTML = html;
  openModal('dtlPartes');
}

// ═══════════════════════════════════════════════════════════════════════
// ELIMINAR
// ═══════════════════════════════════════════════════════════════════════

async function delParte(id) {
  const parte = partesData.find(p => p.id === id);
  if (!parte) return;
  if (!confirm(`¿Eliminar el parte ${parte.numero}?`)) return;

  const { error } = await sb.from('partes_trabajo').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  partesData = partesData.filter(p => p.id !== id);
  partesFiltrados = partesFiltrados.filter(p => p.id !== id);
  renderPartes(partesFiltrados.length ? partesFiltrados : partesData);
  toast('Eliminado ✓', 'info');
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTAR A EXCEL
// ═══════════════════════════════════════════════════════════════════════

function exportPartes() {
  if (partesFiltrados.length === 0) { toast('Sin datos para exportar', 'info'); return; }

  // Crear CSV
  let csv = 'NÚMERO,OBRA,USUARIO,FECHA,INICIO,FIN,HORAS,ESTADO,DESCRIPCIÓN,MATERIALES TOTAL\n';

  partesFiltrados.forEach(p => {
    const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : '—';
    const hora_inicio = p.hora_inicio ? p.hora_inicio.substring(0, 5) : '—';
    const hora_fin = p.hora_fin ? p.hora_fin.substring(0, 5) : '—';
    const horas = (parseFloat(p.horas) || 0).toFixed(1);
    const matTotal = p.materiales ? p.materiales.reduce((s, m) => s + (m.total || 0), 0) : 0;
    const desc = (p.descripcion || '').replace(/"/g, '""').substring(0, 100);

    csv += `"${p.numero || ''}","${p.trabajo_titulo || ''}","${p.usuario_nombre || ''}","${fecha}","${hora_inicio}","${hora_fin}","${horas}","${p.estado}","${desc}","${matTotal.toFixed(2)}"\n`;
  });

  // Descargar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `partes_trabajo_${new Date().getTime()}.csv`);
  link.click();

  toast('Exportado ✓', 'success');
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTAR PARTE A PDF (versión simplificada)
// ═══════════════════════════════════════════════════════════════════════

async function exportarPartePDF(id) {
  const parte = partesData.find(p => p.id === id);
  if (!parte) return;

  try {
    // Aquí irería integración con librería PDF (ej: jsPDF + html2canvas)
    // Por ahora, abrimos en nueva ventana para imprimir
    const contenido = document.getElementById('dtlPartesContent')?.innerHTML || '';
    const ventana = window.open('', 'parte_pdf');
    ventana.document.write(`
      <html><head>
        <title>Parte ${parte.numero}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; }
          @media print { body { margin: 0; } }
        </style>
      </head><body>
        <h2>Parte de Trabajo: ${parte.numero}</h2>
        <p><strong>Obra:</strong> ${parte.trabajo_titulo}</p>
        <p><strong>Usuario:</strong> ${parte.usuario_nombre}</p>
        <p><strong>Fecha:</strong> ${parte.fecha}</p>
        <p><strong>Horas:</strong> ${parte.horas}</p>
        ${contenido}
      </body></html>
    `);
    ventana.document.close();
    ventana.print();
  } catch (e) {
    toast('Error al exportar', 'error');
  }
}
