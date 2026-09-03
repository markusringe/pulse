# Tailwind CSS v4 — Mobile-Audit und Prüfbericht

Stand: 2026-09-03 · Pulse v1.3.0

## Fehleranalyse (Ausgangslage)

| Problem | Ursache | Behebung |
|--------|---------|----------|
| Ungestylte Startseite unter `/j/CODE` | Relative Asset-Pfade `./css/…` → Browser lädt `/j/css/…` | Absolute Pfade `/css/`, `/js/` in `index.html` |
| Countdown fehlt auf Startseite | Kein Hero-Mount in `events.js` | `syncHomeEventCountdown()` + `#home-event-hero` |
| Uneinheitliches CSS | Viele Legacy-Dateien, Spezifitätskonflikte | Schrittweise Migration zu Tailwind v4 (`pulse.css`) |
| QR dominiert Event-Karten | QR oberhalb der Primäraktion | QR/Link in `<details>` einklappbar |
| Admin-Nav bricht auf Mobil | Horizontale Link-Leiste | Drawer ab &lt;768px (`mobileNav.js`) |
| Kein zentrales Design-System | Verstreute Variablen in `theme.css` | `@theme` in `tailwind.input.css` |

## Tailwind-Integration

- **Eingabe:** `frontend/css/tailwind.input.css` (CSS-first, `@import "tailwindcss"`, `@source` für HTML/JS)
- **Ausgabe:** `frontend/css/pulse.css` (minified nach Build)
- **Build:** `npm run css:build` bzw. `npm run css:watch`
- **Docker:** Multi-Stage-Build kompiliert CSS vor dem Produktions-Image
- **Updates:** `lib/updateService.js` führt `css:build` nach `npm install` aus
- **Kein CDN:** Tailwind wird ausschließlich lokal gebaut

Fallback: Im Repository liegt eine handgeschriebene `pulse.css` mit Design-Tokens und `.pulse-*`-Komponenten, bis der erste Build läuft.

## Umgesetzt in v1.3.0

- Tailwind v4 CLI-Pipeline (package.json, Dockerfile, install.sh, VPS-Installer, Update-Service)
- Startseite mobile-first (`pulse-home-shell`, Join prominent, Intro kompakt)
- Event-Karten: Medienbereich, Status, Teilnehmen primär, QR/Invite in Details
- Öffentliches Mobilmenü (Hilfe, Datenschutz, Impressum, Admin)
- Admin-Drawer mit Fokusfalle, Escape, Overlay
- Safe Areas und `min-h-dvh` in Tailwind-Basis vorbereitet

## Umgesetzt in v1.3.0 (Fortsetzung)

- **Teilnehmeransicht** (`pulse-join-shell`): Header, Frage, Daumenzone, Offline/Rehearsal-Banner
- **Multiple Choice / Quiz**: `pulse-choice-btn`, einspaltig mobil, zweispaltig ab 640px, Häkchen bei Auswahl
- **Bewertungsskala**: `pulse-rating-scale` vertikal auf schmalen Screens, horizontal ab 480px
- **Q&A-Composer**: `pulse-card`, `pulse-input`, primärer Sende-Button
- **Ranking / Punkte / Freitext**: Sende-Buttons mit `pulse-btn-primary`
- **Feedback**: `setJoinFeedback()` mit Erfolgs- und Fehlerzustand (`data-state="error"`)

## Umgesetzt — Admin (v1.3.0)

- **`admin-mobile.css`**: Mobile-first Shell, Touch-Formulare, sticky Speichern-Leiste
- **Tabellen → Karten** unter 768px (`table-wrap--responsive` + `data-label` auf Events- und Benutzer-Tabellen)
- **Session-Hub**: `pulse-card`, einspaltige Formular-Grids mobil, Folien-Draft als Karten
- **Admin-Chrome**: kompakte Tools-Zeile, Drawer schließt bei Navigations-Klick
- **Dialoge**: nahezu Vollbild auf Smartphones (Benutzer-Dialog, Folien-Editor, Admin-Dialoge)

## Umgesetzt — Folientypen Join (v1.3.0)

- **`join-slides.css`**: Picker (Listen + Bottom-Sheet-Dropdown), Bildwahl, Terminfindung, Wortwolke, Ranking
- Picker: horizontales Kategorieband, einspaltige Optionen mobil, Suche mit 16px (iOS)
- Bildwahl: 16:10, lazy loading, Auswahl mit ✓
- Terminfindung: große Checkbox-Karten statt enger Tabelle

## Umgesetzt — Admin Tabellen (v1.3.0)

- **Backups-Tabelle** → Karten unter 768px (`data-label`)
- **Update-Historie** → Karten unter 768px
- **Teams**: pulse-card-Karten, Vollbild-Dialoge, Mitglieder-Aktionen gestapelt

## Umgesetzt — Presenter & Wortwolke (v1.3.0)

- **`present-mobile.css`**: Kompakte Kopfzeile, Dock-Spaltenlayout, Overflow-Menü „Mehr“
- **Notfall**: Bestätigungsdialog vor dem Auslösen (`presentMobile.js`)
- **Wortwolke**: Canvas min. 220px, Rangliste unter dem Canvas auf Mobil
- **`wordcloud.js`**: `sizeCanvas` mit Container-Fallback bei Höhe 0

## Noch offen

- Branding/Einstellungs-Longforms feiner gliedern (Tabs/Akkordeons)
- Legacy-CSS schrittweise entfernen
- Lighthouse-/Screenreader-Retest dokumentieren

## Empfohlene Testauflösungen

| Viewport | Status |
|----------|--------|
| 320×568 | Manuell prüfen (Startseite, Join) |
| 375×812 (iPhone) | Manuell prüfen |
| 768×1024 Tablet | Admin-Drawer / Desktop-Nav-Grenze |
| 1024+ Desktop | Event-Karten 2-spaltig |
| 1280×720 Stage | Regression Stage prüfen |
| 1920×1080 Projektor | Stage-Lesbarkeit |

## CSS-Größe

Nach `npm run css:build` Größe von `frontend/css/pulse.css` dokumentieren:

```bash
wc -c frontend/css/pulse.css
```

Ziel: deutlich kleiner als Summe aller Legacy-CSS-Dateien nach vollständiger Migration.

## Bekannte Einschränkungen

- Node/npm muss für CSS-Build verfügbar sein (Entwicklung, Update, Docker-Build).
- Legacy-CSS (`styles.css`, `components.css`, …) wird parallel geladen, bis Views migriert sind.
- `package-lock.json` enthält Tailwind erst nach `npm install` auf dem Entwicklerrechner.
