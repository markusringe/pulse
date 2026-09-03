/**
 * Picker-Folientyp: große Optionslisten (10–50) mit Suche, Kategorien und Single/Multi-Select.
 * Layout passt sich der Optionsanzahl und Viewport-Breite an.
 */

const SEARCH_DEBOUNCE_MS = 200;
/** Ab dieser Anzahl nur sichtbare Zeilen rendern (Virtual Scrolling). */
const VIRTUAL_THRESHOLD = 30;
const ROW_HEIGHT = 52;

/**
 * Layout automatisch wählen, wenn nicht explizit gesetzt.
 * @param {object} slide
 * @returns {"list"|"grid"|"dropdown"}
 */
export function resolvePickerLayout(slide) {
  const forced = slide?.layout;
  if (forced === "list" || forced === "grid" || forced === "dropdown") return forced;
  const n = (slide?.options || []).length;
  if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) return "list";
  if (n < 15) return "grid";
  return "list";
}

/**
 * Teilnehmer-Eingabe für Picker-Folien mounten.
 * @param {HTMLElement} root
 * @param {object} slide
 * @param {{ disabled?: boolean, t?: Function, onSubmit?: Function }} [opts]
 */
export function renderPickerInput(root, slide, opts = {}) {
  if (!root || !slide) return;
  const layout = resolvePickerLayout(slide);
  const allowMultiple = Boolean(slide.allowMultiple);
  /* Dropdown nur für Single-Select — sonst Liste. */
  if (layout === "dropdown" && !allowMultiple) {
    renderPickerDropdown(root, slide, opts);
    return;
  }
  renderPickerList(root, slide, opts, layout);
}

/**
 * Kompaktes Dropdown (Single-Select): Trigger + Panel mit optionaler Suche.
 */
