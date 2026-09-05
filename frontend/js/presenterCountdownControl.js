/**
 * Presenter-Leiste für Event-Countdown: Restzeit, Status, Start, QR-Toggle, Stage-Vorschau.
 * Steuert nur die Presenter-Ansicht — keine Controls auf #/stage (Screen-Share).
 *
 * Architektur: Shell einmal mounten, Event-Delegation auf dem Host,
 * Tick aktualisiert nur Text/Klassen — kein innerHTML-Neuaufbau pro Sekunde.
 */

import { remainingMs, splitTime, sanitizeCountdownStyle } from "./eventCountdown.js";
import { t } from "./i18n.js";

/** @type {{
 *   host: HTMLElement | null,
 *   timer: number,
 *   ctx: object | null,
 *   mountKey: string,
 *   popoverOpen: boolean,
 *   listenersBound: boolean,
 * }} */
const state = {
  host: null,
  timer: 0,
  ctx: null,
  mountKey: "",
  popoverOpen: false,
  listenersBound: false,
};

/**
 * Presenter-Countdown-Leiste synchronisieren.
 * @param {HTMLElement | null} host
 * @param {{
 *   session: object,
 *   clockSkew?: number,
 *   connectionOpen?: boolean,
 *   emit?: (type: string, payload: object) => void,
 *   onStart?: () => void,
 *   onToggleQr?: (show: boolean) => void,
 * }} ctx
 * @param {boolean} visible
 */
export function syncPresenterCountdownControl(host, ctx, visible) {
  if (!host || !visible || !ctx?.session?.eventMeta?.startTime) {
    teardown();
    return;
  }

  state.ctx = ctx;
  const meta = ctx.session.eventMeta;
  const code = ctx.session.code || ctx.session.joinCode;
  const style = sanitizeCountdownStyle(meta.countdownStyle);
  const mountKey = `${code}|${style}`;

  if (state.host !== host || state.mountKey !== mountKey) {
    state.host = host;
    state.mountKey = mountKey;
    state.popoverOpen = false;
    mountShell(host, code);
  }

  host.hidden = false;
  host.dataset.countdownStyle = style;
  updateDynamicFields();

  if (!state.timer) {
    state.timer = window.setInterval(updateDynamicFields, 1000);
  }
}

/** Statisches Markup einmal erzeugen — Listener per Delegation am Host. */
function mountShell(host, code) {
  const stageUrl = `${location.origin}${location.pathname.replace(/\/$/, "")}#/stage/${code}?share=1`;
  const stageOpenUrl = `${location.origin}${location.pathname.replace(/\/$/, "")}#/stage/${code}`;

  host.innerHTML = `
    <div class="presenter-countdown-inner" role="region" aria-label="${esc(t("countdown.control.label"))}">
      <div class="presenter-countdown-time">
        <span class="presenter-countdown-digits" data-pcd-digits aria-live="polite">--:--</span>
        <span class="presenter-countdown-pill" data-pcd-pill data-state="running"></span>
      </div>
      <p class="presenter-countdown-sync muted" data-pcd-sync role="status"></p>
      <div class="presenter-countdown-actions">
        <button type="button" class="btn primary" data-pcd-start>${esc(t("countdown.startNow"))}</button>
        <label class="check presenter-countdown-qr-toggle">
          <input type="checkbox" data-pcd-qr />
          ${esc(t("countdown.qr.toggle"))}
        </label>
        <button type="button" class="btn ghost" data-pcd-stage data-stage-url="${esc(stageOpenUrl)}">${esc(t("countdown.stagePreview"))}</button>
        <a class="btn ghost" href="${esc(stageUrl)}" target="_blank" rel="noopener">${esc(t("countdown.shareMode"))}</a>
        <button type="button" class="btn ghost" data-pcd-time-pop aria-expanded="false">${esc(t("countdown.editTime"))}</button>
      </div>
      <div class="presenter-countdown-popover" hidden data-pcd-popover>
        <p class="eyebrow">${esc(t("countdown.editTime"))}</p>
        <div class="presenter-countdown-presets">
          ${[1, 5, 10, 15, 30].map((m) => `<button type="button" class="btn ghost btn--sm" data-pcd-preset="${m}">${m} min</button>`).join("")}
        </div>
        <label class="field">
          <span>${esc(t("countdown.customTime"))}</span>
          <input type="datetime-local" data-pcd-datetime />
        </label>
        <button type="button" class="btn primary btn--sm" data-pcd-apply>${esc(t("countdown.applyTime"))}</button>
      </div>
    </div>
  `;

  if (!state.listenersBound) {
    host.addEventListener("click", onHostClick);
    host.addEventListener("change", onHostChange);
    state.listenersBound = true;
  }
}

