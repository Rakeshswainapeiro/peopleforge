import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../test-support/factory.js';
import { PinoNestLogger } from './nest-logger.js';

describe('PinoNestLogger', () => {
  it('maps Nest levels onto pino levels, keeping the context', () => {
    const logger = silentLogger();
    const spies = {
      debug: vi.spyOn(logger, 'debug'),
      error: vi.spyOn(logger, 'error'),
      warn: vi.spyOn(logger, 'warn'),
      trace: vi.spyOn(logger, 'trace'),
    };
    const nest = new PinoNestLogger(logger);

    nest.log('Mapped route', 'RouterExplorer');
    nest.error('boom', 'stack', 'ExceptionHandler');
    nest.warn('careful');
    nest.debug({ detail: 1 }, 'Ctx');
    nest.verbose('very');

    expect(spies.debug).toHaveBeenCalledWith({ context: 'RouterExplorer' }, 'Mapped route');
    expect(spies.error).toHaveBeenCalledWith({ context: 'ExceptionHandler' }, 'boom');
    expect(spies.warn).toHaveBeenCalledWith({ context: undefined }, 'careful');
    expect(spies.debug).toHaveBeenCalledWith({ context: 'Ctx' }, '{"detail":1}');
    expect(spies.trace).toHaveBeenCalledWith({ context: undefined }, 'very');
  });
});
