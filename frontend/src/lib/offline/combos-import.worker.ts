import { importCombos } from './combos-import';

/**
 * The combo dataset import, off the main thread. 107k rows / 163 MB parsed
 * and written to IndexedDB used to run on the page that needed combos — the
 * first deck view after every nightly dataset refresh froze for 10–40 s on a
 * phone (measured 2026-09-09). fetch and IndexedDB both work in a worker;
 * the version stamp is still written by the caller, after this reports.
 */
self.onmessage = async (e: MessageEvent<{ version: string }>) => {
  try {
    const { count } = await importCombos(undefined, e.data.version);
    self.postMessage({ ok: true, count });
  } catch (err) {
    self.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
