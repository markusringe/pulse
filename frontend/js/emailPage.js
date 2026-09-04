/**
 * Admin-UI: E-Mail-Versand konfigurieren (SMTP, Sendmail, Mailgun oder deaktiviert).
 * Route: #/admin/email
 */

import {
  getEmailConfig,
  saveEmailConfig,
  sendTestEmail,
  getAuthUser,
  getEmailDomainDns,
  verifyEmailDomain,
} from "./authClient.js";
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
  document.getElementById("email-dns-refresh")?.addEventListener("click", onDnsRefresh);
  document.getElementById("email-dns-verify")?.addEventListener("click", onDnsVerify);
}

function onProviderChange() {
  syncProviderPanels();
}

function syncProviderPanels() {
  const provider = document.getElementById("email-provider")?.value || "none";
  document.getElementById("email-smtp-panel")?.toggleAttribute("hidden", provider !== "smtp");
  document.getElementById("email-sendmail-panel")?.toggleAttribute("hidden", provider !== "sendmail");
  document.getElementById("email-mailgun-panel")?.toggleAttribute("hidden", provider !== "mailgun");
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
  setField("email-confirmed-admin", cfg.confirmedAdminEmail || "");
  setField("email-mailgun-from", cfg.from || "");
  const passHint = document.getElementById("email-smtp-pass-hint");
  if (passHint) passHint.textContent = cfg.smtpPassSet ? "Passwort gespeichert — leer lassen zum Beibehalten." : "Noch kein Passwort gespeichert.";
  const mgEnv = document.getElementById("email-mailgun-env");
  if (mgEnv) {
    if (health.mailgunConfigured) {
      mgEnv.textContent = `Mailgun aktiv (${health.mailgunRegion || "eu"}) · Domain ${health.mailgunDomain || "—"}`;
    } else {
      mgEnv.textContent = "Mailgun-Env fehlt — Versand nur in Dev über Capture-Mailbox.";
    }
  }
  const status = document.getElementById("email-status");
  if (status) {
    status.textContent = health.configured
      ? `Versand aktiv (${health.provider})`
      : "Kein E-Mail-Versand — Anmeldung per Kennwort";
  }
  syncProviderPanels();
  setMsg("");
  if (cfg.provider === "mailgun" && health.mailgunConfigured) {
    await loadDnsTable(false);
  }
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
  if (provider === "mailgun") {
    body.from = document.getElementById("email-mailgun-from")?.value || "";
    body.confirmedAdminEmail = document.getElementById("email-confirmed-admin")?.value || "";
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
  const provider = document.getElementById("email-provider")?.value;
  const me = getAuthUser();
  let to = me?.email || "";
  if (provider === "mailgun") {
    to = document.getElementById("email-confirmed-admin")?.value || to;
  }
  const r = await withStepUp(() => sendTestEmail({ to }));
  if (!r.ok) {
    setMsg(r.data?.error || "Test-E-Mail fehlgeschlagen.", true);
    return;
  }
  setMsg("Test-E-Mail versendet — prüfen Sie Ihr Postfach (PIN: 123456).");
}

/** DNS-Tabelle aus Mailgun-API rendern. */
function renderDnsTable(dns) {
  const el = document.getElementById("email-dns-table");
  if (!el || !dns) return;
  const rows = [];
  if (dns.state) rows.push(`<p><strong>Status:</strong> ${escapeHtml(dns.state)}</p>`);
  for (const rec of dns.sending || []) {
    rows.push(
      `<div class="email-dns-row"><strong>${escapeHtml(rec.purpose || rec.type)}</strong> ` +
        `${rec.valid ? "✓" : "○"} ${escapeHtml(rec.type)} ${escapeHtml(rec.name)} → ` +
        `<code>${escapeHtml(rec.value || "")}</code></div>`
    );
  }
  if (dns.dmarc) {
    rows.push(
      `<div class="email-dns-row"><strong>DMARC</strong> TXT _dmarc → ` +
        `<code>${escapeHtml(dns.dmarc.value || "")}</code></div>`
    );
  }
  el.innerHTML = rows.length ? rows.join("") : "<p>Keine DNS-Daten.</p>";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadDnsTable(showErrors = true) {
  const r = await getEmailDomainDns();
  if (!r.ok) {
    if (showErrors) setMsg(r.data?.error || "DNS konnte nicht geladen werden.", true);
    return;
  }
  renderDnsTable(r.data?.dns);
}

async function onDnsRefresh() {
  if (!(await ensureStepUp())) return;
  await loadDnsTable(true);
  setMsg("DNS-Einträge aktualisiert.");
}

async function onDnsVerify() {
  if (!(await ensureStepUp())) return;
  const r = await withStepUp(() => verifyEmailDomain());
  if (!r.ok) {
    setMsg(r.data?.error || "DNS-Verifikation fehlgeschlagen.", true);
    return;
  }
  renderDnsTable(r.data?.dns);
  setMsg(r.data?.message || "DNS-Verifikation angestoßen.");
}

function setMsg(text, isError = false) {
  const el = document.getElementById("email-msg");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", isError);
}
