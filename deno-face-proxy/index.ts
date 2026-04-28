// ════════════════════════════════════════════════════════════════
//  Proxy FACe — Firma XAdES-EPES + WS-Security + mTLS
//  instaloERP v1.1 — Deno Deploy
// ════════════════════════════════════════════════════════════════
//
//  Variables de entorno:
//    CERT_P12_BASE64  — Certificado .p12 codificado en base64
//    CERT_PASSWORD    — Contraseña del .p12
//    PROXY_SECRET     — Token Bearer para autenticar peticiones
//
//  POST / con JSON:
//    xml_facturae   — XML Facturae 3.2.2 sin firmar (para enviarFactura)
//    correo         — Email para notificaciones FACe
//    modo           — 'test' | 'produccion'
//    servicio       — 'face' (reservado para extensiones futuras)
//    accion         — 'enviarFactura' | 'anularFactura' | 'consultarFactura'
//    numero_registro — (para anular/consultar)
//    motivo          — (para anular)
//
// ════════════════════════════════════════════════════════════════

import * as https from "node:https";
import * as crypto from "node:crypto";
import { URL } from "node:url";
import forge from "npm:node-forge@1.3.1";

// ─── Endpoints FACe ───

const FACE_ENDPOINTS: Record<string, string> = {
  test: "https://se-face-webservice.redsara.es/facturasspp2",
  produccion: "https://webservice.face.gob.es/facturasspp2",
};

// ─── XML Namespaces ───

const NS_SOAPENV = "http://schemas.xmlsoap.org/soap/envelope/";
const NS_WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const NS_WSU = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";
const NS_EXCC14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const NS_WEB = "https://webservice.face.gob.es";
const NS_XADES = "http://uri.etsi.org/01903/v1.3.2#";

// ─── Facturae signing policy ───

const FACTURAE_POLICY_ID = "http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf";
const FACTURAE_POLICY_HASH = "Ohixl6upD6av8N7pEvDABhEL6hM="; // SHA-1

// ─── P12 Certificate Parsing ───

interface ParsedCert {
  certPem: string;      // Full PEM certificate
  keyPem: string;       // Full PEM private key
  certB64: string;      // Base64 DER certificate (no headers)
  certDer: Buffer;      // Raw DER certificate
  issuerDN: string;     // RFC 2253 issuer distinguished name
  serialNumber: string; // Decimal serial number
  subjectDN: string;    // RFC 2253 subject DN
  modulusB64: string;   // RSA modulus in base64 (JWK 'n')
  exponentB64: string;  // RSA exponent in base64 (JWK 'e')
}

let _cachedCert: ParsedCert | null = null;

/**
 * Parse the .p12 certificate from env vars. Caches the result
 * so we only parse once per cold start.
 */
