#!/usr/bin/env node
/**
 * Branding: Homepage-URL statt Social-Links, White-Label-Sanitizer, gzip ohne Server.
 * Kein Schreiben nach data/branding.json — laufender Server bleibt unberührt.
 */
const fs = require("fs");
const path = require("path");
const {
  SAARBRUECKEN,
  sanitizeHomepageUrl,
  sanitizeAppName,
  sanitizeCustomDomain,
  sanitizeFooterHidden,
  sanitizeQaDefaultLimitSec,
  sanitizeSlideTransition,
  sanitizeRecord,
} = require("../lib/branding");
const { chooseEncoding, shouldCompress, compressBuffer } = require("../lib/compress");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(SAARBRUECKEN.primary === "#007CC1", "Primary = Stadtblau der Live-Website");
assert(SAARBRUECKEN.secondary === "#F99700", "Secondary = Orange-Akzent (.orange)");
assert(SAARBRUECKEN.bg === "#ffffff", "Hintergrund Weiß wie body/Header");
assert(SAARBRUECKEN.text === "#1A171B", "Text = Logo-Wortmarke");
assert(SAARBRUECKEN.appName === "Pulse", "Default App-Name");
assert(SAARBRUECKEN.footerHidden === false, "Footer standard sichtbar");
assert(SAARBRUECKEN.stageShowLogo === false, "Stage-Logo standard aus");
assert(SAARBRUECKEN.stageShowFooter === false, "Stage-Footer standard aus");
assert(SAARBRUECKEN.qaDefaultLimitSec === 60, "Q&A-Default 60 s");
assert(SAARBRUECKEN.homepageUrl === "", "Default Homepage leer (White-Label)");
assert(SAARBRUECKEN.privacyExtra.includes("verantwortlichen"), "privacyExtra generisch");
assert(!Object.prototype.hasOwnProperty.call(SAARBRUECKEN, "social"), "kein social-Array im Preset");

assert(sanitizeHomepageUrl("") === "", "leer bleibt leer");
assert(sanitizeHomepageUrl("   ") === "", "Whitespace bleibt leer");
assert(sanitizeHomepageUrl("javascript:alert(1)") === "", "javascript: verworfen");
assert(sanitizeHomepageUrl("/intern") === "", "relativ verworfen");
assert(sanitizeHomepageUrl("www.saarbruecken.de") === "", "ohne Schema verworfen");
assert(
  sanitizeHomepageUrl("https://www.saarbruecken.de") === "https://www.saarbruecken.de",
  "https bleibt"
);
assert(
  sanitizeHomepageUrl("  http://saarbruecken.de/rathaus  ") === "http://saarbruecken.de/rathaus",
  "http mit Trim"
);

assert(sanitizeAppName("") === "Pulse", "leerer Name → Default");
assert(sanitizeAppName("  ") === "Pulse", "Whitespace-Name → Default");
assert(sanitizeAppName("<b>Rathaus</b>") === "Rathaus", "HTML aus Name");
assert(sanitizeAppName("A".repeat(120)).length === 80, "Name auf 80 Zeichen");
assert(sanitizeAppName("Stadt Session") === "Stadt Session", "gültiger Name");

assert(sanitizeCustomDomain("") === "", "leere Domain");
assert(sanitizeCustomDomain("https://pulse.example.de/pfad") === "pulse.example.de", "Schema/Pfad weg");
assert(sanitizeCustomDomain("javascript:alert(1)") === "", "javascript: Domain");
assert(sanitizeCustomDomain("not a host") === "", "Leerzeichen in Domain");
assert(sanitizeCustomDomain("127.0.0.1") === "", "IP verworfen");
assert(sanitizeCustomDomain("PULSE.Example.DE") === "pulse.example.de", "Hostname lowercase");

assert(sanitizeFooterHidden(true) === true, "footerHidden true");
assert(sanitizeFooterHidden("true") === true, "footerHidden string true");
assert(sanitizeFooterHidden(false) === false, "footerHidden false");
assert(sanitizeFooterHidden("no") === false, "footerHidden other → false");
assert(sanitizeFooterHidden(undefined) === false, "footerHidden unset → false");

assert(sanitizeQaDefaultLimitSec(undefined) === 60, "qaDefault unset → 60");
assert(sanitizeQaDefaultLimitSec(0) === 0, "qaDefault 0 = aus");
assert(sanitizeQaDefaultLimitSec(60) === 60, "qaDefault 60");
assert(sanitizeQaDefaultLimitSec(999) === 300, "qaDefault max 300");

assert(sanitizeSlideTransition("fade") === "fade", "transition fade");
assert(sanitizeSlideTransition("zoom") === "slide", "unbekannte Transition → slide");

