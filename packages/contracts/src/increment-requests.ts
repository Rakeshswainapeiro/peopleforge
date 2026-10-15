import { z } from 'zod';
import { EntitySummarySchema, LocalisedTextSchema } from './me.js';

/**
 * Increment request contract (R1-02), validated by the API on input and by the web app on
 * output. Money and percentages travel as decimal strings, never JSON numbers, so no value is
 * ever rounded by floating point on the way.
 */

/** Up to 9 integer digits and 2 decimals, e.g. "8", "8.5", "1720.00". */
export const DecimalString = z
  .string()
  .max(12)
  // eslint-disable-next-line security/detect-unsafe-regex -- every quantifier is bounded (≤ 12 chars): no backtracking blow-up
  .regex(/^\d{1,9}(\.\d{1,2})?$/u, 'decimal');

export const ProposedKindSchema = z.enum(['percent', 'amount']);
export type ProposedKind = z.infer<typeof ProposedKindSchema>;

/** More statuses arrive with review and decisions (S5). */
export const RequestStatusSchema = z.enum(['draft', 'submitted']);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

/** Most employees one request can hold; keeps payloads and screens bounded (ADR-004 to confirm). */
export const MAX_LINES_PER_REQUEST = 200;

/** Longest justification per criterion (S3 assumption, confirm with Sirius HR). */
export const MAX_JUSTIFICATION_LENGTH = 2000;

/** Most live evidence files per employee and criterion (S3 assumption, confirm with Sirius HR). */
export const MAX_EVIDENCE_PER_CRITERION = 5;

/**
 * Largest evidence file the API accepts, whatever a criterion allows (its limit can only be
 * lower). Raising it means raising the API and web body limits too (DEPLOYMENT.md).
 */
export const MAX_EVIDENCE_FILE_MB = 10;

export const CriterionResultSchema = z.enum(['pass', 'fail']);
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const EvidencePolicySchema = z.enum(['required', 'optional', 'none']);
export type EvidencePolicy = z.infer<typeof EvidencePolicySchema>;

/** What still stops a criterion counting as complete for an employee (R1-06). */
export const CriterionMissingSchema = z.enum(['result', 'justification', 'evidence']);
export type CriterionMissing = z.infer<typeof CriterionMissingSchema>;

// Inputs -----------------------------------------------------------------------------------

export const CreateIncrementRequestSchema = z.strictObject({
  cycleId: z.uuid(),
  /** Required only when the caller acts for more than one subsidiary. */
  entityId: z.uuid().optional(),
  /** At least one: a draft starts with its first employee (an empty draft is not a request). */
  employeeIds: z.array(z.uuid()).min(1).max(MAX_LINES_PER_REQUEST),
});
export type CreateIncrementRequest = z.infer<typeof CreateIncrementRequestSchema>;

export const AddRequestLineSchema = z.strictObject({ employeeId: z.uuid() });

export const ProposalInputSchema = z
  .strictObject({
    lineId: z.uuid(),
    kind: ProposedKindSchema.nullable(),
    value: DecimalString.nullable(),
  })
  .refine((proposal) => (proposal.kind === null) === (proposal.value === null), {
    message: 'kind_and_value_together',
    path: ['value'],
  });

export const CriterionInputSchema = z.strictObject({
  criterionId: z.uuid(),
  /** Null: not decided yet. */
  result: CriterionResultSchema.nullable(),
  /** Empty clears it. NFC-normalised, so Arabic text compares and counts consistently. */
  justification: z
    .string()
    .transform((text) => text.normalize('NFC'))
    .pipe(z.string().max(MAX_JUSTIFICATION_LENGTH)),
});
export type CriterionInput = z.infer<typeof CriterionInputSchema>;

/** PUT …/{id}/draft: proposals for any employees, plus one employee's criteria (R1-02, R1-03). */
export const SaveDraftSchema = z.strictObject({
  /** The version the client last read; a stale one is refused (optimistic locking). */
  version: z.number().int().min(1),
  proposals: z.array(ProposalInputSchema).max(MAX_LINES_PER_REQUEST),
  assessment: z
    .strictObject({
      lineId: z.uuid(),
      results: z
        .array(CriterionInputSchema)
        .max(10)
        .refine(
          (results) => new Set(results.map((r) => r.criterionId)).size === results.length,
          'duplicate_criterion',
        ),
    })
    .optional(),
});
export type SaveDraft = z.infer<typeof SaveDraftSchema>;

/** POST …/{id}/submit (with an Idempotency-Key header): the version the user last saw (R1-07). */
export const SubmitRequestSchema = z.strictObject({ version: z.number().int().min(1) });
export type SubmitRequest = z.infer<typeof SubmitRequestSchema>;

