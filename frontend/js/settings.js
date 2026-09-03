/**
 * Admin-UI: Instanz-Einstellungen als JSON-Datei exportieren und importieren.
 *
 * Liegt absichtlich nicht in app.js. Branding-Seite zeigt den vollen Block,
 * Privacy- und SSL-Seiten nur einen Sprung-Link. Nach dem Import werden
 * Branding (Logo), Rechtstexte und SSL-Zertifikate neu geladen — Sessions bleiben.
 */

import { api } from "./websocket.js?v=nav8";
import { t, applyDom, onLang } from "./i18n.js?v=nav13";
import { ensureStepUp, withStepUp } from "./stepUp.js?v=nav35";
import { getAuthSettings, updateAuthSettings, getAuthUser } from "./authClient.js?v=nav30";

/** Dateiname analog Server Content-Disposition. */
const DOWNLOAD_NAME = "pulse-settings.json";

/** Erwartete Schema-Version; 1 (ohne PEM) und 2 (mit Grafiken/Zertifikaten) sind gültig. */
const SCHEMA_VERSION = 2;
const ACCEPTED_SCHEMA = [1, 2];

/** @type {{ applyBranding?: Function, fillLegalViews?: Function, renderLangSwitch?: Function }} */
let hooks = {};

/** Zuletzt gewähltes Bundle, erst nach Bestätigen gesendet. */
let pendingBundle = null;

/**
 * Bindet Export/Import. Mehrfachaufruf ist unkritisch (Flag am Panel).
 * @param {{ applyBranding?: Function, fillLegalViews?: Function, renderLangSwitch?: Function }} [options]
 */
export function bindSettingsPanel(options = {}) {
  hooks = options;
  const panel = document.getElementById("settings-panel");
  if (!panel) return;
  if (panel.dataset.bound === "1") {
    applyDom(document.getElementById("view-settings") || panel);
    return;
  }
  panel.dataset.bound = "1";
  document.getElementById("settings-export")?.addEventListener("click", onExport);
  document.getElementById("settings-import-file")?.addEventListener("change", onFileChosen);
  document.getElementById("settings-import-confirm")?.addEventListener("click", onConfirmImport);
  document.getElementById("settings-import-cancel")?.addEventListener("click", onCancelImport);
  document.getElementById("auth-self-reg")?.addEventListener("change", onAuthSettingsSave);
  onLang(() => {
    applyDom(document.getElementById("view-settings") || panel);
    if (pendingBundle) renderPreview(pendingBundle);
  });
  applyDom(document.getElementById("view-settings") || panel);
  refreshAuthSettingsPanel();
}

/** Auth-Einstellungen (Selbstregistrierung) laden — nur für Admins sichtbar. */
export async function refreshAuthSettingsPanel() {
  const box = document.getElementById("auth-settings-panel");
  if (!box) return;
  const me = getAuthUser();
  if (!me || me.role !== "admin") {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const r = await getAuthSettings();
  const enabled = Boolean(r.data?.settings?.selfRegistrationEnabled);
  const chk = document.getElementById("auth-self-reg");
  if (chk) chk.checked = enabled;
}

async function onAuthSettingsSave() {
  const msg = document.getElementById("auth-settings-msg");
  const selfRegistrationEnabled = Boolean(document.getElementById("auth-self-reg")?.checked);
  const r = await withStepUp(() => updateAuthSettings({ selfRegistrationEnabled }));
  if (msg) {
    msg.textContent = r.ok ? "Auth-Einstellungen gespeichert." : r.data?.error || "Speichern fehlgeschlagen";
  }
  if (!r.ok) await refreshAuthSettingsPanel();
}

/**
 * GET /api/settings/export → Datei-Download (Auth-Header wie Branding).
 */
async function onExport() {
  const msg = statusEl();
  setStatus("");
  if (!(await ensureStepUp())) return;
  try {
    const result = await api.exportSettings();
    if (!result?.ok) {
      if (result?.data?.code === "step_up_required") return;
      setStatus(errorFromResult(result), true);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = DOWNLOAD_NAME;
    a.click();
    URL.revokeObjectURL(url);
    if (msg) msg.textContent = t("settings.exported");
  } catch {
    setStatus(t("settings.error.generic"), true);
  }
}

/**
 * Datei nur lesen und Vorschau zeigen — noch nichts überschreiben.
 * @param {Event} ev
 */
function onFileChosen(ev) {
  const file = ev.target.files?.[0];
  pendingBundle = null;
  hidePreview();
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      setStatus(t("settings.error.json"), true);
      return;
    }
    const preview = inspectBundle(parsed);
    if (preview.error) {
      setStatus(preview.error, true);
      return;
    }
    pendingBundle = parsed;
    renderPreview(parsed, preview);
    setStatus("");
  };
  reader.onerror = () => setStatus(t("settings.error.json"), true);
  reader.readAsText(file);
}

