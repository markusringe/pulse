#!/usr/bin/env node
/**
 * Theme-Logik und WCAG-Kontraste der Light/Dark-Tokens.
 * Light ist Default; nur gespeichertes „dark“ schaltet Dark ein.
 * Markenfarben: Stadtblau #007cc1 und Orange-Akzent #f99700 (saarbruecken.de).
 */

const { pathToFileURL } = require("url");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, "../frontend/js/theme.js")).href);
  const { resolveStoredTheme, contrastRatio, pickOnColor, parseColor } = mod;

  assert(resolveStoredTheme(null) === "light", "null → light");
  assert(resolveStoredTheme(undefined) === "light", "undefined → light");
  assert(resolveStoredTheme("") === "light", "leer → light");
  assert(resolveStoredTheme("light") === "light", "light bleibt light");
  assert(resolveStoredTheme("auto") === "light", "auto ist ungültig → light");
  assert(resolveStoredTheme("system") === "light", "system ist ungültig → light");
  assert(resolveStoredTheme("DARK") === "light", "Großschreibung zählt nicht");
  assert(resolveStoredTheme("dark") === "dark", "nur exakt dark schaltet Dark");

  assert(parseColor("#07c") === "#0077cc", "Kurzhex");
  assert(parseColor("#007cc1") === "#007cc1", "Langhex Stadtblau");
  assert(parseColor("rgb(0, 124, 193)") === "#007cc1", "rgb() Stadtblau");

  const pairs = [
    ["#1a1d23", "#ffffff", 4.5, "ink on white"],
    ["#1a1d23", "#f4f6f8", 4.5, "ink on page"],
    ["#3d4450", "#ffffff", 4.5, "muted on white"],
    ["#4a5568", "#ffffff", 4.5, "placeholder on white"],
    ["#ffffff", "#007cc1", 4.5, "white on Stadtblau-Primary"],
    ["#0052cc", "#ffffff", 4.5, "link-fallback on white"],
    ["#007cc1", "#ffffff", 4.5, "Stadtblau as link on white"],
    ["#1a171b", "#ffffff", 4.5, "Logo-Schwarz on white"],
    ["#1a1d23", "#f99700", 4.5, "ink on Orange-Akzent"],
    ["#6b7280", "#ffffff", 3, "border on white"],
    ["#e8eaed", "#1c2128", 4.5, "dark ink on bg"],
    ["#c5cad3", "#1c2128", 4.5, "dark muted on bg"],
    ["#7eb6ff", "#1c2128", 4.5, "dark link on bg"],
    ["#1a1d23", "#7eb6ff", 4.5, "dark button text"],
    ["#9aa3b0", "#1c2128", 3, "dark border"],
    ["#ffffff", "#b42318", 4.5, "poll c1 light"],
    ["#1a1d23", "#ffd166", 4.5, "poll yellow dark"],
    ["#007cc1", "#1c2128", 3, "Stadtblau vs Dark-BG (UI)"],
  ];

  for (const [fg, bg, min, name] of pairs) {
    const r = contrastRatio(fg, bg);
    assert(r >= min, `${name}: ${r.toFixed(2)} < ${min}`);
  }

  /* Warmes Orange der Stadtseite — wie früher Gelb nie als Text auf Weiß. */
  const accentAsText = contrastRatio("#f99700", "#ffffff");
  assert(accentAsText < 4.5, "Orange-Akzent auf Weiß muss als Text durchfallen");

  const onAccent = pickOnColor("#f99700");
  assert(onAccent.color === "#1a1d23", "Orange-Fläche bekommt dunklen Text");
  assert(onAccent.pass, "dunkler Text auf Orange erfüllt AA");

  const onPrimary = pickOnColor("#007cc1");
  assert(onPrimary.color === "#ffffff", "Primary bekommt weißen Text");
  assert(onPrimary.pass, "weiß auf Stadtblau erfüllt AA");

  const primaryLinkOnPage = contrastRatio("#007cc1", "#f4f6f8");
  assert(primaryLinkOnPage < 4.5, "Stadtblau als Link auf Seiten-Grau fällt durch (Theme-Link bleibt)");

  const primaryOnDark = contrastRatio("#007cc1", "#1c2128");
  assert(primaryOnDark >= 3, "Stadtblau erfüllt UI-Kontrast auf Dark-BG");
  assert(primaryOnDark < 4.5, "Stadtblau als Link-Text auf Dark fällt durch");

  console.log("Theme-Tests OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
