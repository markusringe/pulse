#!/usr/bin/env node
/**
 * Instanz-Einstellungen: Roundtrip inkl. Logo und PEM-Dateien.
 * Lose Key-Felder auf der SSL-Zeile bleiben draußen; files.privkey gehört ins Backup.
 * Kein HTTP-Server, kein Schreiben nach data/.
 */
const fs = require("fs");
const path = require("path");
const {
  SCHEMA_VERSION,
  EXPORT_FILENAME,
  SSL_META_KEYS,
  SSL_SKIP_MESSAGE,
  SSL_IMPORT_MESSAGE,
  buildExportBundle,
  parseImportBundle,
  applyImportBundle,
  serializeBundle,
  sslMetaFromRow,
  sanitizeBranding,
  hasSslFilePayload,
} = require("../lib/settings");
const { sanitizeHomepageUrl } = require("../lib/branding");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Typische PEM-Stubs — nur für Unit-Tests, kein echtes Schlüsselmaterial. */
const SAMPLE_KEY = "-----BEGIN PRIVATE KEY-----\nMIGHBACKUPKEY\n-----END PRIVATE KEY-----\n";
const SAMPLE_CERT = "-----BEGIN CERTIFICATE-----\nBACKUPCERT\n-----END CERTIFICATE-----\n";
const SAMPLE_CHAIN = "-----BEGIN CERTIFICATE-----\nBACKUPCHAIN\n-----END CERTIFICATE-----\n";
const SAMPLE_ACCOUNT = "-----BEGIN PRIVATE KEY-----\nMIGHACCOUNTKEY\n-----END PRIVATE KEY-----\n";

const poisonedSsl = {
  domain: "pulse.example.de",
  email: "it@example.de",
  status: "active",
  error: "",
  issuedAt: 1_700_000_000_000,
  expiresAt: 1_700_777_000_000,
  autoRenew: true,
  staging: false,
  /* Darf nicht als Top-Level-Feld im Export landen */
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIGHSECRETKEYMATERIAL\n-----END PRIVATE KEY-----",
  "privkey.pem": "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
  accountPem: "-----BEGIN RSA PRIVATE KEY-----\naccount\n-----END RSA PRIVATE KEY-----",
  certPem: "-----BEGIN CERTIFICATE-----\nCERTDATA\n-----END CERTIFICATE-----",
  fullchain: "-----BEGIN CERTIFICATE-----\nCHAIN\n-----END CERTIFICATE-----",
  pem: "-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----",
};

const brandingIn = {
  primary: "#007CC1",
  secondary: "#F99700",
  bg: "#ffffff",
  text: "#1A171B",
  logo: "data:image/png;base64,AAA",
  footerText: "© Test",
  impressumUrl: "#/impressum",
  privacyUrl: "#/privacy",
  privacyExtra: "Zusatz",
  languages: ["de", "en"],
  retentionDays: 7,
  homepageUrl: "https://www.saarbruecken.de",
  wordFilter: true,
  extraWords: ["xyz"],
  questionIntervalSec: 45,
  ipBlock: false,
  social: [{ network: "mastodon", url: "https://example.org" }],
  allowLocal: true,
  adminKey: "should-not-export",
};

const privacyIn = {
  controllerName: "Musterkommune",
  dsbName: "DSB Test",
  standDate: "2026-09-02",
  version: 3,
  extraText: "Hinweis",
  adminKey: "secret-privacy",
};

const versionsIn = [{ version: 2, standDate: "2026-08-01", controllerName: "Alt", extraText: "lang" }];

const exportedMeta = buildExportBundle({
  branding: brandingIn,
  privacy: privacyIn,
  privacyVersions: versionsIn,
  sslCertificates: [poisonedSsl],
  app: { name: "Pulse", version: "1.0.0" },
  exportedAt: "2026-09-02T09:00:00.000Z",
});

assert(exportedMeta.schemaVersion === SCHEMA_VERSION, "schemaVersion 2");
assert(exportedMeta.exportedAt === "2026-09-02T09:00:00.000Z", "exportedAt");
assert(exportedMeta.branding.logo === "data:image/png;base64,AAA", "Logo im Export");
assert(!Object.prototype.hasOwnProperty.call(exportedMeta.branding, "social"), "kein social");
assert(exportedMeta.ssl.certificates.length === 1, "ein SSL-Satz");
assert(!hasSslFilePayload(exportedMeta.ssl.certificates[0]), "ohne files keine PEMs");
assert(exportedMeta.ssl.certificates[0].privateKey == null, "kein Top-Level privateKey");
assert(exportedMeta.ssl.accountPem === "", "kein Account ohne Input");

