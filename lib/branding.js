/**
 * Instanz-Branding (Saarbrücken-Preset). Liegt in data/branding.json.
 *
 * White-Label-Felder (appName, Favicon, Domain, Footer ausblenden) ändern
 * NICHT den internen Speicher: SQLite bleibt pulse.db, localStorage-Prefix
 * bleibt pulse:* / tt:* — sonst zerbrechen Sessions, Theme und Sprache.
 */

const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "data", "branding.json");

/** Anzeigename, wenn das Feld leer oder nach Sanitize unbrauchbar ist. */
const DEFAULT_APP_NAME = "Pulse";

/** Logo wie bisher: Data-URL-Stringlänge (Base64 ist größer als die Datei). */
const MAX_LOGO_CHARS = 256 * 1024;
/** Eigene Schrift: woff2/woff/ttf, hartes Limit 500 KiB Data-URL. */
const MAX_FONT_CHARS = 500 * 1024;
/** Folien-Hintergrundbild, etwas großzügiger als Logo (Fotos). */
const MAX_SLIDE_BG_CHARS = 512 * 1024;
/** Kurzer Bestätigungs-Sound (mp3/ogg/wav). */
const MAX_SOUND_CHARS = 200 * 1024;
/** Favicon svg/png. */
const MAX_FAVICON_CHARS = 64 * 1024;

/**
 * Farben Stand 2026-09-02 von https://www.saarbruecken.de (Theme saarbruecken_2019):
 * - primary #007CC1: CSS `a{color:#007cc1}`, `.button` / `.blue` / `.no_theme`;
 *   Homepage-CTA `background-color:#007CC1`. Logo-Welle `.cls-2{fill:#007bc2}`
 *   (1/255 Abweichung, visuell identisch).
 * - secondary #F99700: CSS-Klasse `.orange` (Nav „Leben“). Klassisches
 *   Saarbrücken-Gelb #FFCC00 kommt auf der aktuellen Website nicht vor.
 * - bg #FFFFFF: `body{background:#fff}`, Header `.top-navigation`, theme-color.
 * - text #1A171B: Logo-Wortmarke `.cls-1{fill:#1a171b}` (Body-CSS #000, Header #2b2b2b).
 */
const SAARBRUECKEN = {
  primary: "#007CC1",
  secondary: "#F99700",
  bg: "#ffffff",
  text: "#1A171B",
  logo: "",
  footerText: "© 2026 Landeshauptstadt Saarbrücken",
  impressumUrl: "#/impressum",
  privacyUrl: "#/privacy",
  /* Kurzer Hinweis zur Stadtwebsite; der Mustertext in lib/privacy.js bleibt maßgeblich. */
  privacyExtra:
    "Pulse ist ein Angebot der Landeshauptstadt Saarbrücken. Ergänzend gilt die ausführliche [Datenschutzerklärung auf saarbruecken.de](https://www.saarbruecken.de/fusszeile/datenschutz).",
  languages: ["de", "en", "fr"],
  retentionDays: 30,
  /* Offizielle Stadt-Homepage (Footer-Link); nur http(s). */
  homepageUrl: "https://www.saarbruecken.de",
  wordFilter: true,
  extraWords: [],
  questionIntervalSec: 30,
  /* 24h-Sperre nach zu vielen WS-Verbindungen derselben IP (Hash) — Standard: aus. */
  ipBlock: false,
  /* White-Label: Anzeigename. Datei pulse.db und Storage-Keys bleiben unverändert. */
  appName: DEFAULT_APP_NAME,
  /* Data-URLs analog Logo — leer = System/Inter bzw. kein Extra. */
  customFont: "",
  slideBackground: "",
  /* CSS-Übergang in der Present-View: none | fade | slide */
  slideTransition: "slide",
  sound: "",
  favicon: "",
  /* Nur Hostname (CNAME-Hinweis in der UI, kein magisches DNS). */
  customDomain: "",
  /* Footer ausblenden; Impressum/Datenschutz bleiben über Hash erreichbar. */
  footerHidden: false,
  /* Präsentationsansicht: Logo/Footer standard AUS (Leinwand ohne Ablenkung). */
  stageShowLogo: false,
  stageShowFooter: false,
  /* Q&A-Countdown-Default: 60 s. 0 = kein vorgewähltes Limit. */
  qaDefaultLimitSec: 60,
  /* Optionales Teamname-Feld beim Join auf der Startseite (Quiz). Standard aus — verwirrt viele Besucher. */
  joinTeamEnabled: false,
};

/**
 * Nur absolute http(s)-Adressen; alles andere (javascript:, relative Pfade, leer) verwerfen.
 * Alte social[]-Einträge werden bewusst nicht übernommen.
 */
