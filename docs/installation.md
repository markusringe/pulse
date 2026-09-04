# Installation — Pulse

Anleitung zum lokalen Testen und zum Produktivbetrieb. Voraussetzungen, Schnellstart per Skript, manuelle Schritte und Docker Compose.

**Stand:** Programmversion **v1.4.5** · Ist-Zustand aus dem Repository (Node ≥ 22, npm, optional Docker Compose).

---

## 1. Voraussetzungen

| Komponente | Lokal (Entwicklung) | Produktion (empfohlen) |
|---|---|---|
| **Node.js** | ≥ 22 | im Docker-Image enthalten |
| **npm** | mit Node | — |
| **Betriebssystem** | macOS, Linux, WSL | Linux-Server |
| **Docker + Compose** | optional | empfohlen (zwei App-Instanzen, Redis, nginx) |
| **Ports** | 3000 (HTTP) | 80/443 (nginx), optional 3001 (Grafana) |

Ohne Docker läuft **genau ein** Node-Prozess (`npm start`). Live-Events bleiben im Prozess (kein Redis nötig).

Mit Docker Compose starten **zwei** App-Container (`pulse`, `pulse-b`) plus Redis und nginx — WebSockets brauchen dann `ip_hash` und `REDIS_URL`.

---

## 2. Schnellstart (Installationsskript)

Im Projektverzeichnis:

```bash
chmod +x scripts/install.sh   # einmalig, falls nötig
./scripts/install.sh
```

Das Skript:

1. prüft Node ≥ 22,
2. führt `npm install` aus,
3. legt `.env` aus `.env.example` an (falls noch nicht vorhanden) und setzt ein zufälliges `ADMIN_SECRET`,
4. gibt Startbefehle aus.

**Optional:**

```bash
./scripts/install.sh --test          # danach npm test
./scripts/install.sh --docker        # Docker-Stack bauen und starten
./scripts/install.sh --docker --test # beides
```

Nach der lokalen Installation:

```bash
npm start
```

