/**
 * Content-Hash-Manifest für Frontend-Assets (Phase 5 / C-010).
 * Ersetzt manuelle ?v=navXX-Query-Parameter durch SHA-256-Kurzhashes (?h=).
 *
 * Build: deterministisch, referenzierte lokale Assets müssen im Manifest sein.
 * Laufzeit (Production): Manifest aus Datei laden — kein Hash pro HTTP-Request.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/** Länge des Kurz-Hashes in Hex-Zeichen (8 = 32 Bit, ausreichend für Cache-Busting). */
const HASH_LEN = 8;

/** Relativer Pfad zur Manifest-Datei unter frontend/. */
const MANIFEST_REL = "asset-manifest.json";

/** Web-Pfad-Präfixe, die vom Manifest verwaltet werden. */
const MANAGED_PREFIXES = ["/js/", "/css/", "/i18n/", "/help/", "/assets/"];

/** Dateiendungen, die einen Content-Hash erhalten dürfen. */
const HASHABLE_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".json",
  ".html",
  ".svg",
  ".png",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
]);

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
 * Prüft, ob ein Web-Pfad vom Content-Hash-Manifest verwaltet wird.
 * @param {string} webPath
 * @returns {boolean}
 */
function isManagedWebPath(webPath) {
  const p = String(webPath || "").replace(/\?[^#]*/g, "").split("#")[0];
  if (!p.startsWith("/")) return false;
  return MANAGED_PREFIXES.some((prefix) => p === prefix.slice(0, -1) || p.startsWith(prefix));
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
 * Manifest aus dem frontend/-Verzeichnis berechnen (sortierte Schlüssel für Determinismus).
 * @param {string} frontendDir absoluter Pfad zu frontend/
 * @returns {{ version: number, generatedAt: string, assets: Record<string, string> }}
 */
function buildManifest(frontendDir) {
  const assets = {};
  scanDir(path.join(frontendDir, "js"), [".js"], "/js", assets);
  scanDir(path.join(frontendDir, "css"), [".css"], "/css", assets);
  scanDir(path.join(frontendDir, "i18n"), [".json"], "/i18n", assets);
  scanDir(path.join(frontendDir, "help"), [".html", ".json"], "/help", assets);
  scanDir(
    path.join(frontendDir, "assets"),
    [".svg", ".png", ".ico", ".woff", ".woff2", ".ttf"],
    "/assets",
    assets,
  );

  const sorted = {};
  for (const key of Object.keys(assets).sort()) {
    sorted[key] = assets[key];
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    assets: sorted,
  };
}

/**
 * Manifest-Assets mit Dateien auf Platte abgleichen (einmalig beim Start, nicht pro Request).
 * @param {string} frontendDir
 * @param {Record<string, string>} assets
 */
function verifyManifestMatchesDisk(frontendDir, assets) {
  for (const [webPath, expectedHash] of Object.entries(assets)) {
    const rel = webPath.replace(/^\//, "");
    const abs = path.join(frontendDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Manifest-Asset fehlt auf Platte: ${webPath}`);
    }
    const actual = hashFile(abs);
    if (actual !== expectedHash) {
      throw new Error(`Hash-Abweichung für ${webPath} (Manifest ${expectedHash}, Datei ${actual})`);
    }
  }
}

/**
 * Gespeichertes Manifest laden oder neu berechnen (nur Entwicklung/Fallback).
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
 * Production: Manifest-Datei laden und einmalig gegen Platte prüfen.
 * @param {string} frontendDir
 * @param {{ production?: boolean }} [opts]
 * @returns {{ version: number, generatedAt: string, assets: Record<string, string> }}
 */
function loadManifestStrict(frontendDir, opts = {}) {
  const production = opts.production === true;
  const manifestPath = path.join(frontendDir, MANIFEST_REL);

  if (!fs.existsSync(manifestPath)) {
    const msg = "asset-manifest.json fehlt — npm run build ausführen";
    if (production) throw new Error(msg);
    console.warn(`[asset-manifest] ${msg} — berechne zur Laufzeit (nur Entwicklung)`);
    return buildManifest(frontendDir);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    const msg = `asset-manifest.json unlesbar: ${err.message}`;
    if (production) throw new Error(msg);
    console.warn(`[asset-manifest] ${msg}`);
    return buildManifest(frontendDir);
  }

  if (!parsed?.assets || typeof parsed.assets !== "object" || !Object.keys(parsed.assets).length) {
    const msg = "asset-manifest.json hat ungültiges Format oder ist leer";
    if (production) throw new Error(msg);
    console.warn(`[asset-manifest] ${msg}`);
    return buildManifest(frontendDir);
  }

  verifyManifestMatchesDisk(frontendDir, parsed.assets);
  return parsed;
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
 * Prüft, ob eine Import-/Fetch-Referenz lokal umgeschrieben werden darf.
 * Externe, data-, blob- und API-URLs bleiben unverändert.
 * @param {string} ref
 * @returns {boolean}
 */
function isRewritableLocalAssetRef(ref) {
  const clean = String(ref || "")
    .replace(/\?[^#'"]*/g, "")
    .split("#")[0];
  if (!clean) return false;
  if (/^(https?:|data:|blob:|\/\/)/i.test(clean)) return false;
  if (clean.startsWith("/api/")) return false;
  if (clean.startsWith("/")) {
    return isManagedWebPath(clean);
  }
  if (clean.startsWith("./") || clean.startsWith("../")) {
    const ext = path.posix.extname(clean);
    return HASHABLE_EXTENSIONS.has(ext);
  }
  return false;
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
 * @param {string} ref
 * @param {string} fromWebPath Kontext für relative Pfade
 * @param {Record<string, string>} assets
 * @returns {string}
 */
function withContentHash(ref, fromWebPath, assets) {
  if (!isRewritableLocalAssetRef(ref)) return ref;
  const base = ref.replace(/\?[^#'"]*/g, "");
  const suffix = ref.includes("#") ? ref.slice(ref.indexOf("#")) : "";
  const webPath = resolveWebPath(fromWebPath, base);
  if (!webPath || !isManagedWebPath(webPath)) return ref;
  const ext = path.posix.extname(webPath);
  if (!HASHABLE_EXTENSIONS.has(ext)) return ref;
  const hq = hashQueryFor(webPath, assets);
  if (!hq) return ref;
  return `${base}${hq}${suffix}`;
}

/**
 * HTML: Stylesheet-/Script-Links und window.__PULSE_ASSET_H__ injizieren.
 * @param {Buffer|string} htmlBuf
 * @param {Record<string, string>} assets
 * @returns {Buffer}
 */
function injectHtmlAssetHashes(htmlBuf, assets) {
  let html = htmlBuf.toString("utf8");

  html = html.replace(
    /((?:href|src)=["'])(\/(?:css|js|assets)\/[^"'?#]+)(\?[^"'#]*)?(#[^"']*)?(["'])/g,
    (_m, pre, urlPath, _q, frag, post) => {
      const hq = hashQueryFor(urlPath, assets);
      return `${pre}${urlPath}${hq}${frag || ""}${post}`;
    },
  );

  const manifestScript = `<script id="pulse-asset-manifest">window.__PULSE_ASSET_H__=${JSON.stringify(assets)};</script>`;
  if (!html.includes("pulse-asset-manifest")) {
    html = html.replace(/<head>/i, `<head>\n    ${manifestScript}`);
  } else {
    html = html.replace(/<script id="pulse-asset-manifest">[\s\S]*?<\/script>/, manifestScript);
  }

  return Buffer.from(html);
}

/**
 * JS-Modulquelltext: nur bekannte lokale import/export-Pfade hashen.
 * @param {string} source
 * @param {string} fromWebPath z. B. "/js/app.js"
 * @param {Record<string, string>} assets
 * @param {{ strictBuild?: boolean }} [opts]
 * @returns {string}
 */
function rewriteJsImports(source, fromWebPath, assets, opts = {}) {
  const strictBuild = opts.strictBuild === true;
  return source.replace(
    /((?:import\s*(?:\([^)]*\)|[\s*{][\s\S]*?\sfrom\s*)|export\s*(?:\*|\{[^}]*\})\s*from\s*))(["'])([^"']+)\2/g,
    (full, pre, _q, ref) => {
      if (!isRewritableLocalAssetRef(ref)) return full;
      const webPath = resolveWebPath(fromWebPath, ref);
      if (!webPath || !isManagedWebPath(webPath)) {
        if (strictBuild) {
          throw new Error(`Unbekannter lokaler Asset-Pfad „${ref}“ in ${fromWebPath}`);
        }
        return full;
      }
      const ext = path.posix.extname(webPath);
      if (!HASHABLE_EXTENSIONS.has(ext)) return full;
      if (!assets[webPath]) {
        if (strictBuild) {
          throw new Error(`Referenzierter Asset fehlt im Manifest: ${webPath} (${fromWebPath})`);
        }
        return full;
      }
      const base = ref.replace(/\?[^#'"]*/g, "");
      const suffix = ref.includes("#") ? ref.slice(ref.indexOf("#")) : "";
      const hq = hashQueryFor(webPath, assets);
      return `${pre}${base}${hq}${suffix}`;
    },
  );
}

/**
 * Referenzen aus index.html sammeln.
 * @param {string} html
 * @returns {string[]}
 */
function collectReferencesFromHtml(html) {
  const refs = [];
  const re = /(?:href|src)=["'](\/(?:css|js|assets|help)\/[^"'?#]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

/**
 * Referenzen aus einer JS-Datei sammeln (Imports, assetUrl, verdächtige fetch-Aufrufe).
 * @param {string} source
 * @param {string} fromWebPath
 * @returns {{ refs: string[], errors: string[] }}
 */
function collectReferencesFromJs(source, fromWebPath) {
  const refs = [];
  const errors = [];

  const importRe =
    /((?:import\s*(?:\([^)]*\)|[\s*{][\s\S]*?\sfrom\s*)|export\s*(?:\*|\{[^}]*\})\s*from\s*))(["'])([^"']+)\2/g;
  let m;
  while ((m = importRe.exec(source)) !== null) {
    const ref = m[3];
    if (!isRewritableLocalAssetRef(ref)) continue;
    const webPath = resolveWebPath(fromWebPath, ref);
    if (webPath) refs.push(webPath);
  }

  /* Nur statische assetUrl("…") / assetUrl('…') — dynamische Vorlagen separat prüfen */
  const assetUrlRe = /assetUrl\s*\(\s*(["'])(\/[^"'?]+)\1\s*\)/g;
  while ((m = assetUrlRe.exec(source)) !== null) {
    refs.push(m[2]);
  }

  if (/assetUrl\s*\(\s*`\/help\/\$\{/.test(source)) {
    refs.push("__DYNAMIC_HELP_HTML__");
  }
  if (/assetUrl\s*\(\s*`\/i18n\/\$\{/.test(source)) {
    refs.push("__DYNAMIC_I18N_JSON__");
  }

  /* Direkte fetch-Aufrufe ohne assetUrl für verwaltete Pfade sind Build-Fehler */
  if (/fetch\s*\(\s*[`'"](\/(?:help|i18n)\/)/.test(source) && !/assetUrl\s*\(\s*[`'"](\/(?:help|i18n)\/)/.test(source)) {
    if (/fetch\s*\(\s*[`'"](\/(?:help|i18n)\/)/.test(source.replace(/assetUrl\s*\([^)]+\)/g, ""))) {
      errors.push(`${fromWebPath}: fetch() auf /help/ oder /i18n/ ohne assetUrl()`);
    }
  }

  return { refs, errors };
}

/**
 * Hilfe-Artikel-IDs aus articles.json für dynamische HTML-Pfade.
 * @param {string} frontendDir
 * @returns {string[]}
 */
function helpArticleIds(frontendDir) {
  const articlesPath = path.join(frontendDir, "help", "articles.json");
  if (!fs.existsSync(articlesPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(articlesPath, "utf8"));
  const articles = Array.isArray(parsed?.articles) ? parsed.articles : [];
  return articles.map((a) => String(a.id || "").trim()).filter(Boolean);
}

/**
 * Alle referenzierten lokalen Assets gegen Manifest prüfen (Build-Schritt).
 * @param {string} frontendDir
 * @param {Record<string, string>} assets
 * @returns {string[]} Fehlermeldungen
 */
function validateManifestReferences(frontendDir, assets) {
  const errors = [];
  const indexPath = path.join(frontendDir, "index.html");
  if (fs.existsSync(indexPath)) {
    const htmlRefs = collectReferencesFromHtml(fs.readFileSync(indexPath, "utf8"));
    for (const webPath of htmlRefs) {
      if (!assets[webPath]) {
        errors.push(`index.html referenziert ${webPath}, fehlt im Manifest`);
      }
    }
  }

  const jsDir = path.join(frontendDir, "js");
  if (fs.existsSync(jsDir)) {
    for (const file of fs.readdirSync(jsDir)) {
      if (!file.endsWith(".js")) continue;
      const fromWebPath = `/js/${file}`;
      const source = fs.readFileSync(path.join(jsDir, file), "utf8");
      const { refs, errors: jsErrors } = collectReferencesFromJs(source, fromWebPath);
      errors.push(...jsErrors);
      for (const webPath of refs) {
        if (webPath.startsWith("__DYNAMIC_")) continue;
        if (!assets[webPath]) {
          errors.push(`${fromWebPath} referenziert ${webPath}, fehlt im Manifest`);
        }
      }
    }
  }

  for (const id of helpArticleIds(frontendDir)) {
    const webPath = `/help/${id}.html`;
    if (!assets[webPath]) {
      errors.push(`articles.json Artikel „${id}“ → ${webPath} fehlt im Manifest`);
    }
  }

  for (const code of ["de", "en", "fr"]) {
    const webPath = `/i18n/${code}.json`;
    if (!assets[webPath]) {
      errors.push(`Erwartete i18n-Datei ${webPath} fehlt im Manifest`);
    }
  }

  return errors;
}

module.exports = {
  HASH_LEN,
  MANIFEST_REL,
  MANAGED_PREFIXES,
  hashContent,
  hashFile,
  buildManifest,
  loadOrBuildManifest,
  loadManifestStrict,
  verifyManifestMatchesDisk,
  writeManifest,
  resolveWebPath,
  isManagedWebPath,
  isRewritableLocalAssetRef,
  hashQueryFor,
  withContentHash,
  injectHtmlAssetHashes,
  rewriteJsImports,
  collectReferencesFromHtml,
  collectReferencesFromJs,
  validateManifestReferences,
  helpArticleIds,
};
