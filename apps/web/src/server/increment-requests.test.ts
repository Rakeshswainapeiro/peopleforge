import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEmployee,
  createRequest,
  dashboardSummary,
  getRequest,
  listRequestLines,
  listRequests,
  openCycles,
  downloadEvidence,
  removeEmployee,
  removeEvidence,
  saveDraftChanges,
  searchEmployees,
  submitRequest,
  uploadEvidence,
} from './increment-requests';
import { callApi, downloadFromApi } from './session';

vi.mock('./session', () => ({ callApi: vi.fn(), downloadFromApi: vi.fn() }));

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.mocked(callApi).mockResolvedValue({ kind: 'unavailable' });
});

function calls() {
  return vi.mocked(callApi).mock.calls.map(([path, , init]) => [path, init]);
}

describe('increment request client', () => {
  it('calls the documented paths', async () => {
    await openCycles();
    await searchEmployees(ID);
    await searchEmployees(ID, OTHER);
    await listRequests();
    await listRequests({ status: 'draft', page: 2, pageSize: 25 });
    await getRequest(ID);
    await createRequest({ cycleId: ID, employeeIds: [] }, 'key-12345678');
    await addEmployee(ID, OTHER);
    await removeEmployee(ID, OTHER);
    await saveDraftChanges(ID, { version: 1, proposals: [] });
    const form = new FormData();
    await uploadEvidence(ID, form);
    await removeEvidence(ID, OTHER);
    await submitRequest(ID, 4, 'key-12345678');
    expect(calls()).toEqual([
      ['/api/v1/increment-cycles/open', undefined],
      [`/api/v1/employees?entityId=${ID}`, undefined],
      [`/api/v1/employees?entityId=${ID}&excludeRequestId=${OTHER}`, undefined],
      ['/api/v1/increment-requests?page=1&pageSize=10', undefined],
      ['/api/v1/increment-requests?status=draft&page=2&pageSize=25', undefined],
      [`/api/v1/increment-requests/${ID}`, undefined],
      [
        '/api/v1/increment-requests',
        { method: 'POST', body: { cycleId: ID, employeeIds: [] }, idempotencyKey: 'key-12345678' },
      ],
      [`/api/v1/increment-requests/${ID}/lines`, { method: 'POST', body: { employeeId: OTHER } }],
      [`/api/v1/increment-requests/${ID}/lines/${OTHER}`, { method: 'DELETE' }],
      [
        `/api/v1/increment-requests/${ID}/draft`,
        { method: 'PUT', body: { version: 1, proposals: [] } },
      ],
      [`/api/v1/increment-requests/${ID}/evidence`, { method: 'POST', form, timeoutMs: 60_000 }],
      [`/api/v1/increment-requests/${ID}/evidence/${OTHER}`, { method: 'DELETE' }],
      [
        `/api/v1/increment-requests/${ID}/submit`,
        { method: 'POST', body: { version: 4 }, idempotencyKey: 'key-12345678' },
      ],
    ]);
  });

  it('sends the dashboard filters as encoded query parameters [R1-10]', async () => {
    await listRequests({ cycleId: ID, status: 'submitted', search: 'Omar & co', page: 3 });
    await dashboardSummary();
    await dashboardSummary({ cycleId: ID, search: 'مريم' });
    await listRequestLines({ requestId: OTHER, pageSize: 50 });
    expect(calls().map(([path]) => path)).toEqual([
      `/api/v1/increment-requests?cycleId=${ID}&status=submitted&search=Omar+%26+co&page=3&pageSize=10`,
      '/api/v1/increment-requests/summary',
      `/api/v1/increment-requests/summary?cycleId=${ID}&search=%D9%85%D8%B1%D9%8A%D9%85`,
      `/api/v1/increment-request-lines?requestId=${OTHER}&page=1&pageSize=50`,
    ]);
    expect(() => listRequestLines({ requestId: '../x' })).toThrow();
    expect(() => dashboardSummary({ cycleId: 'q3' })).toThrow();
  });

  it('downloads evidence through the API', async () => {
    vi.mocked(downloadFromApi).mockResolvedValue({ kind: 'not_found' });
    await expect(downloadEvidence(ID, OTHER)).resolves.toEqual({ kind: 'not_found' });
    expect(downloadFromApi).toHaveBeenCalledWith(
      `/api/v1/increment-requests/${ID}/evidence/${OTHER}`,
    );
    expect(() => downloadEvidence(ID, '../x')).toThrow();
  });

  it('never puts an unvalidated ID into a path', () => {
    expect(() => getRequest('../../me')).toThrow();
    expect(() => removeEmployee(ID, 'x/y')).toThrow();
    expect(callApi).not.toHaveBeenCalled();
  });
});
