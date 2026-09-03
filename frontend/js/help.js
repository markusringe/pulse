/**
 * Hilfesystem Pulse: Tour, Hilfe-View, Suche, Feedback, Mini-Hilfe.
 *
 * Merge-freundlich: #view-help wird hier injiziert (kein großer index.html-Block).
 * Routing: app.js kann showHelpPage() aufrufen; zusätzlich eigener hashchange,
 * falls app.js von anderen Agenten umgebaut wird.
 *
 * Suche: gleiches Verhalten wie lib/helpIndex.js (Tokens UND, Kategorie exakt).
 */

import { bindTooltips } from "./tooltips.js";
import { explainError } from "./errors.js";

const TOUR_DONE_KEY = "pulse:tour-done";
const TOUR_LATER_KEY = "pulse:tour-later";
const FEEDBACK_KEY = "pulse:help-feedback";
const ARTICLES_URL = "/help/articles.json?v=help8";

/** @type {string|null} */
let appVersionLabel = null;

/** Programmversion für Hilfe-Kopfzeile (Health-API oder articles.json). */
async function resolveAppVersionLabel() {
  if (appVersionLabel) return appVersionLabel;
  try {
    const res = await fetch("/api/health");
    const data = await res.json().catch(() => ({}));
    if (data.versionLabel) {
      appVersionLabel = data.versionLabel;
      return appVersionLabel;
    }
    if (data.version) {
      appVersionLabel = data.version.startsWith("v") ? data.version : `v${data.version}`;
      return appVersionLabel;
    }
  } catch {
    /* offline / Tests */
  }
  if (catalog?.appVersion) {
    appVersionLabel = catalog.appVersion.startsWith("v") ? catalog.appVersion : `v${catalog.appVersion}`;
    return appVersionLabel;
  }
  appVersionLabel = "";
  return appVersionLabel;
}

/** Anzeige-Text: Programm + Hilfe-Katalog. */
function helpVersionLine() {
  const app = appVersionLabel || (catalog?.appVersion ? `v${catalog.appVersion}` : "");
  const cat = catalog?.version ? ` · Hilfe-Katalog v${catalog.version}` : "";
  return app ? `Pulse ${app}${cat}` : "Pulse";
}

/** Versionszeile in der Hilfe-Ansicht aktualisieren. */
async function refreshHelpVersionLine() {
  await resolveAppVersionLabel();
  const eyebrow = document.getElementById("help-version-label");
  if (eyebrow) eyebrow.textContent = helpVersionLine();
  const foot = document.getElementById("help-version-foot");
  if (foot) {
    foot.textContent = `Dokumentation bezieht sich auf ${helpVersionLine()}. Bei Abweichungen gilt der Stand der HTML-Artikel unter frontend/help/.`;
  }
}

/** @type {object | null} */
let catalog = null;
let bound = false;
let tourStep = 0;
/** Verhindert Doppelstart, während drawTour noch auf #/admin umleitet. */
let tourBusy = false;
/** @type {HTMLElement | null} */
let lastFocus = null;

const TOUR_STEPS = [
  {
    title: "Willkommen bei Pulse",
    body: "Hier legen Sie Sessions an, nicht auf der öffentlichen Startseite. Die Tour bleibt, bis Sie fertig sind, überspringen oder später wählen. Teilnehmende geben den Join-Code nur auf der Startseite ein.",
    target: "#create-form",
    route: "#/admin",
  },
  {
    title: "Session erstellen",
    body: "Fragetyp wählen (Umfrage, Wortwolke, Q&A, Quiz und weitere), Frage formulieren, optional Antworten. Checkbox „Probe“ für einen Test ohne Publikum. „Session starten“ öffnet Code, QR und oft einen Warteraum.",
    target: "#create-type",
    route: "#/admin",
  },
  {
    title: "Wortwolke",
    body: "Beim Typ „Wortwolke“ senden die Leute kurze Wörter. Häufige Begriffe werden größer. Klick zeigt die Anzahl; auf der Bühne gibt es einen PNG-Export. Gut für Stimmungsbilder, nicht für geheime Abstimmungen.",
    target: "#create-form",
    route: "#/admin",
  },
  {
    title: "Live-Q&A",
    body: "Offene Fragen mit Kategorie, optional privat, Upvotes und ein Moderations-Panel. Wortfilter und Rate-Limit dämpfen Spam. Mehr steht in der Hilfe.",
    target: "#create-question",
    route: "#/admin",
  },
];

