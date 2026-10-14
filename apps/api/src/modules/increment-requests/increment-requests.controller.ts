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
  EmployeeSearchQuerySchema,
  ListIncrementRequestsQuerySchema,
  SetProposalsSchema,
  type Cycle,
  type EmployeeOption,
  type IncrementRequest,
  type IncrementRequestPage,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { Authenticated, RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { INCREMENT_REQUEST_SERVICE } from '../../bootstrap/tokens.js';
import type { IncrementRequestService } from './increment-request.service.js';

const Id = z.uuid();
/** Client-generated, e.g. a UUID; unique per user. */
const IdempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);

/**
 * Increment requests (R1-02). Reads need `increment_request:read` (subsidiary HR and Sirius
 * reviewers: the lines show salaries); changes need `increment_request:create`. Every input is
 * parsed with the shared contract; a ZodError becomes a 400 with field paths.
 */
@Controller(`${API_V1}/increment-requests`)
export class IncrementRequestsController {
  constructor(
    @Inject(INCREMENT_REQUEST_SERVICE) private readonly service: IncrementRequestService,
  ) {}

  @Get()
  @RequirePermission('increment_request:read')
  list(@Req() req: IncomingMessage, @Query() query: unknown): Promise<IncrementRequestPage> {
    return this.service.list(principal.require(req), ListIncrementRequestsQuerySchema.parse(query));
  }

  @Post()
  @RequirePermission('increment_request:create')
  create(
    @Req() req: IncomingMessage,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ): Promise<IncrementRequest> {
    const idempotencyKey = z
      .object({ 'Idempotency-Key': IdempotencyKey })
      .parse({ 'Idempotency-Key': key });
    return this.service.create(
      principal.require(req),
      CreateIncrementRequestSchema.parse(body),
      idempotencyKey['Idempotency-Key'],
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
  ): Promise<IncrementRequest> {
    return this.service.removeLine(principal.require(req), Id.parse(id), Id.parse(lineId));
  }

  @Put(':id/proposals')
  @RequirePermission('increment_request:create')
  setProposals(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<IncrementRequest> {
    return this.service.setProposals(
      principal.require(req),
      Id.parse(id),
      SetProposalsSchema.parse(body),
    );
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
