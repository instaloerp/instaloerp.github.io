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
//  Anti-duplicados: protección contra doble clic en botones de crear
// ═══════════════════════════════════════════════
let _creando = false;
function withGuard(fn) {
  return async function(...args) {
    if (_creando) { console.log('[Guard] Operación en curso, ignorando clic'); return; }
    _creando = true;
    try {
      await fn.apply(this, args);
    } finally {
      _creando = false;
    }
  };
}

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
let CU = null, CP = null, EMPRESA = null;
let clientes=[], proveedores=[], articulos=[], almacenes=[], trabajos=[];
let tiposIva=[], unidades=[], formasPago=[], familias=[], series=[];
let empresas=[];
let cuentasBancariasEntidad = []; // Cuentas bancarias de clientes y proveedores
let prIvaDefault = null;

// ═══════════════════════════════════════════════
//  SESSION TIMEOUT (inactividad) con aviso previo
// ═══════════════════════════════════════════════
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos de inactividad
const SESSION_WARNING_MS = 2 * 60 * 1000;  // Avisar 2 minutos antes
let sessionTimer = null;
let sessionWarningTimer = null;
let _sessionWarningVisible = false;
let _countdownInterval = null;

function resetSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  // Si el aviso estaba visible, cerrarlo (el usuario interactuó)
  if (_sessionWarningVisible) {
    _closeSessionWarning();
  }
  // Solo activar timer si hay sesión activa
  if (CU) {
    // Timer de aviso: salta a los 28 min (30 - 2)
    sessionWarningTimer = setTimeout(() => {
      _showSessionWarning();
    }, SESSION_TIMEOUT_MS - SESSION_WARNING_MS);
    // Timer de cierre: salta a los 30 min
    sessionTimer = setTimeout(() => {
      _closeSessionWarning();
      toast('Sesión cerrada por inactividad', 'warning');
      setTimeout(() => doLogout(), 1500);
    }, SESSION_TIMEOUT_MS);
  }
}

