/**
 * Admin-Login-Modal: erscheint beim Klick auf „Administration“ ohne gültige Session.
 */

import { loadAuth, getAuthUser, isAuthEnabled } from "./authClient.js?v=nav37";
import { initLoginForm, disposeLoginForm } from "./adminLoginForm.js?v=nav37";

let dialogEl = null;
/** Verhindert parallele Modals. */
let openPromise = null;

/** Dialog-Element einmalig im DOM anlegen. */
function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement("dialog");
  dialogEl.id = "admin-login-dialog";
  dialogEl.className = "modal admin-login-dialog";
  dialogEl.innerHTML = `
    <div id="admin-login-host" class="admin-login-host"></div>
  `;
  document.body.appendChild(dialogEl);
  dialogEl.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    dialogEl.close("cancel");
  });
  return dialogEl;
}

/**
 * Admin-Anmeldung als Modal anzeigen.
 * @param {string} [targetHash] — Ziel-Route nach erfolgreichem Login (z. B. /admin/branding)
 * @returns {Promise<{ ok: boolean }>}
 */
export async function showAdminLoginModal(targetHash = "/admin") {
  if (!isAuthEnabled()) return { ok: true };

  await loadAuth();
  if (getAuthUser()) return { ok: true };

  if (openPromise) return openPromise;

  const destination = normalizeAdminHash(targetHash);
  const dlg = ensureDialog();
  const host = dlg.querySelector("#admin-login-host");

  openPromise = new Promise((resolve) => {
    /** Ziel nach Login (z. B. E-Mail-Setup nach Bootstrap). */
    let redirectAfterLogin = `#${destination}`;

    const finish = (ok) => {
      disposeLoginForm(host);
      if (host) host.replaceChildren();
      dlg.removeEventListener("close", onClose);
      openPromise = null;
      resolve({ ok, redirectHash: redirectAfterLogin });
    };

    const onClose = () => {
      finish(dlg.returnValue === "ok");
    };

    dlg.addEventListener("close", onClose);

    void initLoginForm(host, {
      title: "Administration anmelden",
      idPrefix: "admin-login-",
      showCancel: true,
      onSuccess: (redirectHash) => {
        redirectAfterLogin = redirectHash || `#${destination}`;
        dlg.close("ok");
      },
      onCancel: () => dlg.close("cancel"),
    }).then(() => {
      if (!dlg.open) dlg.showModal();
      host.querySelector(`#admin-login-email`)?.focus();
    });
  });

  return openPromise;
}

/** Admin-Ziel-Hash normalisieren. */
function normalizeAdminHash(hash) {
  const clean = String(hash || "/admin").replace(/^#/, "") || "/admin";
  if (!clean.startsWith("/admin")) return "/admin";
  return clean;
}

/** Ob das Admin-Login-Modal gerade offen ist. */
export function isAdminLoginModalOpen() {
  return Boolean(dialogEl?.open);
}
