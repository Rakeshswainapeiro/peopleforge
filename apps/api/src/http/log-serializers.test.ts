import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { serializeRequest, serializeResponse } from './log-serializers.js';

const req = (url: string | undefined): IncomingMessage & { id?: unknown } =>
  ({
    id: 'req-1',
    method: 'GET',
    url,
    headers: { authorization: 'Bearer secret', cookie: 'sid=1' },
  }) as unknown as IncomingMessage & { id?: unknown };

describe('serializeRequest', () => {
  it('drops the query string, which may carry employee identifiers', () => {
    expect(serializeRequest(req('/api/v1/employees?name=Fatima&salary=1'))).toEqual({
      id: 'req-1',
      method: 'GET',
      path: '/api/v1/employees',
    });
  });

  it('keeps a path without a query unchanged', () => {
    expect(serializeRequest(req('/api/v1/me')).path).toBe('/api/v1/me');
  });

  it('handles a missing URL', () => {
    expect(serializeRequest(req(undefined)).path).toBe('');
  });

  it('never includes headers', () => {
    expect(JSON.stringify(serializeRequest(req('/x')))).not.toContain('secret');
  });
});

describe('serializeResponse', () => {
  it('keeps only the status code', () => {
    const res = { statusCode: 201, getHeaders: () => ({ 'set-cookie': 'sid=1' }) };
    expect(serializeResponse(res as unknown as ServerResponse)).toEqual({ statusCode: 201 });
  });
});
