import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/**
 * Paths that must never reach log storage: credentials, session material, and employee
 * compensation/PII (NFR-PRIV-01). pino redacts by path, so new sensitive DTO fields must be
 * added here when they are introduced.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.secret',
  '*.apiKey',
  '*.salary',
  '*.currentSalary',
  '*.proposedAmount',
  '*.proposedPercentage',
  '*.email',
  '*.dateOfBirth',
  '*.nationalId',
  '*.passportNumber',
];

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface CreateLoggerOptions {
  service: string;
  level: LogLevel;
  /** Injectable for tests; defaults to stdout (JSON lines for the log shipper). */
  destination?: DestinationStream;
}

export function createLogger({ service, level, destination }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: { service },
    redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  };
  return destination ? pino(options, destination) : pino(options);
}