Browser: [http://localhost:3000](http://localhost:3000)

Healthcheck: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 3. Manuelle Installation (lokal)

### 3.1 Repository und Abhängigkeiten

```bash
cd /pfad/zum/pulse
npm install
npm run css:build
```

Das erzeugt `frontend/css/pulse.css` (Tailwind CSS v4, minified). Für Entwicklung mit Live-Rebuild: `npm run css:watch`.

### 3.2 Umgebung

```bash
cp .env.example .env
```

In `.env` mindestens setzen:

```env
ADMIN_SECRET=<langer-zufälliger-wert>
```

Optional **Benutzerverwaltung** (E-Mail-PIN für Administration):

```env
USER_AUTH_ENABLED=1
BOOTSTRAP_ADMIN_NAME=admin
BOOTSTRAP_ADMIN_EMAIL=admin@localhost
BOOTSTRAP_ADMIN_PASSWORD=<initiales-kennwort>
# Entwicklung ohne SMTP:
AUTH_DEV_MAILBOX=1
# Produktion:
# SMTP_HOST=smtp.example.org
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASS=...
```

Das Installationsskript `./scripts/install.sh` fragt interaktiv ab, ob die Benutzerverwaltung aktiviert werden soll.

Secret erzeugen (Beispiel):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Hinweis:** `server.js` lädt `.env` **nicht** automatisch. Variablen müssen in der Shell exportiert werden, z. B.:

```bash
set -a && source .env && set +a && npm start
```

Unter macOS/Linux kann das Installationsskript `.env` anlegen; zum Starten reicht oft:

```bash
export $(grep -v '^#' .env | xargs) && npm start
```

Für lokale Entwicklung ohne `.env` startet der Server mit Default-Pepper — **in Produktion immer `ADMIN_SECRET` setzen.**

### 3.3 Starten

```bash
npm start
```

Produktionsmodus (HTTPS-Default-Port 443, wenn Zertifikat vorhanden):

```bash
npm run start:prod
```

### 3.4 Datenverzeichnis

Beim ersten Start legt die App unter `data/` u. a. an:

- `pulse.db` — Sessions, SSL-Metadaten
- `branding.json`, `privacy.json`, `events.json`, `audit.json`
- `ssl/` — PEM-Dateien nach Zertifikatsausstellung

Pfad der Datenbank: `SQLITE_PATH` (Default `data/pulse.db` relativ zum Arbeitsverzeichnis).

### 3.5 Tests (optional)

```bash
npm test
```

Startet keinen dauerhaften Server und beendet keinen laufenden Prozess auf Port 3000.

---

## 4. Installation mit Docker Compose

Für mehrere App-Prozesse, Redis-Fanout und nginx vor der App — lokal oder auf einem Server.

### 4.0 VPS Ubuntu (Produktion)

Auf einem frischen **Ubuntu 22.04 / 24.04** VPS (als root oder mit `sudo`):

```bash
cd /opt/pulse   # nach git clone
chmod +x scripts/install-vps-ubuntu.sh scripts/seed-data.sh
sudo ./scripts/install-vps-ubuntu.sh
```

Oder **One-Liner** (Remote, ohne vorheriges Klonen):

```bash
curl -fsSL https://raw.githubusercontent.com/markusringe/pulse/main/scripts/install-vps-ubuntu.sh | sudo bash
```

Oder mit Klonen in einem Schritt:

```bash
sudo ./scripts/install-vps-ubuntu.sh --git https://github.com/markusringe/pulse.git --dir /opt/pulse
```

Das Skript installiert **Docker + Compose**, legt **`.env`** mit Zufallssecrets an, seedet **`data/`** (Branding, Datenschutz, leere Events/Audit) und startet **`docker compose up -d`**. Zugangsdaten: `INSTALL-CREDENTIALS.txt`.

| Flag | Bedeutung |
|---|---|
| `--dir PATH` | Installationsverzeichnis |
| `--git URL` | Repository klonen |
| `--expose-grafana` | UFW Port 3001 |
| `--skip-firewall` | Keine UFW-Regeln |
| `--skip-docker` | Docker nicht neu installieren |
| `--npm` | Node.js 22 + `npm install` statt Docker |
| `--json` | Zusammenfassung zusätzlich als JSON |

### 4.1 Vorbereitung

```bash
cp .env.example .env
```

In `.env` setzen:

```env
ADMIN_SECRET=<starkes-geheimnis>
GRAFANA_PASSWORD=<grafana-admin-passwort>
```

### 4.2 Start

Mit Skript:

```bash
./scripts/install.sh --docker
```

Vor dem ersten Start werden Grundeinstellungen nach `data/` kopiert (`scripts/seed-data.sh`).

Oder manuell:

```bash
docker compose build
docker compose up -d
```

### 4.3 Erreichbarkeit

| Dienst | URL / Port |
|---|---|
| Pulse (über nginx) | `http://<host>/` (Port 80) |
| Grafana | `http://<host>:3001` (User `admin`) |
| App direkt (intern) | Port 3000 nur im Compose-Netz |

Healthcheck im Container: `GET /api/health`.

### 4.4 Volumes

Compose bindet das Host-Verzeichnis **`./data`** nach **`/app/data`** in den App-Containern:

- `pulse.db` — Sessions, SSL-Metadaten (`SQLITE_PATH=/app/data/pulse.db`)
- `branding.json`, `privacy.json`, `events.json`, `audit.json`
- `ssl/` — PEM-Dateien nach Zertifikatsausstellung

Weitere Docker-Volumes: `redis-data`, `prometheus-data`, `grafana-data`.

**Backup bei Erstlogin:** Nach der ersten Anmeldung mit Installations-Kennwort erscheint `#/admin/onboarding` — dort optional eine Backup-ZIP hochladen und Bereiche gruppenweise einspielen. Laufender Betrieb: `#/admin/backups`. Bei abweichender Backup-Version führt Pulse automatisch Migrations-Skripte aus.

**Gruppen bei Wiederherstellung:** Sessions, Events, Teams, Benutzer, Branding, Datenschutz, SSL, E-Mail, Betrieb, Uploads, `.env` — entsprechend der Admin-Navigation.

**SQLite auf gemeinsamem Volume ist nicht multi-writer-sicher.** Für zwei App-Container in Produktion besser `DATABASE_URL` (PostgreSQL) setzen und Paket `pg` installieren.

### 4.5 Stoppen und Logs

```bash
docker compose logs -f pulse
docker compose down
```

---

## 5. Erste Schritte nach der Installation

1. **Startseite öffnen** — Session anlegen oder unter `#/admin/events` ein Event erstellen.
2. **Administration** — `#/admin` (Sessions), `#/admin/branding` (CI), `#/admin/privacy` (Rechtstexte).
3. **Instanz-Admin** — mit `USER_AUTH_ENABLED=1`: `#/admin/login` (E-Mail-PIN). Alternativ/zusätzlich: API mit `X-Admin-Key: <ADMIN_SECRET>`. In der UI: Branding, Datenschutz, SSL, Einstellungen, Benutzer.
4. **HTTPS** — öffentliche Domain: DNS auf den Server, Port 80 erreichbar, dann `#/admin/ssl` (Let’s Encrypt HTTP-01). Details: `README.md` Abschnitt SSL, `docs/projektdokumentation.md` Abschnitt 6.3.
5. **Event-Migration** (nur bei Alt-Daten mit `sets[]`): `npm run migrate:events`, danach Server neu starten.

---

## 6. Aktualisierung

### VPS-Update-Skript (empfohlen)

Visualisierter Ablauf mit Backup, Git-Pull, Build und Healthcheck:

```bash
cd /opt/pulse
sudo ./scripts/update-vps-ubuntu.sh
```

Remote One-Liner:

```bash
curl -fsSL https://raw.githubusercontent.com/markusringe/pulse/main/scripts/update-vps-ubuntu.sh | sudo bash
```

Optionen: `--tag v1.4.5` (festes Release), `--npm` / `--docker`, `--yes`, `--skip-backup`, `--json`.  
Erkennt automatisch Docker-Stack (Standard) oder npm-Modus.

### Lokal (Git + npm)

```bash
git pull
npm install
npm run css:build
npm test          # optional
# Server neu starten
```

### Docker (manuell)

```bash
git pull
docker compose build
docker compose up -d
```

Alternativ: In-App-Update unter `#/admin/updates` (npm-Installation mit Git-Repo).

Daten in `data/` bzw. im Volume `pulse-data` bleiben erhalten.

---

## 7. Häufige Probleme

| Symptom | Ursache / Lösung |
|---|---|
| `Error: listen EADDRINUSE :::3000` | Port belegt — anderen Prozess beenden oder `PORT=3001` setzen. |
| Admin-API antwortet 401 | `ADMIN_SECRET` prüfen oder bei Benutzerverwaltung unter `#/admin/login` anmelden. Nach `.env`-Änderung neu starten. |
| PIN kommt nicht an | `SMTP_*` in `.env` prüfen; lokal `AUTH_DEV_MAILBOX=1` und Dev-Mailbox auf der Login-Seite. |
| Live-Updates zwischen Tabs fehlen (mehrere Prozesse) | `REDIS_URL` setzen oder nur einen Prozess betreiben. |
| WebSocket bricht hinter Proxy ab | Sticky Sessions (`ip_hash` in `deploy/nginx.conf`) und WebSocket-Upgrade-Header prüfen. |
| Let’s Encrypt schlägt fehl | Port 80 von außen erreichbar; Pfad `/.well-known/acme-challenge/` nicht umleiten/blockieren. |
| Node-Version zu alt | `node -v` muss ≥ 22 sein (`engines` in `package.json`). |

Weitere Betriebsdetails: `docs/projektdokumentation.md` (Abschnitt 6), Funktionsübersicht: `README.md`.

**Dokumentations-Version:** Bei jeder Versionsänderung in `package.json` einmal `npm run docs:sync-version` ausführen — aktualisiert Hilfe-Katalog, Markdown-Doku und HTML-Fußzeilen auf dieselbe Programmversion.

---

## 8. Verwandte Dateien

| Datei | Zweck |
|---|---|
| `scripts/install.sh` | Automatisierte Installation (lokal / Docker) |
| `scripts/install-vps-ubuntu.sh` | VPS Ubuntu: Docker installieren, Stack starten, Daten seeden |
| `scripts/update-vps-ubuntu.sh` | VPS Ubuntu: Update mit Backup, Git-Pull, Build, Healthcheck |
| `scripts/seed-data.sh` | Grundeinstellungen in `data/` (nur fehlende Dateien) |
| `.env.example` | Vorlage für Umgebungsvariablen |
| `package.json` | npm-Skripte (`start`, `test`, `migrate:events`, `docs:sync-version`) |
| `Dockerfile` | App-Image (Node 22 Alpine) |
| `docker-compose.yml` | Stack mit pulse, pulse-b, redis, nginx, Prometheus, Grafana |
| `deploy/nginx.conf` | Reverse Proxy, WebSocket-Sticky |
| `docs/hilfe.md` | Benutzerhilfe als Markdown (Spiegel der In-App-Hilfe) |