function loadCertificate(): ParsedCert {
  if (_cachedCert) return _cachedCert;

  const p12B64 = Deno.env.get("CERT_P12_BASE64") || "";
  const password = Deno.env.get("CERT_PASSWORD") || "";

  if (!p12B64) {
    throw new Error("CERT_P12_BASE64 no configurado");
  }

  console.log("[cert] Parsing .p12 certificate...");

  // Decode p12 from base64
  const p12Der = forge.util.decode64(p12B64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBagList = certBags[forge.pki.oids.certBag];
  if (!certBagList || certBagList.length === 0) {
    throw new Error("No se encontró certificado en el .p12");
  }

  // Find the end-entity cert (not a CA cert)
  // Sort: prefer certs that have a matching key, then non-CA certs
  const forgeCert = certBagList[0].cert;
  if (!forgeCert) {
    throw new Error("Certificado extraído del .p12 es nulo");
  }

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBagList = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
  let forgeKey: forge.pki.PrivateKey | null = null;

  if (keyBagList && keyBagList.length > 0) {
    forgeKey = keyBagList[0].key as forge.pki.PrivateKey;
  }

  if (!forgeKey) {
    // Try unencrypted key bag
    const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyBagList2 = keyBags2[forge.pki.oids.keyBag];
    if (keyBagList2 && keyBagList2.length > 0) {
      forgeKey = keyBagList2[0].key as forge.pki.PrivateKey;
    }
  }

  if (!forgeKey) {
    throw new Error("No se encontró clave privada en el .p12");
  }

  // Convert to PEM
  const certPem = forge.pki.certificateToPem(forgeCert);
  const keyPem = forge.pki.privateKeyToPem(forgeKey);

  // DER certificate
  const certAsn1 = forge.pki.certificateToAsn1(forgeCert);
  const certDerStr = forge.asn1.toDer(certAsn1).getBytes();
  const certDer = Buffer.from(certDerStr, "binary");
  const certB64 = certDer.toString("base64");

  // Issuer DN in RFC 2253 format (reversed, comma-separated)
  // forge returns attributes in LDAP order; we need RFC 2253 (reversed)
  const issuerDN = buildRFC2253DN(forgeCert.issuer);
  const subjectDN = buildRFC2253DN(forgeCert.subject);

  // Serial number as decimal
  const serialHex = forgeCert.serialNumber; // hex string
  const serialNumber = BigInt("0x" + serialHex).toString();

  // RSA key components for KeyValue
  let modulusB64 = "";
  let exponentB64 = "AQAB"; // default 65537

  try {
    const pubKey = crypto.createPublicKey(certPem);
    const jwk = pubKey.export({ format: "jwk" }) as Record<string, string>;
    // JWK 'n' is base64url - convert to standard base64
    modulusB64 = base64urlToBase64(jwk.n || "");
    exponentB64 = base64urlToBase64(jwk.e || "AQAB");
  } catch (e) {
    console.warn("[cert] Public key JWK export warning:", e);
    // Fallback: extract from forge
    try {
      const rsaKey = forgeKey as forge.pki.rsa.PrivateKey;
      modulusB64 = forge.util.encode64(bigIntToBytes(rsaKey.n));
      exponentB64 = forge.util.encode64(bigIntToBytes(rsaKey.e));
    } catch (_e2) {
      console.warn("[cert] Forge RSA key extraction failed");
    }
  }

  console.log(`[cert] Certificate loaded: subject=${subjectDN}, issuer=${issuerDN}, serial=${serialNumber}`);
  console.log(`[cert] Cert PEM length: ${certPem.length}, Key PEM length: ${keyPem.length}`);

  _cachedCert = {
    certPem, keyPem, certB64, certDer,
    issuerDN, serialNumber, subjectDN,
    modulusB64, exponentB64,
  };

  return _cachedCert;
}

// ─── DN helpers ───

/**
 * Build RFC 2253 Distinguished Name from forge attributes.
 * RFC 2253 order: most specific first (reversed from ASN.1 sequence).
 * Example: "CN=Foo, OU=Bar, O=Baz, C=ES"
 */
function buildRFC2253DN(attrs: forge.pki.CertificateField[]): string {
  const oidNames: Record<string, string> = {
    "2.5.4.3": "CN",
    "2.5.4.4": "SN",          // Surname
    "2.5.4.5": "SERIALNUMBER",
    "2.5.4.6": "C",
    "2.5.4.7": "L",
    "2.5.4.8": "ST",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
    "2.5.4.42": "GN",         // Given Name
    "2.5.4.97": "organizationIdentifier",
    "1.2.840.113549.1.9.1": "emailAddress",
    "0.9.2342.19200300.100.1.25": "DC",
  };

  // forge gives attributes in LDAP order (C first, CN last for issuer)
  // RFC 2253 reverses this: CN first, C last
  const parts: string[] = [];
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i];
    const name = attr.shortName || oidNames[attr.type || ""] || attr.type || "OID";
    const value = attr.value || "";
    // Escape special chars in RFC 2253
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\+/g, "\\+")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/</g, "\\<")
      .replace(/>/g, "\\>");
    parts.push(`${name}=${escaped}`);
  }

  return parts.join(", ");
}

/** Convert a forge BigInteger to a byte string */
function bigIntToBytes(bi: forge.jsbn.BigInteger): string {
  const hex = bi.toString(16);
  // Ensure even length
  const padded = hex.length % 2 === 0 ? hex : "0" + hex;
  let bytes = "";
  for (let i = 0; i < padded.length; i += 2) {
    bytes += String.fromCharCode(parseInt(padded.substring(i, i + 2), 16));
  }
  return bytes;
}

/** Convert base64url to standard base64 */
function base64urlToBase64(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return b64;
}

// ─── Crypto helpers ───

function sha1B64(data: string): string {
  return crypto.createHash("sha1").update(data, "utf8").digest("base64");
}

