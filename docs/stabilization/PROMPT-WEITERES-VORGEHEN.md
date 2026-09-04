# Weiteres Vorgehen — Stabilisierung bis Produktionsfreigabe

**Stand:** Programmversion **v1.5.11** · 2026-09-04  
**Zweck:** Arbeitsgrundlage für Browser-/Mobiltests, Lasttests, Backup/Restore, Betrieb und Freigabe.  
**Feature-Freeze:** Keine neuen Endnutzerfunktionen — nur Tests, Ops, Doku.

---

## 1. Browser- und Mobiltests

### Browser-Matrix

| Browser | Plattform | Priorität |
|---------|-----------|-----------|
| Chrome | Desktop | P0 |
| Firefox | Desktop | P1 |
| Safari | Desktop (macOS) | P1 |
| Edge | Desktop | P2 |
| Safari | iOS | P0 |
| Chrome | Android | P0 |

### Automatisierbar (öffentliche Routen)

```bash
npm run acceptance:public -- --url https://pulse.ringe.us
npm run test:mobile
npm run test:accessibility
npm run smoke:remote -- --url https://pulse.ringe.us --expect-version 1.5.11
```

### Manuell (Pflichtpfad 19 Schritte)

Siehe `docs/stabilization/smoke-checklist.md` — Abschnitt **Browser-Abnahme nach Update**.

Besonders prüfen:

- Inkognito: Login von Null, Join, Hilfe-Artikel
- Update-Szenario: Tab offen lassen → Deploy → normaler Reload (F5) → keine 404 auf `/js`, `/css`, `/i18n`, `/help`
- Mobil 320 / 375 / 430 px: kein horizontaler Scroll, Admin über Menü

### Ergebnis dokumentieren

Eintrag in `docs/stabilization/smoke-checklist.md` und ggf. `docs/stabilization/acceptance-report-YYYY-MM-DD.md`.

---

## 2. Lasttests

### Szenarien

| ID | Teilnehmende | Dauer | Gate p95 Join | Gate p95 Vote | Gate Fehlerrate |
|----|--------------|-------|---------------|---------------|-----------------|
| L-100 | 100 | 30 min | ≤ 800 ms | ≤ 500 ms | ≤ 1 % |
| L-300 | 300 | 45 min | ≤ 800 ms | ≤ 500 ms | ≤ 1 % |
| L-500 | 500 | 60 min (optional) | ≤ 1000 ms | ≤ 600 ms | ≤ 1 % |
| L-DUR | 200 | 4 h | ≤ 800 ms | ≤ 500 ms | ≤ 1 % |

**Zielumgebung:** isolierte Instanz (`npm run load:scenarios` startet lokalen Server). **Nicht** gegen Prod ohne `--allow-remote` und Wartungsfenster.

### Ausführung

```bash
# Alle Szenarien (Burst + Dauer — Dauer standardmäßig verkürzt in CI)
npm run load:scenarios

# Einzeln
node scripts/load-test.js --participants=100 --report=docs/stabilization/load-report-100.json
node scripts/load-test.js --participants=300 --duration-minutes=45 --report=docs/stabilization/load-report-300.json
node scripts/load-test.js --participants=200 --duration-minutes=240 --report=docs/stabilization/load-report-dur.json
```

### Metriken (pro Lauf)

- Join/Vote p50/p95/p99
- Fehlerrate, WS-Abbrüche
- `eventLoopLagMs`, `rssMb`, `heapUsedMb`, `dbLatencyMs`
- Readiness während/ nach Lauf

Referenz-Baselines: `load-baseline-100.json`, `load-baseline-300.json`.

---

## 3. Backup- und Restore

### Ablauf

```bash
npm run test:backup                    # Unit (ZIP, Checksum, selektives Restore)
npm run backup:restore-drill           # Isolierter Voll-Restore-Drill
```

### Prod (VPS)

1. Admin → Backup erstellen oder `backups/vps-update-*` prüfen
2. ZIP + Sidecar-JSON herunterladen
3. Restore **nur** auf Testinstanz / isoliertem Verzeichnis
4. Hash/Größe `pulse.db` vor/nach vergleichen

### Intervalle

- Vor jedem Update (Updater v1.1)
- Wöchentlich geplant (Admin-Backup oder Cron)
- Retention: `backup-config.json` → `retentionDays`

---

## 4. Betriebskonzept

| Thema | Dokument / Skript |
|-------|-------------------|
| Update + Rollback | `scripts/update-vps-ubuntu.sh`, `scripts/rollback-drill.sh` |
| Monitoring | `/api/health`, `/api/health/ready`, `/metrics`, Grafana |
| Incidents | `docs/stabilization/operations-runbook.md` |
| Alerts | `docs/stabilization/release-gates.md` |

---

## 5. Produktionsfreigabe

Checkliste: `docs/stabilization/prod-freigabe-checkliste.md`

**No-Go:** Admin-Login Prod nicht reproduzierbar, Restore > 15 min, L-300 fehlgeschlagen, Rollback-Drill offen.

---

## 6. Nächste Schritte nach Freigabe

1. Erste echte Veranstaltung als Stabilitätstest (Beobachtung, kein Feature-Deploy)
2. Retrospektive: Logs, Metriken, Teilnehmer-Feedback
3. Optimierung nur als Bugfix/Performance
4. Feature-Entwicklung erst nach erfolgreicher Lastbewährung (300+ TN)

---

## Orchestrierung

```bash
npm run acceptance:stabilization
```

Führt aus: Unit-Suite-Auszug, öffentliche Browser-Abnahme, Backup-Drill, Load L-100/L-300 (Burst), Remote-Smoke.