function sanitizeHomepageUrl(raw) {
  const url = String(raw || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}

/**
 * Sichtbarer App-Name: kein HTML, begrenzte Länge, Fallback auf den Produktnamen.
 * @param {*} raw
 * @returns {string}
 */
function sanitizeAppName(raw) {
  let s = String(raw == null ? "" : raw)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > 80) s = s.slice(0, 80).trim();
  return s || DEFAULT_APP_NAME;
}

/**
 * Hostname ohne Schema, Pfad und Port. Kein DNS-Lookup — nur Syntax.
 * @param {*} raw
 * @returns {string}
 */
function sanitizeCustomDomain(raw) {
  let s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\s*https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (!s || s.length > 253) return "";
  if (s === "localhost") return "";
  /* Keine IPs, keine Leerzeichen, kein javascript: — nur DNS-Label. */
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s) && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) {
    return "";
  }
  /* Einzel-Label ohne TLD nur intern selten sinnvoll; erlauben für Test-Hosts. */
  if (/[^a-z0-9.-]/.test(s)) return "";
  return s;
}

/**
 * Footer ausblenden nur bei explizitem true.
 * @param {*} raw
 * @returns {boolean}
 */
function sanitizeFooterHidden(raw) {
  return raw === true || raw === 1 || raw === "true" || raw === "1" || raw === "on";
}

/**
 * Bool-Flag für Stage-Chrome. Explizites true, sonst false (Default AUS).
 * @param {*} raw
 * @returns {boolean}
 */
function sanitizeStageFlag(raw) {
  return raw === true || raw === 1 || raw === "true" || raw === "1" || raw === "on";
}

/**
 * Q&A-Standardlimit: 0 = aus, sonst 10–300 in 10er-Schritten. Default 60.
 * @param {*} raw
 * @returns {number}
 */
function sanitizeQaDefaultLimitSec(raw) {
  if (raw === undefined || raw === null || raw === "") return 60;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const stepped = Math.round(n / 10) * 10;
  return Math.max(10, Math.min(300, stepped));
}

/**
 * Folien-Übergang: ausschließlich die drei CSS-Varianten.
 * @param {*} raw
 * @returns {"none"|"fade"|"slide"}
 */
function sanitizeSlideTransition(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "none" || v === "fade" || v === "slide") return v;
  return "slide";
}

/**
 * Data-URL nur wenn Präfix und Längenlimit passen. javascript: und PEMs fliegen raus.
 * @param {*} raw
 * @param {RegExp} prefixRe
 * @param {number} maxChars
 * @returns {{ value: string, error?: string }}
 */
