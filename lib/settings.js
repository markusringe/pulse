/**
 * Instanz-Einstellungen als JSON-Bundle (Export / Import).
 *
 * Enthalten: Branding (inkl. Logo-Data-URL), Privacy, SSL-Metadaten UND PEM-Dateien
 * (privkey/cert/chain/fullchain je Domain, optional ACME-account.pem).
 * Bewusst nicht enthalten: Sessions, Umfrage-Antworten, Audit-Logs, ADMIN_SECRET, .env.
 *
 * Die Backup-Datei enthält private Schlüssel — nur über die Admin-API, wie ein Secret behandeln.
 *
 * Reine Funktionen — Tests mocken die Stores, ohne data/ anzufassen.
 */

const { SAARBRUECKEN, sanitizeRecord } = require("./branding");
const { DEFAULTS: PRIVACY_DEFAULTS, versionSnapshot, MAX_VERSIONS } = require("./privacy");

/** Aktuelles Bundle-Schema. Import akzeptiert 1 (ohne PEM) und 2 (mit Grafiken/PEMs). */
const SCHEMA_VERSION = 2;
const ACCEPTED_SCHEMA = [1, 2];

/** Dateiname für den Browser-Download (Content-Disposition). */
const EXPORT_FILENAME = "pulse-settings.json";

/**
 * Logo-Data-URL plus mehrere PEM-Dateien (Let's Encrypt Blatt+Chain+Key).
 * White-Label-Assets (Schrift/BG/Sound) plus PEMs: 4 MiB.
 */
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
const MAX_LOGO_CHARS = 256 * 1024;
const MAX_PEM_CHARS = 32 * 1024;

const SSL_SKIP_MESSAGE =
  "Keine Zertifikatsdateien in dieser Sicherung — bestehende PEMs auf dem Server bleiben unverändert.";
const SSL_IMPORT_MESSAGE =
  "Zertifikate und Logo aus der Sicherung übernommen. HTTPS wurde ohne Prozessneustart neu geladen.";

/**
 * Nur diese SSL-Felder dürfen ins Bundle. Kein Spread der Store-Zeile,
 * damit lose Key-Felder der Store-Zeile nicht per Spread mitkopiert werden. PEMs nur unter files.
 */
const SSL_META_KEYS = [
  "domain",
  "email",
  "status",
  "error",
  "issuedAt",
  "expiresAt",
  "autoRenew",
  "staging",
];

/**
 * Obere Ebene der Store-Zeile: Keys nicht per Spread übernehmen.
 * Erlaubt sind nur SSL_META_KEYS plus das bewusst gefüllte Objekt `files`.
 */
const FORBIDDEN_KEY_RE =
  /^(privatekey|private_key|accountkey|accountpem|account_pem|certpem|chainpem|keypem|certificate|pem)$/i;

const FORBIDDEN_KEY_SUBSTR = ["private key"];

/** Erlaubte PEM-Felder unter ssl.certificates[].files */
const SSL_FILE_KEYS = ["privkey", "cert", "chain", "fullchain"];

const PEM_MARKER_RE =
  /-----BEGIN[^-]*(PRIVATE KEY|CERTIFICATE|RSA PRIVATE KEY|EC PRIVATE KEY|OPENSSH PRIVATE KEY)-----/i;

/**
 * Entfernt Request- und Secret-Felder aus einem Objekt (flach).
 * @param {object} src
 * @returns {object}
 */
function stripRequestFields(src) {
  const next = { ...(src && typeof src === "object" ? src : {}) };
  delete next.allowLocal;
  delete next.secret;
  delete next.adminKey;
  delete next.__proto__;
  delete next.constructor;
  return next;
}

/**
 * Darf dieser Objekt-Schlüssel ins Bundle?
 * @param {string} key
 * @returns {boolean}
 */
function isForbiddenKey(key) {
  const k = String(key || "");
  if (FORBIDDEN_KEY_RE.test(k.replace(/[\s_-]/g, ""))) return true;
  const lower = k.toLowerCase();
  return FORBIDDEN_KEY_SUBSTR.some((s) => lower.includes(s));
}

/**
 * Nur data:-Bilder; javascript: und zu große Payloads werden verworfen.
 * Entspricht dem Branding-Limit für Logo-Data-URLs.
 * @param {*} raw
 * @returns {{ logo: string, error?: string }}
 */
