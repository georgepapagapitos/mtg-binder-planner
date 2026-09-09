import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Serve build-time pre-compressed static assets.
 *
 * The frontend build writes a `.br` and a `.gz` beside every text asset
 * (frontend/scripts/precompress-dist.mjs). This middleware runs ahead of
 * `express.static` and, when the client accepts brotli or gzip and the
 * sibling file exists, rewrites the request to it and sets the headers the
 * static handler would otherwise get wrong: `Content-Type` of the ORIGINAL
 * file (send() keeps an already-set type), `Content-Encoding`, and `Vary`.
 *
 * Why: there is no compression middleware in this app, so the Fly edge proxy
 * compressed on the fly at its cheapest setting — the CSS bundle came down at
 * 170 KB gzipped where a build-time gzip -6 is 98 KB and brotli 11 is ~80 KB.
 * Compressing once at build time is both smaller and free at request time.
 *
 * Existence checks are cached per path: the bundle is immutable for the
 * process's lifetime, and a miss is as cacheable as a hit.
 */
const TEXT_ASSET = /\.(js|mjs|css|json|svg|txt|xml|map)$/;
const ENCODINGS: readonly [encoding: string, suffix: string][] = [
  ['br', '.br'],
  ['gzip', '.gz'],
];

export function precompressed(root: string): RequestHandler {
  const known = new Map<string, boolean>();
  const exists = (rel: string): boolean => {
    let hit = known.get(rel);
    if (hit === undefined) {
      hit = existsSync(path.join(root, rel));
      known.set(rel, hit);
    }
    return hit;
  };
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    if (!TEXT_ASSET.test(p) || decodeURIComponent(p).includes('..')) return next();
    const accept = String(req.headers['accept-encoding'] ?? '');
    for (const [encoding, suffix] of ENCODINGS) {
      if (!accept.includes(encoding) || !exists(p + suffix)) continue;
      res.type(path.extname(p));
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      req.url = p + suffix + req.url.slice(p.length);
      break;
    }
    next();
  };
}
