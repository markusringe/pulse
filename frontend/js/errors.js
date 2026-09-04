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
  "HTTP 401": {
    title: "Anmeldung abgelaufen",
    cause: "Ihre Sitzung ist nicht mehr gültig (Timeout, Abmeldung auf einem anderen Tab oder Server-Neustart).",
    next: "Bitte erneut anmelden. Ungespeicherte Eingaben in Admin-Bereichen gehen verloren.",
    help: "#/admin/login",
  },
  session_expired: {
    title: "Sitzung abgelaufen",
    cause: "Sie waren angemeldet, aber die Session ist nicht mehr gültig.",
    next: "Melden Sie sich erneut an, um den Admin-Bereich weiter zu nutzen.",
    help: "#/admin/login",
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
  wrong_slide: {
    title: "Folie bereits gewechselt",
    cause: "Der Präsentator ist zur nächsten Folie gewechselt, bevor Ihre Stimme ankam.",
    next: "Die aktuelle Folie wird automatisch angezeigt — dort können Sie erneut abstimmen, wenn die Runde läuft.",
    help: "#/help/troubleshooting",
  },
  already_voted: {
    title: "Bereits abgestimmt",
    cause: "Ihre Stimme auf dieser Folie ist bereits beim Server angekommen.",
    next: "Es ist keine weitere Aktion nötig.",
    help: "#/help/getting-started",
  },
  invalid_option: {
    title: "Ungültige Antwort",
    cause: "Die gewählte Option existiert auf dieser Folie nicht (veralteter Stand).",
    next: "Seite kurz warten oder neu laden, dann erneut wählen.",
    help: "#/help/troubleshooting",
  },
  vote_timeout: {
    title: "Stimme nicht bestätigt",
    cause: "Der Server hat die Stimme innerhalb der Wartezeit nicht bestätigt (langsames Netz).",
    next: "Bitte erneut abstimmen. Bei anhaltenden Problemen WLAN prüfen.",
    help: "#/help/troubleshooting",
  },
  interaction_not_started: {
    title: "Abstimmung noch nicht gestartet",
    cause: "Der Präsentator hat die Runde auf dieser Folie noch nicht freigegeben.",
    next: "Bitte warten — sobald die Abstimmung läuft, können Sie antworten.",
    help: "#/help/getting-started",
  },
  interaction_paused: {
    title: "Abstimmung pausiert",
    cause: "Der Präsentator hat die Runde vorübergehend angehalten.",
    next: "Bitte warten, bis die Abstimmung fortgesetzt wird.",
    help: "#/help/troubleshooting",
  },
  interaction_ended: {
    title: "Abstimmung beendet",
    cause: "Die Zeit ist abgelaufen oder der Präsentator hat die Runde beendet.",
    next: "Auf der nächsten Folie können Sie ggf. erneut mitmachen.",
    help: "#/help/troubleshooting",
  },
  not_interactive: {
    title: "Keine Abstimmung auf dieser Folie",
    cause: "Diese Folie nimmt gerade keine Eingaben entgegen.",
    next: "Warten Sie auf den Folienwechsel durch den Präsentator.",
    help: "#/help/getting-started",
  },
  empty: {
    title: "Bitte Text eingeben",
    cause: "Die Antwort war leer.",
    next: "Geben Sie einen kurzen Text ein und senden Sie erneut.",
    help: "#/help/getting-started",
  },
  stopword: {
    title: "Wort nicht erlaubt",
    cause: "Das eingegebene Wort ist für die Wortwolke nicht zugelassen.",
    next: "Bitte ein anderes Wort wählen.",
    help: "#/help/getting-started",
  },
  max: {
    title: "Zu viele Auswahlen",
    cause: "Sie haben mehr Optionen gewählt als erlaubt.",
    next: "Reduzieren Sie Ihre Auswahl und senden Sie erneut.",
    help: "#/help/getting-started",
  },
  paused: {
    title: "Session pausiert",
    cause: "Der Präsentator hat die Session vorübergehend angehalten.",
    next: "Bitte warten, bis die Präsentation fortgesetzt wird.",
    help: "#/help/troubleshooting",
  },
  lobby: {
    title: "Warten auf den Start",
    cause: "Die Session hat noch nicht begonnen.",
    next: "Sobald der Präsentator startet, können Sie mitmachen.",
    help: "#/help/getting-started",
  },
  no_slide: {
    title: "Keine Folie aktiv",
    cause: "Auf dieser Session ist gerade keine Folie ausgewählt.",
    next: "Bitte warten Sie auf den nächsten Folienwechsel.",
    help: "#/help/troubleshooting",
  },
  event_planned: {
    title: "Event noch nicht gestartet",
    cause: "Dieses Event nimmt noch keine Teilnahmen an.",
    next: "Bitte warten Sie, bis der Veranstalter das Event freigibt.",
    help: "#/help/events",
  },
  event_archived: {
    title: "Event beendet",
    cause: "Dieses Event ist archiviert und nimmt keine Teilnahmen mehr an.",
    next: "Wenden Sie sich an den Veranstalter, falls Sie Fragen haben.",
    help: "#/help/events",
  },
  emoji_limit: {
    title: "Zu viele Emojis",
    cause: "Die Frage enthält zu viele Emojis.",
    next: "Formulieren Sie die Frage in normalen Worten und senden Sie erneut.",
    help: "#/help/qa",
  },
  type: {
    title: "Eingabe passt nicht zur Folie",
    cause: "Diese Antwort kann auf der aktuellen Folie nicht verarbeitet werden.",
    next: "Warten Sie kurz auf die Anzeige der Folie oder laden Sie die Seite neu.",
    help: "#/help/troubleshooting",
  },
  already: {
    title: "Bereits abgestimmt",
    cause: "Ihre Stimme auf dieser Folie ist bereits beim Server angekommen.",
    next: "Es ist keine weitere Aktion nötig.",
    help: "#/help/getting-started",
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
  const http = upper.match(/\bHTTP\s*(\d{3})\b/) || s.match(/\b(401|403|404|429|500)\b/);
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
  if (lower.includes("session abgelaufen") || lower.includes("nicht angemeldet")) return "session_expired";
  if (lower.includes("permission_denied") || lower.includes("keine berechtigung")) return "permission_denied";
  if (lower.includes("admin") || lower.includes("forbidden") || lower.includes("gesperrt")) return "admin_lock";
  if (lower.includes("rate")) return "rate";
  if (lower.includes("blocked") || lower.includes("blockiert")) return "blocked";
  if (lower.includes("qa_closed") || lower.includes("fragenrunde")) return "qa_closed";
  if (lower.includes("wrong_slide") || lower.includes("nicht aktiv")) return "wrong_slide";
  if (lower.includes("already_voted") || lower.includes("bereits abgestimmt")) return "already_voted";
  if (lower.includes("invalid_option")) return "invalid_option";
  if (lower.includes("vote_timeout") || lower.includes("nicht bestätigt")) return "vote_timeout";
  if (lower === "already" || lower.includes("already_voted") || lower.includes("bereits abgestimmt")) {
    return "already_voted";
  }
  if (lower.includes("interaction_not_started") || lower.includes("noch nicht gestartet")) {
    return "interaction_not_started";
  }
  if (lower.includes("interaction_paused") || lower.includes("ist pausiert")) return "interaction_paused";
  if (lower.includes("interaction_ended") || lower.includes("ist beendet")) return "interaction_ended";
  if (lower.includes("not_interactive")) return "not_interactive";
  if (lower.includes("session pausiert")) return "paused";
  if (lower === "paused") return "paused";
  if (lower.includes("warten auf den start")) return "lobby";
  if (lower === "lobby") return "lobby";
  if (lower.includes("nimmt noch keine teilnahmen")) return "event_planned";
  if (lower.includes("event ist archiviert") || lower.includes("ist archiviert")) return "event_archived";
  if (lower.includes("emoji") && lower.includes("limit")) return "emoji_limit";
  if (lower === "emoji-limit" || lower === "emoji_limit") return "emoji_limit";
  if (lower === "type") return "type";
  if (lower === "empty" || lower.includes("leer")) return "empty";
  if (lower === "stopword") return "stopword";
  if (lower === "max") return "max";
  if (lower.includes("no_slide") || lower.includes("keine folie")) return "no_slide";
  if (lower.includes("zeit ist abgelaufen")) return "interaction_ended";
  if (lower.includes("abstimmung ist beendet")) return "interaction_ended";
  if (lower.includes("quiz wurde noch nicht")) return "interaction_not_started";
  if (lower.includes("abstimmung wurde noch nicht")) return "interaction_not_started";
  return "generic";
}

/**
 * Server-Fehler (Code + Nachricht) für die Teilnehmer-UI auflösen.
 * Zeigt bei unbekanntem Code die Server-Nachricht statt „Ein unerwarteter Fehler …“.
 * @param {{ error?: string, code?: string, message?: string }} payload
 * @returns {ErrorInfo & { key: string, html: string }}
 */
export function explainServerError(payload = {}) {
  const code = String(payload.error || payload.code || "").trim();
  const message = String(payload.message || "").trim();
  const primary = code || message;
  const explained = explainError(primary);
  if (explained.key !== "generic") return explained;
  if (message && message !== code) {
    const fromMsg = explainError(message);
    if (fromMsg.key !== "generic") return fromMsg;
  }
  if (message && message.length > 3) {
    return buildErrorHtml("server_message", {
      title: "Hinweis vom Server",
      cause: message,
      next: ERRORS.generic.next,
      help: ERRORS.generic.help,
    });
  }
  return explained;
}

/**
 * @param {string} key
 * @param {ErrorInfo} info
 */
function buildErrorHtml(key, info) {
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
 * Vollständigen Fehlertext für die UI liefern.
 * @param {unknown} raw
 * @returns {ErrorInfo & { key: string, html: string }}
 */
export function explainError(raw) {
  const key = resolveErrorKey(raw);
  let info = ERRORS[key];
  const text = String(raw || "").trim();
  /* Gemappter Schlüssel ohne Katalogeintrag: Server-Text als Ursache nutzen. */
  if (!info && key !== "generic" && text) {
    info = {
      title: ERRORS.generic.title,
      cause: text,
      next: ERRORS.generic.next,
      help: ERRORS.generic.help,
    };
  }
  if (!info && text.length > 3 && key === "generic") {
    info = {
      title: "Hinweis",
      cause: text,
      next: ERRORS.generic.next,
      help: ERRORS.generic.help,
    };
  }
  return buildErrorHtml(key, info || ERRORS.generic);
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
