import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  AddRequestLineSchema,
  CreateIncrementRequestSchema,
  DashboardFilterSchema,
  DecideLineSchema,
  ResubmitRequestSchema,
  ReviewQueueQuerySchema,
  type ReviewQueuePage,
  EmployeeSearchQuerySchema,
  ListIncrementRequestsQuerySchema,
  ListRequestLinesQuerySchema,
  SaveDraftSchema,
  SubmitRequestSchema,
  type Cycle,
  type DashboardSummary,
  type EmployeeOption,
  type IncrementRequest,
  type IncrementRequestPage,
  type RemoveLineResult,
  type RequestLinePage,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { Authenticated, RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import {
  DASHBOARD_SERVICE,
  INCREMENT_REQUEST_SERVICE,
  REVIEW_SERVICE,
} from '../../bootstrap/tokens.js';
import type { DashboardService } from './dashboard.service.js';
import type { IncrementRequestService } from './increment-request.service.js';
import type { ReviewService } from './review.service.js';

export const Id = z.uuid();
/** Client-generated, e.g. a UUID; unique per user. */
const IdempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);

/** The required Idempotency-Key header; a 400 names the header when it's missing or malformed. */
function idempotencyKeyOf(header: unknown): string {
  return z.object({ 'Idempotency-Key': IdempotencyKey }).parse({ 'Idempotency-Key': header })[
    'Idempotency-Key'
  ];
}

/**
 * Increment requests (R1-02). Reads need `increment_request:read` (subsidiary HR and Sirius
 * reviewers: the lines show salaries); changes need `increment_request:create`. Every input is
 * parsed with the shared contract; a ZodError becomes a 400 with field paths.
 */
@Controller(`${API_V1}/increment-requests`)
export class IncrementRequestsController {
  constructor(
    @Inject(INCREMENT_REQUEST_SERVICE) private readonly service: IncrementRequestService,
    @Inject(DASHBOARD_SERVICE) private readonly dashboard: DashboardService,
  ) {}

  /** "My increment requests", By request (R1-10): filtered by cycle, status and search. */
  @Get()
  @RequirePermission('increment_request:read')
  list(@Req() req: IncomingMessage, @Query() query: unknown): Promise<IncrementRequestPage> {
    return this.dashboard.requests(
      principal.require(req),
      ListIncrementRequestsQuerySchema.parse(query),
    );
  }

  /** The dashboard's KPI cards and tab counts. Declared before `:id`, which would match it. */
  @Get('summary')
  @RequirePermission('increment_request:read')
  summary(@Req() req: IncomingMessage, @Query() query: unknown): Promise<DashboardSummary> {
    return this.dashboard.summary(principal.require(req), DashboardFilterSchema.parse(query));
  }

  @Post()
  @RequirePermission('increment_request:create')
  create(
    @Req() req: IncomingMessage,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ): Promise<IncrementRequest> {
    // The header first: a missing key is reported before any body problem.
    const idempotencyKey = idempotencyKeyOf(key);
    return this.service.create(
      principal.require(req),
      CreateIncrementRequestSchema.parse(body),
      idempotencyKey,
    );
  }

  @Get(':id')
  @RequirePermission('increment_request:read')
  get(@Req() req: IncomingMessage, @Param('id') id: string): Promise<IncrementRequest> {
    return this.service.get(principal.require(req), Id.parse(id));
  }

