/**
 * Presenter: Vorschau für Sonderfolien (Countdown, Pause, Ende).
 * Hover/Focus öffnet Panel; Escape schließt; Touch: erster Tap öffnet, CTA aktiviert.
 */

import { t, currentLang } from "./i18n.js";
import { renderSpecialSlideInto, stopSpecialSlideCountdown } from "./specialSlides/renderSpecialSlide.js";
import { getSpecialSlideConfig } from "./eventSpecialSlides.js";
import { joinUrlFromLocation, drawQrCode } from "./qrRender.js";

/** @type {HTMLElement | null} */
let panel = null;
/** @type {HTMLElement | null} */
let anchorEl = null;
/** @type {string | null} */
let openKind = null;
/** @type {object | null} */
let ctxRef = null;
/** @type {((ev: KeyboardEvent) => void) | null} */
let onDocKey = null;
/** @type {((ev: PointerEvent) => void) | null} */
let onDocPointer = null;
/** @type {WeakMap<HTMLElement, object>} */
const buttonHooks = new WeakMap();

/**
 * Vorschau an Presenter-Buttons binden (Dock + Folienleiste).
 * @param {HTMLElement | null} scope z. B. #view-present
 * @param {{
 *   getMeta: () => object | null | undefined,
 *   getSessionCode: () => string,
 *   getClockSkew?: () => number,
 *   onShowOnStage: (kind: string) => void,
 * }} ctx
 */
export function bindPresenterSpecialPreviews(scope, ctx) {
  unbindPresenterSpecialPreviews(scope);
  if (!scope || !ctx?.getMeta) return;
  ctxRef = ctx;
  ensurePanel(scope);

  scope.querySelectorAll("[data-pss-kind], .deck-chip-special").forEach((btn) => {
    const kind = btn.getAttribute("data-pss-kind") || btn.className.match(/deck-chip-special--(\w+)/)?.[1];
    if (!kind || kind === "help") return;
    if (btn.disabled) return;

    const onEnter = () => showPreview(btn, kind);
    const onLeave = () => scheduleHidePreview();
    const onFocus = () => showPreview(btn, kind);
    const onBlur = () => scheduleHidePreview();
    const onClickCapture = (ev) => onPreviewTriggerClick(ev, btn, kind);

    btn.addEventListener("mouseenter", onEnter);
    btn.addEventListener("mouseleave", onLeave);
    btn.addEventListener("focus", onFocus);
    btn.addEventListener("blur", onBlur);
    btn.addEventListener("click", onClickCapture, true);

    buttonHooks.set(btn, { onEnter, onLeave, onFocus, onBlur, onClickCapture });
  });

  onDocKey = (ev) => {
    if (ev.key !== "Escape" || !panel?.classList.contains("is-open")) return;
    ev.preventDefault();
    hidePreview(true);
  };
  document.addEventListener("keydown", onDocKey);

  onDocPointer = (ev) => {
    if (!panel?.classList.contains("is-open")) return;
    const target = ev.target;
    if (target instanceof Node && (panel.contains(target) || anchorEl?.contains(target))) return;
    hidePreview(false);
  };
  document.addEventListener("pointerdown", onDocPointer);
}

/**
 * Alle Vorschau-Listener im Scope entfernen.
 * @param {HTMLElement | null} scope
 */
export function unbindPresenterSpecialPreviews(scope) {
  if (scope) {
    scope.querySelectorAll("[data-pss-kind], .deck-chip-special").forEach((btn) => {
      const h = buttonHooks.get(btn);
      if (!h) return;
      btn.removeEventListener("mouseenter", h.onEnter);
      btn.removeEventListener("mouseleave", h.onLeave);
      btn.removeEventListener("focus", h.onFocus);
      btn.removeEventListener("blur", h.onBlur);
      btn.removeEventListener("click", h.onClickCapture, true);
      buttonHooks.delete(btn);
    });
  }
  if (onDocKey) {
    document.removeEventListener("keydown", onDocKey);
    onDocKey = null;
  }
  if (onDocPointer) {
    document.removeEventListener("pointerdown", onDocPointer);
    onDocPointer = null;
  }
  hidePreview(false);
  ctxRef = null;
}

let hidePreviewTimer = null;

function scheduleHidePreview() {
  if (hidePreviewTimer) clearTimeout(hidePreviewTimer);
  hidePreviewTimer = setTimeout(() => {
    if (panel?.matches(":hover")) return;
    hidePreview(false);
  }, 280);
}

