// Pre-compress the built bundle (runs as `postbuild`).
//
// Writes a `.br` (brotli, quality 11) and a `.gz` (gzip, level 9) beside
// every text asset in dist/ — scripts, stylesheets, JSON corpora, SVG. The
// backend serves those when the browser accepts them (backend/src/
// precompressed.ts) instead of letting the edge proxy compress on the fly at
// its lowest effort: measured 2026-09-09 on spellcontrol.com, the CSS bundle
// came down at 170 KB gzipped / 143 KB brotli from the proxy, against 98 KB
// at gzip -6 and ~80 KB at brotli 11 for the very same file. Compressing once
// at build time is the whole trick; fonts and images are already compressed
// and are skipped. Small files are skipped too (a header costs more than it
// saves). No dependency: node:zlib does both.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TEXT = /\.(js|mjs|css|json|svg|txt|xml|map)$/;
const MIN_BYTES = 1024;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let files = 0;
let raw = 0;
let br = 0;
let gz = 0;
const t0 = Date.now();
for (const file of walk(dist)) {
  if (!TEXT.test(file)) continue;
  const size = statSync(file).size;
  if (size < MIN_BYTES) continue;
  const input = readFileSync(file);
  const b = brotliCompressSync(input, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: size,
    },
  });
  const g = gzipSync(input, { level: 9 });
  writeFileSync(file + '.br', b);
  writeFileSync(file + '.gz', g);
  files++;
  raw += size;
  br += b.length;
  gz += g.length;
}
const kb = (n) => (n / 1024).toFixed(0);
console.log(
  `precompress: ${files} files, ${kb(raw)} KB raw → ${kb(br)} KB br / ${kb(gz)} KB gz in ${((Date.now() - t0) / 1000).toFixed(1)}s`
);
