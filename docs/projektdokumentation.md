# Projektdokumentation — Pulse

**Ist-Zustand / Spezifikation**

**Stand:** Programmversion **v1.5.21** · Ist-Zustand aus dem Quellcode, 2026-09-04.
**Kein Soll-Konzept:** Nur Funktionen und Technik, die im Repository tatsächlich vorhanden sind.  
**Produktname:** Pulse. Technische Präfixe: `data/pulse.db`, `pulse:session:…`, Docker-Services `pulse` / `pulse-b`.

Die Texte in `lib/privacy.js` sind ein Muster für die öffentliche Verwaltung. Sie ersetzen keine Freigabe durch die/den Datenschutzbeauftragten der verantwortlichen Stelle. Das Verzeichnis von Verarbeitungstätigkeiten liegt separat unter `docs/verfahrensverzeichnis.md` (Entwurf, Art. 30 DSGVO).

---

## 1. Zweck, Produkt, Zielgruppe

### 1.1 Zweck

Pulse ist eine **Live-Interaktionsanwendung** für Sitzungen und Townhalls: Präsentierende legen eine Session an oder veröffentlichen ein **Event** mit festem Join-Code. Teilnehmende treten mit einem **sechsstelligen Join-Code** oder per QR-Code bei. Auf der Leinwand laufen Umfragen, Rankings, Wortwolken, Live-Q&A, Quiz, Bewertungsskalen und weitere Folientypen in Echtzeit.

### 1.2 Produktname

- **Öffentlich / UI:** Pulse (`frontend/index.html`, i18n-Schlüssel `app.name`, Export-Bundle `app.name`).
- **Paketname (npm):** `pulse` in `package.json`.
- **Intern:** Persistenzdatei standardmäßig `pulse.db`; Redis-Kanalpräfix `pulse:room:`; localStorage-/sessionStorage-Präfixe `pulse:` und `tt:`.

### 1.3 Zielgruppe

Aus Branding- und Privacy-Defaults (`lib/branding.js`, `lib/privacy.js`): **öffentliche Verwaltung**, konkret voreingestellt auf die **Landeshauptstadt Saarbrücken** (Verantwortliche, Impressum-Kontakte, Homepage-Link, Footer-Text). Die Instanz ist per Admin-UI umkonfigurierbar; die Defaults sind Stadt-CI-/Rechts-Platzhalter, keine fest verdrahtete Mandantenlogik.

**Teilnehmende** brauchen **kein Konto** (anonymer Join). Optional aktiviert die Instanz eine **Benutzerverwaltung** (`USER_AUTH_ENABLED=1`): Rollen **admin**, **editor**, **viewer**; Anmeldung per **E-Mail-PIN**; Kennwort nur für Kontoänderungen. Ohne Benutzerverwaltung gelten weiterhin Session-Rollen (Presenter-Schlüssel, anonymer Join).

---

## 2. Systemübersicht (Architektur)

| Schicht | Ist-Umsetzung |
|---|---|
| Frontend | **Vanilla JS** (ES-Module), Hash-Routing, kein React/Vue/Angular. Einstieg `frontend/index.html` → `frontend/js/app.js`. |
| HTTP | Node.js **`http`/`https`**, ein Handler in `server.js`. Kein Express/Koa/Fastify. |
| Echtzeit | Eigenes WebSocket (RFC 6455 Handshake in `server.js`, Client `frontend/js/websocket.js`). Kein Socket.io. |
| Persistenz | Standard **SQLite** über **`node:sqlite`** (`DatabaseSync`). Pfad: `SQLITE_PATH` oder `data/pulse.db`. Fallback: JSON-Datei, falls `node:sqlite` fehlt. |
| Optional Postgres | `DATABASE_URL` mit `postgres://…` und optionalem npm-Paket `pg` (`lib/postgres.js`). |
| Optional Redis | `REDIS_URL`: natives RESP über `net.Socket` in `lib/bus.js` (kein Redis-npm-Paket). Ohne URL: In-Prozess-EventEmitter, **nur ein Prozess**. Mit URL: Fanout aller Live-Events zwischen Prozessen. |
| Kompression | `lib/compress.js`: gzip und Brotli (`node:zlib`), ohne Express. |
| ACME | npm-Paket `acme-client` (Let’s Encrypt HTTP-01). |
| Node | `engines.node`: **>= 22**. Docker-Image: `node:22-alpine`. |

Ablauf: Browser lädt statische Dateien aus `frontend/`. REST unter `/api/…` für Session-Anlage, Events, Admin, Export, Health. Live-Ereignisse über `ws://…/ws` bzw. `wss://`. Broadcasts werden in `server.js` gebündelt (`BATCH_INTERVAL_MS`, Standard 100 ms).

---

## 3. Funktionen (IST)

### 3.1 Sessions und Join-Code

- **Anlegen:** `POST /api/sessions` (ad-hoc-Session) oder `POST /api/events` (Event mit festem Code und Metadaten, siehe 3.24). Server erzeugt einen **sechstelligen numerischen Code** (`randomCode` in `server.js`, Bereich 100000–999999) und einen einmaligen **Admin-Schlüssel** (`lib/auth.js`, `generateAdminKey`).
- **Beitreten:** Hash `#/join/<code>` oder Formular auf der Startseite. Öffentliche **Event-Karten** (`#home-events`) mit QR, Join-Link und Copy-Text (`frontend/js/events.js`). WebSocket-Nachricht `join`. Optional `teamName` (Quiz-Teams, max. 40 Zeichen) beim Join.
- **Präsentieren:** `#/present/<code>`. Admin-Schlüssel wird im Browser unter `pulse:admin:<code>` gehalten.
- **Letzte Sessions:** localStorage `pulse:recent` auf der Startseite. Events stehen zusätzlich als Katalog auf der Startseite (nicht archivierte Einträge).
- **Link kopieren:** Join-URL `…#/join/<code>` inkl. eingebautem QR (Byte-Modus in `frontend/js/app.js`, kein externes QR-Paket). Im Proben-Modus ist Kopieren deaktiviert.
- **Löschung:** stündlicher Sweep (`sweepExpiredSessions`) nach `retentionDays` aus dem Branding (7 / 30 / 90 / 0 = keine Auto-Löschung). Voreinstellung 30 Tage.

### 3.2 Folien / Deck

Typen (Quelle `lib/slideTypes.js` `SLIDE_TYPES`, Normalisierung `normalizeSlide` in `server.js`):

| `slide.type` | Bedeutung |
|---|---|
| `choice` | Multiple Choice, 2–6 Optionen |
| `wordcloud` | Wortwolke |
| `qa` | Live-Q&A |
| `quiz` | Quiz mit Timer und Rangliste |
| `rating_scale` | Bewertungsskala (Alias `rating`; Stufen 5, 7 oder 10) |
| `ranking` | Reihenfolge / Borda |
| `points100` | 100 Punkte auf Optionen verteilen |
| `open_text` | Freitext (max. 280 Zeichen) |
| `image_choice` | Bildwahl (Data-URL PNG/JPEG/WebP) |
| `datetime` | Terminfindung (ISO-Slots, Mehrfachwahl möglich) |
| `picker` | Große Auswahlliste, **10–50 Optionen**; optional Kategorien, Suche, Single/Multi-Select, Layout List/Grid/Dropdown |

- **Dynamisches Session-Formular** (`#/admin`, `frontend/js/slideForm.js`, `frontend/js/app.js`): vier Abschnitte — **Grundlagen** (Typ, Frage max. 500, Unterzeile), **Optionen** (nur bei auswahl-basierten Typen; Picker 10–50 inkl. Massen-Import), **Typ-Einstellungen** (je Folientyp, z. B. Reveal, Quiz-Timer, Picker-Kategorien), **Erweiterte Einstellungen** (einklappbar: Notizen max. 4000, geplante Minuten 1–180, Reveal-Standard). Ein-/Ausblenden mit CSS-Transition (~300 ms). Folientyp-Wechsel mit Bestätigung, wenn Optionen verworfen würden.
- **Deck-Editor** an drei Stellen:
  1. **Startseite** (`#/admin` bzw. Home-Formular): Folienliste vor dem Session-Start, Demo/Probe.
  2. **Während der Präsentation:** Live hinzufügen, duplizieren, löschen (Presenter).
  3. **Event-Sessions:** `#/admin/sessions/:code` — vollständiges Deck-Management inkl. **Inhaltsbearbeitung**, Folien kopieren (`frontend/js/events.js`).
- Mindestens eine Folie, **höchstens 40** (`lib/deck.js` `MAX_SLIDES`). Kopieren zwischen Sessions: `copySlidesFrom` in `lib/deck.js`, API `POST …/copy-from`.
- REST: `POST /api/sessions/:code/slides` mit `{ action: "add"|"remove"|"move"|"duplicate"|"patch"|"update", … }`. **`patch`** schreibt nur Presenter-Felder (`notes`, `plannedMinutes`). **`update`** ändert Frage/Optionen/Typ-Einstellungen, behält Folien-`id` und Typ sowie Live-Stimmen soweit möglich (`preserveLiveState` in `lib/deck.js`).
- REST-Alias: `PATCH /api/sessions/:code/slides/:slideId` (Inhalt), `DELETE …/slides/:slideId` (löschen).
- Live: WebSocket-Typ `deck` nach Deck-Mutationen; zusätzlich `slide_updated` nach Inhalts-`update` (Presenter sowie Teilnehmende der aktiven Folie). Folienwechsel: `slide` bzw. `POST …/slide`.

**Inhalts-Editor (`#/admin/sessions/:code`, `frontend/js/events.js`):**

