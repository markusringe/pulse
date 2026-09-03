/**
 * Team-Verwaltung (#/admin/teams).
 * Admins und globale Teamleiter dürfen Teams anlegen; Teamleiter im Team verwalten Mitglieder.
 */

import {
  loadAuth,
  applyAdminNavVisibility,
  getAuthUser,
  fetchWithAuth,
  canCreateTeam,
  canManageTeamMembers,
  roleLabel,
} from "./authClient.js?v=nav43";
import { syncAdminNav } from "./adminNav.js?v=nav43";

/** Aktuell bearbeitetes Team (Modal). */
let activeTeamId = null;

/** Escaping für sichere HTML-Ausgabe. */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Team-Liste vom Server laden. */
async function fetchTeams() {
  const r = await fetchWithAuth("/teams");
  if (!r.ok) throw new Error(r.data?.error || "Teams konnten nicht geladen werden");
  return r.data.teams || [];
}

/** Benutzer für Mitglieder-Auswahl laden. */
async function fetchUsersForPicker() {
  const r = await fetchWithAuth("/users");
  if (!r.ok) return [];
  return r.data.users || [];
}

/** Team-Mitglieder laden. */
async function fetchMembers(teamId) {
  const r = await fetchWithAuth(`/teams/${encodeURIComponent(teamId)}/members`);
  if (!r.ok) throw new Error(r.data?.error || "Mitglieder konnten nicht geladen werden");
  return r.data.members || [];
}

/** Team-Events laden. */
async function fetchTeamEvents(teamId) {
  const r = await fetchWithAuth(`/teams/${encodeURIComponent(teamId)}/events`);
  if (!r.ok) return [];
  return r.data.events || [];
}

/** Darf der aktuelle Benutzer Mitglieder in diesem Team verwalten? */
function canManageThisTeam(team) {
  const user = getAuthUser();
  if (!user) return false;
  if (user.role === "admin") return true;
  if (team?.memberRole === "teamleader") return true;
  return canManageTeamMembers();
}

/** Team-Karten rendern. */
function renderTeamList(teams) {
  const wrap = document.getElementById("teams-list");
  if (!wrap) return;
  if (!teams.length) {
    wrap.innerHTML = `<p class="muted">Noch keine Teams vorhanden.</p>`;
    return;
  }
  wrap.innerHTML = teams
    .map(
      (team) => `
    <article class="panel team-card" data-team-id="${esc(team.id)}">
      <button type="button" class="team-card-btn" data-open-team="${esc(team.id)}">
        <h3>${esc(team.name)}</h3>
        <p class="muted">${esc(team.description || "Keine Beschreibung")}</p>
        <div class="team-meta muted">
          <span>Mitglieder: ${Number(team.memberCount) || 0}</span>
          ${team.memberRole ? `<span>Ihre Rolle: ${esc(team.memberRole)}</span>` : ""}
        </div>
      </button>
    </article>`
    )
    .join("");
  wrap.querySelectorAll("[data-open-team]").forEach((btn) => {
    btn.addEventListener("click", () => openTeamModal(btn.getAttribute("data-open-team")));
  });
}

