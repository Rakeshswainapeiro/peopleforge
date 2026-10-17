import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
  conversationPage,
  LINE_1,
  REQUEST_ID,
  threadItem,
  threadMessages,
} from '@/test-support/requests';
import {
  awaitingLabel,
  conversationHref,
  conversationsHref,
  messageViews,
  sideLabel,
  threadRows,
} from './conversation-view';

const t = createTranslator('en');

describe('conversation views [R1-08]', () => {
  it('names each side and links to the employee’s conversation', () => {
    expect(sideLabel('sirius', 'SUB-A', t)).toBe('Sirius HR');
    expect(sideLabel('subsidiary', 'SUB-A', t)).toBe('SUB-A');
    expect(conversationHref(REQUEST_ID, LINE_1)).toBe(
      `/requests/${REQUEST_ID}/employees/${LINE_1}#conversation`,
    );
    expect(conversationsHref('awaiting')).toBe('/conversations');
    expect(conversationsHref('all', 2)).toBe('/conversations?filter=all&page=2');
  });

  it('shows the thread from the reader’s side, and who has to answer', () => {
    const [question, answer] = messageViews(threadMessages(), 'subsidiary', 'SUB-A', 'en', t);
    expect(question).toEqual({
      id: '66666666-6666-4666-8666-666666666661',
      mine: false,
      by: 'Sirius HR · Sara Al Mansoori',
      at: '16 Oct 2026, 10:00',
      body: 'Is the 2026 appraisal signed?',
    });
    expect(answer).toMatchObject({ mine: true, by: 'SUB-A · Alpha HR' });
    expect(awaitingLabel(threadMessages(), 'subsidiary', 'SUB-A', t)).toBe('Waiting for Sirius HR');
    expect(awaitingLabel(threadMessages(), 'sirius', 'SUB-A', t)).toBe('Waiting for your answer');
    expect(awaitingLabel(threadMessages().slice(0, 1), 'sirius', 'SUB-A', t)).toBe(
      'Waiting for SUB-A',
    );
    expect(awaitingLabel([], 'sirius', 'SUB-A', t)).toBeNull();
  });

  it('lists threads with the latest message and Respond when it waits for the reader', () => {
    const [waiting, answered] = threadRows(
      conversationPage([
        threadItem(),
        threadItem({ lineId: 'x', awaitingMe: false, fullName: 'Neha Iyer' }),
      ]),
      'en',
      t,
    );
    expect(waiting).toEqual({
      id: LINE_1,
      href: `/requests/${REQUEST_ID}/employees/${LINE_1}#conversation`,
      name: 'Omar Haddad',
      detail: 'EMP-3318',
      request: 'INC-2026-0152',
      entityCode: 'SUB-A',
      by: 'Sirius HR · Sara Al Mansoori',
      preview: 'Is the 2026 appraisal signed?',
      when: '16 Oct 2026, 10:00',
      messages: '2',
      awaitingMe: true,
      action: 'Respond',
      actionLabel: 'Respond about Omar Haddad',
    });
    expect(answered).toMatchObject({
      action: 'Open',
      actionLabel: 'Open the conversation about Neha Iyer',
    });
  });
});