/**
 * Filter analog zu lib/helpIndex.js — bitte dort mittesten, nicht nur hier ändern.
 * @param {object[]} articles
 * @param {{ query?: string, category?: string, role?: string }} [opts]
 */
export function filterArticles(articles, opts = {}) {
  const list = Array.isArray(articles) ? articles : [];
  const category = String(opts.category || "")
    .trim()
    .toLowerCase();
  const role = String(opts.role || "")
    .trim()
    .toLowerCase();
  const tokens = tokenize(opts.query);
  return list.filter((article) => {
    if (category && String(article.category || "").toLowerCase() !== category) return false;
    if (role) {
      const roles = Array.isArray(article.roles) ? article.roles : [];
      if (!roles.map((r) => String(r).toLowerCase()).includes(role)) return false;
    }
    if (!tokens.length) return true;
    const blob = [
      article.id,
      article.slug,
      article.title,
      article.titleEn,
      article.titleFr,
      article.summary,
      article.bodyText,
      article.category,
      ...(Array.isArray(article.roles) ? article.roles : []),
      ...(Array.isArray(article.tags) ? article.tags : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return tokens.every((tok) => blob.includes(tok));
  });
}

/**
 * Treffer mit <mark> (HTML im Text wird escaped). Analog lib/helpIndex.js.
 * @param {unknown} text
 * @param {unknown} query
 */
export function highlightText(text, query) {
  const safe = escapeHtml(text);
  const tokens = tokenize(query);
  if (!tokens.length) return safe;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("(" + escaped.join("|") + ")", "gi");
  return safe.replace(re, "<mark>$1</mark>");
}

function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * DOM-Gerüst und Listener ohne Tour (Import-Zeit, vor Consent).
 */
function installHelp() {
  ensureHelpView();
  injectNavLinks();
  injectPresenterHelp();
  injectContextChrome();
  bindTooltips();
  if (bound) return;
  bound = true;
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onDocKey);
  window.addEventListener("hashchange", onHash);
  if (parseHelpHash()) onHash();
  else updateContextPanel();
}

/**
 * Hilfe binden. Erstnutzer-Tour nur auf #/admin, nie auf der öffentlichen Startseite.
 */
export function bindHelp() {
  installHelp();
  maybeStartTour();
}

/**
 * Hilfe-View anhand der aktuellen Hash-Route zeichnen.
 * @param {{ admin?: boolean }} [opts]
 */
export function showHelpPage(opts = {}) {
  ensureHelpView();
  const parsed = parseHelpHash();
  if (!parsed) return;
  const admin = Boolean(opts.admin) || parsed.admin;
  renderHelp(parsed.slug, admin);
}

function parseHelpHash() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const m = hash.match(/^\/(?:admin\/)?help(?:\/([a-z0-9-]+))?$/);
  if (!m) return null;
  return { admin: hash.startsWith("/admin/"), slug: m[1] || "" };
}

