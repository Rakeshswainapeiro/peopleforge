import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  publishTemplateAction,
  remindFlagAction,
  updateFlagAction,
  updateRuleAction,
  uploadGroupDataAction,
} from '@/app/(portal)/group/actions';
import { FlagForm } from './flag-form';
import { RuleForm } from './rule-form';
import { TemplateEditor, templateBody, type TemplateFieldDraft } from './template-editor';
import { UploadForm } from './upload-form';

vi.mock('@/app/(portal)/group/actions', () => ({
  publishTemplateAction: vi.fn(),
  remindFlagAction: vi.fn(),
  updateFlagAction: vi.fn(),
  updateRuleAction: vi.fn(),
  uploadGroupDataAction: vi.fn(),
}));

// The group data forms (R2-01, R2-02, R2-10, R2-11): what they send, and what they say back.

const MESSAGES = [
  ['group.errors.invalid', 'Check the values.'],
  ['group.errors.noteRequired', 'Write a resolution note.'],
] as const;

beforeEach(() => {
  vi.mocked(uploadGroupDataAction).mockResolvedValue({ attempt: 1, error: 'group.errors.invalid' });
  vi.mocked(updateFlagAction).mockResolvedValue({ attempt: 1, done: true });
  vi.mocked(remindFlagAction).mockResolvedValue({ attempt: 1, done: true });
  vi.mocked(updateRuleAction).mockResolvedValue({ attempt: 1, done: true });
  vi.mocked(publishTemplateAction).mockResolvedValue({ attempt: 1, done: true });
});

const uploadLabels = {
  form: 'Upload a month',
  entity: 'Subsidiary',
  period: 'Month',
  file: 'File',
  fileHint: 'Excel or CSV',
  upload: 'Upload',
  uploading: 'Checking the file…',
};

