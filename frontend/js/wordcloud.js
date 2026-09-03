/**
 * Canvas-Wortwolke + virtuell gescrollte Rangliste.
 *
 * Warum Canvas statt DOM-Spans?
 * - Tausende Wörter als DOM-Knoten erzeugen Layout/Paint-Kosten (reflow).
 * - Ein Canvas hat einen Draw-Call-Pfad; Collision und Animation bleiben in JS.
 *
 * Layout/Zählung laufen im Web-Worker (wordcloud-worker.js), sobald initWordCloud
 * aufgerufen wird — beim App-Start passiert hier nichts. Fehlt Worker-Support,
 * packt der Main-Thread selbst (wordcloud-layout.js).
 *
 * Farben kommen aus den Theme-Tokens (--primary-color, --ink, --muted).
 * Häufigkeit steuert Größe UND Farbband (häufig = kräftiger, selten = anderes Chromatisches).
 */
import { normalizeEntries, packWords, MAX_CLOUD_WORDS, MIN_FONT, MAX_FONT } from "./wordcloud-layout.js";

const ROW_HEIGHT = 36;
const OVERSCAN = 6;

/** @type {WordCloudView | null} */
let cloud = null;
let layoutSeq = 0;

/**
 * @param {HTMLElement} container  Wrapper mit Canvas + optionaler Liste
 * @param {{ canvas: HTMLCanvasElement, list?: HTMLElement, question?: string }} config
 */
export function initWordCloud(container, config) {
  destroyWordCloud();
  const canvas = config.canvas || container.querySelector("canvas");
  if (!canvas) throw new Error("initWordCloud: Canvas fehlt");

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("role", "presentation");

  let live = container.querySelector(".wordcloud-live");
  if (!live) {
    live = document.createElement("p");
    live.className = "sr-only wordcloud-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    container.prepend(live);
  }
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  let overlay = container.querySelector(".wordcloud-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "wordcloud-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.innerHTML = `<p class="wordcloud-overlay-text"></p><button type="button" class="btn ghost" data-close>Schließen</button>`;
    overlay.querySelector("[data-close]").addEventListener("click", () => {
      overlay.hidden = true;
    });
    container.append(overlay);
  }

  let exportBtn = container.querySelector(".wordcloud-export");
  if (config.exportable) {
    if (!exportBtn) {
      exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "btn ghost wordcloud-export";
      exportBtn.textContent = "PNG exportieren";
      container.append(exportBtn);
    }
    exportBtn.hidden = false;
    exportBtn.onclick = () => downloadPng(canvas);
  } else if (exportBtn) {
    exportBtn.hidden = true;
  }

  cloud = {
    container,
    canvas,
    ctx,
    dpr,
    words: /** @type {CloudWord[]} */ ([]),
    sprites: /** @type {Sprite[]} */ ([]),
    animating: false,
    raf: 0,
    layoutTimer: 0,
    virtual: config.list ? createVirtualList(config.list) : null,
    resizeObs: null,
    live,
    overlay,
    lastEntries: [],
    worker: createLayoutWorker(),
    pendingId: 0,
    /* Stage-Leinwand: extra große Wörter; Presenter behält die Defaults. */
    minFont: Number(config.minFont) > 0 ? Number(config.minFont) : MIN_FONT,
    maxFont: Number(config.maxFont) > 0 ? Number(config.maxFont) : MAX_FONT,
    fontHeightFrac: Number(config.fontHeightFrac) > 0 ? Number(config.fontHeightFrac) : 0.18,
  };

  canvas.addEventListener("click", (ev) => onCanvasClick(ev, cloud));

  const ro = new ResizeObserver(() => {
    sizeCanvas(cloud);
    scheduleLayout();
  });
  ro.observe(container);
  cloud.resizeObs = ro;
  sizeCanvas(cloud);

  return cloud;
}

/**
 * @param {{ text: string, count: number }[] | Record<string, number>} entries
 */
export function updateWordCloud(entries) {
  if (!cloud) return;
  const list = normalizeEntries(entries);
  cloud.lastEntries = list;
  cloud.virtual?.setItems(list);
  if (cloud.live) {
    const top = list.slice(0, 8).map((e, i) => `${i + 1}. ${e.text}, ${e.count} mal`).join(". ");
    cloud.live.textContent = list.length
      ? `Wortwolke, ${list.length} Einträge. Häufigste: ${top}`
      : "Wortwolke noch ohne Einträge.";
  }

  const top = list.slice(0, MAX_CLOUD_WORDS);
  mergeSprites(cloud, top);
  scheduleLayout();
}

export function destroyWordCloud() {
  if (!cloud) return;
  cancelAnimationFrame(cloud.raf);
  window.clearTimeout(cloud.layoutTimer);
  cloud.resizeObs?.disconnect();
  cloud.virtual?.destroy();
  try {
    cloud.worker?.terminate();
  } catch {
    /* Worker schon tot */
  }
  cloud = null;
}

