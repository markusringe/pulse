# Rollenbasierte Hilfe — Spezifikation (Phase 1 + Phase 2)

> **Feature-Freeze:** Phase 1 ist freeze-konform (UX, Metadaten, Auto-Rolle, Tests).  
> Phase 2 (`/api/help/articles`, serverseitige Filterung) erfordert explizite Freigabe.

## 1. Ziel

Hilfe-Artikel nach Zielgruppe filtern und visualisieren:

| UI-Label | Katalog-ID (`articles.json`) | Auth-Mapping (Pulse) |
|----------|------------------------------|----------------------|
| **Admin** | `admin` | `admin`, `viaSecret` |
| **Team** | `presenter` | `editor`, `teamleader`, `teammember`, `viewer` |
| **Teilnehmer** | `participant` | Öffentliche `#/help`, Join-Route |

Technische ID bleibt `presenter` (Abwärtskompatibilität); Anzeige-Label ist **Team**.

## 2. Artikel-Zuordnung (Katalog v13, 27 Artikel)

### Admin (11 Kern-Artikel)

| ID | Titel |
|----|-------|
| `tech-stack` | Software & Systemlandschaft |
| `roles-admin` | Guide: Admin |
| `admin` | Administration |
| `installation` | Installation und Betrieb |
| `ssl` | SSL-Zertifikate |
| `updates` | Automatische Updates |
| `backups` | Instanz-Backups |
| `auth-login` | Anmelden mit E-Mail-PIN |
| `related-docs` | Weiterführende Dokumentation |
| `events` | Events und Session-Decks *(auch Team)* |
| `use-cases` | Typische Szenarien *(auch Team)* |

### Team (9 Kern-Artikel)

| ID | Titel |
|----|-------|
| `getting-started` | Schnellstart in 5 Minuten |
| `roles-presenter` | Guide: Presenter/Team |
| `session-manage` | Session erstellen und verwalten |
| `polls` | Umfragen und Wortwolken |
| `picker` | Picker — große Auswahllisten |
| `interaction-control` | Interaktionssteuerung |
| `architecture` | Session-Architektur |
| `events` | Events und Session-Decks |
| `use-cases` | Typische Szenarien |

### Teilnehmer (12 Kern-Artikel)

| ID | Titel |
|----|-------|
| `welcome` | Willkommen & Einstieg |
| `roles-participant` | Guide: Teilnehmende |
| `features` | Funktionen im Überblick |
| `qa` | Live-Q&A |
| `quiz` | Quiz und Rangliste |
| `privacy` | Datenschutz in der Hilfe |
| `faq` | Häufige Fragen |
| `troubleshooting` | Fehlerbehebung |
| `glossary` | Glossar |

Mehrrollen-Artikel (`faq`, `troubleshooting`, `glossary`, …) tragen mehrere `roles`-Einträge und erhalten entsprechende Badges.

### Beispiel-Metadaten (`articles.json`)

```json
{
  "id": "polls",
  "category": "polls",
  "roles": ["presenter"],
  "title": "Umfragen und Wortwolken",
  "tags": ["poll", "wortwolke", "reveal"]
}
```

Kategorien optional mit `icon` (Emoji) für die Hub-Gruppierung.

## 3. Implementierung Phase 1 (umgesetzt)

### Module

| Datei | Aufgabe |
|-------|---------|
| `lib/helpRoles.js` | Rollen-Mapping, Badges, Gruppierung (CJS, getestet) |
| `frontend/js/helpRoles.js` | ESM-Spiegel für Browser |
| `lib/helpIndex.js` | `filterArticles` nutzt `articleMatchesHelpRole` |
| `frontend/js/help.js` | Auto-Rolle, gruppierte Hub-Liste, Badges |
| `frontend/css/help.css` | `.badge-admin`, `.badge-team`, Kategorie-Gruppen |

### Kernfunktionen