function sanitizeLogo(raw) {
  const s = String(raw || "");
  if (!s) return { logo: "" };
  if (s.length > MAX_LOGO_CHARS) {
    return { logo: "", error: "Logo-Data-URL ist zu groß (Limit wie beim Branding)." };
  }
  if (PEM_MARKER_RE.test(s)) return { logo: "" };
  /* Nur gängige Bild-Data-URLs, kein SVG mit eingebettetem Script-URL. */
  if (!/^data:image\/(png|jpe?g|svg\+xml|webp)(;base64)?,/i.test(s)) {
    return { logo: "" };
  }
  return { logo: s };
}

/**
 * Bekannte Branding-Felder übernehmen, social[] verwerfen, URLs säubern.
 * @param {object} src
 * @returns {{ branding: object, error?: string }}
 */
function sanitizeBranding(src) {
  const raw = stripRequestFields(src);
  delete raw.social;
  for (const key of Object.keys(raw)) {
    if (isForbiddenKey(key)) delete raw[key];
  }
  /* Gleiche Whitelist und Data-URL-Limits wie branding.save (White-Label inkl.). */
  const result = sanitizeRecord(raw, { base: SAARBRUECKEN });
  delete result.branding.social;
  delete result.branding.allowLocal;
  return result;
}

/**
 * Privacy-Adminfelder; HTML-Render-Keys und Secrets fliegen raus.
 * @param {object} src
 * @returns {object}
 */
function sanitizePrivacyRecord(src) {
  const raw = stripRequestFields(src);
  const next = { ...PRIVACY_DEFAULTS };
  for (const key of Object.keys(PRIVACY_DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    if (key === "version") {
      const n = Number(raw.version);
      if (n > 0) next.version = n;
      continue;
    }
    if (key === "supervisoryWebsite") {
      const url = String(raw[key] || "").trim();
      next[key] = /^https?:\/\//i.test(url) ? url : PRIVACY_DEFAULTS.supervisoryWebsite;
      continue;
    }
    next[key] = raw[key] == null ? "" : String(raw[key]);
  }
  if (raw.savedAt) next.savedAt = String(raw.savedAt).slice(0, 40);
  return next;
}

/**
 * Versionshistorie: nur die Snapshot-Felder, gekürzt auf MAX_VERSIONS.
 * @param {*} list
 * @returns {object[]}
 */
function sanitizePrivacyVersions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((v) => v && typeof v === "object")
    .map((v) => versionSnapshot(v))
    .slice(-MAX_VERSIONS);
}

/**
 * PEM-Block säubern: nur Key- oder Zertifikats-PEM, harte Längengrenze, kein Binär-Null.
 * @param {*} raw
 * @param {"key"|"cert"} kind
 * @returns {string}
 */
function sanitizePemBlock(raw, kind) {
  const s = String(raw || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!s || s.length > MAX_PEM_CHARS) return "";
  if (s.includes("\0")) return "";
  if (kind === "key") {
    if (!/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(s)) return "";
    if (!/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(s)) return "";
  } else {
    if (!/-----BEGIN CERTIFICATE-----/.test(s)) return "";
    if (!/-----END CERTIFICATE-----/.test(s)) return "";
  }
  return s.endsWith("\n") ? s : `${s}\n`;
}

/**
 * Nur die vier bekannten Dateinamen, Inhalte als PEM.
 * @param {object} files
 * @returns {object}
 */
function sanitizeSslFiles(files) {
  const src = files && typeof files === "object" ? files : {};
  const out = {};
  for (const key of SSL_FILE_KEYS) {
    const kind = key === "privkey" ? "key" : "cert";
    const pem = sanitizePemBlock(src[key] ?? src[`${key}.pem`], kind);
    if (pem) out[key] = pem;
  }
  return out;
}

/**
 * SSL-Zeile auf Metadaten reduzieren. Niemals Keys aus der Quelle spreaden.
 * @param {object} row
 * @returns {object|null}
 */
function sslMetaFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  for (const key of SSL_META_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const val = row[key];
    /* PEM nur in files[], nicht in Meta-Feldern. */
    if (typeof val === "string" && PEM_MARKER_RE.test(val) && key !== "error") continue;
    if (key === "autoRenew" || key === "staging") {
      out[key] = Boolean(val);
      continue;
    }
    if (key === "issuedAt" || key === "expiresAt") {
      out[key] = Number(val) || 0;
      continue;
    }
    out[key] = val == null ? "" : String(val);
  }
  if (!out.domain) return null;
  if (out.autoRenew == null) out.autoRenew = true;
  if (out.staging == null) out.staging = false;
  return out;
}

/**
 * Metadaten plus PEM-Dateien für ein Zertifikat (Backup).
 * @param {object} row
 * @returns {object|null}
 */
