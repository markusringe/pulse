/**
 * Backup-Gruppen — strukturiert wie die Bereiche der Admin-Navigation.
 * Jede Gruppe mappt auf Dateien und/oder SQLite-Tabellen in pulse.db.
 */

/** @typedef {'file'|'dir'|'db_tables'|'env'} BackupItemKind */

/**
 * Alle wiederherstellbaren Bereiche (IDs für API und Installer).
 * @type {Array<{ id: string, label: string, adminNav: string, description?: string, kind: BackupItemKind, files?: string[], dirs?: string[], tables?: string[], rootFile?: boolean }>}
 */
const BACKUP_ITEMS = [
  {
    id: "db_sessions",
    label: "Live-Sessions (Umfragen, Folien, Antworten)",
    adminNav: "sessions",
    kind: "db_tables",
    tables: ["sessions"],
    description: "Laufende und gespeicherte Umfrage-Sessions in der Datenbank",
  },
  {
    id: "events_json",
    label: "Event-Stammdaten",
    adminNav: "events",
    kind: "file",
    files: ["events.json"],
    description: "Veranstaltungskatalog (Titel, Zeitraum, Join-Codes)",
  },
  {
    id: "db_event_access",
    label: "Event-Zugriffe & Team-Freigaben",
    adminNav: "events",
    kind: "db_tables",
    tables: ["user_event_access", "event_team_access"],
    description: "Nutzer- und Team-Berechtigungen pro Event",
  },
  {
    id: "db_teams",
    label: "Teams und Mitglieder",
    adminNav: "teams",
    kind: "db_tables",
    tables: ["teams", "team_members"],
    description: "Team-Struktur und Zugehörigkeiten",
  },
  {
    id: "db_users",
    label: "Benutzer & Anmeldung",
    adminNav: "users",
    kind: "db_tables",
    tables: ["users", "auth_pins", "auth_sessions", "auth_settings"],
    description: "Instanz-Benutzer, PINs und Admin-Sitzungen",
  },
  {
    id: "branding",
    label: "Branding & Erscheinungsbild",
    adminNav: "branding",
    kind: "file",
    files: ["branding.json"],
  },
  {
    id: "privacy",
    label: "Datenschutz & Impressum",
    adminNav: "privacy",
    kind: "file",
    files: ["privacy.json", "privacy-versions.json"],
  },
  {
    id: "ssl",
    label: "SSL-Zertifikate",
    adminNav: "ssl",
    kind: "dir",
    dirs: ["ssl"],
  },
  {
    id: "email",
    label: "E-Mail-Versand",
    adminNav: "email",
    kind: "file",
    files: ["email-config.json"],
  },
  {
    id: "settings_ops",
    label: "Betrieb (Audit, Backup-/Update-Konfiguration)",
    adminNav: "settings",
    kind: "file",
    files: ["audit.json", "backup-config.json", "updates-state.json"],
  },
  {
    id: "uploads",
    label: "Hochgeladene Dateien",
    adminNav: "settings",
    kind: "dir",
    dirs: ["uploads"],
  },
  {
    id: "env",
    label: "Umgebungsdatei (.env)",
    adminNav: "settings",
    kind: "env",
    files: [".env"],
    rootFile: true,
  },
];

/** Admin-Navigation → Abschnittsüberschrift */
const NAV_LABELS = {
  sessions: "Sessions",
  events: "Events",
  teams: "Teams",
  users: "Benutzer",
  branding: "Branding",
  privacy: "Datenschutz",
  ssl: "SSL",
  email: "E-Mail",
  settings: "Einstellungen & Betrieb",
  backups: "Backups",
  updates: "Updates",
};

/**
 * Gruppen für UI/API: nach Admin-Nav gruppiert.
 * @returns {Array<{ nav: string, label: string, items: typeof BACKUP_ITEMS }>}
 */
