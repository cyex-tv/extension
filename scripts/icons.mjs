// The toolbar and store icons: the cyex mark (three bars on the 32 grid, the middle one in the
// accent) on the dark ground, drawn here so no binary files live in the repo. Edges are
// supersampled so the small sizes stay crisp.
import { deflateSync } from 'node:zlib';

const GROUND = [8, 9, 12];
const INK = [232, 232, 234];
const ACCENT = [20, 90, 255];
// x, y, w, h on the 32 grid (cyex-design brand.md).
const BARS = [
  [3, 5, 15, 6, INK],
  [10, 13, 18, 6, ACCENT],
  [3, 21, 15, 6, INK],
];
const RADIUS = 6; // corner of the ground, on the 32 grid
const SS = 4;

function colourAt(x, y) {
  // Outside the rounded ground: transparent.
  const cx = Math.min(Math.max(x, RADIUS), 32 - RADIUS);
  const cy = Math.min(Math.max(y, RADIUS), 32 - RADIUS);
  if ((x - cx) ** 2 + (y - cy) ** 2 > RADIUS ** 2) return null;
  for (const [bx, by, bw, bh, c] of BARS) if (x >= bx && x < bx + bw && y >= by && y < by + bh) return c;
  return GROUND;
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt(((x + (sx + 0.5) / SS) * 32) / size, ((y + (sy + 0.5) / SS) * 32) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An RGBA PNG of the icon at `size` px. */
export function png(size) {
  const px = draw(size);
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function icons() {
  return Object.fromEntries([16, 32, 48, 128].map((s) => [s, png(s)]));
}
