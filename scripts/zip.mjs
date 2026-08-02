/**
 * Phase 13.1 — packages dist/ into release/jobinzy.zip with manifest.json at
 * the ZIP ROOT (Chrome Web Store requirement: extension files must sit at the
 * top level, no wrapping dist/ folder).
 *
 * Pure-Node ZIP writer (STORE + DEFLATE via node:zlib) — no external `zip`/
 * `tar` CLI dependency, so it behaves identically on Windows, macOS and Linux
 * (the earlier `tar -a` fallback misparsed Windows drive-letter paths).
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { deflateRawSync } from "node:zlib";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const outDir = join(root, "release");
const outZip = join(outDir, "jobinzy.zip");

if (!existsSync(dist)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

// Privacy guard (0.3 acceptance): the packaged manifest must NOT request
// broad host permissions. Fail loudly rather than ship a footgun.
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
if (manifest.host_permissions) {
  console.error(
    "Refusing to package: dist/manifest.json contains host_permissions — " +
      "the extension must stay activeTab-only (plan 0.3)."
  );
  process.exit(1);
}

// ---- minimal ZIP writer ------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(dist, full).split("\\").join("/"); // POSIX paths in the zip
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else {
      out.push({ rel, data: readFileSync(full) });
    }
  }
  return out;
}

const now = new Date();
const { time, day } = dosDateTime(now);
const entries = collectFiles(dist);
const chunks = [];
const central = [];
let offset = 0;

for (const { rel, data } of entries) {
  const nameBuf = Buffer.from(rel, "utf8");
  const crc = crc32(data);
  const deflated = deflateRawSync(data);
  const useDeflate = deflated.length < data.length;
  const payload = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;

  // Local file header
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18); // compressed size
  local.writeUInt32LE(data.length, 22); // uncompressed size
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra len

  chunks.push(local, nameBuf, payload);

  // Central directory header
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); // signature
  cen.writeUInt16LE(20, 4); // version made by
  cen.writeUInt16LE(20, 6); // version needed
  cen.writeUInt16LE(0x0800, 8); // flags
  cen.writeUInt16LE(method, 10);
  cen.writeUInt16LE(time, 12);
  cen.writeUInt16LE(day, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(payload.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt16LE(0, 30); // extra
  cen.writeUInt16LE(0, 32); // comment
  cen.writeUInt16LE(0, 34); // disk start
  cen.writeUInt16LE(0, 36); // internal attrs
  cen.writeUInt32LE(0o100644 * 0x10000, 38); // external attrs (regular file)
  cen.writeUInt32LE(offset, 42); // local header offset

  central.push(Buffer.concat([cen, nameBuf]));
  offset += local.length + nameBuf.length + payload.length;
}

const centralBuf = Buffer.concat(central);
// After the loop, `offset` already equals the total bytes of all local
// entries — exactly where the central directory begins.
const centralOffset = offset;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); // signature
end.writeUInt16LE(0, 4); // disk number
end.writeUInt16LE(0, 6); // central dir disk
end.writeUInt16LE(entries.length, 8); // entries on this disk
end.writeUInt16LE(entries.length, 10); // total entries
end.writeUInt32LE(centralBuf.length, 12); // central dir size
end.writeUInt32LE(centralOffset, 16); // central dir offset
end.writeUInt16LE(0, 20); // comment len

mkdirSync(outDir, { recursive: true });
writeFileSync(outZip, Buffer.concat([...chunks, centralBuf, end]));

console.log(`Packaged ${outZip}`);
console.log(`  ${entries.length} files, manifest at zip root`);
console.log(`  manifest_version: ${manifest.manifest_version}`);
console.log(`  name: ${manifest.name} v${manifest.version}`);
console.log(`  permissions: ${manifest.permissions.join(", ")}`);
