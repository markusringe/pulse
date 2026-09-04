# Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO)

**Anwendung:** Pulse  
**Verantwortliche Stelle:** Landeshauptstadt Saarbrücken  
**Stand:** 2026-09-04 · **Programmversion:** v1.5.21
**Fassung:** 5 (Entwurf)

> **Entwurf für die/den Datenschutzbeauftragte/n — keine Rechtsberatung.**  
> Dieses Verzeichnis beschreibt den **Ist-Zustand der Software** (Quellcode Stand 2026-09-04) und die **geplante** Auftragsverarbeitung beim Hosting. Es ersetzt nicht die Prüfung, Freigabe und Fortschreibung durch die/den DSB der Landeshauptstadt Saarbrücken. Angaben zu Personen, Anschriften und Aufsicht stammen aus den öffentlichen Defaults in `lib/privacy.js` / `data/privacy.json` (Abruf Stadtwebsite / UDIS, Stand 2026-09-02). Es werden **keine** Vertragsnummern, Server-IPs, Ticket-IDs oder DPIA-Scores erfunden.  
> Die öffentliche Datenschutzerklärung der Anwendung (`data/privacy.json`, `hostingText`) beschreibt derzeit noch ein Hosting im Rechenzentrum der verantwortlichen Stelle. **Dieses Verzeichnis dokumentiert abweichend das geplante Hosting bei Hetzner** (Art. 28). Vor Produktivbetrieb müssen Privacy-Text, AV-Vertrag und dieses Verzeichnis vom DSB in Einklang gebracht werden.

Quellen (Ist-Software): `docs/projektdokumentation.md`, `docs/installation.md`, `docs/hilfe.md`, `README.md`, `lib/privacy.js`, `data/privacy.json`, `lib/auditLogger.js`, `lib/rateLimiter.js`, `lib/settings.js`, `lib/branding.js`, `lib/auth.js`, `lib/userDb.js`, `lib/userAuth.js`, `lib/userService.js`, `lib/emailService.js`, `lib/events.js`, `docker-compose.yml`, `scripts/install-vps-ubuntu.sh`, `scripts/install.sh`, `scripts/seed-data.sh`.

---

## 1. Verantwortlicher (Art. 4 Nr. 7, Art. 30 Abs. 1 lit. a DSGVO)

| Feld | Angabe |
|---|---|
| Name | Landeshauptstadt Saarbrücken |
| Anschrift | Rathaus St. Johann, Rathausplatz 1, 66111 Saarbrücken |
| E-Mail | stadt@saarbruecken.de |
| Telefon | +49 681 9050 |
| Gesetzliche Vertretung | Oberbürgermeister Uwe Conradt |
| USt-IdNr. | DE 138116928 (laut Impressum der Landeshauptstadt, § 27a UStG) |

Die Anwendung dient öffentlichen Stellen zur **anonymen bzw. datensparsamen Live-Interaktion** in Veranstaltungen (Umfragen, Wortwolken, Fragen und Antworten, Quiz, Bewertungsskalen). **Teilnehmende** benötigen **kein Konto**. Optional kann die Instanz eine **Benutzerverwaltung** für Administratoren, Redakteure und Betrachter aktivieren (`USER_AUTH_ENABLED=1`): Anmeldung per **E-Mail-PIN** (kein Passwort-Login im Alltag), Rollen und Event-Zugriff. Ohne diese Option bleiben Rollen rein sessionbezogen (Presenter-Schlüssel, anonymer Join).

**Kommunalaufsicht (Impressum, nicht Datenschutzaufsicht):** Landesverwaltungsamt Saarland (Kommunalaufsicht), Am Markt 7, 66386 St. Ingbert. Oberste Kommunalaufsicht: Ministerium für Inneres, Bauen und Sport des Saarlandes.

---

## 2. Datenschutzbeauftragte Stelle (Art. 30 Abs. 1 lit. a DSGVO)

| Feld | Angabe |
|---|---|
| Name / Funktion | Thorsten Carbon, Datenschutzbeauftragter der Landeshauptstadt Saarbrücken |
| E-Mail | datenschutz@saarbruecken.de |
| Telefon | +49 681 905-5074 |
| Post | Landeshauptstadt Saarbrücken, Rathaus St. Johann, Rathausplatz 1, 66111 Saarbrücken |

Kontakte laut Abschnitt II der Stadt-Datenschutzerklärung bzw. Organisationsplan (öffentliche Website, Stand 2026-09-02). Keine weiteren biografischen Angaben.

**Betroffenenrechte und Beschwerdeweg** in der Anwendung: Hash-Route `#/privacy` (Datenschutzerklärung) sowie `#/impressum`.

---

## 3. Zuständige Aufsichtsbehörde

| Feld | Angabe |
|---|---|
| Behörde | Unabhängiges Datenschutzzentrum Saarland (UDIS) — Landesbeauftragte für Datenschutz und Informationsfreiheit |
| Anschrift | Fritz-Dobisch-Straße 12, 66111 Saarbrücken; Postfach 10 26 31, 66026 Saarbrücken |
| Telefon | 0681 94781-0 |
| E-Mail | poststelle@datenschutz.saarland.de |
| Internet | https://www.datenschutz.saarland.de |

Beschwerdeformular: über die Website des UDIS (Online-Dienste / Beschwerde). Art. 77 DSGVO bleibt unberührt.

---

## 4. Auftragsverarbeiter — Hetzner (geplant, Art. 28 DSGVO)

**Status:** geplant, **noch nicht** als laufende Verarbeitung in `data/privacy.json` hinterlegt (`processorNote` ist leer; `hostingText` beschreibt noch eigenes/städtisches Hosting).

