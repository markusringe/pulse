/**
 * Folien-Deck: Entwurf auf der Startseite und Live-Leiste beim Präsentieren.
 * Icons bleiben kurz, damit der Streifen auf dem Beamer lesbar bleibt.
 */

const TYPE_ICON = {
  choice: "📊",
  wordcloud: "☁️",
  qa: "💬",
  quiz: "🧠",
  rating_scale: "⭐",
  ranking: "🔢",
  points100: "💯",
  open_text: "📝",
  image_choice: "🖼️",
  datetime: "📅",
  picker: "🎯",
};

const TYPE_I18N = {
  choice: "type.choice",
  wordcloud: "type.wordcloud",
  qa: "type.qa",
  quiz: "type.quiz",
  rating_scale: "type.rating",
  ranking: "type.ranking",
  points100: "type.points100",
  open_text: "type.openText",
  image_choice: "type.imageChoice",
  datetime: "type.datetime",
  picker: "type.picker",
};

/** Entwurfsfolien vor dem Start — nur im Speicher dieses Tabs. */
const draft = [];

export function typeIcon(type) {
  return TYPE_ICON[type] || "📄";
}

export function typeLabel(type, t) {
  const key = TYPE_I18N[type];
  return key && t ? t(key) : type;
}

export function listDraft() {
  return draft;
}

export function addDraft(slide) {
  if (!slide) return;
  draft.push(slide);
}

export function removeDraft(id) {
  const idx = draft.findIndex((s) => s.id === id);
  if (idx >= 0) draft.splice(idx, 1);
}

export function moveDraft(id, dir) {
  const idx = draft.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const to = idx + dir;
  if (to < 0 || to >= draft.length) return;
  const [item] = draft.splice(idx, 1);
  draft.splice(to, 0, item);
}

export function clearDraft() {
  draft.length = 0;
}

/**
 * Startliste: vorhandene Entwürfe plus aktuelle Formularfolie,
 * sofern sie nicht schon identisch am Ende liegt.
 */
export function slidesForStart(current) {
  const slides = draft.map((s) => ({ ...s }));
  if (!current) return slides;
  const last = slides[slides.length - 1];
  const same = last && last.type === current.type && last.question === current.question;
  if (!slides.length || !same) slides.push(current);
  return slides;
}

export function renderDraftList(root, t, handlers) {
  if (!root) return;
  root.replaceChildren();
  if (!draft.length) {
    const empty = document.createElement("p");
    empty.className = "muted deck-empty";
    empty.textContent = t ? t("deck.empty") : "Noch keine Folien in der Liste.";
    root.append(empty);
    return;
  }
  const list = document.createElement("ol");
  list.className = "deck-list";
  draft.forEach((slide, i) => {
    const li = document.createElement("li");
    li.className = "deck-item";
    li.innerHTML = `
      <span class="deck-index">${i + 1}</span>
      <span class="deck-icon" aria-hidden="true">${typeIcon(slide.type)}</span>
      <span class="deck-meta">
        <strong>${escapeHtml(slide.question || "")}</strong>
        <span class="muted">${escapeHtml(typeLabel(slide.type, t))}</span>
      </span>
      <span class="deck-actions">
        <button type="button" class="btn ghost" data-act="up" aria-label="${t ? t("deck.up") : "Nach oben"}">↑</button>
        <button type="button" class="btn ghost" data-act="down" aria-label="${t ? t("deck.down") : "Nach unten"}">↓</button>
        <button type="button" class="btn ghost" data-act="remove" aria-label="${t ? t("deck.remove") : "Entfernen"}">✕</button>
      </span>`;
    li.querySelector('[data-act="up"]').addEventListener("click", () => handlers.onMove(slide.id, -1));
    li.querySelector('[data-act="down"]').addEventListener("click", () => handlers.onMove(slide.id, 1));
    li.querySelector('[data-act="remove"]').addEventListener("click", () => handlers.onRemove(slide.id));
    list.append(li);
  });
  root.append(list);
}

/**
 * Klickbare Folienleiste im Präsentator.
 * @param {HTMLElement} root
 * @param {{ slides: any[], activeSlideIndex: number }} session
 */
export function renderPresentStrip(root, session, t, handlers) {
  if (!root || !session?.slides) return;
  root.replaceChildren();
  root.setAttribute("role", "tablist");
  root.setAttribute("aria-label", t ? t("deck.strip") : "Folien");
  session.slides.forEach((slide, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deck-chip" + (i === (session.activeSlideIndex || 0) ? " is-active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(i === (session.activeSlideIndex || 0)));
    btn.title = slide.question || "";
    btn.innerHTML = `<span aria-hidden="true">${typeIcon(slide.type)}</span><span>${i + 1}</span>`;
    btn.addEventListener("click", () => handlers.onGoto(i));
    root.append(btn);
  });
  const add = document.createElement("button");
  add.type = "button";
  add.className = "deck-chip deck-chip-add";
  add.textContent = "+";
  add.setAttribute("aria-label", t ? t("deck.addLive") : "Folie hinzufügen");
  add.addEventListener("click", () => handlers.onAdd());
  root.append(add);
}

/**
 * Mock-Modus: dieselbe Semantik wie das Backend, lokal auf der Session.
 */
export function applyMockDeck(session, payload, buildSlide) {
  if (!session?.slides || !payload?.action) return false;
  const action = payload.action;
  if (action === "add") {
    const slide = buildSlide(payload.slide || payload);
    const at = payload.index == null ? session.slides.length : Number(payload.index) || 0;
    session.slides.splice(Math.max(0, Math.min(at, session.slides.length)), 0, slide);
    session.activeSlideIndex = Math.max(0, Math.min(at, session.slides.length - 1));
    return true;
  }
  if (action === "remove") {
    if (session.slides.length <= 1) return false;
    const idx = session.slides.findIndex((s) => s.id === payload.id);
    if (idx < 0) return false;
    session.slides.splice(idx, 1);
    if (session.activeSlideIndex > idx) session.activeSlideIndex -= 1;
    if (session.activeSlideIndex >= session.slides.length) session.activeSlideIndex = session.slides.length - 1;
    return true;
  }
  if (action === "move") {
    const from = session.slides.findIndex((s) => s.id === payload.id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(session.slides.length - 1, Number(payload.index) || 0));
    const [slide] = session.slides.splice(from, 1);
    session.slides.splice(to, 0, slide);
    session.activeSlideIndex = to;
    return true;
  }
  if (action === "duplicate") {
    let idx = session.slides.findIndex((s) => s.id === payload.id);
    if (idx < 0) idx = session.activeSlideIndex || 0;
    const src = session.slides[idx];
    if (!src) return false;
    const copy = buildSlide({
      type: src.type,
      question: src.question,
      options: src.options,
      correctIndex: src.correctIndex,
      correctIndexes: src.correctIndexes,
      duration: src.duration,
      scale: src.scale,
      style: src.style,
      rating: src.rating,
      notes: src.notes,
      plannedMinutes: src.plannedMinutes,
    });
    session.slides.splice(idx + 1, 0, copy);
    session.activeSlideIndex = idx + 1;
    return true;
  }
  if (action === "patch") {
    const slide = session.slides.find((s) => s.id === payload.id);
    if (!slide) return false;
    if (payload.notes != null) slide.notes = String(payload.notes).slice(0, 4000);
    if (Object.prototype.hasOwnProperty.call(payload, "plannedMinutes")) {
      const n = Number(payload.plannedMinutes);
      slide.plannedMinutes = Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(3600, Math.round(n))) : null;
    }
    return true;
  }
  return false;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
