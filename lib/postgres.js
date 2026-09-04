/**
 * Optionaler PostgreSQL-Adapter (npm i pg).
 * Wird nur geladen, wenn DATABASE_URL auf postgres:// zeigt.
 */

function createPgDb(url) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: url, max: 8 });
  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      code TEXT PRIMARY KEY,
      admin_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      active_slide INTEGER NOT NULL DEFAULT 0,
      payload JSONB NOT NULL
    );
  `);

  async function wait() {
    await ready;
  }

  return {
    kind: "postgres",
    /** DB-Lese/Schreib-Probe für Readiness. */
    async healthCheck() {
      const t0 = Date.now();
      try {
        await wait();
        await pool.query(
          `CREATE TABLE IF NOT EXISTS _pulse_health (id INT PRIMARY KEY CHECK (id = 1), ts BIGINT NOT NULL)`
        );
        const ts = Date.now();
        await pool.query(
          `INSERT INTO _pulse_health (id, ts) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts`,
          [ts]
        );
        const r = await pool.query(`SELECT ts FROM _pulse_health WHERE id = 1`);
        const ok = Number(r.rows[0]?.ts) === ts;
        return { ok, latencyMs: Date.now() - t0 };
      } catch {
        return { ok: false, latencyMs: Date.now() - t0 };
      }
    },
    async save(row) {
      await wait();
      await pool.query(
        `INSERT INTO sessions (code, admin_hash, created_at, active_slide, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (code) DO UPDATE SET
           admin_hash = EXCLUDED.admin_hash,
           active_slide = EXCLUDED.active_slide,
           payload = EXCLUDED.payload`,
        [row.code, row.adminHash, row.createdAt, row.activeSlideIndex, JSON.stringify(row.payload)]
      );
    },
    async load(code) {
      await wait();
      const r = await pool.query("SELECT * FROM sessions WHERE code = $1", [code]);
      const row = r.rows[0];
      if (!row) return null;
      return {
        code: row.code,
        adminHash: row.admin_hash,
        createdAt: Number(row.created_at),
        activeSlideIndex: row.active_slide,
        payload: row.payload,
      };
    },
    async remove(code) {
      await wait();
      await pool.query("DELETE FROM sessions WHERE code = $1", [code]);
    },
    async count() {
      await wait();
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM sessions");
      return r.rows[0].n;
    },
    async listMeta() {
      await wait();
      const r = await pool.query("SELECT code, created_at, payload FROM sessions");
      return r.rows.map((row) => ({
        code: row.code,
        createdAt: Number(row.created_at),
        payload: row.payload || {},
      }));
    },
  };
}

module.exports = { createPgDb };
