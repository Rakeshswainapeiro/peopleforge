import { connect } from 'node:net';
import { describe, expect, it } from 'vitest';
import { startFakeClamd } from './fake-clamd.js';

function send(port: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(payload);
    });
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('end', () => {
      resolve(Buffer.concat(chunks).toString('latin1'));
    });
    socket.on('error', reject);
  });
}

describe('startFakeClamd', () => {
  it('answers unknown commands the way clamd does', async () => {
    const clamd = await startFakeClamd();
    await expect(send(clamd.port, 'zVERSION\0')).resolves.toBe('UNKNOWN COMMAND\0');
    await clamd.close();
  });
});
