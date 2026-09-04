# Pulse

Live-Interaktion für Sitzungen und Townhalls: Präsentierende legen eine Session an oder veröffentlichen ein **Event** mit festem Join-Code. Teilnehmende treten mit einem **sechsstelligen Join-Code** oder per QR bei. Keine Benutzerkonten. Öffentlicher Name: Pulse.

Node ≥ 22. Lokal: `npm start` (HTTP-Port 3000). Tests: `npm test` (startet keinen dauerhaften Server und beendet keinen laufenden Prozess).

## Installation

**Schnellstart:**

```bash
chmod +x scripts/install.sh   # einmalig
./scripts/install.sh
export $(grep -v '^#' .env | xargs) && npm start
```

Docker (Redis, zwei App-Instanzen, nginx): `./scripts/install.sh --docker`

**VPS Ubuntu:** `sudo ./scripts/install-vps-ubuntu.sh` (installiert Docker, seedet Daten, startet Compose)

Ausführlich: **`docs/installation.md`** (Voraussetzungen, manuelle Schritte, Compose, VPS, Fehlerbehebung).

**Stabilisierungszyklus (Feature-Freeze):** siehe **`docs/feature-freeze.md`**.

## Dokumentation
- `docs/hilfe.md` — **Benutzerhilfe** (Schnellstart, Admin, FAQ, Glossar — Auszug der In-App-Hilfe)
- `docs/installation.md` — Installation und Erststart (lokal & Docker)
- `docs/projektdokumentation.md` — Ist-Zustand / Spezifikation (Architektur, Funktionen, Betrieb, Tests, Abgrenzung)
- `docs/verfahrensverzeichnis.md` — Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO, Entwurf)
- `docs/contrast.md` — WCAG-2.1-Kontrastprüfung (Stadtblau #007CC1, Orange #F99700)
- Hilfe in der App: `#/help`, `#/help/<artikel>`, `#/admin/help` (Katalog `frontend/help/articles.json`)
- Druck/PDF: **`docs/hilfe.md`** (gesamte Hilfe als Markdown)

---

## Folientypen und Deck
Typen (Startseite und Live-Editor): Multiple Choice (`choice`, 2–6 Optionen), **Picker** (`picker`, 10–50 Optionen, Suche/Kategorien), Wortwolke, Live-Q&A, Quiz, Bewertungsskala (`rating_scale`, 5/7/10 Stufen), Ranking, 100 Punkte (`points100`), Freitext (max. 280 Zeichen), Bildwahl (`image_choice`, PNG/JPEG/WebP), Terminfindung (`datetime`). Demo-Typ `demo`: vorgefertigte Folge, überspringt den Warteraum.

Das Session-Formular unter `#/admin` ist **dynamisch**: vier Blöcke (Grundlagen, Optionen, Typ-Einstellungen, Erweitert) — sichtbar je nach Folientyp.

Auf der Startseite Folien zur Liste hinzufügen, Reihenfolge ändern und erst dann starten. Während der Präsentation: Leiste mit Folien-Chips, **+** für eine neue Folie, **Duplizieren** und **Folie löschen** (mindestens eine bleibt). Maximal 40 Folien.

API (Presenter/Admin-Key): `POST /api/sessions/:code/slides` mit `{ "action": "add"|"remove"|"move"|"duplicate"|"patch", ... }`. `patch` schreibt nur Presenter-Felder (`notes`, `plannedMinutes`), keinen Typwechsel. Live über WebSocket `deck`.

## Lobby (Warteraum) und Ergebnisse
Neue Sessions starten im Warteraum (großer QR, Teilnehmerzahl). **Los geht’s** öffnet die Abstimmung. Demo- und Quiz-Vorlagen überspringen den Warteraum. In der Lobby keine Stimmen, Wörter oder Q&A-Einreichungen.

Bei Umfrage, Ranking, 100 Punkte, Freitext, Bildwahl, Termin, **Picker**, Wortwolke und Bewertungsskala bleiben Ergebnisse verborgen, bis der Präsentator **Ergebnisse zeigen** drückt (Taste `R`). Teilnehmer sehen nur, dass ihre Stimme ankam. Q&A und Quiz hängen nicht am Reveal-Schalter.

## Q&A
Einreichen (max. 500 Zeichen) mit Kategorie Technik / Organisation / Inhalt / Sonstiges. Optional **privat**: andere Teilnehmende sehen die Frage nicht, Autor und Präsentator schon. Upvotes, Gruppieren ähnlicher Fragen, kurze Presenter-Antwort (max. 800 Zeichen). Moderation: Freigeben, Verstecken, Filter nach Kategorie / privat / verdächtig.

Im Präsentator **Q&A CSV** und **Q&A PDF** (Druckdialog). Personen nur als `User_xxxx`.

## Quiz
Timer 5–60 s. Eine oder mehrere richtige Antworten; Punkte nur bei vollständiger Übereinstimmung. Optional **Teamname** beim Beitritt. Power-Ups je einmal pro Person und Session: **50:50** blendet eine falsche Option aus, **Doppelpunkte** gelten für die nächste richtige Antwort. Folien-Rangliste und Gesamtrangliste (Top 10).

Startseite: **Einführungs-Quiz**, **Wissens-Check** und **Eisbrecher**, oder Hash `#/intro-quiz` / `#/knowledge-quiz`. Leertaste startet/beendet nicht den Folienwechsel auf Quiz-Folien.

## Wortwolke
Kurze Wörter (max. 32 Zeichen). Stoppwörter (DE/EN/FR) nimmt der Server nicht an. Klick auf ein Wort zeigt die Anzahl. Auf der Bühne **PNG exportieren** (`wortwolke.png`). Reveal analog Poll.

## Picker (große Auswahllisten)
10–50 Optionen mit optionaler Suche, Kategorien (Name/Farbe) und Single- oder Mehrfachauswahl. Darstellung: Liste, Raster oder Dropdown (nur Single-Select). Massen-Import im Admin-Formular. Ergebnisse als Balkendiagramm; bei vielen Optionen Top 10 + Rest. Hilfe: `#/help/picker`.

## Presenter: Statistik, Notizen, Probe
Live-Statistik: Teilnehmerzahl, Stimmenanteil, bei Q&A Anzahl offener Beiträge, Folien-Timer gegenüber optionalen **geplanten Minuten** (1–180). **Notizen** nur für den Präsentator (max. 4000 Zeichen, nicht auf der Leinwand).

**Probe:** Checkbox / Button auf der Startseite. Banner „Proben-Modus — keine Live-Teilnehmer“. Join-Link-Kopieren in der UI deaktiviert. Join per bekanntem Code bleibt technisch möglich.

## Join am Handy
Abstimmen und Reaktionen liegen in der **Daumenzone** (unten, Viewports ≤ 640 px). Wischen wechselt nur lokale Antwort-Karten (Choice, Q&A, Quiz, Rating), nicht die Presenter-Folie. Kurze Vibration nach erfolgreichem Senden, wenn das Gerät das unterstützt. Offline-Banner bei unterbrochener Live-Leitung (Presenter und Join).

## Reaktionen
Teilnehmer können 👏 ❤️ 👍 ❓ senden. Die Emojis steigen auf der Leinwand auf, werden nicht gespeichert.

## Link und letzte Sessions
Im Präsentator **Link kopieren** (nicht im Proben-Modus). Auf der Startseite erscheinen die letzten Sessions dieses Browsers.

## Events
Admin unter `#/admin/events`: Veranstaltungen (Metadaten) mit Status geplant / aktiv / beendet / archiviert. Jedes Event hat einen `sessionCode` (gleich dem Join-Code); das Deck liegt in der Session. Nach dem Anlegen: `#/admin/sessions/:code` für Folien. Öffentliche Karten auf der Startseite mit QR, Join-Link (`#/join/:sessionCode`) und Copy-Text. Join nur bei Status **aktiv**; beendete Events zeigen Ergebnisse; geplant/archiviert blockiert Teilnehmer. Folien zwischen Sessions kopieren: `POST /api/sessions/:code/copy-from`. Event-Branding überlagert die Instanz-CI in Join/Presenter. Details: `docs/projektdokumentation.md` Abschnitt 3.24.

**Nicht enthalten** im Settings-Export: Events. Kein E-Mail-Versand bei automatischem Statuswechsel (nur Audit).

## Wortfilter
Im Admin unter `#/admin/branding` den Wortfilter aktivieren (Standard: an). Eigene Begriffe kommagetrennt eintragen. Treffer werden blockiert, ohne die konkreten Wörter preiszugeben.

## Rate-Limits
- Max. 1 Frage alle 30 Sekunden (konfigurierbar)
- Max. 3 Upvotes pro Minute
- Max. 1000 HTTP-Requests pro Minute und IP
- Max. 100 WebSocket-Verbindungen pro IP

Bei Limit: Hinweis „Bitte warte X Sekunden…“.

## Notfall-Button
Im Präsentator-View **🚨 Notfall**: versteckt alle Q&A-Fragen und pausiert Abstimmungen. **Session fortsetzen** stellt den vorherigen Status wieder her.

## Presenter-Passwort
Optional beim Anlegen der Session. Speicherung als scrypt-Hash (kein Klartext). Nach 3 Fehlversuchen 5 Minuten Sperre.

## Spam-Heuristiken
Großbuchstaben, zu viele Emojis, URLs und doppelte Texte landen in der Moderationswarteschlange.

## Audit
Kritische Aktionen stehen in `data/audit.json`. IPs nur als Hash. Löschung nach 90 Tagen. Export: `GET /api/audit` mit Admin-Secret.

## IP-Sperre
Nach 100 WebSocket-Verbindungen von derselben IP: 24 Stunden Sperre (nur Hash, keine Klar-IP). HTTP von gesperrten IPs wird ebenfalls abgewiesen.

Deaktivieren im Backend:
- Umgebungsvariable `IP_BLOCK=0` (oder `false` / `off`) — fest aus, unabhängig vom Branding
- Ohne Variable: Feld `ipBlock` in `data/branding.json` bzw. `POST /api/branding` mit `{ "ipBlock": false }`
- Status: Server-Log und `GET /api/health` (`ipBlock`)

Rate-Limits (Fragen, Upvotes, 1000 HTTP/min) bleiben auch bei deaktivierter IP-Sperre aktiv.

## SSL / Let’s Encrypt
Im Admin unter `#/admin/ssl` (auch `/admin/ssl` lädt die App) ein Zertifikat für die öffentliche Domain beantragen. Let’s Encrypt stellt kostenlose 90-Tage-Zertifikate aus; die App erneuert sie stündlich geprüft etwa 30 Tage vor Ablauf. Keine Wildcards, keine IPs, kein localhost.

Voraussetzungen:
- DNS A/AAAA zeigt auf diesen Host
- Port **80** ist aus dem Internet erreichbar (HTTP-01). Hinter Nginx den Pfad `/.well-known/acme-challenge/` unverändert an Node weiterleiten.
- Nutzungsbedingungen in der UI akzeptieren, Kontakt-E-Mail angeben

Technik:
- ACME-Client: npm-Paket `acme-client`
- Metadaten: SQLite-Tabelle `ssl_certificates` (keine Private Keys)
- Dateien: `SSL_DIR/<domain>/privkey.pem`, `cert.pem`, `chain.pem`, `fullchain.pem` (Standard `data/ssl`, produktiv z. B. `SSL_DIR=/ssl`)
- HTTPS über das Node-`https`-Modul, Zertifikat-Reload mit `setSecureContext` / SNI **ohne Prozessneustart**
- Port: `HTTPS_PORT` (lokal 3443, in Production standardmäßig 443)

Umgebung: `LETSENCRYPT_STAGING=1` für die Staging-CA, `SSL_REDIRECT=0` um HTTP nicht umzuleiten. Private Keys liegen nur auf der Platte (Modus 0600) und nicht in der REST-API (Ausnahme: Settings-Export Schema 2).

## White-Label / Branding
Unter `#/admin/branding`: App-Name (Default „Pulse“), Favicon, Schrift (woff2/woff/ttf, kein Google-Fonts-CDN), Folien-Hintergrund mit Kontrast-Overlay, Folien-Übergang, optionaler Bestätigungs-Sound (Standard **stumm**), eigene Domain als Hostname.

**Stadt-CI (Default):** Primär **#007CC1** (Stadtblau), Sekundär **#F99700** (Orange). Hintergrund `#FFFFFF`, Text `#1A171B`. Orange nicht als Text auf Weiß. Markenfarben greifen nur, wenn Text-AA (4,5:1) und UI-Kontrast (3:1) erfüllt sind. Details: `docs/contrast.md`.

Homepage-Link (`homepageUrl`, nur `http://` / `https://`) statt Social-Media-Feldern. Footer kann für vertrauliche Sessions ausgeblendet werden; Impressum/Datenschutz bleiben `#/privacy` und `#/impressum`.

Join-URLs nutzen `location.host` — hinter einem DNS-CNAME funktioniert der Code automatisch. SSL bleibt `#/admin/ssl` (kein magisches DNS).

**Nicht umbenennen:** interne Persistenzdatei und localStorage-Prefix bleiben unabhängig vom Anzeigenamen.

## Einstellungen Export / Import (Schema 2)
Auf der Branding-Seite unter **Einstellungen**. Datei `pulse-settings.json` (`GET /api/settings/export`, `POST /api/settings/import`).

**Schema 2:** Branding **inkl. Logo-Data-URL**, Privacy inkl. Versionshistorie, SSL-Metadaten **und PEM-Dateien** (`privkey` / `cert` / `chain` / `fullchain` je Domain, optional ACME-Konto). Schema 1 (ohne PEM) bleibt importierbar.

**Nicht enthalten:** Sessions, Umfrageantworten, Events, Audit-Logs, `ADMIN_SECRET`, `.env`. Die Datei enthält private Schlüssel — wie ein Secret behandeln. Import lädt HTTPS neu ohne Prozessneustart.

## Redis und mehrere Prozesse
- **Ohne `REDIS_URL`:** nur **ein** Node-Prozess (`npm start`). Live-Events bleiben im Prozess (EventEmitter).
- **Mit `REDIS_URL`:** Pub/Sub-Fanout für Stimmen, Deck, Q&A, Quiz (inkl. Antworten), Reaktionen, Notfall. Compose startet Redis plus **zwei** App-Container hinter nginx `ip_hash`.
- Persistenz bei zwei Prozessen: SQLite auf einem Volume ist nicht multi-writer-hart — Produktiv `DATABASE_URL` (Postgres).

Kein Fake-Cluster: ohne erreichbares Redis gibt es keinen Cross-Process-Fanout.

## Statische Dateien, CDN, Kompression
- Optional `ASSET_BASE` (ohne Slash am Ende): Prefix für `./css`, `./js`, `./assets` in `index.html`. Kein Pflicht-CDN, kein CloudFlare-Konto.
- `Cache-Control` für CSS/JS/SVG (1 Tag), Schriften/PNG (7 Tage), HTML `no-cache`.
- JSON- und Text-Antworten plus passende statische Dateien: gzip, Brotli wenn `Accept-Encoding: br`. Ohne Express, `node:zlib`.
