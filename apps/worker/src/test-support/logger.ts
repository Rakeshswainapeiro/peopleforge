import { Writable } from 'node:stream';
import { pino, type Logger } from 'pino';

export interface CapturedLogger {
  logger: Logger;
  /** Parsed JSON log lines, oldest first. */
  lines: () => Record<string, unknown>[];
}

/** A real pino logger whose output is kept for assertions instead of printed. */
export function captureLogger(): CapturedLogger {
  const raw: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      raw.push(chunk.toString('utf8'));
      callback();
    },
  });
  const logger = pino({ level: 'debug' }, destination);
  return {
    logger,
    lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
