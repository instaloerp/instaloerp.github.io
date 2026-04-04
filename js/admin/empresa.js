// ═══════════════════════════════════════════════
// Company/Enterprise management - Empresa
// ═══════════════════════════════════════════════

function renderEmpresasList() {
  document.getElementById('empresasList').innerHTML = empresas.map(e=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;border:2px solid ${e.id===EMPRESA.id?'var(--azul)':'var(--gris-200)'};background:${e.id===EMPRESA.id?'var(--azul-light)':'#fff'};margin-bottom:7px;transition:border-color .12s,background .12s" onclick="cambiarEmpresa('${e.id}')">
      <div style="width:32px;height:32px;border-radius:7px;background:var(--azul);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;flex-shrink:0">${e.nombre[0]}</div>
      <div style="flex:1"><div style="font-weight:700;font-size:13px">${e.nombre}</div></div>
      ${e.id===EMPRESA.id?'<span style="color:var(--azul);font-size:12px;font-weight:700">✓ Activa</span>':''}
    </div>`).join('');
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
  await sb.from('empresas').update(obj).eq('id',EMPRESA.id);
  EMPRESA={...EMPRESA,...obj};
  document.getElementById('sbEmpNombre').textContent=EMPRESA.nombre;
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
