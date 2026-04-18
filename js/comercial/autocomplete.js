// ═══════════════════════════════════════════════
// Autocomplete module - Provider & Company lookup
// ═══════════════════════════════════════════════

// Provider autocomplete
let acMouseOverProv = false;
let acTimerProv = null;

async function acEmpresaProv(q) {
  const drop = document.getElementById('acDropdownProv');
  if (!q || q.length < 3) { acHideProv(); return; }
  clearTimeout(acTimerProv);
  acTimerProv = setTimeout(async () => {
    drop.style.display = 'block';
    drop.innerHTML = '<div class="ac-loading">🔍 Buscando en BORME...</div>';
    try {
      const API_KEY = 'cef311906a8a85b4f8264d5d0013c9fa524316cb013320b18b3faedaec6ea9bd';
      const targetUrl = `https://apiempresas.es/api/v1/companies/search?name=${encodeURIComponent(q)}&limit=6`;
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl, { headers: { 'X-API-KEY': API_KEY, 'Accept': 'application/json' } });
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
          if (items.length > 0) {
            drop.innerHTML = '<div style="padding:6px 12px;font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;letter-spacing:.05em">🇪🇸 Empresas españolas (BORME)</div>' +
              items.slice(0,6).map(e => `
                <div class="ac-item" onmousedown="event.preventDefault();acSeleccionarProv(${JSON.stringify(e).replace(/"/g,'&quot;')})">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:18px">🏭</span>
                    <div>
                      <strong>${e.name||e.nombre||''}</strong>
                      <small style="color:var(--gris-400)">${e.cif||e.nif||''} · ${e.province||e.provincia||''} · ${e.status||e.estado||''}</small>
                    </div>
                  </div>
                </div>`).join('');
            return;
          }
        }
      } catch(_) { /* BORME no disponible, usar fallback */ }
      const res2 = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && data2.length > 0) {
          drop.innerHTML = '<div style="padding:6px 12px;font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase">🌍 Internacional</div>' +
            data2.slice(0,5).map(e => `
              <div class="ac-item" onmousedown="event.preventDefault();acSeleccionarProv(${JSON.stringify(e).replace(/"/g,'&quot;')})">
                <div style="display:flex;align-items:center;gap:8px">
                  ${e.logo ? `<img src="${e.logo}" style="width:20px;height:20px;border-radius:3px;object-fit:contain">` : '<span>🏭</span>'}
                  <div><strong>${e.name}</strong><small>${e.domain||''}</small></div>
                </div>
              </div>`).join('');
          return;
        }
      }
    } catch(e) {}
    drop.innerHTML = '<div class="ac-loading">Sin resultados</div>';
  }, 350);
}

function acHideProv() {
  if (acMouseOverProv) return;
  const drop = document.getElementById('acDropdownProv');
  if (drop) drop.style.display = 'none';
}

function acSeleccionarProv(empresa) {
  const nombre = empresa.name || empresa.nombre || empresa.razon_social || '';
  const cif    = empresa.cif || empresa.nif || '';
  const dir    = empresa.address || empresa.direccion || empresa.domicilio || '';
  const muni   = empresa.municipality || empresa.municipio || empresa.localidad || '';
  const prov   = empresa.province || empresa.provincia || '';
  const cp     = empresa.postal_code || empresa.cp || '';

  const set = (id, val) => { const el=document.getElementById(id); if(el&&val) el.value=val; };
  set('pv_nombre', nombre);
  set('pv_cif', cif);
  set('pv_dir', dir);
  set('pv_muni', muni);
  set('pv_prov', prov);
  set('pv_cp', cp);
  if (empresa.domain) set('pv_web', 'https://'+empresa.domain);

  if (cp && !prov) {
    const p = CP_PROV[cp.slice(0,2)];
    if (p) { const el=document.getElementById('pv_prov'); if(el)el.value=p; }
  }

  acMouseOverProv = false;
  acHideProv();
  document.getElementById('pv_nombre')?.focus();
  const msg = [nombre, cif, prov].filter(Boolean).join(' · ');
  toast('✓ ' + msg, 'success');
}

// Company autocomplete
let acTimer = null;
let acMouseOver = false;