| Funktion | Verhalten |
|---|---|
| Stift / Doppelklick | Einfache Typen (`choice`, `rating_scale`, `wordcloud`, `open_text`, `qa`): **Inline** in der Zeile. Komplexe Typen (Quiz, Ranking, 100 Punkte, Bildwahl, Termin, **Picker**): **Modal**. Alt+Stift = immer Modal. |
| Modal-Felder | Frage (Pflicht, max. 500), Optionen 2–6 (Picker **10–50**), typabhängig Skala/Timer/Korrekturen/Bilder/Slots/Picker-Kategorien/Suche/Layout, Reveal, geplante Minuten, Presenter-Notizen, **Live-Vorschau** (Picker) |
| Speichern | `PATCH` bzw. `action: "update"`; Validierung Frontend + Backend; Toast |
| Auto-Save | Nach **30 s** Pause ohne Eingabe (Modal und Inline); Statuszeile „Speichern…“ / „Automatisch gespeichert“ |
| Unsaved | Warnung beim Schließen; `beforeunload` bei Tab-Wechsel |
| Löschen | Bestätigung; Toast mit **Rückgängig** (5 s, Inhalt wiederherstellen, Live-Stimmen entfallen) |
| Mehrfachauswahl | Checkboxen, Shift-Bereich; Bulk: Eigenschaften (Reveal/Minuten/Notizen), duplizieren, löschen |
| Shortcuts | ↑/↓ Fokus, Ctrl/Cmd+E bearbeiten, Ctrl/Cmd+D duplizieren, Entf löschen, Ctrl/Cmd+S speichern (im Editor) |

- Demo-Typ `demo`: vorgefertigte Folienfolge; **überspringt den Warteraum**. Vorlagen **Einführungs-Quiz**, **Wissens-Check**, **Eisbrecher** (`frontend/js/templates.js`; Hash `#/intro-quiz` / `#/knowledge-quiz`; Eisbrecher per Button auf der Startseite, ohne eigenen Hash).

### 3.3 Poll (Multiple Choice)

- Teilnehmer stimmen per WebSocket `vote`. **Eine Stimme pro Client-ID und Folie** (`session.votes`).
- Ergebnisse für hideable Typen bleiben verborgen, bis der Präsentator **Ergebnisse zeigen** auslöst (Taste **R**, Button, REST `POST …/results`, WS `results`).
- Ohne Reveal geht nur die Stimmenzahl raus, nicht die Balken (`lib/liveState.js`).
- UI: `frontend/js/poll.js`. Notfall und Lobby blockieren Stimmen.

### 3.4 Ranking, 100 Punkte, Freitext, Bildwahl, Termin

Logik in `lib/slideVotes.js`, Join-UI `frontend/js/slideInputs.js`, Auswertung `frontend/js/slideResults.js`. Eine Stimme pro Client und Folie (wie Poll). Hideable analog Choice (`HIDEABLE_TYPES`).

- **Ranking:** Reihenfolge aller Optionen (jede ID genau einmal). Aggregation: Durchschnittsrang (1-basiert) und **Borda** (erster Platz = *n* Punkte, letzter = 1). Payload `order`.
- **points100:** Ganzzahlige Punkte ≥ 0 je Option, **Summe genau 100**. Aggregation Summe und Mittel. Ungültige Summe → Fehler `sum`.
- **open_text:** Text max. **280** Zeichen, Groß/Klein zusammengeführt, Zähler. Rate-Limit wie Q&A-Fragen; Wortfilter wie Q&A, wenn Branding `wordFilter` nicht aus. Eine Einreichung pro Client.
- **image_choice:** Eine Option wie Choice. Bilder: Data-URL `png`/`jpeg`/`webp`, max. **96 KiB** Zeichen pro Bild, **256 KiB** Summe aller Bilder einer Folie (`lib/slideTypes.js`).
- **datetime:** Slots mit ISO-Zeit; eine Stimme kann **mehrere** `slotIds` setzen (je Slot +1). Labels aus `toLocaleString("de-DE")`, wenn kein eigenes Label.

### 3.4a Picker (große Auswahllisten)

Logik in `lib/slideTypes.js` (`normalizePickerOptions`, `validatePickerSlide`), Stimmen in `lib/slideVotes.js` `applyPicker`, Join-UI `frontend/js/picker.js`, Admin-Editor `frontend/js/pickerEditor.js`.

- **Optionen:** 10–50 pro Folie; Text max. **100** Zeichen je Option. Validierung REST/Deck: Fehler bei &lt;10 oder &gt;50 Optionen.
- **Single-Select:** Payload `optionId` (wie Choice). **Multi-Select:** Payload `optionIds` (Array); optional `maxSelections` ≤ Anzahl Optionen.
- **Kategorien:** optional, max. 20; Felder `id`, `name`, `color`, `sortOrder`. Option verweist per `category` auf Kategorie-ID; ungültige Zuordnung → HTTP 400.
- **Suche:** `enableSearch` (Default bei &gt;20 Optionen); Debounce 200 ms; Filter auf Optionstext und Kategoriename.
- **Layout:** `list` | `grid` | `dropdown`. Dropdown nur Single-Select; Multi fällt auf Liste zurück. Auto-Layout wenn nicht gesetzt: &lt;15 Grid, sonst Liste; Mobile immer Liste.
- **Virtual Scrolling:** ab 30 Optionen in Listen-Ansicht (nur sichtbare Zeilen rendern).
- **Ergebnisse:** Balkendiagramm; Prozent auf Basis `voteCount` (Teilnehmer); bei &gt;30 Optionen Top 10 + einklappbarer Rest; mit Kategorien gruppierte Auswertung (`renderPickerResults`).
- **Reveal:** hideable wie Choice (`picker` in `HIDEABLE_TYPES`).
- **Barrierefreiheit:** Tastatur (Pfeiltasten, Enter, Escape im Dropdown), `aria-selected`, Fokus-Ringe.

### 3.5 Wortwolke

- WS `word`, Text max. **32** Zeichen, Groß/Klein zusammengeführt, Zähler erhöht.
- **Kein** Ein-Wort-pro-Teilnehmer-Limit im Server (anders als Poll / Freitext).
- **Stoppwörter:** Intake über `lib/slideVotes.js` `prepareWord` + `lib/stopwords.js` (DE/EN/FR). Abgelehnt mit Fehler `stopword`. Zusätzlich filtert das Canvas-Packing in `frontend/js/wordcloud-layout.js` eine kürzere DE-Liste beim Zeichnen.
- Optional **Schimpfwortfilter** wie Q&A (`prepareWord` + Branding `wordFilter` / `extraWords`).
- Canvas + virtuelle Rangliste (`frontend/js/wordcloud.js`, max. 80 Wörter auf dem Canvas). Layout/Zählung im Worker `wordcloud-worker.js` erst wenn die Folie aktiv ist (`initWordCloud`); Fallback ohne Worker auf dem Main-Thread.
- **Klick** auf ein Wort: Overlay mit Anzahl („*n* Personen haben … geschrieben“).
- **PNG:** Presenter-Canvas mit `exportable: true` → Button „PNG exportieren“, Download `wortwolke.png` (`canvas.toDataURL`).
- Reveal analog Poll (`resultsVisible`).

### 3.6 Q&A

- Einreichen: WS `submit_question` / REST `POST /api/questions`. Text max. **500** Zeichen.
- **Kategorien:** `tech`, `org`, `content`, `other` (`QA_CATEGORIES` in `lib/slideTypes.js`). Unbekannte Werte → `other`. Filter in Moderations- und Join-UI.
- **Privat:** `private: true` — andere Teilnehmende sehen die Frage nicht; Autor und Präsentator (Reveal) schon (`publicQaSlide` / `visibleQuestions`).
- **Gruppieren:** Moderationsaktion `group` — `keepId` bleibt sichtbar, gemergte IDs `mergedInto` + Status `hidden`, Upvotes der Gruppe laufen auf der sichtbaren Frage zusammen. Gruppierte Fragen können nicht erneut upgevotet werden.
- **Presenter-Antwort:** Aktion `answer_text`, Text max. **800** Zeichen; pending wird bei gesetzter Antwort auf `approved` gesetzt. Sichtbar unter der Frage.
- Upvotes: WS `upvote_question` / `POST /api/questions/:id/upvote`. Ein Upvote pro Client und Frage.
- Status: `pending` → `approved` / `hidden` / `answered` (`lib/interactive.js`).
- Moderation: Panel `frontend/js/moderation.js` (Freigeben, Verstecken, Beantwortet, Bulk, Filter nach Kategorie / privat / flagged).
- Wortfilter (`lib/wordFilter.js` + `config/badwords.json` + optionale Admin-Wörter), Rate-Limit, Spam-Heuristik (`lib/spamDetector.js`: Caps, Emojis, URLs, Duplikate → Flag `flagged`, nicht hart löschen).
- Export: CSV (`GET /api/sessions/:code/export?kind=qa`) und Druck-PDF-Dialog (`frontend/js/export.js`). Autoren als `User_xxxx`.
- UI: `frontend/js/qa.js` (virtuelle Liste, Top-3, Kategorie-Select, Privat-Checkbox).

### 3.7 Quiz

- Timer 5–60 s, eine Antwort pro Client während `round.status === "running"`.
- **Mehrere Richtige:** `correctIndexes` (Fallback historisches `correctIndex`). Punkte nur bei **exakt** derselben Menge (`answersMatch`). Unvollständig oder zu viele Indizes = falsch.
- Punkte: 500 + 500 × (Restzeit/Dauer) bei richtiger Antwort; mit Power-Up **double** verdoppelt. Rangliste der Folie Top 10 (`lib/interactive.js` `buildLeaderboard`).
- **Teams:** `teamName` beim Join oder mit der Antwort; Anzeigename und Score-Schlüssel können der Teamname sein (`session.teams`).
- **Power-Ups** (je **einmal pro Session und Client**, serverseitig `session.powerups`):
  - `fifty`: blendet **genau eine** falsche Option aus, nur an diesen Client (`quiz_powerup`).
  - `double`: verdoppelt die **nächste** korrekte Antwort.
