import { guardedPlaceholder } from '@/server/guarded-page';

/** New increment request (R1-02–R1-06): built in slice S2. */
export default function NewRequestPage() {
  return guardedPlaceholder(
    ['increment_request:create'],
    'newRequest.heading',
    'newRequest.intro',
    'file',
  );
}
