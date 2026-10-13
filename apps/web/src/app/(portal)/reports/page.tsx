import { guardedPlaceholder } from '@/server/guarded-page';

/** Reports (R1-14, RP-01): built in slice S7. */
export default function ReportsPage() {
  return guardedPlaceholder(
    ['report:read_operational', 'report:read_executive'],
    'reports.heading',
    'reports.intro',
  );
}
