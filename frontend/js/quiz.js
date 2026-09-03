/**
 * Quiz-Modus: rAF-Timer, Punkte, Ergebnis, Karten-Auswahl.
 */

import { initLeaderboard, updateLeaderboard, destroyLeaderboard } from "./leaderboard.js";

/** @type {QuizView | null} */
let view = null;
let raf = 0;

/**
 * Formel laut Spezifikation: 500 Basis + bis 500 Zeitbonus.
 * @param {number} timeRemaining
 * @param {number} totalTime
 */
export function calculatePoints(timeRemaining, totalTime) {
  const total = Math.max(1, Number(totalTime) || 1);
  const left = Math.max(0, Number(timeRemaining) || 0);
  return Math.round(500 + 500 * (left / total));
}

/**
 * @param {HTMLElement} container
 * @param {{ role: string, question?: string, options?: any[], duration?: number, correctIndex?: number,
 *   onStart?: Function, onAnswer?: Function, onEnd?: Function, onReveal?: Function }} opts
 */
export function initQuiz(container, opts) {
  destroyQuiz();
  container.innerHTML = "";
  container.classList.add("quiz-container");
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "assertive");
  const head = document.createElement("div");
  head.className = "quiz-head";
  /* Dicker Ring plus lineare Progress-Bar; Urgency färbt beide (ok / warn / critical). */
  head.innerHTML = `
    <div class="quiz-timer" data-urgency="ok">
      <div class="quiz-timer-wrap">
        <svg class="quiz-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" class="quiz-ring-bg"></circle>
          <circle cx="60" cy="60" r="52" class="quiz-ring-fg"></circle>
        </svg>
        <strong id="quiz-seconds" class="quiz-seconds">–</strong>
      </div>
      <div class="quiz-timer-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
        <span class="quiz-timer-bar-fill"></span>
      </div>
    </div>
    <div class="quiz-side">
      ${opts.role === "presenter" ? presenterControls(opts.duration || 30) : participantHint(opts)}
    </div>`;
  const cards = document.createElement("div");
  cards.className = "quiz-cards";
  cards.setAttribute("role", "listbox");
  const result = document.createElement("div");
  result.className = "quiz-result";
  result.hidden = true;
  const board = document.createElement("canvas");
  board.className = "quiz-board";
  board.setAttribute("aria-label", "Rangliste Top 10");
  container.append(live, head, cards, result, board);

  view = {
    container,
    opts,
    live,
    cards,
    result,
    ring: head.querySelector(".quiz-ring-fg"),
    seconds: head.querySelector("#quiz-seconds"),
    timer: head.querySelector(".quiz-timer"),
    bar: head.querySelector(".quiz-timer-bar"),
    barFill: head.querySelector(".quiz-timer-bar-fill"),
    board,
    duration: opts.duration || 30,
    endsAt: 0,
    startedAt: 0,
    status: "idle",
    picked: new Set(),
    lastAnnounce: -1,
    hiddenIndexes: new Set(),
    overall: null,
  };
  initLeaderboard(board);
  renderCards(opts.options || [], false);
  bindPresenter(view);
  bindPowerups(view);
  return view;
}

/** Startet die Runde, Timer läuft über rAF (kein setInterval). */
export function startQuizRound(startedAt, duration) {
  if (!view) return;
  view.duration = duration;
  view.startedAt = startedAt || Date.now();
  view.endsAt = view.startedAt + duration * 1000;
  view.status = "running";
  view.picked = new Set();
  view.result.hidden = true;
  view.hiddenIndexes = new Set();
  renderCards(view.opts.options || [], true);
  console.debug("[Quiz]", "runde start", duration);
  loop();
}

export function setQuizRemaining(remainingSec) {
  if (!view || view.status !== "running") return;
  view.endsAt = Date.now() + remainingSec * 1000;
}

