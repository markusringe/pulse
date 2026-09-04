/**
 * Event-Katalog (Metadaten) und Session-Deck (Folien).
 * Routing: #/admin/events, #/admin/events/new, #/admin/events/:id, #/admin/sessions/:code
 */

import { api } from "./websocket.js";
import { t, applyDom, onLang, i18nReady } from "./i18n.js";
import { syncAdminNav } from "./adminNav.js";
import { canCreateEvents, isAdminUser, isUserAuthEnabled } from "./authClient.js";
import { typeIcon, typeLabel } from "./deck.js";
import { scaleEventImageFile, mountCountdown, remainingMs } from "./eventCountdown.js";
import {
  mountCategoryEditor,
  collectCategoriesFromHost,
  optionCategorySelectHtml,
  refreshPickerPreview,
} from "./pickerEditor.js";

/** Teams für Teamauswahl (Create/Detail). */
let teamPickerCache = [];
/** Events ohne Team — nur für Admin-Migration. */
let migrationOrphans = [];

/** Deutsche Nottexte, falls das Wörterbuch noch die alte, gecachte Fassung hat. */
const DE = {
  "admin.hubTitle": "Administration",
  "events.title": "Events",
  "events.listIntro": "Veranstaltungen mit Join-Code. Jedes Event gehört genau einem Team — alle Teammitglieder können das Deck bearbeiten.",
  "events.team.label": "Team",
  "events.team.pick": "Team auswählen",
  "events.team.pickPlaceholder": "— Team wählen —",
  "events.team.hint": "Dieses Event gehört zum gewählten Team. Alle berechtigten Mitglieder dieses Teams können Deck und Folien bearbeiten und präsentieren.",
  "events.team.none": "Sie gehören noch keinem Team an. Bitte wenden Sie sich an einen Administrator oder Teamleiter.",
  "events.team.gotoTeams": "Teams verwalten",
  "events.team.autoSelected": "Ihr Team wurde automatisch vorausgewählt.",
  "events.team.required": "Bitte wählen Sie ein Team aus.",
  "events.team.changeConfirm": "Das Team ändert den berechtigten Personenkreis. Fortfahren?",
  "events.team.migrationRequired": "Bitte ordnen Sie dieses Event einem Team zu.",
  "events.team.assignBanner": "Dieses Event hat noch kein Team — ohne Zuordnung können Teammitglieder nicht präsentieren.",
  "events.team.migrationBanner": "Events ohne Team-Zuordnung",
  "events.col.team": "Team",
  "events.accessDenied": "Sie gehören nicht zum Team dieses Events. Bitte wenden Sie sich an den Teamleiter oder einen Administrator.",
  "events.new": "Neues Event anlegen",
  "events.create": "Event anlegen",
  "events.save": "Speichern",
  "events.cancel": "Abbrechen",
  "events.delete": "Event löschen",
  "events.deleteConfirm": "Event unwiderruflich löschen? Nur bei Status geplant oder archiviert möglich.",
  "events.loading": "Lade Events…",
  "events.empty": "Noch keine Events.",
  "events.error.generic": "Aktion fehlgeschlagen.",
  "events.copied": "Kopiert",
  "events.join": "Teilnehmen",
  "events.results": "Ergebnisse ansehen",
  "events.joinClosed": "Join noch nicht aktiv",
  "events.copyLink": "Link kopieren",
  "events.copyInvite": "Einladungstext kopieren",
  "events.qrDownload": "QR-Code als PNG",
  "events.preview": "Startseiten-Vorschau (Join)",
  "events.when": "Datum",
  "events.home.upcoming": "Aktuelle Events",
  "events.home.past": "Vergangene Events",
  "events.status.planned": "Geplant",
  "events.status.active": "Aktiv",
  "events.status.ended": "Abgeschlossen",
  "events.status.archived": "Archiviert",
  "events.filter.status": "Status",
  "events.filter.all": "Alle",
  "events.col.title": "Titel",
  "events.col.status": "Status",
  "events.col.date": "Datum",
  "events.col.session": "Session",
  "events.col.slides": "Folien",
  "events.col.participants": "Teilnehmer",
  "events.col.votes": "Stimmen",
  "events.col.questions": "Fragen",
  "events.field.title": "Titel",
  "events.field.description": "Beschreibung",
  "events.field.start": "Startdatum",
  "events.field.end": "Enddatum",
  "events.field.startTime": "Startuhrzeit (Countdown)",
  "events.field.startTimeHint": "Optional. Countdown auf Startseite und Leinwand. Leer = sofort.",
  "events.field.image": "Event-Grafik",
  "events.field.imageHint": "PNG, JPEG, WebP oder SVG · max. 2 MB · empfohlen 1920×1080",
  "events.field.imageDrop": "Grafik hierher ziehen oder Datei wählen",
  "events.field.imageRemove": "Grafik entfernen",
  "events.field.imageChange": "Grafik ändern",
  "events.col.image": "Grafik",
  "events.col.time": "Uhrzeit",
  "events.field.category": "Kategorie",
  "events.field.room": "Raum",
  "events.field.status": "Status",
  "events.activateNow": "Event sofort aktivieren",
  "events.copyFrom": "Folien aus bestehender Session kopieren",
  "events.copyFromNone": "Leeres Deck (Willkommensfolie)",
  "events.joinOptions": "Teilnahme (QR, Link, Text)",
  "events.stats.title": "Statistiken",
  "events.stats.empty": "Noch keine Teilnahmen.",
  "events.stats.csv": "Statistiken als CSV",
  "events.branding.title": "Event-Branding",
  "events.branding.hint": "Leere Felder übernehmen das Instanz-Branding.",
  "events.branding.primary": "Primärfarbe",
  "events.branding.secondary": "Sekundärfarbe",
  "events.branding.footer": "Footer-Text",
  "events.branding.footerLinks": "Footer-Links",
  "events.branding.logo": "Logo (optional)",
  "events.openDeck": "Folien der Session bearbeiten",
  "events.openPresent": "Präsentieren",
  "events.openStage": "Leinwand (Countdown)",
  "events.sessionMissing": "Session nicht gefunden.",
  "events.copySlides": "Folien kopieren",
  "events.copy.source": "Quell-Session",
  "events.copy.mode": "Was kopieren?",
  "events.copy.all": "Alle Folien",
  "events.copy.selected": "Einzelne Folien auswählen",
  "events.copy.noTarget": "Keine andere Session vorhanden",
  "events.copy.run": "Kopieren",
  "events.copy.done": "Folien kopiert.",
  "events.slides.title": "Deck (Folien)",
  "events.slides.count": "{count} Folien",
  "events.slides.add": "Neue Folie hinzufügen",
  "events.slides.untitled": "Ohne Titel",
  "events.slides.up": "Nach oben",
  "events.slides.down": "Nach unten",
  "events.slides.dup": "Duplizieren",
  "events.slides.del": "Löschen",
  "events.slides.loading": "Lade Folien…",
  "events.slides.delConfirm": "Folie unwiderruflich löschen? Eine Wiederherstellung ist nicht möglich.",
  "events.slides.edit": "Bearbeiten",
  "events.slides.editTitle": "Folie bearbeiten",
  "events.slides.save": "Speichern",
  "events.slides.discard": "Änderungen verwerfen?",
  "events.slides.saved": "Folie gespeichert",
  "events.slides.deleted": "Folie gelöscht",
  "events.slides.saveFail": "Speichern fehlgeschlagen. Bitte erneut versuchen.",
  "events.slides.questionRequired": "Fragetext ist erforderlich",
  "events.slides.optionsRange": "2–6 Optionen erforderlich",
  "events.slides.quizCorrect": "Mindestens eine korrekte Antwort wählen",
  "events.slides.chars": "{n} / {max} Zeichen",
  "events.slides.addOption": "Option hinzufügen",
  "events.slides.removeOption": "Entfernen",
  "events.slides.hideResults": "Ergebnisse verbergen bis Reveal",
  "events.slides.planned": "Geplante Minuten",
  "events.slides.notes": "Presenter-Notizen",
  "events.slides.scale": "Skala",
  "events.slides.style": "Darstellung",
  "events.slides.duration": "Timer (Sekunden)",
  "events.slides.moderated": "Moderation aktiv",
  "events.slides.qaTimer": "Countdown aktivieren",
  "events.slides.qaLimit": "Countdown-Dauer (Sekunden)",
  "events.slides.correct": "Korrekt",
  "events.slides.slotLabel": "Label",
  "events.slides.slotIso": "Datum/Zeit (ISO)",
  "events.slides.imageAlt": "Beschriftung / Alt-Text",
  "events.slides.imageUpload": "Bild wählen",
  "events.slides.undo": "Rückgängig",
  "events.slides.bulkBar": "{count} ausgewählt",
  "events.slides.bulkDup": "Duplizieren",
  "events.slides.bulkDel": "Löschen",
  "events.slides.bulkDelConfirm": "{count} Folien wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  "events.slides.select": "Auswählen",
  "events.slides.hideResultsBulk": "Ergebnisse verbergen",
  "events.slides.inlineSave": "Speichern",
  "events.slides.inlineCancel": "Abbrechen",
  "events.slides.fullEdit": "Alle Felder…",
  "events.slides.optionsCsv": "Antworten (kommagetrennt)",
  "events.slides.saving": "Speichern…",
  "events.slides.autosaved": "Automatisch gespeichert",
  "events.slides.bulkProps": "Eigenschaften…",
  "events.slides.bulkPropsTitle": "Ausgewählte Folien bearbeiten",
  "events.slides.bulkResults": "Ergebnisse",
  "events.slides.bulkResultsKeep": "Nicht ändern",
  "events.slides.bulkResultsHide": "Verbergen bis Reveal",
  "events.slides.bulkResultsShow": "Sofort sichtbar",
  "events.slides.bulkApply": "Auf Auswahl anwenden",
  "events.slides.bulkHint": "Leere Felder bleiben unverändert.",
  "home.type": "Fragetyp",
  "home.question": "Frage",
  "home.options": "Antworten (2–6)",
  "type.choice": "Multiple Choice",
  "type.wordcloud": "Wortwolke",
  "type.qa": "Live-Q&A",
  "type.quiz": "Quiz",
  "type.rating": "Bewertungsskala",
  "type.ranking": "Ranking",
  "type.points100": "100 Punkte",
  "type.openText": "Freitext",
  "type.imageChoice": "Bildwahl",
  "type.datetime": "Terminfindung",
  "type.picker": "Picker",
};

function tx(key, vars = {}) {
  const got = t(key, vars);
  if (got && got !== key) return got;
  let s = DE[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

let hooks = {
  drawQrCode: () => {},
  joinUrl: (code) => `#/join/${code}`,
  formatCode: (code) => String(code || "").padStart(6, "0"),
};

const SLIDE_TYPES = [
  ["choice", "type.choice"],
  ["wordcloud", "type.wordcloud"],
  ["qa", "type.qa"],
  ["quiz", "type.quiz"],
  ["rating_scale", "type.rating"],
  ["ranking", "type.ranking"],
  ["points100", "type.points100"],
  ["open_text", "type.openText"],
  ["image_choice", "type.imageChoice"],
  ["datetime", "type.datetime"],
  ["picker", "type.picker"],
];

/** Einfache Typen: Inline-Schnellbearbeitung statt Modal. */
const INLINE_EDIT_TYPES = new Set(["choice", "rating_scale", "wordcloud", "open_text", "qa"]);

/** Typen mit Reveal-Schalter (Ergebnisse verbergen). */
const HIDEABLE_TYPES = new Set([
  "choice",
  "rating_scale",
  "wordcloud",
  "ranking",
  "points100",
  "open_text",
  "image_choice",
  "datetime",
  "picker",
]);

/** Interaktive Folientypen — gemeinsame Ablauf-/Timer-Konfiguration. */
const INTERACTIVE_TYPES = new Set([
  "choice",
  "wordcloud",
  "qa",
  "quiz",
  "rating_scale",
  "ranking",
  "points100",
  "open_text",
  "image_choice",
  "datetime",
  "picker",
]);

const IX_TIMER_PRESETS = [30, 60, 90, 120, 180, 300];

function isInlineEditable(type) {
  return INLINE_EDIT_TYPES.has(type);
}
const STATUS_KEYS = {
  planned: "events.status.planned",
  active: "events.status.active",
  ended: "events.status.ended",
  archived: "events.status.archived",
};

let adminCache = { events: [], event: null, sessions: [] };
let dragSlideId = "";
let listFilter = {};
/** Verhindert, dass ein älterer Render eine neuere Seite überschreibt. */
let pageSeq = 0;
/** Laufender Render — route() und bootUi() teilen sich einen Aufruf pro Hash. */
let eventsShowTask = null;
/** Tab-Schließen warnen bei ungespeicherten Folien-Änderungen. */
let deckDirtyGuard = false;

function setDeckDirtyGuard(on) {
  deckDirtyGuard = Boolean(on);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!deckDirtyGuard) return;
    e.preventDefault();
    e.returnValue = "";
  });
}
/** Sprachwechsel auf der Startseite — debounced, kein sofortiger Full-Rebuild. */
let homeLangReloadTimer = 0;

