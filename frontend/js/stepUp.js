/**
 * Step-up-PIN-Dialog für kritische Admin-Aktionen.
 * Administratoren müssen ihren E-Mail-Anmeldecode erneut eingeben.
 */

import {
  getAuthUser,
  submitStepUpPin,
  hasValidStepUp,
  refreshAuthMe,
} from "./authClient.js";

let dialogEl = null;

/** Modal-Element einmalig anlegen. */
function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement("dialog");
  dialogEl.id = "step-up-dialog";
  dialogEl.className = "modal step-up-dialog";
  dialogEl.innerHTML = `
    <form method="dialog" class="panel" id="step-up-form">
      <h2>Erneute Bestätigung</h2>
      <p class="muted">Für diese Aktion geben Sie bitte Ihren aktuellen Anmeldecode ein.</p>
      <label class="field"><span>Anmeldecode</span>
        <input id="step-up-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required />
      </label>
      <p id="step-up-msg" class="muted" role="status"></p>
      <menu class="modal-actions">
        <button type="button" class="btn ghost" id="step-up-cancel">Abbrechen</button>
        <button type="submit" class="btn primary">Bestätigen</button>
      </menu>
    </form>`;
  document.body.appendChild(dialogEl);
  dialogEl.querySelector("#step-up-cancel")?.addEventListener("click", () => dialogEl.close(false));
  return dialogEl;
}

/**
 * Step-up anfordern, falls für Admin nötig.
 * @returns {Promise<boolean>}
 */
export async function ensureStepUp() {
  const me = getAuthUser();
  if (!me || me.role !== "admin") return true;
  if (hasValidStepUp()) return true;
  /* Administratoren nutzen Kennwort-Anmeldung — kein erneuter E-Mail-Code für Step-up. */
  return true;
}

/**
 * PIN-Dialog anzeigen und prüfen.
 * @returns {Promise<boolean>}
 */
export function promptStepUp() {
  const dlg = ensureDialog();
  const msg = dlg.querySelector("#step-up-msg");
  const pinInput = dlg.querySelector("#step-up-pin");
  const form = dlg.querySelector("#step-up-form");
  if (msg) msg.textContent = "";
  if (pinInput) pinInput.value = "";

  return new Promise((resolve) => {
    const onClose = () => {
      form?.removeEventListener("submit", onSubmit);
      dlg.removeEventListener("close", onClose);
      resolve(dlg.returnValue === "ok");
    };
    const onSubmit = async (ev) => {
      ev.preventDefault();
      const pin = pinInput?.value?.trim() || "";
      if (!pin) return;
      if (msg) msg.textContent = "Prüfe…";
      const r = await submitStepUpPin(pin);
      if (r.ok) {
        dlg.close("ok");
        return;
      }
      if (msg) msg.textContent = r.data?.error || "Code ungültig";
    };
    form?.addEventListener("submit", onSubmit);
    dlg.addEventListener("close", onClose);
    dlg.showModal();
    pinInput?.focus();
  });
}

/**
 * fetchJson-Wrapper: bei step_up_required Dialog anzeigen und einmal wiederholen.
 * @param {Function} call — async () => ({ ok, status, data })
 */
export async function withStepUp(call) {
  let r = await call();
  if (r.status === 403 && r.data?.code === "step_up_required") {
    const ok = await promptStepUp();
    if (!ok) return r;
    await refreshAuthMe();
    r = await call();
  }
  return r;
}
