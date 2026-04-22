// ═══════════════════════════════════════════════
//  FICHA DEL OPERARIO — Gestión integral de empleados
// ═══════════════════════════════════════════════

let _empFichaUser = null;    // usuario activo en ficha
let _empDocs = [];           // documentos del empleado
let _empFichajes = [];       // fichajes recientes
let _empAusencias = [];      // ausencias
let _empTab = 'datos';       // pestaña activa

const _EMP_DOC_CATEGORIAS = [
  { clave: 'nomina', nombre: 'Nómina', emoji: '💰', color: '#059669' },
  { clave: 'contrato', nombre: 'Contrato', emoji: '📑', color: '#2563EB' },
  { clave: 'curso', nombre: 'Curso / Formación', emoji: '🎓', color: '#7C3AED' },
  { clave: 'prl', nombre: 'PRL / Prevención', emoji: '⛑️', color: '#DC2626' },
  { clave: 'epi', nombre: 'EPI entregado', emoji: '🦺', color: '#D97706' },
  { clave: 'herramienta', nombre: 'Herramienta asignada', emoji: '🔧', color: '#0891B2' },
  { clave: 'certificado', nombre: 'Certificado', emoji: '📜', color: '#10B981' },
  { clave: 'otro', nombre: 'Otro documento', emoji: '📎', color: '#6B7280' },
];

// La lista de usuarios se gestiona en usuarios.js (loadUsuarios)
// Este módulo solo gestiona la vista ficha dentro de page-usuarios

// ═══════════════════════════════════════════════
//  ABRIR FICHA DE EMPLEADO
// ═══════════════════════════════════════════════
async function _empAbrirFicha(userId) {
  // Usar datos ya cargados de todosUsuarios si están disponibles
  let perfil = (typeof todosUsuarios !== 'undefined') ? todosUsuarios.find(u => u.id === userId) : null;
  if (!perfil) {
    const { data } = await sb.from('perfiles').select('*').eq('id', userId).single();
    perfil = data;
  }
  if (!perfil) { toast('Empleado no encontrado', 'error'); return; }
  _empFichaUser = perfil;

  // Cargar datos en paralelo
  const anio = new Date().getFullYear();
  const [docsRes, fichajesRes, ausRes] = await Promise.all([
    sb.from('documentos_empleado').select('*').eq('empleado_id', userId).eq('empresa_id', EMPRESA.id).order('created_at', { ascending: false }),
    sb.from('fichajes').select('*').eq('usuario_id', userId).eq('empresa_id', EMPRESA.id).gte('fecha', anio+'-01-01').order('fecha', { ascending: false }).limit(30),
    sb.from('ausencias').select('*').eq('usuario_id', userId).eq('empresa_id', EMPRESA.id).order('fecha_inicio', { ascending: false }),
  ]);
  _empDocs = docsRes.data || [];
  _empFichajes = fichajesRes.data || [];
  _empAusencias = ausRes.data || [];

  // Ocultar lista, mostrar ficha
  document.getElementById('usrVista-lista').style.display = 'none';
  const fichaEl = document.getElementById('usrVista-ficha');
  fichaEl.style.display = '';
  _empTab = 'datos';
  _empRenderFicha();
}

function _empVolverLista() {
  document.getElementById('usrVista-lista').style.display = '';
  document.getElementById('usrVista-ficha').style.display = 'none';
  _empFichaUser = null;
  // Recargar lista por si se editó algo
  if (typeof loadUsuarios === 'function') loadUsuarios();
}

