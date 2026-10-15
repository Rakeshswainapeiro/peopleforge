/**
 * Every link to an increment request, in one place: a URL change is a one-line change here.
 * IDs reach these already validated (they come from the API or a parsed route).
 */

function withQuery(path: string, query: Readonly<Record<string, string>> = {}): string {
  const search = new URLSearchParams(query).toString();
  return search === '' ? path : `${path}?${search}`;
}

/** A request's detail page (submitted onwards); for a draft it forwards to the editor. */
export function requestHref(id: string, query?: Readonly<Record<string, string>>): string {
  return withQuery(`/requests/${id}`, query);
}

/** The draft editor (Figma "New increment request"). */
export function editRequestHref(id: string, query?: Readonly<Record<string, string>>): string {
  return withQuery(`/requests/${id}/edit`, query);
}

/** The right page for a request in this status: the editor for a draft, else its detail. */
export function requestLinkFor(id: string, status: string): string {
  return status === 'draft' ? editRequestHref(id) : requestHref(id);
}

/** One employee of a request (Figma "Employee status"). */
export function employeeStatusHref(requestId: string, lineId: string): string {
  return `/requests/${requestId}/employees/${lineId}`;
}

/** An evidence file, downloaded through the web app's route (ADR-010). */
export function evidenceHref(requestId: string, evidenceId: string): string {
  return `/requests/${requestId}/evidence/${evidenceId}`;
}
