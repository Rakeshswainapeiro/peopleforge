import type { LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';

function contextOf(params: readonly unknown[]): string | undefined {
  const last = params.at(-1);
  return typeof last === 'string' ? last : undefined;
}

function textOf(message: unknown): string {
  return typeof message === 'string' ? message : JSON.stringify(message);
}

/**
 * Routes NestJS's internal logging into our structured pino logger, so framework messages
 * get the same JSON format and redaction as everything else. Nest's routine start-up chatter
 * ("Mapped {/health/live, GET} route") goes to debug, not info.
 */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...params: unknown[]): void {
    this.logger.debug({ context: contextOf(params) }, textOf(message));
  }

  error(message: unknown, ...params: unknown[]): void {
    this.logger.error({ context: contextOf(params) }, textOf(message));
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.logger.warn({ context: contextOf(params) }, textOf(message));
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.logger.debug({ context: contextOf(params) }, textOf(message));
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.logger.trace({ context: contextOf(params) }, textOf(message));
  }
}
