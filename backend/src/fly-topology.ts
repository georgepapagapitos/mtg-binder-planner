import dns from 'dns';
import { logger } from './logger';

/**
 * The backend is single-machine by construction: the Scryfall SQLite cache
 * lives on a Fly volume (one machine), and the online table's realtime
 * registry — subscribers, published boards, consent requests, presence — is
 * in-process (see routes/games.ts). A second machine would not crash
 * anything; it would split-brain the table silently. Nothing in `fly.toml`
 * can forbid `fly scale count 2`, so this makes it loud instead: Fly's 6PN
 * DNS returns one AAAA record per running machine for `<app>.internal`, so
 * more than one address means more than one machine. Checked at boot and
 * every few minutes; logs at error level (the log shipper alerts on those)
 * and otherwise does nothing. No-op outside Fly.
 */
export function warnIfMultiMachine(intervalMs = 5 * 60_000): void {
  const app = process.env.FLY_APP_NAME;
  if (!app) return;
  const check = async () => {
    try {
      const addrs = await dns.promises.resolve6(`${app}.internal`);
      if (addrs.length > 1) {
        logger.error(
          `[topology] ${addrs.length} machines running for ${app} — realtime tables and the SQLite cache are single-machine; scale back to 1 (fly scale count 1)`
        );
      }
    } catch {
      /* DNS hiccup — try again next tick */
    }
  };
  void check();
  setInterval(() => void check(), intervalMs).unref();
}
