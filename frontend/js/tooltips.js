/**
 * Zugängliche Tooltips ohne Popper.js.
 * Position: getBoundingClientRect + CSS (fixed Layer am document.body).
 * Desktop: Hover/Focus. Mobil: erster Tap zeigt, zweiter Tap oder Außenklick schließt.
 */

const LAYER_ID = "help-tooltip-layer";

/** @type {HTMLElement | null} */
let currentAnchor = null;

/**
 * Feste Texte für wichtige Steuerelemente (IDs aus index.html).
 * title-Attribute werden entfernt, damit nicht zwei Blasen erscheinen.
 */
const BY_ID = {
  "create-type": "Fragetyp der ersten Folie: Umfrage, Wortwolke, Q&A, Quiz, Skala oder Demo.",
  "panic-button": "Notfall: Bühne abdunkeln, bis Sie fortsetzen. Kein Stummschalten des Tons.",
  "btn-moderation": "Q&A-Beiträge freigeben oder verstecken.",
  "btn-results": "Auswertung ein- oder ausblenden. Taste R macht dasselbe.",
  "btn-prev": "Vorherige Folie. Taste: Pfeil links.",
  "btn-next": "Nächste Folie. Taste: Pfeil rechts oder Leertaste (nicht im Quiz).",
  "btn-copy-link": "Teilnahme-Link inkl. Join-Code in die Zwischenablage.",
  "btn-theme": "Hell- und Dunkelmodus tauschen. Taste T auf der Bühne.",
  "btn-theme-join": "Hell- und Dunkelmodus tauschen.",
  "btn-theme-home": "Hell- und Dunkelmodus tauschen.",
  "btn-admin-home": "Administration: Sessions anlegen und Einstellungen.",
  "btn-theme-admin": "Hell- und Dunkelmodus tauschen.",
  "join-reactions": "Kurze Reaktionen — sie schweben auf der Leinwand und werden nicht gespeichert.",
  "connection-status": "Live-Verbindung zur Session. „Verbinde …“ heißt: automatischer Neuversuch.",
  "btn-reset": "Ergebnisse der aktuellen Folie leeren — nicht die ganze Session löschen.",
};

const SSL_STATUS = {
  active: "Zertifikat ist gültig. HTTPS kann genutzt werden.",
  pending: "Antrag läuft. Die Liste aktualisiert sich von selbst.",
  error: "Beantragung fehlgeschlagen. Meldung unter dem Badge lesen.",
  expired: "Zertifikat abgelaufen — erneuern oder neu beantragen.",
};

let bound = false;

/**
 * Tooltips aktivieren. Mehrfachaufruf ist harmlos.
 */
export function bindTooltips() {
  applyStaticTips();
  if (bound) return;
  bound = true;
  ensureLayer();
  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

function applyStaticTips() {
  for (const [id, text] of Object.entries(BY_ID)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.setAttribute("data-tooltip", text);
    el.removeAttribute("title");
  }
  const reactions = document.getElementById("join-reactions");
  if (reactions) {
    for (const btn of reactions.querySelectorAll("button")) {
      if (!btn.getAttribute("data-tooltip")) {
        btn.setAttribute("data-tooltip", "Reaktion an die Leinwand senden (wird nicht gespeichert).");
      }
    }
  }
}

function ensureLayer() {
  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.className = "help-tooltip-layer";
    layer.setAttribute("role", "tooltip");
    layer.hidden = true;
    document.body.append(layer);
  }
  return layer;
}

function findTipTarget(node) {
  const el = node instanceof Element ? node : node?.parentElement;
  const hit = el?.closest("[data-tooltip], .ssl-status");
  if (!hit) return null;
  if (hit.classList.contains("ssl-status") && !hit.getAttribute("data-tooltip")) {
    const status = hit.getAttribute("data-status") || "";
    const text = SSL_STATUS[status];
    if (text) hit.setAttribute("data-tooltip", text);
  }
  return hit.getAttribute("data-tooltip") ? hit : null;
}

function onPointerOver(ev) {
  if (matchMedia("(hover: none)").matches) return;
  const t = findTipTarget(ev.target);
  if (t) show(t);
}

function onFocusIn(ev) {
  const t = findTipTarget(ev.target);
  if (t) show(t);
  else if (!document.getElementById(LAYER_ID)?.contains(ev.target)) hide();
}

function onPointerDown(ev) {
  const t = findTipTarget(ev.target);
  if (matchMedia("(hover: none)").matches) {
    if (t) {
      if (currentAnchor === t) hide();
      else show(t);
      return;
    }
    hide();
    return;
  }
  if (!t) hide();
}

function onKey(ev) {
  if (ev.key === "Escape") hide();
}

/**
 * Tooltip am Anker zeigen und per CSS/Koordinaten am Viewport ausrichten.
 * @param {HTMLElement} anchor
 */
export function show(anchor) {
  const text = anchor?.getAttribute("data-tooltip");
  if (!text) return;
  const layer = ensureLayer();
  layer.textContent = text;
  layer.hidden = false;
  const id = LAYER_ID;
  if (currentAnchor && currentAnchor !== anchor) {
    currentAnchor.removeAttribute("aria-describedby");
  }
  currentAnchor = anchor;
  anchor.setAttribute("aria-describedby", id);
  place(anchor, layer);
}

function place(anchor, layer) {
  const r = anchor.getBoundingClientRect();
  layer.style.left = "0px";
  layer.style.top = "0px";
  const b = layer.getBoundingClientRect();
  let top = r.bottom + 8;
  let left = r.left + r.width / 2 - b.width / 2;
  if (top + b.height > window.innerHeight - 8) top = r.top - b.height - 8;
  if (top < 8) top = 8;
  if (left < 8) left = 8;
  if (left + b.width > window.innerWidth - 8) left = window.innerWidth - b.width - 8;
  layer.style.top = `${Math.round(top)}px`;
  layer.style.left = `${Math.round(left)}px`;
}

export function hide() {
  const layer = document.getElementById(LAYER_ID);
  if (layer) layer.hidden = true;
  if (currentAnchor) currentAnchor.removeAttribute("aria-describedby");
  currentAnchor = null;
}
