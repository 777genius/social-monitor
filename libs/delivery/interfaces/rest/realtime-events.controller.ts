import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import type { ListRealtimeEventsResponseDto } from './realtime-events.dto';

@ApiTags('realtime')
@Controller('realtime/events')
export class RealtimeEventsController {
  constructor(
    private readonly listRealtimeEvents: ListRealtimeEventsUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Replay tenant/workspace realtime events for REST resync.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Realtime event reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'channel', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Query('channel') channel: string,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListRealtimeEventsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'realtime_events.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.listRealtimeEvents.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      channel,
      limit: parseLimit(limitQuery),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number.NaN;
};