function createLayoutWorker() {
  if (typeof Worker === "undefined") return null;
  try {
    /* import.meta.url folgt ASSET_BASE, falls JS vom CDN kommt. */
    return new Worker(new URL("./wordcloud-worker.js", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

function sizeCanvas(view) {
  const container = view.container;
  const rect = view.canvas.getBoundingClientRect();
  /* Fallback: Containerbreite nutzen, wenn Canvas-Höhe noch 0 (Mobile-Layout). */
  const containerRect = container?.getBoundingClientRect?.();
  let w = Math.max(1, Math.floor(rect.width || containerRect?.width || 1));
  let h = Math.max(1, Math.floor(rect.height || containerRect?.height || 1));
  if (h <= 1 && containerRect?.height) {
    h = Math.max(220, Math.floor(containerRect.height * 0.65));
  }
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  view.dpr = dpr;
  if (view.canvas.width !== Math.floor(w * dpr) || view.canvas.height !== Math.floor(h * dpr)) {
    view.canvas.width = Math.floor(w * dpr);
    view.canvas.height = Math.floor(h * dpr);
  }
  view.canvas.style.width = `${w}px`;
  view.canvas.style.height = `${h}px`;
}

function mergeSprites(view, entries) {
  const byText = new Map(view.sprites.map((s) => [s.text, s]));
  const next = [];
  for (const entry of entries) {
    const prev = byText.get(entry.text);
    if (prev) {
      prev.count = entry.count;
      prev.alive = true;
      next.push(prev);
    } else {
      next.push({
        text: entry.text,
        count: entry.count,
        x: 0,
        y: 0,
        size: MIN_FONT,
        opacity: 0,
        tx: 0,
        ty: 0,
        tsize: MIN_FONT,
        to: 1,
        alive: true,
        color: colorForFrequency(entry.text, 0.5),
      });
    }
  }
  for (const s of view.sprites) {
    if (!entries.some((e) => e.text === s.text)) {
      s.alive = false;
      s.to = 0;
      next.push(s);
    }
  }
  view.sprites = next;
}

function scheduleLayout() {
  if (!cloud) return;
  window.clearTimeout(cloud.layoutTimer);
  // Debounce: viele WS-Events in kurzer Zeit erzeugen nur EIN Packing.
  cloud.layoutTimer = window.setTimeout(runLayout, 80);
}

function measureAlive(view) {
  const { canvas, ctx, dpr, sprites } = view;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const alive = sprites.filter((s) => s.alive);
  const maxCount = Math.max(1, ...alive.map((s) => s.count));
  const minCount = Math.min(maxCount, ...alive.map((s) => s.count));
  const family = getComputedStyle(document.body).fontFamily;
  const words = [];
  for (const sprite of alive) {
    const t = maxCount === minCount ? 1 : (sprite.count - minCount) / (maxCount - minCount);
    const minF = view.minFont || MIN_FONT;
    const maxF = view.maxFont || MAX_FONT;
    const frac = view.fontHeightFrac || 0.18;
    const size = minF + t * (Math.min(maxF, h * frac) - minF);
    ctx.font = `700 ${size}px ${family}`;
    const tw = ctx.measureText(sprite.text).width;
    const th = size * 0.92;
    words.push({ text: sprite.text, count: sprite.count, tw, th, size, t, sprite });
  }
  return { w, h, words };
}

function applyPlaced(view, placed) {
  const byText = new Map(placed.map((p) => [p.text, p]));
  for (const sprite of view.sprites) {
    if (!sprite.alive) continue;
    const hit = byText.get(sprite.text);
    if (!hit) continue;
    sprite.tsize = hit.size;
    sprite.tx = hit.x;
    sprite.ty = hit.y;
    sprite.to = 1;
    sprite.color = colorForFrequency(sprite.text, hit.t);
    if (sprite.opacity < 0.05) {
      sprite.x = hit.x;
      sprite.y = hit.y;
      sprite.size = hit.size * 0.72;
    }
  }
  startAnimation();
}

function runLayout() {
  if (!cloud) return;
  const { w, h, words } = measureAlive(cloud);
  if (w < 8 || h < 8) return;

  const payload = words.map(({ sprite, ...rest }) => rest);
  const worker = cloud.worker;
  if (worker) {
    const id = ++layoutSeq;
    cloud.pendingId = id;
    const onMsg = (ev) => {
      if (!cloud || ev.data?.id !== cloud.pendingId || ev.data?.type !== "layout") return;
      worker.removeEventListener("message", onMsg);
      applyPlaced(cloud, ev.data.placed || []);
    };
    worker.addEventListener("message", onMsg);
    try {
      worker.postMessage({ type: "layout", id, width: w, height: h, words: payload });
      return;
    } catch {
      worker.removeEventListener("message", onMsg);
    }
  }
  /* Fallback ohne Worker: Packing auf dem Main-Thread, Zeichnen unverändert. */
  applyPlaced(cloud, packWords(payload, w, h));
}

function startAnimation() {
  if (!cloud || cloud.animating) return;
  cloud.animating = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = () => {
    if (!cloud) return;
    const done = drawFrame(cloud, reduced ? 1 : 0.16);
    if (!done) {
      cloud.raf = requestAnimationFrame(step);
    } else {
      cloud.animating = false;
      cloud.sprites = cloud.sprites.filter((s) => s.alive || s.opacity > 0.01);
    }
  };
  cloud.raf = requestAnimationFrame(step);
}

function drawFrame(view, lerp) {
  const { ctx, canvas, dpr, sprites } = view;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  let settled = true;
  const family = getComputedStyle(document.body).fontFamily;

  for (const s of sprites) {
    s.x += (s.tx - s.x) * lerp;
    s.y += (s.ty - s.y) * lerp;
    s.size += (s.tsize - s.size) * lerp;
    s.opacity += (s.to - s.opacity) * lerp;

    if (Math.abs(s.tx - s.x) > 0.4 || Math.abs(s.tsize - s.size) > 0.3 || Math.abs(s.to - s.opacity) > 0.02) {
      settled = false;
    }

    if (s.opacity <= 0.01) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity));
    ctx.fillStyle = s.color;
    ctx.font = `700 ${s.size}px ${family}`;
    ctx.textBaseline = "top";
    ctx.fillText(s.text, s.x, s.y);
  }
  ctx.globalAlpha = 1;
  return settled;
}

/**
 * Häufig = Stadtblau/Primary, selten = muted. Größe UND Farbe, kein Grau-only.
 */
function colorForFrequency(text, t) {
  const cs = getComputedStyle(document.documentElement);
  const primary = cs.getPropertyValue("--primary-color").trim() || "#007CC1";
  const muted = cs.getPropertyValue("--muted").trim() || "#3d4450";
  const ink = cs.getPropertyValue("--ink").trim() || "#1a1d23";
  if (t >= 0.55) return primary;
  if (t >= 0.25) return ink;
  return muted;
}

function onCanvasClick(ev, view) {
  const rect = view.canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const hit = [...view.sprites].reverse().find((s) => {
    if (!s.alive || s.opacity < 0.4) return false;
    view.ctx.font = `700 ${s.size}px ${getComputedStyle(document.body).fontFamily}`;
    const w = view.ctx.measureText(s.text).width;
    const h = s.size * 0.92;
    return x >= s.x && x <= s.x + w && y >= s.y && y <= s.y + h;
  });
  if (!hit || !view.overlay) return;
  const n = hit.count;
  view.overlay.hidden = false;
  view.overlay.querySelector(".wordcloud-overlay-text").textContent =
    n === 1 ? `1 Person hat „${hit.text}“ geschrieben.` : `${n} Personen haben „${hit.text}“ geschrieben.`;
}

function downloadPng(canvas) {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "wortwolke.png";
  a.click();
}

/**
 * Virtuelles Scroll-Fenster: nur sichtbare Zeilen existieren im DOM.
 * Bei 10.000 Unique-Wörtern bleiben ~20 Knoten statt 10.000.
 */
function createVirtualList(root) {
  root.setAttribute("role", "list");
  root.setAttribute("tabindex", "0");
  root.setAttribute("aria-label", "Rangliste der Wörter");
  root.innerHTML = "";
  const spacer = document.createElement("div");
  spacer.className = "virtual-list-spacer";
  const body = document.createElement("div");
  body.className = "virtual-list-body";
  root.append(spacer, body);

  let items = [];
  let pool = [];

  const render = () => {
    const h = root.clientHeight;
    const start = Math.max(0, Math.floor(root.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(h / ROW_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(items.length, start + visible);
    spacer.style.height = `${items.length * ROW_HEIGHT}px`;
    body.style.transform = `translateY(${start * ROW_HEIGHT}px)`;

    const needed = Math.max(0, end - start);
    while (pool.length < needed) {
      const row = document.createElement("div");
      row.className = "virtual-row";
      row.setAttribute("role", "listitem");
      row.innerHTML = "<b></b><span></span><em></em>";
      pool.push(row);
      body.append(row);
    }
    for (let i = 0; i < pool.length; i++) {
      const row = pool[i];
      if (i >= needed) {
        row.style.display = "none";
        continue;
      }
      row.style.display = "grid";
      const item = items[start + i];
      row.children[0].textContent = String(start + i + 1);
      row.children[1].textContent = item.text;
      row.children[2].textContent = String(item.count);
    }
  };

  root.addEventListener("scroll", render, { passive: true });

  return {
    setItems(next) {
      items = next;
      render();
    },
    destroy() {
      root.removeEventListener("scroll", render);
      root.innerHTML = "";
    },
  };
}