async function acEmpresa(q) {
  const drop = document.getElementById('acDropdown');
  if (!q || q.length < 3) { acHide(); return; }

  clearTimeout(acTimer);
  acTimer = setTimeout(async () => {
    drop.style.display = 'block';
    drop.innerHTML = '<div class="ac-loading">🔍 Buscando...</div>';

    try {
      const API_KEY = 'cef311906a8a85b4f8264d5d0013c9fa524316cb013320b18b3faedaec6ea9bd';
      const targetUrl = `https://apiempresas.es/api/v1/companies/search?name=${encodeURIComponent(q)}&limit=6`;
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl, {
          headers: { 'X-API-KEY': API_KEY, 'Accept': 'application/json' }
        });
        if (res.ok) {
          const json = await res.json();
          const data = json.data || json.results || json || [];
          const items = Array.isArray(data) ? data : [];
          if (items.length > 0) {
            drop.innerHTML = '<div style="padding:6px 12px;font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;letter-spacing:.05em">🇪🇸 Empresas españolas (BORME)</div>' +
              items.slice(0,6).map(e => `
                <div class="ac-item" onmousedown="event.preventDefault();acSeleccionarExterno(${JSON.stringify(e).replace(/"/g,'&quot;')})">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:18px">🏢</span>
                    <div>
                      <strong>${e.name||e.nombre||e.razon_social||''}</strong>
                      <small style="color:var(--gris-400)">${e.cif||e.nif||''} · ${e.province||e.provincia||''} · ${e.status||e.estado||''}</small>
                    </div>
                  </div>
                </div>`).join('');
            return;
          }
        }
      } catch(_) { /* BORME no disponible, usar fallback */ }
      const res2 = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && data2.length > 0) {
          drop.innerHTML = '<div style="padding:6px 12px;font-size:10px;font-weight:700;color:var(--gris-400);text-transform:uppercase;letter-spacing:.05em">🌍 Empresas internacionales</div>' +
            data2.slice(0,5).map(e => `
              <div class="ac-item" onmousedown="event.preventDefault();acSeleccionarExterno(${JSON.stringify(e).replace(/"/g,'&quot;')})">
                <div style="display:flex;align-items:center;gap:8px">
                  ${e.logo ? `<img src="${e.logo}" style="width:20px;height:20px;border-radius:3px;object-fit:contain">` : '<span style="font-size:16px">🏢</span>'}
                  <div><strong>${e.name}</strong><small>${e.domain||''}</small></div>
                </div>
              </div>`).join('');
          return;
        }
      }
    } catch(e) {}
    drop.innerHTML = '<div class="ac-loading">Sin resultados</div>';
  }, 350);
}

function acSeleccionarExterno(empresa) {
  const nombre = empresa.name || empresa.nombre || empresa.razon_social || '';
  const cif    = empresa.cif || empresa.nif || '';
  const dir    = empresa.address || empresa.direccion || empresa.domicilio || '';
  const muni   = empresa.municipality || empresa.municipio || empresa.localidad || '';
  const prov   = empresa.province || empresa.provincia || '';
  const cp     = empresa.postal_code || empresa.cp || '';
  const estado = empresa.status || empresa.estado || '';

  const set = (id, val) => { const el=document.getElementById(id); if(el&&val) el.value=val; };
  set('c_nombre', nombre);
  set('c_nif', cif);
  set('c_dir', dir);
  set('c_muni', muni);
  set('c_prov', prov);
  set('c_cp', cp);
  if (empresa.domain) set('c_email', 'info@' + empresa.domain);

  const tipo = document.getElementById('c_tipo');
  if (tipo) tipo.value = 'Empresa';

  if (cp && !prov) cpToProvincia(cp, 'c_prov');

  const nifEl = document.getElementById('c_nif');
  if (nifEl) checkNIFLive(nifEl);

  acMouseOver = false;
  acHide();
  document.getElementById('c_nombre')?.focus();
  const msg = [nombre, cif, prov].filter(Boolean).join(' · ');
  toast('✓ ' + msg, 'success');
}

function acSeleccionar(cliente) {
  const fields = {
    c_nombre: cliente.nombre, c_nif: cliente.nif||'',
    c_tel: cliente.telefono||'', c_movil: cliente.movil||'',
    c_email: cliente.email||'', c_dir: cliente.direccion_fiscal||'',
    c_muni: cliente.municipio_fiscal||'', c_cp: cliente.cp_fiscal||'',
    c_prov: cliente.provincia_fiscal||'', c_notas: cliente.observaciones||'',
    c_descuento: cliente.descuento_habitual||0
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  if (cliente.tipo) document.getElementById('c_tipo').value = cliente.tipo;
  if (cliente.forma_pago_id) document.getElementById('c_fpago').value = cliente.forma_pago_id;
  document.getElementById('c_id').value = cliente.id || '';
  acHide();
  toast('Datos del cliente cargados ✓','success');
}

function acHide() {
  if (acMouseOver) return;
  const drop = document.getElementById('acDropdown');
  if (drop) drop.style.display = 'none';
}
