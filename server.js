/**
 * Pulse-Server: statisches Frontend, REST, WebSocket.
 * Persistenz (SQLite/Postgres), Admin-Auth, optionales Redis-Pub/Sub,
 * Batch-Broadcasts für hohe Teilnehmerzahlen, Prometheus-/metrics.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const { createDb } = require("./lib/db");
const { createBus } = require("./lib/bus");
const { generateAdminKey, hashAdminKey, verifyAdminKey, readAdminKey, hashPassword, verifyPassword } = require("./lib/auth");
const metrics = require("./lib/metrics");
const interactive = require("./lib/interactive");
const brandingStore = require("./lib/branding");
const privacyStore = require("./lib/privacy");
const instanceSettings = require("./lib/settings");
const rateLimiter = require("./lib/rateLimiter");
const audit = require("./lib/auditLogger");
const intake = require("./lib/intake");
const { applyDeckAction, copySlidesFrom, slideSource } = require("./lib/deck");
const liveState = require("./lib/liveState");
const ssl = require("./lib/ssl");
const eventStore = require("./lib/events");
const slideTypes = require("./lib/slideTypes");
const slideVotes = require("./lib/slideVotes");
const compress = require("./lib/compress");
const qaTimer = require("./lib/qaTimer");
const { createUserDb } = require("./lib/userDb");
const authApi = require("./lib/authApi");
const permissions = require("./lib/permissions");
const userService = require("./lib/userService");
const emailService = require("./lib/emailService");
const pinLimiter = require("./lib/pinLimiter");
const { ensureBootstrapAdmin, bootstrapCredentials } = require("./lib/bootstrapAdmin");
const updateService = require("./lib/updateService");
const emailApi = require("./lib/emailApi");
const backupService = require("./lib/backupService");
const backupApi = require("./lib/backupApi");
const autoBackup = require("./lib/autoBackup");

const PORT = Number(process.env.PORT) || 3000;
const BATCH_INTERVAL = Number(process.env.BATCH_INTERVAL_MS) || 100;
const FRONTEND = path.join(__dirname, "frontend");
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_PAYLOAD = 512 * 1024;

/**
 * Liest eine boolesche Umgebungsvariable.
 * Ungesetzt → fallback. 0/false/off/no/disabled → aus, sonst an.
 */
function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return !/^(0|false|off|no|disabled)$/i.test(String(raw).trim());
}

/**
 * IP-Sperre: explizites IP_BLOCK in der Umgebung hat Vorrang, sonst Branding.
 * @param {{ ipBlock?: boolean }} [branding]
 */
function applyIpBlockSetting(branding) {
  rateLimiter.setIpBlockEnabled(envBool("IP_BLOCK", branding?.ipBlock !== false));
}

applyIpBlockSetting(brandingStore.load());

const db = createDb();
const userDb = createUserDb();
const bus = createBus();

/** @type {Map<string, Session>} */
const sessions = new Map();
/** @type {Set<Client>} */
const clients = new Set();
/** @type {Map<string, { timer: NodeJS.Timeout | null, last: Map<string, any>, immediate: any[] }>} */
const batches = new Map();
const qaBatches = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const persistTimers = new Map();
/** Auto-Ende der Q&A-Runde (key = code:slideId). Nach Restore aus DB neu gesetzt. */
const qaEndTimers = new Map();
const presenterLocks = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/**
 * Gemeinsamer HTTP(S)-Handler: ACME-Challenge zuerst, optional Redirect, dann API/Static.
 * Wird vom HTTP- und vom HTTPS-Server genutzt (ein Prozess, Zertifikat-Reload ohne Exit).
 */
async function onHttpRequest(req, res) {
  const started = process.hrtime.bigint();
  /* Kompression liest Accept-Encoding, ohne die send()-Signatur überall zu ändern. */
  res._pulseReq = req;
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    /* Let's Encrypt HTTP-01 muss ohne Auth und ohne HTTPS-Redirect erreichbar sein. */
    if (ssl.serveChallenge(url.pathname, res)) return;
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    /* Nur Klartext-HTTP umleiten, sobald ein aktives Zertifikat liegt. */
    if (!req.socket.encrypted && ssl.shouldRedirectHttp(url)) {
      res.writeHead(301, { Location: ssl.httpsLocation(req, url), ...corsHeaders() });
      res.end();
      return;
    }
    if (url.pathname === "/metrics") {
      metrics.setSessions(sessions.size);
      metrics.setWsConnections(clients.size);
      compress.writeEncoded(
        res,
        200,
        metrics.render(),
        "text/plain; version=0.0.4; charset=utf-8",
        req
      );
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      observe(req, url, res.statusCode || 200, started);
      return;
    }
    serveStatic(url.pathname, req, res);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "Interner Fehler" });
    observe(req, url, 500, started);
  }
}

function onHttpUpgrade(req, socket) {
  if (new URL(req.url, "http://localhost").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const ip = req.socket.remoteAddress || "";
  const ipKey = audit.hashIp(ip);
  if (!rateLimiter.addSocket(ipKey, socket)) {
    console.warn("[ws] Zu viele Verbindungen von IP-Hash", ipKey);
    rateLimiter.blockIp(ipKey);
    audit.log("ddos_rejected", { ipHash: ipKey, action: "blacklist_24h" });
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    rateLimiter.removeSocket(ipKey, socket);
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  );
  const client = new Client(socket);
  client.ipHash = ipKey;
  clients.add(client);
  metrics.setWsConnections(clients.size);
  client.onMessage = (msg) => {
    metrics.incWs("in", msg?.type || "other");
    onWsMessage(client, msg);
  };
  client.onClose = () => {
    rateLimiter.removeSocket(ipKey, socket);
    clients.delete(client);
    metrics.setWsConnections(clients.size);
    if (client.sessionCode) leaveSession(client);
  };
}

const server = http.createServer(onHttpRequest);
server.on("upgrade", onHttpUpgrade);

bus.onRemote((code, envelope) => {
  applyRemoteEnvelope(code, envelope);
  /* Interne Quiz-Antworten nur State, nie an Browser. */
  if (envelope.type === "quiz_answer_sync") return;
  if (envelope.type === "deck") {
    const session = sessions.get(code);
    if (session) announceDeck(session, { skipBus: true });
    return;
  }
  enqueueBroadcast(code, envelope, { skipBus: true });
});

/** Server erst starten, wenn Bootstrap-Admin bereit ist (Erstlogin sonst zu früh). */
(async function startPulseServer() {
  if (userDb.supported) {
    try {
      const bootstrap = await ensureBootstrapAdmin(userDb);
      if (bootstrap.created) {
        console.log(`[bootstrap] Bereit: ${bootstrap.email}`);
      } else if (bootstrap.reason === "password_synced") {
        console.log(`[bootstrap] Installations-Kennwort synchronisiert: ${bootstrap.email}`);
      } else if (bootstrap.reason === "exists" && !bootstrapCredentials().envPasswordSet) {
        console.warn("[bootstrap] Admin existiert, aber BOOTSTRAP_ADMIN_PASSWORD fehlt — Login mit INSTALL-CREDENTIALS schlägt fehl bis .env im Container ist");
      }
    } catch (err) {
      console.error("[bootstrap]", err);
    }
  }

  server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pulse läuft auf http://localhost:${PORT}`);
  console.log(
    `Persistenz: ${db.kind} · Bus: ${bus.redisEnabled ? "redis" : "in-process"} · Batch ${BATCH_INTERVAL}ms · IP-Sperre ${
      rateLimiter.isIpBlockEnabled() ? "an" : "aus"
    }`
  );
  for (const ip of lanIps()) console.log(`          http://${ip}:${PORT}`);
  /* HTTPS startet nur, wenn bereits PEM-Dateien vorhanden sind; sonst nach der ersten Ausstellung. */
  ssl.attachHttps(onHttpRequest, onHttpUpgrade);
  setInterval(() => {
    sweepExpiredSessions().catch((err) => console.error("[sweep]", err));
    tickEventStatuses();
    audit.sweep();
    if (userDb.supported) {
      Promise.resolve(userDb.sweepExpiredPins()).catch((err) => console.error("[auth-sweep]", err));
      Promise.resolve(userDb.sweepExpiredSessions()).catch((err) => console.error("[auth-sweep]", err));
    }
    ssl.renewDue().catch((err) => console.error("[ssl-renew]", err));
  }, 60 * 60 * 1000);
  migrateEventDecks().catch((err) => console.error("[events-migrate]", err));
  sweepExpiredSessions().catch((err) => console.error("[sweep]", err));
  tickEventStatuses();
  ssl.renewDue().catch((err) => console.error("[ssl-renew]", err));
  updateService.onServerBoot().catch((err) => console.error("[update-boot]", err));
  updateService.startBackgroundChecks();
  });
})();

/* ----------------------------- REST -------------------------------- */