- **Gesamtrangliste:** `session.quizTotals` über alle Quiz-Folien der Session, Top 10 (`buildOverallLeaderboard`). Im Presenter-GET als `quizOverall`; nach Rundenende in `quiz_results` / `leaderboard_update`.
- WS: `quiz_start`, `quiz_answer`, `quiz_end`, `quiz_powerup`; REST unter `/api/quiz/…`.
- UI: `frontend/js/quiz.js`, `frontend/js/leaderboard.js`. Leertaste startet/beendet nicht den Folienwechsel auf Quiz-Folien.
- Vorlagen: Einführungs-Quiz, Wissens-Check, Eisbrecher (letzteres u. a. mit Ranking-Folie und einer Multi-Correct-Frage).

### 3.8 Bewertungsskala (Rating)

- Typ `rating_scale`, intern wie Poll (Counts). Icons/Labels in der Folie. UI `initRatingScale` in `frontend/js/poll.js`.
- Reveal wie Poll.

### 3.9 Lobby (Warteraum)

- Neue Sessions starten mit `lobby: true`, außer `skipLobby` oder Typ `demo`.
- Overlay mit großem QR und Teilnehmerzahl; **Los geht’s** setzt Lobby aus (`WS lobby` / `POST …/lobby`).
- Bei Events mit Start-Countdown: **Los geht’s** beendet den Event-Countdown serverseitig (`dismissCountdown` in `lib/events.js`, WS `event_meta`); bei &gt; 5 Min. Restzeit Bestätigungsdialog im Presenter.
- In der Lobby keine Stimmen, Wörter, Q&A-Einreichungen.

### 3.10 Ergebnis-Reveal

- Gilt für `choice`, `rating_scale`, `wordcloud`, `ranking`, `points100`, `open_text`, `image_choice`, `datetime`, **`picker`** (`canHideResults` / `HIDEABLE_TYPES`).
- Q&A und Quiz werden nicht hinter dem Reveal-Schalter versteckt.
- Teilnehmer sehen vor dem Reveal, dass die Stimme ankam (`voteCount`), nicht die Verteilung.

### 3.11 Presenter: Statistik, Notizen, Probe

UI `frontend/js/presenterStats.js`, Felder `lib/liveState.js` (`presenterMeta`, `presenterOnlyFields`).

- **Live-Statistik:** Teilnehmerzahl, Stimmenanteil (Stimmen/Teilnehmer, bei 0 Teilnehmern kein Prozent), bei Q&A Anzahl `pending`, Folien-Timer vs. **geplante Minuten**.
- **plannedMinutes:** 1–180, optional. Speicherung per Deck-`patch`. **Nicht** in der öffentlichen Join-Payload (nur bei `reveal`, analog Quiz-Lösungen). Tests: `scripts/test-presenter.js`.
- **notes:** Presenter-Stichworte, max. **4000** Zeichen (`NOTES_MAX`). Ebenfalls nicht public. Das Create-Formular in `index.html` begrenzt das Textfeld zusätzlich auf 2000 Zeichen.
- **Probe (`rehearsal`):** Checkbox / Button auf der Startseite, Flag an der Session. Banner „Proben-Modus — keine Live-Teilnehmer“. Join-Link-Kopieren deaktiviert. Join-View zeigt Hinweis. Client startet den Demo-Simulator wie im Mock. Join per bekanntem Code bleibt technisch möglich; es wird kein Live-Publikum erwartet.
- Lobby und Reveal wie oben.

### 3.12 Präsentationsansicht (Stage)

Reine Leseansicht für Screen-Sharing (Webex/Zoom/Teams): Hash `#/stage/<code>` und Alias `#/present-view/<code>`. Presenter-Button „Präsentationsansicht öffnen“ (`window.open`, rechts neben dem Presenter, 1280×720).

- Frontend: `frontend/js/stage.js`, `frontend/css/stage.css`, View `#view-stage`. `body.stage-mode` blendet App-Header/Footer aus.
- WS-Rolle `stage`: Ergebnisse ja (`revealResults`), **keine Notizen**, **nicht** in `participants`. Nur JOIN/Ping.
- Hidden Polls: Teaser ohne Balken bis `resultsVisible`. Wortwolke ohne Rangliste, Quiz-Rangliste Top 5, Q&A Top 10 nach Upvotes.
- Einziger Control: „Vollbild aktivieren“. Kein LocalStorage.

### 3.13 Q&A-Countdown

Optional 10–300 s (10er-Schritte, Default 60) in `lib/qaTimer.js`. Server speichert `endsAt`; Clients ticken lokal. Nach Ende keine neuen Fragen (`qa_closed`), Upvotes bleiben. Presenter: Start/Pause/Fortsetzen/Verlängern/Beenden. REST `POST /api/qa/timer`, WS `qa_timer`. Tests: `scripts/test-qa-timer.js`.

Admin-Branding: `stageShowLogo` / `stageShowFooter` (Default aus), `qaDefaultLimitSec` (Default 60, 0 = kein vorgewähltes Limit).

### 3.13a Interaktionssteuerung (Folien)

Serverseitige State-Machine in `lib/interactionState.js` für alle interaktiven Folientypen (Poll, Wortwolke, Q&A, Quiz, Rating, Ranking, 100 Punkte, Freitext, Bildwahl, Termin, Picker).

| Zustand | Bedeutung |
|---|---|
| `active` | Folie sichtbar; bei `manualStart` noch keine Teilnehmer-Eingaben |
| `running` | Eingaben erlaubt; optional Timer läuft (`endsAt`) |
| `paused` | Timer pausiert (`pausedRemainingMs`) |
| `ended` | Keine neuen Eingaben; Ergebnisse/Reveal unverändert |

**Editor** (`#/admin/sessions/:code`, Feldgruppe „Ablauf und Zeitlimit“ in `frontend/js/events.js`): `manualStart` (Default an), `timerEnabled`, `timerSec` (30–300 s, Presets). Legacy-Folien ohne `interaction`-Feld → sofort `running` (Abwärtskompatibilität).

**Presenter** (`frontend/js/interactionPresenter.js`, `frontend/css/present-interaction.css`): Aktionen Folie anzeigen / Interaktion starten / Pause / Fortsetzen / Verlängern (+30 s) / Beenden; getrennt vom Reveal-Schalter. Layout: Folienfläche ~2/3, Steuerleiste priorisiert.

**Protokoll:** WS `interaction` (Presenter-Auth); Server-Guards in `applyVote`, `applyWord`, Q&A-Einreichung. Fanout an Presenter, Join und Stage. Tests: `scripts/test-interaction-state.js`.

**Join:** Blockiert Eingaben solange `manualStart` und Zustand `active`. Ranking/100-Punkte: clientseitige Hinweise + serverseitige Validierung; kein Auto-Submit bei Timer-Ende.

**A11y:** akustische/visuelle Timer-Hinweise bei 60, 30, 10 und 0 s (`tickJoinTimerA11y`, `applyJoinTimerUrgency`).

**Event-Countdown:** bei gesetztem `startTime` Countdown auf Stage und Presenter (`frontend/js/eventCountdown.js`); **Los geht’s** via `applyEventCountdownStart` / `dismissCountdown`, Audit-Eintrag, Sync über `event_meta` (nicht nur clientseitig).

### 3.14 Join: Mobil, Offline

`frontend/js/joinMobile.js`, Styles `frontend/css/join-mobile.css`.

- **Daumenzone:** `#join-thumb` — Aktionen im unteren Bereich; auf Viewports ≤ 640 px min. **32 dvh**, Safe-Area.
- **Swipe:** horizontal zwischen lokalen Antwort-Karten (Choice-Buttons, Q&A-Karten, Quiz-Buttons, Rating-Buttons). Wechselt **nicht** die Presenter-Folie. Mindestweg 48 px.
- **Haptik:** `navigator.vibrate(15)` nach erfolgreichem Senden (Stimme, Wort, Q&A, Quiz-Antwort), nur mit User-Geste.
- **Offline-Banner:** Presenter und Join (`#present-offline-banner`, `#join-offline-banner`), sichtbar bei WS `closed` / `reconnecting`, nicht im Mock (`syncOfflineBanner`).

### 3.15 Reaktionen

- Emojis **👏 ❤️ 👍 ❓** (`lib/liveState.js` `REACTIONS`). Andere werden verworfen.
- WS `reaction`, Rate-Limit 8 / 10 s. **Keine Persistenz** — nur Animation auf der Leinwand (`frontend/js/reactions.js`).

### 3.16 Moderation

- Wortfilter ein/aus und Extra-Wörter im Branding.
- Q&A-Warteschlange inkl. als verdächtig markierter, privater und kategorisierter Beiträge.
- Rate-Limits: Fragen-Intervall aus Branding (`questionIntervalSec`, 10–120, Default 30); 3 Upvotes/Minute; 1000 HTTP/Minute/IP; 100 gleichzeitige WebSockets/IP.

### 3.17 Notfall

- Präsentator: Button **Notfall** (`frontend/js/emergency.js`).
- Server (`lib/intake.js`): `paused = true`, alle Q&A-Status auf `hidden` (Backup in `emergencyBackup`), Abstimmungen/Wörter/Fragen werden abgewiesen.
- **Session fortsetzen** stellt Q&A-Status wieder her. Audit-Event `emergency`.

