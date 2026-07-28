// Generates PWA PNG icons with pure Node (no native deps).
// Indigo rounded square + white check + teal dot, matching public/logo.svg.
import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rest 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
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

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function draw(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size;
  const indigo = [14, 165, 233]; // sky-500 (primary)
  const teal = [45, 212, 191];
  const radius = maskable ? s : s * 0.22; // maskable = full bleed
  // check points
  const p = (fx, fy) => [fx * s, fy * s];
  const [ax, ay] = p(0.3, 0.52);
  const [mx, my] = p(0.44, 0.66);
  const [bx, by] = p(0.7, 0.36);
  const stroke = s * 0.075;
  const [dotx, doty] = p(0.73, 0.3);
  const dotr = s * 0.05;

  function rounded(x, y) {
    // rounded square: inside if within radius of corners
    const r = radius;
    if (x >= r && x <= s - r) return true;
    if (y >= r && y <= s - r) return true;
    const cx = x < r ? r : s - r;
    const cy = y < r ? r : s - r;
    return Math.hypot(x - cx, y - cy) <= r;
  }

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      let col = null;
      let a = 0;
      if (rounded(x + 0.5, y + 0.5)) {
        col = indigo;
        a = 255;
      }
      // teal dot
      if (Math.hypot(x - dotx, y - doty) <= dotr) {
        col = teal;
        a = 255;
      }
      // white check
      const d = Math.min(
        distToSeg(x, y, ax, ay, mx, my),
        distToSeg(x, y, mx, my, bx, by)
      );
      if (d <= stroke) {
        col = [255, 255, 255];
        a = 255;
      }
      if (col) {
        rgba[i] = col[0];
        rgba[i + 1] = col[1];
        rgba[i + 2] = col[2];
        rgba[i + 3] = a;
      }
    }
  }
  return encodePng(s, s, rgba);
}

writeFileSync(join(outDir, "icon-192.png"), draw(192, false));
writeFileSync(join(outDir, "icon-512.png"), draw(512, false));
writeFileSync(join(outDir, "icon-maskable-512.png"), draw(512, true));
console.log("icons written to", outDir);