function sslCertFromBackupRow(row) {
  const meta = sslMetaFromRow(row);
  if (!meta) return null;
  const files = sanitizeSslFiles(row.files);
  return { ...meta, files };
}

function hasSslFilePayload(entry) {
  const files = entry && entry.files;
  if (!files || typeof files !== "object") return false;
  return Boolean(files.privkey && (files.cert || files.fullchain));
}

/**
 * Baut das Download-Objekt inkl. Logo und PEM-Dateien.
 *
 * @param {{
 *   branding?: object,
 *   privacy?: object,
 *   privacyVersions?: object[],
 *   sslCertificates?: object[],
 *   sslAccountPem?: string,
 *   app?: object,
 *   exportedAt?: string,
 * }} input
 * @returns {object}
 */
function buildExportBundle(input = {}) {
  const brandingResult = sanitizeBranding(input.branding || {});
  const privacySrc = input.privacy && typeof input.privacy === "object" ? input.privacy : {};
  const versionsIn = Array.isArray(input.privacyVersions)
    ? input.privacyVersions
    : Array.isArray(privacySrc.versions)
      ? privacySrc.versions
      : [];
  const privacy = sanitizePrivacyRecord(privacySrc);
  const versions = sanitizePrivacyVersions(versionsIn);
  const sslList = Array.isArray(input.sslCertificates) ? input.sslCertificates : [];
  const certificates = sslList.map(sslCertFromBackupRow).filter(Boolean);
  const accountPem = sanitizePemBlock(input.sslAccountPem, "key");
  const app = {
    name: "Pulse",
    version: String((input.app && input.app.version) || "1.0.0"),
  };
  if (input.app && input.app.name) app.name = String(input.app.name).slice(0, 80);

  const fileCount = certificates.filter(hasSslFilePayload).length;
  const bundle = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: input.exportedAt || new Date().toISOString(),
    app,
    branding: brandingResult.branding,
    privacy: { ...privacy, versions },
    ssl: {
      accountPem,
      certificates,
      note:
        fileCount || accountPem
          ? "Enthält private Schlüssel und Zertifikate (PEM) sowie das Logo im Branding. Datei wie ein Secret aufbewahren."
          : "Keine PEM-Dateien auf dem Server gefunden — nur SSL-Metadaten.",
    },
  };
  return bundle;
}

/**
 * Fehlerobjekt für die API (status + Meldung auf Deutsch).
 * @param {number} status
 * @param {string} error
 * @param {string} [code]
 */
function fail(status, error, code) {
  return { ok: false, status, error, code };
}

/**
 * Nimmt ein geparstes Objekt oder JSON-String und prüft Schema + Inhalt.
 * Führt keine Speicherung aus.
 *
 * @param {object|string} raw
 * @returns {{ ok: true, branding?: object, privacy?: object, privacyVersions?: object[], sslCertificates: object[] } | { ok: false, status: number, error: string, code?: string }}
 */
function parseImportBundle(raw) {
  let src = raw;
  if (typeof src === "string") {
    try {
      src = JSON.parse(src);
    } catch {
      return fail(400, "Ungültiges JSON. Die Datei ist beschädigt oder kein Einstellungs-Export.", "json");
    }
  }
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    return fail(400, "Ungültiges JSON. Es wird ein Einstellungs-Objekt erwartet.", "json");
  }
  /* Wrapper aus POST-Body: { bundle } oder das Bundle selbst plus allowLocal. */
  if (src.bundle && typeof src.bundle === "object") src = src.bundle;
  src = stripRequestFields(src);

  let serialized = "";
  try {
    serialized = JSON.stringify(src);
  } catch {
    return fail(400, "Ungültiges JSON.", "json");
  }
  if (serialized.length > MAX_BUNDLE_BYTES) {
    return fail(413, "Datei zu groß. Logo und JSON zusammen dürfen das Limit nicht überschreiten.", "size");
  }

  const ver = Number(src.schemaVersion);
  if (!Number.isFinite(ver) || !ACCEPTED_SCHEMA.includes(ver)) {
    return fail(
      400,
      `Falsche schemaVersion (erwartet ${ACCEPTED_SCHEMA.join(" oder ")}, erhalten ${src.schemaVersion == null ? "keine" : src.schemaVersion}).`,
      "schema"
    );
  }

  const brandingSrc = src.branding && typeof src.branding === "object" ? src.branding : null;
  let privacySrc = src.privacy && typeof src.privacy === "object" ? src.privacy : null;
  let versionsList = null;
  if (privacySrc) {
    if (Array.isArray(privacySrc.versions)) versionsList = privacySrc.versions;
    if (privacySrc.record && typeof privacySrc.record === "object") {
      if (Array.isArray(privacySrc.record.versions) && !versionsList) {
        versionsList = privacySrc.record.versions;
      }
      privacySrc = privacySrc.record;
    }
  }

  const sslSrc = src.ssl;
  const sslList = Array.isArray(sslSrc)
    ? sslSrc
    : sslSrc && Array.isArray(sslSrc.certificates)
      ? sslSrc.certificates
      : [];
  const sslCertificates = sslList.map(sslCertFromBackupRow).filter(Boolean);
  const sslAccountPem = sanitizePemBlock(
    sslSrc && !Array.isArray(sslSrc) ? sslSrc.accountPem : "",
    "key"
  );
  const hasSslAssets = Boolean(sslAccountPem) || sslCertificates.some(hasSslFilePayload);

  if (!brandingSrc && !privacySrc && !hasSslAssets) {
    return fail(400, "Keine Branding-, Privacy- oder Zertifikatsdaten in der Datei.", "empty");
  }

  const out = { ok: true, sslCertificates, sslAccountPem, hasSslAssets };

  if (brandingSrc) {
    const br = sanitizeBranding(brandingSrc);
    if (br.error) return fail(400, br.error, "logo");
    out.branding = br.branding;
  }
  if (privacySrc) {
    out.privacy = sanitizePrivacyRecord(privacySrc);
    out.privacyVersions = versionsList ? sanitizePrivacyVersions(versionsList) : null;
  }

  return out;
}

