/**
 * Generates placeholder PNG icons for the extension (16/32/48/128).
 * Zero-dependency: writes a minimal valid PNG (RGBA, no interlace) using
 * Node's built-in zlib.
 *
 * Usage: node scripts/gen-icons.mjs
 * Output: public/icons/icon{size}.png
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- Minimal PNG encoder -------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Render an RGBA pixel buffer of size width×height using a per-pixel fn. */
function renderPng(size, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const off = rowStart + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Icon design (simple, recognizable "J" mark) -------------------------

const BG = [79, 70, 229]; // indigo #4F46E5
const FG = [255, 255, 255]; // white

function pixelFn(x, y, size) {
  // Rounded-rect-ish circle background; white "J"-like block in center.
  const cx = (x - size / 2) / size;
  const cy = (y - size / 2) / size;
  const inCircle = cx * cx + cy * cy <= 0.5 * 0.5;

  // Draw a simple J: vertical bar + hook at bottom.
  const unit = 1 / size;
  const jx = x / size;
  const jy = y / size;
  const bar = jx >= 0.28 && jx <= 0.46 && jy >= 0.22 && jy <= 0.72;
  const hookShape =
    jy >= 0.6 &&
    jy <= 0.78 &&
    ((jx >= 0.28 && jx <= 0.62) || (jx >= 0.28 && jx <= 0.46 && jy >= 0.6));

  if (!inCircle) return [0, 0, 0, 0];
  if (bar || hookShape) return [...FG, 255];
  return [...BG, 255];
}

const sizes = [16, 32, 48, 128];
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });
for (const size of sizes) {
  const png = renderPng(size, pixelFn);
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`wrote public/icons/icon${size}.png (${png.length} bytes)`);
}
