/**
 * Live-Q&A: Einreichen, Upvotes, Moderation, virtuelles Scrollen.
 * Öffentliche API bleibt klein; Rendering ist vom Netzwerk getrennt.
 */

const ROW_H = 148;
const OVERSCAN = 4;
const MAX_LEN = 500;

/** @type {QaView | null} */
let view = null;

/**
 * @param {HTMLElement} container
 * @param {{ role: 'presenter'|'participant', clientId?: string, moderated?: boolean,
 *   onSubmit?: Function, onUpvote?: Function, onModerate?: Function, onToggleModerated?: Function }} opts
 */
export function initQA(container, opts) {
  destroyQA();
  container.innerHTML = "";
  container.classList.add("qa-container");
  const live = el("p", "sr-only");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  const toolbar = buildToolbar(opts.role);
  const top = el("div", "qa-top3");
  const list = el("div", "qa-virtual virtual-list");
  list.setAttribute("role", "list");
  list.setAttribute("tabindex", "0");
  list.setAttribute("aria-label", "Fragenliste");
  const composer = opts.role === "participant" ? buildComposer() : null;
  container.append(live, toolbar, top, list);
  if (composer) container.append(composer);

  view = {
    container,
    opts,
    live,
    toolbar,
    top,
    list,
    composer,
    questions: [],
    filter: "top",
    category: "",
    groupPick: null,
    moderated: opts.moderated !== false,
    refreshTimer: 0,
    pool: [],
  };
  bindToolbar(view);
  list.addEventListener("scroll", () => renderList(view), { passive: true });
  view.refreshTimer = window.setInterval(() => {
    console.debug("[QA]", "refresh");
    opts.onRefresh?.();
  }, 5000);
  return view;
}

/** @param {Array} questions */
export function updateQA(questions) {
  if (!view) return;
  view.questions = Array.isArray(questions) ? questions : [];
  renderQA(view);
}

export function destroyQA() {
  if (!view) return;
  window.clearInterval(view.refreshTimer);
  view.container.innerHTML = "";
  view = null;
}

/**
 * Composer sperren, wenn die Fragenrunde serverseitig beendet ist.
 * Upvote-Buttons bleiben bewusst aktiv.
 * @param {boolean} enabled
 * @param {string} [hint]
 */
