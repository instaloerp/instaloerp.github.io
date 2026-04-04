// ═══════════════════════════════════════════════════════════════════════
// PLANIFICADOR SEMANAL — Programación visual de partes de trabajo
// Vista de semana con días como columnas, horas como filas, operarios como filas
// ═══════════════════════════════════════════════════════════════════════

let planFechaBase = new Date();
let planPartesCache = [];
let planOperariosCache = [];
let planTrabajosCache = [];
let planOperarioFiltro = ''; // '' = Todos
let planModoEdicion = null;  // null = crear, parteId = editar

const PLAN_H_INI = 7;
const PLAN_H_FIN = 20;
const PLAN_PX_HORA = 54; // px por hora
const PLAN_COLORES = {
  borrador:    { c:'#9CA3AF', bg:'#F3F4F6' },
  programado:  { c:'#3B82F6', bg:'#EFF6FF' },
  en_curso:    { c:'#D97706', bg:'#FFFBEB' },
  completado:  { c:'#059669', bg:'#ECFDF5' },
  revisado:    { c:'#10B981', bg:'#D1FAE5' },
  facturado:   { c:'#8B5CF6', bg:'#F5F3FF' },
};

// ─── Helpers ───────────────────────────────────────────────────────

function _planFmt(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function _planLunes(fecha) {
  const d = new Date(fecha);
  const dow = d.getDay() || 7; // dom=7
  d.setDate(d.getDate() - dow + 1);
  d.setHours(0,0,0,0);
  return d;
}

function _planDuracion(p) {
  if (!p.hora_inicio || !p.hora_fin) return 1;
  const [hi,mi] = p.hora_inicio.split(':').map(Number);
  const [hf,mf] = p.hora_fin.split(':').map(Number);
  const dur = ((hf*60+mf) - (hi*60+mi)) / 60;
  return dur > 0 ? dur : 1;
}

function _planOpNombre(op) {
  return ((op.nombre||'') + ' ' + (op.apellidos||'')).trim() || 'Sin nombre';
}

// ─── Navegación ────────────────────────────────────────────────────

function planSemAnt()  { planFechaBase.setDate(planFechaBase.getDate()-7); renderPlanificador(); }
function planSemSig()  { planFechaBase.setDate(planFechaBase.getDate()+7); renderPlanificador(); }
function planHoy()     { planFechaBase = new Date(); renderPlanificador(); }

// ─── Carga de datos ────────────────────────────────────────────────

async function cargarDatosPlan() {
  if (!EMPRESA) return;
  try {
    const [pR, oR, tR] = await Promise.all([
      sb.from('partes_trabajo').select('*').eq('empresa_id', EMPRESA.id).neq('estado','eliminado'),
      sb.from('perfiles').select('id,nombre,apellidos,disponible_partes,activo').eq('empresa_id', EMPRESA.id).eq('activo', true),
      sb.from('trabajos').select('id,numero,titulo,cliente_id').eq('empresa_id', EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false}),
    ]);
    planPartesCache = pR.data || [];
    planOperariosCache = (oR.data || []).filter(o => o.disponible_partes === true);
    planTrabajosCache = tR.data || [];
  } catch(e) {
    console.error('[Plan] Error cargando:', e);
    toast('Error cargando datos del planificador', 'error');
  }
}

// ─── Poblar selects ────────────────────────────────────────────────

function _planPoblarSelects() {
  // Filtro operario (cabecera)
  const fOp = document.getElementById('planFiltroOp');
  if (fOp) {
    const cur = fOp.value;
    fOp.innerHTML = '<option value="">👥 Todos los operarios</option>';
    planOperariosCache.forEach(o => { fOp.innerHTML += `<option value="${o.id}">${_planOpNombre(o)}</option>`; });
    fOp.value = cur;
  }
  // Modal: operario
  const mOp = document.getElementById('planNP_operario');
  if (mOp) {
    const cur = mOp.value;
    mOp.innerHTML = '<option value="">— Selecciona operario —</option>';
    planOperariosCache.forEach(o => { mOp.innerHTML += `<option value="${o.id}">${_planOpNombre(o)}</option>`; });
    mOp.value = cur;
  }
  // Modal: obra
  const mTr = document.getElementById('planNP_trabajo');
  if (mTr) {
    const cur = mTr.value;
    mTr.innerHTML = '<option value="">— Sin obra —</option>';
    planTrabajosCache.forEach(t => { mTr.innerHTML += `<option value="${t.id}">${t.numero ? '#'+t.numero+' ' : ''}${t.titulo}</option>`; });
    mTr.value = cur;
  }
}

