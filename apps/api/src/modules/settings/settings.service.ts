import type {
  CriteriaSettings,
  PublishCriteria,
  ReminderKind,
  ReminderRule,
  UpdateReminderRule,
} from '@peopleforge/contracts';
import {
  SettingsDataError,
  type ActiveCriteriaRecord,
  type ReminderRuleRecord,
  type SettingsRepository,
} from '@peopleforge/db';
import { displayNameOf, scopeOf, type Principal } from '../../auth/principal.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type DomainError,
} from '../../errors/domain-errors.js';
import { effectiveMaxFileMb } from '../increment-requests/criteria.js';

function toDomainError(error: SettingsDataError): DomainError {
  switch (error.reason) {
    case 'not_found':
      return new NotFoundError('Setting not found');
    case 'version_conflict':
      return new ConflictError('The criteria changed since they were read', [
        { path: 'version', code: 'stale' },
      ]);
    case 'criteria_mismatch':
      return new ValidationError('Criteria must keep their codes and order', [
        { path: 'criteria', code: 'mismatch' },
      ]);
  }
}

/** Expected refusals become 4xx; anything else is a real failure. */
async function guard<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error: unknown) {
    throw error instanceof SettingsDataError ? toDomainError(error) : error;
  }
}

function toRule(record: ReminderRuleRecord): ReminderRule {
  return { ...record, updatedAt: record.updatedAt.toISOString() };
}

function toCriteria(record: ActiveCriteriaRecord): CriteriaSettings {
  return {
    id: record.id,
    version: record.version,
    activatedAt: record.activatedAt === null ? null : record.activatedAt.toISOString(),
    criteria: record.criteria.map((criterion) => ({
      ...criterion,
      maxFileMb: effectiveMaxFileMb(criterion),
    })),
  };
}

/**
 * The increment portal's settings (R1-05, R1-13, NFR-CFG-01) for `criteria:configure`
 * (checked by the controller): the eligibility criteria, published as versions, and the
 * reminder triggers. Every change is audited with the admin's name.
 */
export class SettingsService {
  constructor(private readonly repository: SettingsRepository) {}

  async reminderRules(caller: Principal): Promise<ReminderRule[]> {
    return (await this.repository.reminderRules(scopeOf(caller))).map(toRule);
  }

  async updateReminderRule(
    caller: Principal,
    kind: ReminderKind,
    input: UpdateReminderRule,
  ): Promise<ReminderRule> {
    const rule = await guard(
      this.repository.updateReminderRule(scopeOf(caller), kind, {
        ...input,
        actorName: displayNameOf(caller),
      }),
    );
    return toRule(rule);
  }

  async criteria(caller: Principal): Promise<CriteriaSettings> {
    return toCriteria(await guard(this.repository.activeCriteria(scopeOf(caller))));
  }

  async publishCriteria(caller: Principal, input: PublishCriteria): Promise<CriteriaSettings> {
    return toCriteria(await guard(this.repository.publishCriteria(scopeOf(caller), input)));
  }
}