| Feld | Angabe |
|---|---|
| Firma | Hetzner Online GmbH |
| Sitz (öffentlich) | Industriestraße 25, 91710 Gunzenhausen, Deutschland |
| Rolle | Hosting der Anwendung (Server, Speicher, Netz) als **Auftragsverarbeiter** |
| Vertrag | **AV-Vertrag nach Art. 28 DSGVO ist vor Produktivbetrieb abzuschließen** (Auftragsverarbeitungsvertrag / AVV der Hetzner Online GmbH bzw. gleichwertige Vereinbarung der verantwortlichen Stelle). Vertragsnummer hier **nicht** dokumentiert. |
| Typische Rechenzentrumsstandorte (öffentlich bekannt, EU) | **Falkenstein** (Deutschland), **Nürnberg** (Deutschland), **Helsinki** (Finnland) |
| Drittland | Die genannten Standorte liegen **in der Europäischen Union**. Helsinki (Finnland) ist ein **EU-Mitgliedstaat**. Eine Übermittlung in ein Drittland im Sinne von Kapitel V DSGVO liegt bei Wahl dieser Standorte **nicht** vor. Es ist **kein** Angemessenheitsbeschluss (USA o. Ä.) für das geplante Hetzner-Hosting erforderlich. |
| Standortwahl | Die verantwortliche Stelle muss im Kundenkonto / in der Bestellung einen **EU-Standort** wählen und dies im AV-Vertrag festhalten. Konkrete Server-IPs, Rack-Nummern oder interne Ticket-IDs gehören nicht in dieses Verzeichnis. |
| Unterauftragsverarbeitung | Nur soweit der AV-Vertrag sie zulässt und die verantwortliche Stelle sie kennt. Keine erfundenen Subunternehmerlisten. |
| Drittweitergabe durch die App | **Keine** Weitergabe an Werbe- oder Analysedienste. **Kein Google Analytics**, kein Matomo, kein Tracking-Pixel, kein `gtag`, keine Google Fonts / Schrift-CDNs. |

### 4.1 Weitere Empfänger nur bei Nutzung optionaler Funktionen

Diese Empfänger sind **kein** Standard der Anwendung; sie entstehen nur, wenn die Stelle die jeweilige Funktion einschaltet:

| Empfänger | Anlass | Hinweis für den DSB |
|---|---|---|
| Internet Security Research Group / Let’s Encrypt (Sitz USA) | Beantragung von TLS-Zertifikaten (HTTP-01, Admin `#/admin/ssl`) | Domain und im Admin-Formular angegebene Kontakt-E-Mail gehen an Let’s Encrypt. Ob Kapitel V DSGVO greift, prüft der DSB; Beantragung nur nach Bestätigung der Nutzungsbedingungen. Private Keys bleiben auf dem Server (Dateimodus 0600), nicht in der REST-API. |
| Optional PostgreSQL / Redis | **Redis:** in Docker Compose Standard (`REDIS_URL=redis://redis:6379`) für Live-Fanout zwischen zwei App-Instanzen (`pulse`, `pulse-b`); **kein** dauerhaftes Personenverzeichnis, nur Nachrichtenbus. **PostgreSQL:** nur wenn `DATABASE_URL` gesetzt und Paket `pg` installiert. Ob Redis/Postgres beim selben AV (Hetzner) oder einem weiteren AV liegt, ist betrieblich festzuhalten. |
| Prometheus / Grafana | Optional im Docker-Stack (Port 3001 Grafana); Standard-Dashboards für Betriebsmetriken der App, **keine** Teilnehmer-Klarnamen in den mitgelieferten Dashboards. Grafana-Admin-Passwort über `GRAFANA_PASSWORD` in `.env` (VPS-Setup). |
| **SMTP-Relais (optional)** | Versand der **Anmelde-PIN** an Instanz-Benutzer, wenn `USER_AUTH_ENABLED=1` (`lib/emailService.js`, Variablen `SMTP_*`). Nur bei aktivierter Benutzerverwaltung; Entwicklung: `AUTH_DEV_MAILBOX=1` ohne echten Versand. Empfänger und Inhalt (PIN, App-Name) liegen beim Mail-Provider; AV-Vertrag mit dem SMTP-Anbieter prüfen. |
| Reverse-Proxy / Betriebssystem | Zugriffsprotokolle außerhalb der App | Die Anwendung speichert **keinen** HTTP-User-Agent. Ob nginx, Host-Firewall oder Hetzner-Access-Logs IPs protokollieren, liegt **außerhalb** dieser Software und ist vom Betrieb / DSB zu klären. |

---

## 5. Verarbeitungstätigkeiten (Art. 30 Abs. 1 lit. b–g DSGVO)

### 5.0 Haupttätigkeit — Durchführung interaktiver Live-Umfragen

