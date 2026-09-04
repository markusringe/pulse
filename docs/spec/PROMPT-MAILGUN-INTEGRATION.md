# Mailgun-Integration — Spezifikation

> Explizite Ausnahme vom Feature-Freeze (Stabilisierungszyklus).  
> Implementierung: Provider-Abstraktion, Outbox, Webhooks, Admin-Domain-UI.

## 1. Konfiguration

| Variable | Beschreibung |
|----------|--------------|
| `MAILGUN_API_KEY` | API-Key (nur Env, nie JSON) |
| `MAILGUN_DOMAIN` | Verifizierte Sending-Domain |
| `MAILGUN_API_BASE` | Default: `https://api.eu.mailgun.net` (EU) |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | HMAC für Webhooks |
| `PUBLIC_BASE_URL` | Basis für Links in Mails |

- **Produktion:** Fail-fast wenn Provider `mailgun` und Pflicht-Env fehlt.
- **Entwicklung:** Capture-Provider wenn Mailgun-Env fehlt (`AUTH_DEV_MAILBOX=1`).

## 2. Architektur

```
lib/email/
  providers/          EmailProvider (Mailgun, Capture)
  outboxStore.js      Persistente Queue
  outboxWorker.js     Versand + Backoff
  suppressionStore.js Bounce/Complaint
  mailgunWebhook.js   POST /api/webhooks/mailgun
  mailgunDomain.js    DNS-Onboarding
  emailSanitize.js    Header-Injection, Freemail-From
```

Business-Code (`emailService.js`) ruft nur Provider/Outbox — keine direkten Mailgun-HTTP-Calls.

## 3. Outbox

- Zustände: `pending` → `processing` → `sent` | `dead`
- Idempotenzschlüssel (z. B. `pin:{email}:{pin}`)
- Exponential Backoff + Jitter, max. 8 Versuche
- Worker-Interval: 30 s (`server.js`)

## 4. Domain-Onboarding (Admin `#/admin/email`)

- DNS-Records von Mailgun API (`GET /api/email/domain`)
- Verifikation anstoßen (`POST /api/email/domain/verify`, rate-limited 1/min)
- SPF/DKIM aus Mailgun; DMARC-Hinweis `p=none` zum Start
- Testmail nur an `confirmedAdminEmail`

## 5. Webhooks

- Route: `POST /api/webhooks/mailgun` (ohne Admin-Auth)
- HMAC-Signatur + Replay-Schutz (Token-Einmaligkeit, 15 min Timestamp)
- Events `failed`/`bounced`/`complained` → Suppression

## 6. Security

- Kein CR/LF in Headern
- From-Domain = verifizierte Mailgun-Domain, keine Freemail
- Test-Empfänger gehasht in Audit-Logs
- Secrets nur Env

## 7. Tests & Go/No-Go

```bash
npm run test:email-config
npm run test:mailgun
```

**Go:** Tests grün, Prod-Env gesetzt, DNS verifiziert, Webhook in Mailgun-Console registriert, Test-PIN an bestätigte Admin-Adresse.

**No-Go:** Fehlende Env in Prod, unverifizierte Domain, Webhook-Signatur schlägt fehl.

## 8. Mailgun-Console (Betrieb)

1. Domain in EU-Region anlegen
2. DNS (SPF, DKIM) setzen; DMARC optional `p=none`
3. Webhook: `https://<domain>/api/webhooks/mailgun` — Events: permanent fail, complaints
4. Env auf VPS setzen, Provider `mailgun` in Admin-UI wählen
