/**
 * Folien-Deck: hinzufügen, löschen, verschieben, duplizieren, aktualisieren.
 * Wird von REST und WebSocket genutzt, damit beide denselben Stand erzeugen.
 */

const MAX_SLIDES = 40;
const { isKnownType, emptyCounts, validatePickerSlide } = require("./slideTypes");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function findIndex(session, id) {
  if (!id) return -1;
  return session.slides.findIndex((s) => s.id === id);
}

/**
 * Rohdaten ohne Live-Ergebnisse — Duplikate starten leer.
 * @param {object} src
 */
function slideSource(src = {}) {
  return {
    type: src.type,
    question: src.question,
    options: src.options,
    categories: src.categories,
    allowMultiple: src.allowMultiple,
    maxSelections: src.maxSelections,
    enableSearch: src.enableSearch,
    showOptionIcons: src.showOptionIcons,
    layout: src.layout,
    subtitle: src.subtitle,
    correctIndex: src.correctIndex,
    correctIndexes: src.correctIndexes,
    correct: src.correct,
    duration: src.duration,
    scale: src.scale,
    style: src.style,
    rating: src.rating,
    moderated: src.moderated,
    notes: src.notes,
    plannedMinutes: src.plannedMinutes,
    resultsVisible: src.resultsVisible,
    qaTimer: src.qaTimer,
    interaction: src.interaction,
  };
}

/**
 * Live-Felder (Stimmen, Q&A, Quiz-Runde) von der alten Folie übernehmen.
 * Bei geänderten Optionen: Counts für bekannte IDs behalten, neue auf 0.
 * @param {object} prev
 * @param {object} next
 */
function preserveLiveState(prev, next) {
  const out = { ...next, id: prev.id, type: prev.type };
  if (prev.questions) out.questions = prev.questions;
  if (prev.round) out.round = prev.round;
  if (prev.scores) out.scores = prev.scores;
  if (prev.leaderboard) out.leaderboard = prev.leaderboard;
  if (prev.qaTimer && !out.qaTimer) out.qaTimer = prev.qaTimer;
  /* Laufzeit-Interaktionsstatus beim Inhalts-Update erhalten; Konfiguration übernehmen. */
  if (prev.interaction) {
    const cfg = out.interaction && typeof out.interaction === "object" ? out.interaction : {};
    out.interaction = {
      ...prev.interaction,
      manualStart: cfg.manualStart != null ? Boolean(cfg.manualStart) : prev.interaction.manualStart,
      timerEnabled: cfg.timerEnabled != null ? Boolean(cfg.timerEnabled) : prev.interaction.timerEnabled,
      timerSec: cfg.timerSec != null ? cfg.timerSec : prev.interaction.timerSec,
    };
  }
  if (prev.entries && (out.type === "wordcloud" || out.type === "open_text")) {
    out.entries = prev.entries;
  }
  if (prev.voteCount != null) out.voteCount = prev.voteCount;
  if (prev.previousAverage != null) out.previousAverage = prev.previousAverage;

  if (out.options && (prev.counts || prev.sums || prev.ranks)) {
    const ids = new Set(out.options.map((o) => o.id));
    if (prev.counts) {
      out.counts = emptyCounts(out.options);
      for (const id of ids) {
        if (prev.counts[id] != null) out.counts[id] = prev.counts[id];
      }
    }
    if (prev.sums) {
      out.sums = emptyCounts(out.options);
      for (const id of ids) {
        if (prev.sums[id] != null) out.sums[id] = prev.sums[id];
      }
    }
    if (prev.ranks) out.ranks = prev.ranks;
  } else {
    if (prev.counts) out.counts = prev.counts;
    if (prev.sums) out.sums = prev.sums;
    if (prev.ranks) out.ranks = prev.ranks;
  }
  return out;
}

/**
 * @param {object} session
 * @param {string} action  add | remove | move | duplicate | patch | update
 * @param {object} payload
 * @param {{ normalizeSlide: Function }} helpers
 */
