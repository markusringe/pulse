/**
 * Datenschutz- und Impressumstexte für Pulse (öffentliche Verwaltung).
 *
 * Speicherung:
 *   data/privacy.json           — aktuelle Platzhalter / Admin-Felder
 *   data/privacy-versions.json  — letzte N Stände (kein Secret)
 *
 * Der Fließtext ist ein Muster. Er ist keine Rechtsberatung.
 * Vor dem produktiven Einsatz muss die/der DSB der verantwortlichen Stelle prüfen.
 *
 * Tests können ein eigenes Verzeichnis über createPrivacyStore({ dataDir }) nutzen.
 */

const fs = require("fs");
const path = require("path");

/** Wie viele alte Stände in der Versionsdatei bleiben. */
const MAX_VERSIONS = 20;

/** Öffentliche UDIS-Kontaktdaten (Stand Webrecherche 2026-09, datenschutz.saarland.de). */
const UDIS = {
  name: "Unabhängiges Datenschutzzentrum Saarland (UDIS)\nLandesbeauftragte für Datenschutz und Informationsfreiheit",
  address: "Fritz-Dobisch-Straße 12, 66111 Saarbrücken\nPostfach 10 26 31, 66026 Saarbrücken",
  website: "https://www.datenschutz.saarland.de",
  email: "poststelle@datenschutz.saarland.de",
  phone: "0681 94781-0",
};

/**
 * Standardwerte laut öffentlichen Seiten der Landeshauptstadt (Stand Abruf 2026-09-02).
 *
 * Quellen:
 *   Impressum  https://www.saarbruecken.de/impressum
 *   Datenschutz https://www.saarbruecken.de/fusszeile/datenschutz
 *   Kontakt    https://www.saarbruecken.de/fusszeile/kontakt
 *
 * Anschrift: Rathaus St. Johann, Rathausplatz 1, 66111 Saarbrücken
 * (nicht Schlossplatz 1 / 66119 — das ist das Alte Rathaus / VHS).
 *
 * DSB: Abschnitt II der Stadt-Datenschutzerklärung und der Organisationsplan
 * nennen Thorsten Carbon; Funktionspostfach datenschutz@saarbruecken.de.
 * Keine erfundene Biografie, nur die auf der Website genannten Kontakte.
 *
 * UDIS bleibt unverändert (datenschutz.saarland.de).
 */
const DEFAULTS = {
  controllerName: "Landeshauptstadt Saarbrücken",
  controllerAddress: "Rathaus St. Johann\nRathausplatz 1\n66111 Saarbrücken",
  controllerEmail: "stadt@saarbruecken.de",
  controllerPhone: "+49 681 9050",
  controllerLegalRep: "Oberbürgermeister Uwe Conradt",
  dsbName: "Thorsten Carbon, Datenschutzbeauftragter der Landeshauptstadt Saarbrücken",
  dsbEmail: "datenschutz@saarbruecken.de",
  dsbPhone: "+49 681 905-5074",
  supervisoryName: UDIS.name,
  supervisoryAddress: UDIS.address,
  supervisoryWebsite: UDIS.website,
  supervisoryEmail: UDIS.email,
  supervisoryPhone: UDIS.phone,
  /* Untere Kommunalaufsicht: Landesverwaltungsamt (saarland.de); oberste: MIBS. */
  adminSupervisory:
    "Landesverwaltungsamt Saarland (Kommunalaufsicht), Am Markt 7, 66386 St. Ingbert. Oberste Kommunalaufsicht: Ministerium für Inneres, Bauen und Sport des Saarlandes.",
  hostingText:
    "Rechenzentrum der verantwortlichen Stelle / eigener Server in der Europäischen Union. Eine Übermittlung in Drittländer findet im Standardbetrieb nicht statt.",
  /* Leer = bedingter Absatz „falls Auftragsverarbeiter eingesetzt werden“. */
  processorNote: "",
  extraText:
    "Pulse ist ein Angebot der Landeshauptstadt Saarbrücken. Die lokale Verarbeitung in dieser Anwendung (anonyme Teilnahme, keine Tracking-Cookies für Teilnehmende, Speicherung auf dem Server der verantwortlichen Stelle) ist in den Abschnitten dieser Erklärung beschrieben.\n\n**Administration (optional):** Wenn die Instanz-Benutzerverwaltung aktiv ist, melden sich Administratoren und Redakteure mit E-Mail und einmaligem Anmeldecode an. Dabei wird ein technisch notwendiges Session-Cookie gesetzt; Teilnehmende an Umfragen sind davon nicht betroffen.\n\nDie ausführliche Datenschutzerklärung der Stadtwebsite gilt ergänzend: [Datenschutz der Landeshauptstadt Saarbrücken](https://www.saarbruecken.de/fusszeile/datenschutz). Anbieterkennzeichnung der Stadt: [Impressum](https://www.saarbruecken.de/impressum).",
  standDate: "2026-09-02",
  version: 1,
  accessibilityContact: "Internetredaktion der Landeshauptstadt Saarbrücken, internet@saarbruecken.de",
  vatId: "DE 138116928 (USt-IdNr. gem. § 27a UStG, laut Impressum der Landeshauptstadt)",
};

