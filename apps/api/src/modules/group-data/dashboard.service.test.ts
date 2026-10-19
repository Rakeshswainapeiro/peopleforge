import {
  CompensationSchema,
  ExecutiveViewSchema,
  GroupOverviewSchema,
} from '@peopleforge/contracts';
import type { ApprovedIncrementRecord, SummaryRow } from '@peopleforge/db';
import { describe, expect, it } from 'vitest';
import { fakeDirectory, SUB_A, SUB_B } from '../../test-support/factory.js';
import { workingDataQuality, workingGroupData } from '../../test-support/group-data.js';
import { alphaHr, reviewer } from '../../test-support/increment-requests.js';
import { GroupDashboardService } from './dashboard.service.js';

// The group dashboards' service (R2-05, R2-07): what it reads for whom, and which increments
// count towards D6.

const metrics = {
  headcount: 2,
  joiners: 0,
  leavers: 0,
  female: 1,
  male: 1,
  otherGender: 0,
  ageBands: { under_25: 0, '25_34': 2, '35_44': 0, '45_54': 0, '55_plus': 0, unknown: 0 },
  pay: [{ currency: 'AED', grade: 'G5', headcount: 2, payroll: '20000.00' }],
};
const SUMMARY: SummaryRow = {
  entityId: SUB_A,
  entityCode: 'SUB-A',
  period: '2026-09',
  department: 'Finance',
  metrics,
};

function increment(
  decidedAt: string,
  approved: ApprovedIncrementRecord['approved'] = null,
): ApprovedIncrementRecord {
  return {
    entityId: SUB_A,
    entityCode: 'SUB-A',
    cycleId: 'c',
    employeeNumber: 'EMP-1',
    currency: 'AED',
    currentSalary: '10000.00',
    proposedKind: 'percent',
    proposedValue: '5.00',
    approved,
    decidedAt: new Date(decidedAt),
  };
}

function setup() {
  const repository = workingGroupData();
  const quality = workingDataQuality();
  repository.summaries.mockResolvedValue([SUMMARY]);
  const service = new GroupDashboardService({
    repository,
    quality,
    directory: fakeDirectory({ alpha: [SUB_A] }),
  });
  return { repository, quality, service };
}

describe('GroupDashboardService [R2-05, R2-07]', () => {
  it('reads 12 months of figures for D5, the subsidiary filter applied', async () => {
    const { service, repository } = setup();
    const view = GroupOverviewSchema.parse(
      await service.overview(reviewer, { period: '2026-09', entityId: SUB_A }),
    );
    expect(view).toMatchObject({ headcount: 2, entities: 1, entitiesWithData: 1 });
    expect(repository.summaries).toHaveBeenCalledWith(expect.anything(), {
      from: '2025-10',
      to: '2026-09',
      entityId: SUB_A,
    });
    const all = await service.overview(reviewer, { period: '2026-09' });
    expect(all.entities).toBe(2);
    // Subsidiary HR: only their own subsidiaries (directory under RLS).
    expect((await service.overview(alphaHr, { period: '2026-09' })).entities).toBe(1);
  });

  it('counts increments decided in the period year up to its end (Dubai time), as approved', async () => {
    const { service, quality } = setup();
    quality.approvedIncrements.mockResolvedValue([
      increment('2026-03-10T08:00:00Z'),
      // 30 Sep 21:00 UTC is already 1 Oct in Dubai: after September.
      increment('2026-09-30T21:00:00Z'),
      increment('2025-12-31T08:00:00Z'),
      increment('2026-09-15T08:00:00Z', { kind: 'amount', value: '800.00' }),
    ]);
    const view = CompensationSchema.parse(
      await service.compensation(reviewer, { period: '2026-09', entityId: SUB_A }),
    );
    expect(view.increments).toMatchObject({ approved: 2, averagePercent: '6.5' });
    expect(view.increments.costImpact).toEqual([
      expect.objectContaining({ monthlyIncrease: '1300.00', annualIncrease: '15600.00' }),
    ]);
    expect(quality.approvedIncrements).toHaveBeenCalledWith(expect.anything(), { entityId: SUB_A });
  });

  it('gives Sirius the executive view with open flags, and refuses subsidiaries', async () => {
    const { service, quality } = setup();
    quality.flagsByEntity.mockResolvedValue([
      { entity: { id: SUB_A, code: 'SUB-A' }, counts: { open: 2, in_progress: 1, resolved: 4 } },
    ]);
    const view = ExecutiveViewSchema.parse(
      await service.executive(reviewer, { period: '2026-09' }),
    );
    expect(view.openFlags).toBe(3);
    expect(view.byEntity.map((entry) => [entry.entity.id, entry.missing])).toEqual([
      [SUB_A, false],
      [SUB_B, true],
    ]);
    await expect(service.executive(alphaHr, { period: '2026-09' })).rejects.toMatchObject({
      status: 403,
    });
  });
});