const poisoned = sanitizeRecord({
  appName: "<b>Rathaus</b>",
  customDomain: "https://ok.example.de:443/x",
  footerHidden: 1,
  social: [{ url: "https://x" }],
  customFont: "javascript:alert(1)",
  sound: "data:text/html,hi",
});
assert(poisoned.branding.appName === "Rathaus", "sanitizeRecord appName");
assert(poisoned.branding.customDomain === "ok.example.de", "sanitizeRecord domain");
assert(poisoned.branding.footerHidden === true, "sanitizeRecord footerHidden");
assert(poisoned.branding.customFont === "", "kein javascript-Font");
assert(poisoned.branding.sound === "", "kein HTML-Sound");

assert(chooseEncoding("gzip, deflate") === "gzip", "gzip gewählt");
assert(chooseEncoding("br, gzip") === "br", "brotli vor gzip");
assert(chooseEncoding("") === null, "ohne Accept-Encoding keine Kompression");
assert(shouldCompress("application/json; charset=utf-8", 500), "JSON komprimierbar");
assert(!shouldCompress("image/png", 5000), "PNG nicht gzippen");
assert(!shouldCompress("application/json", 20), "kleine Bodies skip");
const gz = compressBuffer(Buffer.from('{"ok":true}'), "gzip");
assert(gz[0] === 0x1f && gz[1] === 0x8b, "gzip-Magic");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
assert(!html.includes("brand-social-mastodon"), "kein Mastodon-Feld");
assert(!html.includes("brand-social-linkedin"), "kein LinkedIn-Feld");
assert(!html.includes("footer-social"), "kein Footer-Social");
assert(!html.includes("fonts.googleapis.com"), "kein Google-Fonts-CDN");
assert(html.includes('id="favicon"'), "Favicon-Link hat #favicon");
assert(html.includes('id="brand-primary"') && html.includes('value="#007CC1"'), "Admin Primary-Default");
assert(html.includes('id="brand-secondary"') && html.includes('value="#F99700"'), "Admin Secondary-Default");
assert(html.includes('id="brand-homepage-url"'), "Homepage-Feld im Branding");
assert(html.includes('id="brand-app-name"'), "App-Name-Feld");
assert(html.includes('id="brand-footer-hidden"'), "Footer-Hidden-Checkbox");
assert(html.includes('id="brand-stage-logo"'), "Stage-Logo-Checkbox");
assert(html.includes('id="view-stage"'), "Präsentationsansicht-View");
assert(html.includes('id="btn-stage-view"'), "Button Präsentationsansicht");
assert(html.includes('id="brand-custom-domain"'), "Domain-Feld");
assert(html.includes('id="footer-home"'), "Footer-Homepage-Nav");
assert(html.includes('id="footer-home-link"'), "Footer-Homepage-Link");
assert(html.includes('rel="noopener noreferrer"'), "rel noopener am Footer-Link");
assert(html.includes('id="legal-hash-link"'), "dezenten Privacy-Link bei Footer aus");

const app = fs.readFileSync(path.join(root, "frontend/js/app.js"), "utf8");
assert(app.includes("homepageUrl"), "app.js speichert homepageUrl");
assert(app.includes("appName"), "app.js White-Label Name");
assert(app.includes("ensureWordCloud"), "Wortwolke lazy");
assert(!app.includes("brand-social"), "app.js ohne Social-Felder");
assert(fs.existsSync(path.join(root, "frontend/js/wordcloud-worker.js")), "wordcloud-worker.js");

const css = fs.readFileSync(path.join(root, "frontend/css/branding.css"), "utf8");
assert(css.includes(".footer-home"), "CSS .footer-home");
assert(!css.includes(".footer-social"), "kein toter .footer-social in branding.css");
const modCss = fs.readFileSync(path.join(root, "frontend/css/moderation.css"), "utf8");
assert(!modCss.includes(".footer-social"), "kein toter .footer-social in moderation.css");

for (const code of ["de", "en", "fr"]) {
  const dict = JSON.parse(fs.readFileSync(path.join(root, "frontend/i18n", `${code}.json`), "utf8"));
  assert(dict["footer.home"], `${code}: footer.home`);
  assert(dict["branding.homepage"], `${code}: branding.homepage`);
  assert(dict["branding.appName"], `${code}: branding.appName`);
  assert(dict["branding.footerHidden"], `${code}: branding.footerHidden`);
  assert(dict["present.stageView"], `${code}: present.stageView`);
  assert(dict["qa.timer.running"], `${code}: qa.timer.running`);
}

/* Live-branding.json: nur Defaults prüfen wenn unverändert (CI/Dev); angepasste Prod-Daten überspringen. */
const brandingPath = path.join(root, "data/branding.json");
if (fs.existsSync(brandingPath)) {
  const live = JSON.parse(fs.readFileSync(brandingPath, "utf8"));
  const isDefaultPalette =
    String(live.primary || "").toLowerCase() === SAARBRUECKEN.primary.toLowerCase() &&
    String(live.secondary || "").toLowerCase() === SAARBRUECKEN.secondary.toLowerCase();
  if (isDefaultPalette) {
    assert(live.bg === SAARBRUECKEN.bg, "data/branding.json bg");
    assert(live.text === SAARBRUECKEN.text, "data/branding.json text");
  }
}

console.log("Branding-Tests OK");
