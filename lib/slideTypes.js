/**
 * Folientypen, Optionen und Bild-/Termin-Grenzen.
 * Eine Quelle für REST-Normalisierung und Tests — ohne Live-Stimmen.
 */

/** Alle bekannten `slide.type`-Werte. */
const SLIDE_TYPES = [
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
];

/** Ergebnisse erst nach Reveal — analog Choice/Wortwolke. */
const HIDEABLE_TYPES = [
  "choice",
  "rating_scale",
  "wordcloud",
  "ranking",
  "points100",
  "open_text",
  "image_choice",
  "datetime",
  "picker",
];

/** Folien mit Stimmenanteil (kein Q&A). */
const VOTE_SHARE_TYPES = [
  "choice",
  "rating_scale",
  "wordcloud",
  "quiz",
  "ranking",
  "points100",
  "open_text",
  "image_choice",
  "datetime",
  "picker",
];

/** Picker: große Optionslisten (10–50 Einträge). */
const PICKER_MIN_OPTIONS = 10;
const PICKER_MAX_OPTIONS = 50;

/** Q&A-Kategorien: kurz halten, UI-Labels kommen aus i18n. */
const QA_CATEGORIES = ["tech", "org", "content", "other"];

/** Wie Branding-Logo: Data-URL-Zeichen, Summe aller Bilder einer Folie. */
const MAX_IMAGE_CHARS = 256 * 1024;
const MAX_IMAGE_EACH = 96 * 1024;
const IMAGE_MIME = /^(data:image\/(png|jpeg|jpg|webp);base64,)/i;

const DEFAULT_OPTIONS = [
  { id: "o1", label: "Option A" },
  { id: "o2", label: "Option B" },
];

function isHideable(type) {
  return HIDEABLE_TYPES.includes(type);
}

function hasVoteShare(type) {
  return VOTE_SHARE_TYPES.includes(type);
}

/**
 * Optionen auf 2–6 Einträge kappen, IDs stabil halten.
 * @param {any[]} raw
 * @param {{ withImage?: boolean, withIso?: boolean }} [opts]
 */
function normalizeOptions(raw, opts = {}) {
  const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_OPTIONS;
  const out = [];
  let imageBudget = MAX_IMAGE_CHARS;
  for (let i = 0; i < list.length && out.length < 6; i++) {
    const item = list[i] || {};
    const label = String(item.label || item.text || item.iso || `Option ${i + 1}`).trim().slice(0, 80);
    const id = String(item.id || `o${out.length + 1}`).slice(0, 24);
    const row = { id, label: label || `Option ${out.length + 1}` };
    if (opts.withImage) {
      const img = sanitizeImageDataUrl(item.image, Math.min(MAX_IMAGE_EACH, imageBudget));
      if (img) {
        row.image = img;
        imageBudget -= img.length;
      }
    }
    if (opts.withIso) {
      const iso = normalizeIso(item.iso || item.label);
      if (iso) {
        row.iso = iso;
        if (!item.label) row.label = formatSlotLabel(iso);
      }
    }
    out.push(row);
  }
  while (out.length < 2) {
    out.push({ id: `o${out.length + 1}`, label: out.length === 0 ? "Option A" : "Option B" });
  }
  return out;
}

/**
 * Nur png/jpeg/webp-Data-URLs, harte Längengrenze.
 * @param {unknown} value
 * @param {number} maxChars
 * @returns {string}
 */
function sanitizeImageDataUrl(value, maxChars = MAX_IMAGE_EACH) {
  const raw = String(value || "");
  if (!IMAGE_MIME.test(raw)) return "";
  if (raw.length > maxChars) return "";
  return raw;
}