function sanitizeDataUrl(raw, prefixRe, maxChars) {
  const s = String(raw || "");
  if (!s) return { value: "" };
  if (s.length > maxChars) {
    return { value: "", error: "Data-URL überschreitet das harte Größenlimit." };
  }
  if (/BEGIN [A-Z ]*PRIVATE KEY/i.test(s) || /BEGIN CERTIFICATE/i.test(s)) {
    return { value: "" };
  }
  if (!/^data:/i.test(s)) return { value: "" };
  if (/data:\s*text\/html/i.test(s) || /javascript:/i.test(s)) return { value: "" };
  if (/["'<>\\]/.test(s)) return { value: "" };
  if (!prefixRe.test(s)) return { value: "" };
  return { value: s };
}

function sanitizeLogo(raw) {
  return sanitizeDataUrl(
    raw,
    /^data:image\/(png|jpe?g|svg\+xml|webp)(;[^,]*)?,/i,
    MAX_LOGO_CHARS
  );
}

function sanitizeCustomFont(raw) {
  return sanitizeDataUrl(
    raw,
    /^data:(font\/(woff2?|ttf|otf|truetype|opentype)|application\/(font-woff2?|x-font-(woff2?|ttf|truetype|opentype)))(;[^,]*)?,/i,
    MAX_FONT_CHARS
  );
}

function sanitizeSlideBackground(raw) {
  return sanitizeDataUrl(
    raw,
    /^data:image\/(png|jpe?g|svg\+xml|webp|gif)(;[^,]*)?,/i,
    MAX_SLIDE_BG_CHARS
  );
}

function sanitizeSound(raw) {
  return sanitizeDataUrl(
    raw,
    /^data:audio\/(mpeg|mp3|ogg|wav|wave|x-wav|x-pn-wav|webm|vorbis)(;[^,]*)?,/i,
    MAX_SOUND_CHARS
  );
}

function sanitizeFavicon(raw) {
  return sanitizeDataUrl(
    raw,
    /^data:image\/(png|svg\+xml|x-icon|vnd\.microsoft\.icon|webp|gif)(;[^,]*)?,/i,
    MAX_FAVICON_CHARS
  );
}

/**
 * Bekannte Felder säubern. Unbekannte Keys (social, Secrets) werden verworfen.
 * @param {object} [src]
 * @param {{ base?: object }} [opts]  base = aktueller Stand beim Speichern
 * @returns {{ branding: object, error?: string }}
 */
function sanitizeRecord(src = {}, opts = {}) {
  const base = opts.base && typeof opts.base === "object" ? opts.base : SAARBRUECKEN;
  const next = { ...SAARBRUECKEN, ...base };
  delete next.social;
  delete next.allowLocal;
  delete next.secret;
  delete next.adminKey;
  for (const key of Object.keys(SAARBRUECKEN)) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    next[key] = src[key];
  }
  next.homepageUrl = sanitizeHomepageUrl(next.homepageUrl);
  next.appName = sanitizeAppName(next.appName);
  next.customDomain = sanitizeCustomDomain(next.customDomain);
  next.footerHidden = sanitizeFooterHidden(next.footerHidden);
  next.stageShowLogo = sanitizeStageFlag(next.stageShowLogo);
  next.stageShowFooter = sanitizeStageFlag(next.stageShowFooter);
  next.joinTeamEnabled = sanitizeStageFlag(next.joinTeamEnabled);
  next.qaDefaultLimitSec = sanitizeQaDefaultLimitSec(
    Object.prototype.hasOwnProperty.call(src, "qaDefaultLimitSec") ? src.qaDefaultLimitSec : next.qaDefaultLimitSec
  );
  next.slideTransition = sanitizeSlideTransition(next.slideTransition);

  const logo = sanitizeLogo(next.logo);
  next.logo = logo.value;
  const font = sanitizeCustomFont(next.customFont);
  next.customFont = font.value;
  const bgImg = sanitizeSlideBackground(next.slideBackground);
  next.slideBackground = bgImg.value;
  const audio = sanitizeSound(next.sound);
  next.sound = audio.value;
  const icon = sanitizeFavicon(next.favicon);
  next.favicon = icon.value;

  if (!Array.isArray(next.languages) || !next.languages.length) next.languages = ["de"];
  next.languages = next.languages.map((c) => String(c).slice(0, 8)).filter(Boolean);
  next.extraWords = Array.isArray(next.extraWords)
    ? next.extraWords.map((w) => String(w)).filter(Boolean)
    : [];
  next.wordFilter = next.wordFilter !== false && next.wordFilter !== 0 && next.wordFilter !== "false";
  next.ipBlock = next.ipBlock !== false && next.ipBlock !== 0 && next.ipBlock !== "false";
  next.retentionDays = [7, 30, 90, 0].includes(Number(next.retentionDays))
    ? Number(next.retentionDays)
    : 30;
  next.questionIntervalSec = Math.max(10, Math.min(120, Number(next.questionIntervalSec) || 30));
  next.footerText = next.footerText == null ? "" : String(next.footerText);
  next.privacyExtra = next.privacyExtra == null ? "" : String(next.privacyExtra);
  next.impressumUrl = next.impressumUrl == null ? "#/impressum" : String(next.impressumUrl).slice(0, 500);
  next.privacyUrl = next.privacyUrl == null ? "#/privacy" : String(next.privacyUrl).slice(0, 500);

  const error = logo.error || font.error || bgImg.error || audio.error || icon.error;
  return { branding: next, error };
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const { branding } = sanitizeRecord(parsed, { base: SAARBRUECKEN });
    return branding;
  } catch {
    return { ...SAARBRUECKEN };
  }
}

function save(partial) {
  const current = load();
  const incoming = { ...(partial || {}) };
  delete incoming.allowLocal;
  delete incoming.secret;
  delete incoming.adminKey;
  delete incoming.social;
  const { branding: next } = sanitizeRecord(incoming, { base: current });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  load,
  save,
  SAARBRUECKEN,
  DEFAULT_APP_NAME,
  sanitizeHomepageUrl,
  sanitizeAppName,
  sanitizeCustomDomain,
  sanitizeFooterHidden,
  sanitizeStageFlag,
  sanitizeQaDefaultLimitSec,
  sanitizeSlideTransition,
  sanitizeRecord,
  sanitizeLogo,
  sanitizeCustomFont,
  sanitizeSlideBackground,
  sanitizeSound,
  sanitizeFavicon,
  MAX_LOGO_CHARS,
  MAX_FONT_CHARS,
  MAX_SLIDE_BG_CHARS,
  MAX_SOUND_CHARS,
  MAX_FAVICON_CHARS,
};
