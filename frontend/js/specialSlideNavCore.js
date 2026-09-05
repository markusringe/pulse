/**
 * Gemeinsame Logik für Sonderfolien-Navigation (Presenter-Dock + Stage-FAB).
 * Keine Keyboard-Shortcuts — nur Mausklick.
 */

import { getCurrentSpecialSlide } from "./eventSpecialSlides.js";
import { t } from "./i18n.js";

/** @type {HTMLDialogElement | null} */
let endConfirmDialog = null;

/**
 * Button-Zustände aus eventMeta.currentSpecialSlide setzen.
 * @param {HTMLElement} host
 * @param {object} meta
 * @param {string} [btnSelector]
 */
export function updateSpecialSlideButtons(host, meta, btnSelector = "[data-pss-kind]") {
  const current = getCurrentSpecialSlide({ eventMeta: meta });
  const eventEnded = meta.status === "ended" || current === "end";

  host.querySelectorAll(btnSelector).forEach((btn) => {
    const kind = btn.getAttribute("data-pss-kind");
    const isActive = current === kind;
    btn.classList.toggle("is-active", isActive);
    btn.classList.toggle("is-locked", eventEnded && kind !== "end");
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    btn.disabled = eventEnded && kind !== "end";
    if (eventEnded && kind === "end") {
      btn.classList.add("is-active", "is-confirmed");
      btn.disabled = true;
    }
  });
}

/**
 * Sonderfolie per WebSocket setzen.
 * @param {{
 *   session: object,
 *   emit?: (type: string, payload: object) => boolean | void,
 * }} ctx
 * @param {"countdown"|"pause"|"end"} kind
 * @param {HTMLElement | null} [host]
 */
export function sendSpecialSlideCommand(ctx, kind, host = null) {
  const payload = {
    code: ctx.session.code,
    action: "set_current_special_slide",
    currentSpecialSlide: kind ?? null,
  };
  const sent = ctx.emit?.("event_countdown", payload);
  if (sent !== false && ctx.session.eventMeta) {
    if (kind == null || kind === "") {
      ctx.session.eventMeta.currentSpecialSlide = null;
    } else {
      ctx.session.eventMeta.currentSpecialSlide = kind;
      if (kind === "end") ctx.session.eventMeta.status = "ended";
    }
    if (host) updateSpecialSlideButtons(host, ctx.session.eventMeta);
  }
}

/** Ende-Button: Bestätigungsdialog vor serverseitigem Abschluss. */
export function confirmSpecialSlideEnd(onConfirm) {
  ensureEndConfirmDialog();
  const dialog = endConfirmDialog;
  if (!dialog) {
    if (window.confirm(t("programControl.endConfirmBody"))) onConfirm();
    return;
  }
  dialog.returnValue = "";
  if (!dialog.open) dialog.showModal();
  const onClose = () => {
    dialog.removeEventListener("close", onClose);
    if (dialog.returnValue === "confirm") onConfirm();
  };
  dialog.addEventListener("close", onClose);
}

/**
 * Klick auf Sonderfolien-Button verarbeiten.
 * @param {MouseEvent} ev
 * @param {{
 *   session: object,
 *   emit?: (type: string, payload: object) => boolean | void,
 * } | null} ctx
 * @param {HTMLElement | null} host
 */
export function handleSpecialSlideButtonClick(ev, ctx, host) {
  const btn = ev.target.closest("[data-pss-kind]");
  if (!btn || btn.disabled || !ctx?.session) return;

  const kind = btn.getAttribute("data-pss-kind");
  const meta = ctx.session.eventMeta || {};
  const current = getCurrentSpecialSlide(ctx.session);

  if (kind === "end") {
    if (current === "end" || meta.status === "ended") return;
    confirmSpecialSlideEnd(() => sendSpecialSlideCommand(ctx, "end", host));
    return;
  }

  /* Aktiven Modus erneut klicken → zurück zur regulären Folie. */
  if (current === kind) {
    clearSpecialSlideCommand(ctx, host);
    return;
  }

  sendSpecialSlideCommand(ctx, kind, host);
}

/**
 * Sonderfolie deaktivieren (zurück zur aktiven Folie).
 * @param {{ session: object, emit?: Function }} ctx
 * @param {HTMLElement | null} [host]
 */
export function clearSpecialSlideCommand(ctx, host = null) {
  sendSpecialSlideCommand(ctx, null, host);
}

/**
 * HTML für eine Button-Gruppe erzeugen.
 * @param {{
 *   hasCountdown?: boolean,
 *   hasPause?: boolean,
 *   hasEnd?: boolean,
 *   includeHelp?: boolean,
 *   iconOnly?: boolean,
 *   groupClass?: string,
 *   btnClass?: string,
 * }} opts
 */
export function buildSpecialSlideButtonsHtml(opts) {
  const groupClass = opts.groupClass || "present-special-btns";
  const btnClass = opts.btnClass || "btn ghost present-special-btn";
  const iconOnly = Boolean(opts.iconOnly);
  const parts = [];
  if (opts.hasCountdown) {
    parts.push(specialSlideButtonHtml("countdown", t("programControl.countdown"), iconCountdown(), btnClass, iconOnly));
  }
  if (opts.hasPause) {
    parts.push(specialSlideButtonHtml("pause", t("programControl.pause"), iconPause(), btnClass, iconOnly));
  }
  if (opts.hasEnd) {
    parts.push(specialSlideButtonHtml("end", t("programControl.end"), iconEnd(), btnClass, iconOnly));
  }
  if (opts.includeHelp) {
    parts.push(`
      <button type="button" class="${esc(btnClass)} present-special-help" data-pss-help aria-label="${esc(t("programControl.help"))}">
        <span class="present-special-icon" aria-hidden="true">?</span>
        <span class="present-special-label">${esc(t("programControl.help"))}</span>
      </button>`);
  }
  return `
    <div class="${esc(groupClass)}" role="group" aria-label="${esc(t("programControl.tiles"))}">
      ${parts.join("")}
    </div>`;
}

function specialSlideButtonHtml(kind, label, icon, btnClass, iconOnly = false) {
  const labelClass = iconOnly ? "present-special-label sr-only" : "present-special-label";
  return `
    <button type="button" class="${esc(btnClass)}" data-pss-kind="${esc(kind)}" aria-pressed="false" aria-label="${esc(label)}" title="${esc(label)}">
      <span class="present-special-icon" aria-hidden="true">${icon}</span>
      <span class="${labelClass}">${esc(label)}</span>
    </button>`;
}

function ensureEndConfirmDialog() {
  if (endConfirmDialog) return;
  const dialog = document.createElement("dialog");
  dialog.id = "present-special-end-confirm";
  dialog.className = "admin-dialog present-special-end-confirm";
  dialog.innerHTML = `
    <h2>${esc(t("programControl.endConfirmTitle"))}</h2>
    <p>${esc(t("programControl.endConfirmBody"))}</p>
    <footer class="present-special-end-confirm__actions">
      <button type="button" class="btn ghost" value="cancel">${esc(t("programControl.endConfirmCancel"))}</button>
      <button type="button" class="btn primary" value="confirm">${esc(t("programControl.endConfirmOk"))}</button>
    </footer>
  `;
  dialog.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[value]");
    if (!btn) return;
    dialog.returnValue = btn.value;
    dialog.close();
  });
  document.body.append(dialog);
  endConfirmDialog = dialog;
}

function iconCountdown() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
}

function iconPause() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="7" y="6" width="3" height="12" rx="0.5"/><rect x="14" y="6" width="3" height="12" rx="0.5"/></svg>`;
}

function iconEnd() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4 10-11"/></svg>`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
