/**
 * Login-Seite (#/admin/login): Vollseiten-Anmeldung für Admin-Bereich.
 */

import { getAuthUser, isAuthEnabled, hasAdminAccess, loadAuth, takeSessionExpiredNotice } from "./authClient.js?v=nav62";
import { initLoginForm } from "./adminLoginForm.js?v=nav62";
import { consumeAdminRedirect } from "./adminLoginModal.js?v=nav62";
import { explainError } from "./help.js?v=help9";

/** Login-UI auf der Vollseite initialisieren. */
export async function showLoginPage() {
  const root = document.getElementById("view-login");
  if (!root) return;
  await loadAuth();
  if (getAuthUser()) {
    location.hash = consumeAdminRedirect("#/admin/events");
    return;
  }
  await initLoginForm(root, {
    title: "Anmelden",
    idPrefix: "login-",
    adminLogin: true,
    onSuccess: async (redirectHash) => {
      await loadAuth();
      location.hash = redirectHash || consumeAdminRedirect("#/admin/events");
    },
  });
  if (takeSessionExpiredNotice()) {
    const info = explainError("session_expired");
    const err = root.querySelector("#login-error");
    if (err) {
      err.hidden = false;
      err.innerHTML = info.html;
    }
  }
}

/**
 * Auth beim Start laden. Gibt true zurück, wenn Admin-Route ohne Session geöffnet wurde.
 * @returns {Promise<boolean>}
 */
export async function initAuthOnBoot() {
  await loadAuth();
  if (!isAuthEnabled()) return false;
  const hash = location.hash.replace(/^#/, "") || "/";
  return hash.startsWith("/admin") && hash !== "/admin/login" && !hasAdminAccess();
}
