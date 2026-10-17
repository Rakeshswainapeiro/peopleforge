import {
  ConversationPageSchema,
  MessageSchema,
  type ConversationPage,
  type ConversationQuery,
  type Message,
} from '@peopleforge/contracts';
import { z } from 'zod';
import type { ApiResult } from './api-client';
import { callApi } from './session';

/** Typed calls to the conversations API (R1-08). IDs are validated before use in a path. */
const Id = z.uuid();

function messagesPath(requestId: string, lineId: string): string {
  return `/api/v1/increment-requests/${Id.parse(requestId)}/lines/${Id.parse(lineId)}/messages`;
}

export function getThread(requestId: string, lineId: string): Promise<ApiResult<Message[]>> {
  return callApi(messagesPath(requestId, lineId), z.array(MessageSchema));
}

export function postMessage(
  requestId: string,
  lineId: string,
  body: string,
  idempotencyKey: string,
): Promise<ApiResult<Message[]>> {
  return callApi(messagesPath(requestId, lineId), z.array(MessageSchema), {
    method: 'POST',
    body: { body },
    idempotencyKey,
  });
}

export function listConversations(
  query: Partial<ConversationQuery> = {},
): Promise<ApiResult<ConversationPage>> {
  const params = new URLSearchParams({
    filter: query.filter ?? 'awaiting',
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 10),
  });
  return callApi(`/api/v1/conversations?${params.toString()}`, ConversationPageSchema);
}
