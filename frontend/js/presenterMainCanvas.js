/**
 * Presenter-Hauptbox (#present-slide-canvas): aktive Sonderfolie live wie auf der Stage.
 * Kein Hover-Overlay — Countdown, Pause und Ende ersetzen die normale Folienfläche.
 */

import { isCountdownSpecialActive, activeSpecialSlideKind } from "./eventSpecialSlides.js";
import { renderSpecialSlideInto, stopSpecialSlideCountdown } from "./specialSlides/renderSpecialSlide.js";
import { currentLang } from "./i18n.js";
import { joinUrlFromLocation, drawQrCode } from "./qrRender.js";

/** Zuletzt gemountete Sonderfolie — verhindert unnötiges Remount bei gleichem Modus. */
let mountedKind = null;

/**
 * Innere 16:9-Leinwand sicherstellen (wird nie durch replaceChildren entfernt).
 * @param {HTMLElement | null} host #present-slide-canvas
 * @returns {HTMLElement | null}
 */
function ensurePresenterCanvasFit(host) {
  if (!host) return null;
  let fit = host.querySelector("[data-present-canvas-fit]");
  if (!fit) {
    fit = document.createElement("div");
    fit.id = "present-slide-canvas-fit";
    fit.className = "present-slide-canvas-fit";
    fit.dataset.presentCanvasFit = "";
    host.appendChild(fit);
  }
  return fit;
}

/**
 * Aktiven Sonderfolien-Modus für die Presenter-Hauptbox ermitteln.
 * Nur explizit gesetzte Sonderfolie (eventMeta.currentSpecialSlide) — kein Auto-Countdown
 * nur wegen zukünftiger Startzeit (das bleibt der Stage vorbehalten).
 * @param {object | null | undefined} session
 * @returns {'countdown'|'pause'|'end'|null}
 */
export function resolvePresenterSpecialKind(session) {
  if (!session?.eventMeta) return null;
  if (isCountdownSpecialActive(session)) return "countdown";
  return activeSpecialSlideKind(session);
}

/** Sonderfolien-Inhalt in der Fit-Leinwand leeren (Wrapper bleibt erhalten). */
function clearPresenterCanvasContent(fit) {
  if (!fit) return;
  stopSpecialSlideCountdown(fit);
  fit.replaceChildren();
  fit.classList.remove("event-countdown-host");
}

/**
 * Sonderfolie in der Haupt-Präsentationsbox synchronisieren (Darstellung wie Stage).
 * @param {HTMLElement | null} host Element mit data-slide-canvas
 * @param {object | null | undefined} session
 * @param {{ t?: (key: string, vars?: object) => string, clockSkew?: number, countdownSkipped?: boolean }} [opts]
 * @returns {'countdown'|'pause'|'end'|null}
 */
export function syncPresenterMainCanvas(host, session, opts = {}) {
  const kind = resolvePresenterSpecialKind(session);

  if (!host) return null;
  const fit = ensurePresenterCanvasFit(host);

  if (!kind) {
    if (mountedKind || !host.hidden || fit.querySelector(".ess, .event-countdown-panel")) {
      clearPresenterCanvasContent(fit);
    }
    host.hidden = true;
    mountedKind = null;
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
  if (kind === "countdown" && mountedKind === "countdown" && fit.querySelector(".event-countdown-panel")) {
    return kind;
  }

  if (kind !== mountedKind) {
    clearPresenterCanvasContent(fit);
  }

  const rendered = renderSpecialSlideInto(fit, kind, meta, {
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

  if (!rendered && kind !== "countdown") {
    clearPresenterCanvasContent(fit);
    host.hidden = true;
    mountedKind = null;
    return null;
  }

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
  const fit = ensurePresenterCanvasFit(host);
  clearPresenterCanvasContent(fit);
  host.hidden = true;
  mountedKind = null;
}
