/**
 * Presenter-Leiste: Live-Statistik, Folien-Timer, Notizen.
 *
 * Daten nur aus Session-/WS-Zustand — keine Schätzwerte.
 * Notizen und geplante Anzeigedauer (Sekunden, Feld plannedMinutes) bleiben lokal beim Präsentator
 * (Server-PATCH ohne Broadcast an Join-Clients).
 */

import { connectionLabel } from "./errors.js";

const NOTES_MAX = 4000;

/** @type {ReturnType<typeof createTimer> | null} */
let timer = null;
/** @type {HTMLElement | null} */
let root = null;
/** @type {{ t: Function, onNotes: Function, onPlanned: Function } | null} */
let hooks = null;
/** @type {{ session: object, t: Function, lobby?: boolean } | null} */
let lastState = null;
let notesTimer = 0;
let collapsed = false;

/**
 * Offene Moderations-Schlange (nur status === "pending").
 * @param {object} slide
 * @returns {number}
 */
export function pendingQuestionCount(slide) {
  if (!slide || slide.type !== "qa" || !Array.isArray(slide.questions)) return 0;
  return slide.questions.filter((q) => q.status === "pending").length;
}

/**
 * Anteil abgestimmt. 0 Teilnehmer → null (UI zeigt 0 % oder „—“).
 * @param {number} votes
 * @param {number} participants
 * @returns {number|null}
 */
export function votedSharePct(votes, participants) {
  const n = Number(participants) || 0;
  if (n <= 0) return null;
  const v = Math.max(0, Number(votes) || 0);
  return Math.min(100, Math.round((v / n) * 100));
}

/**
 * Stimmenzahl aus vorhandenem Folienzustand (counts, entries, voteCount, Quiz-Antworten).
 * @param {object} slide
 * @returns {number}
 */
export function slideVoteCount(slide) {
  if (!slide) return 0;
  if (slide.voteCount != null) return Number(slide.voteCount) || 0;
  if (slide.counts) {
    return Object.values(slide.counts).reduce((sum, n) => sum + Number(n || 0), 0);
  }
  if (slide.entries) {
    return slide.entries.reduce((sum, e) => sum + Number(e.count || 0), 0);
  }
  if (slide.round?.answers) return Object.keys(slide.round.answers).length;
  return 0;
}

export function hasVoteShare(slide) {
  const type = slide?.type;
  return (
    type === "choice" ||
    type === "rating_scale" ||
    type === "wordcloud" ||
    type === "quiz" ||
    type === "ranking" ||
    type === "points100" ||
    type === "open_text" ||
    type === "image_choice" ||
    type === "datetime"
  );
}

/**
 * Notizen und Zeitplan aus einem Join-Payload entfernen (Verteidigung).
 * @param {object} session
 */
export function stripPresenterSecrets(session) {
  if (!session?.slides) return session;
  for (const s of session.slides) {
    delete s.notes;
    delete s.plannedMinutes;
    /* Lösungen erst nach Rundenende — analog publicQuizSlide. */
    if (s.type === "quiz" && s.round?.status !== "ended") {
      delete s.correctIndex;
      delete s.correctIndexes;
    }
  }
  return session;
}

/**
 * Panel einmal ins Dock hängen.
 * @param {HTMLElement} host
 * @param {{ t: Function, onNotes: Function, onPlanned: Function }} opts
 */
export function mountPresenterStats(host, opts) {
  if (!host) return;
  root = host;
  hooks = opts;
  if (!timer) timer = createTimer(() => lastState && refreshPresenterStats(lastState));
  host.hidden = false;
  if (!host.dataset.ready) {
    host.dataset.ready = "1";
    host.classList.add("presenter-stats");
    host.innerHTML = `
      <header class="presenter-stats-head">
        <button type="button" class="btn ghost presenter-stats-toggle" id="presenter-stats-toggle" aria-expanded="true"></button>
      </header>
      <div class="presenter-stats-body" id="presenter-stats-body">
        <p class="stat-line" id="stat-participants"></p>
        <p class="stat-line" id="stat-share"></p>
        <p class="stat-line stat-qa" id="stat-qa" hidden></p>
        <p class="stat-line" id="stat-time"></p>
        <label class="field stat-notes">
          <span id="stat-notes-label"></span>
          <textarea id="stat-notes" maxlength="${NOTES_MAX}" rows="3"></textarea>
        </label>
      </div>`;
    host.querySelector("#presenter-stats-toggle")?.addEventListener("click", () => {
      collapsed = !collapsed;
      syncCollapsed();
    });
    document.addEventListener("visibilitychange", () => {
      if (lastState) refreshPresenterStats(lastState);
    });
    const ta = host.querySelector("#stat-notes");
    ta?.addEventListener("input", () => {
      window.clearTimeout(notesTimer);
      notesTimer = window.setTimeout(() => {
        hooks?.onNotes?.(ta.value);
      }, 500);
    });
  }
  syncCollapsed();
}

