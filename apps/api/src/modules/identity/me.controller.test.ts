import { UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { fakeDirectory, silentLogger } from '../../test-support/factory.js';
import { MeController } from './me.controller.js';

describe('MeController', () => {
  it('fails closed if reached without a principal (mis-wired middleware)', async () => {
    const controller = new MeController(fakeDirectory(), silentLogger());
    await expect(controller.me({} as IncomingMessage)).rejects.toThrow(UnauthorizedException);
  });
});