  @Post(':id/lines')
  @RequirePermission('increment_request:create')
  addLine(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<IncrementRequest> {
    const { employeeId } = AddRequestLineSchema.parse(body);
    return this.service.addLine(principal.require(req), Id.parse(id), employeeId);
  }

  @Delete(':id/lines/:lineId')
  @HttpCode(200)
  @RequirePermission('increment_request:create')
  removeLine(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<RemoveLineResult> {
    return this.service.removeLine(principal.require(req), Id.parse(id), Id.parse(lineId));
  }

  @Put(':id/draft')
  @RequirePermission('increment_request:create')
  saveDraft(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<IncrementRequest> {
    return this.service.saveDraft(
      principal.require(req),
      Id.parse(id),
      SaveDraftSchema.parse(body),
    );
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('increment_request:submit')
  submit(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ): Promise<IncrementRequest> {
    const idempotencyKey = idempotencyKeyOf(key);
    return this.service.submit(
      principal.require(req),
      Id.parse(id),
      SubmitRequestSchema.parse(body),
      idempotencyKey,
    );
  }
}

/**
 * Sirius HR's review (R1-07 … R1-09): verifying criteria and deciding each employee need
 * `increment_request:review` and `…:decide` (reviewers only); resubmitting returned employees
 * needs `…:submit` (subsidiary HR, own subsidiary by Row-Level Security).
 */
@Controller(`${API_V1}/increment-requests`)
export class ReviewController {
  constructor(@Inject(REVIEW_SERVICE) private readonly review: ReviewService) {}

  @Put(':id/lines/:lineId/verifications/:criterionId')
  @RequirePermission('increment_request:review')
  verify(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Param('criterionId') criterionId: string,
  ): Promise<IncrementRequest> {
    return this.review.verify(
      principal.require(req),
      { requestId: Id.parse(id), lineId: Id.parse(lineId), criterionId: Id.parse(criterionId) },
      true,
    );
  }

  @Delete(':id/lines/:lineId/verifications/:criterionId')
  @HttpCode(200)
  @RequirePermission('increment_request:review')
  unverify(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Param('criterionId') criterionId: string,
  ): Promise<IncrementRequest> {
    return this.review.verify(
      principal.require(req),
      { requestId: Id.parse(id), lineId: Id.parse(lineId), criterionId: Id.parse(criterionId) },
      false,
    );
  }

  @Post(':id/lines/:lineId/decision')
  @HttpCode(200)
  @RequirePermission('increment_request:decide')
  decide(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ): Promise<IncrementRequest> {
    const idempotencyKey = idempotencyKeyOf(key);
    return this.review.decide(
      principal.require(req),
      { requestId: Id.parse(id), lineId: Id.parse(lineId) },
      DecideLineSchema.parse(body),
      idempotencyKey,
    );
  }

  @Post(':id/resubmit')
  @HttpCode(200)
  @RequirePermission('increment_request:submit')
  resubmit(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ): Promise<IncrementRequest> {
    const idempotencyKey = idempotencyKeyOf(key);
    return this.review.resubmit(
      principal.require(req),
      Id.parse(id),
      ResubmitRequestSchema.parse(body),
      idempotencyKey,
    );
  }
}

/** Sirius HR's Review queue (R1-07): employees to review across subsidiaries, no salaries. */
@Controller(`${API_V1}/review-queue`)
export class ReviewQueueController {
  constructor(@Inject(REVIEW_SERVICE) private readonly review: ReviewService) {}

  @Get()
  @RequirePermission('increment_request:review')
  list(@Req() req: IncomingMessage, @Query() query: unknown): Promise<ReviewQueuePage> {
    return this.review.queue(principal.require(req), ReviewQueueQuerySchema.parse(query));
  }
}

/** "My increment requests", By employee (R1-10): no salaries, the proposed percentage only. */
@Controller(`${API_V1}/increment-request-lines`)
export class IncrementRequestLinesController {
  constructor(@Inject(DASHBOARD_SERVICE) private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission('increment_request:read')
  list(@Req() req: IncomingMessage, @Query() query: unknown): Promise<RequestLinePage> {
    return this.dashboard.lines(principal.require(req), ListRequestLinesQuerySchema.parse(query));
  }
}

/** Increment cycles open for requests (configuration; no personal data). */
@Controller(`${API_V1}/increment-cycles`)
export class IncrementCyclesController {
  constructor(
    @Inject(INCREMENT_REQUEST_SERVICE) private readonly service: IncrementRequestService,
  ) {}

  @Get('open')
  @Authenticated()
  open(@Req() req: IncomingMessage): Promise<Cycle[]> {
    return this.service.openCycles(principal.require(req));
  }
}

/** The employee picker of a new request: name, number and grade only (no salary). */
@Controller(`${API_V1}/employees`)
export class EmployeesController {
  constructor(
    @Inject(INCREMENT_REQUEST_SERVICE) private readonly service: IncrementRequestService,
  ) {}

  @Get()
  @RequirePermission('increment_request:create')
  search(@Req() req: IncomingMessage, @Query() query: unknown): Promise<EmployeeOption[]> {
    return this.service.searchEmployees(
      principal.require(req),
      EmployeeSearchQuerySchema.parse(query),
    );
  }
}
