#!/usr/bin/env node
/**
 * Remote Join-Live-Test: WS-Join + optional Stimme (öffentliche Pulse-Instanz).
 *
 *   node scripts/test-join-live-remote.js --url https://pulse.ringe.us --code 241184
 *   node scripts/test-join-live-remote.js --url https://pulse.ringe.us --code 241184 --vote
 */

function parseArgs(argv) {
  const out = {
    url: process.env.PULSE_SMOKE_URL || "https://pulse.ringe.us",
    code: "241184",
    vote: false,
    timeoutMs: 12000,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) out.url = argv[++i];
    else if (a === "--code" && argv[i + 1]) out.code = argv[++i];
    else if (a === "--vote") out.vote = true;
    else if (a === "--timeout" && argv[i + 1]) out.timeoutMs = Number(argv[++i]) || out.timeoutMs;
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function wsUrl(base) {
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = "";
  u.hash = "";
  return u.toString();
}

function waitWsMessage(ws, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`WS-Timeout: ${type || "message"}`)), timeoutMs);
    const onMsg = (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!type || msg.type === type) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMsg);
        resolve(msg);
      }
    };
    ws.addEventListener("message", onMsg);
  });
}

(async () => {
  const opts = parseArgs(process.argv);
  const code = String(opts.code).replace(/\D/g, "").slice(0, 6);
  assert(code.length === 6, "Join-Code muss sechs Ziffern haben");

  const restUrl = `${opts.url.replace(/\/$/, "")}/api/sessions/${code}`;
  const restRes = await fetch(restUrl);
  assert(restRes.ok, `REST Session ${restRes.status}`);
  const restJson = await restRes.json();
  const session = restJson.session;
  assert(session?.code === code, "REST liefert Session");

  const ws = new WebSocket(wsUrl(opts.url));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("WS open timeout")), opts.timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("WS connection failed"));
    });
  });

  ws.send(
    JSON.stringify({
      type: "join",
      payload: { code, role: "participant", clientId: `live-test-${Date.now()}` },
    })
  );

  const joinMsg = await waitWsMessage(ws, "session", opts.timeoutMs);
  const live = joinMsg.payload?.session;
  assert(live?.code === code, "WS-Join liefert Session (kein Fehler beim Laden)");

  const eventStatus = live.eventMeta?.status;
  console.log(`OK  WS-Join ${code} — eventMeta.status=${eventStatus || "—"}, paused=${live.paused}, lobby=${live.lobby}`);

  if (opts.vote) {
    const slide = live.slides?.[live.activeSlideIndex || 0];
    assert(slide?.type === "choice", "Vote-Test nur für Multiple-Choice-Folie");
    const optionId = slide.options?.[0]?.id;
    assert(optionId, "Keine Antwortoption");

    await new Promise((r) => setTimeout(r, 300));

    const voteResult = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Vote-Timeout (poll:update/error)")), opts.timeoutMs);
      const onMsg = (ev) => {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === "poll:update") {
          clearTimeout(timer);
          ws.removeEventListener("message", onMsg);
          resolve({ kind: "ok", msg });
        } else if (msg.type === "error") {
          clearTimeout(timer);
          ws.removeEventListener("message", onMsg);
          resolve({ kind: "err", msg });
        }
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ type: "vote", payload: { code, slideId: slide.id, optionId } }));
    });

    if (voteResult.kind === "err") {
      const errCode = voteResult.msg.payload?.error || voteResult.msg.payload?.message;
      throw new Error(`Vote abgelehnt: ${errCode}`);
    }
    console.log(
      `OK  Stimme angenommen (poll:update slideId=${voteResult.msg.payload?.slideId || slide.id})`
    );
  }

  ws.close();
  console.log("test-join-live-remote: ok");
})().catch((err) => {
  console.error("test-join-live-remote fehlgeschlagen:", err.message);
  process.exit(1);
});
