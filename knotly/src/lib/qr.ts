// src/lib/qr.ts — a small QR code encoder (byte mode, error correction level M, versions 1–10,
// up to 213 bytes), so printed invitations can carry a code without an outside service seeing the
// guest's personal RSVP link. Output is a module grid, or an SVG string.

type Block = [ecPerBlock: number, g1Blocks: number, g1Data: number, g2Blocks?: number, g2Data?: number];
// Level M block structure per version (ISO/IEC 18004 table 9).
const BLOCKS: Record<number, Block> = {
  1: [10, 1, 16],
  2: [16, 1, 28],
  3: [26, 1, 44],
  4: [18, 2, 32],
  5: [24, 2, 43],
  6: [16, 4, 27],
  7: [18, 4, 31],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const dataCapacity = (v: number) => {
  const [, b1, d1, b2 = 0, d2 = 0] = BLOCKS[v];
  return b1 * d1 + b2 * d2;
};

// ---------- Reed–Solomon over GF(256), primitive polynomial 0x11d ----------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function ecCodewords(data: number[], degree: number): number[] {
  const g = generator(degree);
  const res = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = res[i];
    if (c) for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], c);
  }
  return res.slice(data.length);
}

// ---------- data encoding ----------
function encodeData(bytes: Uint8Array, v: number): number[] {
  const cap = dataCapacity(v);
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap * 8 - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0; out.length < cap; pad++) out.push(pad % 2 ? 0x11 : 0xec);
  return out;
}

function interleave(data: number[], v: number): number[] {
  const [ec, b1, d1, b2 = 0, d2 = 0] = BLOCKS[v];
  const blocks: number[][] = [];
  let k = 0;
  for (let i = 0; i < b1; i++) blocks.push(data.slice(k, (k += d1)));
  for (let i = 0; i < b2; i++) blocks.push(data.slice(k, (k += d2)));
  const ecs = blocks.map((b) => ecCodewords(b, ec));
  const out: number[] = [];
  const maxD = Math.max(d1, d2);
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

// ---------- matrix ----------
type Grid = { size: number; mod: Int8Array; fn: Uint8Array }; // mod: 0/1, fn: 1 = function pattern

function makeGrid(v: number): Grid {
  const size = 17 + 4 * v;
  const g: Grid = { size, mod: new Int8Array(size * size), fn: new Uint8Array(size * size) };
  const set = (r: number, c: number, on: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    g.mod[r * size + c] = on ? 1 : 0;
    g.fn[r * size + c] = 1;
  };
  const finder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++)
      for (let dc = -1; dc <= 7; dc++) {
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const ring = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        set(r + dr, c + dc, inside && (ring || core));
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const pos = ALIGN[v];
  for (const r of pos)
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  // Reserve format areas (filled later) and the dark module.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue; // timing pattern
    set(8, i, false);
    set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    set(8, size - 1 - i, false);
    set(size - 1 - i, 8, false);
  }
  set(size - 8, 8, true);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, on);
      set(b, a, on);
    }
  }
  return g;
}

function placeData(g: Grid, codewords: number[]) {
  const { size } = g;
  let bit = 0;
  const total = codewords.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const idx = r * size + c;
        if (g.fn[idx]) continue;
        g.mod[idx] = bit < total ? (codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1 : 0;
        bit++;
      }
    }
    upward = !upward;
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(g: Grid, m: number): Int8Array {
  const out = g.mod.slice();
  for (let r = 0; r < g.size; r++)
    for (let c = 0; c < g.size; c++) {
      const i = r * g.size + c;
      if (!g.fn[i] && MASKS[m](r, c)) out[i] ^= 1;
    }
  return out;
}

function drawFormat(mod: Int8Array, size: number, mask: number) {
  const data = (0b00 << 3) | mask; // level M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const at = (r: number, c: number, i: number) => (mod[r * size + c] = (bits >>> i) & 1);
  // First copy around the top-left finder, second split between the other two.
  for (let i = 0; i <= 5; i++) at(i, 8, i);
  at(7, 8, 6);
  at(8, 8, 7);
  at(8, 7, 8);
  for (let i = 9; i < 15; i++) at(8, 14 - i, i);
  for (let i = 0; i < 8; i++) at(8, size - 1 - i, i);
  for (let i = 8; i < 15; i++) at(size - 15 + i, 8, i);
  mod[(size - 8) * size + 8] = 1;
}

function penalty(mod: Int8Array, size: number): number {
  let p = 0;
  const get = (r: number, c: number) => mod[r * size + c];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const same = pass ? get(b, a) === get(b - 1, a) : get(a, b) === get(a, b - 1);
        if (same) run++;
        else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
      if (run >= 5) p += run - 2;
      for (let b = 0; b + 10 < size; b++) {
        const seq = Array.from({ length: 11 }, (_, k) => (pass ? get(b + k, a) : get(a, b + k))).join("");
        if (seq === "10111010000" || seq === "00001011101") p += 40;
      }
    }
  }
  for (let r = 0; r + 1 < size; r++)
    for (let c = 0; c + 1 < size; c++) {
      const s = get(r, c) + get(r + 1, c) + get(r, c + 1) + get(r + 1, c + 1);
      if (s === 0 || s === 4) p += 3;
    }
  let dark = 0;
  for (const m of mod) dark += m;
  p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return p;
}

/** QR modules for `text` (true = dark). Throws if it's longer than version 10 holds. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((n) => dataCapacity(n) >= bytes.length + (n < 10 ? 2 : 3));
  if (!v) throw new Error("qr: text too long");
  const g = makeGrid(v);
  placeData(g, interleave(encodeData(bytes, v), v));
  let best: Int8Array | null = null;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const mod = applyMask(g, m);
    drawFormat(mod, g.size, m);
    const s = penalty(mod, g.size);
    if (s < bestScore) {
      bestScore = s;
      best = mod;
    }
  }
  return Array.from({ length: g.size }, (_, r) => Array.from({ length: g.size }, (_, c) => best![r * g.size + c] === 1));
}

/** An SVG for `text` with a 4-module quiet zone. */
export function qrSvg(text: string, { size = 160, dark = "#000", light = "#fff" } = {}): string {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let d = "";
  m.forEach((row, r) => row.forEach((on, c) => on && (d += `M${c + 4} ${r + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