// ═══════════════════════════════════════════════
//  RENDER FICHA
// ═══════════════════════════════════════════════
function _empRenderFicha() {
  const u = _empFichaUser;
  if (!u) return;
  const fichaEl = document.getElementById('usrVista-ficha');
  if (!fichaEl) return;

  const ROL_INFO = {
    admin: { label:'Administrador', ico:'⭐', color:'#D97706', bg:'#FFFBEB' },
    oficina: { label:'Oficina', ico:'🖥️', color:'#2563EB', bg:'#EFF6FF' },
    almacen: { label:'Almacén', ico:'📦', color:'#7C3AED', bg:'#F5F3FF' },
    operario: { label:'Operario', ico:'👷', color:'#059669', bg:'#ECFDF5' },
    comercial: { label:'Comercial', ico:'💼', color:'#0891B2', bg:'#ECFEFF' },
  };
  const AVC = ['#1B4FD8','#16A34A','#D97706','#DC2626','#7C3AED','#0891B2'];
  const rk = u.es_superadmin ? 'admin' : (u.rol || 'operario');
  const ri = ROL_INFO[rk] || ROL_INFO.operario;
  const bgAvatar = u.avatar_url ? 'transparent' : AVC[(u.nombre||'').charCodeAt(0)%AVC.length];

  const anio = new Date().getFullYear();

  // Contar por pestaña
  const nDocs = _empDocs.length;
  const nFichajes = _empFichajes.length;
  const nAusencias = _empAusencias.length;
  // Horas trabajadas este mes
  const mesActual = new Date().toISOString().slice(0,7);
  const fichajesMes = _empFichajes.filter(f => f.fecha?.startsWith(mesActual));
  const horasMes = fichajesMes.reduce((s,f) => s + (f.horas_total || 0), 0);

  const tabs = [
    { id: 'datos', emoji: '👤', label: 'Datos', count: '' },
    { id: 'documentos', emoji: '📁', label: 'Documentos', count: nDocs },
    { id: 'fichajes', emoji: '⏱️', label: 'Fichajes', count: horasMes.toFixed(1)+'h' },
    { id: 'permisos', emoji: '📄', label: 'Permisos', count: nAusencias },
  ];

  fichaEl.innerHTML = `
    <!-- Cabecera -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="_empVolverLista()" style="padding:4px 10px">← Volver</button>
      <div style="width:52px;height:52px;border-radius:50%;background:${bgAvatar};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden;border:2px solid var(--gris-200)">
        ${u.avatar_url ? '<img src="'+u.avatar_url+'" style="width:100%;height:100%;object-fit:cover">' : (u.nombre||'?')[0].toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <h2 style="font-size:17px;font-weight:800;margin:0">${u.nombre || ''} ${u.apellidos || ''}</h2>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span style="background:${ri.bg};color:${ri.color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${ri.ico} ${ri.label}</span>
          <span style="font-size:11px;color:var(--gris-400)">${u.email || ''}</span>
          ${u.telefono ? '<span style="font-size:11px;color:var(--gris-400)">· 📱 '+u.telefono+'</span>' : ''}
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="editUsuario('${u.id}')">✏️ Editar</button>
    </div>

    <!-- Pestañas KPI -->
    <div style="display:grid;grid-template-columns:repeat(${tabs.length},1fr);gap:8px;margin-bottom:16px">
      ${tabs.map(t => {
        const active = t.id === _empTab;
        return '<div class="card" onclick="_empSetTab(\''+t.id+'\')" style="padding:12px;cursor:pointer;text-align:center;'+(active?'border:2px solid var(--azul);background:var(--azul-light)':'border:2px solid transparent')+';transition:all .15s">'
          + '<div style="font-size:18px;margin-bottom:2px">'+t.emoji+'</div>'
          + '<div style="font-size:20px;font-weight:800;color:'+(active?'var(--azul)':'var(--gris-700)')+'">'+t.count+'</div>'
          + '<div style="font-size:10px;font-weight:600;color:var(--gris-500);text-transform:uppercase">'+t.label+'</div>'
          + '</div>';
      }).join('')}
    </div>

    <!-- Contenido pestaña -->
    <div id="empTabContent"></div>
  `;

  _empRenderTab();
}

function _empSetTab(tab) {
  _empTab = tab;
  _empRenderFicha();
}

// ═══════════════════════════════════════════════
//  RENDER PESTAÑAS
// ═══════════════════════════════════════════════
function _empRenderTab() {
  const c = document.getElementById('empTabContent');
  if (!c) return;
  if (_empTab === 'datos') _empRenderDatos(c);
  else if (_empTab === 'documentos') _empRenderDocumentos(c);
  else if (_empTab === 'fichajes') _empRenderFichajes(c);
  else if (_empTab === 'permisos') _empRenderPermisos(c);
}

