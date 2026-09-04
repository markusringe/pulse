#!/usr/bin/env node
/**
 * Fehlerkatalog: resolveErrorKey / explainError / explainServerError (Teilnehmer-WS).
 */
const path = require("path");
const { pathToFileURL } = require("url");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, "../frontend/js/errors.js")).href);
  const { resolveErrorKey, explainError, explainServerError } = mod;

  assert(resolveErrorKey("Session pausiert") === "paused", "Session pausiert → paused");
  assert(explainError("Session pausiert").key === "paused", "explainError Session pausiert");
  assert(
    !explainError("Session pausiert").cause.includes("unerwarteter Fehler"),
    "Session pausiert ohne generischen Text"
  );

  assert(
    resolveErrorKey("Dieses Event nimmt noch keine Teilnahmen an.") === "event_planned",
    "Event geplant"
  );
  assert(
    resolveErrorKey("Dieses Event ist archiviert.") === "event_archived",
    "Event archiviert"
  );

  const serverPaused = explainServerError({ message: "Session pausiert" });
  assert(serverPaused.key === "paused", "explainServerError message-only paused");

  const serverMsg = explainServerError({
    message: "Spezielle Meldung vom Server ohne Code",
  });
  assert(serverMsg.key === "server_message", "Unbekannter Server-Text → server_message");
  assert(serverMsg.cause.includes("Spezielle Meldung"), "Server-Text als Ursache");

  assert(resolveErrorKey("type") === "type", "type-Code");
  assert(resolveErrorKey("emoji-limit") === "emoji_limit", "emoji-limit");

  console.log("test-errors: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
