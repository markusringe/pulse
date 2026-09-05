/**
 * Sonderfolien (Start / Pause / Ende) — Rendering für Stage und Presenter.
 * Stile analog zum Event-Countdown (classic, modern, retro).
 */

import { sanitizeCountdownStyle } from "./eventCountdown.js";

/** @type {Map<string, { kind: string, style: string }>} */
const mountCache = new Map();

/**
 * Konfiguration einer Sonderfolie aus eventMeta lesen.
 * @param {object | null | undefined} meta
 * @param {'start'|'pause'|'end'} kind
 */
export function getSpecialSlideConfig(meta, kind) {
  if (!meta || !kind) return null;
  const key = kind === "start" ? "startSlide" : kind === "pause" ? "pauseSlide" : "endSlide";
  const cfg = meta[key];
  if (!cfg?.enabled) return null;
  return {
    ...cfg,
    style: sanitizeCountdownStyle(cfg.style),
  };
}

/**
 * Prüfen, ob eine Sonderfolie angezeigt werden soll.
 * @param {object | null | undefined} session
 */
export function activeSpecialSlideKind(session) {
  const kind = String(session?.specialSlide || "")
    .trim()
    .toLowerCase();
  if (!["start", "pause", "end"].includes(kind)) return null;
  return getSpecialSlideConfig(session?.eventMeta, kind) ? kind : null;
}

/**
 * Sonderfolie in einen Host mounten (Mount-once, nur Text bei Updates).
 * @param {HTMLElement} host
 * @param {'start'|'pause'|'end'} kind
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
      <div class="ess ess--${esc(style)} ess--kind-${esc(kind)}" role="region" aria-live="polite">
        <div class="ess-inner">
          <div class="ess-icon" aria-hidden="true">
            ${kind === "pause" ? pauseIconSvg() : kind === "end" ? endIconSvg() : startIconSvg()}
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

/** Presenter-Mini-Vorschau für Programm-Kacheln. */
export function specialSlidePreviewHtml(kind, cfg) {
  if (!cfg?.enabled) return "";
  const style = sanitizeCountdownStyle(cfg.style);
  return `
    <span class="ppc-preview ess-preview ess-preview--${esc(style)}" aria-hidden="true">
      <span class="ppc-preview-title">${esc((cfg.title || "").slice(0, 24))}</span>
    </span>
  `;
}

function startIconSvg() {
  return `<svg viewBox="0 0 64 64" class="ess-svg"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 20v24l20-12z" fill="currentColor"/></svg>`;
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
