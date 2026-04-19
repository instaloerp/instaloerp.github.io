// ════════════════════════════════════════════════════════════════
//  Proxy mTLS — VeriFactu + FACe — Deno Deploy
//  instaloERP v1.1 · v4 (WS-Security + XAdES signing for FACe)
// ════════════════════════════════════════════════════════════════
//
//  Variables de entorno en Deno Deploy:
//    CERT_PEM     — Certificado PEM (texto completo)
//    KEY_PEM      — Clave privada PEM (texto completo)
//    PROXY_SECRET — Token para autenticar peticiones
//
//  Servicios:
//    servicio = "verifactu" (default) → AEAT VeriFactu (forward XML)
//    servicio = "face"                → FACe MINHAP (WS-Security + XAdES)
//
// ════════════════════════════════════════════════════════════════

import * as https from "node:https";
import * as crypto from "node:crypto";
import { URL } from "node:url";

// ─── Endpoints ───

const VERIFACTU_ENDPOINTS: Record<string, string> = {
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  produccion: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
};

const FACE_ENDPOINTS: Record<string, string> = {
  test: "https://se-face-webservice.redsara.es/facturasrcf2",
  produccion: "https://webservice.face.gob.es/facturasrcf2",
};

// ─── Helpers crypto ───

function sha1B64(data: string): string {
  return crypto.createHash("sha1").update(data, "utf8").digest("base64");
}

function sha256B64(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("base64");
}

function sha1BufB64(data: Buffer): string {
  return crypto.createHash("sha1").update(data).digest("base64");
}

function sha256BufB64(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("base64");
}

function rsaSignSha1(data: string, keyPem: string): string {
  const sign = crypto.createSign("RSA-SHA1");
  sign.update(data, "utf8");
  return sign.sign(keyPem, "base64");
}

function rsaSignSha256(data: string, keyPem: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data, "utf8");
  return sign.sign(keyPem, "base64");
}

