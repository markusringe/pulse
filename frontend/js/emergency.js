/**
 * Notfall-Banner und Panic-Button.
 */

export function showEmergencyBanner(on) {
  let bar = document.getElementById("emergency-banner");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "emergency-banner";
    bar.className = "emergency-banner";
    bar.setAttribute("role", "alert");
    document.body.append(bar);
  }
  bar.hidden = !on;
  bar.textContent = on ? "Session pausiert – Bitte warten" : "";
}

export function bindPanic(btn, { onPanic, onResume }) {
  if (!btn) return;
  btn.addEventListener("click", () => {
    const paused = btn.dataset.paused === "1";
    if (paused) onResume?.();
    else onPanic?.();
  });
}

export function setPanicState(btn, paused) {
  if (!btn) return;
  btn.dataset.paused = paused ? "1" : "0";
  btn.textContent = paused ? "✅ Session fortsetzen" : "🚨 Notfall";
  btn.classList.toggle("panic-on", paused);
}
