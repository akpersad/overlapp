// Dependency-free PWA icon generator. Produces the app's "overlap" mark — a
// two-circle Venn diagram in the Phase-7 "Bright & Friendly" brand (honey ×
// deep-pine on cream, matching scripts/generate-og-image.mjs) — as PNGs, using
// only Node core (zlib for the IDAT deflate, a hand-rolled CRC32 for the chunk
// checksums).
//
// Run with `node scripts/generate-icons.mjs`. Outputs to public/icons/. The
// mark is the brand: a honey circle and a pine circle overlapping, the
// intersection rendered in the deepest pine — exactly the "everyone free"
// signal Overlapp computes. Re-run if the palette changes.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// --- palette ("Bright & Friendly", mirrors generate-og-image.mjs) -------------
const BG = [250, 247, 240]; // #faf7f0 cream ground
const HONEY = [239, 169, 74]; // #efa94a brand (left circle)
const PINE_MID = [45, 132, 96]; // #2d8460 availability (right circle)
const PINE_DEEP = [26, 107, 80]; // #1a6b50 the "everyone free" signal (overlap lens)

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

  if (in1 && in2) return [...PINE_DEEP, 255]; // overlap → the signal
  if (in1) return [...HONEY, 255]; // honey brand circle
  if (in2) return [...PINE_MID, 255]; // pine availability circle
  return opaqueBg ? [...BG, 255] : [0, 0, 0, 0];
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

// --- favicon.ico (legacy + crawlers that hit /favicon.ico directly) -----------
// An ICO is just a small directory wrapping one or more images. Modern browsers
// accept PNG payloads inside ICO, so we reuse the PNG encoder at favicon sizes.
function buildIco(sizes) {
  const pngs = sizes.map((s) => encodePng(s, 0.08, true));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(sizes.length, 4); // image count
  const dirSize = 16 * sizes.length;
  let offset = 6 + dirSize;
  const entries = [];
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s; // width (0 means 256)
    e[1] = s >= 256 ? 0 : s; // height
    e[2] = 0; // palette count
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8); // bytes in resource
    e.writeUInt32LE(offset, 12); // offset of image data
    offset += pngs[i].length;
    entries.push(e);
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

// favicon.ico lives in the root app/ segment (Next's file convention serves it
// at /favicon.ico and auto-links it in <head>). Replaces the default scaffold.
const APP_DIR = path.join(__dirname, "..", "src", "app");
writeFileSync(path.join(APP_DIR, "favicon.ico"), buildIco([16, 32, 48]));
console.log("wrote src/app/favicon.ico (16/32/48)");

// --- icon.svg (crisp, scalable — modern browsers prefer it for the tab) -------
// Two overlapping circles + the intersection "lens" in the deepest pine, the
// same geometry as the PNGs and scripts/generate-og-image.mjs.
const hex = (rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
{
  const S = 64;
  const r = S * 0.3;
  const cy = S / 2;
  const cx1 = S * 0.36;
  const cx2 = S * 0.64;
  const mid = (cx1 + cx2) / 2;
  const off = (cx2 - cx1) / 2;
  const half = Math.sqrt(r * r - off * off); // half-height of the lens
  const topY = (cy - half).toFixed(2);
  const botY = (cy + half).toFixed(2);
  const lens =
    `M ${mid} ${topY} A ${r} ${r} 0 0 1 ${mid} ${botY} ` +
    `A ${r} ${r} 0 0 1 ${mid} ${topY} Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="12" fill="${hex(BG)}"/>
  <circle cx="${cx1}" cy="${cy}" r="${r}" fill="${hex(HONEY)}"/>
  <circle cx="${cx2}" cy="${cy}" r="${r}" fill="${hex(PINE_MID)}"/>
  <path d="${lens}" fill="${hex(PINE_DEEP)}"/>
</svg>
`;
  writeFileSync(path.join(__dirname, "..", "public", "icon.svg"), svg);
  console.log("wrote public/icon.svg");
}
