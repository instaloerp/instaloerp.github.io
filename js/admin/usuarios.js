// ═══════════════════════════════════════════════
// User management module - Usuarios
// ═══════════════════════════════════════════════

let usuariosFotoFile = null;

async function loadUsuarios() {
  // Cargar invitaciones y solicitudes si es superadmin
  if (CP?.es_superadmin) {
    loadInvitaciones();
    loadSolicitudes();
  }
  const { data } = await sb.from('perfiles').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
  const users = data || [];
  document.getElementById('usrCount').textContent = users.length + ' usuarios';
  const AVC2 = ['#1B4FD8','#16A34A','#D97706','#DC2626','#7C3AED','#0891B2'];
  document.getElementById('usuariosGrid').innerHTML = users.length ?
    users.map(u => {
      const perms = u.permisos || {};
      const permList = ['clientes','presupuestos','facturas','trabajos','partes','stock'];
      return `<div class="card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:52px;height:52px;border-radius:50%;background:${u.avatar_url ? 'transparent' : AVC2[(u.nombre||'').charCodeAt(0)%AVC2.length]};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden;border:2px solid var(--gris-200)">
            ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">` : (u.nombre||'?')[0].toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800">${u.nombre || '—'} ${u.apellidos || ''}</div>
            <div style="font-size:11px;color:var(--gris-400)">${u.email}</div>
            <div style="margin-top:4px">
              <span style="background:${u.es_superadmin ? 'var(--amarillo-light)' : 'var(--azul-light)'};color:${u.es_superadmin ? 'var(--amarillo)' : 'var(--azul)'};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">
                ${u.es_superadmin ? '⭐ Superadmin' : u.rol || 'Usuario'}
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
        <div style="display:flex;gap:7px">
          <button class="btn btn-secondary btn-sm" onclick="editUsuario('${u.id}')">✏️ Editar</button> ${u.id === CU.id ? '<span style="font-size:11px;color:var(--azul);font-weight:700">· Eres tú</span>' : ''}
        </div>
      </div>`;
    }).join('') :
    '<div class="empty" style="grid-column:1/-1"><div class="ei">👷</div><h3>Sin usuarios</h3><p>Crea el primer usuario del equipo</p></div>';
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

  if (id) {
    const obj = { nombre, apellidos: v('usr_apellidos'), telefono: v('usr_tel'), rol: v('usr_rol'), permisos };
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
      activo: true, avatar_url, permisos
    });
    toast(`Usuario ${nombre} creado ✓ — recibirá email para confirmar acceso`, 'success');
  }

  usuariosFotoFile = null;
  closeModal('mNuevoUsuario');
  await loadUsuarios();
}

async function editUsuario(uid) {
  const { data: u } = await sb.from('perfiles').select('*').eq('id', uid).single();
  if (!u) return;
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
