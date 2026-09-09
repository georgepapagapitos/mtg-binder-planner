import { logger } from './logger';

/**
 * Prod uptime heartbeat for a passive monitor (healthchecks.io): alerts fire
 * when the pings STOP, so a dead machine needs no code path at all.
 *
 * What it must not be is a naive "I'm alive" ping. On 2026-08-17 this process
 * was alive and looping while the Fly proxy served 503 for hours — an
 * in-process heartbeat would have stayed green the whole time. So every tick
 * probes the PUBLIC origin the way a user would, and reports what it saw:
 * pass → GET the ping URL; fail → GET <ping>/fail, which alerts immediately
 * instead of waiting out the grace period.
 *
 * `uptime.yml` is the GitHub-cron backstop this replaces — its 5-minute
 * schedule measured ~8 firings a day with multi-hour gaps.
 */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export async function probeAndPing(pingUrl: string, origin: string): Promise<boolean> {
  const ok = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(20_000) })
    .then(async (res) => res.ok && ((await res.json()) as { ok?: unknown }).ok === true)
    .catch(() => false);
  if (!ok) logger.error(`[heartbeat] ${origin}/health did not answer ok — reporting failure`);
  try {
    await fetch(ok ? pingUrl : `${pingUrl}/fail`, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    logger.error('[heartbeat] ping delivery failed:', err);
  }
  return ok;
}

export function scheduleHeartbeat(pingUrl: string, origin: string): void {
  const tick = () => void probeAndPing(pingUrl, origin);
  tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS).unref();
}
