import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ConversationQuerySchema,
  PostMessageSchema,
  type ConversationPage,
  type Message,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { CONVERSATION_SERVICE } from '../../bootstrap/tokens.js';
import { Id, idempotencyKeyOf } from '../increment-requests/increment-requests.controller.js';
import type { ConversationService } from './conversation.service.js';

/**
 * Questions and answers per employee (R1-08). Reading needs `increment_request:read`; posting is
 * checked by side in the service (Sirius HR reviewers ask, the subsidiary's HR answers).
 */
@Controller(`${API_V1}/increment-requests`)
export class MessagesController {
  constructor(@Inject(CONVERSATION_SERVICE) private readonly service: ConversationService) {}

  @Get(':id/lines/:lineId/messages')
  @RequirePermission('increment_request:read')
  list(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<Message[]> {
    return this.service.thread(principal.require(req), Id.parse(id), Id.parse(lineId));
  }

  @Post(':id/lines/:lineId/messages')
  @HttpCode(200)
  @RequirePermission('increment_request:read')
  post(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ): Promise<Message[]> {
    const idempotencyKey = idempotencyKeyOf(key);
    return this.service.post(
      principal.require(req),
      { requestId: Id.parse(id), lineId: Id.parse(lineId) },
      PostMessageSchema.parse(body).body,
      idempotencyKey,
    );
  }
}

/** The Conversations page: every thread the caller can see, waiting-for-me first filter. */
@Controller(`${API_V1}/conversations`)
export class ConversationsController {
  constructor(@Inject(CONVERSATION_SERVICE) private readonly service: ConversationService) {}

  @Get()
  @RequirePermission('increment_request:read')
  list(@Req() req: IncomingMessage, @Query() query: unknown): Promise<ConversationPage> {
    return this.service.threads(principal.require(req), ConversationQuerySchema.parse(query));
  }
}
