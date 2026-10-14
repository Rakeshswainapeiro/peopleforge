import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';

/** The EICAR anti-malware test string: harmless, but every scanner reports it. */
export const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export interface FakeClamd {
  port: number;
  close: () => Promise<void>;
}

/**
 * A minimal clamd for tests and E2E (no ClamAV needed): answers PING and INSTREAM, reporting
 * the EICAR test file as infected. Speaks the real protocol, so it exercises the real adapter.
 */
export async function startFakeClamd(port = 0): Promise<FakeClamd> {
  const server: Server = createServer((socket: Socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.toString('latin1').startsWith('zPING\0')) {
        socket.end('PONG\0');
        return;
      }
      const header = 'zINSTREAM\0';
      if (!buffer.toString('latin1').startsWith(header)) {
        socket.end('UNKNOWN COMMAND\0');
        return;
      }
      let offset = header.length;
      const parts: Buffer[] = [];
      while (offset + 4 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        if (size === 0) {
          const body = Buffer.concat(parts).toString('latin1');
          socket.end(
            body.includes(EICAR) ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0',
          );
          return;
        }
        if (offset + 4 + size > buffer.length) return;
        parts.push(buffer.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    // Listening on TCP, so address() is always an AddressInfo.
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
