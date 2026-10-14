import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@/server/api-client';
import {
  addEmployee,
  createRequest,
  removeEmployee,
  saveProposals,
} from '@/server/increment-requests';
import { addEmployeeAction, removeEmployeeAction, saveDraft, startRequest } from './actions';

vi.mock('@/server/increment-requests', () => ({
  addEmployee: vi.fn(),
  createRequest: vi.fn(),
  removeEmployee: vi.fn(),
  saveProposals: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const REQUEST = '11111111-1111-4111-8111-111111111111';
const LINE_1 = '22222222-2222-4222-8222-222222222221';
const LINE_2 = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333331';
const CYCLE = '00000000-0000-4000-8000-00000000c026';
const ENTITY = '00000000-0000-4000-8000-0000000e000a';

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

const ok = { kind: 'ok', data: { id: REQUEST } } as unknown as ApiResult<never>;

beforeEach(() => {
  for (const mock of [addEmployee, createRequest, removeEmployee, saveProposals])
    vi.mocked(mock).mockResolvedValue(ok);
});

describe('startRequest', () => {
  const fields = {
    cycleId: CYCLE,
    entityId: ENTITY,
    employeeId: EMPLOYEE,
    idempotencyKey: 'key-123456789',
  };

  it('creates the draft with its first employee and opens it', async () => {
    await expect(startRequest(form(fields))).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}`);
    expect(createRequest).toHaveBeenCalledWith(
      { cycleId: CYCLE, entityId: ENTITY, employeeIds: [EMPLOYEE] },
      'key-123456789',
    );
  });

  it('asks for an employee when none was chosen', async () => {
    await expect(startRequest(form({ ...fields, employeeId: '' }))).rejects.toThrow(
      'NEXT_REDIRECT /requests/new?error=request.errors.chooseEmployee',
    );
    expect(createRequest).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'unauthenticated' }, '/session-ended'],
    [{ kind: 'unavailable' }, '/requests/new?error=request.errors.generic'],
    [
      {
        kind: 'error',
        status: 400,
        code: 'VALIDATION_FAILED',
        details: [{ path: 'cycleId', code: 'not_open' }],
      },
      '/requests/new?error=request.errors.cycleNotOpen',
    ],
  ])('handles %j', async (result, target) => {
    vi.mocked(createRequest).mockResolvedValue(result as ApiResult<never>);
    await expect(startRequest(form(fields))).rejects.toThrow(`NEXT_REDIRECT ${target}`);
  });
});

describe('addEmployeeAction and removeEmployeeAction', () => {
  it('adds an employee and returns to the request', async () => {
    await expect(
      addEmployeeAction(form({ requestId: REQUEST, employeeId: EMPLOYEE })),
    ).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}`);
    expect(addEmployee).toHaveBeenCalledWith(REQUEST, EMPLOYEE);
  });

  it('asks for an employee, and explains duplicates', async () => {
    await expect(addEmployeeAction(form({ requestId: REQUEST }))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}?error=request.errors.chooseEmployee`,
    );
    vi.mocked(addEmployee).mockResolvedValue({
      kind: 'error',
      status: 409,
      code: 'CONFLICT',
      details: [{ path: 'employeeId', code: 'duplicate' }],
    });
    await expect(
      addEmployeeAction(form({ requestId: REQUEST, employeeId: EMPLOYEE })),
    ).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}?error=request.errors.duplicate`);
  });

  it('removes the employee whose button was pressed', async () => {
    await expect(
      removeEmployeeAction(form({ requestId: REQUEST, removeLineId: LINE_1 })),
    ).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}`);
    expect(removeEmployee).toHaveBeenCalledWith(REQUEST, LINE_1);
  });

  it('refuses tampered IDs before calling the API', async () => {
    await expect(
      removeEmployeeAction(form({ requestId: '../admin', removeLineId: LINE_1 })),
    ).rejects.toThrow();
    expect(removeEmployee).not.toHaveBeenCalled();
  });
});

describe('saveDraft', () => {
  const table = (values: Record<string, [string, string]>) =>
    form({
      requestId: REQUEST,
      version: '3',
      lineId: Object.keys(values),
      ...Object.fromEntries(
        Object.entries(values).flatMap(([lineId, [kind, value]]) => [
          [`kind:${lineId}`, kind],
          [`value:${lineId}`, value],
        ]),
      ),
    });

  it('saves the table, accepting "6 %" and "1,720", and clearing empty values', async () => {
    await expect(
      saveDraft({ rows: [] }, table({ [LINE_1]: ['percent', '6 %'], [LINE_2]: ['amount', ''] })),
    ).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}?saved=1`);
    await expect(saveDraft({ rows: [] }, table({ [LINE_1]: ['amount', '1,720'] }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(vi.mocked(saveProposals).mock.calls).toEqual([
      [
        REQUEST,
        {
          version: 3,
          proposals: [
            { lineId: LINE_1, kind: 'percent', value: '6' },
            { lineId: LINE_2, kind: null, value: null },
          ],
        },
      ],
      [REQUEST, { version: 3, proposals: [{ lineId: LINE_1, kind: 'amount', value: '1720' }] }],
    ]);
  });

  it('keeps what was typed and marks malformed values without calling the API', async () => {
    const state = await saveDraft(
      { rows: [] },
      table({ [LINE_1]: ['percent', '6.123'], [LINE_2]: ['bonus', '5'] }),
    );
    expect(state).toEqual({
      error: 'request.errors.rowsInvalid',
      rows: [
        { lineId: LINE_1, kind: 'percent', value: '6.123', error: 'request.errors.format' },
        { lineId: LINE_2, kind: 'percent', value: '5' },
      ],
    });
    expect(saveProposals).not.toHaveBeenCalled();
  });

  it('maps the API’s per-row refusals back to the rows', async () => {
    vi.mocked(saveProposals).mockResolvedValue({
      kind: 'error',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [
        { path: 'proposals.1.value', code: 'over_limit' },
        { path: 'proposals.9.value', code: 'over_limit' },
        { path: 'other', code: 'x' },
      ],
    });
    const state = await saveDraft(
      { rows: [] },
      table({ [LINE_1]: ['percent', '5'], [LINE_2]: ['percent', '101'] }),
    );
    expect(state.error).toBe('request.errors.rowsInvalid');
    expect(state.rows[1]).toMatchObject({ lineId: LINE_2, error: 'request.errors.overLimit' });
    expect(state.rows[0]?.error).toBeUndefined();
  });

  it.each([
    [
      {
        kind: 'error',
        status: 409,
        code: 'CONFLICT',
        details: [{ path: 'version', code: 'stale' }],
      },
      'request.errors.stale',
    ],
    [{ kind: 'unavailable' }, 'request.errors.generic'],
  ])('reports %j', async (result, error) => {
    vi.mocked(saveProposals).mockResolvedValue(result as ApiResult<never>);
    const state = await saveDraft({ rows: [] }, table({ [LINE_1]: ['percent', '5'] }));
    expect(state.error).toBe(error);
  });

  it('ends a session the API no longer accepts', async () => {
    vi.mocked(saveProposals).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(saveDraft({ rows: [] }, table({ [LINE_1]: ['percent', '5'] }))).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });
});