async function handleApi(req, res, url) {
  const ipKey = audit.hashIp(req.socket.remoteAddress || req.headers["x-forwarded-for"] || "");
  if (!rateLimiter.checkHttp(ipKey)) {
    send(res, 429, { error: "Zu viele Anfragen" });
    return;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && parts[1] === "health") {
    const redis = await bus.ping();
    const authSettings = userDb.supported ? await userService.getSettings(userDb) : { userManagementEnabled: false };
    send(res, 200, {
      ok: true,
      sessions: sessions.size,
      persisted: await Promise.resolve(db.count()),
      db: db.kind,
      userDb: userDb.kind,
      redis,
      ipBlock: rateLimiter.isIpBlockEnabled(),
      https: ssl.httpsInfo(),
      auth: {
        enabled: userService.isUserManagementEnabled(userDb),
        email: emailService.healthInfo(),
        pinLimiter: pinLimiter.metrics(),
      },
      authSettings,
    });
    return;
  }
  if (parts[1] === "auth" || parts[1] === "users") {
    const handled = await authApi.handleAuthApi({
      req,
      res,
      parts,
      userDb,
      brandingStore,
      send,
      readJson,
      legacyReadAdminKey: readAdminKey,
      isLegacyAdmin: (secret) => !process.env.ADMIN_SECRET || secret === process.env.ADMIN_SECRET,
    });
    if (handled) return;
  }
  if (req.method === "GET" && parts[1] === "branding" && parts.length === 2) {
    send(res, 200, { branding: brandingStore.load() });
    return;
  }
  if (req.method === "POST" && parts[1] === "branding" && parts.length === 2) {
    const body = await readJson(req);
    if (!(await isSettingsAdmin(req, body))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const auth = await getAuth(req, body);
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    const branding = brandingStore.save(body);
    applyIpBlockSetting(branding);
    audit.log("branding_updated", { userId: "admin" });
    send(res, 200, { branding });
    return;
  }
  /* Öffentliche Datenschutzerklärung / Impressum-HTML mit ersetzten Platzhaltern. */
  if (req.method === "GET" && parts[1] === "privacy" && parts.length <= 3) {
    const branding = brandingStore.load();
    const lang = String(url.searchParams.get("lang") || "de").slice(0, 8);
    if (parts[2] === "versions") {
      send(res, 200, { versions: privacyStore.versions() });
      return;
    }
    send(
      res,
      200,
      privacyStore.publicPayload({
        retentionDays: branding.retentionDays,
        lang,
        extraFromBranding: branding.privacyExtra || "",
      })
    );
    return;
  }
  /* Speichern analog Branding: X-Admin-Key / ADMIN_SECRET / allowLocal. */
  if ((req.method === "POST" || req.method === "PUT") && parts[1] === "privacy" && parts.length === 2) {
    const body = await readJson(req);
    if (!(await isSettingsAdmin(req, body))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const auth = await getAuth(req, body);
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    const { record, versions } = privacyStore.save(body);
    audit.log("privacy_updated", { userId: "admin" });
    const branding = brandingStore.load();
    send(res, 200, {
      privacy: record,
      versions,
      ...privacyStore.publicPayload({
        retentionDays: branding.retentionDays,
        lang: String(body.lang || "de").slice(0, 8),
        extraFromBranding: branding.privacyExtra || "",
      }),
    });
    return;
  }
  /* Instanz-Einstellungen: JSON-Export/Import (kein Rewrite der Branding-/Privacy-Handler). */
  if (parts[1] === "events") {
    try {
      await handleEventsApi(req, res, url, parts);
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message || "Event-Fehler" });
    }
    return;
  }
  if (parts[1] === "settings") {
    await handleSettingsApi(req, res, parts);
    return;
  }
  if (parts[1] === "ssl") {
    await handleSslApi(req, res, parts);
    return;
  }
  if (parts[1] === "email") {
    const handled = await emailApi.handleEmailApi({
      req,
      res,
      parts,
      send,
      readJson,
      authApi,
      getAuth,
    });
    if (handled) return;
  }
  if (parts[1] === "updates") {
    await handleUpdatesApi(req, res, parts, ipKey);
    return;
  }
  if (parts[1] === "backups") {
    await backupApi.handleBackupsApi({
      req,
      res,
      parts,
      send,
      readJson,
      readRawWithLimit,
      isSettingsAdmin,
      getAuth,
      authApi,
      audit,
      corsHeaders,
      gracefulShutdown,
      restartAutoBackup: autoBackup.restartAutoBackup,
    });
    return;
  }
  if (req.method === "GET" && parts[1] === "audit") {
    if (!(await isSettingsAdmin(req, {}))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const auth = await getAuth(req, {});
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    send(res, 200, { logs: audit.exportAll() });
    return;
  }
  if (req.method === "POST" && parts[1] === "sessions" && parts.length === 2) {
    const auth = await getAuth(req, {});
    if (userService.isUserManagementEnabled(userDb)) {
      if (!auth.user && !auth.viaSecret && process.env.ADMIN_SECRET) {
        send(res, 403, { error: "Anmeldung erforderlich" });
        return;
      }
      if (auth.user && !permissions.isEditor(auth.user)) {
        send(res, 403, { error: "Keine Berechtigung zum Anlegen von Sessions" });
        return;
      }
    }
    const body = await readJson(req);
    try {
      const { session, adminKey } = await createSession({
        ...(body || {}),
        ownerUserId: auth.user?.id || body?.ownerUserId || "",
      });
      send(res, 201, { session: publicSession(session, { reveal: true }), adminKey });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message || "Session fehlgeschlagen" });
    }
    return;
  }
  if (req.method === "GET" && parts[1] === "sessions" && parts[2] === "admin" && !parts[3]) {
    if (!(await isEventAdmin(req, {}))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    try {
      send(res, 200, { sessions: await listAdminSessions() });
    } catch (err) {
      console.error("[sessions-admin]", err);
      send(res, 500, { error: err.message || "Session-Liste fehlgeschlagen" });
    }
    return;
  }
  if (parts[1] === "questions" || parts[1] === "quiz" || parts[1] === "emergency" || parts[1] === "qa") {
    await handleInteractiveApi(req, res, url, parts);
    return;
  }
  const code = parts[2];
  const session = await getSession(code);
  if (!session) {
    send(res, 404, { error: "Session nicht gefunden" });
    return;
  }
  if (req.method === "GET" && parts.length === 3) {
    const reveal = verifyAdminKey(readAdminKey(req, {}), session.adminHash);
    send(res, 200, { session: publicSession(session, { reveal }) });
    return;
  }
  /* POST/PATCH/PUT/DELETE können JSON-Body tragen (allowLocal, Folien-Update). */
  const body =
    req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE"
      ? await readJson(req)
      : {};
  if (req.method === "POST" && parts[3] === "password") {
    const ok = checkPresenterPassword(session, body.password, req.socket.remoteAddress);
    send(res, ok.ok ? 200 : 401, ok);
    return;
  }
  if (!await canManageSession(req, body, session)) {
    send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
    return;
  }
  if (req.method === "GET" && parts[3] === "export") {
    const kind = url.searchParams.get("kind") === "qa" ? "qa" : "all";
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind === "qa" ? "qa" : "session"}-${code}.csv"`,
    });
    res.end(intake.toCsv(session, kind));
    return;
  }
  if (req.method === "POST" && parts[3] === "reset") {
    for (const slide of session.slides) resetSlide(slide);
    session.votes.clear();
    clearQaEndTimers(session.code);
    schedulePersist(session);
    announceSession(session);
    send(res, 200, { session: publicSession(session, { reveal: true }) });
    return;
  }
  if (req.method === "POST" && parts[3] === "lobby") {
    session.lobby = body.lobby !== false;
    schedulePersist(session);
    announce(code, { type: "lobby", payload: { lobby: session.lobby } });
    send(res, 200, { session: publicSession(session, { reveal: true }) });
    return;
  }
  if (req.method === "POST" && parts[3] === "results") {
    const slide =
      session.slides.find((s) => s.id === body.slideId) || session.slides[session.activeSlideIndex];
    if (!slide) {
      send(res, 404, { error: "Folie nicht gefunden" });
      return;
    }
    slide.resultsVisible = body.visible !== false;
    schedulePersist(session);
    announceResults(session, slide);
    send(res, 200, { session: publicSession(session, { reveal: true }) });
    return;
  }
  if (req.method === "POST" && parts[3] === "slides" && !parts[4]) {
    const out = mutateDeck(session, body.action || "add", body);
    if (out.error) {
      send(res, 400, out);
      return;
    }
    send(res, 200, { session: publicSession(session, { reveal: true }), ...out });
    return;
  }
  /* REST: PATCH /api/sessions/:code/slides/:slideId — Inhalts-Update */
  if ((req.method === "PATCH" || req.method === "PUT") && parts[3] === "slides" && parts[4]) {
    const slideId = String(parts[4]);
    const exists = session.slides.some((s) => s.id === slideId);
    if (!exists) {
      send(res, 404, { error: "Folie nicht gefunden" });
      return;
    }
    const out = mutateDeck(session, "update", { id: slideId, slide: body.slide || body });
    if (out.error) {
      send(res, 400, out);
      return;
    }
    send(res, 200, { session: publicSession(session, { reveal: true }), slide: out.slide });
    return;
  }
  /* REST: DELETE /api/sessions/:code/slides/:slideId */
  if (req.method === "DELETE" && parts[3] === "slides" && parts[4]) {
    const slideId = String(parts[4]);
    const exists = session.slides.some((s) => s.id === slideId);
    if (!exists) {
      send(res, 404, { error: "Folie nicht gefunden" });
      return;
    }
    const out = mutateDeck(session, "remove", { id: slideId });
    if (out.error) {
      send(res, 400, out);
      return;
    }
    send(res, 200, { session: publicSession(session, { reveal: true }), ok: true });
    return;
  }
  if (req.method === "POST" && parts[3] === "copy-from") {
    const sourceCode = String(body.sourceCode || "").replace(/\D/g, "").slice(0, 6);
    const source = await getSession(sourceCode);
    if (!source) {
      send(res, 404, { error: "Quell-Session nicht gefunden" });
      return;
    }
    const out = copySlidesFrom(session, source.slides, { slideIds: body.slideIds, normalizeSlide });
    if (out.error) {
      send(res, 400, out);
      return;
    }
    schedulePersist(session);
    audit.log("deck_updated", { roomId: session.code, action: "copy-from", userId: "presenter" });
    announceDeck(session);
    send(res, 200, { session: publicSession(session, { reveal: true }), copied: out.copied });
    return;
  }
  if (req.method === "POST" && parts[3] === "slide") {
    const index = clamp(Number(body.index) || 0, 0, session.slides.length - 1);
    session.activeSlideIndex = index;
    schedulePersist(session);
    announceSlide(session);
    send(res, 200, { session: publicSession(session, { reveal: true }) });
    return;
  }
  send(res, 404, { error: "Unbekannte Route" });
}

async function handleInteractiveApi(req, res, url, parts) {
  const body = req.method === "GET" ? {} : await readJson(req);
  const roomId = body.roomId || url.searchParams.get("roomId");
  const session = await getSession(roomId);
  if (!session) {
    send(res, 404, { error: "Session nicht gefunden" });
    return;
  }
  const fake = { id: req.headers["x-client-id"] || body.clientId || "rest" };
  const admin = verifyAdminKey(readAdminKey(req, body), session.adminHash);

  if (parts[1] === "questions" && req.method === "GET") {
    send(res, 200, {
      questions: interactive.listQuestions(session, url.searchParams.get("slideId"), fake.id, admin),
    });
    return;
  }
  if (parts[1] === "questions" && parts.length === 2 && req.method === "POST") {
    if (session.paused || session.lobby) {
      send(res, 423, { error: session.lobby ? "Warten auf den Start" : "Session pausiert" });
      return;
    }
    const out = intake.intakeQuestion(session, fake, body, brandingStore.load());
    if (out.error) {
      send(res, out.error === "blocked" ? 422 : out.error === "qa_closed" ? 423 : 429, out);
      return;
    }
    schedulePersist(session);
    announceQuestion(session, out.question);
    send(res, 201, out);
    return;
  }
  if (parts[1] === "questions" && parts[3] === "upvote" && req.method === "POST") {
    if (session.paused) {
      send(res, 423, { error: "Session pausiert" });
      return;
    }
    const out = intake.intakeUpvote(session, fake, parts[2]);
    if (out.error && !out.question) {
      send(res, 429, out);
      return;
    }
    schedulePersist(session);
    announce(session.code, {
      type: "question_upvoted",
      payload: { questionId: parts[2], count: out.question.upvotes, question: out.question },
    });
    send(res, 200, out);
    return;
  }
  if (parts[1] === "questions" && parts[3] === "moderate" && req.method === "POST") {
    if (!admin) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const out = interactive.moderateQuestion(session, parts[2], body.action, body);
    if (out.error) {
      send(res, 400, out);
      return;
    }
    audit.log("question_moderated", {
      roomId: session.code,
      userId: "presenter",
      action: body.action,
      questionId: parts[2],
    });
    schedulePersist(session);
    announce(session.code, {
      type: "question_moderated",
      payload: { questionId: parts[2], status: out.question.status, question: out.question },
    });
    send(res, 200, out);
    return;
  }
  if (parts[1] === "qa" && parts[2] === "timer" && req.method === "POST") {
    if (!admin) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const out = applyQaTimerControl(session, body);
    if (out.error) {
      send(res, 400, out);
      return;
    }
    send(res, 200, out);
    return;
  }
  if (parts[1] === "emergency" && req.method === "POST") {
    if (!admin) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const action = body.action || (parts[2] === "resume" ? "resume" : "activate");
    if (action === "resume" || parts[2] === "resume") intake.resumeEmergency(session);
    else intake.activateEmergency(session);
    schedulePersist(session);
    audit.log("emergency", { roomId: session.code, action, userId: "presenter" });
    announceEmergency(session);
    send(res, 200, { success: true, paused: session.paused });
    return;
  }
  if (parts[1] === "quiz" && parts[2] === "powerup" && req.method === "POST") {
    const out = interactive.usePowerup(session, fake, body);
    if (out.error) {
      send(res, 400, out);
      return;
    }
    schedulePersist(session);
    send(res, 200, out);
    return;
  }
  if (parts[1] === "quiz" && parts[2] === "leaderboard" && req.method === "GET") {
    const slide = interactive.findQuizSlide(session);
    send(res, 200, {
      leaderboard: slide ? interactive.buildLeaderboard(slide) : [],
      overall: interactive.buildOverallLeaderboard(session),
    });
    return;
  }
  if (parts[1] === "quiz" && parts[2] === "start" && req.method === "POST") {
    if (!admin) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const out = interactive.startQuiz(session, body, announce);
    if (out.error) {
      send(res, 400, out);
      return;
    }
    schedulePersist(session);
    announce(session.code, { type: "quiz_started", payload: out });
    send(res, 200, out);
    return;
  }
  if (parts[1] === "quiz" && parts[2] === "answer" && req.method === "POST") {
    const out = interactive.submitAnswer(session, fake, body);
    if (out.error) {
      send(res, 400, out);
      return;
    }
    schedulePersist(session);
    send(res, 200, out);
    return;
  }
  if (parts[1] === "quiz" && parts[2] === "end" && req.method === "POST") {
    if (!admin) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const slide = interactive.findQuizSlide(session, body.questionId);
    if (!slide) {
      send(res, 404, { error: "Keine Quiz-Folie" });
      return;
    }
    const out = interactive.endQuiz(session, slide, announce);
    schedulePersist(session);
    send(res, 200, out);
    return;
  }
  send(res, 404, { error: "Unbekannte Route" });
}

