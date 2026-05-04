// ═══════════════════════════════════════════════
// Company/Enterprise management - Empresa
// ═══════════════════════════════════════════════

function renderEmpresasList() {
  const planLabels = { basico:'Básico', profesional:'Profesional', premium:'Premium', pro:'Premium', trial:'Trial' };
  const planColors = { basico:'#2563EB', profesional:'#7C3AED', premium:'#D97706', pro:'#D97706', trial:'#64748B' };
  const planIcos   = { basico:'⭐', profesional:'🚀', premium:'👑', pro:'👑', trial:'🔓' };

  document.getElementById('empresasList').innerHTML = empresas.map(e => {
    const activa = e.id === EMPRESA.id;
    const plan = e.plan || 'trial';
    const logo = e.logo_url
      ? `<img src="${e.logo_url}" style="width:100%;height:100%;object-fit:contain;padding:3px">`
      : `<span style="font-size:18px;font-weight:800;color:#fff">${(e.nombre||'?')[0].toUpperCase()}</span>`;
    const logoBg = e.logo_url ? '#fff' : 'var(--azul)';

    return `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;cursor:pointer;
      border:2px solid ${activa ? 'var(--azul)' : 'var(--gris-200)'};
      background:${activa ? 'var(--azul-light)' : '#fff'};
      margin-bottom:10px;transition:all .15s ease"
      onclick="cambiarEmpresa('${e.id}')">
      <div style="width:44px;height:44px;border-radius:10px;background:${logoBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid var(--gris-200);overflow:hidden">${logo}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.nombre}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
          ${e.cif ? `<span style="font-size:11px;color:var(--gris-500)">${e.cif}</span>` : ''}
          <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${planColors[plan]||'#64748B'}15;color:${planColors[plan]||'#64748B'}">${planIcos[plan]||''} ${planLabels[plan]||plan}</span>
        </div>
      </div>
      ${activa
        ? '<div style="display:flex;align-items:center;gap:4px;color:var(--azul);font-size:12px;font-weight:700;flex-shrink:0"><span style="width:8px;height:8px;border-radius:50%;background:var(--azul);display:inline-block"></span> Activa</div>'
        : '<div style="font-size:11px;color:var(--gris-400);font-weight:600;flex-shrink:0">Cambiar</div>'}
    </div>`;
  }).join('');
}

async function cambiarEmpresa(id) {
  await sb.from('perfiles').update({empresa_id:id}).eq('id',CU.id);
  await cargarPerfil();
  await cargarEmpresa(id);
  closeModal('mEmpresas');
  await cargarTodos();
  loadDashboard();
  toast(`Empresa cambiada a ${EMPRESA.nombre}`,'success');
}

async function crearEmpresa() {
  const nombre=v('ne_nombre'); if(!nombre){toast('Introduce el nombre','error');return;}
  const {data,error}=await sb.from('empresas').insert({nombre,cif:v('ne_cif'),municipio:v('ne_muni'),telefono:v('ne_tel'),email:v('ne_email')}).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  await crearDatosIniciales(data.id);
  closeModal('mNuevaEmpresa');
  await cambiarEmpresa(data.id);
  toast(`Empresa ${nombre} creada ✓`,'success');
}

// Company data save
async function saveEmpresa() {
  const obj={nombre:v('emp_nombre'),razon_social:v('emp_razon'),cif:v('emp_cif'),telefono:v('emp_tel'),email:v('emp_email'),web:v('emp_web'),direccion:v('emp_dir'),municipio:v('emp_muni'),cp:v('emp_cp'),provincia:v('emp_prov')};
  // Upload logo if selected
  if (logoFile) {
    const ext = logoFile.name.split('.').pop();
    const { data: up, error: upErr } = await sb.storage.from('fotos-partes').upload(`logos/${EMPRESA.id}_logo.${ext}`, logoFile, { upsert: true });
    if (upErr) { console.error('Error subiendo logo:', upErr); toast('Error subiendo logo: ' + upErr.message, 'error'); }
    if (up) {
      const { data: url } = sb.storage.from('fotos-partes').getPublicUrl(up.path);
      obj.logo_url = url.publicUrl;
      EMPRESA.logo_url = url.publicUrl;
      // Update logo in sidebar
      const sbMark = document.querySelector('.sb-logo .mark');
      if (sbMark) {
        sbMark.style.background = '#fff';
        sbMark.innerHTML = `<img src="${url.publicUrl}" style="width:100%;height:100%;object-fit:contain;padding:3px">`;
      }
      // Update preview in config
      const prev = document.getElementById('logoPreview');
      if (prev) prev.innerHTML = `<img src="${url.publicUrl}" style="width:100%;height:100%;object-fit:contain;padding:4px">`;
    }
    logoFile = null;
  }
  // Guardar email gestoría + datos bancarios en config
  const emailGestoria = document.getElementById('cfg_email_gestoria')?.value?.trim() || '';
  const banco = document.getElementById('emp_banco')?.value?.trim() || '';
  const iban  = (document.getElementById('emp_iban')?.value || '').replace(/\s+/g,'').toUpperCase();
  const titular = document.getElementById('emp_titular')?.value?.trim() || '';
  const config = EMPRESA.config || {};
  config.email_gestoria = emailGestoria || null;
  config.banco_entidad = banco || null;
  config.iban = iban || null;
  config.titular_cuenta = titular || null;
  obj.config = config;

  await sb.from('empresas').update(obj).eq('id',EMPRESA.id);
  EMPRESA={...EMPRESA,...obj};
  const elEN=document.getElementById('sbEmpNombre'); if(elEN) elEN.textContent=EMPRESA.nombre;
  // Actualizar también el sbRol con nombre de empresa
  const elRol=document.getElementById('sbRol'); if(elRol){const r=CP?.es_superadmin?'Admin':'Usuario';elRol.textContent=EMPRESA.nombre?`${EMPRESA.nombre} · ${r}`:r;}
  toast('Datos de empresa guardados ✓','success');
}

// Company logo management
let logoFile = null;

function previewLogo(input) {
  const file = input.files[0];
  if (!file) return;
  logoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('logoPreview');
    prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain;padding:4px">`;
  };
  reader.readAsDataURL(file);
}

function quitarLogo() {
  logoFile = null;
  document.getElementById('logoPreview').innerHTML = '🏢';
  document.getElementById('emp_logo_file').value = '';
}
