/**
 * Admin-UI für Let's-Encrypt-Zertifikate: beantragen, Status, erneuern, löschen.
 * Pollt, solange der Status „pending“ (Läuft) ist — ACME kann einige Sekunden dauern.
 *
 * Texte: erst nach i18nReady, plus deutsche Fallbacks, damit nie ssl.title
 * oder ssl.https.off als Rohschlüssel auf der Seite stehen.
 */

import { api } from "./websocket.js";
import { t, applyDom, onLang, i18nReady } from "./i18n.js";
import { ensureStepUp } from "./stepUp.js";

let pollTimer = 0;

const STATUS_I18N = {
  active: "ssl.status.active",
  pending: "ssl.status.pending",
  error: "ssl.status.error",
  expired: "ssl.status.expired",
};

/** Deutsche Nottexte, falls das Wörterbuch noch leer ist. */
const DE = {
  "ssl.status.active": "Aktiv",
  "ssl.status.pending": "Läuft",
  "ssl.status.error": "Fehler",
  "ssl.status.expired": "Abgelaufen",
  "ssl.acme.ready": "Let’s-Encrypt-Client ist bereit.",
  "ssl.acme.missing": "Paket acme-client fehlt — bitte auf dem Server npm install ausführen.",
  "ssl.https.on": "HTTPS aktiv auf Port {port} (Reload ohne Server-Neustart).",
  "ssl.https.off": "HTTPS wartet auf ein gültiges Zertifikat (Port {port}).",
  "ssl.hint.port80":
    "Let’s Encrypt prüft HTTP-01 immer auf Port 80. Hinter einem Reverse-Proxy diesen Pfad weiterleiten: /.well-known/acme-challenge/",
  "ssl.empty": "Noch kein Zertifikat beantragt.",
  "ssl.staging": "Staging",
  "ssl.expires": "Gültig bis",
  "ssl.renew": "Erneuern",
  "ssl.delete": "Löschen",
  "ssl.delete.confirm": "Zertifikat für {domain} wirklich löschen?",
  "ssl.error.generic": "Die Anfrage ist fehlgeschlagen.",
  "ssl.issued.started": "Antrag läuft. Der Status aktualisiert sich automatisch.",
};

function $(id) {
  return document.getElementById(id);
}

/**
 * Übersetzung mit deutschem Fallback — nie den Schlüssel selbst anzeigen.
 * @param {string} key
 * @param {Record<string, string>} [vars]
 */
function tx(key, vars = {}) {
  const got = t(key, vars);
  if (got && got !== key) return got;
  let s = DE[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

function statusLabel(status) {
  const key = STATUS_I18N[status] || "ssl.status.error";
  return tx(key);
}

function formatDate(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

/**
 * Bindet Formular und Liste. Mehrfachaufruf ist unkritisch (Flag am Formular).
 */
export function bindSslPage() {
  const form = $("ssl-form");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", onIssue);
  $("ssl-list")?.addEventListener("click", onListClick);
  onLang(() => {
    if (location.hash.replace(/^#/, "") === "/admin/ssl") refreshSsl();
  });
}

export async function showSslPage() {
  bindSslPage();
  await i18nReady;
  applyDom(document.getElementById("view-ssl") || document);
  await refreshSsl();
}

async function refreshSsl() {
  const data = await api.sslList();
  const https = data?.https || {};
  const certs = data?.certificates || [];
  renderHttpsMeta(https);
  renderList(certs);
  const pending = certs.some((c) => c.status === "pending");
  schedulePoll(pending);
}

function renderHttpsMeta(https) {
  const box = $("ssl-https-meta");
  if (!box) return;
  const acme = https.acmeReady ? tx("ssl.acme.ready") : tx("ssl.acme.missing");
  const listen = https.listening
    ? tx("ssl.https.on", { port: String(https.port || "") })
    : tx("ssl.https.off", { port: String(https.port || "") });
  const portHint =
    Number(https.httpPort) === 80 ? "" : `<p class="muted">${escapeHtml(tx("ssl.hint.port80"))}</p>`;
  box.innerHTML = `<p>${escapeHtml(listen)}</p><p class="muted">${escapeHtml(acme)}</p>${portHint}`;
}

function renderList(certs) {
  const root = $("ssl-list");
  if (!root) return;
  if (!certs.length) {
    root.innerHTML = `<p class="muted">${escapeHtml(tx("ssl.empty"))}</p>`;
    return;
  }
  root.innerHTML = certs
    .map((c) => {
      const err = c.error ? `<p class="ssl-error">${escapeHtml(c.error)}</p>` : "";
      const staging = c.staging ? ` <span class="ssl-pill">${escapeHtml(tx("ssl.staging"))}</span>` : "";
      return `<article class="ssl-card" data-domain="${escapeHtml(c.domain)}">
        <header class="ssl-card-head">
          <strong>${escapeHtml(c.domain)}</strong>
          <span class="ssl-status" data-status="${escapeHtml(c.status)}">${escapeHtml(statusLabel(c.status))}</span>
          ${staging}
        </header>
        <p class="muted">${escapeHtml(tx("ssl.expires"))}: ${escapeHtml(formatDate(c.expiresAt))}</p>
        <p class="muted">${escapeHtml(c.email || "")}</p>
        ${err}
        <div class="ssl-actions">
          <button type="button" class="btn ghost" data-ssl="renew">${escapeHtml(tx("ssl.renew"))}</button>
          <button type="button" class="btn ghost" data-ssl="delete">${escapeHtml(tx("ssl.delete"))}</button>
        </div>
      </article>`;
    })
    .join("");
}

function schedulePoll(on) {
  window.clearInterval(pollTimer);
  pollTimer = 0;
  if (!on) return;
  pollTimer = window.setInterval(() => {
    if (location.hash.replace(/^#/, "") !== "/admin/ssl") {
      window.clearInterval(pollTimer);
      pollTimer = 0;
      return;
    }
    refreshSsl();
  }, 2000);
}

async function onIssue(ev) {
  ev.preventDefault();
  if (!(await ensureStepUp())) return;
  const msg = $("ssl-form-msg");
  if (msg) msg.textContent = "";
  const domain = $("ssl-domain")?.value || "";
  const email = $("ssl-email")?.value || "";
  const terms = Boolean($("ssl-terms")?.checked);
  const staging = Boolean($("ssl-staging")?.checked);
  const autoRenew = Boolean($("ssl-autorenew")?.checked);
  const result = await api.sslIssue({ domain, email, terms, staging, autoRenew, allowLocal: true });
  if (!result?.ok) {
    if (msg) msg.textContent = result?.data?.error || tx("ssl.error.generic");
    return;
  }
  if (msg) msg.textContent = tx("ssl.issued.started");
  await refreshSsl();
}

async function onListClick(ev) {
  const btn = ev.target.closest("[data-ssl]");
  if (!btn) return;
  const card = btn.closest("[data-domain]");
  const domain = card?.dataset.domain;
  if (!domain) return;
  if (btn.dataset.ssl === "renew") {
    if (!(await ensureStepUp())) return;
    const result = await api.sslRenew(domain);
    if (!result?.ok) {
      window.alert(result?.data?.error || tx("ssl.error.generic"));
      return;
    }
    await refreshSsl();
    return;
  }
  if (btn.dataset.ssl === "delete") {
    if (!window.confirm(tx("ssl.delete.confirm", { domain }))) return;
    if (!(await ensureStepUp())) return;
    const result = await api.sslDelete(domain);
    if (!result?.ok) {
      window.alert(result?.data?.error || tx("ssl.error.generic"));
      return;
    }
    await refreshSsl();
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