function onHash() {
  const parsed = parseHelpHash();
  const hash = location.hash.replace(/^#/, "") || "/";
  if (!parsed) {
    document.getElementById("view-help")?.setAttribute("hidden", "");
    updateContextPanel();
    /* Startseite und alle Nicht-Hub-Routen: keine Tour, Overlay sofort weg. */
    if (hash !== "/admin" && hash !== "/admin/") {
      tourBusy = false;
      clearTourDom();
      return;
    }
    maybeStartTour();
    return;
  }
  const view = ensureHelpView();
  for (const section of document.querySelectorAll("#app > .view")) {
    const isHelp = section.id === "view-help";
    section.hidden = !isHelp;
    if ("inert" in section) section.inert = !isHelp;
  }
  view.hidden = false;
  if ("inert" in view) view.inert = false;
  renderHelp(parsed.slug, parsed.admin);
  updateContextPanel();
}

function ensureHelpView() {
  let view = document.getElementById("view-help");
  if (view) return view;
  view = document.createElement("section");
  view.id = "view-help";
  view.className = "view view-help legal-page";
  view.dataset.view = "help";
  view.hidden = true;
  view.innerHTML = `
    <header class="help-header">
      <div>
        <p class="eyebrow" id="help-version-label">Pulse</p>
        <h1>Hilfe</h1>
      </div>
      <p><a href="#/">← Start</a></p>
    </header>
    <form class="help-search" role="search">
      <label class="field">
        <span class="sr-only">Hilfe durchsuchen</span>
        <input type="search" id="help-q" name="q" placeholder="Suche in der Hilfe…" autocomplete="off" />
      </label>
      <div class="help-cats" id="help-cats" role="group" aria-label="Kategorien"></div>
      <div class="help-roles" id="help-roles" role="group" aria-label="Rollen"></div>
    </form>
    <div class="help-layout">
      <div id="help-main"></div>
      <aside class="help-side" id="help-side"></aside>
    </div>
    <p class="muted help-version-foot" id="help-version-foot"></p>
  `;
  const app = document.getElementById("app");
  app?.append(view);
  view.querySelector("#help-q")?.addEventListener("input", () => {
    const parsed = parseHelpHash();
    renderHelp(parsed?.slug || "", Boolean(parsed?.admin));
  });
  return view;
}

function injectNavLinks() {
  /* Text-„Hilfe“ nicht in Footer/Startseite — Admin-Leiste hat einen eigenen Eintrag. */
  document.querySelectorAll(".footer-links [data-help-nav], .view-home [data-help-nav], .present-meta [data-help-nav]").forEach((el) => el.remove());
}

/**
 * Einklappbare Tastaturhilfe — nur Tasten aus app.js onHotkeys.
 */
function injectPresenterHelp() {
  const host = document.getElementById("present-stage") || document.getElementById("view-present");
  if (!host || host.querySelector(".help-hotkeys")) return;
  const box = document.createElement("details");
  box.className = "help-hotkeys";
  box.innerHTML = `
    <summary>Tastaturhilfe</summary>
    <ul>
      <li><kbd>→</kbd> oder <kbd>Leertaste</kbd>: nächste Folie (Leertaste nicht bei Quiz)</li>
      <li><kbd>←</kbd>: vorherige Folie</li>
      <li><kbd>R</kbd>: Ergebnisse zeigen / verbergen</li>
      <li><kbd>T</kbd>: Hell- / Dunkelmodus</li>
    </ul>
    <p class="muted">Keine weiteren Kürzel (kein Stummschalten). <a href="./help/guides/presenter.html">Guide drucken</a></p>
  `;
  host.append(box);
}

function injectContextChrome() {
  if (document.getElementById("help-fab")) {
    updateContextPanel();
    return;
  }
  const fab = document.createElement("button");
  fab.type = "button";
  fab.id = "help-fab";
  fab.className = "help-fab";
  fab.setAttribute("aria-expanded", "false");
  fab.setAttribute("aria-controls", "help-context");
  fab.setAttribute("aria-label", "Kontext-Hilfe");
  fab.textContent = "?";
  const panel = document.createElement("aside");
  panel.id = "help-context";
  panel.className = "help-context";
  panel.hidden = true;
  panel.innerHTML = `<h2>Auf diesem Bildschirm</h2><div id="help-context-body"></div>`;
  document.body.append(fab, panel);
  fab.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", String(open));
    if (open) updateContextPanel();
  });
  updateContextPanel();
}

