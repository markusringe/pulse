/**
 * Präsentationsansicht (Screen-Sharing): reine Leseansicht.
 *
 * Hash #/stage/:code und Alias #/present-view/:code.
 * Eigene WebSocket-Verbindung mit Rolle `stage` — nur join/ping, keine Stimmen, keine Steuerung.
 * Kein LocalStorage. Ergebnisse folgen `resultsVisible` (Teaser ohne Balken).
 * Notizen kommen serverseitig nicht an (revealNotes: false).
 */

import { RealtimeClient, api } from "./websocket.js";
import { t, currentLang } from "./i18n.js";
import { initPoll, updatePollResults, destroyPoll, initRatingScale, updateRatingResults } from "./poll.js";
import { renderTypedResults } from "./slideResults.js";
import { connectionLabel } from "./errors.js";
import { normalizeSessionSlides, acceptIncoming, acceptStructural, applyIncoming, applySlidePayload } from "./sessionSync.js";
import { mountCountdown, shouldShowCountdown } from "./eventCountdown.js";
import { activeSpecialSlideKind, mountSpecialSlide, isCountdownSpecialActive, getCurrentSpecialSlide } from "./eventSpecialSlides.js";
import { drawQrCode, joinUrlFromLocation } from "./qrRender.js";
import { stageStatusMessage } from "./interactionPresenter.js";
import { syncHelpFabVisibility } from "./help.js";

/** @type {RealtimeClient | null} */
let rt = null;
/** @type {object | null} */
let session = null;
/** @type {object | null} */
let branding = null;
let lastSlideKey = "";
let clockRaf = 0;
let clockSkew = 0;
/** Client-ID nur im Speicher — Stage speichert nichts lokal. */
const stageClientId = `stage-${Math.random().toString(36).slice(2, 10)}`;
/** @type {{ stop: () => void } | null} */
let eventCountdownCtl = null;
let countdownSkipped = false;

/**
 * Stage-View starten. Wird von app.js beim Hash #/stage/:code aufgerufen.
 * @param {string} code
 */
export async function enterStage(code) {
  leaveStage();
  syncHelpFabVisibility();
  const root = document.getElementById("view-stage");
  if (!root || !code) return;
  countdownSkipped = false;
  /* Screen-Sharing-Modus: größere Typo, weniger Animation (URL ?share=1). */
  const share = new URLSearchParams(location.search).get("share") === "1";
  root.dataset.stageMode = share ? "share" : "";
  branding = (await api.getBranding())?.branding || {};
  applyChrome(branding);
  bindFullscreen();
  ensureCountdownHost();
  const remote = await api.getSession(code);
  if (remote?.session) {
    session = remote.session;
    if (remote.session.serverNow) clockSkew = remote.session.serverNow - Date.now();
    renderStage();
  }
  connectStage(code);
}

/** Stage abbauen: WS schließen, Canvas/Polls zerstören. */
export function leaveStage() {
  cancelAnimationFrame(clockRaf);
  clockRaf = 0;
  stopEventCountdown();
  rt?.disconnect();
  rt = null;
  session = null;
  lastSlideKey = "";
  countdownSkipped = false;
  destroyPoll();
  destroyStageCloud();
  document.getElementById("stage-clock")?.remove();
  const frame = document.getElementById("stage-frame");
  if (frame) frame.innerHTML = "";
}

