/**
 * Rollenlogik für die Pulse-Hilfe (CJS).
 * Mapping Auth-Rollen → Hilfe-Rollen (admin / presenter=Team / participant).
 * Keine DOM- oder Netzwerk-Abhängigkeit — wird von scripts/test-help.js getestet.
 */

/** Hilfe-Rollen in absteigender Berechtigung (Index 0 = niedrigste Sicht). */
const HELP_ROLE_RANK = {
  participant: 1,
  presenter: 2,
  admin: 3,
};

/**
 * Welche Artikel-Rollen bei einer Sichtbarkeits-Obergrenze sichtbar sind.
 * @param {string} ceilingRole admin | presenter | participant
 * @returns {string[]}
 */
function rolesAllowedForCeiling(ceilingRole) {
  const ceiling = normalizeHelpRoleId(ceilingRole) || "participant";
  if (ceiling === "admin") return ["admin", "presenter", "participant"];
  if (ceiling === "presenter") return ["presenter", "participant"];
  return ["participant"];
}

/**
 * Sichtbarkeits-Obergrenze aus Auth-Kontext (serverseitige Filterung Phase 2).
 * @param {{ user?: { role?: string } | null, viaSecret?: boolean, authEnabled?: boolean, adminRoute?: boolean }} ctx
 * @returns {'admin'|'presenter'|'participant'}
 */
function resolveViewerCeiling(ctx = {}) {
  const viewerRole = resolveHelpRoleFromAuth(ctx);
  if (viewerRole === "admin") return "admin";
  if (viewerRole === "presenter") return "presenter";
  return "participant";
}

/**
 * Artikel für die Sichtbarkeits-Obergrenze freigeben (Hierarchie, nicht nur exakter Filter).
 * @param {object} article
 * @param {string} ceilingRole
 * @returns {boolean}
 */
function articleVisibleToViewer(article, ceilingRole) {
  const allowed = rolesAllowedForCeiling(ceilingRole);
  const articleRoles = normalizeArticleRoles(article?.roles);
  return articleRoles.some((role) => allowed.includes(role));
}

/**
 * Rollenfilter aus Query an Obergrenze kappen (z. B. Presenter darf nicht admin filtern).
 * @param {string} ceilingRole
 * @param {string} requestedRole
 * @returns {string}
 */
function clampFilterRole(ceilingRole, requestedRole) {
  const ceiling = normalizeHelpRoleId(ceilingRole) || "participant";
  const requested = normalizeHelpRoleId(requestedRole);
  if (!requested) return "";
  const cRank = HELP_ROLE_RANK[ceiling] || 1;
  const rRank = HELP_ROLE_RANK[requested] || 0;
  if (!rRank || rRank > cRank) return "";
  return requested;
}

/** Aliase aus articles.json oder Legacy-Auth auf kanonische Hilfe-Rollen. */
const ROLE_ALIASES = {
  team: "presenter",
  editor: "presenter",
  viewer: "presenter",
  teamleader: "presenter",
  teammember: "presenter",
};

/**
 * Einzelne Rolle normalisieren (Kleinbuchstaben, Aliase auflösen).
 * @param {unknown} role
 * @returns {string}
 */
function normalizeHelpRoleId(role) {
  const id = String(role || "")
    .trim()
    .toLowerCase();
  if (!id) return "";
  return ROLE_ALIASES[id] || id;
}

/**
 * Artikel-Rollen als Set kanonischer Hilfe-Rollen (admin, presenter, participant).
 * @param {unknown} roles
 * @returns {string[]}
 */
function normalizeArticleRoles(roles) {
  const out = new Set();
  for (const raw of Array.isArray(roles) ? roles : []) {
    const id = normalizeHelpRoleId(raw);
    if (id === "admin" || id === "presenter" || id === "participant") out.add(id);
  }
  return [...out];
}

/**
 * Hilfe-Rolle aus Auth-Kontext ableiten (reine Funktion, ohne fetch).
 * @param {{ user?: { role?: string } | null, viaSecret?: boolean, authEnabled?: boolean, adminRoute?: boolean }} ctx
 * @returns {string} '' | 'participant' | 'presenter' | 'admin'
 */
function resolveHelpRoleFromAuth(ctx = {}) {
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

/**
 * Welche Rollen-Filter-Buttons für die aktuelle Sicht sinnvoll sind.
 * Admin sieht alle; Team sieht Team+Teilnehmer; Gäste nur Teilnehmer (+ Alle).
 * @param {string} viewerRole Kanonische Hilfe-Rolle oder leer (Gast auf Admin-Hilfe).
 * @returns {string[]} Rollen-IDs für Buttons (inkl. '' = Alle).
 */
function getVisibleRoleFilterIds(viewerRole) {
  const role = normalizeHelpRoleId(viewerRole);
  if (role === "admin") return ["", "participant", "presenter", "admin"];
  if (role === "presenter") return ["", "participant", "presenter"];
  if (role === "participant") return ["", "participant"];
  return ["", "participant", "presenter", "admin"];
}

/**
 * Prüft, ob ein Artikel zum gewählten Rollenfilter passt (exakter Match auf kanonische Rollen).
 * @param {object} article
 * @param {string} filterRole
 * @returns {boolean}
 */
function articleMatchesHelpRole(article, filterRole) {
  const want = normalizeHelpRoleId(filterRole);
  if (!want) return true;
  const have = normalizeArticleRoles(article?.roles);
  return have.includes(want);
}

/**
 * Badge-Metadaten für die Artikelliste (max. eine Badge pro Artikel-Rolle).
 * @param {object} article
 * @returns {{ id: string, label: string, className: string }[]}
 */
function getRoleBadgeDefs(article) {
  const roles = normalizeArticleRoles(article?.roles);
  const badges = [];
  if (roles.includes("admin")) badges.push({ id: "admin", label: "Admin", className: "badge-admin" });
  if (roles.includes("presenter")) badges.push({ id: "presenter", label: "Team", className: "badge-team" });
  if (roles.includes("participant")) badges.push({ id: "participant", label: "Teilnehmer", className: "badge-participant" });
  return badges;
}

/**
 * Artikel nach Katalog-Kategorien gruppieren (Reihenfolge aus categories[]).
 * @param {object[]} articles
 * @param {{ id: string, label?: string, icon?: string }[]} categories
 * @returns {{ category: { id: string, label: string, icon?: string }, articles: object[] }[]}
 */
function groupArticlesByCategory(articles, categories) {
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
    groups.push({
      category: { id: "_other", label: "Sonstiges" },
      articles: orphan,
    });
  }
  return groups;
}

module.exports = {
  HELP_ROLE_RANK,
  normalizeHelpRoleId,
  normalizeArticleRoles,
  resolveHelpRoleFromAuth,
  resolveViewerCeiling,
  rolesAllowedForCeiling,
  articleVisibleToViewer,
  clampFilterRole,
  getVisibleRoleFilterIds,
  articleMatchesHelpRole,
  getRoleBadgeDefs,
  groupArticlesByCategory,
};