function normalizeIso(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatSlotLabel(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Quiz: mehrere Indizes, Fallback von historischem correctIndex.
 * @param {object} raw
 * @param {number} optionCount
 * @returns {number[]}
 */
function normalizeCorrectIndexes(raw = {}, optionCount = 2) {
  const n = Math.max(1, Number(optionCount) || 2);
  let arr = [];
  if (Array.isArray(raw.correctIndexes)) arr = raw.correctIndexes;
  else if (Number.isInteger(raw.correctIndex)) arr = [raw.correctIndex];
  else if (raw.correct != null && raw.correct !== "") arr = [Number(raw.correct)];
  const uniq = [];
  for (const v of arr) {
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i >= n) continue;
    if (!uniq.includes(i)) uniq.push(i);
  }
  return uniq.length ? uniq : [0];
}

function emptyCounts(options) {
  const counts = {};
  for (const o of options) counts[o.id] = 0;
  return counts;
}

function isKnownType(type) {
  return SLIDE_TYPES.includes(type);
}

/**
 * Picker-Kategorien normalisieren (optional).
 * @param {any[]} raw
 * @returns {Array<{ id: string, name: string, color?: string, sortOrder: number }>}
 */
function normalizePickerCategories(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  const out = [];
  for (let i = 0; i < raw.length && out.length < 20; i++) {
    const item = raw[i] || {};
    const id = String(item.id || `cat${out.length + 1}`).slice(0, 24);
    const name = String(item.name || item.label || `Kategorie ${out.length + 1}`).trim().slice(0, 60);
    if (!name) continue;
    const row = { id, name, sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : out.length };
    const color = String(item.color || "").trim();
    if (/^#[0-9a-f]{3,8}$/i.test(color)) row.color = color;
    out.push(row);
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Picker-Optionen: 10–50 Einträge, Text max. 100 Zeichen.
 * @param {any[]} raw
 * @param {{ categories?: object[] }} [opts]
 */
function normalizePickerOptions(raw, opts = {}) {
  const list = Array.isArray(raw) && raw.length ? raw : [];
  const categories = normalizePickerCategories(opts.categories);
  const catIds = new Set(categories.map((c) => c.id));
  const out = [];
  for (let i = 0; i < list.length && out.length < PICKER_MAX_OPTIONS; i++) {
    const item = list[i] || {};
    const label = String(item.label || item.text || "").trim().slice(0, 100);
    if (!label) continue;
    const id = String(item.id || `o${out.length + 1}`).slice(0, 24);
    const row = { id, label };
    const icon = String(item.icon || "").trim().slice(0, 8);
    if (icon) row.icon = icon;
    const color = String(item.color || "").trim();
    if (/^#[0-9a-f]{3,8}$/i.test(color)) row.color = color;
    if (item.disabled === true) row.disabled = true;
    const cat = String(item.category || item.categoryId || "").trim();
    if (cat && catIds.has(cat)) row.category = cat;
    out.push(row);
  }
  while (out.length < PICKER_MIN_OPTIONS) {
    out.push({ id: `o${out.length + 1}`, label: `Option ${out.length + 1}` });
  }
  return { options: out.slice(0, PICKER_MAX_OPTIONS), categories };
}

/**
 * Picker-Folie validieren (REST/Deck-Update).
 * @param {object} raw
 * @returns {{ ok: true } | { ok: false, error: string, fields?: object }}
 */
function validatePickerSlide(raw = {}) {
  const opts = Array.isArray(raw.options) ? raw.options : [];
  const filled = opts.filter((o) => String(o?.label || o?.text || "").trim());
  if (filled.length < PICKER_MIN_OPTIONS) {
    return { ok: false, error: "Mindestens 10 Optionen erforderlich", fields: { options: "min 10" } };
  }
  if (filled.length > PICKER_MAX_OPTIONS) {
    return { ok: false, error: "Maximal 50 Optionen erlaubt", fields: { options: "max 50" } };
  }
  const categories = normalizePickerCategories(raw.categories);
  const catIds = new Set(categories.map((c) => c.id));
  for (let i = 0; i < filled.length; i++) {
    const cat = String(filled[i].category || filled[i].categoryId || "").trim();
    if (cat && !catIds.has(cat)) {
      return {
        ok: false,
        error: `Option ${i + 1} verweist auf ungültige Kategorie ${cat}`,
        fields: { options: "invalid category" },
      };
    }
  }
  const allowMultiple = raw.allowMultiple === true;
  if (allowMultiple && raw.maxSelections != null && raw.maxSelections !== "") {
    const maxSel = Number(raw.maxSelections);
    if (!Number.isFinite(maxSel) || maxSel < 1) {
      return { ok: false, error: "Maximale Auswahl muss mindestens 1 sein", fields: { maxSelections: "min 1" } };
    }
    if (maxSel > filled.length) {
      return {
        ok: false,
        error: "Maximale Auswahl kann nicht größer als Anzahl Optionen sein",
        fields: { maxSelections: "too high" },
      };
    }
  }
  return { ok: true };
}

module.exports = {
  SLIDE_TYPES,
  HIDEABLE_TYPES,
  VOTE_SHARE_TYPES,
  QA_CATEGORIES,
  MAX_IMAGE_CHARS,
  MAX_IMAGE_EACH,
  DEFAULT_OPTIONS,
  PICKER_MIN_OPTIONS,
  PICKER_MAX_OPTIONS,
  isHideable,
  hasVoteShare,
  isKnownType,
  normalizeOptions,
  normalizePickerOptions,
  normalizePickerCategories,
  validatePickerSlide,
  sanitizeImageDataUrl,
  normalizeIso,
  formatSlotLabel,
  normalizeCorrectIndexes,
  emptyCounts,
};
