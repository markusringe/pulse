/**
 * Mailgun-Konfiguration ausschließlich aus Umgebungsvariablen (keine Secrets in JSON).
 */

const emailConfigStore = require("../emailConfigStore");

/** @returns {{ apiKey: string, domain: string, apiBase: string, webhookSigningKey: string, region: string }} */
function getMailgunEnv() {
  const apiBase = (process.env.MAILGUN_API_BASE || "https://api.eu.mailgun.net").replace(/\/$/, "");
  const region = apiBase.includes("api.eu.mailgun.net") ? "eu" : "us";
  return {
    apiKey: String(process.env.MAILGUN_API_KEY || "").trim(),
    domain: String(process.env.MAILGUN_DOMAIN || "").trim(),
    apiBase,
    webhookSigningKey: String(process.env.MAILGUN_WEBHOOK_SIGNING_KEY || "").trim(),
    region,
  };
}

/** Produktion: Fail-fast wenn Provider mailgun ohne Pflicht-Env. */
function assertMailgunProductionReady() {
  if (process.env.NODE_ENV !== "production") return;
  const cfg = emailConfigStore.load();
  if (cfg.provider !== "mailgun") return;
  const env = getMailgunEnv();
  if (!env.apiKey) {
    throw new Error("[mailgun] MAILGUN_API_KEY fehlt in Production (Provider=mailgun)");
  }
  if (!env.domain) {
    throw new Error("[mailgun] MAILGUN_DOMAIN fehlt in Production (Provider=mailgun)");
  }
}

function mailgunConfigured() {
  const env = getMailgunEnv();
  return Boolean(env.apiKey && env.domain);
}

module.exports = { getMailgunEnv, assertMailgunProductionReady, mailgunConfigured };
