// ═══════════════════════════════════════════════
// User management module - Usuarios
// ═══════════════════════════════════════════════

let usuariosFotoFile = null;

// Variable global para acceso desde otros módulos
let todosUsuarios = [];

async function loadUsuarios() {
  // Cargar invitaciones y solicitudes si es admin
  if (CP?.es_superadmin || CP?.rol === 'admin') {
    loadInvitaciones();
    loadSolicitudes();
  }
  const { data } = await sb.from('perfiles').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  const users = data || [];
  todosUsuarios = users;
  document.getElementById('usrCount').textContent = users.length + ' usuarios';

  const ROL_INFO = {
    admin:     { label:'Administrador',    ico:'⭐', color:'#D97706', bg:'#FFFBEB' },
    oficina:   { label:'Oficina',          ico:'🖥️', color:'#2563EB', bg:'#EFF6FF' },
    almacen:   { label:'Almacén',          ico:'📦', color:'#7C3AED', bg:'#F5F3FF' },
    operario:  { label:'Operario',         ico:'👷', color:'#059669', bg:'#ECFDF5' },
    comercial: { label:'Comercial',        ico:'💼', color:'#0891B2', bg:'#ECFEFF' },
  };
  const AVC2 = ['#1B4FD8','#16A34A','#D97706','#DC2626','#7C3AED','#0891B2'];

  // Separar por tipo
  const admins = users.filter(u => u.es_superadmin || u.rol === 'admin');
  const ofi = users.filter(u => !u.es_superadmin && u.rol === 'oficina');
  const alm = users.filter(u => u.rol === 'almacen');
  const operarios = users.filter(u => u.rol === 'operario');
  const comerciales = users.filter(u => u.rol === 'comercial');
  // Usuarios con rol legacy o sin rol → "otros"
  const classified = new Set([...admins,...ofi,...alm,...operarios,...comerciales].map(u=>u.id));
  const otros = users.filter(u => !classified.has(u.id));

  function renderUserCard(u) {
    const rolKey = u.es_superadmin ? 'admin' : (u.rol || 'operario');
    const ri = ROL_INFO[rolKey] || ROL_INFO.operario;
    return `<div class="card" style="padding:18px;border-left:3px solid ${ri.color};cursor:pointer;transition:transform .1s" onclick="_empAbrirFicha('${u.id}')" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:52px;height:52px;border-radius:50%;background:${u.avatar_url ? 'transparent' : AVC2[(u.nombre||'').charCodeAt(0)%AVC2.length]};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden;border:2px solid var(--gris-200)">
          ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">` : (u.nombre||'?')[0].toUpperCase()}
        </div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:800">${u.nombre || '—'} ${u.apellidos || ''}</div>
          <div style="font-size:11px;color:var(--gris-400)">${u.email || '—'}</div>
          <div style="margin-top:4px">
            <span style="background:${ri.bg};color:${ri.color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">
              ${ri.ico} ${u.es_superadmin ? 'Superadmin' : ri.label}
            </span>
            <span style="background:${u.activo !== false ? 'var(--verde-light)' : 'var(--gris-100)'};color:${u.activo !== false ? 'var(--verde)' : 'var(--gris-500)'};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:5px">
              ${u.activo !== false ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
        <span style="color:var(--gris-300);font-size:20px">›</span>
      </div>
      <div style="font-size:11.5px;color:var(--gris-500);margin-bottom:12px">
        ${u.telefono ? '📱 '+u.telefono : ''}
      </div>
      <div style="display:flex;gap:7px;align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editUsuario('${u.id}')">✏️ Editar</button>
        ${u.id === CU.id ? '<span style="font-size:11px;color:var(--azul);font-weight:700">· Eres tú</span>' : ''}
      </div>
    </div>`;
  }

  let html = '';
  const groups = [
    { label:'⭐ Administradores', list:admins },
    { label:'🖥️ Oficina', list:ofi },
    { label:'📦 Almacén', list:alm },
    { label:'👷 Operarios', list:operarios },
    { label:'💼 Comerciales', list:comerciales },
    { label:'📋 Otros', list:otros },
  ];
  groups.forEach((g,i) => {
    if (!g.list.length) return;
    html += `<div style="grid-column:1/-1;margin-top:${i?16:8}px"><div style="font-size:13px;font-weight:800;color:var(--gris-600);display:flex;align-items:center;gap:6px">${g.label} <span style="font-size:11px;font-weight:600;color:var(--gris-400)">(${g.list.length})</span></div></div>`;
    html += g.list.map(renderUserCard).join('');
  });

  document.getElementById('usuariosGrid').innerHTML = html || '<div class="empty" style="grid-column:1/-1"><div class="ei">👷</div><h3>Sin usuarios</h3><p>Crea el primer usuario del equipo</p></div>';
}

// Obtener operarios (para usar desde otros módulos)
function getOperarios() {
  return todosUsuarios.filter(u => u.rol === 'operario' && u.activo !== false);
}
function getTodosUsuariosActivos() {
  return todosUsuarios.filter(u => u.activo !== false);
}

function nuevoUsuarioModal() {
  document.getElementById('usr_id').value = '';
  document.getElementById('mUsrTit').textContent = 'Nuevo Usuario';
  ['usr_nombre','usr_apellidos','usr_email','usr_tel','usr_dni'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('usr_pass').value = '';
  document.getElementById('usr_pass').placeholder = 'Mínimo 8 caracteres';
  document.getElementById('usr_rol').value = 'operario';
  // Reset foto
  const prev = document.getElementById('usrFotoPreview');
  prev.innerHTML = '?';
  prev.style.background = 'var(--azul)';
  usuariosFotoFile = null;
  // Inicializar permisos con preset del rol
  _permisosTemp = PERM_PRESETS['operario'] ? JSON.parse(JSON.stringify(PERM_PRESETS['operario'])) : null;
  _actualizarResumenPermisos();
  // Disponible partes por defecto true para nuevo operario
  const elDP = document.getElementById('up_disponible_partes');
  if(elDP) elDP.checked = true;
  // Botón guardar
  const btnSave = document.querySelector('#mNuevoUsuario .modal-f .btn-primary');
  if (btnSave) btnSave.textContent = '💾 Crear usuario';
  openModal('mNuevoUsuario');
}

function previewUsrFoto(input) {
  const file = input.files[0];
  if (!file) return;
  usuariosFotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('usrFotoPreview');
    prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
}

async function saveUsuario() {
  const nombre = document.getElementById('usr_nombre').value.trim();
  const email  = document.getElementById('usr_email').value.trim();
  const pass   = document.getElementById('usr_pass').value;
  const id     = document.getElementById('usr_id').value;

  if (!nombre || !email) { toast('Nombre y email son obligatorios','error'); return; }
  if (!id && pass.length < 8) { toast('La contraseña debe tener mínimo 8 caracteres','error'); return; }

  // Leer permisos del modal dedicado
  const permisos = _permisosTemp || {};
  const dni = document.getElementById('usr_dni')?.value?.trim() || null;

  let avatar_url = null;

  const disponible_partes = document.getElementById('up_disponible_partes')?.checked || false;

  if (id) {
    const obj = { nombre, apellidos: v('usr_apellidos'), telefono: v('usr_tel'), rol: v('usr_rol'), permisos, disponible_partes, dni };
    if (usuariosFotoFile) {
      const { data: up } = await sb.storage.from('fotos-partes').upload(`avatars/${id}_${Date.now()}`, usuariosFotoFile);
      if (up) { const { data: url } = sb.storage.from('fotos-partes').getPublicUrl(up.path); obj.avatar_url = url.publicUrl; }
    }
    const { error: updErr } = await sb.from('perfiles').update(obj).eq('id', id);
    if (updErr) { toast('Error al guardar: ' + updErr.message, 'error'); console.error('[saveUsuario] Error:', updErr); return; }
    // If current user, update CP and refresh sidebar
    if (id === CU.id) {
      await cargarPerfil();
      if (typeof applySbItemVisibility === 'function') applySbItemVisibility();
      if (typeof renderFavoritos === 'function') renderFavoritos();
    }
    toast('Usuario actualizado ✓', 'success');
  } else {
    const { data: authData, error: authErr } = await sb.auth.signUp({ email, password: pass, options: { data: { nombre } } });
    if (authErr) { toast('Error: ' + authErr.message, 'error'); return; }

    if (usuariosFotoFile && authData.user) {
      const { data: up } = await sb.storage.from('fotos-partes').upload(`avatars/${authData.user.id}_${Date.now()}`, usuariosFotoFile);
      if (up) { const { data: url } = sb.storage.from('fotos-partes').getPublicUrl(up.path); avatar_url = url.publicUrl; }
    }

    await sb.from('perfiles').upsert({
      id: authData.user.id, nombre, apellidos: v('usr_apellidos'),
      email, telefono: v('usr_tel'), rol: v('usr_rol'),
      empresa_id: EMPRESA.id, es_superadmin: false,
      activo: true, avatar_url, permisos, disponible_partes, dni
    });
    toast(`Usuario ${nombre} creado ✓ — recibirá email para confirmar acceso`, 'success');
  }

  usuariosFotoFile = null;
  closeModal('mNuevoUsuario');
  await loadUsuarios();
}

function editUsuario(uid) {
  console.log('[editUsuario] uid:', uid, 'todosUsuarios:', todosUsuarios.length);
  // Usar datos ya cargados (evita problemas de RLS)
  const u = todosUsuarios.find(x => x.id === uid);
  if (!u) { toast('No se pudo cargar el usuario','error'); console.error('[editUsuario] No encontrado en todosUsuarios'); return; }
  console.log('[editUsuario] Encontrado:', u.nombre, u.apellidos);

  document.getElementById('usr_id').value = u.id;
  document.getElementById('mUsrTit').textContent = 'Editar Usuario';

  // Rellenar campos
  const elNombre = document.getElementById('usr_nombre');
  const elApellidos = document.getElementById('usr_apellidos');
  const elEmail = document.getElementById('usr_email');
  const elTel = document.getElementById('usr_tel');
  if (elNombre) elNombre.value = u.nombre || '';
  if (elApellidos) elApellidos.value = u.apellidos || '';
  if (elEmail) elEmail.value = u.email || '';
  if (elTel) elTel.value = u.telefono || '';
  const elDni = document.getElementById('usr_dni');
  if (elDni) elDni.value = u.dni || '';

  const rol = u.es_superadmin ? 'admin' : (u.rol || 'operario');
  document.getElementById('usr_rol').value = rol;

  document.getElementById('usr_pass').value = '';
  document.getElementById('usr_pass').placeholder = 'Dejar vacío para no cambiar';

  const prev = document.getElementById('usrFotoPreview');
  if (u.avatar_url) {
    prev.innerHTML = `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">`;
    prev.style.background = 'transparent';
  } else {
    prev.textContent = (u.nombre||'?')[0].toUpperCase();
    prev.style.background = '#1B4FD8';
  }

  // Cargar permisos en _permisosTemp
  const isAdmin = u.es_superadmin || rol === 'admin';
  if (isAdmin) {
    _permisosTemp = JSON.parse(JSON.stringify(PERM_PRESETS.admin));
  } else if (u.permisos && typeof u.permisos === 'object') {
    const isNewFormat = Object.values(u.permisos).some(v => typeof v === 'object');
    if (isNewFormat) {
      _permisosTemp = JSON.parse(JSON.stringify(u.permisos));
    } else {
      const preset = PERM_PRESETS[rol] || PERM_PRESETS.operario;
      _permisosTemp = JSON.parse(JSON.stringify(preset));
    }
  } else {
    const preset = PERM_PRESETS[rol] || PERM_PRESETS.operario;
    _permisosTemp = JSON.parse(JSON.stringify(preset));
  }
  _actualizarResumenPermisos();

  // Disponible para partes
  const elDP = document.getElementById('up_disponible_partes');
  if (elDP) elDP.checked = u.disponible_partes === true;

  // Botón guardar
  const btnSave = document.querySelector('#mNuevoUsuario .modal-f .btn-primary');
  if (btnSave) btnSave.textContent = '💾 Guardar cambios';

  openModal('mNuevoUsuario', true);  // skipReset=true para NO borrar los datos que acabamos de poner
}

