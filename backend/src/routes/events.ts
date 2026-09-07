import { Router, type Request, type Response } from 'express';
import { getPool } from '../db';
import { logger } from '../logger';
import { testAwareLimiter } from '../route-utils';

/**
 * First-party, cookieless usage beacon. The client sends `{ name, path }`
 * and the server bumps one aggregate counter per (day, name, path). Nothing
 * per-visitor is stored — no IP, user agent, user id, or session — so this
 * cannot identify anyone and needs no consent banner. Always 204: a beacon
 * is zero-information to its caller (mirrors the public view beacon).
 */
export const eventsRouter: Router = Router();

export const EVENT_NAMES = new Set([
  'pageview',
  'import_started',
  'sample_loaded',
  'browse_decks',
  'sign_in',
  'guide_cta',
]);

const beaconLimiter = testAwareLimiter({ windowMs: 60_000, max: 60 });

eventsRouter.post('/', beaconLimiter, async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  const path = typeof req.body?.path === 'string' ? req.body.path.slice(0, 200) : '';
  if (!EVENT_NAMES.has(name) || !path.startsWith('/')) {
    res.status(204).end();
    return;
  }
  await getPool()
    .query(
      `INSERT INTO event_counts (day, name, path, count)
         VALUES (CURRENT_DATE, $1, $2, 1)
         ON CONFLICT (day, name, path) DO UPDATE SET count = event_counts.count + 1`,
      [name, path]
    )
    .catch((err) => logger.warn('[events] beacon insert failed', err));
  res.status(204).end();
});
