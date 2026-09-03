/**
 * Benutzerverwaltung (#/admin/users) — nur für Rolle admin.
 */

import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  revokeUserSessions,
  resendUserPin,
  deleteUser,
  roleLabel,
  loadAuth,
  canManageUsers,
  applyAdminNavVisibility,
} from "./authClient.js?v=nav43";
import { withStepUp, ensureStepUp } from "./stepUp.js?v=nav43";
import { syncAdminNav } from "./adminNav.js?v=nav43";

/** Benutzerliste rendern. */
export async function showUsersPage() {
  const root = document.getElementById("view-users");
  if (!root) return;
  await loadAuth();
  if (!canManageUsers()) {
    await loadAuth();
  }
  if (!canManageUsers()) {
    root.innerHTML = `<p class="muted">Keine Berechtigung — Benutzerverwaltung erfordert die Rolle Administrator. Bitte abmelden und erneut anmelden.</p>`;
    return;
  }
  syncAdminNav("users", "/admin/users");
  applyAdminNavVisibility();
  root.innerHTML = `
    <header class="admin-page-head pulse-admin-head">
      <div>
        <p class="eyebrow pulse-eyebrow">Administration</p>
        <h1>Benutzer</h1>
      </div>
      <button type="button" class="btn primary pulse-btn-primary" id="users-add">Benutzer anlegen</button>
    </header>
    <div class="users-toolbar">
      <input type="search" id="users-search" placeholder="Suchen…" aria-label="Benutzer suchen" />
      <select id="users-filter-role" aria-label="Rolle filtern">
        <option value="">Alle Rollen</option>
        <option value="admin">Administrator</option>
        <option value="teamleader">Teamleiter</option>
        <option value="teammember">Teammitglied</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
      <select id="users-filter-status" aria-label="Status filtern">
        <option value="">Alle Status</option>
        <option value="active">Aktiv</option>
        <option value="disabled">Deaktiviert</option>
        <option value="locked">Gesperrt</option>
        <option value="pending">Einladung ausstehend</option>
      </select>
    </div>
    <div id="users-table-wrap" class="users-table-wrap table-wrap table-wrap--responsive"></div>
    <dialog id="users-dialog" class="modal admin-dialog">
      <form method="dialog" id="users-form" class="panel pulse-card">
        <h2 id="users-form-title">Benutzer anlegen</h2>
        <label class="field"><span>Anzeigename</span><input id="uf-name" required maxlength="120" /></label>
        <label class="field"><span>E-Mail</span><input type="email" id="uf-email" required /></label>
        <label class="field"><span>Rolle</span>
          <select id="uf-role">
            <option value="viewer">Viewer</option>
            <option value="teammember">Teammitglied</option>
            <option value="teamleader">Teamleiter</option>
            <option value="editor">Editor</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <label class="field"><span>Status</span>
          <select id="uf-status">
            <option value="active">Aktiv</option>
            <option value="pending">Einladung ausstehend</option>
            <option value="disabled">Deaktiviert</option>
          </select>
        </label>
        <label class="field"><span>Kommentar</span><input id="uf-comment" maxlength="500" /></label>
        <label class="field" id="uf-password-wrap"><span>Initiales Kennwort</span><input type="password" id="uf-password" autocomplete="new-password" /></label>
        <menu class="modal-actions">
          <button type="button" class="btn ghost" id="uf-cancel">Abbrechen</button>
          <button type="submit" class="btn primary pulse-btn-primary">Speichern</button>
        </menu>
      </form>
    </dialog>
  `;
  bindUsersEvents();
  await refreshUsersTable();
}

let editingId = null;

function bindUsersEvents() {
  document.getElementById("users-add")?.addEventListener("click", () => openUserForm(null));
  document.getElementById("users-search")?.addEventListener("input", debounce(refreshUsersTable, 250));
  document.getElementById("users-filter-role")?.addEventListener("change", refreshUsersTable);
  document.getElementById("users-filter-status")?.addEventListener("change", refreshUsersTable);
  document.getElementById("uf-cancel")?.addEventListener("click", () => document.getElementById("users-dialog")?.close());
  document.getElementById("users-form")?.addEventListener("submit", onSaveUser);
}