/**
 * Client-seitige Grobrüfung vor dem POST (Server validiert erneut).
 * @param {object} obj
 * @returns {{ error?: string, branding: boolean, privacy: boolean, sslCount: number, sslFiles: number, hasLogo: boolean, hasAccount: boolean, schemaVersion: * }}
 */
function inspectBundle(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { error: t("settings.error.json"), branding: false, privacy: false, sslCount: 0, sslFiles: 0, hasLogo: false, hasAccount: false, schemaVersion: null };
  }
  const ver = Number(obj.schemaVersion);
  if (!Number.isFinite(ver) || !ACCEPTED_SCHEMA.includes(ver)) {
    return {
      error: t("settings.error.schema", {
        expected: ACCEPTED_SCHEMA.join(" / "),
        got: String(obj.schemaVersion ?? "—"),
      }),
      branding: false,
      privacy: false,
      sslCount: 0,
      sslFiles: 0,
      hasLogo: false,
      hasAccount: false,
      schemaVersion: obj.schemaVersion,
    };
  }
  const ssl = obj.ssl;
  const certs = Array.isArray(ssl) ? ssl : Array.isArray(ssl?.certificates) ? ssl.certificates : [];
  const sslCount = certs.length;
  const sslFiles = certs.filter((c) => c && c.files && (c.files.privkey || c.files.cert)).length;
  const hasLogo = Boolean(obj.branding && obj.branding.logo);
  return {
    branding: Boolean(obj.branding && typeof obj.branding === "object"),
    privacy: Boolean(obj.privacy && typeof obj.privacy === "object"),
    sslCount,
    sslFiles,
    hasLogo,
    hasAccount: Boolean(ssl && !Array.isArray(ssl) && ssl.accountPem),
    schemaVersion: obj.schemaVersion,
  };
}

/**
 * Vorschau: Branding, Logo, Privacy und ob PEM-Dateien zurückgeschrieben werden.
 * @param {object} bundle
 * @param {ReturnType<typeof inspectBundle>} [info]
 */
function renderPreview(bundle, info) {
  const box = document.getElementById("settings-preview");
  const list = document.getElementById("settings-preview-list");
  if (!box || !list) return;
  const meta = info || inspectBundle(bundle);
  const branding = bundle.branding || {};
  const privacy = bundle.privacy?.record && typeof bundle.privacy.record === "object" ? bundle.privacy.record : bundle.privacy || {};
  const versions = Array.isArray(bundle.privacy?.versions) ? bundle.privacy.versions.length : 0;
  const items = [];
  if (meta.branding) {
    items.push(
      t("settings.preview.branding", {
        colors: [branding.primary, branding.secondary].filter(Boolean).join(" / ") || "—",
        home: branding.homepageUrl || "—",
        langs: Array.isArray(branding.languages) ? branding.languages.join(", ") : "—",
      })
    );
    items.push(t(meta.hasLogo ? "settings.preview.logoYes" : "settings.preview.logoNo"));
  }
  if (meta.privacy) {
    items.push(
      t("settings.preview.privacy", {
        name: privacy.controllerName || "—",
        stand: privacy.standDate || "—",
        n: String(versions),
      })
    );
  }
  if (meta.sslFiles || meta.hasAccount) {
    items.push(
      t("settings.preview.sslRestore", {
        n: String(meta.sslFiles || 0),
        account: meta.hasAccount ? t("settings.preview.sslAccountYes") : t("settings.preview.sslAccountNo"),
      })
    );
  } else {
    items.push(t("settings.preview.sslSkip", { n: String(meta.sslCount || 0) }));
  }
  items.push(t("settings.preview.secret"));
  list.replaceChildren();
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
  box.hidden = false;
}

function hidePreview() {
  const box = document.getElementById("settings-preview");
  if (box) box.hidden = true;
}

