import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import {
  MarkNotificationsReadSchema,
  NotificationQuerySchema,
  type NotificationPage,
  type NotificationSummary,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { Authenticated } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { NOTIFICATION_SERVICE } from '../../bootstrap/tokens.js';
import type { NotificationService } from './notification.service.js';

/** The caller's own notifications: any signed-in user, scoped by the data layer (R1-07). */
@Controller(`${API_V1}/notifications`)
export class NotificationsController {
  constructor(@Inject(NOTIFICATION_SERVICE) private readonly service: NotificationService) {}

  @Get()
  @Authenticated()
  list(@Req() req: IncomingMessage, @Query() query: unknown): Promise<NotificationPage> {
    return this.service.list(principal.require(req), NotificationQuerySchema.parse(query));
  }

  /** Unread count for the sidebar bell. */
  @Get('summary')
  @Authenticated()
  summary(@Req() req: IncomingMessage): Promise<NotificationSummary> {
    return this.service.summary(principal.require(req));
  }

  @Post('read')
  @HttpCode(204)
  @Authenticated()
  async markRead(@Req() req: IncomingMessage, @Body() body: unknown): Promise<void> {
    await this.service.markRead(principal.require(req), MarkNotificationsReadSchema.parse(body));
  }
}
