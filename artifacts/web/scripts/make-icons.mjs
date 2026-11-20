// Draws the Kynex app icon as PNG files (for phone home screens) without any
// image library: same shapes as public/icon.svg, 4x supersampled for smooth edges.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const NAVY = [0x15, 0x4e, 0x70];
const ORANGE = [0xf2, 0x81, 0x2e];
const WHITE = [255, 255, 255];

// Shapes in the SVG's 512-unit coordinate space.
const segments = [
  [256, 190, 256, 310],
  [256, 310, 186, 402],
  [256, 310, 326, 402],
  [168, 236, 256, 254],
  [256, 254, 344, 236],
];
const STROKE = 17; // half of stroke-width 34

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function insideRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

/** Colour (or null for transparent) at a point in SVG units. */
function sample(x, y, maskable) {
  if (!maskable && !insideRoundedRect(x, y, 112)) return null;
  if (Math.hypot(x - 256, y - 132) <= 40) return ORANGE;
  if (segments.some((s) => distToSegment(x, y, s) <= STROKE)) return WHITE;
  return NAVY;
}

function render(size, maskable) {
  const ss = 4, rgba = Buffer.alloc(size * size * 4);
  // Maskable icons are cropped by the phone, so shrink the figure into the safe zone.
  const scale = maskable ? 0.8 : 1, offset = (512 - 512 * scale) / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const ux = ((px + (sx + 0.5) / ss) / size) * 512, uy = ((py + (sy + 0.5) / ss) / size) * 512;
          const c = sample((ux - offset) / scale, (uy - offset) / scale, maskable);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (py * size + px) * 4, n = ss * ss;
      if (a) { rgba[i] = r / a; rgba[i + 1] = g / a; rgba[i + 2] = b / a; }
      rgba[i + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, rgba);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

const out = new URL("../public/", import.meta.url);
writeFileSync(new URL("icon-192.png", out), render(192, false));
writeFileSync(new URL("icon-512.png", out), render(512, false));
writeFileSync(new URL("icon-maskable-512.png", out), render(512, true));
console.log("Wrote icon-192.png, icon-512.png, icon-maskable-512.png");