export function showQuizResults(data) {
  if (!view) return;
  view.status = "ended";
  cancelAnimationFrame(raf);
  const correctSet = new Set(
    Array.isArray(data.correctIndexes) ? data.correctIndexes : data.correctAnswer != null ? [data.correctAnswer] : [data.correctIndex]
  );
  highlightCorrect(correctSet);
  const mine = data.you || {};
  const ok = mine.correct === true;
  const delta = mine.lastDelta ?? mine.points ?? 0;
  view.result.hidden = false;
  if (view.opts.role === "presenter") {
    view.result.innerHTML = `<p class="quiz-verdict">Runde beendet</p><p class="muted">Richtige Antwort ist markiert.</p>`;
    view.live.textContent = "Quizrunde beendet. Richtige Antwort hervorgehoben.";
    if (data.overall) renderOverall(view, data.overall);
  } else {
    view.result.innerHTML = `
      <p class="quiz-verdict">${ok ? "Richtig" : "Falsch"}</p>
      <p class="quiz-delta">${ok ? `+${delta} Punkte` : "Keine Punkte"}</p>
      <p class="muted">Platz ${mine.rank || "–"}</p>`;
    view.live.textContent = `${ok ? "Richtig" : "Falsch"}. ${delta} Punkte. Platz ${mine.rank || "unbekannt"}.`;
  }
  if (data.leaderboard) updateLeaderboard(data.leaderboard);
}

export function destroyQuiz() {
  cancelAnimationFrame(raf);
  destroyLeaderboard();
  if (view) view.container.innerHTML = "";
  view = null;
}

function presenterControls(duration) {
  return `
    <label class="field">Timer
      <input id="quiz-duration" type="range" min="5" max="60" value="${duration}" />
      <span id="quiz-dur-label">${duration}s</span>
    </label>
    <div class="quiz-actions">
      <button type="button" class="btn primary" data-quiz="start">Quiz starten</button>
      <button type="button" class="btn ghost" data-quiz="reveal">Antworten anzeigen</button>
      <button type="button" class="btn ghost" data-quiz="end">Runde beenden</button>
      <button type="button" class="btn ghost" data-quiz="next">Nächste Frage</button>
      <button type="button" class="btn ghost" data-quiz="board">Rangliste anzeigen</button>
      <button type="button" class="btn ghost" data-quiz="overall">Gesamtrangliste</button>
    </div>`;
}

function bindPresenter(v) {
  if (v.opts.role !== "presenter") return;
  const slider = v.container.querySelector("#quiz-duration");
  const label = v.container.querySelector("#quiz-dur-label");
  slider?.addEventListener("input", () => {
    v.duration = Number(slider.value);
    label.textContent = `${v.duration}s`;
  });
  v.container.querySelectorAll("[data-quiz]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.quiz;
      if (act === "start") v.opts.onStart?.(v.duration);
      if (act === "reveal" || act === "end") v.opts.onEnd?.();
      if (act === "next") v.opts.onNext?.();
      if (act === "board") v.board.scrollIntoView({ block: "nearest" });
      if (act === "overall") v.opts.onOverall?.();
    });
  });
}

function participantHint(opts) {
  const multi = (opts.correctIndexes && opts.correctIndexes.length > 1) || opts.multiCorrect;
  const hint = multi
    ? "Alle richtigen Optionen wählen. Punkte nur bei vollständig korrekter Auswahl."
    : "Eine Antwort wählen. Schneller = mehr Punkte.";
  return `<p class="quiz-hint muted">${hint}</p>
    <div class="quiz-powerups">
      <button type="button" class="btn ghost" data-power="double">2× nächste Frage</button>
      <button type="button" class="btn ghost" data-power="fifty">50:50</button>
    </div>`;
}

function bindPowerups(v) {
  if (v.opts.role === "presenter") return;
  v.container.querySelectorAll("[data-power]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      v.opts.onPowerup?.(btn.dataset.power);
    });
  });
}

/**
 * 50:50 blendet eine falsche Option aus (Index kommt vom Server).
 * @param {number[]} hide
 */
export function applyFiftyFifty(hide) {
  if (!view) return;
  const set = new Set((hide || []).map(Number));
  view.hiddenIndexes = set;
  view.cards.querySelectorAll("button").forEach((b, i) => {
    if (set.has(i)) {
      b.hidden = true;
      b.disabled = true;
    }
  });
}

export function showOverallLeaderboard(entries) {
  if (view) renderOverall(view, entries);
}

