/**
 * Zentrale, verständliche Fehlermeldungen für Pulse.
 *
 * Jeder Eintrag erklärt: was passiert ist, warum, was als Nächstes tun.
 * Optionaler Hilfe-Link (Hash-Route). Die UI soll keine nackten
 * „HTTP 403“ / „WebSocket connection failed“-Strings zeigen.
 */

/** @typedef {{ title: string, cause: string, next: string, help?: string }} ErrorInfo */

/** @type {Record<string, ErrorInfo>} */
export const ERRORS = {
  session_not_found: {
    title: "Diese Session gibt es nicht",
    cause: "Der Join-Code ist falsch, abgelaufen oder die Session wurde beendet.",
    next: "Prüfen Sie die sechs Ziffern auf der Leinwand. Groß/Kleinschreibung spielt keine Rolle — nur Zahlen.",
    help: "#/help/troubleshooting",
  },
  session_missing_code: {
    title: "Bitte Join-Code eingeben",
    cause: "Ohne sechsstelligen Code können wir Sie keinem Raum zuordnen.",
    next: "Tippen Sie den Code vom Beamer oder scannen Sie den QR-Code.",
    help: "#/help/getting-started",
  },
  "HTTP 403": {
    title: "Zugriff verweigert",
    cause: "Die Aktion ist nur für berechtigte Presenter erlaubt.",
    next: "Bei Events: mit Ihrem Team-Konto anmelden. Bei Ad-hoc-Sessions ohne Event: Admin-Schlüssel eingeben.",
    help: "#/help/troubleshooting",
  },
  "HTTP 404": {
    title: "Nicht gefunden",
    cause: "Die Adresse oder die Session existiert auf diesem Server nicht.",
    next: "Zurück zur Startseite und den Code erneut eingeben — oder eine neue Session starten.",
    help: "#/help/troubleshooting",
  },
  "HTTP 429": {
    title: "Zu viele Anfragen",
    cause: "Ein Rate-Limit schützt den Server vor Überlastung (gleiche IP oder dieselbe Aktion zu oft).",
    next: "Kurz warten und erneut versuchen. In der Hilfe steht, was „Rate-Limit“ bedeutet.",
    help: "#/help/glossary",
  },
  "HTTP 500": {
    title: "Serverfehler",
    cause: "Etwas ist auf dem Server schiefgelaufen, nicht in Ihrem Browser.",
    next: "Seite neu laden. Wenn es bleibt: IT informieren oder später erneut versuchen.",
    help: "#/help/troubleshooting",
  },
  ws_failed: {
    title: "Live-Verbindung unterbrochen",
    cause: "Der Browser erreicht den Echtzeit-Kanal gerade nicht (Netzwerk, Proxy, Server startet neu).",
    next: "Pulse versucht automatisch erneut. Ergebnisse erscheinen, sobald „Live“ wieder da ist.",
    help: "#/help/troubleshooting",
  },
  reconnecting: {
    title: "Verbindung wird wiederhergestellt",
    cause: "Die Live-Leitung war kurz weg. Ein erneuter Versuch läuft mit Wartezeit dazwischen.",
    next: "Nichts klicken müssen. Wenn es länger dauert: WLAN prüfen oder Seite neu laden.",
    help: "#/help/troubleshooting",
  },
  offline: {
    title: "Offline",
    cause: "Keine Live-Verbindung. Stimmen werden lokal gehalten, bis es wieder klappt — oder der Demo-Modus greift.",
    next: "Netzwerk prüfen. Lokal ohne Server läuft eine Demo über zwei Browser-Tabs.",
    help: "#/help/troubleshooting",
  },
  admin_lock: {
    title: "Präsentation ist gesperrt",
    cause: "Folienwechsel und Moderation erfordern Presenter-Berechtigung.",
    next: "Bei Events mit Benutzerkonto anmelden. Bei Ad-hoc-Sessions den Admin-Schlüssel aus dem Start-Browser eingeben.",
    help: "#/help/admin",
  },
  auth_required: {
    title: "Anmeldung erforderlich",
    cause: "Diese Event-Präsentation ist nur für angemeldete Teammitglieder freigegeben.",
    next: "Melden Sie sich mit Ihrem Instanz-Konto an und öffnen Sie die Presenter-Ansicht erneut.",
    help: "#/help/admin",
  },
  permission_denied: {
    title: "Keine Berechtigung für diesen Bereich",
    cause: "Sie sind angemeldet, aber Ihre Rolle erlaubt diese Admin-Seite nicht.",
    next: "Wählen Sie einen anderen Menüpunkt in der Leiste oder wenden Sie sich an einen Administrator.",
    help: "#/admin/help",
  },
  rate: {
    title: "Bitte kurz warten",
    cause: "Zu viele Nachrichten in kurzer Zeit (Schutz gegen Spam).",
    next: "Einige Sekunden innehalten, dann erneut senden.",
    help: "#/help/glossary",
  },
  blocked: {
    title: "Beitrag blockiert",
    cause: "Der Wortfilter hat den Text nicht durchgelassen.",
    next: "Formulierung ändern. Die Moderation kann Beiträge zusätzlich prüfen.",
    help: "#/help/qa",
  },
  qa_closed: {
    title: "Fragenrunde beendet",
    cause: "Das Zeitlimit für neue Fragen ist abgelaufen oder der Präsentator hat die Runde beendet.",
    next: "Bestehende Fragen bleiben sichtbar und können weiter bewertet werden.",
    help: "#/help/qa",
  },
  generic: {
    title: "Das hat nicht geklappt",
    cause: "Ein unerwarteter Fehler ist aufgetreten.",
    next: "Erneut versuchen. Details stehen in der Hilfe unter Fehlerbehebung.",
    help: "#/help/troubleshooting",
  },
};

