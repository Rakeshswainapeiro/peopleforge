import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  removeEvidenceAction,
  saveDraft,
  uploadEvidenceAction,
} from '@/app/(portal)/requests/actions';
import { createTranslator } from '@/i18n/translator';
import { criteriaCards, criteriaLabels, evidenceMessages, readyView } from '@/lib/request-view';
import {
  CRITERION_IDS,
  draftRequest,
  EVIDENCE_ID,
  LINE_1,
  must,
  REQUEST_ID,
} from '@/test-support/requests';
import { CriteriaEditor } from './criteria-editor';
import { DraftForm, useDraftForm } from './draft-form';
import { EvidenceFiles } from './evidence-files';
import { ReadyPanel } from './ready-panel';

vi.mock('@/app/(portal)/requests/actions', () => ({
  saveDraft: vi.fn(),
  removeEmployeeAction: vi.fn(),
  uploadEvidenceAction: vi.fn(),
  removeEvidenceAction: vi.fn(),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const t = createTranslator('en');
const C1 = String(CRITERION_IDS[0]);
const C3 = String(CRITERION_IDS[2]);

function editor() {
  const draft = draftRequest();
  const omar = draft.lines[0];
  if (omar === undefined) throw new Error('fixture');
  return render(
    <DraftForm
      formId="draft-form"
      requestId={REQUEST_ID}
      version={3}
      employee={LINE_1}
      editable
      saveLabel="Save draft"
    >
      <CriteriaEditor
        requestId={REQUEST_ID}
        lineId={LINE_1}
        criteria={criteriaCards(draft, omar, 'en', t)}
        labels={criteriaLabels('en', t)}
        maxJustification={2000}
        messages={evidenceMessages(t)}
      />
    </DraftForm>,
  );
}

function draftData(container: HTMLElement): FormData {
  const form = container.querySelector<HTMLFormElement>('form#draft-form');
  if (form === null) throw new Error('no form');
  return new FormData(form);
}

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(saveDraft).mockResolvedValue({ rows: [] });
  vi.mocked(uploadEvidenceAction).mockResolvedValue({ ok: true });
  vi.mocked(removeEvidenceAction).mockResolvedValue({ ok: true });
});

describe('CriteriaEditor [R1-03, R1-06]', () => {
  it('shows each criterion with its result, justification and completeness', () => {
    editor();
    const c1 = screen.getByRole('article', { name: 'C1 · [Placeholder] Criterion 1' });
    expect(within(c1).getByRole('radio', { name: 'Pass' })).toBeChecked();
    expect(within(c1).getByRole('textbox', { name: /^Justification/u })).toHaveValue(
      'Rated 4 of 5 in the 2026 appraisal.',
    );
    expect(within(c1).getByText('Complete')).toBeInTheDocument();
    const c3 = screen.getByRole('article', { name: 'C3 · [Placeholder] Criterion 3' });
    expect(c3).toHaveAccessibleDescription('To complete: add a justification, attach evidence');
    expect(within(c3).getByText('Not complete yet')).toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'C2 · [Placeholder] Criterion 2' })).getByRole(
        'radio',
        { name: 'Fail' },
      ),
    ).toBeChecked();
  });

  it('posts the employee’s criteria with the draft form', async () => {
    const { container } = editor();
    const c3 = screen.getByRole('article', { name: 'C3 · [Placeholder] Criterion 3' });
    await userEvent.click(within(c3).getByText('Fail'));
    await userEvent.type(within(c3).getByRole('textbox'), 'Warning issued in May.');
    const data = draftData(container);
    expect(data.get('assessmentLineId')).toBe(LINE_1);
    expect(data.getAll('criterionId')).toEqual(CRITERION_IDS);
    expect(data.get(`result:${C3}`)).toBe('fail');
    expect(data.get(`justification:${C3}`)).toBe('Warning issued in May.');
    expect(data.get(`result:${String(CRITERION_IDS[3])}`)).toBeNull();
  });

  it('keeps what was typed when a save is refused', async () => {
    vi.mocked(saveDraft).mockResolvedValue({
      error: 'request.errors.stale',
      rows: [],
      criteria: {
        lineId: LINE_1,
        results: [{ criterionId: C1, result: 'fail', justification: 'Changed my mind.' }],
      },
    });
    const { container } = editor();
    const form = container.querySelector<HTMLFormElement>('form#draft-form');
    form?.requestSubmit();
    const c1 = screen.getByRole('article', { name: 'C1 · [Placeholder] Criterion 1' });
    await waitFor(() => {
      expect(within(c1).getByRole('textbox')).toHaveValue('Changed my mind.');
    });
    expect(within(c1).getByRole('radio', { name: 'Fail' })).toBeChecked();
  });

  it('ignores typed values that belong to another employee', async () => {
    vi.mocked(saveDraft).mockResolvedValue({
      rows: [],
      criteria: { lineId: 'other', results: [{ criterionId: C1, result: '', justification: 'x' }] },
    });
    const { container } = editor();
    container.querySelector<HTMLFormElement>('form#draft-form')?.requestSubmit();
    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalled();
    });
    const c1 = screen.getByRole('article', { name: 'C1 · [Placeholder] Criterion 1' });
    expect(within(c1).getByRole('textbox')).toHaveValue('Rated 4 of 5 in the 2026 appraisal.');
  });

  it('says when a criterion needs no files', () => {
    const draft = draftRequest();
    const first = draft.criteria[0];
    if (first !== undefined) first.evidencePolicy = 'none';
    render(
      <DraftForm formId="f" requestId={REQUEST_ID} version={1} editable saveLabel="Save">
        <CriteriaEditor
          requestId={REQUEST_ID}
          lineId={LINE_1}
          criteria={criteriaCards(draft, must(draft.lines[0]), 'en', t).slice(0, 1)}
          labels={criteriaLabels('en', t)}
          maxJustification={2000}
          messages={[]}
        />
      </DraftForm>,
    );
    expect(screen.getByText('No files needed for this criterion.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Attach a file/u)).toBeNull();
  });
});

