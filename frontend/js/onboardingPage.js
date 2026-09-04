/**
 * Ersteinrichtung nach Bootstrap-Login: optionales Backup einspielen.
 * Route: #/admin/onboarding
 */

import { api } from "./websocket.js?v=nav45";
import {
  loadAuth,
  isAdminUser,
  refreshAuthMe,
  completeOnboardingBackup,
} from "./authClient.js?v=nav48";

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Gruppen-Checkboxen wie auf der Backup-Seite rendern. */
function renderGroups(host, inspect) {
  if (!host) return;
  const available = inspect.available || {};
  const version = inspect.versionInfo;
  const versionHtml = version
    ? `<p class="onboarding-version ${version.status === "match" ? "muted" : "backup-version-warn"}" role="status">${esc(version.message || "")}</p>`
    : "";
  host.innerHTML = `${versionHtml}${(inspect.groups || [])
    .map(
      (section) => `<fieldset class="backup-restore-section">
        <legend>${esc(section.label)}</legend>
        ${(section.items || [])
          .map((item) => {
            const present = available[item.id] === true;
            return `<label class="backup-restore-item${present ? "" : " is-missing"}">
              <input type="checkbox" name="onboarding-group" value="${esc(item.id)}"${present ? " checked" : ""}${present ? "" : " disabled"} />
              <span>${esc(item.label)}${present ? "" : " (nicht im Backup)"}</span>
            </label>`;
          })
          .join("")}
      </fieldset>`
    )
    .join("")}`;
}

/** Ausgewählte Gruppen-IDs sammeln. */
function selectedGroups() {
  return [...document.querySelectorAll('input[name="onboarding-group"]:checked')].map((el) => el.value);
}

/** ZIP lokal inspizieren (Gruppen + Version). */
async function inspectLocalFile(file) {
  const formData = new FormData();
  formData.append("backup", file);
  return api.backupsInspectUpload(formData);
}

/** Backup einspielen und Ersteinrichtung abschließen. */
async function onRestoreClick() {
  const file = $("onboarding-backup-file")?.files?.[0];
  const msg = $("onboarding-msg");
  const btn = $("onboarding-restore-btn");
  if (!file) {
    if (msg) msg.textContent = "Bitte wählen Sie zuerst eine ZIP-Backup-Datei.";
    return;
  }
  const groups = selectedGroups();
  if (!groups.length) {
    if (msg) msg.textContent = "Bitte mindestens einen Bereich auswählen.";
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Wird eingespielt…";
  }
  if (msg) msg.textContent = "Backup wird eingespielt — bitte warten…";

  const formData = new FormData();
  formData.append("backup", file);
  formData.append("groups", JSON.stringify(groups));
  const r = await api.backupsOnboardingRestore(formData);
  if (!r?.ok) {
    if (msg) msg.textContent = r?.data?.error || "Einspielen fehlgeschlagen.";
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Backup einspielen";
    }
    return;
  }
  if (msg) {
    msg.textContent =
      r.data?.versionInfo?.message ||
      r.data?.message ||
      "Backup eingespielt. Sie werden zur Anmeldung weitergeleitet…";
  }
  setTimeout(() => {
    location.hash = "#/admin/login";
    window.location.reload();
  }, 2500);
}

/** Ersteinrichtung überspringen. */
async function onSkipClick() {
  await completeOnboardingBackup();
  const pin = sessionStorage.getItem("pulse:requires-pin-setup");
  sessionStorage.removeItem("pulse:requires-pin-setup");
  location.hash = pin ? "#/admin/email" : "#/admin/events";
}

let bound = false;

/** Seite initialisieren. */
export async function showOnboardingPage() {
  await loadAuth();
  await refreshAuthMe();
  if (!isAdminUser()) {
    location.hash = "#/admin/login";
    return;
  }
  const me = await fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()).catch(() => ({}));
  if (!me.onboardingBackupPending) {
    location.hash = "#/admin/events";
    return;
  }

  if (!bound) {
    $("onboarding-backup-file")?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      const host = $("onboarding-restore-groups");
      const msg = $("onboarding-msg");
      if (!file) return;
      if (msg) msg.textContent = "Backup wird gelesen…";
      const r = await inspectLocalFile(file);
      if (!r?.ok) {
        if (msg) msg.textContent = r?.data?.error || "Backup konnte nicht gelesen werden.";
        if (host) host.innerHTML = "";
        return;
      }
      renderGroups(host, r.data);
      if (msg) msg.textContent = "";
    });
    $("onboarding-restore-btn")?.addEventListener("click", () => void onRestoreClick());
    $("onboarding-skip-btn")?.addEventListener("click", () => void onSkipClick());
    bound = true;
  }
}