function _showSessionWarning() {
  _sessionWarningVisible = true;
  let _countdownSecs = Math.round(SESSION_WARNING_MS / 1000);
  // Crear modal de aviso si no existe
  let overlay = document.getElementById('sessionWarningOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sessionWarningOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:99999;';
    overlay.innerHTML = `
      <div style="background:white;border-radius:16px;padding:32px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="font-size:48px;margin-bottom:12px;">⏰</div>
        <h3 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">¿Sigues ahí?</h3>
        <p style="margin:0 0 6px;color:#666;font-size:14px;">Tu sesión se cerrará por inactividad en</p>
        <div id="sessionCountdown" style="font-size:36px;font-weight:700;color:#EF4444;margin:8px 0 16px;">${_countdownSecs}s</div>
        <p style="margin:0 0 20px;color:#999;font-size:12px;">Pulsa cualquier tecla o haz clic para continuar</p>
        <button onclick="_userDismissSessionWarning()" style="padding:10px 32px;border-radius:10px;border:none;background:var(--azul-500,#3B82F6);color:white;font-weight:600;font-size:15px;cursor:pointer;">Continuar trabajando</button>
      </div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
    const cd = document.getElementById('sessionCountdown');
    if (cd) cd.textContent = _countdownSecs + 's';
  }
  // Iniciar cuenta atrás visual
  if (_countdownInterval) clearInterval(_countdownInterval);
  _countdownInterval = setInterval(() => {
    _countdownSecs--;
    const cd = document.getElementById('sessionCountdown');
    if (cd) cd.textContent = (_countdownSecs > 0 ? _countdownSecs : 0) + 's';
    if (_countdownSecs <= 0) { clearInterval(_countdownInterval); _countdownInterval = null; }
  }, 1000);
}

function _closeSessionWarning() {
  _sessionWarningVisible = false;
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  const overlay = document.getElementById('sessionWarningOverlay');
  if (overlay) overlay.style.display = 'none';
}

function _userDismissSessionWarning() {
  // El usuario hizo clic en "Continuar trabajando" → resetear timers
  _closeSessionWarning();
  resetSessionTimer();
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
  // ── Detectar recovery token en la URL (Supabase lo pone en el hash) ──
  const hashParams = new URLSearchParams(window.location.hash.replace('#','?'));
  if (hashParams.get('type') === 'recovery' || hashParams.get('type') === 'password_recovery') {
    // Supabase ya procesó el token y creó sesión temporal — mostrar pantalla de nueva contraseña
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      CU = session.user;
      showScreen('s-nueva-pass');
      // Limpiar hash de la URL
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }
  }

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
//  RECUPERACIÓN DE CONTRASEÑA
// ═══════════════════════════════════════════════
async function enviarRecuperacion() {
  const email = document.getElementById('recEmail').value.trim();
  document.getElementById('recErr').style.display = 'none';
  document.getElementById('recOk').style.display = 'none';
  if (!email) { showErr('recErr','Introduce tu email'); return; }

  // URL de retorno: la misma página (Supabase añadirá el token en el hash)
  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    showErr('recErr', 'Error al enviar: ' + error.message);
    return;
  }
  const ok = document.getElementById('recOk');
  ok.textContent = '✅ Enlace enviado. Revisa tu bandeja de entrada (y la carpeta de spam).';
  ok.style.display = 'block';
}

async function cambiarPassword() {
  const pass1 = document.getElementById('newPass1').value;
  const pass2 = document.getElementById('newPass2').value;
  document.getElementById('npErr').style.display = 'none';
  document.getElementById('npOk').style.display = 'none';

  if (!pass1 || !pass2) { showErr('npErr','Completa ambos campos'); return; }
  if (pass1.length < 8) { showErr('npErr','La contraseña debe tener al menos 8 caracteres'); return; }
  if (pass1 !== pass2) { showErr('npErr','Las contraseñas no coinciden'); return; }

  const { error } = await sb.auth.updateUser({ password: pass1 });
  if (error) {
    showErr('npErr', 'Error: ' + error.message);
    return;
  }
  const ok = document.getElementById('npOk');
  ok.textContent = '✅ Contraseña actualizada correctamente. Redirigiendo...';
  ok.style.display = 'block';

  // Cerrar sesión temporal de recovery y redirigir al login
  setTimeout(async () => {
    await sb.auth.signOut();
    CU = null;
    showScreen('s-login');
    toast('Contraseña actualizada. Inicia sesión con tu nueva contraseña.', 'success');
  }, 2000);
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

function forceCacheClear() {
  if (!confirm('Se va a borrar la caché y recargar la aplicación.\n\n¿Continuar?')) return;
  if ('caches' in window) { caches.keys().then(names => names.forEach(n => caches.delete(n))); }
  if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())); }
  window.location.reload(true);
}

async function doLogout() {
  if (sessionTimer) clearTimeout(sessionTimer);
  if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  _closeSessionWarning();
  sessionStorage.removeItem('erp_session_active');
  CU = null; CP = null; EMPRESA = null;
  await sb.auth.signOut();
  // Borrar caché y Service Workers al salir
  if ('caches' in window) { caches.keys().then(names => names.forEach(n => caches.delete(n))); }
  if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())); }
  // Recargar limpio
  window.location.reload(true);
}

// ═══════════════════════════════════════════════
//  SHOW APP
// ═══════════════════════════════════════════════
async function mostrarApp() {
  showScreen('s-app');
  // Quitar el form de login del DOM para evitar que macOS/Chrome ofrezcan autocompletar contraseñas al refrescar — build 133
  try { document.getElementById('s-login')?.remove(); } catch(e) {}
  // Sidebar
  document.getElementById('sbNombre').textContent = CP?.nombre || CU.email;
  const rolTxt = CP?.es_superadmin ? 'Admin' : 'Usuario';
  const empTxt = EMPRESA?.nombre || '';
  document.getElementById('sbRol').textContent = empTxt ? `${empTxt} · ${rolTxt}` : rolTxt;
  document.getElementById('sbAv').textContent = (CP?.nombre||'?')[0].toUpperCase();
  // sb-emp-selector eliminado — empresa se muestra en sbRol
  const elEmpNombre = document.getElementById('sbEmpNombre'); if(elEmpNombre) elEmpNombre.textContent = EMPRESA?.nombre || '—';
  const elEmpAv = document.getElementById('sbEmpAv'); if(elEmpAv) elEmpAv.textContent = (EMPRESA?.nombre||'E')[0].toUpperCase();
  const elEmpRole = document.getElementById('sbEmpRole'); if(elEmpRole) elEmpRole.textContent = CP?.es_superadmin ? 'Administrador' : 'Usuario';
  // Admin menu
  if (CP?.es_superadmin) {
    const as1=document.getElementById('adminSec'); if(as1)as1.style.display='block'; const as2=document.getElementById('adminSection'); if(as2)as2.style.display='block';
    const bu=document.getElementById('btnUsuarios'); if(bu)bu.style.display='flex'; const bc=document.getElementById('btnConfig'); if(bc)bc.style.display='flex'; const bl=document.getElementById('btnLaboratorio'); if(bl)bl.style.display='flex';
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
    sbFavoritos = ['dashboard','correo','mistareas','clientes'];
    localStorage.setItem('sb_favoritos', JSON.stringify(sbFavoritos));
  }
  renderFavoritos();
  // Cargar preferencias sidebar desde Supabase (sobreescribe localStorage si hay datos guardados)
  if (typeof sbCargarPrefsSupabase === 'function') sbCargarPrefsSupabase();
  document.getElementById('pgTitle').textContent = '🏠 Panel';
  document.getElementById('pgSub').textContent = _fechaHoraActual();
  document.getElementById('tr_fecha').value = new Date().toISOString().split('T')[0];
  // Cargar datos
  await cargarTodos();
  loadDashboard();
  // Suscripción Realtime — notificaciones de partes
  initRealtimePartes();
}

// ═══════════════════════════════════════════════
// REALTIME — Notificaciones en tiempo real
// Escucha cambios externos: partes, presupuestos,
// documentos generados, etc.
// ═══════════════════════════════════════════════
let _rtChannel = null;
// Cache local de estados: parteId → estado (payload.old no incluye campos por defecto en Supabase)
const _partesEstadoCache = new Map();
// Cache presupuestos para evitar duplicados
const _presEstadoCache = new Map();

// Poblar cache cuando se cargan partes
function _populateEstadoCache(partes) {
  if (!partes) return;
  partes.forEach(p => { if (p.id && p.estado) _partesEstadoCache.set(p.id, p.estado); });
}
// Poblar cache presupuestos
function _populatePresCache(lista) {
  if (!lista) return;
  lista.forEach(p => { if (p.id) _presEstadoCache.set(p.id, { estado: p.estado, firmado: !!p.pdf_firmado_url }); });
}

function initRealtimePartes() {
  if (!EMPRESA) return;
  // Realtime activo para admin, jefe y superadmin (no solo superadmin)
  const _rolRT = CP?.rol || '';
  if (!CP?.es_superadmin && _rolRT !== 'admin' && _rolRT !== 'jefe') return;
  if (_rtChannel) { sb.removeChannel(_rtChannel); _rtChannel = null; }

  // Poblar caches iniciales
  if (typeof partesData !== 'undefined' && Array.isArray(partesData)) {
    _populateEstadoCache(partesData);
  }
  if (typeof presupuestos !== 'undefined' && Array.isArray(presupuestos)) {
    _populatePresCache(presupuestos);
  }

  console.log('[Realtime] Iniciando suscripción general para empresa:', EMPRESA.id);

  // ─── Handler: Partes de trabajo ───
  function _handleParteChange(payload) {
    const nuevo = payload.new;
    if (!nuevo) { console.log('[Realtime] Payload sin .new:', payload); return; }

    console.log('[Realtime] Parte:', payload.eventType || payload.type, nuevo.numero, 'estado:', nuevo.estado);

    // Comparar con cache local para evitar duplicados
    const estadoPrevio = _partesEstadoCache.get(nuevo.id);
    if (estadoPrevio && estadoPrevio === nuevo.estado) {
      console.log('[Realtime] Mismo estado parte que cache, ignorando');
      return;
    }
    _partesEstadoCache.set(nuevo.id, nuevo.estado);

    const operario = nuevo.usuario_nombre || 'Un operario';
    const numero = nuevo.numero || '';
    const obra = nuevo.trabajo_titulo || '';
    const obraId = nuevo.trabajo_id || null;

    // Notificación según estado (solo para los relevantes)
    const notifs = {
      en_curso:   { ico:'🔧', titulo:'Trabajo iniciado',    msg:`${operario} ha iniciado ${numero}`,        color:'var(--acento)' },
      completado: { ico:'✅', titulo:'Parte cumplimentado', msg:`${operario} ha cumplimentado ${numero}`,   color:'var(--verde)'  },
      revisado:   { ico:'👁️', titulo:'Parte revisado',      msg:`${numero} marcado como revisado`,          color:'#10B981'       },
      facturado:  { ico:'🧾', titulo:'Parte facturado',     msg:`${numero} marcado como facturado`,         color:'#8B5CF6'       },
    };
    const n = notifs[nuevo.estado];
    if (n) {
      console.log('[Realtime] Mostrando notificación parte:', n.titulo);
      showRealtimeNotif(n.ico, n.titulo, `${n.msg}${obra ? ' — ' + obra : ''}`, n.color, nuevo.id);
      if (Notification.permission === 'granted') {
        try { new Notification(`${n.ico} ${n.titulo}`, { body: n.msg + (obra ? ' — ' + obra : ''), icon: 'assets/icon-192.png' }); } catch(e) {}
      }
    }

    // Siempre refrescar tabla de partes y dashboard (cualquier cambio de estado)
    if (typeof loadPartes === 'function') { try { loadPartes(); } catch(e) {} }
    if (obraId && typeof obraActualId !== 'undefined' && obraActualId && obraActualId === obraId) {
      try { abrirFichaObra(obraActualId, false); } catch(e) {}
    }
    if (typeof loadDashboard === 'function') { try { loadDashboard(); } catch(e) {} }
  }

  // ─── Handler: Presupuestos (firma cliente, cambio estado externo) ───
  function _handlePresupuestoChange(payload) {
    const nuevo = payload.new;
    if (!nuevo) return;

    console.log('[Realtime] Presupuesto:', payload.eventType || payload.type, nuevo.numero, 'estado:', nuevo.estado, 'firmado:', !!nuevo.pdf_firmado_url);

    const cached = _presEstadoCache.get(nuevo.id);
    const tieneFirma = !!nuevo.pdf_firmado_url;
    const cambioEstado = !cached || cached.estado !== nuevo.estado;
    const cambioFirma = !cached || cached.firmado !== tieneFirma;

    if (!cambioEstado && !cambioFirma) {
      console.log('[Realtime] Sin cambios relevantes en presupuesto, ignorando');
      return;
    }
    _presEstadoCache.set(nuevo.id, { estado: nuevo.estado, firmado: tieneFirma });

    // Notificación cuando un cliente firma
    if (cambioFirma && tieneFirma) {
      const cliente = nuevo.cliente_nombre || '';
      const num = nuevo.numero || '';
      showRealtimeNotif('🔏', 'Presupuesto firmado', `${cliente} ha firmado ${num}`, 'var(--verde)', nuevo.id);
      if (Notification.permission === 'granted') {
        try { new Notification('🔏 Presupuesto firmado', { body: `${cliente} ha firmado ${num}`, icon: 'icon.svg' }); } catch(e) {}
      }
    }

    // Notificación cuando cambia estado (aceptado externamente)
    if (cambioEstado && nuevo.estado === 'aceptado' && !cambioFirma) {
      const num = nuevo.numero || '';
      showRealtimeNotif('✅', 'Presupuesto aceptado', `${num} ha sido aceptado`, 'var(--verde)', nuevo.id);
    }

    // Auto-refrescar presupuestos
    if (typeof loadPresupuestos === 'function') { try { loadPresupuestos(); } catch(e) {} }
    if (typeof loadDashboard === 'function') { try { loadDashboard(); } catch(e) {} }
  }

  // ─── Handler: Documentos generados (nuevos docs firmados, etc.) ───
  function _handleDocumentoGenerado(payload) {
    const nuevo = payload.new;
    if (!nuevo) return;

    console.log('[Realtime] Documento generado:', nuevo.tipo_documento, nuevo.numero, 'firmado:', nuevo.firmado);

    // Refrescar presupuestos si el doc es de presupuesto
    if (nuevo.tipo_documento === 'presupuesto' && typeof loadPresupuestos === 'function') {
      try { loadPresupuestos(); } catch(e) {}
    }

    // Si estamos en ficha de cliente y es su documento, refrescar
    if (nuevo.entidad_tipo === 'cliente' && nuevo.entidad_id && typeof clienteActualId !== 'undefined' && clienteActualId == nuevo.entidad_id) {
      if (typeof abrirFichaCliente === 'function') { try { abrirFichaCliente(clienteActualId, false); } catch(e) {} }
    }
  }

  // ─── Canal unificado con todas las tablas ───
  _rtChannel = sb.channel('erp-realtime')
    // Partes de trabajo
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'partes_trabajo', filter: `empresa_id=eq.${EMPRESA.id}` },
      _handleParteChange
    )
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'partes_trabajo', filter: `empresa_id=eq.${EMPRESA.id}` },
      _handleParteChange
    )
    // Presupuestos
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'presupuestos', filter: `empresa_id=eq.${EMPRESA.id}` },
      _handlePresupuestoChange
    )
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'presupuestos', filter: `empresa_id=eq.${EMPRESA.id}` },
      _handlePresupuestoChange
    )
    // Documentos generados
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'documentos_generados', filter: `empresa_id=eq.${EMPRESA.id}` },
      _handleDocumentoGenerado
    )
    // Tareas de obra — refrescar dashboard al cambiar cualquier tarea
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'tareas_obra', filter: `empresa_id=eq.${EMPRESA.id}` },
      () => { if (typeof loadDashboard === 'function') loadDashboard(); }
    )
    // Trabajos (obras) — refrescar dashboard al crear/modificar una obra
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'trabajos', filter: `empresa_id=eq.${EMPRESA.id}` },
      async () => {
        // Recargar lista global de trabajos y luego el dashboard
        try {
          const { data } = await sb.from('trabajos').select('*').eq('empresa_id', EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
          if (data) trabajos = data;
        } catch(e) {}
        if (typeof loadDashboard === 'function') loadDashboard();
      }
    )
    // Artículos — se crean desde OCR móvil
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'articulos', filter: `empresa_id=eq.${EMPRESA.id}` },
      async () => {
        try {
          const { data } = await sb.from('articulos').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
          if (data) {
            articulos = data;
            if (typeof _invalidarArtProvMap === 'function') _invalidarArtProvMap();
            // Solo re-renderizar si estamos en la página de artículos
            const pageArt = document.getElementById('page-articulos');
            if (pageArt && pageArt.classList.contains('active') && typeof renderArticulos === 'function') {
              renderArticulos(articulos);
            }
          }
        } catch(e) {}
      }
    )
    // Stock — cambia desde OCR y consumos móvil
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'stock', filter: `empresa_id=eq.${EMPRESA.id}` },
      async () => {
        try {
          if (typeof _invalidarArtStockMap === 'function') _invalidarArtStockMap();
          const pageStock = document.getElementById('page-stock');
          if (pageStock && pageStock.classList.contains('active') && typeof loadStock === 'function') loadStock();
          // Refrescar artículos si están visibles (para actualizar columna Ubicación)
          const pageArt = document.getElementById('page-articulos');
          if (pageArt && pageArt.classList.contains('active') && typeof renderArticulos === 'function' && typeof articulos !== 'undefined') {
            await _cargarArtStockMap();
            _renderArticulosTabla(artFiltrados || articulos);
          }
        } catch(e) {}
      }
    )
    // Proveedores — se crean desde OCR móvil
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'proveedores', filter: `empresa_id=eq.${EMPRESA.id}` },
      async () => {
        try {
          const { data } = await sb.from('proveedores').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
          if (data && typeof proveedores !== 'undefined') {
            proveedores = data;
            if (typeof _invalidarArtProvMap === 'function') _invalidarArtProvMap();
            const pageProv = document.getElementById('page-proveedores');
            if (pageProv && pageProv.classList.contains('active') && typeof renderProveedores === 'function') renderProveedores(proveedores);
          }
        } catch(e) {}
      }
    )
    // Clientes — por si se añaden desde otras fuentes
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'clientes', filter: `empresa_id=eq.${EMPRESA.id}` },
      async (payload) => {
        try {
          const { data } = await sb.from('clientes').select('*').eq('empresa_id', EMPRESA.id).order('nombre');
          if (data) {
            clientes = data;
            const pageCli = document.getElementById('page-clientes');
            if (pageCli && pageCli.classList.contains('active') && typeof renderClientes === 'function') renderClientes(clientes);
          }
          // Propagar firma SEPA remota a cuenta bancaria predeterminada (anon no puede via RLS)
          try {
            const nuevo = payload?.new;
            const viejo = payload?.old;
            const firmoAhora = nuevo?.mandato_sepa_estado === 'firmado'
              && (viejo?.mandato_sepa_estado !== 'firmado' || !viejo?.mandato_sepa_firma_url)
              && nuevo?.mandato_sepa_firma_url;
            if (firmoAhora) {
              const upd = {
                mandato_sepa_estado: 'firmado',
                mandato_sepa_fecha: nuevo.mandato_sepa_fecha,
                mandato_sepa_firma_url: nuevo.mandato_sepa_firma_url,
                mandato_sepa_ref: nuevo.mandato_sepa_ref || null,
              };
              await sb.from('cuentas_bancarias_entidad').update(upd)
                .eq('tipo_entidad','cliente').eq('entidad_id', nuevo.id).eq('predeterminada', true);
            }
          } catch(e) { console.warn('Propagar SEPA a cuenta:', e); }

          // Si hay ficha cliente abierta y es este cliente: refrescar (p.ej. tras firma SEPA remota)
          const changedId = payload?.new?.id || payload?.old?.id;
          if (changedId && typeof cliActualId !== 'undefined' && cliActualId === changedId && typeof abrirFicha === 'function') {
            // Recargar cuentas bancarias también
            try {
              const { data: cbe } = await sb.from('cuentas_bancarias_entidad').select('*').eq('tipo_entidad','cliente').eq('entidad_id', cliActualId);
              if (cbe && typeof cuentasBancariasEntidad !== 'undefined') {
                cuentasBancariasEntidad = cuentasBancariasEntidad.filter(x => !(x.tipo_entidad==='cliente' && x.entidad_id===cliActualId));
                cuentasBancariasEntidad.push(...cbe);
              }
            } catch(e) {}
            abrirFicha(cliActualId);
          }
        } catch(e) {}
      }
    )
    // Cuentas bancarias entidad — tras firma SEPA remota
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'cuentas_bancarias_entidad', filter: `empresa_id=eq.${EMPRESA.id}` },
      async (payload) => {
        try {
          const row = payload?.new || payload?.old;
          if (!row) return;
          if (typeof cuentasBancariasEntidad !== 'undefined') {
            if (payload.eventType === 'DELETE') {
              cuentasBancariasEntidad = cuentasBancariasEntidad.filter(x => x.id !== row.id);
            } else {
              const idx = cuentasBancariasEntidad.findIndex(x => x.id === row.id);
              if (idx >= 0) cuentasBancariasEntidad[idx] = row;
              else cuentasBancariasEntidad.push(row);
            }
          }
          if (row.tipo_entidad === 'cliente' && typeof cliActualId !== 'undefined' && cliActualId === row.entidad_id && typeof abrirFicha === 'function') {
            abrirFicha(cliActualId);
          }
        } catch(e) {}
      }
    )
    // Traspasos — reposiciones y movimientos entre almacenes
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'traspasos', filter: `empresa_id=eq.${EMPRESA.id}` },
      () => {
        console.log('[Realtime] Cambio en traspasos detectado');
        if (typeof loadTraspasos === 'function') loadTraspasos();
      }
    )
    .subscribe((status, err) => {
      console.log('[Realtime] Status:', status, err ? 'Error: ' + err.message : '');
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] ✅ Suscripción activa — escuchando: partes, presupuestos, docs, tareas, trabajos, artículos, stock, proveedores, clientes, traspasos');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Realtime] ❌ Error de conexión. Verifica que las tablas están en la publicación supabase_realtime');
      }
    });

  // Pedir permiso notificaciones del sistema
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showRealtimeNotif(ico, titulo, msg, color, parteId) {
  // Crear elemento de notificación
  let container = document.getElementById('rt-notifs');
  if (!container) {
    container = document.createElement('div');
    container.id = 'rt-notifs';
    container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:8px;max-width:400px;pointer-events:none';
    document.body.appendChild(container);
  }

  const notif = document.createElement('div');
  notif.style.cssText = `
    pointer-events:auto;cursor:pointer;
    background:#fff;border-radius:12px;padding:14px 18px;
    box-shadow:0 8px 30px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05);
    display:flex;align-items:flex-start;gap:12px;
    animation:rtSlideIn .4s ease;
    border-left:4px solid ${color};
    max-width:400px;
  `;
  notif.innerHTML = `
    <span style="font-size:28px;line-height:1;flex-shrink:0">${ico}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:800;font-size:14px;color:var(--gris-900);margin-bottom:2px">${titulo}</div>
      <div style="font-size:12.5px;color:var(--gris-500);line-height:1.4">${msg}</div>
      <div style="font-size:10px;color:var(--gris-300);margin-top:4px">${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;font-size:16px;color:var(--gris-300);cursor:pointer;padding:0;line-height:1;flex-shrink:0">✕</button>
  `;

  // Click abre detalle del parte
  notif.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    notif.remove();
    if (parteId && typeof verDetalleParte === 'function') {
      verDetalleParte(parteId);
    }
  });

  container.appendChild(notif);

  // Sonido de notificación (tono corto)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.value = 0.1;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}

  // Auto-remove después de 8 segundos
  setTimeout(() => { if (notif.parentElement) notif.style.animation = 'rtSlideOut .3s ease forwards'; setTimeout(() => notif.remove(), 300); }, 8000);
}

// Inyectar CSS de animación para notificaciones
(function(){
  const style = document.createElement('style');
  style.textContent = `
    @keyframes rtSlideIn { from { transform:translateX(120%);opacity:0 } to { transform:translateX(0);opacity:1 } }
    @keyframes rtSlideOut { from { transform:translateX(0);opacity:1 } to { transform:translateX(120%);opacity:0 } }
  `;
  document.head.appendChild(style);
})();

async function cargarTodos() {
  const eid = EMPRESA.id;
  const [c,pv,art,alm,tr,iva,ud,fp,fam,ser,emp,fac,alb,usr,pres,cbe] = await Promise.all([
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
    sb.from('facturas').select('*').eq('empresa_id',eid).neq('estado','eliminado').order('created_at',{ascending:false}),
    sb.from('albaranes').select('*').eq('empresa_id',eid).neq('estado','eliminado').order('created_at',{ascending:false}),
    sb.from('perfiles').select('*').eq('empresa_id',eid).order('nombre'),
    sb.from('presupuestos').select('*').eq('empresa_id',eid).neq('estado','eliminado').order('created_at',{ascending:false}),
    sb.from('cuentas_bancarias_entidad').select('*').eq('empresa_id',eid).order('predeterminada',{ascending:false}).then(r=>{if(r.error){console.warn('⚠️ cuentas_bancarias_entidad:',r.error.message);return{data:[]};}return r;}).catch(()=>({data:[]})),
  ]);
  clientes=c.data||[]; proveedores=pv.data||[]; articulos=art.data||[];
  cuentasBancariasEntidad = (cbe&&cbe.data) ? cbe.data : [];
  almacenes=alm.data||[]; trabajos=tr.data||[];
  tiposIva=iva.data||[]; unidades=ud.data||[]; formasPago=fp.data||[];
  familias=fam.data||[]; series=ser.data||[]; empresas=emp.data||[];
  window.facturasData=fac.data||[];
  // Sincronizar albaranesData: variable global (let en albaranes.js) + window para acceso cruzado
  albaranesData=alb.data||[];
  window.albaranesData=albaranesData;
  // Sincronizar presupuestos: variable global (let en presupuestos.js) + window para acceso cruzado
  presupuestos=pres.data||[];
  window.presupuestos=presupuestos;
  // Usuarios disponibles globalmente
  todosUsuarios=usr.data||[];
  renderAll();
}

function renderAll() {
  cliFiltroList = [...clientes];
  renderClientes(clientes);
  renderProveedores(proveedores);
  renderArticulos(articulos);
  renderAlmacenes();
  if (typeof initFiltroTrabajos === 'function') initFiltroTrabajos();
  filtrarTrabajos ? filtrarTrabajos() : renderTrabajos();
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
  // Al mostrar la pantalla de login, re-activar type=password y autocomplete para el gestor de contraseñas.
  // En el resto de pantallas mantenemos lPass como type=text (con -webkit-text-security:disc) para
  // evitar que macOS/Chrome ofrezcan autocompletar en cada refresh cuando el usuario ya está logueado.
  try {
    const lp = document.getElementById('lPass');
    if (lp) {
      if (id === 's-login') {
        lp.type = 'password';
        lp.setAttribute('name', 'password');
        lp.setAttribute('autocomplete', 'current-password');
      } else {
        lp.type = 'text';
        lp.removeAttribute('name');
        lp.setAttribute('autocomplete', 'off');
      }
    }
  } catch(e) {}
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}

// ═══════════════════════════════════════════════
//  COMPONENTE: TELÉFONOS MÚLTIPLES
//  Uso en formularios de cliente (modal rápido y ficha completa)
//
//  HTML de contenedor:  <div id="phonesContainer_X"></div>
//  Inicializar:         _phonesInit('X', valorExistente)
//  Recoger valores:     const {telefono, telefonos} = _phonesGet('X')
// ═══════════════════════════════════════════════

const _PHONE_ETIQUETAS = ['Principal', 'Móvil', 'WhatsApp', 'Obra', 'Urgencias', 'Otro'];

function _phonesInit(prefix, telefonoActual = '', telefonosActual = []) {
  const container = document.getElementById('phonesContainer_' + prefix);
  if (!container) return;

  // Construir lista inicial: siempre al menos 1 campo
  const lista = [];
  if (telefonoActual) lista.push({ numero: telefonoActual, etiqueta: 'Principal' });
  else lista.push({ numero: '', etiqueta: 'Principal' });

  (Array.isArray(telefonosActual) ? telefonosActual : []).forEach(t => {
    if (typeof t === 'string') lista.push({ numero: t, etiqueta: 'Móvil' });
    else if (t?.numero)        lista.push(t);
  });

  _phonesRender(prefix, lista);
}

function _phonesRender(prefix, lista) {
  const container = document.getElementById('phonesContainer_' + prefix);
  if (!container) return;

  const iS = 'flex:1;padding:9px 11px;border:1.5px solid var(--gris-200,#e5e7eb);border-radius:9px;font-size:13px;outline:none;box-sizing:border-box;min-width:0';
  const selS = 'padding:9px 6px;border:1.5px solid var(--gris-200,#e5e7eb);border-radius:9px;font-size:12px;outline:none;background:#fff;color:#374151;cursor:pointer';
  const delS = 'padding:8px 10px;border:none;background:none;cursor:pointer;font-size:16px;color:#9CA3AF;flex-shrink:0;border-radius:7px';

  const etiqOpts = _PHONE_ETIQUETAS.map(e => `<option>${e}</option>`).join('');

  const filas = lista.map((item, i) => {
    const esPrimero = i === 0;
    const delBtn = esPrimero ? '' : `<button type="button" onclick="_phoneDel('${prefix}',${i})" style="${delS}" title="Eliminar">✕</button>`;
    const opts = _PHONE_ETIQUETAS.map(e => `<option ${e===item.etiqueta?'selected':''}>${e}</option>`).join('');
    return `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:7px" id="phoneRow_${prefix}_${i}">
        <select onchange="_phoneSetEtiqueta('${prefix}',${i},this.value)" style="${selS}">${opts}</select>
        <input type="tel" inputmode="tel" placeholder="6XX XXX XXX"
          value="${item.numero || ''}"
          oninput="_phoneSetNumero('${prefix}',${i},this.value)"
          style="${iS}"
          ${esPrimero ? 'id="phoneFirst_'+prefix+'"' : ''}>
        ${delBtn}
      </div>`;
  }).join('');

  container.innerHTML = filas + `
    <button type="button" onclick="_phoneAdd('${prefix}')"
      style="padding:7px 12px;border:1.5px dashed var(--gris-200,#e5e7eb);border-radius:9px;background:none;font-size:12px;font-weight:600;color:var(--azul,#3B82F6);cursor:pointer;width:100%;margin-top:2px">
      ➕ Añadir teléfono
    </button>`;

  // Guardar lista en dataset para recuperarla
  container.dataset.phones = JSON.stringify(lista);
}

function _phoneSetNumero(prefix, idx, val) {
  const container = document.getElementById('phonesContainer_' + prefix);
  if (!container) return;
  const lista = JSON.parse(container.dataset.phones || '[]');
  if (lista[idx]) lista[idx].numero = val;
  container.dataset.phones = JSON.stringify(lista);
}

function _phoneSetEtiqueta(prefix, idx, val) {
  const container = document.getElementById('phonesContainer_' + prefix);
  if (!container) return;
  const lista = JSON.parse(container.dataset.phones || '[]');
  if (lista[idx]) lista[idx].etiqueta = val;
  container.dataset.phones = JSON.stringify(lista);
}

function _phoneAdd(prefix) {
  const container = document.getElementById('phonesContainer_' + prefix);
  if (!container) return;
  const lista = JSON.parse(container.dataset.phones || '[]');
  lista.push({ numero: '', etiqueta: _PHONE_ETIQUETAS[Math.min(lista.length, _PHONE_ETIQUETAS.length - 1)] });
  _phonesRender(prefix, lista);
  // Focus en el nuevo campo
  const rows = container.querySelectorAll('input[type="tel"]');
  if (rows.length) rows[rows.length - 1].focus();
}

function _phoneDel(prefix, idx) {
  const container = document.getElementById('phonesContainer_' + prefix);
  if (!container) return;
  let lista = JSON.parse(container.dataset.phones || '[]');
  lista.splice(idx, 1);
  if (lista.length === 0) lista.push({ numero: '', etiqueta: 'Principal' });
  _phonesRender(prefix, lista);
}

function _phonesGet(prefix) {
  const container = document.getElementById('phonesContainer_' + prefix);
  if (!container) return { telefono: null, telefonos: [] };
  const lista = JSON.parse(container.dataset.phones || '[]');

  // Sincronizar con los valores actuales de los inputs (el usuario puede haber tecleado sin disparar oninput en algunos casos)
  container.querySelectorAll('input[type="tel"]').forEach((inp, i) => {
    if (lista[i]) lista[i].numero = inp.value.trim();
  });
  container.querySelectorAll('select').forEach((sel, i) => {
    if (lista[i]) lista[i].etiqueta = sel.value;
  });

  const primero   = lista[0]?.numero?.trim() || null;
  const adicionales = lista.slice(1)
    .map(t => ({ numero: t.numero?.trim() || '', etiqueta: t.etiqueta || 'Móvil' }))
    .filter(t => t.numero);

  return { telefono: primero, telefonos: adicionales };
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
