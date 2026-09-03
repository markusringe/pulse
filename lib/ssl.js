/**
 * Let's-Encrypt-ACME (HTTP-01) plus HTTPS-Server mit Zertifikat-Reload ohne Prozessneustart.
 *
 * Dateien unter SSL_DIR/<domain>/ (Standard: data/ssl/<domain>/):
 *   privkey.pem, cert.pem, chain.pem, fullchain.pem
 * Kontoschlüssel: SSL_DIR/account.pem — niemals über die API ausliefern.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const tls = require("tls");
const store = require("./sslStore");
const util = require("./sslUtil");
const audit = require("./auditLogger");

/** HTTP-01-Token → Key-Authorization (nur im Speicher, kurzlebig). */
const challenges = new Map();
/** Domain → laufender ACME-Job, verhindert Doppel-Bestellungen. */
const jobs = new Map();

/** @type {import("https").Server | null} */
let httpsServer = null;
/** @type {((req: import("http").IncomingMessage, res: import("http").ServerResponse) => void) | null} */
let requestHandler = null;
/** @type {((req: import("http").IncomingMessage, socket: import("net").Socket) => void) | null} */
let upgradeHandler = null;
/** @type {import("tls").SecureContext | null} */
let defaultContext = null;
/** SNI: Hostname → SecureContext */
const sniContexts = new Map();

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return !/^(0|false|off|no|disabled)$/i.test(String(raw).trim());
}

/** Wurzelverzeichnis für PEM-Dateien. Produktiv z. B. SSL_DIR=/ssl */
function sslDir() {
  return process.env.SSL_DIR || path.join(process.cwd(), "data", "ssl");
}

function domainDir(domain) {
  return path.join(sslDir(), domain);
}

function httpsPort() {
  if (process.env.HTTPS_PORT) return Number(process.env.HTTPS_PORT);
  return process.env.NODE_ENV === "production" ? 443 : 3443;
}

function httpPort() {
  return Number(process.env.PORT) || 3000;
}

function loadAcme() {
  try {
    return require("acme-client");
  } catch {
    return null;
  }
}

function acmeReady() {
  return Boolean(loadAcme());
}

function useStaging(explicit) {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return envBool("LETSENCRYPT_STAGING", false);
}

/**
 * Öffentliche Metadaten ohne Schlüsselmaterial.
 * @param {object} row
 */
function publicRow(row) {
  if (!row) return null;
  const status = util.deriveStatus(row);
  const dir = domainDir(row.domain);
  const filesPresent = fs.existsSync(path.join(dir, "privkey.pem")) && fs.existsSync(path.join(dir, "cert.pem"));
  return {
    domain: row.domain,
    email: row.email,
    status,
    error: row.error || "",
    issuedAt: row.issuedAt || 0,
    expiresAt: row.expiresAt || 0,
    autoRenew: row.autoRenew !== false,
    staging: Boolean(row.staging),
    filesPresent,
  };
}

function listCertificates() {
  return store.list().map((row) => {
    const status = util.deriveStatus(row);
    /* Abgelaufene Einträge in der Tabelle nachziehen, damit die UI nicht „Aktiv“ zeigt. */
    if (status === "expired" && row.status !== "expired") {
      store.upsert({ domain: row.domain, status: "expired" });
    }
    return publicRow({ ...row, status });
  });
}

function httpsInfo() {
  return {
    listening: Boolean(httpsServer && httpsServer.listening),
    port: httpsPort(),
    httpPort: httpPort(),
    sslDir: sslDir(),
    acmeReady: acmeReady(),
    stagingDefault: useStaging(),
    redirect: envBool("SSL_REDIRECT", true),
  };
}

function getChallenge(token) {
  return challenges.get(token) || null;
}

/**
 * Liefert den HTTP-01-Challenge-Body. Muss unauthentifiziert und vor Redirects laufen.
 * @param {string} pathname
 * @param {import("http").ServerResponse} res
 * @returns {boolean} true, wenn der Pfad zur Challenge gehört
 */
function serveChallenge(pathname, res) {
  const prefix = "/.well-known/acme-challenge/";
  if (!pathname.startsWith(prefix)) return false;
  const token = decodeURIComponent(pathname.slice(prefix.length).split("/")[0] || "");
  const keyAuth = challenges.get(token);
  if (!keyAuth) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return true;
  }
  const body = Buffer.from(String(keyAuth), "utf8");
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
  return true;
}

function hasActiveFiles() {
  return store.list().some((row) => {
    if (util.deriveStatus(row) !== "active") return false;
    return Boolean(readBundle(row.domain));
  });
}

/**
 * HTTP→HTTPS, sobald ein gültiges Zertifikat liegt (nicht für ACME, Health, Metrics).
 * @param {URL} url
 */
