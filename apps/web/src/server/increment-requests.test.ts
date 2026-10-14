import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEmployee,
  createRequest,
  getRequest,
  listRequests,
  openCycles,
  removeEmployee,
  saveProposals,
  searchEmployees,
} from './increment-requests';
import { callApi } from './session';

vi.mock('./session', () => ({ callApi: vi.fn() }));

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
    await saveProposals(ID, { version: 1, proposals: [] });
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
        `/api/v1/increment-requests/${ID}/proposals`,
        { method: 'PUT', body: { version: 1, proposals: [] } },
      ],
    ]);
  });

  it('never puts an unvalidated ID into a path', () => {
    expect(() => getRequest('../../me')).toThrow();
    expect(() => removeEmployee(ID, 'x/y')).toThrow();
    expect(callApi).not.toHaveBeenCalled();
  });
});
