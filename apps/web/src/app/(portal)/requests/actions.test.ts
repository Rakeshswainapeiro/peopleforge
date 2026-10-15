import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@/server/api-client';
import {
  addEmployee,
  createRequest,
  removeEmployee,
  removeEvidence,
  saveDraftChanges,
  submitRequest,
  uploadEvidence,
} from '@/server/increment-requests';
import { refreshPortalShell } from '@/server/portal-shell';
import {
  addEmployeeAction,
  removeEmployeeAction,
  removeEvidenceAction,
  saveDraft,
  startRequest,
  uploadEvidenceAction,
} from './actions';

vi.mock('@/server/increment-requests', () => ({
  addEmployee: vi.fn(),
  createRequest: vi.fn(),
  removeEmployee: vi.fn(),
  saveDraftChanges: vi.fn(),
  submitRequest: vi.fn(),
  uploadEvidence: vi.fn(),
  removeEvidence: vi.fn(),
}));
vi.mock('@/server/portal-shell', () => ({ refreshPortalShell: vi.fn() }));
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
  for (const mock of [
    addEmployee,
    createRequest,
    removeEmployee,
    saveDraftChanges,
    submitRequest,
    uploadEvidence,
    removeEvidence,
  ])
    vi.mocked(mock).mockResolvedValue(ok as never);
  vi.mocked(refreshPortalShell).mockClear();
});

