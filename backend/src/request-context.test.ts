import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { attachRequestId, unhandledErrorHandler } from './request-context';

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeApp() {
  const app = express();
  app.use(attachRequestId);
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  app.use(unhandledErrorHandler);
  return app;
}

describe('attachRequestId', () => {
  it('echoes a generated id as X-Request-Id on an ordinary response', async () => {
    const res = await request(makeApp()).get('/ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('honors an incoming fly-request-id header instead of generating one', async () => {
    const res = await request(makeApp()).get('/ok').set('fly-request-id', 'fly-abc-123');
    expect(res.headers['x-request-id']).toBe('fly-abc-123');
  });
});

describe('unhandledErrorHandler', () => {
  it('returns the same request id in the 500 body that was echoed in the header', async () => {
    const res = await request(makeApp()).get('/boom').set('fly-request-id', 'fly-boom-1');
    expect(res.status).toBe(500);
    expect(res.headers['x-request-id']).toBe('fly-boom-1');
    expect(res.body.requestId).toBe('fly-boom-1');
    expect(res.body.error).toMatch(/went wrong/i);
  });
});
