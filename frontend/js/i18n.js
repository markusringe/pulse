/**
 * Sprachumschaltung DE/EN/FR.
 * Browser-Sprache als Startwert, danach sessionStorage (kein Cookie).
 */

const KEY = "tt:lang";
const SUPPORTED = ["de", "en", "fr"];

let dict = {};
/** Deutsche Basis, falls die gewählte Sprache einen Schlüssel nicht hat. */
let fallbackDict = {};
let lang = "de";
const listeners = new Set();

let readyResolve;
/** Wird erfüllt, sobald die Wörterbücher geladen sind (auch bei Fehler). */
export const i18nReady = new Promise((resolve) => {
  readyResolve = resolve;
});

function markReady() {
  if (!readyResolve) return;
  readyResolve();
  readyResolve = null;
}

export function currentLang() {
  return lang;
}

export function t(key, vars = {}) {
  return translate(key, vars) ?? key;
}

export function onLang(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function detect() {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "de").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : "de";
}

export async function initI18n(allowed = SUPPORTED) {
  lang = allowed.includes(detect()) ? detect() : allowed[0] || "de";
  try {
    await load(lang);
    applyDom();
  } finally {
    markReady();
  }
}

export async function setLang(next) {
  if (!SUPPORTED.includes(next)) return;
  lang = next;
  try {
    sessionStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  await load(lang);
  applyDom();
  document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

async function fetchDict(code) {
  const res = await fetch(`/i18n/${encodeURIComponent(code)}.json?v=nav16`);
  if (!res.ok) throw new Error(String(res.status));
  const parsed = await res.json();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed;
}

async function load(code) {
  try {
    /* Deutsch immer laden, damit ssl.title & Co. nicht als Rohschlüssel erscheinen. */
    fallbackDict = await fetchDict("de");
    dict = code === "de" ? fallbackDict : { ...fallbackDict, ...(await fetchDict(code)) };
  } catch {
    dict = fallbackDict;
  }
  document.documentElement.lang = code;
}

/**
 * Liefert die Übersetzung oder null, wenn der Schlüssel fehlt.
 * applyDom darf fehlende Keys nicht als Rohtext in die Felder schreiben.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string|null}
 */
function translate(key, vars = {}) {
  if (!key) return null;
  const raw = Object.prototype.hasOwnProperty.call(dict, key)
    ? dict[key]
    : Object.prototype.hasOwnProperty.call(fallbackDict, key)
      ? fallbackDict[key]
      : null;
  if (raw == null) return null;
  let s = String(raw);
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function applyDom(root = document) {
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;
  /* Nur das Attribut data-i18n, nicht data-i18n-aria/title — sonst wird SVG in Icon-Buttons gelöscht. */
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = translate(key);
    /* Ohne Treffer den HTML-Fallback lassen (kein settings.title auf der Seite). */
    if (text == null) return;
    el.textContent = text;
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const text = translate(el.dataset.i18nPlaceholder);
    if (text == null) return;
    el.setAttribute("placeholder", text);
  });
  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const text = translate(el.dataset.i18nAria);
    if (text == null) return;
    el.setAttribute("aria-label", text);
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const text = translate(el.dataset.i18nTitle);
    if (text == null) return;
    el.setAttribute("title", text);
  });
}