const dumpMeta = serializeBundle(exportedMeta);
assert(!dumpMeta.includes("MIGHSECRETKEYMATERIAL"), "vergifteter Key nicht im JSON");
assert(!dumpMeta.includes("should-not-export"), "kein Branding-adminKey");
assert(!dumpMeta.includes("secret-privacy"), "kein Privacy-adminKey");
assert(dumpMeta.includes("data:image/png;base64,AAA"), "Logo-Data-URL im JSON");

const meta = sslMetaFromRow(poisonedSsl);
assert(meta.privateKey == null && meta["privkey.pem"] == null, "sslMetaFromRow ohne Keys");

const roundMeta = parseImportBundle(JSON.parse(dumpMeta));
assert(roundMeta.ok, "Roundtrip Meta parse");
assert(roundMeta.branding.logo === "data:image/png;base64,AAA", "Roundtrip Logo");
assert(roundMeta.hasSslAssets === false, "ohne PEM-Dateien kein SSL-Restore");

/* Vollexport mit Grafik + Zertifikatsdateien + ACME-Konto. */
const withFiles = {
  ...poisonedSsl,
  files: {
    privkey: SAMPLE_KEY,
    cert: SAMPLE_CERT,
    chain: SAMPLE_CHAIN,
    fullchain: SAMPLE_CERT + SAMPLE_CHAIN,
  },
};
const exportedFull = buildExportBundle({
  branding: brandingIn,
  privacy: privacyIn,
  sslCertificates: [withFiles],
  sslAccountPem: SAMPLE_ACCOUNT,
  exportedAt: "2026-09-02T10:00:00.000Z",
});
assert(exportedFull.ssl.certificates[0].files.privkey.includes("MIGHBACKUPKEY"), "privkey im files-Objekt");
assert(exportedFull.ssl.certificates[0].files.cert.includes("BACKUPCERT"), "cert im files-Objekt");
assert(exportedFull.ssl.accountPem.includes("MIGHACCOUNTKEY"), "account.pem Inhalt");
assert(exportedFull.ssl.certificates[0].privateKey == null, "Top-Level-Poison bleibt draußen");
assert(hasSslFilePayload(exportedFull.ssl.certificates[0]), "hasSslFilePayload");

const dumpFull = serializeBundle(exportedFull);
assert(dumpFull.includes("BEGIN PRIVATE KEY"), "PEM-Key im Backup-JSON");
assert(dumpFull.includes("BEGIN CERTIFICATE"), "Zertifikat-PEM im Backup-JSON");
assert(dumpFull.includes("MIGHBACKUPKEY"), "Backup-Key-Inhalt");
assert(!dumpFull.includes("MIGHSECRETKEYMATERIAL"), "Poison-Key weiterhin draußen");

const roundFull = parseImportBundle(JSON.parse(dumpFull));
assert(roundFull.ok && roundFull.hasSslAssets, "Roundtrip mit PEMs");
assert(roundFull.sslAccountPem.includes("MIGHACCOUNTKEY"), "Account-Key roundtrip");
assert(roundFull.sslCertificates[0].files.privkey.includes("MIGHBACKUPKEY"), "privkey roundtrip");

let savedBranding = null;
let savedSsl = null;
let sslCalls = 0;
const appliedSkip = applyImportBundle(JSON.parse(dumpMeta), {
  saveBranding: (b) => {
    savedBranding = b;
    return b;
  },
  savePrivacy: (p, vers) => ({ record: p, versions: vers }),
  saveSsl: (payload) => {
    sslCalls += 1;
    savedSsl = payload;
    return { restored: ["x"], account: true };
  },
});
assert(appliedSkip.ok, "apply Meta ok");
assert(appliedSkip.replaced.includes("branding") && appliedSkip.replaced.includes("logo"), "Logo-Bereich");
assert(appliedSkip.ssl.imported === false && appliedSkip.ssl.skipped === true, "SSL ohne Dateien übersprungen");
assert(appliedSkip.ssl.message === SSL_SKIP_MESSAGE, "Skip-Hinweis");
assert(sslCalls === 0, "saveSsl nicht ohne PEM-Dateien");
assert(savedBranding.logo === "data:image/png;base64,AAA", "Logo gespeichert");

