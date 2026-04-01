// ═══════════════════════════════════════════════
// CORE APPLICATION - Initialization, auth, state, and data loading
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
//  SUPABASE
// ═══════════════════════════════════════════════
const SUPA_URL = 'https://gskkqqhbpnycvuioqetj.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdza2txcWhicG55Y3Z1aW9xZXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzU1OTksImV4cCI6MjA5MDQ1MTU5OX0.4ArVhR9_qh6frtBrWZRRIssr3Zgavv41SdfOgyg27KE';
const { createClient } = supabase;
const sb = createClient(SUPA_URL, SUPA_KEY);

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
let CU = null, CP = null, EMPRESA = null;
let clientes=[], proveedores=[], articulos=[], almacenes=[], trabajos=[];
let tiposIva=[], unidades=[], formasPago=[], familias=[], series=[];
let empresas=[];
let prIvaDefault = null;

// ═══════════════════════════════════════════════
//  SESSION TIMEOUT (inactividad)
// ═══════════════════════════════════════════════
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos de inactividad
let sessionTimer = null;

function resetSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  // Solo activar timer si hay sesión activa
  if (CU) {
    sessionTimer = setTimeout(() => {
      toast('Sesión cerrada por inactividad', 'warning');
      setTimeout(() => doLogout(), 1500);
    }, SESSION_TIMEOUT_MS);
  }
}

// Detectar actividad del usuario
['click','keydown','mousemove','scroll','touchstart'].forEach(evt => {
  document.addEventListener(evt, resetSessionTimer, { passive: true });
});

// Al cerrar pestaña/navegador → cerrar sesión
window.addEventListener('beforeunload', () => {
  // Marcar que la sesión debe expirar al volver
  sessionStorage.setItem('erp_session_active', 'true');
});

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
let inviteToken = null; // Token de invitación activo

async function init() {
  // Detectar token de invitación en la URL: ?invite=XXXXX
  const urlParams = new URLSearchParams(window.location.search);
  const tokenParam = urlParams.get('invite');

  if (tokenParam) {
    // Verificar si el token es válido
    const { data: inv } = await sb.from('invitaciones')
      .select('*')
      .eq('token', tokenParam)
      .eq('usado', false)
      .single();

    if (inv && new Date(inv.expira_en) > new Date()) {
      inviteToken = inv;
      // Pre-rellenar email si viene en la invitación
      const rEmail = document.getElementById('rEmail');
      if (rEmail && inv.email) { rEmail.value = inv.email; rEmail.readOnly = true; }
      const rNombre = document.getElementById('rNombre');
      if (rNombre && inv.nombre) rNombre.value = inv.nombre;
      const rEmpresa = document.getElementById('rEmpresa');
      if (rEmpresa && inv.empresa_nombre) rEmpresa.value = inv.empresa_nombre;
      showScreen('s-register');
      return;
    } else {
      showScreen('s-invite-invalid');
      return;
    }
  }

  const { data: { session } } = await sb.auth.getSession();

  // Si hay sesión pero no hay marca de sesión activa → el navegador se cerró
  const wasActive = sessionStorage.getItem('erp_session_active');

  if (session) {
    if (!wasActive) {
      await sb.auth.signOut();
      showScreen('s-login');
      return;
    }
    CU = session.user;
    await cargarPerfil();
    if (CP?.empresa_id) {
      await cargarEmpresa(CP.empresa_id);
      if (!verificarLicencia()) {
        showScreen('s-expired');
        return;
      }
      mostrarApp();
      resetSessionTimer();
      const dias = diasRestantes();
      if (dias !== null && dias <= 5 && EMPRESA.plan === 'trial') {
        toast(`Tu prueba gratuita expira en ${dias} día${dias !== 1 ? 's' : ''}`, 'warning');
      }
    } else {
      showScreen('s-login');
      toast('Tu cuenta no tiene empresa asignada. Contacta con el administrador.', 'warning');
    }
  } else {
    showScreen('s-login');
  }
}

async function cargarPerfil() {
  const { data } = await sb.from('perfiles').select('*').eq('id', CU.id).single();
  CP = data;
}

async function cargarEmpresa(id) {
  const { data } = await sb.from('empresas').select('*').eq('id', id).single();
  EMPRESA = data;
}

