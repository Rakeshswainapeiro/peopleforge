import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { startFakeSmtp } from './fake-smtp.js';

/** Sends raw lines and collects the replies until the server closes. */
function converse(port: number, lines: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let received = '';
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('utf8');
    });
    socket.on('close', () => {
      resolve(received);
    });
    socket.on('error', reject);
    socket.connect(port, '127.0.0.1', () => {
      // Split across packets, as real clients may.
      const text = lines.map((line) => `${line}\r\n`).join('');
      socket.write(text.slice(0, 7));
      setTimeout(() => socket.write(text.slice(7)), 20);
    });
  });
}

describe('startFakeSmtp', () => {
  it('speaks enough SMTP for a client, including HELO, RSET, NOOP and AUTH without a token', async () => {
    const server = await startFakeSmtp();
    const replies = await converse(server.port, [
      'HELO client',
      'NOOP',
      'RSET',
      'AUTH PLAIN',
      'MAIL FROM:<a@b.ae>',
      'RCPT TO:<c@d.ae>',
      'RCPT TO:no-brackets',
      'MAIL FROM:no-brackets',
      'DATA',
      'Subject: hi',
      '',
      'body',
      '.',
      'QUIT',
    ]);
    expect(replies).toContain('250 fake-smtp');
    expect(replies).toContain('235 Authentication successful');
    expect(replies).toContain('354 End data');
    expect(replies).toContain('221 Bye');
    expect(server.messages).toEqual([
      { from: '', to: [], data: 'Subject: hi\r\n\r\nbody', user: null },
    ]);
    await server.close();
  });

  it('survives a client that resets the connection', async () => {
    const server = await startFakeSmtp();
    await new Promise<void>((resolve) => {
      const socket = new Socket();
      socket.connect(server.port, '127.0.0.1', () => {
        socket.once('data', () => {
          socket.resetAndDestroy();
          setTimeout(resolve, 50);
        });
      });
    });
    const replies = await converse(server.port, ['QUIT']);
    expect(replies).toContain('221 Bye');
    await server.close();
  });
});
