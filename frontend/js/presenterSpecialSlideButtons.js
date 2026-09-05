/**
 * Sonderfolien-Steuerung in der Presenter-Dock-Leiste:
 * Countdown, Pause, Ende — Ghost-Buttons mit Icon, Zustände via event_meta.
 */

import { getSpecialSlideConfig, getCurrentSpecialSlide } from "./eventSpecialSlides.js";
import { openPresenterHelpModal } from "./presenterHelpModal.js";
import { t } from "./i18n.js";

/** @type {{
 *   host: HTMLElement | null,
 *   ctx: object | null,
 *   listenersBound: boolean,
 *   confirmDialog: HTMLDialogElement | null,
 * }} */
const state = {
  host: null,
  ctx: null,
  listenersBound: false,
  confirmDialog: null,
};

/**
 * Sonderfolien-Buttons in der Dock-Leiste synchronisieren.
 * @param {HTMLElement | null} host
 * @param {{
 *   session: object,
 *   emit?: (type: string, payload: object) => void,
 * }} ctx
 */
export function syncPresenterSpecialSlideButtons(host, ctx) {
  if (!host || !ctx?.session?.eventId) {
    teardown(host);
    return;
  }

  const meta = ctx.session.eventMeta || {};
  const hasCountdown = Boolean(meta.startTime);
  const hasPause = Boolean(getSpecialSlideConfig(meta, "pause"));
  const hasEnd = Boolean(getSpecialSlideConfig(meta, "end"));
  if (!hasCountdown && !hasPause && !hasEnd) {
    teardown(host);
    return;
  }

  state.host = host;
  state.ctx = ctx;

  if (!host.querySelector(".present-special-btns")) {
    mountShell(host, { hasCountdown, hasPause, hasEnd });
  }
  updateSpecialSlideButtons(host, meta);
  host.hidden = false;
}

/** @deprecated Alias für Abwärtskompatibilität. */
export const syncPresenterProgramControl = syncPresenterSpecialSlideButtons;

export function destroyPresenterSpecialSlideButtons() {
  teardown(state.host);
}

/** @deprecated */
export const destroyPresenterProgramControl = destroyPresenterSpecialSlideButtons;

function teardown(host) {
  if (host) {
    host.hidden = true;
    host.replaceChildren();
  }
  state.host = null;
  state.ctx = null;
}

function mountShell(host, opts) {
  host.innerHTML = `
    <div class="present-special-btns" role="group" aria-label="${esc(t("programControl.tiles"))}">
      ${
        opts.hasCountdown
          ? buttonHtml("countdown", t("programControl.countdown"), iconCountdown())
          : ""
      }
      ${opts.hasPause ? buttonHtml("pause", t("programControl.pause"), iconPause()) : ""}
      ${opts.hasEnd ? buttonHtml("end", t("programControl.end"), iconEnd()) : ""}
      <button type="button" class="btn ghost present-special-btn present-special-help" data-pss-help aria-label="${esc(t("programControl.help"))}">
        <span class="present-special-icon" aria-hidden="true">?</span>
        <span class="present-special-label">${esc(t("programControl.help"))}</span>
      </button>
    </div>
  `;

  if (!state.listenersBound) {
    host.addEventListener("click", onHostClick);
    state.listenersBound = true;
  }
}

function buttonHtml(kind, label, icon) {
  return `
    <button type="button" class="btn ghost present-special-btn" data-pss-kind="${esc(kind)}" aria-pressed="false">
      <span class="present-special-icon" aria-hidden="true">${icon}</span>
      <span class="present-special-label">${esc(label)}</span>
    </button>`;
}

/**
 * Button-Zustände aus eventMeta.currentSpecialSlide setzen.
 * @param {HTMLElement} host
 * @param {object} meta
 */
export function updateSpecialSlideButtons(host, meta) {
  const current = getCurrentSpecialSlide({ eventMeta: meta });
  const eventEnded = meta.status === "ended" || current === "end";

  host.querySelectorAll("[data-pss-kind]").forEach((btn) => {
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

function onHostClick(ev) {
  if (ev.target.closest("[data-pss-help]")) {
    void openPresenterHelpModal();
    return;
  }

  const btn = ev.target.closest("[data-pss-kind]");
  if (!btn || btn.disabled) return;

  const kind = btn.getAttribute("data-pss-kind");
  const ctx = state.ctx;
  if (!ctx?.session || !kind) return;

  const meta = ctx.session.eventMeta || {};
  const current = getCurrentSpecialSlide(ctx.session);

  if (kind === "end") {
    if (current === "end" || meta.status === "ended") return;
    void confirmEnd(() => sendSpecialSlide(ctx, "end"));
    return;
  }

  if (current === kind) return;

  sendSpecialSlide(ctx, kind);
}

function sendSpecialSlide(ctx, kind) {
  const payload = {
    code: ctx.session.code,
    action: "set_current_special_slide",
    currentSpecialSlide: kind,
  };
  const sent = ctx.emit?.("event_countdown", payload);
  if (sent !== false && ctx.session.eventMeta) {
    ctx.session.eventMeta.currentSpecialSlide = kind;
    if (kind === "end") ctx.session.eventMeta.status = "ended";
    if (state.host) updateSpecialSlideButtons(state.host, ctx.session.eventMeta);
  }
}

/** Ende-Button: Bestätigungsdialog vor serverseitigem Abschluss. */
function confirmEnd(onConfirm) {
  ensureConfirmDialog();
  const dialog = state.confirmDialog;
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

function ensureConfirmDialog() {
  if (state.confirmDialog) return;
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
  state.confirmDialog = dialog;
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
