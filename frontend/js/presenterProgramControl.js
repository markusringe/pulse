/**
 * Presenter-Programmsteuerung: Start-, Pause- und Endfolie plus Hilfe-Button.
 * Fest unten rechts in der Presenter-Ansicht — ersetzt nicht den globalen Hilfe-FAB.
 */

import { getSpecialSlideConfig, specialSlidePreviewHtml } from "./eventSpecialSlides.js";
import { openPresenterHelpModal } from "./presenterHelpModal.js";
import { t } from "./i18n.js";

/** @type {{
 *   host: HTMLElement | null,
 *   ctx: object | null,
 *   listenersBound: boolean,
 * }} */
const state = {
  host: null,
  ctx: null,
  listenersBound: false,
};

/**
 * Programm-Leiste synchronisieren (nur Event-Sessions mit mindestens einer aktiven Sonderfolie oder Hilfe).
 * @param {HTMLElement | null} host
 * @param {{
 *   session: object,
 *   connectionOpen?: boolean,
 *   emit?: (type: string, payload: object) => void,
 * }} ctx
 */
export function syncPresenterProgramControl(host, ctx) {
  if (!host || !ctx?.session?.eventId) {
    teardown(host);
    return;
  }

  const meta = ctx.session.eventMeta || {};
  const kinds = ["start", "pause", "end"].filter((k) => getSpecialSlideConfig(meta, k));
  const eventEnded = meta.status === "ended" || ctx.session.specialSlide === "end";
  const showBar = kinds.length > 0 || true;

  if (!showBar) {
    teardown(host);
    return;
  }

  state.host = host;
  state.ctx = ctx;

  if (!host.querySelector(".presenter-program-inner")) {
    mountShell(host, kinds, meta, eventEnded);
  } else {
    updateDynamicFields(kinds, meta, eventEnded);
  }

  host.hidden = false;
}

/** Leiste entfernen / ausblenden. */
export function destroyPresenterProgramControl() {
  teardown(state.host);
}

function teardown(host) {
  if (host) {
    host.hidden = true;
    host.replaceChildren();
  }
  state.host = null;
  state.ctx = null;
}

function mountShell(host, kinds, meta, eventEnded) {
  const active = String(state.ctx?.session?.specialSlide || "");

  host.innerHTML = `
    <div class="presenter-program-inner" role="region" aria-label="${esc(t("programControl.label"))}">
      ${
        eventEnded
          ? `<p class="presenter-program-ended" role="status">${esc(t("programControl.eventEnded"))}</p>`
          : ""
      }
      <div class="presenter-program-tiles" role="group" aria-label="${esc(t("programControl.tiles"))}">
        ${kinds
          .map((kind) => tileHtml(kind, meta[kind === "start" ? "startSlide" : kind === "pause" ? "pauseSlide" : "endSlide"], active === kind))
          .join("")}
      </div>
      <button type="button" class="presenter-program-help icon-btn" data-ppc-help aria-label="${esc(t("programControl.help"))}" title="${esc(t("programControl.help"))}">
        <span class="presenter-program-help-icon" aria-hidden="true">?</span>
      </button>
    </div>
  `;

  if (!state.listenersBound) {
    host.addEventListener("click", onHostClick);
    state.listenersBound = true;
  }
}

function tileHtml(kind, cfg, isActive) {
  const labels = {
    start: t("programControl.start"),
    pause: t("programControl.pause"),
    end: t("programControl.end"),
  };
  return `
    <button type="button" class="presenter-program-tile ${isActive ? "is-active" : ""}" data-ppc-kind="${esc(kind)}" aria-pressed="${isActive ? "true" : "false"}">
      <span class="presenter-program-tile-label">${esc(labels[kind] || kind)}</span>
      ${specialSlidePreviewHtml(kind, cfg)}
    </button>
  `;
}

function updateDynamicFields(kinds, meta, eventEnded) {
  const host = state.host;
  if (!host) return;
  const active = String(state.ctx?.session?.specialSlide || "");
  const endedEl = host.querySelector(".presenter-program-ended");
  if (endedEl) endedEl.hidden = !eventEnded;

  const tiles = host.querySelector(".presenter-program-tiles");
  if (tiles) {
    tiles.innerHTML = kinds
      .map((kind) =>
        tileHtml(
          kind,
          meta[kind === "start" ? "startSlide" : kind === "pause" ? "pauseSlide" : "endSlide"],
          active === kind
        )
      )
      .join("");
  }
}

function onHostClick(ev) {
  const helpBtn = ev.target.closest("[data-ppc-help]");
  if (helpBtn) {
    void openPresenterHelpModal();
    return;
  }

  const tile = ev.target.closest("[data-ppc-kind]");
  if (!tile) return;

  const kind = tile.getAttribute("data-ppc-kind");
  const ctx = state.ctx;
  if (!ctx?.session || !kind) return;

  const payload = {
    code: ctx.session.code,
    index: ctx.session.activeSlideIndex || 0,
    specialSlide: kind,
    expectedVersion: ctx.session.stateVersion ?? 0,
  };

  const sent = ctx.emit?.("slide", payload);
  if (sent !== false) {
    ctx.session.specialSlide = kind;
    if (kind === "end" && ctx.session.eventMeta) ctx.session.eventMeta.status = "ended";
    updateDynamicFields(
      ["start", "pause", "end"].filter((k) => getSpecialSlideConfig(ctx.session.eventMeta, k)),
      ctx.session.eventMeta || {},
      kind === "end"
    );
  }
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
