import { Router } from 'express';
import { UnauthenticatedError } from '../../errors/domain-errors.js';
import { getPrincipal } from '../../http/locals.js';

/**
 * GET /api/v1/me — the caller's identity and data scope, used by the web app to decide what to
 * render. Authorisation decisions are always re-made server-side (R1-01, R2-12).
 */
export function meRouter(): Router {
  const router = Router();

  router.get('/me', (_req, res) => {
    const principal = getPrincipal(res);
    if (principal === undefined) {
      throw new UnauthenticatedError('Authentication required');
    }
    res.json(principal);
  });

  return router;
}
