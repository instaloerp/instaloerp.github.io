// ═══════════════════════════════════════════════════════════════
// DEMO AUTOMÁTICA — Flujo completo del ERP
// Ejecutar desde la consola del ERP: runDemo()
// ═══════════════════════════════════════════════════════════════

let _demoRunning = false;
let _demoPausa = 2500; // ms entre pasos

async function runDemo() {
  if (_demoRunning) { toast('⚠️ Demo ya en ejecución', 'warning'); return; }
  if (!EMPRESA?.id) { toast('❌ Inicia sesión primero', 'error'); return; }
  _demoRunning = true;

  const log = (ico, msg) => {
    console.log(`%c${ico} ${msg}`, 'color:#1B4FD8;font-weight:bold;font-size:13px');
    toast(`${ico} ${msg}`, 'info');
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms || _demoPausa));
  const eid = EMPRESA.id;
  const hoy = new Date().toISOString().split('T')[0];

  try {
    // ═══════════════════════════════════════
    // FASE 1: CREAR DATOS MAESTROS
    // ═══════════════════════════════════════
    log('🚀', 'DEMO: Iniciando flujo completo...');
    await wait(2000);

    // ── 1.1 Crear Proveedor ──
    goPage('proveedores');
    await wait(1500);
    log('🏭', 'Creando proveedor DEMO...');
    const { data: prov, error: provErr } = await sb.from('proveedores').insert({
      empresa_id: eid, nombre: 'Fontanería Industrial Galicia S.L.',
      cif: 'B27123456', telefono: '982 55 44 33',
      email: 'info@fontagalicia.com', direccion: 'Polígono A Garaballa, 15, Lugo',
      municipio: 'Lugo', cp: '27004', provincia: 'Lugo',
      forma_pago: 'Transferencia 30 días', observaciones: 'Proveedor demo — creado automáticamente'
    }).select().single();
    if (provErr) throw new Error('Proveedor: ' + provErr.message);
    if (typeof proveedores !== 'undefined') { proveedores.push(prov); }
    log('✅', `Proveedor creado: ${prov.nombre}`);
    await wait();

    // ── 1.2 Crear Cliente ──
    goPage('clientes');
    await wait(1500);
    log('👤', 'Creando cliente DEMO...');
    const { data: cli, error: cliErr } = await sb.from('clientes').insert({
      empresa_id: eid, nombre: 'Comunidad de Propietarios Rúa do Progreso 42',
      tipo: 'empresa', cif: 'H27654321', telefono: '982 22 11 00',
      email: 'administracion@ruaprogreso42.es',
      direccion_fiscal: 'Rúa do Progreso 42, 3ºA, Ourense',
      municipio: 'Ourense', cp: '32003', provincia: 'Ourense',
      forma_pago: 'Transferencia', observaciones: 'Cliente demo — creado automáticamente'
    }).select().single();
    if (cliErr) throw new Error('Cliente: ' + cliErr.message);
    if (typeof clientes !== 'undefined') { clientes.push(cli); }
    log('✅', `Cliente creado: ${cli.nombre}`);
    await wait();

    // ── 1.3 Crear Artículos ──
    goPage('articulos');
    await wait(1500);
    log('📦', 'Creando artículos DEMO...');
    const artDefs = [
      { codigo: 'DEMO-CAL-001', nombre: 'Caldera de condensación Junkers 25kW', precio_coste: 890, precio_venta: 1250, referencia_fabricante: '7736901535' },
      { codigo: 'DEMO-TUB-001', nombre: 'Tubo multicapa 20mm (rollo 100m)', precio_coste: 65, precio_venta: 95, referencia_fabricante: 'MC-20-100' },
      { codigo: 'DEMO-RAD-001', nombre: 'Radiador aluminio 10 elementos 600mm', precio_coste: 78, precio_venta: 115, referencia_fabricante: 'RAD-600-10E' },
      { codigo: 'DEMO-VLV-001', nombre: 'Válvula termostática escuadra 1/2"', precio_coste: 12.50, precio_venta: 18.90, referencia_fabricante: 'VT-12-ESC' },
      { codigo: 'DEMO-MO-001',  nombre: 'Mano de obra instalación calefacción (hora)', precio_coste: 25, precio_venta: 45, referencia_fabricante: null },
    ];
    const artIds = [];
    for (const a of artDefs) {
      const { data: art, error: artErr } = await sb.from('articulos').insert({
        empresa_id: eid, codigo: a.codigo, nombre: a.nombre,
        precio_coste: a.precio_coste, precio_venta: a.precio_venta,
        referencia_fabricante: a.referencia_fabricante,
        es_activo: true, activo: true, proveedor_id: a.referencia_fabricante ? prov.id : null,
        observaciones: 'Artículo demo'
      }).select().single();
      if (artErr) { console.warn('Art:', artErr); continue; }
      artIds.push(art);
      if (typeof articulos !== 'undefined') articulos.push(art);
    }
    log('✅', `${artIds.length} artículos creados`);
    if (typeof loadArticulos === 'function') await loadArticulos();
    await wait();

    // ═══════════════════════════════════════
    // FASE 2: CICLO DE COMPRA
    // ═══════════════════════════════════════
    log('🛒', 'FASE 2: Ciclo de compra...');
    goPage('presupuestos-compra');
    await wait(1500);

    // ── 2.1 Presupuesto de compra ──
    log('📋', 'Creando presupuesto de compra...');
    const lineasCompra = artIds.filter(a => a.codigo !== 'DEMO-MO-001').map(a => ({
      tipo: 'linea', articulo_id: a.id, codigo: a.codigo,
      desc: a.nombre, cant: a.codigo.includes('VLV') ? 10 : a.codigo.includes('RAD') ? 5 : a.codigo.includes('TUB') ? 3 : 1,
      precio: a.precio_coste, dto: 0, iva: 21
    }));
    const baseCompra = lineasCompra.reduce((s, l) => s + l.cant * l.precio, 0);
    const ivaCompra = Math.round(baseCompra * 0.21 * 100) / 100;
    const numPrc = await generarNumeroDoc('presupuesto_compra');
    const { data: prc, error: prcErr } = await sb.from('presupuestos_compra').insert({
      empresa_id: eid, numero: numPrc, proveedor_id: prov.id, proveedor_nombre: prov.nombre,
      fecha: hoy, estado: 'aceptado', lineas: lineasCompra,
      base_imponible: Math.round(baseCompra * 100) / 100,
      total_iva: ivaCompra,
      total: Math.round((baseCompra + ivaCompra) * 100) / 100,
      observaciones: 'Presupuesto compra demo — material para instalación calefacción'
    }).select().single();
    if (prcErr) throw new Error('Pres.Compra: ' + prcErr.message);
    log('✅', `Presupuesto compra ${numPrc} creado y aceptado (${fmtE(prc.total)})`);
    await wait();

    // ── 2.2 Recepción de material ──
    goPage('recepciones');
    await wait(1500);
    log('📦', 'Registrando recepción de material...');
    const numRec = await generarNumeroDoc('recepcion');
    const lineasRec = lineasCompra.map(l => ({ ...l, cantidad_recibida: l.cant }));
    const { data: rec, error: recErr } = await sb.from('recepciones').insert({
      empresa_id: eid, numero: numRec, proveedor_id: prov.id, proveedor_nombre: prov.nombre,
      fecha: hoy, estado: 'recepcionado', lineas: lineasRec,
      presupuesto_compra_id: prc.id,
      // (recepciones no tiene columna 'total' — build 135)
      observaciones: 'Recepción completa demo'
    }).select().single();
    if (recErr) throw new Error('Recepción: ' + recErr.message);

    // Dar entrada al stock en almacén principal
    const almPrincipal = (typeof almacenes !== 'undefined' ? almacenes : []).find(a => a.tipo === 'almacen' || a.tipo === 'principal') || almacenes?.[0];
    if (almPrincipal) {
      for (const l of lineasCompra) {
        const artObj = artIds.find(a => a.codigo === l.codigo);
        if (!artObj) continue;
        // Buscar stock existente
        const { data: stEx } = await sb.from('stock').select('*')
          .eq('empresa_id', eid).eq('articulo_id', artObj.id).eq('almacen_id', almPrincipal.id).limit(1);
        if (stEx?.[0]) {
          await sb.from('stock').update({ cantidad: (stEx[0].cantidad || 0) + l.cant }).eq('id', stEx[0].id);
        } else {
          await sb.from('stock').insert({
            empresa_id: eid, articulo_id: artObj.id, almacen_id: almPrincipal.id,
            cantidad: l.cant, stock_provisional: 0, stock_reservado: 0
          });
        }
        await sb.from('movimientos_stock').insert({
          empresa_id: eid, articulo_id: artObj.id, almacen_id: almPrincipal.id,
          tipo: 'entrada', delta: l.cant, cantidad: l.cant,
          notas: `Recepción ${numRec} — compra a ${prov.nombre}`,
          fecha: hoy, usuario_id: CU?.id || null
        });
      }
    }
    log('✅', `Recepción ${numRec} completada — stock actualizado`);
    await wait();

    // ═══════════════════════════════════════
    // FASE 3: CREAR OBRA
    // ═══════════════════════════════════════
    log('🏗️', 'FASE 3: Crear obra...');
    goPage('trabajos');
    await wait(1500);
    const { data: obra, error: obraErr } = await sb.from('trabajos').insert({
      empresa_id: eid, titulo: 'Instalación calefacción central Rúa do Progreso 42',
      descripcion: 'Instalación completa de caldera de condensación + 5 radiadores + tuberías multicapa. Incluye mano de obra.',
      cliente_id: cli.id, cliente_nombre: cli.nombre,
      direccion: 'Rúa do Progreso 42, Ourense',
      estado: 'en_curso', prioridad: 'Alta',
      fecha_inicio: hoy,
      observaciones: 'Obra demo — flujo completo'
    }).select().single();
    if (obraErr) throw new Error('Obra: ' + obraErr.message);
    if (typeof trabajos !== 'undefined') trabajos.push(obra);
    log('✅', `Obra creada: ${obra.titulo}`);
    await wait();

    // ═══════════════════════════════════════
    // FASE 4: CICLO DE VENTA
    // ═══════════════════════════════════════
    log('💰', 'FASE 4: Ciclo de venta...');
    goPage('presupuestos');
    await wait(1500);

    // ── 4.1 Presupuesto de venta ──
    log('📝', 'Creando presupuesto de venta...');
    const lineasVenta = artIds.map(a => ({
      tipo: 'linea', articulo_id: a.id, codigo: a.codigo,
      desc: a.nombre,
      cant: a.codigo.includes('VLV') ? 10 : a.codigo.includes('RAD') ? 5 : a.codigo.includes('TUB') ? 3 : a.codigo.includes('MO') ? 24 : 1,
      precio: a.precio_venta, dto: 0, iva: 21
    }));
    const baseVenta = lineasVenta.reduce((s, l) => s + l.cant * l.precio, 0);
    const ivaVenta = Math.round(baseVenta * 0.21 * 100) / 100;
    const numPre = await generarNumeroDoc('presupuesto');
    const { data: pres, error: presErr } = await sb.from('presupuestos').insert({
      empresa_id: eid, numero: numPre,
      cliente_id: cli.id, cliente_nombre: cli.nombre,
      fecha: hoy, validez: 30, estado: 'pendiente',
      lineas: lineasVenta,
      base_imponible: Math.round(baseVenta * 100) / 100,
      total_iva: ivaVenta,
      total: Math.round((baseVenta + ivaVenta) * 100) / 100,
      trabajo_id: obra.id,
      observaciones: 'Presupuesto demo — instalación completa calefacción'
    }).select().single();
    if (presErr) throw new Error('Presupuesto: ' + presErr.message);
    log('✅', `Presupuesto ${numPre} creado — ${fmtE(pres.total)}`);
    await wait();

    // ── 4.2 Aceptar presupuesto ──
    log('✍️', 'Cliente acepta el presupuesto...');
    await sb.from('presupuestos').update({ estado: 'aceptado', firma_fecha: new Date().toISOString(), firma_nombre: 'Administrador CDP' }).eq('id', pres.id);
    if (typeof loadPresupuestos === 'function') await loadPresupuestos();
    goPage('presupuestos');
    await wait(1500);
    log('✅', `Presupuesto ${numPre} ACEPTADO`);
    await wait();

    // ── 4.3 Crear albarán de entrega ──
    goPage('albaranes');
    await wait(1500);
    log('📄', 'Generando albarán de entrega...');
    const numAlb = await generarNumeroDoc('albaran');
    const { data: alb, error: albErr } = await sb.from('albaranes').insert({
      empresa_id: eid, numero: numAlb,
      cliente_id: cli.id, cliente_nombre: cli.nombre,
      fecha: hoy, estado: 'entregado',
      lineas: lineasVenta.map(l => ({ desc: l.desc, cant: l.cant, precio: l.precio })),
      total: pres.total,
      presupuesto_id: pres.id, trabajo_id: obra.id,
      observaciones: 'Albarán demo — entrega material + mano de obra'
    }).select().single();
    if (albErr) throw new Error('Albarán: ' + albErr.message);
    if (typeof albaranesData !== 'undefined') albaranesData.unshift(alb);
    log('✅', `Albarán ${numAlb} entregado — ${fmtE(alb.total)}`);
    await wait();

    // ── 4.4 Crear factura ──
    goPage('facturas');
    await wait(1500);
    log('🧾', 'Generando factura...');
    const numFac = await generarNumeroDoc('factura');
    const venc = new Date(); venc.setDate(venc.getDate() + 30);
    const { data: fac, error: facErr } = await sb.from('facturas').insert({
      empresa_id: eid, numero: numFac,
      cliente_id: cli.id, cliente_nombre: cli.nombre,
      fecha: hoy, fecha_vencimiento: venc.toISOString().split('T')[0],
      estado: 'pendiente',
      base_imponible: pres.base_imponible, total_iva: pres.total_iva, total: pres.total,
      lineas: lineasVenta,
      presupuesto_id: pres.id, albaran_id: alb.id, trabajo_id: obra.id,
      observaciones: 'Factura demo — instalación calefacción'
    }).select().single();
    if (facErr) throw new Error('Factura: ' + facErr.message);

    // Marcar albarán como facturado
    await sb.from('albaranes').update({ estado: 'facturado' }).eq('id', alb.id);

    if (typeof facturasData !== 'undefined') facturasData.unshift(fac);
    log('✅', `Factura ${numFac} emitida — ${fmtE(fac.total)}`);
    await wait();

    // ── 4.5 Cobrar factura ──
    log('💳', 'Registrando cobro de la factura...');
    await sb.from('facturas').update({
      estado: 'cobrada',
      fecha_cobro: hoy,
      forma_cobro: 'Transferencia bancaria'
    }).eq('id', fac.id);
    if (typeof loadFacturas === 'function') await loadFacturas();
    goPage('facturas');
    await wait(1500);
    log('✅', `Factura ${numFac} COBRADA`);
    await wait();

    // ═══════════════════════════════════════
    // FASE 5: FINALIZAR OBRA
    // ═══════════════════════════════════════
    log('🏁', 'Finalizando obra...');
    await sb.from('trabajos').update({ estado: 'finalizado' }).eq('id', obra.id);
    goPage('trabajos');
    await wait(1500);
    log('✅', 'Obra finalizada');
    await wait();

    // ═══════════════════════════════════════
    // RESUMEN FINAL
    // ═══════════════════════════════════════
    goPage('dashboard');
    await wait(1500);

    console.log('%c═══════════════════════════════════════', 'color:#16A34A;font-weight:bold;font-size:14px');
    console.log('%c  DEMO COMPLETADA — RESUMEN', 'color:#16A34A;font-weight:bold;font-size:16px');
    console.log('%c═══════════════════════════════════════', 'color:#16A34A;font-weight:bold;font-size:14px');
    console.log(`  🏭 Proveedor:  ${prov.nombre}`);
    console.log(`  👤 Cliente:    ${cli.nombre}`);
    console.log(`  📦 Artículos:  ${artIds.length} creados`);
    console.log(`  🛒 Compra:     ${numPrc} → Recepción ${numRec}`);
    console.log(`  🏗️ Obra:       ${obra.titulo}`);
    console.log(`  📝 Presupuesto: ${numPre} (${fmtE(pres.total)})`);
    console.log(`  📄 Albarán:    ${numAlb}`);
    console.log(`  🧾 Factura:    ${numFac} (${fmtE(fac.total)}) — COBRADA`);
    console.log('%c═══════════════════════════════════════', 'color:#16A34A;font-weight:bold;font-size:14px');

    toast('🎉 Demo completada — revisa cada sección', 'success');

  } catch (e) {
    console.error('❌ Error en demo:', e);
    toast('❌ Error en demo: ' + e.message, 'error');
  } finally {
    _demoRunning = false;
  }
}