function ensurePanel(scope) {
  if (panel?.isConnected) return;
  panel = document.createElement("div");
  panel.id = "presenter-special-preview";
  panel.className = "presenter-special-preview";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.innerHTML = `
    <div class="presenter-special-preview__frame" data-psp-frame></div>
    <footer class="presenter-special-preview__foot">
      <button type="button" class="btn primary presenter-special-preview__cta" data-psp-cta></button>
    </footer>
  `;
  panel.addEventListener("mouseenter", () => {
    if (hidePreviewTimer) clearTimeout(hidePreviewTimer);
  });
  panel.addEventListener("mouseleave", () => scheduleHidePreview());
  panel.querySelector("[data-psp-cta]")?.addEventListener("click", () => {
    const kind = openKind;
    hidePreview(true);
    if (kind && ctxRef?.onShowOnStage) ctxRef.onShowOnStage(kind);
  });
  scope.appendChild(panel);
}

/**
 * @param {HTMLElement} btn
 * @param {string} kind
 */
function showPreview(btn, kind) {
  if (hidePreviewTimer) clearTimeout(hidePreviewTimer);
  const meta = ctxRef?.getMeta?.();
  if (!meta) return;
  if (kind === "countdown" && !getSpecialSlideConfig(meta, "countdown")) return;
  if (kind === "pause" && !getSpecialSlideConfig(meta, "pause")) return;
  if (kind === "end" && !getSpecialSlideConfig(meta, "end")) return;

  ensurePanel(btn.closest("#view-present") || document.body);
  anchorEl = btn;
  openKind = kind;
  btn.setAttribute("aria-expanded", "true");

  const frame = panel.querySelector("[data-psp-frame]");
  const cta = panel.querySelector("[data-psp-cta]");
  if (!frame || !cta) return;

  const code = ctxRef.getSessionCode?.() || "";
  const locale = currentLang() === "en" ? "en-GB" : currentLang() === "fr" ? "fr-FR" : "de-DE";

  renderSpecialSlideInto(frame, kind, meta, {
    variant: "stage",
    t,
    locale,
    getMeta: () => ctxRef?.getMeta?.() || meta,
    getSkew: () => ctxRef?.getClockSkew?.() || 0,
    joinUrl: joinUrlFromLocation(code),
    onQrCanvas: (canvas, url) => drawQrCode(canvas, url),
    showQr: Boolean(meta.showStageQr),
  });

  cta.textContent = t("programControl.previewShowOnStage");
  panel.hidden = false;
  panel.classList.add("is-open");
  positionPanel(btn);
  const kindLabel = t(`programControl.${kind}`);
  panel.setAttribute("aria-label", t("programControl.previewTitle", { kind: kindLabel }));
}

/**
 * @param {boolean} returnFocus
 */
function hidePreview(returnFocus) {
  if (hidePreviewTimer) clearTimeout(hidePreviewTimer);
  if (panel) {
    const frame = panel.querySelector("[data-psp-frame]");
    if (frame) stopSpecialSlideCountdown(frame);
    panel.classList.remove("is-open");
    panel.hidden = true;
  }
  if (anchorEl) {
    anchorEl.setAttribute("aria-expanded", "false");
    if (returnFocus) anchorEl.focus();
  }
  anchorEl = null;
  openKind = null;
}

/**
 * @param {HTMLElement} anchor
 */
function positionPanel(anchor) {
  if (!panel) return;
  const rect = anchor.getBoundingClientRect();
  panel.style.visibility = "hidden";
  panel.hidden = false;
  const pr = panel.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = Math.min(rect.left, window.innerWidth - pr.width - 12);
  if (top + pr.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - pr.height - 8);
  }
  left = Math.max(8, left);
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.visibility = "";
}

/**
 * Touch: erster Tap nur Vorschau; Desktop-Klick auf Chip unverändert.
 * @param {Event} ev
 * @param {HTMLElement} btn
 * @param {string} kind
 */
function onPreviewTriggerClick(ev, btn, kind) {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse && ev.pointerType !== "touch") return;
  if (openKind === kind && panel?.classList.contains("is-open") && anchorEl === btn) return;
  ev.preventDefault();
  ev.stopPropagation();
  showPreview(btn, kind);
}

/** Presenter verlassen — Panel entfernen. */
export function destroyPresenterSpecialPreview() {
  unbindPresenterSpecialPreviews(document.getElementById("view-present"));
  panel?.remove();
  panel = null;
}
