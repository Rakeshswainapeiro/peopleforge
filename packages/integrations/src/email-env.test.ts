import { describe, expect, it } from 'vitest';
import { emailEnvIssues, EmailEnvSchema, emailSenderFromEnv, type EmailEnv } from './email-env.js';

const base = { EMAIL_FROM: 'no-reply@hr.example.ae' };
const parse = (values: Record<string, string>): EmailEnv =>
  EmailEnvSchema.parse({ ...base, ...values });
const keys = (env: EmailEnv, strict = false) =>
  emailEnvIssues(env, strict).map((issue) => `${issue.key}: ${issue.message}`);

describe('email env', () => {
  it('defaults to port 587 with required STARTTLS and the PeopleForge name', () => {
    expect(parse({ EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.ae' })).toMatchObject({
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_REQUIRE_TLS: true,
      SMTP_TIMEOUT_MS: 10_000,
      EMAIL_FROM_NAME: 'PeopleForge',
    });
  });

  it.each([
    { EMAIL_FROM: 'Name <a@b.ae>' },
    { EMAIL_FROM: 'a@b.ae, c@d.ae' },
    { EMAIL_FROM_NAME: 'Evil\r\nBcc: x@y.ae' },
    { EMAIL_TRANSPORT: 'sendmail' },
  ])('refuses %j', (values) => {
    expect(EmailEnvSchema.safeParse({ ...base, EMAIL_TRANSPORT: 'smtp', ...values }).success).toBe(
      false,
    );
  });

  it('needs a folder for files, a host for SMTP, and both credentials or neither', () => {
    expect(keys(parse({ EMAIL_TRANSPORT: 'file' }))).toEqual(['EMAIL_FILE_DIR: required']);
    expect(keys(parse({ EMAIL_TRANSPORT: 'smtp' }))).toEqual(['SMTP_HOST: required']);
    expect(
      keys(parse({ EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.ae', SMTP_USER: 'u' })),
    ).toEqual(['SMTP_PASSWORD: set both SMTP_USER and SMTP_PASSWORD, or neither']);
    expect(
      keys(
        parse({
          EMAIL_TRANSPORT: 'smtp',
          SMTP_HOST: 'smtp.example.ae',
          SMTP_USER: 'u',
          SMTP_PASSWORD: 'p',
        }),
      ),
    ).toEqual([]);
  });

  it('refuses files and unencrypted SMTP in UAT and production', () => {
    expect(keys(parse({ EMAIL_TRANSPORT: 'file', EMAIL_FILE_DIR: '/tmp/mail' }), true)).toEqual([
      'EMAIL_TRANSPORT: smtp only',
    ]);
    const plain = parse({
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'mailpit',
      SMTP_REQUIRE_TLS: 'false',
    });
    expect(keys(plain)).toEqual([]);
    expect(keys(plain, true)).toEqual(['SMTP_REQUIRE_TLS: TLS required']);
    expect(
      keys(
        parse({
          EMAIL_TRANSPORT: 'smtp',
          SMTP_HOST: 'smtp.example.ae',
          SMTP_SECURE: 'true',
          SMTP_REQUIRE_TLS: 'false',
        }),
        true,
      ),
    ).toEqual([]);
  });

  it('builds the configured sender', () => {
    expect(
      emailSenderFromEnv(parse({ EMAIL_TRANSPORT: 'file', EMAIL_FILE_DIR: '/tmp/mail' })).transport,
    ).toBe('file');
    expect(
      emailSenderFromEnv(parse({ EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.ae' }))
        .transport,
    ).toBe('smtp');
  });

  it('guards direct callers that skipped the rules', () => {
    expect(() => emailSenderFromEnv(parse({ EMAIL_TRANSPORT: 'file' }))).toThrow(
      'EMAIL_FILE_DIR is required',
    );
    expect(() => emailSenderFromEnv(parse({ EMAIL_TRANSPORT: 'smtp' }))).toThrow(
      'SMTP_HOST is required',
    );
  });
});
