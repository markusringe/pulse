/**
 * QR-Code auf Canvas zeichnen — bewährte qrcode-generator-Bibliothek (MIT, Kazuhiko Arase).
 * Ersetzt den früheren Minimal-Encoder, der von vielen Scannern nicht gelesen wurde.
 */

import qrcodeFactory from "./qrcodeLib.js";

/** Zwischenspeicher — gleiche Join-URL muss nicht neu kodiert werden. */
const qrEncodeCache = new Map();
const QR_CACHE_MAX = 64;
/** Ruhezone in Modulen (ISO 18004: mindestens 4). */
const QR_QUIET_MODULES = 4;
/** Mindestgröße eines Moduls in Pixeln — scharfe Kanten auch bei CSS-Skalierung. */
const QR_MODULE_MIN_PX = 6;

/**
 * Matrix für einen Text erzeugen und cachen.
 * @param {string} text — Ziel-URL (z. B. https://host/j/123456)
 * @returns {{ moduleCount: number, isDark: (row: number, col: number) => boolean }}
 */
function encodeQrMatrix(text) {
  let cached = qrEncodeCache.get(text);
  if (cached) return cached;

  const qr = qrcodeFactory(0, "M");
  qr.addData(text, "Byte");
  qr.make();

  const moduleCount = qr.getModuleCount();
  cached = {
    moduleCount,
    isDark: (row, col) => qr.isDark(row, col),
  };

  if (qrEncodeCache.size >= QR_CACHE_MAX) {
    const first = qrEncodeCache.keys().next().value;
    qrEncodeCache.delete(first);
  }
  qrEncodeCache.set(text, cached);
  return cached;
}

/**
 * QR-Code auf ein Canvas-Element rendern (schwarz/weiß, Quiet Zone, scharfe Pixel).
 * @param {HTMLCanvasElement|null} canvas
 * @param {string} text
 */
export function drawQrCode(canvas, text) {
  if (!canvas || !text) return;

  const qr = encodeQrMatrix(text);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const modules = qr.moduleCount + QR_QUIET_MODULES * 2;
  /* Zielauflösung aus HTML-Attribut — clientWidth ist vor dem ersten Paint oft 0. */
  const attrW = Number(canvas.getAttribute("width")) || 0;
  const attrH = Number(canvas.getAttribute("height")) || 0;
  const cssW = canvas.clientWidth || canvas.offsetWidth || 0;
  const targetPx = Math.max(attrW, attrH, cssW, 160);
  const modulePx = Math.max(QR_MODULE_MIN_PX, Math.floor(targetPx / modules));
  const pixelSize = modules * modulePx;

  canvas.width = pixelSize;
  canvas.height = pixelSize;
  canvas.style.width = `${pixelSize}px`;
  canvas.style.height = `${pixelSize}px`;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pixelSize, pixelSize);
  ctx.fillStyle = "#000000";

  for (let row = 0; row < qr.moduleCount; row += 1) {
    for (let col = 0; col < qr.moduleCount; col += 1) {
      if (!qr.isDark(row, col)) continue;
      ctx.fillRect(
        (col + QR_QUIET_MODULES) * modulePx,
        (row + QR_QUIET_MODULES) * modulePx,
        modulePx,
        modulePx
      );
    }
  }
}

/** Cache leeren (Tests). */
export function clearQrCache() {
  qrEncodeCache.clear();
}

/** Join-URL ohne Hash — besser von Handy-Scannern lesbar als #/join/… */
export function joinUrlFromLocation(code) {
  const normalized = String(code || "").replace(/\D/g, "").slice(0, 6);
  if (normalized.length !== 6) return location.href;
  const pathBase = location.pathname.replace(/\/j\/\d{6}\/?$/i, "").replace(/\/$/, "");
  const prefix = pathBase && pathBase !== "/" ? pathBase : "";
  return `${location.origin}${prefix}/j/${normalized}`;
}

/**
 * Join-URL für die Stage-Anzeige verkürzen (Host + Pfad, ohne Schema).
 * @param {string} url
 * @returns {string}
 */
export function formatJoinUrlDisplay(url) {
  try {
    const u = new URL(String(url || ""));
    const host = u.host.replace(/^www\./i, "");
    const path = u.pathname.replace(/\/$/, "") || "";
    return `${host}${path}`;
  } catch {
    return String(url || "")
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
  }
}

/**
 * /j/123456 in Hash-Route umwandeln (nach QR-Scan).
 * @returns {boolean} true wenn umgeleitet wurde
 */
export function absorbPathJoinRoute() {
  const match = location.pathname.match(/\/j\/(\d{6})\/?$/i);
  if (!match) return false;
  const code = match[1];
  const base = location.pathname.replace(/\/j\/\d{6}\/?$/i, "") || "";
  const pathPrefix = base && base !== "/" ? base.replace(/\/$/, "") : "";
  history.replaceState(null, "", `${pathPrefix}/#/join/${code}`);
  location.hash = `#/join/${code}`;
  return true;
}
