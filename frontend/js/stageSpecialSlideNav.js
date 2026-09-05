/**
 * Floating Action Bar auf der Stage: Countdown, Pause, Ende.
 * Nur für authentifizierte Presenter/Admins (nicht im Screen-Share ?share=1).
 * Keine Keyboard-Shortcuts — Stage bleibt reine Anzeige.
 */

import { getSpecialSlideConfig } from "./eventSpecialSlides.js";
import {
  buildSpecialSlideButtonsHtml,
  handleSpecialSlideButtonClick,
  updateSpecialSlideButtons,
} from "./specialSlideNavCore.js";

/** @type {{
 *   host: HTMLElement | null,
 *   ctx: object | null,
 *   canControl: boolean,
 *   shareMode: boolean,
 *   listenersBound: boolean,
 * }} */
const state = {
  host: null,
  ctx: null,
  canControl: false,
  shareMode: false,
  listenersBound: false,
};

/**
 * FAB auf der Stage synchronisieren.
 * @param {{
 *   session: object | null,
 *   canControl?: boolean,
 *   shareMode?: boolean,
 *   emit?: (type: string, payload: object) => boolean | void,
 * }} options
 */
export function syncStageSpecialSlideNav(options) {
  const host = document.getElementById("stage-special-slide-nav");
  if (!host) return;

  state.canControl = Boolean(options.canControl);
  state.shareMode = Boolean(options.shareMode);
  state.ctx = options.session?.eventId
    ? { session: options.session, emit: options.emit }
    : null;

  if (!state.ctx || !state.canControl || state.shareMode) {
    teardown(host);
    return;
  }

  const meta = options.session.eventMeta || {};
  const hasCountdown = Boolean(meta.startTime);
  const hasPause = Boolean(getSpecialSlideConfig(meta, "pause"));
  const hasEnd = Boolean(getSpecialSlideConfig(meta, "end"));
  if (!hasCountdown && !hasPause && !hasEnd) {
    teardown(host);
    return;
  }

  state.host = host;
  if (!host.querySelector(".stage-special-btns")) {
    host.innerHTML = buildSpecialSlideButtonsHtml({
      hasCountdown,
      hasPause,
      hasEnd,
      includeHelp: false,
      groupClass: "stage-special-btns",
      btnClass: "btn ghost stage-special-btn",
    });
    if (!state.listenersBound) {
      host.addEventListener("click", onHostClick);
      state.listenersBound = true;
    }
  }

  updateSpecialSlideButtons(host, meta);
  host.hidden = false;
}

/** Stage-FAB entfernen (beim Verlassen der Stage). */
export function destroyStageSpecialSlideNav() {
  teardown(document.getElementById("stage-special-slide-nav"));
}

function teardown(host) {
  if (host) {
    host.hidden = true;
    host.replaceChildren();
  }
  state.host = null;
  state.ctx = null;
}

function onHostClick(ev) {
  handleSpecialSlideButtonClick(ev, state.ctx, state.host);
}