async function createSession(body) {
  let code = String(body.code || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    code = randomCode();
    while (sessions.has(code) || (await Promise.resolve(db.load(code)))) code = randomCode();
  } else if (sessions.has(code) || (await Promise.resolve(db.load(code)))) {
    const err = new Error("Join-Code bereits vergeben");
    err.statusCode = 409;
    throw err;
  }
  const slides = body.slides?.length
    ? body.slides.map((s) => normalizeSlide(s))
    : body.type === "demo"
      ? demoSlides(body.question)
      : [normalizeSlide(body)];
  const adminKey = generateAdminKey();
  const branding = brandingStore.load();
  const session = {
    code,
    adminHash: hashAdminKey(adminKey),
    createdAt: Date.now(),
    slides,
    activeSlideIndex: 0,
    participants: new Set(),
    votes: new Map(),
    paused: false,
    lobby: body.skipLobby === true || body.type === "demo" ? false : true,
    rehearsal: body.rehearsal === true,
    passwordHash: body.password ? hashPassword(body.password) : "",
    retentionDays: branding.retentionDays,
    quizTotals: {},
    powerups: {},
    teams: {},
    eventId: String(body.eventId || "").slice(0, 40),
    ownerUserId: String(body.ownerUserId || "").slice(0, 40),
  };
  sessions.set(code, session);
  await persistNow(session);
  metrics.setSessions(sessions.size);
  audit.log("session_created", { roomId: code });
  return { session, adminKey };
}

async function getSession(code) {
  if (!code) return null;
  if (sessions.has(code)) return sessions.get(code);
  const row = await Promise.resolve(db.load(code));
  if (!row) return null;
  const session = hydrate(row);
  sessions.set(code, session);
  restoreQaTimers(session);
  return session;
}

function hydrate(row) {
  const payload = row.payload || {};
  return {
    code: row.code,
    adminHash: row.adminHash,
    createdAt: row.createdAt,
    slides: payload.slides || [],
    activeSlideIndex: row.activeSlideIndex || 0,
    participants: new Set(),
    votes: new Map(payload.votes || []),
    paused: Boolean(payload.paused),
    lobby: Boolean(payload.lobby),
    rehearsal: Boolean(payload.rehearsal),
    passwordHash: payload.passwordHash || "",
    retentionDays: payload.retentionDays,
    emergencyBackup: payload.emergencyBackup || {},
    quizTotals: payload.quizTotals || {},
    powerups: payload.powerups || {},
    teams: payload.teams || {},
    eventId: payload.eventId || "",
    ownerUserId: payload.ownerUserId || "",
  };
}

function schedulePersist(session) {
  const prev = persistTimers.get(session.code);
  if (prev) clearTimeout(prev);
  persistTimers.set(
    session.code,
    setTimeout(() => {
      persistTimers.delete(session.code);
      persistNow(session).catch((err) => console.error("[persist]", err));
    }, 200)
  );
}

async function persistNow(session) {
  await Promise.resolve(
    db.save({
      code: session.code,
      adminHash: session.adminHash,
      createdAt: session.createdAt,
      activeSlideIndex: session.activeSlideIndex,
      payload: {
        slides: session.slides,
        votes: [...session.votes.entries()],
        paused: session.paused,
        lobby: Boolean(session.lobby),
        rehearsal: Boolean(session.rehearsal),
        passwordHash: session.passwordHash || "",
        retentionDays: session.retentionDays,
        emergencyBackup: session.emergencyBackup || {},
        quizTotals: session.quizTotals || {},
        powerups: session.powerups || {},
        teams: session.teams || {},
        eventId: session.eventId || "",
        ownerUserId: session.ownerUserId || "",
      },
    })
  );
}

