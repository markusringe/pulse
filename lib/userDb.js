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

module.exports = { createUserDb, normalizeEmail, newId };
