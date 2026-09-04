/**
 * Mailgun Domain-API: DNS-Records abrufen, Verifikation anstoßen.
 */

const { getMailgunEnv } = require("./mailgunEnv");

/**
 * @param {string} method
 * @param {string} pathSuffix
 */
async function mailgunRequest(method, pathSuffix) {
  const env = getMailgunEnv();
  if (!env.apiKey) throw new Error("MAILGUN_API_KEY fehlt");
  const url = `${env.apiBase}${pathSuffix}`;
  const auth = Buffer.from(`api:${env.apiKey}`).toString("base64");
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${auth}` },
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text || "{}");
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(json.message || text || `Mailgun HTTP ${res.status}`);
  }
  return json;
}

/**
 * Domain-Details inkl. DNS-Empfehlungen.
 * @param {string} [domainOverride]
 */
async function getDomainInfo(domainOverride) {
  const domain = domainOverride || getMailgunEnv().domain;
  if (!domain) throw new Error("MAILGUN_DOMAIN fehlt");
  return mailgunRequest("GET", `/v4/domains/${encodeURIComponent(domain)}`);
}

/** Verifikation bei Mailgun anstoßen. */
async function verifyDomain(domainOverride) {
  const domain = domainOverride || getMailgunEnv().domain;
  return mailgunRequest("PUT", `/v4/domains/${encodeURIComponent(domain)}/verify`);
}

/**
 * DNS-Hinweise für SPF/DKIM/DMARC (UI).
 * @param {object} domainInfo Mailgun-Response
 */
function formatDnsHints(domainInfo) {
  const sending = domainInfo?.sending_dns_records || domainInfo?.domain?.sending_dns_records || [];
  const receiving = domainInfo?.receiving_dns_records || domainInfo?.domain?.receiving_dns_records || [];
  const dmarcHint = {
    type: "TXT",
    name: "_dmarc",
    value: "v=DMARC1; p=none; rua=mailto:dmarc@" + (domainInfo?.domain?.name || getMailgunEnv().domain),
    purpose: "DMARC (Start: p=none)",
  };
  return {
    sending: sending.map((r) => ({
      type: r.record_type || r.type,
      name: r.name,
      value: r.value || r.cached,
      valid: r.valid === "valid" || r.valid === true,
      purpose: r.name?.includes("_domainkey") ? "DKIM" : r.name?.includes("spf") || r.value?.includes("spf1") ? "SPF" : "DNS",
    })),
    receiving,
    dmarc: dmarcHint,
    state: domainInfo?.domain?.state || domainInfo?.state || "unknown",
  };
}

module.exports = { getDomainInfo, verifyDomain, formatDnsHints };
