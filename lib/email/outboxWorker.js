/**
 * Outbox-Worker: verarbeitet Queue-Einträge über den konfigurierten Provider.
 */

const outboxStore = require("./outboxStore");
const { createProvider } = require("./providers/createProvider");

let processing = false;

/**
 * Einzelnen Outbox-Eintrag senden.
 * @param {string} itemId
 * @param {{ getRuntimeConfig: Function, devMailbox?: object[], sendSmtp?: Function, sendSendmail?: Function, useCapture?: boolean }} deps
 */
async function processItem(itemId, deps) {
  const item = outboxStore.getById(itemId);
  if (!item || item.status === "sent" || item.status === "dead") {
    return { ok: item?.status === "sent", skipped: true };
  }
  outboxStore.markProcessing(itemId);
  const cfg = deps.getRuntimeConfig();
  const provider = createProvider(cfg, deps);
  if (!provider) {
    outboxStore.markFailed(itemId, "Kein E-Mail-Provider konfiguriert");
    return { ok: false, error: "Kein Provider" };
  }
  try {
    const result = await provider.send(item.payload);
    outboxStore.markSent(itemId, result?.id || "ok");
    return { ok: true, id: result?.id };
  } catch (err) {
    const msg = err.message || String(err);
    outboxStore.markFailed(itemId, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Fällige Einträge abarbeiten (Cron/Interval).
 * @param {object} deps
 * @param {number} [limit]
 */
async function tick(deps, limit = 10) {
  if (processing) return { processed: 0, skipped: true };
  processing = true;
  let processed = 0;
  try {
    const due = outboxStore.listDue(limit);
    for (const item of due) {
      await processItem(item.id, deps);
      processed += 1;
    }
  } finally {
    processing = false;
  }
  return { processed };
}

module.exports = { processItem, tick };
