import { describe, expect, it } from 'vitest';
import {
  editRequestHref,
  employeeStatusHref,
  evidenceHref,
  requestHref,
  requestLinkFor,
} from './routes';

const ID = '11111111-1111-4111-8111-111111111111';
const LINE = '22222222-2222-4222-8222-222222222221';

describe('routes', () => {
  it('builds every request link, with optional query parameters', () => {
    expect(requestHref(ID)).toBe(`/requests/${ID}`);
    expect(requestHref(ID, { submitted: '1' })).toBe(`/requests/${ID}?submitted=1`);
    expect(editRequestHref(ID)).toBe(`/requests/${ID}/edit`);
    expect(editRequestHref(ID, { error: 'request.errors.generic', employee: LINE })).toBe(
      `/requests/${ID}/edit?error=request.errors.generic&employee=${LINE}`,
    );
    expect(employeeStatusHref(ID, LINE)).toBe(`/requests/${ID}/employees/${LINE}`);
    expect(evidenceHref(ID, LINE)).toBe(`/requests/${ID}/evidence/${LINE}`);
  });

  it('sends a draft to the editor and anything else to its detail page', () => {
    expect(requestLinkFor(ID, 'draft')).toBe(`/requests/${ID}/edit`);
    expect(requestLinkFor(ID, 'submitted')).toBe(`/requests/${ID}`);
  });
});
