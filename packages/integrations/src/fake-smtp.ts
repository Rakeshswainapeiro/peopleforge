import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';

export interface CapturedEmail {
  from: string;
  to: string[];
  /** The raw message (headers and body) as received. */
  data: string;
  /** Who authenticated, if anyone (AUTH PLAIN). */
  user: string | null;
}

export interface FakeSmtpOptions {
  /** Reply with this code to RCPT TO (e.g. 550 refuses the address, 451 asks to retry). */
  rcptReply?: number;
  /** Accept the connection but never greet: the client's timeout must fire. */
  silent?: boolean;
}

export interface FakeSmtp {
  port: number;
  messages: CapturedEmail[];
  close: () => Promise<void>;
}

const ADDRESS = /<([^>]*)>/u;

/**
 * A minimal SMTP server for tests (no Mailpit or provider needed): EHLO, AUTH PLAIN, MAIL,
 * RCPT, DATA, RSET, NOOP, QUIT. Speaks the real protocol, so the real adapter is exercised.
 * Plain TCP only: TLS is the real provider's job and is refused by config outside dev/test.
 */
export async function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
  const messages: CapturedEmail[] = [];
  const server: Server = createServer((socket: Socket) => {
    if (options.silent === true) return;
    let from = '';
    let to: string[] = [];
    let user: string | null = null;
    let inData = false;
    let buffer = '';
    let data = '';
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply('220 fake-smtp ESMTP');
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          messages.push({ from, to, data, user });
          reply(`250 OK queued as <${String(messages.length)}@fake-smtp>`);
          continue;
        }
        const end = buffer.indexOf('\r\n');
        if (end === -1) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO') {
          reply('250-fake-smtp');
          reply('250-AUTH PLAIN');
          reply('250 8BITMIME');
        } else if (verb === 'HELO') {
          reply('250 fake-smtp');
        } else if (verb === 'AUTH') {
          const [, , token = ''] = line.split(' ');
          user = Buffer.from(token, 'base64').toString('utf8').split('\0')[1] ?? null;
          reply('235 Authentication successful');
        } else if (verb === 'MAIL') {
          from = ADDRESS.exec(line)?.[1] ?? '';
          to = [];
          reply('250 OK');
        } else if (verb === 'RCPT') {
          const code = options.rcptReply ?? 250;
          if (code === 250) to.push(ADDRESS.exec(line)?.[1] ?? '');
          reply(code === 250 ? '250 OK' : `${String(code)} Refused for test`);
        } else if (verb === 'DATA') {
          inData = true;
          data = '';
          reply('354 End data with <CR><LF>.<CR><LF>');
        } else if (verb === 'QUIT') {
          reply('221 Bye');
          socket.end();
          return;
        } else {
          // RSET, NOOP and anything else.
          reply('250 OK');
        }
      }
    });
    socket.on('error', () => undefined);
  });
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    // Listening on TCP, so address() is always an AddressInfo.
    port: (server.address() as AddressInfo).port,
    messages,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
}
