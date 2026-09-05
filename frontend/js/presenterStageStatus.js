/**
 * Status-Badge in der Presenter-Hauptbox — zeigt aktive Sonderfolie (oben rechts).
 */

import { getCurrentSpecialSlide } from "./eventSpecialSlides.js";

/** i18n-Schlüssel pro Sonderfolien-Typ. */
const STATUS_KEYS = {
  countdown: "programControl.statusCountdown",
  pause: "programControl.statusPause",
  end: "programControl.statusEnd",
};

/**
 * Status-Anzeige synchronisieren.
 * @param {object | null | undefined} session
 * @param {(key: string) => string} t
 */
export function syncPresenterStageStatus(session, t) {
  const el = document.getElementById("present-stage-status");
  if (!el) return;

  const kind = getCurrentSpecialSlide(session);
  if (!kind) {
    el.hidden = true;
    el.textContent = "";
    delete el.dataset.statusKind;
    return;
  }

  const key = STATUS_KEYS[kind];
  el.textContent = key && t ? t(key) : kind;
  el.dataset.statusKind = kind;
  el.hidden = false;
}
