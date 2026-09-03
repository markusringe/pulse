/**
 * HTTP-Kompression ohne Express: gzip immer, Brotli wenn Accept-Encoding br.
 * Nur Text/JSON/JS/SVG — Bilder (PNG) bleiben unangetastet.
 */

const zlib = require("node:zlib");

/** MIME-Typen, die sich lohnen zu komprimieren. */
const TEXTISH = /^(text\/|application\/(json|javascript|xml|ecmascript)|image\/svg\+xml)/i;

/**
 * Bevorzugt Brotli, dann gzip. identity/leer → keine Kompression.
 * @param {string} [acceptEncoding]
 * @returns {"br"|"gzip"|null}
 */
function chooseEncoding(acceptEncoding) {
  const ae = String(acceptEncoding || "").toLowerCase();
  if (!ae || ae === "identity") return null;
  /* q-Werte ignorieren: br vor gzip ist der übliche Browser-Default. */
  if (/(?:^|[,;\s])br(?:$|[,;\s])/i.test(ae) || /\bbr\b/.test(ae)) return "br";
  if (/\bgzip\b/.test(ae)) return "gzip";
  return null;
}

/**
 * Unter dieser Größe lohnt sich der CPU-Aufwand nicht.
 * @param {string} contentType
 * @param {number} byteLength
 */
function shouldCompress(contentType, byteLength) {
  if (!Number.isFinite(byteLength) || byteLength < 256) return false;
  return TEXTISH.test(String(contentType || "").split(";")[0].trim());
}

/**
 * Synchron komprimieren (kleine JSON-/Asset-Bodies). Qualität bewusst mittel,
 * damit der Event-Loop bei vielen Health/API-Requests nicht blockiert.
 * @param {Buffer} buf
 * @param {"br"|"gzip"} encoding
 */
function compressBuffer(buf, encoding) {
  if (encoding === "br") {
    return zlib.brotliCompressSync(buf, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
    });
  }
  return zlib.gzipSync(buf, { level: 6 });
}

/**
 * writeHead + end mit optionaler Content-Encoding.
 * @param {import("http").ServerResponse} res
 * @param {number} status
 * @param {Buffer|string} body
 * @param {string} contentType
 * @param {import("http").IncomingMessage} [req]
 * @param {Record<string, string>} [extraHeaders]
 */
function writeEncoded(res, status, body, contentType, req, extraHeaders = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const encoding = shouldCompress(contentType, buf.length)
    ? chooseEncoding(req && req.headers && req.headers["accept-encoding"])
    : null;
  let out = buf;
  const headers = { "Content-Type": contentType, ...extraHeaders };
  if (encoding) {
    try {
      out = compressBuffer(buf, encoding);
      headers["Content-Encoding"] = encoding;
      const prevVary = extraHeaders.Vary || extraHeaders.vary;
      headers.Vary = prevVary ? `${prevVary}, Accept-Encoding` : "Accept-Encoding";
    } catch {
      out = buf;
    }
  }
  headers["Content-Length"] = String(out.length);
  res.writeHead(status, headers);
  res.end(out);
}

module.exports = {
  chooseEncoding,
  shouldCompress,
  compressBuffer,
  writeEncoded,
  TEXTISH,
};
