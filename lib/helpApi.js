/**
 * REST-Handler für rollenbasierte Hilfe (/api/help/…).
 * Öffentlich erreichbar, aber sessionbewusst (Cookie / ADMIN_SECRET).
 */

const helpCatalog = require("./helpCatalog");
const userService = require("./userService");

/**
 * Geschützte statische Hilfe-Pfade (/help/articles.json, /help/*.html).
 * @param {object} ctx — { req, res, url, send, getAuth, userDb }
 * @returns {Promise<boolean>} true wenn Antwort bereits gesendet wurde
 */
async function handleHelpStatic(ctx) {
  const { req, res, url, send, getAuth, userDb } = ctx;
  const pathname = url.pathname;

  const isArticlesJson = pathname === "/help/articles.json";
  const isHelpHtml = /^\/help\/(?:guides\/)?[a-z0-9-]+\.html$/i.test(pathname);
  if (!isArticlesJson && !isHelpHtml) return false;

  const auth = await getAuth(req, {});
  const authEnabled = userService.isUserManagementEnabled(userDb);
  const access = helpCatalog.checkHelpStaticAccess(auth, pathname, { authEnabled });

  if (!access.ok) {
    send(res, access.status, { error: access.error });
    return true;
  }

  if (access.kind === "catalog") {
    const payload = helpCatalog.buildHelpArticlesResponse(auth, { authEnabled, adminRoute: false });
    const { cached, ...body } = payload;
    send(res, 200, body);
    return true;
  }

  if (access.kind === "html") {
    return false;
  }

  return false;
}

/**
 * @param {object} ctx — { req, res, parts, send, getAuth, userDb, url }
 * @returns {Promise<boolean>}
 */
async function handleHelpApi(ctx) {
  const { req, res, parts, send, getAuth, userDb, url } = ctx;

  if (parts[1] !== "help") return false;

  if (req.method !== "GET") {
    send(res, 405, { error: "Nur GET erlaubt" });
    return true;
  }

  const auth = await getAuth(req, {});
  const authEnabled = userService.isUserManagementEnabled(userDb);
  const adminRoute = url.searchParams.get("adminRoute") === "1";
  const role = url.searchParams.get("role") || "";
  const opts = { authEnabled, adminRoute, role };

  /* GET /api/help/articles/:id — Zugriff auf einen Metadaten-Eintrag */
  if (parts[2] === "articles" && parts[3]) {
    const access = helpCatalog.resolveHelpArticleAccess(auth, parts[3], opts);
    if (!access.ok) {
      send(res, access.status, { error: access.error });
      return true;
    }
    send(res, 200, {
      article: access.article,
      viewerRole: access.viewerRole,
      ceilingRole: access.ceilingRole,
      source: "api",
    });
    return true;
  }

  /* GET /api/help/articles — gefilterter Katalog */
  if (parts[2] === "articles" && parts.length === 3) {
    const payload = helpCatalog.buildHelpArticlesResponse(auth, opts);
    send(res, 200, payload);
    return true;
  }

  return false;
}

module.exports = { handleHelpApi, handleHelpStatic };