export function bindEvents(options = {}) {
  hooks = { ...hooks, ...options };
  onLang(() => {
    const hash = location.hash.replace(/^#/, "") || "/";
    if (hash === "/" || hash === "") {
      clearTimeout(homeLangReloadTimer);
      homeLangReloadTimer = window.setTimeout(() => {
        const box = document.getElementById("home-events");
        if (box) delete box.dataset.eventsReady;
        scheduleLoadHomeEvents();
      }, 150);
    }
    if (isEventsHash(hash)) {
      showEventsPage();
      syncAdminNav("events", hash);
    }
  });
}

export function isEventsHash(hash) {
  return /^\/admin\/events(?:\/|$)/.test(hash) || /^\/admin\/sessions\/\d{6}/.test(hash);
}

export function isLegacyEventJoinHash(hash) {
  return /^\/event\/[^/]+/.test(hash);
}

export async function showEventsPage() {
  const root = document.getElementById("events-root");
  if (!root) return;
  const hash = location.hash.replace(/^#/, "") || "/";
  if (!isEventsHash(hash)) return;

  /* route() und bootUi() rufen parallel auf — nicht zweimal pageSeq erhöhen. */
  if (eventsShowTask && eventsShowTask.hash === hash) {
    return eventsShowTask.promise;
  }

  const seq = ++pageSeq;
  if (!root.dataset.eventsPainted) {
    root.innerHTML = `<p class="muted">${esc(tx("events.loading"))}</p>`;
  }

  const promise = showEventsPageInner(root, seq, hash).finally(() => {
    if (eventsShowTask?.promise === promise) eventsShowTask = null;
  });
  eventsShowTask = { hash, promise };
  return promise;
}

/** Eigentliche Event-Seiten-Logik (ein Aufruf pro Hash, siehe eventsShowTask). */
async function showEventsPageInner(root, seq, hash) {
  try {
    await i18nReady;
    if (seq !== pageSeq) return;
    applyDom(document.getElementById("view-events") || root);
    const parsed = parseAdminHash();
    if (!parsed) {
      /* Hash-Zwischenzustand — kurz erneut versuchen statt bei „Lade Events…“ hängen. */
      await new Promise((r) => setTimeout(r, 0));
      if (seq !== pageSeq) return;
      if (isEventsHash(location.hash.replace(/^#/, "") || "/")) {
        void showEventsPage();
      }
      return;
    }
    if (parsed.page === "legacyJoin") {
      await redirectLegacyEventJoin(parsed.eventId);
      return;
    }
    if (parsed.page === "set") {
      const code = await sessionCodeForEvent(parsed.eventId);
      if (seq !== pageSeq) return;
      location.hash = code ? `#/admin/sessions/${code}` : `#/admin/events/${parsed.eventId}`;
      return;
    }
    if (parsed.page === "list") {
      await renderList(root, seq);
      return;
    }
    if (parsed.page === "new") {
      if (!canCreateEvents()) {
        location.hash = "#/admin/events";
        return;
      }
      if (seq !== pageSeq) return;
      await renderCreate(root);
      if (seq === pageSeq) root.dataset.eventsPainted = "1";
      return;
    }
    if (parsed.page === "session") {
      await renderSessionDeck(root, parsed.code, seq);
      if (seq === pageSeq) {
        root.dataset.eventsPainted = "1";
        syncAdminNav("events", hash);
      }
      return;
    }
    if (seq !== pageSeq) return;
    await renderDetail(root, parsed.eventId);
    if (seq === pageSeq) {
      root.dataset.eventsPainted = "1";
      syncAdminNav("events", hash);
    }
  } catch (err) {
    if (seq !== pageSeq) return;
    console.error("[events]", err);
    root.innerHTML = `<p class="muted">${esc(err && err.message ? err.message : tx("events.error.generic"))}</p>
      <p><a href="#/admin/events">${esc(tx("events.title"))}</a></p>`;
    root.dataset.eventsPainted = "1";
  }
}

/** Max. vergangene Events auf der Startseite (zusätzlich zur Server-Begrenzung). */
const HOME_PAST_LIMIT = 12;

/** Laufende Startseiten-Aktualisierung — ältere Aufrufe verwerfen (Boot ruft zweimal auf). */
let homeEventsSeq = 0;

/** Countdown-Overlay auf der Startseite (nächstes Event mit Startuhrzeit). */
let homeCountdownCtl = null;

/** Gemeinsame API-Anfrage, wenn loadHomeEvents parallel startet. */
let homeEventsFetch = null;

/** Verzögerter Start der Event-Liste — Admin-Klick soll nicht warten müssen. */
let homeEventsIdleHandle = null;

/** Laufende Event-Liste/QR abbrechen (z. B. beim Wechsel in den Adminbereich). */
export function cancelHomeEventsWork() {
  homeEventsSeq += 1;
  homeCountdownCtl?.stop();
  homeCountdownCtl = null;
  const hero = document.getElementById("home-event-hero");
  const box = document.getElementById("home-events");
  if (hero) hero.hidden = true;
  if (box) delete box.dataset.eventsReady;
  if (homeEventsIdleHandle != null) {
    if (typeof cancelIdleCallback === "function") cancelIdleCallback(homeEventsIdleHandle);
    else clearTimeout(homeEventsIdleHandle);
    homeEventsIdleHandle = null;
  }
}

/** Event-Karten erst laden, wenn der Browser Luft hat — Startseite bleibt bedienbar. */
export function scheduleLoadHomeEvents() {
  const box = document.getElementById("home-events");
  if (!box) return;
  /* Bereits geplant oder gerendert — kein erneutes Abbrechen (verhindert Doppelaufruf aus route + bootUi). */
  if (homeEventsIdleHandle != null || box.dataset.eventsReady === "1") return;
  const run = () => {
    homeEventsIdleHandle = null;
    void loadHomeEvents();
  };
  if (typeof requestIdleCallback === "function") {
    homeEventsIdleHandle = requestIdleCallback(run, { timeout: 600 });
  } else {
    homeEventsIdleHandle = setTimeout(run, 0);
  }
}

/**
 * QR-Codes erst zeichnen, wenn „Einladung / QR“ geöffnet wird — spart Main-Thread beim ersten Paint.
 * @param {HTMLElement} root
 */
function bindHomeEventQrLazy(root) {
  root.querySelectorAll("details.event-card-details").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      const canvas = details.querySelector("[data-qr]");
      if (!canvas || canvas.dataset.qrDrawn === "1") return;
      canvas.dataset.qrDrawn = "1";
      hooks.drawQrCode(canvas, canvas.getAttribute("data-url") || "");
    });
  });
}

/**
 * Nächstes Event mit aktivem Countdown (früheste startTime in der Zukunft).
 * @param {object[]} upcoming
 */
function pickCountdownEvent(upcoming) {
  let best = null;
  let bestMs = Infinity;
  for (const ev of upcoming || []) {
    if (!ev?.startTime || !ev.countdownActive) continue;
    const ms = remainingMs(ev.startTime);
    if (ms <= 0) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = ev;
    }
  }
  return best;
}

/**
 * Countdown-Hero auf der Startseite — gleiche UI wie auf der Leinwand.
 * @param {object[]} upcoming
 * @param {number} seq
 */
function syncHomeEventCountdown(upcoming, seq) {
  const hero = document.getElementById("home-event-hero");
  const host = document.getElementById("home-event-countdown");
  if (!hero || !host) return;

  homeCountdownCtl?.stop();
  homeCountdownCtl = null;

  const ev = pickCountdownEvent(upcoming);
  if (!ev || seq !== homeEventsSeq) {
    hero.hidden = true;
    host.innerHTML = "";
    return;
  }

  hero.hidden = false;
  homeCountdownCtl = mountCountdown(
    host,
    {
      title: ev.title || "",
      startTime: ev.startTime,
      eventImage: ev.eventImage || "",
    },
    {
      onEnded: () => {
        if (seq !== homeEventsSeq) return;
        void loadHomeEvents();
      },
    }
  );
}

export async function loadHomeEvents() {
  await i18nReady;
  const box = document.getElementById("home-events");
  if (!box) return;
  const seq = ++homeEventsSeq;

  try {
    if (!homeEventsFetch) {
      homeEventsFetch = api.eventsPublic().finally(() => {
        homeEventsFetch = null;
      });
    }
    const data = await homeEventsFetch;
    if (seq !== homeEventsSeq) return;

    const upcoming = data?.upcoming || [];
    const past = (data?.past || []).slice(0, HOME_PAST_LIMIT);
    syncHomeEventCountdown(upcoming, seq);
    if (!upcoming.length && !past.length) {
      box.innerHTML = "";
      box.hidden = true;
      box.dataset.eventsReady = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = `
    ${upcoming.length ? `<h2 class="home-events-title">${esc(tx("events.home.upcoming"))}</h2>` : ""}
    ${upcoming.map((ev) => homeCardHtml(ev)).join("")}
    ${past.length ? `<h2 class="home-events-title">${esc(tx("events.home.past"))}</h2>` : ""}
    ${past.map((ev) => homeCardHtml(ev)).join("")}
  `;
    box.dataset.eventsReady = "1";
    bindHomeEventQrLazy(box);
    box.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => copyText(btn.getAttribute("data-copy") || "", btn));
    });
    box.querySelectorAll("[data-dl-qr]").forEach((btn) => {
      btn.addEventListener("click", () => downloadQr(btn.getAttribute("data-canvas"), btn.getAttribute("data-name")));
    });
  } catch (err) {
    if (seq !== homeEventsSeq) return;
    console.error("[home-events]", err);
    syncHomeEventCountdown([], seq);
    box.hidden = true;
    box.dataset.eventsReady = "";
  }
}

function homeCardHtml(ev) {
  const code = ev.sessionCode || ev.joinCode;
  const joinUrl = ev.joinUrl || hooks.joinUrl(code);
  const canJoin = ev.joinEnabled;
  const results = ev.resultsOnly;
  const actionLabel = results ? tx("events.results") : tx("events.join");
  const actionHref = `#/join/${esc(code)}`;
  const canvasId = `home-qr-${esc(ev.id)}`;
  const img = ev.eventImage
    ? `<figure class="event-card-media"><img src="${esc(ev.eventImage)}" alt="" loading="lazy" decoding="async" /></figure>`
    : `<figure class="event-card-media event-card-media--placeholder" aria-hidden="true"></figure>`;
  return `<article class="event-card panel pulse-event-card pulse-card">
    ${img}
    <header class="event-card-head">
      <h3 class="pulse-event-card__title">${esc(ev.title)}</h3>
      <span class="event-status event-status-${esc(ev.status)}">${esc(statusLabel(ev.status))}</span>
    </header>
    ${ev.description ? `<p class="pulse-muted event-card-desc">${esc(ev.description)}</p>` : ""}
    <p class="event-card-when"><span class="event-card-when-label">${esc(tx("events.when"))}</span> ${esc(formatDate(ev.startAt))}${ev.endAt && ev.endAt !== ev.startAt ? ` – ${esc(formatDate(ev.endAt))}` : ""}</p>
    <p class="event-code" aria-label="Session-Code">${esc(hooks.formatCode(code))}</p>
    <div class="home-actions event-card-actions">
      ${canJoin || results ? `<a class="btn primary pulse-btn-primary event-card-join" href="${actionHref}">${esc(actionLabel)}</a>` : `<span class="pulse-muted">${esc(tx("events.joinClosed"))}</span>`}
    </div>
    <details class="event-card-details">
      <summary>${esc(tx("events.copyInvite"))} / QR</summary>
      <div class="event-card-details-body">
        <canvas id="${canvasId}" class="qr event-qr" width="160" height="160" data-qr data-url="${esc(joinUrl)}" aria-label="QR-Code"></canvas>
        <p class="event-join-link"><a href="${esc(joinUrl)}">${esc(joinUrl)}</a></p>
        <pre class="event-invite">${esc(ev.copyText || "")}</pre>
        <div class="event-card-secondary-actions">
          <button type="button" class="btn ghost pulse-btn-ghost" data-copy="${esc(joinUrl)}">${esc(tx("events.copyLink"))}</button>
          <button type="button" class="btn ghost pulse-btn-ghost" data-copy="${esc(ev.copyText || "")}">${esc(tx("events.copyInvite"))}</button>
          <button type="button" class="btn ghost pulse-btn-ghost" data-dl-qr data-canvas="${canvasId}" data-name="event-${esc(code)}.png">${esc(tx("events.qrDownload"))}</button>
        </div>
      </div>
    </details>
  </article>`;
}

function parseAdminHash() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const legacy = hash.match(/^\/event\/([^/]+)/);
  if (legacy) return { page: "legacyJoin", eventId: decodeURIComponent(legacy[1]) };
  const sess = hash.match(/^\/admin\/sessions\/(\d{6})/);
  if (sess) return { page: "session", code: sess[1] };
  const m = hash.match(/^\/admin\/events(?:\/(.*))?$/);
  if (!m) return null;
  const rest = (m[1] || "").replace(/\/$/, "");
  if (!rest) return { page: "list" };
  if (rest === "new") return { page: "new" };
  const parts = rest.split("/");
  /* Alte Set-URLs: nur noch Umleitung auf das Session-Deck. */
  if (parts[1] === "sets" && parts[2]) return { page: "set", eventId: parts[0], setId: parts[2] };
  return { page: "detail", eventId: parts[0] };
}

async function sessionCodeForEvent(eventId) {
  const result = await api.getEvent(eventId);
  const ev = result?.data?.event;
  return ev?.sessionCode || ev?.joinCode || "";
}

/** Alte #/event/:id-Links auf die Session-Join-Route legen. */
export async function redirectLegacyEventJoin(eventId) {
  const id = eventId || parseAdminHash()?.eventId;
  const code = id ? await sessionCodeForEvent(id) : "";
  location.hash = code ? `#/join/${code}` : "#/";
}

function statusLabel(status) {
  return tx(STATUS_KEYS[status] || "events.status.planned");
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function todayInput() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorText(result) {
  return result?.data?.error || tx("events.error.generic");
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = tx("events.copied");
      setTimeout(() => {
        btn.textContent = prev;
      }, 1400);
    }
  } catch {
    /* Clipboard kann in unsicheren Kontexten fehlen */
  }
}

function downloadQr(canvasId, name) {
  const canvas = document.getElementById(canvasId);
  if (!canvas?.toDataURL) return;
  if (canvas.dataset.qrDrawn !== "1") {
    const url = canvas.getAttribute("data-url") || "";
    if (url) {
      canvas.dataset.qrDrawn = "1";
      hooks.drawQrCode(canvas, url);
    }
  }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = name || "qr.png";
  a.click();
}