describe('startRequest', () => {
  const fields = {
    cycleId: CYCLE,
    entityId: ENTITY,
    employeeId: EMPLOYEE,
    idempotencyKey: 'key-123456789',
  };

  it('creates the draft with its first employee and opens it', async () => {
    await expect(startRequest(form(fields))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit`,
    );
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
    ).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}/edit`);
    expect(addEmployee).toHaveBeenCalledWith(REQUEST, EMPLOYEE);
  });

  it('asks for an employee, and explains duplicates', async () => {
    await expect(addEmployeeAction(form({ requestId: REQUEST }))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit?error=request.errors.chooseEmployee`,
    );
    vi.mocked(addEmployee).mockResolvedValue({
      kind: 'error',
      status: 409,
      code: 'CONFLICT',
      details: [{ path: 'employeeId', code: 'duplicate' }],
    });
    await expect(
      addEmployeeAction(form({ requestId: REQUEST, employeeId: EMPLOYEE })),
    ).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}/edit?error=request.errors.duplicate`);
  });

  it('removes the employee whose button was pressed', async () => {
    await expect(removeEmployeeAction(LINE_1, form({ requestId: REQUEST }))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit`,
    );
    expect(removeEmployee).toHaveBeenCalledWith(REQUEST, LINE_1);
  });

  it('goes Home when removing the last employee discarded the draft', async () => {
    vi.mocked(removeEmployee).mockResolvedValue({
      kind: 'ok',
      data: { discarded: true, request: null },
    });
    await expect(removeEmployeeAction(LINE_1, form({ requestId: REQUEST }))).rejects.toThrow(
      'NEXT_REDIRECT /?discarded=1',
    );
  });

  it('explains a failed removal on the request', async () => {
    vi.mocked(removeEmployee).mockResolvedValue({ kind: 'unavailable' });
    await expect(removeEmployeeAction(LINE_1, form({ requestId: REQUEST }))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit?error=request.errors.generic`,
    );
  });

  it('refuses tampered IDs before calling the API', async () => {
    await expect(removeEmployeeAction(LINE_1, form({ requestId: '../admin' }))).rejects.toThrow();
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
    ).rejects.toThrow(`NEXT_REDIRECT /requests/${REQUEST}/edit?saved=1`);
    await expect(saveDraft({ rows: [] }, table({ [LINE_1]: ['amount', '1,720'] }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(vi.mocked(saveDraftChanges).mock.calls).toEqual([
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
    expect(saveDraftChanges).not.toHaveBeenCalled();
  });

  it('maps the API’s per-row refusals back to the rows', async () => {
    vi.mocked(saveDraftChanges).mockResolvedValue({
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
    vi.mocked(saveDraftChanges).mockResolvedValue(result as ApiResult<never>);
    const state = await saveDraft({ rows: [] }, table({ [LINE_1]: ['percent', '5'] }));
    expect(state.error).toBe(error);
  });

  it('ends a session the API no longer accepts', async () => {
    vi.mocked(saveDraftChanges).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(saveDraft({ rows: [] }, table({ [LINE_1]: ['percent', '5'] }))).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });

  const C1 = '44444444-4444-4444-8444-444444444440';
  const C2 = '44444444-4444-4444-8444-444444444441';
  const withCriteria = (extra: Record<string, string | string[]> = {}) => {
    const data = table({ [LINE_1]: ['percent', '5'] });
    const fields: Record<string, string | string[]> = {
      assessmentLineId: LINE_1,
      criterionId: [C1, C2],
      [`result:${C1}`]: 'pass',
      [`justification:${C1}`]: 'cafe\u0301 rated 4',
      [`justification:${C2}`]: '',
      ...extra,
    };
    for (const [name, value] of Object.entries(fields)) {
      for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
    }
    return data;
  };

  it('saves the assessed employee’s criteria with the proposals, staying on them [R1-03]', async () => {
    await expect(saveDraft({ rows: [] }, withCriteria({ employee: LINE_1 }))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit?saved=1&employee=${LINE_1}`,
    );
    expect(saveDraftChanges).toHaveBeenCalledWith(REQUEST, {
      version: 3,
      proposals: [{ lineId: LINE_1, kind: 'percent', value: '5' }],
      assessment: {
        lineId: LINE_1,
        results: [
          { criterionId: C1, result: 'pass', justification: 'café rated 4' },
          { criterionId: C2, result: null, justification: '' },
        ],
      },
    });
  });

  it('opens the next employee’s criteria after saving from a row’s pencil', async () => {
    await expect(saveDraft({ rows: [] }, withCriteria({ selectLine: LINE_2 }))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit?employee=${LINE_2}#criteria`,
    );
  });

  it('keeps the typed criteria when the save is refused', async () => {
    vi.mocked(saveDraftChanges).mockResolvedValue({
      kind: 'error',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [{ path: 'assessment.results.0.justification', code: 'too_big' }],
    });
    const state = await saveDraft({ rows: [] }, withCriteria({ [`result:${C2}`]: 'maybe' }));
    expect(state.error).toBe('request.errors.justificationTooLong');
    expect(state.criteria).toEqual({
      lineId: LINE_1,
      results: [
        { criterionId: C1, result: 'pass', justification: 'cafe\u0301 rated 4' },
        { criterionId: C2, result: 'maybe', justification: '' },
      ],
    });
    const invalid = await saveDraft(
      { rows: [] },
      withCriteria({ [`value:${LINE_1}`]: 'abc', [`kind:${LINE_1}`]: 'percent' }),
    );
    expect(invalid.criteria?.lineId).toBe(LINE_1);
  });

  it('refuses a tampered criterion ID', async () => {
    await expect(saveDraft({ rows: [] }, withCriteria({ criterionId: '../x' }))).rejects.toThrow();
    expect(saveDraftChanges).not.toHaveBeenCalled();
  });
});

describe('saveDraft with intent=submit [R1-07]', () => {
  const KEY = 'b6a1d1c2-4d0e-4c47-9b8f-0b1d3a2f9e01';
  const submitting = (key = KEY) => {
    const data = form({
      requestId: REQUEST,
      version: '3',
      lineId: [LINE_1],
      [`kind:${LINE_1}`]: 'percent',
      [`value:${LINE_1}`]: '5',
      intent: 'submit',
      submitKey: key,
    });
    return data;
  };

  beforeEach(() => {
    vi.mocked(saveDraftChanges).mockResolvedValue({
      kind: 'ok',
      data: { id: REQUEST, version: 4 },
    } as unknown as ApiResult<never>);
  });

  it('saves what is on screen, then submits the saved version', async () => {
    await expect(saveDraft({ rows: [] }, submitting())).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}?submitted=1`,
    );
    expect(saveDraftChanges).toHaveBeenCalledOnce();
    expect(submitRequest).toHaveBeenCalledWith(REQUEST, 4, KEY);
    // The submitter's own notification shows on the bell at once.
    expect(refreshPortalShell).toHaveBeenCalledOnce();
  });

  it.each([
    [
      {
        kind: 'error',
        status: 400,
        code: 'VALIDATION_FAILED',
        details: [{ path: 'lines.0', code: 'incomplete' }],
      },
      'request.errors.notReady',
    ],
    [
      {
        kind: 'error',
        status: 409,
        code: 'CONFLICT',
        details: [{ path: 'status', code: 'not_draft' }],
      },
      'request.errors.notDraft',
    ],
    [{ kind: 'unavailable' }, 'request.errors.generic'],
  ])('reloads the request with the reason when submitting fails (%j)', async (result, error) => {
    vi.mocked(submitRequest).mockResolvedValue(result as ApiResult<never>);
    await expect(saveDraft({ rows: [] }, submitting())).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit?error=${error}`,
    );
  });

  it('ends a dead session, and refuses a tampered key without submitting', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(saveDraft({ rows: [] }, submitting())).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
    vi.mocked(submitRequest).mockClear();
    await expect(saveDraft({ rows: [] }, submitting('../x'))).rejects.toThrow(
      `NEXT_REDIRECT /requests/${REQUEST}/edit?error=request.errors.generic`,
    );
    expect(submitRequest).not.toHaveBeenCalled();
  });
});

describe('uploadEvidenceAction [R1-04]', () => {
  const C1 = '44444444-4444-4444-8444-444444444440';
  const upload = () => form({ requestId: REQUEST, lineId: LINE_1, criterionId: C1 });
  const withFile = (file: File | string) => {
    const data = upload();
    data.set('file', file);
    return data;
  };

  it('sends the file with its line and criterion', async () => {
    const file = new File(['%PDF-1.7'], 'تقييم.pdf', { type: 'application/pdf' });
    await expect(uploadEvidenceAction(withFile(file))).resolves.toEqual({ ok: true });
    const [requestId, sent] = vi.mocked(uploadEvidence).mock.calls[0] ?? [];
    expect(requestId).toBe(REQUEST);
    expect(sent?.get('lineId')).toBe(LINE_1);
    expect(sent?.get('criterionId')).toBe(C1);
    expect((sent?.get('file') as File).name).toBe('تقييم.pdf');
  });

  it('needs a file within the size limit before calling the API', async () => {
    await expect(uploadEvidenceAction(upload())).resolves.toEqual({
      ok: false,
      error: 'evidence.errors.required',
    });
    await expect(uploadEvidenceAction(withFile(new File([], 'empty.pdf')))).resolves.toMatchObject({
      error: 'evidence.errors.required',
    });
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf');
    await expect(uploadEvidenceAction(withFile(big))).resolves.toMatchObject({
      error: 'evidence.errors.tooLarge',
    });
    expect(uploadEvidence).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'unavailable' }, 'evidence.errors.unavailable'],
    [
      {
        kind: 'error',
        status: 400,
        code: 'VALIDATION_FAILED',
        details: [{ path: 'file', code: 'infected' }],
      },
      'evidence.errors.infected',
    ],
  ])('explains %j', async (result, error) => {
    vi.mocked(uploadEvidence).mockResolvedValue(result as ApiResult<never>);
    await expect(uploadEvidenceAction(withFile(new File(['x'], 'a.pdf')))).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it('ends a session the API no longer accepts', async () => {
    vi.mocked(uploadEvidence).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(uploadEvidenceAction(withFile(new File(['x'], 'a.pdf')))).rejects.toThrow(
      'NEXT_REDIRECT /session-ended',
    );
  });
});

describe('removeEvidenceAction', () => {
  const EVIDENCE = '55555555-5555-4555-8555-555555555551';

  it('removes the file', async () => {
    await expect(removeEvidenceAction(REQUEST, EVIDENCE)).resolves.toEqual({ ok: true });
    expect(removeEvidence).toHaveBeenCalledWith(REQUEST, EVIDENCE);
  });

  it('reports a failure and ends a dead session', async () => {
    vi.mocked(removeEvidence).mockResolvedValue({ kind: 'unavailable' });
    await expect(removeEvidenceAction(REQUEST, EVIDENCE)).resolves.toEqual({
      ok: false,
      error: 'evidence.errors.removeFailed',
    });
    vi.mocked(removeEvidence).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(removeEvidenceAction(REQUEST, EVIDENCE)).rejects.toThrow('NEXT_REDIRECT');
  });

  it('refuses tampered IDs', async () => {
    await expect(removeEvidenceAction(REQUEST, '../x')).rejects.toThrow();
    expect(removeEvidence).not.toHaveBeenCalled();
  });
});
