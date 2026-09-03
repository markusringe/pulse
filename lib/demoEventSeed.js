/**
 * Demo-Event „Bürgerversammlung“ beim ersten Start (leerer Event-Katalog).
 * Termin: morgen, 18:00 — buntes Folien-Set zur Bürgerbeteiligung.
 */

/**
 * ISO-Datum (YYYY-MM-DD) für heute + offset Tage.
 * @param {number} days
 * @param {number} [now]
 */
function addDaysIso(days, now = Date.now()) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Startzeit morgen um hour:minute (lokal) als ISO-String.
 * @param {number} [hour]
 * @param {number} [minute]
 */
function tomorrowStartTimeIso(hour = 18, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Roh-Folien für normalizeSlide (server.js) — Mix aus Use-Case Bürgerversammlung + weiteren Typen.
 * @returns {object[]}
 */
function buergerversammlungSlidesRaw() {
  return [
    {
      type: "choice",
      question: "Welches Thema sollen wir heute zuerst vertiefen?",
      resultsVisible: true,
      options: [
        { label: "🌳 Klimaschutz & Energie" },
        { label: "🚌 Mobilität & Verkehr" },
        { label: "🏘️ Quartiersentwicklung" },
        { label: "♻️ Abfall & Kreislauf" },
      ],
    },
    {
      type: "choice",
      question: "Wie wichtig ist Ihnen Bürgerbeteiligung in Entscheidungen?",
      resultsVisible: true,
      options: [
        { label: "Sehr wichtig" },
        { label: "Wichtig" },
        { label: "Eher unwichtig" },
        { label: "Keine Meinung" },
      ],
    },
    {
      type: "choice",
      question: "Welches Beteiligungsformat bevorzugen Sie künftig?",
      resultsVisible: true,
      options: [
        { label: "Präsenz vor Ort" },
        { label: "Online / digital" },
        { label: "Hybrid" },
        { label: "Schriftlich / asynchron" },
      ],
    },
    {
      type: "wordcloud",
      question: "Ein Wort, das diese Bürgerversammlung für Sie beschreibt",
      resultsVisible: true,
    },
    {
      type: "wordcloud",
      question: "Was soll unsere Stadt bis 2030 auszeichnen?",
      resultsVisible: true,
    },
    {
      type: "ranking",
      question: "Bitte ordnen Sie diese Maßnahmen nach Priorität (wichtigste oben)",
      resultsVisible: true,
      options: [
        { label: "Solar auf öffentlichen Dächern" },
        { label: "Mehr Radwege" },
        { label: "Grünflächen erhalten" },
        { label: "ÖPNV ausbauen" },
      ],
    },
    {
      type: "qa",
      question: "Fragen an Stadtverwaltung und Politik",
      moderated: true,
      questions: [
        {
          id: "bv1",
          text: "Wie werden unsere Vorschläge in den Klimaplan einfließen?",
          authorId: "demo",
          authorName: "Maria K.",
          upvotes: 12,
          voters: [],
          status: "approved",
          createdAt: Date.now() - 120000,
          comments: [],
        },
        {
          id: "bv2",
          text: "Gibt es Förderprogramme für Balkon-Solar?",
          authorId: "demo2",
          authorName: "Thomas R.",
          upvotes: 8,
          voters: [],
          status: "pending",
          createdAt: Date.now() - 60000,
          comments: [],
        },
      ],
    },
    {
      type: "qa",
      question: "Diskussion: Klimaschutz im Quartier",
      moderated: true,
      questions: [],
    },
    {
      type: "quiz",
      question: "Was ist das EU-Ziel für Treibhausgas-Reduktion bis 2030 (Basis 1990)?",
      duration: 45,
      options: [
        { label: "Mindestens 30 %" },
        { label: "Mindestens 55 %" },
        { label: "Mindestens 75 %" },
        { label: "Kein verbindliches Ziel" },
      ],
      correctIndex: 1,
    },
    {
      type: "rating_scale",
      question: "Wie zufrieden sind Sie mit der heutigen Beteiligung?",
      scale: 5,
      style: "icons",
      resultsVisible: true,
    },
    {
      type: "open_text",
      question: "Ihr Vorschlag für die nächste Bürgerversammlung",
      resultsVisible: true,
    },
    {
      type: "points100",
      question: "Verteilen Sie 100 Punkte auf diese Handlungsfelder",
      resultsVisible: true,
      options: [
        { label: "Erneuerbare Energie" },
        { label: "Mobilitätswende" },
        { label: "Biodiversität" },
        { label: "Bildung & Aufklärung" },
      ],
    },
  ];
}

/**
 * Metadaten + Folien für das Demo-Event.
 * @param {string} [ownerUserId]
 */
function buildDemoEventPayload(ownerUserId = "") {
  const startAt = addDaysIso(1);
  return {
    title: "Bürgerversammlung Klimaschutz",
    description:
      "Demo-Veranstaltung zur Bürgerbeteiligung — Umfragen, Wortwolken, moderiertes Q&A und Quiz. Termin morgen, 18:00 Uhr.",
    startAt,
    endAt: startAt,
    startTime: tomorrowStartTimeIso(18, 0),
    status: "planned",
    category: "Bürgerbeteiligung",
    room: "Stadthalle — Saal 1",
    ownerUserId,
    slides: buergerversammlungSlidesRaw(),
    skipLobby: false,
    branding: {
      primary: "#0d6efd",
      secondary: "#20c997",
      footerText: "Demo-Event — Pulse Bürgerbeteiligung",
    },
  };
}

/**
 * Legt das Demo-Event an, wenn noch keine Events existieren.
 * @param {{ eventStore: object, createEventWithSession: Function, userDb?: object }} deps
 */
async function ensureDemoEvent(deps) {
  const { eventStore, createEventWithSession, userDb } = deps;
  const disabled = /^(0|false|off|no)$/i.test(String(process.env.SEED_DEMO_EVENT || "").trim());
  if (disabled) return { seeded: false, reason: "disabled" };
  if (eventStore.list().length > 0) return { seeded: false, reason: "exists" };

  let ownerUserId = "";
  if (userDb?.supported) {
    const admins = await Promise.resolve(userDb.listUsers({ role: "admin", status: "active" }));
    if (Array.isArray(admins) && admins[0]?.id) ownerUserId = admins[0].id;
  }

  const payload = buildDemoEventPayload(ownerUserId);
  const created = await createEventWithSession(payload);
  console.log(
    `[demo-event] Demo angelegt: „${created.event.title}“ am ${created.event.startAt}, Join-Code ${created.session.code}`
  );
  return { seeded: true, eventId: created.event.id, code: created.session.code };
}

module.exports = {
  ensureDemoEvent,
  buergerversammlungSlidesRaw,
  buildDemoEventPayload,
  addDaysIso,
};