async function fetchAdminEventRows() {
  const q = new URLSearchParams();
  if (listFilter?.status) q.set("status", String(listFilter.status));
  const suffix = q.toString() ? `?${q}` : "";
  const headers = { Accept: "application/json" };
  if (api.adminKey) headers["X-Admin-Key"] = api.adminKey;
  const res = await fetch(`/api/events/admin${suffix}`, { headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!Array.isArray(data.events)) throw new Error(tx("events.error.generic"));
  migrationOrphans = Array.isArray(data.migration?.needsTeamAssignment) ? data.migration.needsTeamAssignment : [];
  return data.events;
}

async function renderList(root, seq = pageSeq) {
  if (seq !== pageSeq) return;
  root.innerHTML = `<p class="muted">${esc(tx("events.loading"))}</p>`;
  let events = [];
  try {
    events = await fetchAdminEventRows();
  } catch (err) {
    if (seq !== pageSeq) return;
    console.error("[events-list]", err);
    root.innerHTML = `<p class="muted">${esc(err.message || tx("events.error.generic"))}</p>
      <p><a class="btn ghost" href="#/admin/events/new">${esc(tx("events.new"))}</a></p>`;
    root.dataset.eventsPainted = "1";
    return;
  }
  if (seq !== pageSeq) return;
  adminCache.events = events;
  const newBtn = canCreateEvents()
    ? `<a class="btn primary pulse-btn-primary" href="#/admin/events/new">${esc(tx("events.new"))}</a>`
    : "";
  const col = {
    image: tx("events.col.image"),
    title: tx("events.col.title"),
    status: tx("events.col.status"),
    date: tx("events.col.date"),
    time: tx("events.col.time"),
    session: tx("events.col.session"),
    team: tx("events.col.team"),
    slides: tx("events.col.slides"),
    participants: tx("events.col.participants"),
    votes: tx("events.col.votes"),
    questions: tx("events.col.questions"),
  };
  root.innerHTML = `
    <header class="admin-page-head events-head">
      <div>
        <p class="eyebrow">${esc(tx("admin.hubTitle"))}</p>
        <h1>${esc(tx("events.title"))}</h1>
      </div>
      ${newBtn}
    </header>
    <p class="muted">${esc(tx("events.listIntro"))}</p>
    ${
      migrationOrphans.length && (isAdminUser() || canCreateEvents())
        ? `<section class="panel event-migration-banner" role="alert">
            <h2>${esc(tx("events.team.migrationBanner"))} (${migrationOrphans.length})</h2>
            <ul class="event-migration-list">
              ${migrationOrphans.map((o) => `<li><a href="#/admin/events/${esc(o.id)}">${esc(o.title)}</a> · ${esc(hooks.formatCode(o.sessionCode))}</li>`).join("")}
            </ul>
          </section>`
        : ""
    }
    <div class="events-filters">
      <label class="field"><span>${esc(tx("events.filter.status"))}</span>
        <select id="events-filter-status">
          <option value="">${esc(tx("events.filter.all"))}</option>
          <option value="planned">${esc(statusLabel("planned"))}</option>
          <option value="active">${esc(statusLabel("active"))}</option>
          <option value="ended">${esc(statusLabel("ended"))}</option>
          <option value="archived">${esc(statusLabel("archived"))}</option>
        </select>
      </label>
    </div>
    <div class="table-wrap table-wrap--responsive">
      <table class="events-table">
        <thead>
          <tr>
            <th>${esc(tx("events.col.image"))}</th>
            <th>${esc(tx("events.col.title"))}</th>
            <th>${esc(tx("events.col.status"))}</th>
            <th>${esc(tx("events.col.date"))}</th>
            <th>${esc(tx("events.col.time"))}</th>
            <th>${esc(tx("events.col.team"))}</th>
            <th>${esc(tx("events.col.session"))}</th>
            <th>${esc(tx("events.col.slides"))}</th>
            <th>${esc(tx("events.col.participants"))}</th>
            <th>${esc(tx("events.col.votes"))}</th>
            <th>${esc(tx("events.col.questions"))}</th>
          </tr>
        </thead>
        <tbody>
          ${
            events.length
              ? events
                  .map((ev) => {
                    const st = ev.stats || {};
                    const code = ev.sessionCode || ev.joinCode;
                    const thumb = ev.hasEventImage
                      ? `<span class="event-thumb-ph" title="Grafik hinterlegt">▣</span>`
                      : `<span class="event-thumb-ph">—</span>`;
                    const timeLabel = ev.startTime
                      ? esc(new Date(ev.startTime).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }))
                      : "—";
                    return `<tr>
                      <td data-label="${esc(col.image)}">${thumb}</td>
                      <td data-label="${esc(col.title)}"><a href="#/admin/events/${esc(ev.id)}">${esc(ev.title)}</a></td>
                      <td data-label="${esc(col.status)}"><span class="event-status event-status-${esc(ev.status)}">${esc(statusLabel(ev.status))}</span></td>
                      <td data-label="${esc(col.date)}">${esc(formatDate(ev.startAt))}</td>
                      <td data-label="${esc(col.time)}">${timeLabel}</td>
                      <td data-label="${esc(col.team)}">${ev.needsTeamAssignment ? `<span class="event-team-warn">${esc(tx("events.team.migrationRequired"))}</span>` : esc(ev.teamName || ev.teamId || "—")}</td>
                      <td data-label="${esc(col.session)}"><a href="#/admin/sessions/${esc(code)}">${esc(hooks.formatCode(code))}</a></td>
                      <td data-label="${esc(col.slides)}">${esc(ev.slideCount || 0)}</td>
                      <td data-label="${esc(col.participants)}">${esc(st.participants ?? 0)}</td>
                      <td data-label="${esc(col.votes)}">${esc(st.votes ?? 0)}</td>
                      <td data-label="${esc(col.questions)}">${esc(st.questions ?? 0)}</td>
                    </tr>`;
                  })
                  .join("")
              : `<tr><td colspan="11" class="muted">${esc(tx("events.empty"))}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
  root.dataset.eventsPainted = "1";
  const filterSel = document.getElementById("events-filter-status");
  if (filterSel) {
    filterSel.value = listFilter.status || "";
    filterSel.addEventListener("change", () => {
      listFilter.status = filterSel.value;
      renderList(root, ++pageSeq);
    });
  }
}

async function fetchTeamsForPicker() {
  try {
    const res = await fetch("/api/teams", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return Array.isArray(data.teams) ? data.teams : [];
  } catch {
    return [];
  }
}

/**
 * Darf das Team auf der Event-Maske gewählt/geändert werden?
 * Admin: immer. Sonst: nur Erstzuordnung (Event ohne teamId) mit mindestens einem Team.
 * @param {{ teamId?: string }} event
 */
function canEditTeamOnEvent(event) {
  if (!event) return false;
  if (!isUserAuthEnabled()) return isAdminUser();
  if (isAdminUser()) return true;
  const unassigned = !String(event.teamId || "").trim();
  return unassigned && canCreateEvents() && teamPickerCache.length > 0;
}

/**
 * Teamauswahl im Formular — Pflichtfeld bei Benutzer-Auth.
 * @param {string} selectedId
 * @param {{ readonly?: boolean, required?: boolean, warn?: boolean }} [opts]
 */
function teamFieldHtml(selectedId = "", opts = {}) {
  const { readonly = false, required = false, warn = false } = opts;
  const teams = teamPickerCache;
  const sel = String(selectedId || "");
  const needsAssign = warn || (!sel && isUserAuthEnabled());
  const boxMod = needsAssign && !readonly ? " event-team-box--warn" : "";
  if (readonly) {
    const team = teams.find((t) => t.id === sel);
    const label = team?.name || sel || "—";
    return `
      <section class="event-team-box panel-inset${needsAssign ? " event-team-box--warn" : ""}">
        <h3 class="event-team-box__title">${esc(tx("events.team.label"))}</h3>
        ${needsAssign ? `<p class="event-team-warn">${esc(tx("events.team.assignBanner"))}</p>` : ""}
        <p class="event-team-badge"><strong>${esc(label)}</strong></p>
        <p class="muted">${esc(tx("events.team.hint"))}</p>
      </section>`;
  }
  if (!teams.length && isUserAuthEnabled()) {
    return `
      <section class="event-team-box panel-inset event-team-box--warn">
        <h3 class="event-team-box__title">${esc(tx("events.team.label"))}</h3>
        <p class="muted">${esc(tx("events.team.none"))}</p>
        <p><a class="btn ghost" href="#/admin/teams">${esc(tx("events.team.gotoTeams"))}</a></p>
      </section>`;
  }
  const autoOne = teams.length === 1 ? teams[0].id : sel;
  const value = sel || autoOne || "";
  return `
    <section class="event-team-box panel-inset${boxMod}">
      <h3 class="event-team-box__title">${esc(tx("events.team.label"))}${required ? " *" : ""}</h3>
      ${needsAssign ? `<p class="event-team-warn">${esc(tx("events.team.assignBanner"))}</p>` : ""}
      ${teams.length === 1 ? `<p class="muted">${esc(tx("events.team.autoSelected"))}</p>` : ""}
      <label class="field"><span>${esc(tx("events.team.pick"))}</span>
        <select id="ev-team" ${required ? "required" : ""}>
          ${teams.length > 1 ? `<option value="">${esc(tx("events.team.pickPlaceholder"))}</option>` : ""}
          ${teams.map((t) => `<option value="${esc(t.id)}" ${t.id === value ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
        </select>
      </label>
      <p class="muted">${esc(tx("events.team.hint"))}</p>
    </section>`;
}

function readTeamField() {
  const el = document.getElementById("ev-team");
  if (!el) return "";
  return String(el.value || "").trim();
}

function eventFieldsHtml(event = {}, opts = {}) {
  const localStart = toDatetimeLocal(event.startTime);
  const teamBlock = opts.includeTeam ? teamFieldHtml(event.teamId || "", opts.teamOpts || opts) : "";
  return `
    ${teamBlock}
    <label class="field"><span>${esc(tx("events.field.title"))}</span>
      <input id="ev-title" value="${esc(event.title || "")}" maxlength="120" required />
    </label>
    <label class="field"><span>${esc(tx("events.field.description"))}</span>
      <textarea id="ev-desc" rows="3" maxlength="800">${esc(event.description || "")}</textarea>
    </label>
    <label class="field"><span>${esc(tx("events.field.start"))}</span>
      <input id="ev-start" type="date" value="${esc(event.startAt || todayInput())}" />
    </label>
    <label class="field"><span>${esc(tx("events.field.end"))}</span>
      <input id="ev-end" type="date" value="${esc(event.endAt || event.startAt || todayInput())}" />
    </label>
    <label class="field"><span>${esc(tx("events.field.startTime"))}</span>
      <input id="ev-start-time" type="datetime-local" value="${esc(localStart)}" />
    </label>
    <p class="muted">${esc(tx("events.field.startTimeHint"))}</p>
    <label class="field"><span>${esc(tx("events.field.category"))}</span>
      <input id="ev-cat" value="${esc(event.category || "")}" maxlength="80" />
    </label>
    <label class="field"><span>${esc(tx("events.field.room"))}</span>
      <input id="ev-room" value="${esc(event.room || "")}" maxlength="80" />
    </label>
    ${eventImageFieldHtml(event.eventImage || "")}
  `;
}

/** ISO → Wert für datetime-local (lokale Zeitzone). */
function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO mit lokalem Offset. */
function fromDatetimeLocal(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString();
}

function eventImageFieldHtml(dataUrl) {
  return `
    <fieldset class="event-image-upload" id="ev-image-box">
      <legend>${esc(tx("events.field.image"))}</legend>
      <p class="muted">${esc(tx("events.field.imageHint"))}</p>
      <input type="hidden" id="ev-image" value="" />
      <div id="ev-image-preview-wrap" ${dataUrl ? "" : "hidden"}>
        <img id="ev-image-preview" class="event-image-preview" alt="" ${dataUrl ? `src="${esc(dataUrl)}"` : ""} />
        <p id="ev-image-meta" class="event-image-meta"></p>
      </div>
      <label class="field">
        <span class="sr-only">${esc(tx("events.field.imageDrop"))}</span>
        <input id="ev-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
      </label>
      <p id="ev-image-msg" class="muted" role="status"></p>
      <button type="button" class="btn ghost" id="ev-image-remove" ${dataUrl ? "" : "hidden"}>${esc(tx("events.field.imageRemove"))}</button>
    </fieldset>
  `;
}

function bindEventImageUpload(existingUrl = "") {
  const hidden = document.getElementById("ev-image");
  const fileInput = document.getElementById("ev-image-file");
  const preview = document.getElementById("ev-image-preview");
  const wrap = document.getElementById("ev-image-preview-wrap");
  const meta = document.getElementById("ev-image-meta");
  const msg = document.getElementById("ev-image-msg");
  const removeBtn = document.getElementById("ev-image-remove");
  const box = document.getElementById("ev-image-box");
  if (hidden && existingUrl) hidden.value = existingUrl;

  const showPreview = (url, info = "") => {
    if (hidden) hidden.value = url || "";
    if (preview) preview.src = url || "";
    if (wrap) wrap.hidden = !url;
    if (meta) meta.textContent = info;
    if (removeBtn) removeBtn.hidden = !url;
  };

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (msg) msg.textContent = "Lade und skaliere…";
    try {
      const result = await scaleEventImageFile(file);
      const kb = Math.round(result.bytes / 1024);
      const dim = result.width ? `${result.width}×${result.height} · ` : "";
      showPreview(result.dataUrl, `${dim}${kb} KB`);
      if (msg) msg.textContent = result.warning || "Grafik erfolgreich hochgeladen.";
    } catch (err) {
      if (msg) msg.textContent = err.message || "Upload fehlgeschlagen.";
    }
    fileInput.value = "";
  });

  removeBtn?.addEventListener("click", () => {
    showPreview("", "");
    if (msg) msg.textContent = "Grafik entfernt.";
  });

  /* Drag & Drop auf dem Upload-Feld. */
  ["dragenter", "dragover"].forEach((type) => {
    box?.addEventListener(type, (ev) => {
      ev.preventDefault();
      box.classList.add("is-drag");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    box?.addEventListener(type, (ev) => {
      ev.preventDefault();
      box.classList.remove("is-drag");
    });
  });
  box?.addEventListener("drop", async (ev) => {
    const file = ev.dataTransfer?.files?.[0];
    if (!file || !fileInput) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change"));
  });
}

function readEventFields() {
  const fields = {
    title: document.getElementById("ev-title")?.value,
    description: document.getElementById("ev-desc")?.value,
    startAt: document.getElementById("ev-start")?.value,
    endAt: document.getElementById("ev-end")?.value,
    startTime: fromDatetimeLocal(document.getElementById("ev-start-time")?.value),
    eventImage: document.getElementById("ev-image")?.value || "",
    category: document.getElementById("ev-cat")?.value,
    room: document.getElementById("ev-room")?.value,
  };
  const teamId = readTeamField();
  if (document.getElementById("ev-team")) fields.teamId = teamId;
  else if (teamId) fields.teamId = teamId;
  return fields;
}

async function renderCreate(root) {
  teamPickerCache = await fetchTeamsForPicker();
  let others = adminCache.events;
  if (!others.length) {
    try {
      others = await fetchAdminEventRows();
    } catch {
      others = [];
    }
  }
  const requireTeam = isUserAuthEnabled();
  const canSubmit = !requireTeam || teamPickerCache.length > 0;
  root.innerHTML = `
    <header class="admin-page-head">
      <div>
        <p class="eyebrow"><a href="#/admin/events">${esc(tx("events.title"))}</a></p>
        <h1>${esc(tx("events.new"))}</h1>
      </div>
    </header>
    <form id="event-create-form" class="panel event-form">
      ${eventFieldsHtml({}, { includeTeam: true, teamOpts: { required: requireTeam } })}
      <label class="check"><input type="checkbox" id="ev-activate" /> ${esc(tx("events.activateNow"))}</label>
      <label class="field"><span>${esc(tx("events.copyFrom"))}</span>
        <select id="ev-copy-from">
          <option value="">${esc(tx("events.copyFromNone"))}</option>
          ${others.map((e) => `<option value="${esc(e.id)}">${esc(e.title)} (${esc(hooks.formatCode(e.sessionCode || e.joinCode))})</option>`).join("")}
        </select>
      </label>
      <p id="event-create-msg" class="muted" role="status"></p>
      <div class="home-actions">
        <button type="submit" class="btn primary" ${canSubmit ? "" : "disabled"}>${esc(tx("events.create"))}</button>
        <a class="btn ghost" href="#/admin/events">${esc(tx("events.cancel"))}</a>
      </div>
    </form>
  `;
  document.getElementById("event-create-form")?.addEventListener("submit", onCreateSubmit);
  bindEventImageUpload("");
}

async function onCreateSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById("event-create-msg");
  const body = {
    ...readEventFields(),
    status: document.getElementById("ev-activate")?.checked ? "active" : "planned",
    copyFromId: document.getElementById("ev-copy-from")?.value || "",
  };
  if (isUserAuthEnabled() && !body.teamId) {
    if (msg) msg.textContent = tx("events.team.required");
    return;
  }
  const result = await api.createEvent(body);
  if (!result?.ok) {
    if (msg) msg.textContent = errorText(result);
    return;
  }
  const ev = result.data.event;
  const code = ev.sessionCode || ev.joinCode;
  location.hash = `#/admin/sessions/${code}`;
}

async function renderDetail(root, eventId) {
  root.innerHTML = `<p class="muted">${esc(tx("events.loading"))}</p>`;
  teamPickerCache = await fetchTeamsForPicker();
  const result = await api.getEvent(eventId);
  if (!result?.ok || !result.data?.event) {
    root.innerHTML = `<p class="muted">${esc(errorText(result))}</p>`;
    return;
  }
  const event = result.data.event;
  const stats = result.data.stats || event.stats || {};
  adminCache.event = event;
  const code = event.sessionCode || event.joinCode;
  const joinUrl = event.joinUrl || hooks.joinUrl(code);
  const copyTextInvite = event.copyText || "";
  const teamEditable = canEditTeamOnEvent(event);
  const teamRequired = teamEditable && (isUserAuthEnabled() || isAdminUser());
  root.innerHTML = `
    <header class="admin-page-head events-head">
      <div>
        <p class="eyebrow"><a href="#/admin/events">${esc(tx("events.title"))}</a></p>
        <h1>${esc(event.title)}</h1>
      </div>
      <span class="event-status event-status-${esc(event.status)}">${esc(statusLabel(event.status))}</span>
    </header>
    <p class="home-actions">
      <a class="btn primary" href="#/admin/sessions/${esc(code)}">${esc(tx("events.openDeck"))}</a>
      <a class="btn ghost" href="#/present/${esc(code)}">${esc(tx("events.openPresent"))}</a>
      <a class="btn ghost" href="#/stage/${esc(code)}">${esc(tx("events.openStage"))}</a>
    </p>
    <form id="event-edit-form" class="panel event-form">
      ${teamFieldHtml(event.teamId || "", {
        readonly: !teamEditable,
        required: teamRequired,
        warn: !String(event.teamId || "").trim(),
      })}
      ${eventFieldsHtml(event)}
      <label class="field"><span>${esc(tx("events.field.status"))}</span>
        <select id="ev-status">
          ${["planned", "active", "ended", "archived"].map((s) => `<option value="${s}" ${event.status === s ? "selected" : ""}>${esc(statusLabel(s))}</option>`).join("")}
        </select>
      </label>
      <p id="event-edit-msg" class="muted" role="status"></p>
      <div class="home-actions">
        <button type="submit" class="btn primary">${esc(tx("events.save"))}</button>
        <button type="button" class="btn ghost" id="btn-event-delete">${esc(tx("events.delete"))}</button>
      </div>
    </form>
    <section class="panel">
      <h2>${esc(tx("events.joinOptions"))}</h2>
      <p class="event-code">${esc(hooks.formatCode(code))}</p>
      <canvas id="admin-event-qr" class="qr event-qr" width="160" height="160" aria-label="QR-Code"></canvas>
      <p><a href="#/join/${esc(code)}">${esc(joinUrl)}</a></p>
      <pre class="event-invite">${esc(copyTextInvite)}</pre>
      <div class="home-actions">
        <button type="button" class="btn ghost" id="btn-copy-invite">${esc(tx("events.copyInvite"))}</button>
        <button type="button" class="btn ghost" id="btn-dl-qr">${esc(tx("events.qrDownload"))}</button>
        <a class="btn ghost" href="#/join/${esc(code)}">${esc(tx("events.preview"))}</a>
      </div>
    </section>
    <section class="panel">
      <h2>${esc(tx("events.stats.title"))}</h2>
      <p>${esc(tx("events.col.participants"))}: <strong>${esc(stats.participants ?? 0)}</strong>
         · ${esc(tx("events.col.votes"))}: <strong>${esc(stats.votes ?? 0)}</strong>
         · ${esc(tx("events.col.questions"))}: <strong>${esc(stats.questions ?? 0)}</strong></p>
      <ul class="event-popular">
        ${(stats.popular || []).map((p) => `<li>${esc(p.question || "")} — ${esc(p.participation ?? 0)}</li>`).join("") || `<li class="muted">${esc(tx("events.stats.empty"))}</li>`}
      </ul>
      <button type="button" class="btn ghost" id="btn-stats-csv">${esc(tx("events.stats.csv"))}</button>
    </section>
    <section class="panel">
      <h2>${esc(tx("events.branding.title"))}</h2>
      <p class="muted">${esc(tx("events.branding.hint"))}</p>
      <label class="field"><span>${esc(tx("events.branding.primary"))}</span>
        <input id="ev-primary" value="${esc(event.branding?.primary || "")}" placeholder="#007CC1" />
      </label>
      <label class="field"><span>${esc(tx("events.branding.secondary"))}</span>
        <input id="ev-secondary" value="${esc(event.branding?.secondary || "")}" placeholder="#F99700" />
      </label>
      <label class="field"><span>${esc(tx("events.branding.footer"))}</span>
        <input id="ev-footer" value="${esc(event.branding?.footerText || "")}" maxlength="400" />
      </label>
    </section>
  `;
  hooks.drawQrCode(document.getElementById("admin-event-qr"), joinUrl);
  bindEventImageUpload(event.eventImage || "");
  document.getElementById("event-edit-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById("event-edit-msg");
    const nextTeam = readTeamField();
    const hadTeam = Boolean(String(event.teamId || "").trim());
    if (isAdminUser() && hadTeam && nextTeam && nextTeam !== String(event.teamId || "") && !confirm(tx("events.team.changeConfirm"))) {
      return;
    }
    if (teamEditable && isUserAuthEnabled() && !nextTeam) {
      if (msg) msg.textContent = tx("events.team.required");
      return;
    }
    const patch = {
      ...readEventFields(),
      status: document.getElementById("ev-status")?.value,
      branding: {
        ...(event.branding || {}),
        primary: document.getElementById("ev-primary")?.value,
        secondary: document.getElementById("ev-secondary")?.value,
        footerText: document.getElementById("ev-footer")?.value,
      },
    };
    if (teamEditable && document.getElementById("ev-team")) patch.teamId = nextTeam;
    const resultSave = await api.updateEvent(event.id, patch);
    if (!resultSave?.ok) {
      if (msg) msg.textContent = errorText(resultSave);
      return;
    }
    await renderDetail(root, event.id);
  });
  document.getElementById("btn-event-delete")?.addEventListener("click", async () => {
    if (!confirm(tx("events.deleteConfirm"))) return;
    const del = await api.deleteEvent(event.id);
    if (!del?.ok) {
      const msg = document.getElementById("event-edit-msg");
      if (msg) msg.textContent = errorText(del);
      return;
    }
    location.hash = "#/admin/events";
  });
  document.getElementById("btn-copy-invite")?.addEventListener("click", (ev) => copyText(copyTextInvite, ev.currentTarget));
  document.getElementById("btn-dl-qr")?.addEventListener("click", () => downloadQr("admin-event-qr", `event-${code}.png`));
  document.getElementById("btn-stats-csv")?.addEventListener("click", async () => {
    const csv = await api.eventStatsCsv(event.id);
    if (!csv?.ok || !csv.blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(csv.blob);
    a.download = `event-${event.id}-stats.csv`;
    a.click();
  });
}

/** Quell-Sessions für das Copy-Modal — erst beim Öffnen laden, nicht beim Deck-Render. */
async function copySourceOptions(code) {
  const [events, sourcesRes] = await Promise.all([
    adminCache.events.length ? Promise.resolve(adminCache.events) : fetchAdminEventRows().catch(() => []),
    api.sessionsAdmin(),
  ]);
  if (events.length) adminCache.events = events;
  const current = events.find((e) => (e.sessionCode || e.joinCode) === code);
  const sameTeamOnly = isUserAuthEnabled() && !isAdminUser() && current?.teamId;
  const listed = sourcesRes?.ok && Array.isArray(sourcesRes.data?.sessions) ? sourcesRes.data.sessions : [];
  const fromEvents = events
    .filter((e) => !sameTeamOnly || e.teamId === current.teamId)
    .map((e) => ({
      code: e?.sessionCode || e?.joinCode,
      title: e?.title || e?.sessionCode || e?.joinCode || "",
    }));
  const byCode = new Map();
  for (const s of [...listed, ...fromEvents]) {
    const c = s?.code;
    if (!c || c === code) continue;
    byCode.set(c, { code: c, title: s.title || c });
  }
  return [...byCode.values()];
}

async function fillDeckEyebrow(code, seq) {
  let events = adminCache.events;
  if (!events.length) {
    try {
      events = await fetchAdminEventRows();
      adminCache.events = events;
    } catch {
      return;
    }
  }
  if (seq !== pageSeq) return;
  const event = events.find((e) => (e.sessionCode || e.joinCode) === code);
  const el = document.getElementById("deck-event-link");
  if (!el || !event) return;
  el.innerHTML = `<a href="#/admin/events/${esc(event.id)}">${esc(event.title)}</a>`;
}

async function renderSessionDeck(root, code, seq = pageSeq) {
  root.innerHTML = `<p class="muted">${esc(tx("events.slides.loading"))}</p>`;
  /* Nur die Session selbst blockiert die Ansicht — Copy-Quellen und Event-Liste laden danach. */
  const sessRes = await api.getSession(code);
  if (seq !== pageSeq) return;
  const session = sessRes?.session;
  if (!session) {
    root.innerHTML = `<p class="muted">${esc(tx("events.sessionMissing"))}</p>
      <p><a href="#/admin/events">${esc(tx("events.title"))}</a></p>`;
    return;
  }
  const event = adminCache.events.find((e) => (e.sessionCode || e.joinCode) === code);
  let eventMeta = event;
  if (!eventMeta?.teamId && session.eventId) {
    const evRes = await api.getEvent(session.eventId);
    if (evRes?.ok && evRes.data?.event) eventMeta = evRes.data.event;
  }
  teamPickerCache = await fetchTeamsForPicker();
  const teamAssignHtml =
    eventMeta && canEditTeamOnEvent(eventMeta)
      ? `<section class="panel event-team-assign-strip" id="deck-team-assign">
          <form id="deck-team-assign-form">
            ${teamFieldHtml(eventMeta.teamId || "", { required: true, warn: true })}
            <div class="home-actions">
              <button type="submit" class="btn primary btn--sm">${esc(tx("events.save"))}</button>
              <a class="btn ghost btn--sm" href="#/admin/events/${esc(eventMeta.id)}">${esc(tx("events.title"))}</a>
            </div>
            <p id="deck-team-msg" class="muted" role="status"></p>
          </form>
        </section>`
      : eventMeta && !String(eventMeta.teamId || "").trim()
        ? `<section class="panel event-team-box--warn">
            <p class="event-team-warn">${esc(tx("events.team.migrationRequired"))}</p>
            <p><a class="btn ghost btn--sm" href="#/admin/events/${esc(eventMeta.id)}">${esc(tx("events.title"))}</a></p>
          </section>`
        : "";
  const slides = (session.slides || []).filter(Boolean);
  const slideCountLabel = tx("events.slides.count", { count: slides.length });
  root.innerHTML = `
    ${teamAssignHtml}
    <header class="session-deck-head">
      <div class="session-deck-head__main">
        <p class="eyebrow" id="deck-event-link">${eventMeta ? `<a href="#/admin/events/${esc(eventMeta.id)}">${esc(eventMeta.title || eventMeta.id)}</a>` : `<a href="#/admin/events">${esc(tx("events.title"))}</a>`}</p>
        <div class="session-deck-title-row">
          <h1>${esc(tx("events.slides.title"))}</h1>
          <span class="session-code-badge" title="${esc(tx("events.col.session"))}">${esc(hooks.formatCode(code))}</span>
          <span class="session-slide-count muted">${esc(slideCountLabel)}</span>
        </div>
      </div>
      <div class="session-deck-toolbar">
        <a class="btn ghost btn--sm" href="#/present/${esc(code)}">${esc(tx("events.openPresent"))}</a>
        <a class="btn ghost btn--sm" href="#/join/${esc(code)}">${esc(tx("events.preview"))}</a>
        <button type="button" class="btn primary btn--sm" id="btn-add-slide">${esc(tx("events.slides.add"))}</button>
        <button type="button" class="btn ghost btn--sm" id="btn-copy-slides">${esc(tx("events.copySlides"))}</button>
      </div>
    </header>
    <div id="deck-bulk-bar" class="deck-bulk-bar" hidden>
      <span id="deck-bulk-label" class="deck-bulk-label"></span>
      <button type="button" class="btn ghost btn--sm" id="btn-bulk-props">${esc(tx("events.slides.bulkProps"))}</button>
      <button type="button" class="btn ghost btn--sm" id="btn-bulk-dup">${esc(tx("events.slides.bulkDup"))}</button>
      <button type="button" class="btn ghost btn--sm danger" id="btn-bulk-del">${esc(tx("events.slides.bulkDel"))}</button>
    </div>
    <section class="panel session-deck-panel">
      <ul id="event-slide-list" class="event-slide-list session-slide-list" tabindex="0" aria-label="${esc(tx("events.slides.title"))}">
        ${slides.length
          ? slides
              .map(
                (s, i) => `<li class="event-slide-row session-slide-row${isInlineEditable(s.type) ? " session-slide-row--simple" : ""}" draggable="true" data-slide-id="${esc(s.id)}" data-slide-type="${esc(s.type)}" tabindex="-1">
              <label class="session-slide-check" title="${esc(tx("events.slides.select"))}">
                <input type="checkbox" data-select="1" aria-label="${esc(tx("events.slides.select"))}" />
              </label>
              <span class="event-slide-idx" aria-hidden="true">${i + 1}</span>
              <span class="session-slide-icon" aria-hidden="true">${typeIcon(s.type)}</span>
              <span class="session-slide-meta">
                <strong>${esc(s.question || tx("events.slides.untitled"))}</strong>
                <span class="muted">${esc(typeLabel(s.type, tx))}</span>
              </span>
              <span class="event-slide-tools session-slide-tools">
                <button type="button" class="btn ghost btn--sm" data-edit="1" title="${esc(tx("events.slides.edit"))}" aria-label="${esc(tx("events.slides.edit"))}">✎</button>
                <button type="button" class="btn ghost btn--sm" data-shift="-1" aria-label="${esc(tx("events.slides.up"))}">↑</button>
                <button type="button" class="btn ghost btn--sm" data-shift="1" aria-label="${esc(tx("events.slides.down"))}">↓</button>
                <button type="button" class="btn ghost btn--sm" data-dup="1">${esc(tx("events.slides.dup"))}</button>
                <button type="button" class="btn ghost btn--sm" data-del="1">${esc(tx("events.slides.del"))}</button>
              </span>
              <div class="session-slide-inline" hidden></div>
            </li>`
              )
              .join("")
          : `<li class="session-slide-empty muted">${esc(tx("deck.empty"))}</li>`}
      </ul>
    </section>
    <dialog id="bulk-props-dialog" class="admin-dialog">
      <form id="bulk-props-form">
        <h2>${esc(tx("events.slides.bulkPropsTitle"))}</h2>
        <p class="muted">${esc(tx("events.slides.bulkHint"))}</p>
        <label class="field"><span>${esc(tx("events.slides.bulkResults"))}</span>
          <select id="bulk-results">
            <option value="keep">${esc(tx("events.slides.bulkResultsKeep"))}</option>
            <option value="hide">${esc(tx("events.slides.bulkResultsHide"))}</option>
            <option value="show">${esc(tx("events.slides.bulkResultsShow"))}</option>
          </select>
        </label>
        <label class="field"><span>${esc(tx("events.slides.planned"))}</span>
          <input id="bulk-planned" type="number" min="1" max="180" placeholder="—" />
        </label>
        <label class="field"><span>${esc(tx("events.slides.notes"))}</span>
          <textarea id="bulk-notes" maxlength="4000" rows="3" placeholder="—"></textarea>
        </label>
        <div class="home-actions">
          <button type="submit" class="btn primary">${esc(tx("events.slides.bulkApply"))}</button>
          <button type="button" class="btn ghost" id="btn-bulk-props-cancel">${esc(tx("events.cancel"))}</button>
        </div>
      </form>
    </dialog>
    <dialog id="edit-slide-dialog" class="admin-dialog slide-edit-dialog">
      <form id="edit-slide-form" class="slide-edit-form">
        <header class="slide-edit-head">
          <span class="slide-edit-icon" id="edit-slide-icon" aria-hidden="true"></span>
          <div>
            <p class="eyebrow" id="edit-slide-type-label"></p>
            <h2 id="edit-slide-title">${esc(tx("events.slides.editTitle"))}</h2>
          </div>
        </header>
        <div id="edit-slide-body" class="slide-edit-body"></div>
        <p id="edit-slide-error" class="slide-edit-error" hidden role="alert"></p>
        <p id="edit-slide-status" class="slide-edit-status muted" hidden aria-live="polite"></p>
        <footer class="slide-edit-footer home-actions">
          <button type="button" class="btn ghost" id="btn-edit-cancel">${esc(tx("events.cancel"))}</button>
          <button type="button" class="btn ghost danger" id="btn-edit-delete">${esc(tx("events.slides.del"))}</button>
          <button type="submit" class="btn primary" id="btn-edit-save">${esc(tx("events.slides.save"))}</button>
        </footer>
      </form>
    </dialog>
    <dialog id="add-slide-dialog" class="admin-dialog">
      <form id="add-slide-form">
        <h2>${esc(tx("events.slides.add"))}</h2>
        <label class="field"><span>${esc(tx("home.type"))}</span>
          <select id="add-slide-type">
            ${SLIDE_TYPES.map(([v, key]) => `<option value="${v}">${esc(tx(key))}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>${esc(tx("home.question"))}</span>
          <input id="add-slide-q" maxlength="140" required />
        </label>
        <label class="field"><span>${esc(tx("home.options"))}</span>
          <input id="add-slide-opts" placeholder="A, B, C" />
        </label>
        <div class="home-actions">
          <button type="submit" class="btn primary">${esc(tx("events.slides.add"))}</button>
          <button type="button" class="btn ghost" id="btn-add-cancel">${esc(tx("events.cancel"))}</button>
        </div>
      </form>
    </dialog>
    <dialog id="copy-slides-dialog" class="admin-dialog">
      <form id="copy-slides-form">
        <h2>${esc(tx("events.copySlides"))}</h2>
        <label class="field"><span>${esc(tx("events.copy.source"))}</span>
          <select id="copy-source">
            <option value="">${esc(tx("events.copy.noTarget"))}</option>
          </select>
        </label>
        <label class="field"><span>${esc(tx("events.copy.mode"))}</span>
          <select id="copy-mode">
            <option value="all">${esc(tx("events.copy.all"))}</option>
            <option value="selected">${esc(tx("events.copy.selected"))}</option>
          </select>
        </label>
        <div id="copy-pick" hidden></div>
        <div class="home-actions">
          <button type="submit" class="btn primary">${esc(tx("events.copy.run"))}</button>
          <button type="button" class="btn ghost" id="btn-copy-cancel">${esc(tx("events.cancel"))}</button>
        </div>
      </form>
    </dialog>
  `;
  document.getElementById("deck-team-assign-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!eventMeta?.id) return;
    const msg = document.getElementById("deck-team-msg");
    const teamId = readTeamField();
    if (!teamId) {
      if (msg) msg.textContent = tx("events.team.required");
      return;
    }
    const resultSave = await api.updateEvent(eventMeta.id, { teamId });
    if (!resultSave?.ok) {
      if (msg) msg.textContent = errorText(resultSave);
      return;
    }
    await renderSessionDeck(root, code, seq);
  });
  bindDeckActions(root, code, slides);
  fillDeckEyebrow(code, seq);
}

function bindDeckActions(root, code, slides) {
  const list = document.getElementById("event-slide-list");
  let focusIdx = 0;
  let lastSelectIdx = 0;

  const rows = () => [...(list?.querySelectorAll(".event-slide-row") || [])];
  const selectedIds = () =>
    rows()
      .filter((r) => r.querySelector("[data-select]")?.checked)
      .map((r) => r.getAttribute("data-slide-id"));

  const syncBulkBar = () => {
    const ids = selectedIds();
    const bar = document.getElementById("deck-bulk-bar");
    const label = document.getElementById("deck-bulk-label");
    if (!bar) return;
    bar.hidden = ids.length === 0;
    if (label) label.textContent = tx("events.slides.bulkBar", { count: ids.length });
    rows().forEach((r) => r.classList.toggle("is-selected", Boolean(r.querySelector("[data-select]")?.checked)));
  };

  const setFocusRow = (idx) => {
    const all = rows();
    if (!all.length) return;
    focusIdx = Math.max(0, Math.min(all.length - 1, idx));
    all.forEach((r, i) => r.classList.toggle("is-focused", i === focusIdx));
  };

  const selectRange = (from, to, checked) => {
    const all = rows();
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    for (let i = a; i <= b; i++) {
      const cb = all[i]?.querySelector("[data-select]");
      if (cb) cb.checked = checked;
    }
    syncBulkBar();
  };

  list?.querySelectorAll(".event-slide-row").forEach((row) => {
    row.addEventListener("dragstart", () => {
      dragSlideId = row.getAttribute("data-slide-id") || "";
    });
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      const targetId = row.getAttribute("data-slide-id");
      if (!dragSlideId || dragSlideId === targetId) return;
      const ids = rows().map((el) => el.getAttribute("data-slide-id"));
      const from = ids.indexOf(dragSlideId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      await api.updateDeck(code, "move", { id: dragSlideId, index: to, allowLocal: true });
      await renderSessionDeck(root, code, pageSeq);
    });
  });

  list?.addEventListener("click", async (e) => {
    const row = e.target.closest(".event-slide-row");
    if (!row) return;
    const id = row.getAttribute("data-slide-id");
    const idx = rows().indexOf(row);
    focusIdx = idx;

    /* Checkbox / Shift-Mehrfachauswahl */
    if (e.target.closest("[data-select]") || e.target.closest(".session-slide-check")) {
      const cb = row.querySelector("[data-select]");
      if (e.shiftKey) {
        selectRange(lastSelectIdx, idx, true);
      } else {
        lastSelectIdx = idx;
        syncBulkBar();
      }
      setFocusRow(idx);
      return;
    }

    if (e.target.closest("[data-edit]")) {
      const slide = slides.find((s) => s.id === id);
      if (!slide) return;
      /* Einfache Typen: Inline; komplexe / Alt+Klick: Modal */
      if (isInlineEditable(slide.type) && !e.altKey) {
        openInlineEditor(root, code, row, slide, idx);
      } else {
        openSlideEditor(root, code, slide, idx);
      }
      return;
    }
    /* Doppelklick auf Titel/Meta → ebenfalls bearbeiten */
    if (e.detail === 2 && e.target.closest(".session-slide-meta")) {
      const slide = slides.find((s) => s.id === id);
      if (!slide) return;
      if (isInlineEditable(slide.type) && !e.altKey) {
        openInlineEditor(root, code, row, slide, idx);
      } else {
        openSlideEditor(root, code, slide, idx);
      }
      return;
    }
    if (e.target.closest("[data-shift]")) {
      const dir = Number(e.target.closest("[data-shift]").getAttribute("data-shift"));
      await api.updateDeck(code, "move", { id, index: idx + dir, allowLocal: true });
      await renderSessionDeck(root, code, pageSeq);
      return;
    }
    if (e.target.closest("[data-dup]")) {
      await api.updateDeck(code, "duplicate", { id, allowLocal: true });
      await renderSessionDeck(root, code, pageSeq);
      return;
    }
    if (e.target.closest("[data-del]")) {
      const slide = slides.find((s) => s.id === id);
      if (!slide) return;
      if (!confirm(tx("events.slides.delConfirm"))) return;
      await deleteSlideWithUndo(root, code, slide, idx);
      return;
    }

    /* Klick auf Zeile: Fokus + bei Meta/Ctrl Toggle-Auswahl */
    if (e.target.closest(".event-slide-tools")) return;
    setFocusRow(idx);
    if (e.metaKey || e.ctrlKey) {
      const cb = row.querySelector("[data-select]");
      if (cb) {
        cb.checked = !cb.checked;
        lastSelectIdx = idx;
        syncBulkBar();
      }
    } else {
      row.classList.add("is-focused");
    }
  });

  document.getElementById("btn-bulk-dup")?.addEventListener("click", async () => {
    const ids = selectedIds();
    for (const id of ids) {
      await api.updateDeck(code, "duplicate", { id, allowLocal: true });
    }
    await renderSessionDeck(root, code, pageSeq);
  });

  document.getElementById("btn-bulk-del")?.addEventListener("click", async () => {
    const ids = selectedIds();
    if (!ids.length) return;
    if (ids.length >= slides.length) {
      alert(tx("events.slides.delConfirm"));
      return;
    }
    if (!confirm(tx("events.slides.bulkDelConfirm", { count: ids.length }))) return;
    for (const id of ids) {
      if (rows().length <= 1) break;
      await api.updateDeck(code, "remove", { id, allowLocal: true });
    }
    showDeckToast(tx("events.slides.deleted"), 5000);
    await renderSessionDeck(root, code, pageSeq);
  });

  const bulkDlg = document.getElementById("bulk-props-dialog");
  document.getElementById("btn-bulk-props")?.addEventListener("click", () => {
    if (!selectedIds().length) return;
    document.getElementById("bulk-results").value = "keep";
    document.getElementById("bulk-planned").value = "";
    document.getElementById("bulk-notes").value = "";
    if (typeof bulkDlg?.showModal === "function") bulkDlg.showModal();
  });
  document.getElementById("btn-bulk-props-cancel")?.addEventListener("click", () => bulkDlg?.close?.());
  document.getElementById("bulk-props-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = selectedIds();
    if (!ids.length) {
      bulkDlg?.close?.();
      return;
    }
    const resultsMode = document.getElementById("bulk-results")?.value || "keep";
    const plannedRaw = document.getElementById("bulk-planned")?.value;
    const notesRaw = document.getElementById("bulk-notes")?.value;
    const changePlanned = plannedRaw !== "" && plannedRaw != null;
    const changeNotes = notesRaw !== "" && notesRaw != null;
    const changeResults = resultsMode === "hide" || resultsMode === "show";
    if (!changePlanned && !changeNotes && !changeResults) {
      bulkDlg?.close?.();
      return;
    }
    for (const id of ids) {
      const slide = slides.find((s) => s.id === id);
      if (!slide) continue;
      if (changePlanned || changeNotes) {
        await api.updateDeck(code, "patch", {
          id,
          allowLocal: true,
          ...(changeNotes ? { notes: notesRaw } : {}),
          ...(changePlanned ? { plannedMinutes: Number(plannedRaw) } : {}),
        });
      }
      if (changeResults && HIDEABLE_TYPES.has(slide.type)) {
        await api.updateSlide(code, id, {
          question: slide.question,
          options: slide.options,
          resultsVisible: resultsMode === "show",
          notes: changeNotes ? notesRaw : slide.notes,
          plannedMinutes: changePlanned ? Number(plannedRaw) : slide.plannedMinutes,
          correctIndexes: slide.correctIndexes,
          duration: slide.duration,
          scale: slide.scale,
          style: slide.style,
          moderated: slide.moderated,
          qaTimer: slide.qaTimer,
        });
      }
    }
    bulkDlg?.close?.();
    showDeckToast(tx("events.slides.saved"));
    await renderSessionDeck(root, code, pageSeq);
  });

  /* Deck-Shortcuts nur wenn Liste fokussiert / Deck sichtbar und kein Dialog offen */
  if (bindDeckActions._keyHandler) {
    document.removeEventListener("keydown", bindDeckActions._keyHandler);
  }
  bindDeckActions._keyHandler = (e) => {
    if (!root.isConnected || !list) return;
    if (document.getElementById("edit-slide-dialog")?.open) return;
    if (document.getElementById("add-slide-dialog")?.open) return;
    if (document.getElementById("copy-slides-dialog")?.open) return;
    if (document.getElementById("bulk-props-dialog")?.open) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;

    const all = rows();
    if (!all.length) return;
    const focused = all[focusIdx] || all[0];
    const id = focused?.getAttribute("data-slide-id");
    const slide = slides.find((s) => s.id === id);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusRow(focusIdx + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusRow(focusIdx - 1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      if (!slide) return;
      const row = all[focusIdx];
      if (isInlineEditable(slide.type) && !e.altKey && row) {
        openInlineEditor(root, code, row, slide, focusIdx);
      } else {
        openSlideEditor(root, code, slide, focusIdx);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (id) {
        api.updateDeck(code, "duplicate", { id, allowLocal: true }).then(() => renderSessionDeck(root, code, pageSeq));
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (!slide) return;
      e.preventDefault();
      if (!confirm(tx("events.slides.delConfirm"))) return;
      deleteSlideWithUndo(root, code, slide, focusIdx);
    }
  };
  document.addEventListener("keydown", bindDeckActions._keyHandler);
  setFocusRow(0);

  const addDlg = document.getElementById("add-slide-dialog");
  document.getElementById("btn-add-slide")?.addEventListener("click", () => {
    if (typeof addDlg?.showModal === "function") addDlg.showModal();
    else if (addDlg) addDlg.hidden = false;
  });
  document.getElementById("btn-add-cancel")?.addEventListener("click", () => addDlg?.close?.());
  document.getElementById("add-slide-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = document.getElementById("add-slide-type")?.value || "choice";
    const question = document.getElementById("add-slide-q")?.value || "";
    const opts = String(document.getElementById("add-slide-opts")?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ label }));
    const slide = { type, question };
    if (opts.length) slide.options = opts;
    await api.updateDeck(code, "add", { slide, allowLocal: true });
    addDlg?.close?.();
    await renderSessionDeck(root, code, pageSeq);
  });
  const copyDlg = document.getElementById("copy-slides-dialog");
  document.getElementById("btn-copy-slides")?.addEventListener("click", async () => {
    const sel = document.getElementById("copy-source");
    const opts = await copySourceOptions(code);
    if (sel) {
      sel.innerHTML = opts.length
        ? opts.map((s) => `<option value="${esc(s?.code || "")}">${esc(s?.title || s?.code || "")} (${esc(hooks.formatCode(s?.code))})</option>`).join("")
        : `<option value="">${esc(tx("events.copy.noTarget"))}</option>`;
    }
    if (typeof copyDlg?.showModal === "function") copyDlg.showModal();
  });
  document.getElementById("btn-copy-cancel")?.addEventListener("click", () => copyDlg?.close?.());
  document.getElementById("copy-mode")?.addEventListener("change", async () => {
    const pick = document.getElementById("copy-pick");
    const mode = document.getElementById("copy-mode")?.value;
    if (!pick) return;
    if (mode !== "selected") {
      pick.hidden = true;
      pick.innerHTML = "";
      return;
    }
    const src = document.getElementById("copy-source")?.value;
    const data = src ? await api.getSession(src) : null;
    const srcSlides = data?.session?.slides || [];
    pick.hidden = false;
    pick.innerHTML = srcSlides
      .map((s) => `<label class="check"><input type="checkbox" data-copy-id="${esc(s.id)}" checked /> ${esc(s.question || s.type)}</label>`)
      .join("");
  });
  document.getElementById("copy-slides-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sourceCode = document.getElementById("copy-source")?.value;
    if (!sourceCode) return;
    const mode = document.getElementById("copy-mode")?.value;
    const slideIds =
      mode === "selected"
        ? [...document.querySelectorAll("#copy-pick [data-copy-id]:checked")].map((el) => el.getAttribute("data-copy-id"))
        : [];
    const result = await api.copySessionSlides(code, { sourceCode, slideIds, allowLocal: true });
    copyDlg?.close?.();
    if (!result?.ok) {
      alert(errorText(result));
      return;
    }
    await renderSessionDeck(root, code, pageSeq);
  });
}

/* ---------- Folien-Editor (Modal) ---------- */

/** Typen mit Antwortoptionen (2–6). */
const OPTION_TYPES = new Set(["choice", "quiz", "ranking", "points100", "image_choice", "datetime", "picker"]);
/** Optionen-Grenzen je Typ im Deck-Editor. */
const OPTION_LIMITS = {
  picker: { min: 10, max: 50 },
  default: { min: 2, max: 6 },
};

/**
 * Kurzlebige Toast-Meldung; optional Aktion (z. B. Rückgängig).
 * @param {string} message
 * @param {number} [ms]
 * @param {{ label: string, onClick: () => void|Promise<void> }} [action]
 */
function showDeckToast(message, ms = 2200, action = null) {
  let el = document.getElementById("deck-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "deck-toast";
    el.className = "deck-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);
  if (action?.label && typeof action.onClick === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deck-toast__action";
    btn.textContent = action.label;
    btn.addEventListener("click", async () => {
      el.classList.remove("deck-toast--show");
      clearTimeout(showDeckToast._t);
      await action.onClick();
    });
    el.appendChild(btn);
  }
  el.classList.add("deck-toast--show");
  clearTimeout(showDeckToast._t);
  showDeckToast._t = setTimeout(() => el.classList.remove("deck-toast--show"), ms);
}

/**
 * Folie löschen und kurz Undo anbieten (Inhalt wiederherstellen).
 * @param {HTMLElement} root
 * @param {string} code
 * @param {object} slide
 * @param {number} index
 */
async function deleteSlideWithUndo(root, code, slide, index) {
  const snapshot = JSON.parse(JSON.stringify(slide));
  const at = Math.max(0, index);
  const res = await api.updateDeck(code, "remove", { id: slide.id, allowLocal: true });
  if (!res) {
    showDeckToast(tx("events.slides.saveFail"));
    return;
  }
  await renderSessionDeck(root, code, pageSeq);
  showDeckToast(tx("events.slides.deleted"), 5000, {
    label: tx("events.slides.undo"),
    async onClick() {
      /* Inhalt wiederherstellen; Live-Stimmen entfallen nach Löschen */
      const restore = {
        id: snapshot.id,
        type: snapshot.type,
        question: snapshot.question,
        options: snapshot.options,
        correctIndexes: snapshot.correctIndexes,
        correctIndex: snapshot.correctIndex,
        duration: snapshot.duration,
        scale: snapshot.scale,
        style: snapshot.style,
        rating: snapshot.rating,
        moderated: snapshot.moderated,
        notes: snapshot.notes,
        plannedMinutes: snapshot.plannedMinutes,
        resultsVisible: snapshot.resultsVisible,
        qaTimer: snapshot.qaTimer,
      };
      await api.updateDeck(code, "add", { slide: restore, index: at, allowLocal: true });
      await renderSessionDeck(root, code, pageSeq);
    },
  });
}

/**
 * Kompakte Inline-Bearbeitung in der Folienzeile (einfache Typen).
 * @param {HTMLElement} root
 * @param {string} code
 * @param {HTMLElement} row
 * @param {object} slide
 * @param {number} index
 */
function openInlineEditor(root, code, row, slide, index) {
  /* Andere offene Inline-Editoren schließen */
  root.querySelectorAll(".session-slide-row.is-editing").forEach((r) => {
    if (r !== row) closeInlineEditor(r);
  });

  const panel = row.querySelector(".session-slide-inline");
  if (!panel) {
    openSlideEditor(root, code, slide, index);
    return;
  }
  if (row.classList.contains("is-editing")) {
    panel.querySelector("[data-inline-q]")?.focus?.();
    return;
  }

  row.classList.add("is-editing");
  row.draggable = false;
  panel.hidden = false;

  const q = slide.question || "";
  const optsCsv = (slide.options || []).map((o) => o.label).join(", ");
  const showOpts = slide.type === "choice";
  const showScale = slide.type === "rating_scale";
  const scale = slide.scale === 7 || slide.scale === 10 ? slide.scale : 5;

  panel.innerHTML = `
    <div class="session-inline-form">
      <label class="field">
        <span>${esc(tx("home.question"))}</span>
        <input type="text" data-inline-q maxlength="500" value="${esc(q)}" />
      </label>
      ${
        showOpts
          ? `<label class="field">
              <span>${esc(tx("events.slides.optionsCsv"))}</span>
              <input type="text" data-inline-opts maxlength="500" value="${esc(optsCsv)}" placeholder="A, B, C" />
            </label>`
          : ""
      }
      ${
        showScale
          ? `<label class="field">
              <span>${esc(tx("events.slides.scale"))}</span>
              <select data-inline-scale>
                <option value="5"${scale === 5 ? " selected" : ""}>5</option>
                <option value="7"${scale === 7 ? " selected" : ""}>7</option>
                <option value="10"${scale === 10 ? " selected" : ""}>10</option>
              </select>
            </label>`
          : ""
      }
      <div class="session-inline-actions">
        <button type="button" class="btn primary btn--sm" data-inline-save>${esc(tx("events.slides.inlineSave"))}</button>
        <button type="button" class="btn ghost btn--sm" data-inline-cancel>${esc(tx("events.slides.inlineCancel"))}</button>
        <button type="button" class="btn ghost btn--sm" data-inline-full>${esc(tx("events.slides.fullEdit"))}</button>
      </div>
      <p class="session-inline-error" data-inline-err hidden role="alert"></p>
    </div>
  `;

  const qInput = panel.querySelector("[data-inline-q]");
  qInput?.focus?.();
  qInput?.select?.();

  const discard = () => {
    if (panel.dataset.dirty === "1" && !confirm(tx("events.slides.discard"))) return;
    clearTimeout(panel._autoTimer);
    setDeckDirtyGuard(false);
    closeInlineEditor(row);
  };

  panel.oninput = () => {
    panel.dataset.dirty = "1";
    setDeckDirtyGuard(true);
    clearTimeout(panel._autoTimer);
    panel._autoTimer = setTimeout(() => {
      panel.querySelector("[data-inline-save]")?.click();
    }, 30000);
  };

  panel.querySelector("[data-inline-cancel]")?.addEventListener("click", discard);
  panel.querySelector("[data-inline-full]")?.addEventListener("click", () => {
    if (panel.dataset.dirty === "1" && !confirm(tx("events.slides.discard"))) return;
    clearTimeout(panel._autoTimer);
    setDeckDirtyGuard(false);
    closeInlineEditor(row);
    openSlideEditor(root, code, slide, index);
  });

  panel.querySelector("[data-inline-save]")?.addEventListener("click", async () => {
    clearTimeout(panel._autoTimer);
    const question = String(panel.querySelector("[data-inline-q]")?.value || "").trim();
    const errEl = panel.querySelector("[data-inline-err]");
    if (!question) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = tx("events.slides.questionRequired");
      }
      return;
    }
    const payload = {
      question,
      notes: slide.notes,
      plannedMinutes: slide.plannedMinutes,
      resultsVisible: slide.resultsVisible,
      moderated: slide.moderated,
      qaTimer: slide.qaTimer,
      style: slide.style,
      rating: slide.rating,
    };
    if (showOpts) {
      const labels = String(panel.querySelector("[data-inline-opts]")?.value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (labels.length < 2 || labels.length > 6) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = tx("events.slides.optionsRange");
        }
        return;
      }
      const prev = slide.options || [];
      payload.options = labels.map((label, i) => ({
        id: prev[i]?.id || `o${i + 1}`,
        label,
      }));
    }
    if (showScale) {
      payload.scale = Number(panel.querySelector("[data-inline-scale]")?.value) || 5;
    }
    const btn = panel.querySelector("[data-inline-save]");
    if (btn) btn.disabled = true;
    const res = await api.updateSlide(code, slide.id, payload);
    if (btn) btn.disabled = false;
    if (!res?.ok) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = res?.error || tx("events.slides.saveFail");
      }
      showDeckToast(tx("events.slides.saveFail"));
      return;
    }
    panel.dataset.dirty = "0";
    setDeckDirtyGuard(false);
    showDeckToast(tx("events.slides.saved"));
    await renderSessionDeck(root, code, pageSeq);
  });

  panel.querySelector("[data-inline-q]")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      discard();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      panel.querySelector("[data-inline-save]")?.click();
    }
  });
}

/** Inline-Panel einer Zeile einklappen. */
function closeInlineEditor(row) {
  if (!row) return;
  row.classList.remove("is-editing");
  row.draggable = true;
  const panel = row.querySelector(".session-slide-inline");
  if (panel) {
    clearTimeout(panel._autoTimer);
    panel.hidden = true;
    panel.innerHTML = "";
    delete panel.dataset.dirty;
    panel.oninput = null;
  }
}

/**
 * Modal-Editor für eine Folie öffnen.
 * @param {HTMLElement} root
 * @param {string} code
 * @param {object} slide
 * @param {number} index 0-basiert
 */
function openSlideEditor(root, code, slide, index) {
  const dlg = document.getElementById("edit-slide-dialog");
  const body = document.getElementById("edit-slide-body");
  const errEl = document.getElementById("edit-slide-error");
  const statusEl = document.getElementById("edit-slide-status");
  const form = document.getElementById("edit-slide-form");
  if (!dlg || !body || !form) return;

  const draft = JSON.parse(JSON.stringify(slide));
  let dirty = false;
  let closingForced = false;
  let saving = false;
  let autoTimer = 0;
  const AUTO_MS = 30000;

  const setStatus = (text, show = true) => {
    if (!statusEl) return;
    statusEl.hidden = !show || !text;
    statusEl.textContent = text || "";
  };

  document.getElementById("edit-slide-icon").textContent = typeIcon(slide.type);
  document.getElementById("edit-slide-type-label").textContent =
    `${index + 1} · ${typeLabel(slide.type, tx)}`;
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
  setStatus("", false);

  body.innerHTML = buildEditorFields(draft);

  const clearAuto = () => {
    clearTimeout(autoTimer);
    autoTimer = 0;
  };

  const markDirty = () => {
    dirty = true;
    setDeckDirtyGuard(true);
    clearAuto();
    autoTimer = setTimeout(() => {
      runAutoSave();
    }, AUTO_MS);
  };

  /**
   * Auto-Save ohne Modal zu schließen (Deck-Zeile nur lokal aktualisieren).
   */
  const runAutoSave = async () => {
    if (!dirty || saving || !dlg.open) return;
    const collected = collectEditorPayload(body, draft);
    const validation = validateEditorPayload(collected, draft.type);
    if (!validation.ok) return;
    saving = true;
    setStatus(tx("events.slides.saving"));
    const res = await api.updateSlide(code, slide.id, collected);
    saving = false;
    if (!res?.ok) {
      setStatus(res?.error || tx("events.slides.saveFail"));
      return;
    }
    dirty = false;
    setDeckDirtyGuard(false);
    Object.assign(draft, collected);
    slide.question = collected.question;
    if (collected.options) slide.options = collected.options;
    patchDeckRowMeta(root, slide.id, collected.question);
    setStatus(tx("events.slides.autosaved"));
    showDeckToast(tx("events.slides.autosaved"), 1800);
  };

  bindEditorFieldEvents(body, draft, markDirty);
  form.oninput = markDirty;
  form.onchange = markDirty;

  const tryClose = () => {
    if (dirty && !confirm(tx("events.slides.discard"))) return false;
    clearAuto();
    dirty = false;
    setDeckDirtyGuard(false);
    closingForced = true;
    dlg.close?.();
    return true;
  };

  document.getElementById("btn-edit-cancel").onclick = () => tryClose();

  document.getElementById("btn-edit-delete").onclick = async () => {
    if (!confirm(tx("events.slides.delConfirm"))) return;
    clearAuto();
    closingForced = true;
    dirty = false;
    setDeckDirtyGuard(false);
    dlg.close?.();
    await deleteSlideWithUndo(root, code, slide, index);
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    clearAuto();
    const collected = collectEditorPayload(body, draft);
    const validation = validateEditorPayload(collected, draft.type);
    if (!validation.ok) {
      applyEditorErrors(body, validation.fields);
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = validation.error;
      }
      return;
    }
    if (errEl) errEl.hidden = true;
    const saveBtn = document.getElementById("btn-edit-save");
    if (saveBtn) saveBtn.disabled = true;
    setStatus(tx("events.slides.saving"));
    saving = true;
    const res = await api.updateSlide(code, slide.id, collected);
    saving = false;
    if (saveBtn) saveBtn.disabled = false;
    if (!res?.ok) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = res?.error || tx("events.slides.saveFail");
      }
      setStatus("", false);
      showDeckToast(tx("events.slides.saveFail"));
      return;
    }
    dirty = false;
    setDeckDirtyGuard(false);
    closingForced = true;
    dlg.close?.();
    showDeckToast(tx("events.slides.saved"));
    await renderSessionDeck(root, code, pageSeq);
  };

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      form.requestSubmit?.();
    }
  };
  dlg.addEventListener("keydown", onKey);

  dlg.addEventListener(
    "cancel",
    (e) => {
      if (dirty) {
        e.preventDefault();
        tryClose();
      }
    },
    { once: true }
  );

  dlg.addEventListener(
    "close",
    () => {
      clearAuto();
      setDeckDirtyGuard(false);
      dlg.removeEventListener("keydown", onKey);
      form.onsubmit = null;
      form.oninput = null;
      form.onchange = null;
      setStatus("", false);
    },
    { once: true }
  );

  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.hidden = false;

  body.querySelector("#edit-question")?.focus?.();
}

/**
 * Fragetext in der Deck-Liste aktualisieren, ohne die ganze Seite neu zu rendern.
 * @param {HTMLElement} root
 * @param {string} slideId
 * @param {string} question
 */
function patchDeckRowMeta(root, slideId, question) {
  const row = [...root.querySelectorAll(".event-slide-row")].find(
    (r) => r.getAttribute("data-slide-id") === slideId
  );
  const strong = row?.querySelector(".session-slide-meta strong");
  if (strong) strong.textContent = question || tx("events.slides.untitled");
}

/**
 * Formularfelder je Folientyp erzeugen.
 * @param {object} slide
 */
function buildEditorFields(slide) {
  const q = slide.question || "";
  const type = slide.type;
  const parts = [];

  parts.push(`
    <label class="field">
      <span>${esc(tx("home.question"))} *</span>
      <input id="edit-question" name="question" maxlength="500" required value="${esc(q)}" />
      <span class="field-hint" data-char-for="edit-question">${esc(tx("events.slides.chars", { n: q.length, max: 500 }))}</span>
    </label>
  `);

  if (OPTION_TYPES.has(type)) {
    parts.push(`<div class="slide-edit-options" id="edit-options">${renderOptionRows(slide)}</div>
      <button type="button" class="btn ghost btn--sm" id="btn-add-option">${esc(tx("events.slides.addOption"))}</button>`);
  }

  if (type === "rating_scale") {
    const scale = slide.scale === 7 || slide.scale === 10 ? slide.scale : 5;
    const style = slide.style || (slide.rating?.icons ? "icons" : "numbers");
    parts.push(`
      <label class="field"><span>${esc(tx("events.slides.scale"))}</span>
        <select id="edit-scale">
          <option value="5"${scale === 5 ? " selected" : ""}>5</option>
          <option value="7"${scale === 7 ? " selected" : ""}>7</option>
          <option value="10"${scale === 10 ? " selected" : ""}>10</option>
        </select>
      </label>
      <label class="field"><span>${esc(tx("events.slides.style"))}</span>
        <select id="edit-style">
          <option value="icons"${style === "icons" ? " selected" : ""}>Smileys / Icons</option>
          <option value="stars"${style === "stars" ? " selected" : ""}>Sterne</option>
          <option value="numbers"${style === "numbers" ? " selected" : ""}>Zahlen</option>
        </select>
      </label>
    `);
  }

  if (type === "quiz") {
    const dur = Number(slide.duration) || 30;
    parts.push(`
      <label class="field"><span>${esc(tx("events.slides.duration"))}</span>
        <input id="edit-duration" type="number" min="5" max="60" value="${esc(String(dur))}" />
      </label>
    `);
  }

  if (type === "qa") {
    const moderated = slide.moderated !== false;
    parts.push(`
      <label class="check"><input type="checkbox" id="edit-moderated"${moderated ? " checked" : ""} /> ${esc(tx("events.slides.moderated"))}</label>
    `);
  }

  if (INTERACTIVE_TYPES.has(type)) {
    parts.push(buildInteractionEditorFields(slide));
  }

  if (type === "picker") {
    const allowMultiple = slide.allowMultiple === true;
    const maxSel = slide.maxSelections != null ? slide.maxSelections : "";
    const enableSearch = slide.enableSearch !== false;
    const layout = slide.layout || "list";
    const hasCats = Array.isArray(slide.categories) && slide.categories.length > 0;
    parts.push(`
      <label class="check"><input type="checkbox" id="edit-picker-multi"${allowMultiple ? " checked" : ""} /> ${esc(tx("picker.allowMultiple"))}</label>
      <label class="field" id="edit-picker-max-wrap"${allowMultiple ? "" : " hidden"}><span>${esc(tx("picker.maxSelections"))}</span>
        <input id="edit-picker-max" type="number" min="1" max="50" value="${esc(String(maxSel))}" />
      </label>
      <label class="check"><input type="checkbox" id="edit-picker-search"${enableSearch ? " checked" : ""} /> ${esc(tx("picker.enableSearch"))}</label>
      <label class="check"><input type="checkbox" id="edit-picker-categories"${hasCats ? " checked" : ""} /> ${esc(tx("picker.useCategories"))}</label>
      <label class="field"><span>${esc(tx("picker.layout"))}</span>
        <select id="edit-picker-layout">
          <option value="list"${layout === "list" ? " selected" : ""}>${esc(tx("picker.layoutList"))}</option>
          <option value="grid"${layout === "grid" ? " selected" : ""}>${esc(tx("picker.layoutGrid"))}</option>
          <option value="dropdown"${layout === "dropdown" ? " selected" : ""}>${esc(tx("picker.layoutDropdown"))}</option>
        </select>
      </label>
      <div id="edit-categories-wrap" class="picker-categories-editor"${hasCats ? "" : " hidden"}>
        <span class="field-label">${esc(tx("picker.categories"))}</span>
        <div id="edit-category-fields"></div>
        <button type="button" id="btn-edit-add-category" class="btn ghost btn--sm">${esc(tx("picker.addCategory"))}</button>
      </div>
      <div id="edit-picker-preview" class="picker-editor-preview" aria-live="polite"></div>
    `);
  }

  if (HIDEABLE_TYPES.has(type)) {
    parts.push(`
      <label class="check"><input type="checkbox" id="edit-hide-results"${slide.resultsVisible ? "" : " checked"} /> ${esc(tx("events.slides.hideResults"))}</label>
    `);
  }

  parts.push(`
    <label class="field"><span>${esc(tx("events.slides.planned"))}</span>
      <input id="edit-planned" type="number" min="1" max="180" value="${slide.plannedMinutes != null ? esc(String(slide.plannedMinutes)) : ""}" />
    </label>
    <label class="field"><span>${esc(tx("events.slides.notes"))}</span>
      <textarea id="edit-notes" maxlength="4000" rows="3">${esc(slide.notes || "")}</textarea>
      <span class="field-hint" data-char-for="edit-notes">${esc(tx("events.slides.chars", { n: (slide.notes || "").length, max: 4000 }))}</span>
    </label>
  `);

  return parts.join("");
}

/**
 * Editor-Abschnitt „Ablauf und Zeitlimit“ für interaktive Folien.
 * @param {object} slide
 */
function buildInteractionEditorFields(slide) {
  const type = slide.type;
  if (type === "quiz") {
    return `
      <fieldset class="slide-edit-ix">
        <legend>${esc(tx("events.slides.ixSection"))}</legend>
        <p class="muted">${esc(tx("events.slides.ixQuizHint"))}</p>
      </fieldset>
    `;
  }
  const ix = slide.interaction || {};
  const manualStart = ix.manualStart !== false;
  const timerOn = Boolean(ix.timerEnabled);
  const timerSec = Number(ix.timerSec) || 60;
  const presetOpts = IX_TIMER_PRESETS.map(
    (s) => `<option value="${s}"${timerSec === s ? " selected" : ""}>${s} s</option>`
  ).join("");
  return `
    <fieldset class="slide-edit-ix">
      <legend>${esc(tx("events.slides.ixSection"))}</legend>
      <p class="muted">${esc(tx("events.slides.ixHint"))}</p>
      <label class="check">
        <input type="checkbox" id="edit-ix-manual"${manualStart ? " checked" : ""} />
        ${esc(tx("events.slides.ixManualStart"))}
      </label>
      <label class="check">
        <input type="checkbox" id="edit-ix-timer"${timerOn ? " checked" : ""} />
        ${esc(tx("events.slides.ixTimerEnabled"))}
      </label>
      <div id="edit-ix-timer-wrap"${timerOn ? "" : " hidden"}>
        <label class="field"><span>${esc(tx("events.slides.ixTimerPreset"))}</span>
          <select id="edit-ix-timer-preset">${presetOpts}</select>
        </label>
        <label class="field"><span>${esc(tx("events.slides.ixTimerCustom"))}</span>
          <input id="edit-ix-timer-sec" type="number" min="30" max="300" step="10" value="${esc(String(timerSec))}" />
        </label>
      </div>
    </fieldset>
  `;
}

/**
 * Options-Zeilen für choice/quiz/ranking/…
 * @param {object} slide
 */
function renderOptionRows(slide) {
  const opts = Array.isArray(slide.options) && slide.options.length ? slide.options : [{ label: "" }, { label: "" }];
  const correct = new Set(
    Array.isArray(slide.correctIndexes)
      ? slide.correctIndexes
      : slide.correctIndex != null
        ? [slide.correctIndex]
        : []
  );
  return opts
    .map((o, i) => {
      const id = o.id || `o${i + 1}`;
      let extra = "";
      if (slide.type === "quiz") {
        extra = `<label class="check slide-edit-correct"><input type="checkbox" data-correct="${i}"${correct.has(i) ? " checked" : ""} /> ${esc(tx("events.slides.correct"))}</label>`;
      }
      if (slide.type === "image_choice") {
        const img = o.image
          ? `<img class="slide-edit-thumb" src="${esc(o.image)}" alt="" />`
          : `<span class="slide-edit-thumb slide-edit-thumb--empty">–</span>`;
        extra = `${img}
          <label class="btn ghost btn--sm slide-edit-file">
            ${esc(tx("events.slides.imageUpload"))}
            <input type="file" accept="image/png,image/jpeg,image/webp" data-img-file="${i}" hidden />
          </label>
          <input type="hidden" data-img="${i}" value="${esc(o.image || "")}" />`;
      }
      if (slide.type === "datetime") {
        const iso = o.iso || "";
        let local = "";
        try {
          if (iso) {
            const d = new Date(iso);
            if (!Number.isNaN(d.getTime())) local = d.toISOString().slice(0, 16);
          }
        } catch {
          /* ignore */
        }
        extra = `<input type="datetime-local" data-iso="${i}" value="${esc(local)}" />`;
      }
      if (slide.type === "picker" && Array.isArray(slide.categories) && slide.categories.length) {
        extra += optionCategorySelectHtml(slide.categories, o.category || "", i);
      }
      return `<div class="slide-edit-option" data-opt-row="${i}">
        <input type="text" data-opt-label="${i}" maxlength="${slide.type === "picker" ? 100 : 80}" value="${esc(o.label || "")}" placeholder="${esc(tx("events.slides.imageAlt"))}" data-opt-id="${esc(id)}" />
        ${extra}
        <button type="button" class="btn ghost btn--sm" data-opt-remove="${i}" aria-label="${esc(tx("events.slides.removeOption"))}">×</button>
      </div>`;
    })
    .join("");
}

/**
 * Dynamische Optionen + Zeichen-Zähler.
 * @param {HTMLElement} body
 * @param {object} draft
 * @param {() => void} onDirty
 */
function bindEditorFieldEvents(body, draft, onDirty) {
  body.querySelectorAll("[data-char-for]").forEach((hint) => {
    const id = hint.getAttribute("data-char-for");
    const input = body.querySelector(`#${id}`);
    if (!input) return;
    const max = Number(input.getAttribute("maxlength")) || 500;
    const sync = () => {
      hint.textContent = tx("events.slides.chars", { n: String(input.value || "").length, max });
    };
    input.addEventListener("input", sync);
  });

  body.querySelector("#btn-add-option")?.addEventListener("click", () => {
    const wrap = body.querySelector("#edit-options");
    if (!wrap) return;
    const rows = wrap.querySelectorAll("[data-opt-row]");
    const limits = OPTION_LIMITS[draft.type] || OPTION_LIMITS.default;
    if (rows.length >= limits.max) return;
    draft.options = collectOptionsFromDom(body, draft.type);
    draft.options.push({ id: `o${draft.options.length + 1}`, label: "" });
    wrap.innerHTML = renderOptionRows(draft);
    bindOptionRowEvents(body, draft, onDirty);
    onDirty();
  });

  body.querySelector("#edit-picker-multi")?.addEventListener("change", () => {
    const on = Boolean(body.querySelector("#edit-picker-multi")?.checked);
    const wrap = body.querySelector("#edit-picker-max-wrap");
    if (wrap) wrap.hidden = !on;
    refreshEditPickerPreview(body, draft);
    onDirty();
  });

  if (draft.type === "picker") {
    let catEditor = null;
    const catHost = body.querySelector("#edit-category-fields");
    const syncCatsToDraft = () => {
      draft.categories = body.querySelector("#edit-picker-categories")?.checked
        ? collectCategoriesFromHost(catHost)
        : [];
      const wrap = body.querySelector("#edit-options");
      if (wrap) {
        draft.options = collectOptionsFromDom(body, draft.type);
        wrap.innerHTML = renderOptionRows(draft);
        bindOptionRowEvents(body, draft, onDirty);
      }
      refreshEditPickerPreview(body, draft);
    };
    if (catHost) {
      catEditor = mountCategoryEditor(catHost, draft.categories || [], {
        t: tx,
        onChange: () => {
          syncCatsToDraft();
          onDirty();
        },
      });
    }
    body.querySelector("#btn-edit-add-category")?.addEventListener("click", () => {
      catEditor?.addCategory();
      syncCatsToDraft();
      onDirty();
    });
    body.querySelector("#edit-picker-categories")?.addEventListener("change", () => {
      const on = Boolean(body.querySelector("#edit-picker-categories")?.checked);
      const wrap = body.querySelector("#edit-categories-wrap");
      if (wrap) wrap.hidden = !on;
      if (on && catEditor && catHost && !catHost.children.length) {
        catEditor.addCategory();
        catEditor.addCategory();
      }
      if (!on) draft.categories = [];
      syncCatsToDraft();
      onDirty();
    });
    ["#edit-picker-search", "#edit-picker-layout", "#edit-question"].forEach((sel) => {
      body.querySelector(sel)?.addEventListener("change", () => refreshEditPickerPreview(body, draft));
      body.querySelector(sel)?.addEventListener("input", () => refreshEditPickerPreview(body, draft));
    });
    refreshEditPickerPreview(body, draft);
  }

  body.querySelector("#edit-ix-timer")?.addEventListener("change", () => {
    const wrap = body.querySelector("#edit-ix-timer-wrap");
    if (wrap) wrap.hidden = !body.querySelector("#edit-ix-timer")?.checked;
    onDirty();
  });
  body.querySelector("#edit-ix-timer-preset")?.addEventListener("change", () => {
    const sec = body.querySelector("#edit-ix-timer-preset")?.value;
    const custom = body.querySelector("#edit-ix-timer-sec");
    if (custom && sec) custom.value = sec;
    onDirty();
  });
  body.querySelector("#edit-ix-manual")?.addEventListener("change", onDirty);

  bindOptionRowEvents(body, draft, onDirty);
}

/** Live-Vorschau im Deck-Modal aus dem aktuellen Formularstand. */
function refreshEditPickerPreview(body, draft) {
  if (draft.type !== "picker") return;
  const host = body.querySelector("#edit-picker-preview");
  if (!host) return;
  const collected = collectEditorPayload(body, draft);
  const previewSlide = {
    ...draft,
    ...collected,
    type: "picker",
    options: collected.options || draft.options,
    categories: collected.categories ?? draft.categories ?? [],
  };
  refreshPickerPreview(host, previewSlide, { t: tx });
}

function bindOptionRowEvents(body, draft, onDirty) {
  const wrap = body.querySelector("#edit-options");
  if (!wrap) return;

  wrap.querySelectorAll("[data-opt-remove]").forEach((btn) => {
    btn.onclick = () => {
      const rows = [...wrap.querySelectorAll("[data-opt-row]")];
      const limits = OPTION_LIMITS[draft.type] || OPTION_LIMITS.default;
      if (rows.length <= limits.min) return;
      const i = Number(btn.getAttribute("data-opt-remove"));
      draft.options = collectOptionsFromDom(body, draft.type).filter((_, idx) => idx !== i);
      if (Array.isArray(draft.correctIndexes)) {
        draft.correctIndexes = draft.correctIndexes
          .filter((c) => c !== i)
          .map((c) => (c > i ? c - 1 : c));
      }
      wrap.innerHTML = renderOptionRows(draft);
      bindOptionRowEvents(body, draft, onDirty);
      onDirty();
    };
  });

  wrap.querySelectorAll("[data-img-file]").forEach((input) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const i = Number(input.getAttribute("data-img-file"));
      const dataUrl = await readImageAsDataUrl(file, 96 * 1024);
      const hidden = wrap.querySelector(`[data-img="${i}"]`);
      if (hidden) hidden.value = dataUrl || "";
      draft.options = collectOptionsFromDom(body, draft.type);
      wrap.innerHTML = renderOptionRows(draft);
      bindOptionRowEvents(body, draft, onDirty);
      onDirty();
    };
  });
}