/**
 * Rohe Fehlermeldung / HTTP-Status auf einen Katalogschlüssel abbilden.
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveErrorKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return "generic";
  if (ERRORS[s]) return s;
  const upper = s.toUpperCase();
  const http = upper.match(/\bHTTP\s*(\d{3})\b/) || s.match(/\b(403|404|429|500)\b/);
  if (http) {
    const code = http[1] || http[0];
    const key = `HTTP ${code}`;
    if (ERRORS[key]) return key;
  }
  const lower = s.toLowerCase();
  if (lower.includes("websocket") || lower.includes("ws connection") || lower.includes("connection failed")) {
    return "ws_failed";
  }
  if (lower.includes("reconnect")) return "reconnecting";
  if (lower.includes("session nicht gefunden") || lower.includes("not found")) return "session_not_found";
  if (lower.includes("team-konto") || lower.includes("auth_required")) return "auth_required";
  if (lower.includes("permission_denied") || lower.includes("keine berechtigung")) return "permission_denied";
  if (lower.includes("admin") || lower.includes("forbidden") || lower.includes("gesperrt")) return "admin_lock";
  if (lower.includes("rate")) return "rate";
  if (lower.includes("blocked") || lower.includes("blockiert")) return "blocked";
  if (lower.includes("qa_closed") || lower.includes("fragenrunde")) return "qa_closed";
  return "generic";
}

/**
 * Vollständigen Fehlertext für die UI liefern.
 * @param {unknown} raw
 * @returns {ErrorInfo & { key: string, html: string }}
 */
export function explainError(raw) {
  const key = resolveErrorKey(raw);
  const info = ERRORS[key] || ERRORS.generic;
  const helpLink = info.help
    ? `<a class="help-error-link" href="${info.help}">Hilfe öffnen</a>`
    : "";
  const html =
    `<span class="help-error-block">` +
    `<strong>${escapeError(info.title)}</strong>` +
    `<span class="help-error-cause">${escapeError(info.cause)}</span>` +
    `<span class="help-error-next">${escapeError(info.next)}</span>` +
    helpLink +
    `</span>`;
  return { key, ...info, html };
}

/**
 * Kurzes Verbindungs-Label plus Erklärung (kein nacktes „failed“).
 * @param {string} state  connecting | open | reconnecting | closed | idle
 * @param {boolean} [mock]
 * @returns {{ short: string, long: string }}
 */
export function connectionLabel(state, mock = false) {
  if (mock) {
    return {
      short: "Demo",
      long: "Kein Live-Server — dieser Tab nutzt den lokalen Demo-Kanal. Zwei Browser-Fenster können sich trotzdem sehen.",
    };
  }
  if (state === "open") {
    return {
      short: "Live",
      long: "Echtzeit-Verbindung steht. Stimmen und Fragen kommen ohne Neuladen an.",
    };
  }
  if (state === "reconnecting" || state === "connecting") {
    const info = ERRORS.reconnecting;
    return { short: "Verbinde …", long: `${info.cause} ${info.next}` };
  }
  const info = ERRORS.offline;
  return { short: "Offline", long: `${info.cause} ${info.next}` };
}

function escapeError(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