function getGroupedCatalog() {
  const order = ["sessions", "events", "teams", "users", "branding", "privacy", "ssl", "email", "settings"];
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const item of BACKUP_ITEMS) {
    const nav = item.adminNav;
    if (!map.has(nav)) {
      map.set(nav, { nav, label: NAV_LABELS[nav] || nav, items: [] });
    }
    map.get(nav).items.push({
      id: item.id,
      label: item.label,
      description: item.description || "",
      kind: item.kind,
    });
  }
  return order.filter((k) => map.has(k)).map((k) => map.get(k));
}

/**
 * Item-Definition anhand ID.
 * @param {string} id
 */
function getItemById(id) {
  return BACKUP_ITEMS.find((i) => i.id === id) || null;
}

/**
 * Alle Item-IDs (für „alles auswählen“).
 * @returns {string[]}
 */
function allItemIds() {
  return BACKUP_ITEMS.map((i) => i.id);
}

/**
 * Prüft, welche Gruppen in einem entpackten Backup-Verzeichnis vorhanden sind.
 * @param {string} extractedDir
 * @returns {Record<string, boolean>}
 */
function detectAvailableInDir(extractedDir) {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const item of BACKUP_ITEMS) {
    out[item.id] = itemPresentInDir(extractedDir, item);
  }
  return out;
}

/**
 * @param {string} dir
 * @param {object} item
 */
function itemPresentInDir(dir, item) {
  if (item.kind === "db_tables") {
    const dbPath = pathJoin(dir, "pulse.db");
    if (!fsExists(dbPath)) return false;
    try {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath, { readonly: true });
      for (const table of item.tables || []) {
        const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!row) {
          db.close();
          return false;
        }
      }
      db.close();
      return true;
    } catch {
      return false;
    }
  }
  if (item.kind === "env" || item.rootFile) {
    return fsExists(pathJoin(dir, item.files[0]));
  }
  if (item.kind === "file") {
    return (item.files || []).some((f) => fsExists(pathJoin(dir, f)));
  }
  if (item.kind === "dir") {
    return (item.dirs || []).some((d) => fsExists(pathJoin(dir, d)));
  }
  return false;
}

function pathJoin(a, b) {
  return require("path").join(a, b);
}

function fsExists(p) {
  try {
    return require("fs").existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Ausgewählte Gruppen in konkrete Restore-Aktionen auflösen.
 * @param {string[]} groupIds
 */
function resolveSelection(groupIds) {
  const ids = normalizeGroupIds(groupIds);
  if (ids.includes("all")) {
    return { full: true, items: BACKUP_ITEMS, tables: collectAllTables(), files: collectAllFiles(), dirs: collectAllDirs(), includeEnv: true };
  }
  const items = ids.map(getItemById).filter(Boolean);
  const tables = [...new Set(items.flatMap((i) => i.tables || []))];
  const files = [...new Set(items.flatMap((i) => (i.kind === "file" ? i.files || [] : [])))];
  const dirs = [...new Set(items.flatMap((i) => (i.kind === "dir" ? i.dirs || [] : [])))];
  const includeEnv = items.some((i) => i.kind === "env");
  return { full: false, items, tables, files, dirs, includeEnv };
}

function collectAllTables() {
  return [...new Set(BACKUP_ITEMS.flatMap((i) => i.tables || []))];
}

function collectAllFiles() {
  return [...new Set(BACKUP_ITEMS.filter((i) => i.kind === "file").flatMap((i) => i.files || []))];
}

function collectAllDirs() {
  return [...new Set(BACKUP_ITEMS.filter((i) => i.kind === "dir").flatMap((i) => i.dirs || []))];
}

/**
 * @param {string[]|undefined|null} groupIds
 * @returns {string[]}
 */
function normalizeGroupIds(groupIds) {
  if (!groupIds || !groupIds.length) return ["all"];
  return groupIds.map((g) => String(g).trim()).filter(Boolean);
}

module.exports = {
  BACKUP_ITEMS,
  getGroupedCatalog,
  getItemById,
  allItemIds,
  detectAvailableInDir,
  resolveSelection,
  normalizeGroupIds,
};