/** Extract base64 cert body from PEM */
function extractCertB64(pem: string): string {
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** ISO timestamp: 2026-04-19T17:33:35Z */
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** ISO timestamp + 5 minutes */
function isoExpires(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Generate a unique ID for XML elements */
function xmlId(): string {
  return "pfx" + crypto.randomUUID().replace(/-/g, "").substring(0, 32);
}

// ─── WS-Security Namespaces ───

const NS_SOAPENV = "http://schemas.xmlsoap.org/soap/envelope/";
const NS_WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const NS_WSU = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";
const NS_EXCC14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const NS_WEB = "https://webservice.face.gob.es";

// ─── WS-Security SOAP Signing ───

/**
 * Build a WS-Security signed SOAP envelope for FACe.
 * Signs the Body and Timestamp with the client certificate.
 */
function buildWSSecuritySOAP(
  bodyInnerXml: string,
  certPem: string,
  keyPem: string,
): string {
  const certB64 = extractCertB64(certPem);
  const certId = xmlId();
  const bodyId = xmlId();
  const tsId = xmlId();

  const created = isoNow();
  const expires = isoExpires();

  // ── Exclusive C14N forms for digest computation ──

  // Timestamp in exc-c14n form (standalone, with explicit namespace)
  const tsC14n = `<wsu:Timestamp xmlns:wsu="${NS_WSU}" wsu:Id="${tsId}"><wsu:Created>${created}</wsu:Created><wsu:Expires>${expires}</wsu:Expires></wsu:Timestamp>`;

  // Body in exc-c14n form (standalone, with explicit namespaces)
  const bodyC14n = `<soapenv:Body xmlns:soapenv="${NS_SOAPENV}" xmlns:wsu="${NS_WSU}" wsu:Id="${bodyId}">${bodyInnerXml}</soapenv:Body>`;

  // Compute digests (SHA-1 for WS-Security compatibility with FACe)
  const tsDigest = sha1B64(tsC14n);
  const bodyDigest = sha1B64(bodyC14n);

  // ── Build SignedInfo ──
  const signedInfoInner =
    `<ds:CanonicalizationMethod Algorithm="${NS_EXCC14N}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>` +
    `<ds:Reference URI="#${bodyId}">` +
      `<ds:Transforms><ds:Transform Algorithm="${NS_EXCC14N}"></ds:Transform></ds:Transforms>` +
      `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
      `<ds:DigestValue>${bodyDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference URI="#${tsId}">` +
      `<ds:Transforms><ds:Transform Algorithm="${NS_EXCC14N}"></ds:Transform></ds:Transforms>` +
      `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
      `<ds:DigestValue>${tsDigest}</ds:DigestValue>` +
    `</ds:Reference>`;

  // Exc-C14N of SignedInfo for signing
  const signedInfoC14n = `<ds:SignedInfo xmlns:ds="${NS_DS}">${signedInfoInner}</ds:SignedInfo>`;

  // Sign
  const signatureValue = rsaSignSha1(signedInfoC14n, keyPem);

  // ── Assemble SOAP ──
  const soap =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAPENV}" xmlns:web="${NS_WEB}">` +
      `<soapenv:Header>` +
        `<wsse:Security xmlns:wsse="${NS_WSSE}" xmlns:wsu="${NS_WSU}">` +
          `<wsse:BinarySecurityToken ` +
            `EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary" ` +
            `ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" ` +
            `wsu:Id="${certId}">${certB64}</wsse:BinarySecurityToken>` +
          `<ds:Signature xmlns:ds="${NS_DS}">` +
            `<ds:SignedInfo>${signedInfoInner}</ds:SignedInfo>` +
            `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
            `<ds:KeyInfo>` +
              `<wsse:SecurityTokenReference>` +
                `<wsse:Reference ` +
                  `ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" ` +
                  `URI="#${certId}"/>` +
              `</wsse:SecurityTokenReference>` +
            `</ds:KeyInfo>` +
          `</ds:Signature>` +
          `<wsu:Timestamp wsu:Id="${tsId}">` +
            `<wsu:Created>${created}</wsu:Created>` +
            `<wsu:Expires>${expires}</wsu:Expires>` +
          `</wsu:Timestamp>` +
        `</wsse:Security>` +
      `</soapenv:Header>` +
      `<soapenv:Body xmlns:wsu="${NS_WSU}" wsu:Id="${bodyId}">` +
        bodyInnerXml +
      `</soapenv:Body>` +
    `</soapenv:Envelope>`;

  return soap;
}

// ─── XAdES-ENVELOPED Signing for Facturae 3.2.2 ───

/**
 * Sign a Facturae XML with XAdES-ENVELOPED signature.
 * Required by FACe for the invoice file.
 */
function signFacturaeXades(xmlFacturae: string, certPem: string, keyPem: string): string {
  const uuid = crypto.randomUUID();
  const sigId = `Signature-${uuid}`;
  const refId = `Reference-${crypto.randomUUID()}`;

  // Certificate data
  const certB64 = extractCertB64(certPem);
  const certDer = Buffer.from(certB64, "base64");
  const certDigestB64 = sha256BufB64(certDer);

  // Parse certificate for issuer/serial
  let issuerName = "CN=Unknown";
  let serialNumber = "0";
  let modulusB64 = "";
  let exponentB64 = "AQAB";

  try {
    const x509 = new crypto.X509Certificate(certPem);
    // Format issuer: Node returns "C=ES\nO=FNMT-RCM\n..." → "CN=..., OU=..., O=..., C=ES"
    const parts = x509.issuer.split("\n").reverse();
    issuerName = parts.join(", ");
    serialNumber = BigInt("0x" + x509.serialNumber).toString();
  } catch (e) {
    console.warn("X509 parse warning:", e);
  }

  try {
    const pubKey = crypto.createPublicKey(certPem);
    const jwk = pubKey.export({ format: "jwk" }) as Record<string, string>;
    modulusB64 = jwk.n || "";
    exponentB64 = jwk.e || "AQAB";
  } catch (e) {
    console.warn("Public key export warning:", e);
  }

  const signingTime = isoNow();

  // ── Step 1: Document digest ──
  // Remove XML declaration for C14N, then digest
  const xmlClean = xmlFacturae.replace(/<\?xml[^?]*\?>\s*/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const docDigest = sha256B64(xmlClean);

  // ── Step 2: Build SignedProperties ──
  const signedPropsXml =
    `<xades:SignedProperties xmlns:ds="${NS_DS}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${sigId}-SignedProperties">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
              `<ds:DigestValue>${certDigestB64}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>` +
            `</xades:IssuerSerial>` +
          `</xades:Cert>` +
        `</xades:SigningCertificate>` +
        `<xades:SignaturePolicyIdentifier>` +
          `<xades:SignaturePolicyId>` +
            `<xades:SigPolicyId>` +
              `<xades:Identifier>http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf</xades:Identifier>` +
              `<xades:Description></xades:Description>` +
            `</xades:SigPolicyId>` +
            `<xades:SigPolicyHash>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
              `<ds:DigestValue>Ohixl6upD6av8N7pEvDABhEL6hM=</ds:DigestValue>` +
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

  const signedPropsDigest = sha256B64(signedPropsXml);

  // ── Step 3: Build KeyInfo ──
  const keyInfoXml =
    `<ds:KeyInfo xmlns:ds="${NS_DS}" Id="${sigId}-KeyInfo">` +
      `<ds:X509Data>` +
        `<ds:X509Certificate>${certB64}</ds:X509Certificate>` +
      `</ds:X509Data>` +
      `<ds:KeyValue>` +
        `<ds:RSAKeyValue>` +
          `<ds:Modulus>${modulusB64}</ds:Modulus>` +
          `<ds:Exponent>${exponentB64}</ds:Exponent>` +
        `</ds:RSAKeyValue>` +
      `</ds:KeyValue>` +
    `</ds:KeyInfo>`;

  const keyInfoDigest = sha256B64(keyInfoXml);

  // ── Step 4: Build SignedInfo ──
  const signedInfoXml =
    `<ds:SignedInfo xmlns:ds="${NS_DS}">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>` +
      `<ds:Reference Id="${refId}" URI="">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>` +
          `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>` +
          `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
            `<ds:XPath xmlns:ds="${NS_DS}">not(ancestor-or-self::ds:Signature)</ds:XPath>` +
          `</ds:Transform>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
        `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${sigId}-SignedProperties">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
        `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference URI="#${sigId}-KeyInfo">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
        `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // ── Step 5: Sign SignedInfo ──
  const signatureValue = rsaSignSha256(signedInfoXml, keyPem);

  // ── Step 6: Assemble Signature element ──
  // Note: in the final XML, namespace declarations are inherited from ds:Signature
  const signatureXml =
    `<ds:Signature Id="${sigId}-Signature" xmlns:ds="${NS_DS}">` +
      `<ds:SignedInfo>` +
        `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
        `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>` +
        `<ds:Reference Id="${refId}" URI="">` +
          `<ds:Transforms>` +
            `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>` +
            `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>` +
            `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
              `<ds:XPath xmlns:ds="${NS_DS}">not(ancestor-or-self::ds:Signature)</ds:XPath>` +
            `</ds:Transform>` +
          `</ds:Transforms>` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
          `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${sigId}-SignedProperties">` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
          `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference URI="#${sigId}-KeyInfo">` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
          `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
      `</ds:SignedInfo>` +
      `<ds:SignatureValue Id="${sigId}-SignatureValue">${signatureValue}</ds:SignatureValue>` +
      `<ds:KeyInfo Id="${sigId}-KeyInfo">` +
        `<ds:X509Data>` +
          `<ds:X509Certificate>${certB64}</ds:X509Certificate>` +
        `</ds:X509Data>` +
        `<ds:KeyValue>` +
          `<ds:RSAKeyValue>` +
            `<ds:Modulus>${modulusB64}</ds:Modulus>` +
            `<ds:Exponent>${exponentB64}</ds:Exponent>` +
          `</ds:RSAKeyValue>` +
        `</ds:KeyValue>` +
      `</ds:KeyInfo>` +
      `<ds:Object>` +
        `<xades:QualifyingProperties Id="${sigId}-QualifyingProperties" ` +
          `Target="#${sigId}-Signature" ` +
          `xmlns:ds="${NS_DS}" ` +
          `xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
          `<xades:SignedProperties Id="${sigId}-SignedProperties">` +
            `<xades:SignedSignatureProperties>` +
              `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
              `<xades:SigningCertificate>` +
                `<xades:Cert>` +
                  `<xades:CertDigest>` +
                    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
                    `<ds:DigestValue>${certDigestB64}</ds:DigestValue>` +
                  `</xades:CertDigest>` +
                  `<xades:IssuerSerial>` +
                    `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>` +
                    `<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>` +
                  `</xades:IssuerSerial>` +
                `</xades:Cert>` +
              `</xades:SigningCertificate>` +
              `<xades:SignaturePolicyIdentifier>` +
                `<xades:SignaturePolicyId>` +
                  `<xades:SigPolicyId>` +
                    `<xades:Identifier>http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf</xades:Identifier>` +
                    `<xades:Description></xades:Description>` +
                  `</xades:SigPolicyId>` +
                  `<xades:SigPolicyHash>` +
                    `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
                    `<ds:DigestValue>Ohixl6upD6av8N7pEvDABhEL6hM=</ds:DigestValue>` +
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

  // ── Step 7: Insert signature into XML before </fe:Facturae> ──
  return xmlFacturae.replace("</fe:Facturae>", signatureXml + "</fe:Facturae>");
}

// ─── FACe SOAP body builders ───

function buildFaceEnviarBody(signedXmlB64: string, correo: string): string {
  return `<web:enviarFactura xmlns:web="${NS_WEB}">` +
    `<web:correo>${escXml(correo)}</web:correo>` +
    `<web:factura>` +
      `<web:factura>${signedXmlB64}</web:factura>` +
      `<web:nombre>factura.xsig</web:nombre>` +
      `<web:mime>application/xml</web:mime>` +
    `</web:factura>` +
  `</web:enviarFactura>`;
}

function buildFaceAnularBody(numeroRegistro: string, motivo: string): string {
  return `<web:anularFactura xmlns:web="${NS_WEB}">` +
    `<web:numeroRegistro>${escXml(numeroRegistro)}</web:numeroRegistro>` +
    `<web:motivo>${escXml(motivo)}</web:motivo>` +
  `</web:anularFactura>`;
}

function buildFaceConsultarBody(numeroRegistro: string): string {
  return `<web:consultarFactura xmlns:web="${NS_WEB}">` +
    `<web:numeroRegistro>${escXml(numeroRegistro)}</web:numeroRegistro>` +
  `</web:consultarFactura>`;
}

/** Extract SOAP body inner content from a pre-built SOAP envelope */
function extractSoapBodyContent(soapXml: string): string {
  const bodyMatch = soapXml.match(/<(?:\w+:)?Body[^>]*>([\s\S]*?)<\/(?:\w+:)?Body>/i);
  return bodyMatch ? bodyMatch[1].trim() : soapXml;
}

// ─── HTTPS mTLS ───

function httpsRequest(
  url: string,
  body: string,
  cert: string,
  key: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      cert,
      key,
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": "",
        "Content-Length": Buffer.byteLength(body, "utf-8"),
      },
      rejectUnauthorized: true,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        const hdrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") hdrs[k] = v;
        }
        resolve({ status: res.statusCode || 0, body: data, headers: hdrs });
      });
    });

    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

