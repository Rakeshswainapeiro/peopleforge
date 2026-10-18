import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import {
  PublishCriteriaSchema,
  ReminderKindSchema,
  UpdateReminderRuleSchema,
  type CriteriaSettings,
  type ReminderRule,
} from '@peopleforge/contracts';
import type { IncomingMessage } from 'node:http';
import { RequirePermission } from '../../auth/policy.js';
import { principal } from '../../auth/principal.js';
import { API_V1 } from '../../bootstrap/routes.js';
import { SETTINGS_SERVICE } from '../../bootstrap/tokens.js';
import type { SettingsService } from './settings.service.js';

/** The increment portal's settings (R1-05, R1-13): admins with `criteria:configure`. */
@Controller(`${API_V1}/settings`)
export class SettingsController {
  constructor(@Inject(SETTINGS_SERVICE) private readonly service: SettingsService) {}

  @Get('reminders')
  @RequirePermission('criteria:configure')
  reminders(@Req() req: IncomingMessage): Promise<ReminderRule[]> {
    return this.service.reminderRules(principal.require(req));
  }

  @Put('reminders/:kind')
  @RequirePermission('criteria:configure')
  updateReminder(
    @Req() req: IncomingMessage,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ): Promise<ReminderRule> {
    return this.service.updateReminderRule(
      principal.require(req),
      ReminderKindSchema.parse(kind),
      UpdateReminderRuleSchema.parse(body),
    );
  }

  @Get('criteria')
  @RequirePermission('criteria:configure')
  criteria(@Req() req: IncomingMessage): Promise<CriteriaSettings> {
    return this.service.criteria(principal.require(req));
  }

  @Put('criteria')
  @RequirePermission('criteria:configure')
  publish(@Req() req: IncomingMessage, @Body() body: unknown): Promise<CriteriaSettings> {
    return this.service.publishCriteria(principal.require(req), PublishCriteriaSchema.parse(body));
  }
}
