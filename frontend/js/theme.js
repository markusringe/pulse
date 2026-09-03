/**
 * Theme-Auflösung und Kontrastschutz für Branding.
 *
 * Light ist immer der Standard. Dark wird ausschließlich gesetzt, wenn
 * localStorage den Wert „dark“ enthält — niemals automatisch per System-Dark.
 */

export const THEME_KEY = "pulse-theme";

/** AA-Grenzen nach WCAG 2.1 */
const AA_TEXT = 4.5;
const AA_UI = 3;

/**
 * Ungültige, leere oder fehlende Werte ergeben Light — nie Dark.
 * @param {string | null} saved
 * @returns {"light" | "dark"}
 */
export function resolveStoredTheme(saved) {
  return saved === "dark" ? "dark" : "light";
}

/** Liest die Preference; bei Storage-Fehlern (Privatmodus) bleibt Light. */
export function readStoredTheme() {
  try {
    return resolveStoredTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

/**
 * Setzt data-theme, color-scheme und Theme-Switcher-Beschriftung.
 * @param {"light" | "dark" | string} theme
 */
export function applyDocumentTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  root.setAttribute("data-theme", next);
  root.style.colorScheme = next;
  syncThemeControls(next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    meta.content = bg || (next === "dark" ? "#1c2128" : "#f4f6f8");
  }
}

/**
 * Speichert die Wahl und wendet sie an.
 * @param {"light" | "dark" | string} theme
 */
export function persistTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* localStorage kann in privaten Fenstern fehlen */
  }
  applyDocumentTheme(next);
}

/** Wechselt Light ↔ Dark und gibt das neue Theme zurück. */
export function toggleDocumentTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  persistTheme(next);
  return next;
}

/** Beim Start: gespeichertes Dark oder Light-Default, dann Controls syncen. */
export function initTheme() {
  applyDocumentTheme(readStoredTheme());
  applyBrandingContrast();
}

/**
 * Sonne/Mond-Buttons: aria-pressed = Dark aktiv, Label beschreibt die nächste Aktion.
 * @param {"light" | "dark"} theme
 */
export function syncThemeControls(theme) {
  const dark = theme === "dark";
  const label = dark ? "Helles Design aktivieren" : "Dunkles Design aktivieren";
  const title = dark ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln";
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.setAttribute("aria-label", label);
    btn.title = title;
  });
}

/**
 * Hex-Farbe aus CSS-Wert (#rgb, #rrggbb) oder rgb()/rgba() parsen.
 * @param {string} raw
 * @returns {string | null} kanonisches #rrggbb in Kleinbuchstaben
 */
export function parseColor(raw) {
  if (!raw) return null;
  const value = String(raw).trim().toLowerCase();
  const hex3 = /^#([0-9a-f]{3})$/i.exec(value);
  if (hex3) {
    const [r, g, b] = hex3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const hex6 = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex6) return `#${hex6[1]}`;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
  if (rgb) {
    const toHex = (n) => Number(n).toString(16).padStart(2, "0");
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
  }
  return null;
}

/**
 * Relative Luminanz nach WCAG 2.1 (sRGB).
 * @param {string} color
 * @returns {number}
 */