function updateContextPanel() {
  const body = document.getElementById("help-context-body");
  if (!body) return;
  const hash = location.hash.replace(/^#/, "") || "/";
  let items = [
    ["#/help/welcome", "Willkommen"],
    ["#/help/architecture", "Architektur"],
    ["#/help/getting-started", "Schnellstart"],
    ["#/help/faq", "FAQ"],
  ];
  if (hash.startsWith("/present")) {
    items = [
      ["#/help/roles-presenter", "Presenter-Guide"],
      ["./help/guides/presenter.html", "Präsentator-Guide (Druck)"],
      ["#/help/troubleshooting", "Verbindung / Sperre"],
    ];
  } else if (hash.startsWith("/join")) {
    items = [
      ["#/help/roles-participant", "Teilnehmer-Guide"],
      ["./help/guides/participant.html", "Teilnehmer (Druck)"],
      ["#/help/troubleshooting", "Code falsch?"],
    ];
  } else if (hash === "/admin" || hash === "/admin/") {
    items = [
      ["#/help/architecture", "Session-Architektur"],
      ["#/help/session-manage", "Session anlegen"],
      ["#/help/admin", "Admin-Hilfe"],
      ["#/admin/events", "Events"],
    ];
  } else if (hash.startsWith("/admin/ssl")) {
    items = [
      ["#/help/ssl", "SSL erklärt"],
      ["#/admin/ssl", "Zertifikate verwalten"],
    ];
  } else if (hash.startsWith("/admin/branding")) {
    items = [
      ["#/help/admin", "Admin-Hilfe (Branding)"],
      ["#/admin/settings", "Einstellungen"],
    ];
  } else if (hash.startsWith("/admin/updates")) {
    items = [
      ["#/help/updates", "Updates erklärt"],
      ["#/admin/updates", "Updates verwalten"],
    ];
  } else if (hash.startsWith("/admin/settings")) {
    items = [
      ["#/help/admin", "Admin-Hilfe (Sicherung)"],
      ["#/admin/settings", "Einstellungen"],
    ];
  } else if (hash.startsWith("/admin/privacy") || hash === "/privacy" || hash === "/impressum") {
    items = [
      ["#/help/privacy", "Datenschutz in der Hilfe"],
      ["#/privacy", "Datenschutzerklärung"],
      ["#/impressum", "Impressum"],
    ];
  } else if (hash.startsWith("/admin/help") || hash.startsWith("/help")) {
    items = [
      ["#/help/installation", "Installation"],
      ["./help/guides/presenter.html", "Präsentator drucken"],
      ["./help/guides/admin-checklist.html", "Admin-Checkliste"],
    ];
  }
  body.innerHTML = `<ul>${items
    .map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`)
    .join("")}</ul>`;
}

async function loadCatalog() {
  if (catalog) return catalog;
  try {
    const res = await fetch(ARTICLES_URL);
    catalog = await res.json();
  } catch {
    catalog = { articles: [], categories: [] };
  }
  return catalog;
}

async function renderHelp(slug, admin) {
  const data = await loadCatalog();
  await refreshHelpVersionLine();
  const articles = data.articles || [];
  const cats = data.categories || [];
  const roleDefs = data.roles || [];
  const q = document.getElementById("help-q")?.value || "";
  const activeCat = document.getElementById("help-cats")?.dataset.cat || "";
  const activeRole = document.getElementById("help-roles")?.dataset.role || "";
  renderCats(cats, activeCat);
  renderRoles(roleDefs, activeRole);
  const main = document.getElementById("help-main");
  const side = document.getElementById("help-side");
  if (!main || !side) return;

  const h1 = document.querySelector("#view-help h1");
  if (h1) h1.textContent = admin ? "Admin-Hilfe" : "Hilfe";

  side.innerHTML = renderSide(admin);

  if (slug) {
    const meta = articles.find((a) => a.id === slug || a.slug === slug);
    if (!meta) {
      main.innerHTML = `<p>Artikel nicht gefunden. <a href="#/${admin ? "admin/" : ""}help">Zur Übersicht</a></p>`;
      return;
    }
    let html = await loadArticleHtml(meta.id);
    html = injectArticleToc(html);
    main.innerHTML = `<article class="help-article-page" data-article-id="${escapeHtml(meta.id)}">${html}
      <p class="help-no-print"><button type="button" class="btn ghost" data-help-print>Drucken</button></p>
      ${renderFeedback(meta.id)}</article>`;
    bindFeedback(meta.id);
    return;
  }

  const filtered = filterArticles(articles, { query: q, category: activeCat, role: activeRole });
  const hubEmpty = !q && !activeCat && !activeRole;

  if (hubEmpty) {
    let welcome = await loadArticleHtml("welcome");
    welcome = injectArticleToc(welcome);
    main.innerHTML = `<div class="help-article-page">${welcome}
      <section class="help-hub-list" id="help-all-articles">
        <h2>Alle Artikel</h2>
        ${renderArticleList(filtered, q, admin)}
      </section>
    </div>`;
    return;
  }

  if (!filtered.length) {
    main.innerHTML = `<p>Keine Treffer. <button type="button" class="btn ghost" data-help="clear-search">Filter leeren</button></p>`;
    return;
  }
  main.innerHTML = renderArticleList(filtered, q, admin);
}

/**
 * Inhaltsverzeichnis aus H2/H3 erzeugen, wenn noch keins vorhanden ist.
 * @param {string} html
 */
function injectArticleToc(html) {
  if (html.includes('class="help-toc"')) return html;
  const headings = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([^<]+)</gi;
  let m;
  while ((m = re.exec(html))) {
    headings.push({ level: Number(m[1]), id: m[2], text: m[3].replace(/&amp;/g, "&") });
  }
  if (headings.length < 3) return html;
  const items = headings
    .map((h) => `<li${h.level === 3 ? ' class="help-toc-h3"' : ""}><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`)
    .join("");
  const toc = `<nav class="help-toc" aria-label="Auf dieser Seite"><strong>Auf dieser Seite</strong><ul>${items}</ul></nav>`;
  return html.replace(/(<h2[^>]*>)/i, toc + "$1");
}

function renderArticleList(filtered, q, admin) {
  return `<ul class="help-article-list">${filtered
    .map((a) => {
      const href = `#/${admin ? "admin/" : ""}help/${a.id}`;
      return `<li><a href="${href}"><strong>${highlightText(a.title, q)}</strong><span class="muted">${highlightText(a.summary, q)}</span></a></li>`;
    })
    .join("")}</ul>`;
}

function renderRoles(roleDefs, active) {
  const box = document.getElementById("help-roles");
  if (!box) return;
  const all = roleDefs.length ? roleDefs : [{ id: "", label: "Alle Rollen" }];
  box.innerHTML = all
    .map((r) => {
      const pressed = (r.id || "") === active;
      return `<button type="button" data-help-role="${escapeHtml(r.id || "")}" aria-pressed="${pressed}">${escapeHtml(r.label)}</button>`;
    })
    .join("");
}

function renderCats(cats, active) {
  const box = document.getElementById("help-cats");
  if (!box) return;
  const all = [{ id: "", label: "Alle" }, ...cats];
  box.innerHTML = all
    .map((c) => {
      const pressed = (c.id || "") === active;
      return `<button type="button" data-help-cat="${escapeHtml(c.id || "")}" aria-pressed="${pressed}">${escapeHtml(c.label)}</button>`;
    })
    .join("");
}

function renderSide(admin) {
  const guides = `
    <section>
      <h2>Drucken</h2>
      <ul>
        <li><a href="./help/guides/presenter.html">Präsentator</a></li>
        <li><a href="./help/guides/participant.html">Teilnehmende</a></li>
        <li><a href="./help/guides/admin-checklist.html">Admin-Checkliste</a></li>
      </ul>
      <p class="muted">Im Druckdialog „Als PDF sichern“ — wir liefern keine fertige PDF-Datei.</p>
    </section>
    <section>
      <h2>Weiter</h2>
      <ul>
        <li><a href="#/admin">Sessions</a></li>
        <li><a href="#/admin/events">Events</a></li>
        <li><a href="#/admin/branding">Branding</a></li>
        <li><a href="#/admin/privacy">Datenschutz</a></li>
        <li><a href="#/admin/ssl">SSL</a></li>
        <li><a href="#/admin/settings">Einstellungen</a></li>
        <li><button type="button" class="btn ghost" data-help="tour">Tour erneut</button></li>
      </ul>
    </section>`;
  if (!admin) return guides;
  return `${guides}<section><h2>Feedback (dieses Gerät)</h2><div id="help-agg">${renderAggregate()}</div></section>`;
}

async function loadArticleHtml(id) {
  try {
    const res = await fetch(`/help/${encodeURIComponent(id)}.html`);
    if (!res.ok) throw new Error("missing");
    return await res.text();
  } catch {
    return `<p>Artikel „${escapeHtml(id)}“ konnte nicht geladen werden.</p>`;
  }
}

function renderFeedback(articleId) {
  return `
    <form class="help-feedback" data-feedback-for="${escapeHtml(articleId)}">
      <p>War dieser Artikel hilfreich?</p>
      <div class="home-actions">
        <button type="button" class="btn ghost" data-helpful="yes">Ja</button>
        <button type="button" class="btn ghost" data-helpful="no">Nein</button>
      </div>
      <label class="field">
        <span class="muted">Optionaler Hinweis (bleibt in diesem Browser)</span>
        <textarea name="note" maxlength="400"></textarea>
      </label>
      <button type="submit" class="btn primary">Feedback speichern</button>
      <p class="muted" data-feedback-status role="status"></p>
    </form>`;
}

function bindFeedback(articleId) {
  const form = document.querySelector(`[data-feedback-for="${CSS.escape(articleId)}"]`);
  if (!form) return;
  let helpful = null;
  form.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-helpful]");
    if (!btn) return;
    helpful = btn.getAttribute("data-helpful") === "yes";
    form.querySelector("[data-feedback-status]").textContent =
      helpful ? "Als hilfreich markiert." : "Als nicht hilfreich markiert.";
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const note = form.querySelector("textarea")?.value || "";
    saveFeedback({ articleId, helpful, note, ts: Date.now() });
    form.querySelector("[data-feedback-status]").textContent = "Danke — nur lokal gespeichert, kein Server.";
  });
}

function readFeedback() {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFeedback(entry) {
  const list = readFeedback();
  list.push(entry);
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* Quota */
  }
}

function renderAggregate() {
  const list = readFeedback();
  if (!list.length) return `<p class="muted">Noch kein Feedback auf diesem Gerät.</p>`;
  const by = new Map();
  for (const row of list) {
    const id = row.articleId || "?";
    const cur = by.get(id) || { yes: 0, no: 0, n: 0 };
    cur.n += 1;
    if (row.helpful === true) cur.yes += 1;
    if (row.helpful === false) cur.no += 1;
    by.set(id, cur);
  }
  return `<ul class="help-agg">${[...by.entries()]
    .map(([id, c]) => `<li><a href="#/admin/help/${escapeHtml(id)}">${escapeHtml(id)}</a> — ${c.yes} ja / ${c.no} nein (${c.n})</li>`)
    .join("")}</ul>`;
}

function onDocClick(ev) {
  const roleBtn = ev.target.closest("[data-help-role]");
  if (roleBtn) {
    const box = document.getElementById("help-roles");
    if (box) box.dataset.role = roleBtn.getAttribute("data-help-role") || "";
    const parsed = parseHelpHash();
    renderHelp(parsed?.slug || "", Boolean(parsed?.admin));
    return;
  }
  const catBtn = ev.target.closest("[data-help-cat]");
  if (catBtn) {
    const box = document.getElementById("help-cats");
    if (box) box.dataset.cat = catBtn.getAttribute("data-help-cat") || "";
    const parsed = parseHelpHash();
    renderHelp(parsed?.slug || "", Boolean(parsed?.admin));
    return;
  }
  if (ev.target.closest("[data-help='clear-search']")) {
    const input = document.getElementById("help-q");
    const box = document.getElementById("help-cats");
    const roleBox = document.getElementById("help-roles");
    if (input) input.value = "";
    if (box) box.dataset.cat = "";
    if (roleBox) roleBox.dataset.role = "";
    const parsed = parseHelpHash();
    renderHelp("", Boolean(parsed?.admin));
    return;
  }
  if (ev.target.closest("[data-help='tour']")) {
    try {
      localStorage.removeItem(TOUR_DONE_KEY);
      sessionStorage.removeItem(TOUR_LATER_KEY);
    } catch {
      /* ignore */
    }
    location.hash = "#/admin";
    window.setTimeout(() => startTour(0), 50);
    return;
  }
  if (ev.target.closest("[data-help-print]")) {
    window.print();
  }
}

function onDocKey(ev) {
  if (ev.key !== "Escape") return;
  if (document.getElementById("help-tour-card")) {
    deferTour();
    return;
  }
  const panel = document.getElementById("help-context");
  if (panel && !panel.hidden) {
    panel.hidden = true;
    document.getElementById("help-fab")?.setAttribute("aria-expanded", "false");
  }
}

/* ----------------------------- Tour -------------------------------- */

function maybeStartTour() {
  const hash = location.hash.replace(/^#/, "") || "/";
  /* Nur Admin-Hub — die öffentliche Startseite bleibt ohne Tour und ohne Overlay. */
  if (hash !== "/admin" && hash !== "/admin/") return;
  try {
    if (localStorage.getItem(TOUR_DONE_KEY)) return;
    if (sessionStorage.getItem(TOUR_LATER_KEY)) return;
  } catch {
    return;
  }
  const consent = document.getElementById("consent-dialog");
  if (consent && !consent.hidden) {
    document.getElementById("consent-ok")?.addEventListener("click", () => maybeStartTour(), { once: true });
    return;
  }
  if (document.getElementById("help-tour-card") || tourBusy) return;
  startTour(0);
}

function startTour(index) {
  tourBusy = true;
  tourStep = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  drawTour();
}

/** Hash ohne führendes #, Default Startseite. */
function normalizeTourHash(hash) {
  const raw = String(hash || "#/").replace(/^#/, "");
  return raw || "/";
}

function drawTour() {
  const step = TOUR_STEPS[tourStep];
  const wanted = normalizeTourHash(step.route || "#/admin");
  const current = normalizeTourHash(location.hash || "#/");
  /* Alle Schritte liegen auf #/admin — bei abweichendem Hash dorthin, dann Spotlight. */
  if (wanted !== current) {
    location.hash = step.route || "#/admin";
    window.setTimeout(drawTour, 80);
    return;
  }
  clearTourDom();
  const backdrop = document.createElement("div");
  backdrop.className = "help-tour-backdrop";
  backdrop.id = "help-tour-backdrop";
  const card = document.createElement("div");
  card.className = "help-tour-card";
  card.id = "help-tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "help-tour-title");
  const n = TOUR_STEPS.length;
  card.innerHTML = `
    <h2 id="help-tour-title">${escapeHtml(step.title)}</h2>
    <p>${escapeHtml(step.body)}</p>
    <p class="help-tour-progress">Schritt ${tourStep + 1} von ${n}</p>
    <div class="help-tour-actions">
      <button type="button" class="btn ghost" data-tour="back" ${tourStep === 0 ? "disabled" : ""}>Zurück</button>
      <button type="button" class="btn primary" data-tour="next">${tourStep === n - 1 ? "Fertig" : "Weiter"}</button>
      <button type="button" class="btn ghost" data-tour="skip">Überspringen</button>
      <button type="button" class="btn ghost" data-tour="later">Später</button>
    </div>
  `;
  document.body.append(backdrop, card);
  const target = step.target ? document.querySelector(step.target) : null;
  if (target) {
    target.classList.add("help-tour-spotlight");
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  placeTourCard(card, target);
  card.querySelector("[data-tour='next']")?.focus();
  card.addEventListener("click", onTourClick);
  card.addEventListener("keydown", trapFocus);
}

function placeTourCard(card, target) {
  const pad = 16;
  let top = window.innerHeight / 2 - 120;
  let left = window.innerWidth / 2 - Math.min(224, window.innerWidth / 2 - pad);
  if (target) {
    const r = target.getBoundingClientRect();
    top = r.bottom + 12;
    left = Math.min(r.left, window.innerWidth - 320);
    if (top + 220 > window.innerHeight) top = Math.max(pad, r.top - 230);
  }
  card.style.top = `${Math.max(pad, top)}px`;
  card.style.left = `${Math.max(pad, left)}px`;
}

function onTourClick(ev) {
  const btn = ev.target.closest("[data-tour]");
  if (!btn) return;
  const act = btn.getAttribute("data-tour");
  if (act === "next") {
    if (tourStep >= TOUR_STEPS.length - 1) finishTour();
    else startTour(tourStep + 1);
  } else if (act === "back") {
    startTour(tourStep - 1);
  } else if (act === "skip") {
    finishTour();
  } else if (act === "later") {
    deferTour();
  }
}

function trapFocus(ev) {
  if (ev.key !== "Tab") return;
  const card = document.getElementById("help-tour-card");
  if (!card) return;
  const list = [...card.querySelectorAll("button:not([disabled])")];
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (ev.shiftKey && document.activeElement === first) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && document.activeElement === last) {
    ev.preventDefault();
    first.focus();
  }
}

function finishTour() {
  try {
    localStorage.setItem(TOUR_DONE_KEY, "1");
    sessionStorage.removeItem(TOUR_LATER_KEY);
  } catch {
    /* ignore */
  }
  closeTour();
}

function deferTour() {
  try {
    sessionStorage.setItem(TOUR_LATER_KEY, "1");
  } catch {
    /* ignore */
  }
  closeTour();
}

function closeTour() {
  tourBusy = false;
  clearTourDom();
  lastFocus?.focus?.();
  lastFocus = null;
}

function clearTourDom() {
  document.getElementById("help-tour-backdrop")?.remove();
  document.getElementById("help-tour-card")?.remove();
  document.querySelectorAll(".help-tour-spotlight").forEach((el) => el.classList.remove("help-tour-spotlight"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { explainError, TOUR_DONE_KEY, FEEDBACK_KEY, installHelp };

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installHelp);
  else installHelp();
}
