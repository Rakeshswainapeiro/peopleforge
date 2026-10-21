import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishCriteriaAction, updateReminderAction } from '@/app/(portal)/settings/actions';
import type { CriterionFields } from '@/lib/settings-view';
import { CriteriaSettingsForm } from './criteria-settings-form';
import { ReminderRuleForm } from './reminder-rule-form';

vi.mock('@/app/(portal)/settings/actions', () => ({
  publishCriteriaAction: vi.fn(),
  updateReminderAction: vi.fn(),
}));

const MESSAGES = [
  ['settings.errors.invalid', 'Check the highlighted values.'],
  ['settings.errors.stale', 'Someone published other criteria meanwhile.'],
] as const;

const C1: CriterionFields = {
  key: 'C1',
  code: 'C1',
  nameEn: 'Performance rating',
  nameAr: '',
  descriptionEn: 'Latest appraisal.',
  descriptionAr: '',
  justificationRequired: true,
  evidencePolicy: 'required',
  maxFileMb: '10',
  thresholdOperator: '',
  thresholdValue: '',
  thresholdUnit: 'rating',
};

function criteriaForm() {
  return render(
    <CriteriaSettingsForm
      version={1}
      criteria={[C1]}
      maxFileMb={10}
      maxCriteria={2}
      messages={MESSAGES}
      labels={{
        nameEn: 'Name (English)',
        nameAr: 'Name (Arabic)',
        descriptionEn: 'Description (English)',
        descriptionAr: 'Description (Arabic)',
        arabicHint: 'Optional.',
        justificationRequired: 'A justification is required',
        evidence: 'Evidence',
        maxFileMb: 'Largest file (MB)',
        maxFileHint: '1 to 10 MB per file.',
        policies: [
          { value: 'required', label: 'Required' },
          { value: 'optional', label: 'Optional' },
          { value: 'none', label: 'Not needed' },
        ],
        passesOn: 'Passes on',
        passModes: [
          { value: '', label: 'Pass or Fail, by judgement' },
          { value: 'gte', label: 'A measured value, at least' },
          { value: 'lte', label: 'A measured value, at most' },
        ],
        thresholdValue: 'Threshold',
        thresholdValueHint: 'e.g. 3.5',
        thresholdUnit: 'Measured in',
        units: [
          { value: 'rating', label: 'Rating' },
          { value: 'percent', label: 'Percent' },
        ],
        newCriterion: 'New criterion',
        addCriterion: 'Add a criterion',
        removeCriterion: 'Remove {code}',
        removeNew: 'Remove this criterion',
        limit: 'Up to 2 criteria.',
        note: 'Publishing creates version 2.',
        publish: 'Publish version 2',
        publishing: 'Publishing…',
        published: 'Version {version} published.',
      }}
    />,
  );
}

function reminderForm() {
  return render(
    <ReminderRuleForm
      kind="review_overdue"
      days={2}
      enabled
      maxDays={30}
      messages={MESSAGES}
      labels={{
        title: 'Waiting for review',
        body: 'Reminds reviewers.',
        changed: 'Default setting',
        on: 'On',
        days: 'Days',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved.',
      }}
    />,
  );
}

beforeEach(() => {
  vi.mocked(publishCriteriaAction).mockResolvedValue({ attempt: 1, published: 2 });
  vi.mocked(updateReminderAction).mockResolvedValue({ attempt: 1, saved: true });
});

