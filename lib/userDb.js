/**
 * Persistenz für Benutzerverwaltung, PINs und Admin-Sitzungen.
 * Nutzt dieselbe SQLite-Datei wie Session-Storage (SQLITE_PATH) oder PostgreSQL.
 * JSON-Fallback der Session-DB unterstützt keine Benutzerverwaltung.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  comment_text TEXT DEFAULT '',
  created_at BIGINT NOT NULL,
  last_login_at BIGINT,
  last_pin_request_at BIGINT,
  last_password_change_at BIGINT,
  must_change_password INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS auth_pins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  ip_hash TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  ip_hash TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  persistent INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS user_event_access (
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  access_role TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id, access_role)
);
CREATE INDEX IF NOT EXISTS idx_auth_pins_user ON auth_pins(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  leader_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teammember',
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE TABLE IF NOT EXISTS event_team_access (
  event_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'view',
  PRIMARY KEY (event_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_event_team_access_event ON event_team_access(event_id);
`;

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function createUserDb() {
  const pgUrl = process.env.DATABASE_URL || "";
  if (pgUrl.startsWith("postgres")) {
    try {
      return require("./userDbPg").createUserDbPg(pgUrl);
    } catch (err) {
      console.warn("[userDb] PostgreSQL nicht verfügbar:", err.message);
    }
  }
  return createUserDbSqlite();
}

function createUserDbSqlite() {
  const file = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "pulse.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(SCHEMA_SQL);
    /* Migration: Step-up-Zeitstempel für privilegierte Admin-Aktionen */
    try {
      db.exec("ALTER TABLE auth_sessions ADD COLUMN step_up_until BIGINT");
    } catch {
      /* Spalte existiert bereits */
    }

    const api = {
      kind: "sqlite",
      supported: true,
      newId,
      getSetting(key) {
        const row = db.prepare("SELECT value FROM auth_settings WHERE key = ?").get(key);
        return row ? row.value : null;
      },
      setSetting(key, value) {
        db.prepare("INSERT OR REPLACE INTO auth_settings (key, value) VALUES (?, ?)").run(key, String(value));
      },
      getAllSettings() {
        const rows = db.prepare("SELECT key, value FROM auth_settings").all();
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
      },
      insertUser(row) {
        db.prepare(
          `INSERT INTO users (id, display_name, email, password_hash, role, status, comment_text,
            created_at, last_login_at, last_pin_request_at, last_password_change_at, must_change_password)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          row.id,
          row.displayName,
          row.email,
          row.passwordHash,
          row.role,
          row.status,
          row.comment || "",
          row.createdAt,
          row.lastLoginAt || null,
          row.lastPinRequestAt || null,
          row.lastPasswordChangeAt || null,
          row.mustChangePassword ? 1 : 0
        );
      },
      updateUser(id, patch) {
        const cur = api.findUserById(id);
        if (!cur) return null;
        const next = { ...cur, ...patch };
        db.prepare(
          `UPDATE users SET display_name=?, email=?, password_hash=?, role=?, status=?, comment_text=?,
            last_login_at=?, last_pin_request_at=?, last_password_change_at=?, must_change_password=?
           WHERE id=?`
        ).run(
          next.displayName,
          next.email,
          next.passwordHash,
          next.role,
          next.status,
          next.comment || "",
          next.lastLoginAt || null,
          next.lastPinRequestAt || null,
          next.lastPasswordChangeAt || null,
          next.mustChangePassword ? 1 : 0,
          id
        );
        return api.findUserById(id);
      },
      findUserById(id) {
        const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
        return r ? mapUser(r) : null;
      },
      findUserByEmail(email) {
        const r = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email));
        return r ? mapUser(r) : null;
      },
      listUsers(filters = {}) {
        let sql = "SELECT * FROM users WHERE 1=1";
        const params = [];
        if (filters.role) {
          sql += " AND role = ?";
          params.push(filters.role);
        }
        if (filters.status) {
          sql += " AND status = ?";
          params.push(filters.status);
        }
        if (filters.q) {
          sql += " AND (display_name LIKE ? OR email LIKE ?)";
          const like = `%${filters.q}%`;
          params.push(like, like);
        }
        sql += " ORDER BY display_name COLLATE NOCASE ASC";
        return db.prepare(sql).all(...params).map(mapUser);
      },
      deleteUser(id) {
        db.prepare("DELETE FROM user_event_access WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM auth_pins WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM users WHERE id = ?").run(id);
      },
      insertPin(row) {
        db.prepare(
          "INSERT INTO auth_pins (id, user_id, pin_hash, created_at, expires_at, used_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(row.id, row.userId, row.pinHash, row.createdAt, row.expiresAt, row.usedAt || null, row.ipHash || "");
      },
      findActivePin(userId) {
        const now = Date.now();
        const r = db
          .prepare(
            "SELECT * FROM auth_pins WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
          )
          .get(userId, now);
        return r ? mapPin(r) : null;
      },
      markPinUsed(id, usedAt) {
        db.prepare("UPDATE auth_pins SET used_at = ? WHERE id = ?").run(usedAt, id);
      },
      expirePinsForUser(userId) {
        db.prepare("UPDATE auth_pins SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(Date.now(), userId);
      },
      sweepExpiredPins() {
        db.prepare("DELETE FROM auth_pins WHERE expires_at < ? OR used_at IS NOT NULL").run(Date.now() - 86400000);
      },
      insertSession(row) {
        db.prepare(
          `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip_hash, user_agent, persistent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          row.id,
          row.userId,
          row.tokenHash,
          row.createdAt,
          row.expiresAt,
          row.lastSeenAt,
          row.ipHash || "",
          row.userAgent || "",
          row.persistent ? 1 : 0
        );
      },
      findSessionByTokenHash(tokenHash) {
        const r = db.prepare("SELECT * FROM auth_sessions WHERE token_hash = ?").get(tokenHash);
        return r ? mapSession(r) : null;
      },
      touchSession(id, lastSeenAt) {
        db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(lastSeenAt, id);
      },
      updateSessionStepUp(id, stepUpUntil) {
        db.prepare("UPDATE auth_sessions SET step_up_until = ? WHERE id = ?").run(stepUpUntil, id);
      },
      revokeSession(id) {
        db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(id);
      },
      revokeSessionsForUser(userId) {
        db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
      },
      listSessionsForUser(userId) {
        return db.prepare("SELECT * FROM auth_sessions WHERE user_id = ? ORDER BY last_seen_at DESC").all(userId).map(mapSession);
      },
      sweepExpiredSessions() {
        db.prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(Date.now());
      },
      setEventAccess(userId, eventId, accessRole) {
        db.prepare(
          "INSERT OR IGNORE INTO user_event_access (user_id, event_id, access_role) VALUES (?, ?, ?)"
        ).run(userId, eventId, accessRole);
      },
      removeEventAccess(userId, eventId, accessRole) {
        db.prepare("DELETE FROM user_event_access WHERE user_id = ? AND event_id = ? AND access_role = ?").run(
          userId,
          eventId,
          accessRole
        );
      },
      clearEventAccess(eventId) {
        db.prepare("DELETE FROM user_event_access WHERE event_id = ?").run(eventId);
      },
      listEventAccess(eventId) {
        return db
          .prepare("SELECT user_id, event_id, access_role FROM user_event_access WHERE event_id = ?")
          .all(eventId);
      },
      listUserEventAccess(userId) {
        return db
          .prepare("SELECT user_id, event_id, access_role FROM user_event_access WHERE user_id = ?")
          .all(userId);
      },
      /* —— Teams —— */
      insertTeam(row) {
        db.prepare(
          `INSERT INTO teams (id, name, description, leader_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(row.id, row.name, row.description || "", row.leaderId, row.createdAt, row.updatedAt);
      },
      findTeamById(id) {
        const r = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
        return r ? mapTeam(r) : null;
      },
      updateTeam(id, patch) {
        const cur = api.findTeamById(id);
        if (!cur) return null;
        const next = { ...cur, ...patch, updatedAt: Date.now() };
        db.prepare("UPDATE teams SET name=?, description=?, leader_id=?, updated_at=? WHERE id=?").run(
          next.name,
          next.description || "",
          next.leaderId,
          next.updatedAt,
          id
        );
        return api.findTeamById(id);
      },
      deleteTeam(id) {
        db.prepare("DELETE FROM team_members WHERE team_id = ?").run(id);
        db.prepare("DELETE FROM event_team_access WHERE team_id = ?").run(id);
        db.prepare("DELETE FROM teams WHERE id = ?").run(id);
      },
      listAllTeams() {
        return db
          .prepare(
            `SELECT t.*, COUNT(tm.user_id) AS member_count
             FROM teams t
             LEFT JOIN team_members tm ON t.id = tm.team_id
             GROUP BY t.id
             ORDER BY t.name COLLATE NOCASE ASC`
          )
          .all()
          .map(mapTeamWithCount);
      },
      listTeamsForUser(userId) {
        return db
          .prepare(
            `SELECT t.*, tm.role AS member_role, COUNT(tm2.user_id) AS member_count
             FROM teams t
             JOIN team_members tm ON t.id = tm.team_id AND tm.user_id = ?
             LEFT JOIN team_members tm2 ON t.id = tm2.team_id
             GROUP BY t.id, tm.role
             ORDER BY t.name COLLATE NOCASE ASC`
          )
          .all(userId)
          .map(mapTeamWithCount);
      },
      listUserTeamIds(userId) {
        return db.prepare("SELECT team_id FROM team_members WHERE user_id = ?").all(userId).map((r) => r.team_id);
      },
      addTeamMember(teamId, userId, role = "teammember") {
        db.prepare(
          `INSERT OR REPLACE INTO team_members (team_id, user_id, role, joined_at)
           VALUES (?, ?, ?, ?)`
        ).run(teamId, userId, role, Date.now());
      },
      removeTeamMember(teamId, userId) {
        db.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(teamId, userId);
      },
      updateTeamMemberRole(teamId, userId, role) {
        db.prepare("UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?").run(role, teamId, userId);
      },
      getTeamMembership(teamId, userId) {
        const r = db.prepare("SELECT * FROM team_members WHERE team_id = ? AND user_id = ?").get(teamId, userId);
        return r ? mapTeamMember(r) : null;
      },
      isTeamLeader(teamId, userId) {
        const r = db
          .prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ? AND role = 'teamleader'")
          .get(teamId, userId);
        return Boolean(r);
      },
      listTeamMembers(teamId) {
        return db
          .prepare(
            `SELECT u.id, u.display_name, u.email, u.role AS user_role, tm.role AS team_role, tm.joined_at
             FROM users u
             JOIN team_members tm ON u.id = tm.user_id
             WHERE tm.team_id = ?
             ORDER BY tm.role DESC, u.display_name COLLATE NOCASE ASC`
          )
          .all(teamId)
          .map(mapTeamMemberRow);
      },
      countTeamMembers(teamId) {
        const r = db.prepare("SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?").get(teamId);
        return Number(r?.c) || 0;
      },
      setEventTeamAccess(eventId, teamId, accessLevel = "view") {
        db.prepare(
          `INSERT OR REPLACE INTO event_team_access (event_id, team_id, access_level)
           VALUES (?, ?, ?)`
        ).run(eventId, teamId, accessLevel);
      },
      clearEventTeamAccess(eventId) {
        db.prepare("DELETE FROM event_team_access WHERE event_id = ?").run(eventId);
      },
      listEventTeamAccess(eventId) {
        return db
          .prepare("SELECT event_id, team_id, access_level FROM event_team_access WHERE event_id = ?")
          .all(eventId)
          .map(mapEventTeamAccess);
      },
      listEventTeamAccessForEvents(eventIds) {
        if (!eventIds.length) return [];
        const placeholders = eventIds.map(() => "?").join(",");
        return db
          .prepare(`SELECT event_id, team_id, access_level FROM event_team_access WHERE event_id IN (${placeholders})`)
          .all(...eventIds)
          .map(mapEventTeamAccess);
      },
    };
    return api;
  } catch (err) {
    console.warn("[userDb] SQLite nicht verfügbar — Benutzerverwaltung deaktiviert:", err.message);
    return createUnsupportedDb();
  }
}

function createUnsupportedDb() {
  return {
    kind: "unsupported",
    supported: false,
    newId,
    getSetting: () => null,
    setSetting: () => {},
    getAllSettings: () => ({}),
    insertUser: () => {
      throw new Error("Benutzerverwaltung erfordert SQLite oder PostgreSQL");
    },
    updateUser: () => null,
    findUserById: () => null,
    findUserByEmail: () => null,
    listUsers: () => [],
    deleteUser: () => {},
    insertPin: () => {},
    findActivePin: () => null,
    markPinUsed: () => {},
    expirePinsForUser: () => {},
    sweepExpiredPins: () => {},
    insertSession: () => {},
    findSessionByTokenHash: () => null,
    touchSession: () => {},
    updateSessionStepUp: () => {},
    revokeSession: () => {},
    revokeSessionsForUser: () => {},
    listSessionsForUser: () => [],
    sweepExpiredSessions: () => {},
    setEventAccess: () => {},
    removeEventAccess: () => {},
    clearEventAccess: () => {},
    listEventAccess: () => [],
    listUserEventAccess: () => [],
    insertTeam: () => {
      throw new Error("Benutzerverwaltung erfordert SQLite oder PostgreSQL");
    },
    findTeamById: () => null,
    updateTeam: () => null,
    deleteTeam: () => {},
    listAllTeams: () => [],
    listTeamsForUser: () => [],
    listUserTeamIds: () => [],
    addTeamMember: () => {},
    removeTeamMember: () => {},
    updateTeamMemberRole: () => {},
    getTeamMembership: () => null,
    isTeamLeader: () => false,
    listTeamMembers: () => [],
    countTeamMembers: () => 0,
    setEventTeamAccess: () => {},
    clearEventTeamAccess: () => {},
    listEventTeamAccess: () => [],
    listEventTeamAccessForEvents: () => [],
  };
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function mapUser(r) {
  return {
    id: r.id,
    displayName: r.display_name,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    status: r.status,
    comment: r.comment_text || "",
    createdAt: Number(r.created_at),
    lastLoginAt: r.last_login_at ? Number(r.last_login_at) : null,
    lastPinRequestAt: r.last_pin_request_at ? Number(r.last_pin_request_at) : null,
    lastPasswordChangeAt: r.last_password_change_at ? Number(r.last_password_change_at) : null,
    mustChangePassword: Boolean(r.must_change_password),
  };
}

function mapPin(r) {
  return {
    id: r.id,
    userId: r.user_id,
    pinHash: r.pin_hash,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    usedAt: r.used_at ? Number(r.used_at) : null,
    ipHash: r.ip_hash || "",
  };
}

function mapSession(r) {
  return {
    id: r.id,
    userId: r.user_id,
    tokenHash: r.token_hash,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    lastSeenAt: Number(r.last_seen_at),
    ipHash: r.ip_hash || "",
    userAgent: r.user_agent || "",
    persistent: Boolean(r.persistent),
    stepUpUntil: r.step_up_until ? Number(r.step_up_until) : null,
  };
}

/** Team-Metadaten aus SQLite-Zeile. */
function mapTeam(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    leaderId: r.leader_id,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

/** Team inkl. Mitgliederzahl und optionaler Mitgliedsrolle. */
function mapTeamWithCount(r) {
  return {
    ...mapTeam(r),
    memberRole: r.member_role || null,
    memberCount: Number(r.member_count) || 0,
  };
}

function mapTeamMember(r) {
  return {
    teamId: r.team_id,
    userId: r.user_id,
    role: r.role,
    joinedAt: Number(r.joined_at),
  };
}

/** Mitglied mit Benutzerprofil für API-Antworten. */
function mapTeamMemberRow(r) {
  return {
    id: r.id,
    name: r.display_name,
    email: r.email,
    role: r.user_role,
    teamRole: r.team_role,
    joinedAt: Number(r.joined_at),
  };
}

function mapEventTeamAccess(r) {
  return {
    eventId: r.event_id,
    teamId: r.team_id,
    accessLevel: r.access_level,
  };
}

module.exports = { createUserDb, normalizeEmail, newId };
