// ═══════════════════════════════════════════════
// Excel/CSV import module - Importador
// ═══════════════════════════════════════════════

// Import configuration columns
const IMPORT_COLS = {
  clientes: [
    { key: 'nombre',           label: 'Nombre *',           required: true },
    { key: 'tipo',             label: 'Tipo',               hint: 'Particular / Empresa / Comunidad' },
    { key: 'nif',              label: 'NIF/CIF',            },
    { key: 'telefono',         label: 'Teléfono',           },
    { key: 'movil',            label: 'Móvil',              },
    { key: 'email',            label: 'Email',              },
    { key: 'direccion_fiscal', label: 'Dirección',          },
    { key: 'municipio_fiscal', label: 'Municipio',          },
    { key: 'cp_fiscal',        label: 'CP',                 },
    { key: 'provincia_fiscal', label: 'Provincia',          },
    { key: 'observaciones',    label: 'Observaciones',      },
  ],
  proveedores: [
    { key: 'nombre',        label: 'Nombre *',     required: true },
    { key: 'cif',           label: 'CIF/NIF',      },
    { key: 'telefono',      label: 'Teléfono',     },
    { key: 'email',         label: 'Email',        },
    { key: 'email_pedidos', label: 'Email pedidos',},
    { key: 'direccion',     label: 'Dirección',    },
    { key: 'municipio',     label: 'Municipio',    },
    { key: 'cp',            label: 'CP',           },
    { key: 'provincia',     label: 'Provincia',    },
    { key: 'web',           label: 'Web',          },
    { key: 'dias_pago',     label: 'Días pago',    hint: 'Número de días (ej: 30)' },
    { key: 'observaciones', label: 'Observaciones',},
  ],
  articulos: [
    { key: 'codigo',        label: 'Código *',       required: true },
    { key: 'nombre',        label: 'Nombre *',       required: true },
    { key: 'familia',       label: 'Familia',        hint: 'Nombre de la familia' },
    { key: 'precio_coste',  label: 'Precio coste',   hint: 'Número decimal (ej: 12.50)' },
    { key: 'precio_venta',  label: 'Precio venta',   hint: 'Número decimal' },
    { key: 'referencia_fabricante', label: 'Ref. fabricante', },
    { key: 'codigo_barras', label: 'Cód. barras',    },
    { key: 'observaciones', label: 'Observaciones',  },
  ],
};

let importData = { clientes: [], proveedores: [], articulos: [] };

// Download template Excel
function descargarPlantilla(tipo) {
  const cols = IMPORT_COLS[tipo];
  const header = cols.map(c => c.label.replace(' *',''));
  const hint   = cols.map(c => c.hint || '');
  const ejemplo = {
    clientes:    ['Juan García López', 'Particular', '12345678A', '982123456', '650123456', 'juan@email.com', 'Calle Mayor 1', 'Burela', '27880', 'Lugo', ''],
    proveedores: ['Fontanería Pérez S.L.', 'B12345678', '981234567', 'info@perez.es', 'pedidos@perez.es', 'Calle Industrial 5', 'Lugo', '27001', 'Lugo', 'www.perez.es', '30', ''],
    articulos:   ['TUB-001', 'Tubería PVC 20mm', 'Fontanería', '2.50', '4.99', 'TUB20-FAB', '', ''],
  };

  const wb = XLSX.utils.book_new();
  const ws_data = [header, hint.map(h => h ? '('+h+')' : ''), ejemplo[tipo]];
  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  ws['!cols'] = header.map(() => ({ wch: 20 }));

  XLSX.utils.book_append_sheet(wb, ws, tipo.charAt(0).toUpperCase()+tipo.slice(1));
  XLSX.writeFile(wb, `plantilla_${tipo}.xlsx`);
  toast(`Plantilla de ${tipo} descargada ✓`, 'success');
}

// Drop handler
function importDrop(event, tipo) {
  event.preventDefault();
  event.currentTarget.style.borderColor = 'var(--gris-300)';
  const file = event.dataTransfer.files[0];
  if (file) procesarArchivo(file, tipo);
}

// File input handler
function importarExcel(input, tipo) {
  const file = input.files[0];
  if (file) procesarArchivo(file, tipo);
}

function procesarArchivo(file, tipo) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let data = [];
      if (file.name.endsWith('.csv')) {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
        data = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/"/g,''));
          const obj = {};
          headers.forEach((h,i) => obj[h] = vals[i]||'');
          return obj;
        });
      } else {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (raw.length < 2) { toast('El archivo está vacío','error'); return; }

        const headers = raw[0].map(h => String(h).trim().replace(' *','').replace(/[()]/g,''));
        const cols = IMPORT_COLS[tipo];

        const colMap = {};
        headers.forEach((h, i) => {
          const col = cols.find(c =>
            c.label.replace(' *','').toLowerCase() === h.toLowerCase() ||
            c.key.toLowerCase() === h.toLowerCase()
          );
          if (col) colMap[i] = col.key;
        });

        let startRow = 1;
        if (raw[1] && raw[1][0] && String(raw[1][0]).startsWith('(')) startRow = 2;

        data = raw.slice(startRow).filter(row => row.some(v => v !== '')).map(row => {
          const obj = {};
          Object.entries(colMap).forEach(([i, key]) => {
            obj[key] = String(row[i]||'').trim();
          });
          return obj;
        });
      }

      mostrarPreview(data, tipo);
    } catch(err) {
      toast('Error al leer el archivo: '+err.message, 'error');
    }
  };
  if (file.name.endsWith('.csv')) {
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.readAsArrayBuffer(file);
  }
}

