/**
 * Cache-Busting-URLs aus dem serverseitig injizierten Content-Hash-Manifest.
 * window.__PULSE_ASSET_H__ wird in index.html beim Ausliefern gesetzt (Phase 5).
 */

/**
 * Web-Pfad mit ?h=<content-hash> anreichern, falls im Manifest vorhanden.
 * @param {string} webPath z. B. "/i18n/de.json"
 * @returns {string}
 */
export function assetUrl(webPath) {
  const base = String(webPath || "").replace(/\?[^#]*/g, "");
  if (typeof window !== "undefined" && window.__PULSE_ASSET_H__) {
    const hash = window.__PULSE_ASSET_H__[base];
    if (hash) return `${base}?h=${hash}`;
  }
  return base;
}
