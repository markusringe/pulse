/**
 * Session-Persistenz.
 * Standard: SQLite (node:sqlite in Node 22+, sonst JSON-Datei).
 * Optional: PostgreSQL, wenn DATABASE_URL gesetzt und Paket `pg` installiert ist.
 */

const fs = require("fs");
const path = require("path");

function createDb() {
  const pgUrl = process.env.DATABASE_URL || "";
  if (pgUrl.startsWith("postgres")) {
    try {
      return require("./postgres").createPgDb(pgUrl);
    } catch (err) {
      console.warn("[db] PostgreSQL nicht verfügbar, fallback auf SQLite:", err.message);
    }
  }
  return createSqliteDb();
}

function createSqliteDb() {
  const file = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "pulse.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        code TEXT PRIMARY KEY,
        admin_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        active_slide INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL
      );
    `);
    const insert = db.prepare(
      "INSERT OR REPLACE INTO sessions (code, admin_hash, created_at, active_slide, payload) VALUES (?, ?, ?, ?, ?)"
    );
    const select = db.prepare("SELECT * FROM sessions WHERE code = ?");
    const del = db.prepare("DELETE FROM sessions WHERE code = ?");
    const all = db.prepare("SELECT code FROM sessions");
    const old = db.prepare("SELECT code, created_at, payload FROM sessions");
    return {
      kind: "sqlite",
      save(row) {
        insert.run(row.code, row.adminHash, row.createdAt, row.activeSlideIndex, JSON.stringify(row.payload));
      },
      load(code) {
        const r = select.get(code);
        return r ? mapRow(r) : null;
      },
      remove(code) {
        del.run(code);
      },
      count() {
        return all.all().length;
      },
      listMeta() {
        /* Einzelne kaputte Payloads dürfen die Admin-Liste nicht blockieren. */
        return old.all().map((r) => {
          let payload = {};
          try {
            payload = JSON.parse(r.payload || "{}");
          } catch {
            payload = {};
          }
          return { code: r.code, createdAt: r.created_at, payload };
        });
      },
    };
  } catch (err) {
    console.warn("[db] node:sqlite nicht verfügbar, JSON-Datei:", err.message);
    return createJsonDb(file.replace(/\.db$/, ".json"));
  }
}

function createJsonDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    data = {};
  }
  const flush = () => fs.writeFileSync(file, JSON.stringify(data));
  return {
    kind: "json",
    save(row) {
      data[row.code] = row;
      flush();
    },
    load(code) {
      return data[code] || null;
    },
    remove(code) {
      delete data[code];
      flush();
    },
    count() {
      return Object.keys(data).length;
    },
    listMeta() {
      return Object.values(data).map((row) => ({
        code: row.code,
        createdAt: row.createdAt,
        payload: row.payload || {},
      }));
    },
  };
}

function mapRow(r) {
  return {
    code: r.code,
    adminHash: r.admin_hash,
    createdAt: r.created_at,
    activeSlideIndex: r.active_slide,
    payload: JSON.parse(r.payload),
  };
}

module.exports = { createDb };
