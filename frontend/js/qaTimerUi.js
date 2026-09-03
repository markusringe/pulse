/**
 * Q&A-Countdown in Presenter- und Join-Ansicht.
 *
 * Der Server ist maßgeblich (`endsAt`, Status). Hier läuft nur ein lokaler
 * rAF-Tick, neu synchronisiert bei `qa_timer`-Events und nach Reconnect.
 * Kein LocalStorage — der Stand kommt aus der Session/Folie.
 */

import { setQaIntakeEnabled } from "./qa.js";

/** @type {QaTimerView | null} */
let view = null;
let raf = 0;
/** Differenz serverNow − Date.now(), damit Restzeit nicht von der Client-Uhr abhängt. */
let skewMs = 0;

/**
 * Presenter-Steuerung + Uhr oder (Join) nur kompakte Uhr einhängen.
 * @param {HTMLElement} host
 * @param {{ role: string, t: Function, defaultLimitSec?: number, snapshot?: object,
 *   onAction?: Function }} opts
 */
export function mountQaTimer(host, opts) {
  destroyQaTimer();
  if (!host) return null;
  const t = opts.t || ((k) => k);
  const wrap = document.createElement("div");
  wrap.className = opts.role === "presenter" ? "qa-timer-panel" : "qa-timer-join";
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", t("qa.timer.running"));

  const clock = buildClock(t);
  wrap.append(clock.root);

  if (opts.role === "presenter") {
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<div class="qa-timer-controls">
        <label class="qa-timer-enable"><input type="checkbox" id="qa-timer-enable" /> ${escapeHtml(t("qa.timer.enable"))}</label>
        <label class="field qa-timer-sec-field"><span>${escapeHtml(t("qa.timer.seconds"))}</span>
          <input id="qa-timer-sec" type="number" min="10" max="300" step="10" value="60" />
        </label>
        <p class="qa-timer-status" id="qa-timer-status" role="status"></p>
        <div class="qa-timer-actions">
          <button type="button" class="btn primary" data-qa-timer="start">${escapeHtml(t("qa.timer.start"))}</button>
          <button type="button" class="btn ghost" data-qa-timer="pause">${escapeHtml(t("qa.timer.pause"))}</button>
          <button type="button" class="btn ghost" data-qa-timer="resume">${escapeHtml(t("qa.timer.resume"))}</button>
          <button type="button" class="btn ghost" data-qa-timer="extend" data-sec="30">${escapeHtml(t("qa.timer.extend30"))}</button>
          <button type="button" class="btn ghost" data-qa-timer="extend" data-sec="60">${escapeHtml(t("qa.timer.extend60"))}</button>
          <button type="button" class="btn ghost" data-qa-timer="extend" data-sec="120">${escapeHtml(t("qa.timer.extend120"))}</button>
          <button type="button" class="btn ghost" data-qa-timer="end">${escapeHtml(t("qa.timer.end"))}</button>
        </div>
      </div>`
    );
  } else {
    const status = document.createElement("p");
    status.className = "qa-timer-status muted";
    status.id = "qa-timer-status";
    status.setAttribute("role", "status");
    wrap.append(status);
  }

  host.prepend(wrap);
  view = {
    host,
    wrap,
    opts,
    t,
    clock,
    snapshot: opts.snapshot || null,
    statusEl: wrap.querySelector("#qa-timer-status"),
    enableEl: wrap.querySelector("#qa-timer-enable"),
    secEl: wrap.querySelector("#qa-timer-sec"),
  };

  const def = Number(opts.defaultLimitSec);
  const limit = Number.isFinite(def) ? def : 60;
  if (view.enableEl) view.enableEl.checked = limit > 0;
  if (view.secEl) view.secEl.value = String(limit > 0 ? clampUiLimit(limit) : 60);

  wrap.querySelectorAll("[data-qa-timer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-qa-timer");
      const extra = {};
      if (action === "start" || action === "configure") {
        extra.limitSec = Number(view.secEl?.value) || 60;
      }
      if (action === "extend") extra.seconds = Number(btn.getAttribute("data-sec")) || 30;
      opts.onAction?.(action, extra);
    });
  });
  view.enableEl?.addEventListener("change", () => {
    const on = Boolean(view.enableEl.checked);
    opts.onAction?.("configure", { limitSec: on ? Number(view.secEl?.value) || 60 : 0 });
  });
  view.secEl?.addEventListener("change", () => {
    if (!view.enableEl?.checked) return;
    opts.onAction?.("configure", { limitSec: Number(view.secEl.value) || 60 });
  });

  applyQaTimerSnapshot(opts.snapshot, opts.snapshot?.serverNow);
  return view;
}

/**
 * Snapshot vom Server anwenden (WS qa_timer, Session, Folienwechsel).
 * @param {object} [snap]
 * @param {number} [serverNow]
 */
export function applyQaTimerSnapshot(snap, serverNow) {
  if (!view) return;
  view.snapshot = snap && typeof snap === "object" ? snap : null;
  if (serverNow) skewMs = serverNow - Date.now();
  else if (snap?.serverNow) skewMs = snap.serverNow - Date.now();
  const status = snap?.status || "idle";
  const ended = status === "ended";
  setQaIntakeEnabled(!ended, view.t("qa.timer.ended"));
  if (view.statusEl) {
    view.statusEl.textContent = statusLabel(status, view.t);
  }
  if (view.enableEl && snap) {
    view.enableEl.checked = Boolean(snap.enabled) || status === "running" || status === "paused";
  }
  if (view.secEl && snap?.limitSec) view.secEl.value = String(snap.limitSec);
  tickClock();
}

/** Aktuellen Snapshot lesen (Auto-Start-Entscheidung). */
export function currentQaTimerSnapshot() {
  return view?.snapshot || null;
}

export function isQaTimerEnabled() {
  return Boolean(view?.enableEl?.checked);
}

export function qaTimerLimitSec() {
  return clampUiLimit(Number(view?.secEl?.value) || 60);
}

export function destroyQaTimer() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (view?.wrap) view.wrap.remove();
  view = null;
}

function buildClock(t) {
  const root = document.createElement("div");
  root.className = "qa-timer-clock";
  root.dataset.urgency = "ok";
  root.hidden = true;
  root.innerHTML = `
    <svg class="qa-timer-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" class="qa-timer-ring-bg"></circle>
      <circle cx="60" cy="60" r="52" class="qa-timer-ring-fg"></circle>
    </svg>
    <strong class="qa-timer-digits">–</strong>`;
  const ring = root.querySelector(".qa-timer-ring-fg");
  const digits = root.querySelector(".qa-timer-digits");
  root.setAttribute("aria-label", t("qa.timer.running"));
  return { root, ring, digits };
}

function tickClock() {
  cancelAnimationFrame(raf);
  const step = () => {
    if (!view) return;
    paintClock();
    const st = view.snapshot?.status;
    if (st === "running") raf = requestAnimationFrame(step);
  };
  paintClock();
  if (view.snapshot?.status === "running") raf = requestAnimationFrame(step);
}

function paintClock() {
  if (!view?.clock) return;
  const snap = view.snapshot;
  const st = snap?.status || "idle";
  const show = st === "running" || st === "paused" || st === "ended";
  view.clock.root.hidden = !show;
  if (!show) return;
  const now = Date.now() + skewMs;
  let remainingMs = 0;
  if (st === "running" && snap.endsAt) remainingMs = Math.max(0, snap.endsAt - now);
  else if (st === "paused") remainingMs = Math.max(0, snap.pausedRemainingMs || snap.remainingMs || 0);
  const limitMs = Math.max(1, (snap.limitSec || 60) * 1000);
  const frac = st === "ended" ? 0 : remainingMs / limitMs;
  const sec = Math.ceil(remainingMs / 1000);
  view.clock.digits.textContent = st === "ended" ? "0" : formatMmSs(sec);
  const circ = 2 * Math.PI * 52;
  if (view.clock.ring) {
    view.clock.ring.style.strokeDasharray = String(circ);
    view.clock.ring.style.strokeDashoffset = String(circ * (1 - Math.max(0, Math.min(1, frac))));
  }
  const urgency = frac > 0.5 ? "ok" : frac > 0.25 ? "warn" : "critical";
  view.clock.root.dataset.urgency = st === "ended" ? "critical" : urgency;
  view.clock.root.setAttribute(
    "aria-valuetext",
    st === "ended" ? view.t("qa.timer.ended") : `${sec} ${view.t("qa.timer.seconds")}`
  );
  if (view.statusEl) view.statusEl.textContent = statusLabel(st === "running" && remainingMs <= 0 ? "ended" : st, view.t);
}

function statusLabel(status, t) {
  if (status === "running") return t("qa.timer.running");
  if (status === "ended") return t("qa.timer.ended");
  if (status === "paused") return t("qa.timer.paused");
  return t("qa.timer.idle");
}

function formatMmSs(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function clampUiLimit(n) {
  if (!Number.isFinite(n) || n <= 0) return 60;
  const stepped = Math.round(n / 10) * 10;
  return Math.max(10, Math.min(300, stepped));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