### 3.18 Branding

- Admin `#/admin/branding`. Speicherung `data/branding.json` (`lib/branding.js`).
- **Stadt-CI (Default, Stand 2026-09-02 von saarbruecken.de, Theme `saarbruecken_2019`):** Primär **#007CC1** (Stadtblau, Links/Buttons), Sekundär **#F99700** (Orange, Nav „Leben“). Hintergrund `#FFFFFF`, Text `#1A171B`. Klassisches Navy/Gelb kommt auf der aktuellen Stadtseite nicht vor. Prüfung und erlaubte/verbotene Paare: `docs/contrast.md`. Orange nicht als Text auf Weiß. Markenfarben werden nur übernommen, wenn Text-AA (4,5:1) und UI-Kontrast (3:1) erfüllt sind (`frontend/js/theme.js` `applyBrandingContrast`).
- White-Label: `appName` (Default „Pulse“), `favicon` (svg/png, max. 64 KiB Data-URL), `customDomain` (nur Hostname, CNAME-Hinweis + Link nach `#/admin/ssl`, kein magisches DNS), `footerHidden` (Footer aus; Impressum/Datenschutz bleiben per Hash). Intern bleiben `pulse.db` und `pulse:`/`tt:`-Storage.
- Erweitertes Branding: `customFont` (woff2/woff/ttf, max. 500 KiB, `@font-face`, kein Google-Fonts-CDN), `slideBackground` (Data-URL + WCAG-Scrim), `slideTransition` (none/fade/slide, Default `slide`), `sound` (mp3/ogg/wav, max. 200 KiB).
- **Sound standardmäßig stumm:** Client-Key `pulse:sound-muted`, Default an (`SOUND_MUTE_DEFAULT` in `app.js`). Mute-Schalter in Presenter- und Join-Ansicht. Wiedergabe nur nach User-Geste.
- Weitere Felder: Logo (Data-URL PNG/JPEG/SVG/WebP, 256 KiB), Footer-Text, Sprachen, Retention, Wortfilter, Fragen-Intervall, IP-Sperre, Links zu Datenschutz/Impressum, Zusatztext Datenschutz.
- **Präsentationsansicht / Q&A:** `stageShowLogo`, `stageShowFooter` (Default `false`), `qaDefaultLimitSec` (Default 60, `0` = kein vorgewähltes Limit).
- **Homepage-Link statt Social:** `homepageUrl` (nur `http://` / `https://`, Default `https://www.saarbruecken.de`). Feld `social[]` wird beim Laden/Speichern/Import **verworfen**. Footer zeigt den Stadt-Link, keine Mastodon-/LinkedIn-Felder.

### 3.19 Internationalisierung

- Sprachen **DE, EN, FR** (`frontend/js/i18n.js`, Dateien `frontend/i18n/{de,en,fr}.json`).
- Start: `navigator.language`, danach `sessionStorage` Schlüssel `tt:lang` (**kein Cookie**).
- Branding `languages` kann die erlaubte Menge einschränken. Hilfeartikel haben `titleEn`/`titleFr`; Fließtext der Hilfe ist überwiegend Deutsch.

### 3.20 Datenschutz / Impressum

- Öffentliche Views `#/privacy`, `#/impressum` (auch Pfade `/privacy`, `/impressum` laden `index.html`).
- Admin `#/admin/privacy`. API `GET/POST /api/privacy`, Versionen `GET /api/privacy/versions`.
- Speicherung `data/privacy.json` und `data/privacy-versions.json` (letzte 20 Stände).
- **Saarbrücken-Defaults** in `lib/privacy.js`: Landeshauptstadt, Rathaus St. Johann, DSB Thorsten Carbon, UDIS, USt-IdNr., BITV-2.0-Hinweis.
- UI `frontend/js/privacyPage.js`.
- Consent-Dialog (`tt:consent` in localStorage, 90 Tage): Hinweis auf anonyme Teilnahme, **keine Cookies**, lokale Speicherung nur für Session-ID u. Ä.
- Internes Verzeichnis Art. 30: `docs/verfahrensverzeichnis.md` (Entwurf für den DSB, nicht die öffentliche Privacy-Seite).

### 3.21 SSL / Let’s Encrypt

- Admin `#/admin/ssl`. REST: `GET /api/ssl`, `POST /api/ssl` bzw. `/issue`, `POST /api/ssl/renew`, `DELETE /api/ssl/:domain`.
- HTTP-01, Paket `acme-client`. **Keine Wildcards, keine IPs, kein localhost** (`lib/sslUtil.js`).
- PEMs unter `SSL_DIR/<domain>/` (`privkey.pem`, `cert.pem`, `chain.pem`, `fullchain.pem`), Kontoschlüssel `SSL_DIR/account.pem` (Dateimodus 0600).
- Metadaten in SQLite-Tabelle `ssl_certificates` (**ohne Private Keys** in der Tabelle). Die REST-SSL-API serialisiert **keine** Keys.
- HTTPS im selben Prozess (`https`-Modul, SNI, Reload mit `setSecureContext` ohne Prozessneustart).
- Auto-Renew: stündlicher Check, Fenster ca. **30 Tage** vor Ablauf (Zertifikate 90 Tage).
- HTTP-Redirect auf HTTPS, sobald ein aktives Zertifikat liegt (`SSL_REDIRECT`, Default an). ACME-Challenge wird **nicht** umgeleitet.

### 3.21a Automatische Updates (GitHub Releases)

- Admin `#/admin/updates`. REST: `GET /api/updates/check|info|status|config`, `PATCH /api/updates/config`, `POST /api/updates/install|rollback`.
- Quelle: GitHub Releases API (`lib/updateService.js`), SemVer-Vergleich mit `package.json`.
- Konfiguration: `UPDATE_REPO` (Pflicht), `UPDATE_ENABLED`, `UPDATE_CHECK_INTERVAL`, `UPDATE_ALLOW_PRERELEASE`, `UPDATE_AUTO_INSTALL`, optional `GITHUB_TOKEN`, `UPDATE_BACKUP_DIR`, `UPDATE_MAX_BACKUPS`.
- State/Persistenz: `data/updates-state.json` (Cache 1 h, Historie, Fortschritt).
- Installation: Backup (`backups/update-{timestamp}/`), Git-Checkout oder Tarball-Download, `npm install`, Migrations-Hook, Graceful Shutdown, Prozessneustart (systemd/Docker).
- WebSocket: `update_started`, `update_progress`, `update_completed`, `update_failed`, `update_rollback`, `server_shutdown`.
- Nur Rolle `admin` darf installieren; Audit-Log-Einträge `update_*`.
- **VPS-Shell:** `scripts/update-vps-ubuntu.sh` (Updater v1.1) — versionierte Docker-Images `pulse-app:<version>`, automatischer Rollback bei Build-/Readiness-Fehler; siehe `docs/installation.md` Abschnitt 6.

### 3.21c Content-Hash-Assets (Frontend-Cache)

- Build: `npm run build` → `frontend/asset-manifest.json` (SHA-256-Kurzhash pro Asset unter `/js`, `/css`, `/i18n`, `/help`, `/assets`).
- Laufzeit: `lib/assetManifest.js` lädt Manifest beim Start (Production: **fail-fast** bei fehlendem/kaputtem Manifest).
- Auslieferung: `index.html` und JS-`import`-Pfade erhalten `?h=<hash>`; dynamische Fetches über `frontend/js/assetUrl.js` und `window.__PULSE_ASSET_H__`.
- Readiness: Check `asset_manifest` in `/api/health/ready` (nur Production).
- Cache: gehashte URLs `Cache-Control: immutable`; Auth-/Admin-API `no-store`.
- Tests: `npm run test:asset-manifest`; ADR: `docs/stabilization/adr-asset-content-hash.md`.

### 3.21b Instanz-Backups (ZIP)

- Admin `#/admin/backups`. REST: `GET /api/backups/list|config|groups|create|inspect/:filename|download/:filename`, `PATCH /api/backups/config`, `POST /api/backups/upload|restore|inspect`, `DELETE /api/backups/:filename`.
- Service: `lib/backupService.js`, Gruppenkatalog `lib/backupGroups.js` (strukturiert wie Admin-Navigation: Sessions, Events, Teams, Benutzer, Branding, Datenschutz, SSL, E-Mail, Einstellungen, Uploads, `.env`).
- ZIP-Inhalt: `pulse.db`, JSON-Dateien unter `data/`, Verzeichnisse `ssl/`, `uploads/`, optional `.env`, `backup-metadata.json`, `package.json`.
- **Gruppenweise Wiederherstellung:** `POST /api/backups/restore` mit `{ filename, groups: ["branding", …] }` — nicht gewählte Bereiche bleiben unverändert; vollständig ohne `groups` oder mit `["all"]`.
- Auto-Backup: `lib/autoBackup.js`, Konfiguration `data/backup-config.json`, Env `BACKUP_*`.
- Installation: nach **Erstlogin** (Bootstrap-Kennwort) optional unter `#/admin/onboarding` — ZIP hochladen, gruppenweise einspielen; Setting `onboardingBackupPending` in `auth_settings`. CLI: `scripts/install-restore-backup.js`.
- **Versionsprüfung:** `analyzeBackupVersion()` vergleicht `backup-metadata.json` mit `package.json`; bei Abweichung `lib/dataMigration.js` (Events-Legacy, SQL-Hinweise).
- UI: `frontend/js/backupsPage.js` — Erstellen, Download, Upload, Wiederherstellen mit Gruppen-Dialog.

### 3.22 Einstellungen Export / Import

