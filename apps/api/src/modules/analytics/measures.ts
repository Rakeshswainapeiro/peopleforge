import { BUSINESS_TIME_ZONE, type IncrementAnalytics } from '@peopleforge/contracts';
import type { AnalyticsFacts, AnalyticsRequestFact, MessageFact } from '@peopleforge/db';

/**
 * Turnaround time (R1-11, DASH-D3) and back-and-forth (R1-12, DASH-D4) from the review's facts
 * (ADR-006): elapsed days (24 h each), one decimal, measured to `now` while still open. Pure, so
 * the page and RP-02 share one calculation and the tests use worked examples.
 *
 * - Request TAT: submission → final decision (or now).
 * - Criterion TAT: from when the criterion started waiting for Sirius HR (submission, or the
 *   employee's resubmission after a return) → its verification.
 * - Back-and-forth: each return → its resubmission (or now): time with the subsidiary; each
 *   question from Sirius HR → the subsidiary's next message about that employee.
 */

const DAY_MS = 86_400_000;

/** Elapsed days between two instants, never negative. */
export function elapsedDays(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

/** Days with one decimal, as shown: 1.25 → "1.3" (half away from zero). */
export function days(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** The average of some durations, or null when there are none. */
export function averageDays(values: readonly number[]): string | null {
  return values.length === 0
    ? null
    : days(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** The median of some durations (the mean of the middle two for an even count), or null. */
export function medianDays(values: readonly number[]): string | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // The middle one (odd count) or two (even count).
  const middle = sorted.slice(
    Math.floor((sorted.length - 1) / 2),
    Math.floor(sorted.length / 2) + 1,
  );
  return days(middle.reduce((sum, value) => sum + value, 0) / middle.length);
}

const MONTH = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
});

/** "2026-09": an instant's month in the business time zone (Asia/Dubai). */
export function businessMonth(at: Date): string {
  return MONTH.format(at).slice(0, 7);
}

/** The 12 months up to `now`'s month, oldest first. */
export function lastTwelveMonths(now: Date): string[] {
  const [year, month] = businessMonth(now).split('-').map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 12 + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

/** Durations by the month they ended in, as the trend's rows. */
function trendOf(
  ended: readonly { at: Date; value: number }[],
  now: Date,
): IncrementAnalytics['tat']['trend'] {
  return lastTwelveMonths(now).map((month) => {
    const values = ended
      .filter((item) => businessMonth(item.at) === month)
      .map((item) => item.value);
    return {
      month,
      count: values.length,
      averageDays: averageDays(values),
      medianDays: medianDays(values),
    };
  });
}

/** Groups items by a key, keeping the first-seen order of keys. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

/** Questions answered: each Sirius HR message to the subsidiary's next one about that employee. */
function answerTimes(messages: readonly MessageFact[]): { asked: number; answered: number[] } {
  let asked = 0;
  const answered: number[] = [];
  for (const thread of groupBy(messages, (message) => message.lineId).values()) {
    let waitingSince: Date | null = null;
    for (const message of thread) {
      if (message.side === 'sirius') {
        asked += 1;
        // Several questions in a row are answered together: measure from the first.
        waitingSince ??= message.at;
      } else if (waitingSince !== null) {
        answered.push(elapsedDays(waitingSince, message.at));
        waitingSince = null;
      }
    }
  }
  return { asked, answered };
}

export function incrementAnalytics(
  facts: AnalyticsFacts,
  now: Date,
  criterion?: string,
): IncrementAnalytics {
  const tatOf = (request: AnalyticsRequestFact) =>
    elapsedDays(request.submittedAt, request.decidedAt ?? now);
  const requestRows = facts.requests
    .map((request) => ({
      id: request.id,
      reference: request.reference,
      entityCode: request.entityCode,
      status: request.status,
      employees: request.employees,
      submittedAt: request.submittedAt.toISOString(),
      decidedAt: request.decidedAt === null ? null : request.decidedAt.toISOString(),
      value: tatOf(request),
      open: request.decidedAt === null,
    }))
    .sort((a, b) => b.value - a.value || a.reference.localeCompare(b.reference));
  const byRequest = requestRows.map(({ value, ...row }) => ({ ...row, days: days(value) }));
  const decided = requestRows.filter((row) => !row.open);
  const open = requestRows.filter((row) => row.open);
  const longest = byRequest.find((row) => row.open) ?? null;

  const sortedVerifications = [...facts.verifications].sort((a, b) => a.position - b.position);
  const codes = [...new Set(sortedVerifications.map((verification) => verification.code))];
  const verifications = sortedVerifications.filter(
    (verification) => criterion === undefined || verification.code === criterion,
  );
  const byCriterion = [...groupBy(verifications, (verification) => verification.code)].map(
    ([code, items]) => {
      const values = items.map((item) => elapsedDays(item.waitingSince, item.verifiedAt));
      return {
        code,
        verified: items.length,
        averageDays: averageDays(values),
        medianDays: medianDays(values),
        // A group always has at least one verification.
        maxDays: days(Math.max(...values)),
      };
    },
  );
  const trend = trendOf(
    criterion === undefined
      ? facts.requests.flatMap((request) =>
          request.decidedAt === null ? [] : [{ at: request.decidedAt, value: tatOf(request) }],
        )
      : verifications.map((item) => ({
          at: item.verifiedAt,
          value: elapsedDays(item.waitingSince, item.verifiedAt),
        })),
    now,
  );

  const byEntityTat = [...groupBy(requestRows, (row) => row.entityCode)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([entityCode, rows]) => ({
      entityCode,
      requests: rows.length,
      decided: rows.filter((row) => !row.open).length,
      averageDays: averageDays(rows.filter((row) => !row.open).map((row) => row.value)),
      openAverageDays: averageDays(rows.filter((row) => row.open).map((row) => row.value)),
    }));

  // Back-and-forth per request.
  const returnsOf = groupBy(facts.returns, (item) => item.requestId);
  const messagesOf = groupBy(facts.messages, (item) => item.requestId);
  const flows = facts.requests.map((request) => {
    const returns = returnsOf.get(request.id) ?? [];
    const returnValues = returns.map((item) =>
      elapsedDays(item.returnedAt, item.resubmittedAt ?? now),
    );
    const questions = answerTimes(messagesOf.get(request.id) ?? []);
    return {
      request,
      returns,
      returnValues,
      questions,
      withSubsidiary: returnValues.reduce((sum, value) => sum + value, 0),
    };
  });
  const active = flows
    .filter((flow) => flow.returns.length > 0 || flow.questions.asked > 0)
    .sort(
      (a, b) =>
        b.withSubsidiary - a.withSubsidiary ||
        a.request.reference.localeCompare(b.request.reference),
    );
  const allReturns = flows.flatMap((flow) => flow.returnValues);
  const allAnswers = flows.flatMap((flow) => flow.questions.answered);

  return {
    generatedAt: now.toISOString(),
    tat: {
      requests: requestRows.length,
      decided: decided.length,
      averageDays: averageDays(decided.map((row) => row.value)),
      medianDays: medianDays(decided.map((row) => row.value)),
      open: open.length,
      openAverageDays: averageDays(open.map((row) => row.value)),
      longestOpen: longest,
      byCriterion,
      trend,
      criteria: codes,
      byEntity: byEntityTat,
      byRequest,
    },
    backAndForth: {
      returns: allReturns.length,
      openReturns: facts.returns.filter((item) => item.resubmittedAt === null).length,
      averageReturnDays: averageDays(allReturns),
      questions: flows.reduce((sum, flow) => sum + flow.questions.asked, 0),
      averageAnswerDays: averageDays(allAnswers),
      byEntity: [...groupBy(flows, (flow) => flow.request.entityCode)]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([entityCode, items]) => ({
          entityCode,
          requests: items.length,
          returns: items.reduce((sum, item) => sum + item.returns.length, 0),
          averageReturnDays: averageDays(items.flatMap((item) => item.returnValues)),
          questions: items.reduce((sum, item) => sum + item.questions.asked, 0),
          averageAnswerDays: averageDays(items.flatMap((item) => item.questions.answered)),
        })),
      byRequest: active.map((flow) => ({
        id: flow.request.id,
        reference: flow.request.reference,
        entityCode: flow.request.entityCode,
        status: flow.request.status,
        returns: flow.returns.length,
        openReturns: flow.returns.filter((item) => item.resubmittedAt === null).length,
        daysWithSubsidiary: days(flow.withSubsidiary),
        questions: flow.questions.asked,
        answers: flow.questions.answered.length,
        averageAnswerDays: averageDays(flow.questions.answered),
      })),
    },
  };
}