function shouldRedirectHttp(url) {
  if (!envBool("SSL_REDIRECT", true)) return false;
  if (!hasActiveFiles()) return false;
  if (url.pathname.startsWith("/.well-known/acme-challenge/")) return false;
  if (url.pathname === "/api/health" || url.pathname === "/metrics") return false;
  return true;
}

function httpsLocation(req, url) {
  const hostHeader = String(req.headers.host || "localhost").split(":")[0];
  const port = httpsPort();
  const portPart = port === 443 ? "" : `:${port}`;
  return `https://${hostHeader}${portPart}${url.pathname}${url.search}`;
}

function readBundle(domain) {
  const dir = domainDir(domain);
  const keyPath = path.join(dir, "privkey.pem");
  if (!fs.existsSync(keyPath)) return null;
  const key = fs.readFileSync(keyPath);
  const fullPath = path.join(dir, "fullchain.pem");
  const certPath = path.join(dir, "cert.pem");
  const chainPath = path.join(dir, "chain.pem");
  let cert;
  if (fs.existsSync(fullPath)) {
    cert = fs.readFileSync(fullPath);
  } else if (fs.existsSync(certPath)) {
    const leaf = fs.readFileSync(certPath);
    const chain = fs.existsSync(chainPath) ? fs.readFileSync(chainPath) : Buffer.alloc(0);
    cert = Buffer.concat([leaf, Buffer.from("\n"), chain]);
  } else {
    return null;
  }
  return { key, cert };
}

function writeBundle(domain, { key, certPem }) {
  const dir = domainDir(domain);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const parts = util.splitPemChain(certPem);
  fs.writeFileSync(path.join(dir, "privkey.pem"), key, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "cert.pem"), parts.cert + "\n", { mode: 0o644 });
  fs.writeFileSync(path.join(dir, "chain.pem"), (parts.chain || "") + "\n", { mode: 0o644 });
  fs.writeFileSync(path.join(dir, "fullchain.pem"), (parts.fullchain || parts.cert) + "\n", { mode: 0o644 });
}

function removeBundle(domain) {
  const dir = domainDir(domain);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.warn("[ssl] Verzeichnis nicht löschbar:", dir, err.message);
  }
}

function rebuildContexts() {
  sniContexts.clear();
  defaultContext = null;
  for (const row of store.list()) {
    if (util.deriveStatus(row) !== "active") continue;
    const bundle = readBundle(row.domain);
    if (!bundle) continue;
    try {
      const ctx = tls.createSecureContext({ key: bundle.key, cert: bundle.cert });
      sniContexts.set(row.domain, ctx);
      if (!defaultContext) defaultContext = ctx;
    } catch (err) {
      console.error("[ssl] SecureContext", row.domain, err.message);
    }
  }
}

function defaultBundle() {
  for (const row of store.list()) {
    if (util.deriveStatus(row) !== "active") continue;
    const bundle = readBundle(row.domain);
    if (bundle) return bundle;
  }
  return null;
}

/**
 * Hängt denselben Request-/Upgrade-Handler an den HTTPS-Server und startet ihn bei Bedarf.
 */
function attachHttps(onRequest, onUpgrade) {
  requestHandler = onRequest;
  upgradeHandler = onUpgrade;
  reloadHttps();
}

/**
 * Lädt PEM neu in den laufenden HTTPS-Server (kein process.exit).
 */
function reloadHttps() {
  rebuildContexts();
  const def = defaultBundle();
  if (!def) {
    if (httpsServer) {
      httpsServer.close();
      httpsServer = null;
      console.log("[ssl] HTTPS beendet — kein aktives Zertifikat");
    }
    return;
  }
  if (!httpsServer) {
    startHttps(def);
    return;
  }
  try {
    httpsServer.setSecureContext({ key: def.key, cert: def.cert });
    console.log("[ssl] Zertifikate ohne Neustart neu geladen");
  } catch (err) {
    console.error("[ssl] setSecureContext:", err.message);
  }
}

function startHttps(def) {
  const port = httpsPort();
  httpsServer = https.createServer(
    {
      key: def.key,
      cert: def.cert,
      SNICallback(servername, cb) {
        const name = util.normalizeDomain(servername) || String(servername || "").toLowerCase();
        const ctx = sniContexts.get(name) || defaultContext;
        if (!ctx) {
          cb(new Error("Kein Zertifikat für diesen Host"));
          return;
        }
        cb(null, ctx);
      },
    },
    (req, res) => {
      if (requestHandler) requestHandler(req, res);
    }
  );
  httpsServer.on("upgrade", (req, socket, head) => {
    if (upgradeHandler) upgradeHandler(req, socket, head);
  });
  httpsServer.on("error", (err) => {
    console.error("[ssl] HTTPS-Fehler:", err.message);
    if (err && err.code === "EACCES") {
      console.error("[ssl] Port " + port + " braucht oft Root (443) — HTTPS_PORT setzen oder als privilegiert starten.");
    }
  });
  httpsServer.listen(port, "0.0.0.0", () => {
    console.log(`[ssl] HTTPS lauscht auf Port ${port} (Reload ohne Neustart)`);
  });
}

