/**
 * Gemeinsame Anmelde-UI für Vollseite (#/admin/login) und Admin-Login-Modal.
 * Unterstützt PIN-, Bootstrap- und Kennwort-Modus gemäß Server-Status.
 */

import {
  loadAuth,
  requestPin,
  verifyPin,
  bootstrapLogin,
  loginPassword,
  registerAccount,
  getAuthUser,
  isBootstrapPasswordLogin,
  isPasswordLoginMode,
  isPinLoginAvailable,
  needsAuthBootstrap,
  getDevMailbox,
} from "./authClient.js?v=nav39";

/** Laufender Formularzustand pro Container-Instanz. */
const instances = new WeakMap();

/**
 * @typedef {object} LoginFormOptions
 * @property {string} [title] — Überschrift
 * @property {string} [idPrefix] — Präfix für HTML-IDs (Eindeutigkeit bei Modal + Seite)
 * @property {(redirect?: string) => void} [onSuccess] — Nach erfolgreicher Anmeldung
 * @property {() => void} [onCancel] — Abbrechen (nur Modal)
 * @property {boolean} [showCancel] — Abbrechen-Button anzeigen
 */

/** Welcher Anmelde-Modus aktiv ist. */
function resolveLoginMode() {
  if (isBootstrapPasswordLogin() || needsAuthBootstrap()) return "bootstrap";
  if (isPasswordLoginMode() && !isPinLoginAvailable()) return "password";
  return "pin";
}

/** Hilfsfunktion: Element anhand Präfix-ID im Container finden. */
function el(container, idPrefix, name) {
  return container.querySelector(`#${idPrefix}${name}`);
}

/** HTML-Sonderzeichen escapen (Dev-Mailbox). */
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Anmeldeformular in einen Container rendern und Ereignisse binden.
 * @param {HTMLElement} container
 * @param {LoginFormOptions} options
 */
export async function initLoginForm(container, options = {}) {
  if (!container) return;
  await loadAuth();
  if (getAuthUser()) {
    options.onSuccess?.();
    return;
  }

  const idPrefix = options.idPrefix || "login-";
  const loginMode = resolveLoginMode();
  const showCancel = Boolean(options.showCancel);

  /** Instanz-Zustand für PIN-Schritte und Timer. */
  const state = {
    step: loginMode === "pin" ? "email" : "email",
    email: "",
    pinExpiresAt: 0,
    resendTimer: 0,
    countdownTimer: 0,
    loginMode,
    idPrefix,
    options,
  };
  instances.set(container, state);

  renderForm(container, state, options);
  bindForm(container, state);
}

