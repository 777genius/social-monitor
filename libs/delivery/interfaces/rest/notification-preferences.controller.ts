import { Body, Controller, Get, Headers, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from '../../domain';
import { GetNotificationPreferenceUseCase } from '../../features/get-notification-preference/get-notification-preference.use-case';
import { SetNotificationPreferenceUseCase } from '../../features/set-notification-preference/set-notification-preference.use-case';
import {
  type GetNotificationPreferenceResponseDto,
  SetNotificationPreferenceRequestDto,
  type SetNotificationPreferenceResponseDto,
} from './notification-preferences.dto';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';

@ApiTags('delivery')
@Controller('delivery/notification-preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly setNotificationPreference: SetNotificationPreferenceUseCase,
    private readonly getNotificationPreference: GetNotificationPreferenceUseCase,
    private readonly deliveryReadAuthorizer: DeliveryReadAuthorizer,
  ) {}

  @Put()
  @ApiOperation({ summary: 'Set recipient/channel notification delivery preference.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Preference writes allow owner, admin or member.',
  })
  async set(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: SetNotificationPreferenceRequestDto,
  ): Promise<SetNotificationPreferenceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      requiredScope: 'write:delivery_status',
      action: 'notification_preferences.write',
      operation: 'notification_preferences.write',
    });

    const result = await this.setNotificationPreference.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      recipientKey: body.recipientKey,
      channel: body.channel,
      allowed: body.allowed,
      reason: body.reason,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'Get recipient/channel notification delivery preference.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Preference reads allow owner, admin, member or viewer.',
  })
  async get(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('recipientKey') recipientKey: string | undefined,
    @Query('channel') channel: string | undefined,
  ): Promise<GetNotificationPreferenceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      action: 'notification_preferences.read',
      operation: 'notification_preferences.read',
    });

    const result = await this.getNotificationPreference.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      recipientKey: recipientKey ?? '',
      channel: (channel ?? '') as DeliveryChannel,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
