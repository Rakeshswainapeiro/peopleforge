import { afterEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../test-support/factory.js';
import { createShutdown, type Closable } from './shutdown.js';

const closingServer = (error?: Error): Closable => ({
  close: (callback) => {
    callback(error);
  },
});

const hangingServer: Closable = { close: () => undefined };

afterEach(() => {
  vi.useRealTimers();
});

describe('createShutdown', () => {
  it('drains, closes dependencies and exits 0', async () => {
    const exit = vi.fn();
    const onClose = vi.fn(() => Promise.resolve());
    const lifecycle = createShutdown({
      server: closingServer(),
      logger: silentLogger(),
      timeoutMs: 1000,
      exit,
      onClose,
    });

    expect(lifecycle.isShuttingDown()).toBe(false);
    await lifecycle.shutdown('SIGTERM');

    expect(lifecycle.isShuttingDown()).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('works without extra resources to close', async () => {
    const exit = vi.fn();
    const lifecycle = createShutdown({
      server: closingServer(),
      logger: silentLogger(),
      timeoutMs: 1000,
      exit,
    });
    await lifecycle.shutdown('SIGINT');
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('ignores repeated signals', async () => {
    const exit = vi.fn();
    const lifecycle = createShutdown({
      server: closingServer(),
      logger: silentLogger(),
      timeoutMs: 1000,
      exit,
    });
    await Promise.all([lifecycle.shutdown('SIGTERM'), lifecycle.shutdown('SIGTERM')]);
    expect(exit).toHaveBeenCalledOnce();
  });

  it('exits 1 when the server fails to close', async () => {
    const exit = vi.fn();
    const lifecycle = createShutdown({
      server: closingServer(new Error('close failed')),
      logger: silentLogger(),
      timeoutMs: 1000,
      exit,
    });
    await lifecycle.shutdown('SIGTERM');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('forces exit 1 when draining exceeds the deadline', () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const lifecycle = createShutdown({
      server: hangingServer,
      logger: silentLogger(),
      timeoutMs: 5000,
      exit,
    });

    void lifecycle.shutdown('SIGTERM');
    vi.advanceTimersByTime(4999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
