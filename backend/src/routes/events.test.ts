import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { createTestEnv, extractSessionCookie } from '../test-helpers';
import { getDb } from '../db';

let app: Server;
let pool: Pool;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const env = await createTestEnv();
  app = env.app;
  pool = env.pool;
  cleanup = env.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

async function count(name: string, path: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT count FROM event_counts WHERE day = CURRENT_DATE AND name = $1 AND path = $2',
    [name, path]
  );
  return rows[0]?.count ?? 0;
}

describe('POST /api/events', () => {
  it('increments one aggregate counter per (day, name, path) and stores nothing else', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await request(app).post('/api/events').send({ name: 'pageview', path: '/' });
      expect(res.status).toBe(204);
    }
    expect(await count('pageview', '/')).toBe(2);
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'event_counts'`
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(['count', 'day', 'name', 'path']);
  });

  it('drops unknown event names and non-path paths silently', async () => {
    const bad = await request(app).post('/api/events').send({ name: 'evil', path: '/' });
    expect(bad.status).toBe(204);
    const noPath = await request(app).post('/api/events').send({ name: 'sign_in', path: 'x' });
    expect(noPath.status).toBe(204);
    expect(await count('evil', '/')).toBe(0);
    expect(await count('sign_in', 'x')).toBe(0);
  });
});

describe('GET /api/admin/events', () => {
  it('is admin-only and returns the raw daily rows', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ username: 'evadmin', password: 'correct horse battery' });
    expect(reg.status).toBe(201);
    const userCookie = extractSessionCookie(reg.headers['set-cookie'])!;
    expect((await request(app).get('/api/admin/events').set('Cookie', userCookie)).status).toBe(
      403
    );

    await getDb().execute(sql`UPDATE users SET role = 'admin' WHERE username = 'evadmin'`);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'evadmin', password: 'correct horse battery' });
    const admin = extractSessionCookie(login.headers['set-cookie'])!;
    await request(app).post('/api/events').send({ name: 'guide_cta', path: '/guides/' });
    const res = await request(app).get('/api/admin/events?days=7').set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'guide_cta', path: '/guides/', count: 1 }),
      ])
    );
  });
});