function normalizeSlide(raw = {}) {
  const id = raw.id || crypto.randomBytes(4).toString("hex");
  let slide;
  if (raw.type === "rating_scale" || raw.type === "rating") {
    const scale = raw.scale === 7 || raw.scale === 10 ? raw.scale : 5;
    const options = Array.from({ length: scale }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
    const counts = {};
    for (const o of options) counts[o.id] = 0;
    slide = {
      id,
      type: "rating_scale",
      question: raw.question || "Wie bewerten Sie das?",
      scale,
      style: raw.style || "icons",
      rating: raw.rating || {
        scale,
        labels:
          scale === 5
            ? ["Sehr schlecht", "Schlecht", "Neutral", "Gut", "Sehr gut"]
            : undefined,
        icons: ["😠", "😕", "😐", "🙂", "😍"],
      },
      options,
      counts,
      previousAverage: raw.previousAverage,
      resultsVisible: raw.resultsVisible === true,
    };
  } else if (raw.type === "wordcloud") {
    slide = {
      id,
      type: "wordcloud",
      question: raw.question || "Ein Wort bitte",
      entries: [],
      resultsVisible: raw.resultsVisible === true,
    };
  } else if (raw.type === "qa") {
    slide = {
      id,
      type: "qa",
      question: raw.question || "Fragen an das Podium",
      moderated: raw.moderated !== false,
      questions: raw.questions || [],
      qaTimer: qaTimer.normalize(raw.qaTimer),
    };
  } else if (raw.type === "quiz") {
    const options = slideTypes.normalizeOptions(raw.options);
    const correctIndexes = slideTypes.normalizeCorrectIndexes(raw, options.length);
    slide = {
      id,
      type: "quiz",
      question: raw.question || "Quizfrage",
      options,
      correctIndexes,
      correctIndex: correctIndexes[0],
      duration: clamp(Number(raw.duration) || 30, 5, 60),
      round: { status: "idle" },
      scores: raw.scores || {},
    };
  } else if (raw.type === "ranking") {
    const options = slideTypes.normalizeOptions(raw.options);
    slide = {
      id,
      type: "ranking",
      question: raw.question || "Bitte sortieren",
      options,
      ranks: {},
      voteCount: 0,
      resultsVisible: raw.resultsVisible === true,
    };
  } else if (raw.type === "points100") {
    const options = slideTypes.normalizeOptions(raw.options);
    slide = {
      id,
      type: "points100",
      question: raw.question || "100 Punkte verteilen",
      options,
      sums: slideTypes.emptyCounts(options),
      voteCount: 0,
      resultsVisible: raw.resultsVisible === true,
    };
  } else if (raw.type === "open_text") {
    slide = {
      id,
      type: "open_text",
      question: raw.question || "Was möchtet ihr mitgeben?",
      entries: [],
      voteCount: 0,
      resultsVisible: raw.resultsVisible === true,
    };
  } else if (raw.type === "image_choice") {
    const options = slideTypes.normalizeOptions(raw.options, { withImage: true });
    slide = {
      id,
      type: "image_choice",
      question: raw.question || "Welches Bild passt?",
      options,
      counts: slideTypes.emptyCounts(options),
      voteCount: 0,
      resultsVisible: raw.resultsVisible === true,
    };
  } else if (raw.type === "datetime") {
    const options = slideTypes.normalizeOptions(raw.options || raw.slots, { withIso: true });
    slide = {
      id,
      type: "datetime",
      question: raw.question || "Wann passt es?",
      options,
      counts: slideTypes.emptyCounts(options),
      voteCount: 0,
      resultsVisible: raw.resultsVisible === true,
    };
  } else if (raw.type === "picker") {
    const check = slideTypes.validatePickerSlide(raw);
    if (!check.ok) throw new Error(check.error);
    const { options, categories } = slideTypes.normalizePickerOptions(raw.options, {
      categories: raw.categories,
    });
    const allowMultiple = raw.allowMultiple === true;
    let maxSelections = null;
    if (allowMultiple && raw.maxSelections != null && raw.maxSelections !== "") {
      maxSelections = Math.max(1, Math.min(options.length, Number(raw.maxSelections) || 1));
    }
    const enableSearch =
      raw.enableSearch === false ? false : raw.enableSearch === true || options.length > 20;
    const layout = ["list", "grid", "dropdown"].includes(raw.layout) ? raw.layout : "list";
    slide = {
      id,
      type: "picker",
      question: raw.question || "Wählen Sie eine Option",
      subtitle: String(raw.subtitle || "").trim().slice(0, 200),
      options,
      categories,
      allowMultiple,
      maxSelections,
      enableSearch,
      showOptionIcons: raw.showOptionIcons !== false,
      layout,
      counts: slideTypes.emptyCounts(options),
      voteCount: 0,
      resultsVisible: raw.resultsVisible === true,
    };
  } else {
    const options = slideTypes.normalizeOptions(raw.options);
    slide = {
      id,
      type: "choice",
      question: raw.question || "Eure Stimme?",
      options,
      counts: slideTypes.emptyCounts(options),
      resultsVisible: raw.resultsVisible === true,
    };
  }
  /* Notizen und Zeitplan bleiben am Slide, gehen aber nicht in publicSlide ohne reveal. */
  return { ...slide, ...liveState.presenterMeta(raw) };
}

function demoSlides(question) {
  return [
    normalizeSlide({
      type: "choice",
      question: question || "Welches Thema sollen wir als Nächstes vertiefen?",
      resultsVisible: true,
      options: [
        { id: "o1", label: "Performance" },
        { id: "o2", label: "UX & Typografie" },
        { id: "o3", label: "Echtzeit-Architektur" },
        { id: "o4", label: "Barrierefreiheit" },
      ],
    }),
    normalizeSlide({ type: "wordcloud", question: "Ein Wort, das diesen Workshop beschreibt", resultsVisible: true }),
    normalizeSlide({
      type: "qa",
      question: "Welche Fragen habt ihr an das Podium?",
      questions: [
        { id: "d1", text: "Wie wird KI in der Verwaltung eingesetzt?", authorId: "demo", authorName: "Alex", upvotes: 23, voters: [], status: "approved", createdAt: Date.now() - 80000, comments: [] },
        { id: "d2", text: "Gibt es Schulungen für neue Tools?", authorId: "demo2", authorName: "Sam", upvotes: 18, voters: [], status: "pending", createdAt: Date.now() - 50000, comments: [] },
        { id: "d3", text: "Wann kommt das nächste Townhall?", authorId: "demo3", authorName: "Kim", upvotes: 15, voters: [], status: "answered", createdAt: Date.now() - 20000, comments: [] },
      ],
    }),
    normalizeSlide({
      type: "quiz",
      question: "Welche Technologie nutzen wir für WebSocket?",
      options: [
        { id: "o1", label: "HTTP" },
        { id: "o2", label: "Socket.io" },
        { id: "o3", label: "FTP" },
        { id: "o4", label: "SMTP" },
      ],
      correctIndex: 1,
      duration: 30,
    }),
    normalizeSlide({
      type: "rating_scale",
      question: "Wie zufrieden sind Sie mit diesem Format?",
      scale: 5,
      resultsVisible: true,
    }),
  ];
}

function defaultOptions() {
  return [
    { id: "o1", label: "Option A" },
    { id: "o2", label: "Option B" },
  ];
}

function resetSlide(slide) {
  slide.counts = {};
  if (slide.options) for (const o of slide.options) slide.counts[o.id] = 0;
  slide.entries = [];
  slide.ranks = {};
  if (slide.type === "points100") slide.sums = slideTypes.emptyCounts(slide.options || []);
  slide.voteCount = 0;
  if (slide.type === "qa") {
    slide.questions = [];
    slide.qaTimer = qaTimer.empty();
  }
  if (slide.type === "quiz") {
    slide.round = { status: "idle" };
    slide.scores = {};
  }
  if (liveState.canHideResults(slide)) slide.resultsVisible = false;
}

function publicSession(session, opts = {}) {
  return {
    code: session.code,
    activeSlideIndex: session.activeSlideIndex,
    participantCount: session.participants.size,
    paused: Boolean(session.paused),
    lobby: Boolean(session.lobby),
    rehearsal: Boolean(session.rehearsal),
    slides: session.slides.map((s) => publicSlide(s, opts)),
    quizOverall: opts.reveal ? interactive.buildOverallLeaderboard(session) : undefined,
    eventId: session.eventId || "",
    eventBranding: eventBrandingFor(session.eventId),
    eventMeta: eventStore.eventMetaFor(session.eventId),
    serverNow: Date.now(),
  };
}

/**
 * Rollenabhängige Public-Opts: Presenter sieht Notizen, Stage sieht Ergebnisse
 * ohne Notizen, Join weder Notizen noch versteckte Balken.
 * @param {{ role?: string, id?: string }} client
 */
function publicOptsForClient(client) {
  if (client.role === "presenter") {
    return { reveal: true, revealNotes: true, revealResults: true, viewerId: client.id };
  }
  if (client.role === "stage") {
    return { reveal: true, revealNotes: false, revealResults: true, stage: true, viewerId: client.id };
  }
  return { reveal: false, revealNotes: false, revealResults: false, viewerId: client.id };
}

function publicSlide(slide, opts = {}) {
  const revealResults = Boolean(opts.revealResults ?? opts.reveal);
  const revealNotes = Boolean(opts.revealNotes || (opts.reveal && !opts.stage));
  const hidden = liveState.canHideResults(slide) && !slide.resultsVisible && !revealResults;
  const voteCount = liveState.voteCount(slide);
  let out;
  if (slide.type === "wordcloud") {
    out = {
      id: slide.id,
      type: slide.type,
      question: slide.question,
      entries: hidden ? [] : [...(slide.entries || [])].sort((a, b) => b.count - a.count),
      resultsVisible: Boolean(slide.resultsVisible),
      voteCount,
    };
  } else if (slide.type === "qa") {
    out = interactive.publicQaSlide(slide, revealNotes, opts.viewerId);
  } else if (slide.type === "quiz") {
    out = interactive.publicQuizSlide(slide, revealNotes);
  } else if (slide.type === "rating_scale") {
    out = {
      id: slide.id,
      type: slide.type,
      question: slide.question,
      options: slide.options,
      counts: hidden ? {} : { ...slide.counts },
      scale: slide.scale,
      style: slide.style,
      rating: slide.rating,
      previousAverage: hidden ? undefined : slide.previousAverage,
      resultsVisible: Boolean(slide.resultsVisible),
      voteCount,
    };
  } else if (slide.type === "ranking") {
    out = {
      id: slide.id,
      type: slide.type,
      question: slide.question,
      options: slide.options,
      resultsVisible: Boolean(slide.resultsVisible),
      voteCount,
    };
    if (!hidden) Object.assign(out, slideVotes.extraResults(slide));
  } else if (slide.type === "points100") {
    out = {
      id: slide.id,
      type: slide.type,
      question: slide.question,
      options: slide.options,
      resultsVisible: Boolean(slide.resultsVisible),
      voteCount,
    };
    if (!hidden) Object.assign(out, slideVotes.extraResults(slide));
  } else if (slide.type === "open_text") {
    out = {
      id: slide.id,
      type: slide.type,
      question: slide.question,
      entries: hidden ? [] : [...(slide.entries || [])].sort((a, b) => b.count - a.count),
      resultsVisible: Boolean(slide.resultsVisible),
      voteCount,
    };
  } else {
    out = {
      id: slide.id,
      type: slide.type,
      question: slide.question,
      options: slide.options,
      counts: hidden ? {} : { ...slide.counts },
      resultsVisible: Boolean(slide.resultsVisible),
      voteCount,
    };
  }
  /* notes / plannedMinutes nur mit Admin-Reveal, analog Quiz-Lösungen. */
  return { ...out, ...liveState.presenterOnlyFields(slide, opts) };
}

/**
 * Folienliste ändern und an alle Clients schicken.
 * Präsentatoren bekommen Quiz-Lösungen (reveal), Teilnehmende nicht.
 */
function mutateDeck(session, action, payload) {
  const out = applyDeckAction(session, action, payload, { normalizeSlide });
  if (out.error) return out;
  schedulePersist(session);
  audit.log("deck_updated", { roomId: session.code, action, userId: "presenter" });
  /* Patch nur Notizen/Zeit: nicht an Teilnehmende funken, Cursor im Panel bleibt. */
  if (action !== "patch") {
    announceDeck(session);
    /* Zusätzliches Event für Presenter-Views, die gezielt auf Folien-Updates hören. */
    if (action === "update" && out.slide) {
      announceSlideUpdated(session, out.slide);
    }
  }
  return out;
}

/**
 * Einzelne Folie aktualisiert — Presenter + Teilnehmende der aktiven Folie.
 * @param {object} session
 * @param {object} slide
 */
function announceSlideUpdated(session, slide) {
  const active = session.slides[session.activeSlideIndex];
  for (const client of clients) {
    if (client.sessionCode !== session.code) continue;
    const isPresenter = client.role === "presenter";
    const isActive = active && active.id === slide.id;
    if (!isPresenter && !isActive) continue;
    client.send({
      type: "slide_updated",
      payload: {
        slide: publicSlide(slide, publicOptsForClient(client)),
        activeSlideIndex: session.activeSlideIndex,
      },
    });
    metrics.incWs("out", "slide_updated");
  }
}

function announceDeck(session, { skipBus } = {}) {
  for (const client of clients) {
    if (client.sessionCode !== session.code) continue;
    client.send({
      type: "deck",
      payload: {
        slides: session.slides.map((s) => publicSlide(s, publicOptsForClient(client))),
        activeSlideIndex: session.activeSlideIndex,
      },
    });
    metrics.incWs("out", "deck");
  }
  if (!skipBus) {
    bus.publish(session.code, {
      type: "deck",
      payload: { slides: session.slides, activeSlideIndex: session.activeSlideIndex, internal: true },
    });
  }
}

function announceQuestion(session, question) {
  const envelope = { type: "new_question", payload: question };
  if (!question?.private) {
    announce(session.code, envelope);
    return;
  }
  /* Private Fragen nur an Presenter und Autor — nicht in die öffentliche Liste. */
  for (const client of clients) {
    if (client.sessionCode !== session.code) continue;
    if (client.role === "presenter" || client.id === question.authorId) {
      client.send(envelope);
      metrics.incWs("out", "new_question");
    }
  }
}

function announceResults(session, slide) {
  const type = slide.type === "wordcloud" ? "wordcloud:update" : "poll:update";
  announce(session.code, { type, payload: liveState.fanoutResultsPayload(slide) });
  announce(session.code, {
    type: "results",
    payload: { slideId: slide.id, resultsVisible: Boolean(slide.resultsVisible), voteCount: liveState.voteCount(slide) },
  });
}

/**
 * Presenter-Aktion am Q&A-Timer (WS qa_timer / REST POST /api/qa/timer).
 * Auto-Ende über setTimeout anhand endsAt — kein 1-Hz-Broadcast.
 * @param {Session} session
 * @param {object} payload
 */
function applyQaTimerControl(session, payload = {}) {
  const slide = interactive.findQaSlide(session, payload.slideId);
  if (!slide) return { error: "Keine Q&A-Folie" };
  const action = String(payload.action || "");
  if (!action) return { error: "Aktion fehlt" };
  slide.qaTimer = qaTimer.apply(slide.qaTimer, action, {
    limitSec: payload.limitSec,
    seconds: payload.seconds,
  });
  scheduleQaEnd(session, slide);
  schedulePersist(session);
  const snap = qaTimer.snapshot(slide.qaTimer);
  announceQaTimer(session, slide, snap);
  return { slideId: slide.id, qaTimer: snap, serverNow: snap.serverNow };
}

function announceQaTimer(session, slide, snap) {
  const payload = {
    slideId: slide.id,
    qaTimer: snap || qaTimer.snapshot(slide.qaTimer),
    serverNow: Date.now(),
  };
  announce(session.code, { type: "qa_timer", payload });
}

/**
 * setTimeout bis endsAt. Nach Ablauf Status ended und einmal qa_timer an alle.
 * @param {Session} session
 * @param {object} slide
 */
function scheduleQaEnd(session, slide) {
  const key = `${session.code}:${slide.id}`;
  const prev = qaEndTimers.get(key);
  if (prev) clearTimeout(prev);
  qaEndTimers.delete(key);
  const delay = qaTimer.msUntilEnd(slide.qaTimer);
  const status = qaTimer.normalize(slide.qaTimer).status;
  if (status !== "running") return;
  qaEndTimers.set(
    key,
    setTimeout(() => {
      qaEndTimers.delete(key);
      const live = sessions.get(session.code);
      const current = live?.slides.find((s) => s.id === slide.id && s.type === "qa");
      if (!current) return;
      const still = qaTimer.snapshot(current.qaTimer);
      if (still.status !== "ended" && still.status !== "running") return;
      current.qaTimer = qaTimer.end(current.qaTimer);
      schedulePersist(live);
      announceQaTimer(live, current);
    }, delay + 25)
  );
}

/**
 * Nach DB-Restore: abgelaufene Timer beenden, laufende Timeouts neu setzen.
 * @param {Session} session
 */
function restoreQaTimers(session) {
  if (!session?.slides) return;
  for (const slide of session.slides) {
    if (slide.type !== "qa") continue;
    slide.qaTimer = qaTimer.normalize(slide.qaTimer);
    const snap = qaTimer.snapshot(slide.qaTimer);
    if (slide.qaTimer.status === "running" && snap.status === "ended") {
      slide.qaTimer = qaTimer.end(slide.qaTimer);
    }
    scheduleQaEnd(session, slide);
  }
}

function clearQaEndTimers(code) {
  const prefix = `${code}:`;
  for (const [key, timer] of qaEndTimers) {
    if (!String(key).startsWith(prefix)) continue;
    clearTimeout(timer);
    qaEndTimers.delete(key);
  }
}

/* ----------------------------- WebSocket-Logik ---------------------- */

async function onWsMessage(client, data) {
  if (!data || typeof data !== "object") return;
  const { type, payload = {} } = data;
  if (type === "ping") {
    client.send({ type: "pong", ts: Date.now(), serverNow: Date.now() });
    return;
  }
  if (type === "batch" && Array.isArray(payload.updates)) {
    for (const item of payload.updates) {
      await onWsMessage(client, item);
    }
    return;
  }
  if (type === "join") {
    await joinSession(client, payload);
    return;
  }
  /* Stage ist reine Leseansicht: außer join/ping keine Send-Calls. */
  if (client.role === "stage") return;
  const session = await getSession(payload.code || client.sessionCode);
  if (!session) {
    client.send({ type: "error", payload: { message: "Session nicht gefunden" } });
    return;
  }
  if (type === "vote") applyVote(session, client, payload);
  else if (type === "word") applyWord(session, client, payload);
  else if (type === "reaction") applyReaction(session, client, payload);
  else if (type === "lobby") {
    if (client.role !== "presenter") return;
    session.lobby = payload.lobby !== false;
    schedulePersist(session);
    announce(session.code, { type: "lobby", payload: { lobby: session.lobby } });
  } else if (type === "results") {
    if (client.role !== "presenter") return;
    const slide =
      session.slides.find((s) => s.id === payload.slideId) || session.slides[session.activeSlideIndex];
    if (!slide || !liveState.canHideResults(slide)) return;
    slide.resultsVisible = payload.visible !== false;
    schedulePersist(session);
    announceResults(session, slide);
  } else if (type === "submit_question" || type === "new_question") {
    if (session.lobby) {
      client.send({ type: "error", payload: { error: "lobby", message: "Warten auf den Start" } });
      return;
    }
    if (session.paused) {
      client.send({ type: "error", payload: { message: "Session pausiert" } });
      return;
    }
    const out = intake.intakeQuestion(session, client, payload, brandingStore.load());
    if (out.error) {
      client.send({ type: "error", payload: out });
      return;
    }
    schedulePersist(session);
    announceQuestion(session, out.question);
  } else if (type === "upvote_question" || type === "question_upvoted") {
    if (session.paused) return;
    const out = intake.intakeUpvote(session, client, payload.questionId || payload.id);
    if (out.error === "rate") {
      client.send({ type: "error", payload: out });
      return;
    }
    if (out.question) {
      schedulePersist(session);
      announce(session.code, {
        type: "question_upvoted",
        payload: { questionId: out.question.id, count: out.question.upvotes, question: out.question },
      });
    }
  } else if (type === "moderate_question") {
    if (client.role !== "presenter") return;
    const action = payload.action;
    const extra = {
      text: payload.text,
      keepId: payload.keepId || payload.questionId || payload.id,
      mergeIds: payload.mergeIds || payload.ids,
    };
    const out = interactive.moderateQuestion(session, payload.questionId || payload.id || extra.keepId, action, extra);
    if (out.question) {
      schedulePersist(session);
      announce(session.code, {
        type: "question_moderated",
        payload: { questionId: out.question.id, status: out.question.status, question: out.question, grouped: out.grouped },
      });
    }
  } else if (type === "quiz_start") {
    if (client.role !== "presenter") return;
    if (session.lobby) return;
    const out = interactive.startQuiz(session, payload, announce);
    if (out.error) return;
    schedulePersist(session);
    announce(session.code, { type: "quiz_started", payload: out });
  } else if (type === "quiz_answer") {
    const out = interactive.submitAnswer(session, client, payload);
    schedulePersist(session);
    if (!out?.error) publishQuizAnswerSync(session, client, payload);
  } else if (type === "quiz_powerup") {
    const out = interactive.usePowerup(session, client, payload);
    if (out.error) {
      client.send({ type: "error", payload: out });
      return;
    }
    schedulePersist(session);
    client.send({ type: "quiz_powerup", payload: out });
  } else if (type === "quiz_end") {
    if (client.role !== "presenter") return;
    const slide = interactive.findQuizSlide(session, payload.questionId || payload.slideId);
    if (slide) {
      interactive.endQuiz(session, slide, announce);
      schedulePersist(session);
    }
  } else if (type === "emergency") {
    if (client.role !== "presenter") return;
    if (payload.action === "resume") intake.resumeEmergency(session);
    else intake.activateEmergency(session);
    schedulePersist(session);
    audit.log("emergency", { roomId: session.code, action: payload.action || "activate", userId: client.id });
    announceEmergency(session);
  } else if (type === "deck") {
    if (client.role !== "presenter") return;
    const out = mutateDeck(session, payload.action || "add", payload);
    if (out.error) {
      client.send({ type: "error", payload: { error: out.error, message: out.error } });
    }
  } else if (type === "slide") {
    if (client.role !== "presenter") return;
    session.activeSlideIndex = clamp(Number(payload.index) || 0, 0, session.slides.length - 1);
    schedulePersist(session);
    announceSlide(session);
  } else if (type === "reset") {
    if (client.role !== "presenter") return;
    for (const slide of session.slides) resetSlide(slide);
    session.votes.clear();
    clearQaEndTimers(session.code);
    schedulePersist(session);
    announceSession(session);
  } else if (type === "qa_timer") {
    if (client.role !== "presenter") return;
    applyQaTimerControl(session, payload);
  }
}

/**
 * Session-Stand rollenbasiert: Presenter sehen Notizen, Join nicht.
 */
function announceSession(session) {
  for (const client of clients) {
    if (client.sessionCode !== session.code) continue;
    client.send({
      type: "session",
      payload: { session: publicSession(session, publicOptsForClient(client)) },
    });
    metrics.incWs("out", "session");
  }
  bus.publish(session.code, {
    type: "session",
    payload: { session: publicSession(session, { reveal: true }), internal: true },
  });
}

/**
 * Folienwechsel: Join bekommt die Folie ohne notes/plannedMinutes.
 */
function announceSlide(session) {
  const index = session.activeSlideIndex;
  const slide = session.slides[index];
  for (const client of clients) {
    if (client.sessionCode !== session.code) continue;
    client.send({
      type: "slide",
      payload: { index, slide: publicSlide(slide, publicOptsForClient(client)) },
    });
    metrics.incWs("out", "slide");
  }
  bus.publish(session.code, {
    type: "slide",
    payload: { index, slide, internal: true },
  });
}

async function joinSession(client, payload = {}) {
  const code = payload.code;
  const role = payload.role;
  const adminKey = payload.adminKey;
  const ev = eventByJoinCode(code);
  if (ev) {
    const isStaff = role === "presenter" || role === "stage";
    if (ev.status === "planned" && !isStaff) {
      client.send({ type: "error", payload: { message: "Dieses Event nimmt noch keine Teilnahmen an." } });
      return;
    }
    if (ev.status === "archived" && !isStaff) {
      client.send({ type: "error", payload: { message: "Dieses Event ist archiviert." } });
      return;
    }
    if (isStaff || ev.status === "active" || ev.status === "ended") {
      await ensureEventSession(ev);
    }
  }
  const session = await getSession(code);
  if (!session) {
    client.send({ type: "error", payload: { message: "Session nicht gefunden" } });
    return;
  }
  if (client.sessionCode && client.sessionCode !== code) leaveSession(client);
  const wantPresenter = role === "presenter";
  const wantStage = role === "stage";
  const byKey = verifyAdminKey(adminKey, session.adminHash);
  const byPw = Boolean(session.passwordHash && verifyPassword(payload.password, session.passwordHash));
  if (wantStage) {
    /* Leinwand: keine Auth, nicht als Teilnehmer zählen, keine Notizen. */
    client.role = "stage";
  } else if (wantPresenter && !byKey && !byPw) {
    client.send({ type: "error", payload: { message: "Ungültiger Admin-Schlüssel" } });
    client.role = "participant";
  } else {
    client.role = wantPresenter ? "presenter" : "participant";
  }
  client.sessionCode = code;
  if (payload && /^[a-zA-Z0-9_-]{4,32}$/.test(String(payload.clientId || ""))) {
    client.id = String(payload.clientId);
  }
  if (payload.teamName) interactive.rememberTeam(session, client, payload.teamName);
  if (client.role === "participant") session.participants.add(client.id);
  client.send({ type: "session", payload: { session: publicSession(session, publicOptsForClient(client)) } });
  announce(code, { type: "participants", payload: { count: session.participants.size } });
}

function leaveSession(client) {
  const session = sessions.get(client.sessionCode);
  if (!session) return;
  session.participants.delete(client.id);
  announce(client.sessionCode, { type: "participants", payload: { count: session.participants.size } });
  client.sessionCode = null;
}

function applyVote(session, client, payload) {
  if (session.paused || session.lobby) {
    client.send({ type: "error", payload: { error: session.lobby ? "lobby" : "paused", message: session.lobby ? "Warten auf den Start" : "Session pausiert" } });
    return;
  }
  const slide = session.slides.find((s) => s.id === payload.slideId) || session.slides[session.activeSlideIndex];
  if (!slide) return;
  if (slide.type === "choice" || slide.type === "rating_scale") {
    const key = `${client.id}:${slide.id}`;
    if (session.votes.has(key)) return;
    if (!(payload.optionId in slide.counts)) return;
    session.votes.set(key, payload.optionId);
    slide.counts[payload.optionId] += 1;
    metrics.counters.votes += 1;
    schedulePersist(session);
    announce(session.code, { type: "poll:update", payload: liveState.fanoutResultsPayload(slide) });
    return;
  }
  const typed = ["ranking", "points100", "open_text", "image_choice", "datetime", "picker"];
  if (!typed.includes(slide.type)) return;
  const out = slideVotes.applyTypedVote(session, client, payload, slide, brandingStore.load());
  if (out.error) {
    client.send({ type: "error", payload: out });
    return;
  }
  metrics.counters.votes += 1;
  schedulePersist(session);
  const kind = slide.type === "open_text" ? "wordcloud:update" : "poll:update";
  announce(session.code, { type: kind, payload: liveState.fanoutResultsPayload(slide) });
}

function applyWord(session, client, payload) {
  if (session.paused || session.lobby) {
    client.send({ type: "error", payload: { error: session.lobby ? "lobby" : "paused", message: session.lobby ? "Warten auf den Start" : "Session pausiert" } });
    return;
  }
  const slide = session.slides.find((s) => s.id === payload.slideId) || session.slides[session.activeSlideIndex];
  if (!slide || slide.type !== "wordcloud") return;
  const prepared = slideVotes.prepareWord(payload.text, brandingStore.load());
  if (prepared.error) {
    client.send({ type: "error", payload: prepared });
    return;
  }
  const text = prepared.text;
  const entries = slide.entries || (slide.entries = []);
  const found = entries.find((e) => e.text.toLowerCase() === text.toLowerCase());
  if (found) found.count += 1;
  else entries.push({ text, count: 1 });
  metrics.counters.words += 1;
  schedulePersist(session);
  announce(session.code, { type: "wordcloud:update", payload: liveState.fanoutResultsPayload(slide) });
}

function applyReaction(session, client, payload) {
  if (!liveState.allowedReaction(payload.emoji)) return;
  const limit = rateLimiter.checkRateLimit(client.id, "reaction");
  if (!limit.allowed) {
    client.send({ type: "error", payload: { error: "rate", waitTime: Math.ceil(limit.waitTime / 1000) } });
    return;
  }
  rateLimiter.record(client.id, "reaction");
  announce(session.code, { type: "reaction", payload: { emoji: payload.emoji } });
}

function applyRemoteEnvelope(code, envelope) {
  const session = sessions.get(code);
  liveState.applyFanoutEnvelope(session, envelope);
}

/**
 * Lokales Batching: 500 Stimmen in 100 ms werden zu EINER poll:update.
 * slide/session/error gehen sofort raus (Steuerung, kein Hochfrequenz-Event).
 * Redis-Fanout (bus.publish) trägt volle Zählwerte; sendToRoom strippt für Join.
 */
function announce(code, envelope) {
  enqueueBroadcast(code, envelope, { skipBus: false });
}

/**
 * Notfall inkl. Q&A-Status für andere Node-Prozesse; Browser sehen nur paused.
 * @param {Session} session
 */
function announceEmergency(session) {
  const qaStatuses = (session.slides || [])
    .filter((s) => s.type === "qa")
    .map((s) => ({
      id: s.id,
      questions: (s.questions || []).map((q) => ({ id: q.id, status: q.status })),
    }));
  announce(session.code, {
    type: session.paused ? "emergency_activated" : "emergency_resumed",
    payload: {
      paused: Boolean(session.paused),
      emergencyBackup: session.emergencyBackup || {},
      qaStatuses,
    },
  });
}

/**
 * Quiz-Antwort auf andere Prozesse spiegeln, ohne sie an Teilnehmende zu funken.
 */
function publishQuizAnswerSync(session, client, payload) {
  const slide = interactive.findQuizSlide(session, payload.questionId || payload.slideId);
  const answer = slide?.round?.answers?.[client.id];
  if (!slide || !answer) return;
  bus.publish(session.code, {
    type: "quiz_answer_sync",
    payload: { slideId: slide.id, clientId: client.id, answer },
  });
}

function enqueueBroadcast(code, envelope, { skipBus }) {
  const qa =
    envelope.type === "new_question" ||
    envelope.type === "question_upvoted" ||
    envelope.type === "question_moderated";
  if (qa) {
    enqueueQa(code, envelope, skipBus);
    return;
  }
  const coalesce =
    envelope.type === "poll:update" ||
    envelope.type === "wordcloud:update" ||
    envelope.type === "participants" ||
    envelope.type === "quiz_timer" ||
    envelope.type === "leaderboard_update";
  if (!coalesce) {
    sendToRoom(code, envelope);
    if (!skipBus) bus.publish(code, envelope);
    metrics.counters.broadcasts += 1;
    return;
  }
  let buf = batches.get(code);
  if (!buf) {
    buf = { timer: null, last: new Map(), skipBus: true };
    batches.set(code, buf);
  }
  buf.last.set(envelope.type, envelope);
  buf.skipBus = buf.skipBus && skipBus;
  if (!buf.timer) {
    buf.timer = setTimeout(() => flushBatch(code), BATCH_INTERVAL);
  }
}

function flushBatch(code) {
  const buf = batches.get(code);
  if (!buf) return;
  batches.delete(code);
  const updates = [...buf.last.values()];
  if (!updates.length) return;
  const envelope =
    updates.length === 1 ? updates[0] : { type: "batch", payload: { updates } };
  sendToRoom(code, envelope);
  if (!buf.skipBus) {
    for (const item of updates) bus.publish(code, item);
  }
  metrics.counters.broadcasts += 1;
  if (updates.length > 1) metrics.counters.batches += 1;
}

function enqueueQa(code, envelope, skipBus) {
  let buf = qaBatches.get(code);
  if (!buf) {
    buf = { timer: null, queue: [], last: new Map(), skipBus: true };
    qaBatches.set(code, buf);
  }
  if (envelope.type === "new_question") buf.queue.push(envelope);
  else buf.last.set(envelope.type + (envelope.payload?.questionId || ""), envelope);
  buf.skipBus = buf.skipBus && skipBus;
  if (!buf.timer) buf.timer = setTimeout(() => flushQa(code), 1000);
}

function flushQa(code) {
  const buf = qaBatches.get(code);
  if (!buf) return;
  qaBatches.delete(code);
  const updates = [...buf.queue, ...buf.last.values()];
  if (!updates.length) return;
  const envelope = updates.length === 1 ? updates[0] : { type: "batch", payload: { updates } };
  sendToRoom(code, envelope);
  if (!buf.skipBus) for (const item of updates) bus.publish(code, item);
  metrics.counters.broadcasts += 1;
  if (updates.length > 1) metrics.counters.batches += 1;
}

function sendToRoom(code, envelope) {
  for (const client of clients) {
    if (client.sessionCode !== code) continue;
    const mapped = mapEnvelopeForClient(client, envelope);
    if (!mapped) continue;
    client.send(mapped);
    metrics.incWs("out", mapped.type);
  }
}

/**
 * Presenter und Stage behalten volle Zählwerte trotz Hidden;
 * Join sieht nur voteCount, bis der Präsentator revealt.
 * @param {{ role?: string }} client
 * @param {object} envelope
 */
function mapEnvelopeForClient(client, envelope) {
  const revealResults = client.role === "presenter" || client.role === "stage";
  if (envelope.type === "batch" && Array.isArray(envelope.payload?.updates)) {
    const updates = envelope.payload.updates
      .map((item) => liveState.toClientEnvelope(item, { revealResults }))
      .filter(Boolean);
    if (!updates.length) return null;
    return updates.length === 1 ? updates[0] : { type: "batch", payload: { updates } };
  }
  return liveState.toClientEnvelope(envelope, { revealResults });
}

/* ----------------------------- WS-Frames ---------------------------- */

class Client {
  constructor(socket) {
    this.id = crypto.randomBytes(8).toString("hex");
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.sessionCode = null;
    this.role = "participant";
    this.onMessage = null;
    this.onClose = null;
    socket.on("data", (chunk) => this.#onData(chunk));
    socket.on("end", () => this.#close());
    socket.on("close", () => this.#close());
    socket.on("error", () => this.#close());
  }

  send(obj) {
    if (this.socket.destroyed) return;
    try {
      this.socket.write(encodeFrame(Buffer.from(JSON.stringify(obj)), 1));
    } catch {
      this.#close();
    }
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const parsed = decodeFrame(this.buffer);
      if (!parsed) break;
      this.buffer = parsed.rest;
      if (parsed.opcode === 8) {
        this.#close();
        return;
      }
      if (parsed.opcode === 9) {
        this.socket.write(encodeFrame(parsed.payload, 10));
        continue;
      }
      if (parsed.opcode === 1) {
        try {
          this.onMessage?.(JSON.parse(parsed.payload.toString("utf8")));
        } catch {
          /* ungültiges JSON ignorieren */
        }
      }
    }
  }

  #close() {
    if (this.socket.destroyed) {
      this.onClose?.();
      this.onClose = null;
      return;
    }
    try {
      this.socket.end();
    } catch {
      /* ignore */
    }
    this.onClose?.();
    this.onClose = null;
  }
}

function decodeFrame(buffer) {
  const b1 = buffer[1];
  const masked = Boolean(b1 & 0x80);
  let len = b1 & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < 4) return null;
    len = buffer.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buffer.length < 10) return null;
    len = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  if (len > MAX_PAYLOAD) return { opcode: 8, payload: Buffer.alloc(0), rest: Buffer.alloc(0) };
  const maskLen = masked ? 4 : 0;
  if (buffer.length < offset + maskLen + len) return null;
  let payload = buffer.subarray(offset + maskLen, offset + maskLen + len);
  if (masked) {
    const mask = buffer.subarray(offset, offset + maskLen);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  }
  return {
    opcode: buffer[0] & 0x0f,
    payload,
    rest: buffer.subarray(offset + maskLen + len),
  };
}

function encodeFrame(payload, opcode) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

/* ----------------------------- Helpers ------------------------------ */

/**
 * Authentifizierungskontext: Cookie-Session, ADMIN_SECRET oder Demo-Modus.
 */
async function getAuth(req, body = {}) {
  return authApi.resolveRequestAuth(req, userDb, readAdminKey, (secret) =>
    !process.env.ADMIN_SECRET || secret === process.env.ADMIN_SECRET
  );
}

/**
 * Admin für Instanz-Einstellungen: Rolle admin, ADMIN_SECRET oder Demo.
 */
async function isUpdateInstallAdmin(req, body = {}) {
  const auth = await getAuth(req, body);
  if (userService.isUserManagementEnabled(userDb)) {
    return permissions.isAdmin(auth.user);
  }
  return isSettingsAdmin(req, body);
}

/**
 * REST-API für GitHub-Release-Updates (nur Instanz-Admins).
 */
async function handleUpdatesApi(req, res, parts, ipKey) {
  if (!(await isSettingsAdmin(req, {}))) {
    send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
    return;
  }

  if (req.method === "GET" && parts[2] === "check") {
    try {
      const force = urlForceCheck(req);
      const info = await updateService.checkForUpdates({ force });
      send(res, 200, { info, config: updateService.getConfig() });
    } catch (err) {
      send(res, 502, { error: String(err.message || err) });
    }
    return;
  }

  if (req.method === "GET" && parts[2] === "info") {
    send(res, 200, updateService.getCachedInfo());
    return;
  }

  if (req.method === "GET" && parts[2] === "status") {
    send(res, 200, updateService.getStatus());
    return;
  }

  if (req.method === "GET" && parts[2] === "config") {
    send(res, 200, { config: updateService.getConfig() });
    return;
  }

  if (req.method === "PATCH" && parts[2] === "config") {
    const body = await readJson(req);
    const auth = await getAuth(req, body);
    if (!permissions.isAdmin(auth.user) && !auth.viaSecret) {
      if (userService.isUserManagementEnabled(userDb)) {
        send(res, 403, { error: "Nur Administratoren dürfen Update-Einstellungen ändern" });
        return;
      }
    }
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    const config = updateService.saveConfig(body);
    updateService.startBackgroundChecks();
    audit.log("update_config_changed", { userId: auth.user?.id || "admin", action: JSON.stringify(config) });
    send(res, 200, { config });
    return;
  }

  if (req.method === "POST" && parts[2] === "install") {
    if (!(await isUpdateInstallAdmin(req, {}))) {
      send(res, 403, { error: "Nur Administratoren dürfen Updates installieren" });
      return;
    }
    const body = await readJson(req);
    const auth = await getAuth(req, body);
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    send(res, 202, { ok: true, message: "Installation gestartet" });
    /* Antwort zuerst senden, dann asynchron installieren und neu starten. */
    setImmediate(() => {
      updateService
        .installUpdate({
          userId: auth.user?.id || "admin",
          ip: ipKey,
          tagName: body.tagName,
        })
        .then((result) => {
          audit.log("update_installed", {
            userId: auth.user?.id || "admin",
            action: `${result.fromVersion}->${result.toVersion}`,
          });
          if (auth.user?.id && userDb.supported) {
            Promise.resolve(userDb.revokeAllSessionsForUser(auth.user.id)).catch(() => {});
          }
          setTimeout(() => updateService.requestGracefulRestart("update"), 1500);
        })
        .catch((err) => {
          audit.log("update_failed", { userId: auth.user?.id || "admin", action: String(err.message || err) });
        });
    });
    return;
  }

  if (req.method === "POST" && parts[2] === "rollback") {
    if (!(await isUpdateInstallAdmin(req, {}))) {
      send(res, 403, { error: "Nur Administratoren dürfen Rollbacks ausführen" });
      return;
    }
    const auth = await getAuth(req, {});
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    const body = await readJson(req);
    try {
      const entry = await updateService.rollbackById(body.historyId);
      audit.log("update_rollback", { userId: auth.user?.id || "admin", action: entry.id });
      send(res, 200, { ok: true, entry });
    } catch (err) {
      send(res, 400, { error: String(err.message || err) });
    }
    return;
  }

  send(res, 404, { error: "Unbekannter Update-Endpunkt" });
}

/** Query-Parameter force=1 für erzwungene GitHub-Prüfung. */
function urlForceCheck(req) {
  try {
    const u = new URL(req.url, "http://localhost");
    return u.searchParams.get("force") === "1";
  } catch {
    return false;
  }
}

/**
 * Systemweite WebSocket-Nachricht (z. B. Update-Fortschritt, Server-Neustart).
 * @param {object} envelope
 */
function broadcastSystem(envelope) {
  for (const client of clients) {
    try {
      client.send(envelope);
      metrics.incWs("out", envelope.type || "system");
    } catch {
      /* Client bereits getrennt */
    }
  }
}

/** Graceful Shutdown: Sessions persistieren, Clients warnen, dann beenden. */
async function gracefulShutdown(reason = "shutdown") {
  broadcastSystem({
    type: "server_shutdown",
    payload: { reason, reconnectIn: 10, message: "Server startet neu — bitte kurz warten." },
  });
  for (const session of sessions.values()) {
    try {
      await Promise.resolve(db.save(session.code, sessionToPersistable(session)));
    } catch (err) {
      console.error("[shutdown-persist]", session.code, err);
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30000).unref();
}

updateService.registerProgressSink((event, payload) => {
  broadcastSystem({ type: event, payload });
});
updateService.registerShutdownHook(gracefulShutdown);

backupService.setHooks({
  persistSessions: async () => {
    for (const session of sessions.values()) {
      try {
        await Promise.resolve(db.save(session.code, sessionToPersistable(session)));
      } catch (err) {
        console.error("[backup-persist]", session.code, err);
      }
    }
  },
  broadcast: broadcastSystem,
  shutdown: gracefulShutdown,
});

autoBackup.startAutoBackup();

process.on("SIGTERM", () => gracefulShutdown("sigterm"));
process.on("SIGINT", () => gracefulShutdown("sigint"));

async function isSettingsAdmin(req, body = {}) {
  const auth = await getAuth(req, body);
  if (auth.viaSecret) return true;
  /* Mit Benutzerverwaltung: nur angemeldete Admins — kein Demo-Bypass. */
  if (userService.isUserManagementEnabled(userDb)) {
    return permissions.canAccessSettings(auth.user);
  }
  if (permissions.canAccessSettings(auth.user)) return true;
  if (!process.env.ADMIN_SECRET) return true;
  return false;
}

async function isEventAdmin(req, body = {}) {
  const auth = await getAuth(req, body);
  if (auth.viaSecret) return true;
  if (userService.isUserManagementEnabled(userDb)) {
    return permissions.isEditor(auth.user);
  }
  if (permissions.isEditor(auth.user)) return true;
  if (!process.env.ADMIN_SECRET) return true;
  return false;
}

async function canViewEvent(req, ev, body = {}) {
  const auth = await getAuth(req, body);
  if (auth.viaSecret || permissions.isAdmin(auth.user)) return true;
  const dbAccess = userDb.supported ? await Promise.resolve(userDb.listEventAccess(ev.id)) : [];
  const access = permissions.eventAccess(auth.user, ev, dbAccess);
  return access.view || access.edit || access.present;
}

async function canEditEvent(req, ev, body = {}) {
  const auth = await getAuth(req, body);
  if (auth.viaSecret || permissions.isAdmin(auth.user)) return true;
  const dbAccess = userDb.supported ? await Promise.resolve(userDb.listEventAccess(ev.id)) : [];
  return permissions.eventAccess(auth.user, ev, dbAccess).edit;
}

/** Instanz-Admin, Event-Berechtigung oder Presenter-Schlüssel dürfen das Session-Deck ändern. */
async function canManageSession(req, body, session) {
  if (verifyAdminKey(readAdminKey(req, body), session.adminHash)) return true;
  if (await isSettingsAdmin(req, body)) return true;
  const auth = await getAuth(req, body);
  if (session.ownerUserId && auth.user?.id === session.ownerUserId && permissions.isEditor(auth.user)) return true;
  if (session.eventId) {
    const ev = eventStore.get(session.eventId);
    if (ev && (await canEditEvent(req, ev, body))) return true;
    if (ev) {
      const dbAccess = userDb.supported ? await Promise.resolve(userDb.listEventAccess(ev.id)) : [];
      if (permissions.eventAccess(auth.user, ev, dbAccess).present) return true;
    }
  }
  return false;
}

function originFromRequest(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

function joinUrlFor(origin, code) {
  const base = String(origin || "").replace(/\/$/, "") || "http://localhost:3000";
  return `${base}/#/join/${code}`;
}

/** Öffentliche Event-Karte inkl. Join-URL und Copy-Paste-Text. */
function enrichPublicEvent(ev, origin) {
  /* Öffentliche Listen ohne Base64-Grafik — Session-Payload trägt eventMeta.eventImage. */
  const card = eventStore.publicEvent(ev, { includeImage: false });
  const joinUrl = joinUrlFor(origin, ev.joinCode);
  return {
    ...card,
    joinUrl,
    copyText: eventStore.inviteText(ev, joinUrl),
  };
}

function eventByJoinCode(code) {
  return eventStore.bySessionCode(code);
}

function eventBrandingFor(eventId) {
  if (!eventId) return null;
  const b = eventStore.get(eventId)?.branding;
  if (!b) return null;
  const has = b.logo || b.primary || b.secondary || b.footerText || b.footerLinks;
  return has ? b : null;
}

/**
 * Session zum Event-Join-Code laden oder anlegen.
 * Vorhandene Folien werden nicht überschrieben (Deck lebt in der Session).
 */
async function ensureEventSession(ev, slides) {
  const code = eventStore.sessionRef(ev);
  if (!code) return null;
  let session = sessions.get(code) || (await getSession(code));
  if (!session) {
    const deck = Array.isArray(slides) && slides.length ? slides : eventStore.DEFAULT_DECK;
    const created = await createSession({
      code,
      eventId: ev.id,
      slides: deck,
      skipLobby: true,
    });
    eventStore.attachSession(ev.id, created.session.code);
    return created.session;
  }
  if (session.eventId !== ev.id) {
    session.eventId = ev.id;
    schedulePersist(session);
  }
  return session;
}

async function createEventWithSession(body = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const ev = eventStore.create(body);
    try {
      let slides = eventStore.DEFAULT_DECK;
      if (body.copyFromId) {
        const src = eventStore.get(body.copyFromId);
        const srcSession = src ? await getSession(eventStore.sessionRef(src)) : null;
        if (srcSession?.slides?.length) slides = srcSession.slides.map((s) => slideSource(s));
      }
      const created = await createSession({
        code: ev.joinCode,
        eventId: ev.id,
        ownerUserId: ev.ownerUserId || body.ownerUserId || "",
        slides,
        skipLobby: true,
      });
      eventStore.attachSession(ev.id, created.session.code);
      return { event: eventStore.get(ev.id), adminKey: created.adminKey, session: created.session };
    } catch (err) {
      eventStore.remove(ev.id);
      lastErr = err;
      if (err.statusCode !== 409) throw err;
    }
  }
  throw lastErr || new Error("Event konnte nicht angelegt werden");
}

/**
 * Alte Sets-Events nach sessionCode überführen und Sessions mit zusammengeführtem Deck anlegen.
 */
async function migrateEventDecks() {
  const { pending, changed } = eventStore.migrateLegacy();
  for (const row of pending) {
    const ev = eventStore.get(row.id);
    if (!ev) continue;
    const existing = await getSession(eventStore.sessionRef(ev));
    if (!existing) {
      await ensureEventSession(ev, row.slides);
      continue;
    }
    /* Geplante Session ohne Teilnehmer: zusammengeführtes Deck aus alten Sets übernehmen. */
    if (ev.status === "planned" && !(existing.participants?.size) && row.slides.length > (existing.slides || []).length) {
      existing.slides = row.slides.map((s) => normalizeSlide(s));
      existing.eventId = ev.id;
      if (existing.activeSlideIndex >= existing.slides.length) existing.activeSlideIndex = 0;
      await persistNow(existing);
    } else if (!existing.eventId) {
      existing.eventId = ev.id;
      schedulePersist(existing);
    }
  }
  for (const ev of eventStore.list()) {
    await ensureEventSession(ev);
  }
  if (changed) console.log(`[events] Migration: ${pending.length} Event(s) von Sets auf Session-Deck`);
}

async function listAdminSessions() {
  const seen = new Set();
  const rows = [];
  const push = (session) => {
    if (!session?.code || seen.has(session.code)) return;
    seen.add(session.code);
    const ev = eventStore.bySessionCode(session.code);
    rows.push({
      code: session.code,
      eventId: session.eventId || ev?.id || "",
      title: ev?.title || session.slides?.[0]?.question || session.code,
      slideCount: (session.slides || []).length,
    });
  };
  for (const session of sessions.values()) push(session);
  let meta = [];
  try {
    meta = (await Promise.resolve(db.listMeta?.() || [])) || [];
  } catch (err) {
    console.warn("[sessions-admin] listMeta:", err.message);
  }
  for (const row of meta) {
    if (seen.has(row.code)) continue;
    const payload = row.payload || {};
    push({ code: row.code, eventId: payload.eventId || "", slides: payload.slides || [] });
  }
  rows.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return rows;
}

function deckSummary(session) {
  return (session?.slides || []).map((s) => ({ id: s.id, type: s.type, question: s.question || "" }));
}

/**
 * Status anhand Start-/Enddatum pflegen. Änderungen landen im Audit-Log
 * (kein E-Mail-Versand in dieser Instanz).
 */
function tickEventStatuses() {
  const { changed } = eventStore.tickStatuses();
  for (const row of changed) {
    audit.log("event.autoStatus", {
      userId: "system",
      action: `${row.from}->${row.to}`,
      questionId: row.id,
    });
    const ev = eventStore.get(row.id);
    if (ev && (ev.status === "active" || ev.status === "ended")) {
      ensureEventSession(ev).catch((err) => console.warn("[events] Session-Sync:", err.message));
    }
  }
}

function sendStoreResult(res, result, okStatus = 200) {
  if (!result) {
    send(res, 404, { error: "Nicht gefunden" });
    return false;
  }
  if (result.error) {
    send(res, result.statusCode || 400, { error: result.error });
    return false;
  }
  send(res, okStatus, result);
  return true;
}

/**
 * REST für Events (Metadaten). Folien liegen in der Session.
 * GET /api/events ist öffentlich; Schreibzugriffe brauchen Admin wie Branding.
 */
async function handleEventsApi(req, res, url, parts) {
  const origin = originFromRequest(req);
  const id = parts[2];
  const sub = parts[3];

  if (req.method === "GET" && !id) {
    const pub = eventStore.listPublic();
    send(res, 200, {
      upcoming: pub.upcoming.map((ev) => enrichPublicEvent(eventStore.get(ev.id) || ev, origin)),
      past: pub.past.map((ev) => enrichPublicEvent(eventStore.get(ev.id) || ev, origin)),
    });
    return;
  }

  if (req.method === "GET" && id === "admin" && !sub) {
    if (!(await isEventAdmin(req))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const auth = await getAuth(req);
    const q = url.searchParams;
    let list = eventStore.list({
      status: q.get("status") || "",
      category: q.get("category") || "",
      from: q.get("from") || "",
      to: q.get("to") || "",
    });
    if (auth.user && !auth.viaSecret && auth.user.role !== "admin") {
      const accessByEvent = {};
      for (const ev of list) {
        accessByEvent[ev.id] = userDb.supported ? await Promise.resolve(userDb.listEventAccess(ev.id)) : [];
      }
      list = permissions.filterEventsForUser(auth.user, list, accessByEvent);
    }
    const events = [];
    for (const ev of list) {
      const session = sessions.get(eventStore.sessionRef(ev)) || (await getSession(eventStore.sessionRef(ev)));
      const stats = eventStore.computeStats(ev, session);
      const card = enrichPublicEvent(ev, origin);
      events.push({
        id: ev.id,
        title: card.title,
        description: card.description,
        startAt: card.startAt,
        endAt: card.endAt,
        startTime: ev.startTime || "",
        hasEventImage: Boolean(ev.eventImage),
        status: card.status,
        category: card.category,
        joinCode: card.joinCode,
        sessionCode: card.sessionCode,
        joinUrl: card.joinUrl,
        joinEnabled: card.joinEnabled,
        resultsOnly: card.resultsOnly,
        slideCount: (session?.slides || []).length,
        stats: {
          participants: Number(stats.participants) || 0,
          votes: Number(stats.votes) || 0,
          questions: Number(stats.questions) || 0,
        },
      });
    }
    send(res, 200, { events });
    return;
  }

  if (req.method === "POST" && !id) {
    const auth = await getAuth(req);
    if (!(await isEventAdmin(req))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    if (auth.user && !permissions.canCreateEvent(auth.user)) {
      send(res, 403, { error: "Keine Berechtigung zum Anlegen von Events" });
      return;
    }
    try {
      const body = await readJson(req);
      const created = await createEventWithSession({
        ...(body || {}),
        ownerUserId: auth.user?.id || body?.ownerUserId || "",
      });
      const session = created.session;
      send(res, 201, {
        event: eventStore.adminEvent(created.event, eventStore.computeStats(created.event, session), {
          slideCount: session.slides.length,
          slides: deckSummary(session),
        }),
        adminKey: created.adminKey,
      });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message || "Event fehlgeschlagen" });
    }
    return;
  }

  if (!id) {
    send(res, 404, { error: "Unbekannte Event-Route" });
    return;
  }

  if (req.method === "GET" && id && !sub) {
    const ev = eventStore.get(id);
    if (!ev) {
      send(res, 404, { error: "Event nicht gefunden" });
      return;
    }
    if (ev.status === "archived" && !(await canViewEvent(req, ev))) {
      send(res, 404, { error: "Event nicht gefunden" });
      return;
    }
    const session = sessions.get(eventStore.sessionRef(ev)) || (await getSession(eventStore.sessionRef(ev)));
    const stats = eventStore.computeStats(ev, session);
    if ((await isEventAdmin(req)) && (await canViewEvent(req, ev))) {
      send(res, 200, {
        event: eventStore.adminEvent(ev, stats, { slideCount: (session?.slides || []).length, slides: deckSummary(session) }),
        stats,
        origin,
        session: session ? { code: session.code, slides: deckSummary(session) } : null,
      });
      return;
    }
    send(res, 200, { event: enrichPublicEvent(ev, origin), stats });
    return;
  }

  if (!(await isEventAdmin(req))) {
    send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
    return;
  }

  const evCheck = eventStore.get(id);
  if (evCheck && !(await canEditEvent(req, evCheck))) {
    send(res, 403, { error: "Keine Berechtigung für dieses Event" });
    return;
  }

  if (req.method === "PATCH" && id && sub === "access") {
    const body = await readJson(req);
    if (!evCheck) {
      send(res, 404, { error: "Event nicht gefunden" });
      return;
    }
    const auth = await getAuth(req);
    const dbAccess = userDb.supported ? await Promise.resolve(userDb.listEventAccess(id)) : [];
    if (!permissions.eventAccess(auth.user, evCheck, dbAccess).manageAccess && !auth.viaSecret) {
      send(res, 403, { error: "Keine Berechtigung" });
      return;
    }
    const patch = {
      editorUserIds: body.editorUserIds,
      presenterUserIds: body.presenterUserIds,
      viewerUserIds: body.viewerUserIds,
    };
    const ev = eventStore.update(id, patch);
    send(res, 200, { event: ev, access: ev });
    return;
  }

  if (req.method === "PATCH" && id && !sub) {
    const body = await readJson(req);
    const ev = eventStore.update(id, body || {});
    if (!ev) {
      send(res, 404, { error: "Event nicht gefunden" });
      return;
    }
    if (ev.status === "active" || ev.status === "ended") await ensureEventSession(ev);
    const session = await getSession(eventStore.sessionRef(ev));
    send(res, 200, { event: eventStore.adminEvent(ev, null, { slideCount: (session?.slides || []).length }) });
    return;
  }

  if (req.method === "DELETE" && id && !sub) {
    sendStoreResult(res, eventStore.remove(id));
    return;
  }

  if (req.method === "POST" && sub === "status") {
    const body = await readJson(req);
    const ev = eventStore.setStatus(id, body.status);
    if (!ev) {
      send(res, 404, { error: "Event nicht gefunden" });
      return;
    }
    if (ev.status === "active" || ev.status === "ended") await ensureEventSession(ev);
    send(res, 200, { event: eventStore.adminEvent(ev) });
    return;
  }

  if (req.method === "GET" && sub === "stats") {
    const ev = eventStore.get(id);
    if (!ev) {
      send(res, 404, { error: "Event nicht gefunden" });
      return;
    }
    const session = sessions.get(eventStore.sessionRef(ev)) || (await getSession(eventStore.sessionRef(ev)));
    send(res, 200, { stats: eventStore.computeStats(ev, session) });
    return;
  }

  if (req.method === "GET" && sub === "stats.csv") {
    const ev = eventStore.get(id);
    if (!ev) {
      send(res, 404, { error: "Event nicht gefunden" });
      return;
    }
    const session = sessions.get(eventStore.sessionRef(ev)) || (await getSession(eventStore.sessionRef(ev)));
    const stats = eventStore.computeStats(ev, session);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${id}-stats.csv"`,
    });
    res.end("\uFEFF" + eventStore.statsCsv(stats, ev));
    return;
  }

  send(res, 404, { error: "Unbekannte Event-Route" });
}


