/**
 * Folien-Interaktionsstatus — serverseitig autoritativ.
 */

/** Folientypen mit Teilnehmer-Eingabe. */
const INTERACTIVE_TYPES = new Set([
  "choice",
  "wordcloud",
  "qa",
  "quiz",
  "rating_scale",
  "ranking",
  "points100",
  "open_text",
  "image_choice",
  "datetime",
  "picker",
]);

const STATES = new Set(["active", "running", "paused", "ended"]);

const TIMER_PRESETS = [30, 60, 90, 120, 180, 300];
const TIMER_MIN = 30;
const TIMER_MAX = 300;

/**
 * Standard-Interaktionskonfiguration für neue Folien.
 * @param {unknown} raw
 * @returns {object}
 */
function empty(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const timerSec = clampTimerSec(src.timerSec != null ? src.timerSec : src.limitSec);
  const state = STATES.has(String(src.state)) ? String(src.state) : "active";
  return {
    state,
    manualStart: src.manualStart !== false,
    timerEnabled: Boolean(src.timerEnabled),
    timerSec: timerSec || 60,
    startedAt: toTs(src.startedAt),
    endsAt: toTs(src.endsAt),
    pausedAt: toTs(src.pausedAt),
    pausedRemainingMs: toMs(src.pausedRemainingMs),
    endedAt: toTs(src.endedAt),
    endReason: String(src.endReason || "").slice(0, 40) || null,
    seq: Number(src.seq) || 0,
  };
}