- UI auf der Branding-Seite (`frontend/js/settings.js`, Panel `#settings-panel`). Privacy- und SSL-Seiten verlinken dorthin.
- `GET /api/settings/export` → Datei `pulse-settings.json`.
- `POST /api/settings/import` (JSON oder multipart).
- **Schema 2** (`lib/settings.js` `SCHEMA_VERSION = 2`): Branding **inkl. Logo-Data-URL**, Privacy inkl. Versionshistorie, SSL-Metadaten **und PEM-Dateien** (`privkey`/`cert`/`chain`/`fullchain` je Domain, optional ACME-`accountPem`). Schema 1 (ohne PEM) bleibt importierbar.
- **Nicht enthalten:** Sessions, Umfrageantworten, Events (`data/events.json`), Audit-Logs, `ADMIN_SECRET`, `.env`.
- Die Backup-Datei enthält private Schlüssel — nur über die Admin-API, wie ein Secret behandeln. Import lädt HTTPS neu ohne Prozessneustart.

### 3.23 Hilfe / Tour

- Hash `#/help`, `#/help/<slug>`, `#/admin/help`. Katalog `frontend/help/articles.json`, HTML-Artikel unter `frontend/help/`.
- **Markdown-Auszug für Druck/Schulung:** `docs/hilfe.md` (**26 Artikel**, Stand Katalog **Version 11**, Programm **v1.5.21**).
- Suche (UND-Tokens, Kategorie) in `frontend/js/help.js` / `lib/helpIndex.js`.
- Erstnutzer-Tour (nach Consent), Tooltips (`frontend/js/tooltips.js`), Mini-Hilfe, Tastaturhilfe, Feedback ja/nein nur in **localStorage** (`pulse:help-feedback`) — **kein** Server-Upload.
- In den Hilfe-HTML-Dateien stehen **Platzhalter „Video folgt“**, keine eingebetteten Videos.

### 3.24 Event-Management (Session = Event, Deck in der Session)

#### Begriffe (verbindlich im Code und in der UI)

| Begriff | Bedeutung |
|---|---|
| **Event** | Öffentliche Veranstaltungshülle: Titel, Zeitraum, Status, Kategorie, optional Event-Branding. Persistiert in `data/events.json`. |
| **Session** | Laufende Umfrage mit sechsstelligem Code, Folien-Deck, Stimmen, Q&A, Quiz. Persistiert in `pulse.db`. |
| **Join-Code / `sessionCode`** | Derselbe sechsstellige numerische Code für Event und Session (`joinCode` === `sessionCode`). |
| **Deck** | Geordnete Folienfolge einer Session (max. 40). **Nicht** in `events.json`. |
| **Set** | **Entfällt.** Frühere verschachtelte Event-Sets existieren nicht mehr; Migration führt alte `sets[]`-Folien in ein Session-Deck zusammen. |

Kurz: **Ein Event ist genau eine Session** (ein Code, ein Deck). Events sind Metadaten plus Verweis auf dieselbe Session.

#### Datenmodell `data/events.json`

Persistenz: `lib/events.js`, Pfad über `process.cwd()`. Cap: **80** Events. Folien-Cap je Session: **40** (`lib/deck.js`).

**Event-Objekt (ohne `sets[]`):**

| Feld | Beschreibung |
|---|---|
| `id` | Event-ID (`ev_…`) |
| `title`, `description` | Anzeige auf Startseite und in der Admin-Liste |
| `startAt`, `endAt` | Datum `YYYY-MM-DD` |
| `startTime` | Optional ISO-Zeitstempel für **Event-Countdown** (Leinwand/Presenter); leer = kein Countdown |
| `eventImage` | Optional Hintergrundgrafik als Data-URL (PNG/JPEG/WebP/SVG, nach Upload skaliert; öffentliche Event-Liste ohne Bildbytes) |
| `status` | `planned` \| `active` \| `ended` \| `archived` |
| `category`, `room` | Optional |
| `joinCode`, `sessionCode` | Gleicher 6-stelliger Code |
| `templateEventId` | Optional, für `copyFromId` beim Anlegen |
| `branding` | Optionales Event-Branding (Logo, Farben, Footer) — überlagert Instanz-CI in Join/Presenter |
| `teamId` | **Pflicht** (bei Benutzer-Auth): genau ein Organisations-Team; alle Mitglieder dürfen Deck bearbeiten und präsentieren |
| `ownerUserId` | Ersteller (Audit/Migration); **nicht** für Rechteprüfung |
| `createdAt`, `updatedAt` | Zeitstempel |

**Entfernt/deprecated:** `editorUserIds`, `presenterUserIds`, `viewerUserIds`, Event-Entsperrpasswort, `POST …/share`, `PATCH …/access` (410). Ad-hoc-Sessions behalten optional den Session-Admin-Schlüssel.

**Session-Payload** (`pulse.db`, Feld `eventId` im JSON-Payload): verknüpft Session mit Event. Öffentliche WS/REST-Payload enthält `eventId` und `eventBranding` (kein `eventSets`).

Statistik wird **nicht** in `events.json` gespeichert, sondern zur Laufzeit aus der Session berechnet (`computeStats`).

#### Anlegen und Session-Sync

- **POST `/api/events`:** legt Event-Metadaten an und ruft `createEventWithSession` auf → sofort `createSession` mit dem Join-Code, `skipLobby: true`, `eventId`, Standard-Deck (Willkommens-Choice) oder Folien-Kopie von `copyFromId` (Quell-Event → dessen Session-Deck, neue Folien-IDs).
- **`ensureEventSession`:** beim Join oder Statuswechsel — legt die Session nur an, wenn sie fehlt; **überschreibt vorhandene Folien nicht**.
- **`migrateEventDecks`:** beim Serverstart nach `migrateLegacy()` — fehlende Sessions anlegen, Folien aus alter `sets[]`-Struktur zusammenführen (aktives Set zuerst).

#### Status

| Status | Startseite | Teilnehmer-Join (WS) | Bemerkung |
|---|---|---|---|
| `planned` | sichtbar, Join-UI aus (`joinEnabled: false`) | blockiert | Staff (`presenter`/`stage`) darf beitreten |
| `active` | sichtbar, Join an | erlaubt | Session zum Join-Code |
| `ended` | unter „Vergangen“ (`resultsOnly`) | erlaubt | Ergebnisse / bestehende Session |
| `archived` | nicht gelistet | blockiert | `GET /api/events/:id` ohne Admin → 404 |

**Statuspflege:** `tickEventStatuses()` stündlich und beim Start. Archiviert bleibt unangetastet. Änderungen ins Audit (`event.autoStatus`), **kein** E-Mail-Versand.

#### Hash-Routing und Rückwärtskompatibilität

| Hash | Zweck |
|---|---|
| `#/admin/events` | Event-Liste (Metadaten, Session-Link) |
| `#/admin/events/new` | Event anlegen → Redirect `#/admin/sessions/:code` |
| `#/admin/events/:id` | Event-Detail: Metadaten, Statistik, Branding, Links |
| `#/admin/sessions/:code` | **Deck-Editor** für die Session (alle Folien-Operationen) |
| `#/join/:sessionCode` | Teilnehmer-Join (Startseite, QR, Einladungstext) |
| `#/present/:sessionCode` | Präsentator |

**Redirects (Alt-URLs):**

- `#/admin/events/:id/sets/:setId` → `#/admin/sessions/:sessionCode`
- `#/event/:eventId` → `#/join/:sessionCode` (`redirectLegacyEventJoin` in `frontend/js/events.js` / `app.js`)

#### Admin-UI (`frontend/js/events.js`)

- **Event-Liste:** Titel, Status, Datum, Session-Code (Link zum Deck), Folienzahl, Teilnehmer/Stimmen/Fragen aus Session-Statistik.
- **Event anlegen:** Metadaten, optional sofort aktivieren, optional `copyFromId` (Folien aus Quell-Session).
- **Deck `#/admin/sessions/:code`:** Folienliste mit Drag & Drop, **Inhaltsbearbeitung** (Inline für einfache Typen, Modal für komplexe; Auto-Save; Undo nach Löschen), Mehrfachauswahl/Bulk-Eigenschaften, Pfeile hoch/runter, duplizieren, löschen, neue Folie, Modal **Folien kopieren**. Presenter-Schlüssel unter `pulse:admin:<code>` in `sessionStorage`.
- **Event-Detail:** QR, Join-Link, Einladungstext, CSV-Statistik, Event-Branding, optional Startuhrzeit und Event-Grafik.
- **Countdown:** Bei gesetztem `startTime` zeigen Stage (`#/stage/:code`) und Presenter einen Live-Countdown (`frontend/js/eventCountdown.js`); **Los geht’s** beendet ihn serverseitig und wechselt zur ersten Folie (siehe 3.13a).

Folien-Mutationen laufen über **`POST /api/sessions/:code/slides`** bzw. **`PATCH/DELETE …/slides/:slideId`** (nicht über Event-Endpoints). Auth: Instanz-Admin (`ADMIN_SECRET` / `X-Admin-Key`) **oder** Presenter-Schlüssel (`canManageSession` in `server.js`).

Event löschen nur bei Status `planned` oder `archived`.

#### Startseite und Join

- `GET /api/events` → `{ upcoming, past }` mit `joinUrl` (`…#/join/<sessionCode>`), `copyText`, `joinEnabled`, `resultsOnly`, QR-Daten.
- Teilnehmer-Link zeigt immer auf die **Session**, nicht auf eine Event-ID.
- `joinSession` prüft Event-Status über `eventByJoinCode` (geplant/archiviert blockiert Nicht-Staff).

#### Statistik und Export

