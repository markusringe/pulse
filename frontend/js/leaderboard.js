/**
 * Canvas-Rangliste Top 10 — vermeidet 10× komplexe DOM-Zeilen bei jedem Tick.
 * Trendpfeile (▲/▼/–) bleiben auch ohne Farbsehen unterscheidbar.
 */

const ROW = 44;
const PAD = 12;

/** @type {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, prev: Map<string, number> } | null} */
let board = null;

/**
 * @param {HTMLCanvasElement} canvas
 */
export function initLeaderboard(canvas) {
  destroyLeaderboard();
  const ctx = canvas.getContext("2d");
  board = { canvas, ctx, prev: new Map() };
  size(canvas);
  return board;
}

/**
 * @param {{ id?: string, name: string, points: number, trend?: string }[]} entries
 */
export function updateLeaderboard(entries) {
  if (!board) return;
  size(board.canvas);
  const { ctx, canvas, prev } = board;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const list = (entries || []).slice(0, 10);
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1a1d23";
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#3d4450";
  ctx.textBaseline = "middle";
  list.forEach((row, i) => {
    const y = PAD + i * ROW + ROW / 2;
    const id = row.id || row.name;
    const old = prev.has(id) ? prev.get(id) : i;
    const trend = row.trend || (old > i ? "up" : old < i ? "down" : "same");
    drawAvatar(ctx, PAD + 18, y, initials(row.name), i);
    ctx.fillStyle = ink.trim();
    ctx.font = "650 15px system-ui, sans-serif";
    ctx.fillText(`${i + 1}.  ${row.name}`, PAD + 48, y);
    ctx.fillStyle = muted.trim();
    ctx.font = "700 15px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(String(row.points ?? 0), w - PAD - 28, y);
    ctx.textAlign = "left";
    drawTrend(ctx, w - PAD - 8, y, trend);
    prev.set(id, i);
  });
}

export function destroyLeaderboard() {
  board = null;
}

function size(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = Math.max(200, canvas.clientWidth || 360);
  const cssH = PAD * 2 + ROW * 10;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.height = `${cssH}px`;
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function drawAvatar(ctx, x, y, text, i) {
  const cs = getComputedStyle(document.documentElement);
  const idx = (i % 6) + 1;
  const bg = cs.getPropertyValue(`--c${idx}`).trim() || "#007cc1";
  const ink = cs.getPropertyValue(`--c${idx}-ink`).trim() || "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

function drawTrend(ctx, x, y, trend) {
  ctx.beginPath();
  if (trend === "up") {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--c2").trim() || "#0f6b3d";
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x - 5, y + 4);
    ctx.lineTo(x + 5, y + 4);
  } else if (trend === "down") {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--c1").trim() || "#b42318";
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x - 5, y - 4);
    ctx.lineTo(x + 5, y - 4);
  } else {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#3d4450";
    ctx.fillRect(x - 5, y - 1, 10, 3);
    return;
  }
  ctx.closePath();
  ctx.fill();
}
