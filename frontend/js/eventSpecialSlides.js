/**
 * Sonderfolien (Countdown / Pause / Ende) — Rendering für Stage und Presenter.
 * Steuerung via eventMeta.currentSpecialSlide (serverseitig persistiert).
 */

import { sanitizeCountdownStyle } from "./eventCountdown.js";

/** @type {Map<string, { kind: string, style: string }>} */
const mountCache = new Map();

/**
 * Aktive Sonderansicht aus Session/eventMeta.
 * @param {object | null | undefined} session
 * @returns {'countdown'|'pause'|'end'|null}
 */
export function getCurrentSpecialSlide(session) {
  const raw = session?.eventMeta?.currentSpecialSlide ?? session?.currentSpecialSlide;
  const k = String(raw || "")
    .trim()
    .toLowerCase();
  return k === "countdown" || k === "pause" || k === "end" ? k : null;
}

/**
 * Konfiguration einer Sonderfolie aus eventMeta lesen.
 * @param {object | null | undefined} meta
 * @param {'start'|'pause'|'end'|'countdown'} kind
 */
export function getSpecialSlideConfig(meta, kind) {
  if (!meta || !kind) return null;
  if (kind === "countdown") {
    return meta.startTime ? { enabled: true, style: sanitizeCountdownStyle(meta.countdownStyle) } : null;
  }
  const key = kind === "start" ? "startSlide" : kind === "pause" ? "pauseSlide" : "endSlide";
  const cfg = meta[key];
  if (!cfg?.enabled) return null;
  return {
    ...cfg,
    style: sanitizeCountdownStyle(cfg.style),
  };
}

/**
 * Pause- oder Endfolie für Stage/Presenter (nicht Countdown).
 * @param {object | null | undefined} session
 */
export function activeSpecialSlideKind(session) {
  const current = getCurrentSpecialSlide(session);
  if (current !== "pause" && current !== "end") return null;
  return getSpecialSlideConfig(session?.eventMeta, current) ? current : null;
}

/**
 * Countdown auf Stage erzwingen (Presenter-Button).
 * @param {object | null | undefined} session
 */
export function isCountdownSpecialActive(session) {
  return getCurrentSpecialSlide(session) === "countdown";
}

/**
 * Sonderfolie in einen Host mounten (Mount-once, nur Text bei Updates).
 * @param {HTMLElement} host
 * @param {'pause'|'end'|'start'} kind
 * @param {object} meta eventMeta
 * @param {{ t?: (k: string, vars?: object) => string }} [opts]
 */
export function mountSpecialSlide(host, kind, meta, opts = {}) {
  const cfg = getSpecialSlideConfig(meta, kind);
  if (!host || !cfg) {
    host?.replaceChildren();
    return null;
  }

  const t = opts.t || ((k) => k);
  const style = sanitizeCountdownStyle(cfg.style);
  const cacheKey = `${host.id || "host"}|${kind}|${style}`;
  const prev = mountCache.get(cacheKey);

  if (!prev || prev.kind !== kind || prev.style !== style || !host.querySelector(".ess")) {
    host.dataset.specialSlide = kind;
    host.dataset.essStyle = style;
    host.innerHTML = `
      <div class="ess ess--${esc(style)} ess--kind-${esc(kind)}" data-style="${esc(style)}" role="region" aria-live="polite">
        <div class="ess-inner">
          <div class="ess-icon" aria-hidden="true">
            ${kind === "pause" ? pauseIconSvg() : endIconSvg()}
          </div>
          <h1 class="ess-title" data-ess-title></h1>
          <p class="ess-subtitle" data-ess-subtitle></p>
          ${
            kind === "end"
              ? `<p class="ess-ended-badge" data-ess-badge>${esc(t("specialSlide.eventEnded"))}</p>`
              : kind === "pause"
                ? `<p class="ess-pause-hint muted" data-ess-hint>${esc(t("specialSlide.pauseHint"))}</p>`
                : ""
          }
        </div>
      </div>
    `;
    mountCache.set(cacheKey, { kind, style });
  }

  const titleEl = host.querySelector("[data-ess-title]");
  const subEl = host.querySelector("[data-ess-subtitle]");
  if (titleEl) titleEl.textContent = cfg.title || "";
  if (subEl) subEl.textContent = cfg.subtitle || "";
  return cfg;
}

function pauseIconSvg() {
  return `<svg viewBox="0 0 64 64" class="ess-svg"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2"/><rect x="24" y="22" width="6" height="20" rx="1" fill="currentColor"/><rect x="34" y="22" width="6" height="20" rx="1" fill="currentColor"/></svg>`;
}

function endIconSvg() {
  return `<svg viewBox="0 0 64 64" class="ess-svg"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 34l8 8 16-18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