| Art.-30-Feld | Inhalt |
|---|---|
| **Bezeichnung** | Durchführung interaktiver Live-Umfragen und Townhalls (Pulse) |
| **Zwecke** | Anonyme bzw. datensparsame Interaktion in öffentlichen oder internen Veranstaltungen: Multiple Choice, Ranking, 100 Punkte, Freitext, Bildwahl, Terminfindung, **Picker** (10–50 Optionen), Wortwolke, Live-Q&A, Quiz, Bewertungsskala, Reaktionen auf der Leinwand; Präsentation auf einer Bühne; Moderation; Katalog geplanter/aktiver Events mit Join-Code (ein Code = eine Session, ein Deck); optionale Instanzverwaltung (Branding, Rechtstexte, TLS). |
| **Rechtsgrundlagen (Art. 6 DSGVO)** | Siehe Unterabschnitt 5.0.1. Maßgeblich für die Kommune: **Art. 6 Abs. 1 lit. e DSGVO i. V. m. SDSG**. |
| **Kategorien Betroffener** | (1) Teilnehmende (anonym, kein Klarname); (2) Presenter / Session-Admin; (3) Instanz-Admin; (4) **optional:** registrierte Instanz-Benutzer (Admin/Editor/Viewer); (5) optionale Kontaktfelder des DSB / der Stadt in den Rechtstexten (keine Verarbeitung von Betroffenenanfragen *in* der App). |
| **Datenkategorien** | Siehe Unterpositionen 5.1–5.11 (Ist aus dem Code). |
| **Empfänger** | Hetzner als geplanter AV (Abschnitt 4). Keine Drittweitergabe zu Werbung/Analyse. Let’s Encrypt nur bei SSL-Beantragung. |
| **Drittland** | Geplantes Hosting EU (DE/FI). Kein US-Angemessenheitsbeschluss für Hetzner-EU. Let’s Encrypt: USA, nur optional (Abschnitt 4.1). |
| **Löschfristen** | Sessions: Branding `retentionDays` (Default **30 Tage**; wählbar 7 / 30 / 90 / 0 = keine Auto-Löschung), stündlicher Sweep. Audit: **90 Tage**. Event-Katalog (`data/events.json`): bis Admin-Löschung (nur Status geplant/archiviert). Details in Abschnitt 6. |
| **TOM** | Abschnitt 7. |

#### 5.0.1 Rechtsgrundlagen (aus dem Privacy-Muster, nicht neu erfunden)

Es gelten DSGVO, BDSG und für öffentliche Stellen des Saarlandes das **Saarländische Datenschutzgesetz (SDSG)**. Telemedien: **DDG** (seit 14. Mai 2024); Speicherung in der Endeinrichtung: **TDDDG**. Das KDG ist für die Landeshauptstadt Saarbrücken **nicht** einschlägig.

| Grundlage | Verwendung in dieser Anwendung |
|---|---|
| **Art. 6 Abs. 1 lit. e DSGVO i. V. m. SDSG** | **Hauptrechtsgrundlage** der Kommune: Aufgabe im öffentlichen Interesse bzw. Ausübung öffentlicher Gewalt (interaktive Bürger- oder Mitarbeiterveranstaltungen, Meinungsbilder ohne Klarnamenspflicht). Technische Sicherungsmaßnahmen (Rate-Limiting, Integrität, IP-Hash-Sperre) stützt die öffentliche Stelle auf **lit. e** bzw. **Art. 32 DSGVO**, nicht auf lit. f. |
| **Art. 6 Abs. 1 lit. a DSGVO** | Einwilligung, soweit sie eingeholt wird (Hinweisdialog zur lokalen Speicherung; optionale Speicherung der Darstellung). Freiwillig und unabhängig von der Teilnahme an der Abstimmung. |
| **Art. 6 Abs. 1 lit. c DSGVO** | Soweit gesetzliche Pflichten (z. B. Nachweis der IT-Sicherheit, kurze Audit-Aufbewahrung) eine Speicherung verlangen. |
| **Art. 6 Abs. 1 lit. b DSGVO** | Nur soweit ausnahmsweise vertragliche Nutzung vorliegt; für die klassische kommunale Veranstaltung **nachrangig**. |
| **Art. 6 Abs. 1 lit. f DSGVO** | **Für Behörden in Erfüllung ihrer Aufgaben gilt lit. f nach Art. 6 Abs. 1 Satz 2 DSGVO nicht.** Keine Stützung von Sicherheit/Rate-Limit auf „berechtigtes Interesse“. |

---

### 5.1 Unterposition — Anonyme Teilnahme (Join, Stimmen, Wortwolke, Q&A, Quiz, Skala)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Live-Teilnahme an einer Sitzung ohne Login |
| Zwecke | Beitritt per sechsstelligem Join-Code oder QR (Session oder öffentliches Event); Abgabe von Stimmen, Wörtern, Fragen, Quiz-Antworten, Bewertungsskala; optionale Emoji-Reaktionen (nur live) |
| Kategorien Betroffener | Teilnehmende (natürliche Personen, **ohne Pflicht zum Klarnamen**) |
| Datenkategorien (Ist) | **Session-Code** (sechsstellige numerische Kennung, serverseitig Schlüssel der Sitzung). **Stimmen** als Zählwerte je Option (eine Stimme pro Client-ID und Folie bei Poll/Skala; bei **Picker** eine oder mehrere Option-IDs je nach Einstellung, begrenzt durch `maxSelections`), keine namentliche Wählerliste. **Wortwolke:** eingesendete Wörter (max. 32 Zeichen), aggregiert. **Q&A:** Fragetext (max. 500 Zeichen), Zeit-/Statusdaten, Upvotes; intern zufällige Client-ID; in CSV/PDF nur Kürzel `User_xxxx`. **Quiz:** gegebene Antworten, optionale Rangliste anhand Client-ID ohne Klarname. **Rating-Skala:** wie Poll (Counts). **Reaktionen** (👏 ❤️ 👍 ❓): nur Animation, **keine Persistenz**. **Client-ID:** zufällig in `sessionStorage` (`pulse:client-id`), Header `X-Client-Id`. Geräte-Typ / Bildschirmgröße: **nicht erhoben**. HTTP-User-Agent: **von der App nicht gespeichert**. |
| Empfänger | Server der Instanz (geplant: Hetzner). Presenter sieht aggregierte Ergebnisse bzw. moderierte Q&A. |
| Löschung | Mit der Sitzung nach `retentionDays` (Sweep). Reaktionen sofort vergessen. Browser-Client-ID: Tab schließen. |

### 5.2 Unterposition — Präsentation und Session-Administration