/** Formular-HTML in den Container schreiben. */
function renderForm(container, state, options) {
  const { loginMode, idPrefix } = state;
  const title = options.title || "Anmelden";
  const bootstrapHint =
    loginMode === "bootstrap"
      ? `<p class="login-bootstrap-hint muted">Erstmaliger Login — verwenden Sie die bei der Installation festgelegte E-Mail und das Kennwort (siehe INSTALL-CREDENTIALS.txt).</p>`
      : "";
  const passwordOnlyHint =
    loginMode === "password"
      ? `<p class="login-bootstrap-hint muted">E-Mail-Versand ist nicht konfiguriert — Anmeldung per Kennwort.</p>`
      : "";

  container.innerHTML = `
    <div class="login-page panel admin-login-form">
      <header class="login-head">
        <h2>${title}</h2>
        ${
          loginMode === "pin"
            ? `<p class="muted">Passwortlose Anmeldung per sechsstelliger Code per E-Mail.</p>`
            : `<p class="muted">Anmeldung mit E-Mail und Kennwort.</p>`
        }
        ${bootstrapHint}
        ${passwordOnlyHint}
      </header>
      <div id="${idPrefix}step-email" class="login-step">
        <label class="field">
          <span>E-Mail-Adresse</span>
          <input type="email" id="${idPrefix}email" autocomplete="username" required />
        </label>
        ${
          loginMode === "pin"
            ? `<button type="button" class="btn primary" id="${idPrefix}send-pin">Code senden</button>`
            : `
        <label class="field">
          <span>Kennwort</span>
          <input type="password" id="${idPrefix}password" autocomplete="current-password" required />
        </label>
        <label class="field checkbox">
          <input type="checkbox" id="${idPrefix}persistent-pw" checked />
          <span>Angemeldet bleiben (30 Tage)</span>
        </label>
        <button type="button" class="btn primary" id="${idPrefix}password-submit">Anmelden</button>
        `
        }
        <p class="hint muted" id="${idPrefix}email-hint"></p>
        ${
          loginMode === "pin"
            ? `<p class="login-register-link"><button type="button" class="btn link" id="${idPrefix}show-register">Konto anlegen</button></p>`
            : ""
        }
      </div>
      <div id="${idPrefix}step-pin" class="login-step" hidden>
        <p class="muted">Code an <strong id="${idPrefix}email-display"></strong></p>
        <div class="pin-input-row" role="group" aria-label="Sechsstelliger Anmeldecode">
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 1" data-pin-idx="0" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 2" data-pin-idx="1" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 3" data-pin-idx="2" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 4" data-pin-idx="3" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 5" data-pin-idx="4" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 6" data-pin-idx="5" />
        </div>
        <label class="field checkbox">
          <input type="checkbox" id="${idPrefix}persistent" checked />
          <span>Angemeldet bleiben (30 Tage)</span>
        </label>
        <label class="field checkbox">
          <input type="checkbox" id="${idPrefix}not-persistent" />
          <span>Nicht angemeldet bleiben (gemeinsamer Rechner)</span>
        </label>
        <button type="button" class="btn primary" id="${idPrefix}verify-pin">Anmelden</button>
        <button type="button" class="btn ghost" id="${idPrefix}resend-pin" disabled>Neuen Code senden</button>
        <p class="hint muted" id="${idPrefix}pin-countdown"></p>
        <p class="hint muted">E-Mail nicht erhalten? Spam-Ordner prüfen, kurz warten, dann neuen Code anfordern.</p>
        <button type="button" class="btn link" id="${idPrefix}back-email">Andere E-Mail</button>
      </div>
      <div id="${idPrefix}step-register" class="login-step" hidden>
        <h3>Konto anlegen</h3>
        <label class="field"><span>Anzeigename</span><input id="${idPrefix}reg-name" maxlength="120" /></label>
        <label class="field"><span>E-Mail</span><input type="email" id="${idPrefix}reg-email" autocomplete="username" /></label>
        <label class="field"><span>Kennwort (für Kontoänderungen)</span><input type="password" id="${idPrefix}reg-password" autocomplete="new-password" /></label>
        <button type="button" class="btn primary" id="${idPrefix}reg-submit">Registrieren</button>
        <button type="button" class="btn link" id="${idPrefix}reg-back">Zur Anmeldung</button>
        <p class="hint muted" id="${idPrefix}reg-hint"></p>
      </div>
      <div id="${idPrefix}dev-mailbox" class="login-dev-mailbox" hidden></div>
      <p class="login-error" id="${idPrefix}error" role="alert" hidden></p>
      ${
        options.showCancel
          ? `<menu class="modal-actions admin-login-actions">
              <button type="button" class="btn ghost" id="${idPrefix}cancel">Abbrechen</button>
            </menu>`
          : ""
      }
    </div>
  `;
}

/** Ereignis-Handler an das Formular binden. */
function bindForm(container, state) {
  const { idPrefix } = state;

  el(container, idPrefix, "send-pin")?.addEventListener("click", () => onSendPin(container, state));
  el(container, idPrefix, "verify-pin")?.addEventListener("click", () => onVerifyPin(container, state));
  el(container, idPrefix, "resend-pin")?.addEventListener("click", () => onSendPin(container, state));
  el(container, idPrefix, "back-email")?.addEventListener("click", () => showStep(container, state, "email"));
  el(container, idPrefix, "show-register")?.addEventListener("click", () => showStep(container, state, "register"));
  el(container, idPrefix, "reg-submit")?.addEventListener("click", () => onRegister(container, state));
  el(container, idPrefix, "reg-back")?.addEventListener("click", () => showStep(container, state, "email"));
  el(container, idPrefix, "password-submit")?.addEventListener("click", () => onPasswordLogin(container, state));
  el(container, idPrefix, "cancel")?.addEventListener("click", () => state.options.onCancel?.());

  el(container, idPrefix, "not-persistent")?.addEventListener("change", (ev) => {
    const persist = el(container, idPrefix, "persistent");
    if (persist) persist.checked = !ev.target.checked;
  });
  el(container, idPrefix, "persistent")?.addEventListener("change", (ev) => {
    const np = el(container, idPrefix, "not-persistent");
    if (np) np.checked = !ev.target.checked;
  });

  bindPinInputs(container);
  refreshDevMailbox(container, state);
}