// ═══════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  document.getElementById('loginErr').style.display = 'none';
  if (!email||!pass) { showErr('loginErr','Completa todos los campos'); return; }
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showErr('loginErr','Email o contraseña incorrectos'); return; }
  CU = data.user;
  await cargarPerfil();

  // Verificar que tiene empresa asignada
  if (!CP?.empresa_id) {
    showErr('loginErr','Tu cuenta no tiene empresa asignada. Contacta con el administrador.');
    await sb.auth.signOut();
    CU = null; CP = null;
    return;
  }

  await cargarEmpresa(CP.empresa_id);

  // Verificar licencia
  if (!verificarLicencia()) {
    showScreen('s-expired');
    return;
  }

  // Marcar sesión activa (para detectar cierre de navegador)
  sessionStorage.setItem('erp_session_active', 'true');

  mostrarApp();
  resetSessionTimer();

  // Aviso si quedan pocos días de prueba
  const dias = diasRestantes();
  if (dias !== null && dias <= 5 && EMPRESA.plan === 'trial') {
    toast(`Tu prueba gratuita expira en ${dias} día${dias !== 1 ? 's' : ''}`, 'warning');
  }
}

async function doRegister() {
  // Solo permitir registro con invitación válida
  if (!inviteToken) {
    showErr('regErr','Necesitas un enlace de invitación para registrarte.');
    return;
  }

  const nombre   = document.getElementById('rNombre').value.trim();
  const email    = document.getElementById('rEmail').value.trim();
  const pass     = document.getElementById('rPass').value;
  const empresa  = document.getElementById('rEmpresa').value.trim();
  if (!nombre||!email||!pass||!empresa) { showErr('regErr','Completa los campos obligatorios (*)'); return; }
  if (pass.length < 8) { showErr('regErr','La contraseña debe tener mínimo 8 caracteres'); return; }

  // 1. Crear usuario en Auth
  const { data: authData, error: authErr } = await sb.auth.signUp({ email, password: pass, options: { data: { nombre } } });
  if (authErr) { showErr('regErr', authErr.message); return; }
  CU = authData.user;

  // 2. Crear empresa con licencia de prueba
  const hoy = new Date();
  const diasPrueba = inviteToken.dias_prueba || 14;
  const expira = new Date(hoy.getTime() + diasPrueba * 24 * 60 * 60 * 1000);

  const { data: empData, error: empErr } = await sb.from('empresas').insert({
    nombre: empresa,
    cif: document.getElementById('rCif').value,
    telefono: document.getElementById('rTel').value,
    municipio: document.getElementById('rMunicipio').value,
    provincia: document.getElementById('rProvincia').value,
    email,
    plan: 'trial',
    fecha_activacion: hoy.toISOString(),
    fecha_expiracion: expira.toISOString(),
    licencia_activa: true
  }).select().single();
  if (empErr) { showErr('regErr','Error al crear la empresa: '+empErr.message); return; }
  EMPRESA = empData;

  // 3. Crear perfil
  await sb.from('perfiles').upsert({
    id: CU.id, nombre, apellidos: document.getElementById('rApellidos').value,
    email, empresa_id: EMPRESA.id, es_superadmin: true
  });
  await cargarPerfil();

  // 4. Crear datos iniciales
  await crearDatosIniciales(EMPRESA.id);

  // 5. Marcar invitación como usada
  await sb.from('invitaciones').update({ usado: true, usado_en: new Date().toISOString(), usado_por: CU.id }).eq('id', inviteToken.id);

  // 6. Marcar sesión activa y entrar
  sessionStorage.setItem('erp_session_active', 'true');
  // Limpiar URL del token
  window.history.replaceState({}, '', window.location.pathname);
  mostrarApp();
  resetSessionTimer();
  toast(`¡Bienvenido! Tienes ${diasPrueba} días de prueba gratuita`,'success');
}

// ═══════════════════════════════════════════════
//  SOLICITAR ACCESO (envía email a Jordi)
// ═══════════════════════════════════════════════
function enviarSolicitud() {
  const nombre  = document.getElementById('solNombre').value.trim();
  const email   = document.getElementById('solEmail').value.trim();
  const empresa = document.getElementById('solEmpresa').value.trim();
  const tel     = document.getElementById('solTel').value.trim();
  const msg     = document.getElementById('solMsg').value.trim();

  if (!nombre || !email || !empresa) {
    toast('Completa nombre, email y empresa', 'error');
    return;
  }

  // Construir enlace mailto
  const asunto = encodeURIComponent(`Solicitud de acceso ERP - ${empresa}`);
  const cuerpo = encodeURIComponent(
    `Nueva solicitud de acceso al ERP:\n\n` +
    `Nombre: ${nombre}\n` +
    `Email: ${email}\n` +
    `Empresa: ${empresa}\n` +
    `Teléfono: ${tel || 'No indicado'}\n` +
    `Mensaje: ${msg || 'Sin mensaje'}\n\n` +
    `---\nEnviado desde el formulario de solicitud del ERP`
  );

  window.location.href = `mailto:jordi@jordiinstalacions.es?subject=${asunto}&body=${cuerpo}`;

  // También guardar la solicitud en base de datos
  sb.from('solicitudes_acceso').insert({
    nombre, email, empresa_nombre: empresa, telefono: tel, mensaje: msg
  }).then(() => {
    toast('Solicitud enviada. Nos pondremos en contacto contigo.', 'success');
    setTimeout(() => showScreen('s-login'), 2000);
  });
}

