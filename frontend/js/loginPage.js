/**
 * Login-Seite: zweistufige E-Mail-PIN-Anmeldung und Selbstregistrierung.
 */

import {
  loadAuth,
  requestPin,
  verifyPin,
  registerAccount,
  getAuthUser,
  isAuthEnabled,
  hasAdminAccess,
  getDevMailbox,
} from "./authClient.js?v=nav32";

let step = "email";
let email = "";
let pinExpiresAt = 0;
let resendTimer = 0;
let countdownTimer = 0;

/** Login-UI initialisieren und anzeigen. */
export async function showLoginPage() {
  const root = document.getElementById("view-login");
  if (!root) return;
  await loadAuth();
  if (getAuthUser()) {
    location.hash = "#/admin/events";
    return;
  }
  renderLoginShell();
  bindLoginEvents();
}

function renderLoginShell() {
  const root = document.getElementById("view-login");
  if (!root) return;
  root.innerHTML = `
    <div class="login-page panel">
      <header class="login-head">
        <h1>Anmelden</h1>
        <p class="muted">Passwortlose Anmeldung per sechsstelliger Code per E-Mail.</p>
      </header>
      <div id="login-step-email" class="login-step">
        <label class="field">
          <span>E-Mail-Adresse</span>
          <input type="email" id="login-email" autocomplete="username" required value="admin@localhost" />
        </label>
        <button type="button" class="btn primary" id="login-send-pin">Code senden</button>
        <p class="hint muted" id="login-email-hint"></p>
        <p class="login-register-link"><button type="button" class="btn link" id="login-show-register">Konto anlegen</button></p>
      </div>
      <div id="login-step-pin" class="login-step" hidden>
        <p class="muted">Code an <strong id="login-email-display"></strong></p>
        <div class="pin-input-row" role="group" aria-label="Sechsstelliger Anmeldecode">
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 1" data-pin-idx="0" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 2" data-pin-idx="1" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 3" data-pin-idx="2" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 4" data-pin-idx="3" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 5" data-pin-idx="4" />
          <input class="pin-digit" inputmode="numeric" maxlength="1" aria-label="Ziffer 6" data-pin-idx="5" />
        </div>
        <input type="text" id="login-pin-hidden" class="visually-hidden" autocomplete="one-time-code" tabindex="-1" aria-hidden="true" />
        <p class="hint muted" id="login-pin-countdown"></p>
        <label class="field checkbox">
          <input type="checkbox" id="login-persistent" checked />
          <span>Angemeldet bleiben (30 Tage)</span>
        </label>
        <label class="field checkbox">
          <input type="checkbox" id="login-not-persistent" />
          <span>Nicht angemeldet bleiben (gemeinsamer Rechner)</span>
        </label>
        <button type="button" class="btn primary" id="login-verify-pin">Anmelden</button>
        <button type="button" class="btn ghost" id="login-resend-pin" disabled>Neuen Code senden</button>
        <p class="hint muted">E-Mail nicht erhalten? Spam-Ordner prüfen, kurz warten, dann neuen Code anfordern.</p>
        <button type="button" class="btn link" id="login-back-email">Andere E-Mail</button>
      </div>
      <div id="login-step-register" class="login-step" hidden>
        <h2>Konto anlegen</h2>
        <label class="field"><span>Anzeigename</span><input id="reg-name" maxlength="120" /></label>
        <label class="field"><span>E-Mail</span><input type="email" id="reg-email" autocomplete="username" /></label>
        <label class="field"><span>Kennwort (für Kontoänderungen)</span><input type="password" id="reg-password" autocomplete="new-password" /></label>
        <button type="button" class="btn primary" id="reg-submit">Registrieren</button>
        <button type="button" class="btn link" id="reg-back">Zur Anmeldung</button>
        <p class="hint muted" id="reg-hint"></p>
      </div>
      <div id="login-dev-mailbox" class="login-dev-mailbox" hidden></div>
      <p class="login-error" id="login-error" role="alert" hidden></p>
    </div>
  `;
  step = "email";
}

