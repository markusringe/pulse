/**
 * Multiple-Choice-Poll mit horizontalem Balkendiagramm.
 *
 * Performance:
 * - DOM wird einmal in initPoll() aufgebaut (keine List-Diffs bei jedem Vote).
 * - updatePollResults() schreibt nur CSS-Variable --bar-width und Textknoten.
 * - Alle Writes laufen über requestAnimationFrame (Batch-Rendering).
 * - Balkenbreite animiert per CSS-Transition, ohne JS-Tweening.
 * - Balkenfarben über Theme-Tokens --c1…--c6; Textfarbe --cN-ink (WCAG AA).
 */

/** @type {PollView | null} */
let active = null;
let rafId = 0;
let pendingResults = null;

/**
 * Initialisiert die Umfrage im Container.
 * @param {HTMLElement} container
 * @param {{ id?: string, question?: string, options: { id: string, label: string }[] }} pollConfig
 */
export function initPoll(container, pollConfig) {
  if (!container) throw new Error("initPoll: Container fehlt");
  const options = (pollConfig.options || []).slice(0, 6);
  if (options.length < 2) throw new Error("initPoll: mindestens 2 Optionen");

  container.innerHTML = "";
  const live = document.createElement("p");
  live.className = "sr-only";
  live.id = "poll-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");

  const root = document.createElement("div");
  root.className = "poll";
  root.setAttribute("role", "table");
  root.setAttribute("aria-label", "Umfrageergebnisse");
  root.setAttribute("aria-describedby", "poll-live");

  const rows = options.map((opt, index) => {
    const row = document.createElement("div");
    row.className = "poll-row";
    row.dataset.optionId = opt.id;
    row.setAttribute("role", "row");

    const label = document.createElement("div");
    label.className = "poll-label";
    label.id = `poll-label-${opt.id}`;
    label.setAttribute("role", "rowheader");
    label.textContent = opt.label;

    const track = document.createElement("div");
    track.className = "poll-track";
    track.setAttribute("role", "cell");

    const fill = document.createElement("div");
    fill.className = "poll-fill";
    fill.dataset.color = String(index % 6);
    fill.style.setProperty("--bar-width", "0%");
    fill.setAttribute("role", "progressbar");
    fill.setAttribute("aria-labelledby", label.id);
    fill.setAttribute("aria-valuemin", "0");
    fill.setAttribute("aria-valuemax", "100");
    fill.setAttribute("aria-valuenow", "0");

    /* Stimmenzahl sitzt IM Balken und erbt --cN-ink (weiß nur auf dunkler Fläche). */
    const count = document.createElement("span");
    count.className = "poll-count";
    count.hidden = true;
    count.textContent = "";
    fill.append(count);

    track.append(fill);

    const pct = document.createElement("div");
    pct.className = "poll-pct";
    pct.setAttribute("role", "cell");
    pct.textContent = "0%";

    row.append(label, track, pct);
    root.append(row);

    return { id: opt.id, label: opt.label, fill, count, pct };
  });

  container.append(live, root);
  active = { container, options, rows, live };
  return active;
}

/**
 * Aktualisiert Stimmenanteile. Mehrfachaufrufe in einem Frame werden zusammengefasst.
 * @param {{ counts?: Record<string, number>, results?: { id: string, votes: number }[], total?: number }} results
 */
export function updatePollResults(results) {
  if (!active) return;
  pendingResults = results;
  if (rafId) return;
  rafId = requestAnimationFrame(flushPollResults);
}

function flushPollResults() {
  rafId = 0;
  const results = pendingResults;
  pendingResults = null;
  if (!active || !results) return;

  const counts = normalizeCounts(results, active.rows);
  let total = 0;
  for (const row of active.rows) total += counts[row.id] || 0;

  for (const row of active.rows) {
    const votes = counts[row.id] || 0;
    const ratio = total > 0 ? votes / total : 0;
    const pct = Math.round(ratio * 100);
    row.fill.style.setProperty("--bar-width", `${(ratio * 100).toFixed(2)}%`);
    row.fill.setAttribute("aria-valuenow", String(pct));
    row.fill.setAttribute("aria-valuetext", `${row.label}: ${pct} Prozent, ${votes} Stimmen`);
    /* Prozent und Stimmen immer neben dem Balken (Theme-Textfarbe, AA). */
    row.pct.textContent = votes ? `${pct}% · ${votes}` : `${pct}%`;
    /* Zahl im Balken nur, wenn die Fläche breit genug ist — sonst nur die Spalte rechts. */
    const showInside = votes > 0 && ratio >= 0.22;
    row.count.hidden = !showInside;
    row.count.textContent = showInside ? String(votes) : "";
  }

  if (active.live) {
    active.live.textContent = active.rows
      .map((row) => {
        const votes = counts[row.id] || 0;
        const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
        return `${row.label} ${pct} Prozent, ${votes} Stimmen`;
      })
      .join(". ");
  }
}

