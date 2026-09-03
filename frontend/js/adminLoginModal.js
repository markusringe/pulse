/**
 * Admin-Login-Modal: erscheint beim Klick auf „Administration“ ohne gültige Session.
 * Firefox: showModal() muss in der User-Geste erfolgen — Dialog daher sofort öffnen.
 */

import { loadAuth, getAuthUser, isAuthEnabled } from "./authClient.js?v=nav47";
import { initLoginForm, disposeLoginForm } from "./adminLoginForm.js?v=nav47";

const ADMIN_REDIRECT_KEY = "pulse:admin-redirect";

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
 * Modal sofort sichtbar machen (sync, innerhalb der Klick-Geste).
 * @returns {boolean}
 */
function openDialogSync(host) {
  const dlg = ensureDialog();
  if (dlg.open) return true;
  if (host) host.innerHTML = `<p class="muted login-loading">Anmeldung wird geladen …</p>`;
  try {
    dlg.showModal();
    return true;
  } catch (err) {
    console.warn("[admin-login] showModal fehlgeschlagen — Fallback Vollseite", err);
    return false;
  }
}

/** Ziel-Route für Redirect nach Login merken. */
export function rememberAdminRedirect(targetHash) {
  const clean = normalizeAdminHash(targetHash);
  try {
    sessionStorage.setItem(ADMIN_REDIRECT_KEY, `#${clean}`);
  } catch {
    /* Webview ohne sessionStorage */
  }
}

/** Gespeicherte Admin-Zielroute lesen und löschen. */
export function consumeAdminRedirect(fallback = "#/admin/events") {
  try {
    const stored = sessionStorage.getItem(ADMIN_REDIRECT_KEY);
    sessionStorage.removeItem(ADMIN_REDIRECT_KEY);
    return stored || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Vollseiten-Login (#/admin/login) — ohne User-Geste (Direktaufruf, Hash-Wechsel).
 * @param {string} [targetHash]
 */
export function navigateAdminLoginPage(targetHash = "/admin") {
  rememberAdminRedirect(targetHash);
  const hash = "#/admin/login";
  try {
    if (location.hash !== hash) location.hash = hash;
  } catch {
    /* Webview */
  }
}

/**
 * Admin-Anmeldung als Modal anzeigen.
 * @param {string} [targetHash] — Ziel-Route nach erfolgreichem Login (z. B. /admin/branding)
 * @returns {Promise<{ ok: boolean, redirectHash?: string }>}
 */
export async function showAdminLoginModal(targetHash = "/admin") {
  if (!isAuthEnabled()) return { ok: true };

  const destination = normalizeAdminHash(targetHash);
  const dlg = ensureDialog();
  const host = dlg.querySelector("#admin-login-host");

  if (openPromise) return openPromise;

  if (!openDialogSync(host)) {
    navigateAdminLoginPage(destination);
    return { ok: false };
  }

  openPromise = (async () => {
    try {
      await loadAuth();
      if (getAuthUser()) {
        if (dlg.open) dlg.close("ok");
        openPromise = null;
        return { ok: true, redirectHash: `#${destination}` };
      }

      return await new Promise((resolve) => {
        let redirectAfterLogin = `#${destination}`;

        const finish = (ok) => {
          disposeLoginForm(host);
          if (host) host.replaceChildren();
          openPromise = null;
          resolve({ ok, redirectHash: redirectAfterLogin });
        };

        const onClose = () => {
          dlg.removeEventListener("close", onClose);
          finish(dlg.returnValue === "ok");
        };

        dlg.addEventListener("close", onClose);

        void initLoginForm(host, {
          title: "Administration anmelden",
          idPrefix: "admin-login-",
          adminLogin: true,
          showCancel: true,
          onSuccess: (redirectHash) => {
            redirectAfterLogin = redirectHash || `#${destination}`;
            dlg.close("ok");
          },
          onCancel: () => dlg.close("cancel"),
        }).then(() => {
          host.querySelector(`#admin-login-email`)?.focus();
        });
      });
    } catch (err) {
      console.error("[admin-login]", err);
      openPromise = null;
      if (dlg.open) dlg.close("cancel");
      navigateAdminLoginPage(destination);
      return { ok: false };
    }
  })();

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
  return Boolean(dialogEl?.open || openPromise);
}