/**
 * Bild als Data-URL lesen und ggf. verkleinern (max. Zeichen).
 * @param {File} file
 * @param {number} maxChars
 */
function readImageAsDataUrl(file, maxChars) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      if (raw.length <= maxChars) {
        resolve(raw);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        const scale = Math.min(1, 640 / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.85;
        let out = canvas.toDataURL("image/jpeg", quality);
        while (out.length > maxChars && quality > 0.4) {
          quality -= 0.1;
          out = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(out.length <= maxChars ? out : "");
      };
      img.onerror = () => resolve("");
      img.src = raw;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function collectOptionsFromDom(body, type) {
  const wrap = body.querySelector("#edit-options");
  if (!wrap) return [];
  return [...wrap.querySelectorAll("[data-opt-row]")].map((row, i) => {
    const labelInput = row.querySelector("[data-opt-label]");
    const id = labelInput?.getAttribute("data-opt-id") || `o${i + 1}`;
    const label = String(labelInput?.value || "").trim();
    const opt = { id, label: label || `Option ${i + 1}` };
    if (type === "image_choice") {
      const img = row.querySelector(`[data-img="${i}"]`)?.value || "";
      if (img) opt.image = img;
    }
    if (type === "datetime") {
      const local = row.querySelector(`[data-iso="${i}"]`)?.value;
      if (local) {
        const d = new Date(local);
        if (!Number.isNaN(d.getTime())) {
          opt.iso = d.toISOString();
          if (!label) opt.label = d.toLocaleString("de-DE");
        }
      }
    }
    if (type === "picker") {
      const cat = row.querySelector(`[data-opt-cat="${i}"]`)?.value || "";
      if (cat) opt.category = cat;
    }
    return opt;
  });
}

/**
 * Payload für PATCH/update aus dem Formular lesen.
 * @param {HTMLElement} body
 * @param {object} slide  Original (Typ/ID)
 */
function collectEditorPayload(body, slide) {
  const question = String(body.querySelector("#edit-question")?.value || "").trim();
  const notes = String(body.querySelector("#edit-notes")?.value || "");
  const plannedRaw = body.querySelector("#edit-planned")?.value;
  const payload = {
    question,
    notes,
    plannedMinutes: plannedRaw === "" || plannedRaw == null ? null : Number(plannedRaw),
  };

  if (OPTION_TYPES.has(slide.type)) {
    payload.options = collectOptionsFromDom(body, slide.type);
  }

  if (slide.type === "quiz") {
    payload.duration = Number(body.querySelector("#edit-duration")?.value) || 30;
    payload.correctIndexes = [...body.querySelectorAll("[data-correct]:checked")].map((el) =>
      Number(el.getAttribute("data-correct"))
    );
  }

  if (slide.type === "rating_scale") {
    payload.scale = Number(body.querySelector("#edit-scale")?.value) || 5;
    payload.style = body.querySelector("#edit-style")?.value || "icons";
  }

  if (slide.type === "qa") {
    payload.moderated = Boolean(body.querySelector("#edit-moderated")?.checked);
  }

  if (INTERACTIVE_TYPES.has(slide.type) && slide.type !== "quiz") {
    const manualStart = body.querySelector("#edit-ix-manual")?.checked !== false;
    const timerEnabled = Boolean(body.querySelector("#edit-ix-timer")?.checked);
    let timerSec = Number(body.querySelector("#edit-ix-timer-sec")?.value) || 60;
    timerSec = Math.max(30, Math.min(300, Math.round(timerSec)));
    payload.interaction = {
      ...(slide.interaction || {}),
      manualStart,
      timerEnabled,
      timerSec,
      state: manualStart ? "active" : "running",
    };
    if (slide.type === "qa") {
      payload.qaTimer = {
        ...(slide.qaTimer || {}),
        enabled: timerEnabled,
        limitSec: timerSec,
      };
    }
  }

  if (slide.type === "picker") {
    payload.allowMultiple = Boolean(body.querySelector("#edit-picker-multi")?.checked);
    const maxRaw = body.querySelector("#edit-picker-max")?.value;
    payload.maxSelections = maxRaw === "" || maxRaw == null ? null : Number(maxRaw);
    payload.enableSearch = Boolean(body.querySelector("#edit-picker-search")?.checked);
    payload.layout = body.querySelector("#edit-picker-layout")?.value || "list";
    payload.categories = body.querySelector("#edit-picker-categories")?.checked
      ? collectCategoriesFromHost(body.querySelector("#edit-category-fields"))
      : [];
  }

  if (HIDEABLE_TYPES.has(slide.type)) {
    /* Checkbox = „verbergen“ → resultsVisible ist das Gegenteil */
    payload.resultsVisible = !body.querySelector("#edit-hide-results")?.checked;
  }

  return payload;
}

/**
 * Frontend-Validierung vor dem Speichern.
 * @param {object} payload
 * @param {string} type
 */
function validateEditorPayload(payload, type) {
  const fields = {};
  if (!payload.question) {
    fields.question = tx("events.slides.questionRequired");
    return { ok: false, error: fields.question, fields };
  }
  if (payload.question.length > 500) {
    fields.question = "max 500";
    return { ok: false, error: fields.question, fields };
  }
  if (OPTION_TYPES.has(type)) {
    const n = payload.options?.length || 0;
    const limits = OPTION_LIMITS[type] || OPTION_LIMITS.default;
    if (n < limits.min || n > limits.max) {
      fields.options = type === "picker" ? tx("picker.optionsRange") : tx("events.slides.optionsRange");
      return { ok: false, error: fields.options, fields };
    }
  }
  if (type === "picker" && payload.allowMultiple && payload.maxSelections != null) {
    const n = payload.options?.length || 0;
    if (payload.maxSelections > n) {
      fields.maxSelections = tx("picker.maxTooHigh");
      return { ok: false, error: fields.maxSelections, fields };
    }
  }
  if (type === "quiz") {
    if (!payload.correctIndexes?.length) {
      fields.correctIndexes = tx("events.slides.quizCorrect");
      return { ok: false, error: fields.correctIndexes, fields };
    }
  }
  return { ok: true, fields: {} };
}

function applyEditorErrors(body, fields) {
  body.querySelectorAll(".field--error").forEach((el) => el.classList.remove("field--error"));
  if (fields.question) {
    body.querySelector("#edit-question")?.closest(".field")?.classList.add("field--error");
  }
  if (fields.options || fields.correctIndexes) {
    body.querySelector("#edit-options")?.classList.add("field--error");
  }
}
