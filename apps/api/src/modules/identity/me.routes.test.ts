import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../http/error-handler.js';
import { errorOf, silentLogger } from '../../test-support/factory.js';
import { meRouter } from './me.routes.js';

describe('meRouter', () => {
  it('refuses to answer if mounted without authentication in front of it', async () => {
    // Defence in depth: a mis-wired router must fail closed, not return an empty identity.
    const app = express();
    app.use(meRouter());
    app.use(createErrorHandler(silentLogger()));

    const res = await request(app).get('/me');

    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });
});
