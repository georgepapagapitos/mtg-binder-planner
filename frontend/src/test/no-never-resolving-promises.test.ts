// @vitest-environment node
//
// Guard (E272): no test may create a promise that never settles.
//
// `new Promise(() => {})` is the natural way to write "the read is still in
// flight", but nothing ever resolves it, so the component's `.then` chain hangs
// off it forever and `vitest run --detectAsyncLeaks` reports every link as a
// leak. `pending()` from src/test/pending.ts reads the same at the call site and
// settles the promise in afterEach, once the component is unmounted.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const selfPath = fileURLToPath(import.meta.url);
const srcDir = resolve(dirname(selfPath), '..');

function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const NEVER = /new Promise(?:<[^>]*>)?\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/;

describe('never-resolving promises stay out of the test suite', () => {
  it('no test writes new Promise(() => {}) — use pending() from src/test/pending.ts', () => {
    const offenders: string[] = [];
    for (const file of testFiles(srcDir)) {
      if (file === selfPath) continue; // this guard spells the pattern out on purpose
      const rel = file.slice(srcDir.length + 1);
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (NEVER.test(line)) offenders.push(`${rel}:${i + 1}`);
        });
    }
    expect(
      offenders,
      `These tests create a promise nothing ever settles, which leaks every chain hanging off ` +
        `it past the test. Use pending(value) from src/test/pending.ts instead.\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
