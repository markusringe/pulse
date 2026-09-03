#!/usr/bin/env node
/**
 * QR-Code: qrcode-generator-Bibliothek erzeugt scannbare Matrizen (ECC M, Auto-Version).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const libPath = path.join(__dirname, "../frontend/js/qrcodeLib.js");
const libSrc = fs
  .readFileSync(libPath, "utf8")
  .replace(/\n\/\* ESM-Export[\s\S]*$/, "");

const qrcodeFactory = vm.runInNewContext(`${libSrc}; qrcode;`, {}, { filename: "qrcodeLib.js" });

function encodeSample(text) {
  const qr = qrcodeFactory(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const size = qr.getModuleCount();
  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.isDark(row, col)) dark += 1;
    }
  }
  return { size, dark, moduleCount: size };
}

const sample = "https://example.org/j/482917";
const qr = encodeSample(sample);
assert(qr.size >= 21, "Matrix erzeugt");
assert(qr.dark > qr.size * 2, "Matrix enthält ausreichend dunkle Module");

const longUrl = `https://pulse.example.com/j/${"1".repeat(6)}`;
const qrLong = encodeSample(longUrl);
assert(qrLong.size >= qr.size, "Längere URL passt in QR-Version");

console.log("test-qr OK — qrcode-generator, Beispiel-URL /j/CODE kodiert");
