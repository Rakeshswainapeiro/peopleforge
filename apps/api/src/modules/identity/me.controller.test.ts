import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { UnauthenticatedError } from '../../errors/domain-errors.js';
import { MeController } from './me.controller.js';

describe('MeController', () => {
  it('fails closed if reached without a principal (mis-wired middleware)', () => {
    const res = { locals: {} } as Response;
    expect(() => new MeController().me(res)).toThrow(UnauthenticatedError);
  });
});
