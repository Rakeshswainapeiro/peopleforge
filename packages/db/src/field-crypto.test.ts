import { describe, expect, it } from 'vitest';
import { createFieldCipher, FieldCryptoError, parseKeyRing } from './field-crypto.js';

const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');
const context = { table: 'core.employee', column: 'monthly_salary', rowId: 'row-1' };

describe('parseKeyRing', () => {
  it('reads id:base64 pairs and the active key', () => {
    const ring = parseKeyRing(` k1:${key(1)} , k2:${key(2)} ,`, 'k2');
    expect([...ring.keys.keys()]).toEqual(['k1', 'k2']);
    expect(ring.activeKeyId).toBe('k2');
  });

  it.each([
    ['a missing id', `:${key(1)}`, 'k1', 'Malformed key entry'],
    ['an invalid id', `K 1:${key(1)}`, 'K 1', 'Malformed key entry'],
    ['no separator', 'k1', 'k1', 'Malformed key entry'],
    ['a short key', `k1:${Buffer.alloc(16).toString('base64')}`, 'k1', 'Key k1 must be 32 bytes'],
    ['a duplicate id', `k1:${key(1)},k1:${key(2)}`, 'k1', 'Duplicate key k1'],
    ['an unknown active key', `k1:${key(1)}`, 'k9', 'Active key is not in the key ring'],
  ])('refuses %s without echoing key material', (_label, spec, active, message) => {
    expect(() => parseKeyRing(spec, active)).toThrow(new FieldCryptoError(message));
  });
});

describe('createFieldCipher', () => {
  const cipher = createFieldCipher(parseKeyRing(`k1:${key(1)}`, 'k1'));

  it('round-trips a value and never stores it in clear', () => {
    const blob = cipher.encrypt('21500.00', context);
    expect(blob.includes(Buffer.from('21500'))).toBe(false);
    expect(cipher.decrypt(blob, context)).toBe('21500.00');
  });

  it('uses a fresh nonce for every value', () => {
    expect(cipher.encrypt('1', context).equals(cipher.encrypt('1', context))).toBe(false);
  });

  it('refuses a value moved to another row or column', () => {
    const blob = cipher.encrypt('21500.00', context);
    expect(() => cipher.decrypt(blob, { ...context, rowId: 'row-2' })).toThrow(
      'Ciphertext failed authentication',
    );
    expect(() => cipher.decrypt(blob, { ...context, column: 'other' })).toThrow(FieldCryptoError);
  });

  it('refuses a tampered value', () => {
    const blob = cipher.encrypt('21500.00', context);
    blob[blob.length - 20] = (blob[blob.length - 20] ?? 0) ^ 1;
    expect(() => cipher.decrypt(blob, context)).toThrow('Ciphertext failed authentication');
  });

  it('decrypts values written with an older key after rotation', () => {
    const old = cipher.encrypt('9000.00', context);
    const rotated = createFieldCipher(parseKeyRing(`k1:${key(1)},k2:${key(2)}`, 'k2'));
    expect(rotated.decrypt(old, context)).toBe('9000.00');
    const fresh = rotated.encrypt('9500.00', context);
    expect(fresh.subarray(2, 4).toString()).toBe('k2');
    expect(() => cipher.decrypt(fresh, context)).toThrow('Unknown key');
  });

  it.each([
    ['empty', Buffer.alloc(0)],
    ['another format version', Buffer.from([2, 0])],
    ['truncated', Buffer.from([1, 2, 107, 49, 0, 0])],
  ])('refuses %s ciphertext', (_label, blob) => {
    expect(() => cipher.decrypt(blob, context)).toThrow(FieldCryptoError);
  });

  it('refuses to encrypt when the active key is missing', () => {
    const broken = createFieldCipher({ activeKeyId: 'gone', keys: new Map() });
    expect(() => broken.encrypt('1', context)).toThrow('Active key is not in the key ring');
  });
});