/** Mitgliederliste im Modal aktualisieren. */
async function renderMembers(teamId, team) {
  const list = document.getElementById("teams-members-list");
  const manage = document.getElementById("teams-add-member");
  if (!list) return;
  const members = await fetchMembers(teamId);
  const showActions = canManageThisTeam(team);
  if (manage) manage.hidden = !showActions;
  list.innerHTML = members
    .map(
      (m) => `
    <li class="member-item">
      <div class="member-info">
        <strong>${esc(m.name || m.email)}</strong>
        <span class="badge">${esc(m.teamRole)}</span>
        <span class="muted">${esc(roleLabel(m.role))}</span>
      </div>
      ${
        showActions
          ? `<div class="member-actions">
        <button type="button" class="btn ghost btn-sm" data-role-change="${esc(m.id)}" data-role="teammember">Zu Teammember</button>
        <button type="button" class="btn ghost btn-sm" data-role-change="${esc(m.id)}" data-role="teamleader">Zu Teamleiter</button>
        <button type="button" class="btn danger btn-sm" data-remove-member="${esc(m.id)}">Entfernen</button>
      </div>`
          : ""
      }
    </li>`
    )
    .join("");

  list.querySelectorAll("[data-role-change]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-role-change");
      const role = btn.getAttribute("data-role");
      await fetchWithAuth(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        body: { role },
      });
      await renderMembers(teamId, team);
    });
  });
  list.querySelectorAll("[data-remove-member]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-remove-member");
      if (!confirm("Mitglied wirklich entfernen?")) return;
      await fetchWithAuth(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      await renderMembers(teamId, team);
      await refreshTeamList();
    });
  });
}

/** Team-Events im Modal anzeigen. */
async function renderTeamEvents(teamId) {
  const wrap = document.getElementById("teams-events-list");
  if (!wrap) return;
  const events = await fetchTeamEvents(teamId);
  if (!events.length) {
    wrap.innerHTML = `<p class="muted">Keine Events für dieses Team.</p>`;
    return;
  }
  wrap.innerHTML = `<ul class="team-events">${events
    .map(
      (ev) =>
        `<li><a href="#/admin/events/${esc(ev.id)}">${esc(ev.title)}</a> <span class="muted">${esc(ev.status)} · ${esc(ev.visibility || "private")}</span></li>`
    )
    .join("")}</ul>`;
}

/** Mitglieder-Select mit Benutzern füllen. */
async function fillMemberSelect(teamId) {
  const select = document.getElementById("teams-member-select");
  if (!select) return;
  const [users, members] = await Promise.all([fetchUsersForPicker(), fetchMembers(teamId)]);
  const memberIds = new Set(members.map((m) => m.id));
  select.innerHTML = users
    .filter((u) => !memberIds.has(u.id))
    .map((u) => `<option value="${esc(u.id)}">${esc(u.displayName || u.email)}</option>`)
    .join("");
}

/** Team-Modal öffnen und Daten laden. */
async function openTeamModal(teamId) {
  activeTeamId = teamId;
  const dialog = document.getElementById("teams-dialog");
  const r = await fetchWithAuth(`/teams/${encodeURIComponent(teamId)}`);
  if (!r.ok) return;
  const team = r.data.team;
  document.getElementById("teams-form-name").value = team.name || "";
  document.getElementById("teams-form-desc").value = team.description || "";
  document.getElementById("teams-dialog-title").textContent = team.name || "Team";
  const canEdit = canManageThisTeam({ ...team, memberRole: team.memberRole });
  document.getElementById("teams-form-save").hidden = !canEdit;
  document.getElementById("teams-form-name").readOnly = !canEdit;
  document.getElementById("teams-form-desc").readOnly = !canEdit;
  await Promise.all([renderMembers(teamId, team), renderTeamEvents(teamId), fillMemberSelect(teamId)]);
  dialog?.showModal();
}

/** Team-Liste neu laden. */
async function refreshTeamList() {
  const teams = await fetchTeams();
  renderTeamList(teams);
}

