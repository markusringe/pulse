/**
 * Reine Hilfsfunktionen für SSL-Domains, Status und PEM-Ketten.
 * Keine I/O, damit Unit-Tests ohne Let's Encrypt und ohne Dateisystem laufen.
 */

/** Erneuerungsfenster: 30 Tage vor Ablauf (Let's-Encrypt-Zertifikate gelten 90 Tage). */
const RENEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Normalisiert eine Domain (ohne Schema, Pfad, Port) und prüft den Hostnamen.
 * Wildcards, IPs und localhost sind unzulässig (HTTP-01 kann sie nicht ausstellen).
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeDomain(raw) {
  let d = String(raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0] || "";
  d = d.replace(/:\d+$/, "");
  d = d.replace(/\.$/, "");
  if (!d || d.includes("*") || d.includes(" ")) return null;
  try {
    d = new URL("http://" + d).hostname;
  } catch {
    return null;
  }
  if (!d || d === "localhost" || d.endsWith(".local") || d.endsWith(".localhost")) return null;
  /* IPv4 und IPv6 ablehnen — Let's Encrypt stellt dafür kein HTTP-01-Zertifikat aus. */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return null;
  if (d.includes(":")) return null;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)) {
    return null;
  }
  return d;
}

/**
 * Einfache E-Mail-Prüfung für Let's-Encrypt-Konten (Ablauf-Hinweise).
 * @param {unknown} raw
 * @returns {boolean}
 */
function isValidEmail(raw) {
  const s = String(raw || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

/**
 * Leitet den Anzeige-Status aus Metadaten und Ablaufdatum ab.
 * @param {{ status?: string, expiresAt?: number }} row
 * @param {number} [now]
 * @returns {"pending"|"active"|"error"|"expired"}
 */
function deriveStatus(row, now = Date.now()) {
  const status = String(row?.status || "");
  if (status === "pending") return "pending";
  if (status === "error") return "error";
  const expiresAt = Number(row?.expiresAt) || 0;
  if (status === "expired" || (expiresAt > 0 && expiresAt <= now)) return "expired";
  if (status === "active") return "active";
  return status === "pending" ? "pending" : "error";
}

/**
 * Ob ein aktives/abgelaufenes Zertifikat im 30-Tage-Fenster erneuert werden soll.
 * @param {{ status?: string, expiresAt?: number, autoRenew?: boolean }} row
 * @param {number} [now]
 * @returns {boolean}
 */
function isDueForRenewal(row, now = Date.now()) {
  if (row?.autoRenew === false) return false;
  const status = deriveStatus(row, now);
  if (status !== "active" && status !== "expired") return false;
  const expiresAt = Number(row?.expiresAt) || 0;
  if (!expiresAt) return false;
  return expiresAt <= now + RENEW_WINDOW_MS;
}

/**
 * Teilt ein PEM mit Blatt + Zwischenzertifikaten.
 * @param {string} pem
 * @returns {{ cert: string, chain: string, fullchain: string }}
 */
function splitPemChain(pem) {
  const blocks = String(pem || "").match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  const cert = blocks[0] || "";
  const chain = blocks.slice(1).join("\n");
  const fullchain = blocks.join("\n");
  return { cert, chain, fullchain };
}

/**
 * Liest notAfter aus einem PEM-Zertifikat (Node X509Certificate).
 * @param {string|Buffer} certPem
 * @returns {number} Unix-ms oder 0
 */
function parseExpiryMs(certPem) {
  try {
    const { X509Certificate } = require("crypto");
    const x509 = new X509Certificate(certPem);
    const ms = Date.parse(x509.validTo);
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

module.exports = {
  RENEW_WINDOW_MS,
  normalizeDomain,
  isValidEmail,
  deriveStatus,
  isDueForRenewal,
  splitPemChain,
  parseExpiryMs,
};