| Feld | Inhalt |
|---|---|
| Bezeichnung | Anlegen und Steuern einer Sitzung (Presenter) |
| Zwecke | Session erzeugen, Folien/Deck (max. 40) inkl. Inhaltsbearbeitung (Frage, Optionen, Typ-Einstellungen), Lobby, Ergebnis-Reveal, Moderation, Notfallpause, CSV/PDF-Export Q&A, optionales Presenter-Passwort |
| Kategorien Betroffener | Presenter / Session-Admin |
| Datenkategorien (Ist) | Admin-Schlüssel im Browser `sessionStorage` unter `pulse:admin:<code>` (**kein Cookie**); auf dem Server nur **HMAC-SHA-256**, nicht der Klartext. Optionales Presenter-Passwort nur als **scrypt-Hash** (`salt:hash`, N=16384, r=8, p=1). **Folieninhalte** (Fragetexte max. 500 Zeichen, Antwortoptionen — bei Picker **10–50** Einträge à max. 100 Zeichen, optionale **Kategorien** mit Name/Farbe, Quiz-Korrekturen, Rating-Skala, Bildwahl als Data-URL max. 96 KiB/Bild, Termin-Slots, Presenter-Notizen max. 4000 Zeichen, geplante Minuten). **Dynamisches Session-Formular** zeigt nur typrelevante Felder (keine zusätzliche Speicherung). Änderungen per REST `PATCH …/slides/:id` bzw. Deck-`update`; Broadcast WebSocket `deck` / `slide_updated`. Emergency-Backup der Q&A-Status in der Session. Exporte, die lokal gespeichert werden, unterliegen der Aufbewahrung der Stelle. |
| Empfänger | Wie Haupttätigkeit. Export-Dateien verlassen den Server nur durch Download durch den Presenter. |
| Löschung | Session-Sweep; Admin-Schlüssel im Browser bis Tab-Ende. |

### 5.3 Unterposition — Browser-Speicher und Session-Cookie (Administration)

**Teilnehmende** und **Presenter** nutzen weiterhin **keine** Tracking-Cookies. Für die **optionale Benutzerverwaltung** setzt der Server ein **HttpOnly-Session-Cookie** (`pulse_auth`, signiertes Token, Hash in SQLite/PostgreSQL).

| Speicherort | Schlüssel / Cookie (Ist) | Inhalt / Zweck | Löschung |
|---|---|---|---|
| HTTP-Cookie | `pulse_auth` (nur bei `USER_AUTH_ENABLED=1`) | Admin-/Editor-/Viewer-Sitzung nach PIN-Anmeldung; `Secure` in Produktion | Logout, Ablauf (Standard 7 Tage persistent / 8 h ohne „Angemeldet bleiben“), Sitzungswiderruf durch Admin |
| `localStorage` | `pulse-theme` | Hell/Dunkel (Default Light; Dark nur bei exakt `"dark"`) | Bis Löschung durch die nutzende Person |
| `localStorage` | `pulse:session:…`, `pulse:recent` | Lokale Entwürfe / zuletzt genutzte Sitzungen auf diesem Gerät | Lokal, gerätegebunden |
| `localStorage` | `tt:consent` | Bestätigung des Datenschutz-Hinweises | Befristet **90 Tage** |
| `localStorage` | `pulse:tour-done` | Erstnutzer-Tour abgeschlossen | Lokal |
| `localStorage` | `pulse:help-feedback` | Ja/Nein-Feedback zu Hilfeartikeln, **kein Server-Upload** | Lokal (max. 200 Einträge clientseitig) |
| `sessionStorage` | `pulse:client-id` | Zufällige Teilnehmerkennung | Tab schließen |
| `sessionStorage` | `pulse:admin:<code>` | Session-Admin-Schlüssel | Tab schließen |
| `sessionStorage` | `tt:lang` | Sprache (DE/EN/FR) | Tab schließen |
| `sessionStorage` | `pulse:tour-later` | Tour verschoben | Tab schließen |
| `sessionStorage` | `pulse:start-type` | Kurzlebiger Start-Hinweis | Einmalig verbraucht |

### 5.4 Unterposition — IP-Adresse (temporär / Hash)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Missbrauchsschutz (Rate-Limit, WebSocket-Cap, optionale Sperre) |
| Zwecke | Begrenzung gleichzeitiger Verbindungen und Request-Raten; Abwehr von Überlastung |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. e / Art. 32 DSGVO (nicht lit. f) |
| Datenkategorien | **Klar-IP nur kurz im Arbeitsspeicher** für Rate-Limiting; danach verworfen (`lib/rateLimiter.js`: Maps, kein Persist der Klar-IP). Im **Audit** nur **SHA-256, 16 Hex-Zeichen** (`lib/auditLogger.js` `hashIp`). Optionale **24-Stunden-Sperre** speichert ebenfalls nur den Hash (`blacklist` in Memory). Limits (Ist): 1000 HTTP/Minute/IP; 100 gleichzeitige WebSockets/IP; Fragen-Intervall aus Branding (Default 30 s); 3 Upvotes/Minute; 8 Reaktionen / 10 s. |
| Löschung | Speicherfenster der Rate-Limiter (Minutenbereich); Blacklist 24 h oder bis Abschalten (`IP_BLOCK=0` / Branding `ipBlock: false`). Audit-Hash: 90 Tage. |

### 5.5 Unterposition — Audit-Protokoll

| Feld | Inhalt |
|---|---|
| Bezeichnung | Protokoll kritischer Aktionen |
| Speicherung | `data/audit.json`, max. 5000 Zeilen |
| Datenkategorien | Zeitstempel, Ereignistyp, Sitzungscode (`roomId`), ggf. Nutzer-/Client-Kürzel, Aktion, Frage-ID, **IP nur als Hash** |
| Zugriff | Export `GET /api/audit` nur für **Instanz-Administratoren** (Cookie-Session Rolle `admin` oder `ADMIN_SECRET` / Notfall-Bootstrap) und nach **Step-up-PIN** (15 Min. Gültigkeit) |
| Löschung | Automatischer Sweep nach **90 Tagen** |
| Nicht enthalten | Sessions, Umfrageantworten (die liegen in der Session-DB, nicht im Audit-Export des Settings-Bundles) |