export function setQaIntakeEnabled(enabled, hint) {
  if (!view?.composer) return;
  const input = view.composer.querySelector("#qa-input");
  const btn = view.composer.querySelector("button[type=submit]");
  const select = view.composer.querySelector("#qa-category");
  const priv = view.composer.querySelector("#qa-private");
  if (input) {
    input.disabled = !enabled;
    if (!enabled) input.placeholder = hint || "Fragenrunde beendet";
  }
  if (btn) btn.disabled = !enabled;
  if (select) select.disabled = !enabled;
  if (priv) priv.disabled = !enabled;
  let note = view.composer.querySelector(".qa-closed-hint");
  if (!enabled) {
    if (!note) {
      note = el("p", "qa-closed-hint");
      note.setAttribute("role", "status");
      view.composer.prepend(note);
    }
    note.textContent = hint || "Fragenrunde beendet";
  } else if (note) {
    note.remove();
  }
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function submitQuestion(text, extra = {}) {
  const clean = String(text || "").trim().slice(0, MAX_LEN);
  if (!clean || !view) return false;
  console.debug("[QA]", "submit", clean.length);
  view.opts.onSubmit?.(clean, extra);
  return true;
}

function buildToolbar(role) {
  const bar = el("div", "qa-toolbar");
  bar.innerHTML = `
    <div class="qa-filters" role="tablist" aria-label="Fragenfilter">
      <button type="button" class="btn ghost is-on" data-filter="all">Alle</button>
      <button type="button" class="btn ghost" data-filter="mine">Meine</button>
      <button type="button" class="btn ghost" data-filter="top">Top</button>
      <button type="button" class="btn ghost" data-filter="new">Neueste</button>
      <button type="button" class="btn ghost" data-cat="tech">Technik</button>
      <button type="button" class="btn ghost" data-cat="org">Organisation</button>
      <button type="button" class="btn ghost" data-cat="content">Inhalt</button>
      <button type="button" class="btn ghost" data-cat="other">Sonstiges</button>
    </div>
    <p class="qa-pending muted" aria-live="polite"></p>
    ${
      role === "presenter"
        ? `<label class="qa-mod"><input type="checkbox" id="qa-mod-toggle" checked /> Nur moderiert anzeigen</label>`
        : ""
    }`;
  return bar;
}

function buildComposer() {
  const form = el("form", "qa-composer pulse-card");
  form.innerHTML = `
    <label class="field">
      <span>Deine Frage</span>
      <textarea id="qa-input" class="pulse-input" maxlength="${MAX_LEN}" rows="3" placeholder="Frage an das Podium…" required></textarea>
    </label>
    <div class="qa-composer-row">
      <label class="field qa-cat-field">
        <span>Kategorie</span>
        <select id="qa-category" class="pulse-input">
          <option value="tech">Technik</option>
          <option value="org">Organisation</option>
          <option value="content">Inhalt</option>
          <option value="other" selected>Sonstiges</option>
        </select>
      </label>
      <label class="qa-private"><input type="checkbox" id="qa-private" /> Privat (nur Präsentation)</label>
    </div>
    <div class="qa-composer-row">
      <span id="qa-count" class="muted">0/${MAX_LEN}</span>
      <button type="submit" class="btn primary pulse-btn-primary">Frage senden</button>
    </div>`;
  const input = form.querySelector("#qa-input");
  const count = form.querySelector("#qa-count");
  const pickerHost = el("div", "qa-emoji-host");
  form.querySelector(".qa-composer-row")?.prepend(pickerHost);
  import("./emoji.js").then(({ mountEmojiPicker, countEmojis }) => {
    mountEmojiPicker(pickerHost, input);
    input.addEventListener("input", () => {
      count.textContent = `${input.value.length}/${MAX_LEN}`;
      if (countEmojis(input.value) > 5) input.setCustomValidity("Maximal 5 Emojis");
      else input.setCustomValidity("");
    });
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (submitQuestion(input.value, {
      category: form.querySelector("#qa-category")?.value || "other",
      private: Boolean(form.querySelector("#qa-private")?.checked),
    })) {
      input.value = "";
      count.textContent = `0/${MAX_LEN}`;
    }
  });
  return form;
}

function bindToolbar(v) {
  v.toolbar.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      v.filter = btn.dataset.filter;
      v.toolbar.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-on", b === btn));
      renderQA(v);
    });
  });
  v.toolbar.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      v.category = v.category === btn.dataset.cat ? "" : btn.dataset.cat;
      v.toolbar.querySelectorAll("[data-cat]").forEach((b) => b.classList.toggle("is-on", b.dataset.cat === v.category));
      renderQA(v);
    });
  });
  v.toolbar.querySelector("#qa-mod-toggle")?.addEventListener("change", (ev) => {
    v.moderated = ev.target.checked;
    v.opts.onToggleModerated?.(v.moderated);
    renderQA(v);
  });
}

function renderQA(v) {
  const visible = filterSort(v);
  const pending = v.questions.filter((q) => q.status === "pending").length;
  const pendingEl = v.toolbar.querySelector(".qa-pending");
  if (pendingEl) {
    pendingEl.textContent = v.opts.role === "presenter" && pending ? `${pending} neue Fragen warten auf Freigabe` : "";
  }
  const top3 = [...visible].sort((a, b) => b.upvotes - a.upvotes).slice(0, 3);
  renderTop(v, top3);
  v._items = visible;
  renderList(v);
  // Nach dem Einblenden hat die Liste erst eine clientHeight — zweiten Pass legen.
  requestAnimationFrame(() => renderList(v));
  v.live.textContent = `${visible.length} Fragen sichtbar. Top: ${top3.map((q) => q.text).join("; ")}`;
}

