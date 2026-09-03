/**
 * Admin-UI für automatische Updates (#/admin/updates).
 * Zeigt Version, Release-Notes, Fortschritt und Update-Historie.
 */

import { api } from "./websocket.js?v=nav20";
import { simpleMarkdown } from "./export.js?v=nav1";
import { ensureStepUp } from "./stepUp.js?v=nav35";

/** Polling-Intervall während laufender Installation (ms). */
const POLL_MS = 2000;

let pollTimer = 0;
let installActive = false;
let notesExpanded = false;

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Release-Notes mit Hervorhebung für Breaking Changes und Features.
 * @param {string} md
 * @param {boolean} [full]
 */
function renderReleaseNotes(md, full = false) {
  const lines = String(md || "").split("\n");
  const limit = full ? lines.length : Math.min(lines.length, 24);
  const slice = lines.slice(0, limit);
  const html = slice
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<br>";
      const lower = trimmed.toLowerCase();
      let cls = "";
      if (/breaking|breaking change|nicht kompatibel|⚠️/.test(lower)) cls = "update-note-breaking";
      else if (/^[-*]\s*(neu|feature|added|hinzugefügt)/i.test(trimmed) || /^##\s*(features|neu)/i.test(trimmed))
        cls = "update-note-feature";
      else if (/^[-*]\s*(fix|bugfix|behoben|korrigiert)/i.test(trimmed)) cls = "update-note-fix";
      const body = simpleMarkdown(trimmed);
      return cls ? `<p class="${cls}">${body}</p>` : `<p>${body}</p>`;
    })
    .join("");
  const more = lines.length > limit ? `<p class="muted">… ${lines.length - limit} weitere Zeilen</p>` : "";
  return html + more;
}