/** The text fields of POST …/{id}/evidence (multipart/form-data, beside the `file` part). */
export const EvidenceUploadSchema = z.strictObject({
  lineId: z.uuid(),
  criterionId: z.uuid(),
});
export type EvidenceUpload = z.infer<typeof EvidenceUploadSchema>;

export const PAGE_SIZES = [10, 25, 50] as const;

/** Longest dashboard search (employee name or ID, or request reference). */
export const MAX_SEARCH_LENGTH = 100;

/**
 * Dashboard search text: trimmed and NFC-normalised (so Arabic and accented names match however
 * they were typed); an empty box means no search.
 */
export const SearchTextSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .max(MAX_SEARCH_LENGTH)
    .transform((text) => text.normalize('NFC'))
    .optional(),
);

/** The filters of "My increment requests" (R1-10), shared by its counts, requests and employees. */
export const DashboardFilterSchema = z.strictObject({
  /** Increment cycle (the Figma's "Period"). */
  cycleId: z.uuid().optional(),
  status: RequestStatusSchema.optional(),
  search: SearchTextSchema,
});
export type DashboardFilter = z.infer<typeof DashboardFilterSchema>;

const pageQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), 'page_size')
    .default(10),
};

export const ListIncrementRequestsQuerySchema = DashboardFilterSchema.extend(pageQuery);
export type ListIncrementRequestsQuery = z.infer<typeof ListIncrementRequestsQuerySchema>;

/** GET /increment-request-lines: the dashboard's "By employee" tab. */
export const ListRequestLinesQuerySchema = DashboardFilterSchema.extend({
  ...pageQuery,
  /** Only this request's employees (the "View" next to a request's employee count). */
  requestId: z.uuid().optional(),
});
export type ListRequestLinesQuery = z.infer<typeof ListRequestLinesQuerySchema>;

export const EmployeeSearchQuerySchema = z.strictObject({
  entityId: z.uuid(),
  search: z.string().trim().max(100).optional(),
  excludeRequestId: z.uuid().optional(),
});

// Outputs ----------------------------------------------------------------------------------

export const CycleSchema = z.object({
  id: z.uuid(),
  name: LocalisedTextSchema,
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  submissionDeadline: z.iso.date().nullable(),
  status: z.enum(['planned', 'open', 'closed']),
});
export type Cycle = z.infer<typeof CycleSchema>;

export const EmployeeOptionSchema = z.object({
  id: z.uuid(),
  employeeNumber: z.string(),
  fullName: z.string(),
  grade: z.string(),
});
export type EmployeeOption = z.infer<typeof EmployeeOptionSchema>;

export const CriterionSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: LocalisedTextSchema,
  description: LocalisedTextSchema,
  justificationRequired: z.boolean(),
  evidencePolicy: EvidencePolicySchema,
  /** Media types accepted as evidence, checked against the file's content. */
  allowedMediaTypes: z.array(z.string()),
  /** Effective per-file limit: the criterion's, capped at MAX_EVIDENCE_FILE_MB. */
  maxFileMb: z.number().int().min(1),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const EvidenceFileSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int().min(1),
  createdAt: z.iso.datetime(),
});
export type EvidenceFile = z.infer<typeof EvidenceFileSchema>;

export const CriterionAssessmentSchema = z.object({
  criterionId: z.uuid(),
  result: CriterionResultSchema.nullable(),
  justification: z.string(),
  evidence: z.array(EvidenceFileSchema),
  /** Empty when the criterion is complete for this employee (R1-06). */
  missing: z.array(CriterionMissingSchema),
});
export type CriterionAssessment = z.infer<typeof CriterionAssessmentSchema>;

export const RequestLineSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  employeeNumber: z.string(),
  fullName: z.string(),
  grade: z.string(),
  currency: z.string().length(3),
  /** Monthly salary when the employee was added. */
  currentSalary: DecimalString,
  proposedKind: ProposedKindSchema.nullable(),
  proposedValue: DecimalString.nullable(),
  /** Derived by the API: monthly increase, new monthly salary and increase as a percentage. */
  increase: DecimalString.nullable(),
  newSalary: DecimalString.nullable(),
  percent: DecimalString.nullable(),
  /** One per criterion of the request, in the same order as `criteria`. */
  criteria: z.array(CriterionAssessmentSchema),
});
export type RequestLine = z.infer<typeof RequestLineSchema>;

