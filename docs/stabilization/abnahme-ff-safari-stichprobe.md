# Stichprobe Firefox & Safari — Sonderfolien (v1.5.41)

**Prod:** https://pulse.ringe.us/ · **Ziel:** Abschnitt 2 + 3 der [Abnahme-Checkliste](abnahme-sonderfolien-v1.5.37.md)  
**Dauer:** ca. 15–20 Min. pro Browser  
**Tester:** _______________ · **Datum:** _______________

---

## Vorbereitung

1. Als Presenter anmelden (`markus@ringe.us` o. ä.).
2. **Zwei Tabs** pro Browser öffnen:
   - Presenter: `#/present/807435` (Townhall — Countdown + Pause + Ende)
   - Stage: `#/stage/807435?share=1`
3. Optional zweites Event **241184** nur für Folienwechsel ohne Endfolie-Test.

Hard-Reload nach erstem Load: **Cmd+Shift+R** (Safari/FF).

---

## Firefox — Presenter (`#/present/807435`)

| # | Aktion | Erwartung | OK | Notiz |
|---|--------|-----------|-----|-------|
| F1 | Countdown-Chip | Chip aktiv, Stage zeigt Countdown | ☐ | |
| F2 | Pause-Chip | „Pause“ / Untertitel auf Stage | ☐ | |
| F3 | Folie `1` | MC-Frage, Sonder-Chips inaktiv | ☐ | |
| F4 | Ende-Chip → **Abbrechen** | Dialog schließt, Event bleibt aktiv | ☐ | |
| F5 | Dock Countdown ↔ Pause | Sync mit Folienleiste (`aria-pressed`) | ☐ | |
| F6 | Hilfe `?` im Dock | Modal „Hilfe für Presenter“ | ☐ | |

## Firefox — Stage passiv

| # | Prüfung | Erwartung | OK | Notiz |
|---|---------|-----------|-----|-------|
| F7 | Keine `[data-pss-kind]`-Buttons | 0 Steuer-Buttons | ☐ | DevTools → Elements suchen |
| F8 | Keine Hilfe-FAB | `#help-fab` hidden | ☐ | |
| F9 | WS-Sync Folie 1 | Gleiche Frage wie Presenter | ☐ | |

---

## Safari — Presenter (`#/present/807435`)

| # | Aktion | Erwartung | OK | Notiz |
|---|--------|-----------|-----|-------|
| S1 | Countdown-Chip | Wie Firefox F1 | ☐ | |
| S2 | Pause-Chip | Wie Firefox F2 | ☐ | |
| S3 | Folie `1` | Wie Firefox F3 | ☐ | |
| S4 | Ende-Dialog (Abbrechen) | Native `<dialog>` sichtbar, schließbar | ☐ | |
| S5 | Dock-Sync | Wie Firefox F5 | ☐ | |
| S6 | Hilfe `?` | Wie Firefox F6 | ☐ | |

## Safari — Stage passiv

| # | Prüfung | Erwartung | OK | Notiz |
|---|---------|-----------|-----|-------|
| S7 | Keine Steuer-Buttons | Wie Firefox F7 | ☐ | |
| S8 | Keine Hilfe-FAB | Wie Firefox F8 | ☐ | |
| S9 | WS-Sync Folie 1 | Wie Firefox F9 | ☐ | |

---

## Safari iOS (optional, gleiches WLAN)

Presenter-URL im **privaten Tab** (kein Desktop-Layout nötig):

| # | Prüfung | Erwartung | OK |
|---|---------|-----------|-----|
| M1 | Folienleiste horizontal scrollbar | Alle Chips erreichbar | ☐ |
| M2 | Sonder-Chips Icon-only | Labels ausgeblendet | ☐ |
| M3 | Dock-Buttons tippbar | min. ~44 px | ☐ |

---

## Ergebnis eintragen

Nach Abschluss in `abnahme-sonderfolien-v1.5.37-fortschritt.md` unter **Noch offen** aktualisieren:

- Firefox: ☐ offen → ✅ / ❌ (Ticket)
- Safari: ☐ offen → ✅ / ❌ (Ticket)

**Bei Abweichung:** Browser-Version, OS, Screenshot, Konsole (F12 → Console), ggf. `#/stage/…` + Presenter-URL notieren.

---

## Referenz (Chrome bereits ✅)

Townhall **807435** · Bürgerversammlung **241184** · Release **v1.5.41**  
Details: [abnahme-sonderfolien-v1.5.37-fortschritt.md](abnahme-sonderfolien-v1.5.37-fortschritt.md)
