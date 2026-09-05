/**
 * Hilfe-Katalog laden, serverseitig nach Rolle filtern und pro Sichtbarkeitsstufe cachen.
 * Phase 2: echte Zugriffskontrolle auf Metadaten (nicht nur Frontend-Filter).
 */

const fs = require("fs");
const path = require("path");
const {
  resolveHelpRoleFromAuth,
  resolveViewerCeiling,
  articleVisibleToViewer,
  articleMatchesHelpRole,
  clampFilterRole,
  getVisibleRoleFilterIds,
} = require("./helpRoles");

const CATALOG_PATH = path.join(__dirname, "../frontend/help/articles.json");
/** TTL für gefilterte Katalog-Snapshots pro Obergrenze + Filter. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {{ mtimeMs: number, raw: object | null }} */
const catalogState = { mtimeMs: 0, raw: null };

/** @type {Map<string, { at: number, mtimeMs: number, payload: object }>} */
const roleCache = new Map();

/**
 * Rohen Katalog von der Platte laden (mtime-Cache, invalidiert roleCache bei Änderung).
 * @returns {object}
 */
function loadRawCatalog() {
  const stat = fs.statSync(CATALOG_PATH);
  if (catalogState.raw && catalogState.mtimeMs === stat.mtimeMs) {
    return catalogState.raw;
  }
  catalogState.raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  catalogState.mtimeMs = stat.mtimeMs;
  roleCache.clear();
  return catalogState.raw;
}

/** Test-Hilfe: In-Memory-Caches leeren. */
function resetHelpCatalogCache() {
  catalogState.mtimeMs = 0;
  catalogState.raw = null;
  roleCache.clear();
}

/**
 * Hilfe-Katalog für einen Auth-Kontext aufbereiten.
 * @param {object} auth — { user, viaSecret } von authApi.resolveRequestAuth
 * @param {{ authEnabled?: boolean, adminRoute?: boolean, role?: string }} opts
 * @returns {object}
 */
function buildHelpArticlesResponse(auth, opts = {}) {
  const raw = loadRawCatalog();
  const authEnabled = Boolean(opts.authEnabled);
  const adminRoute = Boolean(opts.adminRoute);
  const requestedRole = String(opts.role || "");

  const authCtx = {
    user: auth?.user || null,
    viaSecret: Boolean(auth?.viaSecret),
    authEnabled,
    adminRoute,
  };

  const viewerRole = resolveHelpRoleFromAuth(authCtx);
  const ceilingRole = resolveViewerCeiling(authCtx);
  const filterRole = clampFilterRole(ceilingRole, requestedRole);

  const cacheKey = `v${raw.version}:${ceilingRole}:${filterRole}`;
  const hit = roleCache.get(cacheKey);
  if (hit && hit.mtimeMs === catalogState.mtimeMs && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.payload, cached: true };
  }

  let articles = (raw.articles || []).filter((article) => articleVisibleToViewer(article, ceilingRole));
  if (filterRole) {
    articles = articles.filter((article) => articleMatchesHelpRole(article, filterRole));
  }

  const visibleRoleIds = new Set(getVisibleRoleFilterIds(viewerRole || ceilingRole));
  const roles = (raw.roles || []).filter((row) => visibleRoleIds.has(row.id || ""));

  const payload = {
    version: raw.version,
    app: raw.app,
    appVersion: raw.appVersion,
    categories: raw.categories || [],
    roles,
    articles,
    viewerRole: viewerRole || ceilingRole,
    ceilingRole,
    filterRole: filterRole || "",
    source: "api",
  };

  roleCache.set(cacheKey, { at: Date.now(), mtimeMs: catalogState.mtimeMs, payload });
  return { ...payload, cached: false };
}

/**
 * Einzelnen Artikel im gefilterten Kontext suchen (403 wenn nicht sichtbar).
 * @param {object} auth
 * @param {string} articleId
 * @param {object} opts
 * @returns {{ ok: true, article: object, viewerRole: string } | { ok: false, status: number, error: string }}
 */
function resolveHelpArticleAccess(auth, articleId, opts = {}) {
  const id = String(articleId || "").trim();
  if (!id) {
    return { ok: false, status: 400, error: "Artikel-ID fehlt" };
  }
  const payload = buildHelpArticlesResponse(auth, opts);
  const article = payload.articles.find((row) => row.id === id || row.slug === id);
  if (!article) {
    return { ok: false, status: 403, error: "Kein Zugriff auf diesen Hilfe-Artikel" };
  }
  return { ok: true, article, viewerRole: payload.viewerRole, ceilingRole: payload.ceilingRole };
}

module.exports = {
  CATALOG_PATH,
  CACHE_TTL_MS,
  loadRawCatalog,
  resetHelpCatalogCache,
  buildHelpArticlesResponse,
  resolveHelpArticleAccess,
};
