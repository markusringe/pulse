#!/usr/bin/env node
/**
 * CORS-Richtlinie: kein Access-Control-Allow-Origin: * bei Auth.
 */

const { corsHeadersForRequest, originMatchesHost } = require("../lib/cors");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sameHostReq = {
  headers: {
    origin: "https://pulse.example.com",
    host: "pulse.example.com",
  },
};

const crossReq = {
  headers: {
    origin: "https://evil.example.com",
    host: "pulse.example.com",
  },
};

const noOriginReq = { headers: { host: "pulse.example.com" } };

assert(originMatchesHost("https://pulse.example.com", "pulse.example.com"), "Origin/Host Match");
assert(!originMatchesHost("https://evil.example.com", "pulse.example.com"), "Fremde Origin");

const same = corsHeadersForRequest(sameHostReq);
assert(same["Access-Control-Allow-Origin"] === "https://pulse.example.com", "Gleicher Host reflektiert");
assert(!String(same["Access-Control-Allow-Origin"] || "").includes("*"), "Kein Wildcard bei Match");

const cross = corsHeadersForRequest(crossReq);
assert(!cross["Access-Control-Allow-Origin"], "Fremde Origin ohne ACAO");

const none = corsHeadersForRequest(noOriginReq);
assert(!none["Access-Control-Allow-Origin"], "Ohne Origin-Header kein ACAO");

process.env.CORS_ALLOWED_ORIGINS = "https://partner.example.org";
delete require.cache[require.resolve("../lib/cors")];
const { corsHeadersForRequest: cors2 } = require("../lib/cors");
const extra = cors2({
  headers: { origin: "https://partner.example.org", host: "pulse.example.com" },
});
assert(extra["Access-Control-Allow-Origin"] === "https://partner.example.org", "Env-Whitelist");
delete process.env.CORS_ALLOWED_ORIGINS;

console.log("CORS-Tests OK");
