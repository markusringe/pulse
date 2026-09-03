/**
 * Presenter-Ergebnisse für Ranking, Punkte-100, Freitext, Bildwahl, Termine.
 * Nutzt Theme-Balken (Primary vs. muted) — keine Graustufen-only-Unterscheidung.
 */

/**
 * @param {HTMLElement} root
 * @param {object} slide
 * @param {{ t?: Function }} [opts]
 */
export function renderTypedResults(root, slide, opts = {}) {
  if (!root || !slide) return;
  const t = opts.t;
  if (slide.type === "ranking") return renderRankingResults(root, slide, t);
  if (slide.type === "points100") return renderPointsResults(root, slide, t);
  if (slide.type === "open_text") return renderOpenTextResults(root, slide, t);
  if (slide.type === "image_choice") return renderImageResults(root, slide);
  if (slide.type === "datetime") return renderDatetimeResults(root, slide);
  if (slide.type === "picker") {
    import("./picker.js").then(({ renderPickerResults }) => renderPickerResults(root, slide, opts));
    return;
  }
}

function renderRankingResults(root, slide, t) {
  const stats = slide.ranks?.byId || {};
  const rows = (slide.options || []).map((opt) => {
    const row = stats[opt.id] || { average: 0, borda: 0 };
    return { ...opt, average: row.average, borda: row.borda };
  });
  rows.sort((a, b) => a.average - b.average || b.borda - a.borda);
  const maxBorda = Math.max(1, ...rows.map((r) => r.borda));
  root.innerHTML = `<p class="muted">${t ? t("slide.rankResults") : "Durchschnittsrang / Borda"}</p>`;
  const list = document.createElement("div");
  list.className = "poll";
  rows.forEach((row, i) => {
    const pct = Math.round((row.borda / maxBorda) * 100);
    const el = document.createElement("div");
    el.className = "poll-row";
    el.innerHTML = `
      <div class="poll-label">${escapeHtml(row.label)}</div>
      <div class="poll-track"><div class="poll-fill" data-color="${i % 6}" style="--bar-width:${pct}%"><span class="poll-count">${row.borda}</span></div></div>
      <div class="poll-pct">Ø ${row.average ? row.average.toFixed(2) : "–"}</div>`;
    list.append(el);
  });
  root.append(list);
}

function renderPointsResults(root, slide, t) {
  const stats = slide.points?.byId || {};
  const rows = (slide.options || []).map((opt) => {
    const row = stats[opt.id] || { sum: 0, average: 0 };
    return { ...opt, sum: row.sum, average: row.average };
  });
  const max = Math.max(1, ...rows.map((r) => r.sum));
  root.innerHTML = `<p class="muted">${t ? t("slide.pointsResults") : "Summe / Mittel je Option"}</p>`;
  const list = document.createElement("div");
  list.className = "poll";
  rows.forEach((row, i) => {
    const pct = Math.round((row.sum / max) * 100);
    const el = document.createElement("div");
    el.className = "poll-row";
    el.innerHTML = `
      <div class="poll-label">${escapeHtml(row.label)}</div>
      <div class="poll-track"><div class="poll-fill" data-color="${i % 6}" style="--bar-width:${pct}%"><span class="poll-count">${row.sum}</span></div></div>
      <div class="poll-pct">Ø ${row.average ? row.average.toFixed(1) : "0"}</div>`;
    list.append(el);
  });
  root.append(list);
}

function renderOpenTextResults(root, slide, t) {
  const entries = [...(slide.entries || [])].sort((a, b) => b.count - a.count);
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "open-text-cards";
  wrap.setAttribute("aria-label", t ? t("slide.openResults") : "Antworten");
  if (!entries.length) {
    wrap.innerHTML = `<p class="muted">${t ? t("slide.openEmpty") : "Noch keine Texte."}</p>`;
  }
  entries.forEach((e) => {
    const card = document.createElement("article");
    card.className = "open-text-card";
    card.innerHTML = `<p>${escapeHtml(e.text)}</p><span class="muted">× ${e.count}</span>`;
    wrap.append(card);
  });
  root.append(wrap);
}

function renderImageResults(root, slide) {
  const counts = slide.counts || {};
  const total = Object.values(counts).reduce((a, n) => a + Number(n || 0), 0) || 1;
  root.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "image-choice-results";
  (slide.options || []).forEach((opt, i) => {
    const n = Number(counts[opt.id]) || 0;
    const card = document.createElement("article");
    card.className = "image-result-card";
    if (opt.image) {
      const img = document.createElement("img");
      img.src = opt.image;
      img.alt = opt.label;
      card.append(img);
    }
    const bar = document.createElement("div");
    bar.className = "poll-track";
    bar.innerHTML = `<div class="poll-fill" data-color="${i % 6}" style="--bar-width:${Math.round((n / total) * 100)}%"></div>`;
    const cap = document.createElement("p");
    cap.textContent = `${opt.label} · ${n}`;
    card.append(cap, bar);
    grid.append(card);
  });
  root.append(grid);
}

function renderDatetimeResults(root, slide) {
  const counts = slide.counts || {};
  const max = Math.max(1, ...Object.values(counts).map((n) => Number(n) || 0));
  root.innerHTML = "";
  const list = document.createElement("div");
  list.className = "poll";
  (slide.options || []).forEach((opt, i) => {
    const n = Number(counts[opt.id]) || 0;
    const el = document.createElement("div");
    el.className = "poll-row";
    el.innerHTML = `
      <div class="poll-label">${escapeHtml(opt.label)}</div>
      <div class="poll-track"><div class="poll-fill" data-color="${i % 6}" style="--bar-width:${Math.round((n / max) * 100)}%"><span class="poll-count">${n}</span></div></div>
      <div class="poll-pct">${n}</div>`;
    list.append(el);
  });
  root.append(list);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
