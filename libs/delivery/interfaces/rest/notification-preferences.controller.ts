import { Body, Controller, Get, Headers, Inject, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAction,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from '../../domain';
import { GetNotificationPreferenceUseCase } from '../../features/get-notification-preference/get-notification-preference.use-case';
import { SetNotificationPreferenceUseCase } from '../../features/set-notification-preference/set-notification-preference.use-case';
import {
  type GetNotificationPreferenceResponseDto,
  SetNotificationPreferenceRequestDto,
  type SetNotificationPreferenceResponseDto,
} from './notification-preferences.dto';

@ApiTags('delivery')
@Controller('delivery/notification-preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly setNotificationPreference: SetNotificationPreferenceUseCase,
    private readonly getNotificationPreference: GetNotificationPreferenceUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Put()
  @ApiOperation({ summary: 'Set recipient/channel notification delivery preference.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Preference writes allow owner, admin or member.',
  })
  async set(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Body() body: SetNotificationPreferenceRequestDto,
  ): Promise<SetNotificationPreferenceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.authorizeWorkspaceRole({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      action: 'notification_preferences.write',
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
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Preference reads allow owner, admin, member or viewer.',
  })
  async get(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Query('recipientKey') recipientKey: string | undefined,
    @Query('channel') channel: string | undefined,
  ): Promise<GetNotificationPreferenceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.authorizeWorkspaceRole({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      action: 'notification_preferences.read',
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

  private authorizeWorkspaceRole(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly workspaceRoleHeader: string | undefined;
    readonly action: WorkspaceAction;
  }): void {
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      action: params.action,
      roles: parseWorkspaceRolesHeader(params.workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
