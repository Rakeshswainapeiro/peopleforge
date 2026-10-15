import { randomUUID } from 'node:crypto';
import { access, constants, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { createCircuitBreaker } from './circuit-breaker.js';
import { EmailDeliveryError, IntegrationError } from './errors.js';

/** One email to one person or mailbox. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends notification emails (R1-07, R1-13); every failure is an EmailDeliveryError. */
export interface EmailSender {
  /** `smtp` (the approved provider, A6) or `file` (.eml files, dev/test only). */
  transport: 'smtp' | 'file';
  send: (email: OutgoingEmail) => Promise<{ messageId: string }>;
  /** Readiness: the server answers (smtp) or the folder is writable (file). */
  ping: () => Promise<void>;
}

export interface Sender {
  address: string;
  name: string;
}

export interface SmtpOptions {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (port 465). */
  secure: boolean;
  /** Refuse to send unless the server upgrades with STARTTLS (port 587). */
  requireTls: boolean;
  user?: string | undefined;
  password?: string | undefined;
  timeoutMs: number;
  from: Sender;
}

// One mailbox, no display name, no line breaks or separators: nothing that could add a header
// or a second recipient.
const MAILBOX = /^[^\s@<>()",;:\\]{1,64}@[^\s@<>()",;:\\]{1,255}\.[^\s@<>()",;:\\]{2,63}$/u;
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const CONTROL = /[\u0000-\u001f\u007f]/u;

export function isMailbox(value: string): boolean {
  return value.length <= 320 && MAILBOX.test(value);
}

/** Header injection guard: the recipient is one plain address, the subject one line. */
function checked(email: OutgoingEmail): OutgoingEmail {
  if (!isMailbox(email.to)) throw new EmailDeliveryError('invalid_address', true);
  if (CONTROL.test(email.subject) || email.subject.length > 200) {
    throw new EmailDeliveryError('invalid_subject', true);
  }
  return email;
}

interface SmtpFailure {
  code?: unknown;
  responseCode?: unknown;
}

/**
 * What a failure means for the outbox. An SMTP 5xx refuses this email for good (unknown
 * mailbox); 4xx and network trouble may pass. A refused login is our configuration: retry, so
 * the email goes once the credentials are fixed. Only codes are kept, never the server text.
 */
export function classifySmtpError(error: unknown): EmailDeliveryError {
  if (error instanceof EmailDeliveryError) return error;
  if (error instanceof IntegrationError) return new EmailDeliveryError('circuit_open', false);
  const { code, responseCode } = (
    typeof error === 'object' && error !== null ? error : {}
  ) as SmtpFailure;
  if (code === 'EAUTH') return new EmailDeliveryError('smtp_auth', false);
  if (typeof responseCode === 'number' && responseCode >= 400 && responseCode < 600) {
    return new EmailDeliveryError(`smtp_${String(responseCode)}`, responseCode >= 500);
  }
  if (code === 'ETIMEDOUT') return new EmailDeliveryError('timeout', false);
  if (code === 'ECONNECTION' || code === 'ESOCKET' || code === 'EDNS') {
    return new EmailDeliveryError('connection', false);
  }
  return new EmailDeliveryError('unknown', false);
}

const SAFE_DEFAULTS = {
  // Content is ours, but never let a message pull in local files or URLs.
  disableFileAccess: true,
  disableUrlAccess: true,
  logger: false,
  debug: false,
} as const;

/**
 * SMTP to the approved provider (A6): TLS 1.2+ (implicit or required STARTTLS outside
 * dev/test, enforced by the env rules), timeouts on connect, greeting and socket, and a
 * circuit breaker so a provider outage doesn't hold every email for the full timeout.
 * A refused address does not count against the provider.
 */
export function createSmtpSender(options: SmtpOptions): EmailSender {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    requireTLS: options.requireTls,
    ignoreTLS: !options.secure && !options.requireTls,
    // Both or neither (the env rules refuse one without the other).
    ...(options.user === undefined || options.password === undefined
      ? {}
      : { auth: { user: options.user, pass: options.password } }),
    connectionTimeout: options.timeoutMs,
    greetingTimeout: options.timeoutMs,
    socketTimeout: options.timeoutMs,
    tls: { minVersion: 'TLSv1.2' },
    ...SAFE_DEFAULTS,
  });
  const breaker = createCircuitBreaker({ dependency: 'email' });
  return {
    transport: 'smtp',
    send: async (email) => {
      const message = checked(email);
      const outcome = await breaker(async () => {
        try {
          const info = await transporter.sendMail({ from: options.from, ...message });
          return { messageId: info.messageId };
        } catch (error: unknown) {
          const failure = classifySmtpError(error);
          // This address was refused: the provider works, so the circuit stays closed.
          if (failure.permanent) return { failure };
          throw failure;
        }
      }).catch((error: unknown) => {
        throw classifySmtpError(error);
      });
      if ('failure' in outcome) throw outcome.failure;
      return outcome;
    },
    ping: () =>
      breaker(async () => {
        await transporter.verify();
      }).catch((error: unknown) => {
        throw classifySmtpError(error);
      }),
  };
}

/**
 * Development and tests: each email is written as an .eml file (open it in any mail client)
 * instead of being sent. Refused in UAT and production by the env rules.
 */
export function createFileSender(directory: string, from: Sender): EmailSender {
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
    ...SAFE_DEFAULTS,
  });
  return {
    transport: 'file',
    send: async (email) => {
      const message = checked(email);
      const info = await transporter.sendMail({ from, ...message });
      // The name is ours (time + random), never derived from the message.
      const name = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.eml`;
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- configured directory
        await mkdir(directory, { recursive: true });
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- configured directory, generated name
        await writeFile(path.join(directory, name), info.message, { mode: 0o600 });
      } catch {
        throw new EmailDeliveryError('file_unwritable', false);
      }
      return { messageId: info.messageId };
    },
    ping: async () => {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- configured directory
        await mkdir(directory, { recursive: true });
        await access(directory, constants.W_OK);
      } catch {
        throw new EmailDeliveryError('file_unwritable', false);
      }
    },
  };
}
