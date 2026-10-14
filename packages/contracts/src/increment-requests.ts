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

export const RequestStatusSchema = z.enum(['draft']);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

/** Most employees one request can hold; keeps payloads and screens bounded (ADR-004 to confirm). */
export const MAX_LINES_PER_REQUEST = 200;

// Inputs -----------------------------------------------------------------------------------

export const CreateIncrementRequestSchema = z.strictObject({
  cycleId: z.uuid(),
  /** Required only when the caller acts for more than one subsidiary. */
  entityId: z.uuid().optional(),
  employeeIds: z.array(z.uuid()).max(MAX_LINES_PER_REQUEST).default([]),
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

export const SetProposalsSchema = z.strictObject({
  /** The version the client last read; a stale one is refused (optimistic locking). */
  version: z.number().int().min(1),
  proposals: z.array(ProposalInputSchema).max(MAX_LINES_PER_REQUEST),
});
export type SetProposals = z.infer<typeof SetProposalsSchema>;

export const PAGE_SIZES = [10, 25, 50] as const;

export const ListIncrementRequestsQuerySchema = z.strictObject({
  status: RequestStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), 'page_size')
    .default(10),
});

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
});
export type RequestLine = z.infer<typeof RequestLineSchema>;

export const RequestTotalsSchema = z.object({
  employees: z.number().int().min(0),
  /** Employees with a proposal. */
  proposed: z.number().int().min(0),
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
  cycle: CycleSchema.pick({ id: true, name: true }),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lines: z.array(RequestLineSchema),
  totals: RequestTotalsSchema,
});
export type IncrementRequest = z.infer<typeof IncrementRequestSchema>;

export const IncrementRequestSummarySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: RequestStatusSchema,
  entityId: z.uuid(),
  cycleId: z.uuid(),
  employeeCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type IncrementRequestSummary = z.infer<typeof IncrementRequestSummarySchema>;

export const IncrementRequestPageSchema = z.object({
  items: z.array(IncrementRequestSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});
export type IncrementRequestPage = z.infer<typeof IncrementRequestPageSchema>;