function mostrarPreview(data, tipo) {
  importData[tipo] = data;
  const cols = IMPORT_COLS[tipo];
  const prefix = tipo === 'clientes' ? 'Cli' : tipo === 'proveedores' ? 'Prov' : 'Art';

  let errores = 0;
  const validados = data.map((row, i) => {
    const reqs = cols.filter(c => c.required);
    const faltantes = reqs.filter(c => !row[c.key]);
    if (faltantes.length) errores++;
    return { ...row, _fila: i+1, _error: faltantes.map(f=>f.label).join(', ') };
  });
  importData[tipo] = validados;

  const visibles = cols.slice(0, 5);
  const thead = '<thead><tr><th>#</th>' + visibles.map(c=>`<th>${c.label.replace(' *','')}</th>`).join('') + '<th>Estado</th></tr></thead>';
  const tbody = '<tbody>' + validados.slice(0,10).map(row => `
    <tr style="${row._error ? 'background:var(--rojo-light)' : ''}">
      <td style="font-size:11px;color:var(--gris-400)">${row._fila}</td>
      ${visibles.map(c => `<td style="font-size:12px">${row[c.key]||'—'}</td>`).join('')}
      <td>${row._error ? '<span class="badge bg-red">⚠️ '+row._error+'</span>' : '<span class="badge bg-green">✓ OK</span>'}</td>
    </tr>`).join('') + '</tbody>';

  document.getElementById('import'+prefix+'Table').innerHTML = thead + tbody;
  document.getElementById('import'+prefix+'Info').innerHTML =
    `<span style="color:var(--verde);font-weight:700">${validados.length - errores} registros listos</span>` +
    (errores ? ` · <span style="color:var(--rojo)">${errores} con errores (se saltarán)</span>` : '') +
    (validados.length > 10 ? ` · mostrando 10 de ${validados.length}` : '');

  document.getElementById('import'+prefix+'Preview').style.display = 'block';
  document.getElementById('btnImportar'+prefix).style.display = 'inline-flex';
}

async function confirmarImport(tipo) {
  const data = importData[tipo].filter(r => !r._error);
  if (!data.length) { toast('No hay registros válidos para importar','error'); return; }

  toast(`Importando ${data.length} ${tipo}...`, 'info');
  let ok = 0, err = 0;

  if (tipo === 'clientes') {
    for (const row of data) {
      const { error } = await sb.from('clientes').insert({
        empresa_id: EMPRESA.id,
        nombre: row.nombre, tipo: row.tipo||'Particular',
        nif: row.nif||null, telefono: row.telefono||null,
        movil: row.movil||null, email: row.email||null,
        direccion_fiscal: row.direccion_fiscal||null,
        municipio_fiscal: row.municipio_fiscal||null,
        cp_fiscal: row.cp_fiscal||null,
        provincia_fiscal: row.provincia_fiscal||null,
        observaciones: row.observaciones||null,
      });
      error ? err++ : ok++;
    }
    closeModal('mImportarClientes');
    const { data: d } = await sb.from('clientes').select('*').eq('empresa_id',EMPRESA.id).order('nombre');
    clientes = d||[]; cliFiltroList=[...clientes]; renderClientes(clientes); populateSelects();

  } else if (tipo === 'proveedores') {
    for (const row of data) {
      const { error } = await sb.from('proveedores').insert({
        empresa_id: EMPRESA.id,
        nombre: row.nombre, cif: row.cif||null,
        telefono: row.telefono||null, email: row.email||null,
        email_pedidos: row.email_pedidos||null,
        direccion: row.direccion||null, municipio: row.municipio||null,
        cp: row.cp||null, provincia: row.provincia||null,
        web: row.web||null,
        dias_pago: parseInt(row.dias_pago)||30,
        observaciones: row.observaciones||null,
      });
      error ? err++ : ok++;
    }
    closeModal('mImportarProveedores');
    const { data: d } = await sb.from('proveedores').select('*').eq('empresa_id',EMPRESA.id).order('nombre');
    proveedores = d||[]; renderProveedores(proveedores);

  } else if (tipo === 'articulos') {
    for (const row of data) {
      const fam = familias.find(f => f.nombre.toLowerCase() === (row.familia||'').toLowerCase());
      const { error } = await sb.from('articulos').insert({
        empresa_id: EMPRESA.id,
        codigo: row.codigo, nombre: row.nombre,
        familia_id: fam?.id || null,
        precio_coste: parseFloat(row.precio_coste)||0,
        precio_venta: parseFloat(row.precio_venta)||0,
        referencia_fabricante: row.referencia_fabricante||null,
        codigo_barras: row.codigo_barras||null,
        observaciones: row.observaciones||null,
        activo: true,
      });
      error ? err++ : ok++;
    }
    closeModal('mImportarArticulos');
    const { data: d } = await sb.from('articulos').select('*').eq('empresa_id',EMPRESA.id).order('codigo');
    articulos = d||[]; renderArticulos(articulos);
  }

  toast(`✅ ${ok} importados correctamente${err?' · ⚠️ '+err+' errores':''}`, ok>0?'success':'error');
  loadDashboard();
}
