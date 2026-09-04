#!/usr/bin/env node
/**
 * SSL-Hilfsfunktionen und Zertifikat-Speicher — ohne Let's-Encrypt-Netzwerk.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {
  normalizeDomain,
  isValidEmail,
  deriveStatus,
  isDueForRenewal,
  splitPemChain,
  RENEW_WINDOW_MS,
} = require("../lib/sslUtil");
const { createSslStore } = require("../lib/sslStore");
const ssl = require("../lib/ssl");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(normalizeDomain("https://Pulse.Example.DE:443/path") === "pulse.example.de", "Domain aus URL");
assert(normalizeDomain("localhost") === null, "localhost unzulässig");
assert(normalizeDomain("127.0.0.1") === null, "IPv4 unzulässig");
assert(normalizeDomain("*.example.de") === null, "Wildcard unzulässig");
assert(normalizeDomain("ok") === null, "kein Punkt");
assert(isValidEmail("admin@stadt.de"), "E-Mail gültig");
assert(!isValidEmail("ohne-at"), "E-Mail ungültig");

const now = Date.now();
assert(deriveStatus({ status: "pending" }) === "pending", "Status Läuft");
assert(deriveStatus({ status: "error" }) === "error", "Status Fehler");
assert(deriveStatus({ status: "active", expiresAt: now + 86400000 }) === "active", "Status Aktiv");
assert(deriveStatus({ status: "active", expiresAt: now - 1000 }) === "expired", "Status Abgelaufen");
assert(deriveStatus({ status: "expired", expiresAt: now + 86400000 }) === "expired", "explizit abgelaufen");

assert(
  isDueForRenewal({ status: "active", expiresAt: now + 86400000, autoRenew: true }),
  "Erneuerung 1 Tag vor Ablauf"
);
assert(
  !isDueForRenewal({ status: "active", expiresAt: now + RENEW_WINDOW_MS + 86400000, autoRenew: true }),
  "noch nicht fällig"
);
assert(
  !isDueForRenewal({ status: "active", expiresAt: now + 86400000, autoRenew: false }),
  "autoRenew aus"
);
assert(isDueForRenewal({ status: "expired", expiresAt: now - 1000, autoRenew: true }), "abgelaufen erneuern");

const chain = splitPemChain(
  "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nBBB\n-----END CERTIFICATE-----"
);
assert(chain.cert.includes("AAA"), "Blatt-Zertifikat");
assert(chain.chain.includes("BBB"), "Zwischenzertifikat");
assert(chain.fullchain.includes("AAA") && chain.fullchain.includes("BBB"), "fullchain");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ssl-"));
const store = createSslStore(path.join(dir, "pulse.db"));
store.upsert({
  domain: "demo.example.de",
  email: "it@example.de",
  status: "active",
  issuedAt: now,
  expiresAt: now + 86400000,
  autoRenew: true,
});
assert(store.get("demo.example.de").email === "it@example.de", "Store lesen");
assert(store.list().length === 1, "Store Liste");
assert(store.listDue(now).length === 1, "Store fällig");
store.remove("demo.example.de");
assert(!store.get("demo.example.de"), "Store löschen");

ssl._challenges.set("test-token", "key-authorization-value");
const captured = { status: 0, headers: {}, body: null };
const res = {
  writeHead(status, headers) {
    captured.status = status;
    captured.headers = headers;
  },
  end(body) {
    captured.body = body;
  },
};
assert(ssl.serveChallenge("/.well-known/acme-challenge/test-token", res), "Challenge-Pfad");
assert(captured.status === 200, "Challenge 200");
assert(String(captured.body).includes("key-authorization-value"), "Challenge-Body");
assert(ssl.serveChallenge("/.well-known/acme-challenge/fehlt", res), "unbekanntes Token trotzdem Challenge-Route");
assert(captured.status === 404, "Challenge 404");
assert(!ssl.serveChallenge("/admin/ssl", res), "kein Challenge-Pfad");
assert(ssl.isSecureRequest({ headers: { "x-forwarded-proto": "https" }, socket: {} }), "Proxy HTTPS");
assert(!ssl.isSecureRequest({ headers: { "x-forwarded-proto": "http" }, socket: {} }), "Proxy HTTP");
assert(ssl.isSecureRequest({ headers: {}, socket: { encrypted: true } }), "direktes TLS");
const healthUrl = new URL("http://x/api/health/ready");
assert(!ssl.shouldRedirectHttp(healthUrl), "Readiness nicht redirecten");
ssl._challenges.delete("test-token");

const info = ssl.httpsInfo();
assert(typeof info.port === "number", "HTTPS-Port");
assert(typeof info.acmeReady === "boolean", "acmeReady Flag");
assert(!String(JSON.stringify(ssl.listCertificates())).includes("BEGIN PRIVATE"), "keine Private Keys in der Liste");

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(process.env.PORT) || 3000,
        path: pathname,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            json = {};
          }
          resolve({ status: r.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function liveApi() {
  try {
    const health = await request("GET", "/api/health");
    if (health.status !== 200) return;
    assert(health.json.https && typeof health.json.https.port === "number", "Health enthält https");
    const list = await request("GET", "/api/ssl");
    assert(list.status === 200, "GET /api/ssl");
    assert(Array.isArray(list.json.certificates), "Zertifikatsliste");
    const bad = await request("POST", "/api/ssl/issue", { domain: "localhost", email: "a@b.c", terms: true });
    assert(bad.status === 400, "localhost wird abgelehnt");
    const noTerms = await request("POST", "/api/ssl/issue", { domain: "stadt.example.de", email: "a@b.c" });
    assert(noTerms.status === 400, "TOS Pflicht");
    console.log("SSL-Live-API OK");
  } catch (err) {
    if (err && err.code === "ECONNREFUSED") {
      console.log("SSL-Live-API übersprungen (Server nicht erreichbar)");
      return;
    }
    throw err;
  }
}

liveApi()
  .then(() => {
    console.log("SSL-Tests OK");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