// ═══════════════════════════════════════════════
//  INVITACIONES (generar desde Admin)
// ═══════════════════════════════════════════════
function generarToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 12; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

async function crearInvitacion() {
  const email = document.getElementById('inv_email').value.trim();
  const nombre = document.getElementById('inv_nombre').value.trim();
  const empNombre = document.getElementById('inv_empresa').value.trim();
  const dias = parseInt(document.getElementById('inv_dias').value) || 14;

  if (!email) { toast('El email es obligatorio', 'error'); return; }

  const token = generarToken();
  const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Token válido 7 días

  const { error } = await sb.from('invitaciones').insert({
    token,
    email,
    nombre,
    empresa_nombre: empNombre,
    dias_prueba: dias,
    expira_en: expira.toISOString(),
    usado: false,
    creado_por: CU.id
  });

  if (error) { toast('Error al crear invitación: ' + error.message, 'error'); return; }

  const url = `${window.location.origin}${window.location.pathname}?invite=${token}`;

  // Mostrar enlace y copiar al portapapeles
  document.getElementById('inv_resultado').innerHTML = `
    <div style="margin-top:14px;padding:12px;background:var(--verde-light);border-radius:8px;word-break:break-all">
      <p style="font-size:11px;color:var(--verde);font-weight:700;margin-bottom:6px">Enlace generado (válido 7 días):</p>
      <input type="text" value="${url}" readonly style="width:100%;padding:8px;border:1px solid var(--verde);border-radius:6px;font-size:12px;background:#fff" onclick="this.select()">
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${url}');toast('Enlace copiado','success')">Copiar enlace</button>
        <button class="btn btn-secondary btn-sm" onclick="enviarInvitacionEmail('${email}','${nombre}','${url}')">Enviar por email</button>
      </div>
    </div>`;

  await loadInvitaciones();
  toast('Invitación creada', 'success');
}

function enviarInvitacionEmail(email, nombre, url) {
  const asunto = encodeURIComponent('Invitación para probar Jordi ERP');
  const cuerpo = encodeURIComponent(
    `Hola ${nombre || ''},\n\n` +
    `Has sido invitado a probar Jordi ERP.\n\n` +
    `Haz clic en el siguiente enlace para crear tu cuenta:\n${url}\n\n` +
    `Este enlace es válido durante 7 días.\n\n` +
    `Un saludo,\nJordi Instalacións`
  );
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, '_blank');
}

async function loadInvitaciones() {
  const { data } = await sb.from('invitaciones').select('*').order('created_at', { ascending: false }).limit(20);
  const list = data || [];
  const tbody = document.querySelector('#invitaciones-table tbody');
  if (!tbody) return;

  tbody.innerHTML = list.map(inv => {
    const expirada = new Date(inv.expira_en) < new Date();
    const estado = inv.usado ? '<span style="color:var(--verde);font-weight:700">Usada</span>'
      : expirada ? '<span style="color:var(--gris-400)">Expirada</span>'
      : '<span style="color:var(--azul);font-weight:700">Pendiente</span>';

    return `<tr>
      <td>${inv.email || '—'}</td>
      <td>${inv.empresa_nombre || '—'}</td>
      <td>${inv.dias_prueba} días</td>
      <td>${estado}</td>
      <td>${new Date(inv.created_at).toLocaleDateString()}</td>
      <td>${!inv.usado && !expirada ? `<button class="btn btn-sm btn-secondary" onclick="navigator.clipboard.writeText('${window.location.origin}${window.location.pathname}?invite=${inv.token}');toast('Copiado','success')">Copiar</button>` : ''}</td>
    </tr>`;
  }).join('');
}

// Verificar si la licencia de la empresa está vigente
function verificarLicencia() {
  if (!EMPRESA) return false;

  // Plan 'pro' o 'premium' o licencia sin expiración → siempre activo
  if (EMPRESA.plan === 'pro' || EMPRESA.plan === 'premium') return true;
  if (EMPRESA.licencia_activa && !EMPRESA.fecha_expiracion) return true;

  // Verificar si la licencia está activa y no ha expirado
  if (!EMPRESA.licencia_activa) return false;
  if (EMPRESA.fecha_expiracion) {
    const expira = new Date(EMPRESA.fecha_expiracion);
    if (new Date() > expira) return false;
  }
  return true;
}

