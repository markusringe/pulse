#!/usr/bin/env node
/**
 * Statische Mobile-Layout-Checks (CSS/JS-Konventionen, kein Browser).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const homeMobile = read("frontend/css/home-mobile.css");
assert(!/\.admin-home-link\s*\{[^}]*display:\s*none/.test(homeMobile), "Admin-Icon auf Mobil nicht ausblenden");

const styles = read("frontend/css/styles.css");
assert(styles.includes("overflow-x: hidden"), ".app overflow-x hidden");
assert(styles.includes(".view-forbidden"), "403-View in styles.css");

const components = read("frontend/css/components.css");
assert(/@media \(max-width: 640px\)[\s\S]*\.icon-btn[\s\S]*44px/.test(components), "icon-btn 44px mobil");

const mobileNav = read("frontend/js/mobileNav.js");
assert(mobileNav.includes("closeHomeMenuDrawer"), "closeHomeMenuDrawer exportiert");
assert(mobileNav.includes("restoreFocus: !isInAppRoute"), "Drawer ohne Fokus-Rückgabe bei Hash-Routen");

const appJs = read("frontend/js/app.js");
assert(appJs.includes("closeHomeMenuDrawer()"), "app.js schließt Mobilmenü vor Admin");

const joinMobile = read("frontend/css/join-mobile.css");
assert(joinMobile.includes("overflow-x: hidden"), "Join-Shell overflow-x hidden");

console.log("Mobile-Layout-Static-Checks OK");
