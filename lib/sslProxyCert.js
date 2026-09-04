/**
 * TLS-Zertifikat am Reverse-Proxy (nginx) aus PEM-Datei lesen — nur Metadaten, kein Private Key.
 * Typischer VPS-Betrieb: nginx terminiert HTTPS (deploy/certs/), Pulse läuft dahinter auf HTTP.
 */

const fs = require("fs");
const { X509Certificate } = require("crypto");

/** Standard-Mount im Docker-Compose (./deploy/certs → /proxy-certs). */
const DEFAULT_PROXY_CERT = "/proxy-certs/fullchain.pem";

/**
 * Pfad zur fullchain.pem des Reverse-Proxy (Env PROXY_SSL_CERT oder Default).
 * @returns {string}
 */
function proxyCertPath() {
  const fromEnv = String(process.env.PROXY_SSL_CERT || "").trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_PROXY_CERT;
}

/**
 * Primäre Domain aus Subject Alternative Name oder Common Name.
 * @param {import("crypto").X509Certificate} cert
 * @returns {string|null}
 */
function primaryDomainFromCert(cert) {
  const san = String(cert.subjectAltName || "");
  if (san) {
    for (const part of san.split(",")) {
      const p = part.trim();
      if (p.startsWith("DNS:")) {
        const host = p.slice(4).trim().toLowerCase();
        if (host && !host.startsWith("*.")) return host;
      }
    }
  }
  const cn = String(cert.subject || "").match(/CN\s*=\s*([^,\n/]+)/i);
  return cn ? cn[1].trim().toLowerCase() : null;
}

/** Aussteller kurz lesbar (Let's Encrypt o. Ä.). */
function formatIssuer(cert) {
  return String(cert.issuer || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Metadaten aus der nginx-fullchain.pem — null wenn Pfad fehlt oder PEM ungültig.
 * @returns {{ domain: string, issuedAt: number, expiresAt: number, issuer: string, source: "nginx" } | null}
 */
function readProxyCertificate() {
  const filePath = proxyCertPath();
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const pem = fs.readFileSync(filePath, "utf8");
    const cert = new X509Certificate(pem);
    const domain = primaryDomainFromCert(cert);
    if (!domain) return null;
    const expiresAt = Date.parse(cert.validTo);
    const issuedAt = Date.parse(cert.validFrom);
    if (!Number.isFinite(expiresAt)) return null;
    return {
      domain,
      issuedAt: Number.isFinite(issuedAt) ? issuedAt : 0,
      expiresAt,
      issuer: formatIssuer(cert),
      source: "nginx",
    };
  } catch {
    return null;
  }
}

module.exports = {
  proxyCertPath,
  readProxyCertificate,
  primaryDomainFromCert,
};
