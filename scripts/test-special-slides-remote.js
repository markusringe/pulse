#!/usr/bin/env node
/**
 * Remote-Abnahme Sonderfolien (v1.5.37+): Prod-Bundles und HTML ohne Login.
 * Ergänzt test-presenter-special-slide-dock (Quellcode) um deployed Assets.
 *
 *   node scripts/test-special-slides-remote.js --url https://pulse.ringe.us --expect-version 1.5.39
 */

const https = require("https");
const http = require("http");

function parseArgs(argv) {
  const out = {
    url: process.env.PULSE_SMOKE_URL || "https://pulse.ringe.us",
    expectVersion: process.env.PULSE_EXPECT_VERSION || "",
    timeoutMs: 15000,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) out.url = argv[++i];
    else if (a === "--expect-version" && argv[i + 1]) out.expectVersion = argv[++i];
    else if (a === "--timeout" && argv[i + 1]) out.timeoutMs = Number(argv[++i]) || out.timeoutMs;
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function httpGet(fullUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = fullUrl.startsWith("https:") ? https : http;
    const req = lib.get(fullUrl, (res) => {
      let body = "";
      res.on("data", (c) => {
        body += c;
      });
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout: ${fullUrl}`)));
  });
}

function joinUrl(base, p) {
  return `${base.replace(/\/$/, "")}${p}`;
}

/** Lädt JS/CSS — bevorzugt Content-Hash aus index.html, Fallback ohne Hash. */
async function fetchAsset(base, indexHtml, pattern, fallbackPath, timeoutMs) {
  const m = indexHtml.match(pattern);
  const path = m ? m[0] : fallbackPath;
  const res = await httpGet(joinUrl(base, path), timeoutMs);
  assert(res.status === 200, `${path} → HTTP ${res.status}`);
  return res.body;
}

(async () => {
  const opts = parseArgs(process.argv);
  const base = opts.url.replace(/\/$/, "");
  const results = [];
  const record = (name, ok, detail = "") => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "OK" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  console.log(`Sonderfolien-Remote: ${base}\n`);

  const index = await httpGet(joinUrl(base, "/"), opts.timeoutMs);
  record("GET /", index.status === 200, `HTTP ${index.status}`);

  /* Presenter-Hosts in index.html */
  record("index present-deck", index.body.includes('id="present-deck"'));
  record("index present-special-slide-nav", index.body.includes('id="present-special-slide-nav"'));
  record("index kein stage-special-slide-nav", !index.body.includes("stage-special-slide-nav"));
  record("index ohne statischen stage-fs", !index.body.includes('id="stage-fs"'));
  record("index present-slide-canvas", index.body.includes('id="present-slide-canvas"'));
  record("index kein presenter-special-preview.css", !index.body.includes("presenter-special-preview.css"));

  const stageJs = await fetchAsset(
    base,
    index.body,
    /\/js\/stage\.js\?h=[^"']+/,
    "/js/stage.js",
    opts.timeoutMs
  );
  record("stage.js kein stageSpecialSlideNav", !stageJs.includes("stageSpecialSlideNav"));
  record("stage.js mountStageDisplayControls", stageJs.includes("mountStageDisplayControls"));
  record("stage.js kein event_countdown", !stageJs.includes("event_countdown"));
  record("stage.js Rolle stage", stageJs.includes('role: "stage"'));

  const deckJs = await fetchAsset(
    base,
    index.body,
    /\/js\/deck\.js\?h=[^"']+/,
    "/js/deck.js",
    opts.timeoutMs
  );
  record("deck.js deck-chip-special", deckJs.includes("deck-chip-special"));
  record("deck.js onGotoSpecial", deckJs.includes("onGotoSpecial"));

  const coreJs = await fetchAsset(
    base,
    index.body,
    /\/js\/specialSlideNavCore\.js\?h=[^"']+/,
    "/js/specialSlideNavCore.js",
    opts.timeoutMs
  );
  record("specialSlideNavCore data-pss-kind", coreJs.includes("data-pss-kind"));
  record("specialSlideNavCore End-Dialog", coreJs.includes("confirmSpecialSlideEnd"));

  const helpCss = await fetchAsset(
    base,
    index.body,
    /\/css\/help\.css\?h=[^"']+/,
    "/css/help.css",
    opts.timeoutMs
  );
  record("help.css Stage ohne Hilfe-FAB", /body\.route-stage\s+\.help-fab/.test(helpCss));

  const stylesCss = await fetchAsset(
    base,
    index.body,
    /\/css\/styles\.css\?h=[^"']+/,
    "/css/styles.css",
    opts.timeoutMs
  );
  record("styles.css Mobil Icon-only Chips", stylesCss.includes(".deck-chip-special-label") && stylesCss.includes("display: none"));

  if (opts.expectVersion) {
    const health = await httpGet(joinUrl(base, "/api/health"), opts.timeoutMs);
    let healthJson = {};
    try {
      healthJson = JSON.parse(health.body);
    } catch {
      /* */
    }
    record(
      "health.expect-version",
      healthJson.version === opts.expectVersion,
      `ist ${healthJson.version || "?"}, erwartet ${opts.expectVersion}`
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Checks bestanden`);
  if (failed.length) {
    console.error("\nFehlgeschlagen:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("\nOK test-special-slides-remote");
})().catch((err) => {
  console.error("\ntest-special-slides-remote:", err.message);
  process.exit(1);
});
