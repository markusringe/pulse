/**
 * Wortwolken-Zählung und Packing — ohne DOM, damit Main-Thread und Worker
 * denselben Algorithmus nutzen. Canvas-Zeichnen bleibt im Main-Thread.
 */

export const MAX_CLOUD_WORDS = 80;
export const MIN_FONT = 14;
export const MAX_FONT = 78;

const STOP = new Set(
  "der die das und oder ein eine den dem des mit von zu im in ist sind war wir ihr sie nicht auch nur so wie für auf aus als bei nach vor über".split(" ")
);

/**
 * Stopwörter und Mini-Tokens aus der Wolke halten.
 * @param {string} word
 */
export function isStopword(word) {
  const key = String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+/g, "");
  return !key || key.length < 2 || STOP.has(key);
}

/**
 * Einträge vereinheitlichen, filtern, nach Häufigkeit sortieren.
 * @param {{ text?: string, word?: string, count?: number }[] | Record<string, number>} entries
 */
export function normalizeEntries(entries) {
  let list;
  if (Array.isArray(entries)) {
    list = entries.map((e) => ({
      text: String(e.text || e.word || "").trim(),
      count: Number(e.count) || 0,
    }));
  } else {
    list = Object.entries(entries || {}).map(([text, count]) => ({
      text,
      count: Number(count) || 0,
    }));
  }
  return list
    .filter((e) => e.text && !isStopword(e.text))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "de"));
}

/**
 * Spiralförmiges Packing auf einem Occupancy-Grid (1 Byte/Zelle).
 * words: vorab gemessene Rechtecke { text, count, tw, th, size, t }.
 * @returns {{ text: string, x: number, y: number, size: number, t: number }[]}
 */
export function packWords(words, w, h) {
  const cell = 4;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const grid = new Uint8Array(Math.max(1, cols * rows));
  const cx = w / 2;
  const cy = h / 2;
  const placed = [];
  for (const word of words) {
    const pos = placeWord(grid, cols, rows, cell, w, h, cx, cy, word.tw, word.th);
    placed.push({
      text: word.text,
      x: pos.x,
      y: pos.y,
      size: word.size,
      t: word.t,
      count: word.count,
    });
    markOccupied(grid, cols, rows, cell, pos.x, pos.y, word.tw, word.th);
  }
  return placed;
}

function placeWord(grid, cols, rows, cell, w, h, cx, cy, tw, th) {
  let angle = 0;
  let radius = 0;
  const maxR = Math.hypot(w, h);
  while (radius < maxR) {
    const x = cx + Math.cos(angle) * radius - tw / 2;
    const y = cy + Math.sin(angle) * radius - th / 2;
    if (x > 8 && y > 8 && x + tw < w - 8 && y + th < h - 8 && !collides(grid, cols, rows, cell, x, y, tw, th)) {
      return { x, y };
    }
    angle += 0.32;
    radius = 2.4 * angle;
  }
  return { x: cx - tw / 2, y: cy - th / 2 };
}

function collides(grid, cols, rows, cell, x, y, tw, th) {
  const pad = 3;
  const x0 = Math.max(0, Math.floor((x - pad) / cell));
  const y0 = Math.max(0, Math.floor((y - pad) / cell));
  const x1 = Math.min(cols - 1, Math.floor((x + tw + pad) / cell));
  const y1 = Math.min(rows - 1, Math.floor((y + th + pad) / cell));
  for (let gy = y0; gy <= y1; gy++) {
    const row = gy * cols;
    for (let gx = x0; gx <= x1; gx++) {
      if (grid[row + gx]) return true;
    }
  }
  return false;
}

function markOccupied(grid, cols, rows, cell, x, y, tw, th) {
  const pad = 3;
  const x0 = Math.max(0, Math.floor((x - pad) / cell));
  const y0 = Math.max(0, Math.floor((y - pad) / cell));
  const x1 = Math.min(cols - 1, Math.floor((x + tw + pad) / cell));
  const y1 = Math.min(rows - 1, Math.floor((y + th + pad) / cell));
  for (let gy = y0; gy <= y1; gy++) {
    const row = gy * cols;
    for (let gx = x0; gx <= x1; gx++) grid[row + gx] = 1;
  }
}
