// ═══════════════════════════════════════════════
// Trash/Recycle bin for deleted documents - Papelera
// ═══════════════════════════════════════════════

// Audit log viewer
async function loadAuditLog() {
  const tbody = document.getElementById('auditTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--gris-400)">Cargando...</td></tr>';
  const filtro = document.getElementById('auditFiltroEntidad')?.value || '';
  let q = sb.from('audit_log').select('*').eq('empresa_id', EMPRESA.id).order('created_at', {ascending: false}).limit(100);
  if (filtro) q = q.eq('entidad', filtro);
  const { data, error } = await q;
  if (error) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--rojo)">Error al cargar: '+error.message+'<br><small>¿Has ejecutado SQL_audit_log.sql en Supabase?</small></td></tr>';
    return;
  }
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--gris-400)">Sin registros de actividad</td></tr>';
    return;
  }
  const accionIco = {crear:'🆕',modificar:'✏️',eliminar:'🗑️',cambiar_estado:'🏷️',crear_obra:'🏗️',restaurar_version:'♻️'};
  const accionColor = {crear:'var(--verde)',modificar:'var(--azul)',eliminar:'var(--rojo)',cambiar_estado:'var(--amarillo)',crear_obra:'var(--violeta)',restaurar_version:'var(--acento)'};
  tbody.innerHTML = data.map(r => {
    const dt = new Date(r.created_at);
    const fecha = dt.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hora = dt.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const ico = accionIco[r.accion]||'📝';
    const col = accionColor[r.accion]||'var(--gris-600)';
    return `<tr>
      <td style="white-space:nowrap;font-size:12px"><div>${fecha}</div><div style="color:var(--gris-400);font-size:11px">${hora}</div></td>
      <td><div style="font-weight:600;font-size:13px">${r.usuario_nombre||'—'}</div></td>
      <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:${col};font-weight:600">${ico} ${r.accion}</span></td>
      <td><span class="badge bg-blue" style="font-size:11px">${r.entidad}</span></td>
      <td style="font-size:12px;color:var(--gris-600);max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.detalle||'—'}</td>
    </tr>`;
  }).join('');
}

