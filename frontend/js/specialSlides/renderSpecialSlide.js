/**
 * Gemeinsamer Renderer für Stage und Presenter-Hauptbox (Pause, Ende, Countdown).
 */

import { mountSpecialSlide } from "../eventSpecialSlides.js";
import { mountCountdown } from "../eventCountdown.js";

const COUNTDOWN_CTL = Symbol("previewCountdownCtl");

/**
 * Sonderfolie in Host rendern.
 * @param {HTMLElement} host
 * @param {'countdown'|'pause'|'end'} kind
 * @param {object} meta eventMeta
 * @param {object} [opts]
 * @returns {object | null}
 */
export function renderSpecialSlideInto(host, kind, meta, opts = {}) {
  if (!host || !meta) return null;
  stopSpecialSlideCountdown(host);

  if (kind === "countdown") {
    if (!meta.startTime) {
      host.replaceChildren();
      return null;
    }
    host.classList.add("event-countdown-host");
    const ctl = mountCountdown(host, meta, {
      variant: opts.variant || "stage",
      getMeta: opts.getMeta || (() => meta),
      getSkew: opts.getSkew || (() => 0),
      showSkip: false,
      showStart: false,
      showQr: opts.showQr ?? Boolean(meta.showStageQr),
      joinUrl: opts.joinUrl || "",
      locale: opts.locale,
      t: opts.t,
      onQrCanvas: opts.onQrCanvas,
      syncEveryMs: opts.syncEveryMs ?? 1000,
    });
    host[COUNTDOWN_CTL] = ctl;
    return ctl;
  }

  host.classList.remove("event-countdown-host");
  return mountSpecialSlide(host, kind, meta, opts);
}

/**
 * Countdown-Ticker in Vorschau/Host stoppen.
 * @param {HTMLElement} host
 */
export function stopSpecialSlideCountdown(host) {
  host?.[COUNTDOWN_CTL]?.stop?.();
  if (host) host[COUNTDOWN_CTL] = null;
}

export { mountSpecialSlide } from "../eventSpecialSlides.js";
