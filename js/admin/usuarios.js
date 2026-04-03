// ═══════════════════════════════════════════════
// User management module - Usuarios
// ═══════════════════════════════════════════════

let usuariosFotoFile = null;

// Variable global para acceso desde otros módulos
let todosUsuarios = [];

async function loadUsuarios() {
  // Cargar invitaciones y solicitudes si es superadmin
  if (CP?.es_superadmin) {
    loadInvitaciones();
    loadSolicitudes();
  }
  const { data } = await sb.from('perfiles').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  const users = data || [];
  todosUsuarios = users;
  document.getElementById('usrCount').textContent = users.length + ' usuarios';

  const ROL_INFO = {
    admin:         { label:'Administrador',      ico:'⭐', color:'#D97706', bg:'#FFFBEB' },
    administrativo:{ label:'Administrativo',      ico:'🖥️', color:'#2563EB', bg:'#EFF6FF' },
    encargado:     { label:'Encargado almacén',   ico:'📦', color:'#7C3AED', bg:'#F5F3FF' },
    operario:      { label:'Operario de campo',   ico:'👷', color:'#059669', bg:'#ECFDF5' },
  };
  const AVC2 = ['#1B4FD8','#16A34A','#D97706','#DC2626','#7C3AED','#0891B2'];

  // Separar por tipo
  const admins = users.filter(u => u.es_superadmin || u.rol === 'admin' || u.rol === 'administrativo');
  const operarios = users.filter(u => u.rol === 'operario');
  const otros = users.filter(u => !admins.includes(u) && !operarios.includes(u));

  function renderUserCard(u) {
    const rolKey = u.es_superadmin ? 'admin' : (u.rol || 'operario');
    const ri = ROL_INFO[rolKey] || ROL_INFO.operario;
    return `<div class="card" style="padding:18px;border-left:3px solid ${ri.color}">
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
      </div>
      <div style="font-size:11.5px;color:var(--gris-500);margin-bottom:12px">
        ${u.telefono ? '📱 '+u.telefono : ''}
      </div>
      <div style="display:flex;gap:7px;align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="editUsuario('${u.id}')">✏️ Editar</button>
        ${u.id === CU.id ? '<span style="font-size:11px;color:var(--azul);font-weight:700">· Eres tú</span>' : ''}
      </div>
    </div>`;
  }

  let html = '';
  if (admins.length) {
    html += `<div style="grid-column:1/-1;margin-top:8px"><div style="font-size:13px;font-weight:800;color:var(--gris-600);display:flex;align-items:center;gap:6px">🖥️ Administración <span style="font-size:11px;font-weight:600;color:var(--gris-400)">(${admins.length})</span></div></div>`;
    html += admins.map(renderUserCard).join('');
  }
  if (operarios.length) {
    html += `<div style="grid-column:1/-1;margin-top:16px"><div style="font-size:13px;font-weight:800;color:var(--gris-600);display:flex;align-items:center;gap:6px">👷 Operarios de campo <span style="font-size:11px;font-weight:600;color:var(--gris-400)">(${operarios.length})</span></div></div>`;
    html += operarios.map(renderUserCard).join('');
  }
  if (otros.length) {
    html += `<div style="grid-column:1/-1;margin-top:16px"><div style="font-size:13px;font-weight:800;color:var(--gris-600);display:flex;align-items:center;gap:6px">📋 Otros <span style="font-size:11px;font-weight:600;color:var(--gris-400)">(${otros.length})</span></div></div>`;
    html += otros.map(renderUserCard).join('');
  }

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
  ['usr_nombre','usr_apellidos','usr_email','usr_tel'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('usr_pass').value = '';
  document.getElementById('usr_pass').placeholder = 'Mínimo 8 caracteres';
  document.getElementById('usr_rol').value = 'operario';
  // Reset foto
  const prev = document.getElementById('usrFotoPreview');
  prev.innerHTML = '?';
  prev.style.background = 'var(--azul)';
  usuariosFotoFile = null;
  // Permisos por defecto para operario
  ['up_clientes','up_presupuestos','up_facturas','up_stock','up_config','up_usuarios'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=false; });
  ['up_trabajos','up_partes'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=true; });
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

  const permisos = {
    clientes: document.getElementById('up_clientes').checked,
    presupuestos: document.getElementById('up_presupuestos').checked,
    facturas: document.getElementById('up_facturas').checked,
    trabajos: document.getElementById('up_trabajos').checked,
    partes: document.getElementById('up_partes').checked,
    stock: document.getElementById('up_stock').checked,
    configuracion: document.getElementById('up_config').checked,
    usuarios: document.getElementById('up_usuarios').checked,
  };

  let avatar_url = null;

  const disponible_partes = document.getElementById('up_disponible_partes')?.checked || false;

  if (id) {
    const obj = { nombre, apellidos: v('usr_apellidos'), telefono: v('usr_tel'), rol: v('usr_rol'), permisos, disponible_partes };
    if (usuariosFotoFile) {
      const { data: up } = await sb.storage.from('fotos-partes').upload(`avatars/${id}_${Date.now()}`, usuariosFotoFile);
      if (up) { const { data: url } = sb.storage.from('fotos-partes').getPublicUrl(up.path); obj.avatar_url = url.publicUrl; }
    }
    await sb.from('perfiles').update(obj).eq('id', id);
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
      activo: true, avatar_url, permisos, disponible_partes
    });
    toast(`Usuario ${nombre} creado ✓ — recibirá email para confirmar acceso`, 'success');
  }

  usuariosFotoFile = null;
  closeModal('mNuevoUsuario');
  await loadUsuarios();
}

async function editUsuario(uid) {
  // Usar datos ya cargados (evita problemas de RLS)
  let u = todosUsuarios.find(x => x.id === uid);
  if (!u) {
    // Fallback: intentar cargar de BD
    const { data } = await sb.from('perfiles').select('*').eq('id', uid).single();
    u = data;
  }
  if (!u) { toast('No se pudo cargar el usuario','error'); return; }
  document.getElementById('usr_id').value = u.id;
  document.getElementById('mUsrTit').textContent = 'Editar Usuario';
  setVal({ usr_nombre: u.nombre||'', usr_apellidos: u.apellidos||'', usr_email: u.email||'', usr_tel: u.telefono||'' });

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

  const p = u.permisos || {};
  const isAdmin = u.es_superadmin || rol === 'admin';
  ['clientes','presupuestos','facturas','trabajos','partes','stock'].forEach(k => {
    const el = document.getElementById('up_'+k);
    if(el) el.checked = isAdmin ? true : (p[k] || false);
  });
  const elCfg = document.getElementById('up_config');
  const elUsr = document.getElementById('up_usuarios');
  if(elCfg) elCfg.checked = isAdmin ? true : (p['configuracion'] || p['config'] || false);
  if(elUsr) elUsr.checked = isAdmin ? true : (p['usuarios'] || false);

  // Disponible para partes
  const elDP = document.getElementById('up_disponible_partes');
  if (elDP) elDP.checked = u.disponible_partes === true;

  // Botón guardar
  const btnSave = document.querySelector('#mNuevoUsuario .modal-f .btn-primary');
  if (btnSave) btnSave.textContent = '💾 Guardar cambios';

  openModal('mNuevoUsuario');
}

async function delUsuario(id) {
  if(!confirm('¿Eliminar usuario?'))return;
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
