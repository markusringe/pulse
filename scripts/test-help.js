#!/usr/bin/env node
/**
 * Hilfe-Index: Suche, Kategorie- und Rollenfilter auf articles.json.
 * Nutzt lib/helpIndex.js (CJS) — gleiches Verhalten wie frontend/js/help.js.
 */
const fs = require("fs");
const path = require("path");
const { filterArticles, highlightText, listCategories, tokenize } = require("../lib/helpIndex");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const jsonPath = path.join(__dirname, "../frontend/help/articles.json");
const catalog = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const articles = catalog.articles;

assert(catalog.app === "Pulse", "App-Name im Katalog");
assert(catalog.version >= 10, "Artikelkatalog Version mindestens 10");
assert(typeof catalog.appVersion === "string" && catalog.appVersion.length >= 5, "appVersion in articles.json");

const requiredIds = [
  "welcome",
  "architecture",
  "getting-started",
  "features",
  "roles-participant",
  "roles-presenter",
  "roles-admin",
  "session-manage",
  "use-cases",
  "polls",
  "picker",
  "qa",
  "quiz",
  "events",
  "admin",
  "installation",
  "ssl",
  "privacy",
  "faq",
  "auth-login",
  "troubleshooting",
  "glossary",
  "related-docs",
];

assert(Array.isArray(articles) && articles.length >= requiredIds.length, "Artikelkatalog vorhanden");
assert(requiredIds.every((id) => articles.some((a) => a.id === id)), "Pflichtartikel liegen im Index");

assert(Array.isArray(catalog.roles) && catalog.roles.length >= 3, "Rollen-Definitionen vorhanden");

const cats = listCategories(articles);
assert(cats.includes("welcome") && cats.includes("glossary"), "Kategorien aus Artikeln");

const all = filterArticles(articles, { query: "", category: "" });
assert(all.length === articles.length, "Leere Suche liefert alle");

const presenterOnly = filterArticles(articles, { role: "presenter" });
assert(presenterOnly.length >= 5 && presenterOnly.every((a) => (a.roles || []).includes("presenter")), "Rollenfilter Presenter");

const wc = filterArticles(articles, { query: "wortwolke" });
assert(
  wc.some((a) => a.id === "polls" || a.id === "features" || a.id === "getting-started"),
  "Suche Wortwolke trifft Feature-Artikel"
);

const adminOnly = filterArticles(articles, { category: "admin" });
assert(adminOnly.length >= 1 && adminOnly.every((a) => a.category === "admin"), "Kategorie admin filtert");

const both = filterArticles(articles, { query: "ssl zertifikat", category: "ssl" });
assert(both.some((a) => a.id === "ssl"), "UND-Suche plus Kategorie");

const archHit = filterArticles(articles, { query: "architektur deck" });
assert(archHit.some((a) => a.id === "architecture"), "Suche Architektur trifft Architektur-Artikel");

const none = filterArticles(articles, { query: "xyznichtvorhanden123" });
assert(none.length === 0, "Unbekannter Begriff: leer");

const marked = highlightText("Join-Code eingeben", "code");
assert(marked.includes("<mark>") && marked.toLowerCase().includes("code"), "Highlight setzt mark");

const safe = highlightText("<script>x</script>", "script");
assert(!safe.includes("<script>"), "Highlight escaped HTML");
assert(safe.includes("&lt;"), "Escape kleiner-als");

assert(tokenize("A xy code").join(",") === "xy,code", "Tokens ab Länge 2");

const schemaHit = filterArticles(articles, { query: "schema" });
assert(schemaHit.some((a) => a.id === "admin"), "Suche Schema trifft Admin");

const vpsHit = filterArticles(articles, { query: "install-vps docker" });
assert(vpsHit.some((a) => a.id === "installation"), "Suche VPS/Docker trifft Installation");

const htmlDir = path.join(__dirname, "../frontend/help");
for (const id of requiredIds) {
  const file = path.join(htmlDir, `${id}.html`);
  assert(fs.existsSync(file), `Partial ${id}.html`);
}

for (const name of ["presenter.html", "participant.html", "admin-checklist.html"]) {
  assert(fs.existsSync(path.join(htmlDir, "guides", name)), `Guide ${name}`);
}

const docPath = path.join(__dirname, "../docs/projektdokumentation.md");
assert(fs.existsSync(docPath), "docs/projektdokumentation.md vorhanden");

const hilfePath = path.join(__dirname, "../docs/hilfe.md");
assert(fs.existsSync(hilfePath), "docs/hilfe.md vorhanden");
const hilfeHead = fs.readFileSync(hilfePath, "utf8").slice(0, 400);
assert(
  hilfeHead.includes(`Version ${catalog.version}`) || hilfeHead.includes(`version ${catalog.version}`),
  `docs/hilfe.md Katalog-Version ${catalog.version}`,
);
assert(hilfeHead.includes(catalog.appVersion), `docs/hilfe.md Programmversion ${catalog.appVersion}`);

const pickerHit = filterArticles(articles, { query: "picker kategorien" });
assert(pickerHit.some((a) => a.id === "picker"), "Suche Picker trifft Picker-Artikel");
assert(fs.existsSync(path.join(htmlDir, "picker.html")), "Partial picker.html");

console.log("test-help: ok", articles.length, "Artikel");
