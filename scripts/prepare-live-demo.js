#!/usr/bin/env node
/**
 * Demo-Event für Live-Test vorbereiten: Status „active“, Lobby aus, Interaktion starten.
 * Läuft im Container: docker compose exec -T pulse node scripts/prepare-live-demo.js [code]
 */
const eventStore = require("../lib/events");
const { createDb } = require("../lib/db");
const interactionState = require("../lib/interactionState");
const sessionVersion = require("../lib/sessionVersion");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const code = String(process.argv[2] || "241184").trim();
  const db = createDb();

  const ev = eventStore.bySessionCode(code);
  if (ev) {
    const today = new Date().toISOString().slice(0, 10);
    eventStore.update(ev.id, {
      status: "active",
      startAt: today,
      endAt: today,
    });
    console.log(`Event aktiv gesetzt: ${ev.title} (${ev.id}), Datum ${today}`);
  } else {
    console.warn(`Kein Event-Katalogeintrag für Code ${code} — nur Session wird angepasst.`);
  }

  const row = await db.load(code);
  assert(row, `Session ${code} nicht in der Datenbank`);

  const payload = row.payload || {};
  const session = {
    code: row.code,
    adminHash: row.adminHash,
    createdAt: row.createdAt,
    activeSlideIndex: row.activeSlideIndex || 0,
    slides: payload.slides || [],
    votes: new Map(payload.votes || []),
    paused: false,
    lobby: false,
    rehearsal: Boolean(payload.rehearsal),
    eventId: payload.eventId || ev?.id || "",
    stateVersion: Number(payload.stateVersion) || 0,
  };

  const slide = session.slides[session.activeSlideIndex];
  assert(slide, "Keine aktive Folie");

  if (interactionState.isInteractiveType(slide.type)) {
    interactionState.ensureInteraction(slide, { legacy: false });
    const out = interactionState.applyAction(session, slide, "start", {});
    if (!out.ok) {
      console.warn(`Interaktion start: ${out.error || "fehlgeschlagen"}`);
    } else {
      console.log(`Interaktion läuft: Folie „${slide.question?.slice(0, 40) || slide.id}“ (${slide.type})`);
    }
  }

  sessionVersion.bump(session);

  await db.save({
    code: session.code,
    adminHash: session.adminHash,
    createdAt: session.createdAt,
    activeSlideIndex: session.activeSlideIndex,
    payload: {
      ...payload,
      slides: session.slides,
      votes: [...session.votes.entries()],
      paused: false,
      lobby: false,
      eventId: session.eventId,
      stateVersion: sessionVersion.getVersion(session),
    },
  });

  console.log(`Session ${code} gespeichert — nach Container-Neustart ist der Stand live.`);
  console.log(`Join-URL: /j/${code}`);
}

main().catch((err) => {
  console.error("[prepare-live-demo]", err.message);
  process.exit(1);
});
