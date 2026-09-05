/**
 * Öffentliche Datenschutz- und Impressumsseite plus Admin-Bearbeitung.
 *
 * Hängt sich an #view-privacy, #view-impressum und #view-admin-privacy.
 * Routing (showView) bleibt in app.js — hier nur Inhalt, Druck und Formular.
 * Theme-CSS und SSL-Module werden nicht angefasst.
 */

import { api } from "./websocket.js";
import { t, applyDom, currentLang, onLang } from "./i18n.js";
import { downloadText, simpleMarkdown } from "./export.js";
import { ensureStepUp } from "./stepUp.js";

/**
 * Fallback, wenn /api/privacy nicht erreichbar ist (reiner Datei-Modus).
 * Werte spiegeln die generischen Defaults aus lib/privacy.js.
 */
const FALLBACK = {
  controllerName: "Musterorganisation (öffentliche Verwaltung)",
  controllerAddress: "Musterstraße 1\n12345 Musterstadt",
  controllerEmail: "kontakt@example.invalid",
  controllerPhone: "+49 123 4567890",
  controllerLegalRep: "Gesetzliche Vertretung (Platzhalter)",
  dsbName: "Datenschutzbeauftragte/r der verantwortlichen Stelle",
  dsbEmail: "datenschutz@example.invalid",
  dsbPhone: "+49 123 4567891",
  supervisoryName: "Zuständige Datenschutzaufsichtsbehörde (Platzhalter)",
  supervisoryAddress: "Musterstraße 2\n12345 Musterstadt",
  supervisoryWebsite: "https://example.invalid/aufsicht",
  supervisoryEmail: "poststelle@example.invalid",
  supervisoryPhone: "+49 123 4567892",
  adminSupervisory:
    "Zuständige Fachaufsicht (Platzhalter — bitte im Impressum der verantwortlichen Stelle ergänzen).",
  hostingText:
    "Rechenzentrum der verantwortlichen Stelle / eigener Server in der Europäischen Union.",
  processorNote: "",
  extraText:
    "Pulse dient öffentlichen und anderen Organisationen zur anonymen bzw. datensparsamen Live-Interaktion in Veranstaltungen.",
  standDate: "2026-09-05",
  version: 1,
  accessibilityContact: "Barrierefreiheit: kontakt@example.invalid",
  vatId: "DE 000000000 (USt-IdNr. Platzhalter — vor Produktivbetrieb ersetzen)",
};

/**
 * Aktueller Hash ohne führendes #.
 * @returns {string}
 */