### 5.6 Unterposition — Instanzverwaltung (Branding, Privacy, Logo)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Gestaltung und Rechtstexte der Instanz |
| Kategorien Betroffener | Instanz-Admin; in den Texten genannte Kontaktpersonen (DSB, Stadt) als **Inhaltsdaten der Erklärung**, nicht als Tracking |
| Datenkategorien | `data/branding.json`: Farben, Footer, Sprachen, Retention, Wortfilter, Homepage-URL, **Logo als Data-URL** (PNG/JPEG/SVG/WebP, Limit 256 KiB), optional Schrift/Folienhintergrund/Sound/Favicon als Data-URL (harte Limits), `appName`, `customDomain` (Hostname), `footerHidden`. `data/privacy.json` und `data/privacy-versions.json` (letzte 20 Stände, **kein Secret**). Auth: **`ADMIN_SECRET`** (Header `X-Admin-Key` / Bearer, Notfall/Bootstrap) **oder** Cookie-Session bei aktivierter Benutzerverwaltung. Kritische Schreibzugriffe (Branding, Privacy, Settings, SSL, Benutzer) zusätzlich **Step-up-PIN** für Cookie-Admins. Interner Dateiname `pulse.db` ändert sich durch White-Label nicht. |
| Löschung | Bis Änderung/Löschung durch Admin; Privacy-Historie rollierend 20 Einträge. |

### 5.7 Unterposition — TLS-Zertifikate (optional)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Let’s-Encrypt-Zertifikate über die Admin-SSL-Funktion |
| Datenkategorien | Metadaten in SQLite `ssl_certificates` (Domain, Kontakt-E-Mail, Status, Ausgabe/Ablauf, Staging-Kennzeichen) **ohne Private Keys in der Tabelle**. **SSL-PEMs auf dem Server:** `SSL_DIR/<domain>/privkey.pem`, `cert.pem`, `chain.pem`, `fullchain.pem`; Kontoschlüssel `SSL_DIR/account.pem` (0600). REST-SSL-API serialisiert **keine** Keys. |
| Empfänger | Let’s Encrypt (Abschnitt 4.1), sonst nur der Server |
| Löschung | Bis Löschen, **Widerruf** oder Ablauf; Auto-Renew ca. 30 Tage vor Ablauf (Zertifikate 90 Tage). Bei Nichtnutzung der Funktion entfällt die Verarbeitung. |

### 5.8 Unterposition — Settings-Backup (sensible Datei)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Export/Import der Instanz-Einstellungen (`lib/settings.js`, Schema 2) |
| Datei | Download `pulse-settings.json` (`GET /api/settings/export`) |
| Enthalten | Branding **inkl. Logo-Data-URL**, Privacy inkl. Versionshistorie, SSL-Metadaten **und PEM-Dateien** (`privkey` / `cert` / `chain` / `fullchain` je Domain, optional ACME-`accountPem`) |
| **Nicht enthalten** | Sessions, Umfrageantworten, Events (`data/events.json`), Audit-Logs, `ADMIN_SECRET`, `.env` |
| DSB-Hinweis | Die Backup-Datei enthält **Schlüsselmaterial (Private Keys)**. Zugriff **nur Instanz-Admin**. Wie ein Secret behandeln: kein unverschlüsselter Versand, keine Ablage in Tickets/Chat, eingeschränkte Speicherung. Import lädt HTTPS neu ohne Prozessneustart. Schema 1 (ohne PEM) bleibt importierbar. |

### 5.9 Unterposition — Event-Katalog (Veranstaltungen, Join-Codes)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Verwaltung geplanter und laufender Veranstaltungen |
| Zwecke | Katalog auf der Startseite; fester sechsstelliger Join-Code = Session-Code (`joinCode` === `sessionCode`); optionales Event-Branding (Logo/Farben/Footer) nur für Join/Presenter dieser Session |
| Kategorien Betroffener | Instanz-Admin (Pflege); Teilnehmende nur über die daraus entstehende Live-Session (5.1) |
| Datenkategorien (Ist) | `data/events.json`: Titel, Beschreibung, Zeitraum (`startAt`/`endAt`), optionale **Startuhrzeit** `startTime` (ISO, für Countdown), optionale **Event-Grafik** `eventImage` (Data-URL; öffentliche Listen ohne Bildbytes, nur `hasEventImage`), Status, Kategorie, Raum, Join-/Session-Code, optionales Branding, `templateEventId` / `copyFromId` für Vorlagen. **Kein** verschachteltes `sets[]` mehr — pro Event genau **ein** Deck in der verknüpften Session (`pulse.db`, Feld `eventId` im Session-Payload). Folien, Stimmen und Q&A liegen ausschließlich in `pulse.db`, nicht in `events.json`. Cap: 80 Events (`lib/events.js`), max. 40 Folien je Session. |
| Zugriff | Lesen öffentlicher Karten ohne Secret; Schreiben für **Editor/Admin** (Cookie-Session oder `ADMIN_SECRET`). Deck-Editor: `#/admin/sessions/:code` (Presenter-Schlüssel, Event-Berechtigung oder Instanz-Admin). Event-Zugriff pro Nutzer: `ownerUserId`, `editorUserIds`, `presenterUserIds`, `viewerUserIds`. |
| Löschung | Kein Auto-Sweep über `retentionDays`. Löschen in der UI nur bei Status geplant oder archiviert. Session-Daten in `pulse.db` unterliegen separat `retentionDays`. |
| Nicht enthalten | E-Mail-Einladungen, Versandlisten, automatische Benachrichtigungen bei Statuswechsel; parallele „Sets“ pro Event |