/** Nur veränderliche Felder pro Tick / Sync aktualisieren. */
function updateDynamicFields() {
  const host = state.host;
  const ctx = state.ctx;
  if (!host || !ctx?.session?.eventMeta) return;

  const meta = ctx.session.eventMeta;
  const ms = remainingMs(meta.startTime, ctx.clockSkew || 0);
  const parts = splitTime(ms);
  const digits =
    parts.totalSec < 3600
      ? `${pad(parts.minutes)}:${pad(parts.seconds)}`
      : `${parts.hours}:${pad(parts.minutes)}:${pad(parts.seconds)}`;

  const digitsEl = host.querySelector("[data-pcd-digits]");
  if (digitsEl) digitsEl.textContent = digits;

  const pillEl = host.querySelector("[data-pcd-pill]");
  if (pillEl) {
    const expired = ms <= 0;
    pillEl.dataset.state = expired ? "expired" : "running";
    pillEl.textContent = expired ? t("countdown.status.expired") : t("countdown.status.running");
  }

  const syncEl = host.querySelector("[data-pcd-sync]");
  if (syncEl) {
    syncEl.textContent = ctx.connectionOpen ? t("countdown.sync.ok") : t("countdown.sync.wait");
  }

  const qrEl = host.querySelector("[data-pcd-qr]");
  if (qrEl && qrEl.checked !== Boolean(meta.showStageQr)) {
    qrEl.checked = Boolean(meta.showStageQr);
  }

  const pop = host.querySelector("[data-pcd-popover]");
  const popBtn = host.querySelector("[data-pcd-time-pop]");
  if (pop && popBtn) {
    pop.hidden = !state.popoverOpen;
    popBtn.setAttribute("aria-expanded", state.popoverOpen ? "true" : "false");
    if (state.popoverOpen) {
      const input = pop.querySelector("[data-pcd-datetime]");
      if (input && meta.startTime && !input.value) {
        input.value = toDatetimeLocal(meta.startTime);
      }
    }
  }
}

/** Klick-Delegation — ein Handler für die Lebensdauer des Hosts. */
function onHostClick(ev) {
  const target = ev.target;
  if (!(target instanceof Element)) return;
  const ctx = state.ctx;
  if (!ctx) return;

  if (target.closest("[data-pcd-start]")) {
    ctx.onStart?.();
    return;
  }

  if (target.closest("[data-pcd-stage]")) {
    const url = target.closest("[data-pcd-stage]")?.getAttribute("data-stage-url");
    if (url) window.open(url, "_blank", "noopener");
    return;
  }

  if (target.closest("[data-pcd-time-pop]")) {
    state.popoverOpen = !state.popoverOpen;
    updateDynamicFields();
    return;
  }

  const presetBtn = target.closest("[data-pcd-preset]");
  if (presetBtn) {
    const mins = Number(presetBtn.getAttribute("data-pcd-preset")) || 5;
    applyRelativeStartTime(ctx, mins * 60 * 1000);
    state.popoverOpen = false;
    updateDynamicFields();
    return;
  }

  if (target.closest("[data-pcd-apply]")) {
    const pop = state.host?.querySelector("[data-pcd-popover]");
    const raw = pop?.querySelector("[data-pcd-datetime]")?.value;
    const iso = fromDatetimeLocal(raw);
    if (iso) {
      applyStartTime(ctx, iso);
      state.popoverOpen = false;
      updateDynamicFields();
    }
  }
}

/** Change-Delegation für Checkboxen. */
function onHostChange(ev) {
  const target = ev.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches("[data-pcd-qr]")) return;
  state.ctx?.onToggleQr?.(target.checked);
}

/** Leiste vollständig abbauen. */
function teardown() {
  if (state.timer) {
    window.clearInterval(state.timer);
    state.timer = 0;
  }
  if (state.host) {
    state.host.hidden = true;
    state.host.innerHTML = "";
  }
  state.host = null;
  state.ctx = null;
  state.mountKey = "";
  state.popoverOpen = false;
}

/** ISO → datetime-local (Browser-Zeitzone). */
function toDatetimeLocal(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const padN = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${padN(d.getMonth() + 1)}-${padN(d.getDate())}T${padN(d.getHours())}:${padN(d.getMinutes())}`;
}

/** datetime-local → ISO. */
function fromDatetimeLocal(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString();
}

/** Startzeit relativ ab jetzt setzen (Presenter-Presets). */
function applyRelativeStartTime(ctx, deltaMs) {
  const iso = new Date(Date.now() + (ctx.clockSkew || 0) + deltaMs).toISOString();
  applyStartTime(ctx, iso);
}

/** Neue Startzeit per WebSocket an den Server senden. */
function applyStartTime(ctx, iso) {
  if (!ctx?.emit || !ctx?.session?.code) return;
  ctx.emit("event_countdown", {
    code: ctx.session.code,
    action: "set_start_time",
    startTime: iso,
  });
  if (ctx.session.eventMeta) ctx.session.eventMeta.startTime = iso;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Leiste beim Verlassen der Presenter-Ansicht abbauen. */
export function destroyPresenterCountdownControl() {
  teardown();
  state.listenersBound = false;
}