describe('UploadForm [R2-01]', () => {
  it('asks for a subsidiary when there are several, and shows a refusal', async () => {
    const user = userEvent.setup();
    render(
      <UploadForm
        entities={[
          { value: 'a', label: 'SUB-A' },
          { value: 'b', label: 'SUB-B' },
        ]}
        periods={[{ value: '2026-09', label: 'September 2026' }]}
        period="2026-09"
        labels={uploadLabels}
        messages={MESSAGES}
      />,
    );
    await user.upload(
      screen.getByLabelText(/File/u),
      new File(['a'], 'a.csv', { type: 'text/csv' }),
    );
    // jsdom doesn't count a chosen file for `required`: submit the form directly.
    fireEvent.submit(screen.getByRole('form', { name: 'Upload a month' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the values.');
    const sent = vi.mocked(uploadGroupDataAction).mock.calls[0]?.[1];
    expect(sent?.get('entityId')).toBe('a');
    expect(sent?.get('period')).toBe('2026-09');
  });

  it('carries a single subsidiary hidden, and shows an unknown key as is', async () => {
    vi.mocked(uploadGroupDataAction).mockResolvedValue({
      attempt: 1,
      error: 'group.errors.generic',
    });
    const user = userEvent.setup();
    const { container } = render(
      <UploadForm
        entities={[{ value: 'a', label: 'SUB-A' }]}
        periods={[{ value: '2026-09', label: 'September 2026' }]}
        period="2026-09"
        labels={uploadLabels}
        messages={MESSAGES}
      />,
    );
    expect(container.querySelector('input[name="entityId"]')).toHaveValue('a');
    await user.upload(screen.getByLabelText(/File/u), new File(['a'], 'a.csv'));
    fireEvent.submit(screen.getByRole('form', { name: 'Upload a month' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('group.errors.generic');
  });
});

const flagLabels = {
  form: 'Resolution',
  owner: 'Owner',
  status: 'Status',
  note: 'Resolution note',
  noteHint: 'Required to resolve.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved.',
  remind: 'Send reminder',
  reminding: 'Sending…',
  reminded: 'Reminder sent.',
};

function flagForm(canRemind = true) {
  return render(
    <FlagForm
      flagId="f-1"
      ownerId="u-1"
      status="open"
      note=""
      owners={[
        { value: 'u-1', label: 'Priya' },
        { value: 'u-2', label: 'Sara' },
      ]}
      statuses={[
        { value: 'open', label: 'Open' },
        { value: 'resolved', label: 'Resolved' },
      ]}
      canRemind={canRemind}
      labels={flagLabels}
      messages={MESSAGES}
    />,
  );
}

describe('FlagForm [R2-11]', () => {
  it('saves owner, status and note, then says so', async () => {
    const user = userEvent.setup();
    flagForm();
    await user.selectOptions(screen.getByLabelText('Owner'), 'u-2');
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');
    await user.type(screen.getByLabelText('Resolution note'), 'Checked.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    const sent = vi.mocked(updateFlagAction).mock.calls[0]?.[1];
    expect([
      sent?.get('flagId'),
      sent?.get('ownerId'),
      sent?.get('status'),
      sent?.get('note'),
    ]).toEqual(['f-1', 'u-2', 'resolved', 'Checked.']);
  });

  it('shows a refusal and sends a reminder', async () => {
    vi.mocked(updateFlagAction).mockResolvedValue({
      attempt: 1,
      error: 'group.errors.noteRequired',
    });
    const user = userEvent.setup();
    flagForm();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Write a resolution note.');
    await user.click(screen.getByRole('button', { name: 'Send reminder' }));
    expect(await screen.findByText('Reminder sent.')).toBeInTheDocument();
    expect(vi.mocked(remindFlagAction).mock.calls[0]?.[1].get('flagId')).toBe('f-1');
  });

  it('shows a reminder refusal, unknown keys as they are, and no reminder without permission', async () => {
    vi.mocked(remindFlagAction).mockResolvedValue({ attempt: 1, error: 'group.errors.forbidden' });
    const user = userEvent.setup();
    const { unmount } = flagForm();
    await user.click(screen.getByRole('button', { name: 'Send reminder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('group.errors.forbidden');
    unmount();
    flagForm(false);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).toBeNull();
  });
});

const ruleLabels = {
  title: 'Salary changed sharply',
  body: 'More than 20%.',
  changed: 'Default setting',
  on: 'On',
  threshold: 'Threshold',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved.',
};

describe('RuleForm [R2-10]', () => {
  it('saves a threshold and says so', async () => {
    const user = userEvent.setup();
    render(
      <RuleForm
        code="ANM-03"
        threshold="20"
        enabled
        unit="%"
        labels={ruleLabels}
        messages={MESSAGES}
      />,
    );
    const form = screen.getByRole('form', { name: 'Salary changed sharply' });
    const input = within(form).getByLabelText('Threshold (%)');
    await user.clear(input);
    await user.type(input, '25');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    const sent = vi.mocked(updateRuleAction).mock.calls[0]?.[1];
    expect([sent?.get('code'), sent?.get('threshold'), sent?.get('enabled')]).toEqual([
      'ANM-03',
      '25',
      'on',
    ]);
  });

  it('starts empty when a rule with a unit has no threshold yet', () => {
    render(
      <RuleForm
        code="ANM-09"
        threshold={null}
        enabled
        unit="%"
        labels={ruleLabels}
        messages={MESSAGES}
      />,
    );
    expect(screen.getByLabelText('Threshold (%)')).toHaveValue('');
  });

  it('has no threshold for rules without one, and shows a refusal', async () => {
    vi.mocked(updateRuleAction).mockResolvedValue({ attempt: 1, error: 'group.errors.invalid' });
    const user = userEvent.setup();
    render(
      <RuleForm
        code="ANM-01"
        threshold={null}
        enabled={false}
        unit={null}
        labels={ruleLabels}
        messages={MESSAGES}
      />,
    );
    expect(screen.queryByLabelText(/Threshold/u)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the values.');
    vi.mocked(updateRuleAction).mockResolvedValue({ attempt: 2, error: 'group.errors.stale' });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('group.errors.stale');
    });
  });
});

const core: TemplateFieldDraft = {
  key: 'gender',
  labelEn: 'Gender',
  labelAr: '',
  type: 'enum',
  required: true,
  allowed: 'female, male',
  palmHr: '',
  core: true,
  locked: true,
};

const editorLabels = {
  form: 'Employee data template',
  key: 'Key',
  labelEn: 'Column (English)',
  labelAr: 'Column (Arabic)',
  type: 'Type',
  required: 'Required',
  allowed: 'Allowed values',
  palmHr: 'Palm HR field',
  remove: 'Remove',
  add: 'Add a field',
  note: 'Publishing creates version 2.',
  publish: 'Publish version 2',
  publishing: 'Publishing…',
  published: 'Published.',
};

const TYPES = [
  { value: 'text' as const, label: 'Text' },
  { value: 'enum' as const, label: 'List of values' },
];

describe('templateBody', () => {
  it('sends allowed values only for lists, required for locked fields, empty Palm HR as null', () => {
    expect(
      templateBody(1, [
        { ...core, required: false, allowed: ' female , , male ', palmHr: ' gender_code ' },
        { ...core, key: ' note ', type: 'text', allowed: 'x', locked: false, required: false },
      ]),
    ).toEqual({
      version: 1,
      fields: [
        {
          key: 'gender',
          label: { en: 'Gender', ar: '' },
          type: 'enum',
          required: true,
          allowedValues: ['female', 'male'],
          palmHrField: 'gender_code',
        },
        {
          key: 'note',
          label: { en: 'Gender', ar: '' },
          type: 'text',
          required: false,
          allowedValues: [],
          palmHrField: null,
        },
      ],
    });
  });
});

describe('TemplateEditor [R2-02, R2-14]', () => {
  function editor() {
    return render(
      <TemplateEditor
        version={1}
        fields={[core]}
        types={TYPES}
        labels={editorLabels}
        messages={MESSAGES}
      />,
    );
  }

  const sentTemplate = (call = 0) =>
    JSON.parse(
      vi.mocked(publishTemplateAction).mock.calls[call]?.[1].get('template') as string,
    ) as {
      fields: {
        key: string;
        label: { en: string; ar: string };
        type: string;
        required: boolean;
        palmHrField: string | null;
      }[];
    };

  it('keeps core fields fixed, adds, edits and removes added fields, then publishes', async () => {
    const user = userEvent.setup();
    editor();
    expect(screen.getByLabelText('Key 1')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Type gender')).toBeDisabled();
    expect(screen.getByLabelText('Required gender')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove gender' })).toBeNull();
    await user.type(screen.getByLabelText('Column (Arabic) gender'), 'الجنس');
    await user.type(screen.getByLabelText('Palm HR field gender'), 'gender_code');
    await user.clear(screen.getByLabelText('Allowed values gender'));
    await user.type(screen.getByLabelText('Allowed values gender'), 'female, male, other');

    await user.click(screen.getByRole('button', { name: 'Add a field' }));
    await user.clear(screen.getByLabelText('Key 2'));
    await user.type(screen.getByLabelText('Key 2'), 'project');
    await user.type(screen.getByLabelText('Column (English) project'), 'Project');
    await user.click(screen.getByLabelText('Required project'));
    await user.selectOptions(screen.getByLabelText('Type project'), 'enum');
    await user.click(screen.getByRole('button', { name: 'Add a field' }));
    await user.click(screen.getByRole('button', { name: 'Remove field_3' }));

    await user.click(screen.getByRole('button', { name: 'Publish version 2' }));
    expect(await screen.findByText('Published.')).toBeInTheDocument();
    const sent = sentTemplate();
    expect(sent.fields.map((field) => field.key)).toEqual(['gender', 'project']);
    expect(sent.fields[0]).toMatchObject({ label: { ar: 'الجنس' }, palmHrField: 'gender_code' });
    expect(sent.fields[1]).toMatchObject({
      type: 'enum',
      required: true,
      label: { en: 'Project' },
    });
  });

  it('ignores an unknown type and shows a refusal', async () => {
    vi.mocked(publishTemplateAction).mockResolvedValue({
      attempt: 1,
      error: 'group.errors.invalid',
    });
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByRole('button', { name: 'Add a field' }));
    const select = screen.getByLabelText('Type field_2');
    const option = document.createElement('option');
    option.value = 'binary';
    select.append(option);
    await user.selectOptions(select, 'binary');
    expect(select).toHaveValue('text');
    await user.click(screen.getByRole('button', { name: 'Publish version 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the values.');
    vi.mocked(publishTemplateAction).mockResolvedValue({ attempt: 2, error: 'group.errors.stale' });
    await user.click(screen.getByRole('button', { name: 'Publish version 2' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('group.errors.stale');
    });
  });
});