- `GET /api/events/:id/stats` — aggregiert aus der verknüpften Session.
- `GET /api/events/:id/stats.csv` — CSV aus Session-Daten (`statsCsv`).
- `avgStaySec` ist derzeit **0** (Platzhalter).

#### REST (Events + Session-Deck)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/events` | Öffentliche Karten |
| GET | `/api/events/admin` | Admin-Liste inkl. `sessionCode`, `slideCount`, `stats` |
| POST | `/api/events` | Event + Session anlegen |
| GET/PATCH/DELETE | `/api/events/:id` | Metadaten (GET liefert optional `session`-Zusammenfassung für Admin) |
| POST | `/api/events/:id/status` | Status setzen |
| GET | `/api/events/:id/stats` und `…/stats.csv` | Statistik aus der Session |
| GET | `/api/sessions/admin` | Session-Liste für Folien-Copy-Dropdown |
| GET | `/api/sessions/:code` | Session inkl. Deck (öffentlich ohne Reveal-Felder) |
| POST | `/api/sessions/:code/slides` | Deck `add` / `remove` / `move` / `duplicate` / `patch` / **`update`** |
| PATCH | `/api/sessions/:code/slides/:slideId` | Folien-Inhalt aktualisieren (Frage, Optionen, Einstellungen; Typ/ID bleiben) |
| DELETE | `/api/sessions/:code/slides/:slideId` | Folie löschen |
| POST | `/api/sessions/:code/copy-from` | Folien aus anderer Session kopieren |

**`POST /api/sessions/:code/copy-from`** — Body:

```json
{ "sourceCode": "123456", "slideIds": ["optional", "…"] }
```

Leeres/fehlendes `slideIds` → alle Folien der Quelle. Neue Folien-IDs via `copySlidesFrom` in `lib/deck.js`. Cap 40 wird geprüft.

**Entfernt** (kein Alias): `GET/POST /api/events/:id/sets`, WebSocket-Typ `eventSet`, Modul `lib/eventSets.js`.

#### Migration

1. **`eventStore.migrateLegacy()`** (`lib/events.js`): entfernt `sets[]`, setzt `sessionCode`, liefert `pending[]` mit zusammengeführten Folien für den Server.
2. **`migrateEventDecks()`** (`server.js`): beim Start — Sessions aus `pending` anlegen bzw. bei geplanten Events ohne Teilnehmer Deck aus alten Sets übernehmen.
3. **Manuell:** `npm run migrate:events` (`scripts/migrate-events.js`) — bereinigt nur `data/events.json` ohne HTTP (Sessions legt der nächste Serverstart an).

Tests: `scripts/test-events.js` (Store, Migration, Copy), `scripts/test-deck.js` (`copySlidesFrom`). Events unterliegen **nicht** dem Session-`retentionDays`-Sweep.

### 3.25 Theme / WCAG

- **Light ist Default** (`:root` / `data-theme="light"`). Dark nur bei `localStorage.pulse-theme === "dark"`. Kein automatisches System-Dark (`prefers-color-scheme` steuert nicht). `frontend/js/theme.js` `resolveStoredTheme`.
- Umschalter in Home/Present/Join; Taste **T** auf der Bühne. Tokens `frontend/css/theme.css`.
- Kontrast: WCAG-2.1-Formel; Schwellen Text 4,5:1, UI 3:1. Prüfung `docs/contrast.md` und `npm run test:theme`.

### 3.26 Weitere vorhandene Funktionen

- **Health:** `GET /api/health` (Sessions, DB-Art, Redis-Ping, IP-Sperre, HTTPS-Info).
- **Audit:** `data/audit.json`, IPs nur als Hash, 90-Tage-Sweep, Export `GET /api/audit` mit Admin-Secret.
- **Metriken:** `GET /metrics` Prometheus-Textformat (`lib/metrics.js`). In Docker: Prometheus + Grafana (Port 3001).
- **Reset:** Präsentator setzt Folien-Zähler zurück (`reset`).
- **Presenter-Passwort:** UI beim Anlegen entfernt; **neue** Sessions ohne `passwordHash`. Legacy-Sessions mit scrypt-Hash funktionieren weiter (`checkPresenterPassword`, 3 Fehlversuche → 5 Min. Sperre).
- **IP-Sperre:** nach 100 WS-Verbindungen derselben IP-Hash 24 h; `IP_BLOCK=0` oder Branding `ipBlock: false`. Rate-Limits für HTTP/Fragen bleiben.
- **Admin-Leiste:** Sessions (`#/admin`), Events (`#/admin/events`), Branding, Datenschutz, SSL, Einstellungen, **Updates**, **Benutzer** (nur admin), Hilfe (`frontend/index.html`, `frontend/js/adminNav.js`). Anmeldung: `#/admin/login`. Profil: `#/admin/profile`. Folien-Deck: `#/admin/sessions/:code`.

### 3.27 Benutzerverwaltung (optional)

Aktivierung: `USER_AUTH_ENABLED=1` (`.env` oder `auth_settings` in SQLite/PostgreSQL). **Nicht** verfügbar im JSON-DB-Fallback.

| Aspekt | Ist-Umsetzung |
|---|---|
| Anmeldung | E-Mail → 6-stelliger PIN (10 Min., einmalig) → HttpOnly-Cookie `pulse_auth` |
| Rollen | `admin` (Instanz), `editor` (Events/Sessions anlegen), `viewer` (nur lesen/teilen wo berechtigt) |
| Kennwort | scrypt-Hash; nur Profil/Kontoänderungen, **nicht** für täglichen Login |
| Step-up | Admins: erneute PIN vor Settings-Export, SSL, Datenschutz, Benutzerverwaltung (15 Min. Gültigkeit nach Bestätigung) |
| Bootstrap | Erster Admin via `.env` (`BOOTSTRAP_ADMIN_*`) oder `ADMIN_SECRET` solange `adminCount === 0` |
| SMTP | Produktion: `SMTP_*`; Entwicklung: `AUTH_DEV_MAILBOX=1` |
| API | `/api/auth/*`, `/api/users/*` — siehe `lib/authApi.js`, `lib/userService.js` |
| Frontend | `authClient.js`, `loginPage.js`, `usersAdmin.js`, `profilePage.js`, `stepUp.js` |
| Events | Pflicht-`teamId`, Teammitgliedschaft für Deck/Presenter; `PATCH …/access` und `POST …/share` entfernt (410); Migration `POST /api/events/admin/assign-teams` |

Tests: `npm run test:auth` (`scripts/test-auth.js`).

---

## 4. Nichtfunktionale Anforderungen (IST)

### 4.1 Barrierefreiheit

Umgesetzt, soweit der Code das hergibt — **keine** abgeschlossene BITV-Zertifizierung im Repo:

- Skip-Link „Zum Inhalt springen“ (`frontend/index.html`).
- Semantische Views, `aria-*` über i18n (`data-i18n-aria`), Theme-Switcher mit `aria-pressed`.
- Tastatur: Folien Pfeile/Leertaste, Reveal **R**, Theme **T**, Poll-Optionen per Pfeiltasten, Fokusfalle in der Tour.
- Wortwolke: Canvas `aria-hidden`, Live-Region für Screenreader.
- Kontrast: WCAG-2.1-Formel in `frontend/js/theme.js`; Prüfung `docs/contrast.md` und `npm run test:theme`. Schwellen Text 4,5:1, UI 3:1. Orange/Gelb nicht als Text auf Weiß.
- Rechtstext nennt **BITV 2.0** und **WCAG 2.1 AA** als Maßstab; die Bewertung der konkreten Instanz bleibt bei der verantwortlichen Stelle (`lib/privacy.js` Abschnitt Barrierefreiheit).

### 4.2 DSGVO / Datensparsamkeit

- **Keine HTTP-Cookies** für Teilnehmende/Presenter (kein Tracking). **Optional:** HttpOnly-Cookie `pulse_auth` nur für Instanz-Benutzer bei `USER_AUTH_ENABLED=1`.
- Browser-seitig **localStorage / sessionStorage** (Theme, Consent, Client-ID, Admin-Key, letzte Sessions, Tour, Hilfe-Feedback, Sprache, Sound-Mute).
- Teilnahme ohne Login; Q&A-Anzeige `User_xxxx`; IP im Audit nur **SHA-256, 16 Hex-Zeichen** (`lib/auditLogger.js` `hashIp`).
- Session-Retention konfigurierbar; Audit 90 Tage; Hilfe-Feedback bleibt lokal. Event-Katalog (`data/events.json`) ohne Auto-Löschung.
- Privacy-Muster: EU-Hosting-Platzhalter, kein Tracking, kein Geräte-Typ in der Server-Logik.

### 4.3 BITV-Hinweis

Die Datenschutzerklärung/Impressum-Vorlage verweist ausdrücklich auf BITV 2.0. Das ist ein **rechtlicher Hinweistext**, keine Konformitätserklärung der Software. Mängelmeldung: Kontaktfeld `accessibilityContact` (Default Internetredaktion LHS).

### 4.4 Betriebliche Eigenschaften

- CORS `Access-Control-Allow-Origin: *` auf JSON-APIs.
- JSON-Body-Limit 64 KiB (`MAX_PAYLOAD`); Settings-Import bis 2 MiB (Bundle-Limit intern 4 MiB inkl. PEMs), Logo 256 KiB, einzelne PEM 32 KiB.
- WS-Frames > 64 KiB werden verworfen.
- Batching: Poll/Wortwolke/Teilnehmer/Quiz-Timer 100 ms; Q&A-Events 1 s.
- Statische Antworten: gzip/Brotli (`lib/compress.js`). Gehashte JS/CSS (`?h=` korrekt): `Cache-Control: public, max-age=31536000, immutable`. `index.html`: `no-cache, must-revalidate`. JSON-API Auth/Admin: `no-store, private`. Optional `ASSET_BASE` als URL-Prefix für `./css` `./js` `./assets` in `index.html`.