export const RequestTotalsSchema = z.object({
  employees: z.number().int().min(0),
  /** Employees with a proposal. */
  proposed: z.number().int().min(0),
  /** Employees with a proposal and every criterion complete: ready to submit. */
  ready: z.number().int().min(0),
  /** Monthly increase summed per currency (subsidiaries may pay in different currencies). */
  increaseByCurrency: z.array(z.object({ currency: z.string().length(3), amount: DecimalString })),
  /** Mean of the employees' increase percentages, 1 decimal; null without proposals. */
  averagePercent: DecimalString.nullable(),
});
export type RequestTotals = z.infer<typeof RequestTotalsSchema>;

export const IncrementRequestSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: RequestStatusSchema,
  entity: EntitySummarySchema,
  cycle: CycleSchema.pick({ id: true, name: true, submissionDeadline: true }),
  /** The eligibility criteria this request is assessed against (pinned at creation, R1-05). */
  criteria: z.array(CriterionSchema),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** When it went to Sirius HR; null while a draft. */
  submittedAt: z.iso.datetime().nullable(),
  lines: z.array(RequestLineSchema),
  totals: RequestTotalsSchema,
});
export type IncrementRequest = z.infer<typeof IncrementRequestSchema>;

/**
 * Where a request stands in Sirius HR's review (R1-10, "Review stage"). S4b: a draft is not
 * submitted; a submitted request waits at the first criterion. Per-criterion review and the
 * decision stage arrive with S5 (Q7: does Sirius HR verify criteria in order?).
 */
export const RequestStageSchema = z.discriminatedUnion('kind', [
  // `of`: the request's criteria count, so the stage bar has the same length either way.
  z.object({ kind: z.literal('not_submitted'), of: z.number().int().min(1) }),
  z.object({
    kind: z.literal('criterion'),
    criterion: z.number().int().min(1),
    of: z.number().int().min(1),
  }),
]);
export type RequestStage = z.infer<typeof RequestStageSchema>;

export const IncrementRequestSummarySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: RequestStatusSchema,
  entity: z.object({ id: z.uuid(), code: z.string() }),
  cycleId: z.uuid(),
  employeeCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  /** The last status change: the dashboard's Age (Q6 default: calendar days since then). */
  statusChangedAt: z.iso.datetime(),
  stage: RequestStageSchema,
  /** Criteria complete across all employees, e.g. 15 of 20 (Figma "Needs your action"). */
  criteria: z.object({ complete: z.number().int().min(0), total: z.number().int().min(0) }),
});
export type IncrementRequestSummary = z.infer<typeof IncrementRequestSummarySchema>;

export const IncrementRequestPageSchema = z.object({
  items: z.array(IncrementRequestSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type IncrementRequestPage = z.infer<typeof IncrementRequestPageSchema>;

/** GET /increment-requests/summary: the KPI cards and tab counts of the dashboard. */
export const DashboardSummarySchema = z.object({
  /** Requests per status in the cycle (zero for none); ignores the status and search filters. */
  byStatus: z.record(RequestStatusSchema, z.number().int().min(0)),
  /** Requests and employees matching every filter. */
  requests: z.number().int().min(0),
  employees: z.number().int().min(0),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

/** A criterion as the lists show it: ✓ pass, ✗ fail (both complete), ○ not complete yet. */
export const CriterionMarkSchema = z.enum(['pass', 'fail', 'pending']);
export type CriterionMark = z.infer<typeof CriterionMarkSchema>;

/**
 * One employee in the "By employee" tab. No salary: lists show the proposed percentage only
 * (data minimisation); the employee's status page shows the money.
 */
export const RequestLineSummarySchema = z.object({
  id: z.uuid(),
  request: z.object({
    id: z.uuid(),
    reference: z.string(),
    status: RequestStatusSchema,
    entityCode: z.string(),
  }),
  employeeNumber: z.string(),
  fullName: z.string(),
  grade: z.string(),
  /** The increase as a percentage of the current salary (2 decimals); null until proposed. */
  proposedPercent: DecimalString.nullable(),
  criteria: z.array(
    z.object({ criterionId: z.uuid(), code: z.string(), mark: CriterionMarkSchema }),
  ),
  /** The employee's status: the request's until per-employee decisions arrive (S5). */
  status: RequestStatusSchema,
  updatedAt: z.iso.datetime(),
});
export type RequestLineSummary = z.infer<typeof RequestLineSummarySchema>;

export const RequestLinePageSchema = z.object({
  items: z.array(RequestLineSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type RequestLinePage = z.infer<typeof RequestLinePageSchema>;

/**
 * DELETE …/lines/{lineId}. Removing the last employee discards the draft: `discarded` is true
 * and `request` is null.
 */
export const RemoveLineResultSchema = z.object({
  discarded: z.boolean(),
  request: IncrementRequestSchema.nullable(),
});
export type RemoveLineResult = z.infer<typeof RemoveLineResultSchema>;
