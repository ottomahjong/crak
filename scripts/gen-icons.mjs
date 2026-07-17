// Generates original CRAK! app icons as PNGs — no external deps.
// Draws an ivory mahjong-style tile with a gold "dot" ring on a navy field.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// ---- tiny PNG encoder ------------------------------------------------------
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- drawing ---------------------------------------------------------------
function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
const NAVY = hex("#1c2434");
const IVORY = hex("#f5eddd");
const EDGE = hex("#d8c9a8");
const GOLD = hex("#c8a44d");

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function roundedRectCoverage(px, py, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(px - cx) - (halfW - r);
  const dy = Math.abs(py - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
  const inside = Math.min(Math.max(dx, dy), 0);
  const dist = outside + inside;
  return 1 - smooth(-1.2, 1.2, dist);
}

function drawIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const pad = maskable ? size * 0.16 : size * 0.11;
  const half = size / 2 - pad;
  const radius = size * 0.16;
  const ringOuter = half * 0.6;
  const ringInner = half * 0.42;
  const dotR = half * 0.16;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let col = NAVY.slice();

      // tile
      const cov = roundedRectCoverage(x + 0.5, y + 0.5, cx, cy, half, half, radius);
      if (cov > 0) {
        // subtle vertical shading (lower edge darker)
        const shade = (y - (cy - half)) / (2 * half);
        const face = mix(IVORY, EDGE, Math.max(0, shade - 0.55) * 1.6);
        col = mix(col, face, cov);

        // gold ring (dot glyph)
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const ring = smooth(ringOuter + 1.5, ringOuter - 1.5, d) * smooth(ringInner - 1.5, ringInner + 1.5, d);
        const dot = smooth(dotR + 1.5, dotR - 1.5, d);
        const goldCov = Math.max(ring, dot) * cov;
        col = mix(col, GOLD, goldCov);
      }

      rgba[i] = Math.round(col[0]);
      rgba[i + 1] = Math.round(col[1]);
      rgba[i + 2] = Math.round(col[2]);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

const targets = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(join(OUT, name), drawIcon(size, maskable));
  console.log("wrote", name, size);
}
