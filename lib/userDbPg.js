/**
 * PostgreSQL-Adapter für Benutzerverwaltung (optional, npm i pg).
 */

const crypto = require("crypto");

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function createUserDbPg(url) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: url, max: 8 });

  const ready = pool
    .query(`
    CREATE TABLE IF NOT EXISTS auth_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
  `)
    .then(async () => {
      try {
        await pool.query("ALTER TABLE auth_sessions ADD COLUMN step_up_until BIGINT");
      } catch {
        /* Spalte existiert bereits */
      }
    });

  async function wait() {
    await ready;
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

  return {
    kind: "postgres",
    supported: true,
    newId,
    async getSetting(key) {
      await wait();
      const r = await pool.query("SELECT value FROM auth_settings WHERE key = $1", [key]);
      return r.rows[0]?.value ?? null;
    },
    async setSetting(key, value) {
      await wait();
      await pool.query(
        "INSERT INTO auth_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [key, String(value)]
      );
    },
    async getAllSettings() {
      await wait();
      const r = await pool.query("SELECT key, value FROM auth_settings");
      return Object.fromEntries(r.rows.map((row) => [row.key, row.value]));
    },
    async insertUser(row) {
      await wait();
      await pool.query(
        `INSERT INTO users (id, display_name, email, password_hash, role, status, comment_text,
          created_at, last_login_at, last_pin_request_at, last_password_change_at, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
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
          row.mustChangePassword ? 1 : 0,
        ]
      );
    },
    async updateUser(id, patch) {
      await wait();
      const cur = await this.findUserById(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await pool.query(
        `UPDATE users SET display_name=$2, email=$3, password_hash=$4, role=$5, status=$6, comment_text=$7,
          last_login_at=$8, last_pin_request_at=$9, last_password_change_at=$10, must_change_password=$11
         WHERE id=$1`,
        [
          id,
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
        ]
      );
      return this.findUserById(id);
    },
    async findUserById(id) {
      await wait();
      const r = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      return r.rows[0] ? mapUser(r.rows[0]) : null;
    },
    async findUserByEmail(email) {
      await wait();
      const r = await pool.query("SELECT * FROM users WHERE email = $1", [normalizeEmail(email)]);
      return r.rows[0] ? mapUser(r.rows[0]) : null;
    },
    async listUsers(filters = {}) {
      await wait();
      let sql = "SELECT * FROM users WHERE 1=1";
      const params = [];
      let i = 1;
      if (filters.role) {
        sql += ` AND role = $${i++}`;
        params.push(filters.role);
      }
      if (filters.status) {
        sql += ` AND status = $${i++}`;
        params.push(filters.status);
      }
      if (filters.q) {
        sql += ` AND (display_name ILIKE $${i} OR email ILIKE $${i})`;
        params.push(`%${filters.q}%`);
        i++;
      }
      sql += " ORDER BY display_name ASC";
      const r = await pool.query(sql, params);
      return r.rows.map(mapUser);
    },
    async deleteUser(id) {
      await wait();
      await pool.query("DELETE FROM user_event_access WHERE user_id = $1", [id]);
      await pool.query("DELETE FROM auth_pins WHERE user_id = $1", [id]);
      await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
    },
    async insertPin(row) {
      await wait();
      await pool.query(
        "INSERT INTO auth_pins (id, user_id, pin_hash, created_at, expires_at, used_at, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [row.id, row.userId, row.pinHash, row.createdAt, row.expiresAt, row.usedAt || null, row.ipHash || ""]
      );
    },
    async findActivePin(userId) {
      await wait();
      const r = await pool.query(
        "SELECT * FROM auth_pins WHERE user_id = $1 AND used_at IS NULL AND expires_at > $2 ORDER BY created_at DESC LIMIT 1",
        [userId, Date.now()]
      );
      return r.rows[0] ? mapPin(r.rows[0]) : null;
    },
    async markPinUsed(id, usedAt) {
      await wait();
      await pool.query("UPDATE auth_pins SET used_at = $2 WHERE id = $1", [id, usedAt]);
    },
    async expirePinsForUser(userId) {
      await wait();
      await pool.query("UPDATE auth_pins SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL", [userId, Date.now()]);
    },
    async sweepExpiredPins() {
      await wait();
      await pool.query("DELETE FROM auth_pins WHERE expires_at < $1 OR used_at IS NOT NULL", [Date.now() - 86400000]);
    },
    async insertSession(row) {
      await wait();
      await pool.query(
        `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip_hash, user_agent, persistent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          row.id,
          row.userId,
          row.tokenHash,
          row.createdAt,
          row.expiresAt,
          row.lastSeenAt,
          row.ipHash || "",
          row.userAgent || "",
          row.persistent ? 1 : 0,
        ]
      );
    },
    async findSessionByTokenHash(tokenHash) {
      await wait();
      const r = await pool.query("SELECT * FROM auth_sessions WHERE token_hash = $1", [tokenHash]);
      return r.rows[0] ? mapSession(r.rows[0]) : null;
    },
    async touchSession(id, lastSeenAt) {
      await wait();
      await pool.query("UPDATE auth_sessions SET last_seen_at = $2 WHERE id = $1", [id, lastSeenAt]);
    },
    async updateSessionStepUp(id, stepUpUntil) {
      await wait();
      await pool.query("UPDATE auth_sessions SET step_up_until = $2 WHERE id = $1", [id, stepUpUntil]);
    },
    async revokeSession(id) {
      await wait();
      await pool.query("DELETE FROM auth_sessions WHERE id = $1", [id]);
    },
    async revokeSessionsForUser(userId) {
      await wait();
      await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
    },
    async listSessionsForUser(userId) {
      await wait();
      const r = await pool.query("SELECT * FROM auth_sessions WHERE user_id = $1 ORDER BY last_seen_at DESC", [userId]);
      return r.rows.map(mapSession);
    },
    async sweepExpiredSessions() {
      await wait();
      await pool.query("DELETE FROM auth_sessions WHERE expires_at < $1", [Date.now()]);
    },
    async setEventAccess(userId, eventId, accessRole) {
      await wait();
      await pool.query(
        "INSERT INTO user_event_access (user_id, event_id, access_role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [userId, eventId, accessRole]
      );
    },
    async removeEventAccess(userId, eventId, accessRole) {
      await wait();
      await pool.query("DELETE FROM user_event_access WHERE user_id = $1 AND event_id = $2 AND access_role = $3", [
        userId,
        eventId,
        accessRole,
      ]);
    },
    async clearEventAccess(eventId) {
      await wait();
      await pool.query("DELETE FROM user_event_access WHERE event_id = $1", [eventId]);
    },
    async listEventAccess(eventId) {
      await wait();
      const r = await pool.query("SELECT user_id, event_id, access_role FROM user_event_access WHERE event_id = $1", [
        eventId,
      ]);
      return r.rows;
    },
    async listUserEventAccess(userId) {
      await wait();
      const r = await pool.query("SELECT user_id, event_id, access_role FROM user_event_access WHERE user_id = $1", [
        userId,
      ]);
      return r.rows;
    },
  };
}

module.exports = { createUserDbPg };
