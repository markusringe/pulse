/**
 * Admin-UI für vollständige Instanz-Backups (#/admin/backups).
 * ZIP-Erstellung, Download, Upload und gruppenweise Wiederherstellung.
 */

import { api } from "./websocket.js?v=nav44";
import { withStepUp } from "./stepUp.js?v=nav44";
import { loadAuth, applyAdminNavVisibility } from "./authClient.js?v=nav44";
import { syncAdminNav } from "./adminNav.js?v=nav44";

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

/** Bytes lesbar formatieren. */
function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

/** Statusmeldung anzeigen. */
function setMsg(text, isError = false) {
  const el = $("backup-msg");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("backup-msg-error", isError);
}

/** Kurz-Toast für Erfolg/Fehler. */
function showToast(message, kind = "info") {
  let el = $("backup-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "backup-toast";
    el.className = "update-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

/** Backup-Tabelle rendern. */
function renderBackupTable(backups) {
  const tbody = $("backups-table-body");
  if (!tbody) return;
  if (!backups?.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Noch keine Backups vorhanden.</td></tr>`;
    return;
  }
  tbody.innerHTML = backups
    .map((b) => {
      const checksumShort = b.checksum ? `${esc(b.checksum.slice(7, 23))}…` : "—";
      const date = new Date(b.createdAt).toLocaleString("de-DE");
      return `<tr>
        <td>${esc(date)}</td>
        <td>${esc(formatBytes(b.size))}</td>
        <td><code class="backup-checksum">${checksumShort}</code></td>
        <td class="backup-actions">
          <button type="button" class="btn ghost btn-sm" data-backup-download="${esc(b.filename)}">Download</button>
          <button type="button" class="btn ghost btn-sm btn-warning" data-backup-restore="${esc(b.filename)}">Wiederherstellen</button>
        </td>
      </tr>`;
    })
    .join("");
}

/** Konfigurationsformular füllen. */
function fillConfigForm(config, backupDir) {
  $("backup-auto-enabled") && ($("backup-auto-enabled").checked = config.enabled !== false);
  const interval = $("backup-interval");
  if (interval) interval.value = config.interval === "weekly" ? "weekly" : "daily";
  const retention = $("backup-retention");
  if (retention) retention.value = String(config.retentionDays ?? 7);
  const includeEnv = $("backup-include-env");
  if (includeEnv) includeEnv.checked = Boolean(config.includeEnv);
  const dirEl = $("backup-dir-label");
  if (dirEl) dirEl.textContent = backupDir || "data/backups";
}

/** Backup-Liste vom Server laden. */
async function loadBackups() {
  const r = await api.backupsList();
  if (!r?.ok) {
    setMsg(r?.data?.error || "Backups konnten nicht geladen werden.", true);
    return;
  }
  renderBackupTable(r.data.backups || []);
  fillConfigForm(r.data.config || {}, r.data.backupDir);
  setMsg("");
}

/** Neues Backup erstellen und Download starten. */
async function onCreateBackup() {
  const btn = $("backup-create-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Backup wird erstellt…";
  }
  setMsg("Backup wird erstellt — bitte warten…");
  try {
    const r = await withStepUp(() => api.backupsCreate());
    if (!r?.ok) {
      setMsg(r?.data?.error || "Backup fehlgeschlagen.", true);
      showToast("Backup fehlgeschlagen", "error");
      return;
    }
    if (r.data?.downloadUrl) {
      window.location.href = r.data.downloadUrl;
    }
    await loadBackups();
    setMsg("Backup erfolgreich erstellt.");
    showToast("Backup erfolgreich erstellt", "success");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Backup erstellen";
    }
  }
}

/** Backup-Datei herunterladen. */
function downloadBackup(filename) {
  window.location.href = `/api/backups/download/${encodeURIComponent(filename)}`;
}

let restoreDialogEl = null;

/** Modal für gruppenweise Wiederherstellung. */
function ensureRestoreDialog() {
  if (restoreDialogEl) return restoreDialogEl;
  restoreDialogEl = document.createElement("dialog");
  restoreDialogEl.id = "backup-restore-dialog";
  restoreDialogEl.className = "modal backup-restore-dialog";
  restoreDialogEl.innerHTML = `
    <form method="dialog" class="panel" id="backup-restore-form">
      <h2>Backup wiederherstellen</h2>
      <p class="muted" id="backup-restore-filename"></p>
      <p class="muted">Wählen Sie die Bereiche, die eingespielt werden sollen (gruppiert wie in der Administration):</p>
      <div id="backup-restore-groups" class="backup-restore-groups"></div>
      <p class="muted backup-restore-hint">Nicht ausgewählte Bereiche bleiben unverändert. Der Server startet danach neu.</p>
      <p id="backup-restore-msg" class="muted" role="status"></p>
      <menu class="modal-actions">
        <button type="button" class="btn ghost" id="backup-restore-cancel">Abbrechen</button>
        <button type="submit" class="btn primary btn-warning">Wiederherstellen</button>
      </menu>
    </form>`;
  document.body.appendChild(restoreDialogEl);
  restoreDialogEl.querySelector("#backup-restore-cancel")?.addEventListener("click", () => restoreDialogEl.close(false));
  return restoreDialogEl;
}

/**
 * Checkbox-Gruppen aus Inspect-Antwort rendern.
 * @param {object} inspect
 */
function renderRestoreGroups(inspect) {
  const host = $("backup-restore-groups");
  if (!host) return;
  const available = inspect.available || {};
  const version = inspect.versionInfo;
  const versionHtml = version
    ? `<p class="onboarding-version ${version.status === "match" ? "muted" : "backup-version-warn"}" role="status">${esc(version.message || "")}</p>`
    : "";
  host.innerHTML = `${versionHtml}${(inspect.groups || [])
    .map((section) => {
      const items = (section.items || [])
        .map((item) => {
          const present = available[item.id] === true;
          const disabled = !present ? " disabled" : "";
          const hint = present ? "" : " (nicht im Backup)";
          return `<label class="backup-restore-item${disabled ? " is-missing" : ""}">
            <input type="checkbox" name="restore-group" value="${esc(item.id)}"${present ? " checked" : ""}${disabled} />
            <span>${esc(item.label)}${esc(hint)}</span>
          </label>`;
        })
        .join("");
      return `<fieldset class="backup-restore-section">
        <legend>${esc(section.label)}</legend>
        ${items}
      </fieldset>`;
    })
    .join("");
}

/**
 * Dialog: Gruppen wählen und Wiederherstellung starten.
 * @param {string} filename
 */
async function restoreBackup(filename) {
  const dlg = ensureRestoreDialog();
  const fnEl = dlg.querySelector("#backup-restore-filename");
  const msgEl = dlg.querySelector("#backup-restore-msg");
  if (fnEl) fnEl.textContent = `Datei: ${filename}`;
  if (msgEl) msgEl.textContent = "Lade Backup-Informationen…";

  const inspect = await withStepUp(() => api.backupsInspect(filename));
  if (!inspect?.ok) {
    setMsg(inspect?.data?.error || "Backup konnte nicht gelesen werden.", true);
    return;
  }
  renderRestoreGroups(inspect.data);
  if (msgEl) msgEl.textContent = "";

  const groups = await new Promise((resolve) => {
    const form = dlg.querySelector("#backup-restore-form");
    const onClose = () => {
      form?.removeEventListener("submit", onSubmit);
      dlg.removeEventListener("close", onClose);
      resolve(dlg.returnValue === "ok" ? collectSelectedGroups(dlg) : null);
    };
    const onSubmit = (ev) => {
      ev.preventDefault();
      const selected = collectSelectedGroups(dlg);
      if (!selected.length) {
        if (msgEl) msgEl.textContent = "Bitte mindestens einen Bereich auswählen.";
        return;
      }
      dlg.close("ok");
    };
    form?.addEventListener("submit", onSubmit);
    dlg.addEventListener("close", onClose);
    dlg.showModal();
  });

  if (!groups?.length) return;

  setMsg("Wiederherstellung läuft…");
  const r = await withStepUp(() => api.backupsRestore({ filename, groups }));
  if (!r?.ok) {
    setMsg(r?.data?.error || "Wiederherstellung fehlgeschlagen.", true);
    showToast("Wiederherstellung fehlgeschlagen", "error");
    return;
  }
  showToast("Backup wird wiederhergestellt — Seite lädt neu…", "success");
  setMsg(r.data?.message || "Server startet neu…");
  setTimeout(() => window.location.reload(), 5000);
}

/** Ausgewählte Gruppen-IDs aus dem Dialog lesen. */
function collectSelectedGroups(dlg) {
  return [...dlg.querySelectorAll('input[name="restore-group"]:checked')].map((el) => el.value);
}

/** ZIP-Backup hochladen. */
async function onUploadBackup() {
  const input = $("backup-upload-file");
  const file = input?.files?.[0];
  if (!file) {
    showToast("Bitte wählen Sie eine ZIP-Datei aus.", "warning");
    return;
  }
  const btn = $("backup-upload-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Upload läuft…";
  }
  const formData = new FormData();
  formData.append("backup", file);
  try {
    const r = await withStepUp(() => api.backupsUpload(formData));
    if (!r?.ok) {
      setMsg(r?.data?.error || "Upload fehlgeschlagen.", true);
      showToast("Upload fehlgeschlagen", "error");
      return;
    }
    if (input) input.value = "";
    await loadBackups();
    showToast("Backup hochgeladen — kann jetzt wiederhergestellt werden.", "success");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Hochladen";
    }
  }
}

/** Auto-Backup-Einstellungen speichern. */
async function onSaveConfig(ev) {
  ev.preventDefault();
  const body = {
    enabled: $("backup-auto-enabled")?.checked !== false,
    interval: $("backup-interval")?.value === "weekly" ? "weekly" : "daily",
    retentionDays: Number($("backup-retention")?.value || 7),
    includeEnv: $("backup-include-env")?.checked === true,
  };
  const r = await withStepUp(() => api.backupsSaveConfig(body));
  const msg = $("backup-config-msg");
  if (!r?.ok) {
    if (msg) msg.textContent = r?.data?.error || "Speichern fehlgeschlagen.";
    return;
  }
  if (msg) msg.textContent = "Einstellungen gespeichert.";
  fillConfigForm(r.data.config || body, $("backup-dir-label")?.textContent);
}

/** Klick-Delegation für Tabellen-Aktionen. */
function onTableClick(ev) {
  const dl = ev.target.closest("[data-backup-download]");
  if (dl) {
    downloadBackup(dl.getAttribute("data-backup-download"));
    return;
  }
  const restore = ev.target.closest("[data-backup-restore]");
  if (restore) {
    void restoreBackup(restore.getAttribute("data-backup-restore"));
  }
}

let bound = false;

/** Seite initialisieren (#/admin/backups). */
export async function showBackupsPage() {
  await loadAuth();
  syncAdminNav("backups", "/admin/backups");
  applyAdminNavVisibility();
  if (!bound) {
    $("backup-create-btn")?.addEventListener("click", () => void onCreateBackup());
    $("backup-upload-btn")?.addEventListener("click", () => void onUploadBackup());
    $("backup-config-form")?.addEventListener("submit", onSaveConfig);
    $("backups-table-body")?.addEventListener("click", onTableClick);
    bound = true;
  }
  await loadBackups();
}
