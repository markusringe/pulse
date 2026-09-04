#!/usr/bin/env node
/**
 * Negative API-Tests: 401/403 ohne Session; Team-Isolation zwischen Mitgliedern.
 * Startet Pulse kurz auf ephemeralen Port (nicht 3000).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pickPort() {
  return 36000 + (process.pid % 24000);
}

/** Set-Cookie-Header zu Cookie-Request-String. */
function cookiesFromResponse(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => c.split(";")[0]).join("; ");
}

function httpRequest(method, url, body, cookie = "", extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = { ...extraHeaders };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (cookie) headers.Cookie = cookie;

    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {
            /* HTML */
          }
          resolve({ status: res.statusCode, json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, attempts = 50) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpRequest("GET", `http://127.0.0.1:${port}/api/health`)
        .then((r) => {
          if (r.status === 200) resolve();
          else if (n >= attempts) reject(new Error(`health ${r.status}`));
          else setTimeout(tick, 300);
        })
        .catch(() => {
          if (n >= attempts) reject(new Error("health timeout"));
          else setTimeout(tick, 300);
        });
    };
    tick();
  });
}

/** Als Admin oder Benutzer per Kennwort anmelden. */
async function loginPassword(port, email, password) {
  const r = await httpRequest("POST", `http://127.0.0.1:${port}/api/auth/login-password`, {
    email,
    password,
    adminLogin: true,
    persistent: true,
  });
  assert(r.status === 200, `Login ${email} → 200 (war ${r.status}: ${r.json.error || ""})`);
  const cookie = cookiesFromResponse(r.headers);
  assert(cookie.includes("pulse_auth"), "Session-Cookie gesetzt");
  return cookie;
}

/** events.json für Test sichern und leeren. */
function backupEventsFile() {
  if (fs.existsSync(EVENTS_FILE)) return fs.readFileSync(EVENTS_FILE);
  return null;
}

function restoreEventsFile(backup) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (backup != null) fs.writeFileSync(EVENTS_FILE, backup);
  else if (fs.existsSync(EVENTS_FILE)) fs.unlinkSync(EVENTS_FILE);
}