function currentHash() {
  return location.hash.replace(/^#/, "") || "/";
}

/**
 * Füllt Datenschutz- und Impressumstexte sowie das Admin-Formular.
 * Wird von app.js nach showView aufgerufen und bei Sprachwechsel.
 */
export async function fillLegalViews(which) {
  const raw = String(which || currentHash()).replace(/^#/, "").replace(/^\//, "");
  if (raw === "privacy") {
    await renderPrivacy();
    return;
  }
  if (raw === "impressum") {
    await renderImpressum();
    return;
  }
  if (raw === "admin/privacy" || raw === "adminPrivacy") {
    await loadAdminForm();
  }
}

/**
 * Einmaliges Binden von Druck, Download, Admin-Formular und Sprachwechsel.
 */
export function bindPrivacyPages() {
  if (bindPrivacyPages._done) return;
  bindPrivacyPages._done = true;
  document.getElementById("privacy-print")?.addEventListener("click", printPrivacy);
  document.getElementById("impressum-print")?.addEventListener("click", printPrivacy);
  document.getElementById("privacy-download-html")?.addEventListener("click", downloadPrivacyHtml);
  document.getElementById("impressum-download-html")?.addEventListener("click", downloadImpressumHtml);
  bindAdminForm();
  onLang(() => {
    fillLegalViews();
  });
  /* Nach i18n-Init erneut füllen, falls die erste Route vor bootUi lag. */
  fillLegalViews();
}

/**
 * Holt die gerenderte Erklärung vom Server; fällt auf lokale Platzhalter zurück.
 * @returns {Promise<{ html: string, impressumHtml: string, privacy: object, versions?: object[] }>}
 */
async function fetchPayload() {
  const lang = currentLang() || "de";
  const data = await api.getPrivacy(lang);
  if (data?.html) {
    /* Branding-Ergänzung aus der bestehenden Branding-Seite nicht verwerfen. */
    return data;
  }
  return {
    privacy: FALLBACK,
    html: fallbackPrivacyHtml(FALLBACK),
    impressumHtml: fallbackImpressumHtml(FALLBACK),
    versions: [],
    disclaimer: "Mustertext, keine Rechtsberatung.",
  };
}

/**
 * Öffentliche Datenschutzerklärung in #privacy-body.
 */
async function renderPrivacy() {
  const body = document.getElementById("privacy-body");
  const note = document.getElementById("privacy-lang-note");
  if (!body) return;
  const payload = await fetchPayload();
  body.innerHTML = payload.html;
  syncLangNote(note);
  applyDom(document.getElementById("view-privacy") || document);
}

/**
 * Impressum aus denselben Admin-Feldern.
 */
async function renderImpressum() {
  const body = document.getElementById("impressum-body");
  const note = document.getElementById("impressum-lang-note");
  if (!body) return;
  const payload = await fetchPayload();
  body.innerHTML = payload.impressumHtml || fallbackImpressumHtml(payload.privacy || FALLBACK);
  syncLangNote(note);
  applyDom(document.getElementById("view-impressum") || document);
}

/**
 * EN/FR: Hinweis, dass die deutsche Fassung maßgeblich ist.
 * @param {HTMLElement | null} el
 */
function syncLangNote(el) {
  if (!el) return;
  const lang = currentLang();
  if (lang === "de") {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.lang = lang;
  el.textContent = t("privacy.langNote");
}

/**
 * Browser-Druckdialog — „Als PDF sichern“ im Systemdialog, keine Binary-PDF-Bibliothek.
 */
function printPrivacy() {
  window.print();
}

/**
 * Lädt den HTML-Quelltext der gerenderten Erklärung als Datei.
 */
async function downloadPrivacyHtml() {
  const payload = await fetchPayload();
  const doc = wrapHtmlDocument(t("privacy.title"), payload.html);
  downloadText(`datenschutz-pulse.html`, doc, "text/html;charset=utf-8");
}

async function downloadImpressumHtml() {
  const payload = await fetchPayload();
  const doc = wrapHtmlDocument(t("imprint.title"), payload.impressumHtml || "");
  downloadText(`impressum-pulse.html`, doc, "text/html;charset=utf-8");
}

/**
 * Eigenständiges HTML für den Download (ohne App-Chrome).
 * @param {string} title
 * @param {string} inner
 */
function wrapHtmlDocument(title, inner) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${escapeText(title)} — Pulse</title>
<style>
  body { font-family: system-ui, sans-serif; line-height: 1.5; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #16181d; }
  h1, h2 { font-weight: 650; }
  aside { border: 1px solid #ccc; padding: 0.8rem 1rem; margin-bottom: 1.5rem; }
</style>
</head>
<body>
<h1>${escapeText(title)}</h1>
${inner}
</body>
</html>`;
}

function escapeText(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/**
 * Admin-Formular: Felder lesen/schreiben analog Branding (allowLocal + X-Admin-Key).
 */
function bindAdminForm() {
  const form = document.getElementById("privacy-admin-form");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", onAdminSave);
}

/**
 * Felder aus GET /api/privacy in das Admin-Formular.
 */
async function loadAdminForm() {
  const form = document.getElementById("privacy-admin-form");
  if (!form) return;
  const payload = await fetchPayload();
  const p = payload.privacy || FALLBACK;
  setField("privacy-controller-name", p.controllerName);
  setField("privacy-controller-address", p.controllerAddress);
  setField("privacy-controller-email", p.controllerEmail);
  setField("privacy-controller-phone", p.controllerPhone);
  setField("privacy-controller-legal", p.controllerLegalRep);
  setField("privacy-dsb-name", p.dsbName);
  setField("privacy-dsb-email", p.dsbEmail);
  setField("privacy-dsb-phone", p.dsbPhone);
  setField("privacy-supervisory-name", p.supervisoryName);
  setField("privacy-supervisory-address", p.supervisoryAddress);
  setField("privacy-supervisory-website", p.supervisoryWebsite);
  setField("privacy-supervisory-email", p.supervisoryEmail);
  setField("privacy-supervisory-phone", p.supervisoryPhone);
  setField("privacy-admin-supervisory", p.adminSupervisory);
  setField("privacy-hosting", p.hostingText);
  setField("privacy-processor", p.processorNote);
  setField("privacy-extra", p.extraText);
  setField("privacy-stand-date", String(p.standDate || "").slice(0, 10));
  setField("privacy-a11y-contact", p.accessibilityContact);
  setField("privacy-vat", p.vatId);
  renderVersionList(payload.versions || []);
  applyDom(document.getElementById("view-admin-privacy") || document);
  const branding = (await api.getBranding())?.branding;
  if (branding) {
    setField("brand-privacy-url", branding.privacyUrl || "#/privacy");
    setField("brand-impressum-url", branding.impressumUrl || "#/impressum");
    setField("brand-retention", String(branding.retentionDays ?? 30));
    setField("brand-privacy-extra", branding.privacyExtra || "");
  }
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value == null ? "" : String(value);
}

function fieldValue(id) {
  return document.getElementById(id)?.value ?? "";
}

/**
 * Speichert per PUT /api/privacy (gleicher Auth-Weg wie Branding).
 * @param {SubmitEvent} ev
 */
async function onAdminSave(ev) {
  ev.preventDefault();
  if (!(await ensureStepUp())) return;
  const msg = document.getElementById("privacy-admin-msg");
  const body = {
    controllerName: fieldValue("privacy-controller-name"),
    controllerAddress: fieldValue("privacy-controller-address"),
    controllerEmail: fieldValue("privacy-controller-email"),
    controllerPhone: fieldValue("privacy-controller-phone"),
    controllerLegalRep: fieldValue("privacy-controller-legal"),
    dsbName: fieldValue("privacy-dsb-name"),
    dsbEmail: fieldValue("privacy-dsb-email"),
    dsbPhone: fieldValue("privacy-dsb-phone"),
    supervisoryName: fieldValue("privacy-supervisory-name"),
    supervisoryAddress: fieldValue("privacy-supervisory-address"),
    supervisoryWebsite: fieldValue("privacy-supervisory-website"),
    supervisoryEmail: fieldValue("privacy-supervisory-email"),
    supervisoryPhone: fieldValue("privacy-supervisory-phone"),
    adminSupervisory: fieldValue("privacy-admin-supervisory"),
    hostingText: fieldValue("privacy-hosting"),
    processorNote: fieldValue("privacy-processor"),
    extraText: fieldValue("privacy-extra"),
    standDate: fieldValue("privacy-stand-date"),
    accessibilityContact: fieldValue("privacy-a11y-contact"),
    vatId: fieldValue("privacy-vat"),
  };
  const result = await api.savePrivacy(body);
  if (!result?.privacy && !result?.html) {
    if (msg) msg.textContent = t("privacy.admin.error");
    return;
  }
  /* Öffentliche Links und Aufbewahrung liegen im Branding-Store, nicht in den Rechtstexten. */
  await api.saveBranding({
    privacyUrl: fieldValue("brand-privacy-url") || "#/privacy",
    impressumUrl: fieldValue("brand-impressum-url") || "#/impressum",
    retentionDays: Number(document.getElementById("brand-retention")?.value ?? 30),
    privacyExtra: fieldValue("brand-privacy-extra"),
  });
  if (msg) msg.textContent = t("privacy.admin.saved");
  renderVersionList(result.versions || []);
}

/**
 * Versionshistorie unter dem Admin-Formular (keine Secrets).
 * @param {object[]} versions
 */
function renderVersionList(versions) {
  const host = document.getElementById("privacy-version-list");
  if (!host) return;
  host.replaceChildren();
  const rows = (versions || []).slice().reverse();
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = t("privacy.admin.noVersions");
    host.append(p);
    return;
  }
  const ol = document.createElement("ol");
  ol.className = "legal-versions";
  for (const v of rows) {
    const li = document.createElement("li");
    li.textContent = `Version ${v.version} — ${v.standDate || (v.savedAt || "").slice(0, 10)} — ${v.controllerName || ""}`;
    ol.append(li);
  }
  host.append(ol);
}

/**
 * Kurzer Fallback-Text, wenn der Server nicht läuft.
 * Enthält denselben Disclaimer und die generischen Platzhalter.
 * @param {typeof FALLBACK} p
 */
function fallbackPrivacyHtml(p) {
  const extra = p.extraText ? `<p>${simpleMarkdown(p.extraText)}</p>` : "";
  const lang = langNoteFallback();
  return `
<aside class="legal-disclaimer" role="note">
  <p><strong>Mustertext — keine Rechtsberatung.</strong> Prüfung durch die/den DSB der verantwortlichen Stelle erforderlich. Der Server war nicht erreichbar; es wird ein verkürzter Platzhalter angezeigt.</p>
</aside>
${lang}
<p>Stand: ${escapeText(p.standDate)} · ${escapeText(p.controllerName)}</p>
<h2>Verantwortliche Stelle</h2>
<p>${escapeText(p.controllerName)}<br>${escapeText(p.controllerAddress)}<br>${escapeText(p.controllerEmail)} · ${escapeText(p.controllerPhone)}</p>
<h2>Datenschutzbeauftragte Stelle</h2>
<p>${escapeText(p.dsbName)}<br>${escapeText(p.dsbEmail)} · ${escapeText(p.dsbPhone)}</p>
<h2>Aufsicht</h2>
<p>${escapeText(p.supervisoryName)}<br>${escapeText(p.supervisoryAddress)}<br><a href="${escapeText(p.supervisoryWebsite)}" rel="noopener noreferrer">${escapeText(p.supervisoryWebsite)}</a></p>
<p>Rechtsquellen: DSGVO, BDSG, ergänzendes Landesdatenschutzrecht (soweit anwendbar), DDG (§ 5, Nachfolger TMG), TDDDG, BITV 2.0. Keine Cookies, kein Tracking. IP nur als Hash im Audit. Geräte-Typ wird nicht gespeichert.</p>
<p><a href="#/impressum">${escapeText(t("footer.imprint"))}</a></p>
${extra}`;
}

function fallbackImpressumHtml(p) {
  const lang = langNoteFallback();
  return `
<aside class="legal-disclaimer" role="note">
  <p><strong>Mustertext — keine Rechtsberatung.</strong> Angaben nach § 5 DDG (früher § 5 TMG).</p>
</aside>
${lang}
<p>${escapeText(p.controllerName)}<br>${escapeText(p.controllerAddress)}</p>
<p>${escapeText(p.controllerLegalRep)}</p>
<p>${escapeText(p.controllerEmail)} · ${escapeText(p.controllerPhone)}</p>
<p>${escapeText(p.adminSupervisory)}</p>
<p><a href="#/privacy">${escapeText(t("footer.privacy"))}</a></p>`;
}

function langNoteFallback() {
  const lang = currentLang();
  if (lang === "de") return "";
  return `<p class="legal-lang-note" lang="${escapeText(lang)}">${escapeText(t("privacy.langNote"))}</p>`;
}
