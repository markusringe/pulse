/**
 * Admin-UI: E-Mail-Versand konfigurieren (SMTP, Sendmail oder deaktiviert).
 * Route: #/admin/email
 */

import { getEmailConfig, saveEmailConfig, sendTestEmail, getAuthUser } from "./authClient.js";
import { ensureStepUp, withStepUp } from "./stepUp.js";

let bound = false;

/** Seite anzeigen und Formular laden. */
export async function showEmailPage() {
  const root = document.getElementById("view-email");
  if (!root) return;
  if (!bound) {
    bindEmailPage();
    bound = true;
  }
  await refreshEmailForm();
}

function bindEmailPage() {
  document.getElementById("email-provider")?.addEventListener("change", onProviderChange);
  document.getElementById("email-save")?.addEventListener("click", onSave);
  document.getElementById("email-test")?.addEventListener("click", onTest);
}

function onProviderChange() {
  syncProviderPanels();
}

function syncProviderPanels() {
  const provider = document.getElementById("email-provider")?.value || "none";
  document.getElementById("email-smtp-panel")?.toggleAttribute("hidden", provider !== "smtp");
  document.getElementById("email-sendmail-panel")?.toggleAttribute("hidden", provider !== "sendmail");
  document.getElementById("email-none-panel")?.toggleAttribute("hidden", provider !== "none");
}

async function refreshEmailForm() {
  const r = await getEmailConfig();
  if (!r.ok) {
    setMsg(r.data?.error || "Konfiguration konnte nicht geladen werden.", true);
    return;
  }
  const cfg = r.data?.config || {};
  const health = r.data?.health || {};
  setField("email-provider", cfg.provider || "none");
  setField("email-smtp-host", cfg.smtpHost || "");
  setField("email-smtp-port", cfg.smtpPort || 587);
  setField("email-smtp-user", cfg.smtpUser || "");
  setField("email-smtp-pass", "");
  setField("email-smtp-tls", cfg.smtpTls || "starttls");
  setField("email-smtp-secure", cfg.smtpSecure);
  setField("email-from", cfg.from || "");
  setField("email-from-name", cfg.fromName || "Team Townhall");
  setField("email-sendmail-path", cfg.sendmailPath || "/usr/bin/sendmail");
  setField("email-sendmail-from", cfg.sendmailFrom || "");
  const passHint = document.getElementById("email-smtp-pass-hint");
  if (passHint) passHint.textContent = cfg.smtpPassSet ? "Passwort gespeichert — leer lassen zum Beibehalten." : "Noch kein Passwort gespeichert.";
  const status = document.getElementById("email-status");
  if (status) {
    status.textContent = health.configured
      ? `Versand aktiv (${health.provider})`
      : "Kein E-Mail-Versand — Anmeldung per Kennwort";
  }
  syncProviderPanels();
  setMsg("");
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === "checkbox") el.checked = Boolean(value);
  else el.value = value == null ? "" : String(value);
}

function collectForm() {
  const provider = document.getElementById("email-provider")?.value || "none";
  const body = {
    provider,
    fromName: document.getElementById("email-from-name")?.value || "Team Townhall",
  };
  if (provider === "smtp") {
    body.smtpHost = document.getElementById("email-smtp-host")?.value || "";
    body.smtpPort = Number(document.getElementById("email-smtp-port")?.value) || 587;
    body.smtpUser = document.getElementById("email-smtp-user")?.value || "";
    body.smtpPass = document.getElementById("email-smtp-pass")?.value || "";
    body.smtpTls = document.getElementById("email-smtp-tls")?.value || "starttls";
    body.smtpSecure = document.getElementById("email-smtp-secure")?.checked || false;
    body.from = document.getElementById("email-from")?.value || "";
  }
  if (provider === "sendmail") {
    body.sendmailPath = document.getElementById("email-sendmail-path")?.value || "/usr/bin/sendmail";
    body.sendmailFrom = document.getElementById("email-sendmail-from")?.value || "";
    body.from = body.sendmailFrom;
  }
  return body;
}

async function onSave() {
  if (!(await ensureStepUp())) return;
  const body = collectForm();
  const r = await withStepUp(() => saveEmailConfig(body));
  if (!r.ok) {
    setMsg(r.data?.error || "Speichern fehlgeschlagen.", true);
    return;
  }
  setMsg("E-Mail-Konfiguration gespeichert.");
  await refreshEmailForm();
}

async function onTest() {
  if (!(await ensureStepUp())) return;
  const me = getAuthUser();
  const r = await withStepUp(() => sendTestEmail({ to: me?.email || "" }));
  if (!r.ok) {
    setMsg(r.data?.error || "Test-E-Mail fehlgeschlagen.", true);
    return;
  }
  setMsg("Test-E-Mail versendet — prüfen Sie Ihr Postfach (PIN: 123456).");
}

function setMsg(text, isError = false) {
  const el = document.getElementById("email-msg");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", isError);
}