/**
 * Wendet ein geprüftes Bundle an. Logo über Branding, PEMs über saveSsl.
 *
 * @param {object|string} raw  Bundle oder POST-Body
 * @param {{ saveBranding?: Function, savePrivacy?: Function, saveSsl?: Function }} deps
 * @returns {object}
 */
function applyImportBundle(raw, deps = {}) {
  const parsed = parseImportBundle(raw);
  if (!parsed.ok) return parsed;

  const replaced = [];
  let branding = null;
  let privacyResult = null;
  let sslResult = null;

  if (parsed.branding && typeof deps.saveBranding === "function") {
    branding = deps.saveBranding(parsed.branding);
    replaced.push("branding");
    if (parsed.branding.logo) replaced.push("logo");
  }
  if (parsed.privacy && typeof deps.savePrivacy === "function") {
    privacyResult = deps.savePrivacy(parsed.privacy, parsed.privacyVersions);
    replaced.push("privacy");
  }

  const sslPayload = {
    accountPem: parsed.sslAccountPem || "",
    certificates: parsed.sslCertificates || [],
  };
  if (parsed.hasSslAssets && typeof deps.saveSsl === "function") {
    sslResult = deps.saveSsl(sslPayload) || {};
    replaced.push("ssl");
  }

  const sslImported = Boolean(parsed.hasSslAssets && sslResult);
  return {
    ok: true,
    replaced,
    branding,
    privacy: privacyResult && privacyResult.record ? privacyResult.record : privacyResult,
    versions: privacyResult && privacyResult.versions ? privacyResult.versions : undefined,
    ssl: {
      imported: sslImported,
      skipped: !sslImported,
      inBundle: (parsed.sslCertificates || []).length,
      files: (parsed.sslCertificates || []).filter(hasSslFilePayload).length,
      restored: sslResult && sslResult.restored ? sslResult.restored : [],
      account: Boolean(sslResult && sslResult.account),
      hasLogo: Boolean(parsed.branding && parsed.branding.logo),
      message: sslImported ? SSL_IMPORT_MESSAGE : SSL_SKIP_MESSAGE,
    },
  };
}

/**
 * Serialisiert das Bundle hübsch für den Download.
 * @param {object} bundle
 * @returns {string}
 */
function serializeBundle(bundle) {
  return JSON.stringify(bundle, null, 2);
}

module.exports = {
  SCHEMA_VERSION,
  ACCEPTED_SCHEMA,
  EXPORT_FILENAME,
  MAX_BUNDLE_BYTES,
  MAX_LOGO_CHARS,
  MAX_PEM_CHARS,
  SSL_META_KEYS,
  SSL_FILE_KEYS,
  SSL_SKIP_MESSAGE,
  SSL_IMPORT_MESSAGE,
  sanitizeLogo,
  sanitizeBranding,
  sanitizePrivacyRecord,
  sanitizePemBlock,
  sanitizeSslFiles,
  sslMetaFromRow,
  sslCertFromBackupRow,
  hasSslFilePayload,
  buildExportBundle,
  parseImportBundle,
  applyImportBundle,
  serializeBundle,
};
