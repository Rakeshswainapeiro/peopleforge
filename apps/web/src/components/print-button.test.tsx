import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintButton } from './print-button';

afterEach(cleanup);

describe('PrintButton [R2-07]', () => {
  it('opens the browser print dialog', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<PrintButton label="Print / Save as PDF" />);
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });
});
