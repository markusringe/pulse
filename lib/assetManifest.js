/**
 * Content-Hash-Manifest für Frontend-Assets (Phase 5 / C-010).
 * Ersetzt manuelle ?v=navXX-Query-Parameter durch SHA-256-Kurzhashes (?h=).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/** Länge des Kurz-Hashes in Hex-Zeichen (8 = 32 Bit, ausreichend für Cache-Busting). */
const HASH_LEN = 8;

/** Relativer Pfad zur Manifest-Datei unter frontend/. */
const MANIFEST_REL = "asset-manifest.json";

/**
 * SHA-256-Kurzhash eines Puffers.
 * @param {Buffer|string} data
 * @returns {string}
 */
function hashContent(data) {
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, HASH_LEN);
}

/**
 * SHA-256-Kurzhash einer Datei auf der Platte.
 * @param {string} absPath
 * @returns {string}
 */
function hashFile(absPath) {
  return hashContent(fs.readFileSync(absPath));
}

/**
 * Verzeichnis rekursiv nach Dateiendungen durchsuchen.
 * @param {string} dir
 * @param {string[]} extensions z. B. [".js"]
 * @param {string} webPrefix z. B. "/js"
 * @param {Record<string, string>} assets
 */
function scanDir(dir, extensions, webPrefix, assets) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(abs, extensions, `${webPrefix}/${entry.name}`, assets);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!extensions.includes(ext)) continue;
    const webPath = `${webPrefix}/${entry.name}`.replace(/\/+/g, "/");
    assets[webPath] = hashFile(abs);
  }
}

/**
 * Manifest aus dem frontend/-Verzeichnis berechnen.
 * @param {string} frontendDir absoluter Pfad zu frontend/
 * @returns {{ version: number, generatedAt: string, assets: Record<string, string> }}
 */
function buildManifest(frontendDir) {
  const assets = {};
  scanDir(path.join(frontendDir, "js"), [".js"], "/js", assets);
  scanDir(path.join(frontendDir, "css"), [".css"], "/css", assets);
  scanDir(path.join(frontendDir, "i18n"), [".json"], "/i18n", assets);

  const articlesPath = path.join(frontendDir, "help", "articles.json");
  if (fs.existsSync(articlesPath)) {
    assets["/help/articles.json"] = hashFile(articlesPath);
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    assets,
  };
}

/**
 * Gespeichertes Manifest laden oder neu berechnen.
 * @param {string} frontendDir
 * @returns {{ version: number, generatedAt: string, assets: Record<string, string> }}
 */
function loadOrBuildManifest(frontendDir) {
  const manifestPath = path.join(frontendDir, MANIFEST_REL);
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (parsed && parsed.assets && typeof parsed.assets === "object") {
        return parsed;
      }
    } catch {
      /* Neu berechnen bei kaputtem JSON */
    }
  }
  return buildManifest(frontendDir);
}

/**
 * Manifest als JSON-Datei schreiben (Build-Schritt / Docker).
 * @param {string} frontendDir
 * @returns {{ version: number, generatedAt: string, assets: Record<string, string> }}
 */
function writeManifest(frontendDir) {
  const manifest = buildManifest(frontendDir);
  fs.writeFileSync(path.join(frontendDir, MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

/**
 * Web-Pfad aus relativem Import auflösen.
 * @param {string} fromWebPath z. B. "/js/app.js"
 * @param {string} ref z. B. "./websocket.js" oder "/css/pulse.css"
 * @returns {string|null}
 */
function resolveWebPath(fromWebPath, ref) {
  const clean = ref.replace(/\?[^#'"]*/g, "").split("#")[0];
  if (!clean) return null;
  if (clean.startsWith("/")) return clean.replace(/\/+/g, "/");
  if (!clean.startsWith(".")) return null;

  const fromDir = path.posix.dirname(fromWebPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, clean));
  if (!joined.startsWith("/")) return `/${joined}`.replace(/\/+/g, "/");
  return joined.replace(/\/+/g, "/");
}

/**
 * Hash-Query für einen Web-Pfad aus dem Manifest.
 * @param {string} webPath
 * @param {Record<string, string>} assets
 * @returns {string} z. B. "?h=abc12345" oder ""
 */
function hashQueryFor(webPath, assets) {
  const hash = assets[webPath];
  return hash ? `?h=${hash}` : "";
}

/**
 * Statische Asset-Referenz (href/src/import) mit Content-Hash versehen.
 * Entfernt bestehende ?v= / ?h= Query-Parameter.
 * @param {string} ref
 * @param {string} fromWebPath Kontext für relative Pfade
 * @param {Record<string, string>} assets
 * @returns {string}
 */
function withContentHash(ref, fromWebPath, assets) {
  const base = ref.replace(/\?[^#'"]*/g, "");
  const suffix = ref.includes("#") ? ref.slice(ref.indexOf("#")) : "";
  const webPath = resolveWebPath(fromWebPath, base);
  if (!webPath) return ref;
  const ext = path.posix.extname(webPath);
  if (![".js", ".css", ".json"].includes(ext)) return ref;
  const hq = hashQueryFor(webPath, assets);
  if (!hq) return ref;
  return `${base}${hq}${suffix}`;
}

/**
 * HTML: Stylesheet-/Script-Links und optionales window.__PULSE_ASSET_H__ injizieren.
 * @param {Buffer|string} htmlBuf
 * @param {Record<string, string>} assets
 * @returns {Buffer}
 */
function injectHtmlAssetHashes(htmlBuf, assets) {
  let html = htmlBuf.toString("utf8");

  html = html.replace(
    /((?:href|src)=["'])(\/(?:css|js)\/[^"'?#]+)(\?[^"'#]*)?(#[^"']*)?(["'])/g,
    (_m, pre, urlPath, _q, frag, post) => {
      const hq = hashQueryFor(urlPath, assets);
      return `${pre}${urlPath}${hq}${frag || ""}${post}`;
    },
  );

  const manifestScript = `<script id="pulse-asset-manifest">window.__PULSE_ASSET_H__=${JSON.stringify(assets)};</script>`;
  if (!html.includes("pulse-asset-manifest")) {
    html = html.replace(/<head>/i, `<head>\n    ${manifestScript}`);
  } else {
    html = html.replace(
      /<script id="pulse-asset-manifest">[\s\S]*?<\/script>/,
      manifestScript,
    );
  }

  return Buffer.from(html);
}

/**
 * JS-Modulquelltext: import/export/dynamische import()-Pfade hashen.
 * @param {string} source
 * @param {string} fromWebPath z. B. "/js/app.js"
 * @param {Record<string, string>} assets
 * @returns {string}
 */
function rewriteJsImports(source, fromWebPath, assets) {
  return source.replace(
    /((?:import\s*(?:\([^)]+\)|[\s\S]*?\sfrom\s*)|export\s*(?:\*|\{[^}]*\})\s*from\s*)["'])([^"']+)(["'])/g,
    (_m, pre, ref, post) => `${pre}${withContentHash(ref, fromWebPath, assets)}${post}`,
  );
}

module.exports = {
  HASH_LEN,
  MANIFEST_REL,
  hashContent,
  hashFile,
  buildManifest,
  loadOrBuildManifest,
  writeManifest,
  resolveWebPath,
  hashQueryFor,
  withContentHash,
  injectHtmlAssetHashes,
  rewriteJsImports,
};
