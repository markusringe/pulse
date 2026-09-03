/**
 * Ephemere Reaktionen auf der Bühne — keine Speicherung, nur Animation.
 */

const EMOJIS = ["👏", "❤️", "👍", "❓"];

export function allowedEmojis() {
  return EMOJIS;
}

/**
 * Kleine Button-Leiste fürs Handy.
 * @param {HTMLElement} root
 * @param {(emoji: string) => void} onSend
 */
export function mountReactionBar(root, onSend) {
  if (!root) return;
  root.replaceChildren();
  root.classList.add("reaction-bar");
  root.setAttribute("role", "group");
  for (const emoji of EMOJIS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reaction-btn";
    btn.textContent = emoji;
    btn.setAttribute("aria-label", emoji);
    btn.addEventListener("click", () => onSend(emoji));
    root.append(btn);
  }
}

/**
 * Emoji steigt auf der Präsentationsfläche auf und verschwindet.
 * @param {HTMLElement} stage
 * @param {string} emoji
 */
export function burstReaction(stage, emoji) {
  if (!stage || !allowedEmojis().includes(emoji)) return;
  const el = document.createElement("span");
  el.className = "reaction-float";
  el.textContent = emoji;
  el.setAttribute("aria-hidden", "true");
  const x = 12 + Math.random() * 76;
  el.style.left = `${x}%`;
  stage.append(el);
  window.setTimeout(() => el.remove(), 1800);
}