/** Relatives Zeitformat für letzten Check. */
function formatRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "—";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 48) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "en"}`;
}

function formatInterval(sec) {
  const map = {
    21600: "Alle 6 Stunden",
    43200: "Alle 12 Stunden",
    86400: "Alle 24 Stunden",
    172800: "Alle 48 Stunden",
    604800: "Alle 7 Tage",
  };
  return map[sec] || `Alle ${Math.round(sec / 3600)} Stunden`;
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function statusLabel(entry) {
  if (entry.status === "success") return "Erfolg";
  if (entry.status === "failed") return "Fehler";
  if (entry.status === "rolled_back") return "Zurückgesetzt";
  return entry.status || "—";
}

/** Fortschrittsbalken in der Admin-Leiste aktualisieren. */
function syncChromeProgress(phase, progress, message) {
  const bar = $("admin-update-progress");
  const text = $("admin-update-progress-text");
  if (!bar) return;
  const active = phase && phase !== "idle" && phase !== "completed" && phase !== "failed";
  bar.hidden = !active;
  if (text) text.textContent = message || "";
  const inner = bar.querySelector(".update-progress-fill");
  if (inner) inner.style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
}

/** Toast bei laufendem Update. */
function showUpdateToast(message) {
  let el = $("update-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "update-toast";
    el.className = "update-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
}

function hideUpdateToast() {
  const el = $("update-toast");
  if (el) el.hidden = true;
}

/**
 * Seite binden (idempotent).
 */
export function bindUpdatesPage() {
  const root = $("view-updates");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  $("btn-update-check")?.addEventListener("click", onCheck);
  $("btn-update-install")?.addEventListener("click", onInstallClick);
  $("btn-update-notes-toggle")?.addEventListener("click", () => {
    notesExpanded = !notesExpanded;
    refreshUpdatesPage();
  });
  $("update-config-form")?.addEventListener("submit", onSaveConfig);
  $("update-history")?.addEventListener("click", onHistoryClick);

  window.addEventListener("beforeunload", (ev) => {
    if (installActive) {
      ev.preventDefault();
      ev.returnValue = "Update läuft — Seite wirklich verlassen?";
    }
  });
}

/** Updates-Seite anzeigen und Daten laden. */
export async function showUpdatesPage() {
  bindUpdatesPage();
  notesExpanded = false;
  await refreshUpdatesPage();
  schedulePoll(false);
}

async function refreshUpdatesPage() {
  const cached = await api.updatesInfo();
  const status = await api.updatesStatus();
  renderDashboard(cached?.data || {}, status?.data || status || {});
}

function renderDashboard(cachedWrap, statusWrap) {
  const info = cachedWrap?.info || cachedWrap || {};
  const config = cachedWrap?.config || {};
  const enabled = cachedWrap?.enabled !== false;
  const lastCheck = cachedWrap?.lastCheckAt;
  const status = statusWrap?.phase ? statusWrap : statusWrap?.data || {};

  const currentEl = $("update-current-version");
  const latestEl = $("update-latest-version");
  const badgeEl = $("update-badge");
  const lastEl = $("update-last-check");
  const intervalEl = $("update-interval-label");
  const notesEl = $("update-release-notes");
  const installBtn = $("btn-update-install");
  const msgEl = $("update-msg");
  const disabledEl = $("update-disabled-hint");

  if (currentEl) currentEl.textContent = `v${info.currentVersion || "?"}`;
  if (latestEl) latestEl.textContent = info.hasUpdate ? `v${info.latestVersion}` : "—";
  if (badgeEl) {
    badgeEl.hidden = !info.hasUpdate;
    badgeEl.textContent = info.critical ? "Kritisches Update" : "Update verfügbar";
    badgeEl.classList.toggle("is-critical", Boolean(info.critical));
  }
  if (lastEl) lastEl.textContent = formatRelative(lastCheck);
  if (intervalEl) intervalEl.textContent = formatInterval(config.checkIntervalSec || 86400);

  if (disabledEl) {
    disabledEl.hidden = enabled;
    disabledEl.textContent =
      "Automatische Updates sind deaktiviert (UPDATE_REPO / UPDATE_ENABLED). Manuelle Prüfung bleibt möglich.";
  }

  if (notesEl) {
    if (info.releaseNotes) {
      notesEl.innerHTML = renderReleaseNotes(info.releaseNotes, notesExpanded);
      if (info.releaseUrl) {
        notesEl.innerHTML += `<p><a href="${esc(info.releaseUrl)}" target="_blank" rel="noopener">Release auf GitHub öffnen</a></p>`;
      }
    } else {
      notesEl.innerHTML = `<p class="muted">Keine Release-Notes — aktuellste Version installiert oder noch nicht geprüft.</p>`;
    }
  }

  if (installBtn) {
    installBtn.hidden = !info.hasUpdate;
    installBtn.disabled = installActive || status.phase === "downloading" || status.phase === "installing";
  }

  if (msgEl && status.error) msgEl.textContent = status.error;

  renderConfigForm(config);
  renderHistory(statusWrap?.history || []);
  renderProgress(status);
}

function renderConfigForm(config) {
  const form = $("update-config-form");
  if (!form) return;
  const enabled = form.querySelector('[name="enabled"]');
  const interval = form.querySelector('[name="checkIntervalSec"]');
  const prerelease = form.querySelector('[name="allowPrerelease"]');
  const autoInstall = form.querySelector('[name="autoInstall"]');
  const repo = form.querySelector('[name="repo"]');
  if (enabled) enabled.checked = config.enabled !== false;
  if (interval) interval.value = String(config.checkIntervalSec || 86400);
  if (prerelease) prerelease.checked = Boolean(config.allowPrerelease);
  if (autoInstall) autoInstall.checked = Boolean(config.autoInstall);
  if (repo) repo.value = config.repo || "";
}

function renderHistory(history) {
  const root = $("update-history");
  if (!root) return;
  if (!history?.length) {
    root.innerHTML = `<p class="muted">Noch keine Updates durchgeführt.</p>`;
    return;
  }
  const rows = history
    .map((h) => {
      const canRollback =
        h.status === "success" &&
        h.backupDir &&
        Date.now() - Date.parse(h.at) < 7 * 24 * 60 * 60 * 1000;
      const rollbackBtn = canRollback
        ? `<button type="button" class="btn ghost btn-sm" data-rollback="${esc(h.id)}">Backup wiederherstellen</button>`
        : "";
      return `<tr>
        <td>${esc(new Date(h.at).toLocaleString())}</td>
        <td>v${esc(h.fromVersion)} → v${esc(h.toVersion)}</td>
        <td>${esc(statusLabel(h))}</td>
        <td>${esc(formatDuration(h.durationMs))}</td>
        <td>${rollbackBtn}</td>
      </tr>`;
    })
    .join("");
  root.innerHTML = `<table class="update-history-table"><thead><tr>
    <th>Datum</th><th>Version</th><th>Status</th><th>Dauer</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderProgress(status) {
  const box = $("update-progress-panel");
  if (!box) return;
  const phase = status?.phase || "idle";
  installActive = ["pending", "downloading", "installing"].includes(phase);
  const show = installActive || phase === "completed" || phase === "failed";
  box.hidden = !show;

  const fill = box.querySelector(".update-progress-fill");
  const label = $("update-progress-label");
  if (fill) fill.style.width = `${status.progress || 0}%`;
  if (label) label.textContent = status.message || "";

  syncChromeProgress(phase, status.progress, status.message);

  if (phase === "completed") {
    showUpdateToast("Update abgeschlossen — Seite wird neu geladen …");
    window.setTimeout(() => window.location.reload(), 4000);
  }
  if (phase === "failed") {
    showUpdateToast(`Update fehlgeschlagen: ${status.error || status.message || ""}`);
    installActive = false;
  }
}