function renderPickerDropdown(root, slide, opts = {}) {
  const t = opts.t || ((k) => k);
  const disabled = Boolean(opts.disabled);
  const options = (slide.options || []).filter((o) => !o.disabled);
  const categories = Array.isArray(slide.categories) ? slide.categories : [];
  const showSearch = slide.enableSearch !== false && options.length > 5;

  root.innerHTML = "";
  root.className = "slide-input picker-input picker-input--dropdown";

  const state = { query: "", open: false, selectedId: "", categoryId: "" };

  const wrap = document.createElement("div");
  wrap.className = "picker-dropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "picker-dropdown-trigger pulse-input";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.disabled = disabled;
  trigger.textContent = t("picker.dropdownPlaceholder") || "Option wählen…";

  const panel = document.createElement("div");
  panel.className = "picker-dropdown-panel";
  panel.hidden = true;
  panel.setAttribute("role", "listbox");

  const searchIn = document.createElement("input");
  searchIn.type = "search";
  searchIn.className = "picker-search picker-dropdown-search pulse-input";
  searchIn.placeholder = t("picker.search") || "Suchen…";
  searchIn.hidden = !showSearch;

  const catBar = document.createElement("div");
  catBar.className = "picker-categories picker-dropdown-cats";
  if (categories.length) {
    catBar.append(makeCatBtn(t("picker.allCategories") || "Alle", "", true));
    categories.forEach((c) => catBar.append(makeCatBtn(c.name, c.id, false)));
  } else {
    catBar.hidden = true;
  }

  const list = document.createElement("div");
  list.className = "picker-dropdown-list";

  const empty = document.createElement("p");
  empty.className = "picker-empty muted";
  empty.hidden = true;
  empty.textContent = t("picker.noResults") || "Keine Optionen gefunden";

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "btn primary pulse-btn-primary picker-confirm";
  confirm.textContent = t("join.send") || "Bestätigen";
  confirm.hidden = true;
  confirm.disabled = disabled;

  panel.append(searchIn, catBar, list, empty);
  wrap.append(trigger, panel);
  root.append(wrap, confirm);

  function makeCatBtn(label, id, active) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `picker-cat-btn${active ? " is-active" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.categoryId = id;
      catBar.querySelectorAll(".picker-cat-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      paintList();
    });
    return btn;
  }

  function filtered() {
    const q = state.query.toLowerCase();
    const catMap = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    return options.filter((opt) => {
      if (state.categoryId && opt.category !== state.categoryId) return false;
      if (!q) return true;
      const label = String(opt.label || "").toLowerCase();
      const cat = opt.category ? catMap.get(opt.category) || "" : "";
      return label.includes(q) || cat.includes(q);
    });
  }

  function paintList() {
    const items = filtered();
    list.innerHTML = "";
    empty.hidden = items.length > 0;
    items.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-dropdown-item pulse-choice-btn";
      btn.setAttribute("role", "option");
      btn.dataset.pickerId = opt.id;
      btn.setAttribute("aria-selected", state.selectedId === opt.id ? "true" : "false");
      if (state.selectedId === opt.id) btn.classList.add("is-selected");
      const icon = slide.showOptionIcons !== false && opt.icon ? `${opt.icon} ` : "";
      btn.textContent = `${icon}${opt.label}`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        pick(opt);
      });
      list.append(btn);
    });
  }

  function pick(opt) {
    state.selectedId = opt.id;
    trigger.textContent = opt.label;
    trigger.classList.add("has-value");
    closePanel();
    confirm.hidden = false;
    confirm.disabled = disabled;
    paintList();
  }

  function openPanel() {
    if (disabled) return;
    state.open = true;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (showSearch) searchIn.focus();
    paintList();
  }

  function closePanel() {
    state.open = false;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => {
    if (state.open) closePanel();
    else openPanel();
  });

  let debounce = null;
  searchIn.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = searchIn.value.trim();
      paintList();
    }, SEARCH_DEBOUNCE_MS);
  });

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) closePanel();
  });

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      closePanel();
      trigger.focus();
    }
    if (!state.open) return;
    const items = [...list.querySelectorAll(".picker-dropdown-item")];
    const idx = items.indexOf(document.activeElement);
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      (items[idx + 1] || items[0])?.focus();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      (items[idx - 1] || items[items.length - 1])?.focus();
    } else if (ev.key === "Enter" && document.activeElement?.dataset?.pickerId) {
      ev.preventDefault();
      const id = document.activeElement.dataset.pickerId;
      const opt = options.find((o) => o.id === id);
      if (opt) pick(opt);
    }
  });

  confirm.addEventListener("click", () => {
    if (!state.selectedId || disabled) return;
    opts.onSubmit?.({ kind: "picker", optionId: state.selectedId });
  });

  paintList();
}

/**
 * Listen-/Raster-Ansicht (Standard).
 */
function renderPickerList(root, slide, opts, layout) {
  const t = opts.t || ((k) => k);
  const disabled = Boolean(opts.disabled);
  const options = (slide.options || []).filter((o) => !o.disabled);
  const categories = Array.isArray(slide.categories) ? slide.categories : [];
  const allowMultiple = Boolean(slide.allowMultiple);
  const maxSel = slide.maxSelections != null ? Number(slide.maxSelections) : null;
  const showSearch = slide.enableSearch !== false && options.length > 20;

  root.innerHTML = "";
  root.className = "slide-input picker-input";
  root.setAttribute("role", allowMultiple ? "group" : "listbox");
  root.setAttribute("aria-label", slide.question || "Picker");

  const state = {
    query: "",
    categoryId: "",
    selected: new Set(),
    focusIdx: -1,
    filtered: options,
  };

  const searchWrap = document.createElement("div");
  searchWrap.className = "picker-search-wrap";
  if (showSearch) {
    const search = document.createElement("input");
    search.type = "search";
    search.className = "picker-search pulse-input";
    search.placeholder = t("picker.search") || "Suchen…";
    search.setAttribute("aria-describedby", "picker-search-hint");
    search.disabled = disabled;
    searchWrap.append(search);
    const hint = document.createElement("p");
    hint.id = "picker-search-hint";
    hint.className = "hint muted picker-search-hint";
    hint.textContent = t("picker.searchHint") || "Optionen filtern";
    searchWrap.append(hint);
    let debounce = null;
    search.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.query = search.value.trim();
        refresh();
      }, SEARCH_DEBOUNCE_MS);
    });
  } else {
    searchWrap.hidden = true;
  }

  const catBar = document.createElement("div");
  catBar.className = "picker-categories";
  catBar.setAttribute("role", "tablist");
  if (categories.length) {
    const allBtn = categoryBtn(t("picker.allCategories") || "Alle", "", true);
    catBar.append(allBtn);
    categories.forEach((cat) => catBar.append(categoryBtn(cat.name, cat.id, false)));
  } else {
    catBar.hidden = true;
  }

  function categoryBtn(label, id, active) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `picker-cat-btn${active ? " is-active" : ""}`;
    btn.textContent = label;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", active ? "true" : "false");
    btn.disabled = disabled;
    btn.addEventListener("click", () => {
      state.categoryId = id;
      catBar.querySelectorAll(".picker-cat-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      refresh();
    });
    return btn;
  }

  const counter = document.createElement("p");
  counter.className = "picker-counter muted";
  counter.hidden = !allowMultiple;

  const listHost = document.createElement("div");
  listHost.className = `picker-options picker-options--${layout}`;
  listHost.setAttribute("role", allowMultiple ? "group" : "listbox");

  const empty = document.createElement("p");
  empty.className = "picker-empty muted";
  empty.hidden = true;
  empty.textContent = t("picker.noResults") || "Keine Optionen gefunden";

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "btn primary pulse-btn-primary picker-confirm";
  confirm.textContent = t("join.send") || "Bestätigen";
  confirm.hidden = layout !== "dropdown";
  confirm.disabled = disabled;

  root.append(searchWrap, catBar, counter, listHost, empty, confirm);

  function filterOptions() {
    const q = state.query.toLowerCase();
    const catMap = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    return options.filter((opt) => {
      if (state.categoryId && opt.category !== state.categoryId) return false;
      if (!q) return true;
      const inLabel = String(opt.label || "").toLowerCase().includes(q);
      const catName = opt.category ? catMap.get(opt.category) || "" : "";
      return inLabel || catName.includes(q);
    });
  }

  function syncCounter() {
    if (!allowMultiple) return;
    const n = state.selected.size;
    const maxTxt = maxSel != null && Number.isFinite(maxSel) ? ` / ${maxSel}` : "";
    counter.textContent = t("picker.selectedCount", { n, max: maxSel ?? options.length }) ||
      `${n}${maxTxt} ausgewählt`;
    confirm.disabled = disabled || n === 0;
  }

  function toggleOption(id) {
    if (disabled) return;
    if (allowMultiple) {
      if (state.selected.has(id)) state.selected.delete(id);
      else {
        if (maxSel != null && state.selected.size >= maxSel) return;
        state.selected.add(id);
      }
    } else {
      state.selected.clear();
      state.selected.add(id);
      confirm.hidden = false;
      confirm.disabled = false;
    }
    syncCounter();
    paintSelection();
  }

  function paintSelection() {
    listHost.querySelectorAll("[data-picker-id]").forEach((el) => {
      const on = state.selected.has(el.dataset.pickerId);
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) return escapeHtml(text);
    return (
      escapeHtml(text.slice(0, idx)) +
      `<mark>${escapeHtml(text.slice(idx, idx + query.length))}</mark>` +
      escapeHtml(text.slice(idx + query.length))
    );
  }

  function renderOption(opt, index) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-option pulse-choice-btn";
    btn.dataset.pickerId = opt.id;
    btn.setAttribute("role", allowMultiple ? "checkbox" : "option");
    btn.setAttribute("aria-selected", state.selected.has(opt.id) ? "true" : "false");
    btn.tabIndex = index === state.focusIdx ? 0 : -1;
    btn.disabled = disabled;
    if (opt.color) btn.style.setProperty("--picker-accent", opt.color);
    const icon = slide.showOptionIcons !== false && opt.icon ? `<span class="picker-icon" aria-hidden="true">${escapeHtml(opt.icon)}</span>` : "";
    btn.innerHTML = `${icon}<span class="picker-label">${highlightText(opt.label, state.query)}</span>`;
    btn.addEventListener("click", () => toggleOption(opt.id));
    return btn;
  }

  /** Virtual Scrolling: nur sichtbares Fenster + Puffer rendern. */
  function renderVirtual(filtered) {
    listHost.innerHTML = "";
    if (!filtered.length) return;
    const viewport = document.createElement("div");
    viewport.className = "picker-virtual-viewport";
    const inner = document.createElement("div");
    inner.className = "picker-virtual-inner";
    inner.style.height = `${filtered.length * ROW_HEIGHT}px`;
    const windowEl = document.createElement("div");
    windowEl.className = "picker-virtual-window";
    viewport.append(inner, windowEl);
    listHost.append(viewport);

    const renderSlice = () => {
      const scrollTop = viewport.scrollTop;
      const viewH = viewport.clientHeight || 320;
      const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
      const end = Math.min(filtered.length, start + Math.ceil(viewH / ROW_HEIGHT) + 8);
      windowEl.innerHTML = "";
      windowEl.style.transform = `translateY(${start * ROW_HEIGHT}px)`;
      for (let i = start; i < end; i++) windowEl.append(renderOption(filtered[i], i));
      paintSelection();
    };
    viewport.addEventListener("scroll", renderSlice, { passive: true });
    renderSlice();
  }

  function renderFlat(filtered) {
    listHost.innerHTML = "";
    filtered.forEach((opt, i) => listHost.append(renderOption(opt, i)));
    paintSelection();
  }

  function refresh() {
    state.filtered = filterOptions();
    empty.hidden = state.filtered.length > 0;
    listHost.hidden = state.filtered.length === 0;
    if (state.filtered.length > VIRTUAL_THRESHOLD && layout === "list") renderVirtual(state.filtered);
    else renderFlat(state.filtered);
    syncCounter();
  }

  root.addEventListener("keydown", (ev) => {
    const items = [...listHost.querySelectorAll(".picker-option:not(:disabled)")];
    if (!items.length) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      state.focusIdx = Math.min(items.length - 1, state.focusIdx + 1);
      items.forEach((el, i) => { el.tabIndex = i === state.focusIdx ? 0 : -1; });
      items[state.focusIdx]?.focus();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      state.focusIdx = Math.max(0, state.focusIdx - 1);
      items.forEach((el, i) => { el.tabIndex = i === state.focusIdx ? 0 : -1; });
      items[state.focusIdx]?.focus();
    } else if (ev.key === "Enter" || ev.key === " ") {
      const el = document.activeElement;
      if (el?.dataset?.pickerId) {
        ev.preventDefault();
        toggleOption(el.dataset.pickerId);
      }
    }
  });

  confirm.addEventListener("click", submit);

  function submit() {
    if (disabled || !state.selected.size) return;
    if (allowMultiple) {
      opts.onSubmit?.({ kind: "picker", optionIds: [...state.selected] });
    } else {
      opts.onSubmit?.({ kind: "picker", optionId: [...state.selected][0] });
    }
  }

  /* Single-Select ohne Dropdown: sofort nach Klick absenden; sonst Bestätigen-Button. */
  if (!allowMultiple && layout !== "dropdown") {
    confirm.hidden = true;
    listHost.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-picker-id]");
      if (!btn || disabled) return;
      setTimeout(() => {
        if (state.selected.size) submit();
      }, 120);
    });
  } else {
    confirm.hidden = false;
    syncCounter();
  }

  refresh();
}

/**
 * Presenter-Ergebnisse: Balkendiagramm, bei vielen Optionen Top 10 + Rest einklappbar.
 * @param {HTMLElement} root
 * @param {object} slide
 * @param {{ t?: Function }} [opts]
 */
export function renderPickerResults(root, slide, opts = {}) {
  if (!root || !slide) return;
  const t = opts.t;
  const counts = slide.counts || {};
  const participants = Number(slide.voteCount) || 0;
  const totalVotes = Object.values(counts).reduce((s, n) => s + Number(n || 0), 0) || 1;
  const rows = (slide.options || []).map((opt) => ({
    ...opt,
    n: Number(counts[opt.id]) || 0,
    pct: participants ? Math.round(((Number(counts[opt.id]) || 0) / participants) * 100) : 0,
  }));
  rows.sort((a, b) => b.n - a.n);
  const showAll = rows.length <= 30;
  const top = showAll ? rows : rows.slice(0, 10);
  const rest = showAll ? [] : rows.slice(10);

  root.innerHTML = `<p class="muted">${t ? t("picker.results") : "Picker-Ergebnisse"}</p>`;
  const list = document.createElement("div");
  list.className = "poll picker-results";

  const categories = Array.isArray(slide.categories) ? slide.categories : [];
  if (categories.length) {
    categories.forEach((cat) => {
      const inCat = top.filter((r) => r.category === cat.id);
      if (!inCat.length) return;
      const head = document.createElement("h4");
      head.className = "picker-results-cat-title";
      head.textContent = cat.name;
      if (cat.color) head.style.borderLeftColor = cat.color;
      list.append(head);
      paintRows(inCat, list);
    });
    const uncategorized = top.filter((r) => !r.category || !categories.some((c) => c.id === r.category));
    if (uncategorized.length) {
      const head = document.createElement("h4");
      head.className = "picker-results-cat-title";
      head.textContent = t ? t("picker.uncategorized") : "Ohne Kategorie";
      list.append(head);
      paintRows(uncategorized, list);
    }
  } else {
    paintRows(top, list);
  }

  function paintRows(items, parent) {
    items.forEach((row, i) => {
      const max = Math.max(1, top[0]?.n || 1);
      const pctBar = Math.round((row.n / max) * 100);
      const el = document.createElement("div");
      el.className = "poll-row";
      el.innerHTML = `
        <div class="poll-label">${escapeHtml(row.icon ? `${row.icon} ` : "")}${escapeHtml(row.label)}</div>
        <div class="poll-track"><div class="poll-fill" data-color="${i % 6}" style="--bar-width:${pctBar}%"><span class="poll-count">${row.n}</span></div></div>
        <div class="poll-pct">${row.pct}%</div>`;
      parent.append(el);
    });
  }

  if (rest.length) {
    const more = document.createElement("details");
    more.className = "picker-results-more";
    more.innerHTML = `<summary>${t ? t("picker.moreOptions", { n: rest.length }) : `Weitere ${rest.length} Optionen`}</summary>`;
    const inner = document.createElement("div");
    inner.className = "poll";
    rest.forEach((row, i) => {
      const max = Math.max(1, top[0]?.n || 1);
      const pctBar = Math.round((row.n / max) * 100);
      const el = document.createElement("div");
      el.className = "poll-row";
      el.innerHTML = `
        <div class="poll-label">${escapeHtml(row.label)}</div>
        <div class="poll-track"><div class="poll-fill" data-color="${(i + 10) % 6}" style="--bar-width:${pctBar}%"><span class="poll-count">${row.n}</span></div></div>
        <div class="poll-pct">${row.pct}%</div>`;
      inner.append(el);
    });
    more.append(inner);
    list.append(more);
  }
  root.append(list);
  void totalVotes;
}

/** Standard-Optionen für neue Picker-Folien (10 Stück). */
export function defaultPickerOptions() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `o${i + 1}`,
    label: `Option ${i + 1}`,
  }));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
