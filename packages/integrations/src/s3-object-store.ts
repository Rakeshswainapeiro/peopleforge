import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { createCircuitBreaker } from './circuit-breaker.js';
import { IntegrationError } from './errors.js';
import { assertSafeKey, type ObjectStore } from './object-store.js';

export interface S3ObjectStoreOptions {
  bucket: string;
  region: string;
  /** S3-compatible endpoint (MinIO locally; the approved in-region store in production, A6). */
  endpoint?: string | undefined;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  timeoutMs?: number;
  /** Injected in tests. */
  client?: S3Client;
}

/**
 * S3-compatible store. Timeouts on every call, the SDK's retries with backoff, a circuit
 * breaker, and server-side encryption requested on every object.
 */
export function createS3ObjectStore(options: S3ObjectStoreOptions): ObjectStore {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const client =
    options.client ??
    new S3Client({
      region: options.region,
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      maxAttempts: 3,
      requestHandler: new NodeHttpHandler({
        requestTimeout: timeoutMs,
        connectionTimeout: Math.min(timeoutMs, 3_000),
      }),
    });
  const breaker = createCircuitBreaker({ dependency: 'object_store' });
  const Bucket = options.bucket;

  async function call<T>(work: () => Promise<T>): Promise<T> {
    return breaker(async () => {
      try {
        return await work();
      } catch (error: unknown) {
        if (error instanceof IntegrationError) throw error;
        // The SDK error name only (e.g. NoSuchKey, TimeoutError): never bucket paths or bodies.
        throw new IntegrationError('object_store', error instanceof Error ? error.name : 'failed');
      }
    });
  }

  return {
    put: async (key, body, contentType) => {
      assertSafeKey(key);
      await call(async () => {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ServerSideEncryption: 'AES256',
          }),
        );
      });
    },
    get: async (key) => {
      assertSafeKey(key);
      return call(async () => {
        const response = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (response.Body === undefined) throw new IntegrationError('object_store', 'EmptyBody');
        return Buffer.from(await response.Body.transformToByteArray());
      });
    },
    remove: async (key) => {
      assertSafeKey(key);
      await call(async () => {
        await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
      });
    },
    ping: () =>
      call(async () => {
        await client.send(new HeadBucketCommand({ Bucket }));
      }),
  };
}