/** PIN-Eingabefelder mit Auto-Fokus und Paste-Unterstützung. */
function bindPinInputs(container) {
  const digits = [...container.querySelectorAll(".pin-digit")];
  digits.forEach((input, idx) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(-1);
      if (input.value && idx < digits.length - 1) digits[idx + 1].focus();
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Backspace" && !input.value && idx > 0) digits[idx - 1].focus();
    });
    input.addEventListener("paste", (ev) => {
      const text = (ev.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (!text) return;
      ev.preventDefault();
      text.split("").forEach((ch, i) => {
        if (digits[i]) digits[i].value = ch;
      });
      digits[Math.min(text.length, 5)]?.focus();
    });
  });
}

/** Aktiven Anmeldeschritt einblenden. */
function showStep(container, state, next) {
  state.step = next;
  const { idPrefix } = state;
  el(container, idPrefix, "step-email")?.toggleAttribute("hidden", next !== "email");
  el(container, idPrefix, "step-pin")?.toggleAttribute("hidden", next !== "pin");
  el(container, idPrefix, "step-register")?.toggleAttribute("hidden", next !== "register");
  setError(container, state, "");
}

/** Fehlermeldung anzeigen oder ausblenden. */
function setError(container, state, msg) {
  const errorEl = el(container, state.idPrefix, "error");
  if (!errorEl) return;
  errorEl.hidden = !msg;
  errorEl.textContent = msg || "";
}

/** PIN per E-Mail anfordern. */
async function onSendPin(container, state) {
  const input = el(container, state.idPrefix, "email");
  state.email = (input?.value || "").trim().toLowerCase();
  if (!state.email.includes("@")) {
    setError(container, state, "Bitte geben Sie eine gültige E-Mail-Adresse ein.");
    return;
  }
  setError(container, state, "");
  const r = await requestPin(state.email);
  if (!r.ok) {
    setError(container, state, r.data?.error || "Code konnte nicht angefordert werden.");
    return;
  }
  state.pinExpiresAt = r.data?.expiresAt || Date.now() + 10 * 60 * 1000;
  const display = el(container, state.idPrefix, "email-display");
  if (display) display.textContent = state.email;
  showStep(container, state, "pin");
  startCountdown(container, state);
  startResendCooldown(container, state);
  container.querySelector(".pin-digit")?.focus();
  await refreshDevMailbox(container, state);
}

/** PIN verifizieren und Session starten. */
async function onVerifyPin(container, state) {
  const pin = [...container.querySelectorAll(".pin-digit")].map((i) => i.value).join("");
  if (!/^\d{6}$/.test(pin)) {
    setError(container, state, "Bitte geben Sie den sechsstelligen Code ein.");
    return;
  }
  const persistent = el(container, state.idPrefix, "persistent")?.checked !== false;
  const r = await verifyPin(state.email, pin, persistent);
  if (!r.ok) {
    setError(container, state, r.data?.error || "Anmeldung fehlgeschlagen.");
    return;
  }
  setError(container, state, "");
  disposeLoginForm(container);
  state.options.onSuccess?.("#/admin/events");
}

