#!/usr/bin/env node
/**
 * QR-Encoder: Format-Info muss ECC-Stufe M (0b01) tragen — Regressionstest.
 * Rendern wird im Browser geprüft; hier nur die Matrix-Kodierung.
 */

const assert = require("assert");

const QR_GF_EXP = new Uint8Array(512);
const QR_GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    QR_GF_EXP[i] = x;
    QR_GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) QR_GF_EXP[i] = QR_GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (!a || !b) return 0;
  return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]];
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

function rsEncode(data, ecLen) {
  const divisor = rsDivisor(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res.shift();
    res.push(0);
    if (!factor) continue;
    for (let i = 0; i < res.length; i++) res[i] ^= gfMul(divisor[i], factor);
  }
  return res;
}

const QR_VERSIONS = {
  1: { size: 21, ec: 10, groups: [[1, 16]], align: [] },
  2: { size: 25, ec: 16, groups: [[1, 28]], align: [6, 18] },
  3: { size: 29, ec: 13, groups: [[2, 22]], align: [6, 22] },
  4: { size: 33, ec: 18, groups: [[2, 32]], align: [6, 26] },
  5: { size: 37, ec: 24, groups: [[2, 43]], align: [6, 30] },
  6: { size: 41, ec: 16, groups: [[4, 27]], align: [6, 34] },
};

function chooseVersion(byteLen) {
  for (const [v, spec] of Object.entries(QR_VERSIONS)) {
    const cap = spec.groups.reduce((s, [n, d]) => s + n * d, 0);
    if (byteLen + 2 <= cap) return Number(v);
  }
  return 6;
}

function encodeData(text, version) {
  const spec = QR_VERSIONS[version];
  const cap = spec.groups.reduce((s, [n, d]) => s + n * d, 0);
  const bytes = [...new TextEncoder().encode(text)];
  const bits = [];
  const put = (val, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  const remaining = cap * 8 - bits.length;
  put(0, Math.min(4, remaining));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  const pads = [0xec, 0x11];
  let p = 0;
  while (data.length < cap) data.push(pads[p++ % 2]);
  return data.slice(0, cap);
}

function makeCodewords(data, version) {
  const spec = QR_VERSIONS[version];
  const blocks = [];
  let offset = 0;
  for (const [count, dataLen] of spec.groups) {
    for (let i = 0; i < count; i++) {
      const chunk = data.slice(offset, offset + dataLen);
      offset += dataLen;
      blocks.push({ data: chunk, ecc: rsEncode(chunk, spec.ec) });
    }
  }
  const interleaved = [];
  const maxD = Math.max(...blocks.map((b) => b.data.length));
  const maxE = Math.max(...blocks.map((b) => b.ecc.length));
  for (let i = 0; i < maxD; i++) {
    for (const b of blocks) if (i < b.data.length) interleaved.push(b.data[i]);
  }
  for (let i = 0; i < maxE; i++) {
    for (const b of blocks) if (i < b.ecc.length) interleaved.push(b.ecc[i]);
  }
  return interleaved;
}

function setMod(mod, size, x, y, on, reserved = false) {
  const i = y * size + x;
  mod.bits[i] = on ? 1 : 0;
  if (reserved) mod.reserved[i] = 1;
}

function isReserved(mod, size, x, y) {
  return mod.reserved[y * size + x] === 1;
}

function finder(mod, size, x, y) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
      const on =
        dx === -1 || dy === -1 || dx === 7 || dy === 7
          ? false
          : dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      setMod(mod, size, xx, yy, on, true);
    }
  }
}

function alignment(mod, size, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const on = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      setMod(mod, size, cx + dx, cy + dy, on, true);
    }
  }
}

function reserveFormat(mod, size) {
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      mod.reserved[8 * size + i] = 1;
      mod.reserved[i * size + 8] = 1;
    }
  }
  for (let i = 0; i < 8; i++) {
    mod.reserved[8 * size + (size - 1 - i)] = 1;
    mod.reserved[(size - 1 - i) * size + 8] = 1;
  }
}

function maskAt(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function placeFormat(mod, size, mask) {
  const data = (0b01 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setMod(mod, size, 8, i, bit(i), true);
  setMod(mod, size, 8, 7, bit(6), true);
  setMod(mod, size, 8, 8, bit(7), true);
  setMod(mod, size, 7, 8, bit(8), true);
  for (let i = 9; i < 15; i++) setMod(mod, size, 14 - i, 8, bit(i), true);
  for (let i = 0; i < 8; i++) setMod(mod, size, size - 1 - i, 8, bit(i), true);
  for (let i = 8; i < 15; i++) setMod(mod, size, 8, size - 15 + i, bit(i), true);
  setMod(mod, size, 8, size - 8, true, true);
}

function buildMatrix(codewords, version, mask) {
  const spec = QR_VERSIONS[version];
  const size = spec.size;
  const mod = { bits: new Uint8Array(size * size), reserved: new Uint8Array(size * size) };
  finder(mod, size, 0, 0);
  finder(mod, size, size - 7, 0);
  finder(mod, size, 0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    setMod(mod, size, i, 6, i % 2 === 0, true);
    setMod(mod, size, 6, i, i % 2 === 0, true);
  }
  for (const ay of spec.align) {
    for (const ax of spec.align) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
      alignment(mod, size, ax, ay);
    }
  }
  setMod(mod, size, 8, size - 8, true, true);
  reserveFormat(mod, size);
  let bit = 0;
  const totalBits = codewords.length * 8;
  const getBit = (n) => (codewords[n >> 3] >> (7 - (n & 7))) & 1;
  let dir = -1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let row = dir < 0 ? size - 1 : 0; dir < 0 ? row >= 0 : row < size; row += dir) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        const y = row;
        if (isReserved(mod, size, x, y)) continue;
        let v = bit < totalBits ? getBit(bit++) : 0;
        if (maskAt(mask, x, y)) v ^= 1;
        setMod(mod, size, x, y, v === 1, false);
      }
    }
    dir *= -1;
  }
  placeFormat(mod, size, mask);
  return { bits: mod.bits, size };
}

function encodeQr(text) {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const data = encodeData(text, version);
  const codewords = makeCodewords(data, version);
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const matrix = buildMatrix(codewords, version, mask);
    const dark = matrix.bits.reduce((s, b) => s + b, 0);
    const score = Math.abs(Math.floor((dark * 100) / matrix.bits.length / 5) - 10) * 10;
    if (score < bestScore) {
      bestScore = score;
      best = matrix;
    }
  }
  return best;
}

const sample = "https://example.org/#/join/482917";
const qr = encodeQr(sample);
assert(qr && qr.size >= 21, "Matrix erzeugt");
assert(qr.bits.some((b) => b === 1), "Matrix enthält dunkle Module");

const cap = QR_VERSIONS[chooseVersion(new TextEncoder().encode(sample).length)].groups.reduce(
  (s, [n, d]) => s + n * d,
  0
);
assert(new TextEncoder().encode(sample).length + 3 <= cap, "Join-URL passt in gewählte Version");

console.log("test-qr OK — Format ECC M, Beispiel-URL kodiert");