// Obtener días restantes de prueba
function diasRestantes() {
  if (!EMPRESA || !EMPRESA.fecha_expiracion) return null;
  const expira = new Date(EMPRESA.fecha_expiracion);
  const diff = expira.getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / (1000*60*60*24)));
}

async function crearDatosIniciales(empId) {
  // IVA
  await sb.from('tipos_iva').insert([
    {empresa_id:empId,nombre:'General',porcentaje:21,por_defecto:true},
    {empresa_id:empId,nombre:'Reducido',porcentaje:10},
    {empresa_id:empId,nombre:'Superreducido',porcentaje:4},
    {empresa_id:empId,nombre:'Exento',porcentaje:0},
  ]);
  // Unidades
  await sb.from('unidades_medida').insert([
    {empresa_id:empId,nombre:'Unidad',abreviatura:'ud'},
    {empresa_id:empId,nombre:'Metro lineal',abreviatura:'ml'},
    {empresa_id:empId,nombre:'Metro cuadrado',abreviatura:'m²'},
    {empresa_id:empId,nombre:'Kilogramo',abreviatura:'kg'},
    {empresa_id:empId,nombre:'Litro',abreviatura:'l'},
    {empresa_id:empId,nombre:'Hora',abreviatura:'h'},
    {empresa_id:empId,nombre:'Bote',abreviatura:'bote'},
    {empresa_id:empId,nombre:'Rollo',abreviatura:'rollo'},
    {empresa_id:empId,nombre:'Caja',abreviatura:'caja'},
  ]);
  // Formas de pago
  await sb.from('formas_pago').insert([
    {empresa_id:empId,nombre:'Contado',dias_vencimiento:0},
    {empresa_id:empId,nombre:'Transferencia 30 días',dias_vencimiento:30},
    {empresa_id:empId,nombre:'Transferencia 60 días',dias_vencimiento:60},
    {empresa_id:empId,nombre:'Efectivo',dias_vencimiento:0},
    {empresa_id:empId,nombre:'Tarjeta',dias_vencimiento:0},
  ]);
  // Series
  await sb.from('series_numeracion').insert([
    {empresa_id:empId,tipo:'presupuesto',serie:'PRES',descripcion:'Presupuestos',por_defecto:true},
    {empresa_id:empId,tipo:'albaran',serie:'ALB',descripcion:'Albaranes',por_defecto:true},
    {empresa_id:empId,tipo:'factura',serie:'FAC',descripcion:'Facturas',por_defecto:true},
    {empresa_id:empId,tipo:'pedido_compra',serie:'PC',descripcion:'Pedidos compra',por_defecto:true},
    {empresa_id:empId,tipo:'recepcion',serie:'REC',descripcion:'Recepciones',por_defecto:true},
    {empresa_id:empId,tipo:'traspaso',serie:'TRS',descripcion:'Traspasos',por_defecto:true},
    {empresa_id:empId,tipo:'parte_trabajo',serie:'PRT',descripcion:'Partes trabajo',por_defecto:true},
  ]);
  // Almacén central
  await sb.from('almacenes').insert({empresa_id:empId,nombre:'Almacén Central',tipo:'central'});
  // Familias
  await sb.from('familias_articulos').insert([
    {empresa_id:empId,nombre:'Fontanería',orden:1},
    {empresa_id:empId,nombre:'Calefacción',orden:2},
    {empresa_id:empId,nombre:'Aire Acondicionado',orden:3},
    {empresa_id:empId,nombre:'Energías Renovables',orden:4},
    {empresa_id:empId,nombre:'Electricidad',orden:5},
    {empresa_id:empId,nombre:'Herramientas',orden:6},
    {empresa_id:empId,nombre:'Materiales de obra',orden:7},
    {empresa_id:empId,nombre:'Maquinaria',orden:8},
  ]);
}

async function doLogout() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionStorage.removeItem('erp_session_active');
  CU = null; CP = null; EMPRESA = null;
  await sb.auth.signOut();
  location.reload();
}