function toTs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toMs(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function clampTimerSec(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(TIMER_MIN, Math.min(TIMER_MAX, Math.round(n)));
}

function isInteractiveType(type) {
  return INTERACTIVE_TYPES.has(type);
}

/**
 * Interaktionsobjekt an Folie — neu oder aus Persistenz.
 * @param {object} slide
 * @param {{ legacy?: boolean }} [opts] legacy=true für alte Sessions ohne interaction-Feld
 */
function ensureInteraction(slide, opts = {}) {
  if (!slide || !isInteractiveType(slide.type)) return slide;
  if (slide.interaction && typeof slide.interaction === "object") {
    slide.interaction = empty(slide.interaction);
    return slide;
  }
  if (opts.legacy) {
    slide.interaction = empty({ state: "running", manualStart: false });
  } else {
    slide.interaction = empty({ manualStart: true, state: "active" });
  }
  return slide;
}

/** Bestehendes interaction-Objekt säubern (ohne Legacy-Erkennung). */
function normalizeSlide(slide) {
  if (!slide || !isInteractiveType(slide.type)) return slide;
  if (slide.interaction && typeof slide.interaction === "object") {
    slide.interaction = empty(slide.interaction);
  }
  return slide;
}

/**
 * Effektiver Status inkl. abgelaufener Timer (ohne Mutation).
 * @param {object} slide
 * @param {number} [now]
 */
function effectiveState(slide, now = Date.now()) {
  if (!slide || !isInteractiveType(slide.type)) return "running";
  if (!slide.interaction) return "running";
  normalizeSlide(slide);
  const ix = slide.interaction;

  if (slide.type === "quiz") {
    const rs = slide.round?.status || "idle";
    if (rs === "running") return "running";
    if (rs === "ended") return "ended";
    if (ix.state === "ended") return "ended";
    return ix.state === "running" ? "active" : ix.state;
  }

  if (ix.state === "running" && ix.endsAt != null && ix.endsAt <= now) {
    return "ended";
  }
  if (ix.state === "paused") return "paused";
  if (ix.state === "ended") return "ended";
  if (ix.state === "active") return "active";
  return ix.state === "running" ? "running" : "active";
}

/**
 * Darf der Client jetzt eine Eingabe senden?
 * @param {object} session
 * @param {object} slide
 * @param {number} [now]
 * @returns {{ ok: boolean, error?: string, message?: string }}
 */
function canAcceptInput(session, slide, now = Date.now()) {
  if (!slide) return { ok: false, error: "no_slide", message: "Keine Folie" };
  if (session.lobby) {
    return { ok: false, error: "lobby", message: "Warten auf den Start" };
  }
  if (session.paused) {
    return { ok: false, error: "paused", message: "Session pausiert" };
  }
  if (!isInteractiveType(slide.type)) {
    return { ok: false, error: "not_interactive", message: "Keine Interaktionsfolie" };
  }

  const state = effectiveState(slide, now);
  const active = session.slides[session.activeSlideIndex];
  if (!active || active.id !== slide.id) {
    return { ok: false, error: "wrong_slide", message: "Diese Folie ist gerade nicht aktiv" };
  }

  if (slide.type === "quiz") {
    if (slide.round?.status !== "running") {
      return {
        ok: false,
        error: "interaction_not_started",
        message: "Das Quiz wurde noch nicht gestartet",
      };
    }
    return { ok: true };
  }

  if (state === "active") {
    return {
      ok: false,
      error: "interaction_not_started",
      message: "Die Abstimmung wurde noch nicht gestartet",
    };
  }
  if (state === "paused") {
    return { ok: false, error: "interaction_paused", message: "Die Abstimmung ist pausiert" };
  }
  if (state === "ended") {
    const msg =
      slide.interaction?.endReason === "timeout"
        ? "Die Zeit ist abgelaufen"
        : "Die Abstimmung ist beendet";
    return { ok: false, error: "interaction_ended", message: msg };
  }
  return { ok: true };
}

/**
 * Restzeit in ms (0 wenn kein Timer oder beendet).
 * @param {object} slide
 * @param {number} [now]
 */
function remainingMs(slide, now = Date.now()) {
  if (!slide?.interaction) return 0;
  const ix = slide.interaction;
  if (effectiveState(slide, now) === "paused") {
    return Math.max(0, ix.pausedRemainingMs || 0);
  }
  if (ix.endsAt != null && effectiveState(slide, now) === "running") {
    return Math.max(0, ix.endsAt - now);
  }
  return 0;
}

/**
 * Öffentlicher Snapshot für Clients (ohne interne Metadaten).
 * @param {object} slide
 * @param {number} [now]
 */
function publicSnapshot(slide, now = Date.now()) {
  if (!slide || !isInteractiveType(slide.type) || !slide.interaction) {
    return { state: "running", manualStart: false, timerEnabled: false, remainingMs: 0 };
  }
  normalizeSlide(slide);
  const state = effectiveState(slide, now);
  const ix = slide.interaction;
  return {
    state,
    manualStart: Boolean(ix.manualStart),
    timerEnabled: Boolean(ix.timerEnabled),
    timerSec: ix.timerSec,
    startedAt: ix.startedAt,
    endsAt: ix.endsAt,
    endedAt: ix.endedAt,
    endReason: ix.endReason,
    remainingMs: remainingMs(slide, now),
    seq: ix.seq,
  };
}

/**
 * Folie wurde aktiviert — vorherige Folie finalisieren, neue auf active setzen.
 * @param {object} session
 * @param {object} slide
 * @param {object} [prevSlide]
 */
function onSlideActivated(session, slide, prevSlide) {
  if (prevSlide && prevSlide.id !== slide?.id && isInteractiveType(prevSlide.type)) {
    finalizeSlide(prevSlide, "slide_change");
  }
  if (!slide || !isInteractiveType(slide.type)) return;
  normalizeSlide(slide);
  if (slide.interaction.manualStart && slide.type !== "quiz") {
    slide.interaction.state = "active";
    slide.interaction.startedAt = null;
    slide.interaction.endsAt = null;
    slide.interaction.pausedAt = null;
    slide.interaction.pausedRemainingMs = null;
    slide.interaction.endedAt = null;
    slide.interaction.endReason = null;
    slide.interaction.seq += 1;
  } else if (!slide.interaction.manualStart && slide.type !== "quiz") {
    slide.interaction.state = "running";
    slide.interaction.startedAt = Date.now();
    if (slide.interaction.timerEnabled) {
      slide.interaction.endsAt = Date.now() + slide.interaction.timerSec * 1000;
    }
    slide.interaction.seq += 1;
  }
  if (slide.type === "quiz" && slide.round?.status === "idle") {
    slide.interaction.state = "active";
  }
}

function finalizeSlide(slide, reason) {
  if (!slide?.interaction || !isInteractiveType(slide.type)) return;
  const state = effectiveState(slide);
  if (state === "ended") return;
  slide.interaction.state = "ended";
  slide.interaction.endedAt = Date.now();
  slide.interaction.endReason = reason || "slide_change";
  slide.interaction.endsAt = null;
  slide.interaction.pausedRemainingMs = null;
  slide.interaction.seq += 1;
  if (slide.type === "quiz" && slide.round?.status === "running") {
    slide.round.status = "ended";
  }
}

/**
 * Presenter-Aktion auf der aktiven Folie.
 * @param {object} session
 * @param {object} slide
 * @param {string} action start|pause|resume|extend|end|reset|configure
 * @param {object} [payload]
 * @param {number} [now]
 * @returns {{ ok: boolean, error?: string, interaction?: object, audit?: object }}
 */
function applyAction(session, slide, action, payload = {}, now = Date.now()) {
  if (!slide || !isInteractiveType(slide.type)) {
    return { ok: false, error: "not_interactive" };
  }
  normalizeSlide(slide);
  const ix = slide.interaction;
  const active = session.slides[session.activeSlideIndex];
  if (!active || active.id !== slide.id) {
    return { ok: false, error: "not_active_slide" };
  }

  if (action === "configure") {
    if (effectiveState(slide, now) === "running") {
      return { ok: false, error: "running" };
    }
    if (payload.timerSec != null) ix.timerSec = clampTimerSec(payload.timerSec) || ix.timerSec;
    if (payload.timerEnabled != null) ix.timerEnabled = Boolean(payload.timerEnabled);
    if (payload.manualStart != null) ix.manualStart = Boolean(payload.manualStart);
    ix.seq += 1;
    return { ok: true, interaction: publicSnapshot(slide, now) };
  }

  if (action === "start") {
    if (slide.type === "quiz") {
      return { ok: false, error: "use_quiz_start", delegate: "quiz_start" };
    }
    const state = effectiveState(slide, now);
    if (state === "running") return { ok: false, error: "already_running" };
    if (state === "ended") return { ok: false, error: "already_ended" };
    ix.state = "running";
    ix.startedAt = now;
    ix.pausedAt = null;
    ix.pausedRemainingMs = null;
    ix.endedAt = null;
    ix.endReason = null;
    if (ix.timerEnabled && ix.timerSec > 0) {
      ix.endsAt = now + ix.timerSec * 1000;
    } else {
      ix.endsAt = null;
    }
    ix.seq += 1;
    return {
      ok: true,
      interaction: publicSnapshot(slide, now),
      audit: { action: "interaction_start", slideId: slide.id, timerSec: ix.timerEnabled ? ix.timerSec : 0 },
      scheduleEndAt: ix.endsAt,
    };
  }

  if (action === "pause") {
    if (effectiveState(slide, now) !== "running") return { ok: false, error: "not_running" };
    const rem = ix.endsAt != null ? Math.max(0, ix.endsAt - now) : null;
    ix.state = "paused";
    ix.pausedAt = now;
    ix.pausedRemainingMs = rem;
    ix.endsAt = null;
    ix.seq += 1;
    return {
      ok: true,
      interaction: publicSnapshot(slide, now),
      audit: { action: "interaction_pause", slideId: slide.id },
    };
  }

  if (action === "resume") {
    if (effectiveState(slide, now) !== "paused") return { ok: false, error: "not_paused" };
    ix.state = "running";
    ix.pausedAt = null;
    if (ix.timerEnabled && ix.pausedRemainingMs != null) {
      ix.endsAt = now + ix.pausedRemainingMs;
    }
    ix.pausedRemainingMs = null;
    ix.seq += 1;
    return {
      ok: true,
      interaction: publicSnapshot(slide, now),
      audit: { action: "interaction_resume", slideId: slide.id },
      scheduleEndAt: ix.endsAt,
    };
  }

  if (action === "extend") {
    const addSec = clampTimerSec(payload.seconds || payload.addSec || 30);
    if (!addSec) return { ok: false, error: "invalid_seconds" };
    const state = effectiveState(slide, now);
    if (state !== "running" && state !== "paused") return { ok: false, error: "not_extendable" };
    if (state === "paused") {
      ix.pausedRemainingMs = (ix.pausedRemainingMs || 0) + addSec * 1000;
    } else if (ix.endsAt != null) {
      ix.endsAt += addSec * 1000;
    } else {
      ix.timerEnabled = true;
      ix.endsAt = now + addSec * 1000;
    }
    ix.seq += 1;
    return {
      ok: true,
      interaction: publicSnapshot(slide, now),
      audit: { action: "interaction_extend", slideId: slide.id, addSec },
      scheduleEndAt: ix.endsAt,
    };
  }

  if (action === "end") {
    finalizeSlide(slide, payload.reason || "manual");
    return {
      ok: true,
      interaction: publicSnapshot(slide, now),
      audit: { action: "interaction_end", slideId: slide.id, reason: slide.interaction.endReason },
    };
  }

  if (action === "reset") {
    ix.state = ix.manualStart ? "active" : "running";
    ix.startedAt = ix.manualStart ? null : now;
    ix.endsAt = !ix.manualStart && ix.timerEnabled ? now + ix.timerSec * 1000 : null;
    ix.pausedAt = null;
    ix.pausedRemainingMs = null;
    ix.endedAt = null;
    ix.endReason = null;
    ix.seq += 1;
    if (slide.type === "quiz") slide.round = { status: "idle" };
    return {
      ok: true,
      interaction: publicSnapshot(slide, now),
      audit: { action: "interaction_reset", slideId: slide.id },
      scheduleEndAt: ix.endsAt,
    };
  }

  return { ok: false, error: "unknown_action" };
}

/** Timer abgelaufen — serverseitig finalisieren. */
function onTimerExpired(slide) {
  if (!slide?.interaction) return null;
  if (effectiveState(slide) !== "running") return null;
  finalizeSlide(slide, "timeout");
  return publicSnapshot(slide);
}

/** Nach Quiz-Start Interaktionsstatus synchronisieren. */
function syncQuizStarted(slide, startedAt, durationSec) {
  if (!slide) return;
  normalizeSlide(slide);
  slide.interaction.state = "running";
  slide.interaction.startedAt = startedAt;
  slide.interaction.timerEnabled = true;
  slide.interaction.timerSec = durationSec;
  slide.interaction.endsAt = startedAt + durationSec * 1000;
  slide.interaction.endedAt = null;
  slide.interaction.endReason = null;
  slide.interaction.seq += 1;
}

/** Nach Quiz-Ende. */
function syncQuizEnded(slide) {
  if (!slide) return;
  finalizeSlide(slide, "manual");
}

module.exports = {
  INTERACTIVE_TYPES,
  STATES,
  TIMER_PRESETS,
  TIMER_MIN,
  TIMER_MAX,
  empty,
  isInteractiveType,
  normalizeSlide,
  ensureInteraction,
  effectiveState,
  canAcceptInput,
  remainingMs,
  publicSnapshot,
  onSlideActivated,
  finalizeSlide,
  applyAction,
  onTimerExpired,
  syncQuizStarted,
  syncQuizEnded,
  clampTimerSec,
};