// — DATOS PERSONALES —
function _empRenderDatos(c) {
  const u = _empFichaUser;
  const campo = (label, val) => '<div style="margin-bottom:12px"><div style="font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;margin-bottom:2px">'+label+'</div><div style="font-size:13px;color:var(--gris-700)">'+(val||'—')+'</div></div>';

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gris-600);margin-bottom:12px">Datos personales</div>
        ${campo('Nombre completo', (u.nombre||'')+' '+(u.apellidos||''))}
        ${campo('Email', u.email)}
        ${campo('Teléfono', u.telefono)}
        ${campo('DNI / NIE', u.dni)}
        ${campo('Fecha alta', u.fecha_alta ? new Date(u.fecha_alta).toLocaleDateString('es-ES') : null)}
      </div>
      <div class="card" style="padding:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gris-600);margin-bottom:12px">Datos laborales</div>
        ${campo('Rol', u.rol || 'operario')}
        ${campo('Estado', u.activo !== false ? '✅ Activo' : '❌ Inactivo')}
        ${campo('Disponible para partes', u.disponible_partes ? 'Sí' : 'No')}
        ${campo('Convenio', 'Siderometal Lugo')}
        ${campo('Jornada', 'L-V 8:30-16:30 · 1768h/año')}
      </div>
    </div>
  `;
}

// — DOCUMENTOS —
function _empRenderDocumentos(c) {
  const u = _empFichaUser;
  // Agrupar por categoría
  const porCat = {};
  _EMP_DOC_CATEGORIAS.forEach(cat => { porCat[cat.clave] = []; });
  _empDocs.forEach(d => {
    const k = d.categoria || 'otro';
    if (!porCat[k]) porCat[k] = [];
    porCat[k].push(d);
  });

  let docsHtml = '';
  _EMP_DOC_CATEGORIAS.forEach(cat => {
    const docs = porCat[cat.clave] || [];
    docsHtml += '<div style="margin-bottom:16px">';
    docsHtml += '<div style="font-size:11px;font-weight:700;color:'+cat.color+';text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:4px">'+cat.emoji+' '+cat.nombre+' <span style="color:var(--gris-400);font-weight:500">('+docs.length+')</span></div>';
    if (docs.length === 0) {
      docsHtml += '<div style="font-size:11px;color:var(--gris-300);padding:4px 0">Sin documentos</div>';
    } else {
      docs.forEach(d => {
        const fecha = d.created_at ? new Date(d.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }) : '';
        docsHtml += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gris-50)">'
          + '<span style="font-size:12px">📄</span>'
          + '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(d.nombre || d.filename || 'Documento')+'</div>'
          + '<div style="font-size:10px;color:var(--gris-400)">'+fecha+(d.periodo ? ' · '+d.periodo : '')+'</div></div>'
          + (d.url ? '<a href="'+d.url+'" target="_blank" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">⬇️</a>' : '')
          + '<button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px" onclick="_empEliminarDoc('+d.id+')">✕</button>'
          + '</div>';
      });
    }
    docsHtml += '</div>';
  });

  c.innerHTML = `
    <div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gris-600)">Documentos del empleado</div>
        <button class="btn btn-primary btn-sm" onclick="_empNuevoDoc()">+ Subir documento</button>
      </div>
      ${docsHtml}
    </div>
  `;
}

// — FICHAJES —
function _empRenderFichajes(c) {
  const mesActual = new Date().toISOString().slice(0,7);
  const fichajesMes = _empFichajes.filter(f => f.fecha?.startsWith(mesActual));
  const horasMes = fichajesMes.reduce((s,f) => s + (f.horas_total || 0), 0);
  const diasTrabajados = new Set(fichajesMes.map(f => f.fecha)).size;

  let listaHtml = '';
  _empFichajes.slice(0, 20).forEach(f => {
    const fecha = new Date(f.fecha+'T00:00:00').toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' });
    listaHtml += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gris-50)">'
      + '<div style="font-size:12px;font-weight:600;color:var(--gris-600);min-width:100px">'+fecha+'</div>'
      + '<div style="font-size:12px;color:var(--gris-500)">'+(f.hora_entrada||'—')+' → '+(f.hora_salida||'...')+'</div>'
      + '<div style="flex:1"></div>'
      + '<div style="font-size:12px;font-weight:700;color:var(--azul)">'+(f.horas_total ? f.horas_total.toFixed(1)+'h' : '—')+'</div>'
      + '<div style="font-size:10px;padding:2px 6px;border-radius:6px;background:'+(f.origen==='app'?'#ECFDF5':'#EFF6FF')+';color:'+(f.origen==='app'?'#059669':'#2563EB')+'">'+(f.origen||'web')+'</div>'
      + '</div>';
  });

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:var(--azul)">${horasMes.toFixed(1)}h</div>
        <div style="font-size:10px;color:var(--gris-500);text-transform:uppercase;font-weight:600">Horas este mes</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:var(--verde)">${diasTrabajados}</div>
        <div style="font-size:10px;color:var(--gris-500);text-transform:uppercase;font-weight:600">Días trabajados</div>
      </div>
      <div class="card" style="padding:14px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:var(--gris-600)">${fichajesMes.length}</div>
        <div style="font-size:10px;color:var(--gris-500);text-transform:uppercase;font-weight:600">Fichajes mes</div>
      </div>
    </div>
    <div class="card" style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gris-600);margin-bottom:10px">Últimos fichajes</div>
      ${listaHtml || '<div style="font-size:12px;color:var(--gris-300);text-align:center;padding:20px">Sin fichajes</div>'}
    </div>
  `;
}