/** Kennwort- oder Bootstrap-Anmeldung. */
async function onPasswordLogin(container, state) {
  const emailInput = el(container, state.idPrefix, "email");
  const pwInput = el(container, state.idPrefix, "password");
  state.email = (emailInput?.value || "").trim().toLowerCase();
  const password = pwInput?.value || "";
  const bootstrapFlow =
    state.loginMode === "bootstrap" || isBootstrapPasswordLogin() || needsAuthBootstrap();
  const minLen = bootstrapFlow ? 4 : 8;
  if (!state.email.includes("@")) {
    setError(container, state, "Bitte geben Sie eine gültige E-Mail-Adresse ein.");
    return;
  }
  if (!password || password.length < minLen) {
    setError(
      container,
      state,
      bootstrapFlow
        ? `Kennwort muss mindestens ${minLen} Zeichen lang sein.`
        : "Kennwort muss mindestens 8 Zeichen lang sein."
    );
    return;
  }
  setError(container, state, "");
  const persistent = el(container, state.idPrefix, "persistent-pw")?.checked !== false;

  /** Bootstrap zuerst, bei Bedarf Fallback auf allgemeinen Kennwort-Login. */
  let r = bootstrapFlow
    ? await bootstrapLogin(state.email, password, persistent)
    : await loginPassword(state.email, password, persistent);
  if (!r.ok && bootstrapFlow && (r.status === 403 || r.status === 401)) {
    r = await loginPassword(state.email, password, persistent);
  }
  if (!r.ok && !bootstrapFlow && isPasswordLoginMode()) {
    r = await bootstrapLogin(state.email, password, persistent);
  }
  if (!r.ok) {
    setError(container, state, r.data?.error || "Anmeldung fehlgeschlagen.");
    return;
  }
  disposeLoginForm(container);
  if (r.data?.bootstrapCompleted) {
    if (r.data.requiresPinSetup) sessionStorage.setItem("pulse:requires-pin-setup", "1");
    state.options.onSuccess?.("#/admin/onboarding");
    return;
  }
  if (r.data?.requiresPinSetup) {
    state.options.onSuccess?.("#/admin/email");
    return;
  }
  state.options.onSuccess?.("#/admin/events");
}

/** Self-Service-Registrierung (nur PIN-Modus). */
async function onRegister(container, state) {
  const displayName = el(container, state.idPrefix, "reg-name")?.value || "";
  const regEmail = el(container, state.idPrefix, "reg-email")?.value || "";
  const password = el(container, state.idPrefix, "reg-password")?.value || "";
  const r = await registerAccount({ displayName, email: regEmail, password });
  const hint = el(container, state.idPrefix, "reg-hint");
  if (!r.ok) {
    if (hint) hint.textContent = r.data?.error || "Registrierung fehlgeschlagen.";
    return;
  }
  if (hint) hint.textContent = "Konto angelegt. Fordern Sie nun Ihren Anmeldecode an.";
  state.email = regEmail.trim().toLowerCase();
  const loginEmail = el(container, state.idPrefix, "email");
  if (loginEmail) loginEmail.value = state.email;
  showStep(container, state, "email");
}

/** Countdown für PIN-Gültigkeit. */
function startCountdown(container, state) {
  clearInterval(state.countdownTimer);
  const countdownEl = el(container, state.idPrefix, "pin-countdown");
  state.countdownTimer = setInterval(() => {
    const left = Math.max(0, state.pinExpiresAt - Date.now());
    const min = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    if (countdownEl) {
      countdownEl.textContent =
        left > 0
          ? `Code gültig für noch ${min}:${String(sec).padStart(2, "0")} Minuten`
          : "Code abgelaufen — neuen Code anfordern.";
    }
    if (left <= 0) clearInterval(state.countdownTimer);
  }, 1000);
}

/** Cooldown bevor ein neuer PIN angefordert werden kann. */
function startResendCooldown(container, state) {
  const btn = el(container, state.idPrefix, "resend-pin");
  if (!btn) return;
  btn.disabled = true;
  let left = 30;
  clearInterval(state.resendTimer);
  state.resendTimer = setInterval(() => {
    left -= 1;
    btn.textContent = left > 0 ? `Neuen Code senden (${left}s)` : "Neuen Code senden";
    if (left <= 0) {
      btn.disabled = false;
      clearInterval(state.resendTimer);
    }
  }, 1000);
}

/** Entwicklungs-Mailbox für lokale Tests anzeigen. */
async function refreshDevMailbox(container, state) {
  const box = el(container, state.idPrefix, "dev-mailbox");
  if (!box) return;
  const r = await getDevMailbox();
  if (!r.ok || !r.data?.messages?.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `<h3 class="hint">Entwicklungs-Mailbox</h3><ul>${r.data.messages
    .slice(0, 3)
    .map((m) => `<li><strong>${escapeHtml(m.to)}</strong>: ${escapeHtml(m.preview || "")}</li>`)
    .join("")}</ul>`;
}

/** Timer stoppen und Instanz-Zustand entfernen. */
export function disposeLoginForm(container) {
  const state = instances.get(container);
  if (!state) return;
  clearInterval(state.countdownTimer);
  clearInterval(state.resendTimer);
  instances.delete(container);
}
