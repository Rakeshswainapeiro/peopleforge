import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for salary and compensation values (ADR-008): AES-256-GCM, a random
 * 96-bit nonce per value, and the table/column/row as associated data so a ciphertext moved to
 * another row or column fails to decrypt.
 *
 * Layout: version (1) | key-id length (1) | key id | nonce (12) | ciphertext | tag (16)
 */
export interface FieldContext {
  table: string;
  column: string;
  rowId: string;
}

export interface KeyRing {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

export interface FieldCipher {
  encrypt: (plaintext: string, context: FieldContext) => Buffer;
  decrypt: (blob: Buffer, context: FieldContext) => string;
}

export class FieldCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldCryptoError';
  }
}

const FORMAT_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/**
 * Parses `DATA_ENCRYPTION_KEYS` ("id:base64,id:base64"). Values are never echoed in errors.
 */
export function parseKeyRing(spec: string, activeKeyId: string): KeyRing {
  const keys = new Map<string, Buffer>();
  for (const entry of spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf(':');
    const id = entry.slice(0, separator);
    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (separator < 1 || !KEY_ID.test(id)) throw new FieldCryptoError('Malformed key entry');
    if (key.length !== KEY_BYTES) throw new FieldCryptoError(`Key ${id} must be 32 bytes`);
    if (keys.has(id)) throw new FieldCryptoError(`Duplicate key ${id}`);
    keys.set(id, key);
  }
  if (!keys.has(activeKeyId)) throw new FieldCryptoError('Active key is not in the key ring');
  return { activeKeyId, keys };
}

function associatedData(context: FieldContext): Buffer {
  return Buffer.from(`${context.table}:${context.column}:${context.rowId}`, 'utf8');
}

export function createFieldCipher(ring: KeyRing): FieldCipher {
  return {
    encrypt(plaintext, context) {
      const key = ring.keys.get(ring.activeKeyId);
      if (key === undefined) throw new FieldCryptoError('Active key is not in the key ring');
      const keyId = Buffer.from(ring.activeKeyId, 'utf8');
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(associatedData(context));
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return Buffer.concat([
        Buffer.from([FORMAT_VERSION, keyId.length]),
        keyId,
        nonce,
        body,
        cipher.getAuthTag(),
      ]);
    },

    decrypt(blob, context) {
      if (blob.length < 2 || blob[0] !== FORMAT_VERSION) {
        throw new FieldCryptoError('Unsupported ciphertext');
      }
      const idLength = blob.readUInt8(1); // length checked above
      const keyId = blob.subarray(2, 2 + idLength).toString('utf8');
      const key = ring.keys.get(keyId);
      if (key === undefined) throw new FieldCryptoError('Unknown key');
      const nonceStart = 2 + idLength;
      const bodyStart = nonceStart + NONCE_BYTES;
      const tagStart = blob.length - TAG_BYTES;
      if (tagStart < bodyStart) throw new FieldCryptoError('Unsupported ciphertext');

      const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(nonceStart, bodyStart));
      decipher.setAAD(associatedData(context));
      decipher.setAuthTag(blob.subarray(tagStart));
      try {
        return Buffer.concat([
          decipher.update(blob.subarray(bodyStart, tagStart)),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Wrong key, tampered value, or a value copied from another row/column.
        throw new FieldCryptoError('Ciphertext failed authentication');
      }
    },
  };
}
