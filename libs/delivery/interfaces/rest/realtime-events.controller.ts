import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';
import type { ListRealtimeEventsResponseDto } from './realtime-events.dto';

@ApiTags('realtime')
@Controller('realtime/events')
export class RealtimeEventsController {
  constructor(
    private readonly listRealtimeEvents: ListRealtimeEventsUseCase,
    private readonly deliveryReadAuthorizer: DeliveryReadAuthorizer,
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
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('channel') channel: string,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListRealtimeEventsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      action: 'realtime_events.read',
      operation: 'realtime_events.read',
    });

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