(async () => {
  const port = pickPort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-api-perm-"));
  const dbPath = path.join(tmpDir, "pulse.db");
  const eventsBackup = backupEventsFile();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(EVENTS_FILE, JSON.stringify({ events: [] }));

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    SQLITE_PATH: dbPath,
    USER_AUTH_ENABLED: "1",
    AUTH_DEV_MAILBOX: "1",
    BOOTSTRAP_ADMIN_EMAIL: "admin@test.local",
    BOOTSTRAP_ADMIN_PASSWORD: "ApiTest123!",
    BOOTSTRAP_ADMIN_NAME: "API Test Admin",
    ADMIN_SECRET: "api-perm-test-secret",
    REDIS_URL: "",
    IP_BLOCK: "0",
  };

  const child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;

    /* --- ohne Session --- */
    const me = await httpRequest("GET", `${base}/api/auth/me`);
    assert(me.status === 401 || (me.status === 200 && !me.json.user), "GET /api/auth/me ohne Cookie");

    for (const [label, method, pathSuffix, body] of [
      ["users", "GET", "/api/users", null],
      ["events POST", "POST", "/api/events", { title: "X", teamId: "t1" }],
      ["branding", "PUT", "/api/branding", { branding: { appName: "X" } }],
      ["backups", "GET", "/api/backups", null],
    ]) {
      const r = await httpRequest(method, `${base}${pathSuffix}`, body);
      assert(r.status === 403, `${label} ohne Auth → 403 (war ${r.status})`);
    }

    /* --- Setup: Admin, Teams, Member, Event --- */
    const adminCookie = await loginPassword(port, "admin@test.local", "ApiTest123!");

    const teamA = await httpRequest("POST", `${base}/api/teams`, { name: "Team Alpha" }, adminCookie);
    assert(teamA.status === 201, `Team A anlegen (${teamA.status})`);
    const teamAId = teamA.json.team?.id;
    assert(teamAId, "Team-A-ID");

    const teamB = await httpRequest("POST", `${base}/api/teams`, { name: "Team Beta" }, adminCookie);
    assert(teamB.status === 201, `Team B anlegen (${teamB.status})`);
    const teamBId = teamB.json.team?.id;

    const newUser = await httpRequest(
      "POST",
      `${base}/api/users`,
      {
        displayName: "Member Alpha",
        email: "member-a@test.local",
        password: "MemberPass123!",
        role: "teammember",
        status: "active",
      },
      adminCookie
    );
    assert(newUser.status === 201, `User anlegen (${newUser.status})`);
    const memberId = newUser.json.user?.id;

    const addMember = await httpRequest(
      "POST",
      `${base}/api/teams/${teamAId}/members`,
      { userId: memberId, role: "teammember" },
      adminCookie
    );
    assert(addMember.status === 200, `Member zu Team A (${addMember.status})`);

    const eventRes = await httpRequest(
      "POST",
      `${base}/api/events`,
      { title: "Event Team Beta", teamId: teamBId, visibility: "private" },
      adminCookie
    );
    assert(eventRes.status === 200 || eventRes.status === 201, `Event Team B (${eventRes.status})`);
    const eventId = eventRes.json.event?.id;
    const teamBSessionCode = eventRes.json.event?.sessionCode || eventRes.json.event?.joinCode;
    assert(eventId && teamBSessionCode, "Event-ID und Session-Code Team B");

    /* --- Teammitglied: fremdes Team / Event --- */
    const memberCookie = await loginPassword(port, "member-a@test.local", "MemberPass123!");

    const foreignTeam = await httpRequest("GET", `${base}/api/teams/${teamBId}`, null, memberCookie);
    assert(foreignTeam.status === 403, `Fremdes Team lesen → 403 (war ${foreignTeam.status})`);

    const patchEvent = await httpRequest(
      "PATCH",
      `${base}/api/events/${eventId}`,
      { title: "Unbefugt geändert" },
      memberCookie
    );
    assert(patchEvent.status === 403, `Fremdes Event patchen → 403 (war ${patchEvent.status})`);

    const createUser = await httpRequest(
      "POST",
      `${base}/api/users`,
      {
        displayName: "Hack",
        email: "hack@test.local",
        password: "HackPass123!",
        role: "admin",
        status: "active",
      },
      memberCookie
    );
    assert(createUser.status === 403, `Teammember darf keinen User anlegen → 403 (war ${createUser.status})`);

    /* --- Teammitglied: eigenes Team --- */
    const ownTeam = await httpRequest("GET", `${base}/api/teams/${teamAId}`, null, memberCookie);
    assert(ownTeam.status === 200, `Eigenes Team lesen → 200 (war ${ownTeam.status})`);

    /* --- Teammember: keine Instanz-Administration --- */
    for (const [label, method, pathSuffix, body] of [
      ["branding", "PUT", "/api/branding", { branding: { appName: "Hack" } }],
      ["backups", "GET", "/api/backups", null],
      ["settings export", "GET", "/api/settings/export", null],
      ["teams POST", "POST", "/api/teams", { name: "Illegales Team" }],
    ]) {
      const r = await httpRequest(method, `${base}${pathSuffix}`, body, memberCookie);
      assert(r.status === 403, `${label} als Teammember → 403 (war ${r.status})`);
    }

    /* --- Teammember: Event nur im eigenen Team anlegen --- */
    const foreignEventCreate = await httpRequest(
      "POST",
      `${base}/api/events`,
      { title: "Fremdes Team Event", teamId: teamBId, visibility: "private" },
      memberCookie
    );
    assert(foreignEventCreate.status === 403, `Event in Team B → 403 (war ${foreignEventCreate.status})`);

    const ownEventCreate = await httpRequest(
      "POST",
      `${base}/api/events`,
      {
        title: "Team-A Event",
        teamId: teamAId,
        visibility: "private",
        slides: [
          { type: "choice", question: "F1", options: [{ label: "A" }, { label: "B" }] },
          { type: "choice", question: "F2", options: [{ label: "C" }, { label: "D" }] },
        ],
      },
      memberCookie
    );
    assert(ownEventCreate.status === 201, `Event in Team A → 201 (war ${ownEventCreate.status})`);
    const ownEventId = ownEventCreate.json.event?.id;
    const ownSessionCode =
      ownEventCreate.json.event?.sessionCode || ownEventCreate.json.event?.joinCode;
    assert(ownEventId && ownSessionCode, "Event-ID und Session-Code aus Antwort");

    /* --- Session-Folie: Teammitglied darf eigene Event-Session steuern (ohne Admin-Key) --- */
    const ownSlide = await httpRequest(
      "POST",
      `${base}/api/sessions/${ownSessionCode}/slide`,
      { index: 1 },
      memberCookie
    );
    assert(ownSlide.status === 200, `Folie Team-A-Session → 200 (war ${ownSlide.status})`);
    assert(ownSlide.json.session?.activeSlideIndex === 1, "activeSlideIndex auf 1 gesetzt");

    /* --- Session-Folie: kein Zugriff auf fremdes Team-Event --- */
    const foreignSlide = await httpRequest(
      "POST",
      `${base}/api/sessions/${teamBSessionCode}/slide`,
      { index: 1 },
      memberCookie
    );
    assert(foreignSlide.status === 403, `Folie Team-B-Session → 403 (war ${foreignSlide.status})`);

    /* --- Viewer: kein Event-Anlegen --- */
    const viewerUser = await httpRequest(
      "POST",
      `${base}/api/users`,
      {
        displayName: "Viewer Test",
        email: "viewer@test.local",
        password: "ViewerPass123!",
        role: "viewer",
        status: "active",
      },
      adminCookie
    );
    assert(viewerUser.status === 201, `Viewer anlegen (${viewerUser.status})`);
    const viewerCookie = await loginPassword(port, "viewer@test.local", "ViewerPass123!");
    const viewerEvent = await httpRequest(
      "POST",
      `${base}/api/events`,
      { title: "Viewer Event", teamId: teamAId, visibility: "private" },
      viewerCookie
    );
    assert(viewerEvent.status === 403, `Viewer darf kein Event anlegen → 403 (war ${viewerEvent.status})`);

    /* --- Session anlegen ohne Auth (USER_AUTH + ADMIN_SECRET) --- */
    const anonSession = await httpRequest("POST", `${base}/api/sessions`, { type: "demo" });
    assert(anonSession.status === 403, `Session ohne Auth → 403 (war ${anonSession.status})`);

    console.log(`API-Permissions-Tests OK (Port ${port})`);
  } finally {
    child.kill("SIGTERM");
    restoreEventsFile(eventsBackup);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp */
    }
  }
})().catch((err) => {
  console.error("API-Permissions-Test fehlgeschlagen:", err.message);
  process.exit(1);
});
