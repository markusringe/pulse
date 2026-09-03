/**
 * Join-View auf dem Smartphone: Daumen-Zone, Swipe zwischen Optionen/Q&A,
 * kurze Haptik nach erfolgreichem Senden.
 *
 * Swipe wechselt NICHT die Presenter-Folie — nur lokale Antwort-Karten.
 * Buttons bleiben als Fallback.
 */

const SWIPE_MIN = 48;

/**
 * Kurze Vibration nach Stimme/Wort/Q&A, nur mit User-Geste und vorhandener API.
 */
export function hapticSuccess() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(15);
    }
  } catch {
    /* keine Haptik — still weitermachen */
  }
}

/**
 * Einmal Touch-Listener auf dem Join-Main. Neu gerenderte Buttons bleiben
 * per Delegation erreichbar.
 * @param {HTMLElement} joinMain
 */
export function bindJoinGestures(joinMain) {
  if (!joinMain || joinMain.dataset.swipeBound === "1") return;
  joinMain.dataset.swipeBound = "1";
  let startX = 0;
  let startY = 0;

  joinMain.addEventListener(
    "touchstart",
    (ev) => {
      const t = ev.changedTouches?.[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    },
    { passive: true }
  );

  joinMain.addEventListener(
    "touchend",
    (ev) => {
      const t = ev.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      const forward = dx < 0;
      const choice = joinMain.querySelector("#join-choice:not([hidden])");
      const qa = joinMain.querySelector("#join-qa:not([hidden])");
      const quiz = joinMain.querySelector("#join-quiz:not([hidden])");
      const rating = joinMain.querySelector("#join-rating:not([hidden])");
      if (choice) cycleItems(choice, ".choice-btn:not(:disabled)", forward);
      else if (qa) cycleItems(qa, ".qa-card, .qa-featured, .qa-row", forward);
      else if (quiz) cycleItems(quiz, "button:not(:disabled)", forward);
      else if (rating) cycleItems(rating, "button:not(:disabled)", forward);
    },
    { passive: true }
  );
}

/**
 * Nächstes/vorheriges Element in den Blick — Tap/Klick bleibt die Aktion.
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {boolean} forward
 */
export function cycleItems(root, selector, forward) {
  if (!root) return;
  const items = [...root.querySelectorAll(selector)].filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.hidden) return false;
    return el.getClientRects().length > 0;
  });
  if (items.length < 2) return;
  const current = items.find((el) => el === document.activeElement || el.classList.contains("is-swipe-focus"));
  const idx = current ? items.indexOf(current) : 0;
  const next = items[(idx + (forward ? 1 : -1) + items.length) % items.length];
  for (const el of items) el.classList.remove("is-swipe-focus");
  next.classList.add("is-swipe-focus");
  if (typeof next.focus === "function" && next.tabIndex >= 0) {
    try {
      next.focus({ preventScroll: true });
    } catch {
      next.focus();
    }
  }
  next.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
}