// ── Modal de permisos (separado) ──────────────────
let _permisosBackup = null; // backup para cancelar

function abrirModalPermisos() {
  renderPermisosEditor('permisosEditorContainer');
  // Si ya hay permisos guardados en _permisosTemp, cargarlos
  if (_permisosTemp) {
    writePermisosToUI(_permisosTemp);
  } else {
    // Cargar según el rol seleccionado
    const rol = document.getElementById('usr_rol')?.value || 'operario';
    setPermisosByRol(rol);
  }
  _permisosBackup = readPermisosFromUI();
  // Sincronizar el selector de preset con el rol actual
  const presetSel = document.getElementById('permPresetRapido');
  if (presetSel) presetSel.value = '';
  openModal('mPermisos');
}

function cerrarModalPermisos() {
  // Cancelar — restaurar backup
  if (_permisosBackup) {
    writePermisosToUI(_permisosBackup);
  }
  closeModal('mPermisos');
}

function confirmarPermisos() {
  _permisosTemp = readPermisosFromUI();
  _actualizarResumenPermisos();
  closeModal('mPermisos');
}

let _permisosTemp = null; // permisos editados pendientes de guardar

function _actualizarResumenPermisos() {
  const el = document.getElementById('permResumen');
  if (!el || !_permisosTemp) { if(el) el.textContent = 'Sin configurar'; return; }
  // Contar secciones con acceso
  const secciones = [];
  PERM_SECTIONS.forEach(sec => {
    if (['acceso','inicio','opciones'].includes(sec.key)) return;
    const d = _permisosTemp[sec.key];
    if (!d) return;
    // Tiene acceso si "ver" es true o algún sub-item es true
    let tiene = false;
    if (d.ver === true) tiene = true;
    if (!tiene) {
      for (const k of Object.keys(d)) {
        if (d[k] === true) { tiene = true; break; }
      }
    }
    if (tiene) secciones.push(sec.label);
  });
  el.textContent = secciones.length
    ? `Acceso a: ${secciones.join(', ')}`
    : 'Sin acceso a ninguna sección';
}