export function relativeLuminance(color) {
  const hex = parseColor(color);
  if (!hex) return 0;
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/**
 * Kontrastverhältnis zweier Farben (WCAG).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Wählt Weiß oder Dunkelgrau als Textfarbe auf einer Fläche — was den höheren Kontrast hat.
 * @param {string} bg
 * @returns {{ color: string, ratio: number, pass: boolean }}
 */
export function pickOnColor(bg) {
  const white = contrastRatio("#ffffff", bg);
  const dark = contrastRatio("#1a1d23", bg);
  const useWhite = white >= dark;
  const ratio = useWhite ? white : dark;
  return { color: useWhite ? "#ffffff" : "#1a1d23", ratio, pass: ratio >= AA_TEXT };
}

/**
 * Branding-Farben auf das aktive Theme mappen, ohne WCAG zu unterschreiten.
 * Zu helle/dunkle Markenfarben fallen auf die Theme-Tokens zurück.
 */
export function applyBrandingContrast() {
  const root = document.documentElement;
  const isDark = root.getAttribute("data-theme") === "dark";
  const cs = getComputedStyle(root);
  const primary = parseColor(cs.getPropertyValue("--primary-color"));
  const secondary = parseColor(cs.getPropertyValue("--secondary-color"));
  const brandBg = parseColor(cs.getPropertyValue("--bg-color"));
  const brandText = parseColor(cs.getPropertyValue("--text-color"));
  const pageBg = parseColor(cs.getPropertyValue("--bg")) || (isDark ? "#1c2128" : "#f4f6f8");

  /* Primärbutton: Markenfarbe nur wenn Text AA und Fläche vs. Seite ≥ 3:1 */
  if (primary) {
    const on = pickOnColor(primary);
    const vsPage = contrastRatio(primary, pageBg);
    if (on.pass && vsPage >= AA_UI) {
      root.style.setProperty("--btn-primary-bg", primary);
      root.style.setProperty("--btn-primary-ink", on.color);
    } else {
      root.style.removeProperty("--btn-primary-bg");
      root.style.removeProperty("--btn-primary-ink");
    }
    /* Links: Primär nur, wenn sie als Text auf dem Seitenhintergrund AA erfüllen */
    if (contrastRatio(primary, pageBg) >= AA_TEXT) {
      root.style.setProperty("--link", primary);
      /* Hover: Stadt-Blau abgedunkelt #005B8E (CSS .button:hover / .no_theme). */
      if (!isDark && contrastRatio("#005B8E", pageBg) >= AA_TEXT) {
        root.style.setProperty("--link-hover", "#005B8E");
      } else {
        root.style.removeProperty("--link-hover");
      }
    } else {
      root.style.removeProperty("--link");
      root.style.removeProperty("--link-hover");
    }
  }

  /* Akzent (Orange/Gelb) nie als Textfarbe — nur Fläche plus dunkler/weißer Text */
  if (secondary) {
    const onSec = pickOnColor(secondary);
    root.style.setProperty("--accent-surface", secondary);
    root.style.setProperty("--accent-surface-ink", onSec.pass ? onSec.color : "#1a1d23");
  }

  /*
   * Marken-Hintergrund und -Text nur übernehmen, wenn
   * 1) der Kontrast untereinander AA erfüllt und
   * 2) die Fläche zum aktuellen Theme passt (helles Branding nicht im Dark Mode).
   */
  if (brandBg && brandText && contrastRatio(brandText, brandBg) >= AA_TEXT) {
    const bgIsLight = relativeLuminance(brandBg) > 0.4;
    if (isDark !== bgIsLight) {
      root.style.setProperty("--bg", brandBg);
      root.style.setProperty("--ink", brandText);
    } else {
      root.style.removeProperty("--bg");
      root.style.removeProperty("--ink");
    }
  } else {
    root.style.removeProperty("--bg");
    root.style.removeProperty("--ink");
  }
  applySlideScrim();
}

const SYSTEM_FONT_STACK = '"Inter", system-ui, "Segoe UI", -apple-system, "Avenir Next", sans-serif';

/**
 * Eigene woff2/woff/ttf als @font-face. Fehler dürfen die App nicht crashen.
 * Ohne Upload bleibt --font der System-/Inter-Stack aus typography.css.
 * @param {string} [dataUrl]
 */
export function applyCustomFont(dataUrl) {
  const root = document.documentElement;
  let tag = document.getElementById("brand-font-face");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "brand-font-face";
    document.head.append(tag);
  }
  if (!dataUrl) {
    tag.textContent = "";
    root.style.removeProperty("--font");
    return;
  }
  try {
    const fmt = fontFormatFromDataUrl(dataUrl);
    tag.textContent = `@font-face{font-family:"PulseCustom";src:url("${dataUrl}") format("${fmt}");font-display:swap;font-weight:100 900;}`;
    root.style.setProperty("--font", `"PulseCustom", ${SYSTEM_FONT_STACK}`);
  } catch {
    tag.textContent = "";
    root.style.removeProperty("--font");
  }
}

function fontFormatFromDataUrl(url) {
  const s = String(url || "").toLowerCase();
  if (s.includes("woff2")) return "woff2";
  if (s.includes("woff")) return "woff";
  if (s.includes("otf") || s.includes("opentype")) return "opentype";
  if (s.includes("ttf") || s.includes("truetype")) return "truetype";
  return "woff2";
}

/**
 * Folien-Hintergrund als CSS-Variable + Kontrast-Scrim (WCAG).
 * @param {string} [dataUrl]
 */
export function applySlideBackground(dataUrl) {
  const root = document.documentElement;
  if (!dataUrl) {
    root.style.removeProperty("--slide-bg-image");
    document.body.classList.remove("has-slide-bg");
    applySlideScrim();
    return;
  }
  try {
    root.style.setProperty("--slide-bg-image", `url("${dataUrl}")`);
    document.body.classList.add("has-slide-bg");
    applySlideScrim();
  } catch {
    root.style.removeProperty("--slide-bg-image");
    document.body.classList.remove("has-slide-bg");
    applySlideScrim();
  }
}

/**
 * Dunkle oder helle Overlay-Fläche, damit Folientext nicht im Foto untergeht.
 * Join bekommt denselben Scrim dezenter (--join-bg-scrim).
 */
export function applySlideScrim() {
  const root = document.documentElement;
  if (!document.body.classList.contains("has-slide-bg")) {
    root.style.removeProperty("--slide-bg-scrim");
    root.style.removeProperty("--join-bg-scrim");
    return;
  }
  const isDark = root.getAttribute("data-theme") === "dark";
  const cs = getComputedStyle(root);
  const brandBg = parseColor(cs.getPropertyValue("--bg-color")) || parseColor(cs.getPropertyValue("--bg"));
  const darkSurface = brandBg ? relativeLuminance(brandBg) < 0.4 : isDark;
  if (isDark || darkSurface) {
    root.style.setProperty("--slide-bg-scrim", "rgba(12, 16, 22, 0.62)");
    root.style.setProperty("--join-bg-scrim", "rgba(12, 16, 22, 0.32)");
  } else {
    root.style.setProperty("--slide-bg-scrim", "rgba(255, 255, 255, 0.78)");
    root.style.setProperty("--join-bg-scrim", "rgba(255, 255, 255, 0.48)");
  }
}
