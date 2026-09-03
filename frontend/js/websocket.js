/**
 * Leichtgewichtiger Echtzeit-Client.
 *
 * Architektur:
 * - Native WebSocket (kein Socket.io-Bundle) für minimale Latenz und Größe.
 * - Heartbeat über JSON-Ping, damit Proxys tote Connections erkennen.
 * - Exponential Backoff + Jitter beim Reconnect nach Verbindungsverlust.
 * - Nachrichten-Queue während Disconnect, Flush nach OPEN.
 * - Event-Bus (on/off/emit) als stabile Schnittstelle — später 1:1 durch
 *   einen Socket.io-Adapter ersetzbar (gleiche Methoden).
 * - Mock-Transport (BroadcastChannel + optionale Simulation), falls kein
 *   Backend erreichbar ist. So funktionieren zwei Browser-Tabs lokal.
 */

import { connectionLabel } from "./errors.js";

const DEFAULTS = {
  heartbeatMs: 20000,
  heartbeatTimeoutMs: 10000,
  reconnectMinMs: 400,
  reconnectMaxMs: 12000,
  maxQueue: 80,
  mockWhenOffline: true,
  batchIntervalMs: 100,
};

const BATCHABLE = new Set(["vote", "word", "submit_question", "upvote_question"]);

export class RealtimeClient {
  /**
   * @param {string} url  z. B. ws://localhost:3000/ws
   * @param {object} [options]
   */
  constructor(url, options = {}) {
    this.url = url;
    this.opts = { ...DEFAULTS, ...options };
    this.ws = null;
    this.handlers = new Map();
    this.queue = [];
    this.reconnectAttempt = 0;
    this.closedByUser = false;
    this.heartbeatTimer = 0;
    this.heartbeatWatchdog = 0;
    this.reconnectTimer = 0;
    this.mock = null;
    this.state = "idle";
    this.pendingUpdates = [];
    this.batchTimer = 0;
  }

  /** Event-Handler registrieren. Gibt Unsubscribe-Funktion zurück. */
  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this.handlers.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error("[realtime] handler", event, err);
      }
    }
  }

  connect() {
    this.closedByUser = false;
    if (typeof location !== "undefined" && location.protocol === "file:") {
      this.#enableMock();
      return;
    }
    this.#openSocket();
  }

  disconnect() {
    this.closedByUser = true;
    this.#clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, "client shutdown");
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.mock?.dispose();
    this.mock = null;
    this.#setState("closed");
  }

  /**
   * Nachricht senden. Vote/Word werden 100 ms gebündelt (Pulse-Last).
   * Envelope: { type, payload, ts }
   */
  send(type, payload = {}) {
    if (BATCHABLE.has(type) && !this.mock) {
      this.#queueBatch(type, payload);
      return true;
    }
    return this.#sendRaw({ type, payload, ts: Date.now() });
  }

  #queueBatch(type, payload) {
    this.pendingUpdates.push({ type, payload, ts: Date.now() });
    if (this.batchTimer) return;
    this.batchTimer = window.setTimeout(() => {
      const updates = this.pendingUpdates;
      this.pendingUpdates = [];
      this.batchTimer = 0;
      if (updates.length === 1) this.#sendRaw(updates[0]);
      else this.#sendRaw({ type: "batch", payload: { updates }, ts: Date.now() });
    }, this.opts.batchIntervalMs);
  }

  #sendRaw(envelope) {
    const msg = JSON.stringify(envelope);
    if (this.mock) {
      this.mock.send(envelope.type, envelope.payload);
      return true;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
      return true;
    }
    if (this.queue.length >= this.opts.maxQueue) this.queue.shift();
    this.queue.push(msg);
    return false;
  }

  #setState(state) {
    this.state = state;
    const info = connectionLabel(state, Boolean(this.mock));
    this.emit("connection", {
      state,
      mock: Boolean(this.mock),
      label: info.short,
      description: info.long,
    });
  }

  #openSocket() {
    this.#setState("connecting");
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      this.#onSocketFailure(err);
      return;
    }
    this.ws = socket;

    const failTimer = window.setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
    }, 900);

    socket.addEventListener("open", () => {
      window.clearTimeout(failTimer);
      this.reconnectAttempt = 0;
      this.#setState("open");
      this.#startHeartbeat();
      this.#flushQueue();
      this.emit("open");
    });

    socket.addEventListener("message", (ev) => {
      this.#onMessage(ev.data);
    });

    socket.addEventListener("close", () => {
      window.clearTimeout(failTimer);
      this.#clearHeartbeat();
      if (this.closedByUser) {
        this.#setState("closed");
        return;
      }
      this.#onSocketFailure();
    });

    socket.addEventListener("error", () => {
      /* close-Handler übernimmt Reconnect */
    });
  }

  #onMessage(raw) {
    let data;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (data.type === "pong") {
      window.clearTimeout(this.heartbeatWatchdog);
      /* serverNow für Countdown-Skew (Stage/Presenter). */
      this.emit("pong", { ts: data.ts, serverNow: data.serverNow ?? data.ts });
      return;
    }
    if (data.type === "batch") {
      const updates = data.payload?.updates || data.updates || [];
      for (const item of updates) {
        this.emit(item.type, item.payload ?? item);
      }
      this.emit("message", data);
      return;
    }
    this.emit(data.type, data.payload ?? data);
    this.emit("message", data);
  }

  #flushQueue() {
    while (this.queue.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.queue.shift());
    }
  }

  #startHeartbeat() {
    this.#clearHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      window.clearTimeout(this.heartbeatWatchdog);
      this.heartbeatWatchdog = window.setTimeout(() => {
        try {
          this.ws?.close();
        } catch {
          /* reconnect via close */
        }
      }, this.opts.heartbeatTimeoutMs);
    }, this.opts.heartbeatMs);
  }

  #clearHeartbeat() {
    window.clearInterval(this.heartbeatTimer);
    window.clearTimeout(this.heartbeatWatchdog);
  }

  #clearTimers() {
    this.#clearHeartbeat();
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.batchTimer);
    this.batchTimer = 0;
  }

  #onSocketFailure() {
    this.ws = null;
    this.#clearHeartbeat();
    if (this.closedByUser) return;

    if (this.opts.mockWhenOffline && this.reconnectAttempt >= 1) {
      this.#enableMock();
      return;
    }

    this.#setState("reconnecting");
    const exp = Math.min(
      this.opts.reconnectMaxMs,
      this.opts.reconnectMinMs * 2 ** this.reconnectAttempt
    );
    const jitter = Math.random() * 250;
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => this.#openSocket(), exp + jitter);
  }

  #enableMock() {
    if (this.mock) return;
    this.mock = createMockTransport((type, payload) => this.emit(type, payload));
    this.#setState("open");
    this.emit("open");
    this.emit("mock", { enabled: true });
  }
}