function files(overrides: Partial<Parameters<typeof EvidenceFiles>[0]> = {}) {
  return render(
    <EvidenceFiles
      requestId={REQUEST_ID}
      lineId={LINE_1}
      criterionId={C1}
      files={[
        {
          id: EVIDENCE_ID,
          fileName: 'appraisal-2026.pdf',
          meta: 'PDF · 2 kB',
          href: `/requests/${REQUEST_ID}/evidence/${EVIDENCE_ID}`,
          downloadLabel: 'Download appraisal-2026.pdf',
          removeLabel: 'Remove appraisal-2026.pdf',
        },
      ]}
      accept="application/pdf"
      maxBytes={1024}
      canAdd
      labels={{
        attach: 'Attach file',
        attachFor: 'Attach a file for C1',
        uploading: 'Uploading and scanning…',
        noFiles: 'No files attached yet.',
      }}
      messages={evidenceMessages(t)}
      {...overrides}
    />,
  );
}

const pdf = (size = 10) => new File(['x'.repeat(size)], 'letter.pdf', { type: 'application/pdf' });

describe('EvidenceFiles [R1-04]', () => {
  it('uploads a chosen file at once and refreshes the page', async () => {
    files();
    const input = screen.getByLabelText('Attach a file for C1');
    expect(input).toHaveAttribute('accept', 'application/pdf');
    await userEvent.upload(input, pdf());
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledOnce();
    });
    const sent = vi.mocked(uploadEvidenceAction).mock.calls[0]?.[0];
    expect(sent?.get('requestId')).toBe(REQUEST_ID);
    expect(sent?.get('lineId')).toBe(LINE_1);
    expect(sent?.get('criterionId')).toBe(C1);
    expect((sent?.get('file') as File).name).toBe('letter.pdf');
  });

  it('refuses a file over the limit without sending it', async () => {
    files();
    await userEvent.upload(screen.getByLabelText('Attach a file for C1'), pdf(2048));
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is too large.');
    expect(uploadEvidenceAction).not.toHaveBeenCalled();
  });

  it('shows why an upload was refused, and clears it after a success', async () => {
    vi.mocked(uploadEvidenceAction).mockResolvedValueOnce({
      ok: false,
      error: 'evidence.errors.infected',
    });
    files();
    const input = screen.getByLabelText('Attach a file for C1');
    await userEvent.upload(input, pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent('The malware scan rejected');
    expect(refresh).not.toHaveBeenCalled();
    await userEvent.upload(input, pdf());
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('ignores a cancelled file choice', () => {
    files();
    const input = screen.getByLabelText<HTMLInputElement>('Attach a file for C1');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(uploadEvidenceAction).not.toHaveBeenCalled();
  });

  it('removes a file and refreshes; shows a failure', async () => {
    files();
    await userEvent.click(screen.getByRole('button', { name: 'Remove appraisal-2026.pdf' }));
    await waitFor(() => {
      expect(removeEvidenceAction).toHaveBeenCalledWith(REQUEST_ID, EVIDENCE_ID);
    });
    expect(refresh).toHaveBeenCalledOnce();
    vi.mocked(removeEvidenceAction).mockResolvedValueOnce({
      ok: false,
      error: 'unknown.key' as never,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Remove appraisal-2026.pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('unknown.key');
  });

  it('offers no upload at the file limit, and says when there are no files', () => {
    files({ canAdd: false, files: [] });
    expect(screen.getByText('No files attached yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Attach a file for C1')).toBeNull();
  });
});

describe('ReadyPanel', () => {
  it('lists readiness and keeps Submit disabled with its reason', () => {
    render(<ReadyPanel {...readyView(draftRequest(), 'en', t)} />);
    expect(screen.getByTestId('ready-summary')).toHaveTextContent('0 of 2 employees ready');
    expect(screen.getByRole('button', { name: 'Submit to Sirius HR' })).toBeDisabled();
  });

  it('marks a ready employee', () => {
    render(
      <ReadyPanel
        summary="1 of 1 employees ready"
        items={[{ lineId: LINE_1, fullName: 'Omar Haddad', ready: true, status: 'Ready' }]}
        note="Note"
        submitLabel="Submit to Sirius HR"
        caption="Later"
      />,
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});

describe('useDraftForm', () => {
  it('fails loudly outside a DraftForm', () => {
    function Orphan() {
      useDraftForm();
      return null;
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow('useDraftForm must be used inside <DraftForm>');
  });
});