describe('CriteriaSettingsForm [R1-05]', () => {
  it('publishes what was edited and confirms the new version', async () => {
    const user = userEvent.setup();
    criteriaForm();
    const name = screen.getByLabelText(/^Name \(English\) · C1/u);
    await user.clear(name);
    await user.type(name, 'Appraisal rating');
    await user.selectOptions(screen.getByLabelText(/^Evidence · C1/u), 'optional');
    await user.click(screen.getByRole('checkbox', { name: /justification is required/u }));
    await user.click(screen.getByRole('button', { name: 'Publish version 2' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Version 2 published.');
    });
    const sent = vi.mocked(publishCriteriaAction).mock.calls[0]?.[1];
    expect(sent?.get('nameEn')).toBe('Appraisal rating');
    expect(sent?.get('evidencePolicy')).toBe('optional');
    expect(sent?.get('justification-C1')).toBeNull();
    expect(sent?.get('version')).toBe('1');
  });

  it('adds a criterion with a threshold, up to the limit, and removes one [R1-05]', async () => {
    const user = userEvent.setup();
    criteriaForm();
    expect(screen.getByRole('button', { name: 'Remove C1' })).toBeDisabled();
    const add = screen.getByRole('button', { name: 'Add a criterion' });
    await user.click(add);
    expect(add).toBeDisabled();
    expect(screen.getByRole('group', { name: 'New criterion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove this criterion' })).toBeEnabled();
    await user.type(screen.getByLabelText(/^Name \(English\) · New criterion/u), 'Attendance');
    // The threshold fields appear once a measured value is chosen.
    expect(screen.getByLabelText(/^Threshold · New criterion/u)).not.toBeVisible();
    await user.selectOptions(screen.getByLabelText(/^Passes on · New criterion/u), 'gte');
    expect(screen.getByLabelText(/^Threshold · New criterion/u)).toBeVisible();
    await user.type(screen.getByLabelText(/^Threshold · New criterion/u), '95');
    await user.selectOptions(screen.getByLabelText(/^Measured in · New criterion/u), 'percent');
    await user.click(screen.getByRole('button', { name: 'Remove C1' }));
    expect(screen.queryByRole('group', { name: 'C1' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Publish version 2' }));
    await waitFor(() => {
      expect(publishCriteriaAction).toHaveBeenCalled();
    });
    const sent = vi.mocked(publishCriteriaAction).mock.calls.at(-1)?.[1];
    expect(sent?.getAll('rowKey')).toEqual(['new-1']);
    expect(sent?.getAll('code')).toEqual(['']);
    expect(sent?.get('nameEn')).toBe('Attendance');
    expect(sent?.get('thresholdOperator')).toBe('gte');
    expect(sent?.get('thresholdValue')).toBe('95');
    expect(sent?.get('thresholdUnit')).toBe('percent');
    expect(sent?.get('justification-new-1')).toBe('on');
  });

  it('shows a refusal and keeps what was typed', async () => {
    vi.mocked(publishCriteriaAction).mockResolvedValue({
      attempt: 1,
      error: 'settings.errors.invalid',
      fields: [{ ...C1, nameEn: '' }],
    });
    const user = userEvent.setup();
    criteriaForm();
    await user.click(screen.getByRole('button', { name: 'Publish version 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the highlighted values.');
    expect(screen.getByLabelText(/^Name \(English\) · C1/u)).toHaveValue('');
  });

  it('shows an untranslated error key rather than nothing', async () => {
    vi.mocked(publishCriteriaAction).mockResolvedValue({
      attempt: 1,
      error: 'settings.errors.generic',
    });
    const user = userEvent.setup();
    criteriaForm();
    await user.click(screen.getByRole('button', { name: 'Publish version 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('settings.errors.generic');
  });
});

describe('ReminderRuleForm [R1-13]', () => {
  it('saves days and on/off, then says so', async () => {
    const user = userEvent.setup();
    reminderForm();
    const days = screen.getByRole('spinbutton', { name: 'Days' });
    await user.clear(days);
    await user.type(days, '4');
    await user.click(screen.getByRole('checkbox', { name: 'On' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
    const sent = vi.mocked(updateReminderAction).mock.calls[0]?.[1];
    expect(sent?.get('kind')).toBe('review_overdue');
    expect(sent?.get('days')).toBe('4');
    expect(sent?.get('enabled')).toBeNull();
  });

  it('shows a refusal', async () => {
    vi.mocked(updateReminderAction).mockResolvedValue({
      attempt: 1,
      error: 'settings.errors.stale',
    });
    const user = userEvent.setup();
    reminderForm();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone published');
    vi.mocked(updateReminderAction).mockResolvedValue({
      attempt: 2,
      error: 'settings.errors.generic',
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('settings.errors.generic');
  });
});