function bindLoginEvents() {
  document.getElementById("login-send-pin")?.addEventListener("click", onSendPin);
  document.getElementById("login-verify-pin")?.addEventListener("click", onVerifyPin);
  document.getElementById("login-resend-pin")?.addEventListener("click", onSendPin);
  document.getElementById("login-back-email")?.addEventListener("click", () => showStep("email"));
  document.getElementById("login-show-register")?.addEventListener("click", () => showStep("register"));
  document.getElementById("reg-submit")?.addEventListener("click", onRegister);
  document.getElementById("reg-back")?.addEventListener("click", () => showStep("email"));
  document.getElementById("login-not-persistent")?.addEventListener("change", (ev) => {
    const persist = document.getElementById("login-persistent");
    if (persist) persist.checked = !ev.target.checked;
  });
  document.getElementById("login-persistent")?.addEventListener("change", (ev) => {
    const np = document.getElementById("login-not-persistent");
    if (np) np.checked = !ev.target.checked;
  });
  bindPinInputs();
  refreshDevMailbox();
}

function bindPinInputs() {
  const digits = [...document.querySelectorAll(".pin-digit")];
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

function showStep(next) {
  step = next;
  document.getElementById("login-step-email")?.toggleAttribute("hidden", next !== "email");
  document.getElementById("login-step-pin")?.toggleAttribute("hidden", next !== "pin");
  document.getElementById("login-step-register")?.toggleAttribute("hidden", next !== "register");
  setError("");
}

function setError(msg) {
  const el = document.getElementById("login-error");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

async function onSendPin() {
  const input = document.getElementById("login-email");
  email = (input?.value || "").trim().toLowerCase();
  if (!email.includes("@")) {
    setError("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
    return;
  }
  setError("");
  const r = await requestPin(email);
  if (!r.ok) {
    setError(r.data?.error || "Code konnte nicht angefordert werden.");
    return;
  }
  pinExpiresAt = r.data?.expiresAt || Date.now() + 10 * 60 * 1000;
  document.getElementById("login-email-display").textContent = email;
  showStep("pin");
  startCountdown();
  startResendCooldown();
  document.querySelector(".pin-digit")?.focus();
  await refreshDevMailbox();
}

async function onVerifyPin() {
  const pin = [...document.querySelectorAll(".pin-digit")].map((i) => i.value).join("");
  if (!/^\d{6}$/.test(pin)) {
    setError("Bitte geben Sie den sechsstelligen Code ein.");
    return;
  }
  const persistent = document.getElementById("login-persistent")?.checked !== false;
  const r = await verifyPin(email, pin, persistent);
  if (!r.ok) {
    setError(r.data?.error || "Anmeldung fehlgeschlagen.");
    return;
  }
  setError("");
  location.hash = "#/admin/events";
}

async function onRegister() {
  const displayName = document.getElementById("reg-name")?.value || "";
  const regEmail = document.getElementById("reg-email")?.value || "";
  const password = document.getElementById("reg-password")?.value || "";
  const r = await registerAccount({ displayName, email: regEmail, password });
  const hint = document.getElementById("reg-hint");
  if (!r.ok) {
    if (hint) hint.textContent = r.data?.error || "Registrierung fehlgeschlagen.";
    return;
  }
  if (hint) hint.textContent = "Konto angelegt. Fordern Sie nun Ihren Anmeldecode an.";
  email = regEmail.trim().toLowerCase();
  document.getElementById("login-email").value = email;
  showStep("email");
}

function startCountdown() {
  clearInterval(countdownTimer);
  const el = document.getElementById("login-pin-countdown");
  countdownTimer = setInterval(() => {
    const left = Math.max(0, pinExpiresAt - Date.now());
    const min = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    if (el) el.textContent = left > 0 ? `Code gültig für noch ${min}:${String(sec).padStart(2, "0")} Minuten` : "Code abgelaufen — neuen Code anfordern.";
    if (left <= 0) clearInterval(countdownTimer);
  }, 1000);
}

function startResendCooldown() {
  const btn = document.getElementById("login-resend-pin");
  if (!btn) return;
  btn.disabled = true;
  let left = 30;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    left -= 1;
    btn.textContent = left > 0 ? `Neuen Code senden (${left}s)` : "Neuen Code senden";
    if (left <= 0) {
      btn.disabled = false;
      clearInterval(resendTimer);
    }
  }, 1000);
}

async function refreshDevMailbox() {
  const box = document.getElementById("login-dev-mailbox");
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Auth beim Start laden. Gibt true zurück, wenn die Login-Seite gezeigt werden muss.
 * @returns {Promise<boolean>}
 */
export async function initAuthOnBoot() {
  await loadAuth();
  if (!isAuthEnabled()) return false;
  const hash = location.hash.replace(/^#/, "") || "/";
  return hash.startsWith("/admin") && hash !== "/admin/login" && !hasAdminAccess();
}