function sha256B64(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("base64");
}

function sha256BufB64(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("base64");
}

function sha512B64(data: string): string {
  return crypto.createHash("sha512").update(data, "utf8").digest("base64");
}

function rsaSignSha256(data: string, keyPem: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data, "utf8");
  return sign.sign(keyPem, "base64");
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

/** ISO timestamp without milliseconds: 2026-04-28T10:30:00Z */
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** ISO timestamp + 5 minutes */
function isoExpires(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ════════════════════════════════════════════════════════════════
//  XAdES-EPES Enveloped Signature for Facturae 3.2.2
// ════════════════════════════════════════════════════════════════

/**
 * Sign a Facturae XML with XAdES-EPES enveloped signature.
 *
 * The signature is inserted inside the root <fe:Facturae> element,
 * following the Facturae 3.2.2 signing specification:
 *   - Enveloped signature (ds:Signature inside the document)
 *   - RSA-SHA256 signature algorithm
 *   - SHA-256 digests
 *   - XAdES-EPES with Facturae signing policy
 *   - C14N 1.0 (inclusive) canonicalization
 *   - References: document, SignedProperties, KeyInfo
 *
 * @param xmlFacturae - The unsigned Facturae 3.2.2 XML
 * @param cert - Parsed certificate data
 * @returns Signed XML with enveloped ds:Signature
 */
function signFacturaeXAdES(xmlFacturae: string, cert: ParsedCert): string {
  const uuid = crypto.randomUUID();
  const sigId = `Signature-${uuid}`;
  const refId = `Reference-${crypto.randomUUID()}`;

  const signingTime = isoNow();

  // ── Certificate digest (SHA-256 of DER cert) ──
  const certDigestB64 = sha256BufB64(cert.certDer);

  // ── Step 1: Document digest ──
  // For enveloped signature with C14N, we digest the document WITHOUT the
  // XML declaration and WITHOUT any existing ds:Signature.
  // The transforms specify: C14N + enveloped-signature + XPath exclusion.
  const xmlClean = xmlFacturae
    .replace(/<\?xml[^?]*\?>\s*/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const docDigest = sha256B64(xmlClean);

  // ── Step 2: Build SignedProperties for XAdES-EPES ──
  // This must be canonicalized identically for both digest computation
  // and the final XML. We build it with explicit namespace declarations
  // as they would appear after C14N.
  const signedPropsXml =
    `<xades:SignedProperties xmlns:ds="${NS_DS}" xmlns:xades="${NS_XADES}" Id="${sigId}-SignedProperties">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
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

  const signedPropsDigest = sha256B64(signedPropsXml);

  // ── Step 3: Build KeyInfo ──
  const keyInfoXml =
    `<ds:KeyInfo xmlns:ds="${NS_DS}" Id="${sigId}-KeyInfo">` +
      `<ds:X509Data>` +
        `<ds:X509Certificate>${cert.certB64}</ds:X509Certificate>` +
      `</ds:X509Data>` +
      `<ds:KeyValue>` +
        `<ds:RSAKeyValue>` +
          `<ds:Modulus>${cert.modulusB64}</ds:Modulus>` +
          `<ds:Exponent>${cert.exponentB64}</ds:Exponent>` +
        `</ds:RSAKeyValue>` +
      `</ds:KeyValue>` +
    `</ds:KeyInfo>`;

  const keyInfoDigest = sha256B64(keyInfoXml);

  // ── Step 4: Build SignedInfo ──
  // Uses C14N 1.0 inclusive, RSA-SHA256
  // Three references: document, SignedProperties, KeyInfo
  const signedInfoXml =
    `<ds:SignedInfo xmlns:ds="${NS_DS}">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>` +
      // Reference 1: The document itself (enveloped)
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
      // Reference 2: SignedProperties (XAdES)
      `<ds:Reference Type="${NS_XADES}#SignedProperties" URI="#${sigId}-SignedProperties">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
        `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
      // Reference 3: KeyInfo
      `<ds:Reference URI="#${sigId}-KeyInfo">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
        `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // ── Step 5: RSA-SHA256 Signature ──
  const signatureValue = rsaSignSha256(signedInfoXml, cert.keyPem);

  // ── Step 6: Assemble the complete ds:Signature element ──
  // Inside the final document, namespace declarations are on ds:Signature root;
  // child elements inherit them (no need for per-element xmlns).
  const signatureXml =
    `<ds:Signature Id="${sigId}-Signature" xmlns:ds="${NS_DS}">` +
      // SignedInfo (without the xmlns:ds used for digest computation — it inherits from parent)
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
        `<ds:Reference Type="${NS_XADES}#SignedProperties" URI="#${sigId}-SignedProperties">` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
          `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference URI="#${sigId}-KeyInfo">` +
          `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
          `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
      `</ds:SignedInfo>` +
      `<ds:SignatureValue Id="${sigId}-SignatureValue">${signatureValue}</ds:SignatureValue>` +
      // KeyInfo (without xmlns:ds — inherited)
      `<ds:KeyInfo Id="${sigId}-KeyInfo">` +
        `<ds:X509Data>` +
          `<ds:X509Certificate>${cert.certB64}</ds:X509Certificate>` +
        `</ds:X509Data>` +
        `<ds:KeyValue>` +
          `<ds:RSAKeyValue>` +
            `<ds:Modulus>${cert.modulusB64}</ds:Modulus>` +
            `<ds:Exponent>${cert.exponentB64}</ds:Exponent>` +
          `</ds:RSAKeyValue>` +
        `</ds:KeyValue>` +
      `</ds:KeyInfo>` +
      // QualifyingProperties (XAdES)
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
                    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
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

  // ── Step 7: Insert enveloped signature before closing </fe:Facturae> ──
  // Support both with and without namespace prefix
  if (xmlFacturae.includes("</fe:Facturae>")) {
    return xmlFacturae.replace("</fe:Facturae>", signatureXml + "</fe:Facturae>");
  } else if (xmlFacturae.includes("</Facturae>")) {
    return xmlFacturae.replace("</Facturae>", signatureXml + "</Facturae>");
  } else {
    // Fallback: append before last closing tag
    const lastClose = xmlFacturae.lastIndexOf("</");
    if (lastClose >= 0) {
      return xmlFacturae.substring(0, lastClose) + signatureXml + xmlFacturae.substring(lastClose);
    }
    throw new Error("No se pudo encontrar el cierre del elemento raíz Facturae");
  }
}

// ════════════════════════════════════════════════════════════════
//  WS-Security SOAP Envelope for FACe
// ════════════════════════════════════════════════════════════════

/**
 * Build a WS-Security signed SOAP envelope.
 * Signs Body and Timestamp with RSA-SHA512 + exc-c14n.
 * Includes BinarySecurityToken with the X.509 cert.
 */
function buildWSSecuritySOAP(
  bodyInnerXml: string,
  cert: ParsedCert,
): string {
  const certId = "CertId-" + crypto.randomUUID();
  const bodyId = "BodyId-" + crypto.randomUUID();
  const tsId = "TimestampId-" + crypto.randomUUID();
  const sigId = "SignatureId-" + crypto.randomUUID();
  const keyInfoId = "KeyId-" + crypto.randomUUID();
  const secTokId = "SecTokId-" + crypto.randomUUID();

  const created = isoNow();
  const expires = isoExpires();

  // ── Exclusive C14N forms for digest computation ──
  // Each signed element needs its visibly-utilized namespace declarations
  const tsC14n =
    `<wsu:Timestamp xmlns:wsu="${NS_WSU}" wsu:Id="${tsId}">` +
    `<wsu:Created>${created}</wsu:Created>` +
    `<wsu:Expires>${expires}</wsu:Expires>` +
    `</wsu:Timestamp>`;

  const bodyC14n =
    `<soapenv:Body xmlns:soapenv="${NS_SOAPENV}" xmlns:wsu="${NS_WSU}" wsu:Id="${bodyId}">` +
    bodyInnerXml +
    `</soapenv:Body>`;

  // Digests with SHA-512
  const tsDigest = sha512B64(tsC14n);
  const bodyDigest = sha512B64(bodyC14n);

  // ── Build SignedInfo (RSA-SHA512) ──
  // IMPORTANT: Tags must NOT be self-closing (C14N requires expanded empty tags)
  const signedInfoInner =
    `<ds:CanonicalizationMethod Algorithm="${NS_EXCC14N}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"></ds:SignatureMethod>` +
    `<ds:Reference URI="#${tsId}">` +
      `<ds:Transforms><ds:Transform Algorithm="${NS_EXCC14N}"></ds:Transform></ds:Transforms>` +
      `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
      `<ds:DigestValue>${tsDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference URI="#${bodyId}">` +
      `<ds:Transforms><ds:Transform Algorithm="${NS_EXCC14N}"></ds:Transform></ds:Transforms>` +
      `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>` +
      `<ds:DigestValue>${bodyDigest}</ds:DigestValue>` +
    `</ds:Reference>`;

  // Exc-C14N of SignedInfo for RSA signing
  const signedInfoC14n = `<ds:SignedInfo xmlns:ds="${NS_DS}">${signedInfoInner}</ds:SignedInfo>`;
  const signatureValue = rsaSignSha512(signedInfoC14n, cert.keyPem);

  // ── Assemble complete SOAP envelope ──
  const soap =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAPENV}" xmlns:web="${NS_WEB}" xmlns:ds="${NS_DS}" xmlns:wsu="${NS_WSU}" xmlns:wsse="${NS_WSSE}">` +
      `<soapenv:Header>` +
        `<wsse:Security soapenv:mustUnderstand="1">` +
          `<wsse:BinarySecurityToken ` +
            `EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary" ` +
            `wsu:Id="${certId}" ` +
            `ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3">${cert.certB64}</wsse:BinarySecurityToken>` +
          `<ds:Signature Id="${sigId}">` +
            `<ds:SignedInfo>${signedInfoInner}</ds:SignedInfo>` +
            `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
            `<ds:KeyInfo Id="${keyInfoId}">` +
              `<wsse:SecurityTokenReference wsu:Id="${secTokId}">` +
                `<wsse:Reference ` +
                  `URI="#${certId}" ` +
                  `ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"></wsse:Reference>` +
              `</wsse:SecurityTokenReference>` +
            `</ds:KeyInfo>` +
          `</ds:Signature>` +
          `<wsu:Timestamp wsu:Id="${tsId}">` +
            `<wsu:Created>${created}</wsu:Created>` +
            `<wsu:Expires>${expires}</wsu:Expires>` +
          `</wsu:Timestamp>` +
        `</wsse:Security>` +
      `</soapenv:Header>` +
      `<soapenv:Body wsu:Id="${bodyId}">` +
        bodyInnerXml +
      `</soapenv:Body>` +
    `</soapenv:Envelope>`;

  return soap;
}

// ════════════════════════════════════════════════════════════════
//  FACe SOAP Body Builders
// ════════════════════════════════════════════════════════════════

/**
 * enviarFactura: sends the signed XML (base64) + email + optional attachments.
 * WSDL: enviarFacturaIn has a single <request> wrapper.
 */
function buildFaceEnviarBody(signedXmlB64: string, correo: string): string {
  return `<web:enviarFactura xmlns:web="${NS_WEB}">` +
    `<request>` +
      `<correo>${escXml(correo)}</correo>` +
      `<factura>` +
        `<factura>${signedXmlB64}</factura>` +
        `<nombre>factura.xsig</nombre>` +
        `<mime>application/xml</mime>` +
      `</factura>` +
      `<anexos></anexos>` +
    `</request>` +
  `</web:enviarFactura>`;
}

/**
 * anularFactura: sends numero_registro + motivo.
 * WSDL: anularFacturaIn has 2 separate parts (no <request>).
 */
function buildFaceAnularBody(numeroRegistro: string, motivo: string): string {
  return `<web:anularFactura xmlns:web="${NS_WEB}">` +
    `<numeroRegistro>${escXml(numeroRegistro)}</numeroRegistro>` +
    `<motivo>${escXml(motivo)}</motivo>` +
  `</web:anularFactura>`;
}

/**
 * consultarFactura: sends numero_registro.
 * WSDL: consultarFacturaIn has 1 separate part (no <request>).
 */
function buildFaceConsultarBody(numeroRegistro: string): string {
  return `<web:consultarFactura xmlns:web="${NS_WEB}">` +
    `<numeroRegistro>${escXml(numeroRegistro)}</numeroRegistro>` +
  `</web:consultarFactura>`;
}

// ════════════════════════════════════════════════════════════════
//  HTTPS mTLS Request
// ════════════════════════════════════════════════════════════════

/**
 * Send HTTPS request with mutual TLS (client certificate).
 * FACe requires mTLS with the same cert used for WS-Security.
 */
function httpsRequest(
  url: string,
  body: string,
  certPem: string,
  keyPem: string,
  soapAction = "",
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      cert: certPem,
      key: keyPem,
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": soapAction,
        "Content-Length": Buffer.byteLength(body, "utf-8"),
      },
      rejectUnauthorized: true,
      timeout: 30000, // 30 second timeout
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

    req.on("timeout", () => {
      req.destroy(new Error("Request timeout (30s)"));
    });

    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

// ════════════════════════════════════════════════════════════════
//  Request Validation
// ════════════════════════════════════════════════════════════════

interface FaceRequest {
  xml_facturae?: string;
  correo?: string;
  modo: "test" | "produccion";
  servicio: string;
  accion: "enviarFactura" | "anularFactura" | "consultarFactura";
  numero_registro?: string;
  motivo?: string;
}

function validateRequest(body: Record<string, unknown>): { valid: boolean; error?: string; data?: FaceRequest } {
  const { modo, servicio, accion } = body;

  if (!modo || (modo !== "test" && modo !== "produccion")) {
    return { valid: false, error: "modo debe ser 'test' o 'produccion'" };
  }

  if (servicio !== "face") {
    return { valid: false, error: "servicio debe ser 'face'" };
  }

  if (!accion || !["enviarFactura", "anularFactura", "consultarFactura"].includes(accion as string)) {
    return { valid: false, error: "accion debe ser 'enviarFactura', 'anularFactura' o 'consultarFactura'" };
  }

  if (accion === "enviarFactura") {
    if (!body.xml_facturae || typeof body.xml_facturae !== "string") {
      return { valid: false, error: "xml_facturae es obligatorio para enviarFactura" };
    }
    // Basic sanity check on XML
    const xml = body.xml_facturae as string;
    if (!xml.includes("Facturae") && !xml.includes("facturae")) {
      return { valid: false, error: "xml_facturae no parece ser un XML Facturae valido" };
    }
  }

  if (accion === "anularFactura") {
    if (!body.numero_registro || typeof body.numero_registro !== "string") {
      return { valid: false, error: "numero_registro es obligatorio para anularFactura" };
    }
    if (!body.motivo || typeof body.motivo !== "string") {
      return { valid: false, error: "motivo es obligatorio para anularFactura" };
    }
  }

  if (accion === "consultarFactura") {
    if (!body.numero_registro || typeof body.numero_registro !== "string") {
      return { valid: false, error: "numero_registro es obligatorio para consultarFactura" };
    }
  }

  return {
    valid: true,
    data: {
      xml_facturae: body.xml_facturae as string | undefined,
      correo: (body.correo as string) || "",
      modo: modo as "test" | "produccion",
      servicio: servicio as string,
      accion: accion as "enviarFactura" | "anularFactura" | "consultarFactura",
      numero_registro: body.numero_registro as string | undefined,
      motivo: body.motivo as string | undefined,
    },
  };
}

// ════════════════════════════════════════════════════════════════
//  Main HTTP Handler
// ════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().substring(0, 8);

  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // ── Health check ──
  if (req.method === "GET") {
    let certStatus = "not_loaded";
    try {
      loadCertificate();
      certStatus = "ok";
    } catch (e) {
      certStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    return jsonResp({
      status: "ok",
      service: "face-proxy",
      version: "v1.0",
      cert: certStatus,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Only POST allowed ──
  if (req.method !== "POST") {
    return jsonResp({ error: "Solo se aceptan peticiones POST", version: "v1.0" }, 405);
  }

  try {
    // ── 1. Authenticate ──
    const authHeader = req.headers.get("Authorization") || "";
    const proxySecret = Deno.env.get("PROXY_SECRET") || "";

    if (!proxySecret) {
      console.error(`[${requestId}] PROXY_SECRET no configurado`);
      return jsonResp({ error: "Servidor no configurado: falta PROXY_SECRET" }, 500);
    }

    if (authHeader !== `Bearer ${proxySecret}`) {
      console.warn(`[${requestId}] Auth failed`);
      return jsonResp({ error: "No autorizado" }, 401);
    }

    // ── 2. Parse and validate request body ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (_e) {
      return jsonResp({ error: "Body JSON invalido" }, 400);
    }

    const validation = validateRequest(body);
    if (!validation.valid || !validation.data) {
      return jsonResp({ error: validation.error }, 400);
    }

    const reqData = validation.data;
    console.log(`[${requestId}] ${reqData.accion} modo=${reqData.modo}`);

    // ── 3. Load certificate from .p12 ──
    let cert: ParsedCert;
    try {
      cert = loadCertificate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[${requestId}] Certificate error: ${msg}`);
      return jsonResp({ error: `Error cargando certificado: ${msg}` }, 500);
    }

    // ── 4. Resolve endpoint ──
    const endpoint = FACE_ENDPOINTS[reqData.modo];
    if (!endpoint) {
      return jsonResp({ error: `Modo no valido: ${reqData.modo}` }, 400);
    }

    // ── 5. Build SOAP body based on action ──
    let soapBodyContent: string;
    const soapAction = `${NS_WEB}#${reqData.accion}`;

    if (reqData.accion === "enviarFactura") {
      // Sign the Facturae XML with XAdES-EPES
      console.log(`[${requestId}] Signing Facturae XML with XAdES-EPES...`);
      const signedFacturae = signFacturaeXAdES(reqData.xml_facturae!, cert);
      const signedB64 = Buffer.from(signedFacturae, "utf8").toString("base64");

      console.log(`[${requestId}] Signed XML size: ${signedFacturae.length} chars, base64: ${signedB64.length} chars`);

      soapBodyContent = buildFaceEnviarBody(signedB64, reqData.correo || "");

    } else if (reqData.accion === "anularFactura") {
      soapBodyContent = buildFaceAnularBody(
        reqData.numero_registro!,
        reqData.motivo || "Anulacion solicitada por el emisor",
      );

    } else if (reqData.accion === "consultarFactura") {
      soapBodyContent = buildFaceConsultarBody(reqData.numero_registro!);

    } else {
      return jsonResp({ error: `Accion no soportada: ${reqData.accion}` }, 400);
    }

    // ── 6. Wrap in WS-Security signed SOAP envelope ──
    console.log(`[${requestId}] Building WS-Security SOAP envelope...`);
    const signedSoap = buildWSSecuritySOAP(soapBodyContent, cert);
    console.log(`[${requestId}] SOAP envelope size: ${signedSoap.length} chars`);

    // ── 7. Send to FACe via mTLS ──
    console.log(`[${requestId}] Sending to ${endpoint} (SOAPAction: ${soapAction})`);

    let soapResp: { status: number; body: string; headers: Record<string, string> };
    try {
      soapResp = await httpsRequest(endpoint, signedSoap, cert.certPem, cert.keyPem, soapAction);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[${requestId}] mTLS request failed: ${msg}`);
      return jsonResp({
        ok: false,
        error: `Error de conexion con FACe: ${msg}`,
        endpoint,
        accion: reqData.accion,
        modo: reqData.modo,
        duration_ms: Date.now() - startTime,
      }, 502);
    }

    const duration = Date.now() - startTime;
    const isHttpOk = soapResp.status >= 200 && soapResp.status < 300;
    const isHtml = soapResp.body.includes("<!DOCTYPE html>") || soapResp.body.includes("<html");

    console.log(`[${requestId}] Response: HTTP ${soapResp.status}, ${soapResp.body.length} chars, ${duration}ms`);

    if (isHtml) {
      console.warn(`[${requestId}] FACe returned HTML instead of SOAP XML`);
    }

    // ── 8. Return response ──
    return jsonResp({
      ok: isHttpOk && !isHtml,
      status: soapResp.status,
      xml_respuesta: soapResp.body,
      endpoint,
      servicio: "face",
      accion: reqData.accion,
      modo: reqData.modo,
      version: "v1.0-p12",
      request_id: requestId,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      // Debug info (first 1500 chars of sent SOAP)
      debug_soap_enviado: signedSoap.substring(0, 1500),
      debug_soap_length: signedSoap.length,
    });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error(`[${requestId}] Unhandled error: ${errorMsg}`);
    if (errorStack) console.error(errorStack);

    return jsonResp({
      ok: false,
      error: errorMsg,
      stack: errorStack,
      version: "v1.0-p12",
      request_id: requestId,
      duration_ms: Date.now() - startTime,
    }, 500);
  }
});

// ─── JSON Response Helper ───

function jsonResp(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