// — PERMISOS Y AUSENCIAS —
function _empRenderPermisos(c) {
  const u = _empFichaUser;
  const anio = new Date().getFullYear();

  // Vacaciones
  const totalVac = 22;
  const mitad = 11;
  const tipos = typeof _calGetTipos === 'function' ? _calGetTipos() : [];
  const tiposVac = new Set(tipos.filter(t => t.consume_vacaciones).map(t => t.clave));
  const diasEmpresa = (typeof _ficCalLaboral !== 'undefined' ? _ficCalLaboral : []).filter(d => tiposVac.has(d.tipo)).length;
  const vacUsadas = _empAusencias.filter(a => a.tipo === 'vacaciones' && (a.estado === 'aprobada' || a.estado === 'pendiente') && a.fecha_inicio?.startsWith(String(anio))).reduce((s,a) => s + (a.dias_totales||0), 0);
  const vacLibres = Math.max(0, mitad - vacUsadas);

  // Permisos fuerza mayor
  const permisosAnio = _empAusencias.filter(a => a.tipo === 'permiso' && (a.estado === 'aprobada' || a.estado === 'pendiente') && a.fecha_inicio?.startsWith(String(anio)));
  const fmUsados = permisosAnio.filter(a => a.subtipo_permiso === 'fuerza_mayor').reduce((s,a) => s + (a.dias_totales||0), 0);
  const cmUsados = permisosAnio.filter(a => a.subtipo_permiso === 'consulta_medica').reduce((s,a) => s + (a.dias_totales||0), 0);

  const estadoBadge = { pendiente: '<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700">⏳</span>',
    aprobada: '<span style="background:#D1FAE5;color:#065F46;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700">✅</span>',
    rechazada: '<span style="background:#FEE2E2;color:#991B1B;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700">❌</span>' };

  let listaHtml = '';
  _empAusencias.forEach(a => {
    const fi = new Date(a.fecha_inicio+'T00:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short' });
    const ff = new Date(a.fecha_fin+'T00:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short' });
    listaHtml += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--gris-50)">'
      + (estadoBadge[a.estado]||'')
      + '<div style="flex:1"><div style="font-size:12px;font-weight:600">'+(a.tipo==='permiso'?'📄 Permiso':'🏖️ '+a.tipo)+'</div>'
      + '<div style="font-size:10px;color:var(--gris-400)">'+fi+' → '+ff+' · '+(a.dias_totales||'?')+'d'+(a.motivo?' · '+a.motivo:'')+'</div></div>'
      + '</div>';
  });

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--verde)">${vacLibres}</div>
        <div style="font-size:10px;color:var(--gris-500);font-weight:600">Vacaciones libres</div>
        <div style="font-size:9px;color:var(--gris-400)">${vacUsadas} de ${mitad} personales</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--naranja)">${diasEmpresa}</div>
        <div style="font-size:10px;color:var(--gris-500);font-weight:600">Vac. empresa</div>
        <div style="font-size:9px;color:var(--gris-400)">de ${mitad} marcados</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#6D28D9">${Math.max(0, 4 - fmUsados)}</div>
        <div style="font-size:10px;color:var(--gris-500);font-weight:600">Fuerza mayor</div>
        <div style="font-size:9px;color:var(--gris-400)">${fmUsados} de 4 usados</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#0891B2">${cmUsados > 0 ? cmUsados+'d' : '20h'}</div>
        <div style="font-size:10px;color:var(--gris-500);font-weight:600">Consulta médica</div>
        <div style="font-size:9px;color:var(--gris-400)">${cmUsados > 0 ? cmUsados+' días' : '20h disponibles'}</div>
      </div>
    </div>
    <div class="card" style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gris-600);margin-bottom:10px">Historial de ausencias y permisos</div>
      ${listaHtml || '<div style="font-size:12px;color:var(--gris-300);text-align:center;padding:20px">Sin ausencias registradas</div>'}
    </div>
  `;
}

// ═══════════════════════════════════════════════
//  GESTIÓN DOCUMENTAL
// ═══════════════════════════════════════════════
function _empNuevoDoc() {
  const inner = document.getElementById('mFichaje')?.querySelector('.modal');
  if (!inner) return;
  const u = _empFichaUser;

  inner.innerHTML = `
    <div class="modal-h"><span>📁</span><h2>Subir documento — ${u.nombre||''}</h2><button class="btn btn-ghost btn-icon" onclick="closeModal('mFichaje')">✕</button></div>
    <div class="modal-b">
      <div style="display:flex;flex-direction:column;gap:11px">
        <div class="fg">
          <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Categoría</label>
          <select id="empDoc_cat">
            ${_EMP_DOC_CATEGORIAS.map(c => '<option value="'+c.clave+'">'+c.emoji+' '+c.nombre+'</option>').join('')}
          </select>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Nombre / Descripción</label>
            <input type="text" id="empDoc_nombre" placeholder="Ej: Nómina marzo 2026, Curso PRL...">
          </div>
          <div class="fg">
            <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Periodo <span style="font-weight:400;color:var(--gris-400)">(opcional)</span></label>
            <input type="month" id="empDoc_periodo">
          </div>
        </div>
        <div class="fg">
          <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Archivo</label>
          <input type="file" id="empDoc_file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx">
        </div>
        <div class="fg">
          <label style="font-size:12px;font-weight:600;color:var(--gris-600);margin-bottom:4px">Fecha caducidad <span style="font-weight:400;color:var(--gris-400)">(EPIs, certificados...)</span></label>
          <input type="date" id="empDoc_caducidad">
        </div>
      </div>
    </div>
    <div class="modal-f">
      <button class="btn btn-secondary" onclick="closeModal('mFichaje')">Cancelar</button>
      <button class="btn btn-primary" onclick="_empGuardarDoc()">📁 Subir</button>
    </div>
  `;
  openModal('mFichaje', true);
}

async function _empGuardarDoc() {
  const cat = document.getElementById('empDoc_cat')?.value;
  const nombre = document.getElementById('empDoc_nombre')?.value || '';
  const periodo = document.getElementById('empDoc_periodo')?.value || null;
  const caducidad = document.getElementById('empDoc_caducidad')?.value || null;
  const file = document.getElementById('empDoc_file')?.files?.[0];

  if (!file) { toast('Selecciona un archivo', 'error'); return; }
  if (!nombre) { toast('Pon un nombre descriptivo', 'error'); return; }

  // Subir fichero
  const path = 'empleados/' + EMPRESA.id + '/' + _empFichaUser.id + '/' + Date.now() + '_' + file.name;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file);
  if (upErr) { toast('Error subiendo: ' + upErr.message, 'error'); return; }
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);

  // Guardar en BD
  const { error } = await sb.from('documentos_empleado').insert({
    empresa_id: EMPRESA.id,
    empleado_id: _empFichaUser.id,
    categoria: cat,
    nombre: nombre,
    filename: file.name,
    url: urlData?.publicUrl || null,
    periodo: periodo,
    fecha_caducidad: caducidad,
    created_by: CU.id,
  });

  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Documento subido ✓', 'success');
  closeModal('mFichaje');

  // Recargar docs
  const { data } = await sb.from('documentos_empleado').select('*').eq('empleado_id', _empFichaUser.id).eq('empresa_id', EMPRESA.id).order('created_at', { ascending: false });
  _empDocs = data || [];
  _empRenderFicha();
}

async function _empEliminarDoc(id) {
  const ok = await confirmModal({ titulo: 'Eliminar documento', mensaje: '¿Eliminar este documento?', btnOk: 'Eliminar', colorOk: '#DC2626' });
  if (!ok) return;
  await sb.from('documentos_empleado').delete().eq('id', id);
  _empDocs = _empDocs.filter(d => d.id !== id);
  toast('Documento eliminado', 'info');
  _empRenderFicha();
}
