/**
 * Web-Worker für Wortwolken: Zählung + Packing.
 * Wird erst erzeugt, wenn eine Wortwolken-Folie aktiv ist (kein Start-Overhead).
 * Zeichnen bleibt im Main-Thread (Canvas 2D / Theme-Tokens).
 */
import { normalizeEntries, packWords, MAX_CLOUD_WORDS } from "./wordcloud-layout.js";

self.onmessage = (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "count") {
      const list = normalizeEntries(msg.entries).slice(0, MAX_CLOUD_WORDS);
      self.postMessage({ type: "count", id: msg.id, list });
      return;
    }
    if (msg.type === "layout") {
      const w = Number(msg.width) || 0;
      const h = Number(msg.height) || 0;
      if (w < 8 || h < 8) {
        self.postMessage({ type: "layout", id: msg.id, placed: [] });
        return;
      }
      const placed = packWords(msg.words || [], w, h);
      self.postMessage({ type: "layout", id: msg.id, placed });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, message: String(err && err.message ? err.message : err) });
  }
};
