/**
 * Moderations-Liste: ausstehende Fragen, Bulk-Aktionen, Filter.
 */

export function renderModeration(root, questions, { onModerate, onBulk } = {}) {
  if (!root) return;
  const filter = root._filter || "new";
  let pending = (questions || []).filter((q) => q.status === "pending" || q.flagged || q.private);
  if (filter === "flagged") pending = pending.filter((q) => q.flagged);
  if (filter === "private") pending = (questions || []).filter((q) => q.private);
  if (["tech", "org", "content", "other"].includes(filter)) {
    pending = (questions || []).filter((q) => (q.category || "other") === filter);
  }
  if (filter === "top") pending.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  else pending.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  root.innerHTML = `
    <header class="mod-head">
      <h3>Moderation</h3>
      <p class="muted">${pending.length} Fragen in der Warteschlange</p>
      <div class="mod-filters" role="tablist">
        <button type="button" class="btn ghost${filter === "new" ? " is-on" : ""}" data-mod-filter="new">Neueste</button>
        <button type="button" class="btn ghost${filter === "top" ? " is-on" : ""}" data-mod-filter="top">Meiste Upvotes</button>
        <button type="button" class="btn ghost${filter === "flagged" ? " is-on" : ""}" data-mod-filter="flagged">Verdächtige</button>
        <button type="button" class="btn ghost${filter === "tech" ? " is-on" : ""}" data-mod-filter="tech">Technik</button>
        <button type="button" class="btn ghost${filter === "org" ? " is-on" : ""}" data-mod-filter="org">Organisation</button>
        <button type="button" class="btn ghost${filter === "content" ? " is-on" : ""}" data-mod-filter="content">Inhalt</button>
        <button type="button" class="btn ghost${filter === "other" ? " is-on" : ""}" data-mod-filter="other">Sonstiges</button>
        <button type="button" class="btn ghost${filter === "private" ? " is-on" : ""}" data-mod-filter="private">Privat</button>
      </div>
      <div class="mod-bulk">
        <button type="button" class="btn ghost" data-bulk="approve">Alle freigeben</button>
        <button type="button" class="btn ghost" data-bulk="hide">Alle verstecken</button>
      </div>
    </header>
    <div class="mod-list"></div>`;
  const list = root.querySelector(".mod-list");
  pending.forEach((q) => {
    const card = document.createElement("article");
    card.className = "question-card pending";
    card.innerHTML = `
      <p>${escapeHtml(q.text)}</p>
      <p class="muted">${q.flagged ? "Verdächtig" : "Ausstehend"} · ${categoryLabel(q.category)}${q.private ? " · privat" : ""} · 👍 ${q.upvotes || 0}</p>
      <div class="actions">
        <button type="button" class="approve" data-id="${q.id}" data-act="approve" aria-label="Freigeben">✓</button>
        <button type="button" class="hide" data-id="${q.id}" data-act="hide" aria-label="Verstecken">✕</button>
        <button type="button" class="answer" data-id="${q.id}" data-act="answer">Beantwortet</button>
      </div>`;
    list.append(card);
  });
  if (!root._modBound) {
    root._modBound = true;
    root.addEventListener("click", (ev) => {
      const filt = ev.target.closest("[data-mod-filter]");
      if (filt) {
        root._filter = filt.dataset.modFilter;
        renderModeration(root, root._questions, { onModerate: root._onModerate, onBulk: root._onBulk });
        return;
      }
      const bulk = ev.target.closest("[data-bulk]");
      const b = ev.target.closest("[data-act]");
      if (bulk) {
        const ids = [...root.querySelectorAll("[data-act='approve']")].map((el) => el.dataset.id);
        root._onBulk?.(bulk.dataset.bulk, ids);
        return;
      }
      if (b) root._onModerate?.(b.dataset.id, b.dataset.act);
    });
  }
  root._questions = questions;
  root._onModerate = onModerate;
  root._onBulk = onBulk;
}

function categoryLabel(cat) {
  const map = { tech: "Technik", org: "Organisation", content: "Inhalt", other: "Sonstiges" };
  return map[cat] || "Sonstiges";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