/**
 * GET /api/settings/export · POST /api/settings/import
 * Import ersetzt Branding (inkl. Logo), Privacy und SSL-PEMs. Sessions bleiben.
 */
async function handleSettingsApi(req, res, parts) {
  const action = parts[2];
  if (req.method === "GET" && (action === "export" || parts.length === 2)) {
    if (!(await isSettingsAdmin(req, {}))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const auth = await getAuth(req, {});
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    let sslBackup = { accountPem: "", certificates: [] };
    try {
      sslBackup = ssl.collectBackup();
    } catch (err) {
      console.warn("[settings-export] SSL-Backup nicht lesbar:", err.message);
    }
    let pkgVersion = "1.0.0";
    try {
      pkgVersion = require("./package.json").version || pkgVersion;
    } catch {
      /* Fallback oben */
    }
    const bundle = instanceSettings.buildExportBundle({
      branding: brandingStore.load(),
      privacy: privacyStore.load(),
      privacyVersions: privacyStore.versions(),
      sslCertificates: sslBackup.certificates,
      sslAccountPem: sslBackup.accountPem,
      app: { name: "Pulse", version: pkgVersion },
    });
    audit.log("settings_exported", { userId: "admin", action: "incl_logo_ssl" });
    sendAttachment(res, 200, bundle, instanceSettings.EXPORT_FILENAME);
    return;
  }

  if (req.method === "POST" && (action === "import" || parts.length === 2)) {
    let body;
    try {
      body = await readSettingsBody(req);
    } catch (err) {
      if (String(err.message || "").includes("groß")) {
        send(res, 413, {
          error: "Datei zu groß. Logo, Zertifikate und JSON zusammen dürfen das Limit nicht überschreiten.",
        });
        return;
      }
      send(res, 400, {
        error: "Ungültiges JSON. Die Datei ist beschädigt oder kein Einstellungs-Export.",
      });
      return;
    }
    if (!(await isSettingsAdmin(req, body || {}))) {
      send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
      return;
    }
    const auth = await getAuth(req, body || {});
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return;
    }
    const result = instanceSettings.applyImportBundle(body, {
      saveBranding: (partial) => {
        const branding = brandingStore.save(partial);
        applyIpBlockSetting(branding);
        return branding;
      },
      savePrivacy: (record, versionsList) => privacyStore.importBundle(record, versionsList),
      saveSsl: (payload) => ssl.restoreFromBackup(payload),
    });
    if (!result.ok) {
      send(res, result.status || 400, { error: result.error, code: result.code });
      return;
    }
    audit.log("settings_imported", {
      userId: "admin",
      action: (result.replaced || []).join(","),
    });
    send(res, 200, {
      ok: true,
      replaced: result.replaced,
      branding: result.branding,
      privacy: result.privacy,
      versions: result.versions,
      ssl: result.ssl,
    });
    return;
  }

  send(res, 404, { error: "Nicht gefunden" });
}

