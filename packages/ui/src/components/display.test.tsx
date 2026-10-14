import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from './alert.js';
import { Avatar, initials } from './avatar.js';
import { Badge } from './badge.js';
import { BrandMark, Wordmark } from './brand.js';
import { Card, CardBody, CardHeader, StatCard } from './card.js';
import { CriteriaProgress } from './criteria-progress.js';
import { EmptyState } from './empty-state.js';
import { FileChip } from './file-chip.js';
import { PageHeader } from './page-header.js';
import { ProgressSteps } from './progress-steps.js';
import { Skeleton, Spinner } from './spinner.js';

describe('Badge', () => {
  it.each([
    ['neutral', 'bg-line'],
    ['outline', 'border-line-strong'],
    ['info', 'text-brand-600'],
    ['info-outline', 'border-brand-300'],
    ['brand', 'bg-brand-600'],
    ['success', 'text-success-600'],
    ['danger', 'text-danger-600'],
    ['danger-solid', 'bg-danger-600'],
    ['warning', 'text-warning-700'],
  ] as const)('renders the %s tone with text', (tone, expected) => {
    render(<Badge tone={tone}>Label</Badge>);
    expect(screen.getByText('Label')).toHaveClass(expected);
  });

  it('defaults to neutral and can carry an icon', () => {
    const { container } = render(<Badge icon="check">Pass</Badge>);
    expect(screen.getByText('Pass')).toHaveAttribute('data-tone', 'neutral');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Card', () => {
  it('renders a plain panel, or a labelled section', () => {
    const { container } = render(<Card className="x">Body</Card>);
    expect(container.firstChild).toHaveClass('rounded-card', 'x');
    render(<Card label="Employees">Inside</Card>);
    expect(screen.getByRole('region', { name: 'Employees' })).toHaveTextContent('Inside');
  });

  it('renders a header with description and actions, at the chosen level', () => {
    render(
      <>
        <CardHeader
          title="Progress"
          description="Where it is"
          actions={<button type="button">Go</button>}
        />
        <CardHeader title="Sub" level={3} />
        <CardBody className="b">Body</CardBody>
      </>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByText('Where it is')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Sub' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toHaveClass('p-6', 'b');
  });

  it('renders stat cards, raised or subtle', () => {
    render(
      <>
        <StatCard label="Drafts" value={1} hint="Not yet submitted" />
        <StatCard label="Requests" value={3} subtle />
      </>,
    );
    expect(screen.getByText('Drafts').parentElement).toHaveClass('border');
    expect(screen.getByText('Not yet submitted')).toBeInTheDocument();
    expect(screen.getByText('Requests').parentElement).toHaveClass('bg-surface-muted');
  });
});

describe('PageHeader', () => {
  it('renders the page title with optional parts', () => {
    render(
      <PageHeader
        eyebrow="Subsidiary HR"
        title="Notifications"
        description="Every change"
        actions={<span>A</span>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Subsidiary HR')).toBeInTheDocument();
    expect(screen.getByText('Every change')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders the title alone', () => {
    const { container } = render(<PageHeader title="Reports" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});

describe('Alert', () => {
  it.each([
    ['info', 'text-brand-600', 'info'],
    ['success', 'text-success-700', 'check'],
    ['danger', 'text-danger-600', 'x'],
    ['warning', 'text-warning-700', 'alert'],
  ] as const)('renders the %s tone with its icon', (tone, titleClass, icon) => {
    const { container } = render(<Alert tone={tone} title="Title" />);
    expect(screen.getByText('Title')).toHaveClass(titleClass);
    expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
  });

  it('announces politely by default, with body and actions', () => {
    render(
      <Alert title="Waiting for Sirius HR" actions={<button type="button">Respond</button>}>
        Sent on 10 Oct
      </Alert>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Sent on 10 Oct');
    expect(screen.getByRole('button', { name: 'Respond' })).toBeInTheDocument();
  });

  it('can interrupt (alert) or stay silent (none)', () => {
    render(<Alert role="alert" tone="danger" title="Failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    const { container } = render(<Alert role="none" title="Quiet" />);
    expect(container.firstChild).not.toHaveAttribute('role');
  });
});

describe('initials', () => {
  it.each([
    ['Reviewer Test', 'RT'],
    ['Aisha bint Rahman', 'AR'],
    ['pf.reviewer', 'P'],
    ['  élodie   martin ', 'ÉM'],
    ['عائشة رحمن', 'عر'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('Avatar', () => {
  it('shows initials and is decorative', () => {
    render(<Avatar name="Deepak Juneja" className="x" />);
    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveTextContent('DJ');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('x');
  });
});

describe('brand', () => {
  it('renders the wordmark with the accent part and a decorative mark', () => {
    const { container } = render(<Wordmark lead="People" accent="Forge" tagline="HR Management" />);
    expect(screen.getByText('Forge')).toHaveClass('text-accent');
    expect(screen.getByText('HR Management')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const { container: mark } = render(<BrandMark className="size-10" />);
    expect(mark.querySelector('svg')).toHaveClass('size-10');
  });
});

describe('ProgressSteps', () => {
  it('fills reached stages, marks the current one and names states for screen readers', () => {
    render(
      <ProgressSteps
        label="Progress"
        stateLabels={{ done: 'completed', current: 'in progress', todo: 'not started' }}
        steps={[
          { label: 'Added to request', detail: '10 Oct 2026', state: 'done' },
          { label: 'Review', state: 'current' },
          { label: 'Decision', detail: 'Pending', state: 'todo' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(screen.getByRole('list', { name: 'Progress' })).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('Added to request — completed10 Oct 2026');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveTextContent('in progress');
    expect(items[2]).toHaveTextContent('not started');
    expect(items[2]?.querySelector('[aria-hidden="true"]')).toHaveClass('bg-line');
    expect(items[0]?.querySelector('[aria-hidden="true"]')).toHaveClass('bg-brand-600');
  });
});

describe('Spinner and Skeleton', () => {
  it('are decorative unless the spinner is labelled', () => {
    const { container } = render(
      <>
        <Spinner />
        <Skeleton className="h-4" />
      </>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    render(<Spinner label="Loading" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('explains the empty state with an optional action', () => {
    render(
      <EmptyState
        icon="bell"
        title="No notifications"
        description="You're all caught up."
        action={<button type="button">Refresh</button>}
      />,
    );
    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('renders the title alone with the default icon', () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.querySelector('[data-icon="file"]')).not.toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});

describe('CriteriaProgress', () => {
  const stateLabels = { pass: 'Pass', fail: 'Fail', pending: 'Not assessed' };

  it('marks each criterion by shape and shows the summary', () => {
    const { container } = render(
      <CriteriaProgress
        label="4/5 complete"
        stateLabels={stateLabels}
        results={[
          { code: 'C1', state: 'pass' },
          { code: 'C2', state: 'fail' },
          { code: 'C3', state: 'pending' },
        ]}
      />,
    );
    expect(screen.getByText('4/5 complete')).toHaveClass('text-ink');
    const marks = container.querySelectorAll('li');
    expect([...marks].map((mark) => mark.getAttribute('title'))).toEqual([
      'C1 · Pass',
      'C2 · Fail',
      'C3 · Not assessed',
    ]);
    expect(container.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="x"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="circle"]')).not.toBeNull();
    expect(container.querySelector('ul')).toHaveAttribute('aria-hidden', 'true');
  });

  it('highlights a complete set, and treats no criteria as incomplete', () => {
    render(
      <CriteriaProgress
        label="5/5 complete"
        stateLabels={stateLabels}
        results={[{ code: 'C1', state: 'pass' }]}
      />,
    );
    expect(screen.getByText('5/5 complete')).toHaveClass('text-brand-600');
    render(<CriteriaProgress label="0/0" stateLabels={stateLabels} results={[]} />);
    expect(screen.getByText('0/0')).toHaveClass('text-ink');
  });
});

describe('FileChip', () => {
  it('links the file for download and shows its details and action', () => {
    render(
      <FileChip
        name="appraisal-2026.pdf"
        meta="PDF · 2 KB"
        href="/requests/r/evidence/e"
        downloadLabel="Download appraisal-2026.pdf"
        action={<button type="button">Remove</button>}
        className="x"
      />,
    );
    const link = screen.getByRole('link', { name: 'Download appraisal-2026.pdf' });
    expect(link).toHaveAttribute('href', '/requests/r/evidence/e');
    expect(link).toHaveAttribute('download');
    expect(screen.getByText('PDF · 2 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('works without an action', () => {
    render(<FileChip name="a.png" meta="PNG" href="/x" downloadLabel="Download a.png" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
