/**
 * Join-Eingaben für Ranking, Punkte-100, Freitext, Bildwahl und Termine.
 * HTML5-Drag-and-Drop plus Touch, ohne zusätzliche Pakete.
 */

const POINTS_TOTAL = 100;

/**
 * Ranking: Optionen per Drag sortieren, dann absenden.
 */
export function renderRankingInput(root, options, { disabled, onSubmit, t } = {}) {
  if (!root) return;
  const items = (options || []).map((o) => ({ ...o }));
  root.innerHTML = "";
  root.classList.add("slide-input");
  const list = document.createElement("ol");
  list.className = "rank-list";
  list.setAttribute("aria-label", t ? t("slide.rankHint") : "Reihenfolge");
  items.forEach((opt, i) => list.append(rankRow(opt, i, disabled)));
  bindSortable(list, disabled);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn primary";
  btn.textContent = t ? t("join.send") : "Senden";
  btn.disabled = Boolean(disabled);
  btn.addEventListener("click", () => {
    const order = [...list.querySelectorAll("[data-option-id]")].map((el) => el.dataset.optionId);
    onSubmit?.({ kind: "ranking", order });
  });
  root.append(list, btn);
}

function rankRow(opt, index, disabled) {
  const li = document.createElement("li");
  li.className = "rank-item";
  li.draggable = !disabled;
  li.dataset.optionId = opt.id;
  li.tabIndex = disabled ? -1 : 0;
  li.innerHTML = `<span class="rank-handle" aria-hidden="true">☰</span><span class="rank-num">${index + 1}</span><span>${escapeHtml(opt.label)}</span>`;
  return li;
}

function bindSortable(list, disabled) {
  if (disabled) return;
  let dragEl = null;
  list.addEventListener("dragstart", (ev) => {
    dragEl = ev.target.closest(".rank-item");
    if (dragEl) dragEl.classList.add("is-dragging");
  });
  list.addEventListener("dragend", () => {
    dragEl?.classList.remove("is-dragging");
    dragEl = null;
    renumber(list);
  });
  list.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    const over = ev.target.closest(".rank-item");
    if (!dragEl || !over || over === dragEl) return;
    const rect = over.getBoundingClientRect();
    const before = ev.clientY < rect.top + rect.height / 2;
    list.insertBefore(dragEl, before ? over : over.nextSibling);
  });
  /* Touch: Finger folgt dem Eintrag, Drop an der Y-Position. */
  let touchEl = null;
  list.addEventListener(
    "touchstart",
    (ev) => {
      touchEl = ev.target.closest(".rank-item");
      if (touchEl) touchEl.classList.add("is-dragging");
    },
    { passive: true }
  );
  list.addEventListener(
    "touchmove",
    (ev) => {
      if (!touchEl) return;
      ev.preventDefault();
      const y = ev.touches[0].clientY;
      const rows = [...list.querySelectorAll(".rank-item")].filter((r) => r !== touchEl);
      let placed = false;
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          list.insertBefore(touchEl, row);
          placed = true;
          break;
        }
      }
      if (!placed) list.append(touchEl);
    },
    { passive: false }
  );
  list.addEventListener("touchend", () => {
    touchEl?.classList.remove("is-dragging");
    touchEl = null;
    renumber(list);
  });
}

function renumber(list) {
  list.querySelectorAll(".rank-num").forEach((el, i) => {
    el.textContent = String(i + 1);
  });
}

/**
 * 100 Punkte auf Optionen verteilen. Submit erst bei Summe 100.
 */