function renderOverall(v, entries) {
  let host = v.container.querySelector(".quiz-overall");
  if (!host) {
    host = document.createElement("div");
    host.className = "quiz-overall";
    v.container.append(host);
  }
  const rows = (entries || []).slice(0, 10);
  host.innerHTML = `<h3>Gesamtrangliste</h3>` + rows.map((r) => `<p><strong>${r.rank}.</strong> ${escapeHtml(r.name)} — ${r.points}</p>`).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderCards(options, interactive) {
  if (!view) return;
  view.cards.innerHTML = "";
  const multi = view.opts.multiCorrect || (view.opts.correctIndexes && view.opts.correctIndexes.length > 1);
  options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-card pulse-choice-btn";
    btn.dataset.color = String(i);
    btn.dataset.index = String(i);
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = opt.label || opt;
    btn.tabIndex = 0;
    btn.disabled = view.opts.role === "presenter" || !interactive || view.status !== "running";
    btn.addEventListener("click", () => pick(i, btn, multi));
    btn.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        pick(i, btn, multi);
      }
    });
    view.cards.append(btn);
  });
  if (multi && view.opts.role !== "presenter") {
    const send = document.createElement("button");
    send.type = "button";
    send.className = "btn primary pulse-btn-primary quiz-multi-send";
    send.textContent = "Auswahl senden";
    send.disabled = !interactive || view.status !== "running";
    send.addEventListener("click", () => commitMulti());
    view.cards.append(send);
  }
}

function pick(index, btn, multi) {
  if (!view || view.status !== "running") return;
  if (view.hiddenIndexes?.has(index)) return;
  if (!multi) {
    if (view.picked.size) return;
    view.picked.add(index);
    btn.classList.add("is-selected");
    for (const b of view.cards.querySelectorAll("button")) b.disabled = true;
    commitAnswer([...view.picked]);
    return;
  }
  if (view.picked.has(index)) {
    view.picked.delete(index);
    btn.classList.remove("is-selected");
    btn.setAttribute("aria-pressed", "false");
  } else {
    view.picked.add(index);
    btn.classList.add("is-selected");
    btn.setAttribute("aria-pressed", "true");
  }
}

function commitMulti() {
  if (!view || view.status !== "running" || !view.picked.size) return;
  for (const b of view.cards.querySelectorAll("button")) b.disabled = true;
  commitAnswer([...view.picked]);
}

function commitAnswer(indexes) {
  const left = Math.max(0, (view.endsAt - Date.now()) / 1000);
  view.opts.onAnswer?.(indexes, left);
  view.result.hidden = false;
  view.result.innerHTML = `<p>Warte auf andere…</p>`;
  view.live.textContent = "Antwort gesendet. Warte auf andere Teilnehmer.";
}

function highlightCorrect(correctSet) {
  const set = correctSet instanceof Set ? correctSet : new Set([correctSet]);
  view.cards.querySelectorAll("button.quiz-card").forEach((b, i) => {
    const mine = view.picked.has(i);
    b.classList.toggle("is-correct", set.has(i));
    b.classList.toggle("is-wrong", mine && !set.has(i));
    b.disabled = true;
  });
}

/**
 * Kreis-Timer: verbleibende Zeit als Bogen (stroke-dashoffset), Ansage bei 10/5/0 s.
 */
function loop() {
  cancelAnimationFrame(raf);
  const step = () => {
    if (!view || view.status !== "running") return;
    const leftMs = Math.max(0, view.endsAt - Date.now());
    const frac = leftMs / (view.duration * 1000);
    const circ = 2 * Math.PI * 52;
    if (view.ring) {
      view.ring.style.strokeDasharray = String(circ);
      view.ring.style.strokeDashoffset = String(circ * (1 - frac));
    }
    const sec = Math.ceil(leftMs / 1000);
    view.seconds.textContent = String(sec);
    /* Unter 35 % Orange, unter 15 % Rot — nicht nur über Helligkeit unterscheidbar. */
    const urgency = frac <= 0.15 ? "critical" : frac <= 0.35 ? "warn" : "ok";
    if (view.timer) view.timer.dataset.urgency = urgency;
    if (view.barFill) view.barFill.style.setProperty("--timer-frac", String(Math.max(0, frac)));
    if (view.bar) {
      view.bar.setAttribute("aria-valuenow", String(Math.round(frac * 100)));
      view.bar.setAttribute("aria-valuetext", `${sec} Sekunden`);
    }
    if (sec !== view.lastAnnounce && (sec === 10 || sec === 5 || sec === 0 || sec % 10 === 0)) {
      view.lastAnnounce = sec;
      view.live.textContent = sec ? `Noch ${sec} Sekunden` : "Zeit abgelaufen";
    }
    if (leftMs <= 0) {
      view.status = "ended";
      view.opts.onTimeout?.();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
