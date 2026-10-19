import {
  RuleKindSchema,
  UploadComparisonSchema,
  type AnomalyRule,
  type Flag,
  type FlagDetail,
  type FlagPage,
  type FlagQuery,
  type UpdateFlag,
  type UpdateRule,
} from '@peopleforge/contracts';
import {
  DataQualityError,
  type DataQualityRepository,
  type FlagActivity,
  type FlagContext,
  type FlagRecord,
  type NewNotification,
  type RuleRecord,
} from '@peopleforge/db';
import {
  displayNameOf,
  permissionsOfPrincipal,
  scopeOf,
  type Principal,
} from '../../auth/principal.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type DomainError,
} from '../../errors/domain-errors.js';

function toDomainError(error: DataQualityError): DomainError {
  switch (error.reason) {
    case 'not_found':
      return new NotFoundError('Not found');
    case 'superseded':
      return new ConflictError('A newer version of the data closed this flag', [
        { path: 'status', code: 'superseded' },
      ]);
  }
}

async function guard<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error: unknown) {
    throw error instanceof DataQualityError ? toDomainError(error) : error;
  }
}

const iso = (value: Date) => value.toISOString();
const isoOrNull = (value: Date | null) => (value === null ? null : iso(value));

function toRule(record: RuleRecord): AnomalyRule {
  return {
    code: record.code,
    kind: RuleKindSchema.parse(record.kind),
    threshold: record.threshold,
    enabled: record.enabled,
    updatedAt: iso(record.updatedAt),
    updatedByName: record.updatedByName,
  };
}

/** A flag as the caller may see it: its values are pay, hidden without compensation access. */
export function toFlag(record: FlagRecord, pay: boolean): Flag {
  return {
    id: record.id,
    reference: record.reference,
    entity: record.entity,
    period: record.period,
    upload: record.upload,
    ruleCode: record.ruleCode,
    ruleKind: RuleKindSchema.parse(record.ruleKind),
    employeeNumber: record.employeeNumber,
    employeeName: record.employeeName,
    field: record.field,
    detail: pay ? record.detail : {},
    owner: record.owner,
    status: record.status,
    note: record.note,
    resolvedReason: record.resolvedReason,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
    resolvedAt: isoOrNull(record.resolvedAt),
  };
}

/** Audit details keep only display primitives (they never hold notes or values). */
function toActivity(entry: FlagActivity): FlagDetail['activity'][number] {
  const details = Object.fromEntries(
    Object.entries(entry.details).filter(
      (pair): pair is [string, string | number | boolean | null] =>
        pair[1] === null || ['string', 'number', 'boolean'].includes(typeof pair[1]),
    ),
  );
  return { action: entry.action, actorName: entry.actorName, at: iso(entry.at), details };
}

const canSeePay = (caller: Principal) =>
  permissionsOfPrincipal(caller).has('employee_data:read_compensation');

/** The notice for a flag's owner, unless they made the change themselves. */
function ownerNotice(caller: Principal, kind: string) {
  return ({ flag }: FlagContext): NewNotification[] =>
    flag.owner.id === caller.userId
      ? []
      : [
          {
            recipient: { userId: flag.owner.id },
            kind,
            entityId: flag.entity.id,
            requestId: null,
            params: {
              flag: flag.reference,
              flagId: flag.id,
              entity: flag.entity.code,
              actor: displayNameOf(caller),
              flagStatus: flag.status,
            },
            actionNeeded: flag.status !== 'resolved',
          },
        ];
}

/**
 * Data quality (R2-09 … R2-11, DASH-D7): the anomaly rules (admins, `template:configure`) and
 * the flags (`anomaly:resolve`): owner, status (open → in progress → resolved, a note to
 * resolve), reminders and activity. Subsidiary HR sees and works its own flags only (RLS).
 */
export class DataQualityService {
  constructor(private readonly repository: DataQualityRepository) {}

  async rules(caller: Principal): Promise<AnomalyRule[]> {
    return (await this.repository.rules(scopeOf(caller))).map(toRule);
  }

  async updateRule(caller: Principal, code: string, input: UpdateRule): Promise<AnomalyRule> {
    const rule = await guard(
      this.repository.updateRule(scopeOf(caller), code, {
        ...input,
        actorName: displayNameOf(caller),
      }),
    );
    return toRule(rule);
  }

  async flags(caller: Principal, query: FlagQuery): Promise<FlagPage> {
    const scope = scopeOf(caller);
    const filter = {
      period: query.period,
      entityId: query.entityId,
      status: query.status,
      ruleCode: query.rule,
    };
    const page = await this.repository.flags(scope, {
      ...filter,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    const byEntity = await this.repository.flagsByEntity(scope, { ...filter, status: undefined });
    const variations =
      query.period === undefined
        ? []
        : await this.repository.variations(scope, query.period, query.entityId);
    const rules = await this.repository.rules(scope);
    const pay = canSeePay(caller);
    return {
      items: page.items.map((flag) => toFlag(flag, pay)),
      rules: rules.map((rule) => ({ code: rule.code, kind: RuleKindSchema.parse(rule.kind) })),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      counts: page.counts,
      oldestOpenAt: isoOrNull(page.oldestOpenAt),
      byEntity,
      variations: variations.map((row) => ({
        entity: row.entity,
        upload: row.upload,
        comparison: UploadComparisonSchema.nullable().parse(row.comparison),
        flags: row.flags,
      })),
    };
  }

  async flag(caller: Principal, id: string): Promise<FlagDetail> {
    const scope = scopeOf(caller);
    const found = await this.repository.flag(scope, id);
    if (found === null) throw new NotFoundError('Flag not found');
    return {
      flag: toFlag(found.flag, canSeePay(caller)),
      activity: found.activity.map(toActivity),
      previousId: found.previousId,
      nextId: found.nextId,
      owners: await this.repository.owners(scope, found.flag.entity.id),
    };
  }

  async updateFlag(caller: Principal, id: string, input: UpdateFlag): Promise<Flag> {
    const scope = scopeOf(caller);
    let owner: { id: string; name: string } | null = null;
    if (input.ownerId !== null) {
      const found = await this.repository.flag(scope, id);
      if (found === null) throw new NotFoundError('Flag not found');
      const candidates = await this.repository.owners(scope, found.flag.entity.id);
      const me = { id: caller.userId, name: displayNameOf(caller) };
      owner =
        input.ownerId === caller.userId
          ? me
          : (candidates.find((candidate) => candidate.id === input.ownerId) ?? null);
      if (owner === null) {
        throw new ValidationError('Unknown owner', [{ path: 'ownerId', code: 'not_found' }]);
      }
    }
    const flag = await guard(
      this.repository.updateFlag(scope, id, {
        owner,
        status: input.status,
        note: input.note,
        notifications: ownerNotice(caller, 'flag_updated'),
      }),
    );
    return toFlag(flag, canSeePay(caller));
  }

  /** "Send reminder" (Sirius HR): an in-app and email nudge to the flag's owner (R2-11). */
  async remind(caller: Principal, id: string): Promise<void> {
    if (caller.scope !== 'group') throw new ForbiddenError('Only Sirius HR sends reminders');
    await guard(
      this.repository.remind(scopeOf(caller), id, (context) => [
        {
          recipient: { userId: context.flag.owner.id },
          kind: 'flag_reminder',
          entityId: context.flag.entity.id,
          requestId: null,
          params: {
            flag: context.flag.reference,
            flagId: context.flag.id,
            entity: context.flag.entity.code,
            actor: displayNameOf(caller),
          },
          actionNeeded: true,
        },
      ]),
    );
  }
}
