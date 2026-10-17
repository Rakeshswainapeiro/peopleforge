import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@/server/api-client';
import { decideEmployee, verifyCriterion } from '@/server/increment-requests';
import { refreshPortalShell } from '@/server/portal-shell';
import { decideAction, verifyAction } from './actions';

vi.mock('@/server/increment-requests', () => ({
  decideEmployee: vi.fn(),
  verifyCriterion: vi.fn(),
}));
vi.mock('@/server/portal-shell', () => ({ refreshPortalShell: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const REQUEST = '11111111-1111-4111-8111-111111111111';
const LINE = '22222222-2222-4222-8222-222222222221';
const C1 = '44444444-4444-4444-8444-444444444440';
const KEY = 'b6a1d1c2-4d0e-4c47-9b8f-0b1d3a2f9e03';
const PAGE = `/requests/${REQUEST}/employees/${LINE}`;
const ok = { kind: 'ok', data: { id: REQUEST } } as unknown as ApiResult<never>;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const deciding = (fields: Record<string, string>) =>
  form({ requestId: REQUEST, lineId: LINE, decisionKey: KEY, ...fields });

beforeEach(() => {
  vi.mocked(verifyCriterion).mockResolvedValue(ok);
  vi.mocked(decideEmployee).mockResolvedValue(ok);
  vi.mocked(refreshPortalShell).mockClear();
});

describe('verifyAction [R1-07, R1-10]', () => {
  it('verifies or undoes the criterion, re-rendering the page in place', async () => {
    await expect(verifyAction(REQUEST, LINE, C1, true)).resolves.toBeUndefined();
    await expect(verifyAction(REQUEST, LINE, C1, false)).resolves.toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith(PAGE);
    expect(vi.mocked(verifyCriterion).mock.calls).toEqual([
      [REQUEST, LINE, C1, true],
      [REQUEST, LINE, C1, false],
    ]);
  });

  it('says why it failed, ends a dead session, and refuses malformed IDs', async () => {
    vi.mocked(verifyCriterion).mockResolvedValueOnce({
      kind: 'error',
      status: 409,
      code: 'CONFLICT',
      details: [{ path: 'lineId', code: 'not_pending' }],
    });
    await expect(verifyAction(REQUEST, LINE, C1, true)).rejects.toThrow(
      `NEXT_REDIRECT ${PAGE}?error=request.errors.notPending`,
    );
    vi.mocked(verifyCriterion).mockResolvedValueOnce({ kind: 'unavailable' });
    await expect(verifyAction(REQUEST, LINE, C1, true)).rejects.toThrow(
      `NEXT_REDIRECT ${PAGE}?error=request.errors.generic`,
    );
    vi.mocked(verifyCriterion).mockResolvedValueOnce({ kind: 'unauthenticated' });
    await expect(verifyAction(REQUEST, LINE, C1, true)).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
    await expect(verifyAction('../x', LINE, C1, true)).rejects.toThrow();
  });
});

describe('decideAction [R1-08, R1-09]', () => {
  it('approves as proposed, ignoring fields that only apply to a change', async () => {
    await expect(
      decideAction({}, deciding({ decision: 'approved', approvedPercent: '3', comment: 'x' })),
    ).rejects.toThrow(`NEXT_REDIRECT ${PAGE}?decided=approved`);
    expect(decideEmployee).toHaveBeenCalledWith(REQUEST, LINE, { decision: 'approved' }, KEY);
    expect(refreshPortalShell).toHaveBeenCalledOnce();
  });

  it('approves another percentage with its reason and comment', async () => {
    await expect(
      decideAction(
        {},
        deciding({
          decision: 'approved',
          change: 'on',
          approvedPercent: ' 4.5 % ',
          reasonCode: 'budget',
          comment: ' Within the band. ',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(vi.mocked(decideEmployee).mock.calls[0]?.[2]).toEqual({
      decision: 'approved',
      approvedPercent: '4.5',
      reasonCode: 'budget',
      comment: 'Within the band.',
    });
  });

  it.each(['rejected', 'returned'] as const)('%s with a reason and a comment', async (decision) => {
    await expect(
      decideAction(
        {},
        deciding({ decision, reasonCode: 'other', comment: 'Please attach the 2026 appraisal.' }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT ${PAGE}?decided=${decision}`);
  });

  it('keeps what was typed when the decision is incomplete, without calling the API', async () => {
    await expect(
      decideAction({}, deciding({ decision: 'returned', reasonCode: '', comment: 'Why?' })),
    ).resolves.toEqual({
      attempt: 1,
      error: 'request.errors.decisionInvalid',
      values: {
        decision: 'returned',
        change: '',
        approvedPercent: '',
        reasonCode: '',
        comment: 'Why?',
      },
    });
    await expect(
      decideAction(
        {},
        deciding({
          decision: 'approved',
          change: 'on',
          approvedPercent: '120',
          reasonCode: 'budget',
        }),
      ),
    ).resolves.toMatchObject({ error: 'request.errors.percentRange' });
    await expect(
      decideAction(
        {},
        deciding({ decision: 'approved', change: 'on', approvedPercent: '5', reasonCode: 'x' }),
      ),
    ).resolves.toMatchObject({ error: 'request.errors.decisionInvalid' });
    await expect(
      decideAction({}, form({ requestId: REQUEST, lineId: LINE, decision: 'approved' })),
    ).resolves.toMatchObject({ error: 'request.errors.decisionInvalid' });
    expect(decideEmployee).not.toHaveBeenCalled();
  });

  it('shows the API’s refusal, and ends a dead session', async () => {
    vi.mocked(decideEmployee).mockResolvedValueOnce({
      kind: 'error',
      status: 409,
      code: 'CONFLICT',
      details: [{ path: 'criteria', code: 'not_verified' }],
    });
    await expect(decideAction({}, deciding({ decision: 'approved' }))).resolves.toMatchObject({
      error: 'request.errors.notVerified',
    });
    vi.mocked(decideEmployee).mockResolvedValueOnce({ kind: 'unavailable' });
    await expect(decideAction({}, deciding({ decision: 'approved' }))).resolves.toMatchObject({
      error: 'request.errors.generic',
    });
    vi.mocked(decideEmployee).mockResolvedValueOnce({ kind: 'unauthenticated' });
    await expect(decideAction({}, deciding({ decision: 'approved' }))).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });
});
