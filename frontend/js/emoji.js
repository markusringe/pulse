/**
 * Emoji-Picker: Kategorien, Einfügen an Cursor, max. 5 Emojis.
 */

const CATS = {
  smileys: [
    ["💡", "Glühbirne"],
    ["❓", "Fragezeichen"],
    ["🤔", "Nachdenkendes Gesicht"],
    ["😊", "Lächelndes Gesicht"],
    ["🎉", "Konfetti"],
    ["😍", "Verliebtes Gesicht"],
    ["😐", "Neutrales Gesicht"],
    ["😕", "Verwirrtes Gesicht"],
    ["😠", "Wütendes Gesicht"],
    ["😅", "Nervöses Lachen"],
  ],
  hands: [
    ["👍", "Daumen hoch"],
    ["👎", "Daumen runter"],
    ["👏", "Klatschende Hände"],
    ["🙏", "Gefaltete Hände"],
    ["✋", "Erhobene Hand"],
  ],
  objects: [
    ["🎯", "Zielscheibe"],
    ["🚀", "Rakete"],
    ["📊", "Balkendiagramm"],
    ["🧠", "Gehirn"],
    ["☁️", "Wolke"],
  ],
  symbols: [
    ["✅", "Häkchen"],
    ["⚠️", "Warnung"],
    ["❗", "Ausrufezeichen"],
    ["➕", "Plus"],
    ["⭐", "Stern"],
  ],
  flags: [
    ["🇩🇪", "Flagge Deutschland"],
    ["🇫🇷", "Flagge Frankreich"],
    ["🇪🇺", "Flagge Europäische Union"],
    ["🏳️", "Weiße Flagge"],
    ["🌈", "Regenbogen"],
  ],
};

const FREQUENT = ["💡", "❓", "👍", "🎯", "🚀", "✅", "⚠️", "📊", "🎉", "🤔"];
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const MAX = 5;

export function countEmojis(text) {
  return (String(text || "").match(EMOJI_RE) || []).length;
}

export function canAddEmoji(text) {
  return countEmojis(text) < MAX;
}

/**
 * Fügt ein Emoji an der Cursor-Position ein.
 * @param {HTMLTextAreaElement|HTMLInputElement} input
 * @param {string} emoji
 */
export function insertEmojiAtCursor(input, emoji) {
  if (!canAddEmoji(input.value)) return false;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  const pos = start + emoji.length;
  input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

/**
 * @param {HTMLElement} host
 * @param {HTMLTextAreaElement} input
 */
export function mountEmojiPicker(host, input) {
  const wrap = document.createElement("div");
  wrap.className = "emoji-picker-wrap";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn ghost emoji-toggle";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", "Emoji hinzufügen");
  btn.textContent = "😊 Emoji hinzufügen";
  const panel = document.createElement("div");
  panel.className = "emoji-picker";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Emoji-Auswahl");

  const freq = document.createElement("p");
  freq.className = "emoji-freq muted";
  freq.textContent = "Häufig genutzte Emojis";
  const freqGrid = grid(FREQUENT.map((e) => [e, e]));
  panel.append(freq, freqGrid);

  for (const [name, items] of Object.entries(CATS)) {
    const h = document.createElement("p");
    h.className = "emoji-cat muted";
    h.textContent = name;
    panel.append(h, grid(items));
  }

  btn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    btn.setAttribute("aria-expanded", String(!panel.hidden));
  });
  input.addEventListener("focus", () => {
    freq.hidden = false;
  });
  panel.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-emoji]");
    if (!b) return;
    insertEmojiAtCursor(input, b.dataset.emoji);
  });

  wrap.append(btn, panel);
  host.append(wrap);
  return wrap;
}

function grid(items) {
  const g = document.createElement("div");
  g.className = "emoji-grid";
  items.forEach(([emoji, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-cell";
    b.dataset.emoji = emoji;
    b.textContent = emoji;
    b.setAttribute("aria-label", label || emoji);
    b.title = label || emoji;
    g.append(b);
  });
  return g;
}

/** Kontext-Vorschläge: Frage → 💡, Lob → 👍 */
export function suggestEmoji(text) {
  const s = String(text || "").toLowerCase();
  if (s.includes("danke") || s.includes("super") || s.includes("gut")) return "👍";
  if (s.includes("?") || s.startsWith("wie") || s.startsWith("was") || s.startsWith("wann")) return "💡";
  return "❓";
}
