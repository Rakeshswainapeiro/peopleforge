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
        labels={criteriaLabels(t)}
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
    // Figma: complete cards are calm, incomplete ones amber; the mark shows the result.
    expect(c1).toHaveAttribute('data-complete', 'true');
    expect(c1).toHaveClass('border-success-200');
    expect(c1.querySelector('[data-state]')).toHaveAttribute('data-state', 'pass');
    expect(within(c1).getByText('PDF, PNG, JPG, XLSX · max 10 MB')).toBeInTheDocument();
    expect(within(c1).getByText('Evidence required')).toHaveClass('sr-only');
    const c3 = screen.getByRole('article', { name: 'C3 · [Placeholder] Criterion 3' });
    expect(c3).toHaveAccessibleDescription('To complete: add a justification, attach evidence.');
    expect(c3).toHaveClass('border-warning-200');
    const c4 = screen.getByRole('article', { name: 'C4 · [Placeholder] Criterion 4' });
    expect(c4.querySelector('[data-state]')).toHaveAttribute('data-state', 'pending');
    expect(within(c4).getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'Why does this employee pass or fail this criterion?',
    );
    // C5 takes files but doesn't need them: no asterisk.
    const c5 = screen.getByRole('article', { name: 'C5 · [Placeholder] Criterion 5' });
    expect(within(c5).queryByText('Evidence required')).toBeNull();
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
          labels={criteriaLabels(t)}
          maxJustification={2000}
          messages={[]}
        />
      </DraftForm>,
    );
    expect(screen.queryByLabelText(/Attach a file/u)).toBeNull();
    expect(screen.queryByText(/max 10 MB/u)).toBeNull();
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
      required
      canAdd
      labels={{
        attach: 'Attach file',
        attachFor: 'Attach a file for C1',
        uploading: 'Uploading and scanning…',
        rules: 'PDF · max 1 kB',
        required: 'Evidence required',
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

  it('offers no upload at the file limit, still showing the rules', () => {
    files({ canAdd: false, files: [], required: false });
    expect(screen.queryByLabelText('Attach a file for C1')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('PDF · max 1 kB')).toBeInTheDocument();
    expect(screen.queryByText('Evidence required')).toBeNull();
  });
});

function readyPanel(canSubmit: boolean) {
  const view = readyView(draftRequest(), 'en', t, 'submit-key-123');
  return render(
    <DraftForm
      formId="draft-form"
      requestId={REQUEST_ID}
      version={3}
      editable
      saveLabel="Save draft"
    >
      <ReadyPanel {...view} canSubmit={canSubmit} />
    </DraftForm>,
  );
}

describe('ReadyPanel', () => {
  it('lists readiness and keeps Submit disabled with its reason', () => {
    readyPanel(false);
    expect(screen.getByTestId('ready-note')).toHaveTextContent(
      '2 of 2 employees still have incomplete criteria. Submit unlocks when every employee is 5/5.',
    );
    expect(screen.getByText('3 criteria incomplete')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit to Sirius HR' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(/^On submit the request is routed to Sirius HR/u);
  });

  it('marks a ready employee', () => {
    render(
      <DraftForm formId="f" requestId={REQUEST_ID} version={1} editable saveLabel="Save">
        <ReadyPanel
          items={[
            {
              lineId: LINE_1,
              fullName: 'Omar Haddad',
              ready: true,
              status: 'All 5 criteria complete',
            },
          ]}
          note="Note"
          canSubmit
          submitKey="k"
          submitLabels={{
            submit: 'Submit',
            submitting: 'Submitting…',
            cancel: 'Cancel',
            title: 'Submit?',
            body: 'Body',
            unsaved: 'Saved first',
          }}
          caption="Later"
        />
      </DraftForm>,
    );
    const row = screen.getByText('All 5 criteria complete').closest('li');
    expect(row).toHaveAttribute('data-ready', 'true');
    expect(row?.querySelector('[data-state]')).toHaveAttribute('data-state', 'pass');
  });

  it('confirms before submitting, then posts the draft form with intent=submit [R1-07]', async () => {
    const { container } = readyPanel(true);
    await userEvent.click(screen.getByRole('button', { name: 'Submit to Sirius HR' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit INC-2026-0001 to Sirius HR?' });
    expect(dialog).toHaveTextContent('2 employees go to Sirius HR for review.');
    expect(dialog).toHaveTextContent('Anything you changed on this page is saved first.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Submit to Sirius HR' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Submit to Sirius HR',
    });
    expect(confirm).toHaveAttribute('form', 'draft-form');
    expect(confirm).toHaveAttribute('name', 'intent');
    expect(confirm).toHaveAttribute('value', 'submit');
    const form = container.querySelector<HTMLFormElement>('form#draft-form');
    expect(new FormData(form ?? undefined).get('submitKey')).toBe('submit-key-123');
    await userEvent.click(confirm);
    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalled();
    });
    const posted = vi.mocked(saveDraft).mock.calls[0]?.[1];
    expect(posted?.get('intent')).toBe('submit');
    expect(posted?.get('submitKey')).toBe('submit-key-123');
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