// ─── Render principal ──────────────────────────────────────────────

async function renderPlanificador() {
  await cargarDatosPlan();
  _planPoblarSelects();

  const lunes = _planLunes(planFechaBase);
  const hoy = _planFmt(new Date());

  // Actualizar label semana
  const dom = new Date(lunes); dom.setDate(dom.getDate()+6);
  const lbl = document.getElementById('planSemLabel');
  if (lbl) {
    lbl.textContent = lunes.toLocaleDateString('es-ES',{day:'numeric',month:'short'}) + ' — ' + dom.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
  }

  // Días de la semana
  const dias = [];
  for (let i=0; i<7; i++) {
    const d = new Date(lunes); d.setDate(d.getDate()+i);
    dias.push({ date: d, key: _planFmt(d) });
  }

  // Filtrar partes de la semana
  const semKeys = new Set(dias.map(d => d.key));
  const partesSem = planPartesCache.filter(p => p.fecha && semKeys.has(p.fecha));

  // Operarios a mostrar
  const filtro = document.getElementById('planFiltroOp')?.value || '';
  let ops = [];
  if (filtro) {
    const op = planOperariosCache.find(o => o.id === filtro);
    if (op) ops = [op];
  } else {
    ops = [...planOperariosCache];
  }

  // Si no hay operarios registrados
  if (!ops.length) {
    const cont = document.getElementById('planGrid');
    if (cont) cont.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--gris-400)"><div style="font-size:40px;margin-bottom:12px">👷</div><div style="font-size:14px">No hay operarios con partes habilitados</div></div>';
    return;
  }

  const container = document.getElementById('planGrid');
  if (!container) return;

  // ── Cabecera días ──
  const dayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html = `<div style="display:flex;border-bottom:2px solid var(--gris-200);position:sticky;top:0;z-index:5;background:#fff">`;
  html += `<div style="width:130px;min-width:130px;padding:8px;font-size:11px;font-weight:700;color:var(--gris-400)">OPERARIO</div>`;
  dias.forEach((d,i) => {
    const isHoy = d.key === hoy;
    const isWe = i >= 5;
    html += `<div style="flex:1;text-align:center;padding:8px 4px;${isHoy?'background:var(--azul-light);':''}${isWe?'opacity:.6;':''}">
      <div style="font-size:11px;font-weight:700;color:${isHoy?'var(--azul)':'var(--gris-500)'}">${dayNames[i]}</div>
      <div style="font-size:16px;font-weight:800;color:${isHoy?'var(--azul)':'var(--gris-800)'}">${d.date.getDate()}</div>
    </div>`;
  });
  html += `</div>`;

  // ── Filas por operario ──
  ops.forEach(op => {
    const opPartes = partesSem.filter(p => p.usuario_id === op.id);
    const ini = _planOpNombre(op)[0]?.toUpperCase() || '?';

    html += `<div style="display:flex;border-bottom:1px solid var(--gris-100);min-height:${(PLAN_H_FIN-PLAN_H_INI)*PLAN_PX_HORA}px">`;

    // Columna operario
    html += `<div style="width:130px;min-width:130px;padding:10px 8px;border-right:1px solid var(--gris-200);background:var(--gris-50)">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--azul);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${ini}</div>
        <div style="font-size:11.5px;font-weight:700;color:var(--gris-700);line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_planOpNombre(op)}</div>
      </div>
      <div style="margin-top:6px;font-size:10px;color:var(--gris-400)">${opPartes.length} partes</div>
    </div>`;

    // 7 columnas de días
    dias.forEach((d,i) => {
      const isHoy = d.key === hoy;
      const isWe = i >= 5;
      const dayPartes = opPartes.filter(p => p.fecha === d.key).sort((a,b) => (a.hora_inicio||'').localeCompare(b.hora_inicio||''));

      html += `<div style="flex:1;position:relative;border-right:1px solid var(--gris-100);${isHoy?'background:rgba(27,79,216,.03);':''}${isWe?'background:var(--gris-50);':''}" onclick="planClickSlot(event,'${d.key}','${op.id}')">`;

      // Líneas horarias de fondo
      for (let h = PLAN_H_INI; h < PLAN_H_FIN; h++) {
        html += `<div style="height:${PLAN_PX_HORA}px;border-bottom:1px solid var(--gris-100);position:relative">
          ${h === PLAN_H_INI ? `<span style="position:absolute;top:2px;left:2px;font-size:9px;color:var(--gris-300)">${String(h).padStart(2,'0')}:00</span>` : ''}
        </div>`;
      }

      // Bloques de partes
      dayPartes.forEach(p => {
        const hi = p.hora_inicio ? p.hora_inicio.split(':').map(Number) : [PLAN_H_INI, 0];
        const top = ((hi[0] + hi[1]/60) - PLAN_H_INI) * PLAN_PX_HORA;
        const dur = _planDuracion(p);
        const height = Math.max(dur * PLAN_PX_HORA, 24);
        const est = PLAN_COLORES[p.estado] || PLAN_COLORES.programado;
        const titulo = p.trabajo_titulo || 'Sin obra';
        const horaStr = (p.hora_inicio||'').substring(0,5) + '-' + (p.hora_fin||'').substring(0,5);

        // Detectar conflicto (otro parte del mismo operario solapado)
        const conflicto = dayPartes.some(other => {
          if (other.id === p.id) return false;
          const oHi = other.hora_inicio || '00:00';
          const oHf = other.hora_fin || '23:59';
          const pHi = p.hora_inicio || '00:00';
          const pHf = p.hora_fin || '23:59';
          return pHi < oHf && pHf > oHi;
        });

        html += `<div onclick="event.stopPropagation();planVerDetalle(${p.id})" style="position:absolute;top:${top}px;left:2px;right:2px;height:${height}px;background:${est.bg};border-left:3px solid ${est.c};border-radius:4px;padding:3px 5px;cursor:pointer;overflow:hidden;font-size:10.5px;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.08);${conflicto?'border-right:3px solid var(--rojo);':''}">
          <div style="font-weight:700;color:var(--gris-800);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${titulo}</div>
          <div style="color:var(--gris-500);font-size:9.5px">${horaStr}</div>
          ${height > 40 && p.descripcion ? `<div style="color:var(--gris-400);font-size:9px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.descripcion.substring(0,40)}</div>` : ''}
        </div>`;
      });

      html += `</div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html;
}

// ─── Click en slot vacío → abrir modal crear ───────────────────────

function planClickSlot(evt, fecha, opId) {
  if (evt.target.closest('[onclick*="planVerDetalle"]')) return;
  // Calcular hora del click basado en posición Y
  const rect = evt.currentTarget.getBoundingClientRect();
  const y = evt.clientY - rect.top;
  const hora = Math.floor(y / PLAN_PX_HORA) + PLAN_H_INI;
  const horaStr = String(Math.min(hora, PLAN_H_FIN-1)).padStart(2,'0') + ':00';
  const horaFinStr = String(Math.min(hora+1, PLAN_H_FIN)).padStart(2,'0') + ':00';

  planModoEdicion = null;
  document.getElementById('planNP_titulo').textContent = '📅 Nuevo Parte';
  document.getElementById('planNP_btnGuardar').textContent = '✅ Crear parte';
  document.getElementById('planNP_fecha').value = fecha;
  document.getElementById('planNP_operario').value = opId;
  document.getElementById('planNP_horaInicio').value = horaStr;
  document.getElementById('planNP_horaFin').value = horaFinStr;
  document.getElementById('planNP_trabajo').value = '';
  document.getElementById('planNP_desc').value = '';
  document.getElementById('planNuevoOverlay').classList.add('open');
}

// ─── Ver detalle parte ─────────────────────────────────────────────

function planVerDetalle(id) {
  const p = planPartesCache.find(x => x.id === id);
  if (!p) return;
  const op = planOperariosCache.find(o => o.id === p.usuario_id);
  const tr = planTrabajosCache.find(t => t.id === p.trabajo_id);
  const est = PLAN_COLORES[p.estado] || PLAN_COLORES.programado;
  const dur = _planDuracion(p);

  const estadoLabels = { borrador:'Borrador', programado:'Programado', en_curso:'En curso', completado:'Completado', revisado:'Revisado', facturado:'Facturado' };

  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:5px;height:40px;border-radius:3px;background:${est.c}"></div>
      <div>
        <div style="font-size:16px;font-weight:800">${tr ? tr.titulo : (p.trabajo_titulo||'Sin obra')}</div>
        <div style="font-size:12px;color:var(--gris-400)">${p.numero ? '#'+p.numero+' · ' : ''}${op ? _planOpNombre(op) : 'Sin asignar'}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><div style="font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;margin-bottom:2px">Fecha</div><div style="font-size:13px;font-weight:600">${p.fecha ? new Date(p.fecha+'T12:00:00').toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'}) : '—'}</div></div>
      <div><div style="font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;margin-bottom:2px">Horario</div><div style="font-size:13px;font-weight:600">${(p.hora_inicio||'').substring(0,5)} — ${(p.hora_fin||'').substring(0,5)} (${dur.toFixed(1)}h)</div></div>
      <div><div style="font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;margin-bottom:2px">Estado</div><div style="display:inline-block;padding:3px 10px;border-radius:6px;background:${est.bg};color:${est.c};font-size:12px;font-weight:700">${estadoLabels[p.estado]||p.estado}</div></div>
      <div><div style="font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;margin-bottom:2px">Dirección</div><div style="font-size:12px;color:var(--gris-600)">${p.direccion||'—'}</div></div>
    </div>
    ${p.descripcion ? `<div style="margin-bottom:16px;padding:10px;background:var(--gris-50);border-radius:8px;font-size:12.5px;color:var(--gris-600)">${p.descripcion}</div>` : ''}
    <div style="display:flex;gap:8px;border-top:1px solid var(--gris-200);padding-top:14px">
      <button class="btn btn-sm" style="background:var(--azul);color:#fff" onclick="planEditarParte(${id})">✏️ Editar</button>
      <button class="btn btn-sm" style="background:var(--rojo-light);color:var(--rojo)" onclick="planEliminarParte(${id})">🗑️ Eliminar</button>
      <div style="flex:1"></div>
      <button class="btn btn-sm" style="background:var(--gris-100);color:var(--gris-600)" onclick="document.getElementById('planDetalleOverlay').classList.remove('open')">Cerrar</button>
    </div>
  `;
  document.getElementById('planDetalleContent').innerHTML = html;
  document.getElementById('planDetalleOverlay').classList.add('open');
}

// ─── Editar parte existente ────────────────────────────────────────

function planEditarParte(id) {
  const p = planPartesCache.find(x => x.id === id);
  if (!p) return;

  planModoEdicion = id;
  document.getElementById('planNP_titulo').textContent = '✏️ Editar Parte';
  document.getElementById('planNP_btnGuardar').textContent = '💾 Guardar cambios';
  document.getElementById('planNP_fecha').value = p.fecha || '';
  document.getElementById('planNP_operario').value = p.usuario_id || '';
  document.getElementById('planNP_horaInicio').value = (p.hora_inicio||'').substring(0,5) || '08:00';
  document.getElementById('planNP_horaFin').value = (p.hora_fin||'').substring(0,5) || '09:00';
  document.getElementById('planNP_trabajo').value = p.trabajo_id || '';
  document.getElementById('planNP_desc').value = p.descripcion || '';

  document.getElementById('planDetalleOverlay').classList.remove('open');
  document.getElementById('planNuevoOverlay').classList.add('open');
}

// ─── Guardar parte (crear o actualizar) ────────────────────────────

async function planGuardarParte() {
  const fecha = document.getElementById('planNP_fecha').value;
  const opId = document.getElementById('planNP_operario').value;
  const hi = document.getElementById('planNP_horaInicio').value;
  const hf = document.getElementById('planNP_horaFin').value;
  const trId = document.getElementById('planNP_trabajo').value;
  const desc = document.getElementById('planNP_desc').value;

  if (!fecha || !opId) { toast('Selecciona fecha y operario', 'error'); return; }
  if (!hi || !hf) { toast('Indica hora inicio y fin', 'error'); return; }

  // Validar hora fin > hora inicio
  if (hf <= hi) { toast('La hora de fin debe ser posterior a la de inicio', 'error'); return; }

  // Detectar conflictos
  const conflictos = planPartesCache.filter(p => {
    if (planModoEdicion && p.id === planModoEdicion) return false;
    if (p.usuario_id !== opId || p.fecha !== fecha) return false;
    const pHi = (p.hora_inicio||'').substring(0,5);
    const pHf = (p.hora_fin||'').substring(0,5);
    return hi < pHf && hf > pHi;
  });

  if (conflictos.length > 0) {
    const msg = conflictos.map(c => `• ${(c.hora_inicio||'').substring(0,5)}-${(c.hora_fin||'').substring(0,5)} ${c.trabajo_titulo||'Sin obra'}`).join('\n');
    if (!confirm(`⚠️ Hay ${conflictos.length} parte(s) solapados:\n\n${msg}\n\n¿Crear de todos modos?`)) return;
  }

  // Obtener trabajo_titulo
  const trabajo = trId ? planTrabajosCache.find(t => t.id === trId) : null;

  const payload = {
    fecha,
    usuario_id: opId,
    hora_inicio: hi + ':00',
    hora_fin: hf + ':00',
    trabajo_id: trId || null,
    trabajo_titulo: trabajo ? trabajo.titulo : null,
    descripcion: desc || null,
    empresa_id: EMPRESA.id,
    estado: 'programado',
  };

  const btn = document.getElementById('planNP_btnGuardar');
  if (btn) btn.disabled = true;

  try {
    if (planModoEdicion) {
      const { error } = await sb.from('partes_trabajo').update(payload).eq('id', planModoEdicion);
      if (error) throw error;
      toast('✅ Parte actualizado', 'success');
    } else {
      // Generar número: máximo actual + 1
      const maxNum = planPartesCache.reduce((max, p) => Math.max(max, p.numero || 0), 0);
      payload.numero = maxNum + 1;

      const { error } = await sb.from('partes_trabajo').insert([payload]);
      if (error) throw error;
      toast('✅ Parte creado — #' + payload.numero, 'success');
    }

    document.getElementById('planNuevoOverlay').classList.remove('open');
    planModoEdicion = null;
    await renderPlanificador();
  } catch(e) {
    console.error('[Plan] Error guardando:', e);
    toast('Error: ' + (e.message || 'desconocido'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── Eliminar parte ────────────────────────────────────────────────

async function planEliminarParte(id) {
  if (!confirm('¿Eliminar este parte? Se marcará como eliminado.')) return;
  try {
    const { error } = await sb.from('partes_trabajo').update({ estado:'eliminado' }).eq('id', id);
    if (error) throw error;
    toast('Parte eliminado', 'success');
    document.getElementById('planDetalleOverlay').classList.remove('open');
    await renderPlanificador();
  } catch(e) {
    toast('Error: ' + (e.message || 'desconocido'), 'error');
  }
}

// ─── Cerrar modal nuevo parte ──────────────────────────────────────

function planCerrarNuevo() {
  document.getElementById('planNuevoOverlay').classList.remove('open');
  planModoEdicion = null;
}

// ─── Init ──────────────────────────────────────────────────────────

async function initPlanificador() {
  await renderPlanificador();
}
