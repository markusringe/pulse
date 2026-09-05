#!/usr/bin/env node
/**
 * Privacy-Hilfen ohne HTTP-Server: Platzhalter-Ersatz und Versions-Append.
 * Startet keinen Server und beendet keinen laufenden Prozess auf Port 3000.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  replacePlaceholders,
  escapeHtml,
  appendVersion,
  createPrivacyStore,
  retentionSentence,
  processorParagraph,
  DEFAULTS,
  MAX_VERSIONS,
} = require("../lib/privacy");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* --- Platzhalter --- */
assert(replacePlaceholders("Hallo {{name}}", { name: "Stadt" }) === "Hallo Stadt", "einfacher Ersatz");
assert(replacePlaceholders("{{fehlt}}", { name: "x" }) === "{{fehlt}}", "unbekannter Schlüssel bleibt");
assert(replacePlaceholders("{{name}}", { name: "<b>x</b>" }) === "&lt;b&gt;x&lt;/b&gt;", "HTML-Escape");
assert(
  replacePlaceholders("{{extraHtml}}", { extraHtml: "<em>ok</em>" }) === "<em>ok</em>",
  "HTML-Schlüssel ungeescaped"
);
assert(escapeHtml(`&<>"'`) === "&amp;&lt;&gt;&quot;&#39;", "escapeHtml vollständig");

const days30 = retentionSentence(30);
assert(days30.includes("30"), "Retention 30 Tage");
assert(retentionSentence(0).includes("nie") || retentionSentence(0).toLowerCase().includes("nicht konfiguriert"), "Retention nie");

const avDefault = processorParagraph("");
assert(avDefault.includes("Art. 28"), "bedingter AV-Absatz");
assert(processorParagraph("Host GmbH, Vertrag liegt vor.").includes("Host GmbH"), "AV-Freitext");

/* --- Versionsdatei im Temp-Verzeichnis, nicht data/ des Repos --- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-privacy-"));
const versionsFile = path.join(dir, "privacy-versions.json");

const first = appendVersion(
  { version: 1, standDate: "2026-01-01", controllerName: "Teststadt", extraText: "alpha" },
  { file: versionsFile, max: 3 }
);
assert(first.length === 1, "erste Version");
appendVersion({ version: 2, standDate: "2026-02-01", controllerName: "Teststadt" }, { file: versionsFile, max: 3 });
appendVersion({ version: 3, standDate: "2026-03-01", controllerName: "Teststadt" }, { file: versionsFile, max: 3 });
const capped = appendVersion(
  { version: 4, standDate: "2026-04-01", controllerName: "Teststadt", extraText: "secret-token-bitte-nicht" },
  { file: versionsFile, max: 3 }
);
assert(capped.length === 3, "nur letzte N Versionen");
assert(capped[0].version === 2, "älteste der letzten drei ist Version 2");
assert(capped[2].version === 4, "neueste Version 4");
assert(!JSON.stringify(capped).includes("adminKey"), "kein adminKey in Historie");
assert(MAX_VERSIONS >= 3, "MAX_VERSIONS gesetzt");

/* --- Store: speichern ersetzt Platzhalter in gerendertem HTML --- */
const store = createPrivacyStore({ dataDir: dir });
const saved = store.save({
  controllerName: "Musterkommune am Fluss",
  controllerEmail: "datenschutz@example.invalid",
  extraText: "Zusatz **fett** und [Impressum](#/impressum)",
  standDate: "2026-09-02",
});
assert(saved.record.controllerName === "Musterkommune am Fluss", "Store speichert Name");
assert(saved.record.version === 2, "Version wird erhöht (Default war 1)");
assert(saved.versions.length >= 1, "Store schreibt Historie");

const payload = store.publicPayload({ retentionDays: 30, lang: "de" });
assert(payload.html.includes("Musterkommune am Fluss"), "Name in Erklärung");
assert(payload.html.includes("Mustertext"), "Disclaimer im HTML");
assert(payload.html.includes("Landesdatenschutzrecht") || payload.html.includes("DSGVO"), "Rechtsgrundlagen in Erklärung");
assert(payload.html.includes("Digitale-Dienste-Gesetz") || payload.html.includes("DDG"), "DDG genannt");
assert(payload.html.includes("BITV"), "BITV genannt");
assert(payload.html.includes("datenschutz@example.invalid"), "E-Mail ersetzt");
assert(payload.html.includes("<strong>fett</strong>"), "Markdown-Ergänzung");
assert(payload.html.includes('href="#/impressum"'), "Markdown-Link");
assert(payload.impressumHtml.includes("Musterkommune am Fluss"), "Impressum aus Feldern");
assert(payload.impressumHtml.includes("#/privacy"), "Link zur Datenschutzerklärung");
assert(!payload.html.includes("{{controllerName}}"), "kein unersetzter controllerName");
assert(payload.disclaimer.toLowerCase().includes("muster"), "Disclaimer-Feld");

const en = store.publicPayload({ retentionDays: 7, lang: "en" });
assert(en.html.includes("German version is legally authoritative") || en.html.includes("legally authoritative"), "EN-Hinweis");

/* Unbekanntes Feld im Payload darf den Prototyp nicht überschreiben. */
const poisoned = store.save({ version: 99, __proto__: { polluted: true }, adminKey: "secret", extraText: "ok" });
assert(poisoned.record.adminKey == null, "adminKey nicht persistiert");
assert(poisoned.record.extraText === "ok", "extraText bleibt");

assert(DEFAULTS.controllerName.includes("Musterorganisation"), "Default Musterorganisation");
assert(DEFAULTS.controllerAddress.includes("Musterstadt"), "Default Musterstadt");
assert(DEFAULTS.controllerEmail.includes("example.invalid"), "Platzhalter-E-Mail");
assert(DEFAULTS.dsbEmail.includes("example.invalid"), "DSB-Platzhalter-E-Mail");
assert(DEFAULTS.supervisoryWebsite.includes("example.invalid"), "Aufsicht-Platzhalter");
assert(DEFAULTS.extraText.includes("Pulse"), "Ergänzung nennt Pulse");
assert(DEFAULTS.vatId.includes("Platzhalter"), "USt-IdNr. Platzhalter");

fs.rmSync(dir, { recursive: true, force: true });
console.log("Privacy-Tests OK");