function onCancelImport() {
  pendingBundle = null;
  hidePreview();
  const input = document.getElementById("settings-import-file");
  if (input) input.value = "";
  setStatus("");
}

/**
 * POST /api/settings/import nach Bestätigung. Logo und PEMs werden mitgeschrieben.
 */
async function onConfirmImport() {
  if (!pendingBundle) {
    setStatus(t("settings.error.json"), true);
    return;
  }
  if (!(await ensureStepUp())) return;
  setStatus(t("settings.importing"));
  const result = await api.importSettings(pendingBundle);
  if (!result?.ok) {
    if (result?.data?.code === "step_up_required") return;
    setStatus(errorFromResult(result), true);
    return;
  }
  const data = result.data || {};
  pendingBundle = null;
  hidePreview();
  const input = document.getElementById("settings-import-file");
  if (input) input.value = "";

  const branding = data.branding;
  if (branding && typeof hooks.applyBranding === "function") {
    hooks.applyBranding(branding);
  }
  fillBrandingForm(branding);
  if (typeof hooks.renderLangSwitch === "function") hooks.renderLangSwitch();
  if (typeof hooks.fillLegalViews === "function") await hooks.fillLegalViews();

  const sslNote = data.ssl && data.ssl.imported ? ` ${t("settings.sslImported")}` : data.ssl && data.ssl.skipped ? ` ${t("settings.sslHint")}` : "";
  setStatus(`${t("settings.success")}${sslNote}`);
}

/**
 * Branding-Formularfelder an den importierten Stand anpassen (ohne Submit-Handler neu zu binden).
 * @param {object} [b]
 */
function fillBrandingForm(b) {
  if (!b) return;
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : String(value);
  };
  setVal("brand-primary", b.primary || "#007CC1");
  setVal("brand-secondary", b.secondary || "#F99700");
  setVal("brand-bg", b.bg || "#ffffff");
  setVal("brand-footer", b.footerText || "");
  setVal("brand-privacy-url", b.privacyUrl || "#/privacy");
  setVal("brand-impressum-url", b.impressumUrl || "#/impressum");
  setVal("brand-retention", String(b.retentionDays ?? 30));
  setVal("brand-privacy-extra", b.privacyExtra || "");
  setVal("brand-homepage-url", b.homepageUrl || "");
  setVal("brand-interval", String(b.questionIntervalSec || 30));
  setVal("brand-extra-words", (b.extraWords || []).join(", "));
  setVal("brand-app-name", b.appName || "Pulse");
  setVal("brand-custom-domain", b.customDomain || "");
  setVal("brand-transition", b.slideTransition || "slide");
  const wf = document.getElementById("brand-wordfilter");
  if (wf) wf.checked = b.wordFilter !== false;
  const footHide = document.getElementById("brand-footer-hidden");
  if (footHide) footHide.checked = Boolean(b.footerHidden);
  const stageLogo = document.getElementById("brand-stage-logo");
  if (stageLogo) stageLogo.checked = Boolean(b.stageShowLogo);
  const stageFoot = document.getElementById("brand-stage-footer");
  if (stageFoot) stageFoot.checked = Boolean(b.stageShowFooter);
  setVal("brand-qa-limit", String(b.qaDefaultLimitSec ?? 60));
  const form = document.getElementById("branding-form");
  if (form) {
    form._logo = b.logo || "";
    form._customFont = b.customFont || "";
    form._slideBackground = b.slideBackground || "";
    form._sound = b.sound || "";
    form._favicon = b.favicon || "";
  }
  const preview = document.getElementById("brand-logo-preview");
  if (preview) {
    if (b.logo) {
      preview.src = b.logo;
      preview.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
    }
  }
  form?.querySelectorAll("input[name=lang]")?.forEach((c) => {
    c.checked = (b.languages || ["de"]).includes(c.value);
  });
}

function statusEl() {
  return document.getElementById("settings-msg");
}

function setStatus(text, isError = false) {
  const el = statusEl();
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("settings-msg-error", Boolean(isError && text));
}

function errorFromResult(result) {
  const data = result?.data || {};
  const code = data.code;
  if (result?.status === 403) return t("settings.error.auth");
  if (code === "schema") return data.error || t("settings.error.schema", { expected: "1 / 2", got: "—" });
  if (code === "json" || result?.status === 400) return data.error || t("settings.error.json");
  return data.error || t("settings.error.generic");
}
