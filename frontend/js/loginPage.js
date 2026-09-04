/**
 * Login-Seite (#/admin/login): Vollseiten-Anmeldung für Admin-Bereich.
 */

import { getAuthUser, isAuthEnabled, hasAdminAccess, loadAuth } from "./authClient.js?v=nav48";
import { initLoginForm } from "./adminLoginForm.js?v=nav48";
import { consumeAdminRedirect } from "./adminLoginModal.js?v=nav48";

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
    onSuccess: (redirectHash) => {
      location.hash = redirectHash || consumeAdminRedirect("#/admin/events");
    },
  });
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