---

## 5. Technische Umsetzung je Baustein

### 5.1 Dateipfade

| Bereich | Dateien |
|---|---|
| Prozess | `server.js` |
| Auth (Session-Schlüssel) | `lib/auth.js` |
| Auth (Instanz-Benutzer) | `lib/userDb.js`, `lib/userAuth.js`, `lib/userService.js`, `lib/authApi.js`, `lib/permissions.js`, `lib/emailService.js`, `lib/pinLimiter.js`, `lib/stepUpAuth.js`, `lib/bootstrapAdmin.js` |
| DB | `lib/db.js`, `lib/postgres.js` |
| Bus | `lib/bus.js` |
| Live/Deck | `lib/liveState.js`, `lib/deck.js`, `lib/interactive.js`, `lib/intake.js`, `lib/slideTypes.js`, `lib/slideVotes.js`, `lib/stopwords.js` |
| Events | `lib/events.js` (kein `lib/eventSets.js` mehr) |
| Migration / Setup | `scripts/migrate-events.js` (`npm run migrate:events`), `scripts/install.sh` (`npm run setup`) |
| Schutz | `lib/rateLimiter.js`, `lib/wordFilter.js`, `lib/spamDetector.js`, `lib/auditLogger.js` |
| Branding/Recht | `lib/branding.js`, `lib/privacy.js`, `lib/settings.js` |
| Kompression | `lib/compress.js` (`node:zlib`, gzip + Brotli) |
| Asset-Manifest | `lib/assetManifest.js`, `scripts/build-asset-manifest.js`, `frontend/js/assetUrl.js` |
| SSL | `lib/ssl.js`, `lib/sslStore.js`, `lib/sslUtil.js` |
| Hilfe-Index | `lib/helpIndex.js` |
| Metriken | `lib/metrics.js` |
| Frontend-Kern | `frontend/js/app.js`, `websocket.js`, `i18n.js`, `theme.js` |
| Folientypen | `poll.js`, `wordcloud.js`, `wordcloud-worker.js`, `wordcloud-layout.js`, `qa.js`, `quiz.js`, `leaderboard.js`, `deck.js`, `templates.js`, `slideInputs.js`, `slideResults.js`, **`picker.js`**, **`pickerEditor.js`**, **`slideForm.js`** |
| Presenter / Join | `presenterStats.js`, `joinMobile.js` |
| Betrieb UI | `emergency.js`, `moderation.js`, `reactions.js`, `ssl.js`, `privacyPage.js`, `settings.js`, `help.js`, `tooltips.js`, `export.js`, `errors.js`, `events.js`, `adminNav.js`, **`authClient.js`**, **`loginPage.js`**, **`usersAdmin.js`**, **`profilePage.js`**, **`stepUp.js`** |
| Styles | `frontend/css/theme.css`, `typography.css`, `components.css`, `accessibility.css`, `styles.css`, `branding.css`, `moderation.css`, `privacy-legal.css`, `help.css`, `join-mobile.css`, `events.css` |
| i18n / Hilfe | `frontend/i18n/*.json`, `frontend/help/**` |
| Daten | `data/pulse.db` (Sessions + SSL-Metadaten), `data/events.json`, `data/branding.json`, `data/privacy.json`, `data/privacy-versions.json`, `data/audit.json`, `data/ssl/` |
| Docs | `docs/projektdokumentation.md`, `docs/installation.md`, `docs/verfahrensverzeichnis.md`, `docs/contrast.md` |

### 5.2 Protokolle: REST vs. WebSocket (`emitLive`)

**REST** (`/api/…`): Session anlegen/lesen, Events (`/api/events`, siehe 3.24), `GET /api/sessions/admin`, `POST …/copy-from`, Health, Branding, Privacy, Settings, SSL, Audit, CSV-Export, Folien-Mutationen, Lobby/Results/Reset (Presenter-Auth), Q&A/Quiz/Emergency parallel zur WS-API.

**WebSocket** Pfad `/ws`. Client sendet über `emitLive` in `frontend/js/app.js` **nur** `RealtimeClient.send` — bewusst kein zweites REST für dieselbe Live-Aktion.

Eingehende Typen (Auszug): `ping`, `batch`, `join`, `vote`, `word`, `reaction`, `lobby`, `results`, `interaction`, `event_countdown`, `submit_question`, `upvote_question`, `moderate_question`, `qa_timer`, `quiz_start`, `quiz_answer`, `quiz_powerup`, `quiz_end`, `emergency`, `deck`, `slide`, `reset`.

Ausgehende Typen (Auszug): `pong`, `session`, `error`, `poll:update`, `wordcloud:update`, `participants`, `results`, `lobby`, `deck`, `slide`, `slide_updated`, `interaction`, `event_meta`, `new_question`, `question_upvoted`, `question_moderated`, `qa_timer`, `quiz_started`, `quiz_timer`, `quiz_results`, `quiz_powerup`, `leaderboard_update`, `emergency_activated` / `emergency_resumed`, `reaction`, `batch`.

Ohne erreichbares Backend kann der Client auf **BroadcastChannel-Mock** umschalten (`websocket.js`) — zwei Tabs lokal, nicht der Produktivpfad.

### 5.3 Authentifizierung

| Rolle | Mechanismus |
|---|---|
| Instanz-Admin (Branding, Privacy, SSL, Settings, Audit, Events, Benutzer) | **`ADMIN_SECRET`** (Header `X-Admin-Key` / Bearer, Notfall/Bootstrap) **oder** Cookie-Session mit Rolle `admin` bei `USER_AUTH_ENABLED=1`. Lokal ohne Secret: Demo-Modus. Kritische Schreibzugriffe für Cookie-Admins: **Step-up-PIN** (`POST /api/auth/step-up`). |
| Instanz-Editor / Viewer | Cookie-Session (`admin` / `editor` / `viewer`); Navigation und API nach `lib/permissions.js`. Viewer: keine Event-Neuanlage. |
| Session-Präsentator / Deck-Admin | **HMAC-SHA-256** des Admin-Schlüssels mit Pepper `ADMIN_SECRET`. `canManageSession` erlaubt Folien-Mutationen und `copy-from` auch mit Presenter-Schlüssel oder Event-Berechtigung. |
| Presenter-Passwort | **scrypt** für Legacy-Sessions mit `passwordHash`. Neue Sessions ohne Passwort; Zugang über Admin-Schlüssel / Event-Login (`canPresentSession`, Cookie-Auth für WS). |
| Instanz-Benutzer (optional) | E-Mail-PIN-Login; Session-Token gehasht in DB; Cookie `pulse_auth` HttpOnly. Kennwort-Hash (scrypt) nur für Profil. |

Teilnehmer haben keine Server-Identität außer einer vom Browser gesetzten `clientId` (`sessionStorage` `pulse:client-id`).

### 5.4 Speicherung (`data/`)

| Datei / Ort | Inhalt |
|---|---|
| `pulse.db` | Tabelle `sessions` (Code, Admin-Hash, Payload JSON). Tabelle `ssl_certificates`. **Optional Benutzerverwaltung:** `users`, `auth_pins`, `auth_sessions`, `auth_settings`, `user_event_access` (`lib/userDb.js`). |
| `events.json` | Event-Katalog: Titel, Zeitraum, Status, Join-/Session-Code, optionales Event-Branding (kein Deck) |
| `branding.json` | Instanz-CI |
| `privacy.json` + `privacy-versions.json` | Rechtstexte |
| `audit.json` | Audit (max. 5000 Zeilen) |
| `ssl/<domain>/*.pem` | Zertifikate und Keys |

Sessions liegen zusätzlich in einer In-Memory-`Map`, Persistenz entprellt (200 ms).

### 5.5 Ports

| Port | Nutzung |
|---|---|
| **3000** | HTTP der Node-App (`PORT`, Default). Docker-Healthcheck gegen `/api/health`. |
| **3443** | HTTPS lokal (`HTTPS_PORT` ungesetzt und nicht Production). |
| **443** | HTTPS wenn `NODE_ENV=production` und `HTTPS_PORT` ungesetzt. |
| **80** | Let’s-Encrypt HTTP-01 (öffentlich). Nginx in Compose bound 80/443 und reicht an die App durch. Grafana UI: Host **3001**. |

---

## 6. Betrieb

Ausführliche **Installationsanleitung** (Schnellstart-Skript, lokale Installation, Docker Compose, Fehlerbehebung): **`docs/installation.md`**.

Kurz lokal:

```bash
./scripts/install.sh
export $(grep -v '^#' .env | xargs) && npm start
```

Alternativ: `npm run setup` (ruft dasselbe Skript auf).

### 6.1 Umgebungsvariablen (`.env.example`)

| Variable | Bedeutung |
|---|---|
| `PORT` | HTTP, Default 3000 |
| `ADMIN_SECRET` | Pepper + Instanz-Admin |
| `SQLITE_PATH` | SQLite-Datei, z. B. `/data/pulse.db` |
| `DATABASE_URL` | Optional `postgres://…` |
| `REDIS_URL` | Optional Redis Pub/Sub. **Ohne URL nur ein Prozess.** Mit URL Fanout aller Live-Events. |
| `ASSET_BASE` | Optionaler URL-Prefix für `./css` `./js` `./assets` in `index.html` |
| `BATCH_INTERVAL_MS` | Broadcast-Batch, Default 100 |
| `IP_BLOCK` | `0`/`false`/`off` schaltet 24h-IP-Sperre fest aus |
| `HTTPS_PORT` | HTTPS-Port |
| `SSL_DIR` | PEM-Wurzel (lokal `data/ssl`) |
| `LETSENCRYPT_STAGING` | Staging-CA |
| `SSL_REDIRECT` | HTTP→HTTPS |
| `ACME_SKIP_VERIFY` | Interne HTTP-01-Vorabprüfung überspringen (Default an, wenn App-Port ≠ 80) |
| `NODE_ENV` | `production` → HTTPS-Default-Port 443 |

