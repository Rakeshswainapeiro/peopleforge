import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  classifySmtpError,
  createFileSender,
  createSmtpSender,
  isMailbox,
  type OutgoingEmail,
  type SmtpOptions,
} from './email-sender.js';
import { EmailDeliveryError, IntegrationError } from './errors.js';
import { startFakeSmtp, type FakeSmtp } from './fake-smtp.js';

const FROM = { address: 'no-reply@hr.example.ae', name: 'PeopleForge' };
const EMAIL: OutgoingEmail = {
  to: 'pf.alpha.hr@sirius.local',
  subject: 'INC-2026-0001 submitted to Sirius HR',
  text: 'Plain text — مرحبا',
  html: '<p>HTML</p>',
};

const smtp = (server: FakeSmtp, overrides: Partial<SmtpOptions> = {}) =>
  createSmtpSender({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
    requireTls: false,
    timeoutMs: 2_000,
    from: FROM,
    ...overrides,
  });

async function deliveryError(work: Promise<unknown>): Promise<EmailDeliveryError> {
  try {
    await work;
  } catch (error: unknown) {
    if (error instanceof EmailDeliveryError) return error;
    throw error;
  }
  throw new Error('expected an EmailDeliveryError');
}

describe('isMailbox', () => {
  it.each([
    ['pf.alpha.hr@sirius.local', true],
    ['first.last+hr@sub.example.ae', true],
    ['a@b', false],
    ['two@a.ae, three@b.ae', false],
    ['victim@a.ae\r\nBcc: x@y.ae', false],
    ['Name <a@b.ae>', false],
    [`${'x'.repeat(65)}@a.ae`, false],
  ])('%j → %s', (value, expected) => {
    expect(isMailbox(value)).toBe(expected);
  });
});

describe('classifySmtpError', () => {
  it.each([
    [{ responseCode: 550 }, 'smtp_550', true],
    [{ responseCode: 451 }, 'smtp_451', false],
    [{ responseCode: 250 }, 'unknown', false],
    [{ code: 'EAUTH', responseCode: 535 }, 'smtp_auth', false],
    [{ code: 'ETIMEDOUT' }, 'timeout', false],
    [{ code: 'ECONNECTION' }, 'connection', false],
    [{ code: 'ESOCKET' }, 'connection', false],
    [{ code: 'EDNS' }, 'connection', false],
    [new Error('anything'), 'unknown', false],
    ['not an object', 'unknown', false],
    [null, 'unknown', false],
    [new IntegrationError('email', 'Circuit open'), 'circuit_open', false],
  ])('%j → %s', (error, reason, permanent) => {
    expect(classifySmtpError(error)).toMatchObject({ reason, permanent });
  });

  it('passes an EmailDeliveryError through', () => {
    const error = new EmailDeliveryError('invalid_address', true);
    expect(classifySmtpError(error)).toBe(error);
  });
});

