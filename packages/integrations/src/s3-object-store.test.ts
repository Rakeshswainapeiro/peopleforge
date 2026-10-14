import {
  type GetObjectCommandOutput,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { IntegrationError } from './errors.js';
import { createS3ObjectStore } from './s3-object-store.js';

const s3 = mockClient(S3Client);

function store() {
  return createS3ObjectStore({
    bucket: 'pf-evidence',
    region: 'me-central-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    client: new S3Client({ region: 'me-central-1' }),
  });
}

describe('createS3ObjectStore', () => {
  beforeEach(() => {
    s3.reset();
  });

  it('puts objects with server-side encryption and the given content type', async () => {
    s3.on(PutObjectCommand).resolves({});
    await store().put('evidence/abc', Buffer.from('pdf'), 'application/pdf');
    expect(s3.commandCalls(PutObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: 'pf-evidence',
      Key: 'evidence/abc',
      Body: Buffer.from('pdf'),
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    });
  });

  it('gets an object as a buffer', async () => {
    s3.on(GetObjectCommand, { Bucket: 'pf-evidence', Key: 'evidence/abc' }).resolves({
      Body: {
        transformToByteArray: () => Promise.resolve(new TextEncoder().encode('content')),
      } as unknown as NonNullable<GetObjectCommandOutput['Body']>,
    });
    await expect(store().get('evidence/abc')).resolves.toEqual(Buffer.from('content'));
  });

  it('treats a missing body as a failure', async () => {
    s3.on(GetObjectCommand).resolves({});
    await expect(store().get('evidence/abc')).rejects.toMatchObject({
      dependency: 'object_store',
      message: 'EmptyBody',
    });
  });

  it('removes objects and pings the bucket', async () => {
    s3.on(DeleteObjectCommand).resolves({});
    s3.on(HeadBucketCommand).resolves({});
    const subject = store();
    await subject.remove('evidence/abc');
    await subject.ping();
    expect(s3.commandCalls(DeleteObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: 'pf-evidence',
      Key: 'evidence/abc',
    });
    expect(s3.commandCalls(HeadBucketCommand)).toHaveLength(1);
  });

  it('maps SDK failures to an IntegrationError carrying only the error name', async () => {
    const failure = new Error('s3://pf-evidence/evidence/abc is gone');
    failure.name = 'NoSuchKey';
    s3.on(GetObjectCommand).rejects(failure);
    const error = await store()
      .get('evidence/abc')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ message: 'NoSuchKey' });
  });

  it('maps non-Error rejections too', async () => {
    s3.on(HeadBucketCommand).callsFake(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test: a dependency rejecting with a non-Error
      Promise.reject(Object.freeze({ reason: 'not an Error' })),
    );
    await expect(store().ping()).rejects.toMatchObject({ message: 'failed' });
  });

  it('refuses unsafe keys without calling S3', async () => {
    const subject = store();
    await expect(subject.put('../x', Buffer.from(''), 'text/plain')).rejects.toThrow(TypeError);
    await expect(subject.get('../x')).rejects.toThrow(TypeError);
    await expect(subject.remove('../x')).rejects.toThrow(TypeError);
    expect(s3.calls()).toHaveLength(0);
  });

  it('builds its own client with timeouts when none is injected', async () => {
    s3.on(HeadBucketCommand).resolves({});
    const withEndpoint = createS3ObjectStore({
      bucket: 'b',
      region: 'me-central-1',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'a',
      secretAccessKey: 's',
      timeoutMs: 2_000,
    });
    const withoutEndpoint = createS3ObjectStore({
      bucket: 'b',
      region: 'me-central-1',
      forcePathStyle: false,
      accessKeyId: 'a',
      secretAccessKey: 's',
    });
    await withEndpoint.ping();
    await withoutEndpoint.ping();
    expect(s3.commandCalls(HeadBucketCommand)).toHaveLength(2);
  });
});
