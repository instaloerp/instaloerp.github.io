// ═══════════════════════════════════════════════
// Works/Jobs management - Trabajos/Obras
// ═══════════════════════════════════════════════

// Docs attached to work
let trDocsFiles = [];

// Filtro por defecto: año en curso al cargar
function initFiltroTrabajos() {
  const y = new Date().getFullYear();
  const dEl = document.getElementById('trDesde');
  const hEl = document.getElementById('trHasta');
  if (dEl && !dEl.value) dEl.value = y + '-01-01';
  if (hEl && !hEl.value) hEl.value = y + '-12-31';
}

function filtrarTrabajos() {
  const q = (document.getElementById('trSearch')?.value||'').toLowerCase();
  const est = document.getElementById('trEstado')?.value||'';
  const des = document.getElementById('trDesde')?.value||'';
  const has = document.getElementById('trHasta')?.value||'';
  const filtered = trabajos.filter(t => {
    if (est && t.estado !== est) return false;
    if (q && !(t.numero||'').toLowerCase().includes(q) && !(t.titulo||'').toLowerCase().includes(q) && !(t.cliente_nombre||'').toLowerCase().includes(q)) return false;
    if (des && t.fecha && t.fecha < des) return false;
    if (has && t.fecha && t.fecha > has) return false;
    return true;
  });
  renderTrabajos(filtered);
}

function renderTrabajos(list) {
  if (!list) list = trabajos;
  document.getElementById('trabTable').innerHTML = list.length ?
    list.map(t=>`<tr>
      <td style="font-family:monospace;font-size:11.5px;font-weight:700;color:var(--azul)">${t.numero}</td>
      <td style="font-weight:700">${t.titulo}</td>
      <td>${t.cliente_nombre||'—'}</td>
      <td style="font-size:11.5px">${t.fecha||'—'}</td>
      <td>${estadoBadge(t.estado)}</td>
      <td>${prioBadge(t.prioridad)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="delTrabajo(${t.id})">🗑️</button>
      </div></td>
    </tr>`).join('') :
    '<tr><td colspan="7"><div class="empty"><div class="ei">🏗️</div><h3>Sin obras</h3></div></td></tr>';
}

function tr_addDocs(files) {
  Array.from(files).forEach(f => { if(!trDocsFiles.find(x=>x.name===f.name)) trDocsFiles.push(f); });
  tr_renderDocs();
}

function tr_dropDocs(e) {
  e.preventDefault();
  document.getElementById('tr_doc_zone').style.borderColor='var(--gris-300)';
  tr_addDocs(e.dataTransfer.files);
}

function tr_removeDoc(name) {
  trDocsFiles = trDocsFiles.filter(f=>f.name!==name);
  tr_renderDocs();
}

function tr_renderDocs() {
  const icons = {'pdf':'📄','doc':'📝','docx':'📝','jpg':'🖼️','jpeg':'🖼️','png':'🖼️','xlsx':'📊','xls':'📊'};
  document.getElementById('tr_doc_list').innerHTML = trDocsFiles.map(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    const ico = icons[ext]||'📎';
    const size = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : Math.round(f.size/1024)+'KB';
    return `<div style="display:flex;align-items:center;gap:5px;background:var(--gris-50);border:1px solid var(--gris-200);border-radius:6px;padding:4px 9px;font-size:12px">
      ${ico} <span>${f.name}</span> <span style="color:var(--gris-400)">${size}</span>
      <button onclick="tr_removeDoc('${f.name}')" style="background:none;border:none;cursor:pointer;color:var(--rojo);margin-left:3px;font-size:13px">✕</button>
    </div>`;
  }).join('');
}

async function saveTrabajo() {
  const titulo=document.getElementById('tr_titulo').value.trim();
  if(!titulo){toast('Introduce el título','error');return;}
  const cliId=parseInt(document.getElementById('tr_cli').value)||null;
  const cli=clientes.find(c=>c.id===cliId);
  const num=`TRB-${new Date().getFullYear()}-${String(trabajos.length+1).padStart(3,'0')}`;
  const {error}=await sb.from('trabajos').insert({
    empresa_id:EMPRESA.id,numero:num,titulo,
    cliente_id:cliId,cliente_nombre:cli?.nombre||'',
    prioridad:v('tr_prio'),categoria:v('tr_cat'),
    fecha:v('tr_fecha'),hora:v('tr_hora'),
    direccion_obra_texto:v('tr_dir'),descripcion:v('tr_desc'),
    estado:'pendiente',operario_id:CU.id,operario_nombre:CP?.nombre||''
  });
  if(error){toast('Error: '+error.message,'error');return;}
  closeModal('mTrabajo');
  const {data}=await sb.from('trabajos').select('*').eq('empresa_id',EMPRESA.id).neq('estado','eliminado').order('created_at',{ascending:false});
  trabajos=data||[]; renderTrabajos(); loadDashboard();
  toast(`Trabajo ${num} creado ✓`,'success');
}

async function delTrabajo(id) {
  if(!confirm('¿Eliminar trabajo?'))return;
  await sb.from('trabajos').delete().eq('id',id);
  trabajos=trabajos.filter(t=>t.id!==id); renderTrabajos(); loadDashboard();
  toast('Eliminado','info');
}

function prioBadge(p) {
  const m={Urgente:'<span class="badge bg-red">🔴</span>',Alta:'<span class="badge" style="background:#FFF4ED;color:var(--acento)">🟠</span>',Normal:'<span class="badge bg-gray">⚪</span>',Baja:'<span class="badge bg-gray">🔵</span>'};
  return m[p]||'';
}