function connectStage(code) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws`;
  /* Kein Mock: eine Leinwand soll keine Demo-Daten zeigen, wenn der Server weg ist. */
  rt = new RealtimeClient(url, { mockWhenOffline: false });

  rt.on("connection", ({ state, mock, label, description }) => {
    const banner = document.getElementById("stage-conn");
    if (!banner) return;
    const offline = state !== "open";
    banner.hidden = !offline;
    banner.textContent = offline
      ? t("stage.reconnect")
      : label || connectionLabel(state, mock).short;
    if (description) banner.setAttribute("aria-label", description);
  });

  rt.on("session", (payload) => {
    session = payload.session || payload;
    normalizeSessionSlides(session);
    if (session.stateVersion == null) session.stateVersion = 0;
    applyIncoming(session, session);
    if (payload.serverNow != null) clockSkew = payload.serverNow - Date.now();
    else if (session?.serverNow) clockSkew = session.serverNow - Date.now();
    renderStage();
  });
  rt.on("pong", (payload) => {
    const now = payload?.serverNow ?? payload?.ts;
    if (now != null) clockSkew = Number(now) - Date.now();
  });
  rt.on("slide", (payload) => {
    if (!session) return;
    if (!acceptStructural(session, payload, { role: "stage", eventType: "slide" })) return;
    applySlidePayload(session, payload);
    renderStage();
  });
  rt.on("deck", (payload) => {
    if (!session || !payload.slides) return;
    if (!acceptStructural(session, payload, { role: "stage", eventType: "deck" })) return;
    session.slides = payload.slides;
    if (payload.activeSlideIndex != null) session.activeSlideIndex = payload.activeSlideIndex;
    applyIncoming(session, payload);
    renderStage();
  });
  rt.on("lobby", (payload) => {
    if (!session) return;
    if (!acceptStructural(session, payload, { role: "stage", eventType: "lobby" })) return;
    session.lobby = Boolean(payload.lobby);
    applyIncoming(session, payload);
    renderStage();
  });
  rt.on("event_meta", (payload) => {
    if (!session || !payload?.eventMeta) return;
    session.eventMeta = { ...session.eventMeta, ...payload.eventMeta };
    if (payload.serverNow) clockSkew = payload.serverNow - Date.now();
    countdownSkipped = Boolean(payload.eventMeta.countdownDismissed);
    stopEventCountdown();
    renderStage();
  });
  rt.on("interaction", (payload) => {
    if (!session || !payload?.slideId) return;
    const slide = session.slides.find((s) => s.id === payload.slideId);
    if (slide && payload.interaction) {
      slide.interaction = { ...slide.interaction, ...payload.interaction };
    }
    if (payload.serverNow) clockSkew = payload.serverNow - Date.now();
    renderStage();
  });
  rt.on("results", (payload) => {
    const slide = findSlide(payload.slideId);
    if (slide) {
      slide.resultsVisible = Boolean(payload.resultsVisible);
      if (payload.voteCount != null) slide.voteCount = payload.voteCount;
    }
    renderStage();
  });
  rt.on("poll:update", (payload) => patchResults(payload));
  rt.on("wordcloud:update", (payload) => patchResults(payload));
  rt.on("new_question", (q) => patchQuestion(q));
  rt.on("question_upvoted", (payload) => {
    if (payload.question) patchQuestion(payload.question);
    else if (payload.questionId) {
      const q = findQuestion(payload.questionId);
      if (q) q.upvotes = payload.count ?? q.upvotes;
    }
    renderStage();
  });
  rt.on("question_moderated", (payload) => {
    if (payload.question) patchQuestion(payload.question);
    renderStage();
  });
  rt.on("quiz_started", (payload) => {
    const slide = findSlide(payload.slideId || payload.questionId);
    if (slide) {
      slide.round = {
        status: "running",
        startedAt: payload.startedAt || Date.now(),
        duration: payload.duration || slide.duration,
      };
    }
    renderStage();
  });
  rt.on("quiz_results", (payload) => {
    const slide = findSlide(payload.slideId);
    if (slide) {
      slide.round = { ...(slide.round || {}), status: "ended", lastResults: payload };
      if (payload.correctIndexes) slide.correctIndexes = payload.correctIndexes;
      if (payload.correctAnswer != null) slide.correctIndex = payload.correctAnswer;
      slide.leaderboard = payload.leaderboard;
    }
    renderStage();
  });
  rt.on("leaderboard_update", (payload) => {
    const slide = currentSlide();
    if (slide && payload.top10) slide.leaderboard = payload.top10;
    renderStage();
  });
  rt.on("qa_timer", (payload) => {
    const slide = findSlide(payload.slideId) || currentSlide();
    if (slide && payload.qaTimer) {
      slide.qaTimer = payload.qaTimer;
      if (payload.serverNow) clockSkew = payload.serverNow - Date.now();
    }
    renderStage();
  });
  rt.on("emergency_activated", () => {
    if (session) session.paused = true;
    renderStage();
  });
  rt.on("emergency_resumed", () => {
    if (session) session.paused = false;
    renderStage();
  });
  rt.on("error", (payload) => {
    const banner = document.getElementById("stage-conn");
    if (!banner) return;
    banner.hidden = false;
    banner.textContent = payload?.message || t("stage.reconnect");
  });
  rt.on("open", () => {
    /* Einzige Send-Calls: join (und intern ping). */
    rt.send("join", { code, role: "stage", clientId: stageClientId });
  });
  rt.connect();
}

function applyChrome(b) {
  const logoWrap = document.getElementById("stage-logo-wrap");
  const logo = document.getElementById("stage-logo");
  const showLogo = Boolean(b?.stageShowLogo) && Boolean(b?.logo);
  if (logoWrap) logoWrap.hidden = !showLogo;
  if (logo && showLogo) {
    logo.src = b.logo;
    logo.alt = b.appName || "Logo";
  }
  const foot = document.getElementById("stage-footer");
  const showFoot = Boolean(b?.stageShowFooter);
  if (foot) {
    foot.hidden = !showFoot;
    foot.textContent = showFoot ? String(b.footerText || "") : "";
  }
}

function bindFullscreen() {
  const btn = document.getElementById("stage-fs");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  const sync = () => {
    const on = Boolean(document.fullscreenElement);
    btn.textContent = on ? t("stage.fullscreenExit") : t("stage.fullscreen");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  };
  btn.addEventListener("click", () => {
    const root = document.getElementById("view-stage") || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.requestFullscreen?.();
  });
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "F10") return;
    ev.preventDefault();
    btn.click();
  });
  sync();
}

function currentSlide() {
  if (!session?.slides?.length) return null;
  return session.slides[session.activeSlideIndex || 0] || session.slides[0];
}

function findSlide(id) {
  if (!id || !session?.slides) return null;
  return session.slides.find((s) => s.id === id) || null;
}

function findQuestion(id) {
  for (const slide of session?.slides || []) {
    const q = (slide.questions || []).find((item) => item.id === id);
    if (q) return q;
  }
  return null;
}

function patchQuestion(q) {
  if (!q?.id || !session) return;
  const slide =
    session.slides.find((s) => s.type === "qa" && (s.questions || []).some((x) => x.id === q.id)) ||
    session.slides.find((s) => s.type === "qa");
  if (!slide) return;
  slide.questions = slide.questions || [];
  const idx = slide.questions.findIndex((x) => x.id === q.id);
  if (idx >= 0) slide.questions[idx] = { ...slide.questions[idx], ...q };
  else slide.questions.push(q);
}

function patchResults(payload) {
  const slide = findSlide(payload.slideId) || currentSlide();
  if (!slide) return;
  if (payload.counts) slide.counts = payload.counts;
  if (payload.entries) slide.entries = payload.entries;
  if (payload.voteCount != null) slide.voteCount = payload.voteCount;
  if (payload.resultsVisible != null) slide.resultsVisible = payload.resultsVisible;
  if (payload.ranks) slide.ranks = payload.ranks;
  if (payload.points) slide.points = payload.points;
  renderStage();
}

function renderStage() {
  const frame = document.getElementById("stage-frame");
  const pause = document.getElementById("stage-pause");
  if (!frame) return;
  if (pause) {
    pause.hidden = !session?.paused;
    const p = pause.querySelector("p");
    if (p) p.textContent = t("present.paused");
  }
  stopClock();

  const currentSpecial = getCurrentSpecialSlide(session);

  /* Endfolie — höchste Priorität. */
  if (currentSpecial === "end" && syncSpecialSlide(frame, "end")) {
    fadeIfNeeded("special:end");
    return;
  }

  /* Pausefolie. */
  if (currentSpecial === "pause" && syncSpecialSlide(frame, "pause")) {
    fadeIfNeeded("special:pause");
    return;
  }

  /* Countdown (Presenter-Button oder automatisch vor Start). */
  if (syncEventCountdown()) {
    fadeIfNeeded("countdown");
    frame.innerHTML = "";
    return;
  }

  if (!session?.slides?.length) {
    fadeIfNeeded("empty");
    frame.innerHTML = `<p class="stage-wait">${esc(t("stage.empty"))}</p>`;
    return;
  }
  if (session.lobby) {
    fadeIfNeeded("lobby");
    frame.innerHTML = `<p class="stage-wait">${esc(t("stage.wait"))}</p>`;
    stopClock();
    return;
  }

  const slide = currentSlide();
  if (!slide) {
    fadeIfNeeded("empty");
    frame.innerHTML = `<p class="stage-wait">${esc(t("stage.empty"))}</p>`;
    return;
  }
  fadeIfNeeded(`${slide.id}:${slide.type}:${Boolean(slide.resultsVisible)}:${slide.round?.status || ""}:${slide.interaction?.state || ""}:${slide.interaction?.seq || 0}`);
  destroyPoll();
  destroyStageCloud();

  const type = slide.type;
  if (type === "choice") renderChoice(frame, slide);
  else if (type === "wordcloud") renderCloud(frame, slide);
  else if (type === "qa") renderQa(frame, slide);
  else if (type === "quiz") renderQuiz(frame, slide);
  else if (type === "rating_scale") renderRating(frame, slide);
  else if (type === "ranking" || type === "points100" || type === "open_text" || type === "image_choice" || type === "datetime") {
    renderTyped(frame, slide);
  } else {
    frame.innerHTML = `<h1 class="stage-question">${esc(slide.question || "")}</h1>`;
  }

  const ixBanner = stageStatusMessage(slide);
  if (ixBanner) {
    frame.insertAdjacentHTML(
      "afterbegin",
      `<p class="stage-interaction-hint" role="status">${esc(ixBanner)}</p>`
    );
  }
}

function ensureCountdownHost() {
  const root = document.getElementById("view-stage");
  if (!root || document.getElementById("stage-event-countdown")) return;
  const host = document.createElement("div");
  host.id = "stage-event-countdown";
  host.hidden = true;
  root.prepend(host);
}

function stopEventCountdown() {
  eventCountdownCtl?.stop();
  eventCountdownCtl = null;
}

/**
 * Pause- oder Endfolie rendern.
 * @param {HTMLElement} frame
 * @param {'pause'|'end'} [kindOverride]
 * @returns {boolean}
 */
function syncSpecialSlide(frame, kindOverride) {
  const kind = kindOverride || activeSpecialSlideKind(session);
  if (!kind || !session?.eventMeta) {
    if (!kindOverride) frame.innerHTML = "";
    return false;
  }
  mountSpecialSlide(frame, kind, session.eventMeta, { t });
  return true;
}

/**
 * Countdown anzeigen falls Event-Startzeit in der Zukunft.
 * @returns {boolean} true = Countdown aktiv, Folien unterdrücken
 */
function syncEventCountdown() {
  const host = document.getElementById("stage-event-countdown");
  const root = document.getElementById("view-stage");
  const meta = session?.eventMeta;
  if (root && meta) {
    root.dataset.countdownStyle = meta.countdownStyle || "modern";
  }
  if (!host || !meta?.startTime) {
    stopEventCountdown();
    if (host) host.hidden = true;
    return false;
  }
  const forceCountdown = isCountdownSpecialActive(session);
  if (!forceCountdown && !shouldShowCountdown(meta, clockSkew, { skipped: countdownSkipped })) {
    stopEventCountdown();
    if (host) host.hidden = true;
    return false;
  }
  const joinUrl = joinUrlFromLocation(session?.code || session?.joinCode);
  if (!eventCountdownCtl) {
    eventCountdownCtl = mountCountdown(host, meta, {
      variant: "stage",
      getMeta: () => session?.eventMeta || {},
      getSkew: () => clockSkew,
      showSkip: false,
      showQr: Boolean(meta?.showStageQr),
      joinUrl,
      locale: currentLang() === "en" ? "en-GB" : currentLang() === "fr" ? "fr-FR" : "de-DE",
      t,
      onQrCanvas: (canvas, url) => drawQrCode(canvas, url),
      syncEveryMs: 10_000,
      onSync: () => {
        try {
          rt?.send("ping", {});
        } catch {
          /* offline */
        }
      },
      onEnded: () => {
        stopEventCountdown();
        api.getSession(session?.code).then((remote) => {
          if (remote?.session) {
            session = remote.session;
            if (remote.session.serverNow) clockSkew = remote.session.serverNow - Date.now();
            renderStage();
          }
        });
      },
    });
  } else {
    eventCountdownCtl.refresh?.();
  }
  return true;
}

function fadeIfNeeded(key) {
  const frame = document.getElementById("stage-frame");
  if (!frame) return;
  if (key === lastSlideKey) return;
  lastSlideKey = key;
  frame.classList.remove("is-fading");
  void frame.offsetWidth;
  frame.classList.add("is-fading");
}

function hiddenPoll(slide) {
  return Boolean(slide) && slide.resultsVisible !== true && isHideable(slide.type);
}

function isHideable(type) {
  return ["choice", "wordcloud", "rating_scale", "ranking", "points100", "open_text", "image_choice", "datetime"].includes(type);
}

function voteCount(slide) {
  if (!slide) return 0;
  if (slide.voteCount != null) return Number(slide.voteCount) || 0;
  if (slide.counts) return Object.values(slide.counts).reduce((a, n) => a + Number(n || 0), 0);
  if (slide.entries) return slide.entries.reduce((a, e) => a + Number(e.count || 0), 0);
  return 0;
}

function renderChoice(frame, slide) {
  frame.innerHTML = `<h1 class="stage-question">${esc(slide.question || "")}</h1>`;
  if (hiddenPoll(slide)) {
    frame.insertAdjacentHTML("beforeend", `<p class="stage-teaser">${esc(t("stage.teaser", { n: voteCount(slide) }))}</p>`);
    return;
  }
  const host = document.createElement("div");
  host.className = "stage-results";
  frame.append(host);
  try {
    initPoll(host, slide);
    updatePollResults({ counts: slide.counts || {} });
  } catch (err) {
    host.textContent = slide.options?.map((o) => o.label).join(" · ") || "";
  }
}

function renderRating(frame, slide) {
  frame.innerHTML = `<h1 class="stage-question">${esc(slide.question || "")}</h1>`;
  if (hiddenPoll(slide)) {
    frame.insertAdjacentHTML("beforeend", `<p class="stage-teaser">${esc(t("stage.teaser", { n: voteCount(slide) }))}</p>`);
    return;
  }
  const { avg, scale } = ratingStats(slide);
  const avgEl = document.createElement("p");
  avgEl.className = "stage-avg";
  avgEl.innerHTML = `${esc(formatDe(avg))}<span class="stage-avg-scale">${esc(t("stage.ratingOf", { avg: formatDe(avg), scale }))}</span>`;
  frame.append(avgEl);
  const host = document.createElement("div");
  host.className = "stage-results";
  frame.append(host);
  initRatingScale(host, slide);
  updateRatingResults({ counts: slide.counts || {} });
}

function renderTyped(frame, slide) {
  frame.innerHTML = `<h1 class="stage-question">${esc(slide.question || "")}</h1>`;
  if (hiddenPoll(slide)) {
    frame.insertAdjacentHTML("beforeend", `<p class="stage-teaser">${esc(t("stage.teaser", { n: voteCount(slide) }))}</p>`);
    return;
  }
  const host = document.createElement("div");
  host.className = "stage-results";
  if (slide.type === "open_text") host.classList.add("stage-open-list");
  if (slide.type === "image_choice") host.classList.add("stage-images");
  frame.append(host);
  renderTypedResults(host, slide, { t });
}

function renderCloud(frame, slide) {
  frame.innerHTML = `<h1 class="stage-question">${esc(slide.question || "")}</h1>`;
  if (hiddenPoll(slide)) {
    frame.insertAdjacentHTML("beforeend", `<p class="stage-teaser">${esc(t("stage.teaser", { n: voteCount(slide) }))}</p>`);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "stage-cloud";
  wrap.id = "stage-wordcloud-root";
  const canvas = document.createElement("canvas");
  canvas.id = "stage-wordcloud-canvas";
  canvas.setAttribute("aria-label", t("type.wordcloud"));
  wrap.append(canvas);
  frame.append(wrap);
  import("./wordcloud.js").then((mod) => {
    if (currentSlide()?.id !== slide.id) return;
    mod.initWordCloud(wrap, {
      canvas,
      minFont: 36,
      maxFont: 160,
      fontHeightFrac: 0.28,
    });
    requestAnimationFrame(() => mod.updateWordCloud(slide.entries || []));
    wrap._cloudMod = mod;
  });
}

function destroyStageCloud() {
  const wrap = document.getElementById("stage-wordcloud-root");
  wrap?._cloudMod?.destroyWordCloud?.();
}

function renderQa(frame, slide) {
  frame.innerHTML = `<h1 class="stage-question">${esc(slide.question || "")}</h1>`;
  const list = document.createElement("div");
  list.className = "stage-qa";
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", t("type.qa"));
  const questions = [...(slide.questions || [])]
    .filter((q) => {
      if (!q || q.mergedInto || q.private) return false;
      if (q.status === "approved" || q.status === "answered") return true;
      /* Ohne Moderation erscheinen pending-Fragen auf der Leinwand. */
      return slide.moderated === false && q.status === "pending";
    })
    .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  questions.forEach((q, i) => {
    const row = document.createElement("article");
    row.className = "stage-qa-item";
    row.setAttribute("role", "listitem");
    row.setAttribute("aria-label", `${q.text}, ${q.upvotes || 0} Upvotes`);
    row.innerHTML = `<span class="stage-qa-rank">${i + 1}</span><p class="stage-qa-text">${esc(q.text)}</p><span class="stage-qa-votes">👍 ${Number(q.upvotes) || 0}</span>`;
    list.append(row);
  });
  frame.append(list);
  mountStageClock(frame, slide.qaTimer);
}

function renderQuiz(frame, slide) {
  frame.innerHTML = `<h1 class="stage-question">${esc(slide.question || "")}</h1>`;
  const ended = slide.round?.status === "ended";
  const correct = new Set(
    Array.isArray(slide.correctIndexes)
      ? slide.correctIndexes
      : slide.correctIndex != null
        ? [slide.correctIndex]
        : []
  );
  const opts = document.createElement("div");
  opts.className = "stage-quiz-options";
  (slide.options || []).forEach((opt, i) => {
    const row = document.createElement("div");
    row.className = "stage-quiz-opt";
    if (ended && correct.has(i)) row.classList.add("is-correct");
    row.textContent = opt.label || opt;
    opts.append(row);
  });
  frame.append(opts);
  if (ended) {
    const board = document.createElement("div");
    board.className = "stage-board";
    board.setAttribute("aria-label", t("type.quiz"));
    const rows = (slide.leaderboard || slide.round?.lastResults?.leaderboard || slide.scores || []).slice(0, 5);
    rows.forEach((r, i) => {
      const p = document.createElement("p");
      p.className = "stage-board-row";
      p.innerHTML = `<span>${r.rank || i + 1}. ${esc(r.name || "")}</span><span>${Number(r.points) || 0}</span>`;
      board.append(p);
    });
    frame.append(board);
  }
}

function mountStageClock(frame, timer) {
  stopClock();
  const st = timer?.status;
  if (st !== "running" && st !== "paused" && st !== "ended") return;
  let el = document.getElementById("stage-clock");
  if (!el) {
    el = document.createElement("div");
    el.id = "stage-clock";
    el.className = "stage-clock";
    el.innerHTML = `<svg class="stage-clock-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="none" stroke="#e4e4e4" stroke-width="10"></circle>
      <circle id="stage-clock-fg" cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="10"
        stroke-linecap="round" transform="rotate(-90 60 60)"></circle>
    </svg><strong id="stage-clock-digits">–</strong>`;
    document.getElementById("view-stage")?.append(el);
  }
  el.hidden = false;
  const paint = () => {
    const now = Date.now() + clockSkew;
    let remaining = 0;
    if (timer.status === "running" && timer.endsAt) remaining = Math.max(0, timer.endsAt - now);
    else if (timer.status === "paused") remaining = Math.max(0, timer.pausedRemainingMs || timer.remainingMs || 0);
    const frac = timer.status === "ended" ? 0 : remaining / Math.max(1, (timer.limitSec || 60) * 1000);
    const sec = Math.ceil(remaining / 1000);
    const digits = document.getElementById("stage-clock-digits");
    if (digits) digits.textContent = timer.status === "ended" ? "0:00" : formatMmSs(sec);
    const fg = document.getElementById("stage-clock-fg");
    const circ = 2 * Math.PI * 52;
    if (fg) {
      fg.style.strokeDasharray = String(circ);
      fg.style.strokeDashoffset = String(circ * (1 - Math.max(0, Math.min(1, frac))));
    }
    const urgency = frac > 0.5 ? "ok" : frac > 0.25 ? "warn" : "critical";
    el.dataset.urgency = timer.status === "ended" ? "critical" : urgency;
    el.setAttribute("aria-label", `${t("qa.timer.running")}: ${sec}`);
    if (timer.status === "running" && remaining > 0) clockRaf = requestAnimationFrame(paint);
  };
  paint();
}

function stopClock() {
  cancelAnimationFrame(clockRaf);
  clockRaf = 0;
  const el = document.getElementById("stage-clock");
  if (el) el.hidden = true;
}

function ratingStats(slide) {
  const counts = slide.counts || {};
  let sum = 0;
  let n = 0;
  for (const [id, c] of Object.entries(counts)) {
    sum += Number(id) * Number(c || 0);
    n += Number(c || 0);
  }
  return { avg: n ? sum / n : 0, n, scale: slide.scale || 5 };
}

function formatDe(n) {
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatMmSs(sec) {
  const s = Math.max(0, Number(sec) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
