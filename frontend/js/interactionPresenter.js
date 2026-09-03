/**
 * Presenter — Interaktionssteuerung (Start, Pause, Verlängern, Ende).
 * Sendet WS-Typ „interaction“; Server ist autoritativ.
 */

import { t } from "./i18n.js?v=nav55";

/** Beschriftung für Start-Button je Folientyp. */
const START_LABEL_KEYS = {
  choice: "interaction.start.poll",
  rating_scale: "interaction.start.rating",
  ranking: "interaction.start.ranking",
  points100: "interaction.start.points",
  open_text: "interaction.start.open",
  image_choice: "interaction.start.image",
  datetime: "interaction.start.datetime",
  picker: "interaction.start.picker",
  wordcloud: "interaction.start.wordcloud",
  qa: "interaction.start.qa",
  quiz: "interaction.start.quiz",
};

export function isInteractionControlled(slide) {
  if (!slide?.interaction) return false;
  return slide.interaction.manualStart !== false;
}

export function effectiveInteractionState(slide) {
  if (!slide?.interaction) return "running";
  return slide.interaction.state || "running";
}

export function inputsOpen(slide) {
  return effectiveInteractionState(slide) === "running";
}

/**
 * @param {{ bar: HTMLElement, emitLive: Function, getSlide: Function }} opts
 */
export function bindInteractionBar(opts) {
  const { bar, emitLive, getSlide } = opts;
  if (!bar || bar.dataset.bound === "1") return { render: () => {} };
  bar.dataset.bound = "1";

  bar.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-ix-action]");
    if (!btn) return;
    const slide = getSlide();
    if (!slide?.id) return;
    const action = btn.getAttribute("data-ix-action");
    if (action === "start" && slide.type === "quiz") {
      emitLive("quiz_start", { slideId: slide.id, duration: slide.duration });
      return;
    }
    if (action === "extend") {
      emitLive("interaction", {
        slideId: slide.id,
        action: "extend",
        seconds: Number(btn.getAttribute("data-seconds")) || 30,
      });
      return;
    }
    if (action === "end") {
      const count = Number(slide.voteCount || 0);
      if (count > 0 && !window.confirm(t("interaction.endConfirm"))) return;
    }
    emitLive("interaction", { slideId: slide.id, action });
  });

  function render() {
    const slide = getSlide();
    if (!slide || !isInteractionControlled(slide)) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const state = effectiveInteractionState(slide);
    const rem = computeRemainingMs(slide);
    const timerOn = Boolean(slide.interaction.timerEnabled);
    const sec = Math.ceil(rem / 1000);
    const timeLabel =
      timerOn && (state === "running" || state === "paused")
        ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
        : "";

    let html = `<div class="present-interaction-bar__status" role="status" aria-live="polite">`;
    html += `<span class="present-interaction-bar__badge present-interaction-bar__badge--${state}">${t(`interaction.state.${state}`)}</span>`;
    if (timeLabel) html += `<span class="present-interaction-bar__timer" aria-label="${t("interaction.timerLabel")}">${timeLabel}</span>`;
    html += `</div><div class="present-interaction-bar__actions">`;

    const startKey = START_LABEL_KEYS[slide.type] || "interaction.start.default";
    if (state === "active") {
      html += `<button type="button" class="btn primary pulse-btn-primary" data-ix-action="start">${t(startKey)}</button>`;
    } else if (state === "running") {
      html += `<button type="button" class="btn ghost" data-ix-action="pause">${t("interaction.pause")}</button>`;
      html += `<button type="button" class="btn ghost" data-ix-action="extend" data-seconds="30">+30s</button>`;
      html += `<button type="button" class="btn ghost" data-ix-action="extend" data-seconds="60">+60s</button>`;
      html += `<button type="button" class="btn danger" data-ix-action="end">${t("interaction.end")}</button>`;
    } else if (state === "paused") {
      html += `<button type="button" class="btn primary pulse-btn-primary" data-ix-action="resume">${t("interaction.resume")}</button>`;
      html += `<button type="button" class="btn danger" data-ix-action="end">${t("interaction.end")}</button>`;
    } else if (state === "ended") {
      html += `<button type="button" class="btn ghost" data-ix-action="reset">${t("interaction.reopen")}</button>`;
    }
    html += `</div>`;
    bar.innerHTML = html;
  }

  return { render };
}

export function joinInputsBlocked(slide) {
  if (!slide?.interaction) return false;
  if (slide.interaction.manualStart === false) return false;
  return effectiveInteractionState(slide) !== "running";
}

export function joinStatusMessage(slide) {
  if (!slide?.interaction || !joinInputsBlocked(slide)) return "";
  const state = effectiveInteractionState(slide);
  if (state === "active") return t("interaction.join.waiting");
  if (state === "paused") return t("interaction.join.paused");
  if (state === "ended") {
    return slide.interaction.endReason === "timeout"
      ? t("interaction.join.timeout")
      : t("interaction.join.ended");
  }
  return "";
}

/** Restzeit clientseitig aus endsAt oder Snapshot berechnen. */
export function computeRemainingMs(slide, now = Date.now()) {
  const ix = slide?.interaction;
  if (!ix) return 0;
  const state = effectiveInteractionState(slide);
  if (state === "paused") {
    return Math.max(0, Number(ix.pausedRemainingMs ?? ix.remainingMs) || 0);
  }
  if (state === "running" && ix.endsAt) {
    return Math.max(0, Number(ix.endsAt) - now);
  }
  return Math.max(0, Number(ix.remainingMs) || 0);
}

/** mm:ss für Countdown-Anzeige. */
export function formatCountdown(totalSec) {
  const sec = Math.max(0, Math.ceil(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Stage-Hinweis zur Interaktionsphase (nur Lesen). */
export function stageStatusMessage(slide) {
  if (!slide?.interaction || slide.interaction.manualStart === false) return "";
  const state = effectiveInteractionState(slide);
  if (state === "active") return t("interaction.stage.waiting");
  if (state === "paused") return t("interaction.stage.paused");
  if (state === "ended") {
    return slide.interaction.endReason === "timeout"
      ? t("interaction.stage.timeout")
      : t("interaction.stage.ended");
  }
  if (state === "running") {
    if (slide.interaction.timerEnabled) {
      const rem = computeRemainingMs(slide);
      return t("interaction.stage.timer", { time: formatCountdown(rem / 1000) });
    }
    return t("interaction.stage.collecting");
  }
  return "";
}