async function refreshUsersTable() {
  const wrap = document.getElementById("users-table-wrap");
  if (!wrap) return;
  const q = document.getElementById("users-search")?.value || "";
  const role = document.getElementById("users-filter-role")?.value || "";
  const status = document.getElementById("users-filter-status")?.value || "";
  const r = await listUsers({ q, role, status });
  if (!r.ok) {
    wrap.innerHTML = `<p class="muted">${r.data?.error || "Laden fehlgeschlagen"}</p>`;
    return;
  }
  const users = r.data?.users || [];
  if (!users.length) {
    wrap.innerHTML = `<p class="muted">Noch keine Benutzer. Legen Sie das erste Konto an.</p>`;
    return;
  }
  wrap.innerHTML = `
    <table class="users-table">
      <thead><tr>
        <th>Name</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>Letzte Anmeldung</th><th>Aktionen</th>
      </tr></thead>
      <tbody>
        ${users
          .map(
            (u) => `<tr data-user-id="${u.id}">
              <td data-label="Name">${escapeHtml(u.displayName)}</td>
              <td data-label="E-Mail">${escapeHtml(u.email)}</td>
              <td data-label="Rolle">${escapeHtml(u.roleLabel || roleLabel(u.role))}</td>
              <td data-label="Status">${escapeHtml(u.status)}</td>
              <td data-label="Letzte Anmeldung">${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("de-DE") : "—"}</td>
              <td class="users-actions" data-label="Aktionen">
                <button type="button" class="btn ghost btn-sm pulse-btn-ghost" data-act="edit">Bearbeiten</button>
                <button type="button" class="btn ghost btn-sm pulse-btn-ghost" data-act="pin">PIN senden</button>
                <button type="button" class="btn ghost btn-sm pulse-btn-ghost" data-act="revoke">Sitzungen beenden</button>
                <button type="button" class="btn ghost btn-sm pulse-btn-ghost" data-act="delete">Löschen</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  wrap.querySelector("tbody")?.addEventListener("click", onTableAction);
}

async function onTableAction(ev) {
  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const row = btn.closest("tr");
  const id = row?.dataset?.userId;
  if (!id) return;
  const act = btn.dataset.act;
  if (act === "edit") {
    const r = await listUsers({});
    const user = (r.data?.users || []).find((u) => u.id === id);
    openUserForm(user);
    return;
  }
  if (act === "pin") {
    const r = await withStepUp(() => resendUserPin(id));
    if (r.ok) alert("PIN wurde angefordert (falls SMTP/Entwicklungsmodus aktiv).");
    else if (r.data?.code !== "step_up_required") alert(r.data?.error || "Fehlgeschlagen");
    return;
  }
  if (act === "revoke") {
    const r = await withStepUp(() => revokeUserSessions(id));
    if (r.ok) alert("Alle Sitzungen beendet.");
    else if (r.data?.code !== "step_up_required") alert(r.data?.error || "Fehlgeschlagen");
    return;
  }
  if (act === "delete") {
    if (!confirm("Benutzer wirklich löschen? Audit-Pflichten beachten.")) return;
    const r = await withStepUp(() => deleteUser(id));
    if (r.ok) await refreshUsersTable();
    else if (r.data?.code !== "step_up_required") alert(r.data?.error || "Löschen fehlgeschlagen");
  }
}

function openUserForm(user) {
  editingId = user?.id || null;
  document.getElementById("users-form-title").textContent = user ? "Benutzer bearbeiten" : "Benutzer anlegen";
  document.getElementById("uf-name").value = user?.displayName || "";
  document.getElementById("uf-email").value = user?.email || "";
  document.getElementById("uf-email").disabled = Boolean(user);
  document.getElementById("uf-role").value = user?.role || "viewer";
  document.getElementById("uf-status").value = user?.status || "active";
  document.getElementById("uf-comment").value = user?.comment || "";
  document.getElementById("uf-password").value = "";
  document.getElementById("uf-password-wrap").hidden = Boolean(user);
  document.getElementById("users-dialog")?.showModal();
}

async function onSaveUser(ev) {
  ev.preventDefault();
  if (!(await ensureStepUp())) return;
  const body = {
    displayName: document.getElementById("uf-name").value,
    email: document.getElementById("uf-email").value,
    role: document.getElementById("uf-role").value,
    status: document.getElementById("uf-status").value,
    comment: document.getElementById("uf-comment").value,
  };
  if (editingId) {
    const r = await withStepUp(() => updateUser(editingId, body));
    if (!r.ok && r.data?.code !== "step_up_required") {
      alert(r.data?.error || "Speichern fehlgeschlagen");
      return;
    }
  } else {
    body.password = document.getElementById("uf-password").value;
    const r = await withStepUp(() => createUser(body));
    if (!r.ok && r.data?.code !== "step_up_required") {
      alert(r.data?.error || "Anlegen fehlgeschlagen");
      return;
    }
  }
  document.getElementById("users-dialog")?.close();
  await refreshUsersTable();
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
