// ════════════════════════════════════════════════════════════════
//  Edge Function: FACe — Facturación electrónica a AAPP
//  instaloERP v1.1
// ════════════════════════════════════════════════════════════════
//
//  POST /face
//  Body: { action: "validar"|"enviar"|"anular"|"consultar", factura_id: number, empresa_id: string }
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
import * as crypto from "node:crypto";
import { Buffer } from "node:buffer";
import forge from "npm:node-forge@1.3.1";
import { DOMParser as XmlDOMParser } from "npm:@xmldom/xmldom@0.9.5";

// ─── Config ───
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROXY_URL     = Deno.env.get("FACE_PROXY_URL") || Deno.env.get("VERIFACTU_PROXY_URL") || "";
const PROXY_SECRET  = Deno.env.get("FACE_PROXY_SECRET") || Deno.env.get("VERIFACTU_PROXY_SECRET") || "";

// ─── Certificado (.p12) para firma XAdES ───
const CERT_P12_BASE64 = Deno.env.get("CERT_P12_BASE64") || "";
const CERT_PASSWORD   = Deno.env.get("CERT_PASSWORD") || "";

// ─── Constantes firma XAdES-EPES ───
const NS_DS    = "http://www.w3.org/2000/09/xmldsig#";
const NS_XADES = "http://uri.etsi.org/01903/v1.3.2#";
const NS_FE    = "http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml";
const FACTURAE_POLICY_ID   = "http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf";
const FACTURAE_POLICY_HASH = "Ohixl6upD6av8N7pEvDABhEL6hM="; // SHA-1

