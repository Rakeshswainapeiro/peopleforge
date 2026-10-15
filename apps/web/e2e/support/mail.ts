import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { E2E } from './env';

export interface Email {
  to: string;
  subject: string;
  raw: string;
  /** The message with quoted-printable decoded. */
  text: string;
}

/** Undoes quoted-printable (soft line breaks, =XX bytes) so tests can search the text. */
function decoded(raw: string): string {
  const soft = raw.replace(/=\r?\n/gu, '');
  const bytes: number[] = [];
  for (let index = 0; index < soft.length; index += 1) {
    const hex =
      soft.charAt(index) === '=' ? /^[0-9A-F]{2}$/u.exec(soft.slice(index + 1, index + 3)) : null;
    if (hex === null) {
      bytes.push(...Buffer.from(soft.charAt(index), 'utf8'));
    } else {
      bytes.push(Number.parseInt(hex[0], 16));
      index += 2;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const TO = /^To: (.*)$/mu;
const SUBJECT = /^Subject: (.*)$/mu;

/** Every email the worker has written so far (.eml files, EMAIL_TRANSPORT=file). */
async function emails(): Promise<Email[]> {
  let files: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the test's own folder
    files = await readdir(E2E.emailDir);
  } catch {
    return [];
  }
  return Promise.all(
    files
      .filter((file) => file.endsWith('.eml'))
      .map(async (file) => {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- names listed above
        const raw = await readFile(path.join(E2E.emailDir, file), 'utf8');
        return {
          to: TO.exec(raw)?.[1]?.trim() ?? '',
          subject: SUBJECT.exec(raw)?.[1]?.trim() ?? '',
          raw,
          text: decoded(raw),
        };
      }),
  );
}

/** Waits for the worker to send an email to `to` whose subject contains `text`. */
export async function waitForEmail(to: string, text: string): Promise<Email> {
  let found: Email | undefined;
  await expect
    .poll(
      async () => {
        found = (await emails()).find((email) => email.to === to && email.subject.includes(text));
        return found !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  if (found === undefined) throw new Error(`No email to ${to} about ${text}`);
  return found;
}
