/**
 * Benutzerprofil (#/admin/profile): Anzeigename und Kennwort ändern.
 */

import { getAuthUser, updateProfile, changePassword, roleLabel } from "./authClient.js?v=nav62";

/** Profilseite rendern und Formulare binden. */
export async function showProfilePage() {
  const root = document.getElementById("view-profile");
  if (!root) return;
  const me = getAuthUser();
  if (!me) {
    root.innerHTML = `<p class="muted">Bitte melden Sie sich an.</p>`;
    return;
  }
  root.innerHTML = `
    <header class="admin-page-head">
      <div>
        <p class="eyebrow">Administration</p>
        <h1>Mein Profil</h1>
      </div>
    </header>
    <div class="profile-grid">
      <form id="profile-form" class="panel">
        <h2>Stammdaten</h2>
        <p class="muted">Rolle: <strong>${escapeHtml(roleLabel(me.role))}</strong> · E-Mail: ${escapeHtml(me.email)}</p>
        <label class="field"><span>Anzeigename</span>
          <input id="pf-name" maxlength="120" required value="${escapeAttr(me.displayName || "")}" />
        </label>
        <p id="profile-msg" class="muted" role="status"></p>
        <button type="submit" class="btn primary">Speichern</button>
      </form>
      <form id="profile-password-form" class="panel">
        <h2>Kennwort ändern</h2>
        <p class="muted">Das Kennwort wird nur für Kontoänderungen genutzt — die Anmeldung erfolgt per E-Mail-PIN.</p>
        <label class="field"><span>Aktuelles Kennwort</span>
          <input type="password" id="pf-current" autocomplete="current-password" required />
        </label>
        <label class="field"><span>Neues Kennwort</span>
          <input type="password" id="pf-new" autocomplete="new-password" minlength="8" required />
        </label>
        <label class="field"><span>Neues Kennwort wiederholen</span>
          <input type="password" id="pf-new2" autocomplete="new-password" minlength="8" required />
        </label>
        <p id="profile-pw-msg" class="muted" role="status"></p>
        <button type="submit" class="btn primary">Kennwort ändern</button>
      </form>
    </div>`;

  document.getElementById("profile-form")?.addEventListener("submit", onSaveProfile);
  document.getElementById("profile-password-form")?.addEventListener("submit", onChangePassword);
}

async function onSaveProfile(ev) {
  ev.preventDefault();
  const msg = document.getElementById("profile-msg");
  const displayName = document.getElementById("pf-name")?.value?.trim() || "";
  if (msg) msg.textContent = "Speichere…";
  const r = await updateProfile({ displayName });
  if (!r.ok) {
    if (msg) msg.textContent = r.data?.error || "Speichern fehlgeschlagen";
    return;
  }
  if (msg) msg.textContent = "Profil gespeichert.";
  const label = document.getElementById("admin-user-label");
  if (label && r.data?.user?.displayName) label.textContent = r.data.user.displayName;
}

async function onChangePassword(ev) {
  ev.preventDefault();
  const msg = document.getElementById("profile-pw-msg");
  const currentPassword = document.getElementById("pf-current")?.value || "";
  const newPassword = document.getElementById("pf-new")?.value || "";
  const newPassword2 = document.getElementById("pf-new2")?.value || "";
  if (newPassword !== newPassword2) {
    if (msg) msg.textContent = "Die neuen Kennwörter stimmen nicht überein.";
    return;
  }
  if (msg) msg.textContent = "Ändere Kennwort…";
  const r = await changePassword(currentPassword, newPassword);
  if (!r.ok) {
    if (msg) msg.textContent = r.data?.error || "Kennwortänderung fehlgeschlagen";
    return;
  }
  if (msg) msg.textContent = "Kennwort geändert — bitte erneut anmelden.";
  document.getElementById("profile-password-form")?.reset();
  setTimeout(() => {
    location.hash = "#/admin/login";
  }, 1200);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
