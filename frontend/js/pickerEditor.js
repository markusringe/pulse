/**
 * Picker-Admin: Kategorien verwalten und Live-Vorschau für Create-/Deck-Editor.
 */

import { renderPickerInput } from "./picker.js";

/** Vordefinierte Akzentfarben für neue Kategorien. */
export const CATEGORY_PALETTE = ["#003399", "#FFCC00", "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2"];

/**
 * HTML für eine Kategorie-Zeile im Editor.
 * @param {{ id: string, name: string, color?: string }} cat
 * @param {number} index
 */
export function categoryRowHtml(cat, index) {
  const id = cat.id || `cat${index + 1}`;
  const name = cat.name || "";
  const color = cat.color || CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
  return `<div class="picker-cat-row" data-cat-row="${index}">
    <input type="text" data-cat-name="${index}" maxlength="60" value="${escapeAttr(name)}" placeholder="Kategoriename" />
    <input type="color" data-cat-color="${index}" value="${escapeAttr(color)}" aria-label="Farbe" />
    <input type="hidden" data-cat-id="${index}" value="${escapeAttr(id)}" />
    <button type="button" class="btn ghost btn--sm" data-cat-remove="${index}" aria-label="Kategorie entfernen">×</button>
  </div>`;
}

/**
 * Kategorie-Editor in einen Container rendern und binden.
 * @param {HTMLElement} host
 * @param {object[]} categories
 * @param {{ onChange?: Function, t?: Function, minRows?: number }} [opts]
 */
export function mountCategoryEditor(host, categories = [], opts = {}) {
  if (!host) return;
  const t = opts.t || ((k) => k);
  const minRows = opts.minRows ?? 0;
  let cats = categories.length ? categories.map((c) => ({ ...c })) : [];

  const paint = () => {
    host.innerHTML = cats.map((c, i) => categoryRowHtml(c, i)).join("");
    host.querySelectorAll("[data-cat-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-cat-remove"));
        if (cats.length <= minRows) return;
        /* Löschen nur, wenn keine Option zugeordnet — Prüfung erfolgt im Parent. */
        cats.splice(i, 1);
        paint();
        opts.onChange?.(cats);
      });
    });
    host.querySelectorAll("[data-cat-name], [data-cat-color]").forEach((input) => {
      input.addEventListener("input", syncFromDom);
      input.addEventListener("change", syncFromDom);
    });
  };

  function syncFromDom() {
    cats = collectCategoriesFromHost(host);
    opts.onChange?.(cats);
  }

  paint();
  return {
    getCategories: () => collectCategoriesFromHost(host),
    setCategories: (next) => {
      cats = (next || []).map((c) => ({ ...c }));
      paint();
    },
    addCategory: () => {
      const id = `cat${Date.now().toString(36).slice(-4)}`;
      cats.push({
        id,
        name: `Kategorie ${cats.length + 1}`,
        color: CATEGORY_PALETTE[cats.length % CATEGORY_PALETTE.length],
        sortOrder: cats.length,
      });
      paint();
      opts.onChange?.(cats);
    },
  };
}

/**
 * Kategorien aus dem DOM lesen.
 * @param {HTMLElement} host
 */
export function collectCategoriesFromHost(host) {
  if (!host) return [];
  return [...host.querySelectorAll("[data-cat-row]")].map((row, i) => {
    const id = row.querySelector(`[data-cat-id="${i}"], [data-cat-id]`)?.value || `cat${i + 1}`;
    const name = String(row.querySelector(`[data-cat-name="${i}"], [data-cat-name]`)?.value || "").trim();
    const color = row.querySelector(`[data-cat-color="${i}"], [data-cat-color]`)?.value || "";
    return { id, name: name || `Kategorie ${i + 1}`, color, sortOrder: i };
  });
}

/**
 * Select-HTML für Options-Zuordnung.
 * @param {object[]} categories
 * @param {string} selectedId
 * @param {number} optIndex
 */
export function optionCategorySelectHtml(categories, selectedId, optIndex) {
  if (!categories?.length) return "";
  const opts = [`<option value="">—</option>`]
    .concat(
      categories.map(
        (c) =>
          `<option value="${escapeAttr(c.id)}"${c.id === selectedId ? " selected" : ""}>${escapeHtml(c.name)}</option>`
      )
    )
    .join("");
  return `<select class="picker-opt-cat" data-opt-cat="${optIndex}" aria-label="Kategorie">${opts}</select>`;
}

/**
 * Live-Vorschau mounten (nur Darstellung, kein Absenden).
 * @param {HTMLElement} host
 * @param {object} slide
 * @param {{ t?: Function }} [opts]
 */
export function refreshPickerPreview(host, slide, opts = {}) {
  if (!host || slide?.type !== "picker") return;
  host.innerHTML = `<p class="hint muted picker-preview-label">${opts.t ? opts.t("picker.preview") : "Vorschau"}</p>`;
  const box = document.createElement("div");
  box.className = "picker-preview-box";
  host.append(box);
  renderPickerInput(box, slide, { disabled: false, t: opts.t, onSubmit: () => {} });
  box.querySelector(".picker-confirm")?.addEventListener("click", (e) => e.preventDefault());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
