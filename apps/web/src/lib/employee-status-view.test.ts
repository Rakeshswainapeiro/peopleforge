import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translator';
import {
  CRITERION_IDS,
  draftRequest,
  EVIDENCE_ID,
  must,
  notStarted,
  REQUEST_ID,
} from '@/test-support/requests';
import { criterionRows, employeeCards } from './employee-status-view';
import { formatMoney } from './format';

const aed = (value: string) => formatMoney(value, 'AED', 'en');

const t = createTranslator('en');
const request = draftRequest();
const omar = must(request.lines[0]);
const neha = must(request.lines[1]);

describe('employeeCards [R1-06]', () => {
  it('shows the money and how many criteria passed, naming what is left', () => {
    expect(employeeCards(omar, 'en', t)).toEqual([
      { label: 'Current salary', value: aed('21500.00'), hint: 'Per month' },
      { label: 'Proposed', value: '8%', hint: `+ ${aed('1720.00')} per month` },
      { label: 'New salary if approved', value: aed('23220.00'), hint: 'Per month' },
      // C1 passed; C2 failed; C3–C5 not complete.
      { label: 'Criteria passed', value: '1 of 5', hint: '3 not complete' },
    ]);
  });

  it('says when nothing is proposed yet', () => {
    const [, proposed, newSalary, passed] = employeeCards(neha, 'en', t);
    expect(proposed).toEqual({ label: 'Proposed', value: '—', hint: 'Not proposed yet' });
    expect(newSalary?.value).toBe('—');
    expect(passed).toMatchObject({ value: '0 of 5', hint: '5 not complete' });
  });

  it('counts failures once everything is complete, and all passed', () => {
    const complete = (result: 'pass' | 'fail') => ({
      ...notStarted(String(CRITERION_IDS[0])),
      result,
      missing: [],
    });
    const oneFailed = { ...omar, criteria: [complete('pass'), complete('fail')] };
    expect(employeeCards(oneFailed, 'en', t)[3]).toMatchObject({
      value: '1 of 2',
      hint: '1 failed',
    });
    const allPassed = { ...omar, criteria: [complete('pass')] };
    expect(employeeCards(allPassed, 'en', t)[3]).toMatchObject({
      value: '1 of 1',
      hint: 'All passed',
    });
  });
});

describe('criterionRows', () => {
  it('lists each criterion with its result, justification and files to download', () => {
    const rows = criterionRows(request, omar, 'en', t);
    expect(rows[0]).toEqual({
      id: CRITERION_IDS[0],
      code: 'C1',
      name: 'C1 · [Placeholder] Criterion 1',
      result: { tone: 'success', icon: 'check', label: 'Pass' },
      justification: 'Rated 4 of 5 in the 2026 appraisal.',
      evidence: [
        {
          id: EVIDENCE_ID,
          name: 'appraisal-2026.pdf',
          href: `/requests/${REQUEST_ID}/evidence/${EVIDENCE_ID}`,
          label: 'Download appraisal-2026.pdf',
        },
      ],
    });
    expect(rows[1]?.result).toEqual({ tone: 'danger', icon: 'x', label: 'Fail' });
    expect(rows[2]?.justification).toBe('None');
    expect(rows[3]?.result).toEqual({ tone: 'outline', icon: undefined, label: 'Not set' });
  });

  it('leaves out a criterion the API sent no assessment for', () => {
    expect(criterionRows(request, { ...omar, criteria: [] }, 'en', t)).toEqual([]);
  });
});
