/**
 * Mobile Navigation — Drawer für Admin-Leiste und öffentliches Hilfe-Menü.
 * Barrierefrei: Fokusfalle, Escape, Fokus-Rückgabe.
 */

let adminDrawerBound = false;
let publicMenuBound = false;

/**
 * Drawer-Logik für ein Panel.
 * @param {object} opts
 * @param {string} opts.toggleSelector
 * @param {string} opts.drawerId
 * @param {string} opts.overlayId
 */
function bindDrawer({ toggleSelector, drawerId, overlayId, closeSelector }) {
  const toggle = document.querySelector(toggleSelector);
  const drawer = document.getElementById(drawerId);
  const overlay = document.getElementById(overlayId);
  if (!toggle || !drawer || !overlay) return;

  let lastFocus = null;

  const close = () => {
    drawer.hidden = true;
    overlay.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("pulse-drawer-open");
    if (lastFocus?.focus) lastFocus.focus();
  };

  const open = () => {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    overlay.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("pulse-drawer-open");
    const first = drawer.querySelector("a, button:not([disabled])");
    first?.focus();
  };

  toggle.addEventListener("click", () => {
    if (drawer.hidden) open();
    else close();
  });

  overlay.addEventListener("click", close);
  drawer.querySelector(closeSelector)?.addEventListener("click", close);

  /* Navigation: Drawer nach Klick auf internen Hash-Link schließen */
  drawer.addEventListener("click", (ev) => {
    const link = ev.target.closest("a[href]");
    if (link && drawer.contains(link)) close();
  });

  drawer.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
    if (ev.key !== "Tab" || drawer.hidden) return;
    const focusable = [...drawer.querySelectorAll("a, button:not([disabled]), input, select, textarea")].filter(
      (el) => el.offsetParent !== null
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });
}

/** Admin-Navigation ab schmaler Breite als Drawer. */
export function bindAdminMobileNav() {
  if (adminDrawerBound) return;
  adminDrawerBound = true;

  const source = document.querySelector(".admin-nav--desktop");
  const drawer = document.getElementById("admin-nav-drawer");
  if (source && drawer && !drawer.dataset.cloned) {
    drawer.innerHTML = `<button type="button" class="pulse-btn-ghost pulse-drawer-close" data-admin-drawer-close aria-label="Menü schließen">Schließen</button>${source.innerHTML}`;
    drawer.dataset.cloned = "1";
  }

  bindDrawer({
    toggleSelector: "#admin-nav-toggle",
    drawerId: "admin-nav-drawer",
    overlayId: "admin-nav-overlay",
    closeSelector: "[data-admin-drawer-close]",
  });
}

/** Öffentliches Menü auf der Startseite (Hilfe, Rechtliches). */
export function bindPublicMobileMenu() {
  if (publicMenuBound) return;
  publicMenuBound = true;
  bindDrawer({
    toggleSelector: "#home-menu-toggle",
    drawerId: "home-menu-drawer",
    overlayId: "home-menu-overlay",
    closeSelector: "[data-home-menu-close]",
  });
}