### 5.10 Unterposition — In-App-Hilfe und Dokumentation

| Feld | Inhalt |
|---|---|
| Bezeichnung | Hilfe, Tour, Druck-Guides |
| Zwecke | Nutzerführung (Presenter, Teilnehmende, Admins); keine Verarbeitung personenbezogener Daten auf dem Server |
| Datenkategorien | Hilfe-Inhalte in `frontend/help/` (HTML, Katalog `articles.json`, **Version 11**, Programm **v1.5.21**; u. a. Auth/Login, Picker, Interaktionssteuerung, Backups, Updates/Rollback). Markdown-Spiegel: `docs/hilfe.md` (Programmversion im Kopf). Feedback ja/nein nur in `localStorage` (`pulse:help-feedback`, s. 5.3). Erstnutzer-Tour: `pulse:tour-done` / `pulse:tour-later`. |
| Empfänger | Keine Übermittlung an Dritte; statische Dateien vom gleichen Server |
| Löschung | Lokal auf dem Endgerät |

### 5.11 Unterposition — Benutzerverwaltung (optional, `USER_AUTH_ENABLED=1`)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Instanz-Benutzer, E-Mail-PIN-Anmeldung, Rollen |
| Zwecke | Zugriffskontrolle auf Administration (Branding, Events, Benutzer); Trennung Admin / Editor / Viewer; optional Selbstregistrierung |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. e DSGVO i. V. m. SDSG (IT-Betrieb und Zugriffskontrolle); ggf. lit. c für Nachweispflichten |
| Kategorien Betroffener | Registrierte Instanz-Benutzer (Administratoren, Redakteure, Betrachter) |
| Datenkategorien (Ist) | In **`pulse.db`** (SQLite) bzw. PostgreSQL bei `DATABASE_URL`: Tabellen `users` (Anzeigename, E-Mail, **scrypt-Kennwort-Hash** nur für Kontoänderungen, Rolle, Status, Kommentar, Zeitstempel), `auth_pins` (**gehashter** 6-stelliger PIN, 10 Min. Gültigkeit, einmalig), `auth_sessions` (Token-Hash, Ablauf, optional `step_up_until` für Step-up), `auth_settings`, `user_event_access`. **Kein Klartext-PIN** in der DB. E-Mail-Versand: PIN im SMTP-Body (Provider abhängig). Rate-Limits: `lib/pinLimiter.js`. Audit-Ereignisse: `user_created`, `pin_requested`, `pin_verified`, `step_up_verified`, … |
| Empfänger | SMTP-Relais (Abschnitt 4.1); sonst nur Server der Instanz |
| Löschung | Benutzer löschen in `#/admin/users`; PINs nach Verbrauch/Ablauf bereinigt; Sitzungen bei Logout/Widerruf/Kennwortänderung |
| Nicht enthalten | Teilnehmer-Login; SSO/LDAP; Passkeys/WebAuthn (nicht implementiert) |

### 5.12 Unterposition — Instanz-Backups (ZIP, Admin)

| Feld | Inhalt |
|---|---|
| Bezeichnung | Vollständige oder teilweise Sicherung/Wiederherstellung der Instanz (`#/admin/backups`, `lib/backupService.js`) |
| Zwecke | Disaster Recovery, Migration, gezieltes Einspielen einzelner Admin-Bereiche |
| Kategorien Betroffener | Instanz-Administratoren; Inhalte der gesicherten Bereiche (s. u.) |
| Datenkategorien (Ist) | ZIP mit `pulse.db` (Sessions, Benutzer, Teams, Auth), `events.json`, `branding.json`, Privacy-JSON, `email-config.json`, `audit.json`, Backup-/Update-Konfiguration, `ssl/` (PEMs), `uploads/`, optional `.env`. Metadaten: `backup-metadata.json`. Speicherort: `data/backups/` (konfigurierbar `BACKUP_DIR`). |
| Gruppenweise Wiederherstellung | Auswahl nach Admin-Bereichen — API `groups[]`; Erstlogin unter `#/admin/onboarding` |
| Version / Migration | Abweichende `appVersion` in Metadaten → `lib/dataMigration.js` (Events-Legacy, SQL-Hinweise) |
| Empfänger | Keine automatische Übermittlung; Download liegt beim Admin; Upload nur in lokales Backup-Verzeichnis |
| Löschung | Manuelles Löschen in der UI; Auto-Backup-Aufbewahrung `retentionDays` (Default 7) |
| DSB-Hinweis | Backups können **Private Keys**, Benutzerdaten und Session-Inhalte enthalten — wie Secrets behandeln, verschlüsselt lagern, Zugriff protokollieren |
| Abgrenzung | Settings-Export (5.8) nur Branding/Privacy/SSL-Metadaten+PEM; Update-Backups nur für Code-Deployment |

---

## 6. Lösch- und Aufbewahrungsfristen (Überblick)

