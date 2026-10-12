import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, neutraliseFormula, normaliseText } from './index.js';

function captureStream(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('createLogger', () => {
  it('emits structured JSON with service, string level and ISO time', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({ service: 'api', level: 'info', destination: stream });

    logger.info({ requestId: 'r-1' }, 'hello');

    const [entry] = lines();
    expect(entry).toMatchObject({ service: 'api', level: 'info', requestId: 'r-1', msg: 'hello' });
    expect(typeof entry?.time).toBe('string');
  });

  it('redacts credentials and compensation fields', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({ service: 'api', level: 'info', destination: stream });

    logger.info({
      req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1' } },
      employee: { salary: '25000.00', email: 'a@b.c', name: 'kept' },
      auth: { accessToken: 'tok' },
    });

    const serialised = JSON.stringify(lines()[0]);
    expect(serialised).not.toContain('Bearer abc');
    expect(serialised).not.toContain('sid=1');
    expect(serialised).not.toContain('25000.00');
    expect(serialised).not.toContain('a@b.c');
    expect(serialised).not.toContain('tok');
    expect(serialised).toContain('kept');
  });

  it('respects the configured level', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({ service: 'api', level: 'warn', destination: stream });
    logger.info('dropped');
    logger.warn('kept');
    expect(lines().map((l) => l.msg)).toEqual(['kept']);
  });

  it('defaults to stdout when no destination is injected', () => {
    const logger = createLogger({ service: 'api', level: 'silent' });
    expect(logger.level).toBe('silent');
  });
});

describe('neutraliseFormula', () => {
  it.each(['=SUM(A1)', '+1', '-1+1', '@cmd', '\tx', '\rx'])('neutralises %j', (value) => {
    expect(neutraliseFormula(value)).toBe(`'${value}`);
  });

  it.each(['Ahmed', 'محمد', '', '1=1', 'a-b'])('leaves safe text %j unchanged', (value) => {
    expect(neutraliseFormula(value)).toBe(value);
  });
});

describe('normaliseText', () => {
  it('trims and composes to NFC', () => {
    const decomposed = 'José';
    expect(normaliseText(`  ${decomposed}  `)).toBe('José');
  });

  it('preserves Arabic text', () => {
    expect(normaliseText(' عبدالله ')).toBe('عبدالله');
  });
});
