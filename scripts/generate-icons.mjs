// Dependency-free PWA icon generator. Produces the app's "overlap" mark — a
// two-circle Venn diagram on the indigo accent — as PNGs, using only Node core
// (zlib for the IDAT deflate, a hand-rolled CRC32 for the chunk checksums).
//
// Run with `node scripts/generate-icons.mjs`. Outputs to public/icons/. The
// mark is the brand: two overlapping circles, the intersection brighter — which
// is exactly what Overlapp computes. Re-run if the palette changes.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// --- palette (indigo-600 background, white circles) ---------------------------
const BG = [79, 70, 229]; // #4f46e5 indigo-600

function blend(base, top, alpha) {
  return base.map((b, i) => Math.round(b * (1 - alpha) + top[i] * alpha));
}

/** RGBA pixel for the Venn mark at (x, y) in a `size`×`size` image. `pad` is the
 *  fraction of the canvas kept clear around the mark (bigger for maskable). */
function pixel(x, y, size, pad, opaqueBg) {
  const inset = size * pad;
  const usable = size - inset * 2;
  // Two circles, horizontally offset so they overlap by ~one radius.
  const r = usable * 0.3;
  const cy = size / 2;
  const cx1 = inset + usable * 0.36;
  const cx2 = inset + usable * 0.64;
  const in1 = (x - cx1) ** 2 + (y - cy) ** 2 <= r * r;
  const in2 = (x - cx2) ** 2 + (y - cy) ** 2 <= r * r;
  const covered = (in1 ? 1 : 0) + (in2 ? 1 : 0);

  if (covered === 0) {
    return opaqueBg ? [...BG, 255] : [0, 0, 0, 0];
  }
  // One circle → soft white; overlap → near-solid white (the "overlap" payoff).
  const white = [255, 255, 255];
  const color = covered === 2 ? blend(BG, white, 0.92) : blend(BG, white, 0.5);
  return [...color, 255];
}

// --- minimal PNG encoder ------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pad, opaqueBg) {
  // Raw image: one filter byte (0 = none) per scanline, then RGBA pixels.
  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size, pad, opaqueBg);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  { name: "icon-192.png", size: 192, pad: 0.12, opaque: true },
  { name: "icon-512.png", size: 512, pad: 0.12, opaque: true },
  // Maskable: extra padding so the mark survives the platform's safe-zone crop,
  // and an opaque background so no transparency shows through the mask.
  { name: "icon-maskable-512.png", size: 512, pad: 0.2, opaque: true },
  // Apple touch icon: iOS ignores alpha and rounds the corners itself.
  { name: "apple-touch-icon.png", size: 180, pad: 0.14, opaque: true },
];

for (const t of targets) {
  writeFileSync(path.join(OUT, t.name), encodePng(t.size, t.pad, t.opaque));
  console.log(`wrote public/icons/${t.name} (${t.size}×${t.size})`);
}