describe('createSmtpSender (contract test against a real SMTP conversation)', () => {
  let server: FakeSmtp;

  beforeAll(async () => {
    server = await startFakeSmtp();
  });

  afterAll(async () => {
    await server.close();
  });

  it('sends one email from the configured sender, text and HTML, UTF-8', async () => {
    const sender = smtp(server);
    expect(sender.transport).toBe('smtp');
    await expect(sender.ping()).resolves.toBeUndefined();
    const { messageId } = await sender.send(EMAIL);
    expect(messageId).toMatch(/^<.+>$/u);
    const message = server.messages.at(-1);
    expect(message).toMatchObject({
      from: 'no-reply@hr.example.ae',
      to: ['pf.alpha.hr@sirius.local'],
      user: null,
    });
    expect(message?.data).toContain('From: PeopleForge <no-reply@hr.example.ae>');
    expect(message?.data).toContain('Subject: INC-2026-0001 submitted to Sirius HR');
    expect(message?.data).toContain('multipart/alternative');
    expect(message?.data).toContain('text/html');
  });

  it('authenticates when credentials are configured', async () => {
    await smtp(server, { user: 'smtp-user', password: 'smtp-secret' }).send(EMAIL);
    expect(server.messages.at(-1)?.user).toBe('smtp-user');
    // A user without a password is not a login (the env rules refuse it anyway).
    await smtp(server, { user: 'no-password' }).send(EMAIL);
    expect(server.messages.at(-1)?.user).toBeNull();
  });

  it.each([
    [{ ...EMAIL, to: 'a@b.ae\r\nBcc: spy@evil.example' }, 'invalid_address'],
    [{ ...EMAIL, subject: 'Hi\r\nBcc: spy@evil.example' }, 'invalid_subject'],
    [{ ...EMAIL, subject: 'x'.repeat(201) }, 'invalid_subject'],
  ])('refuses header injection before connecting (%#)', async (email, reason) => {
    const before = server.messages.length;
    await expect(deliveryError(smtp(server).send(email))).resolves.toMatchObject({
      reason,
      permanent: true,
    });
    expect(server.messages).toHaveLength(before);
  });

  it('reports a refused address as permanent, and keeps the circuit closed', async () => {
    const refusing = await startFakeSmtp({ rcptReply: 550 });
    const sender = smtp(refusing);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(deliveryError(sender.send(EMAIL))).resolves.toMatchObject({
        reason: 'smtp_550',
        permanent: true,
      });
    }
    await expect(sender.ping()).resolves.toBeUndefined();
    await refusing.close();
  });

  it('reports a temporary refusal so the email is retried', async () => {
    const busy = await startFakeSmtp({ rcptReply: 451 });
    await expect(deliveryError(smtp(busy).send(EMAIL))).resolves.toMatchObject({
      reason: 'smtp_451',
      permanent: false,
    });
    await busy.close();
  });

  it('times out on a server that never answers, then fails fast once the circuit opens', async () => {
    const silent = await startFakeSmtp({ silent: true });
    const sender = smtp(silent, { timeoutMs: 1_000 });
    await expect(deliveryError(sender.ping())).resolves.toMatchObject({ reason: 'timeout' });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(deliveryError(sender.send(EMAIL))).resolves.toMatchObject({
        permanent: false,
      });
    }
    await expect(deliveryError(sender.send(EMAIL))).resolves.toMatchObject({
      reason: 'circuit_open',
    });
    await silent.close();
  }, 15_000);

  it('reports a server that is down as a connection failure', async () => {
    const gone = await startFakeSmtp();
    const sender = smtp(gone);
    await gone.close();
    await expect(deliveryError(sender.send(EMAIL))).resolves.toMatchObject({
      reason: 'connection',
      permanent: false,
    });
  });
});

describe('createFileSender (dev/test)', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'pf-mail-'));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes each email as a private .eml file with a generated name', async () => {
    const folder = path.join(directory, 'out');
    const sender = createFileSender(folder, FROM);
    expect(sender.transport).toBe('file');
    await expect(sender.ping()).resolves.toBeUndefined();
    const { messageId } = await sender.send(EMAIL);
    expect(messageId).toMatch(/^<.+>$/u);
    const [file] = await readdir(folder);
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+\.\d+Z-[0-9a-f-]{36}\.eml$/u);
    const body = await readFile(path.join(folder, file ?? ''), 'utf8');
    expect(body).toContain('To: pf.alpha.hr@sirius.local');
    expect((await stat(path.join(folder, file ?? ''))).mode & 0o777).toBe(0o600);
  });

  it('refuses header injection', async () => {
    await expect(
      deliveryError(createFileSender(directory, FROM).send({ ...EMAIL, to: 'x' })),
    ).resolves.toMatchObject({ reason: 'invalid_address' });
  });

  it('reports a folder it cannot write to', async () => {
    const blocker = path.join(directory, 'not-a-folder');
    await writeFile(blocker, 'file');
    const sender = createFileSender(path.join(blocker, 'mail'), FROM);
    await expect(deliveryError(sender.ping())).resolves.toMatchObject({
      reason: 'file_unwritable',
    });
    await expect(deliveryError(sender.send(EMAIL))).resolves.toMatchObject({
      reason: 'file_unwritable',
      permanent: false,
    });
  });
});