function syncCollapsed() {
  if (!root) return;
  const body = root.querySelector("#presenter-stats-body");
  const btn = root.querySelector("#presenter-stats-toggle");
  if (body) body.hidden = collapsed;
  if (btn) btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

/**
 * Statistik, Timer und Notizen aus der aktuellen Session zeichnen.
 * @param {{ session: object, t: Function, lobby?: boolean }} state
 */
export function refreshPresenterStats(state) {
  const { session, t } = state || {};
  if (!root || !session) return;
  lastState = state;
  const slide = session.slides?.[session.activeSlideIndex || 0];
  const lobby = Boolean(state.lobby ?? session.lobby);
  const participants = Number(session.participantCount) || 0;

  timer?.show(slide?.id, { paused: lobby || document.hidden });

  const toggle = root.querySelector("#presenter-stats-toggle");
  if (toggle) toggle.textContent = t("present.statsToggle");

  const pEl = root.querySelector("#stat-participants");
  if (pEl) pEl.textContent = t("present.statsParticipants", { n: participants });

  const shareEl = root.querySelector("#stat-share");
  if (shareEl) shareEl.textContent = shareLabel(slide, participants, t);

  const qaEl = root.querySelector("#stat-qa");
  const pending = pendingQuestionCount(slide);
  if (qaEl) {
    const show = slide?.type === "qa" && pending > 0;
    qaEl.hidden = !show;
    if (show) qaEl.textContent = t("present.qaNew", { n: pending });
  }

  const timeEl = root.querySelector("#stat-time");
  if (timeEl) {
    const y = timer ? timer.elapsedSeconds(slide?.id) : 0;
    const planned = slide?.plannedMinutes;
    if (planned == null) timeEl.textContent = t("present.plannedEmpty", { y });
    else timeEl.textContent = t("present.planned", { x: planned, y });
  }

  const label = root.querySelector("#stat-notes-label");
  if (label) label.textContent = t("present.notes");
  const ta = root.querySelector("#stat-notes");
  if (ta && document.activeElement !== ta) {
    const next = typeof slide?.notes === "string" ? slide.notes : "";
    if (ta.value !== next) ta.value = next;
    ta.placeholder = t("present.notesPlaceholder");
  }
}

/**
 * Probe-Banner und Join-Link-Hinweis.
 * @param {HTMLElement} banner
 * @param {object} session
 * @param {Function} t
 * @param {{ joinBlock?: HTMLElement, copyBtn?: HTMLButtonElement }} extras
 */
export function syncRehearsalUi(banner, session, t, extras = {}) {
  const on = Boolean(session?.rehearsal);
  if (banner) {
    banner.hidden = !on;
    banner.textContent = on ? t("present.rehearsalBanner") : "";
  }
  if (extras.joinBlock) extras.joinBlock.classList.toggle("is-rehearsal", on);
  if (extras.copyBtn) {
    extras.copyBtn.disabled = on;
    extras.copyBtn.title = on ? t("present.joinDisabled") : "";
  }
}

/**
 * Verbindungs-Banner (Presenter und Join). Kein Mock, keine nackten WS-Fehler.
 * @param {HTMLElement} el
 * @param {{ state: string, mock?: boolean, t?: Function }} info
 */
export function syncOfflineBanner(el, info) {
  if (!el) return;
  const { state, mock } = info || {};
  const show = !mock && (state === "closed" || state === "reconnecting");
  el.hidden = !show;
  if (!show) {
    el.textContent = "";
    return;
  }
  const t = info.t;
  const title = t ? t("conn.offline") : "Keine Verbindung";
  const long = connectionLabel(state, false).long;
  el.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(long)}</span>`;
}

export function destroyPresenterStats() {
  timer?.stop();
  window.clearTimeout(notesTimer);
}

function shareLabel(slide, participants, t) {
  if (slide?.type === "qa") {
    return t("present.qaWaiting", { n: pendingQuestionCount(slide) });
  }
  if (!hasVoteShare(slide)) return t("present.votedNone");
  const pct = votedSharePct(slideVoteCount(slide), participants);
  if (pct == null) return t("present.votedZero");
  return t("present.votedShare", { pct });
}

function createTimer(onTick) {
  const elapsedMs = new Map();
  let currentId = null;
  let sliceStart = 0;
  let paused = true;
  let interval = 0;

  function flush() {
    if (!paused && currentId && sliceStart) {
      const prev = elapsedMs.get(currentId) || 0;
      elapsedMs.set(currentId, prev + (Date.now() - sliceStart));
      sliceStart = Date.now();
    }
  }

  function tick() {
    if (paused) return;
    onTick?.();
  }

  return {
    show(id, { paused: nextPaused } = {}) {
      flush();
      if (id && id !== currentId) {
        currentId = id;
        if (!elapsedMs.has(id)) elapsedMs.set(id, 0);
      }
      paused = Boolean(nextPaused) || !id;
      sliceStart = paused ? 0 : Date.now();
      if (!interval) interval = window.setInterval(tick, 1000);
    },
    elapsedSeconds(id) {
      let ms = elapsedMs.get(id) || 0;
      if (!paused && currentId === id && sliceStart) ms += Date.now() - sliceStart;
      return Math.max(0, Math.floor(ms / 1000));
    },
    stop() {
      flush();
      window.clearInterval(interval);
      interval = 0;
    },
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
