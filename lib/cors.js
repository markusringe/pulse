/**
 * CORS-Header — kein blindes „*“ bei Cookie-Authentifizierung.
 * Erlaubt: gleicher Host wie Request oder explizit in CORS_ALLOWED_ORIGINS.
 */

/** Zusätzliche Origins aus .env (kommagetrennt), z. B. https://embed.example.de */
function allowedOriginsFromEnv() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Prüft, ob Origin zum Host der Anfrage passt (inkl. Port).
 * @param {string} origin
 * @param {string} host
 */
function originMatchesHost(origin, host) {
  if (!origin || !host) return false;
  try {
    const o = new URL(origin);
    return o.host === host;
  } catch {
    return false;
  }
}

/**
 * CORS-Header für eine HTTP-Anfrage.
 * @param {import('http').IncomingMessage} [req]
 * @returns {Record<string, string>}
 */
function corsHeadersForRequest(req) {
  const base = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key, X-Client-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };

  const origin = req?.headers?.origin;
  if (!origin) return base;

  const host = req?.headers?.host;
  const extra = allowedOriginsFromEnv();
  if (originMatchesHost(origin, host) || extra.includes(origin)) {
    return {
      ...base,
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }

  /* Fremde Origin — kein ACAO (Browser blockiert Cross-Origin-Lesezugriff). */
  return { ...base, Vary: "Origin" };
}

/** Alias für bestehende Aufrufer (optional mit req). */
function corsHeaders(req) {
  return corsHeadersForRequest(req || { headers: {} });
}

module.exports = { corsHeadersForRequest, corsHeaders, originMatchesHost, allowedOriginsFromEnv };
