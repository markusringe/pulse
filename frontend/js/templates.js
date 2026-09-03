/**
 * Fertige Quiz-Vorlagen für typische Live-Veranstaltungen.
 * Werden lokal zu Folien, bevor die Session ans Backend geht.
 */

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function quizSlide(question, options, correctIndexes, duration = 25) {
  const indexes = Array.isArray(correctIndexes) ? correctIndexes : [correctIndexes];
  return {
    id: uid(),
    type: "quiz",
    question,
    options: options.map((label, i) => ({ id: `o${i + 1}`, label })),
    correctIndexes: indexes,
    correctIndex: indexes[0],
    duration,
    round: { status: "idle" },
    scores: {},
  };
}

/** Kurzes Warm-up vor der eigentlichen Sitzung. */
export function introQuiz() {
  return {
    type: "demo",
    question: "Einführungs-Quiz",
    slides: [
      quizSlide("Wie macht ihr bei Pulse mit?", ["Mit dem sechsstelligen Code", "Per E-Mail", "Nur im Intranet", "Über Zoom-Chat"], 0, 20),
      quizSlide("Was passiert mit euren Antworten?", ["Sie sind anonym", "Sie stehen mit Namen im Protokoll", "Sie gehen an Social Media", "Sie werden telefonisch bestätigt"], 0, 20),
      {
        id: uid(),
        type: "rating_scale",
        question: "Wie startklar fühlt ihr euch für die heutige Sitzung?",
        scale: 5,
        style: "icons",
        options: [
          { id: "1", label: "1" },
          { id: "2", label: "2" },
          { id: "3", label: "3" },
          { id: "4", label: "4" },
          { id: "5", label: "5" },
        ],
        counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        resultsVisible: true,
      },
    ],
  };
}

/** Kurzer Wissens-Check nach einem Input. */
export function knowledgeCheck() {
  return {
    type: "demo",
    question: "Wissens-Check",
    slides: [
      quizSlide("Wofür steht DSGVO in der Praxis hier?", ["Anonyme Teilnahme, keine Cookies", "Pflicht-Accounts für alle", "IP-Protokoll für 10 Jahre", "Öffentliche Namensliste"], 0, 30),
      quizSlide("Welche Stadt-Farben nutzt Pulse als Vorgabe?", ["Blau und Gold", "Rot und Weiß", "Grün und Grau", "Schwarz und Orange"], 0, 25),
      quizSlide("Was tun bei unangemessenen Fragen?", ["Moderation bzw. Notfall-Button", "Nichts, alles bleibt sichtbar", "Den Server neu starten", "Den QR-Code löschen"], 0, 25),
    ],
  };
}

/** Leichter Einstieg vor der eigentlichen Agenda. */
export function icebreakerQuiz() {
  return {
    type: "demo",
    question: "Eisbrecher",
    slides: [
      quizSlide("Wenn euer Team ein Fahrzeug wäre — welches?", ["Straßenbahn", "Lastenrad", "Segelboot", "Rakete"], 1, 20),
      quizSlide("Kaffee, Tee oder beides vor dem ersten Termin?", ["Kaffee", "Tee", "Beides", "Wasser reicht"], [0, 2], 20),
      quizSlide("Welches Emoji beschreibt euren Montag am ehesten?", ["☕", "🚀", "😴", "🎉"], 0, 18),
      {
        id: uid(),
        type: "ranking",
        question: "Sortiert die Pausen-Snacks — Liebling zuerst",
        options: [
          { id: "o1", label: "Brezeln" },
          { id: "o2", label: "Obst" },
          { id: "o3", label: "Schokolade" },
          { id: "o4", label: "Käsewürfel" },
        ],
        ranks: {},
        voteCount: 0,
        resultsVisible: true,
      },
    ],
  };
}