function schedulePoll(force) {
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    if (location.hash.replace(/^#/, "") !== "/admin/updates") return;
    const st = await api.updatesStatus();
    const data = st?.data || st;
    renderProgress(data);
    if (!["pending", "downloading", "installing"].includes(data?.phase)) {
      if (force) await refreshUpdatesPage();
    }
  }, POLL_MS);
}

async function onCheck() {
  const msg = $("update-msg");
  if (msg) msg.textContent = "Prüfe GitHub …";
  const res = await api.updatesCheck(true);
  if (!res.ok) {
    if (msg) msg.textContent = res.data?.error || "GitHub nicht erreichbar — bitte später erneut versuchen.";
    return;
  }
  if (msg) msg.textContent = "";
  await refreshUpdatesPage();
}

async function onInstallClick() {
  const cached = await api.updatesInfo();
  const info = cached?.data?.info || cached?.info || {};
  if (!info.hasUpdate) return;

  const ok = window.confirm(
    `Update von v${info.currentVersion} auf v${info.latestVersion} installieren?\n\n` +
      "Der Server wird neu gestartet. Ein Backup wird automatisch erstellt."
  );
  if (!ok) return;

  if (!(await ensureStepUp())) return;

  installActive = true;
  showUpdateToast("Update wird installiert …");
  const res = await api.updatesInstall({ tagName: info.tagName });
  if (!res.ok) {
    installActive = false;
    hideUpdateToast();
    const msg = $("update-msg");
    if (msg) msg.textContent = res.data?.error || "Installation konnte nicht gestartet werden.";
    return;
  }
  schedulePoll(true);
}

async function onSaveConfig(ev) {
  ev.preventDefault();
  if (!(await ensureStepUp())) return;
  const form = ev.target;
  const body = {
    enabled: form.querySelector('[name="enabled"]')?.checked,
    checkIntervalSec: Number(form.querySelector('[name="checkIntervalSec"]')?.value),
    allowPrerelease: form.querySelector('[name="allowPrerelease"]')?.checked,
    autoInstall: form.querySelector('[name="autoInstall"]')?.checked,
  };
  const res = await api.updatesSaveConfig(body);
  const msg = $("update-config-msg");
  if (!res.ok) {
    if (msg) msg.textContent = res.data?.error || "Speichern fehlgeschlagen.";
    return;
  }
  if (msg) msg.textContent = "Einstellungen gespeichert.";
  await refreshUpdatesPage();
}

async function onHistoryClick(ev) {
  const btn = ev.target.closest("[data-rollback]");
  if (!btn) return;
  if (!(await ensureStepUp())) return;
  const historyId = btn.getAttribute("data-rollback");
  if (!window.confirm("Backup wirklich wiederherstellen? Der Server muss danach neu gestartet werden.")) return;
  const res = await api.updatesRollback({ historyId });
  const msg = $("update-msg");
  if (!res.ok) {
    if (msg) msg.textContent = res.data?.error || "Rollback fehlgeschlagen.";
    return;
  }
  if (msg) msg.textContent = "Backup wiederhergestellt.";
  await refreshUpdatesPage();
}

/** WebSocket-Ereignisse für Live-Fortschritt (optional, wenn WS verbunden). */
export function bindUpdateWsEvents(client) {
  if (!client) return;
  const onProgress = (payload) => {
    renderProgress(payload || {});
    if (location.hash.replace(/^#/, "") === "/admin/updates") schedulePoll(true);
  };
  client.on("update_started", onProgress);
  client.on("update_progress", onProgress);
  client.on("update_completed", onProgress);
  client.on("update_failed", onProgress);
  client.on("update_rollback", () => refreshUpdatesPage());
  client.on("server_shutdown", (payload) => {
    showUpdateToast(payload?.message || "Server startet neu …");
  });
}
