import { describe, expect, it } from 'vitest';
import {
  ConversationPageSchema,
  ConversationQuerySchema,
  MessageSchema,
  PostMessageSchema,
} from './conversations.js';
import { MAX_COMMENT_LENGTH } from './increment-requests.js';

const ID = '00000000-0000-4000-8000-0000000e000a';

describe('conversations contract [R1-08]', () => {
  it('takes a trimmed, NFC-normalised message of 1 to 2,000 characters', () => {
    expect(PostMessageSchema.parse({ body: '  Is it signed? ' })).toEqual({
      body: 'Is it signed?',
    });
    expect(PostMessageSchema.parse({ body: 'é' }).body).toBe('é');
    expect(PostMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(PostMessageSchema.safeParse({ body: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }).success).toBe(
      false,
    );
    expect(PostMessageSchema.safeParse({ body: 'x', side: 'sirius' }).success).toBe(false);
  });

  it('defaults the list to threads waiting for me', () => {
    expect(ConversationQuerySchema.parse({})).toEqual({
      filter: 'awaiting',
      page: 1,
      pageSize: 10,
    });
    expect(ConversationQuerySchema.parse({ filter: 'all', pageSize: '25' })).toMatchObject({
      filter: 'all',
      pageSize: 25,
    });
    expect(ConversationQuerySchema.safeParse({ pageSize: '7' }).success).toBe(false);
  });

  it('documents a message and a page of threads', () => {
    const message = {
      id: ID,
      side: 'sirius',
      authorName: 'Sara',
      body: 'Is it signed?',
      createdAt: '2026-10-17T08:00:00.000Z',
    };
    expect(MessageSchema.parse(message)).toEqual(message);
    expect(
      ConversationPageSchema.safeParse({
        items: [
          {
            lineId: ID,
            request: { id: ID, reference: 'INC-2026-0001', entityCode: 'SUB-A' },
            employeeNumber: 'EMP-1101',
            fullName: 'Aisha Rahman',
            messages: 2,
            awaitingMe: true,
            last: {
              side: 'sirius',
              authorName: 'Sara',
              createdAt: '2026-10-17T08:00:00.000Z',
              preview: 'Is it signed?',
            },
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        counts: { all: 1, awaiting: 1 },
      }).success,
    ).toBe(true);
  });
});
