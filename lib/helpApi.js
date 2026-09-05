/**
 * REST-Handler für rollenbasierte Hilfe (/api/help/…).
 * Öffentlich erreichbar, aber sessionbewusst (Cookie / ADMIN_SECRET).
 */

const helpCatalog = require("./helpCatalog");
const userService = require("./userService");

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

module.exports = { handleHelpApi };
