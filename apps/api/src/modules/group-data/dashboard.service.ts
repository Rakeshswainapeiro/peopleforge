import {
  BUSINESS_TIME_ZONE,
  type Compensation,
  type ExecutiveQuery,
  type ExecutiveView,
  type GroupDashboardQuery,
  type GroupOverview,
} from '@peopleforge/contracts';
import type { DataQualityRepository, EntityDirectory, GroupDataRepository } from '@peopleforge/db';
import { scopeOf, type Principal } from '../../auth/principal.js';
import { ForbiddenError } from '../../errors/domain-errors.js';
import { figuresOf } from '../increment-requests/money.js';
import { monthsBefore } from './compare.js';
import {
  compensation,
  executiveView,
  groupOverview,
  parseRows,
  type EntityRef,
  type Figures,
} from './dashboards.js';

export interface GroupDashboardDependencies {
  repository: GroupDataRepository;
  quality: DataQualityRepository;
  directory: EntityDirectory;
}

/** The month (YYYY-MM) of an instant in the business time zone. */
function monthOf(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).format(instant);
}

/**
 * The group dashboards (R2-05, R2-07): D5 Group overview (`employee_data:read`), D6
 * Compensation trends (`employee_data:read_compensation`) and D8 Executive / IHC view
 * (`report:read_executive`, Sirius only). Subsidiary HR see their own subsidiaries (RLS).
 * Totals only: built from stored per-department figures, never from individual salaries.
 */
export class GroupDashboardService {
  constructor(private readonly deps: GroupDashboardDependencies) {}

  private async data(
    caller: Principal,
    period: string,
    entityId: string | undefined,
  ): Promise<{ rows: Figures[]; entities: EntityRef[] }> {
    const scope = scopeOf(caller);
    const [summaries, entities] = await Promise.all([
      this.deps.repository.summaries(scope, {
        from: monthsBefore(period, 11),
        to: period,
        entityId,
      }),
      this.deps.directory.entities(scope),
    ]);
    return {
      rows: parseRows(summaries),
      entities: entities
        .filter((entity) => entityId === undefined || entity.id === entityId)
        .map((entity) => ({ id: entity.id, code: entity.code })),
    };
  }

  async overview(caller: Principal, query: GroupDashboardQuery): Promise<GroupOverview> {
    const { rows, entities } = await this.data(caller, query.period, query.entityId);
    return groupOverview({ period: query.period, rows, entities, department: query.department });
  }

  async compensation(caller: Principal, query: GroupDashboardQuery): Promise<Compensation> {
    const { rows, entities } = await this.data(caller, query.period, query.entityId);
    const year = query.period.slice(0, 4);
    const approved = await this.deps.quality.approvedIncrements(scopeOf(caller), {
      entityId: query.entityId,
    });
    // Increments decided in the period's year, up to the end of the month (business time).
    const increments = approved
      .filter((record) => {
        const month = monthOf(record.decidedAt);
        return month.startsWith(year) && month <= query.period;
      })
      .map((record) => {
        const figures = figuresOf(
          record.currentSalary,
          record.approved?.kind ?? record.proposedKind,
          record.approved?.value ?? record.proposedValue,
        );
        return {
          entity: { id: record.entityId, code: record.entityCode },
          currency: record.currency,
          increase: figures.increase,
          percent: figures.percent,
        };
      });
    return compensation({
      period: query.period,
      rows,
      entities,
      department: query.department,
      bands: await this.deps.repository.gradeBands(scopeOf(caller)),
      increments,
    });
  }

  async executive(caller: Principal, query: ExecutiveQuery): Promise<ExecutiveView> {
    if (caller.scope !== 'group') throw new ForbiddenError('Group view for Sirius only');
    const { rows, entities } = await this.data(caller, query.period, undefined);
    const flags = await this.deps.quality.flagsByEntity(scopeOf(caller), { period: query.period });
    const openFlags = new Map(
      flags.map((row) => [row.entity.id, row.counts.open + row.counts.in_progress]),
    );
    return executiveView({ period: query.period, rows, entities, openFlags });
  }
}