const appliedFull = applyImportBundle(JSON.parse(dumpFull), {
  saveBranding: (b) => b,
  savePrivacy: (p, vers) => ({ record: p, versions: vers }),
  saveSsl: (payload) => {
    sslCalls += 1;
    savedSsl = payload;
    return { restored: payload.certificates.map((c) => c.domain), account: Boolean(payload.accountPem) };
  },
});
assert(appliedFull.ok && appliedFull.ssl.imported === true, "SSL importiert");
assert(appliedFull.replaced.includes("ssl"), "ssl in replaced");
assert(appliedFull.ssl.message === SSL_IMPORT_MESSAGE, "Import-Hinweis");
assert(sslCalls === 1, "saveSsl genau einmal");
assert(savedSsl.accountPem.includes("MIGHACCOUNTKEY"), "saveSsl bekommt accountPem");
assert(savedSsl.certificates[0].files.privkey.includes("MIGHBACKUPKEY"), "saveSsl bekommt privkey");

assert(sanitizeHomepageUrl("javascript:alert(1)") === "", "sanitizeHomepageUrl js");
const evilHome = sanitizeBranding({ homepageUrl: "javascript:alert(1)", social: ["x"] });
assert(evilHome.branding.homepageUrl === "", "Import verwirft javascript: homepageUrl");

const badSchema = parseImportBundle({ schemaVersion: 99, branding: { primary: "#000" } });
assert(!badSchema.ok && badSchema.code === "schema", "falsche schemaVersion");

const v1 = parseImportBundle({ schemaVersion: 1, branding: { homepageUrl: "https://example.org", primary: "#111111" } });
assert(v1.ok && v1.branding.homepageUrl === "https://example.org", "schema 1 weiterhin gültig");

const badJson = parseImportBundle("{nein");
assert(!badJson.ok && badJson.code === "json", "kaputtes JSON");

const empty = parseImportBundle({ schemaVersion: 1 });
assert(!empty.ok && empty.code === "empty", "leeres Bundle");

const onlyBrand = applyImportBundle(
  { schemaVersion: 1, branding: { homepageUrl: "https://example.org", primary: "#111111" } },
  {
    saveBranding: (b) => b,
    savePrivacy: () => {
      throw new Error("Privacy darf nicht gespeichert werden");
    },
  }
);
assert(onlyBrand.ok && onlyBrand.replaced.join() === "branding", "nur Branding ohne Logo-Feld");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
assert(html.includes('id="settings-panel"'), "Settings-Block im HTML");
assert(html.includes('id="settings-export"'), "Export-Button");

const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
assert(server.includes("collectBackup") && server.includes("restoreFromBackup"), "SSL-Backup in server.js");

const front = fs.readFileSync(path.join(root, "frontend/js/settings.js"), "utf8");
assert(front.includes("settings.preview.logoYes") || front.includes("preview.logoYes"), "Logo-Vorschau");
assert(front.includes("sslRestore") || front.includes("sslImported"), "SSL-Restore-UI");

for (const code of ["de", "en", "fr"]) {
  const dict = JSON.parse(fs.readFileSync(path.join(root, "frontend/i18n", `${code}.json`), "utf8"));
  for (const key of [
    "settings.nav",
    "settings.export",
    "settings.import",
    "settings.confirm",
    "settings.error.json",
    "settings.error.schema",
    "settings.preview.logoYes",
    "settings.preview.sslRestore",
    "settings.sslImported",
    "settings.preview.secret",
  ]) {
    assert(dict[key], `${code}: ${key}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert(String(pkg.scripts.test || "").includes("test-settings"), "npm test enthält test-settings");
assert(EXPORT_FILENAME.includes("settings.json"), "Dateiname");
for (const key of SSL_META_KEYS) {
  assert(Object.prototype.hasOwnProperty.call(exportedMeta.ssl.certificates[0], key) || key === "error", `Meta ${key}`);
}

console.log("Settings-Tests OK");