function applyDeckAction(session, action, payload = {}, helpers) {
  const normalizeSlide = helpers.normalizeSlide;
  if (typeof normalizeSlide !== "function") return { error: "Interner Fehler" };

  if (action === "add") {
    if (session.slides.length >= MAX_SLIDES) {
      return { error: `Maximal ${MAX_SLIDES} Folien` };
    }
    const raw = payload.slide || payload;
    if (raw.type && !isKnownType(raw.type) && raw.type !== "rating") {
      return { error: "Unbekannter Folientyp" };
    }
    let slide;
    try {
      slide = normalizeSlide(raw);
    } catch (err) {
      return { error: err.message || "Ungültige Folien-Daten" };
    }
    const at = payload.index == null ? session.slides.length : clamp(payload.index, 0, session.slides.length);
    session.slides.splice(at, 0, slide);
    session.activeSlideIndex = at;
    return { ok: true, slide };
  }

  if (action === "remove") {
    if (session.slides.length <= 1) return { error: "Mindestens eine Folie bleibt" };
    const idx = findIndex(session, payload.id);
    if (idx < 0) return { error: "Folie nicht gefunden" };
    session.slides.splice(idx, 1);
    if (session.activeSlideIndex > idx) session.activeSlideIndex -= 1;
    if (session.activeSlideIndex >= session.slides.length) {
      session.activeSlideIndex = session.slides.length - 1;
    }
    return { ok: true };
  }

  if (action === "move") {
    const from = findIndex(session, payload.id);
    if (from < 0) return { error: "Folie nicht gefunden" };
    const to = clamp(payload.index, 0, session.slides.length - 1);
    if (from === to) return { ok: true };
    const [slide] = session.slides.splice(from, 1);
    session.slides.splice(to, 0, slide);
    session.activeSlideIndex = to;
    return { ok: true };
  }

  if (action === "duplicate") {
    if (session.slides.length >= MAX_SLIDES) {
      return { error: `Maximal ${MAX_SLIDES} Folien` };
    }
    let idx = findIndex(session, payload.id);
    if (idx < 0) idx = session.activeSlideIndex || 0;
    const src = session.slides[idx];
    if (!src) return { error: "Folie nicht gefunden" };
    const copy = normalizeSlide(slideSource(src));
    session.slides.splice(idx + 1, 0, copy);
    session.activeSlideIndex = idx + 1;
    return { ok: true, slide: copy };
  }

  /* Nur Presenter-Felder (Notizen, Zeitplan) — kein Folientyp-Wechsel. */
  if (action === "patch") {
    const idx = findIndex(session, payload.id);
    if (idx < 0) return { error: "Folie nicht gefunden" };
    const slide = session.slides[idx];
    if (payload.notes != null) slide.notes = String(payload.notes).slice(0, 4000);
    if (Object.prototype.hasOwnProperty.call(payload, "plannedMinutes")) {
      const n = payload.plannedMinutes;
      if (n == null || n === "") slide.plannedMinutes = null;
      else {
        const num = Number(n);
        slide.plannedMinutes = Number.isFinite(num) && num > 0 ? Math.max(1, Math.min(3600, Math.round(num))) : null;
      }
    }
    return { ok: true, slide };
  }

  /**
   * Inhalts-Update: Frage, Optionen, Typ-Einstellungen — Typ und ID bleiben.
   * Live-Stimmen/Q&A bleiben erhalten soweit möglich.
   */
  if (action === "update") {
    const idx = findIndex(session, payload.id || payload.slideId);
    if (idx < 0) return { error: "Folie nicht gefunden", fields: { id: "nicht gefunden" } };
    const prev = session.slides[idx];
    const raw = payload.slide && typeof payload.slide === "object" ? payload.slide : payload;
    const question = String(raw.question != null ? raw.question : prev.question || "")
      .trim()
      .slice(0, 500);
    if (!question) {
      return { error: "Fragetext ist erforderlich", fields: { question: "Pflichtfeld" } };
    }

    /* Optionen-Anzahl prüfen, bevor normalizeOptionen auffüllt */
    const optionTypes = ["choice", "quiz", "ranking", "points100", "image_choice", "datetime"];
    if (optionTypes.includes(prev.type) && Array.isArray(raw.options)) {
      if (raw.options.length < 2) {
        return { error: "Mindestens 2 Optionen erforderlich", fields: { options: "min 2" } };
      }
      if (raw.options.length > 6) {
        return { error: "Maximal 6 Optionen erlaubt", fields: { options: "max 6" } };
      }
    }
    if (prev.type === "picker" && Array.isArray(raw.options)) {
      const check = validatePickerSlide({ ...prev, ...raw, options: raw.options });
      if (!check.ok) return { error: check.error, fields: check.fields || {} };
    }

    const draft = slideSource({
      ...prev,
      ...raw,
      type: prev.type,
      id: prev.id,
      question,
    });
    draft.id = prev.id;
    draft.type = prev.type;

    /* Quiz: mindestens eine korrekte Antwort (vor Default [0] in normalize) */
    if (prev.type === "quiz") {
      const opts = Array.isArray(draft.options) ? draft.options : prev.options || [];
      let idxs = [];
      if (Array.isArray(raw.correctIndexes)) idxs = raw.correctIndexes;
      else if (raw.correctIndex != null) idxs = [raw.correctIndex];
      else if (Array.isArray(draft.correctIndexes)) idxs = draft.correctIndexes;
      const n = opts.length || 2;
      idxs = idxs.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n);
      if (!idxs.length) {
        return {
          error: "Mindestens eine korrekte Antwort erforderlich",
          fields: { correctIndexes: "mindestens eine" },
        };
      }
      draft.correctIndexes = idxs;
      draft.correctIndex = idxs[0];
    }

    let next;
    try {
      next = normalizeSlide(draft);
    } catch (err) {
      return { error: err.message || "Ungültige Folien-Daten" };
    }
    next = preserveLiveState(prev, next);
    session.slides[idx] = next;
    return { ok: true, slide: next };
  }

  return { error: "Unbekannte Aktion" };
}

/**
 * Folien einer Quell-Session in die Ziel-Session kopieren (neue IDs).
 * @param {object} targetSession
 * @param {object[]} sourceSlides
 * @param {{ slideIds?: string[], normalizeSlide: Function }} opts
 */
function copySlidesFrom(targetSession, sourceSlides, opts = {}) {
  const normalizeSlide = opts.normalizeSlide;
  if (typeof normalizeSlide !== "function") return { error: "Interner Fehler" };
  const all = Array.isArray(sourceSlides) ? sourceSlides : [];
  let slides = all;
  if (Array.isArray(opts.slideIds) && opts.slideIds.length) {
    const want = new Set(opts.slideIds.map(String));
    slides = all.filter((s) => want.has(String(s.id)));
  }
  if (!slides.length) return { error: "Keine Folien zum Kopieren" };
  if (targetSession.slides.length + slides.length > MAX_SLIDES) {
    return { error: `Maximal ${MAX_SLIDES} Folien` };
  }
  const added = [];
  for (const src of slides) {
    const copy = normalizeSlide(slideSource(src));
    targetSession.slides.push(copy);
    added.push(copy);
  }
  return { ok: true, copied: added.length, slides: added };
}

module.exports = { applyDeckAction, copySlidesFrom, MAX_SLIDES, slideSource, preserveLiveState };