Docker-Compose setzt zusätzlich Grafana-Passwort `GRAFANA_PASSWORD`.

### 6.2 Docker / nginx (kurz)

- `Dockerfile`: Node 22, User `node`, Volumes `/data` und `/ssl`, Expose 3000/80/443/3443, Healthcheck HTTP `/api/health`.
- `docker-compose.yml`: Services **`pulse`** und **`pulse-b`** (zwei Node-Prozesse, Redis Pflicht in Compose), **redis**, **nginx** (80/443, `ip_hash` auf beide App-Container), **prometheus**, **grafana** (3001).
- `deploy/nginx.conf`: Upstream `pulse_app` mit `ip_hash` (WebSocket-Sticky). Pfad **`/.well-known/acme-challenge/`** unverändert an Node. `/metrics` nur RFC1918. HTTPS-Server-Block ist auskommentiert (Zertifikate alternativ über Node-HTTPS oder manuell `deploy/certs/`).

Start ohne Compose: `npm start` / `npm run start:prod`.

### 6.3 Let’s Encrypt HTTP-01 — Voraussetzungen

1. DNS A/AAAA der öffentlichen Domain zeigt auf den Host.
2. Port **80** aus dem Internet erreichbar; Challenge-URL wird von Node bedient (`ssl.serveChallenge`), **ohne** Auth und **ohne** HTTPS-Redirect.
3. Hinter Nginx den ACME-Pfad durchreichen (wie in `deploy/nginx.conf`).
4. In der Admin-UI Nutzungsbedingungen akzeptieren und Kontakt-E-Mail angeben.
5. Kein Wildcard, keine IP, kein localhost — HTTP-01 stellt das nicht aus.

Erneuerung: stündlicher Timer in `server.js` ruft `ssl.renewDue()` auf.

---

## 7. Tests

Voraussetzung: Node ≥ 22. Die Scripts starten **keinen** dauerhaften App-Server und beenden keinen laufenden Prozess auf Port 3000 (Privacy/Branding/Settings-Tests schreiben nicht nach `data/`).

```bash
npm test
```

führt nacheinander aus (`package.json` `scripts.test`):

| Script | Datei | Gegenstand |
|---|---|---|
| `npm run test:security` | `scripts/test-security.js` | Wortfilter, Rate-Limit, scrypt-Passwort, WS-Cap, IP-Sperre ein/aus |
| `npm run test:deck` | `scripts/test-deck.js` | Folien add/remove/move/duplicate/`update`, Live-State-Erhalt, `copySlidesFrom`, Cap 40 |
| `npm run test:live` | `scripts/test-live.js` | Reveal-Payload, Fanout-Envelope, Bus ohne Redis |
| `npm run test:presenter` | `scripts/test-presenter.js` | `notes` / `plannedMinutes` nicht public, Stats-Hilfen, Deck-`patch` |
| `npm run test:ssl` | `scripts/test-ssl.js` | Domain-Normalisierung, Store, HTTPS-Info; Issue gegen localhost muss scheitern; kein Let’s-Encrypt-Netzwerk zwingend für die Unit-Teile |
| `npm run test:theme` | `scripts/test-theme.js` | Light-Default, nur exakt `"dark"` schaltet Dark, WCAG-Kontrastpaare |
| `npm run test:privacy` | `scripts/test-privacy.js` | Platzhalter, Retention, BITV-Nennung, Versions-Append |
| `npm run test:help` | `scripts/test-help.js` | `articles.json`, Suche/Kategorie analog `lib/helpIndex.js`, Dateiname `docs/projektdokumentation.md` |
| `npm run test:branding` | `scripts/test-branding.js` | Homepage statt `social[]`, White-Label-Sanitizer (appName, footerHidden, Domain), gzip/brotli-Wahl ohne HTTP-Server |
| `npm run test:settings` | `scripts/test-settings.js` | Export/Import Schema 1 und 2, Logo + PEM im Bundle, verbotene Key-Felder |
| `npm run test:slides` | `scripts/test-slides.js` | Ranking/Borda, points100-Summe, hideable Typen, private Q&A, Multi-Correct, Stoppwörter |
| `npm run test:qa-timer` | `scripts/test-qa-timer.js` | Q&A-Countdown Start/Pause/Ende, `endsAt`, keine neuen Fragen nach Ablauf |
| `npm run test:interaction-state` | `scripts/test-interaction-state.js` | Folien-Interaktion: Zustände, Timer, Guards, Legacy-Folien |
| `npm run test:events` | `scripts/test-events.js` | Event-Metadaten inkl. `startTime`/`eventImage`, Status/Tick, Migration von sets[] nach sessionCode, Folien-Copy zwischen Decks |
| `npm run test:auth` | `scripts/test-auth.js` | Benutzerverwaltung, PIN-Login, Rollen, Step-up, Profil |

**Wartung (nicht in `npm test`):**

| Script | Datei | Gegenstand |
|---|---|---|
| `npm run setup` | `scripts/install.sh` | Abhängigkeiten, `.env`, optional Docker/tests |
| `npm run migrate:events` | `scripts/migrate-events.js` | Legacy-Feld `sets[]` aus `data/events.json` entfernen; Session-Decks beim nächsten Serverstart via `migrateEventDecks()` |

Manuell (nicht in `npm test`): Session im Browser anlegen, Join-Code, Lobby, Reveal, **Interaktionssteuerung** (manueller Start, Timer, Pause/Ende), **Event-Countdown Los geht’s**, Q&A-Moderation (Kategorie/Gruppe/privat), Quiz-Power-Ups, Notfall, SSL-UI, Settings-Datei rundtripen, Join-Daumenzone/Offline-Banner, Event anlegen, Deck unter `#/admin/sessions/:code` inkl. Folien-Inhalt bearbeiten (Inline/Modal, Bulk), Event-Grafik, Join von der Startseite.

---

## 8. Abgrenzung (was der Code **nicht** kann)

Nur Lücken, die sich aus dem Repository ergeben:

- **Kein** React, Vue, Angular, Svelte; **kein** SPA-Bundler-Pflicht (native ES-Module).
- **Kein** Express und **kein** Socket.io.
- **Kein** Google Analytics, Matomo, Tracking-Pixel, `gtag` im Frontend.
- **Keine** HTTP-Cookies für Teilnehmende; **optional** Session-Cookie `pulse_auth` für Instanz-Benutzer.
- **Kein** SSO, LDAP; **keine** Passkeys/WebAuthn (Stand Software).
- E-Mail-Versand nur für **Anmelde-PIN** (optional, SMTP) — nicht für Event-Status.
- **Keine** Event-Sets mehr; historische `sets[]` nur noch über Migration (`migrateLegacy` / `migrate:events`).
- Events liegen in **JSON** (`data/events.json`) als Metadaten; das Deck liegt in der Session (`pulse.db`), nicht in `events.json`.
- **Keine** Social-Media-Links (Mastodon/LinkedIn o. Ä. entfernt; nur Homepage-URL).
- **Keine** Hilfe-Videos — nur Platzhalter „Video folgt“ plus Transkript-Hinweis im Artikeltext.
- **Kein** Video-/Audio-Streaming; kurzer optionaler Bestätigungs-Sound nur als Branding-Data-URL (Standard stumm).
- **Kein** PowerPoint-/PDF-Import von Decks. Folienbilder nur als Data-URL an `image_choice`-Optionen und als Instanz-Hintergrund/Logo.
- **Keine** Native Apps, kein App-Store.
- **Kein** automatisches Dark Mode nach Systemeinstellung.
- Settings-Export enthält **keine** Sessions, **keine** Events und **keine** Audit-Logs.
- SSL-REST liefert **keine** Private Keys (Keys nur im Settings-Backup Schema 2 und auf der Platte).
- Proben-Modus sperrt den Join-Link in der UI, blockiert Join serverseitig aber nicht hart.
- Swipe auf dem Join-Handy gilt für Choice/Q&A/Quiz/Rating, nicht für Ranking/Punkte/Freitext/Bild/Termin.
- Mehrere App-Instanzen brauchen Redis + sticky Sessions; ohne Redis kein Cross-Process-Fanout.
- `pg` ist optional; ohne Paket fällt Postgres auf SQLite zurück.
- Die Privacy-Texte und `docs/verfahrensverzeichnis.md` sind **Muster/Entwurf**, keine geprüfte Rechtsberatung.
- npm-Abhängigkeit `axios` kommt transitiv über `acme-client`, nicht als App-HTTP-Client.

---

## Quellen dieses Dokuments

Quellen dieses Dokuments

`server.js`, `lib/*` (insb. `slideTypes.js`, `slideVotes.js`, `interactive.js`, `liveState.js`, `branding.js`, `settings.js`, `compress.js`, `bus.js`, `stopwords.js`, `privacy.js`, `deck.js`, `events.js`), `frontend/js/*`, `frontend/index.html`, `frontend/css/join-mobile.css`, `frontend/css/events.css`, `package.json`, `README.md`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `deploy/nginx.conf`, `docs/contrast.md`, `docs/installation.md`, `docs/verfahrensverzeichnis.md`, `scripts/test-*.js`, `scripts/migrate-events.js`, `scripts/install.sh`.