async function loadAccountKey(acme) {
  const p = path.join(sslDir(), "account.pem");
  if (fs.existsSync(p)) return fs.readFileSync(p);
  const key = await acme.crypto.createPrivateKey();
  fs.mkdirSync(sslDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, key, { mode: 0o600 });
  return key;
}

/**
 * Startet eine Ausstellung oder Erneuerung asynchron (Antwort sofort „pending“).
 * @param {{ domain: string, email: string, terms?: boolean, staging?: boolean, autoRenew?: boolean, renew?: boolean }} opts
 */
async function startIssue(opts) {
  const domain = util.normalizeDomain(opts.domain);
  if (!domain) {
    const err = new Error("Ungültige Domain. Bitte einen öffentlichen Hostnamen ohne http:// eingeben.");
    err.statusCode = 400;
    throw err;
  }
  if (!util.isValidEmail(opts.email)) {
    const err = new Error("Bitte eine gültige E-Mail-Adresse für Let's Encrypt angeben.");
    err.statusCode = 400;
    throw err;
  }
  if (!opts.terms && !opts.renew) {
    const err = new Error("Die Let's-Encrypt-Nutzungsbedingungen müssen akzeptiert werden.");
    err.statusCode = 400;
    throw err;
  }
  const acme = loadAcme();
  if (!acme) {
    const err = new Error("Das Paket acme-client ist nicht installiert. Bitte `npm install acme-client` ausführen.");
    err.statusCode = 503;
    throw err;
  }

  const existing = store.get(domain);
  const staging = useStaging(opts.staging);
  const autoRenew = opts.autoRenew != null ? Boolean(opts.autoRenew) : existing?.autoRenew !== false;

  if (jobs.has(domain)) {
    return { running: true, certificate: publicRow(store.get(domain)) };
  }

  store.upsert({
    domain,
    email: String(opts.email).trim(),
    status: "pending",
    error: "",
    staging,
    autoRenew,
  });

  const job = runAcme({
    domain,
    email: String(opts.email).trim(),
    staging,
    renew: Boolean(opts.renew),
  }).finally(() => jobs.delete(domain));
  jobs.set(domain, job);
  job.catch((err) => console.error("[ssl] ACME", domain, err.message));

  return { running: true, certificate: publicRow(store.get(domain)) };
}

async function runAcme({ domain, email, staging, renew }) {
  const acme = loadAcme();
  try {
    const accountKey = await loadAccountKey(acme);
    const client = new acme.Client({
      directoryUrl: staging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
      accountKey,
    });

    const keyPath = path.join(domainDir(domain), "privkey.pem");
    let certificateKey;
    let csr;
    if (renew && fs.existsSync(keyPath)) {
      certificateKey = fs.readFileSync(keyPath);
      [, csr] = await acme.crypto.createCsr({ commonName: domain, altNames: [domain] }, certificateKey);
    } else {
      [certificateKey, csr] = await acme.crypto.createCsr({ commonName: domain, altNames: [domain] });
    }

    /* Interne Vorab-Prüfung schlägt fehl, wenn der App-Port nicht 80 ist — Let's Encrypt prüft trotzdem Port 80. */
    const skipVerify = envBool("ACME_SKIP_VERIFY", httpPort() !== 80);

    const certificate = await client.auto({
      csr,
      email,
      termsOfServiceAgreed: true,
      challengePriority: ["http-01"],
      skipChallengeVerification: skipVerify,
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        if (challenge.type !== "http-01") return;
        challenges.set(challenge.token, keyAuthorization);
      },
      challengeRemoveFn: async (_authz, challenge) => {
        if (challenge?.token) challenges.delete(challenge.token);
      },
    });

    writeBundle(domain, { key: certificateKey, certPem: String(certificate) });
    const expiresAt = util.parseExpiryMs(util.splitPemChain(String(certificate)).cert);
    store.upsert({
      domain,
      email,
      status: "active",
      error: "",
      issuedAt: Date.now(),
      expiresAt,
      staging,
    });
    audit.log(renew ? "ssl_renewed" : "ssl_issued", { userId: "admin", action: domain });
    reloadHttps();
    return publicRow(store.get(domain));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    store.upsert({ domain, status: "error", error: message });
    audit.log("ssl_failed", { userId: "admin", action: domain });
    throw err;
  }
}

