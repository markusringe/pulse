/**
 * Presenter — mobile Dock, Overflow-Menü schließen, Notfall-Bestätigung.
 */

let presentMobileBound = false;

/**
 * Overflow-Menü schließen bei Klick außerhalb oder Escape.
 */
function bindPresentOverflowMenu() {
  const overflow = document.querySelector(".present-nav-overflow");
  if (!overflow) return;

  document.addEventListener(
    "click",
    (ev) => {
      if (!overflow.open) return;
      if (overflow.contains(ev.target)) return;
      overflow.open = false;
    },
    true
  );

  overflow.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && overflow.open) {
      overflow.open = false;
      overflow.querySelector("summary")?.focus();
    }
  });

  overflow.querySelectorAll(".present-nav-overflow-panel .btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      overflow.open = false;
    });
  });
}

/**
 * Notfall erfordert explizite Bestätigung (zusätzlich zum Klick).
 * bindPanic in emergency.js bleibt unverändert — Interceptor läuft in Capture-Phase.
 */
function bindPresentPanicConfirm() {
  const btn = document.getElementById("panic-button");
  if (!btn || btn.dataset.confirmBound === "1") return;
  btn.dataset.confirmBound = "1";

  btn.addEventListener(
    "click",
    (ev) => {
      if (btn.dataset.paused === "1") return;
      const ok = window.confirm(
        "Notfall wirklich auslösen?\n\nDie Session wird für alle Teilnehmenden pausiert und die Leinwand abgedunkelt."
      );
      if (!ok) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }
    },
    true
  );
}

/** Einmalig beim App-Start binden. */
export function bindPresentMobileUi() {
  if (presentMobileBound) return;
  presentMobileBound = true;
  bindPresentOverflowMenu();
  bindPresentPanicConfirm();
}