// ─── Main Handler ───

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResp({ error: "Solo POST", version: "v4" }, 405);
  }

  try {
    // 1. Verificar token secreto
    const authHeader = req.headers.get("Authorization") || "";
    const proxySecret = Deno.env.get("PROXY_SECRET") || "";
    if (!proxySecret || authHeader !== `Bearer ${proxySecret}`) {
      return jsonResp({ error: "No autorizado" }, 401);
    }

    // 2. Leer body
    const reqBody = await req.json();
    const {
      xml,
      xml_facturae,
      modo,
      servicio = "verifactu",
      accion,
      correo = "",
      numero_registro,
      motivo,
    } = reqBody;

    if (!modo) {
      return jsonResp({ error: "Falta parámetro: modo" }, 400);
    }

    // 3. Cargar certificado
    let certPem = Deno.env.get("CERT_PEM") || "";
    let keyPem = Deno.env.get("KEY_PEM") || "";

    if (!certPem || !keyPem) {
      return jsonResp({ error: "CERT_PEM o KEY_PEM no configurados" }, 500);
    }

    certPem = certPem.replace(/\\n/g, "\n");
    keyPem = keyPem.replace(/\\n/g, "\n");

    const certOk = certPem.includes("-----BEGIN CERTIFICATE-----");
    const keyOk = keyPem.includes("-----BEGIN PRIVATE KEY-----") || keyPem.includes("-----BEGIN RSA PRIVATE KEY-----");
    if (!certOk || !keyOk) {
      return jsonResp({ error: `PEM inválido. CERT ok: ${certOk}, KEY ok: ${keyOk}` }, 500);
    }

    // 4. Seleccionar endpoint
    const endpointsMap = servicio === "face" ? FACE_ENDPOINTS : VERIFACTU_ENDPOINTS;
    const endpoint = endpointsMap[modo];
    if (!endpoint) {
      return jsonResp({ error: `Modo no válido: ${modo} (servicio: ${servicio})` }, 400);
    }

    // 5. Procesar según servicio
    if (servicio === "face") {
      // ── FACe: WS-Security signed SOAP ──
      let bodyContent: string;

      if (accion === "enviarFactura" && xml_facturae) {
        // Sign Facturae XML with XAdES-ENVELOPED
        const signedFacturae = signFacturaeXades(xml_facturae, certPem, keyPem);
        const signedB64 = Buffer.from(signedFacturae, "utf8").toString("base64");
        bodyContent = buildFaceEnviarBody(signedB64, correo);
      } else if (accion === "anularFactura" && numero_registro) {
        bodyContent = buildFaceAnularBody(numero_registro, motivo || "Anulación");
      } else if (accion === "consultarFactura" && numero_registro) {
        bodyContent = buildFaceConsultarBody(numero_registro);
      } else if (xml) {
        // Fallback: use pre-built body content from SOAP
        bodyContent = extractSoapBodyContent(xml);
      } else {
        return jsonResp({ error: "Faltan parámetros para FACe" }, 400);
      }

      // Build WS-Security signed SOAP envelope
      const signedSoap = buildWSSecuritySOAP(bodyContent, certPem, keyPem);

      // Send via mTLS
      const soapResp = await httpsRequest(endpoint, signedSoap, certPem, keyPem);

      return jsonResp({
        ok: soapResp.status >= 200 && soapResp.status < 300,
        status: soapResp.status,
        xml_respuesta: soapResp.body,
        endpoint,
        servicio: "face",
        accion,
        version: "v4-wssec-xades",
        timestamp: new Date().toISOString(),
      });

    } else {
      // ── VeriFactu: forward XML as-is ──
      if (!xml) {
        return jsonResp({ error: "Falta parámetro: xml" }, 400);
      }

      const soapResp = await httpsRequest(endpoint, xml, certPem, keyPem);

      return jsonResp({
        ok: soapResp.status >= 200 && soapResp.status < 300,
        status: soapResp.status,
        xml_respuesta: soapResp.body,
        endpoint,
        servicio: "verifactu",
        version: "v4-wssec-xades",
        timestamp: new Date().toISOString(),
      });
    }

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    return jsonResp({ error: errorMsg, stack: errorStack, version: "v4-wssec-xades" }, 500);
  }
});

function jsonResp(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
