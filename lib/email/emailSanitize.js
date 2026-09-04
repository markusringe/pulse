/**
 * E-Mail-Sicherheit: Header-Injection, Adressformat, Freemail-Absender sperren.
 */

const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.de",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "t-online.de",
  "mail.ru",
  "proton.me",
  "protonmail.com",
]);

/** CR/LF in Header-Werten verbieten (Injection). */
function assertSafeHeaderValue(value, label = "Header") {
  const s = String(value ?? "");
  if (/[\r\n]/.test(s)) {
    throw new Error(`${label} enthält ungültige Zeichen`);
  }
  return s.trim();
}

/**
 * E-Mail-Adresse normalisieren und prüfen.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  const s = assertSafeHeaderValue(email, "E-Mail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw new Error("Ungültige E-Mail-Adresse");
  }
  return s;
}

/**
 * Absender-Domain muss verifizierte Mailgun-Domain sein — keine Freemail.
 * @param {string} fromEmail
 * @param {string} verifiedDomain
 */
function assertFromDomainAllowed(fromEmail, verifiedDomain) {
  const email = normalizeEmail(fromEmail);
  const domain = email.split("@")[1];
  if (FREEMAIL_DOMAINS.has(domain)) {
    throw new Error("Freemail-Domains dürfen nicht als Absender verwendet werden");
  }
  const expected = String(verifiedDomain || "").toLowerCase().trim();
  if (expected && domain !== expected) {
    throw new Error(`Absender-Domain muss ${expected} sein (Mailgun-verifiziert)`);
  }
  return email;
}

/**
 * Öffentliche Basis-URL für Links — nur konfigurierte Domain.
 * @returns {string}
 */
function getPublicBaseUrl() {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || process.env.DOMAIN || "").trim();
  if (fromEnv) {
    const u = fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
    return u.replace(/\/$/, "");
  }
  return "";
}

module.exports = {
  FREEMAIL_DOMAINS,
  assertSafeHeaderValue,
  normalizeEmail,
  assertFromDomainAllowed,
  getPublicBaseUrl,
};