// Limpiar datos de demo
async function limpiarDemo() {
  if (!confirm('¿Eliminar TODOS los datos creados por la demo? (artículos DEMO-*, proveedor, cliente, documentos)')) return;
  const eid = EMPRESA.id;
  toast('🗑️ Limpiando datos demo...', 'info');

  // Borrar artículos DEMO-*
  const { data: artDemo } = await sb.from('articulos').select('id').eq('empresa_id', eid).like('codigo', 'DEMO-%');
  if (artDemo?.length) {
    const ids = artDemo.map(a => a.id);
    await sb.from('stock').delete().eq('empresa_id', eid).in('articulo_id', ids);
    await sb.from('movimientos_stock').delete().eq('empresa_id', eid).in('articulo_id', ids);
    await sb.from('consumos_parte').delete().eq('empresa_id', eid).in('articulo_id', ids);
    await sb.from('articulos').delete().eq('empresa_id', eid).like('codigo', 'DEMO-%');
  }

  // Borrar documentos demo
  await sb.from('facturas').delete().eq('empresa_id', eid).like('observaciones', '%demo%');
  await sb.from('albaranes').delete().eq('empresa_id', eid).like('observaciones', '%demo%');
  await sb.from('presupuestos').delete().eq('empresa_id', eid).like('observaciones', '%demo%');
  await sb.from('recepciones').delete().eq('empresa_id', eid).like('observaciones', '%demo%');
  await sb.from('presupuestos_compra').delete().eq('empresa_id', eid).like('observaciones', '%demo%');
  await sb.from('trabajos').delete().eq('empresa_id', eid).like('observaciones', '%demo%');

  // Borrar cliente y proveedor demo
  await sb.from('clientes').delete().eq('empresa_id', eid).like('observaciones', '%demo%');
  await sb.from('proveedores').delete().eq('empresa_id', eid).like('observaciones', '%demo%');

  toast('✅ Datos demo eliminados', 'success');
  // Recargar
  if (typeof cargarDatos === 'function') await cargarDatos();
  goPage('dashboard');
}
