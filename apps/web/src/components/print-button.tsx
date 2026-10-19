'use client';

import { Button } from '@peopleforge/ui';

/** "Print / Save as PDF": the browser's print dialog, for the presentation views (R2-07). */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      icon="download"
      className="print:hidden"
      onClick={() => {
        window.print();
      }}
    >
      {label}
    </Button>
  );
}
