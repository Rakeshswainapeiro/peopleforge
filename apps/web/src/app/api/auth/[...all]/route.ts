import { getAuth } from '@/server/auth';

/** Better Auth endpoints: sign-in start, provider callback, session, sign-out (ADR-003). */
export function GET(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export function POST(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
