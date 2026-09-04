/**
 * Entwicklungs-Provider: speichert Mails im Speicher statt Versand.
 */

class CaptureEmailProvider {
  /**
   * @param {{ mailbox: object[], max?: number }} opts
   */
  constructor(opts) {
    this.mailbox = opts.mailbox;
    this.max = opts.max || 50;
    this.name = "capture";
  }

  async send(msg) {
    this.mailbox.unshift({
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      sentAt: Date.now(),
    });
    if (this.mailbox.length > this.max) this.mailbox.length = this.max;
    return { id: `capture-${Date.now()}` };
  }
}

module.exports = { CaptureEmailProvider };
