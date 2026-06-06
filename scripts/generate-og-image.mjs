// Open Graph / link-preview banner generator (1200×630). Renders the brand
// "overlap" Venn mark + wordmark on the warm cream base, matching the
// "Bright & Friendly" system in docs/DESIGN-BRIEF.md (honey #efa94a brand,
// deep-pine #1a6b50 availability signal, cream #faf7f0). Output: public/og-image.png,
// referenced by the default + invite Open Graph metadata so shared links render
// a professional card in iMessage/WhatsApp/Slack.
//
// Run with `node scripts/generate-og-image.mjs`. Uses `sharp` (already present
// via Next's image pipeline) to rasterise an SVG. Re-run if the palette changes.

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "og-image.png");

const W = 1200;
const H = 630;

// --- palette (design tokens) -------------------------------------------------
const CREAM = "#faf7f0";
const HONEY = "#efa94a";
const HONEY_DEEP = "#b26a1e";
const PINE_MID = "#2d8460";
const PINE_DEEP = "#1a6b50";
const INK = "#2a2820";
const INK_MUTED = "#6e665a";

// --- Venn mark geometry (two overlapping circles, intersection = the signal) --
const cy = H / 2;
const cx = 330;
const r = 132;
const off = 66; // half the centre-to-centre distance → ~one-radius overlap
const c1x = cx - off;
const c2x = cx + off;
const h = Math.sqrt(r * r - off * off); // half-height of the intersection lens
const topY = (cy - h).toFixed(2);
const botY = (cy + h).toFixed(2);

// Intersection lens: right edge of circle 1, then left edge of circle 2.
const lens =
  `M ${cx} ${topY} ` +
  `A ${r} ${r} 0 0 1 ${cx} ${botY} ` +
  `A ${r} ${r} 0 0 1 ${cx} ${topY} Z`;

const FONT = `'Avenir Next','Helvetica Neue',Helvetica,Arial,sans-serif`;

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="78%" cy="22%" r="62%">
      <stop offset="0%" stop-color="${HONEY}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${HONEY}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- the overlap mark -->
  <g>
    <circle cx="${c1x}" cy="${cy}" r="${r}" fill="${HONEY}"/>
    <circle cx="${c2x}" cy="${cy}" r="${r}" fill="${PINE_MID}"/>
    <path d="${lens}" fill="${PINE_DEEP}"/>
  </g>

  <!-- wordmark + message -->
  <text x="540" y="252" font-family="${FONT}" font-size="30" font-weight="700"
        letter-spacing="3.5" fill="${HONEY_DEEP}">SHARED GROUP CALENDAR</text>
  <text x="538" y="356" font-family="${FONT}" font-size="118" font-weight="800"
        letter-spacing="-2" fill="${INK}">Overlapp</text>
  <text x="540" y="430" font-family="${FONT}" font-size="40" font-weight="500"
        fill="${INK_MUTED}">Know when everyone's free —</text>
  <text x="540" y="482" font-family="${FONT}" font-size="40" font-weight="500"
        fill="${INK_MUTED}">before anyone asks.</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${png.length} bytes)`);
