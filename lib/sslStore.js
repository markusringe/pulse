/**
 * Metadaten zu SSL-Zertifikaten (ohne Private Keys).
 * Tabelle ssl_certificates in derselben SQLite-Datei wie Sessions,
 * Fallback: JSON-Datei, falls node:sqlite fehlt.
 */

const fs = require("fs");
const path = require("path");
const { isDueForRenewal } = require("./sslUtil");

/**
 * Öffnet den Speicher. Ohne Pfad: SQLITE_PATH bzw. data/pulse.db.
 * @param {string} [file]
 */
function createSslStore(file) {
  const dbFile = file || process.env.SQLITE_PATH || path.join(process.cwd(), "data", "pulse.db");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  try {
    const { DatabaseSync } = require("node:sqlite");
    return createSqliteStore(dbFile);
  } catch (err) {
    console.warn("[ssl] node:sqlite nicht verfügbar, JSON-Datei:", err.message);
    const jsonFile = path.join(path.dirname(dbFile), "ssl-certs.json");
    return createJsonStore(jsonFile);
  }
}

function createSqliteStore(file) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  /* Metadaten: Domain als Schlüssel, Ablauf für automatische Erneuerung. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS ssl_certificates (
      domain TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      issued_at INTEGER,
      expires_at INTEGER,
      auto_renew INTEGER NOT NULL DEFAULT 1,
      staging INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO ssl_certificates
      (domain, email, status, error, issued_at, expires_at, auto_renew, staging, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const select = db.prepare("SELECT * FROM ssl_certificates WHERE domain = ?");
  const all = db.prepare("SELECT * FROM ssl_certificates ORDER BY domain");
  const del = db.prepare("DELETE FROM ssl_certificates WHERE domain = ?");

  return {
    kind: "sqlite",
    get(domain) {
      const r = select.get(domain);
      return r ? mapSql(r) : null;
    },
    list() {
      return all.all().map(mapSql);
    },
    listDue(now = Date.now()) {
      return all.all().map(mapSql).filter((row) => isDueForRenewal(row, now));
    },
    upsert(partial) {
      const row = mergeRow(this.get(partial.domain), partial);
      insert.run(
        row.domain,
        row.email,
        row.status,
        row.error,
        row.issuedAt,
        row.expiresAt,
        row.autoRenew ? 1 : 0,
        row.staging ? 1 : 0,
        row.createdAt,
        row.updatedAt
      );
      return row;
    },
    remove(domain) {
      del.run(domain);
    },
  };
}

function createJsonStore(file) {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    data = {};
  }
  const flush = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };
  return {
    kind: "json",
    get(domain) {
      return data[domain] || null;
    },
    list() {
      return Object.values(data).sort((a, b) => a.domain.localeCompare(b.domain));
    },
    listDue(now = Date.now()) {
      return this.list().filter((row) => isDueForRenewal(row, now));
    },
    upsert(partial) {
      const row = mergeRow(data[partial.domain], partial);
      data[row.domain] = row;
      flush();
      return row;
    },
    remove(domain) {
      delete data[domain];
      flush();
    },
  };
}

function mergeRow(existing, partial) {
  const now = Date.now();
  return {
    domain: String(partial.domain),
    email: partial.email != null ? String(partial.email) : existing?.email || "",
    status: partial.status != null ? String(partial.status) : existing?.status || "pending",
    error: partial.error != null ? String(partial.error) : existing?.error || "",
    issuedAt: partial.issuedAt != null ? Number(partial.issuedAt) : existing?.issuedAt || 0,
    expiresAt: partial.expiresAt != null ? Number(partial.expiresAt) : existing?.expiresAt || 0,
    autoRenew: partial.autoRenew != null ? Boolean(partial.autoRenew) : existing?.autoRenew !== false,
    staging: partial.staging != null ? Boolean(partial.staging) : Boolean(existing?.staging),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function mapSql(r) {
  return {
    domain: r.domain,
    email: r.email,
    status: r.status,
    error: r.error || "",
    issuedAt: r.issued_at || 0,
    expiresAt: r.expires_at || 0,
    autoRenew: r.auto_renew !== 0,
    staging: r.staging === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const defaultStore = createSslStore();

module.exports = defaultStore;
module.exports.createSslStore = createSslStore;
