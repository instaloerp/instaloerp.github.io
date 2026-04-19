// ════════════════════════════════════════════════════════════════
//  Edge Function: FACe — Facturación electrónica a AAPP
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  POST /face
//  Body: { action: "enviar"|"anular"|"consultar", factura_id: number, empresa_id: string }
//
//  Flujo:
//  1. Lee factura + cliente + empresa de Supabase
//  2. Genera XML Facturae 3.2.2
//  3. Envía al proxy mTLS que firma (XAdES) y envía SOAP a FACe
//  4. Guarda resultado en face_envios
//  5. Actualiza factura con estado FACe
//
// ════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Config ───
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROXY_URL     = Deno.env.get("FACE_PROXY_URL") || Deno.env.get("VERIFACTU_PROXY_URL") || "";
const PROXY_SECRET  = Deno.env.get("FACE_PROXY_SECRET") || Deno.env.get("VERIFACTU_PROXY_SECRET") || "";

// Endpoints FACe (MINHAP)
const FACE_ENDPOINTS: Record<string, string> = {
  produccion: "https://webservice.face.gob.es/facturasrcf2?wsdl",
  test:       "https://se-face-webservice.redsara.es/facturasrcf2?wsdl",
};

// ─── Helpers XML ───

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Formato fecha Facturae: dd-MM-yyyy */
function fmtFecha(fecha: string): string {
  if (!fecha) return "";
  const [y, m, d] = fecha.substring(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

/** Formato fecha ISO para Facturae: yyyy-MM-dd */
function fmtFechaISO(fecha: string): string {
  if (!fecha) return "";
  return fecha.substring(0, 10);
}

/** Decimal con 2 decimales */
function dec2(n: number): string {
  return (n || 0).toFixed(2);
}

/** Decimal con 6 decimales (para precios unitarios) */
function dec6(n: number): string {
  return (n || 0).toFixed(6);
}

/** Decimal con 8 decimales (para cantidades Facturae) */
function dec8(n: number): string {
  return (n || 0).toFixed(8);
}

// ─── Tipos ───

interface Linea {
  desc: string;
  cant: number;
  precio: number;
  dto1?: number;
  dto2?: number;
  dto3?: number;
  iva: number;
}

interface Factura {
  id: number;
  numero: string;
  fecha: string;
  fecha_vencimiento?: string;
  cliente_id: number;
  cliente_nombre: string;
  cliente_nif: string;
  cliente_direccion?: string;
  lineas: Linea[];
  base_imponible: number;
  total_iva: number;
  total: number;
  forma_pago?: string;
  observaciones?: string;
  estado: string;
  // Rectificativas
  rectificativa_de?: number;
  factura_rectificada_numero?: string;
  factura_rectificada_fecha?: string;
  tipo_rectificativa?: string;
  tipo_rectificacion?: string;
  base_rectificada?: number;
  cuota_rectificada?: number;
  // FACe
  face_estado?: string;
  face_numero_registro?: string;
  face_organo_gestor?: string;
  face_unidad_tramitadora?: string;
  face_oficina_contable?: string;
}

interface Cliente {
  id: number;
  nombre: string;
  razon_social?: string;
  nif: string;
  direccion_fiscal?: string;
  municipio_fiscal?: string;
  provincia_fiscal?: string;
  cp_fiscal?: string;
  es_administracion_publica?: boolean;
  face_organo_gestor?: string;
  face_unidad_tramitadora?: string;
  face_oficina_contable?: string;
}

interface Empresa {
  id: string;
  nombre: string;
  razon_social?: string;
  cif: string;
  direccion?: string;
  municipio?: string;
  provincia?: string;
  cp?: string;
  email?: string;
  config?: Record<string, unknown>;
}

// ─── Generador XML Facturae 3.2.2 ───

/**
 * Genera el XML completo en formato Facturae 3.2.2
 * Referencia: https://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml
 */
function generarFacturaeXML(fac: Factura, cli: Cliente, emp: Empresa): string {
  const lineas: Linea[] = fac.lineas || [];

  // ── Agrupar IVAs ──
  const ivaMap = new Map<number, { base: number; cuota: number }>();
  for (const l of lineas) {
    const dto = (1 - (l.dto1 || 0) / 100) * (1 - (l.dto2 || 0) / 100) * (1 - (l.dto3 || 0) / 100);
    const subtotal = (l.cant || 0) * (l.precio || 0) * dto;
    const tipoIva = l.iva || 0;
    const entry = ivaMap.get(tipoIva) || { base: 0, cuota: 0 };
    entry.base += subtotal;
    entry.cuota += subtotal * tipoIva / 100;
    ivaMap.set(tipoIva, entry);
  }

  // Totales calculados
  const totalBase = Array.from(ivaMap.values()).reduce((s, v) => s + v.base, 0);
  const totalIva  = Array.from(ivaMap.values()).reduce((s, v) => s + v.cuota, 0);
  const totalFac  = totalBase + totalIva;

  // ── Tipo persona (J=Jurídica, F=Física) ──
  const empPersonType = esPersonaJuridica(emp.cif) ? "J" : "F";
  const cliPersonType = esPersonaJuridica(cli.nif) ? "J" : "F";

  // ── DIR3 codes (usar los de la factura si existen, sino los del cliente) ──
  const dir3OC = fac.face_oficina_contable || cli.face_oficina_contable || "";
  const dir3OG = fac.face_organo_gestor || cli.face_organo_gestor || "";
  const dir3UT = fac.face_unidad_tramitadora || cli.face_unidad_tramitadora || "";

  // ── Tipo factura ──
  const esRectificativa = !!fac.rectificativa_de;
  const invoiceDocType = esRectificativa ? "FC" : "FC"; // FC = Factura completa (siempre)
  const invoiceClass = esRectificativa ? "OO" : "OO";   // OO = Original (las rectificativas tb son OO en Facturae)

  // ── BatchIdentifier = NIF emisor + Número factura ──
  const batchId = `${esc(emp.cif)}${esc(fac.numero)}`;

  // ── Construir XML ──
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.es/Facturae/2014/v3.2.2/Facturae" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <FileHeader>
    <SchemaVersion>3.2.2</SchemaVersion>
    <Modality>I</Modality>
    <InvoiceIssuerType>EM</InvoiceIssuerType>
    <Batch>
      <BatchIdentifier>${esc(batchId)}</BatchIdentifier>
      <InvoicesCount>1</InvoicesCount>
      <TotalInvoicesAmount>
        <TotalAmount>${dec2(totalFac)}</TotalAmount>
      </TotalInvoicesAmount>
      <TotalOutstandingAmount>
        <TotalAmount>${dec2(totalFac)}</TotalAmount>
      </TotalOutstandingAmount>
      <TotalExecutableAmount>
        <TotalAmount>${dec2(totalFac)}</TotalAmount>
      </TotalExecutableAmount>
      <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
    </Batch>
  </FileHeader>
  <Parties>
    <SellerParty>
      <TaxIdentification>
        <PersonTypeCode>${empPersonType}</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${esc(emp.cif)}</TaxIdentificationNumber>
      </TaxIdentification>`;

  // Seller: LegalEntity o Individual según tipo
  if (empPersonType === "J") {
    xml += `
      <LegalEntity>
        <CorporateName>${esc(emp.razon_social || emp.nombre)}</CorporateName>
        <AddressInSpain>
          <Address>${esc(emp.direccion || "")}</Address>
          <PostCode>${esc(emp.cp || "00000")}</PostCode>
          <Town>${esc(emp.municipio || "")}</Town>
          <Province>${esc(emp.provincia || "")}</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      </LegalEntity>`;
  } else {
    // Persona física — usar Individual
    const { nombre: empNombre, apellidos: empApellidos } = splitNombreApellidos(emp.razon_social || emp.nombre);
    xml += `
      <Individual>
        <Name>${esc(empNombre)}</Name>
        <FirstSurname>${esc(empApellidos)}</FirstSurname>
        <AddressInSpain>
          <Address>${esc(emp.direccion || "")}</Address>
          <PostCode>${esc(emp.cp || "00000")}</PostCode>
          <Town>${esc(emp.municipio || "")}</Town>
          <Province>${esc(emp.provincia || "")}</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      </Individual>`;
  }

  xml += `
    </SellerParty>
    <BuyerParty>
      <TaxIdentification>
        <PersonTypeCode>${cliPersonType}</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${esc(cli.nif)}</TaxIdentificationNumber>
      </TaxIdentification>`;

  // Centros administrativos DIR3 (obligatorio para FACe)
  if (dir3OC || dir3OG || dir3UT) {
    xml += `
      <AdministrativeCentres>`;
    if (dir3OC) {
      xml += `
        <AdministrativeCentre>
          <CentreCode>${esc(dir3OC)}</CentreCode>
          <RoleTypeCode>01</RoleTypeCode>
          <CentreDescription>Oficina Contable</CentreDescription>
        </AdministrativeCentre>`;
    }
    if (dir3OG) {
      xml += `
        <AdministrativeCentre>
          <CentreCode>${esc(dir3OG)}</CentreCode>
          <RoleTypeCode>02</RoleTypeCode>
          <CentreDescription>Organo Gestor</CentreDescription>
        </AdministrativeCentre>`;
    }
    if (dir3UT) {
      xml += `
        <AdministrativeCentre>
          <CentreCode>${esc(dir3UT)}</CentreCode>
          <RoleTypeCode>03</RoleTypeCode>
          <CentreDescription>Unidad Tramitadora</CentreDescription>
        </AdministrativeCentre>`;
    }
    xml += `
      </AdministrativeCentres>`;
  }

  // Buyer: LegalEntity o Individual
  if (cliPersonType === "J") {
    xml += `
      <LegalEntity>
        <CorporateName>${esc(cli.razon_social || cli.nombre)}</CorporateName>
        <AddressInSpain>
          <Address>${esc(cli.direccion_fiscal || "")}</Address>
          <PostCode>${esc(cli.cp_fiscal || "00000")}</PostCode>
          <Town>${esc(cli.municipio_fiscal || "")}</Town>
          <Province>${esc(cli.provincia_fiscal || "")}</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      </LegalEntity>`;
  } else {
    const { nombre: cliNombre, apellidos: cliApellidos } = splitNombreApellidos(cli.razon_social || cli.nombre);
    xml += `
      <Individual>
        <Name>${esc(cliNombre)}</Name>
        <FirstSurname>${esc(cliApellidos)}</FirstSurname>
        <AddressInSpain>
          <Address>${esc(cli.direccion_fiscal || "")}</Address>
          <PostCode>${esc(cli.cp_fiscal || "00000")}</PostCode>
          <Town>${esc(cli.municipio_fiscal || "")}</Town>
          <Province>${esc(cli.provincia_fiscal || "")}</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      </Individual>`;
  }

  xml += `
    </BuyerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>${esc(fac.numero)}</InvoiceNumber>
        <InvoiceDocumentType>${invoiceDocType}</InvoiceDocumentType>
        <InvoiceClass>${invoiceClass}</InvoiceClass>`;

  // Rectificativa: añadir datos de corrección
  if (esRectificativa) {
    xml += `
        <Corrective>
          <InvoiceNumber>${esc(fac.factura_rectificada_numero || "")}</InvoiceNumber>
          <ReasonCode>01</ReasonCode>
          <ReasonDescription>Numero de la factura</ReasonDescription>
          <TaxPeriod>
            <StartDate>${fmtFechaISO(fac.factura_rectificada_fecha || fac.fecha)}</StartDate>
            <EndDate>${fmtFechaISO(fac.fecha)}</EndDate>
          </TaxPeriod>
          <CorrectionMethod>${fac.tipo_rectificacion === "S" ? "01" : "02"}</CorrectionMethod>
          <CorrectionMethodDescription>${fac.tipo_rectificacion === "S" ? "Rectificacion integra" : "Rectificacion por diferencias"}</CorrectionMethodDescription>
        </Corrective>`;
  }

  xml += `
      </InvoiceHeader>
      <InvoiceIssueData>
        <IssueDate>${fmtFechaISO(fac.fecha)}</IssueDate>
        <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
        <TaxCurrencyCode>EUR</TaxCurrencyCode>
        <LanguageCode>es</LanguageCode>
      </InvoiceIssueData>
      <TaxesOutputs>`;

  // Desglose IVA
  for (const [tipo, vals] of ivaMap) {
    xml += `
        <Tax>
          <TaxTypeCode>01</TaxTypeCode>
          <TaxRate>${dec2(tipo)}</TaxRate>
          <TaxableBase>
            <TotalAmount>${dec2(vals.base)}</TotalAmount>
          </TaxableBase>
          <TaxAmount>
            <TotalAmount>${dec2(vals.cuota)}</TotalAmount>
          </TaxAmount>
        </Tax>`;
  }

  xml += `
      </TaxesOutputs>
      <InvoiceTotals>
        <TotalGrossAmount>${dec2(totalBase)}</TotalGrossAmount>
        <TotalGrossAmountBeforeTaxes>${dec2(totalBase)}</TotalGrossAmountBeforeTaxes>
        <TotalTaxOutputs>${dec2(totalIva)}</TotalTaxOutputs>
        <TotalTaxesWithheld>0.00</TotalTaxesWithheld>
        <InvoiceTotal>${dec2(totalFac)}</InvoiceTotal>
        <TotalOutstandingAmount>${dec2(totalFac)}</TotalOutstandingAmount>
        <TotalExecutableAmount>${dec2(totalFac)}</TotalExecutableAmount>
      </InvoiceTotals>
      <Items>`;

  // Líneas de factura
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const dto = (1 - (l.dto1 || 0) / 100) * (1 - (l.dto2 || 0) / 100) * (1 - (l.dto3 || 0) / 100);
    const totalCost = (l.cant || 0) * (l.precio || 0);
    const grossAmount = totalCost * dto;
    const ivaLinea = l.iva || 0;

    xml += `
        <InvoiceLine>
          <ItemDescription>${esc(l.desc || `Linea ${i + 1}`)}</ItemDescription>
          <Quantity>${dec8(l.cant || 0)}</Quantity>
          <UnitPriceWithoutTax>${dec6(l.precio || 0)}</UnitPriceWithoutTax>
          <TotalCost>${dec2(totalCost)}</TotalCost>`;

    // Descuentos (si hay)
    if (dto < 1) {
      const descuentoTotal = totalCost - grossAmount;
      xml += `
          <DiscountsAndRebates>
            <Discount>
              <DiscountReason>Descuento</DiscountReason>
              <DiscountRate>${dec2((1 - dto) * 100)}</DiscountRate>
              <DiscountAmount>${dec2(descuentoTotal)}</DiscountAmount>
            </Discount>
          </DiscountsAndRebates>`;
    }

    xml += `
          <GrossAmount>${dec2(grossAmount)}</GrossAmount>
          <TaxesOutputs>
            <Tax>
              <TaxTypeCode>01</TaxTypeCode>
              <TaxRate>${dec2(ivaLinea)}</TaxRate>
              <TaxableBase>
                <TotalAmount>${dec2(grossAmount)}</TotalAmount>
              </TaxableBase>
              <TaxAmount>
                <TotalAmount>${dec2(grossAmount * ivaLinea / 100)}</TotalAmount>
              </TaxAmount>
            </Tax>
          </TaxesOutputs>
        </InvoiceLine>`;
  }

  xml += `
      </Items>`;

  // PaymentDetails (si hay forma de pago y fecha vencimiento)
  if (fac.fecha_vencimiento) {
    const metodoPago = mapFormaPago(fac.forma_pago);
    xml += `
      <PaymentDetails>
        <Installment>
          <InstallmentDueDate>${fmtFechaISO(fac.fecha_vencimiento)}</InstallmentDueDate>
          <InstallmentAmount>${dec2(totalFac)}</InstallmentAmount>
          <PaymentMeans>${metodoPago}</PaymentMeans>
        </Installment>
      </PaymentDetails>`;
  }

  // AdditionalData (observaciones)
  if (fac.observaciones) {
    xml += `
      <AdditionalData>
        <InvoiceAdditionalInformation>${esc(fac.observaciones)}</InvoiceAdditionalInformation>
      </AdditionalData>`;
  }

  xml += `
    </Invoice>
  </Invoices>
</fe:Facturae>`;

  return xml;
}

// ─── Helpers auxiliares ───

/** Determina si un NIF/CIF es persona jurídica */
function esPersonaJuridica(nif: string): boolean {
  if (!nif) return false;
  const first = nif.charAt(0).toUpperCase();
  // A-H, J, N, P, Q, R, S, U, V, W = persona jurídica
  return /^[A-HJ-NP-SW]$/.test(first);
}

/** Separa "Nombre Apellido1 Apellido2" en nombre + apellidos */
function splitNombreApellidos(full: string): { nombre: string; apellidos: string } {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length <= 1) return { nombre: parts[0] || "", apellidos: "" };
  return { nombre: parts[0], apellidos: parts.slice(1).join(" ") };
}

/** Mapea forma de pago del ERP a código Facturae */
function mapFormaPago(fp: string | undefined): string {
  if (!fp) return "04"; // Transferencia por defecto
  const lower = (fp || "").toLowerCase();
  if (lower.includes("transferencia")) return "04";
  if (lower.includes("domiciliaci")) return "02";
  if (lower.includes("recibo"))      return "02";
  if (lower.includes("tarjeta"))     return "01";
  if (lower.includes("efectivo"))    return "01";
  if (lower.includes("cheque"))      return "03";
  if (lower.includes("pagar"))       return "05"; // Pagaré
  if (lower.includes("confirming"))  return "13";
  return "04"; // Transferencia por defecto
}

// ─── SOAP FACe ───

/** Construye el SOAP Envelope para enviarFactura a FACe */
function buildSOAPEnviarFactura(xmlFacturae: string, correo: string): string {
  // FACe espera el XML firmado en base64
  const b64 = btoa(unescape(encodeURIComponent(xmlFacturae)));
  const mimeType = "application/xml";
  const fileName = "factura.xsig";

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:web="https://webservice.face.gob.es">
  <soapenv:Header/>
  <soapenv:Body>
    <web:enviarFactura>
      <web:correo>${esc(correo)}</web:correo>
      <web:factura>
        <web:factura>${b64}</web:factura>
        <web:nombre>${fileName}</web:nombre>
        <web:mime>${mimeType}</web:mime>
      </web:factura>
    </web:enviarFactura>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Construye el SOAP Envelope para anularFactura */
function buildSOAPAnularFactura(numeroRegistro: string, motivo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:web="https://webservice.face.gob.es">
  <soapenv:Header/>
  <soapenv:Body>
    <web:anularFactura>
      <web:numeroRegistro>${esc(numeroRegistro)}</web:numeroRegistro>
      <web:motivo>${esc(motivo)}</web:motivo>
    </web:anularFactura>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Construye el SOAP Envelope para consultarFactura */
function buildSOAPConsultarFactura(numeroRegistro: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:web="https://webservice.face.gob.es">
  <soapenv:Header/>
  <soapenv:Body>
    <web:consultarFactura>
      <web:numeroRegistro>${esc(numeroRegistro)}</web:numeroRegistro>
    </web:consultarFactura>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Parsea la respuesta SOAP de FACe */
function parseFACeResponse(xmlResp: string): {
  ok: boolean;
  codigo: string;
  descripcion: string;
  numeroRegistro?: string;
  codigoEstado?: string;
  estado?: string;
} {
  // Extraer código resultado
  const codMatch = xmlResp.match(/<codigo>(.*?)<\/codigo>/);
  const descMatch = xmlResp.match(/<descripcion>(.*?)<\/descripcion>/);
  const regMatch = xmlResp.match(/<numeroRegistro>(.*?)<\/numeroRegistro>/);

  // Estado de la factura (en consultarFactura)
  const codEstMatch = xmlResp.match(/<codigoEstado>(.*?)<\/codigoEstado>/i)
    || xmlResp.match(/<codigo_estado>(.*?)<\/codigo_estado>/i);
  const estMatch = xmlResp.match(/<descripcionEstado>(.*?)<\/descripcionEstado>/i)
    || xmlResp.match(/<descripcion_estado>(.*?)<\/descripcion_estado>/i);

  const codigo = codMatch?.[1] || "";
  const ok = codigo === "0" || codigo === "";

  return {
    ok,
    codigo,
    descripcion: descMatch?.[1] || "",
    numeroRegistro: regMatch?.[1],
    codigoEstado: codEstMatch?.[1],
    estado: estMatch?.[1],
  };
}

/** Mapea código de estado FACe a texto */
function estadoFACeLabel(codigo: string): string {
  const map: Record<string, string> = {
    "1200": "Registrada",
    "1300": "Contabilizada",
    "2400": "Pagada",
    "2500": "Rechazada",
    "2600": "Anulada",
    "3100": "Propuesta de pago",
    "3200": "Pago ordenado",
  };
  return map[codigo] || `Estado ${codigo}`;
}

// ─── Handler principal ───

Deno.serve(async (req: Request): Promise<Response> => {
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

  if (req.method !== "POST") {
    return json({ error: "Solo POST" }, 405);
  }

  try {
    // Auth: extraer JWT del header
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    // Crear cliente Supabase con service role (para leer/escribir todo)
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Validar que el usuario tiene sesión activa
    const sbUser = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await sbUser.auth.getUser(token);
    if (authErr || !user) {
      return json({ error: "No autorizado" }, 401);
    }

    // Leer body
    const body = await req.json();
    const { action, factura_id, empresa_id, motivo } = body;

    if (!action || !factura_id || !empresa_id) {
      return json({ error: "Faltan parámetros: action, factura_id, empresa_id" }, 400);
    }

    // ── Leer empresa ──
    const { data: empresa, error: empErr } = await sbAdmin
      .from("empresas").select("*").eq("id", empresa_id).single();
    if (empErr || !empresa) {
      return json({ error: "Empresa no encontrada" }, 404);
    }

    // Config FACe
    const faceConfig = (empresa.config?.face || {}) as Record<string, unknown>;
    const modo = (faceConfig.modo as string) || "test";
    const correo = (faceConfig.correo as string) || empresa.email || "";

    // ── Leer factura ──
    const { data: factura, error: facErr } = await sbAdmin
      .from("facturas").select("*").eq("id", factura_id).single();
    if (facErr || !factura) {
      return json({ error: "Factura no encontrada" }, 404);
    }

    // Validar que la factura es emitida (no borrador)
    if (factura.estado === "borrador") {
      return json({ error: "No se pueden enviar borradores a FACe" }, 400);
    }

    // ── Según acción ──
    if (action === "enviar") {
      // Leer cliente
      const { data: cliente, error: cliErr } = await sbAdmin
        .from("clientes").select("*").eq("id", factura.cliente_id).single();
      if (cliErr || !cliente) {
        return json({ error: "Cliente no encontrado" }, 404);
      }

      // Validar que el cliente es Administración Pública
      if (!cliente.es_administracion_publica) {
        return json({ error: "El cliente no está marcado como Administración Pública" }, 400);
      }

      // Validar DIR3
      const oc = factura.face_oficina_contable || cliente.face_oficina_contable;
      const og = factura.face_organo_gestor || cliente.face_organo_gestor;
      const ut = factura.face_unidad_tramitadora || cliente.face_unidad_tramitadora;
      if (!oc || !og || !ut) {
        return json({
          error: "Faltan códigos DIR3. Se necesitan: Oficina Contable, Órgano Gestor y Unidad Tramitadora",
          dir3: { oficina_contable: oc || null, organo_gestor: og || null, unidad_tramitadora: ut || null },
        }, 400);
      }

      // Generar XML Facturae 3.2.2
      const xmlFacturae = generarFacturaeXML(factura, cliente, empresa);

      // Construir SOAP
      const soapXml = buildSOAPEnviarFactura(xmlFacturae, correo);

      // Enviar al proxy (que firma y reenvía a FACe)
      const endpoint = FACE_ENDPOINTS[modo];
      if (!endpoint) {
        return json({ error: `Modo FACe no válido: ${modo}` }, 400);
      }

      let resultado;
      if (PROXY_URL) {
        const proxyResp = await fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PROXY_SECRET}`,
          },
          body: JSON.stringify({
            xml: soapXml,
            xml_facturae: xmlFacturae,
            modo,
            servicio: "face",
            accion: "enviarFactura",
          }),
        });
        resultado = await proxyResp.json();
      } else {
        // Sin proxy — modo simulación (solo genera XML, no envía)
        resultado = {
          ok: true,
          simulado: true,
          xml_facturae: xmlFacturae,
          mensaje: "Modo simulación: XML generado correctamente pero no enviado (sin proxy configurado)",
        };
      }

      // Parsear respuesta FACe
      let faceResp = { ok: true, codigo: "", descripcion: "Simulado", numeroRegistro: undefined as string | undefined, codigoEstado: undefined as string | undefined, estado: undefined as string | undefined };
      if (resultado.xml_respuesta) {
        faceResp = parseFACeResponse(resultado.xml_respuesta);
      } else if (resultado.simulado) {
        faceResp = { ok: true, codigo: "0", descripcion: "Simulación", numeroRegistro: `SIM-${Date.now()}`, codigoEstado: "1200", estado: "Registrada (simulada)" };
      }

      // Guardar en face_envios
      await sbAdmin.from("face_envios").insert({
        empresa_id,
        factura_id,
        accion: "enviar",
        numero_registro: faceResp.numeroRegistro || null,
        codigo_estado: faceResp.codigoEstado || (faceResp.ok ? "1200" : null),
        estado: faceResp.estado || (faceResp.ok ? "Registrada" : "Error"),
        motivo_rechazo: faceResp.ok ? null : faceResp.descripcion,
        xml_facturae: xmlFacturae,
        xml_respuesta: resultado.xml_respuesta || null,
      });

      // Actualizar factura
      if (faceResp.ok) {
        await sbAdmin.from("facturas").update({
          face_estado: resultado.simulado ? "simulado" : "registrada",
          face_numero_registro: faceResp.numeroRegistro || null,
          face_enviado_at: new Date().toISOString(),
          face_organo_gestor: og,
          face_unidad_tramitadora: ut,
          face_oficina_contable: oc,
        }).eq("id", factura_id);
      }

      return json({
        ok: faceResp.ok,
        estado: resultado.simulado ? "simulado" : (faceResp.ok ? "registrada" : "error"),
        numero_registro: faceResp.numeroRegistro || null,
        codigo_estado: faceResp.codigoEstado || null,
        descripcion: faceResp.descripcion,
        simulado: resultado.simulado || false,
        xml_preview: xmlFacturae.substring(0, 500) + "...",
      });

    } else if (action === "anular") {
      const nreg = factura.face_numero_registro;
      if (!nreg) {
        return json({ error: "La factura no tiene número de registro FACe" }, 400);
      }

      const soapXml = buildSOAPAnularFactura(nreg, motivo || "Anulación solicitada por el emisor");

      let resultado;
      if (PROXY_URL) {
        const proxyResp = await fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PROXY_SECRET}`,
          },
          body: JSON.stringify({ xml: soapXml, modo, servicio: "face", accion: "anularFactura" }),
        });
        resultado = await proxyResp.json();
      } else {
        resultado = { ok: true, simulado: true };
      }

      let faceResp = { ok: true, codigo: "0", descripcion: "Anulada", numeroRegistro: nreg, codigoEstado: "2600", estado: "Anulada" };
      if (resultado.xml_respuesta) {
        faceResp = { ...faceResp, ...parseFACeResponse(resultado.xml_respuesta) };
      }

      // Guardar
      await sbAdmin.from("face_envios").insert({
        empresa_id, factura_id, accion: "anular",
        numero_registro: nreg,
        codigo_estado: faceResp.codigoEstado,
        estado: faceResp.estado,
        xml_respuesta: resultado.xml_respuesta || null,
      });

      if (faceResp.ok) {
        await sbAdmin.from("facturas").update({
          face_estado: "anulada",
        }).eq("id", factura_id);
      }

      return json({
        ok: faceResp.ok,
        estado: faceResp.ok ? "anulada" : "error",
        descripcion: faceResp.descripcion,
      });

    } else if (action === "consultar") {
      const nreg = factura.face_numero_registro;
      if (!nreg) {
        return json({ error: "La factura no tiene número de registro FACe" }, 400);
      }

      const soapXml = buildSOAPConsultarFactura(nreg);

      let resultado;
      if (PROXY_URL) {
        const proxyResp = await fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PROXY_SECRET}`,
          },
          body: JSON.stringify({ xml: soapXml, modo, servicio: "face", accion: "consultarFactura" }),
        });
        resultado = await proxyResp.json();
      } else {
        resultado = { ok: true, simulado: true };
      }

      let faceResp = { ok: true, codigo: "0", descripcion: "", numeroRegistro: nreg, codigoEstado: factura.face_estado === "simulado" ? "1200" : undefined, estado: undefined as string | undefined };
      if (resultado.xml_respuesta) {
        faceResp = { ...faceResp, ...parseFACeResponse(resultado.xml_respuesta) };
      }

      // Guardar consulta
      await sbAdmin.from("face_envios").insert({
        empresa_id, factura_id, accion: "consultar",
        numero_registro: nreg,
        codigo_estado: faceResp.codigoEstado,
        estado: faceResp.estado || estadoFACeLabel(faceResp.codigoEstado || ""),
        xml_respuesta: resultado.xml_respuesta || null,
        respondido_at: new Date().toISOString(),
      });

      // Actualizar estado en factura si cambió
      if (faceResp.codigoEstado) {
        const nuevoEstado = estadoFACeLabel(faceResp.codigoEstado).toLowerCase();
        await sbAdmin.from("facturas").update({
          face_estado: nuevoEstado,
        }).eq("id", factura_id);
      }

      return json({
        ok: faceResp.ok,
        estado: faceResp.estado || estadoFACeLabel(faceResp.codigoEstado || ""),
        codigo_estado: faceResp.codigoEstado,
        descripcion: faceResp.descripcion,
        numero_registro: nreg,
      });

    } else {
      return json({ error: `Acción no válida: ${action}. Usar: enviar, anular, consultar` }, 400);
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("FACe error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
