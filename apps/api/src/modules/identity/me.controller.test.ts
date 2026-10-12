import { UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { MeController } from './me.controller.js';

describe('MeController', () => {
  it('fails closed if reached without a principal (mis-wired middleware)', () => {
    expect(() => new MeController().me({} as IncomingMessage)).toThrow(UnauthorizedException);
  });
});
