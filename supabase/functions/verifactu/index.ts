// ════════════════════════════════════════════════════════════════
//  Edge Function: VeriFactu — Registro de facturas ante la AEAT
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  POST /verifactu
//  Body: { action: "alta"|"anulacion"|"subsanacion"|"consulta", factura_id: number, empresa_id: number }
//
//  Flujo:
//  1. Lee factura + config VeriFactu de Supabase
//  2. Obtiene el último registro de la cadena (huella anterior)
//  3. Calcula SHA-256 (blockchain)
//  4. Construye XML SOAP
//  5. Envía a AEAT (con certificado mTLS)
//  6. Guarda resultado en verifactu_registros
//  7. Actualiza factura con estado VeriFactu
//
// ════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

// ─── Config ───
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Proxy mTLS en Deno Deploy (temporal hasta que Supabase soporte mTLS)
const PROXY_URL = Deno.env.get("VERIFACTU_PROXY_URL") || "";  // URL del proxy en Deno Deploy
const PROXY_SECRET = Deno.env.get("VERIFACTU_PROXY_SECRET") || "";  // Token de autenticación

const ENDPOINTS: Record<string, string> = {
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  produccion: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  simulacion: "", // No se envía, solo se genera
};

const QR_BASE: Record<string, string> = {
  test: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
  produccion: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
  simulacion: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR", // Usa URL test para QR simulado
};

const NS_SF = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";
const NS_LR = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";

// ─── Helpers ───

/** Formato fecha AEAT: dd-MM-yyyy */
function formatFechaAEAT(fecha: string): string {
  // Entrada: yyyy-MM-dd (ISO) → Salida: dd-MM-yyyy
  const [y, m, d] = fecha.split("-");
  return `${d}-${m}-${y}`;
}

/** Formato decimal AEAT: hasta 2 decimales, punto como separador */
function formatDecimal(num: number): string {
  return num.toFixed(2);
}

/**
 * Formato decimal para hash AEAT: siempre 2 decimales.
 * AEAT calcula la huella con 2 decimales exactos (252.00, no 252).
 */
function formatDecimalHash(num: number): string {
  return num.toFixed(2);
}

/** ISO 8601 con timezone España (Europe/Madrid) */
function nowISOSpain(): string {
  const now = new Date();
  // Obtener la hora real en zona horaria de España usando Intl
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value || "00";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;

  // Calcular offset real comparando hora UTC vs hora España
  const utcH = now.getUTCHours();
  const spainH = parseInt(get("hour"));
  const diff = ((spainH - utcH) + 24) % 24;
  const tzOffset = diff === 2 ? "+02:00" : "+01:00";

  return dateStr + tzOffset;
}

/** SHA-256 hex — AEAT exige resultado en MAYÚSCULAS */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Escapar XML */
function escXml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ─── Hash VeriFactu ───

interface HashAlta {
  nifEmisor: string;
  numSerie: string;
  fechaExpedicion: string; // dd-MM-yyyy
  tipoFactura: string;
  cuotaTotal: string;
  importeTotal: string;
  huellaAnterior: string;
  fechaHoraHuso: string;
}

async function calcHashAlta(h: HashAlta): Promise<string> {
  // Formato AEAT: "nombreCampo1=valor1&nombreCampo2=valor2&..."
  // Si un valor está vacío, se deja solo "nombre=" (ej: primer registro → "Huella=")
  const concatenado = [
    `IDEmisorFactura=${h.nifEmisor}`,
    `NumSerieFactura=${h.numSerie}`,
    `FechaExpedicionFactura=${h.fechaExpedicion}`,
    `TipoFactura=${h.tipoFactura}`,
    `CuotaTotal=${h.cuotaTotal}`,
    `ImporteTotal=${h.importeTotal}`,
    `Huella=${h.huellaAnterior}`,
    `FechaHoraHusoGenRegistro=${h.fechaHoraHuso}`,
  ].join("&");
  return await sha256Hex(concatenado);
}

interface HashAnulacion {
  nifEmisor: string;
  numSerie: string;
  fechaExpedicion: string;
  huellaAnterior: string;
  fechaHoraHuso: string;
}

