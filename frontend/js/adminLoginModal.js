/**
 * Admin-Login-Modal: erscheint beim Klick auf „Administration“ ohne gültige Session.
 * Firefox: showModal() muss in der User-Geste erfolgen — Dialog daher sofort öffnen.
 */

import { loadAuth, getAuthUser, isAuthEnabled } from "./authClient.js?v=nav48";
import { initLoginForm, disposeLoginForm } from "./adminLoginForm.js?v=nav48";

const ADMIN_REDIRECT_KEY = "pulse:admin-redirect";

/** Nur interne Hash-Routen (Open-Redirect-Schutz) — siehe lib/internalRoute.js */
function sanitizeAdminRedirectHash(hash, fallback = "#/admin/events") {
  const raw = String(hash || "").trim();
  if (!raw.startsWith("#/")) return fallback;
  if (raw.includes("://") || raw.startsWith("#//")) return fallback;
  const pathOnly = raw.replace(/^#/, "").split(/[?#]/)[0] || "/";
  const normalized = normalizeAdminHash(pathOnly);
  if (normalized === "/admin" && !pathOnly.startsWith("/admin")) return fallback;
  return `#${normalized}`;
}

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
  const safe = sanitizeAdminRedirectHash(`#${clean}`, `#${clean}`);
  try {
    sessionStorage.setItem(ADMIN_REDIRECT_KEY, safe);
  } catch {
    /* Webview ohne sessionStorage */
  }
}

/** Gespeicherte Admin-Zielroute lesen und löschen. */
export function consumeAdminRedirect(fallback = "#/admin/events") {
  try {
    const stored = sessionStorage.getItem(ADMIN_REDIRECT_KEY);
    sessionStorage.removeItem(ADMIN_REDIRECT_KEY);
    return sanitizeAdminRedirectHash(stored || fallback, fallback);
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
    if (location.hash !== hash) {
      location.hash = hash;
    } else {
      /* Gleicher Hash löst kein hashchange aus — Route trotzdem ausführen. */
      triggerHashRoute();
    }
  } catch {
    triggerHashRoute();
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
    return { ok: false, fallback: true };
  }

  /** Nach Ladefehler ohne sichtbares Formular auf Vollseiten-Login wechseln. */
  const MODAL_LOAD_TIMEOUT_MS = 20000;
  let loadTimeoutId = 0;

  openPromise = (async () => {
    try {
      await loadAuth();
      if (getAuthUser()) {
        if (dlg.open) dlg.close("ok");
        resetOpenPromise();
        return { ok: true, redirectHash: `#${destination}` };
      }

      return await new Promise((resolve) => {
        let redirectAfterLogin = `#${destination}`;
        let settled = false;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (loadTimeoutId) clearTimeout(loadTimeoutId);
          disposeLoginForm(host);
          if (host) host.replaceChildren();
          resetOpenPromise();
          resolve(result);
        };

        loadTimeoutId = window.setTimeout(() => {
          if (settled) return;
          console.warn("[admin-login] Modal-Ladezeit überschritten — Fallback Vollseite");
          finish({ ok: false, fallback: true });
          if (dlg.open) dlg.close("cancel");
          navigateAdminLoginPage(destination);
        }, MODAL_LOAD_TIMEOUT_MS);

        const onClose = () => {
          dlg.removeEventListener("close", onClose);
          const cancelled = dlg.returnValue === "cancel";
          finish({
            ok: dlg.returnValue === "ok",
            cancelled,
            fallback: !cancelled && dlg.returnValue !== "ok",
            redirectHash: redirectAfterLogin,
          });
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
        })
          .then(() => {
            if (loadTimeoutId) clearTimeout(loadTimeoutId);
            host.querySelector(`#admin-login-email`)?.focus();
          })
          .catch((err) => {
            console.error("[admin-login] Formular", err);
            finish({ ok: false, fallback: true });
            if (dlg.open) dlg.close("cancel");
            navigateAdminLoginPage(destination);
          });
      });
    } catch (err) {
      console.error("[admin-login]", err);
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      resetOpenPromise();
      if (dlg.open) dlg.close("cancel");
      navigateAdminLoginPage(destination);
      return { ok: false, fallback: true };
    }
  })();

  return openPromise;
}

/** Admin-Ziel-Hash normalisieren (Admin, Presenter, Stage). */
function normalizeAdminHash(hash) {
  const clean = String(hash || "/admin").replace(/^#/, "") || "/admin";
  if (clean.startsWith("/admin") || /^\/present\/\d{6}$/.test(clean) || /^\/(?:stage|present-view)\/\d{6}$/.test(clean)) {
    return clean;
  }
  return "/admin";
}

/** Hash-Routing anstoßen, auch wenn location.hash bereits #/admin/login ist. */
function triggerHashRoute() {
  try {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch {
    window.dispatchEvent(new Event("hashchange"));
  }
}

/** Ob das Admin-Login-Modal sichtbar offen ist (ohne laufendes Laden — sonst blockiert der Router). */
export function isAdminLoginModalOpen() {
  return Boolean(dialogEl?.open);
}

/** Hängenden Modal-Zustand zurücksetzen (Timeout, Ladefehler). */
function resetOpenPromise() {
  openPromise = null;
}