// Trash (deleted documents)
async function loadPapelera() {
  if (!CP?.es_superadmin) { toast('Solo superadmin puede ver la papelera','error'); return; }
  const tbody = document.getElementById('papeleraTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gris-400)">Cargando...</td></tr>';

  const filtro = document.getElementById('papeleraFiltro')?.value || '';
  const tablas = filtro ? [filtro] : ['presupuestos','albaranes','facturas','trabajos'];
  const tipoLabels = {presupuestos:'Presupuesto',albaranes:'Albarán',facturas:'Factura',trabajos:'Obra'};
  const tipoIcos = {presupuestos:'📋',albaranes:'📄',facturas:'🧾',trabajos:'🏗️'};
  const tipoColors = {presupuestos:'var(--azul)',albaranes:'var(--acento)',facturas:'var(--verde)',trabajos:'var(--violeta)'};

  let items = [];
  for (const tabla of tablas) {
    let res = await sb.from(tabla).select('*')
      .eq('empresa_id', EMPRESA.id).eq('estado', 'eliminado')
      .order('created_at', {ascending: false});
    if (res.error) {
      console.warn('Papelera error en', tabla, ':', res.error.message);
      res = await sb.from(tabla).select('*')
        .eq('empresa_id', EMPRESA.id).eq('estado', 'eliminado');
    }
    if (res.error) {
      console.error('Papelera error definitivo en', tabla, ':', res.error.message);
      continue;
    }
    console.log('Papelera', tabla, ':', res.data?.length || 0, 'eliminados');
    if (res.data?.length) {
      res.data.forEach(d => items.push({...d, _tabla: tabla}));
    }
  }

  const auditMap = {};
  if (items.length) {
    const ids = items.map(i => String(i.id));
    const { data: audits } = await sb.from('audit_log').select('*')
      .eq('empresa_id', EMPRESA.id).eq('accion', 'eliminar')
      .in('entidad_id', ids)
      .order('created_at', {ascending: false});
    if (audits) {
      audits.forEach(a => {
        if (!auditMap[a.entidad_id]) auditMap[a.entidad_id] = a;
      });
    }
  }

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="ei">🗑️</div><h3>Papelera vacía</h3><p>No hay documentos eliminados</p></div></td></tr>';
    return;
  }

  items.sort((a,b) => new Date(b.updated_at||0) - new Date(a.updated_at||0));

  tbody.innerHTML = items.map(item => {
    const tabla = item._tabla;
    const label = tipoLabels[tabla]||tabla;
    const ico = tipoIcos[tabla]||'📄';
    const col = tipoColors[tabla]||'var(--gris-500)';
    const audit = auditMap[String(item.id)];
    const eliminadoPor = audit?.usuario_nombre || '—';
    const fechaElim = audit?.created_at ? new Date(audit.created_at) : (item.updated_at ? new Date(item.updated_at) : (item.created_at ? new Date(item.created_at) : null));
    const fechaStr = fechaElim ? fechaElim.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+fechaElim.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
    const dias = fechaElim ? Math.floor((Date.now()-fechaElim.getTime())/(1000*60*60*24)) : null;
    const diasStr = dias !== null ? (dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : dias+' días') : '';

    return `<tr>
      <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:${col}">${ico} ${label}</span></td>
      <td style="font-weight:700;font-family:monospace;font-size:12.5px">${item.numero||'—'}</td>
      <td>${item.cliente_nombre||'—'}</td>
      <td style="font-weight:600">${typeof item.total==='number'?fmtE(item.total):'—'}</td>
      <td>
        <div style="font-weight:600;font-size:13px">${eliminadoPor}</div>
        ${audit?.detalle?'<div style="font-size:10px;color:var(--gris-400);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+audit.detalle+'">'+audit.detalle+'</div>':''}
      </td>
      <td style="font-size:12px">
        <div>${fechaStr}</div>
        <div style="font-size:10px;color:var(--gris-400)">hace ${diasStr}</div>
      </td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="verEliminado('${tabla}',${item.id})" title="Ver detalle">👁️</button>
          <button class="btn btn-ghost btn-sm" onclick="restaurarEliminado('${tabla}',${item.id},'${item.numero||''}')" title="Restaurar">♻️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function verEliminado(tabla, id) {
  const { data: doc } = await sb.from(tabla).select('*').eq('id', id).single();
  if (!doc) { toast('No encontrado','error'); return; }
  const tipoLabels = {presupuestos:'Presupuesto',albaranes:'Albarán',facturas:'Factura',trabajos:'Obra'};
  let detalle = `${tipoLabels[tabla]||tabla}: ${doc.numero||'—'}\n`;
  detalle += `Cliente: ${doc.cliente_nombre||'—'}\n`;
  detalle += `Fecha: ${doc.fecha||'—'}\n`;
  if (doc.total!=null) detalle += `Importe: ${fmtE(doc.total)}\n`;
  if (doc.titulo) detalle += `Título: ${doc.titulo}\n`;
  if (doc.observaciones) detalle += `Observaciones: ${doc.observaciones}\n`;
  if (doc.lineas?.length) detalle += `Líneas: ${doc.lineas.filter(l=>l.tipo!=='capitulo'&&l.tipo!=='subcapitulo').length} partidas\n`;
  alert(detalle);
}

async function restaurarEliminado(tabla, id, numero) {
  if (!CP?.es_superadmin) { toast('Solo superadmin','error'); return; }
  const nuevoEstado = (tabla==='presupuestos') ? 'anulado' : 'pendiente';
  if (!confirm('♻️ Restaurar '+numero+'?\n\nSe restaurará con estado "'+nuevoEstado+'"')) return;
  const { error } = await sb.from(tabla).update({estado: nuevoEstado}).eq('id', id);
  if (error) { toast('Error: '+error.message,'error'); return; }
  registrarAudit('restaurar', tabla.replace(/s$/,''), id, 'Restaurado desde papelera: '+numero+' → '+nuevoEstado);
  toast('♻️ '+numero+' restaurado','success');
  loadPapelera();
  if (tabla==='presupuestos') await loadPresupuestos();
  if (tabla==='albaranes') await loadAlbaranes();
  loadDashboard();
}