/** Seite initialisieren. */
export async function showTeamsPage() {
  const root = document.getElementById("view-teams");
  if (!root) return;
  await loadAuth();
  syncAdminNav("teams", "/admin/teams");
  applyAdminNavVisibility();

  const user = getAuthUser();
  if (!user) {
    root.innerHTML = `<p class="muted">Bitte anmelden.</p>`;
    return;
  }

  root.innerHTML = `
    <header class="admin-page-head">
      <div>
        <p class="eyebrow">Administration</p>
        <h1>Teams</h1>
      </div>
      ${canCreateTeam() ? `<button type="button" class="btn primary" id="teams-create">Neues Team</button>` : ""}
    </header>
    <div id="teams-list" class="teams-grid"></div>
    <dialog id="teams-dialog" class="modal">
      <form method="dialog" id="teams-form" class="panel teams-dialog-panel">
        <h2 id="teams-dialog-title">Team</h2>
        <label class="field"><span>Name</span><input id="teams-form-name" required maxlength="120" /></label>
        <label class="field"><span>Beschreibung</span><textarea id="teams-form-desc" rows="3" maxlength="500"></textarea></label>
        <div class="form-actions">
          <button type="button" class="btn ghost" id="teams-form-cancel">Schließen</button>
          <button type="submit" class="btn primary" id="teams-form-save">Speichern</button>
        </div>
        <section class="team-members-section">
          <h3>Mitglieder</h3>
          <div id="teams-add-member" class="add-member-row" hidden>
            <select id="teams-member-select" aria-label="Benutzer wählen"></select>
            <select id="teams-member-role" aria-label="Team-Rolle">
              <option value="teammember">Teammember</option>
              <option value="teamleader">Teamleiter</option>
            </select>
            <button type="button" class="btn" id="teams-add-member-btn">Hinzufügen</button>
          </div>
          <ul id="teams-members-list" class="members-list"></ul>
        </section>
        <section class="team-events-section">
          <h3>Team-Events</h3>
          <div id="teams-events-list"></div>
        </section>
      </form>
    </dialog>
    <dialog id="teams-create-dialog" class="modal">
      <form method="dialog" id="teams-create-form" class="panel">
        <h2>Neues Team</h2>
        <label class="field"><span>Name</span><input id="teams-create-name" required maxlength="120" /></label>
        <label class="field"><span>Beschreibung</span><textarea id="teams-create-desc" rows="3" maxlength="500"></textarea></label>
        <div class="form-actions">
          <button type="button" class="btn ghost" id="teams-create-cancel">Abbrechen</button>
          <button type="submit" class="btn primary">Anlegen</button>
        </div>
      </form>
    </dialog>`;

  await refreshTeamList();

  document.getElementById("teams-create")?.addEventListener("click", () => {
    document.getElementById("teams-create-dialog")?.showModal();
  });
  document.getElementById("teams-create-cancel")?.addEventListener("click", () => {
    document.getElementById("teams-create-dialog")?.close();
  });
  document.getElementById("teams-form-cancel")?.addEventListener("click", () => {
    document.getElementById("teams-dialog")?.close();
  });
  document.getElementById("teams-create-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("teams-create-name")?.value?.trim();
    const description = document.getElementById("teams-create-desc")?.value?.trim() || "";
    if (!name) return;
    const r = await fetchWithAuth("/teams", { method: "POST", body: { name, description } });
    if (r.ok) {
      document.getElementById("teams-create-dialog")?.close();
      await refreshTeamList();
      if (r.data?.team?.id) openTeamModal(r.data.team.id);
    }
  });
  document.getElementById("teams-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeTeamId) return;
    const name = document.getElementById("teams-form-name")?.value?.trim();
    const description = document.getElementById("teams-form-desc")?.value?.trim() || "";
    await fetchWithAuth(`/teams/${encodeURIComponent(activeTeamId)}`, {
      method: "PATCH",
      body: { name, description },
    });
    document.getElementById("teams-dialog-title").textContent = name;
    await refreshTeamList();
  });
  document.getElementById("teams-add-member-btn")?.addEventListener("click", async () => {
    if (!activeTeamId) return;
    const userId = document.getElementById("teams-member-select")?.value;
    const role = document.getElementById("teams-member-role")?.value || "teammember";
    if (!userId) return;
    await fetchWithAuth(`/teams/${encodeURIComponent(activeTeamId)}/members`, {
      method: "POST",
      body: { userId, role },
    });
    const r = await fetchWithAuth(`/teams/${encodeURIComponent(activeTeamId)}`);
    await renderMembers(activeTeamId, r.data?.team || {});
    await fillMemberSelect(activeTeamId);
    await refreshTeamList();
  });
}
