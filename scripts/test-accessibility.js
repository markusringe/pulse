#!/usr/bin/env node
/**
 * Grundlegende Accessibility-Checks (statisch, HTML/CSS — kein Browser).
 */

const fs = require("fs");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ROOT = path.join(__dirname, "..");
const indexPath = path.join(ROOT, "frontend/index.html");
const html = fs.readFileSync(indexPath, "utf8");

assert(html.includes('lang="de"'), "html lang=de");
assert(/<title>/.test(html), "title vorhanden");
assert(html.includes('name="viewport"'), "viewport meta");

const inputs = [...html.matchAll(/<input[^>]*>/gi)].map((m) => m[0]);
/** Prüft, ob das Input-Tag innerhalb eines offenen <label> liegt (auch ohne id). */
function hasWrappedLabel(source, inp) {
  const idx = source.indexOf(inp);
  if (idx < 0) return false;
  const before = source.slice(Math.max(0, idx - 800), idx);
  const labelStart = before.lastIndexOf("<label");
  const labelEnd = before.lastIndexOf("</label>");
  return labelStart > labelEnd;
}
for (const inp of inputs) {
  if (/type=["']hidden["']/i.test(inp)) continue;
  const id = inp.match(/id=["']([^"']+)["']/)?.[1];
  const hasExplicitFor = id && html.includes(`for="${id}"`);
  const hasAria = /aria-label=/i.test(inp) || /aria-labelledby=/i.test(inp);
  /** Verschachteltes Label (<label>…<input id>…</label>) ist barrierefrei gültig. */
  const hasNestedLabel =
    id &&
    new RegExp(
      `<label[^>]*>[\\s\\S]*?id=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      "i"
    ).test(html);
  assert(
    hasExplicitFor || hasAria || hasNestedLabel || hasWrappedLabel(html, inp),
    `Input ohne Label/ARIA: ${inp.slice(0, 80)}`
  );
}

assert(html.includes("admin-login-dialog") || html.includes("view-login"), "Login-Container definiert");
assert(fs.existsSync(path.join(ROOT, "frontend/css/accessibility.css")), "accessibility.css vorhanden");

const a11yCss = fs.readFileSync(path.join(ROOT, "frontend/css/accessibility.css"), "utf8");
assert(/:focus-visible|:focus/.test(a11yCss), "Fokus-Stile in accessibility.css");

const contrastDoc = path.join(ROOT, "docs/contrast.md");
assert(fs.existsSync(contrastDoc), "docs/contrast.md vorhanden");

const errorsJs = fs.readFileSync(path.join(ROOT, "frontend/js/errors.js"), "utf8");
assert(errorsJs.includes("permission_denied"), "permission_denied in errors.js");

console.log("Accessibility-Static-Checks OK");
