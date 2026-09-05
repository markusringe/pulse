/**
 * Sonderfolien-Steuerung in der Presenter-Dock-Leiste:
 * Countdown, Pause, Ende — Ghost-Buttons mit Icon, Zustände via event_meta.
 */

import { getSpecialSlideConfig } from "./eventSpecialSlides.js";
import { openPresenterHelpModal } from "./presenterHelpModal.js";
import {
  buildSpecialSlideButtonsHtml,
  handleSpecialSlideButtonClick,
  updateSpecialSlideButtons,
} from "./specialSlideNavCore.js";

/** @type {{
 *   host: HTMLElement | null,
 *   ctx: object | null,
 *   listenersBound: boolean,
 *   onRefresh: (() => void) | null,
 * }} */
const state = {
  host: null,
  ctx: null,
  listenersBound: false,
  onRefresh: null,
};

/**
 * Sonderfolien-Buttons in der Dock-Leiste synchronisieren.
 * @param {HTMLElement | null} host
 * @param {{
 *   session: object,
 *   emit?: (type: string, payload: object) => void,
 * }} ctx
 */
export function syncPresenterSpecialSlideButtons(host, ctx) {
  if (!host || !ctx?.session?.eventId) {
    teardown(host);
    return;
  }

  const meta = ctx.session.eventMeta || {};
  const hasCountdown = Boolean(meta.startTime);
  const hasPause = Boolean(getSpecialSlideConfig(meta, "pause"));
  const hasEnd = Boolean(getSpecialSlideConfig(meta, "end"));
  if (!hasCountdown && !hasPause && !hasEnd) {
    teardown(host);
    return;
  }

  state.host = host;
  state.ctx = ctx;
  state.onRefresh = typeof ctx.onRefresh === "function" ? ctx.onRefresh : null;

  if (!host.querySelector(".present-special-btns")) {
    host.innerHTML = buildSpecialSlideButtonsHtml({
      hasCountdown,
      hasPause,
      hasEnd,
      includeHelp: false,
      iconOnly: true,
      groupClass: "present-special-btns present-dock-special-btns",
      btnClass: "btn ghost present-dock-special-btn",
    });
    if (!state.listenersBound) {
      host.addEventListener("click", onHostClick);
      state.listenersBound = true;
    }
  }
  updateSpecialSlideButtons(host, meta);
  host.hidden = false;
}

/** @deprecated Alias für Abwärtskompatibilität. */
export const syncPresenterProgramControl = syncPresenterSpecialSlideButtons;

export function destroyPresenterSpecialSlideButtons() {
  teardown(state.host);
}

/** @deprecated */
export const destroyPresenterProgramControl = destroyPresenterSpecialSlideButtons;

/** Re-Export für app.js event_meta-Handler. */
export { updateSpecialSlideButtons } from "./specialSlideNavCore.js";

function teardown(host) {
  if (host) {
    host.hidden = true;
    host.replaceChildren();
  }
  state.host = null;
  state.ctx = null;
  state.onRefresh = null;
}

function onHostClick(ev) {
  if (ev.target.closest("[data-pss-help]")) {
    void openPresenterHelpModal();
    return;
  }
  handleSpecialSlideButtonClick(ev, state.ctx, state.host);
  state.onRefresh?.();
}