async function calcHashAnulacion(h: HashAnulacion): Promise<string> {
  // Formato AEAT: "nombreCampo1=valor1&nombreCampo2=valor2&..."
  const concatenado = [
    `IDEmisorFacturaAnulada=${h.nifEmisor}`,
    `NumSerieFacturaAnulada=${h.numSerie}`,
    `FechaExpedicionFacturaAnulada=${h.fechaExpedicion}`,
    `Huella=${h.huellaAnterior}`,
    `FechaHoraHusoGenRegistro=${h.fechaHoraHuso}`,
  ].join("&");
  return await sha256Hex(concatenado);
}

// ─── XML Builder ───

function buildRegistroAltaXML(params: {
  config: any;
  factura: any;
  desglose: any[];
  encadenamiento: string;
  fechaHoraHuso: string;
  huella: string;
}): string {
  const { config, factura, desglose, encadenamiento, fechaHoraHuso, huella } = params;

  // Tipo de factura: R1/R2/R3/R4/R5 para rectificativas, F1/F2/F3 para normales
  const tipoFactura = factura.tipo_rectificativa || (factura.rectificativa_de ? "R1" : "F1");
  const fechaAEAT = formatFechaAEAT(factura.fecha);

  // Destinatario — F2 (simplificada) y R5 (rect. simplificada) NO pueden llevar Destinatarios (AEAT rechaza)
  let destinatarioXml = "";
  const sinDestinatario = tipoFactura === "F2" || tipoFactura === "R5";
  if (factura.cliente_nif && !sinDestinatario) {
    destinatarioXml = `
          <sf:Destinatarios>
            <sf:IDDestinatario>
              <sf:NombreRazon>${escXml(factura.cliente_nombre)}</sf:NombreRazon>
              <sf:NIF>${escXml(factura.cliente_nif)}</sf:NIF>
            </sf:IDDestinatario>
          </sf:Destinatarios>`;
  }

  // Desglose IVA
  const desgloseXml = desglose.map(d => `
            <sf:DetalleDesglose>
              <sf:Impuesto>01</sf:Impuesto>
              <sf:ClaveRegimen>01</sf:ClaveRegimen>
              <sf:CalificacionOperacion>S1</sf:CalificacionOperacion>
              <sf:TipoImpositivo>${formatDecimal(d.tipo)}</sf:TipoImpositivo>
              <sf:BaseImponibleOimporteNoSujeto>${formatDecimal(d.base)}</sf:BaseImponibleOimporteNoSujeto>
              <sf:CuotaRepercutida>${formatDecimal(d.cuota)}</sf:CuotaRepercutida>
            </sf:DetalleDesglose>`).join("");

  // Rectificativa — según tipo "I" (diferencias) o "S" (sustitución)
  // Ref: AEAT FAQ "Procedimientos de facturación"
  let rectificativaXml = "";
  if (factura.rectificativa_de && factura.factura_rectificada_numero) {
    const tipoRect = factura.tipo_rectificacion || "S";  // I o S
    rectificativaXml = `
          <sf:TipoRectificativa>${tipoRect}</sf:TipoRectificativa>
          <sf:FacturasRectificadas>
            <sf:IDFacturaRectificada>
              <sf:IDEmisorFactura>${escXml(config.nif)}</sf:IDEmisorFactura>
              <sf:NumSerieFactura>${escXml(factura.factura_rectificada_numero)}</sf:NumSerieFactura>
              <sf:FechaExpedicionFactura>${formatFechaAEAT(factura.factura_rectificada_fecha)}</sf:FechaExpedicionFactura>
            </sf:IDFacturaRectificada>
          </sf:FacturasRectificadas>`;

    // Tipo S: DEBE incluir ImporteRectificacion con base/cuota originales
    // Tipo I: NO se incluyen estos campos (AEAT doc)
    if (tipoRect === "S" && (factura.base_rectificada != null || factura.cuota_rectificada != null)) {
      rectificativaXml += `
          <sf:ImporteRectificacion>
            <sf:BaseRectificada>${formatDecimal(Math.abs(factura.base_rectificada || 0))}</sf:BaseRectificada>
            <sf:CuotaRectificada>${formatDecimal(Math.abs(factura.cuota_rectificada || 0))}</sf:CuotaRectificada>
          </sf:ImporteRectificacion>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:sfLR="${NS_LR}"
  xmlns:sf="${NS_SF}">
  <soapenv:Body>
    <sfLR:RegFactuSistemaFacturacion>
      <sfLR:Cabecera>
        <sf:ObligadoEmision>
          <sf:NombreRazon>${escXml(config.nombre_razon)}</sf:NombreRazon>
          <sf:NIF>${escXml(config.nif)}</sf:NIF>
        </sf:ObligadoEmision>
      </sfLR:Cabecera>
      <sfLR:RegistroFactura>
        <sf:RegistroAlta>
          <sf:IDVersion>1.0</sf:IDVersion>
          <sf:IDFactura>
            <sf:IDEmisorFactura>${escXml(config.nif)}</sf:IDEmisorFactura>
            <sf:NumSerieFactura>${escXml(factura.numero)}</sf:NumSerieFactura>
            <sf:FechaExpedicionFactura>${fechaAEAT}</sf:FechaExpedicionFactura>
          </sf:IDFactura>
          <sf:NombreRazonEmisor>${escXml(config.nombre_razon)}</sf:NombreRazonEmisor>
          <sf:TipoFactura>${tipoFactura}</sf:TipoFactura>${rectificativaXml}
          <sf:DescripcionOperacion>${escXml(factura.observaciones || "Prestacion de servicios")}</sf:DescripcionOperacion>${destinatarioXml}
          <sf:Desglose>${desgloseXml}
          </sf:Desglose>
          <sf:CuotaTotal>${formatDecimal(factura.total_iva || 0)}</sf:CuotaTotal>
          <sf:ImporteTotal>${formatDecimal(factura.total || 0)}</sf:ImporteTotal>
          ${encadenamiento}
          <sf:SistemaInformatico>
            <sf:NombreRazon>${escXml(config.nombre_razon)}</sf:NombreRazon>
            <sf:NIF>${escXml(config.nif)}</sf:NIF>
            <sf:NombreSistemaInformatico>${escXml(config.nombre_sistema)}</sf:NombreSistemaInformatico>
            <sf:IdSistemaInformatico>${escXml(config.id_sistema)}</sf:IdSistemaInformatico>
            <sf:Version>${escXml(config.version_sistema)}</sf:Version>
            <sf:NumeroInstalacion>${escXml(config.numero_instalacion)}</sf:NumeroInstalacion>
            <sf:TipoUsoPosibleSoloVerifactu>S</sf:TipoUsoPosibleSoloVerifactu>
            <sf:TipoUsoPosibleMultiOT>N</sf:TipoUsoPosibleMultiOT>
            <sf:IndicadorMultiplesOT>N</sf:IndicadorMultiplesOT>
          </sf:SistemaInformatico>
          <sf:FechaHoraHusoGenRegistro>${fechaHoraHuso}</sf:FechaHoraHusoGenRegistro>
          <sf:TipoHuella>01</sf:TipoHuella>
          <sf:Huella>${huella}</sf:Huella>
        </sf:RegistroAlta>
      </sfLR:RegistroFactura>
    </sfLR:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildRegistroAnulacionXML(params: {
  config: any;
  factura: any;
  encadenamiento: string;
  fechaHoraHuso: string;
  huella: string;
}): string {
  const { config, factura, encadenamiento, fechaHoraHuso, huella } = params;
  const fechaAEAT = formatFechaAEAT(factura.fecha);

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:sfLR="${NS_LR}"
  xmlns:sf="${NS_SF}">
  <soapenv:Body>
    <sfLR:RegFactuSistemaFacturacion>
      <sfLR:Cabecera>
        <sf:ObligadoEmision>
          <sf:NombreRazon>${escXml(config.nombre_razon)}</sf:NombreRazon>
          <sf:NIF>${escXml(config.nif)}</sf:NIF>
        </sf:ObligadoEmision>
      </sfLR:Cabecera>
      <sfLR:RegistroFactura>
        <sf:RegistroAnulacion>
          <sf:IDVersion>1.0</sf:IDVersion>
          <sf:IDFactura>
            <sf:IDEmisorFacturaAnulada>${escXml(config.nif)}</sf:IDEmisorFacturaAnulada>
            <sf:NumSerieFacturaAnulada>${escXml(factura.numero)}</sf:NumSerieFacturaAnulada>
            <sf:FechaExpedicionFacturaAnulada>${fechaAEAT}</sf:FechaExpedicionFacturaAnulada>
          </sf:IDFactura>
          ${encadenamiento}
          <sf:SistemaInformatico>
            <sf:NombreRazon>${escXml(config.nombre_razon)}</sf:NombreRazon>
            <sf:NIF>${escXml(config.nif)}</sf:NIF>
            <sf:NombreSistemaInformatico>${escXml(config.nombre_sistema)}</sf:NombreSistemaInformatico>
            <sf:IdSistemaInformatico>${escXml(config.id_sistema)}</sf:IdSistemaInformatico>
            <sf:Version>${escXml(config.version_sistema)}</sf:Version>
            <sf:NumeroInstalacion>${escXml(config.numero_instalacion)}</sf:NumeroInstalacion>
            <sf:TipoUsoPosibleSoloVerifactu>S</sf:TipoUsoPosibleSoloVerifactu>
            <sf:TipoUsoPosibleMultiOT>N</sf:TipoUsoPosibleMultiOT>
            <sf:IndicadorMultiplesOT>N</sf:IndicadorMultiplesOT>
          </sf:SistemaInformatico>
          <sf:FechaHoraHusoGenRegistro>${fechaHoraHuso}</sf:FechaHoraHusoGenRegistro>
          <sf:TipoHuella>01</sf:TipoHuella>
          <sf:Huella>${huella}</sf:Huella>
        </sf:RegistroAnulacion>
      </sfLR:RegistroFactura>
    </sfLR:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ─── Desglose IVA desde líneas de factura ───

function calcDesglose(lineas: any[], tipoIvaMap: any): { tipo: number; base: number; cuota: number }[] {
  const porTipo: Record<number, { base: number; cuota: number }> = {};

  for (const l of lineas) {
    if (l._separator) continue;
    // Aplicar descuentos encadenados (dto1, dto2, dto3) igual que en el ERP
    let base = (l.cant || 0) * (l.precio || 0);
    if (l.dto1) base *= (1 - (l.dto1 / 100));
    if (l.dto2) base *= (1 - (l.dto2 / 100));
    if (l.dto3) base *= (1 - (l.dto3 / 100));
    const tipoIva = l.iva ?? 21;
    if (!porTipo[tipoIva]) porTipo[tipoIva] = { base: 0, cuota: 0 };
    porTipo[tipoIva].base += base;
    porTipo[tipoIva].cuota += base * tipoIva / 100;
  }

  return Object.entries(porTipo).map(([tipo, vals]) => ({
    tipo: parseFloat(tipo),
    base: Math.round(vals.base * 100) / 100,
    cuota: Math.round(vals.cuota * 100) / 100,
  }));
}

// ─── Parse respuesta AEAT ───

function parseRespuesta(xml: string): {
  estado: string;
  csv: string;
  codigoError: string;
  descripcionError: string;
  tiempoEspera: number;
} {
  const getTag = (tag: string) => {
    const re = new RegExp(`<[^>]*:?${tag}[^>]*>([^<]*)<`, "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
  };

  return {
    estado: getTag("EstadoRegistro") || getTag("EstadoEnvio") || "desconocido",
    csv: getTag("CSV"),
    codigoError: getTag("CodigoErrorRegistro"),
    descripcionError: getTag("DescripcionErrorRegistro"),
    tiempoEspera: parseInt(getTag("TiempoEsperaEnvio") || "0"),
  };
}

// ─── Lógica reutilizable de alta/anulación ───

async function handleRegistro(
  sb: any, action: string, factura_id: number, empresa_id: string, config: any
): Promise<any> {
  // 1. Cargar factura
  const { data: factura } = await sb.from("facturas")
    .select("*").eq("id", factura_id).single();

  if (!factura) {
    return { ok: false, error: "Factura no encontrada" };
  }

  // 1b. Cargar NIF y nombre del cliente desde la tabla clientes
  if (factura.cliente_id) {
    const { data: cliente } = await sb.from("clientes")
      .select("nif, nombre, razon_social")
      .eq("id", factura.cliente_id).single();
    if (cliente) {
      factura.cliente_nif = cliente.nif || factura.cliente_nif || null;
      factura.cliente_nombre = cliente.razon_social || cliente.nombre || factura.cliente_nombre || null;
    }
  }

  // 2. Obtener último registro de la cadena (huella anterior)
  const { data: ultimoReg } = await sb.from("verifactu_registros")
    .select("id, huella, num_serie, fecha_expedicion, nif_emisor")
    .eq("empresa_id", empresa_id)
    .in("estado", ["correcto", "aceptado_errores", "simulado"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const esPrimerRegistro = !ultimoReg;
  const huellaAnterior = ultimoReg?.huella || "";

  // 3. Generar timestamp
  const fechaHoraHuso = nowISOSpain();
  const fechaAEAT = formatFechaAEAT(factura.fecha);
  const modo = config.modo as "test" | "produccion" | "simulacion";

  let huella = "";
  let xml = "";
  let qrUrl = "";

  if (action === "alta") {
    const tipoFactura = factura.tipo_rectificativa || (factura.rectificativa_de ? "R1" : "F1");
    const cuotaTotalHash = formatDecimalHash(factura.total_iva || 0);
    const importeTotalHash = formatDecimalHash(factura.total || 0);
    const importeTotal = formatDecimal(factura.total || 0);

    huella = await calcHashAlta({
      nifEmisor: config.nif.trim(),
      numSerie: factura.numero.trim(),
      fechaExpedicion: fechaAEAT,
      tipoFactura,
      cuotaTotal: cuotaTotalHash,
      importeTotal: importeTotalHash,
      huellaAnterior,
      fechaHoraHuso,
    });

    const encadenamiento = esPrimerRegistro
      ? `<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>`
      : `<sf:Encadenamiento><sf:RegistroAnterior>
            <sf:IDEmisorFactura>${escXml(ultimoReg!.nif_emisor)}</sf:IDEmisorFactura>
            <sf:NumSerieFactura>${escXml(ultimoReg!.num_serie)}</sf:NumSerieFactura>
            <sf:FechaExpedicionFactura>${escXml(ultimoReg!.fecha_expedicion)}</sf:FechaExpedicionFactura>
            <sf:Huella>${huellaAnterior}</sf:Huella>
          </sf:RegistroAnterior></sf:Encadenamiento>`;

    const desglose = calcDesglose(factura.lineas || [], null);
    xml = buildRegistroAltaXML({ config, factura, desglose, encadenamiento, fechaHoraHuso, huella });
    qrUrl = `${QR_BASE[modo]}?nif=${encodeURIComponent(config.nif)}&numserie=${encodeURIComponent(factura.numero)}&fecha=${encodeURIComponent(fechaAEAT)}&importe=${encodeURIComponent(importeTotal)}`;

  } else if (action === "anulacion") {
    huella = await calcHashAnulacion({
      nifEmisor: config.nif.trim(),
      numSerie: factura.numero.trim(),
      fechaExpedicion: fechaAEAT,
      huellaAnterior,
      fechaHoraHuso,
    });

    const encadenamiento = esPrimerRegistro
      ? `<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>`
      : `<sf:Encadenamiento><sf:RegistroAnterior>
            <sf:IDEmisorFactura>${escXml(ultimoReg!.nif_emisor)}</sf:IDEmisorFactura>
            <sf:NumSerieFactura>${escXml(ultimoReg!.num_serie)}</sf:NumSerieFactura>
            <sf:FechaExpedicionFactura>${escXml(ultimoReg!.fecha_expedicion)}</sf:FechaExpedicionFactura>
            <sf:Huella>${huellaAnterior}</sf:Huella>
          </sf:RegistroAnterior></sf:Encadenamiento>`;

    xml = buildRegistroAnulacionXML({ config, factura, encadenamiento, fechaHoraHuso, huella });
  } else {
    return { ok: false, error: "Acción no válida. Usar: alta, anulacion" };
  }

  // 4. Guardar registro PENDIENTE
  const registro: any = {
    empresa_id,
    factura_id,
    tipo_registro: action,
    nif_emisor: config.nif,
    num_serie: factura.numero,
    fecha_expedicion: fechaAEAT,
    tipo_factura: factura.tipo_rectificativa || (factura.rectificativa_de ? "R1" : "F1"),
    cuota_total: Math.abs(factura.total_iva || 0),
    importe_total: factura.total || 0,
    fecha_hora_huso: fechaHoraHuso,
    huella,
    huella_anterior: huellaAnterior || null,
    es_primer_registro: esPrimerRegistro,
    registro_anterior_id: ultimoReg?.id || null,
    estado: "pendiente",
    xml_enviado: xml,
    qr_url: qrUrl || null,
  };

  if (factura.rectificativa_de) {
    registro.factura_rectificada_num = factura.factura_rectificada_numero;
    registro.factura_rectificada_fecha = factura.factura_rectificada_fecha
      ? formatFechaAEAT(factura.factura_rectificada_fecha) : null;
  }

  const { data: regInserted, error: regError } = await sb.from("verifactu_registros")
    .insert(registro).select().single();

  if (regError) {
    return { ok: false, error: "Error guardando registro: " + regError.message };
  }

  // 5. Enviar según el modo
  let respuestaAEAT: any = null;

  if (modo === "simulacion") {
    const csvSimulado = "SIM-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const xmlRespSimulada = `<?xml version="1.0" encoding="UTF-8"?>
<RespuestaRegFactuSistemaFacturacion xmlns="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd">
  <CSV>${csvSimulado}</CSV>
  <RespuestaLinea><EstadoRegistro>Correcto</EstadoRegistro></RespuestaLinea>
</RespuestaRegFactuSistemaFacturacion>`;

    await sb.from("verifactu_registros").update({
      estado: "simulado", csv_aeat: csvSimulado, codigo_error: null,
      descripcion_error: "SIMULACIÓN — validado localmente",
      xml_respuesta: xmlRespSimulada,
      enviado_at: new Date().toISOString(), respuesta_at: new Date().toISOString(),
    }).eq("id", regInserted.id);

    await sb.from("facturas").update({
      verifactu_estado: action === "anulacion" ? "anulado" : "simulado",
      verifactu_csv: action === "anulacion" ? null : csvSimulado,
      verifactu_qr_url: action === "anulacion" ? null : (qrUrl || null),
      verifactu_huella: huella,
      verifactu_enviado_at: new Date().toISOString(),
    }).eq("id", factura_id);

    respuestaAEAT = { estado: "Correcto", csv: csvSimulado, simulacion: true };

  } else if (PROXY_URL) {
    try {
      const proxyResp = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${PROXY_SECRET}` },
        body: JSON.stringify({ xml, modo }),
      });
      const proxyRaw = await proxyResp.text();
      console.log("[VeriFactu] Proxy status:", proxyResp.status, "body:", proxyRaw.substring(0, 500));

      let proxyData: any;
      try { proxyData = JSON.parse(proxyRaw); } catch {
        if (proxyRaw.includes("EstadoRegistro") || proxyRaw.includes("RespuestaRegFactu") || proxyRaw.includes("Envelope")) {
          proxyData = { ok: true, xml_respuesta: proxyRaw };
        } else {
          throw new Error(`Proxy devolvió respuesta no-JSON (status ${proxyResp.status}): ${proxyRaw.substring(0, 200)}`);
        }
      }

      if (proxyData.ok && proxyData.xml_respuesta) {
        const parsed = parseRespuesta(proxyData.xml_respuesta);
        const estadoRegistro = parsed.estado === "Correcto" ? "correcto"
          : parsed.estado === "AceptadoConErrores" ? "aceptado_errores" : "incorrecto";
        const estadoFactura = (action === "anulacion" && estadoRegistro === "correcto") ? "anulado" : estadoRegistro;

        await sb.from("verifactu_registros").update({
          estado: estadoRegistro, csv_aeat: parsed.csv || null,
          codigo_error: parsed.codigoError || null, descripcion_error: parsed.descripcionError || null,
          xml_respuesta: proxyData.xml_respuesta,
          enviado_at: new Date().toISOString(), respuesta_at: new Date().toISOString(),
        }).eq("id", regInserted.id);

        await sb.from("facturas").update({
          verifactu_estado: estadoFactura,
          verifactu_csv: action === "anulacion" ? null : (parsed.csv || null),
          verifactu_qr_url: action === "anulacion" ? null : (qrUrl || null),
          verifactu_huella: huella,
          verifactu_enviado_at: new Date().toISOString(),
        }).eq("id", factura_id);

        respuestaAEAT = parsed;
      } else {
        throw new Error(proxyData.error || `Proxy respondió con status ${proxyResp.status}`);
      }
    } catch (sendError: any) {
      await sb.from("verifactu_registros").update({
        estado: "error_envio", descripcion_error: sendError.message,
        enviado_at: new Date().toISOString(),
      }).eq("id", regInserted.id);
      await sb.from("facturas").update({ verifactu_estado: "error_envio" }).eq("id", factura_id);
      respuestaAEAT = { estado: "error_envio", error: sendError.message };
    }
  } else {
    await sb.from("facturas").update({
      verifactu_estado: "pendiente", verifactu_qr_url: qrUrl || null, verifactu_huella: huella,
    }).eq("id", factura_id);
  }

  // Resultado
  const estadoBase = respuestaAEAT?.estado === "Correcto" ? "correcto"
    : respuestaAEAT?.estado === "AceptadoConErrores" ? "aceptado_errores"
    : respuestaAEAT?.estado === "error_envio" ? "error_envio"
    : respuestaAEAT?.simulacion ? "simulado"
    : respuestaAEAT ? "incorrecto" : "pendiente";
  const estadoFinal = (action === "anulacion" && estadoBase === "correcto") ? "anulado" : estadoBase;

  return {
    ok: true,
    estado: estadoFinal,
    csv: respuestaAEAT?.csv || null,
    huella,
    qr_url: qrUrl,
    descripcion_error: respuestaAEAT?.descripcionError || respuestaAEAT?.error || null,
    codigo_error: respuestaAEAT?.codigoError || null,
    registro_id: regInserted.id,
    modo: config.modo,
  };
}