// ═══════════════════════════════════════════════
//  SHOW APP
// ═══════════════════════════════════════════════
async function mostrarApp() {
  showScreen('s-app');
  // Sidebar
  document.getElementById('sbNombre').textContent = CP?.nombre || CU.email;
  document.getElementById('sbRol').textContent = CP?.es_superadmin ? 'Superadmin' : 'Usuario';
  document.getElementById('sbAv').textContent = (CP?.nombre||'?')[0].toUpperCase();
  document.getElementById('sbEmpNombre').textContent = EMPRESA?.nombre || '—';
  document.getElementById('sbEmpAv').textContent = (EMPRESA?.nombre||'E')[0].toUpperCase();
  document.getElementById('sbEmpRole').textContent = CP?.es_superadmin ? 'Administrador' : 'Usuario';
  // Admin menu
  if (CP?.es_superadmin) {
    const as1=document.getElementById('adminSec'); if(as1)as1.style.display='block'; const as2=document.getElementById('adminSection'); if(as2)as2.style.display='block';
    const bu=document.getElementById('btnUsuarios'); if(bu)bu.style.display='flex'; const bc=document.getElementById('btnConfig'); if(bc)bc.style.display='flex';
  }
  // Mostrar logo si existe
  if (EMPRESA?.logo_url) {
    const sbMark = document.querySelector('.sb-logo .mark');
    if (sbMark) {
      sbMark.style.background = '#fff';
      sbMark.innerHTML = `<img src="${EMPRESA.logo_url}" style="width:100%;height:100%;object-fit:contain;padding:3px">`;
    }
    const prev = document.getElementById('logoPreview');
    if (prev) prev.innerHTML = `<img src="${EMPRESA.logo_url}" style="width:100%;height:100%;object-fit:contain;padding:4px">`;
  }
  // Fecha
  applySbCollapsed();
  // Set default favorites if first time
  if (!localStorage.getItem('sb_favoritos')) {
    sbFavoritos = ['clientes','trabajos','presupuestos'];
    localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
  }
  renderFavoritos();
  document.getElementById('pgSub').textContent = new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('tr_fecha').value = new Date().toISOString().split('T')[0];
  // Cargar datos
  await cargarTodos();
  loadDashboard();
}

async function cargarTodos() {
  const eid = EMPRESA.id;
  const [c,pv,art,alm,tr,iva,ud,fp,fam,ser,emp] = await Promise.all([
    sb.from('clientes').select('*').eq('empresa_id',eid).order('nombre'),
    sb.from('proveedores').select('*').eq('empresa_id',eid).order('nombre'),
    sb.from('articulos').select('*').eq('empresa_id',eid).order('codigo'),
    sb.from('almacenes').select('*').eq('empresa_id',eid).order('nombre'),
    sb.from('trabajos').select('*').eq('empresa_id',eid).neq('estado','eliminado').order('created_at',{ascending:false}),
    sb.from('tipos_iva').select('*').eq('empresa_id',eid).order('porcentaje'),
    sb.from('unidades_medida').select('*').eq('empresa_id',eid).order('nombre'),
    sb.from('formas_pago').select('*').eq('empresa_id',eid).order('nombre'),
    sb.from('familias_articulos').select('*').eq('empresa_id',eid).order('orden'),
    sb.from('series_numeracion').select('*').eq('empresa_id',eid).order('tipo'),
    sb.from('empresas').select('id,nombre').eq('id',eid),
  ]);
  clientes=c.data||[]; proveedores=pv.data||[]; articulos=art.data||[];
  almacenes=alm.data||[]; trabajos=tr.data||[];
  tiposIva=iva.data||[]; unidades=ud.data||[]; formasPago=fp.data||[];
  familias=fam.data||[]; series=ser.data||[]; empresas=emp.data||[];
  renderAll();
}

function renderAll() {
  cliFiltroList = [...clientes];
  renderClientes(clientes);
  renderProveedores(proveedores);
  renderArticulos(articulos);
  renderAlmacenes();
  renderTrabajos();
  renderConfigLists();
  populateSelects();
  // Aplicar estado datos sensibles (ocultos por defecto)
  if (typeof _ocultarSensibles !== 'undefined' && _ocultarSensibles) {
    document.body.classList.add('ocultar-sensibles');
    const btn = document.getElementById('btnSensible');
    if (btn) btn.innerHTML = '🔒 DATOS OCULTOS';
  }
}

// ═══════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}

// ─── Forzar spellcheck en todos los campos de texto ───
function forzarSpellcheck(root) {
  root.querySelectorAll('input:not([type="hidden"]):not([type="number"]):not([type="email"]):not([type="password"]):not([type="date"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]), textarea').forEach(el => {
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('autocorrect', 'on');
  });
}
// Aplicar al cargar
forzarSpellcheck(document);
// Aplicar a modales dinámicos cuando se abren
new MutationObserver(mutations => {
  mutations.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) forzarSpellcheck(n); }));
}).observe(document.body, { childList: true, subtree: true });
