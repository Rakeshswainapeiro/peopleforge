import type { Me } from '@peopleforge/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestLocale } from '@/i18n/request-locale';
import { requireViewer } from '@/server/session';
import { getCriteriaSettings, getReminderRules } from '@/server/settings';
import { criteriaSettings } from '@/test-support/requests';
import { getAnomalyRules, getTemplateSettings } from '@/server/group-data';
import { anomalyRules, fieldTemplate } from '@/test-support/group';
import { publishCriteriaAction } from './actions';
import SettingsPage from './page';

vi.mock('@/i18n/request-locale', () => ({ getRequestLocale: vi.fn() }));
vi.mock('@/server/session', () => ({ requireViewer: vi.fn() }));
vi.mock('@/server/settings', () => ({ getCriteriaSettings: vi.fn(), getReminderRules: vi.fn() }));
vi.mock('./actions', () => ({ publishCriteriaAction: vi.fn(), updateReminderAction: vi.fn() }));
vi.mock('@/app/(portal)/group/actions', () => ({
  publishTemplateAction: vi.fn(),
  updateRuleAction: vi.fn(),
}));
vi.mock('@/server/group-data', () => ({ getTemplateSettings: vi.fn(), getAnomalyRules: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const ADMIN: Me = {
  userId: 'admin-1',
  username: 'pf.admin',
  name: 'Admin Test',
  roles: ['PeopleForge.Admin'],
  scope: 'group',
  permissions: ['criteria:configure', 'audit:read'],
  entities: [],
};

const rule = (kind: 'review_overdue' | 'return_overdue' | 'deadline_approaching', days = 2) => ({
  kind,
  days,
  enabled: kind !== 'return_overdue',
  updatedAt: '2026-10-18T06:00:00.000Z',
  updatedByName: kind === 'review_overdue' ? 'Admin Test' : null,
});

beforeEach(() => {
  cleanup();
  vi.mocked(getRequestLocale).mockResolvedValue('en');
  vi.mocked(requireViewer).mockResolvedValue(ADMIN);
  vi.mocked(getCriteriaSettings).mockResolvedValue({ kind: 'ok', data: criteriaSettings() });
  vi.mocked(getReminderRules).mockResolvedValue({
    kind: 'ok',
    data: [rule('review_overdue'), rule('return_overdue'), rule('deadline_approaching', 3)],
  });
});

describe('Group data settings [R2-02, R2-10, NFR-CFG-01]', () => {
  beforeEach(() => {
    vi.mocked(requireViewer).mockResolvedValue({
      ...ADMIN,
      permissions: ['criteria:configure', 'template:configure'],
    });
    vi.mocked(getTemplateSettings).mockResolvedValue({ kind: 'ok', data: fieldTemplate() });
    vi.mocked(getAnomalyRules).mockResolvedValue({ kind: 'ok', data: anomalyRules() });
  });

  it('shows the field template editor and each anomaly rule', async () => {
    render(await SettingsPage());
    const editor = screen.getByRole('form', { name: 'Employee data template' });
    expect(within(editor).getByLabelText('Key 1')).toHaveValue('employee_number');
    expect(within(editor).getByLabelText('Required employee_number')).toBeDisabled();
    expect(within(editor).getByLabelText('Required project')).not.toBeDisabled();
    expect(within(editor).getByLabelText('Palm HR field grade')).toHaveValue('grade_code');
    expect(
      within(editor).getByRole('button', { name: 'Publish template version 2' }),
    ).toBeInTheDocument();
    const salary = screen.getByRole('form', { name: 'Salary changed sharply' });
    expect(within(salary).getByLabelText('Threshold (%)')).toHaveValue('20');
    expect(salary).toHaveTextContent(/Changed by Admin/u);
    const stable = screen.getByRole('form', { name: 'Salary changed after a long stable period' });
    expect(within(stable).getByLabelText('Threshold (months)')).toHaveValue('12');
    const missing = screen.getByRole('form', { name: 'Employee missing' });
    expect(within(missing).queryByLabelText(/Threshold/u)).toBeNull();
  });

  it('words a template without an activation date', async () => {
    vi.mocked(getTemplateSettings).mockResolvedValue({
      kind: 'ok',
      data: fieldTemplate({ activatedAt: null }),
    });
    render(await SettingsPage());
    expect(screen.getByText(/Template version 1, in use since —/u)).toBeInTheDocument();
  });
});

describe('Settings [R1-05, R1-13, NFR-CFG-01]', () => {
  it('lets admins edit the criteria as the next version', async () => {
    render(await SettingsPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Version 1, active since 1 Oct 2026. Requests already created keep the criteria they started with.',
      ),
    ).toBeInTheDocument();
    const c1 = screen.getByRole('group', { name: 'C1' });
    expect(within(c1).getByLabelText(/^Name \(English\) · C1/u)).toHaveValue(
      '[Placeholder] Criterion 1',
    );
    expect(within(c1).getByLabelText(/^Name \(Arabic\) · C1/u)).toHaveAttribute('dir', 'rtl');
    expect(within(c1).getByLabelText(/^Evidence · C1/u)).toHaveValue('required');
    expect(within(c1).getByRole('checkbox', { name: /justification is required/u })).toBeChecked();
    expect(screen.getAllByRole('group')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Publish version 2' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Publishing creates version 2. New requests use it; requests already created keep version 1.',
      ),
    ).toBeInTheDocument();
  });

  it('confirms a publish in the reader’s words', async () => {
    vi.mocked(publishCriteriaAction).mockResolvedValue({ attempt: 1, published: 2 });
    render(await SettingsPage());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish version 2' }));
    expect(await screen.findByText('Version 2 published.')).toBeInTheDocument();
  });

  it('shows each reminder trigger with its days, state and who changed it', async () => {
    render(await SettingsPage());
    const review = screen.getByRole('form', { name: "Waiting for Sirius HR's review" });
    expect(within(review).getByRole('spinbutton', { name: 'Days' })).toHaveValue(2);
    expect(within(review).getByRole('checkbox', { name: 'On' })).toBeChecked();
    expect(review).toHaveTextContent('Changed by Admin Test on 18 Oct 2026, 10:00');
    const returned = screen.getByRole('form', { name: 'Returned and not resubmitted' });
    expect(within(returned).getByRole('checkbox', { name: 'On' })).not.toBeChecked();
    expect(returned).toHaveTextContent('Default setting');
    expect(
      within(screen.getByRole('form', { name: 'Submission deadline approaching' })).getByRole(
        'spinbutton',
      ),
    ).toHaveValue(3);
  });

  it('words a version without an activation date', async () => {
    vi.mocked(getCriteriaSettings).mockResolvedValue({
      kind: 'ok',
      data: criteriaSettings({ activatedAt: null, version: 4 }),
    });
    render(await SettingsPage());
    expect(screen.getByText(/^Version 4\. Requests already created/u)).toBeInTheDocument();
  });

  it('is not found without criteria:configure, and handles a dead session or API', async () => {
    vi.mocked(requireViewer).mockResolvedValue({ ...ADMIN, permissions: ['audit:read'] });
    await expect(SettingsPage()).rejects.toThrow('NEXT_NOT_FOUND');
    vi.mocked(requireViewer).mockResolvedValue(null);
    await expect(SettingsPage()).resolves.toBeNull();
    vi.mocked(requireViewer).mockResolvedValue(ADMIN);
    vi.mocked(getReminderRules).mockResolvedValue({ kind: 'unauthenticated' });
    await expect(SettingsPage()).rejects.toThrow('NEXT_REDIRECT /session-ended');
    vi.mocked(getReminderRules).mockResolvedValue({ kind: 'unavailable' });
    await expect(SettingsPage()).rejects.toThrow('Settings API unavailable');
  });
});