async function startRenew(domainRaw) {
  const domain = util.normalizeDomain(domainRaw);
  const row = domain ? store.get(domain) : null;
  if (!row) {
    const err = new Error("Kein Zertifikat für diese Domain.");
    err.statusCode = 404;
    throw err;
  }
  return startIssue({
    domain: row.domain,
    email: row.email,
    terms: true,
    staging: row.staging,
    autoRenew: row.autoRenew,
    renew: true,
  });
}

function deleteCertificate(domainRaw) {
  const domain = util.normalizeDomain(domainRaw) || String(domainRaw || "").trim().toLowerCase();
  const row = store.get(domain);
  if (!row) {
    const err = new Error("Kein Zertifikat für diese Domain.");
    err.statusCode = 404;
    throw err;
  }
  store.remove(domain);
  removeBundle(domain);
  audit.log("ssl_deleted", { userId: "admin", action: domain });
  reloadHttps();
  return { ok: true, domain };
}

/**
 * Stündlicher Sweep: aktive Zertifikate 30 Tage vor Ablauf erneuern.
 */
async function renewDue() {
  const due = store.listDue();
  for (const row of due) {
    try {
      await startIssue({
        domain: row.domain,
        email: row.email,
        terms: true,
        staging: row.staging,
        autoRenew: row.autoRenew,
        renew: true,
      });
      const job = jobs.get(row.domain);
      if (job) await job;
    } catch (err) {
      console.error("[ssl] Auto-Erneuerung", row.domain, err.message);
    }
  }
  return due.map((r) => r.domain);
}

const BACKUP_PEM_FILES = [
  { key: "privkey", file: "privkey.pem" },
  { key: "cert", file: "cert.pem" },
  { key: "chain", file: "chain.pem" },
  { key: "fullchain", file: "fullchain.pem" },
];

function readUtf8IfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.warn("[ssl] Datei nicht lesbar:", filePath, err.message);
    return "";
  }
}

/**
 * Sammelt Metadaten und PEM-Dateien für das Einstellungs-Backup.
 * Private Keys verlassen den Server nur über die Admin-Export-API.
 * @returns {{ accountPem: string, certificates: object[] }}
 */
function collectBackup() {
  const accountPem = readUtf8IfExists(path.join(sslDir(), "account.pem"));
  const certificates = store.list().map((row) => {
    const meta = publicRow(row) || { domain: row.domain };
    const dir = domainDir(row.domain);
    const files = {};
    for (const spec of BACKUP_PEM_FILES) {
      const body = readUtf8IfExists(path.join(dir, spec.file));
      if (body) files[spec.key] = body;
    }
    return { ...meta, files };
  });
  return { accountPem, certificates };
}

/**
 * Schreibt PEMs aus einem geprüften Backup und lädt HTTPS neu (kein Prozessneustart).
 * Domains werden nur upserted, bestehende andere Zertifikate bleiben.
 * @param {{ accountPem?: string, certificates?: object[] }} payload
 * @returns {{ restored: string[], account: boolean }}
 */
function restoreFromBackup(payload = {}) {
  const restored = [];
  if (payload.accountPem) {
    fs.mkdirSync(sslDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(sslDir(), "account.pem"), payload.accountPem, { mode: 0o600 });
  }
  for (const entry of payload.certificates || []) {
    const domain = util.normalizeDomain(entry.domain);
    if (!domain) continue;
    const files = entry.files || {};
    if (files.privkey && (files.cert || files.fullchain)) {
      const dir = domainDir(domain);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dir, "privkey.pem"), files.privkey, { mode: 0o600 });
      if (files.cert) fs.writeFileSync(path.join(dir, "cert.pem"), files.cert, { mode: 0o644 });
      if (files.chain) fs.writeFileSync(path.join(dir, "chain.pem"), files.chain, { mode: 0o644 });
      const full = files.fullchain || [files.cert, files.chain].filter(Boolean).join("\n");
      if (full) {
        const text = full.endsWith("\n") ? full : `${full}\n`;
        fs.writeFileSync(path.join(dir, "fullchain.pem"), text, { mode: 0o644 });
      }
    }
    store.upsert({
      domain,
      email: entry.email,
      status: entry.status || "active",
      error: entry.error || "",
      issuedAt: entry.issuedAt,
      expiresAt: entry.expiresAt,
      autoRenew: entry.autoRenew,
      staging: entry.staging,
    });
    restored.push(domain);
  }
  reloadHttps();
  return { restored, account: Boolean(payload.accountPem) };
}

module.exports = {
  sslDir,
  httpsPort,
  acmeReady,
  httpsInfo,
  publicRow,
  listCertificates,
  getChallenge,
  serveChallenge,
  shouldRedirectHttp,
  httpsLocation,
  attachHttps,
  reloadHttps,
  startIssue,
  startRenew,
  deleteCertificate,
  renewDue,
  collectBackup,
  restoreFromBackup,
  /* für Tests */
  _store: store,
  _challenges: challenges,
};
