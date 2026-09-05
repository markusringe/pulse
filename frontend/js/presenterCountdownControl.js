/**
 * Presenter-Leiste für Event-Countdown: Restzeit, Status, Start, QR-Toggle, Stage-Vorschau.
 * Steuert nur die Presenter-Ansicht — keine Controls auf #/stage (Screen-Share).
 */

import { remainingMs, splitTime, sanitizeCountdownStyle } from "./eventCountdown.js";
import { t } from "./i18n.js";

/** @type {{ stop: () => void } | null} */
let tickCtl = null;

/**
 * Presenter-Countdown-Leiste rendern oder ausblenden.
 * @param {HTMLElement | null} host
 * @param {{
 *   session: object,
 *   clockSkew?: number,
 *   connectionOpen?: boolean,
 *   onStart?: () => void,
 *   onToggleQr?: (show: boolean) => void,
 *   joinUrl?: string,
 * }} ctx
 * @param {boolean} visible
 */
export function syncPresenterCountdownControl(host, ctx, visible) {
  tickCtl?.stop();
  tickCtl = null;
  if (!host) return;
  if (!visible || !ctx?.session?.eventMeta?.startTime) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }

  const meta = ctx.session.eventMeta;
  const code = ctx.session.code || ctx.session.joinCode;
  const style = sanitizeCountdownStyle(meta.countdownStyle);

  const paint = () => {
    const ms = remainingMs(meta.startTime, ctx.clockSkew || 0);
    const parts = splitTime(ms);
    const digits =
      parts.totalSec < 3600
        ? `${pad(parts.minutes)}:${pad(parts.seconds)}`
        : `${parts.hours}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
    const syncLabel = ctx.connectionOpen ? t("countdown.sync.ok") : t("countdown.sync.wait");
    const qrOn = Boolean(meta.showStageQr);
    const stageUrl = `${location.origin}${location.pathname.replace(/\/$/, "")}#/stage/${code}?share=1`;

    host.hidden = false;
    host.dataset.countdownStyle = style;
    host.innerHTML = `
      <div class="presenter-countdown-inner" role="region" aria-label="${esc(t("countdown.control.label"))}">
        <div class="presenter-countdown-time">
          <span class="presenter-countdown-digits" aria-live="polite">${esc(digits)}</span>
          <span class="presenter-countdown-pill" data-state="${ms <= 0 ? "expired" : "running"}">${esc(ms <= 0 ? t("countdown.status.expired") : t("countdown.status.running"))}</span>
        </div>
        <p class="presenter-countdown-sync muted" role="status">${esc(syncLabel)}</p>
        <div class="presenter-countdown-actions">
          <button type="button" class="btn primary" data-pcd-start ${ms <= 0 ? "" : ""}>${esc(t("countdown.startNow"))}</button>
          <label class="check presenter-countdown-qr-toggle">
            <input type="checkbox" data-pcd-qr ${qrOn ? "checked" : ""} />
            ${esc(t("countdown.qr.toggle"))}
          </label>
          <button type="button" class="btn ghost" data-pcd-stage>${esc(t("countdown.stagePreview"))}</button>
          <a class="btn ghost" href="${esc(stageUrl)}" target="_blank" rel="noopener">${esc(t("countdown.shareMode"))}</a>
          <button type="button" class="btn ghost" data-pcd-time-pop>${esc(t("countdown.editTime"))}</button>
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

    host.querySelector("[data-pcd-start]")?.addEventListener("click", () => ctx.onStart?.());
    host.querySelector("[data-pcd-qr]")?.addEventListener("change", (ev) => {
      ctx.onToggleQr?.(ev.target.checked);
    });
    host.querySelector("[data-pcd-stage]")?.addEventListener("click", () => {
      window.open(`${location.origin}${location.pathname.replace(/\/$/, "")}#/stage/${code}`, "_blank", "noopener");
    });
    const pop = host.querySelector("[data-pcd-popover]");
    host.querySelector("[data-pcd-time-pop]")?.addEventListener("click", () => {
      if (!pop) return;
      pop.hidden = !pop.hidden;
      const input = pop.querySelector("[data-pcd-datetime]");
      if (input && meta.startTime) input.value = toDatetimeLocal(meta.startTime);
    });
    pop?.querySelectorAll("[data-pcd-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mins = Number(btn.getAttribute("data-pcd-preset")) || 5;
        applyRelativeStartTime(ctx, mins * 60 * 1000);
        pop.hidden = true;
      });
    });
    pop?.querySelector("[data-pcd-apply]")?.addEventListener("click", () => {
      const raw = pop.querySelector("[data-pcd-datetime]")?.value;
      const iso = fromDatetimeLocal(raw);
      if (!iso) return;
      applyStartTime(ctx, iso);
      pop.hidden = true;
    });
  };

  paint();
  tickCtl = {
    stop() {
      window.clearInterval(timer);
    },
  };
  const timer = window.setInterval(paint, 1000);
  tickCtl.stop = () => window.clearInterval(timer);
}

/** ISO → datetime-local (Browser-Zeitzone). */
function toDatetimeLocal(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO. */
function fromDatetimeLocal(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString();
}

/**
 * Startzeit relativ ab jetzt setzen (Presenter-Presets).
 * @param {object} ctx
 * @param {number} deltaMs
 */
function applyRelativeStartTime(ctx, deltaMs) {
  const iso = new Date(Date.now() + (ctx.clockSkew || 0) + deltaMs).toISOString();
  applyStartTime(ctx, iso);
}

/**
 * Neue Startzeit per WebSocket an den Server senden.
 * @param {object} ctx
 * @param {string} iso
 */
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
  tickCtl?.stop();
  tickCtl = null;
}
