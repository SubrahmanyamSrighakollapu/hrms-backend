import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { errorHandler } from '../../src/middleware/error';

const app = createApp();
const base = env.API_PREFIX;

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: { success: boolean; message: string } };
}

/**
 * Regression coverage for the central error handler: framework errors such as
 * body-parser failures must surface as 4xx client errors, not 500s.
 */
describe('error handler', () => {
  it('maps a malformed JSON body to 400', async () => {
    const res = await request(app)
      .post(`${base}/auth/login`)
      .set('Content-Type', 'application/json')
      .send('{ this is not valid json');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Malformed JSON body');
  });

  it('maps a body-parser "too large" error to 413', () => {
    const res = fakeRes();
    const err = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });

    errorHandler(err, {} as Request, res, vi.fn() as unknown as NextFunction);

    expect(res.statusCode).toBe(413);
    expect(res.body.success).toBe(false);
  });

  it('returns a 404 envelope for unknown routes', async () => {
    const res = await request(app).get(`${base}/definitely-not-a-route`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('not found');
  });
});
