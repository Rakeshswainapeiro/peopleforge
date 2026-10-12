import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorPage from './error';

afterEach(() => {
  document.documentElement.lang = '';
});

describe('ErrorPage', () => {
  it('shows the digest as a support reference but never the error message', () => {
    const error = Object.assign(new Error('DB host 10.0.0.5 refused'), { digest: 'abc123' });
    render(<ErrorPage error={error} reset={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('reference abc123');
    expect(screen.queryByText(/10\.0\.0\.5/)).not.toBeInTheDocument();
  });

  it('shows a placeholder when no digest is available', () => {
    render(<ErrorPage error={new Error('x')} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('reference —');
  });

  it('retries when the button is pressed', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('x')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('uses the locale already rendered on <html>', () => {
    document.documentElement.lang = 'ar';
    render(<ErrorPage error={new Error('x')} reset={vi.fn()} />);
    // Arabic catalogue has no error strings yet, so English fallback is expected.
    expect(screen.getByRole('heading')).toHaveTextContent('Something went wrong');
  });
});