// ─── Main handler ───

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const { action, factura_id, empresa_id } = await req.json();

    if (!action || !empresa_id) {
      return jsonResp({ error: "Faltan parámetros: action, empresa_id" }, 400);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Cargar config VeriFactu
    const { data: config } = await sb.from("verifactu_config")
      .select("*").eq("empresa_id", empresa_id).single();

    if (!config || !config.activo) {
      return jsonResp({ error: "VeriFactu no está configurado o no está activo para esta empresa" }, 400);
    }

    // ── CONSULTA: solo verifica que la config y conexión están OK ──
    if (action === "consulta") {
      const { data: certDigital } = await sb.from("certificados_digitales")
        .select("id, nombre, activo, fecha_caducidad")
        .eq("empresa_id", empresa_id)
        .eq("predeterminado", true)
        .eq("activo", true)
        .maybeSingle();

      const { count } = await sb.from("verifactu_registros")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa_id);

      return jsonResp({
        ok: true,
        modo: config.modo,
        nif: config.nif,
        certificado: certDigital ? { nombre: certDigital.nombre, caduca: certDigital.fecha_caducidad } : null,
        total_registros: count || 0,
      });
    }

    // Para alta/anulacion/subsanacion necesitamos factura_id
    if (!factura_id) {
      return jsonResp({ error: "Falta factura_id para acción " + action }, 400);
    }

    // ── SUBSANACIÓN: anular registro anterior + nuevo alta ──
    // Subsanación = corrección de datos no fiscales (descripciones, observaciones)
    // Flujo AEAT: 1) Anular registro existente  2) Nuevo alta con datos corregidos
    if (action === "subsanacion") {
      // Paso 1: Llamar internamente como anulación
      const anulResp = await handleRegistro(sb, "anulacion", factura_id, empresa_id, config);
      if (!anulResp.ok || (anulResp.estado !== "correcto" && anulResp.estado !== "anulado" && anulResp.estado !== "simulado")) {
        return jsonResp({
          ok: false,
          error: "Error anulando registro previo: " + (anulResp.descripcion_error || anulResp.estado),
          fase: "anulacion",
          ...anulResp,
        });
      }
      // Paso 2: Nuevo alta con datos corregidos (ya guardados en BD)
      const altaResp = await handleRegistro(sb, "alta", factura_id, empresa_id, config);
      return jsonResp({
        ...altaResp,
        subsanacion: true,
        anulacion_previa: { estado: anulResp.estado, csv: anulResp.csv },
      });
    }

    // Ejecutar alta o anulación
    const result = await handleRegistro(sb, action, factura_id, empresa_id, config);
    return jsonResp(result, result.ok ? 200 : 500);

  } catch (err: any) {
    return jsonResp({ error: err.message, stack: err.stack }, 500);
  }
});

function jsonResp(data: any, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