/**
 * JSON-Body oder multipart (eine JSON-Datei). Nur JSON, keine Code-Ausführung.
 * @param {import("http").IncomingMessage} req
 */
async function readSettingsBody(req) {
  const ctype = String(req.headers["content-type"] || "");
  const max = instanceSettings.MAX_BUNDLE_BYTES;
  if (ctype.toLowerCase().includes("multipart/form-data")) {
    const raw = await readRawWithLimit(req, max);
    return parseMultipartJson(raw, ctype);
  }
  return readJsonWithLimit(req, max);
}

/**
 * Liest den Request-Body als Buffer mit hartem Limit.
 * @param {import("http").IncomingMessage} req
 * @param {number} max
 * @returns {Promise<Buffer>}
 */
function readRawWithLimit(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > max) {
        reject(new Error("Body zu groß"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * JSON mit eigenem Größenlimit (Import darf etwas größer sein als 64-KiB-Branding,
 * das Logo selbst bleibt bei MAX_LOGO_CHARS begrenzt).
 */
function readJsonWithLimit(req, max) {
  return readRawWithLimit(req, max).then((buf) => {
    if (!buf.length) return {};
    return JSON.parse(buf.toString("utf8"));
  });
}

/**
 * Erstes JSON-Part aus multipart/form-data (Feld file/bundle oder .json).
 * @param {Buffer} buf
 * @param {string} contentType
 */
function parseMultipartJson(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new Error("Kein Multipart-Boundary");
  const boundary = (m[1] || m[2] || "").trim();
  const text = buf.toString("utf8");
  const parts = text.split("--" + boundary);
  for (const part of parts) {
    const looksJson =
      /content-type:\s*application\/json/i.test(part) ||
      /filename="[^"]+\.json"/i.test(part) ||
      /name="(file|bundle|settings)"/i.test(part);
    if (!looksJson) continue;
    const idx = part.indexOf("\r\n\r\n");
    const alt = idx < 0 ? part.indexOf("\n\n") : idx;
    if (alt < 0) continue;
    const sep = idx >= 0 ? 4 : 2;
    let body = part.slice(alt + sep);
    body = body.replace(/\r\n$/g, "").replace(/\n$/g, "");
    if (body.endsWith("--")) body = body.slice(0, -2);
    body = body.replace(/\r\n--\s*$/, "").replace(/\n--\s*$/, "");
    return JSON.parse(body);
  }
  throw new Error("Keine JSON-Datei im Upload");
}

/**
 * JSON-Download mit Content-Disposition (Export-Datei).
 */
function sendAttachment(res, status, obj, filename) {
  const body = JSON.stringify(obj, null, 2);
  compress.writeEncoded(res, status, body, "application/json; charset=utf-8", res._pulseReq, {
    "Content-Disposition": `attachment; filename="${filename}"`,
    ...corsHeaders(),
  });
}

/**
 * Admin für SSL: mit gesetztem ADMIN_SECRET nur der passende Schlüssel,
 * sonst Demo wie beim Branding (lokal ohne Secret).
 */
async function isSslAdmin(req, body = {}) {
  return isSettingsAdmin(req, body);
}

/**
 * REST für Zertifikate. Private Keys werden nie serialisiert.
 * GET /api/ssl · POST /api/ssl|/issue · POST /api/ssl/renew · DELETE /api/ssl/:domain
 */
async function handleSslApi(req, res, parts) {
  let body = {};
  if (req.method === "POST" || req.method === "DELETE") {
    try {
      body = await readJson(req);
    } catch {
      body = {};
    }
  }
  if (!(await isSslAdmin(req, body))) {
    send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
    return;
  }
  const auth = await getAuth(req, body);
  const sslWrite = req.method === "POST" || req.method === "DELETE";
  if (sslWrite && !authApi.adminStepUpOk(auth)) {
    authApi.rejectStepUp(res, send);
    return;
  }
  try {
    if (req.method === "GET" && parts.length === 2) {
      send(res, 200, { certificates: ssl.listCertificates(), https: ssl.httpsInfo() });
      return;
    }
    if (req.method === "POST" && (parts.length === 2 || parts[2] === "issue")) {
      const result = await ssl.startIssue({
        domain: body.domain,
        email: body.email,
        terms: body.terms === true,
        staging: body.staging,
        autoRenew: body.autoRenew,
      });
      send(res, 202, result);
      return;
    }
    if (req.method === "POST" && parts[2] === "renew") {
      const result = await ssl.startRenew(body.domain);
      send(res, 202, result);
      return;
    }
    if (req.method === "DELETE" && parts[2]) {
      const result = ssl.deleteCertificate(decodeURIComponent(parts[2]));
      send(res, 200, result);
      return;
    }
    send(res, 404, { error: "Nicht gefunden" });
  } catch (err) {
    send(res, err.statusCode || 500, { error: err.message || "SSL-Fehler" });
  }
}

function serveStatic(pathname, req, res) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  /* Nur echte App-Routen ohne Dateiendung — sonst würde /admin/i18n/de.json die HTML-Hülle liefern. */
  const spaShell =
    pathname === "/privacy" ||
    pathname === "/impressum" ||
    pathname === "/help" ||
    pathname === "/admin" ||
    (pathname.startsWith("/admin/") && !path.extname(pathname));
  if (spaShell) {
    rel = "/index.html";
  }
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(FRONTEND, rel);
  if (!file.startsWith(FRONTEND)) {
    send(res, 403, { error: "Forbidden" });
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      send(res, 404, { error: "Nicht gefunden" });
      return;
    }
    const ext = path.extname(file);
    let body = data;
    /* Optionaler CDN-Prefix nur für css/js/assets — i18n bleibt auf diesem Host. */
    if (path.basename(file) === "index.html") body = applyAssetBase(data);
    const type = MIME[ext] || "application/octet-stream";
    compress.writeEncoded(res, 200, body, type, req, {
      "Cache-Control": cacheControlFor(ext),
    });
  });
}