function filterSort(v) {
  const id = v.opts.clientId;
  let list = v.questions.filter((q) => {
    if (q.mergedInto && v.opts.role !== "presenter") return false;
    if (q.private && v.opts.role !== "presenter" && q.authorId !== id) return false;
    if (q.status === "hidden" && v.opts.role !== "presenter") return false;
    if (v.opts.role === "participant" && v.moderated) {
      return q.status === "approved" || q.status === "answered" || q.authorId === id;
    }
    return true;
  });
  if (v.category) list = list.filter((q) => (q.category || "other") === v.category);
  if (v.filter === "mine") list = list.filter((q) => q.authorId === id);
  if (v.filter === "new" || v.filter === "all") {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else {
    list.sort((a, b) => b.upvotes - a.upvotes || (b.createdAt || 0) - (a.createdAt || 0));
  }
  return list;
}

function renderTop(v, top3) {
  v.top.innerHTML = "";
  top3.forEach((q, i) => {
    const card = el("article", "qa-card qa-featured");
    card.setAttribute("role", "listitem");
    card.innerHTML = `<span class="qa-rank">${i + 1}</span><p>${escapeHtml(q.text)}</p><b>👍 ${q.upvotes}</b>`;
    v.top.append(card);
  });
}

/**
 * Virtuelle Liste: nur den sichtbaren Fensterausschnitt plus Overscan als DOM halten.
 * Ab ca. 50 Fragen bleibt die Scroll-Leistung damit konstant.
 */
function renderList(v) {
  const items = v._items || [];
  const start = Math.max(0, Math.floor(v.list.scrollTop / ROW_H) - OVERSCAN);
  const vis = Math.ceil(v.list.clientHeight / ROW_H) + OVERSCAN * 2;
  const end = Math.min(items.length, start + vis);
  if (!v.spacer) {
    v.spacer = el("div", "virtual-list-spacer");
    v.body = el("div", "virtual-list-body");
    v.list.append(v.spacer, v.body);
  }
  v.spacer.style.height = `${items.length * ROW_H}px`;
  v.body.style.transform = `translateY(${start * ROW_H}px)`;
  const need = Math.max(0, end - start);
  while (v.pool.length < need) v.pool.push(buildRow(v));
  v.pool.forEach((row, i) => {
    const item = items[start + i];
    row.hidden = !item;
    if (item) fillRow(row, item, v);
  });
}

function buildRow(v) {
  const row = el("article", "qa-row");
  row.setAttribute("role", "listitem");
  row.style.height = `${ROW_H}px`;
  row.innerHTML = `
    <p class="qa-text"></p>
    <div class="qa-meta">
      <button type="button" class="btn ghost qa-up">👍 <span>0</span></button>
      <span class="qa-status"></span>
      <span class="qa-actions"></span>
    </div>`;
  v.body.append(row);
  return row;
}

/**
 * Zeile mit Screen-Reader-Label, Upvote und (für Präsentator) Moderations-Aktionen.
 */
function fillRow(row, q, v) {
  const label = `Frage von ${q.authorName || "Teilnehmer"}, ${q.upvotes} Upvotes, Status: ${statusLabel(q.status)}`;
  row.setAttribute("aria-label", label);
  const cat = categoryLabel(q.category);
  const flags = [
    cat,
    q.private ? "privat" : "",
    q.mergedInto ? "gruppiert" : "",
    q.groupId && !q.mergedInto ? "Gruppe" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  row.querySelector(".qa-text").textContent = q.text;
  let extra = row.querySelector(".qa-extra");
  if (!extra) {
    extra = document.createElement("p");
    extra.className = "qa-extra muted";
    row.querySelector(".qa-text").after(extra);
  }
  extra.textContent = [flags, q.presenterAnswer ? `Antwort: ${q.presenterAnswer}` : ""].filter(Boolean).join(" — ");
  row.querySelector(".qa-up span").textContent = String(q.upvotes);
  const statusEl = row.querySelector(".qa-status");
  const status = q.status || "pending";
  statusEl.className = `qa-status badge badge-${status}`;
  statusEl.textContent = statusLabel(status);
  const up = row.querySelector(".qa-up");
  up.disabled = Boolean(q.voted) || Boolean(q.mergedInto);
  up.onclick = () => v.opts.onUpvote?.(q.id);
  const actions = row.querySelector(".qa-actions");
  actions.innerHTML = "";
  if (v.opts.role === "presenter") {
    [["approve", "Freigeben"], ["hide", "Verstecken"], ["answer", "Beantwortet"]].forEach(([action, title]) => {
      const b = el("button", "btn ghost");
      b.type = "button";
      b.textContent = title;
      b.setAttribute("aria-label", `${title}: ${q.text.slice(0, 40)}`);
      b.onclick = () => v.opts.onModerate?.(q.id, action);
      actions.append(b);
    });
    const group = el("button", "btn ghost");
    group.type = "button";
    group.textContent = v.groupPick ? "Hierher gruppieren" : "Gruppieren";
    group.onclick = () => {
      if (!v.groupPick) {
        v.groupPick = q.id;
        group.textContent = "Ziel wählen…";
        return;
      }
      if (v.groupPick === q.id) {
        v.groupPick = null;
        return;
      }
      v.opts.onGroup?.(v.groupPick, q.id);
      v.groupPick = null;
    };
    actions.append(group);
    const ans = el("button", "btn ghost");
    ans.type = "button";
    ans.textContent = "Antworten";
    ans.onclick = () => {
      const text = window.prompt("Antwort unter der Frage (sichtbar für alle):", q.presenterAnswer || "");
      if (text == null) return;
      v.opts.onAnswer?.(q.id, text);
    };
    actions.append(ans);
  }
}

function categoryLabel(cat) {
  const map = { tech: "Technik", org: "Organisation", content: "Inhalt", other: "Sonstiges" };
  return map[cat] || "";
}

function statusLabel(status) {
  const map = { pending: "ausstehend", approved: "freigegeben", hidden: "versteckt", answered: "beantwortet" };
  return map[status] || status;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
