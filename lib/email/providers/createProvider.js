/**
 * Provider-Factory — keine Mailgun-Logik im Business-Code.
 */

const { MailgunEmailProvider } = require("./MailgunEmailProvider");
const { CaptureEmailProvider } = require("./CaptureEmailProvider");
const { getMailgunEnv } = require("../mailgunEnv");

/**
 * @param {object} cfg Laufzeit-Konfiguration (emailService)
 * @param {{ devMailbox?: object[], sendSmtp?: Function, sendSendmail?: Function, useCapture?: boolean }} deps
 * @returns {{ send: Function, name: string } | null}
 */
function createProvider(cfg, deps = {}) {
  if (deps.useCapture && deps.devMailbox) {
    return new CaptureEmailProvider({ mailbox: deps.devMailbox });
  }
  if (cfg.provider === "mailgun") {
    const env = getMailgunEnv();
    return new MailgunEmailProvider(env);
  }
  if (cfg.provider === "smtp" && deps.sendSmtp) {
    return {
      name: "smtp",
      send: (msg) => deps.sendSmtp(msg, cfg),
    };
  }
  if (cfg.provider === "sendmail" && deps.sendSendmail) {
    return {
      name: "sendmail",
      send: (msg) => deps.sendSendmail(msg, cfg),
    };
  }
  return null;
}

module.exports = { createProvider };