// Endpoints FACe (MINHAP)
const FACE_ENDPOINTS: Record<string, string> = {
  produccion: "https://webservice.face.gob.es/facturasspp2",
  test:       "https://se-face-webservice.redsara.es/facturasspp2",
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
  serie?: string;
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
  telefono?: string;
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
<fe:Facturae xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml">
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
        <TradeName>${esc(emp.razon_social || emp.nombre)}</TradeName>
        <AddressInSpain>
          <Address>${esc(emp.direccion || "")}</Address>
          <PostCode>${esc(emp.cp || "00000")}</PostCode>
          <Town>${esc(emp.municipio || "")}</Town>
          <Province>${esc(emp.provincia || "")}</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>${emp.telefono ? `
        <ContactDetails>
          <Telephone>${esc(emp.telefono)}</Telephone>
        </ContactDetails>` : ""}
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
  // Dirección del comprador para los centros administrativos
  const cliDir = esc(cli.direccion_fiscal || "");
  const cliCP = esc(cli.cp_fiscal || "00000");
  const cliTown = esc(cli.municipio_fiscal || "");
  const cliProv = esc(cli.provincia_fiscal || "");

  if (dir3OC || dir3OG || dir3UT) {
    xml += `
      <AdministrativeCentres>`;
    if (dir3OC) {
      xml += `
        <AdministrativeCentre>
          <CentreCode>${esc(dir3OC)}</CentreCode>
          <RoleTypeCode>01</RoleTypeCode>
          <AddressInSpain>
            <Address>${cliDir}</Address>
            <PostCode>${cliCP}</PostCode>
            <Town>${cliTown}</Town>
            <Province>${cliProv}</Province>
            <CountryCode>ESP</CountryCode>
          </AddressInSpain>
        </AdministrativeCentre>`;
    }
    if (dir3OG) {
      xml += `
        <AdministrativeCentre>
          <CentreCode>${esc(dir3OG)}</CentreCode>
          <RoleTypeCode>02</RoleTypeCode>
          <AddressInSpain>
            <Address>${cliDir}</Address>
            <PostCode>${cliCP}</PostCode>
            <Town>${cliTown}</Town>
            <Province>${cliProv}</Province>
            <CountryCode>ESP</CountryCode>
          </AddressInSpain>
        </AdministrativeCentre>`;
    }
    if (dir3UT) {
      xml += `
        <AdministrativeCentre>
          <CentreCode>${esc(dir3UT)}</CentreCode>
          <RoleTypeCode>03</RoleTypeCode>
          <AddressInSpain>
            <Address>${cliDir}</Address>
            <PostCode>${cliCP}</PostCode>
            <Town>${cliTown}</Town>
            <Province>${cliProv}</Province>
            <CountryCode>ESP</CountryCode>
          </AddressInSpain>
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
        <TradeName>${esc(cli.razon_social || cli.nombre)}</TradeName>
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
        <InvoiceNumber>${esc(fac.numero)}</InvoiceNumber>${fac.serie ? `
        <InvoiceSeriesCode>${esc(fac.serie)}</InvoiceSeriesCode>` : ""}
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
        <OperationDate>${fmtFechaISO(fac.fecha)}</OperationDate>
        <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
        <TaxCurrencyCode>EUR</TaxCurrencyCode>
        <LanguageName>es</LanguageName>
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
        <TotalGeneralDiscounts>0.00</TotalGeneralDiscounts>
        <TotalGeneralSurcharges>0.00</TotalGeneralSurcharges>
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
          <Quantity>${dec2(l.cant || 0)}</Quantity>
          <UnitOfMeasure>01</UnitOfMeasure>
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

// ════════════════════════════════════════════════════════════════
//  Firma XAdES-EPES para Facturae 3.2.2
// ════════════════════════════════════════════════════════════════

interface ParsedCert {
  certPem: string;
  keyPem: string;
  certB64: string;      // Base64 DER certificate (sin headers)
  certDer: Buffer;      // Raw DER certificate
  issuerDN: string;     // RFC 2253 issuer DN
  serialNumber: string; // Decimal serial number
  subjectDN: string;
  modulusB64: string;
  exponentB64: string;
  chainB64: string[];   // Cadena completa de certificados (hoja + intermedios + raíz)
}

let _cachedCert: ParsedCert | null = null;

function loadCertificate(): ParsedCert {
  if (_cachedCert) return _cachedCert;
  if (!CERT_P12_BASE64) throw new Error("CERT_P12_BASE64 no configurado");

  const p12Der = forge.util.decode64(CERT_P12_BASE64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, CERT_PASSWORD);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBagList = certBags[forge.pki.oids.certBag];
  if (!certBagList || certBagList.length === 0) throw new Error("No cert in .p12");

  // Find leaf cert (the one with matching private key) and collect all certs for chain
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBagList = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
  if (!keyBagList || keyBagList.length === 0) throw new Error("No key in .p12");

  const forgeKey = keyBagList[0].key;
  if (!forgeKey) throw new Error("Key null");

  // Find leaf cert that matches the private key
  let forgeCert: any = null;
  for (const bag of certBagList) {
    if (bag.cert && bag.cert.publicKey) {
      const pubKeyPem = forge.pki.publicKeyToPem(bag.cert.publicKey);
      const privPubPem = forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(forgeKey.n, forgeKey.e));
      if (pubKeyPem === privPubPem) { forgeCert = bag.cert; break; }
    }
  }
  if (!forgeCert) forgeCert = certBagList[0].cert;
  if (!forgeCert) throw new Error("Cert null");

  const certPem = forge.pki.certificateToPem(forgeCert);
  const keyPem = forge.pki.privateKeyToPem(forgeKey);

  // DER certificate
  const certAsn1 = forge.pki.certificateToAsn1(forgeCert);
  const certDerStr = forge.asn1.toDer(certAsn1).getBytes();
  const certDer = Buffer.from(certDerStr, "binary");
  const certB64 = certDer.toString("base64");

  // Build certificate chain (all certs in P12 except the leaf, ordered: leaf first)
  const chainB64: string[] = [certB64];
  for (const bag of certBagList) {
    if (bag.cert && bag.cert !== forgeCert) {
      const cAsn1 = forge.pki.certificateToAsn1(bag.cert);
      const cDerStr = forge.asn1.toDer(cAsn1).getBytes();
      chainB64.push(Buffer.from(cDerStr, "binary").toString("base64"));
    }
  }
  console.log(`[cert] Chain: ${chainB64.length} certificates`);

  // Issuer DN RFC 2253 — decode UTF-8 correctly
  const issuerAttrs = forgeCert.issuer.attributes.slice().reverse();
  const issuerDN = issuerAttrs.map((a: any) => {
    const oid = a.shortName || a.name || a.type;
    // node-forge can return latin1-encoded strings for UTF-8 values
    let val = a.value as string;
    try {
      // If the string looks like mojibake, decode it
      const bytes = new Uint8Array(val.length);
      for (let i = 0; i < val.length; i++) bytes[i] = val.charCodeAt(i);
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (decoded !== val && /[À-ÿ]/.test(val)) val = decoded;
    } catch { /* keep original */ }
    return `${oid}=${val}`;
  }).join(", ");

  // Serial number (hex → decimal)
  const snHex = forgeCert.serialNumber;
  let snDec = "0";
  try {
    snDec = BigInt("0x" + snHex).toString(10);
  } catch { snDec = snHex; }

  // Subject DN
  const subjAttrs = forgeCert.subject.attributes.slice().reverse();
  const subjectDN = subjAttrs.map((a: any) => {
    const oid = a.shortName || a.name || a.type;
    return `${oid}=${a.value}`;
  }).join(", ");

  // RSA modulus/exponent
  const rsaPublicKey = forgeCert.publicKey as any;
  const modHex = rsaPublicKey.n.toString(16);
  const modBuf = Buffer.from(modHex.length % 2 ? "0" + modHex : modHex, "hex");
  const modulusB64 = modBuf.toString("base64");
  const expHex = rsaPublicKey.e.toString(16);
  const expBuf = Buffer.from(expHex.length % 2 ? "0" + expHex : expHex, "hex");
  const exponentB64 = expBuf.toString("base64");

  _cachedCert = { certPem, keyPem, certB64, certDer, issuerDN, serialNumber: snDec, subjectDN, modulusB64, exponentB64, chainB64 };
  console.log("[cert] Loaded:", subjectDN);
  return _cachedCert;
}

// ── Crypto helpers ──

function sha512B64(data: string): string {
  return crypto.createHash("sha512").update(data, "utf8").digest("base64");
}
function sha512BufB64(data: Buffer): string {
  return crypto.createHash("sha512").update(data).digest("base64");
}
function rsaSignSha512(data: string, keyPem: string): string {
  const sign = crypto.createSign("RSA-SHA512");
  sign.update(data, "utf8");
  return sign.sign(keyPem, "base64");
}
function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ── C14N 1.0 Inclusive — implementación propia ──
// Verificada contra XML SICI de referencia: produce los mismos digests
// que el validador FACe espera.

function escTextC14n(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}
function escAttrC14n(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");
}

/** Serializa un nodo DOM en forma canónica C14N 1.0 */
function c14nSerialize(node: any, parentNsContext: Record<string, string>): string {
  if (node.nodeType === 3) return escTextC14n(node.nodeValue || ""); // Text
  if (node.nodeType === 8 || node.nodeType === 7) return "";        // Comment, PI
  if (node.nodeType === 9) {                                         // Document
    let r = "";
    for (let i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].nodeType === 1) r += c14nSerialize(node.childNodes[i], parentNsContext);
    }
    return r;
  }
  if (node.nodeType !== 1) return "";

  const prefix = node.prefix || "";
  const localName = node.localName || node.nodeName;
  const tagName = prefix ? `${prefix}:${localName}` : localName;

  // Recoger TODAS las declaraciones xmlns de este elemento
  const elementNsDecls: Record<string, string> = {};
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes[i];
      if (a.name === "xmlns") elementNsDecls[""] = a.value;
      else if (a.name.startsWith("xmlns:")) elementNsDecls[a.name.substring(6)] = a.value;
    }
  }

  // Output las que difieran del contexto del padre
  const nsToOutput: [string, string][] = [];
  for (const [p, uri] of Object.entries(elementNsDecls)) {
    if (parentNsContext[p] !== uri) nsToOutput.push([p, uri]);
  }
  nsToOutput.sort((a, b) => {
    if (a[0] === "" && b[0] !== "") return -1;
    if (a[0] !== "" && b[0] === "") return 1;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  const thisNsContext = { ...parentNsContext };
  for (const [p, uri] of nsToOutput) thisNsContext[p] = uri;

  // Atributos no-xmlns, ordenados por ns URI + local name
  const attrs: any[] = [];
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes[i];
      if (!a.name.startsWith("xmlns")) attrs.push(a);
    }
  }
  attrs.sort((a: any, b: any) => {
    const nsA = a.namespaceURI || "";
    const nsB = b.namespaceURI || "";
    if (nsA !== nsB) return nsA < nsB ? -1 : 1;
    return (a.localName || a.name) < (b.localName || b.name) ? -1 : 1;
  });

  let result = `<${tagName}`;
  for (const [p, uri] of nsToOutput) {
    result += p ? ` xmlns:${p}="${escAttrC14n(uri)}"` : ` xmlns="${escAttrC14n(uri)}"`;
  }
  for (const a of attrs) {
    const an = a.prefix ? `${a.prefix}:${a.localName}` : (a.localName || a.name);
    result += ` ${an}="${escAttrC14n(a.value)}"`;
  }
  result += ">";
  for (let i = 0; i < node.childNodes.length; i++) {
    result += c14nSerialize(node.childNodes[i], thisNsContext);
  }
  result += `</${tagName}>`;
  return result;
}

/**
 * Canonicaliza un fragmento XML (string) según C14N 1.0 Inclusive.
 * @param ancestorNs — Namespaces heredados de ancestros fuera del subtree
 */
function canonicalize(
  xmlStr: string,
  ancestorNs?: Array<{ prefix: string; namespaceURI: string }>
): string {
  const parser = new XmlDOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  const root = doc.documentElement;
  // Añadir namespaces ancestros como attrs en el root para que C14N los incluya
  if (ancestorNs) {
    for (const ns of ancestorNs) {
      const attrName = ns.prefix ? `xmlns:${ns.prefix}` : "xmlns";
      if (!root.hasAttribute(attrName)) {
        root.setAttributeNS("http://www.w3.org/2000/xmlns/", attrName, ns.namespaceURI);
      }
    }
  }
  return c14nSerialize(doc, {});
}

/** Canonicaliza un nodo DOM ya parseado (para documento completo) */
function canonicalizeNode(node: any): string {
  return c14nSerialize(node, {});
}

// ── Firma XAdES-EPES enveloped ──

function signFacturaeXAdES(xmlFacturae: string, cert: ParsedCert): string {
  const uuid = crypto.randomUUID();
  const sigId = `Signature-${uuid}`;
  const refId = `Reference-${crypto.randomUUID()}`;
  const signingTime = isoNow();

  // Certificate digest (SHA-512 of DER)
  const certDigestB64 = sha512BufB64(cert.certDer);

  // ═══ Ancestor namespaces para C14N inclusiva ═══
  // SignedProperties vive dentro de: fe:Facturae > ds:Signature > ds:Object > xades:QualifyingProperties
  const spAncestorNs = [
    { prefix: "ds", namespaceURI: NS_DS },
    { prefix: "fe", namespaceURI: NS_FE },
    { prefix: "xades", namespaceURI: NS_XADES },
  ];
  // KeyInfo y SignedInfo viven dentro de: fe:Facturae > ds:Signature
  const siAncestorNs = [
    { prefix: "ds", namespaceURI: NS_DS },
    { prefix: "fe", namespaceURI: NS_FE },
  ];

  // Step 1: Document digest — C14N del documento completo (sin Signature, sin XML decl)
  const docParser = new XmlDOMParser();
  const docDom = docParser.parseFromString(xmlFacturae, "text/xml");
  const docC14n = canonicalizeNode(docDom.documentElement);
  const docDigest = sha512B64(docC14n);
  console.log("[xades] Doc digest:", docDigest.substring(0, 20) + "...");

  // Step 2: SignedProperties — C14N con namespaces ancestros
  const signedPropsXml =
    `<xades:SignedProperties xmlns:ds="${NS_DS}" xmlns:xades="${NS_XADES}" Id="${sigId}-SignedProperties">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
              `<ds:DigestValue>${certDigestB64}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName>${escXml(cert.issuerDN)}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber>${cert.serialNumber}</ds:X509SerialNumber>` +
            `</xades:IssuerSerial>` +
          `</xades:Cert>` +
        `</xades:SigningCertificate>` +
        `<xades:SignaturePolicyIdentifier>` +
          `<xades:SignaturePolicyId>` +
            `<xades:SigPolicyId>` +
              `<xades:Identifier>${FACTURAE_POLICY_ID}</xades:Identifier>` +
              `<xades:Description></xades:Description>` +
            `</xades:SigPolicyId>` +
            `<xades:SigPolicyHash>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
              `<ds:DigestValue>${FACTURAE_POLICY_HASH}</ds:DigestValue>` +
            `</xades:SigPolicyHash>` +
          `</xades:SignaturePolicyId>` +
        `</xades:SignaturePolicyIdentifier>` +
      `</xades:SignedSignatureProperties>` +
      `<xades:SignedDataObjectProperties>` +
        `<xades:DataObjectFormat ObjectReference="#${refId}">` +
          `<xades:Description></xades:Description>` +
          `<xades:ObjectIdentifier>` +
            `<xades:Identifier Qualifier="OIDAsURN">urn:oid:1.2.840.10003.5.109.10</xades:Identifier>` +
            `<xades:Description></xades:Description>` +
          `</xades:ObjectIdentifier>` +
          `<xades:MimeType>text/xml</xades:MimeType>` +
          `<xades:Encoding></xades:Encoding>` +
        `</xades:DataObjectFormat>` +
      `</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties>`;

  const signedPropsC14n = canonicalize(signedPropsXml, spAncestorNs);
  const signedPropsDigest = sha512B64(signedPropsC14n);
  console.log("[xades] SP digest:", signedPropsDigest.substring(0, 20) + "...");

  // Step 3: KeyInfo — C14N con namespaces ancestros
  const certChainXml = cert.chainB64.map(c => `<ds:X509Certificate>${c}</ds:X509Certificate>`).join("");
  const keyInfoXml =
    `<ds:KeyInfo xmlns:ds="${NS_DS}" Id="${sigId}-KeyInfo">` +
      `<ds:X509Data>` +
        certChainXml +
      `</ds:X509Data>` +
      `<ds:KeyValue>` +
        `<ds:RSAKeyValue>` +
          `<ds:Modulus>${cert.modulusB64}</ds:Modulus>` +
          `<ds:Exponent>${cert.exponentB64}</ds:Exponent>` +
        `</ds:RSAKeyValue>` +
      `</ds:KeyValue>` +
    `</ds:KeyInfo>`;

  const keyInfoC14n = canonicalize(keyInfoXml, siAncestorNs);
  const keyInfoDigest = sha512B64(keyInfoC14n);
  console.log("[xades] KI digest:", keyInfoDigest.substring(0, 20) + "...");

  // Step 4: SignedInfo — C14N con namespaces ancestros → firma RSA
  const signedInfoXml =
    `<ds:SignedInfo xmlns:ds="${NS_DS}">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"></ds:SignatureMethod>` +
      `<ds:Reference Id="${refId}" URI="">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>` +
          `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>` +
          `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
            `<ds:XPath>not(ancestor-or-self::ds:Signature)</ds:XPath>` +
          `</ds:Transform>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
        `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${sigId}-SignedProperties">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
        `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference URI="#${sigId}-KeyInfo">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
        `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // C14N del SignedInfo para firma RSA (el validador hará lo mismo)
  const signedInfoC14n = canonicalize(signedInfoXml, siAncestorNs);
  const signatureValue = rsaSignSha512(signedInfoC14n, cert.keyPem);
  console.log("[xades] RSA signature computed");

  // Step 5: Ensamblar ds:Signature completo
  const signatureXml =
    `<ds:Signature Id="${sigId}-Signature" xmlns:ds="${NS_DS}">` +
      `<ds:SignedInfo>` +
        `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
        `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"></ds:SignatureMethod>` +
        `<ds:Reference Id="${refId}" URI="">` +
          `<ds:Transforms>` +
            `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>` +
            `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>` +
            `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
              `<ds:XPath xmlns:ds="${NS_DS}">not(ancestor-or-self::ds:Signature)</ds:XPath>` +
            `</ds:Transform>` +
          `</ds:Transforms>` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
          `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${sigId}-SignedProperties">` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
          `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference URI="#${sigId}-KeyInfo">` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
          `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
      `</ds:SignedInfo>` +
      `<ds:SignatureValue Id="${sigId}-SignatureValue">${signatureValue}</ds:SignatureValue>` +
      `<ds:KeyInfo Id="${sigId}-KeyInfo">` +
        `<ds:X509Data>` +
          certChainXml +
        `</ds:X509Data>` +
        `<ds:KeyValue>` +
          `<ds:RSAKeyValue>` +
            `<ds:Modulus>${cert.modulusB64}</ds:Modulus>` +
            `<ds:Exponent>${cert.exponentB64}</ds:Exponent>` +
          `</ds:RSAKeyValue>` +
        `</ds:KeyValue>` +
      `</ds:KeyInfo>` +
      `<ds:Object>` +
        `<xades:QualifyingProperties Id="${sigId}-QualifyingProperties" ` +
          `Target="#${sigId}-Signature" ` +
          `xmlns:ds="${NS_DS}" ` +
          `xmlns:xades="${NS_XADES}">` +
          `<xades:SignedProperties Id="${sigId}-SignedProperties">` +
            `<xades:SignedSignatureProperties>` +
              `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
              `<xades:SigningCertificate>` +
                `<xades:Cert>` +
                  `<xades:CertDigest>` +
                    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
                    `<ds:DigestValue>${certDigestB64}</ds:DigestValue>` +
                  `</xades:CertDigest>` +
                  `<xades:IssuerSerial>` +
                    `<ds:X509IssuerName>${escXml(cert.issuerDN)}</ds:X509IssuerName>` +
                    `<ds:X509SerialNumber>${cert.serialNumber}</ds:X509SerialNumber>` +
                  `</xades:IssuerSerial>` +
                `</xades:Cert>` +
              `</xades:SigningCertificate>` +
              `<xades:SignaturePolicyIdentifier>` +
                `<xades:SignaturePolicyId>` +
                  `<xades:SigPolicyId>` +
                    `<xades:Identifier>${FACTURAE_POLICY_ID}</xades:Identifier>` +
                    `<xades:Description></xades:Description>` +
                  `</xades:SigPolicyId>` +
                  `<xades:SigPolicyHash>` +
                    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
                    `<ds:DigestValue>${FACTURAE_POLICY_HASH}</ds:DigestValue>` +
                  `</xades:SigPolicyHash>` +
                `</xades:SignaturePolicyId>` +
              `</xades:SignaturePolicyIdentifier>` +
            `</xades:SignedSignatureProperties>` +
            `<xades:SignedDataObjectProperties>` +
              `<xades:DataObjectFormat ObjectReference="#${refId}">` +
                `<xades:Description></xades:Description>` +
                `<xades:ObjectIdentifier>` +
                  `<xades:Identifier Qualifier="OIDAsURN">urn:oid:1.2.840.10003.5.109.10</xades:Identifier>` +
                  `<xades:Description></xades:Description>` +
                `</xades:ObjectIdentifier>` +
                `<xades:MimeType>text/xml</xades:MimeType>` +
                `<xades:Encoding></xades:Encoding>` +
              `</xades:DataObjectFormat>` +
            `</xades:SignedDataObjectProperties>` +
          `</xades:SignedProperties>` +
        `</xades:QualifyingProperties>` +
      `</ds:Object>` +
    `</ds:Signature>`;

  // Step 7: Insertar firma enveloped antes del cierre </fe:Facturae>
  if (xmlFacturae.includes("</fe:Facturae>")) {
    return xmlFacturae.replace("</fe:Facturae>", signatureXml + "</fe:Facturae>");
  } else if (xmlFacturae.includes("</Facturae>")) {
    return xmlFacturae.replace("</Facturae>", signatureXml + "</Facturae>");
  }
  throw new Error("No se encontró cierre de Facturae en XML");
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

// ─── Parser respuesta FACe ───
// El proxy v4 construye los SOAP Envelopes internamente (WS-Security + XAdES).
// La Edge Function solo envía parámetros y recibe la respuesta SOAP cruda.

/** Parsea la respuesta SOAP de FACe (con o sin namespace prefixes) */
function parseFACeResponse(xmlResp: string): {
  ok: boolean;
  codigo: string;
  descripcion: string;
  numeroRegistro?: string;
  codigoEstado?: string;
  estado?: string;
} {
  // Detectar SOAP Fault primero
  const faultMatch = xmlResp.match(/<(?:[\w-]+:)?Fault[^>]*>[\s\S]*?<faultcode>([\s\S]*?)<\/faultcode>[\s\S]*?<faultstring>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    return {
      ok: false,
      codigo: faultMatch[1].trim(),
      descripcion: faultMatch[2].trim(),
    };
  }

  // Extraer contenido del Body (ignorando namespaces)
  const bodyMatch = xmlResp.match(/<(?:[\w-]+:)?Body[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Body>/i);
  const body = bodyMatch ? bodyMatch[1] : xmlResp;

  // Buscar tags con o sin namespace prefix: <ns2:codigo>, <codigo>, <web:codigo>, etc.
  const tag = (name: string) => {
    const re = new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i");
    const m = body.match(re);
    return m ? m[1].trim() : "";
  };

  // resultado.codigo (0 = ok en FACe)
  const codigo = tag("codigo");
  // resultado.descripcion
  const descripcion = tag("descripcion");
  // enviarFactura → numero de registro
  const numeroRegistro = tag("numeroRegistro") || tag("numero_registro");
  // consultarFactura → estado
  const codigoEstado = tag("codigoEstado") || tag("codigo_estado");
  const estado = tag("descripcionEstado") || tag("descripcion_estado");

  // FACe devuelve codigo "0" cuando todo va bien
  const ok = codigo === "0" || codigo === "";

  return {
    ok,
    codigo,
    descripcion,
    numeroRegistro: numeroRegistro || undefined,
    codigoEstado: codigoEstado || undefined,
    estado: estado || undefined,
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

// ─── Auto-verificación del XML firmado ───

function verifySigned(xmlFirmado: string): Record<string, unknown> {
  try {
    const parser = new XmlDOMParser();
    const doc = parser.parseFromString(xmlFirmado, "text/xml");

    // Extraer DigestValues del XML
    const refs = doc.getElementsByTagNameNS(NS_DS, "Reference");
    const digests: Record<string, string> = {};
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      const uri = ref.getAttribute("URI") || "";
      const dvNodes = ref.getElementsByTagNameNS(NS_DS, "DigestValue");
      if (dvNodes.length > 0) digests[uri || "doc"] = dvNodes[0].textContent || "";
    }

    // 1. Verificar Document digest
    const docClone = parser.parseFromString(xmlFirmado, "text/xml");
    const sigNode = docClone.getElementsByTagNameNS(NS_DS, "Signature")[0];
    if (sigNode) sigNode.parentNode?.removeChild(sigNode);
    const docC14n = canonicalizeNode(docClone.documentElement);
    const docDigestComputed = sha512B64(docC14n);
    const docDigestXml = digests["doc"] || "";

    // 2. Verificar SignedProperties digest
    const spNode = doc.getElementsByTagNameNS(NS_XADES, "SignedProperties")[0];
    let spDigestComputed = "";
    let spC14nSnippet = "";
    if (spNode) {
      const spXmlStr = spNode.toString();
      const spC14n = canonicalize(spXmlStr, [
        { prefix: "ds", namespaceURI: NS_DS },
        { prefix: "fe", namespaceURI: NS_FE },
        { prefix: "xades", namespaceURI: NS_XADES },
      ]);
      spDigestComputed = sha512B64(spC14n);
      spC14nSnippet = spC14n.substring(0, 200);
    }
    // Find SP digest by URI fragment
    const spId = spNode?.getAttribute("Id") || "";
    const spDigestXml = digests[`#${spId}`] || "";

    // 3. Verificar KeyInfo digest
    const kiNode = doc.getElementsByTagNameNS(NS_DS, "KeyInfo")[0];
    let kiDigestComputed = "";
    let kiC14nSnippet = "";
    if (kiNode) {
      const kiXmlStr = kiNode.toString();
      const kiC14n = canonicalize(kiXmlStr, [
        { prefix: "ds", namespaceURI: NS_DS },
        { prefix: "fe", namespaceURI: NS_FE },
      ]);
      kiDigestComputed = sha512B64(kiC14n);
      kiC14nSnippet = kiC14n.substring(0, 200);
    }
    const kiId = kiNode?.getAttribute("Id") || "";
    const kiDigestXml = digests[`#${kiId}`] || "";

    // 4. Verificar SignedInfo C14N (lo que el validador usaría para RSA)
    const siNode = doc.getElementsByTagNameNS(NS_DS, "SignedInfo")[0];
    let siC14nSnippet = "";
    if (siNode) {
      const siXmlStr = siNode.toString();
      const siC14n = canonicalize(siXmlStr, [
        { prefix: "ds", namespaceURI: NS_DS },
        { prefix: "fe", namespaceURI: NS_FE },
      ]);
      siC14nSnippet = siC14n.substring(0, 300);
    }

    return {
      doc_digest_xml: docDigestXml,
      doc_digest_computed: docDigestComputed,
      doc_match: docDigestXml === docDigestComputed,
      doc_c14n_first200: docC14n.substring(0, 200),
      sp_digest_xml: spDigestXml,
      sp_digest_computed: spDigestComputed,
      sp_match: spDigestXml === spDigestComputed,
      sp_c14n_first200: spC14nSnippet,
      ki_digest_xml: kiDigestXml,
      ki_digest_computed: kiDigestComputed,
      ki_match: kiDigestXml === kiDigestComputed,
      ki_c14n_first200: kiC14nSnippet,
      si_c14n_first300: siC14nSnippet,
    };
  } catch (err: any) {
    return { error: err.message, stack: err.stack?.substring(0, 500) };
  }
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
    // Permitir service_role key (legacy JWT o nueva sb_secret) para testing/cron
    let user: { id: string; email?: string } | null = null;

    // Comprobar si el token es service_role: comparar con SUPABASE_KEY o verificar el payload
    let isServiceRole = (token === SUPABASE_KEY);
    if (!isServiceRole) {
      // También comprobar si es el JWT legacy con role=service_role
      try {
        const payload = JSON.parse(atob(token.split(".")[1] || "{}"));
        if (payload.role === "service_role" && payload.ref === "gskkqqhbpnycvuioqetj") {
          isServiceRole = true;
        }
      } catch (_) { /* no es JWT, ignorar */ }
    }

    if (isServiceRole) {
      user = { id: "service_role", email: "system@instaloerp.es" };
    } else {
      const sbUser = createClient(SUPABASE_URL, SUPABASE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user: authUser }, error: authErr } = await sbUser.auth.getUser(token);
      if (authErr || !authUser) {
        return json({ error: "No autorizado" }, 401);
      }
      user = authUser;
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
    const modoBody = body.modo as string | undefined;
    const modo = modoBody || (faceConfig.modo as string) || "produccion";
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
    if (action === "validar") {
      // Modo validación: genera XML sin enviar
      const { data: cliente, error: cliErr } = await sbAdmin
        .from("clientes").select("*").eq("id", factura.cliente_id).single();
      if (cliErr || !cliente) {
        return json({ error: "Cliente no encontrado" }, 404);
      }

      if (!cliente.es_administracion_publica) {
        return json({ error: "El cliente no está marcado como Administración Pública" }, 400);
      }

      const oc = factura.face_oficina_contable || cliente.face_oficina_contable;
      const og = factura.face_organo_gestor || cliente.face_organo_gestor;
      const ut = factura.face_unidad_tramitadora || cliente.face_unidad_tramitadora;
      if (!oc || !og || !ut) {
        return json({
          error: "Faltan códigos DIR3. Se necesitan: Oficina Contable, Órgano Gestor y Unidad Tramitadora",
          dir3: { oficina_contable: oc || null, organo_gestor: og || null, unidad_tramitadora: ut || null },
        }, 400);
      }

      const xmlFacturae = generarFacturaeXML(factura, cliente, empresa);

      // Guardar validación
      await sbAdmin.from("face_envios").insert({
        empresa_id,
        factura_id,
        accion: "validar",
        codigo_estado: null,
        estado: "validado",
        xml_facturae: xmlFacturae,
      });

      return json({
        ok: true,
        estado: "validado",
        modo,
        descripcion: "XML Facturae 3.2.2 generado correctamente (no enviado)",
        xml_facturae: xmlFacturae,
        base_imponible: factura.base_imponible,
        total_iva: factura.total_iva,
        total: factura.total,
        dir3: { oficina_contable: oc, organo_gestor: og, unidad_tramitadora: ut },
      });

    } else if (action === "descargar") {
      // Genera XML y lo firma con XAdES-EPES — devuelve XML firmado para descarga
      const { data: cliente, error: cliErr } = await sbAdmin
        .from("clientes").select("*").eq("id", factura.cliente_id).single();
      if (cliErr || !cliente) {
        return json({ error: "Cliente no encontrado" }, 404);
      }
      if (!cliente.es_administracion_publica) {
        return json({ error: "El cliente no está marcado como Administración Pública" }, 400);
      }
      const oc = factura.face_oficina_contable || cliente.face_oficina_contable;
      const og = factura.face_organo_gestor || cliente.face_organo_gestor;
      const ut = factura.face_unidad_tramitadora || cliente.face_unidad_tramitadora;
      if (!oc || !og || !ut) {
        return json({ error: "Faltan códigos DIR3", dir3: { oficina_contable: oc || null, organo_gestor: og || null, unidad_tramitadora: ut || null } }, 400);
      }

      // Generar XML sin firma
      const xmlSinFirma = generarFacturaeXML(factura, cliente, empresa);

      // Firmar con XAdES-EPES
      let xmlFirmado: string;
      try {
        const cert = loadCertificate();
        xmlFirmado = signFacturaeXAdES(xmlSinFirma, cert);
      } catch (err: any) {
        console.error("[face/descargar] Error firmando:", err);
        return json({ error: `Error firmando XML: ${err.message}. ¿Está configurado CERT_P12_BASE64?` }, 500);
      }

      // ── Auto-verificación: re-computar digests del XML firmado ──
      const verif = verifySigned(xmlFirmado);

      return json({
        ok: true,
        xml_firmado: xmlFirmado,
        numero: factura.numero,
        base_imponible: factura.base_imponible,
        total_iva: factura.total_iva,
        total: factura.total,
        _debug_verify: verif,
      });

    } else if (action === "enviar") {
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

      // ═══ Firmar XML con XAdES-EPES ═══
      const cert = loadCertificate();
      const xmlFirmado = signFacturaeXAdES(xmlFacturae, cert);
      console.log("[enviar] XML firmado:", xmlFirmado.length, "bytes");

      // Endpoint FACe
      const endpoint = FACE_ENDPOINTS[modo];
      if (!endpoint) {
        return json({ error: `Modo FACe no válido: ${modo}` }, 400);
      }

      // ═══ Construir SOAP Envelope ═══
      const xmlB64 = btoa(unescape(encodeURIComponent(xmlFirmado)));
      const nombreFichero = `${factura.numero || factura.id}.xsig`;
      const soapEnvelope =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fac="https://webservice.face.gob.es">` +
          `<soapenv:Header/>` +
          `<soapenv:Body>` +
            `<fac:enviarFactura>` +
              `<request>` +
                `<correo>${esc(correo)}</correo>` +
                `<factura>` +
                  `<factura>${xmlB64}</factura>` +
                  `<nombre>${esc(nombreFichero)}</nombre>` +
                  `<mime>application/xml</mime>` +
                `</factura>` +
                `<anexos/>` +
              `</request>` +
            `</fac:enviarFactura>` +
          `</soapenv:Body>` +
        `</soapenv:Envelope>`;
      console.log("[enviar] SOAP envelope:", soapEnvelope.length, "bytes");

      // ═══ Enviar a FACe ═══
      let resultado: any;
      let metodoEnvio = "desconocido";

      // Método 1: Envío directo con mTLS (Deno.createHttpClient)
      try {
        // @ts-ignore — Deno.createHttpClient puede no estar disponible en Deploy
        const httpClient = Deno.createHttpClient({
          certChain: cert.certPem,
          privateKey: cert.keyPem,
        });
        console.log("[enviar] Intentando envío directo con mTLS...");
        const directResp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "enviarFactura",
          },
          body: soapEnvelope,
          // @ts-ignore
          client: httpClient,
        });
        const respText = await directResp.text();
        resultado = {
          ok: directResp.ok,
          status: directResp.status,
          xml_respuesta: respText,
        };
        metodoEnvio = "directo-mTLS";
        console.log("[enviar] Envío directo OK, status:", directResp.status);
      } catch (directErr: any) {
        console.log("[enviar] mTLS directo no disponible:", directErr.message);

        // Método 2: Proxy relay (solo mTLS, XML ya firmado)
        if (PROXY_URL) {
          console.log("[enviar] Usando proxy:", PROXY_URL);
          try {
            const proxyResp = await fetch(PROXY_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${PROXY_SECRET}`,
              },
              body: JSON.stringify({
                soap_envelope: soapEnvelope,
                endpoint,
                correo,
                modo,
                servicio: "face",
                accion: "enviarFactura",
                // Enviar también el XML firmado para que el proxy pueda relay sin re-firmar
                xml_firmado: xmlFirmado,
              }),
            });
            resultado = await proxyResp.json();
            metodoEnvio = "proxy";
          } catch (proxyErr: any) {
            resultado = { ok: false, error: `Error de proxy: ${proxyErr.message}` };
            metodoEnvio = "proxy-error";
          }
        } else {
          // Método 3: Sin proxy — modo simulación
          resultado = {
            ok: true,
            simulado: true,
            xml_facturae: xmlFirmado,
            soap_preview: soapEnvelope.substring(0, 500) + "...",
            mensaje: "Modo simulación: XML firmado y SOAP generados pero no enviados (mTLS no disponible, sin proxy)",
          };
          metodoEnvio = "simulacion";
        }
      }

      // Parsear respuesta FACe
      let faceResp = { ok: true, codigo: "", descripcion: "Simulado", numeroRegistro: undefined as string | undefined, codigoEstado: undefined as string | undefined, estado: undefined as string | undefined };

      if (resultado.xml_respuesta && resultado.xml_respuesta.includes("<") && !resultado.xml_respuesta.includes("<!DOCTYPE html>")) {
        // Respuesta SOAP válida de FACe — parsear
        faceResp = parseFACeResponse(resultado.xml_respuesta);
      } else if (resultado.ok === false || resultado.error) {
        const desc = resultado.error
          || (resultado.xml_respuesta?.includes("<!DOCTYPE html>") ? `FACe devolvió error HTTP ${resultado.status || "?"}` : "Error de conexión con FACe")
          || "Error desconocido";
        faceResp = { ok: false, codigo: `HTTP-${resultado.status || "?"}`, descripcion: desc };
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
        xml_facturae: xmlFirmado,
        xml_respuesta: resultado.xml_respuesta || null,
      });

      // Actualizar factura
      if (faceResp.ok && !resultado.simulado) {
        await sbAdmin.from("facturas").update({
          face_estado: "registrada",
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
        metodo_envio: metodoEnvio,
        xml_preview: xmlFirmado.substring(0, 500) + "...",
      });

    } else if (action === "anular") {
      const nreg = factura.face_numero_registro;
      if (!nreg) {
        return json({ error: "La factura no tiene número de registro FACe" }, 400);
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
            modo,
            servicio: "face",
            accion: "anularFactura",
            numero_registro: nreg,
            motivo: motivo || "Anulación solicitada por el emisor",
          }),
        });
        resultado = await proxyResp.json();
      } else {
        resultado = { ok: true, simulado: true };
      }

      let faceResp = { ok: true, codigo: "0", descripcion: "Anulada", numeroRegistro: nreg, codigoEstado: "2600", estado: "Anulada" };
      if (resultado.xml_respuesta) {
        faceResp = { ...faceResp, ...parseFACeResponse(resultado.xml_respuesta) };
      } else if (resultado.error) {
        faceResp = { ok: false, codigo: "PROXY", descripcion: resultado.error, numeroRegistro: nreg, codigoEstado: undefined, estado: undefined };
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

      let resultado;
      if (PROXY_URL) {
        const proxyResp = await fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PROXY_SECRET}`,
          },
          body: JSON.stringify({
            modo,
            servicio: "face",
            accion: "consultarFactura",
            numero_registro: nreg,
          }),
        });
        resultado = await proxyResp.json();
      } else {
        resultado = { ok: true, simulado: true };
      }

      let faceResp = { ok: true, codigo: "0", descripcion: "", numeroRegistro: nreg, codigoEstado: factura.face_estado === "simulado" ? "1200" : undefined, estado: undefined as string | undefined };
      if (resultado.xml_respuesta) {
        faceResp = { ...faceResp, ...parseFACeResponse(resultado.xml_respuesta) };
      } else if (resultado.error) {
        faceResp = { ok: false, codigo: "PROXY", descripcion: resultado.error, numeroRegistro: nreg, codigoEstado: undefined, estado: undefined };
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
      return json({ error: `Acción no válida: ${action}. Usar: validar, descargar, enviar, anular, consultar` }, 400);
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
