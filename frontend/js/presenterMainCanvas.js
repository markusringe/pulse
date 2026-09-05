/**
 * Presenter-Hauptbox (#present-slide-canvas): aktive Sonderfolie live wie auf der Stage.
 * Kein Hover-Overlay — Countdown, Pause und Ende ersetzen die normale Folienfläche.
 */

import { isCountdownSpecialActive, activeSpecialSlideKind } from "./eventSpecialSlides.js";
import { shouldShowCountdown } from "./eventCountdown.js";
import { renderSpecialSlideInto, stopSpecialSlideCountdown } from "./specialSlides/renderSpecialSlide.js";
import { currentLang } from "./i18n.js";
import { joinUrlFromLocation, drawQrCode } from "./qrRender.js";

/** Zuletzt gemountete Sonderfolie — verhindert unnötiges Remount bei gleichem Modus. */
let mountedKind = null;

/**
 * Aktiven Sonderfolien-Modus für die Presenter-Hauptbox ermitteln.
 * @param {object | null | undefined} session
 * @param {number} clockSkew
 * @param {boolean} countdownSkipped
 * @returns {'countdown'|'pause'|'end'|null}
 */
export function resolvePresenterSpecialKind(session, clockSkew = 0, countdownSkipped = false) {
  if (!session?.eventMeta) return null;
  if (isCountdownSpecialActive(session)) return "countdown";
  if (shouldShowCountdown(session.eventMeta, clockSkew, { skipped: countdownSkipped })) {
    return "countdown";
  }
  return activeSpecialSlideKind(session);
}

/**
 * Sonderfolie in der Haupt-Präsentationsbox synchronisieren (Darstellung wie Stage).
 * @param {HTMLElement | null} host Element mit data-slide-canvas
 * @param {object | null | undefined} session
 * @param {{ t?: (key: string, vars?: object) => string, clockSkew?: number, countdownSkipped?: boolean }} [opts]
 * @returns {'countdown'|'pause'|'end'|null}
 */
export function syncPresenterMainCanvas(host, session, opts = {}) {
  const kind = resolvePresenterSpecialKind(
    session,
    opts.clockSkew ?? 0,
    opts.countdownSkipped ?? false
  );

  if (!host) return null;

  if (!kind) {
    if (mountedKind) {
      stopSpecialSlideCountdown(host);
      host.replaceChildren();
      host.classList.remove("event-countdown-host");
      host.hidden = true;
      mountedKind = null;
    }
    return null;
  }

  const meta = session.eventMeta;
  const stageRoot = document.getElementById("present-stage");
  if (stageRoot && meta) {
    stageRoot.dataset.countdownStyle = meta.countdownStyle || "modern";
  }

  host.hidden = false;

  const locale = currentLang() === "en" ? "en-GB" : "de-DE";
  const joinUrl = joinUrlFromLocation(session.code || session.joinCode || "");

  /* Countdown: einmal mounten — Sekunden-Tick läuft in mountCountdown ohne Shell-Rebuild. */
  if (kind === "countdown" && mountedKind === "countdown" && host.querySelector(".event-countdown-panel")) {
    return kind;
  }

  /* Pause/Ende: mountSpecialSlide cached intern — nur bei fehlendem DOM neu rendern. */
  if (kind !== "countdown" && kind === mountedKind && host.querySelector(".ess")) {
    return kind;
  }

  if (kind !== mountedKind) {
    stopSpecialSlideCountdown(host);
  }

  renderSpecialSlideInto(host, kind, meta, {
    variant: "stage",
    t: opts.t,
    locale,
    getMeta: () => session?.eventMeta || {},
    getSkew: () => opts.clockSkew ?? 0,
    joinUrl,
    onQrCanvas: drawQrCode,
    showQr: Boolean(meta.showStageQr),
    syncEveryMs: 1000,
  });

  mountedKind = kind;
  return kind;
}

/** Teardown beim Verlassen der Presenter-Ansicht oder Session-Wechsel. */
export function destroyPresenterMainCanvas() {
  const host = document.getElementById("present-slide-canvas");
  if (!host) {
    mountedKind = null;
    return;
  }
  stopSpecialSlideCountdown(host);
  host.replaceChildren();
  host.classList.remove("event-countdown-host");
  host.hidden = true;
  mountedKind = null;
}
