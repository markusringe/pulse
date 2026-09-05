/**
 * Stage: auto-ausblendbare Vollbildsteuerung (unten rechts, Hot Corner).
 * Kein Mount bei Screen-Share (?share=1) — reine lokale Fullscreen-API.
 */

const HIDE_MS = 3000;

/** @type {WeakMap<HTMLElement, {
 *   hideTimer: ReturnType<typeof setTimeout> | null,
 *   firstTouchDone: boolean,
 *   onMove: (ev: MouseEvent) => void,
 *   onPointerDown: (ev: PointerEvent) => void,
 *   onFsChange: () => void,
 *   onF10: (ev: KeyboardEvent) => void,
 *   btn: HTMLButtonElement | null,
 * }>} */
const mounts = new WeakMap();

/**
 * Vollbild-Overlay an #view-stage mounten.
 * @param {HTMLElement | null} root
 * @param {{ share?: boolean, t?: (key: string) => string }} [opts]
 */
export function mountStageDisplayControls(root, opts = {}) {
  if (!root) return;
  destroyStageDisplayControls(root);
  if (opts.share) return;

  const overlay = document.createElement("div");
  overlay.className = "stage-display-controls";
  overlay.dataset.stageControls = "1";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "stage-fs";
  btn.className = "stage-fs";
  btn.dataset.i18n = "stage.fullscreen";

  overlay.appendChild(btn);
  root.appendChild(overlay);

  const t = opts.t || ((k) => k);
  const syncLabel = () => {
    const on = Boolean(document.fullscreenElement);
    btn.textContent = on ? t("stage.fullscreenExit") : t("stage.fullscreen");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  };

  btn.addEventListener("click", () => {
    const fsRoot = root || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else fsRoot.requestFullscreen?.();
  });

  const onFsChange = () => syncLabel();
  document.addEventListener("fullscreenchange", onFsChange);

  const onF10 = (ev) => {
    if (ev.key !== "F10") return;
    if (!root.isConnected) return;
    ev.preventDefault();
    btn.click();
  };
  document.addEventListener("keydown", onF10);

  syncLabel();

  const state = {
    hideTimer: null,
    firstTouchDone: false,
    onMove: null,
    onPointerDown: null,
    onFsChange,
    onF10,
    btn,
  };

  const scheduleHide = () => {
    if (state.hideTimer) clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
      overlay.classList.remove("is-visible");
    }, HIDE_MS);
  };

  const reveal = () => {
    overlay.classList.add("is-visible");
    scheduleHide();
  };

  state.onMove = (ev) => {
    if (isInHotCorner(root, ev.clientX, ev.clientY)) reveal();
  };

  state.onPointerDown = (ev) => {
    if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
    if (isInHotCorner(root, ev.clientX, ev.clientY)) {
      reveal();
      return;
    }
    if (!state.firstTouchDone) {
      state.firstTouchDone = true;
      reveal();
    }
  };

  root.addEventListener("mousemove", state.onMove);
  root.addEventListener("pointerdown", state.onPointerDown);

  mounts.set(root, state);
  reveal();
}

/**
 * Listener und Overlay entfernen.
 * @param {HTMLElement | null} root
 */
export function destroyStageDisplayControls(root) {
  if (!root) return;
  const state = mounts.get(root);
  if (state) {
    if (state.hideTimer) clearTimeout(state.hideTimer);
    if (state.onMove) root.removeEventListener("mousemove", state.onMove);
    if (state.onPointerDown) root.removeEventListener("pointerdown", state.onPointerDown);
    document.removeEventListener("fullscreenchange", state.onFsChange);
    document.removeEventListener("keydown", state.onF10);
    mounts.delete(root);
  }
  root.querySelector(".stage-display-controls")?.remove();
}

/**
 * Hot Corner unten rechts (Spec: min(240px,25vw) × min(160px,22vh)).
 * @param {HTMLElement} root
 * @param {number} clientX
 * @param {number} clientY
 */
function isInHotCorner(root, clientX, clientY) {
  const rect = root.getBoundingClientRect();
  const w = Math.min(240, rect.width * 0.25);
  const h = Math.min(160, rect.height * 0.22);
  return clientX >= rect.left + rect.width - w && clientY >= rect.top + rect.height - h;
}
