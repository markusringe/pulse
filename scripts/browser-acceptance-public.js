#!/usr/bin/env node
/**
 * Öffentliche Browser-Abnahme ohne Login — HTTP-Checks für Startseite, Assets, Hilfe, APIs.
 * Ergänzt smoke:remote um Routen aus dem 19-Schritte-Pflichtpfad (ohne Admin-Session).
 *
 *   node scripts/browser-acceptance-public.js --url https://pulse.ringe.us
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  const out = { url: process.env.PULSE_SMOKE_URL || "https://pulse.ringe.us", expectVersion: "1.5.12" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--url" && argv[i + 1]) out.url = argv[++i];
    else if (argv[i] === "--expect-version" && argv[i + 1]) out.expectVersion = argv[++i];
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function httpGet(fullUrl, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const lib = fullUrl.startsWith("https:") ? https : http;
    const req = lib.get(fullUrl, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout: ${fullUrl}`)));
  });
}

function joinUrl(base, p) {
  return `${base.replace(/\/$/, "")}${p}`;
}

(async () => {
  const opts = parseArgs(process.argv);
  const base = opts.url.replace(/\/$/, "");
  const results = [];
  const record = (name, ok, detail = "") => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "OK" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  console.log(`Browser-Abnahme (öffentlich): ${base}\n`);

  const index = await httpGet(joinUrl(base, "/"));
  record("Startseite GET /", index.status === 200, `HTTP ${index.status}`);
  record("Viewport meta", /name=["']viewport["']/i.test(index.body));
  record("Tailwind/CSS geladen", /\/css\/pulse\.css\?h=/.test(index.body) || /\/css\/pulse\.css/.test(index.body));
  record("app.js Content-Hash", /\/js\/app\.js\?h=/.test(index.body));
  record("Manifest-Platzhalter", index.body.includes("__PULSE_ASSET_H__") || /\/js\/app\.js\?h=/.test(index.body));

  const appJsMatch = index.body.match(/\/js\/app\.js\?h=[^"']+/);
  if (appJsMatch) {
    const appJs = await httpGet(joinUrl(base, appJsMatch[0]));
    record("app.js lädt", appJs.status === 200, `${appJs.body.length} B`);
    record("app.js immutable Cache", String(appJs.headers["cache-control"] || "").includes("immutable"));
  }

  const health = await httpGet(joinUrl(base, "/api/health"));
  record("GET /api/health", health.status === 200);
  let healthJson = {};
  try { healthJson = JSON.parse(health.body); } catch { /* */ }
  record("health.version", healthJson.version === opts.expectVersion, `ist ${healthJson.version}`);
  record("health.ok", healthJson.ok === true);

  const ready = await httpGet(joinUrl(base, "/api/health/ready"));
  record("GET /api/health/ready", ready.status === 200);
  let readyJson = {};
  try { readyJson = JSON.parse(ready.body); } catch { /* */ }
  record("ready.ok:true", readyJson.ok === true);

  const auth = await httpGet(joinUrl(base, "/api/auth/status"));
  record("GET /api/auth/status", auth.status === 200);

  const articlesPath = path.join(ROOT, "frontend/help/articles.json");
  const catalog = JSON.parse(fs.readFileSync(articlesPath, "utf8"));
  const sampleIds = ["welcome", "installation", "picker", "faq"].filter((id) =>
    catalog.articles.some((a) => a.id === id)
  );
  for (const id of sampleIds.length ? sampleIds : ["welcome", "installation", "faq"]) {
    const art = catalog.articles.find((a) => a.id === id);
    if (!art) continue;
    const htmlPath = art.path || `/help/${id}.html`;
    const res = await httpGet(joinUrl(base, htmlPath));
    record(`Hilfe ${id}.html`, res.status === 200, `HTTP ${res.status}`);
  }

  const articlesUrl = joinUrl(base, "/help/articles.json");
  const artRes = await httpGet(articlesUrl);
  record("Hilfe articles.json", artRes.status === 200);

  const i18nDe = await httpGet(joinUrl(base, "/i18n/de.json"));
  record("i18n de.json", i18nDe.status === 200);
  const i18nEn = await httpGet(joinUrl(base, "/i18n/en.json"));
  record("i18n en.json", i18nEn.status === 200);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Checks bestanden`);
  if (failed.length) {
    console.error("browser-acceptance-public: FEHLER");
    process.exit(1);
  }
  console.log("browser-acceptance-public: OK");
})().catch((err) => {
  console.error("browser-acceptance-public:", err.message);
  process.exit(1);
});
