/**
 * Rollenlogik für die Pulse-Hilfe (ESM, Browser).
 * Muss dasselbe Verhalten wie lib/helpRoles.js haben — Änderungen bitte in beiden Dateien spiegeln.
 */

/** Hilfe-Rollen in absteigender Berechtigung. */
export const HELP_ROLE_RANK = {
  participant: 1,
  presenter: 2,
  admin: 3,
};

const ROLE_ALIASES = {
  team: "presenter",
  editor: "presenter",
  viewer: "presenter",
  teamleader: "presenter",
  teammember: "presenter",
};

/** @param {unknown} role */
export function normalizeHelpRoleId(role) {
  const id = String(role || "")
    .trim()
    .toLowerCase();
  if (!id) return "";
  return ROLE_ALIASES[id] || id;
}

/** @param {unknown} roles */
export function normalizeArticleRoles(roles) {
  const out = new Set();
  for (const raw of Array.isArray(roles) ? roles : []) {
    const id = normalizeHelpRoleId(raw);
    if (id === "admin" || id === "presenter" || id === "participant") out.add(id);
  }
  return [...out];
}

/**
 * Hilfe-Rolle aus Auth-Kontext ableiten.
 * @param {{ user?: { role?: string } | null, viaSecret?: boolean, authEnabled?: boolean, adminRoute?: boolean }} ctx
 */
export function resolveHelpRoleFromAuth(ctx = {}) {
  const user = ctx.user || null;
  const viaSecret = Boolean(ctx.viaSecret);
  const authEnabled = Boolean(ctx.authEnabled);
  const adminRoute = Boolean(ctx.adminRoute);

  if (viaSecret) return "admin";
  if (user?.role === "admin") return "admin";
  if (user && ["editor", "teamleader", "teammember"].includes(user.role)) return "presenter";
  if (user?.role === "viewer") return "presenter";
  if (!adminRoute) return "participant";
  if (authEnabled && !user && !viaSecret) return "";
  return "participant";
}

/** @param {string} viewerRole */
export function getVisibleRoleFilterIds(viewerRole) {
  const role = normalizeHelpRoleId(viewerRole);
  if (role === "admin") return ["", "participant", "presenter", "admin"];
  if (role === "presenter") return ["", "participant", "presenter"];
  if (role === "participant") return ["", "participant"];
  return ["", "participant", "presenter", "admin"];
}

/** @param {object} article @param {string} filterRole */
export function articleMatchesHelpRole(article, filterRole) {
  const want = normalizeHelpRoleId(filterRole);
  if (!want) return true;
  return normalizeArticleRoles(article?.roles).includes(want);
}

/** @param {object} article */
export function getRoleBadgeDefs(article) {
  const roles = normalizeArticleRoles(article?.roles);
  const badges = [];
  if (roles.includes("admin")) badges.push({ id: "admin", label: "Admin", className: "badge-admin" });
  if (roles.includes("presenter")) badges.push({ id: "presenter", label: "Team", className: "badge-team" });
  if (roles.includes("participant")) badges.push({ id: "participant", label: "Teilnehmer", className: "badge-participant" });
  return badges;
}

/** @param {object[]} articles @param {object[]} categories */
export function groupArticlesByCategory(articles, categories) {
  const list = Array.isArray(articles) ? articles : [];
  const catDefs = Array.isArray(categories) ? categories : [];
  const groups = [];
  const usedCats = new Set();

  for (const cat of catDefs) {
    const id = String(cat?.id || "").trim();
    if (!id) continue;
    const items = list.filter((a) => String(a?.category || "") === id);
    if (!items.length) continue;
    groups.push({
      category: { id, label: cat.label || id, icon: cat.icon },
      articles: items,
    });
    usedCats.add(id);
  }

  const orphan = list.filter((a) => !usedCats.has(String(a?.category || "")));
  if (orphan.length) {
    groups.push({ category: { id: "_other", label: "Sonstiges" }, articles: orphan });
  }
  return groups;
}