/** Schlüssel, deren Werte bereits HTML sind und nicht erneut escaped werden. */
const HTML_KEYS = new Set([
  "extraHtml",
  "avHtml",
  "versionListHtml",
  "sslHtml",
  "langNoteHtml",
  "retentionHtml",
  "processorHtml",
  "kdgHtml",
]);

/**
 * HTML-Sonderzeichen maskieren, damit Admin-Freitext nicht ins DOM bricht.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

/**
 * Sehr kleines Markdown wie im Footer: Zeilenumbruch, **fett**, [Text](url|#hash).
 * Zuerst wird escaped, danach werden nur die erlaubten Markierungen eingesetzt.
 * @param {string} src
 * @returns {string}
 */
function simpleMarkdown(src) {
  const escaped = escapeHtml(src);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+|#[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, "<br>");
}

/**
 * Ersetzt {{platzhalter}} in einem Mustertext.
 * Unbekannte Schlüssel bleiben stehen, damit Tests fehlende Felder erkennen.
 *
 * @param {string} template
 * @param {Record<string, *>} data
 * @param {{ escape?: boolean, htmlKeys?: Set<string> }} [opts]
 * @returns {string}
 */
function replacePlaceholders(template, data, opts = {}) {
  const doEscape = opts.escape !== false;
  const htmlKeys = opts.htmlKeys || HTML_KEYS;
  const map = data && typeof data === "object" ? data : {};
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (all, key) => {
    if (!Object.prototype.hasOwnProperty.call(map, key)) return all;
    const raw = map[key] == null ? "" : String(map[key]);
    if (!doEscape || htmlKeys.has(key)) return raw;
    return escapeHtml(raw);
  });
}

/**
 * Satz zur Speicherdauer der Umfrage-Sessions (Branding retentionDays).
 * @param {number|string} days
 * @returns {string}
 */
function retentionSentence(days) {
  const n = Number(days);
  if (!n) {
    return "Eine automatische Löschung von Umfrage-Sitzungen ist derzeit nicht konfiguriert (Einstellung „nie“). Die verantwortliche Stelle löscht Daten, sobald der Zweck entfällt oder eine gesetzliche Pflicht endet.";
  }
  return `Umfrage-Sitzungen einschließlich Folien, Stimmen, Wortwolken-Einträgen, Q&amp;A-Beiträgen und Quiz-Ergebnissen werden nach ${n} Tagen automatisch per Lösch-Sweep entfernt (konfigurierbar: 7, 30 oder 90 Tage bzw. keine automatische Löschung). Voreinstellung der Instanz: ${n} Tage.`;
}

/**
 * Bedingter Absatz Auftragsverarbeitung Art. 28 DSGVO.
 * @param {string} processorNote
 * @returns {string}
 */
function processorParagraph(processorNote) {
  const note = String(processorNote || "").trim();
  if (note) {
    return `<p>${simpleMarkdown(note)}</p>`;
  }
  return `<p>Soweit die verantwortliche Stelle <strong>keine</strong> externen Auftragsverarbeiter einsetzt, findet keine Drittweitergabe statt. Werden später Hosting-, Wartungs- oder Support-Dienstleister beauftragt, erfolgt dies nur auf Grundlage eines Vertrags nach Art. 28 DSGVO. Dieser Absatz ist dann vom DSB um die konkreten Empfänger zu ergänzen.</p>`;
}

/**
 * Nur öffentlich unbedenkliche Felder für die Versionshistorie (kein Secret).
 * @param {object} rec
 * @returns {object}
 */
function versionSnapshot(rec) {
  const extra = String(rec.extraText || "");
  return {
    version: Number(rec.version) || 1,
    savedAt: rec.savedAt || new Date().toISOString(),
    standDate: rec.standDate || "",
    controllerName: rec.controllerName || "",
    dsbName: rec.dsbName || "",
    hostingText: rec.hostingText || "",
    extraPreview: extra.length > 400 ? `${extra.slice(0, 400)}…` : extra,
  };
}

/**
 * Hängt einen Stand an die Versionsdatei und kürzt auf die letzten N Einträge.
 * @param {object} entry
 * @param {{ max?: number, file?: string }} [opts]
 * @returns {object[]}
 */
function appendVersion(entry, opts = {}) {
  const max = Number(opts.max) > 0 ? Number(opts.max) : MAX_VERSIONS;
  const file = opts.file;
  if (!file) throw new Error("appendVersion: Dateipfad fehlt");
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  list.push(versionSnapshot(entry));
  list = list.slice(-max);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
  return list;
}