function normalizeCounts(results, rows) {
  if (results.counts && typeof results.counts === "object") return results.counts;
  const counts = {};
  if (Array.isArray(results.results)) {
    for (const item of results.results) counts[item.id] = item.votes || 0;
    return counts;
  }
  for (const row of rows) counts[row.id] = 0;
  return counts;
}

export function destroyPoll() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  pendingResults = null;
  active = null;
}

export const pollTypes = {
  MULTIPLE_CHOICE: "choice",
  RATING_SCALE: "rating_scale",
  WORD_CLOUD: "wordcloud",
  QUIZ: "quiz",
  QA: "qa",
};

const DEFAULT_RATING = {
  scale: 5,
  labels: ["Sehr schlecht", "Schlecht", "Neutral", "Gut", "Sehr gut"],
  icons: ["😠", "😕", "😐", "🙂", "😍"],
};

/**
 * Präsentator: Verteilung + Durchschnitt der Bewertungsskala.
 */
export function initRatingScale(container, config = {}) {
  destroyPoll();
  const scale = clampScale(config.scale || config.rating?.scale || 5);
  const labels = config.rating?.labels || config.labels || DEFAULT_RATING.labels.slice(0, scale);
  const icons = config.rating?.icons || config.icons || DEFAULT_RATING.icons.slice(0, scale);
  container.innerHTML = "";
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  const avg = document.createElement("p");
  avg.className = "rating-avg";
  avg.textContent = "Ø –";
  const trend = document.createElement("p");
  trend.className = "rating-trend muted";
  const root = document.createElement("div");
  root.className = "poll rating-results";
  const rows = [];
  for (let i = 1; i <= scale; i++) {
    const row = document.createElement("div");
    row.className = "poll-row";
    row.innerHTML = `<div class="poll-label">${icons[i - 1] || i} ${labels[i - 1] || i}</div>
      <div class="poll-track"><div class="poll-fill" data-color="${(i - 1) % 6}" style="--bar-width:0%"><span class="poll-count" hidden></span></div></div>
      <div class="poll-pct">0%</div>`;
    root.append(row);
    rows.push({
      id: String(i),
      label: labels[i - 1] || String(i),
      fill: row.querySelector(".poll-fill"),
      count: row.querySelector(".poll-count"),
      pct: row.querySelector(".poll-pct"),
    });
  }
  container.append(live, avg, trend, root);
  active = { container, rows, live, avg, trend, scale, previousAverage: config.previousAverage };
  return active;
}

export function updateRatingResults(results) {
  updatePollResults(results);
  if (!active?.avg) return;
  const counts = normalizeCounts(results, active.rows);
  let sum = 0;
  let n = 0;
  for (const row of active.rows) {
    const v = counts[row.id] || 0;
    sum += Number(row.id) * v;
    n += v;
  }
  const avg = n ? sum / n : 0;
  active.avg.textContent = n ? `Ø ${avg.toFixed(1)} von ${active.scale}` : "Ø –";
  if (active.previousAverage) {
    active.trend.textContent = `Letzte Runde: Ø ${Number(active.previousAverage).toFixed(1)}`;
  }
}

/**
 * Teilnehmer: große Touch-Flächen, Pfeiltasten, Tooltip-Labels.
 */
export function renderRatingInput(container, config, { disabled, selected, onPick } = {}) {
  const scale = clampScale(config.scale || config.rating?.scale || 5);
  const labels = config.rating?.labels || config.labels || DEFAULT_RATING.labels.slice(0, scale);
  const icons = config.rating?.icons || config.icons || DEFAULT_RATING.icons.slice(0, scale);
  const style = config.rating?.style || config.style || "icons";
  container.innerHTML = "";
  container.classList.add("rating-scale");
  container.setAttribute("role", "radiogroup");
  container.setAttribute("aria-label", "Bewertungsskala");
  for (let i = 1; i <= scale; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rating-btn";
    btn.dataset.value = String(i);
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", selected === i ? "true" : "false");
    btn.setAttribute("aria-label", `${i}: ${labels[i - 1] || i}`);
    btn.title = `${i} = ${labels[i - 1] || i}`;
    btn.disabled = Boolean(disabled);
    btn.tabIndex = selected ? (selected === i ? 0 : -1) : i === 1 ? 0 : -1;
    btn.textContent = style === "stars" ? "⭐" : style === "numbers" ? String(i) : icons[i - 1] || String(i);
    btn.addEventListener("click", () => onPick?.(i, btn));
    container.append(btn);
  }
  container.onkeydown = (ev) => {
    const buttons = [...container.querySelectorAll("button:not(:disabled)")];
    const idx = Math.max(0, buttons.indexOf(document.activeElement));
    if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const n = buttons[(idx + 1) % buttons.length];
      n.focus();
    } else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
      ev.preventDefault();
      const n = buttons[(idx - 1 + buttons.length) % buttons.length];
      n.focus();
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      document.activeElement?.click();
    }
  };
}

function clampScale(n) {
  if (n === 7 || n === 10) return n;
  return 5;
}