| Daten | Frist (Ist) | Mechanismus |
|---|---|---|
| Umfrage-Sitzungen (Folien, Stimmen, Wortwolke, Q&A, Quiz) | Branding `retentionDays`: **7 / 30 / 90** Tage oder **0** = keine Auto-Löschung. **Voreinstellung der Instanz: 30 Tage** (`lib/branding.js` / `data/branding.json`) | Stündlicher Sweep `sweepExpiredSessions` |
| Event-Katalog (`data/events.json`) | Bis Admin-Löschung (nur geplant/archiviert) | Kein Retention-Sweep; stündlich nur Status-Tick (`tickEventStatuses`) |
| Audit-Protokoll | **90 Tage** | Sweep in `lib/auditLogger.js` |
| IP Klartext | Nur Arbeitsspeicher / Rate-Limit-Fenster | Kein Persist |
| IP-Hash in Audit | 90 Tage | s. Audit |
| IP-Hash-Sperre | 24 Stunden | Memory-Map |
| Browser-Session (Client-ID, Admin-Key, Sprache) | Tab-Ende | `sessionStorage` |
| Theme | Bis Nutzerlöschung | `localStorage` |
| Consent-Vermerk | 90 Tage | `tt:consent` |
| Admin-Session-Cookie (`pulse_auth`) | 8 h bis 7 Tage | Server-Sitzung + Cookie-Ablauf |
| Instanz-Benutzer (`users`, PINs, Sessions) | Bis Löschung/Deaktivierung durch Admin | `#/admin/users`; Sweep abgelaufener PINs/Sessions |
| SSL-Zertifikate / PEMs | Bis Löschen, Widerruf oder Ablauf | Admin-SSL / Dateisystem |
| Settings-Backup | Aufbewahrung der Stelle (Datei liegt beim Downloadenden) | Kein Server-Archiv der Exports in der App |
| Instanz-ZIP-Backups | Aufbewahrung der Stelle (`data/backups/`, Default 7 Tage Auto-Backup) | Admin-UI `#/admin/backups`; optional bei Installation |
| Reaktionen | Keine Speicherung | Nur live |
| Hilfe-Feedback | Nur lokal, kein Server | `pulse:help-feedback` |
| VPS-Installationsdatei | Bis manuelle Löschung durch Betrieb | `INSTALL-CREDENTIALS.txt` (enthält `ADMIN_SECRET`, Grafana-Passwort; **nicht** in Git, chmod 600; außerhalb der App-Logik) |

Ist `retentionDays = 0`, löscht die Stelle Sessions, sobald der Zweck entfällt oder eine gesetzliche Pflicht endet (Privacy-Muster).

---

## 7. Technische und organisatorische Maßnahmen (Art. 32 / Art. 30 Abs. 1 lit. g DSGVO)

Stichwortartig aus README, Projektdokumentation und `lib/*` — **kein** vollständiges TOM-Konzept nach ISO 27001:

- **Transport:** HTTPS/TLS, sobald ein Zertifikat aktiv ist (Admin-SSL / Let’s Encrypt oder vorgeschalteter Proxy). HTTP→HTTPS-Redirect konfigurierbar (`SSL_REDIRECT`).
- **Schlüssel auf der Platte:** PEM-Dateimodus 0600; Private Keys nicht in REST und nicht in Privacy-Versionshistorie.
- **Admin-Auth:** `ADMIN_SECRET` (Notfall/Bootstrap/API) **und/oder** Cookie-Session bei Benutzerverwaltung; Session-Presenter HMAC-SHA-256; optionales Presenter-Passwort **scrypt**; Step-up-PIN für kritische Admin-Aktionen.
- **Datensparsamkeit:** keine Klarnamenspflicht für Teilnehmende, **kein Tracking**, kein Fingerprinting, kein Geräte-Typ, User-Agent nicht durch die App gespeichert. **Ein** technisch notwendiges Session-Cookie nur für optionale Instanz-Benutzer (`pulse_auth`).
- **IP:** Klar-IP nur temporär; Audit und Sperre nur Hash (SHA-256, 16 Hex).
- **Rate-Limiting / Caps:** HTTP, WebSocket, Fragen, Upvotes, Reaktionen; optionale 24h-IP-Hash-Sperre.
- **Moderation:** lokaler Wortfilter (`config/badwords.json`, kein externes Moderations-API); Spam-Heuristik flaggt, löscht nicht hart; Notfall-Button pausiert Intake.
- **Exporte:** Q&A nur `User_xxxx`.
- **Retention:** konfigurierbarer Session-Sweep; Audit 90 Tage.
- **Deployment:** Docker Compose (optional): zwei App-Container hinter nginx (`ip_hash` für WebSocket-Sticky), Redis, optional Prometheus/Grafana; Datenverzeichnis `./data` am Host (SQLite, JSON, SSL-PEMs). VPS-Installation: `scripts/install-vps-ubuntu.sh` (Docker, UFW, `.env`, `scripts/seed-data.sh` für Grundeinstellungen). `ADMIN_SECRET` nur in `.env` / `INSTALL-CREDENTIALS.txt`, nicht im Repository.
- **Kein Profiling, keine automatisierte Einzelentscheidung** (Art. 22) in der Software: aggregierte Meinungsbilder, Quiz-Punkte anhand Client-ID ohne Identitätsabgleich zu Klarnamen.
- Betriebliche Ergänzung (nicht App-Code): Zugang zum Hetzner-Konto, Admin-Secret, Backup-Dateien und Server-SSH liegen in der Verantwortung der Stelle (Need-to-know, getrennte Accounts).

---

## 8. Risiko, Profiling, Datenschutz-Folgenabschätzung

- Die Anwendung verarbeitet **keine besonderen Kategorien** nach Art. 9 DSGVO *by design* (keine Gesundheits-, Religions- oder Ausweisfelder). Q&A-Freitext kann gleichwohl sensible Inhalte enthalten — Moderation und Wortfilter mindern, ersetzen aber keine organisatorische Anweisung an Presenter.
- **Kein Profiling** im Sinne von Art. 4 Nr. 4 DSGVO (keine Bewertung persönlicher Aspekte über die Sitzung hinaus, kein Tracking über Sitzungen hinweg, keine Werbeprofile).
- **Keine Fake-DPIA-Zahlen.** Eine Datenschutz-Folgenabschätzung (Art. 35 DSGVO) ist in diesem Entwurf **nicht ausgefüllt**.
- **Hinweis an den DSB:** Bei **umfangreichen Live-Events** (große Teilnehmendenzahl, sensible Veranstaltungsthemen, systematische Auswertung von Freitext/Q&A über den Sitzungszweck hinaus) sollte geprüft werden, ob eine **DSFA** erforderlich ist. Schwellen, Schwellwertkatalog der Aufsicht und das Ergebnis der Prüfung gehören in ein gesondertes DSFA-Dokument, nicht hierher.

