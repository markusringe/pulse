/**
 * Presenter-Hilfe-Modal — rollengefilterte Artikel ohne Navigation weg von #/present.
 */

import { loadPresenterHelpArticles } from "./help.js";
import { t } from "./i18n.js";

/** @type {HTMLDialogElement | null} */
let dialog = null;
/** @type {HTMLElement | null} */
let lastFocus = null;

/**
 * Modal mit Hilfe-Artikeln öffnen (Escape schließt, Fokus-Falle).
 */
export async function openPresenterHelpModal() {
  ensureDialog();
  if (!dialog) return;

  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const body = dialog.querySelector("[data-phm-body]");
  const status = dialog.querySelector("[data-phm-status]");
  if (body) body.innerHTML = `<p class="muted">${esc(t("programControl.helpLoading"))}</p>`;
  if (status) status.textContent = "";

  if (!dialog.open) dialog.showModal();

  try {
    const { articles, role } = await loadPresenterHelpArticles();
    if (status) status.textContent = t("programControl.helpRole", { role: role || "presenter" });
    if (!body) return;
    if (!articles.length) {
      body.innerHTML = `<p class="muted">${esc(t("programControl.helpEmpty"))}</p>`;
      return;
    }
    body.innerHTML = `<ul class="presenter-help-list">${articles
      .map(
        (a) => `
        <li>
          <a href="#/help/${esc(a.slug || "")}" data-phm-link>${esc(a.title || a.slug || "")}</a>
          ${a.summary ? `<p class="muted">${esc(a.summary)}</p>` : ""}
        </li>`
      )
      .join("")}</ul>`;
  } catch {
    if (body) body.innerHTML = `<p class="muted">${esc(t("programControl.helpError"))}</p>`;
  }

  dialog.querySelector("[data-phm-close]")?.focus();
}

function ensureDialog() {
  if (dialog) return;
  dialog = document.createElement("dialog");
  dialog.id = "presenter-help-modal";
  dialog.className = "presenter-help-modal admin-dialog";
  dialog.setAttribute("aria-labelledby", "presenter-help-title");
  dialog.innerHTML = `
    <header class="presenter-help-head">
      <h2 id="presenter-help-title">${esc(t("programControl.helpTitle"))}</h2>
      <button type="button" class="icon-btn" data-phm-close aria-label="${esc(t("programControl.helpClose"))}">×</button>
    </header>
    <p class="muted" data-phm-status role="status"></p>
    <div data-phm-body class="presenter-help-body"></div>
    <footer class="presenter-help-foot">
      <button type="button" class="btn ghost" data-phm-close>${esc(t("programControl.helpClose"))}</button>
      <a class="btn primary" href="#/help" data-phm-full>${esc(t("programControl.helpFull"))}</a>
    </footer>
  `;

  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    lastFocus?.focus();
    lastFocus = null;
  });
  dialog.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll("button, a, input, [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.hidden && !el.disabled
    );
    if (focusable.length < 2) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  dialog.addEventListener("click", (ev) => {
    const closeBtn = ev.target.closest("[data-phm-close]");
    if (closeBtn) {
      dialog?.close();
      return;
    }
    const link = ev.target.closest("[data-phm-link]");
    if (link) {
      dialog?.close();
      location.hash = link.getAttribute("href")?.replace(/^#/, "#") || "#/help";
    }
  });

  document.body.append(dialog);
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