```javascript
// Auth → vorgeschlagener Rollenfilter
resolveHelpRoleFromAuth({ user, viaSecret, authEnabled, adminRoute })

// Sichtbare Filter-Buttons (Hierarchie)
getVisibleRoleFilterIds(viewerRole)

// Artikel gegen Filter (Aliase: editor → presenter)
articleMatchesHelpRole(article, filterRole)

// Hub: nach categories[] gruppieren
groupArticlesByCategory(articles, categories)

// Badges für Listeneinträge
getRoleBadgeDefs(article)
```

### Auto-Rolle

- Beim ersten Öffnen von `#/help` / `#/admin/help` (Hub, ohne Slug) wird der Rollenfilter aus Auth gesetzt.
- Manuelle Rollenwahl setzt `sessionStorage pulse:help-role-manual`.
- „Filter leeren“ entfernt manuelle Markierung und Auto-Vorauswahl.

### Bewusst **nicht** in Phase 1

- Kein `/api/help/articles`
- Kein `roleCache` Backend
- Kein Modal-Redesign (`renderHelpModal` — Hash-Routing bleibt)

## 4. Phase 2 (Backlog)

### API

```
GET /api/help/articles?role=admin|presenter|participant
```

- Server filtert Artikel-Metadaten nach Session-Rolle.
- Response-Cache pro Rolle (`roleCache`, TTL z. B. 5 min).
- **Sicherheit:** Frontend-Filter allein reicht nicht für vertrauliche Inhalte — Phase 2 für echte Zugriffskontrolle.

### Migration Phase 1 → 2

1. Backup: `frontend/help/articles.json`, `frontend/js/help.js`
2. API-Route in `server.js`, Auth-Middleware wie Admin-Routen
3. `help.js`: `loadCatalog()` optional auf API umstellen (Fallback JSON)
4. Tests: `scripts/test-help-api.js`
5. Manuell: Admin / Editor / Gast auf `#/admin/help`

## 5. CSS

```css
.badge-admin { /* rot getönt */ }
.badge-team { /* blau getönt */ }
.badge-participant { /* grün getönt */ }
.help-category-group { /* Hub-Abschnitte */ }
```

## 6. Tests

```bash
npm run test:help
```

Unit-Tests in `scripts/test-help.js`:

- `resolveHelpRoleFromAuth` für Admin, Editor, Gast
- `getVisibleRoleFilterIds` Hierarchie
- `articleMatchesHelpRole` mit Alias `editor`
- `groupArticlesByCategory` Reihenfolge
- `getRoleBadgeDefs` Mehrrollen-Artikel

### Manuelle Checkliste

- [ ] Als Admin: `#/admin/help` → Filter „Admin“, alle Buttons sichtbar
- [ ] Als Editor: Filter „Team“, kein Admin-Button
- [ ] Ohne Login: `#/help` → Filter „Teilnehmer“
- [ ] Hub: Kategorie-Gruppen mit Icons
- [ ] Artikelliste: Badges Admin/Team/Teilnehmer
- [ ] Suche + Rollenfilter kombiniert
- [ ] „Filter leeren“ setzt Auto-Rolle zurück

## 7. Wartung

- Filterlogik: **immer** `lib/helpIndex.js` + `lib/helpRoles.js` und Frontend-Spiegel synchron halten
- Nach Katalog-Änderung: `docs/hilfe.md` Version anpassen (`npm run docs:sync-version`)
- Commit-Format: `fix(help): …` oder `docs(help): …`

## 8. Zukunftsideen

- Granulare Rollen (`teamleader` vs. `teammember`)
- Kontext-sensitive Hilfe (Join vs. Present vs. Admin-SSL)
- Mehrsprachige Badge-Labels (i18n)

## 9. Commit-Vorlage

```
fix(help): rollenbasierte Auto-Filter, Badges und Kategorie-Hub

Auth leitet Rollenfilter ab; Team-Label für presenter; Katalog v13 mit Kategorie-Icons.
Tests für helpRoles; Spec docs/spec/PROMPT-HELP-ROLE-BASED-DETAILS.md.
```
