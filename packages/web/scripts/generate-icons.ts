/**
 * Generate the home-screen icons (audit3 L1) from the same mark the inline
 * SVG favicon draws: a dark rounded square with the three status dots (green
 * normal / amber delayed / red cancelled). Rasterised here rather than
 * committed as a binary so the icons can never drift from the favicon —
 * and so adding a size is a one-line change.
 *
 * Zero dependencies: the raster is a flat-colour rounded rect plus three
 * circles, and the PNG is encoded directly on node:zlib (RGBA, 8-bit,
 * one filter byte per scanline). Run as the first build step so the
 * generated files land in dist/ with the rest of public/.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

/** The favicon's palette (see index.html and archive.ts pageShell). */
const BG: readonly [number, number, number] = [0x0a, 0x0c, 0x10];
const DOTS: { cx: number; cy: number; r: number; rgb: readonly [number, number, number] }[] = [
  { cx: 32, cy: 18, r: 7, rgb: [0x10, 0xb9, 0x81] },
  { cx: 32, cy: 32, r: 7, rgb: [0xf5, 0x9e, 0x0b] },
  { cx: 32, cy: 46, r: 7, rgb: [0xef, 0x44, 0x44] },
];
/** Corner radius of the 64×64 favicon square. */
const CORNER_RADIUS = 14;

function insideRoundedSquare(x: number, y: number, size: number, radius: number): boolean {
  const ex = Math.min(x, size - x);
  const ey = Math.min(y, size - y);
  if (ex >= radius || ey >= radius) return true;
  const dx = radius - ex;
  const dy = radius - ey;
  return dx * dx + dy * dy <= radius * radius;
}

/** Render the 64×64 mark at `size`, alpha = coverage (3×3 supersampled). */
function render(size: number, rounded: boolean): Uint8Array {
  const scale = size / 64;
  const radius = CORNER_RADIUS * scale;
  const SAMPLES = 3;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          if (rounded && !insideRoundedSquare(px, py, size, radius)) continue;
          let c: readonly [number, number, number] = BG;
          for (const d of DOTS) {
            const dx = px - d.cx * scale;
            const dy = py - d.cy * scale;
            const rr = d.r * scale;
            if (dx * dx + dy * dy <= rr * rr) {
              c = d.rgb;
              break;
            }
          }
          r += c[0];
          g += c[1];
          b += c[2];
          covered++;
        }
      }
      const n = SAMPLES * SAMPLES;
      const i = (y * size + x) * 4;
      // Straight-alpha: divide RGB by covered (not total samples) so edge
      // pixels without double-apply coverage on composite (no dark fringe).
      const divisor = covered || 1;
      rgba[i] = Math.round(r / divisor);
      rgba[i + 1] = Math.round(g / divisor);
      rgba[i + 2] = Math.round(b / divisor);
      rgba[i + 3] = Math.round((covered / n) * 255);
    }
  }
  return rgba;
}

// ---- Minimal PNG encoder (colour type 6, no interlace, filter 0) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// apple-touch-icon: iOS applies its own corner mask, so ship a full-bleed
// square (transparent corners would be composited onto black). The manifest
// icons keep the rounded mark for Android's adaptive/launcher rendering.
const ICONS: { file: string; size: number; rounded: boolean }[] = [
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
];

for (const icon of ICONS) {
  const out = new URL(`../public/${icon.file}`, import.meta.url);
  writeFileSync(out, encodePng(icon.size, render(icon.size, icon.rounded)));
  console.log(`generated public/${icon.file} (${icon.size}×${icon.size})`);
}
