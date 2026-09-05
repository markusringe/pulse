/**
 * Gemeinsame Hilfe-Suche (CJS).
 * Wird von scripts/test-help.js genutzt. Die Frontend-Kopie in
 * frontend/js/help.js muss dasselbe Filter-/Highlight-Verhalten haben.
 *
 * Rollenlogik: lib/helpRoles.js (ESM-Spiegel: frontend/js/helpRoles.js).
 * Keine DOM-Abhängigkeit, keine Netzwerkaufrufe.
 */

const { articleMatchesHelpRole, groupArticlesByCategory } = require("./helpRoles");

/**
 * HTML-Sonderzeichen escapen, bevor Suchbegriffe als <mark> eingefügt werden.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Suchanfrage in Tokens zerlegen (Mindestlänge 2, Kleinbuchstaben).
 * @param {unknown} query
 * @returns {string[]}
 */
function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Durchsuchbaren Text eines Artikels bauen (Titel, Tags, Fließtext).
 * @param {object} article
 * @returns {string}
 */
function articleBlob(article) {
  if (!article || typeof article !== "object") return "";
  const tags = Array.isArray(article.tags) ? article.tags.join(" ") : "";
  const roles = Array.isArray(article.roles) ? article.roles.join(" ") : "";
  return [
    article.id,
    article.slug,
    article.title,
    article.titleEn,
    article.titleFr,
    article.summary,
    article.bodyText,
    article.category,
    roles,
    tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Artikel nach Freitext und optionaler Kategorie filtern.
 * Alle Tokens müssen vorkommen (UND-Suche). Kategorie ist exakter Match.
 *
 * @param {object[]} articles
 * @param {{ query?: string, category?: string, role?: string }} [opts]
 * @returns {object[]}
 */
function filterArticles(articles, opts = {}) {
  const list = Array.isArray(articles) ? articles : [];
  const category = String(opts.category || "")
    .trim()
    .toLowerCase();
  const role = String(opts.role || "")
    .trim()
    .toLowerCase();
  const tokens = tokenize(opts.query);

  return list.filter((article) => {
    if (category && String(article.category || "").toLowerCase() !== category) {
      return false;
    }
    if (role && !articleMatchesHelpRole(article, role)) return false;
    if (!tokens.length) return true;
    const blob = articleBlob(article);
    return tokens.every((tok) => blob.includes(tok));
  });
}

/**
 * Treffer in einem Text mit <mark> hervorheben. HTML im Quelltext wird escaped.
 * @param {unknown} text
 * @param {unknown} query
 * @returns {string}
 */
function highlightText(text, query) {
  const safe = escapeHtml(text);
  const tokens = tokenize(query);
  if (!tokens.length) return safe;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("(" + escaped.join("|") + ")", "gi");
  return safe.replace(re, "<mark>$1</mark>");
}

/**
 * Kategorien in der Reihenfolge des ersten Auftretens sammeln.
 * @param {object[]} articles
 * @returns {string[]}
 */
function listCategories(articles) {
  const seen = [];
  for (const article of Array.isArray(articles) ? articles : []) {
    const cat = String(article.category || "").trim();
    if (cat && !seen.includes(cat)) seen.push(cat);
  }
  return seen;
}

module.exports = {
  escapeHtml,
  tokenize,
  articleBlob,
  filterArticles,
  highlightText,
  listCategories,
  groupArticlesByCategory,
};
