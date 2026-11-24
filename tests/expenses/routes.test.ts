import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';

const app = createApp();
const base = env.API_PREFIX;

/**
 * Lightweight integration coverage: the expenses router is mounted and every
 * endpoint sits behind the auth + permission guard. These requests never touch
 * the database because they are rejected before the controllers run.
 */
describe('expenses routes — auth guard', () => {
  it('rejects an unauthenticated claims list', async () => {
    const res = await request(app).get(`${base}/expenses`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
  });

  it('rejects an unauthenticated stats request', async () => {
    const res = await request(app).get(`${base}/expenses/stats`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects an unauthenticated categories request', async () => {
    const res = await request(app).get(`${base}/expenses/categories`);
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated claim creation', async () => {
    const res = await request(app)
      .post(`${base}/expenses`)
      .send({ title: 'Sneaky claim', items: [] });
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated receipt upload', async () => {
    const res = await request(app).post(`${base}/expenses/claim-1/items/item-1/receipt`);
    expect(res.status).toBe(401);
  });
});