/**
 * ASSET_BASE (Env): Prefix für ./css ./js ./assets in index.html.
 * Kein Pflicht-CDN, kein erfundener CloudFlare-Account.
 * @param {Buffer} htmlBuf
 */
function applyAssetBase(htmlBuf) {
  const base = String(process.env.ASSET_BASE || "").trim().replace(/\/+$/, "");
  if (!base) return htmlBuf;
  const html = htmlBuf.toString("utf8").replace(/(href|src)="\.\/(css|js|assets)\//g, `$1="${base}/$2/`);
  return Buffer.from(html);
}

function cacheControlFor(ext) {
  if (ext === ".html") return "no-cache";
  if (ext === ".css" || ext === ".js" || ext === ".json" || ext === ".svg") return "public, max-age=86400";
  if (ext === ".png" || ext === ".ico" || ext === ".woff" || ext === ".woff2" || ext === ".ttf") {
    return "public, max-age=604800";
  }
  return "public, max-age=3600";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key, X-Client-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

function send(res, status, obj) {
  compress.writeEncoded(res, status, JSON.stringify(obj), "application/json; charset=utf-8", res._pulseReq, corsHeaders());
}

function observe(req, url, status, started) {
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  const route = url.pathname.startsWith("/api/") ? url.pathname.replace(/\/\d{6}\b/g, "/:code") : url.pathname;
  metrics.observeHttp(req.method, route, status, seconds);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_PAYLOAD) {
        reject(new Error("Body zu groß"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function checkPresenterPassword(session, password, ip) {
  const key = session.code + ":" + (ip || "local");
  const lock = presenterLocks.get(key) || { tries: 0, until: 0 };
  if (Date.now() < lock.until) {
    return { ok: false, error: "Zu viele Versuche. Bitte 5 Minuten warten.", locked: true };
  }
  if (!session.passwordHash) return { ok: true, skipped: true };
  if (verifyPassword(password, session.passwordHash)) {
    presenterLocks.delete(key);
    return { ok: true };
  }
  lock.tries += 1;
  if (lock.tries >= 3) {
    lock.until = Date.now() + 5 * 60 * 1000;
    lock.tries = 0;
  }
  presenterLocks.set(key, lock);
  return { ok: false, error: "Falsches Passwort. Versuche es erneut.", triesLeft: 3 - lock.tries };
}

async function sweepExpiredSessions() {
  const branding = brandingStore.load();
  const days = Number(branding.retentionDays);
  if (!days) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const meta = (await Promise.resolve(db.listMeta?.() || [])) || [];
  for (const row of meta) {
    if (row.createdAt && row.createdAt < cutoff) {
      await Promise.resolve(db.remove(row.code));
      sessions.delete(row.code);
    }
  }
  metrics.setSessions(sessions.size);
}
