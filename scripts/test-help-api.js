#!/usr/bin/env node
/**
 * Hilfe-API Phase 2: serverseitige Rollenfilterung und roleCache.
 * Unit-Tests auf lib/helpCatalog.js + optionaler HTTP-Check gegen ephemeren Server.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const os = require("os");

const {
  buildHelpArticlesResponse,
  resolveHelpArticleAccess,
  resolveHelpArticleIdFromWebPath,
  checkHelpStaticAccess,
  resetHelpCatalogCache,
  loadRawCatalog,
} = require("../lib/helpCatalog");
const { articleVisibleToViewer, clampFilterRole, articleMatchesHelpRole } = require("../lib/helpRoles");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pickPort() {
  return 39000 + (process.pid % 21000);
}

function httpGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { ...(opts.headers || {}) };
    if (opts.cookie) headers.Cookie = opts.cookie;
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "GET", headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function waitForHealth(port, attempts = 50) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpGet(`http://127.0.0.1:${port}/api/health`)
        .then((r) => {
          if (r.status === 200) resolve();
          else if (n >= attempts) reject(new Error(`health ${r.status}`));
          else setTimeout(tick, 250);
        })
        .catch(() => {
          if (n >= attempts) reject(new Error("health timeout"));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });
}

resetHelpCatalogCache();
const raw = loadRawCatalog();

/* --- Unit: Sichtbarkeits-Obergrenze --- */
const installation = raw.articles.find((a) => a.id === "installation");
const welcome = raw.articles.find((a) => a.id === "welcome");

assert(installation && welcome, "Pflichtartikel im Rohtext");

assert(!articleVisibleToViewer(installation, "participant"), "Installation nicht für Teilnehmer");
assert(articleVisibleToViewer(welcome, "participant"), "Welcome für Teilnehmer");
assert(articleVisibleToViewer(installation, "admin"), "Installation für Admin");

assert(clampFilterRole("presenter", "admin") === "", "Presenter darf nicht admin filtern");
assert(clampFilterRole("admin", "presenter") === "presenter", "Admin darf Team filtern");

const guestPublic = buildHelpArticlesResponse(
  { user: null, viaSecret: false },
  { authEnabled: true, adminRoute: false, role: "" }
);
assert(guestPublic.source === "api", "API-Kennzeichnung");
assert(!guestPublic.articles.some((a) => a.id === "installation"), "Gast: kein Install-Artikel");
assert(guestPublic.articles.some((a) => a.id === "welcome"), "Gast: Welcome vorhanden");
assert(guestPublic.ceilingRole === "participant", "Gast-Obergrenze participant");

const guestAdminRoute = buildHelpArticlesResponse(
  { user: null, viaSecret: false },
  { authEnabled: true, adminRoute: true, role: "" }
);
assert(guestAdminRoute.ceilingRole === "participant", "Gast auf Admin-Hilfe: participant-Obergrenze");

const adminUser = buildHelpArticlesResponse(
  { user: { id: "1", role: "admin" }, viaSecret: false },
  { authEnabled: true, adminRoute: true, role: "" }
);
assert(adminUser.articles.length >= guestPublic.articles.length, "Admin sieht mindestens so viel wie Gast");
assert(adminUser.articles.some((a) => a.id === "installation"), "Admin: Installation sichtbar");

const editorUser = buildHelpArticlesResponse(
  { user: { id: "2", role: "editor" }, viaSecret: false },
  { authEnabled: true, adminRoute: true, role: "" }
);
assert(editorUser.ceilingRole === "presenter", "Editor-Obergrenze presenter");
assert(!editorUser.articles.some((a) => a.id === "installation"), "Editor: kein Install-Artikel");
assert(editorUser.articles.some((a) => a.id === "getting-started"), "Editor: Schnellstart sichtbar");

const viaSecret = buildHelpArticlesResponse(
  { user: null, viaSecret: true },
  { authEnabled: true, adminRoute: true, role: "" }
);
assert(viaSecret.ceilingRole === "admin", "ADMIN_SECRET → admin-Obergrenze");