---

## 9. Betroffenenrechte

Rechte aus Art. 15–21 DSGVO (Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit soweit anwendbar, Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. e, Widerruf einer Einwilligung für die Zukunft) sowie Beschwerde Art. 77 DSGVO.

**Verweis:** Die für Nutzende lesbare Darstellung steht in der Anwendung unter **`#/privacy`**. Kontaktwege dort: DSB `datenschutz@saarbruecken.de` bzw. `stadt@saarbruecken.de`.

Weil Abstimmungen ohne Klarnamen erfolgen, gelingt eine Zuordnung oft nur, wenn die betroffene Person Join-Code, ungefähren Zeitpunkt und ggf. den Wortlaut des Beitrags mitteilt.

Für öffentliche Stellen können sich Besonderheiten aus § 34, § 35 BDSG und dem SDSG ergeben; Klärung im Einzelfall durch den DSB.

---

## 10. Systemüberblick (Ort der Verarbeitung, zur Einordnung)

| Schicht | Ist |
|---|---|
| Frontend | Vanilla JS, Hash-Routing (`#/admin`, `#/help`, `#/join/:code`, …) |
| Persistenz | Standard SQLite (`SQLITE_PATH`, lokal `data/pulse.db`; Docker: `/app/data/pulse.db` via Volume `./data`) plus JSON unter `data/` (`events.json`, `branding.json`, `privacy.json`, `audit.json`, `ssl/`) |
| Live | Eigenes WebSocket; Redis in Docker Compose für Fanout zwischen `pulse` und `pulse-b` |
| Reverse Proxy | nginx in Docker (Ports 80/443), WebSocket-Upgrade, optional TLS-Terminierung |
| Installation | Lokal: `scripts/install.sh`; Produktion VPS: `scripts/install-vps-ubuntu.sh`; Seed: `scripts/seed-data.sh` (Branding/Privacy-Defaults, leerer Event-Katalog) |
| Dokumentation | `docs/projektdokumentation.md`, `docs/installation.md`, `docs/hilfe.md` (Benutzerhilfe) |

Geplanter Ausführungsort der Serverprozesse: Rechenzentrum Hetzner (EU, Abschnitt 4). Client-seitiger Speicher verbleibt auf dem Endgerät der Nutzenden.

**Hinweis SQLite:** Zwei App-Instanzen teilen sich in Docker ein gemeinsames Volume für `./data`; SQLite ist nicht multi-writer-hart — für hohe Last oder strikte Parallelität ist PostgreSQL (`DATABASE_URL`) vorgesehen.

---

## 11. Änderungshistorie

| Datum | Fassung | Änderung |
|---|---|---|
| 2026-09-02 | 1 | Erstentwurf für den DSB. Ist-Datenkategorien aus dem Repository. Geplantes Hosting Hetzner (Art. 28) dokumentiert; Privacy-JSON noch ohne AV-Absatz. Event-Katalog `data/events.json` als Unterposition 5.9 (Join-/Session-Code, Deck in der Session). |
| 2026-09-03 | 2 | Stand Software 2026-09-03: Event-Modell ohne `sets[]` (ein Event = eine Session, Deck nur in `pulse.db`); Docker Compose / VPS-Installation (`install-vps-ubuntu.sh`, `seed-data.sh`, Volume `./data`); Redis als Compose-Standard; optional Prometheus/Grafana; Hilfe-Unterposition 5.10 und `docs/hilfe.md`; erweiterte Folientypen; `INSTALL-CREDENTIALS.txt` bei VPS-Setup; Quellen und Systemüberblick aktualisiert. |
| 2026-09-03 | 3 | Deck-Inhaltseditor (`update`/`PATCH …/slides/:id`, Inline/Modal, Bulk-Eigenschaften, Auto-Save, `slide_updated`); Event-`startTime`/Countdown und `eventImage`; Hilfe-Katalog Version 5; Folieninhalte in 5.2 präzisiert. |
| 2026-09-03 | 4 | Folientyp **Picker** (10–50 Optionen, Kategorien, Suche, Single/Multi); **dynamisches Session-Formular** (`slideForm.js`); Hilfe-Katalog Version 6 (22 Artikel); Picker in 5.0/5.1/5.2; `docs/hilfe.md` und `frontend/help/picker.html`. |
| 2026-09-03 | 5 | **Benutzerverwaltung** (`lib/userDb.js`, E-Mail-PIN, Rollen admin/editor/viewer, Cookie `pulse_auth`, Step-up-PIN); Unterposition **5.11**; Abschnitt 5.3 um Admin-Cookie ergänzt; SMTP optional (4.1); Audit-Zugriff über Session-Admin; Hilfe-Katalog Version 7 (`auth-login`); `scripts/install.sh` / geplant VPS-Setup. |

Nächste erwartete Fortschreibung (nicht Teil dieses Entwurfs): Eintrag der konkreten AV-Vertragsdaten nach Unterzeichnung, Abgleich `hostingText` / `processorNote` in `data/privacy.json`, Standortbestätigung (Falkenstein / Nürnberg / Helsinki), Klärung von Access-Logs auf Hypervisor/Proxy-Ebene, ggf. DSFA-Ergebnis bei Großveranstaltungen.