export function renderPointsInput(root, options, { disabled, onSubmit, t } = {}) {
  if (!root) return;
  root.innerHTML = "";
  root.classList.add("slide-input");
  const rows = [];
  const sumEl = document.createElement("p");
  sumEl.className = "points-sum";
  sumEl.setAttribute("aria-live", "polite");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn primary";
  btn.textContent = t ? t("join.send") : "Senden";
  const sync = () => {
    let sum = 0;
    const points = {};
    for (const row of rows) {
      const n = Math.max(0, Math.min(POINTS_TOTAL, Number(row.input.value) || 0));
      row.input.value = String(n);
      points[row.id] = n;
      sum += n;
    }
    const left = POINTS_TOTAL - sum;
    sumEl.textContent = t ? t("slide.pointsSum", { n: sum, left }) : `${sum} / 100`;
    sumEl.classList.toggle("is-ok", sum === POINTS_TOTAL);
    btn.disabled = disabled || sum !== POINTS_TOTAL;
    return points;
  };
  (options || []).forEach((opt) => {
    const label = document.createElement("label");
    label.className = "field points-row";
    label.innerHTML = `<span>${escapeHtml(opt.label)}</span>`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = String(POINTS_TOTAL);
    input.value = "0";
    input.inputMode = "numeric";
    input.disabled = Boolean(disabled);
    input.addEventListener("input", sync);
    label.append(input);
    root.append(label);
    rows.push({ id: opt.id, input });
  });
  btn.addEventListener("click", () => {
    const points = sync();
    if (Object.values(points).reduce((a, n) => a + n, 0) !== POINTS_TOTAL) return;
    onSubmit?.({ kind: "points100", points });
  });
  root.append(sumEl, btn);
  sync();
}

/**
 * Freitext ohne Wortwolke — Textarea, Wortfilter serverseitig.
 */
export function renderOpenTextInput(root, { disabled, onSubmit, t, max = 280 } = {}) {
  if (!root) return;
  root.innerHTML = "";
  root.classList.add("slide-input");
  const form = document.createElement("form");
  form.className = "word-form";
  form.innerHTML = `
    <label class="field">
      <span>${t ? t("slide.openLabel") : "Dein Text"}</span>
      <textarea maxlength="${max}" rows="4" ${disabled ? "disabled" : ""} required></textarea>
    </label>
    <button type="submit" class="btn primary" ${disabled ? "disabled" : ""}>${t ? t("join.send") : "Senden"}</button>`;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = form.querySelector("textarea").value.trim();
    if (!text) return;
    onSubmit?.({ kind: "open_text", text });
  });
  root.append(form);
}

/**
 * Bildwahl: große Thumbnails in der Daumenzone.
 */
export function renderImageChoiceInput(root, options, { disabled, onSubmit } = {}) {
  if (!root) return;
  root.innerHTML = "";
  root.classList.add("slide-input", "image-choice-grid");
  (options || []).forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "image-choice-btn";
    btn.dataset.optionId = opt.id;
    btn.disabled = Boolean(disabled);
    btn.setAttribute("aria-label", opt.label);
    if (opt.image) {
      const img = document.createElement("img");
      img.src = opt.image;
      img.alt = opt.label;
      btn.append(img);
    }
    const cap = document.createElement("span");
    cap.textContent = opt.label;
    btn.append(cap);
    btn.addEventListener("click", () => onSubmit?.({ kind: "image_choice", optionId: opt.id, btn }));
    root.append(btn);
  });
}

/**
 * Mehrere ISO-Slots oder datetime-local — Mehrfachauswahl, dann senden.
 */
export function renderDatetimeInput(root, options, { disabled, onSubmit, t } = {}) {
  if (!root) return;
  root.innerHTML = "";
  root.classList.add("slide-input");
  const box = document.createElement("div");
  box.className = "datetime-slots";
  (options || []).forEach((opt) => {
    const id = `slot-${opt.id}`;
    const label = document.createElement("label");
    label.className = "datetime-slot";
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(opt.id)}" ${disabled ? "disabled" : ""} /> <span>${escapeHtml(opt.label)}</span>`;
    box.append(label);
  });
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn primary";
  btn.textContent = t ? t("join.send") : "Senden";
  btn.disabled = Boolean(disabled);
  btn.addEventListener("click", () => {
    const slotIds = [...box.querySelectorAll("input:checked")].map((i) => i.value);
    if (!slotIds.length) return;
    onSubmit?.({ kind: "datetime", slotIds });
  });
  root.append(box, btn);
}

export function destroySlideInput(root) {
  if (root) root.innerHTML = "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