/**
 * Liest die Versionsdatei.
 * @param {string} file
 * @returns {object[]}
 */
function readVersions(file) {
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Erlaubt nur http(s)-URLs für Website-Felder.
 * @param {string} url
 * @returns {string}
 */
function sanitizeHttpUrl(url) {
  const s = String(url || "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

/**
 * Nimmt nur bekannte Felder aus einem Admin-Payload; keine Secrets, keine Prototyp-Keys.
 * @param {object} partial
 * @param {object} current
 * @returns {object}
 */
function sanitizeInput(partial, current) {
  const src = partial && typeof partial === "object" ? partial : {};
  const next = { ...current };
  for (const key of Object.keys(DEFAULTS)) {
    if (key === "version") continue;
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    if (key === "supervisoryWebsite") {
      next[key] = sanitizeHttpUrl(src[key]) || DEFAULTS.supervisoryWebsite;
      continue;
    }
    next[key] = src[key] == null ? "" : String(src[key]);
  }
  if (src.standDate) {
    next.standDate = String(src.standDate).slice(0, 32);
  } else if (!next.standDate) {
    next.standDate = new Date().toISOString().slice(0, 10);
  }
  return next;
}

/**
 * HTML-Liste der Versionshistorie.
 * @param {object[]} versions
 * @returns {string}
 */
function versionListHtml(versions) {
  const rows = (versions || []).slice().reverse();
  if (!rows.length) return "<p>Noch keine frühere Fassung gespeichert.</p>";
  const items = rows
    .map((v) => {
      const date = escapeHtml(v.standDate || (v.savedAt || "").slice(0, 10));
      const saved = escapeHtml(v.savedAt || "");
      const who = escapeHtml(v.controllerName || "");
      return `<li>Version ${escapeHtml(v.version)} — Stand ${date}${saved ? ` (gespeichert ${saved})` : ""}${who ? ` — ${who}` : ""}</li>`;
    })
    .join("");
  return `<ol class="legal-versions">${items}</ol>`;
}

/**
 * Sprachhinweis, wenn nicht Deutsch angezeigt wird.
 * @param {string} lang
 * @returns {string}
 */
function langNoteHtml(lang) {
  if (lang === "en") {
    return `<p class="legal-lang-note" lang="en"><strong>Note:</strong> This is a convenience excerpt. The German version is legally authoritative. This text is a template and not a certified translation.</p>`;
  }
  if (lang === "fr") {
    return `<p class="legal-lang-note" lang="fr"><strong>Remarque :</strong> La version allemande fait foi. Le présent texte est un modèle et non une traduction certifiée.</p>`;
  }
  return "";
}

/**
 * Vollständige deutsche Datenschutzerklärung (Muster).
 * Platzhalter werden vor der Ausgabe ersetzt.
 * @returns {string}
 */
function privacyTemplate() {
  return `<aside class="legal-disclaimer" role="note">
<p><strong>Mustertext — keine Rechtsberatung.</strong> Diese Erklärung beschreibt den tatsächlichen Datenumgang der Anwendung Pulse. Sie ersetzt nicht die Prüfung durch die/den Datenschutzbeauftragte/n der verantwortlichen Stelle. Vor dem produktiven Einsatz in der öffentlichen Verwaltung sind Kontaktdaten, Rechtsgrundlagen und Empfänger von der/dem DSB freizugeben.</p>
</aside>

{{langNoteHtml}}

<p>Stand: {{standDate}} · Fassung {{version}}</p>

<h2>1. Verantwortliche Stelle</h2>
<p>Verantwortlich im Sinne von Art. 4 Nr. 7 DSGVO ist:</p>
<p>{{controllerName}}<br>{{controllerAddress}}<br>E-Mail: {{controllerEmail}}<br>Telefon: {{controllerPhone}}<br>Gesetzliche Vertretung: {{controllerLegalRep}}</p>
<p>Diese Anwendung (Pulse) dient öffentlichen Stellen, insbesondere Kommunen, zur anonymen bzw. datensparsamen Live-Interaktion in Veranstaltungen (Umfragen, Wortwolken, Fragen und Antworten, Quiz, Bewertungsskalen).</p>

<h2>2. Datenschutzbeauftragte Stelle</h2>
<p>Die/der behördliche Datenschutzbeauftragte der verantwortlichen Stelle:</p>
<p>{{dsbName}}<br>E-Mail: {{dsbEmail}}<br>Telefon: {{dsbPhone}}<br>Post: {{controllerName}}, {{controllerAddress}}</p>
<p>Bitte richten Sie Auskunfts-, Lösch- und Widerspruchsersuchen bevorzugt per E-Mail oder schriftlich an die oben genannten Kontakte. Nennen Sie nach Möglichkeit den Join-Code der Sitzung und den ungefähren Zeitraum.</p>

<h2>3. Aufsichtsbehörde</h2>
<p>Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), insbesondere am Ort Ihres gewöhnlichen Aufenthalts, Ihres Arbeitsplatzes oder des mutmaßlichen Verstoßes. Für öffentliche Stellen im Saarland ist zuständig:</p>
<p>{{supervisoryName}}<br>{{supervisoryAddress}}<br>Telefon: {{supervisoryPhone}}<br>E-Mail: {{supervisoryEmail}}<br>Internet: <a href="{{supervisoryWebsite}}" rel="noopener noreferrer">{{supervisoryWebsite}}</a></p>
<p>Beschwerdeformular der Aufsicht: über die Website des UDIS (Online-Dienste / Beschwerde).</p>

<h2>4. Rechtsgrundlagen und Zwecke</h2>
<p>Es gelten die Verordnung (EU) 2016/679 (DSGVO), das Bundesdatenschutzgesetz (BDSG) und — für öffentliche Stellen des Saarlandes — das <strong>Saarländische Datenschutzgesetz (SDSG)</strong> in der jeweils geltenden Fassung. Ein „Landesdatenschutzgesetz“ anderen Namens wird nicht zugrunde gelegt.</p>
<p>Für den digitalen Dienst (Anbieterkennzeichnung, Telemedien) gilt seit 14. Mai 2024 das <strong>Digitale-Dienste-Gesetz (DDG)</strong>; die frühere Impressumspflicht des § 5 Telemediengesetz (TMG) findet sich inhaltlich in § 5 DDG. Speicherung von Informationen in der Endeinrichtung der Nutzenden richtet sich nach dem <strong>Telekommunikation-Digitale-Dienste-Datenschutzgesetz (TDDDG)</strong> (Nachfolger des TTDSG).</p>
<p>Zwecke und Art. 6 DSGVO:</p>
<ul>
<li><strong>Art. 6 Abs. 1 lit. e DSGVO in Verbindung mit dem SDSG</strong> — Wahrnehmung einer Aufgabe im öffentlichen Interesse bzw. in Ausübung öffentlicher Gewalt (Durchführung interaktiver Bürger- oder Mitarbeiterveranstaltungen, Erheben von Meinungsbildern ohne Klarnamenspflicht). Das ist die <strong>Hauptrechtsgrundlage</strong> für kommunale Stellen.</li>
<li><strong>Art. 6 Abs. 1 lit. a DSGVO</strong> — Einwilligung, soweit sie eingeholt wird (Hinweisdialog zur lokalen Speicherung; optionale Speicherung der Darstellung). Die Einwilligung ist freiwillig und unabhängig von der Teilnahme an der Abstimmung.</li>
<li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong> — nur soweit ausnahmsweise eine vertragliche oder vorvertragliche Nutzung vorliegt (für die klassische kommunale Veranstaltung regelmäßig nachrangig).</li>
<li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong> — berechtigtes Interesse. <strong>Für Behörden in Erfüllung ihrer Aufgaben gilt lit. f nach Art. 6 Abs. 1 Satz 2 DSGVO nicht.</strong> Technische Maßnahmen (Rate-Limiting, Integrität) stützt die öffentliche Stelle daher auf lit. e bzw. auf die Sicherheit der Verarbeitung nach Art. 32 DSGVO, nicht auf ein „berechtigtes Interesse“ im Sinne von lit. f.</li>
<li><strong>Art. 6 Abs. 1 lit. c DSGVO</strong> — soweit gesetzliche Pflichten (z. B. Nachweis der IT-Sicherheit, kurze Audit-Aufbewahrung) eine Speicherung verlangen.</li>
</ul>
{{kdgHtml}}

<h2>5. Welche Daten verarbeitet werden (wahrheitsgemäß zur Software)</h2>
<p>Eine Pflicht zur Angabe des Klarnamens besteht für die Teilnahme <strong>nicht</strong>.</p>
<ul>
<li><strong>Join-Code</strong> (sechsstellige Sitzungskennung) — wird serverseitig als Schlüssel der Sitzung gespeichert.</li>
<li><strong>Folien und Fragen</strong> (Fragetext, Fragetyp, Antwortoptionen) — Inhalt der Veranstaltung.</li>
<li><strong>Abstimmungen / Multiple Choice / Bewertungsskala</strong> — Stimmen als Zählwerte je Option, nicht als namentliche Wählerliste.</li>
<li><strong>Wortwolke</strong> — eingesendete Wörter, die in der Sitzung aggregiert werden.</li>
<li><strong>Q&amp;A</strong> — Fragetext, Zeit-/Statusdaten, Stimmen (Upvotes). Autorinnen und Autoren werden intern über eine zufällige Client-ID geführt. In CSV-/PDF-Exporten erscheint nur ein Kürzel der Form <code>User_xxxx</code> (erste Zeichen der ID), kein Klarname.</li>
<li><strong>Quiz</strong> — gegebene Antworten und optional eine Rangliste anhand der Client-ID, ohne Klarnamen.</li>
<li><strong>Reaktionen</strong> (z. B. Emoji auf der Bühne) — werden nur live angezeigt und <strong>nicht dauerhaft gespeichert</strong>.</li>
<li><strong>Session-/Client-ID</strong> — zufälliger Wert im <code>sessionStorage</code> des Browsers (Schlüssel <code>pulse:client-id</code>), Header <code>X-Client-Id</code> an den Server. Entfällt beim Schließen des Tabs.</li>
<li><strong>Darstellung (Theme)</strong> — Hell/Dunkel im <code>localStorage</code> unter <code>pulse-theme</code>. Kein Cookie.</li>
<li><strong>Zuletzt genutzte Sitzungen / lokale Entwürfe</strong> — <code>localStorage</code> mit Präfix <code>pulse:session:</code> bzw. <code>pulse:recent</code>, nur auf diesem Gerät.</li>
<li><strong>Admin-Schlüssel</strong> — nach dem Start einer Sitzung im <code>sessionStorage</code> unter Präfix <code>pulse:admin:</code> (kein Cookie). Auf dem Server liegt nur ein HMAC-SHA-256, nicht der Klartext.</li>
<li><strong>Sprache</strong> — im <code>sessionStorage</code> (<code>tt:lang</code>).</li>
<li><strong>Datenschutz-Hinweis</strong> — Bestätigung im <code>localStorage</code> (<code>tt:consent</code>), befristet auf 90 Tage, damit der Dialog nicht bei jedem Seitenaufruf erscheint.</li>
<li><strong>Geräte-Typ</strong> (Mobilgerät, Desktop, Bildschirmgröße u. Ä.) — <strong>wird nicht erhoben und nicht gespeichert</strong>.</li>
<li><strong>IP-Adresse</strong> — wird kurzzeitig im Arbeitsspeicher für Rate-Limiting und DDoS-Schutz (u. a. Begrenzung gleichzeitiger WebSocket-Verbindungen) verwendet und danach verworfen. Im Audit-Protokoll steht nur ein <strong>Hash</strong> (SHA-256, gekürzt), niemals die Klar-IP in einer Datenbank. Eine optionale 24-Stunden-Sperre nach Missbrauch speichert ebenfalls nur den Hash.</li>
<li><strong>HTTP-User-Agent</strong> — von dieser Anwendung <strong>nicht</strong> gespeichert. Es gibt keine anwendungsseitigen Zugriffsprotokolle mit User-Agent. Ob ein Reverse-Proxy oder das Betriebssystem Zugriffe protokolliert, liegt außerhalb dieser Software und ist von der verantwortlichen Stelle zu prüfen.</li>
<li><strong>Cookies</strong> — es werden <strong>keine Cookies</strong> gesetzt. Kein Tracking, kein Marketing, kein Fingerprinting (kein Canvas-/Audio-Fingerprint).</li>
<li><strong>Schriftarten / Analyse</strong> — keine Anbindung an Google Fonts oder andere CDNs für Schriften, kein Analytics-Dienst.</li>
<li><strong>Wortfilter</strong> — prüft eingegebene Q&amp;A-Texte gegen eine lokale Wortliste; es wird kein externes Moderations-API aufgerufen.</li>
<li><strong>Presenter-Passwort</strong> (optional) — nur als scrypt-Hash auf dem Server, nicht im Klartext.</li>
</ul>
{{sslHtml}}

<h2>6. Empfänger, Hosting, Drittland</h2>
<p>{{hostingText}}</p>
<p>Im Standard gibt es <strong>keine Drittweitergabe</strong> an Werbe- oder Analysedienste. Sitzungsdaten liegen in einer lokalen SQLite-Datei oder — falls von der Stelle konfiguriert — in einer PostgreSQL-Datenbank. Ein optionaler Redis-Nachrichtenbus überträgt nur Live-Ereignisse zwischen Server-Instanzen, kein dauerhaftes Personenverzeichnis.</p>
{{processorHtml}}
<p>Sofern HTTPS-Zertifikate über Let’s Encrypt beantragt werden, erhält die Internet Security Research Group (Let’s Encrypt) Domain und die im Admin-Formular angegebene Kontakt-E-Mail. Let’s Encrypt hat Sitz in den USA. Ob ein Angemessenheitsbeschluss oder geeignete Garantien nach Art. 46 DSGVO greifen, prüft die/der DSB; die Beantragung erfolgt nur nach Bestätigung der Nutzungsbedingungen im Admin-Bereich.</p>

<h2>7. Speicherdauer und Löschung</h2>
<p>{{retentionHtml}}</p>
<ul>
<li><strong>Browser-Session</strong> (Client-ID, Admin-Schlüssel, Sprache): bis zum Schließen des Tabs bzw. Leeren des Speicherorts.</li>
<li><strong>Theme und Consent-Vermerk</strong>: bis zur Löschung durch die nutzende Person oder Ablauf des Consent-Vermerks (90 Tage).</li>
<li><strong>Audit-Protokoll</strong>: 90 Tage, danach automatischer Sweep. Enthält Ereignistyp, Sitzungscode, ggf. Nutzer- bzw. Client-Kürzel und IP-Hash.</li>
<li><strong>SSL-Zertifikatsmetadaten</strong> (falls genutzt): bis zum Löschen, Widerruf oder Ablauf des Zertifikats; Private Keys liegen nur auf dem Server.</li>
<li><strong>Admin-Export</strong>: Q&amp;A kann als CSV heruntergeladen oder über den Browser-Druckdialog als PDF gesichert werden. Exporte, die eine Administratorin lokal speichert, unterliegen der Aufbewahrung der verantwortlichen Stelle.</li>
</ul>
<p>Nach Ablauf der Frist entfernt ein serverseitiger Sweep abgelaufene Sitzungen aus der Datenbank.</p>

<h2>8. Betroffenenrechte</h2>
<p>Sie haben gegenüber der verantwortlichen Stelle die Rechte aus Art. 15 bis 21 DSGVO, insbesondere Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit soweit anwendbar, Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. e DSGVO, und Widerruf einer Einwilligung mit Wirkung für die Zukunft. Außerdem besteht das Beschwerderecht nach Art. 77 DSGVO (siehe Abschnitt 3).</p>
<p>Kontaktweg: E-Mail an {{dsbEmail}} oder {{controllerEmail}}, telefonisch unter {{dsbPhone}} bzw. {{controllerPhone}}, postalisch an {{controllerName}}, {{controllerAddress}}. Für öffentliche Stellen können sich Besonderheiten aus § 34, § 35 BDSG und dem SDSG ergeben; die/der DSB klärt dies im Einzelfall.</p>
<p>Weil Abstimmungen ohne Klarnamen erfolgen, kann eine Zuordnung zu einer natürlichen Person oft nur gelingen, wenn Sie selbst den Join-Code, den ungefähren Zeitpunkt und ggf. den Wortlaut Ihres Beitrags mitteilen.</p>

<h2>9. Technische und organisatorische Maßnahmen</h2>
<ul>
<li>Transportverschlüsselung HTTPS/TLS, sobald ein Zertifikat aktiv ist (Admin-SSL-Funktion oder vorgeschalteter Proxy).</li>
<li>Presenter-Passwort mit scrypt; Admin-Schlüssel nur als HMAC-SHA-256.</li>
<li>Datensparsamkeit: keine Klarnamenspflicht, keine Tracking-Cookies, IP nur als Hash im Audit.</li>
<li>Rate-Limiting gegen Missbrauch; optional zeitlich begrenzte IP-Hash-Sperre.</li>
<li>Pseudonyme <code>User_xxxx</code> in Exporten statt vollständiger Client-IDs.</li>
</ul>

<h2>10. Cookies, Tracking, Einwilligungsdialog</h2>
<p>Diese Anwendung setzt <strong>keine Cookies</strong>. Der Hinweisdialog informiert über die anonyme Teilnahme und die lokale Speicherung der Session-Kennung. Er ist kein Cookie-Banner für Werbung. Technisch notwendige Speicherungen in Local Storage / Session Storage (Sitzung, Sicherheit, Darstellung) stützen sich auf TDDDG soweit die Speicherung unbedingt erforderlich ist, im Übrigen auf die im Dialog dokumentierte Kenntnisnahme.</p>

<h2>11. Barrierefreiheit (BITV 2.0)</h2>
<p>Öffentliche Stellen sind verpflichtet, Webangebote barrierefrei zu gestalten. Maßstab sind die Barrierefreie-Informationstechnik-Verordnung (<strong>BITV 2.0</strong>) und die WCAG 2.1, Konformitätsstufe AA, in der jeweils geltenden Fassung. Pulse nutzt semantische Überschriften, einen Skip-Link zum Inhalt, Tastaturbedienung und Theme-Kontrastwerte. Eine vollständige Konformitätsbewertung der jeweiligen Instanz bleibt Aufgabe der verantwortlichen Stelle.</p>
<p>Mängel der Barrierefreiheit bitte an: {{accessibilityContact}} (alternativ {{controllerEmail}}). Eine kurze Erklärung zur Barrierefreiheit steht auch im <a href="#/impressum">Impressum</a>.</p>

<h2>12. Änderungen dieser Erklärung</h2>
<p>Maßgeblich ist das auf dieser Seite ausgewiesene Stand-Datum und die Versionsnummer. Es gibt <strong>keine aktive Push-Benachrichtigung</strong> an Teilnehmende, wenn der Text geändert wird. Frühere Stände:</p>
{{versionListHtml}}

<h2>13. Ergänzungen der verantwortlichen Stelle</h2>
<p>{{extraHtml}}</p>
`;
}

/**
 * Impressum nach § 5 DDG (historisch § 5 TMG), plus kurze Barrierefreiheitsangabe.
 * @returns {string}
 */
function impressumTemplate() {
  return `<aside class="legal-disclaimer" role="note">
<p><strong>Mustertext — keine Rechtsberatung.</strong> Angaben nach § 5 Digitale-Dienste-Gesetz (DDG). Die frühere Pflicht aus § 5 TMG ist ins DDG überführt. Bitte durch die verantwortliche Stelle und den DSB prüfen lassen.</p>
</aside>
{{langNoteHtml}}
<p>Stand: {{standDate}} · Fassung {{version}}</p>
<h2>Anbieter</h2>
<p>{{controllerName}}<br>{{controllerAddress}}</p>
<p>Gesetzliche Vertretung: {{controllerLegalRep}}</p>
<p>Telefon: {{controllerPhone}}<br>E-Mail: {{controllerEmail}}</p>
<h2>Aufsicht (soweit anzugeben)</h2>
<p>{{adminSupervisory}}</p>
<h2>Umsatzsteuer</h2>
<p>{{vatId}}</p>
<h2>Datenschutzaufsicht</h2>
<p>{{supervisoryName}}<br>{{supervisoryAddress}}<br><a href="{{supervisoryWebsite}}" rel="noopener noreferrer">{{supervisoryWebsite}}</a></p>
<h2>Datenschutz</h2>
<p>Es gilt die <a href="#/privacy">Datenschutzerklärung</a> dieser Anwendung.</p>
<h2>Barrierefreiheit</h2>
<p>Ziel ist ein barrierefreies Angebot nach BITV 2.0 / WCAG 2.1 AA. Mängel bitte an {{accessibilityContact}} oder {{controllerEmail}} melden. Semantische Struktur, Skip-Link und Kontrast über Theme-Vorgaben sind in der Anwendung vorgesehen; die Bewertung der konkreten Instanz obliegt der verantwortlichen Stelle.</p>
<h2>Haftung für Inhalte und Links</h2>
<p>Als öffentliche Stelle sind wir für eigene Inhalte verantwortlich. Bei direkten Links auf fremde Seiten prüfen wir diese zum Zeitpunkt der Verknüpfung. Eine ständige Kontrolle ohne konkrete Anhaltspunkte ist nicht zumutbar; bei Bekanntwerden rechtswidriger Inhalte entfernen wir Links.</p>
`;
}

/**
 * Baut das Ersetzungswörterbuch inklusive vorgerendertem HTML.
 * @param {object} rec
 * @param {{ retentionDays?: number, lang?: string, versions?: object[], extraFromBranding?: string }} ctx
 */
function buildContext(rec, ctx = {}) {
  const extraRaw = [rec.extraText, ctx.extraFromBranding].filter((s) => String(s || "").trim()).join("\n\n");
  const extraHtml = extraRaw
    ? simpleMarkdown(extraRaw)
    : "<p>Keine weiteren Ergänzungen der verantwortlichen Stelle.</p>";
  const kdgHtml = `<p>Das Kirchliche Datenschutzgesetz (KDG) gilt nur, wenn eine <strong>kirchliche Stelle</strong> Verantwortliche ist. Für die Landeshauptstadt Saarbrücken und andere kommunale Stellen ist das KDG <strong>nicht</strong> einschlägig.</p>`;
  const sslHtml = `<p><strong>SSL-/TLS-Zertifikate:</strong> Die Anwendung kann optionale Let’s-Encrypt-Zertifikate verwalten. Dann werden Metadaten gespeichert (Domain, Kontakt-E-Mail, Status, Ausstellungs- und Ablaufzeit, Staging-Kennzeichen, Zeitpunkte). Private Schlüssel werden nicht in dieser Erklärung, nicht in der Versionshistorie und nicht in CSV-/PDF-Exporten ausgegeben. Wird die Funktion nicht genutzt, entfällt diese Verarbeitung.</p>`;
  return {
    ...rec,
    extraHtml,
    avHtml: processorParagraph(rec.processorNote),
    processorHtml: processorParagraph(rec.processorNote),
    versionListHtml: versionListHtml(ctx.versions || []),
    sslHtml,
    langNoteHtml: langNoteHtml(ctx.lang || "de"),
    retentionHtml: retentionSentence(ctx.retentionDays),
    kdgHtml,
  };
}

function renderPrivacyHtml(rec, ctx = {}) {
  return replacePlaceholders(privacyTemplate(), buildContext(rec, ctx));
}

function renderImpressumHtml(rec, ctx = {}) {
  return replacePlaceholders(impressumTemplate(), buildContext(rec, ctx));
}

/**
 * Dateispeicher. dataDir ist für Tests überschreibbar.
 * @param {{ dataDir?: string }} [options]
 */
function createPrivacyStore(options = {}) {
  const dataDir = options.dataDir || process.env.PRIVACY_DATA_DIR || path.join(process.cwd(), "data");
  const settingsFile = path.join(dataDir, "privacy.json");
  const versionsFile = path.join(dataDir, "privacy-versions.json");

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      return { ...DEFAULTS, ...parsed, version: Number(parsed.version) || 1 };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save(partial) {
    const current = load();
    const merged = sanitizeInput(partial, current);
    merged.version = (Number(current.version) || 1) + 1;
    if (!String(partial?.standDate || "").trim()) {
      merged.standDate = new Date().toISOString().slice(0, 10);
    }
    merged.savedAt = new Date().toISOString();
    fs.mkdirSync(dataDir, { recursive: true });
    const toDisk = { ...merged };
    delete toDisk.allowLocal;
    delete toDisk.secret;
    delete toDisk.adminKey;
    fs.writeFileSync(settingsFile, JSON.stringify(toDisk, null, 2));
    const versions = appendVersion(toDisk, { file: versionsFile, max: MAX_VERSIONS });
    return { record: toDisk, versions };
  }

  function versions() {
    return readVersions(versionsFile);
  }

  /**
   * Ersetzt den aktuellen Privacy-Stand aus einem Einstellungs-Import.
   * Sessions bleiben unberührt. versionsList optional: Historie überschreiben,
   * sonst einen neuen Snapshot anhängen (wie save, aber ohne erzwungenes +1
   * wenn die Datei bereits eine Versionsnummer mitbringt).
   *
   * @param {object} partial
   * @param {object[]|null} [versionsList]
   * @returns {{ record: object, versions: object[] }}
   */
  function importBundle(partial, versionsList) {
    const merged = sanitizeInput(partial, { ...DEFAULTS });
    const incomingVersion = Number(partial && partial.version);
    if (incomingVersion > 0) {
      merged.version = incomingVersion;
    } else {
      merged.version = Number(load().version) || 1;
    }
    if (!String(merged.standDate || "").trim()) {
      merged.standDate = new Date().toISOString().slice(0, 10);
    }
    merged.savedAt = new Date().toISOString();
    fs.mkdirSync(dataDir, { recursive: true });
    const toDisk = { ...merged };
    delete toDisk.allowLocal;
    delete toDisk.secret;
    delete toDisk.adminKey;
    delete toDisk.versions;
    fs.writeFileSync(settingsFile, JSON.stringify(toDisk, null, 2));
    if (Array.isArray(versionsList)) {
      const cleaned = versionsList
        .filter((v) => v && typeof v === "object")
        .map((v) => versionSnapshot(v))
        .slice(-MAX_VERSIONS);
      fs.writeFileSync(versionsFile, JSON.stringify(cleaned, null, 2));
    } else {
      appendVersion(toDisk, { file: versionsFile, max: MAX_VERSIONS });
    }
    return { record: toDisk, versions: versions() };
  }

  function publicPayload(opts = {}) {
    const record = load();
    const list = versions();
    const ctx = {
      retentionDays: opts.retentionDays,
      lang: opts.lang || "de",
      versions: list,
      extraFromBranding: opts.extraFromBranding || "",
    };
    return {
      privacy: record,
      versions: list,
      html: renderPrivacyHtml(record, ctx),
      impressumHtml: renderImpressumHtml(record, ctx),
      disclaimer:
        "Mustertext, keine Rechtsberatung. Prüfung durch die/den Datenschutzbeauftragte/n der verantwortlichen Stelle erforderlich.",
    };
  }

  return {
    dataDir,
    settingsFile,
    versionsFile,
    load,
    save,
    importBundle,
    versions,
    publicPayload,
  };
}

const defaultStore = createPrivacyStore();

module.exports = {
  DEFAULTS,
  UDIS,
  MAX_VERSIONS,
  HTML_KEYS,
  escapeHtml,
  simpleMarkdown,
  replacePlaceholders,
  retentionSentence,
  processorParagraph,
  appendVersion,
  readVersions,
  versionSnapshot,
  renderPrivacyHtml,
  renderImpressumHtml,
  createPrivacyStore,
  load: defaultStore.load,
  save: defaultStore.save,
  importBundle: defaultStore.importBundle,
  versions: defaultStore.versions,
  publicPayload: defaultStore.publicPayload,
};
