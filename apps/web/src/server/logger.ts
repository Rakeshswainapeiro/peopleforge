import { createLogger } from '@sirius/utils';
import type { Logger } from 'pino';
import { serverEnv } from './env';

let logger: Logger | undefined;

/** Structured JSON logs with redaction (@sirius/utils). Never log tokens, emails or names. */
export function getLogger(): Logger {
  logger ??= createLogger({ service: 'web', level: serverEnv().LOG_LEVEL });
  return logger;
}
