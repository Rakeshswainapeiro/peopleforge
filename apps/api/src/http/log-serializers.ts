import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Minimal request/response log shape. Query strings are dropped (they can carry employee IDs
 * or names), and headers are omitted entirely rather than relying on redaction lists.
 */
export function serializeRequest(req: IncomingMessage & { id?: unknown }): {
  id: unknown;
  method: string | undefined;
  path: string;
} {
  const url = req.url ?? '';
  const queryStart = url.indexOf('?');
  return {
    id: req.id,
    method: req.method,
    path: queryStart === -1 ? url : url.slice(0, queryStart),
  };
}

export function serializeResponse(res: ServerResponse): { statusCode: number } {
  return { statusCode: res.statusCode };
}