/**
 * Mock-Transport: synchronisiert Tabs über BroadcastChannel.
 * Zusätzlich optionaler Simulator für Demo-Traffic (Presenter).
 */
function createMockTransport(dispatch) {
  const channel = "pulse-realtime";
  const bc = "BroadcastChannel" in window ? new BroadcastChannel(channel) : null;
  const listeners = [];

  const onBc = (ev) => {
    const { type, payload } = ev.data || {};
    if (type) dispatch(type, payload);
  };
  bc?.addEventListener("message", onBc);

  return {
    send(type, payload) {
      const envelope = { type, payload, ts: Date.now() };
      bc?.postMessage(envelope);
      // Echo lokal, analog zu einem Server-Broadcast inklusive Sender.
      dispatch(type, payload);
    },
    dispose() {
      bc?.removeEventListener("message", onBc);
      bc?.close();
      listeners.length = 0;
    },
  };
}

/**
 * REST-Hülle für Poll-Erstellung. Fällt auf lokalen Fetch-Fehler mit null zurück,
 * damit die App ohne Backend im Demo-Modus weiterläuft.
 */
export const api = {
  base: "/api",
  adminKey: "",
  clientId: "",

  setAdminKey(key) {
    this.adminKey = key || "";
  },

  async createSession(body) {
    return request("POST", "/sessions", body);
  },

  async getSession(code) {
    return request("GET", `/sessions/${encodeURIComponent(code)}`);
  },

  async resetSession(code) {
    return request("POST", `/sessions/${encodeURIComponent(code)}/reset`);
  },

  async setSlide(code, index) {
    return request("POST", `/sessions/${encodeURIComponent(code)}/slide`, { index });
  },

  async updateDeck(code, action, extra = {}) {
    return request("POST", `/sessions/${encodeURIComponent(code)}/slides`, { action, ...extra });
  },

  /** Inhalts-Update einer Folie (PATCH) — Fallback auf POST action=update. */
  async updateSlide(code, slideId, slide) {
    const path = `/sessions/${encodeURIComponent(code)}/slides/${encodeURIComponent(slideId)}`;
    const res = await requestResult("PATCH", path, { ...slide, allowLocal: true });
    if (res?.ok) return { ok: true, ...(res.data || {}) };
    /* Fallback, falls PATCH auf dem Server noch fehlt */
    if (res?.status === 404 || res?.status === 405 || res?.status === 0) {
      const fallback = await requestResult("POST", `/sessions/${encodeURIComponent(code)}/slides`, {
        action: "update",
        id: slideId,
        slide,
        allowLocal: true,
      });
      if (fallback?.ok) return { ok: true, ...(fallback.data || {}) };
      return {
        ok: false,
        error: fallback?.data?.error || "Speichern fehlgeschlagen",
        ...(fallback?.data || {}),
      };
    }
    return {
      ok: false,
      error: res?.data?.error || "Speichern fehlgeschlagen",
      ...(res?.data || {}),
    };
  },

  async copySessionSlides(code, body) {
    return requestResult("POST", `/sessions/${encodeURIComponent(code)}/copy-from`, { ...body, allowLocal: true });
  },

  async sessionsAdmin() {
    return requestResult("GET", "/sessions/admin");
  },

  async submitQuestion(text, extra = {}) {
    return request("POST", "/questions", { text, ...extra });
  },

  /** Eine Frage einmal liken. */
  async upvoteQuestion(questionId, extra = {}) {
    return request("POST", `/questions/${encodeURIComponent(questionId)}/upvote`, extra);
  },

  /**
   * Q&A-Countdown steuern (Presenter). action: start|pause|resume|extend|end|configure.
   */
  async qaTimer(body) {
    return request("POST", "/qa/timer", body);
  },

  async getQuestions(roomId, slideId) {
    const q = new URLSearchParams({ roomId });
    if (slideId) q.set("slideId", slideId);
    return request("GET", `/questions?${q}`);
  },

  async moderateQuestion(id, action, extra = {}) {
    return request("POST", `/questions/${encodeURIComponent(id)}/moderate`, { action, ...extra });
  },

  async startQuiz(questionId, duration, extra = {}) {
    return request("POST", "/quiz/start", { questionId, duration, ...extra });
  },

  async submitAnswer(questionId, answerIndex, extra = {}) {
    return request("POST", "/quiz/answer", { questionId, answerIndex, ...extra });
  },

  async getQuizLeaderboard(roomId) {
    return request("GET", `/quiz/leaderboard?roomId=${encodeURIComponent(roomId)}`);
  },

  async endQuizRound(extra = {}) {
    return request("POST", "/quiz/end", extra);
  },

  async getBranding() {
    return request("GET", "/branding");
  },

  async saveBranding(body) {
    return request("POST", "/branding", { ...body, allowLocal: true });
  },

  /**
   * Gerenderte Datenschutzerklärung (Platzhalter bereits ersetzt).
   * @param {string} [lang]
   */
  async getPrivacy(lang = "de") {
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : "";
    return request("GET", `/privacy${q}`);
  },

  /**
   * Admin-Speichern analog Branding (allowLocal / X-Admin-Key).
   */
  async savePrivacy(body) {
    return request("PUT", "/privacy", { ...body, allowLocal: true });
  },

  async sslList() {
    const r = await requestResult("GET", "/ssl");
    return r.ok ? r.data : { certificates: [], https: {}, error: r.data?.error };
  },

  async sslIssue(body) {
    return requestResult("POST", "/ssl/issue", { ...body, allowLocal: true });
  },

  async sslRenew(domain) {
    return requestResult("POST", "/ssl/renew", { domain, allowLocal: true });
  },

  async sslDelete(domain) {
    return requestResult("DELETE", `/ssl/${encodeURIComponent(domain)}`, { allowLocal: true });
  },

  /**
   * Instanz-Einstellungen als JSON-Datei (Blob) herunterladen.
   * @returns {Promise<{ ok: boolean, status: number, blob?: Blob, data?: object }>}
   */
  async exportSettings() {
    try {
      const headers = {};
      if (api.adminKey) headers["X-Admin-Key"] = api.adminKey;
      const res = await fetch(`${api.base}/settings/export`, { headers, credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, status: res.status, data };
      }
      const blob = await res.blob();
      return { ok: true, status: res.status, blob };
    } catch {
      return { ok: false, status: 0, data: { error: "Netzwerkfehler" } };
    }
  },

  /**
   * Bundle einspielen. Ersetzt Branding (Logo), Privacy und SSL-PEMs.
   * @param {object} bundle
   */
  async importSettings(bundle) {
    return requestResult("POST", "/settings/import", { ...bundle, allowLocal: true });
  },

  async verifyPassword(code, password) {
    return request("POST", `/sessions/${encodeURIComponent(code)}/password`, { password });
  },

  async exportCsv(code, kind = "all") {
    const q = kind === "qa" ? "?kind=qa" : "";
    const res = await fetch(`${api.base}/sessions/${encodeURIComponent(code)}/export${q}`, {
      headers: api.adminKey ? { "X-Admin-Key": api.adminKey } : {},
    });
    return res.ok ? res.text() : "";
  },

  /** Öffentliche Event-Liste für die Startseite. */
  async eventsPublic() {
    return request("GET", "/events");
  },

  async eventsAdmin(params = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) q.set(k, v);
    }
    const suffix = q.toString() ? `?${q}` : "";
    return requestResult("GET", `/events/admin${suffix}`);
  },

  async getEvent(id) {
    return requestResult("GET", `/events/${encodeURIComponent(id)}`);
  },

  async createEvent(body) {
    return requestResult("POST", "/events", { ...body, allowLocal: true });
  },

  async updateEvent(id, body) {
    return requestResult("PATCH", `/events/${encodeURIComponent(id)}`, { ...body, allowLocal: true });
  },

  async updateEventAccess(id, body) {
    return requestResult("PATCH", `/events/${encodeURIComponent(id)}/access`, { ...body, allowLocal: true });
  },

  async listUsers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return requestResult("GET", `/users${q ? `?${q}` : ""}`);
  },

  async deleteEvent(id) {
    return requestResult("DELETE", `/events/${encodeURIComponent(id)}`, { allowLocal: true });
  },

  async setEventStatus(id, status) {
    return requestResult("POST", `/events/${encodeURIComponent(id)}/status`, { status, allowLocal: true });
  },

  async eventStatsCsv(id) {
    try {
      const headers = {};
      if (api.adminKey) headers["X-Admin-Key"] = api.adminKey;
      const res = await fetch(`${api.base}/events/${encodeURIComponent(id)}/stats.csv`, { headers });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, status: res.status, blob: await res.blob() };
    } catch {
      return { ok: false, status: 0 };
    }
  },

  /** Update-Infos ohne neue GitHub-Prüfung. */
  async updatesInfo() {
    return requestResult("GET", "/updates/info");
  },

  /** Manuelle GitHub-Prüfung (force=1). */
  async updatesCheck(force = false) {
    const q = force ? "?force=1" : "";
    return requestResult("GET", `/updates/check${q}`);
  },

  /** Installationsstatus und Historie. */
  async updatesStatus() {
    return requestResult("GET", "/updates/status");
  },

  /** Update installieren (Admin + Step-up). */
  async updatesInstall(body = {}) {
    return requestResult("POST", "/updates/install", body);
  },

  /** Update-Einstellungen speichern. */
  async updatesSaveConfig(body) {
    return requestResult("PATCH", "/updates/config", body);
  },

  /** Backup aus Historie wiederherstellen. */
  async updatesRollback(body) {
    return requestResult("POST", "/updates/rollback", body);
  },

  /** Backup-Liste und Konfiguration. */
  async backupsList() {
    return requestResult("GET", "/backups/list");
  },

  /** Vollständiges ZIP-Backup erstellen. */
  async backupsCreate() {
    return requestResult("GET", "/backups/create");
  },

  /** Backup wiederherstellen (Server-Neustart). */
  async backupsRestore(body) {
    return requestResult("POST", "/backups/restore", body);
  },

  /** Backup-Konfiguration speichern. */
  async backupsSaveConfig(body) {
    return requestResult("PATCH", "/backups/config", body);
  },

  /** ZIP-Backup hochladen. */
  async backupsUpload(formData) {
    try {
      const headers = {};
      if (api.adminKey) headers["X-Admin-Key"] = api.adminKey;
      if (api.clientId) headers["X-Client-Id"] = api.clientId;
      const res = await fetch(`${api.base}/backups/upload`, {
        method: "POST",
        headers,
        body: formData,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: "Netzwerkfehler" } };
    }
  },
};

async function request(method, path, body) {
  try {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (api.adminKey) headers["X-Admin-Key"] = api.adminKey;
    if (api.clientId) headers["X-Client-Id"] = api.clientId;
    const res = await fetch(`${api.base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * REST mit Fehlertext (Admin-SSL). Gibt immer { ok, status, data } zurück.
 */
async function requestResult(method, path, body) {
  try {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (api.adminKey) headers["X-Admin-Key"] = api.adminKey;
    if (api.clientId) headers["X-Client-Id"] = api.clientId;
    const res = await fetch(`${api.base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Netzwerkfehler" } };
  }
}