const filteredAdmin = buildHelpArticlesResponse(
  { user: { id: "1", role: "admin" }, viaSecret: false },
  { authEnabled: true, adminRoute: true, role: "admin" }
);
assert(filteredAdmin.filterRole === "admin", "Admin-Filter gesetzt");
assert(filteredAdmin.articles.every((a) => articleMatchesHelpRole(a, "admin")), "Admin-Filter nur passende Artikel");

/* Cache: zweiter Aufruf markiert cached */
const first = buildHelpArticlesResponse({ user: null, viaSecret: false }, { authEnabled: false, adminRoute: false });
const second = buildHelpArticlesResponse({ user: null, viaSecret: false }, { authEnabled: false, adminRoute: false });
assert(second.cached === true, "roleCache liefert zweiten Treffer");

const denied = resolveHelpArticleAccess({ user: null, viaSecret: false }, "installation", {
  authEnabled: true,
  adminRoute: false,
});
assert(!denied.ok && denied.status === 403, "Einzelartikel 403 für Gast");

const allowed = resolveHelpArticleAccess({ user: { role: "admin" }, viaSecret: false }, "installation", {
  authEnabled: true,
  adminRoute: true,
});
assert(allowed.ok && allowed.article.id === "installation", "Einzelartikel für Admin");

assert(resolveHelpArticleIdFromWebPath("/help/installation.html") === "installation", "Pfad → Katalog-ID");
assert(resolveHelpArticleIdFromWebPath("/help/guides/admin-checklist.html") === "roles-admin", "Guide-Alias");

const htmlDenied = checkHelpStaticAccess({ user: null, viaSecret: false }, "/help/installation.html", {
  authEnabled: true,
});
assert(!htmlDenied.ok && htmlDenied.status === 403, "HTML-Zugriff Installation verweigert");

const htmlOk = checkHelpStaticAccess({ user: null, viaSecret: false }, "/help/welcome.html", { authEnabled: true });
assert(htmlOk.ok && htmlOk.kind === "html", "HTML Welcome erlaubt");

(async () => {
  const port = pickPort();
  const adminSecret = "help-api-phase2-secret";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-help-api-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      SQLITE_PATH: path.join(tmpDir, "pulse.db"),
      REDIS_URL: "",
      IP_BLOCK: "0",
      USER_AUTH_ENABLED: "0",
      ADMIN_SECRET: adminSecret,
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth(port);

    const pub = await httpGet(`http://127.0.0.1:${port}/api/help/articles?adminRoute=0`);
    assert(pub.status === 200, "HTTP GET /api/help/articles");
    assert(pub.json.source === "api", "HTTP: source api");
    assert(Array.isArray(pub.json.articles), "HTTP: articles Array");
    assert(!pub.json.articles.some((a) => a.id === "installation"), "HTTP: Gast ohne Installation");

    const one = await httpGet(`http://127.0.0.1:${port}/api/help/articles/installation`);
    assert(one.status === 403, "HTTP Einzelartikel 403 ohne Auth");

    const withSecret = await httpGet(`http://127.0.0.1:${port}/api/help/articles/installation`, {
      headers: { "X-Admin-Key": adminSecret },
    });
    assert(withSecret.status === 200, "HTTP Einzelartikel mit ADMIN_SECRET");
    assert(withSecret.json.article?.id === "installation", "HTTP Installation mit Secret");

    const staticJson = await httpGet(`http://127.0.0.1:${port}/help/articles.json`);
    assert(staticJson.status === 200, "HTTP gefiltertes articles.json");
    assert(!staticJson.json.articles.some((a) => a.id === "installation"), "articles.json ohne Installation");

    const html403 = await httpGet(`http://127.0.0.1:${port}/help/installation.html`);
    assert(html403.status === 403, "HTTP installation.html 403 ohne Auth");

    const html200 = await httpGet(`http://127.0.0.1:${port}/help/welcome.html`);
    assert(html200.status === 200, "HTTP welcome.html für Gast");

    console.log("test-help-api: ok", pub.json.articles.length, "Artikel (Gast)");
  } finally {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error("test-help-api:", err.message || err);
  process.exit(1);
});