async function delUsuario(id) {
  const ok = await confirmModal({titulo:'Eliminar usuario',mensaje:'¿Eliminar este usuario?',aviso:'Esta acción no se puede deshacer',btnOk:'Eliminar',colorOk:'#dc2626'}); if (!ok) return;
  await sb.from('perfiles').delete().eq('id',id);
  await loadUsuarios();
  toast('Usuario eliminado','info');
}

async function loadSolicitudes() {
  const { data } = await sb.from('solicitudes_acceso').select('*').order('created_at', { ascending: false }).limit(20);
  const list = data || [];
  const tbody = document.getElementById('solicitudes-table');
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(s => `<tr>
    <td>${s.nombre || '—'}</td>
    <td>${s.email || '—'}</td>
    <td>${s.empresa_nombre || '—'}</td>
    <td>${s.telefono || '—'}</td>
    <td>${new Date(s.created_at).toLocaleDateString()}</td>
    <td><button class="btn btn-sm btn-primary" onclick="invitarDesdeSolicitud('${(s.email||'').replace(/'/g,"\\'")}','${(s.nombre||'').replace(/'/g,"\\'")}','${(s.empresa_nombre||'').replace(/'/g,"\\'")}')">Invitar</button></td>
  </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--gris-400);padding:20px">No hay solicitudes</td></tr>';
}

function invitarDesdeSolicitud(email, nombre, empresa) {
  document.getElementById('inv_email').value = email;
  document.getElementById('inv_nombre').value = nombre;
  document.getElementById('inv_empresa').value = empresa;
  openModal('mNuevaInvitacion');
}
